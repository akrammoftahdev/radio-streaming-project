import json
import os

langs = {
  "ar.json": {
    "title": "أرشيف التسجيلات - الإدارة - EGONAIR", "titleMain": "أرشيف التسجيلات", "subtitle": "جميع تسجيلات الجلسات عبر كافة المذيعين",
    "oneRecording": "تسجيل واحد", "recordingsCount": "{count} تسجيل", "dashboard": "لوحة التحكم",
    "loadError": "تعذّر تحميل التسجيلات. يرجى المحاولة مجدداً.", "noMatchTitle": "لا توجد تسجيلات تتطابق مع بحثك", "noMatchDesc": "جرب تعديل الفلاتر أو مسحها لرؤية نتائج أكثر.", "noRecsTitle": "لا توجد تسجيلات بعد", "noRecsDesc": "ستظهر هنا تسجيلات الجلسات فور انتهاء أي جلسة بث.", "viewAll": "عرض جميع التسجيلات", "pageOf": "صفحة {page} من {totalPages}", "totalRecs": "(إجمالي {total} تسجيل)", "resultsPerPage": "عدد النتائج:", "apply": "تطبيق", "prev": "السابق", "next": "التالي",
    "deletedPresenter": "محذوف", "deletedStation": "محذوفة", "liveDj": "مباشر DJ", "audioNotSupported": "متصفحك لا يدعم تشغيل الصوت.", "download": "تحميل", "openNewTab": "فتح في نافذة جديدة", "theirRecsOnly": "تسجيلاته فقط",
    "unitSec": "ث", "unitMin": "د", "unitByte": "بايت", "unitKB": "كيلوبايت", "unitMB": "ميغابايت",
    "deleteConfirm": "هل أنت متأكد أنك تريد حذف هذا التسجيل؟ لا يمكن التراجع عن هذا الإجراء وسيتم مسح الملف نهائياً.", "deleteFailed": "فشل الحذف. يرجى المحاولة مرة أخرى.", "delete": "حذف", "deleting": "جاري الحذف...",
    "filterPresenterLabel": "المذيعين:", "filterPresenterPlaceholder": "اختر مذيع...", "filterPresenterSelected": "{count} مذيع", "clearFilters": "مسح كل الفلاتر",
    "filterStationLabel": "المحطات:", "filterStationPlaceholder": "اختر محطة...", "filterStationSelected": "{count} محطة",
    "searchLabel": "بحث عام", "searchPlaceholder": "ابحث باسم التسجيل أو المذيع أو المحطة...", "dateFrom": "من تاريخ", "dateTo": "إلى تاريخ",
    "presenterType": "نوع المذيع", "all": "الكل", "typeSingle": "محطة واحدة", "typeMulti": "متعدد المحطات", "typeDj": "DJ مباشر",
    "fileType": "نوع الملف", "fileMp3": "MP3", "fileWebm": "WebM",
    "sortLabel": "ترتيب", "sortNewest": "الأحدث", "sortOldest": "الأقدم", "sortDurHigh": "المدة ↓", "sortDurLow": "المدة ↑", "sortSizeHigh": "الحجم ↓", "sortSizeLow": "الحجم ↑"
  },
  "en.json": {
    "title": "Recordings Archive - Admin - EGONAIR", "titleMain": "Recordings Archive", "subtitle": "All session recordings across all presenters",
    "oneRecording": "1 recording", "recordingsCount": "{count} recordings", "dashboard": "Dashboard",
    "loadError": "Failed to load recordings. Please try again.", "noMatchTitle": "No recordings match your search", "noMatchDesc": "Try adjusting or clearing your filters to see more results.", "noRecsTitle": "No recordings yet", "noRecsDesc": "Session recordings will appear here once a broadcast ends.", "viewAll": "View all recordings", "pageOf": "Page {page} of {totalPages}", "totalRecs": "(Total {total} recordings)", "resultsPerPage": "Results per page:", "apply": "Apply", "prev": "Previous", "next": "Next",
    "deletedPresenter": "Deleted", "deletedStation": "Deleted", "liveDj": "Live DJ", "audioNotSupported": "Your browser does not support audio playback.", "download": "Download", "openNewTab": "Open in new tab", "theirRecsOnly": "Their recordings only",
    "unitSec": "s", "unitMin": "m", "unitByte": "bytes", "unitKB": "KB", "unitMB": "MB",
    "deleteConfirm": "Are you sure you want to delete this recording? This cannot be undone and the file will be permanently deleted.", "deleteFailed": "Failed to delete. Please try again.", "delete": "Delete", "deleting": "Deleting...",
    "filterPresenterLabel": "Presenters:", "filterPresenterPlaceholder": "Select a presenter...", "filterPresenterSelected": "{count} selected", "clearFilters": "Clear all filters",
    "filterStationLabel": "Stations:", "filterStationPlaceholder": "Select a station...", "filterStationSelected": "{count} selected",
    "searchLabel": "General Search", "searchPlaceholder": "Search by recording name, presenter, or station...", "dateFrom": "From Date", "dateTo": "To Date",
    "presenterType": "Presenter Type", "all": "All", "typeSingle": "Single Station", "typeMulti": "Multi Station", "typeDj": "Live DJ",
    "fileType": "File Type", "fileMp3": "MP3", "fileWebm": "WebM",
    "sortLabel": "Sort By", "sortNewest": "Newest", "sortOldest": "Oldest", "sortDurHigh": "Duration ↓", "sortDurLow": "Duration ↑", "sortSizeHigh": "Size ↓", "sortSizeLow": "Size ↑"
  },
  "de.json": {
    "title": "Aufnahmenarchiv - Admin", "titleMain": "Aufnahmenarchiv", "subtitle": "Alle Sitzungsaufnahmen aller Moderatoren",
    "oneRecording": "1 Aufnahme", "recordingsCount": "{count} Aufnahmen", "dashboard": "Dashboard",
    "loadError": "Aufnahmen konnten nicht geladen werden. Bitte versuchen Sie es erneut.", "noMatchTitle": "Keine Aufnahmen entsprechen Ihrer Suche", "noMatchDesc": "Versuchen Sie, Ihre Filter anzupassen oder zu löschen, um mehr Ergebnisse zu sehen.", "noRecsTitle": "Noch keine Aufnahmen", "noRecsDesc": "Sitzungsaufnahmen werden hier nach Ende einer Übertragung angezeigt.", "viewAll": "Alle Aufnahmen anzeigen", "pageOf": "Seite {page} von {totalPages}", "totalRecs": "(Insgesamt {total} Aufnahmen)", "resultsPerPage": "Ergebnisse pro Seite:", "apply": "Anwenden", "prev": "Zurück", "next": "Weiter",
    "deletedPresenter": "Gelöscht", "deletedStation": "Gelöscht", "liveDj": "Live-DJ", "audioNotSupported": "Ihr Browser unterstützt keine Audiowiedergabe.", "download": "Herunterladen", "openNewTab": "In neuem Tab öffnen", "theirRecsOnly": "Nur ihre Aufnahmen",
    "unitSec": "s", "unitMin": "m", "unitByte": "Bytes", "unitKB": "KB", "unitMB": "MB",
    "deleteConfirm": "Sind Sie sicher, dass Sie diese Aufnahme löschen möchten? Dies kann nicht rückgängig gemacht werden und die Datei wird dauerhaft gelöscht.", "deleteFailed": "Löschen fehlgeschlagen. Bitte versuchen Sie es erneut.", "delete": "Löschen", "deleting": "Wird gelöscht...",
    "filterPresenterLabel": "Moderatoren:", "filterPresenterPlaceholder": "Moderator auswählen...", "filterPresenterSelected": "{count} ausgewählt", "clearFilters": "Alle Filter löschen",
    "filterStationLabel": "Sender:", "filterStationPlaceholder": "Sender auswählen...", "filterStationSelected": "{count} ausgewählt",
    "searchLabel": "Allgemeine Suche", "searchPlaceholder": "Nach Aufnahmename, Moderator oder Sender suchen...", "dateFrom": "Von Datum", "dateTo": "Bis Datum",
    "presenterType": "Moderatortyp", "all": "Alle", "typeSingle": "Einzelner Sender", "typeMulti": "Mehrere Sender", "typeDj": "Live-DJ",
    "fileType": "Dateityp", "fileMp3": "MP3", "fileWebm": "WebM",
    "sortLabel": "Sortieren nach", "sortNewest": "Neueste", "sortOldest": "Älteste", "sortDurHigh": "Dauer ↓", "sortDurLow": "Dauer ↑", "sortSizeHigh": "Größe ↓", "sortSizeLow": "Größe ↑"
  },
  "es.json": {
    "title": "Archivo de Grabaciones - Admin", "titleMain": "Archivo de Grabaciones", "subtitle": "Todas las grabaciones de sesiones de todos los presentadores",
    "oneRecording": "1 grabación", "recordingsCount": "{count} grabaciones", "dashboard": "Panel de Control",
    "loadError": "Error al cargar las grabaciones. Inténtalo de nuevo.", "noMatchTitle": "Ninguna grabación coincide con tu búsqueda", "noMatchDesc": "Intenta ajustar o borrar tus filtros para ver más resultados.", "noRecsTitle": "Aún no hay grabaciones", "noRecsDesc": "Las grabaciones de las sesiones aparecerán aquí una vez finalizada la transmisión.", "viewAll": "Ver todas las grabaciones", "pageOf": "Página {page} de {totalPages}", "totalRecs": "(Total {total} grabaciones)", "resultsPerPage": "Resultados por página:", "apply": "Aplicar", "prev": "Anterior", "next": "Siguiente",
    "deletedPresenter": "Eliminado", "deletedStation": "Eliminada", "liveDj": "DJ en Vivo", "audioNotSupported": "Tu navegador no soporta reproducción de audio.", "download": "Descargar", "openNewTab": "Abrir en nueva pestaña", "theirRecsOnly": "Solo sus grabaciones",
    "unitSec": "s", "unitMin": "m", "unitByte": "bytes", "unitKB": "KB", "unitMB": "MB",
    "deleteConfirm": "¿Estás seguro de que deseas eliminar esta grabación? Esto no se puede deshacer y el archivo se eliminará permanentemente.", "deleteFailed": "Fallo al eliminar. Inténtalo de nuevo.", "delete": "Eliminar", "deleting": "Eliminando...",
    "filterPresenterLabel": "Presentadores:", "filterPresenterPlaceholder": "Seleccionar presentador...", "filterPresenterSelected": "{count} seleccionados", "clearFilters": "Borrar todos los filtros",
    "filterStationLabel": "Estaciones:", "filterStationPlaceholder": "Seleccionar estación...", "filterStationSelected": "{count} seleccionadas",
    "searchLabel": "Búsqueda General", "searchPlaceholder": "Buscar por nombre, presentador o estación...", "dateFrom": "Desde la fecha", "dateTo": "Hasta la fecha",
    "presenterType": "Tipo de Presentador", "all": "Todos", "typeSingle": "Una Estación", "typeMulti": "Múltiples Estaciones", "typeDj": "DJ en Vivo",
    "fileType": "Tipo de Archivo", "fileMp3": "MP3", "fileWebm": "WebM",
    "sortLabel": "Ordenar por", "sortNewest": "Más recientes", "sortOldest": "Más antiguos", "sortDurHigh": "Duración ↓", "sortDurLow": "Duración ↑", "sortSizeHigh": "Tamaño ↓", "sortSizeLow": "Tamaño ↑"
  },
  "fr.json": {
    "title": "Archives des Enregistrements - Admin", "titleMain": "Archives des Enregistrements", "subtitle": "Tous les enregistrements de session de tous les présentateurs",
    "oneRecording": "1 enregistrement", "recordingsCount": "{count} enregistrements", "dashboard": "Tableau de Bord",
    "loadError": "Échec du chargement. Veuillez réessayer.", "noMatchTitle": "Aucun enregistrement ne correspond à votre recherche", "noMatchDesc": "Essayez d'ajuster ou d'effacer vos filtres pour voir plus de résultats.", "noRecsTitle": "Pas encore d'enregistrements", "noRecsDesc": "Les enregistrements apparaîtront ici à la fin de la diffusion.", "viewAll": "Voir tous les enregistrements", "pageOf": "Page {page} sur {totalPages}", "totalRecs": "(Total {total} enregistrements)", "resultsPerPage": "Résultats/page:", "apply": "Appliquer", "prev": "Précédent", "next": "Suivant",
    "deletedPresenter": "Supprimé", "deletedStation": "Supprimée", "liveDj": "DJ en Direct", "audioNotSupported": "Votre navigateur ne supporte pas l'audio.", "download": "Télécharger", "openNewTab": "Ouvrir dans un nouvel onglet", "theirRecsOnly": "Leurs enregistrements",
    "unitSec": "s", "unitMin": "m", "unitByte": "octets", "unitKB": "Ko", "unitMB": "Mo",
    "deleteConfirm": "Êtes-vous sûr de vouloir supprimer cet enregistrement ? Ceci est irréversible et le fichier sera définitivement supprimé.", "deleteFailed": "Échec de la suppression. Veuillez réessayer.", "delete": "Supprimer", "deleting": "Suppression...",
    "filterPresenterLabel": "Présentateurs:", "filterPresenterPlaceholder": "Sélectionner...", "filterPresenterSelected": "{count} sélectionnés", "clearFilters": "Effacer les filtres",
    "filterStationLabel": "Stations:", "filterStationPlaceholder": "Sélectionner...", "filterStationSelected": "{count} sélectionnées",
    "searchLabel": "Recherche", "searchPlaceholder": "Chercher par nom, présentateur ou station...", "dateFrom": "Date de début", "dateTo": "Date de fin",
    "presenterType": "Type de Présentateur", "all": "Tous", "typeSingle": "Station Unique", "typeMulti": "Multi Stations", "typeDj": "DJ en Direct",
    "fileType": "Type de Fichier", "fileMp3": "MP3", "fileWebm": "WebM",
    "sortLabel": "Trier par", "sortNewest": "Plus récents", "sortOldest": "Plus anciens", "sortDurHigh": "Durée ↓", "sortDurLow": "Durée ↑", "sortSizeHigh": "Taille ↓", "sortSizeLow": "Taille ↑"
  },
  "pt.json": {
    "title": "Arquivo de Gravações - Admin", "titleMain": "Arquivo de Gravações", "subtitle": "Todas as gravações de sessões de todos os apresentadores",
    "oneRecording": "1 gravação", "recordingsCount": "{count} gravações", "dashboard": "Painel de Controle",
    "loadError": "Falha ao carregar as gravações. Tente novamente.", "noMatchTitle": "Nenhuma gravação encontrada", "noMatchDesc": "Tente ajustar ou limpar seus filtros para ver mais resultados.", "noRecsTitle": "Ainda não há gravações", "noRecsDesc": "As gravações aparecerão aqui quando uma transmissão terminar.", "viewAll": "Ver todas as gravações", "pageOf": "Página {page} de {totalPages}", "totalRecs": "(Total {total} gravações)", "resultsPerPage": "Resultados/página:", "apply": "Aplicar", "prev": "Anterior", "next": "Próximo",
    "deletedPresenter": "Excluído", "deletedStation": "Excluída", "liveDj": "DJ ao Vivo", "audioNotSupported": "Seu navegador não suporta reprodução de áudio.", "download": "Baixar", "openNewTab": "Abrir em nova guia", "theirRecsOnly": "Suas gravações apenas",
    "unitSec": "s", "unitMin": "m", "unitByte": "bytes", "unitKB": "KB", "unitMB": "MB",
    "deleteConfirm": "Tem certeza de que deseja excluir esta gravação? Isso não pode ser desfeito e o arquivo será excluído permanentemente.", "deleteFailed": "Falha ao excluir. Tente novamente.", "delete": "Excluir", "deleting": "Excluindo...",
    "filterPresenterLabel": "Apresentadores:", "filterPresenterPlaceholder": "Selecionar...", "filterPresenterSelected": "{count} selecionados", "clearFilters": "Limpar filtros",
    "filterStationLabel": "Estações:", "filterStationPlaceholder": "Selecionar...", "filterStationSelected": "{count} selecionadas",
    "searchLabel": "Busca Geral", "searchPlaceholder": "Buscar por nome, apresentador ou estação...", "dateFrom": "De", "dateTo": "Até",
    "presenterType": "Tipo de Apresentador", "all": "Todos", "typeSingle": "Estação Única", "typeMulti": "Múltiplas Estações", "typeDj": "DJ ao Vivo",
    "fileType": "Tipo de Arquivo", "fileMp3": "MP3", "fileWebm": "WebM",
    "sortLabel": "Ordenar por", "sortNewest": "Mais recentes", "sortOldest": "Mais antigos", "sortDurHigh": "Duração ↓", "sortDurLow": "Duração ↑", "sortSizeHigh": "Tamanho ↓", "sortSizeLow": "Tamanho ↑"
  },
  "tr.json": {
    "title": "Kayıt Arşivi - Yönetici", "titleMain": "Kayıt Arşivi", "subtitle": "Tüm sunuculardaki tüm oturum kayıtları",
    "oneRecording": "1 kayıt", "recordingsCount": "{count} kayıt", "dashboard": "Kontrol Paneli",
    "loadError": "Kayıtlar yüklenemedi. Lütfen tekrar deneyin.", "noMatchTitle": "Aramanızla eşleşen kayıt bulunamadı", "noMatchDesc": "Daha fazla sonuç görmek için filtreleri ayarlamayı veya temizlemeyi deneyin.", "noRecsTitle": "Henüz kayıt yok", "noRecsDesc": "Bir yayın sona erdiğinde oturum kayıtları burada görünecektir.", "viewAll": "Tüm kayıtları görüntüle", "pageOf": "Sayfa {page} / {totalPages}", "totalRecs": "(Toplam {total} kayıt)", "resultsPerPage": "Sayfa başına sonuç:", "apply": "Uygula", "prev": "Önceki", "next": "Sonraki",
    "deletedPresenter": "Silindi", "deletedStation": "Silindi", "liveDj": "Canlı DJ", "audioNotSupported": "Tarayıcınız ses oynatmayı desteklemiyor.", "download": "İndir", "openNewTab": "Yeni sekmede aç", "theirRecsOnly": "Sadece onların kayıtları",
    "unitSec": "sn", "unitMin": "dk", "unitByte": "bayt", "unitKB": "KB", "unitMB": "MB",
    "deleteConfirm": "Bu kaydı silmek istediğinizden emin misiniz? Bu işlem geri alınamaz ve dosya kalıcı olarak silinecektir.", "deleteFailed": "Silinemedi. Lütfen tekrar deneyin.", "delete": "Sil", "deleting": "Siliniyor...",
    "filterPresenterLabel": "Sunucular:", "filterPresenterPlaceholder": "Sunucu seçin...", "filterPresenterSelected": "{count} seçildi", "clearFilters": "Filtreleri temizle",
    "filterStationLabel": "İstasyonlar:", "filterStationPlaceholder": "İstasyon seçin...", "filterStationSelected": "{count} seçildi",
    "searchLabel": "Genel Arama", "searchPlaceholder": "Kayıt adı, sunucu veya istasyona göre ara...", "dateFrom": "Başlangıç Tarihi", "dateTo": "Bitiş Tarihi",
    "presenterType": "Sunucu Tipi", "all": "Tümü", "typeSingle": "Tek İstasyon", "typeMulti": "Çoklu İstasyon", "typeDj": "Canlı DJ",
    "fileType": "Dosya Tipi", "fileMp3": "MP3", "fileWebm": "WebM",
    "sortLabel": "Sırala", "sortNewest": "En yeni", "sortOldest": "En eski", "sortDurHigh": "Süre ↓", "sortDurLow": "Süre ↑", "sortSizeHigh": "Boyut ↓", "sortSizeLow": "Boyut ↑"
  }
}

for filename, trans in langs.items():
    path = f"frontend/messages/{filename}"
    if not os.path.exists(path): continue
    with open(path, 'r', encoding='utf-8') as f: data = json.load(f)
    if "admin" not in data: data["admin"] = {}
    if "recordings" not in data["admin"]: data["admin"]["recordings"] = {}
    
    for k, v in trans.items():
        data["admin"]["recordings"][k] = v
        
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

print("Recordings translations injected successfully.")
