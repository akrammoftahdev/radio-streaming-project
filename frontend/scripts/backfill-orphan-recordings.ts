/**
 * backfill-orphan-recordings.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * One-time utility: insert Recording rows for disk files that have no DB entry.
 * Rules:
 *  - Skip zero-byte files
 *  - Skip non-session files (test files, no YYYYMMDD-HHMMSS pattern)
 *  - Skip if presenter suffix has no matching User in DB
 *  - Skip if local_path already exists in DB
 *  - If both .webm and .mp3 exist for same session → prefer .mp3
 *  - presenterId = null is NOT used (rules: skip unknown presenter)
 *
 * Run from frontend/ directory:
 *   npx tsx scripts/backfill-orphan-recordings.ts
 */

import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "@prisma/client";
// cuid2 replaced with crypto.randomUUID
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

const RECORDINGS_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "backend-audio",
  "debug-recordings"
);

// Parse "session-YYYYMMDD-HHMMSS-<presenterShort>.{webm,mp3}"
// Returns null if pattern doesn't match
function parseSessionFilename(filename: string): {
  basename: string;       // without extension
  ext: string;
  dateStr: string;        // YYYYMMDD
  timeStr: string;        // HHMMSS
  presenterShort: string; // 8-char hex prefix
  startedAt: Date;
} | null {
  // Must match session-YYYYMMDD-HHMMSS-XXXXXXXX.{webm,mp3}
  const m = filename.match(
    /^session-(\d{8})-(\d{6})-([0-9a-f]{8})\.(webm|mp3)$/i
  );
  if (!m) return null;

  const [, dateStr, timeStr, presenterShort, ext] = m;
  const y  = dateStr.slice(0, 4);
  const mo = dateStr.slice(4, 6);
  const d  = dateStr.slice(6, 8);
  const h  = timeStr.slice(0, 2);
  const mi = timeStr.slice(2, 4);
  const s  = timeStr.slice(4, 6);

  // Parse as local machine time (same convention used by backend-audio)
  const startedAt = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`);
  if (isNaN(startedAt.getTime())) return null;

  const basename = filename.replace(/\.(webm|mp3)$/, "");
  return { basename, ext, dateStr, timeStr, presenterShort, startedAt };
}

async function main() {
  console.log("── Orphan Recording Backfill ────────────────────────────────");
  console.log("Recordings dir:", RECORDINGS_DIR);

  // ── Load disk files ────────────────────────────────────────────────────────
  const allFiles = fs.readdirSync(RECORDINGS_DIR);
  const audioFiles = allFiles.filter(f => /\.(webm|mp3)$/i.test(f));
  console.log(`\nDisk files (audio): ${audioFiles.length}`);

  // ── Load existing DB paths ─────────────────────────────────────────────────
  const existingRows = await prisma.recording.findMany({
    select: { localPath: true },
  });
  const existingPaths = new Set(existingRows.map(r => r.localPath));
  console.log(`Existing DB rows: ${existingRows.length}`);

  // ── Load all users for prefix matching ────────────────────────────────────
  const allUsers = await prisma.user.findMany({
    select: { id: true, name: true, username: true },
  });

  // Build prefix → user map (first 8 hex chars of UUID)
  const prefixMap = new Map<string, { id: string; name: string | null; username: string }>();
  for (const u of allUsers) {
    prefixMap.set(u.id.replace(/-/g, "").slice(0, 8), u);
  }

  // ── Group files by session basename ───────────────────────────────────────
  type SessionGroup = {
    basename:  string;
    presenterShort: string;
    startedAt: Date;
    webm?: { filename: string; size: number };
    mp3?:  { filename: string; size: number };
  };

  const sessions = new Map<string, SessionGroup>();

  let zeroByte   = 0;
  let nonSession = 0;

  for (const file of audioFiles) {
    const filePath = path.join(RECORDINGS_DIR, file);
    const stat     = fs.statSync(filePath);

    if (stat.size === 0) {
      console.log(`  ⏭ SKIP zero-byte: ${file}`);
      zeroByte++;
      continue;
    }

    const parsed = parseSessionFilename(file);
    if (!parsed) {
      console.log(`  ⏭ SKIP non-session: ${file}`);
      nonSession++;
      continue;
    }

    const { basename, ext, presenterShort, startedAt } = parsed;

    if (!sessions.has(basename)) {
      sessions.set(basename, { basename, presenterShort, startedAt });
    }
    const grp = sessions.get(basename)!;

    if (ext === "mp3") {
      grp.mp3 = { filename: file, size: stat.size };
    } else {
      grp.webm = { filename: file, size: stat.size };
    }
  }

  console.log(`\nSession groups found: ${sessions.size}`);

  // ── Process each session ──────────────────────────────────────────────────
  let unknownPresenter = 0;
  let alreadyInDb      = 0;
  let insertedMp3      = 0;
  let insertedWebm     = 0;
  let errors           = 0;

  for (const [basename, grp] of sessions) {
    // 1. Resolve presenter
    const user = prefixMap.get(grp.presenterShort);
    if (!user) {
      console.log(`  ⏭ SKIP unknown presenter (${grp.presenterShort}): ${basename}`);
      unknownPresenter++;
      continue;
    }

    // 2. Choose file: prefer mp3
    const chosen = grp.mp3 ?? grp.webm;
    if (!chosen) continue;

    const localPath = chosen.filename;
    const format    = localPath.endsWith(".mp3") ? "audio/mpeg" : "audio/webm";
    const ismp3     = localPath.endsWith(".mp3");

    // 3. Skip if already in DB (check both webm and mp3 variants)
    const alreadyWebm = grp.webm ? existingPaths.has(grp.webm.filename) : false;
    const alreadyMp3  = grp.mp3  ? existingPaths.has(grp.mp3.filename)  : false;
    if (alreadyWebm || alreadyMp3) {
      console.log(`  ⏭ SKIP already in DB: ${basename}`);
      alreadyInDb++;
      continue;
    }

    // 4. Build row
    const startedAt = grp.startedAt;
    // Use file mtime as endedAt if we have no duration
    const filePath  = path.join(RECORDINGS_DIR, localPath);
    const mtime     = fs.statSync(filePath).mtime;
    const endedAt: Date | null = mtime > startedAt ? mtime : null;
    const durationSeconds: number | null =
      endedAt ? Math.round((endedAt.getTime() - startedAt.getTime()) / 1000) : null;

    try {
      await prisma.recording.create({
        data: {
          id:               randomUUID(),
          presenterId:      user.id,
          localPath,
          format,
          startedAt,
          endedAt,
          durationSeconds,
          bytesReceived:    chosen.size,
          // Snapshot fields — populate now since we know the presenter
          presenterNameSnapshot:      user.name ?? user.username,
          presenterUsernameSnapshot:  user.username,
          presenterDeleted:           false,
          stationDeleted:             false,
        },
      });
      console.log(`  ✅ INSERTED (${ismp3 ? "mp3" : "webm"}): ${localPath} → ${user.username}`);
      if (ismp3) insertedMp3++; else insertedWebm++;
    } catch (err) {
      console.error(`  ❌ ERROR inserting ${localPath}:`, (err as Error).message);
      errors++;
    }
  }

  // ── Final summary ─────────────────────────────────────────────────────────
  const afterCount = await prisma.recording.count();

  console.log("\n── Summary ──────────────────────────────────────────────────");
  console.log(`Disk audio files scanned:          ${audioFiles.length}`);
  console.log(`Zero-byte skipped:                 ${zeroByte}`);
  console.log(`Non-session files skipped:         ${nonSession}`);
  console.log(`Session groups:                    ${sessions.size}`);
  console.log(`Unknown presenter skipped:         ${unknownPresenter}`);
  console.log(`Already in DB skipped:             ${alreadyInDb}`);
  console.log(`Inserted (mp3):                    ${insertedMp3}`);
  console.log(`Inserted (webm):                   ${insertedWebm}`);
  console.log(`Errors:                            ${errors}`);
  console.log(`DB recordings before:              ${existingRows.length}`);
  console.log(`DB recordings after:               ${afterCount}`);

  if (unknownPresenter > 0) {
    console.log(`\n⚠️  ${unknownPresenter} session(s) skipped — presenter suffix not in DB.`);
    console.log("   These appear to be recordings from deleted presenter accounts.");
    console.log("   Safe option: re-run with allowNullPresenter flag OR treat as permanently orphaned.");
  }
}

main()
  .catch(err => { console.error("Fatal:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
