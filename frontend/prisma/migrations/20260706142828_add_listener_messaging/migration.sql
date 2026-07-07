-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'PRESENTER',
    "presenter_mode" TEXT NOT NULL DEFAULT 'SINGLE_STATION',
    "email" TEXT,
    "phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "can_broadcast" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "active_dsp_preset_id" TEXT
);

-- CreateTable
CREATE TABLE "PresenterProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "display_name" TEXT,
    "avatar_url" TEXT,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "PresenterProfile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PresenterValidity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "presenter_id" TEXT NOT NULL,
    "valid_from" DATETIME,
    "valid_to" DATETIME,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Cairo',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "PresenterValidity_presenter_id_fkey" FOREIGN KEY ("presenter_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BroadcastSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "presenter_id" TEXT NOT NULL,
    "station_id" TEXT,
    "start_datetime" DATETIME NOT NULL,
    "end_datetime" DATETIME NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Cairo',
    "allow_connect_minutes_before" INTEGER NOT NULL DEFAULT 5,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "BroadcastSchedule_presenter_id_fkey" FOREIGN KEY ("presenter_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BroadcastSchedule_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "Station" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SonicPanelCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "presenter_id" TEXT NOT NULL,
    "station_id" TEXT,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "dj_username" TEXT NOT NULL,
    "dj_password_encrypted" TEXT NOT NULL,
    "stream_password_encrypted" TEXT,
    "mount" TEXT,
    "sid" TEXT,
    "bitrate" INTEGER NOT NULL DEFAULT 64,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "SonicPanelCredential_presenter_id_fkey" FOREIGN KEY ("presenter_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SonicPanelCredential_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "Station" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MediaCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "owner_type" TEXT NOT NULL DEFAULT 'ADMIN',
    "owner_id" TEXT,
    "station_id" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "MediaCategory_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "Station" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MediaTrack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT,
    "file_url" TEXT NOT NULL,
    "duration" INTEGER,
    "mime_type" TEXT,
    "size" INTEGER,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "MediaTrack_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "MediaCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LiveSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "presenter_id" TEXT NOT NULL,
    "schedule_id" TEXT,
    "status" TEXT NOT NULL,
    "connected_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnected_at" DATETIME,
    "disconnect_reason" TEXT,
    "network_quality" TEXT,
    "sonic_connection_status" TEXT,
    "current_mic_state" BOOLEAN NOT NULL DEFAULT false,
    "current_background_track_id" TEXT,
    "current_song_track_id" TEXT,
    "queued_song_track_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "LiveSession_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "BroadcastSchedule" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LiveSession_presenter_id_fkey" FOREIGN KEY ("presenter_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccessLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "attempted_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" TEXT NOT NULL,
    "reason" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "device_type" TEXT,
    "network_quality" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccessLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "admin_id" TEXT,
    "actor_id" TEXT,
    "actor_role" TEXT,
    "station_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metadata" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AudioTransitionSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fade_duration_ms" INTEGER NOT NULL DEFAULT 1500,
    "song_fade_down_on_mic_on" BOOLEAN NOT NULL DEFAULT true,
    "background_fade_down_on_song_start" BOOLEAN NOT NULL DEFAULT true,
    "background_loop_default" BOOLEAN NOT NULL DEFAULT true,
    "shuffle_same_category" BOOLEAN NOT NULL DEFAULT true,
    "avoid_recent_repeat_count" INTEGER NOT NULL DEFAULT 10,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "recordings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "presenter_id" TEXT,
    "live_session_id" TEXT,
    "schedule_id" TEXT,
    "show_date" DATETIME,
    "started_at" DATETIME NOT NULL,
    "ended_at" DATETIME,
    "duration_seconds" INTEGER,
    "local_path" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'audio/webm',
    "bitrate" INTEGER,
    "bytes_received" INTEGER,
    "cloud_url" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "station_id" TEXT,
    "program_id" TEXT,
    "source_type" TEXT,
    "direct_dj_radio_id" TEXT,
    "presenter_name_snapshot" TEXT,
    "presenter_username_snapshot" TEXT,
    "station_name_snapshot" TEXT,
    "program_title_snapshot" TEXT,
    "presenter_deleted" BOOLEAN NOT NULL DEFAULT false,
    "station_deleted" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "recordings_presenter_id_fkey" FOREIGN KEY ("presenter_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "recordings_live_session_id_fkey" FOREIGN KEY ("live_session_id") REFERENCES "LiveSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "recordings_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "BroadcastSchedule" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "recordings_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "Station" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "recordings_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "Program" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "recordings_direct_dj_radio_id_fkey" FOREIGN KEY ("direct_dj_radio_id") REFERENCES "DirectDjRadio" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Station" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "stream_host" TEXT,
    "stream_port" INTEGER,
    "public_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "is_messaging_enabled" BOOLEAN NOT NULL DEFAULT true,
    "iframe_text_color" TEXT,
    "iframe_bg_color" TEXT,
    "iframe_border_color" TEXT,
    "iframe_placeholder_color" TEXT
);

-- CreateTable
CREATE TABLE "StationDefaultCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "station_id" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "dj_username" TEXT NOT NULL,
    "encrypted_password" TEXT NOT NULL,
    "mount" TEXT,
    "sid" TEXT,
    "bitrate" INTEGER NOT NULL DEFAULT 128,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "StationDefaultCredential_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "Station" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PresenterStation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "presenter_id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "PresenterStation_presenter_id_fkey" FOREIGN KEY ("presenter_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PresenterStation_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "Station" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "presenter_id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "valid_from" DATETIME,
    "valid_until" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Program_presenter_id_fkey" FOREIGN KEY ("presenter_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Program_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "Station" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProgramScheduleRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "program_id" TEXT NOT NULL,
    "recurrence_type" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Cairo',
    "allow_connect_minutes_before" INTEGER NOT NULL DEFAULT 5,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProgramScheduleRule_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "Program" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProgramScheduleSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rule_id" TEXT NOT NULL,
    "day_of_week" INTEGER,
    "slot_date" DATETIME,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ProgramScheduleSlot_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "ProgramScheduleRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProgramScheduleException" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "program_id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "exception_date" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT,
    "start_time" TEXT,
    "end_time" TEXT,
    "reason" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProgramScheduleException_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "Program" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProgramScheduleException_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "Station" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StationManagerAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "manager_id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    CONSTRAINT "StationManagerAssignment_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StationManagerAssignment_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "Station" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DirectDjRadio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "presenter_id" TEXT NOT NULL,
    "radio_name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "dj_username" TEXT NOT NULL,
    "encrypted_password" TEXT NOT NULL,
    "mount" TEXT,
    "sid" TEXT,
    "bitrate" INTEGER NOT NULL DEFAULT 128,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "DirectDjRadio_presenter_id_fkey" FOREIGN KEY ("presenter_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
    "system_name" TEXT NOT NULL DEFAULT 'EGONAIR',
    "system_subtitle" TEXT,
    "logo_url" TEXT,
    "logo_dark_url" TEXT,
    "logo_light_url" TEXT,
    "login_logo_dark_url" TEXT,
    "login_logo_light_url" TEXT,
    "mobile_app_icon_url" TEXT,
    "splash_screen_url" TEXT,
    "favicon_url" TEXT,
    "support_phone" TEXT,
    "support_whatsapp" TEXT,
    "support_email" TEXT,
    "default_theme" TEXT NOT NULL DEFAULT 'dark',
    "dark_primary" TEXT,
    "dark_accent" TEXT,
    "dark_background" TEXT,
    "dark_surface" TEXT,
    "dark_text" TEXT,
    "light_primary" TEXT,
    "light_accent" TEXT,
    "light_background" TEXT,
    "light_surface" TEXT,
    "light_text" TEXT,
    "updated_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DspPreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "presenter_id" TEXT,
    "params" TEXT NOT NULL DEFAULT '{}',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "DspPreset_presenter_id_fkey" FOREIGN KEY ("presenter_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ListenerMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "station_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone_number" TEXT,
    "country" TEXT,
    "message" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ListenerMessage_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "Station" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PresenterProfile_user_id_key" ON "PresenterProfile"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "PresenterValidity_presenter_id_key" ON "PresenterValidity"("presenter_id");

-- CreateIndex
CREATE INDEX "BroadcastSchedule_station_id_idx" ON "BroadcastSchedule"("station_id");

-- CreateIndex
CREATE INDEX "SonicPanelCredential_station_id_idx" ON "SonicPanelCredential"("station_id");

-- CreateIndex
CREATE UNIQUE INDEX "SonicPanelCredential_presenter_id_station_id_key" ON "SonicPanelCredential"("presenter_id", "station_id");

-- CreateIndex
CREATE INDEX "MediaCategory_station_id_idx" ON "MediaCategory"("station_id");

-- CreateIndex
CREATE UNIQUE INDEX "Station_slug_key" ON "Station"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "StationDefaultCredential_station_id_key" ON "StationDefaultCredential"("station_id");

-- CreateIndex
CREATE INDEX "PresenterStation_presenter_id_idx" ON "PresenterStation"("presenter_id");

-- CreateIndex
CREATE INDEX "PresenterStation_station_id_idx" ON "PresenterStation"("station_id");

-- CreateIndex
CREATE UNIQUE INDEX "PresenterStation_presenter_id_station_id_key" ON "PresenterStation"("presenter_id", "station_id");

-- CreateIndex
CREATE INDEX "Program_presenter_id_idx" ON "Program"("presenter_id");

-- CreateIndex
CREATE INDEX "Program_station_id_idx" ON "Program"("station_id");

-- CreateIndex
CREATE INDEX "ProgramScheduleRule_program_id_idx" ON "ProgramScheduleRule"("program_id");

-- CreateIndex
CREATE INDEX "ProgramScheduleSlot_rule_id_idx" ON "ProgramScheduleSlot"("rule_id");

-- CreateIndex
CREATE INDEX "ProgramScheduleException_program_id_idx" ON "ProgramScheduleException"("program_id");

-- CreateIndex
CREATE INDEX "ProgramScheduleException_station_id_idx" ON "ProgramScheduleException"("station_id");

-- CreateIndex
CREATE INDEX "ProgramScheduleException_exception_date_idx" ON "ProgramScheduleException"("exception_date");

-- CreateIndex
CREATE INDEX "StationManagerAssignment_manager_id_idx" ON "StationManagerAssignment"("manager_id");

-- CreateIndex
CREATE INDEX "StationManagerAssignment_station_id_idx" ON "StationManagerAssignment"("station_id");

-- CreateIndex
CREATE UNIQUE INDEX "StationManagerAssignment_manager_id_station_id_key" ON "StationManagerAssignment"("manager_id", "station_id");

-- CreateIndex
CREATE INDEX "DirectDjRadio_presenter_id_idx" ON "DirectDjRadio"("presenter_id");

-- CreateIndex
CREATE INDEX "DspPreset_presenter_id_idx" ON "DspPreset"("presenter_id");

-- CreateIndex
CREATE INDEX "ListenerMessage_station_id_idx" ON "ListenerMessage"("station_id");

-- CreateIndex
CREATE INDEX "ListenerMessage_created_at_idx" ON "ListenerMessage"("created_at");
