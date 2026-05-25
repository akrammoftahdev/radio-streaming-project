import { NextRequest, NextResponse } from "next/server";
import { auth, prisma } from "@/auth";
import path from "path";
import fs from "fs";

/**
 * GET /api/tracks/[id]
 * ─────────────────────────────────────────────────────────────────────────────
 * Serves a MediaTrack audio file to authenticated users.
 *
 * Access rules:
 *   ADMIN     — can stream any track.
 *   PRESENTER — can stream any active track (category ownership check
 *               deferred to a future hardening pass).
 *
 * Security measures:
 *   • Requires a valid NextAuth session (401 if missing).
 *   • Only ADMIN / PRESENTER roles are accepted (403 otherwise).
 *   • Track must exist in MediaTrack table (404 if not).
 *   • fileUrl must not contain ".." segments (400 if it does).
 *   • Resolved absolute path is verified to be inside public/ (traversal guard).
 *   • File must exist on disk (404 if missing).
 *
 * HTTP Range support:
 *   Supports Range request header — required for browser audio seeking.
 *   • No Range header  → 200, full file.
 *   • Valid Range      → 206 Partial Content.
 *   • Invalid Range    → 416 Range Not Satisfiable.
 *   Always includes Accept-Ranges: bytes.
 *
 * Content-Type:
 *   Uses track.mimeType from DB if set, falls back to "audio/mpeg".
 *
 * TODO (future hardening):
 *   Verify that PRESENTER may only access tracks belonging to categories
 *   they own (ownerId === session.user.id) or ADMIN-owned categories.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // ── 1. Auth check ───────────────────────────────────────────────────────────
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const userRole    = (session.user as { role?: string }).role ?? "";
  const isAdmin     = userRole === "ADMIN";
  const isPresenter = userRole === "PRESENTER";

  if (!isAdmin && !isPresenter) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  // ── 2. Resolve track id ─────────────────────────────────────────────────────
  const { id: trackId } = await params;

  if (!trackId || trackId.includes("/") || trackId.includes("\\")) {
    return NextResponse.json({ error: "Invalid track id." }, { status: 400 });
  }

  // ── 3. DB lookup ────────────────────────────────────────────────────────────
  let track: { fileUrl: string; mimeType: string | null } | null = null;
  try {
    track = await prisma.mediaTrack.findFirst({
      where:  { id: trackId, isActive: true },
      select: { fileUrl: true, mimeType: true },
    });
  } catch (err) {
    console.error("[tracks/serve] DB error:", (err as Error).message);
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }

  if (!track) {
    return NextResponse.json({ error: "Track not found." }, { status: 404 });
  }

  // ── 4. Validate and resolve fileUrl ─────────────────────────────────────────
  // Reject any path traversal markers.
  if (track.fileUrl.includes("..")) {
    console.warn(`[tracks/serve] fileUrl contains '..': ${track.fileUrl}`);
    return NextResponse.json({ error: "Invalid file path." }, { status: 400 });
  }

  // fileUrl is stored as a root-relative path like /test-audio/file.mp3.
  // Strip the leading slash before joining with the public base dir.
  const publicBase  = path.resolve(process.cwd(), "public");
  const relativePath = track.fileUrl.startsWith("/")
    ? track.fileUrl.slice(1)
    : track.fileUrl;
  const absoluteFilePath = path.resolve(path.join(publicBase, relativePath));

  // Definitive traversal guard: resolved path must be inside public/.
  if (
    !absoluteFilePath.startsWith(publicBase + path.sep) &&
    absoluteFilePath !== publicBase
  ) {
    console.warn(
      `[tracks/serve] Path traversal blocked: ` +
      `resolved=${absoluteFilePath} base=${publicBase}`
    );
    return NextResponse.json({ error: "Invalid file path." }, { status: 400 });
  }

  // ── 5. File existence check ─────────────────────────────────────────────────
  if (!fs.existsSync(absoluteFilePath)) {
    console.warn(
      `[tracks/serve] File not found on disk: ${absoluteFilePath} ` +
      `(trackId=${trackId})`
    );
    return NextResponse.json(
      { error: "Audio file not found on disk." },
      { status: 404 }
    );
  }

  // ── 6. File size ────────────────────────────────────────────────────────────
  let fileSize: number;
  try {
    fileSize = fs.statSync(absoluteFilePath).size;
  } catch (err) {
    console.error("[tracks/serve] stat error:", (err as Error).message);
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }

  const contentType = track.mimeType ?? "audio/mpeg";
  const filename    = path.basename(absoluteFilePath);

  // ── 7. Range request handling ───────────────────────────────────────────────
  const rangeHeader = req.headers.get("range");

  if (rangeHeader) {
    const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);

    if (!match || match[1] === "") {
      return new Response(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${fileSize}`,
          "Accept-Ranges": "bytes",
        },
      });
    }

    const start = parseInt(match[1], 10);
    const end   = match[2] !== "" ? parseInt(match[2], 10) : fileSize - 1;

    if (isNaN(start) || isNaN(end) || start < 0 || end >= fileSize || start > end) {
      return new Response(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${fileSize}`,
          "Accept-Ranges": "bytes",
        },
      });
    }

    const chunkLength = end - start + 1;
    let chunk: Buffer;
    try {
      const fd = fs.openSync(absoluteFilePath, "r");
      chunk = Buffer.alloc(chunkLength);
      fs.readSync(fd, chunk, 0, chunkLength, start);
      fs.closeSync(fd);
    } catch (err) {
      console.error("[tracks/serve] Range read error:", (err as Error).message);
      return NextResponse.json({ error: "Internal error." }, { status: 500 });
    }

    console.log(
      `[tracks/serve] Range: ${filename} bytes ${start}-${end}/${fileSize} → ${userRole}`
    );

    return new Response(new Uint8Array(chunk), {
      status: 206,
      headers: {
        "Content-Type":   contentType,
        "Content-Length": chunkLength.toString(),
        "Content-Range":  `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges":  "bytes",
        "Cache-Control":  "no-store",
      },
    });
  }

  // ── 8. Full file response ───────────────────────────────────────────────────
  let fileBuffer: Buffer;
  try {
    fileBuffer = fs.readFileSync(absoluteFilePath);
  } catch (err) {
    console.error("[tracks/serve] File read error:", (err as Error).message);
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }

  console.log(
    `[tracks/serve] Full: ${filename} (${fileBuffer.length} bytes) → ${userRole}`
  );

  return new Response(new Uint8Array(fileBuffer), {
    status: 200,
    headers: {
      "Content-Type":   contentType,
      "Content-Length": fileBuffer.length.toString(),
      "Accept-Ranges":  "bytes",
      "Cache-Control":  "no-store",
    },
  });
}
