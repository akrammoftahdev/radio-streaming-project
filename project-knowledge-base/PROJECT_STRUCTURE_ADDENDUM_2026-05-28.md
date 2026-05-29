# Project Structure Addendum — May 28, 2026

This document outlines new and modified files from the May 27–28 night session (recording playback fix).

---

## 1. New Files

### 1.1 Mobile Recording Play API Route
```text
frontend/src/app/api/mobile/recordings/play/[filename]/
└── route.ts                                # [NEW] Serves MP3 recording files to mobile app
```
**Purpose:** JWT-authenticated file serving route for the mobile app. Receives a recording filename, looks up the file on disk, and streams the MP3 binary data.

**Auth:** Accepts BOTH `?token=<JWT>` query param AND `Authorization: Bearer <JWT>` header. This dual-auth support was the critical fix that resolved the playback issue.

**File resolution logic:**
1. Extract base filename (strip `.webm`/`.mp3`/`.pcm` extension)
2. DB lookup with OR condition: match exact filename, baseName+.mp3, or baseName+.webm
3. Disk lookup: prefer `.mp3` (iOS can't play `.webm`), fallback to `.webm`
4. Skip corrupt files (< 1KB)
5. Support HTTP Range requests for seeking

---

## 2. Modified Files

### 2.1 RecordingMiniPlayer.tsx (Complete Rewrite)
```text
mobile-app/src/components/studio/
└── RecordingMiniPlayer.tsx                 # [MODIFIED — REWRITTEN] Download-then-play architecture
```

**Before (broken):**
- Used `expo-audio` `useAudioPlayer` with remote HTTPS URL
- Silent failure — no audio, no errors

**After (working):**
- Downloads MP3 via `api.get()` (axios with Bearer auth) → `responseType: 'arraybuffer'`
- Converts arraybuffer → base64 → `FileSystem.writeAsStringAsync` → local `.mp3` file
- Plays local file with `expo-audio` `useAudioPlayer({ uri: localFile })`
- Shows download progress state ("جارٍ تحميل التسجيل...")
- Displays HTTP errors in red text on the player UI
- Caches downloaded files in `FileSystem.cacheDirectory + 'recordings/'`

**New dependencies added in this file:**
- `import { api } from '../../core/api'` — for authenticated downloads
- `import * as FileSystem from 'expo-file-system/legacy'` — for local file caching

### 2.2 Mobile Recordings List API Route
```text
frontend/src/app/api/mobile/recordings/
└── route.ts                                # [MODIFIED] Added playbackUrl with JWT token
```
**Change:** Injects `playbackUrl` field into each recording object. The URL includes the JWT token as a query parameter for backward compatibility, though the mobile app now uses Bearer auth via axios.

---

## 3. Updated File Tree

```text
frontend/src/app/api/mobile/
├── audio-token/
│   └── route.ts                    # POST — issue JWT for WebSocket audio
├── login/
│   └── route.ts                    # POST — mobile login
├── recordings/
│   ├── route.ts                    # GET — list presenter's recordings
│   └── play/
│       └── [filename]/
│           └── route.ts            # [NEW] GET — serve recording MP3 with dual auth
└── stations/
    └── route.ts                    # GET — list stations

mobile-app/src/components/studio/
├── MediaLibrary.tsx                # Media file browser
├── MediaQueue.tsx                  # Queue management
├── RecordingMiniPlayer.tsx         # [REWRITTEN] Download-then-play recording player
└── WaitScreen.tsx                  # Pre-show waiting screen (includes RecordingMiniPlayer)
```

---

## 4. Dependencies Status Update

| Package | Status | Notes |
|---|---|---|
| `expo-audio` | ✅ Active | `useAudioPlayer` for LOCAL file playback only — remote URLs are NOT reliable |
| `expo-file-system/legacy` | ✅ Active | Used for local caching of downloaded recordings. Legacy import to avoid v54 deprecation warnings. |
| `@react-native-community/slider` | ✅ Active | Seek bar in RecordingMiniPlayer |
| `react-native-webview` | ✅ Active | Used by HiddenAudioEngine (NOT used for recording playback — WebView approach was tried and failed) |

---

## 5. Files That Were Tried and Reverted

During the debugging session, the following approaches were implemented then discarded:

| Approach | Files Created/Modified | Why Reverted |
|---|---|---|
| WebView + HTML5 audio player | RecordingMiniPlayer.tsx (WebView version) | CORS blocked all network requests from inline HTML |
| WebView + XHR blob download | RecordingMiniPlayer.tsx (XHR version) | Same CORS issue — XHR from about:blank origin blocked |
| FileSystem.downloadAsync | RecordingMiniPlayer.tsx (downloadAsync version) | Download hangs indefinitely — never completes |

All of these were overwritten by the final working version (axios download + local file playback).
