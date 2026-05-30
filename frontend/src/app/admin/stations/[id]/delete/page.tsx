import { auth, prisma }          from "@/auth";
import { redirect, notFound }    from "next/navigation";
import Link                      from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { isRtl }                 from "@/i18n/config";
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

  const t = await getTranslations("admin.stations");
  const locale = await getLocale();
  const dir = isRtl(locale) ? 'rtl' : 'ltr';

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
  if (deps.programs > 0) blockers.push(t("depBlockerProgram", { count: deps.programs }));

  type DepRow = {
    label:       string;
    count:       number | string;
    safe:        boolean;   // true = not blocking final delete
    note:        string;
    actionSlot?: React.ReactNode;
  };

  const depRows: DepRow[] = [
    {
      label: t("depPrograms"),
      count: deps.programs,
      safe:  deps.programs === 0,
      note:  deps.programs === 0
        ? t("depProgramsClean")
        : t("depProgramsBlocking"),
      actionSlot: deps.programs > 0 ? (
        <StationCleanupButton
          stationId={stationId}
          action={cleanupStationPrograms}
          buttonLabel={t("deletePrograms", { count: deps.programs })}
          variant="danger"
          confirmText={t("deleteProgramsConfirm", { count: deps.programs })}
        />
      ) : undefined,
    },
    {
      label: t("depPresenterLinks"),
      count: deps.presenterStationLinks,
      safe:  true, // cascades automatically — info only
      note:  deps.presenterStationLinks === 0
        ? t("depPresenterLinksClean")
        : t("depPresenterLinksNote", { count: deps.presenterStationLinks }),
      actionSlot: deps.presenterStationLinks > 0 ? (
        <StationCleanupButton
          stationId={stationId}
          action={unlinkStationPresenters}
          buttonLabel={t("unlinkPresenters", { count: deps.presenterStationLinks })}
          variant="warning"
          confirmText={t("unlinkPresentersConfirm", { count: deps.presenterStationLinks })}
        />
      ) : undefined,
    },
    {
      label: t("depSingleStationPresenters"),
      count: deps.singleStationPresenters,
      safe:  true,
      note:  deps.singleStationPresenters === 0
        ? t("depSingleStationPresentersClean")
        : t("depSingleStationPresentersNote", { count: deps.singleStationPresenters }),
    },
    {
      label: t("depManagers"),
      count: deps.stationManagers,
      safe:  true, // cascades automatically
      note:  deps.stationManagers === 0
        ? t("depManagersClean")
        : t("depManagersNote", { count: deps.stationManagers }),
      actionSlot: deps.stationManagers > 0 ? (
        <StationCleanupButton
          stationId={stationId}
          action={removeStationManagers}
          buttonLabel={t("removeManagers", { count: deps.stationManagers })}
          variant="warning"
          confirmText={t("removeManagersConfirm", { count: deps.stationManagers })}
        />
      ) : undefined,
    },
    {
      label: t("depDefaultCred"),
      count: deps.defaultCredential ? t("depDefaultCredExists") : t("depDefaultCredMissing"),
      safe:  true, // cascades automatically
      note:  deps.defaultCredential
        ? t("depDefaultCredNote", { username: deps.defaultCredential.djUsername })
        : t("depDefaultCredClean"),
      actionSlot: deps.defaultCredential ? (
        <StationCleanupButton
          stationId={stationId}
          action={deleteStationDefaultCredential}
          buttonLabel={t("deleteDjCred")}
          variant="warning"
          confirmText={t("deleteDjCredConfirm")}
        />
      ) : undefined,
    },
    {
      label: t("depRecordings"),
      count: deps.recordings,
      safe:  true, // Recording.stationId → SetNull on station delete
      note:  deps.recordings === 0
        ? t("depRecordingsClean")
        : t("depRecordingsNote", { count: deps.recordings }),
      actionSlot: deps.recordings > 0 ? (
        <Link
          href={`/admin/recordings?stationId=${stationId}`}
          className="text-xs text-amber-400 hover:text-amber-300 border border-amber-800/40 rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap"
        >
          {t("viewRecordings")}
        </Link>
      ) : undefined,
    },
    {
      label: t("depSonicPanel"),
      count: deps.sonicCredentials,
      safe:  true, // SonicPanelCredential.stationId → SetNull
      note:  deps.sonicCredentials === 0
        ? t("depSonicPanelClean")
        : t("depSonicPanelNote", { count: deps.sonicCredentials }),
    },
    {
      label: t("depBroadcastSchedules"),
      count: deps.broadcastSchedules,
      safe:  true, // BroadcastSchedule.stationId → SetNull
      note:  deps.broadcastSchedules === 0
        ? t("depBroadcastSchedulesClean")
        : t("depBroadcastSchedulesNote", { count: deps.broadcastSchedules }),
    },
  ];

  return (
    <div dir={dir} className="min-h-screen bg-neutral-950 text-neutral-100 p-6 md:p-10">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* ── Breadcrumb ── */}
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Link href="/admin" className="hover:text-neutral-300 transition-colors">{t("breadcrumbAdmin")}</Link>
          <span>/</span>
          <Link href="/admin/stations" className="hover:text-neutral-300 transition-colors">{t("breadcrumbStations")}</Link>
          <span>/</span>
          <span className="text-red-400 font-medium">{t("breadcrumbDelete")}</span>
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
              {station.isActive ? t("statusActive") : t("statusDisabled")}
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
            <h2 className="text-sm font-semibold text-neutral-300">{t("dependencyList")}</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              {t("dependencyListDesc")}
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
            <p className="text-sm font-semibold text-red-400 mb-1">{t("hardDeleteBlocked")}</p>
            <p className="text-xs text-red-300/80">
              {t("hardDeleteBlockedDesc")}{" "}
              <span className="font-mono font-bold">{blockers.join(" · ")}</span>
            </p>
          </div>
        ) : (
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl px-6 py-5 space-y-4">
            <div>
              <p className="text-sm font-semibold text-emerald-400 mb-1">{t("hardDeleteReady")}</p>
              <p className="text-xs text-neutral-400">
                {t("hardDeleteReadyDesc")}
              </p>
            </div>
            <StationCleanupButton
              stationId={stationId}
              action={hardDeleteStation}
              buttonLabel={t("hardDeleteButton")}
              variant="danger"
              confirmText={t("hardDeleteConfirm", { name: station.name })}
            />
          </div>
        )}

        {/* ── Back link ── */}
        <div className="text-center">
          <Link href="/admin/stations"
            className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors">
            {t("backToStationsList")}
          </Link>
        </div>

      </div>
    </div>
  );
}
