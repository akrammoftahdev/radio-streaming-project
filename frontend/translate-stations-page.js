const fs = require('fs');

const path = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/stations/page.tsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Imports
if (!code.includes('next-intl/server')) {
  code = code.replace(
    'import { AdminPageShell } from "@/components/ui";',
    'import { AdminPageShell } from "@/components/ui";\nimport { getTranslations } from "next-intl/server";\nimport { LanguageSwitcher } from "@/components/LanguageSwitcher";'
  );
}

// 2. Setup inside the component
code = code.replace(
  'export default async function StationsPage({',
  'export default async function StationsPage({\n'
);
code = code.replace(
  'const session = await auth();',
  'const session = await auth();\n  const t = await getTranslations("admin.stations");\n  const tc = await getTranslations("common");'
);

// 3. Header & Header Button
code = code.replace('لوحة الإدارة', '{tc("dashboard")}');
code = code.replace('المحطات', '{t("title")}');
code = code.replace('إدارة المحطات', '{t("title")}');
code = code.replace('إضافة وتعديل محطات الراديو', '{t("subtitle")}');
code = code.replace('إضافة محطة', '{t("addStation")}');
code = code.replace('إلغاء ↩', '{tc("cancel")} ↩');
code = code.replace('إلغاء', '{tc("cancel")}');

// inject LanguageSwitcher near the header
code = code.replace(
  '<div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">',
  '<div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">\n          <div className="absolute top-8 left-8" dir="ltr"><LanguageSwitcher /></div>'
);

// 4. Success Banners
code = code.replace('تم تعديل المحطة بنجاح.', '{t("stationUpdated")}');
code = code.replace('تم حفظ بيانات DJ الافتراضية للمحطة بنجاح.', '{t("djCredentialsSaved")}');
code = code.replace('تم إنشاء المحطة بنجاح.', '{t("stationCreated")}');
code = code.replace('تم إنشاء المحطة وحفظ بيانات DJ الافتراضية بنجاح.', '{t("stationCreatedWithDj")}');

// 5. Note
code = code.replace('<span className="font-semibold">ملاحظة مهمة:</span>{" "}\n            بيانات DJ / SonicPanel الخاصة بالمذيعين (Host الاتصال · Port المصدر · اسم المستخدم · كلمة المرور)\n            ستُدار لاحقًا لكل مذيع + محطة بشكل منفصل، وليست هنا.\n            الحقول الظاهرة أدناه خاصة بمعلومات الاستماع العامة للمحطة فقط.', '{t("djWarning")}');

// 6. Edit section
code = code.replace('تعديل محطة: {editingStation.name}', '{t("editStation")}: {editingStation.name}');
code = code.replace(
  'اسم المحطة <span className="text-red-400">*</span>',
  '{t("stationName")} <span className="text-red-400">*</span>'
);
code = code.replace(
  '<span className="text-slate-500 font-normal text-xs mr-2">(أحرف إنجليزية وشرطات فقط)</span>',
  '<span className="text-slate-500 font-normal text-xs mx-2">({t("englishAndDashesOnly")})</span>'
);
code = code.replace(
  'الوصف <span className="text-slate-500 font-normal text-xs">(اختياري)</span>',
  '{t("description")} <span className="text-slate-500 font-normal text-xs">({tc("optional")})</span>'
);
code = code.replace('placeholder="وصف مختصر للمحطة"', 'placeholder={t("descriptionPlaceholder")}');

code = code.replace('رابط/دومين الاستماع', '{t("listenDomain")}');
code = code.replace('خاص برابط الاستماع العام، وليس بيانات DJ', '{t("listenDomainHelp")}');
code = code.replace('بورت الاستماع', '{t("listenPort")}');
code = code.replace('هذا ليس بورت DJ / Source', '{t("listenPortHelp")}');
code = code.replace('موقع الإذاعة أو رابط المشغل العام', '{t("publicPlayerUrl")}');
code = code.replace('رابط يظهر للإدارة أو للمستمعين، وليس بيانات اتصال المذيع', '{t("publicPlayerUrlHelp")}');
code = code.replace('حفظ التعديلات', '{tc("saveChanges")}');

