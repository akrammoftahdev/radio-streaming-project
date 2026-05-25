/**
 * StatusBadge — Generic presentational badge.
 * No business logic. No navigation. RTL-safe.
 * Variants: neutral | success | warning | danger | info
 *
 * Theme tokens:
 *   info → --eg-primary
 *   success/warning/danger → semantic (unchanged — these must stay recognisable)
 */

import React from "react";

type BadgeVariant = "neutral" | "success" | "warning" | "danger" | "info";

interface StatusBadgeProps {
  label: string;
  variant?: BadgeVariant;
  /** Optional dot indicator before label */
  dot?: boolean;
  className?: string;
}

// Static Tailwind classes for variants that do NOT need theme overrides.
// "info" uses CSS variables via inline style below.
const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: "bg-slate-700/60 text-slate-300 border-slate-600/40",
  success: "bg-emerald-600/20 text-emerald-300 border-emerald-500/40",
  warning: "bg-amber-600/20  text-amber-300  border-amber-500/40",
  danger:  "bg-rose-600/20   text-rose-300   border-rose-500/40",
  info:    "border",   // background/text set via inline style below
};

const DOT_CLASSES: Record<BadgeVariant, string> = {
  neutral: "bg-slate-400",
  success: "bg-emerald-400",
  warning: "bg-amber-400",
  danger:  "bg-rose-400",
  info:    "",  // set via inline style below
};

// Inline styles for theme-variable-driven variants
const VARIANT_STYLES: Record<BadgeVariant, React.CSSProperties> = {
  neutral: {},
  success: {},
  warning: {},
  danger:  {},
  info: {
    background: "color-mix(in srgb, var(--eg-primary) 20%, transparent)",
    color:      "color-mix(in srgb, var(--eg-primary) 90%, white)",
    borderColor:"color-mix(in srgb, var(--eg-primary) 40%, transparent)",
  },
};

const DOT_STYLES: Record<BadgeVariant, React.CSSProperties> = {
  neutral: {},
  success: {},
  warning: {},
  danger:  {},
  info:    { background: "var(--eg-primary)" },
};

export function StatusBadge({
  label,
  variant = "neutral",
  dot = false,
  className = "",
}: StatusBadgeProps) {
  return (
    <span
      style={VARIANT_STYLES[variant]}
      className={[
        "inline-flex items-center gap-1.5 px-2.5 py-0.5",
        "text-xs font-medium rounded-full border",
        "whitespace-nowrap leading-5",
        VARIANT_CLASSES[variant],
        className,
      ].join(" ")}
    >
      {dot && (
        <span
          style={DOT_STYLES[variant]}
          className={[
            "w-1.5 h-1.5 rounded-full flex-shrink-0",
            DOT_CLASSES[variant],
          ].join(" ")}
          aria-hidden="true"
        />
      )}
      {label}
    </span>
  );
}

