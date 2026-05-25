# backend-audio — Production Integration Plan

> **Status:** Planning only. No runtime code changes in this document.
> **Goal:** Merge the proven live SHOUTcast pipeline (`index-live-shoutcast-test.ts`) into the
> main backend-audio service (`index.ts`) on port 4001, making it the permanent production
> audio gateway for EGONAIR Remote Studio.

---

## 1. Current State Summary

| File | Role | Production-ready? |
|---|---|---|
| `src/index.ts` | Main WS server on port 4001 — saves raw WebM to disk only | ❌ No live streaming |
| `src/index-live-shoutcast-test.ts` | Proven pipeline: WebSocket → FFmpeg → SHOUTcast TCP | ✅ Proven, not integrated |
| `src/ffmpeg-pipeline.ts` | Reusable FFmpeg utility (file output only) | ⚠️ Partial — no stdout pipe |
| `src/shoutcast-smoke.ts` | Smoke tester for credentials | ✅ Utility only |

**Verified facts from live testing:**
- SHOUTcast endpoint: `radio.socialgenix.com:4896`, source path `/`, v2 HTTP handshake
- FFmpeg transcoding: WebM/Opus → MP3 at **exactly 64 kbps**, real-time speed 1.01×
- Pipeline stability: ran continuously for 87+ chunks (~1.4 MB in → ~720 KB out) with zero errors

---

## 2. Port 4001 Integration Plan

### 2.1 Merge Strategy

`src/index.ts` will be **replaced** with the production-grade service incorporating all
proven logic from `index-live-shoutcast-test.ts`.

The merged `index.ts` will:
- Listen on port **4001** (unchanged — StudioUI connects here permanently)
- On WebSocket connection: validate the presenter auth token (see §3)
- Fetch SonicPanel credentials from the Next.js backend via internal API (see §4)
- Start the FFmpeg → SHOUTcast pipeline
- Simultaneously write a local archive recording to `debug-recordings/session-*.webm`
- On disconnect: close FFmpeg stdin, flush SHOUTcast socket, finalize local recording

### 2.2 Files to Create/Modify

| Action | File | Purpose |
|---|---|---|
| **Replace** | `src/index.ts` | Merged production service |
| **Extend** | `src/ffmpeg-pipeline.ts` | Add `startFfmpegShoucastPipeline()` variant with stdout piped to TCP socket |
| **Keep** | `src/index-live-shoutcast-test.ts` | Archived test script — do not delete |
| **Keep** | All `src/shoutcast-*.ts` scripts | Utility/smoke test scripts |

---

## 3. Presenter Identity & Auth

### 3.1 Current Gap

The current WebSocket server on port 4001 has **no authentication**. Any client that connects
can stream audio. This is unsafe for production.

### 3.2 Proposed Token Handshake

The StudioUI should send a short-lived **session token** as a query parameter on WebSocket connect:

```
ws://localhost:4001/audio?token=<SESSION_TOKEN>
```

**Flow:**
1. When the presenter enters the Studio page, the Next.js server generates a short-lived signed
   token (e.g. JWT or opaque token, TTL 5 minutes) containing:
   - `presenterId`
   - `scheduleId`
   - `expiresAt`
2. The token is embedded in the Studio page (server-side rendered, not exposed via client API).
3. StudioUI uses this token when opening the WebSocket connection.
4. `backend-audio` validates the token by calling a Next.js internal API endpoint:
   `POST http://localhost:3000/api/internal/audio-token/validate`
5. If the token is valid, the connection is accepted and the session is started.
6. If the token is invalid or expired, the WebSocket is closed immediately.

### 3.3 Token Validation Endpoint (Next.js side — future)

```
POST /api/internal/audio-token/validate
Body: { token: string }
Response: { valid: boolean, presenterId, scheduleId, djCredentials: { host, port, password, djUser, sourcePath, bitrate } }
```

> **Important:** DJ credentials must **never** be sent to the browser. They travel only from
> the Next.js server to `backend-audio` over localhost, server-to-server.

---

## 4. SonicPanel Credential Loading

### 4.1 Current Gap

Credentials are currently loaded from environment variables in `backend-audio/.env`.
In production, credentials per presenter/station are stored encrypted in the Prisma database
(`frontend/prisma/schema.prisma`).

### 4.2 Proposed Flow

```
backend-audio (after token validation)
  → HTTP POST localhost:3000/api/internal/audio-token/validate
    → Next.js decrypts presenter SonicPanel credentials from DB
      → Returns { host, port, password, djUser, sourcePath, bitrate } over localhost only
        → backend-audio opens TCP connection to SHOUTcast with these credentials
          → Credentials are used in memory only, never logged in full, never sent to frontend
```

### 4.3 Credential Safety Rules

- Credentials are fetched per-session, not cached between sessions.
- The password is never logged. Only `djUser`, `host`, and `port` appear in logs.
- The `SHOUTCAST_PASSWORD` env var in `.env` is for development/smoke testing only.
- In production, `.env` credentials are overridden by the database-sourced values.

