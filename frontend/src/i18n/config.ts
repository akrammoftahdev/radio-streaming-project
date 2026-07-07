export const SUPPORTED_LOCALES = ['ar', 'en', 'fr', 'tr', 'pt', 'es', 'de', 'it'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ar';

export const RTL_LOCALES: readonly Locale[] = ['ar'];

export const LOCALE_NAMES: Record<Locale, string> = {
  ar: 'العربية',
  en: 'English',
  fr: 'Français',
  tr: 'Türkçe',
  pt: 'Português',
  es: 'Español',
  de: 'Deutsch',
  it: 'Italiano',
};

export const LOCALE_FLAGS: Record<Locale, string> = {
  ar: '🇸🇦',
  en: '🇬🇧',
  fr: '🇫🇷',
  tr: '🇹🇷',
  pt: '🇧🇷',
  es: '🇪🇸',
  de: '🇩🇪',
  it: '🇮🇹',
};

export function isRtl(locale: string): boolean {
  return RTL_LOCALES.includes(locale as Locale);
}

/** Date locale map: maps our locale codes to Intl-compatible locale strings */
export const DATE_LOCALES: Record<Locale, string> = {
  ar: 'ar-EG',
  en: 'en-US',
  fr: 'fr-FR',
  tr: 'tr-TR',
  pt: 'pt-BR',
  es: 'es-ES',
  de: 'de-DE',
  it: 'it-IT',
};
