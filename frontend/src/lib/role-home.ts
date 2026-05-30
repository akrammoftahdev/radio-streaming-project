/**
 * role-home.ts
 * Single source of truth for role → home route.
 * Used by login redirect, unauthorized back-button, and any future middleware.
 *
 * NOTE: Next.js automatically prepends `basePath` (/stream) to these paths
 * when they are used with `redirect()` from next/navigation or router.replace().
 * Do NOT hardcode /stream here — keep paths relative to the app root.
 */

export type AppRole = "ADMIN" | "STATION_MANAGER" | "PRESENTER" | string;

export function roleHomePath(role: AppRole): string {
  switch (role) {
    case "ADMIN":           return "/admin";
    case "STATION_MANAGER": return "/station-manager";
    default:                return "/studio"; // PRESENTER + fallback
  }
}

/**
 * Returns a translated label for a role.
 * Accepts a translation function `t` scoped to the 'roles' namespace.
 * Usage: roleLabel(role, t) where t = useTranslations('roles') or await getTranslations('roles')
 */
export function roleLabel(role: AppRole, t?: (key: string) => string): string {
  if (t) {
    switch (role) {
      case "ADMIN":           return t("ADMIN");
      case "STATION_MANAGER": return t("STATION_MANAGER");
      case "PRESENTER":       return t("PRESENTER");
      default:                return role ?? t("PRESENTER");
    }
  }
  // Fallback without translation function (e.g. server actions without i18n context)
  switch (role) {
    case "ADMIN":           return "Admin";
    case "STATION_MANAGER": return "Station Manager";
    case "PRESENTER":       return "Presenter";
    default:                return role ?? "User";
  }
}
