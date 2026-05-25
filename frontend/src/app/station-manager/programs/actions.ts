"use server";

import { auth, prisma } from "@/auth";
import { revalidatePath } from "next/cache";

// ── Scope guard ───────────────────────────────────────────────────────────────

async function requireSM(): Promise<{ managerId: string; assignedIds: string[] }> {
  const session = await auth();
  if (!session?.user || (session.user as any)?.role !== "STATION_MANAGER")
    throw new Error("FORBIDDEN");
  const managerId = (session.user as any)?.id as string;
  const assignments = await prisma.stationManagerAssignment.findMany({
    where: { managerId, isActive: true }, select: { stationId: true },
  });
  return { managerId, assignedIds: assignments.map((a) => a.stationId) };
}

async function writeAudit(
  actorId: string, action: string, entityType: string,
  entityId: string, stationId: string, metadata: object,
) {
  try {
    await prisma.adminAuditLog.create({
      data: { actorId, actorRole: "STATION_MANAGER", action, entityType, entityId, stationId, metadata: JSON.stringify(metadata) },
    });
  } catch { /* non-blocking */ }
}

// ── createProgram ─────────────────────────────────────────────────────────────

export interface ActionResult { error?: string; success?: boolean }

export async function createProgram(formData: FormData): Promise<ActionResult> {
  let managerId: string, assignedIds: string[];
  try { ({ managerId, assignedIds } = await requireSM()); }
  catch { return { error: "غير مصرح" }; }

  const title       = (formData.get("title")       as string)?.trim() ?? "";
  const stationId   = (formData.get("stationId")   as string)?.trim() ?? "";
  const presenterId = (formData.get("presenterId") as string)?.trim() ?? "";

  if (!title || !stationId || !presenterId) return { error: "جميع الحقول مطلوبة" };
  if (!assignedIds.includes(stationId)) return { error: "المحطة غير مسندة لحسابك" };

  const ps = await prisma.presenterStation.findUnique({
    where: { presenterId_stationId: { presenterId, stationId } }, select: { id: true },
  });
  if (!ps) return { error: "المذيع غير مرتبط بهذه المحطة" };

  const prog = await prisma.program.create({
    data: { title, stationId, presenterId, isActive: true },
  });
  await writeAudit(managerId, "CREATE_STATION_PROGRAM", "Program", prog.id, stationId, { title, presenterId });
  revalidatePath("/station-manager/programs");
  return { success: true };
}

// ── updateProgram ─────────────────────────────────────────────────────────────

export async function updateProgram(formData: FormData): Promise<ActionResult> {
  let managerId: string, assignedIds: string[];
  try { ({ managerId, assignedIds } = await requireSM()); }
  catch { return { error: "غير مصرح" }; }

  const programId   = (formData.get("programId")   as string)?.trim() ?? "";
  const stationId   = (formData.get("stationId")   as string)?.trim() ?? "";
  const title       = (formData.get("title")       as string)?.trim() ?? "";
  const description = (formData.get("description") as string)?.trim() || null;
  const isActive    = formData.get("isActive") === "true";

  if (!assignedIds.includes(stationId)) return { error: "المحطة غير مسندة لحسابك" };
  if (!title) return { error: "عنوان البرنامج مطلوب" };

  const prog = await prisma.program.findUnique({ where: { id: programId }, select: { stationId: true } });
  if (!prog || !assignedIds.includes(prog.stationId)) return { error: "البرنامج غير موجود ضمن محطاتك" };

  await prisma.program.update({ where: { id: programId }, data: { title, description, isActive } });
  await writeAudit(managerId, "UPDATE_STATION_MANAGER_PROGRAM", "Program", programId, stationId, { title, description, isActive });
  revalidatePath("/station-manager/programs");
  return { success: true };
}

// ── toggleProgram ─────────────────────────────────────────────────────────────

