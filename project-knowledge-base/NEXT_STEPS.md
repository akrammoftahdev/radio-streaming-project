# EGONAIR — Next Steps (Ordered Backlog)

*Last updated: 2026-04-30 22:50 — CLOUD DEPLOYMENT PAUSED. Local verification required before next deploy.*

---

## ⏸️ IMMEDIATE: Local Verification Before Next Cloud Deploy

**Complete every item below in order. Do not skip ahead. Do not deploy until all pass.**

| # | Task | How | Pass Condition |
|---|------|-----|----------------|
| L1 | Start frontend | `cd frontend && npm run dev` | `http://localhost:3000` loads |
| L2 | Start backend-audio | `cd backend-audio && ENABLE_SHOUTCAST_LIVE=false npm run dev` | No crash, port 4001 open |
| L3 | Admin login | `http://localhost:3000/login` → `admin` / `admin123` | Redirects to `/admin` |
| L4 | Admin dashboard | `/admin` | Stat cards load, no errors |
| L5 | Presenter login | Create/use a PRESENTER account, login | Redirects to `/studio` |
| L6 | Studio pre-flight | Accept mic permissions | Pre-flight screen passes |
| L7 | WebSocket mic | Click Go Live (LIVE=false) | Chunks recorded, no crash |
| L8 | Recording archive | `/studio/recordings` | At least 1 recording shows |
| L9 | Admin recordings | `/admin/recordings` | Recordings visible |

**After all L1–L9 pass:** resume FIX-022B (cloud rebuild with `SKIP_BASEPATH=1`).

---


Work items are ordered by priority. Always complete all items in a group before moving to the next group.
Never skip ahead to a later group item if earlier items are incomplete.

---

## Group 0 — Pre-Integration Verification ✅ COMPLETE (2026-04-28)

> Verified full pipeline with `ENABLE_SHOUTCAST_LIVE=false`: token flow, WebSocket auth, local WebM recording (1.78 MB, 103 chunks), duplicate session guard, heartbeat API, clean disconnect. All 8 checks PASSED.

---

## Group 1 — Audio Pipeline Production Integration (IMMEDIATE PRIORITY)

These items complete the core streaming pipeline and are prerequisites for everything else.
Reference: `backend-audio/PRODUCTION_INTEGRATION_PLAN.md`

### 1.1 — Extend `ffmpeg-pipeline.ts` with SHOUTcast stdout pipe variant
**File:** `backend-audio/src/ffmpeg-pipeline.ts`  
**Task:** Add a `startFfmpegShoutcastPipeline(socket, bitrate)` function that pipes FFmpeg stdout
directly to a TCP socket instead of writing to a file.  
**Why:** Separates the FFmpeg pipeline concern into a reusable utility.

### 1.2 — Update `/api/internal/audio-token/validate` to return DJ credentials (✅ COMPLETE 2026-04-28)
> **Implemented and tested.** `route.ts` now loads `SonicPanelCredential` via Prisma after token verification, decrypts `djPasswordEncrypted` (and `streamPasswordEncrypted` if present) using AES-256-CBC via `src/lib/encryption.ts`, and returns the full `sonicPanel` object to backend-audio. Passwords are never logged. Returns `sonicPanel: null` gracefully when no row exists. All error paths (bad JSON / missing token / invalid token / DB failure) return safe non-leaking messages.
>
> **Seeded test data:** `SonicPanelCredential` row created for `test_presenter` (5f3ba1d8) → `akram@radio.socialgenix.com:4896`, bitrate=64, encrypted with production `ENCRYPTION_KEY`.

### 1.3 — Update `backend-audio/src/index.ts` to use per-presenter credentials (✅ COMPLETE 2026-04-28)
> **Implemented and verified.** `index.ts` now reads `validation.sonicPanel` from the validate response.
> - If `sonicPanel` is non-null → uses DB credentials (production path).
> - If `sonicPanel` is null AND dev env vars are set → uses env fallback with a `[WARN]` log.
> - If `sonicPanel` is null AND no dev env vars → closes WebSocket with code 1011 (safe failure).
> - `ENABLE_SHOUTCAST_LIVE=false` path is unchanged — no credentials consulted, recording only.
> - `buildV2Handshake()` now accepts params; no module-level `SHOUT_*` constants used in the live path.
> - Startup no longer crashes when env vars are missing — crash guard removed (credentials come per-session).
>
> **Verified:**
> - `ENABLE_SHOUTCAST_LIVE=false`: WS accepted, chunks recorded, no SHOUTcast lines in logs ✅
> - `ENABLE_SHOUTCAST_LIVE=true` + `sonicPanel: null` + no dev fallback: WS closed 1011 ✅

> **Live verification 2026-04-28:** 44 chunks, 746,634 bytes from browser → 369,837 bytes to SHOUTcast at 64.0 kbits/s. `.env` contained dummy host `stream.example.com` — handshake succeeded using DB credentials only. Recording: `session-20260428-112144-5f3ba1d8.webm` (729 KB). All checks PASS.

### 1.4 — Add session lifecycle endpoints in Next.js (✅ COMPLETE 2026-04-28)
> **Implemented and tested.** Three new internal API routes created:
> - `POST /api/internal/audio-session/started` — finds or creates active `LiveSession`, sets `status=LIVE`, `sonicConnectionStatus=ACCEPTED`.
> - `POST /api/internal/audio-session/ended` — finds active session, sets `status=ENDED`, `disconnectedAt`, `disconnectReason`.
> - `POST /api/internal/audio-session/error` — finds active session, sets `status=ERROR`, `sonicConnectionStatus=ERROR`, `disconnectReason=ERROR: <message>`.
> - All three handle: missing `presenterId` → 400, bad JSON → 400, no active session → graceful `{ ok: true, sessionId: null }`, DB error → 500.
> - Fields `localPath`, `bytesReceived`, `bytesSentToShoutcast` accepted and logged but not persisted (no columns in `LiveSession` — TODO in Group 3).
> - `errorMessage` capped at 500 chars to prevent unbounded DB writes.
> - All 8 curl tests PASS. DB state verified directly via Prisma client.
>
> **Remaining:** backend-audio must be updated (item 1.4b) to call these endpoints at the right lifecycle points.

### 1.4b — Wire backend-audio to call the lifecycle endpoints (✅ COMPLETE 2026-04-28)
> **Implemented and tested.** `backend-audio/src/index.ts` updated with fire-and-forget helpers:
> - `notifySessionStarted()` — called after SHOUTcast handshake accepted
> - `notifySessionEnded()` — called in `ws.on('close')` in both LIVE and disabled modes
> - `notifySessionError()` — called at 3 error sites: socket error, handshake rejection, FFmpeg spawn error
> - All use `AbortController` with 4s timeout; errors caught and logged as non-fatal warnings
> - Credentials never appear in any payload or log
> - Test 1 (`DISABLE` mode): WS connected, recording created, `notifySessionEnded` fired ✅
> - Test 2 (LIVE mode, no DB row): WS 1011 rejection fires correctly, no crash ✅
> - Test 3 (LIVE mode, DB creds): handshake accepted, `notifySessionStarted` fired ✅

### 1.5 — Add stale session watchdog (✅ COMPLETE 2026-04-28)
> **Implemented and tested.**
> - `STALE_TIMEOUT_MS = 15_000` (15 seconds — user specified this instead of 30s)
> - `startStaleTimer()` called on every binary chunk in `ws.on('message')`
> - On fire: `staleClose = true` → `cleanupLivePipeline` (LIVE mode only) → `ws.close(1001)`
> - `ws.on('close')` clears timer, reads `staleClose` flag, sends `reason: stale_timeout` or `disconnect`
> - No duplicate cleanup: `cleanupLivePipeline` only runs once (watchdog OR normal close, not both)
> - **Test 1 (stale timeout):** sent 4 chunks, went silent → WS closed 1001 at exactly 15s, `reason: stale_timeout` ✅
> - **Test 2 (normal disconnect):** sent 5 chunks, `ws.close(1000)` → `reason: disconnect`, timer cleared, no watchdog line ✅

### 1.6 — End-to-end live verification (✅ COMPLETE 2026-04-28)
> **PASSED.** Live test with `ENABLE_SHOUTCAST_LIVE=true`: 71 chunks received, SHOUTcast handshake accepted, 605,037 bytes sent to `radio.socialgenix.com:4896` at 64.0 kbits/s, FFmpeg exited code 0, socket closed cleanly. Recording: `session-20260428-094404-5f3ba1d8.webm` (1.2 MB).

---

## Group 2 — Admin Dashboard Live Stats (✅ COMPLETE 2026-04-28)

These items require Group 1 to be complete (session lifecycle must be persisted first).

### 2.1 — Populate Admin Dashboard stat cards (✅ COMPLETE 2026-04-28)
> **Implemented and tested.** `frontend/src/app/admin/page.tsx` updated:
> - Converted to `async` Server Component with `export const dynamic = "force-dynamic"`
> - Added auth guard (redirects non-ADMIN to /login)
> - Added `getDashboardStats()` using `Promise.all` for 3 parallel Prisma queries:
>   - `activePresenters`: `user.count` where `role=PRESENTER, isActive=true` → **3**
>   - `todaysShows`: `broadcastSchedule.count` where `isActive=true` and overlaps today (UTC midnight boundaries) → **1**
>   - `currentlyLive`: `liveSession.count` where `disconnectedAt=null, status in [LIVE, CONNECTED]` → **0**
> - AutoDJ card: hardcoded `غير مفعّل` (feature not yet built)
> - Single `try/catch` fallback: all cards show `"--"` if DB query fails
> - No new API routes. No schema changes. No client-side state. Design unchanged.
> - TypeScript: zero new errors (3 pre-existing errors unchanged)
> - Verified: browser showed `3 / 1 / 0 / غير مفعّل` ✅

---

## Group 3 — Recording Archive (Local-Only MVP)

> **Cloud storage decision:** Deferred to a future optional phase. Local filesystem storage is the MVP target.
> `cloudUrl` column is reserved in the schema but always null in current implementation.
> Item 3.1 (cloud provider selection) is removed from the MVP backlog.

### 3.1 — Select cloud storage provider (DEFERRED — not part of MVP)
> Cloud upload is a future enhancement. Item skipped. Local storage is sufficient for MVP.

### 3.2 — Add `Recording` model to Prisma schema (✅ COMPLETE 2026-04-28)
> **Implemented and verified.** `frontend/prisma/schema.prisma` updated:
> - New `Recording` model with `@@map("recordings")` table name
> - `id String @id @default(cuid())`
> - `presenterId`, `liveSessionId?`, `scheduleId?` (FKs)
> - `showDate?`, `startedAt`, `endedAt?`, `durationSeconds?` (timing)
> - `localPath` (relative filename only — e.g. `session-20260428-....webm`)
> - `format String @default("audio/webm")`, `bitrate?`, `bytesReceived?`
> - `cloudUrl?` (always null in MVP — reserved for future cloud phase)
> - `createdAt DateTime @default(now())`
> - Back-relations added: `User.recordings[]`, `LiveSession.recordings[]`, `BroadcastSchedule.recordings[]`
> - Applied with `prisma db push` (non-interactive SQLite dev environment)
> - Prisma Client auto-regenerated (v5.22.0)
> - Verified: `recording.count()` = 0, create/read/delete test row succeeded, all 14 fields confirmed, back-relation navigation confirmed

