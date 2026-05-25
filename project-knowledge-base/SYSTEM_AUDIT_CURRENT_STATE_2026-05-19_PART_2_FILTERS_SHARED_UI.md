# EGONAIR System Audit — Part 2: Filters + Shared UI
**Date:** 2026-05-19 | **Read-only audit**

---

## 1. Current Filters System

### Admin Presenters
- **Page:** `/admin/presenters`
- **Files:** `admin/presenters/page.tsx` (408L), `admin/presenters/presenters-filter.tsx` (386L)
- **Filters implemented:** Search by name/username, station filter, role/type filter, status filter (active/inactive)
- **Filters missing:** Date added range, sort order selector
- **Implementation:** Custom component (`presenters-filter.tsx`) — NOT shared with SM layer
- **Role scope:** ADMIN only — no station-scoped filtering for SM
- **Risk:** 386-line filter file is page-specific. No reuse. Station Manager has its own `sm-station-filter.tsx` and `sm-presenter-filter.tsx` duplicating the same pattern

### Admin Recordings
- **Page:** `/admin/recordings`
- **Files:** `admin/recordings/page.tsx` (660L), `presenter-filter.tsx` (8,723 bytes), `station-filter.tsx` (8,447 bytes), `date-search-filter.tsx` (5,346 bytes), `recordings-type-sort-filter.tsx` (5,708 bytes)
- **Filters implemented:** Presenter filter, station filter, date range, type/sort filter
- **Filters missing:** Duration range, file size filter, session mode filter (SINGLE/MULTI/DIRECT_DJ)
- **Implementation:** Each filter is a separate page-specific component — NOT shared
- **Role scope:** ADMIN sees all. No STATION_MANAGER scoped version
- **Risk:** 4 separate filter components in one folder, none reusable elsewhere. Total ~28KB of filter logic for one page

### Admin Programs
- **Page:** `/admin/programs`
- **Files:** `admin/programs/page.tsx` (399L), `admin/programs/programs-filter.tsx` (333L)
- **Filters implemented:** Station filter, presenter filter, search, recurrence type filter
- **Filters missing:** Date range (valid-from/to), active/inactive toggle, program type
- **Implementation:** Custom `programs-filter.tsx` — NOT shared with SM programs
- **Role scope:** ADMIN only
- **Risk:** SM programs page (`station-manager/programs/page.tsx`) has NO filter bar at all — no search, no sort visible from directory

### Admin Stations
- **Page:** `/admin/stations`
- **Files:** `admin/stations/page.tsx` (688L), `admin/stations/stations-filter.tsx` (10,653 bytes)
- **Filters implemented:** Search, credential status filter
- **Filters missing:** Region/country filter, active/inactive toggle, station type
- **Implementation:** Custom `stations-filter.tsx` — NOT shared
- **Role scope:** ADMIN only
- **Risk:** 688-line page carries CRUD + filter + credential management inline. No separate client component

### Admin Schedule
- **Page:** `/admin/schedule`
- **Files:** `admin/schedule/page.tsx` (399L), `admin/schedule/schedule-filter-bar.tsx` (340L)
- **Filters implemented:** Station filter, presenter filter, day-of-week filter, time range
- **Filters missing:** Program status (active/expired/upcoming), date range
- **Implementation:** Custom `schedule-filter-bar.tsx` (340L) — known to have pre-existing TypeScript warnings (mentioned in session summary)
- **Risk:** Not yet upgraded to smart-select style. Inconsistent with new multi-select dropdowns added to media library

### Station Manager Pages
- **Dashboard:** `station-manager/page.tsx` (398L)
- **Filters present:** `components/sm-presenter-filter.tsx` (7,486 bytes), `components/sm-station-filter.tsx` (8,851 bytes), `components/sm-search-bar.tsx` (2,208 bytes)
- **Filter coverage:** Presenter filter + station filter + search bar — separate components from admin filters
- **Missing:** Date filters, type filters, sort order
- **Risk:** SM filter components are entirely duplicated from admin equivalents with different class/style choices. No shared base

---

## 2. Shared UI Components Current State

| Component | Shared Now? | Duplicated Where | Should Be Global? | Priority |
|-----------|------------|------------------|-------------------|----------|
| Search input | No | admin/presenters, admin/programs, admin/stations, admin/schedule, admin/media, SM components | Yes | HIGH |
| Station single-select | Partial | StationSingleSelect in media-client.tsx only | Yes | HIGH |
| Station multi-select | Partial | StationMultiSelect in media-client.tsx only | Yes | HIGH |
| Presenter filter dropdown | No | admin/presenters (386L), SM/sm-presenter-filter (7,486 bytes) | Yes | HIGH |
| Segmented button (ownerType/status) | No | media-client.tsx, SM pages inline | Yes | MEDIUM |
| Date range filter | No | admin/recordings/date-search-filter.tsx only | Yes | MEDIUM |
| Pagination bar | No | media-client.tsx has custom pagination. Other pages: UNKNOWN/none found | Yes | HIGH |
| Sort selector | No | recordings-type-sort-filter.tsx only | Yes | MEDIUM |
| Clear filters button | No | Each filter file implements its own | Yes | MEDIUM |
| RecordingPlayer card | Yes (partial) | `src/components/recordings/RecordingPlayer.tsx` (389L) — used in some pages | Expand usage | HIGH |
| Auth helpers | Yes | `src/auth.ts`, `src/proxy.ts` — shared via import | Keep as-is | LOW |
| Recording helpers | Yes (partial) | `src/lib/recording-helpers.ts` (1,729 bytes) | Expand | MEDIUM |
| Media helpers | No | Inline in media-client.tsx and actions.ts | Extract | MEDIUM |
| Token/session helpers | Yes | `src/lib/audio-token.ts` (3,857 bytes) | Keep as-is | LOW |
| Empty state UI | No | Inline in every page differently | Yes | HIGH |
| Success/error banners | No | Inline per page (slotError=URL pattern) | Yes | MEDIUM |
| Admin list layout wrapper | No | Each admin page has own header/container | Yes | MEDIUM |
| Stat card | No | admin/page.tsx inline | Yes | LOW |
| Status badge | No | Inline in each page | Yes | MEDIUM |
| Confirm delete dialog | No | Each delete page has own cleanup-button.tsx | Yes | MEDIUM |
| FormSection wrapper | No | Each form page is standalone | Yes | LOW |
| Action button variants | No | Each page defines own button styles | Yes | MEDIUM |