---

## 5. LiveSession Lifecycle

### 5.1 State Machine

```
[idle]
  → WebSocket connection received
    → Token validation (Next.js API)
      → If INVALID: reject WebSocket, end
      → If VALID:
        → [session_starting]
          → Fetch DJ credentials from Next.js
          → Open SHOUTcast TCP connection
          → SHOUTcast handshake
            → If FAILED: notify browser, end
            → If 200 OK:
              → [streaming]
                → FFmpeg spawned (WebM/Opus → MP3 64kbps → SHOUTcast TCP)
                → Local archive recording started (session-TIMESTAMP.webm)
                → Next.js notified: POST /api/studio/session-started { sessionId, presenterId, startedAt, localPath }
                → Mic chunks flow: browser → WS → FFmpeg → SHOUTcast
                  → [mic_off / reconnect_window]
                    → Browser closes WS
                      → FFmpeg stdin closed
                      → SHOUTcast socket closed
                      → Local recording finalized
                      → Next.js notified: POST /api/studio/session-ended { sessionId, endedAt, localPath, bytesRecorded }
                      → [idle] — ready for next connection
```

### 5.2 Stale Session Cleanup

- If no audio chunks are received for **30 seconds** while in `[streaming]` state, the pipeline
  is considered stale.
- `backend-audio` will close the SHOUTcast socket, end FFmpeg, and finalize the recording.
- Next.js will be notified with `endedAt` and the reason `stale_timeout`.
- The WebSocket is closed with code `1001` (Going Away).

### 5.3 Next.js Lifecycle Notification Endpoints (future)

| Endpoint | Called when |
|---|---|
| `POST /api/internal/session-started` | SHOUTcast handshake accepted, streaming begins |
| `POST /api/internal/session-ended` | Client disconnects or stale timeout fires |
| `POST /api/internal/session-error` | SHOUTcast rejected, FFmpeg crashed |

---

## 6. Recording Strategy

### 6.1 Dual Output

Every production session will produce **two simultaneous outputs**:

```
WebSocket chunks (WebM/Opus)
  ├── → FFmpeg stdin
  │     → FFmpeg stdout (MP3 64kbps) → SHOUTcast TCP socket (live broadcast)
  │
  └── → fs.WriteStream → debug-recordings/session-TIMESTAMP.webm (local archive)
```

- The raw WebM is saved locally as an archive copy.
- A post-session conversion job (`npm run convert:test` pattern) can produce the MP3 archive file.
- Future: cloud upload is triggered after `session-ended` notification.

### 6.2 Naming Convention

```
debug-recordings/
  session-{YYYYMMDD-HHMMSS}-{presenterId}.webm     ← raw browser audio (archive)
  session-{YYYYMMDD-HHMMSS}-{presenterId}.mp3      ← converted (post-session, optional)
```

### 6.3 64 kbps Enforcement

- FFmpeg is called with `-b:a 64k -codec:a libmp3lame` — hardcoded, not configurable.
- The `SHOUTCAST_BITRATE` env var is used only in ICY metadata headers (`icy-br`), not in FFmpeg encoding.
- `icy-br` must match the actual encoding bitrate (both `64`).

---

## 7. What Remains Out of Scope for the Next Coding Step

The following items are **explicitly excluded** from the next implementation sprint and should
not be implemented until the core integration is stable:

| Out of scope | Reason |
|---|---|
| Cloud recording upload (S3/R2/B2) | Provider not yet selected |
| Presenter recording archive UI | Requires DB schema + API first |
| Admin recording view | Depends on archive UI |
| Local device file picker | Hybrid media phase — separate scope |
| Multiple concurrent presenter streams | Single-slot SonicPanel DJ source assumed |
| Reconnection / retry logic | Implement after initial stable integration |
| StudioUI redesign or new pages | Frontend phase after backend is stable |
| Icecast support | Explicitly out of scope (see STREAMING_STRATEGY.md) |

---

## 8. Immediate Next Steps (Ordered)

1. **Extend `ffmpeg-pipeline.ts`** — add `startFfmpegShoutcastPipeline(socket, bitrate)` variant
   that pipes stdout to a TCP socket instead of a file.
2. **Rewrite `src/index.ts`** — merge production pipeline from `index-live-shoutcast-test.ts`,
   add token query param stub (accept any for now, validate later), add dual recording output.
3. **Create Next.js internal endpoint** — `POST /api/internal/audio-token/validate` with stub
   that returns hardcoded credentials from env for initial integration.
4. **Update StudioUI** — pass token in WebSocket URL, remove port override.
5. **Create Next.js lifecycle endpoints** — `session-started`, `session-ended` stubs.
6. **Verify full flow** — login → studio → mic on → live SHOUTcast → recording saved → mic off.
7. **Add stale session cleanup** — 30-second inactivity timer.

---

*Document created: 2026-04-25*
*Status: Planning only — no code changes*
*References: STREAMING_STRATEGY.md, FUTURE_REQUIREMENTS.md*
