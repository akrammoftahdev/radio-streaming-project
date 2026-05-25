"use client";

/**
 * RecordingPlayer — shared component used by:
 *   - studio/pre-flight-screen.tsx   (compact mode, list of latest recordings)
 *   - studio/wait-screen.tsx          (compact mode, list of latest recordings)
 *   - studio/recordings/page.tsx      (full mode, presenter archive)
 *   - admin/recordings/page.tsx       (full mode, admin archive)
 *
 * URL contract
 * ────────────
 * ALL playback and download URLs are built from `localPath` only:
 *   /stream/api/recordings/<encodeURIComponent(localPath)>
 *   /stream/api/recordings/<encodeURIComponent(localPath)>?download=1
 *
 * The recording id is NEVER used in a URL — it only serves as a React key
 * and as the unique identifier for per-player state.
 */

import React, { useRef, useState, useEffect, useCallback } from "react";

// ── helpers ──────────────────────────────────────────────────────────────────

const BASE = "";

export function recordingPlayUrl(localPath: string): string {
  return `${BASE}/api/recordings/${encodeURIComponent(localPath)}`;
}

export function recordingDownloadUrl(localPath: string): string {
  return `${BASE}/api/recordings/${encodeURIComponent(localPath)}?download=1`;
}

export function recordingMimeType(localPath: string): string {
  return localPath.endsWith(".mp3") ? "audio/mpeg" : "audio/webm";
}

export function formatArabicSessionDate(d: Date | string): string {
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: "Africa/Cairo",
    day:      "numeric",
    month:    "long",
    year:     "numeric",
    hour:     "numeric",
    minute:   "2-digit",
  }).format(new Date(d));
}

export function formatArabicDate(d: Date | string): string {
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: "Africa/Cairo",
    weekday:  "long",
    year:     "numeric",
    month:    "long",
    day:      "numeric",
  }).format(new Date(d));
}

export function formatArabicTime(d: Date | string): string {
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: "Africa/Cairo",
    hour:     "numeric",
    minute:   "2-digit",
  }).format(new Date(d));
}

export function formatDurationArabic(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} ث`;
  if (s === 0) return `${m} د`;
  return `${m} د ${s} ث`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميغابايت`;
}

