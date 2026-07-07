const fs = require('fs');

const basePath = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/stations';

// --- stations-filter.tsx ---
let filterCode = fs.readFileSync(`${basePath}/stations-filter.tsx`, 'utf8');

if (!filterCode.includes('useTranslations')) {
  filterCode = filterCode.replace(
    'import { ClearFiltersButton } from "@/components/ui/ClearFiltersButton";',
    'import { ClearFiltersButton } from "@/components/ui/ClearFiltersButton";\nimport { useTranslations } from "next-intl";'
  );
}
filterCode = filterCode.replace(
  'export function AdminStationsFilter(p: Props) {\n  const router = useRouter();',
  'export function AdminStationsFilter(p: Props) {\n  const router = useRouter();\n  const t = useTranslations("admin.stations");\n  const tc = useTranslations("common");'
);

filterCode = filterCode.replace('placeholder="ابحث باسم المحطة، Slug، أو الوصف..."', 'placeholder={t("filterSearchPlaceholder")}');
filterCode = filterCode.replace('الحالة', '{tc("status")}');
filterCode = filterCode.replace('بيانات DJ الافتراضية', '{t("filterDjCredential")}');
filterCode = filterCode.replace('ترتيب', '{tc("sort")}');
filterCode = filterCode.replace('المذيعون', '{t("filterPresenters")}');
filterCode = filterCode.replace('البرامج', '{t("filterPrograms")}');
filterCode = filterCode.replace('مدير المحطة', '{t("filterManager")}');
filterCode = filterCode.replace('مسح كل الفلاتر', '{tc("clearAllFilters")}');

filterCode = filterCode.replace(/"الكل"/g, 'tc("all")');
filterCode = filterCode.replace(/"نشطة"/g, 't("active")');
filterCode = filterCode.replace(/"غير نشطة"/g, 't("inactive")');
filterCode = filterCode.replace(/"مُعدّة"/g, 't("setup")');
filterCode = filterCode.replace(/"غير مُعدّة"/g, 't("notSetup")');

filterCode = filterCode.replace(/"الأحدث"/g, 'tc("newest")');
filterCode = filterCode.replace(/"الأقدم"/g, 'tc("oldest")');
filterCode = filterCode.replace(/"الاسم أ-ي"/g, 'tc("nameAZ")');

filterCode = filterCode.replace(/"لديها مذيعون"/g, 't("hasPresenters")');
filterCode = filterCode.replace(/"لا يوجد"/g, 'tc("none")');
filterCode = filterCode.replace(/"لديها برامج"/g, 't("hasPrograms")');
filterCode = filterCode.replace(/"لديها مدير"/g, 't("hasManager")');

fs.writeFileSync(`${basePath}/stations-filter.tsx`, filterCode);

// --- [id]/delete/page.tsx ---
let deleteCode = fs.readFileSync(`${basePath}/[id]/delete/page.tsx`, 'utf8');
if (!deleteCode.includes('next-intl/server')) {
  deleteCode = deleteCode.replace(
    'import { StationCleanupButton }  from "./cleanup-button";',
    'import { StationCleanupButton }  from "./cleanup-button";\nimport { getTranslations } from "next-intl/server";'
  );
}
deleteCode = deleteCode.replace(
  'const { id: stationId } = await params;',
  'const { id: stationId } = await params;\n  const t = await getTranslations("admin.stations");\n  const tc = await getTranslations("common");'
);

deleteCode = deleteCode.replace(/ dir="rtl"/g, '');
deleteCode = deleteCode.replace('الإدارة', '{tc("dashboard")}');
deleteCode = deleteCode.replace('المحطات', '{t("title")}');
deleteCode = deleteCode.replace('حذف المحطة', '{t("deleteStation")}');
deleteCode = deleteCode.replace('معطّلة', '{t("inactive")}'); // note: the active string was "نشطة" but I will use the ternary directly below
deleteCode = deleteCode.replace('{station.isActive ? "نشطة" : "معطّلة"}', '{station.isActive ? t("active") : t("inactive")}');

deleteCode = deleteCode.replace('قائمة التبعيات', '{t("dependencyList")}');
deleteCode = deleteCode.replace('يجب تنظيف التبعيات الحمراء قبل الحذف النهائي.', '{t("dependencyWarning")}');

