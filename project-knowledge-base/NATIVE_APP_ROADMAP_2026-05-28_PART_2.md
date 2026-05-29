# Native Mobile App Roadmap — May 28, 2026 (Updated)

## ✅ Phase 1: iOS Mic Streaming (COMPLETE)
**Status:** Done — no changes.

---

## ✅ Phase 2: Audio Mixing Core (iOS) (COMPLETE)
**Status:** Done — completed May 27.

| Task | Status |
|---|---|
| `AVAudioPlayerNode` + media gain node | ✅ Done |
| `AVAudioMixerNode` tap (mixed output) | ✅ Done |
| `playFile()`, `stopFile()` exposed to JS | ✅ Done |
| `setMicVolume()`, `setMediaVolume()` | ✅ Done |
| `fadeMediaVolume()` for ducking/crossfade | ✅ Done |
| DJ monitor toggle + headphone warning | ✅ Done |
| Monitor fader (doesn't affect stream) | ✅ Done |
| Background ducking (10% when mic open) | ✅ Done |
| Queue file pre-download + progress meter | ✅ Done |
| `onFileComplete` event for queue advance | ✅ Done |

---

## ✅ Phase 2.5: Mobile Studio Audit & Redesign (COMPLETE — NEW)
**Status:** Done — completed May 28.

| Task | Status | Notes |
|---|---|---|
| Mobile studio audit (8 bugs found) | ✅ Done | See KB_UPDATE_2026-05-28_PART_2.md |
| Schedule API migration to `resolveCurrentOrNextProgramSession` | ✅ Done | Legacy `BroadcastSchedule` retired |
| Stations API — `presenterMode` field | ✅ Done | Enables UI branching |
| Dashboard redesign: SINGLE_STATION mode | ✅ Done | Auto-schedule, countdown, gate button |
| Dashboard redesign: MULTI_STATION mode | ✅ Done | Dropdown → same schedule logic |
| Dashboard redesign: DIRECT_DJ mode | ✅ Done | Radio list, no schedule |
| NO_SCHEDULE blocking | ✅ Done | Shows blocked UI, no studio access |
| VirtualizedList crash fix | ✅ Done | FlatList → map() |
| `allowConnectMinutesBefore` default fix | ✅ Done | 10 → 5 |
| Queue/bg `onFileComplete` cascade fix | ✅ Done | `manualStopRef` with async 100ms release |
| Background auto-resume on queue stop | ✅ Done | Added `playFile(bg)` to `stopQueue()` |
| Admin programs production crash fix | ✅ Done | Server Component simplification |

---

## ✅ Phase 3: Mobile Feature Parity — Recordings (PARTIALLY COMPLETE)
**Status:** Recording playback is WORKING. Other Phase 3 items still TODO.

| Task | Status | Notes |
|---|---|---|
| Recordings list on WaitScreen (last 10) | ✅ Done | `RecordingMiniPlayer.tsx` — download-then-play |
| Mobile recordings API route | ✅ Done | `GET /api/mobile/recordings` — Bearer JWT auth |
| Mobile recordings play route | ✅ Done | `GET /api/mobile/recordings/play/[filename]` — dual auth |
| Recording mini-player component | ✅ Done | Axios download → local cache → expo-audio |
| Session-end watchdog (60s warning) | ⏳ TODO | Poll every 10s, auto-disconnect at end |
| Audio token schedule validation | ⏳ TODO | Block token issue outside schedule window |
| Background ↔ Queue crossfade (3s/2s) | ⏳ TODO | Fade transitions via gain ramps |

---

## 🔜 Phase 3.5: Audio Device Selection
**Estimated: ~2 hours**

| Task | Status | Notes |
|---|---|---|
| Add UI for Mic Source selection | ⏳ TODO | Dropdown/picker for input device |
| Add UI for Monitor Output selection | ⏳ TODO | Dropdown/picker for output device |

---

## 🔜 Phase 4: Queue-to-Queue Crossfade (Web + Mobile)
**Estimated: ~4 hours** — No changes from May 26 roadmap.

---

## 🔜 Phase 5: Sound Effects / SFX Pads (Web + Mobile)
**Estimated: ~5 hours** — No changes from May 26 roadmap.

---

## 🔜 Phase 6: DSP Mic Filters (Web + Mobile)
**Estimated: ~6 hours** — No changes from May 26 roadmap.

---

## 🔜 Phase 7: Android Build + Kotlin Native Module
**Estimated: ~8 hours** — No changes from May 26 roadmap.

---

## Remaining Estimated Hours

| Phase | Est. | Status |
|---|---|---|
| Phase 3 (remaining) | ~2h | Watchdog, token validation, BG↔Queue crossfade |
| Phase 3.5 | ~2h | Audio device selection |
| Phase 4 | ~4h | Queue crossfade (web + mobile) |
| Phase 5 | ~5h | SFX pads (web + mobile) |
| Phase 6 | ~6h | DSP filters (web + mobile) |
| Phase 7 | ~8h | Android build |
| **Total** | **~27h** | |

---

## Deployment Reminders (for future agents)

> ⚠️ **DO NOT use git push/pull for deployment.** This project deploys via `scp` + `npm run build` + `pm2 restart`.  
> ⚠️ **DO NOT skip `npm run build`.** Next.js production mode reads from `.next/`, not `src/`.  
> ⚠️ **DO NOT assume fail2ban.** SSH timeouts are network issues, not bans.  
> ⚠️ **DO NOT use expo-audio for remote URLs.** Download first, play local.  
> ⚠️ **DO NOT use WebView for audio playback.** CORS blocks all requests from inline HTML.  
> ⚠️ **DO NOT release `manualStopRef` synchronously.** Native bridge events fire on the NEXT event loop tick. Use `setTimeout(100ms)`.  
> ⚠️ **DO NOT use FlatList inside ScrollView.** Causes crashes on iOS 16. Use `.map()` for small lists.
