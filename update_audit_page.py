import json
import os

langs = {
  "ar.json": {
    "title": "تدقيق الجداول للإدارة",
    "titleMain": "تدقيق الجداول والإعدادات",
    "subtitle": "فحص شامل للتداخلات والأخطاء — للقراءة فقط، لا يُعدَّل أي بيانات.",
    "back": "← عودة",
    "all": "الكل",
    "errors": "⛔ أخطاء",
    "warnings": "⚠️ تحذيرات",
    "stationLabel": "المحطة:",
    "issueType": "نوع المشكلة:",
    "clearFilters": "✕ مسح الفلاتر ({count} نتيجة)",
    "criticalErrors": "أخطاء حرجة",
    "warningsCount": "تحذيرات",
    "activePrograms": "إجمالي البرامج النشطة",
    "noIssues": "لا توجد مشكلات مكتشفة",
    "noIssuesDesc": "كل الجداول والمذيعين والمحطات تبدو سليمة.",
    "legendTitle": "الفحوصات المُنفَّذة في هذا التقرير:",
    
    "typeA": "تداخل جدول في نفس المحطة",
    "descA": "«{titleA}» و«{titleB}» على «{station}» ({startA}–{endA} ↔ {startB}–{endB})",
    "suggA": "عدّل مواعيد أحد البرنامجين لإزالة التداخل.",
    "legendA": "A — تداخل مواعيد برنامجين على نفس المحطة",
    
    "typeB": "تداخل جدول نفس المذيع (محطتان)",
    "descB": "المذيع «{presenter}» جُدول في برنامجين في نفس الوقت عبر محطتين مختلفتين.",
    "suggB": "المذيع لا يمكنه البث على محطتين في نفس الوقت.",
    "legendB": "B — نفس المذيع جُدول في برنامجين في نفس الوقت (عبر محطتين)",
    
    "typeC": "مذيع غير مرتبط بمحطة البرنامج",
    "descC": "البرنامج «{program}» مرتبط بمذيع لم يُضَف لمحطة «{station}».",
    "suggC": "أضف المذيع إلى المحطة من صفحة تعديل المذيع.",
    "legendC": "C — مذيع مرتبط ببرنامج لكنه غير مرتبط بمحطة البرنامج",
    
    "typeD": "مذيع DJ مباشر في برنامج",
    "descD": "مذيع DJ مباشر «{presenter}» مُضاف لبرنامج «{program}» — هذا غير مدعوم.",
    "suggD": "احذف هذا البرنامج. مذيعو DJ المباشر لا يستخدمون جداول البرامج.",
    "legendD": "D — مذيع DJ مباشر مُضاف لجدول برنامج (غير مدعوم)",
    
    "typeE": "مذيع محطة واحدة على أكثر من محطة",
    "descE": "المذيع «{presenter}» (SINGLE_STATION) مرتبط بـ {count} محطات.",
    "suggE": "فصل المذيع عن المحطات الزائدة أو تغيير نوع الحساب إلى MULTI_STATION.",
    "legendE": "E — مذيع محطة واحدة مرتبط بأكثر من محطة",
    
    "typeF": "برنامج نشط بلا جدول",
    "descF": "البرنامج «{program}» على «{station}» نشط لكن لا توجد قواعد جدول زمني.",
    "suggF": "أضف قواعد جدول من صفحة تعديل البرنامج.",
    "legendF": "F — برنامج نشط بلا قواعد جدول زمني",
    
    "typeG": "برنامج نشط على محطة معطّلة",
    "descG": "البرنامج «{program}» نشط لكن محطته «{station}» معطّلة.",
    "suggG": "عطّل البرنامج أو أعِد تفعيل المحطة.",
    "legendG": "G — برنامج نشط على محطة معطّلة",
    
    "admin": "الإدارة",
    "schedule": "الجدول"
  },
  "en.json": {
    "title": "Schedule Audit - Admin",
    "titleMain": "Schedule & Settings Audit",
    "subtitle": "Comprehensive check for overlaps and errors — Read-only, no data is modified.",
    "back": "Back →",
    "all": "All",
    "errors": "⛔ Errors",
    "warnings": "⚠️ Warnings",
    "stationLabel": "Station:",
    "issueType": "Issue Type:",
    "clearFilters": "✕ Clear Filters ({count} results)",
    "criticalErrors": "Critical Errors",
    "warningsCount": "Warnings",
    "activePrograms": "Total Active Programs",
    "noIssues": "No issues detected",
    "noIssuesDesc": "All schedules, presenters, and stations look healthy.",
    "legendTitle": "Checks performed in this report:",
    
    "typeA": "Schedule overlap on the same station",
    "descA": "\"{titleA}\" and \"{titleB}\" on \"{station}\" ({startA}–{endA} ↔ {startB}–{endB})",
    "suggA": "Modify the times of one program to remove the overlap.",
    "legendA": "A — Program times overlap on the same station",
    
    "typeB": "Same presenter overlap (two stations)",
    "descB": "Presenter \"{presenter}\" is scheduled for two programs simultaneously across different stations.",
    "suggB": "A presenter cannot broadcast on two stations at the same time.",
    "legendB": "B — Same presenter scheduled in two programs at once",
    
    "typeC": "Presenter not linked to program's station",
    "descC": "Program \"{program}\" is linked to a presenter not added to station \"{station}\".",
    "suggC": "Add the presenter to the station from the presenter edit page.",
    "legendC": "C — Presenter linked to program but not to the station",
    
    "typeD": "Live DJ in a program",
    "descD": "Live DJ \"{presenter}\" is added to program \"{program}\" — this is unsupported.",
    "suggD": "Delete this program. Live DJs do not use program schedules.",
    "legendD": "D — Live DJ added to a program schedule (unsupported)",
    
    "typeE": "Single-station presenter on multiple stations",
    "descE": "Presenter \"{presenter}\" (SINGLE_STATION) is linked to {count} stations.",
    "suggE": "Unlink the presenter from extra stations or change account type to MULTI_STATION.",
    "legendE": "E — Single-station presenter linked to multiple stations",
    
    "typeF": "Active program with no schedule",
    "descF": "Program \"{program}\" on \"{station}\" is active but has no schedule rules.",
    "suggF": "Add schedule rules from the program edit page.",
    "legendF": "F — Active program with no schedule rules",
    
    "typeG": "Active program on disabled station",
    "descG": "Program \"{program}\" is active but its station \"{station}\" is disabled.",
    "suggG": "Disable the program or re-enable the station.",
    "legendG": "G — Active program on a disabled station",
    
    "admin": "Admin",
    "schedule": "Schedule"
  }
}

langs["de.json"] = langs["en.json"].copy()
langs["es.json"] = langs["en.json"].copy()
langs["fr.json"] = langs["en.json"].copy()
langs["pt.json"] = langs["en.json"].copy()
langs["tr.json"] = langs["en.json"].copy()

for filename, trans in langs.items():
    path = f"frontend/messages/{filename}"
    if not os.path.exists(path): continue
    with open(path, 'r', encoding='utf-8') as f: data = json.load(f)
    if "admin" not in data: data["admin"] = {}
    if "schedule" not in data["admin"]: data["admin"]["schedule"] = {}
    if "auditPage" not in data["admin"]["schedule"]: data["admin"]["schedule"]["auditPage"] = {}
    
    for k, v in trans.items():
        data["admin"]["schedule"]["auditPage"][k] = v
        
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

print("Audit Translations injected successfully.")
