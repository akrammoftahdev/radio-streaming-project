import re

content = """import { auth, prisma } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState }  from "@/components/ui/EmptyState";
import { Unauthorized } from "@/components/ui/Unauthorized";
import { getTranslations, getLocale } from "next-intl/server";
import { isRtl } from "@/i18n/config";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";

export const dynamic = "force-dynamic";

// Saturday-first week order
const DAY_ORDER = [6, 0, 1, 2, 3, 4, 5];

type Entry = {
  programId: string;
  programTitle: string;
  presenterName: string;
  stationName: string;
  stationId: string;
  startTime: string;
  endTime: string;
  recurrenceType: string;
  oneTimeDate?: string;
};

export async function generateMetadata() {
  const t = await getTranslations("stationManager.schedule");
  return { title: t("title") };
}

export default async function SMSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ station?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "STATION_MANAGER") return <Unauthorized role={role} />;

  const t = await getTranslations("stationManager.schedule");
  const locale = await getLocale();
  const dir = isRtl(locale) ? "rtl" : "ltr";

  const DAY_NAMES: Record<number, string> = {
    0: t("day_0"), 1: t("day_1"), 2: t("day_2"),
    3: t("day_3"), 4: t("day_4"), 5: t("day_5"), 6: t("day_6"),
  };
  const RECURRENCE_LABELS: Record<string, string> = {
    DAILY: t("recurrence_DAILY"), WEEKLY: t("recurrence_WEEKLY"),
    SELECTED_DAYS: t("recurrence_SELECTED_DAYS"), ONE_TIME: t("recurrence_ONE_TIME"),
  };

  const managerId   = (session.user as { id?: string }).id ?? "";
  const managerName = session.user.name ?? t("managerDefaultName");

  const assignments = await prisma.stationManagerAssignment.findMany({
    where:   { managerId, isActive: true },
    select:  { stationId: true, station: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  const stationIds = assignments.map((a) => a.stationId);
  const stationMap = new Map(assignments.map((a) => [a.station.id, a.station.name]));

  if (stationIds.length === 0) return <NoStationsPage managerName={managerName} />;

  const { station: filterStation = "" } = await searchParams;
  // Parse comma-separated multi-select station IDs
  const selectedStations = filterStation
    ? filterStation.split(",").filter((id) => stationIds.includes(id))
    : [];
  const queryIds = selectedStations.length > 0 ? selectedStations : stationIds;

  const programs = await prisma.program.findMany({
    where: { stationId: { in: queryIds }, isActive: true },
    select: {
      id: true, title: true, stationId: true,
      presenter: { select: { name: true, username: true } },
      station:   { select: { name: true } },
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

  // Current week bounds — week starts Saturday
  const now         = new Date();
  const todayDay    = now.getDay(); // 0=Sun…6=Sat
  const dFromSat    = (todayDay + 1) % 7;
  const weekStart   = new Date(now);
  weekStart.setDate(now.getDate() - dFromSat);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  // Build day → entries map
  const dayEntries: Record<number, Entry[]> = { 0:[], 1:[], 2:[], 3:[], 4:[], 5:[], 6:[] };

  for (const prog of programs) {
    const presenterName = prog.presenter?.name ?? prog.presenter?.username ?? "—";
    for (const rule of prog.scheduleRules) {
      for (const slot of rule.slots) {
        const base: Entry = {
          programId: prog.id, programTitle: prog.title,
          presenterName, stationName: prog.station.name, stationId: prog.stationId,
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

  const hasAnySlots = DAY_ORDER.some((d) => dayEntries[d].length > 0);

  return (
    <div dir={dir} className="min-h-screen bg-slate-950 text-slate-100"
      style={{ fontFamily: "'Cairo','Segoe UI',system-ui,sans-serif" }}>
      <link rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap" />

      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 shadow-lg sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/station-manager"
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-slate-100 transition-colors">
              {dir === "rtl" ? "←" : "→"}
            </Link>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-lg shadow flex-shrink-0">📅</div>
            <div>
              <h1 className="text-base font-bold text-slate-100 leading-tight">{t("pageTitle")}</h1>
              <p className="text-xs text-slate-500">{managerName}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <div className="flex items-center gap-2">
              <Link href="/station-manager/programs"
                className="text-xs text-slate-400 hover:text-violet-300 border border-slate-700 hover:border-violet-600/40 rounded-lg px-3 py-2 transition-colors">
                {t("programsButton")}
              </Link>
              <Link href="/station-manager"
                className="text-xs text-slate-400 hover:text-teal-300 border border-slate-700 hover:border-teal-600/50 rounded-lg px-3 py-2 transition-colors">
                {t("backToDashboard")}
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* Station filter */}
        {stationIds.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            <Link href="/station-manager/schedule"
              className={`text-xs border rounded-lg px-3 py-1.5 transition-colors ${
                !filterStation
                  ? "bg-violet-950/50 text-violet-300 border-violet-600/50"
                  : "text-slate-400 border-slate-700 hover:border-slate-500"
              }`}>
              {t("allStations")}
            </Link>
            {Array.from(stationMap.entries()).map(([id, name]) => (
              <Link key={id} href={`/station-manager/schedule?station=${id}`}
                className={`text-xs border rounded-lg px-3 py-1.5 transition-colors ${
                  filterStation === id
                    ? "bg-violet-950/50 text-violet-300 border-violet-600/50"
                    : "text-slate-400 border-slate-700 hover:border-slate-500"
                }`}>
                {name}
              </Link>
            ))}
          </div>
        )}

        {/* Summary */}
        <p className="text-xs text-slate-500">
          {t("summary", { count: programs.length })}
        </p>

        {/* Empty state */}
        {!hasAnySlots && (
          <EmptyState icon="📅" title={t("noProgramsTitle")}
            description={t("noProgramsDesc")}
            action={<Link href="/station-manager/programs" className="text-xs text-violet-400 hover:text-violet-300 border border-violet-700/30 hover:border-violet-500/50 rounded-lg px-4 py-2 transition-colors">{t("manageProgramsBtn")}</Link>}
          />
        )}

        {/* Weekly grid */}
        {hasAnySlots && (
          <div className="space-y-5">
            {DAY_ORDER.map((dayIdx) => {
              const entries  = dayEntries[dayIdx];
              const isToday  = dayIdx === todayDay;
              return (
                <section key={dayIdx} id={`day-${dayIdx}`}>
                  {/* Day header */}
                  <div className={`flex items-center gap-3 mb-3 pb-2 border-b ${
                    isToday ? "border-violet-600/50" : "border-slate-800"
                  }`}>
                    <h2 className={`text-sm font-bold ${isToday ? "text-violet-300" : "text-slate-300"}`}>
                      {DAY_NAMES[dayIdx]}
                    </h2>
                    {isToday && (
                      <span className="text-[10px] bg-violet-900/50 text-violet-300 border border-violet-600/40 px-2 py-0.5 rounded-full">
                        {t("today")}
                      </span>
                    )}
                    <span className="text-xs text-slate-600">({entries.length})</span>
                  </div>

                  {entries.length === 0 && (
                    <p className={`text-xs text-slate-700 pb-2 ${dir === 'rtl' ? 'pr-1' : 'pl-1'}`}>{t("noBroadcast")}</p>
                  )}

                  {entries.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {entries.map((e, i) => (
                        <div key={`${e.programId}-${dayIdx}-${i}`}
                          className={`bg-slate-900 border rounded-xl p-4 hover:border-violet-600/40 transition-colors ${
                            isToday ? "border-violet-800/40" : "border-slate-700/50"
                          }`}>
                          {/* Time range */}
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold text-violet-300 font-mono" dir="ltr">
                              {e.startTime} - {e.endTime}
                            </span>
                            <span className="text-[10px] text-slate-500 bg-slate-800 border border-slate-700/40 px-2 py-0.5 rounded-full">
                              {RECURRENCE_LABELS[e.recurrenceType] ?? e.recurrenceType}
                            </span>
                          </div>

                          {/* Program title */}
                          <p className="text-sm font-semibold text-slate-100 mb-1 truncate">
                            {e.programTitle}
                          </p>

                          {/* Presenter */}
                          <p className="text-xs text-slate-400 mb-1">
                            🎙️ {e.presenterName}
                          </p>

                          {/* Station (multi-station managers only) */}
                          {queryIds.length > 1 && (
                            <p className="text-xs text-amber-400 mb-1">📡 {e.stationName}</p>
                          )}

                          {/* ONE_TIME date badge */}
                          {e.oneTimeDate && (
                            <p className="text-[10px] text-teal-400 mb-2">📌 {e.oneTimeDate}</p>
                          )}

                          <Link href="/station-manager/programs"
                            className="text-[10px] text-slate-500 hover:text-violet-300 border border-slate-700/40 hover:border-violet-600/30 rounded-lg px-2 py-1 inline-block transition-colors mt-1">
                            {t("editProgram")}
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

async function NoStationsPage({ managerName }: { managerName: string }) {
  const t = await getTranslations("stationManager.schedule");
  const locale = await getLocale();
  const dir = isRtl(locale) ? "rtl" : "ltr";

  return (
    <div dir={dir} className="min-h-screen bg-slate-950 text-slate-100 flex flex-col"
      style={{ fontFamily: "'Cairo','Segoe UI',system-ui,sans-serif" }}>
      <header className="bg-slate-900 border-b border-slate-800 shadow-lg">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/station-manager"
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-slate-100 transition-colors">
              {dir === "rtl" ? "←" : "→"}
            </Link>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-lg shadow flex-shrink-0">📅</div>
            <div>
              <h1 className="text-base font-bold text-slate-100 leading-tight">{t("pageTitle")}</h1>
              <p className="text-xs text-slate-500">{managerName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <LanguageSwitcher />
          </div>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center p-8">
        <EmptyState icon="📢" title={t("noStationsAssigned")}
          description={t("noStationsAssignedDesc")}
          action={<Link href="/station-manager" className="text-sm text-slate-400 hover:text-teal-300 border border-slate-700 hover:border-teal-600/30 rounded-lg px-4 py-2 transition-colors">{t("backToDashboardAction")}</Link>}
        />
      </main>
    </div>
  );
}
"""

with open('frontend/src/app/station-manager/schedule/page.tsx', 'w') as f:
    f.write(content)

print("Page rewritten!")
