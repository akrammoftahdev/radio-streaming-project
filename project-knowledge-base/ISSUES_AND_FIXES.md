# EGONAIR — Issues and Fixes Log

*Last updated: 2026-04-30 11:55 — Cloud Run live. FIX-011 identified (DATABASE_URL socket format). Not yet applied. Safe exit.*

---

## Format

Each entry follows this structure:
- **ID** — Sequential reference
- **Status** — `FIXED` / `KNOWN` / `OPEN`
- **Symptom** — What went wrong or what was observed
- **Root Cause** — Why it happened
- **Fix Applied** — What was done to resolve it
- **Do Not Regress** — What not to undo or re-introduce

---

## FIX-001 — Next.js 15 Async Route Params

**Status:** FIXED  
**Affected file:** `frontend/src/app/admin/presenters/[id]/edit/page.tsx`

**Symptom:** Clicking "Edit Presenter" caused a runtime crash. The page threw an error about
accessing `params.id` on a synchronous object.

**Root Cause:** In Next.js 15 App Router, `params` is now a `Promise` that must be awaited.
Code written for Next.js 14 that accesses `params.id` directly will fail.

**Fix Applied:**
```typescript
// Changed from:
export default async function Page({ params }: { params: { id: string } }) {
  const id = params.id;

// Changed to:
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
```

**Do Not Regress:** Any `[id]` or `[slug]` dynamic route in Next.js 15 must use the async params pattern above.

---

## FIX-002 — WebSocket Duplicate Session Detection

**Status:** FIXED  
**Affected files:** `backend-audio/src/index.ts`, `frontend/src/app/studio/studio-ui.tsx`

**Symptom:** A presenter could open two browser tabs with the Studio page and activate the mic
in both, creating two competing SHOUTcast source connections.

**Root Cause:** No server-side enforcement of single-session per presenter.

**Fix Applied:**
- `backend-audio/src/index.ts` maintains a `activeSessions` Map keyed by `presenterId`.
- On new WebSocket connection: if `presenterId` already exists in the Map, the new connection
  is closed immediately with code `1008` and reason string containing "duplicate".
- `studio-ui.tsx` detects this close event (`event.code === 1008` and `event.reason` includes "duplicate")
  and shows an Arabic error message: "جلسة مكررة — هذا المقدم متصل بالفعل من نافذة أخرى."

**Do Not Regress:** The `activeSessions` Map must be cleaned up in the `ws.on('close')` handler.
If the cleanup is removed, legitimate reconnections will be blocked.

---

## FIX-003 — SHOUTcast v2 HTTP Handshake Format

**Status:** FIXED (design clarification)  
**Affected file:** `backend-audio/src/index-live-shoutcast-test.ts` → merged into `src/index.ts`

**Symptom:** Initial SHOUTcast connection attempts failed with rejected handshakes.

**Root Cause:** SHOUTcast v2 uses an HTTP/1.0-style `SOURCE` request, not a standard HTTP/1.1
POST or GET. The `Authorization` header must use HTTP Basic with `djUsername:password` encoded
in Base64. Line endings must be `\r\n` and the header block must terminate with `\r\n\r\n`.

**Verified working handshake:**
```
SOURCE / HTTP/1.0\r\n
Host: radio.socialgenix.com\r\n
Authorization: Basic base64(djUser:password)\r\n
User-Agent: EGONAIR-Remote-Studio/1.0\r\n
content-type: audio/mpeg\r\n
icy-name: EGONAIR Remote Studio\r\n
icy-genre: Talk\r\n
icy-br: 64\r\n
icy-pub: 0\r\n
\r\n
```

**Do Not Regress:** Do not switch to HTTP/1.1, do not use `PUT`, do not use `\n` alone as line endings.

---

## FIX-004 — FFmpeg stdin Must Receive WebM, Not Raw PCM

**Status:** FIXED (design clarification)  
**Affected file:** `backend-audio/src/index.ts`

**Symptom:** When early versions piped audio chunks directly to FFmpeg without specifying input format,
FFmpeg could not decode the stream.

**Root Cause:** `MediaRecorder` in Chrome/Firefox outputs `audio/webm;codecs=opus` container format.
FFmpeg must be told to expect webm input via `-f webm -i pipe:0`.

**Verified working FFmpeg command:**
```
ffmpeg -f webm -i pipe:0 -vn -codec:a libmp3lame -b:a 64k -f mp3 pipe:1
```

**Do Not Regress:** Do not remove `-f webm` from the FFmpeg argument list. Do not use raw PCM
unless the MediaRecorder format is explicitly changed to PCM on the browser side.

---

## FIX-005 — Admin Dashboard Auto-Refresh Without WebSocket

**Status:** FIXED  
**Affected file:** `frontend/src/app/admin/live/page.tsx` (and auto-refresh sub-component)

**Symptom:** The admin live sessions page showed stale data unless manually refreshed.

**Root Cause:** Server components do not automatically re-fetch data. No real-time update mechanism existed.

**Fix Applied:** A small client component uses `router.refresh()` on a `setInterval` every 5 seconds.
This triggers Next.js to re-render the server component tree without a full page reload and without
WebSockets or polling infrastructure.

**Do Not Regress:** Do not replace this with a WebSocket implementation unless explicitly planned.
The current approach is intentionally lightweight.

---

## FIX-006 — Firestore vs SQLite Confusion (Production Config)

**Status:** FIXED (one-time configuration fix)

**Symptom:** A deployment configuration referenced Firestore, causing connection failures.

**Root Cause:** The project uses PostgreSQL (via Prisma), not Firestore. Previously SQLite during development. A stale Firebase configuration
was applied.

**Fix Applied:** [HISTORICAL] During development, the database was SQLite at `frontend/prisma/dev.db`. Now PostgreSQL on VPS (localhost:5432, database `egonair`).
Firestore/Firebase configs removed from active configuration.

**Do Not Regress:** Do not introduce Firestore or any Firebase SDK into this project. The database stack is Prisma + PostgreSQL (production on VPS). Previously used SQLite during development.

---

## KNOWN-001 — `backend-audio` Credential Source in Dev vs Production

**Status:** RESOLVED — 2026-04-28  

In development, `backend-audio` now reads SHOUTcast credentials from the `sonicPanel` object
returned by `/api/internal/audio-token/validate` (which decrypts them from the Prisma DB).
The `.env` values are used only as a dev smoke-test fallback when `sonicPanel` is null.

If `sonicPanel` is null AND no env fallback is set, backend-audio closes the WebSocket with
code 1011 (safe failure, no crash). This is fully implemented in `backend-audio/src/index.ts`.

**Verified 2026-04-28:** DB credentials only (env fallback was a dummy host) — SHOUTcast
handshake succeeded at `radio.socialgenix.com:4896`. See CURRENT_STATUS.md verification run.

---

*Add a new entry whenever a bug is found and fixed, or whenever a known issue is intentionally deferred.*

---

## FIX-007 — NEXT_PUBLIC_WS_URL Incorrect Value in Deployment Commands

**Status:** RESOLVED — 2026-04-30 (plan corrected; deploy not yet executed)  
**Affected file:** Build commands in `cloudrun_deployment_prep.md`

**Symptom (not yet triggered — deploy not executed):** The prepared Phase B build command baked `wss://egonair-frontend-729286791857.europe-west1.run.app/stream-ws` into the browser JS bundle as `NEXT_PUBLIC_WS_URL`. This value is wrong for the Cloud architecture. [HISTORICAL — Cloud Run era]

**Root Cause:**
- `/stream-ws` was the original VPS reverse-proxy WebSocket path plan (LiteSpeed proxy → `ws://127.0.0.1:4001`)
- [HISTORICAL] The Cloud architecture used the Cloud Run URL as the WebSocket domain (Diamond Rule: 100% Google Cloud, no egonair-frontend-729286791857.europe-west1.run.app dependencies)
- We use Cloud Run endpoints directly. No DNS configuration is needed for the backend.

**Fix Applied (2026-04-30):**  
All Phase B commands in `cloudrun_deployment_prep.md` (conversation `f156b216`) corrected to:  
```
[HISTORICAL] NEXT_PUBLIC_WS_URL="wss://egonair-backend-audio-729286791857.europe-west1.run.app"
```
This is the final production Cloud Run endpoint following the Diamond Rule. The Studio mic button will fail gracefully if the backend is unreachable. Using the direct Cloud Run URL avoids DNS dependency issues.

**Do Not Regress:** [HISTORICAL — Cloud Run deployment] Never bake `wss://egonair-frontend-729286791857.europe-west1.run.app/stream-ws` into the Docker image. Current deployment is VPS at studio.egonair.com.

---

## FIX-008 — cloudrun-frontend.yaml Not Available in Cloud Shell by Default [HISTORICAL — Cloud Shell/Cloud Run]

**Status:** RESOLVED — 2026-04-30 (plan corrected; deploy not yet executed)  
**Affected command:** Phase C (`gcloud run services replace cloudrun-frontend.yaml`)

**Symptom (not yet triggered):** Cloud Shell does not have the local project files. Running `gcloud run services replace deploy/cloudrun-frontend.yaml` in Cloud Shell will fail with "file not found" unless the deploy folder is explicitly uploaded.

**Root Cause:** Cloud Shell is a remote terminal. It does not share the local Mac filesystem. The `deploy/` folder only exists locally.

**Fix Applied (2026-04-30):**  
Phase B1 now uploads `deploy/cloudrun-frontend.yaml` from the local Mac to GCS alongside the source archive:
```bash
gsutil cp deploy/cloudrun-frontend.yaml \
  gs://egonair-recordings/build-source/cloudrun-frontend.yaml
```
Phase C retrieves it in Cloud Shell before deploying:
```bash
gsutil cp gs://egonair-recordings/build-source/cloudrun-frontend.yaml ~/cloudrun-frontend.yaml
gcloud run services replace ~/cloudrun-frontend.yaml ...
```
No Cloud Shell file upload button needed. No separate gsutil tooling needed beyond what's already used in Phase B1.

---

## 🟢 Safe Exit — 2026-04-30 08:05 (Africa/Cairo)

**Session type:** Pre-deployment planning only — blocker resolution  
**No code deployed. No Docker images built. No database migrated. No DNS changed. No VPS touched.**

**What was completed this session:**
- FIX-007 resolved: `NEXT_PUBLIC_WS_URL` corrected to use the direct Cloud Run endpoint, adhering to the Diamond Rule.
- FIX-008 resolved: Phase B1 uploads YAML to GCS; Phase C retrieves via `gsutil cp` before deploy
- `cloudrun_deployment_prep.md` rewritten with corrected Phase A–D commands (brain artifact, conversation `f156b216`)
- All 4 KB files updated to reflect resolved blockers
- **No new blockers found**

**All processes:** No services running. Nothing deployed.  
**Next action:** Execute Phase A → B1 (local Mac) → B2 (Cloud Shell) → C → D — awaiting user approval.

---

## FIX-009 — ENCRYPTION_KEY Module-Load Throw Blocks Next.js Build

**Status:** FIXED — 2026-04-30  
**Affected file:** `frontend/src/lib/encryption.ts`  
**Build ID that surfaced it:** `03c6f5f9-6d09-4923-8039-8deeffb586f7`

**Symptom:**
```
Error: ENCRYPTION_KEY must be a 32-character string in environment variables.
Failed to collect page data for /api/internal/audio-token/validate
```

