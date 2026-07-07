# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# EGONAIR Frontend — Cloud Run Dockerfile
# Multi-stage: deps → builder → runner
# Target: Node 20 Alpine (smallest viable image for Next.js production)
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts

# ── Stage 2: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
# openssl is required by Prisma engine binaries during `prisma generate`
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Copy all deps (including devDeps for build tools like prisma)
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# ── Swap Prisma schema for Cloud (PostgreSQL) ─────────────────────────────────
# schema.cloud.prisma = postgresql (Cloud SQL) + correct binaryTargets for Alpine.
# We copy the cloud schema over the default here so the generated Prisma
# client targets PostgreSQL. This does NOT affect local dev or the VPS.
RUN cp prisma/schema.cloud.prisma prisma/schema.prisma

# Generate Prisma client (PostgreSQL target, linux-musl-openssl-3.0.x binary)
RUN npx prisma generate

# Build-time env vars (non-secret, baked into bundle)
# NEXT_PUBLIC_WS_URL is baked into the browser JS bundle at build time.
# Pass it via --build-arg when building the image:
#   docker build --build-arg NEXT_PUBLIC_WS_URL=wss://egonair-backend-audio-YOUR-CLOUD-RUN-URL.run.app ...
ARG NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL

# Pass SKIP_BASEPATH=1 via --build-arg to build with root paths (no /stream basePath).
# Default is empty — keeps /stream basePath for egonair.com/stream deployment.
ARG SKIP_BASEPATH=
ENV SKIP_BASEPATH=$SKIP_BASEPATH
# Triggers standalone output mode in next.config.ts
ENV DOCKER_BUILD=true

# ── Build-time secret STUBS ───────────────────────────────────────────────────
# These are DUMMY placeholder values used ONLY so `next build` can complete.
# They are NOT real secrets. They are NOT used at runtime.
#
# Real values are injected by Cloud Run from Secret Manager at container
# startup — they override these stubs completely.
#
# Why needed: Next.js static page collection imports API route modules, which
# import encryption.ts and audio-token.ts. These now validate secrets lazily
# (at call time, not module load time), so build succeeds with stubs.
# A DATABASE_URL stub prevents Prisma client from throwing on import.
#
# DO NOT replace these with real secrets. DO NOT bake real secrets here.
# ─────────────────────────────────────────────────────────────────────────────
ENV ENCRYPTION_KEY="build-time-stub-key-not-real-xxx"
ENV AUTH_SECRET="build-time-stub-auth-secret-not-real-placeholder-xx"
ENV AUDIO_TOKEN_SECRET="build-time-stub-audio-token-secret-placeholder"
ENV DATABASE_URL="postgresql://stub:stub@localhost:5432/stub"
ENV NEXTAUTH_URL="https://localhost/stream"
ENV AUTH_URL="https://localhost"
ENV AUTH_TRUST_HOST="true"

RUN rm -f .env .env.local
RUN npm run build

# ── Stage 3: Production runner ────────────────────────────────────────────────
FROM node:20-alpine AS runner
# openssl is required by Prisma engine at runtime
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy only what Next.js needs to run
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Prisma migrations (applied at startup via entrypoint)
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs

EXPOSE 3000

# Cloud Run sets PORT env var — Next.js standalone server respects it
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# NODE_ENV and all secrets are injected by Cloud Run at runtime from Secret Manager.
# The build-time stubs above are NOT present in this runner stage — they were
# only set in the builder stage and do not carry over.
ENV NODE_ENV=production

CMD ["node", "server.js"]
