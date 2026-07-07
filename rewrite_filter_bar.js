const fs = require('fs');

const path = 'frontend/src/app/admin/schedule/schedule-filter-bar.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add useTranslations
content = content.replace(
  'import { ClearFiltersButton } from "@/components/ui/ClearFiltersButton";',
  'import { ClearFiltersButton } from "@/components/ui/ClearFiltersButton";\nimport { useTranslations } from "next-intl";'
);

// 2. Add `locale: string` to props
content = content.replace(
  'weekStartIso: string; isCurrentWeek: boolean;',
  'weekStartIso: string; isCurrentWeek: boolean; locale: string;'
);
content = content.replace(
  'weekStartIso, isCurrentWeek,',
  'weekStartIso, isCurrentWeek, locale,'
);

// 3. Move constants inside component to use useTranslations
content = content.replace(
  /const RECURRENCE_OPTIONS = \[[\s\S]*?\];/,
  ''
);

content = content.replace(
  'const sp     = useSearchParams();',
  `const sp     = useSearchParams();
  const t      = useTranslations("admin.schedule");

  const RECURRENCE_OPTIONS = [
    { value: "all",           label: t("all")        },
    { value: "DAILY",         label: t("daily")        },
    { value: "WEEKLY",        label: t("weekly")      },
    { value: "SELECTED_DAYS", label: t("selectedDays") },
    { value: "ONE_TIME",      label: t("oneTime")   },
  ];`
);

// 4. Update Time presets
content = content.replace(
  /const TIME_PRESETS = \[[\s\S]*?\];/,
  `const TIME_PRESETS = [
    { label: t("all"),      from: "",      to: ""      },
    { label: t("night"),     from: "00:00", to: "06:00" },
    { label: t("morning"),    from: "06:00", to: "12:00" },
    { label: t("noon"),   from: "12:00", to: "18:00" },
    { label: t("evening"),    from: "18:00", to: "24:00" },
  ];`
);

// 5. Update UI text
content = content.replace(
  '<span>السابق</span>',
  '<span>{t("previous")}</span>'
);
content = content.replace(
  '<span>التالي</span>',
  '<span>{t("next")}</span>'
);
content = content.replace(
  'اليوم\n            </button>',
  '{t("today")}\n            </button>'
);
content = content.replace(
  'placeholder="المحطات"',
  'placeholder={t("stations")}'
);
content = content.replace(
  'placeholder="المذيعون"',
  'placeholder={t("presenters")}'
);
content = content.replace(
  'label="مسح الكل"',
  'label={t("clearFilters")}'
);

// 6. Update fmtDate to use the correct locale
content = content.replace(
  'd.toLocaleDateString("ar-EG", { weekday: "short", month: "short", day: "numeric" });',
  'd.toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US", { weekday: "short", month: "short", day: "numeric" });'
);

fs.writeFileSync(path, content, 'utf8');
console.log('schedule-filter-bar.tsx rewritten');
