# Project Infrastructure Addendum — May 29, 2026

This addendum documents deployment failures, recovery procedures, and updated deployment best practices.

---

## 1. VPS Deployment Incident Report

### Date: May 29, 2026, 15:00–16:15 UTC (18:00–19:15 AST)
### Severity: **P1 — Production Down**
### Duration: ~75 minutes
### Root Cause: `git reset --hard origin/main` on production VPS

### Timeline
| Time (UTC) | Event |
|---|---|
| 15:07 | `git reset --hard origin/main` executed — replaces flat frontend with full monorepo |
| 15:10 | First build attempt fails — `prisma.config.ts` TypeScript error |
| 15:15 | tsconfig.json `exclude` array updated, rebuild attempted |
| 15:20 | Build succeeds but PM2 process crashes — `.next` directory was deleted by git reset |
| 15:27 | Rebuild on VPS, PM2 restarted — but orphan `next start` process blocks port 3000 |
| 15:30 | Import reverted to V2, rebuild — PM2 errored (81 restarts, EADDRINUSE) |
| 15:33 | Orphan process identified via `pm2 logs` — `EADDRINUSE: address already in use :::3000` |
| 15:33 | `fuser -k 3000/tcp` — orphan killed, PM2 starts clean |
| 15:35 | PM2 crashes again — old PM2 entry still referencing dead `.next` |
| 15:37 | `pm2 delete frontend` + fresh `pm2 start npm --name frontend -- start` — port conflict resolved |
| 15:39 | `git reset --hard c2f2ce1` (original commit) — restores flat structure but loses all V2 changes |
| 15:41 | Build fails — `prisma.config.ts` still present from original commit |
| 15:42 | `mv prisma.config.ts prisma.config.ts.bak` — file removed, build succeeds |
| 15:42 | Site serves original code (missing V2 layout, fonts, DSP panel, etc.) |
| 15:43 | `rsync` all source files from local → VPS — restores V2 code |
| 15:45 | `npm install && npm run build && pm2 start` — **PRODUCTION RESTORED** |

### Contributing Factors
1. No staging environment — changes deploy directly to production
2. No automated rollback mechanism
3. `git reset --hard` on a repo with different structure than local
4. Manual `npx next start` test left orphan process
5. fail2ban rate-limited SSH reconnections during recovery

---

## 2. Updated Deployment Procedure

### ✅ CORRECT: rsync-based deployment
```bash
# Step 1: Edit files locally and test with `npm run dev`

# Step 2: Rsync changed files to VPS
rsync -avz -e "ssh -o StrictHostKeyChecking=no" \
  --exclude='node_modules' --exclude='.next' --exclude='.git' \
  frontend/src/ root@195.35.48.184:/var/www/egonair/frontend/src/

# Step 3: If package.json or config files changed, sync them too
rsync -avz -e "ssh" \
  frontend/package.json frontend/tsconfig.json frontend/next.config.ts \
  root@195.35.48.184:/var/www/egonair/frontend/

# Step 4: Build and restart on VPS (single SSH session)
ssh root@195.35.48.184 "cd /var/www/egonair/frontend && \
  fuser -k 3000/tcp 2>/dev/null; \
  pm2 delete frontend 2>/dev/null; \
  npm run build && \
  pm2 start npm --name frontend -- start"

# Step 5: Verify
curl -s -o /dev/null -w 'HTTP %{http_code}' https://studio.egonair.com/login
```

### ❌ NEVER DO
| Command | Why |
|---|---|
| `git reset --hard origin/main` | Replaces flat frontend with full monorepo |
| `git pull origin main` | Creates nested `frontend/frontend/` directory |
| `npx next start &` without cleanup | Orphan process blocks port 3000 |
| Multiple rapid SSH connections | fail2ban blocks you |
| Deploy without local testing | Runtime bugs not caught by TypeScript |

---

## 3. PM2 Management Best Practices

### Clean Restart (recommended)
```bash
fuser -k 3000/tcp 2>/dev/null     # Kill any orphan process
pm2 delete frontend 2>/dev/null    # Remove stale PM2 entry
pm2 start npm --name frontend -- start  # Fresh start with 0 restart counter
```

### Check Status
```bash
pm2 status                    # Check uptime and restart count
pm2 logs frontend --lines 10  # Check for errors
```

### Emergency: Port Conflict
```bash
fuser -k 3000/tcp             # Kill whatever is on port 3000
pm2 delete frontend            # Remove stale entry
pm2 start npm --name frontend -- start  # Start fresh
```

---

## 4. fail2ban Considerations

The VPS has fail2ban configured. Rapid SSH connections (>5 in 30 seconds) will trigger a temporary ban.

### Workarounds
- Use a **single long-running SSH session** for all operations
- Add `sleep 5-10` between SSH commands in scripts
- If banned, wait 5-10 minutes before retrying
- Consider adding the deployment machine's IP to fail2ban whitelist

---

## 5. Infrastructure Diagram (Current)

```
┌──────────────────────────────────────────────────────┐
│  VPS 195.35.48.184 (Ubuntu)                          │
│                                                      │
│  ┌──────────────┐    ┌───────────────┐               │
│  │  Nginx       │    │  PostgreSQL   │               │
│  │  :80/:443    │──→│  :5432        │               │
│  │  SSL (LE)    │    │  db: egonair  │               │
│  └──────┬───────┘    └───────────────┘               │
│         │                                            │
│         ▼                                            │
│  ┌──────────────┐    ┌───────────────┐               │
│  │  PM2:frontend│    │PM2:backend    │               │
│  │  Next.js     │    │  -audio       │               │
│  │  :3000       │    │  Liquidsoap   │               │
│  │  (npm start) │    │  + Express    │               │
│  └──────────────┘    └───────────────┘               │
│                                                      │
│  Domain: studio.egonair.com                          │
│  SSL: Let's Encrypt via Certbot                      │
│  Deployment: rsync + npm run build + pm2 restart     │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  Developer Machine (macOS)                           │
│                                                      │
│  Monorepo: radio_streaming_project/                  │
│  ├── frontend/     → rsync → /var/www/egonair/       │
│  ├── backend-audio/                                  │
│  ├── mobile-app/                                     │
│  └── project-knowledge-base/                         │
│                                                      │
│  Deploy: rsync -avz frontend/src/ root@VPS:path/src/ │
└──────────────────────────────────────────────────────┘
```

---

## 6. Backup and Rollback Strategy

### File-Level Rollback
The studio maintains multiple versions:
- `studio-ui.tsx` (V1) — original
- `studio-ui-v2.tsx` (V2) — current production
- `studio-ui-v3.tsx` (V3) — future (needs testing)

To rollback: change the import in `pre-flight-screen.tsx` and `direct-dj-pre-flight-screen.tsx`, rsync, rebuild.

### VPS Recovery Procedure
If the VPS is completely broken:
1. `rsync` entire `frontend/src/` from local
2. `rsync` config files (`package.json`, `tsconfig.json`, `next.config.ts`)
3. `npm install` (if `node_modules` is damaged)
4. `npm run build`
5. `pm2 delete frontend && pm2 start npm --name frontend -- start`
