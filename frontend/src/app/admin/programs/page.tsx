import { auth, prisma } from "@/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { toggleProgramActive, deleteProgram } from "./actions";
import ProgramCreateForm from "./program-create-form";
import { ProgramDeleteButton } from "./program-delete-button";
import { AdminProgramsFilter } from "./programs-filter";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminPageShell } from "@/components/ui";
import { getTranslations } from "next-intl/server";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("admin.programs");
  return { title: t("metaTitle", { name: "EGONAIR" }) };
}

// unused here (only in create/edit forms)

export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<{
    stationIds?: string;
    error?: string;
    q?: string;
    status?: string;
    sort?: string;
    hasSchedule?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  const session = await auth();
  if (!session || (session.user as any).role !== "ADMIN") redirect("/login");

  const t = await getTranslations("admin.programs");
  const tc = await getTranslations("common");

  const {
    stationIds: stationIdsParam,
    error: createError,
    q: qParam,
    status: statusParam,
    sort: sortParam,
    hasSchedule: hasScheduleParam,
    page: pageParam,
    pageSize: pageSizeParam,
  } = await searchParams;

  const filterStationIds = (stationIdsParam ?? "").split(",").filter(Boolean);

  // ── Pagination ──────────────────────────────────────────────────────────────
  const validPageSizes = [20, 40, 60, 80, 100];
  const parsedPageSize = parseInt(pageSizeParam || "20", 10);
  const finalPageSize  = validPageSizes.includes(parsedPageSize) ? parsedPageSize : 20;
  let page = parseInt(pageParam || "1", 10);
  if (isNaN(page) || page < 1) page = 1;

  const q = qParam && qParam.trim() !== "" ? qParam.trim() : "";

  // ── Where clause ────────────────────────────────────────────────────────────
  const programWhere: Record<string, any> = {};

  if (filterStationIds.length > 0) {
    programWhere.stationId = { in: filterStationIds };
  }

  if (statusParam === "active")   programWhere.isActive = true;
  if (statusParam === "inactive") programWhere.isActive = false;

  if (hasScheduleParam === "hasSchedule") programWhere.scheduleRules = { some: {} };
  if (hasScheduleParam === "noSchedule")  programWhere.scheduleRules = { none: {} };

  if (q) {
    programWhere.OR = [
      { title:       { contains: q } },
      { description: { contains: q } },
      { presenter:   { name:     { contains: q } } },
      { presenter:   { username: { contains: q } } },
    ];
  }

  // ── OrderBy ─────────────────────────────────────────────────────────────────
  const sortMap: Record<string, any> = {
    newest: { createdAt: "desc" },
    oldest: { createdAt: "asc" },
    title:  { title: "asc" },
  };
  const programOrderBy = sortMap[sortParam ?? "newest"] ?? { createdAt: "desc" };

  // ── Data fetching ────────────────────────────────────────────────────────────
  const where = Object.keys(programWhere).length > 0 ? programWhere : undefined;

  const totalCount = await prisma.program.count({ where });

  const totalPages = Math.max(1, Math.ceil(totalCount / finalPageSize));
  if (page > totalPages) page = totalPages;
  const finalSkip = (page - 1) * finalPageSize;

  const [allStations, allPresenters, programs, presenterStations] = await Promise.all([
    prisma.station.findMany({
      where:   { isActive: true },
      orderBy: { name: "asc" },
      select:  { id: true, name: true, slug: true },
    }),
    prisma.user.findMany({
      where:   { role: "PRESENTER", isActive: true, presenterMode: { not: "DIRECT_DJ" } },
      orderBy: { name: "asc" },
      select:  { id: true, name: true, username: true, presenterMode: true },
    }),
    prisma.program.findMany({
      where,
      orderBy: programOrderBy,
      skip:    finalSkip,
      take:    finalPageSize,
      include: {
        presenter: { select: { name: true, username: true } },
        station:   { select: { name: true, slug: true } },
        _count:    { select: { scheduleRules: true } },
      },
    }),
    prisma.presenterStation.findMany({
      where:  { isActive: true },
      select: { presenterId: true, stationId: true },
    }),
  ]);

  // Build lookup: stationId → Set<presenterId>
  const stationPresenterMap = new Map<string, Set<string>>();
  for (const ps of presenterStations) {
    if (!stationPresenterMap.has(ps.stationId)) stationPresenterMap.set(ps.stationId, new Set());
    stationPresenterMap.get(ps.stationId)!.add(ps.presenterId);
  }

  const stationPresenterMapJson: Record<string, string[]> = {};
  for (const [sid, pids] of stationPresenterMap.entries()) {
    stationPresenterMapJson[sid] = [...pids];
  }

  // ── URL builder for pagination ───────────────────────────────────────────────
  const buildUrl = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (filterStationIds.length > 0) params.set("stationIds", filterStationIds.join(","));
    if (statusParam && statusParam !== "all") params.set("status", statusParam);
    if (sortParam && sortParam !== "newest") params.set("sort", sortParam);
    if (hasScheduleParam && hasScheduleParam !== "all") params.set("hasSchedule", hasScheduleParam);
    params.set("page", p.toString());
    if (finalPageSize !== 20) params.set("pageSize", finalPageSize.toString());
    return `/admin/programs?${params.toString()}`;
  };

  const renderPagination = () => (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-neutral-900 border border-neutral-800 rounded-2xl p-4 my-6 gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <div className="text-sm text-neutral-400">
          {tc("page")} <span className="text-neutral-200 font-medium">{page}</span> {tc("of")} <span className="text-neutral-200 font-medium">{totalPages}</span>
        </div>
        <div className="text-xs text-neutral-500">
          {t("showingPrograms", { start: programs.length > 0 ? finalSkip + 1 : 0, end: finalSkip + programs.length, total: totalCount })}
        </div>
      </div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 flex-wrap">
        <form method="get" className="flex items-center gap-2 bg-neutral-800/50 p-1.5 rounded-lg border border-neutral-700/50">
          {q && <input type="hidden" name="q" value={q} />}
          {filterStationIds.length > 0 && <input type="hidden" name="stationIds" value={filterStationIds.join(",")} />}
          {statusParam && statusParam !== "all" && <input type="hidden" name="status" value={statusParam} />}
          {sortParam && sortParam !== "newest" && <input type="hidden" name="sort" value={sortParam} />}
          {hasScheduleParam && hasScheduleParam !== "all" && <input type="hidden" name="hasSchedule" value={hasScheduleParam} />}
          <label htmlFor="pageSize" className="text-xs font-medium text-neutral-400 mr-1">{tc("resultsCount") || "Count"}:</label>
          <select id="pageSize" name="pageSize" defaultValue={finalPageSize}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-md px-2 py-1 outline-none transition-colors">
            {[20, 40, 60, 80, 100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <button type="submit" className="px-2 py-1 text-white text-xs font-medium rounded-md transition-colors mr-1 border"
            style={{ background: "var(--eg-primary)", borderColor: "var(--eg-primary)" }}
          >{tc("apply") || "Apply"}</button>
        </form>
        <div className="flex items-center gap-2">
          {page > 1
            ? <Link href={buildUrl(page - 1)} className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium rounded-lg border border-neutral-700 transition-colors">{tc("previous") || "Prev"}</Link>
            : <span className="px-4 py-1.5 bg-neutral-800/30 text-neutral-600 text-xs font-medium rounded-lg border border-neutral-800/50 cursor-not-allowed">{tc("previous") || "Prev"}</span>
          }
          {page < totalPages
            ? <Link href={buildUrl(page + 1)} className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium rounded-lg border border-neutral-700 transition-colors">{tc("next") || "Next"}</Link>
            : <span className="px-4 py-1.5 bg-neutral-800/30 text-neutral-600 text-xs font-medium rounded-lg border border-neutral-800/50 cursor-not-allowed">{tc("next") || "Next"}</span>
          }
        </div>
      </div>
    </div>
  );

  return (
    <AdminPageShell maxWidth="max-w-6xl" padding="p-8">
      <div className="space-y-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1 text-sm">
              <Link href="/admin" className="text-slate-500 hover:text-slate-300 transition-colors">{tc("dashboard") || "Dashboard"}</Link>
              <span className="text-slate-700">/</span>
              <span className="text-slate-300">{t("title")}</span>
            </div>
            <h1
              className="text-3xl font-bold bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(to left, var(--eg-primary), var(--eg-accent))" }}
            >
              {t("title")}
            </h1>
            <p className="text-slate-400 text-sm mt-1">{t("subtitle")}</p>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher compact />
          </div>
        </div>

        {/* Filter component */}
        <AdminProgramsFilter
          initialQ={q}
          initialStationIds={filterStationIds}
          initialStatus={statusParam || "all"}
          initialSort={sortParam || "newest"}
          initialHasSchedule={hasScheduleParam || "all"}
          allStations={allStations}
          pageSize={finalPageSize}
        />

        {/* Create form */}
        <ProgramCreateForm
          stations={allStations}
          allPresenters={allPresenters}
          stationPresenterMap={stationPresenterMapJson}
          createError={createError}
        />

        {/* Programs list */}
        <section>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-4">
            {t("registeredPrograms")} ({totalCount})
          </h2>

          {programs.length > 0 && renderPagination()}

          {programs.length === 0 ? (
            <div className="bg-slate-800 border border-slate-700/50 rounded-2xl overflow-hidden">
              <EmptyState
                icon="📋"
                title={
                  (q || filterStationIds.length > 0 || (statusParam && statusParam !== "all") || (hasScheduleParam && hasScheduleParam !== "all"))
                    ? t("noProgramsMatch")
                    : t("noProgramsYet")
                }
                description={
                  (q || filterStationIds.length > 0 || (statusParam && statusParam !== "all") || (hasScheduleParam && hasScheduleParam !== "all"))
                    ? t("tryAdjustFilters")
                    : t("addFirstProgram")
                }
              />
            </div>
          ) : (
            <div className="bg-slate-800 border border-slate-700/50 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-900/60 border-b border-slate-700">
                      <th className="px-5 py-3.5 font-semibold text-slate-400">{t("table.program")}</th>
                      <th className="px-5 py-3.5 font-semibold text-slate-400">{t("table.presenter")}</th>
                      <th className="px-5 py-3.5 font-semibold text-slate-400">{t("table.station")}</th>
                      <th className="px-5 py-3.5 font-semibold text-slate-400">{t("table.schedules")}</th>
                      <th className="px-5 py-3.5 font-semibold text-slate-400">{t("table.status")}</th>
                      <th className="px-5 py-3.5 font-semibold text-slate-400 text-left">{t("table.actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {programs.map(prog => (
                      <tr key={prog.id} className="hover:bg-slate-700/20 transition-colors">
                        <td className="px-5 py-4">
                          <div className="font-medium text-slate-200">{prog.title}</div>
                          {prog.description && <div className="text-xs text-slate-500 mt-0.5">{prog.description}</div>}
                        </td>
                        <td className="px-5 py-4 text-slate-400">{prog.presenter.name || prog.presenter.username}</td>
                        <td className="px-5 py-4">
                          <span
                            className="font-mono text-xs px-2 py-0.5 rounded border"
                            style={{ color: "var(--eg-accent)", background: "color-mix(in srgb, var(--eg-accent) 10%, transparent)", borderColor: "color-mix(in srgb, var(--eg-accent) 20%, transparent)" }}
                          >{prog.station.slug}</span>
                        </td>
                        <td className="px-5 py-4 text-center text-slate-400">{prog._count.scheduleRules}</td>
                        <td className="px-5 py-4">
                          <StatusBadge
                            label={prog.isActive ? tc("active") : tc("inactive")}
                            variant={prog.isActive ? "success" : "neutral"}
                            dot
                          />
                        </td>
                        <td className="px-5 py-4 text-left">
                          <div className="flex items-center gap-2">
                            <Link href={`/admin/programs/${prog.id}/edit`}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border"
                              style={{ color: "var(--eg-primary)", background: "color-mix(in srgb, var(--eg-primary) 10%, transparent)", borderColor: "color-mix(in srgb, var(--eg-primary) 20%, transparent)" }}>
                              {tc("edit") || "Edit"}
                            </Link>
                            <form action={toggleProgramActive}>
                              <input type="hidden" name="programId"      value={prog.id} />
                              <input type="hidden" name="currentIsActive" value={String(prog.isActive)} />
                              <button type="submit"
                                className={`px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors ${prog.isActive ? "text-red-400 bg-red-500/10 border-red-500/20 hover:bg-red-500/20" : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20"}`}>
                                {prog.isActive ? tc("stop", { fallback: "Stop" }) : tc("activate", { fallback: "Activate" })}
                              </button>
                            </form>
                            <ProgramDeleteButton
                              programId={prog.id}
                              isActive={prog.isActive}
                              deleteAction={deleteProgram}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {programs.length > 0 && renderPagination()}
        </section>

      </div>{/* end space-y-8 */}
    </AdminPageShell>
  );
}
