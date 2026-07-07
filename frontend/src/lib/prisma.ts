/**
 * prisma.ts — Singleton Prisma Client for server components / actions.
 *
 * Separate from auth.ts to avoid NextAuth's module-level caching.
 * This file is the single source of truth for Prisma in non-auth code.
 *
 * Usage:
 *   import { db } from "@/lib/prisma";
 *   const result = await db.systemSettings.findUnique(...);
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  db: PrismaClient | undefined;
};

// Clear stale cached instance so a restarted dev server always gets a
// freshly-generated client (prevents "unknown field" errors after db push).
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.db = undefined;
}

export const db: PrismaClient =
  globalForPrisma.db ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.db = db;
