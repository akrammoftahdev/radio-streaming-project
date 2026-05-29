"use client";

import React, { useState, useEffect, useCallback } from "react";
import { type DspParams, DEFAULT_DSP_PARAMS, DSP_PARAM_META, DSP_GROUPS, DSP_GROUP_ENABLE_KEY } from "@/lib/dsp-presets";

type PresetInfo = { id: string; name: string; isSystem: boolean; params: DspParams };

interface DspPanelProps {
  /** Current live DSP params applied to the mic chain */
  currentParams: DspParams;
  /** Called when user changes a parameter — parent applies to Web Audio nodes */
  onParamsChange: (params: DspParams) => void;
  /** Whether DSP processing is bypassed */
  bypassed: boolean;
  /** Toggle bypass on/off */
  onBypassToggle: () => void;
  /** Whether the mic is currently open (DSP is meaningless without mic) */
  isMicOpen: boolean;
}

export default function DspPanel({
  currentParams,
  onParamsChange,
  bypassed,
  onBypassToggle,
  isMicOpen,
}: DspPanelProps) {
  const [presets, setPresets]         = useState<PresetInfo[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [loading, setLoading]        = useState(true);
  const [saving, setSaving]          = useState(false);
  const [saveName, setSaveName]      = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [error, setError]            = useState("");

  // Fetch presets from API
  const fetchPresets = useCallback(async () => {
    try {
      const res = await fetch("/api/studio/dsp-presets");
      if (!res.ok) throw new Error("Failed to fetch presets");
      const data = await res.json();
      setPresets(data.presets);
      setActivePresetId(data.activeDspPresetId);
    } catch {
      console.warn("[DSP] Failed to load presets");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPresets(); }, [fetchPresets]);

  // Select a preset
  const selectPreset = async (preset: PresetInfo) => {
    onParamsChange(preset.params);
    setActivePresetId(preset.id);
    // Persist selection
    try {
      await fetch("/api/studio/dsp-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setActive: preset.id }),
      });
    } catch { /* best-effort */ }
  };

  // Save current settings as new preset
  const handleSave = async () => {
    if (!saveName.trim()) { setError("أدخل اسم الإعداد"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/studio/dsp-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: saveName.trim(), params: currentParams }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "فشل الحفظ");
      }
      const newPreset = await res.json();
      setPresets(prev => [...prev, newPreset]);
      setActivePresetId(newPreset.id);
      // Also persist as active
      await fetch("/api/studio/dsp-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setActive: newPreset.id }),
      }).catch(() => {});
      setSaveName(""); setShowSaveForm(false);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally { setSaving(false); }
  };

  // Delete a custom preset
  const handleDelete = async (presetId: string) => {
    try {
      await fetch(`/api/studio/dsp-presets?id=${presetId}`, { method: "DELETE" });
      setPresets(prev => prev.filter(p => p.id !== presetId));
      if (activePresetId === presetId) setActivePresetId(null);
    } catch { /* best-effort */ }
  };

  // Update a single parameter
  const updateParam = (key: keyof DspParams, value: number) => {
    const newParams = { ...currentParams, [key]: value };
    onParamsChange(newParams);
    // Clear active preset since user modified params
    if (activePresetId) setActivePresetId(null);
  };

  return (
    <div className="w-full bg-neutral-900 border border-violet-500/20 rounded-2xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎛️</span>
          <span className="text-sm font-semibold text-violet-400">معالجة صوت المايك (DSP)</span>
          {!isMicOpen && (
            <span className="text-[10px] text-neutral-500 bg-neutral-800 px-1.5 py-0.5 rounded-full">المايك مغلق</span>
          )}
        </div>
        <button
          onClick={onBypassToggle}
          className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
            bypassed
              ? "bg-red-500/20 text-red-400 border border-red-500/30"
              : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
          }`}
        >
          {bypassed ? "⏸ تجاوز (مُعطّل)" : "✓ مُفعّل"}
        </button>
      </div>

      <div className={`transition-opacity ${bypassed ? "opacity-40 pointer-events-none" : ""}`}>
        {/* Preset selector */}
        <div className="px-4 py-3 border-b border-neutral-800/50">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">الإعدادات المحفوظة</span>
            {loading && <span className="w-3 h-3 border-2 border-violet-500/30 border-t-violet-400 rounded-full animate-spin" />}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {presets.map(p => (
              <div key={p.id} className="relative group">
                <button
                  onClick={() => selectPreset(p)}
                  className={`px-2.5 py-1.5 text-[11px] font-medium rounded-lg transition-all ${
                    activePresetId === p.id
                      ? "bg-violet-600 text-white shadow-md shadow-violet-500/20"
                      : "bg-neutral-800 text-neutral-300 hover:bg-violet-500/10 hover:text-violet-300 border border-neutral-700"
                  }`}
                >
                  {p.isSystem ? "📦 " : "👤 "}{p.name}
                </button>
                {!p.isSystem && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 text-white text-[8px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    title="حذف"
                  >✕</button>
                )}
              </div>
            ))}
          </div>
          {/* Save new preset */}
          <div className="mt-2">
            {!showSaveForm ? (
              <button
                onClick={() => setShowSaveForm(true)}
                className="text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
              >
                + حفظ الإعدادات الحالية كإعداد جديد
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  placeholder="اسم الإعداد الجديد..."
                  className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-violet-500/40"
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                />
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium rounded-lg disabled:opacity-50"
                >
                  {saving ? "..." : "حفظ"}
                </button>
                <button
                  onClick={() => { setShowSaveForm(false); setSaveName(""); setError(""); }}
                  className="text-xs text-neutral-500 hover:text-neutral-300"
                >إلغاء</button>
              </div>
            )}
            {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
          </div>
        </div>

        {/* Parameter groups */}
        <div className="divide-y divide-neutral-800/50">
          {DSP_GROUPS.map(group => {
            const enableKey = DSP_GROUP_ENABLE_KEY[group.key];
            const isEnabled = enableKey ? currentParams[enableKey] !== false : true;
            return (
            <div key={group.key}>
              <div className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-neutral-800/30 transition-colors">
                {/* Toggle switch */}
                <button
                  onClick={() => {
                    if (enableKey) {
                      const newParams = { ...currentParams, [enableKey]: !isEnabled };
                      onParamsChange(newParams);
                      if (activePresetId) setActivePresetId(null);
                    }
                  }}
                  className="flex items-center gap-2 flex-1 min-w-0"
                >
                  <div dir="ltr" className={`relative w-8 h-[18px] rounded-full transition-colors flex-shrink-0 ${isEnabled ? 'bg-violet-600' : 'bg-neutral-700'}`}>
                    <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-[left] duration-200 ${isEnabled ? 'left-[16px]' : 'left-[2px]'}`} />
                  </div>
                  <span className={`text-xs font-medium transition-colors ${isEnabled ? 'text-neutral-200' : 'text-neutral-500'}`}>{group.label}</span>
                </button>
                {/* Expand/collapse chevron */}
                <button
                  onClick={() => setExpandedGroup(expandedGroup === group.key ? null : group.key)}
                  className="p-1 hover:bg-neutral-700/50 rounded transition-colors"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`w-3.5 h-3.5 text-neutral-500 transition-transform ${expandedGroup === group.key ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
                  ><polyline points="6 9 12 15 18 9"></polyline></svg>
                </button>
              </div>
              {expandedGroup === group.key && (
                <div className={`px-4 pb-3 space-y-3 transition-opacity ${!isEnabled ? 'opacity-40 pointer-events-none' : ''}`}>
                  {group.params.map(paramKey => {
                    const meta = DSP_PARAM_META[paramKey];
                    const value = currentParams[paramKey];
                    return (
                      <div key={paramKey} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] text-neutral-400">{meta.label}</label>
                          <span className="text-[10px] text-neutral-500 tabular-nums font-mono">
                            {typeof value === 'number' ? (Number.isInteger(meta.step) || meta.step >= 1 ? Math.round(value) : value.toFixed(meta.step < 0.01 ? 3 : meta.step < 0.1 ? 2 : 1)) : value}
                            {meta.unit ? ` ${meta.unit}` : ""}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={meta.min}
                          max={meta.max}
                          step={meta.step}
                          value={value}
                          onChange={e => updateParam(paramKey, parseFloat(e.target.value))}
                          className="w-full h-1 accent-violet-500 cursor-pointer"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            );
          })}
        </div>

        {/* Reset to defaults */}
        <div className="px-4 py-2 border-t border-neutral-800/50">
          <button
            onClick={() => { onParamsChange(DEFAULT_DSP_PARAMS); setActivePresetId(null); }}
            className="text-[10px] text-neutral-600 hover:text-neutral-400 transition-colors"
          >
            ↩ إعادة تعيين لافتراضي
          </button>
        </div>
      </div>
    </div>
  );
}
