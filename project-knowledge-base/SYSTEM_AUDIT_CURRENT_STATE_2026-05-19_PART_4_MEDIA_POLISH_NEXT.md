# EGONAIR System Audit — Part 4: Media Library + UI/UX Polish + Next Order
**Date:** 2026-05-19 | **Read-only audit**

---

## 1. Media Library Current State

### System-Wide vs Station-Aware
- **Current state:** Station-aware as of 2026-05-19 session
- `MediaCategory` now has `stationId` (nullable) — `null` = global/shared, non-null = station-scoped
- `MediaTrack` is linked to `MediaCategory` — inherits station scope via category
- All queries in `admin/media/page.tsx` filter by `stationId` array (multi-station aware)
- Before 2026-05-19: categories had `ownerType (ADMIN/PRESENTER)` + `ownerId` only — no stationId

### Admin Media (ADMIN-managed tracks)
- **Types supported:** BACKGROUND, SONG, BREAK, AD
- **ownerType:** ADMIN
- **stationId:** Can be null (global) or a specific stationId (station-only)
- **Status:** Complete

### Station-Scoped Media
- Admin can create a category assigned to a specific station
- Only that station's media appears when filtering by station
- Global categories (stationId=null) appear for all stations
- **Status:** Complete — implemented 2026-05-19

### Presenter Media
- Presenters can upload personal BREAK and AD tracks
- These have `ownerType=PRESENTER`, `ownerId=presenterId`
- Visible in Studio UI under personal sections ("فواصلي الشخصية", "إعلاناتي الشخصية")
- **Status:** Complete

### Direct DJ Relevance
- DIRECT_DJ presenters use the same Studio media panel
- No separate Direct DJ media library
- Direct DJ can use any admin media accessible to their station (if stationId matches)
- **Risk:** If a DirectDjRadio has no stationId link, station-scoped media filtering may exclude needed tracks — UNKNOWN without testing

### Categories
- Created via "Add Category" form (now at top of page — UX fix 2026-05-19)
- Fields: name, type (BACKGROUND/SONG/BREAK/AD), stationId (optional), ownerType
- Drag-drop reorder supported (server-side persistence via `reorderCategories` action)
- **Status:** Complete

### Tracks
- Upload via file picker (single or batch)
- Fields: name, file, category assignment
- Bulk delete supported via checkbox selection
- Drag-drop reorder within category supported
- **Status:** Complete

### Upload
- Single file: works
- Batch upload (multi-file): works — progress shown per file
- File types accepted: mp3, mpeg, wav
- Size limit: configured in server action (exact limit UNKNOWN without reading actions.ts)
- **Status:** Complete

### Bulk Delete
- Checkbox selection of tracks
- Bulk delete bar appears when tracks selected
- Server action: `bulkDeleteTracks` — added 2026-05-19
- **Status:** Complete

### Drag/Drop Reorder
- HTML5 drag/drop
- Category reorder: `reorderCategories` server action
- Track reorder within category: `reorderTracks` server action
- setState-in-render bug fixed 2026-05-19 (decoupled state from server actions)
- **Status:** Complete

### Playback (MiniPlayer)
- Audio player for each track in admin media library
- URL fixed 2026-05-19 — was missing `/stream/` basePath prefix
- **Status:** Complete (fix verified in session)

### Station Filtering
- Smart multi-select dropdown (StationMultiSelect) — new in 2026-05-19
- Searchable, multi-station capable
- Also: ownerType filter (Admin/Presenter segmented button)
- Also: search by track name
- **Status:** Complete

### ownerType / ownerId / stationId Logic

| Field | Location | Purpose |
|-------|----------|---------|
| `ownerType` | MediaCategory | ADMIN or PRESENTER |
| `ownerId` | MediaCategory | null for ADMIN, presenterId for PRESENTER |
| `stationId` | MediaCategory | null = global, stationId = station-scoped |

- Query logic: `OR [ stationId IN [selected], stationId IS NULL ]` when filtering
- Bug history: AND/OR collision fixed in current session

### Files Controlling Media Library

