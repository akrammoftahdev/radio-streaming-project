const fs = require('fs');

const basePath = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/stations';

let actionsCode = fs.readFileSync(`${basePath}/actions.ts`, 'utf8');

if (!actionsCode.includes('next-intl/server')) {
  actionsCode = actionsCode.replace(
    'import { encrypt } from "@/lib/encryption";',
    'import { encrypt } from "@/lib/encryption";\nimport { getTranslations } from "next-intl/server";'
  );
}

// Inject `const t = await getTranslations("admin.stations");` into every exported async function
const funcs = ['createStation', 'toggleStationActive', 'updateStation', 'updateStationDefaultCredential'];
for (const fn of funcs) {
  const regex = new RegExp(`export async function ${fn}\\([^\\)]+\\) {`);
  const match = actionsCode.match(regex);
  if (match) {
    if (!actionsCode.includes(`const t = await getTranslations("admin.stations");`, match.index)) {
      actionsCode = actionsCode.replace(match[0], `${match[0]}\n  const t = await getTranslations("admin.stations");`);
    }
  }
}

actionsCode = actionsCode.replace(/"إما اترك بيانات DJ فارغة أو أكملها بالكامل \(Host \+ Port \+ DJ Username \+ DJ Password\)\."/g, 't("errIncompleteDj")');
actionsCode = actionsCode.replace(/"اسم المحطة مطلوب\."/g, 't("errNameRequired")');
actionsCode = actionsCode.replace(/"Slug غير صالح\. استخدم أحرفاً إنجليزية وأرقاماً وشرطات فقط\."/g, 't("errSlugInvalid")');
actionsCode = actionsCode.replace(/"رقم المنفذ \(Port\) يجب أن يكون بين 1 و 65535\."/g, 't("errPortInvalid")');
actionsCode = actionsCode.replace(/`المحطة بالـ slug "\$\{slug\}" موجودة بالفعل\.`/g, 't("errSlugExists", { slug })');
actionsCode = actionsCode.replace(/"DJ Port يجب أن يكون بين 1 و 65535\."/g, 't("errDjPortInvalid")');
actionsCode = actionsCode.replace(/"DJ Bitrate يجب أن يكون بين 8 و 320 kbps\."/g, 't("errDjBitrateInvalid")');

actionsCode = actionsCode.replace(/"المحطة غير موجودة\."/g, 't("errStationNotFound")');
actionsCode = actionsCode.replace(/"Host مطلوب\."/g, 't("errHostRequired")');
actionsCode = actionsCode.replace(/"DJ Username مطلوب\."/g, 't("errDjUsernameRequired")');
actionsCode = actionsCode.replace(/"Port يجب أن يكون بين 1 و 65535\."/g, 't("errPortInvalid2")');
actionsCode = actionsCode.replace(/"Bitrate يجب أن يكون بين 8 و 320 kbps\."/g, 't("errBitrateInvalid")');
actionsCode = actionsCode.replace(/"DJ Password مطلوب عند إنشاء بيانات DJ لأول مرة\."/g, 't("errDjPasswordRequired")');

fs.writeFileSync(`${basePath}/actions.ts`, actionsCode);

console.log("actions.ts updated!");
