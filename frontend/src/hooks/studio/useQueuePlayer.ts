"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { QueueItem, QueueStatus, MediaType, SourceType, MediaTab, LocalFile, LocalFilesMap } from "@/app/studio/studio-types";
import { MEDIA_POLICY } from "@/app/studio/studio-types";

// ── Constants ────────────────────────────────────────────────────────────────
const BG_DUCK_RATIO          = 0.15;
const QUEUE_CROSSFADE_SEC    = 5;
const QUEUE_CROSSFADE_CHECK_MS = 500;

/**
 * useQueuePlayer — Queue state, playback, crossfade, auto-advance,
 * pause/resume, background audio, local files.
 */

export interface QueuePlayerHook {
  // Queue state
  mediaQueue:       QueueItem[];
  setMediaQueue:    React.Dispatch<React.SetStateAction<QueueItem[]>>;
  playingQueueId:   string | null;
  isPaused:         boolean;
  playbackProgress: { id: string; currentTime: number; duration: number } | null;
  autoQueue:        boolean;
  setAutoQueue:     React.Dispatch<React.SetStateAction<boolean>>;
  fadeMessage:      string | null;

  // Background audio state
  bgVolume:         number;
  setBgVolume:      React.Dispatch<React.SetStateAction<number>>;
  queueVolume:      number;
  setQueueVolume:   React.Dispatch<React.SetStateAction<number>>;
  activeBgTrackId:  string | null;
  setActiveBgTrackId: React.Dispatch<React.SetStateAction<string | null>>;
  activeBgLocalUrl: string | null;
  setActiveBgLocalUrl: React.Dispatch<React.SetStateAction<string | null>>;

  // Local files
  localFiles:       LocalFilesMap;
  setLocalFiles:    React.Dispatch<React.SetStateAction<LocalFilesMap>>;

  // Callbacks
  playQueueItem:     (item: QueueItem) => void;
  pauseQueueItem:    () => void;
  stopQueuePlayback: () => void;
  stopBackgroundAudio: () => void;
  enqueueItem:       (trackId: string, title: string, mediaType: MediaType, sourceType: SourceType, ownerType?: "ADMIN" | "PRESENTER", objectUrl?: string, fileUrl?: string) => void;
  removeQueueItem:   (queueId: string) => void;
  clearQueue:        () => void;
  moveQueueItem:     (queueId: string, direction: "up" | "down") => void;
  handleLocalFilePick:  (tab: MediaTab, files: FileList | null) => void;
  handleRemoveLocalFile: (tab: MediaTab, fileId: string) => void;
  handleClearLocalFiles: (tab: MediaTab) => void;
  applyBgGain:       (reason: string, volumeOverride?: number) => void;
  fadeGain:          (gainNode: GainNode, target: number, durationSec: number, reason: string) => void;
  showFadeMessage:   (msg: string) => void;

  // Refs exposed for orchestration functions (toggleMic, toggleConnection, stopBroadcastSession)
  bgAudioRef:        React.MutableRefObject<HTMLAudioElement | null>;
  bgSourceRef:       React.MutableRefObject<MediaElementAudioSourceNode | null>;
  bgGainRef:         React.MutableRefObject<GainNode | null>;
  queueSourceRef:    React.MutableRefObject<MediaElementAudioSourceNode | null>;
  queueGainRef:      React.MutableRefObject<GainNode | null>;
  currentlyPlayingRef: React.MutableRefObject<HTMLAudioElement | null>;
  mediaQueueRef:     React.MutableRefObject<QueueItem[]>;
  bgVolumeRef:       React.MutableRefObject<number>;
  activeBgTrackIdRef:  React.MutableRefObject<string | null>;
  activeBgLocalUrlRef: React.MutableRefObject<string | null>;
  crossfadeTimerRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>;
  inCrossfadeRef:    React.MutableRefObject<boolean>;
  outgoingPlayerRef: React.MutableRefObject<{ audio: HTMLAudioElement; source: MediaElementAudioSourceNode; gain: GainNode } | null>;
  pausedForMicRef:   React.MutableRefObject<QueueItem | null>;
  autoQueueRef:      React.MutableRefObject<boolean>;
}

