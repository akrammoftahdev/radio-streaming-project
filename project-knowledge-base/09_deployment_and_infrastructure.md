
## 2026-05-20 Root Domain Deployment Findings

### Next.js Build Subpathing
To deploy the application to the root domain (`https://egonair-frontend-729286791857.europe-west1.run.app`) instead of the `/stream` subdirectory, the frontend container must be built with the `SKIP_BASEPATH=1` environment variable. 

This flag strips the hardcoded `basePath: '/stream'` configuration from `next.config.ts` during compilation.

**Build configuration:**
`cloudbuild.yaml` explicitly injects `SKIP_BASEPATH=1` into the Next.js compilation step.
`cloudbuild.yaml` must be triggered via:
`gcloud builds submit --config=cloudbuild.yaml --project=egonair-stream-prod`

### Prisma Schema Synchronization
The Dockerfile forcefully copies `prisma/schema.cloud.prisma` over `prisma/schema.prisma` before generating the client. If `schema.cloud.prisma` is out of date with structural application changes (e.g., the introduction of multi-station `MediaCategory`), the Next.js type checker will throw TypeScript errors during the production build because properties (like `stationId`) will be missing from the generated client. 
**Operational Rule:** Any structural schema changes must be synchronized into BOTH `schema.prisma` and `schema.cloud.prisma`.

### TypeScript Strictness
Standalone scripts located in the `./scripts` folder (such as legacy backend maintenance jobs) can break the Next.js build if their types fall out of sync with the database schema. The `"scripts"` directory has been deliberately excluded from `tsconfig.json` to prevent Next.js from attempting to compile these isolated operational tools.

### Cloud Run Environmental Variables
To complete the migration to the root domain, the Cloud Run instance was configured with:
```bash
AUTH_URL=https://egonair-frontend-729286791857.europe-west1.run.app
NEXTAUTH_URL=https://egonair-frontend-729286791857.europe-west1.run.app
NEXT_PUBLIC_BASE_PATH=""
```
