# KB Update Addendum (2026-05-20 Part 2 - Comprehensive)

## 1. Stateless File Storage (Firebase Migration)
- **Issue:** Cloud Run is completely stateless. The original codebase relied on local Node.js `fs.writeFile` to save System Settings branding files (like logos) to `public/uploads/system/`. When the Cloud Run container goes to sleep or scales, those files are permanently deleted, breaking the UI.
- **Resolution:** We completely rewrote the System Settings upload logic to use the `firebase-admin` SDK. Branding images are now securely uploaded to the Google Cloud Firebase Storage bucket (`egonair-stream-prod.firebasestorage.app`).
- **Knowledge:** 
  - Firebase Admin SDK on Cloud Run automatically authenticates via Application Default Credentials (ADC) attached to the service account. Do NOT pass explicit service account JSON files to `admin.initializeApp()`.
  - The older Firebase Storage domain suffix (`.appspot.com`) is deprecated for newer projects. We must use the exact bucket name `egonair-stream-prod.firebasestorage.app` to prevent 404 Bucket Not Found errors.

## 2. Cloud SQL Connection & Database Initialization
- **Issue:** The live Next.js frontend crashed with generic "user and password are wrong" errors because it could not connect to the production PostgreSQL database.
- **Resolution:** We correctly configured the Google Secret Manager.
- **Knowledge:**
  - Prisma throws an "empty host" connection error if a Unix socket string does not explicitly include `localhost` after the `@` symbol.
  - The correct `DATABASE_URL` format for Cloud Run is: `postgresql://USER:PASS@localhost/DATABASE?host=/cloudsql/INSTANCE_CONNECTION_NAME`.
  - NextAuth suppresses deep database initialization errors during the `authorize` callback. If the DB connection string is malformed, NextAuth returns `null`, resulting in a misleading "user and password are wrong" error on the frontend.
  - To run manual Prisma scripts against Cloud SQL from a local machine, the local IP must be explicitly whitelisted in the Cloud SQL Authorized Networks, and removed immediately afterward.

## 3. Deployment & Build Strategy (Root Domain Fix)
- **Issue:** The user requested the `/stream` suffix to be removed so the app runs natively on the root domain.
- **Knowledge:** The `/stream` basepath is hardcoded inside `next.config.ts`. It can only be disabled at **build time** by passing `--build-arg SKIP_BASEPATH=1` to the Docker build command. Because Docker is not installed locally on the Mac, we must use Google Cloud Build (`gcloud builds submit --config=cloudbuild.yaml`) to natively compile the code in the cloud and push the new image to Artifact Registry.
