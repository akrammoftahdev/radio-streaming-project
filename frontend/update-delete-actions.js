const fs = require('fs');

const path = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/presenters/[id]/delete/actions.ts';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes('getTranslations')) {
  code = code.replace(
    'import { prisma } from "@/auth";',
    'import { prisma } from "@/auth";\nimport { getTranslations } from "next-intl/server";'
  );
}

// Ensure every server action gets the translation context
// We can just add `const t = await getTranslations("admin.presenters");` inside each exported action function if it's not there, but it's simpler to just do text replacement for the specific errors.

// Actually, instead of replacing them all perfectly, I'll just replace the specific hardcoded strings with `(await getTranslations("admin.presenters"))("key")`.
// This avoids parsing the AST.

code = code.replace(/"معرّف المذيع مطلوب"/g, '(await getTranslations("admin.presenters"))("errorPresenterIdRequired")');
code = code.replace(/"المذيع غير موجود"/g, '(await getTranslations("admin.presenters"))("errorPresenterNotFound")');

code = code.replace(
  /deps\.activePrograms > 0 \? `\$\{deps\.activePrograms\} برنامج نشط` : null,/g,
  'deps.activePrograms > 0 ? (await getTranslations("admin.presenters"))("blockerActivePrograms", { count: deps.activePrograms }) : null,'
);
code = code.replace(
  /deps\.recordings\s*> 0 \? `\$\{deps\.recordings\} تسجيل`\s*: null,/g,
  'deps.recordings > 0 ? (await getTranslations("admin.presenters"))("blockerRecordings", { count: deps.recordings }) : null,'
);
code = code.replace(
  /deps\.liveSessions\s*> 0 \? `\$\{deps\.liveSessions\} جلسة بث`\s*: null,/g,
  'deps.liveSessions > 0 ? (await getTranslations("admin.presenters"))("blockerLiveSessions", { count: deps.liveSessions }) : null,'
);
code = code.replace(
  /deps\.schedules\s*> 0 \? `\$\{deps\.schedules\} جدول بث`\s*: null,/g,
  'deps.schedules > 0 ? (await getTranslations("admin.presenters"))("blockerLegacySchedules", { count: deps.schedules }) : null,'
);

code = code.replace(
  /\]\.filter\(Boolean\)\.join\(" · "\) \+ " — يمنع الحذف النهائي",/g,
  '].filter(Boolean).join(" · ") + " — " + (await getTranslations("admin.presenters"))("blocksHardDelete"),'
);

code = code.replace(/"فشل الحذف — لا يزال هناك ارتباط بجداول أخرى لم تُنظَّف. راجع قائمة التبعيات وأعد المحاولة."/g, '(await getTranslations("admin.presenters"))("errorDeleteFailedDependencies")');
code = code.replace(/`فشل الحذف: \$\{msg\.slice\(0, 150\)\}`/g, '(await getTranslations("admin.presenters"))("errorDeleteFailed", { msg: msg.slice(0, 150) })');

code = code.replace(/"لا يمكن تنظيف جلسات مستخدم من نوع ADMIN أو STATION_MANAGER"/g, '(await getTranslations("admin.presenters"))("errorCannotCleanupAdminSessions")');
code = code.replace(/"يجب حذف تسجيلات المذيع أولاً قبل تنظيف جلسات البث\."/g, '(await getTranslations("admin.presenters"))("errorMustDeleteRecordingsFirst")');

fs.writeFileSync(path, code);
console.log("Done");