| File | Role |
|------|------|
| `admin/media/page.tsx` | Server component — fetches categories + tracks, passes to client |
| `admin/media/media-client.tsx` | 952L client component — all UI, state, drag-drop, bulk, player |
| `admin/media/actions.ts` | Server actions — create/delete/reorder categories and tracks |
| `prisma/schema.prisma` | MediaCategory + MediaTrack models |
| `api/tracks/[id]/route.ts` | Track file serving API (used by Studio UI for playback) |

### What Must Not Break
- `stationId` null = global — must remain accessible to ALL stations
- `ownerType=PRESENTER` tracks must NOT appear in admin-only filter mode
- Audio player URL must include `/stream/` basePath prefix
- Drag-drop reorder state must not trigger setState-in-render (decoupled fix must stay)
- Batch upload must not block UI thread (progress indicator must remain)

---

## 2. UI/UX Polish Readiness

### Pages Ready for Visual Polish (architecture stable)

| Page | Notes |
|------|-------|
| Admin Dashboard (`/admin`) | Simple stat cards. Ready. |
| Admin Presenters list | Filter bar + card list pattern. Ready after shared filter built. |
| Admin Stations list | Ready structurally. Large page (688L). |
| Admin Programs list | Ready. Filter bar. |
| Admin Recordings | Ready. RecordingPlayer component exists. |
| Admin Media Library | Stable after 2026-05-19 fixes. Ready. |
| Station Manager Dashboard | Ready for polish after SM sub-pages audited. |
| Studio Pre-flight screen | Stable. Ready. |
| Studio Wait screen | Stable. Ready. |
| Login page | Simple. Ready. |
| Profile / My Account | Stable. Ready. |

### Pages Needing Architecture Cleanup Before Polish

| Page | Blocker |
|------|---------|
| Studio UI (`studio-ui.tsx`) | 2,812L — must extract hooks first. Do NOT polish before split. |
| Admin Presenters Edit | 1,115L — should extract sub-forms before polish. |
| Admin Schedule | schedule-filter-bar.tsx has pre-existing TS warnings. |
| SM Programs | No filter bar. Architecture incomplete. |
| SM DJ Settings | State UNKNOWN — audit needed. |
| SM Schedule | State UNKNOWN — audit needed. |

### Pages With Too Much Data/Noise (need component extraction first)

| Page | Issue |
|------|-------|
| `admin/recordings/page.tsx` (660L) | 4 filter components + audio + download all inline |
| `admin/stations/page.tsx` (688L) | Credential UI + CRUD inline |
| `admin/media/media-client.tsx` (952L) | All media logic in one file |

### Recommended Reference Pages (use as design pattern baseline)

1. **Admin Dashboard** — simplest, cleanest card pattern
2. **Admin Presenters list** — good filter + card list + action buttons pattern
3. **Studio Pre-flight screen** — clean RTL dark UI, step-based layout
4. **Admin Recordings** — good for complex multi-filter + list pattern
5. **Media Library** — good for bulk actions + tabs + upload pattern

---

## 3. Global Branding / Theme Requirements

These are product requirements identified for future admin-controlled branding:

| Requirement | Type | Notes |
|-------------|------|-------|
| System name (e.g. "EGONAIR") changeable by admin | Feature | DB setting or config file |
| System logo uploadable by admin | Feature | Replace default logo across all pages |
| Favicon / app icon | Feature | Generated from logo |
| Support phone number | Feature | Shown in footer or help pages |
| WhatsApp support number | Feature | Deep link to wa.me |
| Support email | Feature | Shown in footer or help pages |
| Light mode | Feature | Currently dark-only — no toggle |
| Dark mode | Feature | Current default |
| Admin-controlled colors for light theme | Feature | Primary, accent, surface colors |
| Admin-controlled colors for dark theme | Feature | Primary, accent, surface colors |
| Design tokens inherited across pages | Architecture | CSS custom properties (--color-primary etc.) |
| RTL/LTR per language | Architecture | Arabic RTL currently hardcoded |

### Current Theme State
- **Mode:** Dark only (`bg-neutral-950`, `text-white` pattern throughout)
- **Color palette:** Tailwind neutral-* + indigo + amber + rose + emerald inline — no CSS custom properties
- **Fonts:** UNKNOWN — likely system default (no Google Fonts import found in audit)
- **RTL:** Arabic RTL hardcoded in `dir="rtl"` on root layout
- **colorScheme fix:** `style={{ colorScheme: "dark" }}` added to media library root wrapper (2026-05-19) — not applied globally yet

