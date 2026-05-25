# System Settings & Admin RBAC — Audit & Implementation Plan
**Date:** 2026-05-20
**Scope:** Global Branding / Theme Settings + Admin Users / Permissions (RBAC)
**Type:** Audit + Plan only. No code. No DB changes.

---

## A. Current Branding / Theme State

### A1. System Name
- **Hardcoded:** ✅ YES — `"EGONAIR"` appears in **28 files** across `src/app/` and `src/components/`
- **Key locations:**
  - `src/app/layout.tsx` — `metadata.title = "EGONAIR Remote Studio"` (root layout)
  - `src/app/login/page.tsx` — branded in JSX + metadata
  - Every admin page `<title>` tag uses `"— EGONAIR"` suffix
  - Every station-manager page title
  - `src/components/ui/FilterShell.tsx`, `ActionButton.tsx`, `index.ts`
  - `src/lib/audio-token.ts`
- **Controllable from DB:** ❌ No — all hardcoded strings

### A2. Logo
- **Status:** ❌ No logo file — logo is rendered as text `"EGONAIR"` in components
- **Login page:** gradient text logo + SVG radio wave icon (inline)
- **Admin dashboard:** text only
- **No `<img src="/logo...">` anywhere in source**

### A3. Favicon / App Icon
- **Status:** ✅ EXISTS — `src/app/favicon.ico` (standard Next.js location)
- **App icon (PWA/manifest):** ❌ Not configured — no `manifest.json`, no `apple-touch-icon`
- **Controllable from DB:** ❌ No — static file only

### A4. Support Contact Info (Phone / WhatsApp / Email)
- **Status:** ❌ NOT STORED in DB — no `SystemSettings` model
- **Files with phone/email patterns** (`01[0-9]`, `@`, `+20`): 12 files — but these appear to be **form field regex patterns** and **placeholder/test data**, not real support contact values
- **No support contact values are displayed in UI** — this is a missing feature, not a hardcoded one

### A5. SystemSettings / AppConfig Model
- **Status:** ❌ DOES NOT EXIST in `schema.prisma`
- **No `SystemSettings`, `AppConfig`, `SiteConfig`, `Setting`, or `BrandConfig` model found**
- **All 20 models in schema:** `User`, `PresenterProfile`, `PresenterValidity`, `BroadcastSchedule`, `SonicPanelCredential`, `MediaCategory`, `MediaTrack`, `LiveSession`, `AccessLog`, `AdminAuditLog`, `AudioTransitionSettings`, `Recording`, `Station`, `StationDefaultCredential`, `PresenterStation`, `Program`, `ProgramScheduleRule`, `ProgramScheduleSlot`, `ProgramScheduleException`, `StationManagerAssignment`, `DirectDjRadio`

### A6. Theme Colors — Tailwind vs CSS Variables
- **Status:** MIXED
  - `src/app/globals.css` — ✅ CSS design tokens defined (`--eg-bg`, `--eg-surface`, `--eg-border`, `--eg-text`, `--eg-text-muted`, `--eg-primary`, `--eg-success`, `--eg-warning`, `--eg-danger`, radius tokens)
  - `src/app/layout.tsx` body — ❌ hardcoded `bg-[#0f172a]` (not using token)
  - Most pages — use **Tailwind utility classes directly** (`bg-slate-900`, `text-slate-100`, etc.), NOT tokens
  - Token system exists but is not yet consistently adopted across pages

### A7. Dark Mode / Light Mode
- **Dark mode:** ✅ Global — `colorScheme: "dark"` in root layout `<html>`, body bg is dark
- **Light mode:** ❌ Not supported — no `prefers-color-scheme` media queries, no `.light` class, no light token set
- **Theme toggle:** ❌ Does not exist
- **Default theme:** Dark only

### A8. Files Controlling Layout / Theme
| File | Role |
|---|---|
| `src/app/layout.tsx` | Root HTML shell — sets `lang="ar" dir="rtl" colorScheme="dark"` |
| `src/app/globals.css` | CSS variable tokens + base styles |
| `next.config.ts` | `basePath=/stream`, `assetPrefix`, Docker output |
| `src/app/favicon.ico` | Static favicon |

