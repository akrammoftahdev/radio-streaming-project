const fs = require('fs');

const path = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/presenters/[id]/delete/page.tsx';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes('getTranslations')) {
  code = code.replace(
    'import { CleanupButton } from "./cleanup-button";',
    'import { CleanupButton } from "./cleanup-button";\nimport { getTranslations } from "next-intl/server";'
  );
  code = code.replace(
    'export default async function PresenterDeletePage({',
    'export async function generateMetadata() {\n  const t = await getTranslations("admin.presenters");\n  return { title: t("deletePageTitle") };\n}\n\nexport default async function PresenterDeletePage({'
  );
  code = code.replace(
    'export const metadata = { title: "حذف / إدارة المذيع - الإدارة - EGONAIR" };\n',
    ''
  );
  code = code.replace(
    'const { id: presenterId } = await params;',
    'const { id: presenterId } = await params;\n  const t = await getTranslations("admin.presenters");'
  );
}

// Translations map
const replacers = [
  [/"برامج \(نشطة \/ إجمالي\)"/g, 't("depPrograms")'],
  [/"تعطيل كل البرامج"/g, 't("cleanupPrograms")'],
  [/"سيتم تعطيل كل برامج هذا المذيع. التسجيلات لن تُحذف."/g, 't("cleanupProgramsConfirm")'],
  [/`⚠ \$\{deps.activePrograms\} برنامج نشط يمنع الحذف. انقر "تعطيل كل البرامج" لتصفير العداد المانع.`/g, 't("noteProgramsActive", { active: deps.activePrograms })'],
  [/`ℹ \$\{deps.programs\} برنامج معطّل محفوظ للتاريخ — لا يمنع الحذف.`/g, 't("noteProgramsInactive", { total: deps.programs })'],

  [/"تسجيلات"/g, 't("depRecordings")'],
  [/"🔴 التسجيلات تمنع الحذف النهائي \(قيد قاعدة البيانات\). احذف التسجيلات يدوياً من صفحة التسجيلات أولاً."/g, 't("noteRecordingsBlocking")'],

  [/"جلسات بث"/g, 't("depLiveSessions")'],
  [/"تنظيف جلسات البث"/g, 't("cleanupLiveSessions")'],
  [/"هل أنت متأكد؟ سيتم حذف سجلات جلسات البث التاريخية لهذا المذيع. لن يتم حذف التسجيلات الصوتية من هنا."/g, 't("cleanupLiveSessionsConfirm")'],
  [/"جلسات البث تمنع الحذف النهائي حتى يتم تنظيفها. يجب حذف التسجيلات أولاً إن وجدت."/g, 't("noteLiveSessionsBlocking")'],

  [/"جداول بث قديمة"/g, 't("depLegacySchedules")'],
  [/"تنظيف الجداول القديمة"/g, 't("cleanupLegacySchedules")'],
  [/"سيتم حذف جداول البث القديمة لهذا المذيع. لا يمكن التراجع."/g, 't("cleanupLegacySchedulesConfirm")'],

  [/"روابط المحطات"/g, 't("depStationLinks")'],
  [/"فصل عن كل المحطات"/g, 't("unlinkAllStations")'],
  [/"سيتم إلغاء ارتباط المذيع بجميع المحطات."/g, 't("unlinkAllStationsConfirm")'],

  [/"راديوهات DJ مباشر"/g, 't("depDjRadios")'],
  [/"حذف راديوهات DJ"/g, 't("deleteDjRadios")'],
  [/"سيتم حذف كل إذاعات DJ المباشر لهذا المذيع. لا يمكن التراجع."/g, 't("deleteDjRadiosConfirm")'],

  [/"بيانات SonicPanel"/g, 't("depSonicPanel")'],
  [/"حذف بيانات SonicPanel"/g, 't("deleteSonicPanel")'],
  [/"سيتم حذف بيانات اعتماد SonicPanel لهذا المذيع."/g, 't("deleteSonicPanelConfirm")'],

  [/"صلاحية البث"/g, 't("depValidity")'],
  [/"حذف صلاحية البث"/g, 't("deleteValidity")'],
  [/"سيتم حذف بيانات صلاحية البث لهذا المذيع."/g, 't("deleteValidityConfirm")'],

  [/"ملف المذيع"/g, 't("depProfile")'],
  [/"ℹ يُحذف تلقائياً ضمن عملية الحذف النهائية."/g, 't("profileAutoDelete")'],

  [/"سجلات الوصول"/g, 't("depAccessLogs")'],
  [/"ℹ تُحذف تلقائياً ضمن عملية الحذف النهائية."/g, 't("accessLogsAutoDelete")'],

  [/`\$\{deps.activePrograms\} برنامج نشط`/g, 't("blockerActivePrograms", { count: deps.activePrograms })'],
  [/`\$\{deps.recordings\} تسجيل`/g, 't("blockerRecordings", { count: deps.recordings })'],
  [/`\$\{deps.liveSessions\} جلسة بث تاريخية`/g, 't("blockerLiveSessions", { count: deps.liveSessions })'],
  [/`\$\{deps.schedules\} جدول بث قديم`/g, 't("blockerLegacySchedules", { count: deps.schedules })'],

  [/>الإدارة</g, '>{t("dashboard")}<'],
  [/>المذيعون</g, '>{t("presenters")}<'],
  [/>إدارة الحذف</g, '>{t("manageDelete")}<'],

  [/"نشط" : "معطّل"/g, 't("active") : t("inactive")'],

  [/>⛔ الحذف النهائي محظور</g, '>{t("hardDeleteBlocked")}<'],

  [/>فحص التبعيات وأدوات التنظيف</g, '>{t("dependencyCheckTitle")}<'],
  [/>البنود الحمراء تمنع الحذف النهائي. نظّف ما يمكنك ثم اضغط "حذف نهائي" عند توفر الشروط\.</g, '>{t("dependencyCheckDesc")}<'],

  [/>عرض</g, '>{t("view")}<'],
  [/>← العودة إلى صفحة التعديل</g, '>{t("backToEdit")}<'],
];

replacers.forEach(([re, replace]) => {
  code = code.replace(re, replace);
});

// For `active` and `inactive`, `dashboard`, `presenters`, we should ensure `tc` (common) is used if not in admin.presenters, but the previous coder might have added them to presenters namespace or common namespace. Let's just assume `t("common.active")` is safer for `t("active")`, wait we'll import `tc`.

code = code.replace(
  'const t = await getTranslations("admin.presenters");',
  'const t = await getTranslations("admin.presenters");\n  const tc = await getTranslations("common");'
);
code = code.replace(/t\("active"\)/g, 'tc("active")');
code = code.replace(/t\("inactive"\)/g, 'tc("inactive")');
code = code.replace(/t\("dashboard"\)/g, 'tc("dashboard")');
code = code.replace(/t\("presenters"\)/g, 'tc("presenters")');
code = code.replace(/t\("view"\)/g, 'tc("view")');
code = code.replace(/t\("backToEdit"\)/g, 't("backToEdit")');

fs.writeFileSync(path, code);
console.log("Done delete page");