### 3.3 — Persist recording metadata after session ends (✅ COMPLETE 2026-04-28)
> **Implemented and tested.** `frontend/src/app/api/internal/audio-session/ended/route.ts` updated:
> - Added `import path from "path"` for `path.basename()` safety
> - Accepts both `recordingPath` (backend-audio field name) and `localPath` (alias); basename always extracted
> - `liveSession.update` now selects `scheduleId` and `connectedAt` for Recording derivation
> - After closing session: creates `Recording` row with all available fields
>   - `startedAt` = `LiveSession.connectedAt`
>   - `durationSeconds` = `Math.round((endedAt - startedAt) / 1000)`
>   - `showDate` fetched from `BroadcastSchedule.startDatetime` if `scheduleId` is set (optional, error swallowed)
>   - `localPath` = `path.basename(rawPath)` — filename only, never absolute
>   - `cloudUrl` = null (always in MVP)
>   - `bytesSentToShoutcast` accepted but NOT stored (no column) — logged only
> - **Non-fatal:** Recording creation failure returns `ok: true` with note, session is always closed
> - **Known fix:** after adding `Recording` model (item 3.2), dev server must be restarted to pick up regenerated Prisma Client
> - **Test 1 (no session):** `sessionId: null, recordingId: null, note: "no active session"` ✅
> - **Test 2 (full absolute recordingPath):** `recordingId` created, `localPath` = basename only ✅ DB row verified ✅
> - **Test 3 (no recordingPath):** session closed, `recordingId: null`, note: "Recording row skipped" ✅
> - **Test 4 (`localPath` alias):** works identically to `recordingPath` ✅

### 3.4 — Presenter recording archive page (✅ COMPLETE 2026-04-28)
> **Implemented and tested.** `frontend/src/app/studio/recordings/page.tsx` created.
> - `async` Server Component, `force-dynamic`, `metadata` title set
> - Auth: PRESENTER-only, redirects to `/login` for all other roles/no-session
> - DB: `prisma.recording.findMany({ where: { presenterId }, orderBy: { startedAt: "desc" } })`
> - `try/catch` — Arabic error state shown if DB fails
> - Empty state: music-note icon + Arabic message
> - Per-recording card: Arabic date (weekday+date), start/end time, duration (`X د Y ث`), bytes received (human-readable), filename badge, `<audio controls preload="none">` player, تحميل button (`?download=1`), "فتح في نافذة جديدة" button
> - All formatting via `Intl.DateTimeFormat("ar-EG", { timeZone: "Africa/Cairo" })`
> - Top bar: waveform icon, page title, back-to-studio link, logout Server Action
> - Wait-screen updated: `import Link` added, `<Link href="/studio/recordings">` inserted below countdown
> - TypeScript: zero new errors
> - Tests: unauthenticated → 307 → `/login` ✅ | presenter session → 2 recordings rendered ✅ | audio players load ✅ | download link `?download=1` ✅ | wait-screen link visible ✅
> - **Screenshot verified:** heading `أرشيف التسجيلات`, 2 recording cards, audio players, RTL layout, تحميل buttons

### 3.5 — Admin recording view (✅ COMPLETE 2026-04-28)
> **Implemented and tested.** `frontend/src/app/admin/recordings/page.tsx` created. `frontend/src/app/admin/page.tsx` updated with nav card.
> - `async` Server Component, `force-dynamic`, `metadata` title set
> - Auth: ADMIN-only, `redirect("/login")` for all others
> - DB: `prisma.recording.findMany({ orderBy: { startedAt: "desc" }, select: { ..., presenter: { select: { name, username } } } })`
> - `try/catch` — Arabic error state on DB failure; never crashes page
> - Empty state: music-note icon + Arabic message
> - Per-recording card: presenter badge (display name + @username), Arabic date/time/duration/size, filename badge (title tooltip), `<audio controls preload="none">` player, تحميل button (`?download=1`), فتح في نافذة جديدة button
> - Header: indigo→purple gradient heading, count pill, لوحة التحكم back link
> - Nav card: added to `/admin` with amber hover accent, emoji 🎙️🗂️, subtitle "عرض وتحميل جلسات البث المسجّلة"
> - TypeScript: zero new errors
> - Tests: unauthenticated → 307 → `/login` ✅ | admin session → recordings with presenter info ✅ | audio players ✅ | download link `?download=1` ✅ | nav card on dashboard ✅
> - **Screenshot verified:** admin dashboard showing recordings card; recordings page with presenter badges, audio players, RTL layout
>
> **⚠️ GROUP 3 IS NOW FULLY COMPLETE.** Items 3.2, 3.3, 3.4, 3.5, 3.6 all done.

### 3.6 — Recording file serving API (✅ COMPLETE 2026-04-28)
> **Implemented and tested.** New file: `frontend/src/app/api/recordings/[filename]/route.ts`
> - Auth: `await auth()` — 401 if no session
> - Role check: only ADMIN or PRESENTER; 403 for any other role
> - Filename validation (in order): no `"/"` or `"\\"` chars → must end `.webm` → `path.basename()` second-pass → confirm basename === original
> - DB lookup: `prisma.recording.findFirst({ where: { localPath: filename } })` — 404 if no row
> - Ownership: PRESENTER can only access their own recordings (403 if mismatch); ADMIN unrestricted
> - Path resolution: `path.resolve(RECORDINGS_BASE_DIR, filename)` → verified `startsWith(resolvedBase)` traversal guard
> - File existence: `fs.existsSync()` — 404 if missing from disk
> - File served as `new Uint8Array(buffer)` (resolves TypeScript `BodyInit` type constraint)
> - `Content-Type: audio/webm`, `Cache-Control: no-store`
> - `?download=1` → `Content-Disposition: attachment`; default → `inline`
> - `RECORDINGS_BASE_DIR="../backend-audio/debug-recordings"` added to `frontend/.env`
> - TypeScript: zero new errors
> - Tests: 401 (no session) ✅ | 400 (.mp3) ✅ | 404 (ghost.webm not in DB) ✅ | 200 (admin, real file) ✅ | attachment (?download=1) ✅

---

## Group 4 — Hybrid Media Sources (Requires Group 3 Complete)

See `FUTURE_REQUIREMENTS.md §2` for full specification.

### 4.1 — HTTP Range request support for recordings API (✅ COMPLETE 2026-04-29)
> **Implemented.** `frontend/src/app/api/recordings/[filename]/route.ts` updated:
> - `Range: bytes=N-M` header parsed and validated.
> - Valid range → 206 Partial Content + `Content-Range` + `Accept-Ranges: bytes` headers.
> - Invalid/unsupported range → 416 Range Not Satisfiable.
> - No Range header → 200 full file (original behaviour preserved).
> - All security layers (auth, ownership, path traversal) unchanged.
> - `Accept-Ranges: bytes` added to full-file responses too, so browsers know seek is possible.

### 4.2 — Admin recordings presenter filter (✅ COMPLETE 2026-04-29)
> **Implemented.** `frontend/src/app/admin/recordings/page.tsx` updated:
> - `searchParams: Promise<{ presenterId?: string }>` — Next.js 15 async pattern.
> - Filter bar with "جميع المذيعين" + one button per active presenter.
> - Active filter shows highlighted button + removal link.
> - Prisma query: `where: { presenterId: activeFilter }` when filter is set.
> - Empty state differs: generic vs filtered message + back link.
> - Per-recording "تسجيلاته فقط" quick-filter button when not filtered.
> - TypeScript: zero new errors.

### 4.3 — Studio media panel separation (✅ COMPLETE 2026-04-29)
> **Implemented.** Schema + studio page + UI updated:
> - `MediaCategory` schema: `ownerType String @default("ADMIN")`, `ownerId String?`. DB pushed. Prisma Client regenerated.
> - `studio/page.tsx`: fetches all 4 types (BACKGROUND, SONG, BREAK, AD) × 2 ownerTypes (ADMIN, PRESENTER). Passes 6 separate arrays to PreFlightScreen.
> - `pre-flight-screen.tsx`: forwards all 6 arrays to StudioUI.
> - `studio-ui.tsx`: 4-tab media library panel (`MediaTab` type):
>   - **خلفية** (Background) — green policy banner “✔ مسموح أثناء الميك”, accordion per category.
>   - **أغاني** (Songs) — amber policy banner “⚠ قائمة انتظار فقط أثناء الميك”, accordion with Now Playing / Next In Queue labels.
>   - **فواصل** (Breaks) — amber border, 2 sections: فواصل المحطة (ADMIN, amber accent) | فواصلي الشخصية (PRESENTER, قريباً placeholder).
>   - **إعلانات** (Ads) — rose border, 2 sections: إعلانات المحطة (ADMIN, rose accent) | إعلاناتي الشخصية (PRESENTER, قريباً placeholder).
> - ADMIN and PRESENTER sections are visually separate and never mixed.
> - No fake playback wired for BREAK/AD — “قريباً” badges on track rows.
> - Old separate song+background accordion blocks removed.
> - TypeScript: zero new errors.

### 4.4 — Local device file picker in Studio UI (✅ COMPLETE 2026-04-29)
> **Implemented.** `studio-ui.tsx` updated:
> - `LocalFile` type: `{ id, name, mimeType, objectUrl }`.
> - `localFiles: LocalFilesMap` state map (background/songs/breaks/ads).
> - `localObjectUrlsRef: Set<string>` tracks all object URLs for cleanup.
> - `useEffect` cleanup: revokes ALL object URLs on component unmount — no memory leaks.
> - `handleLocalFilePick(tab, FileList)`: creates object URLs, validates `audio/*` MIME, adds to state.
> - `handleRemoveLocalFile(tab, id)`: revokes URL, removes from state.
> - `handleClearLocalFiles(tab)`: revokes all URLs for tab, clears state.
> - Each tab has a "من جهازي" section (green accent) clearly separate from admin DB content.
> - Files shown with name, `<audio controls>` preview player, and ✕ remove button.
> - "+ اختر ملف صوتي من جهازك" dashed-border picker label per tab.
> - Songs/breaks/ads local files show amber warning: preview only, not broadcast via mic.
> - Files disappear on page refresh (session-scoped). No server upload. No DB.
> - Non-audio files silently skipped. TypeScript: zero new errors.

### 4.5 — Admin media type UI update (✅ COMPLETE 2026-04-29)
> **Implemented.** `admin/media/` updated:
> - `actions.ts`: VALID_TYPES = ["BACKGROUND", "SONG", "BREAK", "AD"]. ownerType: "ADMIN" set explicitly on create. Fixed `any` cast.
> - `media-client.tsx`: 4-tab UI with TYPE_META map (label, placeholder, color, activeCls per type). Info banners per tab. `Props` extended with `breakCategories/adCategories`.
> - `page.tsx`: fetches breakCategories/adCategories from DB, passes to MediaClient. Added `dynamic = "force-dynamic"`. Fixed `any` cast.