---

## B. Current Admin Users / Permissions State

### B1. Multiple Admin Users
- **Supported by schema:** ✅ YES — `User.role` is a plain `String` field, no UNIQUE constraint on role, multiple rows can have `role = "ADMIN"`
- **No enum** — role is unconstrained string. Current known values: `"PRESENTER"`, `"ADMIN"`, `"STATION_MANAGER"`

### B2. Role ADMIN Exists
- **Status:** ✅ YES — `auth.ts` reads `user.role`, passes to JWT. All admin pages check `role === "ADMIN"`

### B3. Admin Permission Model
- **Status:** ❌ DOES NOT EXIST — no `AdminPermission`, `AdminRolePermission`, `Permission`, or `ModuleAccess` model in schema

### B4. Module Permission System
- **Status:** ❌ DOES NOT EXIST — no per-module access control anywhere

### B5. Admin Page Guards — Pattern Analysis
| Admin page file | Guard method | Problem |
|---|---|---|
| `admin/page.tsx` | Uses `Unauthorized` component correctly | ✅ Good |
| `admin/stations/page.tsx` | `redirect("/login")` on wrong role | ⚠️ Causes loop if session exists but wrong role |
| `admin/schedule/page.tsx` | `redirect("/login")` | ⚠️ Same issue |
| `admin/schedule/audit/page.tsx` | `redirect("/login")` | ⚠️ Same issue |
| `admin/recordings/page.tsx` | `redirect("/login")` | ⚠️ Same issue |
| `admin/stations/[id]/delete/page.tsx` | `redirect("/login")` | ⚠️ Same issue |
- **Inconsistency:** Some pages use `<Unauthorized />` (correct), others use `redirect("/login")` (can loop)
- **All guards check ONLY `role === "ADMIN"`** — no module-level permission check exists

### B6. Main Admin vs Limited Admin Distinction
- **Status:** ❌ DOES NOT EXIST — there is one flat `"ADMIN"` role string, no sub-roles or permission flags
- **No `adminType`, `isFullAdmin`, `permissions[]`, or similar field on User model**

### B7. Audit Logging for Admin Actions
- **Status:** ✅ PARTIAL — `AdminAuditLog` model exists with fields:
  ```
  id, adminId (legacy), actorId, actorRole, stationId,
  action, entityType, entityId, metadata, createdAt
  ```
- Supports both ADMIN and STATION_MANAGER actors
- `actorRole` field allows filtering by actor type
- **Missing:** `modulePermission` field (for tracking which module gate allowed the action)
- **Usage:** Unknown from audit alone — must check if admin actions.ts files actually write to this table

---

## C. Required Schema Plan (No Code)

### C1. New Model: `SystemSettings`
**Purpose:** Single-row config table for branding + contact info + theme defaults.

**Proposed fields:**
```
model SystemSettings {
  id              String  @id @default("singleton")  // enforces single row
  systemName      String  @default("EGONAIR")
  systemSubtitle  String? // "ستوديو البث الإذاعي عن بعد"
  logoUrl         String? // uploaded logo image URL
  faviconUrl      String? // custom favicon URL (future)
  supportPhone    String?
  supportWhatsapp String?
  supportEmail    String?
  primaryColor    String  @default("#6366f1")  // hex
  accentColor     String  @default("#0891b2")  // hex
  darkBgColor     String  @default("#0f172a")
  defaultTheme    String  @default("dark")     // "dark" | "light"
  updatedAt       DateTime @updatedAt
  updatedBy       String?  // adminId who last saved
}
```

**Strategy:** `@id @default("singleton")` — only ever one row. `upsert({ where: { id: "singleton" }, ... })` pattern for all saves. Server action reads this and passes to layout via server component. Fallback defaults used if row missing (no crash).

### C2. New Model: `AdminPermission`
**Purpose:** Per-admin module access list for LIMITED admins.

