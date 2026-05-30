import React from "react";
import Link from "next/link";
import { auth, prisma } from "@/auth";
import { redirect } from "next/navigation";
import { Unauthorized } from "@/components/ui/Unauthorized";
import { AdminPageShell } from "@/components/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getTranslations, getLocale } from "next-intl/server";
import { DATE_LOCALES, type Locale } from "@/i18n/config";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";

export const dynamic = "force-dynamic";
import { getSystemSettings, resolveLogoUrl } from "@/lib/system-settings";

export async function generateMetadata() {
  const settings = await getSystemSettings();
  const t = await getTranslations('admin.dashboard');
  return { title: t('metaTitle', { name: settings.systemName || "EGONAIR" }) };
}

interface DashboardStats {
  // Presenters
  totalPresenters:      number | "--";
  activePresenters:     number | "--";
  singleStation:        number | "--";
  multiStation:         number | "--";
  directDj:             number | "--";
  presentersNoStation:  number | "--";
  // Stations
  totalStations:        number | "--";
  activeStations:       number | "--";
  stationsNoCred:       number | "--";
  // Programs
  totalPrograms:        number | "--";
  activePrograms:       number | "--";
  programsNoSchedule:   number | "--";
  // Live / recordings
  currentlyLive:        number | "--";
  totalRecordings:      number | "--";
  recordingsThisWeek:   number | "--";
  // Managers / media
  stationManagers:      number | "--";
  mediaCategories:      number | "--";
  mediaTracks:          number | "--";
}

