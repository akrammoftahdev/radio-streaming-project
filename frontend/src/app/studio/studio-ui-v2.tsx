"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations, useLocale } from 'next-intl';
import { isRtl } from '@/i18n/config';
import NoSleep from "nosleep.js";
import DspPanel from "@/components/studio/DspPanel";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import { type DspParams, DEFAULT_DSP_PARAMS } from "@/lib/dsp-presets";

type Track    = { id: string; title: string; fileUrl?: string };
type Category = { id: string; name: string; ownerType: string; tracks: Track[] };

type MediaTab = "background" | "songs" | "breaks" | "ads";

// Group 4.4 — Session-scoped local file (never uploaded)
type LocalFile = {
  id:       string;   // crypto.randomUUID()
  name:     string;   // original filename
  mimeType: string;   // e.g. audio/mpeg
  objectUrl: string;  // revokable blob URL
};

type LocalFilesMap = Record<MediaTab, LocalFile[]>;

export type ListenerMessage = {
  id: string;
  name?: string;
  senderName: string;
  country: string | null;
  phoneNumber: string | null;
  email: string | null;
  message: string;
  createdAt: string;
};

// ── Group 4.6 — Audio Policy Layer ───────────────────────────────────────────

type MediaType   = "BACKGROUND" | "SONG" | "BREAK" | "AD";
type SourceType  = "ADMIN_DB" | "PRESENTER_DB" | "LOCAL_SESSION";
type QueueStatus =
  | "QUEUED"                 // generic queued state
  | "READY_AFTER_MIC_CLOSE" // mic is open; will be ready once mic closes
  | "READY"                  // mic is closed; can be played locally
  | "PREVIEW_ONLY"           // local file preview — browser only, not broadcast
  | "BLOCKED_WHILE_MIC_OPEN"; // attempted while mic open — rejected immediately

type QueueItem = {
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
 *
 * canSelectWhileMicOpen  — presenter can add to queue while mic is live.
 * canPlayWhileMicOpen    — actual audio playback is allowed while mic is open.
 *                          Currently FALSE for all types except BACKGROUND
 *                          (no real audio mixing engine exists).
 * previewOnlyWarning     — shown for LOCAL_SESSION items in all tabs.
 */
const MEDIA_POLICY: Record<
  MediaType,
  { canSelectWhileMicOpen: boolean; canPlayWhileMicOpen: boolean; label: string; waitLabel: string }
> = {
  BACKGROUND: {
    canSelectWhileMicOpen: true,
    canPlayWhileMicOpen:   true,   // plays as ambient loop, allowed under mic
    label:    "مسموح مع المايك",
    waitLabel: "",
  },
  SONG: {
    canSelectWhileMicOpen: true,   // can queue, NOT play
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

type Props = {
  bgCategories:             Category[];
  songCategories:           Category[];
  adminBreakCategories:     Category[];
  presenterBreakCategories: Category[];
  adminAdCategories:        Category[];
  presenterAdCategories:    Category[];
  sfxCategories?:           Category[];  // SFX pads — admin-uploaded sound effects
  sessionEndMs?:            number;   // unix ms — if set, auto-disconnect when now ≥ sessionEndMs
  onExitStudio?:            () => void; // called after clean-disconnect to return to pre-flight
  directDjRadioId?:         string | null; // DIRECT_DJ only — required for token creation
  scheduledStationId?:      string | null; // SCHEDULED only — time-resolved station, forwarded as P0 to token/create
};


// ── PresenterUploadWidget ─────────────────────────────────────────────────────
// A compact upload button + progress bar for the presenter's personal BREAK/AD
// library. Posts to /api/studio/media/upload, handles auto-category creation,
// and calls onUploaded so the parent can append optimistically.

type UploadedTrack    = { id: string; title: string; fileUrl: string };
type UploadedCategory = { id: string; name: string; ownerType: string };

function PresenterUploadWidget({
  mediaType,
  onUploaded,
}: {
  mediaType:  "BREAK" | "AD";
  onUploaded: (track: UploadedTrack, category: UploadedCategory) => void;
}) {
  const isBreak = mediaType === "BREAK";
  const label   = isBreak ? "⬆ رفع فاصل شخصي" : "⬆ رفع إعلان شخصي";
  const accent  = isBreak ? "amber" : "rose";

  const [open,       setOpen]       = React.useState(false);
  const [pending,    setPending]    = React.useState(false);
  const [pct,        setPct]        = React.useState<number | null>(null);
  const [error,      setError]      = React.useState("");
  const [success,    setSuccess]    = React.useState("");
  const fileRef = React.useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("يرجى اختيار ملف صوتي."); return; }

    const rawTitle = (e.currentTarget.elements.namedItem("title") as HTMLInputElement)?.value.trim();
    const title    = rawTitle || file.name.replace(/\.[^.]+$/, "");

    const fd = new FormData();
    fd.append("file",  file);
    fd.append("type",  mediaType);
    fd.append("title", title);

    setError(""); setSuccess(""); setPending(true); setPct(0);

    try {
      const result = await new Promise<{ track: UploadedTrack; category: UploadedCategory }>(
        (resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/studio/media/upload");
          xhr.upload.onprogress = ev => {
            if (ev.lengthComputable) setPct(Math.round((ev.loaded / ev.total) * 100));
          };
          xhr.onload = () => {
            if (xhr.status === 201) {
              try { resolve(JSON.parse(xhr.responseText)); }
              catch { reject(new Error("استجابة غير صالحة من الخادم.")); }
            } else {
              try { reject(new Error(JSON.parse(xhr.responseText).error || `خطأ ${xhr.status}`)); }
              catch { reject(new Error(`خطأ ${xhr.status}`)); }
            }
          };
          xhr.onerror = () => reject(new Error("فشل الاتصال بالخادم."));
          xhr.send(fd);
        }
      );
      onUploaded(result.track, result.category);
      setSuccess("✅ تم رفع الملف الصوتي بنجاح");
      (e.target as HTMLFormElement).reset();
      if (fileRef.current) fileRef.current.value = "";
      setPct(null);
      setPending(false);
      setTimeout(() => { setOpen(false); setSuccess(""); }, 2000);
    } catch (err: unknown) {
      setError((err as Error).message || "حدث خطأ أثناء الرفع.");
      setPending(false);
      setPct(null);
    }
  }

  const borderCls  = isBreak ? "border-amber-400/30" : "border-rose-400/30";
  const bgCls      = isBreak ? "bg-amber-400/5"      : "bg-rose-400/5";
  const textCls    = isBreak ? "text-amber-300"       : "text-rose-300";
  const btnCls     = isBreak
    ? "bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30"
    : "bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30";
  const submitCls  = isBreak
    ? "bg-amber-600 hover:bg-amber-500 text-white"
    : "bg-rose-600 hover:bg-rose-500 text-white";
  const progressCls = isBreak ? "bg-amber-500" : "bg-rose-500";

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${btnCls}`}
      >
        {label}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit}
      className={`mt-2 p-3 rounded-xl border ${borderCls} ${bgCls} space-y-2`}>
      {/* Title */}
      <div>
        <label className="block text-[10px] text-neutral-500 mb-1">
          العنوان (اختياري — يُستخرج من اسم الملف)
        </label>
        <input
          name="title"
          placeholder="يُملأ تلقائياً من اسم الملف"
          className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
        />
      </div>
      {/* File */}
      <div>
        <label className="block text-[10px] text-neutral-500 mb-1">
          الملف الصوتي * (MP3 / WAV — حتى 50 MB)
        </label>
        <input
          ref={fileRef}
          type="file"
          accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,.mp3,.wav"
          required
          className="w-full text-xs text-neutral-300 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[10px] file:font-medium file:bg-indigo-600/80 file:text-white hover:file:bg-indigo-500 cursor-pointer"
        />
      </div>
      {/* Progress bar */}
      {pct !== null && (
        <div>
          <div className="h-1 w-full bg-neutral-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-200 ${progressCls}`} style={{ width: `${pct}%` }} />
          </div>
          <span className={`text-[10px] mt-0.5 block ${textCls}`}>{pct}% مُرفوع...</span>
        </div>
      )}
      {/* Messages */}
      {success && (
        <div className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-2 py-1.5">
          {success}
        </div>
      )}
      {error && <p className="text-[10px] text-red-400">{error}</p>}
      {/* Actions */}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={() => { setOpen(false); setError(""); setPct(null); }}
          className="px-2.5 py-1 text-[10px] text-neutral-400 hover:text-neutral-200 transition-colors">
          إلغاء
        </button>
        <button type="submit" disabled={pending}
          className={`px-3 py-1 text-[10px] font-medium rounded-lg transition-colors disabled:opacity-50 ${submitCls}`}>
          {pending ? "جارِ الرفع..." : label}
        </button>
      </div>
    </form>
  );
}

export default function StudioPage({
  bgCategories,
  songCategories,
  adminBreakCategories,
  presenterBreakCategories,
  adminAdCategories,
  presenterAdCategories,
  sfxCategories = [],
  sessionEndMs,
  onExitStudio,
  directDjRadioId,
  scheduledStationId,
}: Props) {

  const t = useTranslations('studio');
  const tc = useTranslations('common');
  const locale = useLocale();
  const dir = isRtl(locale) ? 'rtl' : 'ltr';

  const [isMicOpen, setIsMicOpen] = useState(false);
  const [isGuestOnAir, setIsGuestOnAir] = useState(false);
  const isVoiceLive = isMicOpen || isGuestOnAir;
  const [isConnected, setIsConnected] = useState(false);
  // Auto-disconnect message shown after session end watchdog fires
  const [autoDisconnectMsg, setAutoDisconnectMsg] = useState<string | null>(null);
  // Mobile responsive tab
  type MobileTab = "mixer" | "library" | "queue" | "sfx" | "messages";
  const [mobileTab, setMobileTab] = useState<MobileTab>("mixer");
  // V2: multi-accordion (allows multiple categories open at once)
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  // V2: track which SFX are currently playing (for UI highlight)
  const [activeSfxIds, setActiveSfxIds] = useState<Set<string>>(new Set());
  const [liveMessages, setLiveMessages] = useState<ListenerMessage[]>([]);
  const [isMessagingEnabled, setIsMessagingEnabled] = useState<boolean>(true);
  const router = useRouter();

  // Stable ref for onExitStudio so the watchdog closure can call it without
  // adding it to the dependency array (avoids re-registering the interval).
  const onExitStudioRef = useRef<(() => void) | undefined>(onExitStudio);


  // Tracks the SHOUTcast pipeline status separately from WS connection.
  // 'idle'           — not connected
  // 'ws_connected'   — WS open, recording may start
  // 'recording'      — first audio chunk received, DB row created
  // 'connecting'     — SHOUTcast TCP connect in progress
  // 'on_air'         — SHOUTcast handshake accepted ✔
  // 'radio_error'    — SHOUTcast failed (recording still active)
  // 'recording_only' — ENABLE_SHOUTCAST_LIVE=false on server
  type ShoutcastStatus = 'idle' | 'ws_connected' | 'recording' | 'connecting' | 'on_air' | 'radio_error' | 'recording_only';
  const [shoutcastStatus, setShoutcastStatus] = useState<ShoutcastStatus>('idle');
  const [activeBgTrackId, setActiveBgTrackId] = useState<string | null>(null);
  // Local-device background (objectUrl) — separate from DB track id
  const [activeBgLocalUrl, setActiveBgLocalUrl] = useState<string | null>(null);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  // nowPlayingId fully removed (4.8) — mediaQueue is the single source of truth
  // nextSongId deprecated (4.7): songs now use mediaQueue
  const [openSongCategory, setOpenSongCategory] = useState<string | null>(null);
  const [activeMediaTab, setActiveMediaTab] = useState<MediaTab>("background");
  const [openBreakCategory, setOpenBreakCategory] = useState<string | null>(null);
  const [openAdCategory, setOpenAdCategory] = useState<string | null>(null);
  // Group 4.4 — local device files, session-scoped only
  const [localFiles, setLocalFiles] = useState<LocalFilesMap>({
    background: [], songs: [], breaks: [], ads: [],
  });
  const localObjectUrlsRef = useRef<Set<string>>(new Set());
  // Group 4.6 — unified media queue (all types: BACKGROUND/SONG/BREAK/AD)
  const [mediaQueue, setMediaQueue] = useState<QueueItem[]>([]);
  const [draggedQueueIndex, setDraggedQueueIndex] = useState<number | null>(null);
  const [dragOverQueueIndex, setDragOverQueueIndex] = useState<number | null>(null);
  // Group 4.8 — Manual Playback Engine (Queue V2 Phase 2)
  const currentlyPlayingRef = useRef<HTMLAudioElement | null>(null);
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);
  const [playingQueueId, setPlayingQueueId] = useState<string | null>(null);
  const [bgVolume, setBgVolume] = useState<number>(50);
  // Ducking ratio applied to background gain when mic is open.
  // 0.10 → fader 50% gives 5% background under mic; fader 100% gives 10%.
  const BG_DUCK_RATIO = 0.10;
  // ── Queue-to-Queue Crossfade ────────────────────────────────────────────────
  const QUEUE_CROSSFADE_SEC = 3;       // overlap duration in seconds
  const QUEUE_CROSSFADE_CHECK_MS = 500; // polling interval to detect near-end

  const [queueVolume, setQueueVolume] = useState<number>(80);
  // Group 4.9 — Stable ref to latest mediaQueue for use inside audio callbacks
  const mediaQueueRef = useRef<QueueItem[]>([]);
  // Stable refs for background state — lets ws.onopen read current values without stale closure
  const activeBgTrackIdRef  = useRef<string | null>(null);
  const activeBgLocalUrlRef = useRef<string | null>(null);
  const bgVolumeRef         = useRef<number>(50);
  const [fadeMessage, setFadeMessage] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [volumeLevel, setVolumeLevel] = useState<number>(0);
  const [heartbeatStatus, setHeartbeatStatus] = useState<"active" | "stopped">("stopped");
  const [audioBackendStatus, setAudioBackendStatus] = useState<"connected" | "disconnected">("disconnected");
  // Group 4.10 — Auto Queue: when ON the next READY item plays automatically
  const [autoQueue, setAutoQueue] = useState<boolean>(true);
  // Group 4.11 — Playback progress for seek bar (id + currentTime + duration)
  const [playbackProgress, setPlaybackProgress] = useState<{ id: string; currentTime: number; duration: number } | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  // Group 4.12 — Presenter headphone monitoring (local speaker output)
  const [isMonitoring, setIsMonitoring] = useState<boolean>(false);
  const [monitorVolume, setMonitorVolume] = useState<number>(0.3);
  // Group 4.13 — Microphone input device selector
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicDeviceId, setSelectedMicDeviceId] = useState<string>('');
  const [micDeviceError, setMicDeviceError] = useState<string | null>(null);
  // Group 4.15 — Audio output device selector for monitoring
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState<string>('default');
  // Group 4.16 — Tab Audio Capture (Guest Audio)
  const [isTabAudioActive, setIsTabAudioActive] = useState(false);
  const [tabAudioVolume, setTabAudioVolume] = useState<number>(80);
  // Group 4.14 — Local mutable copies of presenter media categories (for optimistic upload append)
  const [localPresenterBreakCats, setLocalPresenterBreakCats] = useState<Category[]>(presenterBreakCategories);
  const [localPresenterAdCats,    setLocalPresenterAdCats]    = useState<Category[]>(presenterAdCategories);

  const audioCtxRef    = useRef<AudioContext | null>(null);
  const analyserRef    = useRef<AnalyserNode | null>(null);
  const streamRef      = useRef<MediaStream | null>(null);
  const rafRef         = useRef<number | null>(null);
  const dataArrayRef   = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const heartbeatRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef          = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const volumeRef      = useRef<number>(0);
  const noSleepRef     = useRef<any>(null);
  // ── Web Audio Mixer ────────────────────────────────────────────────────────
  const mixerDestRef   = useRef<MediaStreamAudioDestinationNode | null>(null);
  const micSourceRef   = useRef<MediaStreamAudioSourceNode | null>(null);
  const micGainRef     = useRef<GainNode | null>(null);
  const bgSourceRef    = useRef<MediaElementAudioSourceNode | null>(null);
  const bgGainRef      = useRef<GainNode | null>(null);
  const queueSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const queueGainRef   = useRef<GainNode | null>(null);
  // Silent keepalive — ConstantSourceNode at gain 0, keeps mixerDest stream
  // alive even when mic is muted and no audio is playing, preventing the
  // backend WebSocket from closing due to an empty/silent stream.
  const keepaliveRef   = useRef<ConstantSourceNode | null>(null);
  // Mic-priority: queue item that was paused when mic opened—resumed on mic close
  const pausedForMicRef = useRef<QueueItem | null>(null);
  // Stable ref for autoQueue — prevents stale closure inside audio.onended
  const autoQueueRef = useRef<boolean>(true);
  // Manual pause: stores the paused Audio element and its QueueItem for resume
  const pausedQueueAudioRef = useRef<HTMLAudioElement | null>(null);
  const pausedQueueItemRef  = useRef<QueueItem | null>(null);
  // RAF handle for progress polling
  const playbackRafRef = useRef<number | null>(null);
  // Monitoring GainNode — routed through monitorDest → monitorAudio for device selection
  const monitorGainRef = useRef<GainNode | null>(null);
  // Monitor output path: monitorGain → monitorDest → monitorAudio.setSinkId(deviceId)
  const monitorDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const monitorAudioRef = useRef<HTMLAudioElement | null>(null);

  // Group 4.16 Refs
  const tabAudioStreamRef = useRef<MediaStream | null>(null);
  const tabAudioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const tabAudioGainRef   = useRef<GainNode | null>(null);
  // pendingRecordingReasonRef kept for backward safety — no longer drained (startSessionRecording
  // is called directly in ws.onopen; this ref is no longer written or read).
  const pendingRecordingReasonRef = useRef<'mic' | 'background' | 'queue' | null>(null);
  // ── Queue-to-Queue Crossfade refs ──────────────────────────────────────────
  // Timer that polls currentTime to detect when track is near end
  const crossfadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Guard: true while a crossfade overlap is in progress (prevents re-entrant triggers)
  const inCrossfadeRef = useRef<boolean>(false);
  // The "outgoing" player during crossfade — kept alive until fade completes
  const outgoingPlayerRef = useRef<{
    audio: HTMLAudioElement;
    source: MediaElementAudioSourceNode;
    gain: GainNode;
  } | null>(null);
  // ── SFX Pads ────────────────────────────────────────────────────────────────
  // Pre-decoded AudioBuffers for instant playback (no network latency on trigger)
  const sfxBuffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  // Active SFX sources so we can stop them on demand
  const activeSfxRef  = useRef<Map<string, AudioBufferSourceNode>>(new Map());
  // SFX gain node — routed to mixer for broadcast + monitor for local preview
  const sfxGainRef    = useRef<GainNode | null>(null);
  // SFX volume (0–1) — independent slider
  const [sfxVolume, setSfxVolume]     = useState(0.8);
  const sfxVolumeRef = useRef(0.8);
  // SFX preload status for UI feedback
  const [sfxPreloadStatus, setSfxPreloadStatus] = useState<'idle' | 'loading' | 'ready'>('idle');
  // Open SFX category accordion
  const [openSfxCategory, setOpenSfxCategory] = useState<string | null>(null);
  // ── DSP Mic Filters ─────────────────────────────────────────────────────────
  const [dspParams, setDspParams]     = useState<DspParams>(DEFAULT_DSP_PARAMS);
  const [dspBypassed, setDspBypassed] = useState(false);
  const dspParamsRef   = useRef<DspParams>(DEFAULT_DSP_PARAMS);
  // Node refs for the 13-node processing chain
  const dspHpRef       = useRef<BiquadFilterNode | null>(null);        // High-pass filter
  const dspLpRef       = useRef<BiquadFilterNode | null>(null);        // Low-pass filter
  const dspEqLowRef    = useRef<BiquadFilterNode | null>(null);        // EQ — low shelf
  const dspEqMidRef    = useRef<BiquadFilterNode | null>(null);        // EQ — mid peaking
  const dspEqHighRef   = useRef<BiquadFilterNode | null>(null);        // EQ — high shelf
  const dspCompRef     = useRef<DynamicsCompressorNode | null>(null);  // Compressor
  const dspLimiterRef  = useRef<DynamicsCompressorNode | null>(null);  // Limiter (comp w/ high ratio)
  const dspGateGainRef = useRef<GainNode | null>(null);                // Noise gate (controlled via analyser)
  const dspGateAnalyserRef = useRef<AnalyserNode | null>(null);        // Gate analyser
  const dspGateRafRef  = useRef<number | null>(null);                  // Gate RAF loop
  const dspDeEsserBpRef = useRef<BiquadFilterNode | null>(null);       // De-esser bandpass
  const dspDeEsserGainRef = useRef<GainNode | null>(null);             // De-esser sidechain gain
  const dspReverbConvRef = useRef<ConvolverNode | null>(null);         // Reverb convolver
  const dspReverbWetRef  = useRef<GainNode | null>(null);              // Reverb wet mix
  const dspReverbDryRef  = useRef<GainNode | null>(null);              // Reverb dry mix
  const dspDelayRef     = useRef<DelayNode | null>(null);              // Delay node
  const dspDelayFbRef   = useRef<GainNode | null>(null);               // Delay feedback
  const dspDelayWetRef  = useRef<GainNode | null>(null);               // Delay wet mix
  const dspDelayDryRef  = useRef<GainNode | null>(null);               // Delay dry mix
  const dspWarmthRef    = useRef<WaveShaperNode | null>(null);         // Tape warmth
  const dspWarmthWetRef = useRef<GainNode | null>(null);               // Warmth wet
  const dspWarmthDryRef = useRef<GainNode | null>(null);               // Warmth dry
  // DSP chain output — connects to micGainRef
  const dspOutputRef    = useRef<GainNode | null>(null);               // Final DSP output
  // DSP bypass splitter — mic source goes to either DSP chain or direct to micGain
  const dspBypassRef    = useRef<boolean>(false);

  const stopBackgroundAudio = useCallback(() => {
    // Disconnect mixer nodes before releasing the element
    try { bgGainRef.current?.disconnect(); } catch {/* ignore */}
    try { bgSourceRef.current?.disconnect(); } catch {/* ignore */}
    bgGainRef.current   = null;
    bgSourceRef.current = null;
    if (bgAudioRef.current) {
      bgAudioRef.current.pause();
      bgAudioRef.current.currentTime = 0;
      bgAudioRef.current = null;
    }
  }, []);

  // Mute mic hardware only — keeps WS/AudioContext/MediaRecorder alive for queue+bg
  const muteMic = useCallback(() => {
    // Ramp mic gain to 0 (silence mic in broadcast without stopping stream)
    if (micGainRef.current) {
      micGainRef.current.gain.value = 0;
    }
    // Stop the raw hardware mic tracks to release the browser mic indicator
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    // Disconnect the mic source node (no longer needed until mic re-opens)
    try { micSourceRef.current?.disconnect(); } catch {/* ignore */}
    micSourceRef.current = null;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    setVolumeLevel(0);
  }, []);

  // ── ensureAudioMixer ────────────────────────────────────────────────────────
  // Lazy-init AudioContext + mixerDest + keepalive + monitor.
  // Called by queue playback, bg playback, toggleMonitoring, and toggleConnection.
  // Safe to call multiple times — only creates if not yet initialised.
  const ensureAudioMixer = useCallback(async () => {
    let ctx = audioCtxRef.current;
    if (!ctx) {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;
    }
    if (ctx.state === 'suspended') await ctx.resume();

    if (!mixerDestRef.current) {
      const mixerDest = ctx.createMediaStreamDestination();
      mixerDestRef.current = mixerDest;

      // Silent keepalive — keeps mixerDest stream alive when all sources are silent
      const keepalive = ctx.createConstantSource();
      keepalive.offset.value = 0;
      const keepaliveGain = ctx.createGain();
      keepaliveGain.gain.value = 0;
      keepalive.connect(keepaliveGain);
      keepaliveGain.connect(mixerDest);
      keepalive.start();
      keepaliveRef.current = keepalive;

      // Monitoring: monitorGain → monitorDest → monitorAudio.setSinkId(deviceId)
      const monitorGain = ctx.createGain();
      monitorGain.gain.value = isMonitoring ? monitorVolume : 0;
      const monitorDest = ctx.createMediaStreamDestination();
      monitorGain.connect(monitorDest);
      monitorDestRef.current = monitorDest;
      const monitorAudio = new Audio();
      monitorAudio.srcObject = monitorDest.stream;
      monitorAudio.play().catch(() => {});
      monitorAudioRef.current = monitorAudio;
      if (selectedOutputDeviceId && selectedOutputDeviceId !== 'default' && typeof (monitorAudio as any).setSinkId === 'function') {
        (monitorAudio as any).setSinkId(selectedOutputDeviceId).catch(() => {});
      }
      monitorGainRef.current = monitorGain;

      // Pre-create micGain so queue/bg can connect immediately
      const micGain = ctx.createGain();
      micGain.gain.value = 0; // mic not yet open — stays silent
      micGainRef.current = micGain;
      micGain.connect(mixerDest);

      console.log('[ensureAudioMixer] Created AudioContext + mixer + monitor + micGain');
    }
    return { ctx, dest: mixerDestRef.current! };
  }, [isMonitoring, monitorVolume, selectedOutputDeviceId]);

  // Full broadcast teardown — tears down BROADCAST (WS, recorder, heartbeat, mic)
  // but KEEPS AudioContext, mixer, monitor, bg, queue ALIVE for local use.
  const stopBroadcastSession = useCallback(() => {
    if (noSleepRef.current) noSleepRef.current.disable();
    // ── Mic teardown ─────────────────────────────────────────────────────────
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    // Disconnect mic source from mixer (but keep micGain node alive for reconnect)
    try { micSourceRef.current?.disconnect(); } catch {/* ignore */}
    micSourceRef.current = null;
    // ── DSP cleanup (mic-only processing) ────────────────────────────────────
    cleanupDsp();
    setDspBypassed(false);
    setDspParams(DEFAULT_DSP_PARAMS);
    // ── Broadcast teardown (WS, recorder, heartbeat) ─────────────────────────
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    // ── State updates ────────────────────────────────────────────────────────
    analyserRef.current = null;
    dataArrayRef.current = null;
    setVolumeLevel(0);
    setHeartbeatStatus("stopped");
    setAudioBackendStatus("disconnected");
    setShoutcastStatus('idle');
    // NOTE: AudioContext, mixerDest, keepalive, monitor, bg, queue are KEPT ALIVE.
    // The user can continue to play queue items and monitor locally after disconnect.
  }, []);

  // Legacy alias used by unmount cleanup effect
  const stopMicAudio = stopBroadcastSession;

  const stopTabAudio = useCallback(() => {
    if (tabAudioStreamRef.current) {
      tabAudioStreamRef.current.getTracks().forEach(t => t.stop());
      tabAudioStreamRef.current = null;
    }
    try { tabAudioSourceRef.current?.disconnect(); } catch {/* */}
    try { tabAudioGainRef.current?.disconnect(); } catch {/* */}
    tabAudioSourceRef.current = null;
    tabAudioGainRef.current = null;
    setIsTabAudioActive(false);
    setIsGuestOnAir(false);
  }, []);

  const startTabAudio = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });

      const hasAudio = stream.getAudioTracks().length > 0;
      if (!hasAudio) {
        stream.getTracks().forEach(t => t.stop());
        setMicError(t('tabAudioHint') || "No audio track selected. Please check 'Share tab audio'.");
        return;
      }

      stream.getVideoTracks()[0]?.addEventListener('ended', stopTabAudio);
      stream.getAudioTracks()[0]?.addEventListener('ended', stopTabAudio);

      const { ctx, dest } = await ensureAudioMixer();

      const source = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      gain.gain.value = tabAudioVolume / 100;
      
      source.connect(gain);
      gain.connect(dest);
      if (monitorGainRef.current) {
        gain.connect(monitorGainRef.current);
      }

      tabAudioStreamRef.current = stream;
      tabAudioSourceRef.current = source;
      tabAudioGainRef.current = gain;
      
      setIsTabAudioActive(true);
      setIsGuestOnAir(true);
      showFadeMessage('Tab Audio Capture Started');
      // Removed ensureRecordingStarted('tabAudio') here to avoid reference errors before it is defined,
      // and it will be called safely after it's defined, or we can rely on keepalive/other triggers.
    } catch (err: any) {
      console.error('[TabAudio] Failed to start:', err);
      if (err.name !== 'NotAllowedError') {
        setMicError(err.message || 'Failed to capture tab audio');
      }
    }
  }, [ensureAudioMixer, tabAudioVolume, stopTabAudio, t]);

  useEffect(() => {
    if (tabAudioGainRef.current) {
      tabAudioGainRef.current.gain.value = isGuestOnAir ? (tabAudioVolume / 100) : 0;
    }
  }, [tabAudioVolume, isGuestOnAir]);

  // ── startSessionRecording ─────────────────────────────────────────────────
