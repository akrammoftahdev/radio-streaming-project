"use client";

import { useState } from "react";
import {
  createMyDirectDjRadio,
  updateMyDirectDjRadio,
  toggleMyDirectDjRadio,
  deleteMyDirectDjRadio,
} from "./actions";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DjRadio = {
  id:        string;
  radioName: string;
  host:      string;
  port:      number;
  djUsername:string;
  mount:     string | null;
  sid:       string | null;
  bitrate:   number;
  isActive:  boolean;
};

interface Props {
  radios:  DjRadio[];
  djError?: string | null;
  djSaved?: string | null;
}

// ── Input style helper ────────────────────────────────────────────────────────

const INPUT = "w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all text-sm";
const LABEL = "text-xs font-medium text-neutral-400 mb-1 block";

// ── Error message map ─────────────────────────────────────────────────────────

const DJ_ERRORS: Record<string, string> = {
  radio_name_required:  "اسم الإذاعة مطلوب.",
  host_required:        "عنوان الخادم (Host) مطلوب.",
  port_invalid:         "رقم المنفذ يجب أن يكون بين 1 و 65535.",
  dj_username_required: "اسم مستخدم DJ مطلوب.",
  password_required:    "كلمة المرور مطلوبة عند الإنشاء.",
  radio_id_required:    "معرّف الإذاعة مفقود.",
  not_found:            "الإذاعة غير موجودة أو ليست ملكك.",
};

// ── Shared form fields component ──────────────────────────────────────────────