export async function toggleProgram(formData: FormData): Promise<ActionResult> {
  let managerId: string, assignedIds: string[];
  try { ({ managerId, assignedIds } = await requireSM()); }
  catch { return { error: "غير مصرح" }; }

  const programId = (formData.get("programId") as string)?.trim() ?? "";
  const stationId = (formData.get("stationId") as string)?.trim() ?? "";
  const current   = formData.get("current") === "true";

  if (!assignedIds.includes(stationId)) return { error: "المحطة غير مسندة لحسابك" };

  const prog = await prisma.program.findUnique({ where: { id: programId }, select: { stationId: true } });
  if (!prog || !assignedIds.includes(prog.stationId)) return { error: "البرنامج غير موجود ضمن محطاتك" };

  await prisma.program.update({ where: { id: programId }, data: { isActive: !current } });
  await writeAudit(managerId, "TOGGLE_STATION_MANAGER_PROGRAM", "Program", programId, stationId, { isActive: !current });
  revalidatePath("/station-manager/programs");
  return { success: true };
}

// ── disableProgram ────────────────────────────────────────────────────────────
// Safe disable only — no physical DELETE (preserves recording/schedule linkage).

export async function disableProgram(formData: FormData): Promise<ActionResult> {
  let managerId: string, assignedIds: string[];
  try { ({ managerId, assignedIds } = await requireSM()); }
  catch { return { error: "غير مصرح" }; }

  const programId = (formData.get("programId") as string)?.trim() ?? "";
  const stationId = (formData.get("stationId") as string)?.trim() ?? "";

  if (!assignedIds.includes(stationId)) return { error: "المحطة غير مسندة لحسابك" };

  const prog = await prisma.program.findUnique({ where: { id: programId }, select: { stationId: true } });
  if (!prog || !assignedIds.includes(prog.stationId)) return { error: "البرنامج غير موجود ضمن محطاتك" };

  await prisma.program.update({ where: { id: programId }, data: { isActive: false } });
  await writeAudit(managerId, "DELETE_OR_DISABLE_STATION_MANAGER_PROGRAM", "Program", programId, stationId, { action: "disable" });
  revalidatePath("/station-manager/programs");
  return { success: true };
}

// ── Helper: resolve program stationId and verify it is in scope ────────────────

async function resolveProgramStation(
  programId: string,
  assignedIds: string[],
): Promise<{ stationId: string } | null> {
  const prog = await prisma.program.findUnique({ where: { id: programId }, select: { stationId: true } });
  if (!prog || !assignedIds.includes(prog.stationId)) return null;
  return prog;
}

// ── createScheduleRule ────────────────────────────────────────────────────────
// Creates a ProgramScheduleRule for a program in an assigned station.
// Conflict detection is deferred to the global schedule resolver —
// the scheduler will enforce time boundaries at broadcast time.

export async function createScheduleRule(formData: FormData): Promise<ActionResult> {
  let managerId: string, assignedIds: string[];
  try { ({ managerId, assignedIds } = await requireSM()); }
  catch { return { error: "غير مصرح" }; }

  const programId                 = (formData.get("programId")                 as string)?.trim() ?? "";
  const recurrenceType            = (formData.get("recurrenceType")            as string)?.trim() ?? "WEEKLY";
  const timezone                  = (formData.get("timezone")                  as string)?.trim() || "Africa/Cairo";
  const allowConnectMinutesBefore = parseInt(formData.get("allowConnectMinutesBefore") as string, 10) || 5;

  if (!programId || !recurrenceType) return { error: "بيانات ناقصة" };
  if (!["DAILY","WEEKLY","SELECTED_DAYS","ONE_TIME"].includes(recurrenceType))
    return { error: "نوع التكرار غير صالح" };

  const prog = await resolveProgramStation(programId, assignedIds);
  if (!prog) return { error: "البرنامج غير موجود ضمن محطاتك" };

  const rule = await prisma.programScheduleRule.create({
    data: { programId, recurrenceType, timezone, allowConnectMinutesBefore, isActive: true },
  });

  await writeAudit(managerId, "CREATE_STATION_MANAGER_SCHEDULE_RULE", "ProgramScheduleRule", rule.id,
    prog.stationId, { programId, recurrenceType, timezone });
  revalidatePath("/station-manager/programs");
  return { success: true };
}

// ── createScheduleSlot ────────────────────────────────────────────────────────
// Creates a ProgramScheduleSlot under a rule that belongs to a program
// in an assigned station.

