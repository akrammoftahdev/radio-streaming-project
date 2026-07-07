import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";

/**
 * POST /api/admin/avatar/upload
 * ─────────────────────────────────────────────────────────────────────────────
 * Admin-only: upload a profile photo for ANY user (by targetUserId).
 *
 * Accepted fields (multipart/form-data):
 *   image        — image binary (required)
 *   targetUserId — the User.id to update (required)
 *
 * Allowed MIME types: image/jpeg, image/png, image/webp
 * Max size: 5 MB
 *
 * Storage: public/uploads/avatars/{targetUserId}-{uuid}.ext
 * Public URL: /uploads/avatars/{filename}
 *
 * Response (200):
 *   { ok: true, avatarUrl: "/uploads/avatars/..." }
 */

const ALLOWED_MIMES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png":  ".png",
  "image/webp": ".webp",
};

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {

  // ── 1. Auth — ADMIN only ──────────────────────────────────────────────────
  const session = await auth();
  const actorId  = (session?.user as { id?: string; role?: string } | undefined)?.id ?? "";
  const actorRole = (session?.user as { id?: string; role?: string } | undefined)?.role ?? "";

  if (!session?.user || !actorId || actorRole !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 2. Parse multipart/form-data ──────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file         = formData.get("image") as File | null;
  const targetUserId = (formData.get("targetUserId") as string | null)?.trim() ?? "";

  // ── 3. Validate targetUserId ──────────────────────────────────────────────
  if (!targetUserId) {
    return NextResponse.json({ error: "targetUserId is required" }, { status: 400 });
  }

  // ── 4. Validate file ──────────────────────────────────────────────────────
  if (!file || file.size === 0) {
    return NextResponse.json({ error: "No image selected" }, { status: 400 });
  }

  const mime = file.type || "application/octet-stream";
  const ext  = ALLOWED_MIMES[mime];

  if (!ext) {
    return NextResponse.json(
      { error: `Unsupported file type: ${mime}. Allowed: JPEG, PNG, WebP` },
      { status: 400 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max: 5 MB` },
      { status: 400 }
    );
  }

  // ── 5. Build safe file path ───────────────────────────────────────────────
  const safeId    = targetUserId.replace(/[^a-zA-Z0-9\-_]/g, "_").slice(0, 36);
  const fileName  = `admin-${safeId}-${randomUUID()}${ext}`;
  const publicBase = path.resolve(process.cwd(), "public");
  const uploadDir  = path.join(publicBase, "uploads", "avatars");
  const filePath   = path.join(uploadDir, fileName);
  const fileUrl    = `/uploads/avatars/${fileName}`;

  // Traversal guard
  if (!filePath.startsWith(uploadDir + path.sep) && filePath !== uploadDir) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }

  // ── 6. Ensure directory exists ────────────────────────────────────────────
  try {
    fs.mkdirSync(uploadDir, { recursive: true });
  } catch (e) {
    console.error("[admin/avatar/upload] mkdirSync error:", e);
    return NextResponse.json({ error: "Failed to create upload directory" }, { status: 500 });
  }

  // ── 7. Write file to disk ─────────────────────────────────────────────────
  try {
    const buf = await file.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(buf));
    console.log(`[admin/avatar/upload] Saved: ${filePath} (${file.size} bytes) for user ${targetUserId}`);
  } catch (e) {
    console.error("[admin/avatar/upload] Write error:", e);
    return NextResponse.json({ error: "Failed to save image on server" }, { status: 500 });
  }


  // ── 8. Success — return the URL to the client ─────────────────────────────
  // NOTE: DB update (PresenterProfile.avatarUrl) is NOT done here.
  // For CREATE: createAdmin server action creates the profile row with this URL.
  // For EDIT:   updateAdmin server action upserts the profile row with this URL.
  // This avoids FK constraint violations when targetUserId is "new" or the
  // user's PresenterProfile row does not exist yet.
  return NextResponse.json({ ok: true, avatarUrl: fileUrl }, { status: 200 });
}
