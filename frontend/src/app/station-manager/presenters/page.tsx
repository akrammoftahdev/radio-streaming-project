import { auth, prisma } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState }  from "@/components/ui/EmptyState";
import { createPresenter } from "./actions";
import { PresenterCard } from "./presenter-card";
import type { PresenterRowClient } from "./presenter-card";
import { SMStationFilter } from "@/components/sm-station-filter";
import { SMSearchBar } from "@/components/sm-search-bar";
import { Unauthorized } from "@/components/ui/Unauthorized";
import { getTranslations, getLocale } from "next-intl/server";
import { isRtl } from "@/i18n/config";

export const dynamic = "force-dynamic";

interface StationOption { id: string; name: string }

async function fetchPageData(managerId: string, filterStationId: string, q: string) {
  const assignments = await prisma.stationManagerAssignment.findMany({
    where: { managerId, isActive: true },
    include: { station: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const stations: StationOption[] = assignments.map((a) => ({ id: a.station.id, name: a.station.name }));
  const stationIds = stations.map((s) => s.id);
  if (stationIds.length === 0) return { stations: [], presenters: [], assignedStationIds: [] };

  // If filterStationId has comma-separated IDs, scope to all valid selected stations
  const rawFilter = filterStationId;
  const selectedStationIds = rawFilter
    ? rawFilter.split(",").filter((id) => stationIds.includes(id))
    : [];
  const queryIds = selectedStationIds.length > 0 ? selectedStationIds : stationIds;

  const psRows = await prisma.presenterStation.findMany({
    where: {
      stationId: { in: queryIds },
      isActive: true,
    },
    include: {
      presenter: { select: { id: true, name: true, username: true, email: true, phone: true, presenterMode: true, isActive: true } },
      station: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const map = new Map<string, PresenterRowClient>();
  for (const ps of psRows) {
    const p = ps.presenter;
    if (p.presenterMode === "DIRECT_DJ") continue;
    if (!map.has(p.id)) {
      map.set(p.id, { id: p.id, name: p.name, username: p.username, email: p.email, phone: p.phone, presenterMode: p.presenterMode, isActive: p.isActive, stationLinks: [] });
    }
    map.get(p.id)!.stationLinks.push({ stationId: ps.station.id, stationName: ps.station.name, linkActive: ps.isActive });
  }

  let presenters = Array.from(map.values());

  // Text search across name + username
  if (q.trim()) {
    const lq = q.toLowerCase();
    presenters = presenters.filter(p =>
      (p.name?.toLowerCase().includes(lq) ?? false) ||
      p.username.toLowerCase().includes(lq)
    );
  }

  return { stations, presenters, assignedStationIds: stationIds };
}

export default async function StationManagerPresentersPage({
  searchParams,
}: { searchParams?: Promise<Record<string, string | undefined>> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = (session.user as any)?.role as string;
  if (role !== "STATION_MANAGER") return <Unauthorized role={role} />;

  const t = await getTranslations("stationManager.presenters");
  const tDash = await getTranslations("stationManager.dashboard");
  const locale = await getLocale();
  const dir = isRtl(locale) ? "rtl" : "ltr";

  const managerId   = (session.user as any)?.id as string;
  const managerName = session.user.name ?? session.user.email ?? tDash("defaultRole");

  const sp = await searchParams;
  const filterStationId = sp?.stationId ?? "";
  const q               = sp?.q ?? "";

  const { stations, presenters, assignedStationIds } = await fetchPageData(managerId, filterStationId, q);
  const spError   = sp?.error;
  const spSuccess = sp?.success;

  // Stations with counts for the filter dropdown
  const stationsWithCount = stations.map(st => ({
    ...st,
    count: presenters.filter(p => p.stationLinks.some(l => l.stationId === st.id)).length,
  }));

  return (
    <div dir={dir} className="min-h-screen bg-slate-950 text-slate-100">

      <header className="bg-slate-900 border-b border-slate-800 shadow-lg sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/station-manager" className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-slate-100 transition-colors">←</Link>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-lg shadow">🎙️</div>
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
        {spSuccess && <div className="bg-emerald-950/50 border border-emerald-500/30 text-emerald-400 rounded-xl px-4 py-3 text-sm">✅ {spSuccess === "created" ? t("createdSuccess") : t("operationSuccess")}</div>}

        {stations.length === 0 && (
          <EmptyState icon="📭" title={t("noStationsAssigned")} description={t("noStationsDescription")} />
        )}

        {stations.length > 0 && (
          <>
            {/* ── Filter bar ── */}
            <div className="flex flex-col sm:flex-row gap-2">
              {stations.length > 1 && (
                <SMStationFilter
                  stations={stationsWithCount}
                  paramKey="stationId"
                  accent="teal"
                  allLabel={t("allStations")}
                />
              )}
              <SMSearchBar placeholder={t("searchPlaceholder")} paramKey="q" />
            </div>

            {/* Create form */}
            <section className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6">
              <h2 className="text-base font-bold text-slate-100 mb-1 flex items-center gap-2"><span>➕</span> {t("addNewPresenter")}</h2>
              <p className="text-xs text-slate-500 mb-5">{t("accountType")} <span className="text-indigo-400 font-semibold">SINGLE_STATION</span></p>
              <form action={createPresenterAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SField label={t("fullName")}    name="name"     type="text" />
                <SField label={t("username")}    name="username" type="text"     dir="ltr" required />
                <SField label={t("email")}       name="email"    type="email"    dir="ltr" />
                <SField label={t("phone")}       name="phone"    type="text"     dir="ltr" />
                <SField label={t("password")}    name="password" type="password" dir="ltr" required />
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">{t("station")}</label>
                  <select name="stationId" required defaultValue={stations.length === 1 ? stations[0].id : ""}
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 transition-colors">
                    {stations.length > 1 && <option value="" disabled>{t("selectStation")}</option>}
                    {stations.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-xl px-6 py-2.5 transition-colors">{t("createPresenter")}</button>
                </div>
              </form>
            </section>

            {/* Presenter list */}
            <section>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-4">
                {t("presenterCount", { count: presenters.length })}
              </h2>
              {presenters.length === 0
                ? <EmptyState icon="🎙️" title={t("noMatchingPresenters")} description={t("adjustFilters")} />
                : <div className="space-y-4">
                    {presenters.map((p) => (
                      <PresenterCard key={p.id} presenter={p} assignedStationIds={assignedStationIds} />
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

async function createPresenterAction(formData: FormData) {
  "use server";
  const { redirect: redir } = await import("next/navigation");
  const { createPresenter: cp } = await import("./actions");
  const result = await cp(formData);
  if (result.error) redir(`/station-manager/presenters?error=${encodeURIComponent(result.error)}`);
  else              redir("/station-manager/presenters?success=created");
}

function SField({ label, name, type, dir: d, required }: { label: string; name: string; type: string; dir?: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1">{label}</label>
      <input name={name} type={type} dir={d} required={required}
        className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors" />
    </div>
  );
}
