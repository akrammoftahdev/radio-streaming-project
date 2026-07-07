import json, os

locales = ['ar', 'en', 'fr', 'tr', 'pt', 'es', 'de']
translations = {
    'ar': {
        'tabBackground': 'موسيقى خلفية',
        'tabSong': 'أغاني',
        'tabBreak': 'فواصل / تترات',
        'tabAd': 'إعلانات',
        'tabSfx': 'مؤثرات صوتية',
        'mediaLibrary': 'مكتبة الوسائط',
        'assignedStationsCount': '{count} محطات مسندة',
        'backToManager': 'العودة للوحة',
        'searchPlaceholder': 'بحث في الوسائط...',
        'allStations': 'كل المحطات',
        'clearFilters': 'مسح الفلاتر',
        'newCategory': '+ قسم جديد',
        'newCategoryTitle': 'قسم {tabLabel} جديد',
        'categoryName': 'اسم القسم *',
        'categoryNamePlaceholder': 'مثال: موسيقى صباحية، أغاني بوب...',
        'stationLabel': 'المحطة المستهدفة *',
        'saveCat': 'حفظ القسم',
        'savingCat': 'جاري الحفظ...',
        'cancel': 'إلغاء',
        'noMatchingCategories': 'لا توجد أقسام مطابقة',
        'noMatchingCategoriesDesc': 'جرب تعديل فلاتر البحث أو المحطة.',
        'noCategoriesYet': 'لا توجد أقسام {tabLabel} بعد',
        'noCategoriesYetDesc': 'انقر على "+ قسم جديد" للبدء في تنظيم مكتبتك الصوتية.',
        'trackCount': '{count} مسار',
        'station': 'محطة',
        'addTrack': '+ إضافة مسار',
        'delete': 'حذف',
        'trackTitlePlaceholder': 'اسم المسار (مثال: تتر البداية) *',
        'trackUrlPlaceholder': 'رابط الملف الصوتي (HTTPS) *',
        'add': 'إضافة',
        'noTracksYet': 'لم تتم إضافة أي مسارات بعد. انقر على "+ إضافة مسار".'
    },
    'en': {
        'tabBackground': 'Background Music',
        'tabSong': 'Songs',
        'tabBreak': 'Break / Ident',
        'tabAd': 'Advertisements',
        'tabSfx': 'Sound Effects',
        'mediaLibrary': 'Media Library',
        'assignedStationsCount': '{count} Stations Assigned',
        'backToManager': 'Back to Dashboard',
        'searchPlaceholder': 'Search media...',
        'allStations': 'All Stations',
        'clearFilters': 'Clear Filters',
        'newCategory': '+ New Category',
        'newCategoryTitle': 'New {tabLabel} Category',
        'categoryName': 'Category Name *',
        'categoryNamePlaceholder': 'e.g. Pop Hits, Morning Background...',
        'stationLabel': 'Target Station *',
        'saveCat': 'Save Category',
        'savingCat': 'Saving...',
        'cancel': 'Cancel',
        'noMatchingCategories': 'No Matching Categories',
        'noMatchingCategoriesDesc': 'Try adjusting your search or station filters.',
        'noCategoriesYet': 'No {tabLabel} Categories Yet',
        'noCategoriesYetDesc': 'Click "+ New Category" to start organizing your audio library.',
        'trackCount': '{count} Tracks',
        'station': 'Station',
        'addTrack': '+ Add Track',
        'delete': 'Delete',
        'trackTitlePlaceholder': 'Track Title (e.g. Morning Intro) *',
        'trackUrlPlaceholder': 'Audio URL (HTTPS) *',
        'add': 'Add',
        'noTracksYet': 'No tracks added yet. Click "+ Add Track".'
    },
    'fr': {
        'tabBackground': 'Musique de fond',
        'tabSong': 'Chansons',
        'tabBreak': 'Pause / Identifiant',
        'tabAd': 'Publicités',
        'tabSfx': 'Effets sonores',
        'mediaLibrary': 'Médiathèque',
        'assignedStationsCount': '{count} Stations attribuées',
        'backToManager': 'Retour au tableau de bord',
        'searchPlaceholder': 'Rechercher un média...',
        'allStations': 'Toutes les stations',
        'clearFilters': 'Effacer les filtres',
        'newCategory': '+ Nouvelle catégorie',
        'newCategoryTitle': 'Nouvelle catégorie {tabLabel}',
        'categoryName': 'Nom de la catégorie *',
        'categoryNamePlaceholder': 'ex: Tubes Pop, Fond matinal...',
        'stationLabel': 'Station cible *',
        'saveCat': 'Enregistrer la catégorie',
        'savingCat': 'Enregistrement...',
        'cancel': 'Annuler',
        'noMatchingCategories': 'Aucune catégorie correspondante',
        'noMatchingCategoriesDesc': 'Essayez d\'ajuster vos filtres de recherche ou de station.',
        'noCategoriesYet': 'Aucune catégorie {tabLabel} pour le moment',
        'noCategoriesYetDesc': 'Cliquez sur "+ Nouvelle catégorie" pour commencer à organiser votre audiothèque.',
        'trackCount': '{count} Pistes',
        'station': 'Station',
        'addTrack': '+ Ajouter une piste',
        'delete': 'Supprimer',
        'trackTitlePlaceholder': 'Titre de la piste (ex: Intro matinale) *',
        'trackUrlPlaceholder': 'URL audio (HTTPS) *',
        'add': 'Ajouter',
        'noTracksYet': 'Aucune piste ajoutée pour le moment. Cliquez sur "+ Ajouter une piste".'
    },
    'tr': {
        'tabBackground': 'Fon Müziği',
        'tabSong': 'Şarkılar',
        'tabBreak': 'Ara / Jingle',
        'tabAd': 'Reklamlar',
        'tabSfx': 'Ses Efektleri',
        'mediaLibrary': 'Medya Kütüphanesi',
        'assignedStationsCount': '{count} İstasyon Atandı',
        'backToManager': 'Panoya Dön',
        'searchPlaceholder': 'Medya ara...',
        'allStations': 'Tüm İstasyonlar',
        'clearFilters': 'Filtreleri Temizle',
        'newCategory': '+ Yeni Kategori',
        'newCategoryTitle': 'Yeni {tabLabel} Kategorisi',
        'categoryName': 'Kategori Adı *',
        'categoryNamePlaceholder': 'ör. Pop Hitleri, Sabah Fonu...',
        'stationLabel': 'Hedef İstasyon *',
        'saveCat': 'Kategoriyi Kaydet',
        'savingCat': 'Kaydediliyor...',
        'cancel': 'İptal',
        'noMatchingCategories': 'Eşleşen Kategori Yok',
        'noMatchingCategoriesDesc': 'Arama veya istasyon filtrelerinizi ayarlamayı deneyin.',
        'noCategoriesYet': 'Henüz {tabLabel} Kategorisi Yok',
        'noCategoriesYetDesc': 'Ses kütüphanenizi düzenlemeye başlamak için "+ Yeni Kategori" ye tıklayın.',
        'trackCount': '{count} Parça',
        'station': 'İstasyon',
        'addTrack': '+ Parça Ekle',
        'delete': 'Sil',
        'trackTitlePlaceholder': 'Parça Başlığı (ör. Sabah İntrosu) *',
        'trackUrlPlaceholder': 'Ses URLsi (HTTPS) *',
        'add': 'Ekle',
        'noTracksYet': 'Henüz parça eklenmedi. "+ Parça Ekle" ye tıklayın.'
    },
    'pt': {
        'tabBackground': 'Música de Fundo',
        'tabSong': 'Músicas',
        'tabBreak': 'Intervalo / Ident',
        'tabAd': 'Propagandas',
        'tabSfx': 'Efeitos Sonoros',
        'mediaLibrary': 'Biblioteca de Mídia',
        'assignedStationsCount': '{count} Estações Atribuídas',
        'backToManager': 'Voltar ao Painel',
        'searchPlaceholder': 'Pesquisar mídia...',
        'allStations': 'Todas as Estações',
        'clearFilters': 'Limpar Filtros',
        'newCategory': '+ Nova Categoria',
        'newCategoryTitle': 'Nova Categoria {tabLabel}',
        'categoryName': 'Nome da Categoria *',
        'categoryNamePlaceholder': 'ex: Sucessos Pop, Fundo Matinal...',
        'stationLabel': 'Estação Alvo *',
        'saveCat': 'Salvar Categoria',
        'savingCat': 'Salvando...',
        'cancel': 'Cancelar',
        'noMatchingCategories': 'Nenhuma Categoria Correspondente',
        'noMatchingCategoriesDesc': 'Tente ajustar os filtros de pesquisa ou estação.',
        'noCategoriesYet': 'Nenhuma Categoria de {tabLabel} Ainda',
        'noCategoriesYetDesc': 'Clique em "+ Nova Categoria" para começar a organizar sua biblioteca de áudio.',
        'trackCount': '{count} Faixas',
        'station': 'Estação',
        'addTrack': '+ Adicionar Faixa',
        'delete': 'Excluir',
        'trackTitlePlaceholder': 'Título da Faixa (ex: Intro Matinal) *',
        'trackUrlPlaceholder': 'URL do Áudio (HTTPS) *',
        'add': 'Adicionar',
        'noTracksYet': 'Nenhuma faixa adicionada ainda. Clique em "+ Adicionar Faixa".'
    },
    'es': {
        'tabBackground': 'Música de Fondo',
        'tabSong': 'Canciones',
        'tabBreak': 'Pausa / Ident',
        'tabAd': 'Anuncios',
        'tabSfx': 'Efectos de Sonido',
        'mediaLibrary': 'Biblioteca de Medios',
        'assignedStationsCount': '{count} Estaciones Asignadas',
        'backToManager': 'Volver al Panel',
        'searchPlaceholder': 'Buscar medios...',
        'allStations': 'Todas las Estaciones',
        'clearFilters': 'Borrar Filtros',
        'newCategory': '+ Nueva Categoría',
        'newCategoryTitle': 'Nueva Categoría {tabLabel}',
        'categoryName': 'Nombre de la Categoría *',
        'categoryNamePlaceholder': 'ej: Éxitos Pop, Fondo Matutino...',
        'stationLabel': 'Estación Objetivo *',
        'saveCat': 'Guardar Categoría',
        'savingCat': 'Guardando...',
        'cancel': 'Cancelar',
        'noMatchingCategories': 'No hay categorías coincidentes',
        'noMatchingCategoriesDesc': 'Intenta ajustar tus filtros de búsqueda o de estación.',
        'noCategoriesYet': 'Aún no hay categorías de {tabLabel}',
        'noCategoriesYetDesc': 'Haz clic en "+ Nueva Categoría" para empezar a organizar tu biblioteca de audio.',
        'trackCount': '{count} Pistas',
        'station': 'Estación',
        'addTrack': '+ Añadir Pista',
        'delete': 'Eliminar',
        'trackTitlePlaceholder': 'Título de la Pista (ej: Intro Matutina) *',
        'trackUrlPlaceholder': 'URL de Audio (HTTPS) *',
        'add': 'Añadir',
        'noTracksYet': 'Aún no hay pistas añadidas. Haz clic en "+ Añadir Pista".'
    },
    'de': {
        'tabBackground': 'Hintergrundmusik',
        'tabSong': 'Lieder',
        'tabBreak': 'Pause / Ident',
        'tabAd': 'Werbung',
        'tabSfx': 'Soundeffekte',
        'mediaLibrary': 'Medienbibliothek',
        'assignedStationsCount': '{count} Stationen Zugewiesen',
        'backToManager': 'Zurück zum Dashboard',
        'searchPlaceholder': 'Medien suchen...',
        'allStations': 'Alle Stationen',
        'clearFilters': 'Filter löschen',
        'newCategory': '+ Neue Kategorie',
        'newCategoryTitle': 'Neue {tabLabel}-Kategorie',
        'categoryName': 'Kategoriename *',
        'categoryNamePlaceholder': 'z.B. Pop-Hits, Morgen-Hintergrund...',
        'stationLabel': 'Zielstation *',
        'saveCat': 'Kategorie speichern',
        'savingCat': 'Speichern...',
        'cancel': 'Abbrechen',
        'noMatchingCategories': 'Keine übereinstimmenden Kategorien',
        'noMatchingCategoriesDesc': 'Versuchen Sie, Ihre Such- oder Stationsfilter anzupassen.',
        'noCategoriesYet': 'Noch keine {tabLabel}-Kategorien',
        'noCategoriesYetDesc': 'Klicken Sie auf "+ Neue Kategorie", um Ihre Audiobibliothek zu organisieren.',
        'trackCount': '{count} Titel',
        'station': 'Station',
        'addTrack': '+ Titel hinzufügen',
        'delete': 'Löschen',
        'trackTitlePlaceholder': 'Titelname (z.B. Morgen-Intro) *',
        'trackUrlPlaceholder': 'Audio-URL (HTTPS) *',
        'add': 'Hinzufügen',
        'noTracksYet': 'Noch keine Titel hinzugefügt. Klicken Sie auf "+ Titel hinzufügen".'
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
        if 'media' not in data['stationManager']:
            data['stationManager']['media'] = {}
        if 'client' not in data['stationManager']['media']:
            data['stationManager']['media']['client'] = {}
            
        data['stationManager']['media']['client'] = translations[lang]
        
        # Also need page.tsx translations, which is just:
        # noStationsAssigned, noStationsDescription
        if lang == 'ar':
            data['stationManager']['media']['noStationsAssigned'] = 'لا توجد محطات مسندة'
            data['stationManager']['media']['noStationsDescription'] = 'لم يتم إسناد أي محطة لحسابك. تواصل مع الإدارة لتفعيل صلاحياتك.'
        elif lang == 'en':
            data['stationManager']['media']['noStationsAssigned'] = 'No assigned stations'
            data['stationManager']['media']['noStationsDescription'] = 'No stations are assigned to your account. Contact administration to activate your permissions.'
        elif lang == 'fr':
            data['stationManager']['media']['noStationsAssigned'] = 'Aucune station attribuée'
            data['stationManager']['media']['noStationsDescription'] = 'Aucune station n\'est attribuée à votre compte. Contactez l\'administration pour activer vos autorisations.'
        elif lang == 'tr':
            data['stationManager']['media']['noStationsAssigned'] = 'Atanmış istasyon yok'
            data['stationManager']['media']['noStationsDescription'] = 'Hesabınıza atanmış istasyon yok. İzinlerinizi etkinleştirmek için yönetimle iletişime geçin.'
        elif lang == 'pt':
            data['stationManager']['media']['noStationsAssigned'] = 'Nenhuma estação atribuída'
            data['stationManager']['media']['noStationsDescription'] = 'Nenhuma estação está atribuída à sua conta. Contate a administração para ativar suas permissões.'
        elif lang == 'es':
            data['stationManager']['media']['noStationsAssigned'] = 'No hay estaciones asignadas'
            data['stationManager']['media']['noStationsDescription'] = 'No hay estaciones asignadas a tu cuenta. Contacta con la administración para activar tus permisos.'
        elif lang == 'de':
            data['stationManager']['media']['noStationsAssigned'] = 'Keine zugewiesenen Stationen'
            data['stationManager']['media']['noStationsDescription'] = 'Ihrem Konto sind keine Stationen zugewiesen. Wenden Sie sich an die Verwaltung, um Ihre Berechtigungen zu aktivieren.'

        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write('\n')

print("Translations patched for stationManager.media!")
