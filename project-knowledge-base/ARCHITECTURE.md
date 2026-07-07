# EGONAIR — System Architecture

*Last updated: 2026-04-28*

---

## High-Level Overview

```
Browser (Presenter)
  │
  ├─── HTTPS / HTTP ──────────────────── Next.js App (port 3000)
  │                                       frontend/
  │                                       Next.js 15, App Router
  │                                       Tailwind CSS, RTL
  │
  └─── WebSocket ─────────────────────── backend-audio (port 4001)
                                          backend-audio/
                                          Node.js + ws library
                                          │
                                          ├── FFmpeg (child process)
                                          │    WebM/Opus → MP3 64kbps
                                          │
                                          └── SHOUTcast TCP socket
                                               radio.socialgenix.com:4896
```

---

## Service Inventory

### 1. `frontend/` — Next.js Application (port 3000)

| Detail | Value |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Auth | NextAuth v5 (credentials strategy, JWT sessions) |
| Styling | Tailwind CSS |
| Direction | RTL (Arabic UI) |
| Dev command | `npm run dev` (inside `frontend/`) |

**Key source files:**
- `src/auth.ts` — NextAuth config, Prisma singleton, session type declarations
- `src/app/layout.tsx` — Root layout
- `src/app/page.tsx` — Root page (redirects to `/login` or appropriate dashboard)
- `src/app/login/` — Login page
- `src/app/admin/` — Admin dashboard and all admin sub-pages
- `src/app/studio/` — Presenter studio and sub-components
- `src/app/api/internal/audio-token/create/` — Creates short-lived audio JWT
- `src/app/api/internal/audio-token/validate/` — Validates audio JWT (called by backend-audio)
- `src/app/api/studio/heartbeat/` — Receives mic heartbeat pings
- `src/app/api/studio/disconnect/` — Closes the active LiveSession

### 2. `backend-audio/` — WebSocket Audio Gateway (port 4001)

| Detail | Value |
|---|---|
| Language | TypeScript (compiled to JS via `ts-node` or `tsx`) |
| Entry point | `src/index.ts` |
| Protocol | WebSocket (`ws://localhost:4001/audio?token=<JWT>`) |
| Dev command | `npm run dev` (inside `backend-audio/`) |

**Key source files:**
- `src/index.ts` — Main production server (WebSocket + token auth + recording + optional SHOUTcast)
- `src/index-live-shoutcast-test.ts` — Archived standalone test script — proven pipeline
- `src/shoutcast-smoke.ts` — Credential/connection smoke tester
- `src/ffmpeg-pipeline.ts` — Reusable FFmpeg utility (file output only — stdout pipe variant not yet added)
- `PRODUCTION_INTEGRATION_PLAN.md` — Step-by-step plan for completing the production pipeline

### 3. `docker-compose.yml`

Exists at project root. Purpose: orchestrate `frontend` and `backend-audio` together.
Review before modifying any port or service name.

---


Location: `frontend/prisma/schema.prisma`

### Models

| Model | Purpose |
|---|---|
| `User` | Both admin and presenter accounts. `role` field: `ADMIN` or `PRESENTER` |
| `PresenterProfile` | Display name, avatar, notes |
| `PresenterValidity` | Date range during which a presenter account is active |
| `BroadcastSchedule` | Scheduled broadcast slots (start/end datetime, `allowConnectMinutesBefore`) |
| `SonicPanelCredential` | Encrypted DJ credentials per presenter (AES-256-GCM) |
| `MediaCategory` | Media library category (`BACKGROUND` or `SONG`) |
| `MediaTrack` | Individual audio track linked to a category |
| `LiveSession` | One record per live session — tracks state, mic state, connected/disconnected timestamps |
| `AccessLog` | Login attempt log |
| `AdminAuditLog` | Admin action log |
| `AudioTransitionSettings` | Fade and transition config |

