"use server";

import { auth, prisma } from "@/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const VALID_RECURRENCE = ["DAILY", "WEEKLY", "SELECTED_DAYS", "ONE_TIME"];
const VALID_DAYS       = [0, 1, 2, 3, 4, 5, 6];
const TIME_RE          = /^([01]\d|2[0-3]):([0-5]\d)$/;

async function requireAdmin() {
  const session = await auth();
  if (!session || (session.user as any).role !== "ADMIN") throw new Error("Unauthorized");
}

async function requireProgram(id: string) {
  const p = await prisma.program.findUnique({ where: { id } });
  if (!p) throw new Error("البرنامج غير موجود.");
  return p;
}

// ── hasTimeOverlap ────────────────────────────────────────────────────────────
// Returns true if [startA, endA) overlaps [startB, endB).
// Touching boundary (endA === startB) is NOT an overlap — two back-to-back
// programs like 10:00–11:00 and 11:00–12:00 are allowed.
// Strings are HH:MM 24-hour and sort lexicographically.
function hasTimeOverlap(
  startA: string, endA: string,
  startB: string, endB: string,
): boolean {
  return startA < endB && endA > startB;
}

// ── daysOverlap ───────────────────────────────────────────────────────────────
// Returns true if the two recurrence contexts apply to the same calendar day.
//   DAILY        → conflicts with everything (every day).
//   WEEKLY / SELECTED_DAYS → conflicts with same dayOfWeek and with DAILY.
//   ONE_TIME     → conflicts with same date (by ISO date string) and with DAILY.
function daysOverlap(
  typeA:  string, dowA:  number | null, dateA: Date | null,
  typeB:  string, dowB:  number | null, dateB: Date | null,
): boolean {
  // DAILY conflicts with everything
  if (typeA === "DAILY" || typeB === "DAILY") return true;
  // Both WEEKLY or SELECTED_DAYS: same day-of-week
  if (
    (typeA === "WEEKLY" || typeA === "SELECTED_DAYS") &&
    (typeB === "WEEKLY" || typeB === "SELECTED_DAYS")
  ) {
    return dowA !== null && dowB !== null && dowA === dowB;
  }
  // ONE_TIME vs ONE_TIME: same calendar date
  if (typeA === "ONE_TIME" && typeB === "ONE_TIME") {
    if (!dateA || !dateB) return false;
    return dateA.toISOString().slice(0, 10) === dateB.toISOString().slice(0, 10);
  }
  // ONE_TIME vs WEEKLY/SELECTED_DAYS: check if that date's day-of-week matches
  if (typeA === "ONE_TIME" && (typeB === "WEEKLY" || typeB === "SELECTED_DAYS")) {
    if (!dateA || dowB === null) return false;
    return dateA.getUTCDay() === dowB;
  }
  if (typeB === "ONE_TIME" && (typeA === "WEEKLY" || typeA === "SELECTED_DAYS")) {
    if (!dateB || dowA === null) return false;
    return dateB.getUTCDay() === dowA;
  }
  return false;
}

// ── checkSlotConflicts ────────────────────────────────────────────────────────
// Loads all active slots for the same station and presenter, then checks
// whether the candidate time slot conflicts with any of them.
// Pass excludeSlotId when editing (to skip the slot being updated).
async function checkSlotConflicts({
  stationId,
  presenterId,
  recurrenceType,
  dayOfWeek,
  slotDate,
  startTime,
  endTime,
  excludeSlotId,
}: {
  stationId:      string;
  presenterId:    string;
  recurrenceType: string;
  dayOfWeek:      number | null;
  slotDate:       Date   | null;
  startTime:      string;
  endTime:        string;
  excludeSlotId?: string;
}) {
  // Load all active slots for every ACTIVE program on this station or by this presenter.
  // We need: slot times + rule recurrence type + rule dayOfWeek + slot slotDate
  // + program title + program stationId + program presenterId.
  const candidates = await prisma.programScheduleSlot.findMany({
    where: {
      isActive: true,
      ...(excludeSlotId ? { NOT: { id: excludeSlotId } } : {}),
      rule: {
        isActive: true,
        program: {
          isActive: true,
          OR: [
            { stationId },
            { presenterId },
          ],
        },
      },
    },
    select: {
      id:        true,
      startTime: true,
      endTime:   true,
      dayOfWeek: true,
      slotDate:  true,
      rule: {
        select: {
          recurrenceType: true,
          program: {
            select: {
              id:          true,
              title:       true,
              stationId:   true,
              presenterId: true,
            },
          },
        },
      },
    },
  });

  for (const cand of candidates) {
    const prog = cand.rule.program;
    // Only check same station OR same presenter (not unrelated programs)
    if (prog.stationId !== stationId && prog.presenterId !== presenterId) continue;

    // Check if the day contexts overlap
    if (!daysOverlap(
      recurrenceType, dayOfWeek, slotDate,
      cand.rule.recurrenceType, cand.dayOfWeek, cand.slotDate,
    )) continue;

    // Check if the times overlap
    if (!hasTimeOverlap(startTime, endTime, cand.startTime, cand.endTime)) continue;

    // Conflict found
    const conflictType = prog.stationId === stationId ? "نفس المحطة" : "نفس المذيع";
    throw new Error(
      `يوجد تعارض في وقت البث (${conflictType}) مع برنامج: "${prog.title}" ` +
      `(${cand.startTime} – ${cand.endTime})`
    );
  }
}