export function useQueuePlayer(
  audioCtxRef:    React.MutableRefObject<AudioContext | null>,
  mixerDestRef:   React.MutableRefObject<MediaStreamAudioDestinationNode | null>,
  monitorGainRef: React.MutableRefObject<GainNode | null>,
  micGainRef:     React.MutableRefObject<GainNode | null>,
  isMicOpen:      boolean,
  ensureRecordingStarted: (reason: 'mic' | 'background' | 'queue') => void,
): QueuePlayerHook {
  // ── State ──
  const [mediaQueue, setMediaQueue]       = useState<QueueItem[]>([]);
  const [playingQueueId, setPlayingQueueId] = useState<string | null>(null);
  const [isPaused, setIsPaused]           = useState<boolean>(false);
  const [playbackProgress, setPlaybackProgress] = useState<{ id: string; currentTime: number; duration: number } | null>(null);
  const [autoQueue, setAutoQueue]         = useState<boolean>(true);
  const [bgVolume, setBgVolume]           = useState<number>(0.5);
  const [queueVolume, setQueueVolume]     = useState<number>(0.8);
  const [activeBgTrackId, setActiveBgTrackId]   = useState<string | null>(null);
  const [activeBgLocalUrl, setActiveBgLocalUrl] = useState<string | null>(null);
  const [fadeMessage, setFadeMessage]     = useState<string | null>(null);
  const [localFiles, setLocalFiles]       = useState<LocalFilesMap>({
    background: [], songs: [], breaks: [], ads: [],
  });

  // ── Refs ──
  const bgAudioRef         = useRef<HTMLAudioElement | null>(null);
  const bgSourceRef        = useRef<MediaElementAudioSourceNode | null>(null);
  const bgGainRef          = useRef<GainNode | null>(null);
  const queueSourceRef     = useRef<MediaElementAudioSourceNode | null>(null);
  const queueGainRef       = useRef<GainNode | null>(null);
  const currentlyPlayingRef = useRef<HTMLAudioElement | null>(null);
  const mediaQueueRef      = useRef<QueueItem[]>([]);
  const bgVolumeRef        = useRef<number>(0.5);
  const activeBgTrackIdRef  = useRef<string | null>(null);
  const activeBgLocalUrlRef = useRef<string | null>(null);
  const crossfadeTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const inCrossfadeRef     = useRef<boolean>(false);
  const outgoingPlayerRef  = useRef<{ audio: HTMLAudioElement; source: MediaElementAudioSourceNode; gain: GainNode } | null>(null);
  const pausedForMicRef    = useRef<QueueItem | null>(null);
  const autoQueueRef       = useRef<boolean>(true);
  const pausedQueueAudioRef = useRef<HTMLAudioElement | null>(null);
  const pausedQueueItemRef  = useRef<QueueItem | null>(null);
  const playbackRafRef     = useRef<number | null>(null);
  const localObjectUrlsRef = useRef<Set<string>>(new Set());

  // ── Sync refs with state ──
  useEffect(() => { mediaQueueRef.current = mediaQueue; }, [mediaQueue]);
  useEffect(() => { autoQueueRef.current = autoQueue; }, [autoQueue]);
  useEffect(() => { activeBgTrackIdRef.current  = activeBgTrackId;  }, [activeBgTrackId]);
  useEffect(() => { activeBgLocalUrlRef.current = activeBgLocalUrl; }, [activeBgLocalUrl]);
  useEffect(() => { bgVolumeRef.current         = bgVolume;         }, [bgVolume]);

  // ── stopBackgroundAudio ──
  const stopBackgroundAudio = useCallback(() => {
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

  // ── applyBgGain ──
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
      bgAudioRef.current.volume = isMicOpen ? vol * BG_DUCK_RATIO : vol;
    }
    console.log(`[BgGain] reason=${reason} override=${volumeOverride?.toFixed(2)??'ref'} queueActive=${queueActive} micOpen=${isMicOpen} vol=${vol.toFixed(2)} → gain=${target.toFixed(2)}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMicOpen]);

  // ── fadeGain ──
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
  }, [audioCtxRef]);

  // ── showFadeMessage ──
  const showFadeMessage = useCallback((msg: string) => {
    setFadeMessage(msg);
    setTimeout(() => setFadeMessage(null), 4000);
  }, []);

  // ── Background volume effect ──
  useEffect(() => {
    applyBgGain('bgVolume-effect');
  }, [bgVolume, applyBgGain]);

  // ── Background ducking effect ──
  useEffect(() => {
    applyBgGain('mic-toggle');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMicOpen]);

  // ── Queue volume effect ──
  useEffect(() => {
    if (queueGainRef.current) {
      queueGainRef.current.gain.value = queueVolume;
    } else if (currentlyPlayingRef.current) {
      currentlyPlayingRef.current.volume = queueVolume;
    }
  }, [queueVolume]);

  // ── Local file handlers ──
  const handleLocalFilePick = useCallback((tab: MediaTab, files: FileList | null) => {
    if (!files) return;
    const newFiles: LocalFile[] = [];
    Array.from(files).forEach(file => {
      if (!file.type.startsWith("audio/")) return;
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

  const handleClearLocalFiles = useCallback((tab: MediaTab) => {
    setLocalFiles(prev => {
      const toRemove = prev[tab];
      toRemove.forEach(f => {
        URL.revokeObjectURL(f.objectUrl);
        localObjectUrlsRef.current.delete(f.objectUrl);
      });
      return { ...prev, [tab]: [] };
    });
    setMediaQueue(prev =>
      prev.filter(q => q.sourceType !== "LOCAL_SESSION" || !(
        (tab === "songs"  && q.mediaType === "SONG")  ||
        (tab === "breaks" && q.mediaType === "BREAK") ||
        (tab === "ads"    && q.mediaType === "AD")
      ))
    );
  }, []);

  // ── enqueueItem ──
  const enqueueItem = useCallback((
    trackId:    string,
    title:      string,
    mediaType:  MediaType,
    sourceType: SourceType,
    ownerType?: "ADMIN" | "PRESENTER",
    objectUrl?: string,
    fileUrl?:   string,
  ) => {
    if (mediaType === "BACKGROUND") return;
    const policy = MEDIA_POLICY[mediaType];
    const status: QueueStatus = isMicOpen
      ? (policy.canSelectWhileMicOpen ? "READY_AFTER_MIC_CLOSE" : "BLOCKED_WHILE_MIC_OPEN")
      : "READY";
    if (status === "BLOCKED_WHILE_MIC_OPEN") return;
    setMediaQueue(prev => {
      const item: QueueItem = { id: crypto.randomUUID(), trackId, title, mediaType, sourceType, status, ownerType, objectUrl, fileUrl };
      return [...prev, item];
    });
  }, [isMicOpen]);

  // ── removeQueueItem ──
  const removeQueueItem = useCallback((queueId: string) => {
    setMediaQueue(prev => prev.filter(q => q.id !== queueId));
  }, []);

  // ── clearQueue ──
  const clearQueue = useCallback(() => { setMediaQueue([]); }, []);

  // ── moveQueueItem ──
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

  // ── getQueueItemAudioSrc ──
  const getQueueItemAudioSrc = useCallback((item: QueueItem): string => {
    if (item.sourceType === "LOCAL_SESSION" && item.objectUrl) return item.objectUrl;
    return `/api/tracks/${item.trackId}`;
  }, []);

  // ── playQueueItem ──
  const playQueueItem = useCallback((item: QueueItem) => {
    if (playbackRafRef.current) { cancelAnimationFrame(playbackRafRef.current); playbackRafRef.current = null; }

    // Resume from manual pause if same item
    if (pausedQueueItemRef.current?.id === item.id && pausedQueueAudioRef.current) {
      const audio = pausedQueueAudioRef.current;
      pausedQueueAudioRef.current = null;
      pausedQueueItemRef.current  = null;
      currentlyPlayingRef.current = audio;
      setPlayingQueueId(item.id);
      setIsPaused(false);
      const ctx  = audioCtxRef.current;
      const dest = mixerDestRef.current;
      if (ctx && dest && !queueGainRef.current) {
        if (queueGainRef.current) {
          (queueGainRef.current as GainNode).gain.value = queueVolume;
        }
      }
      audio.play()
        .then(() => {
          console.log('[DIAG][queue] resume play: RESOLVED');
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

    // New item: stop any current audio
    if (currentlyPlayingRef.current) {
      currentlyPlayingRef.current.pause();
      currentlyPlayingRef.current.currentTime = 0;
      currentlyPlayingRef.current = null;
    }
    pausedQueueAudioRef.current = null;
    pausedQueueItemRef.current  = null;
    setIsPaused(false);
    setPlaybackProgress(null);

    const src = getQueueItemAudioSrc(item);
    console.log('[DIAG][queue] Playing item:', item.title, '| mediaType:', item.mediaType, '| sourceType:', item.sourceType);
    const audio = new Audio(src);
    currentlyPlayingRef.current = audio;
    setPlayingQueueId(item.id);

    // Fade background to 0
    if (bgGainRef.current) {
      fadeGain(bgGainRef.current, 0, 3, 'bg→queue crossfade-out');
    } else if (bgAudioRef.current) {
      bgAudioRef.current.volume = 0;
    }

    // Connect to Web Audio mixer
    const ctx  = audioCtxRef.current;
    const dest = mixerDestRef.current;
    if (ctx && dest) {
      let qSrc: MediaElementAudioSourceNode;
      try {
        qSrc = ctx.createMediaElementSource(audio);
      } catch (e) {
        console.error('[DIAG][queue] createMediaElementSource FAILED:', e);
        currentlyPlayingRef.current = null;
        setPlayingQueueId(null);
        return;
      }
      const qGain = ctx.createGain();
      qGain.gain.value = 0;
      qSrc.connect(qGain);
      qGain.connect(dest);
      if (monitorGainRef.current) {
        qGain.connect(monitorGainRef.current);
      }
      queueSourceRef.current = qSrc;
      queueGainRef.current   = qGain;
    } else {
      console.warn('[DIAG][queue] NO_MIXER — not playing locally.');
      currentlyPlayingRef.current = null;
      setPlayingQueueId(null);
      return;
    }

    // onended handler
    audio.onended = () => {
      if (playbackRafRef.current) { cancelAnimationFrame(playbackRafRef.current); playbackRafRef.current = null; }
      if (crossfadeTimerRef.current) { clearInterval(crossfadeTimerRef.current); crossfadeTimerRef.current = null; }
      if (inCrossfadeRef.current) return;
      if (autoQueueRef.current) {
        const queue = mediaQueueRef.current;
        const currentIdx = queue.findIndex(q => q.id === item.id);
        if (currentIdx !== -1) {
          const nextItem = queue.slice(currentIdx + 1).find(q => q.status === "READY");
          if (nextItem) {
            try { queueGainRef.current?.disconnect(); } catch {/* ignore */}
            try { queueSourceRef.current?.disconnect(); } catch {/* ignore */}
            queueGainRef.current = null; queueSourceRef.current = null;
            currentlyPlayingRef.current = null;
            setPlayingQueueId(null); setPlaybackProgress(null); setIsPaused(false);
            setTimeout(() => playQueueItem(nextItem), 50);
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
      queueGainRef.current = null; queueSourceRef.current = null;
      currentlyPlayingRef.current = null;
      setPlayingQueueId(null);
    };

    audio.play()
      .then(() => {
        ensureRecordingStarted('queue');
        if (queueGainRef.current) {
          fadeGain(queueGainRef.current, queueVolume, 3, 'queue fade-in');
        }
        const tick = () => {
          if (!currentlyPlayingRef.current) return;
          setPlaybackProgress({ id: item.id, currentTime: currentlyPlayingRef.current.currentTime, duration: currentlyPlayingRef.current.duration || 0 });
          playbackRafRef.current = requestAnimationFrame(tick);
        };
        playbackRafRef.current = requestAnimationFrame(tick);

        // Crossfade polling
        if (crossfadeTimerRef.current) { clearInterval(crossfadeTimerRef.current); }
        crossfadeTimerRef.current = setInterval(() => {
          const a = currentlyPlayingRef.current;
          if (!a || !a.duration || a.paused || inCrossfadeRef.current) return;
          const remaining = a.duration - a.currentTime;
          if (remaining <= QUEUE_CROSSFADE_SEC && a.duration > QUEUE_CROSSFADE_SEC * 2 && autoQueueRef.current) {
            const queue = mediaQueueRef.current;
            const currentIdx = queue.findIndex(q => q.id === item.id);
            if (currentIdx === -1) return;
            const nextItem = queue.slice(currentIdx + 1).find(q => q.status === "READY");
            if (nextItem) {
              clearInterval(crossfadeTimerRef.current!);
              crossfadeTimerRef.current = null;
              inCrossfadeRef.current = true;
              console.log(`[Crossfade] Starting ${QUEUE_CROSSFADE_SEC}s overlap: "${item.title}" → "${nextItem.title}"`);

              if (queueGainRef.current) {
                fadeGain(queueGainRef.current, 0, QUEUE_CROSSFADE_SEC, 'crossfade: A fade-out');
              }
              outgoingPlayerRef.current = { audio: a, source: queueSourceRef.current!, gain: queueGainRef.current! };

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
              nextGain.gain.value = 0;
              nextSource.connect(nextGain);
              nextGain.connect(destB);
              if (monitorGainRef.current) nextGain.connect(monitorGainRef.current);

              queueSourceRef.current = nextSource;
              queueGainRef.current   = nextGain;
              currentlyPlayingRef.current = nextAudio;
              setPlayingQueueId(nextItem.id);
              setIsPaused(false);

              nextAudio.play()
                .then(() => {
                  fadeGain(nextGain, queueVolume, QUEUE_CROSSFADE_SEC, 'crossfade: B fade-in');
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

              nextAudio.onended = () => {
                if (playbackRafRef.current) { cancelAnimationFrame(playbackRafRef.current); playbackRafRef.current = null; }
                if (crossfadeTimerRef.current) { clearInterval(crossfadeTimerRef.current); crossfadeTimerRef.current = null; }
                if (inCrossfadeRef.current) return;
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

              setTimeout(() => {
                if (outgoingPlayerRef.current) {
                  try { outgoingPlayerRef.current.audio.pause(); } catch {/* ignore */}
                  try { outgoingPlayerRef.current.gain.disconnect(); } catch {/* ignore */}
                  try { outgoingPlayerRef.current.source.disconnect(); } catch {/* ignore */}
                  outgoingPlayerRef.current = null;
                }
                inCrossfadeRef.current = false;

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
                      inCrossfadeRef.current = true;
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
  }, [getQueueItemAudioSrc, queueVolume, fadeGain, applyBgGain, audioCtxRef, mixerDestRef, monitorGainRef, micGainRef, ensureRecordingStarted]);

  // ── pauseQueueItem ──
  const pauseQueueItem = useCallback(() => {
    if (!currentlyPlayingRef.current || !playingQueueId) return;
    if (playbackRafRef.current) { cancelAnimationFrame(playbackRafRef.current); playbackRafRef.current = null; }
    currentlyPlayingRef.current.pause();
    pausedQueueAudioRef.current = currentlyPlayingRef.current;
    const pausedItem = mediaQueueRef.current.find(q => q.id === playingQueueId) ?? null;
    pausedQueueItemRef.current  = pausedItem;
    currentlyPlayingRef.current = null;
    setPlayingQueueId(null);
    setIsPaused(true);
  }, [playingQueueId]);

  // ── stopQueuePlayback ──
  const stopQueuePlayback = useCallback(() => {
    if (playbackRafRef.current) { cancelAnimationFrame(playbackRafRef.current); playbackRafRef.current = null; }
    if (crossfadeTimerRef.current) { clearInterval(crossfadeTimerRef.current); crossfadeTimerRef.current = null; }
    inCrossfadeRef.current = false;
    if (outgoingPlayerRef.current) {
      try { outgoingPlayerRef.current.audio.pause(); } catch {/* ignore */}
      try { outgoingPlayerRef.current.gain.disconnect(); } catch {/* ignore */}
      try { outgoingPlayerRef.current.source.disconnect(); } catch {/* ignore */}
      outgoingPlayerRef.current = null;
    }
    try { queueGainRef.current?.disconnect(); } catch {/* ignore */}
    try { queueSourceRef.current?.disconnect(); } catch {/* ignore */}
    queueGainRef.current   = null;
    queueSourceRef.current = null;
    if (currentlyPlayingRef.current) {
      currentlyPlayingRef.current.pause();
      currentlyPlayingRef.current.currentTime = 0;
      currentlyPlayingRef.current = null;
    }
    if (bgGainRef.current) {
      const isMicLive = micGainRef.current !== null && micGainRef.current.gain.value > 0;
      const targetVol = isMicLive ? bgVolumeRef.current * BG_DUCK_RATIO : bgVolumeRef.current;
      fadeGain(bgGainRef.current, targetVol, 2, 'queue-stop bg-restore');
    } else {
      applyBgGain('queue-stop');
    }
    pausedQueueAudioRef.current = null;
    pausedQueueItemRef.current  = null;
    setPlayingQueueId(null);
    setPlaybackProgress(null);
    setIsPaused(false);
  }, [applyBgGain, fadeGain, micGainRef]);

  // ── Mic-priority queue management ──
  useEffect(() => {
    if (isMicOpen) {
      if (currentlyPlayingRef.current) {
        if (queueGainRef.current) { queueGainRef.current.gain.value = 0; }
        currentlyPlayingRef.current.pause();
        const currentId = playingQueueId;
        const pausedItem = currentId ? mediaQueueRef.current.find(q => q.id === currentId) ?? null : null;
        pausedForMicRef.current = pausedItem;
        applyBgGain('mic-open-queue-paused');
        setPlayingQueueId(null);
      } else {
        pausedForMicRef.current = null;
      }
    } else {
      const promoted = mediaQueueRef.current.map(q =>
        q.status === "READY_AFTER_MIC_CLOSE" ? { ...q, status: "READY" as QueueStatus } : q
      );
      setMediaQueue(promoted);

      const paused = pausedForMicRef.current;
      pausedForMicRef.current = null;

      if (paused) {
        setTimeout(() => playQueueItem(paused), 80);
      } else if (!currentlyPlayingRef.current) {
        applyBgGain('mic-closed-no-queue');
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

  return {
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
  };
}
