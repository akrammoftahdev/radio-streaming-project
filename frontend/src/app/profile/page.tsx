import { auth, prisma } from "@/auth";
import { redirect } from "next/navigation";
import { updateMyProfile, changeMyPassword } from "./actions";
import AvatarUpload from "./avatar-upload";
import DirectDjRadiosSection, { type DjRadio } from "./direct-dj-radios";
import { getTranslations, getLocale } from "next-intl/server";
import { isRtl } from "@/i18n/config";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";

export const dynamic = "force-dynamic";

// ── Role display helpers ──────────────────────────────────────────────────────

const ROLE_STYLES: Record<string, { color: string; icon: string }> = {
  ADMIN:           { color: "bg-red-500/10 text-red-400 border-red-500/30",       icon: "🛡️" },
  STATION_MANAGER: { color: "bg-teal-500/10 text-teal-400 border-teal-500/30",    icon: "📡" },
  PRESENTER:       { color: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30", icon: "🎙️" },
};

// ── basePath display helper ──────────────────────────────────────────────────
// DB stores deployment-neutral paths: /uploads/avatars/file.png
// Plain <img src> needs the /stream prefix in this environment.
// External http(s) URLs are used as-is.
function toDisplayUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("")) return url;
  return `/stream${url}`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function MyProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; pwError?: string; djError?: string; djSaved?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const t = await getTranslations("profile");
  const tRoles = await getTranslations("roles");
  const locale = await getLocale();
  const dir = isRtl(locale) ? "rtl" : "ltr";

  const userId = session.user.id;

  const user = await prisma.user.findUnique({
    where:   { id: userId },
    include: { profile: true },
  });

  if (!user) redirect("/login");

  const { saved, error, pwError, djError, djSaved } = await searchParams;

  // ── Error / success message maps ──────────────────────────────────────────
  function getProfileError(err?: string): string | null {
    const map: Record<string, string> = {
      email_format: t("emailFormatError"),
      email_taken:  t("emailTakenError"),
      avatar_url:   t("avatarUrlError"),
    };
    return err ? (map[err] ?? null) : null;
  }

  function getPwError(pw?: string): string | null {
    const map: Record<string, string> = {
      current_empty:  t("pwCurrentEmpty"),
      new_empty:      t("pwNewEmpty"),
      confirm_empty:  t("pwConfirmEmpty"),
      short:          t("pwShort"),
      mismatch:       t("pwMismatch"),
      wrong_current:  t("pwWrongCurrent"),
    };
    return pw ? (map[pw] ?? null) : null;
  }

  const profileError = getProfileError(error);
  const pwErrorMsg   = getPwError(pwError);

  // Role label from translations
  const roleLabel = (() => {
    try { return tRoles(user.role); } catch { return user.role; }
  })();
  const roleStyle = ROLE_STYLES[user.role] ?? { color: "bg-neutral-800 text-neutral-400 border-neutral-700", icon: "👤" };

  const avatarUrl        = user.profile?.avatarUrl ?? null;
  const displayAvatarUrl = toDisplayUrl(avatarUrl);

  // ── Fetch Direct DJ radios (DIRECT_DJ presenterMode only) ─────────────────
  let djRadios: DjRadio[] = [];
  if (user.role === "PRESENTER" && user.presenterMode === "DIRECT_DJ") {
    djRadios = await prisma.directDjRadio.findMany({
      where:   { presenterId: user.id },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      select:  { id: true, radioName: true, host: true, port: true, djUsername: true, mount: true, sid: true, bitrate: true, isActive: true },
    });
  }

  // ── Back link by role ──────────────────────────────────────────────────────
  const backHref =
    user.role === "ADMIN"           ? "/admin"           :
    user.role === "STATION_MANAGER" ? "/station-manager" :
    "/studio";

  // ── Initials fallback ──────────────────────────────────────────────────────
  const initials = (user.name ?? user.username).slice(0, 2).toUpperCase();

  return (
    <div dir={dir} className="min-h-screen bg-neutral-950 text-neutral-100 p-4 sm:p-8 font-sans">
      <div className="max-w-2xl mx-auto">

        {/* ── Header ── */}
        <div className="mb-8 flex items-center gap-4">
          <a
            href={backHref}
            className="p-2 bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors border border-neutral-800 flex-shrink-0"
            aria-label={t("backLabel")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
            </svg>
          </a>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-l from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
              {t("pageTitle")}
            </h1>
            <p className="text-xs text-neutral-500 mt-0.5">EGONAIR</p>
          </div>
          <span className={`mr-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border ${roleStyle.color}`}>
            <span>{roleStyle.icon}</span>
            {roleLabel}
          </span>
          <LanguageSwitcher compact />
        </div>

        {/* ── Hero avatar ── */}
        <div className="flex justify-center mb-6">
          {displayAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayAvatarUrl}
              alt={t("avatarAlt")}
              className="w-24 h-24 rounded-full object-cover border-4 border-neutral-800 shadow-xl"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500/40 to-cyan-500/30 border-4 border-neutral-800 flex items-center justify-center shadow-xl">
              <span className="text-2xl font-bold text-neutral-200 select-none">{initials}</span>
            </div>
          )}
        </div>

        {/* ── Profile saved banner ── */}
        {saved === "profile" && (
          <div className="flex items-center gap-2.5 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-5 py-3.5 text-emerald-400 text-sm mb-5">
            <span>✅</span>
            {t("profileSaved")}
          </div>
        )}

        {/* ── Profile error banner ── */}
        {profileError && (
          <div className="flex items-center gap-2.5 bg-red-500/10 border border-red-500/25 rounded-xl px-5 py-3.5 text-red-400 text-sm mb-5">
            <span>❌</span>
            {profileError}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            Card 1 — Avatar
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 md:p-8 shadow-xl mb-6">
          <div className="flex items-center gap-2 mb-5">
            <span className="text-lg">🖼️</span>
            <h2 className="text-lg font-semibold text-neutral-200">{t("avatarSection")}</h2>
          </div>
          <AvatarUpload currentAvatarUrl={avatarUrl} initials={initials} />
          <details className="mt-5">
            <summary className="text-xs text-neutral-600 cursor-pointer hover:text-neutral-400 transition-colors select-none">
              {t("avatarUrlLabel")}
            </summary>
            <form action={updateMyProfile} className="mt-3 space-y-3">
              <input type="hidden" name="name"  value={user.name  ?? ""} />
              <input type="hidden" name="email" value={user.email ?? ""} />
              <input type="hidden" name="phone" value={user.phone ?? ""} />
              <input
                id="profile-avatar-url"
                name="avatarUrl"
                type="url"
                defaultValue={avatarUrl ?? ""}
                placeholder="https://example.com/avatar.jpg"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-mono text-left text-xs"
                dir="ltr"
              />
              <button
                type="submit"
                className="w-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-sm font-medium rounded-xl px-4 py-2.5 transition-all"
              >
                {t("saveUrl")}
              </button>
            </form>
          </details>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            Card 1b — Direct DJ Radios (DIRECT_DJ only)
        ═══════════════════════════════════════════════════════════════════ */}
        {user.role === "PRESENTER" && user.presenterMode === "DIRECT_DJ" && (
          <DirectDjRadiosSection
            radios={djRadios}
            djError={djError}
            djSaved={djSaved}
          />
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            Card 2 — Account Info
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 md:p-8 shadow-xl mb-6">
          <div className="flex items-center gap-2 mb-5">
            <span className="text-lg">👤</span>
            <h2 className="text-lg font-semibold text-neutral-200">{t("accountInfo")}</h2>
          </div>

          <form action={updateMyProfile} className="space-y-5">
            {/* Preserve current avatarUrl so saving profile info doesn't wipe it */}
            <input type="hidden" name="avatarUrl" value={avatarUrl ?? ""} />

            {/* Read-only: username */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">{t("usernameReadonly")}</label>
              <div className="w-full bg-neutral-950/50 border border-neutral-800 rounded-xl px-4 py-3 text-neutral-500 font-mono text-sm text-left" dir="ltr">
                {user.username}
              </div>
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <label htmlFor="profile-name" className="text-sm font-medium text-neutral-300">{t("nameLabel")}</label>
              <input
                id="profile-name"
                name="name"
                type="text"
                defaultValue={user.name ?? ""}
                placeholder={t("namePlaceholder")}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
              />
            </div>

            {/* Email + Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="profile-email" className="text-sm font-medium text-neutral-300">{t("email")}</label>
                <input
                  id="profile-email"
                  name="email"
                  type="email"
                  defaultValue={user.email ?? ""}
                  placeholder="example@mail.com"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-mono text-left"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="profile-phone" className="text-sm font-medium text-neutral-300">{t("phone")}</label>
                <input
                  id="profile-phone"
                  name="phone"
                  type="tel"
                  defaultValue={user.phone ?? ""}
                  placeholder="+201001234567"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-mono text-left"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                id="profile-save-btn"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl px-4 py-3 transition-all shadow-lg shadow-indigo-500/20"
              >
                {t("saveProfile")}
              </button>
            </div>
          </form>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            Card 3 — Change Password
        ═══════════════════════════════════════════════════════════════════ */}
        <div
          id="change-password"
          className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 md:p-8 shadow-xl"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🔑</span>
            <h2 className="text-lg font-semibold text-neutral-200">{t("changePassword")}</h2>
          </div>
          <p className="text-xs text-neutral-500 mb-5">{t("passwordChangePrompt")}</p>

          {saved === "password" && (
            <div className="flex items-center gap-2.5 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-5 py-3.5 text-emerald-400 text-sm mb-5">
              <span>✅</span>
              {t("passwordChangedSuccess")}
            </div>
          )}
          {pwErrorMsg && (
            <div className="flex items-center gap-2.5 bg-red-500/10 border border-red-500/25 rounded-xl px-5 py-3.5 text-red-400 text-sm mb-5">
              <span>❌</span>
              {pwErrorMsg}
            </div>
          )}

          <form action={changeMyPassword} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="pw-current" className="text-sm font-medium text-neutral-300">
                {t("currentPassword")} <span className="text-red-500">*</span>
              </label>
              <input
                id="pw-current"
                name="currentPassword"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                dir="ltr"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="pw-new" className="text-sm font-medium text-neutral-300">
                  {t("newPassword")} <span className="text-red-500">*</span>
                </label>
                <input
                  id="pw-new"
                  name="newPassword"
                  type="password"
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="pw-confirm" className="text-sm font-medium text-neutral-300">
                  {t("confirmPassword")} <span className="text-red-500">*</span>
                </label>
                <input
                  id="pw-confirm"
                  name="confirmPassword"
                  type="password"
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                  dir="ltr"
                />
              </div>
            </div>
            <p className="text-xs text-neutral-600">{t("passwordMinLength")}</p>
            <div className="pt-2">
              <button
                type="submit"
                id="pw-change-btn"
                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-xl px-4 py-3 transition-all shadow-lg shadow-amber-500/10"
              >
                {t("changePasswordBtn")}
              </button>
            </div>
          </form>
        </div>

      </div>
    </div>
  );
}