export async function createScheduleSlot(formData: FormData): Promise<ActionResult> {
  let managerId: string, assignedIds: string[];
  try { ({ managerId, assignedIds } = await requireSM()); }
  catch { return { error: "غير مصرح" }; }

  const ruleId    = (formData.get("ruleId")    as string)?.trim() ?? "";
  const programId = (formData.get("programId") as string)?.trim() ?? "";
  const startTime = (formData.get("startTime") as string)?.trim() ?? "";
  const endTime   = (formData.get("endTime")   as string)?.trim() ?? "";
  const dayOfWeekRaw = formData.get("dayOfWeek") as string | null;
  const slotDateRaw  = formData.get("slotDate")  as string | null;

  if (!ruleId || !programId || !startTime || !endTime) return { error: "بيانات ناقصة (القاعدة، وقت البداية والنهاية مطلوبة)" };

  // Validate HH:MM format
  const timeRe = /^\d{2}:\d{2}$/;
  if (!timeRe.test(startTime) || !timeRe.test(endTime)) return { error: "صيغة الوقت غير صحيحة (HH:MM)" };
  if (startTime >= endTime) return { error: "وقت البداية يجب أن يكون قبل وقت النهاية" };

  // Verify rule belongs to the program
  const rule = await prisma.programScheduleRule.findUnique({
    where: { id: ruleId }, select: { programId: true, recurrenceType: true },
  });
  if (!rule || rule.programId !== programId) return { error: "القاعدة غير مرتبطة بهذا البرنامج" };

  const prog = await resolveProgramStation(programId, assignedIds);
  if (!prog) return { error: "البرنامج غير موجود ضمن محطاتك" };

  // Parse optional fields
  const dayOfWeek = dayOfWeekRaw && dayOfWeekRaw !== ""
    ? parseInt(dayOfWeekRaw, 10) : null;
  const slotDate = slotDateRaw && slotDateRaw !== "" && rule.recurrenceType === "ONE_TIME"
    ? new Date(slotDateRaw) : null;

  const slot = await prisma.programScheduleSlot.create({
    data: { ruleId, startTime, endTime, dayOfWeek, slotDate, isActive: true },
  });

  await writeAudit(managerId, "CREATE_STATION_MANAGER_SCHEDULE_SLOT", "ProgramScheduleSlot", slot.id,
    prog.stationId, { ruleId, programId, startTime, endTime, dayOfWeek, slotDate });
  revalidatePath("/station-manager/programs");
  return { success: true };
}

// ── deleteScheduleSlot ────────────────────────────────────────────────────────

export async function deleteScheduleSlot(formData: FormData): Promise<ActionResult> {
  let managerId: string, assignedIds: string[];
  try { ({ managerId, assignedIds } = await requireSM()); }
  catch { return { error: "غير مصرح" }; }

  const slotId    = (formData.get("slotId")    as string)?.trim() ?? "";
  const programId = (formData.get("programId") as string)?.trim() ?? "";

  const slot = await prisma.programScheduleSlot.findUnique({
    where: { id: slotId }, include: { rule: { select: { programId: true } } },
  });
  if (!slot || slot.rule.programId !== programId) return { error: "الوقت غير موجود" };

  const prog = await resolveProgramStation(programId, assignedIds);
  if (!prog) return { error: "البرنامج غير موجود ضمن محطاتك" };

  await prisma.programScheduleSlot.delete({ where: { id: slotId } });
  await writeAudit(managerId, "DELETE_STATION_MANAGER_SCHEDULE_SLOT", "ProgramScheduleSlot", slotId,
    prog.stationId, { programId });
  revalidatePath("/station-manager/programs");
  return { success: true };
}

// ── updateScheduleRule ────────────────────────────────────────────────────────

