"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { DATE_LOCALES } from "@/i18n/config";
import type { Locale } from "@/i18n/config";
import { MultiSmartSelect }   from "@/components/ui/MultiSmartSelect";
import { SegmentedFilter }    from "@/components/ui/SegmentedFilter";
import { ClearFiltersButton } from "@/components/ui/ClearFiltersButton";

type Item = { id: string; name: string };

export function ScheduleFilterBar({
  allStations, allPresenters, initialStationIds, initialPresenterIds, initialRecurrence,
  initialTimeFrom, initialTimeTo, weekStartIso, isCurrentWeek,
}: {
  allStations: Item[]; allPresenters: Item[];
  initialStationIds: string[]; initialPresenterIds: string[]; initialRecurrence: string;
  initialTimeFrom: string; initialTimeTo: string;
  weekStartIso: string; isCurrentWeek: boolean;
}) {
  const router = useRouter();
  const sp     = useSearchParams();
  const t = useTranslations('admin.schedule');
  const locale = useLocale();
  const dateLocale = DATE_LOCALES[locale as Locale] || locale;

  const RECURRENCE_OPTIONS = [
    { value: "all",           label: t('recurrenceAll')          },
    { value: "DAILY",         label: t('recurrenceDaily')        },
    { value: "WEEKLY",        label: t('recurrenceWeekly')       },
    { value: "SELECTED_DAYS", label: t('recurrenceSelectedDays') },
    { value: "ONE_TIME",      label: t('recurrenceOneTime')      },
  ];

  // ── Local state for time range (debounced push) ────────────────────────────
  const timeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const datepickerRef = useRef<HTMLInputElement>(null);

  const [localTimeFrom, setLocalTimeFrom] = useState(initialTimeFrom);
  const [localTimeTo,   setLocalTimeTo]   = useState(initialTimeTo);

  useEffect(() => { setLocalTimeFrom(initialTimeFrom); }, [initialTimeFrom]);
  useEffect(() => { setLocalTimeTo(initialTimeTo);     }, [initialTimeTo]);

  // ── URL builder ─────────────────────────────────────────────────────────────
  const buildUrl = useCallback((ov: { stations?: string[]; presenters?: string[]; recurrence?: string; timeFrom?: string; timeTo?: string; weekOf?: string }) => {
    const p = new URLSearchParams(sp.toString());
    if (ov.stations   !== undefined) { ov.stations.length   > 0 ? p.set("stations",   ov.stations.join(","))   : p.delete("stations");   }
    if (ov.presenters !== undefined) { ov.presenters.length > 0 ? p.set("presenters", ov.presenters.join(",")) : p.delete("presenters"); }
    if (ov.recurrence !== undefined) { ov.recurrence && ov.recurrence !== "all" ? p.set("recurrence", ov.recurrence) : p.delete("recurrence"); }
    if (ov.timeFrom   !== undefined) { ov.timeFrom ? p.set("timeFrom", ov.timeFrom) : p.delete("timeFrom"); }
    if (ov.timeTo     !== undefined) { ov.timeTo   ? p.set("timeTo",   ov.timeTo)   : p.delete("timeTo");   }
    if (ov.weekOf     !== undefined) { ov.weekOf   ? p.set("weekOf",   ov.weekOf)   : p.delete("weekOf");   }
    p.delete("page");
    return `/admin/schedule?${p.toString()}`;
  }, [sp]);

  const push = (url: string) => router.push(url, { scroll: false });

  // ── Filter apply helpers ───────────────────────────────────────────────────
  const applyStations   = useCallback((ids: string[]) => push(buildUrl({ stations:   ids })), [buildUrl]);
  const applyPresenters = useCallback((ids: string[]) => push(buildUrl({ presenters: ids })), [buildUrl]);

  const recurrence = initialRecurrence || "all";
  const hasFilters = !!(initialStationIds.length || initialPresenterIds.length || recurrence !== "all" || initialTimeFrom || initialTimeTo);

  const clearAll = () => {
    setLocalTimeFrom(""); setLocalTimeTo("");
    push("/admin/schedule");
  };

  // ── Week navigation helpers ────────────────────────────────────────────────
  const wkStart    = new Date(weekStartIso + "T00:00:00");
  const wkEnd      = new Date(wkStart); wkEnd.setDate(wkStart.getDate() + 6);
  const prevWkDate = new Date(wkStart); prevWkDate.setDate(wkStart.getDate() - 7);
  const nextWkDate = new Date(wkStart); nextWkDate.setDate(wkStart.getDate() + 7);
  const toLocalISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const prevWkStr  = toLocalISO(prevWkDate);
  const nextWkStr  = toLocalISO(nextWkDate);
  const fmtDate    = (d: Date) => d.toLocaleDateString(dateLocale, { weekday: "short", month: "short", day: "numeric" });

  // ── Time range ────────────────────────────────────────────────────────────
  const TIME_PRESETS = [
    { label: t('timeAll'),       from: "",      to: ""      },
    { label: t('timeNight'),     from: "00:00", to: "06:00" },
    { label: t('timeMorning'),   from: "06:00", to: "12:00" },
    { label: t('timeAfternoon'), from: "12:00", to: "18:00" },
    { label: t('timeEvening'),   from: "18:00", to: "24:00" },
  ];

  const activePreset = TIME_PRESETS.find(p => p.from === initialTimeFrom && p.to === initialTimeTo);
  const pushTime = (from: string, to: string) => push(buildUrl({ timeFrom: from, timeTo: to }));
  const onTimeInput = (from: string, to: string) => {
    if (timeTimer.current) clearTimeout(timeTimer.current);
    timeTimer.current = setTimeout(() => pushTime(from, to), 600);
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 space-y-3">

      {/* ── Week navigation row ── */}
      <div className="flex items-center justify-between gap-3">

        {/* Prev week */}
        <button type="button" onClick={() => push(buildUrl({ weekOf: prevWkStr }))}
          className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 border border-neutral-700 hover:border-neutral-500 text-neutral-300 hover:text-neutral-100 text-sm font-medium rounded-xl transition-all select-none">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          <span>{t('previousWeek')}</span>
        </button>

        {/* Center: date range + picker + today */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <button type="button"
              onClick={() => (datepickerRef.current as any)?.showPicker?.()}
              className="flex items-center gap-2.5 px-5 py-2 bg-neutral-800 hover:bg-neutral-750 border border-neutral-700 hover:border-violet-600/60 text-neutral-100 text-sm font-semibold rounded-xl transition-all cursor-pointer select-none whitespace-nowrap">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-violet-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span>{fmtDate(wkStart)}</span>
              <span className="text-neutral-600">—</span>
              <span>{fmtDate(wkEnd)}</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <input
              ref={datepickerRef}
              type="date"
              value={weekStartIso}
              onChange={e => e.target.value && push(buildUrl({ weekOf: e.target.value }))}
              className="absolute inset-0 opacity-0 pointer-events-none w-0 h-0"
              tabIndex={-1}
            />
          </div>

          {!isCurrentWeek && (
            <button type="button" onClick={() => push(buildUrl({ weekOf: "" }))}
              className="px-3 py-2 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-600/40 hover:border-violet-500/60 text-violet-300 text-xs font-medium rounded-xl transition-all whitespace-nowrap select-none">
              {t('todayBtn')}
            </button>
          )}
        </div>

        {/* Next week */}
        <button type="button" onClick={() => push(buildUrl({ weekOf: nextWkStr }))}
          className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 border border-neutral-700 hover:border-neutral-500 text-neutral-300 hover:text-neutral-100 text-sm font-medium rounded-xl transition-all select-none">
          <span>{t('nextWeek')}</span>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>

      </div>

      {/* ── Filters row ── */}
      <div className="flex items-center gap-2 flex-wrap">

        {/* Station multi-select — entity selector */}
        <MultiSmartSelect
          options={allStations.map(s => ({ value: s.id, label: s.name }))}
          values={initialStationIds}
          onChange={applyStations}
          placeholder={t('stationsPlaceholder')}
        />

        {/* Presenter multi-select — entity selector */}
        <MultiSmartSelect
          options={allPresenters.map(p => ({ value: p.id, label: p.name }))}
          values={initialPresenterIds}
          onChange={applyPresenters}
          placeholder={t('presentersPlaceholder')}
        />

        {/* Recurrence — fixed values, mutually exclusive → SegmentedFilter */}
        <SegmentedFilter
          value={recurrence}
          options={RECURRENCE_OPTIONS}
          onChange={v => push(buildUrl({ recurrence: v }))}
        />

        {/* ── Time range filter — kept as-is (no shared component for time range) ── */}
        <div className="flex items-center gap-2 bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-1.5 flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-neutral-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          {TIME_PRESETS.map(preset => (
            <button key={preset.label} type="button"
              onClick={() => { setLocalTimeFrom(preset.from); setLocalTimeTo(preset.to); pushTime(preset.from, preset.to); }}
              className={`text-xs font-medium px-2.5 py-1 rounded-lg transition-all whitespace-nowrap ${
                activePreset?.label === preset.label
                  ? "bg-amber-600/25 border border-amber-600/40 text-amber-300"
                  : "text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
              }`}>
              {preset.label}
            </button>
          ))}
          <span className="text-neutral-700 text-xs">|</span>
          <input
            type="time" value={localTimeFrom}
            onChange={e => { setLocalTimeFrom(e.target.value); onTimeInput(e.target.value, localTimeTo); }}
            className="bg-transparent text-xs text-neutral-300 outline-none w-[72px] cursor-pointer [color-scheme:dark]"
          />
          <span className="text-neutral-600 text-xs">—</span>
          <input
            type="time" value={localTimeTo}
            onChange={e => { setLocalTimeTo(e.target.value); onTimeInput(localTimeFrom, e.target.value); }}
            className="bg-transparent text-xs text-neutral-300 outline-none w-[72px] cursor-pointer [color-scheme:dark]"
          />
          {(initialTimeFrom || initialTimeTo) && (
            <button type="button" onClick={() => { setLocalTimeFrom(""); setLocalTimeTo(""); pushTime("", ""); }}
              className="text-neutral-500 hover:text-red-400 transition-colors ml-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>

        {/* Clear all */}
        {hasFilters && (
          <ClearFiltersButton onClick={clearAll} label={t('clearAll')} />
        )}

      </div>
    </div>
  );
}
