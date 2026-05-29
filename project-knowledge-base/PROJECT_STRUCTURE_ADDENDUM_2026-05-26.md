# Project Structure Addendum
**Date:** May 26, 2026

This document outlines the structural changes made to support the custom native audio module and updated mobile app architecture.

## 1. Custom Native Module — LiveAudioStream

A new local Expo module was created to provide direct hardware-level audio capture using `AVAudioEngine` (iOS) and `AudioRecord` (Android, TODO). This replaces all previous attempts to use `expo-audio`, `react-native-live-audio-stream`, or any file-based recording approach.

```text
mobile-app/
├── modules/                                # [NEW] Local Expo native modules
│   └── live-audio-stream/                  # [NEW] Custom audio streaming module
│       ├── expo-module.config.json         # [NEW] Autolinking: platforms, Swift class name
│       ├── ios/                            # [NEW] iOS native implementation
│       │   ├── LiveAudioStream.podspec     # [NEW] CocoaPods spec for compilation
│       │   └── LiveAudioStreamModule.swift # [NEW] AVAudioEngine tap → PCM → JS events
│       └── src/                            # [NEW] TypeScript API wrapper
│           └── index.ts                    # [NEW] start(), stop(), onAudioData()
```

## 2. Studio Screen Changes

The `[stationId].tsx` studio screen was simplified significantly:

**Removed dependencies:**
- `buffer` — no longer needed (no WAV header stripping)
- `expo-file-system/legacy` — no longer needed (no file I/O)
- `expo-audio` recorder hooks — replaced by native module (only `requestRecordingPermissionsAsync` retained)

**New dependency:**
- `LiveAudioStream` from `../../../modules/live-audio-stream/src` — custom native module

**Code reduction:**
- Removed: `useAudioRecorder`, `sendChunk`, `chunkIntervalRef`, WAV header stripping, file cleanup
- Added: `LiveAudioStream.start()`, `LiveAudioStream.onAudioData()`, `LiveAudioStream.stop()`
- Net: ~60 lines removed, ~15 lines added

## 3. App Configuration Changes

```text
mobile-app/
├── app.json                                # [MODIFIED]
│   └── expo.ios.infoPlist:
│       ├── NSMicrophoneUsageDescription    # (existing)
│       └── UIBackgroundModes: ["audio"]    # [NEW] Background audio execution
```

## 4. Files That Can Be Removed (Cleanup)

| File/Package | Reason |
|---|---|
| `react-native-live-audio-stream` in `package.json` | Incompatible with Expo new arch, never used |
| `mobile-app/src/core/audioStream.ts` | Written for `react-native-live-audio-stream`, now unused |
| `buffer` in `package.json` | No longer needed — no WAV header processing |

## 5. Planned New Files (Phases 2–7)

### Phase 2: Audio Mixing
```text
mobile-app/modules/live-audio-stream/
├── ios/
│   └── LiveAudioStreamModule.swift         # [MODIFY] Add playerNode, mixerNode, gain controls, monitor
└── src/
    └── index.ts                            # [MODIFY] Add playFile, stopFile, volume, monitor functions
```

### Phase 3: Mobile Feature Parity
```text
mobile-app/src/components/studio/
├── RecordingMiniPlayer.tsx                  # [NEW] Play/pause/seek for recordings
└── WaitScreen.tsx                          # [MODIFY] Add recordings list, server gate timing

frontend/src/app/api/mobile/
└── recordings/
    └── route.ts                            # [NEW] GET last N recordings for presenter
```

### Phase 4: Queue-to-Queue Crossfade
```text
mobile-app/modules/live-audio-stream/
├── ios/
│   └── LiveAudioStreamModule.swift         # [MODIFY] Dual playerNode A/B, crossfadeToFile()

frontend/src/app/studio/
└── studio-ui.tsx                           # [MODIFY] Dual Audio crossfade logic
```

### Phase 5: SFX Pads
```text
mobile-app/src/components/studio/
└── SfxPad.tsx                              # [NEW] 8-slot SFX grid for mobile

frontend/src/components/studio/
└── SfxPad.tsx                              # [NEW] 8-slot SFX grid for web
```

### Phase 6: DSP Mic Filters
```text
mobile-app/src/components/studio/
└── DspFilters.tsx                          # [NEW] Noise gate, compressor, EQ sliders (mobile)

frontend/src/components/studio/
└── DspFilters.tsx                          # [NEW] Noise gate, compressor, EQ sliders (web)
```

### Phase 7: Android
```text
mobile-app/modules/live-audio-stream/
├── android/
│   ├── LiveAudioStreamModule.kt            # [NEW] AudioRecord + mixing + DSP
│   └── LiveAudioStreamPackage.kt           # [NEW] RN package registration
└── expo-module.config.json                 # [MODIFY] Add android platform
```

