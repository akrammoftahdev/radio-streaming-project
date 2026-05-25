import { NextResponse } from "next/server";
import { prisma } from "@/auth";

// Lightweight public-ish endpoint used by the create presenter form
// to populate the station selector. Returns only active stations.
export async function GET() {
  try {
    const stations = await prisma.station.findMany({
      where:   { isActive: true },
      orderBy: { name: "asc" },
      select:  { id: true, name: true, slug: true },
    });
    return NextResponse.json(stations);
  } catch {
    return NextResponse.json({ error: "Failed to fetch stations" }, { status: 500 });
  }
}
