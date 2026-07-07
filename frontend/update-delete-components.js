const fs = require('fs');

// wizard-client.tsx
let path = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/presenters/[id]/delete/wizard-client.tsx';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes('useTranslations')) {
  code = code.replace(
    'import { useState, useTransition } from "react";',
    'import { useState, useTransition } from "react";\nimport { useTranslations } from "next-intl";'
  );
  code = code.replace(
    'export function PresenterWizardClient({',
    'export function PresenterWizardClient({\n  presenterId,\n  isActive,\n  isHardDeleteSafe,\n  deactivateAction,\n  hardDeleteAction,\n}: Props) {\n  const t = useTranslations("admin.presenters");\n'
  );
  // Revert the double injection
  code = code.replace(
    '}: Props) {\n  const t = useTranslations("admin.presenters");\n\n  presenterId,\n  isActive,\n  isHardDeleteSafe,\n  deactivateAction,\n  hardDeleteAction,\n}: Props) {',
    '}: Props) {\n  const t = useTranslations("admin.presenters");'
  );
}

// Translations map for wizard-client.tsx
code = code.replace(/"إيقاف وتعطيل الحساب"/g, 't("deactivateAccount")');
code = code.replace(/"إعادة تفعيل الحساب"/g, 't("reactivateAccount")');
code = code.replace(/"جارٍ التعطيل..."/g, 't("deactivating")');
code = code.replace(/"جارٍ التفعيل..."/g, 't("reactivating")');
code = code.replace(/"حذف نهائي \(لا يمكن التراجع\)"/g, 't("hardDelete")');
code = code.replace(/"جارٍ الحذف النهائي..."/g, 't("hardDeleting")');
code = code.replace(/"الحساب نشط حالياً."/g, 't("accountActive")');
code = code.replace(/"الحساب معطّل. يمكن إعادة تفعيله أو حذفه نهائياً إن توفرت الشروط."/g, 't("accountInactive")');
code = code.replace(/"يجب تعطيل الحساب قبل التفكير بالحذف النهائي."/g, 't("mustDeactivateFirst")');
code = code.replace(/"هل أنت متأكد من تعطيل حساب هذا المذيع؟"/g, 't("deactivateConfirm")');
code = code.replace(/"هل أنت متأكد من إعادة تفعيل هذا المذيع؟"/g, 't("reactivateConfirm")');
code = code.replace(/"هل أنت متأكد تماماً من الحذف النهائي؟ لا يمكن استرجاع البيانات!"/g, 't("hardDeleteConfirm")');

fs.writeFileSync(path, code);


// cleanup-button.tsx
path = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/presenters/[id]/delete/cleanup-button.tsx';
code = fs.readFileSync(path, 'utf8');

if (!code.includes('useTranslations')) {
  code = code.replace(
    'import { useState, useTransition } from "react";',
    'import { useState, useTransition } from "react";\nimport { useTranslations } from "next-intl";'
  );
  code = code.replace(
    'export function CleanupButton({',
    'export function CleanupButton({\n  presenterId,\n  confirmText,\n  buttonLabel,\n  disabled,\n  action,\n}: Props) {\n  const t = useTranslations("admin.presenters");\n'
  );
  code = code.replace(
    '}: Props) {\n  const t = useTranslations("admin.presenters");\n\n  presenterId,\n  confirmText,\n  buttonLabel,\n  disabled,\n  action,\n}: Props) {',
    '}: Props) {\n  const t = useTranslations("admin.presenters");'
  );
}

code = code.replace(/"✅ تم بنجاح"/g, '`✅ ${t("cleanupSuccess")}`');
code = code.replace(/"جارٍ التنظيف..."/g, 't("cleaningUp")');

fs.writeFileSync(path, code);

console.log("Done");
