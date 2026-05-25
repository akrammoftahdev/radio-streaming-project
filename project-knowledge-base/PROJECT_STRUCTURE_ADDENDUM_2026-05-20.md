# Project Structure Addendum (2026-05-20 Comprehensive)

## 1. Firebase Backend Integration
- `frontend/src/lib/firebase-admin.ts`: A new singleton utility that safely initializes the Firebase Admin SDK. It checks if the SDK is already initialized to prevent hot-reload crashes, and relies entirely on ambient Google Cloud credentials (ADC).
- `frontend/src/app/admin/settings/actions.ts`: Heavily modified. Previous Node.js `fs/promises` local filesystem upload logic was completely stripped out and replaced with Google Cloud Storage `bucket.upload()` commands utilizing the `firebase-admin` instance.

## 2. Build & Deployment Architecture
- `frontend/cloudbuild.yaml`: A new file to be created. Will define the Google Cloud Build steps to securely compile the Next.js Docker image directly inside Google Cloud, bypassing the need for local Docker installations.
- `frontend/next.config.ts`: Evaluates the `SKIP_BASEPATH` environment variable during the build process to determine if the `/stream` suffix should be injected into asset paths and client-side router configurations.

## 3. Authentication Error Handling Architecture
- `frontend/src/auth.ts`: 
  - Catches Prisma initialization errors (e.g., database connection strings with missing hosts) silently in the `authorize` callback.
  - Due to NextAuth behavior, these silent catches surface to the frontend client as a generic "CallbackRouteError" or "user and password are wrong", obscuring underlying connection failures.
