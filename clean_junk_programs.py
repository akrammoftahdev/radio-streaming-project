import json
import sys
import os

files = ['ar.json', 'en.json', 'de.json', 'es.json', 'fr.json', 'pt.json', 'tr.json']

for filename in files:
    path = f"frontend/messages/{filename}"
    if not os.path.exists(path):
        continue
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Remove root-level 'programs' key if it exists
    if "programs" in data:
        del data["programs"]
            
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

print("Junk root-level programs key removed.")
