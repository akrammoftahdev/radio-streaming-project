/**
 * backfill-mp3-recordings.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * One-time utility:
 *  1. Convert every valid session .webm → .mp3 (if .mp3 doesn't exist yet).
 *  2. Insert Recording rows using .mp3 local_path only.
 *  3. Update any existing DB rows with .webm path → .mp3 after successful conversion.
 *  4. Unknown presenters (deleted) → inserted with presenterId=null + presenterDeleted=true.
 *
 * Run from frontend/ directory:
 *   npx tsx scripts/backfill-mp3-recordings.ts
 */

import * as fs            from "fs";
import * as path          from "path";
import * as childProcess  from "child_process";
import { randomUUID }     from "crypto";
import { PrismaClient }   from "@prisma/client";

const prisma = new PrismaClient();

const RECORDINGS_DIR = path.resolve(
  __dirname, "..", "..", "backend-audio", "debug-recordings"
);
const FFMPEG = "/usr/local/bin/ffmpeg";

// ── helpers ──────────────────────────────────────────────────────────────────

function parseSessionFilename(filename: string): {
  basename: string; ext: string; presenterShort: string; startedAt: Date;
} | null {
  const m = filename.match(/^session-(\d{8})-(\d{6})-([0-9a-f]{8})\.(webm|mp3)$/i);
  if (!m) return null;
  const [, d, t, presenterShort, ext] = m;
  const startedAt = new Date(
    `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${t.slice(0,2)}:${t.slice(2,4)}:${t.slice(4,6)}`
  );
  if (isNaN(startedAt.getTime())) return null;
  return { basename: filename.replace(/\.(webm|mp3)$/i, ""), ext, presenterShort, startedAt };
}

