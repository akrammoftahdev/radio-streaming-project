"use server";

import { auth, prisma } from "@/auth";
import { revalidatePath }  from "next/cache";
import { redirect }        from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────────────
export type StationActionResult = { ok: true } | { ok: false; error: string };

// ── Auth helper ────────────────────────────────────────────────────────────────
async function requireAdmin() {
  const session = await auth();
  if (!session || (session.user as any).role !== "ADMIN") throw new Error("Unauthorized");
  return { session, actorId: (session.user as { id?: string }).id ?? "" };
}

// ── getDependencyCounts ────────────────────────────────────────────────────────
export async function getStationDependencyCounts(stationId: string) {
  const [
    programs,
    presenterStationLinks,
    stationManagers,
    recordings,
    sonicCredentials,
    defaultCredential,
    broadcastSchedules,
  ] = await Promise.all([
    prisma.program.count({ where: { stationId } }),
    prisma.presenterStation.count({ where: { stationId } }),
    prisma.stationManagerAssignment.count({ where: { stationId } }),
    prisma.recording.count({ where: { stationId } }),
    prisma.sonicPanelCredential.count({ where: { stationId } }),
    prisma.stationDefaultCredential.findUnique({
      where:  { stationId },
      select: { id: true, djUsername: true },
    }),
    prisma.broadcastSchedule.count({ where: { stationId } }),
  ]);

  // SINGLE_STATION presenters linked ONLY to this station — losing link leaves them stationless
  const singleStationPresenters = await prisma.user.count({
    where: {
      presenterMode: "SINGLE_STATION",
      presenterStations: {
        some: { stationId, isActive: true },
        // only one active station link total
        every: { stationId },
      },
    },
  });

  // Final delete is safe only when programs = 0 (the sole RESTRICT FK)
  const isHardDeleteSafe = programs === 0;

  return {
    programs,
    presenterStationLinks,
    singleStationPresenters,
    stationManagers,
    recordings,
    sonicCredentials,
    defaultCredential,
    broadcastSchedules,
    isHardDeleteSafe,
  };
}

