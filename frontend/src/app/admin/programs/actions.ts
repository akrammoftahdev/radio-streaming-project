"use server";

import { auth, prisma } from "@/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createProgram(formData: FormData) {
  const session = await auth();
  if (!session || (session.user as any).role !== "ADMIN") throw new Error("Unauthorized");

  const title       = (formData.get("title")       as string | null)?.trim() ?? "";
  const presenterId = (formData.get("presenterId") as string | null)?.trim() ?? "";
  const stationId   = (formData.get("stationId")   as string | null)?.trim() ?? "";
  const description = (formData.get("description") as string | null)?.trim() || null;
  const validFromRaw  = (formData.get("validFrom")  as string | null)?.trim() || null;
  const validUntilRaw = (formData.get("validUntil") as string | null)?.trim() || null;

  // ── Redirect helper — encodes Arabic safely ─────────────────────────────
  const fail = (msg: string) =>
    redirect(`/admin/programs?error=${encodeURIComponent(msg)}`);

  if (!title)       fail("عنوان البرنامج مطلوب.");
  if (!presenterId) fail("يجب اختيار مذيع.");
  if (!stationId)   fail("يجب اختيار محطة.");

  // Parse validity dates
  let validFrom:  Date | null = null;
  let validUntil: Date | null = null;
  if (validFromRaw) {
    validFrom = new Date(validFromRaw);
    if (isNaN(validFrom.getTime())) fail("تاريخ البدء غير صالح.");
  }
  if (validUntilRaw) {
    validUntil = new Date(validUntilRaw);
    if (isNaN(validUntil.getTime())) fail("تاريخ الانتهاء غير صالح.");
  }
  if (validFrom && validUntil && validUntil <= validFrom)
    fail("تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء.");

  const presenter = await prisma.user.findUnique({ where: { id: presenterId } });
  if (!presenter || presenter.role !== "PRESENTER") fail("المذيع غير موجود.");
  if (presenter?.presenterMode === "DIRECT_DJ") fail("مذيع DJ المباشر لا يمكن إضافته لبرنامج. يستخدم هذا النوع إذاعاته الشخصية مباشرة.");

  const station = await prisma.station.findUnique({ where: { id: stationId } });
  if (!station || !station.isActive) fail("المحطة غير موجودة أو غير نشطة.");

  // Presenter must be assigned to this station (business rule — do NOT bypass)
  const link = await prisma.presenterStation.findFirst({
    where: { presenterId, stationId, isActive: true },
  });
  if (!link) {
    fail(
      `المذيع "${presenter!.name || presenter!.username}" غير مرتبط بمحطة "${station!.name}". ` +
      `ارتبط المذيع بالمحطة أولاً من صفحة تعديل المذيع.`
    );
  }

  const program = await prisma.program.create({
    data: { title, description, presenterId, stationId, isActive: true, validFrom, validUntil },
  });

  revalidatePath("/admin/programs");
  revalidatePath("/studio", "layout");  // invalidate presenter studio cache
  redirect(`/admin/programs/${program.id}/edit?created=1`);
}


export async function toggleProgramActive(formData: FormData) {
  const session = await auth();
  if (!session || (session.user as any).role !== "ADMIN") throw new Error("Unauthorized");

  const programId    = formData.get("programId")      as string | null;
  const currentValue = formData.get("currentIsActive") as string | null;

  if (!programId) throw new Error("Missing programId.");

  const newIsActive = currentValue !== "true";

  const program = await prisma.program.findUnique({
    where:  { id: programId },
    select: { title: true, presenterId: true, stationId: true },
  });

  await prisma.program.update({
    where: { id: programId },
    data:  { isActive: newIsActive },
  });

  const actorId = (session.user as { id?: string }).id ?? "";
  await prisma.adminAuditLog.create({
    data: {
      actorId, actorRole: "ADMIN",
      action:     newIsActive ? "ENABLE_PROGRAM" : "DISABLE_PROGRAM",
      entityType: "Program",
      entityId:   programId,
      metadata:   JSON.stringify({
        title:       program?.title,
        presenterId: program?.presenterId,
        stationId:   program?.stationId,
        newIsActive,
      }),
    },
  }).catch(() => {});

  revalidatePath("/admin/programs");
  revalidatePath("/studio", "layout");
}

// ── deleteProgram ─────────────────────────────────────────────────────────────
// Safe to call because:
//   Recording.programId → onDelete: SetNull (recordings preserved, programId → null)
//   ProgramScheduleRule → onDelete: Cascade (rules + slots auto-deleted)
//   ProgramScheduleException → onDelete: Cascade
export type ProgramActionResult = { ok: true } | { ok: false; error: string };

export async function deleteProgram(
  _: ProgramActionResult | null,
  formData: FormData
): Promise<ProgramActionResult> {
  const session = await auth();
  if (!session || (session.user as any).role !== "ADMIN") {
    return { ok: false, error: "غير مصرّح" };
  }

  const programId = (formData.get("programId") as string | null)?.trim() ?? "";
  if (!programId) return { ok: false, error: "معرّف البرنامج مطلوب" };

  const program = await prisma.program.findUnique({
    where:  { id: programId },
    select: { title: true, presenterId: true, stationId: true, isActive: true },
  });
  if (!program) return { ok: false, error: "البرنامج غير موجود" };
  if (program.isActive) return { ok: false, error: "عطّل البرنامج أولاً قبل حذفه." };

  const [recordingCount, ruleCount] = await Promise.all([
    prisma.recording.count({ where: { programId } }),
    prisma.programScheduleRule.count({ where: { programId } }),
  ]);

  const actorId = (session.user as { id?: string }).id ?? "";
  await prisma.adminAuditLog.create({
    data: {
      actorId, actorRole: "ADMIN",
      action:     "DELETE_PROGRAM",
      entityType: "Program",
      entityId:   programId,
      metadata:   JSON.stringify({
        title:         program.title,
        presenterId:   program.presenterId,
        stationId:     program.stationId,
        recordingCount,
        ruleCount,
        note: "recordings preserved (programId set to null); rules/slots cascade deleted",
      }),
    },
  }).catch(() => {});

  try {
    await prisma.program.delete({ where: { id: programId } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `فشل الحذف: ${msg.slice(0, 120)}` };
  }

  revalidatePath("/admin/programs");
  revalidatePath("/studio", "layout");
  return { ok: true };
}
