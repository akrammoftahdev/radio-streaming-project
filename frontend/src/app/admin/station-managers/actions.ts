"use server";

import { auth, prisma } from "@/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcrypt";

// ── Helper: write audit log ───────────────────────────────────────────────────
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
        actorRole: "ADMIN",
        action,
        entityType,
        entityId,
        stationId: stationId ?? null,
        metadata: JSON.stringify(metadata),
      },
    });
  } catch (err) {
    console.error("[audit] Failed to write audit log:", (err as Error).message);
  }
}

// ── Auth guard helper ─────────────────────────────────────────────────────────
async function requireAdmin() {
  const session = await auth();
  if (!session || (session.user as any).role !== "ADMIN") throw new Error("Unauthorized");
  return (session.user as any).id as string;
}

// ── updateStationManagerAssignments ──────────────────────────────────────────
export async function updateStationManagerAssignments(formData: FormData) {
  const adminId   = await requireAdmin();
  const managerId = (formData.get("managerId") as string | null)?.trim() ?? "";
  const selectedIds = formData.getAll("stationIds") as string[];
  if (!managerId) throw new Error("managerId is required");

  const current    = await prisma.stationManagerAssignment.findMany({
    where: { managerId, isActive: true },
    select: { stationId: true },
  });
  const currentIds = new Set(current.map(r => r.stationId));
  const nextIds    = new Set(selectedIds.filter(Boolean));
  const toAdd      = [...nextIds].filter(id => !currentIds.has(id));
  const toRemove   = [...currentIds].filter(id => !nextIds.has(id));

  await prisma.$transaction(async (tx) => {
    for (const stationId of toAdd) {
      await tx.stationManagerAssignment.upsert({
        where:  { managerId_stationId: { managerId, stationId } },
        create: { managerId, stationId, isActive: true, createdBy: adminId },
        update: { isActive: true },
      });
    }
    if (toRemove.length > 0) {
      await tx.stationManagerAssignment.updateMany({
        where: { managerId, stationId: { in: toRemove } },
        data:  { isActive: false },
      });
    }
  });

  await writeAuditLog(adminId, "UPDATE_STATION_MANAGER_ASSIGNMENTS", "StationManagerAssignment", managerId, {
    managerId, selectedStationIds: [...nextIds], addedStationIds: toAdd, removedStationIds: toRemove,
  });
  revalidatePath("/admin/station-managers");
}

// ── createStationManagerUser ──────────────────────────────────────────────────
export async function createStationManagerUser(formData: FormData) {
  const adminId  = await requireAdmin();
  const name     = (formData.get("name")     as string | null)?.trim() || null;
  const username = (formData.get("username") as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string | null)?.trim() ?? "";
  const email    = (formData.get("email")    as string | null)?.trim() || null;
  const phone    = (formData.get("phone")    as string | null)?.trim() || null;

  if (!username || username.length < 3)
    redirect("/admin/station-managers?error=" + encodeURIComponent("اسم المستخدم يجب أن يكون 3 أحرف على الأقل"));
  if (!password || password.length < 6)
    redirect("/admin/station-managers?error=" + encodeURIComponent("كلمة المرور يجب أن تكون 6 أحرف على الأقل"));

  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, ...(email ? [{ email }] : [])] },
  });
  if (existing)
    redirect("/admin/station-managers?error=" + encodeURIComponent("اسم المستخدم أو البريد الإلكتروني مستخدم بالفعل"));

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, username, passwordHash, email, phone, role: "STATION_MANAGER",
      isActive: true, canBroadcast: false, presenterMode: "SINGLE_STATION" },
  });

  await writeAuditLog(adminId, "CREATE_STATION_MANAGER", "User", user.id, { username, name });
  revalidatePath("/admin/station-managers");
}

// ── updateStationManagerUser ──────────────────────────────────────────────────
export async function updateStationManagerUser(formData: FormData) {
  const adminId   = await requireAdmin();
  const managerId = (formData.get("managerId") as string | null)?.trim() ?? "";
  const name      = (formData.get("name")      as string | null)?.trim() || null;
  const username  = (formData.get("username")  as string | null)?.trim() ?? "";
  const email     = (formData.get("email")     as string | null)?.trim() || null;
  const phone     = (formData.get("phone")     as string | null)?.trim() || null;

  if (!managerId) throw new Error("managerId required");
  if (!username || username.length < 3)
    redirect("/admin/station-managers?error=" + encodeURIComponent("اسم المستخدم يجب أن يكون 3 أحرف على الأقل"));

  const target = await prisma.user.findUnique({ where: { id: managerId } });
  if (!target || target.role !== "STATION_MANAGER")
    redirect("/admin/station-managers?error=" + encodeURIComponent("مدير المحطة غير موجود"));

  // Block duplicate username/email for OTHER users
  const conflict = await prisma.user.findFirst({
    where: {
      id: { not: managerId },
      OR: [{ username }, ...(email ? [{ email }] : [])],
    },
  });
  if (conflict)
    redirect("/admin/station-managers?error=" + encodeURIComponent("اسم المستخدم أو البريد الإلكتروني مستخدم بالفعل"));

  await prisma.user.update({
    where: { id: managerId },
    data:  { name, username, email: email || null, phone: phone || null },
  });

  await writeAuditLog(adminId, "UPDATE_STATION_MANAGER_USER", "User", managerId, {
    targetManagerId: managerId, changedFields: { name, username, email, phone },
  });
  revalidatePath("/admin/station-managers");
}

