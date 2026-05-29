import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/auth";
import jwt from "jsonwebtoken";
import path from "path";
import fs from "fs";

/**
 * GET /api/mobile/recordings/play/[filename]
 * ──────────────────────────────────────────────────────────────────────────────
 * Serves a recording file to mobile app users via JWT token in query param.
 *
 * iOS cannot play .webm, so this route always serves the .mp3 version.
 * If the requested filename is .webm, it automatically looks for the .mp3.
 * If the requested filename is .pcm, it looks for the .mp3.
 *
 * Auth: ?token=<JWT> in query string (because audio players can't send headers)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const url = new URL(req.url);

  // ── 1. Auth: JWT from query string OR Authorization header ───────────────
  let token = url.searchParams.get("token");
  if (!token) {
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }
  }
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 401 });
  }

  const secret = process.env.AUTH_SECRET || "fallback_secret_for_development_only";
  let decoded: any;
  try {
    decoded = jwt.verify(token, secret);
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const userId = decoded.id;
  const userRole = decoded.role;

  if (userRole !== "PRESENTER" && userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── 2. Filename validation ──────────────────────────────────────────────
  const { filename: rawFilename } = await params;

  if (rawFilename.includes("/") || rawFilename.includes("\\")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const filename = path.basename(rawFilename);
  if (filename !== rawFilename) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  // ── 3. DB lookup + ownership ────────────────────────────────────────────
  // Try exact match first, then try matching without extension (for .webm → .mp3 fallback)
  const baseName = filename.replace(/\.(webm|mp3|pcm)$/i, "");

  let recording: { id: string; presenterId: string | null; localPath: string } | null = null;
  try {
    recording = await prisma.recording.findFirst({
      where: {
        OR: [
          { localPath: filename },
          { localPath: baseName + ".mp3" },
          { localPath: baseName + ".webm" },
        ],
      },
      select: { id: true, presenterId: true, localPath: true },
    });
  } catch (err) {
    console.error("[mobile/recordings/play] DB error:", (err as Error).message);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  if (!recording) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  if (userRole === "PRESENTER" && recording.presenterId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── 4. Resolve file path — ALWAYS prefer .mp3 for mobile ───────────────
  const recordingsBaseDir =
    process.env.RECORDINGS_BASE_DIR ??
    path.resolve(process.cwd(), "..", "backend-audio", "debug-recordings");

  const resolvedBase = path.resolve(recordingsBaseDir);

  // Try to find an MP3 version first (iOS can't play webm)
  const mp3Filename = baseName + ".mp3";
  const webmFilename = baseName + ".webm";

  let serveFilename = "";
  let serveMimeType = "";

  const mp3Path = path.resolve(path.join(recordingsBaseDir, mp3Filename));
  const webmPath = path.resolve(path.join(recordingsBaseDir, webmFilename));

  if (mp3Path.startsWith(resolvedBase) && fs.existsSync(mp3Path)) {
    serveFilename = mp3Filename;
    serveMimeType = "audio/mpeg";
  } else if (webmPath.startsWith(resolvedBase) && fs.existsSync(webmPath)) {
    serveFilename = webmFilename;
    serveMimeType = "audio/webm";
  } else {
    console.warn(`[mobile/recordings/play] No file found: tried ${mp3Path} and ${webmPath}`);
    return NextResponse.json({ error: "File not found on disk" }, { status: 404 });
  }

  const absoluteFilePath = path.resolve(path.join(recordingsBaseDir, serveFilename));

  // ── 5. File size + Range support ────────────────────────────────────────
  let fileSize: number;
  try {
    fileSize = fs.statSync(absoluteFilePath).size;
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  // Skip empty/corrupt files (< 1KB)
  if (fileSize < 1024) {
    return NextResponse.json({ error: "Recording is empty or corrupt" }, { status: 404 });
  }

  console.log(`[mobile/recordings/play] Serving ${serveFilename} (${fileSize} bytes, ${serveMimeType}) to ${userRole} ${userId}`);

  const rangeHeader = req.headers.get("range");

  if (rangeHeader) {
    const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
    if (!match || match[1] === "") {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${fileSize}`, "Accept-Ranges": "bytes" },
      });
    }

    const start = parseInt(match[1], 10);
    const end = match[2] !== "" ? parseInt(match[2], 10) : fileSize - 1;

    if (isNaN(start) || isNaN(end) || start < 0 || end >= fileSize || start > end) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${fileSize}`, "Accept-Ranges": "bytes" },
      });
    }

    const chunkLength = end - start + 1;
    const fd = fs.openSync(absoluteFilePath, "r");
    const chunk = Buffer.alloc(chunkLength);
    fs.readSync(fd, chunk, 0, chunkLength, start);
    fs.closeSync(fd);

    return new Response(new Uint8Array(chunk), {
      status: 206,
      headers: {
        "Content-Type": serveMimeType,
        "Content-Length": chunkLength.toString(),
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      },
    });
  }

  // ── 6. Full file response ───────────────────────────────────────────────
  const fileBuffer = fs.readFileSync(absoluteFilePath);

  return new Response(new Uint8Array(fileBuffer), {
    status: 200,
    headers: {
      "Content-Type": serveMimeType,
      "Content-Length": fileBuffer.length.toString(),
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    },
  });
}
