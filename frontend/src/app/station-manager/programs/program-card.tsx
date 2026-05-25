"use client";

import { useState } from "react";
import {
  updateProgram, toggleProgram, disableProgram,
  createScheduleRule, createScheduleSlot, deleteScheduleSlot,
  updateScheduleRule, updateScheduleSlot,
} from "./actions";
import { StatusBadge } from "@/components/ui/StatusBadge";

const DAY_NAMES = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
const REC_LABELS: Record<string,string> = {
  DAILY:"يومي", WEEKLY:"أسبوعي", SELECTED_DAYS:"أيام محددة", ONE_TIME:"حلقة واحدة",
};

export interface ScheduleSlot {
  id:string; startTime:string; endTime:string;
  dayOfWeek:number|null; slotDate:Date|null; isActive:boolean;
}
export interface ScheduleRule {
  id:string; recurrenceType:string; timezone:string;
  allowConnectMinutesBefore:number; isActive:boolean; slots:ScheduleSlot[];
}
export interface ProgramRowClient {
  id:string; title:string; description:string|null; isActive:boolean;
  stationId:string; stationName:string; presenterName:string;
  scheduleRules:ScheduleRule[];
}

// ── helpers ───────────────────────────────────────────────────────────────────

const inp = "w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-teal-500 transition-colors";
const inpSm = "w-full bg-slate-900 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-teal-500 transition-colors";
const btn = (c:string) => `text-xs border rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50 ${c}`;

// ── ProgramCard ───────────────────────────────────────────────────────────────

