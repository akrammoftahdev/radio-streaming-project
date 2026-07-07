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

def patch(file, replacements):
    with open(file, "r") as f: content = f.read()
    for old, new in replacements:
        content = content.replace(old, new)
    with open(file, "w") as f: f.write(content)

add_key("failDeleteTables", "Deletion failed — still linked to other tables not cleaned up. Check dependencies and try again.", "فشل الحذف — لا يزال هناك ارتباط بجداول أخرى لم تُنظَّف. راجع قائمة التبعيات وأعد المحاولة.")
add_key("failDeleteMsg", "Deletion failed: ", "فشل الحذف: ")
add_key("presenterIdReq", "Presenter ID required", "معرّف المذيع مطلوب")
add_key("presenterNotFound", "Presenter not found", "المذيع غير موجود")
add_key("cantCleanAdminSession", "Cannot clean sessions for ADMIN or STATION_MANAGER", "لا يمكن تنظيف جلسات مستخدم من نوع ADMIN أو STATION_MANAGER")
add_key("deletePresenterRecordingsFirst", "Presenter recordings must be deleted before cleaning broadcast sessions.", "يجب حذف تسجيلات المذيع أولاً قبل تنظيف جلسات البث.")
add_key("permDeleteNotAvail", "Permanent deletion not available", "الحذف النهائي غير متاح")
add_key("presenterNotFound2", "Presenter not found.", "المذيع غير موجود.")
add_key("cantChangeSingleStation", "Cannot change single-station presenter from this page.", "لا يمكن تغيير محطة مذيع المحطة الواحدة من هذه الصفحة.")
add_key("stationNotFoundOrInactive", "Station not found or inactive.", "غير موجودة أو غير نشطة.")
add_key("accountStatusNotAllowed", "Account status does not allow direct broadcasts.", "وضع الحساب لا يسمح بإضافة إذاعات مباشرة.")
add_key("radioNameReq", "Radio name required.", "اسم الإذاعة مطلوب.")
add_key("hostReq", "Host required.", "الخادم (Host) مطلوب.")
add_key("djUserReq", "DJ username required.", "اسم مستخدم DJ مطلوب.")
add_key("pwdReq", "Password required.", "كلمة المرور مطلوبة.")
add_key("portRange", "Port must be between 1 and 65535.", "المنفذ (Port) يجب أن يكون بين 1 و 65535.")
add_key("radioNotFound", "Radio not found.", "الإذاعة غير موجودة.")
add_key("radioNotFoundOrNotOwned", "Radio not found or not owned by presenter.", "الإذاعة غير موجودة أو ليست ملك هذا المذيع.")
add_key("searchProgDescPres", "Search by program name, description, or presenter...", "ابحث باسم البرنامج، الوصف، أو المذيع...")
add_key("progTitleReq", "Program title required.", "عنوان البرنامج مطلوب.")
add_key("selectPresenterReq", "Presenter must be selected.", "يجب اختيار مذيع.")
add_key("endDateAfterStart2", "End date must be after start date.", "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء.")
add_key("presenterNotLinked1", "Presenter not linked to station.", "غير مرتبط بمحطة")
add_key("presenterNotLinked2", "Link presenter to station first from edit page.", "ارتبط المذيع بالمحطة أولاً من صفحة تعديل المذيع.")
add_key("permDeleteProgWarn", "Are you sure? Program will be permanently deleted. Recordings won't be deleted but will be unlinked.", "هل أنت متأكد؟ سيتم حذف البرنامج نهائياً. التسجيلات السابقة لن تُحذف لكنها ستُفصل عن البرنامج.")
add_key("permDeleteEmoji", "🗑 Permanent Delete", "🗑 حذف نهائي")
add_key("chooseStation", "— Choose a station —", "— اختر محطة —")
add_key("choosePresenter", "— Choose a presenter —", "— اختر مذيعاً —")
add_key("selectStationToShowPresenters", "⬆ Select station to show linked presenters.", "⬆ اختر المحطة لتظهر قائمة المذيعين المرتبطين بها.")
add_key("permDeleteLabel", "⚠ Permanent Delete", "⚠ حذف نهائي")
add_key("optionalPermProg", "(Optional — leave empty for permanent program)", "(اختياري — اتركهما فارغَين للبرنامج الدائم)")


