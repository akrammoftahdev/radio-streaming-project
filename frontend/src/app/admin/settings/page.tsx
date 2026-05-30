import { auth }              from "@/auth";
import { redirect }          from "next/navigation";
import { Unauthorized }      from "@/components/ui/Unauthorized";
import { AdminPageShell }    from "@/components/ui/AdminPageShell";
import { getSystemSettings } from "@/lib/system-settings";
import { saveSystemSettings, saveThemeSettings, uploadSystemAsset } from "./actions";
import { getTranslations, getLocale } from "next-intl/server";
import { DATE_LOCALES, SUPPORTED_LOCALES, LOCALE_NAMES, LOCALE_FLAGS, type Locale } from "@/i18n/config";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const settings = await getSystemSettings();
  const t = await getTranslations('admin.settings');
  return { title: t('metaTitle', { name: settings.systemName || "EGONAIR" }) };
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function Section({ icon, title, children }: {
  icon: string; title: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-700/40">
        <span className="text-lg">{icon}</span>
        <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
      </div>
      <div className="px-5 py-4 space-y-4">{children}</div>
    </div>
  );
}

// Read-only display row (used for theme / meta sections)
function FieldRow({ label, value, notSetLabel }: { label: string; value: string | null | undefined; notSetLabel: string }) {
  const display = value?.trim() || null;
  return (
    <div className="flex items-start gap-4 py-2.5 border-b border-slate-700/30 last:border-0">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide w-44 flex-shrink-0 pt-0.5">
        {label}
      </span>
      <span className={`text-sm ${display ? "text-slate-200" : "text-slate-600 italic"}`}>
        {display ?? notSetLabel}
      </span>
    </div>
  );
}

// Colour swatch row (theme section)
function ColorRow({ label, value, defaultLabel }: { label: string; value: string | null | undefined; defaultLabel: string }) {
  const hex = value?.trim() || null;
  return (
    <div className="flex items-center gap-4 py-2.5 border-b border-slate-700/30 last:border-0">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide w-44 flex-shrink-0">
        {label}
      </span>
      {hex ? (
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded border border-slate-600 flex-shrink-0" style={{ background: hex }} />
          <span className="text-sm text-slate-200 font-mono">{hex}</span>
        </div>
      ) : (
        <span className="text-sm text-slate-600 italic">{defaultLabel}</span>
      )}
    </div>
  );
}

// Editable text input field
function Field({
  label, name, value, type = "text", placeholder = "", hint,
}: {
  label: string; name: string; value: string | null | undefined;
  type?: string; placeholder?: string; hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={`field-${name}`} className="block text-xs font-semibold text-slate-400 uppercase tracking-wide">
        {label}
      </label>
      <input
        id={`field-${name}`}
        name={name}
        type={type}
        defaultValue={value ?? ""}
        placeholder={placeholder}
        dir={type === "email" || name.includes("Url") || name.includes("url") ? "ltr" : undefined}
        className={[
          "w-full px-4 py-2.5 rounded-xl text-sm text-slate-100 placeholder-slate-600",
          "bg-slate-900 border border-slate-700",
          "focus:outline-none focus:ring-1 focus:ring-[var(--eg-primary)]/30",
          "transition-colors",
        ].join(" ")}
      />
      {hint && <p className="text-xs text-slate-600">{hint}</p>}
    </div>
  );
}

