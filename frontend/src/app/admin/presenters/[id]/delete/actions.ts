"use server";

import { auth, prisma } from "@/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// ── Auth helper ───────────────────────────────────────────────────────────────
async function getAdminId(): Promise<string> {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    redirect("/login");
  }
  return (session.user as { id?: string }).id ?? "";
}

// ── Shared: fetch dependency counts ──────────────────────────────────────────
export async function getDependencyCounts(presenterId: string) {
  const [programs, activePrograms, recordings, liveSessions, schedules, stations, djRadios, creds, validity, profile, accessLogs] =
    await Promise.all([
      prisma.program.count({ where: { presenterId } }),
      prisma.program.count({ where: { presenterId, isActive: true } }),
      prisma.recording.count({ where: { presenterId } }),
      prisma.liveSession.count({ where: { presenterId } }),
      prisma.broadcastSchedule.count({ where: { presenterId } }),
      prisma.presenterStation.count({ where: { presenterId } }),
      prisma.directDjRadio.count({ where: { presenterId } }),
      prisma.sonicPanelCredential.count({ where: { presenterId } }),
      prisma.presenterValidity.count({ where: { presenterId } }),
      prisma.presenterProfile.count({ where: { userId: presenterId } }),
      prisma.accessLog.count({ where: { userId: presenterId } }),
    ]);
  return { programs, activePrograms, recordings, liveSessions, schedules, stations, djRadios, creds, validity, profile, accessLogs };
}

// ── Deactivate presenter ──────────────────────────────────────────────────────
export type PresenterActionResult = { ok: true } | { ok: false; error: string };

export async function deactivatePresenter(
  _prevState: PresenterActionResult | null,
  formData: FormData
): Promise<PresenterActionResult> {
  const adminId     = await getAdminId();
  const presenterId = (formData.get("presenterId") as string)?.trim() ?? "";
  if (!presenterId) return { ok: false, error: "معرّف المذيع مطلوب" };

  const presenter = await prisma.user.findUnique({
    where:  { id: presenterId },
    select: { id: true, username: true, isActive: true },
  });
  if (!presenter) return { ok: false, error: "المذيع غير موجود" };

  const deps = await getDependencyCounts(presenterId);

  await prisma.user.update({
    where: { id: presenterId },
    data:  { isActive: false, canBroadcast: false },
  });

  await prisma.adminAuditLog.create({
    data: {
      actorId:    adminId,
      actorRole:  "ADMIN",
      action:     "DEACTIVATE_PRESENTER",
      entityType: "User",
      entityId:   presenterId,
      metadata:   JSON.stringify({ username: presenter.username, wasActive: presenter.isActive, deps }),
    },
  }).catch(() => {});

  revalidatePath(`/admin/presenters/${presenterId}/delete`);
  revalidatePath(`/admin/presenters/${presenterId}/edit`);
  revalidatePath("/admin/presenters");
  return { ok: true };
}

