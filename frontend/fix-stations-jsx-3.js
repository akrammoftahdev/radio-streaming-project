const fs = require('fs');

// 1. Fix page.tsx syntax errors
const pagePath = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/stations/page.tsx';
let pageCode = fs.readFileSync(pagePath, 'utf8');

pageCode = pageCode.replace(
  '"{t("setupAndActive")}" : "{t("setupInactive")}"',
  't("setupAndActive") : t("setupInactive")'
);
pageCode = pageCode.replace(
  '"{t("notSetupYet")}"',
  't("notSetupYet")'
);

fs.writeFileSync(pagePath, pageCode);

// 2. Fix [id]/delete/page.tsx syntax errors
const deletePath = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/stations/[id]/delete/page.tsx';
let deleteCode = fs.readFileSync(deletePath, 'utf8');

// There are probably multiple places where I mistakenly left surrounding quotes like "t("someKey")" or "{t("someKey")}"
// Let's fix them in `delete/page.tsx`.
deleteCode = deleteCode.replace(/"t\("hasProgramsNote"\)"/g, 't("hasProgramsNote")');
deleteCode = deleteCode.replace(/"t\("noProgramsNote"\)"/g, 't("noProgramsNote")');
deleteCode = deleteCode.replace(/"t\("noPresentersNote"\)"/g, 't("noPresentersNote")');
deleteCode = deleteCode.replace(/"t\("noSinglePresentersNote"\)"/g, 't("noSinglePresentersNote")');
deleteCode = deleteCode.replace(/"t\("noManagersNote"\)"/g, 't("noManagersNote")');
deleteCode = deleteCode.replace(/"t\("noDjCredentialNote"\)"/g, 't("noDjCredentialNote")');
deleteCode = deleteCode.replace(/"t\("deleteDjCredentialBtn"\)"/g, 't("deleteDjCredentialBtn")');
deleteCode = deleteCode.replace(/"t\("deleteDjCredentialConfirm"\)"/g, 't("deleteDjCredentialConfirm")');
deleteCode = deleteCode.replace(/"t\("noRecordingsNote"\)"/g, 't("noRecordingsNote")');
deleteCode = deleteCode.replace(/"t\("noSonicNote"\)"/g, 't("noSonicNote")');
deleteCode = deleteCode.replace(/"t\("noSchedulesNote"\)"/g, 't("noSchedulesNote")');

// Also check for dynamic template strings mistakenly left in quotes like "`${t("hasPresentersNote", { n: deps.presenterStationLinks })}`"
deleteCode = deleteCode.replace(/"\$\{t\("hasPresentersNote", { n: deps.presenterStationLinks }\)\}"/g, 't("hasPresentersNote", { n: deps.presenterStationLinks })');
deleteCode = deleteCode.replace(/"\$\{t\("hasSinglePresentersNote", { n: deps.singleStationPresenters }\)\}"/g, 't("hasSinglePresentersNote", { n: deps.singleStationPresenters })');
deleteCode = deleteCode.replace(/"\$\{t\("hasManagersNote", { n: deps.stationManagers }\)\}"/g, 't("hasManagersNote", { n: deps.stationManagers })');
deleteCode = deleteCode.replace(/"\$\{t\("hasDjCredentialNote", { username: deps.defaultCredential.djUsername }\)\}"/g, 't("hasDjCredentialNote", { username: deps.defaultCredential.djUsername })');
deleteCode = deleteCode.replace(/"\$\{t\("hasRecordingsNote", { n: deps.recordings }\)\}"/g, 't("hasRecordingsNote", { n: deps.recordings })');
deleteCode = deleteCode.replace(/"\$\{t\("hasSonicNote", { n: deps.sonicCredentials }\)\}"/g, 't("hasSonicNote", { n: deps.sonicCredentials })');
deleteCode = deleteCode.replace(/"\$\{t\("hasSchedulesNote", { n: deps.broadcastSchedules }\)\}"/g, 't("hasSchedulesNote", { n: deps.broadcastSchedules })');


// And the dynamic button labels that were wrapped in quotes like "🗑 ${t("deleteNPrograms", { n: deps.programs })}"
deleteCode = deleteCode.replace(/"🗑 \$\{t\("deleteNPrograms", { n: deps\.programs }\)\}"/g, '`🗑 ${t("deleteNPrograms", { n: deps.programs })}`');
deleteCode = deleteCode.replace(/"\$\{t\("deleteProgramsConfirm", { n: deps\.programs }\)\}"/g, 't("deleteProgramsConfirm", { n: deps.programs })');
deleteCode = deleteCode.replace(/"\$\{t\("unlinkNPresenters", { n: deps\.presenterStationLinks }\)\}"/g, 't("unlinkNPresenters", { n: deps.presenterStationLinks })');
deleteCode = deleteCode.replace(/"\$\{t\("unlinkPresentersConfirm", { n: deps\.presenterStationLinks }\)\}"/g, 't("unlinkPresentersConfirm", { n: deps.presenterStationLinks })');
deleteCode = deleteCode.replace(/"\$\{t\("removeNManagers", { n: deps\.stationManagers }\)\}"/g, 't("removeNManagers", { n: deps.stationManagers })');
deleteCode = deleteCode.replace(/"\$\{t\("removeManagersConfirm", { n: deps\.stationManagers }\)\}"/g, 't("removeManagersConfirm", { n: deps.stationManagers })');

fs.writeFileSync(deletePath, deleteCode);

console.log("Syntax errors fixed!");
