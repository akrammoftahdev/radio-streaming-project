const fs = require('fs');

const path = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/presenters/presenters-filter.tsx';
let code = fs.readFileSync(path, 'utf8');

// Add import
if (!code.includes('useTranslations')) {
  code = code.replace(
    'import { useState, useEffect } from "react";',
    'import { useState, useEffect } from "react";\nimport { useTranslations } from "next-intl";'
  );
}

// Add hook
if (!code.includes('const t = useTranslations')) {
  code = code.replace(
    'const router = useRouter();',
    'const router = useRouter();\n  const t = useTranslations("admin.presenters");'
  );
}

// Replacements
code = code.replace(/"غير مرتبط بمحطة"/g, 't("filterNotLinked")');
code = code.replace(/"بحث ذكي"/g, '{t("smartSearch")}'); // Inside JSX text usually, wait: <label>بحث ذكي</label> -> <label>{t("smartSearch")}</label>
code = code.replace(/>بحث ذكي</g, '>{t("smartSearch")}<');
code = code.replace(/"ابحث بالاسم، اسم المستخدم، الإيميل، أو الهاتف..."/g, 't("searchPlaceholder")');

code = code.replace(/>نوع الحساب</g, '>{t("filterAccountType")}<');
code = code.replace(/"الكل"/g, 't("filterAll")');
code = code.replace(/"محطة واحدة"/g, 't("filterSingleStation")');
code = code.replace(/"متعدد المحطات"/g, 't("filterMultiStation")');
code = code.replace(/"DJ مباشر"/g, 't("filterDirectDj")');

code = code.replace(/>الحالة</g, '>{t("filterStatus")}<');
code = code.replace(/"نشط"/g, 't("filterActive")');
code = code.replace(/"غير نشط"/g, 't("filterInactive")');

code = code.replace(/>المحطة</g, '>{t("filterStation")}<');
code = code.replace(/"كل المحطات"/g, 't("filterAllStations")');

code = code.replace(/>ترتيب</g, '>{t("filterSort")}<');
code = code.replace(/"الأحدث"/g, 't("filterNewest")');
code = code.replace(/"الأقدم"/g, 't("filterOldest")');
code = code.replace(/"الاسم أ-ي"/g, 't("filterNameAZ")');
code = code.replace(/"اسم المستخدم أ-ي"/g, 't("filterUsernameAZ")');

code = code.replace(/>صلاحية الاشتراك</g, '>{t("filterValidity")}<');
code = code.replace(/"نشطة الآن"/g, 't("filterValidNow")');
code = code.replace(/"منتهية"/g, 't("filterExpired")');
code = code.replace(/"تنتهي خلال 7 أيام"/g, 't("filterExpiring7Days")');
code = code.replace(/"بدون صلاحية"/g, 't("filterNoValidity")');

code = code.replace(/"مسح كل الفلاتر"/g, 't("clearAllFilters")');

fs.writeFileSync(path, code);
console.log("Done");
