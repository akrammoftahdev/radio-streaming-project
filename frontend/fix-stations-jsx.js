const fs = require('fs');

const path = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/stations/page.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(/title="\{t\("presentersCount"\)\}"/g, 'title={t("presentersCount")}');
code = code.replace(/title="\{t\("programsCount"\)\}"/g, 'title={t("programsCount")}');
code = code.replace(/title="\{t\("recordingsCount"\)\}"/g, 'title={t("recordingsCount")}');
code = code.replace(/title="\{t\("managersCount"\)\}"/g, 'title={t("managersCount")}');

fs.writeFileSync(path, code);
console.log("Fixed JSX syntax errors!");
