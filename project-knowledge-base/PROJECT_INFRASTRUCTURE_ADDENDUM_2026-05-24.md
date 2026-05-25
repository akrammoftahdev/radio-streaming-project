# Project Infrastructure Addendum - May 24, 2026

## 1. VPS Android Build Capabilities
The Hostinger VPS (`195.35.48.184`) now functions as the primary build agent for the Android Trusted Web Activity application.

### 1.1 JDK & Bubblewrap Configuration
- **Open JDK:** Installed via `apt-get install default-jdk` to provide the required Java environment for Android build tools.
- **Node.js/npm:** Utilized to execute `npx @bubblewrap/cli` directly.
- **Android SDK:** Bubblewrap was authorized to automatically download and accept licenses for the required Android SDK tools (build-tools, platforms).

### 1.2 Digital Asset Links Integration
To verify ownership for the Android package `com.onnet.studio`, a Digital Asset Link was created.
- **Location:** Hosted statically by Next.js from `/var/www/egonair/frontend/public/.well-known/assetlinks.json`.
- **Nginx & Next.js Proxy:** The `frontend` Next.js PM2 process (`id: 0`) configuration allows `.well-known` directory files to be served directly, bypassing NextAuth session checks.

### 1.3 Deployment Lifecycle for Android
When the application changes, the Next.js `manifest.ts` handles the UI properties. If the core package, version code, or keystore changes, a new build is required on the VPS via `bubblewrap build` within `/root/android-app/`. The resulting artifacts (`.apk`, `.aab`) are then manually copied over to `/var/www/egonair/frontend/public/` to be served.
