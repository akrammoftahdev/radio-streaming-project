const fs = require('fs');

// 1. Fix page.tsx metadata
const pagePath = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/stations/page.tsx';
let pageCode = fs.readFileSync(pagePath, 'utf8');

pageCode = pageCode.replace(
  'export const metadata = {\n  title: "إدارة {t("title")} - EGONAIR",\n};',
  'export async function generateMetadata() {\n  const { getTranslations } = await import("next-intl/server");\n  const t = await getTranslations("admin.stations");\n  return { title: t("metaTitle", { name: "EGONAIR" }) };\n}'
);

fs.writeFileSync(pagePath, pageCode);

// 2. Fix [id]/delete/page.tsx syntax errors
const deletePath = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/stations/[id]/delete/page.tsx';
let deleteCode = fs.readFileSync(deletePath, 'utf8');

// It was: ? "لا توجد برامج — يمكن {t("deleteStation")}."
deleteCode = deleteCode.replace(
  '        ? "لا توجد برامج — يمكن {t("deleteStation")}."',
  '        ? `لا توجد برامج — يمكن ${t("deleteStation")}.`'
);

fs.writeFileSync(deletePath, deleteCode);

console.log("Syntax errors fixed!");
