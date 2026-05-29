"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DspPanel from "@/components/studio/DspPanel";
import { DEFAULT_DSP_PARAMS, type DspParams } from "@/lib/dsp-presets";

// ── Types ──
import type {
  Category, MediaTab, MediaType, LocalFile,
  StudioProps, QueueItem,
} from "./studio-types";
import { MEDIA_POLICY } from "./studio-types";

// ── Hooks ──
import { useAudioMixer }  from "@/hooks/studio/useAudioMixer";
import { useDsp }         from "@/hooks/studio/useDsp";
import { useRecording }   from "@/hooks/studio/useRecording";
import { useSfxPads }     from "@/hooks/studio/useSfxPads";
import { useQueuePlayer } from "@/hooks/studio/useQueuePlayer";

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

// ── V3 Orchestration layer ──────────────────────────────────────────────────
// These functions stay in the component because they orchestrate multiple hooks.

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
}: StudioProps) {
  // ── Core state (not in hooks) ──
  const [isMicOpen, setIsMicOpen]               = useState(false);
  const [isConnected, setIsConnected]           = useState(false);
  const [autoDisconnectMsg, setAutoDisconnectMsg] = useState<string | null>(null);
  type MobileTab = "mixer" | "library" | "queue" | "sfx";
  const [mobileTab, setMobileTab]               = useState<MobileTab>("mixer");
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [activeSfxIds, setActiveSfxIds]         = useState<Set<string>>(new Set());
  type ShoutcastStatus = 'idle' | 'ws_connected' | 'recording' | 'connecting' | 'on_air' | 'radio_error' | 'recording_only';
  const [shoutcastStatus, setShoutcastStatus]   = useState<ShoutcastStatus>('idle');
  const [activeMediaTab, setActiveMediaTab]     = useState<MediaTab>("background");
  const [micError, setMicError]                 = useState<string | null>(null);
  const [volumeLevel, setVolumeLevel]           = useState<number>(0);
  const [heartbeatStatus, setHeartbeatStatus]   = useState<"active" | "stopped">("stopped");
  const [audioBackendStatus, setAudioBackendStatus] = useState<"connected" | "disconnected">("disconnected");
  const [isMonitoring, setIsMonitoring]         = useState<boolean>(false);
  const [monitorVolume, setMonitorVolume]        = useState<number>(0.3);
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicDeviceId, setSelectedMicDeviceId] = useState<string>('');
  const [micDeviceError, setMicDeviceError]     = useState<string | null>(null);
  const [localPresenterBreakCats, setLocalPresenterBreakCats] = useState<Category[]>(presenterBreakCategories);
  const [localPresenterAdCats,    setLocalPresenterAdCats]    = useState<Category[]>(presenterAdCategories);

  const router = useRouter();
  const onExitStudioRef = useRef<(() => void) | undefined>(onExitStudio);
  useEffect(() => { onExitStudioRef.current = onExitStudio; }, [onExitStudio]);

  // ── Refs for mic (not in a hook — tightly coupled with toggleMic orchestration) ──
  const streamRef      = useRef<MediaStream | null>(null);
  const micSourceRef   = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef    = useRef<AnalyserNode | null>(null);
  const rafRef         = useRef<number | null>(null);
  const dataArrayRef   = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const volumeRef      = useRef<number>(0);
  const heartbeatRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef          = useRef<WebSocket | null>(null);

  // ── Wire hooks ──
  const mixer = useAudioMixer(isConnected);
  const { audioCtxRef, mixerDestRef, monitorGainRef, micGainRef, noSleepRef, keepaliveRef } = mixer;

  const dsp = useDsp(audioCtxRef);
  const { buildDspChain, applyDspParams, cleanupDsp, resetDsp, dspParams, setDspParams, dspBypassed, setDspBypassed, dspBypassRef, dspOutputRef } = dsp;

  const recording = useRecording(wsRef, mixerDestRef);
  const { mediaRecorderRef, pendingRecordingReasonRef, startSessionRecording, ensureRecordingStarted } = recording;

  const queue = useQueuePlayer(audioCtxRef, mixerDestRef, monitorGainRef, micGainRef, isMicOpen, ensureRecordingStarted);
  const {
    mediaQueue, setMediaQueue, playingQueueId, isPaused, playbackProgress,
    autoQueue, setAutoQueue, fadeMessage,
    bgVolume, setBgVolume, queueVolume, setQueueVolume,
    activeBgTrackId, setActiveBgTrackId, activeBgLocalUrl, setActiveBgLocalUrl,
    localFiles, setLocalFiles,
    playQueueItem, pauseQueueItem, stopQueuePlayback, stopBackgroundAudio,
    enqueueItem, removeQueueItem, clearQueue, moveQueueItem,
    handleLocalFilePick, handleRemoveLocalFile, handleClearLocalFiles,
    applyBgGain, fadeGain, showFadeMessage,
    bgAudioRef, bgSourceRef, bgGainRef, queueSourceRef, queueGainRef,
    currentlyPlayingRef, mediaQueueRef, bgVolumeRef,
    activeBgTrackIdRef, activeBgLocalUrlRef,
    crossfadeTimerRef, inCrossfadeRef, outgoingPlayerRef, pausedForMicRef, autoQueueRef,
  } = queue;

  const sfx = useSfxPads(audioCtxRef, mixerDestRef, monitorGainRef, sfxCategories, isConnected, ensureRecordingStarted);
  const { sfxVolume, setSfxVolume, sfxPreloadStatus, playSfx, stopSfx, stopAllSfx, sfxCleanup,
          activeSfxRef, sfxGainRef, sfxBuffersRef, setSfxPreloadStatus: _setSfxPreloadStatus } = sfx;

  // ── muteMic — mute mic hardware only, keeps WS/AudioContext alive ──
  const muteMic = useCallback(() => {
    if (micGainRef.current) micGainRef.current.gain.value = 0;
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    try { micSourceRef.current?.disconnect(); } catch {/* ignore */}
    micSourceRef.current = null;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    setVolumeLevel(0);
  }, [micGainRef]);

  // ── stopBroadcastSession — full teardown ──
  const stopBroadcastSession = useCallback(() => {
    if (noSleepRef.current) noSleepRef.current.disable();
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    // Crossfade cleanup
    if (crossfadeTimerRef.current) { clearInterval(crossfadeTimerRef.current); crossfadeTimerRef.current = null; }
    inCrossfadeRef.current = false;
    if (outgoingPlayerRef.current) {
      try { outgoingPlayerRef.current.audio.pause(); } catch {/* ignore */}
      try { outgoingPlayerRef.current.gain.disconnect(); } catch {/* ignore */}
      try { outgoingPlayerRef.current.source.disconnect(); } catch {/* ignore */}
      outgoingPlayerRef.current = null;
    }
    try { keepaliveRef.current?.stop(); } catch {/* ignore */}
    try { keepaliveRef.current?.disconnect(); } catch {/* ignore */}
    keepaliveRef.current = null;
    try { micSourceRef.current?.disconnect(); } catch {/* ignore */}
    try { micGainRef.current?.disconnect(); } catch {/* ignore */}
    try { bgGainRef.current?.disconnect(); } catch {/* ignore */}
    try { bgSourceRef.current?.disconnect(); } catch {/* ignore */}
    try { queueGainRef.current?.disconnect(); } catch {/* ignore */}
    try { queueSourceRef.current?.disconnect(); } catch {/* ignore */}
    // SFX cleanup
    sfxCleanup();
    // DSP cleanup
    resetDsp();
    // Monitor cleanup
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
  }, [noSleepRef, keepaliveRef, micGainRef, bgGainRef, bgSourceRef, queueGainRef, queueSourceRef, monitorGainRef, audioCtxRef, mixerDestRef, mediaRecorderRef, crossfadeTimerRef, inCrossfadeRef, outgoingPlayerRef, sfxCleanup, resetDsp]);

  const stopMicAudio = stopBroadcastSession;

  // Clean up audio on unmount
  useEffect(() => () => stopMicAudio(), [stopMicAudio]);

  // ── Session-end watchdog ──
  useEffect(() => {
    if (!sessionEndMs) return;
    const check = async () => {
      if (!isConnected) return;
      const remaining = sessionEndMs - Date.now();
      if (remaining <= 0) {
        console.log('[Watchdog] Session end reached — auto-disconnecting');
        if (isMicOpen) setIsMicOpen(false);
        stopBroadcastSession();
        try { await fetch('/api/studio/disconnect', { method: 'POST' }); } catch { /* best-effort */ }
        setIsConnected(false);
        setShoutcastStatus('idle');
        setAutoDisconnectMsg('انتهى وقت البث وتم قطع الاتصال تلقائيًا');
        setTimeout(() => {
          if (onExitStudioRef.current) { onExitStudioRef.current(); }
          else { router.push('/studio'); }
        }, 3000);
      } else if (remaining <= 60_000) {
        setAutoDisconnectMsg('سينتهي وقت البث خلال أقل من دقيقة ⚠️');
      } else {
        setAutoDisconnectMsg(null);
      }
    };
    const id = setInterval(check, 10_000);
    check();
    return () => clearInterval(id);
  }, [sessionEndMs, isConnected, isMicOpen, stopBroadcastSession, router]);

  // ── beforeunload warning ──
  useEffect(() => {
    if (!isConnected) return;
    const handler = (ev: BeforeUnloadEvent) => { ev.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isConnected]);

  // ── Audio device enumeration ──
  useEffect(() => {
    if (!isConnected) return;
    const check = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter(d => d.kind === 'audioinput');
        setAudioInputDevices(inputs);
        if (selectedMicDeviceId === '') {
          const def = inputs.find(d => d.deviceId === 'default') ?? inputs[0];
          if (def) setSelectedMicDeviceId(def.deviceId);
        }
      } catch { /* ignore */ }
    };
    check();
    navigator.mediaDevices.addEventListener('devicechange', check);
    return () => navigator.mediaDevices.removeEventListener('devicechange', check);
  }, [isConnected, selectedMicDeviceId]);

  // ── refreshAudioInputDevices ──
  const refreshAudioInputDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter(d => d.kind === 'audioinput');
      setAudioInputDevices(inputs);
      if (selectedMicDeviceId === '') {
        const def = inputs.find(d => d.deviceId === 'default') ?? inputs[0];
        if (def) setSelectedMicDeviceId(def.deviceId);
      }
    } catch (e) { console.warn('[mic-device] enumerateDevices failed:', e); }
  }, [selectedMicDeviceId]);

  // ── switchMicDevice ──
  const switchMicDevice = useCallback(async (deviceId: string) => {
    if (!isMicOpen) { setSelectedMicDeviceId(deviceId); return; }
    const ctx  = audioCtxRef.current;
    const dest = mixerDestRef.current;
    if (!ctx || !dest) { setSelectedMicDeviceId(deviceId); return; }
    try {
      const constraints = deviceId
        ? { audio: { deviceId: { exact: deviceId } }, video: false }
        : { audio: true, video: false };
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      try { micSourceRef.current?.disconnect(); } catch {/* ignore */}
      try { micGainRef.current?.disconnect(); } catch {/* ignore */}
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = newStream;
      const newSrc = ctx.createMediaStreamSource(newStream);
      micSourceRef.current = newSrc;
      const gain = micGainRef.current ?? ctx.createGain();
      if (!micGainRef.current) { gain.gain.value = 1; micGainRef.current = gain; }
      newSrc.connect(gain);
      gain.connect(dest);
      if (analyserRef.current) {
        const newSrcForMeter = ctx.createMediaStreamSource(newStream);
        newSrcForMeter.connect(analyserRef.current);
      }
      setSelectedMicDeviceId(deviceId);
      setMicDeviceError(null);
    } catch (e) {
      console.error('[mic-device] live switch FAILED:', e);
      setMicDeviceError('فشل التبديل. يرجى إغلاق الميك وإعادة فتحه.');
    }
  }, [isMicOpen, audioCtxRef, mixerDestRef, micGainRef]);

  // ── toggleMonitoring ──
  const toggleMonitoring = useCallback(() => {
    if (!monitorGainRef.current) return;
    setIsMonitoring(prev => {
      const next = !prev;
      monitorGainRef.current!.gain.value = next ? monitorVolume : 0;
      return next;
    });
  }, [monitorVolume, monitorGainRef]);

  // ── startLevelMeter ──
  const startLevelMeter = (stream: MediaStream, existingCtx?: AudioContext) => {
    const ctx = existingCtx ?? new AudioContext();
    if (!existingCtx) audioCtxRef.current = ctx;
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

  // ── startHeartbeat ──
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
    sendBeat();
    heartbeatRef.current = setInterval(sendBeat, 2000);
  };

  // ── getTrackTitle helper ──
  const getTrackTitle = (id: string | null, cats: Category[]) => {
    if (!id) return null;
    for (const cat of cats) { const t = cat.tracks.find(t => t.id === id); if (t) return t.title; }
    return null;
  };

  // ── Derived state ──
  const firstReadySong = mediaQueue.find(q => q.mediaType === "SONG" && q.status === "READY");
  const firstWaitingSong = mediaQueue.find(q => q.mediaType === "SONG" && q.status === "READY_AFTER_MIC_CLOSE");
  const activeSongLabel = firstReadySong?.title ?? firstWaitingSong?.title ?? null;
  const activeDbBgTrack = getTrackTitle(activeBgTrackId, bgCategories);
  const activeLocalBgFile = localFiles.background.find(f => f.objectUrl === activeBgLocalUrl);
  const activeBgTrack = activeDbBgTrack || activeLocalBgFile?.name;

  // ── handleShuffle ──
  const handleShuffle = () => {
    if (!firstReadySong) return;
    const cat = songCategories.find(c => c.tracks.some(t => t.id === firstReadySong.trackId));
    if (!cat) return;
    const alreadyQueued = new Set(mediaQueue.filter(q => q.mediaType === "SONG").map(q => q.trackId));
    const available = cat.tracks.filter(t => !alreadyQueued.has(t.id));
    if (available.length === 0) { showFadeMessage("جميع أغاني هذا القسم في قائمة الانتظار"); return; }
    const random = available[Math.floor(Math.random() * available.length)];
    enqueueItem(random.id, random.title, "SONG", "ADMIN_DB", cat.ownerType as "ADMIN" | "PRESENTER");
    showFadeMessage("تمت إضافة أغنية عشوائية لقائمة الانتظار");
  };

  // ── handleSelectSong ──
  const handleSelectSong = (trackId: string, title: string, ownerType: "ADMIN" | "PRESENTER" = "ADMIN") => {
    if (!isConnected) return;
    const existing = mediaQueue.find(q => q.trackId === trackId && q.mediaType === "SONG");
    if (existing) { removeQueueItem(existing.id); return; }
    enqueueItem(trackId, title, "SONG", "ADMIN_DB", ownerType);
    showFadeMessage(isMicOpen ? "سيتم التشغيل بعد غلق المايك" : "تمت إضافة الأغنية لقائمة الانتظار");
  };

  // ── enqueueLocalFile ──
  const enqueueLocalFile = useCallback((tab: MediaTab, file: LocalFile) => {
    if (tab === "background") return;
    const mediaType: MediaType = tab === "songs" ? "SONG" : tab === "breaks" ? "BREAK" : "AD";
    if (mediaQueue.some(q => q.trackId === file.id && q.mediaType === mediaType)) return;
    enqueueItem(file.id, file.name, mediaType, "LOCAL_SESSION", undefined, file.objectUrl);
    showFadeMessage(isMicOpen ? "سيتم التشغيل بعد غلق المايك" : "تمت إضافة الملف لقائمة الانتظار");
  }, [mediaQueue, enqueueItem, isMicOpen, showFadeMessage]);

  // ── handleRemoveLocalFileWithQueueCleanup ──
  const handleRemoveLocalFileWithQueueCleanup = useCallback((tab: MediaTab, fileId: string) => {
    const qItem = mediaQueue.find(q => q.trackId === fileId && q.sourceType === "LOCAL_SESSION");
    if (qItem) removeQueueItem(qItem.id);
    handleRemoveLocalFile(tab, fileId);
  }, [mediaQueue, removeQueueItem, handleRemoveLocalFile]);


  // ══════════════════════════════════════════════════════════════════════════
  // toggleMic — orchestrates mixer, DSP, recording, mic stream
  // ══════════════════════════════════════════════════════════════════════════
  const toggleMic = async () => {
    if (!isConnected) return;
    setMicError(null);
    if (isMicOpen) {
      muteMic();
      setIsMicOpen(false);
    } else {
      try {
        const ctx  = audioCtxRef.current;
        const dest = mixerDestRef.current;
        if (!ctx || !dest) { setMicError("المشغل غير مهيأ — يرجى قطع الاتصال وإعادة الاتصال."); return; }
        if (ctx.state === "suspended") await ctx.resume();
        const micConstraints: MediaStreamConstraints = selectedMicDeviceId
          ? { audio: { deviceId: { exact: selectedMicDeviceId } }, video: false }
          : { audio: true, video: false };
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia(micConstraints);
        } catch (micErr) {
          if (selectedMicDeviceId) {
            setMicDeviceError("الجهاز المحدد غير متاح — تم الرجوع للميكروفون الافتراضي.");
            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            setSelectedMicDeviceId("");
          } else throw micErr;
        }
        streamRef.current = stream;
        refreshAudioInputDevices();
        startLevelMeter(stream, ctx);
        try { micSourceRef.current?.disconnect(); } catch {/* ignore */}
        const micSrc = ctx.createMediaStreamSource(stream);
        micSourceRef.current = micSrc;
        if (!micGainRef.current) {
          const mg = ctx.createGain(); mg.gain.value = 1; micGainRef.current = mg; mg.connect(dest);
        } else { micGainRef.current.gain.value = 1; }
        if (!dspBypassRef.current) {
          const dspOut = buildDspChain(ctx, micSrc);
          dspOut.connect(micGainRef.current);
          if (analyserRef.current) dspOut.connect(analyserRef.current);
        } else {
          micSrc.connect(micGainRef.current);
          if (analyserRef.current) micSrc.connect(analyserRef.current);
        }
        ensureRecordingStarted('mic');
        if (activeBgTrackId) {
          try {
            stopBackgroundAudio();
            const freshBgAudio = new Audio(`/api/tracks/${activeBgTrackId}`);
            freshBgAudio.loop = true;
            bgAudioRef.current = freshBgAudio;
            const bgSrc  = ctx.createMediaElementSource(freshBgAudio);
            const bGain = ctx.createGain(); bGain.gain.value = bgVolume;
            bgSrc.connect(bGain); bGain.connect(dest);
            if (monitorGainRef.current) bGain.connect(monitorGainRef.current);
            bgSourceRef.current = bgSrc; bgGainRef.current = bGain;
            freshBgAudio.play().catch(e => console.warn("[bg reconnect play failed]:", e));
          } catch (e) { console.warn("[bg reconnect failed]:", e); }
        }
        const readyCount = mediaQueue.filter(q => q.status === "READY").length;
        if (readyCount > 0) showFadeMessage(`${readyCount} عنصر جاهز في قائمة الانتظار`);
        setIsMicOpen(true);
      } catch {
        setMicError("تعذّر الوصول للميكروفون. يرجى السماح بالصلاحية من إعدادات المتصفح وحاول مجدداً.");
      }
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // toggleConnection — orchestrates mixer init, WS, heartbeat, recording
  // ══════════════════════════════════════════════════════════════════════════
  const toggleConnection = async (e?: React.MouseEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    if (isConnected) {
      if (noSleepRef.current) noSleepRef.current.disable();
      if (isMicOpen) setIsMicOpen(false);
      stopBroadcastSession();
      try { await fetch("/api/studio/disconnect", { method: "POST" }); } catch { /* best-effort */ }
      setIsConnected(false);
      setShoutcastStatus('idle');
    } else {
      try {
        if (noSleepRef.current) noSleepRef.current.enable();
        const ctx = audioCtxRef.current ?? new (window.AudioContext || (window as any).webkitAudioContext)();
        audioCtxRef.current = ctx;
        if (ctx.state === "suspended") await ctx.resume();
        if (!mixerDestRef.current) {
          const newMixerDest = ctx.createMediaStreamDestination();
          mixerDestRef.current = newMixerDest;
          const keepalive = ctx.createConstantSource(); keepalive.offset.value = 0;
          const keepaliveGain = ctx.createGain(); keepaliveGain.gain.value = 0;
          keepalive.connect(keepaliveGain); keepaliveGain.connect(newMixerDest); keepalive.start();
          keepaliveRef.current = keepalive;
          const mGain = ctx.createGain(); mGain.gain.value = 0; mGain.connect(ctx.destination);
          monitorGainRef.current = mGain;
          const mG = ctx.createGain(); mG.gain.value = 0; micGainRef.current = mG; mG.connect(newMixerDest);
        }
        const mixerDest = mixerDestRef.current;

        let audioToken: string;
        try {
          const tokenRes = await fetch("/api/internal/audio-token/create", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: directDjRadioId ? JSON.stringify({ directDjRadioId })
              : scheduledStationId ? JSON.stringify({ scheduledStationId })
              : undefined,
          });
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

        let wsBase = process.env.NEXT_PUBLIC_WS_URL;
        if (!wsBase || wsBase.includes("localhost") || wsBase.includes("4001")) {
          if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
            wsBase = "wss://egonair-backend-audio-729286791857.europe-west1.run.app/audio";
          } else { wsBase = "ws://localhost:4001/audio"; }
        }
        if (!wsBase.endsWith('/audio')) wsBase = wsBase.replace(/\/$/, '') + '/audio';
        const wsUrl = `${wsBase}?token=${encodeURIComponent(audioToken)}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setAudioBackendStatus("connected");
          setIsConnected(true);
          setShoutcastStatus('ws_connected');
          const bgUrl = activeBgLocalUrlRef.current ?? (activeBgTrackIdRef.current ? `/api/tracks/${activeBgTrackIdRef.current}` : null);
          if (bgUrl && mixerDest && ctx) {
            const audio = new Audio(bgUrl); audio.loop = true; bgAudioRef.current = audio;
            try {
              const bgSrc = ctx.createMediaElementSource(audio);
              const bGain = ctx.createGain(); bGain.gain.value = bgVolumeRef.current;
              bgSrc.connect(bGain); bGain.connect(mixerDest);
              if (monitorGainRef.current) bGain.connect(monitorGainRef.current);
              bgSourceRef.current = bgSrc; bgGainRef.current = bGain;
              audio.play().then(() => ensureRecordingStarted('background')).catch(e => console.warn('[bg play failed]:', e));
            } catch (e) { console.warn('[bg wire failed]:', e); }
          }
          const pendingReason = pendingRecordingReasonRef.current;
          if (pendingReason) { pendingRecordingReasonRef.current = null; startSessionRecording(pendingReason); }
        };
        ws.onmessage = (event: MessageEvent) => {
          if (typeof event.data !== 'string') return;
          try {
            const msg = JSON.parse(event.data) as { type: string; [k: string]: unknown };
            switch (msg.type) {
              case 'ws_connected':        setShoutcastStatus('ws_connected');   break;
              case 'recording_only':      setShoutcastStatus('recording_only'); break;
              case 'recording_started':   setShoutcastStatus('recording');      break;
              case 'shoutcast_connecting': setShoutcastStatus('connecting');     break;
              case 'shoutcast_ok':        setShoutcastStatus('on_air');         break;
              case 'shoutcast_error':     setShoutcastStatus('radio_error');    break;
              case 'duplicate_attempt':   showFadeMessage("تنبيه: حاول جهاز آخر الاتصال بنفس الحساب الآن!"); break;
              default: break;
            }
          } catch { /* ignore non-JSON */ }
        };
        ws.onclose = (event: CloseEvent) => {
          setAudioBackendStatus("disconnected"); setShoutcastStatus('idle');
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
          mediaRecorderRef.current = null;
          const reasonStr = (event.reason || "").toLowerCase();
          if (event.code === 1008 && reasonStr.includes("duplicate")) {
            setMicError("جلسة مكررة — هذا المقدم متصل بالفعل من نافذة أخرى.");
            setIsMicOpen(false); stopBroadcastSession(); setIsConnected(false);
          } else if (event.code === 1001 || reasonStr.includes("stale") || reasonStr.includes("timeout") || reasonStr.includes("no audio")) {
            setMicError("تم قطع الاتصال لأن الخادم لم يستقبل صوتاً.");
            setIsMicOpen(false); stopBroadcastSession(); setIsConnected(false);
          } else if (event.code !== 1000) {
            const fallbackMsg = event.reason ? `انقطع الاتصال (${event.code}): ${event.reason}` : `انقطع الاتصال (رمز ${event.code})`;
            setMicError(fallbackMsg); setIsMicOpen(false); stopBroadcastSession(); setIsConnected(false);
          }
        };
        startHeartbeat();
      } catch (e) {
        console.error("[Studio][connect] init error:", e);
        setMicError("فشل الاتصال. يرجى المحاولة مرة أخرى.");
        setIsConnected(false);
      }
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#0f0f1a] text-neutral-100 font-sans relative overflow-hidden">
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
            <h1 className="text-lg font-bold bg-gradient-to-l from-indigo-400 to-cyan-400 bg-clip-text text-transparent hidden sm:block">استوديو البث</h1>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-900/80 border border-neutral-800">
              <div className={`w-2 h-2 rounded-full ${isMicOpen ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-pulse' : 'bg-neutral-600'}`}></div>
              <span className={`text-xs font-semibold tracking-wider ${isMicOpen ? 'text-red-400' : 'text-neutral-500'}`}>{isMicOpen ? "ON AIR" : "OFF AIR"}</span>
            </div>
            {/* Recording status */}
            {(shoutcastStatus === 'recording' || shoutcastStatus === 'on_air' || shoutcastStatus === 'radio_error' || shoutcastStatus === 'recording_only') && (
              <span className="text-[10px] text-cyan-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.7)]"></span>
                تسجيل ●
              </span>
            )}
          </div>

          {/* Center: Mic Button (compact in header) */}
          <button onClick={toggleMic} disabled={!isConnected} className={`relative flex items-center justify-center w-14 h-14 lg:w-16 lg:h-16 rounded-full border-2 transition-all duration-500 flex-shrink-0 ${!isConnected ? 'border-neutral-800 bg-neutral-950/50 opacity-40 cursor-not-allowed' : isMicOpen ? 'border-red-500/60 bg-red-500/20 shadow-[0_0_30px_rgba(239,68,68,0.4)]' : 'border-neutral-700 bg-neutral-900/80 hover:bg-neutral-800 hover:border-neutral-600'}`}>
            {isMicOpen && <div className="absolute inset-[-2px] rounded-full border-2 border-red-500 opacity-20 animate-ping pointer-events-none"></div>}
            <svg xmlns="http://www.w3.org/2000/svg" className={`w-6 h-6 lg:w-7 lg:h-7 ${!isConnected ? 'text-neutral-600' : isMicOpen ? 'text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 'text-neutral-400'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {isMicOpen ? (<><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" x2="12" y1="19" y2="22"></line></>) : (<><line x1="2" x2="22" y1="2" y2="22"></line><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"></path><path d="M5 10v2a7 7 0 0 0 12 5"></path><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"></path><path d="M9 9v3a3 3 0 0 0 5.12 2.12"></path><line x1="12" x2="12" y1="19" y2="22"></line></>)}
            </svg>
          </button>

          {/* Left: Connect + Actions */}
          <div className="flex items-center gap-2">
            <button type="button" onClick={(e) => toggleConnection(e)} className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${isConnected ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20'}`}>
              {isConnected ? "قطع الاتصال" : "الاتصال"}
            </button>
            <Link href="/profile" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-neutral-400 hover:text-indigo-300 bg-neutral-900/80 border border-neutral-800 hover:border-indigo-500/40 transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
              <span className="hidden sm:inline">ملفي</span>
            </Link>
            <a href="/studio/recordings" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-neutral-400 hover:text-indigo-300 bg-neutral-900/80 border border-neutral-800 hover:border-indigo-500/40 transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
              <span className="hidden sm:inline">أرشيف تسجيلاتي</span>
            </a>
            <button
              onClick={async () => {
                if (isConnected) {
                  if (isMicOpen) setIsMicOpen(false);
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
              <span className="hidden sm:inline">خروج</span>
            </button>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════════
          MOBILE TAB BAR — only visible on <1024px
         ═══════════════════════════════════════════════════════════════════════ */}
      <nav className="lg:hidden sticky top-[60px] z-30 bg-black/60 backdrop-blur-xl border-b border-white/10">
        <div className="flex">
          {([["mixer","المكسر"],["library","المكتبة"],["queue","القائمة"],["sfx","المؤثرات"]] as [MobileTab,string][]).map(([key,label]) => (
            <button
              key={key}
              onClick={() => setMobileTab(key)}
              className={`flex-1 py-2.5 text-xs font-medium transition-all border-b-2 ${mobileTab === key ? 'text-violet-400 border-violet-500 bg-violet-500/5' : 'text-neutral-500 border-transparent hover:text-neutral-300'}`}
            >
              {label}
              {key === "queue" && mediaQueue.length > 0 && <span className="mr-1 px-1.5 py-0.5 bg-violet-500/20 text-violet-400 text-[10px] rounded-full">{mediaQueue.length}</span>}
            </button>
          ))}
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════════════════════════
          MAIN 3-COLUMN LAYOUT
         ═══════════════════════════════════════════════════════════════════════ */}
      <main className="max-w-[1800px] mx-auto px-3 py-3 lg:grid lg:grid-cols-[30fr_40fr_30fr] lg:gap-3 lg:h-[calc(100vh-60px)]">

        {/* ─────────────────────────────────────────────────────────────────────
            RIGHT COLUMN — Media Library
           ───────────────────────────────────────────────────────────────────── */}
        <section className={`${mobileTab === 'library' ? 'block' : 'hidden'} lg:block lg:overflow-y-auto lg:max-h-full rounded-2xl bg-white/[0.03] backdrop-blur-lg border border-white/10 p-3`}>
          <h2 className="text-sm font-semibold text-neutral-300 mb-3 flex items-center gap-2">
            📚 مكتبة الوسائط
          </h2>

          {/* Tab Pills */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {([["background","خلفية","indigo"],["songs","أغاني","cyan"],["breaks","فواصل","amber"],["ads","إعلانات","rose"]] as [MediaTab,string,string][]).map(([key,label,color]) => (
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
                ✔ مسموح مع المايك — مسموح مع المايك كسياسة تشغيل. المعاينة داخل المتصفح فقط وليست على البث المباشر.
              </div>
              {/* BG Volume */}
              <div className="bg-neutral-900/60 border border-indigo-500/20 rounded-xl px-3 py-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-indigo-300">مستوى موسيقى الخلفية</label>
                  <span className="text-xs font-mono text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                    {bgVolume}%{isMicOpen ? ' (مخفوت)' : ''}
                  </span>
                </div>
                <input type="range" min={0} max={100} value={bgVolume} onChange={e => setBgVolume(Number(e.target.value))} className="w-full h-1.5 accent-indigo-400 cursor-pointer" />
                {isMicOpen && (
                  <p className="text-[10px] text-amber-400/80 mt-1.5">⚠ الصوت مخفوت تلقائياً أثناء المايك — الفادر يتحكم في النسبة الكاملة التي تُستعاد بعد الغلق.</p>
                )}
              </div>
              {/* DB Categories */}
              {bgCategories.length === 0 && localFiles.background.length === 0 ? (
                <p className="text-xs text-neutral-500 text-center py-4">لا توجد موسيقى خلفية. أضفها من لوحة الإدارة أو اختر ملفات من جهازك.</p>
              ) : (
                bgCategories.map(cat => (
                  <div key={cat.id} className="border border-neutral-800 rounded-xl overflow-hidden">
                    <button onClick={() => setExpandedCategories(prev => ({ ...prev, [cat.id]: !prev[cat.id] }))} className="w-full flex items-center justify-between px-3 py-2 bg-neutral-900/60 hover:bg-neutral-800/60 transition-colors">
                      <span className="text-xs font-medium text-neutral-300">{cat.name}</span>
                      <svg className={`w-3.5 h-3.5 text-neutral-500 transition-transform ${expandedCategories[cat.id] ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                    {expandedCategories[cat.id] && cat.tracks.map(t => (
                      <div key={t.id} className="flex items-center justify-between px-3 py-1.5 border-t border-neutral-800/50 hover:bg-neutral-800/30 transition-colors">
                        <span className="text-xs text-neutral-300 truncate flex-1">{t.title}</span>
                        <button onClick={() => { if (activeBgTrackId === t.id) { setActiveBgTrackId(null); } else { setActiveBgTrackId(t.id); } }}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${activeBgTrackId === t.id ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-neutral-800 text-neutral-400 border border-neutral-700 hover:text-neutral-200'}`}
                        >{activeBgTrackId === t.id ? 'إلغاء' : 'اختيار'}</button>
                      </div>
                    ))}
                  </div>
                ))
              )}
              {/* Local BG Files */}
              <div className="border-t border-neutral-800 pt-3 mt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-neutral-400 flex items-center gap-1.5">● من جهازي <span className="px-1.5 py-0.5 bg-neutral-800 text-neutral-500 text-[9px] rounded-full">جلسة فقط</span></span>
                  {localFiles.background.length > 0 && <button onClick={() => handleClearLocalFiles("background")} className="text-[10px] text-neutral-500 hover:text-red-400 transition-colors">مسح الكل</button>}
                </div>
                {localFiles.background.map(f => (
                  <div key={f.id} className="flex items-center gap-2 py-1.5 border-b border-neutral-800/40">
                    <span className="text-xs text-neutral-300 truncate flex-1">{f.name}</span>
                    <button onClick={() => { if (activeBgLocalUrl === f.objectUrl) { setActiveBgLocalUrl(null); } else { setActiveBgLocalUrl(f.objectUrl); } }}
                      className={`px-2 py-0.5 text-[10px] rounded-lg font-medium ${activeBgLocalUrl === f.objectUrl ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-neutral-800 text-neutral-400 border border-neutral-700'}`}
                    >{activeBgLocalUrl === f.objectUrl ? '✓ خلفية' : 'تشغيل كخلفية'}</button>
                    <button onClick={() => handleRemoveLocalFile("background", f.id)} className="text-neutral-600 hover:text-red-400 text-sm">✕</button>
                    <audio controls src={f.objectUrl} className="h-6 w-24 opacity-60" />
                  </div>
                ))}
                <label className="mt-2 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dashed border-neutral-700 bg-neutral-900/40 text-xs text-neutral-500 hover:text-neutral-300 hover:border-neutral-500 cursor-pointer transition-all">
                  + اختر ملف صوتي من جهازك
                  <input type="file" accept="audio/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleLocalFilePick("background", e.target.files); e.target.value = ''; }} />
                </label>
              </div>
            </div>
          )}

          {/* ── Songs Tab Content ── */}
          {activeMediaTab === "songs" && (
            <div className="space-y-3">
              <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg px-3 py-2 text-[10px] text-cyan-300">
                {MEDIA_POLICY.SONG.label} — {isMicOpen ? MEDIA_POLICY.SONG.waitLabel : 'عند غلق المايك ستصبح الأغاني جاهزة للتشغيل'}
              </div>
              {songCategories.length === 0 && localFiles.songs.length === 0 ? (
                <p className="text-xs text-neutral-500 text-center py-4">لا توجد أغاني في المكتبة. أضفها من لوحة الإدارة أو اختر ملفات من جهازك.</p>
              ) : (
                songCategories.map(cat => (
                  <div key={cat.id} className="border border-neutral-800 rounded-xl overflow-hidden">
                    <button onClick={() => setExpandedCategories(prev => ({ ...prev, [cat.id]: !prev[cat.id] }))} className="w-full flex items-center justify-between px-3 py-2 bg-neutral-900/60 hover:bg-neutral-800/60 transition-colors">
                      <span className="text-xs font-medium text-neutral-300">{cat.name}</span>
                      <svg className={`w-3.5 h-3.5 text-neutral-500 transition-transform ${expandedCategories[cat.id] ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                    {expandedCategories[cat.id] && cat.tracks.map(t => {
                      const inQueue = mediaQueue.some(q => q.trackId === t.id && q.mediaType === "SONG");
                      return (
                        <div key={t.id} className="flex items-center justify-between px-3 py-1.5 border-t border-neutral-800/50 hover:bg-neutral-800/30 transition-colors">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-xs text-neutral-300 truncate">{t.title}</span>
                            {inQueue && <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">في الانتظار</span>}
                          </div>
                          <button
                            disabled={!isConnected}
                            onClick={() => handleSelectSong(t.id, t.title, cat.ownerType as "ADMIN"|"PRESENTER")}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${inQueue ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-neutral-800 text-neutral-400 border border-neutral-700 hover:text-neutral-200'} ${!isConnected ? 'opacity-40 cursor-not-allowed' : ''}`}
                          >{inQueue ? 'إلغاء' : 'أضف للانتظار'}</button>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
              {/* Local Song Files */}
              <div className="border-t border-neutral-800 pt-3 mt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-neutral-400 flex items-center gap-1.5">● من جهازي <span className="px-1.5 py-0.5 bg-neutral-800 text-neutral-500 text-[9px] rounded-full">جلسة فقط</span></span>
                  {localFiles.songs.length > 0 && <button onClick={() => handleClearLocalFiles("songs")} className="text-[10px] text-neutral-500 hover:text-red-400 transition-colors">مسح الكل</button>}
                </div>
                {localFiles.songs.length > 0 && (
                  <p className="text-[10px] text-amber-400/70 mb-2">⚠ ملفاتك المحلية — استخدم زر +انتظار للإضافة للقائمة. المعاينة داخل المتصفح فقط وليست على البث.</p>
                )}
                {localFiles.songs.map(f => {
                  const inQ = mediaQueue.some(q => q.trackId === f.id && q.sourceType === "LOCAL_SESSION");
                  return (
                    <div key={f.id} className="flex items-center gap-2 py-1.5 border-b border-neutral-800/40">
                      <span className="text-xs text-neutral-300 truncate flex-1">{f.name}</span>
                      <button onClick={() => { if (inQ) { const qi = mediaQueue.find(q => q.trackId === f.id); if (qi) removeQueueItem(qi.id); } else enqueueLocalFile("songs", f); }}
                        className={`px-2 py-0.5 text-[10px] rounded-lg font-medium ${inQ ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-neutral-800 text-neutral-400 border border-neutral-700'}`}
                      >{inQ ? '✓' : '+انتظار'}</button>
                      <button onClick={() => handleRemoveLocalFileWithQueueCleanup("songs", f.id)} className="text-neutral-600 hover:text-red-400 text-sm">✕</button>
                      <audio controls src={f.objectUrl} className="h-6 w-24 opacity-60" />
                    </div>
                  );
                })}
                <label className="mt-2 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dashed border-neutral-700 bg-neutral-900/40 text-xs text-neutral-500 hover:text-neutral-300 hover:border-neutral-500 cursor-pointer transition-all">
                  + اختر ملف صوتي من جهازك
                  <input type="file" accept="audio/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleLocalFilePick("songs", e.target.files); e.target.value = ''; }} />
                </label>
              </div>
            </div>
          )}

          {/* ── Breaks Tab Content ── */}
          {activeMediaTab === "breaks" && (
            <div className="space-y-3">
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2 text-[10px] text-amber-300">
                {MEDIA_POLICY.BREAK.label} — {isMicOpen ? MEDIA_POLICY.BREAK.waitLabel : 'عند غلق المايك ستصبح الفواصل جاهزة للتشغيل'}
              </div>
              {/* Admin shared breaks */}
              <div>
                <h3 className="text-xs font-semibold text-neutral-400 mb-2 flex items-center gap-1.5">فواصل المحطة <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 text-[9px] rounded-full border border-amber-500/20">Admin</span></h3>
                {adminBreakCategories.length === 0 ? (
                  <p className="text-[10px] text-neutral-500 text-center py-2">لا توجد فواصل محطة. أضفها من لوحة الإدارة.</p>
                ) : adminBreakCategories.map(cat => (
                  <div key={cat.id} className="border border-neutral-800 rounded-xl overflow-hidden mb-2">
                    <button onClick={() => setExpandedCategories(prev => ({ ...prev, [cat.id]: !prev[cat.id] }))} className="w-full flex items-center justify-between px-3 py-2 bg-neutral-900/60 hover:bg-neutral-800/60 transition-colors">
                      <span className="text-xs font-medium text-neutral-300">{cat.name}</span>
                      <svg className={`w-3.5 h-3.5 text-neutral-500 transition-transform ${expandedCategories[cat.id] ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                    {expandedCategories[cat.id] && cat.tracks.map(t => {
                      const inQueue = mediaQueue.some(q => q.trackId === t.id && q.mediaType === "BREAK");
                      return (
                        <div key={t.id} className="flex items-center justify-between px-3 py-1.5 border-t border-neutral-800/50 hover:bg-neutral-800/30 transition-colors">
                          <span className="text-xs text-neutral-300 truncate flex-1">{t.title}</span>
                          <button disabled={!isConnected} onClick={() => { if (inQueue) { const qi = mediaQueue.find(q => q.trackId === t.id && q.mediaType === "BREAK"); if (qi) removeQueueItem(qi.id); } else enqueueItem(t.id, t.title, "BREAK", "ADMIN_DB", "ADMIN"); }}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${inQueue ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-neutral-800 text-neutral-400 border border-neutral-700 hover:text-neutral-200'} ${!isConnected ? 'opacity-40 cursor-not-allowed' : ''}`}
                          >{inQueue ? '✓ في الانتظار' : 'أضف للانتظار'}</button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              {/* Presenter breaks */}
              <div>
                <h3 className="text-xs font-semibold text-neutral-400 mb-2 flex items-center gap-1.5">فواصلي <span className="px-1.5 py-0.5 bg-violet-500/10 text-violet-400 text-[9px] rounded-full border border-violet-500/20">مكتبتي</span></h3>
                {presenterBreakCategories.length === 0 ? (
                  <p className="text-[10px] text-neutral-500 text-center py-2">لا توجد فواصل خاصة بعد — ارفع فاصلك أدناه.</p>
                ) : presenterBreakCategories.map(cat => (
                  <div key={cat.id} className="border border-neutral-800 rounded-xl overflow-hidden mb-2">
                    <button onClick={() => setExpandedCategories(prev => ({ ...prev, [cat.id]: !prev[cat.id] }))} className="w-full flex items-center justify-between px-3 py-2 bg-neutral-900/60 hover:bg-neutral-800/60 transition-colors">
                      <span className="text-xs font-medium text-neutral-300">{cat.name}</span>
                      <svg className={`w-3.5 h-3.5 text-neutral-500 transition-transform ${expandedCategories[cat.id] ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                    {expandedCategories[cat.id] && cat.tracks.map(t => {
                      const inQueue = mediaQueue.some(q => q.trackId === t.id && q.mediaType === "BREAK");
                      return (
                        <div key={t.id} className="flex items-center justify-between px-3 py-1.5 border-t border-neutral-800/50 hover:bg-neutral-800/30 transition-colors">
                          <span className="text-xs text-neutral-300 truncate flex-1">{t.title}</span>
                          <button disabled={!isConnected} onClick={() => { if (inQueue) { const qi = mediaQueue.find(q => q.trackId === t.id && q.mediaType === "BREAK"); if (qi) removeQueueItem(qi.id); } else enqueueItem(t.id, t.title, "BREAK", "PRESENTER_DB", "PRESENTER"); }}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${inQueue ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-neutral-800 text-neutral-400 border border-neutral-700 hover:text-neutral-200'} ${!isConnected ? 'opacity-40 cursor-not-allowed' : ''}`}
                          >{inQueue ? '✓ أضف مرة أخرى' : 'أضف للانتظار'}</button>
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
                  <span className="text-xs font-semibold text-neutral-400 flex items-center gap-1.5">فواصلي من جهازي <span className="px-1.5 py-0.5 bg-neutral-800 text-neutral-500 text-[9px] rounded-full">جلسة فقط</span></span>
                  {localFiles.breaks.length > 0 && <button onClick={() => handleClearLocalFiles("breaks")} className="text-[10px] text-neutral-500 hover:text-red-400 transition-colors">مسح الكل</button>}
                </div>
                {localFiles.breaks.map(f => {
                  const inQ = mediaQueue.some(q => q.trackId === f.id && q.sourceType === "LOCAL_SESSION");
                  return (
                    <div key={f.id} className="flex items-center gap-2 py-1.5 border-b border-neutral-800/40">
                      <span className="text-xs text-neutral-300 truncate flex-1">{f.name}</span>
                      <button onClick={() => { if (inQ) { const qi = mediaQueue.find(q => q.trackId === f.id); if (qi) removeQueueItem(qi.id); } else enqueueLocalFile("breaks", f); }}
                        className={`px-2 py-0.5 text-[10px] rounded-lg font-medium ${inQ ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-neutral-800 text-neutral-400 border border-neutral-700'}`}
                      >{inQ ? '✓' : '+انتظار'}</button>
                      <button onClick={() => handleRemoveLocalFileWithQueueCleanup("breaks", f.id)} className="text-neutral-600 hover:text-red-400 text-sm">✕</button>
                      <audio controls src={f.objectUrl} className="h-6 w-24 opacity-60" />
                    </div>
                  );
                })}
                <label className="mt-2 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dashed border-neutral-700 bg-neutral-900/40 text-xs text-neutral-500 hover:text-neutral-300 hover:border-neutral-500 cursor-pointer transition-all">
                  + اختر فاصل/جينغل من جهازك
                  <input type="file" accept="audio/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleLocalFilePick("breaks", e.target.files); e.target.value = ''; }} />
                </label>
              </div>
            </div>
          )}

          {/* ── Ads Tab Content ── */}
          {activeMediaTab === "ads" && (
            <div className="space-y-3">
              <div className="bg-rose-500/5 border border-rose-500/20 rounded-lg px-3 py-2 text-[10px] text-rose-300">
                {MEDIA_POLICY.AD.label} — {isMicOpen ? MEDIA_POLICY.AD.waitLabel : 'عند غلق المايك ستصبح الإعلانات جاهزة للتشغيل'}
              </div>
              {/* Admin shared ads */}
              <div>
                <h3 className="text-xs font-semibold text-neutral-400 mb-2 flex items-center gap-1.5">إعلانات المحطة <span className="px-1.5 py-0.5 bg-rose-500/10 text-rose-400 text-[9px] rounded-full border border-rose-500/20">Admin</span></h3>
                {adminAdCategories.length === 0 ? (
                  <p className="text-[10px] text-neutral-500 text-center py-2">لا توجد إعلانات محطة. أضفها من لوحة الإدارة.</p>
                ) : adminAdCategories.map(cat => (
                  <div key={cat.id} className="border border-neutral-800 rounded-xl overflow-hidden mb-2">
                    <button onClick={() => setExpandedCategories(prev => ({ ...prev, [cat.id]: !prev[cat.id] }))} className="w-full flex items-center justify-between px-3 py-2 bg-neutral-900/60 hover:bg-neutral-800/60 transition-colors">
                      <span className="text-xs font-medium text-neutral-300">{cat.name}</span>
                      <svg className={`w-3.5 h-3.5 text-neutral-500 transition-transform ${expandedCategories[cat.id] ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                    {expandedCategories[cat.id] && cat.tracks.map(t => {
                      const inQueue = mediaQueue.some(q => q.trackId === t.id && q.mediaType === "AD");
                      return (
                        <div key={t.id} className="flex items-center justify-between px-3 py-1.5 border-t border-neutral-800/50 hover:bg-neutral-800/30 transition-colors">
                          <span className="text-xs text-neutral-300 truncate flex-1">{t.title}</span>
                          <button disabled={!isConnected} onClick={() => { if (inQueue) { const qi = mediaQueue.find(q => q.trackId === t.id && q.mediaType === "AD"); if (qi) removeQueueItem(qi.id); } else enqueueItem(t.id, t.title, "AD", "ADMIN_DB", "ADMIN"); }}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${inQueue ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-neutral-800 text-neutral-400 border border-neutral-700 hover:text-neutral-200'} ${!isConnected ? 'opacity-40 cursor-not-allowed' : ''}`}
                          >{inQueue ? '✓ أضف مرة أخرى' : 'أضف للانتظار'}</button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              {/* Presenter ads */}
              <div>
                <h3 className="text-xs font-semibold text-neutral-400 mb-2 flex items-center gap-1.5">إعلاناتي <span className="px-1.5 py-0.5 bg-violet-500/10 text-violet-400 text-[9px] rounded-full border border-violet-500/20">مكتبتي</span></h3>
                {presenterAdCategories.length === 0 ? (
                  <p className="text-[10px] text-neutral-500 text-center py-2">لا توجد إعلانات خاصة بعد — ارفع إعلانك أدناه.</p>
                ) : presenterAdCategories.map(cat => (
                  <div key={cat.id} className="border border-neutral-800 rounded-xl overflow-hidden mb-2">
                    <button onClick={() => setExpandedCategories(prev => ({ ...prev, [cat.id]: !prev[cat.id] }))} className="w-full flex items-center justify-between px-3 py-2 bg-neutral-900/60 hover:bg-neutral-800/60 transition-colors">
                      <span className="text-xs font-medium text-neutral-300">{cat.name}</span>
                      <svg className={`w-3.5 h-3.5 text-neutral-500 transition-transform ${expandedCategories[cat.id] ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                    {expandedCategories[cat.id] && cat.tracks.map(t => {
                      const inQueue = mediaQueue.some(q => q.trackId === t.id && q.mediaType === "AD");
                      return (
                        <div key={t.id} className="flex items-center justify-between px-3 py-1.5 border-t border-neutral-800/50 hover:bg-neutral-800/30 transition-colors">
                          <span className="text-xs text-neutral-300 truncate flex-1">{t.title}</span>
                          <button disabled={!isConnected} onClick={() => { if (inQueue) { const qi = mediaQueue.find(q => q.trackId === t.id && q.mediaType === "AD"); if (qi) removeQueueItem(qi.id); } else enqueueItem(t.id, t.title, "AD", "PRESENTER_DB", "PRESENTER"); }}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${inQueue ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-neutral-800 text-neutral-400 border border-neutral-700 hover:text-neutral-200'} ${!isConnected ? 'opacity-40 cursor-not-allowed' : ''}`}
                          >{inQueue ? '✓ أضف مرة أخرى' : 'أضف للانتظار'}</button>
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
                  <span className="text-xs font-semibold text-neutral-400 flex items-center gap-1.5">إعلاناتي من جهازي <span className="px-1.5 py-0.5 bg-neutral-800 text-neutral-500 text-[9px] rounded-full">جلسة فقط</span></span>
                  {localFiles.ads.length > 0 && <button onClick={() => handleClearLocalFiles("ads")} className="text-[10px] text-neutral-500 hover:text-red-400 transition-colors">مسح الكل</button>}
                </div>
                {localFiles.ads.map(f => {
                  const inQ = mediaQueue.some(q => q.trackId === f.id && q.sourceType === "LOCAL_SESSION");
                  return (
                    <div key={f.id} className="flex items-center gap-2 py-1.5 border-b border-neutral-800/40">
                      <span className="text-xs text-neutral-300 truncate flex-1">{f.name}</span>
                      <button onClick={() => { if (inQ) { const qi = mediaQueue.find(q => q.trackId === f.id); if (qi) removeQueueItem(qi.id); } else enqueueLocalFile("ads", f); }}
                        className={`px-2 py-0.5 text-[10px] rounded-lg font-medium ${inQ ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-neutral-800 text-neutral-400 border border-neutral-700'}`}
                      >{inQ ? '✓' : '+انتظار'}</button>
                      <button onClick={() => handleRemoveLocalFileWithQueueCleanup("ads", f.id)} className="text-neutral-600 hover:text-red-400 text-sm">✕</button>
                      <audio controls src={f.objectUrl} className="h-6 w-24 opacity-60" />
                    </div>
                  );
                })}
                <label className="mt-2 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dashed border-neutral-700 bg-neutral-900/40 text-xs text-neutral-500 hover:text-neutral-300 hover:border-neutral-500 cursor-pointer transition-all">
                  + اختر إعلان/بروموتر من جهازك
                  <input type="file" accept="audio/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleLocalFilePick("ads", e.target.files); e.target.value = ''; }} />
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
            if (isMicOpen && pausedItem) { label = `الميك مباشر — متوقف مؤقتاً: ${pausedItem.title}`; typeTag = 'ميك / ' + (pausedItem.mediaType === 'SONG' ? 'أغنية' : pausedItem.mediaType === 'BREAK' ? 'فاصل' : 'إعلان'); stateColor = 'text-amber-400'; dotColor = 'bg-amber-400 animate-pulse'; }
            else if (isMicOpen && activeBgTrack) { label = `الميك مباشر — خلفية: ${activeBgTrack}`; typeTag = 'ميك + خلفية'; stateColor = 'text-red-400'; dotColor = 'bg-red-500 animate-pulse'; }
            else if (isMicOpen) { label = 'الميك مباشر'; typeTag = 'ميك'; stateColor = 'text-red-400'; dotColor = 'bg-red-500 animate-pulse'; }
            else if (playingItem) { const typeAr = playingItem.mediaType === 'SONG' ? 'أغنية' : playingItem.mediaType === 'BREAK' ? 'فاصل' : 'إعلان'; label = playingItem.title; typeTag = typeAr + ' — يعزف الآن'; stateColor = 'text-emerald-400'; dotColor = 'bg-emerald-500 animate-pulse'; }
            else if (activeBgTrack) { label = activeBgTrack; typeTag = 'خلفية موسيقية'; stateColor = 'text-indigo-400'; dotColor = 'bg-indigo-500'; }
            else { label = 'لا يوجد بث حالي'; typeTag = '—'; stateColor = 'text-neutral-600'; dotColor = 'bg-neutral-700'; }
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
                  <p className="text-[10px] text-neutral-500 leading-none mb-0.5">حالة الهوا</p>
                  <p className="leading-none">{shoutcastStatus === 'on_air' ? 'على الهواء ✔' : shoutcastStatus === 'connecting' ? 'جاري الاتصال...' : shoutcastStatus === 'radio_error' ? 'فشل الاتصال' : (shoutcastStatus === 'ws_connected' || shoutcastStatus === 'recording' || shoutcastStatus === 'recording_only') ? 'متصل بالاستوديو' : isConnected ? 'متصل' : 'غير متصل'}</p>
                </div>
              </div>
              {/* Recording status */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold ${
                (shoutcastStatus === 'recording' || shoutcastStatus === 'on_air' || shoutcastStatus === 'radio_error' || shoutcastStatus === 'recording_only') ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300' :
                isConnected ? 'bg-neutral-800/50 border-neutral-700 text-neutral-400' : 'bg-neutral-800/50 border-neutral-700 text-neutral-500'
              }`}>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${(shoutcastStatus === 'recording' || shoutcastStatus === 'on_air' || shoutcastStatus === 'radio_error' || shoutcastStatus === 'recording_only') ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.7)]' : 'bg-neutral-600'}`} />
                <div>
                  <p className="text-[10px] text-neutral-500 leading-none mb-0.5">حالة التسجيل</p>
                  <p className="leading-none">{(shoutcastStatus === 'recording' || shoutcastStatus === 'on_air' || shoutcastStatus === 'radio_error' || shoutcastStatus === 'recording_only') ? 'تسجيل الجلسة ●' : isConnected ? 'في انتظار الصوت' : 'لا يوجد تسجيل'}</p>
                </div>
              </div>
            </div>
            {/* Tech indicators row */}
            <div className="flex flex-wrap items-center gap-2 text-[10px]">
              <span className={`px-2 py-0.5 rounded-lg border font-mono ${isConnected ? 'bg-neutral-950 border-neutral-800 text-neutral-400' : 'bg-neutral-900 border-neutral-800 text-neutral-600'}`}>64 kbps</span>
              <span className={`px-2 py-0.5 rounded-lg border flex items-center gap-1 ${isConnected ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-neutral-900 border-neutral-800 text-neutral-600'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-neutral-600'}`}></span>أخضر / ممتاز
              </span>
              <span className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${heartbeatStatus === 'active' ? 'bg-red-500 animate-pulse' : 'bg-neutral-600'}`}></span>
                <span className={heartbeatStatus === 'active' ? 'text-red-400' : 'text-neutral-500'}>إرسال الميك: {heartbeatStatus === 'active' ? 'نشط' : 'متوقف'}</span>
              </span>
              <span className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${audioBackendStatus === 'connected' ? 'bg-emerald-500' : 'bg-neutral-600'}`}></span>
                <span className={audioBackendStatus === 'connected' ? 'text-emerald-400' : 'text-neutral-500'}>Backend: {audioBackendStatus === 'connected' ? 'متصل' : 'غير متصل'}</span>
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
              const barHeight = isMicOpen ? Math.max(0.08, volumeLevel * posWeight + (Math.random() * 0.08 * volumeLevel)) : 0;
              return (
                <div key={i} className={`w-2 rounded-full transition-all ${isMicOpen ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 'bg-neutral-800'}`}
                  style={isMicOpen ? { height: `${Math.max(4, barHeight * 32)}px`, animation: `soundBars ${0.2 + Math.random() * 0.3}s ease-in-out infinite alternate` } : { height: '4px' }} />
              );
            })}
          </div>

          {/* ── 3 Fader Strips ── */}
          <div className="space-y-2">
            {/* Mic Fader */}
            <div className="bg-white/[0.03] backdrop-blur-lg border border-red-500/20 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-red-300">🎤 المايكروفون</span>
                <span className={`text-xs font-medium ${isMicOpen ? 'text-red-400' : 'text-neutral-500'}`}>{isMicOpen ? 'مفتوح' : 'مغلق'}</span>
              </div>
              <p className="text-[10px] text-neutral-500">{!isConnected ? 'غير متصل' : isMicOpen ? 'الميك مفتوح — الصوت يُبث مباشرة' : 'اضغط زر الميك لبدء البث'}</p>
            </div>

            {/* Background Fader */}
            <div className="bg-white/[0.03] backdrop-blur-lg border border-blue-500/20 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-blue-300">🎵 الخلفية</span>
                <span className="text-xs font-mono text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">{bgVolume}%{isMicOpen ? ' (مخفوت)' : ''}</span>
              </div>
              <input type="range" min={0} max={100} value={bgVolume} onChange={e => setBgVolume(Number(e.target.value))} className="w-full h-1.5 accent-blue-400 cursor-pointer" />
              <p className="text-[10px] text-neutral-500 mt-1 truncate">{activeBgTrack || 'لا يوجد'}</p>
            </div>

            {/* Queue Fader */}
            <div className="bg-white/[0.03] backdrop-blur-lg border border-green-500/20 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-green-300">📋 قائمة الانتظار</span>
                <span className="text-xs font-mono text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">{queueVolume}%</span>
              </div>
              <input type="range" min={0} max={100} value={queueVolume} onChange={e => setQueueVolume(Number(e.target.value))} className="w-full h-1.5 accent-green-400 cursor-pointer" />
              <p className="text-[10px] text-neutral-500 mt-1">يُطبَّق على الأغاني والفواصل والإعلانات</p>
            </div>
          </div>

          {/* ── Monitoring ── */}
          {isConnected && (
            <div className="bg-white/[0.03] backdrop-blur-lg border border-white/10 rounded-2xl p-3 space-y-2">
              <button onClick={toggleMonitoring} className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all ${isMonitoring ? 'bg-amber-500/15 border-amber-500/40 text-amber-400' : 'bg-neutral-900/50 border-neutral-800 text-neutral-500 hover:text-neutral-300'}`}>
                🎧 المراقبة: {isMonitoring ? 'ON' : 'OFF'}
              </button>
              <div className={`flex flex-col gap-1.5 bg-neutral-900/40 border rounded-xl px-3 py-2.5 transition-opacity ${isMonitoring ? 'border-amber-500/20 opacity-100' : 'border-neutral-800 opacity-40 pointer-events-none'}`}>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-amber-300">مستوى صوت المراقبة</label>
                  <span className="text-xs font-mono text-amber-400">{Math.round(monitorVolume * 100)}%</span>
                </div>
                <input type="range" min={0} max={1} step={0.05} value={monitorVolume}
                  onChange={e => { const v = parseFloat(e.target.value); setMonitorVolume(v); if (isMonitoring && monitorGainRef.current) monitorGainRef.current.gain.value = v; }}
                  className="w-full h-1.5 accent-amber-400 cursor-pointer" />
              </div>
              {isMonitoring && (
                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] px-3 py-1.5 rounded-lg text-center justify-center">⚠️ استخدم سماعات Headphones لتجنب الصفير / feedback</div>
              )}
            </div>
          )}

          {/* ── Mic Source ── */}
          <div className="bg-white/[0.03] backdrop-blur-lg border border-white/10 rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-400">مصدر الميكروفون</span>
              <button onClick={refreshAudioInputDevices} className="text-[10px] px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 transition-colors">↻ تحديث الأجهزة</button>
            </div>
            <select value={selectedMicDeviceId} onChange={e => switchMicDevice(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500/60 cursor-pointer">
              {audioInputDevices.length === 0 && <option value="">الميكروفون الافتراضي</option>}
              {audioInputDevices.map((dev, i) => <option key={dev.deviceId} value={dev.deviceId}>{dev.label || `ميكروفون ${i + 1}${dev.deviceId === 'default' ? ' (افتراضي)' : ''}`}</option>)}
            </select>
            {micDeviceError && <div className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2.5 py-1.5 rounded-lg">⚠️ {micDeviceError}</div>}
            <p className="text-[9px] text-neutral-600 text-center">قد تظهر أسماء الأجهزة بعد منح صلاحية الميكروفون</p>
          </div>

          {/* [DIAG] Test button removed in v3 — was only used for debugging */}

          {/* Status Card */}
          <div className="bg-white/[0.03] backdrop-blur-lg border border-white/10 rounded-2xl p-3 space-y-2">
            <h3 className="text-sm font-semibold text-neutral-300 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              الحالة الحالية
            </h3>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between"><span className="text-neutral-500">جاهز للتشغيل</span><span className="text-neutral-300 truncate max-w-[200px]">{(() => { const readyItem = mediaQueue.find(q => q.status === 'READY'); return readyItem ? (isMicOpen ? `${readyItem.title} — ينتظر غلق المايك` : readyItem.title) : 'لا توجد أغاني في قائمة الانتظار'; })()}</span></div>
              <div className="flex items-center justify-between"><span className="text-neutral-500">قائمة الانتظار</span><span className="text-neutral-300">{mediaQueue.length > 0 ? `${mediaQueue.length} عنصر في الانتظار` : 'قائمة الانتظار فارغة'}</span></div>
              <div className="flex items-center justify-between"><span className="text-neutral-500">الخلفية</span><span className="text-neutral-300 truncate max-w-[200px]">{activeBgTrack || 'لا يوجد موسيقى خلفية'}</span></div>
            </div>
            {isConnected && (
              <p className="text-[10px] text-neutral-500">{isMicOpen ? 'الميك مفتوح — العناصر المختارة تنتظر غلق الميك' : 'الميك مغلق — يمكن إضافة أغاني وفواصل وإعلانات للانتظار'}</p>
            )}
            {!isConnected && <p className="text-[10px] text-neutral-500">في انتظار الاتصال بالخادم...</p>}
            {isConnected && !isMicOpen && mediaQueue.some(q => q.status === 'READY' && q.mediaType === 'SONG') && (
              <button onClick={handleShuffle} className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-[10px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
                تشغيل أغنية عشوائية من نفس القسم
              </button>
            )}
          </div>

          {/* ── DSP Panel ── */}
          <DspPanel
            currentParams={dspParams}
            isMicOpen={isMicOpen}
            onParamsChange={(p) => { setDspParams(p); applyDspParams(p); }}
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
                📋 قائمة الانتظار
                {mediaQueue.length > 0 && <span className="px-2 py-0.5 bg-violet-500/20 text-violet-400 text-[10px] rounded-full">{mediaQueue.length}</span>}
              </h2>
              <div className="flex items-center gap-2">
                <button onClick={() => setAutoQueue(v => !v)} className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${autoQueue ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-neutral-800 text-neutral-500 border border-neutral-700'}`}>
                  ⏭ {autoQueue ? 'تلقائي' : 'يدوي'}
                </button>
                {mediaQueue.length > 0 && <button onClick={() => setMediaQueue([])} className="px-2 py-1 rounded-lg text-[10px] text-neutral-500 hover:text-red-400 bg-neutral-800 border border-neutral-700 transition-colors">مسح الكل</button>}
              </div>
            </div>
            <p className="text-[10px] text-neutral-600 mb-2">⚠ قائمة الانتظار هنا تنظّم التشغيل فقط، ولا ترسل الصوت للبث المباشر بدون Audio Engine.</p>

            {mediaQueue.length === 0 ? (
              <p className="text-xs text-neutral-600 text-center py-6">لا توجد عناصر في قائمة الانتظار</p>
            ) : (
              <div className="space-y-1.5">
                {mediaQueue.map((item, idx) => {
                  const isPlaying = playingQueueId === item.id;
                  const isPausedManually = isPaused && !playingQueueId;
                  const typeLabel = item.mediaType === 'SONG' ? 'أغنية' : item.mediaType === 'BREAK' ? 'فاصل' : 'إعلان';
                  const sourceLabel = item.sourceType === 'ADMIN_DB' ? 'مكتبة Admin' : item.sourceType === 'PRESENTER_DB' ? 'مكتبة المقدم' : 'من الجهاز';
                  return (
                    <div key={item.id} className={`rounded-xl border p-2.5 transition-all ${isPlaying ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-neutral-900/30 border-neutral-800 hover:bg-neutral-800/30'}`}>
                      <div className="flex items-center gap-2">
                        {/* Reorder */}
                        <div className="flex flex-col gap-0.5">
                          <button disabled={idx === 0} onClick={() => { const q = [...mediaQueue]; [q[idx-1], q[idx]] = [q[idx], q[idx-1]]; setMediaQueue(q); }} className="text-[10px] text-neutral-600 hover:text-neutral-300 disabled:opacity-20">↑</button>
                          <button disabled={idx === mediaQueue.length - 1} onClick={() => { const q = [...mediaQueue]; [q[idx], q[idx+1]] = [q[idx+1], q[idx]]; setMediaQueue(q); }} className="text-[10px] text-neutral-600 hover:text-neutral-300 disabled:opacity-20">↓</button>
                        </div>
                        <span className="text-[10px] text-neutral-600 font-mono">#{idx+1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-neutral-200 truncate">{item.title}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-neutral-800 text-neutral-400">{typeLabel}</span>
                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-neutral-800 text-neutral-500">{sourceLabel}</span>
                            {item.status === 'READY' && <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">جاهز</span>}
                            {item.status === 'READY_AFTER_MIC_CLOSE' && <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20">ينتظر غلق المايك</span>}
                            {item.status === 'PREVIEW_ONLY' && <span className="px-1.5 py-0.5 rounded text-[9px] bg-neutral-700 text-neutral-400">معاينة فقط</span>}
                            {isPlaying && <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/20 text-emerald-400 animate-pulse">يعزف الآن</span>}
                          </div>
                        </div>
                        {/* Play/Pause/Resume */}
                        {isPlaying ? (
                          <button onClick={() => pauseQueueItem()} className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/25 transition-colors">⏸ توقف</button>
                        ) : isPausedManually ? (
                          <button onClick={() => playQueueItem(item)} className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 transition-colors">▶ استمرار</button>
                        ) : isMicOpen ? (
                          <button disabled className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-neutral-800 text-neutral-500 border border-neutral-700 opacity-50 cursor-not-allowed">▶ انتظار</button>
                        ) : item.status === 'READY' || item.status === 'PREVIEW_ONLY' ? (
                          <button onClick={() => playQueueItem(item)} className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 transition-colors">▶ تشغيل</button>
                        ) : null}
                        <button onClick={() => removeQueueItem(item.id)} title="حذف من القائمة" className="w-8 h-8 flex items-center justify-center rounded-md text-neutral-600 hover:text-red-400 hover:bg-red-500/10 transition-colors text-sm">✕</button>
                      </div>
                      {/* Seek bar */}
                      {playbackProgress && playbackProgress.id === item.id && (
                        <div className="w-full flex items-center gap-1.5 mt-1.5">
                          <span className="text-[9px] text-neutral-500 tabular-nums w-7 text-left">{Math.floor(playbackProgress.currentTime / 60)}:{String(Math.floor(playbackProgress.currentTime % 60)).padStart(2,'0')}</span>
                          <input type="range" min={0} max={playbackProgress.duration || 0} step={0.5} value={playbackProgress.currentTime}
                            onChange={e => { const t = parseFloat(e.target.value); if (currentlyPlayingRef.current) currentlyPlayingRef.current.currentTime = t; }}
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
              <h2 className="text-sm font-semibold text-neutral-300">💥 مؤثرات صوتية (SFX)</h2>
              <div className="flex items-center gap-2">
                {sfxPreloadStatus === 'loading' && <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>}
                {sfxPreloadStatus === 'ready' && <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[9px] rounded-full border border-emerald-500/20">جاهز</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] text-neutral-500">الصوت</span>
              <input type="range" min={0} max={1} step={0.01} value={sfxVolume} onChange={e => setSfxVolume(parseFloat(e.target.value))} className="flex-1 h-1 accent-violet-400 cursor-pointer" />
              <span className="text-[10px] text-neutral-400 font-mono w-8">{Math.round(sfxVolume * 100)}%</span>
            </div>
            {sfxCategories.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-xs text-neutral-500">لا توجد مؤثرات صوتية</p>
                <p className="text-[10px] text-neutral-600">أضف مؤثرات من لوحة الإدارة</p>
              </div>
            ) : sfxCategories.map(cat => (
              <div key={cat.id} className="mb-2">
                <button onClick={() => setExpandedCategories(prev => ({ ...prev, [`sfx_${cat.id}`]: !prev[`sfx_${cat.id}`] }))} className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg bg-neutral-900/40 hover:bg-neutral-800/40 transition-colors mb-1">
                  <span className="text-xs text-neutral-300">{cat.name}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-neutral-500">{cat.tracks.length} مؤثر</span>
                    <svg className={`w-3 h-3 text-neutral-500 transition-transform ${expandedCategories[`sfx_${cat.id}`] ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                </button>
                {expandedCategories[`sfx_${cat.id}`] && (
                  <div className="grid grid-cols-3 gap-1.5 px-1">
                    {cat.tracks.map(t => {
                      const isActive = activeSfxIds.has(t.id);
                      return (
                        <button key={t.id} onClick={() => { if (isActive) stopSfx(t.id); else playSfx(t.id); }}
                          className={`px-2 py-2 rounded-lg text-[10px] font-medium truncate transition-all ${isActive ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_10px_rgba(52,211,153,0.2)]' : 'bg-neutral-800/60 text-neutral-400 border border-neutral-700/50 hover:bg-neutral-700/60 hover:text-neutral-200'}`}
                        >
                          {isActive && <span className="inline-block w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse ml-1"></span>}
                          {t.title}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            <button onClick={stopAllSfx} className="w-full mt-2 px-3 py-2 rounded-xl text-xs font-medium bg-neutral-800/60 text-neutral-400 border border-neutral-700/50 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-all">⬛ إيقاف جميع المؤثرات</button>
          </section>
        </div>

        {/* ── Mobile Queue Tab (lg:hidden) ── */}
        <div className={`${mobileTab === 'queue' ? 'block' : 'hidden'} lg:hidden`}>
          <section className="bg-white/[0.03] backdrop-blur-lg border border-white/10 rounded-2xl p-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-neutral-300 flex items-center gap-2">📋 قائمة الانتظار {mediaQueue.length > 0 && <span className="px-2 py-0.5 bg-violet-500/20 text-violet-400 text-[10px] rounded-full">{mediaQueue.length}</span>}</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => setAutoQueue(v => !v)} className={`px-2.5 py-1 rounded-lg text-[10px] font-medium ${autoQueue ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-neutral-800 text-neutral-500 border border-neutral-700'}`}>⏭ {autoQueue ? 'تلقائي' : 'يدوي'}</button>
                {mediaQueue.length > 0 && <button onClick={() => setMediaQueue([])} className="px-2 py-1 rounded-lg text-[10px] text-neutral-500 hover:text-red-400 bg-neutral-800 border border-neutral-700">مسح الكل</button>}
              </div>
            </div>
            {/* Queue volume */}
            <div className="bg-neutral-900/40 border border-green-500/20 rounded-xl px-3 py-2.5 mb-3">
              <div className="flex items-center justify-between mb-1"><span className="text-xs font-semibold text-green-300">مستوى صوت قائمة الانتظار</span><span className="text-xs font-mono text-green-400">{queueVolume}%</span></div>
              <input type="range" min={0} max={100} value={queueVolume} onChange={e => setQueueVolume(Number(e.target.value))} className="w-full h-1.5 accent-green-400 cursor-pointer" />
            </div>
            {mediaQueue.length === 0 ? (
              <p className="text-xs text-neutral-600 text-center py-6">لا توجد عناصر في قائمة الانتظار</p>
            ) : (
              <div className="space-y-1.5">
                {mediaQueue.map((item, idx) => {
                  const isPlaying = playingQueueId === item.id;
                  const isPausedManually = isPaused && !playingQueueId;
                  const typeLabel = item.mediaType === 'SONG' ? 'أغنية' : item.mediaType === 'BREAK' ? 'فاصل' : 'إعلان';
                  return (
                    <div key={item.id} className={`rounded-xl border p-2.5 ${isPlaying ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-neutral-900/30 border-neutral-800'}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-neutral-600 font-mono">#{idx+1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-neutral-200 truncate">{item.title}</p>
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-neutral-800 text-neutral-400">{typeLabel}</span>
                          {isPlaying && <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/20 text-emerald-400 animate-pulse mr-1">يعزف الآن</span>}
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
                          <input type="range" min={0} max={playbackProgress.duration || 0} step={0.5} value={playbackProgress.currentTime} onChange={e => { const t = parseFloat(e.target.value); if (currentlyPlayingRef.current) currentlyPlayingRef.current.currentTime = t; }} className="flex-1 h-1 accent-emerald-400 cursor-pointer" />
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
            <h2 className="text-sm font-semibold text-neutral-300 mb-2">💥 مؤثرات صوتية (SFX)</h2>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] text-neutral-500">الصوت</span>
              <input type="range" min={0} max={1} step={0.01} value={sfxVolume} onChange={e => setSfxVolume(parseFloat(e.target.value))} className="flex-1 h-1 accent-violet-400 cursor-pointer" />
              <span className="text-[10px] text-neutral-400">{Math.round(sfxVolume * 100)}%</span>
            </div>
            {sfxCategories.length === 0 ? (
              <div className="text-center py-4"><p className="text-xs text-neutral-500">لا توجد مؤثرات صوتية</p><p className="text-[10px] text-neutral-600">أضف مؤثرات من لوحة الإدارة</p></div>
            ) : sfxCategories.map(cat => (
              <div key={cat.id} className="mb-2">
                <button onClick={() => setExpandedCategories(prev => ({ ...prev, [`sfx_m_${cat.id}`]: !prev[`sfx_m_${cat.id}`] }))} className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg bg-neutral-900/40 hover:bg-neutral-800/40 transition-colors mb-1">
                  <span className="text-xs text-neutral-300">{cat.name}</span>
                  <span className="text-[9px] text-neutral-500">{cat.tracks.length} مؤثر</span>
                </button>
                {expandedCategories[`sfx_m_${cat.id}`] && (
                  <div className="grid grid-cols-3 gap-1.5 px-1">
                    {cat.tracks.map(t => {
                      const isActive = activeSfxIds.has(t.id);
                      return (
                        <button key={t.id} onClick={() => { if (isActive) stopSfx(t.id); else playSfx(t.id); }}
                          className={`px-2 py-2 rounded-lg text-[10px] font-medium truncate transition-all ${isActive ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-neutral-800/60 text-neutral-400 border border-neutral-700/50 hover:bg-neutral-700/60'}`}
                        >{t.title}</button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            <button onClick={stopAllSfx} className="w-full mt-2 px-3 py-2 rounded-xl text-xs bg-neutral-800/60 text-neutral-400 border border-neutral-700/50 hover:bg-red-500/10 hover:text-red-400 transition-all">⬛ إيقاف جميع المؤثرات</button>
          </section>
        </div>

      </main>

      {/* ── Footer ── */}
      <footer className="text-center py-3">
        <p className="text-neutral-600 text-xs">قم بالاتصال بالخادم أولاً لتفعيل البث، ثم اضغط على زر الميكروفون</p>
      </footer>
    </div>
  );
}

