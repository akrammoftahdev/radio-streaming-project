import { requireNativeModule, EventEmitter, Subscription } from 'expo-modules-core';

interface AudioDataEvent {
  data: string;  // base64-encoded Int16 PCM
  size: number;  // byte count
}

interface StartOptions {
  sampleRate?: number;
  channelCount?: number;
}

const NativeModule = requireNativeModule('LiveAudioStream');
const emitter = new EventEmitter(NativeModule);

const LiveAudioStream = {
  /**
   * Start the audio engine with full mixer graph.
   * Mic + media player → mainMixerNode → installTap → PCM events.
   * Emits 'onAudioData' events with base64-encoded Int16 PCM chunks (~100ms each).
   */
  start(options: StartOptions = {}): void {
    NativeModule.start({
      sampleRate: options.sampleRate ?? 44100,
      channelCount: options.channelCount ?? 1,
    });
  },

  /** Stop the audio engine and all playback. */
  stop(): void {
    NativeModule.stop();
  },

  /** Check if the engine is streaming. */
  isStreaming(): boolean {
    return NativeModule.isStreaming();
  },

  // ── Media file playback ─────────────────────────────────────────────────

  /**
   * Play a local MP3 file through the mixer (goes to SHOUTcast).
   * @param url - Local file path or file:// URI
   * @param loop - If true, the file loops until stopFile() is called
   */
  playFile(url: string, loop: boolean = false): void {
    NativeModule.playFile(url, loop);
  },

  /** Stop the currently playing media file. */
  stopFile(): void {
    NativeModule.stopFile();
  },

  /** Check if a media file is currently playing. */
  isFilePlaying(): boolean {
    return NativeModule.isFilePlaying();
  },

  // ── Volume controls ─────────────────────────────────────────────────────

  /** Set mic volume (0.0–1.0). Affects the stream. */
  setMicVolume(volume: number): void {
    NativeModule.setMicVolume(volume);
  },

  /** Set media volume (0.0–1.0). Affects the stream. */
  setMediaVolume(volume: number): void {
    NativeModule.setMediaVolume(volume);
  },

  /**
   * Smoothly fade media volume over duration (for ducking/crossfade).
   * @param targetVolume - Target volume (0.0–1.0)
   * @param duration - Fade duration in seconds
   */
  fadeMediaVolume(targetVolume: number, duration: number): void {
    NativeModule.fadeMediaVolume(targetVolume, duration);
  },

  // ── DJ Monitor ──────────────────────────────────────────────────────────

  /**
   * Enable/disable DJ monitoring (hear mixed output through speakers/headphones).
   * Does NOT affect the stream — only local output.
   */
  setMonitorEnabled(enabled: boolean): void {
    NativeModule.setMonitorEnabled(enabled);
  },

  /**
   * Set monitor volume (0.0–1.0). Only affects local output.
   * Does NOT affect the stream.
   */
  setMonitorVolume(volume: number): void {
    NativeModule.setMonitorVolume(volume);
  },

  // ── Event subscriptions ─────────────────────────────────────────────────

  /** Subscribe to audio data events (PCM chunks for WebSocket). */
  onAudioData(callback: (event: AudioDataEvent) => void): Subscription {
    return emitter.addListener('onAudioData', callback);
  },

  /** Subscribe to file completion events (auto-advance queue). */
  onFileComplete(callback: () => void): Subscription {
    return emitter.addListener('onFileComplete', callback);
  },
};

export default LiveAudioStream;
export type { AudioDataEvent, StartOptions };
