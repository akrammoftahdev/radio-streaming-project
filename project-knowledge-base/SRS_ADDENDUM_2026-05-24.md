# Software Requirements Specification (SRS) Addendum - May 24, 2026

## 1. Native Mobile Experience Requirements
The scope of the web application has been officially extended to include a native mobile experience for the Android platform.

### 1.1 Trusted Web Activity (TWA) Integration
- **Requirement:** The application MUST function as a standalone native app on Android using the TWA protocol.
- **Specification:** The TWA wrapper maps the Next.js PWA directly to the Android OS. The application must present itself without a browser URL bar or browser navigation controls.
- **Implementation Status:** Completed. Configured via `bubblewrap` and Digital Asset Links (`assetlinks.json`).

### 1.2 Android Package Details
- **App Name:** Radio Studio
- **Package ID:** `com.onnet.studio`
- **Primary Theme Color:** Dark Red (`#8B0000`)
- **Distribution:** 
  - `APK` for manual distribution and direct sideloading.
  - `AAB` (App Bundle) for Play Store deployment.

### 1.3 System Exclusions & Static Routing
- **Requirement:** Specific endpoints related to the PWA and TWA verification MUST bypass the application's authentication middleware.
- **Specification:** Paths for `/.well-known/assetlinks.json`, `/manifest.webmanifest`, `/RadioStudio.apk`, and `/RadioStudio.aab` must be publicly accessible to ensure successful TWA verification and user distribution.
