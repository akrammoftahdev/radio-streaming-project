import json, os

locales = ['ar', 'en', 'fr', 'tr', 'pt', 'es', 'de']
translations = {
    'ar': {
        'title': 'إعدادات DJ - EGONAIR',
        'stationManager': 'مدير المحطة',
        'dashboard': 'اللوحة',
        'backToDashboard': 'العودة للوحة',
        'heading': 'إعدادات DJ للمحطة',
        'noAssignedTitle': 'لا توجد محطات مسندة',
        'noAssignedDesc': 'لم يتم إسناد أي محطة لحسابك. تواصل مع الإدارة لتفعيل صلاحياتك.',
        'infoText': 'بيانات DJ تُستخدم لربط المذيعين بالمحطة عند البث. كلمة المرور مشفرة ولا تُعرض.',
        'statusConfigured': 'بيانات DJ مُعدة',
        'statusDisabled': 'بيانات DJ معطّلة',
        'statusMissing': 'لا توجد بيانات DJ',
        'saveSuccess': 'تم حفظ بيانات DJ للمحطة بنجاح.',
        'host': 'الخادم (Host) *',
        'port': 'المنفذ (Port) *',
        'djUsername': 'اسم مستخدم DJ *',
        'djPassword': 'كلمة مرور DJ',
        'leaveBlank': 'اتركه فارغاً للإبقاء على الحالية',
        'status': 'الحالة',
        'active': 'مفعّل',
        'inactive': 'معطّل',
        'saveBtn': 'حفظ إعدادات DJ',
        
        'errNotAssigned': 'المحطة غير مسندة لحسابك',
        'errHostUsernameRequired': 'الخادم واسم المستخدم مطلوبان',
        'errPortRange': 'المنفذ يجب أن يكون بين 1 و 65535',
        'errPasswordRequired': 'كلمة المرور مطلوبة عند الإنشاء الأول',
        'errGeneral': 'حدث خطأ: '
    },
    'en': {
        'title': 'DJ Settings - EGONAIR',
        'stationManager': 'Station Manager',
        'dashboard': 'Dashboard',
        'backToDashboard': 'Back to Dashboard',
        'heading': 'Station DJ Settings',
        'noAssignedTitle': 'No assigned stations',
        'noAssignedDesc': 'No stations are assigned to your account. Contact administration to activate your permissions.',
        'infoText': 'DJ credentials are used to connect presenters to the station during broadcast. The password is encrypted and not displayed.',
        'statusConfigured': 'DJ Credentials Configured',
        'statusDisabled': 'DJ Credentials Disabled',
        'statusMissing': 'No DJ Credentials',
        'saveSuccess': 'Station DJ credentials saved successfully.',
        'host': 'Host *',
        'port': 'Port *',
        'djUsername': 'DJ Username *',
        'djPassword': 'DJ Password',
        'leaveBlank': 'Leave blank to keep current',
        'status': 'Status',
        'active': 'Active',
        'inactive': 'Inactive',
        'saveBtn': 'Save DJ Settings',
        
        'errNotAssigned': 'Station not assigned to your account',
        'errHostUsernameRequired': 'Host and username are required',
        'errPortRange': 'Port must be between 1 and 65535',
        'errPasswordRequired': 'Password is required on first creation',
        'errGeneral': 'An error occurred: '
    },
    'fr': {
        'title': 'Paramètres DJ - EGONAIR',
        'stationManager': 'Responsable de la station',
        'dashboard': 'Tableau de bord',
        'backToDashboard': 'Retour au tableau de bord',
        'heading': 'Paramètres DJ de la station',
        'noAssignedTitle': 'Aucune station attribuée',
        'noAssignedDesc': 'Aucune station n\'est attribuée à votre compte. Contactez l\'administration pour activer vos autorisations.',
        'infoText': 'Les identifiants DJ sont utilisés pour connecter les présentateurs à la station pendant la diffusion. Le mot de passe est crypté et n\'est pas affiché.',
        'statusConfigured': 'Identifiants DJ configurés',
        'statusDisabled': 'Identifiants DJ désactivés',
        'statusMissing': 'Aucun identifiant DJ',
        'saveSuccess': 'Les identifiants DJ de la station ont été enregistrés avec succès.',
        'host': 'Hôte *',
        'port': 'Port *',
        'djUsername': 'Nom d\'utilisateur DJ *',
        'djPassword': 'Mot de passe DJ',
        'leaveBlank': 'Laissez vide pour conserver l\'actuel',
        'status': 'Statut',
        'active': 'Actif',
        'inactive': 'Inactif',
        'saveBtn': 'Enregistrer les paramètres DJ',
        
        'errNotAssigned': 'Station non attribuée à votre compte',
        'errHostUsernameRequired': 'L\'hôte et le nom d\'utilisateur sont requis',
        'errPortRange': 'Le port doit être compris entre 1 et 65535',
        'errPasswordRequired': 'Le mot de passe est requis lors de la première création',
        'errGeneral': 'Une erreur s\'est produite : '
    },
    'tr': {
        'title': 'DJ Ayarları - EGONAIR',
        'stationManager': 'İstasyon Yöneticisi',
        'dashboard': 'Pano',
        'backToDashboard': 'Panoya Dön',
        'heading': 'İstasyon DJ Ayarları',
        'noAssignedTitle': 'Atanmış istasyon yok',
        'noAssignedDesc': 'Hesabınıza atanmış istasyon yok. İzinlerinizi etkinleştirmek için yönetimle iletişime geçin.',
        'infoText': 'DJ kimlik bilgileri, yayın sırasında sunucuları istasyona bağlamak için kullanılır. Parola şifrelenmiştir ve görüntülenmez.',
        'statusConfigured': 'DJ Kimlik Bilgileri Yapılandırıldı',
        'statusDisabled': 'DJ Kimlik Bilgileri Devre Dışı',
        'statusMissing': 'DJ Kimlik Bilgisi Yok',
        'saveSuccess': 'İstasyon DJ kimlik bilgileri başarıyla kaydedildi.',
        'host': 'Sunucu *',
        'port': 'Port *',
        'djUsername': 'DJ Kullanıcı Adı *',
        'djPassword': 'DJ Parolası',
        'leaveBlank': 'Mevcut olanı korumak için boş bırakın',
        'status': 'Durum',
        'active': 'Aktif',
        'inactive': 'Pasif',
        'saveBtn': 'DJ Ayarlarını Kaydet',
        
        'errNotAssigned': 'İstasyon hesabınıza atanmamış',
        'errHostUsernameRequired': 'Sunucu ve kullanıcı adı gereklidir',
        'errPortRange': 'Port 1 ile 65535 arasında olmalıdır',
        'errPasswordRequired': 'İlk oluşturmada parola gereklidir',
        'errGeneral': 'Bir hata oluştu: '
    },
    'pt': {
        'title': 'Configurações de DJ - EGONAIR',
        'stationManager': 'Gerente da Estação',
        'dashboard': 'Painel',
        'backToDashboard': 'Voltar ao Painel',
        'heading': 'Configurações de DJ da Estação',
        'noAssignedTitle': 'Nenhuma estação atribuída',
        'noAssignedDesc': 'Nenhuma estação está atribuída à sua conta. Contate a administração para ativar suas permissões.',
        'infoText': 'As credenciais de DJ são usadas para conectar os apresentadores à estação durante a transmissão. A senha é criptografada e não é exibida.',
        'statusConfigured': 'Credenciais de DJ Configuradas',
        'statusDisabled': 'Credenciais de DJ Desativadas',
        'statusMissing': 'Sem Credenciais de DJ',
        'saveSuccess': 'Credenciais de DJ da estação salvas com sucesso.',
        'host': 'Host *',
        'port': 'Porta *',
        'djUsername': 'Nome de Usuário DJ *',
        'djPassword': 'Senha do DJ',
        'leaveBlank': 'Deixe em branco para manter a atual',
        'status': 'Status',
        'active': 'Ativo',
        'inactive': 'Inativo',
        'saveBtn': 'Salvar Configurações de DJ',
        
        'errNotAssigned': 'Estação não atribuída à sua conta',
        'errHostUsernameRequired': 'Host e nome de usuário são obrigatórios',
        'errPortRange': 'A porta deve estar entre 1 e 65535',
        'errPasswordRequired': 'A senha é obrigatória na primeira criação',
        'errGeneral': 'Ocorreu um erro: '
    },
    'es': {
        'title': 'Configuración de DJ - EGONAIR',
        'stationManager': 'Gerente de la Estación',
        'dashboard': 'Panel',
        'backToDashboard': 'Volver al Panel',
        'heading': 'Configuración de DJ de la Estación',
        'noAssignedTitle': 'No hay estaciones asignadas',
        'noAssignedDesc': 'No hay estaciones asignadas a tu cuenta. Contacta con la administración para activar tus permisos.',
        'infoText': 'Las credenciales de DJ se utilizan para conectar a los presentadores a la estación durante la transmisión. La contraseña está encriptada y no se muestra.',
        'statusConfigured': 'Credenciales de DJ Configuradas',
        'statusDisabled': 'Credenciales de DJ Desactivadas',
        'statusMissing': 'Sin Credenciales de DJ',
        'saveSuccess': 'Credenciales de DJ de la estación guardadas con éxito.',
        'host': 'Host *',
        'port': 'Puerto *',
        'djUsername': 'Nombre de Usuario DJ *',
        'djPassword': 'Contraseña de DJ',
        'leaveBlank': 'Dejar en blanco para mantener la actual',
        'status': 'Estado',
        'active': 'Activo',
        'inactive': 'Inactivo',
        'saveBtn': 'Guardar Configuración de DJ',
        
        'errNotAssigned': 'Estación no asignada a tu cuenta',
        'errHostUsernameRequired': 'Host y nombre de usuario son obligatorios',
        'errPortRange': 'El puerto debe estar entre 1 y 65535',
        'errPasswordRequired': 'La contraseña es obligatoria en la primera creación',
        'errGeneral': 'Ocurrió un error: '
    },
    'de': {
        'title': 'DJ-Einstellungen - EGONAIR',
        'stationManager': 'Stationsleiter',
        'dashboard': 'Dashboard',
        'backToDashboard': 'Zurück zum Dashboard',
        'heading': 'Station DJ-Einstellungen',
        'noAssignedTitle': 'Keine zugewiesenen Stationen',
        'noAssignedDesc': 'Ihrem Konto sind keine Stationen zugewiesen. Wenden Sie sich an die Verwaltung, um Ihre Berechtigungen zu aktivieren.',
        'infoText': 'DJ-Anmeldeinformationen werden verwendet, um Moderatoren während der Übertragung mit der Station zu verbinden. Das Passwort ist verschlüsselt und wird nicht angezeigt.',
        'statusConfigured': 'DJ-Anmeldeinformationen konfiguriert',
        'statusDisabled': 'DJ-Anmeldeinformationen deaktiviert',
        'statusMissing': 'Keine DJ-Anmeldeinformationen',
        'saveSuccess': 'Station DJ-Anmeldeinformationen erfolgreich gespeichert.',
        'host': 'Host *',
        'port': 'Port *',
        'djUsername': 'DJ Benutzername *',
        'djPassword': 'DJ Passwort',
        'leaveBlank': 'Leer lassen, um aktuelles zu behalten',
        'status': 'Status',
        'active': 'Aktiv',
        'inactive': 'Inaktiv',
        'saveBtn': 'DJ-Einstellungen speichern',
        
        'errNotAssigned': 'Station nicht Ihrem Konto zugewiesen',
        'errHostUsernameRequired': 'Host und Benutzername sind erforderlich',
        'errPortRange': 'Der Port muss zwischen 1 und 65535 liegen',
        'errPasswordRequired': 'Passwort ist bei der ersten Erstellung erforderlich',
        'errGeneral': 'Ein Fehler ist aufgetreten: '
    }
}

base_path = 'frontend/messages'

for lang in locales:
    file_path = os.path.join(base_path, f'{lang}.json')
    if os.path.exists(file_path):
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        if 'stationManager' not in data:
            data['stationManager'] = {}
        if 'djSettings' not in data['stationManager']:
            data['stationManager']['djSettings'] = {}
            
        data['stationManager']['djSettings'] = translations[lang]
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write('\n')

print("Translations patched for stationManager.djSettings!")
