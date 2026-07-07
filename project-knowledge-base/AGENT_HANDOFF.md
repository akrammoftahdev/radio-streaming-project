# EGONAIR — Agent Handoff Document

---

## ⏸️ HISTORICAL — Cloud Deployment Phase (Completed, Now on VPS) (2026-04-30 22:50)

### Immediate Context for Next Agent Session

**HISTORICAL:** Cloud deployment was previously attempted but the project has since migrated fully to VPS deployment at studio.egonair.com.

**Cloud state (stable, do not touch):**
- [HISTORICAL] Cloud Run frontend was deployed at `https://egonair-frontend-kjvmkgy5va-ew.a.run.app/stream/login`. Now superseded by VPS at studio.egonair.com
- Cloud SQL: schema applied, admin user seeded (`admin` / `admin123`)
- Running image revision: `egonair-frontend-00003-ccj` — **does NOT include recent local fixes**
- Login on Cloud Run URL: **BROKEN** (Auth.js basePath mismatch)

**Local code state (NOT yet deployed):**
| File | Change |
|------|--------|
| `frontend/src/app/login/actions.ts` | NEW — server action `doLogin()` |
| `frontend/src/app/login/login-form.tsx` | Uses `doLogin`, no `next-auth/react` |
| `frontend/src/app/providers.tsx` | NEW — unused, on disk |
| `frontend/src/app/layout.tsx` | Plain `{children}`, no Providers |
| `frontend/Dockerfile` | `ARG SKIP_BASEPATH` added |
| `deploy/cloudrun-frontend.yaml` | `AUTH_URL`/`NEXTAUTH_URL` set to root URL (no /stream) |

**Next task (local only):**
1. `cd frontend && npm run dev`
2. `cd backend-audio && npm run dev` ← NEVER override ENABLE_SHOUTCAST_LIVE — the .env has the correct value
3. Login at `http://localhost:3000/login` → `admin` / `admin123`
4. Verify admin dashboard, presenter/studio flow, WebSocket, recordings

**After local verification passes:** FIX-022B COMPLETED.

- [x] **FIX-022B: Cloud Deployment (Frontend) blocked by Cloud SQL**
  - **Issue**: The Cloud Run frontend instance connects via TCP `postgresql://...` to `egonair-pg`. Google Cloud Run requires Unix socket connections to Cloud SQL. Furthermore, the `NEXTAUTH_URL` was hardcoded to `localhost:3000`.
  - **Fix Strategy**:
    - [x] Update database secret to Unix socket format in Google Secret Manager.
    - [x] Apply schema migrations (`prisma migrate deploy`) to Cloud SQL.
    - [x] Redeploy frontend with `NEXTAUTH_URL` updated to live domain.

**5-Minute Rule:** Every Cloud Shell task must finish within 5 minutes. If it stalls: STOP, report, do not retry.

---



*Last updated: 2026-04-30 11:55 — Cloud Run frontend LIVE. /stream/login HTTP 200. Blocked: DATABASE_URL must be corrected to Unix socket format in Secret Manager.*

---

## MANDATORY RULE: Update This File Before Ending Any Work Session

Before ending any session, the agent **must** update all four of:
- `CURRENT_STATUS.md` — reflect any new completions or regressions
- `ISSUES_AND_FIXES.md` — add any bugs found and fixed
- `NEXT_STEPS.md` — mark completed items, add new items discovered during work
- This file (`AGENT_HANDOFF.md`) — update the "Last Session Summary" and "Immediate Next Action" sections

Failure to update these files breaks continuity for the next agent.

---

## What This Project Is

**EGONAIR Remote Studio** — A web platform for remote radio broadcasting.

- **Admin** can manage presenter accounts, schedule broadcast slots, manage the media library (categories + tracks), set SonicPanel (SHOUTcast) DJ credentials per presenter, and monitor live sessions.
- **Presenters** log in, wait for their scheduled slot, enter a studio UI, open their microphone, and broadcast live via a WebSocket → FFmpeg → SHOUTcast TCP pipeline.

**Stack:** Next.js 15 (App Router) + NextAuth v5 + Prisma/PostgreSQL + Node.js WebSocket service + FFmpeg

---

## Current Project Phase

**Phase 5** — Production Deployment.
**Status:** 5.0 ✅ 5.1 ✅ 5.2 ✅ 5.4 ✅ 5.4.1 ✅ 5.5-A ✅ 5.5-B ✅ 5.5-C ✅ FULL LOGIN WORKING.
**NEXTAUTH_URL:** `https://studio.egonair.com` (previously was Cloud Run URL)
**AUTH_URL:** `https://studio.egonair.com` (previously was Cloud Run URL)
**Next:** Presenter login + studio broadcasting test.

---

## Last Session Summary

**Date:** 2026-04-30 (tenth session — build, deploy, and DB diagnosis)  
**Session type:** Full deployment day — build + deploy succeeded; DB connection blocked  
**Code changes made:**
- FIX-009: `frontend/src/lib/encryption.ts` — lazy `getKey()` (build fix)
- FIX-010: `frontend/prisma/schema.cloud.prisma` — `binaryTargets` for Alpine
- FIX-010: `frontend/Dockerfile` — `openssl` + build-time stubs