function convertToMp3(webmPath: string, mp3Path: string): boolean {
  console.log(`    🔄 Converting ${path.basename(webmPath)} → ${path.basename(mp3Path)} ...`);
  try {
    childProcess.execFileSync(FFMPEG, [
      "-y", "-i", webmPath,
      "-vn", "-codec:a", "libmp3lame", "-b:a", "128k",
      mp3Path,
    ], { stdio: "pipe", timeout: 120_000 });
    const size = fs.statSync(mp3Path).size;
    if (size === 0) { fs.unlinkSync(mp3Path); return false; }
    console.log(`    ✅ Converted → ${(size/1024).toFixed(0)} KB`);
    return true;
  } catch (err) {
    console.error(`    ❌ Conversion failed: ${(err as Error).message.slice(0, 100)}`);
    try { if (fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path); } catch {}
    return false;
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("── MP3 Recording Backfill ───────────────────────────────────");

  // Load existing DB
  const existingRows = await prisma.recording.findMany({
    select: { id: true, localPath: true, presenterId: true }
  });
  console.log(`DB rows before: ${existingRows.length}`);

  // Build set of already-known session basenames (both .webm and .mp3)
  const existingBasenames = new Set(existingRows.map(r => r.localPath.replace(/\.(webm|mp3)$/i, "")));

  // Load all users for prefix matching
  const allUsers = await prisma.user.findMany({ select: { id: true, name: true, username: true } });
  const prefixMap = new Map<string, { id: string; name: string | null; username: string }>();
  for (const u of allUsers) {
    prefixMap.set(u.id.replace(/-/g, "").slice(0, 8), u);
  }

  // Scan disk files
  const allFiles = fs.readdirSync(RECORDINGS_DIR);
  const audioFiles = allFiles.filter(f => /\.(webm|mp3)$/i.test(f));
  console.log(`Disk audio files: ${audioFiles.length}\n`);

  // Group by session basename
  type Group = {
    basename: string; presenterShort: string; startedAt: Date;
    webm?: { file: string; size: number };
    mp3?:  { file: string; size: number };
  };
  const sessions = new Map<string, Group>();
  let zeroByte = 0, nonSession = 0;

  for (const file of audioFiles) {
    const stat = fs.statSync(path.join(RECORDINGS_DIR, file));
    if (stat.size === 0) { zeroByte++; continue; }
    const parsed = parseSessionFilename(file);
    if (!parsed) { nonSession++; continue; }
    const { basename, ext, presenterShort, startedAt } = parsed;
    if (!sessions.has(basename)) sessions.set(basename, { basename, presenterShort, startedAt });
    const g = sessions.get(basename)!;
    if (ext === "mp3") g.mp3 = { file, size: stat.size };
    else               g.webm = { file, size: stat.size };
  }

  console.log(`Zero-byte skipped: ${zeroByte}`);
  console.log(`Non-session skipped: ${nonSession}`);
  console.log(`Session groups: ${sessions.size}\n`);

  // ── Step A: Fix existing .webm DB rows → convert + update ─────────────────
  let webmRowsFixed = 0;
  for (const row of existingRows) {
    if (!row.localPath.endsWith(".webm")) continue;
    const basename = row.localPath.replace(/\.webm$/i, "");
    const webmPath = path.join(RECORDINGS_DIR, row.localPath);
    const mp3File  = basename + ".mp3";
    const mp3Path  = path.join(RECORDINGS_DIR, mp3File);

    console.log(`📝 Existing .webm DB row: ${row.localPath}`);

    // Already has mp3?
    if (fs.existsSync(mp3Path) && fs.statSync(mp3Path).size > 0) {
      console.log(`   Found existing mp3 on disk → updating DB row`);
    } else if (fs.existsSync(webmPath) && fs.statSync(webmPath).size > 0) {
      if (!convertToMp3(webmPath, mp3Path)) {
        console.log(`   ⚠️  Conversion failed — leaving row as .webm`);
        continue;
      }
    } else {
      console.log(`   ⚠️  WebM file missing or zero — cannot convert`);
      continue;
    }

    const mp3Size = fs.statSync(mp3Path).size;
    await prisma.recording.update({
      where: { id: row.id },
      data:  { localPath: mp3File, format: "audio/mpeg", bytesReceived: mp3Size },
    });
    console.log(`   ✅ Updated DB row: ${row.localPath} → ${mp3File}`);
    // Mark basename as handled
    existingBasenames.add(basename);
    webmRowsFixed++;
  }

  // ── Step B: Convert + insert missing sessions ──────────────────────────────
  let conversionFailed = 0;
  let insertedKnown    = 0;
  let insertedOrphan   = 0;

  for (const [basename, grp] of sessions) {
    // Already in DB? skip
    if (existingBasenames.has(basename)) {
      console.log(`⏭ Already in DB: ${basename}`);
      continue;
    }

    // Resolve presenter
    const user = prefixMap.get(grp.presenterShort);
    const presenterIdVal:             string | undefined = user?.id ?? undefined;
    const presenterNameSnapshotVal:   string | undefined = user?.name ?? user?.username ?? `presenter_${grp.presenterShort}`;
    const presenterUsernameSnapshot:  string | undefined = user?.username ?? undefined;
    const presenterDeleted:           boolean       = !user;

    // Ensure we have a .mp3
    let mp3File: string;
    let mp3Size: number;

    if (grp.mp3) {
      // Already have .mp3 on disk — use it directly
      mp3File = grp.mp3.file;
      mp3Size = grp.mp3.size;
    } else if (grp.webm) {
      // Need to convert
      const webmPath = path.join(RECORDINGS_DIR, grp.webm.file);
      mp3File = basename + ".mp3";
      const mp3Path = path.join(RECORDINGS_DIR, mp3File);

      if (fs.existsSync(mp3Path) && fs.statSync(mp3Path).size > 0) {
        mp3Size = fs.statSync(mp3Path).size;
        console.log(`⚡ ${basename} — MP3 already exists on disk (${(mp3Size/1024).toFixed(0)} KB)`);
      } else {
        console.log(`🎵 ${basename} — converting .webm → .mp3`);
        const ok = convertToMp3(webmPath, mp3Path);
        if (!ok) {
          console.log(`   ❌ Skipped: ${basename}`);
          conversionFailed++;
          continue;
        }
        mp3Size = fs.statSync(mp3Path).size;
      }
    } else {
      continue; // no usable file
    }

    // Calculate timing
    const startedAt      = grp.startedAt;
    const mp3FullPath    = path.join(RECORDINGS_DIR, mp3File);
    const mtime          = fs.statSync(mp3FullPath).mtime;
    const endedAt: Date | null  = mtime > startedAt ? mtime : null;
    const durationSeconds: number | null =
      endedAt ? Math.round((endedAt.getTime() - startedAt.getTime()) / 1000) : null;

    await prisma.recording.create({
      data: {
        id:                       randomUUID(),
        presenterId:              presenterIdVal,
        localPath:                mp3File,
        format:                   "audio/mpeg",
        startedAt,
        endedAt,
        durationSeconds,
        bytesReceived:            mp3Size,
        presenterNameSnapshot:    presenterNameSnapshotVal,
        presenterUsernameSnapshot,
        presenterDeleted,
        stationDeleted:           false,
      },
    });

    if (user) {
      console.log(`✅ Inserted (known presenter ${user.username}): ${mp3File}`);
      insertedKnown++;
    } else {
      console.log(`✅ Inserted (orphan presenter_${grp.presenterShort}): ${mp3File}`);
      insertedOrphan++;
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const afterCount = await prisma.recording.count();
  const allAfter   = await prisma.recording.findMany({ select: { localPath: true }, orderBy: { startedAt: "desc" } });
  const webmLeft   = allAfter.filter(r => r.localPath.endsWith(".webm")).length;

  console.log("\n── Summary ─────────────────────────────────────────────────");
  console.log(`DB recordings before:              ${existingRows.length}`);
  console.log(`Existing .webm rows updated:       ${webmRowsFixed}`);
  console.log(`Conversions failed:                ${conversionFailed}`);
  console.log(`Inserted (known presenter):        ${insertedKnown}`);
  console.log(`Inserted (orphan/deleted):         ${insertedOrphan}`);
  console.log(`DB recordings after:               ${afterCount}`);
  console.log(`Remaining .webm local_paths in DB: ${webmLeft}`);
  console.log(`All DB paths are .mp3:             ${webmLeft === 0 ? "YES ✅" : "NO ❌"}`);
  console.log("\nAll DB local_path values:");
  allAfter.slice(0, 10).forEach(r => console.log("  ", r.localPath));
  if (allAfter.length > 10) console.log(`  ...and ${allAfter.length - 10} more`);
}

main()
  .catch(err => { console.error("Fatal:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
