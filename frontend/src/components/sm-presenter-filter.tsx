"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

type Presenter = { id: string; name: string | null; username: string };

export function SMPresenterFilter({
  presenters,
  paramKey = "presenter",
}: {
  presenters: Presenter[];
  paramKey?: string;
}) {
  const t = useTranslations("stationManager.presenterFilter");
  const router = useRouter();
  const sp = useSearchParams();
  const current = sp.get(paramKey) ?? "";
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
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
    ? presenters.filter(p =>
        (p.name?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
        p.username.toLowerCase().includes(search.toLowerCase()))
    : presenters;

  const navigate = (id: string) => {
    const params = new URLSearchParams(sp.toString());
    if (id) params.set(paramKey, id);
    else    params.delete(paramKey);
    params.delete("page");
    router.push(`?${params.toString()}`, { scroll: false });
    setOpen(false); setSearch("");
  };

  const isActive = !!current;
  const selected = presenters.find(p => p.id === current);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-all duration-150 whitespace-nowrap ${
          isActive
            ? "bg-indigo-600/15 border-indigo-500/50 text-indigo-300 hover:bg-indigo-600/25"
            : "bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300"
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-indigo-400" : "text-slate-500"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <span className="truncate max-w-[120px]">
          {selected ? (selected.name || selected.username) : t("presenter")}
        </span>
        <svg xmlns="http://www.w3.org/2000/svg" className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-2 right-0 w-64 z-50 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">
          <div className="p-2 border-b border-slate-800">
            <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 focus-within:border-indigo-500 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input ref={inputRef} type="text" placeholder={t("search")} value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 bg-transparent border-none outline-none text-sm text-slate-200 placeholder-slate-600 text-right" dir="rtl"/>
            </div>
          </div>

          <div className="max-h-52 overflow-y-auto">
            <div className="p-1.5 space-y-0.5">
              {!search && (
                <button type="button" onClick={() => navigate("")}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all text-right ${!current ? "bg-indigo-600/20 text-indigo-200" : "hover:bg-slate-800 text-slate-300"}`}>
                  <div className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center ${!current ? "bg-indigo-600 border-indigo-500" : "border-slate-600 bg-slate-800"}`}>
                    {!current && <svg xmlns="http://www.w3.org/2000/svg" className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                  <span className="font-medium">{t("all")}</span>
                </button>
              )}
              {filtered.length === 0
                ? <div className="p-3 text-sm text-slate-500 text-center">{t("noResults")}</div>
                : filtered.map(p => {
                    const isSel = current === p.id;
                    return (
                      <button key={p.id} type="button" onClick={() => navigate(p.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all text-right ${isSel ? "bg-indigo-600/20 text-indigo-200" : "hover:bg-slate-800 text-slate-300"}`}>
                        <div className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center ${isSel ? "bg-indigo-600 border-indigo-500" : "border-slate-600 bg-slate-800"}`}>
                          {isSel && <svg xmlns="http://www.w3.org/2000/svg" className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                        </div>
                        <div className="flex-1 min-w-0 text-right">
                          <div className="font-medium truncate">{p.name || p.username}</div>
                          {p.name && <div className="text-xs text-slate-500 font-mono">@{p.username}</div>}
                        </div>
                      </button>
                    );
                  })
              }
            </div>
          </div>

          {isActive && (
            <div className="p-2 border-t border-slate-800">
              <button type="button" onClick={() => navigate("")}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 text-red-400 hover:text-red-300 text-xs font-medium rounded-lg transition-all">
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
