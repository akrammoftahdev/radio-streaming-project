"use server";

import { auth, prisma } from "@/auth";
import { revalidatePath } from "next/cache";
import bcrypt from "bcrypt";

// ── Audit log ─────────────────────────────────────────────────────────────────

async function writeAuditLog(
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata: object,
  stationId?: string | null,
) {
  try {
    await prisma.adminAuditLog.create({
      data: {
        actorId,
        actorRole: "STATION_MANAGER",
        action,
        entityType,
        entityId,
        stationId: stationId ?? null,
        metadata: JSON.stringify(metadata),
      },
    });
  } catch (err) {
    console.error("[audit] SM action failed to log:", (err as Error).message);
  }
}

// ── Scope guard ───────────────────────────────────────────────────────────────

async function requireStationManager(): Promise<{
  managerId: string;
  assignedStationIds: string[];
}> {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");
  const role = (session.user as any)?.role as string | undefined;
  if (role !== "STATION_MANAGER") throw new Error("FORBIDDEN");
  const managerId = (session.user as any)?.id as string;
  const assignments = await prisma.stationManagerAssignment.findMany({
    where: { managerId, isActive: true },
    select: { stationId: true },
  });
  return { managerId, assignedStationIds: assignments.map((a) => a.stationId) };
}

// ── Helper: verify presenter is in scope ─────────────────────────────────────
// Returns the presenter row + their PresenterStation links inside assigned stations.

async function resolvePresenterInScope(
  presenterId: string,
  assignedStationIds: string[],
) {
  const presenter = await prisma.user.findUnique({
    where: { id: presenterId },
    select: {
      id: true, username: true, presenterMode: true,
      presenterStations: {
        where: { stationId: { in: assignedStationIds } },
        select: { id: true, stationId: true, isActive: true },
      },
    },
  });
  if (!presenter) return null;
  if (presenter.presenterMode === "DIRECT_DJ") return null;     // never in scope
  if (presenter.presenterStations.length === 0) return null;   // not linked to any assigned station
  return presenter;
}

// ── createPresenter ───────────────────────────────────────────────────────────

export interface ActionResult { error?: string; success?: boolean }

export async function createPresenter(formData: FormData): Promise<ActionResult> {
  let managerId: string, assignedStationIds: string[];
  try { ({ managerId, assignedStationIds } = await requireStationManager()); }
  catch { return { error: "غير مصرح" }; }

  const name      = (formData.get("name")     as string | null)?.trim() || null;
  const username  = (formData.get("username") as string | null)?.trim() ?? "";
  const email     = (formData.get("email")    as string | null)?.trim() || null;
  const phone     = (formData.get("phone")    as string | null)?.trim() || null;
  const password  = (formData.get("password") as string | null) ?? "";
  const stationId = (formData.get("stationId") as string | null)?.trim() ?? "";

  if (!username)        return { error: "اسم المستخدم مطلوب" };
  if (password.length < 6) return { error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" };
  if (!stationId)       return { error: "يجب اختيار محطة" };
  if (!assignedStationIds.includes(stationId)) return { error: "المحطة المختارة غير مسندة لحسابك" };

  const existingU = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (existingU) return { error: "اسم المستخدم مستخدم بالفعل" };
  if (email) {
    const existingE = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existingE) return { error: "البريد الإلكتروني مستخدم بالفعل" };
  }

  let newUserId: string;
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name, username, email, phone, passwordHash, role: "PRESENTER", presenterMode: "SINGLE_STATION", isActive: true, canBroadcast: true },
      });
      await tx.presenterStation.create({ data: { presenterId: user.id, stationId, isActive: true } });
      return user;
    });
    newUserId = result.id;
  } catch (err: any) {
    console.error("[SM createPresenter] DB error:", err?.message);
    return { error: "حدث خطأ أثناء إنشاء الحساب. حاول مجددًا." };
  }

  await writeAuditLog(managerId, "CREATE_STATION_PRESENTER", "User", newUserId,
    { username, name, stationId, presenterMode: "SINGLE_STATION" }, stationId);
  revalidatePath("/station-manager/presenters");
  return { success: true };
}

// ── updateStationPresenter ────────────────────────────────────────────────────
// Editable only for SINGLE_STATION presenters inside an assigned station.
// Fields: name, email, phone, isActive.
// Blocked: presenterMode, username, station, any MULTI_STATION / DIRECT_DJ global edit.

