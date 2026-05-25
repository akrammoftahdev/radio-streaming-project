import { auth, prisma } from "@/auth";
import { redirect }     from "next/navigation";
import Link             from "next/link";
import { AdminPageShell } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "تدقيق الجداول - الإدارة - EGONAIR" };

// ── Helpers ────────────────────────────────────────────────────────────────────
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m ?? 0);
}

function slotsOverlap(
  aStart: string, aEnd: string,
  bStart: string, bEnd: string
): boolean {
  const [as_, ae] = [timeToMinutes(aStart), timeToMinutes(aEnd)];
  const [bs, be]  = [timeToMinutes(bStart), timeToMinutes(bEnd)];
  return as_ < be && bs < ae;
}

type Severity  = "ERROR" | "WARNING" | "INFO";
type AuditIssue = {
  severity:    Severity;
  type:        string;
  description: string;
  stationName?: string;
  programTitle?: string;
  presenterName?: string;
  suggestion:  string;
};

const AUDIT_PAGE_SIZE = 10;

const CHECK_TYPES: { key: string; label: string }[] = [
  { key: "A", label: "A — تداخل في نفس المحطة"       },
  { key: "B", label: "B — تداخل نفس المذيع (محطتان)" },
  { key: "C", label: "C — مذيع غير مرتبط بمحطة"       },
  { key: "D", label: "D — DJ مباشر في برنامج"          },
  { key: "E", label: "E — مذيع محطة واحدة على أكثر"   },
  { key: "F", label: "F — برنامج نشط بلا جدول"         },
  { key: "G", label: "G — برنامج على محطة معطّلة"     },
];

const TYPE_KEY_MAP: Record<string, string> = {
  A: "تداخل جدول في نفس المحطة",
  B: "تداخل جدول نفس المذيع (محطتان)",
  C: "مذيع غير مرتبط بمحطة البرنامج",
  D: "مذيع DJ مباشر في برنامج",
  E: "مذيع محطة واحدة على أكثر من محطة",
  F: "برنامج نشط بلا جدول",
  G: "برنامج نشط على محطة معطّلة",
};

