import { auth, prisma } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { signOut } from "@/auth";
import { RecordingFullCard } from "@/components/recordings/RecordingPlayer";

export const metadata = {
  title: "أرشيف التسجيلات - EGONAIR",
};

export const dynamic = "force-dynamic";

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function RecordingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    dateFrom?: string;
    dateTo?: string;
    sort?: string;
    station?: string;
  }>;
}) {

  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const session = await auth();

  if (!session) redirect("/login");
  if ((session.user as { role?: string }).role !== "PRESENTER") redirect("/login");

  const userId = session.user?.id;
  if (!userId) redirect("/login");

  // ── 2. Parse search params ─────────────────────────────────────────────────
  const {
    page: pageParam,
    pageSize: pageSizeParam,
    dateFrom: dateFromParam,
    dateTo: dateToParam,
    sort: sortParam,
    station: stationParam,
  } = await searchParams;

  const validPageSizes = [10, 20, 40, 60];
  const parsedPageSize = parseInt(pageSizeParam || "20", 10);
  const pageSize = validPageSizes.includes(parsedPageSize) ? parsedPageSize : 20;

  let page = parseInt(pageParam || "1", 10);
  if (isNaN(page) || page < 1) page = 1;

  const dateFrom = dateFromParam?.trim() || "";
  const dateTo   = dateToParam?.trim() || "";
  const sortKey  = sortParam || "newest";
  const stationFilter = stationParam?.trim() || "";

  // ── 3. Build where clause ──────────────────────────────────────────────────
  const whereClause: Record<string, any> = { presenterId: userId };

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
  if (stationFilter) {
    whereClause.stationId = stationFilter;
  }

  // ── 4. Sort ────────────────────────────────────────────────────────────────
  const sortMap: Record<string, any> = {
    newest:          { startedAt: "desc" },
    oldest:          { startedAt: "asc" },
    "duration-high": { durationSeconds: "desc" },
    "duration-low":  { durationSeconds: "asc" },
  };
  const orderBy = sortMap[sortKey] ?? { startedAt: "desc" };

  // ── 5. Fetch data ──────────────────────────────────────────────────────────
  let recordings: {
    id: string;
    localPath: string;
    startedAt: Date;
    endedAt: Date | null;
    durationSeconds: number | null;
    bytesReceived: number | null;
    format: string;
    stationNameSnapshot: string | null;
    sourceType: string | null;
  }[] = [];

  let totalCount = 0;
  let dbError = false;
  let presenterStations: { id: string; name: string }[] = [];

  try {
    // Get stations this presenter is assigned to (for filter dropdown)
    const links = await prisma.presenterStation.findMany({
      where:  { presenterId: userId, isActive: true },
      select: { station: { select: { id: true, name: true } } },
    });
    presenterStations = links.map(l => l.station);

    totalCount = await prisma.recording.count({ where: whereClause });

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    if (page > totalPages) page = totalPages;
    const skip = (page - 1) * pageSize;

    recordings = await prisma.recording.findMany({
      where:   whereClause,
      orderBy,
      skip,
      take:    pageSize,
      select: {
        id:                  true,
        localPath:           true,
        startedAt:           true,
        endedAt:             true,
        durationSeconds:     true,
        bytesReceived:       true,
        format:              true,
        stationNameSnapshot: true,
        sourceType:          true,
      },
    });
  } catch {
    dbError = true;
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasFilters = !!(dateFrom || dateTo || (stationFilter && stationFilter !== ""));

  // ── URL builder for pagination ───────────────────────────────────────────────
  const buildUrl = (p: number) => {
    const params = new URLSearchParams();
    params.set("page", p.toString());
    if (pageSize !== 20) params.set("pageSize", pageSize.toString());
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (sortKey !== "newest") params.set("sort", sortKey);
    if (stationFilter) params.set("station", stationFilter);
    return `/studio/recordings?${params.toString()}`;
  };

  // ── Pagination component ─────────────────────────────────────────────────────
  const renderPagination = () => (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-neutral-900 border border-neutral-800 rounded-2xl p-4 my-5 gap-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <div className="text-sm text-neutral-400">
          صفحة <span className="text-neutral-200 font-medium">{page}</span> من <span className="text-neutral-200 font-medium">{totalPages}</span>
        </div>
        <div className="text-xs text-neutral-500">
          (إجمالي {totalCount} تسجيل)
        </div>
      </div>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={buildUrl(page - 1)} className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium rounded-lg border border-neutral-700 transition-colors">
            السابق
          </Link>
        ) : (
          <span className="px-4 py-1.5 bg-neutral-800/30 text-neutral-600 text-xs font-medium rounded-lg border border-neutral-800/50 cursor-not-allowed">
            السابق
          </span>
        )}
        {page < totalPages ? (
          <Link href={buildUrl(page + 1)} className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium rounded-lg border border-neutral-700 transition-colors">
            التالي
          </Link>
        ) : (
          <span className="px-4 py-1.5 bg-neutral-800/30 text-neutral-600 text-xs font-medium rounded-lg border border-neutral-800/50 cursor-not-allowed">
            التالي
          </span>
        )}
      </div>
    </div>
  );

  // ── 6. Render ──────────────────────────────────────────────────────────────
  return (
    <div
      dir="rtl"
      className="min-h-screen bg-neutral-950 text-neutral-100 font-sans"
    >
      {/* ── Background glow ── */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[min(700px,100vw)] h-[min(400px,100vw)] bg-indigo-600/5 rounded-full blur-[120px]" />
      </div>

      {/* ── Top bar ── */}
      <header className="relative z-10 border-b border-neutral-800/60 bg-neutral-950/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* Title */}
          <div className="flex items-center gap-3">
            {/* Waveform icon */}
            <div className="w-9 h-9 bg-indigo-600/20 border border-indigo-500/30 rounded-xl flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-5 h-5 text-indigo-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-neutral-100 leading-none">
                أرشيف التسجيلات
              </h1>
              <p className="text-xs text-neutral-500 mt-0.5">
                تسجيلاتك الصوتية المحفوظة
              </p>
            </div>
          </div>

          {/* Nav buttons */}
          <div className="flex items-center gap-2">
            <Link
              href="/studio"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-200 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-lg transition-colors"
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
                <path d="M19 12H5" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              الاستوديو
            </Link>

            {/* Logout */}
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-red-400 bg-neutral-900 hover:bg-red-500/10 border border-neutral-800 hover:border-red-500/30 rounded-lg transition-colors"
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
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                خروج
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="relative z-10 max-w-4xl mx-auto px-6 py-10">

        {/* ── Filters ── */}
        <form method="get" className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 mb-6">
          <div className="flex flex-wrap items-end gap-3">

            {/* Sort */}
            <div className="flex flex-col gap-1 min-w-[130px]">
              <label htmlFor="sort" className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">الترتيب</label>
              <select
                id="sort"
                name="sort"
                defaultValue={sortKey}
                className="bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-indigo-500 transition-colors"
              >
                <option value="newest">الأحدث أولاً</option>
                <option value="oldest">الأقدم أولاً</option>
                <option value="duration-high">المدة (تنازلي)</option>
                <option value="duration-low">المدة (تصاعدي)</option>
              </select>
            </div>

            {/* Station filter */}
            {presenterStations.length > 1 && (
              <div className="flex flex-col gap-1 min-w-[140px]">
                <label htmlFor="station" className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">المحطة</label>
                <select
                  id="station"
                  name="station"
                  defaultValue={stationFilter}
                  className="bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-indigo-500 transition-colors"
                >
                  <option value="">جميع المحطات</option>
                  {presenterStations.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Date from */}
            <div className="flex flex-col gap-1">
              <label htmlFor="dateFrom" className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">من تاريخ</label>
              <input
                type="date"
                id="dateFrom"
                name="dateFrom"
                defaultValue={dateFrom}
                className="bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            {/* Date to */}
            <div className="flex flex-col gap-1">
              <label htmlFor="dateTo" className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">إلى تاريخ</label>
              <input
                type="date"
                id="dateTo"
                name="dateTo"
                defaultValue={dateTo}
                className="bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors shadow-md shadow-indigo-500/20"
              >
                بحث
              </button>
              {hasFilters && (
                <Link
                  href="/studio/recordings"
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 text-xs font-medium rounded-lg border border-neutral-700 transition-colors"
                >
                  مسح
                </Link>
              )}
            </div>
          </div>
        </form>

        {/* DB error state */}
        {dbError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-center mb-8">
            <p className="text-red-400 font-medium">
              تعذّر تحميل التسجيلات. يرجى المحاولة مجدداً.
            </p>
          </div>
        )}

        {/* Empty state */}
        {!dbError && recordings.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 bg-neutral-900 border border-neutral-800 rounded-full flex items-center justify-center mb-6 shadow-inner">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-9 h-9 text-neutral-600"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </div>
            <p className="text-xl font-semibold text-neutral-300 mb-2">
              {hasFilters ? "لا توجد تسجيلات تطابق بحثك" : "لا توجد تسجيلات بعد"}
            </p>
            <p className="text-sm text-neutral-500 max-w-xs leading-relaxed">
              {hasFilters
                ? "جرب تعديل الفلاتر أو مسحها لرؤية نتائج أكثر."
                : "ستظهر هنا تسجيلاتك الصوتية تلقائياً بعد انتهاء كل جلسة بث."
              }
            </p>
            {hasFilters && (
              <Link
                href="/studio/recordings"
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 border border-neutral-700 text-sm rounded-lg transition-colors"
              >
                مسح الفلاتر
              </Link>
            )}
          </div>
        )}

        {/* Recording list */}
        {!dbError && recordings.length > 0 && (
          <div className="space-y-4">
            {/* Count badge + pagination top */}
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-neutral-500">
                {totalCount === 1
                  ? "تسجيل واحد محفوظ"
                  : `${totalCount} تسجيل محفوظ`}
              </p>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-600/20 border border-indigo-500/30 rounded-full text-xs text-indigo-300 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />
                تخزين محلي
              </span>
            </div>

            {renderPagination()}

            {recordings.map((rec) => (
              <div key={rec.id} className="space-y-1">
                {/* Station badge above the card */}
                {rec.stationNameSnapshot ? (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-teal-900/30 border border-teal-700/40 rounded-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-teal-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                    </svg>
                    <span className="text-xs font-medium text-teal-300">{rec.stationNameSnapshot}</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-900/30 border border-purple-700/40 rounded-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-purple-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="2" />
                      <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
                    </svg>
                    <span className="text-xs font-medium text-purple-300">مباشر DJ</span>
                  </div>
                )}
                <RecordingFullCard rec={rec} />
              </div>
            ))}

            {renderPagination()}
          </div>
        )}
      </main>
    </div>
  );
}
