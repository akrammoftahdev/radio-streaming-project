"use client";

import { useEffect, useRef, useState } from "react";

export interface SmartSelectOption {
  value: string;
  label: string;
  /** Optional secondary text shown below the label */
  subtitle?: string;
}

interface SmartSelectProps {
  options: SmartSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  /** If true, shows a "— الكل —" option at the top that sets value to "" */
  clearable?: boolean;
  className?: string;
}

/**
 * SmartSelect
 *
 * Single-select searchable dropdown.
 * Dark RTL style. No URL/router logic — caller owns state.
 * Closes on outside click and Escape key.
 *
 * USAGE NOTE: For entity filters (station, presenter, category, etc.) prefer
 * MultiSmartSelect which supports multi-select and chips.
 * Use SmartSelect only for rare cases where exactly one value is required
 * (e.g. a "sort by" that does not fit the SegmentedFilter pattern).
 */
export function SmartSelect({
  options,
  value,
  onChange,
  placeholder = "اختر...",
  label,
  clearable = true,
  className = "",
}: SmartSelectProps) {
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
    if (open) {
      searchRef.current?.focus();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  const filtered = search.trim()
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(search.toLowerCase()) ||
          (o.subtitle?.toLowerCase().includes(search.toLowerCase()) ?? false)
      )
    : options;

  const select = (v: string) => {
    onChange(v);
    setOpen(false);
    setSearch("");
  };

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
        className="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors text-right focus:outline-none"
        style={{
          background: "var(--eg-surface-soft)",
          border: `1px solid ${open ? "var(--eg-primary)" : "var(--eg-border)"}`,
        }}
      >
        <span style={{ color: selected ? "var(--eg-text)" : "var(--eg-text-faint)" }}>
          {selected ? selected.label : placeholder}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          style={{ color: "var(--eg-text-muted)" }}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          dir="rtl"
          className="absolute top-full right-0 mt-1 z-50 w-full min-w-[200px] rounded-xl shadow-xl overflow-hidden border"
          style={{ background: "var(--eg-surface)", borderColor: "var(--eg-border)" }}
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

          {/* Options list */}
          <div className="max-h-56 overflow-y-auto">
            {clearable && (
              <button
                type="button"
                onClick={() => select("")}
                className="w-full text-right px-3 py-2.5 text-xs transition-colors"
                style={!value ? {
                  background: "color-mix(in srgb, var(--eg-primary) 15%, transparent)",
                  color: "color-mix(in srgb, var(--eg-primary) 90%, white)",
                } : { color: "var(--eg-text-muted)" }}
                onMouseEnter={e => { if (value) e.currentTarget.style.background = "var(--eg-surface-soft)"; }}
                onMouseLeave={e => { if (value) e.currentTarget.style.background = ""; }}
              >
                — الكل —
              </button>
            )}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-xs text-center" style={{ color: "var(--eg-text-faint)" }}>
                لا توجد نتائج
              </p>
            )}
            {filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => select(opt.value)}
                className="w-full text-right px-3 py-2.5 text-xs flex flex-col gap-0.5 transition-colors"
                style={opt.value === value ? {
                  background: "color-mix(in srgb, var(--eg-primary) 15%, transparent)",
                  color: "color-mix(in srgb, var(--eg-primary) 90%, white)",
                } : { color: "var(--eg-text)" }}
                onMouseEnter={e => { if (opt.value !== value) e.currentTarget.style.background = "var(--eg-surface-soft)"; }}
                onMouseLeave={e => { if (opt.value !== value) e.currentTarget.style.background = ""; }}
              >
                <span>{opt.label}</span>
                {opt.subtitle && (
                  <span className="text-[10px]" style={{ color: "var(--eg-text-muted)" }}>{opt.subtitle}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