export default async function ScheduleAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string; station?: string; types?: string; page?: string }>;
}) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await auth();
  if (!session?.user) redirect("/login");
  if ((session.user as { role?: string }).role !== "ADMIN") redirect("/login");

  const { severity = "all", station: filterStation = "", types: typesParam = "", page: pageParam = "1" } = await searchParams;
  const filterTypes = typesParam.split(",").filter(Boolean);
  const page        = Math.max(1, parseInt(pageParam, 10));

  // ── Load data ─────────────────────────────────────────────────────────────
  const [programs, stations, presenterStations] = await Promise.all([
    prisma.program.findMany({
      where:   { isActive: true },
      select: {
        id: true, title: true, isActive: true,
        presenterId: true, stationId: true,
        presenter: { select: { id: true, username: true, name: true, presenterMode: true } },
        station:   { select: { id: true, name: true, isActive: true } },
        scheduleRules: {
          select: {
            id: true, recurrenceType: true,
            slots: { select: { dayOfWeek: true, startTime: true, endTime: true } },
          },
        },
      },
    }),
    prisma.station.findMany({
      select: { id: true, name: true, isActive: true },
    }),
    prisma.presenterStation.findMany({
      where:  { isActive: true },
      select: { presenterId: true, stationId: true },
    }),
  ]);

  const issues: AuditIssue[] = [];

  // ── Build lookup maps ──────────────────────────────────────────────────────
  const stationMap = new Map(stations.map(s => [s.id, s]));
  // presenter → set of active stationIds
  const presenterStationSet = new Map<string, Set<string>>();
  for (const ps of presenterStations) {
    if (!presenterStationSet.has(ps.presenterId)) presenterStationSet.set(ps.presenterId, new Set());
    presenterStationSet.get(ps.presenterId)!.add(ps.stationId);
  }

  // ── Check A: same-station slot overlap ────────────────────────────────────
  const byStation = new Map<string, typeof programs>();
  for (const p of programs) {
    if (!byStation.has(p.stationId)) byStation.set(p.stationId, []);
    byStation.get(p.stationId)!.push(p);
  }

  for (const [stationId, progs] of byStation) {
    const sName = stationMap.get(stationId)?.name ?? stationId;
    for (let i = 0; i < progs.length; i++) {
      for (let j = i + 1; j < progs.length; j++) {
        const a = progs[i], b = progs[j];
        for (const rA of a.scheduleRules) {
          for (const rB of b.scheduleRules) {
            for (const sA of rA.slots) {
              for (const sB of rB.slots) {
                const sameDow = sA.dayOfWeek === null || sB.dayOfWeek === null || sA.dayOfWeek === sB.dayOfWeek;
                if (sameDow && sA.startTime && sA.endTime && sB.startTime && sB.endTime &&
                    slotsOverlap(sA.startTime, sA.endTime, sB.startTime, sB.endTime)) {
                  issues.push({
                    severity: "ERROR", type: "تداخل جدول في نفس المحطة",
                    description: `"${a.title}" و"${b.title}" على "${sName}" (${sA.startTime}–${sA.endTime} ↔ ${sB.startTime}–${sB.endTime})`,
                    stationName: sName, programTitle: `${a.title} / ${b.title}`,
                    suggestion: "عدّل مواعيد أحد البرنامجين لإزالة التداخل.",
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  // ── Check B: same-presenter overlap across stations ────────────────────────
  const byPresenter = new Map<string, typeof programs>();
  for (const p of programs) {
    if (!byPresenter.has(p.presenterId)) byPresenter.set(p.presenterId, []);
    byPresenter.get(p.presenterId)!.push(p);
  }

  for (const [, progs] of byPresenter) {
    if (progs.length < 2) continue;
    const pName = progs[0].presenter?.name || progs[0].presenter?.username || progs[0].presenterId;
    for (let i = 0; i < progs.length; i++) {
      for (let j = i + 1; j < progs.length; j++) {
        const a = progs[i], b = progs[j];
        if (a.stationId === b.stationId) continue; // already caught in check A
        for (const rA of a.scheduleRules) {
          for (const rB of b.scheduleRules) {
            for (const sA of rA.slots) {
              for (const sB of rB.slots) {
                const sameDow = sA.dayOfWeek === null || sB.dayOfWeek === null || sA.dayOfWeek === sB.dayOfWeek;
                if (sameDow && sA.startTime && sA.endTime && sB.startTime && sB.endTime &&
                    slotsOverlap(sA.startTime, sA.endTime, sB.startTime, sB.endTime)) {
                  issues.push({
                    severity: "ERROR", type: "تداخل جدول نفس المذيع (محطتان)",
                    description: `المذيع "${pName}" جُدول في برنامجين في نفس الوقت عبر محطتين مختلفتين.`,
                    presenterName: pName, programTitle: `${a.title} / ${b.title}`,
                    suggestion: "المذيع لا يمكنه البث على محطتين في نفس الوقت.",
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  // ── Check C: presenter-station mismatch ───────────────────────────────────
  for (const p of programs) {
    const linkedStations = presenterStationSet.get(p.presenterId);
    if (!linkedStations || !linkedStations.has(p.stationId)) {
      issues.push({
        severity: "WARNING", type: "مذيع غير مرتبط بمحطة البرنامج",
        description: `البرنامج "${p.title}" مرتبط بمذيع لم يُضَف لمحطة "${p.station?.name ?? p.stationId}".`,
        stationName: p.station?.name, programTitle: p.title,
        presenterName: p.presenter?.name || p.presenter?.username,
        suggestion: "أضف المذيع إلى المحطة من صفحة تعديل المذيع.",
      });
    }
  }

  // ── Check D: DIRECT_DJ in program table ───────────────────────────────────
  for (const p of programs) {
    if (p.presenter?.presenterMode === "DIRECT_DJ") {
      issues.push({
        severity: "ERROR", type: "مذيع DJ مباشر في برنامج",
        description: `مذيع DJ مباشر "${p.presenter.username}" مُضاف لبرنامج "${p.title}" — هذا غير مدعوم.`,
        programTitle: p.title, presenterName: p.presenter.username,
        suggestion: "احذف هذا البرنامج. مذيعو DJ المباشر لا يستخدمون جداول البرامج.",
      });
    }
  }

  // ── Check E: SINGLE_STATION presenter on multiple stations ────────────────
  for (const p of programs) {
    if (p.presenter?.presenterMode === "SINGLE_STATION") {
      const stns = presenterStationSet.get(p.presenterId);
      if (stns && stns.size > 1) {
        issues.push({
          severity: "WARNING", type: "مذيع محطة واحدة على أكثر من محطة",
          description: `المذيع "${p.presenter.username}" (SINGLE_STATION) مرتبط بـ ${stns.size} محطات.`,
          presenterName: p.presenter.username,
          suggestion: "فصل المذيع عن المحطات الزائدة أو تغيير نوع الحساب إلى MULTI_STATION.",
        });
      }
    }
  }

  // ── Check F: active program with no schedule rules ─────────────────────────
  for (const p of programs) {
    if (p.scheduleRules.length === 0) {
      issues.push({
        severity: "WARNING", type: "برنامج نشط بلا جدول",
        description: `البرنامج "${p.title}" على "${p.station?.name}" نشط لكن لا توجد قواعد جدول زمني.`,
        stationName: p.station?.name, programTitle: p.title,
        suggestion: "أضف قواعد جدول من صفحة تعديل البرنامج.",
      });
    }
  }

  // ── Check G: station disabled but has active programs ─────────────────────
  for (const p of programs) {
    const stn = stationMap.get(p.stationId);
    if (stn && !stn.isActive) {
      issues.push({
        severity: "WARNING", type: "برنامج نشط على محطة معطّلة",
        description: `البرنامج "${p.title}" نشط لكن محطته "${stn.name}" معطّلة.`,
        stationName: stn.name, programTitle: p.title,
        suggestion: "عطّل البرنامج أو أعِد تفعيل المحطة.",
      });
    }
  }

  // ── Sort: ERRORs first ──────────────────────────────────────────────────────
  issues.sort((a, b) => {
    if (a.severity === b.severity) return 0;
    return a.severity === "ERROR" ? -1 : 1;
  });

  // ── Apply filters ──────────────────────────────────────────────────────────
  const allStationNames = Array.from(new Set(issues.map(i => i.stationName).filter(Boolean) as string[])).sort();

  const filteredIssues = issues.filter(issue => {
    if (severity !== "all" && issue.severity !== severity) return false;
    if (filterStation && issue.stationName !== filterStation) return false;
    if (filterTypes.length > 0) {
      const matchesType = filterTypes.some(k => TYPE_KEY_MAP[k] && issue.type === TYPE_KEY_MAP[k]);
      if (!matchesType) return false;
    }
    return true;
  });

  const totalCount  = filteredIssues.length;
  const totalPages  = Math.max(1, Math.ceil(totalCount / AUDIT_PAGE_SIZE));
  const safePage    = Math.min(page, totalPages);
  const pagedIssues = filteredIssues.slice((safePage - 1) * AUDIT_PAGE_SIZE, safePage * AUDIT_PAGE_SIZE);

  const buildUrl = (ov: { severity?: string; station?: string; types?: string; page?: number }) => {
    const p = new URLSearchParams();
    const s = ov.severity  ?? severity;     if (s && s !== "all") p.set("severity", s);
    const st = ov.station  ?? filterStation; if (st) p.set("station", st);
    const t = ov.types     ?? typesParam;    if (t)  p.set("types", t);
    const pg = ov.page     ?? safePage;      if (pg > 1) p.set("page", String(pg));
    return `/admin/schedule/audit?${p.toString()}`;
  };

  // ── Tally ─────────────────────────────────────────────────────────────────
  const errors   = issues.filter(i => i.severity === "ERROR");
  const warnings = issues.filter(i => i.severity === "WARNING");

  const hasActiveFilters = !!(severity !== "all" || filterStation || filterTypes.length);

  const severityStyle: Record<Severity, string> = {
    ERROR:   "bg-red-950/40 border-red-800/50 text-red-400",
    WARNING: "bg-amber-950/30 border-amber-800/40 text-amber-400",
    INFO:    "bg-neutral-900 border-neutral-800 text-neutral-400",
  };
  const severityIcon: Record<Severity, string> = {
    ERROR: "⛔", WARNING: "⚠️", INFO: "ℹ️",
  };

  return (
    <AdminPageShell maxWidth="max-w-4xl" padding="p-6 md:p-10">

      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-2 text-sm text-neutral-500 mb-6">
        <Link href="/admin" className="hover:text-neutral-300 transition-colors">الإدارة</Link>
        <span>/</span>
        <Link href="/admin/schedule" className="hover:text-neutral-300 transition-colors">الجدول</Link>
        <span>/</span>
        <span className="text-amber-400">تدقيق الجداول</span>
      </div>

      {/* ── Main content with vertical rhythm ── */}
      <div className="space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-100">تدقيق الجداول والإعدادات</h1>
            <p className="text-sm text-neutral-500 mt-1">
              فحص شامل للتداخلات والأخطاء — للقراءة فقط، لا يُعدَّل أي بيانات.
            </p>
          </div>
          <Link
            href="/admin/schedule"
            className="px-4 py-2 text-sm bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-neutral-200 rounded-lg transition-colors whitespace-nowrap"
          >
            ← عودة
          </Link>
        </div>

        {/* ── Filter bar ───────────────────────────────────────── */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Severity segmented */}
            <div className="flex bg-neutral-800 border border-neutral-700 rounded-xl p-1 gap-1">
              {[{ v:"all",label:"الكل" },{ v:"ERROR",label:"⛔ أخطاء" },{ v:"WARNING",label:"⚠️ تحذيرات" }].map(o=>(
                <Link key={o.v} href={buildUrl({ severity: o.v, page: 1 })}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                    severity===o.v ? "bg-neutral-700 text-neutral-100" : "text-neutral-500 hover:bg-neutral-700/60 hover:text-neutral-300"
                  }`}>{o.label}</Link>
              ))}
            </div>
            {/* Station filter */}
            {allStationNames.length > 0 && (
              <select defaultValue={filterStation}
                onChange={e => { /* handled via Link below */ }}
                className="hidden"/>
            )}
            {allStationNames.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-neutral-500">المحطة:</span>
                <Link href={buildUrl({ station: "", page: 1 })}
                  className={`text-xs border rounded-lg px-2.5 py-1 transition-colors ${
                    !filterStation ? "bg-amber-950/40 text-amber-300 border-amber-700/40" : "text-neutral-400 border-neutral-700 hover:border-neutral-600"
                  }`}>الكل</Link>
                {allStationNames.map(name=>(
                  <Link key={name} href={buildUrl({ station: name, page: 1 })}
                    className={`text-xs border rounded-lg px-2.5 py-1 transition-colors ${
                      filterStation===name ? "bg-amber-950/40 text-amber-300 border-amber-700/40" : "text-neutral-400 border-neutral-700 hover:border-neutral-600"
                    }`}>{name}</Link>
                ))}
              </div>
            )}
          </div>
          {/* Check type multi-select (toggle links) */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-neutral-500 shrink-0">نوع المشكلة:</span>
            {CHECK_TYPES.map(ct => {
              const isOn = filterTypes.includes(ct.key);
              const nextTypes = isOn ? filterTypes.filter(x=>x!==ct.key) : [...filterTypes, ct.key];
              return (
                <Link key={ct.key} href={buildUrl({ types: nextTypes.join(","), page: 1 })}
                  className={`text-xs border rounded-lg px-2.5 py-1 transition-colors ${
                    isOn ? "bg-red-950/40 text-red-300 border-red-700/40" : "text-neutral-400 border-neutral-700 hover:border-neutral-600 hover:text-neutral-200"
                  }`}>{ct.label}</Link>
              );
            })}
          </div>
          {hasActiveFilters && (
            <Link href="/admin/schedule/audit"
              className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300 border border-red-800/40 bg-red-950/20 rounded-lg px-3 py-1 transition-colors">
              ✕ مسح الفلاتر ({totalCount} نتيجة)
            </Link>
          )}
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "أخطاء حرجة",  count: errors.length,   style: "bg-red-950/40 border-red-800/50 text-red-400" },
            { label: "تحذيرات",     count: warnings.length, style: "bg-amber-950/30 border-amber-800/40 text-amber-400" },
            { label: "إجمالي البرامج النشطة", count: programs.length, style: "bg-neutral-900 border-neutral-800 text-neutral-400" },
          ].map(({ label, count, style }) => (
            <div key={label} className={`rounded-2xl border px-5 py-4 ${style}`}>
              <p className="text-3xl font-bold">{count}</p>
              <p className="text-xs mt-1 opacity-80">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Issue list (paginated) ── */}
        {pagedIssues.length === 0 ? (
          <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-2xl px-6 py-8 text-center">
            <p className="text-4xl mb-3">✅</p>
            <p className="text-emerald-400 font-semibold">لا توجد مشكلات مكتشفة</p>
            <p className="text-xs text-neutral-500 mt-1">كل الجداول والمذيعين والمحطات تبدو سليمة.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pagedIssues.map((issue, idx) => (
              <div
                key={idx}
                className={`rounded-xl border px-5 py-4 ${severityStyle[issue.severity]}`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-lg shrink-0 mt-0.5">{severityIcon[issue.severity]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-bold uppercase tracking-wide opacity-70">
                        {issue.type}
                      </span>
                      {issue.stationName && (
                        <span className="text-xs bg-neutral-900/60 border border-neutral-800/40 px-2 py-0.5 rounded text-neutral-400">
                          📡 {issue.stationName}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-neutral-200 leading-relaxed">{issue.description}</p>
                    <p className="text-xs text-neutral-500 mt-1.5">
                      💡 <span className="text-neutral-400">{issue.suggestion}</span>
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Audit legend ── */}
        <div className="bg-neutral-900/50 border border-neutral-800/50 rounded-2xl px-5 py-4 text-xs text-neutral-500 space-y-1">
          <p className="font-semibold text-neutral-400 mb-2">الفحوصات المُنفَّذة في هذا التقرير:</p>
          <p>A — تداخل مواعيد برنامجين على نفس المحطة</p>
          <p>B — نفس المذيع جُدول في برنامجين في نفس الوقت (عبر محطتين)</p>
          <p>C — مذيع مرتبط ببرنامج لكنه غير مرتبط بمحطة البرنامج</p>
          <p>D — مذيع DJ مباشر مُضاف لجدول برنامج (غير مدعوم)</p>
          <p>E — مذيع محطة واحدة مرتبط بأكثر من محطة</p>
          <p>F — برنامج نشط بلا قواعد جدول زمني</p>
          <p>G — برنامج نشط على محطة معطّلة</p>
        </div>

      </div>{/* end space-y-6 */}
    </AdminPageShell>
  );
}
