import { NextResponse } from "next/server";
import { prisma } from "@/auth";
import jwt from "jsonwebtoken";
import { createAudioToken } from "@/lib/audio-token";
import { resolveCurrentOrNextProgramSession } from "@/lib/resolve-program-session";

export async function POST(req: Request) {
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

    if (role !== "PRESENTER" && role !== "ADMIN") {
      return NextResponse.json({ error: "Only presenters or admins can request audio tokens" }, { status: 403 });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const { stationId } = body;

    if (!stationId) {
      return NextResponse.json({ error: "stationId is required" }, { status: 400 });
    }

    const presenter = await prisma.user.findUnique({
      where: { id: presenterId },
      select: { presenterMode: true },
    });

    const presenterMode = presenter?.presenterMode ?? 'SINGLE_STATION';

    if (presenterMode === 'DIRECT_DJ' || role === 'ADMIN') {
      // ADMIN can access any radio; PRESENTER restricted to their own
      const radioWhere = role === 'ADMIN'
        ? { id: stationId, isActive: true }
        : { id: stationId, presenterId, isActive: true };

      const radio = await prisma.directDjRadio.findFirst({ where: radioWhere });

      if (!radio) {
        return NextResponse.json({ error: "Radio target not found" }, { status: 403 });
      }

      const result = createAudioToken(radio.presenterId ?? presenterId, null, null, 'DIRECT_DJ', radio.id);
      return NextResponse.json({ token: result.token });
    }

    // ── SCHEDULED presenters: validate schedule window before issuing token ──
    const now = new Date();
    const session = await resolveCurrentOrNextProgramSession(presenterId, now, stationId);

    // Must have a current session on the requested station
    if (!session || session.stationId !== stationId) {
      return NextResponse.json(
        { error: "لا يوجد برنامج مجدول لك على هذه المحطة حالياً" },
        { status: 403 }
      );
    }

    // Gate must be open (within allowConnectMinutesBefore window)
    if (!session.isCurrent) {
      const minutesUntilGate = Math.ceil(
        (session.gateOpenTime.getTime() - now.getTime()) / 60000
      );
      return NextResponse.json(
        {
          error: `البث يبدأ بعد ${minutesUntilGate} دقيقة. يمكنك الدخول قبل ${session.allowConnectMinutesBefore} دقائق من الموعد.`,
          scheduledStartTime: session.occurrenceStart.toISOString(),
          gateOpenTime: session.gateOpenTime.toISOString(),
        },
        { status: 403 }
      );
    }

    const result = createAudioToken(
      presenterId,
      session.pseudoScheduleId,
      stationId,
      'SCHEDULED',
      null
    );
    return NextResponse.json({
      token: result.token,
      sessionEndTime: session.occurrenceEnd.toISOString(),
    });

  } catch (error) {
    console.error("Mobile Audio Token API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
