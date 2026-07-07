const fs = require('fs');

const path = 'frontend/src/app/admin/schedule/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add the import
if (!content.includes('LanguageSwitcher')) {
  content = content.replace(
    'import Link from "next/link";',
    'import Link from "next/link";\nimport LanguageSwitcher from "@/components/ui/LanguageSwitcher";'
  );
}

// 2. Add the component to the action buttons section
// The section looks like this:
/*
          {/* Action buttons * /}
          <div className="flex items-center gap-2 flex-wrap">
*/
if (!content.includes('<LanguageSwitcher compact />')) {
  content = content.replace(
    '<div className="flex items-center gap-2 flex-wrap">',
    '<div className="flex items-center gap-2 flex-wrap">\n            <LanguageSwitcher compact />'
  );
}

fs.writeFileSync(path, content, 'utf8');
console.log('LanguageSwitcher added to schedule page.');
