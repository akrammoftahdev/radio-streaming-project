# Native Mobile App Roadmap — May 26, 2026

## ✅ Phase 1: iOS Mic Streaming (COMPLETE)
**Status:** Done — confirmed working with perfect audio quality on SHOUTcast.
**Background audio:** Confirmed working — 15 min screen lock test passed.

| Task | Status |
|---|---|
| Custom AVAudioEngine native module (`LiveAudioStream`) | ✅ Done |
| Continuous gapless PCM streaming to WebSocket | ✅ Done |
| JWT auth for mobile audio tokens | ✅ Done |
| Silence keepalive (stale timeout fix) | ✅ Done |
| UIBackgroundModes: audio | ✅ Done |
| End-to-end verified on SHOUTcast | ✅ Done |
| Background audio (15 min screen lock test) | ✅ Done |

---

## 🔜 Phase 2: Audio Mixing Core (iOS) — NEXT
**Estimated: ~4 hours**

Extend the AVAudioEngine native module to mix mic + media into a single stream.

| Task | Status | Notes |
|---|---|---|
| `AVAudioPlayerNode` + media gain node | ⏳ TODO | Plays MP3 files through engine |
| `AVAudioMixerNode` tap (mixed output) | ⏳ TODO | Move tap from inputNode to mainMixerNode |
| `playFile()`, `stopFile()` exposed to JS | ⏳ TODO | Load local MP3 into player |
| `setMicVolume()`, `setMediaVolume()` | ⏳ TODO | Independent volume controls |
| `fadeMediaVolume()` for ducking/crossfade | ⏳ TODO | Smooth gain ramps |
| DJ monitor toggle + headphone warning | ⏳ TODO | Separate monitor gain (local only) |
| Monitor fader (doesn't affect stream) | ⏳ TODO | 3rd volume control |
| Background ducking (10% when mic open) | ⏳ TODO | `fadeMediaVolume(vol * 0.10, 0.3)` |
| Queue file pre-download + progress meter | ⏳ TODO | `FileSystem.downloadAsync` per item |
| `onFileComplete` event for queue advance | ⏳ TODO | Auto-play next item |

---

## 🔜 Phase 3: Mobile Feature Parity
**Estimated: ~5 hours**

Bring mobile WaitScreen and studio up to web studio level.

| Task | Status | Notes |
|---|---|---|
| Recordings list on WaitScreen (last 10) | ⏳ TODO | Mini-player with play/pause/seek |
| Mobile recordings API route | ⏳ TODO | `GET /api/mobile/recordings` |
| Recording mini-player component | ⏳ TODO | New `RecordingMiniPlayer.tsx` |
| Session-end watchdog (60s warning) | ⏳ TODO | Poll every 10s, auto-disconnect at end |
| `allowConnectMinutesBefore` from server | ⏳ TODO | Replace hardcoded 10 min |
| Background ↔ Queue crossfade (3s/2s) | ⏳ TODO | Fade transitions via gain ramps |

---

## 🔜 Phase 4: Queue-to-Queue Crossfade (Web + Mobile)
**Estimated: ~4 hours**

True overlap-crossfade between consecutive queue items (no gap).

| Task | Platform | Status | Notes |
|---|---|---|---|
| Dual Audio element pattern | Web | ⏳ TODO | Two `Audio` + `GainNode` pairs |
| `timeupdate` trigger at duration-3s | Web | ⏳ TODO | Start next before current ends |
| Dual `AVAudioPlayerNode` (A/B) | iOS | ⏳ TODO | Two players alternate |
| `crossfadeToFile(url, duration)` | iOS | ⏳ TODO | New Swift function |
| `onCrossfadeNeeded` event | iOS | ⏳ TODO | Emitted when nearing track end |
| JS queue logic for pre-loading | Mobile | ⏳ TODO | Pre-load next item during crossfade zone |

---

## 🔜 Phase 5: Sound Effects / SFX Pads (Web + Mobile)
**Estimated: ~5 hours**

Instant-trigger jingles/stingers that play through mixer to SHOUTcast.

| Task | Platform | Status | Notes |
|---|---|---|---|
| `SfxPad.tsx` component (8 slots grid) | Web | ⏳ TODO | `AudioBufferSourceNode` per tap |
| `sfxGainNode` in web audio graph | Web | ⏳ TODO | Independent SFX volume |
| SFX player node in Swift module | iOS | ⏳ TODO | `AVAudioPlayerNode` + `sfxGainNode` |
| `playSfx(url)`, `setSfxVolume()` | iOS | ⏳ TODO | New native functions |
| `SfxPad.tsx` mobile component | Mobile | ⏳ TODO | Same grid, calls native module |
| Clip assignment from media library | Both | ⏳ TODO | Assign audio to pad slots |
| SFX volume slider | Both | ⏳ TODO | Independent from mic/media/monitor |

---

## 🔜 Phase 6: DSP Mic Filters (Web + Mobile)
**Estimated: ~6 hours**

Real-time audio processing on mic signal before mixing.

| Task | Platform | Status | Notes |
|---|---|---|---|
| Noise Gate (custom AnalyserNode+Gain) | Web | ⏳ TODO | Threshold, attack, release |
| Compressor (`DynamicsCompressorNode`) | Web | ⏳ TODO | Native Web Audio |
| 3-Band EQ (`BiquadFilterNode` ×3) | Web | ⏳ TODO | lowshelf, peaking, highshelf |
| `DspFilters.tsx` web component | Web | ⏳ TODO | Toggle + sliders per filter |
| Noise Gate (`AVAudioUnitDynamicsProcessor`) | iOS | ⏳ TODO | Gate mode |
| Compressor (`AVAudioUnitDynamicsProcessor`) | iOS | ⏳ TODO | Compressor mode |
| 3-Band EQ (`AVAudioUnitEQ`) | iOS | ⏳ TODO | 3 bands |
| `DspFilters.tsx` mobile component | Mobile | ⏳ TODO | Same UI adapted for RN |
| Filter settings persistence | Both | ⏳ TODO | localStorage / AsyncStorage |

---

## 🔜 Phase 7: Android Build + Kotlin Native Module
**Estimated: ~8 hours**

Mirror complete iOS functionality in Kotlin.

| Task | Status | Notes |
|---|---|---|
| `LiveAudioStreamModule.kt` with `AudioRecord` | ⏳ TODO | Background thread, PCM capture |
| Media mixing (manual PCM sample summing) | ⏳ TODO | No AudioEngine equivalent on Android |
| Foreground Service + notification | ⏳ TODO | Required for background audio |
| DSP via `DynamicsProcessing` API (API 28+) | ⏳ TODO | Compressor, EQ, gate |
| SFX player via additional `AudioTrack` | ⏳ TODO | One-shot playback |
| `expo-module.config.json` android platform | ⏳ TODO | Add to autolinking |
| Gradle build + test | ⏳ TODO | `npx expo run:android` |

---

## Total Estimated Remaining: ~32 working hours

**Critical path:** Phase 2 (mixer foundation) → Phases 3-6 (any order) → Phase 7 (Android)

| Phase | Est. | Scope |
|---|---|---|
| Phase 2 | ~4h | iOS audio mixing core |
| Phase 3 | ~5h | Mobile feature parity |
| Phase 4 | ~4h | Queue crossfade (web + mobile) |
| Phase 5 | ~5h | SFX pads (web + mobile) |
| Phase 6 | ~6h | DSP filters (web + mobile) |
| Phase 7 | ~8h | Android build |

> **Note:** DJ monitor fader on web — leave as-is, no changes.
