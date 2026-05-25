# SRS Addendum (2026-05-20 Part 2 - Comprehensive)

## 1. Storage & Persistence Requirements
- **Cloud-Native Storage:** Because the production environment (Google Cloud Run) is ephemeral, the system absolutely requires a permanent external storage bucket for all uploaded media.
- **Firebase Storage Integration:** All system branding assets (logos, login backgrounds) and user media (audio tracks) MUST be uploaded directly to Firebase Storage via the backend `firebase-admin` SDK. The system must store the resulting absolute `storage.googleapis.com` URLs in the database, replacing relative `/uploads/...` paths.

## 2. Infrastructure Identity & Authentication
- **Service Account Identity:** The system natively uses Google Cloud's Application Default Credentials. There is no requirement for a hardcoded `serviceAccountKey.json` file when running in Google Cloud or when utilizing the Google Cloud SDK locally.
- **NextAuth Topology:** NextAuth requires absolute precision in its callback URLs. The `NEXTAUTH_URL` and `AUTH_URL` environment variables must precisely match the deployment domain, including any or no URL subpaths (e.g., must strictly be `https://domain.com` without `/stream` if deployed to the root).

## 3. Domain Configuration
- **Root Domain Deployment:** The system supports being deployed natively to a root domain (without the legacy `/stream` subpath).
- **Build-time Configuration:** The system relies on `--build-arg SKIP_BASEPATH=1` during the Docker image compilation phase to dynamically strip the `/stream` suffix from Next.js internal router and asset paths.