**Proposed fields:**
```
model AdminPermission {
  id        String   @id @default(uuid())
  userId    String   @unique @map("user_id")
  isFullAdmin Boolean @default(false) @map("is_full_admin")
  // Comma-separated or separate bool columns per module:
  canDashboard      Boolean @default(false)
  canPresenters     Boolean @default(false)
  canStations       Boolean @default(false)
  canPrograms       Boolean @default(false)
  canRecordings     Boolean @default(false)
  canMedia          Boolean @default(false)
  canStationManagers Boolean @default(false)
  canSchedule       Boolean @default(false)
  canSettings       Boolean @default(false)
  canAuditLogs      Boolean @default(false)
  canLive           Boolean @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user      User     @relation(fields: [userId], references: [id])
}
```

**Strategy:**
- `isFullAdmin = true` → full access (behaves like current `ADMIN` — no permission check needed)
- `isFullAdmin = false` → check per-module boolean
- All **existing** ADMIN users will need a seeded `AdminPermission` row with `isFullAdmin = true` to avoid breaking them
- Migration: add model + seed existing admins as full admins atomically

**Avoid breaking existing ADMIN login:**
- `role = "ADMIN"` on `User` is UNCHANGED — auth still works
- `AdminPermission` is an OPTIONAL extension — if row doesn't exist, assume full access (safe default)
- JWT does NOT change — no new fields in session token needed for Phase 1

### C3. Approach — No Enum for Roles
- Keep `role` as `String` — enums in Prisma require enum migration + can break if values added wrong
- Validate role values in server actions instead: `["PRESENTER", "ADMIN", "STATION_MANAGER"].includes(role)`

---

## D. Required UI Plan (No Code)

### D1. `/admin/settings/branding`
**Purpose:** Edit system name, subtitle, logo upload, support contacts
**Fields:** systemName, systemSubtitle, logoUrl (upload or URL), supportPhone, supportWhatsapp, supportEmail
**Who can access:** Full admin only (`isFullAdmin = true` or no `AdminPermission` row)
**Required components:** `AdminPageShell`, form inputs, `StatusBadge` for save state, logo preview
**Risk:** LOW — DB read/write only, no auth logic touched

### D2. `/admin/settings/theme`
**Purpose:** Edit color tokens, default mode
**Fields:** primaryColor (color picker), accentColor, darkBgColor, defaultTheme (radio: dark/light)
**Who can access:** Full admin only
**Required components:** Color picker input, live preview strip, `AdminPageShell`
**Risk:** MEDIUM — color tokens must be injected into CSS variables at render time via inline `<style>` in layout, not via class changes. Safe if scoped to server-side layout injection.

### D3. `/admin/settings/admin-users`
**Purpose:** List all ADMIN users, create new limited admin, edit permissions
**Fields per user:** username, name, isFullAdmin toggle, per-module checkboxes, isActive
**Who can access:** Full admin only (full admins manage other admins)
**Required components:** `AdminPageShell`, `StatusBadge`, `EmptyState`, permission checkbox grid
**Risk:** MEDIUM — creates new users or edits permissions; must not allow demoting the last full admin (guard needed)

### D4. Entry Point
Add a **Settings** nav item to admin dashboard:
- `/admin/settings` → index page with cards for Branding, Theme, Admin Users
- Can be added as a new `AdminPageShell` page without touching existing pages

---

## E. Required Guard / RBAC Plan (No Code)

### E1. Full Admin — Unchanged Behavior
- `role === "ADMIN"` + (`AdminPermission.isFullAdmin === true` OR no `AdminPermission` row)
- All existing admin pages continue to work with zero change
- No JWT modification needed

### E2. Limited Admin — Check Pattern
```
// Server-side helper (new): requireAdminModule(session, "presenters")
// 1. Check role === "ADMIN" — if not, render <Unauthorized />
// 2. Fetch AdminPermission for session.user.id
// 3. If row missing OR isFullAdmin === true → allow
// 4. If row exists AND isFullAdmin === false → check canPresenters (or the module field)
// 5. If false → render <Unauthorized module="presenters" />
```

