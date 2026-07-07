const fs = require('fs');

const path = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/presenters/[id]/edit/page.tsx';
let code = fs.readFileSync(path, 'utf8');

const actions = [
  "updatePresenterStations",
  "updatePresenter",
  "updatePresenterPassword",
  "createDirectDjRadio",
  "toggleDirectDjRadio",
  "deleteDirectDjRadio",
  "updateDirectDjRadio"
];

for (const action of actions) {
  const searchStr = `async function ${action}(formData: FormData) {\n    "use server";`;
  if (code.includes(searchStr)) {
    code = code.replace(
      searchStr,
      `${searchStr}\n    const t = await getTranslations("admin.presenters");\n    const tc = await getTranslations("common");`
    );
  } else {
    // Also try without formData in case
    const searchStr2 = `async function ${action}(formData: FormData) {\n    "use server";\n    const session = await auth();`;
    // Let's just use regex
    const regex = new RegExp(`(async function ${action}\\(.*?\\) \\{[\\s\\S]*?"use server";)`, 'g');
    code = code.replace(regex, `$1\n    const t = await getTranslations("admin.presenters");\n    const tc = await getTranslations("common");`);
  }
}

fs.writeFileSync(path, code);
console.log("Fixed server actions t scope.");
