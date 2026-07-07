import { auth, prisma } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  getDependencyCounts,
  deactivatePresenter,
  hardDeletePresenter,
  disableAllPresenterPrograms,
  deleteLegacyBroadcastSchedules,
  unlinkAllPresenterStations,
  deletePresenterLegacyCredentials,
  deletePresenterValidity,
  deletePresenterDirectDjRadios,
  cleanupPresenterLiveSessions,
  type PresenterActionResult,
} from "./actions";
import { PresenterWizardClient } from "./wizard-client";
import { CleanupButton } from "./cleanup-button";
import { getTranslations } from "next-intl/server";


export async function generateMetadata() {
  const t = await getTranslations("admin.presenters");
  const tc = await getTranslations("common");
  return { title: t("deletePageTitle") };
}

export default async function PresenterDeletePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await auth();
  if (!session?.user) redirect("/login");
  if ((session.user as { role?: string }).role !== "ADMIN") redirect("/login");

  const { id: presenterId } = await params;
  const t = await getTranslations("admin.presenters");
  const tc = await getTranslations("common");

  // ── Load presenter ────────────────────────────────────────────────────────
  const presenter = await prisma.user.findUnique({
    where:  { id: presenterId },
    select: {
      id: true, username: true, name: true, email: true, phone: true,
      role: true, presenterMode: true, isActive: true, canBroadcast: true,
    },
  });
  if (!presenter) redirect("/admin/presenters");

  // ── Dependency counts ─────────────────────────────────────────────────────
  const deps = await getDependencyCounts(presenterId);

  // ── Hard delete policy ────────────────────────────────────────────────────
  // • ACTIVE programs  → blocks  (disable via wizard)
  // • Recordings       → blocks  (DB FK RESTRICT — delete individually from /admin/recordings)
  // • LiveSessions     → blocks  (DB FK RESTRICT — cleanable via wizard after recordings removed)
  // • BroadcastSchedule→ blocks  (delete via wizard button)
  // • All other deps   → non-blocking (cleaned automatically in hard delete transaction)
  const isHardDeleteSafe =
    deps.activePrograms === 0 &&
    deps.recordings     === 0 &&
    deps.liveSessions   === 0 &&
    deps.schedules      === 0;

  // ── Dep row type ──────────────────────────────────────────────────────────
  type DepRow = {
    label:           string;
    count:           number;      // displayed count
    blocks:          boolean;
    blockerCount?:   number;      // override for "what actually blocks" (e.g. activePrograms)
    viewLink?:       string;
    cleanupAction?:  (_: PresenterActionResult | null, fd: FormData) => Promise<PresenterActionResult>;
    cleanupLabel?:   string;
    cleanupConfirm?: string;
    note?:           string;
  };

  const depRows: DepRow[] = [
    // ── BLOCKING ─────────────────────────────────────────────────────────────
    {
      label:          t("depPrograms"),
      count:          deps.programs,
      blockerCount:   deps.activePrograms,
      blocks:         deps.activePrograms > 0,
      viewLink:       `/admin/presenters/${presenterId}/edit`,
      cleanupAction:  deps.activePrograms > 0 ? disableAllPresenterPrograms : undefined,
      cleanupLabel:   t("cleanupPrograms"),
      cleanupConfirm: t("cleanupProgramsConfirm"),
      note: deps.activePrograms > 0
        ? t("noteProgramsActive", { count: deps.activePrograms, cleanupPrograms: t("cleanupPrograms") })
        : deps.programs > 0
          ? t("noteProgramsInactive", { total: deps.programs })
          : undefined,
    },
    {
      label:    t("depRecordings"),
      count:    deps.recordings,
      blocks:   deps.recordings > 0,
      viewLink: `/admin/recordings?presenterId=${presenterId}`,
      note: deps.recordings > 0
        ? t("noteRecordingsBlocking")
        : undefined,
    },
    {
      label:          t("depLiveSessions"),
      count:          deps.liveSessions,
      blocks:         deps.liveSessions > 0,
      cleanupAction:  deps.liveSessions > 0 ? cleanupPresenterLiveSessions : undefined,
      cleanupLabel:   t("cleanupLiveSessions"),
      cleanupConfirm: t("cleanupLiveSessionsConfirm"),
      note: deps.liveSessions > 0
        ? t("noteLiveSessionsBlocking")
        : undefined,
    },
    {
      label:          t("depLegacySchedules"),
      count:          deps.schedules,
      blocks:         deps.schedules > 0,
      cleanupAction:  deps.schedules > 0 ? deleteLegacyBroadcastSchedules : undefined,
      cleanupLabel:   t("cleanupLegacySchedules"),
      cleanupConfirm: t("cleanupLegacySchedulesConfirm"),
    },
    // ── NON-BLOCKING (cleaned in hard delete transaction if not done manually) ─
    {
      label:          t("depStationLinks"),
      count:          deps.stations,
      blocks:         false,
      cleanupAction:  deps.stations > 0 ? unlinkAllPresenterStations : undefined,
      cleanupLabel:   t("unlinkAllStations"),
      cleanupConfirm: t("unlinkAllStationsConfirm"),
    },
    {
      label:          t("depDjRadios"),
      count:          deps.djRadios,
      blocks:         false,
      cleanupAction:  deps.djRadios > 0 ? deletePresenterDirectDjRadios : undefined,
      cleanupLabel:   t("deleteDjRadios"),
      cleanupConfirm: t("deleteDjRadiosConfirm"),
    },
    {
      label:          t("depSonicPanel"),
      count:          deps.creds,
      blocks:         false,
      cleanupAction:  deps.creds > 0 ? deletePresenterLegacyCredentials : undefined,
      cleanupLabel:   t("deleteSonicPanel"),
      cleanupConfirm: t("deleteSonicPanelConfirm"),
    },
    {
      label:          t("depValidity"),
      count:          deps.validity,
      blocks:         false,
      cleanupAction:  deps.validity > 0 ? deletePresenterValidity : undefined,
      cleanupLabel:   t("deleteValidity"),
      cleanupConfirm: t("deleteValidityConfirm"),
    },
    {
      label:  t("depProfile"),
      count:  deps.profile,
      blocks: false,
      note:   deps.profile > 0 ? t("profileAutoDelete") : undefined,
    },
    {
      label:  t("depAccessLogs"),
      count:  deps.accessLogs,
      blocks: false,
      note:   deps.accessLogs > 0 ? t("accessLogsAutoDelete") : undefined,
    },
  ];

  // List of active blockers for the summary
  const activeBlockers: string[] = [
    deps.activePrograms > 0 ? t("blockerActivePrograms", { count: deps.activePrograms })       : "",
    deps.recordings     > 0 ? t("blockerRecordings", { count: deps.recordings })                : "",
    deps.liveSessions   > 0 ? t("blockerLiveSessions", { count: deps.liveSessions })    : "",
    deps.schedules      > 0 ? t("blockerLegacySchedules", { count: deps.schedules })          : "",
  ].filter(Boolean);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6 md:p-10">
      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-2 text-sm text-neutral-500 mb-8">
        <Link href="/admin" className="hover:text-neutral-300 transition-colors">{tc("dashboard")}</Link>
        <span>/</span>
        <Link href="/admin/presenters" className="hover:text-neutral-300 transition-colors">{tc("presenters")}</Link>
        <span>/</span>
        <Link href={`/admin/presenters/${presenterId}/edit`} className="hover:text-neutral-300 transition-colors">
          {presenter.username}
        </Link>
        <span>/</span>
        <span className="text-red-400">{t("manageDelete")}</span>
      </div>

      <div className="max-w-2xl mx-auto space-y-6">
        {/* ── Presenter card ── */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-neutral-100">{presenter.name ?? presenter.username}</h1>
              <p className="text-sm text-neutral-400 font-mono mt-0.5">@{presenter.username}</p>
              {presenter.email && <p className="text-xs text-neutral-500 mt-1">{presenter.email}</p>}
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
                presenter.isActive
                  ? "bg-emerald-950/50 text-emerald-400 border-emerald-700/40"
                  : "bg-neutral-800 text-neutral-500 border-neutral-700"
              }`}>
                {presenter.isActive ? tc("active") : tc("inactive")}
              </span>
              <span className="text-xs text-neutral-600">{presenter.presenterMode}</span>
            </div>
          </div>
        </div>

        {/* ── Blocker summary (only when unsafe) ── */}
        {!isHardDeleteSafe && activeBlockers.length > 0 && (
          <div className="bg-red-950/30 border border-red-800/50 rounded-2xl px-5 py-4">
            <p className="text-sm font-semibold text-red-400 mb-1">{t("hardDeleteBlocked")}</p>
            <p className="text-xs text-red-300/80">
              {activeBlockers.join(" · ")}
            </p>
          </div>
        )}

        {/* ── Dependency checklist ── */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-neutral-300 mb-1">{t("dependencyCheckTitle")}</h2>
          <p className="text-xs text-neutral-500 mb-4">
            {t("dependencyWarning")}
          </p>
          <ul className="space-y-2">
            {depRows.map((row) => {
              // A row "blocks" only if blocks:true AND its actual blocking count > 0
              const effectiveCount = row.blockerCount ?? row.count;
              const isBlocking     = row.blocks && effectiveCount > 0;
              const isClear        = effectiveCount === 0;
              const isWarn         = !row.blocks && row.count > 0;

              return (
                <li
                  key={row.label}
                  className={`px-4 py-3 rounded-xl border ${
                    isBlocking
                      ? "bg-red-950/30 border-red-800/40"
                      : isWarn
                        ? "bg-amber-950/15 border-amber-800/25"
                        : "bg-neutral-950/40 border-neutral-800/40"
                  }`}
                >
                  {/* Main row */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className={`text-base shrink-0 ${isBlocking ? "text-red-400" : isClear ? "text-emerald-500" : "text-amber-400"}`}>
                        {isBlocking ? "⛔" : isClear ? "✅" : "⚠️"}
                      </span>
                      <span className="text-sm text-neutral-300 truncate">{row.label}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Count display */}
                      <span className={`text-sm font-mono font-semibold min-w-[1.5rem] text-center ${
                        isBlocking ? "text-red-400" : isClear ? "text-neutral-600" : "text-amber-400"
                      }`}>
                        {row.count}
                      </span>
                      {/* View link */}
                      {row.viewLink && row.count > 0 && (
                        <Link
                          href={row.viewLink}
                          className="text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors whitespace-nowrap"
                        >
                          {t("viewBtn")}
                        </Link>
                      )}
                      {/* Cleanup button */}
                      {row.cleanupAction && row.count > 0 && (
                        <CleanupButton
                          presenterId={presenterId}
                          action={row.cleanupAction}
                          buttonLabel={row.cleanupLabel!}
                          confirmText={row.cleanupConfirm!}
                        />
                      )}
                    </div>
                  </div>
                  {/* Note */}
                  {row.note && (
                    <p className="mt-2 text-[11px] text-neutral-400/90 bg-neutral-900/60 border border-neutral-800/40 rounded-lg px-2.5 py-1.5 leading-relaxed">
                      {row.note}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* ── Actions ── */}
        <PresenterWizardClient
          presenterId={presenterId}
          isActive={presenter.isActive}
          isHardDeleteSafe={isHardDeleteSafe}
          deactivateAction={deactivatePresenter}
          hardDeleteAction={hardDeletePresenter}
        />

        {/* ── Back link ── */}
        <div className="text-center">
          <Link
            href={`/admin/presenters/${presenterId}/edit`}
            className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            {t("backToEdit")}
          </Link>
        </div>
      </div>
    </div>
  );
}