---

## Group 5-Cloud — Cloud Run + GCE Deployment (CURRENT ACTIVE PHASE)

**GCP infrastructure:** ✅ Provisioned | **Secrets:** ✅ Finalized | **Deploy:** ❌ Not executed
**Command reference:** Brain artifact `cloudrun_deployment_prep.md`

### 5-CR-0 — Resolve blockers before any build ✅ RESOLVED IN PLAN (2026-04-30)

> **FIX-007 RESOLVED:** `NEXT_PUBLIC_WS_URL` corrected to Cloud Run backend endpoint (Diamond Rule).
> - `wss://egonair-frontend-729286791857.europe-west1.run.app/stream-ws` was the VPS-only proxy path — wrong for Cloud
> - `wss://egonair-backend-audio-729286791857.europe-west1.run.app` is the correct final Cloud architecture endpoint (Diamond Rule)
> - Studio mic will fail gracefully (connection refused) until backend-audio GCE + DNS is live — safe and expected
> - Baking final value now avoids a second Docker rebuild when GCE is ready

> **FIX-008 RESOLVED:** `deploy/cloudrun-frontend.yaml` made available to Cloud Shell via GCS.
> - Phase B1 now uploads YAML to `gs://egonair-recordings/build-source/cloudrun-frontend.yaml` alongside source archive
> - Phase C retrieves it with `gsutil cp gs://egonair-recordings/build-source/cloudrun-frontend.yaml ~/cloudrun-frontend.yaml`
> - No Cloud Shell file upload button needed

### 5-CR-1 — Build frontend Docker image via Cloud Build

> **FIX-009 + FIX-010 applied (2026-04-30):** Docker build now requires re-upload of source to GCS first.
> Failed build `03c6f5f9` surfaced two blockers, now fixed:
> - `encryption.ts` validation moved to lazy `getKey()` (no more module-load throw)
> - Prisma `binaryTargets` set + `openssl` added to Dockerfile Alpine stages
> - Build-time stub secrets added to Dockerfile builder stage

**⚠️ GCS source archive is STALE.** Must re-run Phase B1 before Phase B2.

- Phase B1 (local Mac): Re-archive `frontend/` → upload to `gs://egonair-recordings/build-source/egonair-frontend-src.tar.gz`
- Phase B2 (Cloud Shell): `gcloud builds submit ... --async` → check status in GCP Console
- Image: `europe-west1-docker.pkg.dev/egonair-stream-prod/egonair/frontend:latest`

### 5-CR-2 — Fix DATABASE_URL secret → Apply database schema → Seed admin user

**🔴 CURRENT BLOCKER (FIX-011) — must complete before anything below:**

> `egonair-db-url` Secret Manager value uses TCP format (`127.0.0.1:5432`).
> Cloud Run needs Unix socket format.
> Error: `PrismaClientInitializationError: [P1001] Can't reach database server at '127.0.0.1:5432'`
> Fix: 3 Cloud Shell commands. Owner account required (`akrammoftahyt@gmail.com`).
> See FIX-011 in ISSUES_AND_FIXES.md for exact commands.

**After FIX-011 → 5-CR-2a: Run `prisma migrate deploy`** (requires explicit approval)
- Applies schema to Cloud SQL PostgreSQL
- Must be run via Cloud Shell with Cloud SQL Auth Proxy
- Command: `DATABASE_URL="<unix-socket-url>" npx prisma migrate deploy`

**After migrate → 5-CR-2b: Seed admin user** (requires explicit approval)
- Creates initial `admin` user with hashed password
- Command: `DATABASE_URL="<unix-socket-url>" npx tsx prisma/seed.ts`

**After seed → 5-CR-2c: Test login**
- URL: `https://egonair-frontend-kjvmkgy5va-ew.a.run.app/stream/login`
- Credentials: `admin` / `admin123` (change immediately after first login)YAML env vars → redeploy so NextAuth login redirects work

### 5-CR-4 — Smoke test Cloud Run (admin login + dashboard)
- Test login, admin dashboard — **do NOT test streaming yet**

### 5-CR-5 — Database migration SQLite → Cloud SQL (requires explicit approval)
### 5-CR-6 — Deploy backend-audio to GCE VM (blocked until 5-CR-4 passes)
### 5-CR-7 — DEPRECATED: egonair-backend-audio-729286791857.europe-west1.run.app DNS (Violates Diamond Rule - Use Cloud Run endpoints)

---

## Group 5-VPS — Production Hardening (SUPERSEDED — preserved for reference only)

> The steps below were the original VPS deployment plan. The project has pivoted to Cloud Run + GCE.
> Do NOT execute these steps unless explicitly instructed by the user.

**Original target:** `egonair-frontend-729286791857.europe-west1.run.app/stream` + `egonair-frontend-729286791857.europe-west1.run.app/stream-ws` (VPS LiteSpeed proxy)
**Full plan:** See `brain/group_5_0_deployment_plan.md`

### 5.0 — VPS/cPanel Server Audit & Deployment Plan (✅ PLAN COMPLETE 2026-04-29)
> Audit of project code complete. Server-side read-only checks still required (SSH needed).  
> Required code changes identified. Phased deployment roadmap written.  
> Unknowns blocking implementation: web server type, Node.js version, FFmpeg presence, SSL status.

### 5.1 — Server Backup & App Folder Preparation
> **Goal:** Create public_html backup; create `~/apps/egonair-stream/` and `~/recordings/` outside public_html.  
> **Risk:** 🟢 LOW  

### 5.2 — Environment Variables & Secrets Setup
> **Goal:** Production `.env` files with correct NEXTAUTH_URL, NEXTAUTH_SECRET, ENCRYPTION_KEY, RECORDINGS_BASE_DIR, NEXT_PUBLIC_WS_URL.  
> **Risk:** 🟡 MEDIUM (secrets rotation)

### 5.3 — Build Next.js for /stream Sub-Path
> **Goal:** Add `basePath: "/stream"` + `assetPrefix: "/stream"` to `next.config.ts`. Replace hardcoded `ws://localhost:4001` with `NEXT_PUBLIC_WS_URL` env var. Run `npm run build`.  
> **Risk:** 🔴 HIGH if basePath is wrong

### 5.4 — Run Services Internally with PM2
> **Goal:** PM2 manages Next.js (port 3000) and backend-audio (port 4001) internally. PM2 startup for server reboots.  
> **Risk:** 🟡 MEDIUM

### 5.5 — Reverse Proxy /stream and WebSocket Path
> **Goal:** Apache/LiteSpeed proxy routes `/stream` → Next.js and `/stream-ws` → WebSocket. Additive only — existing site untouched.  
> **Risk:** 🔴 HIGH (vhost edit)

### 5.6 — Recording Storage Permissions & Backup Plan
> **Goal:** `/home/<user>/recordings/` writable by Node process; daily rsync backup.  
> **Risk:** 🟢 LOW

### 5.7 — Production Smoke Test
> **Goal:** Full end-to-end test on production. 10-point checklist.  
> **Risk:** 🟢 LOW

### 5.8 — Optional Postgres Migration
> **Goal:** Replace SQLite with Postgres from existing docker-compose.yml.  
> **Recommendation:** Keep SQLite + PM2 single-instance for launch; migrate if needed.  
> **Risk:** 🟡 MEDIUM

---

*Update this file at the end of every work session. Mark completed items with ✅ and a date.*

---

## 🟢 Safe Exit — 2026-04-28 16:55

All processes stopped. Full backup at `backups/2026-04-28_16-55-safe-exit/`.  
Groups 1–3 complete. Next task: Group 4 / production hardening.  
Safe start: `cd frontend && npm run dev` then `cd backend-audio && ENABLE_SHOUTCAST_LIVE=false npm run dev`.


---

## NEXT SESSION — REAL RADIO MIXER TEST (2026-05-06 safe exit)

### Context
Web Audio mixer was implemented and fixed. Mic architecture was split from broadcast session.
Mic was previously heard on radio. Background/Break/Ad NOT yet confirmed on radio after latest fix.

### Pre-Start Checklist
- [ ] Start frontend dev server: `cd frontend && npm run dev`
- [ ] Start backend-audio: `cd backend-audio && ENABLE_SHOUTCAST_LIVE=true npm run dev`
- [ ] Confirm port 3000 (frontend) and port 4001 (backend-audio) are live
- [ ] Confirm `adminfinal_test` schedule is valid (check endDatetime vs current time)
  - If expired, renew ONLY via Prisma update before starting test — report first
- [ ] Open: http://localhost:3000/stream/studio
- [ ] Open radio listener: http://radio.socialgenix.com:4896 on a second device

### Test Sequence
1. Login: `adminfinal_test` / `presenter123`
2. Pass pre-flight (mic permission)
3. Click **الاتصال** (Connect)
4. Click mic button → **mic opens** → session starts (WS + AudioContext + mixer built)
5. Speak 5-10 seconds → confirm mic heard on radio listener
6. Click **خلفية** tab → select **Ambient Lounge** → confirm background starts
7. Confirm background heard under mic on radio (should be at 10% ducked while mic open)
8. Click mic button → **mic closes** (muteMic only — WS/MediaRecorder/AudioContext stay alive)
9. Confirm on backend-audio log: session still active, heartbeat still firing
10. Queue **TEST Presenter Break Track** → click ▶ تشغيل
11. Confirm **880Hz tone heard on radio** (KEY TEST — first real confirmation of queue-to-SHOUTcast)
12. Stop break → queue **TEST Presenter Ad Track** → play
13. Confirm **660Hz tone heard on radio**
14. Click mic button → **mic re-opens** (reconnects to existing session, no new WS/token)
15. Speak again → confirm mic heard on radio again
16. Click **قطع الاتصال** (Disconnect) → confirm clean close
17. Confirm backend log: `session-ended reason: disconnect` (not stale_timeout)

### Success Criteria
- [ ] Mic heard on radio: YES
- [ ] Background heard on radio (even at 10% ducked): YES
- [ ] BREAK 880Hz heard on radio while mic closed: YES ← most critical
- [ ] AD 660Hz heard on radio while mic closed: YES
- [ ] Mic re-open on same session (no new token needed): YES
- [ ] Clean disconnect (not stale_timeout): YES

### Files to Watch
- backend-audio logs: `bytesSentToShoutcast` increases during all phases
- Browser console: no `InvalidStateError`, no `already connected` errors

### If Something Fails
- If background not heard: check bgGainRef.current is connected to mixerDestRef
- If break/ad not heard: check queueGainRef.current is connected to mixerDestRef
- If stale_timeout occurs: heartbeat is being stopped somewhere — grep `clearInterval` in muteMic
- If mic re-open fails: check `sessionAlive` branch in toggleMic → existingCtx path


---