export function ProgramCard({ program: p }: { program:ProgramRowClient; managerId:string }) {
  const [panel,    setPanel]    = useState<"none"|"edit"|"schedule">("none");
  const [busy,     setBusy]     = useState(false);
  const [msg,      setMsg]      = useState<{type:"ok"|"err";text:string}|null>(null);
  const [addSlotRuleId, setAddSlotRuleId] = useState<string|null>(null);
  const [addingRule,    setAddingRule]    = useState(false);
  const [editRuleId,    setEditRuleId]    = useState<string|null>(null);
  const [editSlotId,    setEditSlotId]    = useState<string|null>(null);

  function ok(t:string)  { setMsg({type:"ok",  text:t}); setBusy(false); }
  function err(t:string) { setMsg({type:"err", text:t}); setBusy(false); }

  async function run(
    action:(fd:FormData)=>Promise<{error?:string;success?:boolean}>,
    fd:FormData, successMsg:string, after?:()=>void,
  ) {
    setBusy(true); setMsg(null);
    const res = await action(fd);
    if (res.error) err(res.error);
    else { ok(successMsg); after?.(); }
  }

  async function handleUpdate(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await run(updateProgram, new FormData(e.currentTarget), "تم تعديل البرنامج.", () => setPanel("none"));
  }
  async function handleToggle(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await run(toggleProgram, new FormData(e.currentTarget), p.isActive ? "تم تعطيل البرنامج." : "تم تفعيل البرنامج.");
  }
  async function handleDisable(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await run(disableProgram, new FormData(e.currentTarget), "تم تعطيل البرنامج نهائياً.");
  }
  async function handleAddRule(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await run(createScheduleRule, new FormData(e.currentTarget), "تمت إضافة قاعدة البث.", () => setAddingRule(false));
  }
  async function handleEditRule(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await run(updateScheduleRule, new FormData(e.currentTarget), "تم تعديل القاعدة.", () => setEditRuleId(null));
  }
  async function handleAddSlot(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await run(createScheduleSlot, new FormData(e.currentTarget), "تمت إضافة الوقت.", () => setAddSlotRuleId(null));
  }
  async function handleEditSlot(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await run(updateScheduleSlot, new FormData(e.currentTarget), "تم تعديل الوقت.", () => setEditSlotId(null));
  }
  async function handleDeleteSlot(slotId:string) {
    const fd = new FormData(); fd.set("slotId",slotId); fd.set("programId",p.id);
    await run(deleteScheduleSlot, fd, "تم حذف الوقت.");
  }

  return (
    <div className="bg-slate-900 border border-slate-700/40 rounded-2xl overflow-hidden">
      {msg && (
        <div className={`px-5 pt-3 text-xs font-medium ${msg.type==="ok"?"text-emerald-400":"text-red-400"}`}>
          {msg.type==="ok"?"✅":"⚠️"} {msg.text}
        </div>
      )}

      {/* ── Main row ── */}
      <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-slate-100">{p.title}</span>
            <StatusBadge label={p.isActive ? "نشط" : "معطّل"} variant={p.isActive ? "success" : "neutral"} dot />
          </div>
          <p className="text-xs text-slate-500 mb-1">📡 {p.stationName} · 🎙️ {p.presenterName}</p>
          {p.description && <p className="text-xs text-slate-600 mb-1">{p.description}</p>}
          {p.scheduleRules.length>0 && (
            <p className="text-xs text-slate-600">
              {p.scheduleRules.flatMap(r=>r.slots.map(s=>{
                const day = s.dayOfWeek!==null?DAY_NAMES[s.dayOfWeek]:"";
                return `${REC_LABELS[r.recurrenceType]??r.recurrenceType}${day?" · "+day:""} ${s.startTime}–${s.endTime}`;
              })).join(" | ")}
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap flex-shrink-0">
          <button onClick={()=>{setPanel(panel==="edit"?"none":"edit");setMsg(null);}}
            className={btn(panel==="edit"?"text-purple-300 border-purple-500/50 bg-purple-950/40":"text-slate-400 hover:text-purple-300 border-slate-700 hover:border-purple-500/40")}>
            {panel==="edit"?"▲ إغلاق":"✏️ تعديل"}
          </button>
          <button onClick={()=>{setPanel(panel==="schedule"?"none":"schedule");setMsg(null);}}
            className={btn(panel==="schedule"?"text-teal-300 border-teal-500/50 bg-teal-950/40":"text-slate-400 hover:text-teal-300 border-slate-700 hover:border-teal-500/40")}>
            {panel==="schedule"?"▲ إغلاق":"📅 الجدول"}
          </button>
          <form onSubmit={handleToggle}>
            <input type="hidden" name="programId" value={p.id}/>
            <input type="hidden" name="stationId" value={p.stationId}/>
            <input type="hidden" name="current"   value={p.isActive?"true":"false"}/>
            <button type="submit" disabled={busy}
              className={btn(p.isActive?"text-orange-400 border-orange-700/30 hover:border-orange-500/50":"text-emerald-400 border-emerald-700/30 hover:border-emerald-500/50")}>
              {p.isActive?"تعطيل":"تفعيل"}
            </button>
          </form>
          {p.isActive&&(
            <form onSubmit={handleDisable}>
              <input type="hidden" name="programId" value={p.id}/>
              <input type="hidden" name="stationId" value={p.stationId}/>
              <button type="submit" disabled={busy} className={btn("text-red-400 border-red-700/30 hover:border-red-500/50")}>🚫 تعطيل نهائي</button>
            </form>
          )}
        </div>
      </div>

      {/* ── Edit metadata ── */}
      {panel==="edit"&&(
        <div className="border-t border-slate-700/50 bg-slate-800/40 px-5 py-5">
          <h3 className="text-sm font-semibold text-purple-300 mb-4">تعديل بيانات البرنامج</h3>
          <form onSubmit={handleUpdate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input type="hidden" name="programId" value={p.id}/>
            <input type="hidden" name="stationId" value={p.stationId}/>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1">عنوان البرنامج *</label>
              <input name="title" type="text" required defaultValue={p.title} className={inp}/>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1">الوصف</label>
              <input name="description" type="text" defaultValue={p.description??""} className={inp}/>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">الحالة</label>
              <select name="isActive" defaultValue={p.isActive?"true":"false"} className={inp}>
                <option value="true">نشط</option><option value="false">معطّل</option>
              </select>
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <button type="button" onClick={()=>setPanel("none")} className="text-xs text-slate-400 hover:text-slate-200 border border-slate-700 rounded-xl px-4 py-2.5 transition-colors">إلغاء</button>
              <button type="submit" disabled={busy} className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold text-sm rounded-xl px-5 py-2.5 transition-colors">
                {busy?"جارٍ الحفظ...":"حفظ التعديلات"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Schedule panel ── */}
      {panel==="schedule"&&(
        <div className="border-t border-slate-700/50 bg-slate-800/40 px-5 py-5 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-teal-300">📅 جدول البرنامج</h3>
            <p className="text-[10px] text-slate-600">سيتم فحص التضارب من نظام الجدولة العام.</p>
          </div>

          {p.scheduleRules.length===0&&<p className="text-xs text-slate-600">لا توجد قواعد بث بعد.</p>}

          {p.scheduleRules.map(rule=>(
            <div key={rule.id} className="bg-slate-800 border border-slate-700/40 rounded-xl p-4 space-y-3">

              {/* Rule header */}
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div>
                  <span className="text-xs font-semibold text-teal-200">{REC_LABELS[rule.recurrenceType]??rule.recurrenceType}</span>
                  <span className="text-[10px] text-slate-500 mr-2">· {rule.timezone} · دخول {rule.allowConnectMinutesBefore} د قبل</span>
                  {!rule.isActive&&<span className="text-[10px] text-orange-400 mr-1">(معطّلة)</span>}
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  <button onClick={()=>setEditRuleId(editRuleId===rule.id?null:rule.id)}
                    className={btn(editRuleId===rule.id?"text-amber-300 border-amber-500/50 bg-amber-950/40":"text-slate-400 hover:text-amber-300 border-slate-600 hover:border-amber-500/40")}>
                    {editRuleId===rule.id?"▲ إغلاق":"✏️ تعديل القاعدة"}
                  </button>
                  <button onClick={()=>setAddSlotRuleId(addSlotRuleId===rule.id?null:rule.id)}
                    className={btn(addSlotRuleId===rule.id?"text-teal-300 border-teal-500/50 bg-teal-950/40":"text-slate-400 hover:text-teal-300 border-slate-600 hover:border-teal-500/40")}>
                    {addSlotRuleId===rule.id?"▲ إغلاق":"+ إضافة وقت"}
                  </button>
                </div>
              </div>

              {/* ── Edit rule form ── */}
              {editRuleId===rule.id&&(
                <form onSubmit={handleEditRule} className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-700/30">
                  <input type="hidden" name="ruleId"    value={rule.id}/>
                  <input type="hidden" name="programId" value={p.id}/>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-1">نوع التكرار *</label>
                    <select name="recurrenceType" defaultValue={rule.recurrenceType} required className={inpSm}>
                      <option value="WEEKLY">أسبوعي</option>
                      <option value="DAILY">يومي</option>
                      <option value="SELECTED_DAYS">أيام محددة</option>
                      <option value="ONE_TIME">حلقة واحدة</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-1">المنطقة الزمنية</label>
                    <input name="timezone" type="text" defaultValue={rule.timezone} dir="ltr" className={inpSm}/>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-1">دقائق الدخول المبكر</label>
                    <input name="allowConnectMinutesBefore" type="number" min="0" max="60" defaultValue={rule.allowConnectMinutesBefore} dir="ltr" className={inpSm}/>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-1">الحالة</label>
                    <select name="isActive" defaultValue={rule.isActive?"true":"false"} className={inpSm}>
                      <option value="true">نشطة</option><option value="false">معطّلة</option>
                    </select>
                  </div>
                  <div className="sm:col-span-3 flex justify-end gap-2">
                    <button type="button" onClick={()=>setEditRuleId(null)} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">إلغاء</button>
                    <button type="submit" disabled={busy} className="bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg px-4 py-1.5 transition-colors">
                      حفظ تعديل القاعدة
                    </button>
                  </div>
                </form>
              )}

              {/* Existing slots */}
              {rule.slots.length===0&&<p className="text-[10px] text-slate-600">لا توجد أوقات.</p>}
              {rule.slots.map(slot=>{
                const day  = slot.dayOfWeek!==null?DAY_NAMES[slot.dayOfWeek]:"";
                const date = slot.slotDate?new Date(slot.slotDate).toLocaleDateString("ar-EG"):"";
                const isEditingSlot = editSlotId===slot.id;
                return (
                  <div key={slot.id} className="border-t border-slate-700/20 pt-2 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs text-slate-300">
                        {day||date||"يومي"} · {slot.startTime}–{slot.endTime}
                        {!slot.isActive&&<span className="mr-1 text-slate-600">(معطّل)</span>}
                      </span>
                      <div className="flex gap-1.5">
                        <button onClick={()=>setEditSlotId(isEditingSlot?null:slot.id)}
                          className={btn(isEditingSlot?"text-amber-300 border-amber-500/50 bg-amber-950/40":"text-slate-400 hover:text-amber-300 border-slate-600 hover:border-amber-500/40 text-[10px]")}>
                          {isEditingSlot?"▲ إغلاق":"✏️ تعديل الوقت"}
                        </button>
                        <button onClick={()=>handleDeleteSlot(slot.id)} disabled={busy}
                          className="text-[10px] text-red-500 hover:text-red-400 disabled:opacity-40 transition-colors border border-red-800/30 rounded-lg px-2 py-1">
                          ✕ حذف
                        </button>
                      </div>
                    </div>

                    {/* ── Edit slot form ── */}
                    {isEditingSlot&&(
                      <form onSubmit={handleEditSlot} className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 bg-slate-900/60 rounded-lg p-3">
                        <input type="hidden" name="slotId"    value={slot.id}/>
                        <input type="hidden" name="programId" value={p.id}/>
                        {(rule.recurrenceType==="WEEKLY"||rule.recurrenceType==="SELECTED_DAYS")&&(
                          <div className="col-span-2 sm:col-span-1">
                            <label className="block text-[10px] text-slate-500 mb-1">اليوم</label>
                            <select name="dayOfWeek" defaultValue={slot.dayOfWeek??0} className={inpSm}>
                              {DAY_NAMES.map((d,i)=><option key={i} value={i}>{d}</option>)}
                            </select>
                          </div>
                        )}
                        {rule.recurrenceType==="ONE_TIME"&&(
                          <div className="col-span-2 sm:col-span-1">
                            <label className="block text-[10px] text-slate-500 mb-1">التاريخ</label>
                            <input name="slotDate" type="date" defaultValue={slot.slotDate?new Date(slot.slotDate).toISOString().split("T")[0]:""} className={inpSm}/>
                          </div>
                        )}
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-1">من *</label>
                          <input name="startTime" type="time" required defaultValue={slot.startTime} className={inpSm}/>
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-1">إلى *</label>
                          <input name="endTime" type="time" required defaultValue={slot.endTime} className={inpSm}/>
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-1">الحالة</label>
                          <select name="isActive" defaultValue={slot.isActive?"true":"false"} className={inpSm}>
                            <option value="true">نشط</option><option value="false">معطّل</option>
                          </select>
                        </div>
                        <div className="col-span-2 sm:col-span-4 flex justify-end gap-2">
                          <button type="button" onClick={()=>setEditSlotId(null)} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">إلغاء</button>
                          <button type="submit" disabled={busy} className="bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg px-4 py-1.5 transition-colors">
                            حفظ تعديل الوقت
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                );
              })}

              {/* ── Add slot form ── */}
              {addSlotRuleId===rule.id&&(
                <form onSubmit={handleAddSlot} className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-700/30">
                  <input type="hidden" name="ruleId"    value={rule.id}/>
                  <input type="hidden" name="programId" value={p.id}/>
                  {(rule.recurrenceType==="WEEKLY"||rule.recurrenceType==="SELECTED_DAYS")&&(
                    <div className="col-span-2 sm:col-span-1">
                      <label className="block text-[10px] text-slate-500 mb-1">اليوم</label>
                      <select name="dayOfWeek" className={inpSm}>
                        {DAY_NAMES.map((d,i)=><option key={i} value={i}>{d}</option>)}
                      </select>
                    </div>
                  )}
                  {rule.recurrenceType==="ONE_TIME"&&(
                    <div className="col-span-2 sm:col-span-1">
                      <label className="block text-[10px] text-slate-500 mb-1">التاريخ</label>
                      <input name="slotDate" type="date" className={inpSm}/>
                    </div>
                  )}
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-1">من *</label>
                    <input name="startTime" type="time" required className={inpSm}/>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-1">إلى *</label>
                    <input name="endTime" type="time" required className={inpSm}/>
                  </div>
                  <div className="col-span-2 sm:col-span-4 flex justify-end gap-2">
                    <button type="button" onClick={()=>setAddSlotRuleId(null)} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">إلغاء</button>
                    <button type="submit" disabled={busy} className="bg-teal-700 hover:bg-teal-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg px-4 py-1.5 transition-colors">إضافة الوقت</button>
                  </div>
                </form>
              )}
            </div>
          ))}

          {/* Add rule */}
          {!addingRule&&(
            <button onClick={()=>setAddingRule(true)} className={btn("text-teal-400 border-teal-700/30 hover:border-teal-500/50 hover:text-teal-300")}>
              + إضافة قاعدة بث جديدة
            </button>
          )}
          {addingRule&&(
            <form onSubmit={handleAddRule} className="bg-slate-800 border border-slate-700/40 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <input type="hidden" name="programId" value={p.id}/>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">نوع التكرار *</label>
                <select name="recurrenceType" required className={inp}>
                  <option value="WEEKLY">أسبوعي</option>
                  <option value="DAILY">يومي</option>
                  <option value="SELECTED_DAYS">أيام محددة</option>
                  <option value="ONE_TIME">حلقة واحدة</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">المنطقة الزمنية</label>
                <input name="timezone" type="text" defaultValue="Africa/Cairo" dir="ltr" className={inp}/>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">دقائق الدخول المبكر</label>
                <input name="allowConnectMinutesBefore" type="number" defaultValue="5" min="0" max="60" dir="ltr" className={inp}/>
              </div>
              <div className="sm:col-span-3 flex justify-end gap-2">
                <button type="button" onClick={()=>setAddingRule(false)} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">إلغاء</button>
                <button type="submit" disabled={busy} className="bg-teal-700 hover:bg-teal-600 disabled:opacity-50 text-white text-sm font-semibold rounded-xl px-5 py-2 transition-colors">
                  {busy?"جارٍ الإضافة...":"إضافة القاعدة"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
