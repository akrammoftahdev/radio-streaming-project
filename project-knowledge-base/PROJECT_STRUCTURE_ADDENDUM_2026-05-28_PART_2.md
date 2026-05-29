# Project Structure Addendum — May 28, 2026 (Part 2)

This document outlines files modified/created during the May 28 afternoon session (mobile studio audit, dashboard redesign, queue/bg cascade fix).

---

## 1. Modified Files

### 1.1 Schedule API Route (Complete Rewrite)
```text
frontend/src/app/api/mobile/schedule/
└── route.ts                    # [MODIFIED — REWRITTEN] Now uses resolveCurrentOrNextProgramSession()
```
**Before:** Queried legacy `BroadcastSchedule` table directly.
**After:** Uses `resolveCurrentOrNextProgramSession()` from `src/lib/resolve-program-session.ts`. Returns unified response with `mode`, `gateOpen`, `programTitle`, etc.

### 1.2 Stations API Route
```text
frontend/src/app/api/mobile/stations/
└── route.ts                    # [MODIFIED] Added presenterMode field to response
```
**Change:** Response now includes `presenterMode: "SINGLE_STATION" | "MULTI_STATION" | "DIRECT_DJ" | null` based on user's station count and program schedule rules.

### 1.3 Mobile Dashboard (Complete Rewrite)
```text
mobile-app/src/app/
└── index.tsx                   # [MODIFIED — REWRITTEN] 3 presenter type branches
```
**Before:** Single view with station dropdown for all users.
**After:** Three distinct UX branches:
- `SINGLE_STATION`: Auto-schedule, countdown, gate button, recordings
- `MULTI_STATION`: Dropdown → same schedule logic
- `DIRECT_DJ`: Radio list with per-radio broadcast button

### 1.4 Studio Station Page
```text
mobile-app/src/app/studio/
└── [stationId].tsx             # [MODIFIED] Queue/bg guard, NO_SCHEDULE blocking, default fix
```
**Changes:**
1. Added `manualStopRef` guard to prevent `onFileComplete` cascade
2. All 4 `stopFile()` call sites wrapped with async guard (100ms setTimeout release)
3. `NO_SCHEDULE` mode shows blocked UI instead of skipping to studio
4. `allowConnectMinutesBefore` default changed from 10 to 5
5. `isQueuePlayingRef.current = true` added to `playNow()`
6. Background restore added to `stopQueue()` via `playFile(bgFile.uri, true)`

### 1.5 RecordingMiniPlayer
```text
mobile-app/src/components/studio/
└── RecordingMiniPlayer.tsx     # [MODIFIED] FlatList → map()
```
**Change:** Replaced `FlatList` with `Array.map()` to prevent VirtualizedList crash inside ScrollView.

### 1.6 WaitScreen
```text
mobile-app/src/components/studio/
└── WaitScreen.tsx              # [MODIFIED] allowConnect default 10 → 5
```

---

## 2. Updated Mobile API Route Tree

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
│           └── route.ts            # GET — serve recording MP3 (dual auth)
├── schedule/
│   └── route.ts                    # [REWRITTEN] GET — schedule via resolveCurrentOrNextProgramSession
└── stations/
    └── route.ts                    # [MODIFIED] GET — list stations + presenterMode
```

---

## 3. Updated Mobile App Component Tree

```text
mobile-app/src/
├── app/
│   ├── _layout.tsx                 # Root layout
│   ├── index.tsx                   # [REWRITTEN] Dashboard — 3 presenter branches
│   ├── login.tsx                   # Login screen
│   ├── preflight.tsx               # Pre-studio permission checks
│   └── studio/
│       └── [stationId].tsx         # [MODIFIED] Studio + manualStopRef guard
├── components/studio/
│   ├── MediaLibrary.tsx            # Media file browser
│   ├── MediaQueue.tsx              # Queue management
│   ├── RecordingMiniPlayer.tsx     # [MODIFIED] Recording player (map not FlatList)
│   └── WaitScreen.tsx              # [MODIFIED] Pre-show wait screen
└── core/
    ├── api.ts                      # Axios HTTP client with JWT
    └── auth.ts                     # Auth context & token storage
```

---

## 4. Key Architecture Notes

### 4.1 Schedule Resolution Chain
```text
Mobile App (index.tsx)
  → GET /api/mobile/schedule?stationId=X
    → resolveCurrentOrNextProgramSession(stationId, presenterId)
      → Program → ProgramScheduleRule → slots → next occurrence
    → Returns: mode, gateOpen, countdown data
```

### 4.2 Audio State Guard Architecture
```text
manualStopRef (useRef<boolean>)
  ├── playNow()      sets true → stopFile() → playFile() → setTimeout(false, 100ms)
  ├── stopQueue()    sets true → stopFile() → setTimeout(playFile bg + false, 1100ms)
  ├── handleStopBg() sets true → stopFile() → setTimeout(false, 100ms)
  └── handleFileComplete() → if (manualStopRef.current) return; // blocked
```
