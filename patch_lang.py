import json, os

locales = ['ar', 'en', 'fr', 'tr', 'pt', 'es', 'de']
translations = {
    'ar': {'defaultLanguage': 'لغة النظام الافتراضية', 'defaultLanguageHint': 'اللغة الافتراضية للمستخدمين الجدد والزوار', 'ar': 'العربية', 'en': 'الإنجليزية', 'fr': 'الفرنسية', 'tr': 'التركية', 'pt': 'البرتغالية', 'es': 'الإسبانية', 'de': 'الألمانية'},
    'en': {'defaultLanguage': 'Default System Language', 'defaultLanguageHint': 'The default language for new users and visitors', 'ar': 'Arabic', 'en': 'English', 'fr': 'French', 'tr': 'Turkish', 'pt': 'Portuguese', 'es': 'Spanish', 'de': 'German'},
    'fr': {'defaultLanguage': 'Langue système par défaut', 'defaultLanguageHint': 'La langue par défaut pour les nouveaux utilisateurs et visiteurs', 'ar': 'Arabe', 'en': 'Anglais', 'fr': 'Français', 'tr': 'Turc', 'pt': 'Portugais', 'es': 'Espagnol', 'de': 'Allemand'},
    'tr': {'defaultLanguage': 'Varsayılan Sistem Dili', 'defaultLanguageHint': 'Yeni kullanıcılar ve ziyaretçiler için varsayılan dil', 'ar': 'Arapça', 'en': 'İngilizce', 'fr': 'Fransızca', 'tr': 'Türkçe', 'pt': 'Portekizce', 'es': 'İspanyolca', 'de': 'Almanca'},
    'pt': {'defaultLanguage': 'Idioma Padrão do Sistema', 'defaultLanguageHint': 'O idioma padrão para novos usuários e visitantes', 'ar': 'Árabe', 'en': 'Inglês', 'fr': 'Francês', 'tr': 'Turco', 'pt': 'Português', 'es': 'Espanhol', 'de': 'Alemão'},
    'es': {'defaultLanguage': 'Idioma Predeterminado del Sistema', 'defaultLanguageHint': 'El idioma predeterminado para nuevos usuarios y visitantes', 'ar': 'Árabe', 'en': 'Inglés', 'fr': 'Francés', 'tr': 'Turco', 'pt': 'Portugués', 'es': 'Español', 'de': 'Alemán'},
    'de': {'defaultLanguage': 'Standardsystemsprache', 'defaultLanguageHint': 'Die Standardsprache für neue Benutzer und Besucher', 'ar': 'Arabisch', 'en': 'Englisch', 'fr': 'Französisch', 'tr': 'Türkisch', 'pt': 'Portugiesisch', 'es': 'Spanisch', 'de': 'Deutsch'}
}

base_path = 'frontend/messages'

for lang in locales:
    file_path = os.path.join(base_path, f'{lang}.json')
    if os.path.exists(file_path):
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        if 'admin' not in data:
            data['admin'] = {}
        if 'settings' not in data['admin']:
            data['admin']['settings'] = {}
            
        data['admin']['settings'].update(translations[lang])
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write('\n')

print("Languages patched!")
