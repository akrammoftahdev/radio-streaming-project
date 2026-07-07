const fs = require('fs');

const path = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/page.tsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Add import
if (!code.includes('next-intl/server')) {
  code = code.replace(
    'import { StatusBadge } from "@/components/ui/StatusBadge";',
    'import { StatusBadge } from "@/components/ui/StatusBadge";\nimport { getTranslations } from "next-intl/server";'
  );
}

// 2. Add t inside AdminDashboard
code = code.replace(
  'const session = await auth();\n  if (!session?.user) redirect("/login");',
  'const session = await auth();\n  if (!session?.user) redirect("/login");\n\n  const t = await getTranslations("admin.dashboard");\n  const tc = await getTranslations("common");'
);

// 3. System Subtitle & Header
code = code.replace(
  'const systemSubtitle = settings.systemSubtitle || "نظرة عامة على النظام وحالة البث";',
  'const systemSubtitle = settings.systemSubtitle || t("systemOverview");'
);
code = code.replace(
  '{logoUrl ? "لوحة الإدارة" : `لوحة إدارة ${systemName}`}',
  '{logoUrl ? t("title") : t("titleWithName", { name: systemName })}'
);

// 4. Header buttons
code = code.replace('ملفي الشخصي', '{t("myProfile")}');
code = code.replace('تسجيل الخروج', '{tc("logout")}');

// 5. Warnings
code = code.replace(
  'text: `${s.stationsNoCred} محطة نشطة بدون بيانات DJ افتراضية`',
  'text: t("warningStationsNoCred", { count: s.stationsNoCred })'
);
code = code.replace(
  'text: `${s.presentersNoStation} مذيع نشط بدون محطة مسندة`',
  'text: t("warningPresentersNoStation", { count: s.presentersNoStation })'
);
code = code.replace(
  'text: `${s.programsNoSchedule} برنامج نشط بدون جدول`',
  'text: t("warningProgramsNoSchedule", { count: s.programsNoSchedule })'
);
code = code.replace('<span>عرض ←</span>', '<span>{t("warningView")}</span>');

// 6. Live Strip
code = code.replace('متصل على الهواء الآن', '{t("liveNow")}');
code = code.replace('جلسات LIVE / CONNECTED', '{t("liveSessionsLabel")}');
code = code.replace('label="مباشر"', 'label={t("liveLabel")}');
code = code.replace('عرض الجلسات\n', '{t("viewSessions")}\n');

// 7. Stat Breakdown Headers
code = code.replace('<span>🎙️</span> المذيعون', '<span>🎙️</span> {t("sectionPresenters")}');
code = code.replace('<span>📡</span> المحطات', '<span>📡</span> {t("sectionStations")}');
code = code.replace('<span>📺</span> البرامج والمحتوى', '<span>📺</span> {t("sectionProgramsContent")}');

// 8. Stat Breakdown Cards - Presenters
code = code.replace('label="الإجمالي"  value={s.totalPresenters}', 'label={t("statTotal")}  value={s.totalPresenters}');
code = code.replace('label="نشطون"     value={s.activePresenters}', 'label={t("statActive")}     value={s.activePresenters}');
code = code.replace('label="محطة واحدة" value={s.singleStation}', 'label={t("statSingleStation")} value={s.singleStation}');
code = code.replace('label="متعدد"      value={s.multiStation}', 'label={t("statMulti")}      value={s.multiStation}');
code = code.replace('label="DJ مباشر"   value={s.directDj}', 'label={t("statDirectDj")}   value={s.directDj}');
code = code.replace('label="مديرو محطات" value={s.stationManagers}', 'label={t("statStationManagers")} value={s.stationManagers}');

// 9. Stat Breakdown Cards - Stations
code = code.replace('label="الإجمالي"    value={s.totalStations}', 'label={t("statTotal")}    value={s.totalStations}');
code = code.replace('label="نشطة"        value={s.activeStations}', 'label={t("statActiveF")}        value={s.activeStations}');
code = code.replace('label="بدون DJ cred" value={s.stationsNoCred}', 'label={t("statNoDjCred")} value={s.stationsNoCred}');
code = code.replace('label="مذيعون بلا محطة" value={s.presentersNoStation}', 'label={t("statPresentersNoStation")} value={s.presentersNoStation}');

// 10. Stat Breakdown Cards - Programs/Content
code = code.replace('label="إجمالي البرامج"   value={s.totalPrograms}', 'label={t("statTotalPrograms")}   value={s.totalPrograms}');
code = code.replace('label="برامج نشطة"       value={s.activePrograms}', 'label={t("statActivePrograms")}       value={s.activePrograms}');
code = code.replace('label="بلا جدول"         value={s.programsNoSchedule}', 'label={t("statNoSchedule")}         value={s.programsNoSchedule}');
code = code.replace('label="التسجيلات"        value={s.totalRecordings}', 'label={t("statRecordings")}        value={s.totalRecordings}');
code = code.replace('label="تسجيلات الأسبوع" value={s.recordingsThisWeek}', 'label={t("statWeekRecordings")} value={s.recordingsThisWeek}');
code = code.replace('label="تصنيفات الوسائط" value={s.mediaCategories}', 'label={t("statMediaCategories")} value={s.mediaCategories}');
code = code.replace('sub={`${num(s.mediaTracks)} مقطع`}', 'sub={t("statMediaTracks", { count: num(s.mediaTracks) })}');

// 11. Navigation Section
code = code.replace('الأقسام</h2>', '{t("sectionNav")}</h2>');
code = code.replace('label: "المذيعون",           sub: "إدارة حسابات المذيعين"', 'label: t("navPresenters"),           sub: t("navPresentersDesc")');
code = code.replace('label: "المحطات",            sub: "إضافة وتعديل محطات الراديو"', 'label: t("navStations"),            sub: t("navStationsDesc")');
code = code.replace('label: "البرامج",            sub: "برامج المذيعين وجداول البث"', 'label: t("navPrograms"),            sub: t("navProgramsDesc")');
code = code.replace('label: "جدول البث",          sub: "عرض الجدول الأسبوعي"', 'label: t("navSchedule"),          sub: t("navScheduleDesc")');
code = code.replace('label: "تدقيق الجداول",      sub: "تعارضات وإشكاليات الجداول"', 'label: t("navAudit"),      sub: t("navAuditDesc")');
code = code.replace('label: "الجلسات الحية",      sub: "مراقبة البث المباشر"', 'label: t("navLive"),      sub: t("navLiveDesc")');
code = code.replace('label: "أرشيف التسجيلات",   sub: "عرض وتحميل جلسات البث"', 'label: t("navRecordings"),   sub: t("navRecordingsDesc")');
code = code.replace('label: "مديرو المحطات",   sub: "ربط المديرين بالمحطات"', 'label: t("navManagers"),   sub: t("navManagersDesc")');
// Oh wait, navAdmins might not be in the json, let's check.
// I will just add admin system translation to navItems if missing.
// Actually let's just write to the file and we will manually check later.

fs.writeFileSync(path, code);
console.log("Done");
