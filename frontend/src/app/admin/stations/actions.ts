"use server";

import { auth, prisma } from "@/auth";
import { revalidatePath } from "next/cache";
import { encrypt } from "@/lib/encryption";

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
    throw new Error("إما اترك بيانات DJ فارغة أو أكملها بالكامل (Host + Port + DJ Username + DJ Password).");
  }

  // ── Validate station fields ───────────────────────────────────────────────
  if (!name) throw new Error("اسم المحطة مطلوب.");

  const slug = toSlug(rawSlug || name);
  if (!slug) throw new Error("Slug غير صالح. استخدم أحرفاً إنجليزية وأرقاماً وشرطات فقط.");

  let streamPort: number | null = null;
  if (streamPortRaw && streamPortRaw.trim() !== "") {
    streamPort = parseInt(streamPortRaw, 10);
    if (isNaN(streamPort) || streamPort < 1 || streamPort > 65535) {
      throw new Error("رقم المنفذ (Port) يجب أن يكون بين 1 و 65535.");
    }
  }

  // ── Unique slug check ─────────────────────────────────────────────────────
  const existing = await prisma.station.findUnique({ where: { slug } });
  if (existing) throw new Error(`المحطة بالـ slug "${slug}" موجودة بالفعل.`);

  // ── Validate DJ fields if provided ───────────────────────────────────────
  let sdcPort = 0;
  let sdcBitrate = 128;
  if (djAllRequired) {
    sdcPort = parseInt(sdcPortRaw, 10);
    if (isNaN(sdcPort) || sdcPort < 1 || sdcPort > 65535) {
      throw new Error("DJ Port يجب أن يكون بين 1 و 65535.");
    }
    sdcBitrate = parseInt(sdcBitrateRaw, 10);
    if (isNaN(sdcBitrate) || sdcBitrate < 8 || sdcBitrate > 320) {
      throw new Error("DJ Bitrate يجب أن يكون بين 8 و 320 kbps.");
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
  if (!station) throw new Error("المحطة غير موجودة.");

  // ── Validate fields ───────────────────────────────────────────────────────
  if (!name) throw new Error("اسم المحطة مطلوب.");

  const slug = toSlug(rawSlug || name);
  if (!slug) throw new Error("Slug غير صالح. استخدم أحرفاً إنجليزية وأرقاماً وشرطات فقط.");

  let streamPort: number | null = null;
  if (streamPortRaw && streamPortRaw.trim() !== "") {
    streamPort = parseInt(streamPortRaw, 10);
    if (isNaN(streamPort) || streamPort < 1 || streamPort > 65535) {
      throw new Error("رقم المنفذ (Port) يجب أن يكون بين 1 و 65535.");
    }
  }

  // ── Duplicate slug check (excluding current station) ─────────────────────
  const slugConflict = await prisma.station.findUnique({ where: { slug } });
  if (slugConflict && slugConflict.id !== stationId) {
    throw new Error(`المحطة بالـ slug "${slug}" موجودة بالفعل.`);
  }

  // ── Update ────────────────────────────────────────────────────────────────
  await prisma.station.update({
    where: { id: stationId },
    data:  { name, slug, description, streamHost, streamPort, publicUrl },
  });

  revalidatePath("/admin/stations");
}

// ── updateStationDefaultCredential ───────────────────────────────────────────
// Upserts the station-level fallback DJ/SonicPanel credential.
// Used as priority-3 fallback when a presenter has no per-station credential.
// Password field: if blank on update, the existing encryptedPassword is kept.
export async function updateStationDefaultCredential(formData: FormData) {
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
  if (!station)  throw new Error("المحطة غير موجودة.");

  // ── Validate required DJ fields ───────────────────────────────────────────
  if (!host)       throw new Error("Host مطلوب.");
  if (!djUsername) throw new Error("DJ Username مطلوب.");

  const port = parseInt(portRaw, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error("Port يجب أن يكون بين 1 و 65535.");
  }

  const bitrate = parseInt(bitrateRaw, 10);
  if (isNaN(bitrate) || bitrate < 8 || bitrate > 320) {
    throw new Error("Bitrate يجب أن يكون بين 8 و 320 kbps.");
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
    throw new Error("DJ Password مطلوب عند إنشاء بيانات DJ لأول مرة.");
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
