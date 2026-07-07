# Studio Knowledge Base Update (2026-05-31)

## Session Summary: Studio Audio Engine & Mixing

### Good Stuff & Accomplishments
1. **Web Audio API Mixer Engine**: Established a robust digital mixer (`useAudioMixer`) using the browser's native Web Audio API, effectively turning the browser into a broadcasting studio.
2. **Queue Crossfading**: Successfully implemented seamless track-to-track crossfading in `useQueuePlayer`. Using `gainNode.gain.linearRampToValueAtTime`, the system smoothly overlaps audio elements instead of abruptly cutting them.
3. **Mic Auto-Ducking**: Built a responsive Background Music player that listens to the microphone state. When the microphone is opened, the system automatically "ducks" (lowers) the background music volume to ensure the presenter's voice cuts through.
4. **Instant SFX Integration**: Implemented a sound effects layer that can trigger instant audio elements overlapping the main mix without interrupting the broadcast queue.

### Bad Stuff, Blockers & Problems
1. **React Strict Mode Memory Leaks**: Development mode's double-invocation of `useEffect` caused duplicate `AudioContext` instances, resulting in overlapping/echoing audio.
2. **Auto-Play Policy Blocks**: Browsers (Chrome/Safari) aggressively blocked audio playback because the context was initializing before the presenter physically interacted with the page.
3. **Stale Closures & Race Conditions**: Audio event listeners (like `onended`) and `setInterval` loops inside custom hooks were capturing stale React state, causing the queue to freeze or skip incorrectly.
4. **Cascading Renders**: Synchronously calling `setState` inside rapidly firing audio effects (like progress updates) triggered severe performance degradation and React warnings.

### How We Fixed Them
1. **Refs over State for Audio Nodes**: Migrated all critical Web Audio API elements (`AudioContext`, `GainNode`, etc.) into `useRef` hooks to persist them across renders and survive Strict Mode double-mounts.
2. **Interaction Locks**: Implemented an explicit "Start/Connect" interaction flow so the `AudioContext` is only instantiated or resumed (`resume()`) after a direct user click.
3. **Mutable Refs for Callbacks**: To solve stale closures, we mirrored critical state (like `currentlyPlayingItem`) into refs so that asynchronous audio callbacks could always read the latest values without re-binding the event listeners.
4. **Optimized Render Loops**: Throttled the `playbackProgress` state updates and offloaded rapid UI progress calculations to `requestAnimationFrame` to prevent React from buckling under constant state changes.
