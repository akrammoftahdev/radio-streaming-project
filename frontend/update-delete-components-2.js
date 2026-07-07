const fs = require('fs');

// wizard-client.tsx
let path = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/presenters/[id]/delete/wizard-client.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(/"سيتم تعطيل حساب المذيع\. يمكن إعادة تفعيله لاحقاً من صفحة التعديل\."/g, 't("deactivatePresenterConfirm")');
code = code.replace(/"سيتم حذف حساب المذيع نهائياً\. لا يمكن التراجع عن هذا الإجراء\."/g, 't("deletePresenterConfirm")');

code = code.replace(/>تعطيل المذيع</g, '>{t("deactivatePresenterTitle")}<');
code = code.replace(/>يوقف البث ويخفي الحساب. يمكن التراجع عنه لاحقاً. البيانات والتسجيلات محفوظة\.</g, '>{t("deactivatePresenterDesc")}<');
code = code.replace(/>✅ تم تعطيل المذيع بنجاح</g, '>✅ {t("deactivatePresenterSuccess")}<');
code = code.replace(/>جارٍ التعطيل\.\.\.</g, '>{t("deactivating")}<');
code = code.replace(/"تعطيل المذيع" : "المذيع معطّل بالفعل"/g, 't("deactivatePresenterBtn") : t("presenterAlreadyDeactivated")');

code = code.replace(/>⚠ حذف نهائي</g, '>⚠ {t("hardDeleteTitle")}<');
code = code.replace(/>يحذف الحساب والبيانات المرتبطة به نهائياً. هذا الإجراء لا يمكن التراجع عنه\.</g, '>{t("hardDeleteDesc")}<');
code = code.replace(/>جارٍ الحذف\.\.\.</g, '>{t("deleting")}<');
code = code.replace(/"حذف المذيع نهائياً"/g, 't("hardDeleteBtn")');
code = code.replace(/>🔒 الحذف النهائي غير متاح</g, '>🔒 {t("hardDeleteUnavailable")}<');

fs.writeFileSync(path, code);


// cleanup-button.tsx
path = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/presenters/[id]/delete/cleanup-button.tsx';
code = fs.readFileSync(path, 'utf8');

code = code.replace(/>✅ تم بنجاح</g, '>✅ {t("success")}<');
code = code.replace(/>جارٍ التنظيف\.\.\.</g, '>{t("cleaningUp")}<');

fs.writeFileSync(path, code);
