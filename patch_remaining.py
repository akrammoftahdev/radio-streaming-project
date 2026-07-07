import re
import json

en_path = "frontend/messages/en.json"
ar_path = "frontend/messages/ar.json"
with open(en_path, "r") as f: en_json = json.load(f)
with open(ar_path, "r") as f: ar_json = json.load(f)

messages = en_json["admin"]["messages"]
ar_messages = ar_json["admin"]["messages"]

def add_key(slug, en, ar):
    messages[slug] = en
    ar_messages[slug] = ar
    return f"admin.messages.{slug}"

add_key("startDate", "Start Date", "📅 تاريخ البدء")
add_key("endDate", "End Date", "📅 تاريخ الانتهاء")
add_key("liveDjWarning", "⚠️ Live DJ presenters don't appear here. Must link presenter to station first.", "⚠️ المذيعون من نوع DJ مباشر لا يظهرون هنا. يجب أن يكون المذيع مرتبطاً بالمحطة أولاً.")
add_key("programNotFound", "Program not found.", "البرنامج غير موجود.")
add_key("conflictWithProgram", "Conflict in broadcast time with program:", "يوجد تعارض في وقت البث (${conflictType}) مع برنامج: \"${prog.title}\" ")
add_key("progTitleReq", "Program title is required.", "عنوان البرنامج مطلوب.")
add_key("endDateAfterStart", "End date must be after start date.", "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء.")
add_key("invalidRecurrence", "Invalid recurrence type.", "نوع التكرار غير صالح.")
add_key("startTimeReq", "Start time is required.", "وقت البداية مطلوب.")
add_key("endTimeReq", "End time is required.", "وقت النهاية مطلوب.")
add_key("chooseDay", "Must choose day of week.", "يجب اختيار يوم الأسبوع.")
add_key("invalidDay", "Invalid day of week.", "يوم الأسبوع غير صالح.")
add_key("invalidDate", "Invalid date.", "تاريخ غير صالح.")
add_key("scheduleRuleNotFound", "Scheduling rule not found.", "قاعدة الجدولة غير موجودة.")
add_key("conflictCheckErr", "Error checking conflicts.", "حدث خطأ في فحص التعارض.")
add_key("timezoneReq", "Timezone required.", "المنطقة الزمنية مطلوبة.")
add_key("broadcastTimeNotFound", "Broadcast time not found.", "وقت البث غير موجود.")
add_key("managerDeleteConfirm", "Are you sure? Station manager will be permanently deleted and access removed. Stations, presenters, programs, or recordings will not be deleted.", "هل أنت متأكد؟ سيتم حذف حساب مدير المحطة نهائياً وإزالة صلاحياته من المحطات. لن يتم حذف أي محطات أو مذيعين أو برامج أو تسجيلات.")
add_key("searchNameUserEmail", "Search by name, username, or email...", "بحث بالاسم أو اسم المستخدم أو البريد...")
add_key("sessionEndFail", "Failed to end session.", "فصل الجلسة فشل.")
add_key("endingSession", "Ending...", "جاري الإنهاء...")
add_key("catTitleUrlReq", "Category, title, and link are required", "القسم والعنوان والرابط مطلوبة")
add_key("catNotFound", "Category not found", "القسم غير موجود")
add_key("unauthorized", "Unauthorized", "غير مصرح")
add_key("audioNotFound", "Audio file not found", "الملف الصوتي غير موجود")
add_key("audioNotFound2", "Audio file not found.", "الملف الصوتي غير موجود.")
add_key("createAccountErr", "Error creating account. Try again.", "حدث خطأ أثناء إنشاء الحساب. حاول مجددًا.")
add_key("cantEditMultiStation", "Cannot edit this account — is a multi-station presenter", "لا يمكن تعديل هذا الحساب — هو مذيع متعدد المحطات")
add_key("missingDataRule", "Missing data (Rule, Start and End time required)", "بيانات ناقصة (القاعدة، وقت البداية والنهاية مطلوبة)")
add_key("stationIdReq", "stationId required", "stationId مطلوب")

with open(en_path, "w") as f: json.dump(en_json, f, indent=2, ensure_ascii=False)
with open(ar_path, "w") as f: json.dump(ar_json, f, indent=2, ensure_ascii=False)

def patch(file, replacements):
    with open(file, "r") as f: content = f.read()
    for old, new in replacements:
        content = content.replace(old, new)
    with open(file, "w") as f: f.write(content)

