# Software Requirements Specification (SRS) Addendum
**Date:** May 25, 2026

This addendum defines new requirements for the Egonair Audio Streaming Platform.

## 1. Native Mobile Client Requirements
The project will expand from a Web-only application to include dedicated Native Mobile Apps for iOS and Android.

### Functional Requirements
- **Native Audio Capture:** The app MUST use native OS APIs to capture microphone input directly, bypassing browser WebViews.
- **Background Execution:** The app MUST implement Foreground Services (Android) and Audio Session locking (iOS) to ensure the audio stream is not interrupted when the screen is locked or the app is sent to the background.
- **Backend Parity:** The mobile client MUST connect to the existing Node.js WebSocket backend (`wss://studio.egonair.com/audio`) and REST API.
- **Role Enforcement:** The mobile app MUST enforce the same Role-Based Access Control (Direct DJ, Multi-Station DJ, Single-Station DJ) and timer logic as the Next.js web application.

## 2. Internationalization (i18n) Requirements
The platform must support multiple languages across the entire user interface.

### Supported Languages
1. English (Default)
2. Arabic (Requires RTL Layout)
3. French
4. Spanish
5. German (Deutsch)
6. Portuguese

### Functional Requirements
- **Language Switcher:** Users MUST be able to change their preferred language via a dropdown or settings menu.
- **RTL Support:** When Arabic is selected, the HTML `dir` attribute MUST change to `rtl`, and CSS layouts MUST automatically mirror (e.g., margins, padding, flex-direction) without breaking the aesthetic design.
- **Dictionary Extraction:** All hardcoded text in components MUST be extracted into locale dictionaries (JSON).

## 3. Digital Signal Processing (DSP) / Mic Filters
The web and mobile clients must process raw microphone audio to improve broadcast quality before it is sent to the server.

### Required Audio Nodes (Web Audio API / Native Equivalents)
- **Gain Node (Volume Control):** Allow the DJ to boost or lower their mic input volume.
- **Compressor Node:** Automatically level the audio so loud shouts do not clip and whispers remain audible.
- **Equalizer (EQ):** Provide basic band adjustments (Low/Mid/High) to enhance vocal clarity.
- **Noise Gate:** Automatically mute the stream when the audio input falls below a certain threshold to eliminate background room hum.
