# Project Infrastructure Addendum — 2026-05-20
## Stage: ADMIN-STATION-MANAGER-UI-ARCHITECTURE-ALIGNMENT

---

## 1. Files Changed This Stage

### New Files Created

| File | Purpose |
|---|---|
| `src/components/ui/AdminPageShell.tsx` | Admin page shell wrapper |
| `src/components/ui/EmptyState.tsx` | Shared empty state component |
| `src/components/ui/StatusBadge.tsx` | Shared status badge (5 variants) |
| `src/components/ui/PaginationBar.tsx` | Shared pagination component |
| `src/components/ui/SearchFilter.tsx` | Admin search filter input |
| `src/components/ui/FilterShell.tsx` | Admin filter bar wrapper |
| `src/components/ui/Unauthorized.tsx` | Role guard component |
| `src/components/sm-station-filter.tsx` | SM multi-select station filter |
| `src/components/sm-presenter-filter.tsx` | SM presenter filter |
| `src/components/sm-search-bar.tsx` | SM search bar |
| `src/app/station-manager/media/page.tsx` | SM media library server page |
| `src/app/station-manager/media/media-client.tsx` | SM media library client |
| `src/app/station-manager/media/actions.ts` | SM media scoped server actions |

### Files Significantly Modified

| File | Change Summary |
|---|---|
| `src/app/admin/page.tsx` | Rebuilt as real system overview — 18 Prisma queries |
| `src/app/admin/status/page.tsx` | AdminPageShell applied |
| `src/app/admin/live/page.tsx` | AdminPageShell applied |
| `src/app/admin/programs/page.tsx` | AdminPageShell + card layout |
| `src/app/admin/presenters/page.tsx` | AdminPageShell + card layout |
| `src/app/admin/recordings/page.tsx` | AdminPageShell + card layout |
| `src/app/admin/stations/page.tsx` | AdminPageShell + card layout |
| `src/app/admin/station-managers/page.tsx` | AdminPageShell + compact layout |
| `src/app/admin/schedule/page.tsx` | AdminPageShell applied |
| `src/app/admin/schedule/audit/page.tsx` | AdminPageShell applied |
| `src/app/station-manager/page.tsx` | Dashboard grid balanced (col-span-2 removed) |
| `src/app/station-manager/presenters/page.tsx` | EmptyState + multi-select station fix |
| `src/app/station-manager/presenters/presenter-card.tsx` | StatusBadge migration |
| `src/app/station-manager/programs/page.tsx` | EmptyState + multi-select station fix |
| `src/app/station-manager/programs/program-card.tsx` | StatusBadge migration |
| `src/app/station-manager/recordings/page.tsx` | EmptyState + StatusBadge + multi-select fix |
| `src/app/station-manager/schedule/page.tsx` | EmptyState + multi-select station fix |
| `src/app/station-manager/dj-settings/page.tsx` | StatusBadge migration |

---

## 2. Architecture Pattern: SM Station Multi-Select

**Pattern established:** `?station=id1,id2` comma-separated URL param.

**Client (SMStationFilter):**
```ts
// Read
const rawParam = sp.get(paramKey) ?? "";
const selectedIds = new Set(rawParam.split(",").filter(Boolean));

// Write (toggle)
if (next.has(id)) next.delete(id); else next.add(id);
params.set(paramKey, Array.from(next).join(","));
```

**Server (all SM pages):**
```ts
const rawFilter = sp.station ?? "";
const selectedIds = rawFilter
  ? rawFilter.split(",").filter(id => stationIds.includes(id))
  : [];
const queryIds = selectedIds.length > 0 ? selectedIds : stationIds;
// prisma.X.findMany({ where: { stationId: { in: queryIds } } })
```

---

## 3. Architecture Pattern: basePath-Aware Links

Next.js `basePath: "/stream"` is set in `next.config.ts`.

| Usage | Behavior | Correct Form |
|---|---|---|
| `<Link href="/admin">` in `app/` | basePath auto-prepended ✅ | No change needed |
| `<a href="/station-manager">` in client component | basePath NOT prepended ❌ | `<a href="/stream/station-manager">` |
| `router.push("/admin")` | basePath NOT prepended ❌ | `router.push("/stream/admin")` |

---

## 4. Compile Status

- **Date:** 2026-05-20
- **Command:** `npx tsc --noEmit`
- **Result:** ✅ Zero errors

---

## 5. Rollback Instructions (if regression)

Last stable backup: `backups/2026-05-19_21-39-safe-exit-architecture-ui-sm-media/`

To rollback a specific file:
```bash
cp backups/2026-05-19_21-39-safe-exit-architecture-ui-sm-media/frontend/src/app/station-manager/[page] \
   frontend/src/app/station-manager/[page]
```

Shared components did not exist before this stage — there is no rollback for them. Remove import and revert inline code if needed.

---

## 6. Server State at Close

| Service | Port | Status |
|---|---|---|
| Next.js frontend | 3000 | ✅ RUNNING |
| backend-audio | 4001 | ✅ FREE (stopped) |
| PostgreSQL | 5432 | ✅ RUNNING (assumed) |
