const fs = require('fs');

const path = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/presenters/[id]/edit/page.tsx';
let code = fs.readFileSync(path, 'utf8');

// Title
code = code.replace(
  'title: "تعديل المذيع - EGONAIR",',
  'title: "Edit Presenter - EGONAIR",'
);

code = code.replace(
  'export const metadata = {\n  title: "Edit Presenter - EGONAIR",\n};',
  'export async function generateMetadata() {\n  const t = await getTranslations("admin.presenters");\n  return { title: t("editPageTitle", { name: "EGONAIR" }) };\n}'
);

// We need getTranslations for generateMetadata
if (!code.includes('import { getTranslations }')) {
  code = code.replace(
    'import { useTranslations } from "next-intl";',
    'import { useTranslations } from "next-intl";\nimport { getTranslations } from "next-intl/server";'
  );
}

// Replace exact UI text
code = code.replace(/>🗑️ إدارة الحذف</g, '>🗑️ {t("manageDelete")}<');
code = code.replace(/>هذه الصلاحية تحدد ما إذا كان حساب المذيع فعالاً ويمكنه استخدام المنصة\.</g, '>{t("presenterActiveHint1")}<');
code = code.replace(/>مواعيد البرامج والبث تُدار من\{" "\}</g, '>{t("presenterActiveHint2")}{" "}<');

code = code.replace(/>⚠️ لم يتم تعيين محطة بعد. استخدم صفحة إضافة مذيع جديد لتعيين محطة أو تواصل مع المطور\.</g, '>⚠️ {t("singleStationLocked")}<');
code = code.replace(/>لا توجد محطات نشطة بعد\.\{" "\}</g, '>{t("noActiveStationsYet")}{" "}<');

code = code.replace(/>تغيير كلمة المرور</g, '>{tc("changePassword")}<');

// radios length
code = code.replace(/>\{presenter\.directDjRadios\.length\} إذاعة</g, '>{t("radiosCount", { count: presenter.directDjRadios.length })}<');

// active/inactive, enable/disable
code = code.replace(/\{r\.isActive \? 'نشط' \: 'معطل'\}/g, '{r.isActive ? tc("active") : tc("inactive")}');
code = code.replace(/\{r\.isActive \? '⏸ تعطيل' \: '▶ تفعيل'\}/g, '{r.isActive ? `⏸ ${tc("disable")}` : `▶ ${tc("enable")}`}');

code = code.replace(/message=\{\`حذف إذاعة "\$\{r\.radioName\}"؟ لا يمكن التراجع\.\`\}/g, 'message={t("deleteRadioConfirm", { name: r.radioName })}');

code = code.replace(/>📡 إضافة الإذاعة</g, '>📡 {t("addRadio")}<');

// Server Action error messages
code = code.replace(/"المذيع غير موجود\."/g, 't("presenterNotFound")');
code = code.replace(/"لا يمكن تغيير محطة مذيع المحطة الواحدة من هذه الصفحة\."/g, 't("errorCannotChangeSingleStation")');
code = code.replace(/`المحطة \$\{sid\} غير موجودة أو غير نشطة\`/g, 't("errorStationNotFound", { sid })');
code = code.replace(/"اسم المستخدم يجب أن يكون 3 أحرف على الأقل"/g, 't("errorUsernameTooShort")');
code = code.replace(/"اسم المستخدم مستخدم بالفعل"/g, 't("errorUsernameTaken")');
code = code.replace(/"المحطة المختارة غير مرتبطة بهذا المذيع\."/g, 't("errorStationNotLinked")');
code = code.replace(/"وضع الحساب لا يسمح بإضافة إذاعات مباشرة\."/g, 't("errorModeNotDirectDj")');
code = code.replace(/"اسم الإذاعة مطلوب\."/g, 't("errorRadioNameRequired")');
code = code.replace(/"الخادم \(Host\) مطلوب\."/g, 't("errorHostRequired")');
code = code.replace(/"اسم مستخدم DJ مطلوب\."/g, 't("errorDjUserRequired")');
code = code.replace(/"كلمة المرور مطلوبة\."/g, 't("errorPasswordRequired")');
code = code.replace(/"المنفذ \(Port\) يجب أن يكون بين 1 و 65535\."/g, 't("errorPortInvalid")');
code = code.replace(/"معرّف الإذاعة مطلوب\."/g, 't("errorRadioIdRequired")');
code = code.replace(/"الإذاعة غير موجودة\."/g, 't("errorRadioNotFound")');
code = code.replace(/"الإذاعة غير موجودة أو ليست ملك هذا المذيع\."/g, 't("errorRadioNotOwned")');

fs.writeFileSync(path, code);
console.log("Done");