## UNIFY BACKGROUND/QUEUE PLAYBACK WITH PROVEN FILE-TO-MIXER PATH — 2026-05-07

### Context
- `TEST FILE TO MIXER` button (static `/stream/test-audio/test-presenter-break.mp3`) was heard on real radio. ✅
- Normal background/queue UI flow (using `/stream/api/tracks/${trackId}`) is NOT heard on radio. ❌
- All mixer graph code is correct — the failure is upstream (src, fileUrl, or API route).

### Next Session Must Do (in order, one at a time)

**Step 1 — Verify `/stream/api/tracks/{id}` serves real audio**
```bash
# Pick any real trackId from the DB, then:
curl -v -I http://localhost:3000/stream/api/tracks/{trackId} \
  -H "Cookie: <session-cookie>"
# Confirm: Content-Type: audio/mpeg or audio/mp3
# Confirm: HTTP 200 or 206
# Confirm: Content-Length > 0
```
If 401/403 → auth issue in the API route.
If 404 → track file missing from disk.
If 200 but Content-Length 0 → empty file.

**Step 2 — Verify the same trackId resolves to the same file as the working test file**
```bash
# Expected: the Break track in DB points to the same file as public/test-audio/test-presenter-break.mp3
# If not, the DB track rows may point to non-existent files
```

**Step 3 — Extract TEST FILE TO MIXER logic into a reusable helper**
```typescript
// In studio-ui.tsx — create helper:
const playDirectToMixer = (src: string, gainValue = 0.8) => {
  const ctx  = audioCtxRef.current;
  const dest = mixerDestRef.current;
  if (!ctx || !dest) return null;
  const audio = new Audio(src);
  const source = ctx.createMediaElementSource(audio);
  const gain   = ctx.createGain();
  gain.gain.value = gainValue;
  source.connect(gain);
  gain.connect(dest); // → mixerDest ONLY
  audio.loop = false;
  return audio; // caller calls audio.play()
};
```

**Step 4 — Replace background effect path with helper**
- Use `playDirectToMixer('/stream/api/tracks/' + activeBgTrackId, isMicOpen ? 0.10 : bgVolume)`
- Set `audio.loop = true` after creation

**Step 5 — Replace playQueueItem mixer path with helper**
- Use `playDirectToMixer(src, queueVolume)`

**Step 6 — Test one item at a time**
1. Background track only (mic open) → Akram confirms heard on radio
2. BREAK via queue (mic closed) → Akram confirms heard on radio
3. AD via queue (mic closed) → Akram confirms heard on radio

### Do NOT Change
- Backend (backend-audio)
- SHOUTcast config
- Mixer architecture (MediaRecorder, mixerDest, AudioContext)
- Cloud infrastructure
- Secrets or env

### Success Condition
Akram hears background, BREAK, AD, and mic all on the real radio output in a single session.


---

## NEXT PHASE OPTIONS — 2026-05-09

### Recommended: UPLOAD / FILE MANAGEMENT

**Goal:** Allow admin and presenter to upload audio files directly from the studio UI.

**Scope:**
- Admin upload for Background, Songs, Breaks, Ads (shared library)
- Presenter upload for personal Breaks and Ads (owned content)
- File validation: accept mp3/mpeg/wav, enforce size limit (e.g. 50MB), read duration metadata
- Store uploaded files in server-local storage first (not Cloud yet)
- Automatically create a MediaTrack record linked to the upload
- Respect ownerType (ADMIN / PRESENTER) and ownerId for isolation
- Keep admin files separate from presenter files in DB queries
- After upload pipeline is complete: test uploaded tracks on real radio end-to-end

**Why first:**
Presenters currently cannot upload personal media from the UI. All tracks require manual DB insertion. This is the largest UX gap remaining in the local studio.

---

### Alternative: RECORDING / ARCHIVE VERIFICATION

**Goal:** Confirm that live broadcast sessions are being recorded and stored properly.

**Scope:**
- Verify that recording triggers after a real broadcast session
- Check presenter archive page — can they find and play back recorded sessions?
- Check admin archive — full session list, download, seek/range support
- Confirm file format and duration metadata are correct
- Test partial/interrupted session recording recovery

---

### After Both: LONG ENDURANCE TEST

- Run a 2+ hour sustained broadcast with mic + background + queue items cycling
- Monitor for: memory leaks, WebSocket drops, buffer underruns, ctx.destination bleed
- Check backend-audio logs for stale_timeout and reconnect cycles


---

## NEXT PHASE: RECORDING / ARCHIVE VERIFICATION
**Added:** 2026-05-09
**Priority:** High — must complete before endurance test or cloud deploy

### Context
Upload / File Management basic local phase is fully closed (manually verified by Akram).
The next phase is to verify that live session audio is correctly recorded and archived.

### Scope

#### 1. Presenter Archive (First Priority)
- [ ] Confirm that a live broadcast session creates a recording file in `backend-audio/debug-recordings/`
- [ ] Confirm recording filename contains session ID and timestamp
- [ ] Confirm recording is a valid `.webm` (or `.mp3` if converted) audio file
- [ ] Confirm recording is playable and contains expected audio (mic + background + queue)
- [ ] Confirm recording duration matches broadcast session length
- [ ] Confirm recording is accessible to the presenter (download link / archive page if implemented)

#### 2. Admin Archive (Second Priority)
- [ ] Confirm admin can view and list all session recordings
- [ ] Confirm admin can download individual recordings
- [ ] Confirm recordings are not deleted after session ends
- [ ] Confirm recordings are not overwritten by new sessions

### Rules for This Phase
- Test locally only
- Do not deploy to Cloud
- Do not change secrets
- Do not run migration/seed unless schema changes are confirmed necessary

### Success Criteria
- At least one full-cycle recording verified: Connect → mic on → queue play → mic off → Disconnect → file exists → playable


---

## NEXT PHASE: LIVE RADIO OUTPUT VERIFICATION

*Added: 2026-05-11 01:52 (Africa/Cairo)*
*Priority: HIGH — must be done after RECORDING-START-FIX-VERIFIED checkpoint*

### Objective

Verify that the SHOUTcast live radio output pipeline works end-to-end for the active presenter.
This is separate from recording verification. Recording is confirmed working; radio output is not yet confirmed.

### Steps (in order, each requires confirmation before next)

1. **Start backend-audio with ENABLE_SHOUTCAST_LIVE=true**
   ```bash
   cd backend-audio && ENABLE_SHOUTCAST_LIVE=true npm run dev
   ```

2. **Verify token + credential resolution**
   - Confirm `stationId` is embedded in the audio token (check `[audio-token/create]` log).
   - Confirm credentialSource is one of:
     `presenter_station` / `station_default` / `legacy_presenter`
   - If `sonicPanel: null` — credential missing, fix before proceeding.

3. **Verify FFmpeg starts**
   - Backend log: `[FFmpeg] Process started. PID: ...`
   - If FFmpeg not found: install or verify PATH.

4. **Verify SHOUTcast socket connects**
   - Backend log: `[SHOUTcast] Sending v2 SOURCE handshake for ...@...`

5. **Verify SOURCE handshake accepted**
   - Backend log: `[SHOUTcast] Handshake accepted ✓`
   - If rejected: check DJ credentials in DB (host / port / username / password).

6. **Verify bytes flowing**
   - Backend log: `bytesSentToShoutcast` > 0
   - Confirm chunks are arriving: `[Data] chunk #N`

7. **Akram manually confirms radio output is heard**
   - Listen to the station stream (SonicPanel listener page or direct stream URL).
   - Confirm audio (background / mic / queue) is audible on the live stream.

### Known DB State (as of 2026-05-11)

| Item | Value |
|------|-------|
| Active presenter (test) | `78bc5b48` |
| Presenter station | `8c3092b9` (شمر) |
| StationDefaultCredential | `shammar@radio.socialgenix.com:4898` — `is_active=1` |
| SonicPanelCredential (legacy) | `station_id=NULL` — is_active=1 — serves as P3 fallback |
| Expected credentialSource | `station_default` (P2) or `legacy_presenter` (P3) |

### Rules for this phase

- No browser automation unless explicitly approved by Akram.
- No credential changes without Akram approval.
- No schema changes.
- No cloud deployment.
- Max 5-minute rule per agent step.
- Stop and report at first unexpected error — do not guess or retry blindly.

---

## NEXT PHASE: PROGRAM SCHEDULE HARDENING

*Added: 2026-05-11 02:04 (Africa/Cairo)*
*Priority: Next after RECORDING-AND-LIVE-OUTPUT-VERIFIED checkpoint*

### Objective

Harden the Program Schedule system so that schedules are reliable, conflict-free, and support real-world broadcast exceptions.

### Sub-tasks

#### 1. Conflict Detection

Reject schedule rules/slots that would overlap with existing ones:

- **Same station + overlapping time window** = FORBIDDEN
  - E.g. two programs on Station A both scheduled Mon 10:00–11:00
- **Same presenter + overlapping time window** = FORBIDDEN
  - A presenter cannot be in two programs simultaneously

Implementation notes:
- Run conflict check on create AND edit of schedule rules/slots.
- Return clear Arabic error messages in the admin UI.
- Conflict check should be a server action / API route, not only client-side.

#### 2. Schedule Rule / Slot Editing

Currently rules and slots can be created but not edited inline. Add:
- Edit form for `ProgramScheduleRule` (day, startTime, endTime, station)
- Edit form for `ProgramScheduleSlot` (date, startTime, endTime, override)
- Confirm edit only if no conflict is introduced.

#### 3. Special / Exception Episodes

Add `ProgramScheduleException` support for:

| Type | Meaning |
|------|---------|
| `EXTRA_EPISODE` | Extra broadcast not in normal rule |
| `SPECIAL_EVENT` | One-time special on a date |
| `CANCELLED` | Normal slot cancelled for a specific date |
| `RESCHEDULED` | Normal slot moved to different time on same date |

UI: allow admin to add/remove exceptions per program per date.

#### 4. Station-Aware Schedule Logic

- Ensure `resolve-program-session.ts` respects station assignments.
- Studio Gate (wait-screen + pre-flight) must use the resolved station from the Program schedule.
- Audio token must embed the correct `stationId` for credential resolution.

#### 5. Studio Gate Preservation

- Do NOT change the recording or live output flow.
- Studio Gate continues to use the Program Schedule resolver.
- Only conflict detection + exception handling are new.

### Rules for This Phase

- Edit files: admin program pages, schedule rule/slot forms, resolve-program-session.ts, server actions.
- Do NOT touch studio-ui.tsx unless a schedule field needs to be passed differently.
- Do NOT touch backend-audio.
- Do NOT touch recording/live flow.
- Schema changes require migration — always run `npx prisma migrate dev` in dev.
- Always TypeScript-check after edits: `npx tsc --noEmit`.
- Max 5-minute rule per agent step.

---

## NEXT ISSUE: FIX EXIT STUDIO BUTTON

