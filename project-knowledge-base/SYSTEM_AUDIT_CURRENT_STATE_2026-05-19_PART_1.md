# EGONAIR System Audit — Current State (Part 1 of 2)
**Date:** 2026-05-19  
**Audited by:** Antigravity Agent (read-only pass)  
**Source:** project-knowledge-base KB files + directory/file inspection  
**Next part:** PART_2 covers shared components, dangerous files, filters, media library, UI polish, next steps

---

## 1. Current Project Status

### ✅ Completed (verified and stable)

| Item | Evidence |
|------|----------|
| Auth / login (admin + presenter + station-manager) | KB: CURRENT_STATUS.md, FIX-012/013 VERIFIED |
| Logout redirect with basePath `/stream` | FIX-012 VERIFIED |
| Authenticated redirect with basePath | FIX-013 VERIFIED |
| Admin dashboard with real DB stats | CURRENT_STATUS.md §2.1 |
| Presenter CRUD (list, add, edit, delete) | KB confirmed |
| Presenter SonicPanel credentials (AES-256-GCM) | KB confirmed |
| Station CRUD + StationDefaultCredential | KB confirmed |
| Programs CRUD + schedule rules + slots + inline edit | KB confirmed |
| Schedule conflict detection (server-side) | AGENT_HANDOFF.md 2026-05-11 |
| Recording model + persistence on session end | Group 3 complete |
| Recording file serving API with HTTP Range | FIX-004, Group 4.1 |
| Admin recording archive with presenter filter | Group 4.2 |
| Presenter recording archive | Group 3.4 |
| Studio mixer (Web Audio API) | CURRENT_STATUS.md 2026-05-09 |
| Studio connect → mic → background → queue → SHOUTcast live | VERIFIED 2026-05-11 |
| Background duck ratio (BG_DUCK_RATIO=0.10) | VERIFIED 2026-05-11 |
| Background ↔ queue crossfade (3s/2s) | VERIFIED 2026-05-11 |
| Local file picker in studio (session-scoped) | Group 4.4 |
| Presenter upload API + UI (personal BREAK/AD) | VERIFIED by Akram 2026-05-09 |
| Admin upload API + UI (all 4 types) | VERIFIED 2026-05-09 |
| MULTI_STATION credential resolution (time-window) | AGENT_HANDOFF.md 2026-05-14 |
| DIRECT_DJ flow (DirectDjRadio → SHOUTcast) | KB confirmed |
| Station Manager role + dashboard | Directory confirmed |
| Station Manager programs view (scoped to station) | station-manager/programs/ confirmed |
| Station Manager recordings | station-manager/recordings/ confirmed |
| Profile / My account page | profile/ confirmed |
| Media library (4 types, station-aware, multi-station filter) | Session summary 2026-05-19 |
| Media library drag-drop reorder | Session summary 2026-05-19 |
| Media library bulk delete | Session summary 2026-05-19 |
| Media library batch upload | Session summary 2026-05-19 |
| MediaCategory.stationId (multi-station isolation) | Session summary 2026-05-19 |
| MiniPlayer audio playback fix | Session summary 2026-05-19 |
| White gap CSS fix (colorScheme dark) | 2026-05-19 session |
| Add Category form order (create before upload) | 2026-05-19 session |
| Wait-screen hydration fix | VERIFIED 2026-05-11 |
| Pre-flight hydration fix | VERIFIED 2026-05-11 |
| RecordingPlayer hydration fix | VERIFIED 2026-05-11 |
| Exit studio button (clean disconnect) | VERIFIED 2026-05-11 |
| Stale session watchdog (15s) | VERIFIED 2026-04-28 |
| Duplicate session guard (WS code 1008) | VERIFIED 2026-04-28 |
| WS → FFmpeg → SHOUTcast live pipeline end-to-end | VERIFIED 2026-04-28 |
| Per-presenter DB credentials (no env fallback in production) | VERIFIED 2026-04-28 |
| MP3 conversion on session end (WebM → MP3) | VERIFIED 2026-05-11 |
| Program time-limit (valid from/to date) | User confirmed in recent session |
| Admin media filter: smart multi-select dropdowns | Session summary 2026-05-19 |
| Admin media filter: StationMultiSelect + ownerType filter | Session summary 2026-05-19 |
| Schedule audit page | admin/schedule/audit/ confirmed |
| Direct DJ pre-flight screen | studio/direct-dj-pre-flight-screen.tsx confirmed |

