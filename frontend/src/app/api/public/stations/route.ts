import { NextResponse } from "next/server";
import { db as prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const stations = await prisma.station.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        publicUrl: true,
        streamHost: true,
        streamPort: true,
      },
      orderBy: {
        name: 'asc'
      }
    });

    return NextResponse.json({ stations });
  } catch (error: any) {
    console.error("[PublicStationsAPI] Error:", error);
    return NextResponse.json({ error: "Failed to fetch stations" }, { status: 500 });
  }
}
