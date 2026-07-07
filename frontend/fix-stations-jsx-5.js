const fs = require('fs');

const pagePath = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/stations/page.tsx';
let pageCode = fs.readFileSync(pagePath, 'utf8');

pageCode = pageCode.replace(
  'label={station.isActive ? "{t("active")}" : "{t("inactive")}"}',
  'label={station.isActive ? t("active") : t("inactive")}'
);
pageCode = pageCode.replace(
  'label={station.defaultCredential.isActive ? "{t("djSetup")}" : "{t("djStopped")}"}',
  'label={station.defaultCredential.isActive ? t("djSetup") : t("djStopped")}'
);
pageCode = pageCode.replace(
  'label="{t("djNotSetup")}"',
  'label={t("djNotSetup")}'
);

fs.writeFileSync(pagePath, pageCode);


const deletePath = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/stations/[id]/delete/page.tsx';
let deleteCode = fs.readFileSync(deletePath, 'utf8');

deleteCode = deleteCode.replace(
  'buttonLabel="{t("hardDeleteBtn")}"',
  'buttonLabel={t("hardDeleteBtn")}'
);
deleteCode = deleteCode.replace(
  'confirmText={`{t("hardDeleteConfirmStart")} "${station.name}" {t("hardDeleteConfirmEnd")}`}',
  'confirmText={`${t("hardDeleteConfirmStart")} "${station.name}" ${t("hardDeleteConfirmEnd")}`}'
);

fs.writeFileSync(deletePath, deleteCode);

console.log("Fixed all remaining JSX syntax errors.");