---

### 🟡 Partially Complete

| Item | Missing |
|------|---------|
| Programs — time-limitation (valid from/to) | Added to schema but **audit needed**: does schedule gate and conflict detection respect validFrom/validTo? |
| Admin recordings page | Has presenter + station filters but **pagination** not confirmed on very large datasets |
| Admin schedule page | Schedule filter bar exists (340 lines) but smart-select/multi-select **not upgraded** to match new filter style |
| Station Manager — programs edit | Inline edit exists in `program-card.tsx` (392 lines) but unknown if conflict detection is wired for SM context |
| Debug log cleanup | `[DIAG]` console logs and `TEST FILE TO MIXER` button still present in `studio-ui.tsx` — never cleaned |
| Cloud deployment | Cloud Run frontend deployed at revision `egonair-frontend-00003-ccj` but **does NOT include any fixes since 2026-04-30** |
| `providers.tsx` | Orphan file on disk — not imported anywhere. Should be deleted but was never approved |

---

### 🔴 Open Issues

| Issue | Status |
|-------|--------|
| Cloud Run login broken | Auth.js basePath mismatch. FIX-022B (rebuild with `SKIP_BASEPATH=1`) never executed |
| `egonair-db-url` secret | Was fixed (FIX-011) but running image is stale — does not include this fix |
| `NEXTAUTH_URL` secret | Needs update to `https://egonair-frontend-kjvmkgy5va-ew.a.run.app/stream` |
| backend-audio not deployed to cloud | GCE VM for backend-audio never provisioned |
| `egonair-backend-audio-729286791857.europe-west1.run.app` DNS | DEPRECATED (Violates Diamond Rule) |
| Long endurance test (2+ hours) | Never done — memory leaks, buffer underruns unknown |
| Background volume calibration final verification | Logged as open in CURRENT_STATUS.md 2026-05-11 |
| Special/exception episode types | Not implemented (EXTRA_EPISODE, SPECIAL_EVENT, CANCELLED, RESCHEDULED) |
| Admin presenter password change UI | Logged as open — not implemented |
| `[DIAG]` console log cleanup in studio-ui.tsx | Not done |
| `TEST FILE TO MIXER` button removal | Not done |
| SQLite → PostgreSQL migration for production | Not started (Cloud SQL exists but local schema never migrated) |
| Station Manager — DJ settings page | `dj-settings/` directory exists — state UNKNOWN |
| Station Manager — presenters page | `presenters/` directory exists — state UNKNOWN |
| Station Manager — schedule page | `schedule/` directory exists — state UNKNOWN |
| Media library white input gap | Fixed in 2026-05-19 session (colorScheme:dark) — needs visual re-verification |

---

### ✅ Recently Fixed (2026-05-19 session)

| Fix | File |
|-----|------|
| setState-in-render bug in CategoryCard (drag-drop) | `admin/media/media-client.tsx` |
| Audio player URL resolution (`/stream/` prefix) | `admin/media/media-client.tsx` |
| White gap CSS (colorScheme:dark on root wrapper) | `admin/media/media-client.tsx` |
| Form card bg opacity (neutral-900/50 → neutral-900) | `admin/media/media-client.tsx` |
| Add Category form order (moved above track list) | `admin/media/media-client.tsx` |
| StationSingleSelect background color consistency | `admin/media/media-client.tsx` |
| MediaCategory.stationId schema + Prisma push | `prisma/schema.prisma` |
| bulkDeleteTracks server action | `admin/media/actions.ts` |
| reorderTracks server action | `admin/media/actions.ts` |
| createCategory scoped to stationId | `admin/media/actions.ts` |
| Media page multi-station query (AND/OR logic) | `admin/media/page.tsx` |
| StationMultiSelect searchable dropdown | `admin/media/media-client.tsx` |