function getFlagEmoji(countryCode: string | null) {
  if (!countryCode || countryCode.length !== 2) return '';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

// ── Shared ────────────────────────────────────────────────────────────────────
  // Internal executor: creates + starts MediaRecorder on mixerDestination.stream.
  // Requires WS OPEN and mixerDest present. Does NOT handle the pending-reason
  // race — callers must check readiness before calling.
  // MUST NOT be called from Connect alone (silent keepalive = 0-byte WebM in
  // Chromium; MediaRecorder suppresses ondataavailable for zero-energy streams).
  const startSessionRecording = useCallback((reason: string) => {
    // Already recording — idempotent guard
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') return;

    const ws   = wsRef.current;
    const dest = mixerDestRef.current;

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('[Recording] startSessionRecording: WS not OPEN — cannot start (reason:', reason, ')');
      return;
    }
    if (!dest) {
      console.warn('[Recording] startSessionRecording: mixerDest not ready — cannot start (reason:', reason, ')');
      return;
    }

    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/aac',
    ];
    let selectedMime = undefined;
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) {
        selectedMime = t;
        break;
      }
    }
    console.log('[Recording] Selected MIME type:', selectedMime || 'default');
    
    const options = selectedMime ? { mimeType: selectedMime } : undefined;
    const recorder = new MediaRecorder(dest.stream, options);
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = async (e) => {
      if (e.data && e.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(e.data);
    };
    recorder.start(250);
    console.log('[Recording] Started after real source:', reason);
  }, []);

  // ── ensureRecordingStarted ────────────────────────────────────────────────
  // Public entry point called by every real audio source: mic, background, queue.
  // Recording MUST NOT start from silent keepalive alone — only real sources
  // call this. Handles the WS-not-yet-open race via pendingRecordingReasonRef.
  const ensureRecordingStarted = useCallback((reason: 'mic' | 'background' | 'queue') => {
    // Already recording — no-op (idempotent)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') return;

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      // WS still CONNECTING — store intent; ws.onopen will drain it
      pendingRecordingReasonRef.current = reason;
      console.log('[Recording] Pending start until WebSocket opens:', reason);
      return;
    }

    // WS is OPEN — start immediately
    startSessionRecording(reason);
  }, [startSessionRecording]);

  // Keep onExitStudioRef in sync with the prop (prop can change on re-render)
  useEffect(() => { onExitStudioRef.current = onExitStudio; }, [onExitStudio]);

  // ── Wake Lock Management ───────────────────────────────────────────────────
  const wakeLockRef = useRef<any>(null);
  useEffect(() => {
    if (!noSleepRef.current) {
      noSleepRef.current = new NoSleep();
    }
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && isConnected) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
          console.log('[WakeLock] Screen wake lock acquired');
          wakeLockRef.current.addEventListener('release', () => {
            console.log('[WakeLock] Screen wake lock released');
          });
        } catch (err: any) {
          console.warn('[WakeLock] Failed to acquire screen wake lock:', err.message);
        }
      }
    };
    if (isConnected) {
      requestWakeLock();
    } else {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    }
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [isConnected]);

  // Clean up audio on unmount
  // Full cleanup on unmount (leaving studio page) — destroy EVERYTHING including AudioContext
  useEffect(() => () => {
    stopMicAudio(); // broadcast teardown
    // Also destroy audio infrastructure on unmount
    if (monitorGainRef.current) { monitorGainRef.current.gain.value = 0; }
    try { monitorGainRef.current?.disconnect(); } catch {/* */}
    if (monitorAudioRef.current) { monitorAudioRef.current.pause(); monitorAudioRef.current.srcObject = null; }
    try { monitorDestRef.current?.disconnect(); } catch {/* */}
    try { keepaliveRef.current?.stop(); } catch {/* */}
    try { keepaliveRef.current?.disconnect(); } catch {/* */}
    try { bgGainRef.current?.disconnect(); } catch {/* */}
    try { bgSourceRef.current?.disconnect(); } catch {/* */}
    try { queueGainRef.current?.disconnect(); } catch {/* */}
    try { queueSourceRef.current?.disconnect(); } catch {/* */}
    try { sfxGainRef.current?.disconnect(); } catch {/* */}
    activeSfxRef.current.forEach(s => { try { s.stop(); } catch {/* */} });
    
    try { tabAudioGainRef.current?.disconnect(); } catch {/* */}
    try { tabAudioSourceRef.current?.disconnect(); } catch {/* */}
    if (tabAudioStreamRef.current) {
      tabAudioStreamRef.current.getTracks().forEach(t => t.stop());
      tabAudioStreamRef.current = null;
    }

    if (audioCtxRef.current) { audioCtxRef.current.close(); }
  }, [stopMicAudio]);


  // Keep stable refs in sync with bg state (so ws.onopen closure reads current values)
  useEffect(() => { activeBgTrackIdRef.current  = activeBgTrackId;  }, [activeBgTrackId]);
  useEffect(() => { activeBgLocalUrlRef.current = activeBgLocalUrl; }, [activeBgLocalUrl]);
  useEffect(() => { bgVolumeRef.current         = bgVolume;         }, [bgVolume]);

  // ── Session-end watchdog ───────────────────────────────────────────────────
  // Polls every 10 seconds while connected. When sessionEndMs is set:
  //   • ≤ 60s remaining → shows Arabic warning banner
  //   • now ≥ sessionEndMs → auto-disconnects cleanly
  // If sessionEndMs is not provided, does nothing (preserves old behavior).
  useEffect(() => {
    if (!sessionEndMs) return; // no end time — skip entirely

    const check = async () => {
      if (!isConnected) return; // only enforce while live
      const remaining = sessionEndMs - Date.now();

      if (remaining <= 0) {
        // Time's up — run the same clean disconnect path as manual Disconnect
        console.log('[Watchdog] Session end reached — auto-disconnecting');
        if (isMicOpen) setIsMicOpen(false);
        stopBroadcastSession();
        try { await fetch('/api/studio/disconnect', { method: 'POST' }); } catch { /* best-effort */ }
        setIsConnected(false);
        setShoutcastStatus('idle');
        setAutoDisconnectMsg('انتهى وقت البث وتم قطع الاتصال تلقائيًا');
        // After 3 seconds: call onExitStudio to return to pre-flight instantly
        // (same path as the Exit Studio button). Fallback: router.push('/studio').
        setTimeout(() => {
          if (onExitStudioRef.current) {
            console.log('[Watchdog] Calling onExitStudio to return to pre-flight');
            onExitStudioRef.current();
          } else {
            console.log('[Watchdog] No onExitStudio — navigating via router.push(\'/studio\')');
            router.push('/studio');
          }
        }, 3000);

      } else if (remaining <= 60_000) {
        setAutoDisconnectMsg('سينتهي وقت البث خلال أقل من دقيقة ⚠️');
      } else {
        setAutoDisconnectMsg(null); // clear if time was extended somehow
      }
    };

    const interval = setInterval(check, 10_000);
    check(); // run immediately on mount / isConnected change
    return () => clearInterval(interval);
  // stopBroadcastSession is stable (useCallback); isMicOpen needed for mic teardown
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionEndMs, isConnected]);

  // Group 4.4 — revoke all local object URLs on unmount to prevent memory leaks
  useEffect(() => {
    const urls = localObjectUrlsRef.current;
    return () => { urls.forEach(u => URL.revokeObjectURL(u)); };
  }, []);

  // Background audio — plays when activeBgTrackId (DB) or activeBgLocalUrl (device) changes.
  // Audio routes to mixerDestination — never to local speakers unless monitoring is ON.
  useEffect(() => {
    const bgSrcUrl = activeBgLocalUrl ?? (activeBgTrackId ? `/api/tracks/${activeBgTrackId}` : null);
    if (!bgSrcUrl) {
      stopBackgroundAudio();
      return;
    }
    stopBackgroundAudio();

    // Use async IIFE to call ensureAudioMixer (lazy-inits AudioContext if not connected yet)
    (async () => {
      const { ctx, dest } = await ensureAudioMixer();
      console.log('[DIAG][bg-effect] src:', bgSrcUrl, '| ctx:', !!ctx, '| dest:', !!dest);

      const audio = new Audio(bgSrcUrl);
      audio.loop = true;
      bgAudioRef.current = audio;
      let bgSrcNode: MediaElementAudioSourceNode;
      try {
        bgSrcNode = ctx.createMediaElementSource(audio);
      } catch (e) {
        console.error('[DIAG][bg-effect] createMediaElementSource FAILED:', e);
        return;
      }
      const gain = ctx.createGain();
      const queueActive = currentlyPlayingRef.current !== null;
      const micIsLive = micGainRef.current !== null && micGainRef.current.gain.value > 0;
      gain.gain.value = queueActive ? 0 : micIsLive ? (bgVolumeRef.current / 100) * BG_DUCK_RATIO : bgVolume / 100;
      bgSrcNode.connect(gain);
      gain.connect(dest);
      if (monitorGainRef.current) gain.connect(monitorGainRef.current);
      bgSourceRef.current = bgSrcNode;
      bgGainRef.current   = gain;

      // Only start playback if no queue item is playing.
      // When queue is active, bg stays paused — it will start when:
      //   • mic opens (applyBgGain restores bg under voice)
      //   • queue finishes (onended restores bg)
      if (!queueActive) {
        audio.play()
          .then(() => {
            console.log('[DIAG][bg-effect] play OK — bg in mixer');
            ensureRecordingStarted('background');
          })
          .catch(err => console.error('[DIAG][bg-effect] play REJECTED:', err));
      } else {
        console.log('[DIAG][bg-effect] queue active — bg wired but NOT started (waiting for mic or queue end)');
      }
    })();

    return () => {
      if (bgAudioRef.current) { bgAudioRef.current.pause(); bgAudioRef.current.currentTime = 0; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBgTrackId, activeBgLocalUrl]);

  // ── applyBgGain ────────────────────────────────────────────────────────────
  // Single source of truth for background gain.
  //   volumeOverride: pass the freshly-parsed fader value to avoid stale-ref timing.
  //   queue playing  → gain = 0
  //   mic open       → gain = vol × 0.10
  //   otherwise      → gain = vol
  // NEVER touches micGainRef, queueGainRef, or monitorGainRef.
  const applyBgGain = useCallback((reason: string, volumeOverride?: number) => {
    const vol = (volumeOverride !== undefined ? volumeOverride : bgVolumeRef.current) / 100;
    const queueActive = currentlyPlayingRef.current !== null;
    const target = queueActive
      ? 0
      : isVoiceLive
        ? vol * BG_DUCK_RATIO
        : vol;
    if (bgGainRef.current) {
      bgGainRef.current.gain.value = target;
    } else if (bgAudioRef.current && !queueActive) {
      // Fallback for pre-connect playback (no AudioContext yet)
      bgAudioRef.current.volume = isVoiceLive ? vol * BG_DUCK_RATIO : vol;
    }
    console.log(`[BgGain] reason=${reason} override=${volumeOverride?.toFixed(2)??'ref'} queueActive=${queueActive} micOpen=${isVoiceLive} vol=${vol.toFixed(2)} → gain=${target.toFixed(2)}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVoiceLive]); // bgVolumeRef is a ref — always current without being a dep

  // Background fader effect — safety net in case direct onChange call is missed
  useEffect(() => {
    applyBgGain('bgVolume-effect');
  }, [bgVolume, applyBgGain]);

  // Background ducking — mic open/close applies same formula
  useEffect(() => {
    applyBgGain('mic-toggle');
  // applyBgGain is stable on isVoiceLive changes; bgVolumeRef always current
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVoiceLive]);

  // ── fadeGain ────────────────────────────────────────────────────────────────
  // Smooth linear ramp on any Web Audio GainNode.
  //   gainNode   : the GainNode to ramp
  //   target     : destination gain value
  //   durationSec: ramp length in seconds
  //   reason     : label for console log
  // Uses cancelScheduledValues + setValueAtTime to cancel any running ramp first.
  const fadeGain = useCallback((
    gainNode: GainNode,
    target: number,
    durationSec: number,
    reason: string
  ) => {
    const ctx = audioCtxRef.current;
    if (!ctx) { gainNode.gain.value = target; return; }
    const now    = ctx.currentTime;
    const param  = gainNode.gain;
    const fromVal = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(fromVal, now);
    param.linearRampToValueAtTime(target, now + durationSec);
    console.log(`[Crossfade] ${reason} | ${fromVal.toFixed(3)} → ${target.toFixed(3)} over ${durationSec}s`);
  }, []);


  // Group 4.4 — add local files from file picker
  const handleLocalFilePick = useCallback((tab: MediaTab, files: FileList | null) => {
    if (!files) return;
    const newFiles: LocalFile[] = [];
    Array.from(files).forEach(file => {
      if (!file.type.startsWith("audio/")) return; // validate MIME
      const objectUrl = URL.createObjectURL(file);
      localObjectUrlsRef.current.add(objectUrl);
      newFiles.push({
        id:        crypto.randomUUID(),
        name:      file.name,
        mimeType:  file.type,
        objectUrl,
      });
    });
    if (newFiles.length === 0) return;
    setLocalFiles(prev => ({ ...prev, [tab]: [...prev[tab], ...newFiles] }));
  }, []);

  // Group 4.4 — remove a single local file and revoke its object URL
  const handleRemoveLocalFile = useCallback((tab: MediaTab, fileId: string) => {
    setLocalFiles(prev => {
      const removed = prev[tab].find(f => f.id === fileId);
      if (removed) {
        URL.revokeObjectURL(removed.objectUrl);
        localObjectUrlsRef.current.delete(removed.objectUrl);
      }
      return { ...prev, [tab]: prev[tab].filter(f => f.id !== fileId) };
    });
  }, []);

  // Group 4.8 — clear-all with queue cleanup: removes all local files for a tab,
  // removes their queue entries from mediaQueue, and revokes their object URLs.
  const handleClearLocalFiles = useCallback((tab: MediaTab) => {
    setLocalFiles(prev => {
      const toRemove = prev[tab];
      // Revoke all object URLs for this tab
      toRemove.forEach(f => {
        URL.revokeObjectURL(f.objectUrl);
        localObjectUrlsRef.current.delete(f.objectUrl);
      });
      return { ...prev, [tab]: [] };
    });
    // Also clear all queue entries whose objectUrl belongs to this tab's local files
    setMediaQueue(prev =>
      prev.filter(q => q.sourceType !== "LOCAL_SESSION" || !(
        (tab === "songs"  && q.mediaType === "SONG")  ||
        (tab === "breaks" && q.mediaType === "BREAK") ||
        (tab === "ads"    && q.mediaType === "AD")
      ))
    );
  }, []);

  // Group 4.6 — Add item to the media queue, respecting Audio Policy
  const enqueueItem = useCallback((
    trackId:    string,
    title:      string,
    mediaType:  MediaType,
    sourceType: SourceType,
    ownerType?: "ADMIN" | "PRESENTER",
    objectUrl?: string,   // LOCAL_SESSION blob URL
    fileUrl?:   string,   // ADMIN_DB / PRESENTER_DB resolved audio URL
  ) => {
    // Background tracks use activeBgTrackId, not the queue
    if (mediaType === "BACKGROUND") return;
    const policy = MEDIA_POLICY[mediaType];
    const status: QueueStatus = isVoiceLive
      ? (policy.canSelectWhileMicOpen ? "READY_AFTER_MIC_CLOSE" : "BLOCKED_WHILE_MIC_OPEN")
      : "READY";
    if (status === "BLOCKED_WHILE_MIC_OPEN") return;
    setMediaQueue(prev => {
      // Duplicate guard removed (Queue V2): same track may be added multiple times.
      // Each entry gets a unique queue id via crypto.randomUUID().
      const item: QueueItem = { id: crypto.randomUUID(), trackId, title, mediaType, sourceType, status, ownerType, objectUrl, fileUrl };
      return [...prev, item];
    });
  }, [isVoiceLive]);

  // Group 4.6 — Remove single item from queue
  const removeQueueItem = useCallback((queueId: string) => {
    setMediaQueue(prev => prev.filter(q => q.id !== queueId));
  }, []);

  // Group 4.6 — Clear entire queue
  const clearQueue = useCallback(() => { setMediaQueue([]); }, []);

  // Fetch initial messaging state
  useEffect(() => {
    const fetchMessagingState = async () => {
      const currentStationId = scheduledStationId;
      if (!currentStationId) return;
      try {
        const res = await fetch(`/api/studio/station/${currentStationId}`);
        if (res.ok) {
          const data = await res.json();
          setIsMessagingEnabled(data.isMessagingEnabled ?? true);
        }
      } catch (e) {
        console.error("Failed to fetch messaging state", e);
      }
    };
    fetchMessagingState();
  }, [scheduledStationId]);


  // Group 4.6 — Move item up or down in queue (Queue V2 reorder)
  const moveQueueItem = useCallback((queueId: string, direction: "up" | "down") => {
    setMediaQueue(prev => {
      const idx = prev.findIndex(q => q.id === queueId);
      if (idx === -1) return prev;
      if (direction === "up"   && idx === 0)              return prev;
      if (direction === "down" && idx === prev.length - 1) return prev;
      const next = [...prev];
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, idx: number) => {
    setDraggedQueueIndex(idx);
    e.dataTransfer.effectAllowed = 'move';
    // Firefox requires some data to be set to enable dragging
    e.dataTransfer.setData('text/plain', idx.toString());
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragOverQueueIndex !== idx) setDragOverQueueIndex(idx);
  }, [dragOverQueueIndex]);

  const handleDragLeave = useCallback(() => {
    setDragOverQueueIndex(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    if (draggedQueueIndex === null || draggedQueueIndex === dropIdx) {
      setDraggedQueueIndex(null);
      setDragOverQueueIndex(null);
      return;
    }
    setMediaQueue(prev => {
      const next = [...prev];
      const [moved] = next.splice(draggedQueueIndex, 1);
      next.splice(dropIdx, 0, moved);
      return next;
    });
    setDraggedQueueIndex(null);
    setDragOverQueueIndex(null);
  }, [draggedQueueIndex]);

  // Mobile Touch Drag & Drop Logic
  const [touchStartY, setTouchStartY] = useState<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent, idx: number) => {
    setDraggedQueueIndex(idx);
    setDragOverQueueIndex(idx);
    setTouchStartY(e.touches[0].clientY);
    document.body.style.overflow = 'hidden';
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (draggedQueueIndex === null || touchStartY === null) return;
    
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - touchStartY;
    // Assuming each queue item is ~70px on mobile
    const steps = Math.round(deltaY / 70);
    
    let newDragOverIndex = draggedQueueIndex + steps;
    newDragOverIndex = Math.max(0, Math.min(newDragOverIndex, mediaQueue.length - 1));
    
    if (newDragOverIndex !== dragOverQueueIndex) {
      setDragOverQueueIndex(newDragOverIndex);
    }
  }, [draggedQueueIndex, touchStartY, dragOverQueueIndex, mediaQueue.length]);

  const handleTouchEnd = useCallback(() => {
    document.body.style.overflow = '';
    
    if (draggedQueueIndex !== null && dragOverQueueIndex !== null && draggedQueueIndex !== dragOverQueueIndex) {
      setMediaQueue(prev => {
        const next = [...prev];
        const [moved] = next.splice(draggedQueueIndex, 1);
        next.splice(dragOverQueueIndex, 0, moved);
        return next;
      });
    }
    setDraggedQueueIndex(null);
    setDragOverQueueIndex(null);
    setTouchStartY(null);
  }, [draggedQueueIndex, dragOverQueueIndex]);

  // Group 4.6 / 4.10 — Mic-priority queue management
  //
  // Mic OPENS:
  //   • If a queue item (SONG/BREAK/AD) is currently playing, pause it
  //     immediately and store it in pausedForMicRef.
  //   • Background music is unaffected (ducking handled by its own effect).
  //
  // Mic CLOSES:
  //   1. Promote READY_AFTER_MIC_CLOSE → READY.
  //   2. If a queue item was paused for mic, resume it.
  //   3. Otherwise auto-start the first READY item if nothing is playing.
  useEffect(() => {
    if (isVoiceLive) {
      // ── MIC OPENED: pause any playing queue audio immediately ──────────────
      if (currentlyPlayingRef.current) {
        const pausedAudio = currentlyPlayingRef.current;
        // Ramp queue gain to 0 first (instant silence in broadcast)
        if (queueGainRef.current) {
          queueGainRef.current.gain.value = 0;
        }
        pausedAudio.pause();
        currentlyPlayingRef.current = null; // clear BEFORE applyBgGain so it doesn't see queue as active
        // Find which queue item this audio belongs to
        const currentId = playingQueueId;
        const pausedItem = currentId
          ? mediaQueueRef.current.find(q => q.id === currentId) ?? null
          : null;
        pausedForMicRef.current = pausedItem;
        // Store audio element for resume on mic-close (currentlyPlayingRef is now null)
        pausedQueueAudioRef.current = pausedAudio;
        if (pausedItem) pausedQueueItemRef.current = pausedItem;
        console.log('[DIAG][mic-priority] Queue paused for mic open. Item:', pausedItem?.title ?? 'unknown');
        // Restore background under mic (ducked proportionally to fader) — queue is now paused
        applyBgGain('mic-open-queue-paused');
        // Start bg audio if it was wired but not playing (deferred while queue was active)
        if (bgAudioRef.current && bgAudioRef.current.paused && bgGainRef.current) {
          bgAudioRef.current.play().catch(() => {});
        }
        // Do NOT call stopQueuePlayback() — we want to resume later
        setPlayingQueueId(null);

      } else {
        pausedForMicRef.current = null;
        // No queue was playing — background ducking handled by dedicated effect
      }
    } else {
      // ── MIC CLOSED: promote + resume ────────────────────────────────
      // Build promoted snapshot
      const promoted = mediaQueueRef.current.map(q =>
        q.status === "READY_AFTER_MIC_CLOSE" ? { ...q, status: "READY" as QueueStatus } : q
      );
      setMediaQueue(promoted);

      const paused = pausedForMicRef.current;
      pausedForMicRef.current = null;

      if (paused) {
        // Resume the item that was paused when mic opened.
        // pausedQueueAudioRef and pausedQueueItemRef were already set on mic-open,
        // so playQueueItem will take the RESUME path (continues from current position).
        console.log('[DIAG][mic-priority] Resuming paused item after mic close:', paused.title);
        setTimeout(() => playQueueItem(paused), 80);
      } else if (!currentlyPlayingRef.current) {
        // Auto-start: nothing was paused and nothing is playing.
        // Restore background to full volume since no queue item will mute it.
        applyBgGain('mic-closed-no-queue');
        // Only auto-start when Auto Queue is ON

        if (autoQueueRef.current) {
          const firstReady = promoted.find(q => q.status === "READY");
          if (firstReady) {
            setTimeout(() => playQueueItem(firstReady), 80);
          }
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVoiceLive]);

  // Group 4.9 — Keep mediaQueueRef in sync with mediaQueue state
  useEffect(() => {
    mediaQueueRef.current = mediaQueue;
  }, [mediaQueue]);

  // Keep autoQueueRef in sync with autoQueue state (avoids stale closure in onended)
  useEffect(() => {
    autoQueueRef.current = autoQueue;
  }, [autoQueue]);

  // Group 4.8 — Resolve audio src for a queue item
  const getQueueItemAudioSrc = useCallback((item: QueueItem): string => {
    if (item.sourceType === "LOCAL_SESSION" && item.objectUrl) return item.objectUrl;
    return `/api/tracks/${item.trackId}`;
  }, []);

  // Group 4.8/4.9 — Play a queue item (stops any current playback first)
  const playQueueItem = useCallback(async (item: QueueItem) => {
    // Cancel any existing RAF loop first
    if (playbackRafRef.current) { cancelAnimationFrame(playbackRafRef.current); playbackRafRef.current = null; }

    // ── Resume from manual pause if same item ──────────────────────────────────
    if (
      pausedQueueItemRef.current?.id === item.id &&
      pausedQueueAudioRef.current
    ) {
      const audio = pausedQueueAudioRef.current;
      pausedQueueAudioRef.current = null;
      pausedQueueItemRef.current  = null;
      currentlyPlayingRef.current = audio;
      setPlayingQueueId(item.id);
      setIsPaused(false);

      // ── Crossfade: fade bg out + queue in over 3 seconds ──────────────
      // Set queue gain to 0 first, then fade up after play starts
      if (queueGainRef.current) {
        queueGainRef.current.gain.value = 0;
      }
      // Fade background out over 3 seconds
      if (bgGainRef.current) {
        fadeGain(bgGainRef.current, 0, 3, 'bg→queue-resume crossfade-out');
        // Pause bg audio after crossfade completes (truly stop, not just mute)
        setTimeout(() => {
          if (bgAudioRef.current && currentlyPlayingRef.current) {
            bgAudioRef.current.pause();
          }
        }, 3200);
      }

      audio.play()
        .then(() => {
          console.log('[DIAG][queue] resume play: RESOLVED');
          // Fade queue in over 3 seconds
          if (queueGainRef.current) {
            fadeGain(queueGainRef.current, queueVolume / 100, 3, 'queue-resume crossfade-in');
          }
          // Re-start RAF loop
          const tick = () => {
            if (!currentlyPlayingRef.current) return;
            setPlaybackProgress({ id: item.id, currentTime: currentlyPlayingRef.current.currentTime, duration: currentlyPlayingRef.current.duration || 0 });
            playbackRafRef.current = requestAnimationFrame(tick);
          };
          playbackRafRef.current = requestAnimationFrame(tick);
        })
        .catch(err => console.error('[DIAG][queue] resume play REJECTED:', err));
      return;
    }

    // ── New item: stop any current audio ──────────────────────────────────────
    if (currentlyPlayingRef.current) {
      currentlyPlayingRef.current.pause();
      currentlyPlayingRef.current.currentTime = 0;
      currentlyPlayingRef.current = null;
    }
    // Clear any stale manual-pause state from a different item
    pausedQueueAudioRef.current = null;
    pausedQueueItemRef.current  = null;
    setIsPaused(false);
    setPlaybackProgress(null);
    // ── Background handoff: fade background out when SONG/BREAK/AD starts ────
    // Set currentlyPlayingRef early so applyBgGain sees queueActive=true.
    const src = getQueueItemAudioSrc(item);
    console.log('[DIAG][queue] Playing item:', item.title, '| mediaType:', item.mediaType, '| sourceType:', item.sourceType);
    console.log('[DIAG][queue] src used:', src);
    const audio = new Audio(src);
    currentlyPlayingRef.current = audio; // set BEFORE gain work so queue is detected
    setPlayingQueueId(item.id);
    // Fade background to 0 over 3 seconds (smooth crossfade)
    if (bgGainRef.current) {
      fadeGain(bgGainRef.current, 0, 3, 'bg→queue crossfade-out');
    } else if (bgAudioRef.current) {
      bgAudioRef.current.volume = 0; // fallback: instant silence
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Ensure AudioContext + mixer exist (lazy-init if not connected yet)
    const { ctx, dest } = await ensureAudioMixer();
    console.log('[DIAG][queue] ctx exists:', !!ctx, '| dest exists:', !!dest, '| branch: MIXER');
    {
      let qSrc: MediaElementAudioSourceNode;
      try {
        qSrc = ctx.createMediaElementSource(audio);
        console.log('[DIAG][queue] createMediaElementSource: OK');
      } catch (e) {
        console.error('[DIAG][queue] createMediaElementSource FAILED — not playing locally (no local fallback):', e);
        currentlyPlayingRef.current = null;
        setPlayingQueueId(null);
        return;
      }
      const qGain = ctx.createGain();
      // Start queue gain at 0 then fade up over 3 seconds (crossfade in)
      qGain.gain.value = 0;
      qSrc.connect(qGain);
      qGain.connect(dest);              // → SHOUTcast broadcast (or just mixer when not connected)
      // → Also feed monitoring output if available
      if (monitorGainRef.current) {
        qGain.connect(monitorGainRef.current);
        console.log('[DIAG][queue] qGain.connect(monitorGainRef): OK');
      }
      queueSourceRef.current = qSrc;
      queueGainRef.current   = qGain;
      // Crossfade queue in after audio starts (inside .then())
    }
    // ── onended: safety-net for hard cut (crossfade didn't fire) ─────────────
    audio.onended = () => {
      if (playbackRafRef.current) { cancelAnimationFrame(playbackRafRef.current); playbackRafRef.current = null; }
      if (crossfadeTimerRef.current) { clearInterval(crossfadeTimerRef.current); crossfadeTimerRef.current = null; }
      // If crossfade already handled the transition, skip
      if (inCrossfadeRef.current) return;
      // Auto-advance with hard cut (short tracks or autoQueue already handled)
      if (autoQueueRef.current) {
        const queue = mediaQueueRef.current;
        const currentIdx = queue.findIndex(q => q.id === item.id);
        if (currentIdx !== -1) {
          const nextItem = queue.slice(currentIdx + 1).find(q => q.status === "READY");
          if (nextItem) {
            console.log('[Crossfade] queue→queue — hard-cut auto-advance (short track or no crossfade)');
            try { queueGainRef.current?.disconnect(); } catch {/* ignore */}
            try { queueSourceRef.current?.disconnect(); } catch {/* ignore */}
            queueGainRef.current   = null;
            queueSourceRef.current = null;
            currentlyPlayingRef.current = null;
            setPlayingQueueId(null);
            setPlaybackProgress(null);
            setIsPaused(false);
            setTimeout(() => playQueueItem(nextItem), 50);
            return;
          }
        }
      }
      // No next item — disconnect and restore background
      try { queueGainRef.current?.disconnect(); } catch {/* ignore */}
      try { queueSourceRef.current?.disconnect(); } catch {/* ignore */}
      queueGainRef.current   = null;
      queueSourceRef.current = null;
      currentlyPlayingRef.current = null;
      setPlayingQueueId(null);
      setPlaybackProgress(null);
      setIsPaused(false);
      if (bgGainRef.current) {
        const isMicLive = micGainRef.current !== null && micGainRef.current.gain.value > 0;
        const targetVol = isMicLive ? (bgVolumeRef.current / 100) * BG_DUCK_RATIO : bgVolumeRef.current / 100;
        fadeGain(bgGainRef.current, targetVol, 2, 'queue→bg fade-in');
        // Start bg audio if it was deferred (wired but paused while queue was active)
        if (bgAudioRef.current && bgAudioRef.current.paused) {
          bgAudioRef.current.play().catch(() => {});
        }
      } else {
        applyBgGain('queue-ended-no-next');
      }
    };
    audio.onerror = () => {
      console.error(`[playback] Failed to load audio for queue item ${item.id}`);
      if (crossfadeTimerRef.current) { clearInterval(crossfadeTimerRef.current); crossfadeTimerRef.current = null; }
      try { queueGainRef.current?.disconnect(); } catch {/* ignore */}
      try { queueSourceRef.current?.disconnect(); } catch {/* ignore */}
      queueGainRef.current   = null;
      queueSourceRef.current = null;
      currentlyPlayingRef.current = null;
      setPlayingQueueId(null);
    };
    audio.play()
        .then(() => {
        console.log('[DIAG][queue] audio.play(): RESOLVED — starting crossfade in');
        ensureRecordingStarted('queue');
        // Fade queue gain up over 3 seconds now that audio is actually playing
        if (queueGainRef.current) {
          fadeGain(queueGainRef.current, queueVolume / 100, 3, 'queue fade-in');
        }
        // Start RAF loop for progress tracking
        const tick = () => {
          if (!currentlyPlayingRef.current) return;
          setPlaybackProgress({ id: item.id, currentTime: currentlyPlayingRef.current.currentTime, duration: currentlyPlayingRef.current.duration || 0 });
          playbackRafRef.current = requestAnimationFrame(tick);
        };
        playbackRafRef.current = requestAnimationFrame(tick);

        // ── Queue-to-Queue Crossfade polling ────────────────────────────────────
        // Every QUEUE_CROSSFADE_CHECK_MS, check if track is within QUEUE_CROSSFADE_SEC of ending.
        // If so, find next READY item and start a smooth overlapping crossfade.
        if (crossfadeTimerRef.current) { clearInterval(crossfadeTimerRef.current); }
        crossfadeTimerRef.current = setInterval(() => {
          const a = currentlyPlayingRef.current;
          if (!a || !a.duration || a.paused || inCrossfadeRef.current) return;
          const remaining = a.duration - a.currentTime;
          // Only crossfade tracks longer than 2× crossfade duration (avoid crossfading very short clips)
          if (remaining <= QUEUE_CROSSFADE_SEC && a.duration > QUEUE_CROSSFADE_SEC * 2 && autoQueueRef.current) {
            const queue = mediaQueueRef.current;
            const currentIdx = queue.findIndex(q => q.id === item.id);
            if (currentIdx === -1) return;
            const nextItem = queue.slice(currentIdx + 1).find(q => q.status === "READY");
            if (nextItem) {
              clearInterval(crossfadeTimerRef.current!);
              crossfadeTimerRef.current = null;
              // ── START CROSSFADE ──────────────────────────────────────────────────
              inCrossfadeRef.current = true;
              console.log(`[Crossfade] Starting ${QUEUE_CROSSFADE_SEC}s overlap: "${item.title}" → "${nextItem.title}"`);

              // 1. Fade out current (track A)
              if (queueGainRef.current) {
                fadeGain(queueGainRef.current, 0, QUEUE_CROSSFADE_SEC, 'crossfade: A fade-out');
              }

              // 2. Store outgoing player refs so we can clean up after fade
              outgoingPlayerRef.current = {
                audio: a,
                source: queueSourceRef.current!,
                gain: queueGainRef.current!,
              };

              // 3. Create incoming player (track B)
              const nextSrc = getQueueItemAudioSrc(nextItem);
              const nextAudio = new Audio(nextSrc);
              const ctxB = audioCtxRef.current!;
              const destB = mixerDestRef.current!;
              let nextSource: MediaElementAudioSourceNode;
              try {
                nextSource = ctxB.createMediaElementSource(nextAudio);
              } catch (e) {
                console.error('[Crossfade] createMediaElementSource for B FAILED:', e);
                inCrossfadeRef.current = false;
                return;
              }
              const nextGain = ctxB.createGain();
              nextGain.gain.value = 0; // start silent
              nextSource.connect(nextGain);
              nextGain.connect(destB);
              if (monitorGainRef.current) nextGain.connect(monitorGainRef.current);

              // 4. Swap refs to the new player
              queueSourceRef.current = nextSource;
              queueGainRef.current   = nextGain;
              currentlyPlayingRef.current = nextAudio;
              setPlayingQueueId(nextItem.id);
              setIsPaused(false);

              // 5. Play B and fade in
              nextAudio.play()
                .then(() => {
                  console.log('[Crossfade] Track B playing — fading in');
                  fadeGain(nextGain, queueVolume / 100, QUEUE_CROSSFADE_SEC, 'crossfade: B fade-in');
                  // Restart RAF for new track
                  if (playbackRafRef.current) cancelAnimationFrame(playbackRafRef.current);
                  const tickB = () => {
                    if (!currentlyPlayingRef.current) return;
                    setPlaybackProgress({ id: nextItem.id, currentTime: currentlyPlayingRef.current.currentTime, duration: currentlyPlayingRef.current.duration || 0 });
                    playbackRafRef.current = requestAnimationFrame(tickB);
                  };
                  playbackRafRef.current = requestAnimationFrame(tickB);
                })
                .catch(err => {
                  console.error('[Crossfade] Track B play REJECTED:', err);
                  inCrossfadeRef.current = false;
                });

              // 6. Set onended for track B (recursive — enables chain crossfading)
              nextAudio.onended = audio.onended; // reuse same handler pattern
              // Override with fresh item reference for the next onended
              nextAudio.onended = () => {
                if (playbackRafRef.current) { cancelAnimationFrame(playbackRafRef.current); playbackRafRef.current = null; }
                if (crossfadeTimerRef.current) { clearInterval(crossfadeTimerRef.current); crossfadeTimerRef.current = null; }
                if (inCrossfadeRef.current) return;
                // Same logic as original onended but for nextItem
                if (autoQueueRef.current) {
                  const q = mediaQueueRef.current;
                  const idx = q.findIndex(qi => qi.id === nextItem.id);
                  if (idx !== -1) {
                    const after = q.slice(idx + 1).find(qi => qi.status === "READY");
                    if (after) {
                      try { queueGainRef.current?.disconnect(); } catch {/* ignore */}
                      try { queueSourceRef.current?.disconnect(); } catch {/* ignore */}
                      queueGainRef.current = null; queueSourceRef.current = null;
                      currentlyPlayingRef.current = null;
                      setPlayingQueueId(null); setPlaybackProgress(null); setIsPaused(false);
                      setTimeout(() => playQueueItem(after), 50);
                      return;
                    }
                  }
                }
                try { queueGainRef.current?.disconnect(); } catch {/* ignore */}
                try { queueSourceRef.current?.disconnect(); } catch {/* ignore */}
                queueGainRef.current = null; queueSourceRef.current = null;
                currentlyPlayingRef.current = null;
                setPlayingQueueId(null); setPlaybackProgress(null); setIsPaused(false);
                if (bgGainRef.current) {
                  const isMicLive = micGainRef.current !== null && micGainRef.current.gain.value > 0;
                  const tv = isMicLive ? (bgVolumeRef.current / 100) * BG_DUCK_RATIO : bgVolumeRef.current / 100;
                  fadeGain(bgGainRef.current, tv, 2, 'queue→bg fade-in (after crossfade chain)');
                } else { applyBgGain('queue-ended-crossfade-chain'); }
              };

              // 7. Clean up outgoing player after fade duration
              setTimeout(() => {
                if (outgoingPlayerRef.current) {
                  try { outgoingPlayerRef.current.audio.pause(); } catch {/* ignore */}
                  try { outgoingPlayerRef.current.gain.disconnect(); } catch {/* ignore */}
                  try { outgoingPlayerRef.current.source.disconnect(); } catch {/* ignore */}
                  outgoingPlayerRef.current = null;
                  console.log('[Crossfade] Outgoing player cleaned up');
                }
                inCrossfadeRef.current = false;

                // Re-start crossfade polling for the new track
                if (crossfadeTimerRef.current) clearInterval(crossfadeTimerRef.current);
                crossfadeTimerRef.current = setInterval(() => {
                  const b = currentlyPlayingRef.current;
                  if (!b || !b.duration || b.paused || inCrossfadeRef.current) return;
                  const rem = b.duration - b.currentTime;
                  if (rem <= QUEUE_CROSSFADE_SEC && b.duration > QUEUE_CROSSFADE_SEC * 2 && autoQueueRef.current) {
                    const q2 = mediaQueueRef.current;
                    const idx2 = q2.findIndex(qi => qi.id === nextItem.id);
                    if (idx2 === -1) return;
                    const after2 = q2.slice(idx2 + 1).find(qi => qi.status === "READY");
                    if (after2) {
                      clearInterval(crossfadeTimerRef.current!);
                      crossfadeTimerRef.current = null;
                      // Trigger playQueueItem which will itself set up crossfade polling
                      // But first, we need to stop the current playback cleanly
                      inCrossfadeRef.current = true;
                      console.log(`[Crossfade] Chain: starting overlap for "${nextItem.title}" → "${after2.title}"`);
                      if (queueGainRef.current) fadeGain(queueGainRef.current, 0, QUEUE_CROSSFADE_SEC, 'crossfade-chain: fade-out');
                      outgoingPlayerRef.current = { audio: currentlyPlayingRef.current!, source: queueSourceRef.current!, gain: queueGainRef.current! };
                      currentlyPlayingRef.current = null; queueSourceRef.current = null; queueGainRef.current = null;
                      setPlayingQueueId(null); setPlaybackProgress(null); setIsPaused(false);
                      setTimeout(() => { playQueueItem(after2); }, 50);
                      setTimeout(() => {
                        if (outgoingPlayerRef.current) {
                          try { outgoingPlayerRef.current.audio.pause(); } catch {/* */}
                          try { outgoingPlayerRef.current.gain.disconnect(); } catch {/* */}
                          try { outgoingPlayerRef.current.source.disconnect(); } catch {/* */}
                          outgoingPlayerRef.current = null;
                        }
                        inCrossfadeRef.current = false;
                      }, QUEUE_CROSSFADE_SEC * 1000 + 100);
                    }
                  }
                }, QUEUE_CROSSFADE_CHECK_MS);
              }, QUEUE_CROSSFADE_SEC * 1000 + 100);
            }
          }
        }, QUEUE_CROSSFADE_CHECK_MS) as unknown as ReturnType<typeof setInterval>;
      })
      .catch(err => {
        console.error('[DIAG][queue] audio.play() REJECTED:', err);
        currentlyPlayingRef.current = null;
        setPlayingQueueId(null);
        setPlaybackProgress(null);
      });

  }, [getQueueItemAudioSrc, queueVolume, fadeGain, applyBgGain]);


  // Queue volume — live-sync slider (GainNode when mixer active, else audio.volume)
  useEffect(() => {
    if (queueGainRef.current) {
      queueGainRef.current.gain.value = queueVolume / 100;
    } else if (currentlyPlayingRef.current) {
      currentlyPlayingRef.current.volume = queueVolume / 100;
    }
  }, [queueVolume]);

  // Group 4.8 — Stop current queue playback
  const stopQueuePlayback = useCallback(() => {
    // Cancel RAF loop
    if (playbackRafRef.current) { cancelAnimationFrame(playbackRafRef.current); playbackRafRef.current = null; }
    // ── Crossfade cleanup ──────────────────────────────────────────────────────
    if (crossfadeTimerRef.current) { clearInterval(crossfadeTimerRef.current); crossfadeTimerRef.current = null; }
    inCrossfadeRef.current = false;
    if (outgoingPlayerRef.current) {
      try { outgoingPlayerRef.current.audio.pause(); } catch {/* ignore */}
      try { outgoingPlayerRef.current.gain.disconnect(); } catch {/* ignore */}
      try { outgoingPlayerRef.current.source.disconnect(); } catch {/* ignore */}
      outgoingPlayerRef.current = null;
    }
    // Fade queue out before disconnecting (instant — stop is a deliberate manual action)
    try { queueGainRef.current?.disconnect(); } catch {/* ignore */}
    try { queueSourceRef.current?.disconnect(); } catch {/* ignore */}
    queueGainRef.current   = null;
    queueSourceRef.current = null;
    if (currentlyPlayingRef.current) {
      currentlyPlayingRef.current.pause();
      currentlyPlayingRef.current.currentTime = 0;
      currentlyPlayingRef.current = null; // clear BEFORE applyBgGain so queue is no longer active
    }
    // Fade background back in over 2 seconds after manual stop
    if (bgGainRef.current) {
      const isMicLive = micGainRef.current !== null && micGainRef.current.gain.value > 0;
      const targetVol = isMicLive ? (bgVolumeRef.current / 100) * BG_DUCK_RATIO : bgVolumeRef.current / 100;

      fadeGain(bgGainRef.current, targetVol, 2, 'queue-stop bg-restore');
      // Start bg audio if it was deferred (wired but paused while queue was active)
      if (bgAudioRef.current && bgAudioRef.current.paused) {
        bgAudioRef.current.play().catch(() => {});
      }
    } else {
      applyBgGain('queue-stop'); // fallback when no AudioContext
    }
    // Clear manual pause state too
    pausedQueueAudioRef.current = null;
    pausedQueueItemRef.current  = null;
    setPlayingQueueId(null);
    setPlaybackProgress(null);
    setIsPaused(false);
  }, [applyBgGain, fadeGain]);

  // ── SFX Pad Functions ────────────────────────────────────────────────────────
  // Keep sfxVolumeRef in sync with state so callbacks don't go stale
  useEffect(() => { sfxVolumeRef.current = sfxVolume; }, [sfxVolume]);
  // Apply volume changes to gain node live
  useEffect(() => {
    if (sfxGainRef.current) sfxGainRef.current.gain.value = sfxVolume;
  }, [sfxVolume]);

  // Preload all SFX tracks into AudioBuffers for zero-latency playback
  const preloadSfxBuffers = useCallback(async () => {
    const ctx = audioCtxRef.current;
    if (!ctx || sfxCategories.length === 0) return;
    setSfxPreloadStatus('loading');

    // Create SFX gain node if not yet created
    if (!sfxGainRef.current) {
      const g = ctx.createGain();
      g.gain.value = sfxVolumeRef.current;
      if (mixerDestRef.current) g.connect(mixerDestRef.current);
      if (monitorGainRef.current) g.connect(monitorGainRef.current);
      sfxGainRef.current = g;
    }

    const allTracks = sfxCategories.flatMap(c => c.tracks);
    let loaded = 0;
    for (const track of allTracks) {
      if (sfxBuffersRef.current.has(track.id)) { loaded++; continue; }
      try {
        const url = track.fileUrl?.startsWith('http') ? track.fileUrl : `/stream/${(track.fileUrl || '').replace(/^\//, '')}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arrayBuf = await res.arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(arrayBuf);
        sfxBuffersRef.current.set(track.id, audioBuf);
        loaded++;
      } catch (err) {
        console.warn(`[SFX] Failed to preload "${track.title}":`, err);
      }
    }
    console.log(`[SFX] Preloaded ${loaded}/${allTracks.length} effects`);
    setSfxPreloadStatus('ready');
  }, [sfxCategories]);

  // Preload SFX when AudioContext is available (after first connect)
  useEffect(() => {
    if (audioCtxRef.current && sfxCategories.length > 0 && sfxPreloadStatus === 'idle') {
      preloadSfxBuffers();
    }
  }, [isConnected, sfxCategories, sfxPreloadStatus, preloadSfxBuffers]);

  // Play an SFX pad — one-shot AudioBufferSourceNode for instant triggering
  const playSfx = useCallback((trackId: string) => {
    const ctx = audioCtxRef.current;
    const buffer = sfxBuffersRef.current.get(trackId);
    if (!ctx || !buffer) {
      console.warn(`[SFX] Cannot play — ${!ctx ? 'no AudioContext' : 'buffer not loaded'}`);
      return;
    }
    // Stop existing instance of same SFX if still playing (re-trigger)
    const existing = activeSfxRef.current.get(trackId);
    if (existing) { try { existing.stop(); } catch {/* already stopped */} }

    // Ensure SFX gain node exists
    if (!sfxGainRef.current) {
      const g = ctx.createGain();
      g.gain.value = sfxVolumeRef.current;
      if (mixerDestRef.current) g.connect(mixerDestRef.current);
      if (monitorGainRef.current) g.connect(monitorGainRef.current);
      sfxGainRef.current = g;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(sfxGainRef.current);
    source.onended = () => { activeSfxRef.current.delete(trackId); };
    activeSfxRef.current.set(trackId, source);
    source.start(0);
    console.log(`[SFX] Playing: ${trackId}`);
    // Ensure recording captures SFX
    ensureRecordingStarted('queue');
  }, []);

  // Stop an individual SFX pad
  const stopSfx = useCallback((trackId: string) => {
    const source = activeSfxRef.current.get(trackId);
    if (source) {
      try { source.stop(); } catch {/* already stopped */}
      activeSfxRef.current.delete(trackId);
    }
  }, []);

  // Stop ALL active SFX
  const stopAllSfx = useCallback(() => {
    activeSfxRef.current.forEach((source) => {
      try { source.stop(); } catch {/* ignore */}
    });
    activeSfxRef.current.clear();
  }, []);


  // ── DSP Filter Chain Functions ──────────────────────────────────────────────

  // Keep dspParamsRef in sync with state
  useEffect(() => { dspParamsRef.current = dspParams; }, [dspParams]);
  // Keep dspBypassRef in sync with state
  useEffect(() => { dspBypassRef.current = dspBypassed; }, [dspBypassed]);

  // Generate impulse response for reverb
  const generateImpulseResponse = useCallback((ctx: AudioContext, decay: number, duration = 2): AudioBuffer => {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * duration;
    const impulse = ctx.createBuffer(2, length, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return impulse;
  }, []);

  // Generate waveshaper curve for tape warmth
  const makeWarmthCurve = useCallback((amount: number): Float32Array<ArrayBuffer> => {
    const samples = 44100;
    const curve = new Float32Array(samples) as Float32Array<ArrayBuffer>;
    const k = amount * 50;
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return curve;
  }, []);

  // Noise gate RAF loop — monitors signal level and gates the gain
  const startNoiseGateLoop = useCallback(() => {
    if (dspGateRafRef.current) cancelAnimationFrame(dspGateRafRef.current);
    const analyser = dspGateAnalyserRef.current;
    const gateGain = dspGateGainRef.current;
    if (!analyser || !gateGain) return;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let gateOpen = true;

    const loop = () => {
      dspGateRafRef.current = requestAnimationFrame(loop);
      const params = dspParamsRef.current;
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i] * dataArray[i];
      const rms = Math.sqrt(sum / dataArray.length);
      const dbLevel = 20 * Math.log10(rms / 255 + 1e-10);

      if (dbLevel > params.gateThreshold) {
        if (!gateOpen) {
          gateGain.gain.linearRampToValueAtTime(1, (audioCtxRef.current?.currentTime ?? 0) + params.gateAttack);
          gateOpen = true;
        }
      } else {
        if (gateOpen) {
          gateGain.gain.linearRampToValueAtTime(0, (audioCtxRef.current?.currentTime ?? 0) + params.gateRelease);
          gateOpen = false;
        }
      }
    };
    loop();
  }, []);

  // Build the full DSP chain: mic → HP → LP → EQ(3) → Comp → Gate → DeEsser → Reverb → Delay → Warmth → Limiter → output
  const buildDspChain = useCallback((ctx: AudioContext, inputNode: MediaStreamAudioSourceNode): GainNode => {
    const p = dspParamsRef.current;

    // 1. High-Pass
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = p.hpFreq; hp.Q.value = 0.707;
    dspHpRef.current = hp;

    // 2. Low-Pass
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = p.lpFreq; lp.Q.value = 0.707;
    dspLpRef.current = lp;

    // 3-5. EQ
    const eqLow = ctx.createBiquadFilter();
    eqLow.type = 'lowshelf'; eqLow.frequency.value = p.eqLowFreq; eqLow.gain.value = p.eqLowGain;
    dspEqLowRef.current = eqLow;

    const eqMid = ctx.createBiquadFilter();
    eqMid.type = 'peaking'; eqMid.frequency.value = p.eqMidFreq; eqMid.gain.value = p.eqMidGain; eqMid.Q.value = 1.5;
    dspEqMidRef.current = eqMid;

    const eqHigh = ctx.createBiquadFilter();
    eqHigh.type = 'highshelf'; eqHigh.frequency.value = p.eqHighFreq; eqHigh.gain.value = p.eqHighGain;
    dspEqHighRef.current = eqHigh;

    // 6. Compressor
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = p.compThreshold; comp.ratio.value = p.compRatio;
    comp.attack.value = p.compAttack; comp.release.value = p.compRelease; comp.knee.value = p.compKnee;
    dspCompRef.current = comp;

    // 7. Noise Gate
    const gateAnalyser = ctx.createAnalyser(); gateAnalyser.fftSize = 256;
    const gateGain = ctx.createGain(); gateGain.gain.value = 1;
    dspGateAnalyserRef.current = gateAnalyser;
    dspGateGainRef.current = gateGain;

    // 8. De-Esser
    const deEsserBp = ctx.createBiquadFilter();
    deEsserBp.type = 'bandpass'; deEsserBp.frequency.value = p.deEsserFreq; deEsserBp.Q.value = p.deEsserQ;
    const deEsserGain = ctx.createGain(); deEsserGain.gain.value = 1;
    dspDeEsserBpRef.current = deEsserBp; dspDeEsserGainRef.current = deEsserGain;

    // 9. Reverb
    const reverbConv = ctx.createConvolver();
    reverbConv.buffer = generateImpulseResponse(ctx, p.reverbDecay);
    const reverbWet = ctx.createGain(); reverbWet.gain.value = p.reverbWet;
    const reverbDry = ctx.createGain(); reverbDry.gain.value = 1 - p.reverbWet;
    dspReverbConvRef.current = reverbConv; dspReverbWetRef.current = reverbWet; dspReverbDryRef.current = reverbDry;

    // 10. Delay
    const delay = ctx.createDelay(2); delay.delayTime.value = p.delayTime;
    const delayFb = ctx.createGain(); delayFb.gain.value = p.delayFeedback;
    const delayWet = ctx.createGain(); delayWet.gain.value = p.delayWet;
    const delayDry = ctx.createGain(); delayDry.gain.value = 1 - p.delayWet;
    dspDelayRef.current = delay; dspDelayFbRef.current = delayFb;
    dspDelayWetRef.current = delayWet; dspDelayDryRef.current = delayDry;

    // 11. Tape Warmth
    const warmth = ctx.createWaveShaper();
    warmth.curve = makeWarmthCurve(p.warmthAmount); warmth.oversample = '2x';
    const warmthWet = ctx.createGain(); warmthWet.gain.value = p.warmthAmount;
    const warmthDry = ctx.createGain(); warmthDry.gain.value = 1 - p.warmthAmount;
    dspWarmthRef.current = warmth; dspWarmthWetRef.current = warmthWet; dspWarmthDryRef.current = warmthDry;

    // 12. Limiter
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = p.limiterThreshold; limiter.ratio.value = 20;
    limiter.attack.value = 0.001; limiter.release.value = 0.05; limiter.knee.value = 0;
    dspLimiterRef.current = limiter;

    // 13. Output
    const output = ctx.createGain(); output.gain.value = 1;
    dspOutputRef.current = output;

    // ── Wire the chain ────────────────────────────────────────────────────────
    inputNode.connect(hp);
    hp.connect(lp); lp.connect(eqLow); eqLow.connect(eqMid); eqMid.connect(eqHigh);
    eqHigh.connect(comp); comp.connect(gateAnalyser); comp.connect(gateGain);
    gateGain.connect(deEsserBp); gateGain.connect(deEsserGain);

    // Reverb split
    const reverbMerge = ctx.createGain();
    deEsserGain.connect(reverbDry); deEsserGain.connect(reverbConv);
    reverbConv.connect(reverbWet); reverbDry.connect(reverbMerge); reverbWet.connect(reverbMerge);

    // Delay split
    const delayMerge = ctx.createGain();
    reverbMerge.connect(delayDry); reverbMerge.connect(delay);
    delay.connect(delayFb); delayFb.connect(delay); delay.connect(delayWet);
    delayDry.connect(delayMerge); delayWet.connect(delayMerge);

    // Warmth split
    const warmthMerge = ctx.createGain();
    delayMerge.connect(warmthDry); delayMerge.connect(warmth);
    warmth.connect(warmthWet); warmthDry.connect(warmthMerge); warmthWet.connect(warmthMerge);

    // Final
    warmthMerge.connect(limiter); limiter.connect(output);

    startNoiseGateLoop();
    return output;
  }, [generateImpulseResponse, makeWarmthCurve, startNoiseGateLoop]);

  // Apply DSP parameter changes to existing nodes in real-time
  const applyDspParams = useCallback((params: DspParams) => {
    setDspParams(params);
    const t = audioCtxRef.current?.currentTime ?? 0;

    // ── Filters (HP + LP) ─────────────────────────────────────────────────
    const filterOn = params.filterEnabled !== false;
    if (dspHpRef.current) dspHpRef.current.frequency.setValueAtTime(filterOn ? params.hpFreq : 20, t);
    if (dspLpRef.current) dspLpRef.current.frequency.setValueAtTime(filterOn ? params.lpFreq : 22000, t);

    // ── EQ ─────────────────────────────────────────────────────────────────
    const eqOn = params.eqEnabled !== false;
    if (dspEqLowRef.current) { dspEqLowRef.current.frequency.setValueAtTime(params.eqLowFreq, t); dspEqLowRef.current.gain.setValueAtTime(eqOn ? params.eqLowGain : 0, t); }
    if (dspEqMidRef.current) { dspEqMidRef.current.frequency.setValueAtTime(params.eqMidFreq, t); dspEqMidRef.current.gain.setValueAtTime(eqOn ? params.eqMidGain : 0, t); }
    if (dspEqHighRef.current) { dspEqHighRef.current.frequency.setValueAtTime(params.eqHighFreq, t); dspEqHighRef.current.gain.setValueAtTime(eqOn ? params.eqHighGain : 0, t); }

    // ── Dynamics (Compressor + Limiter) ────────────────────────────────────
    const dynOn = params.dynamicsEnabled !== false;
    if (dspCompRef.current) {
      dspCompRef.current.threshold.setValueAtTime(dynOn ? params.compThreshold : 0, t);
      dspCompRef.current.ratio.setValueAtTime(dynOn ? params.compRatio : 1, t);
      dspCompRef.current.attack.setValueAtTime(dynOn ? params.compAttack : 0.003, t);
      dspCompRef.current.release.setValueAtTime(dynOn ? params.compRelease : 0.25, t);
      dspCompRef.current.knee.setValueAtTime(dynOn ? params.compKnee : 0, t);
    }
    if (dspLimiterRef.current) dspLimiterRef.current.threshold.setValueAtTime(dynOn ? params.limiterThreshold : 0, t);

    // ── De-Esser ──────────────────────────────────────────────────────────
    const deesserOn = params.deesserEnabled !== false;
    if (dspDeEsserBpRef.current) { dspDeEsserBpRef.current.frequency.setValueAtTime(params.deEsserFreq, t); dspDeEsserBpRef.current.Q.setValueAtTime(deesserOn ? params.deEsserQ : 0.001, t); }

    // ── Reverb ────────────────────────────────────────────────────────────
    const reverbOn = params.reverbEnabled !== false;
    const revWet = reverbOn ? params.reverbWet : 0;
    if (dspReverbWetRef.current) dspReverbWetRef.current.gain.setValueAtTime(revWet, t);
    if (dspReverbDryRef.current) dspReverbDryRef.current.gain.setValueAtTime(1 - revWet, t);
    if (dspReverbConvRef.current && audioCtxRef.current) {
      try { dspReverbConvRef.current.buffer = generateImpulseResponse(audioCtxRef.current, params.reverbDecay); } catch {/* */}
    }

    // ── Delay ─────────────────────────────────────────────────────────────
    const delayOn = params.delayEnabled !== false;
    const dlyWet = delayOn ? params.delayWet : 0;
    if (dspDelayRef.current) dspDelayRef.current.delayTime.setValueAtTime(delayOn ? params.delayTime : 0, t);
    if (dspDelayFbRef.current) dspDelayFbRef.current.gain.setValueAtTime(delayOn ? params.delayFeedback : 0, t);
    if (dspDelayWetRef.current) dspDelayWetRef.current.gain.setValueAtTime(dlyWet, t);
    if (dspDelayDryRef.current) dspDelayDryRef.current.gain.setValueAtTime(1 - dlyWet, t);

    // ── Warmth ────────────────────────────────────────────────────────────
    const warmthOn = params.warmthEnabled !== false;
    const warmAmt = warmthOn ? params.warmthAmount : 0;
    if (dspWarmthRef.current) dspWarmthRef.current.curve = makeWarmthCurve(warmAmt);
    if (dspWarmthWetRef.current) dspWarmthWetRef.current.gain.setValueAtTime(warmAmt, t);
    if (dspWarmthDryRef.current) dspWarmthDryRef.current.gain.setValueAtTime(1 - warmAmt, t);
  }, [generateImpulseResponse, makeWarmthCurve]);

  // Toggle DSP bypass
  const toggleDspBypass = useCallback(() => {
    setDspBypassed(prev => {
      const newBypassed = !prev;
      const ctx = audioCtxRef.current;
      const micSrc = micSourceRef.current;
      const micGain = micGainRef.current;
      const dspOut = dspOutputRef.current;
      if (!ctx || !micSrc || !micGain) return newBypassed;
      try { micSrc.disconnect(); } catch {/* */}
      if (newBypassed) {
        micSrc.connect(micGain);
        if (analyserRef.current) micSrc.connect(analyserRef.current);
      } else {
        if (dspHpRef.current) {
          micSrc.connect(dspHpRef.current);
          if (analyserRef.current && dspOut) dspOut.connect(analyserRef.current);
        } else { micSrc.connect(micGain); }
      }
      return newBypassed;
    });
  }, []);

  // DSP cleanup
  const cleanupDsp = useCallback(() => {
    if (dspGateRafRef.current) { cancelAnimationFrame(dspGateRafRef.current); dspGateRafRef.current = null; }
    const refs = [dspHpRef, dspLpRef, dspEqLowRef, dspEqMidRef, dspEqHighRef, dspCompRef, dspLimiterRef,
      dspGateGainRef, dspGateAnalyserRef, dspDeEsserBpRef, dspDeEsserGainRef,
      dspReverbConvRef, dspReverbWetRef, dspReverbDryRef,
      dspDelayRef, dspDelayFbRef, dspDelayWetRef, dspDelayDryRef,
      dspWarmthRef, dspWarmthWetRef, dspWarmthDryRef, dspOutputRef];
    for (const ref of refs) {
      try { (ref.current as AudioNode)?.disconnect(); } catch {/* */}
      (ref as React.MutableRefObject<AudioNode | null>).current = null;
    }
  }, []);

  // Manual pause: suspend audio without resetting position
  const pauseQueueItem = useCallback(() => {
    if (!currentlyPlayingRef.current || !playingQueueId) return;
    if (playbackRafRef.current) { cancelAnimationFrame(playbackRafRef.current); playbackRafRef.current = null; }
    currentlyPlayingRef.current.pause();
    // Store the audio element so we can resume from same position
    pausedQueueAudioRef.current = currentlyPlayingRef.current;
    const pausedItem = mediaQueueRef.current.find(q => q.id === playingQueueId) ?? null;
    pausedQueueItemRef.current  = pausedItem;
    currentlyPlayingRef.current = null;
    setPlayingQueueId(null);
    setIsPaused(true);
  }, [playingQueueId]);

  // Toggle presenter headphone monitoring — works even before connecting
  const toggleMonitoring = useCallback(async () => {
    // Ensure AudioContext + mixer + monitor exist (lazy-init on first click)
    if (!monitorGainRef.current) {
      await ensureAudioMixer();
    }
    if (!monitorGainRef.current) {
      console.warn('[DIAG][monitoring] monitorGainRef still not ready after ensureAudioMixer');
      return;
    }
    // Also enumerate output devices on first monitoring toggle
    refreshAudioOutputDevices();
    setIsMonitoring(prev => {
      const next = !prev;
      monitorGainRef.current!.gain.value = next ? monitorVolume : 0;
      // Ensure the monitor <audio> element is playing (may have been paused or blocked by autoplay)
      if (next && monitorAudioRef.current && monitorAudioRef.current.paused) {
        monitorAudioRef.current.play().catch(() => {});
      }
      console.log('[DIAG][monitoring] Monitoring', next ? `ON (gain=${monitorVolume})` : 'OFF (gain=0)');
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitorVolume, ensureAudioMixer]);

  // Group 4.15 — Enumerate audio output devices
  const refreshAudioOutputDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter(d => d.kind === 'audiooutput');
      setAudioOutputDevices(outputs);
      console.log('[DIAG][output-device] enumerated:', outputs.length, outputs.map(d => d.label));
    } catch (e) {
      console.warn('[DIAG][output-device] enumerateDevices failed:', e);
    }
  }, []);

  // Group 4.15 — Switch monitor output device via setSinkId
  const switchOutputDevice = useCallback(async (deviceId: string) => {
    setSelectedOutputDeviceId(deviceId);
    const audio = monitorAudioRef.current;
    if (audio && typeof (audio as any).setSinkId === 'function') {
      try {
        await (audio as any).setSinkId(deviceId);
        console.log('[DIAG][output-device] setSinkId OK:', deviceId);
      } catch (e) {
        console.error('[DIAG][output-device] setSinkId FAILED:', e);
      }
    } else {
      console.warn('[DIAG][output-device] setSinkId not supported in this browser');
    }
  }, []);

  const getTrackTitle = (id: string | null, cats: Category[]) => {
    if (!id) return null;
    for (const cat of cats) {
      const t = cat.tracks.find(t => t.id === id);
      if (t) return t.title;
    }
    return null;
  };

  // Group 4.13 — Enumerate audio input devices; call after permission to get real labels
  const refreshAudioInputDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter(d => d.kind === 'audioinput');
      // Build display-ready list with fallback labels before permission
      setAudioInputDevices(inputs);
      if (selectedMicDeviceId === '') {
        // Default: prefer deviceId 'default', else first available
        const def = inputs.find(d => d.deviceId === 'default') ?? inputs[0];
        if (def) setSelectedMicDeviceId(def.deviceId);
      }
      console.log('[DIAG][mic-device] devices enumerated:', inputs.length);
    } catch (e) {
      console.warn('[DIAG][mic-device] enumerateDevices failed:', e);
    }
  }, [selectedMicDeviceId]);

  // Group 4.13 — Live mic switch: swap input device without breaking session
  const switchMicDevice = useCallback(async (deviceId: string) => {
    if (!isMicOpen) {
      // Mic is closed — just save preference; used on next mic open
      setSelectedMicDeviceId(deviceId);
      console.log('[DIAG][mic-device] saved deviceId for next open:', deviceId);
      return;
    }
    // Mic is open — swap streams safely
    const ctx  = audioCtxRef.current;
    const dest = mixerDestRef.current;
    if (!ctx || !dest) { setSelectedMicDeviceId(deviceId); return; }
    try {
      const constraints = deviceId
        ? { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, deviceId: { exact: deviceId } }, video: false }
        : { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false };
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      // Disconnect old mic nodes
      try { micSourceRef.current?.disconnect(); } catch {/* ignore */}
      try { micGainRef.current?.disconnect(); } catch {/* ignore */}
      // Stop old hardware tracks
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = newStream;
      // Reconnect new mic to existing gain → mixerDest (no WS/recorder disruption)
      const newSrc = ctx.createMediaStreamSource(newStream);
      micSourceRef.current = newSrc;
      const gain = micGainRef.current ?? ctx.createGain();
      if (!micGainRef.current) { gain.gain.value = 1; micGainRef.current = gain; }
      newSrc.connect(gain);
      gain.connect(dest);
      // Restart level meter for new stream (inline to avoid forward-ref error)
      if (analyserRef.current) {
        const newSrcForMeter = ctx.createMediaStreamSource(newStream);
        newSrcForMeter.connect(analyserRef.current);
      }
      setSelectedMicDeviceId(deviceId);
      setMicDeviceError(null);
      console.log('[DIAG][mic-device] live switch OK → deviceId:', deviceId);
    } catch (e) {
      console.error('[DIAG][mic-device] live switch FAILED:', e);
      setMicDeviceError(t('mic.deviceSwitchFailed'));
    }
  }, [isMicOpen]);

  // 4.8: nowPlaying derived from queue (first READY SONG, or first READY_AFTER_MIC_CLOSE SONG)
  const firstReadySong = mediaQueue.find(q => q.mediaType === "SONG" && q.status === "READY");
  const firstWaitingSong = mediaQueue.find(q => q.mediaType === "SONG" && q.status === "READY_AFTER_MIC_CLOSE");
  const activeSongLabel = firstReadySong?.title ?? firstWaitingSong?.title ?? null;
  const activeDbBgTrack = getTrackTitle(activeBgTrackId, bgCategories);
  const activeLocalBgFile = localFiles.background.find(f => f.objectUrl === activeBgLocalUrl);
  const activeBgTrack = activeDbBgTrack || activeLocalBgFile?.name;

  const showFadeMessage = (msg: string) => {
    setFadeMessage(msg);
    setTimeout(() => setFadeMessage(null), 4000);
  };

  // 4.8: Shuffle picks a random SONG from the same DB category as the first ready queue song.
  // Enqueues into mediaQueue; does NOT set legacy nowPlayingId.
  const handleShuffle = () => {
    if (!firstReadySong) return;
    // Find the category containing the currently-first ready song
    const cat = songCategories.find(c => c.tracks.some(t => t.id === firstReadySong.trackId));
    if (!cat) return;
    // Tracks not yet in queue
    const alreadyQueued = new Set(mediaQueue.filter(q => q.mediaType === "SONG").map(q => q.trackId));
    const available = cat.tracks.filter(t => !alreadyQueued.has(t.id));
    if (available.length === 0) { showFadeMessage(t('queue.allCategorySongsQueued')); return; }
    const random = available[Math.floor(Math.random() * available.length)];
    enqueueItem(random.id, random.title, "SONG", "ADMIN_DB", cat.ownerType as "ADMIN" | "PRESENTER");
    showFadeMessage(t('queue.randomSongAdded'));
  };

  const startLevelMeter = (stream: MediaStream, existingCtx?: AudioContext) => {
    // If an existing AudioContext is provided (mic re-open), reuse it to avoid
    // destroying the active mixer context. Otherwise create a new one (first open).
    const ctx = existingCtx ?? new AudioContext();
    if (!existingCtx) {
      audioCtxRef.current = ctx;  // only set ref on first open
    }
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.6;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyserRef.current = analyser;
    dataArrayRef.current = data;

    const tick = () => {
      if (!analyserRef.current || !dataArrayRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      const avg = dataArrayRef.current.reduce((s, v) => s + v, 0) / dataArrayRef.current.length;
      const level = Math.min(avg / 80, 1);
      setVolumeLevel(level);
      volumeRef.current = level;
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const startHeartbeat = () => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    const sendBeat = async () => {
      try {
        await fetch("/api/studio/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ micOn: true, volumeLevel: volumeRef.current }),
        });
        setHeartbeatStatus("active");
      } catch {
        setHeartbeatStatus("stopped");
      }
    };
    sendBeat(); // fire immediately
    heartbeatRef.current = setInterval(sendBeat, 2000);
  };


  // ── [DIAG] TEMP: Direct file-to-mixer test ─────────────────────────────────
  const testFileMixer = () => {
    const ctx  = audioCtxRef.current;
    const dest = mixerDestRef.current;
    console.log('[DIAG][file-tone] ctx exists:', !!ctx, '| dest exists:', !!dest);
    if (!ctx || !dest) {
      console.warn('[DIAG][file-tone] BLOCKED — mixer not ready. Open mic first.');
      alert('Open mic first to initialise the mixer, then click TEST FILE TO MIXER.');
      return;
    }
    const src = '/test-audio/test-presenter-break.mp3';
    console.log('[DIAG][file-tone] src used:', src);
    const audio = new Audio(src);
    let fileSrc: MediaElementAudioSourceNode;
    try {
      fileSrc = ctx.createMediaElementSource(audio);
      console.log('[DIAG][file-tone] createMediaElementSource: OK');
    } catch (e) {
      console.error('[DIAG][file-tone] createMediaElementSource FAILED:', e);
      return;
    }
    const gain = ctx.createGain();
    gain.gain.value = 0.8;
    fileSrc.connect(gain);
    gain.connect(dest);   // → mixerDest ONLY (no ctx.destination)
    console.log('[DIAG][file-tone] connected to mixerDest only | gain:', gain.gain.value);
    audio.onended = () => console.log('[DIAG][file-tone] ended');
    audio.play()
      .then(() => console.log('[DIAG][file-tone] play(): RESOLVED — MP3 now in mixer stream'))
      .catch(err => console.error('[DIAG][file-tone] play() REJECTED:', err));
  };
  // ─────────────────────────────────────────────────────────────────────────────

  const toggleMic = async () => {
    console.log('[toggleMic] called — isConnected:', isConnected, '| isMicOpen:', isMicOpen);
    if (!isConnected) return;
    setMicError(null);

    if (isMicOpen) {
      muteMic();
      setIsMicOpen(false);
    } else {
      try {
        // Mixer is initialized in toggleConnection — we only need to acquire the mic here.
        const ctx  = audioCtxRef.current;
        const dest = mixerDestRef.current;

        console.log('[toggleMic] ctx:', !!ctx, '| dest:', !!dest, '| wsRef readyState:', wsRef.current?.readyState);

        if (!ctx || !dest) {
          // Safety net: should not happen if toggleConnection ran correctly
          console.error('[toggleMic] BLOCKED — ctx or dest is null. audioCtxRef:', audioCtxRef.current, 'mixerDestRef:', mixerDestRef.current);
          setMicError(t('mic.mixerNotReady'));
          return;
        }

        if (ctx.state === "suspended") await ctx.resume();

        // Acquire mic stream
        const micConstraints: MediaStreamConstraints = selectedMicDeviceId
          ? { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, deviceId: { exact: selectedMicDeviceId } }, video: false }
          : { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false };
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia(micConstraints);
        } catch (micErr) {
          if (selectedMicDeviceId) {
            console.warn("[DIAG][mic-device] selected device failed, fallback:", micErr);
            setMicDeviceError(t('mic.deviceFallback'));
            stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
            setSelectedMicDeviceId("");
          } else throw micErr;
        }
        streamRef.current = stream;
        refreshAudioInputDevices();
        refreshAudioOutputDevices();
        startLevelMeter(stream, ctx);

        // Disconnect any stale mic source
        try { micSourceRef.current?.disconnect(); } catch {/* ignore */}
        const micSrc = ctx.createMediaStreamSource(stream);
        micSourceRef.current = micSrc;

        // Re-use or create micGain — unmute it (gain was 0 before mic open)
        if (!micGainRef.current) {
          const mg = ctx.createGain();
          mg.gain.value = 1;
          micGainRef.current = mg;
          mg.connect(dest);
        } else {
          micGainRef.current.gain.value = 1;
        }

        // ── DSP Chain: route mic through processing or bypass ──────────────
        if (!dspBypassRef.current) {
          // Build DSP chain: mic → [13 nodes] → output
          const dspOut = buildDspChain(ctx, micSrc);
          dspOut.connect(micGainRef.current);
          // Connect analyser after DSP for processed VU meter
          if (analyserRef.current) dspOut.connect(analyserRef.current);
        } else {
          // Bypass: mic → micGain directly
          micSrc.connect(micGainRef.current);
          if (analyserRef.current) micSrc.connect(analyserRef.current);
        }

        // ✔ First real audio source connected — start recording if not already started
        ensureRecordingStarted('mic');

        // If background was playing, reconnect it through the existing mixer
        if (activeBgTrackId) {
          try {
            stopBackgroundAudio();
            const freshBgAudio = new Audio(`/api/tracks/${activeBgTrackId}`);
            freshBgAudio.loop = true;
            bgAudioRef.current = freshBgAudio;
            const bgSrc  = ctx.createMediaElementSource(freshBgAudio);
            const bgGain = ctx.createGain();
            bgGain.gain.value = bgVolume / 100;
            bgSrc.connect(bgGain);
            bgGain.connect(dest);
            if (monitorGainRef.current) bgGain.connect(monitorGainRef.current);
            bgSourceRef.current = bgSrc;
            bgGainRef.current   = bgGain;
            freshBgAudio.play().catch(e => console.warn("[DIAG] bg reconnect play failed:", e));
          } catch (e) { console.warn("[DIAG] bg reconnect failed:", e); }
        }

        const readyCount = mediaQueue.filter(q => q.status === "READY").length;
        if (readyCount > 0) showFadeMessage(t('queue.readyItemsCount', { count: readyCount }));
        setIsMicOpen(true);
      } catch {
        setMicError(t('mic.accessDenied'));
      }
    }
  };

  const toggleConnection = async (e?: React.MouseEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    
    if (isConnected) {
      // Disconnect: full teardown
      if (noSleepRef.current) noSleepRef.current.disable();
      if (isMicOpen) setIsMicOpen(false);
      stopBroadcastSession();
      try { await fetch("/api/studio/disconnect", { method: "POST" }); } catch { /* best-effort */ }
      setIsConnected(false);
      setShoutcastStatus('idle');
    } else {
      // ── Connect: use ensureAudioMixer to reuse or create audio infrastructure ──
      setMicError(null); // Clear any stale disconnect/error messages
      try {
        if (noSleepRef.current) noSleepRef.current.enable();
        // 1. AudioContext + mixer + keepalive + monitoring (reuse if already alive)
        const { ctx, dest: mixerDest } = await ensureAudioMixer();

        const _ = mixerDest; // ensure lint doesn't complain

        // 2. Audio token (AFTER AudioContext is ready)
        let audioToken: string;
        try {
          const tokenRes = await fetch("/api/internal/audio-token/create", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            // DIRECT_DJ sessions must send directDjRadioId; scheduled sessions send scheduledStationId
            // (resolved server-side by the correct program time window) so token/create skips P2.
            body: directDjRadioId
              ? JSON.stringify({ directDjRadioId })
              : scheduledStationId
              ? JSON.stringify({ scheduledStationId })
              : undefined,
          });

          // Catch NextAuth silent session redirects
          if (tokenRes.redirected || tokenRes.url.includes('/login')) {
            setMicError(t('connection.sessionExpired'));
            setTimeout(() => { window.location.href = '/login'; }, 1500);
            return;
          }

          if (!tokenRes.ok) throw new Error(`Token failed (${tokenRes.status})`);
          const tokenData = await tokenRes.json();
          if (!tokenData?.token) throw new Error("Token missing");
          audioToken = tokenData.token;
        } catch (tokenErr) {
          console.error("[Studio] Audio token failed on connect:", tokenErr);
          setMicError(t('connection.connectionFailed'));
          return;
        }

        // ✔ FIX: setIsConnected(true) is called HERE — immediately after AudioContext +
        // mixer are ready — so the mic button is enabled regardless of WS state.
        // Previously this was inside ws.onopen, which meant if backend-audio is down
        // the mic button stayed permanently disabled.
        console.log('[Studio][connect] AudioContext + mixer ready — enabling Studio UI');
        console.log('[Studio][connect] audioCtxRef:', !!audioCtxRef.current, '| mixerDestRef:', !!mixerDestRef.current, '| keepaliveRef:', !!keepaliveRef.current);

        // 3. WebSocket
        let wsBase = process.env.NEXT_PUBLIC_WS_URL;
        if (!wsBase || wsBase.includes("localhost") || wsBase.includes("4001")) {
          if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
            wsBase = "wss://egonair-backend-audio-729286791857.europe-west1.run.app/audio";
          } else {
            wsBase = "ws://localhost:4001/audio";
          }
        }
        // Ensure the path ends with /audio (Cloud Run backend requirement)
        if (!wsBase.endsWith('/audio')) {
          wsBase = wsBase.replace(/\/$/, '') + '/audio';
        }
        const wsUrl  = `${wsBase}?token=${encodeURIComponent(audioToken)}`;
        console.log('[Studio][connect] Connecting WS to:', wsBase);
        const ws     = new WebSocket(wsUrl);
        wsRef.current = ws;
        ws.onopen = () => {
          console.log('[Studio][ws.onopen] WS OPEN — backend-audio connected');
          console.log('[Studio][ws.onopen] refs — audioCtx:', !!audioCtxRef.current, '| mixerDest:', !!mixerDestRef.current, '| keepalive:', !!keepaliveRef.current, '| mediaRecorder:', !!mediaRecorderRef.current);
          setAudioBackendStatus("connected");
          setIsConnected(true);
          setShoutcastStatus('ws_connected');

          // ── Wire pre-selected background into mixer ───────────────────────
          // Only if bg is NOT already wired (e.g., first connect before bg-effect ran)
          const bgUrl = activeBgLocalUrlRef.current ?? (activeBgTrackIdRef.current ? `/api/tracks/${activeBgTrackIdRef.current}` : null);
          console.log('[Studio][ws.onopen] pre-selected bgUrl:', bgUrl, '| already wired:', !!bgSourceRef.current);
          if (bgUrl && mixerDest && ctx && !bgSourceRef.current) {
            const audio = new Audio(bgUrl);
            audio.loop = true;
            bgAudioRef.current = audio;
            try {
              const bgSrc  = ctx.createMediaElementSource(audio);
              const bgGain = ctx.createGain();
              bgGain.gain.value = bgVolumeRef.current / 100;
              bgSrc.connect(bgGain);
              bgGain.connect(mixerDest);
              if (monitorGainRef.current) bgGain.connect(monitorGainRef.current);
              bgSourceRef.current = bgSrc;
              bgGainRef.current   = bgGain;
              audio.play()
                .then(() => {
                  console.log('[Studio][ws.onopen] pre-selected bg play OK — calling ensureRecordingStarted(background)');
                  ensureRecordingStarted('background');
                })
                .catch(e => console.warn('[Studio][ws.onopen] bg play failed:', e));
            } catch (e) { console.warn('[Studio][ws.onopen] bg wire failed:', e); }
          }

          // ── Drain pending recording intent ────────────────────────────────
          // If a real audio source (mic / bg / queue) called ensureRecordingStarted
          // before this onopen fired, it stored its reason here and returned early.
          // Now that the WS is OPEN, replay it so MediaRecorder actually starts.
          const pendingReason = pendingRecordingReasonRef.current;
          if (pendingReason) {
            pendingRecordingReasonRef.current = null;
            console.log('[Recording] Draining pending start after WebSocket open:', pendingReason);
            startSessionRecording(pendingReason);
          }

          // ── Always ensure recording is started if any audio source is active ──
          // On reconnect, bg/queue may already be wired and playing from the previous
          // session, but MediaRecorder was destroyed on disconnect. Kick it off now.
          if (!mediaRecorderRef.current) {
            if (bgSourceRef.current) {
              console.log('[Studio][ws.onopen] bg already wired — starting recording for reconnect');
              ensureRecordingStarted('background');
            } else if (currentlyPlayingRef.current) {
              console.log('[Studio][ws.onopen] queue already playing — starting recording for reconnect');
              ensureRecordingStarted('queue');
            }
          }

          console.log('[Studio][ws.onopen] done — waiting for first real audio source to start recording');
        };
        // Handle JSON status messages from backend-audio
        ws.onmessage = (event: MessageEvent) => {
          if (typeof event.data !== 'string') return; // binary = audio echo (not expected)
          try {
            const msg = JSON.parse(event.data) as { type: string; [k: string]: unknown };
            switch (msg.type) {
              case 'ws_connected':      setShoutcastStatus('ws_connected');   break;
              case 'recording_only':    setShoutcastStatus('recording_only'); break;
              case 'recording_started': setShoutcastStatus('recording');      break;
              case 'shoutcast_connecting': setShoutcastStatus('connecting');  break;
              case 'shoutcast_ok':      setShoutcastStatus('on_air');         break;
              case 'shoutcast_error':   setShoutcastStatus('radio_error');    break;
              case 'duplicate_attempt':
                showFadeMessage(t('connection.duplicateDeviceAlert'));
                break;
              case 'listener_message':
              case 'new_listener_message':
                const newMsg = msg.message as ListenerMessage;
                setLiveMessages(prev => [newMsg, ...prev]);
                showFadeMessage(`${t('LiveMessaging.sender')}: ${newMsg.name || newMsg.senderName}`);
                break;
              default: break;
            }
          } catch { /* ignore non-JSON messages */ }
        };
        ws.onclose = (event: CloseEvent) => {
          console.log('[Studio][ws.onclose] WS closed — code:', event.code, 'reason:', event.reason);
          // Guard: if this is a stale WS (user already reconnected), ignore the close event
          if (wsRef.current !== ws && wsRef.current !== null) {
            console.log('[Studio][ws.onclose] Ignoring stale WS close — a new WS is already active');
            return;
          }
          setAudioBackendStatus("disconnected");
          setShoutcastStatus('idle');
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
          mediaRecorderRef.current = null;
          
          const reasonStr = (event.reason || "").toLowerCase();
          
          if (event.code === 1008 && reasonStr.includes("duplicate")) {
            setMicError(t('connection.duplicateSession'));
            setIsMicOpen(false);
            stopBroadcastSession();
            setIsConnected(false);
          } else if (event.code === 1001 || reasonStr.includes("stale") || reasonStr.includes("timeout") || reasonStr.includes("no audio")) {
            setMicError(t('connection.noAudioTimeout'));
            setIsMicOpen(false);
            stopBroadcastSession();
            setIsConnected(false);
          } else if (event.code !== 1000) {
            // Fallback for other unexpected closures to prevent UI from being stuck "connected"
            const fallbackMsg = event.reason ? t('connection.disconnectionWithCodeReason', { code: event.code, reason: event.reason }) : t('connection.disconnectionWithCode', { code: event.code });
            setMicError(fallbackMsg);
            setIsMicOpen(false);
            stopBroadcastSession();
            setIsConnected(false);
          }
        };

        startHeartbeat();
      } catch (e) {
        console.error("[Studio][connect] init error:", e);
        setMicError(t('connection.connectionFailed'));
        // If init failed, ensure isConnected stays false
        setIsConnected(false);
      }
    }
  };

  // Group 4.7-C — Songs now use unified mediaQueue; legacy nextSongId removed.
  // nowPlayingId is kept only for the summary row label and shuffle guard.
  const handleSelectSong = (trackId: string, title: string, ownerType: "ADMIN" | "PRESENTER" = "ADMIN") => {
    if (!isConnected) return;
    // Toggle: if already in queue, remove it
    const existing = mediaQueue.find(q => q.trackId === trackId && q.mediaType === "SONG");
    if (existing) {
      removeQueueItem(existing.id);
      return;
    }
    enqueueItem(trackId, title, "SONG", "ADMIN_DB", ownerType);
    showFadeMessage(isVoiceLive ? t('queue.willPlayAfterMic') : t('queue.addedToQueue'));
  };

  // Group 4.7-B — Enqueue a local session file into mediaQueue.
  // Local BACKGROUND files stay as activeBgLocalUrl, not in the main queue.
  const enqueueLocalFile = useCallback((tab: MediaTab, file: LocalFile) => {
    if (tab === "background") return; // background stays separate
    const mediaType: MediaType =
      tab === "songs"  ? "SONG"  :
      tab === "breaks" ? "BREAK" : "AD";
    // Prevent duplicates
    if (mediaQueue.some(q => q.trackId === file.id && q.mediaType === mediaType)) return;
    enqueueItem(file.id, file.name, mediaType, "LOCAL_SESSION", undefined, file.objectUrl);
    showFadeMessage(isVoiceLive ? t('queue.willPlayAfterMic') : t('queue.addedFileToQueue'));
  }, [mediaQueue, enqueueItem, isVoiceLive, showFadeMessage, t]);

  // Group 4.7-B — When a local file is removed, also remove its queue entry and revoke its URL
  const handleRemoveLocalFileWithQueueCleanup = useCallback((tab: MediaTab, fileId: string) => {
    // Find the matching queue item (LOCAL_SESSION) and remove it
    const qItem = mediaQueue.find(q => q.trackId === fileId && q.sourceType === "LOCAL_SESSION");
    if (qItem) removeQueueItem(qItem.id);
    handleRemoveLocalFile(tab, fileId);
  }, [mediaQueue, removeQueueItem, handleRemoveLocalFile]);

  return (
    <div dir={dir} className="min-h-screen bg-[#0f0f1a] text-neutral-100 font-sans relative overflow-hidden">
      {/* ── Global overlays ── */}
      {autoDisconnectMsg && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-full shadow-xl backdrop-blur-md font-bold text-sm text-center border animate-pulse ${
          autoDisconnectMsg.startsWith('انتهى')
            ? 'bg-red-500/20 border-red-500/50 text-red-200 shadow-[0_0_30px_rgba(239,68,68,0.4)]'
            : 'bg-amber-500/20 border-amber-500/50 text-amber-200 shadow-[0_0_30px_rgba(245,158,11,0.4)]'
        }`}>
          {autoDisconnectMsg}
        </div>
      )}
      {fadeMessage && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 z-50 bg-indigo-500/20 border border-indigo-500/50 text-indigo-100 px-6 py-3 rounded-full shadow-[0_0_30px_rgba(99,102,241,0.3)] animate-pulse backdrop-blur-md font-medium text-sm text-center">
          {fadeMessage}
        </div>
      )}
      <style dangerouslySetInnerHTML={{__html: `@keyframes soundBars { 0% { transform: scaleY(0.3); opacity: 0.5; } 100% { transform: scaleY(1); opacity: 1; } }`}} />

      {/* ═══════════════════════════════════════════════════════════════════════
          TOP BAR — Sticky header with mic button, status, connect, exit
         ═══════════════════════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-40 bg-black/60 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-[1800px] mx-auto px-4 py-2 flex items-center justify-between gap-3">

          {/* Right: Station name + ON AIR */}
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold bg-gradient-to-l from-indigo-400 to-cyan-400 bg-clip-text text-transparent hidden sm:block">{t('title')}</h1>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-900/80 border border-neutral-800">
              <div className={`w-2 h-2 rounded-full ${isVoiceLive ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-pulse' : 'bg-neutral-600'}`}></div>
              <span className={`text-xs font-semibold tracking-wider ${isVoiceLive ? 'text-red-400' : 'text-neutral-500'}`}>{isVoiceLive ? "ON AIR" : "OFF AIR"}</span>
            </div>
            {/* Recording status */}
            {(shoutcastStatus === 'recording' || shoutcastStatus === 'on_air' || shoutcastStatus === 'radio_error' || shoutcastStatus === 'recording_only') && (
              <span className="text-[10px] text-cyan-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.7)]"></span>
                {t('recording.badge')}
              </span>
            )}
          </div>

          {/* Center: Mic Button (compact in header) */}
          <button onClick={toggleMic} disabled={!isConnected} className={`relative flex items-center justify-center w-14 h-14 lg:w-16 lg:h-16 rounded-full border-2 transition-all duration-500 flex-shrink-0 ${!isConnected ? 'border-neutral-800 bg-neutral-950/50 opacity-40 cursor-not-allowed' : isVoiceLive ? 'border-red-500/60 bg-red-500/20 shadow-[0_0_30px_rgba(239,68,68,0.4)]' : 'border-neutral-700 bg-neutral-900/80 hover:bg-neutral-800 hover:border-neutral-600'}`}>
            {isVoiceLive && <div className="absolute inset-[-2px] rounded-full border-2 border-red-500 opacity-20 animate-ping pointer-events-none"></div>}
            <svg xmlns="http://www.w3.org/2000/svg" className={`w-6 h-6 lg:w-7 lg:h-7 ${!isConnected ? 'text-neutral-600' : isVoiceLive ? 'text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 'text-neutral-400'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {isVoiceLive ? (<><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" x2="12" y1="19" y2="22"></line></>) : (<><line x1="2" x2="22" y1="2" y2="22"></line><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"></path><path d="M5 10v2a7 7 0 0 0 12 5"></path><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"></path><path d="M9 9v3a3 3 0 0 0 5.12 2.12"></path><line x1="12" x2="12" y1="19" y2="22"></line></>)}
            </svg>
          </button>

          {/* Left: Connect + Actions */}
          <div className="flex items-center gap-2">
            <LanguageSwitcher compact />
            <button type="button" onClick={(e) => toggleConnection(e)} className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${isConnected ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20'}`}>
              {isConnected ? t('connection.disconnect') : t('connection.connect')}
            </button>
            <Link href="/profile" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-neutral-400 hover:text-indigo-300 bg-neutral-900/80 border border-neutral-800 hover:border-indigo-500/40 transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
              <span className="hidden sm:inline">{t('topBar.profile')}</span>
            </Link>
            <a href="/studio/recordings" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-neutral-400 hover:text-indigo-300 bg-neutral-900/80 border border-neutral-800 hover:border-indigo-500/40 transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
              <span className="hidden sm:inline">{t('topBar.recordings')}</span>
            </a>
            <button
              onClick={async () => {
                if (isConnected) {
                  if (isVoiceLive) { setIsMicOpen(false); setIsGuestOnAir(false); }
                  stopBroadcastSession();
                  try { await fetch('/api/studio/disconnect', { method: 'POST' }); } catch { /* best-effort */ }
                  setIsConnected(false);
                  setShoutcastStatus('idle');
                }
                if (onExitStudio) { onExitStudio(); } else { try { router.push('/studio'); } catch { window.location.href = '/studio'; } }
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-neutral-400 hover:text-neutral-200 bg-neutral-900/80 border border-neutral-800 hover:border-neutral-700 transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              <span className="hidden sm:inline">{t('topBar.exitStudio')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════════
          MOBILE TAB BAR — only visible on <1024px
         ═══════════════════════════════════════════════════════════════════════ */}
      <nav className="lg:hidden sticky top-[60px] z-30 bg-black/60 backdrop-blur-xl border-b border-white/10">
        <div className="flex">
          {(
            [
              ["mixer", t('mobileTabs.mixer')],
              ["library", t('library.title')],
              ["queue", t('queue.title')],
              ["sfx", t('sfx.title')],
              ...(scheduledStationId ? [["messages", "💬"]] : [])
            ] as [MobileTab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMobileTab(key)}
              className={`flex-1 py-2.5 text-xs font-medium transition-all border-b-2 ${mobileTab === key ? 'text-violet-400 border-violet-500 bg-violet-500/5' : 'text-neutral-500 border-transparent hover:text-neutral-300'}`}
            >
              {label}
              {key === "queue" && mediaQueue.length > 0 && <span className="mr-1 px-1.5 py-0.5 bg-violet-500/20 text-violet-400 text-[10px] rounded-full">{mediaQueue.length}</span>}
              {key === "messages" && liveMessages.length > 0 && <span className="mr-1 px-1.5 py-0.5 bg-red-500/20 text-red-400 text-[10px] rounded-full">{liveMessages.length}</span>}
            </button>
          ))}
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════════════════════════
          MAIN 4-COLUMN LAYOUT
         ═══════════════════════════════════════════════════════════════════════ */}
      <main className={`max-w-[2000px] mx-auto px-3 py-3 lg:grid lg:gap-3 lg:h-[calc(100vh-60px)] ${!!scheduledStationId ? 'xl:grid-cols-[22fr_34fr_22fr_22fr] lg:grid-cols-[25fr_35fr_40fr]' : 'xl:grid-cols-[25fr_40fr_35fr] lg:grid-cols-[25fr_40fr_35fr]'}`}>

        {/* ─────────────────────────────────────────────────────────────────────
            RIGHT COLUMN — Media Library
           ───────────────────────────────────────────────────────────────────── */}
        <section className={`${mobileTab === 'library' ? 'block' : 'hidden'} lg:block lg:overflow-y-auto lg:max-h-full rounded-2xl bg-white/[0.03] backdrop-blur-lg border border-white/10 p-3`}>
          <h2 className="text-sm font-semibold text-neutral-300 mb-3 flex items-center gap-2">
            📚 {t('library.title')}
          </h2>

          {/* Tab Pills */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {([["background",t('library.backgrounds'),"indigo"],["songs",t('library.songs'),"cyan"],["breaks",t('library.breaks'),"amber"],["ads",t('library.ads'),"rose"]] as [MediaTab,string,string][]).map(([key,label,color]) => (
              <button key={key} onClick={() => setActiveMediaTab(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeMediaTab === key
                    ? `bg-${color}-500/20 text-${color}-300 border border-${color}-500/40 shadow-[0_0_10px_rgba(99,102,241,0.1)]`
                    : 'bg-neutral-800/50 text-neutral-500 border border-neutral-700/50 hover:text-neutral-300 hover:border-neutral-600'
                }`}
              >{label}</button>
            ))}
          </div>

          {/* ── Background Tab Content ── */}
          {activeMediaTab === "background" && (
            <div className="space-y-3">
              <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-lg px-3 py-2 text-[10px] text-indigo-300">
                ✔ {t('library.bgAllowedWithMic')}
              </div>
              {/* BG Volume */}
              <div className="bg-neutral-900/60 border border-indigo-500/20 rounded-xl px-3 py-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-indigo-300">{t('faders.bgLevel')}</label>
                  <span className="text-xs font-mono text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                    {bgVolume}%{isVoiceLive ? ` (${t('faders.ducked')})` : ''}
                  </span>
                </div>
                <input type="range" min={0} max={100} value={bgVolume} onChange={e => setBgVolume(Number(e.target.value))} className="w-full h-1.5 accent-indigo-400 cursor-pointer" />
                {isVoiceLive && (
                  <p className="text-[10px] text-amber-400/80 mt-1.5">⚠ {t('faders.bgDuckNote')}</p>
                )}
              </div>
              {/* DB Categories */}
              {bgCategories.length === 0 && localFiles.background.length === 0 ? (
                <p className="text-xs text-neutral-500 text-center py-4">{t('library.noBgTracks')}</p>
              ) : (
                bgCategories.map(cat => (
                  <div key={cat.id} className="border border-neutral-800 rounded-xl overflow-hidden">
                    <button onClick={() => setExpandedCategories(prev => ({ ...prev, [cat.id]: !prev[cat.id] }))} className="w-full flex items-center justify-between px-3 py-2 bg-neutral-900/60 hover:bg-neutral-800/60 transition-colors">
                      <span className="text-xs font-medium text-neutral-300">{cat.name}</span>
                      <svg className={`w-3.5 h-3.5 text-neutral-500 transition-transform ${expandedCategories[cat.id] ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                    {expandedCategories[cat.id] && cat.tracks.map(tr => (
                      <div key={tr.id} className="flex items-center justify-between px-3 py-1.5 border-t border-neutral-800/50 hover:bg-neutral-800/30 transition-colors">
                        <span className="text-xs text-neutral-300 truncate flex-1">{tr.title}</span>
                        <button onClick={() => { if (activeBgTrackId === tr.id) { setActiveBgTrackId(null); } else { setActiveBgTrackId(tr.id); } }}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${activeBgTrackId === tr.id ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-neutral-800 text-neutral-400 border border-neutral-700 hover:text-neutral-200'}`}
                        >{activeBgTrackId === tr.id ? t('library.deselect') : t('library.select')}</button>
                      </div>
                    ))}
                  </div>
                ))
              )}
              {/* Local BG Files */}
              <div className="border-t border-neutral-800 pt-3 mt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-neutral-400 flex items-center gap-1.5">● {t('library.fromMyDevice')} <span className="px-1.5 py-0.5 bg-neutral-800 text-neutral-500 text-[9px] rounded-full">{t('library.sessionOnly')}</span></span>
                  {localFiles.background.length > 0 && <button onClick={() => handleClearLocalFiles("background")} className="text-[10px] text-neutral-500 hover:text-red-400 transition-colors">{t('library.clearAll')}</button>}
                </div>
                {localFiles.background.map(f => (
                  <div key={f.id} className="flex items-center gap-2 py-1.5 border-b border-neutral-800/40">
                    <span className="text-xs text-neutral-300 truncate flex-1">{f.name}</span>
                    <button onClick={() => { if (activeBgLocalUrl === f.objectUrl) { setActiveBgLocalUrl(null); } else { setActiveBgLocalUrl(f.objectUrl); } }}
                      className={`px-2 py-0.5 text-[10px] rounded-lg font-medium ${activeBgLocalUrl === f.objectUrl ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-neutral-800 text-neutral-400 border border-neutral-700'}`}
                    >{activeBgLocalUrl === f.objectUrl ? `✓ ${t('library.activeBg')}` : t('library.playAsBg')}</button>
                    <button onClick={() => handleRemoveLocalFile("background", f.id)} className="text-neutral-600 hover:text-red-400 text-sm">✕</button>
                    <audio controls src={f.objectUrl} className="h-6 w-24 opacity-60" />
                  </div>
                ))}
                <label className="mt-2 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dashed border-neutral-700 bg-neutral-900/40 text-xs text-neutral-500 hover:text-neutral-300 hover:border-neutral-500 cursor-pointer transition-all">
                  + {t('library.selectAudioFile')}
                  <input type="file" accept="audio/*" multiple className="hidden" onChange={e => { if (e.target.files?.[0]) handleLocalFilePick("background", e.target.files); e.target.value = ''; }} />
                </label>
              </div>
            </div>
          )}

          {/* ── Songs Tab Content ── */}
          {activeMediaTab === "songs" && (
            <div className="space-y-3">
              <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg px-3 py-2 text-[10px] text-cyan-300">
                {MEDIA_POLICY.SONG.label} — {isVoiceLive ? MEDIA_POLICY.SONG.waitLabel : t('library.readyOnMicCloseSongs')}
              </div>
              {songCategories.length === 0 && localFiles.songs.length === 0 ? (
                <p className="text-xs text-neutral-500 text-center py-4">{t('library.noSongs')}</p>
              ) : (
                songCategories.map(cat => (
                  <div key={cat.id} className="border border-neutral-800 rounded-xl overflow-hidden">
                    <button onClick={() => setExpandedCategories(prev => ({ ...prev, [cat.id]: !prev[cat.id] }))} className="w-full flex items-center justify-between px-3 py-2 bg-neutral-900/60 hover:bg-neutral-800/60 transition-colors">
                      <span className="text-xs font-medium text-neutral-300">{cat.name}</span>
                      <svg className={`w-3.5 h-3.5 text-neutral-500 transition-transform ${expandedCategories[cat.id] ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                    {expandedCategories[cat.id] && cat.tracks.map(tr => {
                      const inQueue = mediaQueue.some(q => q.trackId === tr.id && q.mediaType === "SONG");
                      return (
                        <div key={tr.id} className="flex items-center justify-between px-3 py-1.5 border-t border-neutral-800/50 hover:bg-neutral-800/30 transition-colors">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-xs text-neutral-300 truncate">{tr.title}</span>
                            {inQueue && <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">{t('queue.inQueue')}</span>}
                          </div>
                          <button
                            disabled={!isConnected}
                            onClick={() => handleSelectSong(tr.id, tr.title, cat.ownerType as "ADMIN"|"PRESENTER")}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${inQueue ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-neutral-800 text-neutral-400 border border-neutral-700 hover:text-neutral-200'} ${!isConnected ? 'opacity-40 cursor-not-allowed' : ''}`}
                          >{inQueue ? t('queue.cancelQueue') : t('queue.addToQueue')}</button>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
              {/* Local Song Files */}
              <div className="border-t border-neutral-800 pt-3 mt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-neutral-400 flex items-center gap-1.5">● {t('library.fromMyDevice')} <span className="px-1.5 py-0.5 bg-neutral-800 text-neutral-500 text-[9px] rounded-full">{t('library.sessionOnly')}</span></span>
                  {localFiles.songs.length > 0 && <button onClick={() => handleClearLocalFiles("songs")} className="text-[10px] text-neutral-500 hover:text-red-400 transition-colors">{t('library.clearAll')}</button>}
                </div>
                {localFiles.songs.length > 0 && (
                  <p className="text-[10px] text-amber-400/70 mb-2">⚠ {t('library.localFilesNote')}</p>
                )}
                {localFiles.songs.map(f => {
                  const inQ = mediaQueue.some(q => q.trackId === f.id && q.sourceType === "LOCAL_SESSION");
                  return (
                    <div key={f.id} className="flex items-center gap-2 py-1.5 border-b border-neutral-800/40">
                      <span className="text-xs text-neutral-300 truncate flex-1">{f.name}</span>
                      <button onClick={() => { if (inQ) { const qi = mediaQueue.find(q => q.trackId === f.id); if (qi) removeQueueItem(qi.id); } else enqueueLocalFile("songs", f); }}
                        className={`px-2 py-0.5 text-[10px] rounded-lg font-medium ${inQ ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-neutral-800 text-neutral-400 border border-neutral-700'}`}
                      >{inQ ? '✓' : `+${t('queue.waitingForMic')}`}</button>
                      <button onClick={() => handleRemoveLocalFileWithQueueCleanup("songs", f.id)} className="text-neutral-600 hover:text-red-400 text-sm">✕</button>
                      <audio controls src={f.objectUrl} className="h-6 w-24 opacity-60" />
                    </div>
                  );
                })}
                <label className="mt-2 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dashed border-neutral-700 bg-neutral-900/40 text-xs text-neutral-500 hover:text-neutral-300 hover:border-neutral-500 cursor-pointer transition-all">
                  + {t('library.selectAudioFile')}
                  <input type="file" accept="audio/*" multiple className="hidden" onChange={e => { if (e.target.files?.[0]) handleLocalFilePick("songs", e.target.files); e.target.value = ''; }} />
                </label>
              </div>
            </div>
          )}

          {/* ── Breaks Tab Content ── */}
          {activeMediaTab === "breaks" && (
            <div className="space-y-3">
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2 text-[10px] text-amber-300">
                {MEDIA_POLICY.BREAK.label} — {isVoiceLive ? MEDIA_POLICY.BREAK.waitLabel : t('library.readyOnMicCloseBreaks')}
              </div>
              {/* Admin shared breaks */}
              <div>
                <h3 className="text-xs font-semibold text-neutral-400 mb-2 flex items-center gap-1.5">{t('library.stationBreaks')} <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 text-[9px] rounded-full border border-amber-500/20">{t('library.admin')}</span></h3>
                {adminBreakCategories.length === 0 ? (
                  <p className="text-[10px] text-neutral-500 text-center py-2">{t('library.noStationBreaks')}</p>
                ) : adminBreakCategories.map(cat => (
                  <div key={cat.id} className="border border-neutral-800 rounded-xl overflow-hidden mb-2">
                    <button onClick={() => setExpandedCategories(prev => ({ ...prev, [cat.id]: !prev[cat.id] }))} className="w-full flex items-center justify-between px-3 py-2 bg-neutral-900/60 hover:bg-neutral-800/60 transition-colors">
                      <span className="text-xs font-medium text-neutral-300">{cat.name}</span>
                      <svg className={`w-3.5 h-3.5 text-neutral-500 transition-transform ${expandedCategories[cat.id] ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                    {expandedCategories[cat.id] && cat.tracks.map(tr => {
                      const inQueue = mediaQueue.some(q => q.trackId === tr.id && q.mediaType === "BREAK");
                      return (
                        <div key={tr.id} className="flex items-center justify-between px-3 py-1.5 border-t border-neutral-800/50 hover:bg-neutral-800/30 transition-colors">
                          <span className="text-xs text-neutral-300 truncate flex-1">{tr.title}</span>
                          <button disabled={!isConnected} onClick={() => { if (inQueue) { const qi = mediaQueue.find(q => q.trackId === tr.id && q.mediaType === "BREAK"); if (qi) removeQueueItem(qi.id); } else enqueueItem(tr.id, tr.title, "BREAK", "ADMIN_DB", "ADMIN"); }}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${inQueue ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-neutral-800 text-neutral-400 border border-neutral-700 hover:text-neutral-200'} ${!isConnected ? 'opacity-40 cursor-not-allowed' : ''}`}
                          >{inQueue ? `✓ ${t('queue.inQueue')}` : t('queue.addToQueue')}</button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              {/* Presenter breaks */}
              <div>
                <h3 className="text-xs font-semibold text-neutral-400 mb-2 flex items-center gap-1.5">{t('library.myBreaks')} <span className="px-1.5 py-0.5 bg-violet-500/10 text-violet-400 text-[9px] rounded-full border border-violet-500/20">{t('library.myLibrary')}</span></h3>
                {presenterBreakCategories.length === 0 ? (
                  <p className="text-[10px] text-neutral-500 text-center py-2">{t('library.noPresenterBreaks')}</p>
                ) : presenterBreakCategories.map(cat => (
                  <div key={cat.id} className="border border-neutral-800 rounded-xl overflow-hidden mb-2">
                    <button onClick={() => setExpandedCategories(prev => ({ ...prev, [cat.id]: !prev[cat.id] }))} className="w-full flex items-center justify-between px-3 py-2 bg-neutral-900/60 hover:bg-neutral-800/60 transition-colors">
                      <span className="text-xs font-medium text-neutral-300">{cat.name}</span>
                      <svg className={`w-3.5 h-3.5 text-neutral-500 transition-transform ${expandedCategories[cat.id] ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                    {expandedCategories[cat.id] && cat.tracks.map(tr => {
                      const inQueue = mediaQueue.some(q => q.trackId === tr.id && q.mediaType === "BREAK");
                      return (
                        <div key={tr.id} className="flex items-center justify-between px-3 py-1.5 border-t border-neutral-800/50 hover:bg-neutral-800/30 transition-colors">
                          <span className="text-xs text-neutral-300 truncate flex-1">{tr.title}</span>
                          <button disabled={!isConnected} onClick={() => { if (inQueue) { const qi = mediaQueue.find(q => q.trackId === tr.id && q.mediaType === "BREAK"); if (qi) removeQueueItem(qi.id); } else enqueueItem(tr.id, tr.title, "BREAK", "PRESENTER_DB", "PRESENTER"); }}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${inQueue ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-neutral-800 text-neutral-400 border border-neutral-700 hover:text-neutral-200'} ${!isConnected ? 'opacity-40 cursor-not-allowed' : ''}`}
                          >{inQueue ? `✓ ${t('queue.addAgain')}` : t('queue.addToQueue')}</button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              <PresenterUploadWidget mediaType="BREAK" onUploaded={(track, category) => {
                setLocalPresenterBreakCats(prev => {
                  const existing = prev.find(c => c.id === category.id);
                  if (existing) return prev.map(c => c.id === category.id ? { ...c, tracks: [...c.tracks, track] } : c);
                  return [...prev, { ...category, tracks: [track] }];
                });
              }} />
              {/* Local break files */}
              <div className="border-t border-neutral-800 pt-3 mt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-neutral-400 flex items-center gap-1.5">{t('library.myBreaksFromDevice')} <span className="px-1.5 py-0.5 bg-neutral-800 text-neutral-500 text-[9px] rounded-full">{t('library.sessionOnly')}</span></span>
                  {localFiles.breaks.length > 0 && <button onClick={() => handleClearLocalFiles("breaks")} className="text-[10px] text-neutral-500 hover:text-red-400 transition-colors">{t('library.clearAll')}</button>}
                </div>
                {localFiles.breaks.map(f => {
                  const inQ = mediaQueue.some(q => q.trackId === f.id && q.sourceType === "LOCAL_SESSION");
                  return (
                    <div key={f.id} className="flex items-center gap-2 py-1.5 border-b border-neutral-800/40">
                      <span className="text-xs text-neutral-300 truncate flex-1">{f.name}</span>
                      <button onClick={() => { if (inQ) { const qi = mediaQueue.find(q => q.trackId === f.id); if (qi) removeQueueItem(qi.id); } else enqueueLocalFile("breaks", f); }}
                        className={`px-2 py-0.5 text-[10px] rounded-lg font-medium ${inQ ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-neutral-800 text-neutral-400 border border-neutral-700'}`}
                      >{inQ ? '✓' : `+${t('queue.waitingForMic')}`}</button>
                      <button onClick={() => handleRemoveLocalFileWithQueueCleanup("breaks", f.id)} className="text-neutral-600 hover:text-red-400 text-sm">✕</button>
                      <audio controls src={f.objectUrl} className="h-6 w-24 opacity-60" />
                    </div>
                  );
                })}
                <label className="mt-2 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dashed border-neutral-700 bg-neutral-900/40 text-xs text-neutral-500 hover:text-neutral-300 hover:border-neutral-500 cursor-pointer transition-all">
                  + {t('library.selectBreakFile')}
                  <input type="file" accept="audio/*" multiple className="hidden" onChange={e => { if (e.target.files?.[0]) handleLocalFilePick("breaks", e.target.files); e.target.value = ''; }} />
                </label>
              </div>
            </div>
          )}

          {/* ── Ads Tab Content ── */}
          {activeMediaTab === "ads" && (
            <div className="space-y-3">
              <div className="bg-rose-500/5 border border-rose-500/20 rounded-lg px-3 py-2 text-[10px] text-rose-300">
                {MEDIA_POLICY.AD.label} — {isVoiceLive ? MEDIA_POLICY.AD.waitLabel : t('library.readyOnMicCloseAds')}
              </div>
              {/* Admin shared ads */}
              <div>
                <h3 className="text-xs font-semibold text-neutral-400 mb-2 flex items-center gap-1.5">{t('library.stationAds')} <span className="px-1.5 py-0.5 bg-rose-500/10 text-rose-400 text-[9px] rounded-full border border-rose-500/20">{t('library.admin')}</span></h3>
                {adminAdCategories.length === 0 ? (
                  <p className="text-[10px] text-neutral-500 text-center py-2">{t('library.noStationAds')}</p>
                ) : adminAdCategories.map(cat => (
                  <div key={cat.id} className="border border-neutral-800 rounded-xl overflow-hidden mb-2">
                    <button onClick={() => setExpandedCategories(prev => ({ ...prev, [cat.id]: !prev[cat.id] }))} className="w-full flex items-center justify-between px-3 py-2 bg-neutral-900/60 hover:bg-neutral-800/60 transition-colors">
                      <span className="text-xs font-medium text-neutral-300">{cat.name}</span>
                      <svg className={`w-3.5 h-3.5 text-neutral-500 transition-transform ${expandedCategories[cat.id] ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                    {expandedCategories[cat.id] && cat.tracks.map(tr => {
                      const inQueue = mediaQueue.some(q => q.trackId === tr.id && q.mediaType === "AD");
                      return (
                        <div key={tr.id} className="flex items-center justify-between px-3 py-1.5 border-t border-neutral-800/50 hover:bg-neutral-800/30 transition-colors">
                          <span className="text-xs text-neutral-300 truncate flex-1">{tr.title}</span>
                          <button disabled={!isConnected} onClick={() => { if (inQueue) { const qi = mediaQueue.find(q => q.trackId === tr.id && q.mediaType === "AD"); if (qi) removeQueueItem(qi.id); } else enqueueItem(tr.id, tr.title, "AD", "ADMIN_DB", "ADMIN"); }}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${inQueue ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-neutral-800 text-neutral-400 border border-neutral-700 hover:text-neutral-200'} ${!isConnected ? 'opacity-40 cursor-not-allowed' : ''}`}
                          >{inQueue ? `✓ ${t('queue.addAgain')}` : t('queue.addToQueue')}</button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              {/* Presenter ads */}
              <div>
                <h3 className="text-xs font-semibold text-neutral-400 mb-2 flex items-center gap-1.5">{t('library.myAds')} <span className="px-1.5 py-0.5 bg-violet-500/10 text-violet-400 text-[9px] rounded-full border border-violet-500/20">{t('library.myLibrary')}</span></h3>
                {presenterAdCategories.length === 0 ? (
                  <p className="text-[10px] text-neutral-500 text-center py-2">{t('library.noPresenterAds')}</p>
                ) : presenterAdCategories.map(cat => (
                  <div key={cat.id} className="border border-neutral-800 rounded-xl overflow-hidden mb-2">
                    <button onClick={() => setExpandedCategories(prev => ({ ...prev, [cat.id]: !prev[cat.id] }))} className="w-full flex items-center justify-between px-3 py-2 bg-neutral-900/60 hover:bg-neutral-800/60 transition-colors">
                      <span className="text-xs font-medium text-neutral-300">{cat.name}</span>
                      <svg className={`w-3.5 h-3.5 text-neutral-500 transition-transform ${expandedCategories[cat.id] ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                    {expandedCategories[cat.id] && cat.tracks.map(tr => {
                      const inQueue = mediaQueue.some(q => q.trackId === tr.id && q.mediaType === "AD");
                      return (
                        <div key={tr.id} className="flex items-center justify-between px-3 py-1.5 border-t border-neutral-800/50 hover:bg-neutral-800/30 transition-colors">
                          <span className="text-xs text-neutral-300 truncate flex-1">{tr.title}</span>
                          <button disabled={!isConnected} onClick={() => { if (inQueue) { const qi = mediaQueue.find(q => q.trackId === tr.id && q.mediaType === "AD"); if (qi) removeQueueItem(qi.id); } else enqueueItem(tr.id, tr.title, "AD", "PRESENTER_DB", "PRESENTER"); }}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${inQueue ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-neutral-800 text-neutral-400 border border-neutral-700 hover:text-neutral-200'} ${!isConnected ? 'opacity-40 cursor-not-allowed' : ''}`}
                          >{inQueue ? `✓ ${t('queue.addAgain')}` : t('queue.addToQueue')}</button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              <PresenterUploadWidget mediaType="AD" onUploaded={(track, category) => {
                setLocalPresenterAdCats(prev => {
                  const existing = prev.find(c => c.id === category.id);
                  if (existing) return prev.map(c => c.id === category.id ? { ...c, tracks: [...c.tracks, track] } : c);
                  return [...prev, { ...category, tracks: [track] }];
                });
              }} />
              {/* Local ad files */}
              <div className="border-t border-neutral-800 pt-3 mt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-neutral-400 flex items-center gap-1.5">{t('library.myAdsFromDevice')} <span className="px-1.5 py-0.5 bg-neutral-800 text-neutral-500 text-[9px] rounded-full">{t('library.sessionOnly')}</span></span>
                  {localFiles.ads.length > 0 && <button onClick={() => handleClearLocalFiles("ads")} className="text-[10px] text-neutral-500 hover:text-red-400 transition-colors">{t('library.clearAll')}</button>}
                </div>
                {localFiles.ads.map(f => {
                  const inQ = mediaQueue.some(q => q.trackId === f.id && q.sourceType === "LOCAL_SESSION");
                  return (
                    <div key={f.id} className="flex items-center gap-2 py-1.5 border-b border-neutral-800/40">
                      <span className="text-xs text-neutral-300 truncate flex-1">{f.name}</span>
                      <button onClick={() => { if (inQ) { const qi = mediaQueue.find(q => q.trackId === f.id); if (qi) removeQueueItem(qi.id); } else enqueueLocalFile("ads", f); }}
                        className={`px-2 py-0.5 text-[10px] rounded-lg font-medium ${inQ ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-neutral-800 text-neutral-400 border border-neutral-700'}`}
                      >{inQ ? '✓' : `+${t('queue.waitingForMic')}`}</button>
                      <button onClick={() => handleRemoveLocalFileWithQueueCleanup("ads", f.id)} className="text-neutral-600 hover:text-red-400 text-sm">✕</button>
                      <audio controls src={f.objectUrl} className="h-6 w-24 opacity-60" />
                    </div>
                  );
                })}
                <label className="mt-2 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dashed border-neutral-700 bg-neutral-900/40 text-xs text-neutral-500 hover:text-neutral-300 hover:border-neutral-500 cursor-pointer transition-all">
                  + {t('library.selectAdFile')}
                  <input type="file" accept="audio/*" multiple className="hidden" onChange={e => { if (e.target.files?.[0]) handleLocalFilePick("ads", e.target.files); e.target.value = ''; }} />
                </label>
              </div>
            </div>
          )}
        </section>

        {/* ─────────────────────────────────────────────────────────────────────
            CENTER COLUMN — Mixer & Controls
           ───────────────────────────────────────────────────────────────────── */}
        <section className={`${mobileTab === 'mixer' ? 'block' : 'hidden'} lg:block lg:overflow-y-auto lg:max-h-full space-y-3`}>

          {/* Now Playing Pill */}
          {(() => {
            const playingItem = playingQueueId ? mediaQueue.find(q => q.id === playingQueueId) : null;
            const pausedItem  = pausedForMicRef.current;
            let label = '', typeTag = '', stateColor = 'text-neutral-400', dotColor = 'bg-neutral-600';
            if (isVoiceLive && pausedItem) { label = t('nowPlaying.micLivePaused', { title: pausedItem.title }); typeTag = t('nowPlaying.micSlash', { type: pausedItem.mediaType === 'SONG' ? t('mediaType.song') : pausedItem.mediaType === 'BREAK' ? t('mediaType.break') : t('mediaType.ad') }); stateColor = 'text-amber-400'; dotColor = 'bg-amber-400 animate-pulse'; }
            else if (isVoiceLive && activeBgTrack) { label = t('nowPlaying.micLiveBg', { title: activeBgTrack }); typeTag = t('nowPlaying.micPlusBg'); stateColor = 'text-red-400'; dotColor = 'bg-red-500 animate-pulse'; }
            else if (isVoiceLive) { label = t('nowPlaying.micLive'); typeTag = t('nowPlaying.mic'); stateColor = 'text-red-400'; dotColor = 'bg-red-500 animate-pulse'; }
            else if (playingItem) { const typeAr = playingItem.mediaType === 'SONG' ? t('mediaType.song') : playingItem.mediaType === 'BREAK' ? t('mediaType.break') : t('mediaType.ad'); label = playingItem.title; typeTag = t('nowPlaying.nowPlayingType', { type: typeAr }); stateColor = 'text-emerald-400'; dotColor = 'bg-emerald-500 animate-pulse'; }
            else if (activeBgTrack) { label = activeBgTrack; typeTag = t('mediaType.background'); stateColor = 'text-indigo-400'; dotColor = 'bg-indigo-500'; }
            else { label = t('nowPlaying.noBroadcast'); typeTag = '—'; stateColor = 'text-neutral-600'; dotColor = 'bg-neutral-700'; }
            return isConnected ? (
              <div className="flex items-center gap-3 bg-white/[0.03] backdrop-blur-lg border border-white/10 rounded-2xl px-4 py-3">
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotColor}`} />
                <div className="flex flex-col min-w-0">
                  <span className={`text-sm font-semibold truncate ${stateColor}`}>{label}</span>
                  <span className="text-[10px] text-neutral-600 mt-0.5">{typeTag}</span>
                </div>
              </div>
            ) : null;
          })()}

          {/* Connection Status Cards */}
          <div className="bg-white/[0.03] backdrop-blur-lg border border-white/10 rounded-2xl p-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {/* Radio status */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold ${
                shoutcastStatus === 'on_air' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' :
                shoutcastStatus === 'connecting' ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' :
                shoutcastStatus === 'radio_error' ? 'bg-red-500/10 border-red-500/30 text-red-300' :
                isConnected ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300' : 'bg-neutral-800/50 border-neutral-700 text-neutral-500'
              }`}>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  shoutcastStatus === 'on_air' ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]' :
                  shoutcastStatus === 'connecting' ? 'bg-amber-400 animate-pulse' :
                  shoutcastStatus === 'radio_error' ? 'bg-red-500' :
                  isConnected ? 'bg-indigo-400' : 'bg-neutral-600'
                }`} />
                <div>
                  <p className="text-[10px] text-neutral-500 leading-none mb-0.5">{t('radio.statusLabel')}</p>
                  <p className="leading-none">{shoutcastStatus === 'on_air' ? t('radio.onAir') : shoutcastStatus === 'connecting' ? t('radio.connecting') : shoutcastStatus === 'radio_error' ? t('radio.connectionFailed') : (shoutcastStatus === 'ws_connected' || shoutcastStatus === 'recording' || shoutcastStatus === 'recording_only') ? t('radio.connectedToStudio') : isConnected ? t('radio.connected') : t('radio.notConnected')}</p>
                </div>
              </div>
              {/* Recording status */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold ${
                (shoutcastStatus === 'recording' || shoutcastStatus === 'on_air' || shoutcastStatus === 'radio_error' || shoutcastStatus === 'recording_only') ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300' :
                isConnected ? 'bg-neutral-800/50 border-neutral-700 text-neutral-400' : 'bg-neutral-800/50 border-neutral-700 text-neutral-500'
              }`}>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${(shoutcastStatus === 'recording' || shoutcastStatus === 'on_air' || shoutcastStatus === 'radio_error' || shoutcastStatus === 'recording_only') ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.7)]' : 'bg-neutral-600'}`} />
                <div>
                  <p className="text-[10px] text-neutral-500 leading-none mb-0.5">{t('recording.statusLabel')}</p>
                  <p className="leading-none">{(shoutcastStatus === 'recording' || shoutcastStatus === 'on_air' || shoutcastStatus === 'radio_error' || shoutcastStatus === 'recording_only') ? t('recording.sessionRecording') : isConnected ? t('recording.waitingForAudio') : t('recording.noRecording')}</p>
                </div>
              </div>
            </div>
            {/* Tech indicators row */}
            <div className="flex flex-wrap items-center gap-2 text-[10px]">
              <span className={`px-2 py-0.5 rounded-lg border font-mono ${isConnected ? 'bg-neutral-950 border-neutral-800 text-neutral-400' : 'bg-neutral-900 border-neutral-800 text-neutral-600'}`}>64 kbps</span>
              <span className={`px-2 py-0.5 rounded-lg border flex items-center gap-1 ${isConnected ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-neutral-900 border-neutral-800 text-neutral-600'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-neutral-600'}`}></span>{t('status.quality')}
              </span>
              <span className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${heartbeatStatus === 'active' ? 'bg-red-500 animate-pulse' : 'bg-neutral-600'}`}></span>
                <span className={heartbeatStatus === 'active' ? 'text-red-400' : 'text-neutral-500'}>{t('status.audioSending')}: {heartbeatStatus === 'active' ? t('status.active') : t('status.stopped')}</span>
              </span>
              <span className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${audioBackendStatus === 'connected' ? 'bg-emerald-500' : 'bg-neutral-600'}`}></span>
                <span className={audioBackendStatus === 'connected' ? 'text-emerald-400' : 'text-neutral-500'}>{t('status.backend')}: {audioBackendStatus === 'connected' ? t('radio.connected') : t('radio.notConnected')}</span>
              </span>
            </div>
          </div>

          {/* Mic Error */}
          {micError && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl px-4 py-3 text-center">
              {micError}
            </div>
          )}

          {/* VU Meter */}
          <div className={`flex items-center justify-center gap-1.5 h-8 w-full transition-opacity duration-300 ${isConnected ? 'opacity-100' : 'opacity-30'}`}>
            {[...Array(10)].map((_, i) => {
              const posWeight = 1 - Math.abs(i - 4.5) / 4.5;
              const barHeight = isVoiceLive ? Math.max(0.08, volumeLevel * posWeight + (Math.random() * 0.08 * volumeLevel)) : 0;
              return (
                <div key={i} className={`w-2 rounded-full transition-all ${isVoiceLive ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 'bg-neutral-800'}`}
                  style={isVoiceLive ? { height: `${Math.max(4, barHeight * 32)}px`, animation: `soundBars ${0.2 + Math.random() * 0.3}s ease-in-out infinite alternate` } : { height: '4px' }} />
              );
            })}
          </div>

          {/* ── 3 Fader Strips ── */}
          <div className="space-y-2">
            {/* Mic Fader */}
            <div className="bg-white/[0.03] backdrop-blur-lg border border-red-500/20 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-red-300">🎤 {t('faders.microphone')}</span>
                <span className={`text-xs font-medium ${isMicOpen ? 'text-red-400' : 'text-neutral-500'}`}>{isMicOpen ? t('mic.open') : t('mic.closed')}</span>
              </div>
              <p className="text-[10px] text-neutral-500">{!isConnected ? t('mic.notConnected') : isMicOpen ? t('mic.micOpenLive') : t('mic.pressToStart')}</p>
            </div>

            {/* Background Fader */}
            <div className="bg-white/[0.03] backdrop-blur-lg border border-blue-500/20 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-blue-300">🎵 {t('faders.background')}</span>
                <span className="text-xs font-mono text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">{bgVolume}%{isVoiceLive ? ` (${t('faders.ducked')})` : ''}</span>
              </div>
              <input type="range" min={0} max={100} value={bgVolume} onChange={e => setBgVolume(Number(e.target.value))} className="w-full h-1.5 accent-blue-400 cursor-pointer" />
              <p className="text-[10px] text-neutral-500 mt-1 truncate">{activeBgTrack || t('faders.noBg')}</p>
            </div>

            {/* Guest / Tab Audio Source */}
            <div className="flex items-center justify-between p-3 bg-neutral-900/60 rounded-xl border border-neutral-800">
              <span className="text-xs font-semibold text-neutral-400">{t('tabAudioTitle') || 'Guest / Tab Audio'}</span>
              <div className="flex items-center gap-2">
                {isTabAudioActive && (
                  <button onClick={() => setIsGuestOnAir(!isGuestOnAir)} className={`text-[10px] px-2 py-1 rounded-lg border font-medium transition-colors flex items-center gap-1 ${isGuestOnAir ? 'bg-red-500/20 border-red-500/50 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.4)]' : 'bg-neutral-800 border-neutral-600 text-neutral-400 hover:text-neutral-200'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${isGuestOnAir ? 'bg-red-400 animate-pulse' : 'bg-neutral-500'}`}></div>
                    {isGuestOnAir ? 'GUEST ON AIR' : 'GUEST OFF AIR'}
                  </button>
                )}
                <button onClick={isTabAudioActive ? stopTabAudio : startTabAudio} className={`text-[10px] px-2 py-1 rounded-lg border font-medium transition-colors ${isTabAudioActive ? 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-700' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'}`}>
                  {isTabAudioActive ? 'Stop' : (t('startTabCapture') || 'Start Tab Capture')}
                </button>
              </div>
            </div>

            {/* Queue Fader */}
            <div className="bg-white/[0.03] backdrop-blur-lg border border-green-500/20 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-green-300">📋 {t('queue.title')}</span>
                <span className="text-xs font-mono text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">{queueVolume}%</span>
              </div>
              <input type="range" min={0} max={100} value={queueVolume} onChange={e => setQueueVolume(Number(e.target.value))} className="w-full h-1.5 accent-green-400 cursor-pointer" />
              <p className="text-[10px] text-neutral-500 mt-1">{t('faders.queueAppliesTo')}</p>
            </div>
          </div>

          {/* ── Monitoring ── (always available, even before connecting) */}
          <div className="bg-white/[0.03] backdrop-blur-lg border border-white/10 rounded-2xl p-3 space-y-2">
              <button onClick={toggleMonitoring} className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all ${isMonitoring ? 'bg-amber-500/15 border-amber-500/40 text-amber-400' : 'bg-neutral-900/50 border-neutral-800 text-neutral-500 hover:text-neutral-300'}`}>
                🎧 {t('monitor.title')}: {isMonitoring ? 'ON' : 'OFF'}
              </button>
              <div className={`flex flex-col gap-1.5 bg-neutral-900/40 border rounded-xl px-3 py-2.5 transition-opacity ${isMonitoring ? 'border-amber-500/20 opacity-100' : 'border-neutral-800 opacity-40 pointer-events-none'}`}>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-amber-300">{t('monitor.volume')}</label>
                  <span className="text-xs font-mono text-amber-400">{Math.round(monitorVolume * 100)}%</span>
                </div>
                <input type="range" min={0} max={1} step={0.05} value={monitorVolume}
                  onChange={e => { const v = parseFloat(e.target.value); setMonitorVolume(v); if (isMonitoring && monitorGainRef.current) monitorGainRef.current.gain.value = v; }}
                  className="w-full h-1.5 accent-amber-400 cursor-pointer" />
              </div>
              {isMonitoring && (
                <>
                  {/* Output device selector */}
                  <div className="flex flex-col gap-1.5 bg-neutral-900/40 border border-amber-500/20 rounded-xl px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-amber-300">{t('monitor.outputDevice')}</label>
                      <button onClick={refreshAudioOutputDevices} className="text-[10px] px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 transition-colors">↻ {t('monitor.refresh')}</button>
                    </div>
                    <select value={selectedOutputDeviceId} onChange={e => switchOutputDevice(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500/60 cursor-pointer">
                      {audioOutputDevices.length === 0 && <option value="default">{t('monitor.defaultOutput')}</option>}
                      {audioOutputDevices.map((dev, i) => (
                        <option key={dev.deviceId} value={dev.deviceId}>
                          {dev.label || `${t('monitor.speakerLabel', { index: i + 1 })}${dev.deviceId === 'default' ? ` ${t('monitor.speakerDefault')}` : ''}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] px-3 py-1.5 rounded-lg text-center justify-center">⚠️ {t('monitor.headphoneWarning')}</div>
                </>
              )}
          </div>

          {/* ── Mic Source ── */}
          <div className="bg-white/[0.03] backdrop-blur-lg border border-white/10 rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-400">{t('mic.source')}</span>
              <button onClick={refreshAudioInputDevices} className="text-[10px] px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 transition-colors">↻ {t('mic.refreshDevices')}</button>
            </div>
            <select value={selectedMicDeviceId} onChange={e => switchMicDevice(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500/60 cursor-pointer">
              {audioInputDevices.length === 0 && <option value="">{t('mic.defaultDevice')}</option>}
              {audioInputDevices.map((dev, i) => <option key={dev.deviceId} value={dev.deviceId}>{dev.label || `${t('mic.deviceLabel', { index: i + 1 })}${dev.deviceId === 'default' ? ` ${t('mic.deviceDefault')}` : ''}`}</option>)}
            </select>
            {micDeviceError && <div className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2.5 py-1.5 rounded-lg">⚠️ {micDeviceError}</div>}
            <p className="text-[9px] text-neutral-600 text-center">{t('mic.devicePermission')}</p>
          </div>

          {/* ── Guest / Tab Audio Source ── */}
          <div className="bg-white/[0.03] backdrop-blur-lg border border-white/10 rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-400">{t('tabAudioTitle') || 'Guest / Tab Audio'}</span>
              <div className="flex items-center gap-2">
                {isTabAudioActive && (
                  <button onClick={() => setIsGuestOnAir(!isGuestOnAir)} className={`text-[10px] px-2 py-1 rounded-lg border font-medium transition-colors flex items-center gap-1 ${isGuestOnAir ? 'bg-red-500/20 border-red-500/50 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.4)]' : 'bg-neutral-800 border-neutral-600 text-neutral-400 hover:text-neutral-200'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${isGuestOnAir ? 'bg-red-400 animate-pulse' : 'bg-neutral-500'}`}></div>
                    {isGuestOnAir ? 'GUEST ON AIR' : 'GUEST OFF AIR'}
                  </button>
                )}
                <button onClick={isTabAudioActive ? stopTabAudio : startTabAudio} className={`text-[10px] px-2 py-1 rounded-lg border font-medium transition-colors ${isTabAudioActive ? 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-700' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'}`}>
                  {isTabAudioActive ? 'Stop' : (t('startTabCapture') || 'Start Tab Capture')}
                </button>
              </div>
            </div>
            
            <div className={`flex flex-col gap-1.5 bg-neutral-900/40 border rounded-xl px-3 py-2.5 transition-opacity ${isTabAudioActive ? 'border-emerald-500/20 opacity-100' : 'border-neutral-800 opacity-40 pointer-events-none'}`}>
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-emerald-300">{t('tabAudioVolume') || 'Volume'}</label>
                <span className="text-xs font-mono text-emerald-400">{tabAudioVolume}%</span>
              </div>
              <input type="range" min={0} max={100} value={tabAudioVolume}
                onChange={e => setTabAudioVolume(Number(e.target.value))}
                className="w-full h-1.5 accent-emerald-400 cursor-pointer" />
            </div>
            <p className="text-[9px] text-neutral-500 text-center">{t('tabAudioHint') || 'Capture audio from a browser tab (e.g. Google Meet)'}</p>
          </div>

          {/* [DIAG] Test */}
          {isConnected && (
            <button id="diag-test-file-mixer" onClick={testFileMixer} className="w-full px-4 py-2 rounded-xl text-xs font-bold border-2 border-yellow-500/40 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/20 transition-all">🧪 TEST FILE TO MIXER</button>
          )}

          {/* Status Card */}
          <div className="bg-white/[0.03] backdrop-blur-lg border border-white/10 rounded-2xl p-3 space-y-2">
            <h3 className="text-sm font-semibold text-neutral-300 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              {t('statusCard.title')}
            </h3>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between"><span className="text-neutral-500">{t('statusCard.readyToPlay')}</span><span className="text-neutral-300 truncate max-w-[200px]">{(() => { const readyItem = mediaQueue.find(q => q.status === 'READY'); return readyItem ? (isVoiceLive ? t('statusCard.waitingMicForTitle', { title: readyItem.title }) : readyItem.title) : t('queue.noSongsInQueue'); })()}</span></div>
              <div className="flex items-center justify-between"><span className="text-neutral-500">{t('statusCard.queueLabel')}</span><span className="text-neutral-300">{mediaQueue.length > 0 ? t('queue.itemsInQueue', { count: mediaQueue.length }) : t('queue.emptyQueue')}</span></div>
              <div className="flex items-center justify-between"><span className="text-neutral-500">{t('statusCard.bgLabel')}</span><span className="text-neutral-300 truncate max-w-[200px]">{activeBgTrack || t('statusCard.noBgMusic')}</span></div>
            </div>
            {isConnected && (
              <p className="text-[10px] text-neutral-500">{isVoiceLive ? t('queue.micOpenWaiting') : t('queue.micClosedReady')}</p>
            )}
            {!isConnected && <p className="text-[10px] text-neutral-500">{t('connection.waitingForServer')}</p>}
            {isConnected && !isVoiceLive && mediaQueue.some(q => q.status === 'READY' && q.mediaType === 'SONG') && (
              <button onClick={handleShuffle} className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-[10px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
                {t('queue.shuffleFromCategory')}
              </button>
            )}
          </div>

          {/* ── DSP Panel ── */}
          <DspPanel
            currentParams={dspParams}
            isMicOpen={isVoiceLive}
            onParamsChange={(p: DspParams) => { setDspParams(p); applyDspParams(p); }}
            bypassed={dspBypassed}
            onBypassToggle={() => { setDspBypassed(b => !b); dspBypassRef.current = !dspBypassRef.current; }}
          />
        </section>

        {/* ─────────────────────────────────────────────────────────────────────
            LEFT COLUMN — Queue + SFX
           ───────────────────────────────────────────────────────────────────── */}
        <div className="hidden lg:flex lg:flex-col lg:gap-3 lg:overflow-y-auto lg:max-h-full">

          {/* ── Queue Panel ── */}
          <section className="bg-white/[0.03] backdrop-blur-lg border border-white/10 rounded-2xl p-3 flex-1">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-neutral-300 flex items-center gap-2">
                📋 {t('queue.title')}
                {mediaQueue.length > 0 && <span className="px-2 py-0.5 bg-violet-500/20 text-violet-400 text-[10px] rounded-full">{mediaQueue.length}</span>}
              </h2>
              <div className="flex items-center gap-2">
                <button onClick={() => setAutoQueue(v => !v)} className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${autoQueue ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-neutral-800 text-neutral-500 border border-neutral-700'}`}>
                  ⏭ {autoQueue ? t('queue.auto') : t('queue.manual')}
                </button>
                {mediaQueue.length > 0 && <button onClick={() => setMediaQueue([])} className="px-2 py-1 rounded-lg text-[10px] text-neutral-500 hover:text-red-400 bg-neutral-800 border border-neutral-700 transition-colors">{t('queue.clear')}</button>}
              </div>
            </div>
            <p className="text-[10px] text-neutral-600 mb-2">⚠ {t('queue.queueNote')}</p>

            {mediaQueue.length === 0 ? (
              <p className="text-xs text-neutral-600 text-center py-6">{t('queue.empty')}</p>
            ) : (
              <div className="space-y-1.5">
                {mediaQueue.map((item, idx) => {
                  const isPlaying = playingQueueId === item.id;
                  const isPausedManually = isPaused && pausedQueueItemRef.current?.id === item.id;
                  const typeLabel = item.mediaType === 'SONG' ? t('mediaType.song') : item.mediaType === 'BREAK' ? t('mediaType.break') : t('mediaType.ad');
                  const sourceLabel = item.sourceType === 'ADMIN_DB' ? t('sourceType.adminDb') : item.sourceType === 'PRESENTER_DB' ? t('sourceType.presenterDb') : t('sourceType.localDevice');
                  return (
                    <div key={item.id} 
                      draggable={!isPlaying}
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, idx)}
                      className={`rounded-xl border p-2.5 transition-all ${isPlaying ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-neutral-900/30 border-neutral-800 hover:bg-neutral-800/30'} ${draggedQueueIndex === idx ? 'opacity-50 scale-95 border-emerald-500/50' : ''} ${dragOverQueueIndex === idx && draggedQueueIndex !== idx ? 'border-emerald-400 bg-emerald-500/10 -translate-y-1 shadow-[0_4px_10px_rgba(52,211,153,0.1)]' : ''} ${!isPlaying ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        {/* Drag Handle & Reorder */}
                        <div className="flex flex-col gap-0.5 items-center justify-center">
                          <button disabled={idx === 0} onClick={() => { const q = [...mediaQueue]; [q[idx-1], q[idx]] = [q[idx], q[idx-1]]; setMediaQueue(q); }} className="text-[10px] text-neutral-600 hover:text-neutral-300 disabled:opacity-20 cursor-pointer">↑</button>
                          <svg className="w-3 h-3 text-neutral-600 cursor-grab active:cursor-grabbing" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8h16M4 16h16" /></svg>
                          <button disabled={idx === mediaQueue.length - 1} onClick={() => { const q = [...mediaQueue]; [q[idx], q[idx+1]] = [q[idx+1], q[idx]]; setMediaQueue(q); }} className="text-[10px] text-neutral-600 hover:text-neutral-300 disabled:opacity-20 cursor-pointer">↓</button>
                        </div>
                        <span className="text-[10px] text-neutral-600 font-mono">#{idx+1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-neutral-200 truncate">{item.title}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-neutral-800 text-neutral-400">{typeLabel}</span>
                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-neutral-800 text-neutral-500">{sourceLabel}</span>
                            {item.status === 'READY' && <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{t('queue.ready')}</span>}
                            {item.status === 'READY_AFTER_MIC_CLOSE' && <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20">{t('queue.waitingMicClose')}</span>}
                            {item.status === 'PREVIEW_ONLY' && <span className="px-1.5 py-0.5 rounded text-[9px] bg-neutral-700 text-neutral-400">{t('queue.previewOnly')}</span>}
                            {isPlaying && <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/20 text-emerald-400 animate-pulse">{t('queue.nowPlaying')}</span>}
                          </div>
                        </div>
                        {/* Play/Pause/Resume */}
                        {isPlaying ? (
                          <button onClick={() => pauseQueueItem()} className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/25 transition-colors">⏸ {t('queue.pause')}</button>
                        ) : isPausedManually ? (
                          <button onClick={() => playQueueItem(item)} className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 transition-colors">▶ {t('queue.resume')}</button>
                        ) : isVoiceLive ? (
                          <button disabled className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-neutral-800 text-neutral-500 border border-neutral-700 opacity-50 cursor-not-allowed">▶ {t('queue.waitingForMic')}</button>
                        ) : item.status === 'READY' || item.status === 'PREVIEW_ONLY' ? (
                          <button onClick={() => playQueueItem(item)} className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 transition-colors">▶ {t('queue.play')}</button>
                        ) : null}
                        <button onClick={() => removeQueueItem(item.id)} title={t('queue.removeFromQueue')} className="w-8 h-8 flex items-center justify-center rounded-md text-neutral-600 hover:text-red-400 hover:bg-red-500/10 transition-colors text-sm">✕</button>
                      </div>
                      {/* Seek bar */}
                      {playbackProgress && playbackProgress.id === item.id && (
                        <div className="w-full flex items-center gap-1.5 mt-1.5">
                          <span className="text-[9px] text-neutral-500 tabular-nums w-7 text-left">{Math.floor(playbackProgress.currentTime / 60)}:{String(Math.floor(playbackProgress.currentTime % 60)).padStart(2,'0')}</span>
                          <input type="range" min={0} max={playbackProgress.duration || 0} step={0.5} value={playbackProgress.currentTime}
                            onChange={e => { const t = parseFloat(e.target.value); if (currentlyPlayingRef.current) currentlyPlayingRef.current.currentTime = t; else if (pausedQueueAudioRef.current) pausedQueueAudioRef.current.currentTime = t; setPlaybackProgress(p => p ? { ...p, currentTime: t } : p); }}
                            className="flex-1 h-1 accent-emerald-400 cursor-pointer" />
                          <span className="text-[9px] text-neutral-500 tabular-nums w-7 text-right">{playbackProgress.duration > 0 ? `${Math.floor(playbackProgress.duration / 60)}:${String(Math.floor(playbackProgress.duration % 60)).padStart(2,'0')}` : '--:--'}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── SFX Panel ── */}
          <section className="bg-white/[0.03] backdrop-blur-lg border border-white/10 rounded-2xl p-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-neutral-300">💥 {t('sfx.title')}</h2>
              <div className="flex items-center gap-2">
                {sfxPreloadStatus === 'loading' && <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>}
                {sfxPreloadStatus === 'ready' && <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[9px] rounded-full border border-emerald-500/20">{t('sfx.ready')}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] text-neutral-500">{t('sfx.volume')}</span>
              <input type="range" min={0} max={1} step={0.01} value={sfxVolume} onChange={e => setSfxVolume(parseFloat(e.target.value))} className="flex-1 h-1 accent-violet-400 cursor-pointer" />
              <span className="text-[10px] text-neutral-400 font-mono w-8">{Math.round(sfxVolume * 100)}%</span>
            </div>
            {sfxCategories.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-xs text-neutral-500">{t('sfx.empty')}</p>
                <p className="text-[10px] text-neutral-600">{t('sfx.addFromAdmin')}</p>
              </div>
            ) : sfxCategories.map(cat => (
              <div key={cat.id} className="mb-2">
                <button onClick={() => setExpandedCategories(prev => ({ ...prev, [`sfx_${cat.id}`]: !prev[`sfx_${cat.id}`] }))} className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg bg-neutral-900/40 hover:bg-neutral-800/40 transition-colors mb-1">
                  <span className="text-xs text-neutral-300">{cat.name}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-neutral-500">{t('sfx.effectCount', { count: cat.tracks.length })}</span>
                    <svg className={`w-3 h-3 text-neutral-500 transition-transform ${expandedCategories[`sfx_${cat.id}`] ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                </button>
                {expandedCategories[`sfx_${cat.id}`] && (
                  <div className="grid grid-cols-3 gap-1.5 px-1">
                    {cat.tracks.map(tr => {
                      const isActive = activeSfxIds.has(tr.id);
                      return (
                        <button key={tr.id} onClick={() => { if (isActive) stopSfx(tr.id); else playSfx(tr.id); }}
                          className={`px-2 py-2 rounded-lg text-[10px] font-medium truncate transition-all ${isActive ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_10px_rgba(52,211,153,0.2)]' : 'bg-neutral-800/60 text-neutral-400 border border-neutral-700/50 hover:bg-neutral-700/60 hover:text-neutral-200'}`}
                        >
                          {isActive && <span className="inline-block w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse ml-1"></span>}
                          {tr.title}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            <button onClick={stopAllSfx} className="w-full mt-2 px-3 py-2 rounded-xl text-xs font-medium bg-neutral-800/60 text-neutral-400 border border-neutral-700/50 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-all">⬛ {t('sfx.stopAll')}</button>
          </section>
        </div>

        {/* ── Mobile Queue Tab (lg:hidden) ── */}
        <div className={`${mobileTab === 'queue' ? 'block' : 'hidden'} lg:hidden`}>
          <section className="bg-white/[0.03] backdrop-blur-lg border border-white/10 rounded-2xl p-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-neutral-300 flex items-center gap-2">📋 {t('queue.title')} {mediaQueue.length > 0 && <span className="px-2 py-0.5 bg-violet-500/20 text-violet-400 text-[10px] rounded-full">{mediaQueue.length}</span>}</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => setAutoQueue(v => !v)} className={`px-2.5 py-1 rounded-lg text-[10px] font-medium ${autoQueue ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-neutral-800 text-neutral-500 border border-neutral-700'}`}>⏭ {autoQueue ? t('queue.auto') : t('queue.manual')}</button>
                {mediaQueue.length > 0 && <button onClick={() => setMediaQueue([])} className="px-2 py-1 rounded-lg text-[10px] text-neutral-500 hover:text-red-400 bg-neutral-800 border border-neutral-700">{t('queue.clear')}</button>}
              </div>
            </div>
            {/* Queue volume */}
            <div className="bg-neutral-900/40 border border-green-500/20 rounded-xl px-3 py-2.5 mb-3">
              <div className="flex items-center justify-between mb-1"><span className="text-xs font-semibold text-green-300">{t('queue.queueVolumeLabel')}</span><span className="text-xs font-mono text-green-400">{queueVolume}%</span></div>
              <input type="range" min={0} max={100} value={queueVolume} onChange={e => setQueueVolume(Number(e.target.value))} className="w-full h-1.5 accent-green-400 cursor-pointer" />
            </div>
            {mediaQueue.length === 0 ? (
              <p className="text-xs text-neutral-600 text-center py-6">{t('queue.empty')}</p>
            ) : (
              <div className="space-y-1.5">
                {mediaQueue.map((item, idx) => {
                  const isPlaying = playingQueueId === item.id;
                  const isPausedManually = isPaused && pausedQueueItemRef.current?.id === item.id;
                  const typeLabel = item.mediaType === 'SONG' ? t('mediaType.song') : item.mediaType === 'BREAK' ? t('mediaType.break') : t('mediaType.ad');
                  return (
                    <div key={item.id} 
                      onTouchStart={!isPlaying ? (e) => handleTouchStart(e, idx) : undefined}
                      onTouchMove={!isPlaying ? handleTouchMove : undefined}
                      onTouchEnd={!isPlaying ? handleTouchEnd : undefined}
                      className={`rounded-xl border p-2.5 transition-all ${isPlaying ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-neutral-900/30 border-neutral-800'} ${draggedQueueIndex === idx ? 'opacity-50 scale-95 border-emerald-500/50 z-50 relative shadow-2xl' : ''} ${dragOverQueueIndex === idx && draggedQueueIndex !== idx ? 'border-emerald-400 bg-emerald-500/10 -translate-y-1 shadow-[0_4px_10px_rgba(52,211,153,0.1)]' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        {/* Mobile Drag Handle */}
                        {!isPlaying && (
                          <div className="flex items-center justify-center pr-1 text-neutral-500 active:text-neutral-300">
                             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8h16M4 16h16" /></svg>
                          </div>
                        )}
                        <span className="text-[10px] text-neutral-600 font-mono">#{idx+1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-neutral-200 truncate">{item.title}</p>
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-neutral-800 text-neutral-400">{typeLabel}</span>
                          {isPlaying && <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/20 text-emerald-400 animate-pulse mr-1">{t('queue.nowPlaying')}</span>}
                        </div>
                        {isPlaying ? <button onClick={() => pauseQueueItem()} className="px-2 py-1 rounded-lg text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/25">⏸</button>
                        : isPausedManually ? <button onClick={() => playQueueItem(item)} className="px-2 py-1 rounded-lg text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">▶</button>
                        : item.status === 'READY' || item.status === 'PREVIEW_ONLY' ? <button onClick={() => playQueueItem(item)} className="px-2 py-1 rounded-lg text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">▶</button>
                        : null}
                        <button onClick={() => removeQueueItem(item.id)} className="text-neutral-600 hover:text-red-400 text-sm">✕</button>
                      </div>
                      {playbackProgress && playbackProgress.id === item.id && (
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <span className="text-[9px] text-neutral-500 tabular-nums">{Math.floor(playbackProgress.currentTime / 60)}:{String(Math.floor(playbackProgress.currentTime % 60)).padStart(2,'0')}</span>
                          <input type="range" min={0} max={playbackProgress.duration || 0} step={0.5} value={playbackProgress.currentTime} onChange={e => { const t = parseFloat(e.target.value); if (currentlyPlayingRef.current) currentlyPlayingRef.current.currentTime = t; else if (pausedQueueAudioRef.current) pausedQueueAudioRef.current.currentTime = t; setPlaybackProgress(p => p ? { ...p, currentTime: t } : p); }} className="flex-1 h-1 accent-emerald-400 cursor-pointer" />
                          <span className="text-[9px] text-neutral-500 tabular-nums">{playbackProgress.duration > 0 ? `${Math.floor(playbackProgress.duration / 60)}:${String(Math.floor(playbackProgress.duration % 60)).padStart(2,'0')}` : '--:--'}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* ── Mobile SFX Tab (lg:hidden) ── */}
        <div className={`${mobileTab === 'sfx' ? 'block' : 'hidden'} lg:hidden`}>
          <section className="bg-white/[0.03] backdrop-blur-lg border border-white/10 rounded-2xl p-3">
            <h2 className="text-sm font-semibold text-neutral-300 mb-2">💥 {t('sfx.title')}</h2>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] text-neutral-500">{t('sfx.volume')}</span>
              <input type="range" min={0} max={1} step={0.01} value={sfxVolume} onChange={e => setSfxVolume(parseFloat(e.target.value))} className="flex-1 h-1 accent-violet-400 cursor-pointer" />
              <span className="text-[10px] text-neutral-400">{Math.round(sfxVolume * 100)}%</span>
            </div>
            {sfxCategories.length === 0 ? (
              <div className="text-center py-4"><p className="text-xs text-neutral-500">{t('sfx.empty')}</p><p className="text-[10px] text-neutral-600">{t('sfx.addFromAdmin')}</p></div>
            ) : sfxCategories.map(cat => (
              <div key={cat.id} className="mb-2">
                <button onClick={() => setExpandedCategories(prev => ({ ...prev, [`sfx_m_${cat.id}`]: !prev[`sfx_m_${cat.id}`] }))} className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg bg-neutral-900/40 hover:bg-neutral-800/40 transition-colors mb-1">
                  <span className="text-xs text-neutral-300">{cat.name}</span>
                  <span className="text-[9px] text-neutral-500">{t('sfx.effectCount', { count: cat.tracks.length })}</span>
                </button>
                {expandedCategories[`sfx_m_${cat.id}`] && (
                  <div className="grid grid-cols-3 gap-1.5 px-1">
                    {cat.tracks.map(tr => {
                      const isActive = activeSfxIds.has(tr.id);
                      return (
                        <button key={tr.id} onClick={() => { if (isActive) stopSfx(tr.id); else playSfx(tr.id); }}
                          className={`px-2 py-2 rounded-lg text-[10px] font-medium truncate transition-all ${isActive ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-neutral-800/60 text-neutral-400 border border-neutral-700/50 hover:bg-neutral-700/60'}`}
                        >{tr.title}</button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            <button onClick={stopAllSfx} className="w-full mt-2 px-3 py-2 rounded-xl text-xs bg-neutral-800/60 text-neutral-400 border border-neutral-700/50 hover:bg-red-500/10 hover:text-red-400 transition-all">⬛ {t('sfx.stopAll')}</button>
          </section>
        </div>

        {/* ─────────────────────────────────────────────────────────────────────
            FAR RIGHT COLUMN — Live Messages
           ───────────────────────────────────────────────────────────────────── */}
        {!!scheduledStationId && (
          <div className={`${mobileTab === 'messages' ? 'block' : 'hidden'} xl:flex xl:flex-col lg:hidden lg:overflow-y-auto lg:max-h-full`}>
            <section className="bg-white/[0.03] backdrop-blur-lg border border-white/10 rounded-2xl p-3 flex-1 flex flex-col min-h-[400px]">
              <div className="flex items-center justify-between mb-3 shrink-0">
                <h2 className="text-sm font-semibold text-neutral-300 flex items-center gap-2">
                  💬 {t('LiveMessaging.title')}
                  {liveMessages.length > 0 && <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-[10px] rounded-full">{liveMessages.length}</span>}
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      const currentStationId = scheduledStationId;
                      if (!currentStationId) return;
                      const nextState = !isMessagingEnabled;
                      setIsMessagingEnabled(nextState);
                      try {
                        await fetch("/api/studio/messaging/toggle", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ stationId: currentStationId, isEnabled: nextState }),
                        });
                      } catch {
                        setIsMessagingEnabled(!nextState); // revert on error
                      }
                    }}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${isMessagingEnabled ? 'bg-emerald-500' : 'bg-neutral-600'}`}
                  >
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${dir === 'rtl' ? (isMessagingEnabled ? '-translate-x-5' : '-translate-x-1') : (isMessagingEnabled ? 'translate-x-5' : 'translate-x-1')}`} />
                  </button>
                  <button 
                    onClick={() => setLiveMessages([])} 
                    className="px-2 py-1 rounded-lg text-[10px] text-neutral-500 hover:text-red-400 bg-neutral-800 border border-neutral-700 transition-colors"
                  >
                    {t('LiveMessaging.clear')}
                  </button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
                {liveMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-neutral-500 text-xs py-10 opacity-50">
                    <div className="text-2xl mb-2">📭</div>
                    {t('LiveMessaging.empty')}
                  </div>
                ) : (
                  liveMessages.map((msg) => (
                    <div key={msg.id} className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-2 flex flex-col gap-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-sm text-neutral-200 truncate">{msg.name || msg.senderName}</div>
                        <div className="text-[10px] text-neutral-500 whitespace-nowrap">
                          {new Date(msg.createdAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      {(msg.country || msg.phoneNumber) && (
                        <div className="flex items-center gap-2 text-[10px] text-neutral-400 font-mono">
                          {msg.country && <span>{getFlagEmoji(msg.country)} {msg.country.toUpperCase()}</span>}
                          {msg.phoneNumber && <span>{msg.phoneNumber}</span>}
                        </div>
                      )}
                      <p className="text-xs text-neutral-300 whitespace-pre-wrap leading-relaxed mt-1">
                        {msg.message}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}

      </main>

      {/* ── Footer ── */}
      <footer className="text-center py-3">
        <p className="text-neutral-600 text-xs">{t('connection.connectFirst')}</p>
      </footer>
    </div>
  );
}

