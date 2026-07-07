# SRS Addendum — May 29, 2026

This addendum documents new requirements from the studio fader fix and multi-file upload sessions.

---

## 23. Volume Fader Precision

### 23.1 Requirement
All volume faders (background, queue, SFX, monitor) MUST correctly map their UI range to the Web Audio API `GainNode.gain.value` range.

### 23.2 Specification
| UI Component | Slider Range | Display | GainNode Range | Conversion |
|---|---|---|---|---|
| Background volume | 0–100 | `{bgVolume}%` | 0.0–1.0 | `bgVolume / 100` |
| Queue volume | 0–100 | `{queueVolume}%` | 0.0–1.0 | `queueVolume / 100` |
| Monitor volume | 0–100 | `{monitorVolume}%` | 0.0–1.0 | `monitorVolume / 100` |
| Mic volume | 0–100 | `{micVolume}%` | 0.0–1.0 | `micVolume / 100` |
| SFX volume | 0–100 | `{sfxVolume}%` | 0.0–1.0 | `sfxVolume / 100` |

### 23.3 Default Values
| Fader | Default (UI) | Default (Gain) |
|---|---|---|
| Background | 50% | 0.50 |
| Queue | 80% | 0.80 |
| Mic | 80% | 0.80 |
| Monitor | 80% | 0.80 |
| SFX | 70% | 0.70 |

### 23.4 Validation Rule
**Any code that sets `GainNode.gain.value` from a 0-100 slider MUST divide by 100.** This applies to:
- Direct assignments (`gain.value = vol / 100`)
- `fadeGain()` target values
- Resume-from-pause gain restoration
- Background ducking calculations

### 23.5 Anti-Pattern
```typescript
// ❌ WRONG — sends 75 to GainNode (75× amplification = clipping)
queueGainRef.current.gain.value = queueVolume;

// ✅ CORRECT — sends 0.75 to GainNode
queueGainRef.current.gain.value = queueVolume / 100;
```

---

## 24. Multi-File Upload in Media Library

### 24.1 Requirement
The media library file picker MUST allow selecting multiple audio files in a single dialog.

### 24.2 Affected Tabs
All 4 media library tabs support multi-file upload:
- خلفية (Background)
- أغاني (Songs)
- فواصل (Breaks/Jingles)
- إعلانات (Ads/Promoters)

### 24.3 Implementation
The `<input type="file">` element MUST include the `multiple` attribute:
```html
<input type="file" accept="audio/*" multiple className="hidden" ... />
```

### 24.4 Validation
- MIME type validation: only `audio/*` files accepted
- Each file gets a unique UUID via `crypto.randomUUID()`
- Object URLs created via `URL.createObjectURL(file)` and tracked for cleanup

---

## 25. Studio Versioning Strategy

### 25.1 Requirement
The studio component MUST maintain backward-compatible versions to enable safe rollback.

### 25.2 Version Files
| File | Description | Status |
|---|---|---|
| `studio-ui.tsx` | V1 — Original monolithic component | Backup |
| `studio-ui-v2.tsx` | V2 — Redesigned layout, same logic | **Production** |
| `studio-ui-v3.tsx` | V3 — Modular hooks refactor | Inactive (needs testing) |

### 25.3 Switching Versions
Change the import in both pre-flight screens:
```typescript
// To use V2 (current):
import StudioUI from "./studio-ui-v2";

// To use V1 (rollback):
import StudioUI from "./studio-ui";
```

### 25.4 Testing Before Deployment
Any new studio version MUST be tested:
1. Local dev server (`npm run dev`) — verify all controls render
2. Connect to SHOUTcast — verify audio pipeline works
3. Test mic, background, queue, crossfade, DSP, SFX
4. Only then deploy to VPS
