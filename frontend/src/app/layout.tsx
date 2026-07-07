import type { Metadata } from "next";
import "./globals.css";
import { DEFAULT_SYSTEM_SETTINGS, getSystemSettings, buildThemeStyle, normalizeBrandAssetUrl } from "@/lib/system-settings";
import { Providers } from "./providers";
import { RadioPlayer } from "@/components/radio-player";
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { isRtl } from '@/i18n/config';
import { tajawal, inter } from '@/i18n/fonts';

// ── Root metadata ─────────────────────────────────────────────────────────────
export async function generateMetadata(): Promise<Metadata> {
  let settings = DEFAULT_SYSTEM_SETTINGS;
  try {
    settings = await getSystemSettings();
  } catch (e) {
    console.error("Failed to load settings:", e);
  }

  const metadata: Metadata = {
    title: `${settings.systemName || "EGONAIR"} Remote Studio`,
    description: settings.systemSubtitle || "Radio Broadcasting Management System",
  };

  if (settings.faviconUrl) {
    const iconUrl = normalizeBrandAssetUrl(settings.faviconUrl);
    if (iconUrl) {
      metadata.icons = {
        icon: iconUrl,
      };
    }
  }

  return metadata;
}

// ── Root layout ───────────────────────────────────────────────────────────────
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let settings = DEFAULT_SYSTEM_SETTINGS;
  try {
    settings = await getSystemSettings();
  } catch (e) {
    console.error("Failed to load settings:", e);
  }

  const locale = await getLocale();
  const messages = await getMessages();
  const rtl = isRtl(locale);
  // Apply both font classes so both CSS variables are always available
  const themeStyle = buildThemeStyle(settings);

  return (
    <html lang={locale} dir={rtl ? 'rtl' : 'ltr'} className={`${tajawal.variable} ${inter.variable} h-full antialiased font-sans`} style={{ colorScheme: "dark" }}>
      <head>{themeStyle ? <style dangerouslySetInnerHTML={{ __html: themeStyle }} /> : null}</head>
      <body className="min-h-full flex flex-col bg-[#0f172a] text-slate-100">
        <NextIntlClientProvider messages={messages}>
          <Providers>
            {children}
            <RadioPlayer />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
