"use client";

import React from "react";
import Link from "next/link";

interface ClearFiltersButtonProps {
  /** If provided, renders as a Next.js Link */
  href?: string;
  /** If provided (and no href), renders as a button */
  onClick?: () => void;
  label?: string;
  className?: string;
}

/**
 * ClearFiltersButton
 *
 * Presentational "clear all filters" control.
 * Renders as a <Link> when href is given, or a <button> when onClick is given.
 * No URL/router/page logic — caller decides what clearing means.
 */
export function ClearFiltersButton({
  href,
  onClick,
  label = "مسح الفلاتر",
  className = "",
}: ClearFiltersButtonProps) {
  const baseClass = `inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${className}`;
  const baseStyle: React.CSSProperties = {
    color: "var(--eg-text-muted)",
    background: "var(--eg-surface-soft)",
    border: "1px solid var(--eg-border)",
  };

  const icon = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-3 h-3 flex-shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );

  if (href) {
    return (
      <Link href={href} className={baseClass} style={baseStyle}>
        {icon}
        {label}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={baseClass} style={baseStyle}>
      {icon}
      {label}
    </button>
  );
}
