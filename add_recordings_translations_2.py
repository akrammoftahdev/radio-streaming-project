import json
import os

extras = {
  "ar.json": {"deleteSuccess": "تم الحذف بنجاح"},
  "en.json": {"deleteSuccess": "Deleted successfully"},
  "de.json": {"deleteSuccess": "Erfolgreich gelöscht"},
  "es.json": {"deleteSuccess": "Eliminado correctamente"},
  "fr.json": {"deleteSuccess": "Supprimé avec succès"},
  "pt.json": {"deleteSuccess": "Excluído com sucesso"},
  "tr.json": {"deleteSuccess": "Başarıyla silindi"}
}

for filename, trans in extras.items():
    path = f"frontend/messages/{filename}"
    if not os.path.exists(path): continue
    with open(path, 'r', encoding='utf-8') as f: data = json.load(f)
    if "admin" not in data: data["admin"] = {}
    if "recordings" not in data["admin"]: data["admin"]["recordings"] = {}
    
    for k, v in trans.items():
        data["admin"]["recordings"][k] = v
        
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

