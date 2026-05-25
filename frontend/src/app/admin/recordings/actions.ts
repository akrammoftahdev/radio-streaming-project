"use server";

import { auth, prisma } from "@/auth";
import { revalidatePath } from "next/cache";
import path from "path";
import fs from "fs/promises";

export type DeleteRecordingResult = { ok: true } | { ok: false; error: string } | null;

export async function deleteRecording(
  _prevState: DeleteRecordingResult,
  formData: FormData
): Promise<DeleteRecordingResult> {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return { ok: false, error: "غير مصرح" };
  }
  const adminId = (session.user as { id?: string }).id ?? "";

  const recordingId = (formData.get("recordingId") as string)?.trim() ?? "";
  if (!recordingId) return { ok: false, error: "recordingId مطلوب" };

  // ── Find recording ──────────────────────────────────────────────────────────
  const recording = await prisma.recording.findUnique({
    where:  { id: recordingId },
    select: { id: true, localPath: true, presenterId: true, liveSessionId: true },
  });
  if (!recording) return { ok: false, error: "لم يُعثر على التسجيل" };

  // ── Resolve disk path (same logic as /api/recordings/[filename]) ────────────
  const recordingsBaseDir =
    process.env.RECORDINGS_BASE_DIR ??
    path.resolve(process.cwd(), "..", "backend-audio", "debug-recordings");

  const basename     = path.basename(recording.localPath);
  const absolutePath = path.resolve(path.join(recordingsBaseDir, basename));
  const resolvedBase = path.resolve(recordingsBaseDir);

  if (
    !absolutePath.startsWith(resolvedBase + path.sep) &&
    absolutePath !== resolvedBase
  ) {
    return { ok: false, error: "Path traversal detected — حذف مرفوض" };
  }

  const deletedFiles: string[] = [];
  const missingFiles: string[] = [];

  // ── Delete primary file ─────────────────────────────────────────────────────
  try {
    await fs.unlink(absolutePath);
    deletedFiles.push(basename);
  } catch (e: any) {
    if (e?.code === "ENOENT") missingFiles.push(basename);
    else console.warn("[deleteRecording] unlink primary:", e?.message);
  }

  // ── Delete companion file (mp3 ↔ webm) ─────────────────────────────────────
  const ext          = path.extname(basename).toLowerCase();
  const companionExt = ext === ".mp3" ? ".webm" : ext === ".webm" ? ".mp3" : null;
  if (companionExt) {
    const companionBase = basename.slice(0, -ext.length) + companionExt;
    const companionPath = path.resolve(path.join(recordingsBaseDir, companionBase));
    try {
      await fs.unlink(companionPath);
      deletedFiles.push(companionBase);
    } catch (e: any) {
      if (e?.code === "ENOENT") missingFiles.push(companionBase);
    }
  }

  // ── Delete DB row (LiveSession preserved) ───────────────────────────────────
  try {
    await prisma.recording.delete({ where: { id: recordingId } });
  } catch (e: any) {
    return { ok: false, error: "فشل حذف السجل: " + (e?.message ?? "") };
  }

  // ── Audit log ───────────────────────────────────────────────────────────────
  await prisma.adminAuditLog.create({
    data: {
      actorId:    adminId,
      actorRole:  "ADMIN",
      action:     "DELETE_RECORDING",
      entityType: "Recording",
      entityId:   recordingId,
      metadata:   JSON.stringify({
        localPath:     recording.localPath,
        presenterId:   recording.presenterId,
        liveSessionId: recording.liveSessionId,
        deletedFiles,
        missingFiles,
      }),
    },
  }).catch(() => {});

  revalidatePath("/admin/recordings");
  return { ok: true };
}
