"use server";

import { auth }           from "@/auth";
import { redirect }       from "next/navigation";
import { revalidatePath } from "next/cache";
import { db }             from "@/lib/prisma";
import { writeFile }      from "fs/promises";
import { join }           from "path";
import crypto             from "crypto";

export async function saveSystemSettings(formData: FormData) {
  // ── Auth guard ──────────────────────────────────────────────────────────────
  const session = await auth();
  if (!session?.user) redirect("/login");
  if ((session.user as any).role !== "ADMIN") redirect("/login");

  const userId = (session.user as any).id as string | undefined;

  // ── Extract + sanitise text fields ─────────────────────────────────────────
  // Trim whitespace; convert empty strings to null (cleaner DB storage).
  const sanitise = (key: string): string | null => {
    const val = (formData.get(key) as string | null)?.trim() ?? "";
    return val === "" ? null : val;
  };

  // systemName is required — fall back to "EGONAIR" if somehow blank.
  const systemName = sanitise("systemName") ?? "EGONAIR";

  const data = {
    systemName,
    systemSubtitle:    sanitise("systemSubtitle"),
    supportPhone:      sanitise("supportPhone"),
    supportWhatsapp:   sanitise("supportWhatsapp"),
    supportEmail:      sanitise("supportEmail"),
    // Logo / asset URL fields (no upload — URL strings only)
    logoUrl:           sanitise("logoUrl"),
    logoDarkUrl:       sanitise("logoDarkUrl"),
    logoLightUrl:      sanitise("logoLightUrl"),
    loginLogoDarkUrl:  sanitise("loginLogoDarkUrl"),
    loginLogoLightUrl: sanitise("loginLogoLightUrl"),
    mobileAppIconUrl:  sanitise("mobileAppIconUrl"),
    splashScreenUrl:   sanitise("splashScreenUrl"),
    faviconUrl:        sanitise("faviconUrl"),
    defaultLanguage:   sanitise("defaultLanguage") ?? "ar",
    // Meta
    updatedBy: userId ?? null,
  };

  // ── Upsert singleton row ────────────────────────────────────────────────────
  // update only the allowed fields — theme/color fields are NOT touched here.
  await db.systemSettings.upsert({
    where:  { id: "global" },
    update: data,
    create: { id: "global", ...data },
  });

  revalidatePath("/admin/settings");
  redirect("/admin/settings?updated=1");
}

// ── saveThemeSettings ─────────────────────────────────────────────────────────
// Saves ONLY the theme/color fields. Never touches branding or logo fields.
export async function saveThemeSettings(formData: FormData) {
  // Auth guard
  const session = await auth();
  if (!session?.user) redirect("/login");
  if ((session.user as any).role !== "ADMIN") redirect("/login");

  const userId = (session.user as any).id as string | undefined;

  // hex sanitiser: valid #rrggbb or null
  const hex = (key: string): string | null => {
    const val = (formData.get(key) as string | null)?.trim() ?? "";
    return /^#[0-9a-fA-F]{6}$/.test(val) ? val : null;
  };

  const themeData = {
    defaultTheme:    (formData.get("defaultTheme") as string) === "light" ? "light" : "dark",
    darkPrimary:     hex("darkPrimary"),
    darkAccent:      hex("darkAccent"),
    darkBackground:  hex("darkBackground"),
    darkSurface:     hex("darkSurface"),
    darkText:        hex("darkText"),
    lightPrimary:    hex("lightPrimary"),
    lightAccent:     hex("lightAccent"),
    lightBackground: hex("lightBackground"),
    lightSurface:    hex("lightSurface"),
    lightText:       hex("lightText"),
    updatedBy: userId ?? null,
  };

  await db.systemSettings.upsert({
    where:  { id: "global" },
    update: themeData,
    create: { id: "global", ...themeData },
  });

  revalidatePath("/admin/settings");
  redirect("/admin/settings?themeUpdated=1");
}

// ── uploadSystemAsset ─────────────────────────────────────────────────────────
// Safely uploads a branding asset (logo, icon, splash) to Firebase Storage.
export async function uploadSystemAsset(assetType: string, formData: FormData) {
  // Auth guard
  const session = await auth();
  if (!session?.user) redirect("/login");
  if ((session.user as any).role !== "ADMIN") redirect("/login");

  const userId = (session.user as any).id as string | undefined;

  const file = formData.get(`file_${assetType}`) as File | null;

  if (!file || !assetType) {
    throw new Error("Missing file or assetType");
  }

  // Validate assetType
  const allowedAssets = [
    "logoDarkUrl",
    "logoLightUrl",
    "loginLogoDarkUrl",
    "loginLogoLightUrl",
    "faviconUrl",
    "mobileAppIconUrl",
    "splashScreenUrl",
  ] as const;

  if (!allowedAssets.includes(assetType as any)) {
    throw new Error("Invalid assetType");
  }

  // Validate file type
  const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/x-icon"];
  if (!allowedTypes.includes(file.type)) {
    throw new Error("Invalid file type. Allowed: png, jpeg, webp, svg, ico.");
  }

  // File size limit (e.g., 5MB)
  const MAX_SIZE = 5 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    throw new Error("File too large. Maximum size is 5MB.");
  }

  // Generate safe filename
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const uniqueId = crypto.randomBytes(8).toString("hex");
  const filename = `${assetType}_${uniqueId}.${ext}`;

  // Upload to Firebase Storage
  const { bucket } = await import("@/lib/firebase-admin");
  const fileRef = bucket.file(`system/${filename}`);
  
  await fileRef.save(buffer, {
    metadata: {
      contentType: file.type,
    },
    public: true, // Make the file publicly accessible via storage.googleapis.com
  });

  const publicUrl = `https://storage.googleapis.com/${bucket.name}/system/${filename}`;

  // Update DB field dynamically
  const updateData = {
    [assetType]: publicUrl,
    updatedBy: userId ?? null,
  };

  await db.systemSettings.upsert({
    where:  { id: "global" },
    update: updateData,
    create: { id: "global", ...updateData, systemName: "EGONAIR" }, // Needs defaults if first
  });

  revalidatePath("/admin/settings");
  redirect("/admin/settings?assetUpdated=1");
}

