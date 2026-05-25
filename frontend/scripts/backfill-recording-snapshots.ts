/**
 * backfill-recording-snapshots.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * One-time utility: populate snapshot fields on Recording rows that have null
 * values.  Safe to run multiple times — never overwrites non-null fields, never
 * deletes anything.
 *
 * Run from the frontend/ directory:
 *   node -e "require('@prisma/client')" && \
 *   npx ts-node --project tsconfig.json scripts/backfill-recording-snapshots.ts
 *
 * Or with tsx:
 *   npx tsx scripts/backfill-recording-snapshots.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("── Recording Snapshot Backfill ──────────────────────────────");

  // 1. Fetch all recordings that still have any null snapshot field
  const recordings = await prisma.recording.findMany({
    where: {
      OR: [
        { presenterNameSnapshot:     null },
        { presenterUsernameSnapshot: null },
        { stationNameSnapshot:       null },
        { programTitleSnapshot:      null },
      ],
    },
    select: {
      id:                        true,
      presenterId:               true,
      stationId:                 true,
      programId:                 true,
      presenterNameSnapshot:     true,
      presenterUsernameSnapshot: true,
      stationNameSnapshot:       true,
      programTitleSnapshot:      true,
      // Live relations (may be null if already deleted)
      presenter: { select: { name: true, username: true } },
      station:   { select: { name: true } },
      program:   { select: { title: true } },
    },
  });

  console.log(`Found ${recordings.length} recording(s) with missing snapshot fields.`);

  let updatedCount = 0;

  for (const rec of recordings) {
    // ── Presenter snapshots ────────────────────────────────────────────────
    const presenterNameSnapshot: string | null =
      rec.presenterNameSnapshot ??     // already set — don't overwrite
      rec.presenter?.name ??           // live relation
      null;

    const presenterUsernameSnapshot: string | null =
      rec.presenterUsernameSnapshot ??
      rec.presenter?.username ??
      null;

    // ── Station snapshot ───────────────────────────────────────────────────
    let stationNameSnapshot: string | null = rec.stationNameSnapshot; // may already be set

    if (stationNameSnapshot === null) {
      if (rec.station?.name) {
        // Direct FK still intact
        stationNameSnapshot = rec.station.name;
      } else if (rec.stationId === null && rec.presenterId) {
        // Legacy row: stationId null — try to derive from PresenterStation
        const activeLinks = await prisma.presenterStation.findMany({
          where:  { presenterId: rec.presenterId, isActive: true },
          select: { station: { select: { name: true } } },
          take:   2, // only derive if exactly one active link
        });
        if (activeLinks.length === 1) {
          stationNameSnapshot = activeLinks[0].station?.name ?? null;
        }
        // If 0 or >1 links — leave null (ambiguous)
      }
    }

    // ── Program snapshot ───────────────────────────────────────────────────
    const programTitleSnapshot: string | null =
      rec.programTitleSnapshot ??
      rec.program?.title ??
      null;

    // ── Only update if at least one field changed ──────────────────────────
    const changed =
      presenterNameSnapshot     !== rec.presenterNameSnapshot     ||
      presenterUsernameSnapshot !== rec.presenterUsernameSnapshot ||
      stationNameSnapshot       !== rec.stationNameSnapshot       ||
      programTitleSnapshot      !== rec.programTitleSnapshot;

    if (changed) {
      await prisma.recording.update({
        where: { id: rec.id },
        data: {
          presenterNameSnapshot,
          presenterUsernameSnapshot,
          stationNameSnapshot,
          programTitleSnapshot,
        },
      });
      updatedCount++;
      console.log(
        `  ✅ ${rec.id.slice(0, 12)}… → presenter="${presenterNameSnapshot ?? "null"}" ` +
        `(@${presenterUsernameSnapshot ?? "null"}) station="${stationNameSnapshot ?? "null"}" ` +
        `program="${programTitleSnapshot ?? "null"}"`
      );
    } else {
      console.log(`  ⏭  ${rec.id.slice(0, 12)}… — no changes needed`);
    }
  }

  console.log(`\nDone. Updated ${updatedCount} / ${recordings.length} row(s).`);

  // ── Final summary ──────────────────────────────────────────────────────────
  const remaining = await prisma.recording.count({
    where: { presenterNameSnapshot: null },
  });
  const remainingStation = await prisma.recording.count({
    where: { stationNameSnapshot: null },
  });
  console.log(`Remaining missing presenterNameSnapshot: ${remaining}`);
  console.log(`Remaining missing stationNameSnapshot:   ${remainingStation}`);

  // ── Sample rows ────────────────────────────────────────────────────────────
  console.log("\nSample (up to 5 updated rows):");
  const sample = await prisma.recording.findMany({
    where: { presenterNameSnapshot: { not: null } },
    take: 5,
    select: {
      id:                        true,
      presenterNameSnapshot:     true,
      presenterUsernameSnapshot: true,
      stationNameSnapshot:       true,
      programTitleSnapshot:      true,
      presenterDeleted:          true,
      stationDeleted:            true,
    },
    orderBy: { createdAt: "desc" },
  });
  for (const s of sample) {
    console.log(
      `  ${s.id.slice(0, 14)}… | presenter="${s.presenterNameSnapshot}" ` +
      `(@${s.presenterUsernameSnapshot}) | station="${s.stationNameSnapshot ?? "null"}" ` +
      `| program="${s.programTitleSnapshot ?? "null"}" ` +
      `| presenterDeleted=${s.presenterDeleted} stationDeleted=${s.stationDeleted}`
    );
  }
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
