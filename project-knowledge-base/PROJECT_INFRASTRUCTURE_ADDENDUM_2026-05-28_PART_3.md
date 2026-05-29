# Project Infrastructure Addendum — May 28, 2026 (Part 3)

---

## 1. DSP Preset Seeding

### 1.1 Seed Script
**File:** `frontend/prisma/seed-dsp-presets.ts`
**Command:** `DATABASE_URL='postgresql://egonair_app:SecurePassword123@localhost:5432/egonair' npx tsx prisma/seed-dsp-presets.ts`

### 1.2 Behavior
- Uses `upsert` — safe to re-run without duplicating presets
- Matches by `name` + `isSystem=true`
- Updates `params` JSON if preset already exists
- 10 system presets total

### 1.3 Re-seed Required When
- System preset parameter values change
- New system presets are added
- Enable flags are added/changed on system presets

---

## 2. DspParams Schema Extension

### 2.1 New Optional Fields in `DspPreset.params` JSON
```typescript
{
  filterEnabled?: boolean,    // HP + LP filters
  eqEnabled?: boolean,        // 3-band parametric EQ
  dynamicsEnabled?: boolean,  // Compressor + Limiter
  gateEnabled?: boolean,      // Noise Gate
  deesserEnabled?: boolean,   // De-Esser
  reverbEnabled?: boolean,    // Reverb
  delayEnabled?: boolean,     // Delay / Echo
  warmthEnabled?: boolean,    // Tape Warmth
  // ... plus all existing numeric fields
}
```

### 2.2 No Database Migration Required
The `params` column is `Json` type in Prisma/PostgreSQL. Optional fields with `undefined` are simply absent from the JSON blob. No `ALTER TABLE` needed.

---

## 3. VPS Deployment Log (Evening Session)

### Deployed May 28 (~21:15-21:30 UTC+3)
| File | Status |
|---|---|
| `frontend/src/lib/dsp-presets.ts` | ✅ Deployed |
| `frontend/src/components/studio/DspPanel.tsx` | ✅ Deployed (3 iterations — type fix, RTL fix) |
| `frontend/src/app/studio/studio-ui.tsx` | ✅ Deployed |
| DSP presets re-seeded | ✅ 10 system presets updated |
| `npm run build` | ✅ Passed |
| `pm2 restart frontend` | ✅ Running |

### Build Failure Log
| Build # | Issue | Fix |
|---|---|---|
| 1 | `DSP_PARAM_META` type error — `Record<keyof DspParams>` includes boolean enable keys | Added `DspNumericKey = Exclude<keyof DspParams, \`${string}Enabled\`>` |
| 2-3 | RTL toggle dot overflow | `dir="ltr"` + explicit `left` positioning |

---

## 4. KB Cleanup Deployment

Cleaned 8 files across KB + Prisma schemas:
- All `[HISTORICAL]` tags added — zero content deleted
- Verified no source code (.ts/.tsx/.js) contains banned terms
- VPS `.env.production` confirmed: `DATABASE_URL=postgresql://...`

---

## 5. Current PM2 Status

```
┌────┬──────────────────┬─────────┬──────────┬────────┐
│ id │ name             │ mode    │ status   │ ↺      │
├────┼──────────────────┼─────────┼──────────┼────────┤
│ 2  │ backend-audio    │ fork    │ online   │ 1      │
│ 0  │ frontend         │ fork    │ online   │ 33     │
└────┴──────────────────┴─────────┴──────────┴────────┘
```

---

## 6. Outstanding Infrastructure Items

| Item | Status | Priority |
|---|---|---|
| Audio token schedule validation | ❌ Not implemented | HIGH |
| Session-end watchdog (auto-disconnect) | ❌ Not implemented | MEDIUM |
| Background ↔ Queue crossfade timing | ❌ Not implemented | LOW |
| Audio device selection (mic/monitor) | ❌ Not implemented | LOW |
| Android build (Kotlin native module) | ❌ Not started | LOW |
| DSP filters for mobile app | ❌ Not started | MEDIUM |
