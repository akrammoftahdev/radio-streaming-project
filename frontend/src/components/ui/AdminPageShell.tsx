"use client";

/**
 * AdminPageShell
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared presentational page wrapper for Admin pages.
 *
 * Encapsulates the repeated pattern found across all admin pages:
 *   <div dir="{rtl|ltr}" className="min-h-screen bg-[dark] text-[light] p-8">
 *     <div className="max-w-5xl mx-auto space-y-8">
 *       <header>...</header>
 *       {children}
 *     </div>
 *   </div>
 *
 * Rules:
 * - Presentational only. No data fetching, no router logic, no DB calls.
 * - Pages are NOT required to use this yet — it exists beside old system.
 * - Once adopted, pages remove their own page-shell boilerplate.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { useLocale } from 'next-intl';
import { isRtl } from '@/i18n/config';
import LanguageSwitcher from '@/components/ui/LanguageSwitcher';

export interface AdminPageShellProps {
  /** Main page content */
  children: ReactNode;

  /** Optional: primary page heading (h1) */
  title?: string;

  /** Optional: subtitle / description under the title */
  description?: string;

  /** Optional: action buttons/links rendered in the header, opposite to title */
  actions?: ReactNode;

  /** Optional: back navigation href (e.g. "/admin") */
  backHref?: string;

  /** Optional: back navigation label — callers should pass a translated label */
  backLabel?: string;

  /** Optional: max-width class override (default: "max-w-5xl") */
  maxWidth?: string;

  /** Optional: inner padding class override (default: "p-6 sm:p-8") */
  padding?: string;

  /** Optional: text direction override (default: "rtl") */
  dir?: "rtl" | "ltr";
}

export function AdminPageShell({
  children,
  title,
  description,
  actions,
  backHref,
  backLabel = "← Back",
  maxWidth = "max-w-5xl",
  padding = "p-6 sm:p-8",
  dir: dirProp,
}: AdminPageShellProps) {
  const locale = useLocale();
  const dir = dirProp ?? (isRtl(locale) ? 'rtl' : 'ltr');
  const hasHeader = !!(title || description || actions || backHref);

  return (
    <div
      dir={dir}
      className="min-h-screen text-slate-100 font-sans"
      style={{ background: "var(--eg-bg)", color: "var(--eg-text)" }}
    >
      <div className={`${maxWidth} mx-auto ${padding} space-y-8`}>

        {hasHeader ? (
          <header className="flex items-start justify-between gap-4">
            <div>
              {/* Back navigation */}
              {backHref && (
                <Link
                  href={backHref}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 mb-3 transition-colors"
                >
                  {backLabel}
                </Link>
              )}

              {/* Page title */}
              {title && (
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight"
                  style={{ color: "var(--eg-text)" }}>
                  {title}
                </h1>
              )}

              {/* Description */}
              {description && (
                <p className="mt-1 text-sm" style={{ color: "var(--eg-text-muted)" }}>
                  {description}
                </p>
              )}
            </div>

            {/* Actions slot */}
            <div className="flex items-center gap-2 flex-shrink-0 mt-1">
              <LanguageSwitcher />
              {actions}
            </div>
          </header>
        ) : (
          <div className="flex justify-end mb-4">
            <LanguageSwitcher />
          </div>
        )}

        {/* Page content */}
        <main>{children}</main>

      </div>
    </div>
  );
}
