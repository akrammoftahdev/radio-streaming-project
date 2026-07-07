"use server";

import { auth, prisma } from "@/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { encrypt } from "@/lib/encryption";
import { getTranslations } from "next-intl/server";

// ── Helper ────────────────────────────────────────────────────────────────────
// Converts any string to a URL-safe lowercase slug.
// Only keeps letters (including Arabic-safe passthrough), digits, and hyphens.
function toSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")       // spaces → hyphens
    .replace(/[^a-z0-9-]/g, "") // strip everything except ascii alnum + hyphen
    .replace(/-{2,}/g, "-")     // collapse consecutive hyphens
    .replace(/^-|-$/g, "");     // trim leading/trailing hyphens
}

// ── createStation ─────────────────────────────────────────────────────────────
export async function createStation(formData: FormData) {
  const t = await getTranslations("admin.stations");
  const session = await auth();
  if (!session || (session.user as any).role !== "ADMIN") {
    throw new Error("Unauthorized");
  }

  // ── Basic station fields ──────────────────────────────────────────────────
  const name        = (formData.get("name")        as string | null)?.trim() ?? "";
  const rawSlug     = (formData.get("slug")        as string | null)?.trim() ?? "";
  const description = (formData.get("description") as string | null)?.trim() || null;
  const streamHost  = (formData.get("streamHost")  as string | null)?.trim() || null;
  const streamPortRaw = formData.get("streamPort") as string | null;
  const publicUrl   = (formData.get("publicUrl")   as string | null)?.trim() || null;

  // ── Optional DJ fields ────────────────────────────────────────────────────
  const sdcHost       = (formData.get("sdcHost")       as string | null)?.trim() || "";
  const sdcPortRaw    = (formData.get("sdcPort")       as string | null)?.trim() || "";
  const sdcDjUsername = (formData.get("sdcDjUsername") as string | null)?.trim() || "";
  const sdcDjPassword = (formData.get("sdcDjPassword") as string | null)?.trim() || "";
  const sdcMount      = (formData.get("sdcMount")      as string | null)?.trim() || null;
  const sdcBitrateRaw = (formData.get("sdcBitrate")    as string | null)?.trim() || "128";

  // ── Detect partial DJ data ────────────────────────────────────────────────
  // Required DJ fields: host, port, djUsername, djPassword
  const djFieldsProvided = [sdcHost, sdcPortRaw, sdcDjUsername, sdcDjPassword].filter(Boolean);
  const djAllRequired    = sdcHost && sdcPortRaw && sdcDjUsername && sdcDjPassword;

  if (djFieldsProvided.length > 0 && !djAllRequired) {
    throw new Error(t("errIncompleteDj"));
  }

  // ── Validate station fields ───────────────────────────────────────────────
  if (!name) throw new Error(t("errNameRequired"));

  const slug = toSlug(rawSlug || name);
  if (!slug) throw new Error(t("errSlugInvalid"));

  let streamPort: number | null = null;
  if (streamPortRaw && streamPortRaw.trim() !== "") {
    streamPort = parseInt(streamPortRaw, 10);
    if (isNaN(streamPort) || streamPort < 1 || streamPort > 65535) {
      throw new Error(t("errPortInvalid"));
    }
  }

  // ── Unique slug check ─────────────────────────────────────────────────────
  const existing = await prisma.station.findUnique({ where: { slug } });
  if (existing) throw new Error(t("errSlugExists", { slug }));

  // ── Validate DJ fields if provided ───────────────────────────────────────
  let sdcPort = 0;
  let sdcBitrate = 128;
  if (djAllRequired) {
    sdcPort = parseInt(sdcPortRaw, 10);
    if (isNaN(sdcPort) || sdcPort < 1 || sdcPort > 65535) {
      throw new Error(t("errDjPortInvalid"));
    }
    sdcBitrate = parseInt(sdcBitrateRaw, 10);
    if (isNaN(sdcBitrate) || sdcBitrate < 8 || sdcBitrate > 320) {
      throw new Error(t("errDjBitrateInvalid"));
    }
  }

  // ── Create station ────────────────────────────────────────────────────────
  const station = await prisma.station.create({
    data: { name, slug, description, streamHost, streamPort, publicUrl, isActive: true },
  });

  // ── Optionally create StationDefaultCredential ────────────────────────────
  let djCreated = false;
  if (djAllRequired) {
    await prisma.stationDefaultCredential.create({
      data: {
        stationId:         station.id,
        host:              sdcHost,
        port:              sdcPort,
        djUsername:        sdcDjUsername,
        encryptedPassword: encrypt(sdcDjPassword),
        mount:             sdcMount,
        bitrate:           sdcBitrate,
        isActive:          true,
      },
    });
    djCreated = true;
  }

  revalidatePath("/admin/stations");

  const { redirect } = await import("next/navigation");
  redirect(`/admin/stations?created=${djCreated ? "dj" : "1"}`);
}


