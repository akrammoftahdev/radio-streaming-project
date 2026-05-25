# SRS Addendum — 2026-05-20
## Stage: ADMIN-STATION-MANAGER-UI-ARCHITECTURE-ALIGNMENT

---

## 1. Shared UI Component Catalog (Established)

### 1.1 AdminPageShell
- **Path:** `src/components/ui/AdminPageShell.tsx`
- **Purpose:** Unified outer wrapper for all admin pages. Provides consistent header, nav breadcrumb slot, and content area.
- **Used by:** All admin pages.
- **Rule:** Every new admin page MUST use `AdminPageShell`.

### 1.2 EmptyState
- **Path:** `src/components/ui/EmptyState.tsx`
- **Props:** `icon`, `title`, `description`, optional `action`
- **Purpose:** Consistent "no data" message across all pages.
- **Rule:** Never render inline "لا توجد..." divs — always use `EmptyState`.

### 1.3 StatusBadge
- **Path:** `src/components/ui/StatusBadge.tsx`
- **Variants:** `neutral | success | warning | danger | info`
- **Props:** `label`, `variant`, `dot?`, `className?`
- **Purpose:** Consistent status chips. Never use inline `bg-emerald-...` / `bg-red-...` spans for status.
- **Rule:** All entity status fields (active/inactive, on_air, etc.) must use `StatusBadge`.

### 1.4 PaginationBar
- **Path:** `src/components/ui/PaginationBar.tsx`
- **Rule:** Must be visible when pagination exists. Never hidden behind scroll.

### 1.5 SearchFilter / FilterShell
- **Path:** `src/components/ui/SearchFilter.tsx`, `src/components/ui/FilterShell.tsx`
- **Used by:** Admin filter bars.

### 1.6 SMStationFilter (Multi-Select)
- **Path:** `src/components/sm-station-filter.tsx`
- **Behavior:** Comma-separated multi-select. URL param: `?station=id1,id2`.
- **Server parsing:** `.split(",").filter(id => assignedIds.includes(id))` — always scope-guarded.
- **Rule:** Station filter in ALL SM pages must use this component. Never use single-value `params.set()`.

### 1.7 Unauthorized
- **Path:** `src/components/ui/Unauthorized.tsx`
- **Rule:** Render this when an authenticated user has wrong role. Never `redirect("/login")` — causes redirect loop.

---

## 2. Station Manager Scope Rules (Enforced)

| Rule | Implementation |
|---|---|
| SM sees only assigned stations | `WHERE stationId IN assignedStationIds` server-side |
| SM media scoped | `MediaCategory WHERE stationId IN assignedIds` |
| SM cannot delete physical files | Only DB records are deleted by SM |
| SM actions guarded | `requireSM()` + `assertStationInScope()` in all actions.ts |
| SM filter multi-select | Comma-separated, scoped: invalid IDs stripped server-side |

---

## 3. basePath Convention

| Context | Convention |
|---|---|
| `<Link>` inside `app/` server/client components | No prefix needed — Next.js applies basePath automatically |
| `<a href="...">` in client components | MUST include `/stream/` prefix explicitly |
| `router.push(...)` in client components | MUST include `/stream/` prefix explicitly |
| `window.location.href` | MUST include `/stream/` prefix explicitly |

---

## 4. Frozen Subsystems (Do Not Touch Without Plan)

| Subsystem | Reason |
|---|---|
| `studio-ui.tsx` | Complex 2800-line broadcast engine; requires dedicated session |
| `BroadcastSchedule` model | Legacy, ignored — do not delete until all references verified |
| Auth / routing globals | Any change risks redirect loops |
