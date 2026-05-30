import Link from "next/link";
import { auth, prisma } from "@/auth";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { Unauthorized } from "@/components/ui/Unauthorized";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState }  from "@/components/ui/EmptyState";
import { getTranslations, getLocale } from "next-intl/server";
import { isRtl } from "@/i18n/config";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";

// Force dynamic so counts and DJ status are always fresh.
export const dynamic = "force-dynamic";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StationCard {
  id: string;
  name: string;
  slug: string;
  streamHost: string | null;
  streamPort: number | null;
  publicUrl: string | null;
  isActive: boolean;
  hasDjCredential: boolean;   // true = StationDefaultCredential exists & isActive
  presentersCount: number;    // PresenterStation rows where isActive=true
  programsCount: number;      // Program rows where isActive=true
  recordingsCount: number;    // Recording rows linked to station
}

// ── Data fetch ────────────────────────────────────────────────────────────────

async function getManagerStations(managerId: string): Promise<StationCard[]> {
  const assignments = await prisma.stationManagerAssignment.findMany({
    where: { managerId, isActive: true },
    include: {
      station: {
        include: {
          defaultCredential: { select: { id: true, isActive: true } },
          _count: {
            select: {
              presenterStations: { where: { isActive: true } },
              programs:          { where: { isActive: true } },
              recordings:        true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return assignments.map((a) => {
    const s = a.station;
    return {
      id:               s.id,
      name:             s.name,
      slug:             s.slug,
      streamHost:       s.streamHost,
      streamPort:       s.streamPort,
      publicUrl:        s.publicUrl,
      isActive:         s.isActive,
      hasDjCredential:  !!(s.defaultCredential?.isActive),
      presentersCount:  s._count.presenterStations,
      programsCount:    s._count.programs,
      recordingsCount:  s._count.recordings,
    };
  });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function StationManagerDashboard() {
  // Auth guard
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = (session.user as any)?.role as string | undefined;
  // Wrong role: render Unauthorized instead of redirecting to /login.
  // Redirecting to /login creates a loop because /login immediately
  // redirects authenticated users back to their role-home page.
  if (role !== "STATION_MANAGER") {
    return <Unauthorized role={role ?? ""} />;
  }

  const t = await getTranslations("stationManager.dashboard");
  const tCommon = await getTranslations("common");
  const tAuth = await getTranslations("auth");
  const locale = await getLocale();
  const dir = isRtl(locale) ? "rtl" : "ltr";

  const managerId  = (session.user as any)?.id   as string;
  const managerName = session.user.name ?? session.user.email ?? t("defaultRole");

  let stations: StationCard[] = [];
  let fetchError = false;
  try {
    stations = await getManagerStations(managerId);
  } catch {
    fetchError = true;
  }

  // Summary totals
  const totalPresenters  = stations.reduce((s, st) => s + st.presentersCount,  0);
  const totalPrograms    = stations.reduce((s, st) => s + st.programsCount,    0);
  const totalRecordings  = stations.reduce((s, st) => s + st.recordingsCount,  0);

  return (
    <div
      dir={dir}
      className="min-h-screen bg-slate-950 text-slate-100"
    >
      <link
        rel="stylesheet"
      />

      {/* ── Header ── */}
      <header className="bg-slate-900 border-b border-slate-800 shadow-lg sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow text-xl flex-shrink-0"
              style={{ background: "linear-gradient(to bottom right, var(--eg-primary), var(--eg-accent))" }}
            >
              📻
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-100 leading-tight">
                {t("title")}
              </h1>
              <p className="text-xs text-slate-500">EGONAIR</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:block text-right">
              <p className="text-xs text-slate-500">{t("greeting")}</p>
              <p className="text-sm font-semibold max-w-[160px] truncate" style={{ color: "var(--eg-primary)" }}>{managerName}</p>
            </div>
            <LanguageSwitcher />
            <Link
              href="/profile"
              className="flex items-center gap-1.5 text-xs text-slate-400 border border-slate-700 rounded-lg px-3 py-2 transition-colors"
              onMouseEnter={e => { e.currentTarget.style.color = "var(--eg-primary)"; e.currentTarget.style.borderColor = "color-mix(in srgb, var(--eg-primary) 40%, transparent)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = ""; e.currentTarget.style.borderColor = ""; }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
              </svg>
              {t("myProfile")}
            </Link>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button
                type="submit"
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-500/40 rounded-lg px-3 py-2 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                {tAuth("logout")}
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">

        {/* ── Intro section ── */}
        <div
          className="rounded-2xl px-6 py-5 border"
          style={{ background: "linear-gradient(to bottom right, color-mix(in srgb, var(--eg-primary) 15%, transparent), color-mix(in srgb, var(--eg-accent) 10%, transparent))", borderColor: "color-mix(in srgb, var(--eg-primary) 20%, transparent)" }}
        >
          <h2 className="text-xl font-bold text-slate-100 mb-1">
            {t("welcome", { name: managerName })}
          </h2>
          <p className="text-sm text-slate-400">
            {t("welcomeDescription")}
          </p>
        </div>

        {/* ── Summary stat row (only when stations exist) ── */}
        {!fetchError && stations.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <SummaryCard icon="📡" label={t("assignedStations")}   value={stations.length}   color="teal"   />
            <SummaryCard icon="🎙️" label={t("totalPresenters")}   value={totalPresenters}   color="indigo" />
            <SummaryCard icon="📺" label={t("totalPrograms")}      value={totalPrograms}     color="purple" />
            <SummaryCard icon="🗂️" label={t("totalRecordings")}   value={totalRecordings}   color="amber"  />
          </div>
        )}

        {/* ── Error state ── */}
        {fetchError && (
          <div className="bg-red-950/40 border border-red-500/30 rounded-2xl p-8 text-center text-red-400 text-sm">
            {t("fetchError")}
          </div>
        )}

        {/* ── Empty state ── */}
        {!fetchError && stations.length === 0 && (
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
            <EmptyState
              icon="📭"
              title={t("noStationsTitle")}
              description={t("noStationsDescription")}
              action={
                <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
                  <button type="submit" className="text-sm text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-500/30 rounded-lg px-4 py-2 transition-colors">
                    {tAuth("logout")}
                  </button>
                </form>
              }
            />
          </div>
        )}

        {/* ── Station cards ── */}
        {!fetchError && stations.length > 0 && (
          <>
            <div>
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-4">
                {t("yourStations")}
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {stations.map((st) => (
                  <StationCardComponent key={st.id} station={st} t={t} />
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ── Summary card ──────────────────────────────────────────────────────────────

function SummaryCard({
  icon, label, value, color,
}: {
  icon: string;
  label: string;
  value: number;
  color: "teal" | "indigo" | "purple" | "amber";
}) {
  const cls: Record<typeof color, string> = {
    teal:   "border-teal-700/30   bg-teal-950/40   text-teal-300",
    indigo: "border-indigo-700/30 bg-indigo-950/40 text-indigo-300",
    purple: "border-purple-700/30 bg-purple-950/40 text-purple-300",
    amber:  "border-amber-700/30  bg-amber-950/40  text-amber-300",
  };
  return (
    <div className={`rounded-2xl border px-4 py-4 ${cls[color]}`}>
      <div className="text-2xl mb-1">{icon}</div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-slate-500 leading-tight mt-0.5">{label}</p>
    </div>
  );
}

// ── Station card ──────────────────────────────────────────────────────────────

function StationCardComponent({ station: s, t }: { station: StationCard; t: any }) {
  const streamInfo = s.streamHost
    ? `${s.streamHost}${s.streamPort ? `:${s.streamPort}` : ""}`
    : null;

  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 shadow-lg hover:border-teal-500/40 transition-colors flex flex-col gap-5">

      {/* Station name + status */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shadow flex-shrink-0"
            style={{ background: "linear-gradient(to bottom right, color-mix(in srgb, var(--eg-primary) 60%, black), color-mix(in srgb, var(--eg-accent) 50%, black))" }}
          >
            📡
          </div>
          <div className="min-w-0">
            <h4 className="font-bold text-slate-100 truncate">{s.name}</h4>
            <p className="text-xs font-mono text-slate-500 truncate">{s.slug}</p>
          </div>
        </div>
        <StatusBadge
          label={s.isActive ? t("stationActive") : t("stationInactive")}
          variant={s.isActive ? "success" : "neutral"}
          dot
          className="flex-shrink-0"
        />
      </div>

      {/* Connection info */}
      {(streamInfo || s.publicUrl) && (
        <div className="bg-slate-800/60 rounded-xl px-4 py-3 space-y-1.5">
          {streamInfo && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>🔗</span>
              <span className="font-mono">{streamInfo}</span>
            </div>
          )}
          {s.publicUrl && (
            <div className="flex items-center gap-2 text-xs text-teal-400 truncate">
              <span>🌐</span>
              <a href={s.publicUrl} target="_blank" rel="noopener noreferrer" className="hover:underline truncate">
                {s.publicUrl}
              </a>
            </div>
          )}
        </div>
      )}

      {/* DJ credential status */}
      <div className="flex items-center gap-2">
        <StatusBadge
          label={
            s.hasDjCredential
              ? t("djCredentialsReady")
              : t("djCredentialsNotReady")
          }
          variant={s.hasDjCredential ? "success" : "warning"}
          dot
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatBadge icon="🎙️" label={t("presentersStat")}  value={s.presentersCount}  color="indigo" />
        <StatBadge icon="📺" label={t("programsStat")}     value={s.programsCount}    color="purple" />
        <StatBadge icon="🗂️" label={t("recordingsStat")}  value={s.recordingsCount}  color="amber"  />
      </div>

      {/* Action cards */}
      <div>
        <p className="text-xs text-slate-600 mb-2 font-medium">{t("actions")}</p>
        <div className="grid grid-cols-2 gap-2">
          <ActionLink href="/station-manager/presenters" icon="🎙️" label={t("stationPresenters")} openLabel={t("open")} />
          <ActionLink href="/station-manager/programs"   icon="📺" label={t("stationPrograms")} openLabel={t("open")} />
          <ActionLink href="/station-manager/recordings" icon="🗂️" label={t("stationRecordings")} openLabel={t("open")} />
          <ActionLink href="/station-manager/dj-settings" icon="⚙️" label={t("djSettingsLink")} openLabel={t("open")} />
          <ActionLink href="/station-manager/media"      icon="🎵" label={t("mediaLibrary")} openLabel={t("open")} />
          <ActionLink href="/station-manager/schedule"   icon="📅" label={t("stationSchedule")} openLabel={t("open")} />
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatBadge({
  icon, label, value, color,
}: {
  icon: string;
  label: string;
  value: number;
  color: "indigo" | "purple" | "amber";
}) {
  const cls: Record<typeof color, string> = {
    indigo: "text-indigo-400 bg-indigo-950/40 border-indigo-700/20",
    purple: "text-purple-400 bg-purple-950/40 border-purple-700/20",
    amber:  "text-amber-400  bg-amber-950/40  border-amber-700/20",
  };
  return (
    <div className={`rounded-xl border px-2 py-2.5 text-center ${cls[color]}`}>
      <div className="text-base">{icon}</div>
      <p className="text-lg font-bold leading-tight">{value}</p>
      <p className="text-[10px] text-slate-500 leading-tight">{label}</p>
    </div>
  );
}

function ActionLink({
  href, icon, label, openLabel, className = "",
}: {
  href: string;
  icon: string;
  label: string;
  openLabel: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 border rounded-xl px-3 py-2.5 transition-colors group ${className}`}
      style={{ background: "color-mix(in srgb, var(--eg-primary) 10%, transparent)", borderColor: "color-mix(in srgb, var(--eg-primary) 20%, transparent)" }}
      onMouseEnter={e => { e.currentTarget.style.background = "color-mix(in srgb, var(--eg-primary) 20%, transparent)"; e.currentTarget.style.borderColor = "color-mix(in srgb, var(--eg-primary) 40%, transparent)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "color-mix(in srgb, var(--eg-primary) 10%, transparent)"; e.currentTarget.style.borderColor = "color-mix(in srgb, var(--eg-primary) 20%, transparent)"; }}
    >
      <span className="text-sm">{icon}</span>
      <div>
        <div className="text-xs font-medium transition-colors" style={{ color: "var(--eg-primary)" }}>{label}</div>
        <div className="text-[10px]" style={{ color: "var(--eg-accent)" }}>{openLabel}</div>
      </div>
    </Link>
  );
}

function ActionPlaceholder({
  icon, label, comingSoonLabel, className = "",
}: {
  icon: string;
  label: string;
  comingSoonLabel: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-2 bg-slate-800/40 border border-slate-700/30 rounded-xl px-3 py-2.5 opacity-50 cursor-not-allowed select-none ${className}`}
    >
      <span className="text-sm">{icon}</span>
      <div>
        <div className="text-xs font-medium text-slate-400">{label}</div>
        <div className="text-[10px] text-slate-600">{comingSoonLabel}</div>
      </div>
    </div>
  );
}
