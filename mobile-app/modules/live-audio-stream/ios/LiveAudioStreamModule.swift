import ExpoModulesCore
import AVFoundation

public class LiveAudioStreamModule: Module {
  private var audioEngine: AVAudioEngine?
  private var isStreaming = false

  // ── Media player nodes ──────────────────────────────────────────────────────
  private var playerNode: AVAudioPlayerNode?
  private var mediaGainNode: AVAudioMixerNode?
  private var micGainNode: AVAudioMixerNode?

  // ── Monitor ─────────────────────────────────────────────────────────────────
  // Monitor lets the DJ hear the mixed output through speakers/headphones.
  // monitorGain connects mainMixerNode → outputNode.  Default gain = 0 (off).
  // Changing monitorGain does NOT affect the stream — the tap is on
  // mainMixerNode BEFORE the monitor path.
  private var monitorGainNode: AVAudioMixerNode?
  private var monitorEnabled = false

  // ── Audio converter (for tap) ───────────────────────────────────────────────
  private var audioConverter: AVAudioConverter?
  private var targetFormat: AVAudioFormat?

  // ── Current file tracking ───────────────────────────────────────────────────
  private var currentAudioFile: AVAudioFile?
  private var isFilePlaying = false
  private var isLooping = false

  public func definition() -> ModuleDefinition {
    Name("LiveAudioStream")

    Events("onAudioData", "onFileComplete")

    // ── Start: set up full mixer graph ───────────────────────────────────────
    Function("start") { (options: [String: Any]) in
      let sampleRate = options["sampleRate"] as? Double ?? 44100.0
      let channelCount = options["channelCount"] as? Int ?? 1

      guard !self.isStreaming else { return }

      // Configure audio session
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
      try session.setActive(true)

      let engine = AVAudioEngine()

      // ── Create nodes ────────────────────────────────────────────────────
      let player = AVAudioPlayerNode()
      let micGain = AVAudioMixerNode()
      let mediaGain = AVAudioMixerNode()
      let monGain = AVAudioMixerNode()

      engine.attach(player)
      engine.attach(micGain)
      engine.attach(mediaGain)
      engine.attach(monGain)

      // ── Wire the graph ──────────────────────────────────────────────────
      //
      //   inputNode → micGain ──→ mainMixerNode ──→ installTap (stream)
      //   playerNode → mediaGain → mainMixerNode
      //                            mainMixerNode ──→ monitorGain → outputNode (speakers)
      //
      let inputNode = engine.inputNode
      let mainMixer = engine.mainMixerNode

      // Mic path: inputNode → micGain → mainMixer
      let inputFormat = inputNode.outputFormat(forBus: 0)
      engine.connect(inputNode, to: micGain, format: inputFormat)
      engine.connect(micGain, to: mainMixer, format: inputFormat)

      // Media path: playerNode → mediaGain → mainMixer
      // Use a standard format for the player (will be set per-file when playing)
      let playerFormat = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: AVAudioChannelCount(channelCount))!
      engine.connect(player, to: mediaGain, format: playerFormat)
      engine.connect(mediaGain, to: mainMixer, format: playerFormat)

      // Monitor path: mainMixer → monitorGain → outputNode
      // AVAudioEngine auto-connects mainMixer→outputNode. We disconnect that
      // and reroute through monitorGainNode so we can control DJ ear volume
      // WITHOUT affecting the tap (which captures from mainMixer).
      let mixerOutputFormat = mainMixer.outputFormat(forBus: 0)
      engine.disconnectNodeOutput(mainMixer)
      engine.connect(mainMixer, to: monGain, format: mixerOutputFormat)
      engine.connect(monGain, to: engine.outputNode, format: mixerOutputFormat)
      monGain.outputVolume = 0.0  // Monitor OFF by default — DJ hears nothing until toggled

      // ── Target format for the tap ───────────────────────────────────────
      guard let tapTargetFormat = AVAudioFormat(
        commonFormat: .pcmFormatInt16,
        sampleRate: sampleRate,
        channels: AVAudioChannelCount(channelCount),
        interleaved: true
      ) else {
        throw NSError(domain: "LiveAudioStream", code: 1, userInfo: [NSLocalizedDescriptionKey: "Cannot create target audio format"])
      }

      // Initial converter
      let tapSourceFormat = mainMixer.outputFormat(forBus: 0)
      self.audioConverter = AVAudioConverter(from: tapSourceFormat, to: tapTargetFormat)
      self.targetFormat = tapTargetFormat

      // ── Install tap on mainMixer — captures mic + media mixed ───────────
      let bufferFrames = AVAudioFrameCount(sampleRate * 0.1)  // ~100ms

      // Use nil format — tap delivers in mixer's CURRENT output format,
      // adapting automatically when the format changes (e.g., mic opens)
      mainMixer.installTap(onBus: 0, bufferSize: bufferFrames, format: nil) { [weak self] (buffer, _) in
        guard let self = self, self.isStreaming else { return }

        // Recreate converter if buffer format changed (e.g., mic opened/closed)
        let bufferFormat = buffer.format
        if self.audioConverter == nil || self.audioConverter!.inputFormat != bufferFormat {
          self.audioConverter = AVAudioConverter(from: bufferFormat, to: tapTargetFormat)
        }
        guard let converter = self.audioConverter else { return }

        guard let outputBuffer = AVAudioPCMBuffer(pcmFormat: tapTargetFormat, frameCapacity: bufferFrames) else { return }

        var error: NSError?
        let status = converter.convert(to: outputBuffer, error: &error) { inNumPackets, outStatus in
          outStatus.pointee = .haveData
          return buffer
        }

        guard status != .error, error == nil else { return }

        let frameLength = Int(outputBuffer.frameLength)
        let bytesPerFrame = Int(tapTargetFormat.streamDescription.pointee.mBytesPerFrame)
        let byteCount = frameLength * bytesPerFrame

        guard byteCount > 0, let channelData = outputBuffer.int16ChannelData else { return }

        let data = Data(bytes: channelData[0], count: byteCount)
        let base64 = data.base64EncodedString()

        self.sendEvent("onAudioData", [
          "data": base64,
          "size": byteCount
        ])
      }

      // ── Start engine ────────────────────────────────────────────────────
      engine.prepare()
      try engine.start()

      // Store refs
      self.audioEngine = engine
      self.playerNode = player
      self.micGainNode = micGain
      self.mediaGainNode = mediaGain
      self.monitorGainNode = monGain
      self.isStreaming = true
    }

