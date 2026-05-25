import { auth, prisma } from "@/auth";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await auth();

  if (!session || (session.user as any).role !== "PRESENTER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const presenterId = session.user?.id;
  if (!presenterId) {
    return NextResponse.json({ error: "Missing presenter ID" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const { micOn, volumeLevel } = body;

  const micState = Boolean(micOn);
  const status = micState ? "LIVE" : "CONNECTED";
  const networkQuality = "mock";

  // Find an existing active session (not yet disconnected)
  const existing = await prisma.liveSession.findFirst({
    where: {
      presenterId,
      disconnectedAt: null,
    },
    orderBy: { connectedAt: "desc" },
  });

  let liveSession;

  if (existing) {
    liveSession = await prisma.liveSession.update({
      where: { id: existing.id },
      data: {
        status,
        currentMicState: micState,
        networkQuality,
      },
    });
  } else {
    liveSession = await prisma.liveSession.create({
      data: {
        presenterId,
        status,
        currentMicState: micState,
        networkQuality,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    liveSessionId: liveSession.id,
    presenterId,
    status,
    micOn: micState,
    volumeLevel: typeof volumeLevel === "number" ? Math.round(volumeLevel * 100) / 100 : 0,
    serverTime: new Date().toISOString(),
  });
}
