"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchFilter }       from "@/components/ui/SearchFilter";
import { MultiSmartSelect }   from "@/components/ui/MultiSmartSelect";
import { SegmentedFilter }    from "@/components/ui/SegmentedFilter";
import { ClearFiltersButton } from "@/components/ui/ClearFiltersButton";

type Station = { id: string; name: string; slug: string };

export function ManagersFilterBar({ allStations }: { allStations: Station[] }) {
  const router = useRouter();
  const sp     = useSearchParams();

  // ── URL-derived values (source of truth after navigation) ──────────────────
  const urlStations   = (sp.get("stations") ?? "").split(",").filter(Boolean);
  const currentStatus = sp.get("status") ?? "all";
  const currentQ      = sp.get("q")      ?? "";

  // ── Local state for search debounce ────────────────────────────────────────
  const [localQ, setLocalQ]   = useState(currentQ);
  const searchTimer           = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync localQ if URL changes externally (browser back/forward, clear-all)
  useEffect(() => { setLocalQ(currentQ); }, [currentQ]);

  // ── General navigate helper ────────────────────────────────────────────────
  const navigate = useCallback((overrides: Record<string, string>) => {
    const params = new URLSearchParams(sp.toString());
    Object.entries(overrides).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else   params.delete(k);
    });
    params.delete("page");
    router.push(`?${params.toString()}`, { scroll: false });
  }, [sp, router]);

  // ── Station multi-select: apply-on-change (immediate URL push) ─────────────
  const applyStations = useCallback((ids: string[]) => {
    const params = new URLSearchParams(sp.toString());
    if (ids.length > 0) params.set("stations", ids.join(","));
    else                params.delete("stations");
    params.delete("page");
    router.push(`?${params.toString()}`, { scroll: false });
  }, [sp, router]);

  // ── Search: 400ms debounce ─────────────────────────────────────────────────
  const onSearchChange = (val: string) => {
    setLocalQ(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => navigate({ q: val }), 400);
  };

  const clearAll = () => {
    setLocalQ("");
    router.push("?", { scroll: false });
  };

  const isAnyFilterActive = !!(urlStations.length || currentQ || currentStatus !== "all");

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">

        {/* Station multi-select — entity selector */}
        <MultiSmartSelect
          options={allStations.map(s => ({ value: s.id, label: `${s.name} (${s.slug})` }))}
          values={urlStations}
          onChange={applyStations}
          placeholder="المحطات"
        />

        {/* Status — fixed-value, mutually exclusive → SegmentedFilter */}
        <SegmentedFilter
          value={currentStatus}
          options={[
            { value: "all",      label: "الكل"    },
            { value: "active",   label: "نشطون"  },
            { value: "inactive", label: "معطّلون" },
          ]}
          onChange={v => navigate({ status: v === "all" ? "" : v })}
        />

        {/* Search — 400ms debounce preserved */}
        <div className="flex-1 min-w-0">
          <SearchFilter
            value={localQ}
            onChange={onSearchChange}
            placeholder="بحث بالاسم أو اسم المستخدم أو البريد..."
          />
        </div>

        {/* Clear all */}
        {isAnyFilterActive && (
          <ClearFiltersButton onClick={clearAll} label="مسح الكل" />
        )}

      </div>
    </div>
  );
}