export async function updateScheduleRule(formData: FormData): Promise<ActionResult> {
  let managerId: string, assignedIds: string[];
  try { ({ managerId, assignedIds } = await requireSM()); }
  catch { return { error: "غير مصرح" }; }

  const ruleId                    = (formData.get("ruleId")                    as string)?.trim() ?? "";
  const programId                 = (formData.get("programId")                 as string)?.trim() ?? "";
  const recurrenceType            = (formData.get("recurrenceType")            as string)?.trim() ?? "";
  const timezone                  = (formData.get("timezone")                  as string)?.trim() || "Africa/Cairo";
  const allowConnectMinutesBefore = Math.max(0, parseInt(formData.get("allowConnectMinutesBefore") as string, 10) || 5);
  const isActive                  = formData.get("isActive") === "true";

  if (!ruleId || !programId || !recurrenceType) return { error: "بيانات ناقصة" };
  if (!["DAILY","WEEKLY","SELECTED_DAYS","ONE_TIME"].includes(recurrenceType))
    return { error: "نوع التكرار غير صالح" };

  // Verify rule → program → station scope
  const rule = await prisma.programScheduleRule.findUnique({
    where: { id: ruleId },
    include: { program: { select: { id: true, stationId: true } } },
  });
  if (!rule || rule.programId !== programId) return { error: "القاعدة غير مرتبطة بهذا البرنامج" };
  if (!assignedIds.includes(rule.program.stationId)) return { error: "البرنامج خارج نطاق محطاتك" };

  await prisma.programScheduleRule.update({
    where: { id: ruleId },
    data: { recurrenceType, timezone, allowConnectMinutesBefore, isActive },
  });

  await writeAudit(managerId, "UPDATE_STATION_MANAGER_SCHEDULE_RULE", "ProgramScheduleRule", ruleId,
    rule.program.stationId, { programId, recurrenceType, timezone, allowConnectMinutesBefore, isActive });
  revalidatePath("/station-manager/programs");
  return { success: true };
}

// ── updateScheduleSlot ────────────────────────────────────────────────────────

export async function updateScheduleSlot(formData: FormData): Promise<ActionResult> {
  let managerId: string, assignedIds: string[];
  try { ({ managerId, assignedIds } = await requireSM()); }
  catch { return { error: "غير مصرح" }; }

  const slotId    = (formData.get("slotId")    as string)?.trim() ?? "";
  const programId = (formData.get("programId") as string)?.trim() ?? "";
  const startTime = (formData.get("startTime") as string)?.trim() ?? "";
  const endTime   = (formData.get("endTime")   as string)?.trim() ?? "";
  const dayOfWeekRaw = formData.get("dayOfWeek") as string | null;
  const slotDateRaw  = formData.get("slotDate")  as string | null;
  const isActive     = formData.get("isActive") === "true";

  if (!slotId || !programId || !startTime || !endTime) return { error: "بيانات ناقصة" };

  const timeRe = /^\d{2}:\d{2}$/;
  if (!timeRe.test(startTime) || !timeRe.test(endTime)) return { error: "صيغة الوقت غير صحيحة (HH:MM)" };
  if (startTime >= endTime) return { error: "وقت البداية يجب أن يكون قبل وقت النهاية" };

  // Verify slot → rule → program → station scope
  const slot = await prisma.programScheduleSlot.findUnique({
    where: { id: slotId },
    include: {
      rule: {
        include: { program: { select: { id: true, stationId: true } } },
      },
    },
  });
  if (!slot || slot.rule.programId !== programId) return { error: "الوقت غير مرتبط بهذا البرنامج" };
  if (!assignedIds.includes(slot.rule.program.stationId)) return { error: "البرنامج خارج نطاق محطاتك" };

  const dayOfWeek = dayOfWeekRaw && dayOfWeekRaw !== "" ? parseInt(dayOfWeekRaw, 10) : null;
  const slotDate  = slotDateRaw  && slotDateRaw  !== "" && slot.rule.recurrenceType === "ONE_TIME"
    ? new Date(slotDateRaw) : null;

  await prisma.programScheduleSlot.update({
    where: { id: slotId },
    data: { startTime, endTime, dayOfWeek, slotDate, isActive },
  });

  await writeAudit(managerId, "UPDATE_STATION_MANAGER_SCHEDULE_SLOT", "ProgramScheduleSlot", slotId,
    slot.rule.program.stationId, { programId, startTime, endTime, dayOfWeek, isActive });
  revalidatePath("/station-manager/programs");
  return { success: true };
}
