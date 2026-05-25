# Project Infrastructure Addendum (2026-05-20 Part 2 - Comprehensive)

## 1. Google Cloud Storage (Firebase)
- Added `egonair-stream-prod.firebasestorage.app` as a core architectural component.
- The Firebase Admin SDK interfaces directly with this bucket securely from Cloud Run.
- **Rule:** Never use local persistent volumes for the frontend. All media and branding assets must be sent to this bucket.

## 2. Cloud SQL Connectivity (PostgreSQL)
- Prisma requires Cloud SQL Unix Socket connection strings to explicitly define the `localhost` keyword in the URI segment.
- Valid format: `postgresql://USER:PASS@localhost/DB_NAME?host=/cloudsql/PROJECT:REGION:INSTANCE`
- Invalid format (causes `empty host` parsing crash): `postgresql://USER:PASS@/DB_NAME?host=/cloudsql/PROJECT:REGION:INSTANCE`
- Local CLI Migrations against Cloud SQL require explicitly adding the developer's IP address to the `egonair-pg` Authorized Networks before execution, and clearing it afterward.

## 3. Google Cloud Build
- Google Cloud Build replaces the requirement for a local Docker daemon.
- Build configuration uses `cloudbuild.yaml` to execute native `docker build` commands using the official cloud builder containers.
- Arguments like `--build-arg SKIP_BASEPATH=1` are safely injected via the `args` array in the `cloudbuild.yaml` definition.

## 4. Google Secret Manager configurations
- `DATABASE_URL`: Adjusted to adhere to the strict `@localhost` Unix Socket format.
- `NEXTAUTH_URL` and `AUTH_URL`: Must exactly match the deployment topology (e.g., if the app is hosted on the root domain without `/stream`, these secrets must explicitly drop the `/stream` suffix). Failure to align these secrets precisely with Next.js's `basePath` configuration will result in authentication redirects hitting 404 dead ends.
