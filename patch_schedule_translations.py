import json
import os

keys_ar = {
  "title": "جدول البث الأسبوعي",
  "subtitle": "عرض كل المحطات والبرامج · الأسبوع الحالي",
  "managePrograms": "⚙️ إدارة البرامج",
  "auditSchedule": "🔍 تدقيق الجداول",
  "backToDashboard": "← اللوحة",
  "programsShown": "برامج معروضة",
  "slotsCount": "عدد الحصص",
  "stations": "محطات",
  "presenters": "مذيعون",
  "today": "اليوم",
  "slot": "حصة",
  "noPrograms": "لا توجد<br />برامج",
  "edit": "تعديل ←",
  "noProgramsMatch": "لا توجد برامج تطابق الفلتر المحدد.",
  "noProgramsScheduled": "لا توجد برامج مجدولة حتى الآن.",
  "clearFilters": "مسح الكل",
  "previous": "السابق",
  "next": "التالي",
  "all": "الكل",
  "daily": "يومي",
  "weekly": "أسبوعي",
  "selectedDays": "أيام مختارة",
  "oneTime": "مرة واحدة",
  "night": "الليل",
  "morning": "الصباح",
  "noon": "الظهيرة",
  "evening": "المساء",
  "days": {
    "0": "الأحد",
    "1": "الإثنين",
    "2": "الثلاثاء",
    "3": "الأربعاء",
    "4": "الخميس",
    "5": "الجمعة",
    "6": "السبت"
  }
}

keys_en = {
  "title": "Weekly Broadcast Schedule",
  "subtitle": "Viewing all stations and programs · Current week",
  "managePrograms": "⚙️ Manage Programs",
  "auditSchedule": "🔍 Audit Schedule",
  "backToDashboard": "← Dashboard",
  "programsShown": "Programs Shown",
  "slotsCount": "Slots Count",
  "stations": "Stations",
  "presenters": "Presenters",
  "today": "Today",
  "slot": "Slot",
  "noPrograms": "No<br />Programs",
  "edit": "Edit ←",
  "noProgramsMatch": "No programs match the selected filter.",
  "noProgramsScheduled": "No programs scheduled yet.",
  "clearFilters": "Clear All",
  "previous": "Previous",
  "next": "Next",
  "all": "All",
  "daily": "Daily",
  "weekly": "Weekly",
  "selectedDays": "Selected Days",
  "oneTime": "One Time",
  "night": "Night",
  "morning": "Morning",
  "noon": "Noon",
  "evening": "Evening",
  "days": {
    "0": "Sunday",
    "1": "Monday",
    "2": "Tuesday",
    "3": "Wednesday",
    "4": "Thursday",
    "5": "Friday",
    "6": "Saturday"
  }
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
        
    if "schedule" not in data["admin"]:
        data["admin"]["schedule"] = {}
        
    keys_to_use = keys_ar if filename == 'ar.json' else keys_en
    
    for k, v in keys_to_use.items():
        data["admin"]["schedule"][k] = v
            
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

print("Schedule translation keys added.")
