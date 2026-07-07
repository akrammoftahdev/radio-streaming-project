const fs = require('fs');

const path = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/page.tsx';
let code = fs.readFileSync(path, 'utf8');

// Metadata
code = code.replace(
  'export async function generateMetadata() {\n  const settings = await getSystemSettings();\n  return { title: `لوحة الإدارة — ${settings.systemName || "EGONAIR"}` };',
  'import { getTranslations } from "next-intl/server";\n\nexport async function generateMetadata() {\n  const settings = await getSystemSettings();\n  const t = await getTranslations("admin.dashboard");\n  return { title: t("metaTitle", { name: settings.systemName || "EGONAIR" }) };'
);

// We already have 'import { getTranslations } from "next-intl/server";' in the file but let's just make sure it compiles. Wait, `generateMetadata` can just import it. Actually since I already added it below, let me just remove it from below and put it at the top.
// Wait, I will just use `getTranslations` directly since it's imported at the top now?
// Let's check where it's imported.
code = code.replace(
  'import { getTranslations } from "next-intl/server";\n\nexport async function',
  'export async function'
); // if duplicated

// Nav Items missing translations:
code = code.replace(
  'label: "مدراء النظام",       sub: "إدارة النظام بصلاحيات كاملة"',
  'label: t("navAdmins"),       sub: t("navAdminsDesc")'
);
code = code.replace(
  'label: "مكتبة الوسائط",      sub: "إدارة المقاطع الصوتية"',
  'label: t("navMedia"),      sub: t("navMediaDesc")'
);
code = code.replace(
  'label: "إعدادات النظام",     sub: "الهوية، الألوان، وبيانات الدعم"',
  'label: t("navSettings"),     sub: t("navSettingsDesc")'
);

code = code.replace(
  '<span className="mr-auto text-xs text-amber-600">عرض ←</span>',
  '<span className="mr-auto text-xs text-amber-600">{t("warningView")}</span>'
);

fs.writeFileSync(path, code);
console.log("Done");
