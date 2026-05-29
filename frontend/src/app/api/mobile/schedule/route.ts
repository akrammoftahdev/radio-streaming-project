import { NextResponse } from "next/server";
import { prisma } from "@/auth";
import jwt from "jsonwebtoken";
import { resolveCurrentOrNextProgramSession } from "@/lib/resolve-program-session";

/**
 * GET /api/mobile/schedule?stationId=xxx
 * Returns the current/next broadcast schedule for the authenticated presenter on a given station.
 * Used by the mobile app to:
 *   - Show WaitScreen countdown with correct `allowConnectMinutesBefore`
 *   - Enable session-end watchdog with `sessionEndMs`
 *   - Determine if presenter is DIRECT_DJ (no schedule = no waitscreen)
 *
 * NOW uses the new Program Schedule System (Program → ProgramScheduleRule → Slot)
 * via resolveCurrentOrNextProgramSession(), matching the web studio behaviour.
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

    // DIRECT_DJ presenters have no schedule — they connect anytime
    if (user?.presenterMode === "DIRECT_DJ") {
      return NextResponse.json({
        mode: "DIRECT_DJ",
        scheduledStartTime: null,
        sessionEndTime: null,
        allowConnectMinutesBefore: 0,
        gateOpen: true,
        programTitle: null,
        stationName: null,
      });
    }

    // ── Use the NEW Program Schedule System ──────────────────────────────────
    const now = new Date();
    const session = await resolveCurrentOrNextProgramSession(presenterId, now);

    // Filter to the requested station only
    if (!session || session.stationId !== stationId) {
      // No program found for this station — check if there's a session on another station
      // (for MULTI_STATION presenters who picked the wrong station)
      return NextResponse.json({
        mode: "NO_SCHEDULE",
        scheduledStartTime: null,
        sessionEndTime: null,
        allowConnectMinutesBefore: 0,
        gateOpen: false,
        programTitle: null,
        stationName: null,
      });
    }

    return NextResponse.json({
      mode: "SCHEDULED",
      scheduleId: session.pseudoScheduleId,
      scheduledStartTime: session.occurrenceStart.toISOString(),
      sessionEndTime: session.occurrenceEnd.toISOString(),
      allowConnectMinutesBefore: session.allowConnectMinutesBefore,
      gateOpen: session.isCurrent,
      programTitle: session.programTitle,
      stationName: session.stationName,
    });
  } catch (error) {
    console.error("Mobile Schedule API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
