"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, FormEvent } from "react";
import { SearchFilter }       from "@/components/ui/SearchFilter";
import { ClearFiltersButton } from "@/components/ui/ClearFiltersButton";

export function AdminRecordingsDateSearchFilter({
  initialQ,
  initialDateFrom,
  initialDateTo,
  pageSize,
}: {
  initialQ:        string;
  initialDateFrom: string;
  initialDateTo:   string;
  pageSize:        number;
}) {
  const router          = useRouter();
  const searchParamsUrl = useSearchParams();

  const [q,        setQ]        = useState(initialQ);
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo,   setDateTo]   = useState(initialDateTo);

  const applyFilters = (e?: FormEvent) => {
    if (e) e.preventDefault();
    const params = new URLSearchParams(searchParamsUrl.toString());

    if (q.trim()) params.set("q", q.trim()); else params.delete("q");
    if (dateFrom) params.set("dateFrom", dateFrom); else params.delete("dateFrom");
    if (dateTo)   params.set("dateTo",   dateTo);   else params.delete("dateTo");

    if (pageSize !== 20) params.set("pageSize", pageSize.toString());
    params.delete("page");
    router.push(`/admin/recordings?${params.toString()}`);
  };

  const clearAll = () => {
    setQ(""); setDateFrom(""); setDateTo("");
    const params = new URLSearchParams();
    if (pageSize !== 20) params.set("pageSize", pageSize.toString());
    router.push(`/admin/recordings?${params.toString()}`);
  };

  return (
    <form
      onSubmit={applyFilters}
      className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-col gap-4 col-span-1 md:col-span-2 xl:col-span-2 min-w-0"
    >
      <div className="flex flex-col md:flex-row items-end gap-4 h-full">

        {/* Search */}
        <div className="flex-1 min-w-0 w-full h-full flex flex-col justify-end">
          <label className="block text-sm font-medium text-neutral-400 mb-1.5">بحث عام</label>
          <SearchFilter
            value={q}
            onChange={setQ}
            placeholder="ابحث باسم التسجيل أو المذيع أو المحطة..."
          />
        </div>

        {/* Date Range — native date inputs (no shared component for date range yet) */}
        <div className="flex items-center gap-2 w-full md:w-auto h-full flex-col sm:flex-row justify-end">
          <div className="w-full sm:w-auto">
            <label className="block text-sm font-medium text-neutral-400 mb-1.5">من تاريخ</label>
            <input
              type="date"
              className="w-full bg-neutral-800 border border-neutral-700 text-neutral-200 text-sm rounded-lg px-3 py-2.5 outline-none focus:border-indigo-500 transition-colors"
              style={{ colorScheme: "dark" }}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-auto">
            <label className="block text-sm font-medium text-neutral-400 mb-1.5">إلى تاريخ</label>
            <input
              type="date"
              className="w-full bg-neutral-800 border border-neutral-700 text-neutral-200 text-sm rounded-lg px-3 py-2.5 outline-none focus:border-indigo-500 transition-colors"
              style={{ colorScheme: "dark" }}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2 w-full md:w-auto h-full flex-col justify-end">
          <button
            type="submit"
            className="w-full md:w-auto px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium border border-indigo-500 rounded-lg transition-colors shadow-sm shadow-indigo-500/20 h-[42px]"
          >
            تطبيق
          </button>
        </div>
      </div>

      {/* Clear All */}
      {(searchParamsUrl.toString() !== "" && searchParamsUrl.toString() !== `pageSize=${pageSize}`) && (
        <div className="flex justify-start mt-2">
          <ClearFiltersButton onClick={clearAll} label="مسح كل الفلاتر" />
        </div>
      )}
    </form>
  );
}
