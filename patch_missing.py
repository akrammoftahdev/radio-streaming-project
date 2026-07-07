import json

en_path = "frontend/messages/en.json"
ar_path = "frontend/messages/ar.json"

with open(en_path, "r") as f: en_json = json.load(f)
with open(ar_path, "r") as f: ar_json = json.load(f)

# 1. admin.presenters
ar_json["admin"]["presenters"]["dependencyWarning"] = "البنود الحمراء تمنع الحذف النهائي. نظّف ما يمكنك ثم اضغط \"حذف نهائي\" عند توفر الشروط."
en_json["admin"]["presenters"]["dependencyWarning"] = "Red items block hard deletion. Clean what you can, then click \"Hard Delete\" when conditions are met."

ar_json["admin"]["presenters"]["viewBtn"] = "عرض"
en_json["admin"]["presenters"]["viewBtn"] = "View"

ar_json["admin"]["presenters"]["backToEdit"] = "← العودة إلى صفحة التعديل"
en_json["admin"]["presenters"]["backToEdit"] = "← Back to Edit Page"

ar_json["admin"]["presenters"]["noteProgramsActive"] = "⚠ {count} برنامج نشط يمنع الحذف. انقر {cleanupPrograms} لتصفير العداد المانع."
en_json["admin"]["presenters"]["noteProgramsActive"] = "⚠ {count} active programs block deletion. Click {cleanupPrograms} to reset the counter."

# 2. admin.stations
ar_json["admin"]["stations"]["deleteStationTitle"] = "حذف المحطة"
en_json["admin"]["stations"]["deleteStationTitle"] = "Delete Station"

ar_json["admin"]["stations"]["noProgramsNoteDelete"] = "لا توجد برامج — يمكن {deleteStation}."
en_json["admin"]["stations"]["noProgramsNoteDelete"] = "No programs — you can {deleteStation}."

# 3. admin.programs.edit
ar_json["admin"]["programs"]["edit"]["saveRuleSuccess"] = "حفظ القاعدة"
en_json["admin"]["programs"]["edit"]["saveRuleSuccess"] = "Save Rule"

with open(en_path, "w") as f: json.dump(en_json, f, indent=2, ensure_ascii=False)
with open(ar_path, "w") as f: json.dump(ar_json, f, indent=2, ensure_ascii=False)

# Now patch the other 6 languages with the EN values
other_langs = ["de", "es", "fr", "it", "pt", "tr"]
for lang in other_langs:
    lang_path = f"frontend/messages/{lang}.json"
    with open(lang_path, "r") as f:
        data = json.load(f)
    
    data["admin"]["presenters"]["dependencyWarning"] = en_json["admin"]["presenters"]["dependencyWarning"]
    data["admin"]["presenters"]["viewBtn"]           = en_json["admin"]["presenters"]["viewBtn"]
    data["admin"]["presenters"]["backToEdit"]        = en_json["admin"]["presenters"]["backToEdit"]
    data["admin"]["presenters"]["noteProgramsActive"] = en_json["admin"]["presenters"]["noteProgramsActive"]
    
    data["admin"]["stations"]["deleteStationTitle"]   = en_json["admin"]["stations"]["deleteStationTitle"]
    data["admin"]["stations"]["noProgramsNoteDelete"] = en_json["admin"]["stations"]["noProgramsNoteDelete"]
    
    data["admin"]["programs"]["edit"]["saveRuleSuccess"] = en_json["admin"]["programs"]["edit"]["saveRuleSuccess"]
    
    with open(lang_path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def patch(file, replacements):
    with open(file, "r") as f: content = f.read()
    for old, new in replacements:
        content = content.replace(old, new)
    with open(file, "w") as f: f.write(content)

# File 1
patch("frontend/src/app/admin/presenters/[id]/delete/page.tsx", [
    ('البنود الحمراء تمنع الحذف النهائي. نظّف ما يمكنك ثم اضغط "حذف نهائي" عند توفر الشروط.', '{t("dependencyWarning")}'),
    ('عرض', '{t("viewBtn")}'),
    ('← العودة إلى صفحة التعديل', '{t("backToEdit")}'),
    ('`⚠ ${deps.activePrograms} برنامج نشط يمنع الحذف. انقر t("cleanupPrograms") لتصفير العداد المانع.`', 't("noteProgramsActive", { count: deps.activePrograms, cleanupPrograms: t("cleanupPrograms") })')
])

# File 2
patch("frontend/src/app/admin/stations/[id]/delete/page.tsx", [
    ('<span className="text-red-400 font-medium">حذف المحطة</span>', '<span className="text-red-400 font-medium">{t("deleteStationTitle")}</span>'),
    ('`لا توجد برامج — يمكن ${t("deleteStation")}.`', 't("noProgramsNoteDelete", { deleteStation: t("deleteStation") })')
])

# File 3
patch("frontend/src/app/admin/programs/[id]/edit/page.tsx", [
    ('تم {t("saveRule")} بنجاح', '{t("saveRuleSuccess")}')
])

print("Patched all 3 files and 8 language files successfully!")