---

### ⛔ Do NOT Reopen

| Rule | Reason |
|------|--------|
| Presenter + Station DJ credential override UI | Cancelled — see AGENT_HANDOFF.md 2026-05-11 CRITICAL PRODUCT RULE |
| `src/index-live-shoutcast-test.ts` | Archived proof-of-concept — do not modify or delete |
| Icecast | Project is SHOUTcast-only — see STREAMING_STRATEGY.md |
| `SonicPanelCredential` table deletion | Holds legacy data — do not drop |
| DIRECT_DJ presenters in programs/schedules | Forbidden — see AGENT_HANDOFF.md credential chain |
| SINGLE_STATION/MULTI_STATION personal DJ credentials | Forbidden — see AGENT_HANDOFF.md |
| Firebase/Firestore | Project is Prisma + SQLite/PostgreSQL only — FIX-006 |
| basePath inside NextAuth({}) config | Caused Cloud Build crash — FIX-016A was reverted |

---

### 🧪 Manual Tests Needed Next (in priority order)

1. **Media library visual re-verify** — confirm white gap and form order fixed on screen
2. **Programs valid-from/to** — verify schedule gate respects date limits
3. **Station Manager pages** — confirm DJ settings, presenters, schedule pages are functional
4. **Admin recordings pagination** — test with many recordings
5. **Debug log presence** — open studio and check console for `[DIAG]` logs
6. **Long endurance test** — 2+ hour live broadcast (memory, buffer, WS stability)
7. **Cloud login** — after FIX-022B is executed

---

## 2. Module Status Table

