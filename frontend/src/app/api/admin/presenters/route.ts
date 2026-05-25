import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/auth";

export async function POST(req: Request) {
  try {
    const { name, username, password, isActive, canBroadcast, presenterMode, stationIds, email, phone } = await req.json();

    // ── Basic field validation ──────────────────────────────────────────────
    if (!username || !password) {
      return NextResponse.json(
        { error: "اسم المستخدم وكلمة المرور مطلوبان" },
        { status: 400 }
      );
    }

    // Light email validation
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json(
        { error: "صيغة البريد الإلكتروني غير صحيحة" },
        { status: 400 }
      );
    }

    // ── Resolve and validate presenterMode ──────────────────────────────────
    const validModes = ["SINGLE_STATION", "MULTI_STATION", "DIRECT_DJ"];
    const resolvedMode = validModes.includes(presenterMode) ? presenterMode : "SINGLE_STATION";

    // ── Validate stationIds per mode ────────────────────────────────────────
    const ids: string[] = Array.isArray(stationIds) ? stationIds.filter(Boolean) : [];

    if (resolvedMode === "SINGLE_STATION") {
      if (ids.length !== 1) {
        return NextResponse.json(
          { error: "مذيع المحطة الواحدة يتطلب اختيار محطة واحدة فقط" },
          { status: 400 }
        );
      }
    } else if (resolvedMode === "MULTI_STATION") {
      if (ids.length < 1) {
        return NextResponse.json(
          { error: "مذيع متعدد المحطات يتطلب اختيار محطة واحدة على الأقل" },
          { status: 400 }
        );
      }
    } else {
      // DIRECT_DJ — must not have station IDs
      if (ids.length > 0) {
        return NextResponse.json(
          { error: "DJ المباشر لا يرتبط بمحطات داخلية" },
          { status: 400 }
        );
      }
    }

    // ── Validate that all station IDs exist and are active ──────────────────
    if (ids.length > 0) {
      const validStations = await prisma.station.findMany({
        where: { id: { in: ids }, isActive: true },
        select: { id: true },
      });
      if (validStations.length !== ids.length) {
        return NextResponse.json(
          { error: "إحدى المحطات المختارة غير موجودة أو غير نشطة" },
          { status: 400 }
        );
      }
    }

    // ── Duplicate username check ────────────────────────────────────────────
    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      return NextResponse.json(
        { error: "اسم المستخدم مستخدم بالفعل" },
        { status: 409 }
      );
    }

    // ── Hash password ───────────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash(password, 10);

    // ── Create user + PresenterStation rows atomically ──────────────────────
    const newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: name || null,
          username,
          passwordHash,
          role: "PRESENTER",
          isActive: isActive ?? true,
          canBroadcast: resolvedMode !== "DIRECT_DJ" ? (canBroadcast ?? true) : false,
          presenterMode: resolvedMode,
          email: email?.trim() || null,
          phone: phone?.trim() || null,
        },
      });

      if (ids.length > 0) {
        await tx.presenterStation.createMany({
          data: ids.map((stationId) => ({
            presenterId: user.id,
            stationId,
            isActive: true,
          })),
        });
      }

      return user;
    });

    return NextResponse.json(
      {
        message: "تم إنشاء المذيع بنجاح",
        user: { id: newUser.id, username: newUser.username },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating presenter:", error);
    return NextResponse.json(
      { error: "خطأ داخلي في الخادم" },
      { status: 500 }
    );
  }
}
