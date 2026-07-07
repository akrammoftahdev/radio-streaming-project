import { prisma, auth } from "@/auth";
import { redirect } from "next/navigation";
import { AdminPageShell } from "@/components/ui/AdminPageShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getTranslations } from "next-intl/server";
import { deleteAdmin } from "./actions";
import { AdminCreateForm, AdminEditForm } from "./admin-forms";

export const dynamic = "force-dynamic";

export default async function AdminsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string; edit?: string; error?: string; saved?: string; delete?: string }>;
}) {
  const session = await auth();
  if (!session || (session.user as any).role !== "ADMIN") {
    redirect("/login");
  }

  const t = await getTranslations("admin.admins");
  const tc = await getTranslations("common");

  const sp = await searchParams;

  // Pagination & Filters
  const page = Math.max(1, parseInt(sp.page || "1", 10));
  const limit = 20;
  const skip = (page - 1) * limit;

  const q = sp.q?.trim() || "";
  const statusParam = sp.status || "all";

  const whereClause: any = { role: "ADMIN" };
  if (q) {
    whereClause.OR = [
      { name: { contains: q } },
      { username: { contains: q } },
    ];
  }
  if (statusParam === "active") whereClause.isActive = true;
  if (statusParam === "inactive") whereClause.isActive = false;

  const [admins, totalCount] = await Promise.all([
    prisma.user.findMany({
      where: whereClause,
      include: { profile: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.user.count({ where: whereClause }),
  ]);

  const totalPages = Math.ceil(totalCount / limit);

  // Edit State
  const editId = sp.edit;
  const editAdmin = editId ? admins.find((a) => a.id === editId) : null;

  // Delete State
  const deleteId = sp.delete;
  const deleteAdminData = deleteId ? admins.find((a) => a.id === deleteId) : null;

  const errorMsg = sp.error;
  const savedMsg = sp.saved;

  return (
    <AdminPageShell
      title={t("title")}
      description={t("subtitle")}
      backHref="/admin"
    >
      <div className="space-y-6">
        {/* Messages */}
        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm">
            {errorMsg}
          </div>
        )}
        {savedMsg === "true" && (
          <div className="bg-green-500/10 border border-green-500/20 text-green-400 px-4 py-3 rounded-xl text-sm">
            {editId ? t("updateSuccess") : t("createSuccess")}
          </div>
        )}
        {savedMsg === "deleted" && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-3 rounded-xl text-sm">
            {t("deleteSuccess")}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main List */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-1 backdrop-blur-sm overflow-x-auto">
              {admins.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">
                  {t("noAdmins")}
                </div>
              ) : (
                <table className="w-full text-sm text-left rtl:text-right">
                  <thead className="text-xs text-slate-400 bg-slate-800/50 uppercase border-b border-slate-700/50">
                    <tr>
                      <th className="px-4 py-3">{t("title")}</th>
                      <th className="px-4 py-3">{tc("status")}</th>
                      <th className="px-4 py-3">{tc("actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {admins.map((adminUser) => (
                      <tr key={adminUser.id} className="hover:bg-slate-700/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {adminUser.profile?.avatarUrl ? (
                              <img src={adminUser.profile.avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full object-cover" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
                                {adminUser.username.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div className="font-medium text-slate-200">{adminUser.name || "—"}</div>
                              <div className="text-xs text-slate-500 font-mono">@{adminUser.username}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge 
                            variant={adminUser.isActive ? "success" : "neutral"} 
                            label={adminUser.isActive ? t("statusActive") : t("statusInactive")} 
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <a
                              href={`/admin/admins?edit=${adminUser.id}`}
                              className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 rounded transition-colors"
                            >
                              {tc("edit")}
                            </a>
                            {adminUser.username !== "admin" && adminUser.id !== (session.user as any).id && (
                              <a
                                href={`/admin/admins?delete=${adminUser.id}`}
                                className="text-xs bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 px-3 py-1 rounded transition-colors"
                              >
                                {tc("delete")}
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Side Panel (Add / Edit / Delete) */}
          <div className="space-y-6">
            {deleteAdminData ? (
               <div className="bg-rose-500/10 rounded-2xl p-6 border border-rose-500/20">
                 <h2 className="text-lg font-bold text-rose-400 mb-4">{t("deleteConfirmTitle")}</h2>
                 <p className="text-sm text-slate-300 mb-6">{t("deleteConfirmMessage")}</p>
                 <div className="font-medium text-slate-200 mb-6">@{deleteAdminData.username}</div>
                 <form action={deleteAdmin} className="space-y-4">
                   <input type="hidden" name="id" value={deleteAdminData.id} />
                   <div className="flex gap-2">
                     <button type="submit" className="flex-1 bg-rose-500 hover:bg-rose-600 text-white py-2 rounded-xl text-sm font-medium transition-colors">
                       {t("confirmDelete")}
                     </button>
                     <a href="/admin/admins" className="flex-1 text-center bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-xl text-sm transition-colors block leading-10">
                       {t("cancelDelete")}
                     </a>
                   </div>
                 </form>
               </div>
            ) : editAdmin ? (
              <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-bold text-teal-400">
                    {tc("edit")} @{editAdmin.username}
                  </h2>
                  <a href="/admin/admins" className="text-xs text-slate-400 hover:text-white">
                    {tc("cancel")}
                  </a>
                </div>
                <AdminEditForm
                  adminId={editAdmin.id}
                  adminUsername={editAdmin.username}
                  adminName={editAdmin.name}
                  adminEmail={editAdmin.email}
                  adminPhone={editAdmin.phone}
                  adminAvatarUrl={(editAdmin as any).profile?.avatarUrl ?? null}
                  adminIsActive={editAdmin.isActive}
                  isCurrentUser={editAdmin.id === (session.user as any).id}
                  isMainAdmin={editAdmin.username === "admin"}
                />
              </div>
            ) : (
              <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50">
                <h2 className="text-lg font-bold text-teal-400 mb-6">{t("addNew")}</h2>
                <AdminCreateForm />
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminPageShell>
  );
}