    // ── Stop ──────────────────────────────────────────────────────────────────
    Function("stop") {
      self.stopEngine()
    }

    // ── Check streaming state ─────────────────────────────────────────────────
    Function("isStreaming") { () -> Bool in
      return self.isStreaming
    }

    // ── Play a media file ─────────────────────────────────────────────────────
    Function("playFile") { (urlString: String, loop: Bool) in
      guard let engine = self.audioEngine, let player = self.playerNode else { return }

      // Stop current playback if any
      if self.isFilePlaying {
        player.stop()
      }

      // Resolve file URL — handle Arabic/Unicode filenames
      var fileURL: URL?
      // 1. Try as-is (works for already-encoded file:// URIs)
      fileURL = URL(string: urlString)
      // 2. Try percent-encoding for Arabic/Unicode characters
      if fileURL == nil, let encoded = urlString.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) {
        fileURL = URL(string: encoded)
      }
      // 3. Try as a raw file path (handles /path/to/أغنية.mp3)
      if fileURL == nil || !FileManager.default.fileExists(atPath: fileURL!.path) {
        fileURL = self.resolveFileURL(urlString)
      }
      guard let resolvedURL = fileURL else {
        print("[LiveAudioStream] ❌ Cannot resolve file URL: \(urlString)")
        throw NSError(domain: "LiveAudioStream", code: 3, userInfo: [NSLocalizedDescriptionKey: "Invalid file URL: \(urlString)"])
      }
      print("[LiveAudioStream] ▶️ Playing file: \(resolvedURL.path)")

      self.isLooping = loop

      let audioFile = try AVAudioFile(forReading: resolvedURL)
      self.currentAudioFile = audioFile

      // Reconnect player with the file's processing format
      let fileFormat = audioFile.processingFormat
      engine.disconnectNodeOutput(player)
      engine.connect(player, to: self.mediaGainNode!, format: fileFormat)

      // Update converter — mixer output format may have changed after reconnect
      let newMixerFormat = engine.mainMixerNode.outputFormat(forBus: 0)
      if let targetFmt = self.targetFormat {
        self.audioConverter = AVAudioConverter(from: newMixerFormat, to: targetFmt)
      }

