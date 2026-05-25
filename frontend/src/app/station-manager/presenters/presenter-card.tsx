"use client";

import { useState } from "react";
import { updateStationPresenter, changePresenterPassword, deactivatePresenter } from "./actions";
import { StatusBadge } from "@/components/ui/StatusBadge";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StationLink { stationId: string; stationName: string; linkActive: boolean }

export interface PresenterRowClient {
  id: string;
  name: string | null;
  username: string;
  email: string | null;
  phone: string | null;
  presenterMode: string;
  isActive: boolean;
  stationLinks: StationLink[];
}

interface Props {
  presenter: PresenterRowClient;
  assignedStationIds: string[];
}

// ── PresenterCard ─────────────────────────────────────────────────────────────

export function PresenterCard({ presenter: p, assignedStationIds }: Props) {
  const [panel, setPanel] = useState<"none" | "edit" | "pw">("none");
  const [msg, setMsg]     = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy]   = useState(false);

  const isSingle = p.presenterMode === "SINGLE_STATION";
  const isMulti  = p.presenterMode === "MULTI_STATION";

  const assignedSet   = new Set(assignedStationIds);
  const visibleLinks  = p.stationLinks.filter((l) => assignedSet.has(l.stationId));
  const primaryLink   = visibleLinks.find((l) => l.linkActive) ?? visibleLinks[0];




  // ── Action handlers ─────────────────────────────────────────────────────────

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const fd = new FormData(e.currentTarget);
    const res = await updateStationPresenter(fd);
    setBusy(false);
    if (res.error) setMsg({ type: "err", text: res.error });
    else { setMsg({ type: "ok", text: "تم تعديل بيانات المذيع بنجاح." }); setPanel("none"); }
  }

  async function handlePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const fd = new FormData(e.currentTarget);
    const res = await changePresenterPassword(fd);
    setBusy(false);
    if (res.error) setMsg({ type: "err", text: res.error });
    else { setMsg({ type: "ok", text: "تم تغيير كلمة مرور المذيع بنجاح." }); setPanel("none"); }
  }

  async function handleDeactivate() {
    if (!primaryLink) return;
    setBusy(true); setMsg(null);
    const res = await deactivatePresenter(p.id, primaryLink.stationId);
    setBusy(false);
    if (res.error) setMsg({ type: "err", text: res.error });
    else setMsg({ type: "ok", text: "تم تعطيل الوصول بنجاح." });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="bg-slate-900 border border-slate-700/40 rounded-2xl overflow-hidden">

      {/* Inline message */}
      {msg && (
        <div className={`px-5 pt-3 text-xs font-medium ${msg.type === "ok" ? "text-emerald-400" : "text-red-400"}`}>
          {msg.type === "ok" ? "✅" : "⚠️"} {msg.text}
        </div>
      )}

      {/* Main row */}
      <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-slate-100">{p.name ?? p.username}</span>
            <StatusBadge
              label={p.presenterMode === "MULTI_STATION" ? "متعدد المحطات" : "محطة واحدة"}
              variant={p.presenterMode === "MULTI_STATION" ? "info" : "neutral"}
              dot
            />
            <StatusBadge
              label={p.isActive ? "نشط" : "معطّل"}
              variant={p.isActive ? "success" : "neutral"}
              dot
            />
          </div>
          <p className="text-xs text-slate-500 font-mono mb-1.5">
            {p.username}{p.email ? ` · ${p.email}` : ""}{p.phone ? ` · ${p.phone}` : ""}
          </p>
          {isMulti && (
            <p className="text-[10px] text-purple-400/70 mb-1.5">يمكنك إدارة وصوله لهذه المحطة فقط</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {visibleLinks.map((l) => (
              <StatusBadge
                key={l.stationId}
                label={l.stationName}
                variant={l.linkActive ? "success" : "neutral"}
              />
            ))}
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-wrap gap-2 flex-shrink-0">
          {isSingle && (
            <>
              <button
                onClick={() => setPanel(panel === "edit" ? "none" : "edit")}
                className="text-xs border rounded-lg px-3 py-1.5 transition-colors"
                style={panel === "edit" ? { color: "var(--eg-primary)", borderColor: "color-mix(in srgb, var(--eg-primary) 50%, transparent)", background: "color-mix(in srgb, var(--eg-primary) 10%, transparent)" } : { color: "var(--slate-400)", borderColor: "var(--slate-700)" }}
                onMouseEnter={e => { if(panel !== "edit") { e.currentTarget.style.color = "var(--eg-primary)"; e.currentTarget.style.borderColor = "color-mix(in srgb, var(--eg-primary) 40%, transparent)"; } }}
                onMouseLeave={e => { if(panel !== "edit") { e.currentTarget.style.color = ""; e.currentTarget.style.borderColor = ""; } }}>
                {panel === "edit" ? "▲ إغلاق" : "✏️ تعديل"}
              </button>
              <button
                onClick={() => setPanel(panel === "pw" ? "none" : "pw")}
                className={`text-xs border rounded-lg px-3 py-1.5 transition-colors ${
                  panel === "pw"
                    ? "text-amber-300 border-amber-500/50 bg-amber-950/40"
                    : "text-slate-400 hover:text-amber-300 border-slate-700 hover:border-amber-500/40"
                }`}>
                {panel === "pw" ? "▲ إغلاق" : "🔑 كلمة المرور"}
              </button>
            </>
          )}
          {primaryLink?.linkActive && (
            <button
              onClick={handleDeactivate}
              disabled={busy}
              className="text-xs text-orange-400 hover:text-orange-300 border border-orange-700/30 hover:border-orange-500/50 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50">
              {isSingle ? "🚫 تعطيل المذيع" : "🚫 إزالة من المحطة"}
            </button>
          )}
        </div>
      </div>

      {/* ── Edit panel ── */}
      {panel === "edit" && isSingle && primaryLink && (
        <div className="border-t border-slate-700/50 bg-slate-800/40 px-5 py-5">
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--eg-primary)" }}>تعديل بيانات المذيع</h3>
          <form onSubmit={handleUpdate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input type="hidden" name="presenterId" value={p.id} />
            <input type="hidden" name="stationId"   value={primaryLink.stationId} />
            <FField label="الاسم الكامل"      name="name"  type="text"  defaultValue={p.name ?? ""} />
            <FField label="البريد الإلكتروني" name="email" type="email" defaultValue={p.email ?? ""} dir="ltr" />
            <FField label="رقم الهاتف"         name="phone" type="text"  defaultValue={p.phone ?? ""} dir="ltr" />
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">الحالة</label>
              <select name="isActive" defaultValue={p.isActive ? "true" : "false"}
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-slate-100 outline-none transition-colors"
                onFocus={e => { e.currentTarget.style.borderColor = "var(--eg-primary)"; }}
                onBlur={e  => { e.currentTarget.style.borderColor = "var(--eg-border)"; }}
                style={{ borderColor: "var(--eg-border)" }}>
                <option value="true">نشط</option>
                <option value="false">معطّل</option>
              </select>
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <button type="submit" disabled={busy}
                className="disabled:opacity-50 text-white font-semibold text-sm rounded-xl px-5 py-2.5 transition-colors"
                style={{ background: "var(--eg-primary)" }}>
                {busy ? "جارٍ الحفظ..." : "حفظ التعديلات"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Password panel ── */}
      {panel === "pw" && isSingle && primaryLink && (
        <div className="border-t border-slate-700/50 bg-slate-800/40 px-5 py-5">
          <h3 className="text-sm font-semibold text-amber-300 mb-4">تغيير كلمة المرور</h3>
          <form onSubmit={handlePassword} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input type="hidden" name="presenterId" value={p.id} />
            <input type="hidden" name="stationId"   value={primaryLink.stationId} />
            <FField label="كلمة المرور الجديدة *"  name="newPassword"     type="password" placeholder="6 أحرف على الأقل" dir="ltr" required />
            <FField label="تأكيد كلمة المرور *"    name="confirmPassword" type="password" placeholder="أعد الإدخال" dir="ltr" required />
            <div className="sm:col-span-2 flex justify-end">
              <button type="submit" disabled={busy}
                className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold text-sm rounded-xl px-5 py-2.5 transition-colors">
                {busy ? "جارٍ التغيير..." : "تغيير كلمة المرور"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ── Shared input ──────────────────────────────────────────────────────────────

function FField({ label, name, type, placeholder, defaultValue, dir: d, required }: {
  label: string; name: string; type: string;
  placeholder?: string; defaultValue?: string; dir?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1">{label}</label>
      <input name={name} type={type} placeholder={placeholder} defaultValue={defaultValue}
        dir={d} required={required}
        className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none transition-colors"
        onFocus={e => { e.currentTarget.style.borderColor = "var(--eg-primary)"; }}
        onBlur={e  => { e.currentTarget.style.borderColor = "var(--eg-border)"; }}
        style={{ borderColor: "var(--eg-border)" }} />
    </div>
  );
}
