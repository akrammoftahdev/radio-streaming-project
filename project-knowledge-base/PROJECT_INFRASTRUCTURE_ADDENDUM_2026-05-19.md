# Project Infrastructure & Architecture Addendum — 2026-05-19
## Project: EGONAIR Radio Streaming Platform
## Addendum Type: Infrastructure State + Architecture Changes
## Date: 2026-05-19

---

## 1. Local Services State (at session end)

| Service | Port | Status at exit |
|---|---|---|
| Next.js frontend dev server | 3000 | ✅ Stopped — port FREE |
| backend-audio | 4001 | ✅ Stopped — port FREE |

**No Cloud changes made today.** Cloud infrastructure remains in its pre-session state.

---

## 2. Cloud Infrastructure — Unchanged

- No GCP / Firebase / Cloud Run changes today.
- Cloud deployment is **pending** — not scheduled in this session.
- All work was local development only.

---

## 3. Current Shared UI Architecture

### Component Layer: `frontend/src/components/ui/`

```
ui/
├── AdminPageShell.tsx     ← Standard admin page shell (header + breadcrumb + max-w container)
├── ActionButton.tsx       ← Consistent action button
├── ClearFiltersButton.tsx ← URL-param filter reset button
├── EmptyState.tsx         ← Unified no-data state
├── FilterShell.tsx        ← Filter bar wrapper
├── MultiSmartSelect.tsx   ← Multi-choice URL-param filter
├── PaginationBar.tsx      ← Pagination with prev/next/total
├── SearchFilter.tsx       ← URL-param search input
├── SegmentedFilter.tsx    ← Tab-style exclusive filter
├── SmartSelect.tsx        ← Single-select URL-param filter
├── StatusBadge.tsx        ← Unified status badge (success/warning/danger/info/neutral)
├── Unauthorized.tsx       ← Unauthorized role page (prevents redirect loops)
└── index.ts               ← Barrel export
```

### Usage Rules
- All admin pages must use `AdminPageShell` unless viewport constraint prevents it (document reason in code comment).
- All pages must use `StatusBadge`, `EmptyState` — no inline equivalents.
- Filter URL params must be lowercase single-word keys (e.g., `q`, `status`, `station`, `page`).

---

## 4. Admin Pages — Architecture State

| Page | Shell | Filters | Cards/Layout | Real Data |
|---|---|---|---|---|
| `admin/page.tsx` (Dashboard) | AdminPageShell | — | 3-tier stat/alert/nav | ✅ 18 Prisma queries |
| `admin/programs/page.tsx` | AdminPageShell | Search + Segmented + Clear | Cards | ✅ |
| `admin/stations/page.tsx` | AdminPageShell | Search + Segmented + Clear | Cards | ✅ |
| `admin/presenters/page.tsx` | AdminPageShell | Search + Segmented + Clear | Cards + 3 actions | ✅ |
| `admin/recordings/page.tsx` | AdminPageShell | Search + Segmented + Pagination | Cards | ✅ |
| `admin/live/page.tsx` | AdminPageShell | — | Live status cards | ✅ |
| `admin/status/page.tsx` | AdminPageShell | — | Health cards | ✅ |
| `admin/station-managers/page.tsx` | AdminPageShell | Search + Segmented | Cards | ✅ |
| `admin/schedule/page.tsx` | Own shell (full-width calendar) | SMStationFilter | Calendar grid | ✅ |
| `admin/schedule/audit/page.tsx` | AdminPageShell | — | Table/list | ✅ |
| `admin/media/page.tsx` | MediaClient (full-width) | Tab + Station + OwnerType | Categories + Tracks | ✅ |

---

## 5. Station Manager Pages — Architecture State

| Page | Shell | Filters | Empty State | Scope |
|---|---|---|---|---|
| `station-manager/page.tsx` | Own (sticky header + max-w-6xl) | — | Custom | Assigned stations |
| `station-manager/presenters/page.tsx` | Own | SMStationFilter + SMSearchBar | EmptyState ✅ | Assigned stations |
| `station-manager/programs/page.tsx` | Own | SMStationFilter + Status + SMSearchBar | EmptyState ✅ | Assigned stations |
| `station-manager/recordings/page.tsx` | Own | SMStationFilter + SMPresenterFilter + SMSearchBar + Pagination | EmptyState ✅ | Assigned stations |
| `station-manager/schedule/page.tsx` | Own | SMStationFilter | EmptyState ✅ | Assigned stations |
| `station-manager/dj-settings/page.tsx` | Own | Per-station inline | EmptyState ✅, StatusBadge ✅ | Assigned stations |
| `station-manager/media/page.tsx` | Own (dark) | Tab bar + Station selector | EmptyState ✅ | Assigned stations ONLY |

