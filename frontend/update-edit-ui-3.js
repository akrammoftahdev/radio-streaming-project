const fs = require('fs');

const path = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/presenters/[id]/edit/page.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(/`المحطة \$\{sid\} غير موجودة أو غير نشطة\`/g, 't("errorStationNotFound", { sid })');
code = code.replace(/🗑️ إدارة الحذف/g, '🗑️ {t("manageDelete")}');
code = code.replace(/هذه الصلاحية تحدد ما إذا كان حساب المذيع فعالاً ويمكنه استخدام المنصة\./g, '{t("presenterActiveHint1")}');
code = code.replace(/مواعيد البرامج والبث تُدار من\{" "\}/g, '{t("presenterActiveHint2")}{" "}');
code = code.replace(/⚠️ لم يتم تعيين محطة بعد\. استخدم صفحة إضافة مذيع جديد لتعيين محطة أو تواصل مع المطور\./g, '⚠️ {t("singleStationLocked")}');
code = code.replace(/لا توجد محطات نشطة بعد\.\{" "\}/g, '{t("noActiveStationsYet")}{" "}');
code = code.replace(/تغيير كلمة المرور/g, '{tc("changePassword")}');
code = code.replace(/\{presenter\.directDjRadios\.length\} إذاعة/g, '{t("radioCount", { count: presenter.directDjRadios.length })}');
code = code.replace(/📡 إضافة الإذاعة/g, '📡 {t("addRadio")}');

fs.writeFileSync(path, code);