// ── updateProgram ─────────────────────────────────────────────────────────────
export async function updateProgram(formData: FormData) {
  await requireAdmin();
  const programId     = (formData.get("programId")   as string | null)?.trim() ?? "";
  const title         = (formData.get("title")       as string | null)?.trim() ?? "";
  const description   = (formData.get("description") as string | null)?.trim() || null;
  const validFromRaw  = (formData.get("validFrom")   as string | null)?.trim() || null;
  const validUntilRaw = (formData.get("validUntil")  as string | null)?.trim() || null;

  if (!programId) throw new Error("Missing programId.");
  if (!title)     throw new Error("عنوان البرنامج مطلوب.");

  let validFrom:  Date | null = null;
  let validUntil: Date | null = null;
  if (validFromRaw) {
    validFrom = new Date(validFromRaw);
    if (isNaN(validFrom.getTime())) throw new Error("تاريخ البدء غير صالح.");
  }
  if (validUntilRaw) {
    validUntil = new Date(validUntilRaw);
    if (isNaN(validUntil.getTime())) throw new Error("تاريخ الانتهاء غير صالح.");
  }
  if (validFrom && validUntil && validUntil <= validFrom)
    throw new Error("تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء.");

  await requireProgram(programId);
  await prisma.program.update({
    where: { id: programId },
    data:  { title, description, validFrom, validUntil },
  });
  revalidatePath(`/admin/programs/${programId}/edit`);
  revalidatePath("/studio", "layout");
  redirect(`/admin/programs/${programId}/edit?saved=program`);
}

// ── createScheduleRule ────────────────────────────────────────────────────────
export async function createScheduleRule(formData: FormData) {
  await requireAdmin();
  const programId             = (formData.get("programId")               as string | null)?.trim() ?? "";
  const recurrenceType        = (formData.get("recurrenceType")          as string | null)?.trim() ?? "";
  const timezone              = (formData.get("timezone")                as string | null)?.trim() || "Africa/Cairo";
  const allowConnectRaw       = formData.get("allowConnectMinutesBefore") as string | null;
  const allowConnectMinutesBefore = parseInt(allowConnectRaw || "5", 10);

  if (!programId) throw new Error("Missing programId.");
  if (!VALID_RECURRENCE.includes(recurrenceType)) throw new Error("نوع التكرار غير صالح.");
  if (isNaN(allowConnectMinutesBefore) || allowConnectMinutesBefore < 0)
    throw new Error("دقائق السماح يجب أن تكون 0 أو أكبر.");

  await requireProgram(programId);
  await prisma.programScheduleRule.create({
    data: { programId, recurrenceType, timezone, allowConnectMinutesBefore, isActive: true },
  });
  revalidatePath(`/admin/programs/${programId}/edit`);
  revalidatePath("/studio", "layout");
}

// ── toggleRuleActive ──────────────────────────────────────────────────────────
export async function toggleRuleActive(formData: FormData) {
  await requireAdmin();
  const ruleId       = (formData.get("ruleId")         as string | null)?.trim() ?? "";
  const programId    = (formData.get("programId")      as string | null)?.trim() ?? "";
  const currentValue = formData.get("currentIsActive") as string | null;
  if (!ruleId) throw new Error("Missing ruleId.");
  await prisma.programScheduleRule.update({
    where: { id: ruleId },
    data:  { isActive: currentValue !== "true" },
  });
  revalidatePath(`/admin/programs/${programId}/edit`);
  revalidatePath("/studio", "layout");
}

// ── deleteScheduleRule ────────────────────────────────────────────────────────
export async function deleteScheduleRule(formData: FormData) {
  await requireAdmin();
  const ruleId    = (formData.get("ruleId")    as string | null)?.trim() ?? "";
  const programId = (formData.get("programId") as string | null)?.trim() ?? "";
  if (!ruleId) throw new Error("Missing ruleId.");
  await prisma.programScheduleRule.delete({ where: { id: ruleId } });
  revalidatePath(`/admin/programs/${programId}/edit`);
  revalidatePath("/studio", "layout");
}

