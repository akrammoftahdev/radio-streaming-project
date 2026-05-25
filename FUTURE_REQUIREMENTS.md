# EGONAIR — Future Product Requirements

> **Status:** Planning only. No code changes. No database schema changes.
> These requirements are to be implemented **after** stabilizing the live SHOUTcast streaming integration, session lifecycle, recording metadata, and cloud storage provider decision.

---

## 1. Presenter Recording Archive

### Overview
Every live broadcast session must be recorded automatically and stored with full metadata. Recordings should be accessible to the presenter before, during, and after their session slot.

### Recording Behavior

- Every live session is recorded automatically when the presenter activates the microphone.
- Recording starts when the presenter connects and begins transmitting audio.
- Recording stops when the presenter disconnects or their time slot ends.
- Each recording is saved locally on the server immediately.
- Each recording must eventually be uploaded to a cloud storage provider (provider TBD — see Implementation Order).

### Recording Metadata

Each recording entry must be linked to and stored with the following fields:

| Field | Description |
|---|---|
| `presenterId` | Foreign key to the presenter/user record |
| `sessionId` | Unique ID for the live session |
| `scheduleId` | Foreign key to the associated show/schedule slot |
| `showDate` | The date of the scheduled broadcast |
| `startedAt` | Timestamp when recording began (ISO 8601) |
| `endedAt` | Timestamp when recording ended (ISO 8601) |
| `duration` | Duration in seconds |
| `localPath` | Server-side file path of the local recording |
| `cloudUrl` | Future cloud storage URL (nullable until uploaded) |
| `format` | Audio format (e.g. `audio/mpeg`) |
| `bitrate` | Encoding bitrate (e.g. `64`) |

### Presenter Recording Access

Presenters must have a dedicated page to view their personal recording archive.

**Available from:**
- The presenter waiting/countdown screen (before the studio slot opens)
- After session ends (post-session screen or studio exit)

**Presenter can:**
- View a list of past recordings sorted by date (newest first)
- See for each episode:
  - Show date and day name (in Arabic)
  - Start time and end time
  - Duration
  - Episode/session title (from schedule)
- Play a recording directly in the browser (HTML5 audio player)
- Download the recording as an MP3 file
- See the linked schedule/show name

**Presenter cannot:**
- Delete recordings
- Share recordings publicly
- Edit recording metadata

### Admin Recording Access

- Admin can view all recordings across all presenters.
- Admin can filter by presenter, date range, or show.
- Admin can download any recording.
- Admin can mark a recording for deletion (soft-delete only).

---

## 2. Hybrid Media Sources

### Overview

The current admin-managed cloud media library remains the primary source of background music and audio tracks. In a future phase, presenters will be able to supplement the cloud library with files from their own local device for a session.

### Current Behavior (unchanged)

- Admin manages a cloud media library through the admin panel.
- Media is organized into categories and tracks.
- Presenters can browse and select tracks from the cloud library inside the studio.

### Future: Local Device Files

- Presenters can upload files from their local device for use within the current session only.
- Local files are **session-scoped** by default — they do not persist after the session ends.
- Local files **do not** automatically become part of the admin cloud library.
- Presenters must explicitly choose to use local files; they are not required.
- Acceptable formats: MP3, WAV, AAC, OGG.
- Local files should be held in a temporary browser memory buffer (no server upload required for playback).

### Pre-Session Playlist

- Presenters can select and arrange songs and background tracks **before** entering the studio.
- The pre-session playlist selection is accessible from the waiting/countdown screen.
- The playlist can be edited during the session.

### Studio Media UI Separation

The Studio UI media library panel must clearly separate three distinct sources:

| Arabic Label | Description |
|---|---|
| `المكتبة السحابية` | Admin-managed cloud library (current behavior) |
| `ملفاتي من الجهاز` | Local files chosen from the presenter's device (session-scoped) |
| `اختيارات الجلسة` | The presenter's current session playlist (assembled from either source) |

### Constraints

- Local file picker must not auto-upload to the server.
- Local files must not be accessible by other presenters.
- The admin cloud library remains read-only from the presenter's perspective.
- No changes to the existing cloud library schema or admin UI in this phase.

---

## 3. Implementation Order

The features described above must be implemented **only after** the following foundations are stable and verified:

### Prerequisites (must be completed first)

1. **Live SHOUTcast streaming integration**
   - The full pipeline (Browser mic → FFmpeg → SonicPanel TCP) must be stable and integrated into the main Studio UI using `npm run dev` (port 4001), not the test script.
   - Presenter connect/disconnect must cleanly open and close the SHOUTcast source connection.

2. **Session lifecycle management**
   - A `LiveSession` database record must be created when a presenter connects.
   - The record must be updated when the presenter disconnects.
   - Session state (active, ended, error) must be persisted.

3. **Recording metadata persistence**
   - Recording file path and session metadata must be written to the database at session end.
   - Local recording files must be named and organized by `presenterId` and `sessionId`.

4. **Cloud storage provider decision**
   - A cloud storage provider must be selected (e.g. AWS S3, Cloudflare R2, Backblaze B2).
   - An upload strategy must be defined (immediate upload vs. post-session batch).
   - The `cloudUrl` field must be populated after successful upload.

### Feature Implementation Order (after prerequisites)

1. Recording archive backend (API routes + database schema)
2. Presenter recording archive page (UI)
3. Admin recording view (UI)
4. Local device file picker (frontend only, session-scoped)
5. Hybrid media source UI separation in Studio

---

*Document created: 2026-04-25*
*Status: Planning only — no code changes made*
