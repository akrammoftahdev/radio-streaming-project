# Knowledge Base Update: May 28, 2026 (Afternoon Session)

## Overview
Major session covering: **mobile studio audit & redesign**, **schedule API migration**, **queue/background audio cascade bug fix**. Three categories of work: (1) API migration from legacy BroadcastSchedule to new ProgramScheduleRule system, (2) mobile dashboard UX redesign by presenter type, (3) critical audio state management bug in queue/background interaction.

---

## 1. Mobile Studio Audit — 8 Bugs Found

Full audit comparing web studio (works correctly) vs mobile studio (8 bugs):

| # | Bug | Severity | Fixed? |
|---|-----|----------|--------|
| 1 | ALL presenter types see station selector dropdown | HIGH | ✅ |
| 2 | No schedule check before studio access | HIGH | ✅ |
| 3 | Programs created via admin/programs INVISIBLE to mobile (uses legacy `BroadcastSchedule` instead of new `ProgramScheduleRule`) | 🚨 CRITICAL | ✅ |
| 4 | Audio token has zero schedule validation | HIGH | TODO (P3) |
| 5 | VirtualizedList crash (FlatList inside ScrollView) | MEDIUM | ✅ |
| 6 | `allowConnectMinutesBefore` default 10 instead of 5 | LOW | ✅ |
| 7 | `NO_SCHEDULE` skips wait screen instead of blocking | MEDIUM | ✅ |
| 8 | No `presenterMode` awareness on dashboard | MEDIUM | ✅ |

---

## 2. Schedule API Migration (CRITICAL Fix)

### Problem
`/api/mobile/schedule/route.ts` queried the **legacy** `BroadcastSchedule` table. Programs created via the new admin/programs UI (which uses `Program → ProgramScheduleRule → Slot`) were invisible to mobile.

### Fix
Rewrote the route to use `resolveCurrentOrNextProgramSession()` — the same function the web studio uses. Now returns:
```json
{
  "mode": "SCHEDULED | DIRECT_DJ | NO_SCHEDULE",
  "scheduledStartTime": "ISO | null",
  "sessionEndTime": "ISO | null",
  "allowConnectMinutesBefore": 5,
  "gateOpen": true | false,
  "programTitle": "string | null",
  "stationName": "string | null"
}
```

**File:** `frontend/src/app/api/mobile/schedule/route.ts`

---

## 3. Stations API — Added presenterMode

### Problem
The mobile app didn't know the user's presenter type, so it showed the same dropdown for everyone.

### Fix
`/api/mobile/stations/route.ts` now returns `{ stations: [...], presenterMode: "SINGLE_STATION" | "MULTI_STATION" | "DIRECT_DJ" | null }`.

**File:** `frontend/src/app/api/mobile/stations/route.ts`

---

## 4. Mobile Dashboard Redesign by Presenter Type

### SINGLE_STATION
- **No dropdown** — auto-fetches schedule for the single station
- Shows countdown (always, if next program exists, regardless of distance)
- "دخول الاستوديو" button: always visible, enabled only when gate opens
- Old recordings (last 10) at bottom

### MULTI_STATION
- Station dropdown → after selecting, same schedule/countdown logic as SINGLE_STATION
- Dropdown stays visible for switching

### DIRECT_DJ
- Radio list with per-radio "بث" button
- No countdown, no schedules — enter anytime

**File:** `mobile-app/src/app/index.tsx` — complete rewrite

---

## 5. VirtualizedList Crash Fix

### Problem
`FlatList` nested inside `ScrollView` causes React Native warning and crashes.

### Fix
Replaced all `FlatList` with `.map()` in:
- `mobile-app/src/app/index.tsx` (station list)
- `mobile-app/src/components/studio/RecordingMiniPlayer.tsx` (recordings list)

Both lists are max 10 items — virtualization unnecessary.

---

## 6. NO_SCHEDULE Blocking

### Problem
`NO_SCHEDULE` mode skipped the wait screen entirely, letting presenters without programs access the studio.

### Fix
- `[stationId].tsx`: Only `DIRECT_DJ` skips wait screen. `NO_SCHEDULE` shows a blocked screen with "لا يوجد موعد بث" and a back button.

---

## 7. Queue/Background Audio Cascade Bug — CRITICAL

### Problem (onFileComplete cascade)
`LiveAudioStream.stopFile()` fires the native `onFileComplete` event. The `handleFileComplete` handler interprets this as "track finished naturally" and tries to auto-advance the queue, conflicting with the manual stop operation.

### Symptoms
- Press play on queue item → equalizer shows 1 second → reverts to play button → song keeps playing
- Stop queue → background never resumes
- Rapid-fire `[QUEUE] File complete — auto-advancing...` messages in logs

### Root Cause
`stopFile()` is a native call that fires `onFileComplete` **asynchronously** via the React Native bridge. The callback runs on the **next event loop tick**. A synchronous guard (`manualStopRef.current = true/false`) gets released before the callback fires.

### Fix
Added `manualStopRef` guard with **async release** (`setTimeout 100ms`) to ALL `stopFile()` call sites:

```typescript
const manualStopRef = useRef(false);

// Every stopFile call:
manualStopRef.current = true;           // guard ON
LiveAudioStream.stopFile();             // fires onFileComplete async
LiveAudioStream.playFile(newTrack);     // start new track
setTimeout(() => { manualStopRef.current = false; }, 100); // release AFTER callback

// handleFileComplete:
if (manualStopRef.current) return;      // blocked during manual operations
```

### Guarded call sites (4 total):
1. `playNow()` — bg path (inside 550ms setTimeout)
2. `playNow()` — no-bg path
3. `stopQueue()` — manual stop + bg restore
4. `handleStopBg()` — remove background

### Key Learning
**Native bridge events are asynchronous.** Never use synchronous flag set/reset around native calls that emit events. Always use `setTimeout` to keep the guard up through at least the next event loop tick.

**File:** `mobile-app/src/app/studio/[stationId].tsx`

---

## 8. Web Studio — Recording Archive Pagination

Implemented server-side pagination, filtering, and sorting for `/studio/recordings`:
- 20 recordings per page
- Filter by: date range, station, program
- Sort by: date, duration, station
- Arabic UI

**File:** `frontend/src/app/studio/recordings/page.tsx`

---

## 9. Admin Programs Fix

Fixed production crash (`Error 2028940530`) on `/admin/programs` — Server Component simplification resolved the build error.

**File:** `frontend/src/app/admin/programs/page.tsx`

---

## 10. Files Modified (May 28 Afternoon)

| File | Changes |
|---|---|
| `frontend/src/app/api/mobile/schedule/route.ts` | Complete rewrite — uses `resolveCurrentOrNextProgramSession()` |
| `frontend/src/app/api/mobile/stations/route.ts` | Added `presenterMode` to response |
| `mobile-app/src/app/index.tsx` | Complete rewrite — 3 presenter type branches |
| `mobile-app/src/app/studio/[stationId].tsx` | NO_SCHEDULE blocking, allowConnect default fix, `manualStopRef` guard |
| `mobile-app/src/components/studio/RecordingMiniPlayer.tsx` | FlatList → map() |
| `mobile-app/src/components/studio/WaitScreen.tsx` | allowConnect default 10→5 |
| `frontend/src/app/studio/recordings/page.tsx` | Pagination/filtering |
| `frontend/src/app/admin/programs/page.tsx` | Production crash fix |