| Module | Status | Main Files | Known Risks | Next Action |
|--------|--------|-----------|-------------|-------------|
| **Auth / roles** | ✅ Complete | `src/auth.ts`, `src/proxy.ts`, `src/app/login/`, `src/app/login/actions.ts` | basePath fixed locally; Cloud still broken. Roles: ADMIN, PRESENTER, STATION_MANAGER | Cloud rebuild FIX-022B |
| **Admin dashboard** | ✅ Complete | `src/app/admin/page.tsx` (13,855 bytes) | Real DB stats. AutoDJ hardcoded "غير مفعّل" | None — AutoDJ is future scope |
| **Presenters** | ✅ Complete | `admin/presenters/page.tsx` (408L), `[id]/edit/page.tsx` (1115L), `new/page.tsx` (473L), `presenters-filter.tsx` (386L) | edit page is 1115 lines — largest non-studio file | Split edit page into sub-components eventually |
| **Stations** | ✅ Complete | `admin/stations/page.tsx` (688L), `actions.ts` (14,538 bytes), `stations-filter.tsx` | 688-line page carries full CRUD + filter + credential UI. No separate client component | Extract credential management sub-component |
| **Programs** | ✅ Complete + Partial | `admin/programs/page.tsx` (399L), `[id]/edit/page.tsx` (392L), `programs-filter.tsx` (333L), `[id]/edit/actions.ts` (421L) | Conflict detection wired. Valid-from/to added. Exception types not implemented | Verify valid-from/to in gate logic. Add exception types |
| **Recordings / archive** | ✅ Complete | `admin/recordings/page.tsx` (660L), `studio/recordings/`, `api/recordings/[filename]/route.ts` (328L), `api/internal/audio-session/ended/route.ts` (381L) | 660L page has inline filter logic + audio player + all formatting. HTTP Range supported | Paginate admin recordings. Extract RecordingCard component |
| **Media library** | ✅ Complete | `admin/media/page.tsx` (3,941 bytes), `media-client.tsx` (952L / 51KB), `actions.ts` (8,440 bytes) | `media-client.tsx` is 952 lines of mixed state/UI/DnD/bulk logic | Split into CategoryCard, TrackRow, BulkBar, AddCategoryForm sub-files |
| **Studio** | ✅ Complete (feature) | `studio/studio-ui.tsx` (2812L / 163KB), `studio/page.tsx` (340L), `studio/pre-flight-screen.tsx`, `studio/wait-screen.tsx`, `studio/direct-dj-pre-flight-screen.tsx` | `studio-ui.tsx` is the LARGEST file (2812 lines). Mixes: mixer, queue, recording, media, WebSocket, Direct DJ, SINGLE, MULTI logic. `[DIAG]` logs not cleaned | Do NOT split until cloud deployment done. After cloud: extract hooks |
| **SINGLE_STATION flow** | ✅ Complete | `src/lib/resolve-program-session.ts` (11,153 bytes), `studio/page.tsx`, `api/internal/audio-token/` | Credential chain: StationDefaultCredential (P2) | Verified live. Regression risk on any token/session change |
| **MULTI_STATION flow** | ✅ Complete | `src/lib/resolve-program-session.ts`, `api/internal/audio-token/`, `backend-audio/src/index.ts` | Time-window resolver picks station by active slot. Two stations active in DB (egonair + shammar) | Do not break time-window resolver. Regression test before cloud deploy |
| **DIRECT_DJ flow** | ✅ Complete | `studio/direct-dj-pre-flight-screen.tsx` (12,774 bytes), `profile/direct-dj-radios.tsx`, `api/internal/audio-token/validate` | DirectDjRadio → SHOUTcast (no station). Must not mix with station credential path | Profile DJ radios CRUD untouched — verify still functional |
| **Station Manager flow** | 🟡 Partial | `station-manager/page.tsx` (398L), `station-manager/programs/` (3 files), `station-manager/recordings/page.tsx` (375L), `station-manager/dj-settings/`, `station-manager/presenters/`, `station-manager/schedule/` | dj-settings, presenters, schedule sub-pages: STATE UNKNOWN from KB | Audit SM sub-pages: dj-settings, presenters, schedule |

---

## Appendix: File Size Reference (top 25 by line count)

| Lines | File |
|-------|------|
| 2812 | `studio/studio-ui.tsx` ← ⚠️ CRITICAL |
| 1115 | `admin/presenters/[id]/edit/page.tsx` |
| 952  | `admin/media/media-client.tsx` |
| 688  | `admin/stations/page.tsx` |
| 660  | `admin/recordings/page.tsx` |
| 473  | `admin/presenters/new/page.tsx` |
| 439  | `admin/schedule/audit/page.tsx` |
| 421  | `admin/programs/[id]/edit/actions.ts` |
| 420  | `admin/station-managers/page.tsx` |
| 408  | `admin/presenters/page.tsx` |
| 399  | `admin/schedule/page.tsx` |
| 398  | `station-manager/page.tsx` |
| 392  | `station-manager/programs/program-card.tsx` |
| 392  | `admin/programs/[id]/edit/page.tsx` |
| 389  | `src/components/recordings/RecordingPlayer.tsx` |
| 386  | `admin/presenters/presenters-filter.tsx` |
| 381  | `api/internal/audio-session/ended/route.ts` |
| 377  | `profile/page.tsx` |
| 375  | `station-manager/recordings/page.tsx` |
| 358  | `admin/presenters/[id]/delete/actions.ts` |
| 340  | `studio/page.tsx` |
| 340  | `admin/schedule/schedule-filter-bar.tsx` |
| 333  | `admin/programs/programs-filter.tsx` |
| 328  | `api/recordings/[filename]/route.ts` |
| 327  | `station-manager/programs/actions.ts` |

---

*End of Part 1. See PART_2 for: Shared components, Dangerous files, Filters audit, Media library state, UI polish readiness, Next order, full tables.*
