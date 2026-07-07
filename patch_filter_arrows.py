import re

path = 'frontend/src/app/admin/schedule/schedule-filter-bar.tsx'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if '{t("previous")}' in line:
        new_lines.append(line)
    elif '{t("next")}' in line:
        new_lines.append(line)
    elif '<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>' in line:
        # This is the old Previous arrow (Right-pointing)
        # We want it to be Left-pointing with rtl:rotate-180
        new_lines.append(line.replace(
            '<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
            '<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 rtl:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>'
        ))
    elif '<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>' in line:
        # This is the old Next arrow (Left-pointing)
        # We want it to be Right-pointing with rtl:rotate-180
        new_lines.append(line.replace(
            '<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
            '<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 rtl:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>'
        ))
    else:
        new_lines.append(line)

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Arrows patched.")