function fmtTime(s: number): string {
  if (!isFinite(s) || isNaN(s)) return "--:--";
  const m   = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// ── types ─────────────────────────────────────────────────────────────────────

export interface RecordingRecord {
  id:              string;
  localPath:       string;
  startedAt:       Date | string;
  endedAt?:        Date | string | null;
  durationSeconds: number | null;
  bytesReceived?:  number | null;
  format?:         string;
  presenterName?:  string;
}

// ── compact mini-player (for lists / sidebars) ────────────────────────────────
// Uses a shared audio ref passed from the parent so only one track plays at once.

interface CompactPlayerProps {
  rec:          RecordingRecord;
  audioRef:     React.MutableRefObject<HTMLAudioElement | null>;
  playingId:    string | null;
  setPlayingId: (id: string | null) => void;
  showPresenter?: boolean;
}

export function RecordingCompactPlayer({
  rec,
  audioRef,
  playingId,
  setPlayingId,
  showPresenter = false,
}: CompactPlayerProps) {
  // mounted guard: SSR and first client render must be identical.
  // formatArabicSessionDate uses Intl (ar-EG) which can differ between
  // Node.js and browser ICU, causing hydration mismatches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [progress, setProgress] = useState<{ current: number; duration: number }>({
    current: 0,
    duration: rec.durationSeconds ?? 0,
  });

  // Before mount: treat everything as inactive/idle so SSR matches first client render.
  const isActive  = mounted && playingId === rec.id;
  const el        = mounted ? audioRef.current : null;
  const isPlaying = isActive && !!el && !el.paused;
  const { current, duration } = progress;
  const pct      = mounted && duration > 0 ? (current / duration) * 100 : 0;
  const playUrl  = recordingPlayUrl(rec.localPath);
  const dlUrl    = recordingDownloadUrl(rec.localPath);
  // Render date only after mount to avoid Intl locale mismatch between Node and browser
  const dateLabel = mounted ? formatArabicSessionDate(rec.startedAt) : "";
  const dur = rec.durationSeconds != null ? formatDurationArabic(rec.durationSeconds) : null;

  const handleToggle = useCallback(() => {
    const el = audioRef.current;

    // Same recording is already loaded (playing or paused) — toggle play/pause
    if (playingId === rec.id && el) {
      if (el.paused) {
        // Resume from currentTime — do NOT create new Audio
        el.play().catch(console.error);
        // Force a re-render so isPlaying updates (el.paused becomes false)
        setProgress(prev => ({ ...prev }));
      } else {
        // Pause — keep playingId set so we know this recording is still loaded
        el.pause();
        // Force re-render so UI shows play icon
        setProgress(prev => ({ ...prev }));
      }
      return;
    }

    // Different recording — stop whatever is currently playing
    if (el) { el.pause(); el.src = ""; }

    const audio = new Audio(playUrl);
    audioRef.current = audio;

    const update = () =>
      setProgress({ current: audio.currentTime, duration: audio.duration || duration });
    audio.addEventListener("timeupdate",     update);
    audio.addEventListener("loadedmetadata", update);
    audio.addEventListener("ended", () => {
      // Clear playingId only when track finishes naturally
      setPlayingId(null);
      setProgress(prev => ({ ...prev, current: 0 }));
    });

    audio.play()
      .then(() => setPlayingId(rec.id))
      .catch(console.error);
  }, [audioRef, playingId, playUrl, rec.id, setPlayingId, duration]);

  const handleSeek = useCallback((value: number) => {
    if (!audioRef.current || playingId !== rec.id) return;
    audioRef.current.currentTime = value;
    setProgress(prev => ({ ...prev, current: value }));
  }, [audioRef, playingId, rec.id]);

  // canSeek: only enable the seek bar after mount when this recording is active
  const canSeek = isActive;

  return (
    <div className="px-3 py-2.5 hover:bg-neutral-800/20 transition-colors">
      {/* Row: play btn + title + download */}
      <div className="flex items-center gap-2 mb-1.5">
        <button
          onClick={handleToggle}
          className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all ${
            isPlaying
              ? "bg-indigo-500 text-white shadow-[0_0_10px_rgba(99,102,241,0.5)]"
              : "bg-neutral-800 hover:bg-indigo-600/30 text-neutral-400 hover:text-indigo-300"
          }`}
          title={isPlaying ? "إيقاف مؤقت" : "تشغيل"}
        >
          {isPlaying ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21"/>
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <span className="block text-xs font-medium text-neutral-300 truncate">
            {showPresenter && rec.presenterName ? `${rec.presenterName} — ` : ""}جلسة{dateLabel ? ` — ${dateLabel}` : ""}
          </span>
          <span className="text-[10px] text-neutral-600">{dur ?? ""}</span>
        </div>

        <a
          href={dlUrl}
          download
          className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center bg-neutral-800 hover:bg-neutral-700 text-neutral-500 hover:text-neutral-300 transition-colors"
          title="تحميل"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </a>
      </div>

      {/* Seek bar */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-neutral-600 w-8 text-left tabular-nums flex-shrink-0">
          {isActive || current > 0 ? fmtTime(current) : "0:00"}
        </span>
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.5}
          value={current}
          onChange={e => handleSeek(Number(e.target.value))}
          disabled={!canSeek}
          className="flex-1 h-1 accent-indigo-500 cursor-pointer disabled:opacity-30"
          style={{
            background: `linear-gradient(to left, #3f3f46 ${100 - pct}%, #6366f1 ${100 - pct}%)`,
          }}
        />
        <span className="text-[10px] text-neutral-600 w-8 text-right tabular-nums flex-shrink-0">
          {fmtTime(duration)}
        </span>
      </div>
    </div>
  );
}


