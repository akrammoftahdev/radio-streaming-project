# Studio Roadmap Update (2026-05-31)

## Current Status
- **Core Mixing:** Microphone, Queue, Background Music, and SFX are successfully mixed together via the Web Audio API.
- **Automations:** Crossfading between tracks and auto-ducking for the microphone are fully operational.
- **Performance:** React rendering bottlenecks tied to audio progress bars have been resolved using refs and `requestAnimationFrame`.

## Next Steps & Remaining Tasks
1. **Audio Context Resiliency:** Implement auto-recovery if the browser suspends the `AudioContext` due to prolonged inactivity or hardware audio device changes (e.g., unplugging a USB microphone).
2. **Visual Feedback:** Consider adding real-time visual equalizers/vu-meters using the `AnalyserNode` from the Web Audio API so the presenter can see the crossfading and ducking occurring visually.
3. **DSP Presets Tuning:** Finalize the default compression and EQ values (`DspPanel`) to ensure maximum broadcast quality before it leaves the browser.