**Note on SM shell:** All SM pages use a custom sticky-header + `max-w-6xl` shell. This is intentional — same pattern as admin/schedule, chosen because SM pages have dense vertical content that benefits from consistent header behavior. This is NOT a regression; AdminPageShell was considered but the custom shell is functionally equivalent and already consistent across all SM pages.

---

## 6. Station Manager Media Architecture

```
StationManagerAssignment
  managerId → User (role=STATION_MANAGER)
  stationId → Station

MediaCategory
  stationId = null    → global (Admin only)
  stationId = <id>    → station-scoped

SM Media Scope:
  page.tsx  → WHERE stationId IN (manager's assignedIds)
  actions.ts → requireSM() → assertStationInScope(stationId, assignedIds) per operation

Physical files:
  Admin: fs.unlink() in admin/media/actions.ts (deleteTrack)
  SM:    DB delete only — no disk access (security boundary)
```

---

## 7. Admin vs Station Manager Scope Model

```
ADMIN
  ├── All stations (no filter required)
  ├── All presenters, programs, recordings
  ├── All media (global + station-scoped)
  └── Full CRUD + audit log

STATION_MANAGER
  ├── Only stations in StationManagerAssignment (isActive=true)
  ├── Only presenters linked via PresenterStation to assigned stations
  ├── Only programs where program.stationId IN assignedIds
  ├── Only recordings where recording.stationId IN assignedIds
  └── Only media categories where category.stationId IN assignedIds
      (cannot manage global stationId=null categories)
```

---

## 8. Files / Folders Created This Session

### New files created:
```
frontend/src/components/ui/AdminPageShell.tsx
frontend/src/components/ui/StatusBadge.tsx
frontend/src/components/ui/EmptyState.tsx
frontend/src/components/ui/SearchFilter.tsx
frontend/src/components/ui/MultiSmartSelect.tsx
frontend/src/components/ui/SegmentedFilter.tsx
frontend/src/components/ui/ClearFiltersButton.tsx
frontend/src/components/ui/PaginationBar.tsx
frontend/src/components/ui/ActionButton.tsx
frontend/src/components/ui/FilterShell.tsx
frontend/src/components/ui/SmartSelect.tsx
frontend/src/components/ui/Unauthorized.tsx
frontend/src/components/ui/index.ts
frontend/src/app/station-manager/media/page.tsx
frontend/src/app/station-manager/media/actions.ts
frontend/src/app/station-manager/media/media-client.tsx
frontend/src/app/admin/presenters/actions.ts   (togglePresenterActive added)
```

### Files significantly modified:
```
frontend/src/app/admin/page.tsx               (full rebuild)
frontend/src/app/admin/programs/page.tsx      (AdminPageShell + filters)
frontend/src/app/admin/stations/page.tsx      (AdminPageShell + filters + cards)
frontend/src/app/admin/presenters/page.tsx    (AdminPageShell + filters + cards + 3 actions)
frontend/src/app/admin/recordings/page.tsx    (AdminPageShell + filters)
frontend/src/app/admin/live/page.tsx          (AdminPageShell)
frontend/src/app/admin/status/page.tsx        (AdminPageShell)
frontend/src/app/admin/schedule/audit/page.tsx (AdminPageShell)
frontend/src/app/admin/station-managers/page.tsx (AdminPageShell + cards)
frontend/src/app/station-manager/page.tsx     (nav link added for media)
frontend/src/app/station-manager/presenters/page.tsx (EmptyState + StatusBadge)
frontend/src/app/station-manager/programs/page.tsx   (EmptyState + StatusBadge)
frontend/src/app/station-manager/recordings/page.tsx (EmptyState + StatusBadge)
frontend/src/app/station-manager/schedule/page.tsx   (EmptyState + StatusBadge)
frontend/src/app/station-manager/dj-settings/page.tsx (EmptyState + StatusBadge + cred badge)
```

### Files NOT modified:
```
admin/media/page.tsx              (unchanged)
admin/media/actions.ts            (unchanged — requireAdmin() guards intact)
admin/media/media-client.tsx      (unchanged)
admin/schedule/page.tsx           (kept own shell intentionally)
prisma/schema.prisma              (unchanged — no schema changes)
backend-audio/                    (unchanged)
Any auth/routing files            (unchanged)
```

---

## 9. Rollback / Backup Path

**Backup location:**
```
backups/2026-05-19_21-39-safe-exit-architecture-ui-sm-media/
├── project-knowledge-base/     (full KB snapshot)
└── frontend/
    ├── src/components/ui/      (all shared components)
    └── src/app/
        ├── admin/              (all modified admin pages)
        └── station-manager/    (all SM pages + new media/)
```

**To rollback:** Copy files from backup into `frontend/src/` — no migration needed, no DB changes.

---

## 10. TypeScript Compile Status

**Exit status:** ✅ `npx tsc --noEmit` — **zero errors**

All new and modified files are fully type-safe. No `any` suppressions added beyond pre-existing patterns in Prisma query results.