**Infrastructure changes made:**
- ✅ Frontend Docker image built successfully via Cloud Build
- ✅ `egonair-frontend` Cloud Run service deployed to `europe-west1`
- ✅ Public access enabled on Cloud Run
- ✅ `/stream/login` returns HTTP/2 200

**What is NOT working:**
- Login fails: Prisma `P1001` — cannot reach `127.0.0.1:5432`
- Root cause: `egonair-db-url` secret uses TCP format, Cloud Run needs Unix socket
- Database schema has never been applied to Cloud SQL
- No users exist in Cloud SQL yet

**No DNS changes. No VPS changes. No WordPress changes. No database migration.**

**What was done:**
- Read all 4 KB files + `cloudrun_deployment_prep.md` + `deploy/cloudrun-frontend.yaml` + `frontend/Dockerfile` + `frontend/next.config.ts` + `frontend/prisma/schema.cloud.prisma`
- Confirmed `deploy/cloudrun-frontend.yaml` is already correct (Blockers 1+2 from prior session applied)
- **Resolved FIX-007:** [HISTORICAL] `NEXT_PUBLIC_WS_URL` was corrected to the Cloud Run endpoint. Now uses VPS WebSocket endpoint.
- **Resolved FIX-008:** `deploy/cloudrun-frontend.yaml` delivery to Cloud Shell solved by uploading to GCS in Phase B1 alongside the source archive, then `gsutil cp` in Phase C. No manual file upload button needed.
- **Updated** `cloudrun_deployment_prep.md` brain artifact (this session's conversation ID: `f156b216`) with all corrected Phase A–D commands
- **No new blockers found.**

**Critical finding:**
- **Node.js v16.20.2** is installed on the VPS. **React 19 + Next.js 16 require Node 18+.** This is a BLOCKING issue.
  - `deploy/01-prepare-server.sh` installs nvm + Node.js 20 LTS automatically.
- **FFmpeg** status unknown — `command -v ffmpeg` must confirm before Group 5.4.
- **LiteSpeed** is the actual web server (not Apache, despite cPanel running Apache-compatible config).
  - WebSocket proxy config for LiteSpeed is different from Apache `mod_proxy_wstunnel`.
  - Will use LiteSpeed `.htaccess` `RewriteRule [P]` or cPanel Includes.
- **SSL**: No Let's Encrypt cert found. WSS requires HTTPS. SSL must be set up before Group 5.5.
  - cPanel AutoSSL is the simplest path (free via Sectigo).
- **public_html/.htaccess**: Backed up as `.htaccess.pre-egonair-*.bak` in Group 5.1 script.

**What was done:**
- `nowPlayingId` state fully removed. No more `useState<string|null>(null)` for it. Zero references remain.
- `handleShuffle`: rewritten to find the first-ready SONG's category from `mediaQueue.trackId`, enqueue a random un-queued track from that category. Does NOT set any legacy state.
- `handleClearLocalFiles`: upgraded to also `setMediaQueue(prev => prev.filter(...))` removing all LOCAL_SESSION queue entries for the cleared tab. Atomic with objectUrl revocation.
- `nextSong`/`nextQueuedSong` derived vars removed (superseded by `activeSongLabel`).
- Now Playing card: row labels changed: "Now Playing" → "جاهز للتشغيل", "Queue" stays, "Background" stays. `activeSongLabel` used with conditional "ينتظر غلق المايك" suffix when song is READY_AFTER_MIC_CLOSE.
- Summary row: "قسم الأغاني" replaced with "الانتظار: N عنصر".
- Queue panel: added Admin / Presenter / Local source badges per item.
- Disclaimer: updated to "قائمة الانتظار هنا تنظّم التشغيل فقط، ولا ترسل الصوت للبث المباشر بدون Audio Engine."
- Background tab banner: "مسموح مع المايك كسياسة تشغيل. المعاينة داخل المتصفح فقط وليست على البث المباشر."
- Local background file cards: per-file "⚠ معاينة فقط" label added.
- `index-live-shoutcast-test.ts`: NOT modified. No SHOUTcast. No credentials. Zero new TS errors.

**What was done:**
- 4.0 Verification: All 4.1–4.3 items confirmed correct.
- 4.4: Session-scoped local file picker in studio. MIME validation. Object URL lifecycle (create/revoke on remove/clear/unmount). Green-accented "من جهازي" sections in all 4 tabs. Preview audio player. No upload. No DB.
- 4.5: Admin media UI supports BREAK and AD in addition to BACKGROUND/SONG. 4-tab admin media client with per-type colors and info banners. `actions.ts` updated with VALID_TYPES and explicit ownerType:ADMIN.
- TypeScript: zero new errors (same 3 pre-existing).
- `index-live-shoutcast-test.ts` NOT modified.

**What was done:**
- 4.1: Recording API now supports `Range: bytes=N-M` requests → 206 Partial Content. Audio seek works.
- 4.2: Admin recordings page supports `?presenterId=<id>` filter. Server-side. Filter bar with per-presenter links. Empty state per filter. Quick-filter button per card.
- 4.3: `MediaCategory` schema extended with `ownerType` (ADMIN/PRESENTER) and `ownerId`. DB pushed + Prisma Client regenerated. Studio page fetches BACKGROUND/SONG/BREAK/AD × ADMIN/PRESENTER split. StudioUI has 4-tab media panel (خلفية / أغاني / فواصل / إعلانات). Each tab shows admin-shared and presenter-personal sections clearly separated. Playback policy banners per tab. BREAK/AD tabs show "قريباً" badges — no fake playback wired.
- TypeScript: zero new errors (same 3 pre-existing).
- `index-live-shoutcast-test.ts` NOT modified. No Icecast. No credentials exposed.

**What was done:**
- Read all 4 required knowledge base files before starting
- Read `admin/page.tsx` in full — noted design tokens (`bg-slate-800/900`, emoji + title + subtitle nav card pattern)
- Read `admin/live/page.tsx` in full — noted `bg-neutral-950 text-neutral-100` pattern for data pages, presenter relation `include: { presenter: { select: { name, username } } }`, ADMIN auth guard pattern
- Created `admin/recordings/page.tsx` as `async` Server Component:
  - `force-dynamic`, metadata title `"أرشيف التسجيلات - الإدارة - EGONAIR"`
  - Auth: ADMIN-only, `redirect("/login")` for all others
  - DB: `prisma.recording.findMany({ orderBy: { startedAt: "desc" }, select: { ..., presenter: { select: { name, username } } } })`
  - `try/catch` → Arabic error state on DB failure
  - Empty state: music note icon + Arabic message
  - Per-recording card: presenter badge (name + @username), Arabic date/time/duration/size, filename badge (with title tooltip), `<audio controls preload="none">`, تحميل button (`?download=1`), فتح في نافذة جديدة button
  - Header: gradient heading, recording count pill, لوحة التحكم back link
  - Same helper functions as presenter page: `formatArabicDate`, `formatArabicTime`, `formatDuration`, `formatBytes`
- Modified `admin/page.tsx`: added new nav card for `/admin/recordings` after the status card, amber hover accent, consistent emoji + subtitle pattern
- **TypeScript check:** zero errors in both files
- **Test: unauthenticated `/admin/recordings`** → HTTP 307 → `/login` ✅
- **Test: admin login → `/admin/recordings`** → page loads ✅ | recordings with presenter info shown ✅ | audio player ✅ | تحميل button → `?download=1` ✅ | لوحة التحكم link ✅
- **Test: `/admin` dashboard** → "أرشيف التسجيلات" nav card visible ✅
- **Screenshot confirmed:** admin dashboard with recordings card + recordings page with presenter badges, audio players, RTL layout ✅

---

## System State Right Now

| Component | State |
|---|---|
| Admin Dashboard stat cards | ✅ Complete | Real DB values: activePresenters, todaysShows, currentlyLive. AutoDJ hardcoded آغير مفعّل. Verified 2026-04-28: 3/1/0. |
| Presenter studio UI | ✅ Fully functional (visual state only for audio) |
| Audio token flow | ✅ Implemented and working |
| Duplicate session guard | ✅ Implemented and working |
| Local WebM recording | ✅ Always active when mic is on |
| Live SHOUTcast pipeline | ✅ Verified live end-to-end |
| Per-presenter DJ credentials in pipeline | ✅ Complete | `validate` returns `sonicPanel` from DB ✅; `index.ts` uses it for handshake + FFmpeg bitrate ✅ |
| Session lifecycle notifications | ✅ Fully wired | Next.js endpoints ✅ + backend-audio wired at all 5 call sites ✅ |
| 30s stale session watchdog | ✅ Complete | 15-second watchdog implemented and verified: stale_timeout ✅ normal disconnect ✅ duplicate guard intact ✅ |
| Recording Prisma model | ✅ Complete | `Recording` model in DB (`recordings` table). 14 fields. `localPath` is relative filename. `cloudUrl` nullable/reserved. All back-relations working. |
| Recording persistence on session end | ✅ Complete | `ended/route.ts` creates `Recording` row after closing `LiveSession`. Non-fatal. basename-only path. Accepts `recordingPath` or `localPath`. Verified 2026-04-28. |
| Recording file serving API | ✅ Complete | `GET /api/recordings/[filename]` — auth-gated, ownership-checked, path-traversal-safe. `RECORDINGS_BASE_DIR` in `.env`. `?download=1` supported. |
| Presenter recording archive | ✅ Complete | `/studio/recordings` page. Arabic RTL dark. Audio player + download link per recording. Empty state. Archive link in wait-screen. Verified 2026-04-28. |
| Admin recording archive | ✅ Complete | `/admin/recordings` page. ADMIN-only. All presenters' recordings with presenter badge. Audio player + download. Nav card added to `/admin`. Verified 2026-04-28. |
| Hybrid media (local device files) | ❌ Not yet |

---

## Immediate Next Action

> **HISTORICAL (Cloud Run era):** The following gcloud commands were used during the Cloud Run deployment phase. The project now deploys to VPS at 195.35.48.184.
>
> Previously required checking: `gcloud config list`, account: `akrammoftahyt@gmail.com`

### Step FIX-011 — Correct `egonair-db-url` secret (Unix socket format)

This is a **Secret Manager update only**. No code change, no rebuild, no new Docker image.

```bash
# Step 1: Read DB password into variable (NEVER print it)
DB_PASS=$(gcloud secrets versions access latest \
  --secret=egonair-db-password \
  --project=egonair-stream-prod 2>&1) \
  && echo "[OK] DB_PASS loaded"

# Step 2: Write new DATABASE_URL with Unix socket (NEVER print the URL)
printf 'postgresql://egonair_app:%s@/egonair?host=/cloudsql/egonair-stream-prod:europe-west1:egonair-pg' \
  "$DB_PASS" \
  | gcloud secrets versions add egonair-db-url \
    --data-file=- \
    --project=egonair-stream-prod \
  && echo "[OK] egonair-db-url updated"

# Step 3: Force Cloud Run to pick up the new secret
gcloud run services update egonair-frontend \
  --project=egonair-stream-prod \
  --region=europe-west1 \
  && echo "[OK] Cloud Run updated"

# Step 4: Test (wait 15 seconds first)
sleep 15 && curl -sI https://egonair-frontend-kjvmkgy5va-ew.a.run.app/stream/login | head -5
```

**After FIX-011 succeeds → next step is:**
Run `prisma migrate deploy` against Cloud SQL via Cloud Shell to apply schema.

**After migrate deploy → next step is:**
Seed admin user via `prisma db seed` or one SQL INSERT.

**After seed → next step is:**
Test login at `https://egonair-frontend-kjvmkgy5va-ew.a.run.app/stream/login`

### Commands NOT to run without explicit approval
- `prisma migrate deploy` (applies schema to production DB — irreversible)
- `prisma db seed` (creates admin user)
- Any DNS change
- Any VPS/WordPress change
- Any backend-audio deployment

---

## Current GCP Infrastructure State (2026-04-29)

| Resource | Status |
|---|---|
| Cloud SQL `egonair-pg` | ✅ RUNNABLE — PostgreSQL 15, db-f1-micro, europe-west1 |
| Cloud SQL DB `egonair` + User `egonair_app` | ✅ Exist |
| Artifact Registry `egonair` | ✅ Docker, europe-west1 |
| GCS Bucket `egonair-recordings` | ✅ Exists |
| Service Account `egonair-frontend` | ✅ IAM roles granted |
| Secret Manager (7 secrets) | ✅ All real values set |
| `deploy/cloudrun-frontend.yaml` (local) | ✅ 2 critical fixes applied |
| Docker image | ❌ Not built |
| Cloud Run service | ❌ Not deployed |
| Database migration | ❌ Not started |
| DNS / egonair-backend-audio-729286791857.europe-west1.run.app | ❌ DEPRECATED (Violates Diamond Rule) |
| VPS / WordPress | ✅ Untouched |

---

## Safe Start Instructions for Tomorrow

1. Read this file first — mandatory
2. Read `cloudrun_deployment_prep.md` (brain artifact) — full Phase commands
3. **Resolve FIX-007 with user** — ask which `NEXT_PUBLIC_WS_URL` to use. Do not assume.
4. **Resolve FIX-008** — upload `deploy/cloudrun-frontend.yaml` to Cloud Shell before Phase C
5. Do not build Docker image until WS URL is approved by user
6. Do not run Phase C until YAML is confirmed in Cloud Shell
7. Do not migrate database — requires explicit approval
8. Do not change DNS — blocked until Cloud Run temp URL tests pass
9. Do not touch VPS, WordPress, public_html — hard rules, no exceptions

---

## Previously documented (preserved for reference)

**Group 5.5-B vhost confirmed + proxy config prepared.**

**Confirmed vhost facts:**
- [HISTORICAL] Primary domain was `egonair-frontend-729286791857.europe-west1.run.app` on old VPS. Current domain: `studio.egonair.com`
- [HISTORICAL] SSL vhost and ServerAlias were configured for the Cloud Run domain. Now using studio.egonair.com.

**Proxy config artifact:** `group_55b_proxy_commands.md`

>
> **Include file target paths (root required):**
> ```
> ```
>
> **Root commands sequence (WHM Terminal):**
> 3. Write proxy `.conf` file (see artifact)
> 4. `httpd -t` — must say `Syntax OK` before proceeding
> 5. `/usr/local/cpanel/bin/whmapi1 build_apache_conf`
> 6. `/usr/sbin/httpd -k graceful`
> 7. `curl -I https://egonair-frontend-729286791857.europe-west1.run.app/stream/login` — expect HTTP 200/307

**Rollback:** Delete the `.conf` file + rebuild + graceful reload.

**Port verification (from `ss -tlnp`):**
```
LISTEN 127.0.0.1:4001   ← backend-audio (localhost only) ✓
LISTEN 127.0.0.1:3000   ← egonair-frontend (localhost only) ✓
```
**Non-localhost binding on :4001: NOT FOUND ✓**

**Files changed in Group 5.4.1:**
- `backend-audio/src/index.ts`:
  - `WS_PORT = 4001` → `parseInt(process.env.PORT ?? '4001', 10)`
  - Added `const WS_HOST = process.env.HOST ?? '127.0.0.1'`
  - `server.listen(WS_PORT)` → `server.listen(WS_PORT, WS_HOST, ...)`
  - Banner now shows `ws://127.0.0.1:4001/audio`
- `deploy/backend-audio.env.production`: added `HOST=127.0.0.1` and `PORT=4001`
- VPS `backend-audio/.env`: patched with `PORT=4001` (HOST defaults from code)

**PM2 state after 5.4.1:**
- `egonair-audio` ID=2 (re-created fresh), 0 restarts, online ✓
- `egonair-frontend` ID=0, online ✓
- PM2 dump saved.

**PM2 process state:**
- `egonair-frontend` ID=0, PID=920245, port 3000 (127.0.0.1 only), 0 restarts ✅
- `egonair-audio` ID=1, PID=907642, port 4001 (* all interfaces), 0 restarts ✅

**Internal HTTP tests passed:**
- `GET http://127.0.0.1:3000/stream/login` → `200 OK` ✅
- `GET http://127.0.0.1:3000/stream` → `200 OK` ✅
- `TCP 127.0.0.1:4001` → OPEN ✅

**backend-audio startup log:**
```
EGONAIR Backend Audio Service
Listening on ws://localhost:4001/audio
Token validation: http://localhost:3000/api/internal/audio-token/validate
SHOUTcast live: ENABLED
```

**Fixes applied in Group 5.4:**
- Added `AUTH_TRUST_HOST=true` to frontend `.env` (next-auth v5 UntrustedHost fix)
- [HISTORICAL] AUTH_URL was set to Cloud Run URL. Now: `AUTH_URL=https://studio.egonair.com`
- `deploy/frontend.env.production` template updated with both vars
- `ecosystem.config.js` updated to use absolute release paths (avoids symlink race)

**⚠️ Note: PM2 `restart` does NOT reload .env by default.**
- For env changes: `pm2 delete egonair-frontend && pm2 start ecosystem.config.js --only egonair-frontend`
- For code changes: same delete+start pattern after updating symlink

**Next step: Group 5.5 — Configure LiteSpeed proxy.**

**SSL must be active first:**
- [HISTORICAL] SSL was verified against Cloud Run URL. Now: `https://studio.egonair.com`
- If not: enable cPanel AutoSSL (Manage SSL → Run AutoSSL)
- `wss://` will NOT work without HTTPS

**LiteSpeed proxy config targets:**
- `/stream` → `http://127.0.0.1:3000/stream` (frontend)
- `/stream-ws` → `ws://127.0.0.1:4001` (WebSocket upgrade)

**Critical facts:**
- [HISTORICAL] Node 20: `source ~/.nvm/nvm.sh && nvm use 20`
- Frontend port: 3000 (127.0.0.1 only)
- Backend-audio port: 4001 (all interfaces — must be firewalled)
- Secrets in place on VPS; not logged here

---

## Critical Facts to Know Before Touching Any Code

1. **Do not touch `src/index-live-shoutcast-test.ts`** — This is an archived proof-of-concept.
   Keep it. Do not delete or modify it.

2. **Do not implement Icecast.** See `STREAMING_STRATEGY.md`. SHOUTcast only.

3. **Do not add features from `FUTURE_REQUIREMENTS.md`** until Group 1 of `NEXT_STEPS.md` is complete.

4. **Next.js 15 async params pattern** — Any `[id]` route must use `await params`. See `DECISIONS.md D-011`.

5. **DJ credentials must never reach the browser.** They travel only from Next.js → backend-audio
   via the internal validate endpoint over localhost.

6. **SHOUTcast handshake is sensitive.** See `ISSUES_AND_FIXES.md FIX-003` for the exact format.
   Do not change line endings or HTTP version.


---

## File Reference

```
project-knowledge-base/
  README.md                  ← Mandatory reading rules
  CURRENT_STATUS.md          ← Feature completion matrix + limitations
  ARCHITECTURE.md            ← Services, schema, auth, ports, env vars
  DECISIONS.md               ← Why things are built this way
  ISSUES_AND_FIXES.md        ← Bug log — what was found and fixed
  NEXT_STEPS.md              ← Ordered backlog
  AGENT_HANDOFF.md           ← This file — last session + immediate action

STREAMING_STRATEGY.md        ← SHOUTcast-only decision (root)
FUTURE_REQUIREMENTS.md       ← Recording archive + hybrid media plan (root)
backend-audio/
  PRODUCTION_INTEGRATION_PLAN.md  ← Audio pipeline merge plan
```

---

*This file must be updated at the end of every work session.*

---

## 🟢 Safe Exit Record — 2026-04-28 16:55 (Africa/Cairo)

**Date/time:** 2026-04-28 at 16:55 local (UTC+3)  
**Session type:** Safe exit + full backup  
**Backup folder:** `backups/2026-04-28_16-55-safe-exit/`

### Last Completed Work
- **Item 3.5** — Admin Recording Archive page (`/admin/recordings`)
- **Item 3.4** — Presenter Recording Archive page (`/studio/recordings`)
- **Item 3.6** — Recording file serving API (`GET /api/recordings/[filename]`)
- **GROUP 3 IS FULLY COMPLETE** (items 3.2–3.6 all done on 2026-04-28)

### Exact Files Changed in Last Session (3.5)
| File | Change |
|---|---|
| `frontend/src/app/admin/recordings/page.tsx` | **CREATED** — ADMIN recording archive page |
| `frontend/src/app/admin/page.tsx` | **MODIFIED** — added recordings nav card |

### Process State at Exit
| Service | State |
|---|---|
| Next.js port 3000 | ✅ STOPPED |
| backend-audio port 4001 | ✅ Already stopped |
| SHOUTcast port 4896 | ✅ No connections |
| Presenter ON AIR | ✅ None |

### Project Completion Estimate
- Core MVP: ~70% complete
- Groups 1–3: 100% complete
- Groups 4–5 (hybrid media + production hardening): not started

### Known Limitations at Exit
1. Audio seek does not work (no HTTP Range support in serving API)
2. Admin recordings page has no presenter filter yet
3. Studio media (background/songs) is visual only — no real audio mixing
4. SHOUTcast pipeline is feature-flagged (`ENABLE_SHOUTCAST_LIVE`)
5. `RECORDINGS_BASE_DIR` is a relative path in `.env` — must be absolute in production
6. No cloud upload implemented (deferred)

### Safe Start Instructions for Next Agent
1. Read this file (`AGENT_HANDOFF.md`) first — mandatory
2. Check `backups/2026-04-28_16-55-safe-exit/BACKUP_MANIFEST.md`
3. Start frontend: `cd frontend && npm run dev`
4. Start backend-audio: `cd backend-audio && npm run dev` ← **ALWAYS use this exact command. NEVER add ENABLE_SHOUTCAST_LIVE=false or any other override. The .env already has the correct value.**
5. NEVER expose SonicPanel/DJ credentials to browser or logs
6. Verify `RECORDINGS_BASE_DIR` in `frontend/.env` before testing archive playback
7. After any `prisma db push`: run `npx prisma generate` and restart Next.js dev server

---

## HANDOFF NOTE — SCHEDULE CONFLICT DETECTION — 2026-05-11 07:08 (Africa/Cairo)

- Schedule Conflict Detection for `ProgramScheduleSlot` is **implemented and verified**.
- Detection is **server-side only**, in `frontend/src/app/admin/programs/[id]/edit/actions.ts`.
- Helpers: `hasTimeOverlap`, `daysOverlap`, `checkSlotConflicts` — all private (not exported).
- Covers: same station + same presenter + DAILY/WEEKLY/SELECTED_DAYS/ONE_TIME recurrence.

### ⚠ CRITICAL: Error Delivery Pattern for Admin Server Actions
**Do NOT use raw `throw new Error(...)` for user-facing validation in Next.js server actions.**
- Unhandled errors in server actions propagate to the error boundary → white Runtime Error page.
- **Correct pattern:** wrap in `try/catch`, then `redirect(...?slotError=<encoded>)`.
- `slotError` is read from `searchParams` in `page.tsx` and shown as an inline red banner.
- This same pattern should be applied to any future admin form validation that produces user-visible errors.

### Backup Reference
`backups/2026-05-11_07-08-schedule-conflict-detection-verified/`

---

## ⛔ CRITICAL PRODUCT RULE — Added 2026-05-11

### DO NOT BUILD: Presenter+Station DJ Credential Override

**This was previously listed as a planned feature. It is now CANCELLED.**

The correct credential architecture is:
- `SINGLE_STATION` and `MULTI_STATION` presenters use `StationDefaultCredential`.
  They do NOT have personal DJ credentials. Do NOT add a per-presenter UI for this.
- `DIRECT_DJ` presenters use `DirectDjRadio` targets (personal, presenter-owned).
  They do NOT use station credentials. Do NOT mix these two paths.

### Forbidden Actions (do not implement without explicit Akram approval):
1. Do NOT build a Presenter + Station DJ credential override UI.
2. Do NOT show disabled or placeholder per-station DJ credential cards in admin.
3. Do NOT route SINGLE_STATION or MULTI_STATION presenters to personal DJ credentials.
4. Do NOT allow DIRECT_DJ presenters to be assigned to internal programs/schedules.
5. Do NOT mix DirectDjRadio logic with StationDefaultCredential logic.
6. Do NOT drop the `SonicPanelCredential` table — it holds legacy data.
7. Do NOT add presenter+station SonicPanelCredential rows from any new UI.

### Current Working Credential Chain (do not break):
- `POST /api/internal/audio-token/validate` SCHEDULED path:
  P1 → presenter+station SonicPanelCredential (legacy, will always miss in new system)
  P2 → StationDefaultCredential ← **primary path**
  P3 → legacy presenter-wide SonicPanelCredential (stationId=null)
  P4 → null (backend-audio handles gracefully)
- `POST /api/internal/audio-token/validate` DIRECT_DJ path:
  D1 → DirectDjRadio ← **only path**
  D2 → fail (no Station fallback, by design)

---

## ⛔ MANDATORY SAFE START PROCEDURE — Updated 2026-05-14 (NEVER SKIP)

This section supersedes all previous safe start instructions. Follow it exactly every time.

### Step 1 — Start Frontend
```bash
cd frontend && npm run dev
```
Wait until you see: `✓ Ready on http://localhost:3000`

### Step 2 — Start backend-audio
```bash
cd backend-audio && npm run dev
```
Wait until you see ALL of these lines in the output:
```
EGONAIR Backend Audio Service
Listening on ws://127.0.0.1:4001/audio
SHOUTcast live: ENABLED
```

⛔ **IF YOU SEE `SHOUTcast live: DISABLED` — STOP. DO NOT CONTINUE. Kill the process and restart.**
⛔ **NEVER run `ENABLE_SHOUTCAST_LIVE=false npm run dev` — this kills ALL live broadcasts for ALL users.**
⛔ **NEVER pass any `ENABLE_SHOUTCAST_LIVE` override in the shell command. The `.env` is the only source of truth.**

### Step 3 — Verify Credential Routing Before Testing

| Presenter type | Where credentials come from | What to check |
|---|---|---|
| SINGLE_STATION | `StationDefaultCredential` for their 1 station | Station has an active `StationDefaultCredential` row |
| MULTI_STATION | `StationDefaultCredential` for the station whose program slot is currently active | Correct station resolved by time-window; active program slot exists right now |
| DIRECT_DJ | `DirectDjRadio` record owned by the presenter | Presenter has at least 1 active `DirectDjRadio` row |

### Step 4 — Browser Agent Testing Rules

When using the browser agent to test a specific presenter account:
1. **Always navigate to `/stream/api/auth/signout` FIRST** — do not assume no session is active
2. Confirm the browser lands on the login page before entering credentials
3. Only then enter the target account credentials

**NEVER use "If redirected to login" as the only trigger** — if a different account is already logged in, there will be no redirect and the wrong account will be tested silently.

### Known Active Credentials in DB (2026-05-14)

| Station | Host | Port | DJ Username | Table |
|---|---|---|---|---|
| راديو مصر علي الهوا (egonair) | radio.socialgenix.com | 4896 | egonair | StationDefaultCredential ✅ |
| شمر (shammar) | radio.socialgenix.com | 4898 | shammar | StationDefaultCredential ✅ |

`multi` presenter (MULTI_STATION) has active programs on BOTH stations:
- Program "تجربة مهمه جدا" → station 4896 (egonair) — slot 10:00–13:00 daily
- Program "تجربة مالتي ٢" → station 4898 (shammar) — slots 13:00–14:00 and 16:40–18:00 daily

The time-window resolver picks the correct station based on which slot is active right now. This is the P0 path in `token/create`. Do not break this.


---

## Handoff Note — 2026-05-20

### Stage Closed: ADMIN-STATION-MANAGER-UI-ARCHITECTURE-ALIGNMENT

#### What Was Done
A complete UI architecture alignment was performed across Admin and Station Manager pages.

**Shared components created/used:**
- `AdminPageShell` — unified outer shell for all admin pages
- `EmptyState` — standardized "no data" component
- `StatusBadge` — variants: `neutral | success | warning | danger | info`
- `SMStationFilter` — multi-select station filter (comma-separated URL param)
- `SMPresenterFilter`, `SMSearchBar` — SM-specific filter components
- `Unauthorized` — role guard component (prevents redirect loops)

**Admin pages migrated:**
status, live, programs, presenters, recordings, stations, station-managers, schedule, audit, dashboard

**SM pages aligned:**
page (dashboard), presenters, programs, recordings, schedule, dj-settings, media

**SM Media Library:**
- Scoped: `WHERE stationId IN assignedStationIds` on server
- Tab navigation URL-synced (`?tab=BACKGROUND|SONG|BREAK|AD`)
- Client-side search + station filter (multi-station managers only)
- Track create/delete preserved; file upload is URL-only (real upload deferred)

**Bugs fixed:**
- SM dashboard grid: "جدول المحطة" + "مكتبة الوسائط" now in same row
- SM station multi-select: now truly multi (comma-sep toggle, `SMStationFilter` rewritten)
- SM media back link: `/station-manager` → `/stream/station-manager` (basePath fix)
- `<Unauthorized />` pattern enforced across all SM pages

#### Critical Rules for Incoming Agent
1. **`<a href>` in client components** must use `/stream/...` prefix. `<Link>` in server components does NOT.
2. **SM station filter URL param** is comma-separated: `?station=id1,id2`. Server parses with `.split(",")`.
3. **StudioUI** (`studio-ui.tsx`) is frozen. Do not touch without a separate plan.
4. **SM scope** — always `WHERE stationId IN assignedStationIds`. Never bypass.
5. **TypeScript must stay clean** — run `npx tsc --noEmit` before any safe exit.

#### Current System State
- Frontend: **running** on port 3000
- Backend-audio: **stopped** (port 4001 free)
- TypeScript: **zero errors**
- DB: **unchanged** — no schema or data changes this stage
- Last backup: `backups/2026-05-19_21-39-safe-exit-architecture-ui-sm-media/`

#### Next Stage
**Login page dark premium redesign** — visual only, no backend/auth changes.

---

## Handoff Note — 2026-05-20 (Login Redesign Verified)

### Checkpoint: LOGIN-DARK-PREMIUM-REDESIGN-VERIFIED

**Verified by:** Akram — manual browser test confirmed visual + auth working.

#### Login Page Summary
- `src/app/login/page.tsx` — dark premium shell, ambient glows, glass card, gradient brand
- `src/app/login/login-form.tsx` — dark inputs with icons, gradient button, spinner, dark error banner
- `login/actions.ts` — **untouched** (auth logic frozen)

#### Critical: Do Not Touch
- `login/actions.ts` — `doLogin` + `signIn` credentials flow
- Role-based redirect inside `login-form.tsx` (`router.replace(...)`)
- `auth.ts` globally

#### Current System State
- Frontend: **running** port 3000
- Backend-audio: port 4001 free
- TypeScript: **zero errors**
- DB: unchanged
- Login: ✅ verified working

#### Two Completed + Verified Stages
1. `ADMIN-STATION-MANAGER-UI-ARCHITECTURE-ALIGNMENT` ✅
2. `LOGIN-DARK-PREMIUM-REDESIGN` ✅

#### What To Do Next
- Check if Akram has any SM regression or visual feedback
- Otherwise pick from NEXT_STEPS.md priority list

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
- [HISTORICAL] Cloud was not updated. VPS is the current production target.

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

---

## Handoff Note — 2026-05-28 (Mobile Studio Audit & Redesign)

### Checkpoint: MOBILE-STUDIO-AUDIT-REDESIGN-COMPLETE

### What Was Done
- **8-bug mobile studio audit** — found and fixed all issues
- **Schedule API migration** — `/api/mobile/schedule` now uses `resolveCurrentOrNextProgramSession()` instead of legacy `BroadcastSchedule`
- **Stations API** — added `presenterMode` field
- **Dashboard redesign** — 3 UX branches: SINGLE_STATION (auto-schedule), MULTI_STATION (dropdown), DIRECT_DJ (radio list)
- **Queue/background cascade bug** — `stopFile()` fires `onFileComplete` asynchronously via RN bridge. Added `manualStopRef` guard with 100ms async release to all 4 `stopFile()` call sites
- **VPS deployed** — API changes built and running
- **Dina's iPhone** — app built and installed (device ID: `d4053ebbfc991467b8792b87c062d4e7a5f8e8c2`)

### Critical Technical Knowledge
1. **`manualStopRef` pattern** — MUST use `setTimeout(100ms)` for release, not synchronous. Native bridge events fire on next event loop tick.
2. **Schedule resolution** — ALL schedule queries must go through `resolveCurrentOrNextProgramSession()`. Legacy `BroadcastSchedule` table is obsolete.
3. **VirtualizedList** — NEVER use FlatList inside ScrollView. Use `.map()` for lists < 50 items.
4. **Metro bundler** — must be running on port 8081 for dev builds. Phone + Mac must be on same WiFi.
5. **iOS 16.7** — `xcrun devicectl` launch fails but app installs successfully. User must manually open app.

### Current System State
- **VPS**: API deployed, frontend built, PM2 running
- **Mobile**: Latest build on Dina's iPhone
- **Metro**: Running on localhost:8081

### Open Issues (Priority Order)
1. Audio token schedule validation (`/api/mobile/audio-token/route.ts`)
2. Session-end watchdog (auto-disconnect)
3. BG ↔ Queue crossfade timing
4. Audio device selection
5. Queue crossfade (Phase 4)
6. SFX pads (Phase 5)
7. DSP filters (Phase 6)
8. Android build (Phase 7)

### Backup
`/Users/apple/Downloads/Akram_Developments/radio_streaming_project_BACKUP_2026-05-28_1909/` (12 GB)

### Files Modified This Session
| File | Change |
|------|--------|
| `frontend/src/app/api/mobile/schedule/route.ts` | Complete rewrite |
| `frontend/src/app/api/mobile/stations/route.ts` | Added presenterMode |
| `mobile-app/src/app/index.tsx` | Complete rewrite (3 branches) |
| `mobile-app/src/app/studio/[stationId].tsx` | manualStopRef guard, NO_SCHEDULE block, default fix |
| `mobile-app/src/components/studio/RecordingMiniPlayer.tsx` | FlatList → map() |
| `mobile-app/src/components/studio/WaitScreen.tsx` | allowConnect default fix |

