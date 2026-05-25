"use client";

import React from "react";

export interface SegmentOption {
  value: string;
  label: string;
  /** Optional count badge shown after the label */
  count?: number;
  disabled?: boolean;
}

interface SegmentedFilterProps {
  value: string;
  options: SegmentOption[];
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}

/**
 * SegmentedFilter
 *
 * Segmented button group for small, fixed-value filters.
 * Examples: status (الكل / نشط / غير نشط), sort (الأحدث / الأقدم).
 * Dark RTL style. No URL/router logic — caller owns state.
 *
 * USAGE BOUNDARY: Do NOT use SegmentedFilter for entity selectors such as
 * station, presenter, or category filters. Those have dynamic lists and
 * potentially many values — use MultiSmartSelect instead.
 * SegmentedFilter is suitable only when options are 2–5 fixed, known values.
 */
export function SegmentedFilter({
  value,
  options,
  onChange,
  label,
  className = "",
}: SegmentedFilterProps) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label className="text-xs font-medium" style={{ color: "var(--eg-text-muted)" }}>{label}</label>
      )}
      <div
        dir="rtl"
        className="inline-flex items-center rounded-lg p-0.5 gap-0.5 flex-wrap border"
        style={{ background: "var(--eg-surface-soft)", borderColor: "var(--eg-border)" }}
      >
        {options.map((opt) => {
          const isActive = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={opt.disabled}
              onClick={() => !opt.disabled && onChange(opt.value)}
              style={isActive ? {
                background: "var(--eg-primary)",
                color: "#fff",
                boxShadow: "0 1px 4px color-mix(in srgb, var(--eg-primary) 30%, transparent)",
              } : undefined}
              className={`
                inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
                transition-colors select-none
                ${isActive
                  ? ""
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"}
                ${opt.disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
              `}
            >
              {opt.label}
              {opt.count !== undefined && (
                <span
                  style={isActive ? {
                    background: "color-mix(in srgb, var(--eg-primary) 50%, transparent)",
                    color: "#fff",
                  } : undefined}
                  className={`
                    text-[10px] px-1.5 py-0.5 rounded-full font-semibold
                    ${isActive ? "" : "bg-slate-800 text-slate-500"}
                  `}
                >
                  {opt.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