// 7. Edit DJ section
code = code.replace('بيانات DJ الافتراضية للمحطة', '{t("defaultDjCredentials")}');
code = code.replace('تُستخدم هذه البيانات كـ fallback لأي مذيع على هذه المحطة إذا لم تكن لديه بيانات DJ خاصة.\n                تعمل على مستوى المحطة فقط — وليست بيانات مذيع بعينه.', '{t("defaultDjHelp")}');
code = code.replace('مُعدّة ونشطة', '{t("setupAndActive")}');
code = code.replace('مُعدّة — غير نشطة', '{t("setupInactive")}');
code = code.replace('لم تُعدّ بعد', '{t("notSetupYet")}');

code = code.replace('<span className="text-slate-500 font-normal text-xs mr-2">(اتركه فارغاً للإبقاء على كلمة المرور الحالية)</span>', '<span className="text-slate-500 font-normal text-xs mx-2">({t("leaveBlankToKeep")})</span>');
code = code.replace('نشطة (تُستخدم كـ fallback)', '{t("activeFallback")}');
code = code.replace('حفظ بيانات DJ الافتراضية', '{t("saveDjCredentials")}');

// 8. Create section
code = code.replace('إضافة محطة جديدة', '{t("addNewStation")}');
code = code.replace('<span className="text-slate-500 font-normal text-xs">(اختياري)</span>', '<span className="text-slate-500 font-normal text-xs">({tc("optional")})</span>');
code = code.replace('اختياري — تُستخدم كـ fallback لأي مذيع على هذه المحطة إذا لم تكن لديه بيانات DJ خاصة.\n                    إما اترك الحقول فارغة أو أكملها بالكامل.', '{t("optionalDjHelp")}');
code = code.replace('<span className="text-xs text-red-400/80">(مطلوب إذا أدخلت بيانات DJ)</span>', '<span className="text-xs text-red-400/80">({t("requiredIfDjEntered")})</span>');
code = code.replace('إنشاء المحطة', '{t("createStation")}');

// 9. List section
code = code.replace('المحطات المسجّلة ({totalCount})', '{t("registeredStations")} ({totalCount})');
code = code.replace('لا توجد محطات تطابق بحثك', '{t("noStationsMatch")}');
code = code.replace('لا توجد محطات بعد', '{t("noStationsYet")}');
code = code.replace('جرب تعديل الفلاتر أو مسحها.', '{t("tryAdjustFilters")}');
code = code.replace('أضف أول محطة باستخدام النموذج أعلاه.', '{t("addFirstStation")}');
code = code.replace('لا يوجد رابط بث', '{t("noStreamUrl")}');

code = code.replace('مذيعون', '{t("presentersCount")}');
code = code.replace('برامج', '{t("programsCount")}');
code = code.replace('تسجيلات', '{t("recordingsCount")}');
code = code.replace('مديرو المحطة', '{t("managersCount")}');

code = code.replace('نشطة', '{t("active")}');
code = code.replace('غير نشطة', '{t("inactive")}');
code = code.replace('DJ مُعدّة', '{t("djSetup")}');
code = code.replace('DJ موقوفة', '{t("djStopped")}');
code = code.replace('DJ غير مُعدّة', '{t("djNotSetup")}');

code = code.replace(/>تعديل</g, '>{tc("edit")}<');
code = code.replace(/>حذف</g, '>{tc("delete")}<');
code = code.replace('{station.isActive ? "إيقاف" : "تفعيل"}', '{station.isActive ? t("stop") : t("activate")}');

// 10. Pagination section
code = code.replace('صفحة <span className="text-neutral-300 font-medium">{page}</span> من{" "}\n        <span className="text-neutral-300 font-medium">{totalPages}</span> · {totalCount} محطة', 
  '{tc("page")} <span className="text-neutral-300 font-medium">{page}</span> {tc("of")} <span className="text-neutral-300 font-medium">{totalPages}</span> · {totalCount} {t("station")}'
);
code = code.replace('عدد النتائج:', '{tc("resultsCount")}:');
code = code.replace(/>تطبيق</g, '>{tc("apply")}<');
code = code.replace(/>السابق</g, '>{tc("previous")}<');
code = code.replace(/>التالي</g, '>{tc("next")}<');

// Remove any remaining `dir="rtl"`
code = code.replace(/ dir="rtl"/g, '');

// Clean metadata
code = code.replace(
  'export const metadata = {\n  title: "إدارة المحطات - EGONAIR",\n};',
  'export async function generateMetadata() {\n  const t = await getTranslations("admin.stations");\n  return { title: t("metaTitle", { name: "EGONAIR" }) };\n}'
);

fs.writeFileSync(path, code);
console.log("Stations page updated successfully!");
