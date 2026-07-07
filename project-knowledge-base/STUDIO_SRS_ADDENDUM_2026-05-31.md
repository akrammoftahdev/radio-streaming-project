# Studio SRS Addendum (2026-05-31)

## Feature Updates: Web Broadcasting Studio

### 1. Advanced Audio Mixing
- **Requirement:** The web studio must act as a digital mixer, capable of blending multiple audio sources simultaneously (Microphone, Queue Tracks, Background Music, Sound Effects).
- **Implementation:** Utilizes the Web Audio API to route all sources through a master `GainNode` before sending them to the broadcasting destination (WebRTC/Icecast).

### 2. Track Crossfading
- **Requirement:** Playback transitions between queue items must be seamless, with no dead air.
- **Implementation:** The system calculates a crossfade overlap threshold. When track A nears completion, track B initiates playback at 0% volume, and the system linearly ramps track A's gain down while ramping track B's gain up.

### 3. Voice-Over Ducking
- **Requirement:** Background audio must not overpower the presenter's voice.
- **Implementation:** The system automatically ramps down the background music `GainNode` by a configurable percentage whenever the Microphone track is marked as "active". Once the microphone is closed, the gain is restored.
