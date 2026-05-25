"use client";

import { useState } from "react";
import { createProgram } from "./actions";

interface Station  { id: string; name: string; slug: string; }
interface Presenter { id: string; name: string | null; username: string; }

interface Props {
  stations:              Station[];
  allPresenters:         Presenter[];
  stationPresenterMap:   Record<string, string[]>; // stationId → presenterId[]
  createError?:          string;
}

const inp = "w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500 transition-all text-sm disabled:opacity-40 disabled:cursor-not-allowed";

export default function ProgramCreateForm({ stations, allPresenters, stationPresenterMap, createError }: Props) {
  const [selectedStationId, setSelectedStationId] = useState("");

  // Eligible presenters: those with an active PresenterStation for the selected station
  const eligibleIds   = selectedStationId ? new Set(stationPresenterMap[selectedStationId] ?? []) : new Set<string>();
  const eligible      = selectedStationId ? allPresenters.filter(p => eligibleIds.has(p.id)) : [];
  const hasStation    = selectedStationId !== "";
  const hasEligible   = eligible.length > 0;

  return (
    <section className="bg-slate-800 border border-slate-700/50 rounded-2xl p-6 shadow-xl">
      <h2 className="text-base font-semibold text-slate-200 mb-4 flex items-center gap-2">
        <span>📺</span> إضافة برنامج جديد
      </h2>

      {/* Error banner */}
      {createError && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-4 text-red-400 text-sm mb-4">
          <span className="text-base flex-shrink-0">❌</span>
          <span>{decodeURIComponent(createError)}</span>
        </div>
      )}

      <form action={createProgram} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Title */}
          <div className="space-y-1.5">
            <label htmlFor="prog-title" className="text-sm font-medium text-slate-300">
              العنوان <span className="text-red-400">*</span>
            </label>
            <input
              id="prog-title"
              name="title"
              type="text"
              required
              placeholder="برنامج الصباح"
              className={inp}
            />
          </div>

          {/* Station select — drives presenter dropdown */}
          <div className="space-y-1.5">
            <label htmlFor="prog-stationId" className="text-sm font-medium text-slate-300">
              المحطة <span className="text-red-400">*</span>
            </label>
            <select
              id="prog-stationId"
              name="stationId"
              required
              value={selectedStationId}
              onChange={e => setSelectedStationId(e.target.value)}
              className={inp}
            >
              <option value="">— اختر محطة —</option>
              {stations.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.slug})</option>
              ))}
            </select>
          </div>

          {/* Presenter dropdown — filtered by selected station */}
          <div className="space-y-1.5">
            <label htmlFor="prog-presenterId" className="text-sm font-medium text-slate-300">
              المذيع <span className="text-red-400">*</span>
            </label>
            <select
              id="prog-presenterId"
              name="presenterId"
              required
              disabled={!hasStation || !hasEligible}
              className={inp}
            >
              {!hasStation ? (
                <option value="">اختر المحطة أولاً</option>
              ) : !hasEligible ? (
                <option value="">لا يوجد مذيعون مرتبطون بهذه المحطة</option>
              ) : (
                <>
                  <option value="">— اختر مذيعاً —</option>
                  {eligible.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name || p.username} ({p.username})
                    </option>
                  ))}
                </>
              )}
            </select>
            {!hasStation && (
              <p className="text-xs text-amber-400/80 mt-1">⬆ اختر المحطة لتظهر قائمة المذيعين المرتبطين بها.</p>
            )}
            {hasStation && !hasEligible && (
              <p className="text-xs text-red-400/80 mt-1">
                لا يوجد مذيعون مرتبطون بهذه المحطة. ارتبط مذيعاً أولاً من{" "}
                <a href="/admin/presenters" className="underline hover:text-red-300">صفحة تعديل المذيع</a>.
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label htmlFor="prog-description" className="text-sm font-medium text-slate-300">الوصف</label>
            <input
              id="prog-description"
              name="description"
              type="text"
              placeholder="وصف مختصر للبرنامج"
              className={inp}
            />
          </div>
        </div>

        {/* Validity date range */}
        <div className="border-t border-slate-700/40 pt-4">
          <p className="text-xs font-medium text-slate-400 mb-3 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            نافذة صلاحية البرنامج <span className="text-slate-600 font-normal">(اختياري — اتركهما فارغَين للبرنامج الدائم)</span>
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="prog-validFrom" className="text-sm font-medium text-slate-300">📅 تاريخ البدء</label>
              <input id="prog-validFrom" name="validFrom" type="date" className={inp} dir="ltr" />
              <p className="text-xs text-slate-600">فارغ = يبدأ البرنامج فوراً</p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="prog-validUntil" className="text-sm font-medium text-slate-300">📅 تاريخ الانتهاء</label>
              <input id="prog-validUntil" name="validUntil" type="date" className={inp} dir="ltr" />
              <p className="text-xs text-slate-600">فارغ = برنامج دائم غير محدود المدة</p>
            </div>
          </div>
        </div>

        <p className="text-xs text-amber-500/80">
          ⚠️ المذيعون من نوع DJ مباشر لا يظهرون هنا. يجب أن يكون المذيع مرتبطاً بالمحطة أولاً.
        </p>

        <button
          type="submit"
          disabled={!hasStation || !hasEligible}
          className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors shadow-lg shadow-purple-500/20 text-sm"
        >
          إنشاء البرنامج
        </button>
      </form>
    </section>
  );
}
