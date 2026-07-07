"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

type Station = { id: string; name: string; count?: number };

type Accent = "teal" | "amber" | "purple";

const ACCENT: Record<Accent, {
  trigger:  string;
  active:   string;
  badge:    string;
  search:   string;
  item:     string;
  check:    string;
  clear:    string;
}> = {
  teal: {
    trigger: "bg-teal-600/15 border-teal-500/50 text-teal-300 hover:bg-teal-600/25",
    active:  "text-teal-400",
    badge:   "bg-teal-500",
    search:  "focus-within:border-teal-500",
    item:    "bg-teal-600/20 text-teal-200",
    check:   "bg-teal-600 border-teal-500",
    clear:   "bg-red-500/10 hover:bg-red-500/20 border-red-500/20 hover:border-red-500/40 text-red-400 hover:text-red-300",
  },
  amber: {
    trigger: "bg-amber-600/15 border-amber-500/50 text-amber-300 hover:bg-amber-600/25",
    active:  "text-amber-400",
    badge:   "bg-amber-500",
    search:  "focus-within:border-amber-500",
    item:    "bg-amber-600/20 text-amber-200",
    check:   "bg-amber-600 border-amber-500",
    clear:   "bg-red-500/10 hover:bg-red-500/20 border-red-500/20 hover:border-red-500/40 text-red-400 hover:text-red-300",
  },
  purple: {
    trigger: "bg-purple-600/15 border-purple-500/50 text-purple-300 hover:bg-purple-600/25",
    active:  "text-purple-400",
    badge:   "bg-purple-500",
    search:  "focus-within:border-purple-500",
    item:    "bg-purple-600/20 text-purple-200",
    check:   "bg-purple-600 border-purple-500",
    clear:   "bg-red-500/10 hover:bg-red-500/20 border-red-500/20 hover:border-red-500/40 text-red-400 hover:text-red-300",
  },
};

export function SMStationFilter({
  stations,
  paramKey = "station",
  accent = "teal",
  allLabel,
}: {
  stations: Station[];
  paramKey?: string;
  accent?: Accent;
  allLabel?: string;
}) {
  const t = useTranslations("stationManager.stationFilter");
  const router = useRouter();
  const sp = useSearchParams();

  const resolvedAllLabel = allLabel ?? t("all");

  // ── Parse comma-separated selected IDs from URL ──────────────────────────
  const rawParam   = sp.get(paramKey) ?? "";
  const selectedIds = rawParam
    ? new Set(rawParam.split(",").filter(Boolean))
    : new Set<string>();

  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState("");
  const ref      = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const filtered = search.trim()
    ? stations.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
    : stations;

  // ── Toggle a single station ID in/out of the selection ──────────────────
  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else              next.add(id);
    const params = new URLSearchParams(sp.toString());
    if (next.size > 0) params.set(paramKey, Array.from(next).join(","));
    else               params.delete(paramKey);
    params.delete("page");
    router.push(`?${params.toString()}`, { scroll: false });
  };

  // ── Clear all selections ─────────────────────────────────────────────────
  const clearAll = () => {
    const params = new URLSearchParams(sp.toString());
    params.delete(paramKey);
    params.delete("page");
    router.push(`?${params.toString()}`, { scroll: false });
    setOpen(false); setSearch("");
  };

  const isActive = selectedIds.size > 0;
  const a = ACCENT[accent];

  // ── Trigger label ────────────────────────────────────────────────────────
  const triggerLabel = () => {
    if (selectedIds.size === 0) return resolvedAllLabel;
    if (selectedIds.size === 1) {
      return stations.find(s => selectedIds.has(s.id))?.name ?? resolvedAllLabel;
    }
    return t("stationsCount", { count: selectedIds.size });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-all duration-150 whitespace-nowrap ${
          isActive ? a.trigger : "bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300"
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 flex-shrink-0 ${isActive ? a.active : "text-slate-500"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
          <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
        </svg>
        <span className="truncate max-w-[120px]">{triggerLabel()}</span>
        {isActive && selectedIds.size > 1 && (
          <span className={`text-[10px] font-bold ${a.badge} text-white rounded-full w-4 h-4 flex items-center justify-center flex-shrink-0`}>
            {selectedIds.size}
          </span>
        )}
        <svg xmlns="http://www.w3.org/2000/svg" className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-2 right-0 w-60 z-50 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-slate-800">
            <div className={`flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 transition-colors ${a.search}`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input ref={inputRef} type="text" placeholder={t("search")} value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 bg-transparent border-none outline-none text-sm text-slate-200 placeholder-slate-600 text-right" dir="rtl"/>
            </div>
          </div>

          {/* Options */}
          <div className="max-h-52 overflow-y-auto">
            <div className="p-1.5 space-y-0.5">
              {/* All option — clears selection */}
              {!search && (
                <button type="button" onClick={clearAll}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all text-right ${
                    !isActive ? a.item : "hover:bg-slate-800 text-slate-300"
                  }`}>
                  <div className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center ${
                    !isActive ? a.check : "border-slate-600 bg-slate-800"
                  }`}>
                    {!isActive && <svg xmlns="http://www.w3.org/2000/svg" className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                  <span className="font-medium">{resolvedAllLabel}</span>
                </button>
              )}

              {filtered.length === 0
                ? <div className="p-3 text-sm text-slate-500 text-center">{t("noResults")}</div>
                : filtered.map(s => {
                    const isSel = selectedIds.has(s.id);
                    return (
                      <button key={s.id} type="button" onClick={() => toggle(s.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all text-right ${isSel ? a.item : "hover:bg-slate-800 text-slate-300"}`}>
                        <div className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center ${isSel ? a.check : "border-slate-600 bg-slate-800"}`}>
                          {isSel && <svg xmlns="http://www.w3.org/2000/svg" className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                        </div>
                        <div className="flex-1 min-w-0 text-right">
                          <div className="font-medium truncate">{s.name}</div>
                          {s.count !== undefined && <div className="text-xs text-slate-500">{t("itemCount", { count: s.count })}</div>}
                        </div>
                      </button>
                    );
                  })
              }
            </div>
          </div>

          {/* Clear footer */}
          {isActive && (
            <div className="p-2 border-t border-slate-800">
              <button type="button" onClick={clearAll}
                className={`w-full flex items-center justify-center gap-1.5 px-3 py-1.5 border text-xs font-medium rounded-lg transition-all ${a.clear}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
                {t("clearFilter")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
