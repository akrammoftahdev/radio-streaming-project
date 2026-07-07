const fs = require('fs');

const path = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/presenters/page.tsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Add getTranslations and getLocale to imports
if (!code.includes('next-intl/server')) {
  code = code.replace(
    'import { AdminPageShell } from "@/components/ui";',
    'import { AdminPageShell } from "@/components/ui";\nimport { getTranslations, getLocale } from "next-intl/server";'
  );
}

// 2. Add t inside PresentersPage
code = code.replace(
  'export default async function PresentersPage({',
  'export default async function PresentersPage({\n'
);
code = code.replace(
  'const session = await auth();',
  'const session = await auth();\n  const t = await getTranslations("admin.presenters");\n  const tc = await getTranslations("common");\n  const locale = await getLocale();'
);

// 3. Metadata - update title (in generateMetadata instead of export const metadata)
// wait, page.tsx currently has: export const metadata = { title: "إدارة المذيعين - EGONAIR" };
code = code.replace(
  'export const metadata = {\n  title: "إدارة المذيعين - EGONAIR",\n};',
  'export async function generateMetadata() {\n  const t = await getTranslations("admin.presenters");\n  return { title: t("metaTitle", { name: "EGONAIR" }) };\n}'
);

// 4. Header & Filters
code = code.replace('إدارة المذيعين\n            </h1>', '{t("title")}\n            </h1>');
code = code.replace('فلترة: <span className="font-medium">{filterLabel}</span>', '{t("filterLabel")} <span className="font-medium">{filterLabel}</span>');
code = code.replace('إلغاء الفلتر', '{t("clearFilter")}');
code = code.replace('لوحة الإدارة', '{t("backToDashboard")}');
code = code.replace('إضافة مذيع', '{t("addNewPresenter")}');

// 5. Filter labels (selectedStationNames)
code = code.replace(
  'id === "none" ? "غير مرتبط بمحطة"',
  'id === "none" ? t("filterNotLinked")'
);

// 6. Pagination text
code = code.replace(
  'صفحة <span className="text-neutral-300 font-medium">{page}</span> من{" "}\n        <span className="text-neutral-300 font-medium">{totalPages}</span>',
  '{t("pageOf", { page: `<span className="text-neutral-300 font-medium">${page}</span>`, totalPages: `<span className="text-neutral-300 font-medium">${totalPages}</span>` })}'
);
// wait, passing HTML to t() in next-intl is tricky if not using rich text. It's better to just do:
code = code.replace(
  '{t("pageOf", { page: `<span className="text-neutral-300 font-medium">${page}</span>`, totalPages: `<span className="text-neutral-300 font-medium">${totalPages}</span>` })}',
  'صفحة <span className="text-neutral-300 font-medium">{page}</span> من{" "}\n        <span className="text-neutral-300 font-medium">{totalPages}</span>'
); // Revert

code = code.replace('صفحة <span className="text-neutral-300 font-medium">{page}</span> من{" "}\n        <span className="text-neutral-300 font-medium">{totalPages}</span>', 
  '{t("page")} <span className="text-neutral-300 font-medium">{page}</span> {t("of")} <span className="text-neutral-300 font-medium">{totalPages}</span>'
);
// Wait, I don't know if "page" and "of" exist. 
// The actual keys are: "pageOf": "صفحة {page} من {totalPages}". But it includes the variables directly.
code = code.replace(
  '{t("page")} <span className="text-neutral-300 font-medium">{page}</span> {t("of")} <span className="text-neutral-300 font-medium">{totalPages}</span>',
  '{t("pageOf", { page, totalPages })}'
);
code = code.replace('{" "}· {presenters.length > 0 ? `${finalSkip + 1}–${finalSkip + presenters.length}` : "0"} من {totalCount} مذيع', 
  '{" "}· {presenters.length > 0 ? t("showingRange", { start: finalSkip + 1, end: finalSkip + presenters.length, total: totalCount }) : t("showingZero", { total: totalCount })}'
);
code = code.replace('عدد النتائج:', '{t("resultsCount")}');
code = code.replace(/>تطبيق</g, '>{tc("apply")}<');
code = code.replace(/>السابق</g, '>{t("previous")}<');
code = code.replace(/>التالي</g, '>{t("next")}<');

// 7. Empty State
code = code.replace(/"لا يوجد مذيعون متطابقون مع بحثك"/g, 't("noMatchingPresenters")');
code = code.replace(/"لا يوجد مذيعين حالياً"/g, 't("noPresenters")');
code = code.replace(/"جرب تعديل الفلاتر أو مسحها لرؤية نتائج أكثر."/g, 't("tryAdjustFilters")');
code = code.replace(/"أضف مذيعاً جديداً للبدء."/g, 't("addFirstPresenter")');

// 8. Presenter list items
code = code.replace('label={presenter.isActive ? "نشط" : "غير نشط"}', 'label={presenter.isActive ? t("filterActive") : t("filterInactive")}');
code = code.replace('label={presenter.canBroadcast ? "بث مسموح" : "بث موقوف"}', 'label={presenter.canBroadcast ? t("broadcastAllowed") : t("broadcastStopped")}');
code = code.replace(
  'presenter.presenterMode === "DIRECT_DJ"\n                          ? "🎙️ DJ مباشر"\n                          : presenter.presenterMode === "MULTI_STATION"\n                          ? "📡 متعدد"\n                          : "📻 محطة واحدة"',
  'presenter.presenterMode === "DIRECT_DJ"\n                          ? `🎙️ ${t("filterDirectDj")}`\n                          : presenter.presenterMode === "MULTI_STATION"\n                          ? `📡 ${t("filterMultiStation")}`\n                          : `📻 ${t("filterSingleStation")}`'
);

code = code.replace(/>غير مرتبط بمحطة</g, '>{t("filterNotLinked")}<');

code = code.replace(
  '{new Date(presenter.validity.validFrom).toLocaleDateString("ar-EG")}',
  '{new Date(presenter.validity.validFrom).toLocaleDateString(locale)}'
);
code = code.replace(
  '{new Date(presenter.validity.validTo).toLocaleDateString("ar-EG")}',
  '{new Date(presenter.validity.validTo).toLocaleDateString(locale)}'
);
code = code.replace('>من: <span', '>{t("validFrom")}: <span');
code = code.replace('>إلى: <span', '>{t("validTo")}: <span');

code = code.replace(/>تعديل</g, '>{tc("edit")}<');
code = code.replace('{presenter.isActive ? "تعطيل" : "تفعيل"}', '{presenter.isActive ? t("disable") : t("enable")}');
code = code.replace(/>حذف</g, '>{tc("delete")}<');

fs.writeFileSync(path, code);
console.log("Done");
