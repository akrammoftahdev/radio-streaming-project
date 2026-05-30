"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NoSleep from "nosleep.js";
import { useLocale } from "next-intl";
import { isRtl } from "@/i18n/config";
import DspPanel from "@/components/studio/DspPanel";
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

  const locale = useLocale();
  const dir = isRtl(locale) ? 'rtl' : 'ltr';

  const [isMicOpen, setIsMicOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  // Auto-disconnect message shown after session end watchdog fires
  const [autoDisconnectMsg, setAutoDisconnectMsg] = useState<string | null>(null);
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
  // Group 4.8 — Manual Playback Engine (Queue V2 Phase 2)
  const currentlyPlayingRef = useRef<HTMLAudioElement | null>(null);
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);
  const [playingQueueId, setPlayingQueueId] = useState<string | null>(null);
  const [bgVolume, setBgVolume] = useState<number>(0.5);
  // Ducking ratio applied to background gain when mic is open.
  // 0.10 → fader 50% gives 5% background under mic; fader 100% gives 10%.
  const BG_DUCK_RATIO = 0.10;
  // ── Queue-to-Queue Crossfade ────────────────────────────────────────────────
  const QUEUE_CROSSFADE_SEC = 3;       // overlap duration in seconds
  const QUEUE_CROSSFADE_CHECK_MS = 500; // polling interval to detect near-end

  const [queueVolume, setQueueVolume] = useState<number>(0.8);
  // Group 4.9 — Stable ref to latest mediaQueue for use inside audio callbacks
  const mediaQueueRef = useRef<QueueItem[]>([]);
  // Stable refs for background state — lets ws.onopen read current values without stale closure
  const activeBgTrackIdRef  = useRef<string | null>(null);
  const activeBgLocalUrlRef = useRef<string | null>(null);
  const bgVolumeRef         = useRef<number>(0.5);
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
  // Monitoring GainNode — connected to ctx.destination; gain=0 when OFF, 0.8 when ON
  const monitorGainRef = useRef<GainNode | null>(null);
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

  // Full broadcast teardown — called only on Disconnect or unmount
  const stopBroadcastSession = useCallback(() => {
    if (noSleepRef.current) noSleepRef.current.disable();
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    // ── Crossfade cleanup ──────────────────────────────────────────────────────
    if (crossfadeTimerRef.current) { clearInterval(crossfadeTimerRef.current); crossfadeTimerRef.current = null; }
    inCrossfadeRef.current = false;
    if (outgoingPlayerRef.current) {
      try { outgoingPlayerRef.current.audio.pause(); } catch {/* ignore */}
      try { outgoingPlayerRef.current.gain.disconnect(); } catch {/* ignore */}
      try { outgoingPlayerRef.current.source.disconnect(); } catch {/* ignore */}
      outgoingPlayerRef.current = null;
    }
    // Stop the silent keepalive node first
    try { keepaliveRef.current?.stop(); } catch {/* ignore */}
    try { keepaliveRef.current?.disconnect(); } catch {/* ignore */}
    keepaliveRef.current = null;
    // Disconnect all mixer nodes before closing AudioContext
    try { micSourceRef.current?.disconnect(); } catch {/* ignore */}
    try { micGainRef.current?.disconnect(); } catch {/* ignore */}
    try { bgGainRef.current?.disconnect(); } catch {/* ignore */}
    try { bgSourceRef.current?.disconnect(); } catch {/* ignore */}
    try { queueGainRef.current?.disconnect(); } catch {/* ignore */}
    try { queueSourceRef.current?.disconnect(); } catch {/* ignore */}
    // ── SFX cleanup ───────────────────────────────────────────────────────────
    activeSfxRef.current.forEach(s => { try { s.stop(); } catch {/* */} });
    activeSfxRef.current.clear();
    try { sfxGainRef.current?.disconnect(); } catch {/* ignore */}
    sfxGainRef.current = null;
    sfxBuffersRef.current.clear();
    setSfxPreloadStatus('idle');
    // ── DSP cleanup ───────────────────────────────────────────────────────────
    cleanupDsp();
    setDspBypassed(false);
    setDspParams(DEFAULT_DSP_PARAMS);
    // Reset monitoring gain to 0 before disconnecting
    if (monitorGainRef.current) { monitorGainRef.current.gain.value = 0; }
    try { monitorGainRef.current?.disconnect(); } catch {/* ignore */}
    monitorGainRef.current = null;
    setIsMonitoring(false);
    micSourceRef.current   = null;
    micGainRef.current     = null;
    mixerDestRef.current   = null;
    bgSourceRef.current    = null;
    bgGainRef.current      = null;
    queueSourceRef.current = null;
    queueGainRef.current   = null;
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    analyserRef.current = null;
    dataArrayRef.current = null;
    setVolumeLevel(0);
    setHeartbeatStatus("stopped");
    setAudioBackendStatus("disconnected");
    setShoutcastStatus('idle');
  }, []);

  // Legacy alias used by unmount cleanup effect
  const stopMicAudio = stopBroadcastSession;

  // ── startSessionRecording ─────────────────────────────────────────────────
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
    recorder.start(1000);
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
  useEffect(() => () => stopMicAudio(), [stopMicAudio]);


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
  // Audio routes directly to mixerDestination — never to local speakers unless monitoring is ON.
  useEffect(() => {
    const bgSrcUrl = activeBgLocalUrl ?? (activeBgTrackId ? `/api/tracks/${activeBgTrackId}` : null);
    if (!bgSrcUrl) {
      stopBackgroundAudio();
      return;
    }
    stopBackgroundAudio();
    const ctx  = audioCtxRef.current;
    const dest = mixerDestRef.current;
    console.log('[DIAG][bg-effect] src:', bgSrcUrl, '| ctx:', !!ctx, '| dest:', !!dest);

    if (ctx && dest) {
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
      const micIsLive = micGainRef.current !== null && micGainRef.current.gain.value > 0;
      gain.gain.value = micIsLive ? bgVolumeRef.current * BG_DUCK_RATIO : bgVolume;
      bgSrcNode.connect(gain);
      gain.connect(dest);
      if (monitorGainRef.current) gain.connect(monitorGainRef.current);
      bgSourceRef.current = bgSrcNode;
      bgGainRef.current   = gain;
      audio.play()
        .then(() => {
          console.log('[DIAG][bg-effect] play OK — bg in mixer');
          // ✔ Real audio source connected — start recording if not already started
          ensureRecordingStarted('background');
        })
        .catch(err => console.error('[DIAG][bg-effect] play REJECTED:', err));
    } else {
      // NO_MIXER: Connect has not fired yet. The ws.onopen handler inside toggleConnection
      // will wire any pre-selected bg into the mixer when WS opens.
      console.log('[DIAG][bg-effect] NO_MIXER — ws.onopen will wire bg when Connect fires');
    }
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
    const vol = volumeOverride !== undefined ? volumeOverride : bgVolumeRef.current;
    const queueActive = currentlyPlayingRef.current !== null;
    const target = queueActive
      ? 0
      : isMicOpen
        ? vol * BG_DUCK_RATIO
        : vol;
    if (bgGainRef.current) {
      bgGainRef.current.gain.value = target;
    } else if (bgAudioRef.current && !queueActive) {
      // Fallback for pre-connect playback (no AudioContext yet)
      bgAudioRef.current.volume = isMicOpen ? vol * BG_DUCK_RATIO : vol;
    }
    console.log(`[BgGain] reason=${reason} override=${volumeOverride?.toFixed(2)??'ref'} queueActive=${queueActive} micOpen=${isMicOpen} vol=${vol.toFixed(2)} → gain=${target.toFixed(2)}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMicOpen]); // bgVolumeRef is a ref — always current without being a dep

  // Background fader effect — safety net in case direct onChange call is missed
  useEffect(() => {
    applyBgGain('bgVolume-effect');
  }, [bgVolume, applyBgGain]);

  // Background ducking — mic open/close applies same formula
  useEffect(() => {
    applyBgGain('mic-toggle');
  // applyBgGain is stable on isMicOpen changes; bgVolumeRef always current
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMicOpen]);

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
    const status: QueueStatus = isMicOpen
      ? (policy.canSelectWhileMicOpen ? "READY_AFTER_MIC_CLOSE" : "BLOCKED_WHILE_MIC_OPEN")
      : "READY";
    if (status === "BLOCKED_WHILE_MIC_OPEN") return;
    setMediaQueue(prev => {
      // Duplicate guard removed (Queue V2): same track may be added multiple times.
      // Each entry gets a unique queue id via crypto.randomUUID().
      const item: QueueItem = { id: crypto.randomUUID(), trackId, title, mediaType, sourceType, status, ownerType, objectUrl, fileUrl };
      return [...prev, item];
    });
  }, [isMicOpen]);

  // Group 4.6 — Remove single item from queue
  const removeQueueItem = useCallback((queueId: string) => {
    setMediaQueue(prev => prev.filter(q => q.id !== queueId));
  }, []);

  // Group 4.6 — Clear entire queue
  const clearQueue = useCallback(() => { setMediaQueue([]); }, []);

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
    if (isMicOpen) {
      // ── MIC OPENED: pause any playing queue audio immediately ──────────────
      if (currentlyPlayingRef.current) {
        // Ramp queue gain to 0 first (instant silence in broadcast)
        if (queueGainRef.current) {
          queueGainRef.current.gain.value = 0;
        }
        currentlyPlayingRef.current.pause();
        // Find which queue item this audio belongs to
        const currentId = playingQueueId;
        const pausedItem = currentId
          ? mediaQueueRef.current.find(q => q.id === currentId) ?? null
          : null;
        pausedForMicRef.current = pausedItem;
        console.log('[DIAG][mic-priority] Queue paused for mic open. Item:', pausedItem?.title ?? 'unknown');
        // Restore background under mic (ducked proportionally to fader) — queue is now paused
        applyBgGain('mic-open-queue-paused');
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
        // playQueueItem will mute background automatically.
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
  }, [isMicOpen]);

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
  const playQueueItem = useCallback((item: QueueItem) => {
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
      // Re-connect qGain if ctx still alive
      const ctx  = audioCtxRef.current;
      const dest = mixerDestRef.current;
      if (ctx && dest && !queueGainRef.current) {
        // qSrc was already created — qGain may still be connected; just restore gain value
        if (queueGainRef.current) {
          (queueGainRef.current as GainNode).gain.value = queueVolume;
        }
      }
      audio.play()
        .then(() => {
          console.log('[DIAG][queue] resume play: RESOLVED');
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
    // Connect to Web Audio mixer if active, otherwise fall back to audio.volume
    const ctx  = audioCtxRef.current;
    const dest = mixerDestRef.current;
    console.log('[DIAG][queue] ctx exists:', !!ctx, '| dest exists:', !!dest);
    console.log('[DIAG][queue] branch:', (ctx && dest) ? 'MIXER' : 'NO_MIXER (audio.volume fallback — not on broadcast!)');
    if (ctx && dest) {
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
      qGain.connect(dest);              // → SHOUTcast broadcast only
      // → Also feed monitoring output if available
      if (monitorGainRef.current) {
        qGain.connect(monitorGainRef.current);
        console.log('[DIAG][queue] qGain.connect(monitorGainRef): OK');
      }
      queueSourceRef.current = qSrc;
      queueGainRef.current   = qGain;
      // Crossfade queue in after audio starts (inside .then())
    } else {
      // NO_MIXER: mixer not ready — do NOT play locally to avoid unwanted speaker output.
      // Presenter must connect and open mic first to initialise the Web Audio mixer.
      console.warn('[DIAG][queue] NO_MIXER — not playing locally. Connect and open mic first.');
      currentlyPlayingRef.current = null;
      setPlayingQueueId(null);
      return;
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
        const targetVol = isMicLive ? bgVolumeRef.current * BG_DUCK_RATIO : bgVolumeRef.current;
        fadeGain(bgGainRef.current, targetVol, 2, 'queue→bg fade-in');
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
          fadeGain(queueGainRef.current, queueVolume, 3, 'queue fade-in');
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
                  fadeGain(nextGain, queueVolume, QUEUE_CROSSFADE_SEC, 'crossfade: B fade-in');
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
                  const tv = isMicLive ? bgVolumeRef.current * BG_DUCK_RATIO : bgVolumeRef.current;
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
      queueGainRef.current.gain.value = queueVolume;
    } else if (currentlyPlayingRef.current) {
      currentlyPlayingRef.current.volume = queueVolume;
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
      const targetVol = isMicLive ? bgVolumeRef.current * BG_DUCK_RATIO : bgVolumeRef.current;

      fadeGain(bgGainRef.current, targetVol, 2, 'queue-stop bg-restore');
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

  // Toggle presenter headphone monitoring
  const toggleMonitoring = useCallback(() => {
    if (!monitorGainRef.current) {
      console.warn('[DIAG][monitoring] monitorGainRef not ready — connect first');
      return;
    }
    setIsMonitoring(prev => {
      const next = !prev;
      monitorGainRef.current!.gain.value = next ? monitorVolume : 0;
      console.log('[DIAG][monitoring] Monitoring', next ? `ON (gain=${monitorVolume})` : 'OFF (gain=0)');
      return next;
    });
  }, [monitorVolume]);

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
        ? { audio: { deviceId: { exact: deviceId } }, video: false }
        : { audio: true, video: false };
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
      setMicDeviceError('فشل التبديل. يرجى إغلاق الميك وإعادة فتحه.');
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
    if (available.length === 0) { showFadeMessage("جميع أغاني هذا القسم في قائمة الانتظار"); return; }
    const random = available[Math.floor(Math.random() * available.length)];
    enqueueItem(random.id, random.title, "SONG", "ADMIN_DB", cat.ownerType as "ADMIN" | "PRESENTER");
    showFadeMessage("تمت إضافة أغنية عشوائية لقائمة الانتظار");
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
          setMicError("المشغل غير مهيأ — يرجى قطع الاتصال وإعادة الاتصال.");
          return;
        }

        if (ctx.state === "suspended") await ctx.resume();

        // Acquire mic stream
        const micConstraints: MediaStreamConstraints = selectedMicDeviceId
          ? { audio: { deviceId: { exact: selectedMicDeviceId } }, video: false }
          : { audio: true, video: false };
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia(micConstraints);
        } catch (micErr) {
          if (selectedMicDeviceId) {
            console.warn("[DIAG][mic-device] selected device failed, fallback:", micErr);
            setMicDeviceError("الجهاز المحدد غير متاح — تم الرجوع للميكروفون الافتراضي.");
            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            setSelectedMicDeviceId("");
          } else throw micErr;
        }
        streamRef.current = stream;
        refreshAudioInputDevices();
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
            bgGain.gain.value = bgVolume;
            bgSrc.connect(bgGain);
            bgGain.connect(dest);
            if (monitorGainRef.current) bgGain.connect(monitorGainRef.current);
            bgSourceRef.current = bgSrc;
            bgGainRef.current   = bgGain;
            freshBgAudio.play().catch(e => console.warn("[DIAG] bg reconnect play failed:", e));
          } catch (e) { console.warn("[DIAG] bg reconnect failed:", e); }
        }

        const readyCount = mediaQueue.filter(q => q.status === "READY").length;
        if (readyCount > 0) showFadeMessage(`${readyCount} عنصر جاهز في قائمة الانتظار`);
        setIsMicOpen(true);
      } catch {
        setMicError("تعذّر الوصول للميكروفون. يرجى السماح بالصلاحية من إعدادات المتصفح وحاول مجدداً.");
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
      // ── Connect: initialize mixer immediately so queue can play without mic ──
      try {
        if (noSleepRef.current) noSleepRef.current.enable();
        // 1. AudioContext + mixer + keepalive + monitoring (DO THIS BEFORE AWAIT)
        // Re-use existing context if available to prevent browser limits
        const ctx = audioCtxRef.current ?? new (window.AudioContext || (window as any).webkitAudioContext)();
        audioCtxRef.current = ctx;
        if (ctx.state === "suspended") await ctx.resume();

        if (!mixerDestRef.current) {
          const newMixerDest = ctx.createMediaStreamDestination();
          mixerDestRef.current = newMixerDest;

          // Silent keepalive — keeps mixerDest stream alive when mic + queue are both silent
          const keepalive = ctx.createConstantSource();
          keepalive.offset.value = 0;
          const keepaliveGain = ctx.createGain();
          keepaliveGain.gain.value = 0;
          keepalive.connect(keepaliveGain);
          keepaliveGain.connect(newMixerDest);
          keepalive.start();
          keepaliveRef.current = keepalive;

          // Monitoring GainNode — gain=0 (OFF) by default; only bg/queue routed here
          const monitorGain = ctx.createGain();
          monitorGain.gain.value = 0;
          monitorGain.connect(ctx.destination);
          monitorGainRef.current = monitorGain;

          // Pre-create micGain so queue playback can connect immediately
          const micGain = ctx.createGain();
          micGain.gain.value = 0; // mic not yet open — stays silent
          micGainRef.current = micGain;
          micGain.connect(newMixerDest);
        }

        const mixerDest = mixerDestRef.current;

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
            setMicError("انتهت الجلسة. يرجى تسجيل الدخول مجدداً");
            setTimeout(() => { window.location.href = '/login'; }, 1500);
            return;
          }

          if (!tokenRes.ok) throw new Error(`Token failed (${tokenRes.status})`);
          const tokenData = await tokenRes.json();
          if (!tokenData?.token) throw new Error("Token missing");
          audioToken = tokenData.token;
        } catch (tokenErr) {
          console.error("[Studio] Audio token failed on connect:", tokenErr);
          setMicError("فشل الاتصال. يرجى المحاولة مرة أخرى.");
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
          // If the presenter selected a background track BEFORE Connect, the
          // bg-effect ran while ctx/dest were null (NO_MIXER). Wire it now
          // and call ensureRecordingStarted after play resolves.
          const bgUrl = activeBgLocalUrlRef.current ?? (activeBgTrackIdRef.current ? `/api/tracks/${activeBgTrackIdRef.current}` : null);
          console.log('[Studio][ws.onopen] pre-selected bgUrl:', bgUrl);
          if (bgUrl && mixerDest && ctx) {
            const audio = new Audio(bgUrl);
            audio.loop = true;
            bgAudioRef.current = audio;
            try {
              const bgSrc  = ctx.createMediaElementSource(audio);
              const bgGain = ctx.createGain();
              bgGain.gain.value = bgVolumeRef.current;
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
                showFadeMessage("تنبيه: حاول جهاز آخر الاتصال بنفس الحساب الآن!");
                break;
              default: break;
            }
          } catch { /* ignore non-JSON messages */ }
        };
        ws.onclose = (event: CloseEvent) => {
          console.log('[Studio][ws.onclose] WS closed — code:', event.code, 'reason:', event.reason);
          setAudioBackendStatus("disconnected");
          setShoutcastStatus('idle');
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
          mediaRecorderRef.current = null;
          
          const reasonStr = (event.reason || "").toLowerCase();
          
          if (event.code === 1008 && reasonStr.includes("duplicate")) {
            setMicError("جلسة مكررة — هذا المقدم متصل بالفعل من نافذة أخرى.");
            setIsMicOpen(false);
            stopBroadcastSession();
            setIsConnected(false);
          } else if (event.code === 1001 || reasonStr.includes("stale") || reasonStr.includes("timeout") || reasonStr.includes("no audio")) {
            setMicError("تم قطع الاتصال لأن الخادم لم يستقبل صوتاً.");
            setIsMicOpen(false);
            stopBroadcastSession();
            setIsConnected(false);
          } else if (event.code !== 1000) {
            // Fallback for other unexpected closures to prevent UI from being stuck "connected"
            const fallbackMsg = event.reason ? `انقطع الاتصال (${event.code}): ${event.reason}` : `انقطع الاتصال (رمز ${event.code})`;
            setMicError(fallbackMsg);
            setIsMicOpen(false);
            stopBroadcastSession();
            setIsConnected(false);
          }
        };

        startHeartbeat();
      } catch (e) {
        console.error("[Studio][connect] init error:", e);
        setMicError("فشل الاتصال. يرجى المحاولة مرة أخرى.");
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
    showFadeMessage(isMicOpen ? "سيتم التشغيل بعد غلق المايك" : "تمت إضافة الأغنية لقائمة الانتظار");
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
    showFadeMessage(isMicOpen ? "سيتم التشغيل بعد غلق المايك" : "تمت إضافة الملف لقائمة الانتظار");
  }, [mediaQueue, enqueueItem, isMicOpen, showFadeMessage]);

  // Group 4.7-B — When a local file is removed, also remove its queue entry and revoke its URL
  const handleRemoveLocalFileWithQueueCleanup = useCallback((tab: MediaTab, fileId: string) => {
    // Find the matching queue item (LOCAL_SESSION) and remove it
    const qItem = mediaQueue.find(q => q.trackId === fileId && q.sourceType === "LOCAL_SESSION");
    if (qItem) removeQueueItem(qItem.id);
    handleRemoveLocalFile(tab, fileId);
  }, [mediaQueue, removeQueueItem, handleRemoveLocalFile]);

  return (
    <div dir={dir} className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden">
      {/* ── Session-end auto-disconnect banner ── */}
      {autoDisconnectMsg && (
        <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-full shadow-xl backdrop-blur-md font-bold text-sm text-center border animate-pulse ${
          autoDisconnectMsg.startsWith('انتهى')
            ? 'bg-red-500/20 border-red-500/50 text-red-200 shadow-[0_0_30px_rgba(239,68,68,0.4)]'
            : 'bg-amber-500/20 border-amber-500/50 text-amber-200 shadow-[0_0_30px_rgba(245,158,11,0.4)]'
        }`}>
          {autoDisconnectMsg}
        </div>
      )}
      {fadeMessage && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 z-50 bg-indigo-500/20 border border-indigo-500/50 text-indigo-100 px-6 py-3 rounded-full shadow-[0_0_30px_rgba(99,102,241,0.3)] animate-pulse backdrop-blur-md font-medium text-sm text-center">
          {fadeMessage}
        </div>
      )}
      <style dangerouslySetInnerHTML={{__html: `@keyframes soundBars { 0% { transform: scaleY(0.3); opacity: 0.5; } 100% { transform: scaleY(1); opacity: 1; } }`}} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(800px,100vw)] h-[min(800px,100vw)] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none"></div>
      {isMicOpen && <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(600px,100vw)] h-[min(600px,100vw)] bg-red-500/20 rounded-full blur-[100px] pointer-events-none animate-pulse"></div>}

      <div className="z-10 w-full max-w-lg flex flex-col items-center">

        {/* ── Exit button ───────────────────────────────────────────────── */}
        <div className="w-full flex justify-start mb-3">
          <div className="flex gap-2">
            <Link
              href="/profile"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-neutral-400 hover:text-indigo-300 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-indigo-500/40 transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
              </svg>
              ملفي
            </Link>
            <button
              onClick={async () => {
                console.log('[Exit] clicked — isConnected:', isConnected);
              // Step 1: clean disconnect if currently live
              if (isConnected) {
                if (isMicOpen) setIsMicOpen(false);
                stopBroadcastSession();
                try { await fetch('/api/studio/disconnect', { method: 'POST' }); } catch { /* best-effort */ }
                setIsConnected(false);
                setShoutcastStatus('idle');
              }
              // Step 2: return to pre-flight via callback (instant — no server round-trip)
              //         or fall back to router.push if running without the callback
              if (onExitStudio) {
                console.log('[Exit] calling onExitStudio — returning to pre-flight screen');
                onExitStudio();
              } else {
                console.log('[Exit] no onExitStudio — navigating via router.push(\'/studio\')');
                try {
                  router.push('/studio');
                } catch (navErr) {
                  console.warn('[Exit] router.push failed, using window.location.href fallback:', navErr);
                  window.location.href = '/studio';
                }
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-neutral-400 hover:text-neutral-200 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            خروج من الاستوديو
          </button>
        </div>
      </div>


        <div className="mb-6 text-center">
          <h1 className="text-4xl font-bold bg-gradient-to-l from-indigo-400 to-cyan-400 bg-clip-text text-transparent mb-4">استوديو البث</h1>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-neutral-900 border border-neutral-800 shadow-inner">
            <div className={`w-2 h-2 rounded-full ${isMicOpen ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-pulse' : 'bg-neutral-600'}`}></div>
            <span className={`text-sm font-semibold tracking-wider ${isMicOpen ? 'text-red-400' : 'text-neutral-500'}`}>{isMicOpen ? "ON AIR" : "OFF AIR"}</span>
          </div>
        </div>

        {/* Summary Row */}
        <div className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-3 mb-3 shadow-sm">
          <div className="grid grid-cols-2 gap-3 text-xs text-neutral-400 mb-2.5">
            <div className="flex items-center gap-2"><span className="font-semibold text-neutral-500">الاتصال:</span><span className={`font-medium ${isConnected ? 'text-emerald-400' : 'text-red-400'}`}>{isConnected ? 'متصل' : 'غير متصل'}</span></div>
            <div className="flex items-center gap-2"><span className="font-semibold text-neutral-500">الميك:</span><span className={`font-medium ${isMicOpen ? 'text-amber-400' : 'text-neutral-300'}`}>{isMicOpen ? 'مفتوح' : 'مغلق'}</span></div>
            <div className="flex items-center gap-2"><span className="font-semibold text-neutral-500">الخلفية:</span><span className="text-neutral-300 truncate">{activeBgTrack || 'لا يوجد'}</span></div>
            <div className="flex items-center gap-2"><span className="font-semibold text-neutral-500">الانتظار:</span><span className="text-neutral-300 truncate">{mediaQueue.length > 0 ? `${mediaQueue.length} عنصر` : 'فارغ'}</span></div>
          </div>
          {/* Archive shortcut — always visible, does not affect live controls */}
          <a
            href="/studio/recordings"
            className="flex items-center justify-center gap-1.5 w-full py-1.5 text-xs text-neutral-500 hover:text-indigo-300 bg-neutral-800/40 hover:bg-neutral-800 border border-neutral-700/40 hover:border-indigo-500/30 rounded-lg transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
            أرشيف تسجيلاتي
          </a>
        </div>

        {/* ── NOW PLAYING TOP PILL ─────────────────────────────────────────── */}
        {(() => {
          // Derive current on-air state for the top display
          const playingItem = playingQueueId
            ? mediaQueue.find(q => q.id === playingQueueId)
            : null;
          const pausedItem  = pausedForMicRef.current;

          let label  = '';
          let typeTag = '';
          let stateColor = 'text-neutral-400';
          let dotColor   = 'bg-neutral-600';

          if (isMicOpen && pausedItem) {
            // Mic live, queue paused
            label    = `الميك مباشر — متوقف مؤقتاً: ${pausedItem.title}`;
            typeTag  = 'ميك / ' + (pausedItem.mediaType === 'SONG' ? 'أغنية' : pausedItem.mediaType === 'BREAK' ? 'فاصل' : 'إعلان');
            stateColor = 'text-amber-400';
            dotColor   = 'bg-amber-400 animate-pulse';
          } else if (isMicOpen && activeBgTrack) {
            // Mic live, background ducked
            label    = `الميك مباشر — خلفية: ${activeBgTrack}`;
            typeTag  = 'ميك + خلفية';
            stateColor = 'text-red-400';
            dotColor   = 'bg-red-500 animate-pulse';
          } else if (isMicOpen) {
            // Mic live only
            label    = 'الميك مباشر';
            typeTag  = 'ميك';
            stateColor = 'text-red-400';
            dotColor   = 'bg-red-500 animate-pulse';
          } else if (playingItem) {
            // Queue item playing
            const typeAr = playingItem.mediaType === 'SONG' ? 'أغنية' : playingItem.mediaType === 'BREAK' ? 'فاصل' : 'إعلان';
            label    = playingItem.title;
            typeTag  = typeAr + ' — يعزف الآن';
            stateColor = 'text-emerald-400';
            dotColor   = 'bg-emerald-500 animate-pulse';
          } else if (activeBgTrack) {
            // Only background playing
            label    = activeBgTrack;
            typeTag  = 'خلفية موسيقية';
            stateColor = 'text-indigo-400';
            dotColor   = 'bg-indigo-500';
          } else {
            label    = 'لا يوجد بث حالي';
            typeTag  = '—';
            stateColor = 'text-neutral-600';
            dotColor   = 'bg-neutral-700';
          }

          return isConnected ? (
            <div className="w-full mb-4 flex items-center gap-3 bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2.5 shadow-sm">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
              <div className="flex flex-col min-w-0">
                <span className={`text-xs font-semibold truncate ${stateColor}`}>{label}</span>
                <span className="text-[10px] text-neutral-600 mt-0.5">{typeTag}</span>
              </div>
            </div>
          ) : null;
        })()}
        {/* ──────────────────────────────────────────────────────────────────── */}

        {/* Connection Panel */}
        <div className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-4 mb-10 flex flex-col gap-3 shadow-lg">

          {/* ── Two status cards: Radio + Recording ── */}
          <div className="flex gap-3 flex-wrap">

            {/* حالة الهوا */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold flex-1 min-w-[140px] ${
              shoutcastStatus === 'on_air'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : shoutcastStatus === 'connecting'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                : shoutcastStatus === 'radio_error'
                ? 'bg-red-500/10 border-red-500/30 text-red-300'
                : isConnected
                ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                : 'bg-neutral-800 border-neutral-700 text-neutral-500'
            }`}>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                shoutcastStatus === 'on_air'     ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]' :
                shoutcastStatus === 'connecting' ? 'bg-amber-400 animate-pulse' :
                shoutcastStatus === 'radio_error'? 'bg-red-500' :
                isConnected ? 'bg-indigo-400' : 'bg-neutral-600'
              }`} />
              <div>
                <p className="text-[10px] text-neutral-500 leading-none mb-0.5">حالة الهوا</p>
                <p className="leading-none">
                  {shoutcastStatus === 'on_air'         ? 'على الهواء ✔' :
                   shoutcastStatus === 'connecting'     ? 'جاري الاتصال بالراديو...' :
                   shoutcastStatus === 'radio_error'    ? 'فشل الاتصال بالراديو' :
                   (shoutcastStatus === 'ws_connected' || shoutcastStatus === 'recording' || shoutcastStatus === 'recording_only')
                     ? 'متصل بالاستوديو' :
                   isConnected ? 'متصل' : 'غير متصل'}
                </p>
              </div>
            </div>

            {/* حالة التسجيل */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold flex-1 min-w-[140px] ${
              (shoutcastStatus === 'recording' || shoutcastStatus === 'on_air' || shoutcastStatus === 'radio_error' || shoutcastStatus === 'recording_only')
                ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
                : isConnected
                ? 'bg-neutral-800 border-neutral-700 text-neutral-400'
                : 'bg-neutral-800 border-neutral-700 text-neutral-500'
            }`}>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                (shoutcastStatus === 'recording' || shoutcastStatus === 'on_air' || shoutcastStatus === 'radio_error' || shoutcastStatus === 'recording_only')
                  ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.7)]' : 'bg-neutral-600'
              }`} />
              <div>
                <p className="text-[10px] text-neutral-500 leading-none mb-0.5">حالة التسجيل</p>
                <p className="leading-none">
                  {(shoutcastStatus === 'recording' || shoutcastStatus === 'on_air' || shoutcastStatus === 'radio_error' || shoutcastStatus === 'recording_only')
                    ? 'تسجيل الجلسة ●'
                    : isConnected ? 'في انتظار الصوت' : 'لا يوجد تسجيل'}
                </p>
              </div>
            </div>

          </div>

          {/* Bitrate + backend indicators + Disconnect button */}
          <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-lg border text-xs font-mono transition-colors ${isConnected ? 'bg-neutral-950 border-neutral-800 text-neutral-400' : 'bg-neutral-900 border-neutral-800 text-neutral-600'}`}>64 kbps</span>
            <span className={`px-3 py-1 rounded-lg border text-xs font-medium flex items-center gap-1 ${isConnected ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-neutral-900 border-neutral-800 text-neutral-600'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-neutral-600'}`}></div>أخضر / ممتاز
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${heartbeatStatus === 'active' ? 'bg-red-500 animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.7)]' : 'bg-neutral-600'}`}></div>
              <span className={`text-xs font-medium ${heartbeatStatus === 'active' ? 'text-red-400' : 'text-neutral-500'}`}>
                إرسال الميك: {heartbeatStatus === 'active' ? 'نشط' : 'متوقف'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${audioBackendStatus === 'connected' ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]' : 'bg-neutral-600'}`}></div>
              <span className={`text-xs font-medium ${audioBackendStatus === 'connected' ? 'text-emerald-400' : 'text-neutral-500'}`}>
                Audio backend: {audioBackendStatus === 'connected' ? 'متصل' : 'غير متصل'}
              </span>
            </div>
            <button type="button" onClick={(e) => toggleConnection(e)} className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${isConnected ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/20'}`}>
              {isConnected ? "قطع الاتصال" : "الاتصال"}
            </button>
          </div>
          </div>

        </div>

        {/* Mic Button */}
        <button onClick={toggleMic} disabled={!isConnected} className={`group relative flex flex-col items-center justify-center w-64 h-64 rounded-full border-4 transition-all duration-500 ${!isConnected ? 'border-neutral-900 bg-neutral-950/50 opacity-50 cursor-not-allowed' : isMicOpen ? 'border-red-500/50 bg-neutral-900 shadow-[0_0_50px_rgba(239,68,68,0.3)]' : 'border-neutral-800 bg-neutral-900/50 hover:bg-neutral-800 hover:border-neutral-700 shadow-xl'}`}>
          {isMicOpen && <div className="absolute inset-[-4px] rounded-full border-4 border-red-500 opacity-20 animate-ping pointer-events-none"></div>}
          <div className={`text-6xl mb-4 transition-transform duration-300 ${!isConnected ? 'text-neutral-600' : isMicOpen ? 'scale-110 text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.6)]' : 'text-neutral-400 group-hover:text-neutral-300'}`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {isMicOpen ? (<><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" x2="12" y1="19" y2="22"></line></>) : (<><line x1="2" x2="22" y1="2" y2="22"></line><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"></path><path d="M5 10v2a7 7 0 0 0 12 5"></path><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"></path><path d="M9 9v3a3 3 0 0 0 5.12 2.12"></path><line x1="12" x2="12" y1="19" y2="22"></line></>)}
            </svg>
          </div>
          <span className={`text-xl font-bold transition-colors ${!isConnected ? 'text-neutral-600' : isMicOpen ? 'text-red-100' : 'text-neutral-400 group-hover:text-neutral-200'}`}>{isMicOpen ? 'الميك مفتوح' : 'الميك مغلق'}</span>
        </button>

        {/* ── Monitoring section: button + volume + warning ─────────────────── */}
        {isConnected && (
          <div className="flex flex-col items-center gap-2 w-full max-w-xs">
            {/* Monitoring toggle */}
            <button
              onClick={toggleMonitoring}
              title={isMonitoring ? 'إيقاف المراقبة' : 'تفعيل سماع المراقبة عبر السماعات'}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
                isMonitoring
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-400 shadow-[0_0_14px_rgba(245,158,11,0.2)]'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-500 hover:text-neutral-300 hover:border-neutral-600'
              }`}
            >
              🎧 المراقبة: {isMonitoring ? 'ON' : 'OFF'}
            </button>
            {/* Monitor volume slider — only when ON */}
            <div className={`w-full flex flex-col gap-1.5 bg-neutral-900/60 border rounded-xl px-4 py-3 transition-opacity ${
              isMonitoring ? 'border-amber-500/20 opacity-100' : 'border-neutral-800 opacity-40 pointer-events-none'
            }`}>
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-amber-300">مستوى صوت المراقبة</label>
                <span className="text-xs font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                  {Math.round(monitorVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={monitorVolume}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  setMonitorVolume(v);
                  if (isMonitoring && monitorGainRef.current) {
                    monitorGainRef.current.gain.value = v;
                  }
                }}
                className="w-full h-1.5 accent-amber-400 cursor-pointer"
              />
            </div>
            {/* Feedback warning */}
            {isMonitoring && (
              <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] px-3 py-1.5 rounded-lg w-full text-center justify-center">
                <span>⚠️</span>
                <span>استخدم سماعات Headphones لتجنب الصفير / feedback</span>
              </div>
            )}
          </div>
        )}

        {/* ── Mic Source Selector ──────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 w-full max-w-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-400">مصدر الميكروفون</span>
            <button
              onClick={refreshAudioInputDevices}
              title="تحديث قائمة الأجهزة"
              className="text-[10px] px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 transition-colors"
            >
              ↻ تحديث الأجهزة
            </button>
          </div>
          <select
            value={selectedMicDeviceId}
            onChange={e => switchMicDevice(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500/60 cursor-pointer"
          >
            {audioInputDevices.length === 0 && (
              <option value="">الميكروفون الافتراضي</option>
            )}
            {audioInputDevices.map((dev, i) => (
              <option key={dev.deviceId} value={dev.deviceId}>
                {dev.label || `ميكروفون ${i + 1}${dev.deviceId === 'default' ? ' (افتراضي)' : ''}`}
              </option>
            ))}
          </select>
          {micDeviceError && (
            <div className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2.5 py-1.5 rounded-lg">
              ⚠️ {micDeviceError}
            </div>
          )}
          <p className="text-[9px] text-neutral-600 text-center leading-relaxed">
            قد تظهر أسماء الأجهزة بعد منح صلاحية الميكروفون
          </p>
        </div>

        {/* [DIAG] TEMP: Direct file-to-mixer test button */}
        {isConnected && (
          <button
            id="diag-test-file-mixer"
            onClick={testFileMixer}
            className="mt-4 px-6 py-2.5 rounded-xl text-sm font-bold border-2 border-yellow-500/60 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/20 transition-all shadow-[0_0_15px_rgba(234,179,8,0.2)] tracking-wide"
          >
            🧪 TEST FILE TO MIXER
          </button>
        )}

        {/* Mic Error */}
        {micError && (
          <div className="mt-4 w-full bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl px-4 py-3 text-center">
            {micError}
          </div>
        )}

        {/* Voice Indicator — driven by real volumeLevel when mic is open */}
        <div className={`mt-6 flex items-center justify-center gap-1.5 h-10 w-full transition-opacity duration-300 ${isConnected ? 'opacity-100' : 'opacity-30'}`}>
          {[...Array(10)].map((_, i) => {
            // Shape: centre bars are tallest at full volume
            const posWeight = 1 - Math.abs(i - 4.5) / 4.5; // 0..1, peaks at centre
            const barHeight = isMicOpen
              ? Math.max(0.08, volumeLevel * posWeight + (Math.random() * 0.08 * volumeLevel))
              : 0;
            return (
              <div
                key={i}
                className={`w-2 rounded-full transition-all ${isMicOpen ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 'bg-neutral-800'}`}
                style={isMicOpen
                  ? { height: `${Math.round(barHeight * 100)}%` }
                  : { height: '6px' }}
              />
            );
          })}
        </div>

        {/* Now Playing Card */}
        <div className="w-full mt-10 bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-indigo-500/5 to-transparent pointer-events-none"></div>
          <h3 className="text-lg font-semibold text-neutral-300 mb-4 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
            الحالة الحالية
          </h3>
          <div className="space-y-3">
            <div className="bg-neutral-950 rounded-xl p-3 border border-neutral-800/50">
              <span className="text-xs text-neutral-500 font-bold tracking-wider uppercase block mb-1">جاهز للتشغيل</span>
              <span className="text-sm text-neutral-300">
                {activeSongLabel
                  ? (firstReadySong ? `${activeSongLabel}` : `${activeSongLabel} — ينتظر غلق المايك`)
                  : "لا توجد أغاني في قائمة الانتظار"}
              </span>
            </div>
            <div className="bg-neutral-950 rounded-xl p-3 border border-neutral-800/50">
              <span className="text-xs text-neutral-500 font-bold tracking-wider uppercase block mb-1">قائمة الانتظار</span>
              <span className={`text-sm ${mediaQueue.length > 0 ? 'text-neutral-300' : 'text-neutral-400 italic'}`}>{mediaQueue.length > 0 ? `${mediaQueue.length} عنصر في الانتظار` : "قائمة الانتظار فارغة"}</span>
            </div>
            <div className="bg-neutral-950 rounded-xl p-3 border border-neutral-800/50">
              <span className="text-xs text-neutral-500 font-bold tracking-wider uppercase block mb-1">الخلفية</span>
              <span className="text-sm text-indigo-300 font-medium">{activeBgTrack || "لا يوجد موسيقى خلفية"}</span>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-neutral-800/50 text-center text-sm font-medium">
            {isMicOpen ? (
              <div className="flex flex-col items-center gap-1">
                <span className="text-amber-400 flex items-center justify-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></div>الميك مفتوح — العناصر المختارة تنتظر غلق الميك</span>
                <span className="text-xs text-amber-500/80 font-normal">عند غلق الميك ستصبح جميع عناصر قائمة الانتظار جاهزة</span>
              </div>
            ) : isConnected ? (
              <span className="text-emerald-400 flex items-center justify-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>الميك مغلق — يمكن إضافة أغاني وفواصل وإعلانات للانتظار</span>
            ) : (
              <span className="text-neutral-500">في انتظار الاتصال بالخادم...</span>
            )}
          </div>
          {isConnected && !isMicOpen && mediaQueue.some(q => q.mediaType === "SONG" && q.status === "READY") && (
            <button onClick={handleShuffle} className="mt-4 w-full py-2.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-sm font-medium rounded-xl border border-indigo-500/30 transition-colors flex items-center justify-center gap-2 shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>
              تشغيل أغنية عشوائية من نفس القسم
            </button>
          )}
        </div>

        {/* ── Media Library Panel ─────────────────────────────────────────── */}
        <div className="w-full mt-8 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-lg relative overflow-hidden z-20">

          {/* Tab bar */}
          <div className="flex border-b border-neutral-800 overflow-x-auto">
            {([
              { key: "background" as MediaTab, label: "خلفية",   color: "text-indigo-400",  activeBg: "bg-indigo-500/10 border-b-2 border-indigo-500" },
              { key: "songs"      as MediaTab, label: "أغاني",   color: "text-cyan-400",    activeBg: "bg-cyan-500/10 border-b-2 border-cyan-500" },
              { key: "breaks"     as MediaTab, label: "فواصل",   color: "text-amber-400",   activeBg: "bg-amber-500/10 border-b-2 border-amber-500" },
              { key: "ads"        as MediaTab, label: "إعلانات", color: "text-rose-400",    activeBg: "bg-rose-500/10 border-b-2 border-rose-500" },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveMediaTab(tab.key)}
                className={`flex-1 min-w-[70px] px-3 py-3 text-sm font-medium transition-colors ${
                  activeMediaTab === tab.key
                    ? `${tab.color} ${tab.activeBg}`
                    : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-5">

            {/* ── Background ─────────────────────────────────────── */}
            {activeMediaTab === "background" && (
              <div>
                <p className="text-xs text-indigo-400/80 bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-3 py-2 mb-4">
                  ✔ {MEDIA_POLICY.BACKGROUND.label} — مسموح مع المايك كسياسة تشغيل. المعاينة داخل المتصفح فقط وليست على البث المباشر.
                </p>

                {/* ── Background Volume Slider ── */}
                <div className="mb-4 flex flex-col gap-2 bg-indigo-500/5 border border-indigo-500/20 rounded-xl px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-indigo-300">مستوى موسيقى الخلفية</label>
                    <span className="text-xs font-mono text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                      {`${Math.round(bgVolume * 100)}%`}{isMicOpen ? ' (مخفوت)' : ''}
                    </span>
                  </div>
                  {/* direction:ltr prevents RTL page from inverting the fill direction */}
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(bgVolume * 100)}
                    onChange={e => {
                      const v = Number(e.target.value) / 100;
                      // 1. Sync ref immediately — do NOT wait for the useEffect to fire
                      bgVolumeRef.current = v;
                      // 2. Schedule React state update (for display + effect safety-net)
                      setBgVolume(v);
                      // 3. Apply gain RIGHT NOW using the fresh value — bypasses async effect chain
                      applyBgGain('fader-change', v);
                    }}
                    style={{ direction: 'ltr' }}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                  {isMicOpen && (
                    <p className="text-[10px] text-amber-400/80 mt-1">⚠ الصوت مخفوت تلقائياً أثناء المايك — الفادر يتحكم في النسبة الكاملة التي تُستعاد بعد الغلق.</p>
                  )}
                </div>

                {bgCategories.length === 0 && localFiles.background.length === 0 ? (
                  <p className="text-sm text-neutral-500 text-center py-4">لا توجد موسيقى خلفية. أضفها من لوحة الإدارة أو اختر ملفات من جهازك.</p>
                ) : (
                  <div className="space-y-2">
                    {bgCategories.map(cat => (
                      <div key={cat.id} className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-950/50">
                        <button onClick={() => setOpenCategory(openCategory === cat.id ? null : cat.id)} className="w-full flex items-center justify-between p-4 hover:bg-neutral-800/50 transition-colors">
                          <span className="font-medium text-neutral-300">{cat.name}</span>
                          <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 text-neutral-500 transition-transform ${openCategory === cat.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </button>
                        {openCategory === cat.id && (
                          <div className="p-3 border-t border-neutral-800 bg-neutral-950 space-y-2">
                            {cat.tracks.length === 0 ? (
                              <p className="text-xs text-neutral-500 text-center py-2">لا توجد مسارات.</p>
                            ) : cat.tracks.map(track => (
                              <div key={track.id} className="flex items-center justify-between bg-neutral-900 p-3 rounded-lg border border-neutral-800">
                                <span className="text-sm text-neutral-300">{track.title}</span>
                                <button onClick={() => { const n = activeBgTrackId === track.id ? null : track.id; setActiveBgTrackId(n); if (n) showFadeMessage("تم اختيار موسيقى خلفية"); }} className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${activeBgTrackId === track.id ? "bg-indigo-500 text-white" : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300"}`}>
                                  {activeBgTrackId === track.id ? "إلغاء" : "اختيار"}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Local files section (background) ── */}
                <div className="mt-4 pt-4 border-t border-neutral-800">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                      <span className="text-xs font-semibold text-green-400 uppercase tracking-wider">من جهازي</span>
                      <span className="text-xs text-neutral-600 border border-neutral-800 px-2 py-0.5 rounded-full">جلسة فقط</span>
                    </div>
                    {localFiles.background.length > 0 && (
                      <button onClick={() => handleClearLocalFiles("background")} className="text-xs text-red-500/60 hover:text-red-400 transition-colors">مسح الكل</button>
                    )}
                  </div>
                  {localFiles.background.map(f => {
                    const isActiveBg = activeBgLocalUrl === f.objectUrl;
                    return (
                    <div key={f.id} className="mb-2 p-3 bg-green-500/5 border border-green-500/20 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-green-300 truncate max-w-[45%]" title={f.name}>{f.name}</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              if (isActiveBg) {
                                setActiveBgLocalUrl(null);
                                showFadeMessage("تم إيقاف الخلفية المحلية");
                              } else {
                                setActiveBgTrackId(null); // clear DB bg
                                setActiveBgLocalUrl(f.objectUrl);
                                showFadeMessage("تم اختيار ملف محلي كخلفية");
                              }
                            }}
                            className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                              isActiveBg
                                ? "bg-indigo-500 text-white"
                                : "bg-neutral-700 hover:bg-indigo-500/30 hover:text-indigo-300 text-neutral-400"
                            }`}
                          >
                            {isActiveBg ? "✓ خلفية" : "تشغيل كخلفية"}
                          </button>
                          <button onClick={() => { if (isActiveBg) setActiveBgLocalUrl(null); handleRemoveLocalFile("background", f.id); }} className="text-neutral-600 hover:text-red-400 transition-colors text-xs">✕</button>
                        </div>
                      </div>
                      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                      <audio controls src={f.objectUrl} className="w-full h-8" style={{ colorScheme: "dark" }} />
                    </div>
                    );
                  })}
                  <label className="mt-2 flex items-center gap-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 border-dashed rounded-xl text-xs text-neutral-400 hover:text-neutral-200 cursor-pointer transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    اختر ملف صوتي من جهازك
                    <input type="file" accept="audio/*" multiple className="hidden" onChange={e => handleLocalFilePick("background", e.target.files)} />
                  </label>
                </div>
              </div>
            )}
            {activeMediaTab === "songs" && (
              <div>
                <p className="text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-4">
                  {MEDIA_POLICY.SONG.label} — {isMicOpen ? MEDIA_POLICY.SONG.waitLabel : "يمكن إضافتها لقائمة الانتظار"}
                </p>
                {songCategories.length === 0 && localFiles.songs.length === 0 ? (
                  <p className="text-sm text-neutral-500 text-center py-4">لا توجد أغاني في المكتبة. أضفها من لوحة الإدارة أو اختر ملفات من جهازك.</p>
                ) : (
                  <div className="space-y-2">
                    {songCategories.map(cat => (
                      <div key={cat.id} className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-950/50">
                        <button onClick={() => setOpenSongCategory(openSongCategory === cat.id ? null : cat.id)} className="w-full flex items-center justify-between p-4 hover:bg-neutral-800/50 transition-colors">
                          <span className="font-medium text-neutral-300">{cat.name}</span>
                          <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 text-neutral-500 transition-transform ${openSongCategory === cat.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </button>
                        {openSongCategory === cat.id && (
                          <div className="p-3 border-t border-neutral-800 bg-neutral-950 space-y-2">
                            {cat.tracks.length === 0 ? (
                              <p className="text-xs text-neutral-500 text-center py-2">لا توجد مسارات.</p>
                            ) : cat.tracks.map(track => {
                              const isQueued = mediaQueue.some(q => q.trackId === track.id && q.mediaType === "SONG");
                              const qItem   = mediaQueue.find(q => q.trackId === track.id && q.mediaType === "SONG");
                              const statusLabel = qItem?.status === "READY_AFTER_MIC_CLOSE" ? "ينتظر" : qItem?.status === "READY" ? "جاهز" : null;
                              return (
                                <div key={track.id} className={`flex items-center justify-between p-3 rounded-lg border transition-all ${isQueued ? "bg-indigo-500/10 border-indigo-500/30" : "bg-neutral-900 border-neutral-800"}`}>
                                  <div className="flex flex-col">
                                    <span className="text-sm text-neutral-300">{track.title}</span>
                                    {isQueued && <span className="text-[10px] text-indigo-400 mt-1 font-medium tracking-wider uppercase">{statusLabel ?? "في الانتظار"}</span>}
                                  </div>
                                  <button onClick={() => handleSelectSong(track.id, track.title, cat.ownerType as "ADMIN" | "PRESENTER")} disabled={!isConnected} className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${!isConnected ? "bg-neutral-800 text-neutral-600 opacity-50 cursor-not-allowed" : isQueued ? "bg-indigo-500 text-white" : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300"}`}>
                                    {isQueued ? "إلغاء" : "أضف للانتظار"}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Local files section (songs) ── */}
                <div className="mt-4 pt-4 border-t border-neutral-800">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                      <span className="text-xs font-semibold text-green-400 uppercase tracking-wider">من جهازي</span>
                      <span className="text-xs text-neutral-600 border border-neutral-800 px-2 py-0.5 rounded-full">جلسة فقط</span>
                    </div>
                    {localFiles.songs.length > 0 && (
                      <button onClick={() => handleClearLocalFiles("songs")} className="text-xs text-red-500/60 hover:text-red-400 transition-colors">مسح الكل</button>
                    )}
                  </div>
                  <p className="text-xs text-amber-500/70 mb-2">⚠ ملفاتك المحلية — استخدم زر +انتظار للإضافة للقائمة. المعاينة داخل المتصفح فقط وليست على البث.</p>
                  {localFiles.songs.map(f => {
                    const isQueued = mediaQueue.some(q => q.trackId === f.id && q.mediaType === "SONG");
                    return (
                    <div key={f.id} className="mb-2 p-3 bg-green-500/5 border border-green-500/20 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-green-300 truncate max-w-[55%]" title={f.name}>{f.name}</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => isQueued
                              ? removeQueueItem(mediaQueue.find(q => q.trackId === f.id && q.mediaType === "SONG")!.id)
                              : enqueueLocalFile("songs", f)}
                            className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${isQueued ? "bg-indigo-500 text-white" : "bg-neutral-700 hover:bg-indigo-500/30 hover:text-indigo-300 text-neutral-400"}`}
                          >
                            {isQueued ? "✓" : "+انتظار"}
                          </button>
                          <button onClick={() => handleRemoveLocalFileWithQueueCleanup("songs", f.id)} className="text-neutral-600 hover:text-red-400 transition-colors text-xs">✕</button>
                        </div>
                      </div>
                      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                      <audio controls src={f.objectUrl} className="w-full h-8" style={{ colorScheme: "dark" }} />
                    </div>
                    );
                  })}
                  <label className="mt-2 flex items-center gap-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 border-dashed rounded-xl text-xs text-neutral-400 hover:text-neutral-200 cursor-pointer transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    اختر ملف صوتي من جهازك
                    <input type="file" accept="audio/*" multiple className="hidden" onChange={e => handleLocalFilePick("songs", e.target.files)} />
                  </label>
                </div>
              </div>
            )}
            {activeMediaTab === "breaks" && (
              <div className="space-y-4">
                <p className="text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  {MEDIA_POLICY.BREAK.label} — {isMicOpen ? MEDIA_POLICY.BREAK.waitLabel : "يمكن إضافتها لقائمة الانتظار"}
                </p>

                {/* Admin shared breaks */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>
                    <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">فواصل المحطة</span>
                    <span className="text-xs text-neutral-600 border border-neutral-800 px-2 py-0.5 rounded-full">Admin</span>
                  </div>
                  {adminBreakCategories.length === 0 ? (
                    <p className="text-xs text-neutral-600 text-center py-3 border border-dashed border-neutral-800 rounded-xl">لا توجد فواصل محطة. أضفها من لوحة الإدارة.</p>
                  ) : (
                    <div className="space-y-2">
                      {adminBreakCategories.map(cat => (
                        <div key={cat.id} className="border border-amber-500/20 rounded-xl overflow-hidden bg-amber-500/5">
                          <button onClick={() => setOpenBreakCategory(openBreakCategory === cat.id ? null : cat.id)} className="w-full flex items-center justify-between p-3 hover:bg-amber-500/10 transition-colors">
                            <span className="font-medium text-neutral-300 text-sm">{cat.name}</span>
                            <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 text-neutral-500 transition-transform ${openBreakCategory === cat.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                          </button>
                          {openBreakCategory === cat.id && (
                            <div className="p-3 border-t border-amber-500/20 bg-neutral-950 space-y-2">
                              {cat.tracks.length === 0 ? <p className="text-xs text-neutral-500 text-center py-2">لا توجد مسارات.</p>
                                : cat.tracks.map(track => {
                                const isQueued = mediaQueue.some(q => q.trackId === track.id && q.mediaType === "BREAK");
                                return (
                                <div key={track.id} className="flex items-center justify-between bg-neutral-900 p-3 rounded-lg border border-neutral-800">
                                  <span className="text-sm text-neutral-300">{track.title}</span>
                                  <button
                                    onClick={() => {
                                      if (isQueued) { removeQueueItem(mediaQueue.find(q => q.trackId === track.id && q.mediaType === "BREAK")!.id); }
                                      else { enqueueItem(track.id, track.title, "BREAK", "ADMIN_DB", "ADMIN", undefined, track.fileUrl); showFadeMessage(isMicOpen ? "سيتم التشغيل بعد غلق المايك" : "تمت الإضافة لقائمة الانتظار"); }
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isQueued ? "bg-amber-500 text-white" : "bg-neutral-800 hover:bg-amber-500/20 hover:text-amber-300 text-neutral-400"}`}
                                  >
                                    {isQueued ? "✓ في الانتظار" : "أضف للانتظار"}
                                  </button>
                                </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                 {/* Presenter DB-backed breaks — personal library from admin-assigned categories */}
                 <div>
                   <div className="flex items-center gap-2 mb-2">
                     <span className="w-1.5 h-1.5 rounded-full bg-amber-300 inline-block"></span>
                     <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">فواصلي</span>
                     <span className="text-xs text-neutral-600 border border-neutral-800 px-2 py-0.5 rounded-full">مكتبتي</span>
                   </div>
                   {localPresenterBreakCats.length === 0 ? (
                     <p className="text-xs text-neutral-600 text-center py-3 border border-dashed border-neutral-800 rounded-xl">لا توجد فواصل خاصة بعد — ارفع فاصلك أدناه.</p>
                   ) : (
                     <div className="space-y-2">
                       {localPresenterBreakCats.map(cat => (
                         <div key={cat.id} className="border border-amber-300/20 rounded-xl overflow-hidden bg-amber-300/5">
                           <button onClick={() => setOpenBreakCategory(openBreakCategory === cat.id ? null : cat.id)} className="w-full flex items-center justify-between p-3 hover:bg-amber-300/10 transition-colors">
                             <span className="font-medium text-neutral-300 text-sm">{cat.name}</span>
                             <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 text-neutral-500 transition-transform ${openBreakCategory === cat.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                           </button>
                           {openBreakCategory === cat.id && (
                             <div className="p-3 border-t border-amber-300/20 bg-neutral-950 space-y-2">
                               {cat.tracks.length === 0
                                 ? <p className="text-xs text-neutral-500 text-center py-2">لا توجد مسارات.</p>
                                 : cat.tracks.map(track => {
                                     const isQueued = mediaQueue.some(q => q.trackId === track.id && q.mediaType === "BREAK");
                                     return (
                                       <div key={track.id} className="flex items-center justify-between bg-neutral-900 p-3 rounded-lg border border-neutral-800">
                                         <span className="text-sm text-neutral-300">{track.title}</span>
                                         <button
                                           onClick={() => {
                                             enqueueItem(track.id, track.title, "BREAK", "PRESENTER_DB", "PRESENTER", undefined, track.fileUrl);
                                             showFadeMessage(isMicOpen ? "سيتم التشغيل بعد غلق المايك" : "تمت الإضافة لقائمة الانتظار");
                                           }}
                                           className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isQueued ? "bg-amber-400 text-white" : "bg-neutral-800 hover:bg-amber-400/20 hover:text-amber-300 text-neutral-400"}`}
                                         >
                                           {isQueued ? "✓ أضف مرة أخرى" : "أضف للانتظار"}
                                         </button>
                                       </div>
                                     );
                                   })
                               }
                             </div>
                           )}
                         </div>
                       ))}
                     </div>
                   )}

                   {/* ── Presenter upload — saves to DB (فواصلي) ── */}
                   <PresenterUploadWidget
                     mediaType="BREAK"
                     onUploaded={(track, category) => {
                       setLocalPresenterBreakCats(prev => {
                         const existing = prev.find(c => c.id === category.id);
                         if (existing) {
                           return prev.map(c => c.id === category.id
                             ? { ...c, tracks: [...c.tracks, { id: track.id, title: track.title, fileUrl: track.fileUrl }] }
                             : c
                           );
                         }
                         return [...prev, { id: category.id, name: category.name, ownerType: category.ownerType, tracks: [{ id: track.id, title: track.title, fileUrl: track.fileUrl }] }];
                       });
                     }}
                   />
                 </div>

                 {/* Presenter personal breaks — local device file picker (session-scoped only) */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                      <span className="text-xs font-semibold text-green-400 uppercase tracking-wider">فواصلي من جهازي</span>
                      <span className="text-xs text-neutral-600 border border-neutral-800 px-2 py-0.5 rounded-full">جلسة فقط</span>
                    </div>
                    {localFiles.breaks.length > 0 && (
                      <button onClick={() => handleClearLocalFiles("breaks")} className="text-xs text-red-500/60 hover:text-red-400 transition-colors">مسح الكل</button>
                    )}
                  </div>
                  {localFiles.breaks.map(f => {
                    const isQueued = mediaQueue.some(q => q.trackId === f.id && q.mediaType === "BREAK");
                    return (
                    <div key={f.id} className="mb-2 p-3 bg-green-500/5 border border-green-500/20 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-green-300 truncate max-w-[55%]" title={f.name}>{f.name}</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => isQueued
                              ? removeQueueItem(mediaQueue.find(q => q.trackId === f.id && q.mediaType === "BREAK")!.id)
                              : enqueueLocalFile("breaks", f)}
                            className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${isQueued ? "bg-amber-500 text-white" : "bg-neutral-700 hover:bg-amber-500/30 hover:text-amber-300 text-neutral-400"}`}
                          >
                            {isQueued ? "✓" : "+انتظار"}
                          </button>
                          <button onClick={() => handleRemoveLocalFileWithQueueCleanup("breaks", f.id)} className="text-neutral-600 hover:text-red-400 transition-colors text-xs">✕</button>
                        </div>
                      </div>
                      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                      <audio controls src={f.objectUrl} className="w-full h-8" style={{ colorScheme: "dark" }} />
                    </div>
                    );
                  })}
                  <label className="mt-2 flex items-center gap-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 border-dashed rounded-xl text-xs text-neutral-400 hover:text-neutral-200 cursor-pointer transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    اختر فاصل/جينغل من جهازك
                    <input type="file" accept="audio/*" multiple className="hidden" onChange={e => handleLocalFilePick("breaks", e.target.files)} />
                  </label>
                </div>
              </div>
            )}

            {/* ── Ads / Promos ────────────────────────────────────── */}
            {activeMediaTab === "ads" && (
              <div className="space-y-4">
                <p className="text-xs text-rose-400/80 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                  {MEDIA_POLICY.AD.label} — {isMicOpen ? MEDIA_POLICY.AD.waitLabel : "يمكن إضافتها لقائمة الانتظار"}
                </p>

                {/* Admin shared ads */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 inline-block"></span>
                    <span className="text-xs font-semibold text-rose-400 uppercase tracking-wider">إعلانات المحطة</span>
                    <span className="text-xs text-neutral-600 border border-neutral-800 px-2 py-0.5 rounded-full">Admin</span>
                  </div>
                  {adminAdCategories.length === 0 ? (
                    <p className="text-xs text-neutral-600 text-center py-3 border border-dashed border-neutral-800 rounded-xl">لا توجد إعلانات محطة. أضفها من لوحة الإدارة.</p>
                  ) : (
                    <div className="space-y-2">
                      {adminAdCategories.map(cat => (
                        <div key={cat.id} className="border border-rose-500/20 rounded-xl overflow-hidden bg-rose-500/5">
                          <button onClick={() => setOpenAdCategory(openAdCategory === cat.id ? null : cat.id)} className="w-full flex items-center justify-between p-3 hover:bg-rose-500/10 transition-colors">
                            <span className="font-medium text-neutral-300 text-sm">{cat.name}</span>
                            <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 text-neutral-500 transition-transform ${openAdCategory === cat.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                          </button>
                          {openAdCategory === cat.id && (
                            <div className="p-3 border-t border-rose-500/20 bg-neutral-950 space-y-2">
                              {cat.tracks.length === 0 ? <p className="text-xs text-neutral-500 text-center py-2">لا توجد مسارات.</p>
                                : cat.tracks.map(track => {
                                const isQueued = mediaQueue.some(q => q.trackId === track.id && q.mediaType === "AD");
                                return (
                                <div key={track.id} className="flex items-center justify-between bg-neutral-900 p-3 rounded-lg border border-neutral-800">
                                  <span className="text-sm text-neutral-300">{track.title}</span>
                                  <button
                                    onClick={() => {
                                      // Queue V2: always add; remove via ✕ in queue panel
                                      enqueueItem(track.id, track.title, "AD", "ADMIN_DB", "ADMIN", undefined, track.fileUrl);
                                      showFadeMessage(isMicOpen ? "سيتم التشغيل بعد غلق المايك" : "تمت الإضافة لقائمة الانتظار");
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isQueued ? "bg-rose-600 text-white" : "bg-neutral-800 hover:bg-rose-500/20 hover:text-rose-300 text-neutral-400"}`}
                                  >
                                    {isQueued ? "✓ أضف مرة أخرى" : "أضف للانتظار"}
                                  </button>
                                </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                 {/* Presenter DB-backed ads — personal library from admin-assigned categories */}
                 <div>
                   <div className="flex items-center gap-2 mb-2">
                     <span className="w-1.5 h-1.5 rounded-full bg-rose-300 inline-block"></span>
                     <span className="text-xs font-semibold text-rose-300 uppercase tracking-wider">إعلاناتي</span>
                     <span className="text-xs text-neutral-600 border border-neutral-800 px-2 py-0.5 rounded-full">مكتبتي</span>
                   </div>
                   {localPresenterAdCats.length === 0 ? (
                     <p className="text-xs text-neutral-600 text-center py-3 border border-dashed border-neutral-800 rounded-xl">لا توجد إعلانات خاصة بعد — ارفع إعلانك أدناه.</p>
                   ) : (
                     <div className="space-y-2">
                       {localPresenterAdCats.map(cat => (
                         <div key={cat.id} className="border border-rose-300/20 rounded-xl overflow-hidden bg-rose-300/5">
                           <button onClick={() => setOpenAdCategory(openAdCategory === cat.id ? null : cat.id)} className="w-full flex items-center justify-between p-3 hover:bg-rose-300/10 transition-colors">
                             <span className="font-medium text-neutral-300 text-sm">{cat.name}</span>
                             <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 text-neutral-500 transition-transform ${openAdCategory === cat.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                           </button>
                           {openAdCategory === cat.id && (
                             <div className="p-3 border-t border-rose-300/20 bg-neutral-950 space-y-2">
                               {cat.tracks.length === 0
                                 ? <p className="text-xs text-neutral-500 text-center py-2">لا توجد مسارات.</p>
                                 : cat.tracks.map(track => {
                                     const isQueued = mediaQueue.some(q => q.trackId === track.id && q.mediaType === "AD");
                                     return (
                                       <div key={track.id} className="flex items-center justify-between bg-neutral-900 p-3 rounded-lg border border-neutral-800">
                                         <span className="text-sm text-neutral-300">{track.title}</span>
                                         <button
                                           onClick={() => {
                                             enqueueItem(track.id, track.title, "AD", "PRESENTER_DB", "PRESENTER", undefined, track.fileUrl);
                                             showFadeMessage(isMicOpen ? "سيتم التشغيل بعد غلق المايك" : "تمت الإضافة لقائمة الانتظار");
                                           }}
                                           className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isQueued ? "bg-rose-400 text-white" : "bg-neutral-800 hover:bg-rose-400/20 hover:text-rose-300 text-neutral-400"}`}
                                         >
                                           {isQueued ? "✓ أضف مرة أخرى" : "أضف للانتظار"}
                                         </button>
                                       </div>
                                     );
                                   })
                               }
                             </div>
                           )}
                         </div>
                       ))}
                     </div>
                   )}

                   {/* ── Presenter upload — saves to DB (إعلاناتي) ── */}
                   <PresenterUploadWidget
                     mediaType="AD"
                     onUploaded={(track, category) => {
                       setLocalPresenterAdCats(prev => {
                         const existing = prev.find(c => c.id === category.id);
                         if (existing) {
                           return prev.map(c => c.id === category.id
                             ? { ...c, tracks: [...c.tracks, { id: track.id, title: track.title, fileUrl: track.fileUrl }] }
                             : c
                           );
                         }
                         return [...prev, { id: category.id, name: category.name, ownerType: category.ownerType, tracks: [{ id: track.id, title: track.title, fileUrl: track.fileUrl }] }];
                       });
                     }}
                   />
                 </div>

                 {/* Presenter personal ads — local device file picker (session-scoped only) */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                      <span className="text-xs font-semibold text-green-400 uppercase tracking-wider">إعلاناتي من جهازي</span>
                      <span className="text-xs text-neutral-600 border border-neutral-800 px-2 py-0.5 rounded-full">جلسة فقط</span>
                    </div>
                    {localFiles.ads.length > 0 && (
                      <button onClick={() => handleClearLocalFiles("ads")} className="text-xs text-red-500/60 hover:text-red-400 transition-colors">مسح الكل</button>
                    )}
                  </div>
                  {localFiles.ads.map(f => {
                    const isQueued = mediaQueue.some(q => q.trackId === f.id && q.mediaType === "AD");
                    return (
                    <div key={f.id} className="mb-2 p-3 bg-green-500/5 border border-green-500/20 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-green-300 truncate max-w-[55%]" title={f.name}>{f.name}</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => isQueued
                              ? removeQueueItem(mediaQueue.find(q => q.trackId === f.id && q.mediaType === "AD")!.id)
                              : enqueueLocalFile("ads", f)}
                            className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${isQueued ? "bg-rose-600 text-white" : "bg-neutral-700 hover:bg-rose-500/30 hover:text-rose-300 text-neutral-400"}`}
                          >
                            {isQueued ? "✓" : "+انتظار"}
                          </button>
                          <button onClick={() => handleRemoveLocalFileWithQueueCleanup("ads", f.id)} className="text-neutral-600 hover:text-red-400 transition-colors text-xs">✕</button>
                        </div>
                      </div>
                      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                      <audio controls src={f.objectUrl} className="w-full h-8" style={{ colorScheme: "dark" }} />
                    </div>
                    );
                  })}
                  <label className="mt-2 flex items-center gap-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 border-dashed rounded-xl text-xs text-neutral-400 hover:text-neutral-200 cursor-pointer transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    اختر إعلان/بروموتر من جهازك
                    <input type="file" accept="audio/*" multiple className="hidden" onChange={e => handleLocalFilePick("ads", e.target.files)} />
                  </label>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* ── SFX Pads Panel ────────────────────────────────────────────── */}
        {(
          <div className="w-full mt-4 bg-neutral-900 border border-emerald-500/20 rounded-2xl shadow-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">💥</span>
                <span className="text-sm font-semibold text-emerald-400">مؤثرات صوتية (SFX)</span>
                {sfxPreloadStatus === 'loading' && (
                  <span className="w-3 h-3 border-2 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin" />
                )}
                {sfxPreloadStatus === 'ready' && (
                  <span className="text-[10px] text-emerald-500/60 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">جاهز</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-neutral-500">الصوت</span>
                <input
                  type="range" min="0" max="1" step="0.01"
                  value={sfxVolume}
                  onChange={e => setSfxVolume(parseFloat(e.target.value))}
                  className="w-20 h-1 accent-emerald-500 cursor-pointer"
                />
                <span className="text-[10px] text-neutral-500 tabular-nums w-8">{Math.round(sfxVolume * 100)}%</span>
              </div>
            </div>
            <div className="p-3 space-y-2">
              {sfxCategories.length === 0 && (
                <div className="text-center py-6 text-neutral-500">
                  <p className="text-sm">لا توجد مؤثرات صوتية</p>
                  <p className="text-xs mt-1">أضف مؤثرات من لوحة الإدارة</p>
                </div>
              )}
              {sfxCategories.map(cat => (
                <div key={cat.id} className="bg-neutral-800/50 rounded-xl border border-neutral-800 overflow-hidden">
                  <button
                    onClick={() => setOpenSfxCategory(openSfxCategory === cat.id ? null : cat.id)}
                    className="w-full flex items-center justify-between p-3 hover:bg-emerald-500/10 transition-colors"
                  >
                    <span className="text-xs font-medium text-neutral-200">{cat.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-neutral-500">{cat.tracks.length} مؤثر</span>
                      <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 text-neutral-500 transition-transform ${openSfxCategory === cat.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                  </button>
                  {openSfxCategory === cat.id && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 p-3 pt-0">
                      {cat.tracks.map(track => {
                        const isLoaded = sfxBuffersRef.current.has(track.id);
                        const isActive = activeSfxRef.current.has(track.id);
                        return (
                          <button
                            key={track.id}
                            onClick={() => isActive ? stopSfx(track.id) : playSfx(track.id)}
                            disabled={!isLoaded && sfxPreloadStatus !== 'ready'}
                            className={`relative p-3 rounded-xl border text-xs font-medium transition-all text-center truncate ${
                              isActive
                                ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
                                : isLoaded
                                  ? "bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-300 active:scale-95"
                                  : "bg-neutral-900 border-neutral-800 text-neutral-600 cursor-not-allowed opacity-60"
                            }`}
                            title={track.title}
                          >
                            <span className="block truncate">{track.title}</span>
                            {isActive && (
                              <span className="absolute top-1 right-1 w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
              {/* Stop all SFX button */}
              <button
                onClick={stopAllSfx}
                className="w-full py-2 text-xs font-medium text-red-400 hover:text-red-300 bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 rounded-xl transition-colors"
              >
                ⬛ إيقاف جميع المؤثرات
              </button>
            </div>
          </div>
        )}

        {/* ── DSP Mic Filters Panel ──────────────────────────────────────── */}
        <div className="w-full mt-4">
          <DspPanel
            currentParams={dspParams}
            onParamsChange={applyDspParams}
            bypassed={dspBypassed}
            onBypassToggle={toggleDspBypass}
            isMicOpen={isMicOpen}
          />
        </div>

        {/* ── Group 4.6 — Queue Panel ───────────────────────────────────────── */}
        <div className="w-full mt-4 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-800">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              <span className="text-sm font-semibold text-neutral-300">قائمة الانتظار</span>
              {mediaQueue.length > 0 && (
                <span className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full">{mediaQueue.length}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Auto Queue toggle */}
              <button
                onClick={() => setAutoQueue(q => !q)}
                title={autoQueue ? 'إيقاف التشغيل التلقائي' : 'تفعيل التشغيل التلقائي'}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors font-medium ${
                  autoQueue
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                    : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:text-neutral-400'
                }`}
              >
                ⏭ {autoQueue ? 'تلقائي' : 'يدوي'}
              </button>
              {mediaQueue.length > 0 && (
                <button onClick={clearQueue} className="text-xs text-red-500/60 hover:text-red-400 transition-colors">مسح الكل</button>
              )}
            </div>
          </div>

          {/* ── Queue Volume Slider ── */}
          <div className="px-5 pt-4 pb-2">
            <div className="flex flex-col gap-2 bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-emerald-300">مستوى صوت قائمة الانتظار</label>
                <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  {Math.round(queueVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(queueVolume * 100)}
                onChange={e => setQueueVolume(Number(e.target.value) / 100)}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <p className="text-[10px] text-neutral-600 mt-0.5">يُطبَّق على الأغاني والفواصل والإعلانات في قائمة الانتظار.</p>
            </div>
          </div>

          {/* Preview / Audio Engine disclaimer */}
          <div className="px-5 pt-2 pb-1">
            <p className="text-xs text-neutral-600 bg-neutral-950/50 border border-neutral-800 rounded-lg px-3 py-2">
              ⚠ قائمة الانتظار هنا تنظّم التشغيل فقط، ولا ترسل الصوت للبث المباشر بدون Audio Engine.
            </p>
          </div>

          <div className="px-5 pb-4 pt-2">
            {mediaQueue.length === 0 ? (
              <p className="text-xs text-neutral-600 text-center py-4">لا توجد عناصر في قائمة الانتظار</p>
            ) : (
              <div className="space-y-2 mt-1">
                {mediaQueue.map((item, idx) => {
                  const statusColor =
                    item.status === "READY"                ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" :
                    item.status === "READY_AFTER_MIC_CLOSE"? "text-amber-400 bg-amber-500/10 border-amber-500/30" :
                    item.status === "PREVIEW_ONLY"          ? "text-neutral-400 bg-neutral-800 border-neutral-700" :
                                                              "text-neutral-500 bg-neutral-900 border-neutral-800";
                  const typeLabel =
                    item.mediaType === "SONG"  ? "أغنية" :
                    item.mediaType === "BREAK" ? "فاصل" :
                    item.mediaType === "AD"    ? "إعلان" : item.mediaType;
                  const statusLabel =
                    item.status === "READY"                 ? "جاهز" :
                    item.status === "READY_AFTER_MIC_CLOSE" ? "ينتظر غلق المايك" :
                    item.status === "PREVIEW_ONLY"          ? "معاينة فقط" : item.status;

                  const isFirst   = idx === 0;
                  const isLast    = idx === mediaQueue.length - 1;
                  const isPlaying = playingQueueId === item.id;
                  return (
                    <div key={item.id} className={`flex items-center gap-2 p-3 rounded-xl border transition-all duration-300 ${
                      isPlaying
                        ? "bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.25)]"
                        : "bg-neutral-950/60 border-neutral-800"
                    }`}>
                      {/* Reorder controls */}
                      <div className="flex flex-col gap-1 shrink-0">
                        <button
                          onClick={() => moveQueueItem(item.id, "up")}
                          disabled={isFirst}
                          title="تحريك لأعلى"
                          className={`w-8 h-8 flex items-center justify-center rounded text-xs transition-colors ${
                            isFirst ? "text-neutral-700 cursor-not-allowed" : "text-neutral-500 hover:text-indigo-400 hover:bg-indigo-500/10"
                          }`}
                        >↑</button>
                        <button
                          onClick={() => moveQueueItem(item.id, "down")}
                          disabled={isLast}
                          title="تحريك لأسفل"
                          className={`w-8 h-8 flex items-center justify-center rounded text-xs transition-colors ${
                            isLast ? "text-neutral-700 cursor-not-allowed" : "text-neutral-500 hover:text-indigo-400 hover:bg-indigo-500/10"
                          }`}
                        >↓</button>
                      </div>
                      {/* Position number badge */}
                      <span className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-neutral-800 border border-neutral-700 text-[10px] font-bold text-neutral-400 select-none">
                        #{idx + 1}
                      </span>
                      {/* Track info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-neutral-200 truncate flex-1 min-w-[100px]">{item.title}</span>
                          <span className="text-[10px] text-neutral-600 border border-neutral-800 px-1.5 py-0.5 rounded-full shrink-0">{typeLabel}</span>
                          {item.sourceType === "ADMIN_DB" && (
                            <span className="text-[10px] text-indigo-400 border border-indigo-500/30 px-1.5 py-0.5 rounded-full shrink-0">مكتبة Admin</span>
                          )}
                          {item.sourceType === "PRESENTER_DB" && (
                            <span className="text-[10px] text-cyan-400 border border-cyan-500/30 px-1.5 py-0.5 rounded-full shrink-0">مكتبة المقدم</span>
                          )}
                          {item.sourceType === "LOCAL_SESSION" && (
                            <span className="text-[10px] text-green-500 border border-green-500/30 px-1.5 py-0.5 rounded-full shrink-0">من الجهاز</span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusColor}`}>{statusLabel}</span>
                          {isPlaying && (
                            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-bold text-emerald-300 bg-emerald-500/20 border-emerald-500/50 animate-pulse">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
                              يعزف الآن
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Actions: play/stop + remove — grouped right */}
                      <div className="flex flex-col gap-1.5 shrink-0 items-end">
                        <div className="flex items-center gap-2">
                        {/* Play / Pause / Stop — every READY item + the paused item */}
                        {(item.status === "READY" || (isPaused && pausedQueueItemRef.current?.id === item.id)) && (
                          isPlaying ? (
                            // Currently playing — show Pause
                            <button
                              onClick={pauseQueueItem}
                              title="توقف مؤقت"
                              className="flex items-center justify-center gap-1 min-w-[80px] min-h-[40px] px-3 py-2 rounded-lg text-[11px] font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/25 transition-colors"
                            >
                              <span className="text-[10px]">⏸</span> توقف
                            </button>
                          ) : isPaused && pausedQueueItemRef.current?.id === item.id ? (
                            // Manually paused — show Resume
                            <button
                              onClick={() => playQueueItem(item)}
                              title="استمرار من نفس المكان"
                              className="flex items-center justify-center gap-1 min-w-[80px] min-h-[40px] px-3 py-2 rounded-lg text-[11px] font-semibold bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/25 transition-colors"
                            >
                              <span className="text-[10px]">▶</span> استمرار
                            </button>
                          ) : isMicOpen ? (
                            // Mic open — disabled
                            <button
                              disabled
                              title="سيتم التشغيل بعد غلق المايك"
                              className="flex items-center justify-center gap-1 min-w-[80px] min-h-[40px] px-3 py-2 rounded-lg text-[11px] font-semibold opacity-40 cursor-not-allowed bg-neutral-800 text-neutral-500 border border-neutral-700"
                            >
                              <span className="text-[10px]">▶</span> انتظار
                            </button>
                          ) : (
                            // Ready — Play (stops any current item first)
                            <button
                              onClick={() => playQueueItem(item)}
                              title="تشغيل"
                              className="flex items-center justify-center gap-1 min-w-[80px] min-h-[40px] px-3 py-2 rounded-lg text-[11px] font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 transition-colors"
                            >
                              <span className="text-[10px]">▶</span> تشغيل
                            </button>
                          )
                        )}
                        {/* Remove */}
                        <button
                          onClick={() => removeQueueItem(item.id)}
                          title="حذف من القائمة"
                          className="w-10 h-10 flex items-center justify-center rounded-md text-neutral-600 hover:text-red-400 hover:bg-red-500/10 transition-colors text-sm"
                        >✕</button>
                        </div>
                        {/* Progress bar — shown only for the active (playing or paused) row */}
                        {playbackProgress && playbackProgress.id === item.id && (
                          <div className="w-full flex items-center gap-1.5 mt-0.5" style={{minWidth: '120px'}}>
                            <span className="text-[9px] text-neutral-500 tabular-nums w-7 text-left">
                              {Math.floor(playbackProgress.currentTime / 60)}:{String(Math.floor(playbackProgress.currentTime % 60)).padStart(2,'0')}
                            </span>
                            <input
                              type="range"
                              min={0}
                              max={playbackProgress.duration || 0}
                              step={0.5}
                              value={playbackProgress.currentTime}
                              onChange={e => {
                                const t = parseFloat(e.target.value);
                                if (currentlyPlayingRef.current) currentlyPlayingRef.current.currentTime = t;
                                else if (pausedQueueAudioRef.current) pausedQueueAudioRef.current.currentTime = t;
                                setPlaybackProgress(p => p ? { ...p, currentTime: t } : p);
                              }}
                              className="flex-1 h-1 accent-emerald-400 cursor-pointer"
                            />
                            <span className="text-[9px] text-neutral-500 tabular-nums w-7 text-right">
                              {playbackProgress.duration > 0
                                ? `${Math.floor(playbackProgress.duration / 60)}:${String(Math.floor(playbackProgress.duration % 60)).padStart(2,'0')}`
                                : '--:--'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <p className="mt-6 text-neutral-500 text-sm text-center">قم بالاتصال بالخادم أولاً لتفعيل البث، ثم اضغط على زر الميكروفون</p>
      </div>
    </div>
  );
}
