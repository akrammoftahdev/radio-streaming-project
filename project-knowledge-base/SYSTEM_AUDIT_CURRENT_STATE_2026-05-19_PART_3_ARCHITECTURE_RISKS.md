# EGONAIR System Audit — Part 3: Architecture + Risk Files
**Date:** 2026-05-19 | **Read-only audit**

---

## 1. Dangerous / Overgrown Files

### studio-ui.tsx — CRITICAL
- **Path:** `frontend/src/app/studio/studio-ui.tsx`
- **Lines:** 2,812 | **Size:** 163 KB
- **Mixed responsibilities:** Web Audio API mixer, WebSocket lifecycle, queue management, background duck/crossfade, local file picker, SINGLE/MULTI/DIRECT_DJ branching, recording triggers, heartbeat, `[DIAG]` debug logs, `TEST FILE TO MIXER` dev button, media library 4-tab UI, queue panel UI, mic device selector, background fader
- **Why risky:** 2,812 lines. Any edit risks breaking live pipeline, mixer, or WebSocket. No automated tests.
- **Recommended split (after cloud deploy):** `useAudioMixer.ts`, `useWebSocketSession.ts`, `useMediaQueue.ts`, `useLocalFiles.ts`, `StudioMediaPanel.tsx`, `StudioNowPlaying.tsx`, `StudioQueuePanel.tsx`
- **Touch now?** NO

### admin/presenters/[id]/edit/page.tsx
- **Lines:** 1,115
- **Mixed:** Presenter form, SonicPanel credential UI (AES-256-GCM), station assignment, validity settings — all in one page file
- **Recommended split:** `PresenterCredentialForm`, `PresenterValidityForm`, `PresenterStationAssignment`
- **Touch now?** NO

### admin/media/media-client.tsx
- **Lines:** 952 | **Size:** 51 KB
- **Mixed:** CategoryCard, TrackRow, AddCategoryForm, AddTrackForm, StationSingleSelect, StationMultiSelect, MiniPlayer, drag-drop, bulk delete bar, batch upload progress, pagination, filter bar — all one file
- **Risk:** File had edit corruption on 2026-05-19 (orphaned lines during refactor). Recently stabilized.
- **Recommended split:** `CategoryCard.tsx`, `TrackRow.tsx`, `AddCategoryForm.tsx`, `MediaMiniPlayer.tsx`, `MediaBulkBar.tsx`, `StationSelect.tsx` (shared)
- **Touch now?** LOW PRIORITY — stabilize first

### admin/stations/page.tsx
- **Lines:** 688
- **Mixed:** Station list, CRUD modals, StationDefaultCredential management, filter, presenter assignment — all inline
- **Touch now?** NO

### admin/recordings/page.tsx
- **Lines:** 660
- **Mixed:** List, 4 separate filter component imports, audio player inline, download actions, formatting helpers inline
- **Note:** `RecordingPlayer` component exists at `src/components/recordings/RecordingPlayer.tsx` (389L) — may not be used here
- **Touch now?** LOW

### api/internal/audio-session/ended/route.ts
- **Lines:** 381
- **Mixed:** Close LiveSession + create Recording row + resolve stationId + MP3 trigger + non-fatal error handling
- **Recommended split:** Extract `createRecordingRow()` to `src/lib/recording-helpers.ts`
- **Touch now?** NO

### profile/page.tsx + direct-dj-radios.tsx
- **Lines:** 377 + ~200
- **Mixed:** Account settings + DJ credential CRUD + avatar upload
- **Touch now?** NO

### api/internal/audio-token/validate + create
- **Critical security path.** Credential chain P1→P2→P3→P4 documented in AGENT_HANDOFF.md
- **Touch now?** NO — do not touch without explicit plan

---

## 2. Architecture Rule Check

### A) Shared UI Should Be Global

| Rule | Status | Evidence |
|------|--------|---------|
| Filters global | VIOLATED | Each page has own filter components |
| Pagination global | VIOLATED | Only media-client.tsx has pagination |
| Smart selects global | VIOLATED | SmartSelect only in media-client.tsx |
| Segmented buttons global | VIOLATED | Inline per page |
| Cards global | VIOLATED | Each page defines own card styles |
| Empty states global | VIOLATED | Different inline per page |
| Success/error banners global | VIOLATED | URL-param `slotError` pattern only |
| Theme tokens | PARTIAL | Tailwind neutral-* used consistently, no CSS custom properties |
| Light/dark mode support | VIOLATED | Admin pages dark-only, no toggle |

### B) Business Logic Should Be Isolated

| Rule | Status | Evidence |
|------|--------|---------|
| Direct DJ separate | PARTIAL | `direct-dj-pre-flight-screen.tsx` exists but branches also in studio-ui.tsx |
| Single-station separate | NOT ISOLATED | Merged into studio-ui.tsx + resolve-program-session.ts |
| Multi-station separate | NOT ISOLATED | Time-window resolver not separated from single-station |
| Recording creation separate | PARTIAL | `recording-helpers.ts` exists but most logic in `ended/route.ts` (381L) |
| Token logic separate | ISOLATED | `src/lib/audio-token.ts` + validate/create routes — correct |
| Media station-aware | ISOLATED | `admin/media/` — stationId scoping in page.tsx + actions.ts |
| SM scope logic | PARTIAL | Per-page Prisma queries — not centralized |

