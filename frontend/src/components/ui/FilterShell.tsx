/**
 * FilterShell — Layout wrapper for filter blocks.
 * Presentational only. No URL logic. No data fetching.
 * RTL-safe. EGONAIR dark theme.
 *
 * Usage:
 *   <FilterShell clearSlot={<button>مسح</button>}>
 *     <SearchFilter ... />
 *     <SegmentedFilter ... />
 *   </FilterShell>
 */

import React from "react";

interface FilterShellProps {
  children: React.ReactNode;
  /** Optional title shown above filter rows */
  title?: string;
  /** Optional description below title */
  description?: string;
  /**
   * Slot for a "clear all" button or element.
   * Only rendered when provided — parent controls visibility.
   */
  clearSlot?: React.ReactNode;
  className?: string;
}

export function FilterShell({
  children,
  title,
  description,
  clearSlot,
  className = "",
}: FilterShellProps) {
  return (
    <div
      className={[
        "rounded-2xl p-5 mb-6 shadow-xl border",
        className,
      ].join(" ")}
      style={{ background: "var(--eg-surface)", borderColor: "var(--eg-border-soft)" }}
    >
      {/* Optional header */}
      {(title || description) && (
        <div className="mb-4">
          {title && (
            <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--eg-text-muted)" }}>
              {title}
            </h3>
          )}
          {description && (
            <p className="text-xs mt-0.5" style={{ color: "var(--eg-text-muted)" }}>{description}</p>
          )}
        </div>
      )}

      {/* Filter content rows */}
      <div className="flex flex-col gap-5">{children}</div>

      {/* Clear all slot — only shown when provided */}
      {clearSlot && (
        <div className="flex justify-start mt-5 pt-4 border-t" style={{ borderColor: "var(--eg-border-soft)" }}>
          {clearSlot}
        </div>
      )}
    </div>
  );
}
