# Native App Roadmap (iOS & Android)

**Objective:** To allow presenters to broadcast audio seamlessly even when their phone screen is locked or the app is in the background.

## The Problem
Mobile browsers (Safari/Chrome on iOS and strict Android skins) suspend web-based `getUserMedia` microphone access the instant the browser goes into the background or the screen locks. 

## The Solution
We will build a dedicated, streamlined "Presenter Only" Native Mobile App for both iOS and Android simultaneously using a cross-platform framework like **React Native** or **Expo**.

## Architecture Plan
- **Shared UI:** 80-90% of the codebase will be shared. The app will feature a simplified Login Screen and the Studio UI.
- **Native Audio Bridge:** We will bypass the browser limitations by utilizing native mobile APIs:
  - **iOS:** We will request the `UIBackgroundModes: audio` entitlement. This explicitly tells Apple that the app is an audio broadcasting tool, preventing the OS from suspending the process when locked.
  - **Android:** We will utilize an Android `Foreground Service`. This creates a sticky notification ("Egonair is recording audio") that keeps the process alive indefinitely in the background.
- **WebSocket Streaming:** The native code will capture raw PCM audio, encode it (e.g., using `react-native-webrtc` or a native Opus encoder), and stream it over WebSockets to the existing `backend-audio` infrastructure exactly as the web browser does.

## Timeline Estimate (4 Hours/Day)
**Total Duration: 6 to 9 Days**
- **Days 1-2:** React Native project scaffolding, native module linking, and Login UI.
- **Days 3-4:** Building the native background microphone capture bridge (Foreground Services & UIBackgroundModes).
- **Days 5-6:** Audio encoding and wiring the WebSocket connection to `backend-audio`.
- **Days 7-9:** Physical device testing, debugging, and cross-platform alignment.
