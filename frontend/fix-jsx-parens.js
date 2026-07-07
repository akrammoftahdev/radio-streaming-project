const fs = require('fs');

function fix(filePath) {
  let code = fs.readFileSync(filePath, 'utf8');
  code = code.replace(/useTranslations\("([^"]+)"\}/g, 'useTranslations("$1")');
  fs.writeFileSync(filePath, code);
}

fix('/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/presenters/presenters-filter.tsx');
fix('/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/presenters/[id]/edit/page.tsx');
console.log("Fixed.");
