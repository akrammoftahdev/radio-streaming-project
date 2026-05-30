import { auth, prisma } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState }  from "@/components/ui/EmptyState";
import { createProgram } from "./actions";
import { ProgramCard } from "./program-card";
import type { ProgramRowClient, ScheduleRule, ScheduleSlot } from "./program-card";
import { SMStationFilter } from "@/components/sm-station-filter";
import { SMSearchBar } from "@/components/sm-search-bar";
import { Unauthorized } from "@/components/ui/Unauthorized";
import { getTranslations, getLocale } from "next-intl/server";
import { isRtl } from "@/i18n/config";

export const dynamic = "force-dynamic";

async function getScope(managerId: string) {
  const assignments = await prisma.stationManagerAssignment.findMany({
    where: { managerId, isActive: true },
    include: { station: { select: { id: true, name: true } } },
  });
  return {
    stations: assignments.map((a) => ({ id: a.station.id, name: a.station.name })),
    stationIds: assignments.map((a) => a.stationId),
  };
}

export default async function SMProgramsPage({
  searchParams,
}: { searchParams?: Promise<Record<string, string | undefined>> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = (session.user as any)?.role as string;
  if (role !== "STATION_MANAGER") return <Unauthorized role={role} />;

  const t = await getTranslations("stationManager.programs");
  const tDash = await getTranslations("stationManager.dashboard");
  const locale = await getLocale();
  const dir = isRtl(locale) ? "rtl" : "ltr";

  const managerId   = (session.user as any)?.id as string;
  const managerName = session.user.name ?? session.user.email ?? tDash("defaultRole");
  const { stations, stationIds } = await getScope(managerId);

  const sp = await searchParams;
  const spError       = sp?.error;
  const spSuccess     = sp?.success;
  const filterStation = sp?.station ?? "";
  const filterStatus  = sp?.status  ?? "all";
  const q             = sp?.q ?? "";

  let programs: ProgramRowClient[] = [];
  let presentersForCreate: { id: string; name: string | null; username: string }[] = [];

  if (stationIds.length > 0) {
    const queryStationIds = filterStation
        ? filterStation.split(",").filter((id: string) => stationIds.includes(id))
        : [];
      const effectiveIds = queryStationIds.length > 0 ? queryStationIds : stationIds;

    const isActiveFilter: boolean | undefined =
      filterStatus === "active"   ? true  :
      filterStatus === "inactive" ? false :
      undefined;

    const [rawPrograms, psRows] = await Promise.all([
      prisma.program.findMany({
        where: {
          stationId: { in: effectiveIds },
          ...(isActiveFilter !== undefined ? { isActive: isActiveFilter } : {}),
          ...(q.trim() ? { title: { contains: q } } : {}),
        },
        include: {
          presenter: { select: { id: true, name: true, username: true, presenterMode: true } },
          station:   { select: { id: true, name: true } },
          scheduleRules: {
            where: { isActive: true },
            include: {
              slots: {
                select: {
                  id: true, startTime: true, endTime: true,
                  dayOfWeek: true, slotDate: true, isActive: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.presenterStation.findMany({
        where: { stationId: { in: stationIds }, isActive: true },
        include: { presenter: { select: { id: true, name: true, username: true, presenterMode: true } } },
      }),
    ]);

    programs = (rawPrograms as any[]).map((p: any): ProgramRowClient => ({
      id: p.id,
      title: p.title,
      description: (p as any).description ?? null,
      isActive: p.isActive,
      stationId: p.stationId,
      stationName: p.station.name,
      presenterName: p.presenter.name ?? p.presenter.username,
      scheduleRules: p.scheduleRules.map((r: any): ScheduleRule => ({
        id: r.id,
        recurrenceType: r.recurrenceType,
        timezone: r.timezone ?? "Africa/Cairo",
        allowConnectMinutesBefore: r.allowConnectMinutesBefore ?? 5,
        isActive: r.isActive ?? true,
        slots: r.slots.map((s: any): ScheduleSlot => ({
          id: s.id, startTime: s.startTime, endTime: s.endTime,
          dayOfWeek: s.dayOfWeek ?? null, slotDate: s.slotDate ?? null,
          isActive: s.isActive ?? true,
        })),
      })),
    }));

    const seen = new Set<string>();
    for (const ps of psRows) {
      if (ps.presenter.presenterMode === "DIRECT_DJ") continue;
      if (!seen.has(ps.presenter.id)) {
        seen.add(ps.presenter.id);
        presentersForCreate.push({ id: ps.presenter.id, name: ps.presenter.name, username: ps.presenter.username });
      }
    }
  }

  const STATUS_OPTIONS = [
    { value: "all",      label: t("statusAll")      },
    { value: "active",   label: t("statusActive")   },
    { value: "inactive", label: t("statusInactive") },
  ];

  return (
    <div dir={dir} className="min-h-screen bg-slate-950 text-slate-100">

      <header className="bg-slate-900 border-b border-slate-800 shadow-lg sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/station-manager" className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-slate-100 transition-colors">←</Link>
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shadow"
              style={{ background: "linear-gradient(to bottom right, var(--eg-accent), var(--eg-primary))" }}
            >📺</div>
            <div>
              <h1 className="text-base font-bold text-slate-100 leading-tight">{t("pageTitle")}</h1>
              <p className="text-xs text-slate-500">{managerName}</p>
            </div>
          </div>
          <Link href="/station-manager" className="text-xs text-slate-400 hover:text-teal-300 border border-slate-700 hover:border-teal-600/50 rounded-lg px-3 py-2 transition-colors">{tDash("backToDashboard")}</Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {spError   && <div className="bg-red-950/50 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 text-sm">⚠️ {spError}</div>}
        {spSuccess && <div className="bg-emerald-950/50 border border-emerald-500/30 text-emerald-400 rounded-xl px-4 py-3 text-sm">✅ {t("operationSuccess")}</div>}

        {stationIds.length === 0 && (
          <EmptyState icon="📭" title={t("noStationsAssigned")} description={t("noStationsDescription")} />
        )}

        {stationIds.length > 0 && (
          <>
            {/* Create program */}
            <section className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6">
              <h2 className="text-base font-bold text-slate-100 mb-4 flex items-center gap-2"><span>➕</span> {t("addNewProgram")}</h2>
              <form action={createProgramAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1">{t("programTitle")}</label>
                  <input name="title" type="text" required
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none transition-colors"
                    onFocus={e => { e.currentTarget.style.borderColor = "var(--eg-primary)"; }}
                    onBlur={e  => { e.currentTarget.style.borderColor = "var(--eg-border)"; }}
                    style={{ borderColor: "var(--eg-border)" }} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">{t("station")}</label>
                  <select name="stationId" required
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-slate-100 outline-none transition-colors"
                    onFocus={e => { e.currentTarget.style.borderColor = "var(--eg-primary)"; }}
                    onBlur={e  => { e.currentTarget.style.borderColor = "var(--eg-border)"; }}
                    style={{ borderColor: "var(--eg-border)" }}
                    defaultValue={stations.length === 1 ? stations[0].id : ""}>
                    {stations.length > 1 && <option value="">{t("selectStation")}</option>}
                    {stations.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">{t("presenter")}</label>
                  <select name="presenterId" required
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-slate-100 outline-none transition-colors"
                    onFocus={e => { e.currentTarget.style.borderColor = "var(--eg-primary)"; }}
                    onBlur={e  => { e.currentTarget.style.borderColor = "var(--eg-border)"; }}
                    style={{ borderColor: "var(--eg-border)" }}>
                    <option value="">{t("selectPresenter")}</option>
                    {presentersForCreate.map((p) => (
                      <option key={p.id} value={p.id}>{p.name ?? p.username}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <button type="submit"
                    className="text-white font-semibold text-sm rounded-xl px-6 py-2.5 transition-colors"
                    style={{ background: "var(--eg-primary)" }}>
                    {t("createProgram")}
                  </button>
                </div>
              </form>
            </section>

            {/* ── Filter bar ── */}
            <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
              {/* Station dropdown — only for multi-station managers */}
              {stations.length > 1 && (
                <SMStationFilter
                  stations={stations}
                  paramKey="station"
                  accent="purple"
                  allLabel={t("allStations")}
                />
              )}

              {/* Status segmented control */}
              <div className="flex bg-slate-900 border border-slate-700 rounded-xl p-1 gap-1 flex-shrink-0">
                {STATUS_OPTIONS.map(opt => {
                  const isSel = filterStatus === opt.value;
                  const buildHref = () => {
                    const p = new URLSearchParams();
                    if (filterStation) p.set("station", filterStation);
                    if (q)             p.set("q", q);
                    if (opt.value !== "all") p.set("status", opt.value);
                    return `?${p.toString()}`;
                  };
                  return (
                    <Link key={opt.value} href={buildHref()}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all border ${
                        isSel
                          ? ""
                          : "text-slate-400 border-transparent hover:border-slate-500"
                      }`}
                      style={isSel ? { color: "var(--eg-primary)", borderColor: "color-mix(in srgb, var(--eg-primary) 40%, transparent)", background: "color-mix(in srgb, var(--eg-primary) 20%, transparent)" } : {}}>
                      {opt.label}
                    </Link>
                  );
                })}
              </div>

              {/* Search */}
              <SMSearchBar placeholder={t("searchPlaceholder")} paramKey="q" />
            </div>

            {/* Program list */}
            <section>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-4">
                {t("programCount", { count: programs.length })}
              </h2>
              {programs.length === 0
                ? <EmptyState icon="📺"
                    title={(filterStation || filterStatus !== "all" || q) ? t("noMatchingPrograms") : t("noProgramsYet")}
                    description={(filterStation || filterStatus !== "all" || q) ? t("adjustFilters") : t("programsWillAppear")}
                  />
                : <div className="space-y-4">
                    {programs.map((prog) => (
                      <ProgramCard key={prog.id} program={prog} managerId={managerId} />
                    ))}
                  </div>
              }
            </section>
          </>
        )}
      </main>
    </div>
  );
}

// ── Server action wrapper for create ──────────────────────────────────────────

async function createProgramAction(formData: FormData) {
  "use server";
  const { redirect: redir } = await import("next/navigation");
  const { createProgram: cp } = await import("./actions");
  const result = await cp(formData);
  if (result.error) redir(`/station-manager/programs?error=${encodeURIComponent(result.error)}`);
  else              redir("/station-manager/programs?success=1");
}
