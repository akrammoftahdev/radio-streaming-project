import { auth, prisma } from "@/auth";
import { NextResponse } from "next/server";

export async function POST() {
  const session = await auth();

  if (!session || (session.user as any).role !== "PRESENTER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const presenterId = session.user?.id;
  if (!presenterId) {
    return NextResponse.json({ error: "Missing presenter ID" }, { status: 400 });
  }

  // Find the presenter's active session (not yet disconnected)
  const existing = await prisma.liveSession.findFirst({
    where: { presenterId, disconnectedAt: null },
    orderBy: { connectedAt: "desc" },
  });

  if (!existing) {
    // Nothing to close — treat as success
    return NextResponse.json({ ok: true, note: "no active session" });
  }

  await prisma.liveSession.update({
    where: { id: existing.id },
    data: {
      disconnectedAt: new Date(),
      status: "DISCONNECTED",
    },
  });

  return NextResponse.json({ ok: true, closedSessionId: existing.id });
}
