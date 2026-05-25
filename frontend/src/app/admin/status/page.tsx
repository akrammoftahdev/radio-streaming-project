import Link from "next/link";
import { AdminPageShell } from "@/components/ui";

export const metadata = {
  title: "حالة المشروع - EGONAIR",
};

type Status = "done" | "experimental" | "pending";

interface Module {
  name: string;
  detail: string;
  status: Status;
}

const modules: Module[] = [
  {
    name: "تسجيل دخول المدير",
    detail: "Auth.js v5 · JWT · bcrypt · حماية مسارات /admin",
    status: "done",
  },
  {
    name: "إنشاء / عرض / تعديل المذيعين",
    detail: "CRUD كامل · جدول إدارة · حماية المسارات · Next.js 15 params fix",
    status: "done",
  },
  {
    name: "بوابة الجدولة الزمنية",
    detail: "allowConnectMinutesBefore · تحقق من الوقت الحالي مقارنةً بالموعد",
    status: "done",
  },
  {
    name: "تشفير بيانات SonicPanel",
    detail: "AES-256-GCM · مخزّن مشفّر في قاعدة البيانات · فك تشفير عند الحاجة",
    status: "done",
  },
  {
    name: "مكتبة الوسائط",
    detail: "أقسام BACKGROUND / SONG · إدارة المسارات · واجهة مدير كاملة",
    status: "done",
  },
  {
    name: "تسجيل دخول المذيع",
    detail: "نفس نظام Auth.js · role=PRESENTER · توجيه تلقائي إلى /studio",
    status: "done",
  },
  {
    name: "شاشة الانتظار مع العداد التنازلي",
    detail: "عداد حي بالثانية · يُحدّث نفسه · زر دخول فور انتهاء الوقت",
    status: "done",
  },
  {
    name: "فحص ما قبل الإقلاع (طلب إذن الميكروفون)",
    detail: "فحص المتصفح + الخادم + الميكروفون · منع الدخول قبل الاكتمال",
    status: "done",
  },
  {
    name: "واجهة الاستوديو",
    detail: "تحكم بالميكروفون · مكتبة الوسائط · إرسال الحالة · RTL كاملة",
    status: "done",
  },
  {
    name: "مؤشر مستوى الميكروفون الحي",
    detail: "Web Audio API · AnalyserNode · أنيميشن SVG bars حي",
    status: "done",
  },
  {
    name: "نبضة الجلسة الحية (Heartbeat)",
    detail: "إرسال كل 5 ثوانٍ · تحديث LiveSession في قاعدة البيانات",
    status: "done",
  },
  {
    name: "مراقبة الجلسات الحية للمدير",
    detail: "جدول حي · تحديث تلقائي كل 5 ثوانٍ · كشف الجلسات المتأخرة",
    status: "done",
  },
  {
    name: "نقطة قطع الاتصال (Disconnect)",
    detail: "POST /api/studio/disconnect · تحديث disconnectedAt في قاعدة البيانات",
    status: "done",
  },
];

const badgeConfig: Record<Status, { label: string; className: string; dot: string }> = {
  done: {
    label: "مكتمل",
    className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
    dot: "bg-emerald-500",
  },
  experimental: {
    label: "تجريبي",
    className: "bg-amber-500/10 text-amber-400 border-amber-500/25",
    dot: "bg-amber-500",
  },
  pending: {
    label: "لم يبدأ",
    className: "bg-neutral-700/40 text-neutral-500 border-neutral-700",
    dot: "bg-neutral-600",
  },
};

export default function StatusPage() {
  const total = modules.length;
  const done = modules.filter((m) => m.status === "done").length;
  const experimental = modules.filter((m) => m.status === "experimental").length;
  const pending = modules.filter((m) => m.status === "pending").length;
  const progressPct = Math.round((done / total) * 100);

  return (
    <AdminPageShell maxWidth="max-w-3xl" padding="p-8">

      {/* Header — kept as-is: gradient h1 + inline back link */}
      <div className="mb-10 flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-3xl font-bold bg-clip-text text-transparent mb-1"
            style={{ backgroundImage: "linear-gradient(to left, var(--eg-primary), var(--eg-accent))" }}
          >
            حالة المرحلة الأولى
          </h1>
          <p className="text-sm text-neutral-500">EGONAIR Remote Studio · Phase 1</p>
        </div>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-neutral-800 rounded-lg transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
          لوحة الإدارة
        </Link>
      </div>

      {/* Progress summary */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 mb-8 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-neutral-400">اكتمال المرحلة الأولى</span>
          <span className="text-2xl font-bold" style={{ color: "var(--eg-primary)" }}>{progressPct}٪</span>
        </div>
        <div className="w-full bg-neutral-800 rounded-full h-2.5 mb-5 overflow-hidden">
          <div
            className="h-2.5 rounded-full transition-all"
            style={{
              backgroundImage: "linear-gradient(to left, var(--eg-primary), var(--eg-accent))",
              width: `${progressPct}%`,
            }}
          />
        </div>
        <div className="flex gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-neutral-400">مكتمل</span>
            <span className="font-bold text-emerald-400">{done}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-neutral-400">تجريبي</span>
            <span className="font-bold text-amber-400">{experimental}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-neutral-600" />
            <span className="text-neutral-400">لم يبدأ</span>
            <span className="font-bold text-neutral-500">{pending}</span>
          </div>
        </div>
      </div>

      {/* Module list */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-neutral-800 bg-neutral-950/40">
          <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">الوحدات ({total})</h2>
        </div>
        <ul className="divide-y divide-neutral-800/60">
          {modules.map((mod, i) => {
            const badge = badgeConfig[mod.status];
            return (
              <li
                key={i}
                className="flex items-start justify-between gap-4 px-6 py-4 hover:bg-neutral-800/20 transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span className="mt-0.5 flex-shrink-0 w-6 h-6 rounded-md bg-neutral-800 text-neutral-500 text-xs font-mono flex items-center justify-center">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-neutral-200 leading-snug">{mod.name}</p>
                    <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">{mod.detail}</p>
                  </div>
                </div>
                <span className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${badge.className}`}>
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${badge.dot}`} />
                  {badge.label}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Footer */}
      <p className="mt-6 text-center text-xs text-neutral-700">
        EGONAIR · Phase 1 · {new Date().getFullYear()}
      </p>

    </AdminPageShell>
  );
}