deleteCode = deleteCode.replace('الحذف النهائي محظور', '{t("hardDeleteBlocked")}');
deleteCode = deleteCode.replace('لا يمكن حذف المحطة حتى يتم تنظيف:', '{t("hardDeleteBlockedDesc")}');

deleteCode = deleteCode.replace('جاهز للحذف النهائي', '{t("readyForDelete")}');
deleteCode = deleteCode.replace('جميع التبعيات الحرجة نُظِّفت. التسجيلات محفوظة وستُفصل تلقائياً.\n                بيانات المذيعين وحساباتهم لن تُحذف.', '{t("readyForDeleteDesc")}');

deleteCode = deleteCode.replace('🗑 حذف المحطة نهائياً', '{t("hardDeleteBtn")}');
deleteCode = deleteCode.replace('هل أنت متأكد تماماً؟\\n\\nسيتم حذف المحطة', '{t("hardDeleteConfirmStart")}');
deleteCode = deleteCode.replace('نهائياً.\\n\\n• حسابات المذيعين والمديرين لن تُحذف.\\n• التسجيلات لن تُحذف — ستُفصل فقط عن المحطة.\\n\\nلا يمكن التراجع عن هذا الإجراء.', '{t("hardDeleteConfirmEnd")}');

deleteCode = deleteCode.replace('العودة إلى قائمة المحطات', '{t("backToStations")}');

// Complex table strings - using dynamic strings
deleteCode = deleteCode.replace(/"برامج المحطة"/g, 't("depPrograms")');
deleteCode = deleteCode.replace(/"روابط المذيعين"/g, 't("depPresenters")');
deleteCode = deleteCode.replace(/"مذيعو المحطة الواحدة"/g, 't("depSinglePresenters")');
deleteCode = deleteCode.replace(/"مديرو المحطة"/g, 't("depManagers")');
deleteCode = deleteCode.replace(/"بيانات DJ الافتراضية"/g, 't("depDjCredentials")');
deleteCode = deleteCode.replace(/"التسجيلات المرتبطة"/g, 't("depRecordings")');
deleteCode = deleteCode.replace(/"بيانات SonicPanel للمذيعين"/g, 't("depSonicCredentials")');
deleteCode = deleteCode.replace(/"جداول البث القديمة"/g, 't("depBroadcastSchedules")');

deleteCode = deleteCode.replace('موجودة', 't("exists")');
deleteCode = deleteCode.replace('غير موجودة', 't("notExists")');

deleteCode = deleteCode.replace('لا توجد برامج — يمكن حذف المحطة.', 't("noProgramsNote")');
deleteCode = deleteCode.replace('يجب حذف جميع البرامج أولاً (تبعية FK مباشرة). التسجيلات ستُحفظ.', 't("hasProgramsNote")');
deleteCode = deleteCode.replace('🗑 حذف ${deps.programs} برنامج', '🗑 ${t("deleteNPrograms", { n: deps.programs })}');
deleteCode = deleteCode.replace('هل أنت متأكد؟ سيتم حذف جميع البرامج (${deps.programs}) المرتبطة بالمحطة.\\n\\nالتسجيلات لن تُحذف — سيتم فقط فصلها عن البرامج.\\nقواعد الجدول وفتراته ستُحذف تلقائياً.', '${t("deleteProgramsConfirm", { n: deps.programs })}');

deleteCode = deleteCode.replace('لا توجد روابط مذيعين.', 't("noPresentersNote")');
deleteCode = deleteCode.replace('${deps.presenterStationLinks} رابط سيُحذف تلقائياً عند حذف المحطة (Cascade). حسابات المذيعين لن تُحذف.', '${t("hasPresentersNote", { n: deps.presenterStationLinks })}');
deleteCode = deleteCode.replace('فصل ${deps.presenterStationLinks} مذيع', '${t("unlinkNPresenters", { n: deps.presenterStationLinks })}');
deleteCode = deleteCode.replace('هل أنت متأكد؟ سيتم تعطيل روابط ${deps.presenterStationLinks} مذيع بهذه المحطة.\\n\\nحسابات المذيعين لن تُحذف. مذيعو DIRECT_DJ لن يتأثروا.', '${t("unlinkPresentersConfirm", { n: deps.presenterStationLinks })}');