**Fields never stored in plaintext:**
- `SonicPanelCredential.djPasswordEncrypted` — AES-256-GCM encrypted
- `SonicPanelCredential.streamPasswordEncrypted` — AES-256-GCM encrypted

---

## Authentication & Authorization

### Session Strategy
- NextAuth v5 with JWT sessions (no database sessions)
- Credentials provider (username + bcrypt password)

### Roles
| Role | Access |
|---|---|
| `ADMIN` | `/admin/*` — full management |
| `PRESENTER` | `/studio/*` — schedule-gated |

### Audio Token Flow (for WebSocket auth)
```
1. Studio page loads (server-rendered, authenticated)
2. Presenter clicks "Mic ON"
3. Browser: POST /api/internal/audio-token/create
   → Returns: { token: "<short-lived JWT>" }
4. Browser opens: ws://localhost:4001/audio?token=<JWT>
5. backend-audio: POST http://localhost:3000/api/internal/audio-token/validate
   → { token } → returns { ok, presenterId, scheduleId }
6. If ok: connection accepted, session begins
7. If not ok: WebSocket closed immediately (code 1008)
```

**Security rule:** DJ/SonicPanel credentials must NEVER be sent to the browser.
They travel only from Next.js → backend-audio over localhost.

---

## SHOUTcast / SonicPanel Integration

| Detail | Value |
|---|---|
| Target endpoint | `radio.socialgenix.com:4896` |
| Source path | `/` |
| Protocol | SHOUTcast v2 HTTP handshake (`SOURCE / HTTP/1.0`) |
| Encoding | FFmpeg: WebM/Opus → MP3 at 64 kbps (`-b:a 64k -codec:a libmp3lame`) |
| ICY metadata | `icy-br: 64`, `icy-name: EGONAIR Remote Studio` |
| Feature flag | `ENABLE_SHOUTCAST_LIVE=true` in `backend-audio/.env` |

**Verified in testing:** Pipeline ran continuously for 87+ chunks (~1.4 MB in → ~720 KB out) with zero errors.

---

## Recording Strategy

Every session produces two simultaneous outputs:

```
WebSocket audio chunks (WebM/Opus)
  ├── → FFmpeg stdin → FFmpeg stdout (MP3 64kbps) → SHOUTcast TCP (live broadcast)
  └── → fs.WriteStream → debug-recordings/session-YYYYMMDD-HHMMSS-{presenterId8}.webm (archive)
```

**Naming convention:**
```
backend-audio/debug-recordings/
  session-{YYYYMMDD-HHMMSS}-{presenterId-first8chars}.webm
```

**Cloud upload:** Not yet implemented. Provider not yet selected (AWS S3, Cloudflare R2, or Backblaze B2).

---

## Port Reference

| Port | Service |
|---|---|
| 3000 | Next.js frontend (`npm run dev`) |
| 4001 | backend-audio WebSocket server |
| 4896 | SHOUTcast server (remote, `radio.socialgenix.com`) |

---

## Environment Variables

### `frontend/.env`
| Variable | Purpose |
|---|---|
| `NEXTAUTH_SECRET` | JWT signing secret |
| `ENCRYPTION_KEY` | AES-256-GCM key for SonicPanel credential encryption |

### `backend-audio/.env`
| Variable | Purpose |
|---|---|
| `ENABLE_SHOUTCAST_LIVE` | `true` to activate FFmpeg → SHOUTcast pipeline |
| `SHOUTCAST_HOST` | SHOUTcast server hostname |
| `SHOUTCAST_PORT` | SHOUTcast server port |
| `SHOUTCAST_PASSWORD` | DJ source password (dev/smoke testing only) |
| `SHOUTCAST_DJ_USERNAME` | DJ username |
| `SHOUTCAST_SOURCE_PATH` | Mount path (e.g. `/`) |
| `SHOUTCAST_BITRATE` | Bitrate for ICY header (`64`) |

---

*Update this file whenever a new service, model, or API route is added.*