// ── cleanupStationPrograms ─────────────────────────────────────────────────────
// Deletes all programs on this station.
// Safe because:
//   Recording.programId → onDelete: SetNull (recordings preserved)
//   ProgramScheduleRule/Slot/Exception → onDelete: Cascade (auto-deleted)
export async function cleanupStationPrograms(
  _: StationActionResult | null,
  fd: FormData
): Promise<StationActionResult> {
  const { actorId } = await requireAdmin();
  const stationId = (fd.get("stationId") as string | null)?.trim() ?? "";
  if (!stationId) return { ok: false, error: "معرّف المحطة مطلوب" };

  const station = await prisma.station.findUnique({
    where:  { id: stationId },
    select: { name: true },
  });
  if (!station) return { ok: false, error: "المحطة غير موجودة" };

  const programCount = await prisma.program.count({ where: { stationId } });

  await prisma.adminAuditLog.create({
    data: {
      actorId, actorRole: "ADMIN",
      action: "CLEAN_STATION_PROGRAMS",
      entityType: "Station", entityId: stationId,
      metadata: JSON.stringify({
        stationName: station.name, programCount,
        note: "recordings preserved (programId → null); rules/slots/exceptions cascade",
      }),
    },
  }).catch(() => {});

  try {
    await prisma.program.deleteMany({ where: { stationId } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `فشل حذف البرامج: ${msg.slice(0, 120)}` };
  }

  revalidatePath(`/admin/stations/${stationId}/delete`);
  return { ok: true };
}

// ── unlinkStationPresenters ────────────────────────────────────────────────────
// Deactivates PresenterStation rows for this station.
// Does NOT delete any user accounts.
export async function unlinkStationPresenters(
  _: StationActionResult | null,
  fd: FormData
): Promise<StationActionResult> {
  const { actorId } = await requireAdmin();
  const stationId = (fd.get("stationId") as string | null)?.trim() ?? "";
  if (!stationId) return { ok: false, error: "معرّف المحطة مطلوب" };

  const station = await prisma.station.findUnique({
    where: { id: stationId }, select: { name: true },
  });
  if (!station) return { ok: false, error: "المحطة غير موجودة" };

  const linkCount = await prisma.presenterStation.count({ where: { stationId } });

  await prisma.adminAuditLog.create({
    data: {
      actorId, actorRole: "ADMIN",
      action: "UNLINK_STATION_PRESENTERS",
      entityType: "Station", entityId: stationId,
      metadata: JSON.stringify({
        stationName: station.name, linkCount,
        note: "presenter accounts untouched; only PresenterStation links deactivated",
      }),
    },
  }).catch(() => {});

  try {
    await prisma.presenterStation.updateMany({
      where: { stationId },
      data:  { isActive: false },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `فشل فصل المذيعين: ${msg.slice(0, 120)}` };
  }

  revalidatePath(`/admin/stations/${stationId}/delete`);
  return { ok: true };
}

// ── removeStationManagers ──────────────────────────────────────────────────────
// Removes StationManagerAssignment rows for this station only.
// Does NOT delete station manager user accounts.
export async function removeStationManagers(
  _: StationActionResult | null,
  fd: FormData
): Promise<StationActionResult> {
  const { actorId } = await requireAdmin();
  const stationId = (fd.get("stationId") as string | null)?.trim() ?? "";
  if (!stationId) return { ok: false, error: "معرّف المحطة مطلوب" };

  const station = await prisma.station.findUnique({
    where: { id: stationId }, select: { name: true },
  });
  if (!station) return { ok: false, error: "المحطة غير موجودة" };

  const managerCount = await prisma.stationManagerAssignment.count({ where: { stationId } });

  await prisma.adminAuditLog.create({
    data: {
      actorId, actorRole: "ADMIN",
      action: "REMOVE_STATION_MANAGERS",
      entityType: "Station", entityId: stationId,
      metadata: JSON.stringify({
        stationName: station.name, managerCount,
        note: "manager user accounts untouched; only assignments removed",
      }),
    },
  }).catch(() => {});

  try {
    await prisma.stationManagerAssignment.deleteMany({ where: { stationId } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `فشل عزل المديرين: ${msg.slice(0, 120)}` };
  }

  revalidatePath(`/admin/stations/${stationId}/delete`);
  return { ok: true };
}

// ── deleteStationDefaultCredential ────────────────────────────────────────────
export async function deleteStationDefaultCredential(
  _: StationActionResult | null,
  fd: FormData
): Promise<StationActionResult> {
  const { actorId } = await requireAdmin();
  const stationId = (fd.get("stationId") as string | null)?.trim() ?? "";
  if (!stationId) return { ok: false, error: "معرّف المحطة مطلوب" };

  const station = await prisma.station.findUnique({
    where: { id: stationId }, select: { name: true },
  });
  if (!station) return { ok: false, error: "المحطة غير موجودة" };

  await prisma.adminAuditLog.create({
    data: {
      actorId, actorRole: "ADMIN",
      action: "DELETE_STATION_DEFAULT_CREDENTIAL",
      entityType: "Station", entityId: stationId,
      metadata: JSON.stringify({ stationName: station.name }),
    },
  }).catch(() => {});

  try {
    await prisma.stationDefaultCredential.deleteMany({ where: { stationId } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `فشل حذف بيانات DJ: ${msg.slice(0, 120)}` };
  }

  revalidatePath(`/admin/stations/${stationId}/delete`);
  return { ok: true };
}

// ── hardDeleteStation ──────────────────────────────────────────────────────────
// Safe only when programs = 0.
// Everything else either cascades (PresenterStation, StationManager, DefaultCredential)
// or is SetNull'd (Recording.stationId, SonicPanelCredential.stationId).
export async function hardDeleteStation(
  _: StationActionResult | null,
  fd: FormData
): Promise<StationActionResult> {
  const { actorId } = await requireAdmin();
  const stationId = (fd.get("stationId") as string | null)?.trim() ?? "";
  if (!stationId) return { ok: false, error: "معرّف المحطة مطلوب" };

  const deps = await getStationDependencyCounts(stationId);
  if (!deps.isHardDeleteSafe) {
    return {
      ok: false,
      error: `لا يمكن حذف المحطة — يوجد ${deps.programs} برنامج مرتبط. احذف البرامج أولاً.`,
    };
  }

  const station = await prisma.station.findUnique({
    where:  { id: stationId },
    select: { name: true, slug: true },
  });
  if (!station) return { ok: false, error: "المحطة غير موجودة" };

  await prisma.adminAuditLog.create({
    data: {
      actorId, actorRole: "ADMIN",
      action: "DELETE_STATION",
      entityType: "Station", entityId: stationId,
      metadata: JSON.stringify({
        stationName: station.name, slug: station.slug,
        recordingsSetNull: deps.recordings,
        note: "PresenterStation/StationManager/DefaultCredential cascade; Recordings/SonicCreds stationId→null",
      }),
    },
  }).catch(() => {});

  // Snapshot preservation — populate stationNameSnapshot before station.delete.
  // Recording.stationId → onDelete:SetNull, so after station.delete stationId becomes null.
  // Snapshot fields ensure archive pages can still show the station name.
  try {
    await prisma.recording.updateMany({
      where: { stationId, stationNameSnapshot: null },
      data:  { stationNameSnapshot: station.name, stationDeleted: true },
    });
    // Also mark any with existing snapshot that aren't yet marked
    await prisma.recording.updateMany({
      where: { stationId, stationNameSnapshot: { not: null }, stationDeleted: false },
      data:  { stationDeleted: true },
    });
  } catch { /* non-fatal */ }

  try {
    await prisma.station.delete({ where: { id: stationId } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isFk = /foreign key|constraint/i.test(msg);
    return {
      ok: false,
      error: isFk
        ? "فشل الحذف — لا يزال هناك ارتباط بجداول أخرى. راجع قائمة التبعيات وأعد المحاولة."
        : `فشل الحذف: ${msg.slice(0, 150)}`,
    };
  }

  revalidatePath("/admin/stations");
  redirect("/admin/stations");
}
