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

    // Fetch ALL recordings for this presenter (no station filter)
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

    // Build playback URLs
    const backendAudioUrl = process.env.BACKEND_AUDIO_URL || "https://studio.egonair.com";
    const result = recordings.map((r) => ({
      ...r,
      playbackUrl: `${backendAudioUrl}/recordings/${r.localPath}`,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Mobile Recordings API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
