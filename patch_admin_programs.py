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
    "deleteAction": "حذف",
    "confirmDelete": "هل أنت متأكد من رغبتك في حذف هذا البرنامج؟",
    "deleted": "تم الحذف",
    "disableFirst": "قم بتعطيل البرنامج أولاً للحذف",
    "permanentDeleteTitle": "حذف نهائي",
    "deleting": "جارٍ الحذف..."
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
    "deleteAction": "Delete",
    "confirmDelete": "Are you sure you want to delete this program?",
    "deleted": "Deleted",
    "disableFirst": "Disable program first to delete",
    "permanentDeleteTitle": "Permanent Delete",
    "deleting": "Deleting..."
}

files = ['ar.json', 'en.json', 'de.json', 'es.json', 'fr.json', 'pt.json', 'tr.json']

for filename in files:
    path = f"frontend/messages/{filename}"
    if not os.path.exists(path):
        continue
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    if "admin" not in data:
        data["admin"] = {}
        
    if "programs" not in data["admin"]:
        data["admin"]["programs"] = {}
        
    if "delete" not in data["admin"]["programs"]:
        data["admin"]["programs"]["delete"] = {}
        
    keys_to_use = keys_ar if filename == 'ar.json' else keys_en
    
    for k, v in keys_to_use.items():
        if k in ["confirmDelete", "deleted", "disableFirst", "permanentDeleteTitle", "deleting", "deleteAction"]:
            data["admin"]["programs"]["delete"][k] = v
        else:
            data["admin"]["programs"][k] = v
            
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

print("Admin Programs translation keys patched correctly.")
