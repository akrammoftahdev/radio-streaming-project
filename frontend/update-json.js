const fs = require('fs');
const path = require('path');

const dir = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/messages';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

const translations = {
  ar: { navAdmins: "مدراء النظام", navAdminsDesc: "إدارة النظام بصلاحيات كاملة" },
  en: { navAdmins: "System Admins", navAdminsDesc: "Full system administration" },
  fr: { navAdmins: "Admins Système", navAdminsDesc: "Administration complète du système" },
  es: { navAdmins: "Admin Sistema", navAdminsDesc: "Administración completa del sistema" },
  pt: { navAdmins: "Admins de Sistema", navAdminsDesc: "Administração completa do sistema" },
  de: { navAdmins: "Systemadmins", navAdminsDesc: "Vollständige Systemverwaltung" },
  tr: { navAdmins: "Sistem Yöneticileri", navAdminsDesc: "Tam sistem yönetimi" }
};

for (const file of files) {
  const lang = file.replace('.json', '');
  const filePath = path.join(dir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  if (!data.admin.dashboard) data.admin.dashboard = {};
  
  const trans = translations[lang] || translations['en'];
  data.admin.dashboard.navAdmins = trans.navAdmins;
  data.admin.dashboard.navAdminsDesc = trans.navAdminsDesc;
  
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

console.log("Done");
