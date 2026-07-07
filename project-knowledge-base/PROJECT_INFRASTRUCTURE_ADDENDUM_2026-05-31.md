# Project Infrastructure Addendum (2026-05-31)

## Deployment Constraints & Fixes

### 1. Correct VPS Targeting
- **Issue:** Previous deployment attempts failed due to targeting an old IP (`194.163.143.146`) and incorrect paths.
- **Resolution:** All manual and agent-driven deployments MUST target **`root@195.35.48.184`**.
- **Root Path:** The correct web root is **`/var/www/egonair/`**. When syncing the `frontend` folder, use `rsync -arvzR` to preserve relative paths, syncing into `/var/www/egonair/`.

### 2. Build & Restart Process
- Next.js requires a full build for Server Action changes to take effect.
- **Command:** `cd /var/www/egonair/frontend && npm run build && pm2 restart all`
- **PM2 Processes:** Ensure both `frontend` and `backend-audio` are running.

### 3. File System Storage (Avatars)
- **Path:** `/var/www/egonair/frontend/public/uploads/avatars/`
- **Infrastructure Note:** Because avatars are saved to the local filesystem of the VPS, if the server is ever containerized (e.g., Docker) or horizontally scaled, these uploads will need to be migrated to an S3 bucket or external object storage to prevent data loss. For the current single-VPS setup, local storage is acceptable.
