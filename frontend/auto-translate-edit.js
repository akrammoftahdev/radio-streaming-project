const fs = require('fs');

const arPath = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/messages/ar.json';
const tsxPath = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/src/app/admin/presenters/[id]/edit/page.tsx';

const arObj = JSON.parse(fs.readFileSync(arPath, 'utf8'));
const commonKeys = arObj.common;
const presenterKeys = arObj.admin.presenters;

let code = fs.readFileSync(tsxPath, 'utf8');

// Ensure useTranslations is imported and instantiated
if (!code.includes('import { useTranslations }')) {
  code = code.replace(
    'import { useState, useEffect, FormEvent } from "react";',
    'import { useState, useEffect, FormEvent } from "react";\nimport { useTranslations } from "next-intl";'
  );
  code = code.replace(
    'export default function PresenterEditPage({ params }: { params: { id: string } }) {',
    'export default function PresenterEditPage({ params }: { params: { id: string } }) {\n  const t = useTranslations("admin.presenters");\n  const tc = useTranslations("common");'
  );
  // Wait, what if the component signature is slightly different? 
  // Let's use a regex to inject hooks right after the function opening.
  code = code.replace(
    /export default function PresenterEditPage\([^)]*\) \{/,
    match => `${match}\n  const t = useTranslations("admin.presenters");\n  const tc = useTranslations("common");`
  );
}

// Prepare replacement list: [key, arabicText, isCommon]
let replacers = [];

for (const [k, v] of Object.entries(presenterKeys)) {
  if (typeof v === 'string' && /[\u0600-\u06FF]/.test(v)) {
    replacers.push([k, v, false]);
  }
}
for (const [k, v] of Object.entries(commonKeys)) {
  if (typeof v === 'string' && /[\u0600-\u06FF]/.test(v)) {
    replacers.push([k, v, true]);
  }
}

// Sort by length descending to match longest first
replacers.sort((a, b) => b[1].length - a[1].length);

// Custom patches for text containing variables or tricky formatting
const customPatches = [
  [/>لا توجد محطات نشطة\.</g, '>{t("noActiveStations")}<'],
  [/>جاري تحميل المحطات\.\.\.</g, '>{t("loadingStations")}<'],
  [/"تعديل بيانات המذيع"/g, 't("editPageTitle")'], // maybe?
  [/`حذف المذيع نهائياً`/g, 't("hardDeleteBtn")'],
  // Add direct strings that might have variables inside them in TSX like `{deps.activePrograms} برنامج نشط`
  [/\{new Date\(validityData\.validFrom\)\.toLocaleDateString\("ar-EG"\)\}/g, '{new Date(validityData.validFrom).toLocaleDateString()}'],
  [/\{new Date\(validityData\.validTo\)\.toLocaleDateString\("ar-EG"\)\}/g, '{new Date(validityData.validTo).toLocaleDateString()}'],
  [/\{new Date\(validityData\.validFrom\)\.toLocaleString\("ar-EG", \{/g, '{new Date(validityData.validFrom).toLocaleString(undefined, {'],
  [/\{new Date\(validityData\.validTo\)\.toLocaleString\("ar-EG", \{/g, '{new Date(validityData.validTo).toLocaleString(undefined, {']
];

for (const [re, rep] of customPatches) {
  code = code.replace(re, rep);
}

for (const [k, v, isCommon] of replacers) {
  const func = isCommon ? 'tc' : 't';
  
  // 1. Match Exact string literals in double quotes
  // We need to escape regex specials in v
  const escapedV = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Replace EXACT quotes: "..." -> t("...")
  const reString = new RegExp(`"${escapedV}"`, 'g');
  code = code.replace(reString, `${func}("${k}")`);
  
  // Replace inside JSX text tags: >...< -> >{t("...")}<
  const reJsx = new RegExp(`>\\s*${escapedV}\\s*<`, 'g');
  code = code.replace(reJsx, `>{${func}("${k}")}<`);

  // Sometimes there's mixed spaces or newlines around
}

fs.writeFileSync(tsxPath, code);
console.log("Done auto-translation");
