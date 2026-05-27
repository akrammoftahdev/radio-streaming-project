import { NextResponse } from "next/server";
import { prisma } from "@/auth";
import jwt from "jsonwebtoken";

/**
 * GET /api/mobile/schedule?stationId=xxx
 * Returns the current/next broadcast schedule for the authenticated presenter on a given station.
 * Used by the mobile app to:
 *   - Show WaitScreen countdown with correct `allowConnectMinutesBefore`
 *   - Enable session-end watchdog with `sessionEndMs`
 *   - Determine if presenter is DIRECT_DJ (no schedule = no waitscreen)
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

    const { id: presenterId, role } = decoded;
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
      });
    }

    const now = new Date();

    // Find the current or next upcoming schedule for this presenter + station
    // Look for schedules where endDatetime is in the future (not yet ended)
    const schedule = await prisma.broadcastSchedule.findFirst({
      where: {
        presenterId,
        stationId,
        isActive: true,
        endDatetime: { gte: now },
      },
      orderBy: { startDatetime: "asc" },
      select: {
        id: true,
        startDatetime: true,
        endDatetime: true,
        allowConnectMinutesBefore: true,
      },
    });

    if (!schedule) {
      // No upcoming schedule — treat as direct access (admin or no schedule configured)
      return NextResponse.json({
        mode: "NO_SCHEDULE",
        scheduledStartTime: null,
        sessionEndTime: null,
        allowConnectMinutesBefore: 0,
      });
    }

    return NextResponse.json({
      mode: "SCHEDULED",
      scheduleId: schedule.id,
      scheduledStartTime: schedule.startDatetime.toISOString(),
      sessionEndTime: schedule.endDatetime.toISOString(),
      allowConnectMinutesBefore: schedule.allowConnectMinutesBefore,
    });
  } catch (error) {
    console.error("Mobile Schedule API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
