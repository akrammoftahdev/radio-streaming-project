import { NextRequest, NextResponse } from "next/server";
import { auth, prisma } from "@/auth";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";

/**
 * POST /api/profile/avatar/upload
 * ─────────────────────────────────────────────────────────────────────────────
 * Universal avatar upload for all logged-in roles:
 *   ADMIN | STATION_MANAGER | PRESENTER (all presenterModes)
 *
 * Accepted fields (multipart/form-data):
 *   image — image binary (required)
 *
 * Allowed MIME types: image/jpeg, image/png, image/webp
 * Max size: 5 MB
 *
 * Storage: public/uploads/avatars/{userId}-{uuid}.ext
 * Public URL: /uploads/avatars/{filename}
 *
 * Saves URL to PresenterProfile.avatarUrl (upsert by userId) for all roles.
 *
 * Response (200):
 *   { ok: true, avatarUrl: "/uploads/avatars/..." }
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const ALLOWED_MIMES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png":  ".png",
  "image/webp": ".webp",
};

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {

  // ── 1. Auth — any logged-in role ──────────────────────────────────────────
  const session = await auth();
  const userId  = (session?.user as { id?: string } | undefined)?.id ?? "";

  if (!session?.user || !userId) {
    return NextResponse.json({ error: "غير مُصادَق عليه." }, { status: 401 });
  }

  // ── 2. Parse multipart/form-data ──────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "بيانات النموذج غير صالحة." }, { status: 400 });
  }

  const file = formData.get("image") as File | null;

  // ── 3. Validate file ──────────────────────────────────────────────────────
  if (!file || file.size === 0) {
    return NextResponse.json({ error: "لم يتم اختيار صورة." }, { status: 400 });
  }

  const mime = file.type || "application/octet-stream";
  const ext  = ALLOWED_MIMES[mime];

  if (!ext) {
    return NextResponse.json(
      { error: `نوع الملف غير مدعوم: ${mime}. المسموح: JPEG، PNG، WebP فقط.` },
      { status: 400 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `حجم الصورة (${(file.size / 1024 / 1024).toFixed(1)} MB) يتجاوز الحد المسموح (5 MB).` },
      { status: 400 }
    );
  }

  // ── 4. Build safe file path ───────────────────────────────────────────────
  // Filename: {userId}-{uuid}.ext — no traversal risk, unique per upload.
  const safeUserId = userId.replace(/[^a-zA-Z0-9\-_]/g, "_").slice(0, 36);
  const fileName   = `${safeUserId}-${randomUUID()}${ext}`;
  const publicBase = path.resolve(process.cwd(), "public");
  const uploadDir  = path.join(publicBase, "uploads", "avatars");
  const filePath   = path.join(uploadDir, fileName);
  const fileUrl    = `/uploads/avatars/${fileName}`;

  // Traversal guard
  if (!filePath.startsWith(uploadDir + path.sep) && filePath !== uploadDir) {
    return NextResponse.json({ error: "مسار الملف غير صالح." }, { status: 400 });
  }

  // ── 5. Ensure directory exists ────────────────────────────────────────────
  try {
    fs.mkdirSync(uploadDir, { recursive: true });
  } catch (e) {
    console.error("[avatar/upload] mkdirSync error:", e);
    return NextResponse.json({ error: "خطأ في إنشاء مجلد الرفع." }, { status: 500 });
  }

  // ── 6. Write file to disk ─────────────────────────────────────────────────
  try {
    const buf = await file.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(buf));
    console.log(`[avatar/upload] Saved: ${filePath} (${file.size} bytes) for user ${userId}`);
  } catch (e) {
    console.error("[avatar/upload] Write error:", e);
    return NextResponse.json({ error: "فشل حفظ الصورة على الخادم." }, { status: 500 });
  }

  // ── 7. Upsert PresenterProfile.avatarUrl ─────────────────────────────────
  // Works for all roles — PresenterProfile is a generic profile sub-record
  // linked by userId. No schema change required.
  try {
    await prisma.presenterProfile.upsert({
      where:  { userId },
      create: { userId, avatarUrl: fileUrl },
      update: { avatarUrl: fileUrl },
    });
    console.log(`[avatar/upload] PresenterProfile.avatarUrl updated for user ${userId} → ${fileUrl}`);
  } catch (e) {
    // DB write failed — rollback the file to avoid orphans
    console.error("[avatar/upload] DB upsert error:", e);
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
    return NextResponse.json({ error: "فشل حفظ رابط الصورة في قاعدة البيانات." }, { status: 500 });
  }

  // ── 8. Success ────────────────────────────────────────────────────────────
  return NextResponse.json({ ok: true, avatarUrl: fileUrl }, { status: 200 });
}
