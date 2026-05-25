import { NextRequest, NextResponse } from "next/server";
import { auth, prisma } from "@/auth";
import path from "path";
import fs from "fs";

/**
 * GET /api/recordings/[filename]
 * ──────────────────────────────────────────────────────────────────────────────
 * Serves a local WebM recording file to authenticated users.
 *
 * Access rules:
 *   ADMIN  — can download any recording.
 *   PRESENTER — can download only recordings where Recording.presenterId
 *               matches their own session user ID.
 *
 * Security measures:
 *   • Requires a valid NextAuth session (401 if missing).
 *   • filename must end with ".webm" (400 otherwise).
 *   • filename must not contain "/" or "\" (400 otherwise).
 *   • path.basename() is applied as a second-pass sanitiser.
 *   • File is resolved only within RECORDINGS_BASE_DIR — no traversal possible.
 *   • DB row must exist for the filename (404 if not found).
 *   • PRESENTER ownership verified against DB row (403 if mismatch).
 *
 * Query params:
 *   ?download=1  — sets Content-Disposition: attachment (triggers save dialog)
 *                  default: inline (browser plays in-page)
 *
 * HTTP Range support (Group 4.1):
 *   Supports Range request header for audio seeking.
 *   • No Range header  → 200, full file (original behaviour preserved).
 *   • Valid Range      → 206 Partial Content with Content-Range header.
 *   • Invalid Range    → 416 Range Not Satisfiable.
 *   Always includes Accept-Ranges: bytes so browsers know seeking is available.
 *
 * Environment:
 *   RECORDINGS_BASE_DIR — absolute or relative path to the recordings directory.
 *   Defaults to: <frontend_root>/../backend-audio/debug-recordings
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  // ── 1. Auth check ──────────────────────────────────────────────────────────
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const userRole        = (session.user as { role?: string }).role ?? "";
  const userId          = session.user.id ?? "";
  const isAdmin         = userRole === "ADMIN";
  const isPresenter     = userRole === "PRESENTER";
  const isStationManager = userRole === "STATION_MANAGER";

  if (!isAdmin && !isPresenter && !isStationManager) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  // ── 2. Filename validation ─────────────────────────────────────────────────
  const { filename: rawFilename } = await params;

  // Reject any path separator characters — these indicate traversal attempts.
  if (rawFilename.includes("/") || rawFilename.includes("\\")) {
    return NextResponse.json(
      { error: "Invalid filename." },
      { status: 400 }
    );
  }

  // Only serve .webm and .mp3 files — no other formats stored by backend-audio.
  const isWebm = rawFilename.endsWith(".webm");
  const isMp3  = rawFilename.endsWith(".mp3");
  if (!isWebm && !isMp3) {
    return NextResponse.json(
      { error: "Invalid file type. Only .webm and .mp3 recordings are served here." },
      { status: 400 }
    );
  }
  const mimeType = isMp3 ? "audio/mpeg" : "audio/webm";

  // Second-pass sanitiser: path.basename strips any remaining directory components.
  const filename = path.basename(rawFilename);

  // Double-check after basename (should be identical, but be explicit).
  if (filename !== rawFilename) {
    return NextResponse.json({ error: "Invalid filename." }, { status: 400 });
  }

  // ── 3. DB lookup ───────────────────────────────────────────────────────────
  let recording: {
    id:              string;
    presenterId:     string | null;
    stationId:       string | null;
    directDjRadioId: string | null;
  } | null = null;
  try {
    recording = await prisma.recording.findFirst({
      where: { localPath: filename },
      select: { id: true, presenterId: true, stationId: true, directDjRadioId: true },
    });
  } catch (err) {
    console.error("[recordings/serve] DB error:", (err as Error).message);
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }

  if (!recording) {
    return NextResponse.json(
      { error: "Recording not found." },
      { status: 404 }
    );
  }

  // ── 4. Ownership / scope check ────────────────────────────────────────────
  if (isPresenter && recording.presenterId !== userId) {
    // Presenter is trying to access another presenter's recording.
    return NextResponse.json(
      { error: "Forbidden. This recording does not belong to you." },
      { status: 403 }
    );
  }

  if (isStationManager) {
    // STATION_MANAGER: Direct DJ recordings are always blocked.
    if (recording.directDjRadioId !== null) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    let hasAccess = false;
    try {
      if (recording.stationId !== null) {
        // New recording: stationId is set — verify it is assigned to this manager.
        const assignment = await prisma.stationManagerAssignment.findFirst({
          where: { managerId: userId, stationId: recording.stationId, isActive: true },
          select: { id: true },
        });
        hasAccess = !!assignment;
      } else {
        // Legacy recording: stationId is null (created before backfill).
        // Safe derivation: allow if the presenter is currently on one of
        // this manager's assigned stations via PresenterStation.
        const presenterStation = await prisma.presenterStation.findFirst({
          where: {
            presenterId: recording.presenterId ?? undefined,
            isActive:    true,
            station: {
              stationManagers: {
                some: { managerId: userId, isActive: true },
              },
            },
          },
          select: { id: true },
        });
        hasAccess = !!presenterStation;
      }
    } catch (err) {
      console.error("[recordings/serve] SM scope check error:", (err as Error).message);
      return NextResponse.json({ error: "Internal error." }, { status: 500 });
    }

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Forbidden. Recording not accessible for your assigned stations." },
        { status: 403 }
      );
    }
  }

  // ── 5. Resolve file path ───────────────────────────────────────────────────
  const recordingsBaseDir =
    process.env.RECORDINGS_BASE_DIR ??
    path.resolve(process.cwd(), "..", "backend-audio", "debug-recordings");

  // path.join then path.resolve ensures no symlink / relative escape.
  const absoluteFilePath = path.resolve(
    path.join(recordingsBaseDir, filename)
  );

  // Verify the resolved path is still inside the recordings directory.
  // This is the definitive traversal guard.
  const resolvedBase = path.resolve(recordingsBaseDir);
  if (!absoluteFilePath.startsWith(resolvedBase + path.sep) &&
      absoluteFilePath !== resolvedBase) {
    console.warn(
      `[recordings/serve] Path traversal attempt blocked: ` +
      `resolved=${absoluteFilePath} base=${resolvedBase}`
    );
    return NextResponse.json({ error: "Invalid filename." }, { status: 400 });
  }

  // ── 6. File existence check ────────────────────────────────────────────────
  if (!fs.existsSync(absoluteFilePath)) {
    console.warn(
      `[recordings/serve] File not found on disk: ${absoluteFilePath} ` +
      `(recording id=${recording.id})`
    );
    return NextResponse.json(
      { error: "Recording file not found on disk." },
      { status: 404 }
    );
  }

  // ── 7. Get file size ───────────────────────────────────────────────────────
  let fileSize: number;
  try {
    fileSize = fs.statSync(absoluteFilePath).size;
  } catch (err) {
    console.error("[recordings/serve] stat error:", (err as Error).message);
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }

  // ?download=1 → attachment (save dialog); default → inline (browser plays)
  const wantsDownload = req.nextUrl.searchParams.get("download") === "1";
  const disposition = wantsDownload
    ? `attachment; filename="${filename}"`
    : `inline; filename="${filename}"`;

  // ── 8. Range request handling (Group 4.1) ─────────────────────────────────
  const rangeHeader = req.headers.get("range");

  if (rangeHeader) {
    // Parse the Range header.  We only support a single byte range.
    // Format: "bytes=<start>-<end>" where end is optional.
    const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);

    if (!match) {
      // Unsupported range syntax.
      return new Response(null, {
        status: 416,
        headers: {
          "Content-Range":  `bytes */${fileSize}`,
          "Accept-Ranges":  "bytes",
        },
      });
    }

    const startStr = match[1];
    const endStr   = match[2];

    // Parse boundaries — if start is omitted it means "last N bytes" (suffix range)
    // which we don't support; return 416 in that case.
    if (startStr === "") {
      return new Response(null, {
        status: 416,
        headers: {
          "Content-Range":  `bytes */${fileSize}`,
          "Accept-Ranges":  "bytes",
        },
      });
    }

    const start = parseInt(startStr, 10);
    const end   = endStr !== "" ? parseInt(endStr, 10) : fileSize - 1;

    // Validate range bounds.
    if (
      isNaN(start) || isNaN(end) ||
      start < 0 || end >= fileSize || start > end
    ) {
      return new Response(null, {
        status: 416,
        headers: {
          "Content-Range":  `bytes */${fileSize}`,
          "Accept-Ranges":  "bytes",
        },
      });
    }

    const chunkLength = end - start + 1;

    // Read only the requested byte range.
    let chunk: Buffer;
    try {
      const fd = fs.openSync(absoluteFilePath, "r");
      chunk = Buffer.alloc(chunkLength);
      fs.readSync(fd, chunk, 0, chunkLength, start);
      fs.closeSync(fd);
    } catch (err) {
      console.error("[recordings/serve] Range read error:", (err as Error).message);
      return NextResponse.json({ error: "Internal error." }, { status: 500 });
    }

    console.log(
      `[recordings/serve] Range serving ${filename} ` +
      `bytes ${start}-${end}/${fileSize} ` +
      `to ${userRole} ${userId}`
    );

    return new Response(new Uint8Array(chunk), {
      status: 206,
      headers: {
        "Content-Type":        mimeType,
        "Content-Disposition": disposition,
        "Content-Length":      chunkLength.toString(),
        "Content-Range":       `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges":       "bytes",
        "Cache-Control":       "no-store",
      },
    });
  }

  // ── 9. Full file response (no Range header) ────────────────────────────────
  let fileBuffer: Buffer;
  try {
    fileBuffer = fs.readFileSync(absoluteFilePath);
  } catch (err) {
    console.error("[recordings/serve] File read error:", (err as Error).message);
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }

  console.log(
    `[recordings/serve] Full serving ${filename} ` +
    `to ${userRole} ${userId} ` +
    `(${fileBuffer.length} bytes, ${wantsDownload ? "attachment" : "inline"})`
  );

  return new Response(new Uint8Array(fileBuffer), {
    status: 200,
    headers: {
      "Content-Type":        mimeType,
      "Content-Disposition": disposition,
      "Content-Length":      fileBuffer.length.toString(),
      "Accept-Ranges":       "bytes",
      // Prevent browsers from caching served recordings — they are user-private.
      "Cache-Control":       "no-store",
    },
  });
}
