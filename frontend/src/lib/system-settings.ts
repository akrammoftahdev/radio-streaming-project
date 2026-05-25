/**
 * system-settings.ts
 * Safe server-side helper for reading the SystemSettings singleton row.
 *
 * Rules:
 * - NEVER throws — always returns a safe fallback object.
 * - Fallback values match current hardcoded app defaults (zero visible change).
 * - Call getSystemSettings() in server components / generateMetadata / actions.
 * - Do NOT call from client components (uses Prisma directly).
 * - Do NOT cache long-term — each page call gets a fresh read.
 *   Add Next.js `cache()` wrapping only if performance requires it later.
 */

import { db } from "@/lib/prisma";

// ── Fallback / defaults ───────────────────────────────────────────────────────
// Values match current hardcoded strings across the app.
// If the DB row is missing or the read fails, these values are used — the app
// looks identical to before SystemSettings was added.

export const DEFAULT_SYSTEM_SETTINGS = {
  id:              "global",
  systemName:      "EGONAIR",
  systemSubtitle:  "ستوديو البث الإذاعي عن بعد",
  logoUrl:         null as string | null,  // legacy / generic fallback
  logoDarkUrl:     null as string | null,  // dark mode logo (preferred over logoUrl)
  logoLightUrl:    null as string | null,  // light mode logo (preferred over logoUrl)
  loginLogoDarkUrl:  null as string | null, // login page dark logo
  loginLogoLightUrl: null as string | null, // login page light logo
  mobileAppIconUrl:  null as string | null, // PWA / mobile app icon
  splashScreenUrl:   null as string | null, // splash screen image
  faviconUrl:      null as string | null,
  supportPhone:    null as string | null,
  supportWhatsapp: null as string | null,
  supportEmail:    null as string | null,
  defaultTheme:    "dark",
  // Dark theme overrides — null means use globals.css CSS variables
  darkPrimary:     null as string | null,
  darkAccent:      null as string | null,
  darkBackground:  null as string | null,
  darkSurface:     null as string | null,
  darkText:        null as string | null,
  // Light theme overrides — null means light theme not yet customised
  lightPrimary:    null as string | null,
  lightAccent:     null as string | null,
  lightBackground: null as string | null,
  lightSurface:    null as string | null,
  lightText:       null as string | null,
  updatedBy:       null as string | null,
  createdAt:       new Date(0),
  updatedAt:       new Date(0),
} as const;

export type SystemSettingsData = typeof DEFAULT_SYSTEM_SETTINGS;

// ── Main helper ───────────────────────────────────────────────────────────────

/**
 * Read the SystemSettings singleton from DB.
 * Always returns a valid object — never throws.
 * If the row is missing, returns DEFAULT_SYSTEM_SETTINGS.
 * If the DB read fails (e.g. schema not migrated yet), returns fallback + logs.
 */
export async function getSystemSettings(): Promise<SystemSettingsData> {
  try {
    // ── Defensive guard ────────────────────────────────────────────────────
    // If the running Prisma client predates the SystemSettings migration
    // (e.g. dev server started before `prisma db push`), the property will
    // be undefined. Restart the dev server to fix permanently.
    if (!(db as any).systemSettings) {
      console.warn(
        "[SystemSettings] db.systemSettings is undefined — " +
        "Prisma Client may be stale. Run `prisma generate` and restart the dev server. " +
        "Using fallback defaults."
      );
      return DEFAULT_SYSTEM_SETTINGS;
    }

    const row = await db.systemSettings.findUnique({
      where: { id: "global" },
    });

    if (!row) {
      // Row doesn't exist yet — return safe defaults silently
      return DEFAULT_SYSTEM_SETTINGS;
    }

    // Merge DB row over defaults so any new fields added later
    // still have fallback values if the DB row predates them.
    return {
      ...DEFAULT_SYSTEM_SETTINGS,
      ...row,
    } as SystemSettingsData;

  } catch (err) {
    // DB read failed (e.g. table not yet created, connection issue)
    // Log for server diagnostics but never propagate to the page.
    console.error("[SystemSettings] Failed to read settings — using defaults:", err);
    return DEFAULT_SYSTEM_SETTINGS;
  }
}


// ── Convenience helpers ───────────────────────────────────────────────────────

/**
 * Normalises an asset URL to ensure it resolves correctly with the /stream basePath.
 */
export function normalizeBrandAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const t = url.trim();
  if (t.startsWith("http://") || t.startsWith("https://") || t.startsWith("data:")) return t;
  
  // If it's a relative path starting with /uploads/ but missing /stream/
  if (t.startsWith("/uploads/")) {
    // In production/dev with basePath, the browser needs the basePath to resolve the asset.
    // If process.env.SKIP_BASEPATH is true, we wouldn't need this, but the Next.js standard
    // is to prepend basePath for raw img src tags.
    // We hardcode /stream here since it's the known basePath of this app.
    return `/stream${t}`;
  }
  
  return t;
}