*Added: 2026-05-11 02:20 (Africa/Cairo)*
*Priority: Immediately after PROGRAM-SCHEDULE-EDIT-VERIFIED checkpoint*

### Problem

The Exit Studio button currently only disconnects the WebSocket/session (or may not do so reliably), but does not navigate the presenter back out of the Studio UI. Presenter is left on the Studio page with no way to properly exit without a browser refresh.

### Required Behavior

1. If presenter is **connected** when Exit is clicked:
   - Call `stopBroadcastSession()` first (clean disconnect — stops MediaRecorder, closes WS, stops keepalive).
   - Wait for cleanup to complete.
   - Then navigate out.

2. If presenter is **not connected** (pre-flight / wait state):
   - Navigate out immediately — no cleanup needed.

3. Navigation target after exit:
   - Return to the Studio landing page, or
   - Return to the presenter's dashboard/home page.
   - Must use correct `basePath` (`/stream/...`) — do NOT use bare paths that break in subdirectory deployment.

4. State reset:
   - `isConnected` → false
   - `isMicOpen` → false
   - All audio sources stopped
   - Any pending timers/watchdogs cleared

### What NOT to Do

- Do NOT delete or cancel the presenter's schedule on exit.
- Do NOT trigger a DB session end directly from the button (backend handles this on WS close).
- Do NOT navigate to `/studio` without the correct basePath prefix.
- Do NOT skip the clean disconnect if mic is open.

### Files to Edit

- `frontend/src/app/studio/studio-ui.tsx` — Exit button handler (likely `handleExitStudio` or similar)
- `frontend/src/app/studio/pre-flight-screen.tsx` — Exit button if present on pre-flight
- `frontend/src/app/studio/wait-screen.tsx` — Exit button if present on wait screen

### Rules

- Max 5 minutes per agent step.
- Edit only studio UI files listed above.
- Do NOT edit backend-audio.
- Do NOT edit schema or DB.
- TypeScript check after edits: `npx tsc --noEmit`.
- No browser test — Akram will verify manually.

---

## NEXT ISSUE: BACKGROUND VOLUME CALIBRATION

*Added: 2026-05-11 03:02 (Africa/Cairo)*
*Priority: After PROGRAM-SCHEDULE-TIME-RESOLVER-VERIFIED checkpoint*

### Objective

Ensure background audio volume behaves correctly in all studio states:
when the mic is open, when the mic is closed, and when queue items play.

### Required Behavior

| Scenario | Expected Background Volume |
|----------|--------------------------|
| Studio connected, no mic, no queue | Background at full volume |
| Mic opens | Background ducks (reduces) to ~30% or configured level |
| Mic closes | Background returns to full/configured level |
| Song / Break / Ad starts playing from queue | Background ducks or mutes |
| Song / Break / Ad finishes | Background returns to previous level |
| Monitoring headphones | Volume controlled independently (does NOT affect broadcast level) |

### Files to Inspect / Edit

- `frontend/src/app/studio/studio-ui.tsx`
  - `bgGainRef` — controls broadcast background volume
  - `monitorGainRef` — controls headphone monitor volume
  - Mic toggle handler — should adjust `bgGainRef.gain.value` on open/close
  - Queue play handler — should adjust `bgGainRef.gain.value` on start/end

### Rules

- Max 5 minutes per agent step.
- Edit only `studio-ui.tsx`.
- Do NOT edit `resolve-program-session.ts` — schedule resolver is stable now.
- Do NOT edit backend-audio.
- Do NOT edit schema or DB.
- TypeScript check after edits: `npx tsc --noEmit`.
- No browser test — Akram will verify manually.

### Do NOT Touch
- Schedule resolver (just fixed — fragile)
- Recording lifecycle
- Live SHOUTcast flow
- Exit Studio button
- Auto-disconnect watchdog

---

## NEXT WORK QUEUE — Updated 2026-05-11 05:51 (Africa/Cairo)

*Priority order based on Akram-confirmed state at CURRENT-LOCAL-PROJECT-STATE-SAVED checkpoint.*

### Priority 1 — Fix WaitScreen Time/Countdown Mismatch 🔴
- Check `wait-screen.tsx` countdown uses `gateOpenTimeMs` correctly.
- Check `page.tsx` passes the correct UTC epoch from resolver.
- Verify `nextBroadcastTime` and `sessionEndTime` labels display Cairo wall-clock time.
- Files: `wait-screen.tsx`, `page.tsx`, `resolve-program-session.ts`.
- Rule: Do NOT break resolver fix — use `Intl`-only Cairo midnight calculation.

### Priority 2 — Background ↔ Queue 3-Second Crossfade 🔴
- When mic closes and queue has a READY item:
  1. Background fades from current level → 0 over 3 seconds (`bgGainRef.gain.linearRampToValueAtTime`).
  2. Queue item fades in from 0 → queueVolume over 3 seconds.
  3. After fade completes, queue plays normally.
- When queue item ends:
  1. Queue fades out over 1–2 seconds.
  2. Background fades back in to bgVolume.
- File: `studio-ui.tsx` only.

### Priority 3 — Background Loop → Queue Crossfade When Item Added 🟡
- If mic is closed and queue is empty: background loops at full bgVolume.
- When a new queue item is added (and auto-queue is ON):
  1. Detect new READY item.
  2. Crossfade: background fades down, queue item fades in.
- File: `studio-ui.tsx` only.

### Priority 4 — Admin Presenter Password Change 🟡
- Add "Change Password" UI in admin presenter management.
- Server action: hash new password, update DB.
- Files: `frontend/src/app/admin/presenters/[id]/edit/` (new or existing).

### Priority 5 — Schedule Conflict Detection 🟡
- On rule/slot create or edit:
  - Query existing slots for the same station and time window.
  - Query existing slots for the same presenter and time window.
  - If overlap found → return validation error before saving.
- File: `actions.ts` in admin programs edit.
- Do NOT touch resolver.

### Priority 6 — Special/Exception Episodes 🟡
- Add episode types: EXTRA_EPISODE, SPECIAL_EVENT, CANCELLED, RESCHEDULED.
- Schema may need migration.
- UI: admin Programs page episode management.

### Priority 7 — Presenter + Station DJ Credential Override 🟡
- Complete per-presenter SonicPanel credentials.
- Fallback chain: presenter creds → station default DJ → .env.

### Priority 8 — Station Manager Role 🟡
- Manager manages one station only.
- Multiple managers can manage same station.
- Manager can create/manage own presenters.
- Manager cannot access other stations' presenters.

### Priority 9 — UI/UX + Calendar + Dashboard 🟢
- Design alignment against EGONAIR reference images.
- Schedule calendar view.
- Admin dashboard stats.

### Priority 10 — Debug Cleanup + Endurance Test 🟢
- Remove [DIAG], [BgGain], [Studio], test buttons.
- Run 2+ hour endurance test.
- Then Cloud deployment.

---

## ISSUE STATUS UPDATE — 2026-05-11 06:00 (Africa/Cairo)

### ✅ CLOSED — WaitScreen Countdown/Hydration Mismatch
- **Root cause:** `Date.now()` in `useState()` initializers in `wait-screen.tsx`.
- **Fix:** Deterministic initial state (`0`/`false`), `Date.now()` moved to `useEffect`.
- **File:** `wait-screen.tsx` only.
- **Verified:** Akram confirmed OK. TypeScript 0 errors.

---

## UPDATED WORK QUEUE — 2026-05-11 06:00

| Priority | Issue | Status |
|----------|-------|--------|
| 1 | Fix WaitScreen countdown/hydration | ✅ CLOSED |
| 2 | **Background ↔ Queue 3-second crossfade** | 🔴 NEXT |
| 3 | Background loop → queue crossfade when item added | 🟡 OPEN |
| 4 | Admin presenter password change | 🟡 OPEN |
| 5 | Schedule conflict detection | 🟡 OPEN |
| 6 | Special/exception episodes | 🟡 OPEN |
| 7 | Presenter + Station DJ credential override | 🟡 OPEN |
| 8 | Station Manager role | 🟡 OPEN |
| 9 | UI/UX + Calendar + Dashboard | 🟢 OPEN |
| 10 | Debug cleanup + endurance test + Cloud deploy | 🟢 OPEN |

### Next Step Detail: Background ↔ Queue 3-Second Crossfade
When mic closes and a READY queue item exists:
1. `bgGainRef.gain.linearRampToValueAtTime(0, ctx.currentTime + 3)` — bg fades to 0.
2. Start queue item with queueGain at 0.
3. `queueGainRef.gain.linearRampToValueAtTime(queueVolume, ctx.currentTime + 3)` — queue fades in.
4. After 3s: queue plays at full volume, bg silent.

When queue item ends:
1. `bgGainRef.gain.linearRampToValueAtTime(bgVolume, ctx.currentTime + 2)` — bg fades back.

File to edit: `studio-ui.tsx` only.
Do NOT change: `applyBgGain`, `micGainRef`, `monitorGainRef`, recording/live flow.

---

## ISSUE STATUS UPDATE — 2026-05-11 06:34 (Africa/Cairo)

### ✅ CLOSED — Background Duck Ratio
- **Final value:** `BG_DUCK_RATIO = 0.10`
- **Formula:** `bgGain = bgVolume * 0.10` when mic open
- **File:** `studio-ui.tsx` only

### ✅ WORKING — Background ↔ Queue Crossfade
- bg→queue: 3-second fade via `linearRampToValueAtTime`
- queue→bg: 2-second fade on queue end or manual stop
- No issues reported — treat as STABLE unless Akram reports regression

---

## UPDATED WORK QUEUE — 2026-05-11 06:34

| Priority | Issue | Status |
|----------|-------|--------|
| 0 | Hydration error after hard refresh | ❓ CHECK FIRST — if present, fix before anything else |
| 1 | Background duck ratio | ✅ CLOSED |
| 2 | Background ↔ Queue crossfade | ✅ WORKING |
| 3 | WaitScreen countdown hydration | ✅ CLOSED |
| 4 | **Program Schedule conflict detection** | 🟡 NEXT (if no hydration error) |
| 5 | Special / exception episodes | 🟡 OPEN |
| 6 | Admin presenter password change | 🟡 OPEN |
| 7 | Presenter + Station DJ credential override | 🟡 OPEN |
| 8 | Station Manager role | 🟡 OPEN |
| 9 | UI/UX + Calendar + Dashboard | 🟢 OPEN |
| 10 | Debug cleanup + endurance test + Cloud deploy | 🟢 OPEN |

### If Hydration Error Still Visible After Hard Refresh
Next step: FIX CURRENT HYDRATION SOURCE
- Identify exact component from React console error stack.
- Check if it is inside `RecordingCompactPlayer`, `WaitScreen`, or `PreFlightScreen`.
- All three already have `mounted` guards — look for NEW un-guarded `Date.now()`, `Intl`, or browser-only state in `useState` initializers.

---

## NEXT STEPS AFTER SCHEDULE CONFLICT DETECTION — 2026-05-11 07:08 (Africa/Cairo)

