"use client";

import { useEffect, useRef, useState } from "react";

/**
 * DEFAULT SHARED COMPONENT FOR SELECTABLE ENTITY FILTERS.
 *
 * Use MultiSmartSelect whenever a filter lets the user pick one or more
 * entities — stations, presenters, categories, programs, etc.
 *
 * Rule: Do NOT build page-specific dropdown filters.
 * Admin and Station Manager share the same component; only the `options`
 * data passed in differs by role/scope.
 *
 * Features:
 *   - Searchable dropdown (RTL, dark)
 *   - Multi-select with checkbox indicators
 *   - Chips in trigger (up to maxChips, then "+N")
 *   - Clear-all in trigger and in dropdown header
 *   - Disabled option support
 *   - Controlled (values/onChange) — no URL/router logic
 *   - No role-specific or page-specific logic
 *
 * For rare single-value selects, use SmartSelect instead.
 * For fixed small-value filters (status, sort), use SegmentedFilter.
 */

export interface MultiSmartSelectOption {
  value: string;
  label: string;
  /** Optional secondary text shown below the label */
  subtitle?: string;
  /** If true, the option is shown but cannot be selected */
  disabled?: boolean;
}

interface MultiSmartSelectProps {
  options: MultiSmartSelectOption[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  label?: string;
  /** Max chips shown before "+N more" summary */
  maxChips?: number;
  className?: string;
}

/**
 * MultiSmartSelect
 *
 * Multi-select searchable dropdown.
 * Selected items shown as chips in the trigger. Dark RTL style.
 * No URL/router logic — caller owns state.
 * Closes on outside click and Escape key.
 */
export function MultiSmartSelect({
  options,
  values,
  onChange,
  placeholder = "اختر...",
  label,
  maxChips = 2,
  className = "",
}: MultiSmartSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close on Escape, focus search on open
  useEffect(() => {
    if (open) searchRef.current?.focus();
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const toggle = (v: string) => {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  };

  const clearAll = () => onChange([]);

  const filtered = search.trim()
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(search.toLowerCase()) ||
          (o.subtitle?.toLowerCase().includes(search.toLowerCase()) ?? false)
      )
    : options;

  const selectedOptions = options.filter((o) => values.includes(o.value));
  const visibleChips = selectedOptions.slice(0, maxChips);
  const extraCount = selectedOptions.length - maxChips;

  return (
    <div className={`relative flex flex-col gap-1 ${className}`} ref={containerRef}>
      {label && (
        <label className="text-xs font-medium" style={{ color: "var(--eg-text-muted)" }}>{label}</label>
      )}

      {/* Trigger */}
      <button
        type="button"
        dir="rtl"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between gap-2 flex-wrap rounded-lg px-3 py-2 text-sm transition-colors min-h-[38px] text-right focus:outline-none"
        style={{
          background: "var(--eg-surface-soft)",
          border: `1px solid ${open ? "var(--eg-primary)" : "var(--eg-border)"}`,
        }}
      >
        <div className="flex items-center gap-1 flex-wrap flex-1 min-w-0">
          {values.length === 0 && (
            <span className="text-xs" style={{ color: "var(--eg-text-faint)" }}>{placeholder}</span>
          )}
          {visibleChips.map((opt) => (
            <span
              key={opt.value}
              className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border"
              style={{
                background: "color-mix(in srgb, var(--eg-primary) 20%, transparent)",
                borderColor: "color-mix(in srgb, var(--eg-primary) 30%, transparent)",
                color: "color-mix(in srgb, var(--eg-primary) 90%, white)",
              }}
            >
              {opt.label}
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => { e.stopPropagation(); toggle(opt.value); }}
                className="hover:text-white cursor-pointer leading-none transition-colors"
                style={{ color: "color-mix(in srgb, var(--eg-primary) 70%, white)" }}
                aria-label={`إزالة ${opt.label}`}
              >
                ×
              </span>
            </span>
          ))}
          {extraCount > 0 && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full border"
              style={{ color: "var(--eg-text-muted)", background: "var(--eg-surface)", borderColor: "var(--eg-border)" }}
            >
              +{extraCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {values.length > 0 && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); clearAll(); }}
              className="hover:text-white transition-colors cursor-pointer"
              style={{ color: "var(--eg-text-muted)" }}
              aria-label="مسح الكل"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </span>
          )}
          <svg xmlns="http://www.w3.org/2000/svg"
            className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
            style={{ color: "var(--eg-text-muted)" }}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          dir="rtl"
          className="
            absolute top-full right-0 mt-1 z-50 w-full min-w-[200px]
            bg-neutral-900 border border-neutral-700 rounded-xl shadow-xl overflow-hidden
          "
        >
          {/* Search */}
          <div className="p-2 border-b" style={{ borderColor: "var(--eg-border-soft)" }}>
            <input
              ref={searchRef}
              type="text"
              dir="rtl"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث..."
              className="w-full rounded-lg px-3 py-1.5 text-xs placeholder:text-slate-600 focus:outline-none transition-colors"
              style={{
                background: "var(--eg-surface-soft)",
                border: "1px solid var(--eg-border)",
                color: "var(--eg-text)",
              }}
              onFocus={e => { e.currentTarget.style.borderColor = "var(--eg-primary)"; }}
              onBlur={e  => { e.currentTarget.style.borderColor = "var(--eg-border)"; }}
            />
          </div>

          {/* Clear all row */}
          {values.length > 0 && (
            <div className="px-3 py-1.5 border-b" style={{ borderColor: "var(--eg-border-soft)" }}>
              <button
                type="button"
                onClick={clearAll}
                className="text-[10px] text-rose-400 hover:text-rose-300 transition-colors"
              >
                مسح الكل ({values.length})
              </button>
            </div>
          )}

          {/* Options */}
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-xs text-center" style={{ color: "var(--eg-text-faint)" }}>لا توجد نتائج</p>
            )}
            {filtered.map((opt) => {
              const isSelected = values.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => !opt.disabled && toggle(opt.value)}
                  className={`w-full text-right px-3 py-2.5 flex items-start gap-2.5 text-xs transition-colors ${opt.disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                  style={isSelected && !opt.disabled ? {
                    background: "color-mix(in srgb, var(--eg-primary) 10%, transparent)",
                  } : undefined}
                  onMouseEnter={e => { if (!isSelected && !opt.disabled) e.currentTarget.style.background = "var(--eg-surface-soft)"; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isSelected ? "color-mix(in srgb, var(--eg-primary) 10%, transparent)" : ""; }}
                >
                  {/* Checkbox indicator */}
                  <span
                    className="flex-shrink-0 w-3.5 h-3.5 mt-0.5 rounded border transition-colors flex items-center justify-center"
                    style={isSelected ? {
                      background: "var(--eg-primary)",
                      borderColor: "var(--eg-primary)",
                    } : { borderColor: "var(--eg-border)" }}
                  >
                    {isSelected && (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                  <span className="flex flex-col gap-0.5 text-right">
                    <span style={{ color: isSelected ? "color-mix(in srgb, var(--eg-primary) 90%, white)" : "var(--eg-text)" }}>
                      {opt.label}
                    </span>
                    {opt.subtitle && (
                      <span className="text-[10px]" style={{ color: "var(--eg-text-muted)" }}>{opt.subtitle}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
