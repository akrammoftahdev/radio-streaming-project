import { NextResponse } from "next/server";
import { prisma } from "@/auth";
import jwt from "jsonwebtoken";

/**
 * GET /api/mobile/recordings
 * Returns the last N recordings for the authenticated presenter.
 * Query params:
 *   - take: number (default 10, max 50)
 */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const secret = process.env.AUTH_SECRET || "fallback_secret_for_development_only";

    let decoded: any;
    try {
      decoded = jwt.verify(token, secret);
    } catch (e) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { id: presenterId } = decoded;

    const url = new URL(req.url);
    const take = Math.min(parseInt(url.searchParams.get("take") || "10"), 50);

    // Fetch ALL recordings for this presenter (same query as web studio)
    const recordings = await prisma.recording.findMany({
      where: { presenterId },
      orderBy: { startedAt: "desc" },
      take,
      select: {
        id: true,
        localPath: true,
        startedAt: true,
        endedAt: true,
        durationSeconds: true,
        format: true,
        presenterNameSnapshot: true,
        programTitleSnapshot: true,
        stationNameSnapshot: true,
        sourceType: true,
      },
    });

    // Build playback URLs using mobile-specific route with JWT in query string.
    // The audio player can't send Authorization headers, so we pass the token in the URL.
    const baseUrl = url.origin; // e.g. https://studio.egonair.com
    const result = recordings.map((r) => ({
      ...r,
      playbackUrl: `${baseUrl}/api/mobile/recordings/play/${encodeURIComponent(r.localPath)}?token=${token}`,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Mobile Recordings API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