### ✅ CLOSED — Basic Schedule Conflict Detection
- `hasTimeOverlap` + `daysOverlap` + `checkSlotConflicts` implemented.
- Wired into `createScheduleSlot` and `updateScheduleSlot`.
- DAILY / WEEKLY / SELECTED_DAYS / ONE_TIME all handled.
- UI error delivery fixed (no more Runtime Error page).
- **Do not redo** unless a specific regression is reported.

### Critical Rule for Future Admin Form Errors
> **Never use raw `throw new Error(...)` for user-facing admin validation in server actions.**
> Next.js will propagate unhandled errors to the error boundary → white Runtime Error page.
> Always catch and `redirect(...?error=<encoded>)` or use `useActionState` with return values.

### Next Schedule Hardening Options (Priority Order)

| # | Task | Notes |
|---|------|-------|
| 1 | **Confirm same-presenter overlap** | Logic exists; Akram to test with two programs on different stations, same presenter, overlapping time |
| 2 | **Special/exception episode conflicts** | `ProgramScheduleException` model ready; integrate into `checkSlotConflicts` or add separate check |
| 3 | **Schedule calendar UI** | Visual grid view; low priority until core logic is stable |
| 4 | **Station Manager role** | Admin delegation; separate feature |

### Keep Conflict Detection Server-Side
- All overlap checks must remain in `edit/actions.ts` server actions.
- Do not move to client-side only — client-side can be added as UX preview later.

### If Conflict Detection Regresses
1. Check `hasTimeOverlap` — must be `startA < endB && endA > startB`.
2. Check `daysOverlap` — DAILY must conflict with everything.
3. Check `try/catch` wrapping — conflict must redirect, not throw.
4. Compare against backup: `backups/2026-05-11_07-08-schedule-conflict-detection-verified/`.

---

## WORK QUEUE — AFTER LOCAL-CORE-SYSTEM-VERIFIED — 2026-05-11 07:13 (Africa/Cairo)

All local core modules are verified. The following is the recommended work queue for the next session:

| # | Task | Type | Priority |
|---|------|------|---------|
| 1 | **Station Manager role** | Feature | 🟡 HIGH |
| 2 | **Presenter + Station DJ credential override** | Feature | 🟡 HIGH |
| 3 | **Schedule Calendar UI / polish** | UI | 🟡 MEDIUM |
| 4 | **UI/UX Design Alignment (EGONAIR reference images)** | Design | 🟡 MEDIUM |
| 5 | Debug cleanup (remove [DIAG] logs, test buttons) | Cleanup | 🟢 LOW |
| 6 | Endurance test (multi-hour broadcast stability) | Testing | 🟢 LOW |
| 7 | Cloud deployment (production launch) | Deployment | 🟢 FINAL |

### Rules for Next Session
- Do NOT reopen verified modules unless a regression is reported.
- Any admin validation error must redirect with `?error=<encoded>`, never raw `throw new Error`.
- BG_DUCK_RATIO must stay at `0.10`.
- Crossfade durations: bg→queue 3s, queue→bg 2s.
- All conflict detection must remain server-side in `edit/actions.ts`.

---

## ISSUE STATUS UPDATE — 2026-05-11 19:39 (Africa/Cairo)

### ✅ CLOSED — Admin Presenter Password Change
- **Feature:** "تغيير كلمة مرور المذيع" card on presenter edit page.
- **Action:** `updatePresenterPassword(formData)` server action.
- **Auth:** ADMIN-only.
- **Hashing:** `bcrypt.hash(newPassword, 10)` — matches existing create-presenter flow.
- **Only `User.passwordHash` updated** — no other presenter data changed.
- **Verified by Akram:** ✅ Password changed, presenter logged in with new password.
- **Do not reopen** unless a specific regression is reported by Akram.

---

## UPDATED WORK QUEUE — 2026-05-11 19:39

| Priority | Issue | Status |
|----------|-------|--------|
| 1 | Admin presenter password change | ✅ VERIFIED — CLOSED |
| 2 | **Station Manager role** | 🟡 NEXT OPTION |
| 3 | Presenter + Station DJ credential override | 🟡 OPEN |
| 4 | My Profile page (admin / presenter / station manager) | 🟡 FUTURE |
| 5 | Admin/Station Manager/Presenter self password change | 🟡 FUTURE |
| 6 | Avatar / profile image | 🟢 FUTURE |
| 7 | Station Manager can change password only for own presenters | 🟡 FUTURE |
| 8 | Schedule Calendar UI / visual polish | 🟢 OPEN |
| 9 | UI/UX Design Alignment (EGONAIR reference images) | 🟢 OPEN |
| 10 | Debug cleanup + endurance test + Cloud deployment | 🟢 FINAL |

### Rules Carried Forward
- Do NOT reopen Admin presenter password change unless regression reported.
- Any admin validation error must redirect with `?error=<encoded>`, never raw `throw new Error`.
- BG_DUCK_RATIO must stay at `0.10`.
- Crossfade durations: bg→queue 3s, queue→bg 2s.
- All conflict detection must remain server-side in `edit/actions.ts`.

---

## Update: 2026-05-11 — PRESENTER-TYPE-UI-RESTRUCTURE-VERIFIED

### Completed ✅
- [x] Presenter Type UI Restructure — **VERIFIED BY AKRAM**
  - SINGLE_STATION / MULTI_STATION / DIRECT_DJ create flows with correct station selectors.
  - Edit page type-specific sections.
  - Legacy SonicPanel UI removed.
  - Program-guard on MULTI_STATION station removal.

### Next Queue (Priority Order)
| # | Task | Status |
|---|------|--------|
| 1 | Presenter + Station DJ credential override | 🟡 OPEN |
| 2 | Station Manager role | 🟡 OPEN |
| 3 | Schedule Calendar UI | 🟢 OPEN |
| 4 | Design Alignment pass | 🟢 OPEN |
| 5 | Debug cleanup | 🟢 OPEN |
| 6 | Endurance test | 🟢 OPEN |
| 7 | Cloud deployment | 🟢 FINAL |

---

## Update: 2026-05-11 — PROGRAM-CREATE-PRESENTER-FILTER-VERIFIED

### Completed ✅
- [x] Program Create Presenter Filtering — **VERIFIED BY AKRAM**
  - Client-side `ProgramCreateForm` component.
  - Station → presenter dropdown live update.
  - Direct DJ presenters excluded at query + action level.
  - Server-side PresenterStation validation preserved.

### Next Queue (Priority Order)
| # | Task | Status |
|---|------|--------|
| 1 | Presenter type UI final cleanup (if any) | 🟡 OPEN |
| 2 | Presenter + Station DJ credential override | 🟡 OPEN |
| 3 | Station Manager role | 🟡 OPEN |
| 4 | Schedule Calendar UI | 🟢 OPEN |
| 5 | Design Alignment pass | 🟢 OPEN |
| 6 | Debug cleanup | 🟢 OPEN |
| 7 | Endurance test | 🟢 OPEN |
| 8 | Cloud deployment | 🟢 FINAL |

---

## PRODUCT DECISION — 2026-05-11 22:55

### ⛔ REMOVED FROM ACTIVE PLANNING: Presenter + Station DJ Credential Override

All previous entries listing "Presenter + Station DJ credential override" as 🟡 OPEN
or HIGH priority are **superseded by this product decision**.

**This feature is CANCELLED. Do not implement it.**

Reason: Scheduled presenters (SINGLE_STATION / MULTI_STATION) use the station's
`StationDefaultCredential`. They do not have personal DJ credentials.
Only `DIRECT_DJ` presenters have personal credentials (via `DirectDjRadio`).
A per-presenter+station credential override adds complexity without a product need.

### ✅ Updated Priority Queue

| # | Task | Status |
|---|------|--------|
| 1 | Station Manager role | 🟡 OPEN — Next priority |
| 2 | Schedule Calendar UI | 🟢 OPEN |
| 3 | Design Alignment pass | 🟢 OPEN |
| 4 | Debug cleanup | 🟢 OPEN |
| 5 | Endurance test | 🟢 OPEN |
| 6 | Cloud deployment | 🟢 FINAL |
| — | Presenter+Station DJ credential override | ⛔ CANCELLED |

---

## Update — 2026-05-12 (STATION-MANAGER-DELETE-VERIFIED)

### Completed / Closed
| Item | Status |
|------|--------|
| Station Manager remove/delete | ✅ VERIFIED |
| Invalid UTF-8 build error (actions.ts) | ✅ CLOSED |

### Remaining (Akram to prioritise)
| # | Next Phase | Status |
|---|-----------|--------|
| 1 | Station Manager dashboard / scoped pages | 🟢 OPEN |
| 2 | Schedule Calendar UI | 🟢 OPEN |
| 3 | UI/UX Design Alignment | 🟢 OPEN |
| 4 | Debug cleanup ([DIAG] logs, test buttons) | 🟢 OPEN |
| 5 | Endurance test | 🟢 OPEN |
| 6 | Cloud deployment | 🟢 FINAL |

---

## Update — 2026-05-12

### ✅ VERIFIED — Station Manager Scoped Program & Schedule Management
All items below are complete and verified by Akram:
- Station Manager dashboard with scoped station cards.
- Scoped presenters page (DIRECT_DJ excluded, isActive link filter).
- Scoped programs page (create, list, edit, toggle, safe-disable).
- Schedule rule create & edit (inline, no page jump).
- Schedule slot create, edit, delete (inline).
- Audit logs for all write actions.

### Recommended Next Work Queue

1. **Station Manager recordings page** — verify scoped archive (sourceType != DIRECT_DJ, stationId IN assignedIds). Manual test: open `/stream/station-manager/recordings` and confirm only assigned station recordings appear.

2. **Station Manager DJ settings page** — verify credential create/update flow. Manual test: open `/stream/station-manager/dj-settings` and save credentials for an assigned station.

3. **Schedule Calendar UI** — visual weekly/monthly calendar view for Station Manager showing scheduled program slots.

4. **UI/UX Design Alignment** — align Station Manager pages with EGONAIR design references (colors, typography, layout).

5. **Debug cleanup** — remove any console.log / diagnostic output added during development.

6. **Endurance test** — sustained broadcast session test (60+ min) verifying recording pipeline stability.

7. **Cloud deployment** — GCP Cloud Run / production environment deployment and smoke test.

---

## Updated Work Queue — Post STATION-MANAGER-RECORDINGS-VERIFIED
**Date:** 2026-05-12

### Completed ✅
- [x] Station Manager recordings page — VERIFIED LOCALLY.
      Legacy stationId=null recordings now appear via PresenterStation derivation.
      Direct DJ recordings excluded via directDjRadioId: null guard.

### Remaining Station Manager Work
1. **Station Manager DJ settings page** — verify credential create/update flow.
   Manual test: open `/stream/station-manager/dj-settings` and save credentials for an assigned station.

2. **Station Manager dashboard polish** — scoped stats, station card refinements.

3. **Audit log viewer** — deferred, lower priority.

### Remaining General Work
4. **Schedule Calendar UI** — visual weekly/monthly calendar view for Station Manager.

