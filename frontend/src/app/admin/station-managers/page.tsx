import { auth, prisma } from "@/auth";
import { redirect }     from "next/navigation";
import Link from "next/link";
import {
  updateStationManagerAssignments,
  createStationManagerUser,
  updateStationManagerUser,
  changeStationManagerPassword,
  toggleStationManagerActive,
  deleteStationManager,
} from "./actions";
import { DeactivateManagerButton } from "./deactivate-button";
import { ManagersFilterBar }       from "./managers-filter-bar";
import { AdminPageShell } from "@/components/ui";
import { getTranslations, getLocale } from "next-intl/server";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";

export const dynamic  = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("admin.stationManagers");
  return { title: t("titleMeta") };
}

const PAGE_SIZE = 5;

const inp    = "w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 transition-all text-sm";
const inpSm  = "w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-teal-500/40 focus:border-teal-500 transition-all text-sm";

export default async function StationManagersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; saved?: string; edit?: string; q?: string; stations?: string; status?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session || (session.user as any).role !== "ADMIN") redirect("/login");

  const t = await getTranslations("admin.stationManagers");
  const locale = await getLocale();
  const dir = locale === "ar" ? "rtl" : "ltr";

  const { error, success, saved, edit: editId, q = "", stations: stationsParam = "", status = "all", page: pageParam = "1" } = await searchParams;
  const page       = Math.max(1, parseInt(pageParam, 10));
  const stationIds = stationsParam.split(",").filter(Boolean);

  // ── Build filter where clause ─────────────────────────────────────────────
  const where: Record<string, any> = {
    role: "STATION_MANAGER",
    ...(status === "active"   ? { isActive: true  } : {}),
    ...(status === "inactive" ? { isActive: false } : {}),
    ...(stationIds.length > 0 ? { stationManagerAssignments: { some: { stationId: { in: stationIds }, isActive: true } } } : {}),
    ...(q.trim() ? {
      OR: [
        { name:     { contains: q, mode: "insensitive" } },
        { username: { contains: q, mode: "insensitive" } },
        { email:    { contains: q, mode: "insensitive" } },
      ],
    } : {}),
  };

  const [managers, totalCount, allStations] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip:    (page - 1) * PAGE_SIZE,
      take:    PAGE_SIZE,
      select: {
        id: true, name: true, username: true, email: true, phone: true,
        isActive: true, createdAt: true,
        stationManagerAssignments: {
          where:  { isActive: true },
          select: { stationId: true, station: { select: { name: true, slug: true } } },
        },
      },
    }),
    prisma.user.count({ where }),
    prisma.station.findMany({
      where:   { isActive: true },
      orderBy: { name: "asc" },
      select:  { id: true, name: true, slug: true },
    }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const isFiltered = !!(q || stationIds.length || status !== "all");

  return (
    <div dir={dir}>
      <AdminPageShell maxWidth="max-w-5xl" padding="p-8">
        <div className="space-y-8">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-100 tracking-tight">{t("titleMain")}</h1>
              <p className="text-slate-400 text-sm mt-1">{t("subtitle")}</p>
            </div>
            <div className="flex items-center gap-4">
              <LanguageSwitcher compact />
              <Link href="/admin" className="text-sm text-slate-400 hover:text-slate-200 transition-colors">
                {t("backToAdmin")}
              </Link>
            </div>
          </div>

          {/* Banners */}
          {error && (
            <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-4 text-red-400 text-sm">
              <span>❌</span><span>{decodeURIComponent(error)}</span>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-5 py-4 text-emerald-400 text-sm">
              <span>✅</span><span>{decodeURIComponent(success)}</span>
            </div>
          )}
          {saved === "deactivated" && (
            <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-5 py-4 text-emerald-400 text-sm">
              <span>✅</span><span>{t("msgDeactivated")}</span>
            </div>
          )}
          {saved === "deleted" && (
            <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-5 py-4 text-emerald-400 text-sm">
              <span>✅</span><span>{t("msgDeleted")}</span>
            </div>
          )}

          {/* ── Create new Station Manager ─────────────────────────────────────── */}
          <section className="bg-slate-800 border border-slate-700/50 rounded-2xl p-6 shadow-xl">
            <h2 className="text-base font-semibold text-slate-200 mb-4 flex items-center gap-2">
              {t("createTitle")}
            </h2>
            <form action={createStationManagerUser} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-300">{t("fullName")}</label>
                  <input name="name" type="text" placeholder={t("namePlaceholder")} className={inp} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-300">{t("username")} <span className="text-red-400">*</span></label>
                  <input name="username" type="text" required placeholder={t("usernamePlaceholder")} className={inp} dir="ltr" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-300">{t("password")} <span className="text-red-400">*</span></label>
                  <input name="password" type="password" required placeholder={t("passwordPlaceholder")} className={inp} dir="ltr" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-300">{t("email")}</label>
                  <input name="email" type="email" placeholder={t("emailPlaceholder")} className={inp} dir="ltr" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-300">{t("phone")}</label>
                  <input name="phone" type="tel" placeholder={t("phonePlaceholder")} className={inp} dir="ltr" />
                </div>
              </div>
              <p className="text-xs text-amber-400/80">
                {t("createWarning")}
              </p>
              <button type="submit"
                className="px-6 py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-medium rounded-xl transition-colors shadow-lg shadow-teal-500/20 text-sm">
                {t("createBtn")}
              </button>
            </form>
          </section>

          {/* ── Managers list ─────────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-widest">
                {isFiltered
                  ? t("listFiltered", { totalCount })
                  : t("listTotal", { totalCount })}
              </h2>
              <span className="text-xs text-slate-500">{t("pageOf", { page, totalPages })}</span>

            </div>

            {/* ── Filter bar ── */}
            <div className="mb-5">
              <ManagersFilterBar allStations={allStations} />
            </div>

            {managers.length === 0 ? (
              <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-10 text-center">
                {isFiltered ? (
                  <>
                    <div className="text-4xl mb-3">🔍</div>
                    <p className="text-slate-300 font-semibold mb-2">{t("noMatchTitle")}</p>
                    <p className="text-slate-500 text-sm mb-4">{t("noMatchDesc")}</p>
                    <a href="/admin/station-managers"
                      className="text-sm text-teal-400 hover:text-teal-300 border border-teal-500/30 hover:border-teal-500/60 rounded-lg px-4 py-2 transition-colors">
                      {t("clearAll")}
                    </a>
                  </>
                ) : (
                  <p className="text-slate-500 text-sm">{t("noManagers")}</p>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                {managers.map((mgr) => {
                  const assignedIds = new Set(mgr.stationManagerAssignments.map(a => a.stationId));
                  const isEditing   = editId === mgr.id;

                  return (
                    <div key={mgr.id}
                      className={`bg-slate-800 border rounded-2xl p-5 shadow-sm transition-colors ${
                        isEditing ? "border-teal-500/40" : "border-slate-700/50 hover:border-slate-600/70"
                      }`}>

                      {/* ── Manager header ── */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <p className="font-semibold text-slate-100 leading-snug">{mgr.name || mgr.username}</p>
                          <p className="text-xs text-slate-500 font-mono mt-0.5">@{mgr.username}</p>
                          {mgr.email && <p className="text-xs text-slate-500 truncate">{mgr.email}</p>}
                          {mgr.phone && <p className="text-xs text-slate-600 font-mono">{mgr.phone}</p>}
                        </div>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${
                          mgr.isActive
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-red-500/10 text-red-400 border border-red-500/20"
                        }`}>
                          {mgr.isActive ? t("statusActive") : t("statusInactive")}
                        </span>
                      </div>

                      {/* Station chips summary (always visible) */}
                      <div className="mb-3">
                        {mgr.stationManagerAssignments.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {mgr.stationManagerAssignments.map(a => (
                              <span key={a.stationId}
                                className="inline-flex items-center gap-1 text-[11px] bg-teal-500/10 border border-teal-500/20 text-teal-300 px-2 py-0.5 rounded-full font-mono">
                                📡 {a.station.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-600 italic">{t("noStationsAssigned")}</p>
                        )}
                      </div>

                      {/* ── Action buttons row ── */}
                      <div className="flex items-center gap-2 flex-wrap py-2 border-t border-b border-slate-700/50 mb-3">
                        <Link href={isEditing
                            ? "/admin/station-managers"
                            : `/admin/station-managers?edit=${mgr.id}`}
                          scroll={false}
                          className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                            isEditing
                              ? "text-slate-400 bg-slate-700/50 border-slate-600 hover:bg-slate-700"
                              : "text-teal-400 bg-teal-500/10 border-teal-500/20 hover:bg-teal-500/20"
                          }`}>
                          {isEditing ? t("cancelEdit") : t("edit")}
                        </Link>
                        <form action={toggleStationManagerActive} className="inline">
                          <input type="hidden" name="managerId" value={mgr.id} />
                          <input type="hidden" name="currentIsActive" value={String(mgr.isActive)} />
                          <button type="submit"
                            className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                              mgr.isActive
                                ? "text-amber-400 bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20"
                                : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20"
                            }`}>
                            {mgr.isActive ? t("deactivate") : t("activate")}
                          </button>
                        </form>
                        <form action={deleteStationManager} className="inline">
                          <input type="hidden" name="managerId" value={mgr.id} />
                          <DeactivateManagerButton />
                        </form>
                      </div>

                      {/* ── Edit forms + Station assignment — only in edit mode ── */}
                      {isEditing && (
                        <div className="space-y-4">
                          {/* Profile edit */}
                          <div className="bg-slate-900/50 border border-teal-500/20 rounded-xl p-4 space-y-3">
                            <p className="text-xs font-semibold text-teal-400">{t("editTitle")}</p>
                            <form action={updateStationManagerUser} className="space-y-3">
                              <input type="hidden" name="managerId" value={mgr.id} />
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <label className="text-xs font-medium text-slate-400">{t("fullName")}</label>
                                  <input name="name" type="text" defaultValue={mgr.name || ""} placeholder={t("namePlaceholder")} className={inpSm} />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs font-medium text-slate-400">{t("username")} <span className="text-red-400">*</span></label>
                                  <input name="username" type="text" required defaultValue={mgr.username} className={inpSm} dir="ltr" />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs font-medium text-slate-400">{t("email")}</label>
                                  <input name="email" type="email" defaultValue={mgr.email || ""} placeholder={t("emailPlaceholder")} className={inpSm} dir="ltr" />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs font-medium text-slate-400">{t("phone")}</label>
                                  <input name="phone" type="tel" defaultValue={mgr.phone || ""} placeholder={t("phonePlaceholder")} className={inpSm} dir="ltr" />
                                </div>
                              </div>
                              <button type="submit"
                                className="px-4 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-medium rounded-lg transition-colors">
                                {t("saveData")}
                              </button>
                            </form>

                            {/* Password change */}
                            <div className="border-t border-slate-700/50 pt-3">
                              <p className="text-xs font-semibold text-slate-400 mb-2">{t("changePasswordTitle")}</p>
                              <form action={changeStationManagerPassword} className="space-y-3">
                                <input type="hidden" name="managerId" value={mgr.id} />
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <label className="text-xs font-medium text-slate-400">{t("newPassword")}</label>
                                    <input name="newPassword" type="password" required minLength={6} placeholder="••••••••" className={inpSm} dir="ltr" />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-xs font-medium text-slate-400">{t("confirmPassword")}</label>
                                    <input name="confirmPassword" type="password" required minLength={6} placeholder="••••••••" className={inpSm} dir="ltr" />
                                  </div>
                                </div>
                                <button type="submit"
                                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded-lg transition-colors">
                                  {t("changePasswordBtn")}
                                </button>
                              </form>
                            </div>
                          </div>

                          {/* Station assignment */}
                          {allStations.length === 0 ? (
                            <p className="text-xs text-slate-600">{t("noStationsActive")}</p>
                          ) : (
                            <form action={updateStationManagerAssignments}>
                              <input type="hidden" name="managerId" value={mgr.id} />
                              <p className="text-xs font-medium text-slate-400 mb-2">{t("assignedStationsLabel")}</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 mb-3">
                                {allStations.map(station => (
                                  <label key={station.id}
                                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl border cursor-pointer transition-colors group border-slate-700/50 hover:border-teal-500/40 hover:bg-teal-500/5">
                                    <div className="relative flex-shrink-0">
                                      <input type="checkbox" name="stationIds" value={station.id}
                                        defaultChecked={assignedIds.has(station.id)}
                                        className="peer sr-only" />
                                      <div className="w-4 h-4 border-2 border-slate-600 rounded bg-slate-900 peer-checked:bg-teal-500 peer-checked:border-teal-500 transition-all group-hover:border-slate-400" />
                                      <svg className={`absolute inset-0 w-4 h-4 text-white opacity-0 peer-checked:opacity-100 pointer-events-none ${dir === 'rtl' ? 'scale-x-[-1]' : ''}`}
                                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                      </svg>
                                    </div>
                                    <div>
                                      <div className="text-xs text-slate-200 group-hover:text-teal-300 transition-colors">{station.name}</div>
                                      <div className="text-[10px] text-slate-600 font-mono">{station.slug}</div>
                                    </div>
                                  </label>
                                ))}
                              </div>
                              <button type="submit"
                                className="px-4 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-medium rounded-lg transition-colors">
                                {t("saveAssignment")}
                              </button>
                            </form>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Pagination — always visible ── */}
            <div className="flex items-center justify-center gap-2 mt-6">
              {page > 1 ? (
                <Link
                  href={`?${new URLSearchParams({ ...(q ? { q } : {}), ...(stationsParam ? { stations: stationsParam } : {}), ...(status !== "all" ? { status } : {}), page: String(page - 1) }).toString()}`}
                  className="text-xs border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-slate-200 rounded-lg px-4 py-2 transition-colors">
                  {t("prev")}
                </Link>
              ) : (
                <span className="text-xs border border-slate-800/50 text-slate-700 rounded-lg px-4 py-2 cursor-not-allowed">{t("prev")}</span>
              )}
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce<(number | "...")[]>((acc, p, i, arr) => {
                    if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push("...");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === "..." ? (
                      <span key={`ellipsis-${i}`} className="text-xs text-slate-600 px-1">…</span>
                    ) : (
                      <Link
                        key={p}
                        href={`?${new URLSearchParams({ ...(q ? { q } : {}), ...(stationsParam ? { stations: stationsParam } : {}), ...(status !== "all" ? { status } : {}), page: String(p) }).toString()}`}
                        className={`text-xs w-8 h-8 flex items-center justify-center rounded-lg border transition-colors ${
                          p === page
                            ? "bg-teal-600/20 border-teal-600/40 text-teal-300"
                            : "border-slate-700 hover:border-slate-500 text-slate-400 hover:text-slate-200"
                        }`}>
                        {p}
                      </Link>
                    )
                  )
                }
              </div>
              {page < totalPages ? (
                <Link
                  href={`?${new URLSearchParams({ ...(q ? { q } : {}), ...(stationsParam ? { stations: stationsParam } : {}), ...(status !== "all" ? { status } : {}), page: String(page + 1) }).toString()}`}
                  className="text-xs border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-slate-200 rounded-lg px-4 py-2 transition-colors">
                  {t("next")}
                </Link>
              ) : (
                <span className="text-xs border border-slate-800/50 text-slate-700 rounded-lg px-4 py-2 cursor-not-allowed">{t("next")}</span>
              )}
            </div>
          </section>

        </div>{/* end space-y-8 */}
      </AdminPageShell>
    </div>
  );
}