### C) Old System Not Deleted Before New Proven
| Rule | Status |
|------|--------|
| SonicPanelCredential preserved | CORRECT |
| index-live-shoutcast-test.ts preserved | CORRECT |
| VPS deployment plan preserved | CORRECT |

### D) Fallback / Rollback Exists
| Area | Status |
|------|--------|
| Credential chain (P1→P4) | PASS — graceful null handling |
| Recording creation | PASS — non-fatal, session always closes |
| SHOUTcast flag | PASS — ENABLE_SHOUTCAST_LIVE env flag |
| Cloud Run revision | PASS — old revision preserved |
| Media library 2026-05-19 | RISK — no backup taken after session edits |

---

## 3. Scenario Separation

| Scenario | Isolated? | Shared Code | Leakage Risk |
|----------|-----------|-------------|-------------|
| SINGLE_STATION | No | resolve-program-session.ts, studio-ui.tsx | Mixed with MULTI in same functions |
| MULTI_STATION | No | resolve-program-session.ts (time-window) | Mixed with SINGLE in same file |
| DIRECT_DJ | Partial | direct-dj-pre-flight-screen.tsx separate; branches in studio-ui.tsx | Credential path isolated in validate |
| Station Manager | Partial | Separate pages; scoping per-page query | New SM pages risk forgetting scope |

**Next safe direction:** After cloud deploy — extract `SingleStationStudio`, `MultiStationStudio`, `DirectDjStudio` entry points. Keep shared mixer in hooks.

---

## 4. Business Logic Isolation

| Logic | Location | Isolated? | Risk |
|-------|----------|-----------|------|
| Recording creation | ended/route.ts (381L) + recording-helpers.ts | Partial | Silent failures |
| Token create | api/internal/audio-token/create | Yes | Critical |
| Token validate | api/internal/audio-token/validate | Yes | Critical |
| Media station-aware | admin/media/ | Yes | Stable |
| Studio live connect | studio-ui.tsx (inline) | No | Highest risk |
| Direct DJ radio CRUD | profile/direct-dj-radios.tsx | Partial | Credential inline |
| SM scope | Per-page Prisma queries | No | Scope forgetting risk |
| Encryption/decryption | src/lib/encryption.ts | Yes | FIX-009 — do not touch |

---

## 5. Safe Architecture Cleanup Plan

| Phase | Scope | Risk | Fallback |
|-------|-------|------|----------|
| 1 — Audit complete | Read-only | None | N/A |
| 2 — Stabilize | Media library verify + browser test | Low | Git history |
| 3 — Build new beside old | src/components/ui/ | Low | Old code untouched |
| 4 — Pilot one page | Admin Programs list | Low | Revert one file |
| 5 — Migrate admin pages | All admin list pages | Medium | Per-file revert |
| 6 — Cloud deploy | After local 100% confirmed | Medium | Old Cloud Run revision |
| 7 — Studio split | studio-ui.tsx → hooks | High — do last | Keep studio-ui.tsx as backup |

---

## 6. Tables

### Dangerous Files Table

| File | Lines | Why Risky | Split Direction | Touch Now? |
|------|-------|-----------|----------------|-----------|
| studio/studio-ui.tsx | 2,812 | 10+ mixed responsibilities | useAudioMixer, useWebSocketSession, useMediaQueue, panels | NO |
| admin/presenters/[id]/edit/page.tsx | 1,115 | Credential logic in page file | PresenterCredentialForm sub-components | NO |
| admin/media/media-client.tsx | 952 | All media UI + logic in one file | CategoryCard, TrackRow, StationSelect | LOW |
| admin/stations/page.tsx | 688 | CRUD + credentials inline | StationCard, StationCredentialForm | NO |
| admin/recordings/page.tsx | 660 | 4 filter files + all UI inline | Use RecordingPlayer component | LOW |
| api/internal/audio-session/ended | 381 | Recording + session mixed | Extract createRecordingRow() to lib/ | NO |
| admin/schedule/schedule-filter-bar.tsx | 340 | Pre-existing TS warnings | Replace with FilterShell | NO |

### Architecture Violations Table

| Rule | Violated? | Where | Fix Direction |
|------|-----------|-------|---------------|
| Filters global | Yes | All pages | Build FilterShell + SmartSelect |
| Business logic isolated | Partial | studio-ui.tsx mixes all scenarios | Extract hooks post-cloud |
| Smart selects global | Yes | Only in media-client.tsx | Extract to src/components/ui/ |
| Pagination global | Yes | Only in media-client.tsx | Extract PaginationBar |
| Empty states global | Yes | Inline per page | EmptyState component |
| SM scope centralized | No | Per-page Prisma queries | Create useSMScope helper |

---
*End of Part 3. See Part 4 for Media Library state, UI polish, and next order.*
