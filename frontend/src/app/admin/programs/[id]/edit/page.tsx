import { auth, prisma }  from "@/auth";
import Link               from "next/link";
import { redirect }       from "next/navigation";
import {
  updateProgram, createScheduleRule, toggleRuleActive,
  deleteScheduleRule, createScheduleSlot, deleteScheduleSlot,
  updateScheduleRule, updateScheduleSlot,
} from "./actions";


export const dynamic = "force-dynamic";

const inp = "w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500 transition-all text-sm";
const inpSm = inp + " py-2";

const DAY_NAMES = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
const RECURRENCE_LABELS: Record<string, string> = {
  DAILY: "يومي", WEEKLY: "أسبوعي", SELECTED_DAYS: "أيام محددة", ONE_TIME: "حلقة واحدة",
};

export default async function EditProgramPage({
  params,
  searchParams,
}: {
  params:       Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; editRule?: string; editSlot?: string; saved?: string; slotError?: string }>;
}) {

  const session = await auth();
  if (!session || (session.user as any).role !== "ADMIN") redirect("/login");

  const { id: programId } = await params;
  const { created, editRule, editSlot, saved, slotError } = await searchParams;


  const program = await prisma.program.findUnique({
    where: { id: programId },
    include: {
      presenter: { select: { name: true, username: true } },
      station:   { select: { name: true, slug: true } },
      scheduleRules: {
        orderBy: { createdAt: "asc" },
        include: {
          slots: { where: { isActive: true }, orderBy: { dayOfWeek: "asc" } },
        },
      },
    },
  });

  if (!program) redirect("/admin/programs");

  return (
    <div dir="rtl" className="min-h-screen bg-slate-900 text-white p-6 font-sans">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <Link href="/admin" className="text-slate-500 hover:text-slate-300">لوحة الإدارة</Link>
          <span className="text-slate-700">/</span>
          <Link href="/admin/programs" className="text-slate-500 hover:text-slate-300">البرامج</Link>
          <span className="text-slate-700">/</span>
          <span className="text-slate-300">{program.title}</span>
        </div>

        {/* Created banner */}
        {created === "1" && (
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-5 py-3 text-emerald-400 text-sm">
            ✅ تم إنشاء البرنامج بنجاح. أضف جدول بث أدناه.
          </div>
        )}

        {/* Program save success — shown at top, makes sense for metadata section */}
        {saved === "program" && (
          <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-5 py-3 text-emerald-400 text-sm font-medium">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            تم حفظ بيانات البرنامج بنجاح
          </div>
        )}

        {/* Program meta */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">{program.title}</h1>
            <p className="text-slate-400 text-sm mt-1">
              المذيع: <span className="text-slate-200">{program.presenter.name || program.presenter.username}</span>
              {" · "}
              المحطة: <span className="font-mono text-cyan-400">{program.station.slug}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-shrink-0">
            {/* Validity status badge */}
            {(() => {
              const now = new Date();
              if (program.validUntil && program.validUntil < now)
                return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border bg-red-500/10 text-red-400 border-red-500/20">🔴 منتهي</span>;
              if (program.validFrom && program.validFrom > now)
                return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border bg-amber-500/10 text-amber-400 border-amber-500/20">🟡 قادم</span>;
              return null;
            })()}
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${program.isActive ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-slate-700/50 text-slate-500 border-slate-600/30"}`}>
              {program.isActive ? "نشط" : "موقوف"}
            </span>
          </div>
        </div>

        {/* ── Edit Metadata ── */}
        <section className="bg-slate-800 border border-slate-700/50 rounded-2xl p-5 shadow-xl">
          <h2 className="text-base font-semibold text-slate-200 mb-4">✏️ تعديل بيانات البرنامج</h2>
          <form action={updateProgram} className="space-y-4">
            <input type="hidden" name="programId" value={programId} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-300">العنوان <span className="text-red-400">*</span></label>
                <input name="title" type="text" required defaultValue={program.title} className={inp} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-300">الوصف</label>
                <input name="description" type="text" defaultValue={program.description ?? ""} placeholder="وصف مختصر" className={inp} />
              </div>
            </div>

            {/* Validity date range */}
            <div className="border-t border-slate-700/40 pt-4">
              <p className="text-xs font-medium text-slate-400 mb-3 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                نافذة صلاحية البرنامج
                <span className="text-slate-600 font-normal">(فارغ = دائم)</span>
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-300">📅 تاريخ البدء</label>
                  <input name="validFrom" type="date" dir="ltr"
                    defaultValue={program.validFrom ? program.validFrom.toISOString().split("T")[0] : ""}
                    className={inp} />
                  <p className="text-xs text-slate-600">فارغ = يبدأ فوراً</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-300">📅 تاريخ الانتهاء</label>
                  <input name="validUntil" type="date" dir="ltr"
                    defaultValue={program.validUntil ? program.validUntil.toISOString().split("T")[0] : ""}
                    className={inp} />
                  <p className="text-xs text-slate-600">فارغ = برنامج دائم</p>
                </div>
              </div>
            </div>
            <button type="submit" className="w-full md:w-auto px-8 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-xl transition-colors shadow">
              💾 حفظ بيانات البرنامج
            </button>
          </form>
        </section>

        {/* ── Schedule Rules ── */}
        <section id="schedule-section" className="space-y-4">
          <h2 className="text-base font-semibold text-slate-300">🗓️ جداول البث ({program.scheduleRules.length})</h2>

          {/* Slot conflict error banner */}
          {slotError && (
            <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-3.5 text-red-400 text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>{decodeURIComponent(slotError)}</span>
            </div>
          )}

          {program.scheduleRules.map(rule => (
            <div key={rule.id} id={`rule-${rule.id}`} className="bg-slate-800 border border-slate-700/50 rounded-2xl p-5 shadow space-y-4">
              {/* Rule header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="font-semibold text-slate-200">
                    {RECURRENCE_LABELS[rule.recurrenceType] ?? rule.recurrenceType}
                  </span>
                  <span className="text-xs text-slate-500 mr-2">
                    · سماحية {rule.allowConnectMinutesBefore} د · {rule.timezone}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <form action={toggleRuleActive}>
                    <input type="hidden" name="ruleId"          value={rule.id} />
                    <input type="hidden" name="programId"       value={programId} />
                    <input type="hidden" name="currentIsActive" value={String(rule.isActive)} />
                    <button type="submit" className={`px-3 py-1 text-xs font-medium border rounded-lg transition-colors ${rule.isActive ? "text-amber-400 bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20" : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20"}`}>
                      {rule.isActive ? "إيقاف الجدول" : "تفعيل الجدول"}
                    </button>
                  </form>
                  <form action={deleteScheduleRule}>
                    <input type="hidden" name="ruleId"    value={rule.id} />
                    <input type="hidden" name="programId" value={programId} />
                    <button type="submit" className="px-3 py-1 text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 rounded-lg transition-colors">
                      حذف
                    </button>
                  </form>
                </div>
              </div>

              {/* Edit rule — collapsible */}
              <details open={editRule === rule.id} className="group">
                <summary className="text-xs text-sky-400 hover:text-sky-300 cursor-pointer select-none list-none">
                  ✏️ تعديل القاعدة
                </summary>
                <form action={updateScheduleRule} className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 border-t border-slate-700/40 pt-3">
                  <input type="hidden" name="ruleId"    value={rule.id} />
                  <input type="hidden" name="programId" value={programId} />
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400">نوع التكرار</label>
                    <select name="recurrenceType" defaultValue={rule.recurrenceType} className={inpSm}>
                      <option value="WEEKLY">أسبوعي</option>
                      <option value="DAILY">يومي</option>
                      <option value="SELECTED_DAYS">أيام محددة</option>
                      <option value="ONE_TIME">حلقة واحدة</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400">المنطقة الزمنية</label>
                    <input name="timezone" type="text" defaultValue={rule.timezone} className={inpSm} dir="ltr" placeholder="Africa/Cairo" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400">سماحية الاتصال (دقائق)</label>
                    <input name="allowConnectMinutesBefore" type="number" min="0" defaultValue={rule.allowConnectMinutesBefore} className={inpSm} dir="ltr" />
                  </div>
                  <div className="md:col-span-3 space-y-2">
                    <button type="submit" className="px-4 py-2 bg-sky-700 hover:bg-sky-600 text-white text-xs font-medium rounded-lg transition-colors">
                      حفظ تعديل القاعدة
                    </button>
                    {/* Inline success — only shown when this specific rule was just saved */}
                    {saved === "rule" && editRule === rule.id && (
                      <div className="flex items-center gap-2 text-emerald-400 text-xs">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        تم حفظ تعديل القاعدة بنجاح
                      </div>
                    )}
                  </div>
                </form>
              </details>


              {/* Slots */}
              {rule.slots.length > 0 && (
                <div className="space-y-1.5">
                  {rule.slots.map(slot => (
                    <div key={slot.id} id={`slot-${slot.id}`} className="bg-slate-900/50 border border-slate-700/30 rounded-lg px-4 py-2 space-y-2">
                      {/* Slot display row */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm text-slate-300 flex items-center gap-3" dir="ltr">
                          {slot.dayOfWeek !== null && (
                            <span className="text-indigo-300">{DAY_NAMES[slot.dayOfWeek]}</span>
                          )}
                          {slot.slotDate && (
                            <span className="text-indigo-300">{new Date(slot.slotDate).toLocaleDateString("ar-EG")}</span>
                          )}
                          <span className="font-mono text-slate-200">{slot.startTime} – {slot.endTime}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <form action={deleteScheduleSlot}>
                            <input type="hidden" name="slotId"    value={slot.id} />
                            <input type="hidden" name="programId" value={programId} />
                            <button type="submit" className="text-xs text-red-400 hover:text-red-300 transition-colors">حذف</button>
                          </form>
                        </div>
                      </div>
                      {/* Edit slot — collapsible */}
                      <details open={editSlot === slot.id} className="group">
                        <summary className="text-xs text-sky-400 hover:text-sky-300 cursor-pointer select-none list-none">
                          ✏️ تعديل الوقت
                        </summary>
                        <form action={updateScheduleSlot} className="mt-2 grid grid-cols-2 md:grid-cols-5 gap-2 border-t border-slate-700/30 pt-2">
                          <input type="hidden" name="slotId"         value={slot.id} />
                          <input type="hidden" name="programId"      value={programId} />
                          <input type="hidden" name="recurrenceType" value={rule.recurrenceType} />

                          {(rule.recurrenceType === "WEEKLY" || rule.recurrenceType === "SELECTED_DAYS") && (
                            <div className="space-y-1 col-span-2 md:col-span-1">
                              <label className="text-xs text-slate-400">اليوم</label>
                              <select name="dayOfWeek" defaultValue={slot.dayOfWeek ?? 0} className={inpSm}>
                                {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                              </select>
                            </div>
                          )}

                          {rule.recurrenceType === "ONE_TIME" && (
                            <div className="space-y-1 col-span-2 md:col-span-1">
                              <label className="text-xs text-slate-400">التاريخ</label>
                              <input name="slotDate" type="date"
                                defaultValue={slot.slotDate ? new Date(slot.slotDate).toISOString().split("T")[0] : ""}
                                className={inpSm} dir="ltr" />
                            </div>
                          )}

                          <div className="space-y-1">
                            <label className="text-xs text-slate-400">من</label>
                            <input name="startTime" type="time" defaultValue={slot.startTime} className={inpSm} dir="ltr" required />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-slate-400">إلى</label>
                            <input name="endTime" type="time" defaultValue={slot.endTime} className={inpSm} dir="ltr" required />
                          </div>
                          <div className="col-span-2 md:col-span-1 space-y-2 flex flex-col justify-end">
                            <button type="submit" className="w-full py-2 bg-sky-700 hover:bg-sky-600 text-white text-xs font-medium rounded-lg transition-colors">
                              حفظ تعديل الوقت
                            </button>
                            {/* Inline success — only shown when this specific slot was just saved */}
                            {saved === "slot" && editSlot === slot.id && (
                              <div className="flex items-center gap-1.5 text-emerald-400 text-xs">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                تم الحفظ بنجاح
                              </div>
                            )}
                          </div>
                        </form>
                      </details>
                    </div>
                  ))}
                </div>
              )}


              {/* Add slot form */}
              <details className="group">
                <summary className="text-xs text-purple-400 hover:text-purple-300 cursor-pointer select-none list-none">
                  + إضافة وقت جديد
                </summary>
                <p className="mt-2 text-xs text-slate-500">⚠ يتم منع أي تعارض مع برامج نفس المحطة أو نفس المذيع تلقائياً.</p>
                <form action={createScheduleSlot} className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <input type="hidden" name="ruleId"          value={rule.id} />
                  <input type="hidden" name="programId"       value={programId} />
                  <input type="hidden" name="recurrenceType"  value={rule.recurrenceType} />

                  {(rule.recurrenceType === "WEEKLY" || rule.recurrenceType === "SELECTED_DAYS") && (
                    <div className="space-y-1 col-span-2 md:col-span-1">
                      <label className="text-xs text-slate-400">اليوم</label>
                      <select name="dayOfWeek" className={inpSm}>
                        {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                      </select>
                    </div>
                  )}

                  {rule.recurrenceType === "ONE_TIME" && (
                    <div className="space-y-1 col-span-2 md:col-span-1">
                      <label className="text-xs text-slate-400">التاريخ</label>
                      <input name="slotDate" type="date" className={inpSm} dir="ltr" />
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-xs text-slate-400">من</label>
                    <input name="startTime" type="time" className={inpSm} dir="ltr" required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400">إلى</label>
                    <input name="endTime" type="time" className={inpSm} dir="ltr" required />
                  </div>
                  <div className="flex items-end">
                    <button type="submit" className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium rounded-xl transition-colors">
                      إضافة
                    </button>
                  </div>
                </form>
              </details>
            </div>
          ))}

          {/* Add new rule form */}
          <div className="bg-slate-800/50 border border-dashed border-slate-700 rounded-2xl p-5">
            <h3 className="text-sm font-medium text-slate-400 mb-3">+ إضافة جدول جديد</h3>
            <form action={createScheduleRule} className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input type="hidden" name="programId" value={programId} />

              <div className="space-y-1.5">
                <label className="text-xs text-slate-400">نوع التكرار</label>
                <select name="recurrenceType" className={inpSm}>
                  <option value="WEEKLY">أسبوعي</option>
                  <option value="DAILY">يومي</option>
                  <option value="SELECTED_DAYS">أيام محددة</option>
                  <option value="ONE_TIME">حلقة واحدة</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400">سماحية الاتصال (دقائق)</label>
                <input name="allowConnectMinutesBefore" type="number" min="0" defaultValue={5} className={inpSm} dir="ltr" />
              </div>
              <div className="flex items-end">
                <button type="submit" className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium rounded-xl transition-colors border border-slate-600">
                  إنشاء الجدول
                </button>
              </div>
            </form>
          </div>
        </section>

      </div>
    </div>
  );
}
