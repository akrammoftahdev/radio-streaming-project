import { auth, prisma } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ScheduleFilterBar } from "./schedule-filter-bar";
import { getTranslations, getLocale } from "next-intl/server";
import { isRtl } from "@/i18n/config";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations('admin.schedule');
  return { title: `${t('title')} - EGONAIR` };
}

const DAY_ORDER = [6, 0, 1, 2, 3, 4, 5];

const RECURRENCE_COLORS: Record<string, string> = {
  DAILY:         "bg-violet-900/60 text-violet-300 border-violet-700/40",
  WEEKLY:        "bg-indigo-900/60 text-indigo-300 border-indigo-700/40",
  SELECTED_DAYS: "bg-blue-900/60   text-blue-300   border-blue-700/40",
  ONE_TIME:      "bg-teal-900/60   text-teal-300   border-teal-700/40",
};

type Entry = {
  programId:      string;
  programTitle:   string;
  presenterName:  string;
  presenterId:    string;
  stationName:    string;
  stationId:      string;
  startTime:      string;
  endTime:        string;
  recurrenceType: string;
  oneTimeDate?:   string;
};

export default async function AdminSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ stations?: string; presenters?: string; recurrence?: string; timeFrom?: string; timeTo?: string; weekOf?: string }>;
}) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    redirect("/login");
  }

  const t = await getTranslations('admin.schedule');
  const tc = await getTranslations('common');
  const tn = await getTranslations('nav');
  const td = await getTranslations('time.days');
  const tr = await getTranslations('admin.schedule');
  const locale = await getLocale();
  const dir = isRtl(locale) ? 'rtl' : 'ltr';

  const DAY_NAMES: Record<number, string> = {
    0: td('sunday'), 1: td('monday'), 2: td('tuesday'),
    3: td('wednesday'), 4: td('thursday'), 5: td('friday'), 6: td('saturday'),
  };
  const RECURRENCE_LABELS: Record<string, string> = {
    DAILY: t('daily'), WEEKLY: t('weekly'),
    SELECTED_DAYS: t('selectedDays'), ONE_TIME: t('oneTime'),
  };

  const { stations: stationsParam = "", presenters: presentersParam = "", recurrence: recurrenceParam = "",
    timeFrom: timeFromParam = "", timeTo: timeToParam = "", weekOf: weekOfParam = "" } = await searchParams;
  const filterStationIds   = stationsParam.split(",").filter(Boolean);
  const filterPresenterIds = presentersParam.split(",").filter(Boolean);
  const filterRecurrence   = recurrenceParam || "";
  const filterTimeFrom     = timeFromParam || "";
  const filterTimeTo       = timeToParam   || "";

  // ── All active programs with schedule data ────────────────────────────────
  const programs = await prisma.program.findMany({
    where: { isActive: true },
    select: {
      id: true, title: true, stationId: true,
      validFrom: true, validUntil: true,
      presenter: { select: { id: true, name: true, username: true } },
      station:   { select: { id: true, name: true } },
      scheduleRules: {
        where:  { isActive: true },
        select: {
          recurrenceType: true,
          slots: {
            where:  { isActive: true },
            select: { dayOfWeek: true, slotDate: true, startTime: true, endTime: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Build options from ALL programs (pre-filter)
  const allStationOptions   = Array.from(new Map(programs.map(p => [p.station.id,   p.station.name])).entries()).sort((a,b)=>a[1].localeCompare(b[1])).map(([id,name])=>({id,name}));
  const allPresenterOptions = Array.from(new Map(programs.filter(p=>p.presenter).map(p=>[p.presenter!.id, p.presenter!.name??p.presenter!.username])).entries()).sort((a,b)=>a[1].localeCompare(b[1])).map(([id,name])=>({id,name}));

  // ── Apply filters ──────────────────────────────────────────────────────────
  const filteredPrograms = programs.filter(p => {
    if (filterStationIds.length   > 0 && !filterStationIds.includes(p.station.id))      return false;
    if (filterPresenterIds.length > 0 && !filterPresenterIds.includes(p.presenter?.id ?? "")) return false;
    if (filterRecurrence && filterRecurrence !== "all" &&
        !p.scheduleRules.some(r => r.recurrenceType === filterRecurrence))              return false;
    if (filterTimeFrom || filterTimeTo) {
      const normTo = filterTimeTo === "24:00" ? "23:59" : filterTimeTo;
      const hasSlotInRange = p.scheduleRules.some(rule =>
        rule.slots.some(slot => {
          if (!slot.startTime) return false;
          if (filterTimeFrom && slot.startTime < filterTimeFrom) return false;
          if (normTo         && slot.startTime > normTo)         return false;
          return true;
        })
      );
      if (!hasSlotInRange) return false;
    }
    // ── Validity window: skip if the current week is outside the program's date range ──
    // weekEnd and weekStart are computed below but for the filter we pre-compute them here.
    // (They are also recomputed after this block — that's fine, they're identical values.)
    {
      const _now      = new Date();
      let   _weekBase = new Date(_now);
      if (weekOfParam) {
        const _parsed = new Date(weekOfParam + "T00:00:00");
        if (!isNaN(_parsed.getTime())) _weekBase = _parsed;
      }
      const _dFromSat  = (_weekBase.getDay() + 1) % 7;
      const _weekStart = new Date(_weekBase);
      _weekStart.setDate(_weekBase.getDate() - _dFromSat);
      _weekStart.setHours(0, 0, 0, 0);
      const _weekEnd = new Date(_weekStart);
      _weekEnd.setDate(_weekStart.getDate() + 7);
      // Exclude: week ends before program starts (validFrom) OR week starts after program ends (validUntil)
      if (p.validFrom  && _weekEnd   <= p.validFrom)  return false;
      if (p.validUntil && _weekStart >= p.validUntil) return false;
    }
    return true;
  });

  // ── Week boundaries (driven by ?weekOf= or current week) ─────────────────
  const now      = new Date();
  const todayDay = now.getDay(); // used for today-column highlight

  let weekBase = new Date(now);
  if (weekOfParam) {
    const parsed = new Date(weekOfParam + "T00:00:00");
    if (!isNaN(parsed.getTime())) weekBase = parsed;
  }
  const dFromSat  = (weekBase.getDay() + 1) % 7;
  const weekStart = new Date(weekBase);
  weekStart.setDate(weekBase.getDate() - dFromSat);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  // Compare against the actual current week
  const realDFromSat  = (todayDay + 1) % 7;
  const realWeekStart = new Date(now);
  realWeekStart.setDate(now.getDate() - realDFromSat);
  realWeekStart.setHours(0, 0, 0, 0);
  const isCurrentWeek = weekStart.getTime() === realWeekStart.getTime();
  // Use local-time date parts — toISOString() would shift to UTC and return the wrong date in UTC+3
  const weekStartIso  = `${weekStart.getFullYear()}-${String(weekStart.getMonth()+1).padStart(2,"0")}-${String(weekStart.getDate()).padStart(2,"0")}`;

  // ── Build day → entries map ───────────────────────────────────────────────
  const dayEntries: Record<number, Entry[]> = { 0:[], 1:[], 2:[], 3:[], 4:[], 5:[], 6:[] };

  for (const prog of filteredPrograms) {
    const presenterName = prog.presenter?.name ?? prog.presenter?.username ?? "—";
    for (const rule of prog.scheduleRules) {
      for (const slot of rule.slots) {
        const base: Entry = {
          programId: prog.id, programTitle: prog.title,
          presenterName, presenterId: prog.presenter?.id ?? "",
          stationName: prog.station.name, stationId: prog.station.id,
          startTime: slot.startTime, endTime: slot.endTime,
          recurrenceType: rule.recurrenceType,
        };
        if (rule.recurrenceType === "DAILY") {
          for (let d = 0; d <= 6; d++) dayEntries[d].push({ ...base });
        } else if (rule.recurrenceType === "ONE_TIME") {
          if (slot.slotDate) {
            const sd = new Date(slot.slotDate);
            if (sd >= weekStart && sd < weekEnd) {
              const dow = sd.getDay();
              dayEntries[dow].push({
                ...base,
                oneTimeDate: sd.toLocaleDateString(locale, {
                  timeZone: "Africa/Cairo", month: "short", day: "numeric",
                }),
              });
            }
          }
        } else if (slot.dayOfWeek !== null && slot.dayOfWeek !== undefined) {
          dayEntries[slot.dayOfWeek].push({ ...base });
        }
      }
    }
  }

  for (const d of DAY_ORDER) {
    dayEntries[d].sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  // ── Filter URL helper (unused now — kept for link helpers) ─────────────────
  function filterUrl(params: Record<string, string>) {
    const p = new URLSearchParams();
    if (filterStationIds.length)   p.set("stations",   filterStationIds.join(","));
    if (filterPresenterIds.length) p.set("presenters", filterPresenterIds.join(","));
    if (filterRecurrence && filterRecurrence !== "all") p.set("recurrence", filterRecurrence);
    for (const [k, v] of Object.entries(params)) { if (v) p.set(k, v); else p.delete(k); }
    const qs = p.toString();
    return `/admin/schedule${qs ? "?" + qs : ""}`;
  }
  void filterUrl; // suppress unused warning

  const totalSlots     = DAY_ORDER.reduce((s, d) => s + dayEntries[d].length, 0);
  const activeStations    = new Set(filteredPrograms.map(p => p.stationId)).size;
  const activePresenters  = new Set(filteredPrograms.map(p => p.presenter?.id).filter(Boolean)).size;
  const hasFilters = !!(filterStationIds.length || filterPresenterIds.length || (filterRecurrence && filterRecurrence !== "all") || filterTimeFrom || filterTimeTo);

  return (
    <div dir={dir} className="min-h-screen bg-neutral-950 text-neutral-100">

      {/* ── Header ── */}
      <header className="bg-neutral-900 border-b border-neutral-800 sticky top-0 z-20 shadow-xl">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          {/* Title */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-purple-800 flex items-center justify-center text-xl shadow-lg flex-shrink-0">
              📅
            </div>
            <div>
              <h1 className="text-base font-bold text-neutral-100 leading-tight">{t('title')}</h1>
              <p className="text-xs text-neutral-500">{t('headerSubtitle')}</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/admin/programs"
              className="flex items-center gap-1.5 text-xs font-medium text-indigo-400 hover:text-indigo-300 border border-indigo-700/40 hover:border-indigo-600/60 bg-indigo-950/30 hover:bg-indigo-950/50 rounded-lg px-3 py-2 transition-colors">
              ⚙️ {t('managePrograms')}
            </Link>
            <Link href="/admin/schedule/audit"
              className="flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 border border-amber-700/40 hover:border-amber-600/60 bg-amber-950/30 hover:bg-amber-950/50 rounded-lg px-3 py-2 transition-colors">
              🔍 {t('audit')}
            </Link>
            <Link href="/admin"
              className="flex items-center gap-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-200 border border-neutral-700 hover:border-neutral-600 bg-neutral-900 hover:bg-neutral-800 rounded-lg px-3 py-2 transition-colors">
              ← {tn('adminDashboard')}
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 md:px-6 py-6 space-y-5">

        {/* ── Summary cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: t('programsShown'),   value: filteredPrograms.length, icon: "📺", color: "text-violet-400" },
            { label: t('slotsCount'),      value: totalSlots,              icon: "🕒", color: "text-indigo-400" },
            { label: t('stationsLabel'),   value: activeStations,          icon: "📡", color: "text-amber-400"  },
            { label: t('presentersLabel'), value: activePresenters,        icon: "🎙️", color: "text-cyan-400"   },
          ].map(({ label, value, icon, color }) => (
            <div key={label} className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-2xl">{icon}</span>
              <div>
                <p className={`text-xl font-bold ${color}`}>{value}</p>
                <p className="text-[11px] text-neutral-500">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Filter bar (client component) ── */}
        <ScheduleFilterBar
          allStations={allStationOptions}
          allPresenters={allPresenterOptions}
          initialStationIds={filterStationIds}
          initialPresenterIds={filterPresenterIds}
          initialRecurrence={filterRecurrence}
          initialTimeFrom={filterTimeFrom}
          initialTimeTo={filterTimeTo}
          weekStartIso={weekStartIso}
          isCurrentWeek={isCurrentWeek}
        />

        {/* ── Weekly calendar grid ── */}
        <div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900">
          <div className="min-w-[840px]">

            {/* Day column headers */}
            <div className="grid grid-cols-7 border-b border-neutral-800">
              {DAY_ORDER.map((dayIdx) => {
                const isToday    = dayIdx === todayDay;
                const entryCount = dayEntries[dayIdx].length;
                return (
                  <div key={dayIdx}
                    className={`px-3 py-3 text-center border-l border-neutral-800 first:border-l-0 ${
                      isToday ? "bg-violet-950/40" : "bg-neutral-900"
                    }`}>
                    <p className={`text-sm font-bold ${isToday ? "text-violet-300" : "text-neutral-300"}`}>
                      {DAY_NAMES[dayIdx]}
                    </p>
                    <div className="flex items-center justify-center gap-1.5 mt-0.5">
                      {isToday && (
                        <span className="text-[9px] bg-violet-800/60 text-violet-300 border border-violet-600/40 px-1.5 py-0.5 rounded-full leading-none">
                          {t('today')}
                        </span>
                      )}
                      <span className={`text-[10px] font-medium ${entryCount > 0 ? "text-neutral-400" : "text-neutral-700"}`}>
                        {entryCount} {t('slot')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Day columns content */}
            <div className="grid grid-cols-7 divide-x divide-neutral-800" style={{ direction: "rtl" }}>
              {DAY_ORDER.map((dayIdx) => {
                const entries = dayEntries[dayIdx];
                const isToday = dayIdx === todayDay;
                return (
                  <div key={dayIdx}
                    className={`min-h-[320px] p-2 space-y-2 ${isToday ? "bg-violet-950/10" : ""}`}>
                    {entries.length === 0 ? (
                      <div className="h-full flex items-start justify-center pt-8">
                        <p className="text-[11px] text-neutral-700 text-center">{t('noPrograms')}<br />{t('scheduled')}</p>
                      </div>
                    ) : (
                      entries.map((e, i) => (
                        <div key={`${e.programId}-${dayIdx}-${i}`}
                          className={`rounded-lg border p-2.5 transition-colors group ${
                            isToday
                              ? "bg-violet-950/25 border-violet-800/40 hover:border-violet-600/60"
                              : "bg-neutral-800/60 border-neutral-700/50 hover:border-neutral-600/70"
                          }`}>
                          {/* Time */}
                          <p className="text-xs font-bold text-violet-300 font-mono mb-1.5 leading-none">
                            {e.startTime} – {e.endTime}
                          </p>

                          {/* Recurrence badge */}
                          <span className={`text-[9px] font-medium border rounded-full px-1.5 py-0.5 leading-none inline-block mb-1.5 ${
                            RECURRENCE_COLORS[e.recurrenceType] ?? "bg-neutral-800 text-neutral-400 border-neutral-700"
                          }`}>
                            {RECURRENCE_LABELS[e.recurrenceType] ?? e.recurrenceType}
                          </span>

                          {/* ONE_TIME date */}
                          {e.oneTimeDate && (
                            <p className="text-[9px] text-teal-400 mb-1">📌 {e.oneTimeDate}</p>
                          )}

                          {/* Program title */}
                          <p className="text-xs font-semibold text-neutral-100 truncate mb-1 leading-tight">
                            {e.programTitle}
                          </p>

                          {/* Presenter */}
                          <p className="text-[10px] text-neutral-400 truncate mb-0.5">
                            🎙 {e.presenterName}
                          </p>

                          {/* Station */}
                          <p className="text-[10px] text-amber-400/80 truncate mb-2">
                            📡 {e.stationName}
                          </p>

                          {/* Edit link — specific program */}
                          <Link href={`/admin/programs/${e.programId}/edit`}
                            className="text-[9px] text-neutral-600 hover:text-violet-400 border border-neutral-700/40 hover:border-violet-700/50 rounded px-1.5 py-0.5 transition-colors inline-block">
                            {tc('edit')} ←
                          </Link>
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
            </div>

          </div>
        </div>

        {/* ── Empty state (no programs at all) ── */}
        {filteredPrograms.length === 0 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-16 text-center">
            <div className="text-5xl mb-4">📅</div>
            <p className="text-neutral-300 font-semibold text-lg mb-1">
              {hasFilters ? t('noProgramsMatchFilter') : t('noProgramsScheduled')}
            </p>
            <div className="flex items-center justify-center gap-3 mt-5 flex-wrap">
              {hasFilters && (
                <Link href="/admin/schedule"
                  className="text-xs text-neutral-400 hover:text-neutral-200 border border-neutral-700 hover:border-neutral-600 rounded-lg px-4 py-2 transition-colors">
                  {t('clearFilters')}
                </Link>
              )}
              <Link href="/admin/programs"
                className="text-xs text-violet-400 hover:text-violet-300 border border-violet-700/30 hover:border-violet-600/50 rounded-lg px-4 py-2 transition-colors">
                ⚙️ {t('managePrograms')}
              </Link>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
