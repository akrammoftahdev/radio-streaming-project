/**
 * EmptyState — Generic presentational empty state.
 * No business logic. No navigation. RTL-safe.
 * Accepts icon slot, title, description, and optional action slot.
 */

import React from "react";

interface EmptyStateProps {
  /** Icon element — pass any SVG or emoji wrapper */
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** Optional action slot — e.g. a button or link */
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={[
        "flex flex-col items-center justify-center text-center",
        "py-16 px-6 gap-4",
        className,
      ].join(" ")}
    >
      {icon && (
        <div className="text-5xl mb-2" style={{ color: "var(--eg-text-faint)" }} aria-hidden="true">
          {icon}
        </div>
      )}

      <p className="text-lg font-semibold" style={{ color: "var(--eg-text-muted)" }}>{title}</p>

      {description && (
        <p className="text-sm max-w-sm" style={{ color: "var(--eg-text-faint)" }}>{description}</p>
      )}

      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
