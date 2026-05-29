import { NextResponse } from "next/server";
import { prisma } from "@/auth";
import jwt from "jsonwebtoken";

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

    const { id, role } = decoded;

    let stations: any[] = [];
    let presenterMode: string | null = null;

    if (role === "ADMIN") {
      stations = await prisma.station.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, slug: true }
      });
    } else {
      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          presenterStations: {
            where: { isActive: true },
            include: { station: { select: { id: true, name: true, slug: true } } }
          },
          directDjRadios: {
            where: { isActive: true },
            orderBy: { displayOrder: "asc" }
          },
          stationManagerAssignments: {
            include: { station: { select: { id: true, name: true, slug: true } } }
          }
        }
      });
      if (user) {
        if (role === "STATION_MANAGER") {
          stations = user.stationManagerAssignments.map(ma => ma.station);
        } else if (role === "PRESENTER") {
          presenterMode = user.presenterMode || "SINGLE_STATION";
          if (user.presenterMode === "DIRECT_DJ") {
            stations = user.directDjRadios.map(djr => ({
              id: djr.id,
              name: djr.radioName,
              slug: djr.id
            }));
          } else {
            stations = user.presenterStations.map(ps => ps.station);
          }
        }
      }
    }

    return NextResponse.json({ stations, presenterMode });
  } catch (error) {
    console.error("Mobile Stations API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
