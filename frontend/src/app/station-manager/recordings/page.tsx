import { auth, prisma } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { recordingPlayUrl, recordingDownloadUrl, recordingMimeType } from "@/lib/recording-helpers";
import { SMStationFilter } from "@/components/sm-station-filter";
import { SMPresenterFilter } from "@/components/sm-presenter-filter";
import { SMSearchBar } from "@/components/sm-search-bar";
import { Unauthorized } from "@/components/ui/Unauthorized";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState }  from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";
export const metadata = { title: "تسجيلات المحطة - EGONAIR" };

const PAGE_SIZE = 20;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(d: Date): string {
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: "Africa/Cairo",
    weekday: "short", year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  }).format(d);
}

function fmtDur(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m === 0 ? `${sec} ث` : sec === 0 ? `${m} د` : `${m} د ${sec} ث`;
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} بايت`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} كيلوبايت`;
  return `${(b / (1024 * 1024)).toFixed(1)} ميغابايت`;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function SMRecordingsPage({
  searchParams,
}: {
  searchParams: Promise<{ station?: string; presenter?: string; q?: string; page?: string }>;
}) {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "STATION_MANAGER") return <Unauthorized role={role} />;

  const managerId   = (session.user as { id?: string }).id ?? "";
  const managerName = session.user.name ?? "مدير المحطة";

  // ── 2. Assigned stations ───────────────────────────────────────────────────
  const assignments = await prisma.stationManagerAssignment.findMany({
    where:   { managerId, isActive: true },
    select:  { stationId: true, station: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  const stationIds = assignments.map((a) => a.stationId);
  const stationMap = new Map(assignments.map((a) => [a.station.id, a.station.name]));

  if (stationIds.length === 0) {
    return <NoStationsPage managerName={managerName} />;
  }

  // ── 3. Parse filter params ─────────────────────────────────────────────────
  const sp = await searchParams;
  const filterStation   = sp.station   ?? "";
  const filterPresenter = sp.presenter ?? "";
  const q               = sp.q         ?? "";
  const page            = Math.max(1, parseInt(sp.page ?? "1", 10));

  // Parse comma-separated multi-select station IDs
  const queryIds = filterStation
    ? filterStation.split(",").filter((id) => stationIds.includes(id))
    : [];
  const effectiveQueryIds = queryIds.length > 0 ? queryIds : stationIds;

  // ── 4. Resolve presenters on queried stations ──────────────────────────────
  const presenterStationRows = await prisma.presenterStation.findMany({
    where:  { stationId: { in: queryIds }, isActive: true },
    select: { presenterId: true, stationId: true, presenter: { select: { id: true, name: true, username: true } } },
  });

  const presenterToStation = new Map<string, string>();
  for (const ps of presenterStationRows) {
    if (!presenterToStation.has(ps.presenterId))
      presenterToStation.set(ps.presenterId, ps.stationId);
  }
  const legacyPresenterIds = [...new Set(presenterStationRows.map((ps) => ps.presenterId))];

  // Unique presenters for filter dropdown
  const presenterOptions = Array.from(
    new Map(presenterStationRows.map(ps => [ps.presenterId, ps.presenter])).values()
  ).sort((a, b) => (a.name ?? a.username).localeCompare(b.name ?? b.username));

  // ── 5. Build where clause ──────────────────────────────────────────────────
  // Apply presenter filter
  const presenterFilter = filterPresenter && legacyPresenterIds.includes(filterPresenter)
    ? filterPresenter : null;

  const baseWhere: Record<string, any> = {
    directDjRadioId: null,
    OR: [
      {
        stationId: { in: effectiveQueryIds },
        ...(presenterFilter ? { presenterId: presenterFilter } : {}),
      },
      {
        stationId: null,
        presenterId: presenterFilter
          ? presenterFilter
          : { in: legacyPresenterIds },
      },
    ],
  };

  // Text search
  if (q.trim()) {
    (baseWhere as any).OR = (baseWhere as any).OR.map((clause: any) => ({
      ...clause,
      OR: [
        { presenterNameSnapshot: { contains: q, mode: "insensitive" } },
        { localPath:             { contains: q, mode: "insensitive" } },
      ],
    }));
  }

  // ── 6. Query recordings + count ───────────────────────────────────────────
  let recordings: {
    id: string; localPath: string; startedAt: Date; endedAt: Date | null;
    durationSeconds: number | null; bytesReceived: number | null; format: string;
    stationId: string | null; presenterId: string | null;
    presenter: { name: string | null; username: string } | null;
    program:   { title: string } | null;
  }[] = [];

  let totalCount = 0;
  let dbError = false;

  try {
    [recordings, totalCount] = await Promise.all([
      prisma.recording.findMany({
        where:   baseWhere,
        select: {
          id: true, localPath: true, startedAt: true, endedAt: true,
          durationSeconds: true, bytesReceived: true, format: true,
          stationId: true, presenterId: true,
          presenter: { select: { name: true, username: true } },
          program:   { select: { title: true } },
        },
        orderBy: { startedAt: "desc" },
        skip:    (page - 1) * PAGE_SIZE,
        take:    PAGE_SIZE,
      }),
      prisma.recording.count({ where: baseWhere }),
    ]);
  } catch {
    dbError = true;
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // ── 7. Helpers ─────────────────────────────────────────────────────────────
  function resolveStation(rec: { stationId: string | null; presenterId: string | null }): string {
    if (rec.stationId) return stationMap.get(rec.stationId) ?? "—";
    const derived = rec.presenterId ? presenterToStation.get(rec.presenterId) : undefined;
    return derived ? (stationMap.get(derived) ?? "—") : "—";
  }

  // Stations with count for dropdown
  const stationsForFilter = Array.from(stationMap.entries()).map(([id, name]) => ({ id, name }));

  // ── 8. Render ──────────────────────────────────────────────────────────────
  return (
    <div dir="rtl" className="min-h-screen bg-slate-950 text-slate-100"
      style={{ fontFamily: "'Cairo','Segoe UI',system-ui,sans-serif" }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap" />

      {/* ── Header ── */}
      <header className="bg-slate-900 border-b border-slate-800 shadow-lg sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/station-manager"
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-slate-100 transition-colors"
              aria-label="العودة للوحة">←</Link>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-lg shadow flex-shrink-0">🗂️</div>
            <div>
              <h1 className="text-base font-bold text-slate-100 leading-tight">تسجيلات المحطة</h1>
              <p className="text-xs text-slate-500">{managerName}</p>
            </div>
          </div>
          <Link href="/station-manager"
            className="text-xs text-slate-400 hover:text-teal-300 border border-slate-700 hover:border-teal-600/50 rounded-lg px-3 py-2 transition-colors">
            ← اللوحة
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* ── DB error ── */}
        {dbError && (
          <div className="bg-red-950/40 border border-red-500/30 rounded-2xl p-8 text-center text-red-400 text-sm">
            حدث خطأ أثناء تحميل التسجيلات. حاول تحديث الصفحة.
          </div>
        )}

        {/* ── Filter bar ── */}
        {!dbError && (
          <div className="flex flex-col sm:flex-row gap-2">
            {stationIds.length > 1 && (
              <SMStationFilter
                stations={stationsForFilter}
                paramKey="station"
                accent="amber"
                allLabel="كل المحطات"
              />
            )}
            <SMPresenterFilter presenters={presenterOptions} paramKey="presenter" />
            <SMSearchBar placeholder="بحث في التسجيلات..." paramKey="q" />
          </div>
        )}

        {/* ── Empty state ── */}
        {!dbError && recordings.length === 0 && (
          <EmptyState icon="🎙️"
            title={(filterStation || filterPresenter || q) ? "لا توجد تسجيلات مطابقة" : "لا توجد تسجيلات بعد"}
            description={(filterStation || filterPresenter || q) ? "جرب تعديل فلاتر البحث." : "ستظهر هنا تسجيلات جلسات البث فور اكتمالها."}
          />
        )}

        {/* ── Recording list ── */}
        {!dbError && recordings.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-widest">
                التسجيلات ({totalCount})
              </h2>
              {totalPages > 1 && (
                <span className="text-xs text-slate-500">صفحة {page} من {totalPages}</span>
              )}
            </div>
            <div className="space-y-3">
              {recordings.map((rec) => {
                const playUrl   = recordingPlayUrl(rec.localPath);
                const dlUrl     = recordingDownloadUrl(rec.localPath);
                const mime      = recordingMimeType(rec.localPath);
                const station   = resolveStation(rec);
                const presenter = rec.presenter?.name ?? rec.presenter?.username
                  ?? (rec as any).presenterNameSnapshot ?? "—";
                const program   = rec.program?.title ?? null;
                const dateStr   = fmt(rec.startedAt);
                const dur       = rec.durationSeconds != null ? fmtDur(rec.durationSeconds) : null;
                const size      = rec.bytesReceived  != null ? fmtBytes(rec.bytesReceived)  : null;

                return (
                  <article key={rec.id}
                    className="bg-slate-900 border border-slate-700/40 hover:border-amber-700/40 rounded-2xl overflow-hidden transition-colors group">
                    <div className="h-0.5 w-full bg-gradient-to-l from-amber-600/0 via-amber-500/40 to-amber-600/0 group-hover:via-amber-400/60 transition-colors" />
                    <div className="px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-lg mb-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                            </svg>
                            <span className="text-sm font-medium text-slate-200 truncate">{presenter}</span>
                            <span className="text-xs text-slate-500 font-mono hidden sm:inline">@{rec.presenter?.username ?? "—"}</span>
                          </div>

                          {program && <p className="text-xs font-semibold text-teal-400 mb-0.5">📺 {program}</p>}

                          <p className="text-xs text-slate-400">
                            <span className="text-amber-400 font-medium">📡 {station}</span>
                            <span className="text-slate-600 mx-1.5">·</span>
                            <span>🕐 {dateStr}</span>
                          </p>
                        </div>

                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          {dur && <span className="text-xs text-cyan-400 font-medium bg-cyan-950/30 border border-cyan-700/30 px-2 py-0.5 rounded-lg">⏱ {dur}</span>}
                          {size && <span className="text-xs text-slate-500 bg-slate-800/60 border border-slate-700/30 px-2 py-0.5 rounded-lg">{size}</span>}
                          <span className="text-[10px] text-slate-600 font-mono bg-slate-800/40 border border-slate-700/20 px-2 py-0.5 rounded-lg truncate max-w-[150px]" title={rec.localPath}>
                            {rec.localPath}
                          </span>
                        </div>
                      </div>

                      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                      <audio controls preload="none" src={playUrl}
                        className="w-full h-9 rounded-lg mt-1 mb-3" style={{ colorScheme: "dark" }}>
                        <source src={playUrl} type={mime} />
                        متصفحك لا يدعم تشغيل الصوت.
                      </audio>

                      <div className="flex items-center gap-2 flex-wrap">
                        <a href={playUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 border border-teal-700/30 hover:border-teal-500/50 rounded-lg px-3 py-1.5 transition-colors">
                          ▶ فتح
                        </a>
                        <a href={dlUrl} download={rec.localPath}
                          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 bg-slate-800/60 hover:bg-slate-800 rounded-lg px-3 py-1.5 transition-colors">
                          ⬇ تنزيل
                        </a>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {/* ── Pagination ── */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                {page > 1 && (
                  <Link
                    href={`?${new URLSearchParams({ ...(filterStation ? { station: filterStation } : {}), ...(filterPresenter ? { presenter: filterPresenter } : {}), ...(q ? { q } : {}), page: String(page - 1) }).toString()}`}
                    className="text-xs border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-slate-200 rounded-lg px-3 py-1.5 transition-colors">
                    ← السابق
                  </Link>
                )}
                <span className="text-xs text-slate-500 px-2">{page} / {totalPages}</span>
                {page < totalPages && (
                  <Link
                    href={`?${new URLSearchParams({ ...(filterStation ? { station: filterStation } : {}), ...(filterPresenter ? { presenter: filterPresenter } : {}), ...(q ? { q } : {}), page: String(page + 1) }).toString()}`}
                    className="text-xs border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-slate-200 rounded-lg px-3 py-1.5 transition-colors">
                    التالي →
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ── No-stations fallback ───────────────────────────────────────────────────────

function NoStationsPage({ managerName }: { managerName: string }) {
  return (
    <div dir="rtl" className="min-h-screen bg-slate-950 text-slate-100 flex flex-col"
      style={{ fontFamily: "'Cairo','Segoe UI',system-ui,sans-serif" }}>
      <header className="bg-slate-900 border-b border-slate-800 shadow-lg">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link href="/station-manager" className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-slate-100 transition-colors">←</Link>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-lg shadow">🗂️</div>
          <div>
            <h1 className="text-base font-bold text-slate-100">تسجيلات المحطة</h1>
            <p className="text-xs text-slate-500">{managerName}</p>
          </div>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center p-8">
        <EmptyState icon="📭" title="لا توجد محطات مسندة"
          description="تواصل مع الإدارة لتفعيل المحطات المرتبطة بحسابك."
          action={<Link href="/station-manager" className="text-sm text-slate-400 hover:text-teal-300 border border-slate-700 hover:border-teal-600/30 rounded-lg px-4 py-2 transition-colors">← العودة للوحة</Link>}
        />
      </main>
    </div>
  );
}
