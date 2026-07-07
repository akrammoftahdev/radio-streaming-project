const fs = require('fs');

const path = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/presenters/new/page.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(/استجابة غير متوقعة من الخادم \(\$\{res.status\}\)\. تأكد من تسجيل الدخول وإعادة المحاولة\./g, 't("unexpectedResponse", { status: res.status })');
code = code.replace(/قائمة المذيعين/g, '{t("presenterList")}');
code = code.replace(/اختر نوع حساب المذيع/g, '{t("selectAccountType")}');
code = code.replace(/نوع الحساب يحدد سلوك الاستوديو وبيانات الاعتماد\./g, '{t("accountTypeDesc")}');
code = code.replace(/لا يمكن تغييره من الواجهة بعد الإنشاء\./g, '{t("accountTypeCannotChange")}');
code = code.replace(/تغيير النوع/g, '{t("changeType")}');
code = code.replace(/يمكن إضافة الإذاعات الشخصية من صفحة تعديل المذيع بعد إنشاء الحساب\. هذا الحساب لا يرتبط بمحطات داخلية\./g, '{t("directDjNoteDesc")}');
code = code.replace(/`إضافة \$\{selected\.label\}`/g, 't("addPresenterOfType", { type: t(selected.labelKey) })');

fs.writeFileSync(path, code);
console.log("Done");