// ── toggleStationActive ───────────────────────────────────────────────────────
export async function toggleStationActive(formData: FormData) {
  const t = await getTranslations("admin.stations");
  const session = await auth();
  if (!session || (session.user as any).role !== "ADMIN") {
    throw new Error("Unauthorized");
  }

  const stationId = formData.get("stationId") as string | null;
  const currentValue = formData.get("currentIsActive") as string | null;

  if (!stationId) throw new Error("Missing stationId.");

  const newIsActive = currentValue !== "true";

  const station = await prisma.station.findUnique({
    where: { id: stationId }, select: { name: true },
  });

  const [presenterCount, programCount, managerCount, recordingCount] = await Promise.all([
    prisma.presenterStation.count({ where: { stationId } }),
    prisma.program.count({ where: { stationId } }),
    prisma.stationManagerAssignment.count({ where: { stationId } }),
    prisma.recording.count({ where: { stationId } }),
  ]);

  await prisma.station.update({
    where: { id: stationId },
    data:  { isActive: newIsActive },
  });

  const actorId = (session.user as { id?: string }).id ?? "";
  await prisma.adminAuditLog.create({
    data: {
      actorId, actorRole: "ADMIN",
      action:     newIsActive ? "ENABLE_STATION" : "DISABLE_STATION",
      entityType: "Station",
      entityId:   stationId,
      metadata:   JSON.stringify({
        stationName: station?.name,
        newIsActive,
        presenterCount,
        programCount,
        managerCount,
        recordingCount,
        note: "soft disable only - no data deleted",
      }),
    },
  }).catch(() => {});

  revalidatePath("/admin/stations");
}


// ── updateStation ─────────────────────────────────────────────────────────────
export async function updateStation(formData: FormData) {
  const t = await getTranslations("admin.stations");
  const session = await auth();
  if (!session || (session.user as any).role !== "ADMIN") {
    throw new Error("Unauthorized");
  }

  const stationId   = (formData.get("stationId")   as string | null)?.trim() ?? "";
  const name        = (formData.get("name")        as string | null)?.trim() ?? "";
  const rawSlug     = (formData.get("slug")        as string | null)?.trim() ?? "";
  const description = (formData.get("description") as string | null)?.trim() || null;
  const streamHost  = (formData.get("streamHost")  as string | null)?.trim() || null;
  const streamPortRaw = formData.get("streamPort") as string | null;
  const publicUrl   = (formData.get("publicUrl")   as string | null)?.trim() || null;

  // ── Validate station exists ───────────────────────────────────────────────
  if (!stationId) throw new Error("Missing stationId.");
  const station = await prisma.station.findUnique({ where: { id: stationId } });
  if (!station) throw new Error(t("errStationNotFound"));

  // ── Validate fields ───────────────────────────────────────────────────────
  if (!name) throw new Error(t("errNameRequired"));

  const slug = toSlug(rawSlug || name);
  if (!slug) throw new Error(t("errSlugInvalid"));

  let streamPort: number | null = null;
  if (streamPortRaw && streamPortRaw.trim() !== "") {
    streamPort = parseInt(streamPortRaw, 10);
    if (isNaN(streamPort) || streamPort < 1 || streamPort > 65535) {
      throw new Error(t("errPortInvalid"));
    }
  }

  // ── Duplicate slug check (excluding current station) ─────────────────────
  const slugConflict = await prisma.station.findUnique({ where: { slug } });
  if (slugConflict && slugConflict.id !== stationId) {
    throw new Error(t("errSlugExists", { slug }));
  }

  // ── Update ────────────────────────────────────────────────────────────────
  await prisma.station.update({
    where: { id: stationId },
    data:  { name, slug, description, streamHost, streamPort, publicUrl },
  });

  revalidatePath("/admin/stations");
  redirect(`/admin/stations?edit=${stationId}&updated=1`);
}

