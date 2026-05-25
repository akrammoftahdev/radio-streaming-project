"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef } from "react";

export function SMSearchBar({
  placeholder = "بحث...",
  paramKey = "q",
}: {
  placeholder?: string;
  paramKey?: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const current = sp.get(paramKey) ?? "";
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigate = (val: string) => {
    const params = new URLSearchParams(sp.toString());
    if (val.trim()) params.set(paramKey, val.trim());
    else            params.delete(paramKey);
    params.delete("page");
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => navigate(e.target.value), 400);
  };

  return (
    <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 focus-within:border-slate-500 transition-colors flex-1 min-w-0">
      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-slate-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        type="text"
        defaultValue={current}
        onChange={onChange}
        placeholder={placeholder}
        className="flex-1 bg-transparent border-none outline-none text-sm text-slate-200 placeholder-slate-600 text-right"
        dir="rtl"
      />
      {current && (
        <button
          type="button"
          onClick={() => navigate("")}
          className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      )}
    </div>
  );
}
