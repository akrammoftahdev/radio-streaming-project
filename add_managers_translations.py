import json
import os

langs = {
  "ar.json": {
    "titleMeta": "مديرو المحطات - EGONAIR", "titleMain": "مديرو المحطات", "subtitle": "إدارة حسابات مديري المحطات وربطهم بالمحطات", "backToAdmin": "← لوحة الإدارة",
    "msgDeactivated": "تم تعطيل مدير المحطة بنجاح وإزالة صلاحياته من المحطات.", "msgDeleted": "تم حذف مدير المحطة بنجاح.",
    "createTitle": "👤 إنشاء حساب مدير محطة جديد", "fullName": "الاسم الكامل", "namePlaceholder": "محمد أحمد", "username": "اسم المستخدم", "usernamePlaceholder": "manager_cairo", "password": "كلمة المرور", "passwordPlaceholder": "••••••••", "email": "البريد الإلكتروني", "emailPlaceholder": "manager@example.com", "phone": "رقم الهاتف", "phonePlaceholder": "+201001234567", "createWarning": "⚠️ حساب مدير المحطة لا يملك صلاحية البث الصوتي. يمكنه فقط إدارة المذيعين والبرامج في المحطات المسندة إليه.", "createBtn": "إنشاء الحساب",
    "listFiltered": "مديرو المحطات ({totalCount} نتيجة)", "listTotal": "مديرو المحطات ({totalCount})", "pageOf": "صفحة {page} من {totalPages}",
    "noMatchTitle": "لا توجد نتائج مطابقة", "noMatchDesc": "جرّب تعديل التصفية أو البحث", "clearAll": "مسح كل التصفية", "noManagers": "لا يوجد مديرو محطات بعد. أنشئ أول حساب أعلاه.",
    "statusActive": "نشط", "statusInactive": "معطّل", "noStationsAssigned": "لا توجد محطات مسندة بعد",
    "cancelEdit": "إلغاء التعديل", "edit": "تعديل", "deactivate": "تعطيل", "activate": "تفعيل",
    "editTitle": "✏️ تعديل بيانات المدير", "saveData": "حفظ البيانات", "changePasswordTitle": "🔐 تغيير كلمة المرور", "newPassword": "كلمة المرور الجديدة", "confirmPassword": "تأكيد كلمة المرور", "changePasswordBtn": "تغيير كلمة المرور",
    "noStationsActive": "لا توجد محطات نشطة في النظام.", "assignedStationsLabel": "المحطات المسندة:", "saveAssignment": "حفظ الإسناد",
    "prev": "← السابق", "next": "التالي →",
    "filterStations": "المحطات", "filterAll": "الكل", "filterActive": "نشطون", "filterInactive": "معطّلون", "searchPlaceholder": "بحث بالاسم أو اسم المستخدم أو البريد...", "clearAllFilters": "مسح الكل",
    "deleteConfirm": "هل أنت متأكد؟ سيتم حذف حساب مدير المحطة نهائياً وإزالة صلاحياته من المحطات. لن يتم حذف أي محطات أو مذيعين أو برامج أو تسجيلات.", "deleteManager": "حذف المدير"
  },
  "en.json": {
    "titleMeta": "Station Managers - EGONAIR", "titleMain": "Station Managers", "subtitle": "Manage station manager accounts and assign them to stations", "backToAdmin": "← Admin Dashboard",
    "msgDeactivated": "Station manager successfully deactivated and their permissions removed.", "msgDeleted": "Station manager successfully deleted.",
    "createTitle": "👤 Create New Station Manager Account", "fullName": "Full Name", "namePlaceholder": "John Doe", "username": "Username", "usernamePlaceholder": "manager_cairo", "password": "Password", "passwordPlaceholder": "••••••••", "email": "Email", "emailPlaceholder": "manager@example.com", "phone": "Phone Number", "phonePlaceholder": "+201001234567", "createWarning": "⚠️ Station managers do not have audio broadcasting permissions. They can only manage presenters and programs for their assigned stations.", "createBtn": "Create Account",
    "listFiltered": "Station Managers ({totalCount} results)", "listTotal": "Station Managers ({totalCount})", "pageOf": "Page {page} of {totalPages}",
    "noMatchTitle": "No matching results found", "noMatchDesc": "Try adjusting your filters or search query", "clearAll": "Clear all filters", "noManagers": "No station managers yet. Create the first one above.",
    "statusActive": "Active", "statusInactive": "Inactive", "noStationsAssigned": "No stations assigned yet",
    "cancelEdit": "Cancel Edit", "edit": "Edit", "deactivate": "Deactivate", "activate": "Activate",
    "editTitle": "✏️ Edit Manager Data", "saveData": "Save Data", "changePasswordTitle": "🔐 Change Password", "newPassword": "New Password", "confirmPassword": "Confirm Password", "changePasswordBtn": "Change Password",
    "noStationsActive": "No active stations in the system.", "assignedStationsLabel": "Assigned Stations:", "saveAssignment": "Save Assignments",
    "prev": "← Previous", "next": "Next →",
    "filterStations": "Stations", "filterAll": "All", "filterActive": "Active", "filterInactive": "Inactive", "searchPlaceholder": "Search by name, username, or email...", "clearAllFilters": "Clear all",
    "deleteConfirm": "Are you sure? The station manager account will be permanently deleted and all permissions removed. No stations, presenters, programs, or recordings will be deleted.", "deleteManager": "Delete Manager"
  },
  "de.json": {
    "titleMeta": "Sender-Manager - EGONAIR", "titleMain": "Sender-Manager", "subtitle": "Manager-Konten verwalten und Sendern zuweisen", "backToAdmin": "← Admin-Dashboard",
    "msgDeactivated": "Sender-Manager erfolgreich deaktiviert und Berechtigungen entfernt.", "msgDeleted": "Sender-Manager erfolgreich gelöscht.",
    "createTitle": "👤 Neues Sender-Manager-Konto erstellen", "fullName": "Vollständiger Name", "namePlaceholder": "Max Mustermann", "username": "Benutzername", "usernamePlaceholder": "manager_cairo", "password": "Passwort", "passwordPlaceholder": "••••••••", "email": "E-Mail", "emailPlaceholder": "manager@example.com", "phone": "Telefonnummer", "phonePlaceholder": "+201001234567", "createWarning": "⚠️ Sender-Manager haben keine Audio-Sende-Berechtigungen. Sie können nur Moderatoren und Programme für ihre zugewiesenen Sender verwalten.", "createBtn": "Konto erstellen",
    "listFiltered": "Sender-Manager ({totalCount} Ergebnisse)", "listTotal": "Sender-Manager ({totalCount})", "pageOf": "Seite {page} von {totalPages}",
    "noMatchTitle": "Keine übereinstimmenden Ergebnisse gefunden", "noMatchDesc": "Versuchen Sie, Ihre Filter oder Suchanfrage anzupassen", "clearAll": "Alle Filter löschen", "noManagers": "Noch keine Sender-Manager. Erstellen Sie oben den ersten.",
    "statusActive": "Aktiv", "statusInactive": "Inaktiv", "noStationsAssigned": "Noch keine Sender zugewiesen",
    "cancelEdit": "Bearbeitung abbrechen", "edit": "Bearbeiten", "deactivate": "Deaktivieren", "activate": "Aktivieren",
    "editTitle": "✏️ Manager-Daten bearbeiten", "saveData": "Daten speichern", "changePasswordTitle": "🔐 Passwort ändern", "newPassword": "Neues Passwort", "confirmPassword": "Passwort bestätigen", "changePasswordBtn": "Passwort ändern",
    "noStationsActive": "Keine aktiven Sender im System.", "assignedStationsLabel": "Zugewiesene Sender:", "saveAssignment": "Zuweisungen speichern",
    "prev": "← Zurück", "next": "Weiter →",
    "filterStations": "Sender", "filterAll": "Alle", "filterActive": "Aktiv", "filterInactive": "Inaktiv", "searchPlaceholder": "Suche nach Name, Benutzername oder E-Mail...", "clearAllFilters": "Alles löschen",
    "deleteConfirm": "Sind Sie sicher? Das Konto des Sender-Managers wird dauerhaft gelöscht und alle Berechtigungen entfernt. Sender, Moderatoren, Programme oder Aufzeichnungen werden nicht gelöscht.", "deleteManager": "Manager löschen"
  },
  "es.json": {
    "titleMeta": "Gerentes de Estación - EGONAIR", "titleMain": "Gerentes de Estación", "subtitle": "Administrar cuentas de gerentes y asignarlos a estaciones", "backToAdmin": "← Panel de Admin",
    "msgDeactivated": "Gerente de estación desactivado exitosamente y sus permisos eliminados.", "msgDeleted": "Gerente de estación eliminado exitosamente.",
    "createTitle": "👤 Crear Nueva Cuenta de Gerente", "fullName": "Nombre Completo", "namePlaceholder": "Juan Pérez", "username": "Nombre de Usuario", "usernamePlaceholder": "manager_cairo", "password": "Contraseña", "passwordPlaceholder": "••••••••", "email": "Correo Electrónico", "emailPlaceholder": "manager@example.com", "phone": "Número de Teléfono", "phonePlaceholder": "+201001234567", "createWarning": "⚠️ Los gerentes de estación no tienen permisos de transmisión de audio. Solo pueden administrar presentadores y programas para sus estaciones.", "createBtn": "Crear Cuenta",
    "listFiltered": "Gerentes de Estación ({totalCount} resultados)", "listTotal": "Gerentes de Estación ({totalCount})", "pageOf": "Página {page} de {totalPages}",
    "noMatchTitle": "No se encontraron resultados", "noMatchDesc": "Intenta ajustar tus filtros o la búsqueda", "clearAll": "Borrar todos los filtros", "noManagers": "Aún no hay gerentes. Crea el primero arriba.",
    "statusActive": "Activo", "statusInactive": "Inactivo", "noStationsAssigned": "Aún no hay estaciones asignadas",
    "cancelEdit": "Cancelar Edición", "edit": "Editar", "deactivate": "Desactivar", "activate": "Activar",
    "editTitle": "✏️ Editar Datos del Gerente", "saveData": "Guardar Datos", "changePasswordTitle": "🔐 Cambiar Contraseña", "newPassword": "Nueva Contraseña", "confirmPassword": "Confirmar Contraseña", "changePasswordBtn": "Cambiar Contraseña",
    "noStationsActive": "No hay estaciones activas en el sistema.", "assignedStationsLabel": "Estaciones Asignadas:", "saveAssignment": "Guardar Asignaciones",
    "prev": "← Anterior", "next": "Siguiente →",
    "filterStations": "Estaciones", "filterAll": "Todos", "filterActive": "Activos", "filterInactive": "Inactivos", "searchPlaceholder": "Buscar por nombre, usuario o email...", "clearAllFilters": "Borrar todo",
    "deleteConfirm": "¿Estás seguro? La cuenta será eliminada permanentemente y todos sus permisos revocados. No se eliminarán estaciones, presentadores ni programas.", "deleteManager": "Eliminar Gerente"
  },
  "fr.json": {
    "titleMeta": "Gestionnaires de Station - EGONAIR", "titleMain": "Gestionnaires de Station", "subtitle": "Gérer les comptes des gestionnaires et les assigner aux stations", "backToAdmin": "← Tableau de Bord Admin",
    "msgDeactivated": "Gestionnaire désactivé avec succès et permissions retirées.", "msgDeleted": "Gestionnaire supprimé avec succès.",
    "createTitle": "👤 Créer un Nouveau Gestionnaire", "fullName": "Nom Complet", "namePlaceholder": "Jean Dupont", "username": "Nom d'utilisateur", "usernamePlaceholder": "manager_cairo", "password": "Mot de passe", "passwordPlaceholder": "••••••••", "email": "E-mail", "emailPlaceholder": "manager@example.com", "phone": "Numéro de Téléphone", "phonePlaceholder": "+201001234567", "createWarning": "⚠️ Les gestionnaires n'ont pas de permissions de diffusion audio. Ils peuvent seulement gérer les animateurs et programmes de leurs stations.", "createBtn": "Créer le Compte",
    "listFiltered": "Gestionnaires ({totalCount} résultats)", "listTotal": "Gestionnaires ({totalCount})", "pageOf": "Page {page} sur {totalPages}",
    "noMatchTitle": "Aucun résultat correspondant", "noMatchDesc": "Essayez d'ajuster vos filtres ou la recherche", "clearAll": "Effacer tous les filtres", "noManagers": "Aucun gestionnaire pour l'instant. Créez le premier ci-dessus.",
    "statusActive": "Actif", "statusInactive": "Inactif", "noStationsAssigned": "Aucune station assignée",
    "cancelEdit": "Annuler l'édition", "edit": "Modifier", "deactivate": "Désactiver", "activate": "Activer",
    "editTitle": "✏️ Modifier les Données du Gestionnaire", "saveData": "Enregistrer", "changePasswordTitle": "🔐 Changer le Mot de Passe", "newPassword": "Nouveau Mot de Passe", "confirmPassword": "Confirmer le Mot de Passe", "changePasswordBtn": "Changer",
    "noStationsActive": "Aucune station active dans le système.", "assignedStationsLabel": "Stations Assignées :", "saveAssignment": "Enregistrer les Assignations",
    "prev": "← Précédent", "next": "Suivant →",
    "filterStations": "Stations", "filterAll": "Tous", "filterActive": "Actifs", "filterInactive": "Inactifs", "searchPlaceholder": "Rechercher par nom, utilisateur ou email...", "clearAllFilters": "Tout effacer",
    "deleteConfirm": "Êtes-vous sûr ? Le compte sera supprimé définitivement et toutes ses permissions retirées. Aucune station, animateur ni programme ne sera supprimé.", "deleteManager": "Supprimer le Gestionnaire"
  },
  "pt.json": {
    "titleMeta": "Gerentes de Estação - EGONAIR", "titleMain": "Gerentes de Estação", "subtitle": "Gerenciar contas de gerentes e atribuí-los a estações", "backToAdmin": "← Painel de Controle",
    "msgDeactivated": "Gerente desativado com sucesso e permissões removidas.", "msgDeleted": "Gerente excluído com sucesso.",
    "createTitle": "👤 Criar Nova Conta de Gerente", "fullName": "Nome Completo", "namePlaceholder": "João Silva", "username": "Nome de Usuário", "usernamePlaceholder": "manager_cairo", "password": "Senha", "passwordPlaceholder": "••••••••", "email": "E-mail", "emailPlaceholder": "manager@example.com", "phone": "Número de Telefone", "phonePlaceholder": "+201001234567", "createWarning": "⚠️ Os gerentes de estação não têm permissões de transmissão de áudio. Eles só podem gerenciar apresentadores e programas em suas estações.", "createBtn": "Criar Conta",
    "listFiltered": "Gerentes ({totalCount} resultados)", "listTotal": "Gerentes ({totalCount})", "pageOf": "Página {page} de {totalPages}",
    "noMatchTitle": "Nenhum resultado encontrado", "noMatchDesc": "Tente ajustar seus filtros ou busca", "clearAll": "Limpar todos os filtros", "noManagers": "Ainda não há gerentes. Crie o primeiro acima.",
    "statusActive": "Ativo", "statusInactive": "Inativo", "noStationsAssigned": "Nenhuma estação atribuída ainda",
    "cancelEdit": "Cancelar Edição", "edit": "Editar", "deactivate": "Desativar", "activate": "Ativar",
    "editTitle": "✏️ Editar Dados do Gerente", "saveData": "Salvar Dados", "changePasswordTitle": "🔐 Alterar Senha", "newPassword": "Nova Senha", "confirmPassword": "Confirmar Senha", "changePasswordBtn": "Alterar Senha",
    "noStationsActive": "Nenhuma estação ativa no sistema.", "assignedStationsLabel": "Estações Atribuídas:", "saveAssignment": "Salvar Atribuições",
    "prev": "← Anterior", "next": "Próximo →",
    "filterStations": "Estações", "filterAll": "Todos", "filterActive": "Ativos", "filterInactive": "Inativos", "searchPlaceholder": "Buscar por nome, usuário ou e-mail...", "clearAllFilters": "Limpar tudo",
    "deleteConfirm": "Tem certeza? A conta do gerente será permanentemente excluída e todas as permissões removidas. Nenhuma estação, apresentador, programa ou gravação será excluída.", "deleteManager": "Excluir Gerente"
  },
  "tr.json": {
    "titleMeta": "İstasyon Yöneticileri - EGONAIR", "titleMain": "İstasyon Yöneticileri", "subtitle": "Yönetici hesaplarını yönetin ve istasyonlara atayın", "backToAdmin": "← Yönetici Paneli",
    "msgDeactivated": "İstasyon yöneticisi başarıyla devre dışı bırakıldı ve izinleri kaldırıldı.", "msgDeleted": "İstasyon yöneticisi başarıyla silindi.",
    "createTitle": "👤 Yeni İstasyon Yöneticisi Hesabı Oluştur", "fullName": "Tam Ad", "namePlaceholder": "Ahmet Yılmaz", "username": "Kullanıcı Adı", "usernamePlaceholder": "manager_cairo", "password": "Şifre", "passwordPlaceholder": "••••••••", "email": "E-posta", "emailPlaceholder": "manager@example.com", "phone": "Telefon Numarası", "phonePlaceholder": "+201001234567", "createWarning": "⚠️ İstasyon yöneticilerinin ses yayını izinleri yoktur. Sadece atandıkları istasyonlar için sunucuları ve programları yönetebilirler.", "createBtn": "Hesap Oluştur",
    "listFiltered": "İstasyon Yöneticileri ({totalCount} sonuç)", "listTotal": "İstasyon Yöneticileri ({totalCount})", "pageOf": "Sayfa {page} / {totalPages}",
    "noMatchTitle": "Eşleşen sonuç bulunamadı", "noMatchDesc": "Filtrelerinizi veya aramanızı ayarlamayı deneyin", "clearAll": "Tüm filtreleri temizle", "noManagers": "Henüz istasyon yöneticisi yok. Yukarıdan ilkini oluşturun.",
    "statusActive": "Aktif", "statusInactive": "Pasif", "noStationsAssigned": "Henüz atanan istasyon yok",
    "cancelEdit": "Düzenlemeyi İptal Et", "edit": "Düzenle", "deactivate": "Devre Dışı Bırak", "activate": "Etkinleştir",
    "editTitle": "✏️ Yönetici Verilerini Düzenle", "saveData": "Verileri Kaydet", "changePasswordTitle": "🔐 Şifreyi Değiştir", "newPassword": "Yeni Şifre", "confirmPassword": "Şifreyi Onayla", "changePasswordBtn": "Şifreyi Değiştir",
    "noStationsActive": "Sistemde aktif istasyon yok.", "assignedStationsLabel": "Atanan İstasyonlar:", "saveAssignment": "Atamaları Kaydet",
    "prev": "← Önceki", "next": "Sonraki →",
    "filterStations": "İstasyonlar", "filterAll": "Tümü", "filterActive": "Aktif", "filterInactive": "Pasif", "searchPlaceholder": "Ad, kullanıcı adı veya e-postaya göre ara...", "clearAllFilters": "Tümünü temizle",
    "deleteConfirm": "Emin misiniz? İstasyon yöneticisi hesabı kalıcı olarak silinecek ve tüm izinleri kaldırılacaktır. Hiçbir istasyon, sunucu, program veya kayıt silinmeyecektir.", "deleteManager": "Yöneticiyi Sil"
  }
}

for filename, trans in langs.items():
    path = f"frontend/messages/{filename}"
    if not os.path.exists(path): continue
    with open(path, 'r', encoding='utf-8') as f: data = json.load(f)
    if "admin" not in data: data["admin"] = {}
    if "stationManagers" not in data["admin"]: data["admin"]["stationManagers"] = {}
    
    for k, v in trans.items():
        data["admin"]["stationManagers"][k] = v
        
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

print("Station Managers translations injected successfully.")
