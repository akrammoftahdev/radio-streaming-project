import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type Locale } from './config';
import { getDefaultLanguage } from '@/lib/system-settings';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;

  let fallback: Locale = DEFAULT_LOCALE;
  try {
    const dbDefault = await getDefaultLanguage();
    if (SUPPORTED_LOCALES.includes(dbDefault as Locale)) {
      fallback = dbDefault as Locale;
    }
  } catch {
    // DB unavailable — use hardcoded default
  }

  const locale: Locale = SUPPORTED_LOCALES.includes(cookieLocale as Locale)
    ? (cookieLocale as Locale)
    : fallback;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