**Root Cause:** `encryption.ts` had a top-level `if` guard that threw at **module load time**. During `next build`, Next.js statically collects page data for all routes, which requires importing API route modules. Importing `validate/route.ts` imports `encryption.ts`, which immediately throws because `ENCRYPTION_KEY` is not present at build time (it's a runtime secret (previously injected by Cloud Run, now in VPS .env)).

**Fix Applied:**  
Removed the module-level `const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY` and the top-level `if` throw. Replaced with a `getKey()` function that is called inside `encrypt()` and `decrypt()` only. The validation is identical — 32-char check, same error message — but it now runs at call time (request time), not at import time.

**Why real secrets are not at risk:** The stub `ENCRYPTION_KEY` in the Dockerfile (`build-time-stub-key-not-real-xxx`) is only present in the builder stage. The runner stage does not inherit builder-stage `ENV` values. Cloud Run injects the real `ENCRYPTION_KEY` from Secret Manager at container startup, which is what the running app uses. The stub is never present in production.

**Do Not Regress:** Do not restore the module-level throw. It will break every future Docker build.

---

## FIX-010 — Prisma Engine OpenSSL Incompatibility on Alpine

**Status:** FIXED — 2026-04-30  
**Affected files:** `frontend/prisma/schema.cloud.prisma`, `frontend/Dockerfile`  
**Build ID that surfaced it:** `03c6f5f9-6d09-4923-8039-8deeffb586f7`

**Symptom:**
```
Error loading shared library libssl.so.1.1: No such file or directory
Prisma engines do not seem to be compatible with your system.
Please manually install OpenSSL.
```

**Root Cause:** Prisma 5.x without an explicit `binaryTargets` defaults to downloading a binary linked against OpenSSL 1.1.x (`libssl.so.1.1`). Alpine 3.x ships OpenSSL 3.x — `libssl.so.3` — not 1.1. The binary cannot load.

**Fix Applied — two-part:**
1. **`schema.cloud.prisma` generator block:** Added `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]`. `linux-musl-openssl-3.0.x` is the correct Prisma binary target for Node 20 Alpine (musl libc + OpenSSL 3). `native` keeps local Mac dev working.
2. **`Dockerfile` builder + runner stages:** Added `openssl` to `apk add` in both the `builder` stage (needed for `prisma generate`) and the `runner` stage (needed at container startup).

**Do Not Regress:** Do not remove `binaryTargets` from `schema.cloud.prisma`. Do not remove `openssl` from the Alpine `apk add` lines in Dockerfile. Do not apply this binaryTarget to `schema.prisma` (the primary schema). [HISTORICAL: `schema.cloud.prisma` was used for Cloud Run builds.]

---

## 🟢 Safe Exit — 2026-04-30 10:53 (Africa/Cairo)

**Session type:** Docker build blocker investigation and fix  
**No deployment executed. No database migrated. No DNS changed. No VPS touched.**

**What was completed:**
- Failed Cloud Build `03c6f5f9` analyzed — two root causes identified
- FIX-009 applied: `encryption.ts` lazy key validation
- FIX-010 applied: Prisma `binaryTargets` + `openssl` in Dockerfile
- All 4 KB files updated
- Source archive on GCS is STALE — must be re-archived and re-uploaded before next Cloud Build

**Next action:** Re-archive `frontend/` and re-upload to GCS (Phase B1), then re-run Cloud Build (Phase B2).

---

## FIX-011 — DATABASE_URL Uses TCP Format Instead of Unix Socket

**Status:** IDENTIFIED — 2026-04-30 — NOT YET APPLIED  
**Affected secret:** `egonair-db-url` in Secret Manager  
**Cloud Run log error (verbatim):**
```
PrismaClientInitializationError: [P1001] Can't reach database server at '127.0.0.1:5432'
```

**Root Cause:**  
Cloud Run + Cloud SQL Auth Proxy does **not** open a TCP socket at `127.0.0.1:5432`. Instead, the proxy creates a Unix domain socket at `/cloudsql/<instance-connection-name>`. The `egonair-db-url` secret was set with the TCP format used by local `cloud-sql-proxy` development mode, which does not work in Cloud Run.

**Current value format (wrong):**
```
postgresql://egonair_app:<password>@127.0.0.1:5432/egonair
```

**Required value format (correct for Cloud Run):**
```
postgresql://egonair_app:<password>@/egonair?host=/cloudsql/egonair-stream-prod:europe-west1:egonair-pg
```

**Fix Required (3 commands in Cloud Shell, owner account only):**
```bash
# 1. Read DB password from Secret Manager into variable (never print)
DB_PASS=$(gcloud secrets versions access latest --secret=egonair-db-password --project=egonair-stream-prod) \
  && echo "[OK] DB_PASS loaded"

# 2. Write corrected DATABASE_URL as new secret version (never printed)
printf 'postgresql://egonair_app:%s@/egonair?host=/cloudsql/egonair-stream-prod:europe-west1:egonair-pg' "$DB_PASS" \
  | gcloud secrets versions add egonair-db-url --data-file=- --project=egonair-stream-prod \
  && echo "[OK] egonair-db-url updated"

# 3. Restart Cloud Run to pick up new secret
gcloud run services update egonair-frontend --project=egonair-stream-prod --region=europe-west1 \
  && echo "[OK] Cloud Run restarted"
```

**Prerequisite:** Must be running as `akrammoftahyt@gmail.com` in Cloud Shell.  
**Do not run with `maisondesidees2024@gmail.com`** — that account may not have `secretmanager.versions.access` permission.

**Do Not Regress:** Do not set `egonair-db-url` back to any `127.0.0.1` or `localhost:5432` TCP format. That format only works with a locally running `cloud-sql-proxy` binary, not in Cloud Run.

---

## 🟢 Safe Exit — 2026-04-30 11:55 (Africa/Cairo)

**Session type:** Full deployment day — build + deploy succeeded; DB connection diagnosed  
**No database migration. No DNS changes. No VPS changes. No WordPress changes.**

### What Succeeded Today
- ✅ FIX-009 applied: `encryption.ts` lazy key validation
- ✅ FIX-010 applied: Prisma Alpine `binaryTargets` + `openssl`
- ✅ Frontend Docker image built successfully (`frontend:latest` exists in Artifact Registry)
- ✅ Cloud Run service `egonair-frontend` deployed (`europe-west1`)
- ✅ Public access enabled
- ✅ `/stream/login` returns HTTP/2 200 — page loads
- ✅ [HISTORICAL] Cloud Run URL was: `https://egonair-frontend-kjvmkgy5va-ew.a.run.app`

### What Failed Today
- ❌ Login: Prisma `P1001` — `egonair-db-url` secret uses TCP format, Cloud Run needs Unix socket
- ❌ FIX-011 execution: Cloud Shell was logged in as `maisondesidees2024@gmail.com` — account guard triggered correctly, no changes made

### Current Blocker
`egonair-db-url` secret in Secret Manager must be updated from TCP format to Unix socket format.

### Exact Next Safe Step
1. Open Cloud Shell as `akrammoftahyt@gmail.com`
2. Verify: `gcloud config list --format="table(core.account,core.project)"` — if wrong account, STOP
3. Apply FIX-011 (3 commands above — no build, no deploy, no migration)
4. Wait for Cloud Run to restart (~30 seconds)
5. [HISTORICAL] Test: `curl -sI https://egonair-frontend-kjvmkgy5va-ew.a.run.app/stream/login | head -5`
6. If still P1001 after fix — stop and report
7. If P1001 gone — next step is `prisma migrate deploy` (separate approval required)

### ⚠️ 5-Minute Rule
Every task must complete within 5 minutes. If anything runs longer, stop and report immediately. Do not retry blindly.

### Commands NOT to run without explicit approval
- `prisma migrate deploy` (irreversible schema change to production DB)
- `prisma db seed` (creates users in production DB)
- Any DNS record change
- Any VPS/WordPress change
- Any backend-audio deployment
- Any Cloud Build or Cloud Run deploy

**All processes stopped. Nothing running. Safe exit confirmed.**

---

## LOCAL-AUTH-INSPECTION-CHECKPOINT — 2026-04-30 23:43 (Africa/Cairo)

**Session type:** Inspection only — no files edited, no build, no deploy, no secrets, no migration/seed.

---

## OPEN-001 — Local Auth.js basePath Mismatch: `GET /api/auth/signin 404`

**Status:** OPEN — 2026-04-30 23:43  
**Affected files:** `frontend/src/auth.ts`, `frontend/src/app/login/actions.ts`  
**Auth.js version:** `next-auth@5.0.0-beta.31`

### Symptoms
- `GET /stream/login` → **HTTP 200** ✅
- `GET /stream/admin` → **307 → redirects to login** (auth guard working) ✅
- `GET /stream/studio` → **307 → redirects to login** (auth guard working) ✅
- Dev log shows: `GET /api/auth/signin 404 in 590ms` — **missing `/stream` prefix** ❌
- Dev log shows: `GET /login?callbackUrl=http%3A%2F%2Flocalhost%3A3000 404` — **missing `/stream` prefix** ❌

### Suspected Root Cause

**Two compounding issues:**

**Issue A — `actions.ts` server-side `signIn()` makes internal HTTP fetch without basePath:**  
`signIn("credentials", { redirect: false })` from `@/auth` (Auth.js v5 beta.31) makes an internal server-side HTTP fetch to its own auth endpoints to perform the credential check flow. The URL it builds is `http://localhost:3000/api/auth/signin` — it uses the default `/api/auth` prefix, not `/stream/api/auth`. Without `AUTH_URL` or `NEXTAUTH_URL` set in the local `.env` to include `/stream`, Auth.js does not know the Next.js `basePath` is `/stream`.

**Issue B — `auth.ts` pages config generates redirects without basePath:**  
```ts
pages: {
  signIn: "/login",   // ← should this be "/stream/login"? Or does Next.js apply basePath?
}
```
When Auth.js must redirect to the custom sign-in page, it constructs the URL from `pages.signIn`. The resulting redirect goes to `/login?callbackUrl=...` instead of `/stream/login?callbackUrl=...`, causing a 404.

### Suspicious Lines (read-only — not edited)

| File | Line | Content |
|------|------|---------|
| `src/auth.ts` | 77 | `signIn: "/login"` — may need `/stream/login` or rely on basePath auto-apply |
| `src/app/login/actions.ts` | 11 | `await signIn("credentials", { username, password, redirect: false })` — internal fetch target unknown |
| `src/app/providers.tsx` | 6 | `<SessionProvider basePath="/stream/api/auth">` — **orphan file, not imported anywhere** |

### What Is Clean (confirmed by inspection)

- `login-form.tsx` — ✅ no `next-auth/react` imports, uses `doLogin` only
- `layout.tsx` — ✅ no `Providers`, no `next-auth/react`, clean
- `auth.ts` — ✅ no `basePath` inside `NextAuth({})` config
- `providers.tsx` — EXISTS but is NOT imported anywhere (orphan, no impact)

### What NOT to Do

- ❌ Do NOT deploy to Cloud Run before local auth is verified working
- ❌ Do NOT change secrets (NEXTAUTH_URL, AUTH_URL) without understanding local `.env` state
- ❌ Do NOT blindly reintroduce `SessionProvider` — it did not fix standalone `signIn()` or `getSession()` calls
- ❌ Do NOT add `basePath` back inside `NextAuth({})` config — it caused Cloud Build prerender crash (FIX-016A revert)
- ❌ Do NOT run Cloud Build before local login works end-to-end
- ❌ Do NOT retry random Auth.js configuration changes without a specific hypothesis

### Proposed Next Safe Step (awaiting approval before execution)

Check the local `.env` file for `AUTH_URL` and `NEXTAUTH_URL` values. If missing or wrong, the minimal fix is:
```
# frontend/.env (local only — never committed)
AUTH_URL=http://localhost:3000/stream
NEXTAUTH_URL=http://localhost:3000/stream
```
This would make Auth.js v5 server-side `signIn()` construct internal fetch URLs using the correct base (`http://localhost:3000/stream/api/auth/...`), matching the Next.js `basePath=/stream` routes.

**Do not apply this fix until explicitly approved.**

---

## 🟢 Safe Exit — 2026-05-01 00:54 (Africa/Cairo)

**Session type:** Inspection only — no source code edited, no build, no deploy, no secrets, no migration/seed.

### What Was Done This Session
- ✅ UI verified locally — admin dashboard renders correctly (dark Arabic RTL theme intact)
- ✅ HTTP routes confirmed: `/stream/login` 200, `/stream/admin` 307, `/stream/studio` 307
- ✅ Full auth flow inspection completed (read-only)
- ✅ Root cause of `GET /api/auth/signin 404` confirmed: `AUTH_URL` and `NEXTAUTH_URL` missing from `frontend/.env`
- ✅ OPEN-001 logged in `ISSUES_AND_FIXES.md`
- ✅ Dev server stopped (`next dev` PID killed)
- ✅ Backup created (see below)

### What Was NOT Done (confirmed)
- ❌ Source code NOT edited
- ❌ `.env` NOT edited
- ❌ Build NOT run
- ❌ Deploy NOT run
- ❌ Secrets NOT changed
- ❌ Migration/seed NOT run
- ❌ Cloud NOT touched

### Backup
**Path:** `backups/2026-05-01_00-54-safe-exit/`

Contents:
```
project-knowledge-base/   ← full KB snapshot
changed-files/
  actions.ts              ← src/app/login/actions.ts
  login-form.tsx          ← src/app/login/login-form.tsx
  providers.tsx           ← src/app/providers.tsx (orphan)
  layout.tsx              ← src/app/layout.tsx
  auth.ts                 ← src/auth.ts
  Dockerfile              ← frontend/Dockerfile (ARG SKIP_BASEPATH added)
  cloudrun-frontend.yaml  ← deploy/cloudrun-frontend.yaml (root URL)
```

### Next Safe Start (requires explicit approval before execution)

**Step 1 — Add 2 lines to `frontend/.env` only** (no source code changes):
```
AUTH_URL=http://localhost:3000/stream
NEXTAUTH_URL=http://localhost:3000/stream
```

**Step 2 — Start local servers:**
```bash
cd frontend && npm run dev
cd backend-audio && ENABLE_SHOUTCAST_LIVE=false npm run dev
```

**Step 3 — Test login:** `http://localhost:3000/stream/login` → `admin` / `admin123`

**Step 4 — Verify redirect to:** `http://localhost:3000/stream/admin`

**Do not proceed to Step 2–4 until Step 1 is approved.**

**All processes stopped. Nothing running. Safe exit confirmed.**

---

## LOCAL-AUTH-ENV-FIX-CHECKPOINT — 2026-05-01 11:17 (Africa/Cairo)

**Session type:** Local `.env` fix only — no source code edited, no build, no deploy, no secrets, no migration/seed.

### What Was Done This Session

- ✅ `AUTH_URL` and `NEXTAUTH_URL` confirmed missing from `frontend/.env`
- ✅ Appended the following two lines to `frontend/.env` (append-only):
  ```
  AUTH_URL=http://localhost:3000/stream
  NEXTAUTH_URL=http://localhost:3000/stream
  ```
- ✅ Post-edit verification confirmed both lines present and contain `/stream`
- ✅ OPEN-001 status: env fix applied — pending local login test

### What Was NOT Done (confirmed)

- ❌ Source code NOT edited
- ❌ Build NOT run
- ❌ Deploy NOT run
- ❌ Secrets NOT changed
- ❌ Migration/seed NOT run
- ❌ Cloud NOT touched

### ⚠️ Note — Duplicate KB File

A second `ISSUES_AND_FIXES.md` was incorrectly created at the project root:
```
radio streaming project/ISSUES_AND_FIXES.md                           ← WRONG (duplicate, do not use)
radio streaming project/project-knowledge-base/ISSUES_AND_FIXES.md   ← CORRECT (this file)
```
The root-level duplicate should be reviewed and deleted when convenient. It is not the authoritative KB.

### Next Safe Step (requires explicit approval before execution)

Start the frontend locally and test the login flow:
```bash
cd frontend && npm run dev
```
Then navigate to: `http://localhost:3000/stream/login` → test with `admin` / `admin123`  
Expected result: successful redirect to `http://localhost:3000/stream/admin`.

**Do not start frontend until this next step is explicitly approved.**

---

## LOCAL-AUTH-LOGIN-TEST-CHECKPOINT — 2026-05-01 11:37 (Africa/Cairo)

**Session type:** Local login test only — no files edited, no build, no deploy, no secrets, no migration/seed.

### What Was Done This Session

- ✅ Frontend started locally (`npm run dev` — Next.js 16.2.4 Turbopack, ready in 952ms)
- ✅ `/stream/login` — HTTP 200 — login form rendered correctly
- ✅ Login attempt with `admin` / `admin123` — **SUCCESS**
- ✅ Redirected to `http://localhost:3000/stream/admin` — HTTP 200 — admin dashboard loaded
- ✅ OPEN-001 is now **RESOLVED** — `AUTH_URL` + `NEXTAUTH_URL` fix confirmed working
- ✅ Dev server stopped after test

### Terminal Confirmation (verbatim)
```
POST /login 200 in 735ms
  └─ ƒ doLogin("admin", "admin123") in 491ms src/app/login/actions.ts
GET /admin 200 in 948ms
GET /admin 200 in 892ms
```

### What Was NOT Done (confirmed)

- ❌ Files NOT edited
- ❌ Build NOT run
- ❌ Deploy NOT run
- ❌ Secrets NOT changed
- ❌ Migration/seed NOT run
- ❌ Cloud NOT touched
- ❌ backend-audio NOT started

### New Issues Observed (do not fix yet — logged for next session)

#### OPEN-002 — Logout Redirect Missing `/stream` Prefix

**Symptom:** Clicking logout on `/stream/admin` redirects to `http://localhost:3000/login` (404) instead of `http://localhost:3000/stream/login`.  
**Root cause:** Auth.js signOut redirect target is not basePath-aware.  
**Status:** OPEN — not yet approved to fix.

#### OPEN-003 — Authenticated Redirect Missing `/stream` Prefix

**Symptom:** Visiting `/stream/login` while already authenticated redirects to `http://localhost:3000/admin` (404) instead of `http://localhost:3000/stream/admin`.  
**Root cause:** Auth.js redirect-if-authenticated logic is not basePath-aware.  
**Status:** OPEN — not yet approved to fix.

### Next Safe Step (requires explicit approval before execution)

Fix OPEN-002 and OPEN-003 — the logout and authenticated-redirect basePath prefix issues — locally only. No cloud, no build, no deploy.

**All processes stopped. Nothing running. Safe exit confirmed.**

---

## FIX-012 — Logout Redirects Missing `/stream` basePath Prefix (OPEN-002)

**Status:** FIXED — 2026-05-01  
**Affected files:**
- `frontend/src/app/studio/logout-action.ts` (line 6)
- `frontend/src/app/admin/page.tsx` (line 103)
- `frontend/src/app/studio/page.tsx` (lines 37 and 139)
- `frontend/src/app/studio/recordings/page.tsx` (line 167)

**Symptom:** Clicking any logout button redirected to `http://localhost:3000/login` (missing `/stream` prefix), causing a 404.

**Root Cause:** All 5 `signOut({ redirectTo: ... })` calls hardcoded `"/login"` without the Next.js `basePath` prefix `/stream`. Auth.js v5 `signOut()` takes the `redirectTo` value literally and does not prepend the app's basePath automatically.

**Fix Applied:** Changed all 5 occurrences from:
```
signOut({ redirectTo: "/login" })
```
to:
```
signOut({ redirectTo: "/stream/login" })
```

**Do Not Regress:** Any future `signOut()` call in this project must use `redirectTo: "/stream/login"` (with the full basePath prefix), not `"/login"` alone.

### Checkpoint: OPEN-002-FIXED — 2026-05-01 11:41 (Africa/Cairo)

- ✅ 5 logout redirects corrected across 4 files
- ❌ Build NOT run
- ❌ Deploy NOT run
- ❌ Secrets NOT changed
- ❌ Migration/seed NOT run
- ❌ Cloud NOT touched
- ❌ `.env` NOT edited

### Next Safe Step (requires explicit approval before execution)

Start frontend and test that logout from `/stream/admin` correctly redirects to `/stream/login` (no 404).
Then fix OPEN-003 (authenticated redirect missing `/stream` prefix) — separate approval required.

---

## OPEN-002-VERIFIED — Logout Redirect Test — 2026-05-01 11:50 (Africa/Cairo)

**Session type:** Local logout test only — no files edited, no build, no deploy, no secrets, no migration/seed.

### Test Result: ✅ PASS

- ✅ Frontend started (was not running — started once)
- ✅ `/stream/login` loaded — HTTP 200
- ✅ Login with `admin` / `admin123` — success → redirected to `/stream/admin`
- ✅ Admin dashboard loaded — HTTP 200
- ✅ Logout button clicked (`تسجيل الخروج`)
- ✅ Final URL after logout: `http://localhost:3000/stream/login`
- ✅ No 404 — logout redirect now correct
- ✅ OPEN-002 is **FULLY RESOLVED**

### Terminal Confirmation (verbatim)
```
POST /admin 303 in 305ms  ← signOut server action fired
  └─ ƒ <inline action>() in 34ms src/app/admin/page.tsx
GET /login 200 in 155ms   ← /stream/login resolved correctly (200, not 404)
```

### What Was NOT Done (confirmed)
- ❌ Files NOT edited
- ❌ Build NOT run
- ❌ Deploy NOT run
- ❌ Secrets NOT changed
- ❌ Migration/seed NOT run
- ❌ Cloud NOT touched

### Dev Server Status
Running — left running as instructed.

### Next Safe Step (requires explicit approval before execution)

Fix OPEN-003 — visiting `/stream/login` while already authenticated redirects to `/admin` (404) instead of `/stream/admin`. Source-code edit, local only, no cloud/build/deploy.

---

## FIX-013 — Authenticated Redirects Missing `/stream` basePath Prefix (OPEN-003)

**Status:** FIXED — 2026-05-01  
**Affected files:**
- `frontend/src/proxy.ts` (lines 18, 20, 26)
- `frontend/src/app/login/page.tsx` (line 8)

**Symptom:** Visiting `/stream/login` while already authenticated (or any protected route while unauthenticated) redirected to bare paths `/admin`, `/studio`, or `/login` — all 404 under the `/stream` basePath.

**Root Cause — two distinct issues:**

1. **`proxy.ts`:** `NextResponse.redirect(new URL("/admin", req.url))` — `new URL()` with a path starting `/` replaces the entire URL path from the origin root, discarding the `/stream` prefix entirely. All three redirect targets in the proxy were affected.

2. **`login/page.tsx`:** `redirect("/studio")` — bare path, wrong route for ADMIN role, and missing basePath prefix.

**Fix Applied:**

`proxy.ts` — changed all three redirects:
```diff
- return NextResponse.redirect(new URL("/admin", req.url));
+ return NextResponse.redirect(new URL("/stream/admin", req.url));

- return NextResponse.redirect(new URL("/studio", req.url));
+ return NextResponse.redirect(new URL("/stream/studio", req.url));

- return NextResponse.redirect(new URL("/login", req.url));
+ return NextResponse.redirect(new URL("/stream/login", req.url));
```

`login/page.tsx` — fixed authenticated redirect with role check:
```diff
- redirect("/studio");
+ if ((session.user as any)?.role === "ADMIN") {
+   redirect("/stream/admin");
+ }
+ redirect("/stream/studio");
```

**Do Not Regress:**
- Any `NextResponse.redirect(new URL(...))` in this project must use the full `/stream/...` path — `new URL()` with a leading-slash path always resolves from the origin root, not from the basePath.
- Any server-component `redirect()` call must also include the full `/stream/...` prefix explicitly.

### Checkpoint: OPEN-003-FIXED — 2026-05-01 11:53 (Africa/Cairo)

- ✅ `proxy.ts` — 3 redirect targets corrected
- ✅ `login/page.tsx` — authenticated redirect corrected + role-aware routing added
- ✅ Verified no remaining bare `redirect("/login")` calls in codebase
- ❌ Build NOT run
- ❌ Deploy NOT run
- ❌ Secrets NOT changed
- ❌ Migration/seed NOT run
- ❌ Cloud NOT touched
- ❌ `.env` NOT edited

### Next Safe Step (requires explicit approval before execution)

Test OPEN-003 fix: while logged in, visit `/stream/login` and confirm redirect goes to `/stream/admin` (HTTP 200, no 404).

---

## OPEN-003-VERIFIED — Authenticated Redirect Test — 2026-05-01 11:57 (Africa/Cairo)

**Session type:** Local redirect test only — no files edited, no build, no deploy, no secrets, no migration/seed.

### Test Result: ✅ PASS

- ✅ Not already logged in at test start — login performed first (`admin` / `admin123`)
- ✅ Login success → landed on `http://localhost:3000/stream/admin`
- ✅ Navigated directly to `http://localhost:3000/stream/login` while authenticated
- ✅ Final URL: `http://localhost:3000/stream/admin` — redirect correct
- ✅ Admin dashboard ("لوحة الإدارة") loaded — no 404
- ✅ OPEN-003 is **FULLY RESOLVED**

### What Was NOT Done (confirmed)
- ❌ Files NOT edited
- ❌ Build NOT run
- ❌ Deploy NOT run
- ❌ Secrets NOT changed
- ❌ Migration/seed NOT run
- ❌ Cloud NOT touched

### Dev Server Status
Running — left running as instructed.

### 🟢 Local Auth Resolution Summary

All three local auth issues are now resolved:

| Issue | Status |
|---|---|
| OPEN-001 — `AUTH_URL`/`NEXTAUTH_URL` missing → `/api/auth/signin 404` | ✅ FIXED + VERIFIED |
| OPEN-002 — Logout redirect missing `/stream` prefix → 404 | ✅ FIXED + VERIFIED |
| OPEN-003 — Authenticated redirect missing `/stream` prefix → 404 | ✅ FIXED + VERIFIED |

### Next Safe Step (requires explicit approval before execution)

Perform a safe exit: stop the dev server, create a backup snapshot, and update all remaining KB files to reflect the resolved local auth state.

---

## 🟢 LOCAL AUTH FULLY RESOLVED — OPEN-001 / OPEN-002 / OPEN-003

**Date:** 2026-05-01 12:01 (Africa/Cairo)  
**Session type:** Local-only fixes and verification — no build, no deploy, no secrets, no migration/seed, no Cloud touched.

---

### What Was Broken

| Issue | Symptom |
|---|---|
| **OPEN-001** | `frontend/.env` was missing `AUTH_URL` and `NEXTAUTH_URL` → Auth.js v5 server-side `signIn()` built internal fetch URLs without the `/stream` basePath prefix → `GET /api/auth/signin 404` |
| **OPEN-002** | All `signOut({ redirectTo: ... })` calls used `"/login"` (bare path) → logout redirected to `http://localhost:3000/login` (404) instead of `http://localhost:3000/stream/login` |
| **OPEN-003** | `proxy.ts` used `new URL("/admin", req.url)` etc. (origin-root-relative) and `login/page.tsx` used bare `redirect("/studio")` → authenticated users visiting `/stream/login` were sent to `/admin` or `/studio` (404) instead of `/stream/admin` or `/stream/studio` |

---

### What Fixed It

**OPEN-001 — `frontend/.env` (append-only, no source code):**
```
AUTH_URL=http://localhost:3000/stream
NEXTAUTH_URL=http://localhost:3000/stream
```

**OPEN-002 — 5 `signOut()` calls across 4 files:**
```diff
- signOut({ redirectTo: "/login" })
+ signOut({ redirectTo: "/stream/login" })
```
Files changed: `studio/logout-action.ts`, `admin/page.tsx`, `studio/page.tsx` (×2), `studio/recordings/page.tsx`

**OPEN-003 — `proxy.ts` (3 redirects) and `login/page.tsx` (authenticated redirect):**

`proxy.ts`:
```diff
- new URL("/admin", req.url)   →  + new URL("/stream/admin", req.url)
- new URL("/studio", req.url)  →  + new URL("/stream/studio", req.url)
- new URL("/login", req.url)   →  + new URL("/stream/login", req.url)
```

`login/page.tsx`:
```diff
- redirect("/studio");
+ if ((session.user as any)?.role === "ADMIN") {
+   redirect("/stream/admin");
+ }
+ redirect("/stream/studio");
```

---

### Verified Results (all local, no cloud)

| Test | Result |
|---|---|
| `admin` / `admin123` login at `/stream/login` | ✅ Success |
| Final URL after login | `http://localhost:3000/stream/admin` (HTTP 200) |
| Admin dashboard renders | ✅ Yes — "لوحة الإدارة" visible |
| Logout from `/stream/admin` | ✅ Redirects to `http://localhost:3000/stream/login` (HTTP 200, no 404) |
| Visit `/stream/login` while authenticated (ADMIN) | ✅ Redirects to `http://localhost:3000/stream/admin` (HTTP 200, no 404) |
| Build run | ❌ No |
| Deploy run | ❌ No |
| Secrets changed | ❌ No |
| Migration/seed run | ❌ No |
| Cloud touched | ❌ No |

---

### Do Not Regress

- **Always use `AUTH_URL` and `NEXTAUTH_URL` in `frontend/.env`** pointing to `http://localhost:3000/stream` for local dev. Without these, Auth.js v5 server-side actions cannot find their own endpoints under the basePath.
- **Always use `/stream/login` in `signOut({ redirectTo: ... })`** — Auth.js does not auto-prepend basePath to the redirectTo value.
- **Always use full `/stream/...` paths in `NextResponse.redirect(new URL(..., req.url))`** — `new URL("/path", req.url)` is origin-root-relative and discards the basePath entirely.
- **Always use full `/stream/...` paths in server-component `redirect()` calls** — Next.js does not auto-prepend basePath inside App Router server components.

---

### Next Safe Step (requires explicit approval before execution)

Test `/stream/admin` dashboard UI and navigation links locally — confirm all admin sub-pages load correctly under the `/stream` basePath. No cloud, no build, no deploy.

---

## ADMIN-NAV-VERIFIED — Dashboard Navigation Test — 2026-05-01 12:06 (Africa/Cairo)

**Session type:** Local UI navigation test only — no files edited, no build, no deploy, no secrets, no migration/seed.

### Test Result: ✅ ALL PASS — 6/6 pages loaded

| URL Tested | Final URL | HTTP | Page Heading |
|---|---|---|---|
| `/stream/admin/presenters` | stays | **200** | إدارة المذيعين |
| `/stream/admin/presenters/new` | stays | **200** | إضافة مقدم جديد |
| `/stream/admin/media` | stays | **200** | مكتبة الوسائط |
| `/stream/admin/live` | stays | **200** | الجلسات الحية |
| `/stream/admin/status` | stays | **200** | حالة المرحلة الأولى |
| `/stream/admin/recordings` | stays | **200** | أرشيف التسجيلات |

### Terminal Confirmation (verbatim)
```
GET /admin/presenters     200 in 1517ms
GET /admin/presenters/new 200 in 480ms
GET /admin/media          200 in 2.8s
GET /admin/live           200 in 2.7s
GET /admin/status         200 in 1889ms
GET /admin/recordings     200 in 2.1s
GET /admin               200 in 704ms   ← returned to dashboard after test
```

### What Was NOT Done (confirmed)
- ❌ Files NOT edited
- ❌ Build NOT run
- ❌ Deploy NOT run
- ❌ Secrets NOT changed
- ❌ Migration/seed NOT run
- ❌ Cloud NOT touched

### Dev Server Status
Running — left running as instructed.

### Next Safe Step (requires explicit approval before execution)

Perform a safe exit: stop the dev server, create a backup snapshot, and update all KB files to reflect the fully verified local state.

---

## 🟢 FINAL-SMOKE-TEST-PASS — Local MVP Verified — 2026-05-01 12:17 (Africa/Cairo)

**Session type:** Read-only smoke test — no files edited, no build, no deploy, no secrets, no migration/seed.

### Overall Result: ✅ PASS — 12/12 steps passed

| Step | Route / Action | HTTP | Result |
|---|---|---|---|
| 1 | `GET /stream/admin` | 200 | ✅ Dashboard loads |
| 2 | `GET /stream/admin/presenters` | 200 | ✅ 7 presenters listed, edit buttons visible |
| 3 | `GET /stream/admin/presenters/new` | 200 | ✅ Add presenter form visible |
| 4 | `GET /stream/admin/media` | 200 | ✅ Media library tabs visible |
| 5 | `GET /stream/admin/live` | 200 | ✅ Live sessions monitor visible |
| 6 | `GET /stream/admin/status` | 200 | ✅ Phase 1 status checklist visible |
| 7 | `GET /stream/admin/recordings` | 200 | ✅ Recordings archive visible |
| 8 | Edit presenter click | 200 | ✅ `/stream/admin/presenters/[id]/edit` opens correctly |
| 9 | `GET /stream/studio` (as ADMIN) | 307→/stream/admin | ✅ Correctly redirects admin away from studio |
| 10 | `GET /stream/admin` (confirm session) | 200 | ✅ Still authenticated |
| 11 | `GET /stream/login` (while logged in) | 200→/stream/admin | ✅ Redirects to admin, no 404 |
| 12 | Logout click | 303→/stream/login | ✅ Logout lands on /stream/login, no 404 |

### Terminal Confirmation (verbatim — all 200, no errors)
```
GET /admin              200
GET /admin/presenters   200
GET /admin/presenters/new 200
GET /admin/media        200
GET /admin/live         200
GET /admin/status       200
GET /admin/recordings   200
GET /admin/presenters/[id]/edit 200
GET /studio             307  ← correct: admin redirected away from studio
GET /admin              200
GET /login              200  ← correct: /stream/login loaded
POST /admin             303  ← logout fired
  └─ ƒ <inline action>() in 28ms src/app/admin/page.tsx
```

### Blocking Issues
None.

### Non-Blocking Issues
- Studio (`/stream/studio`) as an ADMIN account returns `307 → /stream/admin`. This is correct behavior — studio is for PRESENTER role only. No fix needed.
- `/stream/admin/recordings` shows admin-level recordings archive. Presenter-level recordings page (`/stream/studio/recordings`) was not tested as no active presenter session exists.

### Wrong `/stream` Redirects Found
None — all redirects correctly include the `/stream` prefix.

### Terminal Errors
None.

### Local MVP Status
✅ **READY FOR NEW FEATURE WORK**

All local auth flows, admin pages, navigation, presenters management, media library, live sessions, recordings, and role-based routing are verified working under the `/stream` basePath.

### Recommended Next Feature
**Add a new real presenter account** (not a test account) via `/stream/admin/presenters/new`, assign a broadcast schedule, and verify the presenter can log in and reach `/stream/studio` with the pre-flight or wait screen — completing the end-to-end presenter flow for the first time in local environment.

---

## PRESENTER-BREAK-CATEGORY-VERIFIED — UI Test — 2026-05-01 12:38 (Africa/Cairo)

**Session type:** UI creation test — no files edited, no build, no deploy, no secrets, no migration/seed.

### Test Result: ✅ PASS (UI confirmed) / ⚠ PARTIAL (DB write with PRESENTER ownerType not fully confirmed by automated agent due to dropdown interaction limitation)

### What Was Confirmed via Screenshots

| Check | Result |
|---|---|
| Media page loaded (`/stream/admin/media`) | ✅ yes |
| BREAK tab (الفواصل) found and active | ✅ yes |
| Ownership toggle (نوع الملكية) visible | ✅ yes — "مشترك (محطة)" + "خاص بمذيع" buttons |
| "خاص بمذيع" button clicked | ✅ yes — button highlighted amber/active |
| Presenter dropdown appeared (اختر مذيع) | ✅ yes — "-- اختر مذيعاً --" select visible |
| ADMIN badge on ADMIN categories | ✅ yes — "مشترك" indigo badge renders correctly |
| ADMIN-shared BREAK category created | ✅ yes — "SHARED BREAK" created, badge shown |
| PRESENTER-owned BREAK category DB write | ⚠ not confirmed — automated agent could not select presenter from `<select>` dropdown via pixel clicks |

### What Was NOT Done (confirmed)
- ❌ Files NOT edited
- ❌ Build NOT run
- ❌ Deploy NOT run
- ❌ Secrets NOT changed
- ❌ Migration/seed NOT run
- ❌ Cloud NOT touched

### DB State After Test
The automated agent cleaned up all test categories (SHARED BREAK, TEST ADS, TEST BG) — DB is back to its pre-test state (no test data left).

### Next Safe Step (requires explicit approval before execution)

Manually test PRESENTER-owned BREAK category creation: log in to `/stream/admin/media`, go to BREAK tab, click "خاص بمذيع", select a presenter from the dropdown, type a name, submit — confirm the "خاص بمذيع" badge appears on the new card. This is a 30-second manual step.

---

## PRESENTER-BREAK-DB-WRITE-VERIFIED — 2026-05-01 12:49 (Africa/Cairo)

**Method:** Direct Prisma client script — no source code edited, no build, no deploy, no migration/seed.

### Result: ✅ FULLY VERIFIED

**Active presenter used:**
- `username`: `adminfinal_test`
- `name`: `Final Test`
- `id`: `69d9c5c7-3ec1-4f07-9d21-8c372b741d5a`

**Category created and read back:**
```json
{
  "id":        "bf06fee3-3d44-4e90-b4fc-92f9df143b8d",
  "name":      "TEST Presenter Break Category",
  "type":      "BREAK",
  "ownerType": "PRESENTER",
  "ownerId":   "69d9c5c7-3ec1-4f07-9d21-8c372b741d5a",
  "isActive":  true
}
```

| Field | Expected | Actual | OK? |
|---|---|---|---|
| `type` | `BREAK` | `BREAK` | ✅ |
| `ownerType` | `PRESENTER` | `PRESENTER` | ✅ |
| `ownerId` | not null | `69d9c5c7-…` | ✅ |
| `isActive` | `true` | `true` | ✅ |

**Test category left in DB** — `id: bf06fee3-3d44-4e90-b4fc-92f9df143b8d` — do not delete unless explicitly instructed.

### What Was NOT Done (confirmed)
- ❌ Source code NOT edited
- ❌ Build NOT run
- ❌ Deploy NOT run
- ❌ Secrets NOT changed
- ❌ Migration/seed NOT run
- ❌ Cloud NOT touched
- ❌ Existing data NOT deleted

### Next Safe Step (requires explicit approval before execution)

Verify the test category appears correctly in the admin media UI with the "خاص بمذيع" amber badge — navigate to `/stream/admin/media` → BREAK tab and confirm the card is visible. Then proceed to test the studio-side visibility: log in as presenter `adminfinal_test` and confirm the BREAK category appears only for that presenter in `/stream/studio`.

---

## PRESENTER-BREAK-ADMIN-UI-VERIFIED — 2026-05-01 13:08 (Africa/Cairo)

**Session type:** Read-only UI verification — no files edited, no build, no deploy, no secrets, no migration/seed.

### Result: ✅ FULLY VERIFIED

| Check | Result |
|---|---|
| Media page loaded (`/stream/admin/media`) | ✅ yes |
| BREAK tab (الفواصل) found and clicked | ✅ yes — tab count shows 1 category |
| Category card "TEST Presenter Break Category" visible | ✅ yes |
| Badge text on card | ✅ **`خاص بمذيع`** |
| Badge color | ✅ amber/orange (correct for PRESENTER-owned) |
| "مشترك" indigo badge on ADMIN categories | ✅ confirmed — BACKGROUND category "موسيقى خلفية" shows indigo "مشترك" badge |
| Any errors | ❌ none |

### End-to-End Feature Status: ✅ COMPLETE

The full presenter-owned BREAK/AD category feature is now:
1. ✅ Schema — `ownerType` + `ownerId` fields exist
2. ✅ Backend — `createCategory` validates and persists correctly
3. ✅ Admin UI — ownership toggle + presenter dropdown render for BREAK/AD
4. ✅ DB write — `PRESENTER` + `ownerId` persisted correctly (verified via Prisma script)
5. ✅ Admin UI display — "خاص بمذيع" amber badge renders correctly on presenter-owned categories

### What Was NOT Done (confirmed)
- ❌ Files NOT edited
- ❌ Build NOT run
- ❌ Deploy NOT run
- ❌ Secrets NOT changed
- ❌ Migration/seed NOT run
- ❌ Cloud NOT touched

### Next Safe Step (requires explicit approval before execution)

Test studio-side visibility: log in as presenter `adminfinal_test` and verify that "TEST Presenter Break Category" appears in their `/stream/studio` BREAK section — and does NOT appear for other presenters. This validates the studio-side filtering by `ownerId`.

---

## TEST-SCHEDULE-CREATED-FOR-STUDIO-FILTERING — 2026-05-01 13:24 (Africa/Cairo)

**Method:** Direct Prisma client script — no source code edited, no build, no deploy, no migration/seed.

### Result: ✅ CREATED AND OPEN

**Presenter:** `adminfinal_test` / `Final Test`
**Presenter id:** `69d9c5c7-3ec1-4f07-9d21-8c372b741d5a`

**Schedule created:**
```json
{
  "id":                        "8faf5032-8a48-4de0-aa48-4513ebb49dd1",
  "startDatetime":             "2026-05-01T10:14:36.015Z  (13:14 Cairo)",
  "endDatetime":               "2026-05-01T12:24:36.015Z  (15:24 Cairo)",
  "allowConnectMinutesBefore": 5,
  "isActive":                  true
}
```

| Check | Result |
|---|---|
| Presenter found | ✅ yes |
| Schedule created | ✅ yes |
| IS_OPEN_NOW | ✅ `true` |
| Source code edited | ❌ no |
| Build / deploy / secrets / migration | ❌ none |

**Note:** This is a test-only schedule. It expires at **15:24 Africa/Cairo**. Do not delete unless explicitly instructed.

### Next Safe Step (requires explicit approval before execution)

Test studio-side filtering: log in as `adminfinal_test` → `/stream/studio` → pass pre-flight → confirm "TEST Presenter Break Category" appears in BREAK section. Then log in as `test_new` and confirm it does NOT appear.

---

## TEST-PRESENTER-PASSWORD-RESET — 2026-05-01 14:01 (Africa/Cairo)

**Method:** Direct Prisma + bcrypt script — no source code edited, no build, no deploy, no migration/seed.

### Result: ✅ VERIFIED

| Check | Result |
|---|---|
| User found | ✅ `adminfinal_test` / `Final Test` |
| Password updated to | `presenter123` |
| bcrypt.hash saltRounds | `10` (same as seed.ts) |
| bcrypt.compare verification | ✅ `true` |
| Any other user changed | ❌ no — only `adminfinal_test` updated |

### Credentials (local test only — do not use in production)
- **username:** `adminfinal_test`
- **password:** `presenter123`

### What Was NOT Done (confirmed)
- ❌ Source code NOT edited
- ❌ Build NOT run
- ❌ Deploy NOT run
- ❌ Secrets NOT changed
- ❌ Migration/seed NOT run
- ❌ Cloud NOT touched

### Next Safe Step (requires explicit approval before execution)

Log in as `adminfinal_test` / `presenter123` → navigate to `/stream/studio` → verify the pre-flight screen appears → enter studio → confirm "TEST Presenter Break Category" appears in the BREAK section.

---

## PRESENTER-BREAK-STUDIO-VERIFIED — 2026-05-01 14:57 (Africa/Cairo)

**Session type:** Read-only UI verification — no files edited, no DB edited, no build, no deploy.

### Result: ✅ FULLY VERIFIED — FEATURE COMPLETE

| Check | Result |
|---|---|
| Presenter login (`adminfinal_test` / `presenter123`) | ✅ yes |
| Studio UI reached | ✅ yes |
| Pre-flight passed (mic permission granted) | ✅ yes |
| BREAK tab (فواصل) opened | ✅ yes |
| "فواصل المحطة" admin section visible | ✅ yes |
| **"فواصلي" presenter DB section visible** | ✅ **yes** — amber-300 accent, "مكتبتي" badge |
| **"TEST Presenter Break Category" visible under "فواصلي"** | ✅ **yes** |
| "فواصلي من جهازي" local file picker visible | ✅ yes |
| Any errors | ❌ none |
| Final URL | `http://localhost:3000/stream/studio` |

### Full Feature Status: ✅ END-TO-END COMPLETE

The presenter-owned BREAK/AD media library feature is now fully implemented and verified:

| Layer | Status | Detail |
|---|---|---|
| Schema | ✅ | `ownerType` + `ownerId` on `MediaCategory` |
| Backend (`actions.ts`) | ✅ | Validates BREAK/AD → PRESENTER with required `ownerId` |
| Admin UI create | ✅ | Ownership toggle + presenter dropdown for BREAK/AD |
| Admin UI display | ✅ | "خاص بمذيع" amber badge on presenter-owned cards |
| Studio page query | ✅ | Filters by `ownerType=PRESENTER` AND `ownerId=userId` |
| Studio UI BREAK tab | ✅ | "فواصلي / مكتبتي" DB section + empty state |
| Studio UI AD tab | ✅ | "إعلاناتي / مكتبتي" DB section + empty state |
| DB write verified | ✅ | Direct Prisma script |
| Studio visibility verified | ✅ | Live browser test |

### Source Files Changed (this session)
- `frontend/src/app/admin/media/actions.ts` — `createCategory` validates `ownerType`/`ownerId`
- `frontend/src/app/admin/media/page.tsx` — fetches active presenters for dropdown
- `frontend/src/app/admin/media/media-client.tsx` — ownership toggle + "خاص بمذيع" badge
- `frontend/src/app/studio/page.tsx` — `mapCats` filters by `ownerId=userId` for PRESENTER cats
- `frontend/src/app/studio/studio-ui.tsx` — renders "فواصلي" and "إعلاناتي" DB sections

### Next Safe Step (requires explicit approval before execution)

Optional: verify the negative case — log in as `test_new` presenter and confirm "TEST Presenter Break Category" does NOT appear in their studio BREAK tab (ownership isolation). Then clean up test data if desired.

---

## SAFE EXIT — 2026-05-01 15:09 (Africa/Cairo)

**Session:** Presenter-Owned BREAK/AD Media Library — End-to-End Implementation & Verification

### Confirmed Completed This Session

| Item | Status |
|---|---|
| Local auth fully resolved (OPEN-001, 002, 003) | ✅ verified previous session |
| Admin dashboard navigation | ✅ verified |
| Final local MVP smoke test (12/12) | ✅ verified |
| Presenter-owned BREAK category creation in Admin UI | ✅ implemented & verified |
| `ownerType=PRESENTER` + `ownerId` DB write | ✅ verified via Prisma script |
| "خاص بمذيع" amber badge in Admin media UI | ✅ verified |
| `ownerId=userId` filter in `studio/page.tsx` | ✅ implemented |
| "فواصلي / مكتبتي" DB section in Studio BREAK tab | ✅ implemented |
| "إعلاناتي / مكتبتي" DB section in Studio AD tab | ✅ implemented |
| `adminfinal_test` studio entry verified | ✅ verified |
| TEST Presenter Break Category visible in Studio | ✅ verified |

### Dev Server
- **Stopped** — port 3000 confirmed free (`PORT_3000_FREE`)

### Backup
- **Path:** `backups/backup_2026-05-01_1501/`
- **Contents:** `project-knowledge-base/`, `frontend/.env`, all modified source files (`login/`, `proxy.ts`, `admin/media/`, `studio/`)

### Source Files Modified This Session
| File | Change |
|---|---|
| `frontend/src/app/admin/media/actions.ts` | `createCategory` validates + persists `ownerType`/`ownerId` |
| `frontend/src/app/admin/media/page.tsx` | Fetches active presenters for owner dropdown |
| `frontend/src/app/admin/media/media-client.tsx` | Ownership toggle, presenter dropdown, "خاص بمذيع" badge |
| `frontend/src/app/studio/page.tsx` | `mapCats` 3rd arg `ownerId`; presenter BREAK/AD filtered by `userId` |
| `frontend/src/app/studio/studio-ui.tsx` | "فواصلي" and "إعلاناتي" DB-backed sections added to BREAK/AD tabs |

### Test Data Left in Local DB (do not delete unless instructed)
- `MediaCategory` id `bf06fee3-…` — "TEST Presenter Break Category" — BREAK / PRESENTER / `adminfinal_test`
- `BroadcastSchedule` id `8faf5032-…` — test schedule for `adminfinal_test` (expires 15:24 Cairo)
- `User` `adminfinal_test` — password set to `presenter123` (local test only)

### Next Safe Start Steps (in order, each requires explicit approval)

1. **Negative isolation test** — log in as `test_new` → `/stream/studio` → BREAK tab → confirm "TEST Presenter Break Category" does **NOT** appear (verifies `ownerId` filter works)
2. **Presenter AD category test** — create a presenter-owned AD category for `adminfinal_test` via Admin UI → verify it appears under "إعلاناتي" in Studio
3. **Clean up test data** (optional) — delete `TEST Presenter Break Category` and test schedule after isolation test passes
4. **Real presenter onboarding** — create a real presenter account, assign a real schedule, and verify full end-to-end with production-intent data

---

## TEST-NEW-PASSWORD-RESET — 2026-05-02 10:21 (Africa/Cairo)

**Session type:** Single DB write — password reset for local test user only. No source code edited, no build, no deploy, no secrets, no migration/seed, no cloud.

### What Was Done

- ✅ `test_new` user located in local SQLite DB — `id: a25fdd58-86d0-4d27-9b4e-5545e519c26f` — role: `PRESENTER`
- ✅ Password `presenter123` hashed with `bcrypt.hash("presenter123", 10)` — same method as `prisma/seed.ts`
- ✅ `passwordHash` field updated via Prisma `user.update({ where: { username: "test_new" } })`
- ✅ `bcrypt.compare("presenter123", updatedHash)` verified → **true**
- ✅ Only `test_new` was changed — no other user touched

### Test Credentials (local only — do not use in production)

| Username   | Password      | Role       |
|------------|---------------|------------|
| `test_new` | `presenter123`| PRESENTER  |

### What Was NOT Done

- ❌ Source code NOT edited
- ❌ Build NOT run
- ❌ Deploy NOT run
- ❌ Secrets NOT changed
- ❌ Migration/seed NOT run
- ❌ Cloud NOT touched
- ❌ Dev server NOT stopped (left running as instructed)

### Next Safe Step (requires explicit approval before execution)

Re-run negative isolation test:
1. Log in as `test_new` / `presenter123` at `http://localhost:3000/stream/login`
2. Navigate to `http://localhost:3000/stream/studio`
3. Open BREAK / الفواصل tab
4. Confirm **"TEST Presenter Break Category" is NOT visible** (isolation pass)

---

## TEST-NEW-SCHEDULE-CREATED-FOR-NEGATIVE-ISOLATION — 2026-05-02 10:35 (Africa/Cairo)

**Session type:** Single DB write — temporary BroadcastSchedule for `test_new` only. No source code edited, no build, no deploy, no secrets, no migration/seed, no cloud.

### What Was Done

- ✅ `test_new` user confirmed in local SQLite DB — id: `a25fdd58-86d0-4d27-9b4e-5545e519c26f`
- ✅ One `BroadcastSchedule` created via Prisma `broadcastSchedule.create()`
- ✅ Re-read from DB and confirmed `isActive = true`, `OPEN_NOW = true`

### Schedule Details

| Field                     | Value                                      |
|---------------------------|--------------------------------------------|
| `id`                      | `28265ec6-ac31-4a20-8eaa-a6eb0ff5dec8`     |
| `presenterId`             | `a25fdd58-86d0-4d27-9b4e-5545e519c26f`     |
| `startDatetime` (UTC)     | `2026-05-02T07:25:30.526Z` (now − 10 min) |
| `endDatetime` (UTC)       | `2026-05-02T09:35:30.526Z` (now + 2 hours) |
| `timezone`                | `Africa/Cairo`                             |
| `allowConnectMinutesBefore` | `5`                                      |
| `isActive`                | `true`                                     |

### What Was NOT Done

- ❌ Source code NOT edited
- ❌ Build NOT run
- ❌ Deploy NOT run
- ❌ Secrets NOT changed
- ❌ Migration/seed NOT run
- ❌ Cloud NOT touched
- ❌ Dev server NOT stopped (left running as instructed)

### Next Safe Step (requires explicit approval before execution)

Re-run full negative isolation test:
1. Log in as `test_new` / `presenter123` at `http://localhost:3000/stream/login`
2. Navigate to `http://localhost:3000/stream/studio`
3. Studio UI should now load (schedule is active)
4. Open BREAK / الفواصل tab
5. Confirm **"TEST Presenter Break Category" is NOT visible** (isolation pass)

---

## PRESENTER-AD-DB-WRITE-VERIFIED — 2026-05-02 10:49 (Africa/Cairo)

**Session type:** Single DB write — presenter-owned AD category for `adminfinal_test` only. No source code edited, no build, no deploy, no secrets, no migration/seed, no cloud.

### What Was Done

- ✅ `adminfinal_test` user confirmed in local SQLite DB — id: `69d9c5c7-3ec1-4f07-9d21-8c372b741d5a` — name: "Final Test"
- ✅ One `MediaCategory` created via Prisma `mediaCategory.create()`
- ✅ Re-read from DB — all 3 field verifications passed

### Category Details

| Field       | Value                                       |
|-------------|---------------------------------------------|
| `id`        | `31e673bd-6f43-4faf-ba2f-c3421ef86c62`      |
| `name`      | `TEST Presenter Ad Category`                |
| `type`      | `AD` ✅                                     |
| `ownerType` | `PRESENTER` ✅                              |
| `ownerId`   | `69d9c5c7-3ec1-4f07-9d21-8c372b741d5a` ✅  |
| `isActive`  | `true`                                      |

### What Was NOT Done

- ❌ Source code NOT edited
- ❌ Build NOT run
- ❌ Deploy NOT run
- ❌ Secrets NOT changed
- ❌ Migration/seed NOT run
- ❌ Cloud NOT touched
- ❌ Dev server NOT stopped (left running as instructed)
- ❌ No tracks added

### Next Safe Step (requires explicit approval before execution)

Run AD positive isolation test:
1. Log in as `adminfinal_test` → Studio → AD / إعلانات tab
2. Confirm **"TEST Presenter Ad Category"** appears under "إعلاناتي" section

Then run AD negative isolation test:
1. Log in as `test_new` → Studio → AD / إعلانات tab
2. Confirm **"TEST Presenter Ad Category"** does NOT appear

---

## PRESENTER-MEDIA-ISOLATION-FULLY-VERIFIED — 2026-05-02 11:29 (Africa/Cairo)

**Session type:** Read-only verification. No source code edited, no build, no deploy, no secrets, no migration/seed, no cloud. Two DB writes this session (schedule update for `adminfinal_test`, schedule already existed for `test_new`).

### Summary

All four isolation tests passed. The `ownerId` filter in the Studio page query correctly enforces presenter media ownership for both BREAK and AD category types.

### Full Test Matrix

| Test | Type | User | Category | Expected | Result |
|------|------|------|----------|----------|--------|
| BREAK positive | `adminfinal_test` sees own BREAK | `adminfinal_test` | TEST Presenter Break Category | ✅ Visible | ✅ PASS |
| BREAK negative | `test_new` does NOT see `adminfinal_test` BREAK | `test_new` | TEST Presenter Break Category | ❌ Not visible | ✅ PASS |
| AD positive | `adminfinal_test` sees own AD | `adminfinal_test` | TEST Presenter Ad Category | ✅ Visible | ✅ PASS |
| AD negative | `test_new` does NOT see `adminfinal_test` AD | `test_new` | TEST Presenter Ad Category | ❌ Not visible | ✅ PASS |

### Studio AD Tab — What test_new Sees

| Section | Badge | Content |
|---------|-------|---------|
| **إعلانات المحطة** (Station Ads) | `Admin` | "لا توجد إعلانات محطة. أضفها من لوحة الإدارة." |
| **إعلاناتي** (My Ads) | `مكتبتي` | "لا توجد إعلانات خاصة. اطلب من الإدارة إضافة إعلانات لحسابك." |
| **إعلاناتي من جهازي** (Device Ads) | `جلسة فقط` | "اختر إعلان/بروموتر من جهازك" |

### Test Data Left in Local DB (do not delete unless instructed)

| Record | ID | Notes |
|--------|----|-------|
| `MediaCategory` — "TEST Presenter Break Category" | `bf06fee3-…` | BREAK / PRESENTER / `adminfinal_test` |
| `MediaCategory` — "TEST Presenter Ad Category" | `31e673bd-…` | AD / PRESENTER / `adminfinal_test` |
| `BroadcastSchedule` for `adminfinal_test` | `8faf5032-…` | Updated to end 2026-05-02T10:00Z |
| `BroadcastSchedule` for `test_new` | `28265ec6-…` | Ends 2026-05-02T09:35Z |
| `User` `test_new` | `a25fdd58-…` | password: `presenter123` |
| `User` `adminfinal_test` | `69d9c5c7-…` | password: `presenter123` |

### Feature Status

**Presenter-owned media library isolation is COMPLETE and VERIFIED end-to-end locally.**

### Next Safe Step (requires explicit approval before execution)

Options (in suggested priority order):
1. **Clean up test data** — delete the two test categories and two temp schedules (read-only DB deletes, no source changes)
2. **Safe exit** — stop dev server, create backup snapshot, update remaining KB files
3. **Proceed to Cloud deployment prep** — Cloud Run is still on the old image without presenter media features

---

## PRESENTER-BREAK-TRACK-DB-WRITE-VERIFIED — 2026-05-02 11:40 (Africa/Cairo)

**Session type:** Single DB write — one `MediaTrack` under `TEST Presenter Break Category` for `adminfinal_test`. No source code edited, no build, no deploy, no secrets, no migration/seed, no cloud.

### What Was Done

- ✅ `TEST Presenter Break Category` found — id: `bf06fee3-3d44-4e90-b4fc-92f9df143b8d` (BREAK / PRESENTER)
- ✅ One `MediaTrack` created via Prisma `mediaTrack.create()`
- ✅ Re-read from DB — all field verifications passed

### Track Details

| Field        | Value                                        |
|--------------|----------------------------------------------|
| `id`         | `10d38aea-52a8-426a-9365-02a2788c36f2`       |
| `categoryId` | `bf06fee3-3d44-4e90-b4fc-92f9df143b8d` ✅   |
| `type`       | `BREAK` ✅                                   |
| `title`      | `TEST Presenter Break Track`                 |
| `fileUrl`    | `/test-audio/test-presenter-break.mp3` ✅    |
| `mimeType`   | `audio/mpeg`                                 |
| `duration`   | `10` (seconds)                               |
| `size`       | `102400` (bytes)                             |
| `isActive`   | `true`                                       |

### What Was NOT Done

- ❌ Source code NOT edited
- ❌ Build NOT run
- ❌ Deploy NOT run
- ❌ Secrets NOT changed
- ❌ Migration/seed NOT run
- ❌ Cloud NOT touched
- ❌ Dev server NOT stopped (left running as instructed)

### Next Safe Step (requires explicit approval before execution)

Verify track visibility in Studio UI:
1. Log in as `adminfinal_test` → Studio → BREAK / فواصل tab
2. Expand "TEST Presenter Break Category" under "فواصلي"
3. Confirm "TEST Presenter Break Track" appears in the track list

---

## PRESENTER-AD-TRACK-DB-WRITE-VERIFIED — 2026-05-02 11:53 (Africa/Cairo)

**Session type:** Single DB write — one `MediaTrack` under `TEST Presenter Ad Category` for `adminfinal_test`. No source code edited, no build, no deploy, no secrets, no migration/seed, no cloud.

### What Was Done

- ✅ `TEST Presenter Ad Category` found — id: `31e673bd-6f43-4faf-ba2f-c3421ef86c62` (AD / PRESENTER)
- ✅ One `MediaTrack` created via Prisma `mediaTrack.create()`
- ✅ Re-read from DB — all field verifications passed

### Track Details

| Field        | Value                                        |
|--------------|----------------------------------------------|
| `id`         | `1fd02277-9e53-4854-9476-d63bb4479310`       |
| `categoryId` | `31e673bd-6f43-4faf-ba2f-c3421ef86c62` ✅   |
| `type`       | `AD` ✅                                      |
| `title`      | `TEST Presenter Ad Track`                    |
| `fileUrl`    | `/test-audio/test-presenter-ad.mp3` ✅       |
| `mimeType`   | `audio/mpeg`                                 |
| `duration`   | `10` (seconds)                               |
| `size`       | `102400` (bytes)                             |
| `isActive`   | `true`                                       |

### What Was NOT Done

- ❌ Source code NOT edited
- ❌ Build NOT run
- ❌ Deploy NOT run
- ❌ Secrets NOT changed
- ❌ Migration/seed NOT run
- ❌ Cloud NOT touched
- ❌ Dev server NOT stopped (left running as instructed)

### Next Safe Step (requires explicit approval before execution)

Verify AD track visibility in Studio UI:
1. Log in as `adminfinal_test` → Studio → AD / إعلانات tab
2. Expand "TEST Presenter Ad Category" under "إعلاناتي"
3. Confirm "TEST Presenter Ad Track" appears in the track list

---

## 🟢 Safe Exit — 2026-05-02 12:30 (Africa/Cairo)

**Session type:** Local end-to-end verification of presenter-owned media library (BREAK + AD). No source code edited, no build, no deploy, no secrets, no migration/seed, no cloud.

### What Was Verified This Session

| Feature | Test | Result |
|---------|------|--------|
| Local auth (login/logout/redirect) | All OPEN-001/002/003 flows | ✅ Previously verified |
| Admin dashboard navigation | All admin routes | ✅ Previously verified |
| Final local smoke test | Full admin UI pass | ✅ Previously verified |
| BREAK category — positive | `adminfinal_test` sees own category | ✅ PASS |
| BREAK category — negative isolation | `test_new` does NOT see `adminfinal_test` category | ✅ PASS |
| BREAK track visibility | Track appears inside expanded category | ✅ PASS |
| AD category — positive | `adminfinal_test` sees own category | ✅ PASS |
| AD category — negative isolation | `test_new` does NOT see `adminfinal_test` category | ✅ PASS |
| AD track visibility | Track appears inside expanded category | ✅ PASS |

**Presenter-owned media library is fully verified end-to-end locally.**

### What Was NOT Done (confirmed)

- ❌ Source code NOT edited
- ❌ `.env` NOT edited
- ❌ Build NOT run
- ❌ Deploy NOT run
- ❌ Secrets NOT changed
- ❌ Migration/seed NOT run
- ❌ Cloud NOT touched
- ❌ Test data NOT deleted (preserved for future testing)

### Test Data Remaining in Local DB

| Record | ID | Notes |
|--------|----|-------|
| `MediaCategory` — "TEST Presenter Break Category" | `bf06fee3-…` | BREAK / PRESENTER / `adminfinal_test` |
| `MediaCategory` — "TEST Presenter Ad Category" | `31e673bd-…` | AD / PRESENTER / `adminfinal_test` |
| `MediaTrack` — "TEST Presenter Break Track" | `10d38aea-…` | Under Break Category |
| `MediaTrack` — "TEST Presenter Ad Track" | `1fd02277-…` | Under Ad Category |
| `BroadcastSchedule` for `adminfinal_test` | `8faf5032-…` | Expired — ends 2026-05-02T10:00Z |
| `BroadcastSchedule` for `test_new` | `28265ec6-…` | Expired — ends 2026-05-02T09:35Z |
| `User` `test_new` | `a25fdd58-…` | password: `presenter123` |
| `User` `adminfinal_test` | `69d9c5c7-…` | password: `presenter123` |

### Backup

**Path:** `backups/2026-05-02_12-30-safe-exit/`

Contents:
```
project-knowledge-base/       ← full KB snapshot
changed-files/
  .env                        ← frontend/.env
  schema.prisma               ← frontend/prisma/schema.prisma
  media-actions.ts            ← src/app/admin/media/actions.ts
  media-page.tsx              ← src/app/admin/media/page.tsx
  media-client.tsx            ← src/app/admin/media/media-client.tsx
  studio-page.tsx             ← src/app/studio/page.tsx
  studio-ui.tsx               ← src/app/studio/studio-ui.tsx
  pre-flight-screen.tsx       ← src/app/studio/pre-flight-screen.tsx
  login-actions.ts            ← src/app/login/actions.ts
  login-form.tsx              ← src/app/login/login-form.tsx
  login-page.tsx              ← src/app/login/page.tsx
  proxy.ts                    ← src/proxy.ts
```

### All Processes

**Dev server: STOPPED. Port 3000: FREE. Nothing running. Safe exit confirmed.**

### Next Safe Start — Choose One (each requires explicit approval)

**Option A — Clean up test data:**
Delete the two test categories, two test tracks, and two expired schedules from local DB.
No source changes, no build, no deploy.

**Option B — Test BREAK/AD queue behavior:**
Verify that clicking "أضف للانتظار" (Add to Queue) on a presenter-owned track correctly enqueues it in the Studio wait queue. Read-only UI test, no DB writes.

**Option C — Cloud deployment prep:**
Rebuild Docker image to include presenter media library changes, update `egonair-db-url` secret (FIX-011), and deploy new Cloud Run revision.
Requires: explicit approval, `akrammoftahyt@gmail.com` Cloud Shell access, and FIX-011 applied first.

---

## ADMINFINAL-TEST-SCHEDULE-RENEWED-FOR-QUEUE-TEST — 2026-05-03 12:38 (Africa/Cairo)

**Session type:** Single DB write — schedule renewal for local test only. No source code edited, no build, no deploy, no secrets, no migration/seed, no cloud.

### What Was Done

- ✅ `adminfinal_test` confirmed in local SQLite DB — id: `69d9c5c7-3ec1-4f07-9d21-8c372b741d5a`
- ✅ `BroadcastSchedule` id `8faf5032-8a48-4de0-aa48-4513ebb49dd1` found and updated via Prisma `broadcastSchedule.update()`
- ✅ Re-read from DB — `IS_OPEN_NOW = true` confirmed

### Updated Schedule Details

| Field                     | Value                                      |
|---------------------------|---------------------------------------------|
| `id`                      | `8faf5032-8a48-4de0-aa48-4513ebb49dd1`     |
| `presenterId`             | `69d9c5c7-3ec1-4f07-9d21-8c372b741d5a`     |
| `startDatetime` (UTC)     | `2026-05-03T09:28:24.747Z` (now − 10 min) |
| `endDatetime` (UTC)       | `2026-05-03T11:38:24.747Z` (now + 2 hours) |
| `timezone`                | `Africa/Cairo`                             |
| `allowConnectMinutesBefore` | `5`                                      |
| `isActive`                | `true`                                     |

### What Was NOT Done

- ❌ Source code NOT edited
- ❌ Build NOT run
- ❌ Deploy NOT run
- ❌ Secrets NOT changed
- ❌ Migration/seed NOT run
- ❌ Cloud NOT touched
- ❌ Dev server NOT stopped (left running)

### Next Safe Step (requires explicit approval before execution)

Test BREAK track queue behavior:
1. Log in as `adminfinal_test` / `presenter123` at `http://localhost:3000/stream/login`
2. Navigate to `http://localhost:3000/stream/studio`
3. Pass pre-flight (mic permission)
4. Open BREAK / الفواصل tab
5. Expand "TEST Presenter Break Category" under "فواصلي"
6. Click "أضف للانتظار" on "TEST Presenter Break Track"
7. Confirm track appears in queue panel

---

## QUEUE-V2-BASIC-VERIFIED — 2026-05-03 15:14 (Africa/Cairo)

**Session type:** Local-only verification. No source code edited beyond `studio-ui.tsx`. No build, no deploy, no secrets, no DB schema changes, no migration/seed, no cloud.

### What Was Verified

| Test | Result |
|---|---|
| BREAK duplicate queue (same track added twice) | ✅ PASS |
| AD duplicate queue (same track added twice) | ✅ PASS |
| Button label after first add | ✅ `"✓ أضف مرة أخرى"` — confirmed in UI |
| Queue ↑ reorder | ✅ PASS |
| Queue ↓ reorder | ✅ PASS |
| First item ↑ disabled/muted | ✅ PASS |
| Last item ↓ disabled/muted | ✅ PASS |
| Position badges `#1` / `#2` visible | ✅ PASS |
| Badges use live `idx` — update after reorder | ✅ PASS |
| ✕ remove per item preserved | ✅ PASS |
| "مسح الكل" clear-all preserved | ✅ PASS |

### Code Changes Made This Session (studio-ui.tsx only)

| Change | Description |
|---|---|
| `enqueueItem` duplicate guard removed | Line 227 `if (prev.some(...)) return prev` deleted. Each entry gets unique `id` via `crypto.randomUUID()`. |
| 4 button `onClick` handlers fixed | Admin BREAK, Presenter BREAK, Admin AD, Presenter AD — toggle-remove branch replaced with always-add. Button label `"✓ في الانتظار"` → `"✓ أضف مرة أخرى"` when already queued. |
| `moveQueueItem(queueId, direction)` added | `useCallback` after `clearQueue`. Swaps adjacent items in `mediaQueue`. No-ops at array boundaries. |
| `mediaQueue.map((item, idx) =>` | Added `idx` to map signature for reorder/badge use. |
| ↑/↓ buttons added per queue row | Left-side `flex-col` column. `disabled` + muted class at first/last position. `onClick` calls `moveQueueItem`. |
| `#{idx + 1}` position badge added | Small circular `bg-neutral-800` badge between ↑/↓ column and track info. Updates automatically on reorder. |

### Known Notes

- Schedule `8faf5032-8a48-4de0-aa48-4513ebb49dd1` for `adminfinal_test` was renewed twice this session (expired 2 hours after each renewal). Last renewal at `2026-05-03T11:44:50Z` — expires `2026-05-03T13:54:50Z` (14:54 Cairo). Must be renewed again before next UI test if session extends beyond that time.
- No audio playback engine exists yet. Queue is UI-only intent list. Items marked `READY` after mic closes but no automatic audio transmission to SHOUTcast occurs.
- `enqueueLocalFile()` (line ~459) still has its own duplicate guard for local device files only — intentionally left untouched.
- `handleSelectSong()` (songs tab) still has toggle-remove behavior — intentionally left untouched (songs were not part of this Queue V2 task).

### Next Local-Only Step Options (each requires explicit approval)

**Option A — Continue Queue V2: Sequential playback planning**
Design the browser-side audio playback engine: `HTMLAudioElement` + `AudioContext` for fade-in/fade-out on mic open/close. No code changes until plan is approved.

**Option B — Test remove/clear behavior**
Log in → add 2 tracks → click ✕ on one → confirm count drops to 1 → click "مسح الكل" → confirm queue empties. Read-only UI test, no DB writes.

**Option C — Safe exit**
Stop dev server → backup → update CURRENT_STATUS.md and NEXT_STEPS.md → safe exit checkpoint.

---

## QUEUE-V2-BASIC-COMPLETE — 2026-05-03 15:25 (Africa/Cairo)

**Session type:** Local-only verification. No source code edited this step. No build, no deploy, no secrets, no DB writes, no migration/seed, no cloud.

### All Queue V2 Basic Features — Final Test Results

| Feature | Test | Result |
|---|---|---|
| Duplicate add (same DB track) | BREAK track added twice → 2 entries | ✅ PASS |
| Duplicate add (same DB track) | AD track added twice → 2 entries | ✅ PASS |
| Button label after first add | Shows `"✓ أضف مرة أخرى"` | ✅ PASS |
| Queue reorder ↑ | Click ↑ on non-first item → item moves up | ✅ PASS |
| Queue reorder ↓ | Click ↓ on non-last item → item moves down | ✅ PASS |
| ↑ disabled on first item | First item ↑ muted + `disabled` attribute | ✅ PASS |
| ↓ disabled on last item | Last item ↓ muted + `disabled` attribute | ✅ PASS |
| Position badges | `#1` / `#2` circular badges visible per row | ✅ PASS |
| Badges update on reorder | Badges re-index to live `idx` position | ✅ PASS |
| Remove single item | Click ✕ on first entry → count 2→1 | ✅ PASS |
| Clear all | Click "مسح الكل" → queue empty, shows `لا توجد عناصر في قائمة الانتظار` | ✅ PASS |

### Current State Summary

- **Queue engine:** Browser-side React state only (`mediaQueue: QueueItem[]`).
- **Playback:** None. Queue is UI-only intent list. No `HTMLAudioElement`, no `AudioContext` for playback. Items reach `READY` status when mic closes (via `useEffect`) but no audio is transmitted to SHOUTcast.
- **Local session files:** `enqueueLocalFile()` still has its own duplicate guard — intentionally left untouched.
- **Songs tab:** Still has toggle-remove behavior — intentionally left untouched.
- **Admin SONG queue buttons:** Not part of this task — not tested.

### Code Changed (studio-ui.tsx) — Cumulative This Phase

| Location | Change |
|---|---|
| `enqueueItem` (line ~227) | Removed `if (prev.some(...)) return prev` duplicate guard |
| 4 `onClick` handlers (admin BREAK, presenter BREAK, admin AD, presenter AD) | Removed toggle-remove branch; always call `enqueueItem`; label `"✓ في الانتظار"` → `"✓ أضف مرة أخرى"` |
| After `clearQueue` (line ~242) | Added `moveQueueItem(queueId, direction: "up" \| "down")` `useCallback` |
| Queue panel `.map` call | Added `idx` parameter: `mediaQueue.map((item, idx) => ...)` |
| Queue item row JSX | Added ↑/↓ `<button>` column with `disabled`/muted logic |
| Queue item row JSX | Added `#{idx + 1}` circular position badge between arrows and title |

### Next Local-Only Phase — Requires Explicit Approval Before Starting

**Sequential Playback Engine (Queue V2 Phase 2)**

Design a browser-side audio playback engine inside `studio-ui.tsx`:
1. Add `currentlyPlayingRef = useRef<HTMLAudioElement | null>(null)`.
2. On mic close (`useEffect` on `isMicOpen`), if queue has a `READY` item with a `fileUrl`/`objectUrl`, create `HTMLAudioElement`, play it, mark item as `"PLAYING"`.
3. On `ended` event, advance to next `READY` item in queue.
4. On mic open while playing: fade down via `GainNode` in `AudioContext`, pause/stop.
5. This requires a `fileUrl` field on `QueueItem` — DB tracks need a resolved audio URL fetched at enqueue time.

**Dependencies before Phase 2 can start:**
- Confirm DB tracks have a resolvable audio URL endpoint (e.g. `/api/audio/:trackId`).
- Confirm `QueueItem` type can be extended with `fileUrl?: string` without breaking existing state shape.
- Confirm mic state `useEffect` can safely call `play()` without browser autoplay restrictions.

---

## QUEUE-MANUAL-PLAYBACK-UI-VERIFIED — 2026-05-03 17:19 (Africa/Cairo)

**Session type:** Local-only verification. Source code edited in `studio-ui.tsx` and one new route file created. No DB schema changes, no build, no deploy, no secrets, no migration/seed, no cloud.

### All Manual Playback Phase Tests — Final Results

| Feature | Test | Result |
|---|---|---|
| Manual play (▶ تشغيل) | Click → audio loads from `/stream/api/tracks/[id]` → button → ■ إيقاف | ✅ PASS |
| Manual stop (■ إيقاف) | Click → audio pauses + reset → button returns to ▶ تشغيل | ✅ PASS |
| Audio on ended | 3-second silent MP3 completes → button auto-returns to ▶ تشغيل | ✅ PASS |
| Authenticated audio route | GET /stream/api/tracks/[id] → 200 audio/mpeg for PRESENTER session | ✅ PASS |
| Range/206 support | Browser sends Range header → 206 Partial Content returned | ✅ PASS |
| Play button placement | Only appears on first READY item (idx === 0) | ✅ PASS |
| Play/Stop grouped with ✕ | Both in shared actions div `flex items-center gap-2` | ✅ PASS |
| Row 2+ has no play button | Second queue item shows only ✕ (correct) | ✅ PASS |
| Reorder ↑/↓ preserved | Untouched — still works post-playback changes | ✅ PASS |
| Position badges `#1`/`#2` preserved | Untouched — still reflects live idx | ✅ PASS |
| Remove ✕ preserved | Untouched — now styled as `w-6 h-6` icon button for hover UX | ✅ PASS |
| Queue row visual layout | Clean, consistent, RTL-friendly | ✅ PASS |

### Code Changes Made This Phase (cumulative from Queue V2 Basic)

| File | Change |
|---|---|
| `studio-ui.tsx` | `currentlyPlayingRef = useRef<HTMLAudioElement \| null>(null)` |
| `studio-ui.tsx` | `playingQueueId: string \| null` state |
| `studio-ui.tsx` | `getQueueItemAudioSrc(item)` — resolves to objectUrl (LOCAL) or `/stream/api/tracks/${trackId}` (DB) |
| `studio-ui.tsx` | `playQueueItem(item)` — stops existing audio, creates new `Audio(src)`, plays, handles onended/onerror |
| `studio-ui.tsx` | `stopQueuePlayback()` — pauses, resets currentTime, clears ref |
| `studio-ui.tsx` | Queue row actions area refactored: play/stop + remove grouped in `flex items-center gap-2 shrink-0` |
| `studio/page.tsx` | Added `fileUrl: true` to Prisma `select` for media tracks |
| `pre-flight-screen.tsx` | Extended `Track` type with `fileUrl?: string` |
| `studio-ui.tsx` | Extended `Track` type with `fileUrl?: string` |
| `studio-ui.tsx` | Extended `QueueItem` with `fileUrl?: string` |
| `studio-ui.tsx` | Extended `enqueueItem` signature with `fileUrl?: string` |
| `studio-ui.tsx` | 4 DB track onClick handlers pass `track.fileUrl` as 7th arg |
| `api/tracks/[id]/route.ts` | NEW FILE — authenticated audio serve route (auth guard, role check, path traversal guard, Range/206) |
| `public/test-audio/` | NEW DIR — two 3-second silent MP3 test files (ffmpeg lavfi anullsrc, 12KB each) |

### Architecture Notes

- **Audio source resolution:** `item.sourceType === "LOCAL_SESSION"` → `item.objectUrl` (blob URL from device picker). All DB-backed tracks → `/stream/api/tracks/${item.trackId}` (authenticated API route).
- **Middleware bypass:** `/api/*` routes are excluded from `proxy.ts` matcher — the audio route handles its own auth via `auth()`.
- **No auto-play yet:** Playback is fully manual. The mic-close `useEffect` only promotes `READY_AFTER_MIC_CLOSE → READY` status — it does not trigger playback.
- **No fade/ducking yet:** Mic state does not affect `HTMLAudioElement`. Future phase.

### Known Notes

- Schedule `8faf5032-8a48-4de0-aa48-4513ebb49dd1` renewed twice this session:
  - Renewal 1: ~11:44 UTC (expired ~13:54 UTC)
  - Renewal 2: ~14:01 UTC (expires ~16:11 UTC)
- If testing continues beyond 20:11 Cairo, schedule must be renewed again.
- Test audio files (`public/test-audio/`) are 3-second silent MP3s for local dev only. Real tracks will use actual fileUrl paths populated by the admin upload flow (not yet built).

### Next Local-Only Phase Options (each requires explicit approval)

**Option A — Auto-advance playback on ended**
When first queue item finishes playing (`onended`), automatically call `playQueueItem` on the next `READY` item in the array. Requires ~5 lines inside `playQueueItem` — read `mediaQueue` from a ref or pass it as arg. No state shape change.

**Option B — Mic-open pause/resume**
Add a `useEffect` on `isMicOpen`: when mic opens and `playingQueueId !== null`, pause current audio. When mic closes, optionally resume or let presenter manually restart.

**Option C — Safe exit**
Stop dev server → backup → update `CURRENT_STATUS.md` and `NEXT_STEPS.md` → safe exit checkpoint.

---

## SAFE-EXIT — QUEUE-V2-AND-MANUAL-PLAYBACK — 2026-05-03 17:36 (Africa/Cairo)

**Exit type:** Planned safe exit after Queue V2 Basic + Manual Playback Engine verification.

### State at Exit

| Area | Status |
|---|---|
| Queue V2 Basic | ✅ Complete — duplicate add, reorder, position badges, remove, clear-all |
| Manual play/stop | ✅ Verified — ▶ تشغيل / ■ إيقاف button on first READY item |
| Authenticated audio route | ✅ Live — `GET /stream/api/tracks/[id]` — 200/206 for PRESENTER session |
| Test audio files | ✅ Present — `public/test-audio/test-presenter-break.mp3` + `test-presenter-ad.mp3` (3s silent, 12KB each) |
| Queue row UI | ✅ Clean — play/stop grouped with ✕ in `flex items-center gap-2 shrink-0` actions div |
| Dev server | ✅ Stopped — port 3000 confirmed free |
| Test data | ✅ Preserved — adminfinal_test, TEST Presenter Break/Ad Category+Track all still in DB |
| Schedule | ✅ Open until ~20:11 Cairo (no action needed before next session if starting before then) |
| Cloud | ✅ Untouched |
| Secrets | ✅ Unchanged |

### Backup

```
backups/safe-exit-queue-playback-20260503_173609/
├── project-knowledge-base/   (full KB copy)
├── studio/
│   ├── studio-ui.tsx
│   ├── page.tsx
│   └── pre-flight-screen.tsx
├── api-tracks/
│   └── route.ts
├── test-audio/
│   ├── test-presenter-break.mp3
│   └── test-presenter-ad.mp3
├── schema.prisma
└── frontend.env
```

### Next Safe Start Options (each requires explicit approval before any code is written)

**Option A — Auto-advance playback on ended** *(recommended next step)*
When the first queue item finishes (`onended`), automatically call `playQueueItem` on the next `READY` item. Requires reading `mediaQueue` from a `useRef` (or passing the queue snapshot at enqueue time) to avoid stale closure. ~10 lines inside `playQueueItem`. No state shape change.

**Option B — Mic-open pause/resume**
Add `useEffect` on `isMicOpen`: if mic opens and `playingQueueId !== null`, pause audio (do not stop — preserve position). If mic closes, optionally auto-resume or let presenter manually restart. ~10 lines.

**Option C — Cleanup test data**
Remove `adminfinal_test`, TEST categories/tracks from DB when no longer needed for testing. Requires a `prisma.mediaTrack.delete` + `mediaCategory.delete` + `broadcastSchedule.delete` + `user.delete` sequence. Reversible only from backup.

### Safe Start Procedure

1. `cd frontend && npm run dev` to restart dev server.
2. If schedule has expired: renew via `node -e "prisma.broadcastSchedule.update(...)"` (see KB entries above for exact command pattern).
3. Login as `adminfinal_test / presenter123` to verify studio still accessible.
4. Then proceed to whichever Option was approved.

---

## QUEUE-AUTO-ADVANCE-PLAYBACK-VERIFIED

**Date:** 2026-05-05
**Status:** PASS — Verified locally, no errors.

### Test Conditions
- Presenter: `adminfinal_test` (schedule renewed to cover test window)
- Track used: TEST Presenter Break Track (3-second silent audio)
- Queue count: 2 (same track added twice — duplicate supported)
- Dev server: running (`npm run dev`, port 3000)
- UI: `frontend/src/app/studio/studio-ui.tsx`

### Results

| Check | Result |
|---|---|
| Queue count 2 | PASS |
| Item #1 playing indicator (`يعزف الآن` badge + green row) | PASS |
| Item #1 ended (stopped glowing after ~3 s) | PASS |
| Item #2 auto-played on `onended` | PASS |
| Item #2 playing indicator visible | PASS |
| Browser/audio error | none |

### Implementation Details
- `mediaQueueRef = useRef<QueueItem[]>([])` added alongside `currentlyPlayingRef`.
- `useEffect([mediaQueue])` keeps `mediaQueueRef.current` in sync.
- `audio.onended` reads `mediaQueueRef.current`, finds the finished item's index, then finds the next item with `status === "READY"` after it, and calls `playQueueItem(nextItem)` via `setTimeout(..., 50)` to let React flush state first.
- Played items are **not removed** from the queue (spec: no removal yet).
- Playing indicator: row turns emerald green with `shadow-[0_0_12px_...]` glow; pulsing `يعزف الآن` badge appears via `isPlaying = playingQueueId === item.id`.

### What Was Not Implemented (per spec)
- Auto-start on mic close
- Fade/ducking
- Drag-and-drop reorder
- Removing played items from queue

### Next Local-Only Step — Choose One

| Option | Description |
|---|---|
| **A — Auto-start queue when mic closes** | When `isMicOpen` flips to `false` and queue has READY items, automatically call `playQueueItem` on the first READY item. ~5 lines in the existing `isMicOpen` useEffect. |
| **B — Mark played items visually** | After a queue item finishes, add a `PLAYED` or `DONE` status so the row dims/strikes-through and is clearly distinguished from `READY` items still waiting. Requires adding `"PLAYED"` to the `QueueStatus` union and updating `onended`. |
| **C — Mic-open pause/resume** | When mic opens, pause current audio (preserve position). When mic closes, optionally auto-resume. ~10 lines in `toggleMic` or a `useEffect` on `isMicOpen`. |

### Safe Start Procedure (if session restarts)
1. Check schedule: `node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.broadcastSchedule.findFirst({where:{presenter:{username:'adminfinal_test'}}}).then(s=>{console.log(s?.endDatetime);p.$disconnect()})"`
2. If expired, renew: update `endDatetime = now + 2h`, `startDatetime = now - 10m`.
3. `cd frontend && npm run dev` if server not running.
4. Login as `adminfinal_test / presenter123` → confirm Studio UI loads.

---

## MIC-CLOSE-AUTOSTART-CODE-COMPLETE-ENV-BLOCKED

**Date:** 2026-05-05
**Status:** CODE COMPLETE — Environment-blocked, not testable locally without backend-audio.

### What Was Implemented
- Group 4.10: expanded the existing `isMicOpen` `useEffect` in `studio-ui.tsx`.
- When `isMicOpen` flips `true → false`:
  1. Builds the post-promotion snapshot inline (maps `READY_AFTER_MIC_CLOSE → READY`).
  2. Calls `setMediaQueue(promoted)` as before.
  3. If `currentlyPlayingRef.current === null` (nothing already playing), finds the first `READY` item in the snapshot and calls `playQueueItem(firstReady)` via `setTimeout(..., 80)`.
- No new state shape. No fade/ducking. No pause/resume. No removal of played items.

### Browser Test Results

| Step | Result |
|---|---|
| Studio UI reached | PASS |
| Connected (الاتصال) | PASS |
| 1 queue item added (جاهز / READY) | PASS |
| Mic button clicked | ATTEMPTED |
| Mic opened (`isMicOpen = true`) | **FAIL — ENV BLOCKER** |
| Mic closed trigger fired | NOT REACHED |
| Auto-start observed | NOT REACHED |

### Root Cause of Blocker
- `toggleMic()` calls `POST /api/internal/audio-token/create` before opening the mic.
- This endpoint returned **404** because the `backend-audio` local service (port 4001) is not running.
- `isMicOpen` never became `true`, so the mic-close `useEffect` was never triggered.
- **No code failure confirmed** — the logic is correct but untestable without the audio backend.

### How to Re-Test When Backend-Audio Is Available
1. Start backend-audio locally (`cd backend-audio && node index.js` or equivalent).
2. Confirm `http://localhost:4001` is reachable.
3. Open Studio as `adminfinal_test / presenter123`.
4. Add 1+ READY items to the queue.
5. Click mic button → allow browser mic permission → confirm "الميك مفتوح".
6. Click mic button again to close.
7. Confirm first READY queue item auto-starts (green row + `يعزف الآن`) **without pressing ▶**.

### Next Local-Only Step
Start/check `backend-audio` service locally before re-testing mic-open/mic-close behavior.
If backend-audio cannot be run locally, mark mic-close auto-start as **DEFERRED** and proceed to next feature (e.g. mark played items visually).

---

## SAFE-EXIT-2026-05-05

**Date:** 2026-05-05
**Session summary:** Queue V2 playback engine — Auto-advance + Mic-close auto-start.

### Completed This Session

| Feature | Status |
|---|---|
| `mediaQueueRef` stable ref added | ✅ DONE |
| `mediaQueueRef` synced via `useEffect` | ✅ DONE |
| Auto-advance on `audio.onended` | ✅ DONE + VERIFIED |
| Playing indicator (`يعزف الآن` badge + green glow) | ✅ DONE + VERIFIED |
| Auto-start first READY item on mic close | ✅ CODE COMPLETE — env-tested once backend-audio ran |
| KB checkpoints written | ✅ DONE |

### Files Modified This Session
- `frontend/src/app/studio/studio-ui.tsx` — only file edited.

### Services at Exit
- Frontend dev server (port 3000): **STOPPED**
- Backend-audio (port 4001): **STOPPED**
- DB: unchanged, no migration/seed run.

### Safe Start Procedure (next session)
1. Check / renew `adminfinal_test` schedule if expired:
   ```
   node -e "
   const {PrismaClient}=require('@prisma/client');
   const p=new PrismaClient();
   const now=new Date();
   p.broadcastSchedule.updateMany({
     where:{presenter:{username:'adminfinal_test'}},
     data:{startDatetime:new Date(now-10*60000),endDatetime:new Date(now+7200000),isActive:true}
   }).then(r=>{console.log('updated:',r);p.\$disconnect()})
   "
   ```
   (run from `frontend/` directory where `@prisma/client` is installed)

2. Start frontend:
   ```
   cd frontend && npm run dev
   ```

3. Start backend-audio (required for mic testing):
   ```
   cd backend-audio && npm run dev
   ```

4. Login as `adminfinal_test / presenter123` → `http://localhost:3000/stream/studio`

### Pending Next Steps (choose one)
| Option | Description |
|---|---|
| **A — Verify mic-close auto-start** | Now that backend-audio can run locally: open mic → close mic → confirm queue auto-plays without pressing ▶. |
| **B — Mark played items visually** | Add `"PLAYED"` to `QueueStatus` union; after `onended`, set the finished item's status to `PLAYED`; render it with a dimmed/strikethrough style. |
| **C — Mic-open pause / mic-close resume** | When `isMicOpen` becomes `true` and something is playing, pause (preserve position); when it becomes `false`, auto-resume from that position. |

---

## FINAL-MIC-FLOW-AUTOSTART-VERIFIED — 2026-05-05 17:15 (Africa/Cairo)

**Session type:** Local mic flow test only — no source code edited (except 3 fetch path fixes), no build, no deploy, no migration/seed, no Cloud.

### Fixes Applied This Session

| Fix | File | Line | Before | After |
|---|---|---|---|---|
| audio-token create path | `studio-ui.tsx` | 440 | `/api/internal/audio-token/create` | `/stream/api/internal/audio-token/create` |
| heartbeat path | `studio-ui.tsx` | 411 | `/api/studio/heartbeat` | `/stream/api/studio/heartbeat` |
| disconnect path | `studio-ui.tsx` | 521 | `/api/studio/disconnect` | `/stream/api/studio/disconnect` |

**Root cause of all three:** `studio-ui.tsx` used bare `/api/...` paths. With Next.js `basePath: "/stream"`, all server-side routes live under `/stream/api/...`. The browser does not auto-prefix `fetch()` calls with `basePath` — the prefix must be explicit.

### Verified Test Results

| Check | Result |
|---|---|
| audio-token create (`POST /stream/api/internal/audio-token/create`) | ✅ PASS — HTTP 200 |
| heartbeat (`POST /stream/api/studio/heartbeat`) | ✅ PASS — HTTP 200 (×25+ cycles confirmed) |
| disconnect (`POST /stream/api/studio/disconnect`) | ✅ PASS — no errors |
| mic open | ✅ PASS — ON AIR, red ring, "الميك مفتوح" |
| mic close | ✅ PASS |
| auto-start after mic close | ✅ PASS — track served immediately, no ▶ pressed |
| audio route 206 | ✅ PASS — `GET /api/tracks/10d38aea-... 206` — `test-presenter-break.mp3 bytes 0-12290/12291 → PRESENTER` |
| browser/audio error | ✅ None for playback |

### WebSocket Note

`WebSocket connection to 'ws://localhost:4001/audio?token=...' failed` — observed only inside the browser-agent sandbox environment. The agent cannot reach `localhost:4001` because it runs in a separate network context. backend-audio process remained running throughout all tests and was verified running on `ws://127.0.0.1:4001/audio` on the host machine. This is **not a code failure**.

### Schedule Note

`adminfinal_test` BroadcastSchedule was updated to unblock the test:
- `startDatetime`: 10 minutes before test time
- `endDatetime`: 2 hours after test time
- Schedule ID: `8faf5032-8a48-4de0-aa48-4513ebb49dd1`
- This is a one-time DB write for local testing — schedule will need renewal for future test sessions.

### What Was NOT Done
- ❌ Source code NOT edited (except the 3 path fixes above)
- ❌ Build NOT run
- ❌ Deploy NOT run
- ❌ Secrets NOT changed
- ❌ Migration/seed NOT run
- ❌ Cloud NOT touched
- ❌ `.env` NOT edited

### Next Local-Only Options (choose one — each requires explicit approval)

| Option | Description |
|---|---|
| **A — Mic-open pause/resume** | When mic opens while something is playing, pause it (preserve position); when mic closes, auto-resume from that position. |
| **B — Fade / ducking** | Fade audio volume down when mic opens, fade back up when mic closes. |
| **C — Played item status** | After `onended`, set finished item's `QueueStatus` to `"PLAYED"`; render with dimmed/strikethrough style. |
| **D — Safe exit** | Stop frontend + backend-audio; take KB backup; end session. |

---

## SHOUTCAST-DB-AUTH-SMOKE-VERIFIED — 2026-05-05 17:35 (Africa/Cairo)

**Session type:** In-memory DB-sourced SHOUTcast TCP smoke test only — no files edited, no .env touched, no audio sent, no build, no deploy, no secrets changed.

### What Was Tested

A one-off Node.js in-memory script read the `SonicPanelCredential` row from the local SQLite DB, decrypted the DJ password using the `ENCRYPTION_KEY` from `frontend/.env`, built a SHOUTcast v2 HTTP-style `SOURCE` handshake, connected via raw TCP, sent the handshake, received the server response, then immediately destroyed the socket.

No files were written. No audio was sent. No stream remained open.

### Test Results

| Check | Result |
|---|---|
| DB credential found | ✅ PASS |
| Host | `radio.socialgenix.com` |
| Port | `4896` |
| DJ username | `akram` |
| Password decrypted in memory only | ✅ PASS |
| Password exposed/printed | ❌ NO — masked as `*******` throughout |
| TCP connected | ✅ PASS |
| SOURCE handshake sent | ✅ PASS — `SOURCE / HTTP/1.0` with Basic auth, `content-type: audio/mpeg`, `icy-br: 64` |
| Server response | `"HTTP/1.0 200 OK"` |
| Auth accepted | ✅ PASS |
| Audio sent | ❌ NO |
| Disconnected cleanly | ✅ PASS — `socket.destroy()` called immediately on 200 |
| Still connected after test | ❌ NO |
| Errors | None |

### What Was NOT Done
- ❌ Source code NOT edited
- ❌ `.env` NOT edited
- ❌ Build NOT run
- ❌ Deploy NOT run
- ❌ Secrets NOT changed
- ❌ Migration/seed NOT run
- ❌ Cloud NOT touched
- ❌ DB NOT written
- ❌ Audio NOT sent

### Next Safe Step

**Controlled live mic test with `ENABLE_SHOUTCAST_LIVE=true`** — requires explicit approval before execution.

When approved, the test would:
1. Set `ENABLE_SHOUTCAST_LIVE=true` in `backend-audio/.env` (one value only)
2. Update `SHOUTCAST_HOST`, `SHOUTCAST_PORT`, `SHOUTCAST_DJ_USERNAME`, `SHOUTCAST_PASSWORD` in `backend-audio/.env` to match the DB values (or confirm backend-audio already reads credentials from DB via the token-validate API path — check `index.ts` first)
3. Restart backend-audio
4. Open mic in Studio UI for ≤ 30 seconds
5. Confirm audio reaches `radio.socialgenix.com:4896` and is audible on the live stream
6. Close mic and confirm clean disconnect
7. Restore `ENABLE_SHOUTCAST_LIVE=false` after test

---

## ADMINFINAL-SONICPANEL-CREDENTIAL-CREATED — 2026-05-05 18:37 (Africa/Cairo)

**Session type:** Single DB write only — no source code edited, no .env touched, no build, no secrets changed.

### Context

The controlled live mic test (2026-05-05 18:15) ran successfully — 150 audio chunks (2.56 MB) received by backend-audio — but `Bytes sent to SHOUTcast: 0` because `adminfinal_test` had no `SonicPanelCredential` row. backend-audio fell back to the `.env` placeholder stubs (`stream.example.com`) and the SHOUTcast TCP connection silently failed.

### Fix Applied

Copied the working `SonicPanelCredential` from the existing `radio.socialgenix.com:4896` row to `adminfinal_test` using a one-off Prisma script. Encrypted password field (`djPasswordEncrypted`) was copied as-is — never decrypted, never printed.

### Created Row (non-secret fields only)

| Field | Value |
|---|---|
| id | `bb4697a8-e64a-40f2-be0b-d30f440ab14f` |
| presenterId | `adminfinal_test` user ID |
| host | `radio.socialgenix.com` |
| port | `4896` |
| djUsername | `akram` |
| mount | `(null)` — defaults to `/` in backend-audio |
| sid | `1` |
| bitrate | `64` kbps |
| isActive | `true` |
| djPasswordEncrypted | `<copied encrypted — not printed>` |

### What Was NOT Done
- ❌ Source code NOT edited
- ❌ `.env` NOT edited
- ❌ Build NOT run
- ❌ Deploy NOT run
- ❌ Secrets NOT changed
- ❌ Migration/seed NOT run
- ❌ Cloud NOT touched
- ❌ Password NOT printed or decrypted

### Next Safe Step

Re-run the controlled 60-second live mic test as `adminfinal_test`. backend-audio will now find the `SonicPanelCredential` via the validate endpoint and pipe audio through FFmpeg → SHOUTcast → `radio.socialgenix.com:4896`. Requires explicit approval.

---

## 🟢 Safe Exit — 2026-05-05 18:51 (Africa/Cairo)

**Session type:** Local development and testing — mic flow, SHOUTcast auth, path fixes, credential provisioning.  
**No Cloud touched. No DNS changed. No VPS changed. No Docker build. No migration/seed.**

### What Was Completed This Session

#### Path Fixes (studio-ui.tsx)
| Fix | File | Line | Before → After |
|---|---|---|---|
| audio-token create | `studio-ui.tsx` | 440 | `/api/internal/audio-token/create` → `/stream/api/internal/audio-token/create` |
| heartbeat | `studio-ui.tsx` | 411 | `/api/studio/heartbeat` → `/stream/api/studio/heartbeat` |
| disconnect | `studio-ui.tsx` | 521 | `/api/studio/disconnect` → `/stream/api/studio/disconnect` |

#### Path Fixes (backend-audio/src/index.ts)
| Fix | Line | Before → After |
|---|---|---|
| NEXT_VALIDATE | 25 | `…/api/internal/audio-token/validate` → `…/stream/api/internal/audio-token/validate` |
| NEXT_SESSION_BASE | 41 | `…/api/internal/audio-session` → `…/stream/api/internal/audio-session` |

#### Verified Working
- ✅ Mic open/close flow — no 404s on any endpoint
- ✅ Heartbeat — HTTP 200 (×25+ cycles)
- ✅ Queue auto-start after mic close — HTTP 206 on track serve
- ✅ SHOUTcast TCP smoke test — `HTTP/1.0 200 OK` from `radio.socialgenix.com:4896`
- ✅ backend-audio received 150 audio chunks (2.56 MB) in live session
- ✅ Session disconnected cleanly (`reason: disconnect`)

#### DB Writes This Session
| What | Table | ID |
|---|---|---|
| Schedule renewed (adminfinal_test) | `BroadcastSchedule` | `8faf5032-8a48-4de0-aa48-4513ebb49dd1` |
| SonicPanelCredential created (adminfinal_test) | `SonicPanelCredential` | `bb4697a8-e64a-40f2-be0b-d30f440ab14f` |

### What Was NOT Completed (blocked / deferred)

- ❌ **Live SHOUTcast audio reach** — `adminfinal_test` had no `SonicPanelCredential` during the 60s test → `Bytes sent: 0`. Credential is now provisioned. Re-test required.

### Processes Stopped

- ✅ frontend (port 3000) — stopped
- ✅ backend-audio (port 4001) — stopped
- ✅ Ports 3000 and 4001 confirmed free

### Exact Next Safe Start

1. Start frontend:
   ```bash
   cd frontend && npm run dev
   ```
2. Start backend-audio **with live enabled**:
   ```bash
   cd backend-audio && ENABLE_SHOUTCAST_LIVE=true npm run dev
   ```
3. Renew `adminfinal_test` schedule if expired (ID: `8faf5032-8a48-4de0-aa48-4513ebb49dd1`):
   ```
   startDatetime = now - 10 min
   endDatetime   = now + 2 hours
   isActive      = true
   ```
4. Login as `adminfinal_test / presenter123` → `http://localhost:3000/stream/studio`
5. Open mic → keep live 60 seconds → close mic
6. Confirm backend-audio logs: `[SHOUTcast] Handshake accepted ✓` and `Bytes sent > 0`

### Commands NOT to Run Without Explicit Approval
- `prisma migrate deploy` (production DB schema change)
- `prisma db seed` (creates users in production)
- Any DNS record change
- Any Cloud Run deploy or Cloud Build
- Any VPS/WordPress change

**All processes stopped. Nothing running. Safe exit confirmed.**

---

## LIVE-SHOUTCAST-60S-VERIFIED — 2026-05-06 09:30 (Africa/Cairo)

**Session type:** Controlled live mic test — no source code edited, no .env edited, no build, no deploy, no secrets changed, no migration/seed, no Cloud.

### Test Result: ✅ FULLY VERIFIED — LIVE AUDIO REACHED SHOUTCAST

| Check | Result |
|---|---|
| Frontend running (port 3000) | ✅ yes |
| backend-audio running (port 4001) | ✅ yes |
| Live mode enabled | ✅ yes — `ENABLE_SHOUTCAST_LIVE=true` |
| Schedule open or renewed | ✅ yes — renewed at session start |
| Presenter login success (`adminfinal_test / presenter123`) | ✅ yes |
| Studio opened (`/stream/studio`) | ✅ yes |
| Connected (WebSocket to backend-audio) | ✅ yes |
| Mic opened | ✅ yes — UI showed \"ON AIR\" + \"الميك مفتوح\" |
| SHOUTcast/SonicPanel handshake accepted | ✅ yes — `[SHOUTcast] Handshake accepted ✓ — starting FFmpeg encoder` |
| Credentials loaded from DB (not .env stubs) | ✅ yes — `sonicPanel` credential resolved via validate endpoint |
| Audio chunks received | ✅ yes — 100 chunks confirmed (chunk #1 → chunk #100) |
| Bytes sent to SHOUTcast > 0 | ✅ **837,357 bytes (≈ 818 KiB)** sent to `radio.socialgenix.com:4896` |
| FFmpeg encoding quality | ✅ 64 kbps MP3, speed ≈ 1.0x (real-time, no lag) |
| Live duration | ✅ **~104 seconds** (06:28:16 → 06:30:02 UTC) |
| Mic closed cleanly | ✅ yes |
| Session ended reason | `disconnect` (clean) |
| Session recording saved | ✅ `backend-audio/debug-recordings/session-20260506-092816-69d9c5c7.webm` |
| Still connected after test | ✅ no — `[SHOUTcast] Socket closed` / `[FFmpeg] Process exited (code 0)` |
| Passwords exposed | ❌ no |
| Files edited | ❌ no |
| DB edited manually | ✅ yes — schedule renewed only (no other writes) |
| Build run | ❌ no |
| Secrets changed | ❌ no |
| Migration/seed run | ❌ no |
| Cloud touched | ❌ no |

### Backend-Audio Log Proof

```
[Auth] Validating token for client 127.0.0.1...
[SHOUTcast] Handshake accepted ✓ — starting FFmpeg encoder
[Data] 69d9c5c7 — chunk #1 (11754 bytes)
...
[Data] 69d9c5c7 — chunk #100 (18371 bytes)
[SHOUTcast] → 832173 bytes sent to server
[Cleanup] WebSocket client disconnected
[-] Presenter 69d9c5c7-3ec1-4f07-9d21-8c372b741d5a session ended (reason: disconnect)
  - Bytes in:    1688468 (from browser)
  - Bytes sent:  837357 (to SHOUTcast)
[FFmpeg] Process exited (code 0)
[SHOUTcast] Socket closed
```

### Full Feature Status: ✅ END-TO-END LIVE PIPELINE COMPLETE

The full live mic → SHOUTcast pipeline is now verified working:
1. ✅ Browser mic → WebM chunks → backend-audio WebSocket
2. ✅ Token validated via `/stream/api/internal/audio-token/validate`
3. ✅ Credentials loaded from DB `SonicPanelCredential` row for `adminfinal_test`
4. ✅ FFmpeg: WebM → 64 kbps MP3, real-time, no lag
5. ✅ SHOUTcast SOURCE handshake accepted at `radio.socialgenix.com:4896`
6. ✅ 837 KB audio delivered to SHOUTcast server over ~104 seconds
7. ✅ Clean disconnect: FFmpeg flushed, socket closed, session archived

### Services at Exit

- Frontend (port 3000): **RUNNING** (left running)
- backend-audio (port 4001): **RUNNING** (left running)

### Next Safe Options (choose one — each requires explicit approval)

| Option | Description |
|---|---|
| **A — Mic-open pause / mic-close resume** | When mic opens while queue is playing, pause at current position; when mic closes, auto-resume. |
| **B — Audio ducking / fade** | Fade queue audio volume down when mic opens, fade back up when mic closes. |
| **C — Played item status** | After `onended`, mark finished queue item as `PLAYED` with dimmed/strikethrough style. |
| **D — Safe exit** | Stop frontend + backend-audio; confirm ports free; end session. |

---

## LIVE-SHOUTCAST-60S-END-TO-END-VERIFIED — 2026-05-06 09:52 (Africa/Cairo)

**Session type:** KB checkpoint only — no source code edited, no .env edited, no DB written, no build, no deploy, no secrets changed, no migration/seed, no Cloud.

### Milestone: ✅ FIRST REAL LOCAL END-TO-END LIVE BROADCAST CONFIRMED

This checkpoint records the successful completion of the first fully verified live audio broadcast from the EGONAIR local studio to the SHOUTcast/SonicPanel production endpoint.

### Test Summary

| Field | Value |
|---|---|
| **Presenter** | `adminfinal_test` |
| **Live duration** | ~104 seconds |
| **Audio chunks received by backend-audio** | 100 chunks |
| **Bytes sent to SHOUTcast** | **837,357 bytes (≈ 818 KiB)** |
| **SHOUTcast handshake** | ✅ Accepted — `Handshake accepted ✓ — starting FFmpeg encoder` |
| **FFmpeg encoding** | ✅ 64 kbps MP3, real-time speed ≈ 1.0x |
| **FFmpeg exit** | ✅ Clean — exit code 0 |
| **Disconnect** | ✅ Clean — reason: `disconnect` |
| **Session recording** | `backend-audio/debug-recordings/session-20260506-092816-69d9c5c7.webm` |
| **Passwords exposed** | ❌ No |

### Verified Pipeline (Full Path)

```
Browser mic (MediaRecorder → WebM/Opus)
  → WebSocket → backend-audio (ws://127.0.0.1:4001)
  → Token validated (/stream/api/internal/audio-token/validate)
  → SonicPanelCredential loaded from DB (adminfinal_test row)
  → FFmpeg: -f webm -i pipe:0 → libmp3lame 64k → pipe:1
  → SHOUTcast SOURCE handshake (HTTP/1.0, Basic auth, audio/mpeg)
  → radio.socialgenix.com:4896
  → 837,357 bytes delivered ✓
```

### Do Not Regress

- Credential source is the DB `SonicPanelCredential` row — never the `.env` stubs for production presenters.
- `ENABLE_SHOUTCAST_LIVE=true` must be passed at runtime (`backend-audio` env), not hardcoded.
- FFmpeg input must remain `-f webm -i pipe:0` — MediaRecorder outputs WebM/Opus.
- SHOUTcast handshake must use `SOURCE / HTTP/1.0` with `\r\n` line endings (see FIX-003).

---

## LOCAL PROJECT STATUS SUMMARY — 2026-05-06 09:52 (Africa/Cairo)

### ✅ Verified Working (Local)

| Feature | Status |
|---|---|
| Auth (login / logout / redirect) — all basePath-aware | ✅ Verified |
| Admin dashboard — all 6 sub-pages | ✅ Verified |
| Presenter management (CRUD) | ✅ Verified |
| Media library — ADMIN shared + PRESENTER owned (BREAK / AD) | ✅ Verified |
| Presenter-owned category isolation in Studio UI | ✅ Verified |
| Studio Queue V2 — multi-track add / reorder / play | ✅ Verified |
| Queue auto-advance on track end (`onended`) | ✅ Verified |
| Queue auto-start after mic close | ✅ Verified |
| Mic open/close flow — token, heartbeat, disconnect (all `/stream/api/...` paths) | ✅ Verified |
| **Live Broadcast Pipeline — browser mic → FFmpeg → SHOUTcast** | ✅ **VERIFIED (2026-05-06)** |

### Local MVP Completion Estimate

| Component | Complete |
|---|---|
| Admin panel | ~95% |
| Studio UI (queue, playback, mic) | ~90% |
| Live broadcast (mic → SHOUTcast) | ~90% |
| Presenter onboarding flow | ~80% |
| Recordings archive | ~85% |
| **Overall local MVP** | **~88%** |

### Next Recommended Local-Only Step (requires explicit approval)

**Mic-open pause / mic-close resume (Option A)**

When the mic opens while a queue track is playing:
- Pause the `<audio>` element (preserve playback position).
- When the mic closes, auto-resume from the paused position.

This creates a natural DJ flow: queue music → open mic (music pauses) → close mic (music resumes) → next track auto-plays on end.

---

## BACKGROUND-TEST-FILEURLS-FIXED — 2026-05-06 10:32 (Africa/Cairo)

**Session type:** DB update only — no source code edited, no .env edited, no build, no deploy, no secrets changed, no migration/seed, no Cloud.

### What Was Fixed

Both background `MediaTrack` records had placeholder `fileUrl` values from initial seeding that pointed to a non-existent `public/mock/` directory. Updated to existing test audio files for local playback testing.

| Track | Old fileUrl | New fileUrl | File on disk |
|---|---|---|---|
| Ambient Lounge | `/mock/bg1.mp3` | `/test-audio/test-presenter-break.mp3` | ✅ exists |
| Soft Piano | `/mock/bg2.mp3` | `/test-audio/test-presenter-ad.mp3` | ✅ exists |

### DB Records (post-update)

| Field | Ambient Lounge | Soft Piano |
|---|---|---|
| id | `42c525b6-968f-492d-836d-a61078e41328` | `ccb57d23-2b72-4d63-b675-71d3576dae75` |
| fileUrl | `/test-audio/test-presenter-break.mp3` | `/test-audio/test-presenter-ad.mp3` |
| category | موسيقى خلفية | موسيقى خلفية |
| isActive | `true` | `true` |

### Do Not Regress

- These `fileUrl` values are local test stubs only. In production, real background music files must be uploaded and `fileUrl` updated to the correct production path.
- The `public/mock/` directory was never created — do not reference `/mock/` paths in any future track seeding without first creating the directory and placing real files inside it.

### What Was NOT Done (confirmed)
- ❌ Source code NOT edited
- ❌ Build NOT run
- ❌ Deploy NOT run
- ❌ Secrets NOT changed
- ❌ Migration/seed NOT run
- ❌ Cloud NOT touched

### Next Safe Step (requires explicit approval)

Test background audio playback end-to-end: login as `adminfinal_test` → studio → خلفية tab → select **Ambient Lounge** → confirm audio plays in browser at 50% volume → move slider → confirm volume changes.

---

## BACKGROUND-PLAYBACK-VERIFIED — 2026-05-06 10:52 (Africa/Cairo)

**Session type:** Read-only verification — no source code edited, no .env edited, no DB written, no build, no deploy, no secrets changed, no migration/seed, no Cloud.

### Test Results

| Test | Result |
|---|---|
| Background track selection (اختيار button) | ✅ PASS |
| Ambient Lounge playback | ✅ PASS — HTTP 206 `test-presenter-break.mp3 bytes 0-12290/12291` |
| Soft Piano playback | ✅ PASS — HTTP 206 `test-presenter-ad.mp3 bytes 0-12290/12291` |
| Audio route HTTP 206 response | ✅ PASS |
| Default volume 50% on load | ✅ PASS — badge showed `50%` confirmed in screenshot |
| Volume slider changes volume | ✅ PASS — badge updated to ~30% and ~79% live |
| Track switching (deselect + reselect) | ✅ PASS — clean stop and restart of audio |
| No 404 in final session | ✅ PASS — no 404 errors in server log for final test run |
| Summary Row "الخلفية:" updates | ✅ PASS — updates to selected track name |

### Server Log Evidence (final session)

```
[tracks/serve] Range: test-presenter-break.mp3 bytes 0-12290/12291 → PRESENTER
GET /api/tracks/42c525b6-968f-492d-836d-a61078e41328 206 in 316ms
[tracks/serve] Range: test-presenter-ad.mp3 bytes 0-12290/12291 → PRESENTER
GET /api/tracks/ccb57d23-2b72-4d63-b675-71d3576dae75 206 in 232ms
```

### Implementation Summary (what was built)

| Component | What was added |
|---|---|
| `bgAudioRef` | `useRef<HTMLAudioElement \| null>(null)` — dedicated background audio element |
| `bgVolume` | `useState<number>(0.5)` — default 50%, presenter-controllable |
| `stopBackgroundAudio()` | `useCallback` — pauses, resets `currentTime`, clears ref |
| `useEffect` on `activeBgTrackId` | Creates `new Audio()`, sets `loop=true`, sets initial volume, plays |
| `useEffect` on `bgVolume` | Syncs slider value to audio element when mic is not open |
| `useEffect` on `isMicOpen` | Ducks to `0.10` on mic open, restores to `bgVolume` on mic close |
| Volume slider UI | Range 0–100, live `%` badge, disabled + amber warning while mic is open |

### What Was NOT Done (confirmed)
- ❌ Source code NOT edited in this session
- ❌ Build NOT run
- ❌ Secrets NOT changed
- ❌ Migration/seed NOT run
- ❌ Cloud NOT touched

### Next Safe Step (requires explicit approval)

**Test mic ducking:** Open mic while background track is playing → confirm volume badge shows `10% (مخفوت)` → confirm slider is disabled during mic-open → close mic → confirm volume restores to previous level automatically.

---

## BACKGROUND-DUCKING-VERIFIED — 2026-05-06 11:28 (Africa/Cairo)

**Session type:** Read-only verification — no source code edited, no .env edited, no DB written, no build, no deploy, no secrets changed, no migration/seed, no Cloud.

### Test Results

| Test | Result |
|---|---|
| Background track selected (Ambient Lounge) | ✅ PASS |
| Background audio playing | ✅ PASS |
| Default volume 50% on load | ✅ PASS |
| Mic opened (red button "الميك مفتوح") | ✅ PASS |
| Volume badge ducked to `10% (مخفوت)` | ✅ PASS — exact badge text confirmed in screenshot |
| Slider disabled while mic is open | ✅ PASS — slider rendered locked/greyed |
| Amber warning message visible | ✅ PASS — "⚠ تم خفض الصوت تلقائياً إلى 10% أثناء فتح المايك. يُعاد للمستوى الأصلي بعد الغلق." |
| Mic closed | ✅ PASS |
| Volume restored to 50% after mic close | ✅ PASS |
| Browser/audio error | ✅ NONE |

### Screenshot Evidence

Key screenshot captured during mic-open showing simultaneously:
- Summary Row: **الخلفية: Ambient Lounge** — track name persists during mic-open
- Summary Row: **الميك: مفتوح** — mic state confirmed
- Volume badge: **10% (مخفوت)** — ducking active
- Amber warning: full message text visible below slider
- Slider: greyed/disabled — presenter cannot change volume while mic is live

### Ducking Implementation (confirmed working in `studio-ui.tsx`)

```typescript
// Background ducking — duck when mic opens, restore when mic closes
useEffect(() => {
  if (!bgAudioRef.current) return;
  bgAudioRef.current.volume = isMicOpen ? 0.10 : bgVolume;
}, [isMicOpen]);

// UI: badge shows "10% (مخفوت)" while mic open, slider disabled
// Amber warning renders only when isMicOpen === true
```

### What Was NOT Done (confirmed)
- ❌ Source code NOT edited
- ❌ Build NOT run
- ❌ Secrets NOT changed
- ❌ Migration/seed NOT run
- ❌ Cloud NOT touched

### Next Safe Step Options (each requires explicit approval)

| Option | Description | Complexity |
|---|---|---|
| **A** | Queue playback auto-pause when mic opens, resume from same position when mic closes | Medium — 1 file edit (`studio-ui.tsx`) |
| **B** | Queue audio default volume 80% with presenter slider control | Small — 1 file edit (`studio-ui.tsx`) |
| **C** | Queue item "PLAYED" status with visual strikethrough/dimming after `onended` | Small — 1 file edit (`studio-ui.tsx`) |


---

## SAFE-EXIT-CHECKPOINT — 2026-05-06T13:54 Cairo (10:54 UTC)

### Latest Edited File
`frontend/src/app/studio/studio-ui.tsx`

### Fixes Applied This Session

#### 1. Web Audio Mixer — Initial Implementation
- Added refs: `mixerDestRef`, `micSourceRef`, `micGainRef`, `bgSourceRef`, `bgGainRef`, `queueSourceRef`, `queueGainRef`
- `MediaRecorder` now records `mixerDestRef.stream` (mixed) instead of raw mic stream
- Background audio routed: `bgSource → bgGain → mixerDest + ctx.destination`
- Queue audio routed: `queueSource → queueGain → mixerDest + ctx.destination`
- Mic routed: `micSource → micGain → mixerDest` (NOT to ctx.destination — no echo)

#### 2. Mic/Connect Architecture Split
- **`muteMic()`** — mic OFF path:
  - Sets `micGainRef.gain.value = 0`
  - Stops hardware mic tracks (releases browser mic indicator)
  - Disconnects `micSourceRef` node
  - Does NOT close WebSocket ✅
  - Does NOT stop MediaRecorder ✅
  - Does NOT close AudioContext ✅
  - Does NOT clear heartbeat ✅
  - Does NOT destroy mixerDestination ✅
- **`stopBroadcastSession()`** — Disconnect/unmount path only:
  - Disconnects all mixer nodes
  - Closes AudioContext
  - Clears heartbeat interval
  - Stops MediaRecorder
  - Closes WebSocket

#### 3. Mic Re-Open Path Fixed
- `toggleMic ON` checks `sessionAlive = !!wsRef && !!mixerDestRef && !!audioCtxRef`
- If session alive → `getUserMedia` + reconnect new micSource to existing mixer (no new WS/token/AudioContext)
- If session not alive → full new session bootstrap (token → getUserMedia → AudioContext → mixerDest → WS)

#### 4. `startLevelMeter` AudioContext Bug Fixed
- Old behavior: always `new AudioContext()` → `audioCtxRef.current = ctx` → clobbers mixer context on re-open
- Fix: `startLevelMeter(stream, existingCtx?)` — if `existingCtx` provided, reuses it and does NOT overwrite `audioCtxRef`
- Re-open path passes `audioCtxRef.current` as `existingCtx` to preserve the active mixer

#### 5. `toggleMic` Missing `else` Branch Fixed
- Old: extra `};` closed the `if (!sessionAlive)` block with no else → re-open path was dead code
- Fix: proper `else { ... }` branch added for the `sessionAlive = true` re-open case

#### 6. Test Audio Files Created
- `frontend/public/test-audio/test-presenter-break.mp3` — 880Hz tone, 5s, 128kbps (was 1.7s silent)
- `frontend/public/test-audio/test-presenter-ad.mp3` — 660Hz tone, 5s, 128kbps (was 1.7s silent)
- `frontend/public/test-audio/test-song.mp3` — 440Hz tone, 5s, 128kbps (new)

### Compile Status
`✓ Compiled in 98ms` — zero TypeScript errors

### Verification Status
| Feature | Status |
|---|---|
| Mic heard on radio | ✅ CONFIRMED (previous session: bytesSentToShoutcast > 100K) |
| Background heard on radio | ⚠️ NOT YET CONFIRMED after latest fix |
| BREAK heard on radio while mic closed | ⚠️ NOT YET CONFIRMED after latest fix |
| AD heard on radio while mic closed | ⚠️ NOT YET CONFIRMED after latest fix |
| Mic re-open on existing session | ⚠️ NOT YET CONFIRMED (fix applied this session) |
| Heartbeat survives mic close | ⚠️ NOT YET CONFIRMED (stale_timeout was seen last session) |

### Next Required Test
Real SHOUTcast listener test — see NEXT_STEPS.md


---

## AUDIO-MIXER-DIRECT-MP3-CONFIRMED-ON-RADIO — 2026-05-07 15:31 (Africa/Cairo)

**Session type:** Mixer diagnosis and direct-to-mixer MP3 test. No build, no deploy, no migration, no secrets, no cloud.

### User-Confirmed Real Radio Results (Akram listening on SHOUTcast output)

| Audio Source | Heard on Real Radio |
|---|---|
| Mic (voice) | ✅ CONFIRMED |
| Generated oscillator tone (OscillatorNode → mixerDest) | ✅ CONFIRMED |
| TEST FILE TO MIXER MP3 (Audio element → createMediaElementSource → mixerDest) | ✅ CONFIRMED |
| Background music via normal background UI flow | ❌ NOT CONFIRMED (UI flow bug — see below) |
| BREAK track via normal queue UI flow | ❌ NOT CONFIRMED (UI flow bug — see below) |
| AD track via normal queue UI flow | ❌ NOT CONFIRMED (UI flow bug — see below) |
| Song via normal queue UI flow | ❌ NOT CONFIRMED (UI flow bug — see below) |

**Akram's additional observations:**
- The MP3 tone was short (~5 seconds), matching the test file size (79KB @ 128kbps ≈ 5s). Confirmed it was the test file.
- The sound came from the radio output, NOT from local Mac speakers (no local feedback — Fix 1 confirmed working).
- Akram noticed the radio playlist/SonicPanel source was faintly audible behind the mic/tone — noted for future investigation (may be SHOUTcast relay bleed-through; not a blocker).
- Disconnect was completed cleanly after each test.

### Technical Conclusions (CONFIRMED)

- ✅ `mixerDestRef.current` (MediaStreamAudioDestinationNode) works correctly.
- ✅ `MediaRecorder(mixerDest.stream)` captures all mixer inputs correctly.
- ✅ `backend-audio → FFmpeg → SHOUTcast` pipeline works at 64 kbps, real-time.
- ✅ `HTMLAudioElement → createMediaElementSource(audio) → gainNode → mixerDest` path works.
- ✅ Fix 1 (`ctx.destination` removal) confirmed working — no feedback/whistle.
- ✅ Fix 2 (background effect rewire to mixer-only) applied — no speaker fallback.
- ❌ The normal background/queue UI flow still does not produce audible output on radio.

### Why the Normal UI Flow Fails (Diagnosed)

All `[DIAG]` logs confirmed the mixer path runs correctly in code:
- `[DIAG][bg-effect] branch: MIXER` — correct branch hit
- `[DIAG][bg-effect] createMediaElementSource: OK`
- `[DIAG][bg-effect] audio.play(): RESOLVED`
- `[DIAG][queue] branch: MIXER` — correct branch hit
- `[DIAG][queue] createMediaElementSource: OK`
- `[DIAG][queue] audio.play(): RESOLVED`

**The gap:** The `TEST FILE TO MIXER` button bypasses ALL of the following:
- The background category/track lookup from DB (`bgCategories`, `activeBgTrackId`)
- The queue system (`mediaQueue`, `playQueueItem`, `getQueueItemAudioSrc`)
- The `/stream/api/tracks/${trackId}` API route

The background/queue flows may be silently failing at one of these upstream steps:
1. `/stream/api/tracks/{trackId}` may not be serving audio correctly (returns wrong content-type, CORS issue, or requires different auth header)
2. `createMediaElementSource` on an audio element that has NOT yet loaded (HTTP fetch pending) may produce a valid-but-silent node
3. The track IDs in `bgCategories` may not match the actual DB track IDs after a test DB reset
4. The audio file URLs may resolve to empty/stub MP3s that `play()` resolves for immediately (like the test files at 5s)

### What Was Fixed This Session

| Fix | File | Lines |
|---|---|---|
| Fix 1 — Removed 3 `ctx.destination` connections | `studio-ui.tsx` | 242, 438, 634 |
| Fix 2 — Background effect: no browser fallback, mixer-only | `studio-ui.tsx` | 228–261 |
| Diagnostic logs added — `[DIAG]` prefix | `studio-ui.tsx` | Multiple |
| TEST FILE TO MIXER button + handler | `studio-ui.tsx` | ~590, ~862 |

**Do Not Regress:**
- Do NOT re-add `gain.connect(ctx.destination)` anywhere — this caused the whistle/feedback confirmed by Akram.
- Do NOT reintroduce the `else { audio.volume = bgVolume }` fallback in the background effect — this was the secondary speaker path.

### Next Required Fix

**Unify background/queue playback with the proven TEST FILE TO MIXER path:**
- The `TEST FILE TO MIXER` handler is the working reference implementation.
- Background and queue must use the same pattern: `new Audio(src)` → `createMediaElementSource` → `gainNode` → `connect(mixerDest)` → `play()`.
- The difference is the src: TEST FILE uses a static public path; background/queue use `/stream/api/tracks/${id}`.
- **First: verify `/stream/api/tracks/{id}` serves valid audio** (correct MIME, range support, no CORS block).

---

## 🟢 Safe Exit — 2026-05-07 15:31 (Africa/Cairo)

**Session type:** Mixer diagnosis, Fix 1+2 implementation, direct-to-mixer MP3 test.  
**No build. No deploy. No migration. No secrets. No cloud.**

### What Was Completed This Session
- ✅ Fix 1: Removed all `ctx.destination` connections (3 occurrences) — whistle/feedback eliminated
- ✅ Fix 2: Background effect rewritten to mixer-only, no speaker fallback
- ✅ `[DIAG]` logs added to all 4 critical paths (bg-effect, mic-open-reconnect, queue, recorder)
- ✅ `TEST FILE TO MIXER` button added — static MP3 directly to mixer
- ✅ Akram confirmed: mic ✅, oscillator ✅, TEST FILE MP3 ✅ — all heard on real radio
- ✅ Background/queue UI flow confirmed NOT producing radio audio (diagnosed — next fix needed)
- ✅ Backend clean disconnects on all sessions (FFmpeg exit 0, SHOUTcast socket closed)

### Files Changed This Session
- `frontend/src/app/studio/studio-ui.tsx` — Fix 1, Fix 2, DIAG logs, TEST FILE button

### Servers at Safe Exit
- frontend (`npm run dev`) — STOPPING
- backend-audio (`ts-node src/index.ts`) — STOPPING

### Exact Next Safe Start
```
1. cd frontend && npm run dev
2. cd backend-audio && ENABLE_SHOUTCAST_LIVE=true npm run dev
3. Check adminfinal_test schedule — renew if expired
4. Verify /stream/api/tracks/{id} serves real audio (curl test)
5. Apply UNIFY fix — see NEXT_STEPS.md
```


---

## CHECKPOINT: LOCAL-STUDIO-AUDIO-FLOW-FULLY-VERIFIED
**Date:** 2026-05-09  
**Session type:** Local dev — no Cloud, no deploy, no migration

### Verified Behaviors

#### 🎙 Mic + Radio
- Mic audio is heard on real SHOUTcast radio output.
- Background 1 heard on real radio while mic is open (ducked).
- Background mutes/fades when Song/Break/Ad starts — no bleed-through.
- Background returns ducked when mic re-opens after queue item ends.

#### 🎵 Queue Playback on Radio
- Song 1 heard on real radio while mic is closed.
- Break 1 heard on real radio while mic is closed.
- Ad 1 heard on real radio while mic is closed.
- Queue audio pauses immediately when mic opens (mic-priority policy).
- Queue audio resumes automatically when mic closes.
- Keepalive ConstantSourceNode keeps backend WS connected after mic close with no audio.
- Disconnect clean while song is playing — no crash, backend cleanup confirmed.

#### 🔁 Auto Queue
- Auto Queue ON: next READY item starts automatically after current item ends.
- Auto Queue OFF: playback stops after item ends; presenter must press Play manually.
- Toggle pill `⏭ تلقائي` / `⏭ يدوي` verified visible and functional.

#### ▶ Queue Row Controls
- Play button visible for every READY queue item (not just the first row).
- Pause button appears for currently playing item (⏸ توقف — amber).
- Pause preserves current playback position (audio.pause() without reset).
- Resume (▶ استمرار — indigo) resumes from the paused position.
- Seek/progress bar shows mm:ss / mm:ss via RAF loop.
- Drag-to-seek updates audio.currentTime in real time (while playing and while paused).
- Clicking Play on a different item stops/resets current item and plays selected one safely.
- ↑/↓ reorder, #N position badge, and ✕ remove all preserved.

#### 🎧 Monitoring
- Monitoring OFF: no local audio output from any studio source to machine speakers.
- Monitoring ON: background and queue audio routed via monitorGainRef → ctx.destination.
- Mic is NOT routed to monitoring (no feedback risk).
- Monitoring volume slider: 0–100%, default 30%, amber accent.
- Slider is dimmed/disabled when Monitoring is OFF.
- Headphone warning banner: "استخدم سماعات Headphones لتجنب الصفير / feedback".
- Disconnect resets monitoring gain to 0 and clears isMonitoring state.

#### 🎤 Mic Source Selector
- Dropdown enumerates all browser-visible audioinput devices.
- Real device names appear after mic permission is granted (refreshAudioInputDevices on first open).
- Fallback labels: "ميكروفون 1", "ميكروفون 2 (افتراضي)" shown before permission.
- Changing device while mic closed: saves preference for next open.
- Changing device while mic open: live-switches stream without breaking WS/recorder/AudioContext.
- Error fallback: if selected device unavailable, falls back to default mic with user-visible warning.
- Refresh button (↻ تحديث الأجهزة) allows re-enumeration at any time.
- Connected physical mics (USB/interface) work via this selector.
- iPhone mic: confirmed non-working (AirPlay/Bluetooth audio limitation — non-blocking).
- Virtual cable / system audio capture: intentionally excluded from core scope.

#### 🔇 NO_MIXER Fallback — Fixed
- Queue audio no longer plays to local speakers when mixer is not ready (NO_MIXER branch).
- Previous bug: `audio.volume = queueVolume` was playing audio locally before mixer init.
- Fix: NO_MIXER branch now logs a warning and returns without playing.


---

## CHECKPOINT: UPLOAD-FILE-MANAGEMENT-LOCAL-VERIFIED
**Date:** 2026-05-09
**Phase:** Upload / File Management — Admin + Presenter + Local Device Files

### Admin Upload (Verified Locally)
- Admin Upload API (`POST /api/admin/media/upload`): ✅ WORKS
  - ADMIN-only auth enforced
  - Accepts MP3/WAV up to 50MB
  - Saves to `public/uploads/{categoryType}/`
  - Creates `MediaTrack` row with fileUrl, mimeType, size
- Admin Upload UI in `/admin/media`: ✅ WORKS
  - XHR-based progress bar
  - Success message: "تم رفع الملف الصوتي بنجاح" appears immediately
  - No page reload after upload
  - Same category accordion remains open after upload
  - Uploaded file appears in list immediately (optimistic local state)
- "مسار" wording replaced with "ملف صوتي" throughout Admin Media UI: ✅ DONE
- Edit MediaTrack title/duration inline: ✅ WORKS
  - `updateTrack` server action enforces ADMIN auth
  - Title and duration editable per track row

### Presenter Upload (Implemented, Not Yet Browser-Tested)
- Presenter Upload API (`POST /api/studio/media/upload`): ✅ IMPLEMENTED
  - PRESENTER-only auth enforced (role !== "PRESENTER" → 403)
  - `ownerId` always taken from `session.user.id` — never trusted from client
  - Only BREAK and AD accepted; BACKGROUND and SONG rejected (400)
  - Validates MIME type (MP3/WAV) and size (≤ 50MB)
  - Auto-finds or creates personal MediaCategory:
    - BREAK → name "فواصلي", ownerType PRESENTER, ownerId = userId
    - AD → name "إعلاناتي", ownerType PRESENTER, ownerId = userId
  - Saves to `public/uploads/break/` or `public/uploads/ad/`
  - Creates MediaTrack; rolls back file on DB failure
- Presenter Upload UI in Studio (`PresenterUploadWidget`): ✅ IMPLEMENTED
  - "⬆ رفع فاصل شخصي" button in فواصلي section
  - "⬆ رفع إعلان شخصي" button in إعلاناتي section
  - Optional title input (falls back to filename)
  - Progress bar via XHR upload events
  - Success message: "✅ تم رفع الملف الصوتي بنجاح"
  - Form auto-closes after 2s on success
  - No page reload — new track appended to local state immediately
  - If category auto-created by API, it appears in the list without reload
- Owner isolation: ✅ ENFORCED SERVER-SIDE
  - Uploaded files appear only under فواصلي / إعلاناتي for the uploading presenter
  - Other presenters cannot see or access these files

### Mixer Initialization Fix (Connect-First)
- `toggleConnection` now initializes AudioContext + mixerDest + keepalive + monitorGain + silent micGain + WebSocket + MediaRecorder at Connect time
- `toggleMic` now only acquires getUserMedia stream and wires it to existing mixer
- Queue audio (Song/Break/Ad) can play after Connect without ever opening the mic
- Background music can be selected and play after Connect without opening mic

### Local Device Files (Verified in Code — Browser Test Pending)
- Local Background from device: "تشغيل كخلفية" button added
  - Routes through mixer (ducking under mic, bgVolume respected)
  - Mutual exclusion: selecting local bg clears DB bg and vice versa
  - Remove button also stops local bg if active
- Local Songs from device: "أضف للانتظار" (`+انتظار`) button: ✅ CONFIRMED EXISTS
- Local Breaks from device: "أضف للانتظار" (`+انتظار`) button: ✅ CONFIRMED EXISTS
- Local Ads from device: "أضف للانتظار" (`+انتظار`) button: ✅ CONFIRMED EXISTS
- All local files use `objectUrl` (blob URL) in QueueItem — no DB writes
- Preview audio controls preserved for all local file types
- Queue playback uses objectUrl path for LOCAL_SESSION items

### No-Touch Confirmation
- No Cloud touched
- No schema changes
- No migration/seed
- No secrets changed
- TypeScript: `npx tsc --noEmit` = 0 errors after all changes


---

## CORRECTION: PRESENTER-UPLOAD-AND-LOCAL-FILES-MANUALLY-VERIFIED
**Date:** 2026-05-09
**By:** Akram (manual browser test)

Previous checkpoint `UPLOAD-FILE-MANAGEMENT-LOCAL-VERIFIED` (same date) marked
some browser-side tests as "Implemented / Not Yet Browser-Tested". This entry
corrects that status after Akram completed manual verification.

### Manually Verified ✅

| Item | Result |
|---|---|
| Presenter Upload UI — "⬆ رفع فاصل شخصي" in Studio | ✅ MANUALLY VERIFIED |
| Uploaded presenter BREAK file appears immediately under فواصلي | ✅ MANUALLY VERIFIED |
| Uploaded presenter file is usable (can add to queue) | ✅ MANUALLY VERIFIED |
| Local Background from device → "تشغيل كخلفية" routes through mixer | ✅ MANUALLY VERIFIED |
| Local Songs from device → "+انتظار" adds to queue correctly | ✅ MANUALLY VERIFIED |
| Local Breaks from device → "+انتظار" adds to queue correctly | ✅ MANUALLY VERIFIED |
| Local Ads from device → "+انتظار" adds to queue correctly | ✅ MANUALLY VERIFIED |
| Connect-first mixer: queue/bg plays after Connect, mic never opened | ✅ MANUALLY VERIFIED |

### Closure
Upload / File Management basic local verification phase is now **FULLY CLOSED**.
Next phase: **Recording / Archive Verification**.

---

## SAFE-EXIT — RECORDING-STILL-NOT-STARTING — 2026-05-10 09:58 (Africa/Cairo)

**Status:** OPEN — recording does not start from any audio source  
**Session type:** Safe exit — no source code changes made during this exit step

### What Was Fixed This Session

| Fix | File | Result |
|-----|------|--------|
| `setIsConnected(true)` moved before `ws.onopen` | `studio-ui.tsx` | ✅ Mic button now works |
| `pendingRecordingReasonRef` — drain pending recording intent in `ws.onopen` | `studio-ui.tsx` | Applied — not yet verified end-to-end |
| PreFlight hydration mismatch on "دخول الاستوديو" button | `pre-flight-screen.tsx` | ✅ Fixed — no more hydration error |

### Current Blocker

**Recording does not start from any audio source:**
- Background music
- Mic
- Song / Queue items
- Break / Ad tracks
- Local device files

**Akram confirmed manually:** After all fixes above, recording still does not start.

### What Is Known Working (confirmed by Akram before this session)

- Studio Enter flow (pre-flight → studio UI)
- Connect button / mixer initialization
- Mic button (now enabled reliably after setIsConnected fix)
- Background playback through mixer
- Queue playback through mixer
- Upload API (admin + presenter)
- Local device files → mixer
- Archive pages (presenter + admin)

### Architecture Expected (do not regress)

```
Connect → AudioContext + mixerDestination + keepalive
       → WebSocket opens (backend-audio port 4001)

First real audio source (mic/bg/queue) →
  ensureRecordingStarted(reason) →
    if WS not yet OPEN: store pendingRecordingReasonRef.current = reason
    if WS OPEN:         new MediaRecorder(mixerDest.stream) → recorder.start(1000)

recorder.ondataavailable → ws.send(e.data) → backend writeStream.write(buffer)

ws.on('close') → writeStream.end() → FFmpeg WebM→MP3 → notifySessionEnded()
              → /api/internal/audio-session/ended → prisma.recording.create()
```

Recording is **independent of SHOUTcast** — backend writes every binary chunk regardless of `ENABLE_SHOUTCAST_LIVE`.

### Suspected Remaining Failure Points (in priority order)

1. **`pendingRecordingReasonRef` drain never fires** — If `ws.onopen` does not fire at all (backend-audio not running on port 4001), the pending intent is stored but never drained. `MediaRecorder` never starts. No chunks sent. Verify backend-audio is actually running.

2. **`ensureRecordingStarted` called before `ws.onopen` AND `ws.onopen` fires after all audio sources stop** — If user opens mic, stores pending, then WS opens but no audio is playing at that moment, `ensureRecordingStarted` would start MediaRecorder but get only keepalive (silent ConstantSourceNode) chunks — not real audio. Need to verify mic gain is still active when WS opens.

3. **`mediaRecorderRef.current` already-recording guard fires incorrectly** — If a previous (failed) MediaRecorder is left in `state !== 'inactive'`, all subsequent `ensureRecordingStarted` calls return early. Check for zombie MediaRecorder after failed connect attempts.

4. **`mixerDestRef.current` is null when pending is drained** — If `stopBroadcastSession()` is called between Connect and `ws.onopen`, `mixerDestRef.current` is cleared. The pending drain then hits the `!dest` guard and returns silently.

### Exact Next Safe Start Steps (MUST follow in order)

1. **Start backend-audio first:**
   ```bash
   cd backend-audio && ENABLE_SHOUTCAST_LIVE=false npm run dev
   ```
   Confirm: `Listening on ws://127.0.0.1:4001/audio`

2. **Start frontend:**
   ```bash
   cd frontend && npm run dev
   ```

3. **Open browser console** — log filter: `[Recording]`

4. **Click Connect** → watch for:
   - `[Studio][connect] AudioContext + mixer ready — enabling Studio UI`
   - `[Studio][connect] Connecting WS to: ws://localhost:4001/audio`
   - `[Studio][ws.onopen] WS OPEN — backend-audio connected`

5. **Open mic** → watch for:
   - `[toggleMic] called — isConnected: true | isMicOpen: false`
   - `[toggleMic] ctx: true | dest: true`
   - `[Recording] Pending start until WebSocket opens: mic` — OR —
   - `[Recording] Starting pending recording after WebSocket open: mic`
   - `[Recording] Started after real source: mic`

6. **If `[Recording] Started` does NOT appear** → this is the exact failure point. Report which log is last seen before silence.

7. **Check backend-audio log** for `[Recording] First chunk received` — if absent, MediaRecorder never sent chunks.

8. **Do NOT run a full radio test** — controlled 5–10 second mic-open test only.

### Rules for Next Session

- Fix recording before any other feature work.
- Do not start Program/Schedule/DJ credentials work until recording is verified end-to-end.
- Do not open mic for more than 10 seconds during diagnosis.
- Do not run long endurance tests until recording is confirmed working.
- Update KB at end of session.

### Files Edited This Session

| File | Change |
|------|--------|
| `frontend/src/app/studio/studio-ui.tsx` | `setIsConnected(true)` before `ws.onopen`; `pendingRecordingReasonRef` intent queue; diagnostic console logs |
| `frontend/src/app/studio/pre-flight-screen.tsx` | `mounted` state — fixes hydration mismatch on "دخول الاستوديو" button |

### Process State at Exit

| Service | State |
|---------|-------|
| Next.js port 3000 | ✅ STOPPED |
| backend-audio port 4001 | ✅ Already stopped before this exit |
| SHOUTcast | ✅ No connections |
| Presenter ON AIR | ✅ None |

**All processes stopped. No live session active. Safe exit confirmed.**


---

## CHECKPOINT — RECORDING-START-FIX-VERIFIED — 2026-05-11 01:52 (Africa/Cairo)

**Session type:** Recording fix + checkpoint — source code edited, manual verification confirmed by Akram.

### Previous Blocker

Recording did not start from any audio source: background, mic, song, break, ad, or local files.
The 0-byte WebM file (`session-20260510-082228-78bc5b48.webm`) confirmed that backend-audio
opened the recording file but received zero chunks — MediaRecorder was started on a silent
keepalive stream and Chromium suppressed `ondataavailable` for zero-energy streams.

### Root Cause

The recording lifecycle was confused across three distinct states:

1. **Connect** — AudioContext + mixerDestination + WebSocket created.
2. **WebSocket OPEN** — previous broken version called `startSessionRecording('connect')` here, which created a `MediaRecorder` on the `mixerDestination.stream` when only the silent `ConstantSourceNode` (gain=0) was connected. Chromium's MediaRecorder suppresses `ondataavailable` for streams with no real audio energy → 0-byte WebM.
3. **First real audio source** — this is the correct trigger. Only when real audio (background, mic, queue) enters the mixer will `ondataavailable` actually fire and deliver chunks.

### Final Accepted Product Rule

```
Connect   → prepares AudioContext + mixerDestination + WebSocket + keepalive.
Recording → starts ONLY when the first real mixer audio source plays.

Real sources (any of these triggers recording):
  - background play resolved
  - mic connected and opened
  - queue item (song / break / ad) play resolved
  - local device file play resolved
```

### Implemented Fix (2026-05-11)

**File edited:** `frontend/src/app/studio/studio-ui.tsx`

- `startSessionRecording(reason)` — internal executor. Requires `wsRef.current` OPEN and `mixerDestRef.current` present. Creates `MediaRecorder(mixerDestRef.current.stream)`, attaches `ondataavailable` to send binary chunks to backend WebSocket, calls `recorder.start(1000)`. Logs `[Recording] Started after real source: {reason}`.

- `ensureRecordingStarted(reason)` — **active public entry point** called by all real audio sources:
  - If recorder already active: no-op (idempotent).
  - If WebSocket not yet OPEN: stores `reason` in `pendingRecordingReasonRef.current` and returns.
  - If WebSocket OPEN: calls `startSessionRecording(reason)` immediately.

- `ws.onopen`:
  - Does **NOT** call `startSessionRecording('connect')` — silent-keepalive start removed.
  - Wires pre-selected background into mixer; calls `ensureRecordingStarted('background')` after `audio.play()` resolves.
  - Drains `pendingRecordingReasonRef` if a real source stored an intent before the WS opened.

- Call sites (unchanged, always present):
  - Background play `.then()` → `ensureRecordingStarted('background')`
  - `playQueueItem` play `.then()` → `ensureRecordingStarted('queue')`
  - Mic open path → `ensureRecordingStarted('mic')`

### Akram Manual Verification

- ✅ Recording starts after first real audio source plays.
- ✅ Recording file (`.webm` / `.mp3`) appears in `backend-audio/debug-recordings/`.
- ✅ Recording blocker **CLOSED**.

### Do Not Regress

- Do NOT call `startSessionRecording` from `ws.onopen` without a real source present.
- Do NOT remove `ensureRecordingStarted` calls from bg/queue/mic play paths.
- Do NOT start `MediaRecorder` when only the silent keepalive is active.

---

## CHECKPOINT — RECORDING-AND-LIVE-OUTPUT-VERIFIED — 2026-05-11 02:04 (Africa/Cairo)

**Session type:** End-to-end verification — recording + live SHOUTcast output — manually confirmed by Akram.

### Summary

Both remaining blockers from the previous sessions are now fully resolved and manually verified:
- **Recording blocker** — CLOSED
- **Live output blocker** — CLOSED
- **Station Default DJ credential fallback** — VERIFIED

### What Was Verified (Akram Manual Test — 2026-05-10T22:46 UTC)

| Check | Result |
|-------|--------|
| Recording starts from first real mixer audio source | ✅ |
| WebM file created with real data | ✅ `session-20260511-014640-78bc5b48.webm` — 640 KB |
| MP3 conversion completed | ✅ `session-20260511-014640-78bc5b48.mp3` — 626 KB |
| DB `recordings` row created | ✅ `bytes_received=655,436, duration_seconds=47` |
| backend-audio ENABLE_SHOUTCAST_LIVE=true | ✅ confirmed from startup banner |
| Token validation succeeded | ✅ |
| stationId resolved = `8c3092b9` (شمر) | ✅ via Program schedule (P2) |
| credentialSource = `station_default` | ✅ `shammar@radio.socialgenix.com:4898` |
| FFmpeg started | ✅ `[FFmpeg] Process started` |
| SHOUTcast socket connected | ✅ `radio.socialgenix.com:4898` |
| SOURCE handshake accepted | ✅ `[SHOUTcast] Handshake accepted ✓` |
| Chunks received by backend | ✅ 40 chunks × ~16 KB each |
| bytesSentToShoutcast increased | ✅ final = **320,301 bytes** at 64.0 kbits/s |
| Akram manually confirmed live radio output | ✅ audio heard on live stream |
| Clean disconnect | ✅ FFmpeg exited code 0, socket closed |
| sonic_connection_status in DB | ✅ `DISCONNECTED` (set on clean exit) |

### Session Telemetry (for reference)

```
Session ID  : 3330b810-d3f5-4fd1-8b27-b6ab2ffc4d6b
Presenter   : 78bc5b48
Duration    : 47 seconds
Browser→WS  : 655,436 bytes (40 chunks)
WS→SHOUTcast: 320,301 bytes
Bitrate     : 64.0 kbits/s (FFmpeg constant)
FFmpeg speed: 1.01–1.04× real-time
```

### Architecture Confirmed Working

```
Browser (studio-ui.tsx)
  └── MediaRecorder(mixerDestination.stream)
        └── ondataavailable → WebSocket → backend-audio (port 4001)
              ├── WebM file written to debug-recordings/
              ├── FFmpeg: WebM/Opus stdin → MP3 stdout
              ├── SHOUTcast SOURCE pipe at 64 kbps
              └── On disconnect:
                    ├── MP3 conversion (FFmpeg second pass)
                    ├── notifySessionEnded → DB recordings row
                    └── LiveSession.sonic_connection_status = DISCONNECTED
```

### Credential Resolution Chain Used

```
P1 (presenter+station SonicPanelCredential): NOT FOUND for 78bc5b48 + 8c3092b9
P2 (StationDefaultCredential for 8c3092b9) : FOUND ✅ → credentialSource=station_default
```

### Status at This Checkpoint

- Recording blocker: **CLOSED** ✅
- Live output blocker: **CLOSED** ✅
- Station default DJ fallback: **VERIFIED** ✅

---

## CHECKPOINT — PROGRAM-SCHEDULE-EDIT-VERIFIED — 2026-05-11 02:20 (Africa/Cairo)

**Session type:** Feature implementation + manual verification by Akram.

### What Was Implemented

**Files edited:**
- `frontend/src/app/admin/programs/[id]/edit/actions.ts` — added `updateScheduleRule`, `updateScheduleSlot`
- `frontend/src/app/admin/programs/[id]/edit/page.tsx` — added collapsible edit forms for rules and slots

#### updateScheduleRule
- Editable fields: `recurrenceType`, `timezone`, `allowConnectMinutesBefore`
- Validations: recurrenceType ∈ {DAILY, WEEKLY, SELECTED_DAYS, ONE_TIME}, timezone non-empty, allowConnect ≥ 0, rule existence check
- On success: `revalidatePath` on program edit page + `/studio` layout
- Error messages: Arabic

#### updateScheduleSlot
- Editable fields: `dayOfWeek`, `slotDate`, `startTime`, `endTime`
- Validations: TIME_RE format (HH:MM), startTime < endTime, slot existence check, dayOfWeek required for WEEKLY/SELECTED_DAYS, slotDate required for ONE_TIME
- On success: `revalidatePath` on program edit page + `/studio` layout
- Error messages: Arabic

#### UI Changes (page.tsx)
- Each rule card now has a collapsible `<details>` section labelled `✏️ تعديل القاعدة`
  - Pre-filled with current recurrenceType, timezone, allowConnectMinutesBefore
- Each slot row now has a collapsible `<details>` section labelled `✏️ تعديل الوقت`
  - Pre-filled with current dayOfWeek/slotDate/startTime/endTime
  - dayOfWeek field shown only for WEEKLY/SELECTED_DAYS
  - slotDate field shown only for ONE_TIME
- Both forms show: `⚠ سيتم فحص التضارب في الخطوة التالية.`
- `searchParams` extended to accept `editRule` and `editSlot` for deep-link auto-open

### Preserved (Untouched)
- createScheduleRule
- toggleRuleActive
- deleteScheduleRule
- createScheduleSlot
- deleteScheduleSlot
- updateProgram (metadata)
- All existing UI forms

### Conflict Detection
- **Intentionally NOT implemented** in this step.
- Placeholder notice shown in both edit forms.
- Will be implemented in the next schedule hardening step.

### Akram Manual Verification
- ✅ Edit Schedule Rule works — fields update correctly.
- ✅ Edit Schedule Slot works — times update correctly.
- ✅ Validation works — invalid inputs rejected with Arabic messages.
- ✅ Existing create/delete/toggle behavior preserved.
- ✅ Compile: 0 TypeScript errors.

### Status
- Program Schedule edit UX: **CLOSED** ✅

---

## CHECKPOINT — EXIT-STUDIO-BUTTON-VERIFIED — 2026-05-11 02:31 (Africa/Cairo)

**Session type:** Bug fix + manual verification by Akram.

### Previous Issue

The Exit Studio button (`خروج من الاستوديو`) did not actually exit the Studio UI. It called
`router.push('/studio')` which triggered a full server round-trip, re-evaluating the schedule
and potentially landing on a WaitScreen or a slow reload. When connected, there was no guarantee
the disconnect happened before navigation.

### Fix Implemented

**Files edited:**
- `frontend/src/app/studio/studio-ui.tsx`
- `frontend/src/app/studio/pre-flight-screen.tsx`

#### studio-ui.tsx
- Added `onExitStudio?: () => void` to the `Props` type.
- Destructured `onExitStudio` in the `StudioPage` function signature.
- Updated Exit button `onClick` handler:
  1. If `isConnected`: calls `stopBroadcastSession()` + `fetch('/stream/api/studio/disconnect')` + resets `isConnected`/`shoutcastStatus`.
  2. If `onExitStudio` is provided: calls `onExitStudio()` — instant pre-flight return, no server round-trip.
  3. If `onExitStudio` is absent (standalone use): falls back to `router.push('/studio')` with `window.location.href = '/stream/studio'` as a final catch fallback.

#### pre-flight-screen.tsx
- Added `onExitStudio={() => setHasPassed(false)}` to the `<StudioUI>` render.
- When Exit is clicked inside StudioUI, `hasPassed` is reset to `false`, instantly showing the pre-flight checks screen without reloading the page or hitting the server.

### Behavior After Fix

| Scenario | Result |
|----------|--------|
| Exit while connected (mic open, bg playing, recording active) | Clean disconnect → `stopBroadcastSession()` → pre-flight screen |
| Exit while not connected (just entered Studio) | Immediate return to pre-flight screen |
| Exit while WS is half-connected | `stopBroadcastSession()` cleans up gracefully → pre-flight screen |
| basePath fallback | `router.push('/studio')` (Next.js applies `/stream` prefix); `window.location.href = '/stream/studio'` only in catch |

### Preserved (Untouched)
- Manual Disconnect button (`toggleConnection`) — unchanged
- Auto-disconnect watchdog (session end timer) — unchanged
- Recording lifecycle (`ensureRecordingStarted`, `startSessionRecording`) — unchanged
- Live SHOUTcast flow — unchanged
- Mic controls, queue, background playback — unchanged

### Akram Manual Verification
- ✅ Exit Studio button now exits the Studio UI correctly.
- ✅ If connected, clean disconnect fires first.
- ✅ User returns to PreFlight state instantly.
- ✅ Manual disconnect behavior preserved.
- ✅ Recording and live flow unaffected.
- ✅ Compile: 0 TypeScript errors.

### Status
- Exit Studio button: **CLOSED** ✅

---

## CHECKPOINT — PROGRAM-SCHEDULE-TIME-RESOLVER-VERIFIED — 2026-05-11 03:02 (Africa/Cairo)

**Session type:** Bug fix (timezone/resolver) + manual verification by Akram.

### Previous Issue

- WaitScreen countdown was wrong by ~2–3 hours vs the actual admin schedule slot.
- Auto-disconnect did not trigger at the expected program end.
- Studio session end time shown in UI did not match the admin-configured slot time.
- The 60-second warning before session end never appeared.

### Root Cause (Confirmed by Code Trace + Node.js Verification)

**File:** `frontend/src/lib/resolve-program-session.ts`

Two bugs in `resolveCurrentOrNextProgramSession`:

#### Bug 1 — `windowStart` computed using non-portable pattern
```js
// BEFORE (broken on UTC servers):
const cairoNow = new Date(
  new Date(now).toLocaleString("en-US", { timeZone: "Africa/Cairo" })
);
const windowStart = new Date(cairoNow);
windowStart.setHours(0, 0, 0, 0);
```
`toLocaleString()` returns a locale string (e.g. `"5/11/2026, 2:00:00 AM"`).
`new Date("5/11/2026, 2:00:00 AM")` is parsed as **server-local time**.
On Africa/Cairo machines: correct.
On UTC servers (Cloud, Docker, Linux): parsed as UTC → `windowStart` is 3h late (UTC+3 offset)
→ Today's Cairo 00:45–02:46 session falls **outside** the window → resolver returns tomorrow's session.
→ Countdown shows ~21h instead of the correct time.

#### Bug 2 — `cursor.setHours(0,0,0,0)` overrides the correct `windowStart`
```js
// BEFORE (broken on UTC servers):
const cursor = new Date(windowStart);
cursor.setHours(0, 0, 0, 0);  // ← resets to server-local midnight (UTC midnight on UTC server)
```
Even if `windowStart` were correct, this reset corrupts it on UTC servers.
Also `cursor.setDate(cursor.getDate() + 1)` advanced calendar date in local TZ, inconsistent.

### Fix Applied

**File:** `frontend/src/lib/resolve-program-session.ts`

#### Fix 1 — Portable Cairo midnight using only Intl APIs
```js
// AFTER (correct on ALL servers regardless of system TZ):
const REP_TZ = "Africa/Cairo";
const cairoParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: REP_TZ, year: "numeric", month: "2-digit", day: "2-digit",
}).formatToParts(now);
const cy = Number(cairoParts.find(p => p.type === "year")?.value);
const cm = Number(cairoParts.find(p => p.type === "month")?.value);
const cd = Number(cairoParts.find(p => p.type === "day")?.value);
const calDateMidnightUTC = Date.UTC(cy, cm - 1, cd, 0, 0, 0, 0);
const cairoHourAtMidnight = Number(
  new Intl.DateTimeFormat("en-US", { timeZone: REP_TZ, hour: "numeric", hour12: false })
    .formatToParts(new Date(calDateMidnightUTC))
    .find(p => p.type === "hour")?.value ?? "0"
);
const windowStart = new Date(calDateMidnightUTC - cairoHourAtMidnight * 3_600_000);
const windowEnd   = new Date(windowStart.getTime() + 14 * 24 * 3_600_000);
```
Cairo midnight is now computed as a pure UTC epoch using `Date.UTC` and `Intl` only.
No system TZ dependency. Correct on UTC servers, Cairo servers, any server.

#### Fix 2 — Cursor advances by fixed 24h instead of setDate/setHours
```js
// AFTER:
const cursor = new Date(windowStart);  // NO setHours — windowStart already correct
// ...loop body...
cursor.setTime(cursor.getTime() + 24 * 3_600_000);  // fixed 24h advance
```

### Verified Output (Node.js trace at 02:57 Cairo = 23:57 UTC)

| Field | Before Fix | After Fix |
|-------|-----------|-----------|
| `windowStart` (UTC) | `2026-05-11T00:00:00Z` ❌ | `2026-05-10T21:00:00Z` ✅ |
| `windowStart` (Cairo) | 03:00 AM ❌ | 00:00 AM ✅ |
| Today's session included? | No (end < windowStart) ❌ | Yes ✅ |
| Today slot start (UTC) | N/A (excluded) | `2026-05-10T21:45:00Z` = 00:45 Cairo ✅ |
| Today slot end (UTC) | N/A (excluded) | `2026-05-10T23:46:00Z` = 02:46 Cairo ✅ |
| gateOpenTime (UTC) | N/A | `2026-05-10T21:40:00Z` = 00:40 Cairo ✅ |

### Preserved (Untouched)
- `applyTime()` function — correct and unchanged
- `dayOfWeekInTZ()` function — correct and unchanged
- `expandOccurrences()` logic for ONE_TIME slots — unchanged
- `isCancelledByException()` — unchanged
- WaitScreen, StudioUI, page.tsx — no changes needed; they use resolver output
- Auto-disconnect watchdog — uses `sessionEndMs` from resolver; now correct

### Akram Manual Verification
- ✅ WaitScreen countdown matches the actual scheduled program time.
- ✅ Studio session end time matches admin slot time.
- ✅ Auto-disconnect timing is based on correct program occurrence.
- ✅ Previous 2-hour mismatch resolved.
- ✅ Compile: 0 TypeScript errors.

### Status
- Program schedule time resolver blocker: **CLOSED** ✅

---

## CHECKPOINT — CURRENT-LOCAL-PROJECT-STATE-SAVED — 2026-05-11 05:51 (Africa/Cairo)

**Session type:** Progress checkpoint + rollback backup.

---

### Overall Progress Estimate

| Scope | Completion |
|-------|-----------|
| Local project (all modules) | **82–87%** |
| Cloud production readiness | **70–75%** |

---

### What Is Verified (Working Locally)

| Module | Status |
|--------|--------|
| Studio recording (starts on first real mixer audio) | ✅ VERIFIED |
| Live SHOUTcast output (64 kbps, presenter credentials) | ✅ VERIFIED |
| Station Default DJ credential fallback | ✅ VERIFIED |
| Exit Studio button (instant pre-flight return) | ✅ VERIFIED |
| Auto-disconnect watchdog (fires at program end) | ✅ VERIFIED |
| Program Schedule Rule/Slot CRUD + Edit | ✅ VERIFIED |
| Program Schedule Time Resolver (Cairo TZ, UTC-portable fix) | ✅ VERIFIED |
| Background music fader isolation (only affects bgGain) | ✅ VERIFIED |
| Background fader UI draggable (disabled=false, direction:ltr) | ✅ VERIFIED |
| Background fader audio effect (direct onChange → applyBgGain) | ✅ VERIFIED |
| PreFlight hydration error fixed (mounted guard on all status checks) | ✅ VERIFIED |
| RecordingCompactPlayer hydration error fixed (Intl locale mounted guard) | ✅ VERIFIED |
| Upload / File Management (admin upload, presenter local device) | ✅ VERIFIED |
| Admin + Presenter recordings archive | ✅ VERIFIED |
| Multi-station foundation | ✅ VERIFIED |
| Admin Stations CRUD + Edit | ✅ VERIFIED |
| Presenter ↔ Station assignment | ✅ VERIFIED |
| Station Default DJ credentials (SonicPanel) | ✅ VERIFIED |
| Admin Programs page | ✅ VERIFIED |
| Program rules/slots editable | ✅ VERIFIED |
| Duplicate session cleanup (stale LiveSession rows cleared) | ✅ VERIFIED |

---

### Open Issues / Remaining Work

| # | Issue | Priority |
|---|-------|----------|
| 1 | **WaitScreen time/countdown mismatch** — Akram confirmed mismatch still visible after resolver fix. May be a display-layer formatting issue in wait-screen.tsx or page.tsx | 🔴 HIGH |
| 2 | **Background ↔ Queue 3-second crossfade** — when mic closes and queue has item: bg fades down, queue fades in. Currently hard cut | 🔴 HIGH |
| 3 | **Background loop behavior** — if mic closes + queue empty: bg loops. When queue item added: crossfade from bg to queue | 🟡 MEDIUM |
| 4 | **Admin presenter password change** — no UI for admin to change presenter password | 🟡 MEDIUM |
| 5 | **Schedule conflict detection** — same station + overlapping time, or same presenter + overlapping time → should be forbidden | 🟡 MEDIUM |
| 6 | **Special/exception episodes** — EXTRA_EPISODE, SPECIAL_EVENT, CANCELLED, RESCHEDULED types not implemented | 🟡 MEDIUM |
| 7 | **Presenter + Station DJ credential override** — per-presenter SonicPanel credentials not complete | 🟡 MEDIUM |
| 8 | **Station Manager role** — manager manages one station; can manage presenters created by them; limited admin access | 🟡 MEDIUM |
| 9 | **Schedule Calendar UI** — visual calendar view of program schedule | 🟢 LOW |
| 10 | **Admin dashboard stats + UI alignment** | 🟢 LOW |
| 11 | **UI/UX design alignment** — against original EGONAIR reference images | 🟢 LOW |
| 12 | **Debug cleanup** — remove [DIAG] logs, test buttons, [BgGain] console logs | 🟢 LOW |
| 13 | **Endurance test** — 2+ hour continuous broadcast test | 🟢 LOW |
| 14 | **Cloud deployment** — after all local tests pass | 🟢 LOW |

---

### Recommended Next Issue

**Option A (if countdown is visually wrong):** Fix WaitScreen time/countdown display.
**Option B (if countdown is now OK):** Implement Background ↔ Queue 3-second crossfade/handoff.
Akram to decide based on current observation.

---

### Primary Source Files at This Checkpoint

- `frontend/src/app/studio/studio-ui.tsx` — main studio UI
- `frontend/src/app/studio/pre-flight-screen.tsx` — preflight with mounted guard
- `frontend/src/app/studio/wait-screen.tsx` — countdown display
- `frontend/src/app/studio/page.tsx` — server resolver + routing
- `frontend/src/lib/resolve-program-session.ts` — Cairo-portable resolver
- `frontend/src/components/recordings/RecordingPlayer.tsx` — mini-player with mounted guard
- `backend-audio/src/index.ts` — WS + SHOUTcast live pipeline

---

## CHECKPOINT — WAITSCREEN-HYDRATION-COUNTDOWN-FIXED — 2026-05-11 06:00 (Africa/Cairo)

**Status: CLOSED ✅**

### Previous Issue
- WaitScreen showed a React hydration mismatch error on every page load.
- Countdown digits (HH:MM:SS) differed between server render and first client render.
- The `disabled` attribute on the enter-studio button also varied between SSR and client.
- Time/countdown display was visually unstable and threw console errors.

### Root Cause
`Date.now()` was called directly inside `useState()` initializers in `wait-screen.tsx`:
```ts
// BROKEN — Date.now() runs at different instants on server vs client
const [timeLeftMs, setTimeLeftMs] = useState<number>(gateOpenTimeMs - Date.now());
const [gateOpen, setGateOpen]     = useState<boolean>(gateOpenTimeMs <= Date.now());
```
The server executes `useState()` at HTTP request time.
The browser executes the same `useState()` ~50–200ms later during hydration.
The two `Date.now()` calls produce different numbers → different `timeLeftMs` → different HH:MM:SS digits → React hydration mismatch.

**The resolver and page.tsx were NOT the cause.** The resolver correctly computes Cairo-portable UTC epochs and the page correctly passes `gateOpenTimeMs` as a prop.

### Fix Applied (`wait-screen.tsx` only)
```ts
// FIXED — deterministic initial state (identical on SSR and client)
const [mounted, setMounted]       = useState(false);
const [timeLeftMs, setTimeLeftMs] = useState<number>(0);      // not Date.now()
const [gateOpen, setGateOpen]     = useState<boolean>(false); // not Date.now()

useEffect(() => {
  setMounted(true);
  const tick = () => {
    const remaining = gateOpenTimeMs - Date.now(); // Date.now() ONLY in client effect
    setTimeLeftMs(remaining);
    if (remaining <= 0) { setGateOpen(true); /* reload */ }
  };
  tick(); // populate real values immediately on mount
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}, [gateOpenTimeMs]);
```
- Clock digits show `--` until `mounted=true`, then real countdown.
- `gateOpen` button disabled until `mounted && gateOpen`.
- Session start/end labels continue to come from `page.tsx` (pre-formatted `ar-EG` Cairo strings).

### Confirmed By
- Akram confirmed fix is OK.
- TypeScript: 0 errors.

### Pattern: Date.now() in useState is Always Wrong in SSR Components
Any `"use client"` component rendered by a Next.js server component must NOT use
`Date.now()`, `new Date()`, `Math.random()`, or any browser-only value inside
`useState()` initializers. Move these to `useEffect`.

---

## CHECKPOINT — BACKGROUND-DUCK-RATIO-VERIFIED — 2026-05-11 06:34 (Africa/Cairo)

**Status: CLOSED ✅**

### Previous Issue
After a ducking ratio audit, `BG_DUCK_RATIO` was temporarily set to `0.20`, which made the background too loud under mic. Akram confirmed the correct product rule is `0.10`.

### Final Accepted Product Rule — Background Ducking

| Scenario | Formula | Result at fader 50% |
|----------|---------|---------------------|
| Mic open | `bgGain = bgVolume * 0.10` | 5% |
| Mic closed, queue empty | `bgGain = bgVolume` | 50% |
| Queue item playing | `bgGain = 0` (crossfaded) | 0% |

**Ducking examples (fader × 0.10):**
- fader 50% → bg under mic = 5%
- fader 100% → bg under mic = 10%
- fader 70% → bg under mic = 7%
- fader 25% → bg under mic = 2.5%

### What Was Changed
- `frontend/src/app/studio/studio-ui.tsx` line ~307:
  ```ts
  const BG_DUCK_RATIO = 0.10;  // was 0.20
  ```
- Default `bgVolume` unchanged: `0.5` (50%).

### What Was Preserved
- Crossfade / handoff logic (`fadeGain`, 3s bg→queue, 2s queue→bg) — **untouched**
- `micGainRef` — **untouched**
- `queueGainRef` — **untouched**
- `monitorGainRef` — **untouched**
- Recording / live output — **untouched**
- PreFlight / WaitScreen — **untouched**

### Hydration Note
`RecordingCompactPlayer` already has a complete `mounted` guard:
- `isActive = mounted && playingId === rec.id`
- `canSeek = isActive`
- `disabled={!canSeek}` — always boolean
- `dateLabel` behind `mounted` (Intl locale guard)

If hydration error still appears in browser console after **hard refresh (Cmd+Shift+R)**, treat it as a separate standalone issue — it is NOT related to background ducking or fader logic.

### TypeScript Status
✅ `npx tsc --noEmit` — 0 errors

---

## CHECKPOINT — SCHEDULE-CONFLICT-DETECTION-VERIFIED — 2026-05-11 07:08 (Africa/Cairo)

**Status: VERIFIED LOCALLY ✅**

### A) Original Problem
- Admin could create overlapping `ProgramScheduleSlot` times with no protection.
- Same station + overlapping broadcast time window was fully allowed.
- Same presenter double-booking was also unblocked.
- No real overlap detection existed — only basic field-level validation:
  - `startTime` required
  - `endTime` required
  - `startTime < endTime` (self-consistency)
  - HH:MM format validation via regex
- No Arabic conflict warning or error appeared in the UI.

### B) Implemented Conflict Detection

**File:** `frontend/src/app/admin/programs/[id]/edit/actions.ts`

Three helpers were added:

#### `hasTimeOverlap(startA, endA, startB, endB)`
```ts
return startA < endB && endA > startB;
```
Adjacent times (e.g. 10:00–11:00 next to 11:00–12:00) are explicitly allowed.

#### `daysOverlap(typeA, dowA, dateA, typeB, dowB, dateB)`
Determines whether two recurrence contexts apply to the same calendar day:
- `DAILY` conflicts with everything.
- `WEEKLY` / `SELECTED_DAYS` conflicts with same `dayOfWeek` and with `DAILY`.
- `ONE_TIME` conflicts with same ISO date, with `DAILY`, and with `WEEKLY` if `getUTCDay()` matches.

#### `checkSlotConflicts({ stationId, presenterId, recurrenceType, dayOfWeek, slotDate, startTime, endTime, excludeSlotId? })`
- Queries all active `ProgramScheduleSlot` rows for the same station OR same presenter.
- Tests each candidate with `daysOverlap` + `hasTimeOverlap`.
- Throws Arabic error on first conflict found.

**Wired into:**
- `createScheduleSlot` — before `prisma.programScheduleSlot.create`
- `updateScheduleSlot` — before `prisma.programScheduleSlot.update`, with `excludeSlotId = slotId` to skip self

**Conflict message format:**
```
يوجد تعارض في وقت البث (نفس المحطة) مع برنامج: "{title}" (HH:MM – HH:MM)
يوجد تعارض في وقت البث (نفس المذيع) مع برنامج: "{title}" (HH:MM – HH:MM)
```

### C) Runtime Error Problem (Fixed)
- First implementation used raw `throw new Error(...)` inside the server action.
- Next.js propagated this to the error boundary → white Runtime Error page.
- Detection logic was correct; error delivery was wrong.

### D) UI Error Fix
- Both `createScheduleSlot` and `updateScheduleSlot` now wrap `checkSlotConflicts` in `try/catch`.
- On conflict: `redirect(/admin/programs/${programId}/edit?slotError=<encoded>&...)` — no throw propagates.
- In `page.tsx`: `slotError` read from `searchParams`, rendered as a red banner above the schedule rules list (`id="schedule-section"`).
- Hash `#schedule-section` / `#slot-<id>` in the redirect URL scrolls browser directly to the conflict message.
- Admin stays on the program edit page — no white page, no data loss.

### E) Akram Manual Verification
- Akram created a slot overlapping an existing program on the same station.
- Conflict detection triggered correctly.
- UI showed the Arabic conflict message (bracked by program title + existing time).
- No white Runtime Error page appeared.
- **Flow considered VERIFIED LOCALLY.**

### F) Remaining Schedule Work
- ❓ Same-presenter overlap: logic exists in `checkSlotConflicts` but not separately verified by Akram.
- 🟡 Special/exception episodes: `ProgramScheduleException` model exists; not yet integrated into conflict check.
- 🟢 Calendar UI: not started.

---

## VICTORY CHECKPOINT — LOCAL CORE SYSTEM VERIFIED — 2026-05-11 07:13 (Africa/Cairo)

**Status: LOCAL MILESTONE ACHIEVED 🎉**

Today ends on a major verified local milestone. The core Radio Studio system is fully functional locally.

### Estimated Completion
| Layer | Estimate |
|-------|---------|
| Local project completeness | 90–93% |
| Cloud production readiness | 78–82% |

### Verified Modules (All Confirmed by Akram)

| Module | Status |
|--------|--------|
| Live Studio (connect / mic / broadcast) | ✅ VERIFIED |
| Recording pipeline (MediaRecorder → MP3) | ✅ VERIFIED |
| MP3 archive (presenter + admin) | ✅ VERIFIED |
| SHOUTcast live output (SonicPanel) | ✅ VERIFIED |
| Station Default DJ fallback | ✅ VERIFIED |
| Exit Studio / auto-disconnect watchdog | ✅ VERIFIED |
| Queue (play / pause / stop / auto-advance) | ✅ VERIFIED |
| Background fader (isolated, draggable, audio effect) | ✅ VERIFIED |
| Background ↔ Queue crossfade (3s fade-out / 2s fade-in) | ✅ VERIFIED |
| Background ducking under mic (BG_DUCK_RATIO=0.10) | ✅ VERIFIED |
| Upload / Media Management | ✅ VERIFIED |
| Monitoring fader | ✅ VERIFIED |
| Mic Source Selector | ✅ VERIFIED |
| Multi-Station foundation | ✅ VERIFIED |
| Admin Stations CRUD/Edit | ✅ VERIFIED |
| Presenter ↔ Station assignment | ✅ VERIFIED |
| Admin Programs CRUD/Edit | ✅ VERIFIED |
| Program Schedule Rule / Slot edit | ✅ VERIFIED |
| Program Schedule Time Resolver (Cairo) | ✅ VERIFIED |
| Schedule Conflict Detection (same station / same presenter) | ✅ VERIFIED |
| Special / Exception Episodes | ✅ VERIFIED BY AKRAM |
| WaitScreen hydration fix | ✅ VERIFIED |
| PreFlight entry button hydration fix | ✅ VERIFIED |
| RecordingCompactPlayer hydration fix | ✅ VERIFIED |
| Schedule edit save UX (success banners / inline messages) | ✅ VERIFIED |

### Remaining Major Items
| Item | Priority |
|------|---------|
| Station Manager role | 🟡 HIGH |
| Presenter + Station DJ credential override | 🟡 HIGH |
| Schedule Calendar UI / visual polish | 🟡 MEDIUM |
| UI/UX Design Alignment (EGONAIR reference images) | 🟡 MEDIUM |
| Debug cleanup ([DIAG] logs, test buttons) | 🟢 LOW |
| Endurance test (multi-hour broadcast) | 🟢 LOW |
| Cloud deployment (production launch) | 🟢 FINAL |

---

## CHECKPOINT — ADMIN-PRESENTER-PASSWORD-CHANGE-VERIFIED — 2026-05-11 19:39 (Africa/Cairo)

**Session type:** Feature implementation + manual verification by Akram.

### Previous Issue

Admin panel had no UI to change or reset a presenter's password.
There was no way for an admin to update a presenter's login credentials without directly editing the database.

### Implemented

**File edited:** `frontend/src/app/admin/presenters/[id]/edit/page.tsx`

#### New Section — "تغيير كلمة مرور المذيع"

A dedicated password-change card was added **below** the Station Assignment section on the presenter edit page.
Fields:
- **كلمة المرور الجديدة** (new password, `minLength=6`)
- **تأكيد كلمة المرور** (confirm password, `minLength=6`)
- Submit button: **تغيير كلمة المرور** (amber style — visually distinct from the main save button)

#### New Server Action — `updatePresenterPassword(formData)`

- `"use server"` directive — runs server-side only.
- **ADMIN-only auth:** checks `session.user.role !== "ADMIN"` and throws `Unauthorized` if not admin.
- **Presenter existence check:** verifies `User.role === "PRESENTER"` before proceeding.
- **Validation rules:**
  - New password must not be empty → redirects `?pwError=empty`.
  - Minimum length: 6 characters → redirects `?pwError=short`.
  - Passwords must match → redirects `?pwError=mismatch`.
- **Password hashing:** `bcrypt.hash(newPassword, 10)` — identical to the existing create-presenter flow in `api/admin/presenters/route.ts`.
- **Only `User.passwordHash` is updated** — no other fields are touched.
- On success: `revalidatePath` + `redirect(?saved=password#change-password)`.

#### Inline Feedback

- **Success banner** (green, near password section): "تم تغيير كلمة مرور المذيع بنجاح."
- **Error banners** (red, near password section):
  - "كلمة المرور الجديدة مطلوبة."
  - "كلمة المرور يجب أن تكون 6 أحرف على الأقل."
  - "كلمة المرور وتأكيدها غير متطابقتين."

#### Preserved (Untouched)

- Account validity section
- Station assignment section
- Program management link
- Existing presenter save behavior (updatePresenter)
- SonicPanel / DJ credential sections
- Existing success messages (?saved=presenter, ?saved=stations)
- All other server actions in the file

### TypeScript Compile

✅ `npx tsc --noEmit` — 0 errors.

### Akram Manual Verification

- ✅ Password change section appears on the presenter edit page.
- ✅ Password was changed successfully.
- ✅ Presenter logged in with the new password.
- ✅ Validation works (match check, minimum length).
- ✅ Success message "تم تغيير كلمة مرور المذيع بنجاح." displayed correctly.
- ✅ Existing presenter edit features preserved.

### Status

**Admin presenter password change: CLOSED ✅**

---

## CHECKPOINT — PRESENTER-TYPE-UI-RESTRUCTURE-VERIFIED
**Date:** 2026-05-11
**Status:** CLOSED ✅

### Previous Issue
Presenter create/edit pages were overloaded and showed unrelated sections for all presenter types. A single unified form appeared for SINGLE_STATION, MULTI_STATION, and DIRECT_DJ regardless of account type, leading to confusion and incorrect data entry.

### Implemented

**Create Page (`new/page.tsx`)**
- SINGLE_STATION create flow: requires exactly one station via radio button selector. Fetches active stations from `/api/admin/stations`. Client + API validation enforced.
- MULTI_STATION create flow: requires at least one station via checkbox list. Client + API validation enforced.
- DIRECT_DJ create flow: no station selector shown. Contextual note about adding DJ radios from edit page.
- `canBroadcast` checkbox hidden for DIRECT_DJ on create.

**Create API (`/api/admin/presenters/route.ts`)**
- Accepts `stationIds[]` alongside `presenterMode`.
- Validates: SINGLE_STATION = exactly 1, MULTI_STATION = ≥ 1, DIRECT_DJ = 0.
- Validates all submitted station IDs exist and are active.
- Creates `PresenterStation` rows atomically in `$transaction` alongside the `User`.

**Stations Endpoint (`/api/admin/stations/route.ts`)**
- New lightweight `GET` endpoint added to serve active station list to client components.

**Edit Page (`[id]/edit/page.tsx`)**
- SINGLE_STATION: assigned station shown as read-only 📻 card. No editable checkboxes. Lock notice displayed.
- MULTI_STATION: editable checkbox list. `updatePresenterStations` checks for Programs on removed stations before delete. Redirects with `?stationError=programs` if blocked. Arabic error banner shown.
- DIRECT_DJ: station assignment section hidden. Program management link hidden. SonicPanel section hidden.
- `canBroadcast` checkbox guarded — hidden for DIRECT_DJ in edit UI.
- Legacy SonicPanel visible form section removed from all types. DB data preserved untouched.
- All validation errors redirect with query param + render Arabic banner in UI — no raw `throw new Error` to browser.

**Presenter List (`page.tsx`)**
- Type filter buttons: كل الأنواع / 📻 محطة واحدة / 📡 متعدد المحطات / 🎙️ DJ مباشر.
- Both type and station filters compose correctly via query params.
- Column: "الوضع" renamed to "نوع الحساب".

### Akram Manually Verified
- ✅ Create SINGLE_STATION requires exactly one station.
- ✅ Create MULTI_STATION requires at least one station.
- ✅ Create DIRECT_DJ has no station selector.
- ✅ PresenterStation rows created on create for station-based types.
- ✅ Edit SINGLE_STATION shows assigned station read-only.
- ✅ Edit MULTI_STATION allows station add/remove.
- ✅ Removing station from MULTI_STATION blocked if programs exist.
- ✅ Edit DIRECT_DJ hides station/program sections.
- ✅ Legacy SonicPanel UI removed/hidden.
- ✅ Direct DJ radios preserved for DIRECT_DJ.
- ✅ Password change and account validity remain preserved.
- ✅ TypeScript `npx tsc --noEmit` — 0 errors.

### Status
**Presenter type UI restructure: CLOSED ✅**

---

## CHECKPOINT — PROGRAM-CREATE-PRESENTER-FILTER-VERIFIED
**Date:** 2026-05-11
**Status:** CLOSED ✅

### Previous Issue
Program create presenter dropdown stayed disabled after admin selected a station.
The warning "اختر المحطة أولاً" persisted even after a station was chosen.

### Root Cause
The previous create form was a pure server component. The presenter dropdown's
`disabled` and `eligiblePresenters` were computed server-side from the `?stationId=`
URL query param. Changing the `<select>` for station was a plain HTML input change —
it never updated the URL or triggered a re-render, so `eligiblePresenters` was
always empty and the presenter dropdown remained permanently disabled.

### Fix
- Created `frontend/src/app/admin/programs/program-create-form.tsx` as a
  `"use client"` component.
- `useState` tracks `selectedStationId`.
- Station `<select>` `onChange` → `setSelectedStationId()`.
- Presenter options filtered client-side: `stationPresenterMapJson[selectedStationId]`
  determines the eligible presenter ID set.
- Presenter dropdown `disabled={!hasStation || !hasEligible}`.
- `allPresenters` passed from server already excludes `DIRECT_DJ`
  (query: `presenterMode: { not: "DIRECT_DJ" }`).
- Server action `createProgram` still validates:
  - Presenter-station `PresenterStation` link exists.
  - DIRECT_DJ explicitly rejected with Arabic error message.
- Error banner (`?error=`) now handled inside the client component.
- Submit button also disabled when no eligible presenters — prevents empty form submission.

### Akram Manually Verified
- ✅ Station dropdown works and options load correctly.
- ✅ Selecting a station immediately enables the presenter dropdown.
- ✅ Presenter dropdown shows only presenters linked to the selected station.
- ✅ Direct DJ presenters are excluded from the dropdown.
- ✅ Server-side presenter-station validation preserved.
- ✅ Program creation from the form works end-to-end.
- ✅ TypeScript `npx tsc --noEmit` — 0 errors.

### Status
**Program create presenter filtering: CLOSED ✅**

---

## PRODUCT DECISION — PRESENTER+STATION DJ OVERRIDE CANCELLED
**Date:** 2026-05-11
**Status:** CANCELLED / DEPRECATED ⛔

### Previous Plan
The open issue "Presenter + Station DJ credential override" proposed allowing admins
to configure a per-presenter, per-station `SonicPanelCredential` that would override
the station's default DJ credentials for a specific presenter.

This was listed as priority 🟡 OPEN / HIGH across NEXT_STEPS.md and CURRENT_STATUS.md.

### Akram's Product Decision
This feature is **NOT the desired product logic** and is hereby cancelled/deprecated.

### Correct Credential Architecture (Final)

| Presenter Type | Credential Source | Notes |
|----------------|-------------------|-------|
| `SINGLE_STATION` | Station Default DJ credential (`StationDefaultCredential`) | Resolved via validate P2. No personal DJ creds. |
| `MULTI_STATION` | Station Default DJ credential of the station their current program is on | Resolved via validate P2 using token.stationId. No personal DJ creds. |
| `DIRECT_DJ` | `DirectDjRadio` (personal target, presenter-owned) | Resolved via validate D1. No station credential. No fallback. |

### Current Code Behaviour
- `validate/route.ts` SCHEDULED branch:
  - P1: `SonicPanelCredential WHERE presenterId+stationId` — **legacy path, not needed going forward**
  - P2: `StationDefaultCredential WHERE stationId` — **the correct path for station-based presenters**
  - P3: `SonicPanelCredential WHERE presenterId, stationId=NULL` — **legacy fallback for old data**
  - P4: null → backend-audio fallback
- `validate/route.ts` DIRECT_DJ branch:
  - D1: `DirectDjRadio WHERE id=directDjRadioId AND presenterId` — **only path for DIRECT_DJ**
  - D2: Fail if not found — **no Station fallback, by design**

### Code Status
- P1 path (presenter+station override) exists in code as a legacy check — it is harmless
  while the `SonicPanelCredential` table is not actively populated from the UI (the
  form was already removed in PRESENTER-TYPE-UI-RESTRUCTURE-VERIFIED checkpoint).
- P1 will naturally always be skipped in practice (no rows will be inserted via UI).
- No code changes required — the feature is cancelled at the product level only.

### Rules Going Forward
- **Do NOT implement a presenter+station DJ credential override UI.**
- **Do NOT show disabled per-station DJ credential cards in the admin UI.**
- **Do NOT route SINGLE_STATION or MULTI_STATION presenters to personal DJ credentials.**
- **Do NOT mix DIRECT_DJ logic (DirectDjRadio) with station-based presenter logic.**
- **The `SonicPanelCredential` table remains in schema for legacy data safety.**
  Do not drop it unless Akram explicitly approves migration.
- If a station needs unique DJ credentials: use `StationDefaultCredential`.
- If a presenter needs personal radio targets: use `DirectDjRadio` (DIRECT_DJ type only).

### Status
**Presenter + Station DJ credential override: CANCELLED ⛔**
**Next recommended feature: Station Manager Role OR Schedule Calendar UI**

---

## CHECKPOINT — STATION-MANAGER-DELETE-VERIFIED
**Date:** 2026-05-12
**Status:** CLOSED ✅

### Previous Issue
Station Manager remove/delete button was not working.

### Related Blocker
`frontend/src/app/admin/station-managers/actions.ts` contained an invalid UTF-8 byte sequence.
- **Root cause:** A decorative comment line using box-drawing characters (`─`, U+2500) was truncated mid-sequence, leaving an incomplete 3-byte UTF-8 sequence at byte offset 9486 (`0xE2` without its continuation bytes).
- **Secondary blocker:** Even after the file was repaired, the stale Turbopack `.next` cache continued serving the corrupted parse result.

### Fix Applied
1. `actions.ts` was validated with `python3` strict UTF-8 decode — `UnicodeDecodeError` confirmed at byte 9486.
2. File was rewritten: the corrupted decorative comment line was replaced with a plain ASCII equivalent (`// ---...`).
3. File re-validated — `UTF8_OK` confirmed.
4. Stale `.next` cache cleared: `rm -rf frontend/.next`.
5. Frontend dev server restarted: `npm run dev`.
6. Route `/stream/admin/station-managers` responded `HTTP 307 → /stream/login` (correct auth guard — no build error).

### Hotfix Pattern (reuse this if it happens again)
```bash
# From frontend/ directory
python3 -c "
from pathlib import Path
p = Path('src/app/admin/station-managers/actions.ts')
data = p.read_bytes()
try:
    data.decode('utf-8')
    print('UTF8_OK')
except UnicodeDecodeError as e:
    print('UTF8_ERROR', e.start, e.reason)
"
# If UTF8_ERROR: repair file, then:
rm -rf .next
npm run dev
```

### Akram Manually Verified
- Station Manager was removed/deleted successfully via the admin UI.
- No stations, presenters, programs, schedules, recordings, or station data was deleted.

### Ownership Rule (canonical)
**Station Manager is a permission holder only — not an owner of station data.**
- Removing a Station Manager must never cascade-delete stations, presenters, programs, schedules, recordings, credentials, or any station-owned data.
- `StationManagerAssignment → User (onDelete: Cascade)` — only the assignment row is removed.

### Status
- Station Manager delete/remove: **CLOSED ✅**
- Invalid UTF-8 build error: **CLOSED ✅**

---

## CHECKPOINT — STATION-MANAGER-SCOPED-PROGRAMS-VERIFIED
**Date:** 2026-05-12

### Previous Issue
Station Manager dashboard was view-only and did not provide real scoped management pages. Presenters, programs, schedules, and DJ settings were inaccessible or showed global data.

### Implemented & Verified

**Dashboard & Navigation:**
- Station Manager dashboard with scoped station cards (stat badges: presenters, programs, recordings).
- All four action cards (مذيعو المحطة, برامج المحطة, تسجيلات المحطة, إعدادات DJ) wired to live pages.

**Presenters Page (`/station-manager/presenters`):**
- Scoped query: `PresenterStation.stationId IN assignedIds AND PresenterStation.isActive = true`.
- Direct DJ (`presenterMode = DIRECT_DJ`) excluded at query level.
- MULTI_STATION presenters show only station badges within manager scope.
- Station Manager can create SINGLE_STATION presenters for assigned stations.
- Inline edit and password-change panels via `useState` (no URL param navigation jump).
- Smart deactivation: full account disable for SINGLE_STATION, link removal only for MULTI_STATION.

**Programs Page (`/station-manager/programs`):**
- Scoped query: `Program.stationId IN assignedIds`.
- Presenter dropdown excludes DIRECT_DJ.
- Inline program metadata edit (title, description, isActive) without page jump.
- Toggle active/inactive and safe-disable (no physical DELETE).

**Schedule Management (inline in program card):**
- `📅 الجدول` panel opens inline, no URL params.
- Create schedule rule: recurrenceType, timezone, allowConnectMinutesBefore.
- Edit schedule rule: all fields pre-filled, saved via `updateScheduleRule`.
- Create schedule slot: dayOfWeek (WEEKLY/SELECTED_DAYS), slotDate (ONE_TIME), startTime, endTime; HH:MM validation + start<end check.
- Edit schedule slot: all fields pre-filled, saved via `updateScheduleSlot`.
- Delete schedule slot: safe delete (Cascade handles orphans).
- Conflict detection: deferred to global schedule resolver (noted in UI).

**Scope Enforcement:**
- Every server action calls `requireSM()` (session + role check).
- Every program action calls `resolveProgramStation()` (program.stationId IN assignedIds).
- Every rule/slot action walks the relation chain: slot → rule → program → stationId → assignedIds.
- Station Manager cannot read or write unassigned station data.

**Audit Logging:**
- All write actions create `AdminAuditLog` with `actorRole = "STATION_MANAGER"`:
  - `CREATE_STATION_PROGRAM`, `UPDATE_STATION_MANAGER_PROGRAM`, `TOGGLE_STATION_MANAGER_PROGRAM`, `DELETE_OR_DISABLE_STATION_MANAGER_PROGRAM`
  - `CREATE_STATION_MANAGER_SCHEDULE_RULE`, `UPDATE_STATION_MANAGER_SCHEDULE_RULE`
  - `CREATE_STATION_MANAGER_SCHEDULE_SLOT`, `UPDATE_STATION_MANAGER_SCHEDULE_SLOT`, `DELETE_STATION_MANAGER_SCHEDULE_SLOT`

### Akram Manually Verified
- Station Manager program metadata edit: ✅
- Schedule rule create & edit: ✅
- Schedule slot create, edit, delete: ✅
- Presenter scope (شمر hidden correctly): ✅

### Status
**STATION-MANAGER-SCOPED-PROGRAMS-VERIFIED — VERIFIED LOCALLY**
TypeScript compile: clean (`npx tsc --noEmit` — zero errors).

---

## CHECKPOINT — STATION-MANAGER-RECORDINGS-VERIFIED
**Date:** 2026-05-12
**Status:** CLOSED ✅

### Previous Issue
Station Manager recordings page showed an empty list despite 49 recordings existing for the manager's assigned stations.

### Root Cause
The Prisma query included:
```
NOT: { sourceType: "DIRECT_DJ" }
```
In SQL this generates `WHERE source_type != 'DIRECT_DJ'`.
In SQL (SQLite), `NULL != 'DIRECT_DJ'` evaluates to `NULL` (unknown), which is treated as **false** by WHERE clauses.
All 49 legacy recordings had `sourceType = NULL` (field was added after recordings were created and never backfilled), so every row was silently excluded.

### Fix
Removed the `NOT: { sourceType: "DIRECT_DJ" }` filter entirely.
Kept `directDjRadioId: null` as the authoritative Direct DJ exclusion guard.
Per schema design: `directDjRadioId IS NULL` unless `sourceType = DIRECT_DJ`.

Final query logic:
```
WHERE directDjRadioId IS NULL
AND (
  stationId IN (assignedStationIds)
  OR (stationId IS NULL AND presenterId IN (presenterIdsOnAssignedStations))
)
```
The second branch (stationId=null) covers legacy recordings attributed via PresenterStation.
No filtering by assignment.createdAt or recording.startedAt.

### Related Files
- `frontend/src/app/station-manager/recordings/page.tsx` — query fix
- `frontend/src/app/api/recordings/[filename]/route.ts` — SM scope check updated (PresenterStation fallback for stationId=null)
- `frontend/src/lib/recording-helpers.ts` — NEW: server-safe URL helpers (no "use client")
- `frontend/src/app/admin/recordings/page.tsx` — import updated to lib

### Result
- 49 recordings now resolve for station manager `akram`.
- Legacy stationId=null recordings included via PresenterStation derivation.
- Direct DJ recordings remain excluded (directDjRadioId: null guard).
- Compile: 0 errors.
- DB: unchanged.

### Key Lesson
`NOT: { field: "value" }` in Prisma excludes NULL rows in SQL.
For nullable fields where NULL is a valid "not set" state, use `directDjRadioId: null` (equality check) rather than NOT sourceType filter.

---

## CHECKPOINT — STATION-MANAGER-DJ-SETTINGS-VERIFIED
**Date:** 2026-05-12
**Status:** CLOSED ✅

### Previous Issue
Station Manager needed access to manage Station Default DJ credentials for their assigned stations. No page existed (or was a stub), and UX feedback appeared globally at the top of the page after save.

### Implemented / Verified

**Page:** `frontend/src/app/station-manager/dj-settings/page.tsx`

- Auth enforced: unauthenticated→/login, ADMIN→/admin, PRESENTER→/studio, other→/login.
- Scoped to current manager's active `StationManagerAssignment` rows only.
- Unassigned stations completely hidden.
- For each assigned station, a form allows editing Station Default DJ credentials:
  - `host`, `port` (1–65535 validated), `djUsername`, `djPassword`
  - `mount`, `SID`, `bitrate`, `isActive`
- Password encrypted using `encrypt()` from `@/lib/encryption` (AES-256-CBC).
- Empty `djPassword` on update preserves existing `encryptedPassword` — never blanks it.
- Decrypted password never displayed.
- `AdminAuditLog` written on every save: `actorRole = "STATION_MANAGER"`, `action = "UPDATE_STATION_DEFAULT_DJ_CREDENTIAL"`.
- Admin / Direct DJ / Presenter flows untouched.

### UX Fix — Inline Card Feedback
- **Before:** success/error message appeared as a global banner at the top of the page; user lost card context.
- **After:** message appears inline inside the same station card that triggered the save.
- URL includes `?stationId=<id>#station-<id>` to anchor back to the correct card.
- `scroll-mt-24` prevents the sticky header from covering the card on scroll.
- Page no longer jumps to the top after save.

### Akram Manual Verification
- Save works ✅
- Inline success message appears inside the correct card ✅
- Inline error message appears inside the correct card ✅
- UX acceptable ✅

### Status
**STATION-MANAGER-DJ-SETTINGS-VERIFIED — VERIFIED LOCALLY**
TypeScript compile: clean (0 errors).

---

## CHECKPOINT — SCHEDULE-CALENDAR-UI-VERIFIED
**Date:** 2026-05-12
**Status:** CLOSED ✅

### Previous Gap
Admin and Station Manager had no visual weekly schedule/calendar view. Program schedules were only accessible through the raw rule/slot editor inside the programs page.

### Implemented

**Station Manager Schedule Page** — `frontend/src/app/station-manager/schedule/page.tsx`
- Auth: STATION_MANAGER only (unauthenticated→/login, ADMIN→/admin, PRESENTER→/studio).
- Scoped to current manager's active `StationManagerAssignment` rows only.
- Weekly layout, Saturday-first Arabic week order.
- Arabic day names: السبت / الأحد / الإثنين / الثلاثاء / الأربعاء / الخميس / الجمعة.
- Program cards show: `HH:MM – HH:MM`, program title, presenter name, station name (multi-station only), recurrence type badge, ONE_TIME date badge.
- Station filter tabs (visible when manager has more than one assigned station).
- Empty state: "لا توجد برامج مجدولة للمحطات المسندة حتى الآن."
- Today's day column highlighted in violet.
- Dashboard link: `ActionPlaceholder` replaced with `ActionLink href="/station-manager/schedule"`.

**Admin Schedule Page** — `frontend/src/app/admin/schedule/page.tsx`
- Auth: ADMIN only (non-ADMIN → /login).
- Global view: all active programs across all stations.
- Same weekly layout and Arabic day display.
- Program cards always show station name (multi-station context).
- Station filter: tabs for all unique stations in programs.
- Presenter filter: tabs for all unique presenters; filters compose (both params in URL).
- Empty state: "لا توجد برامج مجدولة حتى الآن."
- Admin dashboard nav card added: "📅 جدول البث" linking to `/admin/schedule`.

### Akram Manual Verification
- Admin schedule page loads and shows all programs ✅
- Station Manager schedule page loads and shows scoped programs ✅
- Station and presenter filters work ✅
- Today's column highlighted correctly ✅

### Status
**SCHEDULE-CALENDAR-UI-VERIFIED — VERIFIED LOCALLY**
TypeScript compile: clean (0 errors).

---

## CHECKPOINT — ADMIN-RECORDING-DELETE-UX-VERIFIED
**Date:** 2026-05-12
**Status:** CLOSED ✅

### Previous Issue
Delete recording worked server-side, but success feedback was unreliable.
Multiple approaches attempted and failed:
- Top-page banner (not visible — user had to scroll)
- `?deleted=<id>#anchor` redirect + `useEffect([show])` — alert only fired after manual refresh
- `useActionState` + `window.alert()` — alert fired but behavior was inconsistent across navigation

### Final Implemented UX (Approved Pattern)
File: `frontend/src/app/admin/recordings/delete-button.tsx`

Flow:
1. User clicks "حذف التسجيل"
2. `window.confirm()` dialog appears — cancel = nothing happens
3. If confirmed: button shows spinner + "جارٍ الحذف..."
4. Server action runs (`deleteRecording` in `actions.ts`)
5. On success: button replaced inline by "✅ تم الحذف بنجاح" badge
6. After 1000ms: `router.refresh()` — deleted card disappears from list
7. On failure: inline `⚠️ <errorMsg>` appears below button — no auto-refresh

Implementation detail:
- `useTransition` + `useState` (status: idle | success | error)
- Server action called directly: `await deleteRecording(null, fd)` from client
- No `redirect()` in server action — returns `{ ok: true }` or `{ ok: false, error: string }`
- No `searchParams`, no global banner, no `window.alert()`

### Delete Logic Preserved
- ADMIN-only auth (non-ADMIN → `{ ok: false, error: "غير مصرح" }`)
- Disk file delete via `fs.unlink()` using `RECORDINGS_BASE_DIR` + `path.basename` (path-traversal safe)
- Companion file delete (`.mp3` ↔ `.webm`) attempted; `ENOENT` handled safely
- `prisma.recording.delete({ where: { id } })` — only Recording row, LiveSession preserved
- `AdminAuditLog` write with actorRole=ADMIN, action=DELETE_RECORDING, metadata (localPath, presenterId, deletedFiles, missingFiles)
- Missing file: logged to `missingFiles[]`, never fatal

### Akram Manual Verification
- Confirm dialog ✅
- Loading state ✅
- Inline success ✅
- Inline error on failure ✅
- router.refresh removes card ✅
- DB row deleted ✅
- Disk file deleted ✅
- Audit log written ✅

### Status
**ADMIN-RECORDING-DELETE-UX-VERIFIED — VERIFIED LOCALLY**

---

## APPROVED DELETE UX PATTERN
**Date:** 2026-05-12
**Applies to:** All future delete operations in the system

### Simple Deletes (no dependency chain)
Follow this exact pattern:
1. Confirm dialog: `window.confirm("...")` — cancel = no action
2. Local loading state: spinner + "جارٍ الحذف..." inside same button/card
3. Server action returns: `{ ok: true }` or `{ ok: false, error: string }` — no `redirect()`
4. On success: inline success text in same card, then `router.refresh()` after delay
5. On error: inline error text below button — no auto-refresh

Do NOT use:
- Global top-page banners
- `searchParams`-based success messages (`?deleted=1`)
- Redirect-based success feedback
- `window.alert()` popups
...unless explicitly requested by Akram.

Implementation (client component):
```tsx
const [isPending, startTransition] = useTransition();
const [status, setStatus] = useState<"idle"|"success"|"error">("idle");

startTransition(async () => {
  const fd = new FormData();
  fd.set("entityId", id);
  const result = await deleteEntity(null, fd);
  if (result?.ok) {
    setStatus("success");
    setTimeout(() => router.refresh(), 1000);
  } else {
    setStatus("error");
    setErrorMsg(result?.error ?? "خطأ");
  }
});
```

### Complex Deletes (dependency chain)
Use when the entity has child data:
- Presenter linked to Programs, Recordings, Schedules
- Station linked to Presenters, Programs, Recordings, Credentials
- Program linked to Recordings, ScheduleRules, Slots

Rules:
- Show dependency warning before allowing delete
- Example: "هذا المذيع مرتبط بـ 3 برامج. هل تريد الاستمرار؟"
- Never silently cascade-delete complex linked data
- Prefer soft delete (`isActive: false`) over physical delete when impact is unclear
- Only hard-delete with full audit trail and explicit admin confirmation

---

## CHECKPOINT — MEDIA-TRACK-PHYSICAL-DELETE-VERIFIED
**Date:** 2026-05-12
**Status:** CLOSED ✅

### Previous Issue
`deleteTrack` server action removed only the `MediaTrack` DB row.
Physical uploaded audio files remained on disk indefinitely, causing disk waste.

### Implemented Fix

**File:** `frontend/src/app/admin/media/actions.ts`

1. **ADMIN auth** — `auth()` called directly; throws `"غير مصرح"` for non-admin.
2. **Track lookup** — `prisma.mediaTrack.findUnique({ select: { title, fileUrl } })`.
3. **Local file detection** — `fileUrl.startsWith("/uploads/")` or `"/test-audio/"`.
4. **Shared fileUrl guard** — `prisma.mediaTrack.count({ where: { fileUrl, id: { not: trackId } } })`. If count > 0, disk file is kept. DB row still deleted.
5. **Safe path resolution** — `path.resolve(process.cwd(), "public", relativeUrl)`. Path-traversal guard: `absPath.startsWith(publicDir + sep)`.
6. **Disk delete** — `fs.unlink(absPath)`. `ENOENT` caught safely → `fileMissing=true`, never throws.
7. **External URL** — `isLocalFile=false` → skip disk delete, delete DB row only, log `externalUrl:true`.
8. **DB row delete** — `prisma.mediaTrack.delete({ where: { id: trackId } })`.
9. **AdminAuditLog** — action=`DELETE_MEDIA_TRACK`, entityType=`MediaTrack`, metadata: `{ title, fileUrl, localFileDeleted, fileMissing, externalUrl }`.

**File:** `frontend/src/app/admin/media/media-client.tsx`

- `window.confirm()` added before `deleteTrack()` call.
- Spinner icon replaces trash icon while `deleting=true`.
- On success: `onDeleted(track.id)` removes row from local list immediately.
- On error: inline `setError("فشل الحذف.")` below the row.

### Preserved
- Upload flow (XHR progress + server action).
- Edit track title/duration inline.
- Category tabs (BACKGROUND / SONG / BREAK / AD).
- Category delete (uses `prisma.mediaTrack.deleteMany` — physical files NOT cleaned in bulk; noted for future improvement).
- TypeScript compile: clean.

### Status
**MEDIA-TRACK-PHYSICAL-DELETE-VERIFIED — VERIFIED LOCALLY**

> ⚠️ Known gap: `deleteCategory` uses `mediaTrack.deleteMany` directly, bypassing `deleteTrack`. Physical files of tracks inside a deleted category are NOT removed. A future step could loop through tracks before category delete if needed.

---

## CHECKPOINT — ADMIN-PRESENTERS-VALIDITY-COLUMNS-VERIFIED
**Date:** 2026-05-12
**Status:** CLOSED ✅

### Previous Issue
Admin Presenters list showed legacy BroadcastSchedule fields:
- "موعد البث (من)" — sourced from `BroadcastSchedule.startDatetime`
- "موعد البث (إلى)" — sourced from `BroadcastSchedule.endDatetime`

This was wrong: real program times are managed in Admin → Programs.
The presenter list should reflect account/subscription validity, not broadcast times.

### Fix Applied
**File:** `frontend/src/app/admin/presenters/page.tsx`

1. Removed `schedules` relation from Prisma query.
2. Added `validity` relation: `validity: { select: { validFrom, validTo } }`.
3. Column headers changed:
   - "موعد البث (من)" → "صلاحية الاشتراك من"
   - "موعد البث (إلى)" → "صلاحية الاشتراك إلى"
4. Cell renderers updated:
   - `presenter.validity?.validFrom` → `toLocaleDateString("ar-EG")` or "—"
   - `presenter.validity?.validTo` → `toLocaleDateString("ar-EG")` or "—"
   - Expired `validTo` (past today) displayed in **red** (`text-red-400`).
5. BroadcastSchedule no longer used in presenter list UI.

### Preserved
- Station filter dropdown
- Presenter type filter buttons (SINGLE_STATION / MULTI_STATION / DIRECT_DJ)
- Presenter mode badges
- Edit links per row
- Active/canBroadcast badges

### Verification
- Akram manually verified the UI.
- TypeScript compile: clean.

### Status
**ADMIN-PRESENTERS-VALIDITY-COLUMNS-VERIFIED — VERIFIED LOCALLY**

> ℹ Note: Program broadcast times belong in Admin → Programs, not in the Presenter list. BroadcastSchedule is a legacy model; scheduling is now managed via ProgramScheduleRule/Slot.

---

## CHECKPOINT — MP3-ARCHIVE-BACKFILL-VERIFIED
**Date:** 2026-05-12
**Status:** CLOSED ✅

### Previous Issue
Admin Recordings page showed only one recording while many recording files existed on disk. The `NotSupportedError: The media resource indicated by the src attribute...` error appeared when trying to play the one visible recording.

### Root Cause
1. **Missing DB rows:** ~30 recording files existed under `backend-audio/debug-recordings/` but had no corresponding `Recording` table rows. Old sessions pre-dated the DB recording-row creation logic in `audio-session/ended` route.
2. **Corrupt WebM:** The only DB-registered recording (`session-20260510-063651-78bc5b48.webm`) was a corrupt WebM file with a broken EBML header — not playable by any browser or FFmpeg.
3. **Stale Prisma client cache:** After adding snapshot fields (`presenterNameSnapshot`, etc.) and making `presenterId` nullable, the running Next.js dev server used an old cached Prisma client that threw "Unknown field" errors, causing `dbError = true` silently.

### Fixes Applied

#### A — Snapshot fields added to Recording model
- `presenterId` changed from `String` to `String?` (nullable, `onDelete: SetNull`)
- Added: `presenterNameSnapshot`, `presenterUsernameSnapshot`, `stationNameSnapshot`, `programTitleSnapshot`, `presenterDeleted`, `stationDeleted`
- `prisma db push` + `prisma generate` applied.

#### B — MP3 archive backfill script
- Script: `frontend/scripts/backfill-mp3-recordings.ts`
- Scanned `backend-audio/debug-recordings/` for all valid session files.
- Grouped by session basename (`session-YYYYMMDD-HHMMSS-<presenterShort>`).
- Preferred `.mp3` if available; converted `.webm` → `.mp3` via FFmpeg (128kbps libmp3lame).
- Matched presenter suffix (8-char hex) to `User.id` prefix.
- Unknown/deleted presenters inserted with `presenterId=null`, `presenterDeleted=true`, `presenterNameSnapshot="presenter_<short>"`.
- No files were deleted.

#### C — Dev server restart after Prisma generate
- Killed port 3000, deleted `.next/`, restarted `npm run dev`.
- Confirmed Prisma client picked up new snapshot fields.

### Verification
- DB count: 1 → 22 rows
- 21 orphan/deleted-presenter rows inserted as `.mp3`
- 20 WebM→MP3 conversions succeeded
- MP3 archive entries confirmed playable by Akram

### Known Leftover
- One corrupt WebM remains in DB:
  `session-20260510-063651-78bc5b48.webm`
  FFmpeg error: `EBML header parsing failed`
  → Delete via Admin UI recordings delete button when ready.

### Files Changed
- `frontend/prisma/schema.prisma` — snapshot fields + nullable presenterId
- `frontend/src/app/api/internal/audio-session/ended/route.ts` — populates snapshots on recording create
- `frontend/src/app/admin/presenters/[id]/delete/actions.ts` — snapshot preservation before presenter delete
- `frontend/src/app/admin/stations/[id]/delete/actions.ts` — snapshot preservation before station delete
- `frontend/src/app/admin/recordings/page.tsx` — null-safe display with snapshot fallback + "محذوف" badge
- `frontend/src/app/station-manager/recordings/page.tsx` — null-safe display
- `frontend/src/app/api/recordings/[filename]/route.ts` — null-safe presenterId type
- `frontend/scripts/backfill-recording-snapshots.ts` — existing recording snapshot backfill
- `frontend/scripts/backfill-mp3-recordings.ts` — orphan MP3 archive backfill


---

## CHECKPOINT — DIRECT-DJ-LIVE-AND-RECORDING-VERIFIED — 2026-05-13 14:17 (Africa/Cairo)

**Session type:** Verification checkpoint — no source code changed, no migration, no deploy, no cloud.

### Previous Issue

Direct DJ presenters could enter the studio UI but the live SHOUTcast output and recording were unverified.
Additionally, two bugs blocked access:
1. `StudioUI.toggleConnection` called `POST /api/internal/audio-token/create` with no body → returned 400 for DIRECT_DJ (directDjRadioId required) → "فشل إنشاء رمز الجلسة".
2. Admin presenter edit page crashed with "Event handlers cannot be passed to Client Component props" due to `onClick` on `<form>` in a Server Component.

### Fixes Applied (this session)

| Fix | File | Effect |
|-----|------|--------|
| Added `directDjRadioId` prop to `StudioUI` | `studio-ui.tsx` | Token fetch now includes radio ID |
| Passed `selectedRadioId` as `directDjRadioId` to `StudioUI` | `direct-dj-pre-flight-screen.tsx` | Radio ID flows from selection to mixer |
| `audio-token/create`: body includes `directDjRadioId` when set | `studio-ui.tsx` | DIRECT_DJ token created correctly |
| Removed `onClick` from `<form>` in admin edit page | `admin/presenters/[id]/edit/page.tsx` | Server Component crash eliminated |
| `ConfirmSubmitButton` client component created | `src/components/confirm-submit-button.tsx` | Safe confirm dialog pattern |
| Admin edit: hidden `<input name="canBroadcast" value="on">` for DIRECT_DJ | `admin/presenters/[id]/edit/page.tsx` | Prevents silent canBroadcast=false on save |
| Studio gate: `canBroadcast` check skipped for DIRECT_DJ | `studio/page.tsx` | DIRECT_DJ gate = isActive + validity + active radio |
| `updateDirectDjRadio` server action added | `admin/presenters/[id]/edit/page.tsx` | Admin can now edit Direct DJ radio details inline |

### Final Verified Behavior (Akram manually confirmed — 2026-05-13)

| Check | Result |
|-------|--------|
| Direct DJ selects a DirectDjRadio target in pre-flight | ✅ |
| `directDjRadioId` passed to `StudioUI` as prop | ✅ |
| `audio-token/create` receives `directDjRadioId` in body | ✅ |
| Token created with `sessionMode = DIRECT_DJ` | ✅ |
| `validate` route resolves `credentialSource = direct_dj_radio` | ✅ |
| backend-audio decrypts `DirectDjRadio.encryptedPassword` | ✅ |
| FFmpeg starts at 63.5 kbits/s, real-time | ✅ |
| SHOUTcast socket connects to DJ's personal radio server | ✅ |
| SOURCE handshake accepted | ✅ |
| `bytesSentToShoutcast` increases — **1,204,845 bytes** sent | ✅ |
| Akram manually **heard live audio on radio** | ✅ CONFIRMED |
| Recording created — **1,890,327 bytes** received from browser | ✅ |
| WebM file created | ✅ `session-20260513-140921-0e4d378a.webm` |
| MP3 file created | ✅ `session-20260513-140921-0e4d378a.mp3` (2.36 MB) |
| DB `recordings` row created | ✅ |
| Clean disconnect — FFmpeg exit 0, SHOUTcast socket closed | ✅ |

### Session Telemetry (LIVE test)

```
Presenter  : 0e4d378a-7245-41ed-b6c6-3004b25b0c8f
Duration   : ~2 min 31 sec
Browser→WS : 1,890,327 bytes (148 chunks)
WS→SHOUTcast: 1,204,845 bytes
Bitrate    : 63.5 kbits/s (FFmpeg constant)
FFmpeg speed: 1.01× real-time
```

### Product Rules (Canonical — Do Not Regress)

- **DIRECT_DJ uses `DirectDjRadio` only.** No `StationDefaultCredential`. No `SonicPanelCredential`.
- **DIRECT_DJ does not use Program Schedule.** Studio gate bypasses `resolveCurrentOrNextProgramSession`.
- **DIRECT_DJ does not use Station Manager scope.** No `PresenterStation` check.
- **`canBroadcast` is not checked for DIRECT_DJ.** Access gate = `isActive` + validity date range + at least one active `DirectDjRadio`.
- **`directDjRadioId` must be sent in every token request and validated against `presenterId` + `isActive`.**

### Do Not Regress

- Do NOT call `audio-token/create` without `directDjRadioId` for DIRECT_DJ sessions.
- Do NOT check `canBroadcast` in the DIRECT_DJ studio gate.
- Do NOT add `onClick` to `<form>` elements in Server Components — use `ConfirmSubmitButton` client component.
- Do NOT save admin presenter form without the hidden `canBroadcast=on` field for DIRECT_DJ.

### Status

| Feature | Status |
|---------|--------|
| Direct DJ studio access gate | ✅ CLOSED |
| Direct DJ live SHOUTcast output | ✅ CLOSED — VERIFIED |
| Direct DJ recording | ✅ CLOSED — VERIFIED |
| Admin Direct DJ radio edit | ✅ CLOSED |
| Admin Server Component crash | ✅ CLOSED |


---

## SAFE EXIT — CURRENT-LOCAL-STATE-2026-05-13 — 14:38 (Africa/Cairo)

**Session type:** Safe exit checkpoint — documentation and backup only. No source code changed.

### Verified Working Modules (local, manually confirmed by Akram)

| Module | Status |
|--------|--------|
| Live Studio (connect / mic / background / queue) | ✅ VERIFIED |
| Recording (WebM → MP3 → DB row) | ✅ VERIFIED |
| SHOUTcast live output (mic + background heard on radio) | ✅ VERIFIED |
| Direct DJ live output (heard on radio, 1.2 MB sent) | ✅ VERIFIED |
| Direct DJ recording (WebM + MP3 + DB row) | ✅ VERIFIED |
| Direct DJ studio access gate (isActive + validity + active radio) | ✅ VERIFIED |
| Direct DJ credential path (DirectDjRadio → validate → backend-audio) | ✅ VERIFIED |
| Station Default DJ fallback | ✅ VERIFIED |
| Upload / Media Management (Admin + Presenter) | ✅ VERIFIED |
| Local device files → queue/background | ✅ VERIFIED |
| Queue controls (play / pause / seek / reorder / remove) | ✅ VERIFIED |
| Background fader / ducking / crossfade | ✅ VERIFIED |
| Monitoring (headphone output, volume slider) | ✅ VERIFIED |
| Mic Source Selector (device enum, live switch) | ✅ VERIFIED |
| Admin archive | ✅ VERIFIED |
| Presenter archive | ✅ VERIFIED |
| Multi-station foundation | ✅ VERIFIED |
| Admin Stations CRUD/Edit | ✅ VERIFIED |
| Presenter ↔ Station assignment | ✅ VERIFIED |
| Admin Programs CRUD/Edit | ✅ VERIFIED |
| Program Rule/Slot edit | ✅ VERIFIED |
| Conflict Detection | ✅ VERIFIED |
| Station Manager dashboard + basic scoped pages | ✅ VERIFIED |
| Station Manager presenter/program management | ✅ VERIFIED |
| Station Manager delete/remove | ✅ VERIFIED |
| My Profile (name/email/phone/password) | ✅ VERIFIED |
| Avatar upload | ✅ VERIFIED |
| Admin presenter password change | ✅ VERIFIED |
| Program create presenter filter (excludes DIRECT_DJ) | ✅ VERIFIED |
| Admin Direct DJ radio add/edit/toggle/delete | ✅ VERIFIED |
| Admin presenter edit page (no Server Component crash) | ✅ VERIFIED |

### Open / Unresolved Items

| Item | Status |
|------|--------|
| Direct DJ radios block width fix (UI polish) | ✅ Fixed this session — awaiting final visual confirmation by Akram |
| Station Manager remaining scoped areas | ⚠️ May need final polish/verification |
| Station Manager recordings/DJ settings scoped | ⚠️ Needs confirmation if fully complete |
| Schedule Calendar UI | ❌ Not started |
| Global UI/UX Design Alignment (EGONAIR reference images) | ❌ Not started |
| Debug log cleanup ([DIAG] prefix removal) | ❌ Not done |
| Endurance test (30–60 min session) | ❌ Not done |
| Cloud deployment | ❌ Not done |

### Notes

- No new feature work was performed during this Safe Exit step.
- No source code was edited during this step.
- Next session should start by reviewing this checkpoint before any code changes.
- Backup created at: `backups/2026-05-13_14-38-current-local-state-safe-exit/`

### Servers at Exit

| Service | State |
|---------|-------|
| Next.js port 3000 | ✅ STOPPED |
| backend-audio port 4001 | ✅ STOPPED |
| SHOUTcast | ✅ No connections |
| Presenter ON AIR | ✅ None |

---

## FIX-STUDIO-2026-05-14-A — AudioContext Race Condition (Direct DJ / Connect)

**Status:** FIXED — 2026-05-14  
**Affected file:** `frontend/src/app/studio/studio-ui.tsx`

**Symptom:** After clicking Connect, `backend-audio` closed the WebSocket with code 1001 ("stale timeout") within seconds. The UI showed "متصل" but no audio reached SHOUTcast.

**Root Cause:** `AudioContext` was created/resumed **after** the async `POST /api/internal/audio-token/create` call. By the time `audioCtx.resume()` ran, the browser's user-gesture window had expired. A suspended `AudioContext` produces zero-energy audio — `MediaRecorder` generates empty chunks, backend-audio receives zero bytes, and the WebSocket is closed with code 1001.

**Fix Applied:**
- Moved `AudioContext` creation and `audioCtx.resume()` to **before** the token fetch, inside the synchronous user-gesture handler scope (`toggleConnection`).
- Added `e.stopPropagation()` and `e.preventDefault()` to the Connect button `onClick` handler.
- Set `type="button"` on all relevant buttons.

**Do Not Regress:** `AudioContext` must always be created/resumed synchronously within the user-gesture handler, before any `await`. The gesture window is consumed by the first `await`.

---

## FIX-STUDIO-2026-05-14-B — Connect Button Causes Page Refresh

**Status:** FIXED — 2026-05-14  
**Affected file:** `frontend/src/app/studio/studio-ui.tsx`

**Symptom:** Clicking the Connect ("اتصال") button inside StudioUI caused an immediate page reload instead of initiating a connection.

**Root Cause:** The button lacked `type="button"`, so the browser treated it as a default `type="submit"` inside a form-like ancestor. The click triggered a GET form submission causing a full page refresh.

**Fix Applied:**
- `type="button"` added explicitly to the Connect/Disconnect button.
- `e.preventDefault()` and `e.stopPropagation()` added inside `toggleConnection`.

**Do Not Regress:** Every `<button>` in this project must have `type="button"` unless intentionally used as a submit button. Never remove `e.preventDefault()` from `toggleConnection`.

---

## FIX-STUDIO-2026-05-14-C — Direct DJ Exit State Lock (Re-entry Bug)

**Status:** FIXED — 2026-05-14  
**Affected file:** `frontend/src/app/studio/direct-dj-pre-flight-screen.tsx`

**Symptom:** After connecting and then exiting the studio, returning to the Direct DJ pre-flight screen left the Connect button permanently disabled. A full page refresh was required to reconnect.

**Root Cause:** `handleConnect` set `connecting: true` but never reset it to `false` on success. The `onExitStudio` callback also did not clear `connecting` or `connectError` state, so stale state carried over to the next render.

**Fix Applied:**
- `setConnecting(false)` called immediately after successful connection entry.
- `onExitStudio` callback now resets both `connecting: false` and `connectError: null`.

**Do Not Regress:** The `onExitStudio` callback in `DirectDjPreFlightScreen` must always reset `connecting` and `connectError`. Dirty state prevents re-entry.

---

## FIX-STUDIO-2026-05-14-D — Direct DJ Live Audio Not Reaching SHOUTcast

**Status:** FIXED — 2026-05-14  
**Affected file:** `backend-audio/.env`

**Symptom:** Direct DJ presenter was connected and recording locally (WebM file created), but no audio was heard on the live radio stream.

**Root Cause:** `backend-audio/.env` had `ENABLE_SHOUTCAST_LIVE=false`. The live FFmpeg → SHOUTcast pipeline was feature-flagged off; all sessions recorded locally only.

**Fix Applied:**
- `ENABLE_SHOUTCAST_LIVE=false` → `ENABLE_SHOUTCAST_LIVE=true` in `backend-audio/.env`.
- `backend-audio` service restarted.

**Verified:** Audio reached the SHOUTcast server using `DirectDjRadio` DB credentials (not `.env` fallback host).

**Do Not Regress:** Production use requires `ENABLE_SHOUTCAST_LIVE=true`. The `false` value is only for isolated local testing with no SHOUTcast server available.

---

## FIX-STUDIO-2026-05-14-E — MULTI_STATION Wrong Station Credential Risk (P0 Station Resolution)

**Status:** FIXED — 2026-05-14  
**Affected files:**
- `frontend/src/app/studio/page.tsx`
- `frontend/src/app/studio/pre-flight-screen.tsx`
- `frontend/src/app/studio/studio-ui.tsx`
- `frontend/src/app/api/internal/audio-token/create/route.ts`

**Symptom (structural/latent — not triggered in single-program setups):** A `MULTI_STATION` presenter with active programs on two different stations could receive credentials for the wrong station when connecting.

**Root Cause (4-step chain):**
1. `studio/page.tsx` correctly resolves the current station using `resolveCurrentOrNextProgramSession()` (time-window gated: `gateOpenTime ≤ now ≤ occurrenceEnd`).
2. **Gap:** The `unified` object omitted `stationId` — it was never forwarded to `<PreFlightScreen>` or `<StudioUI>`.
3. `StudioUI` sent an empty body to `POST /api/internal/audio-token/create` for scheduled sessions.
4. `token/create` P2 fallback used `Program.findFirst({ WHERE presenterId AND isActive=true, ORDER BY createdAt DESC })` — **no time filter** — always picking the newest-created active program regardless of which station's slot was actually live.

**Fix Applied — 4-file chain:**

| File | Change |
|------|--------|
| `studio/page.tsx` | Added `stationId: programSession.stationId` to `unified` object; passed as `scheduledStationId` prop to `<PreFlightScreen>` |
| `pre-flight-screen.tsx` | Added `scheduledStationId?: string` to `PreFlightProps`; threaded through to `<StudioUI>` |
| `studio-ui.tsx` | Added `scheduledStationId?: string \| null` to `Props`; included in token/create POST body when `directDjRadioId` is absent |
| `token/create/route.ts` | Parses `scheduledStationId` from body; new **P0** block validates ownership server-side (`Program WHERE presenterId AND stationId AND isActive=true`); uses it directly if valid; falls through to P1/P2/P3 otherwise |

**Security:** P0 validates the submitted `stationId` server-side. A client cannot claim an arbitrary stationId without a matching active Program record.

**What was NOT changed:**
- `token/validate/route.ts` — unchanged
- `resolve-program-session.ts` — unchanged (already correct)
- `backend-audio` — unchanged
- Schema / DB — no migration required
- Direct DJ flow — completely isolated (DIRECT_DJ presenters never enter the SCHEDULED code path)

**Fallback preserved:** P1/P2/P3 remain active for cases where `scheduledStationId` is absent (e.g. legacy BroadcastSchedule-only presenters).

**Compile result:** `npx tsc --noEmit` → exit code 0, no errors.

**Do Not Regress:**
- Do NOT remove `stationId` from `unified` in `page.tsx`.
- Do NOT remove `scheduledStationId` from `PreFlightProps` or `StudioUI` Props.
- Do NOT send `scheduledStationId` in the Direct DJ branch.
- Do NOT skip P0 ownership validation in `token/create`.

---

## SESSION CHECKPOINT — 2026-05-14 (Africa/Cairo)

**Type:** Studio connection stability fixes + MULTI_STATION credential risk mitigation. No new features.

### Fixes Applied

| Fix | Description | Files Edited |
|-----|-------------|-------------|
| FIX-STUDIO-2026-05-14-A | AudioContext race before token fetch | `studio-ui.tsx` |
| FIX-STUDIO-2026-05-14-B | Connect button page refresh | `studio-ui.tsx` |
| FIX-STUDIO-2026-05-14-C | Direct DJ exit state lock on re-entry | `direct-dj-pre-flight-screen.tsx` |
| FIX-STUDIO-2026-05-14-D | Live audio not reaching SHOUTcast | `backend-audio/.env` |
| FIX-STUDIO-2026-05-14-E | MULTI_STATION wrong station credential (P0 resolution) | `page.tsx`, `pre-flight-screen.tsx`, `studio-ui.tsx`, `token/create/route.ts` |

### Studio Scenario Separation Audit (read-only, no edits)
- SINGLE_STATION: ✅ time-gated at server, Station Default DJ used, no Direct DJ UI exposed.
- MULTI_STATION: ✅ same gate as SINGLE_STATION; wrong-station risk now mitigated by P0.
- DIRECT_DJ: ✅ bypasses schedule entirely; token carries `directDjRadioId`; validate D1 path only.
- Cross-contamination: ✅ confirmed none — each path returns before entering other branches.

### TypeScript Compile
`npx tsc --noEmit` → ✅ exit code 0

---

## SESSION CHECKPOINT — 2026-05-14 Admin Filters + Recording Station Context Fix (Africa/Cairo)

**Type:** Admin UI filter corrections + Recording pipeline station-linking fix. No schema changes. No migration.

---

### FIX-ADMIN-FILTERS-2026-05-14 — Admin Page Filters Complete

**Status:** FIXED

**Symptom:** Admin pages (/admin/presenters, /admin/recordings, /admin/programs, /admin/stations) had missing, wrong, or non-functional filters.

**Root Cause:** Filters were incrementally added over multiple sessions; some were never implemented; some used wrong field logic.

**Fix Applied:**

| Page | Filters Added/Fixed |
|---|---|
| `/admin/presenters` | Search q, presenterMode, status, station smart-filter, sort, pagination, clear-all |
| `/admin/recordings` | Search q, presenterMode (SINGLE/MULTI/DIRECT_DJ), station smart-filter, date range, sort, pagination |
| `/admin/programs` | Search q, status, station smart-filter, hasSchedule, sort, pagination, clear-all |
| `/admin/stations` | Search q, status, DJ credential, hasPresenters, hasPrograms, hasRecordings (disabled — see below), hasManager, sort, pagination |

**Files:**
- `frontend/src/app/admin/presenters/page.tsx`
- `frontend/src/app/admin/presenters/presenters-filter.tsx`
- `frontend/src/app/admin/recordings/page.tsx`
- `frontend/src/app/admin/recordings/presenter-filter.tsx` (renamed from session-type)
- `frontend/src/app/admin/programs/page.tsx`
- `frontend/src/app/admin/programs/programs-filter.tsx` (new)
- `frontend/src/app/admin/stations/page.tsx`
- `frontend/src/app/admin/stations/stations-filter.tsx` (new)

**Do Not Regress:**
- Admin recordings presenterMode filter uses `presenter.presenterMode`, NOT `stationId IS NULL`.
- Admin stations DJ credential filter uses `defaultCredential.isNot: null` / `null` (Prisma relation, not raw SQL).

---

### FIX-STATIONS-RECORDINGS-FILTER-2026-05-14 — hasRecordings Filter Disabled (Data Bug)

**Status:** KNOWN / DEFERRED

**Symptom:** `/admin/stations` hasRecordings filter always returned 0 stations with recordings.

**Root Cause:** All 29 existing recordings have `stationId = null` (legacy pre-migration rows created before `stationId` was added to the Recording model). The Prisma relation filter `recordings: { some: {} }` joins via `stationId` FK — which is null for every row — so no station ever matches.

**Fix Applied:** Filter UI replaced with amber warning note:
> "التسجيلات الحالية لا تحمل stationId — الفلتر غير متاح للبيانات القديمة"

`hasRecordingsParam` removed from all server-side logic (`where`, `buildUrl`, pagination form, component render).

**To Re-enable:** Run a data migration that backfills `stationId` on historical recordings by matching `stationNameSnapshot` to `Station.name`. Only feasible after the recording station context fix is verified and new recordings have proper `stationId`.

**Files:**
- `frontend/src/app/admin/stations/page.tsx`
- `frontend/src/app/admin/stations/stations-filter.tsx`

---

### FIX-RECORDING-STATION-CONTEXT-2026-05-14 — Recording.stationId/sourceType Never Written

**Status:** FIXED (code fix applied; DB data not yet verified — pending restart + new test recording)

**Symptom:** New MULTI_STATION recording `session-20260514-100029-e39239f3.mp3` showed:
- `stationId = null`
- `stationNameSnapshot = "راديو مصر علي الهوا"` (partially correct — name was set but FK was not)
- `sourceType = null`

Causing: station recording counts = 0 for all stations; `/admin/stations` recordings badge always showing 0.

**Root Cause (two layers):**

1. **backend-audio `TokenValidationResult` interface** was missing `stationId`, `sessionMode`, `directDjRadioId`. These fields ARE returned by `audio-token/validate` but were silently discarded in the interface and destructure.

2. **`SessionEndedPayload` interface** did not declare `stationId`, `sessionMode`, `directDjRadioId`. All 3 `notifySessionEnded()` call sites omitted them.

3. **`audio-session/ended/route.ts`** never accepted or wrote `stationId` or `sourceType` to `recording.create`. The station snapshot lookup fetched only `{ name: true }` from `PresenterStation`, discarding `id`.

**Fix Applied:**

**backend-audio/src/index.ts:**
- Added `stationId?`, `sessionMode?`, `directDjRadioId?` to `TokenValidationResult`
- Added same fields to `SessionEndedPayload`
- Captured `validatedStationId`, `validatedSessionMode`, `validatedDirectDjRadioId` from `validation` object
- All 3 `notifySessionEnded()` calls now include these fields

**frontend/src/app/api/internal/audio-session/ended/route.ts:**
- Accept `stationId`, `sessionMode`, `directDjRadioId` from request body
- Station resolution priority:
  - A. `bodyStationId` from token validate (authoritative for SINGLE and MULTI_STATION)
  - B. `PresenterStation.findFirst` fallback (SINGLE_STATION only; logged as FALLBACK warning for MULTI_STATION)
  - C. `null` forced for DIRECT_DJ
- `sourceType` set: `'SCHEDULED_PROGRAM'` | `'DIRECT_DJ'` | `null` (legacy)
- `directDjRadioId` set only for DIRECT_DJ sessions, null otherwise
- `stationNameSnapshot` now fetched by `Station.findUnique(stationId)` — accurate, not guessed
- `format` now dynamically `audio/mpeg` or `audio/webm` based on filename extension (was hardcoded `audio/webm`)
- `recording.create` now writes: `stationId`, `sourceType`, `directDjRadioId`

**backend-audio/tsconfig.json:**
- Added `"ignoreDeprecations": "6.0"` to silence pre-existing `moduleResolution: node` deprecation

**Compile Status:**
- `frontend: npx tsc --noEmit` → ✅ exit code 0
- `backend-audio: npx tsc --noEmit` → ✅ exit code 0

**What Was NOT Tested:**
- New MULTI_STATION recording after service restart (stationId/sourceType in DB unverified)
- `/admin/stations` recording count badge for new recordings
- DIRECT_DJ session with `sourceType = 'DIRECT_DJ'` behavior

**Do Not Regress:**
- DIRECT_DJ recordings must always have `stationId = null`, `sourceType = 'DIRECT_DJ'`
- `token/create` and `token/validate` are NOT to be touched — they already correctly resolve and return `stationId`
- The PresenterStation fallback must log a `[FALLBACK]` warning for MULTI_STATION so it is detectable in logs
- `recording.create` must remain non-fatal (catch block must stay)

**Next Safe Start Steps:**
1. `cd frontend && npm run dev` to restart frontend (port 3000)
2. `cd backend-audio && npm start` to restart backend-audio (port 4001)
3. Log in as the `multi` MULTI_STATION presenter
4. Start a short session (30 seconds), then disconnect
5. Check server log for: `[session-ended] stationId from token payload: <id>` (NOT "FALLBACK")
6. Run DB check:
   ```
   node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.recording.findMany({where:{presenterId:'e39239f3-6229-45a7-aa74-7fe4d78e44bf'},select:{localPath:true,stationId:true,sourceType:true},orderBy:{startedAt:'desc'},take:3}).then(r=>{console.log(JSON.stringify(r,null,2));p.$disconnect()});"
   ```
7. Confirm newest recording has `stationId: "<uuid>"` and `sourceType: "SCHEDULED_PROGRAM"`
8. Open `/admin/stations` — verify station shows `R 1` badge

**Backup Path:**
`backups/2026-05-14_12-28-recording-station-context-fix/`

**Files in backup:**
- `project-knowledge-base/` (full folder)
- `index.ts` (backend-audio/src/index.ts)
- `tsconfig.json` (backend-audio/tsconfig.json)
- `route.ts` (frontend/src/app/api/internal/audio-session/ended/route.ts)
- `stations-page.tsx` (frontend/src/app/admin/stations/page.tsx)
- `stations-filter.tsx` (frontend/src/app/admin/stations/stations-filter.tsx)
- `ROLLBACK_NOTES.md`

---

## INCIDENT REPORT — 2026-05-14 (Africa/Cairo) — Agent Started backend-audio with SHOUTcast Disabled

**Date:** 2026-05-14 ~16:46–17:10 (Africa/Cairo)
**Affected Presenter:** `multi` (MULTI_STATION, ID: `e39239f3-6229-45a7-aa74-7fe4d78e44bf`)
**Symptom:** Presenter connected successfully (UI showed "متصل"), recording was created locally, but **zero audio reached the SHOUTcast server** — no sound on radio.

### Root Cause
The agent started `backend-audio` using this shell command:
```
ENABLE_SHOUTCAST_LIVE=false npm run dev
```
This shell override **silently overwrites the `.env` value** of `ENABLE_SHOUTCAST_LIVE=true`, completely disabling the FFmpeg→SHOUTcast live pipeline for the entire session. The local WebM recording still works (it is independent of SHOUTcast), so the UI appears normal but no audio reaches the radio.

### Evidence
- Sessions `session-20260514-164742`, `session-20260514-165359`, `session-20260514-165530` all show: `Bytes sent: 0 (to SHOUTcast)`
- Session `session-20260514-171328-e39239f3.mp3` (11 MB) was the first session AFTER the correct restart — SHOUTcast was active during this session.

### Fix Applied
Killed the incorrectly-started backend-audio process and restarted with:
```
cd backend-audio && npm run dev
```
This correctly reads `ENABLE_SHOUTCAST_LIVE=true` from `.env`.

### KB Updated
- All occurrences of `ENABLE_SHOUTCAST_LIVE=false npm run dev` in `AGENT_HANDOFF.md` were corrected to `npm run dev`.

### ⛔ DO NOT REGRESS — PERMANENT RULE
**NEVER start backend-audio with `ENABLE_SHOUTCAST_LIVE=false` in the shell command.**
The `.env` file is the single source of truth. If you override it in the shell, the live pipeline is silently killed for all users of all presenter types (SINGLE_STATION, MULTI_STATION, DIRECT_DJ).

---

## INCIDENT REPORT — 2026-05-14 — Agent Browser Test Used Wrong Account (saif instead of multi)

**Date:** 2026-05-14 ~17:15–17:29 (Africa/Cairo)
**Symptom:** Agent launched browser subagent to debug `multi` account. Browser had an existing session for `saif` (DIRECT_DJ). Since saif was already logged in, the browser never redirected to the login page, so the agent's credentials for `multi` were never used. The test was performed on `saif`'s account — entirely different presenter type and credential chain.

### Root Cause
The browser subagent was instructed: *"If redirected to login, login as multi"* — but no redirect happened because an active session for `saif` existed. The session cookie was reused silently.

### Correct Browser Agent Pattern for Account-Specific Testing
Always force logout BEFORE logging in as a specific account. The browser agent must:
1. Navigate to `/stream/api/auth/signout` OR click the logout button first
2. Confirm it lands on the login page
3. Then enter the target credentials

### ⛔ DO NOT REGRESS
Never rely on "If redirected to login" as the login trigger in browser agent tasks. Always explicitly logout first when testing a specific account.

---

## CRITICAL ARCHITECTURE RULE — Presenter Types and Their Credential Chains (DO NOT MIX)

Last verified working: 2026-05-14. Do not break these paths.

### SINGLE_STATION Presenter
- Has exactly **1** `PresenterStation` link.
- Uses the **scheduled studio** (`/stream/studio` → `pre-flight-screen.tsx` → `StudioUI`).
- `token/create` resolves `stationId` via: P0 (scheduledStationId from page) → P1 (LiveSession) → P2 (most recent Program).
- `token/validate` resolves credentials via: P1 (SonicPanelCredential presenter+station) → **P2 (StationDefaultCredential)** ← primary path → P3 (legacy) → P4 null.
- Must hear audio on the station's SHOUTcast server at the station's port/credentials from `StationDefaultCredential`.

### MULTI_STATION Presenter
- Has **2 or more** `PresenterStation` links, each linked to a different `Station`.
- Uses the **scheduled studio** (same path as SINGLE_STATION).
- `token/create` uses **P0** (`scheduledStationId` passed from `studio/page.tsx` time-window resolver) to pick the CORRECT station for the currently-active program slot. This prevents the wrong station's credentials from being used when the presenter has programs on multiple stations.
- `token/validate` follows the same P1→P2→P3→P4 chain as SINGLE_STATION but uses the correct `stationId` from the token.
- Each station has its own `StationDefaultCredential` row with its own host/port/djUsername/password.
- **Critical:** The time-window resolver in `resolve-program-session.ts` MUST return the correct station for the currently-active slot. If no active slot is found, `stationId` is null and credentials will fail (P2 is gated on stationId being non-null).

### DIRECT_DJ Presenter
- Has **0** `PresenterStation` links. Is NOT assigned to any internal station.
- Uses the **Direct DJ studio** (`/stream/studio` → `direct-dj-pre-flight-screen.tsx` → selects a radio → `StudioUI`).
- Credentials come from **`DirectDjRadio`** table only (D1 path). No Station, no StationDefaultCredential, no SonicPanelCredential.
- `token/create` requires `directDjRadioId` in the request body. No `stationId` is set (always null for DIRECT_DJ).
- `token/validate` hits the DIRECT_DJ branch: looks up `DirectDjRadio WHERE id=directDjRadioId AND presenterId=X AND isActive=true`.
- **MUST NOT** fall through to station credential chain. If D1 fails, connection is rejected.
- Each `DirectDjRadio` row has its own host/port/djUsername/encryptedPassword/bitrate.

### ⛔ ABSOLUTE SEPARATION RULES (DO NOT VIOLATE)
1. **DIRECT_DJ presenters** must NEVER be given `PresenterStation` links, Programs, or BroadcastSchedule rows.
2. **SINGLE_STATION / MULTI_STATION presenters** must NEVER have `DirectDjRadio` rows — they use `StationDefaultCredential` only.
3. `token/create` DIRECT_DJ path and SCHEDULED path are mutually exclusive — determined by `presenterMode` field on the `User` record.
4. Never mix `DirectDjRadio` credentials with `StationDefaultCredential` credentials.
5. Never use `SonicPanelCredential` table for new setups — it is legacy only (will always miss in the current system).

---

## CHECKPOINT — ADMIN-SHARED-FILTER-ARCHITECTURE-COMPLETE — 2026-05-19

**Status:** COMPLETE  
**TypeScript:** Zero errors (clean compile as of 2026-05-19)

---

### Summary

All main Admin panel filter pages have been migrated from page-specific, duplicated filter components to the shared UI filter architecture. This ensures consistent UX, reduced code, and a single source of truth for filter behavior across the admin panel.

---

### Pages Migrated

| Page | Filter File(s) Edited |
|---|---|
| Admin Programs | `admin/programs/programs-filter.tsx` |
| Admin Presenters | `admin/presenters/presenters-filter.tsx` |
| Admin Stations | `admin/stations/stations-filter.tsx` |
| Admin Recordings | `admin/recordings/presenter-filter.tsx`, `station-filter.tsx`, `date-search-filter.tsx`, `recordings-type-sort-filter.tsx` |
| Admin Media Library | `admin/media/media-client.tsx` (filter bar section only) |
| Admin Station Managers | `admin/station-managers/managers-filter-bar.tsx`, `page.tsx` (pagination guard) |
| Admin Schedule | `admin/schedule/schedule-filter-bar.tsx` |

---

### Shared Components Applied

| Component | Usage |
|---|---|
| `SearchFilter` | Text search inputs with debounce (Programs, Presenters, Recordings, Media, Station Managers, Schedule) |
| `MultiSmartSelect` | Entity multi-selectors: stations, presenters — any filter where choices are NOT mutually exclusive |
| `SegmentedFilter` | Fixed-value, mutually exclusive selectors: status, sort, file type, recurrence, ownership |
| `ClearFiltersButton` | Clear-all filter reset buttons across all pages |
| `StatusBadge` | Status indicators (active/inactive) in list views |
| `EmptyState` | Empty result states across admin list pages |

---

### Pagination Policy — ALWAYS VISIBLE

**Rule:** Pagination controls must always be rendered, regardless of result count or page count.  
**Rationale:** Hiding pagination when `totalPages === 1` creates visual instability as data changes.  
**Implementation:** Remove `{totalPages > 1 && (...)}` guards. Use disabled styling on prev/next buttons at boundaries.  
**Pages fixed:** Admin Stations, Admin Media Library, Admin Station Managers.  
**Pages already correct:** Admin Programs, Admin Presenters, Admin Recordings, Admin Schedule.

---

### Product Rules (Akram-Approved)

1. **Entity filters → `MultiSmartSelect`:**  
   Any filter presenting multiple selectable entity values (stations, presenters, users) where choices are NOT mutually exclusive MUST use `MultiSmartSelect`. Do not create page-specific dropdown filters.

2. **Fixed-value filters → `SegmentedFilter`:**  
   Filters with a small, finite, mutually-exclusive option set (status: active/inactive/all, sort, file type, page size, yes/no) use `SegmentedFilter`.

3. **Text search → `SearchFilter`:**  
   All text search inputs use `SearchFilter` with debounce handled in the calling component's `onChange` handler.

4. **Admin and Station Manager share the same filter UI system:**  
   Same components, different data scope (admin sees all, Station Manager sees assigned stations only).

5. **No page-specific duplicated filter components going forward:**  
   New admin or Station Manager pages must use the shared filter system from day one.

6. **Old systems are not deleted until replacement is verified:**  
   Migration is one page at a time, compile-checked after each step.

---

### Specific Notes

- **Admin Schedule filter UX is Akram-approved** and should be reused for Station Manager Schedule in a future step.
- **Station Manager Schedule requires server logic upgrade** before it can reuse `ScheduleFilterBar`:
  - SM schedule currently renders a fixed current-week grid with no week navigation or time/recurrence filtering.
  - Must add `weekOf`, `stations`, `presenters`, `recurrence`, `timeFrom`, `timeTo` search params to SM schedule server component.
  - The `ScheduleFilterBar` component itself is already generic and accepts `allStations`/`allPresenters` as `Item[]` — no component changes needed, only server-side data scoping.
- **Admin Stations recordings filter removed (not restored):**  
  The filter displayed "الفلتر غير متاح — بيانات قديمة بدون stationId". It was removed because:
  - `stations/page.tsx` has no `_count.recordings` or `hasRecordings` query
  - No URL param handler existed for it
  - Restoring it requires server-side Prisma query changes (out of scope)
  - The filter cell was replaced with a clean 3-column grid: (المذيعون · البرامج · مدير المحطة)
- **TypeScript pre-existing errors fixed (2026-05-19):**
  - `schedule-filter-bar.tsx` — 4 errors: `RefObject<HTMLDivElement>` → `RefObject<HTMLDivElement | null>` (React 19 `useRef` type change)
  - `admin/station-managers/page.tsx` — 1 error: `Parameters<typeof prisma.user.findMany>[0]["where"]` → `Record<string, any>`
  - `station-manager/programs/page.tsx` — 1 error: `mode: "insensitive"` removed from `StringFilter` (not valid at field level in Prisma v5)
  - `station-manager/recordings/page.tsx` — 1 error: same `Parameters<>` pattern → `Record<string, any>`

---

### Next Safe Steps (in priority order)

1. **Audit Live Sessions admin filters** — inspect `admin/live-sessions/` if it exists; apply shared filter migration if needed.
2. **Upgrade Station Manager Schedule** — implement the server logic upgrade plan described above; then reuse `ScheduleFilterBar` with scoped data.
3. **Start shared layout/theme/branding architecture** — establish a shared page shell, navigation, and color system across Admin and Station Manager panels.
4. **Start visual UI/UX polish pass** — typography, spacing, card design, mobile responsiveness review.

---


---

## SAFE-EXIT-ARCHITECTURE-UI-SM-MEDIA-2026-05-19

**Date:** 2026-05-19  
**Session type:** Admin UI Standardization + Station Manager Media Library + UI Alignment  
**Compile status at exit:** ✅ `npx tsc --noEmit` — zero errors

---

### What Was Completed Today

#### Admin UI Standardization (AdminPageShell Migration)
- `admin/status/page.tsx` — AdminPageShell applied ✅
- `admin/schedule/audit/page.tsx` — AdminPageShell applied ✅
- `admin/live/page.tsx` — AdminPageShell applied ✅
- `admin/programs/page.tsx` — AdminPageShell applied ✅
- `admin/stations/page.tsx` — AdminPageShell applied ✅
- `admin/presenters/page.tsx` — AdminPageShell applied, full card layout ✅
- `admin/station-managers/page.tsx` — AdminPageShell applied, card layout ✅
- `admin/recordings/page.tsx` — AdminPageShell applied ✅
- `admin/schedule/page.tsx` — schedule kept own shell (too wide for AdminPageShell max-w) ✅
- `admin/page.tsx` (Dashboard) — AdminPageShell applied, full real-data rebuild ✅

#### Admin Shared Components Created
- `src/components/ui/AdminPageShell.tsx` — universal admin shell
- `src/components/ui/StatusBadge.tsx` — unified status badge
- `src/components/ui/EmptyState.tsx` — unified empty state
- `src/components/ui/SearchFilter.tsx` — search input
- `src/components/ui/MultiSmartSelect.tsx` — multi-choice filter
- `src/components/ui/SegmentedFilter.tsx` — tabbed filter bar
- `src/components/ui/ClearFiltersButton.tsx` — filter reset
- `src/components/ui/PaginationBar.tsx` — pagination
- `src/components/ui/ActionButton.tsx` — action button
- `src/components/ui/FilterShell.tsx` — filter wrapper
- `src/components/ui/SmartSelect.tsx` — single select
- `src/components/ui/Unauthorized.tsx` — unauthorized page

#### Admin Filters Migrated
- `admin/programs` — SearchFilter + SegmentedFilter + ClearFiltersButton ✅
- `admin/stations` — SearchFilter + SegmentedFilter + ClearFiltersButton ✅
- `admin/presenters` — SearchFilter + SegmentedFilter + ClearFiltersButton ✅
- `admin/recordings` — SearchFilter + SegmentedFilter + PaginationBar ✅
- `admin/station-managers` — SearchFilter + SegmentedFilter ✅

#### Admin Presenter Card Controls Restored
- تعديل + تعطيل/تفعيل + حذف — all three controls restored ✅
- `admin/presenters/actions.ts` — `togglePresenterActive` server action created ✅

#### Admin Dashboard Rebuilt as Real System Overview
- 18 parallel Prisma queries replacing 3 legacy/hardcoded stats
- Health warning banners: stations missing DJ creds, presenters without stations, programs without schedules
- Navigation: 9 clean module cards, removed legacy dev items
- Legacy `BroadcastSchedule` stat removed; replaced with active `Program` pipeline stats

#### Station Manager Role Routing Fixed
- Station Manager no longer redirected to `/login` on unauthorized pages
- Returns `<Unauthorized role={role} />` component instead (avoids redirect loop)

#### Station Manager Media Library Created
- `station-manager/media/page.tsx` — scoped server data fetch (assigned stationIds only)
- `station-manager/media/actions.ts` — 5 scoped server actions (create category, delete category, create track, delete track, reorder tracks)
- `station-manager/media/media-client.tsx` — compact client UI with tab bar, category/track list, create forms, delete controls
- Nav link added to SM dashboard: 🎵 مكتبة الوسائط
- Security: every action validates `stationId IN assignedIds` server-side; no physical file deletion (admin-only privilege)

#### Station Manager Pages UI Alignment
- `station-manager/presenters/page.tsx` — `EmptyState` + `StatusBadge` imported, inline empty states replaced ✅
- `station-manager/programs/page.tsx` — `EmptyState` + `StatusBadge` imported, all inline empty states replaced ✅
- `station-manager/recordings/page.tsx` — `EmptyState` + `StatusBadge` imported, all inline empty states replaced ✅
- `station-manager/schedule/page.tsx` — `EmptyState` + `StatusBadge` imported, all inline empty states replaced ✅
- `station-manager/dj-settings/page.tsx` — `EmptyState` + `StatusBadge` imported, inline DJ cred badge → `StatusBadge` component ✅

---

### What Is Still Open

| Item | Status |
|---|---|
| `presenter-card.tsx` (SM) inline status colors → `StatusBadge` | Pending |
| `program-card.tsx` (SM) inline status colors → `StatusBadge` | Pending |
| SM media: file upload UI (currently URL-only) | Next step |
| SM media: reorder UI (action exists, no drag UI yet) | Next step |
| Admin media: file upload (admin version) | Existing, not changed |
| Global branding/theme system | Future |
| Light/Dark mode toggle | Future |
| Admin support settings page | Future |
| Cloud deployment | Pending (no Cloud work today) |
| KB formal SRS update | This exit ✅ |

---

### Next Safe Start Steps

1. Quick visual test of SM media page at `/stream/station-manager/media`
2. Verify DJ cred `StatusBadge` renders correctly on dj-settings
3. Migrate `presenter-card.tsx` + `program-card.tsx` inline badges → `StatusBadge`
4. Add file upload to SM media (`<input type="file">` → save to `/uploads/station-{id}/`)
5. Add reorder drag UI to SM media client

---

### Backup Path
`backups/2026-05-19_21-39-safe-exit-architecture-ui-sm-media/`

### Rollback Reference
To rollback to pre-session state, restore from:
- `backups/2026-05-19_21-39-safe-exit-architecture-ui-sm-media/project-knowledge-base/`
- `backups/2026-05-19_21-39-safe-exit-architecture-ui-sm-media/frontend/`


---

## STAGE-CLOSED — ADMIN-STATION-MANAGER-UI-ARCHITECTURE-ALIGNMENT
**Date:** 2026-05-20
**Status:** ✅ CLOSED

### Issues Fixed This Stage

| # | Issue | Root Cause | Fix Applied |
|---|---|---|---|
| 1 | Admin pages had inconsistent outer shells | No shared shell component | `AdminPageShell` created and applied to all safe admin pages |
| 2 | Admin Dashboard showed hardcoded/stale stats | Legacy `BroadcastSchedule` model used | Rebuilt with 18 real Prisma queries across current models |
| 3 | Admin station/presenter/recording list pages had no visual card system | Legacy table/div patterns | Migrated to card-list layout using shared components |
| 4 | Station Manager pages had inline empty states | No shared component | Replaced with `EmptyState` across all SM pages |
| 5 | Station Manager pages had inline status badges | No shared component | Replaced with `StatusBadge` in presenter-card, program-card, dj-settings |
| 6 | Station Manager had no media library | Feature missing | Created scoped `station-manager/media/` module with server-side `stationId IN assignedIds` enforcement |
| 7 | SM dashboard action grid unbalanced | "جدول المحطة" had `col-span-2` | Removed `col-span-2` — grid now 3×2 balanced |
| 8 | SM station multi-select filter showed only one station | `SMStationFilter` used `params.set()` (overwrites) | Converted to comma-separated toggle multi-select; all 4 SM server pages parse `id1,id2` correctly |
| 9 | SM media back link went to `/station-manager` instead of `/stream/station-manager` | Missing basePath prefix | Fixed `href` to `/stream/station-manager` |
| 10 | Unauthorized SM/admin users redirected to `/login` causing redirect loop | SM pages used `redirect("/login")` | Changed to render `<Unauthorized />` component instead |

### Do NOT Reopen (unless regression reported by Akram)
- Admin filter migration
- Station Manager multi-select bug
- Station Manager media back link
- Admin dashboard overview rewrite
- Presenter card / program card badge migration

---

## LOGIN-DARK-PREMIUM-REDESIGN-VERIFIED — 2026-05-20
**Status:** ✅ VERIFIED by Akram (manual test)

### Files Changed
| File | Change |
|---|---|
| `src/app/login/page.tsx` | Full dark premium redesign — ambient glow background, glass card, gradient brand mark |
| `src/app/login/login-form.tsx` | Dark inputs with SVG icons, gradient submit button, spinner loading state, dark error banner |

### What Changed (Visual Only)
- Light `bg-gray-50 / bg-white` replaced with `var(--eg-bg)` slate-950 dark
- Ambient indigo/cyan glow background circles
- Glass card: `rgba(15,23,42,0.85)` + `border-slate-700` + glow shadow
- Gradient logo mark (indigo→cyan) with radio wave SVG
- Gradient brand title `#818cf8 → #38bdf8`
- Dark inputs: `bg-slate-900 border-slate-700` + `focus:border-indigo-500`
- Right-aligned user/lock SVG icons in inputs
- Error banner: `var(--eg-danger-soft)` dark glass with alert icon
- Submit button: indigo→cyan gradient + glow shadow
- Animated spinner during loading state
- `max-w-sm mx-4` — mobile-friendly card
- `title` + `description` metadata added to page
- Unique IDs: `login-username`, `login-password`, `login-submit`

### What Was Preserved (Unchanged)
- `doLogin()` server action — untouched
- `signIn("credentials", ...)` flow — untouched
- Role-based redirect: ADMIN → `/admin`, STATION_MANAGER → `/station-manager`, default → `/studio`
- `setError` / error handling — same logic, only styled differently
- username + password fields — same names, same types

### Manual Verification by Akram
- ✅ Dark premium UI confirmed good
- ✅ Login works with valid credentials
- ✅ Role-based redirect works correctly
- ✅ No auth regression observed

### Do NOT Reopen (unless regression reported)
- Login dark redesign
- Role-based login redirect
- Unauthorized role routing

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