// ── updateStationDefaultCredential ───────────────────────────────────────────
// Upserts the station-level fallback DJ/SonicPanel credential.
// Used as priority-3 fallback when a presenter has no per-station credential.
// Password field: if blank on update, the existing encryptedPassword is kept.
export async function updateStationDefaultCredential(formData: FormData) {
  const t = await getTranslations("admin.stations");
  const session = await auth();
  if (!session || (session.user as any).role !== "ADMIN") {
    throw new Error("Unauthorized");
  }

  const stationId   = (formData.get("sdcStationId")  as string | null)?.trim() ?? "";
  const host        = (formData.get("sdcHost")        as string | null)?.trim() ?? "";
  const portRaw     = (formData.get("sdcPort")        as string | null)?.trim() ?? "";
  const djUsername  = (formData.get("sdcDjUsername")  as string | null)?.trim() ?? "";
  const djPassword  = (formData.get("sdcDjPassword")  as string | null)?.trim() ?? "";
  const mount       = (formData.get("sdcMount")       as string | null)?.trim() || null;
  const sid         = (formData.get("sdcSid")         as string | null)?.trim() || null;
  const bitrateRaw  = (formData.get("sdcBitrate")     as string | null)?.trim() ?? "128";
  const isActive    = formData.get("sdcIsActive") === "on";

  // ── Validate station ──────────────────────────────────────────────────────
  if (!stationId) throw new Error("Missing stationId.");
  const station = await prisma.station.findUnique({ where: { id: stationId } });
  if (!station)  throw new Error(t("errStationNotFound"));

  // ── Validate required DJ fields ───────────────────────────────────────────
  if (!host)       throw new Error(t("errHostRequired"));
  if (!djUsername) throw new Error(t("errDjUsernameRequired"));

  const port = parseInt(portRaw, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(t("errPortInvalid2"));
  }

  const bitrate = parseInt(bitrateRaw, 10);
  if (isNaN(bitrate) || bitrate < 8 || bitrate > 320) {
    throw new Error(t("errBitrateInvalid"));
  }

  // ── Resolve encryptedPassword ──────────────────────────────────────────────
  // If the admin left the password field blank, preserve the existing value.
  let encryptedPassword: string;
  const existing = await prisma.stationDefaultCredential.findUnique({
    where: { stationId },
  });

  if (djPassword) {
    encryptedPassword = encrypt(djPassword);
  } else if (existing) {
    // Blank on update → keep old encrypted value
    encryptedPassword = existing.encryptedPassword;
  } else {
    // New record with no password — reject
    throw new Error(t("errDjPasswordRequired"));
  }

  // ── Upsert ────────────────────────────────────────────────────────────────
  await prisma.stationDefaultCredential.upsert({
    where:  { stationId },
    create: { stationId, host, port, djUsername, encryptedPassword, mount, sid, bitrate, isActive },
    update: { host, port, djUsername, encryptedPassword, mount, sid, bitrate, isActive },
  });

  revalidatePath("/admin/stations");

  const { redirect } = await import("next/navigation");
  redirect(`/admin/stations?edit=${stationId}&updated=1&dj=1`);
}

export async function updateStationMessaging(formData: FormData) {
  const session = await auth();
  if (!session || (session.user as any).role !== "ADMIN") {
    throw new Error("Unauthorized");
  }

  const stationId              = (formData.get("stationId") as string | null)?.trim() ?? "";
  const isMessagingEnabled     = formData.get("isMessagingEnabled") === "on";
  const iframeTextColor        = (formData.get("iframeTextColor") as string | null)?.trim() || null;
  const iframeBgColor          = (formData.get("iframeBgColor") as string | null)?.trim() || null;
  const iframeBorderColor      = (formData.get("iframeBorderColor") as string | null)?.trim() || null;
  const iframePlaceholderColor = (formData.get("iframePlaceholderColor") as string | null)?.trim() || null;
  const iframeLanguage         = (formData.get("iframeLanguage") as string | null)?.trim() || "ar";

  if (!stationId) throw new Error("Station ID required");

  await prisma.station.update({
    where: { id: stationId },
    data:  {
      isMessagingEnabled,
      iframeTextColor,
      iframeBgColor,
      iframeBorderColor,
      iframePlaceholderColor,
      iframeLanguage
    },
  });

  redirect(`/admin/stations?edit=${stationId}&updated=msg`);
}
