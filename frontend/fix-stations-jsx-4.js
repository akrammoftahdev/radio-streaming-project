const fs = require('fs');

const pagePath = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/stations/page.tsx';
let pageCode = fs.readFileSync(pagePath, 'utf8');

pageCode = pageCode.replace(/"\{t\("noStationsMatch"\)\}"/g, 't("noStationsMatch")');
pageCode = pageCode.replace(/"\{t\("noStationsYet"\)\}"/g, 't("noStationsYet")');
pageCode = pageCode.replace(/"\{t\("tryAdjustFilters"\)\}"/g, 't("tryAdjustFilters")');
pageCode = pageCode.replace(/"\{t\("addFirstStation"\)\}"/g, 't("addFirstStation")');

fs.writeFileSync(pagePath, pageCode);


const deletePath = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/stations/[id]/delete/page.tsx';
let deleteCode = fs.readFileSync(deletePath, 'utf8');

deleteCode = deleteCode.replace('{station.isActive ? "نشطة" : "{t("inactive")}"}', '{station.isActive ? t("active") : t("inactive")}');

fs.writeFileSync(deletePath, deleteCode);

console.log("Fixed final syntax errors.");