export async function updateStationPresenter(formData: FormData): Promise<ActionResult> {
  let managerId: string, assignedStationIds: string[];
  try { ({ managerId, assignedStationIds } = await requireStationManager()); }
  catch { return { error: "غير مصرح" }; }

  const presenterId = (formData.get("presenterId") as string | null)?.trim() ?? "";
  const stationId   = (formData.get("stationId")   as string | null)?.trim() ?? "";
  if (!presenterId || !stationId) return { error: "بيانات ناقصة" };

  const presenter = await resolvePresenterInScope(presenterId, assignedStationIds);
  if (!presenter) return { error: "المذيع غير موجود ضمن محطاتك" };
  if (presenter.presenterMode !== "SINGLE_STATION") return { error: "لا يمكن تعديل هذا الحساب — هو مذيع متعدد المحطات" };
  if (!assignedStationIds.includes(stationId)) return { error: "المحطة غير مسندة لحسابك" };

  const name     = (formData.get("name")     as string | null)?.trim() || null;
  const email    = (formData.get("email")    as string | null)?.trim() || null;
  const phone    = (formData.get("phone")    as string | null)?.trim() || null;
  const isActive = formData.get("isActive") === "true";

  // Email uniqueness check (exclude self)
  if (email) {
    const existingE = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existingE && existingE.id !== presenterId) return { error: "البريد الإلكتروني مستخدم من حساب آخر" };
  }

  await prisma.user.update({
    where: { id: presenterId },
    data: { name, email: email || null, phone: phone || null, isActive },
  });

  await writeAuditLog(managerId, "UPDATE_STATION_PRESENTER", "User", presenterId,
    { name, email, phone, isActive, stationId }, stationId);
  revalidatePath("/station-manager/presenters");
  return { success: true };
}

// ── changePresenterPassword ───────────────────────────────────────────────────
// SINGLE_STATION presenters only.

export async function changePresenterPassword(formData: FormData): Promise<ActionResult> {
  let managerId: string, assignedStationIds: string[];
  try { ({ managerId, assignedStationIds } = await requireStationManager()); }
  catch { return { error: "غير مصرح" }; }

  const presenterId = (formData.get("presenterId") as string | null)?.trim() ?? "";
  const stationId   = (formData.get("stationId")   as string | null)?.trim() ?? "";
  const newPassword = (formData.get("newPassword") as string | null) ?? "";
  const confirmPw   = (formData.get("confirmPassword") as string | null) ?? "";

  if (!presenterId || !stationId) return { error: "بيانات ناقصة" };
  if (newPassword.length < 6) return { error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" };
  if (newPassword !== confirmPw) return { error: "كلمتا المرور غير متطابقتين" };

  const presenter = await resolvePresenterInScope(presenterId, assignedStationIds);
  if (!presenter) return { error: "المذيع غير موجود ضمن محطاتك" };
  if (presenter.presenterMode !== "SINGLE_STATION") return { error: "لا يمكن تغيير كلمة مرور مذيع متعدد المحطات" };
  if (!assignedStationIds.includes(stationId)) return { error: "المحطة غير مسندة لحسابك" };

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: presenterId }, data: { passwordHash } });

  await writeAuditLog(managerId, "CHANGE_STATION_PRESENTER_PASSWORD", "User", presenterId,
    { presenter: presenter.username, stationId }, stationId);
  revalidatePath("/station-manager/presenters");
  return { success: true };
}

// ── deactivatePresenter ───────────────────────────────────────────────────────
// SINGLE_STATION: sets User.isActive=false if this is their only station link.
//   Falls back to PresenterStation.isActive=false if they have other stations.
// MULTI_STATION: only sets PresenterStation.isActive=false for this manager's station.

export async function deactivatePresenter(
  presenterId: string,
  stationId: string,
): Promise<ActionResult> {
  let managerId: string, assignedStationIds: string[];
  try { ({ managerId, assignedStationIds } = await requireStationManager()); }
  catch { return { error: "غير مصرح" }; }

  if (!assignedStationIds.includes(stationId)) return { error: "المحطة غير مسندة لحسابك" };

  const presenter = await resolvePresenterInScope(presenterId, assignedStationIds);
  if (!presenter) return { error: "المذيع غير موجود ضمن محطاتك" };

  const ps = await prisma.presenterStation.findUnique({
    where: { presenterId_stationId: { presenterId, stationId } },
    select: { id: true, isActive: true },
  });
  if (!ps) return { error: "لا يوجد ارتباط بين هذا المذيع والمحطة" };
  if (!ps.isActive) return { error: "الوصول معطّل مسبقًا" };

  if (presenter.presenterMode === "SINGLE_STATION") {
    // Count ALL their station links (not just this manager's) to decide scope
    const allLinks = await prisma.presenterStation.count({ where: { presenterId, isActive: true } });
    if (allLinks <= 1) {
      // Only station — safe to deactivate the full account
      await prisma.user.update({ where: { id: presenterId }, data: { isActive: false } });
      await writeAuditLog(managerId, "DEACTIVATE_STATION_PRESENTER", "User", presenterId,
        { reason: "single-station deactivation", stationId, presenter: presenter.username }, stationId);
    } else {
      // Has other stations somehow — deactivate station link only
      await prisma.presenterStation.update({
        where: { presenterId_stationId: { presenterId, stationId } },
        data: { isActive: false },
      });
      await writeAuditLog(managerId, "DEACTIVATE_STATION_PRESENTER", "PresenterStation", ps.id,
        { stationId, presenter: presenter.username }, stationId);
    }
  } else {
    // MULTI_STATION — only remove from this station
    await prisma.presenterStation.update({
      where: { presenterId_stationId: { presenterId, stationId } },
      data: { isActive: false },
    });
    await writeAuditLog(managerId, "REMOVE_MULTI_STATION_PRESENTER_FROM_STATION", "PresenterStation", ps.id,
      { stationId, presenter: presenter.username }, stationId);
  }

  revalidatePath("/station-manager/presenters");
  return { success: true };
}
