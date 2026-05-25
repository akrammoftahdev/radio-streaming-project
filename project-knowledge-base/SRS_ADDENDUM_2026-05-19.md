# SRS Addendum — 2026-05-19
## Project: EGONAIR Radio Streaming Platform
## Addendum Type: Architecture & Feature Clarification
## Date: 2026-05-19

---

## 1. Shared UI System

### Status: ✅ Implemented

A unified shared UI component library is established at `frontend/src/components/ui/`.

**Mandatory components for all admin and station-manager pages:**

| Component | Purpose |
|---|---|
| `AdminPageShell` | Standard page shell — header, breadcrumb, max-width container |
| `StatusBadge` | Unified active/inactive/warning/danger/info badge |
| `EmptyState` | Unified no-data state with icon, title, description, optional action |
| `SearchFilter` | Standard search input (syncs to URL `q` param) |
| `MultiSmartSelect` | Multi-select filter (syncs to URL param as comma-separated) |
| `SegmentedFilter` | Tab/segment filter for mutually exclusive states |
| `ClearFiltersButton` | Resets all URL filter params |
| `PaginationBar` | Standard pagination with prev/next/total pages |
| `ActionButton` | Consistent action button with loading/disabled states |
| `FilterShell` | Wrapper for filter bar groups |
| `Unauthorized` | Shown when role mismatch — avoids redirect loops |

**Rule:** Inline status spans, custom empty state divs, and ad-hoc badge classes must be replaced with these shared components in all new and migrated pages.

---

## 2. Shared Filter System

### Status: ✅ Implemented (Admin); ⚠️ Partial (Station Manager)

**Admin pages:** All filters use shared components with URL-param-based state (no client state for filters).

**Station Manager pages:** Use SM-specific scoped filter components:
- `SMStationFilter` — shows only assigned stations
- `SMPresenterFilter` — shows only presenters in assigned stations
- `SMSearchBar` — standard search

**Rule:** Station Manager filters must always derive their option lists from server-side assigned station scope. They must never show global or unassigned data in dropdowns.

---

## 3. Admin Dashboard as System Overview

### Status: ✅ Implemented (2026-05-19)

The Admin Dashboard (`admin/page.tsx`) must function as a **real-time system health overview**, not a static link list.

**Required:**
- Live stats from all major system entities (presenters, stations, programs, recordings, media, station managers)
- Health warning banners for actionable problems (e.g., stations missing DJ creds, presenters without stations, programs without schedules)
- Navigation grid to all management modules
- All stats from live Prisma queries (no hardcoded values)

**Deprecated:** `BroadcastSchedule` model must NOT be used for dashboard stats. Use `Program` → `ProgramScheduleRule` → `ProgramScheduleSlot` pipeline.

---

## 4. Station Manager Media Library

### Status: ✅ Implemented (2026-05-19)

**Requirement (from Akram):** Station Manager must be able to manage media files for their assigned station(s):
- Background music
- Songs
- Breaks (فواصل)
- Ads (إعلانات)

**Implementation rules:**

| Rule | Enforcement |
|---|---|
| SM sees only categories where `stationId IN assignedStationIds` | Server-side Prisma `where` clause |
| SM creates categories only for `stationId IN assignedStationIds` | `assertStationInScope()` in every action |
| SM cannot create global `stationId=null` categories | Validated in `smCreateCategory` |
| SM cannot delete physical files | No `fs.unlink` in SM actions — DB delete only |
| Admin retains full unrestricted access | `requireAdmin()` guard unchanged in admin actions |

**Files:**
- `station-manager/media/page.tsx` — scoped server page
- `station-manager/media/actions.ts` — scoped server actions
- `station-manager/media/media-client.tsx` — compact client UI

---

## 5. Station Manager Permissions — Assigned Station Media

**Scope model:**

```
StationManagerAssignment
  → managerId (User.id where role=STATION_MANAGER)
  → stationId (Station.id, isActive=true)

MediaCategory
  → stationId = null   → global (admin-only management)
  → stationId = <id>   → station-scoped (SM can manage if stationId is assigned)
```

**Permission matrix:**

| Action | Admin | Station Manager |
|---|---|---|
| View global categories (`stationId=null`) | ✅ | ❌ (not shown) |
| View assigned station categories | ✅ | ✅ |
| Create global category | ✅ | ❌ |
| Create assigned station category | ✅ | ✅ |
| Delete track (DB + disk) | ✅ | DB only |
| Delete category | ✅ | ✅ (assigned only) |
| Reorder tracks | ✅ | ✅ (assigned only) |

---

## 6. Global Branding / Theme — Future Requirement

**Not implemented yet. Required for future.**

- System must support a configurable primary brand color applied globally across admin and station-manager interfaces.
- Should be stored as a system setting (e.g., `SystemConfig` table or environment variable).
- Must apply to header gradients, button accents, and active filter highlights.

---

## 7. Light / Dark Mode — Future Requirement

**Not implemented yet. Required for future.**

- Current system uses dark mode (`bg-slate-950`, `text-slate-100`) universally.
- Future: user preference stored in cookie or DB; toggle available in header.
- CSS variables or Tailwind `dark:` class to be used when implemented.

---

## 8. Admin Support Settings — Future Requirement

**Not implemented yet.**

- A dedicated `/admin/settings` page is needed for:
  - System-wide configuration (global branding, default timezone, stream defaults)
  - User management shortcuts
  - System health and diagnostic controls
- Must use AdminPageShell and real Prisma-backed settings model.

---

## 9. Fallback / Anti-Regression Architecture Rule

**Mandatory rule for all future development:**

> Any page that cannot safely use `AdminPageShell` (e.g., schedule calendar requiring full viewport width) must document the reason in a code comment. The shell may be skipped, but the page must still use all shared sub-components (`StatusBadge`, `EmptyState`, `PaginationBar`) where applicable.

**Redirect loop prevention rule:**
> Unauthorized access must render `<Unauthorized role={role} />` — never redirect to `/login` when the user is authenticated. Redirecting authenticated users to `/login` creates a redirect loop because `/login` redirects back to role-home.
