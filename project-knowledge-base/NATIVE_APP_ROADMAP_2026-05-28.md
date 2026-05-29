# Native Mobile App Roadmap — May 28, 2026

## ✅ Phase 1: iOS Mic Streaming (COMPLETE)
**Status:** Done — no changes from May 26 roadmap.

---

## ✅ Phase 2: Audio Mixing Core (iOS) (COMPLETE)
**Status:** Done — completed May 27. See KB_UPDATE_2026-05-27.md for details.

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

## ✅ Phase 3: Mobile Feature Parity — Recordings (PARTIALLY COMPLETE)
**Status:** Recording playback is WORKING. Other Phase 3 items still TODO.

| Task | Status | Notes |
|---|---|---|
| Recordings list on WaitScreen (last 10) | ✅ Done | `RecordingMiniPlayer.tsx` — download-then-play |
| Mobile recordings API route | ✅ Done | `GET /api/mobile/recordings` — Bearer JWT auth |
| Mobile recordings play route | ✅ Done | `GET /api/mobile/recordings/play/[filename]` — dual auth (Bearer + query token) |
| Recording mini-player component | ✅ Done | Axios download → local cache → expo-audio playback |
| Session-end watchdog (60s warning) | ⏳ TODO | Poll every 10s, auto-disconnect at end |
| `allowConnectMinutesBefore` from server | ⏳ TODO | Replace hardcoded 10 min |
| Background ↔ Queue crossfade (3s/2s) | ⏳ TODO | Fade transitions via gain ramps |

### Phase 3 Hotfixes Applied (May 27–28)
| Issue | Fix | Time Spent |
|---|---|---|
| Recording playback silent failure — no audio, no error | Added Bearer auth to play route + download-then-play architecture | ~3 hours (should have been 5 min) |
| expo-file-system deprecation warnings (v54) | Changed import to `expo-file-system/legacy` | 2 min |
| Duplicate apps in simulator | Removed both, fresh `npx expo run:ios` install | 5 min |

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
| Phase 3 (remaining) | ~3h | Session-end watchdog, gate timing, BG↔Queue crossfade |
| Phase 3.5 | ~2h | Audio device selection |
| Phase 4 | ~4h | Queue crossfade (web + mobile) |
| Phase 5 | ~5h | SFX pads (web + mobile) |
| Phase 6 | ~6h | DSP filters (web + mobile) |
| Phase 7 | ~8h | Android build |
| **Total** | **~28h** | |

---

## Deployment Reminders (for future agents)

> ⚠️ **DO NOT use git push/pull for deployment.** This project deploys via `scp` + `npm run build` + `pm2 restart`.  
> ⚠️ **DO NOT skip `npm run build`.** Next.js production mode reads from `.next/`, not `src/`.  
> ⚠️ **DO NOT assume fail2ban.** SSH timeouts are network issues, not bans.  
> ⚠️ **DO NOT use expo-audio for remote URLs.** Download first, play local.  
> ⚠️ **DO NOT use WebView for audio playback.** CORS blocks all requests from inline HTML.
