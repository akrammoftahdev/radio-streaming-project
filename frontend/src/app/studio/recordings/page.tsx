import { auth, prisma } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { signOut } from "@/auth";
import { RecordingFullCard } from "@/components/recordings/RecordingPlayer";

export const metadata = {
  title: "أرشيف التسجيلات - EGONAIR",
};

export const dynamic = "force-dynamic";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Format a Date as a full Arabic weekday + date string, e.g. "الثلاثاء، 28 أبريل 2026" */
function formatArabicDate(d: Date): string {
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone:  "Africa/Cairo",
    weekday:   "long",
    year:      "numeric",
    month:     "long",
    day:       "numeric",
  }).format(d);
}

/** Format a Date as HH:MM time in Arabic locale */
function formatArabicTime(d: Date): string {
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: "Africa/Cairo",
    hour:     "numeric",
    minute:   "2-digit",
  }).format(d);
}

/** Convert durationSeconds to "X د Y ث" Arabic string */
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} ث`;
  if (s === 0) return `${m} د`;
  return `${m} د ${s} ث`;
}

/** Format bytes to a human-readable Arabic string */
function formatBytes(bytes: number): string {
  if (bytes < 1024)       return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميغابايت`;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function RecordingsPage() {

  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  if ((session.user as { role?: string }).role !== "PRESENTER") {
    redirect("/login");
  }

  const userId = session.user?.id;
  if (!userId) {
    redirect("/login");
  }

  // ── 2. Fetch recordings (newest first) ────────────────────────────────────
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

  let dbError = false;
  try {
    recordings = await prisma.recording.findMany({
      where:   { presenterId: userId },
      orderBy: { startedAt: "desc" },
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

  // ── 3. Render ─────────────────────────────────────────────────────────────
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
              لا توجد تسجيلات بعد
            </p>
            <p className="text-sm text-neutral-500 max-w-xs leading-relaxed">
              ستظهر هنا تسجيلاتك الصوتية تلقائياً بعد انتهاء كل جلسة بث.
            </p>
          </div>
        )}

        {/* Recording list */}
        {!dbError && recordings.length > 0 && (
          <div className="space-y-4">
            {/* Count badge */}
            <div className="flex items-center justify-between mb-6">
              <p className="text-sm text-neutral-500">
                {recordings.length === 1
                  ? "تسجيل واحد محفوظ"
                  : `${recordings.length} تسجيلات محفوظة`}
              </p>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-600/20 border border-indigo-500/30 rounded-full text-xs text-indigo-300 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />
                تخزين محلي
              </span>
            </div>

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
          </div>
        )}
      </main>
    </div>
  );
}
