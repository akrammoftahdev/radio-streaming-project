const fs = require('fs');

const arPath = './frontend/messages/ar.json';
const enPath = './frontend/messages/en.json';

let ar = JSON.parse(fs.readFileSync(arPath, 'utf8'));
let en = JSON.parse(fs.readFileSync(enPath, 'utf8'));

ar.common.username = "اسم المستخدم";
ar.common.password = "كلمة المرور";
ar.common.confirmPassword = "تأكيد كلمة المرور";

en.common.username = "Username";
en.common.password = "Password";
en.common.confirmPassword = "Confirm Password";

fs.writeFileSync(arPath, JSON.stringify(ar, null, 2));
fs.writeFileSync(enPath, JSON.stringify(en, null, 2));