/**
 * Resolve the effective global system logo URL for a given theme mode.
 * Priority:
 *   dark  → logoDarkUrl  ?? logoUrl ?? null
 *   light → logoLightUrl ?? logoUrl ?? null
 */
export function resolveLogoUrl(
  settings: Pick<SystemSettingsData, "logoUrl" | "logoDarkUrl" | "logoLightUrl">,
  theme: "dark" | "light" = "dark",
): string | null {
  if (theme === "light") {
    return normalizeBrandAssetUrl(settings.logoLightUrl ?? settings.logoUrl ?? null);
  }
  return normalizeBrandAssetUrl(settings.logoDarkUrl ?? settings.logoUrl ?? null);
}

/**
 * Resolve the effective login page logo URL for a given theme mode.
 * Priority:
 *   dark  → loginLogoDarkUrl  ?? logoDarkUrl  ?? logoUrl ?? null
 *   light → loginLogoLightUrl ?? logoLightUrl ?? logoUrl ?? null
 */
export function resolveLoginLogoUrl(
  settings: Pick<SystemSettingsData, "logoUrl" | "logoDarkUrl" | "logoLightUrl" | "loginLogoDarkUrl" | "loginLogoLightUrl">,
  theme: "dark" | "light" = "dark",
): string | null {
  if (theme === "light") {
    return normalizeBrandAssetUrl(settings.loginLogoLightUrl ?? settings.logoLightUrl ?? settings.logoUrl ?? null);
  }
  return normalizeBrandAssetUrl(settings.loginLogoDarkUrl ?? settings.logoDarkUrl ?? settings.logoUrl ?? null);
}

/**
 * Resolve the effective mobile app icon URL.
 * Falls back to faviconUrl if mobileAppIconUrl is not set.
 */
export function resolveMobileIconUrl(
  settings: Pick<SystemSettingsData, "mobileAppIconUrl" | "faviconUrl">,
): string | null {
  return settings.mobileAppIconUrl ?? settings.faviconUrl ?? null;
}

/**
 * Get just the system name — the most frequently needed value.
 * Useful for metadata title construction.
 */
export async function getSystemName(): Promise<string> {
  const s = await getSystemSettings();
  return s.systemName || DEFAULT_SYSTEM_SETTINGS.systemName;
}

/**
 * Build a page title string: "Page Name — SystemName"
 * Usage: title: await buildPageTitle("المذيعون")
 */
export async function buildPageTitle(pageName: string): Promise<string> {
  const name = await getSystemName();
  return `${pageName} — ${name}`;
}

// ── Theme CSS injection ───────────────────────────────────────────────────────

/**
 * Build an inline CSS :root { } block from saved SystemSettings theme values.
 * Only non-null fields are emitted — null means "use globals.css default".
 * Safe to call in root layout; returns empty string on no overrides.
 *
 * Field → CSS variable mapping:
 *   dark mode (always applied — app is dark-first):
 *     darkBackground  → --eg-bg
 *     darkSurface     → --eg-surface
 *     darkText        → --eg-text
 *     darkPrimary     → --eg-primary
 *     darkAccent      → --eg-accent   (new token, safe addition)
 *   light mode (only when defaultTheme === "light"):
 *     lightBackground → --eg-bg
 *     lightSurface    → --eg-surface
 *     lightText       → --eg-text
 *     lightPrimary    → --eg-primary
 *     lightAccent     → --eg-accent
 */
export function buildThemeStyle(s: SystemSettingsData): string {
  const vars: string[] = [];

  // Validate: only emit valid 6-digit hex values (#rrggbb)
  const isHex = (v: string | null): v is string =>
    v !== null && /^#[0-9a-fA-F]{6}$/.test(v);

  // Dark theme overrides (applied unconditionally — app is dark-first)
  if (isHex(s.darkBackground)) vars.push(`  --eg-bg: ${s.darkBackground};`);
  if (isHex(s.darkSurface))    vars.push(`  --eg-surface: ${s.darkSurface};`);
  if (isHex(s.darkText))       vars.push(`  --eg-text: ${s.darkText};`);
  if (isHex(s.darkPrimary))    vars.push(`  --eg-primary: ${s.darkPrimary};`);
  if (isHex(s.darkAccent))     vars.push(`  --eg-accent: ${s.darkAccent};`);

  // Light theme overrides (only if admin selected light as default)
  if ((s.defaultTheme as string) === "light") {
    if (isHex(s.lightBackground)) vars.push(`  --eg-bg: ${s.lightBackground};`);
    if (isHex(s.lightSurface))    vars.push(`  --eg-surface: ${s.lightSurface};`);
    if (isHex(s.lightText))       vars.push(`  --eg-text: ${s.lightText};`);
    if (isHex(s.lightPrimary))    vars.push(`  --eg-primary: ${s.lightPrimary};`);
    if (isHex(s.lightAccent))     vars.push(`  --eg-accent: ${s.lightAccent};`);
  }

  if (vars.length === 0) return ""; // no overrides — globals.css handles everything
  return `:root {\n${vars.join("\n")}\n}`;
}