5. **UI/UX Design Alignment** — align Station Manager pages with EGONAIR design references.

6. **Debug cleanup** — remove any console.log / diagnostic output added during development.

7. **Endurance test** — sustained broadcast session test (60+ min) verifying recording pipeline stability.

8. **Cloud deployment** — GCP Cloud Run / production environment deployment and smoke test.

---

## Updated Work Queue — Post STATION-MANAGER-DJ-SETTINGS-VERIFIED
**Date:** 2026-05-12

### Completed ✅
- [x] Station Manager dashboard.
- [x] Station Manager scoped presenters.
- [x] Station Manager scoped programs (create, edit, toggle, safe-disable).
- [x] Station Manager schedule rule + slot management (inline).
- [x] Station Manager recordings page (legacy + modern recordings included).
- [x] Station Manager DJ Settings page — VERIFIED LOCALLY.
      Encrypted credentials, password preservation, audit logging, inline card feedback.

### Remaining Station Manager Items (Lower Priority)
- [ ] Audit log viewer for Station Manager (deferred).
- [ ] Dashboard stats/polish (deferred).

### Next Recommended Work Queue

1. **Schedule Calendar UI**
   Visual weekly/monthly calendar view for Station Manager showing scheduled program slots.
   Path: `/station-manager/schedule-calendar` (new page, read-only view initially).

2. **UI/UX Design Alignment**
   Align Station Manager pages with EGONAIR design references (colors, typography, layout consistency).

3. **Debug cleanup**
   Remove any console.log / diagnostic output added during development.

4. **Endurance test**
   Sustained broadcast session test (60+ min) verifying recording pipeline stability.

5. **Cloud deployment**
   GCP Cloud Run / production environment deployment and smoke test.

---

## Updated Work Queue — Post SCHEDULE-CALENDAR-UI-VERIFIED
**Date:** 2026-05-12

### Completed ✅
- [x] Station Manager dashboard.
- [x] Station Manager scoped presenters.
- [x] Station Manager scoped programs + schedule editor.
- [x] Station Manager recordings page (legacy + modern).
- [x] Station Manager DJ Settings page.
- [x] Station Manager schedule calendar view — VERIFIED LOCALLY.
- [x] Admin schedule calendar view (global) — VERIFIED LOCALLY.

### Remaining Work Queue

1. **UI/UX Design Alignment**
   Review all pages against original EGONAIR reference images.
   Align colors, typography, layout, spacing, and card styles.

2. **Debug cleanup**
   - Remove all `[DIAG]`, `console.log`, diagnostic buttons added during development.
   - Audit server actions and API routes for leftover debug output.

3. **Endurance test**
   Sustained 60+ min broadcast session verifying:
   - Recording pipeline stability.
   - Live output continuity.
   - No memory/process leaks in backend-audio.

4. **Final local QA + handoff**
   Full end-to-end walkthrough:
   - Admin: create presenter → assign to station → create program → set schedule.
   - Station Manager: login → view programs → view recordings → view schedule → update DJ settings.
   - Presenter: login → pre-flight → broadcast → confirm recording appears.

5. **Cloud deployment**
   GCP Cloud Run deployment:
   - Deploy frontend (Next.js).
   - Deploy backend-audio (Node.js).
   - Configure environment variables, secrets, volume mounts.
   - Smoke test live broadcast end-to-end.

---

## Updated Work Queue — Post ADMIN-RECORDING-DELETE-UX-VERIFIED
**Date:** 2026-05-12

### Completed ✅
- [x] Admin recording delete (server: disk + DB + audit) — VERIFIED
- [x] Admin recording delete UX (local feedback pattern) — VERIFIED

### Approved Delete UX Pattern (apply to all future deletes)
confirm → local loading → local success/error → router.refresh()

### Remaining Delete-Related Work

1. **Media track physical file delete**
   Currently `deleteTrack` only removes DB row — physical file on disk is NOT deleted.
   Needs: resolve disk path from `fileUrl`, `fs.unlink`, same pattern as recording delete.

2. **Presenter deactivate — add audit log**
   Deactivate action sets `isActive: false` but writes no `AdminAuditLog`.
   Simple fix: add audit write after `prisma.user.update`.

3. **Program delete/disable**
   No delete action exists — only `isActive: false` toggle inside edit page.
   Need: explicit disable action with confirm + dependency check (linked recordings set to null).

4. **Station disable (soft delete)**
   No delete or disable action exists.
   High dependency risk: PresenterStation, StationManagerAssignment, Programs, Recordings.
   Must check and warn about SINGLE_STATION presenters before allowing disable.
   Implement as soft delete only (`isActive: false`).

5. **Complex delete dependency checks**
   Before any entity delete/disable, check child counts and surface them in the confirm dialog.
   Example: "هذه المحطة مرتبطة بـ 2 مذيع و5 برامج. سيتم إلغاء تنشيطها دون حذف البيانات."

### Non-Delete Remaining Work
6. UI/UX Design Alignment against EGONAIR reference images.
7. Debug cleanup: remove [DIAG] logs, test buttons.
8. Endurance test (60+ min broadcast).
9. Final local QA.
10. Cloud deployment (GCP).

---

## Updated Work Queue — Post MEDIA-TRACK-PHYSICAL-DELETE-VERIFIED
**Date:** 2026-05-12

### Completed ✅
- [x] Admin Recording delete (DB + disk + audit) — VERIFIED
- [x] Admin Recording delete UX (local feedback) — VERIFIED
- [x] Admin Media Track delete (DB + disk + shared file guard + audit) — VERIFIED

### Approved Delete UX Pattern (mandatory for all future deletes)
confirm → local loading state → local success/error → optimistic list update or router.refresh()

### Remaining Delete-Related Work

1. **Presenter deactivate — add audit log** ← NEXT PRIORITY
   Existing `isActive` toggle saves without writing `AdminAuditLog`.
   Fix: add `adminAuditLog.create(action=DEACTIVATE_PRESENTER)` to edit save action.
   Risk: 🟢 minimal.

2. **Presenter delete wizard**
   Dependency check (programs / recordings / sessions) before allowing hard delete.
   Default: soft deactivate only.
   Hard delete: only when all dependency counts = 0, with transaction cleanup.

3. **Program soft-delete**
   No delete/disable action exists. Needs: `isActive=false` toggle + confirm + audit log.

4. **Station soft-delete**
   High dependency risk. Must check: presenters, programs, recordings, managers.
   Implement as soft delete only (`isActive=false`).

5. **`deleteCategory` physical file cleanup** (low priority)
   Currently `deleteCategory` calls `mediaTrack.deleteMany` — bypasses disk cleanup.
   Future: loop `deleteTrack` per track before deleting category, or add bulk disk cleanup.

### Non-Delete Work
6. UI/UX Design Alignment vs EGONAIR reference images.
7. Debug/diagnostic log cleanup.
8. Endurance test (60+ min broadcast).
9. Final local QA.
10. Cloud deployment (GCP / Cloud Run).

---

## Updated Work Queue — Post ADMIN-PRESENTERS-VALIDITY-COLUMNS-VERIFIED
**Date:** 2026-05-12

### Completed ✅
- [x] Admin Recording delete (DB + disk + audit) — VERIFIED
- [x] Admin Media Track delete (DB + disk + shared file guard + audit) — VERIFIED
- [x] Admin Presenter Delete Wizard (dependency cleanup + hard delete + audit) — IMPLEMENTED
- [x] Admin Presenters list — legacy BroadcastSchedule columns replaced with PresenterValidity — VERIFIED

### Design Rule (locked)
Program times → Admin Programs page.
Presenter list → subscription validity only.
Do NOT re-add BroadcastSchedule columns to presenter list.

### Next Priority Work

1. **Presenter Delete Wizard — final hard delete end-to-end test** ← NEXT
   Test sequence:
   - Disable programs → clean schedules → clean live sessions (after recordings) → delete recordings → hard delete.
   - Verify no FK error + presenter removed from list.

2. **Program soft-delete**
   No delete/disable action exists. Needs: `isActive=false` toggle + confirm + audit log.

3. **Station soft-delete**
   High dependency risk. Must check: presenters, programs, recordings, managers.
   Implement as soft delete only (`isActive=false`).

4. **`deleteCategory` physical file cleanup** (low priority)
   `deleteCategory` calls `mediaTrack.deleteMany` — physical disk files not cleaned.

5. **UI/UX Design Alignment** vs EGONAIR reference images.
6. **Debug log cleanup.**
7. **Endurance test** (60+ min broadcast).
8. **Cloud deployment** (GCP / Cloud Run).

---

## Updated: 2026-05-12 — Post MP3-Archive-Backfill-Verified

### ✅ COMPLETED THIS SESSION
- [x] Admin Presenter Delete Wizard (dependency checklist, cleanup, snapshot preservation)
- [x] Admin Station Delete Wizard (same pattern as Presenter)
- [x] Admin Program Delete / Disable
- [x] Recording snapshot fields added (presenterNameSnapshot, stationNameSnapshot, etc.)
- [x] presenterId made nullable — archive survives presenter deletion
- [x] MP3 archive backfill — 21 orphan sessions recovered, 20 WebM→MP3 conversions
- [x] Admin Schedule UI redesigned (weekly 7-column grid)
- [x] Schedule Audit page created (/admin/schedule/audit)
- [x] Admin Recordings null-safe display with "محذوف" badge for deleted presenters

### 🔲 REMAINING — NEXT STEPS (priority order)

1. **Delete corrupt WebM DB row**
   - Go to Admin → Recordings → find `session-20260510-063651-78bc5b48.webm` → delete via UI
   - Optional: also delete the corrupt file from disk

2. **Station Physical Delete Wizard enhancement**
   - Current wizard handles programs, presenter links, manager assignments, default credentials
   - Enhancement: add SINGLE_STATION presenter deactivation/delete flow directly from Station wizard

3. **Station Manager scoped pages**
   - Station Manager schedule view refinement
   - Station Manager presenters management
   - Station Manager permissions audit

4. **Schedule Calendar polish**
   - Add drag-to-reschedule interaction (optional, low priority)
   - Add conflict resolution quick-fix buttons on Audit page

5. **New recording pipeline for future sessions**
   - `audio-session/ended` now populates all snapshot fields
   - Verify next live session creates Recording row with correct format (mp3 preferred)
   - Consider converting to MP3 at session end in backend-audio

6. **Endurance / load test**
   - Multiple concurrent sessions test
   - Long session recording test

7. **Cloud deployment preparation**
   - Review all environment variables
   - Production DB migration strategy
   - Cloud storage for recordings (replace debug-recordings local path)


---

## Update — 2026-05-13: Direct DJ Fully Verified

### CLOSED Items (do not reopen unless regression confirmed)

