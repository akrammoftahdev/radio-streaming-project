/**
 * ActionButton — Generic button with EGONAIR dark variants.
 * No navigation logic. Default type="button".
 * Variants: primary | secondary | ghost | danger
 *
 * Theme tokens used:
 *   primary → --eg-primary (background, border, shadow)
 *   danger  → --eg-danger / semantic rose (unchanged — danger is semantic)
 */

import React from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ActionButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Optional leading icon */
  icon?: React.ReactNode;
  /** Show loading spinner and disable interaction */
  loading?: boolean;
}

// CSS-variable-aware class strings.
// Tailwind's JIT cannot generate arbitrary var() classes at compile time,
// so we use inline style where needed and keep Tailwind only for layout/size.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "text-white border shadow-sm",
  secondary:
    "bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600/40",
  ghost:
    "bg-transparent hover:bg-slate-800 text-slate-300 border border-slate-700/60",
  danger:
    "bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/40",
};

const VARIANT_STYLES: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: "var(--eg-primary)",
    borderColor: "color-mix(in srgb, var(--eg-primary) 40%, transparent)",
    boxShadow: "0 1px 3px color-mix(in srgb, var(--eg-primary) 30%, transparent)",
  },
  secondary: {},
  ghost:     {},
  danger:    {},
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs gap-1.5",
  md: "px-4 py-2   text-sm gap-2",
  lg: "px-5 py-2.5 text-sm gap-2",
};

export function ActionButton({
  variant = "secondary",
  size = "md",
  icon,
  loading = false,
  children,
  className = "",
  style,
  disabled,
  type = "button",
  ...rest
}: ActionButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      style={{ ...VARIANT_STYLES[variant], ...style }}
      className={[
        "inline-flex items-center justify-center font-medium rounded-xl",
        "transition-all duration-150 focus:outline-none",
        "focus:ring-2 focus:ring-[var(--eg-primary)]/50",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      ].join(" ")}
      {...rest}
    >
      {loading ? (
        <svg
          className="w-4 h-4 animate-spin flex-shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8H4z"
          />
        </svg>
      ) : (
        icon && (
          <span className="flex-shrink-0" aria-hidden="true">
            {icon}
          </span>
        )
      )}
      {children}
    </button>
  );
}
