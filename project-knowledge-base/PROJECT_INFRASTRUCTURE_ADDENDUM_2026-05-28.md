# Project Infrastructure Addendum — May 28, 2026

---

## 1. VPS Deployment Corrections

### 1.1 No fail2ban on VPS (CORRECTION)
Previous sessions assumed fail2ban was installed and actively banning IPs. **This is WRONG.**

**Verification performed:**
```bash
which fail2ban-client                    # → empty (not found)
find / -name 'fail2ban-client' -type f   # → empty (not installed anywhere)
dpkg -l | grep fail2ban                  # → no output
systemctl status fail2ban                # → unit not found
```

**Conclusion:** SSH timeouts experienced during deployment are caused by **network instability** (ISP routing, VPS provider network issues), NOT by fail2ban bans. No whitelisting is needed or possible.

**Impact:** ~30 minutes wasted across multiple sessions trying to unban IPs and configure fail2ban whitelist rules on a service that doesn't exist.

### 1.2 No Git Remote on VPS (CORRECTION)
The agent attempted to initialize a git repository and push changes to GitHub during an earlier session. **This was completely wrong.**

**Facts:**
- The VPS has NO git remote configured for deployment
- The project is NOT deployed via `git push`
- There is no GitHub Actions / CI/CD pipeline
- Deployment is 100% manual via SCP + PM2

**Correct deployment process:**
```bash
# Step 1: Upload changed files
scp -o StrictHostKeyChecking=no <local-file> root@195.35.48.184:/var/www/egonair/frontend/<path>

# Step 2: Build (REQUIRED — Next.js production mode compiles to .next/)
ssh root@195.35.48.184 "cd /var/www/egonair/frontend && npm run build"

# Step 3: Restart
ssh root@195.35.48.184 "pm2 restart frontend"

# Or combined:
ssh root@195.35.48.184 "cd /var/www/egonair/frontend && npm run build && pm2 restart frontend"
```

### 1.3 Next.js Production Mode — Build Required
**Critical rule:** Next.js production mode (`next start`) reads ONLY from the `.next/` compiled directory. Editing source files in `src/` has NO effect without running `npm run build`.

This is different from:
- `next dev` (development mode) — auto-compiles on file changes, no manual build needed
- Plain Express/Node.js servers — read source files directly at runtime

**The VPS runs production mode (`next start` via PM2) and this will NOT change.** Every code change requires: `scp` → `npm run build` → `pm2 restart`.

---

## 2. Mobile API Routes — Updated Inventory

| Route | Method | Auth | Purpose | Added |
|---|---|---|---|---|
| `/api/mobile/login` | POST | Credentials | Mobile app login | May 24 |
| `/api/mobile/stations` | GET | Bearer JWT | List available stations | May 24 |
| `/api/mobile/audio-token` | POST | Bearer JWT | Issue short-lived JWT for WebSocket | May 25 |
| `/api/mobile/recordings` | GET | Bearer JWT | List presenter's recordings (last N) | May 27 |
| `/api/mobile/recordings/play/[filename]` | GET | Bearer JWT OR `?token=` | **[NEW]** Serve MP3 recording file | May 27–28 |

### 2.1 Dual Auth on Play Route
The play route is the ONLY mobile endpoint that accepts both auth methods:
- `Authorization: Bearer <JWT>` — used by axios for download-then-play
- `?token=<JWT>` in URL — originally designed for audio players that can't send headers

All other mobile routes use Bearer JWT only.

---

## 3. Recording Files — Server Storage

### 3.1 File Locations
```bash
# Recording directory (set via RECORDINGS_BASE_DIR env var):
/var/www/egonair/backend-audio/debug-recordings/

# File naming convention:
session-{YYYYMMDD}-{HHMMSS}-{8-char-hex}.{mp3|webm}
# Example: session-20260527-161924-8d96a804.mp3
```

### 3.2 Format Handling
- **Web studio** records in `.webm` (MediaRecorder → WebM/Opus)
- **Server** stores both `.mp3` (transcoded by FFmpeg) and `.webm` (raw)
- **Mobile app** can ONLY play `.mp3` — iOS doesn't support WebM
- **Play route** automatically prefers `.mp3` over `.webm` when both exist

### 3.3 File Validation
- Files < 1KB are considered corrupt and return HTTP 404
- The play route supports HTTP Range requests for seeking (partial content, status 206)

---

## 4. SSH Connection Patterns (Best Practices)

### 4.1 Minimize Connection Count
Each SSH connection attempt increases the risk of timeout. **Batch all operations into ONE command:**
```bash
# BAD — 3 separate connections:
scp file1 root@server:/path/
ssh root@server "npm run build"
ssh root@server "pm2 restart frontend"

# GOOD — upload + build + restart in one:
scp file1 root@server:/path/ && ssh root@server "cd /var/www/egonair/frontend && npm run build && pm2 restart frontend"
```

### 4.2 Always Use Timeouts
```bash
ssh -o ConnectTimeout=10 root@195.35.48.184 "..."
scp -o ConnectTimeout=10 ...
```

### 4.3 SSH Connection Reliability
- The VPS at 195.35.48.184 has intermittent SSH connectivity issues
- Timeouts typically last 2-5 minutes, not related to any blocking software
- Retry after waiting, don't spam connection attempts

---

## 5. PM2 Process Status (Current)

| ID | Name | Port | Status | Notes |
|---|---|---|---|---|
| 0 | frontend | 3000 | online | Next.js production (`next start`) |
| 2 | backend-audio | 3001 | online | Audio WebSocket server + FFmpeg |

```bash
# Check status:
ssh root@195.35.48.184 "pm2 list"

# View logs:
ssh root@195.35.48.184 "pm2 logs frontend --lines 30 --nostream"

# Restart:
ssh root@195.35.48.184 "pm2 restart frontend"
```
