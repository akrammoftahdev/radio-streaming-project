const fs = require('fs');

const path = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/presenters/new/page.tsx';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes('useTranslations')) {
  code = code.replace(
    'import React, { useState, useEffect } from "react";',
    'import React, { useState, useEffect } from "react";\nimport { useTranslations } from "next-intl";'
  );
}

// Re-write ACCOUNT_TYPES to use translation keys instead of raw strings
code = code.replace(
  'label: "مذيع محطة واحدة",\n    desc: "ينتمي لمحطة داخلية واحدة فقط. يدخل الاستوديو عبر جدول البرامج والمواعيد.",',
  'labelKey: "singleStationLabel",\n    descKey: "singleStationDesc",'
);
code = code.replace(
  'label: "مذيع متعدد المحطات",\n    desc: "يمكن ربطه بأكثر من محطة. يُدار بالكامل من الإدارة. يستخدم جدول البرامج.",',
  'labelKey: "multiStationLabel",\n    descKey: "multiStationDesc",'
);
code = code.replace(
  'label: "DJ مباشر",\n    desc: "خارج نظام المحطات والجداول تماماً. يتصل مباشرة بإذاعاته الشخصية.",',
  'labelKey: "directDjLabel",\n    descKey: "directDjDesc",'
);
code = code.replace('label: string;', 'labelKey: any;');
code = code.replace('desc: string;', 'descKey: any;');

// Add hook
if (!code.includes('const t = useTranslations')) {
  code = code.replace(
    'export default function NewPresenterPage() {',
    'export default function NewPresenterPage() {\n  const t = useTranslations("admin.presenters");\n  const tc = useTranslations("common");'
  );
}

// Render ACCOUNT_TYPES list
code = code.replace(
  '{type.label}',
  '{t(type.labelKey)}'
);
code = code.replace(
  '{type.desc}',
  '{t(type.descKey)}'
);

// Form step selected label/desc
code = code.replace(
  '{selected.label}',
  '{t(selected.labelKey)}'
);
code = code.replace(
  '{selected.desc}',
  '{t(selected.descKey)}'
);

// Other strings
code = code.replace(/"قائمة المذيعين"/g, 't("presenterList")');
code = code.replace(/>قائمة المذيعين</g, '>{t("presenterList")}<');
code = code.replace(/"اختر نوع حساب المذيع"/g, 't("selectAccountType")');
code = code.replace(/>اختر نوع حساب المذيع</g, '>{t("selectAccountType")}<');
code = code.replace(
  />نوع الحساب يحدد سلوك الاستوديو وبيانات الاعتماد\.\s*لا يمكن تغييره من الواجهة بعد الإنشاء\.</g,
  '>{t("accountTypeDesc")} {t("accountTypeCannotChange")}<'
);
code = code.replace(/>تغيير النوع</g, '>{t("changeType")}<');
code = code.replace(/>إضافة مقدم جديد</g, '>{t("addNewPresenter")}<');
code = code.replace(
  /✅ تمت إضافة المقدم بنجاح! يمكنك إضافة مقدم آخر أو العودة للقائمة\./g,
  '{t("successAddPresenter")}'
);
code = code.replace(/"يجب اختيار محطة واحدة لهذا النوع من الحسابات\."/g, 't("validationSingleStation")');
code = code.replace(/"يجب اختيار محطة واحدة على الأقل لهذا النوع من الحسابات\."/g, 't("validationMultiStation")');
code = code.replace(/"حدث خطأ أثناء الإضافة"/g, 't("addError")');
code = code.replace(/"استجابة غير متوقعة من الخادم \([^)]+\)\. تأكد من تسجيل الدخول وإعادة المحاولة\."/g, 't("unexpectedResponse", { status: res.status })');
code = code.replace(/"حدث خطأ في الاتصال"/g, 't("connectionError")');

// Fields
code = code.replace(/>الاسم الكامل</g, '>{tc("name")}<');
code = code.replace(/placeholder="مثال: أحمد محمد"/g, '');
code = code.replace(/>اسم المستخدم <span/g, '>{tc("username")} <span');
code = code.replace(/>كلمة المرور <span/g, '>{tc("password")} <span');
code = code.replace(/>البريد الإلكتروني</g, '>{tc("email")}<');
code = code.replace(/>رقم الهاتف</g, '>{tc("phone")}<');

code = code.replace(/>الحساب نشط</g, '>{tc("active")}<'); // or something similar. Let's use active
code = code.replace(/>مسموح له بالبث</g, '>{t("broadcastAllowed")}<');

code = code.replace(/>المحطة <span/g, '>{t("stationRequired")} <span');
code = code.replace(/>المحطات <span/g, '>{t("stationsRequired")} <span');

code = code.replace(/>اختر المحطة الوحيدة لهذا المذيع. لا يمكن تغييرها لاحقاً من واجهة المستخدم العادية\.</g, '>{t("singleStationHint")}<');
code = code.replace(/>اختر محطة واحدة على الأقل. يمكن تعديل المحطات لاحقاً من صفحة تعديل المذيع\.</g, '>{t("multiStationHint")}<');

code = code.replace(/>جاري تحميل المحطات\.\.\.</g, '>{t("loadingStations")}<');
code = code.replace(/>لا توجد محطات نشطة. أضف محطة أولاً\.</g, '>{t("noActiveStations")}<');

code = code.replace(/"إذاعات DJ المباشر:"/g, 't("directDjNote")');
code = code.replace(/>إذاعات DJ المباشر:</g, '>{t("directDjNote")}<');
code = code.replace(/>يمكن إضافة الإذاعات الشخصية من صفحة تعديل المذيع بعد إنشاء الحساب. هذا الحساب لا يرتبط بمحطات داخلية\.</g, '>{t("directDjNoteDesc")}<');

code = code.replace(/"جاري الإضافة\.\.\."/g, 't("adding")');
code = code.replace(/"إضافة \$\{selected\.label\}"/g, 't("addPresenterOfType", { type: t(selected.labelKey) })');

// Wait, the error text is sometimes passed directly or using t()
// "successAddPresenter" doesn't exist in json. Let's see if we can use a generic success.
// "savedPresenter" exists in json.
code = code.replace(/\{t\("successAddPresenter"\)\}/g, '✅ {t("savedPresenter")}');

fs.writeFileSync(path, code);
console.log("Done");
