# Native App Roadmap Addendum - May 24, 2026

## Future Consideration: iOS Native App Development
Prior to developing the iOS native application, the Android application will undergo extensive functionality testing to ensure all core system features are stable. 

When development for the iOS wrapper begins, the following timelines and constraints must be accounted for:

### 1. Technical Build Phase (1 - 3 Hours)
Since Apple does not support a direct `bubblewrap` TWA alternative in the same manner as Google, the Next.js web application must be wrapped using **Capacitor** (by Ionic) or a lightweight **Swift (WKWebView)** wrapper.
- **Prerequisites:** A Mac development environment (Xcode).
- **Outcome:** A compiled `.ipa` file that can be run on a local iPhone simulator or a physical test device.

### 2. Apple App Store Publishing (3 - 7 Days)
Apple enforces strict guidelines on wrapper applications.
- **Developer Account:** Requires an Apple Developer Account ($99/year), which takes 1-3 days for verification.
- **App Store Review Guidelines (Guideline 4.2):** To avoid rejection for "Minimum Functionality" (i.e., simply being a website in a native wrapper), the iOS app may require the implementation of native features such as:
  - Native push notifications.
  - Native audio controls (Lock screen integration).
  - Offline capabilities.
- **Review Process:** Manual review by Apple typically takes 24-48 hours once submitted.

### 3. Immediate iOS Alternative: PWA "Add to Home Screen"
Currently, iOS users can utilize the Progressive Web App (PWA) manifest by navigating to the application in Safari, opening the Share menu, and selecting **"Add to Home Screen"**. This provides a full-screen, standalone experience utilizing the custom application icon and theme color without requiring App Store approval.