### E3. How Admin Pages Declare Module
Each page server component calls:
```ts
const perm = await requireAdminModule(session, "presenters");
// Returns: { allowed: true } or renders <Unauthorized />
```
This keeps page code clean — one line replaces the current manual `redirect("/login")` pattern.

### E4. Unauthorized Handling
- **Existing `<Unauthorized />` component** is reused — no change needed
- Add optional `module` prop for a clearer message: "ليس لديك صلاحية الوصول إلى قسم المذيعين"
- Never `redirect("/login")` for wrong-role admin — always render `<Unauthorized />`

### E5. Proxy / Middleware
- `src/proxy.ts` currently only checks `isLoggedIn` and redirects to `/stream/admin` or `/stream/studio`
- **No module-level check in proxy** — module checks stay on the server page (correct architecture)
- Proxy stays unchanged

---

## F. Safe Implementation Order (No Code, No Time Estimates)

1. **Add `SystemSettings` model to schema** — single row, all optional fields, safe defaults
2. **Migrate + seed** — create the singleton row with current defaults (`systemName="EGONAIR"`, etc.)
3. **Add `AdminPermission` model** — seed all existing ADMIN users as `isFullAdmin=true`
4. **Create `requireAdminModule` server helper** — reads AdminPermission, returns allowed/denied
5. **Create `/admin/settings` index page** — read-only display of current settings (no save yet)
6. **Add branding settings save** — systemName, subtitle, logo, support contacts
7. **Add theme tokens application** — inject `SystemSettings` color values as inline CSS vars in `layout.tsx` (server-side, no client JS needed)
8. **Add `/admin/settings/admin-users` page** — list + create + edit permissions
9. **Migrate existing admin pages** — replace `redirect("/login")` with `requireAdminModule()` + `<Unauthorized />` pattern (pages/stations, schedule, recordings, etc.)
10. **Add module permission checks to each page** — gradually, page by page, starting with least critical
11. **Audit log: add `modulePermission` tracking** — extend `AdminAuditLog.metadata` JSON field (no schema change needed)
12. **Regression check** — verify existing full admin login, role redirect, station manager scope all unchanged

---

## G. Risk / Do Not Touch

| Subsystem | Why Frozen |
|---|---|
| `studio-ui.tsx` | 2800-line broadcast engine, not related to admin/settings |
| `src/auth.ts` | Auth credentials flow must not change |
| `src/proxy.ts` | Route guard works correctly — module checks belong on pages, not proxy |
| Live/audio engine | Not related |
| Station Manager scope (`stationId IN assignedIds`) | Must not be relaxed |
| Existing ADMIN role routing | `role === "ADMIN"` check and JWT must remain |
| Existing shared filters (SMStationFilter, etc.) | Already fixed — do not touch |
| Media upload logic | Not related to settings/RBAC |
| `BroadcastSchedule` model | Legacy, frozen |
| Last full admin guard | Must ensure at least one `isFullAdmin=true` admin always exists |

---

## Summary of Findings

| Question | Answer |
|---|---|
| SystemSettings model exists? | ❌ No |
| AdminPermission model exists? | ❌ No |
| System name hardcoded? | ✅ Yes — 28 files |
| Logo hardcoded? | ✅ Yes — text/SVG inline |
| Favicon configured? | ✅ Yes — static `favicon.ico` only |
| Support contacts in DB? | ❌ No |
| CSS design tokens exist? | ✅ Yes — `globals.css` (`--eg-*`) |
| Tokens consistently used? | ❌ No — most pages use Tailwind classes directly |
| Dark mode global? | ✅ Yes |
| Light mode supported? | ❌ No |
| Multiple admins supported by schema? | ✅ Yes (role is string, no uniqueness) |
| Admin sub-roles / limited admin? | ❌ No |
| Module permission system? | ❌ No |
| Admin page guards consistent? | ⚠️ Mixed — some use `<Unauthorized />`, some use `redirect("/login")` |
| Audit log for admin actions? | ✅ Partial — `AdminAuditLog` model exists, usage unverified |
| Enums in Prisma schema? | ❌ None — all roles are plain strings |
