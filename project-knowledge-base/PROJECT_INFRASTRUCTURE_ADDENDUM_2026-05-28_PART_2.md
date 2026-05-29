# Project Infrastructure Addendum — May 28, 2026 (Part 2)

---

## 1. API Endpoint Changes

### 1.1 Schedule Route — Breaking Change
**Route:** `GET /api/mobile/schedule?stationId=<id>`
**Change:** Complete rewrite from legacy `BroadcastSchedule` query to `resolveCurrentOrNextProgramSession()`.

**Old response (before May 28):**
```json
{
  "stationName": "string",
  "scheduledStartTime": "ISO",
  "sessionEndTime": "ISO",
  "allowConnectMinutesBefore": 10
}
```

**New response (after May 28):**
```json
{
  "mode": "SCHEDULED | DIRECT_DJ | NO_SCHEDULE",
  "scheduledStartTime": "ISO | null",
  "sessionEndTime": "ISO | null",
  "allowConnectMinutesBefore": 5,
  "gateOpen": true | false,
  "programTitle": "string | null",
  "stationName": "string | null"
}
```

**Impact:** Mobile app v2.0+ expects the new format. Old app versions will break.

### 1.2 Stations Route — Backward Compatible
**Route:** `GET /api/mobile/stations`
**Change:** Added `presenterMode` field to response.

**New fields:**
```json
{
  "stations": [...],
  "presenterMode": "SINGLE_STATION | MULTI_STATION | DIRECT_DJ | null"
}
```

**Impact:** Additive change — old clients will ignore the new field.

---

## 2. VPS Deployment Status

### Deployed May 28 (~18:01 UTC+3)
| Component | Status |
|---|---|
| `frontend/src/app/api/mobile/schedule/route.ts` | ✅ Deployed, built, running |
| `frontend/src/app/api/mobile/stations/route.ts` | ✅ Deployed, built, running |
| PM2 frontend process | ✅ Restarted (pid updated) |
| Build warnings | ⚠️ 1 NFT trace warning (benign — `next.config.ts` import trace) |

### Deployment Commands Used
```bash
# Create directory (schedule route was new path on VPS)
ssh root@195.35.48.184 "mkdir -p /var/www/egonair/frontend/src/app/api/mobile/schedule"

# Upload files
scp schedule/route.ts root@195.35.48.184:/var/www/egonair/frontend/src/app/api/mobile/schedule/route.ts
scp stations/route.ts root@195.35.48.184:/var/www/egonair/frontend/src/app/api/mobile/stations/route.ts

# Build + restart
ssh root@195.35.48.184 "cd /var/www/egonair/frontend && npm run build && pm2 restart frontend"
```

---

## 3. Mobile App Build Status

### Build Target
- **Device:** Dina's iPhone (iOS 16.7)
- **Device ID:** `d4053ebbfc991467b8792b87c062d4e7a5f8e8c2`
- **Bundle ID:** `com.egonair.studio`
- **Team:** `S246G3YAQD`

### Build Outcomes (May 28 Afternoon)
| Build # | Time | Result | Notes |
|---|---|---|---|
| 1 | ~18:02 | ✅ Installed | Dashboard redesign + API sync |
| 2 | ~18:33 | ✅ Installed | bg restore fix (playFile added to stopQueue) |
| 3 | ~18:48 | ✅ Installed | manualStopRef guard (sync release — broken) |
| 4 | ~18:57 | ✅ Installed | manualStopRef guard all 3 sites (sync — still broken) |
| 5 | ~19:05 | ✅ Installed | manualStopRef async release (setTimeout 100ms — working) |

### Metro Bundler
- Running on `http://localhost:8081` (pid 4280)
- Must be running for the app to load JS bundle
- iPhone and Mac must be on the same WiFi network

### Known iOS 16.7 Limitation
`xcrun devicectl device process launch` fails with error 1000 on iOS 16.7 devices. This only affects auto-launch — the app is still installed successfully. User must manually tap the app icon.

---

## 4. PM2 Process Status (Post-Deploy)

```
┌────┬──────────────────┬─────────┬──────────┬────────┐
│ id │ name             │ mode    │ status   │ ↺      │
├────┼──────────────────┼─────────┼──────────┼────────┤
│ 2  │ backend-audio    │ fork    │ online   │ 1      │
│ 0  │ frontend         │ fork    │ online   │ 10     │
└────┴──────────────────┴─────────┴──────────┴────────┘
```

---

## 5. Outstanding Infrastructure Items

| Item | Status | Priority |
|---|---|---|
| Audio token schedule validation (`/api/mobile/audio-token/route.ts`) | ❌ Not implemented | HIGH |
| Session-end watchdog (auto-disconnect) | ❌ Not implemented | MEDIUM |
| Background ↔ Queue crossfade timing | ❌ Not implemented | LOW |
| Audio device selection (mic/monitor) | ❌ Not implemented | LOW |
| Android build (Kotlin native module) | ❌ Not started | LOW |
