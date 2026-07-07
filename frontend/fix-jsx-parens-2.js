const fs = require('fs');

function fix(filePath) {
  let code = fs.readFileSync(filePath, 'utf8');
  // `t("key"}` -> `t("key")`
  code = code.replace(/t\("([^"]+)"\}/g, 't("$1")');
  // `setMode("all"}` -> `setMode("all")`
  code = code.replace(/setMode\("all"\}/g, 'setMode("all")');
  code = code.replace(/setStatus\("all"\}/g, 'setStatus("all")');
  code = code.replace(/setSort\("newest"\}/g, 'setSort("newest")');
  code = code.replace(/setValidity\("all"\}/g, 'setValidity("all")');
  code = code.replace(/setQ\(""\}/g, 'setQ("")');
  code = code.replace(/params.delete\("validity"\}/g, 'params.delete("validity")');
  code = code.replace(/params.delete\("page"\}/g, 'params.delete("page")');
  code = code.replace(/!== "all"\}/g, '!== "all")');
  code = code.replace(/initialMode     \|\| "all"\}/g, 'initialMode     || "all")');
  code = code.replace(/initialStatus   \|\| "all"\}/g, 'initialStatus   || "all")');
  code = code.replace(/initialSort     \|\| "newest"\}/g, 'initialSort     || "newest")');
  code = code.replace(/initialValidity \|\| "all"\}/g, 'initialValidity || "all")');
  
  fs.writeFileSync(filePath, code);
}

fix('/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/presenters/presenters-filter.tsx');
fix('/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/presenters/[id]/edit/page.tsx');
console.log("Fixed.");
