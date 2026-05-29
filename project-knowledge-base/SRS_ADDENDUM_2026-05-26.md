# Software Requirements Specification (SRS) Addendum
**Date:** May 26, 2026

This addendum documents technical requirements for the native mobile audio streaming pipeline, based on confirmed working implementation.

---

## 1. Mobile Audio Streaming — Custom Native Module Architecture

### 1.1 Native Module Requirements (LiveAudioStream)
- The mobile client MUST use a custom Expo native module (`LiveAudioStream`) for audio capture, NOT `expo-audio` or third-party recorder packages.
- **iOS Implementation:** MUST use `AVAudioEngine` with `inputNode.installTap(onBus:)` for continuous, gapless PCM capture.
- **Android Implementation:** MUST use `AudioRecord` in a background thread for continuous PCM capture. (TODO)
- The native module MUST emit `onAudioData` events containing base64-encoded Int16 PCM buffers approximately every 100ms.
- The native module MUST configure `AVAudioSession` with category `.playAndRecord` and mode `.default`.

### 1.2 Audio Format Requirements
- **Sample Rate:** 44100 Hz
- **Channels:** 1 (mono)
- **Bit Depth:** 16-bit signed little-endian (`s16le` / `pcmFormatInt16`)
- **Encoding:** Int16 PCM bytes MUST be base64-encoded before sending as a WebSocket text frame.
- **WebSocket URL:** The mobile client MUST append `&format=pcm` to the WebSocket connection URL.

### 1.3 Session Keepalive Requirements
- **Stale Timeout:** The backend closes WebSocket connections after 15 seconds of no data.
- **Silence Keepalive:** The mobile client MUST send pre-computed base64 silence every 5 seconds while connected but not actively recording. Keepalive MUST stop when actual recording begins.

### 1.4 Audio Mode Requirements (iOS)
- The native module handles `AVAudioSession` configuration internally.
- `UIBackgroundModes: ["audio"]` MUST be set in `app.json → expo.ios.infoPlist`.

---

## 2. Audio Mixing Requirements (Next Phase)

### 2.1 Architecture
- The mobile client MUST support mixing microphone input with media file playback into a single audio stream.
- **iOS Implementation:** MUST use `AVAudioEngine` node graph:
  - `inputNode` (mic) → `mixerNode`
  - `AVAudioPlayerNode` (media file) → `mixerNode`
  - `mixerNode` → `installTap` → PCM buffers → WebSocket
- **Android Implementation:** MUST manually mix PCM buffers from `AudioRecord` (mic) and `AudioTrack` (media).

### 2.2 Functional Requirements
- **Mic Volume:** Users MUST be able to adjust microphone input volume independently.
- **Media Volume:** Users MUST be able to adjust background music volume independently.
- **Gapless Playback:** Media file transitions (queue) MUST NOT interrupt the mic stream.
- **Mixed Output:** The SHOUTcast listener MUST hear BOTH the DJ's voice and the background music in a single stream. Media MUST NOT play only locally on the phone speaker.

---

## 3. Background Execution Requirements

### 3.1 iOS
- The app MUST continue streaming when the screen is locked or the app is sent to the background.
- `UIBackgroundModes: ["audio"]` provides this automatically when `AVAudioSession` is active with category `.playAndRecord`.

### 3.2 Android (TODO)
- The app MUST implement a Foreground Service with a persistent notification to prevent Android from killing the audio stream.
- The notification MUST display current streaming status (station name, duration).

---

## 4. Expo Local Module Requirements

### 4.1 Module Structure
- Local Expo modules MUST be placed in the `modules/` directory at the project root.
- Each module MUST contain:
  - `expo-module.config.json` — platform and Swift/Kotlin class registration
  - `ios/*.podspec` — CocoaPods specification (REQUIRED for iOS autolinking)
  - `ios/*.swift` — Native Swift implementation
  - `src/index.ts` — TypeScript wrapper exposing the JS API
- Local modules MUST NOT contain a `package.json` (interferes with Expo autolinking).

### 4.2 Build Process
- After adding or modifying a local module, `pod install` MUST be run in the `ios/` directory before `npx expo run:ios`.
- Module detection can be verified via: `npx expo-modules-autolinking resolve 2>&1 | grep ModuleName`.

---

## 5. Deprecated Requirements (Superseded)

The following requirements from earlier addenda are now OBSOLETE:

| Old Requirement | Status | Replacement |
|---|---|---|
| expo-audio WAV recording with 2s chunks | SUPERSEDED | AVAudioEngine continuous tap |
| WAV 44-byte header stripping | SUPERSEDED | No files — direct memory buffers |
| expo-file-system/legacy for audio I/O | SUPERSEDED | No file I/O in audio pipeline |
| Buffer polyfill for PCM processing | SUPERSEDED | Native Swift handles conversion |
| `setAudioModeAsync({ allowsRecording })` | SUPERSEDED | Native module sets AVAudioSession |

---

## 6. Non-Functional Requirements — Error Handling

### 6.1 No Silent Failures
- All `catch` blocks in the audio pipeline MUST log errors to `console.error` with a `[MIC]` prefix.
- The UI MUST surface critical errors via the `errorMsg` state banner.

### 6.2 Diagnostic Logging
- During development, the audio pipeline SHOULD log `[MIC]` prefixed messages at:
  - Native engine start/stop
  - WebSocket connection state changes
  - Error conditions

---

## 7. Queue-to-Queue Crossfade Requirements (Web + Mobile)

