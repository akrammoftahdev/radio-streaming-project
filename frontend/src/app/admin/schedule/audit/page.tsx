import { auth, prisma } from "@/auth";
import { redirect }     from "next/navigation";
import Link             from "next/link";
import { AdminPageShell } from "@/components/ui";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("admin.schedule");
  return { title: t("auditPageTitle") };
}

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

export default async function ScheduleAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string; station?: string; types?: string; page?: string }>;
}) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await auth();
  if (!session?.user) redirect("/login");
  if ((session.user as { role?: string }).role !== "ADMIN") redirect("/login");

  const t = await getTranslations("admin.schedule");

  const CHECK_TYPES: { key: string; label: string }[] = [
    { key: "A", label: t("checkTypeA") },
    { key: "B", label: t("checkTypeB") },
    { key: "C", label: t("checkTypeC") },
    { key: "D", label: t("checkTypeD") },
    { key: "E", label: t("checkTypeE") },
    { key: "F", label: t("checkTypeF") },
    { key: "G", label: t("checkTypeG") },
  ];

  const TYPE_KEY_MAP: Record<string, string> = {
    A: t("issueTypeA"),
    B: t("issueTypeB"),
    C: t("issueTypeC"),
    D: t("issueTypeD"),
    E: t("issueTypeE"),
    F: t("issueTypeF"),
    G: t("issueTypeG"),
  };

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
                    severity: "ERROR", type: t("issueTypeA"),
                    description: t("issueDescA", { titleA: a.title, titleB: b.title, station: sName, timeA: `${sA.startTime}–${sA.endTime}`, timeB: `${sB.startTime}–${sB.endTime}` }),
                    stationName: sName, programTitle: `${a.title} / ${b.title}`,
                    suggestion: t("issueSuggA"),
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
                    severity: "ERROR", type: t("issueTypeB"),
                    description: t("issueDescB", { presenter: pName }),
                    presenterName: pName, programTitle: `${a.title} / ${b.title}`,
                    suggestion: t("issueSuggB"),
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
        severity: "WARNING", type: t("issueTypeC"),
        description: t("issueDescC", { title: p.title, station: p.station?.name ?? p.stationId }),
        stationName: p.station?.name, programTitle: p.title,
        presenterName: p.presenter?.name || p.presenter?.username,
        suggestion: t("issueSuggC"),
      });
    }
  }

  // ── Check D: DIRECT_DJ in program table ───────────────────────────────────
  for (const p of programs) {
    if (p.presenter?.presenterMode === "DIRECT_DJ") {
      issues.push({
        severity: "ERROR", type: t("issueTypeD"),
        description: t("issueDescD", { presenter: p.presenter.username, title: p.title }),
        programTitle: p.title, presenterName: p.presenter.username,
        suggestion: t("issueSuggD"),
      });
    }
  }

  // ── Check E: SINGLE_STATION presenter on multiple stations ────────────────
  for (const p of programs) {
    if (p.presenter?.presenterMode === "SINGLE_STATION") {
      const stns = presenterStationSet.get(p.presenterId);
      if (stns && stns.size > 1) {
        issues.push({
          severity: "WARNING", type: t("issueTypeE"),
          description: t("issueDescE", { presenter: p.presenter.username, count: stns.size }),
          presenterName: p.presenter.username,
          suggestion: t("issueSuggE"),
        });
      }
    }
  }

  // ── Check F: active program with no schedule rules ─────────────────────────
  for (const p of programs) {
    if (p.scheduleRules.length === 0) {
      issues.push({
        severity: "WARNING", type: t("issueTypeF"),
        description: t("issueDescF", { title: p.title, station: p.station?.name }),
        stationName: p.station?.name, programTitle: p.title,
        suggestion: t("issueSuggF"),
      });
    }
  }

  // ── Check G: station disabled but has active programs ─────────────────────
  for (const p of programs) {
    const stn = stationMap.get(p.stationId);
    if (stn && !stn.isActive) {
      issues.push({
        severity: "WARNING", type: t("issueTypeG"),
        description: t("issueDescG", { title: p.title, station: stn.name }),
        stationName: stn.name, programTitle: p.title,
        suggestion: t("issueSuggG"),
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
    const tp = ov.types     ?? typesParam;    if (tp)  p.set("types", tp);
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
        <Link href="/admin" className="hover:text-neutral-300 transition-colors">{t("breadcrumbAdmin")}</Link>
        <span>/</span>
        <Link href="/admin/schedule" className="hover:text-neutral-300 transition-colors">{t("breadcrumbSchedule")}</Link>
        <span>/</span>
        <span className="text-amber-400">{t("breadcrumbAudit")}</span>
      </div>

      {/* ── Main content with vertical rhythm ── */}
      <div className="space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-100">{t("auditTitle")}</h1>
            <p className="text-sm text-neutral-500 mt-1">
              {t("auditDesc")}
            </p>
          </div>
          <Link
            href="/admin/schedule"
            className="px-4 py-2 text-sm bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-neutral-200 rounded-lg transition-colors whitespace-nowrap"
          >
            {t("auditBack")}
          </Link>
        </div>

        {/* ── Filter bar ───────────────────────────────────────── */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Severity segmented */}
            <div className="flex bg-neutral-800 border border-neutral-700 rounded-xl p-1 gap-1">
              {[{ v:"all",label:t("filterAll") },{ v:"ERROR",label:t("filterErrors") },{ v:"WARNING",label:t("filterWarnings") }].map(o=>(
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
                <span className="text-xs text-neutral-500">{t("filterStation")}</span>
                <Link href={buildUrl({ station: "", page: 1 })}
                  className={`text-xs border rounded-lg px-2.5 py-1 transition-colors ${
                    !filterStation ? "bg-amber-950/40 text-amber-300 border-amber-700/40" : "text-neutral-400 border-neutral-700 hover:border-neutral-600"
                  }`}>{t("filterAll")}</Link>
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
            <span className="text-xs text-neutral-500 shrink-0">{t("filterIssueType")}</span>
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
              {t("clearFilters", { count: totalCount })}
            </Link>
          )}
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: t("statCriticalErrors"),  count: errors.length,   style: "bg-red-950/40 border-red-800/50 text-red-400" },
            { label: t("statWarnings"),     count: warnings.length, style: "bg-amber-950/30 border-amber-800/40 text-amber-400" },
            { label: t("statActivePrograms"), count: programs.length, style: "bg-neutral-900 border-neutral-800 text-neutral-400" },
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
            <p className="text-emerald-400 font-semibold">{t("noIssuesFound")}</p>
            <p className="text-xs text-neutral-500 mt-1">{t("noIssuesDesc")}</p>
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
          <p className="font-semibold text-neutral-400 mb-2">{t("auditLegendTitle")}</p>
          <p>{t("auditCheckA")}</p>
          <p>{t("auditCheckB")}</p>
          <p>{t("auditCheckC")}</p>
          <p>{t("auditCheckD")}</p>
          <p>{t("auditCheckE")}</p>
          <p>{t("auditCheckF")}</p>
          <p>{t("auditCheckG")}</p>
        </div>

      </div>{/* end space-y-6 */}
    </AdminPageShell>
  );
}