// ── createScheduleSlot ────────────────────────────────────────────────────────
export async function createScheduleSlot(formData: FormData) {
  await requireAdmin();
  const ruleId         = (formData.get("ruleId")          as string | null)?.trim() ?? "";
  const programId      = (formData.get("programId")       as string | null)?.trim() ?? "";
  const recurrenceType = (formData.get("recurrenceType")  as string | null)?.trim() ?? "";
  const dayOfWeekRaw   = formData.get("dayOfWeek")        as string | null;
  const slotDateRaw    = formData.get("slotDate")         as string | null;
  const startTime      = (formData.get("startTime")       as string | null)?.trim() ?? "";
  const endTime        = (formData.get("endTime")         as string | null)?.trim() ?? "";

  if (!ruleId)    throw new Error("Missing ruleId.");
  if (!startTime) throw new Error("وقت البداية مطلوب.");
  if (!endTime)   throw new Error("وقت النهاية مطلوب.");
  if (!TIME_RE.test(startTime)) throw new Error("تنسيق وقت البداية غير صالح (HH:MM).");
  if (!TIME_RE.test(endTime))   throw new Error("تنسيق وقت النهاية غير صالح (HH:MM).");
  if (startTime >= endTime)     throw new Error("وقت البداية يجب أن يكون قبل وقت النهاية.");

  let dayOfWeek: number | null = null;
  let slotDate:  Date   | null = null;

  if (recurrenceType === "WEEKLY" || recurrenceType === "SELECTED_DAYS") {
    if (!dayOfWeekRaw && dayOfWeekRaw !== "0") throw new Error("يجب اختيار يوم الأسبوع.");
    dayOfWeek = parseInt(dayOfWeekRaw!, 10);
    if (!VALID_DAYS.includes(dayOfWeek)) throw new Error("يوم الأسبوع غير صالح.");
  }

  if (recurrenceType === "ONE_TIME") {
    if (!slotDateRaw) throw new Error("يجب تحديد تاريخ الحلقة.");
    slotDate = new Date(slotDateRaw);
    if (isNaN(slotDate.getTime())) throw new Error("تاريخ غير صالح.");
  }

  // ── Conflict detection ───────────────────────────────────────────────────
  // Load the rule + program (for stationId, presenterId) to run conflict check.
  const rule = await prisma.programScheduleRule.findUnique({
    where: { id: ruleId },
    select: {
      recurrenceType: true,
      program: { select: { stationId: true, presenterId: true } },
    },
  });
  if (!rule) throw new Error("قاعدة الجدولة غير موجودة.");

  try {
    await checkSlotConflicts({
      stationId:      rule.program.stationId,
      presenterId:    rule.program.presenterId,
      recurrenceType: rule.recurrenceType,
      dayOfWeek,
      slotDate,
      startTime,
      endTime,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "حدث خطأ في فحص التعارض.";
    redirect(`/admin/programs/${programId}/edit?slotError=${encodeURIComponent(msg)}#schedule-section`);
  }
  // ─────────────────────────────────────────────────────────────────────────

  await prisma.programScheduleSlot.create({
    data: { ruleId, dayOfWeek, slotDate, startTime, endTime, isActive: true },
  });
  revalidatePath(`/admin/programs/${programId}/edit`);
  revalidatePath("/studio", "layout");
}

// ── deleteScheduleSlot ────────────────────────────────────────────────────────
export async function deleteScheduleSlot(formData: FormData) {
  await requireAdmin();
  const slotId    = (formData.get("slotId")    as string | null)?.trim() ?? "";
  const programId = (formData.get("programId") as string | null)?.trim() ?? "";
  if (!slotId) throw new Error("Missing slotId.");
  await prisma.programScheduleSlot.delete({ where: { id: slotId } });
  revalidatePath(`/admin/programs/${programId}/edit`);
  revalidatePath("/studio", "layout");
}

// ── updateScheduleRule ────────────────────────────────────────────────────────
export async function updateScheduleRule(formData: FormData) {
  await requireAdmin();
  const ruleId                = (formData.get("ruleId")                 as string | null)?.trim() ?? "";
  const programId             = (formData.get("programId")              as string | null)?.trim() ?? "";
  const recurrenceType        = (formData.get("recurrenceType")         as string | null)?.trim() ?? "";
  const timezone              = (formData.get("timezone")               as string | null)?.trim() || "Africa/Cairo";
  const allowConnectRaw       = formData.get("allowConnectMinutesBefore") as string | null;
  const allowConnectMinutesBefore = parseInt(allowConnectRaw ?? "5", 10);

  if (!ruleId)    throw new Error("Missing ruleId.");
  if (!programId) throw new Error("Missing programId.");
  if (!VALID_RECURRENCE.includes(recurrenceType)) throw new Error("نوع التكرار غير صالح.");
  if (!timezone)  throw new Error("المنطقة الزمنية مطلوبة.");
  if (isNaN(allowConnectMinutesBefore) || allowConnectMinutesBefore < 0)
    throw new Error("دقائق السماح يجب أن تكون 0 أو أكبر.");

  const existing = await prisma.programScheduleRule.findUnique({ where: { id: ruleId } });
  if (!existing) throw new Error("قاعدة الجدولة غير موجودة.");

  await prisma.programScheduleRule.update({
    where: { id: ruleId },
    data:  { recurrenceType, timezone, allowConnectMinutesBefore },
  });
  revalidatePath(`/admin/programs/${programId}/edit`);
  revalidatePath("/studio", "layout");
  redirect(`/admin/programs/${programId}/edit?saved=rule&editRule=${ruleId}#rule-${ruleId}`);
}

// ── updateScheduleSlot ────────────────────────────────────────────────────────
export async function updateScheduleSlot(formData: FormData) {
  await requireAdmin();
  const slotId         = (formData.get("slotId")         as string | null)?.trim() ?? "";
  const programId      = (formData.get("programId")      as string | null)?.trim() ?? "";
  const recurrenceType = (formData.get("recurrenceType") as string | null)?.trim() ?? "";
  const dayOfWeekRaw   = formData.get("dayOfWeek")       as string | null;
  const slotDateRaw    = formData.get("slotDate")        as string | null;
  const startTime      = (formData.get("startTime")      as string | null)?.trim() ?? "";
  const endTime        = (formData.get("endTime")        as string | null)?.trim() ?? "";

  if (!slotId)    throw new Error("Missing slotId.");
  if (!programId) throw new Error("Missing programId.");
  if (!startTime) throw new Error("وقت البداية مطلوب.");
  if (!endTime)   throw new Error("وقت النهاية مطلوب.");
  if (!TIME_RE.test(startTime)) throw new Error("تنسيق وقت البداية غير صالح (HH:MM).");
  if (!TIME_RE.test(endTime))   throw new Error("تنسيق وقت النهاية غير صالح (HH:MM).");
  if (startTime >= endTime)     throw new Error("وقت البداية يجب أن يكون قبل وقت النهاية.");

  const existing = await prisma.programScheduleSlot.findUnique({ where: { id: slotId } });
  if (!existing) throw new Error("وقت البث غير موجود.");

  let dayOfWeek: number | null = null;
  let slotDate:  Date   | null = null;

  if (recurrenceType === "WEEKLY" || recurrenceType === "SELECTED_DAYS") {
    if (dayOfWeekRaw === null || dayOfWeekRaw === "") throw new Error("يجب اختيار يوم الأسبوع.");
    dayOfWeek = parseInt(dayOfWeekRaw, 10);
    if (!VALID_DAYS.includes(dayOfWeek)) throw new Error("يوم الأسبوع غير صالح.");
  }

  if (recurrenceType === "ONE_TIME") {
    if (!slotDateRaw) throw new Error("يجب تحديد تاريخ الحلقة.");
    slotDate = new Date(slotDateRaw);
    if (isNaN(slotDate.getTime())) throw new Error("تاريخ غير صالح.");
  }

  // ── Conflict detection ───────────────────────────────────────────────────
  // Load the rule + program for the slot being updated.
  const slotRule = await prisma.programScheduleSlot.findUnique({
    where: { id: slotId },
    select: {
      rule: {
        select: {
          recurrenceType: true,
          program: { select: { stationId: true, presenterId: true } },
        },
      },
    },
  });
  if (!slotRule) throw new Error("وقت البث غير موجود.");

  try {
    await checkSlotConflicts({
      stationId:      slotRule.rule.program.stationId,
      presenterId:    slotRule.rule.program.presenterId,
      recurrenceType: recurrenceType || slotRule.rule.recurrenceType,
      dayOfWeek,
      slotDate,
      startTime,
      endTime,
      excludeSlotId:  slotId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "حدث خطأ في فحص التعارض.";
    redirect(`/admin/programs/${programId}/edit?slotError=${encodeURIComponent(msg)}&editSlot=${slotId}#slot-${slotId}`);
  }
  // ─────────────────────────────────────────────────────────────────────────

  await prisma.programScheduleSlot.update({
    where: { id: slotId },
    data:  { dayOfWeek, slotDate, startTime, endTime },
  });
  revalidatePath(`/admin/programs/${programId}/edit`);
  revalidatePath("/studio", "layout");
  redirect(`/admin/programs/${programId}/edit?saved=slot&editSlot=${slotId}#slot-${slotId}`);
}
