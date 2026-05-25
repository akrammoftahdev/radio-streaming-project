/**
 * recording-helpers.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure, server-safe helpers for recording URL construction and MIME detection.
 *
 * ⚠️  This file must NOT contain "use client".
 *     It is imported by server components (admin, station-manager, studio).
 *     The client component RecordingPlayer.tsx defines its own copies so it
 *     does not need to import from here, but it may do so safely.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const BASE = "";

/**
 * URL to stream/play a recording inline.
 * Always use encodeURIComponent on the localPath (filename only, no directory).
 */
export function recordingPlayUrl(localPath: string): string {
  return `${BASE}/api/recordings/${encodeURIComponent(localPath)}`;
}

/**
 * URL to download a recording (triggers browser save dialog).
 */
export function recordingDownloadUrl(localPath: string): string {
  return `${BASE}/api/recordings/${encodeURIComponent(localPath)}?download=1`;
}

/**
 * MIME type for the recording file.
 *   .mp3  → audio/mpeg
 *   .webm → audio/webm  (default)
 *   other → application/octet-stream
 */
export function recordingMimeType(localPath: string): string {
  if (localPath.endsWith(".mp3"))  return "audio/mpeg";
  if (localPath.endsWith(".webm")) return "audio/webm";
  return "application/octet-stream";
}