### Risk: colorScheme Not Applied Globally
The `colorScheme: "dark"` fix was only applied to `admin/media/media-client.tsx`. All other admin pages may still show light-colored native browser inputs (date pickers, file inputs, select dropdowns) when viewed in Chrome. This should be applied to the root layout or all admin pages.

---

## 4. Design Matching Strategy

**No implementation code. Sequence only.**

1. **Choose 3–5 reference pages** — Admin Dashboard, Admin Presenters list, Studio Pre-flight (already identified above)
2. **Extract design tokens** — Define CSS custom properties: `--color-surface`, `--color-primary`, `--color-accent`, `--color-danger`, `--color-text`, `--radius-card`, `--shadow-card`
3. **Apply to reference pages** — Update the 3–5 chosen pages to use tokens. Verify visually.
4. **Build global components** — EmptyState, StatusBadge, ActionButton, AdminListLayout using tokens
5. **Apply to remaining pages one by one** — Programs → Stations → Recordings → Media → SM pages → Studio
6. **Do NOT manually polish 35 screens separately** — always use the component system. Every screen gets polish automatically when the component is updated.

---

## 5. Recommended Next Order

**Sequence only — no time estimates:**

1. **Verify media library 2026-05-19 fixes** — Open browser, check white gap is gone, audio plays, Add Category form is at top, drag-drop works
2. **Audit SM sub-pages** — Inspect `station-manager/dj-settings/`, `station-manager/presenters/`, `station-manager/schedule/` to determine if broken or partial
3. **Apply colorScheme:dark globally** — Add to root admin layout so all native inputs render dark
4. **Create shared EmptyState + StatusBadge components** — Lowest risk, high impact, no page logic changes
5. **Create FilterShell + SearchFilter + SmartSelect** — Build in `src/components/ui/` beside existing code
6. **Pilot shared filters on Admin Programs page** — Low-risk page, replace existing filter component
7. **Expand shared filters to Admin Presenters → Stations → Recordings**
8. **Create AdminListLayout wrapper** — Apply to all admin list pages
9. **Apply design tokens** — CSS custom properties, apply to reference pages first
10. **Polish Studio UI** — Only after all other pages stable
11. **Mobile compatibility pass** — After visual polish complete
12. **Cloud deployment** — FIX-022B rebuild after local 100% confirmed

---

## 6. Tables

### Media Library Status Table

| Feature | Status | Files | Risk |
|---------|--------|-------|------|
| 4 media types (BG/SONG/BREAK/AD) | Complete | media-client.tsx, actions.ts | None |
| Station-scoped categories (stationId) | Complete | schema.prisma, page.tsx, actions.ts | stationId=null must stay global |
| Global categories (stationId=null) | Complete | page.tsx query | Must not break after filtering |
| Category drag-drop reorder | Complete | media-client.tsx | setState-in-render fix must not revert |
| Track drag-drop reorder | Complete | media-client.tsx, actions.ts | Same |
| Batch upload | Complete | media-client.tsx, actions.ts | Progress UI must remain |
| Bulk delete | Complete | media-client.tsx, actions.ts | Checkbox state tied to category cards |
| MiniPlayer audio | Complete (fixed 05-19) | media-client.tsx | /stream/ prefix must be maintained |
| StationMultiSelect filter | Complete | media-client.tsx | — |
| ownerType segmented filter | Complete | media-client.tsx | — |
| Add Category form position (top) | Complete (fixed 05-19) | media-client.tsx | Do not reorder again |
| White gap CSS | Complete (fixed 05-19) | media-client.tsx | colorScheme:dark fix must not revert |
| Presenter personal media upload | Complete | Separate upload API | — |
| Admin upload | Complete | actions.ts | — |

### Polish Readiness Table

