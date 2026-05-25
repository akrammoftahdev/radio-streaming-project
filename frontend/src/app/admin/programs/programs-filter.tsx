"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { SearchFilter }      from "@/components/ui/SearchFilter";
import { MultiSmartSelect }  from "@/components/ui/MultiSmartSelect";
import { SegmentedFilter }   from "@/components/ui/SegmentedFilter";
import { ClearFiltersButton } from "@/components/ui/ClearFiltersButton";
import type { MultiSmartSelectOption } from "@/components/ui/MultiSmartSelect";

export function AdminProgramsFilter({
  initialQ,
  initialStationIds,
  initialStatus,
  initialSort,
  initialHasSchedule,
  allStations,
  pageSize,
}: {
  initialQ:            string;
  initialStationIds:   string[];
  initialStatus:       string;
  initialSort:         string;
  initialHasSchedule:  string;
  allStations:         { id: string; name: string }[];
  pageSize:            number;
}) {
  const router = useRouter();
  const searchParamsUrl = useSearchParams();

  const [q,           setQ]           = useState(initialQ);
  const [stationIds,  setStationIds]  = useState<string[]>(initialStationIds);
  const [status,      setStatus]      = useState(initialStatus      || "all");
  const [sort,        setSort]        = useState(initialSort        || "newest");
  const [hasSchedule, setHasSchedule] = useState(initialHasSchedule || "all");

  // Sync from URL when navigating externally (browser back/forward, clear-all)
  useEffect(() => { setQ(initialQ); },                                 [initialQ]);
  useEffect(() => { setStationIds(initialStationIds); },               // eslint-disable-next-line react-hooks/exhaustive-deps
    [initialStationIds.join(",")]);
  useEffect(() => { setStatus(initialStatus           || "all"); },    [initialStatus]);
  useEffect(() => { setSort(initialSort               || "newest"); }, [initialSort]);
  useEffect(() => { setHasSchedule(initialHasSchedule || "all"); },    [initialHasSchedule]);

  // ── Apply URL ──────────────────────────────────────────────────────────────
  const apply = useCallback((ov: {
    newQ?: string;
    newStationIds?: string[];
    newStatus?: string;
    newSort?: string;
    newHasSchedule?: string;
  }) => {
    const p = new URLSearchParams(searchParamsUrl.toString());

    const fQ = ov.newQ !== undefined ? ov.newQ : q;
    if (fQ.trim()) p.set("q", fQ.trim()); else p.delete("q");

    const fSts = ov.newStationIds !== undefined ? ov.newStationIds : stationIds;
    if (fSts.length > 0) p.set("stationIds", fSts.join(",")); else p.delete("stationIds");

    const fStatus = ov.newStatus !== undefined ? ov.newStatus : status;
    if (fStatus && fStatus !== "all") p.set("status", fStatus); else p.delete("status");

    const fSort = ov.newSort !== undefined ? ov.newSort : sort;
    if (fSort && fSort !== "newest") p.set("sort", fSort); else p.delete("sort");

    const fHas = ov.newHasSchedule !== undefined ? ov.newHasSchedule : hasSchedule;
    if (fHas && fHas !== "all") p.set("hasSchedule", fHas); else p.delete("hasSchedule");

    if (pageSize !== 20) p.set("pageSize", pageSize.toString());
    p.delete("page");
    p.delete("stationId"); // remove old single-select param if present
    router.push(`/admin/programs?${p.toString()}`, { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParamsUrl, q, stationIds, status, sort, hasSchedule, pageSize]);

  // Debounced search — preserves existing 400ms behaviour
  useEffect(() => {
    const t = setTimeout(() => { if (q !== initialQ) apply({ newQ: q }); }, 400);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const clearAll = () => {
    setQ(""); setStationIds([]); setStatus("all"); setSort("newest"); setHasSchedule("all");
    const p = new URLSearchParams();
    if (pageSize !== 20) p.set("pageSize", pageSize.toString());
    router.push(`/admin/programs?${p.toString()}`, { scroll: false });
  };

  const hasActiveFilters = !!(q || initialStationIds.length || status !== "all" || sort !== "newest" || hasSchedule !== "all");

  // Convert allStations to MultiSmartSelect option shape
  const stationOptions: MultiSmartSelectOption[] = allStations.map(s => ({
    value: s.id,
    label: s.name,
  }));

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 mb-6 shadow-xl">
      <div className="flex flex-col gap-5">

        {/* Search */}
        <div className="w-full">
          <label className="block text-xs font-semibold text-neutral-400 mb-2 uppercase tracking-wider">بحث</label>
          <SearchFilter
            value={q}
            onChange={setQ}
            placeholder="ابحث باسم البرنامج، الوصف، أو المذيع..."
          />
        </div>

        {/* Filters grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">

          {/* ── Station multi-select dropdown ── */}
          <div className="flex flex-col">
            <label className="block text-xs font-semibold text-neutral-400 mb-2 uppercase tracking-wider">المحطة</label>
            <MultiSmartSelect
              options={stationOptions}
              values={stationIds}
              onChange={(ids) => {
                setStationIds(ids);
                apply({ newStationIds: ids });
              }}
              placeholder="كل المحطات"
            />
          </div>

          {/* Status */}
          <div className="flex flex-col">
            <label className="block text-xs font-semibold text-neutral-400 mb-2 uppercase tracking-wider">الحالة</label>
            <SegmentedFilter
              value={status}
              options={[
                { value: "all",      label: "الكل"   },
                { value: "active",   label: "نشط"    },
                { value: "inactive", label: "موقوف"  },
              ]}
              onChange={(val) => { setStatus(val); apply({ newStatus: val }); }}
            />
          </div>

          {/* Sort */}
          <div className="flex flex-col">
            <label className="block text-xs font-semibold text-neutral-400 mb-2 uppercase tracking-wider">ترتيب</label>
            <SegmentedFilter
              value={sort}
              options={[
                { value: "newest", label: "الأحدث"   },
                { value: "oldest", label: "الأقدم"   },
                { value: "title",  label: "الاسم أ-ي" },
              ]}
              onChange={(val) => { setSort(val); apply({ newSort: val }); }}
            />
          </div>

          {/* Has schedule */}
          <div className="flex flex-col">
            <label className="block text-xs font-semibold text-neutral-400 mb-2 uppercase tracking-wider">الجدول</label>
            <SegmentedFilter
              value={hasSchedule}
              options={[
                { value: "all",         label: "الكل"        },
                { value: "hasSchedule", label: "له جدول"     },
                { value: "noSchedule",  label: "بدون جدول"   },
              ]}
              onChange={(val) => { setHasSchedule(val); apply({ newHasSchedule: val }); }}
            />
          </div>

        </div>
      </div>

      {/* Clear all */}
      {hasActiveFilters && (
        <div className="flex justify-start mt-5 pt-4 border-t border-neutral-800">
          <ClearFiltersButton
            onClick={clearAll}
            label="مسح كل الفلاتر"
          />
        </div>
      )}
    </div>
  );
}