---

## 3. Admin vs Station Manager Filter Gap

### Duplicated Filters (Admin has, SM has its own copy)
| Filter | Admin File | SM File | Same logic? |
|--------|-----------|---------|-------------|
| Presenter filter | `presenters-filter.tsx` (386L) | `sm-presenter-filter.tsx` (7,486 bytes) | No — different implementation |
| Station filter | `stations-filter.tsx` | `sm-station-filter.tsx` (8,851 bytes) | No — different implementation |
| Search bar | Inline per page | `sm-search-bar.tsx` (2,208 bytes) | No — SM has a dedicated component, admin does not |

### Filters Missing from Station Manager
- Date range filter
- Recording type/sort filter
- Program recurrence filter
- Schedule day-of-week filter

### Role-Aware Data Scoping
- Admin pages: ADMIN sees all stations/presenters globally
- SM pages: SM sees only their assigned station's data
- Current implementation: scoping is done server-side in each page's Prisma query — correct
- Risk: Scoping logic is NOT centralized. If a new SM page is added, scoping must be manually added to that page's query

### What Should Become a Global Filter System
A `FilterShell` wrapper that accepts:
- role context (ADMIN / STATION_MANAGER)
- station scope (null = all, stationId = scoped)
- filter slot components (search, smart-select, date, sort, segment)
- URL param serialization/deserialization
- clear filters action

---

## 4. Recommended Shared UI System (No code — names and responsibilities only)

| Component Name | Responsibility |
|----------------|----------------|
| `FilterShell` | Wraps all filter rows. Handles URL params, clear-all, layout |
| `SearchFilter` | Debounced text search input with icon |
| `SmartSelect` | Single searchable dropdown (replaces all native `<select>`) |
| `MultiSmartSelect` | Multi-select with checkbox list + search (like StationMultiSelect) |
| `SegmentedFilter` | Segmented button group (e.g. All / Admin / Presenter) |
| `DateRangeFilter` | From/to date pickers with Arabic labels |
| `SortFilter` | Sort field + direction selector |
| `PaginationBar` | Page buttons + prev/next + count label |
| `ClearFiltersButton` | Amber styled, visible only when filters are active |
| `AdminListLayout` | Full-page container: header, back link, title, action buttons, content |
| `StatCard` | Dashboard stat card with icon, number, label |
| `ActionButton` | Standardized button variants (primary/danger/ghost) |
| `StatusBadge` | Colored badge for active/inactive/live/error states |
| `EmptyState` | Centered icon + message + optional action button |
| `FormSection` | Labeled section wrapper for forms |
| `ConfirmDeleteDialog` | Modal or inline confirm for destructive actions |

---

## 5. Tables

### Filters Coverage Table

| Page | Filters Present | Filters Missing | Shared? |
|------|----------------|-----------------|---------|
| Admin Presenters | search, station, type, status | date range, sort | No |
| Admin Recordings | presenter, station, date, type/sort | duration, session mode | No |
| Admin Programs | station, presenter, search, recurrence | valid-from/to, active toggle | No |
| Admin Stations | search, credential status | active toggle, region | No |
| Admin Schedule | station, presenter, day, time | program status, date range | No |
| Admin Media Library | search, station multi-select, ownerType | ✅ comprehensive | No |
| SM Dashboard | search, station, presenter | date, type, sort | No |
| SM Programs | None | All | — |
| SM Recordings | UNKNOWN | UNKNOWN | UNKNOWN |
| SM Schedule | UNKNOWN | UNKNOWN | UNKNOWN |

### Shared vs Duplicated Table

| Feature | Shared Now? | Duplicated Where | Global Priority |
|---------|-------------|-----------------|-----------------|
| Search input | No | 8+ pages | HIGH |
| Station select | Partial (media only) | 5+ pages | HIGH |
| Presenter select | No | 3+ pages | HIGH |
| Pagination | No | media page, others UNKNOWN | HIGH |
| Empty state | No | Every page different | HIGH |
| Status badge | No | Every page inline | MEDIUM |
| RecordingPlayer | Partial | components/recordings/ | MEDIUM |
| Auth helpers | Yes | lib/ | Done |
| Token helpers | Yes | lib/ | Done |
| Recording helpers | Yes (partial) | lib/ | MEDIUM |

### Recommended Global Components Table

| Component | Used By | Build When |
|-----------|---------|-----------|
| FilterShell + SearchFilter | All admin + SM list pages | After media library stable |
| SmartSelect / MultiSmartSelect | All select dropdowns | After media library stable |
| PaginationBar | Admin list pages | After shared filter system |
| EmptyState | All list pages | Early — low risk |
| AdminListLayout | All admin pages | After 2–3 page pilots |
| StatusBadge | All pages with status | Low risk, do early |
| RecordingPlayer | Admin + SM recordings | Expand existing component |

---
*End of Part 2. See Part 3 for architecture risks and dangerous files.*
