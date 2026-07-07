"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { SearchFilter }        from "@/components/ui/SearchFilter";
import { MultiSmartSelect }    from "@/components/ui/MultiSmartSelect";
import { SegmentedFilter }     from "@/components/ui/SegmentedFilter";
import { ClearFiltersButton }  from "@/components/ui/ClearFiltersButton";
import type { MultiSmartSelectOption } from "@/components/ui/MultiSmartSelect";

export function AdminPresentersFilter({
  initialQ,
  initialMode,
  initialStationIds,
  initialStatus,
  initialSort,
  initialValidity,
  allStations,
  pageSize,
}: {
  initialQ:           string;
  initialMode:        string;
  initialStationIds:  string[];   // multi-select; may include "none"
  initialStatus:      string;
  initialSort:        string;
  initialValidity:    string;
  allStations:        { id: string; name: string }[];
  pageSize:           number;
}) {
  const router = useRouter();
  const t = useTranslations("admin.presenters");
  const searchParamsUrl = useSearchParams();
  const locale = useLocale();
  const dir = locale === "ar" ? "rtl" : "ltr";

  const [q,          setQ]          = useState(initialQ);
  const [mode,       setMode]       = useState(initialMode     || "all");
  const [stationIds, setStationIds] = useState<string[]>(initialStationIds);
  const [status,     setStatus]     = useState(initialStatus   || "all");
  const [sort,       setSort]       = useState(initialSort     || "newest");
  const [validity,   setValidity]   = useState(initialValidity || "all");

  // Sync from URL when navigating externally (browser back/forward, clear-all)
  useEffect(() => { setQ(initialQ); },                                   [initialQ]);
  useEffect(() => { setMode(initialMode         || "all"); },            [initialMode]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setStationIds(initialStationIds); },                 [initialStationIds.join(",")]);
  useEffect(() => { setStatus(initialStatus     || "all"); },            [initialStatus]);
  useEffect(() => { setSort(initialSort         || "newest"); },         [initialSort]);
  useEffect(() => { setValidity(initialValidity || "all"); },            [initialValidity]);

  // Debounced search — 400ms
  useEffect(() => {
    const handler = setTimeout(() => {
      if (q !== initialQ) applyFilters({ newQ: q });
    }, 400);
    return () => clearTimeout(handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const applyFilters = (overrides: {
    newQ?: string;
    newMode?: string;
    newStationIds?: string[];
    newStatus?: string;
    newSort?: string;
    newValidity?: string;
  }) => {
    const params = new URLSearchParams(searchParamsUrl.toString());

    // Remove legacy single-select param
    params.delete("stationId");

    const finalQ = overrides.newQ !== undefined ? overrides.newQ : q;
    if (finalQ.trim()) params.set("q", finalQ.trim()); else params.delete("q");

    const finalMode = overrides.newMode !== undefined ? overrides.newMode : mode;
    if (finalMode && finalMode !== "all") params.set("mode", finalMode); else params.delete("mode");

    const finalStationIds = overrides.newStationIds !== undefined ? overrides.newStationIds : stationIds;
    if (finalStationIds.length > 0) params.set("stationIds", finalStationIds.join(","));
    else params.delete("stationIds");

    const finalStatus = overrides.newStatus !== undefined ? overrides.newStatus : status;
    if (finalStatus && finalStatus !== "all") params.set("status", finalStatus); else params.delete("status");

    const finalSort = overrides.newSort !== undefined ? overrides.newSort : sort;
    if (finalSort && finalSort !== "newest") params.set("sort", finalSort); else params.delete("sort");

    const finalValidity = overrides.newValidity !== undefined ? overrides.newValidity : validity;
    if (finalValidity && finalValidity !== "all") params.set("validity", finalValidity); else params.delete("validity");

    if (pageSize !== 20) params.set("pageSize", pageSize.toString());
    params.delete("page");

    router.push(`/admin/presenters?${params.toString()}`);
  };

  const clearAll = () => {
    setQ(""); setMode("all"); setStationIds([]);
    setStatus("all"); setSort("newest"); setValidity("all");
    const params = new URLSearchParams();
    if (pageSize !== 20) params.set("pageSize", pageSize.toString());
    router.push(`/admin/presenters?${params.toString()}`);
  };

  // Station options: "none" (غير مرتبط بمحطة) is a real selectable value
  const stationOptions: MultiSmartSelectOption[] = [
    { value: "none", label: t("filterNotLinked") },
    ...allStations.map(s => ({ value: s.id, label: s.name })),
  ];

  return (
    <div dir={dir} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 mb-6 shadow-xl">
      <div className="flex flex-col gap-5">

        {/* Search */}
        <SearchFilter
          value={q}
          onChange={setQ}
          placeholder={t("searchPlaceholder")}
        />

        {/* Filters Grid — row 1 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">

          {/* Mode */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">{t("filterAccountType")}</label>
            <SegmentedFilter
              value={mode}
              options={[
                { value: "all",            label: t("filterAll")           },
                { value: "SINGLE_STATION", label: t("filterSingleStation")     },
                { value: "MULTI_STATION",  label: t("filterMultiStation") },
                { value: "DIRECT_DJ",      label: t("filterDirectDj")       },
              ]}
              onChange={(val) => { setMode(val); applyFilters({ newMode: val }); }}
            />
          </div>

          {/* Status */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">{t("filterStatus")}</label>
            <SegmentedFilter
              value={status}
              options={[
                { value: "all",      label: t("filterAll")    },
                { value: "active",   label: t("filterActive")     },
                { value: "inactive", label: t("filterInactive") },
              ]}
              onChange={(val) => { setStatus(val); applyFilters({ newStatus: val }); }}
            />
          </div>

          {/* Station — multi-select (stationIds param), includes special "none" option */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">{t("filterStation")}</label>
            <MultiSmartSelect
              options={stationOptions}
              values={stationIds}
              onChange={(ids) => {
                setStationIds(ids);
                applyFilters({ newStationIds: ids });
              }}
              placeholder={t("filterAllStations")}
            />
          </div>

        </div>

        {/* Filters Grid — row 2: Sort + Validity */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* Sort */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">{t("filterSort")}</label>
            <SegmentedFilter
              value={sort}
              options={[
                { value: "newest",   label: t("filterNewest")           },
                { value: "oldest",   label: t("filterOldest")           },
                { value: "name",     label: t("filterNameAZ")        },
                { value: "username", label: t("filterUsernameAZ") },
              ]}
              onChange={(val) => { setSort(val); applyFilters({ newSort: val }); }}
            />
          </div>

          {/* Validity */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">{t("filterValidity")}</label>
            <SegmentedFilter
              value={validity}
              options={[
                { value: "all",      label: t("filterAll")              },
                { value: "valid",    label: t("filterValidNow")         },
                { value: "expired",  label: t("filterExpired")            },
                { value: "expiring", label: t("filterExpiring7Days") },
                { value: "none",     label: t("filterNoValidity")       },
              ]}
              onChange={(val) => { setValidity(val); applyFilters({ newValidity: val }); }}
            />
          </div>

        </div>

      </div>

      {/* Clear All */}
      {(searchParamsUrl.toString() !== "" && searchParamsUrl.toString() !== `pageSize=${pageSize}`) && (
        <div className="flex justify-start mt-5 pt-4 border-t border-neutral-800">
          <ClearFiltersButton onClick={clearAll} label={t("clearAllFilters")} />
        </div>
      )}
    </div>
  );
}
