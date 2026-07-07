import { NextResponse } from "next/server";
import { auth, prisma } from "@/auth";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { stationId, isEnabled } = await req.json();
    if (!stationId || typeof isEnabled !== "boolean") {
      return NextResponse.json({ error: "Bad Request" }, { status: 400 });
    }

    // Role check: If PRESENTER, verify they have permission to this station?
    // We can rely on the fact that the studio already verified they can broadcast.
    // To be perfectly safe, we verify they have a presenterstation record OR are Admin/Manager
    const userRole = (session.user as any)?.role;
    if (userRole === "PRESENTER") {
      const assignment = await prisma.presenterStation.findFirst({
        where: { presenterId: session.user.id, stationId }
      });
      if (!assignment) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const updated = await prisma.station.update({
      where: { id: stationId },
      data: { isMessagingEnabled: isEnabled }
    });

    return NextResponse.json({ success: true, isEnabled: updated.isMessagingEnabled });
  } catch (error) {
    console.error("[MessagingToggle] Error:", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
