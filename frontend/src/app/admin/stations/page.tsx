import { auth, prisma }    from "@/auth";
import { redirect }         from "next/navigation";
import Link                 from "next/link";
import { decrypt }          from "@/lib/encryption";
import { createStation, toggleStationActive, updateStation, updateStationDefaultCredential, updateStationMessaging } from "./actions";
import { AdminStationsFilter } from "./stations-filter";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState }  from "@/components/ui/EmptyState";
import { AdminPageShell } from "@/components/ui";
import { getTranslations } from "next-intl/server";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import { CheckCircle } from "lucide-react";
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { getTranslations } = await import("next-intl/server");
  const t = await getTranslations("admin.stations");
  return { title: t("metaTitle", { name: "EGONAIR" }) };
}

// ── Field helpers ─────────────────────────────────────────────────────────────
const inputCls =
  "w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 " +
  "placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 " +
  "focus:border-cyan-500 transition-all text-sm";

const inputMonoCls = inputCls + " font-mono";

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function StationsPage({

  searchParams,
}: {
  searchParams: Promise<{ edit?: string; updated?: string; dj?: string; new?: string; created?: string; q?: string; status?: string; hasDjCredential?: string; hasPresenters?: string; hasPrograms?: string; hasRecordings?: string; hasManager?: string; sort?: string; page?: string; pageSize?: string }>;
}) {
  // Auth guard
  const session = await auth();
  const t = await getTranslations("admin.stations");
  const tc = await getTranslations("common");
  const tl = await getTranslations("studio.LiveMessaging");
  if (!session || (session.user as any).role !== "ADMIN") {
    redirect("/login");
  }

  const params      = await searchParams;
  const editingId   = params.edit    ?? null;
  const showNew     = params.new     === "1" && !editingId;
  const justUpdated = params.updated === "1";
  const djSaved     = justUpdated && params.dj === "1";
  const msgSaved    = params.updated === "msg";
  const justCreated = !!params.created;
  const djCreated   = params.created === "dj";

  const q                  = params.q               && params.q.trim() !== "" ? params.q.trim() : "";
  const statusParam        = params.status          || "all";
  const hasDjCredParam     = params.hasDjCredential || "all";
  const hasPresentersParam = params.hasPresenters   || "all";
  const hasProgramsParam   = params.hasPrograms     || "all";
  const hasManagerParam    = params.hasManager      || "all";
  const sortParam          = params.sort            || "newest";
  // NOTE: hasRecordings filter removed — all existing recordings have stationId=null
  // (legacy pre-migration rows). The Prisma relation filter returns 0 for every station.
  // Re-enable only after a data migration backfills stationId on historical recordings.

  const validPageSizes = [20, 40, 60, 80, 100];
  const parsedPageSize = parseInt(params.pageSize || "20", 10);
  const finalPageSize  = validPageSizes.includes(parsedPageSize) ? parsedPageSize : 20;
  let page = parseInt(params.page || "1", 10);
  if (isNaN(page) || page < 1) page = 1;

  const stationWhere: Record<string, any> = {};
  if (q) stationWhere.OR = [{ name: { contains: q } }, { slug: { contains: q } }, { description: { contains: q } }];
  if (statusParam === "active")   stationWhere.isActive = true;
  if (statusParam === "inactive") stationWhere.isActive = false;
  if (hasDjCredParam === "has")     stationWhere.defaultCredential = { isNot: null };
  if (hasDjCredParam === "missing") stationWhere.defaultCredential = null;
  if (hasPresentersParam === "has")  stationWhere.presenterStations = { some: { isActive: true } };
  if (hasPresentersParam === "none") stationWhere.presenterStations = { none: { isActive: true } };
  if (hasProgramsParam === "has")    stationWhere.programs = { some: {} };
  if (hasProgramsParam === "none")   stationWhere.programs = { none: {} };
  // hasRecordings filter intentionally disabled — see comment above near hasRecordingsParam.
  if (hasManagerParam === "has")     stationWhere.stationManagers = { some: { isActive: true } };
  if (hasManagerParam === "none")    stationWhere.stationManagers = { none: { isActive: true } };

  const sortMap: Record<string, any> = { newest: { createdAt: "desc" }, oldest: { createdAt: "asc" }, name: { name: "asc" } };
  const stationOrderBy = sortMap[sortParam] ?? { createdAt: "desc" };
  const where = Object.keys(stationWhere).length > 0 ? stationWhere : undefined;

  const totalCount = await prisma.station.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / finalPageSize));
  if (page > totalPages) page = totalPages;
  const finalSkip = (page - 1) * finalPageSize;

  const stations = await prisma.station.findMany({
    where,
    orderBy: stationOrderBy,
    skip:    finalSkip,
    take:    finalPageSize,
    include: {
      defaultCredential: { select: { id: true, isActive: true } },
      _count: { select: { presenterStations: true, programs: true, recordings: true, stationManagers: true } },
    },
  });

  // If editing, fetch the full station including its defaultCredential
  const editingStation = editingId
    ? await prisma.station.findUnique({
        where:   { id: editingId },
        include: { defaultCredential: true },
      })
    : null;

  // Decrypt station default password for form pre-fill (never expose raw)
  let sdcPasswordDecrypted = "";
  if (editingStation?.defaultCredential) {
    try { sdcPasswordDecrypted = decrypt(editingStation.defaultCredential.encryptedPassword); } catch { }
  }

  const buildUrl = (pg: number) => {
    const p2 = new URLSearchParams();
    if (q) p2.set("q", q);
    if (statusParam !== "all") p2.set("status", statusParam);
    if (hasDjCredParam !== "all") p2.set("hasDjCredential", hasDjCredParam);
    if (hasPresentersParam !== "all") p2.set("hasPresenters", hasPresentersParam);
    if (hasProgramsParam !== "all") p2.set("hasPrograms", hasProgramsParam);
    if (hasManagerParam !== "all") p2.set("hasManager", hasManagerParam);
    if (sortParam !== "newest") p2.set("sort", sortParam);
    p2.set("page", pg.toString());
    if (finalPageSize !== 20) p2.set("pageSize", finalPageSize.toString());
    return `/admin/stations?${p2.toString()}`;
  };

  const renderPagination = () => (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-2 border-t border-slate-700/50">
      <span className="text-xs text-neutral-500">
        {tc("page")} <span className="text-neutral-300 font-medium">{page}</span> {tc("of")} <span className="text-neutral-300 font-medium">{totalPages}</span> · {totalCount} {t("station")}
      </span>
      <div className="flex items-center gap-2 flex-wrap">
        <form method="get" className="flex items-center gap-1.5">
          {q && <input type="hidden" name="q" value={q} />}
          {statusParam !== "all" && <input type="hidden" name="status" value={statusParam} />}
          {hasDjCredParam !== "all" && <input type="hidden" name="hasDjCredential" value={hasDjCredParam} />}
          {hasPresentersParam !== "all" && <input type="hidden" name="hasPresenters" value={hasPresentersParam} />}
          {hasProgramsParam !== "all" && <input type="hidden" name="hasPrograms" value={hasProgramsParam} />}
          {hasManagerParam !== "all" && <input type="hidden" name="hasManager" value={hasManagerParam} />}
          {sortParam !== "newest" && <input type="hidden" name="sort" value={sortParam} />}
          <label htmlFor="stPS" className="text-xs text-neutral-500">{tc("resultsCount")}:</label>
          <select id="stPS" name="pageSize" defaultValue={finalPageSize}
            className="bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs rounded-lg px-2 py-1 outline-none focus:border-cyan-500">
            {[20,40,60,80,100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <button type="submit" className="px-2.5 py-1 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 text-xs font-medium rounded-lg border border-neutral-600 transition-colors">{tc("apply")}</button>
        </form>
        {page > 1
          ? <a href={buildUrl(page-1)} className="px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium rounded-lg border border-neutral-700 transition-colors">{tc("previous")}</a>
          : <span className="px-3 py-1 text-neutral-600 text-xs rounded-lg border border-neutral-800/50 cursor-not-allowed">{tc("previous")}</span>}
        {page < totalPages
          ? <a href={buildUrl(page+1)} className="px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium rounded-lg border border-neutral-700 transition-colors">{tc("next")}</a>
          : <span className="px-3 py-1 text-neutral-600 text-xs rounded-lg border border-neutral-800/50 cursor-not-allowed">{tc("next")}</span>}
      </div>
    </div>
  );

  return (
    <AdminPageShell maxWidth="max-w-6xl" padding="p-8">
      <div className="space-y-8">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link href="/admin" className="text-slate-500 hover:text-slate-300 transition-colors text-sm">
                {tc("dashboard")}
              </Link>
              <span className="text-slate-700">/</span>
              <span className="text-slate-300 text-sm">{t("title")}</span>
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-l from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              {t("title")}
            </h1>
            <p className="text-slate-400 text-sm mt-1">{t("subtitle")}</p>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher compact />
            {/* + {t("addStation")} button — only when not editing and form not open */}
            {!editingId && !showNew && (
              <Link
                href="/admin/stations?new=1"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-xl transition-colors shadow-lg shadow-cyan-500/20 text-sm flex-shrink-0"
              >
                <span className="text-lg leading-none">+</span>
                {t("addStation")}
              </Link>
            )}
            {/* Cancel button while create form is open */}
            {showNew && (
              <Link
                href="/admin/stations"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium rounded-xl transition-colors text-sm flex-shrink-0"
              >
                {tc("cancel")} ↩
              </Link>
            )}
          </div>
        </div>

        {/* ── Success banners ── */}
        {justUpdated && !djSaved && (
          <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-5 py-3 text-emerald-400 text-sm">
            <span className="text-base">✅</span>
            {t("stationUpdated")}
          </div>
        )}
        {djSaved && (
          <div className="flex items-center gap-3 bg-cyan-500/10 border border-cyan-500/30 rounded-xl px-5 py-3 text-cyan-400 text-sm">
            <span className="text-base">✅</span>
            {t("djCredentialsSaved")}
          </div>
        )}
        {justCreated && !djCreated && (
          <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-5 py-3 text-emerald-400 text-sm">
            <span className="text-base">✅</span>
            {t("stationCreated")}
          </div>
        )}
        {djCreated && (
          <div className="flex items-center gap-3 bg-cyan-500/10 border border-cyan-500/30 rounded-xl px-5 py-3 text-cyan-400 text-sm">
            <span className="text-base">✅</span>
            {t("stationCreatedWithDj")}
          </div>
        )}

        {/* ── Smart Filter ── */}
        <AdminStationsFilter
          initialQ={q} initialStatus={statusParam} initialHasDjCredential={hasDjCredParam}
          initialHasPresenters={hasPresentersParam} initialHasPrograms={hasProgramsParam}
          initialHasManager={hasManagerParam}
          initialSort={sortParam} pageSize={finalPageSize}
        />

        {/* ── DJ / SonicPanel warning note ── */}
        <div className="flex items-start gap-3 bg-amber-500/8 border border-amber-500/25 rounded-xl px-5 py-4">
          <span className="text-amber-400 text-lg mt-0.5">⚠️</span>
          <p className="text-amber-300/90 text-sm leading-relaxed">
            {t("djWarning")}
          </p>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            EDIT FORM — shown only when ?edit=<id> is in the URL
        ═══════════════════════════════════════════════════════════════════ */}
        {editingStation && (
          <>
          <section className="bg-slate-800 border border-cyan-500/30 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-cyan-300 flex items-center gap-2">
                <span className="text-xl">✏️</span>
                {t("editStation")}: {editingStation.name}
              </h2>
              <Link
                href="/admin/stations"
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                {tc("cancel")} ↩
              </Link>
            </div>

            <form action={updateStation} className="space-y-5">
              {/* Hidden station ID */}
              <input type="hidden" name="stationId" value={editingStation.id} />

              {/* Row 1 — name + slug */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="edit-name" className="text-sm font-medium text-slate-300">
                    {t("stationName")} <span className="text-red-400">*</span>
                  </label>
                  <input id="edit-name" name="name" type="text" required
                    defaultValue={editingStation.name}
                    className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="edit-slug" className="text-sm font-medium text-slate-300">
                    Slug <span className="text-red-400">*</span>
                    <span className="text-slate-500 font-normal text-xs mx-2">({t("englishAndDashesOnly")})</span>
                  </label>
                  <input id="edit-slug" name="slug" type="text" required dir="ltr"
                    defaultValue={editingStation.slug}
                    className={inputMonoCls} />
                </div>
              </div>

              {/* Row 2 — description */}
              <div className="space-y-1.5">
                <label htmlFor="edit-description" className="text-sm font-medium text-slate-300">
                  {t("description")} <span className="text-slate-500 font-normal text-xs">({tc("optional")})</span>
                </label>
                <input id="edit-description" name="description" type="text"
                  defaultValue={editingStation.description ?? ""}
                  placeholder={t("descriptionPlaceholder")}
                  className={inputCls} />
              </div>

              {/* Row 3 — listen host + listen port + public url */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="edit-streamHost" className="text-sm font-medium text-slate-300">
                    {t("listenDomain")}
                  </label>
                  <p className="text-xs text-slate-600 -mt-1">{t("listenDomainHelp")}</p>
                  <input id="edit-streamHost" name="streamHost" type="text" dir="ltr"
                    defaultValue={editingStation.streamHost ?? ""}
                    placeholder="radio.example.com"
                    className={inputMonoCls} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="edit-streamPort" className="text-sm font-medium text-slate-300">
                    {t("listenPort")}
                  </label>
                  <p className="text-xs text-slate-600 -mt-1">{t("listenPortHelp")}</p>
                  <input id="edit-streamPort" name="streamPort" type="number"
                    min="1" max="65535" dir="ltr"
                    defaultValue={editingStation.streamPort ?? ""}
                    placeholder="8000"
                    className={inputMonoCls} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="edit-publicUrl" className="text-sm font-medium text-slate-300">
                    {t("publicPlayerUrl")}
                  </label>
                  <p className="text-xs text-slate-600 -mt-1">{t("publicPlayerUrlHelp")}</p>
                  <input id="edit-publicUrl" name="publicUrl" type="url" dir="ltr"
                    defaultValue={editingStation.publicUrl ?? ""}
                    placeholder="https://radio.example.com/listen"
                    className={inputMonoCls} />
                </div>
              </div>

              {/* Iframe Embed */}
              <div className="space-y-1.5 pt-2">
                <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                  <span className="text-base">💻</span>
                  {tl("widgetSettings")}
                </label>
                <input
                  key={`iframe-${editingStation.id}`}
                  type="text"
                  readOnly
                  defaultValue={`<iframe src="https://studio.egonair.com/embed/chat/${editingStation.id}" width="100%" height="600" frameborder="0"></iframe>`}
                  className={inputMonoCls + " text-cyan-300 text-xs"}
                />
              </div>

              {/* Submit */}
              <div className="flex items-center gap-3 pt-4">
                <button type="submit"
                  className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-xl transition-colors shadow-lg shadow-cyan-500/20 text-sm">
                  {tc("save")}
                </button>
                <Link href="/admin/stations"
                  className="px-5 py-2.5 text-slate-400 hover:text-slate-200 bg-slate-700 hover:bg-slate-600 rounded-xl transition-colors text-sm">
                  {tc("cancel")}
                </Link>
              </div>
            </form>
          </section>

          {/* ═══════════════════════════════════════════════════════════════
              STATION DEFAULT DJ CREDENTIAL FORM
              Separate form — does not interfere with main station save.
          ═══════════════════════════════════════════════════════════════ */}
          <section className="bg-slate-800 border border-indigo-500/20 rounded-2xl p-6 shadow-xl">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-indigo-300 flex items-center gap-2">
                <span className="text-xl">🎚️</span>
                {t("defaultDjCredentials")}
              </h2>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                {t("defaultDjHelp")}
              </p>
              <div className="mt-2">
                {editingStation?.defaultCredential ? (
                  <StatusBadge
                    label={editingStation.defaultCredential.isActive ? t("setupAndActive") : t("setupInactive")}
                    variant={editingStation.defaultCredential.isActive ? "success" : "neutral"}
                    dot
                  />
                ) : (
                  <StatusBadge label={t("notSetupYet")} variant="warning" dot />
                )}
              </div>
            </div>

            <form action={updateStationDefaultCredential} className="space-y-4">
              <input type="hidden" name="sdcStationId" value={editingStation!.id} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="sdcHost" className="text-sm font-medium text-slate-300">
                    Host <span className="text-red-400">*</span>
                  </label>
                  <input id="sdcHost" name="sdcHost" type="text" dir="ltr" required
                    defaultValue={editingStation?.defaultCredential?.host ?? ""}
                    placeholder="stream.example.com"
                    className={inputMonoCls} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="sdcPort" className="text-sm font-medium text-slate-300">
                    Port <span className="text-red-400">*</span>
                  </label>
                  <input id="sdcPort" name="sdcPort" type="number" dir="ltr" required
                    min="1" max="65535"
                    defaultValue={editingStation?.defaultCredential?.port ?? ""}
                    placeholder="8000"
                    className={inputMonoCls} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="sdcDjUsername" className="text-sm font-medium text-slate-300">
                    DJ Username <span className="text-red-400">*</span>
                  </label>
                  <input id="sdcDjUsername" name="sdcDjUsername" type="text" dir="ltr" required
                    defaultValue={editingStation?.defaultCredential?.djUsername ?? ""}
                    className={inputMonoCls} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="sdcDjPassword" className="text-sm font-medium text-slate-300">
                    DJ Password
                    {editingStation?.defaultCredential && (
                      <span className="text-slate-500 font-normal text-xs mx-2">({t("leaveBlankToKeep")})</span>
                    )}
                    {!editingStation?.defaultCredential && (
                      <span className="text-red-400"> *</span>
                    )}
                  </label>
                  <input id="sdcDjPassword" name="sdcDjPassword" type="password" dir="ltr"
                    placeholder={editingStation?.defaultCredential ? "••••••••" : ""}
                    className={inputMonoCls} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="sdcMount" className="text-sm font-medium text-slate-300">Mount</label>
                  <input id="sdcMount" name="sdcMount" type="text" dir="ltr"
                    defaultValue={editingStation?.defaultCredential?.mount ?? ""}
                    placeholder="/"
                    className={inputMonoCls} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="sdcSid" className="text-sm font-medium text-slate-300">SID</label>
                  <input id="sdcSid" name="sdcSid" type="text" dir="ltr"
                    defaultValue={editingStation?.defaultCredential?.sid ?? ""}
                    className={inputMonoCls} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="sdcBitrate" className="text-sm font-medium text-slate-300">Bitrate (kbps)</label>
                  <input id="sdcBitrate" name="sdcBitrate" type="number" dir="ltr"
                    min="8" max="320"
                    defaultValue={editingStation?.defaultCredential?.bitrate ?? 128}
                    className={inputMonoCls} />
                </div>
                <div className="flex items-center gap-3 pt-5">
                  <input id="sdcIsActive" name="sdcIsActive" type="checkbox"
                    defaultChecked={editingStation?.defaultCredential?.isActive ?? true}
                    className="w-4 h-4 accent-indigo-500 cursor-pointer" />
                  <label htmlFor="sdcIsActive" className="text-sm font-medium text-slate-300 cursor-pointer">
                    {t("activeFallback")}
                  </label>
                </div>
              </div>

              <div className="pt-1">
                <button type="submit"
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-colors shadow-lg shadow-indigo-500/20 text-sm">
                  {t("saveDjCredentials")}
                </button>
              </div>
            </form>
          </section>

          {/* ═══════════════════════════════════════════════════════════════
              LIVE MESSAGING STYLES & SETTINGS
          ═══════════════════════════════════════════════════════════════ */}
          <section className="bg-slate-800 border border-fuchsia-500/20 rounded-2xl p-6 shadow-xl mt-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-fuchsia-300 flex items-center gap-2">
                <span className="text-xl">💬</span>
                {tl("widgetSettings")}
              </h2>
              <Link 
                href={`/admin/stations/${editingStation.id}/inbox`}
                className="text-xs px-3 py-1.5 bg-fuchsia-500/20 text-fuchsia-300 hover:bg-fuchsia-500/30 rounded-lg transition-colors border border-fuchsia-500/30"
              >
                📥 {tl("inbox")}
              </Link>
            </div>
            {msgSaved && (
              <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-xl flex items-center gap-2 animate-in fade-in">
                <CheckCircle className="w-5 h-5" />
                <p className="text-sm font-medium">{t("stationUpdated")}</p>
              </div>
            )}
            <form action={updateStationMessaging} className="space-y-4">
              <input type="hidden" name="stationId" value={editingStation.id} />
              <div className="flex items-center gap-3 pb-3 border-b border-slate-700">
                <input id="isMessagingEnabled" name="isMessagingEnabled" type="checkbox"
                  defaultChecked={editingStation.isMessagingEnabled}
                  className="w-4 h-4 accent-fuchsia-500 cursor-pointer" />
                <label htmlFor="isMessagingEnabled" className="text-sm font-medium text-slate-300 cursor-pointer">
                  {tl("enableMessaging")}
                </label>
                <span className="text-xs text-amber-400 ml-auto">{tl("disableWarning")}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 pt-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-300">{tl("language") || "Language"}</label>
                  <select name="iframeLanguage" defaultValue={editingStation.iframeLanguage || "ar"} className={inputCls + " w-full bg-slate-900 border-slate-700"}>
                    <option value="ar">العربية (Arabic)</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-300">{tl("textColor")}</label>
                  <div className="flex gap-2">
                    <input name="iframeTextColor" type="color" defaultValue={editingStation.iframeTextColor || "#ffffff"} className="h-10 w-14 p-1 bg-slate-900 border border-slate-700 rounded-lg cursor-pointer" />
                    <input type="text" defaultValue={editingStation.iframeTextColor || ""} placeholder="#ffffff" className={inputMonoCls + " flex-1"} readOnly />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-300">{tl("bgColor")}</label>
                  <div className="flex gap-2">
                    <input name="iframeBgColor" type="color" defaultValue={editingStation.iframeBgColor || "#0f172a"} className="h-10 w-14 p-1 bg-slate-900 border border-slate-700 rounded-lg cursor-pointer" />
                    <input type="text" defaultValue={editingStation.iframeBgColor || ""} placeholder="#0f172a" className={inputMonoCls + " flex-1"} readOnly />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-300">{tl("borderColor")}</label>
                  <div className="flex gap-2">
                    <input name="iframeBorderColor" type="color" defaultValue={editingStation.iframeBorderColor || "#334155"} className="h-10 w-14 p-1 bg-slate-900 border border-slate-700 rounded-lg cursor-pointer" />
                    <input type="text" defaultValue={editingStation.iframeBorderColor || ""} placeholder="#334155" className={inputMonoCls + " flex-1"} readOnly />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-300">{tl("placeholderColor")}</label>
                  <div className="flex gap-2">
                    <input name="iframePlaceholderColor" type="color" defaultValue={editingStation.iframePlaceholderColor || "#94a3b8"} className="h-10 w-14 p-1 bg-slate-900 border border-slate-700 rounded-lg cursor-pointer" />
                    <input type="text" defaultValue={editingStation.iframePlaceholderColor || ""} placeholder="#94a3b8" className={inputMonoCls + " flex-1"} readOnly />
                  </div>
                </div>
              </div>
              <div className="pt-3">
                <button type="submit"
                  className="px-6 py-2.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-medium rounded-xl transition-colors shadow-lg shadow-fuchsia-500/20 text-sm">
                  {tc("save")}
                </button>
              </div>
            </form>
          </section>
          </>
        )}
        {/* ══════════════════════════════════════════════════════════════════
            CREATE FORM — shown only when ?new=1 and not editing
        ══════════════════════════════════════════════════════════════════ */}
        {showNew && (
          <section className="bg-slate-800 border border-slate-700/50 rounded-2xl p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-200 mb-5 flex items-center gap-2">
              <span className="text-xl">📻</span>
              {t("addNewStation")}
            </h2>

            <form action={createStation} className="space-y-5">

              {/* ── Basic station fields ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="name" className="text-sm font-medium text-slate-300">
                    اسم المحطة <span className="text-red-400">*</span>
                  </label>
                  <input id="name" name="name" type="text" required
                    placeholder="EGONAIR Radio 1"
                    className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="slug" className="text-sm font-medium text-slate-300">
                    Slug <span className="text-red-400">*</span>
                    <span className="text-slate-500 font-normal text-xs mr-2">(أحرف إنجليزية وشرطات فقط)</span>
                  </label>
                  <input id="slug" name="slug" type="text" required dir="ltr"
                    placeholder="egonair-radio-1"
                    className={inputMonoCls} />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="description" className="text-sm font-medium text-slate-300">
                  الوصف <span className="text-slate-500 font-normal text-xs">({tc("optional")})</span>
                </label>
                <input id="description" name="description" type="text"
                  placeholder="وصف مختصر للمحطة"
                  className={inputCls} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="streamHost" className="text-sm font-medium text-slate-300">رابط/دومين الاستماع</label>
                  <p className="text-xs text-slate-600 -mt-1">خاص برابط الاستماع العام، وليس بيانات DJ</p>
                  <input id="streamHost" name="streamHost" type="text" dir="ltr"
                    placeholder="radio.example.com"
                    className={inputMonoCls} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="streamPort" className="text-sm font-medium text-slate-300">بورت الاستماع</label>
                  <p className="text-xs text-slate-600 -mt-1">هذا ليس بورت DJ / Source</p>
                  <input id="streamPort" name="streamPort" type="number"
                    min="1" max="65535" dir="ltr"
                    placeholder="8000"
                    className={inputMonoCls} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="publicUrl" className="text-sm font-medium text-slate-300">موقع الإذاعة أو رابط المشغل العام</label>
                  <p className="text-xs text-slate-600 -mt-1">رابط يظهر للإدارة أو للمستمعين، وليس بيانات اتصال المذيع</p>
                  <input id="publicUrl" name="publicUrl" type="url" dir="ltr"
                    placeholder="https://radio.example.com/listen"
                    className={inputMonoCls} />
                </div>
              </div>

              {/* ── Optional default DJ credentials ── */}
              <div className="border-t border-slate-700 pt-5 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-indigo-300 flex items-center gap-2">
                    <span>🎚️</span> بيانات DJ الافتراضية للمحطة
                    <span className="text-slate-500 font-normal text-xs">(اختياري)</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {t("optionalDjHelp")}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="new-sdcHost" className="text-sm font-medium text-slate-300">Host</label>
                    <input id="new-sdcHost" name="sdcHost" type="text" dir="ltr"
                      placeholder="stream.example.com"
                      className={inputMonoCls} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="new-sdcPort" className="text-sm font-medium text-slate-300">Port</label>
                    <input id="new-sdcPort" name="sdcPort" type="number" dir="ltr"
                      min="1" max="65535" placeholder="8000"
                      className={inputMonoCls} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="new-sdcDjUsername" className="text-sm font-medium text-slate-300">DJ Username</label>
                    <input id="new-sdcDjUsername" name="sdcDjUsername" type="text" dir="ltr"
                      className={inputMonoCls} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="new-sdcDjPassword" className="text-sm font-medium text-slate-300">
                      DJ Password <span className="text-xs text-red-400/80">({t("requiredIfDjEntered")})</span>
                    </label>
                    <input id="new-sdcDjPassword" name="sdcDjPassword" type="password" dir="ltr"
                      className={inputMonoCls} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="new-sdcMount" className="text-sm font-medium text-slate-300">Mount</label>
                    <input id="new-sdcMount" name="sdcMount" type="text" dir="ltr"
                      placeholder="/"
                      className={inputMonoCls} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="new-sdcBitrate" className="text-sm font-medium text-slate-300">Bitrate (kbps)</label>
                    <input id="new-sdcBitrate" name="sdcBitrate" type="number" dir="ltr"
                      min="8" max="320" defaultValue={128}
                      className={inputMonoCls} />
                  </div>
                </div>
              </div>

              <div className="pt-1 flex items-center gap-3">
                <button type="submit"
                  className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-xl transition-colors shadow-lg shadow-cyan-500/20 text-sm">
                  {t("createStation")}
                </button>
                <Link href="/admin/stations"
                  className="px-5 py-2.5 text-slate-400 hover:text-slate-200 bg-slate-700 hover:bg-slate-600 rounded-xl transition-colors text-sm">
                  إلغاء
                </Link>
              </div>
            </form>
          </section>
        )}


        {/* ── Stations List ── */}
        <section>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-4">
            {t("registeredStations")} ({totalCount})
          </h2>
          {/* Pagination — always visible */}
          {renderPagination()}


          {stations.length === 0 ? (
            <div className="bg-slate-800 border border-slate-700/50 rounded-2xl overflow-hidden">
              <EmptyState
                icon="📻"
                title={
                  q || statusParam !== "all" || hasDjCredParam !== "all" || hasPresentersParam !== "all"
                    ? t("noStationsMatch")
                    : t("noStationsYet")
                }
                description={
                  q || statusParam !== "all" || hasDjCredParam !== "all" || hasPresentersParam !== "all"
                    ? t("tryAdjustFilters")
                    : t("addFirstStation")
                }
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {stations.map((station) => (
                <div key={station.id} className={`bg-slate-800 border rounded-2xl p-5 flex flex-col gap-3 shadow-sm transition-colors ${editingId === station.id ? "border-cyan-500/50" : "border-slate-700/50 hover:border-slate-600/70"}`}>
                  {/* Name + slug */}
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-semibold text-slate-100 leading-snug">{station.name}</p>
                      <span className="font-mono text-[11px] text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded flex-shrink-0">{station.slug}</span>
                    </div>
                    {station.description && <p className="text-xs text-slate-500 leading-relaxed">{station.description}</p>}
                  </div>
                  {/* Stream info */}
                  <div className="space-y-0.5" dir="ltr">
                    {station.streamHost && (
                      <p className="font-mono text-xs text-slate-400 truncate">
                        {station.streamHost}{station.streamPort ? `:${station.streamPort}` : ""}
                      </p>
                    )}
                    {station.publicUrl && (
                      <a href={station.publicUrl} target="_blank" rel="noopener noreferrer"
                        className="font-mono text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2 truncate block" title={station.publicUrl}>
                        {station.publicUrl.replace(/^https?:\/\//, "")}
                      </a>
                    )}
                    {!station.streamHost && !station.publicUrl && <span className="text-xs text-slate-600">{t("noStreamUrl")}</span>}
                  </div>
                  {/* Stats */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span title={t("presentersCount")} className="inline-flex items-center gap-1 px-2 py-0.5 bg-cyan-500/10 text-cyan-400 text-[11px] font-medium rounded-full border border-cyan-500/20">👤 {station._count.presenterStations}</span>
                    <span title={t("programsCount")} className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-500/10 text-purple-400 text-[11px] font-medium rounded-full border border-purple-500/20">📋 {station._count.programs}</span>
                    <span title={t("recordingsCount")} className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-500/10 text-sky-400 text-[11px] font-medium rounded-full border border-sky-500/20">🎙️ {station._count.recordings}</span>
                    {station._count.stationManagers > 0 && (
                      <span title={t("managersCount")} className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-500/10 text-rose-400 text-[11px] font-medium rounded-full border border-rose-500/20">🗂 {station._count.stationManagers}</span>
                    )}
                  </div>
                  {/* Status badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge label={station.isActive ? t("active") : t("inactive")} variant={station.isActive ? "success" : "neutral"} dot />
                    {station.defaultCredential
                      ? <StatusBadge label={station.defaultCredential.isActive ? t("djSetup") : t("djStopped")} variant={station.defaultCredential.isActive ? "info" : "neutral"} dot />
                      : <StatusBadge label={t("djNotSetup")} variant="warning" dot />}
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-700/50 flex-wrap">
                    <Link href={`/admin/stations?edit=${station.id}`} className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium border text-indigo-400 bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/20 transition-colors">{tc("edit")}</Link>
                    <Link href={`/admin/stations/${station.id}/delete`} className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium border text-red-400 bg-red-500/10 border-red-500/20 hover:bg-red-500/20 transition-colors">{tc("delete")}</Link>
                    <form action={toggleStationActive} className="inline">
                      <input type="hidden" name="stationId" value={station.id} />
                      <input type="hidden" name="currentIsActive" value={String(station.isActive)} />
                      <button type="submit" className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${station.isActive ? "text-amber-400 bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20" : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20"}`}>
                        {station.isActive ? t("stop") : t("activate")}
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* Pagination — always visible */}
          {renderPagination()}

        </section>


      </div>{/* end space-y-8 */}
    </AdminPageShell>
  );
}