# Frontend Admin Programs
patch("frontend/src/app/admin/programs/program-create-form.tsx", [
    ("📅 تاريخ البدء", "{t('admin.messages.startDate')}"),
    ("📅 تاريخ الانتهاء", "{t('admin.messages.endDate')}"),
    ("⚠️ المذيعون من نوع DJ مباشر لا يظهرون هنا. يجب أن يكون المذيع مرتبطاً بالمحطة أولاً.", "{t('admin.messages.liveDjWarning')}")
])

patch("frontend/src/app/admin/programs/[id]/edit/actions.ts", [
    ('"البرنامج غير موجود."', 't("admin.messages.programNotFound")'),
    ('`يوجد تعارض في وقت البث (${conflictType}) مع برنامج: "${prog.title}" `', '`${t("admin.messages.conflictWithProgram")} "${prog.title}" `'),
    ('"عنوان البرنامج مطلوب."', 't("admin.messages.progTitleReq")'),
    ('"تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء."', 't("admin.messages.endDateAfterStart")'),
    ('"نوع التكرار غير صالح."', 't("admin.messages.invalidRecurrence")'),
    ('"وقت البداية مطلوب."', 't("admin.messages.startTimeReq")'),
    ('"وقت النهاية مطلوب."', 't("admin.messages.endTimeReq")'),
    ('"يجب اختيار يوم الأسبوع."', 't("admin.messages.chooseDay")'),
    ('"يوم الأسبوع غير صالح."', 't("admin.messages.invalidDay")'),
    ('"تاريخ غير صالح."', 't("admin.messages.invalidDate")'),
    ('"قاعدة الجدولة غير موجودة."', 't("admin.messages.scheduleRuleNotFound")'),
    ('"حدث خطأ في فحص التعارض."', 't("admin.messages.conflictCheckErr")'),
    ('"المنطقة الزمنية مطلوبة."', 't("admin.messages.timezoneReq")'),
    ('"وقت البث غير موجود."', 't("admin.messages.broadcastTimeNotFound")'),
])

patch("frontend/src/app/admin/station-managers/deactivate-button.tsx", [
    ('"هل أنت متأكد؟ سيتم حذف حساب مدير المحطة نهائياً وإزالة صلاحياته من المحطات. لن يتم حذف أي محطات أو مذيعين أو برامج أو تسجيلات."', 't("admin.messages.managerDeleteConfirm")')
])

patch("frontend/src/app/admin/station-managers/managers-filter-bar.tsx", [
    ('placeholder="بحث بالاسم أو اسم المستخدم أو البريد..."', 'placeholder={t("admin.messages.searchNameUserEmail")}')
])

patch("frontend/src/app/admin/live/disconnect-button.tsx", [
    ('alert("فصل الجلسة فشل.");', 'alert(t("admin.messages.sessionEndFail"));'),
    ('"جاري الإنهاء..."', 't("admin.messages.endingSession")')
])

patch("frontend/src/app/admin/media/actions.ts", [
    ('"القسم والعنوان والرابط مطلوبة"', 't("admin.messages.catTitleUrlReq")'),
    ('"القسم غير موجود"', 't("admin.messages.catNotFound")'),
    ('"غير مصرح"', 't("admin.messages.unauthorized")'),
    ('"الملف الصوتي غير موجود"', 't("admin.messages.audioNotFound")'),
    ('"الملف الصوتي غير موجود."', 't("admin.messages.audioNotFound2")')
])

patch("frontend/src/app/station-manager/presenters/actions.ts", [
    ('"غير مصرح"', 't("admin.messages.unauthorized")'),
    ('"حدث خطأ أثناء إنشاء الحساب. حاول مجددًا."', 't("admin.messages.createAccountErr")'),
    ('"لا يمكن تعديل هذا الحساب — هو مذيع متعدد المحطات"', 't("admin.messages.cantEditMultiStation")')
])

patch("frontend/src/app/station-manager/programs/actions.ts", [
    ('"غير مصرح"', 't("admin.messages.unauthorized")'),
    ('"بيانات ناقصة (القاعدة، وقت البداية والنهاية مطلوبة)"', 't("admin.messages.missingDataRule")')
])

patch("frontend/src/app/station-manager/media/actions.ts", [
    ('"stationId مطلوب"', 't("admin.messages.stationIdReq")'),
    ('"القسم غير موجود"', 't("admin.messages.catNotFound")'),
    ('"القسم والعنوان والرابط مطلوبة"', 't("admin.messages.catTitleUrlReq")'),
])