patch("frontend/src/app/admin/presenters/[id]/delete/actions.ts", [
    ('"فشل الحذف — لا يزال هناك ارتباط بجداول أخرى لم تُنظَّف. راجع قائمة التبعيات وأعد المحاولة."', 't("admin.messages.failDeleteTables")'),
    ('`فشل الحذف: ${msg.slice(0, 150)}`', '`${t("admin.messages.failDeleteMsg")} ${msg.slice(0, 150)}`'),
    ('"معرّف المذيع مطلوب"', 't("admin.messages.presenterIdReq")'),
    ('"المذيع غير موجود"', 't("admin.messages.presenterNotFound")'),
    ('"لا يمكن تنظيف جلسات مستخدم من نوع ADMIN أو STATION_MANAGER"', 't("admin.messages.cantCleanAdminSession")'),
    ('"يجب حذف تسجيلات المذيع أولاً قبل تنظيف جلسات البث."', 't("admin.messages.deletePresenterRecordingsFirst")')
])

patch("frontend/src/app/admin/presenters/[id]/delete/wizard-client.tsx", [
    ('"سيتم حذف حساب المذيع نهائياً. لا يمكن التراجع عن هذا الإجراء."', 't("admin.messages.translatedYhthfAlhsabWalbyanatAlmrtbthBhNhayyaaHthaAlijraLaYmknAltrajaAnh")'),
    ('⚠ حذف نهائي', '{t("admin.messages.permDeleteLabel")}'),
    ('الحذف النهائي غير متاح', '{t("admin.messages.permDeleteNotAvail")}')
])

patch("frontend/src/app/admin/presenters/[id]/edit/page.tsx", [
    ('"المذيع غير موجود."', 't("admin.messages.presenterNotFound2")'),
    ('"لا يمكن تغيير محطة مذيع المحطة الواحدة من هذه الصفحة."', 't("admin.messages.cantChangeSingleStation")'),
    ('`المحطة ${sid} غير موجودة أو غير نشطة.`', '`Station ${sid} ${t("admin.messages.stationNotFoundOrInactive")}`'),
    ('"وضع الحساب لا يسمح بإضافة إذاعات مباشرة."', 't("admin.messages.accountStatusNotAllowed")'),
    ('"اسم الإذاعة مطلوب."', 't("admin.messages.radioNameReq")'),
    ('"الخادم (Host) مطلوب."', 't("admin.messages.hostReq")'),
    ('"اسم مستخدم DJ مطلوب."', 't("admin.messages.djUserReq")'),
    ('"كلمة المرور مطلوبة."', 't("admin.messages.pwdReq")'),
    ('"المنفذ (Port) يجب أن يكون بين 1 و 65535."', 't("admin.messages.portRange")'),
    ('"الإذاعة غير موجودة."', 't("admin.messages.radioNotFound")'),
    ('"الإذاعة غير موجودة أو ليست ملك هذا المذيع."', 't("admin.messages.radioNotFoundOrNotOwned")')
])

patch("frontend/src/app/admin/programs/programs-filter.tsx", [
    ('placeholder="ابحث باسم البرنامج، الوصف، أو المذيع..."', 'placeholder={t("admin.messages.searchProgDescPres")}')
])

patch("frontend/src/app/admin/programs/actions.ts", [
    ('"عنوان البرنامج مطلوب."', 't("admin.messages.progTitleReq")'),
    ('"يجب اختيار مذيع."', 't("admin.messages.selectPresenterReq")'),
    ('"تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء."', 't("admin.messages.endDateAfterStart2")'),
    ('"المذيع غير موجود."', 't("admin.messages.presenterNotFound2")'),
    ('غير مرتبط بمحطة', '${t("admin.messages.presenterNotLinked1")}'),
    ('`ارتبط المذيع بالمحطة أولاً من صفحة تعديل المذيع.`', 't("admin.messages.presenterNotLinked2")'),
    ('`فشل الحذف: ${msg.slice(0, 120)}`', '`${t("admin.messages.failDeleteMsg")} ${msg.slice(0, 120)}`')
])

patch("frontend/src/app/admin/programs/program-delete-button.tsx", [
    ('"هل أنت متأكد؟ سيتم حذف البرنامج نهائياً. التسجيلات السابقة لن تُحذف لكنها ستُفصل عن البرنامج."', 't("admin.messages.permDeleteProgWarn")'),
    ('🗑 حذف نهائي', '{t("admin.messages.permDeleteEmoji")}')
])

patch("frontend/src/app/admin/programs/program-create-form.tsx", [
    ('— اختر محطة —', '{t("admin.messages.chooseStation")}'),
    ('— اختر مذيعاً —', '{t("admin.messages.choosePresenter")}'),
    ('⬆ اختر المحطة لتظهر قائمة المذيعين المرتبطين بها.', '{t("admin.messages.selectStationToShowPresenters")}'),
    ('(اختياري — اتركهما فارغَين للبرنامج الدائم)', '{t("admin.messages.optionalPermProg")}')
])


with open(en_path, "w") as f: json.dump(en_json, f, indent=2, ensure_ascii=False)
with open(ar_path, "w") as f: json.dump(ar_json, f, indent=2, ensure_ascii=False)
