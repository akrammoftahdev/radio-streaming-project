import { auth, prisma } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState }  from "@/components/ui/EmptyState";
import { encrypt } from "@/lib/encryption";
import { revalidatePath } from "next/cache";
import { Unauthorized } from "@/components/ui/Unauthorized";

export const dynamic = "force-dynamic";
export const metadata = { title: "إعدادات DJ - EGONAIR" };

export default async function SMDjSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; stationId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = (session.user as any)?.role as string;
  if (role !== "STATION_MANAGER") return <Unauthorized role={role} />;

  const managerId   = (session.user as any)?.id as string;
  const managerName = session.user.name ?? session.user.email ?? "مدير المحطة";

  const assignments = await prisma.stationManagerAssignment.findMany({
    where: { managerId, isActive: true },
    include: {
      station: {
        include: {
          defaultCredential: {
            select: { id: true, host: true, port: true, djUsername: true, mount: true, sid: true, bitrate: true, isActive: true },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Inline per-card feedback — stationId param identifies which card triggered save
  const { error: spError, success: spSuccess, stationId: spStationId } = await searchParams;

  return (
    <div dir="rtl" className="min-h-screen bg-slate-950 text-slate-100"
      style={{ fontFamily: "'Cairo','Segoe UI',system-ui,sans-serif" }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap" />

      <header className="bg-slate-900 border-b border-slate-800 shadow-lg sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/station-manager" className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-slate-100 transition-colors">←</Link>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-lg shadow">⚙️</div>
            <div>
              <h1 className="text-base font-bold text-slate-100 leading-tight">إعدادات DJ للمحطة</h1>
              <p className="text-xs text-slate-500">{managerName}</p>
            </div>
          </div>
          <Link href="/station-manager" className="text-xs text-slate-400 hover:text-teal-300 border border-slate-700 hover:border-teal-600/50 rounded-lg px-3 py-2 transition-colors">← اللوحة</Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {assignments.length === 0 && (
          <EmptyState icon="📭" title="لا توجد محطات مسندة" description="لم يتم إسناد أي محطة لحسابك. تواصل مع الإدارة لتفعيل صلاحياتك." />
        )}

        <p className="text-xs text-slate-500">
          بيانات DJ تُستخدم لربط المذيعين بالمحطة عند البث. كلمة المرور مشفرة ولا تُعرض.
        </p>

        {assignments.map(({ station }) => {
          const cred = station.defaultCredential;
          // Show inline feedback only for the card that triggered the save
          const isThisCard = spStationId === station.id;
          const showSuccess = isThisCard && !!spSuccess;
          const showError   = isThisCard && !!spError;

          return (
            <section
              key={station.id}
              id={`station-${station.id}`}
              className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 scroll-mt-24"
            >
              {/* Station name + credential status */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-700 to-cyan-800 flex items-center justify-center text-base">📡</div>
                <div>
                  <h2 className="font-bold text-slate-100 text-sm">{station.name}</h2>
                  <StatusBadge
                    label={cred ? (cred.isActive ? "بيانات DJ مُعدة" : "بيانات DJ معطّلة") : "لا توجد بيانات DJ"}
                    variant={cred?.isActive ? "success" : cred ? "warning" : "danger"}
                    dot
                  />
                </div>
              </div>

              {/* ── Inline feedback for THIS card only ── */}
              {showSuccess && (
                <div className="mb-4 flex items-center gap-2 bg-emerald-950/50 border border-emerald-500/30 text-emerald-400 rounded-xl px-4 py-3 text-sm">
                  <span>✅</span>
                  <span>تم حفظ بيانات DJ للمحطة بنجاح.</span>
                </div>
              )}
              {showError && (
                <div className="mb-4 flex items-center gap-2 bg-red-950/50 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 text-sm">
                  <span>⚠️</span>
                  <span>{spError}</span>
                </div>
              )}

              <form action={saveDjAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input type="hidden" name="stationId"  value={station.id} />
                <input type="hidden" name="managerId"  value={managerId} />
                <input type="hidden" name="credId"     value={cred?.id ?? ""} />

                <DField label="الخادم (Host) *"  name="host"       defaultValue={cred?.host ?? ""}              dir="ltr" required />
                <DField label="المنفذ (Port) *"  name="port"       defaultValue={cred?.port?.toString() ?? "8000"} dir="ltr" required type="number" />
                <DField label="اسم مستخدم DJ *" name="djUsername" defaultValue={cred?.djUsername ?? ""}          dir="ltr" required />
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">كلمة مرور DJ</label>
                  <input name="djPassword" type="password" dir="ltr" placeholder="اتركه فارغاً للإبقاء على الحالية"
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors" />
                </div>
                <DField label="Mount"   name="mount"   defaultValue={cred?.mount ?? ""}   dir="ltr" />
                <DField label="SID"     name="sid"     defaultValue={cred?.sid ?? ""}     dir="ltr" />
                <DField label="Bitrate" name="bitrate" defaultValue={cred?.bitrate?.toString() ?? "128"} dir="ltr" type="number" />
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">الحالة</label>
                  <select name="isActive" defaultValue={cred?.isActive !== false ? "true" : "false"}
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-500 transition-colors">
                    <option value="true">مفعّل</option>
                    <option value="false">معطّل</option>
                  </select>
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <button type="submit"
                    className="bg-cyan-700 hover:bg-cyan-600 text-white font-semibold text-sm rounded-xl px-6 py-2.5 transition-colors">
                    حفظ إعدادات DJ
                  </button>
                </div>
              </form>
            </section>
          );
        })}
      </main>
    </div>
  );
}

// ── Server action ─────────────────────────────────────────────────────────────

async function saveDjAction(formData: FormData) {
  "use server";
  const { auth: _auth, prisma: _prisma } = await import("@/auth");
  const { encrypt: _encrypt } = await import("@/lib/encryption");
  const { redirect: redir } = await import("next/navigation");
  const { revalidatePath: _revalidate } = await import("next/cache");

  const session = await _auth();
  if (!session?.user || (session.user as any)?.role !== "STATION_MANAGER") redir("/login");
  const managerId = ((session as any).user as any)?.id as string;

  const assignments = await _prisma.stationManagerAssignment.findMany({
    where: { managerId, isActive: true }, select: { stationId: true },
  });
  const assignedIds = assignments.map((a: any) => a.stationId);

  const stationId  = (formData.get("stationId")  as string)?.trim() ?? "";
  const credId     = (formData.get("credId")      as string)?.trim() ?? "";
  const host       = (formData.get("host")        as string)?.trim() ?? "";
  const portRaw    = parseInt(formData.get("port") as string, 10);
  const port       = (!isNaN(portRaw) && portRaw >= 1 && portRaw <= 65535) ? portRaw : 8000;
  const djUsername = (formData.get("djUsername")  as string)?.trim() ?? "";
  const djPassword = (formData.get("djPassword")  as string) ?? "";
  const mount      = (formData.get("mount")       as string)?.trim() || null;
  const sid        = (formData.get("sid")         as string)?.trim() || null;
  const bitrate    = parseInt(formData.get("bitrate") as string, 10) || 128;
  const isActive   = formData.get("isActive") === "true";

  // Anchor: scroll back to this station's card after redirect
  const anchor = stationId ? `#station-${stationId}` : "";
  const cardParam = stationId ? `&stationId=${encodeURIComponent(stationId)}` : "";

  function errRedir(msg: string) {
    redir(`/station-manager/dj-settings?error=${encodeURIComponent(msg)}${cardParam}${anchor}`);
  }

  if (!assignedIds.includes(stationId)) errRedir("المحطة غير مسندة لحسابك");
  if (!host || !djUsername)             errRedir("الخادم واسم المستخدم مطلوبان");
  if (port < 1 || port > 65535)        errRedir("المنفذ يجب أن يكون بين 1 و 65535");

  try {
    if (credId) {
      // Update existing — only replace password if new one provided
      const updateData: any = { host, port, djUsername, mount, sid, bitrate, isActive };
      if (djPassword) updateData.encryptedPassword = _encrypt(djPassword);
      await _prisma.stationDefaultCredential.update({ where: { id: credId }, data: updateData });
    } else {
      // Create new — password required
      if (!djPassword) errRedir("كلمة المرور مطلوبة عند الإنشاء الأول");
      await _prisma.stationDefaultCredential.create({
        data: { stationId, host, port, djUsername, encryptedPassword: _encrypt(djPassword), mount, sid, bitrate, isActive },
      });
    }
    await _prisma.adminAuditLog.create({
      data: {
        actorId: managerId, actorRole: "STATION_MANAGER",
        action: "UPDATE_STATION_DEFAULT_DJ_CREDENTIAL", entityType: "StationDefaultCredential",
        entityId: credId || stationId, stationId,
        metadata: JSON.stringify({ host, port, djUsername, mount, bitrate, isActive }),
      },
    }).catch(() => {});
  } catch (err: any) {
    errRedir("حدث خطأ: " + (err?.message ?? ""));
  }

  _revalidate("/station-manager/dj-settings");
  redir(`/station-manager/dj-settings?success=1${cardParam}${anchor}`);
}

function DField({ label, name, defaultValue, dir: d, required, type = "text" }: {
  label: string; name: string; defaultValue?: string; dir?: string; required?: boolean; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1">{label}</label>
      <input name={name} type={type} defaultValue={defaultValue} dir={d} required={required}
        className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors" />
    </div>
  );
}