function RadioFormFields({ radio }: { radio?: DjRadio }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>اسم الإذاعة *</label>
          <input name="radioName" defaultValue={radio?.radioName ?? ""} placeholder="إذاعة مثال" required className={INPUT} dir="rtl" />
        </div>
        <div>
          <label className={LABEL}>Bitrate (kbps)</label>
          <input name="bitrate" type="number" defaultValue={radio?.bitrate ?? 128} placeholder="128" className={INPUT} dir="ltr" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Host *</label>
          <input name="host" defaultValue={radio?.host ?? ""} placeholder="stream.example.com" required className={INPUT} dir="ltr" />
        </div>
        <div>
          <label className={LABEL}>Port *</label>
          <input name="port" type="number" defaultValue={radio?.port ?? ""} placeholder="8000" required className={INPUT} dir="ltr" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>DJ Username *</label>
          <input name="djUsername" defaultValue={radio?.djUsername ?? ""} placeholder="source" required className={INPUT} dir="ltr" />
        </div>
        <div>
          <label className={LABEL}>
            {radio ? "كلمة المرور (اتركها فارغة للإبقاء)" : "كلمة المرور *"}
          </label>
          <input name="password" type="password" placeholder="••••••••" className={INPUT} dir="ltr" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Mount (اختياري)</label>
          <input name="mount" defaultValue={radio?.mount ?? ""} placeholder="/live" className={INPUT} dir="ltr" />
        </div>
        <div>
          <label className={LABEL}>SID (اختياري)</label>
          <input name="sid" defaultValue={radio?.sid ?? ""} placeholder="1" className={INPUT} dir="ltr" />
        </div>
      </div>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input name="isActive" type="checkbox" defaultChecked={radio ? radio.isActive : true}
          className="w-4 h-4 accent-amber-500 rounded" />
        <span className="text-sm text-neutral-300">تفعيل الإذاعة</span>
      </label>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DirectDjRadiosSection({ radios, djError, djSaved }: Props) {
  const [addOpen,  setAddOpen]  = useState(false);
  const [editId,   setEditId]   = useState<string | null>(null);
  const [delId,    setDelId]    = useState<string | null>(null);

  const errorMsg = djError ? (DJ_ERRORS[djError] ?? `خطأ: ${djError}`) : null;

  const savedMsgs: Record<string, string> = {
    created:     "تم إضافة الإذاعة بنجاح ✅",
    updated:     "تم حفظ التعديلات بنجاح ✅",
    toggled:     "تم تحديث حالة الإذاعة ✅",
    deleted:     "تم حذف الإذاعة ✅",
    deactivated: "تم تعطيل الإذاعة بدلاً من الحذف (مرتبطة بتسجيلات) ✅",
  };
  const savedMsg = djSaved ? (savedMsgs[djSaved] ?? null) : null;

  return (
    <div id="dj-radios" className="bg-neutral-900 border border-amber-500/20 rounded-2xl p-6 md:p-8 shadow-xl mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎙️</span>
          <h2 className="text-lg font-semibold text-neutral-200">إذاعات DJ المباشر</h2>
        </div>
        <button
          onClick={() => { setAddOpen(o => !o); setEditId(null); }}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:border-amber-400/50 rounded-lg transition-colors"
        >
          <span>{addOpen ? "✕ إغلاق" : "+ إضافة إذاعة"}</span>
        </button>
      </div>
      <p className="text-xs text-neutral-500 mb-5">أضف الإذاعات التي تريد الاتصال بها مباشرة من الاستوديو.</p>

      {/* Banners */}
      {savedMsg && (
        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-4 py-3 text-emerald-400 text-sm mb-4">
          {savedMsg}
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">
          <span>❌</span> {errorMsg}
        </div>
      )}

      {/* ── Add new radio form ── */}
      {addOpen && (
        <div className="mb-5 bg-neutral-950/60 border border-amber-500/20 rounded-xl p-5">
          <p className="text-sm font-semibold text-amber-300 mb-4">إذاعة جديدة</p>
          <form action={createMyDirectDjRadio} className="space-y-4">
            <RadioFormFields />
            <div className="flex gap-2 justify-end pt-1">
              <button type="button" onClick={() => setAddOpen(false)}
                className="text-xs text-neutral-500 hover:text-neutral-300 px-3 py-2 transition-colors">
                إلغاء
              </button>
              <button type="submit"
                className="bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-xl px-5 py-2 transition-all">
                حفظ الإذاعة
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Radio cards ── */}
      {radios.length === 0 && !addOpen && (
        <div className="text-center py-10 text-neutral-600 text-sm">
          لا توجد إذاعات بعد. اضغط &quot;+ إضافة إذاعة&quot; للبدء.
        </div>
      )}

      <div className="space-y-3">
        {radios.map(radio => (
          <div key={radio.id} className={`border rounded-xl overflow-hidden transition-colors ${radio.isActive ? "border-neutral-700" : "border-neutral-800 opacity-70"}`}>

            {/* Collapsed header row */}
            <div className="flex items-center gap-3 px-4 py-3 bg-neutral-950/40">
              {/* Active dot */}
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${radio.isActive ? "bg-emerald-400" : "bg-neutral-600"}`} />

              {/* Name + host:port */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-neutral-200 truncate">{radio.radioName}</p>
                <p className="text-xs text-neutral-500 font-mono" dir="ltr">
                  {radio.djUsername}@{radio.host}:{radio.port}
                  {radio.mount ? ` ${radio.mount}` : ""}{radio.sid ? ` SID:${radio.sid}` : ""}
                </p>
              </div>

              {/* Bitrate badge */}
              <span className="text-xs text-neutral-500 bg-neutral-800 px-2 py-0.5 rounded-full font-mono flex-shrink-0">
                {radio.bitrate}k
              </span>

              {/* Active badge */}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${radio.isActive ? "bg-emerald-500/10 text-emerald-400" : "bg-neutral-800 text-neutral-500"}`}>
                {radio.isActive ? "مفعّل" : "معطّل"}
              </span>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* Edit toggle */}
                <button
                  onClick={() => setEditId(id => id === radio.id ? null : radio.id)}
                  className="text-xs text-neutral-400 hover:text-amber-300 px-2 py-1.5 rounded-lg hover:bg-amber-500/10 transition-colors"
                >
                  تعديل
                </button>

                {/* Toggle active */}
                <form action={toggleMyDirectDjRadio}>
                  <input type="hidden" name="radioId" value={radio.id} />
                  <button type="submit"
                    className="text-xs text-neutral-400 hover:text-indigo-300 px-2 py-1.5 rounded-lg hover:bg-indigo-500/10 transition-colors">
                    {radio.isActive ? "تعطيل" : "تفعيل"}
                  </button>
                </form>

                {/* Delete with confirm */}
                {delId === radio.id ? (
                  <div className="flex items-center gap-1">
                    <form action={deleteMyDirectDjRadio}>
                      <input type="hidden" name="radioId" value={radio.id} />
                      <button type="submit"
                        className="text-xs text-red-400 hover:text-red-300 px-2 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors font-medium">
                        تأكيد
                      </button>
                    </form>
                    <button onClick={() => setDelId(null)}
                      className="text-xs text-neutral-500 hover:text-neutral-300 px-2 py-1.5 transition-colors">
                      لا
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDelId(radio.id)}
                    className="text-xs text-neutral-500 hover:text-red-400 px-2 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                  >
                    حذف
                  </button>
                )}
              </div>
            </div>

            {/* Inline edit form */}
            {editId === radio.id && (
              <div className="px-4 py-4 border-t border-neutral-800 bg-neutral-950/30">
                <form action={updateMyDirectDjRadio} className="space-y-4">
                  <input type="hidden" name="radioId" value={radio.id} />
                  <RadioFormFields radio={radio} />
                  <div className="flex gap-2 justify-end pt-1">
                    <button type="button" onClick={() => setEditId(null)}
                      className="text-xs text-neutral-500 hover:text-neutral-300 px-3 py-2 transition-colors">
                      إغلاق
                    </button>
                    <button type="submit"
                      className="bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-xl px-5 py-2 transition-all">
                      حفظ التعديلات
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
