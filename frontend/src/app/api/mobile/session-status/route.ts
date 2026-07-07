import { NextResponse } from "next/server";
import { prisma } from "@/auth";
import jwt from "jsonwebtoken";
import { resolveCurrentOrNextProgramSession } from "@/lib/resolve-program-session";

/**
 * GET /api/mobile/session-status?stationId=xxx
 * Returns the remaining time for the current broadcast session.
 * Used by the mobile app's session-end watchdog to:
 *   - Show a 60-second warning before session ends
 *   - Auto-disconnect the presenter at session end
 *
 * Response:
 *   { active: true,  remainingMs: number, sessionEndTime: ISO, warningThreshold: 60000 }
 *   { active: false, reason: "NO_SESSION" | "SESSION_ENDED" | "DIRECT_DJ" }
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
    const stationId = url.searchParams.get("stationId");

    if (!stationId) {
      return NextResponse.json({ error: "stationId required" }, { status: 400 });
    }

    // Check presenter mode
    const user = await prisma.user.findUnique({
      where: { id: presenterId },
      select: { presenterMode: true },
    });

    // DIRECT_DJ presenters have no session end — they broadcast indefinitely
    if (user?.presenterMode === "DIRECT_DJ") {
      return NextResponse.json({
        active: false,
        reason: "DIRECT_DJ",
      });
    }

    // Resolve current session
    const now = new Date();
    const session = await resolveCurrentOrNextProgramSession(presenterId, now, stationId);

    if (!session || session.stationId !== stationId) {
      return NextResponse.json({
        active: false,
        reason: "NO_SESSION",
      });
    }

    if (!session.isCurrent) {
      return NextResponse.json({
        active: false,
        reason: "SESSION_ENDED",
      });
    }

    const remainingMs = session.occurrenceEnd.getTime() - now.getTime();

    return NextResponse.json({
      active: true,
      remainingMs: Math.max(0, remainingMs),
      sessionEndTime: session.occurrenceEnd.toISOString(),
      warningThresholdMs: 60000, // 60 seconds before end
      programTitle: session.programTitle,
    });
  } catch (error) {
    console.error("Mobile Session Status API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
