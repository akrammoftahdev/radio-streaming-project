const fs = require('fs');

const path = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/page.tsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Add getLocale to imports
code = code.replace(
  'import { getTranslations } from "next-intl/server";',
  'import { getTranslations, getLocale } from "next-intl/server";'
);

// 2. Change num() definition at module level to accept locale
code = code.replace(
  'const num = (v: number | "--") => (v === "--" ? "--" : v.toLocaleString("ar-EG"));',
  'const num = (v: number | "--", locale: string) => (v === "--" ? "--" : v.toLocaleString(locale));'
);

// 3. Update StatCard props and usage of num
code = code.replace(
  'function StatCard({ label, value, color, style, sub }: {',
  'function StatCard({ label, value, color, style, sub, locale }: {'
);
code = code.replace(
  'label: string; value: number | "--"; color?: string; style?: React.CSSProperties; sub?: string;',
  'label: string; value: number | "--"; color?: string; style?: React.CSSProperties; sub?: string; locale: string;'
);
code = code.replace(
  '{num(value)}</p>',
  '{num(value, locale)}</p>'
);

// 4. Update AdminDashboard to fetch locale and pass it
code = code.replace(
  'const t = await getTranslations("admin.dashboard");\n  const tc = await getTranslations("common");',
  'const locale = await getLocale();\n  const t = await getTranslations("admin.dashboard");\n  const tc = await getTranslations("common");\n  const ta = await getTranslations("auth");'
);

// 5. Update auth logout translation
code = code.replace('{tc("logout")}', '{ta("logout")}');

// 6. Update direct usages of num() in AdminDashboard
code = code.replace(
  '{num(s.currentlyLive)}',
  '{num(s.currentlyLive, locale)}'
);
code = code.replace(
  'count: num(s.mediaTracks)',
  'count: num(s.mediaTracks, locale)'
);

// 7. Update all StatCard usages to pass locale
code = code.replaceAll(
  '<StatCard label',
  '<StatCard locale={locale} label'
);

fs.writeFileSync(path, code);
console.log("Done");
