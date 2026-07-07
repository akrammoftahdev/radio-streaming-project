const fs = require('fs');

function fixJSX(filePath) {
  let code = fs.readFileSync(filePath, 'utf8');
  // Match `prop=t("key")` and replace with `prop={t("key")}`
  // Regex looks for `=t("` followed by letters/numbers/underscore, followed by `")`
  code = code.replace(/=t\("([^"]+)"\)/g, '={t("$1")}');
  // Also check for `tc` just in case
  code = code.replace(/=tc\("([^"]+)"\)/g, '={tc("$1")}');
  fs.writeFileSync(filePath, code);
}

fixJSX('/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/presenters/presenters-filter.tsx');
fixJSX('/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/presenters/[id]/edit/page.tsx');
console.log("Fixed JSX syntax.");
