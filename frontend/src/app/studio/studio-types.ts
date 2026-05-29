// ── Studio Shared Types ─────────────────────────────────────────────────────
// Single source of truth for all studio hooks and components.

export type Track    = { id: string; title: string; fileUrl?: string };
export type Category = { id: string; name: string; ownerType: string; tracks: Track[] };

export type MediaTab = "background" | "songs" | "breaks" | "ads";

// Group 4.4 — Session-scoped local file (never uploaded)
export type LocalFile = {
  id:       string;   // crypto.randomUUID()
  name:     string;   // original filename
  mimeType: string;   // e.g. audio/mpeg
  objectUrl: string;  // revokable blob URL
};

export type LocalFilesMap = Record<MediaTab, LocalFile[]>;

// ── Group 4.6 — Audio Policy Layer ───────────────────────────────────────────

export type MediaType   = "BACKGROUND" | "SONG" | "BREAK" | "AD";
export type SourceType  = "ADMIN_DB" | "PRESENTER_DB" | "LOCAL_SESSION";
export type QueueStatus =
  | "QUEUED"                 // generic queued state
  | "READY_AFTER_MIC_CLOSE" // mic is open; will be ready once mic closes
  | "READY"                  // mic is closed; can be played locally
  | "PREVIEW_ONLY"           // local file preview — browser only, not broadcast
  | "BLOCKED_WHILE_MIC_OPEN"; // attempted while mic open — rejected immediately

export type QueueItem = {
  id:         string;       // unique queue entry id
  trackId:    string;       // source track/file id
  title:      string;       // display name
  mediaType:  MediaType;
  sourceType: SourceType;
  ownerType?: "ADMIN" | "PRESENTER";
  objectUrl?: string;       // present if LOCAL_SESSION (blob URL)
  fileUrl?:   string;       // present if ADMIN_DB / PRESENTER_DB (resolved audio URL)
  status:     QueueStatus;
};

/**
 * MEDIA_POLICY — defines what is allowed per MediaType × mic state.
 */
export const MEDIA_POLICY: Record<
  MediaType,
  { canSelectWhileMicOpen: boolean; canPlayWhileMicOpen: boolean; label: string; waitLabel: string }
> = {
  BACKGROUND: {
    canSelectWhileMicOpen: true,
    canPlayWhileMicOpen:   true,
    label:    "مسموح مع المايك",
    waitLabel: "",
  },
  SONG: {
    canSelectWhileMicOpen: true,
    canPlayWhileMicOpen:   false,
    label:    "ينتظر غلق المايك",
    waitLabel: "سيتم التشغيل بعد غلق المايك",
  },
  BREAK: {
    canSelectWhileMicOpen: true,
    canPlayWhileMicOpen:   false,
    label:    "ينتظر غلق المايك",
    waitLabel: "سيتم التشغيل بعد غلق المايك",
  },
  AD: {
    canSelectWhileMicOpen: true,
    canPlayWhileMicOpen:   false,
    label:    "ينتظر غلق المايك",
    waitLabel: "سيتم التشغيل بعد غلق المايك",
  },
};

export type ShoutcastStatus = 'idle' | 'connecting' | 'live' | 'error';

export type UploadedTrack    = { id: string; title: string; fileUrl: string };
export type UploadedCategory = { id: string; name: string; ownerType: string };

export type StudioProps = {
  bgCategories:             Category[];
  songCategories:           Category[];
  adminBreakCategories:     Category[];
  presenterBreakCategories: Category[];
  adminAdCategories:        Category[];
  presenterAdCategories:    Category[];
  sfxCategories?:           Category[];
  sessionEndMs?:            number;
  onExitStudio?:            () => void;
  directDjRadioId?:         string | null;
  scheduledStationId?:      string | null;
};
