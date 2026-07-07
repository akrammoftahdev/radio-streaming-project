# Native Mobile App Roadmap — May 28, 2026 (Evening Update)

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

## 🔜 Phase 4: Queue-to-Queue Crossfade (Web + Mobile)
**Estimated: ~4 hours** — No changes.

---

## 🔜 Phase 5: Sound Effects / SFX Pads (Web + Mobile)
**Estimated: ~5 hours** — No changes.

---

## ✅ Phase 6: DSP Mic Filters — WEB (MAJOR PROGRESS)
**Estimated remaining: ~3 hours (mobile only)**

### Web Studio DSP — COMPLETE
| Task | Status | Notes |
|---|---|---|
| 13-node audio processing chain | ✅ Done | HP, LP, EQ×3, Comp, Limiter, Gate, De-Esser, Reverb, Delay, Warmth |
| DspPanel UI with 8 collapsible groups | ✅ Done | |
| 10 system presets (Arabic labels) | ✅ Done | Seeded in PostgreSQL |
| User custom preset save/load/delete | ✅ Done | Stored per-user in DB |
| Global DSP bypass toggle | ✅ Done | Disconnects/reconnects entire chain |
| Per-filter enable/disable toggles | ✅ Done | 8 independent toggle switches per group |
| RTL-compatible toggle switches | ✅ Done | `dir="ltr"` + `left` positioning |
| Preset chips with active highlight | ✅ Done | System + user presets in scrollable row |

### Mobile DSP — TODO
| Task | Status | Notes |
|---|---|---|
| Native `AVAudioUnitEQ` on iOS | ⏳ TODO | Needs Kotlin equivalent for Android |
| Mobile DspPanel component | ⏳ TODO | Port web DspPanel to React Native |
| Preset sync with server | ⏳ TODO | Same API endpoints |

---

## 🔜 Phase 7: Android Build + Kotlin Native Module
**Estimated: ~8 hours** — No changes.

---

## Remaining Estimated Hours

| Phase | Est. | Status |
|---|---|---|
| Phase 3 (remaining) | ~2h | Watchdog, token validation, BG↔Queue crossfade |
| Phase 3.5 | ~2h | Audio device selection |
| Phase 4 | ~4h | Queue crossfade (web + mobile) |
| Phase 5 | ~5h | SFX pads (web + mobile) |
| Phase 6 (mobile only) | ~3h | DSP filters mobile port |
| Phase 7 | ~8h | Android build |
| **Total** | **~24h** | |

---

## Deployment Reminders (for future agents)

> ⚠️ **DO NOT use git push/pull for deployment.** This project deploys via `scp` + `npm run build` + `pm2 restart`.  
> ⚠️ **DO NOT skip `npm run build`.** Next.js production mode reads from `.next/`, not `src/`.  
> ⚠️ **DO NOT release `manualStopRef` synchronously.** Native bridge events fire on the NEXT event loop tick.  
> ⚠️ **DO NOT use FlatList inside ScrollView.** Use `.map()` for small lists.  
> ⚠️ **RTL toggle switches:** Use `dir="ltr"` + `left` positioning. Never `translate-x`.  
> ⚠️ **DSP presets re-seed:** Run `npx tsx prisma/seed-dsp-presets.ts` after changing system preset values.
