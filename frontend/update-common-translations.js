const fs = require('fs');
const path = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/messages/';

['en.json', 'ar.json'].forEach(file => {
  const p = path + file;
  let data = JSON.parse(fs.readFileSync(p, 'utf8'));
  
  if (!data.common) data.common = {};
  
  const updatesEn = {
    "dashboard": "Dashboard",
    "oldest": "Oldest",
    "newest": "Newest",
    "nameAZ": "Name (A-Z)",
    "page": "Page",
    "of": "of",
    "resultsCount": "Results per page",
    "previous": "Previous",
    "next": "Next",
    "clearAllFilters": "Clear all filters"
  };
  
  const updatesAr = {
    "dashboard": "لوحة التحكم",
    "oldest": "الأقدم",
    "newest": "الأحدث",
    "nameAZ": "الاسم (أ-ي)",
    "page": "صفحة",
    "of": "من",
    "resultsCount": "النتائج بالصفحة",
    "previous": "السابق",
    "next": "التالي",
    "clearAllFilters": "مسح جميع الفلاتر"
  };
  
  const updates = file === 'en.json' ? updatesEn : updatesAr;
  
  Object.assign(data.common, updates);
  
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
});
console.log("Updated common translations");
