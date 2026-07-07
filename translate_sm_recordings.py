import json, os

locales = ['ar', 'en', 'fr', 'tr', 'pt', 'es', 'de']
translations = {
    'ar': {
        'title': 'تسجيلات المحطة - EGONAIR',
        'stationManager': 'مدير المحطة',
        'dashboard': 'اللوحة',
        'backToDashboard': 'العودة للوحة',
        'heading': 'تسجيلات المحطة',
        'dbError': 'حدث خطأ أثناء تحميل التسجيلات. حاول تحديث الصفحة.',
        'allStations': 'كل المحطات',
        'searchPlaceholder': 'بحث في التسجيلات...',
        'noMatchTitle': 'لا توجد تسجيلات مطابقة',
        'noMatchDesc': 'جرب تعديل فلاتر البحث.',
        'noRecordingsTitle': 'لا توجد تسجيلات بعد',
        'noRecordingsDesc': 'ستظهر هنا تسجيلات جلسات البث فور اكتمالها.',
        'recordingsList': 'التسجيلات',
        'page': 'صفحة',
        'of': 'من',
        'audioNotSupported': 'متصفحك لا يدعم تشغيل الصوت.',
        'openBtn': '▶ فتح',
        'downloadBtn': '⬇ تنزيل',
        'previous': '← السابق',
        'next': 'التالي →',
        'noAssignedTitle': 'لا توجد محطات مسندة',
        'noAssignedDesc': 'لم يتم إسناد أي محطة لحسابك. تواصل مع الإدارة لتفعيل صلاحياتك.',
        'noAssignedDesc2': 'تواصل مع الإدارة لتفعيل المحطات المرتبطة بحسابك.',
        
        'sec': 'ث',
        'min': 'د',
        'bytes': 'بايت',
        'kb': 'كيلوبايت',
        'mb': 'ميغابايت'
    },
    'en': {
        'title': 'Station Recordings - EGONAIR',
        'stationManager': 'Station Manager',
        'dashboard': 'Dashboard',
        'backToDashboard': 'Back to Dashboard',
        'heading': 'Station Recordings',
        'dbError': 'An error occurred while loading recordings. Try refreshing the page.',
        'allStations': 'All Stations',
        'searchPlaceholder': 'Search recordings...',
        'noMatchTitle': 'No matching recordings',
        'noMatchDesc': 'Try adjusting search filters.',
        'noRecordingsTitle': 'No recordings yet',
        'noRecordingsDesc': 'Broadcast session recordings will appear here once completed.',
        'recordingsList': 'Recordings',
        'page': 'Page',
        'of': 'of',
        'audioNotSupported': 'Your browser does not support audio playback.',
        'openBtn': '▶ Open',
        'downloadBtn': '⬇ Download',
        'previous': '← Previous',
        'next': 'Next →',
        'noAssignedTitle': 'No assigned stations',
        'noAssignedDesc': 'No stations are assigned to your account. Contact administration to activate your permissions.',
        'noAssignedDesc2': 'Contact administration to activate the stations linked to your account.',
        
        'sec': 'sec',
        'min': 'min',
        'bytes': 'bytes',
        'kb': 'KB',
        'mb': 'MB'
    },
    'fr': {
        'title': 'Enregistrements de la station - EGONAIR',
        'stationManager': 'Responsable de la station',
        'dashboard': 'Tableau de bord',
        'backToDashboard': 'Retour au tableau de bord',
        'heading': 'Enregistrements de la station',
        'dbError': 'Une erreur s\'est produite lors du chargement. Essayez d\'actualiser la page.',
        'allStations': 'Toutes les stations',
        'searchPlaceholder': 'Rechercher des enregistrements...',
        'noMatchTitle': 'Aucun enregistrement correspondant',
        'noMatchDesc': 'Essayez d\'ajuster les filtres de recherche.',
        'noRecordingsTitle': 'Aucun enregistrement pour le moment',
        'noRecordingsDesc': 'Les enregistrements des sessions de diffusion apparaîtront ici une fois terminés.',
        'recordingsList': 'Enregistrements',
        'page': 'Page',
        'of': 'sur',
        'audioNotSupported': 'Votre navigateur ne prend pas en charge la lecture audio.',
        'openBtn': '▶ Ouvrir',
        'downloadBtn': '⬇ Télécharger',
        'previous': '← Précédent',
        'next': 'Suivant →',
        'noAssignedTitle': 'Aucune station attribuée',
        'noAssignedDesc': 'Aucune station n\'est attribuée à votre compte. Contactez l\'administration pour activer vos autorisations.',
        'noAssignedDesc2': 'Contactez l\'administration pour activer les stations liées à votre compte.',
        
        'sec': 's',
        'min': 'min',
        'bytes': 'octets',
        'kb': 'Ko',
        'mb': 'Mo'
    },
    'tr': {
        'title': 'İstasyon Kayıtları - EGONAIR',
        'stationManager': 'İstasyon Yöneticisi',
        'dashboard': 'Pano',
        'backToDashboard': 'Panoya Dön',
        'heading': 'İstasyon Kayıtları',
        'dbError': 'Kayıtlar yüklenirken bir hata oluştu. Sayfayı yenilemeyi deneyin.',
        'allStations': 'Tüm İstasyonlar',
        'searchPlaceholder': 'Kayıtlarda ara...',
        'noMatchTitle': 'Eşleşen kayıt yok',
        'noMatchDesc': 'Arama filtrelerini ayarlamayı deneyin.',
        'noRecordingsTitle': 'Henüz kayıt yok',
        'noRecordingsDesc': 'Yayın oturumu kayıtları tamamlandıktan sonra burada görünecektir.',
        'recordingsList': 'Kayıtlar',
        'page': 'Sayfa',
        'of': '/',
        'audioNotSupported': 'Tarayıcınız ses oynatmayı desteklemiyor.',
        'openBtn': '▶ Aç',
        'downloadBtn': '⬇ İndir',
        'previous': '← Önceki',
        'next': 'Sonraki →',
        'noAssignedTitle': 'Atanmış istasyon yok',
        'noAssignedDesc': 'Hesabınıza atanmış istasyon yok. İzinlerinizi etkinleştirmek için yönetimle iletişime geçin.',
        'noAssignedDesc2': 'Hesabınıza bağlı istasyonları etkinleştirmek için yönetimle iletişime geçin.',
        
        'sec': 'sn',
        'min': 'dk',
        'bytes': 'bayt',
        'kb': 'KB',
        'mb': 'MB'
    },
    'pt': {
        'title': 'Gravações da Estação - EGONAIR',
        'stationManager': 'Gerente da Estação',
        'dashboard': 'Painel',
        'backToDashboard': 'Voltar ao Painel',
        'heading': 'Gravações da Estação',
        'dbError': 'Ocorreu um erro ao carregar as gravações. Tente atualizar a página.',
        'allStations': 'Todas as Estações',
        'searchPlaceholder': 'Pesquisar gravações...',
        'noMatchTitle': 'Nenhuma gravação correspondente',
        'noMatchDesc': 'Tente ajustar os filtros de pesquisa.',
        'noRecordingsTitle': 'Nenhuma gravação ainda',
        'noRecordingsDesc': 'As gravações das sessões de transmissão aparecerão aqui assim que concluídas.',
        'recordingsList': 'Gravações',
        'page': 'Página',
        'of': 'de',
        'audioNotSupported': 'Seu navegador não suporta a reprodução de áudio.',
        'openBtn': '▶ Abrir',
        'downloadBtn': '⬇ Baixar',
        'previous': '← Anterior',
        'next': 'Próximo →',
        'noAssignedTitle': 'Nenhuma estação atribuída',
        'noAssignedDesc': 'Nenhuma estação está atribuída à sua conta. Contate a administração para ativar suas permissões.',
        'noAssignedDesc2': 'Contate a administração para ativar as estações vinculadas à sua conta.',
        
        'sec': 'seg',
        'min': 'min',
        'bytes': 'bytes',
        'kb': 'KB',
        'mb': 'MB'
    },
    'es': {
        'title': 'Grabaciones de la Estación - EGONAIR',
        'stationManager': 'Gerente de la Estación',
        'dashboard': 'Panel',
        'backToDashboard': 'Volver al Panel',
        'heading': 'Grabaciones de la Estación',
        'dbError': 'Se produjo un error al cargar las grabaciones. Intenta actualizar la página.',
        'allStations': 'Todas las Estaciones',
        'searchPlaceholder': 'Buscar grabaciones...',
        'noMatchTitle': 'No hay grabaciones coincidentes',
        'noMatchDesc': 'Intenta ajustar los filtros de búsqueda.',
        'noRecordingsTitle': 'Aún no hay grabaciones',
        'noRecordingsDesc': 'Las grabaciones de las sesiones de transmisión aparecerán aquí una vez completadas.',
        'recordingsList': 'Grabaciones',
        'page': 'Página',
        'of': 'de',
        'audioNotSupported': 'Tu navegador no admite la reproducción de audio.',
        'openBtn': '▶ Abrir',
        'downloadBtn': '⬇ Descargar',
        'previous': '← Anterior',
        'next': 'Siguiente →',
        'noAssignedTitle': 'No hay estaciones asignadas',
        'noAssignedDesc': 'No hay estaciones asignadas a tu cuenta. Contacta con la administración para activar tus permisos.',
        'noAssignedDesc2': 'Contacta con la administración para activar las estaciones vinculadas a tu cuenta.',
        
        'sec': 'seg',
        'min': 'min',
        'bytes': 'bytes',
        'kb': 'KB',
        'mb': 'MB'
    },
    'de': {
        'title': 'Stationsaufzeichnungen - EGONAIR',
        'stationManager': 'Stationsleiter',
        'dashboard': 'Dashboard',
        'backToDashboard': 'Zurück zum Dashboard',
        'heading': 'Stationsaufzeichnungen',
        'dbError': 'Beim Laden der Aufzeichnungen ist ein Fehler aufgetreten. Versuchen Sie, die Seite zu aktualisieren.',
        'allStations': 'Alle Stationen',
        'searchPlaceholder': 'Aufzeichnungen suchen...',
        'noMatchTitle': 'Keine übereinstimmenden Aufzeichnungen',
        'noMatchDesc': 'Versuchen Sie, die Suchfilter anzupassen.',
        'noRecordingsTitle': 'Noch keine Aufzeichnungen',
        'noRecordingsDesc': 'Aufzeichnungen von Übertragungssitzungen werden hier nach Abschluss angezeigt.',
        'recordingsList': 'Aufzeichnungen',
        'page': 'Seite',
        'of': 'von',
        'audioNotSupported': 'Ihr Browser unterstützt keine Audiowiedergabe.',
        'openBtn': '▶ Öffnen',
        'downloadBtn': '⬇ Herunterladen',
        'previous': '← Vorherige',
        'next': 'Nächste →',
        'noAssignedTitle': 'Keine zugewiesenen Stationen',
        'noAssignedDesc': 'Ihrem Konto sind keine Stationen zugewiesen. Wenden Sie sich an die Verwaltung, um Ihre Berechtigungen zu aktivieren.',
        'noAssignedDesc2': 'Wenden Sie sich an die Verwaltung, um die mit Ihrem Konto verknüpften Stationen zu aktivieren.',
        
        'sec': 'Sek',
        'min': 'Min',
        'bytes': 'Bytes',
        'kb': 'KB',
        'mb': 'MB'
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
        if 'recordings' not in data['stationManager']:
            data['stationManager']['recordings'] = {}
            
        data['stationManager']['recordings'] = translations[lang]
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write('\n')

print("Translations patched for stationManager.recordings!")
