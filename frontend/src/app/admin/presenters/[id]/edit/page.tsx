import { auth, prisma } from "@/auth";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { encrypt, decrypt } from "@/lib/encryption";
import bcrypt from "bcrypt";
import ConfirmSubmitButton from "@/components/confirm-submit-button";

export async function generateMetadata() {
  const t = await getTranslations("admin.presenters");
  return { title: t("editPageTitle", { name: "EGONAIR" }) };
}

export default async function EditPresenterPage({
  params,
  searchParams,
}: {
  params:       Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; pwError?: string; stationError?: string }>;
}) {
  const session = await auth();
  
  if (!session || (session.user as any).role !== "ADMIN") {
    redirect("/login");
  }

  const { id: presenterId } = await params;
  const t = await getTranslations("admin.presenters");
  const tc = await getTranslations("common");

  const presenter = await prisma.user.findUnique({
    where: { id: presenterId },
    include: { 
      schedules:             { take: 1, orderBy: { startDatetime: "desc" } },
      sonicPanelCredentials: true,
      validity:              true,
      directDjRadios:        { orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }] },
    },
  });

  if (!presenter || presenter.role !== "PRESENTER") {
    redirect("/admin/presenters");
  }

  // ── Resolve legacy (null-station) credential for the main form ───────────
  // Step 4A-final: presenter now has sonicPanelCredentials[] (one-to-many).
  // The legacy presenter-wide credential is the row with stationId = null.
  const legacySp = presenter.sonicPanelCredentials.find((c) => !c.stationId) ?? null;

  let djPasswordDecrypted = "";
  let streamPasswordDecrypted = "";
  if (legacySp) {
    try { djPasswordDecrypted = decrypt(legacySp.djPasswordEncrypted); } catch(e) {}
    try { streamPasswordDecrypted = legacySp.streamPasswordEncrypted ? decrypt(legacySp.streamPasswordEncrypted) : ""; } catch(e) {}
  }

  // ── Station assignment data ───────────────────────────────────────────────
  // Fetch all active stations so the checkbox list stays in sync with the
  // Station table.  Only active stations are offered for assignment.
  const allStations = await prisma.station.findMany({
    where:   { isActive: true },
    orderBy: { name: "asc" },
    select:  { id: true, name: true, slug: true, publicUrl: true },
  });

  // Current assignments for this presenter (active links only).
  const currentAssignments = await prisma.presenterStation.findMany({
    where:  { presenterId, isActive: true },
    select: { stationId: true },
  });
  const assignedStationIds = new Set(currentAssignments.map((a) => a.stationId));

  // Stations assigned to THIS presenter — used to populate the schedule dropdown.
  // Only active PresenterStation → active Station rows are offered.
  const presenterAssignedStations = allStations.filter((s) => assignedStationIds.has(s.id));

  // Current schedule's station (for pre-filling the dropdown).
  const currentScheduleStationId = presenter.schedules[0]?.stationId ?? null;

  // ── updatePresenterStations ───────────────────────────────────────────────
  // For MULTI_STATION: replaces assignments atomically, but blocks removal of
  // any station that still has Programs attached to this presenter.
  // For SINGLE_STATION: this action should never be submitted (UI is read-only).
  async function updatePresenterStations(formData: FormData) {
    "use server";
    const t = await getTranslations("admin.presenters");
    const tc = await getTranslations("common");

    const session = await auth();
    if (!session || (session.user as any).role !== "ADMIN") {
      throw new Error("Unauthorized");
    }

    const target = await prisma.user.findUnique({ where: { id: presenterId } });
    if (!target || target.role !== "PRESENTER") {
      throw new Error(t("presenterNotFound"));
    }

    // SINGLE_STATION must not change station via this form
    if (target.presenterMode === "SINGLE_STATION") {
      throw new Error(t("errorCannotChangeSingleStation"));
    }

    const selectedIds = formData.getAll("stationIds") as string[];

    // Require at least one station for MULTI_STATION
    if (selectedIds.length === 0) {
      const { redirect: rdr } = await import("next/navigation");
      rdr(`/admin/presenters/${presenterId}/edit?stationError=empty#presenter-stations`);
    }

    // Validate each selected station is active
    if (selectedIds.length > 0) {
      const validStations = await prisma.station.findMany({
        where: { id: { in: selectedIds }, isActive: true },
        select: { id: true },
      });
      const validIds = new Set(validStations.map((s) => s.id));
      for (const sid of selectedIds) {
        if (!validIds.has(sid)) {
          throw new Error(t("errorStationNotFound", { sid }));
        }
      }
    }

    // ── Program guard: cannot remove a station if presenter has Programs on it ─
    const currentAssignments = await prisma.presenterStation.findMany({
      where: { presenterId, isActive: true },
      select: { stationId: true },
    });
    const currentIds = new Set(currentAssignments.map((a) => a.stationId));
    const selectedSet = new Set(selectedIds);
    const removedIds = [...currentIds].filter((id) => !selectedSet.has(id));

    if (removedIds.length > 0) {
      const programsOnRemovedStations = await prisma.program.findMany({
        where: { presenterId, stationId: { in: removedIds } },
        select: { stationId: true },
        take: 1,
      });
      if (programsOnRemovedStations.length > 0) {
        const { redirect: rdr } = await import("next/navigation");
        rdr(`/admin/presenters/${presenterId}/edit?stationError=programs#presenter-stations`);
      }
    }

    // Atomic replace
    await prisma.$transaction([
      prisma.presenterStation.deleteMany({ where: { presenterId } }),
      ...selectedIds.map((stationId) =>
        prisma.presenterStation.create({
          data: { presenterId, stationId, isActive: true },
        })
      ),
    ]);

    revalidatePath(`/admin/presenters/${presenterId}/edit`);
    revalidatePath("/admin/presenters");
    const { redirect: rdr } = await import("next/navigation");
    rdr(`/admin/presenters/${presenterId}/edit?saved=stations#presenter-stations`);
  }

  async function updatePresenter(formData: FormData) {
    "use server";
    const t = await getTranslations("admin.presenters");
    const tc = await getTranslations("common");
    
    const session = await auth();
    if (!session || (session.user as any).role !== "ADMIN") {
      throw new Error("Unauthorized");
    }

    const name = formData.get("name") as string;
    const username = formData.get("username") as string;
    const email = (formData.get("email") as string | null)?.trim() || null;
    const phone = (formData.get("phone") as string | null)?.trim() || null;
    const isActive = formData.get("isActive") === "on";
    const canBroadcast = formData.get("canBroadcast") === "on";
    const presenterMode = (formData.get("presenterMode") as string | null)?.trim() || "SINGLE_STATION";
    const validModes = ["SINGLE_STATION", "MULTI_STATION", "DIRECT_DJ"];
    const resolvedMode = validModes.includes(presenterMode) ? presenterMode : "SINGLE_STATION";

    if (!username || username.trim().length < 3) {
      throw new Error(t("errorUsernameTooShort"));
    }

    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser && existingUser.id !== presenterId) {
      throw new Error(t("errorUsernameTaken"));
    }

    await prisma.user.update({
      where: { id: presenterId },
      data: {
        name,
        username,
        email: email || null,
        phone: phone || null,
        isActive,
        canBroadcast,
        presenterMode: resolvedMode,
      },
    });

    // ── Presenter validity (subscription period) ──────────────────────────────
    const validFromRaw = (formData.get("validFrom") as string | null)?.trim() || null;
    const validToRaw   = (formData.get("validTo")   as string | null)?.trim() || null;
    if (validFromRaw || validToRaw) {
      await prisma.presenterValidity.upsert({
        where:  { presenterId },
        create: {
          presenterId,
          validFrom: validFromRaw ? new Date(validFromRaw) : null,
          validTo:   validToRaw   ? new Date(validToRaw)   : null,
          isActive:  true,
          timezone:  "Africa/Cairo",
        },
        update: {
          validFrom: validFromRaw ? new Date(validFromRaw) : null,
          validTo:   validToRaw   ? new Date(validToRaw)   : null,
        },
      });
    }

    const startDatetime = formData.get("startDatetime") as string;
    const endDatetime = formData.get("endDatetime") as string;
    const allowConnectMinutesBefore = parseInt(formData.get("allowConnectMinutesBefore") as string || "5", 10);

    if (startDatetime && endDatetime) {
      // ── stationId for this schedule ──────────────────────────────────────
      const rawStationId = (formData.get("scheduleStationId") as string | null)?.trim() || null;

      // Validate ownership: if a stationId was submitted, it must be one the
      // presenter is actually assigned to (via PresenterStation).  This prevents
      // an admin from accidentally assigning a schedule to the wrong station.
      let resolvedStationId: string | null = null;
      if (rawStationId) {
        const validLink = await prisma.presenterStation.findFirst({
          where: { presenterId, stationId: rawStationId, isActive: true },
        });
        if (!validLink) {
          throw new Error(t("errorStationNotLinked"));
        }
        resolvedStationId = rawStationId;
      }
      // If no station was submitted (legacy or no assignment yet), stationId stays null.

      const scheduleData = {
        startDatetime: new Date(startDatetime),
        endDatetime:   new Date(endDatetime),
        timezone:      "Africa/Cairo",
        allowConnectMinutesBefore,
        stationId:     resolvedStationId,
      };

      const existingSchedule = await prisma.broadcastSchedule.findFirst({
        where: { presenterId: presenterId },
      });

      if (existingSchedule) {
        await prisma.broadcastSchedule.update({
          where: { id: existingSchedule.id },
          data: scheduleData,
        });
      } else {
        await prisma.broadcastSchedule.create({
          data: {
            ...scheduleData,
            presenterId,
          },
        });
      }
    }

    // SonicPanel fields are no longer accepted from the visible edit form.
    // Legacy credentials remain in DB untouched; no new writes from this action.

    revalidatePath("/admin/presenters");
    redirect(`/admin/presenters/${presenterId}/edit?saved=presenter`);
  }

  // ── updatePresenterPassword ───────────────────────────────────────────────
  // Changes only the passwordHash field. Never touches any other presenter data.
  async function updatePresenterPassword(formData: FormData) {
    "use server";
    const t = await getTranslations("admin.presenters");
    const tc = await getTranslations("common");

    const session = await auth();
    if (!session || (session.user as any).role !== "ADMIN") {
      throw new Error("Unauthorized");
    }

    const target = await prisma.user.findUnique({ where: { id: presenterId } });
    if (!target || target.role !== "PRESENTER") {
      throw new Error(t("presenterNotFound"));
    }

    const newPassword    = (formData.get("newPassword")     as string | null)?.trim() ?? "";
    const confirmPassword = (formData.get("confirmPassword") as string | null)?.trim() ?? "";

    if (!newPassword) {
      const { redirect: rdr } = await import("next/navigation");
      rdr(`/admin/presenters/${presenterId}/edit?pwError=empty#change-password`);
    }
    if (newPassword.length < 6) {
      const { redirect: rdr } = await import("next/navigation");
      rdr(`/admin/presenters/${presenterId}/edit?pwError=short#change-password`);
    }
    if (newPassword !== confirmPassword) {
      const { redirect: rdr } = await import("next/navigation");
      rdr(`/admin/presenters/${presenterId}/edit?pwError=mismatch#change-password`);
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: presenterId },
      data:  { passwordHash },
    });

    revalidatePath(`/admin/presenters/${presenterId}/edit`);
    const { redirect: rdr } = await import("next/navigation");
    rdr(`/admin/presenters/${presenterId}/edit?saved=password#change-password`);
  }

  // ── createDirectDjRadio ───────────────────────────────────────────────────
  async function createDirectDjRadio(formData: FormData) {
    "use server";
    const t = await getTranslations("admin.presenters");
    const tc = await getTranslations("common");
    const session = await auth();
    if (!session || (session.user as any).role !== "ADMIN") throw new Error("Unauthorized");

    const target = await prisma.user.findUnique({ where: { id: presenterId }, select: { presenterMode: true } });
    if (!target) throw new Error(t("presenterNotFound"));
    if (!['DIRECT_DJ'].includes(target.presenterMode)) throw new Error(t("errorModeNotDirectDj"));

    const radioName = (formData.get("radioName") as string)?.trim();
    const host      = (formData.get("host")      as string)?.trim();
    const portRaw   = formData.get("port");
    const djUser    = (formData.get("djUsername") as string)?.trim();
    const password  = (formData.get("djPassword") as string);
    const mount     = (formData.get("mount")     as string)?.trim() || null;
    const sid       = (formData.get("sid")       as string)?.trim() || null;
    const bitrateRaw = formData.get("bitrate");
    const isActive  = formData.get("isActive") === "on";

    if (!radioName) throw new Error(t("errorRadioNameRequired"));
    if (!host)      throw new Error(t("errorHostRequired"));
    if (!djUser)    throw new Error(t("errorDjUserRequired"));
    if (!password)  throw new Error(t("errorPasswordRequired"));

    const port = parseInt(String(portRaw), 10);
    if (isNaN(port) || port < 1 || port > 65535) throw new Error(t("errorPortInvalid"));

    const bitrate = parseInt(String(bitrateRaw), 10) || 128;

    const { encrypt: enc } = await import("@/lib/encryption");
    const encryptedPassword = enc(password);

    await prisma.directDjRadio.create({
      data: { presenterId, radioName, host, port, djUsername: djUser, encryptedPassword, mount, sid, bitrate, isActive },
    });

    revalidatePath(`/admin/presenters/${presenterId}/edit`);
    const { redirect: rdr } = await import("next/navigation");
    rdr(`/admin/presenters/${presenterId}/edit?saved=djradio#dj-radios`);
  }

  // ── toggleDirectDjRadio ───────────────────────────────────────────────────
  async function toggleDirectDjRadio(formData: FormData) {
    "use server";
    const t = await getTranslations("admin.presenters");
    const tc = await getTranslations("common");
    const session = await auth();
    if (!session || (session.user as any).role !== "ADMIN") throw new Error("Unauthorized");
    const radioId = formData.get("radioId") as string;
    if (!radioId) throw new Error(t("errorRadioIdRequired"));
    const radio = await prisma.directDjRadio.findFirst({ where: { id: radioId, presenterId } });
    if (!radio) throw new Error(t("errorRadioNotFound"));
    await prisma.directDjRadio.update({ where: { id: radioId }, data: { isActive: !radio.isActive } });
    revalidatePath(`/admin/presenters/${presenterId}/edit`);
    const { redirect: rdr } = await import("next/navigation");
    rdr(`/admin/presenters/${presenterId}/edit?saved=djradio#dj-radios`);
  }

  // ── deleteDirectDjRadio ───────────────────────────────────────────────────
  async function deleteDirectDjRadio(formData: FormData) {
    "use server";
    const t = await getTranslations("admin.presenters");
    const tc = await getTranslations("common");
    const session = await auth();
    if (!session || (session.user as any).role !== "ADMIN") throw new Error("Unauthorized");
    const radioId = formData.get("radioId") as string;
    if (!radioId) throw new Error(t("errorRadioIdRequired"));
    const radio = await prisma.directDjRadio.findFirst({ where: { id: radioId, presenterId } });
    if (!radio) throw new Error(t("errorRadioNotFound"));
    await prisma.directDjRadio.delete({ where: { id: radioId } });
    revalidatePath(`/admin/presenters/${presenterId}/edit`);
    const { redirect: rdr } = await import("next/navigation");
    rdr(`/admin/presenters/${presenterId}/edit#dj-radios`);
  }

  // ── updateDirectDjRadio ───────────────────────────────────────────
  async function updateDirectDjRadio(formData: FormData) {
    "use server";
    const t = await getTranslations("admin.presenters");
    const tc = await getTranslations("common");
    const session = await auth();
    if (!session || (session.user as any).role !== "ADMIN") throw new Error("Unauthorized");

    const radioId    = (formData.get("radioId")    as string | null)?.trim() ?? "";
    const radioName  = (formData.get("radioName")  as string | null)?.trim() ?? "";
    const host       = (formData.get("host")       as string | null)?.trim() ?? "";
    const portRaw    = formData.get("port");
    const djUser     = (formData.get("djUsername") as string | null)?.trim() ?? "";
    const password   = (formData.get("djPassword") as string | null)?.trim() || null;
    const mount      = (formData.get("mount")      as string | null)?.trim() || null;
    const sid        = (formData.get("sid")        as string | null)?.trim() || null;
    const bitrateRaw = formData.get("bitrate");
    const isActive   = formData.get("isActive") === "on";

    if (!radioId)   throw new Error(t("errorRadioIdRequired"));
    if (!radioName) throw new Error(t("errorRadioNameRequired"));
    if (!host)      throw new Error(t("errorHostRequired"));
    if (!djUser)    throw new Error(t("errorDjUserRequired"));

    const port = parseInt(String(portRaw), 10);
    if (isNaN(port) || port < 1 || port > 65535) throw new Error(t("errorPortInvalid"));
    const bitrate = parseInt(String(bitrateRaw), 10) || 128;

    // Ownership: radio must belong to the presenter being edited
    const existing = await prisma.directDjRadio.findFirst({
      where:  { id: radioId, presenterId },
      select: { id: true, encryptedPassword: true },
    });
    if (!existing) throw new Error(t("errorRadioNotOwned"));

    // Keep old password if none supplied
    let encryptedPassword = existing.encryptedPassword;
    if (password) {
      const { encrypt: enc } = await import("@/lib/encryption");
      encryptedPassword = enc(password);
    }

    await prisma.directDjRadio.update({
      where: { id: radioId },
      data:  { radioName, host, port, djUsername: djUser, encryptedPassword, mount, sid, bitrate, isActive },
    });

    revalidatePath(`/admin/presenters/${presenterId}/edit`);
    const { redirect: rdr } = await import("next/navigation");
    rdr(`/admin/presenters/${presenterId}/edit?saved=djradio#dj-radios`);
  }

  // Read resolved search params for saved-state banner
  const { saved, pwError, stationError } = await searchParams;

  const pwErrorMessage = pwError === "empty"
    ? t("pwErrorEmpty")
    : pwError === "short"
    ? t("pwErrorShort")
    : pwError === "mismatch"
    ? t("pwErrorMismatch")
    : null;

  const stationErrorMessage = stationError === "programs"
    ? t("stationErrorPrograms")
    : stationError === "empty"
    ? t("stationErrorEmpty")
    : null;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-8 font-sans">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8 flex items-center gap-4">
          <Link href="/admin/presenters" className="p-2 bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors border border-neutral-800">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14"></path>
              <path d="m12 5 7 7-7 7"></path>
            </svg>
          </Link>
          <h1 className="text-3xl font-bold bg-gradient-to-l from-indigo-400 to-cyan-400 bg-clip-text text-transparent">{t("editPresenter")}</h1>
          <Link
            href={`/admin/presenters/${presenterId}/delete`}
            className="mr-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 bg-red-950/40 border border-red-800/40 hover:bg-red-900/50 hover:border-red-700/50 rounded-lg transition-colors"
          >
            🗑️ {t("manageDelete")}
          </Link>
        </div>

        {/* ── Top success banner — shown after presenter/schedule save ——————————
             Visible immediately because it sits at the top of the page.
             Each save action uses a different ?saved= value so both banners
             can coexist without collision.
        —————————————————————————————————————————————————————————————————— */}
        {saved === "presenter" && (
          <div className="flex items-center gap-2.5 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-5 py-3.5 text-emerald-400 text-sm mb-2">
            <span className="text-base">✅</span>{t("savedPresenter")}</div>
        )}

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 md:p-8 shadow-xl">
          <form action={updatePresenter} className="space-y-6">
            
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium text-neutral-300">{t("name")}</label>
              <input
                id="name"
                name="name"
                type="text"
                defaultValue={presenter.name || ""}
                placeholder={t("presenterName")}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-medium text-neutral-300">{t("username")}<span className="text-red-500">*</span></label>
              <input
                id="username"
                name="username"
                type="text"
                required
                defaultValue={presenter.username}
                placeholder={t("usernameForLogin")}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-mono text-left"
                dir="ltr"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-neutral-300">{t("email")}</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={presenter.email || ""}
                  placeholder="ahmed@example.com"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-mono text-left"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="phone" className="text-sm font-medium text-neutral-300">{t("phone")}</label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  defaultValue={presenter.phone || ""}
                  placeholder="+201001234567"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-mono text-left"
                  dir="ltr"
                />
              </div>
            </div>

            {/* ══ Presenter Mode ══ */}
            <div className="pt-4 border-t border-neutral-800">
              <h2 className="text-base font-semibold text-neutral-200 mb-1">{t("accountType")}</h2>
              <p className="text-xs text-neutral-500 mb-3 leading-relaxed">{t("accountTypeCannotChangeEdit")}</p>
              {/* Hidden input preserves current mode — displayed as badge only */}
              <input type="hidden" name="presenterMode" value={presenter.presenterMode} />
              <div className={`inline-flex items-center gap-2.5 px-4 py-3 rounded-xl border ${
                presenter.presenterMode === "DIRECT_DJ"
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                  : presenter.presenterMode === "MULTI_STATION"
                  ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-300"
                  : "bg-indigo-500/10 border-indigo-500/30 text-indigo-300"
              }`}>
                <span className="text-lg">
                  {presenter.presenterMode === "DIRECT_DJ" ? "🎙️"
                    : presenter.presenterMode === "MULTI_STATION" ? "📡"
                    : "📻"}
                </span>
                <div>
                  <div className="font-semibold text-sm">
                    {presenter.presenterMode === "DIRECT_DJ" ? t("directDj")
                      : presenter.presenterMode === "MULTI_STATION" ? t("multiStationLabel")
                      : t("singleStationLabel")}
                  </div>
                  <div className="text-xs opacity-70 mt-0.5">
                    {presenter.presenterMode === "DIRECT_DJ"
                      ? t("directDjBadge")
                      : presenter.presenterMode === "MULTI_STATION"
                      ? t("multiStationBadge")
                      : t("singleStationBadge")}
                  </div>
                </div>
              </div>
            </div>

            {/* ══ Account validity / subscription ══ */}
            <div className="pt-4 border-t border-neutral-800">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                <div>
                  <h2 className="text-base font-semibold text-neutral-200">{t("validityAndSubscription")}</h2>
                </div>
              {/* Programs management link — only for station-based types */}
              {presenter.presenterMode !== 'DIRECT_DJ' && (
                <Link
                  href={`/admin/programs?presenterId=${presenter.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-300 bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 rounded-lg transition-colors whitespace-nowrap"
                >
                  <span>📺</span>{t("managePrograms")}</Link>
              )}
              </div>

              {/* Helper text */}
              {presenter.presenterMode !== 'DIRECT_DJ' ? (
                <p className="text-xs text-neutral-500 mb-4 leading-relaxed">
                  {t("presenterActiveHint1")}
                  {t("presenterActiveHint2")}{" "}
                  <Link href="/admin/programs" className="text-purple-400 hover:text-purple-300 underline underline-offset-2 transition-colors">{t("programsPage")}</Link>.
                </p>
              ) : (
                <p className="text-xs text-neutral-500 mb-4 leading-relaxed">{t("validityDirectDjDesc")}</p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="space-y-2">
                  <label htmlFor="validFrom" className="text-sm font-medium text-neutral-400">{t("validFromLabel")}</label>
                  <input
                    id="validFrom"
                    name="validFrom"
                    type="date"
                    defaultValue={presenter.validity?.validFrom ? new Date(presenter.validity.validFrom).toISOString().slice(0, 10) : ""}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-left"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="validTo" className="text-sm font-medium text-neutral-400">{t("validToLabel")}</label>
                  <input
                    id="validTo"
                    name="validTo"
                    type="date"
                    defaultValue={presenter.validity?.validTo ? new Date(presenter.validity.validTo).toISOString().slice(0, 10) : ""}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-left"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-3 p-4 bg-neutral-950/50 border border-neutral-800 rounded-xl cursor-pointer hover:bg-neutral-900 transition-colors">
                  <input
                    type="checkbox"
                    name="isActive"
                    defaultChecked={presenter.isActive}
                    className="w-5 h-5 rounded border-neutral-700 text-indigo-500 focus:ring-indigo-500/50 bg-neutral-900"
                  />
                  <div className="flex flex-col">
                    <span className="font-medium text-neutral-200">{t("accountActive")}</span>
                    <span className="text-xs text-neutral-500">{t("accountActiveDesc")}</span>
                  </div>
                </label>

                {presenter.presenterMode !== 'DIRECT_DJ' ? (
                <label className="flex items-center gap-3 p-4 bg-neutral-950/50 border border-neutral-800 rounded-xl cursor-pointer hover:bg-neutral-900 transition-colors">
                  <input
                    type="checkbox"
                    name="canBroadcast"
                    defaultChecked={presenter.canBroadcast}
                    className="w-5 h-5 rounded border-neutral-700 text-indigo-500 focus:ring-indigo-500/50 bg-neutral-900"
                  />
                  <div className="flex flex-col">
                    <span className="font-medium text-neutral-200">{t("broadcastPermission")}</span>
                    <span className="text-xs text-neutral-500">{t("broadcastPermissionDesc")}</span>
                  </div>
                </label>
                ) : (
                  // DIRECT_DJ: canBroadcast not shown in UI — hidden field preserves true
                  // so saving does not silently set canBroadcast=false and lock the DJ out.
                  <input type="hidden" name="canBroadcast" value="on" />
                )}
              </div>
            </div>

            {/*
              INTERNAL — Legacy BroadcastSchedule inputs.
              Hidden from admin UI. Required by the current Studio gate until
              ProgramScheduleRule replaces BroadcastSchedule in Phase 3.
              DO NOT display these fields as business UI.
              Only submitted for station-based presenters (not DIRECT_DJ).
            */}
            {presenter.presenterMode !== 'DIRECT_DJ' && (
              <div className="hidden" aria-hidden="true">
                <input name="startDatetime" type="datetime-local"
                  defaultValue={presenter.schedules[0]?.startDatetime ? new Date(presenter.schedules[0].startDatetime.getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 16) : ""} />
                <input name="endDatetime" type="datetime-local"
                  defaultValue={presenter.schedules[0]?.endDatetime ? new Date(presenter.schedules[0].endDatetime.getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 16) : ""} />
                <input name="allowConnectMinutesBefore" type="number"
                  defaultValue={presenter.schedules[0]?.allowConnectMinutesBefore || 5} />
                <input name="scheduleStationId" type="text"
                  defaultValue={currentScheduleStationId ?? ""} />
              </div>
            )}




            <div className="pt-6">
              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl px-4 py-3 transition-all shadow-lg shadow-indigo-500/20"
              >{t("saveChanges")}</button>
            </div>
          </form>
        </div>

        {/* ── Station Section ─────────────────────────────────────────────────
             SINGLE_STATION: read-only assigned station card
             MULTI_STATION:  editable checkbox list with program-guard
             DIRECT_DJ:      hidden
        ─────────────────────────────────────────────────────────────────── */}
        {presenter.presenterMode !== 'DIRECT_DJ' && (
        <div id="presenter-stations" className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 md:p-8 shadow-xl mt-6">

          {/* ── SINGLE_STATION: read-only card ─── */}
          {presenter.presenterMode === 'SINGLE_STATION' && (
            <>
              <h2 className="text-lg font-semibold text-neutral-200 mb-1">{t("linkedStation")}</h2>
              <div className="flex items-start gap-2 bg-neutral-800/50 border border-neutral-700 rounded-xl px-4 py-3 mb-4">
                <span className="text-amber-400 mt-0.5">🔒</span>
                <p className="text-xs text-neutral-400 leading-relaxed">{t("singleStationLocked")}</p>
              </div>
              {presenterAssignedStations.length === 0 ? (
                <div className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                  ⚠️ {t("singleStationLocked")}
                </div>
              ) : (
                presenterAssignedStations.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-xl">
                    <span className="text-xl">📻</span>
                    <div>
                      <div className="font-semibold text-sm text-neutral-200">{s.name}</div>
                      <div className="text-xs font-mono text-cyan-400/80">{s.slug}</div>
                    </div>
                  </div>
                ))
              )}
            </>
          )}

          {/* ── MULTI_STATION: editable checkbox list ─── */}
          {presenter.presenterMode === 'MULTI_STATION' && (
            <>
              <h2 className="text-lg font-semibold text-neutral-200 mb-1">{t("linkedStations")}</h2>
              <p className="text-xs text-neutral-500 mb-4">{t("multiStationEditHint")}</p>

              {/* Error banner */}
              {stationErrorMessage && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3 text-red-400 text-sm mb-5">
                  <span>❌</span>
                  {stationErrorMessage}
                </div>
              )}

              {/* Success banner */}
              {saved === "stations" && (
                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-4 py-3 text-emerald-400 text-sm mb-5">
                  <span>✅</span>{t("stationsSaved")}</div>
              )}

              {allStations.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  {t("noActiveStationsYet")}{" "}
                  <a href="/admin/stations" className="text-indigo-400 hover:underline">{t("addStationFirst")}</a>
                </p>
              ) : (
                <form action={updatePresenterStations} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {allStations.map((station) => (
                      <label
                        key={station.id}
                        className="flex items-start gap-3 p-4 bg-neutral-950/50 border border-neutral-800 rounded-xl cursor-pointer hover:bg-neutral-900 hover:border-indigo-500/30 transition-colors"
                      >
                        <input
                          type="checkbox"
                          name="stationIds"
                          value={station.id}
                          defaultChecked={assignedStationIds.has(station.id)}
                          className="mt-0.5 w-4 h-4 rounded border-neutral-700 text-indigo-500 focus:ring-indigo-500/50 bg-neutral-900 accent-indigo-500"
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium text-neutral-200 text-sm">{station.name}</span>
                          <span className="font-mono text-xs text-cyan-400/80 mt-0.5">{station.slug}</span>
                          {station.publicUrl && (
                            <span className="text-xs text-neutral-600 truncate mt-0.5" dir="ltr">
                              {station.publicUrl.replace(/^https?:\/\//, "")}
                            </span>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="pt-1">
                    <button
                      type="submit"
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl px-4 py-3 transition-all shadow-lg shadow-indigo-500/20 text-sm"
                    >{t("savePresenterStations")}</button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
        )}

        {/* ── Change Password Section ──────────────────────────────────────────
             Separate form — only updates passwordHash. Never touches other data.
        ─────────────────────────────────────────────────────────────────── */}
        <div
          id="change-password"
          className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 md:p-8 shadow-xl mt-6"
        >
          <div className="flex items-center gap-3 mb-1">
            <span className="text-lg">🔑</span>
            <h2 className="text-lg font-semibold text-neutral-200">{t("changePassword")}</h2>
          </div>
          <p className="text-xs text-neutral-500 mb-5">{t("changePasswordDesc")}</p>

          {/* Inline success banner */}
          {saved === "password" && (
            <div className="flex items-center gap-2.5 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-5 py-3.5 text-emerald-400 text-sm mb-5">
              <span className="text-base">✅</span>{t("passwordChanged")}</div>
          )}

          {/* Inline error banner */}
          {pwErrorMessage && (
            <div className="flex items-center gap-2.5 bg-red-500/10 border border-red-500/25 rounded-xl px-5 py-3.5 text-red-400 text-sm mb-5">
              <span className="text-base">❌</span>
              {pwErrorMessage}
            </div>
          )}

          <form action={updatePresenterPassword} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="newPassword" className="text-sm font-medium text-neutral-300">{t("newPassword")}<span className="text-red-500">*</span>
              </label>
              <input
                id="newPassword"
                name="newPassword"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                placeholder={t("minChars")}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-mono"
                dir="ltr"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium text-neutral-300">{t("confirmPassword")}<span className="text-red-500">*</span>
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                placeholder={t("retypePassword")}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-mono"
                dir="ltr"
              />
            </div>

            <div className="pt-1">
              <button
                type="submit"
                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-xl px-4 py-3 transition-all shadow-lg shadow-amber-500/20 text-sm"
              >
                {tc("changePassword")}
              </button>
            </div>
          </form>
        </div>

      {/* ══ Direct DJ Radios section (visible only for DIRECT_DJ) ══ */}
      {presenter.presenterMode === 'DIRECT_DJ' && (
        <div id="dj-radios" className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 md:p-8 shadow-xl mt-6">

          {/* Saved banner */}
          {saved === "djradio" && (
            <div className="flex items-center gap-2.5 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-5 py-3.5 text-emerald-400 text-sm mb-6">
              <span className="text-base">✅</span>{t("djRadioSaved")}</div>
          )}

          {/* Section header */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-base">🎙️</div>
              <h2 className="text-base font-semibold text-neutral-200">{t("djRadios")}</h2>
            </div>
            <span className="px-2.5 py-1 rounded-lg text-xs font-medium border bg-amber-500/10 text-amber-400 border-amber-500/20">
              {t("radioCount", { count: presenter.directDjRadios.length })}
            </span>
          </div>
          <p className="text-xs text-neutral-500 mb-6 mr-11">{t("djRadiosDesc")}</p>

          {/* Existing radios list */}
          {presenter.directDjRadios.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-neutral-800 rounded-xl mb-5">
              <div className="text-2xl mb-2">📡</div>
              <p className="text-sm text-neutral-500">{t("noDjRadios")}</p>
              <p className="text-xs text-neutral-600 mt-1">{t("addDjRadioHint")}</p>
            </div>
          ) : (
            <div className="space-y-2.5 mb-5">
              {presenter.directDjRadios.map((r) => (
                <details key={r.id} className={`rounded-xl border overflow-hidden transition-all ${
                  r.isActive ? 'border-neutral-700/60' : 'border-neutral-800/40 opacity-60'
                }`}>
                  {/* Collapsed summary row */}
                  <summary className="flex items-center gap-3 px-4 py-3 bg-neutral-950/50 cursor-pointer list-none select-none hover:bg-neutral-950/70 transition-colors">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-0.5 ${r.isActive ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]' : 'bg-neutral-600'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-neutral-200 truncate">{r.radioName}</span>
                        <span className={`px-1.5 py-px rounded text-[10px] font-medium border ${
                          r.isActive
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-neutral-700/30 text-neutral-500 border-neutral-700/30'
                        }`}>{r.isActive ? tc("active") : tc("inactive")}</span>
                        <span className="text-[10px] text-neutral-500 bg-neutral-800/50 px-1.5 py-px rounded border border-neutral-700/30 font-mono" dir="ltr">
                          {r.bitrate}kbps
                        </span>
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5 font-mono truncate" dir="ltr">
                        {r.djUsername}@{r.host}:{r.port}
                        {r.mount && <span className="text-neutral-600 ml-1">{r.mount}</span>}
                        {r.sid   && <span className="text-neutral-600 ml-1">SID:{r.sid}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {/* Toggle */}
                      <form action={toggleDirectDjRadio}>
                        <input type="hidden" name="radioId" value={r.id} />
                        <button type="submit" className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-all ${
                          r.isActive
                            ? 'text-neutral-400 border-neutral-700 hover:bg-neutral-800 hover:text-neutral-300'
                            : 'text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10'
                        }`}>{r.isActive ? `⏸ ${tc("disable")}` : `▶ ${tc("enable")}`}</button>
                      </form>
                      {/* Delete */}
                      <form action={deleteDirectDjRadio}>
                        <input type="hidden" name="radioId" value={r.id} />
                        <ConfirmSubmitButton
                          message={t("deleteRadioConfirm", { name: r.radioName })}
                          className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 hover:border-red-500/40 transition-all"
                        >{t("deleteRadio")}</ConfirmSubmitButton>
                      </form>
                      {/* Expand indicator */}
                      <span className="text-[11px] text-indigo-400 border border-indigo-500/20 px-2.5 py-1 rounded-lg bg-indigo-500/5 hover:bg-indigo-500/10 transition-colors whitespace-nowrap">{t("editRadio")}</span>
                    </div>
                  </summary>

                  {/* Inline edit form */}
                  <div className="px-4 pt-4 pb-5 border-t border-neutral-800 bg-neutral-950/40">
                    <p className="text-xs font-semibold text-indigo-400 mb-3 flex items-center gap-1.5"><span>✏️</span>{t("editRadioData")}</p>
                    <form action={updateDirectDjRadio} className="space-y-3">
                      <input type="hidden" name="radioId" value={r.id} />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="sm:col-span-2 space-y-1">
                          <label className="text-xs font-medium text-neutral-400">{t("radioName")}<span className="text-red-400">*</span></label>
                          <input name="radioName" type="text" required defaultValue={r.radioName}
                            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/60 transition-all" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-neutral-400">Host <span className="text-red-400">*</span></label>
                          <input name="host" type="text" required defaultValue={r.host}
                            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/60 transition-all" dir="ltr" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-neutral-400">Port <span className="text-red-400">*</span></label>
                          <input name="port" type="number" required min={1} max={65535} defaultValue={r.port}
                            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/60 transition-all" dir="ltr" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-neutral-400">DJ Username <span className="text-red-400">*</span></label>
                          <input name="djUsername" type="text" required defaultValue={r.djUsername}
                            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/60 transition-all" dir="ltr" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-neutral-400">{t("password")}</label>
                          <input name="djPassword" type="password" autoComplete="new-password" placeholder="••••••••"
                            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/60 transition-all" dir="ltr" />
                          <p className="text-[10px] text-neutral-600">{t("keepCurrentPassword")}</p>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-neutral-400">Mount</label>
                          <input name="mount" type="text" defaultValue={r.mount ?? ""}
                            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/60 transition-all" dir="ltr" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-neutral-400">SID</label>
                          <input name="sid" type="text" defaultValue={r.sid ?? ""}
                            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/60 transition-all" dir="ltr" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-neutral-400">Bitrate (kbps)</label>
                          <input name="bitrate" type="number" defaultValue={r.bitrate} min={32} max={320}
                            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/60 transition-all" dir="ltr" />
                        </div>
                        <div className="flex items-center gap-2 sm:col-span-2">
                          <input name="isActive" id={`edit-isActive-${r.id}`} type="checkbox" defaultChecked={r.isActive}
                            className="w-4 h-4 rounded border-neutral-700 accent-indigo-500" />
                          <label htmlFor={`edit-isActive-${r.id}`} className="text-sm text-neutral-300">{t("isActive")}</label>
                        </div>
                      </div>
                      <div className="flex justify-end pt-1">
                        <button type="submit"
                          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-lg shadow-indigo-500/20 transition-all">{t("saveRadioChanges")}</button>
                      </div>
                    </form>
                  </div>
                </details>
              ))}
            </div>
          )}

          {/* Add new radio — collapsible */}
          <details className="group">
            <summary className="list-none cursor-pointer">
              <div className="flex items-center gap-2 w-fit px-4 py-2 rounded-xl border border-dashed border-neutral-700 text-neutral-400 hover:text-neutral-200 hover:border-neutral-600 hover:bg-neutral-800/40 transition-all text-sm font-medium select-none">
                <span className="text-base leading-none">＋</span>
                <span>{t("addNewRadio")}</span>
              </div>
            </summary>
            <div className="mt-4 rounded-xl border border-neutral-700/60 bg-neutral-950/40 p-5">
              <p className="text-xs font-semibold text-neutral-300 mb-4 flex items-center gap-1.5"><span>📡</span>{t("newRadioData")}</p>
              <form action={createDirectDjRadio} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-xs font-medium text-neutral-400">{t("radioName")}<span className="text-red-400">*</span></label>
                    <input name="radioName" type="text" required placeholder={t("radioNamePlaceholder")}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/60 transition-all" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-neutral-400">Host <span className="text-red-400">*</span></label>
                    <input name="host" type="text" required placeholder="stream.example.com"
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/60 transition-all" dir="ltr" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-neutral-400">Port <span className="text-red-400">*</span></label>
                    <input name="port" type="number" required min={1} max={65535} placeholder="8000"
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/60 transition-all" dir="ltr" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-neutral-400">DJ Username <span className="text-red-400">*</span></label>
                    <input name="djUsername" type="text" required placeholder="dj_user"
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/60 transition-all" dir="ltr" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-neutral-400">{t("password")}<span className="text-red-400">*</span></label>
                    <input name="djPassword" type="password" required autoComplete="new-password"
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/60 transition-all" dir="ltr" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-neutral-400">Mount</label>
                    <input name="mount" type="text" placeholder=""
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-all" dir="ltr" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-neutral-400">SID <span className="text-neutral-600 text-[10px]">(SHOUTcast)</span></label>
                    <input name="sid" type="text" placeholder="1"
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-all" dir="ltr" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-neutral-400">Bitrate (kbps)</label>
                    <input name="bitrate" type="number" defaultValue={128} min={32} max={320}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-all" dir="ltr" />
                  </div>
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <input name="isActive" id="djr-isActive" type="checkbox" defaultChecked
                      className="w-4 h-4 rounded border-neutral-700 accent-amber-500" />
                    <label htmlFor="djr-isActive" className="text-sm text-neutral-300">{t("activateRadio")}</label>
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <button type="submit"
                    className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg shadow-lg shadow-amber-500/20 transition-all">
                    📡 {t("addRadio")}
                  </button>
                </div>
              </form>
            </div>
          </details>
        </div>
      )}

      </div>

    </div>
  );
}
