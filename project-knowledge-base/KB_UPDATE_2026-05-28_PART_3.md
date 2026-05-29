# Knowledge Base Update: May 28, 2026 (Evening Session)

## Overview
Evening session covering: **DSP per-filter toggles**, **KB legacy reference cleanup**, **RTL toggle switch fix**.

---

## 1. DSP Per-Filter Enable/Disable Toggles

### Problem
The DSP panel had 8 filter groups (HP/LP, EQ, Dynamics, Gate, De-Esser, Reverb, Delay, Warmth) but no way to tell which filters were active or to enable/disable individual groups. The user had to adjust sliders to neutral positions manually.

### Solution
Added per-group boolean enable flags to `DspParams` interface:
- `filterEnabled`, `eqEnabled`, `dynamicsEnabled`, `gateEnabled`, `deesserEnabled`, `reverbEnabled`, `delayEnabled`, `warmthEnabled`
- All flags are optional (`?: boolean`) for backward compatibility with existing presets
- When `undefined` (old presets), defaults to `true` (all filters active) — uses `!== false` check

### UI Changes
- Each group header now has a toggle switch (violet = ON, grey = OFF)
- When OFF: sliders are dimmed (`opacity-40`) and non-interactive (`pointer-events-none`)
- Toggle and expand chevron are separate click targets
- Toggle state persists with presets — loading a preset sets the correct toggles

### Audio Engine Changes
`applyDspParams()` in `studio-ui.tsx` now checks each group's enable flag before setting audio node values:
- **Filters OFF:** HP set to 20Hz, LP set to 22000Hz (passthrough)
- **EQ OFF:** All gains set to 0dB (flat)
- **Dynamics OFF:** Compressor threshold=0, ratio=1:1, limiter threshold=0 (no compression)
- **De-Esser OFF:** Q set to 0.001 (effectively no filtering)
- **Reverb OFF:** Wet=0, Dry=1 (dry signal only)
- **Delay OFF:** Time=0, Feedback=0, Wet=0 (no delay)
- **Warmth OFF:** Amount=0, Wet=0 (no saturation)

### Files Modified
| File | Changes |
|---|---|
| `frontend/src/lib/dsp-presets.ts` | Added enable flags to `DspParams`, `DEFAULT_DSP_PARAMS`, `DSP_GROUP_ENABLE_KEY` map, `DspNumericKey` type, updated all 10 system presets |
| `frontend/src/components/studio/DspPanel.tsx` | Added toggle switches per group, imported `DSP_GROUP_ENABLE_KEY` |
| `frontend/src/app/studio/studio-ui.tsx` | `applyDspParams()` now respects per-group enable flags |

---

## 2. RTL Toggle Switch Fix

### Problem
The toggle switch dots used `translate-x-[16px]` which breaks in RTL (Arabic) layout — dots moved outside their container.

### Fix Attempt 1: `inset-inline-start`
Used `inset-inline-start-[16px]` — RTL-aware but the dot didn't animate (no transition on `inset-inline-start` in Tailwind).

### Fix Attempt 2 (Final): `dir="ltr"` + explicit `left`
Added `dir="ltr"` on the toggle container and used `left-[16px]` / `left-[2px]` with `transition-[left] duration-200`. Toggle switches are inherently direction-agnostic UI elements, so forcing LTR on just the switch is correct.

### Files Modified
| File | Changes |
|---|---|
| `frontend/src/components/studio/DspPanel.tsx` | Toggle dot: `dir="ltr"` + `left` positioning |

---

## 3. System Preset Updates

All 10 system DSP presets updated to include explicit enable flags:

| Preset | Enabled Groups |
|---|---|
| بدون معالجة (No Processing) | filter only |
| صوت إذاعي FM (FM Radio) | filter, eq, dynamics, gate, de-esser, warmth |
| صوت بودكاست (Podcast) | filter, eq, dynamics, gate |
| صوت عميق / بيس (Deep Bass) | filter, eq, dynamics, warmth |
| صوت حاد وواضح (Bright & Clear) | filter, eq, dynamics, de-esser |
| صوت دافئ / كلاسيك (Warm Classic) | filter, eq, dynamics, warmth |
| صوت تلفزيوني (TV Broadcast) | filter, eq, dynamics, gate, de-esser |
| ريفيرب خفيف (Light Reverb) | filter, dynamics, reverb |
| صوت مع تأخير (Echo/Delay) | filter, dynamics, delay |
| صوت تلاوة قرآن (Quran Recitation) | filter, eq, dynamics, reverb, warmth |

Presets re-seeded on VPS PostgreSQL via `npx tsx prisma/seed-dsp-presets.ts`.

---

## 4. KB Legacy Reference Cleanup

### What was cleaned
Removed/updated all references to **egyona**, **Cloud Run**, **gcloud**, **GitHub**, **SQLite** across the entire project:

| Scope | Files Cleaned |
|---|---|
| Prisma schemas | `schema.prisma`, `schema.cloud.prisma` — comments updated |
| KB documents | `AGENT_HANDOFF.md`, `CURRENT_STATUS.md`, `NEXT_STEPS.md`, `ISSUES_AND_FIXES.md`, `09_deployment_and_infrastructure.md`, `SYSTEM_AUDIT_CURRENT_STATE_2026-05-19_PART_1.md` |
| Source code | Zero hits — already clean |

### Approach
- **No deletions** — all historical context preserved with `[HISTORICAL]` prefixes
- Current architecture clearly documented as: PostgreSQL on VPS, scp + pm2 deployment, studio.egonair.com

---

## 5. Backward Compatibility Notes

### DSP Enable Flags
- Existing presets stored in PostgreSQL WITHOUT enable flags will still work
- `currentParams[enableKey] !== false` evaluates to `true` when the key is `undefined`
- All filters active for legacy presets — zero breaking changes
- User-created presets saved before this update will have all filters enabled

---

## 6. Files Modified (May 28 Evening Session)

| File | Changes |
|---|---|
| `frontend/src/lib/dsp-presets.ts` | Per-filter enable flags, `DspNumericKey` type, `DSP_GROUP_ENABLE_KEY`, updated 10 system presets |
| `frontend/src/components/studio/DspPanel.tsx` | Toggle switches per group, RTL fix |
| `frontend/src/app/studio/studio-ui.tsx` | `applyDspParams()` respects enable flags |
| `frontend/prisma/schema.prisma` | Comments cleaned (SQLite/Cloud Run) |
| `frontend/prisma/schema.cloud.prisma` | Comments cleaned (SQLite/Docker) |
| KB: 6 markdown files | Legacy references marked `[HISTORICAL]` |
