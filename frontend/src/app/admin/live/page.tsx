import { auth, prisma } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import AutoRefresh from "./auto-refresh";
import { AdminPageShell } from "@/components/ui";
import DisconnectButton from "./disconnect-button";
import { getTranslations, getLocale } from "next-intl/server";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("admin.live");
  return { title: t("title") };
}

export default async function LiveSessionsPage() {
  const session = await auth();

  if (!session || (session.user as any).role !== "ADMIN") {
    redirect("/login");
  }

  const t = await getTranslations("admin.live");
  const locale = await getLocale();
  const dir = locale === "ar" ? "rtl" : "ltr";
  
  const now = new Date();

  const sessions = await prisma.liveSession.findMany({
    where: { disconnectedAt: null },
    orderBy: { updatedAt: "desc" },
    include: {
      presenter: { select: { name: true, username: true } },
    },
  });

  const staleThresholdMs = 10 * 1000;

  const statusLabel: Record<string, { label: string; color: string }> = {
    LIVE:       { label: t("statusLive"),       color: "text-red-400 bg-red-500/10 border-red-500/20" },
    CONNECTED:  { label: t("statusConnected"),  color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
    IDLE:       { label: t("statusIdle"),       color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
    ERROR:      { label: t("statusError"),      color: "text-rose-400 bg-rose-500/10 border-rose-500/20" },
  };

  return (
    <div dir={dir}>
      <AdminPageShell maxWidth="max-w-6xl" padding="p-8">
        <AutoRefresh intervalMs={5_000} />

        <div className="space-y-6">

          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-l from-red-400 to-rose-500 bg-clip-text text-transparent">
                {t("titleMain")}
              </h1>
              <p className="text-sm text-neutral-500 mt-1">
                {t("lastUpdated")} {now.toLocaleTimeString(locale === "ar" ? "ar-EG" : "en-US")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-neutral-500">
                {t("activeSessions", { count: sessions.length })}
              </span>
              <LanguageSwitcher compact />
              <Link
                href="/admin/live"
                className="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                style={{ background: "var(--eg-primary)" }}
              >
                {t("refreshPage")}
              </Link>
              <Link
                href="/admin"
                className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-neutral-800 text-sm rounded-lg transition-colors whitespace-nowrap"
              >
                {t("dashboard")}
              </Link>
            </div>
          </div>

          {/* Table */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
            {sessions.length === 0 ? (
              <div className="py-16 text-center">
                <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-neutral-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                </div>
                <p className="text-neutral-500">{t("noSessions")}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className={`w-full ${dir === "rtl" ? "text-right" : "text-left"} border-collapse`}>
                  <thead>
                    <tr className="bg-neutral-950/50 border-b border-neutral-800">
                      <th className="px-6 py-4 text-sm font-semibold text-neutral-400">{t("tablePresenter")}</th>
                      <th className="px-6 py-4 text-sm font-semibold text-neutral-400">{t("tableStatus")}</th>
                      <th className="px-6 py-4 text-sm font-semibold text-neutral-400">{t("tableMic")}</th>
                      <th className="px-6 py-4 text-sm font-semibold text-neutral-400">{t("tableNetwork")}</th>
                      <th className="px-6 py-4 text-sm font-semibold text-neutral-400">{t("tableLastHeartbeat")}</th>
                      <th className="px-6 py-4 text-sm font-semibold text-neutral-400">{t("tableUpdated")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/50">
                    {sessions.map((s) => {
                      const ageMs = now.getTime() - new Date(s.updatedAt).getTime();
                      const isStale = ageMs > staleThresholdMs;
                      const statusInfo = statusLabel[s.status] ?? { label: s.status, color: "text-neutral-400 bg-neutral-800 border-neutral-700" };

                      return (
                        <tr key={s.id} className={`transition-colors ${isStale ? "bg-amber-500/5" : "hover:bg-neutral-800/20"}`}>
                          <td className="px-6 py-4">
                            <div className="font-medium text-neutral-200">{s.presenter.name || "—"}</div>
                            <div className="text-xs text-neutral-500 font-mono mt-0.5">{s.presenter.username}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5">
                              {s.status === "LIVE" && (
                                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.8)]"></div>
                              )}
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${statusInfo.color}`}>
                                {statusInfo.label}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${s.currentMicState ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-neutral-800/50 text-neutral-500 border-neutral-700"}`}>
                              <div className={`w-1.5 h-1.5 rounded-full ${s.currentMicState ? "bg-red-500" : "bg-neutral-600"}`}></div>
                              {s.currentMicState ? t("micOpen") : t("micClosed")}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-neutral-400">{s.networkQuality || "—"}</span>
                          </td>
                          <td className="px-6 py-4">
                            {isStale ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                                {t("heartbeatStale")}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                {t("heartbeatAlive")}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-neutral-500">
                              {new Date(s.updatedAt).toLocaleTimeString(locale === "ar" ? "ar-EG" : "en-US")}
                            </div>
                            <div className="text-xs text-neutral-600 mt-0.5">
                              {t("secondsAgo", { seconds: Math.round(ageMs / 1000) })}
                            </div>
                            <DisconnectButton sessionId={s.id} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>{/* end space-y-6 */}
      </AdminPageShell>
    </div>
  );
}
