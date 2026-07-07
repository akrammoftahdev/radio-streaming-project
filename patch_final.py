import re

def patch(file, replacements):
    with open(file, "r") as f: content = f.read()
    for old, new in replacements:
        content = content.replace(old, new)
    with open(file, "w") as f: f.write(content)

patch("frontend/src/app/admin/presenters/[id]/delete/actions.ts", [
    ('deps.activePrograms > 0 ? `${deps.activePrograms} برنامج نشط` : null,', 'deps.activePrograms > 0 ? `${deps.activePrograms} Active Programs` : null,'),
    ('deps.recordings    > 0 ? `${deps.recordings} تسجيل`       : null,', 'deps.recordings    > 0 ? `${deps.recordings} Recordings`       : null,'),
    ('deps.liveSessions  > 0 ? `${deps.liveSessions} جلسة بث`    : null,', 'deps.liveSessions  > 0 ? `${deps.liveSessions} Live Sessions`    : null,'),
    ('deps.schedules     > 0 ? `${deps.schedules} جدول بث`       : null,', 'deps.schedules     > 0 ? `${deps.schedules} Schedules`       : null,'),
    ('].filter(Boolean).join(" · ") + " — يمنع الحذف النهائي",', '].filter(Boolean).join(" · ") + " — Prevents Permanent Deletion",')
])

patch("frontend/src/app/admin/programs/actions.ts", [
    ('`المذيع "${presenter!.name || presenter!.username}" ${t("admin.messages.presenterNotLinked1")} "${station!.name}". ` +', '`Presenter "${presenter!.name || presenter!.username}" ${t("admin.messages.presenterNotLinked1")} "${station!.name}". ` +')
])

patch("frontend/src/app/admin/settings/page.tsx", [
    ('placeholder="https://... أو /uploads/..."', 'placeholder="https://... or /uploads/..."')
])

patch("frontend/src/app/admin/status/page.tsx", [
    ('<span className="text-2xl font-bold" style={{ color: "var(--eg-primary)" }}>{progressPct}٪</span>', '<span className="text-2xl font-bold" style={{ color: "var(--eg-primary)" }}>{progressPct}%</span>')
])

patch("frontend/src/app/admin/presenters/presenters-filter.tsx", [
    ('// Station options: "none" (غير مرتبط بمحطة) is a real selectable value', '// Station options: "none" (Not linked to station) is a real selectable value')
])

patch("frontend/src/app/admin/recordings/actions.ts", [
    ('return { ok: false, error: "غير مصرح" };', 'return { ok: false, error: t("admin.messages.unauthorized") };'),
    ('if (!recordingId) return { ok: false, error: "recordingId مطلوب" };', 'if (!recordingId) return { ok: false, error: "recordingId required" };'),
    ('return { ok: false, error: "Path traversal detected — حذف مرفوض" };', 'return { ok: false, error: "Path traversal detected — deletion denied" };'),
    ('return { ok: false, error: "فشل حذف السجل: " + (e?.message ?? "") };', 'return { ok: false, error: "Failed to delete record: " + (e?.message ?? "") };')
])

patch("frontend/src/app/admin/stations/page.tsx", [
    ('{/* + إضافة محطة button — only when not editing and form not open */}', '{/* + Add Station button — only when not editing and form not open */}')
])
