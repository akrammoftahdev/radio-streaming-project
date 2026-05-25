import { auth }              from "@/auth";
import { redirect }          from "next/navigation";
import { Unauthorized }      from "@/components/ui/Unauthorized";
import { AdminPageShell }    from "@/components/ui/AdminPageShell";
import { getSystemSettings } from "@/lib/system-settings";
import { saveSystemSettings, saveThemeSettings, uploadSystemAsset } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "إعدادات النظام — EGONAIR" };

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
function FieldRow({ label, value }: { label: string; value: string | null | undefined }) {
  const display = value?.trim() || null;
  return (
    <div className="flex items-start gap-4 py-2.5 border-b border-slate-700/30 last:border-0">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide w-44 flex-shrink-0 pt-0.5">
        {label}
      </span>
      <span className={`text-sm ${display ? "text-slate-200" : "text-slate-600 italic"}`}>
        {display ?? "غير محدد"}
      </span>
    </div>
  );
}

// Colour swatch row (theme section)
function ColorRow({ label, value }: { label: string; value: string | null | undefined }) {
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
        <span className="text-sm text-slate-600 italic">افتراضي (من globals.css)</span>
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
        dir={type === "email" || name.includes("Url") || name.includes("url") ? "ltr" : "rtl"}
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
  label, name, value, hint,
}: {
  label: string; name: string; value: string | null | undefined; hint?: string;
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
          رفع
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

  return (
    <AdminPageShell
      title="إعدادات النظام"
      description="هوية النظام، بيانات الدعم، وروابط الشعار"
      backHref="/admin"
      backLabel="← لوحة الإدارة"
    >
      <div className="space-y-6">

        {/* Branding success banner — near top, associated with the branding form */}
        {justSaved && (
          <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 text-sm text-emerald-400">
            <span className="text-base flex-shrink-0">✅</span>
            <span>تم حفظ إعدادات الهوية والدعم بنجاح.</span>
          </div>
        )}

        {/* ── EDIT FORM ─────────────────────────────────────────────────── */}
        <form action={saveSystemSettings} className="space-y-5">

          {/* A: Branding */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-700/40">
              <span className="text-lg">🏷️</span>
              <h2 className="text-sm font-semibold text-slate-200">هوية النظام</h2>
            </div>
            <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="اسم النظام"
                name="systemName"
                value={s.systemName}
                placeholder="EGONAIR"
              />
              <Field
                label="الوصف الفرعي"
                name="systemSubtitle"
                value={s.systemSubtitle}
                placeholder="ستوديو البث الإذاعي عن بعد"
              />
            </div>
          </div>

          {/* B: Support contacts */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-700/40">
              <span className="text-lg">📞</span>
              <h2 className="text-sm font-semibold text-slate-200">بيانات الدعم</h2>
            </div>
            <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field
                label="رقم الهاتف"
                name="supportPhone"
                value={s.supportPhone}
                type="tel"
                placeholder="+201xxxxxxxxx"
              />
              <Field
                label="واتساب"
                name="supportWhatsapp"
                value={s.supportWhatsapp}
                type="tel"
                placeholder="+201xxxxxxxxx"
              />
              <Field
                label="البريد الإلكتروني"
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
              <h2 className="text-sm font-semibold text-slate-200">الشعارات والأصول البصرية</h2>
              <span className="mr-auto text-xs text-slate-600">يمكنك وضع رابط مباشر أو رفع ملف ليتم حفظه على الخادم</span>
            </div>
            
            {justSavedAsset && (
              <div className="mx-5 mt-4 flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 text-sm text-emerald-400">
                <span className="text-base flex-shrink-0">✅</span>
                <span>تم رفع الأصل البصري بنجاح.</span>
              </div>
            )}

            <div className="px-5 py-4 space-y-5">
              {/* System logos */}
              <div>
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-3">شعار النظام</p>
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <AssetUploadField
                    label="الوضع الداكن"
                    name="logoDarkUrl"
                    value={s.logoDarkUrl}
                    hint="الرئيسي للخلفية الداكنة"
                  />
                  <AssetUploadField
                    label="الوضع الفاتح"
                    name="logoLightUrl"
                    value={s.logoLightUrl}
                    hint="الرئيسي للخلفية الفاتحة"
                  />
                  <AssetUploadField
                    label="عام (احتياطي)"
                    name="logoUrl"
                    value={s.logoUrl}
                    hint="بديل إذا لم يُحدد الوضع"
                  />
                </div>
              </div>
              {/* Login page logos */}
              <div>
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-3">شعار صفحة الدخول</p>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <AssetUploadField
                    label="شعار الدخول — داكن"
                    name="loginLogoDarkUrl"
                    value={s.loginLogoDarkUrl}
                    hint="لصفحة تسجيل الدخول (داكن)"
                  />
                  <AssetUploadField
                    label="شعار الدخول — فاتح"
                    name="loginLogoLightUrl"
                    value={s.loginLogoLightUrl}
                    hint="لصفحة تسجيل الدخول (فاتح)"
                  />
                </div>
              </div>
              {/* App assets */}
              <div>
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-3">أصول التطبيق</p>
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <AssetUploadField
                    label="Favicon"
                    name="faviconUrl"
                    value={s.faviconUrl}
                    hint="أيقونة المتصفح"
                  />
                  <AssetUploadField
                    label="أيقونة PWA"
                    name="mobileAppIconUrl"
                    value={s.mobileAppIconUrl}
                    hint="للتطبيق المحمول 512x512"
                  />
                  <AssetUploadField
                    label="Splash Screen"
                    name="splashScreenUrl"
                    value={s.splashScreenUrl}
                    hint="صورة شاشة الفتح"
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
              حفظ الإعدادات
            </button>
          </div>

        </form>

        {/* ── THEME EDITOR FORM ─────────────────────────────────────────── */}
        <form action={saveThemeSettings} className="space-y-0">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-700/40">
              <span className="text-lg">🎨</span>
              <h2 className="text-sm font-semibold text-slate-200">التصميم والألوان</h2>
              <span className="mr-auto text-xs text-slate-500">null = استخدام الافتراضي من globals.css</span>
            </div>
            {/* Theme save success banner — inside the section */}
            {justSavedTheme && (
              <div
                className="flex items-center gap-3 mx-5 mt-4 rounded-xl px-4 py-3 text-sm border"
                style={{ background: "color-mix(in srgb, var(--eg-accent) 10%, transparent)", borderColor: "color-mix(in srgb, var(--eg-accent) 30%, transparent)", color: "var(--eg-accent)" }}
              >
                <span className="text-base flex-shrink-0">🎨</span>
                <span>تم حفظ إعدادات الألوان بنجاح — ستظهر التغييرات عند إعادة تحميل أي صفحة.</span>
              </div>
            )}
            <div className="px-5 py-4 space-y-5">

              {/* Default theme mode */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  الوضع الافتراضي
                </label>
                <select
                  name="defaultTheme"
                  defaultValue={s.defaultTheme}
                  className="px-4 py-2.5 rounded-xl text-sm bg-slate-900 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-[var(--eg-primary)]/30 transition-colors"
                  style={{ color: "var(--eg-text)", borderColor: "var(--eg-border)" }}
                >
                  <option value="dark">🌙 داكن (dark)</option>
                  <option value="light">☀️ فاتح (light)</option>
                </select>
              </div>

              {/* Dark theme colors */}
              <div>
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-3">الوضع الداكن</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {([
                    { name: "darkPrimary",    label: "اللون الأساسي",  placeholder: "#6366f1" },
                    { name: "darkAccent",     label: "اللون المميز",    placeholder: "#0891b2" },
                    { name: "darkBackground", label: "خلفية الصفحة",   placeholder: "#0f172a" },
                    { name: "darkSurface",    label: "خلفية البطاقات", placeholder: "#1e293b" },
                    { name: "darkText",       label: "لون النص",       placeholder: "#f1f5f9" },
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
                            aria-label={`لون ${label}`}
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
                        <p className="text-[10px] text-slate-600">اختر لوناً من المشغّل لحفظه — أو اتركه على الافتراضي</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Light theme colors */}
              <div>
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-3">الوضع الفاتح</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {([
                    { name: "lightPrimary",    label: "اللون الأساسي",  placeholder: "#4f46e5" },
                    { name: "lightAccent",     label: "اللون المميز",    placeholder: "#0284c7" },
                    { name: "lightBackground", label: "خلفية الصفحة",   placeholder: "#f8fafc" },
                    { name: "lightSurface",    label: "خلفية البطاقات", placeholder: "#ffffff" },
                    { name: "lightText",       label: "لون النص",       placeholder: "#0f172a" },
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
                            aria-label={`لون ${label}`}
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
                        <p className="text-[10px] text-slate-600">اختر لوناً من المشغّل لحفظه — أو اتركه على الافتراضي</p>
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
                  حفظ الألوان
                </button>
              </div>

            </div>
          </div>
        </form>

        {/* ── READ-ONLY: Meta ───────────────────────────────────────────── */}
        <Section icon="🕐" title="آخر تحديث">
          <FieldRow
            label="آخر تعديل"
            value={s.updatedAt.getTime() === 0 ? null : s.updatedAt.toLocaleString("ar-EG")}
          />
          <FieldRow label="بواسطة" value={s.updatedBy} />
        </Section>

      </div>
    </AdminPageShell>
  );
}