| Page | Ready to Polish? | Blocker if No |
|------|-----------------|--------------|
| Admin Dashboard | Yes | — |
| Admin Presenters list | Yes (after shared filters) | Build shared filter first |
| Admin Stations | Yes (after shared filters) | Build shared filter first |
| Admin Programs | Yes (after shared filters) | Build shared filter first |
| Admin Recordings | Yes (after RecordingPlayer refactor) | — |
| Admin Media Library | Yes | — |
| Admin Schedule | No | TS warnings in filter bar |
| SM Dashboard | Yes | SM sub-pages audit first |
| SM Programs | No | No filter bar, architecture incomplete |
| SM DJ Settings | Unknown | Audit first |
| Studio Pre-flight | Yes | — |
| Studio Wait | Yes | — |
| Studio UI | No | Extract hooks from 2,812L file first |
| Login | Yes | — |
| Profile | Yes | — |

### Global Theme/Branding Requirements Table

| Requirement | Current State | Priority |
|-------------|--------------|---------|
| Admin-changeable system name | Hardcoded "EGONAIR" | Medium |
| Admin-uploadable logo | Hardcoded / none visible | Medium |
| CSS custom properties (tokens) | None — Tailwind inline only | High |
| colorScheme:dark globally | Only in media page | High |
| Light mode toggle | Not implemented | Low |
| Dark mode (default) | Done | — |
| Font system | Unknown / system default | Medium |
| WhatsApp/phone/email support | Not implemented | Low |

### Next Order Table

| Step | Action | Type | Safe Scope | Must Not Touch |
|------|--------|------|-----------|----------------|
| 1 | Verify media library fixes in browser | Manual test | Browser only | Source code |
| 2 | Audit SM sub-pages (read-only) | Audit | Read only | Source code |
| 3 | colorScheme:dark on root admin layout | Edit | 1 line in layout.tsx | Studio, DB, Cloud |
| 4 | EmptyState + StatusBadge components | Build new | src/components/ui/ | Existing pages |
| 5 | FilterShell + SmartSelect + SearchFilter | Build new | src/components/ui/ | Existing filter files |
| 6 | Pilot on Admin Programs | Edit | admin/programs/ only | Studio, SM, Cloud |
| 7 | Expand to other admin list pages | Edit | One page at a time | Studio, DB, Cloud |
| 8 | AdminListLayout wrapper | Build new | src/components/ui/ | — |
| 9 | CSS design tokens | Edit | global CSS only | Studio internals |
| 10 | Studio UI hooks extraction | Edit | After cloud deployed | Backend-audio |
| 11 | Mobile compatibility | Edit | CSS / layout only | Business logic |
| 12 | Cloud deployment (FIX-022B) | Deploy | Cloud only | Local DB, VPS |

---

## 7. Unaudited / Needs Follow-up

| Item | Reason Not Inspected |
|------|---------------------|
| `station-manager/dj-settings/` contents | Directory exists but internal files not read |
| `station-manager/presenters/` contents | Directory exists but internal files not read |
| `station-manager/schedule/` contents | Directory exists but internal files not read |
| Exact file size limit in media actions.ts | Not read — need to open actions.ts |
| Font imports in global CSS or layout | Not read — unknown if Google Fonts configured |
| `RecordingPlayer.tsx` usage map | Exists at src/components/recordings/ — which pages use it vs which use inline player is UNKNOWN |
| Admin Media Library — Direct DJ track access | Whether DirectDjRadio has stationId linkage to scope media needs verification |
| `admin/schedule/audit/page.tsx` (439L) | Not inspected — schedule audit sub-page state unknown |
| `admin/live/page.tsx` | Not inspected — live sessions monitor page state unknown |
| `api/studio/` routes | Not inspected |
| `api/admin/` routes | Not inspected |

---
*End of Part 4. All 4 parts of the EGONAIR System Audit are now complete.*

**File index:**
- Part 1: `SYSTEM_AUDIT_CURRENT_STATE_2026-05-19_PART_1.md` — Project status + module table
- Part 2: `SYSTEM_AUDIT_CURRENT_STATE_2026-05-19_PART_2_FILTERS_SHARED_UI.md` — Filters + shared UI
- Part 3: `SYSTEM_AUDIT_CURRENT_STATE_2026-05-19_PART_3_ARCHITECTURE_RISKS.md` — Dangerous files + architecture
- Part 4: `SYSTEM_AUDIT_CURRENT_STATE_2026-05-19_PART_4_MEDIA_POLISH_NEXT.md` — Media library + polish + next order
