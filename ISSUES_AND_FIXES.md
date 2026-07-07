# ISSUES AND FIXES LOG

---

## OPEN-001 — Local Auth.js basePath mismatch causing /api/auth/signin 404

**Status:** Partially resolved (env fix applied)
**Root cause:** `AUTH_URL` and `NEXTAUTH_URL` were missing from `frontend/.env`, causing Auth.js v5 to generate internal callback URLs without the `/stream` basePath prefix.

---

## CHECKPOINT: LOCAL-AUTH-ENV-FIX-CHECKPOINT

**Date:** 2026-05-01
**Action taken:** Appended the following two lines to `frontend/.env` (append-only, no source code edited):

```
AUTH_URL=http://localhost:3000/stream
NEXTAUTH_URL=http://localhost:3000/stream
```

**Verification:**
- AUTH_URL present: yes
- AUTH_URL contains /stream: yes
- NEXTAUTH_URL present: yes
- NEXTAUTH_URL contains /stream: yes
- Source code edited: no
- Build run: no
- Deploy run: no
- Secrets changed: no
- Migration/seed run: no

---

## NEXT SAFE STEP

Start the frontend locally and test `/stream/login` with credentials `admin` / `admin123`.

Command to start frontend:
```
cd frontend && npm run dev
```

Then navigate to: http://localhost:3000/stream/login

## 2026-05-31: Next.js Server Actions Form Submission Fix
- **Issue**: Form submission for 'Add Admin' and 'Edit Admin' silently failed when a file input (`<input type="file">`) was added.
- **Cause**: In Next.js App Router Server Actions, if a form contains a file input but lacks `encType="multipart/form-data"`, the React client-side polyfill crashes or fails to serialize the form, resulting in silent submission failures (no network request made).
- **Fix**: Added `encType="multipart/form-data"` to both forms in `/frontend/src/app/admin/admins/page.tsx`.
- **Secondary Issue**: 'Edit' and 'Delete' links in the admins table failed to open the side panels reliably.
- **Cause**: Using `<Link>` for query-parameter-only navigation (e.g., `?edit=123`) triggered Next.js shallow routing/caching, meaning the Server Component didn't re-render to show the panel.
- **Fix**: Reverted `<Link>` back to standard HTML `<a>` tags to enforce hard server renders for search parameter changes.

## 2026-07-04: VPS Recordings Directory Mismatch
- **Issue**: Recordings from `backend-audio` were successfully generated but resulted in a "File not found" error when attempting to play or download them via the frontend dashboard.
- **Cause**: A leftover deployment template assumed a Google Cloud architecture (`GCS_BUCKET`, Cloud Run URL) and set `RECORDINGS_BASE_DIR=/tmp/recordings` in `backend-audio`. The frontend correctly used `RECORDINGS_BASE_DIR="/mnt/recordings"`. This caused backend-audio to write to `/tmp` while frontend looked in `/mnt`. 
- **Fix**: 
  - Verified architecture is **strictly VPS-based** (no Google Cloud dependencies).
  - Fixed local `deploy/backend-audio.env.production` to point to `/mnt/recordings` and `127.0.0.1:3000` for token validation.
  - SSH'd into VPS and changed `RECORDINGS_BASE_DIR=/mnt/recordings` in `/home/root/apps/egonair-stream/current/backend-audio/.env`.
  - Moved all orphaned `.mp3` and `.webm` files from `/tmp/recordings` to `/mnt/recordings` via SSH.
  - Restarted `egonair-audio` process on the VPS with `--update-env`.
  - Confirmed `ENABLE_SHOUTCAST_LIVE=true` was preserved successfully so broadcasting remains fully functional.
