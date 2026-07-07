# Studio Architecture Addendum (2026-05-31)

## Frontend Audio Architecture Modifications
### `useAudioMixer.ts`
- **Pattern:** Centralized Audio Routing.
- **Implementation:** Manages the singleton `AudioContext`. Exposes a unified `mixerDestRef` that all other hooks (Queue, SFX, BG Music) route their individual `GainNode` outputs into.
- **Microphone Handling:** Captures `navigator.mediaDevices.getUserMedia` and pipes it through a dedicated voice `GainNode`.

### `useQueuePlayer.ts`
- **Pattern:** Node Lifecycle Management.
- **Implementation:** Creates and destroys `BufferSource` or `MediaElementAudioSourceNode` instances dynamically as tracks are loaded and finished. 
- **State Optimization:** Utilizes `useRef` heavily (`playbackRafRef`, `currentlyPlayingRef`) to handle timing and transitions without triggering cascading React renders, bypassing ESLint `setState-in-effect` warnings gracefully.

### UI Integration (`DspPanel.tsx`, `SearchFilter.tsx`)
- **Fixes Applied:** Cleaned up excessive `setState` calls inside `useEffect` that were causing performance bottlenecks during active audio playback. Ensured that state syncing between React and the Web Audio API happens cleanly without cyclic dependencies.
