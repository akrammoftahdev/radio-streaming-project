import { auth, prisma } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { recordingPlayUrl, recordingDownloadUrl, recordingMimeType } from "@/lib/recording-helpers";
import { DeleteRecordingButton } from "./delete-button";
import { AdminRecordingsPresenterFilter } from "./presenter-filter";
import { AdminRecordingsStationFilter } from "./station-filter";
import { AdminRecordingsDateSearchFilter } from "./date-search-filter";
import { AdminRecordingsTypeSortFilter } from "./recordings-type-sort-filter";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState }  from "@/components/ui/EmptyState";
import { AdminPageShell } from "@/components/ui";
import { getTranslations, getLocale } from "next-intl/server";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("admin.recordings");
  return { title: t("title") };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number, t: any): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} ${t("unitSec")}`;
  if (s === 0) return `${m} ${t("unitMin")}`;
  return `${m} ${t("unitMin")} ${s} ${t("unitSec")}`;
}

function formatBytes(bytes: number, t: any): string {
  if (bytes < 1024)         return `${bytes} ${t("unitByte")}`;
  if (bytes < 1024 * 1024)  return `${(bytes / 1024).toFixed(1)} ${t("unitKB")}`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ${t("unitMB")}`;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminRecordingsPage({
  searchParams,
}: {
  searchParams: Promise<{ presenterId?: string; presenterIds?: string; stationIds?: string; page?: string; pageSize?: string; q?: string; dateFrom?: string; dateTo?: string; presenterMode?: string; fileType?: string; sort?: string }>;
}) {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const session = await auth();
  if (!session || (session.user as { role?: string }).role !== "ADMIN") {
    redirect("/login");
  }

  const t = await getTranslations("admin.recordings");
  const locale = await getLocale();
  const dir = locale === "ar" ? "rtl" : "ltr";

  // ── 2. Resolve filter param (Next.js 15 async searchParams) ───────────────
  const { presenterId: filterPresenterId, presenterIds: filterPresenterIds, stationIds: filterStationIds, page: pageParam, pageSize: pageSizeParam, q: qParam, dateFrom: dateFromParam, dateTo: dateToParam, presenterMode: presenterModeParam, fileType: fileTypeParam, sort: sortParam } = await searchParams;
  
  const q = qParam && qParam.trim() !== "" ? qParam.trim() : "";
  const dateFrom = dateFromParam && dateFromParam.trim() !== "" ? dateFromParam.trim() : "";
  const dateTo = dateToParam && dateToParam.trim() !== "" ? dateToParam.trim() : "";
  
  let activeIds: string[] = [];
  if (filterPresenterIds && filterPresenterIds.trim() !== "") {
    activeIds = filterPresenterIds.split(",").map(id => id.trim()).filter(Boolean);
  } else if (filterPresenterId && filterPresenterId.trim() !== "") {
    activeIds = [filterPresenterId.trim()];
  }

  let activeStationIds: string[] = [];
  if (filterStationIds && filterStationIds.trim() !== "") {
    activeStationIds = filterStationIds.split(",").map(id => id.trim()).filter(Boolean);
  }

  const validPageSizes = [20, 40, 60, 80, 100];
  const parsedPageSize = parseInt(pageSizeParam || "20", 10);
  const finalPageSize = validPageSizes.includes(parsedPageSize) ? parsedPageSize : 20;

  let page = parseInt(pageParam || "1", 10);
  if (isNaN(page) || page < 1) page = 1;

  // ── 3. Fetch active data for the filter dropdowns ─────────────────
  let allPresenters: { id: string; name: string | null; username: string }[] = [];
  let allStations: { id: string; name: string; slug: string }[] = [];
  let dbError = false;

  try {
    allPresenters = await prisma.user.findMany({
      where:   { role: "PRESENTER" },
      orderBy: { username: "asc" },
      select:  { id: true, name: true, username: true },
    });
    
    allStations = await prisma.station.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    });
  } catch (err) {
    console.error("[AdminRecordings] lookups query failed:", (err as Error).message);
    dbError = true;
  }

  // ── 4. Fetch recordings (optionally filtered by presenter) ─────────────────
  let recordings: {
    id:              string;
    localPath:       string;
    startedAt:       Date;
    endedAt:         Date | null;
    durationSeconds: number | null;
    bytesReceived:   number | null;
    format:          string;
    presenter: {
      name:     string | null;
      username: string;
    } | null;
    presenterNameSnapshot:     string | null;
    presenterUsernameSnapshot: string | null;
    stationNameSnapshot:       string | null;
    presenterDeleted:          boolean;
    stationDeleted:            boolean;
  }[] = [];

  const whereClause: any = {};
  if (activeIds.length > 0) {
    whereClause.presenterId = { in: activeIds };
  }
  if (activeStationIds.length > 0) {
    whereClause.stationId = { in: activeStationIds };
  }
  if (q) {
    whereClause.OR = [
      { localPath: { contains: q } },
      { presenterNameSnapshot: { contains: q } },
      { presenterUsernameSnapshot: { contains: q } },
      { stationNameSnapshot: { contains: q } },
      { presenter: { name: { contains: q } } },
      { presenter: { username: { contains: q } } },
      { station: { name: { contains: q } } },
    ];
  }
  if (dateFrom) {
    const from = new Date(dateFrom);
    if (!isNaN(from.getTime())) {
      whereClause.startedAt = { ...whereClause.startedAt, gte: from };
    }
  }
  if (dateTo) {
    const to = new Date(dateTo);
    if (!isNaN(to.getTime())) {
      to.setUTCHours(23, 59, 59, 999);
      whereClause.startedAt = { ...whereClause.startedAt, lte: to };
    }
  }

  // ── Presenter type filter ─────────────────────────────────────────────────
  if (presenterModeParam && ["SINGLE_STATION", "MULTI_STATION", "DIRECT_DJ"].includes(presenterModeParam)) {
    whereClause.presenter = { presenterMode: presenterModeParam };
  }

  // ── File type filter ──────────────────────────────────────────────────────
  if (fileTypeParam === "audio/mpeg" || fileTypeParam === "audio/webm") {
    whereClause.format = fileTypeParam;
  }

  let totalCount = 0;
  try {
    totalCount = await prisma.recording.count({
      where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
    });
  } catch (err) {
    console.error("[AdminRecordings] count query failed:", (err as Error).message);
    dbError = true;
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / finalPageSize));
  if (page > totalPages) page = totalPages;
  const finalSkip = (page - 1) * finalPageSize;

  // ── Sort ──────────────────────────────────────────────────────────────
  const validRecSorts: Record<string, any> = {
    newest:        { startedAt: "desc" },
    oldest:        { startedAt: "asc" },
    "duration-high": { durationSeconds: "desc" },
    "duration-low":  { durationSeconds: "asc" },
    "size-high":     { bytesReceived: "desc" },
    "size-low":      { bytesReceived: "asc" },
  };
  const recOrderBy = validRecSorts[sortParam ?? "newest"] ?? { startedAt: "desc" };

  try {
    if (!dbError) {
      recordings = await prisma.recording.findMany({
        where:   Object.keys(whereClause).length > 0 ? whereClause : undefined,
        orderBy: recOrderBy,
        skip:    finalSkip,
        take:    finalPageSize,
        select: {
          id:              true,
          localPath:       true,
          startedAt:       true,
          endedAt:         true,
          durationSeconds: true,
          bytesReceived:   true,
          format:          true,
          presenter: {
            select: {
              name:     true,
              username: true,
            },
          },
          presenterNameSnapshot:     true,
          presenterUsernameSnapshot: true,
          stationNameSnapshot:       true,
          presenterDeleted:          true,
          stationDeleted:            true,
        },
      });
    }
  } catch (err) {
    console.error("[AdminRecordings] recordings query failed:", (err as Error).message);
    dbError = true;
  }

  // Label for the active filter
  const activeIdsStr = activeIds.join(",");
  const activeStationIdsStr = activeStationIds.join(",");

  const buildUrl = (p: number) => {
    const params = new URLSearchParams();
    if (activeIds.length > 0) params.set("presenterIds", activeIdsStr);
    if (activeStationIds.length > 0) params.set("stationIds", activeStationIdsStr);
    if (q) params.set("q", q);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (presenterModeParam && presenterModeParam !== "all") params.set("presenterMode", presenterModeParam);
    if (fileTypeParam && fileTypeParam !== "all") params.set("fileType", fileTypeParam);
    if (sortParam && sortParam !== "newest") params.set("sort", sortParam);
    params.set("page", p.toString());
    if (finalPageSize !== 20) params.set("pageSize", finalPageSize.toString());
    return `/admin/recordings?${params.toString()}`;
  };

  const renderPagination = () => (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-neutral-900 border border-neutral-800 rounded-2xl p-4 my-6 gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <div className="text-sm text-neutral-400">
          {t("pageOf", { page, totalPages })}
        </div>
        <div className="text-xs text-neutral-500">
          {t("totalRecs", { total: totalCount })}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 flex-wrap">
        <form method="get" className="flex items-center gap-2 bg-neutral-800/50 p-1.5 rounded-lg border border-neutral-700/50">
          {activeIds.length > 0 && <input type="hidden" name="presenterIds" value={activeIdsStr} />}
          {activeStationIds.length > 0 && <input type="hidden" name="stationIds" value={activeStationIdsStr} />}
          {q && <input type="hidden" name="q" value={q} />}
          {dateFrom && <input type="hidden" name="dateFrom" value={dateFrom} />}
          {dateTo && <input type="hidden" name="dateTo" value={dateTo} />}
          <label htmlFor="pageSize" className={`text-xs font-medium text-neutral-400 ${dir === "rtl" ? "ml-1" : "mr-1"}`}>{t("resultsPerPage")}</label>
          <select
            id="pageSize"
            name="pageSize"
            defaultValue={finalPageSize}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-md px-2 py-1 outline-none transition-colors focus:border-[var(--eg-primary)]"
            style={{ borderColor: "var(--eg-border)" }}
          >
            <option value="20">20</option>
            <option value="40">40</option>
            <option value="60">60</option>
            <option value="80">80</option>
            <option value="100">100</option>
          </select>
          <button type="submit" className={`px-2 py-1 text-white text-xs font-medium border rounded-md transition-colors shadow-sm ${dir === "rtl" ? "mr-1" : "ml-1"}`}
            style={{ background: "var(--eg-primary)", borderColor: "var(--eg-primary)", boxShadow: "0 1px 4px color-mix(in srgb, var(--eg-primary) 25%, transparent)" }}
          >{t("apply")}</button>
        </form>

        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link href={buildUrl(page - 1)} className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium rounded-lg border border-neutral-700 transition-colors">{t("prev")}</Link>
          ) : (
            <span className="px-4 py-1.5 bg-neutral-800/30 text-neutral-600 text-xs font-medium rounded-lg border border-neutral-800/50 cursor-not-allowed">{t("prev")}</span>
          )}
          {page < totalPages ? (
            <Link href={buildUrl(page + 1)} className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium rounded-lg border border-neutral-700 transition-colors">{t("next")}</Link>
          ) : (
            <span className="px-4 py-1.5 bg-neutral-800/30 text-neutral-600 text-xs font-medium rounded-lg border border-neutral-800/50 cursor-not-allowed">{t("next")}</span>
          )}
        </div>
      </div>
    </div>
  );

  // ── 5. Render ─────────────────────────────────────────────────────────────
  return (
    <div dir={dir}>
      <AdminPageShell maxWidth="max-w-5xl" padding="p-8">
        <div className="space-y-8">

          {/* ── Header ── */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1
                className="text-3xl font-bold bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(to left, var(--eg-primary), var(--eg-accent))" }}
              >
                {t("titleMain")}
              </h1>
              <p className="text-sm text-neutral-500 mt-1">
                {t("subtitle")}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Count badge */}
              {!dbError && (
                <StatusBadge
                  label={
                    recordings.length === 1 ? t("oneRecording") : t("recordingsCount", { count: recordings.length })
                  }
                  variant="info"
                  dot
                />
              )}
              <LanguageSwitcher compact />
              <Link
                href="/admin"
                className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-neutral-800 text-sm rounded-lg transition-colors whitespace-nowrap"
              >
                {t("dashboard")}
              </Link>
            </div>
          </div>

          {/* ── Filter Grid ── */}
          <AdminRecordingsTypeSortFilter
            initialPresenterMode={presenterModeParam || "all"}
            initialFileType={fileTypeParam || "all"}
            initialSort={sortParam || "newest"}
            pageSize={finalPageSize}
          />
          <div className="flex flex-col sm:flex-row items-stretch gap-3">
            {/* ── Compact dropdown filters ── */}
            <div className="flex gap-2 flex-shrink-0">
              <AdminRecordingsPresenterFilter
                allPresenters={allPresenters}
                initialSelectedIds={activeIds}
                pageSize={finalPageSize}
              />
              <AdminRecordingsStationFilter
                allStations={allStations}
                initialSelectedIds={activeStationIds}
                pageSize={finalPageSize}
              />
            </div>

            {/* ── Date / search ── */}
            <div className="flex-1 min-w-0">
              <AdminRecordingsDateSearchFilter
                initialQ={q}
                initialDateFrom={dateFrom}
                initialDateTo={dateTo}
                pageSize={finalPageSize}
              />
            </div>
          </div>

          {/* ── DB error ── */}
          {dbError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-center">
              <p className="text-red-400 font-medium">
                {t("loadError")}
              </p>
            </div>
          )}

          {/* ── Empty state ── */}
          {!dbError && recordings.length === 0 && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
              <EmptyState
                icon="🎤"
                title={
                  (activeIds.length > 0 || activeStationIds.length > 0 || q || dateFrom || dateTo)
                    ? t("noMatchTitle")
                    : t("noRecsTitle")
                }
                description={
                  (activeIds.length > 0 || activeStationIds.length > 0 || q || dateFrom || dateTo)
                    ? t("noMatchDesc")
                    : t("noRecsDesc")
                }
                action={
                  (activeIds.length > 0 || activeStationIds.length > 0 || q || dateFrom || dateTo) ? (
                    <Link
                      href={`/admin/recordings?pageSize=${finalPageSize}`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 border border-neutral-700 text-sm rounded-lg transition-colors"
                    >
                      {t("viewAll")}
                    </Link>
                  ) : undefined
                }
              />
            </div>
          )}

          {/* ── Recordings list ── */}
          {!dbError && recordings.length > 0 && (
            <>
              {renderPagination()}
              <div id="recordings-list" className="space-y-4 scroll-mt-20">
              {recordings.map((rec) => {
                const playUrl     = recordingPlayUrl(rec.localPath);
                const downloadUrl = recordingDownloadUrl(rec.localPath);
                const mimeType    = recordingMimeType(rec.localPath);

                const localeId = locale === "ar" ? "ar-EG" : "en-US";
                // Inline helpers for this page's date formatting
                const dateStr = new Intl.DateTimeFormat(localeId, { timeZone: "Africa/Cairo", weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(rec.startedAt);
                const timeStr = new Intl.DateTimeFormat(localeId, { timeZone: "Africa/Cairo", hour: "numeric", minute: "2-digit" }).format(rec.startedAt);
                const endStr  = rec.endedAt ? new Intl.DateTimeFormat(localeId, { timeZone: "Africa/Cairo", hour: "numeric", minute: "2-digit" }).format(rec.endedAt) : null;
                const dur     = rec.durationSeconds != null ? formatDuration(rec.durationSeconds, t) : null;
                const size    = rec.bytesReceived != null ? formatBytes(rec.bytesReceived, t) : null;

                return (
                  <article
                    key={rec.id}
                    className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-lg hover:border-neutral-700 transition-colors group"
                  >
                    {/* Top accent */}
                    <div
                      className="h-0.5 w-full transition-colors"
                      style={{ background: "linear-gradient(to left, transparent, color-mix(in srgb, var(--eg-primary) 40%, transparent), transparent)" }}
                    />

                    <div className="p-5">
                      {/* Presenter + date row */}
                      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                        <div className="flex-1 min-w-0">
                          {/* Presenter badge */}
                          <div className={`inline-flex items-center gap-2 px-3 py-1 bg-neutral-800 border border-neutral-700 rounded-lg mb-2 ${dir === "rtl" ? "ml-2" : "mr-2"}`}>
                            <div
                              className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 border"
                              style={{ background: "color-mix(in srgb, var(--eg-primary) 25%, transparent)", borderColor: "color-mix(in srgb, var(--eg-primary) 35%, transparent)" }}
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="w-3 h-3"
                                style={{ color: "var(--eg-primary)" }}
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                              </svg>
                            </div>
                            <span className="text-sm font-medium text-neutral-200 truncate">
                              {rec.presenter?.name ?? rec.presenter?.username ?? rec.presenterNameSnapshot ?? rec.presenterUsernameSnapshot ?? "—"}
                              {rec.presenterDeleted && (
                                <StatusBadge label={t("deletedPresenter")} variant="danger" className={`${dir === "rtl" ? "mr-1.5" : "ml-1.5"} align-middle`} />
                              )}
                            </span>
                            <span className="text-xs text-neutral-500 font-mono hidden sm:inline">
                              @{rec.presenter?.username ?? rec.presenterUsernameSnapshot ?? "—"}
                            </span>
                          </div>

                          {/* Station badge */}
                          {rec.stationNameSnapshot ? (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-teal-900/30 border border-teal-700/40 rounded-lg mb-2 mr-2">
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-teal-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                                <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                              </svg>
                              <span className="text-xs font-medium text-teal-300">
                                {rec.stationNameSnapshot}
                                {rec.stationDeleted && (
                                  <StatusBadge label={t("deletedStation")} variant="danger" className={`${dir === "rtl" ? "mr-1.5" : "ml-1.5"} align-middle`} />
                                )}
                              </span>
                            </div>
                          ) : (
                            <div
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg mb-2 mr-2 border"
                              style={{ background: "color-mix(in srgb, var(--eg-accent) 10%, transparent)", borderColor: "color-mix(in srgb, var(--eg-accent) 25%, transparent)" }}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 flex-shrink-0" style={{ color: "var(--eg-accent)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="2" />
                                <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
                              </svg>
                              <span className="text-xs font-medium" style={{ color: "var(--eg-accent)" }}>{t("liveDj")}</span>
                            </div>
                          )}

                          {/* Date + meta */}
                          <p className="text-sm font-semibold text-neutral-200 mb-0.5">
                            {dateStr}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-neutral-500 flex-wrap">
                            <span>{timeStr}</span>
                            {endStr && (
                              <>
                                <span className="text-neutral-700">—</span>
                                <span>{endStr}</span>
                              </>
                            )}
                            {dur && (
                              <>
                                <span className="text-neutral-700">•</span>
                                <span className="font-medium" style={{ color: "var(--eg-accent)" }}>{dur}</span>
                              </>
                            )}
                            {size && (
                              <>
                                <span className="text-neutral-700">•</span>
                                <span>{size}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Filename badge */}
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 bg-neutral-800 border border-neutral-700 rounded-lg text-xs text-neutral-400 font-mono max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap flex-shrink-0`}
                          title={rec.localPath}
                          dir="ltr"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="w-3 h-3 text-neutral-500 flex-shrink-0"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                            <polyline points="13 2 13 9 20 9" />
                          </svg>
                          {rec.localPath}
                        </span>
                      </div>

                      {/* Audio player */}
                      <div className="mb-4">
                        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                        <audio
                          controls
                          preload="none"
                          className="w-full h-10 rounded-lg"
                          style={{ colorScheme: "dark" }}
                        >
                          <source src={playUrl} type={mimeType} />
                          {t("audioNotSupported")}
                        </audio>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <a
                          href={downloadUrl}
                          download={rec.localPath}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-white text-xs font-semibold rounded-lg transition-colors shadow-md"
                          style={{ background: "var(--eg-primary)", boxShadow: "0 4px 10px color-mix(in srgb, var(--eg-primary) 25%, transparent)" }}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="w-3.5 h-3.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                          {t("download")}
                        </a>
                        <a
                          href={playUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-medium border border-neutral-700 rounded-lg transition-colors"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="w-3.5 h-3.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                          {t("openNewTab")}
                        </a>

                        {/* Quick filter link — only shown when not already filtered */}
                        {(activeIds.length === 0 && activeStationIds.length === 0 && !q && !dateFrom && !dateTo) && (
                          <Link
                            href={`/admin/recordings?presenterIds=${rec.presenter?.username ? allPresenters.find(p => p.username === rec.presenter?.username)?.id ?? "" : ""}&pageSize=${finalPageSize}`}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-500 hover:text-neutral-300 text-xs border border-neutral-700 rounded-lg transition-colors"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="w-3 h-3"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <line x1="4" y1="6" x2="20" y2="6" />
                              <line x1="8" y1="12" x2="16" y2="12" />
                              <line x1="11" y1="18" x2="13" y2="18" />
                            </svg>
                            {t("theirRecsOnly")}
                          </Link>
                        )}

                        {/* Delete recording */}
                        <DeleteRecordingButton recordingId={rec.id} />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            {renderPagination()}
            </>
          )}

        </div>{/* end space-y-8 */}
      </AdminPageShell>
    </div>
  );
}