// ── full-page card player (for archive pages) ─────────────────────────────────

interface FullPlayerProps {
  rec:           RecordingRecord;
  showPresenter?: boolean;
}

export function RecordingFullCard({ rec, showPresenter = false }: FullPlayerProps) {
  const playUrl    = recordingPlayUrl(rec.localPath);
  const dlUrl      = recordingDownloadUrl(rec.localPath);
  const mimeType   = recordingMimeType(rec.localPath);
  const dateStr    = formatArabicDate(rec.startedAt);
  const timeStr    = formatArabicTime(rec.startedAt);
  const endStr     = rec.endedAt ? formatArabicTime(rec.endedAt) : null;
  const dur        = rec.durationSeconds != null ? formatDurationArabic(rec.durationSeconds) : null;
  const size       = rec.bytesReceived   != null ? formatBytes(rec.bytesReceived) : null;

  return (
    <article className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-lg hover:border-neutral-700 transition-colors group">
      <div className="h-0.5 w-full bg-gradient-to-l from-indigo-600/0 via-indigo-500/50 to-indigo-600/0 group-hover:via-indigo-400/70 transition-colors" />

      <div className="p-5">
        {/* Date + meta */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            {showPresenter && rec.presenterName && (
              <p className="text-xs text-indigo-400 font-medium mb-0.5">{rec.presenterName}</p>
            )}
            <p className="text-sm font-semibold text-neutral-200 mb-0.5">{dateStr}</p>
            <div className="flex items-center gap-2 text-xs text-neutral-500 flex-wrap">
              <span>{timeStr}</span>
              {endStr && (<><span className="text-neutral-700">—</span><span>{endStr}</span></>)}
              {dur  && (<><span className="text-neutral-700">•</span><span className="text-cyan-400 font-medium">{dur}</span></>)}
              {size && (<><span className="text-neutral-700">•</span><span>{size}</span></>)}
            </div>
          </div>

          {/* filename badge */}
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-neutral-800 border border-neutral-700 rounded-lg text-xs text-neutral-400 font-mono max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-neutral-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
              <polyline points="13 2 13 9 20 9"/>
            </svg>
            {rec.localPath}
          </span>
        </div>

        {/* Audio element */}
        <div className="mb-4">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls preload="none" className="w-full h-10 rounded-lg" style={{ colorScheme: "dark" }}>
            <source src={playUrl} type={mimeType} />
            متصفحك لا يدعم تشغيل الصوت.
          </audio>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={dlUrl}
            download={rec.localPath}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors shadow-md shadow-indigo-500/20"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            تحميل
          </a>
          <a
            href={playUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-medium border border-neutral-700 rounded-lg transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            فتح في نافذة جديدة
          </a>
        </div>
      </div>
    </article>
  );
}

// ── convenience list wrapper ──────────────────────────────────────────────────
// Renders a compact list with shared audio state (one-at-a-time playback).

interface CompactListProps {
  recordings:    RecordingRecord[];
  showPresenter?: boolean;
  emptyMessage?: string;
}

export function RecordingCompactList({
  recordings,
  showPresenter = false,
  emptyMessage  = "لا توجد تسجيلات بعد",
}: CompactListProps) {
  const audioRef               = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  // Stop audio on unmount
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  if (recordings.length === 0) {
    return <p className="text-xs text-neutral-600 text-center py-5 px-4">{emptyMessage}</p>;
  }

  return (
    <div className="divide-y divide-neutral-800/60">
      {recordings.map(rec => (
        <RecordingCompactPlayer
          key={rec.id}
          rec={rec}
          audioRef={audioRef}
          playingId={playingId}
          setPlayingId={setPlayingId}
          showPresenter={showPresenter}
        />
      ))}
    </div>
  );
}
