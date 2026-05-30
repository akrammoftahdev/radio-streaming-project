import { auth } from "@/auth";
import { redirect } from "next/navigation";
import LoginForm from "./login-form";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";

import { getSystemSettings, resolveLoginLogoUrl } from "@/lib/system-settings";
import { getTranslations, getLocale } from "next-intl/server";
import { isRtl } from '@/i18n/config';

export async function generateMetadata() {
  const settings = await getSystemSettings();
  const t = await getTranslations("auth");
  return {
    title: `${t("login")} — ${settings.systemName || "EGONAIR"} Remote Studio`,
    description: settings.systemSubtitle || t("welcomeSubtitle"),
  };
}

export default async function LoginPage() {
  const session = await auth();
  if (session) {
    const role = (session.user as any)?.role;
    if (role === "ADMIN")           redirect("/admin");
    if (role === "STATION_MANAGER") redirect("/station-manager");
    redirect("/studio");
  }
  
  const settings = await getSystemSettings();
  const systemName = settings.systemName || "EGONAIR";
  const systemSubtitle = settings.systemSubtitle || "";
  const logoUrl = resolveLoginLogoUrl(settings, "dark");
  const locale = await getLocale();
  const dir = isRtl(locale) ? 'rtl' : 'ltr';

  return (
    <main
      dir={dir}
      className="relative flex items-center justify-center min-h-screen overflow-hidden"
      style={{ background: "var(--eg-bg)", colorScheme: "dark" }}
    >
      {/* ── Language Switcher (top-right) ──────────────────────────────────── */}
      <div className="absolute top-4 right-4 z-20">
        <LanguageSwitcher compact />
      </div>

      {/* ── Ambient background glows ───────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Top-left glow */}
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full blur-[120px]" style={{ background: "color-mix(in srgb, var(--eg-primary) 10%, transparent)" }} />
        {/* Bottom-right glow */}
        <div className="absolute -bottom-40 -right-20 w-[500px] h-[500px] rounded-full blur-[100px]" style={{ background: "color-mix(in srgb, var(--eg-accent) 8%, transparent)" }} />
        {/* Center subtle pulse */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full blur-[80px]" style={{ background: "color-mix(in srgb, var(--eg-primary) 5%, transparent)" }} />
      </div>

      {/* ── Login card ─────────────────────────────────────────────────────── */}
      <div className="relative z-10 w-full max-w-sm mx-4">

        {/* Top accent line */}
        <div className="h-px w-full mb-8" style={{ background: "linear-gradient(to right, transparent, color-mix(in srgb, var(--eg-primary) 60%, transparent), transparent)" }} />

        <div
          className="rounded-2xl border p-8 shadow-2xl shadow-black/60 backdrop-blur-sm"
          style={{
            background: "rgba(15,23,42,0.85)",
            borderColor: "var(--eg-border)",
          }}
        >
          {/* ── Branding ─────────────────────────────────────────────────── */}
          <div className="text-center mb-8">
            {/* Logo mark */}
            {logoUrl ? (
              <img 
                src={logoUrl} 
                alt={`${systemName} Logo`} 
                className="h-14 w-auto object-contain mx-auto mb-5"
                style={{ maxHeight: '56px' }} 
              />
            ) : (
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5 shadow-lg"
                style={{ background: "linear-gradient(135deg, var(--eg-primary) 0%, var(--eg-accent) 100%)", boxShadow: "0 4px 14px color-mix(in srgb, var(--eg-primary) 20%, transparent)" }}>
                {/* Radio wave icon */}
                <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
                  <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/>
                  <path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
                </svg>
              </div>
            )}

            <h1 className="text-2xl font-black tracking-widest text-transparent bg-clip-text"
              style={{ backgroundImage: "linear-gradient(90deg, var(--eg-primary), var(--eg-accent))" }}>
              {systemName}
            </h1>
            <p className="text-sm mt-1.5" style={{ color: "var(--eg-text-muted)" }}>
              {systemSubtitle}
            </p>
          </div>

          {/* ── Form ─────────────────────────────────────────────────────── */}
          <LoginForm />
        </div>

        {/* Bottom accent line */}
        <div className="h-px w-full mt-8" style={{ background: "linear-gradient(to right, transparent, color-mix(in srgb, var(--eg-primary) 30%, transparent), transparent)" }} />

        {/* Footer note */}
        <p className="text-center text-xs mt-4" style={{ color: "var(--eg-text-faint)" }}>
          {systemName} Remote Studio © {new Date().getFullYear()}
        </p>
      </div>
    </main>
  );
}