// ── Hard delete presenter ─────────────────────────────────────────────────────
export async function hardDeletePresenter(
  _prevState: PresenterActionResult | null,
  formData: FormData
): Promise<PresenterActionResult> {
  const adminId     = await getAdminId();
  const presenterId = (formData.get("presenterId") as string)?.trim() ?? "";
  if (!presenterId) return { ok: false, error: "معرّف المذيع مطلوب" };

  const presenter = await prisma.user.findUnique({
    where:  { id: presenterId },
    select: { id: true, username: true, role: true, presenterMode: true },
  });
  if (!presenter) return { ok: false, error: "المذيع غير موجود" };

  // Re-check blocking dependencies (server-side guard — never rely on client)
  // Policy: block on ACTIVE programs only (disabled programs are not a blocker).
  // Block on ALL recordings (DB FK RESTRICT — cannot delete user with recordings).
  // Block on ALL live sessions (DB FK RESTRICT — historical data preserved).
  // Block on legacy BroadcastSchedule rows (cleaned via wizard).
  const deps = await getDependencyCounts(presenterId);
  const blockers = [deps.activePrograms, deps.recordings, deps.liveSessions, deps.schedules].filter(Boolean);
  if (blockers.length > 0) {
    return {
      ok: false,
      error: [
        deps.activePrograms > 0 ? `${deps.activePrograms} برنامج نشط` : null,
        deps.recordings    > 0 ? `${deps.recordings} تسجيل`       : null,
        deps.liveSessions  > 0 ? `${deps.liveSessions} جلسة بث`    : null,
        deps.schedules     > 0 ? `${deps.schedules} جدول بث`       : null,
      ].filter(Boolean).join(" · ") + " — يمنع الحذف النهائي",
    };
  }

  // Write audit BEFORE deleting user so FK is still valid
  await prisma.adminAuditLog.create({
    data: {
      actorId:    adminId,
      actorRole:  "ADMIN",
      action:     "DELETE_PRESENTER",
      entityType: "User",
      entityId:   presenterId,
      metadata:   JSON.stringify({ username: presenter.username, role: presenter.role, presenterMode: presenter.presenterMode, deps }),
    },
  }).catch(() => {});

  // Transactional cleanup + delete
  // Order matters: remove FK dependents before user.delete.
  // Program.presenterId has NO onDelete → must be explicitly deleted.
  // Recording.programId has onDelete: SetNull → deleting programs is safe.
  // ProgramScheduleRule/Slot/Exception cascade from Program automatically.
  // PresenterStation, DirectDjRadio, StationManagerAssignment cascade from User automatically.
  try {
    await prisma.$transaction(async (tx) => {
      // 0. Snapshot preservation — populate Recording snapshot fields before presenter is deleted.
      //    With presenterId now nullable + onDelete:SetNull, user.delete will null presenterId.
      //    These snapshot fields ensure archive pages can still display the name.
      const presenterUser = await tx.user.findUnique({
        where: { id: presenterId }, select: { name: true, username: true },
      });
      const recordingsAffected = await tx.recording.updateMany({
        where: { presenterId, presenterDeleted: false },
        data: {
          presenterNameSnapshot:     presenterUser?.name     ?? null,
          presenterUsernameSnapshot: presenterUser?.username ?? null,
          presenterDeleted: true,
        },
      });

      // 1. Programs (inactive — wizard guarantees activePrograms=0; Recording.programId→SetNull)
      await tx.program.deleteMany({ where: { presenterId } });
      // 2. Auxiliary rows with RESTRICT FK to User
      await tx.accessLog.deleteMany({ where: { userId: presenterId } });
      await tx.sonicPanelCredential.deleteMany({ where: { presenterId } });
      await tx.presenterValidity.deleteMany({ where: { presenterId } });
      await tx.presenterProfile.deleteMany({ where: { userId: presenterId } });
      await tx.broadcastSchedule.deleteMany({ where: { presenterId } });
      // 3. Cascade-safe: PresenterStation, DirectDjRadio, StationManagerAssignment
      //    auto-deleted by DB cascade when user row is removed.
      await tx.user.delete({ where: { id: presenterId } });
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isFk = /foreign key|constraint/i.test(msg);
    return {
      ok: false,
      error: isFk
        ? "فشل الحذف — لا يزال هناك ارتباط بجداول أخرى لم تُنظَّف. راجع قائمة التبعيات وأعد المحاولة."
        : `فشل الحذف: ${msg.slice(0, 150)}`,
    };
  }

  revalidatePath("/admin/presenters");
  redirect("/admin/presenters");
}

// ── Cleanup: disable all programs ─────────────────────────────────────────────
export async function disableAllPresenterPrograms(
  _prevState: PresenterActionResult | null,
  formData: FormData
): Promise<PresenterActionResult> {
  const adminId     = await getAdminId();
  const presenterId = (formData.get("presenterId") as string)?.trim() ?? "";
  if (!presenterId) return { ok: false, error: "معرّف المذيع مطلوب" };

  const presenter = await prisma.user.findUnique({ where: { id: presenterId }, select: { username: true } });
  if (!presenter) return { ok: false, error: "المذيع غير موجود" };

  const { count } = await prisma.program.updateMany({
    where: { presenterId },
    data:  { isActive: false },
  });

  await prisma.adminAuditLog.create({ data: {
    actorId: adminId, actorRole: "ADMIN",
    action: "DISABLE_ALL_PRESENTER_PROGRAMS", entityType: "User", entityId: presenterId,
    metadata: JSON.stringify({ username: presenter.username, programsDisabled: count }),
  }}).catch(() => {});

  revalidatePath(`/admin/presenters/${presenterId}/delete`);
  return { ok: true };
}

// ── Cleanup: delete legacy BroadcastSchedule rows ─────────────────────────────
export async function deleteLegacyBroadcastSchedules(
  _prevState: PresenterActionResult | null,
  formData: FormData
): Promise<PresenterActionResult> {
  const adminId     = await getAdminId();
  const presenterId = (formData.get("presenterId") as string)?.trim() ?? "";
  if (!presenterId) return { ok: false, error: "معرّف المذيع مطلوب" };

  const presenter = await prisma.user.findUnique({ where: { id: presenterId }, select: { username: true } });
  if (!presenter) return { ok: false, error: "المذيع غير موجود" };

  const { count } = await prisma.broadcastSchedule.deleteMany({ where: { presenterId } });

  await prisma.adminAuditLog.create({ data: {
    actorId: adminId, actorRole: "ADMIN",
    action: "DELETE_LEGACY_BROADCAST_SCHEDULES", entityType: "User", entityId: presenterId,
    metadata: JSON.stringify({ username: presenter.username, deletedCount: count }),
  }}).catch(() => {});

  revalidatePath(`/admin/presenters/${presenterId}/delete`);
  return { ok: true };
}

// ── Cleanup: unlink all PresenterStation rows ─────────────────────────────────
export async function unlinkAllPresenterStations(
  _prevState: PresenterActionResult | null,
  formData: FormData
): Promise<PresenterActionResult> {
  const adminId     = await getAdminId();
  const presenterId = (formData.get("presenterId") as string)?.trim() ?? "";
  if (!presenterId) return { ok: false, error: "معرّف المذيع مطلوب" };

  const presenter = await prisma.user.findUnique({ where: { id: presenterId }, select: { username: true } });
  if (!presenter) return { ok: false, error: "المذيع غير موجود" };

  const { count } = await prisma.presenterStation.deleteMany({ where: { presenterId } });

  await prisma.adminAuditLog.create({ data: {
    actorId: adminId, actorRole: "ADMIN",
    action: "UNLINK_PRESENTER_STATIONS", entityType: "User", entityId: presenterId,
    metadata: JSON.stringify({ username: presenter.username, deletedCount: count }),
  }}).catch(() => {});

  revalidatePath(`/admin/presenters/${presenterId}/delete`);
  return { ok: true };
}

// ── Cleanup: delete SonicPanelCredential rows ─────────────────────────────────
export async function deletePresenterLegacyCredentials(
  _prevState: PresenterActionResult | null,
  formData: FormData
): Promise<PresenterActionResult> {
  const adminId     = await getAdminId();
  const presenterId = (formData.get("presenterId") as string)?.trim() ?? "";
  if (!presenterId) return { ok: false, error: "معرّف المذيع مطلوب" };

  const presenter = await prisma.user.findUnique({ where: { id: presenterId }, select: { username: true } });
  if (!presenter) return { ok: false, error: "المذيع غير موجود" };

  const { count } = await prisma.sonicPanelCredential.deleteMany({ where: { presenterId } });

  await prisma.adminAuditLog.create({ data: {
    actorId: adminId, actorRole: "ADMIN",
    action: "DELETE_PRESENTER_LEGACY_CREDENTIALS", entityType: "User", entityId: presenterId,
    metadata: JSON.stringify({ username: presenter.username, deletedCount: count }),
  }}).catch(() => {});

  revalidatePath(`/admin/presenters/${presenterId}/delete`);
  return { ok: true };
}

// ── Cleanup: delete PresenterValidity rows ────────────────────────────────────
export async function deletePresenterValidity(
  _prevState: PresenterActionResult | null,
  formData: FormData
): Promise<PresenterActionResult> {
  const adminId     = await getAdminId();
  const presenterId = (formData.get("presenterId") as string)?.trim() ?? "";
  if (!presenterId) return { ok: false, error: "معرّف المذيع مطلوب" };

  const presenter = await prisma.user.findUnique({ where: { id: presenterId }, select: { username: true } });
  if (!presenter) return { ok: false, error: "المذيع غير موجود" };

  const { count } = await prisma.presenterValidity.deleteMany({ where: { presenterId } });

  await prisma.adminAuditLog.create({ data: {
    actorId: adminId, actorRole: "ADMIN",
    action: "DELETE_PRESENTER_VALIDITY", entityType: "User", entityId: presenterId,
    metadata: JSON.stringify({ username: presenter.username, deletedCount: count }),
  }}).catch(() => {});

  revalidatePath(`/admin/presenters/${presenterId}/delete`);
  return { ok: true };
}

// ── Cleanup: delete DirectDjRadio rows ────────────────────────────────────────
export async function deletePresenterDirectDjRadios(
  _prevState: PresenterActionResult | null,
  formData: FormData
): Promise<PresenterActionResult> {
  const adminId     = await getAdminId();
  const presenterId = (formData.get("presenterId") as string)?.trim() ?? "";
  if (!presenterId) return { ok: false, error: "معرّف المذيع مطلوب" };

  const presenter = await prisma.user.findUnique({ where: { id: presenterId }, select: { username: true } });
  if (!presenter) return { ok: false, error: "المذيع غير موجود" };

  const { count } = await prisma.directDjRadio.deleteMany({ where: { presenterId } });

  await prisma.adminAuditLog.create({ data: {
    actorId: adminId, actorRole: "ADMIN",
    action: "DELETE_PRESENTER_DIRECT_DJ_RADIOS", entityType: "User", entityId: presenterId,
    metadata: JSON.stringify({ username: presenter.username, deletedCount: count }),
  }}).catch(() => {});

  revalidatePath(`/admin/presenters/${presenterId}/delete`);
  return { ok: true };
}


// ── Cleanup: delete LiveSession rows ──────────────────────────────────────────
export async function cleanupPresenterLiveSessions(
  _prevState: PresenterActionResult | null,
  formData: FormData
): Promise<PresenterActionResult> {
  const adminId     = await getAdminId();
  const presenterId = (formData.get("presenterId") as string)?.trim() ?? "";
  if (!presenterId) return { ok: false, error: "معرّف المذيع مطلوب" };

  const presenter = await prisma.user.findUnique({
    where:  { id: presenterId },
    select: { username: true, role: true },
  });
  if (!presenter) return { ok: false, error: "المذيع غير موجود" };

  if (presenter.role === "ADMIN" || presenter.role === "STATION_MANAGER") {
    return { ok: false, error: "لا يمكن تنظيف جلسات مستخدم من نوع ADMIN أو STATION_MANAGER" };
  }

  // Guard: recordings are linked via liveSessionId FK — delete recordings first
  const recordingCount = await prisma.recording.count({ where: { presenterId } });
  if (recordingCount > 0) {
    return {
      ok: false,
      error: "يجب حذف تسجيلات المذيع أولاً قبل تنظيف جلسات البث.",
    };
  }

  const { count } = await prisma.liveSession.deleteMany({ where: { presenterId } });

  await prisma.adminAuditLog.create({ data: {
    actorId: adminId, actorRole: "ADMIN",
    action: "DELETE_PRESENTER_LIVE_SESSIONS", entityType: "User", entityId: presenterId,
    metadata: JSON.stringify({ username: presenter.username, deletedLiveSessionsCount: count }),
  }}).catch(() => {});

  revalidatePath(`/admin/presenters/${presenterId}/delete`);
  return { ok: true };
}
