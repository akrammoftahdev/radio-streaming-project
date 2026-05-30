# Native Mobile App Roadmap — May 29, 2026

## ✅ Phase 1: iOS Mic Streaming (COMPLETE)
**Status:** Done — no changes.

---

## ✅ Phase 2: Audio Mixing Core (iOS) (COMPLETE)
**Status:** Done — no changes.

---

## ✅ Phase 2.5: Mobile Studio Audit & Redesign (COMPLETE)
**Status:** Done — no changes.

---

## ✅ Phase 3: Mobile Feature Parity — Recordings (PARTIALLY COMPLETE)
**Status:** Recording playback working. Watchdog + token validation still TODO.

---

## 🔜 Phase 3.5: Audio Device Selection
**Estimated: ~2 hours** — No changes.

---

## ✅ Phase 4: Queue-to-Queue Crossfade (Web) — COMPLETE
**Status:** Web crossfade was already implemented (confirmed May 29 audit).

### Web Implementation Details
| Feature | Status | Notes |
|---|---|---|
| 3-second overlap crossfade | ✅ Done | `QUEUE_CROSSFADE_SEC = 3` |
| Polling-based near-end detection | ✅ Done | `QUEUE_CROSSFADE_CHECK_MS = 500` |
| Track A fade-out + Track B fade-in | ✅ Done | Uses `fadeGain()` with Web Audio API |
| Chain crossfade (3+ tracks) | ✅ Done | Re-starts polling after each transition |
| Short track skip (< 6s) | ✅ Done | Falls back to hard-cut via `onended` |
| Auto-queue toggle required | ✅ Done | Only crossfades when `autoQueue` is ON |
| Outgoing player cleanup | ✅ Done | `outgoingPlayerRef` paused + disconnected after fade |
| Background restore after queue ends | ✅ Done | Fades bg back in over 2s |

### Mobile — TODO
| Task | Status |
|---|---|
| Implement crossfade on iOS (AVAudioEngine) | ⏳ TODO |
| Implement crossfade on Android | ⏳ TODO |

**Revised estimate: ~2h (mobile only, web done)**

---

## ✅ Phase 5: Sound Effects / SFX Pads (Web) — COMPLETE
**Status:** Web SFX pads fully implemented. Mobile TODO.

**Revised estimate: ~3h (mobile only, web done)**

---

## ✅ Phase 6: DSP Mic Filters — WEB (COMPLETE)
**Estimated remaining: ~3 hours (mobile only)**
No changes from previous update.

---

## 🔜 Phase 7: Android Build + Kotlin Native Module
**Estimated: ~8 hours** — No changes.

---

## NEW: Phase 8: Studio V3 Modular Refactor (DEFERRED)

### Goal
Reduce `studio-ui-v2.tsx` (3,194 lines) to ~1,600 lines by extracting logic into 5 custom hooks.

### Status: DEFERRED
- V3 was created and compiled successfully but **failed at runtime** (May 29)
- Root cause: cross-hook ref sharing timing issues with Web Audio API
- Files exist on disk but are NOT active in production

### Prerequisites Before Re-attempting
1. Create comprehensive test harness for audio pipeline
2. Test each hook in isolation
3. Test ref passing between hooks
4. Run full integration test (connect, mic, bg, queue, crossfade, DSP, SFX) locally
5. Only then deploy to VPS

---

## Bug Fixes Completed (May 29)

| Bug | Fix | Impact |
|---|---|---|
| Fader unit mismatch (0-100 slider → GainNode 0-1) | Added `/ 100` at all GainNode assignment points | Prevents 75× amplification when moving faders |
| Single-file upload in media library | Added `multiple` attribute to 4 file inputs | Users can now select multiple audio files at once |

---

## Remaining Estimated Hours

| Phase | Est. | Status |
|---|---|---|
| Phase 3 (remaining) | ~2h | Watchdog, token validation |
| Phase 3.5 | ~2h | Audio device selection |
| Phase 4 (mobile only) | ~2h | Queue crossfade mobile port |
| Phase 5 (mobile only) | ~3h | SFX pads mobile port |
| Phase 6 (mobile only) | ~3h | DSP filters mobile port |
| Phase 7 | ~8h | Android build |
| Phase 8 (deferred) | ~4h | V3 modular refactor (with proper testing) |
| **Total** | **~24h** | |

---

## Deployment Reminders (for future agents)

> ⚠️ **DO NOT use `git reset --hard` on VPS.** It replaces the flat frontend with the full monorepo and breaks everything.
> ⚠️ **USE rsync for deployment.** `rsync -avz frontend/src/ root@VPS:/var/www/egonair/frontend/src/`
> ⚠️ **ALWAYS `fuser -k 3000/tcp` before PM2 restart.** Orphan processes block the port.
> ⚠️ **DO NOT skip `npm run build`.** Next.js production mode reads from `.next/`, not `src/`.
> ⚠️ **DO NOT use SQLite on VPS.** Production uses PostgreSQL (localhost:5432, database `egonair`).
> ⚠️ **DO NOT reference egyona, gcloud, Cloud Run, or GitHub Actions.** All historical.
> ⚠️ **Volume faders: ALWAYS divide by 100** when setting `GainNode.gain.value` from a 0-100 slider.
> ⚠️ **RTL toggle switches:** Use `dir="ltr"` + `left` positioning. Never `translate-x`.
> ⚠️ **Test studio refactors LOCALLY before deploying.** TypeScript passing does NOT mean runtime works.
> ⚠️ **DSP presets re-seed:** Run `npx tsx prisma/seed-dsp-presets.ts` after changing system preset values.