      self.scheduleAndPlay(audioFile: audioFile)
    }

    // ── Stop media file ───────────────────────────────────────────────────────
    Function("stopFile") {
      self.isLooping = false
      self.playerNode?.stop()
      self.isFilePlaying = false
      self.currentAudioFile = nil
    }

    // ── Volume controls ───────────────────────────────────────────────────────
    Function("setMicVolume") { (volume: Float) in
      self.micGainNode?.outputVolume = max(0.0, min(1.0, volume))
      // Invalidate converter — mixer output format may change when mic toggles
      self.audioConverter = nil
    }

    Function("setMediaVolume") { (volume: Float) in
      self.mediaGainNode?.outputVolume = max(0.0, min(1.0, volume))
    }

    // ── Fade media volume (for ducking / crossfade) ───────────────────────────
    // Simple linear fade implemented with a timer since AVAudioMixerNode
    // doesn't support ramping natively (unlike AudioUnit params).
    Function("fadeMediaVolume") { (targetVolume: Float, duration: Float) in
      guard let gainNode = self.mediaGainNode else { return }
      let target = max(0.0, min(1.0, targetVolume))
      let startVolume = gainNode.outputVolume
      let steps = 20
      let interval = TimeInterval(duration) / TimeInterval(steps)
      let delta = (target - startVolume) / Float(steps)

      for i in 0...steps {
        DispatchQueue.main.asyncAfter(deadline: .now() + interval * Double(i)) { [weak gainNode] in
          guard let node = gainNode else { return }
          if i == steps {
            node.outputVolume = target
          } else {
            node.outputVolume = startVolume + delta * Float(i)
          }
        }
      }
    }

    // ── Monitor controls ──────────────────────────────────────────────────────
    Function("setMonitorEnabled") { (enabled: Bool) in
      self.monitorEnabled = enabled
      // monitorGainNode sits between mainMixer and outputNode
      self.monitorGainNode?.outputVolume = enabled ? 1.0 : 0.0
    }

    Function("setMonitorVolume") { (volume: Float) in
      // Only affects local output — tap on mainMixer is unaffected
      guard self.monitorEnabled else { return }
      self.monitorGainNode?.outputVolume = max(0.0, min(1.0, volume))
    }

    // ── File playing state ────────────────────────────────────────────────────
    Function("isFilePlaying") { () -> Bool in
      return self.isFilePlaying
    }

    // ── Cleanup ───────────────────────────────────────────────────────────────
    OnDestroy {
      self.stopEngine()
    }
  }

  // ── Helper: resolve file path to URL ──────────────────────────────────────
  private func resolveFileURL(_ path: String) -> URL? {
    let fileManager = FileManager.default

    // Try as a file path first
    if fileManager.fileExists(atPath: path) {
      return URL(fileURLWithPath: path)
    }
    // Try removing file:// prefix
    let cleaned = path.replacingOccurrences(of: "file://", with: "")
    if fileManager.fileExists(atPath: cleaned) {
      return URL(fileURLWithPath: cleaned)
    }
    // Try percent-decoding (Arabic chars may come encoded from JS)
    if let decoded = cleaned.removingPercentEncoding, fileManager.fileExists(atPath: decoded) {
      return URL(fileURLWithPath: decoded)
    }
    return nil
  }

  // ── Schedule file and play (supports looping) ──────────────────────────────
  private func scheduleAndPlay(audioFile: AVAudioFile) {
    guard let player = self.playerNode else { return }

    // Reset file read position to start
    audioFile.framePosition = 0

    player.scheduleFile(audioFile, at: nil, completionCallbackType: .dataPlayedBack) { [weak self] _ in
      DispatchQueue.main.async {
        guard let self = self, self.isFilePlaying else { return }

        if self.isLooping, let file = self.currentAudioFile {
          // Re-schedule for loop
          self.scheduleAndPlay(audioFile: file)
        } else {
          // Done — fire completion event
          self.isFilePlaying = false
          self.currentAudioFile = nil
          self.sendEvent("onFileComplete", [:])
        }
      }
    }

    player.play()
    self.isFilePlaying = true
  }

  // ── Stop engine and cleanup ─────────────────────────────────────────────────
  private func stopEngine() {
    guard isStreaming else { return }
    isStreaming = false
    isFilePlaying = false
    isLooping = false
    currentAudioFile = nil

    playerNode?.stop()
    audioEngine?.mainMixerNode.removeTap(onBus: 0)
    audioEngine?.stop()

    // Detach custom nodes
    if let p = playerNode { audioEngine?.detach(p) }
    if let m = micGainNode { audioEngine?.detach(m) }
    if let g = mediaGainNode { audioEngine?.detach(g) }
    if let n = monitorGainNode { audioEngine?.detach(n) }

    audioEngine = nil
    playerNode = nil
    micGainNode = nil
    mediaGainNode = nil
    monitorGainNode = nil
    audioConverter = nil
    targetFormat = nil

    try? AVAudioSession.sharedInstance().setActive(false)
  }
}
