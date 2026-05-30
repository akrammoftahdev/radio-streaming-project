import { auth, prisma } from "@/auth";
import Link             from "next/link";
import { redirect }     from "next/navigation";
import { AdminPresentersFilter } from "./presenters-filter";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState }  from "@/components/ui/EmptyState";
import { AdminPageShell } from "@/components/ui";
import { togglePresenterActive } from "./actions";
import { getTranslations, getLocale } from "next-intl/server";
import { getSystemSettings } from "@/lib/system-settings";
import { DATE_LOCALES, type Locale } from "@/i18n/config";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const settings = await getSystemSettings();
  const t = await getTranslations('admin.presenters');
  return { title: t('metaTitle', { name: settings.systemName || "EGONAIR" }) };
}

export default async function PresentersPage({
  searchParams,
}: {
  searchParams: Promise<{ stationIds?: string; stationId?: string; mode?: string; q?: string; status?: string; page?: string; pageSize?: string; sort?: string; validity?: string }>;
}) {
  const session = await auth();

  if (!session || (session.user as any).role !== "ADMIN") {
    redirect("/login");
  }

  const t = await getTranslations('admin.presenters');
  const tCommon = await getTranslations('common');
  const locale = await getLocale();
  const dateLocale = DATE_LOCALES[locale as Locale] || locale;

  const {
    stationIds: stationIdsParam,
    stationId: legacyStationId,  // backward-compat: old single-select URL
    mode: filterMode, q: filterQ, status: filterStatus,
    page: pageParam, pageSize: pageSizeParam, sort: sortParam, validity: validityParam,
  } = await searchParams;

  // Parse multi-select station filter (comma-separated).
  // Fall back to legacy stationId if new param is absent.
  const rawStationParam = stationIdsParam || legacyStationId || "";
  const filterStationIds: string[] = rawStationParam
    ? rawStationParam.split(",").map(s => s.trim()).filter(Boolean)
    : [];

  const validPageSizes = [20, 40, 60, 80, 100];
  const parsedPageSize = parseInt(pageSizeParam || "20", 10);
  const finalPageSize = validPageSizes.includes(parsedPageSize) ? parsedPageSize : 20;

  let page = parseInt(pageParam || "1", 10);
  if (isNaN(page) || page < 1) page = 1;

  const q = filterQ && filterQ.trim() !== "" ? filterQ.trim() : "";

  // ── Fetch all active stations for the filter dropdown ─────────────────────
  const allStations = await prisma.station.findMany({
    where:   { isActive: true },
    orderBy: { name: "asc" },
    select:  { id: true, name: true },
  });

  // ── Build presenter query ─────────────────────────────────────────────────
  // When a station filter is active, we scope to presenters assigned to it.
  // "unassigned" (stationId === "none") returns presenters with no PresenterStation rows.
  const presenterWhere: Record<string, any> = { role: "PRESENTER" };

  // ── Build station filter ─────────────────────────────────────────────────
  // Supports: real station IDs, "none" (unassigned), or both (OR logic).
  if (filterStationIds.length > 0) {
    const realIds = filterStationIds.filter(id => id !== "none");
    const includeNone = filterStationIds.includes("none");

    if (includeNone && realIds.length > 0) {
      // OR: linked to any selected station  OR  no station link
      presenterWhere.OR = [
        { presenterStations: { some:  { stationId: { in: realIds }, isActive: true } } },
        { presenterStations: { none:  {} } },
      ];
    } else if (includeNone) {
      presenterWhere.presenterStations = { none: {} };
    } else {
      presenterWhere.presenterStations = { some: { stationId: { in: realIds }, isActive: true } };
    }
  }

  if (filterMode && ["SINGLE_STATION", "MULTI_STATION", "DIRECT_DJ"].includes(filterMode)) {
    presenterWhere.presenterMode = filterMode;
  }

  if (filterStatus === "active") {
    presenterWhere.isActive = true;
  } else if (filterStatus === "inactive") {
    presenterWhere.isActive = false;
  }

  if (q) {
    presenterWhere.OR = [
      { name: { contains: q } },
      { username: { contains: q } },
      { email: { contains: q } },
      { phone: { contains: q } },
    ];
  }

  // ── Validity filter ──────────────────────────────────────────────────────────
  if (validityParam && validityParam !== "all") {
    const now = new Date();
    if (validityParam === "valid") {
      presenterWhere.validity = { validFrom: { lte: now }, validTo: { gte: now } };
    } else if (validityParam === "expired") {
      presenterWhere.validity = { validTo: { lt: now } };
    } else if (validityParam === "expiring") {
      const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      presenterWhere.validity = { validTo: { gte: now, lte: sevenDaysLater } };
    } else if (validityParam === "none") {
      presenterWhere.validity = null;
    }
  }

  const totalCount = await prisma.user.count({ where: presenterWhere });
  
  const totalPages = Math.max(1, Math.ceil(totalCount / finalPageSize));
  if (page > totalPages) page = totalPages;
  const finalSkip = (page - 1) * finalPageSize;

  const validSorts: Record<string, any> = {
    newest:   { createdAt: "desc" },
    oldest:   { createdAt: "asc" },
    name:     { name: "asc" },
    username: { username: "asc" },
  };
  const orderBy = validSorts[sortParam ?? "newest"] ?? { createdAt: "desc" };

  const presenters = await prisma.user.findMany({
    where:   presenterWhere,
    orderBy,
    skip:    finalSkip,
    take:    finalPageSize,
    select: {
      id: true,
      name: true,
      username: true,
      isActive: true,
      canBroadcast: true,
      presenterMode: true,
      createdAt: true,
      validity: {
        select: { validFrom: true, validTo: true },
      },
      presenterStations: {
        where:   { isActive: true },
        select:  { station: { select: { id: true, name: true, slug: true } } },
      },
    },
  });

  // Filter label for header — show first selected station name(s)
  const selectedStationNames = filterStationIds
    .map(id => id === "none" ? t('notLinkedToStation') : allStations.find(s => s.id === id)?.name)
    .filter(Boolean) as string[];
  const filterLabel = selectedStationNames.length > 0 ? selectedStationNames.join(" · ") : null;

  const buildUrl = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (filterMode && filterMode !== "all") params.set("mode", filterMode);
    if (filterStationIds.length > 0) params.set("stationIds", filterStationIds.join(","));
    if (filterStatus && filterStatus !== "all") params.set("status", filterStatus);
    if (sortParam && sortParam !== "newest") params.set("sort", sortParam);
    if (validityParam && validityParam !== "all") params.set("validity", validityParam);
    params.set("page", p.toString());
    if (finalPageSize !== 20) params.set("pageSize", finalPageSize.toString());
    return `/admin/presenters?${params.toString()}`;
  };

  const renderPagination = () => (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-2 border-t border-neutral-800">
      <span className="text-xs text-neutral-500">
        {t('pageOf', { page, totalPages })}
        {" "}· {presenters.length > 0 ? t('showingRange', { start: finalSkip + 1, end: finalSkip + presenters.length, total: totalCount }) : t('showingZero', { total: totalCount })}
      </span>
      <div className="flex items-center gap-2 flex-wrap">
        <form method="get" className="flex items-center gap-1.5">
          {q && <input type="hidden" name="q" value={q} />}
          {filterMode && filterMode !== "all" && <input type="hidden" name="mode" value={filterMode} />}
          {filterStationIds.length > 0 && <input type="hidden" name="stationIds" value={filterStationIds.join(",")} />}
          {filterStatus && filterStatus !== "all" && <input type="hidden" name="status" value={filterStatus} />}
          <label htmlFor="pageSize" className="text-xs text-neutral-500">{t('resultsCount')}</label>
          <select id="pageSize" name="pageSize" defaultValue={finalPageSize}
            className="bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs rounded-lg px-2 py-1 outline-none focus:border-indigo-500">
            <option value="20">20</option>
            <option value="40">40</option>
            <option value="60">60</option>
            <option value="80">80</option>
            <option value="100">100</option>
          </select>
          <button type="submit" className="px-2.5 py-1 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 text-xs font-medium rounded-lg border border-neutral-600 transition-colors">{tCommon('apply')}</button>
        </form>
        {page > 1
          ? <Link href={buildUrl(page - 1)} className="px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium rounded-lg border border-neutral-700 transition-colors">{t('previous')}</Link>
          : <span className="px-3 py-1 text-neutral-600 text-xs rounded-lg border border-neutral-800/50 cursor-not-allowed">{t('previous')}</span>}
        {page < totalPages
          ? <Link href={buildUrl(page + 1)} className="px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium rounded-lg border border-neutral-700 transition-colors">{t('next')}</Link>
          : <span className="px-3 py-1 text-neutral-600 text-xs rounded-lg border border-neutral-800/50 cursor-not-allowed">{t('next')}</span>}
      </div>
    </div>
  );

  return (
    <AdminPageShell maxWidth="max-w-6xl" padding="p-8">
      <div className="space-y-8">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h1
              className="text-3xl font-bold bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(to left, var(--eg-primary), var(--eg-accent))" }}
            >
              {t('title')}
            </h1>
            {filterLabel && (
              <p className="text-sm mt-1" style={{ color: "var(--eg-primary)" }}>
                {t('filterLabel')} <span className="font-medium">{filterLabel}</span>
                {" · "}
                <Link href="/admin/presenters" className="text-neutral-500 hover:text-neutral-300 transition-colors">
                  {t('clearFilter')}
                </Link>
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="px-4 py-2 text-sm bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-neutral-800 rounded-lg transition-colors"
            >
              {t('backToDashboard')}
            </Link>
            <Link
              href="/admin/presenters/new"
              className="px-6 py-2.5 text-white font-medium rounded-lg transition-colors shadow-lg"
              style={{ background: "var(--eg-primary)", boxShadow: "0 4px 14px color-mix(in srgb, var(--eg-primary) 25%, transparent)" }}
            >
              {t('addPresenter')}
            </Link>
          </div>
        </div>

        {/* ── Filter Component ── */}
        <AdminPresentersFilter
          initialQ={q}
          initialMode={filterMode || "all"}
          initialStationIds={filterStationIds}
          initialStatus={filterStatus || "all"}
          initialSort={sortParam || "newest"}
          initialValidity={validityParam || "all"}
          allStations={allStations}
          pageSize={finalPageSize}
        />

        {/* ── Presenters list ── */}
        {renderPagination()}

        {presenters.length === 0 ? (
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
            <EmptyState
              icon="👥"
              title={
                q || filterStationIds.length > 0 || (filterMode && filterMode !== "all") || (filterStatus && filterStatus !== "all")
                  ? t('noMatchingPresenters')
                  : t('noPresenters')
              }
              description={
                q || filterStationIds.length > 0 || (filterMode && filterMode !== "all") || (filterStatus && filterStatus !== "all")
                  ? t('tryAdjustFilters')
                  : t('addFirstPresenter')
              }
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {presenters.map((presenter) => {
              const isExpired = presenter.validity?.validTo
                && new Date(presenter.validity.validTo) < new Date();
              return (
                <div key={presenter.id}
                  className="bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-2xl p-5 flex flex-col gap-3 shadow-sm transition-colors">

                  {/* Name + username */}
                  <div>
                    <p className="font-semibold text-neutral-100 leading-snug">
                      {presenter.name || "—"}
                    </p>
                    <p className="font-mono text-xs text-neutral-500 mt-0.5">
                      @{presenter.username}
                    </p>
                  </div>

                  {/* Status badges row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge
                      label={presenter.isActive ? t('isActive') : t('isInactive')}
                      variant={presenter.isActive ? "success" : "danger"}
                      dot
                    />
                    <StatusBadge
                      label={presenter.canBroadcast ? t('broadcastAllowed') : t('broadcastStopped')}
                      variant={presenter.canBroadcast ? "info" : "neutral"}
                    />
                    <StatusBadge
                      label={
                        presenter.presenterMode === "DIRECT_DJ"
                          ? t('directDjLabel')
                          : presenter.presenterMode === "MULTI_STATION"
                          ? t('multiStationBadgeShort')
                          : t('singleStationBadgeShort')
                      }
                      variant={presenter.presenterMode === "DIRECT_DJ" ? "warning" : "info"}
                    />
                  </div>

                  {/* Stations */}
                  <div>
                    {presenter.presenterStations.length === 0 ? (
                      <span className="text-xs text-neutral-600 italic">{t('notLinkedToStation')}</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {presenter.presenterStations.map(({ station }) => (
                          <span key={station.id}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                            📡 {station.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Validity */}
                  {(presenter.validity?.validFrom || presenter.validity?.validTo) && (
                    <div className="text-[11px] text-neutral-500 space-y-0.5 border-t border-neutral-800 pt-2" dir="ltr">
                      {presenter.validity?.validFrom && (
                        <p>{t('validFrom')}: <span className="text-neutral-400">{new Date(presenter.validity.validFrom).toLocaleDateString(dateLocale)}</span></p>
                      )}
                      {presenter.validity?.validTo && (
                        <p>{t('validTo')}: <span className={isExpired ? "text-red-400 font-medium" : "text-neutral-400"}>
                          {new Date(presenter.validity.validTo).toLocaleDateString(dateLocale)}
                          {isExpired && " ⚠️"}
                        </span></p>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="pt-1 border-t border-neutral-800 flex items-center gap-2 flex-wrap">
                    <Link href={`/admin/presenters/${presenter.id}/edit`}
                      className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border"
                      style={{ color: "var(--eg-primary)", background: "color-mix(in srgb, var(--eg-primary) 10%, transparent)", borderColor: "color-mix(in srgb, var(--eg-primary) 20%, transparent)" }}>
                      {tCommon('edit')}
                    </Link>
                    <form action={togglePresenterActive} className="inline">
                      <input type="hidden" name="presenterId"    value={presenter.id} />
                      <input type="hidden" name="currentIsActive" value={String(presenter.isActive)} />
                      <button type="submit"
                        className={`inline-flex items-center px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors ${
                          presenter.isActive
                            ? "text-amber-400 bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20"
                            : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20"
                        }`}>
                        {presenter.isActive ? t('disable') : t('enable')}
                      </button>
                    </form>
                    <Link href={`/admin/presenters/${presenter.id}/delete`}
                      className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg transition-colors">
                      {tCommon('delete')}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {renderPagination()}


      </div>{/* end space-y-8 */}
    </AdminPageShell>
  );
}
