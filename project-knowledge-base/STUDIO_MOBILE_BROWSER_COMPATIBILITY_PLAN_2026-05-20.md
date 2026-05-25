# Studio Mobile Browser Compatibility Plan — 2026-05-20

## 1. Screens to audit:
- `/studio` preflight
- wait screen
- main StudioUI
- recordings archive

## 2. Mobile risks:
- iOS Safari MediaRecorder/WebM
- HTTPS requirement
- WebSocket URL
- AudioContext suspension
- screen lock
- touch UI
- overflow

## 3. Test matrix:
- Android Chrome
- iPhone Safari
- desktop narrow viewport as early visual check

## 4. First safe step:
- read-only mobile readiness audit
- no code changes first

## 5. What must not be touched initially:
- Cloud
- backend-audio deploy
- Admin RBAC
- settings
- unrelated admin pages
