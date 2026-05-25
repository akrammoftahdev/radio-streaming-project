import { auth, prisma }          from "@/auth";
import { redirect, notFound }    from "next/navigation";
import Link                      from "next/link";
import { StationCleanupButton }  from "./cleanup-button";
import {
  getStationDependencyCounts,
  cleanupStationPrograms,
  unlinkStationPresenters,
  removeStationManagers,
  deleteStationDefaultCredential,
  hardDeleteStation,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function StationDeletePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session || (session.user as any).role !== "ADMIN") redirect("/login");

  const { id: stationId } = await params;

  const station = await prisma.station.findUnique({
    where:  { id: stationId },
    select: { id: true, name: true, slug: true, isActive: true, streamHost: true, streamPort: true, publicUrl: true },
  });
  if (!station) notFound();

  const deps = await getStationDependencyCounts(stationId);

  // ── Blocker summary ────────────────────────────────────────────────────────
  // Only programs are a real FK RESTRICT blocker for station.delete.
  // PresenterStation/StationManager/DefaultCredential cascade automatically.
  const blockers: string[] = [];
  if (deps.programs > 0) blockers.push(`${deps.programs} برنامج`);

  type DepRow = {
    label:       string;
    count:       number | string;
    safe:        boolean;   // true = not blocking final delete
    note:        string;
    actionSlot?: React.ReactNode;
  };

  const depRows: DepRow[] = [
    {
      label: "برامج المحطة",
      count: deps.programs,
      safe:  deps.programs === 0,
      note:  deps.programs === 0
        ? "لا توجد برامج — يمكن حذف المحطة."
        : "يجب حذف جميع البرامج أولاً (تبعية FK مباشرة). التسجيلات ستُحفظ.",
      actionSlot: deps.programs > 0 ? (
        <StationCleanupButton
          stationId={stationId}
          action={cleanupStationPrograms}
          buttonLabel={`🗑 حذف ${deps.programs} برنامج`}
          variant="danger"
          confirmText={`هل أنت متأكد؟ سيتم حذف جميع البرامج (${deps.programs}) المرتبطة بالمحطة.\n\nالتسجيلات لن تُحذف — سيتم فقط فصلها عن البرامج.\nقواعد الجدول وفتراته ستُحذف تلقائياً.`}
        />
      ) : undefined,
    },
    {
      label: "روابط المذيعين",
      count: deps.presenterStationLinks,
      safe:  true, // cascades automatically — info only
      note:  deps.presenterStationLinks === 0
        ? "لا توجد روابط مذيعين."
        : `${deps.presenterStationLinks} رابط سيُحذف تلقائياً عند حذف المحطة (Cascade). حسابات المذيعين لن تُحذف.`,
      actionSlot: deps.presenterStationLinks > 0 ? (
        <StationCleanupButton
          stationId={stationId}
          action={unlinkStationPresenters}
          buttonLabel={`فصل ${deps.presenterStationLinks} مذيع`}
          variant="warning"
          confirmText={`هل أنت متأكد؟ سيتم تعطيل روابط ${deps.presenterStationLinks} مذيع بهذه المحطة.\n\nحسابات المذيعين لن تُحذف. مذيعو DIRECT_DJ لن يتأثروا.`}
        />
      ) : undefined,
    },
    {
      label: "مذيعو المحطة الواحدة",
      count: deps.singleStationPresenters,
      safe:  true,
      note:  deps.singleStationPresenters === 0
        ? "لا يوجد مذيعون مرتبطون بهذه المحطة فقط."
        : `⚠️ ${deps.singleStationPresenters} مذيع من نوع SINGLE_STATION مرتبط بهذه المحطة فقط. بعد حذف المحطة ستنقطع صلتهم بأي محطة — اعتني بتعيينهم لمحطة أخرى أو حذفهم أولاً.`,
    },
    {
      label: "مديرو المحطة",
      count: deps.stationManagers,
      safe:  true, // cascades automatically
      note:  deps.stationManagers === 0
        ? "لا يوجد مديرون مرتبطون."
        : `${deps.stationManagers} تعيين سيُحذف تلقائياً عند حذف المحطة. حسابات المديرين لن تُحذف.`,
      actionSlot: deps.stationManagers > 0 ? (
        <StationCleanupButton
          stationId={stationId}
          action={removeStationManagers}
          buttonLabel={`عزل ${deps.stationManagers} مدير`}
          variant="warning"
          confirmText={`هل أنت متأكد؟ سيتم حذف تعيينات ${deps.stationManagers} مدير من هذه المحطة.\n\nحسابات المديرين لن تُحذف.`}
        />
      ) : undefined,
    },
    {
      label: "بيانات DJ الافتراضية",
      count: deps.defaultCredential ? "موجودة" : "غير موجودة",
      safe:  true, // cascades automatically
      note:  deps.defaultCredential
        ? `بيانات DJ الافتراضية (${deps.defaultCredential.djUsername}) ستُحذف تلقائياً عند حذف المحطة (Cascade).`
        : "لا توجد بيانات DJ افتراضية.",
      actionSlot: deps.defaultCredential ? (
        <StationCleanupButton
          stationId={stationId}
          action={deleteStationDefaultCredential}
          buttonLabel="حذف بيانات DJ"
          variant="warning"
          confirmText="هل أنت متأكد؟ سيتم حذف بيانات DJ الافتراضية للمحطة."
        />
      ) : undefined,
    },
    {
      label: "التسجيلات المرتبطة",
      count: deps.recordings,
      safe:  true, // Recording.stationId → SetNull on station delete
      note:  deps.recordings === 0
        ? "لا توجد تسجيلات مرتبطة."
        : `${deps.recordings} تسجيل — لن تُحذف عند حذف المحطة. سيتم فقط فصلها (stationId → null). ملفات الصوت محفوظة.`,
      actionSlot: deps.recordings > 0 ? (
        <Link
          href={`/admin/recordings?stationId=${stationId}`}
          className="text-xs text-amber-400 hover:text-amber-300 border border-amber-800/40 rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap"
        >
          عرض التسجيلات ←
        </Link>
      ) : undefined,
    },
    {
      label: "بيانات SonicPanel للمذيعين",
      count: deps.sonicCredentials,
      safe:  true, // SonicPanelCredential.stationId → SetNull
      note:  deps.sonicCredentials === 0
        ? "لا توجد بيانات."
        : `${deps.sonicCredentials} سجل — سيتم فصلها (stationId → null) دون حذفها.`,
    },
    {
      label: "جداول البث القديمة",
      count: deps.broadcastSchedules,
      safe:  true, // BroadcastSchedule.stationId → SetNull
      note:  deps.broadcastSchedules === 0
        ? "لا توجد."
        : `${deps.broadcastSchedules} جدول بث قديم — سيتم فصله (stationId → null) دون حذفه.`,
    },
  ];

  return (
    <div dir="rtl" className="min-h-screen bg-neutral-950 text-neutral-100 p-6 md:p-10">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* ── Breadcrumb ── */}
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Link href="/admin" className="hover:text-neutral-300 transition-colors">الإدارة</Link>
          <span>/</span>
          <Link href="/admin/stations" className="hover:text-neutral-300 transition-colors">المحطات</Link>
          <span>/</span>
          <span className="text-red-400 font-medium">حذف المحطة</span>
        </div>

        {/* ── Station summary ── */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-neutral-100">{station.name}</h1>
              <p className="text-sm text-neutral-500 mt-0.5 font-mono">{station.slug}</p>
            </div>
            <span className={`text-xs font-medium border px-2.5 py-1 rounded-full ${
              station.isActive
                ? "bg-emerald-950/40 text-emerald-400 border-emerald-800/40"
                : "bg-neutral-800 text-neutral-500 border-neutral-700"
            }`}>
              {station.isActive ? "نشطة" : "معطّلة"}
            </span>
          </div>
          {(station.streamHost || station.publicUrl) && (
            <div className="text-xs text-neutral-500 space-y-1 pt-2 border-t border-neutral-800">
              {station.streamHost && (
                <p>🖥 {station.streamHost}{station.streamPort ? `:${station.streamPort}` : ""}</p>
              )}
              {station.publicUrl && <p>🌐 {station.publicUrl}</p>}
            </div>
          )}
        </div>

        {/* ── Dependency checklist ── */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-neutral-800">
            <h2 className="text-sm font-semibold text-neutral-300">قائمة التبعيات</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              يجب تنظيف التبعيات الحمراء قبل الحذف النهائي.
            </p>
          </div>
          <div className="divide-y divide-neutral-800/60">
            {depRows.map((row) => (
              <div key={row.label} className="px-6 py-4 flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      row.safe ? "bg-emerald-500" : "bg-red-500"
                    }`} />
                    <span className="text-sm font-medium text-neutral-200">{row.label}</span>
                    <span className={`text-xs font-mono px-1.5 py-0.5 rounded border ${
                      typeof row.count === "number" && row.count === 0
                        ? "bg-neutral-800 border-neutral-700 text-neutral-500"
                        : row.safe
                        ? "bg-amber-950/40 border-amber-800/40 text-amber-400"
                        : "bg-red-950/40 border-red-800/40 text-red-400"
                    }`}>
                      {row.count}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 pr-4">{row.note}</p>
                </div>
                {row.actionSlot && (
                  <div className="flex-shrink-0">{row.actionSlot}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Blocker card or final delete ── */}
        {!deps.isHardDeleteSafe ? (
          <div className="bg-red-950/30 border border-red-800/50 rounded-2xl px-6 py-5">
            <p className="text-sm font-semibold text-red-400 mb-1">🔒 الحذف النهائي محظور</p>
            <p className="text-xs text-red-300/80">
              لا يمكن حذف المحطة حتى يتم تنظيف:{" "}
              <span className="font-mono font-bold">{blockers.join(" · ")}</span>
            </p>
          </div>
        ) : (
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl px-6 py-5 space-y-4">
            <div>
              <p className="text-sm font-semibold text-emerald-400 mb-1">✅ جاهز للحذف النهائي</p>
              <p className="text-xs text-neutral-400">
                جميع التبعيات الحرجة نُظِّفت. التسجيلات محفوظة وستُفصل تلقائياً.
                بيانات المذيعين وحساباتهم لن تُحذف.
              </p>
            </div>
            <StationCleanupButton
              stationId={stationId}
              action={hardDeleteStation}
              buttonLabel="🗑 حذف المحطة نهائياً"
              variant="danger"
              confirmText={`هل أنت متأكد تماماً؟\n\nسيتم حذف المحطة "${station.name}" نهائياً.\n\n• حسابات المذيعين والمديرين لن تُحذف.\n• التسجيلات لن تُحذف — ستُفصل فقط عن المحطة.\n\nلا يمكن التراجع عن هذا الإجراء.`}
            />
          </div>
        )}

        {/* ── Back link ── */}
        <div className="text-center">
          <Link href="/admin/stations"
            className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors">
            ← العودة إلى قائمة المحطات
          </Link>
        </div>

      </div>
    </div>
  );
}
