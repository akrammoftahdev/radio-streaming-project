# Project Infrastructure Addendum — May 26, 2026

## 1. Custom Native Module — LiveAudioStream

### 1.1 Architecture
The mobile app uses a **custom Expo native module** for audio streaming instead of any third-party library. This provides direct access to OS-level audio APIs (`AVAudioEngine` on iOS, `AudioRecord` on Android).

### 1.2 Module Structure
```text
mobile-app/modules/live-audio-stream/
├── expo-module.config.json          # Expo autolinking: { platforms: ["apple"], apple: { modules: ["LiveAudioStreamModule"] } }
├── ios/
│   ├── LiveAudioStream.podspec      # CocoaPods spec: depends on ExpoModulesCore, Swift 5.4, iOS 15.1+
│   └── LiveAudioStreamModule.swift  # AVAudioEngine.inputNode.installTap → Int16 PCM → base64 → JS event
└── src/
    └── index.ts                     # TypeScript API: start(options), stop(), onAudioData(callback)
```

### 1.3 Expo Autolinking for Local Modules
- Expo autolinking scans `modules/` directory automatically
- **Required files:** `expo-module.config.json` + `.podspec` in `ios/`
- **No `package.json`** inside local modules (interferes with autolinking)
- After adding a new module: run `pod install` in `ios/` directory, then `npx expo run:ios`
- Verify: `npx expo-modules-autolinking resolve 2>&1 | grep LiveAudioStream`

---

## 2. Mobile-to-Backend Audio Pipeline

### 2.1 Dual FFmpeg Pipeline
The `backend-audio` server has two pre-existing FFmpeg input pipelines:

| Parameter | FFmpeg Input Args | Client | Use Case |
|---|---|---|---|
| `format=webm` (default) | `-f webm -i pipe:0` | Web browser (MediaRecorder → WebM/Opus) | Desktop streaming |
| `format=pcm` | `-f s16le -ar 44100 -ac 1 -i pipe:0` | Mobile app (AVAudioEngine → Int16 PCM) | iOS/Android streaming |

Both pipelines output: `-codec:a libmp3lame -b:a {bitrate}k -f mp3 pipe:1` → SHOUTcast SOURCE.

### 2.2 WebSocket Connection URL
```
wss://studio.egonair.com/audio?token={JWT}&format=pcm
```

### 2.3 Stale Session Watchdog
- `STALE_TIMEOUT_MS = 15000` (15 seconds)
- Pre-computed silence keepalive: `'A'.repeat(5460) + 'AA=='` sent every 5s until mic activates

---

## 3. iOS Build Infrastructure

### 3.1 Build Commands
```bash
# First time or after adding native modules:
cd ios && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install && cd ..
npx expo run:ios

# Subsequent JS-only changes: just reload in simulator (⌘R)
```

### 3.2 Build Environment
- **Simulator:** iPhone SE (3rd generation) — iOS 18.0
- **Xcode:** 16.0 (React Native warns ≥16.1 required, bypassed)
- **Derived Data:** `/Users/apple/Library/Developer/Xcode/DerivedData/mobileapp-axftbnhqaohskmckendkrmzxpnxe/`
- **Ruby locale fix:** `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` required for `pod install` (Arabic path chars cause `Encoding::CompatibilityError`)

### 3.3 CocoaPods
- Total pods: 102 (96 from Podfile + 6 transitive)
- Pod install time: ~38-42 seconds

### 3.4 Native Dependencies
| Package | Status | Notes |
|---|---|---|
| `LiveAudioStream` (local module) | ✅ Active | Custom AVAudioEngine module |
| `react-native-live-audio-stream` | ❌ Unused | Incompatible with Expo new arch. Remove in cleanup. |
| `expo-audio` | ✅ Active | Used for `requestRecordingPermissionsAsync()` only |

---

## 4. iOS Background Audio Configuration

### 4.1 app.json Configuration
```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSMicrophoneUsageDescription": "EGONAIR needs your microphone to broadcast live audio to the radio station.",
        "UIBackgroundModes": ["audio"]
      }
    }
  }
}
```

### 4.2 How It Works
- `UIBackgroundModes: ["audio"]` tells iOS the app performs audio in the background
- `AVAudioSession` with category `.playAndRecord` keeps the app alive
- No Foreground Service or extra code needed on iOS
- The audio engine continues running when the screen is locked or another app is opened

---

## 5. API Routes

### 5.1 `/api/mobile/audio-token` (POST)
- **Location:** `frontend/src/app/api/mobile/audio-token/route.ts`
- **Auth:** Bearer JWT in `Authorization` header
- **Roles:** `ADMIN` and `PRESENTER`
- **DIRECT_DJ Resolution:** Queries `DirectDJ` table by `presenterId`
- **Returns:** `{ token: string }` — short-lived JWT for WebSocket auth

### 5.2 Nginx Proxy (Unchanged)
- `wss://studio.egonair.com/audio` → backend-audio port 3001
- `https://studio.egonair.com/api/*` → Next.js frontend port 3000

---

## 6. Mobile App File Structure (Updated)

```text
mobile-app/
├── modules/
│   └── live-audio-stream/              # [NEW] Custom AVAudioEngine native module
│       ├── expo-module.config.json
│       ├── ios/
│       │   ├── LiveAudioStream.podspec
│       │   └── LiveAudioStreamModule.swift
│       └── src/
│           └── index.ts
├── src/
│   ├── app/
│   │   ├── studio/
│   │   │   └── [stationId].tsx         # [MODIFIED] Uses LiveAudioStream native module
│   │   ├── login.tsx
│   │   ├── preflight.tsx
│   │   └── _layout.tsx
│   ├── core/
│   │   └── audioStream.ts              # (unused — can be removed)
│   ├── components/
│   │   ├── studio/
│   │   │   ├── MediaLibrary.tsx
│   │   │   ├── MediaQueue.tsx
│   │   │   └── WaitScreen.tsx
│   │   └── HiddenAudioEngine.tsx       # WebView audio player (local playback only — NOT streamed)
│   └── theme/
│       └── colors.ts
├── ios/                                # Xcode project (auto-generated)
├── app.json                            # [MODIFIED] Added UIBackgroundModes
└── package.json
```