async function getStats(): Promise<DashboardStats> {
  const fallback: DashboardStats = {
    totalPresenters: "--", activePresenters: "--", singleStation: "--",
    multiStation: "--", directDj: "--", presentersNoStation: "--",
    totalStations: "--", activeStations: "--", stationsNoCred: "--",
    totalPrograms: "--", activePrograms: "--", programsNoSchedule: "--",
    currentlyLive: "--", totalRecordings: "--", recordingsThisWeek: "--",
    stationManagers: "--", mediaCategories: "--", mediaTracks: "--",
  };
  try {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [
      totalPresenters, activePresenters, singleStation, multiStation, directDj,
      presentersNoStation, totalStations, activeStations, stationsNoCred,
      totalPrograms, activePrograms, programsNoSchedule,
      currentlyLive, totalRecordings, recordingsThisWeek,
      stationManagers, mediaCategories, mediaTracks,
    ] = await Promise.all([
      prisma.user.count({ where: { role: "PRESENTER" } }),
      prisma.user.count({ where: { role: "PRESENTER", isActive: true } }),
      prisma.user.count({ where: { role: "PRESENTER", presenterMode: "SINGLE_STATION" } }),
      prisma.user.count({ where: { role: "PRESENTER", presenterMode: "MULTI_STATION" } }),
      prisma.user.count({ where: { role: "PRESENTER", presenterMode: "DIRECT_DJ" } }),
      prisma.user.count({ where: { role: "PRESENTER", isActive: true, presenterMode: { not: "DIRECT_DJ" }, presenterStations: { none: {} } } }),
      prisma.station.count(),
      prisma.station.count({ where: { isActive: true } }),
      prisma.station.count({ where: { isActive: true, defaultCredential: null } }),
      prisma.program.count(),
      prisma.program.count({ where: { isActive: true } }),
      prisma.program.count({ where: { isActive: true, scheduleRules: { none: {} } } }),
      prisma.liveSession.count({ where: { disconnectedAt: null, status: { in: ["LIVE", "CONNECTED"] } } }),
      prisma.recording.count(),
      prisma.recording.count({ where: { startedAt: { gte: weekAgo } } }),
      prisma.user.count({ where: { role: "STATION_MANAGER" } }),
      prisma.mediaCategory.count(),
      prisma.mediaTrack.count(),
    ]);

    return {
      totalPresenters, activePresenters, singleStation, multiStation, directDj,
      presentersNoStation, totalStations, activeStations, stationsNoCred,
      totalPrograms, activePrograms, programsNoSchedule,
      currentlyLive, totalRecordings, recordingsThisWeek,
      stationManagers, mediaCategories, mediaTracks,
    };
  } catch (err) {
    console.error("[AdminDashboard] stats error:", (err as Error).message);
    return fallback;
  }
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default async function AdminDashboard() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const settings = await getSystemSettings();
  const systemName = settings.systemName || "EGONAIR";
  const systemSubtitle = settings.systemSubtitle;
  const logoUrl = resolveLogoUrl(settings, "dark");
  if ((session.user as any).role !== "ADMIN") {
    return <Unauthorized role={(session.user as any).role ?? ""} />;
  }

  const t = await getTranslations('admin.dashboard');
  const tAuth = await getTranslations('auth');
  const locale = await getLocale();
  const dateLocale = DATE_LOCALES[locale as Locale] || locale;

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const num = (v: number | "--") => (v === "--" ? "--" : v.toLocaleString(dateLocale));

  const s = await getStats();

  const warnings: { icon: string; text: string; href: string }[] = [];
  if (typeof s.stationsNoCred === "number" && s.stationsNoCred > 0)
    warnings.push({ icon: "📡", text: t('warningStationsNoCred', { count: s.stationsNoCred }), href: "/admin/stations" });
  if (typeof s.presentersNoStation === "number" && s.presentersNoStation > 0)
    warnings.push({ icon: "🎙️", text: t('warningPresentersNoStation', { count: s.presentersNoStation }), href: "/admin/presenters" });
  if (typeof s.programsNoSchedule === "number" && s.programsNoSchedule > 0)
    warnings.push({ icon: "📺", text: t('warningProgramsNoSchedule', { count: s.programsNoSchedule }), href: "/admin/programs" });

  const navItems = [
    { href: "/admin/presenters",      icon: "🎙️", label: t('navPresenters'),      sub: t('navPresentersDesc'),  color: "hover:border-indigo-500/50 group-hover:text-indigo-300" },
    { href: "/admin/stations",        icon: "📻", label: t('navStations'),        sub: t('navStationsDesc'),    color: "hover:border-cyan-500/50 group-hover:text-cyan-300" },
    { href: "/admin/programs",        icon: "📺", label: t('navPrograms'),        sub: t('navProgramsDesc'),    color: "hover:border-purple-500/50 group-hover:text-purple-300" },
    { href: "/admin/schedule",        icon: "📅", label: t('navSchedule'),        sub: t('navScheduleDesc'),    color: "hover:border-violet-500/50 group-hover:text-violet-300" },
    { href: "/admin/schedule/audit",  icon: "🔍", label: t('navAudit'),           sub: t('navAuditDesc'),       color: "hover:border-amber-500/50 group-hover:text-amber-300" },
    { href: "/admin/live",            icon: "🔴", label: t('navLive'),            sub: t('navLiveDesc'),        color: "hover:border-red-500/50 group-hover:text-red-300" },
    { href: "/admin/recordings",      icon: "🗂️", label: t('navRecordings'),      sub: t('navRecordingsDesc'),  color: "hover:border-amber-500/50 group-hover:text-amber-300" },
    { href: "/admin/station-managers",icon: "🧑‍💼", label: t('navManagers'),       sub: t('navManagersDesc'),    color: "hover:border-teal-500/50 group-hover:text-teal-300" },
    { href: "/admin/media",           icon: "🎵", label: t('navMedia'),           sub: t('navMediaDesc'),       color: "hover:border-teal-500/40"   },
    { href: "/admin/settings",        icon: "⚙️", label: t('navSettings'),        sub: t('navSettingsDesc'),    color: "hover:border-slate-500/40"  },
  ];

  return (
    <AdminPageShell maxWidth="max-w-6xl" padding="p-8">
      <div className="space-y-8">

        {/* ── Header ── */}
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            {logoUrl && (
              <div className="hidden sm:block flex-shrink-0 bg-slate-800/50 p-2 rounded-xl border border-slate-700/50">
                <img 
                  src={logoUrl} 
                  alt={`${systemName} Logo`} 
                  className="w-auto object-contain"
                  style={{ maxHeight: '48px' }} 
                />
              </div>
            )}
            <div>
              <h1 className="text-3xl font-bold text-slate-100 tracking-tight">
                {logoUrl ? t('title') : t('titleWithName', { name: systemName })}
              </h1>
              <p className="text-slate-400 text-sm mt-1">{systemSubtitle || t('systemOverview')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-shrink-0">
            <LanguageSwitcher />
            <Link href="/profile"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 border border-slate-700 rounded-lg transition-colors"
              style={{ color: "var(--eg-text-muted)" }}
            >
              {t('myProfile')}
            </Link>
            <form action={async () => {
              "use server";
              const { signOut } = await import("@/auth");
              await signOut({ redirectTo: "/login" });
            }}>
              <button type="submit"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-red-400 bg-slate-800 hover:bg-red-500/10 border border-slate-700 hover:border-red-500/30 rounded-lg transition-colors">
                {tAuth('logout')}
              </button>
            </form>
          </div>
        </header>

        {/* ── Health warnings ── */}
        {warnings.length > 0 && (
          <div className="space-y-2">
            {warnings.map((w) => (
              <Link key={w.href} href={w.href}
                className="flex items-center gap-3 bg-amber-500/5 border border-amber-500/20 hover:border-amber-500/40 rounded-xl px-4 py-3 text-sm text-amber-400 transition-colors">
                <span className="text-base">{w.icon}</span>
                <span>⚠️ {w.text}</span>
                <span className="mr-auto text-xs text-amber-600">{t('warningView')}</span>
              </Link>
            ))}
          </div>
        )}

        {/* ── Live strip ── */}
        <div className={`flex items-center gap-3 rounded-xl border px-5 py-3 ${
          typeof s.currentlyLive === "number" && s.currentlyLive > 0
            ? "bg-emerald-500/10 border-emerald-500/30"
            : "bg-slate-800 border-slate-700/50"
        }`}>
          <span className={`text-2xl font-bold ${typeof s.currentlyLive === "number" && s.currentlyLive > 0 ? "text-emerald-400" : "text-slate-500"}`}>
            {num(s.currentlyLive)}
          </span>
          <div>
            <p className="text-sm font-medium text-slate-200">{t('liveNow')}</p>
            <p className="text-xs text-slate-500">{t('liveSessionsLabel')}</p>
          </div>
          {typeof s.currentlyLive === "number" && s.currentlyLive > 0 && (
            <div className="mr-auto">
              <StatusBadge label={t('liveLabel')} variant="success" dot />
            </div>
          )}
          <Link href="/admin/live" className="mr-auto text-xs text-slate-500 hover:text-slate-300 border border-slate-700 hover:border-slate-500 rounded-lg px-3 py-1.5 transition-colors">
            {t('viewSessions')}
          </Link>
        </div>

        {/* ── Stat breakdown ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

          {/* Presenters */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4 space-y-3">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <span>🎙️</span> {t('sectionPresenters')}
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <StatCard label={t('statTotal')}          value={s.totalPresenters}  num={num} />
              <StatCard label={t('statActive')}         value={s.activePresenters} color="text-emerald-400" num={num} />
              <StatCard label={t('statSingleStation')}  value={s.singleStation}   style={{ color: "var(--eg-primary)" }}  sub="SINGLE_STATION" num={num} />
              <StatCard label={t('statMulti')}          value={s.multiStation}    style={{ color: "var(--eg-accent)" }}    sub="MULTI_STATION" num={num} />
              <StatCard label={t('statDirectDj')}       value={s.directDj}        style={{ color: "var(--eg-accent)" }}    sub="DIRECT_DJ" num={num} />
              <StatCard label={t('statStationManagers')} value={s.stationManagers} color="text-teal-400" num={num} />
            </div>
          </div>

          {/* Stations */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4 space-y-3">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <span>📡</span> {t('sectionStations')}
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <StatCard label={t('statTotal')}              value={s.totalStations}  num={num} />
              <StatCard label={t('statActiveF')}             value={s.activeStations} color="text-emerald-400" num={num} />
              <StatCard label={t('statNoDjCred')}            value={s.stationsNoCred}
                color={typeof s.stationsNoCred === "number" && s.stationsNoCred > 0 ? "text-red-400" : "text-slate-400"} num={num} />
              <StatCard label={t('statPresentersNoStation')} value={s.presentersNoStation}
                color={typeof s.presentersNoStation === "number" && s.presentersNoStation > 0 ? "text-amber-400" : "text-slate-400"} num={num} />
            </div>
          </div>

          {/* Programs / Content */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4 space-y-3">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <span>📺</span> {t('sectionProgramsContent')}
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <StatCard label={t('statTotalPrograms')}     value={s.totalPrograms}    num={num} />
              <StatCard label={t('statActivePrograms')}    value={s.activePrograms}   color="text-emerald-400" num={num} />
              <StatCard label={t('statNoSchedule')}        value={s.programsNoSchedule}
                color={typeof s.programsNoSchedule === "number" && s.programsNoSchedule > 0 ? "text-amber-400" : "text-slate-400"} num={num} />
              <StatCard label={t('statRecordings')}        value={s.totalRecordings}  style={{ color: "var(--eg-primary)" }} num={num} />
              <StatCard label={t('statWeekRecordings')}    value={s.recordingsThisWeek} style={{ color: "var(--eg-accent)" }} num={num} />
              <StatCard label={t('statMediaCategories')}   value={s.mediaCategories}   sub={t('statMediaTracks', { count: num(s.mediaTracks) })} num={num} />
            </div>
          </div>
        </div>

        {/* ── Navigation ── */}
        <nav>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">{t('sectionNav')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 bg-slate-800 border border-slate-700/50 rounded-xl px-4 py-3.5 transition-colors group ${item.color}`}>
                <span className="text-xl flex-shrink-0">{item.icon}</span>
                <div className="min-w-0">
                  <div className={`font-medium text-slate-200 transition-colors text-sm`}>{item.label}</div>
                  <div className="text-xs text-slate-500 truncate">{item.sub}</div>
                </div>
              </Link>
            ))}
          </div>
        </nav>

      </div>
    </AdminPageShell>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, color, style, sub, num }: {
  label: string; value: number | "--"; color?: string; style?: React.CSSProperties; sub?: string; num: (v: number | "--") => string;
}) {
  return (
    <div className="bg-slate-800 border border-slate-700/50 rounded-xl px-4 py-3 flex flex-col gap-0.5">
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className={`text-2xl font-bold ${color ?? ""}`} style={style}>{num(value)}</p>
      {sub && <p className="text-[10px] text-slate-600">{sub}</p>}
    </div>
  );
}
