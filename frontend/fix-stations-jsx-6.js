const fs = require('fs');

const filterPath = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/stations/stations-filter.tsx';
let filterCode = fs.readFileSync(filterPath, 'utf8');

filterCode = filterCode.replace(
  'label="{tc("clearAllFilters")}"',
  'label={tc("clearAllFilters")}'
);

fs.writeFileSync(filterPath, filterCode);


const pagePath = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/stations/page.tsx';
let pageCode = fs.readFileSync(pagePath, 'utf8');

pageCode = pageCode.replace(
  'import { LanguageSwitcher } from "@/components/LanguageSwitcher";',
  'import LanguageSwitcher from "@/components/ui/LanguageSwitcher";'
);
pageCode = pageCode.replace(
  '<LanguageSwitcher />',
  '<LanguageSwitcher compact />'
);

fs.writeFileSync(pagePath, pageCode);

console.log("Fixed module not found and final jsx string error.");
