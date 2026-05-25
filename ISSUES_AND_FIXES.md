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