// Editable URL field + File upload form action
function AssetUploadField({
  label, name, value, hint, uploadLabel,
}: {
  label: string; name: string; value: string | null | undefined; hint?: string; uploadLabel: string;
}) {
  return (
    <div className="space-y-2 border border-slate-700/50 rounded-xl p-3 bg-slate-800/30">
      <div className="flex items-center justify-between">
        <label htmlFor={`field-${name}`} className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide">
          {label}
        </label>
        {hint && <span className="text-[10px] text-slate-500 max-w-[50%] text-left truncate" title={hint}>{hint}</span>}
      </div>
      
      <input
        id={`field-${name}`}
        name={name}
        type="text"
        defaultValue={value ?? ""}
        placeholder="https://... أو /uploads/..."
        dir="ltr"
        className="w-full px-3 py-2 rounded-lg text-xs text-slate-100 placeholder-slate-600 bg-slate-900 border border-slate-700 focus:outline-none focus:border-[var(--eg-primary)]"
      />

      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-700/50">
        <input 
          type="file" 
          name={`file_${name}`}
          accept="image/png, image/jpeg, image/webp, image/svg+xml, image/x-icon" 
          className="text-[10px] text-slate-400 file:mr-0 file:ml-3 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[10px] file:font-semibold file:bg-slate-700 file:text-slate-200 hover:file:bg-slate-600 w-full cursor-pointer"
        />
        <button 
          type="submit" 
          formAction={uploadSystemAsset.bind(null, name)}
          className="px-3 py-1 text-[11px] font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-md transition-colors whitespace-nowrap"
        >
          {uploadLabel}
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string; themeUpdated?: string; assetUpdated?: string }>;
}) {
  // Auth guard
  const session = await auth();
  if (!session?.user) redirect("/login");
  if ((session.user as any).role !== "ADMIN") return <Unauthorized role={(session.user as any).role} />;

  const sp = await searchParams;
  const justSaved = sp.updated === "1";
  const justSavedTheme = sp.themeUpdated === "1";
  const justSavedAsset = sp.assetUpdated === "1";

  // Load current settings — never throws
  const s = await getSystemSettings();

  const t = await getTranslations('admin.settings');
  const tNav = await getTranslations('nav');
  const locale = await getLocale();
  const dateLocale = DATE_LOCALES[locale as Locale] || locale;

  return (
    <AdminPageShell
      title={t('title')}
      description={t('description')}
      backHref="/admin"
      backLabel={tNav('backToAdmin')}
    >
      <div className="space-y-6">

        {/* Branding success banner — near top, associated with the branding form */}
        {justSaved && (
          <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 text-sm text-emerald-400">
            <span className="text-base flex-shrink-0">✅</span>
            <span>{t('brandingSaved')}</span>
          </div>
        )}

        {/* ── EDIT FORM ─────────────────────────────────────────────────── */}
        <form action={saveSystemSettings} className="space-y-5">

          {/* A: Branding */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-700/40">
              <span className="text-lg">🏷️</span>
              <h2 className="text-sm font-semibold text-slate-200">{t('systemIdentity')}</h2>
            </div>
            <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label={t('systemName')}
                name="systemName"
                value={s.systemName}
                placeholder="EGONAIR"
              />
              <Field
                label={t('systemSubtitleField')}
                name="systemSubtitle"
                value={s.systemSubtitle}
                placeholder="ستوديو البث الإذاعي عن بعد"
              />
            </div>
          </div>

          {/* A2: Default Language */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-700/40">
              <span className="text-lg">🌐</span>
              <h2 className="text-sm font-semibold text-slate-200">{t('defaultLanguage')}</h2>
              <span className="mr-auto text-xs text-slate-500">{t('defaultLanguageHint')}</span>
            </div>
            <div className="px-5 py-4">
              <select
                name="defaultLanguage"
                defaultValue={(s as any).defaultLanguage ?? "ar"}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm bg-slate-900 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-[var(--eg-primary)]/30 transition-colors"
                style={{ color: "var(--eg-text)", borderColor: "var(--eg-border)" }}
              >
                {SUPPORTED_LOCALES.map((loc) => (
                  <option key={loc} value={loc}>
                    {LOCALE_FLAGS[loc]} {LOCALE_NAMES[loc]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* B: Support contacts */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-700/40">
              <span className="text-lg">📞</span>
              <h2 className="text-sm font-semibold text-slate-200">{t('supportContacts')}</h2>
            </div>
            <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field
                label={t('supportPhoneField')}
                name="supportPhone"
                value={s.supportPhone}
                type="tel"
                placeholder="+201xxxxxxxxx"
              />
              <Field
                label={t('supportWhatsappField')}
                name="supportWhatsapp"
                value={s.supportWhatsapp}
                type="tel"
                placeholder="+201xxxxxxxxx"
              />
              <Field
                label={t('supportEmailField')}
                name="supportEmail"
                value={s.supportEmail}
                type="email"
                placeholder="support@egonair.com"
              />
            </div>
          </div>

          {/* C: Logo / Favicon URLs */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-700/40">
              <span className="text-lg">🖼️</span>
              <h2 className="text-sm font-semibold text-slate-200">{t('logos')}</h2>
              <span className="mr-auto text-xs text-slate-600">{t('logosHint')}</span>
            </div>
            
            {justSavedAsset && (
              <div className="mx-5 mt-4 flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 text-sm text-emerald-400">
                <span className="text-base flex-shrink-0">✅</span>
                <span>{t('assetSaved')}</span>
              </div>
            )}

            <div className="px-5 py-4 space-y-5">
              {/* System logos */}
              <div>
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-3">{t('systemLogo')}</p>
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <AssetUploadField
                    label={t('darkTheme')}
                    name="logoDarkUrl"
                    value={s.logoDarkUrl}
                    hint={t('darkModeHint')}
                    uploadLabel={t('uploadBtn')}
                  />
                  <AssetUploadField
                    label={t('lightTheme')}
                    name="logoLightUrl"
                    value={s.logoLightUrl}
                    hint={t('lightModeHint')}
                    uploadLabel={t('uploadBtn')}
                  />
                  <AssetUploadField
                    label={t('logoFallback')}
                    name="logoUrl"
                    value={s.logoUrl}
                    hint={t('fallbackHint')}
                    uploadLabel={t('uploadBtn')}
                  />
                </div>
              </div>
              {/* Login page logos */}
              <div>
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-3">{t('loginPageLogo')}</p>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <AssetUploadField
                    label={t('loginLogoDarkField')}
                    name="loginLogoDarkUrl"
                    value={s.loginLogoDarkUrl}
                    hint={t('loginDarkHint')}
                    uploadLabel={t('uploadBtn')}
                  />
                  <AssetUploadField
                    label={t('loginLogoLightField')}
                    name="loginLogoLightUrl"
                    value={s.loginLogoLightUrl}
                    hint={t('loginLightHint')}
                    uploadLabel={t('uploadBtn')}
                  />
                </div>
              </div>
              {/* App assets */}
              <div>
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-3">{t('appAssets')}</p>
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <AssetUploadField
                    label="Favicon"
                    name="faviconUrl"
                    value={s.faviconUrl}
                    hint={t('faviconHint')}
                    uploadLabel={t('uploadBtn')}
                  />
                  <AssetUploadField
                    label={t('mobileIcon')}
                    name="mobileAppIconUrl"
                    value={s.mobileAppIconUrl}
                    hint={t('pwaIconHint')}
                    uploadLabel={t('uploadBtn')}
                  />
                  <AssetUploadField
                    label={t('splashScreen')}
                    name="splashScreenUrl"
                    value={s.splashScreenUrl}
                    hint={t('splashHint')}
                    uploadLabel={t('uploadBtn')}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              id="settings-save-btn"
              type="submit"
              className={[
                "inline-flex items-center gap-2 px-7 py-2.5 rounded-xl",
                "text-sm font-semibold text-white tracking-wide",
                "transition-all duration-150 active:scale-[0.98]",
              ].join(" ")}
              style={{
                background: "linear-gradient(to right, var(--eg-primary), var(--eg-accent))",
                boxShadow: "0 4px 14px color-mix(in srgb, var(--eg-primary) 25%, transparent)",
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
              </svg>
              {t('saveSettings')}
            </button>
          </div>

        </form>

        {/* ── THEME EDITOR FORM ─────────────────────────────────────────── */}
        <form action={saveThemeSettings} className="space-y-0">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-700/40">
              <span className="text-lg">🎨</span>
              <h2 className="text-sm font-semibold text-slate-200">{t('themeDesign')}</h2>
              <span className="mr-auto text-xs text-slate-500">{t('themeNullHint')}</span>
            </div>
            {/* Theme save success banner — inside the section */}
            {justSavedTheme && (
              <div
                className="flex items-center gap-3 mx-5 mt-4 rounded-xl px-4 py-3 text-sm border"
                style={{ background: "color-mix(in srgb, var(--eg-accent) 10%, transparent)", borderColor: "color-mix(in srgb, var(--eg-accent) 30%, transparent)", color: "var(--eg-accent)" }}
              >
                <span className="text-base flex-shrink-0">🎨</span>
                <span>{t('themeSaved')}</span>
              </div>
            )}
            <div className="px-5 py-4 space-y-5">

              {/* Default theme mode */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  {t('defaultTheme')}
                </label>
                <select
                  name="defaultTheme"
                  defaultValue={s.defaultTheme}
                  className="px-4 py-2.5 rounded-xl text-sm bg-slate-900 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-[var(--eg-primary)]/30 transition-colors"
                  style={{ color: "var(--eg-text)", borderColor: "var(--eg-border)" }}
                >
                  <option value="dark">{t('themeDark')}</option>
                  <option value="light">{t('themeLight')}</option>
                </select>
              </div>

              {/* Dark theme colors */}
              <div>
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-3">{t('darkTheme')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {([
                    { name: "darkPrimary",    label: t('primaryColor'),     placeholder: "#6366f1" },
                    { name: "darkAccent",     label: t('accentColor'),      placeholder: "#0891b2" },
                    { name: "darkBackground", label: t('pageBackground'),   placeholder: "#0f172a" },
                    { name: "darkSurface",    label: t('cardBackground'),   placeholder: "#1e293b" },
                    { name: "darkText",       label: t('textColor'),        placeholder: "#f1f5f9" },
                  ] as const).map(({ name, label, placeholder }) => {
                    const current = (s as any)[name] as string | null;
                    return (
                      <div key={name} className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</label>
                        <div className="flex gap-2 items-center">
                          {/* Color picker IS the form field — name= here so its value submits */}
                          <input
                            type="color"
                            name={name}
                            aria-label={t('colorLabel', { label })}
                            defaultValue={current ?? placeholder}
                            className="w-10 h-10 rounded-lg border border-slate-700 bg-slate-900 cursor-pointer flex-shrink-0 p-0.5"
                            style={{ colorScheme: "dark" }}
                          />
                          {/* Text display — read-only, no name, shows saved value */}
                          <input
                            type="text"
                            readOnly
                            value={current ?? ""}
                            placeholder={placeholder}
                            dir="ltr"
                            tabIndex={-1}
                            className="flex-1 px-3 py-2 rounded-xl text-sm text-slate-500 placeholder-slate-600 bg-slate-900/50 border border-slate-700/50 font-mono cursor-default select-none"
                          />
                        </div>
                        <p className="text-[10px] text-slate-600">{t('colorPickerHint')}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Light theme colors */}
              <div>
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-3">{t('lightTheme')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {([
                    { name: "lightPrimary",    label: t('primaryColor'),     placeholder: "#4f46e5" },
                    { name: "lightAccent",     label: t('accentColor'),      placeholder: "#0284c7" },
                    { name: "lightBackground", label: t('pageBackground'),   placeholder: "#f8fafc" },
                    { name: "lightSurface",    label: t('cardBackground'),   placeholder: "#ffffff" },
                    { name: "lightText",       label: t('textColor'),        placeholder: "#0f172a" },
                  ] as const).map(({ name, label, placeholder }) => {
                    const current = (s as any)[name] as string | null;
                    return (
                      <div key={name} className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</label>
                        <div className="flex gap-2 items-center">
                          {/* Color picker IS the form field — name= here so its value submits */}
                          <input
                            type="color"
                            name={name}
                            aria-label={t('colorLabel', { label })}
                            defaultValue={current ?? placeholder}
                            className="w-10 h-10 rounded-lg border border-slate-700 bg-slate-900 cursor-pointer flex-shrink-0 p-0.5"
                            style={{ colorScheme: "dark" }}
                          />
                          {/* Text display — read-only, no name, shows saved value */}
                          <input
                            type="text"
                            readOnly
                            value={current ?? ""}
                            placeholder={placeholder}
                            dir="ltr"
                            tabIndex={-1}
                            className="flex-1 px-3 py-2 rounded-xl text-sm text-slate-500 placeholder-slate-600 bg-slate-900/50 border border-slate-700/50 font-mono cursor-default select-none"
                          />
                        </div>
                        <p className="text-[10px] text-slate-600">{t('colorPickerHint')}</p>
                      </div>

                    );
                  })}
                </div>
              </div>

              {/* Theme save button */}
              <div className="flex justify-end pt-1">
                <button
                  id="theme-save-btn"
                  type="submit"
                  className={[
                    "inline-flex items-center gap-2 px-7 py-2.5 rounded-xl",
                    "text-sm font-semibold text-white tracking-wide",
                    "transition-all duration-150 active:scale-[0.98]",
                  ].join(" ")}
                  style={{
                    background: "linear-gradient(to right, var(--eg-accent), var(--eg-primary))",
                    boxShadow: "0 4px 14px color-mix(in srgb, var(--eg-accent) 25%, transparent)",
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                  </svg>
                  {t('saveTheme')}
                </button>
              </div>

            </div>
          </div>
        </form>

        {/* ── READ-ONLY: Meta ───────────────────────────────────────────── */}
        <Section icon="🕐" title={t('lastUpdate')}>
          <FieldRow
            label={t('lastModified')}
            value={s.updatedAt.getTime() === 0 ? null : s.updatedAt.toLocaleString(dateLocale)}
            notSetLabel={t('notSet')}
          />
          <FieldRow label={t('updatedBy')} value={s.updatedBy} notSetLabel={t('notSet')} />
        </Section>

      </div>
    </AdminPageShell>
  );
}