| Item | Status |
|------|--------|
| Direct DJ live SHOUTcast output | ✅ VERIFIED — Akram heard audio on radio 2026-05-13 |
| Direct DJ recording (WebM + MP3 + DB row) | ✅ VERIFIED — 2026-05-13 |
| Direct DJ token creation (`directDjRadioId` in body) | ✅ FIXED + VERIFIED |
| Direct DJ studio access gate (canBroadcast removed for DIRECT_DJ) | ✅ FIXED + VERIFIED |
| Admin Direct DJ radio edit UI | ✅ IMPLEMENTED |
| Admin Server Component onClick crash | ✅ FIXED |
| My Profile page (all roles) | ✅ IMPLEMENTED |
| Avatar upload | ✅ IMPLEMENTED |
| Direct DJ radio self-management in /profile | ✅ IMPLEMENTED |

### Remaining Queue (priority order)

1. **Station Manager** — verify all scoped pages/actions are complete
2. **Schedule Calendar UI** — full calendar view for program slots
3. **UI/UX Design Alignment** — align with EGONAIR reference images
4. **Debug log cleanup** — remove `[DIAG]` prefix logs before production
5. **Endurance test** — run a 30–60 min session to verify stability
6. **Cloud deployment** — push verified build to production VPS

### Rules

- Do NOT reopen Direct DJ live/recording unless a specific regression is reported.
- Do NOT add `canBroadcast` checks back to the DIRECT_DJ studio gate.
- Do NOT remove `directDjRadioId` from StudioUI props.


---

## Next Work Queue — After 2026-05-13 Safe Exit

Priority order for next session:

1. **Confirm Direct DJ radios UI polish** — visual confirmation by Akram that width fix works on admin presenter edit page.
2. **Confirm/finalize Station Manager remaining scoped pages** — verify recordings and DJ settings pages are fully scoped and functional.
3. **Schedule Calendar UI** — implement full calendar view for program slots.
4. **Global UI/UX Design Alignment** — align all pages with original EGONAIR reference images.
5. **Debug cleanup** — remove all `[DIAG]` prefix console logs before production.
6. **Endurance test** — run a 30–60 minute live session to verify stability, no memory leaks, clean disconnect.
7. **Cloud deployment** — push verified build to production VPS.

### Start Next Session

```
1. cd frontend && npm run dev
2. cd backend-audio && ENABLE_SHOUTCAST_LIVE=true npm run dev
3. Review: project-knowledge-base/CURRENT_STATUS.md
4. Review: project-knowledge-base/ISSUES_AND_FIXES.md (last checkpoint)
5. Start with item #1 from queue above
```

---

## Update — 2026-05-14: Studio Connection Stability + MULTI_STATION Credential Fix

### ✅ CLOSED This Session

| Item | Status |
|------|--------|
| AudioContext race condition (Connect → suspended context → zero audio) | ✅ FIXED |
| Connect button page refresh regression | ✅ FIXED |
| Direct DJ exit state lock (Connect button disabled on re-entry) | ✅ FIXED |
| Live audio not reaching SHOUTcast (`ENABLE_SHOUTCAST_LIVE=false`) | ✅ FIXED + VERIFIED |
| MULTI_STATION wrong station credential risk (P2 `ORDER BY createdAt` with no time filter) | ✅ FIXED — P0 resolution via `scheduledStationId` |

### Studio Scenario Separation — Audit Findings (2026-05-14, read-only)
- SINGLE_STATION: ✅ safe — correct time-gated station always resolved.
- MULTI_STATION: ✅ fixed — `scheduledStationId` now forwarded from page → PreFlight → StudioUI → token/create P0.
- DIRECT_DJ: ✅ stable and closed — no changes made to DIRECT_DJ flow.

### Updated Work Queue

| # | Task | Status |
|---|------|--------|
| 1 | Schedule Calendar UI | ❌ Not started — NEXT PRIORITY |
| 2 | Global UI/UX Design Alignment (EGONAIR reference images) | ❌ Not started |
| 3 | Debug log cleanup ([DIAG] prefix removal) | ❌ Not done |
| 4 | Endurance test (30–60 min live session) | ❌ Not done |
| 5 | Cloud deployment (GCP Cloud Run) | ❌ After all local tests pass |

### Rules Carried Forward
- Do NOT reopen Direct DJ unless a specific regression is reported.
- `ENABLE_SHOUTCAST_LIVE=true` must remain in `backend-audio/.env` for production-like testing.
- `AudioContext` must always be resumed before any `await` in the Connect handler.
- All `<button>` elements must have `type="button"` unless intentionally submit.
- `scheduledStationId` must remain in the token/create POST body for scheduled sessions.
- P0 ownership validation in `token/create` must not be removed.


---

## Next Steps Update — 2026-05-20

### Stage Just Closed ✅
ADMIN-STATION-MANAGER-UI-ARCHITECTURE-ALIGNMENT — fully complete.

### Architecture Rules Established (Do Not Override Without Review)

1. **Multi-select filters** — entity filters allowing multiple non-mutually-exclusive values MUST use `SMStationFilter` (comma-separated `?param=id1,id2` pattern). Never use single-value `params.set()` for a multi-select component.
2. **Pagination** — must always be visible where pagination exists. Never hide behind a scroll or load-more unless explicitly approved.
3. **Shared components** — `EmptyState`, `StatusBadge`, `AdminPageShell`, `SMStationFilter` must be reused. Do NOT create page-specific duplicated UI.
4. **Admin vs SM scope** — Admin pages see all data. SM pages must query `stationId IN assignedStationIds` enforced server-side. Client-side filtering is decorative only.
5. **`<Unauthorized />`** — always render this component (never redirect to `/login`) when a valid session has wrong role, to prevent redirect loops.
6. **basePath convention** — `href` values in `<a>` tags inside client components must include `/stream` prefix. Next.js `<Link>` inside `app/` pages does NOT need the prefix (basePath is applied automatically). Plain `<a href>` in client components DOES need the explicit `/stream` prefix.
7. **StudioUI** — must not be modified or split without a dedicated planning session. Treat as frozen.
8. **Old models** — `BroadcastSchedule` is ignored. Do not delete until all references are verified gone. Use `Program → ProgramScheduleRule → ProgramScheduleSlot` pipeline.

### Recommended Next Stage
**LOGIN PAGE DARK PREMIUM REDESIGN**

Scope:
- `frontend/src/app/login/page.tsx` (and related login components)
- Goal: premium dark glassmorphism design matching EGONAIR brand
- No backend changes needed
- No auth logic changes
- Visual only

### Known Remaining Work (Not Yet Started — Not Blocking)

| # | Item | Priority | Notes |
|---|---|---|---|
| 1 | Login page dark redesign | HIGH | Next stage |
| 2 | SM media real file upload | MEDIUM | URL-only for now |
| 3 | SM media drag reorder UI | LOW | Action exists, no UI |
| 4 | Mobile browser compatibility (Studio) | LOW | Studio is desktop-first by design |
| 5 | Global branding/theme settings | FUTURE | Not scoped yet |
| 6 | Cloud deployment | FUTURE | No timeline yet |
| 7 | StudioUI cleanup (debug logs) | LOW | Frozen, deferred |
| 8 | Full UI/UX polish vs reference screenshots | MEDIUM | After Login stage |

---

## Next Steps Update — 2026-05-20 (Post Login Redesign)

### Stages Closed ✅
1. `ADMIN-STATION-MANAGER-UI-ARCHITECTURE-ALIGNMENT` — closed 2026-05-20
2. `LOGIN-DARK-PREMIUM-REDESIGN` — closed + verified 2026-05-20

### Do NOT Reopen
- Login dark redesign
- Role-based login redirect
- Unauthorized role routing
- Admin filter migration
- SM multi-select bug
- SM media back link

### Next Suggested Stage Options (Priority Order)

| # | Stage | Notes |
|---|---|---|
| 1 | **SM manual regression check** | If Akram reports any SM page issue, fix first |
| 2 | **UI/UX polish pass** | Review all pages against reference screenshots when available |
| 3 | **SM media file upload** | URL-only currently; real upload deferred |
| 4 | **SM media drag reorder UI** | Action exists (`smReorderTracks`), no UI yet |
| 5 | **Mobile compatibility hardening** | CSS overflow fixes (decorative circles), Studio is desktop-only |
| 6 | **StudioUI cleanup** | Debug log removal, deferred |
| 7 | **Cloud deployment** | No timeline |

### SETTINGS-BRANDING-THEME-WIRING-VERIFIED — 2026-05-20

**1. What was completed:**
- SystemSettings model
- system settings helper
- read-only settings page
- editable branding/support form
- logo URL fields
- theme color editor
- theme CSS variable injection
- systemName/systemSubtitle wiring
- shared UI token wiring

**2. Bugs fixed:**
- Prisma stale client / systemSettings undefined
- `/stream/stream` redirect duplication
- `<style>` outside `<head>` / hydration error
- color picker not submitting value
- theme success message placement
- systemName/systemSubtitle not visible

**3. Important current limitations:**
- Real file upload for logos/icons/splash is not implemented yet
- Some hardcoded colors may remain in large complex files
- Full RBAC/admin permissions not implemented yet
- Light mode is configured as settings fields but full UI light-mode polish is not complete

**4. Do NOT reopen unless regression:**
- SystemSettings foundation
- settings save redirect fix
- theme color save/readback
- style injection fix
- systemName/systemSubtitle wiring

**5. Next safe options:**
- Real logo/file upload implementation
- Admin Users / RBAC
- Remaining hardcoded color cleanup
- UI/UX polish pass

---

## SETTINGS-BRANDING-THEME-LOGO-UPLOAD-VERIFIED — 2026-05-20

### 1. Completed:
- SystemSettings model
- settings helper
- admin settings read/edit page
- branding/support save
- theme editor
- theme CSS injection
- systemName/systemSubtitle wiring
- logo URL fields
- logo file upload
- dark/light/login/favicon/app/splash asset fields
- /uploads proxy public access
- login/admin logo rendering
- /stream/stream routing fix
- style injection console error fix

### 2. Known limitations:
- app icon / splash screen saved but not wired into manifest/PWA yet
- some hardcoded colors may remain in complex files
- Admin RBAC not implemented yet
- Cloud not updated yet

### 3. Do NOT reopen unless regression:
- SystemSettings foundation
- settings redirect fix
- theme save/readback
- style injection fix
- uploaded logo rendering
- uploads proxy fix
- systemName/systemSubtitle wiring

---

NEXT PHASE:
STUDIO MOBILE BROWSER COMPATIBILITY

Priority:
Highest priority before Cloud.

Goal:
Make Studio work reliably on mobile browser.

This phase must audit/test:
- PreFlight mobile layout
- Wait screen mobile layout
- Studio main UI mobile layout
- mic permission on mobile
- WebSocket on mobile via production/cloud URL later
- WebAudio mixer on mobile
- MediaRecorder fallback on iOS/Android
- background + queue playback on mobile
- touch controls
- sliders
- screen lock / wake lock risk
- responsive overflow
- Safari iPhone restrictions
- Chrome Android behavior

Important:
Do NOT solve Cloud issues before mobile browser compatibility is understood.
Cloud comes after mobile browser readiness.
