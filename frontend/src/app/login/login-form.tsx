"use client";

import { doLogin } from "./actions";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const [username,  setUsername]  = useState("");
  const [password,  setPassword]  = useState("");
  const [error,     setError]     = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  // ── All original submit + redirect logic — unchanged ─────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const res = await doLogin(username, password);

      if (res.error) {
        setError(res.error);
      } else {
        if (res.role === "ADMIN") {
          router.replace("/admin");
        } else if (res.role === "STATION_MANAGER") {
          router.replace("/station-manager");
        } else {
          router.replace("/studio");
        }
      }
    } catch {
      setError("حدث خطأ في الاتصال");
    } finally {
      setIsLoading(false);
    }
  };

  // ── Shared input style ────────────────────────────────────────────────────
  const inputCls = [
    "w-full px-4 py-3 rounded-xl text-sm transition-all outline-none",
    "bg-slate-900 border text-slate-100 placeholder-slate-600",
    "border-slate-700 transition-colors outline-none",
    "focus:border-[var(--eg-primary)] focus:ring-2 focus:ring-[var(--eg-primary)]/20",
  ].join(" ");

  const labelCls = "block text-xs font-semibold tracking-wide mb-1.5 text-slate-400";

  return (
    <form onSubmit={handleSubmit} className="space-y-5" dir="rtl">

      {/* ── Error banner ─────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm"
          style={{
            background: "var(--eg-danger-soft)",
            borderColor: "rgba(248,113,113,0.30)",
            color: "var(--eg-danger)",
          }}>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* ── Username field ────────────────────────────────────────────────── */}
      <div>
        <label className={labelCls} htmlFor="login-username">
          اسم المستخدم
        </label>
        <div className="relative">
          <span className="absolute inset-y-0 right-3.5 flex items-center text-slate-600 pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </span>
          <input
            id="login-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={`${inputCls} pr-10`}
            dir="ltr"
            autoComplete="username"
            autoFocus
            required
            placeholder="username"
          />
        </div>
      </div>

      {/* ── Password field ────────────────────────────────────────────────── */}
      <div>
        <label className={labelCls} htmlFor="login-password">
          كلمة المرور
        </label>
        <div className="relative">
          <span className="absolute inset-y-0 right-3.5 flex items-center text-slate-600 pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </span>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${inputCls} pr-10`}
            dir="ltr"
            autoComplete="current-password"
            required
            placeholder="••••••••"
          />
        </div>
      </div>

      {/* ── Submit button ─────────────────────────────────────────────────── */}
      <button
        id="login-submit"
        type="submit"
        disabled={isLoading}
        className="relative w-full py-3 px-6 rounded-xl font-semibold text-sm text-white transition-all duration-200 overflow-hidden disabled:opacity-60 disabled:cursor-not-allowed mt-2"
        style={{
          background: isLoading
            ? "linear-gradient(135deg, color-mix(in srgb, var(--eg-primary) 80%, black), color-mix(in srgb, var(--eg-accent) 80%, black))"
            : "linear-gradient(135deg, var(--eg-primary) 0%, var(--eg-accent) 100%)",
          boxShadow: isLoading ? "none" : "0 4px 20px color-mix(in srgb, var(--eg-primary) 35%, transparent)",
        }}
      >
        {/* Shimmer effect on hover — CSS handles it, no JS needed */}
        <span className="relative z-10 flex items-center justify-center gap-2">
          {isLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin flex-shrink-0" />
              جاري الدخول...
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                <polyline points="10 17 15 12 10 7"/>
                <line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
              تسجيل الدخول
            </>
          )}
        </span>
      </button>

    </form>
  );
}
