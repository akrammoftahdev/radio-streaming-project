import Link from "next/link";
import { roleHomePath, roleLabel, AppRole } from "@/lib/role-home";

interface UnauthorizedProps {
  /** The authenticated user's role — used to pick the correct home button path */
  role: AppRole;
  /** Optional extra context message */
  message?: string;
}

/**
 * Unauthorized
 *
 * Render this instead of redirect("/login") when a user IS authenticated
 * but does not have the required role for the current page.
 * This prevents the login ↔ page redirect loop.
 */
export function Unauthorized({ role, message }: UnauthorizedProps) {
  const home = roleHomePath(role);
  const label = roleLabel(role);

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-8 font-sans"
    >
      <div className="max-w-md w-full text-center space-y-6">
        {/* Icon */}
        <div className="w-20 h-20 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto">
          <span className="text-4xl">🚫</span>
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-red-400">
            نأسف، ليس مسموحًا لك بدخول هذه الصفحة
          </h1>
          {message && (
            <p className="text-slate-400 text-sm">{message}</p>
          )}
        </div>

        {/* Role pill */}
        <div className="inline-flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-full px-4 py-2 text-sm text-slate-300">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
          حسابك: <span className="font-semibold text-amber-300">{label}</span>
        </div>

        {/* Back to home */}
        <div>
          <Link
            href={home}
            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-colors shadow-lg shadow-indigo-500/20"
          >
            <span>←</span>
            العودة إلى صفحتي الرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}
