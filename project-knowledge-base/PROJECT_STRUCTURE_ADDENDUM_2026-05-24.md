# Project Structure Addendum - May 24, 2026

## 1. New Directories and Files
The following directories and files have been introduced to support the Android native application build.

### 1.1 VPS Directory `/root/android-app/`
This directory exists only on the VPS build environment and contains the generated Google `bubblewrap` Android project.
- `android.keystore`: The generated secure keystore containing the signing keys.
- `app-release-bundle.aab`: The compiled Play Store App Bundle.
- `app-release-signed.apk`: The compiled Android package for sideloading.
- `twa-manifest.json`: The bubblewrap configuration file mapping the Next.js manifest to the Android app.

### 1.2 Next.js PWA Assets & Routes
The Next.js `frontend` directory has been updated to serve static assets required for the PWA and TWA features.
- `/frontend/src/app/manifest.ts`: Generates the dynamic `manifest.webmanifest` controlling the app's installation profile, theme colors, icons, and package ID.
- `/frontend/public/.well-known/assetlinks.json`: Contains the SHA-256 digital fingerprint connecting `studio.egonair.com` to `com.onnet.studio`.
- `/frontend/public/RadioStudio.apk` & `/frontend/public/RadioStudio.aab`: Hosted download links for the compiled Android application.
