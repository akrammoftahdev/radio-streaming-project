import { auth, prisma } from "@/auth";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing session ID" }, { status: 400 });
    }

    await prisma.liveSession.update({
      where: { id },
      data: {
        disconnectedAt: new Date(),
        status: "IDLE",
        currentMicState: false,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Disconnect API] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
