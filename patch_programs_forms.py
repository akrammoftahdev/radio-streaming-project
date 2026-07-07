import json
import sys
import os

keys_ar = {
    "addNewProgram": "إضافة برنامج جديد",
    "programTitle": "عنوان البرنامج *",
    "titlePlaceholder": "مثال: برنامج الصباح...",
    "station": "المحطة *",
    "selectStation": "اختر محطة...",
    "presenter": "المذيع *",
    "selectStationFirst": "اختر المحطة أولاً",
    "selectStationToShowPresenters": "اختر المحطة لعرض المذيعين",
    "description": "الوصف",
    "descriptionPlaceholder": "وصف قصير للبرنامج...",
    "validityWindow": "فترة صلاحية البرنامج",
    "validityOptional": "اختياري",
    "validFrom": "يبدأ من",
    "blankStartsImmediately": "فارغ = يبدأ فوراً",
    "validUntil": "ينتهي في",
    "blankPermanent": "فارغ = دائم",
    "djWarning": "تنبيه: هذا المذيع في وضع DIRECT_DJ (بث حر) ولن يخضع لجدول المواعيد.",
    "createProgram": "إنشاء البرنامج",
    "delete": {
        "deleteAction": "حذف"
    }
}

keys_en = {
    "addNewProgram": "Add New Program",
    "programTitle": "Program Title *",
    "titlePlaceholder": "e.g., Morning Show...",
    "station": "Station *",
    "selectStation": "Select a station...",
    "presenter": "Presenter *",
    "selectStationFirst": "Select Station First",
    "selectStationToShowPresenters": "Select a station to show its presenters",
    "description": "Description",
    "descriptionPlaceholder": "Short description for the program...",
    "validityWindow": "Program Validity Window",
    "validityOptional": "Optional",
    "validFrom": "Valid From",
    "blankStartsImmediately": "Blank = Starts Immediately",
    "validUntil": "Valid Until",
    "blankPermanent": "Blank = Permanent",
    "djWarning": "Warning: This presenter is in DIRECT_DJ mode and will not be bound by schedules.",
    "createProgram": "Create Program",
    "delete": {
        "deleteAction": "Delete"
    }
}

files = ['ar.json', 'en.json', 'de.json', 'es.json', 'fr.json', 'pt.json', 'tr.json']

for filename in files:
    path = f"frontend/messages/{filename}"
    if not os.path.exists(path):
        continue
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    if "programs" not in data:
        data["programs"] = {}
        
    keys_to_use = keys_ar if filename == 'ar.json' else keys_en
    
    for k, v in keys_to_use.items():
        if k == "delete":
            if "delete" not in data["programs"]:
                data["programs"]["delete"] = {}
            for dk, dv in v.items():
                data["programs"]["delete"][dk] = dv
        else:
            # Overwrite or add
            data["programs"][k] = v
            
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

print("Translation keys added successfully.")