// ── changeStationManagerPassword ─────────────────────────────────────────────
export async function changeStationManagerPassword(formData: FormData) {
  const adminId    = await requireAdmin();
  const managerId  = (formData.get("managerId")  as string | null)?.trim() ?? "";
  const newPassword = (formData.get("newPassword") as string | null)?.trim() ?? "";
  const confirmPassword = (formData.get("confirmPassword") as string | null)?.trim() ?? "";

  if (!managerId) throw new Error("managerId required");
  if (newPassword.length < 6)
    redirect("/admin/station-managers?error=" + encodeURIComponent("كلمة المرور يجب أن تكون 6 أحرف على الأقل"));
  if (newPassword !== confirmPassword)
    redirect("/admin/station-managers?error=" + encodeURIComponent("كلمتا المرور غير متطابقتين"));

  const target = await prisma.user.findUnique({ where: { id: managerId } });
  if (!target || target.role !== "STATION_MANAGER")
    redirect("/admin/station-managers?error=" + encodeURIComponent("مدير المحطة غير موجود"));

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: managerId }, data: { passwordHash } });

  await writeAuditLog(adminId, "CHANGE_STATION_MANAGER_PASSWORD", "User", managerId, {
    targetManagerId: managerId,
  });
  revalidatePath("/admin/station-managers");
}

// ── toggleStationManagerActive ────────────────────────────────────────────────
export async function toggleStationManagerActive(formData: FormData) {
  const adminId   = await requireAdmin();
  const managerId = (formData.get("managerId")     as string | null)?.trim() ?? "";
  const current   = (formData.get("currentIsActive") as string | null) === "true";

  if (!managerId) throw new Error("managerId required");

  const target = await prisma.user.findUnique({ where: { id: managerId } });
  if (!target || target.role !== "STATION_MANAGER")
    redirect("/admin/station-managers?error=" + encodeURIComponent("مدير المحطة غير موجود"));

  const nextActive = !current;
  await prisma.user.update({ where: { id: managerId }, data: { isActive: nextActive } });

  await writeAuditLog(adminId, "TOGGLE_STATION_MANAGER_ACTIVE", "User", managerId, {
    targetManagerId: managerId, previousIsActive: current, newIsActive: nextActive,
  });
  revalidatePath("/admin/station-managers");
}

// -----------------------------------------------------------
// ── deleteStationManager ──────────────────────────────────────────────────────
// Full account deletion — removes the STATION_MANAGER user and their station
// assignments permanently. Does NOT touch stations, presenters, programs,
// recordings, schedules, credentials, or any station-owned data.
// Station Manager is a permission holder only — not an owner of station data.
//
//   StationManagerAssignment → User (onDelete: Cascade) — auto-deletes.
//   AccessLog → User (no onDelete → RESTRICT) — we delete explicitly first.
//   All other User FK relations (PresenterProfile, BroadcastSchedule, Program,
//   Recording, SonicPanelCredential, LiveSession, DirectDjRadio) are only
//   created for PRESENTER accounts — a STATION_MANAGER will never have them.
export async function deleteStationManager(formData: FormData) {
  const adminId   = await requireAdmin();
  const managerId = (formData.get("managerId") as string | null)?.trim() ?? "";

  console.log(`[SM Delete] action called. managerId=${managerId || "(empty)"}`);

  if (!managerId)
    redirect("/admin/station-managers?error=" + encodeURIComponent("المعرّف مفقود"));
  if (managerId === adminId)
    redirect("/admin/station-managers?error=" + encodeURIComponent("لا يمكنك حذف حسابك الخاص"));

  const target = await prisma.user.findUnique({
    where:  { id: managerId },
    select: {
      id: true, username: true, name: true, role: true,
      stationManagerAssignments: {
        select: { stationId: true },
      },
    },
  });

  if (!target)
    redirect("/admin/station-managers?error=" + encodeURIComponent("المدير غير موجود"));
  if (target!.role !== "STATION_MANAGER")
    redirect("/admin/station-managers?error=" + encodeURIComponent("الحساب ليس مدير محطة"));

  // Capture for audit log BEFORE deletion
  const assignedStationIds = target!.stationManagerAssignments.map(a => a.stationId);

  // Write audit log BEFORE transaction (AdminAuditLog has no FK to User — safe)
  await writeAuditLog(
    adminId,
    "DELETE_STATION_MANAGER",
    "User",
    managerId,
    {
      managerId,
      managerUsername:  target!.username,
      managerName:      target!.name ?? null,
      assignedStationIds,
      note: "Station Manager account permanently deleted. All station data preserved.",
    },
  );

  // Transaction: delete AccessLog rows first (FK blocker), then assignments, then user
  await prisma.$transaction(async (tx) => {
    await tx.accessLog.deleteMany({ where: { userId: managerId } });
    await tx.stationManagerAssignment.deleteMany({ where: { managerId } });
    await tx.user.delete({ where: { id: managerId } });
  });

  revalidatePath("/admin/station-managers");
  revalidatePath("/admin");
  redirect("/admin/station-managers?saved=deleted");
}
