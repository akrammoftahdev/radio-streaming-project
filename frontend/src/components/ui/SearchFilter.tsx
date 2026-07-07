"use client";

import { useEffect, useRef, useState } from "react";

interface SearchFilterProps {
  /** Controlled value */
  value: string;
  /** Called immediately on change (no debounce) OR after debounceMs if set */
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  /** If set, onChange fires only after this many ms of inactivity */
  debounceMs?: number;
  className?: string;
}

/**
 * SearchFilter
 *
 * Generic controlled text input for filter bars.
 * Dark RTL style. No URL/router logic — caller owns state.
 * When debounceMs is provided the callback fires after that delay.
 */
export function SearchFilter({
  value,
  onChange,
  placeholder = "بحث...",
  label,
  debounceMs,
  className = "",
}: SearchFilterProps) {
  // Internal display value only used when debouncing
  const [internal, setInternal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep internal in sync if parent resets value (e.g. clear-all)
  useEffect(() => {
    setInternal(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (!debounceMs) {
      onChange(v);
      return;
    }
    setInternal(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(v), debounceMs);
  };

  const displayValue = debounceMs ? internal : value;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label className="text-xs font-medium text-neutral-400">{label}</label>
      )}
      <div className="relative">
        {/* Search icon */}
        <span className="absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--eg-text-muted)" }}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          type="text"
          dir="auto"
          value={displayValue}
          onChange={handleChange}
          placeholder={placeholder}
          className="
            w-full rounded-lg
            ps-9 pe-3 py-2 text-sm placeholder:text-slate-600
            focus:outline-none focus:ring-1
            transition-colors
          "
          style={{
            background: "var(--eg-surface-soft)",
            border: "1px solid var(--eg-border)",
            color: "var(--eg-text)",
          }}
          onFocus={e => {
            e.currentTarget.style.borderColor = "var(--eg-primary)";
            e.currentTarget.style.boxShadow = "0 0 0 1px color-mix(in srgb, var(--eg-primary) 40%, transparent)";
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = "var(--eg-border)";
            e.currentTarget.style.boxShadow = "";
          }}
        />
        {/* Clear button */}
        {displayValue && (
          <button
            type="button"
            onClick={() => {
              setInternal("");
              onChange("");
            }}
            className="absolute end-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors"
            aria-label="مسح البحث"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-3 h-3"
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
          </button>
        )}
      </div>
    </div>
  );
}
