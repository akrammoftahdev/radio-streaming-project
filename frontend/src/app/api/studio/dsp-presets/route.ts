import { auth, prisma } from "@/auth";
import { NextResponse } from "next/server";
import { DEFAULT_DSP_PARAMS, type DspParams } from "@/lib/dsp-presets";

// GET /api/studio/dsp-presets — list system + user's custom presets
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const presets = await prisma.dspPreset.findMany({
    where: { OR: [{ isSystem: true }, { presenterId: userId }] },
    orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
    select: { id: true, name: true, isSystem: true, params: true },
  });

  // Get user's active preset ID
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { activeDspPresetId: true },
  });

  return NextResponse.json({
    presets: presets.map(p => ({ ...p, params: JSON.parse(p.params) })),
    activeDspPresetId: user?.activeDspPresetId ?? null,
  });
}

// POST /api/studio/dsp-presets — create a custom preset OR set active preset
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const body = await req.json();

  // If "setActive" is present, just update the user's active preset
  if (body.setActive !== undefined) {
    await prisma.user.update({
      where: { id: userId },
      data: { activeDspPresetId: body.setActive },
    });
    return NextResponse.json({ ok: true });
  }

  // Otherwise, create a new custom preset
  const name = (body.name as string)?.trim();
  if (!name) return NextResponse.json({ error: "الاسم مطلوب" }, { status: 400 });

  const params: DspParams = { ...DEFAULT_DSP_PARAMS, ...(body.params || {}) };

  const preset = await prisma.dspPreset.create({
    data: {
      name,
      isSystem: false,
      presenterId: userId,
      params: JSON.stringify(params),
    },
    select: { id: true, name: true, isSystem: true, params: true },
  });

  return NextResponse.json(
    { ...preset, params: JSON.parse(preset.params) },
    { status: 201 }
  );
}

// PUT /api/studio/dsp-presets — update an existing custom preset
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const body = await req.json();
  const presetId = body.id as string;

  if (!presetId) return NextResponse.json({ error: "ID مطلوب" }, { status: 400 });

  // Only allow editing own presets (not system)
  const existing = await prisma.dspPreset.findFirst({
    where: { id: presetId, presenterId: userId, isSystem: false },
  });
  if (!existing) return NextResponse.json({ error: "لا يمكن تعديل هذا الإعداد" }, { status: 403 });

  const data: Record<string, unknown> = {};
  if (body.name) data.name = (body.name as string).trim();
  if (body.params) data.params = JSON.stringify({ ...DEFAULT_DSP_PARAMS, ...body.params });

  const updated = await prisma.dspPreset.update({
    where: { id: presetId },
    data,
    select: { id: true, name: true, isSystem: true, params: true },
  });

  return NextResponse.json({ ...updated, params: JSON.parse(updated.params) });
}

// DELETE /api/studio/dsp-presets — delete a custom preset
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const { searchParams } = new URL(req.url);
  const presetId = searchParams.get("id");

  if (!presetId) return NextResponse.json({ error: "ID مطلوب" }, { status: 400 });

  // Only allow deleting own presets
  const existing = await prisma.dspPreset.findFirst({
    where: { id: presetId, presenterId: userId, isSystem: false },
  });
  if (!existing) return NextResponse.json({ error: "لا يمكن حذف هذا الإعداد" }, { status: 403 });

  // If active, clear the user's activeDspPresetId
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { activeDspPresetId: true },
  });
  if (user?.activeDspPresetId === presetId) {
    await prisma.user.update({ where: { id: userId }, data: { activeDspPresetId: null } });
  }

  await prisma.dspPreset.delete({ where: { id: presetId } });

  return NextResponse.json({ ok: true });
}
