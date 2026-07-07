import { auth, prisma } from "@/auth";
import { redirect } from "next/navigation";
import { AdminPageShell } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AutoRefresh } from "@/components/ui";

const COUNTRIES = [
  { code: "EG", name: "Egypt", flag: "🇪🇬" },
  { code: "SA", name: "Saudi Arabia", flag: "🇸🇦" },
  { code: "AE", name: "UAE", flag: "🇦🇪" },
  { code: "US", name: "United States", flag: "🇺🇸" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
  { code: "FR", name: "France", flag: "🇫🇷" },
  { code: "DE", name: "Germany", flag: "🇩🇪" },
  { code: "IT", name: "Italy", flag: "🇮🇹" },
  { code: "ES", name: "Spain", flag: "🇪🇸" },
  { code: "MA", name: "Morocco", flag: "🇲🇦" },
  { code: "DZ", name: "Algeria", flag: "🇩🇿" },
  { code: "TN", name: "Tunisia", flag: "🇹🇳" },
  { code: "QA", name: "Qatar", flag: "🇶🇦" },
  { code: "KW", name: "Kuwait", flag: "🇰🇼" },
  { code: "OM", name: "Oman", flag: "🇴🇲" },
  { code: "BH", name: "Bahrain", flag: "🇧🇭" },
  { code: "JO", name: "Jordan", flag: "🇯🇴" },
  { code: "LB", name: "Lebanon", flag: "🇱🇧" },
  { code: "TR", name: "Turkey", flag: "🇹🇷" },
  { code: "WW", name: "Other / Global", flag: "🌐" }
];

function formatCountry(val: string | null) {
  if (!val) return "-";
  const normalized = val.trim().toLowerCase();
  
  // Try to match by code
  const byCode = COUNTRIES.find(c => c.code.toLowerCase() === normalized);
  if (byCode) return `${byCode.flag} ${byCode.name}`;
  
  // Try to match by name
  const byName = COUNTRIES.find(c => c.name.toLowerCase() === normalized);
  if (byName) return `${byName.flag} ${byName.name}`;
  
  return val;
}

export const dynamic = "force-dynamic";

export default async function StationInboxPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");

  const resolvedParams = await params;
  const stationId = resolvedParams.id;

  // Authorization: Admin or Station Manager for this station
  const user = session.user as any;
  let isAuthorized = false;

  if (user.role === "ADMIN") {
    isAuthorized = true;
  } else if (user.role === "STATION_MANAGER") {
    const managerAssign = await prisma.stationManagerAssignment.findFirst({
      where: {
        managerId: user.id,
        stationId: stationId,
        isActive: true,
      }
    });
    if (managerAssign) isAuthorized = true;
  }

  if (!isAuthorized) {
    redirect("/admin/stations");
  }

  const station = await prisma.station.findUnique({
    where: { id: stationId },
    select: { name: true }
  });

  if (!station) redirect("/admin/stations");

  const tl = await getTranslations("studio.LiveMessaging");
  const tc = await getTranslations("common");
  
  const messages = await prisma.listenerMessage.findMany({
    where: { stationId },
    orderBy: { createdAt: "desc" }
  });

  return (
    <AdminPageShell title={`${tl("inbox")} - ${station.name}`}>
      <AutoRefresh interval={5000} />
      <div dir="rtl" className="bg-slate-800 border border-slate-700/50 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
            <span className="text-2xl">📥</span>
            {tl("inbox")} ({messages.length})
          </h2>
          <Link
            href="/admin/stations"
            className="text-sm px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-200 transition-colors"
          >
            {tc("back")} ↩
          </Link>
        </div>

        {messages.length === 0 ? (
          <EmptyState
            icon="📭"
            title={tl("noMessages")}
            description=""
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse">
              <thead>
                <tr className="border-b border-slate-700 text-sm font-medium text-slate-400">
                  <th className="py-4 ps-4 pe-2 text-start">{tl("date")}</th>
                  <th className="py-4 px-2 text-start">{tl("sender")}</th>
                  <th className="py-4 px-2 text-start">{tl("phone")}</th>
                  <th className="py-4 px-2 text-start">{tl("country")}</th>
                  <th className="py-4 px-4 text-start">{tl("message")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {messages.map((msg) => (
                  <tr key={msg.id} className="hover:bg-slate-700/20 transition-colors">
                    <td className="py-3 ps-4 pe-2 text-sm text-slate-300 whitespace-nowrap">
                      {msg.createdAt.toLocaleString()}
                    </td>
                    <td className="py-3 px-2 text-sm text-slate-200">
                      <div className="font-medium">{msg.name}</div>
                      {msg.email && <div className="text-xs text-slate-500">{msg.email}</div>}
                    </td>
                    <td className="py-3 px-2 text-sm text-slate-300 whitespace-nowrap">
                      {msg.phoneNumber || "-"}
                    </td>
                    <td className="py-3 px-2 text-sm text-slate-300 whitespace-nowrap">
                      {formatCountry(msg.country)}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-300 max-w-md break-words">
                      {msg.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminPageShell>
  );
}
