import type { Metadata } from "next";
import { Tajawal } from "next/font/google";
import "./globals.css";
import { DEFAULT_SYSTEM_SETTINGS, getSystemSettings, buildThemeStyle, normalizeBrandAssetUrl } from "@/lib/system-settings";
import { Providers } from "./providers";
import { RadioPlayer } from "@/components/radio-player";

// ── Font ──────────────────────────────────────────────────────────────────────
const tajawal = Tajawal({
  variable: "--font-tajawal",
  subsets: ["arabic"],
  weight: ["300", "400", "500", "700"],
});

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
    description: settings.systemSubtitle || "نظام إدارة البث الإذاعي",
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

  const themeStyle = buildThemeStyle(settings);

  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${tajawal.variable} h-full antialiased font-sans`}
      style={{ colorScheme: "dark" }}
    >
      <head>{themeStyle ? <style dangerouslySetInnerHTML={{ __html: themeStyle }} /> : null}</head>
      <body className="min-h-full flex flex-col bg-[#0f172a] text-slate-100">
        <Providers>
          {children}
          <RadioPlayer />
        </Providers>
      </body>
    </html>
  );
}
