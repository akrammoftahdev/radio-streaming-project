# SRS Addendum — May 28, 2026 (Part 2)

This addendum documents new requirements from the mobile studio audit and queue/background audio redesign.

---

## 15. Mobile Presenter Mode — UX Requirements

### 15.1 SINGLE_STATION Presenter
- **Dashboard:** No station dropdown. Schedule auto-fetched for the single assigned station.
- **Countdown:** ALWAYS visible if a next program exists, regardless of temporal distance (1 hour or 7 days — doesn't matter).
- **Gate button:** "دخول الاستوديو" always rendered, enabled only when `gateOpen === true` (i.e., `allowConnectMinutesBefore` minutes before scheduled start).
- **Recordings:** Last 10 session recordings shown at bottom of dashboard.
- **Blocked state:** If `NO_SCHEDULE` mode, show "لا يوجد موعد بث" with back button. Do NOT allow studio access.

### 15.2 MULTI_STATION Presenter
- **Dashboard:** Station dropdown list. After selecting a station, same schedule/countdown/gate logic as SINGLE_STATION.
- **Dropdown persistence:** Stays visible for switching between stations.

### 15.3 DIRECT_DJ Presenter
- **Dashboard:** Radio list with per-radio "بث" (broadcast) button.
- **No schedule logic:** Enter anytime, no countdown, no gate.
- **Direct routing:** Tap "بث" → go directly to studio for that radio.

---

## 16. Schedule API — Unified Resolution

### 16.1 Requirement
The mobile `/api/mobile/schedule` route MUST use `resolveCurrentOrNextProgramSession()` from `src/lib/resolve-program-session.ts` — the same function the web studio uses.

### 16.2 Rationale
The legacy `BroadcastSchedule` table is no longer the source of truth. Programs created via admin/programs use `Program → ProgramScheduleRule → Slot`. Using the legacy table means new programs are invisible to mobile.

### 16.3 Response Schema
```typescript
{
  mode: "SCHEDULED" | "DIRECT_DJ" | "NO_SCHEDULE",
  scheduledStartTime: string | null,     // ISO 8601
  sessionEndTime: string | null,         // ISO 8601
  allowConnectMinutesBefore: number,     // default 5
  gateOpen: boolean,
  programTitle: string | null,
  stationName: string | null
}
```

---

## 17. Queue/Background Audio — State Guard Requirement

### 17.1 Requirement
ALL calls to `LiveAudioStream.stopFile()` MUST be wrapped in a guard that prevents `onFileComplete` from processing during the stop→start transition.

### 17.2 Guard Pattern
```typescript
const manualStopRef = useRef(false);

// Before stopFile:
manualStopRef.current = true;
LiveAudioStream.stopFile();
// ... start new track ...
setTimeout(() => { manualStopRef.current = false; }, 100);

// In handleFileComplete:
if (manualStopRef.current) return;
```

### 17.3 Why 100ms setTimeout
Native bridge events (`onFileComplete`) fire asynchronously on the next event loop tick. A synchronous guard release (no setTimeout) is already `false` by the time the callback runs.

### 17.4 Protected Call Sites
Any function that calls `stopFile()` MUST follow this pattern:
- `playNow()` — switching queue tracks
- `stopQueue()` — manual queue stop + background restore
- `handleStopBg()` — removing background music

---

## 18. Stations API — presenterMode Field

### 18.1 Requirement
`GET /api/mobile/stations` MUST include the authenticated user's `presenterMode` in the response payload.

### 18.2 Response Schema
```typescript
{
  stations: Array<{ id, name, logo, mountPoint }>,
  presenterMode: "SINGLE_STATION" | "MULTI_STATION" | "DIRECT_DJ" | null
}
```

### 18.3 Derivation Logic
- 0 stations → `null`
- 1 station + has active program with schedule rules → `"SINGLE_STATION"`
- 1 station + no program/no rules → `"DIRECT_DJ"`
- 2+ stations → `"MULTI_STATION"`

---

## 19. VirtualizedList Ban in ScrollView

### 19.1 Requirement
`FlatList`, `SectionList`, and other `VirtualizedList`-backed components MUST NOT be nested inside `ScrollView` with the same scroll direction.

### 19.2 Alternative
For lists with fewer than 50 items, use `Array.map()` to render items directly.

### 19.3 Rationale
React Native logs a warning and can crash silently on iOS 16.x when VirtualizedList windowing conflicts with the parent ScrollView's scroll events.
