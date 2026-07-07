# SRS Addendum — May 28, 2026 (Part 3)

This addendum documents new requirements from the DSP per-filter toggle implementation.

---

## 20. DSP Per-Filter Enable/Disable

### 20.1 Requirement
Each DSP filter group MUST have an independent toggle switch that enables or disables the group without changing its parameter values.

### 20.2 Filter Groups
| Group Key | Label | Parameters |
|---|---|---|
| `filter` | فلاتر التردد | hpFreq, lpFreq |
| `eq` | المعادل الصوتي (EQ) | eqLowGain, eqLowFreq, eqMidGain, eqMidFreq, eqHighGain, eqHighFreq |
| `dynamics` | ديناميكيات | compThreshold, compRatio, compAttack, compRelease, compKnee, limiterThreshold |
| `gate` | بوابة الضوضاء | gateThreshold, gateAttack, gateRelease |
| `deesser` | مزيل الصفير | deEsserFreq, deEsserQ, deEsserReduction |
| `reverb` | ريفيرب | reverbWet, reverbDecay |
| `delay` | تأخير / صدى | delayTime, delayFeedback, delayWet |
| `warmth` | دفء الصوت | warmthAmount |

### 20.3 Toggle Behavior
- **ON (violet):** Filter group processes audio normally using user's parameter values.
- **OFF (grey):** Filter group set to neutral/passthrough values (no processing). Parameter values are PRESERVED — turning back ON restores them.
- **Sliders when OFF:** Visible but dimmed and non-interactive.

### 20.4 Bypass Values per Group
| Group | Bypass Values |
|---|---|
| filter | HP=20Hz, LP=22000Hz |
| eq | All gains = 0dB |
| dynamics | Threshold=0, Ratio=1:1 |
| gate | (no bypass — gate gain controlled by RAF loop) |
| deesser | Q=0.001 |
| reverb | Wet=0, Dry=1 |
| delay | Time=0, Feedback=0, Wet=0 |
| warmth | Amount=0, Wet=0 |

### 20.5 Persistence
- Enable flags stored as optional booleans in `DspParams` JSON
- Saved with user presets in PostgreSQL `DspPreset.params` column
- System presets include explicit enable flags

### 20.6 Backward Compatibility
- Old presets without enable flags treat all groups as enabled (`!== false` check)
- No database migration required

---

## 21. RTL Toggle Switches

### 21.1 Requirement
All toggle switches in the application MUST render correctly in RTL (Arabic) layout.

### 21.2 Implementation Pattern
Toggle switches are inherently direction-agnostic. Use `dir="ltr"` on the toggle container with explicit `left` CSS positioning:
```html
<div dir="ltr" class="relative w-8 h-[18px] ...">
  <div class="absolute top-[2px] left-[2px] ..." />
</div>
```

### 21.3 Anti-Patterns
- ❌ `translate-x` — breaks in RTL, dot exits container
- ❌ `inset-inline-start` — correct positioning but no CSS transition support in Tailwind
- ✅ `dir="ltr"` + `left` — correct in all layouts, animates smoothly

---

## 22. KB Maintenance Policy

### 22.1 Requirement

### 22.2 Current Architecture (as of May 28, 2026)
| Component | Value |
|---|---|
| Database | PostgreSQL on VPS (localhost:5432, database `egonair`) |
| Deployment | VPS 195.35.48.184 via `scp` + `npm run build` + `pm2 restart` |
| Domain | studio.egonair.com |
| SSL | Let's Encrypt via Certbot |
| Process Manager | PM2 (`frontend` + `backend-audio`) |
| CI/CD | None — manual scp deployment |

### 22.3 Historical References
When legacy references must be kept for context, prefix them with `[HISTORICAL]`.
