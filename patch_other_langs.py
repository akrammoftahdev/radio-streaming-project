import json
import os

langs = {
  "de.json": {
    "title": "Wöchentlicher Sendeplan", "subtitle": "Zeigt alle Sender und Programme · Aktuelle Woche", "managePrograms": "⚙️ Programme verwalten", "auditSchedule": "🔍 Zeitplan prüfen", "backToDashboard": "← Dashboard", "programsShown": "Gezeigte Programme", "slotsCount": "Anzahl Slots", "stations": "Sender", "presenters": "Moderatoren", "today": "Heute", "slot": "Slot", "noPrograms": "Keine<br />Programme", "edit": "Bearbeiten ←", "noProgramsMatch": "Keine Programme entsprechen dem Filter.", "noProgramsScheduled": "Noch keine Programme geplant.", "clearFilters": "Alles löschen", "previous": "Zurück", "next": "Weiter", "all": "Alle", "daily": "Täglich", "weekly": "Wöchentlich", "selectedDays": "Ausgewählte Tage", "oneTime": "Einmalig", "night": "Nacht", "morning": "Morgen", "noon": "Mittag", "evening": "Abend",
    "days": {"0": "Sonntag", "1": "Montag", "2": "Dienstag", "3": "Mittwoch", "4": "Donnerstag", "5": "Freitag", "6": "Samstag"}
  },
  "es.json": {
    "title": "Horario de Transmisión Semanal", "subtitle": "Viendo todas las estaciones y programas · Semana actual", "managePrograms": "⚙️ Gestionar Programas", "auditSchedule": "🔍 Auditar Horario", "backToDashboard": "← Panel", "programsShown": "Programas Mostrados", "slotsCount": "Cantidad de Espacios", "stations": "Estaciones", "presenters": "Presentadores", "today": "Hoy", "slot": "Espacio", "noPrograms": "Sin<br />Programas", "edit": "Editar ←", "noProgramsMatch": "Ningún programa coincide con el filtro.", "noProgramsScheduled": "No hay programas programados aún.", "clearFilters": "Borrar Todo", "previous": "Anterior", "next": "Siguiente", "all": "Todos", "daily": "Diario", "weekly": "Semanal", "selectedDays": "Días Seleccionados", "oneTime": "Una Vez", "night": "Noche", "morning": "Mañana", "noon": "Mediodía", "evening": "Noche",
    "days": {"0": "Domingo", "1": "Lunes", "2": "Martes", "3": "Miércoles", "4": "Jueves", "5": "Viernes", "6": "Sábado"}
  },
  "fr.json": {
    "title": "Programme de Diffusion Hebdomadaire", "subtitle": "Affichage de toutes les stations et programmes · Semaine en cours", "managePrograms": "⚙️ Gérer les Programmes", "auditSchedule": "🔍 Auditer le Programme", "backToDashboard": "← Tableau de bord", "programsShown": "Programmes Affichés", "slotsCount": "Nombre de Créneaux", "stations": "Stations", "presenters": "Présentateurs", "today": "Aujourd'hui", "slot": "Créneau", "noPrograms": "Aucun<br />Programme", "edit": "Modifier ←", "noProgramsMatch": "Aucun programme ne correspond au filtre.", "noProgramsScheduled": "Aucun programme prévu pour le moment.", "clearFilters": "Tout effacer", "previous": "Précédent", "next": "Suivant", "all": "Tout", "daily": "Quotidien", "weekly": "Hebdomadaire", "selectedDays": "Jours Sélectionnés", "oneTime": "Une Fois", "night": "Nuit", "morning": "Matin", "noon": "Midi", "evening": "Soir",
    "days": {"0": "Dimanche", "1": "Lundi", "2": "Mardi", "3": "Mercredi", "4": "Jeudi", "5": "Vendredi", "6": "Samedi"}
  },
  "pt.json": {
    "title": "Horário de Transmissão Semanal", "subtitle": "Visualizando todas as estações e programas · Semana atual", "managePrograms": "⚙️ Gerenciar Programas", "auditSchedule": "🔍 Auditar Horário", "backToDashboard": "← Painel", "programsShown": "Programas Exibidos", "slotsCount": "Contagem de Horários", "stations": "Estações", "presenters": "Apresentadores", "today": "Hoje", "slot": "Horário", "noPrograms": "Sem<br />Programas", "edit": "Editar ←", "noProgramsMatch": "Nenhum programa corresponde ao filtro.", "noProgramsScheduled": "Nenhum programa agendado ainda.", "clearFilters": "Limpar Tudo", "previous": "Anterior", "next": "Próximo", "all": "Todos", "daily": "Diário", "weekly": "Semanal", "selectedDays": "Dias Selecionados", "oneTime": "Única Vez", "night": "Noite", "morning": "Manhã", "noon": "Meio-dia", "evening": "Noite",
    "days": {"0": "Domingo", "1": "Segunda", "2": "Terça", "3": "Quarta", "4": "Quinta", "5": "Sexta", "6": "Sábado"}
  },
  "tr.json": {
    "title": "Haftalık Yayın Programı", "subtitle": "Tüm istasyonlar ve programlar görüntüleniyor · Bu hafta", "managePrograms": "⚙️ Programları Yönet", "auditSchedule": "🔍 Programı Denetle", "backToDashboard": "← Kontrol Paneli", "programsShown": "Gösterilen Programlar", "slotsCount": "Slot Sayısı", "stations": "İstasyonlar", "presenters": "Sunucular", "today": "Bugün", "slot": "Slot", "noPrograms": "Program<br />Yok", "edit": "Düzenle ←", "noProgramsMatch": "Filtreyle eşleşen program yok.", "noProgramsScheduled": "Henüz planlanmış program yok.", "clearFilters": "Tümünü Temizle", "previous": "Önceki", "next": "Sonraki", "all": "Tümü", "daily": "Günlük", "weekly": "Haftalık", "selectedDays": "Seçili Günler", "oneTime": "Bir Kez", "night": "Gece", "morning": "Sabah", "noon": "Öğle", "evening": "Akşam",
    "days": {"0": "Pazar", "1": "Pazartesi", "2": "Salı", "3": "Çarşamba", "4": "Perşembe", "5": "Cuma", "6": "Cumartesi"}
  }
}

for filename, trans in langs.items():
    path = f"frontend/messages/{filename}"
    if not os.path.exists(path): continue
    with open(path, 'r', encoding='utf-8') as f: data = json.load(f)
    if "admin" not in data: data["admin"] = {}
    if "schedule" not in data["admin"]: data["admin"]["schedule"] = {}
    
    for k, v in trans.items():
        data["admin"]["schedule"][k] = v
        
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

print("Translations applied successfully.")
