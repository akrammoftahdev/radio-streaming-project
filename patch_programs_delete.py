import json
import sys
import os

keys_ar = {
    "confirmDelete": "هل أنت متأكد من رغبتك في حذف هذا البرنامج؟",
    "deleted": "تم الحذف",
    "disableFirst": "قم بتعطيل البرنامج أولاً للحذف",
    "permanentDeleteTitle": "حذف نهائي",
    "deleting": "جارٍ الحذف...",
    "deleteAction": "حذف"
}

keys_en = {
    "confirmDelete": "Are you sure you want to delete this program?",
    "deleted": "Deleted",
    "disableFirst": "Disable program first to delete",
    "permanentDeleteTitle": "Permanent Delete",
    "deleting": "Deleting...",
    "deleteAction": "Delete"
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
        
    if "delete" not in data["programs"]:
        data["programs"]["delete"] = {}
        
    keys_to_use = keys_ar if filename == 'ar.json' else keys_en
    
    for k, v in keys_to_use.items():
        data["programs"]["delete"][k] = v
            
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

print("Delete translation keys added successfully.")