### 7.1 Behavior
- When one queue item ends and the next auto-plays, the system MUST overlap-fade them (true crossfade).
- The outgoing track MUST fade out over a configurable duration (default 3 seconds).
- The incoming track MUST fade in over the same duration, starting before the outgoing track finishes.
- There MUST be NO audible gap between consecutive queue items.

### 7.2 Implementation
- **Dual Player Pattern:** Two player instances alternate (A plays while B pre-loads, then B plays while A pre-loads).
- **Web:** Two `Audio` elements with separate `GainNode` instances. `timeupdate` on current audio triggers crossfade when `currentTime >= duration - crossfadeDuration`.
- **Mobile (iOS):** Two `AVAudioPlayerNode` instances with separate gain nodes. Native module detects approaching end via `AVAudioPlayerNode.nodeTime` and emits `onCrossfadeNeeded` event.

### 7.3 Background ↔ Queue Transitions (Mobile Parity)
- Background music MUST fade OUT over 3 seconds when queue starts.
- Background music MUST fade IN over 2 seconds when queue ends.
- Background music MUST duck to 10% (`volume × 0.10`) when mic is open.

---

## 8. Sound Effects / SFX Pad Requirements (Web + Mobile)

### 8.1 Functional Requirements
- The studio MUST provide a grid of SFX pads (minimum 8 slots).
- Each pad MUST be assignable to an audio clip (jingle, stinger, sound bite).
- Tapping/clicking a pad MUST play the clip immediately through the mixer to SHOUTcast.
- SFX MUST play simultaneously with mic and media (layered, not interrupting).
- Multiple SFX MUST be able to play at the same time.
- SFX playback MUST be one-shot (no looping).

### 8.2 Volume Control
- SFX volume MUST have an independent slider.
- SFX volume MUST NOT affect mic, media, or monitor volumes.

### 8.3 Clip Management
- Presenters MUST be able to assign clips to pads from the media library or personal uploads.
- SFX clips MUST be pre-downloaded to local storage before playback (no streaming delay).

### 8.4 Implementation
- **Web:** `AudioBufferSourceNode` → `sfxGainNode` → `mixerDest`. New source node per tap.
- **Mobile (iOS):** Dedicated `AVAudioPlayerNode` + `sfxGainNode` connected to `mainMixerNode`.

---

## 9. DSP Mic Filter Requirements (Web + Mobile)

### 9.1 Filter Chain
The mic signal MUST pass through the following processing chain (in order):
```
Mic Input → Noise Gate → Compressor → Equalizer → micGain → Mixer
```

### 9.2 Noise Gate
- Purpose: Cut background noise when the presenter is not speaking.
- Parameters: Threshold (-40 to -10 dB), Attack (1-50ms), Release (50-500ms).
- MUST have an on/off toggle.
- **Web:** Custom implementation using `AnalyserNode` + `GainNode` (Web Audio has no native gate).
- **Mobile (iOS):** `AVAudioUnitDynamicsProcessor` in gate mode.

### 9.3 Compressor
- Purpose: Even out loud and quiet voice levels.
- Parameters: Threshold (-30 to 0 dB), Ratio (1:1 to 12:1), Attack, Release, Knee.
- MUST have an on/off toggle.
- **Web:** `DynamicsCompressorNode` (native Web Audio API).
- **Mobile (iOS):** `AVAudioUnitDynamicsProcessor` in compressor mode.

### 9.4 Equalizer (3-Band)
- Purpose: Shape voice tone.
- Bands: Low (80-300Hz), Mid (300Hz-4kHz), High (4-12kHz).
- Range: ±12dB per band.
- MUST have an on/off toggle.
- **Web:** Three `BiquadFilterNode` instances (lowshelf, peaking, highshelf).
- **Mobile (iOS):** `AVAudioUnitEQ` with 3 bands.

### 9.5 Settings Persistence
- Filter settings MUST persist between sessions (localStorage on web, AsyncStorage on mobile).

---

## 10. Mobile Feature Parity Requirements

### 10.1 Presenter Recordings on WaitScreen
- The mobile WaitScreen MUST display the presenter's last 10 recordings with a mini-player.
- Each recording MUST show: date, duration, play/pause/seek controls.
- A new API route `GET /api/mobile/recordings` MUST be created to serve recordings for the authenticated presenter.
- Empty state MUST show: "لا توجد تسجيلات بعد. ستظهر هنا بعد أول بثّ."

### 10.2 Session-End Watchdog
- For scheduled presenters: the mobile studio MUST poll remaining session time every 10 seconds.
- At ≤60 seconds remaining: MUST show a warning banner "⚠️ سيتم إنهاء البث خلال دقيقة".
- At ≤0 seconds: MUST auto-disconnect (stop mic, stop media, close WebSocket, navigate back).
- For Direct DJs: the watchdog MUST be disabled (stream indefinitely).

### 10.3 Gate Timing
- The mobile WaitScreen MUST use `allowConnectMinutesBefore` from the server (per-program schedule rule).
- MUST NOT use a hardcoded 10-minute value.

### 10.4 DJ Monitor (Mobile Only)
- The mobile studio MUST have a toggle button to enable/disable DJ monitoring.
- When enabling monitoring, MUST show a warning: "يُرجى استخدام سماعات الرأس لتجنب التشويش".
- MUST have a separate monitor fader that controls local ear volume WITHOUT affecting the SHOUTcast stream.
- **Do NOT modify the web studio's existing monitor implementation.**

### 10.5 Queue File Download
- Every file added to the queue MUST be downloaded immediately with a visible progress meter.
- Each queue item MUST show download status: downloading (with %) → ready → playing.
- Files MUST be downloaded to local temporary storage before playback.