deleteCode = deleteCode.replace('لا يوجد مذيعون مرتبطون بهذه المحطة فقط.', 't("noSinglePresentersNote")');
deleteCode = deleteCode.replace('⚠️ ${deps.singleStationPresenters} مذيع من نوع SINGLE_STATION مرتبط بهذه المحطة فقط. بعد حذف المحطة ستنقطع صلتهم بأي محطة — اعتني بتعيينهم لمحطة أخرى أو حذفهم أولاً.', '${t("hasSinglePresentersNote", { n: deps.singleStationPresenters })}');

deleteCode = deleteCode.replace('لا يوجد مديرون مرتبطون.', 't("noManagersNote")');
deleteCode = deleteCode.replace('${deps.stationManagers} تعيين سيُحذف تلقائياً عند حذف المحطة. حسابات المديرين لن تُحذف.', '${t("hasManagersNote", { n: deps.stationManagers })}');
deleteCode = deleteCode.replace('عزل ${deps.stationManagers} مدير', '${t("removeNManagers", { n: deps.stationManagers })}');
deleteCode = deleteCode.replace('هل أنت متأكد؟ سيتم حذف تعيينات ${deps.stationManagers} مدير من هذه المحطة.\\n\\nحسابات المديرين لن تُحذف.', '${t("removeManagersConfirm", { n: deps.stationManagers })}');

deleteCode = deleteCode.replace('بيانات DJ الافتراضية (${deps.defaultCredential.djUsername}) ستُحذف تلقائياً عند حذف المحطة (Cascade).', '${t("hasDjCredentialNote", { username: deps.defaultCredential.djUsername })}');
deleteCode = deleteCode.replace('لا توجد بيانات DJ افتراضية.', 't("noDjCredentialNote")');
deleteCode = deleteCode.replace('"حذف بيانات DJ"', 't("deleteDjCredentialBtn")');
deleteCode = deleteCode.replace('"هل أنت متأكد؟ سيتم حذف بيانات DJ الافتراضية للمحطة."', 't("deleteDjCredentialConfirm")');

deleteCode = deleteCode.replace('لا توجد تسجيلات مرتبطة.', 't("noRecordingsNote")');
deleteCode = deleteCode.replace('${deps.recordings} تسجيل — لن تُحذف عند حذف المحطة. سيتم فقط فصلها (stationId → null). ملفات الصوت محفوظة.', '${t("hasRecordingsNote", { n: deps.recordings })}');
deleteCode = deleteCode.replace('عرض التسجيلات ←', '{t("viewRecordings")} ←');

deleteCode = deleteCode.replace('لا توجد بيانات.', 't("noSonicNote")');
deleteCode = deleteCode.replace('${deps.sonicCredentials} سجل — سيتم فصلها (stationId → null) دون حذفها.', '${t("hasSonicNote", { n: deps.sonicCredentials })}');

deleteCode = deleteCode.replace('لا توجد.', 't("noSchedulesNote")');
deleteCode = deleteCode.replace('${deps.broadcastSchedules} جدول بث قديم — سيتم فصله (stationId → null) دون حذفه.', '${t("hasSchedulesNote", { n: deps.broadcastSchedules })}');

deleteCode = deleteCode.replace('${deps.programs} برنامج', '${deps.programs} ${t("program")}');

fs.writeFileSync(`${basePath}/[id]/delete/page.tsx`, deleteCode);

// --- [id]/delete/cleanup-button.tsx ---
let btnCode = fs.readFileSync(`${basePath}/[id]/delete/cleanup-button.tsx`, 'utf8');

if (!btnCode.includes('useTranslations')) {
  btnCode = btnCode.replace(
    'import { useState } from "react";',
    'import { useState } from "react";\nimport { useTranslations } from "next-intl";'
  );
  btnCode = btnCode.replace(
    'export function StationCleanupButton({',
    'export function StationCleanupButton({\n'
  );
  btnCode = btnCode.replace(
    'const [isPending, setIsPending] = useState(false);',
    'const [isPending, setIsPending] = useState(false);\n  const t = useTranslations("admin.stations");'
  );
  btnCode = btnCode.replace('جاري العمل...', '{t("working")}');
  fs.writeFileSync(`${basePath}/[id]/delete/cleanup-button.tsx`, btnCode);
}

console.log("Filters and delete pages updated!");
