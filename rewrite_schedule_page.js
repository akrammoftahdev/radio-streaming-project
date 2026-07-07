const fs = require('fs');

const path = 'frontend/src/app/admin/schedule/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add getTranslations and getLocale
content = content.replace(
  'import { ScheduleFilterBar } from "./schedule-filter-bar";',
  'import { ScheduleFilterBar } from "./schedule-filter-bar";\nimport { getTranslations, getLocale } from "next-intl/server";'
);

// 2. Change metadata (Next.js server component metadata with translations requires generateMetadata, but since it's hardcoded to Arabic, we can just leave it or change it. Let's leave metadata as is or remove it and use generateMetadata. For simplicity, just leave metadata as is, since it's just the page title tag).
// Actually, I'll update it to use generateMetadata if possible, but let's just do the component.

// 3. Inside AdminSchedulePage, call getTranslations and getLocale
content = content.replace(
  'const session = await auth();',
  'const session = await auth();\n  const t = await getTranslations("admin.schedule");\n  const locale = await getLocale();\n  const dir = locale === "ar" ? "rtl" : "ltr";'
);

// 4. Update DAY_NAMES to use translations
content = content.replace(
  /const DAY_NAMES: Record<number, string> = {[\s\S]*?};/,
  '// DAY_NAMES now generated inside component'
);

// 5. Update RECURRENCE_LABELS to use translations inside the component, but we can do it inline.
content = content.replace(
  /const RECURRENCE_LABELS: Record<string, string> = {[\s\S]*?};/,
  '// RECURRENCE_LABELS now generated inside component'
);

content = content.replace(
  'const { stations: stationsParam = "",',
  `const DAY_NAMES: Record<number, string> = {
    0: t("days.0"), 1: t("days.1"), 2: t("days.2"),
    3: t("days.3"), 4: t("days.4"), 5: t("days.5"), 6: t("days.6"),
  };
  const RECURRENCE_LABELS: Record<string, string> = {
    DAILY: t("daily"), WEEKLY: t("weekly"),
    SELECTED_DAYS: t("selectedDays"), ONE_TIME: t("oneTime"),
  };
  const { stations: stationsParam = "",`
);

// 6. Replace dir="rtl" with dir={dir}
content = content.replace(
  '<div dir="rtl" className="min-h-screen',
  '<div dir={dir} className="min-h-screen'
);

// 7. Replace hardcoded text with t(...)
content = content.replace(
  '<h1 className="text-base font-bold text-neutral-100 leading-tight">جدول البث الأسبوعي</h1>',
  '<h1 className="text-base font-bold text-neutral-100 leading-tight">{t("title")}</h1>'
);

content = content.replace(
  '<p className="text-xs text-neutral-500">عرض كل المحطات والبرامج · الأسبوع الحالي</p>',
  '<p className="text-xs text-neutral-500">{t("subtitle")}</p>'
);

content = content.replace(
  '⚙️ إدارة البرامج',
  '{t("managePrograms")}'
);

content = content.replace(
  '🔍 تدقيق الجداول',
  '{t("auditSchedule")}'
);

content = content.replace(
  '← اللوحة',
  '{t("backToDashboard")}'
);

content = content.replace(
  '{ label: "برامج معروضة",',
  '{ label: t("programsShown"),'
);
content = content.replace(
  '{ label: "عدد الحصص",',
  '{ label: t("slotsCount"),'
);
content = content.replace(
  '{ label: "محطات",',
  '{ label: t("stations"),'
);
content = content.replace(
  '{ label: "مذيعون",',
  '{ label: t("presenters"),'
);

// 8. Add locale to ScheduleFilterBar
content = content.replace(
  '<ScheduleFilterBar',
  '<ScheduleFilterBar\n          locale={locale}'
);

// 9. Day column headers text
content = content.replace(
  'اليوم\n                        </span>',
  '{t("today")}\n                        </span>'
);
content = content.replace(
  '{entryCount} حصة\n                      </span>',
  '{entryCount} {t("slot")}\n                      </span>'
);

// 10. Empty state in columns
content = content.replace(
  '<p className="text-[11px] text-neutral-700 text-center">لا توجد<br />برامج</p>',
  '<p className="text-[11px] text-neutral-700 text-center" dangerouslySetInnerHTML={{ __html: t("noPrograms") }}></p>'
);

// 11. Edit link
content = content.replace(
  'تعديل ←\n                          </Link>',
  '{t("edit")}\n                          </Link>'
);

// 12. Main Empty state
content = content.replace(
  '{hasFilters ? "لا توجد برامج تطابق الفلتر المحدد." : "لا توجد برامج مجدولة حتى الآن."}',
  '{hasFilters ? t("noProgramsMatch") : t("noProgramsScheduled")}'
);

content = content.replace(
  'مسح الفلاتر\n                </Link>',
  '{t("clearFilters")}\n                </Link>'
);

// 13. Fix direction in columns wrapper: it has hardcoded `style={{ direction: "rtl" }}`.
// Instead of hardcoding, we just remove the style since it inherits from `<div dir={dir}>`.
content = content.replace(
  '<div className="grid grid-cols-7 divide-x divide-neutral-800" style={{ direction: "rtl" }}>',
  '<div className="grid grid-cols-7 divide-x divide-x-reverse divide-neutral-800">'
);
// Wait, tailwind `divide-x` might need `divide-x-reverse` when in RTL if it's explicitly set. But let's just use `divide-x rtl:divide-x-reverse` or similar. Since Next.js and Tailwind handle logical properties differently, let's just do `divide-x divide-neutral-800`.
content = content.replace(
  '<div className="grid grid-cols-7 divide-x divide-x-reverse divide-neutral-800">', // Revert the previous if we run it twice
  '<div className="grid grid-cols-7 divide-x rtl:divide-x-reverse divide-neutral-800">'
);
content = content.replace(
  '<div className="grid grid-cols-7 divide-x divide-neutral-800" style={{ direction: "rtl" }}>',
  '<div className="grid grid-cols-7 divide-x rtl:divide-x-reverse divide-neutral-800">'
);

fs.writeFileSync(path, content, 'utf8');
console.log('page.tsx rewritten');
