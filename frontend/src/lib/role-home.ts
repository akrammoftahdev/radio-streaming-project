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

export function roleLabel(role: AppRole): string {
  switch (role) {
    case "ADMIN":           return "مدير النظام";
    case "STATION_MANAGER": return "مدير محطة";
    case "PRESENTER":       return "مذيع";
    default:                return role ?? "مستخدم";
  }
}
