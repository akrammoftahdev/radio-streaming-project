import json
import os

files = ['en.json', 'de.json', 'es.json', 'fr.json', 'pt.json', 'tr.json']

for filename in files:
    path = f"frontend/messages/{filename}"
    if not os.path.exists(path): continue
    with open(path, 'r', encoding='utf-8') as f: data = json.load(f)
    
    if "admin" in data and "schedule" in data["admin"]:
        if "edit" in data["admin"]["schedule"]:
            data["admin"]["schedule"]["edit"] = data["admin"]["schedule"]["edit"].replace("←", "→")
            
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

print("Edit arrow patched.")
