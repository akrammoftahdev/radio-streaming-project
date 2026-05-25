import WebSocket, { WebSocketServer } from 'ws';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import * as net from 'net';
import { spawn, ChildProcess } from 'child_process';
import * as dotenv from 'dotenv';
import { uploadRecordingToGCS } from './gcs-uploader';

dotenv.config();

// ── Feature flag — default OFF ───────────────────────────────────────────────
// Set ENABLE_SHOUTCAST_LIVE=true in .env (or shell) to activate the live
// FFmpeg → SHOUTcast pipeline.  When false, only the local WebM recording
// path runs (identical to the pre-integration behaviour).
const ENABLE_SHOUTCAST_LIVE = process.env.ENABLE_SHOUTCAST_LIVE === 'true';

// ── Listen address ────────────────────────────────────────────────────────────
// HOST defaults to 0.0.0.0 so the WebSocket is accessible on public
// interfaces.
const WS_HOST = process.env.HOST ?? '0.0.0.0';
const WS_PORT = parseInt(process.env.PORT ?? '4001', 10);

const FRONTEND_URL     = process.env.FRONTEND_URL || 'http://localhost:3000';
const NEXT_VALIDATE    = `${FRONTEND_URL}/api/internal/audio-token/validate`;
const VALIDATE_TIMEOUT = 5000; // ms — abort token validation if Next.js is slow
const SHOUT_HANDSHAKE_TIMEOUT_MS = 10_000;

// ── Stale session watchdog ────────────────────────────────────────────────────
// If no binary audio chunk is received within STALE_TIMEOUT_MS while the
// WebSocket is still open, the session is considered stale and is closed
// cleanly with reason="stale_timeout".  The timer is reset on every binary
// chunk so it only fires when audio truly stops.
const STALE_TIMEOUT_MS = 15_000; // 15 seconds

// ── Next.js internal lifecycle notification endpoints ────────────────────────
// backend-audio POSTs to these after key session events so the Next.js server
// can update the LiveSession row in the database.
// All calls are fire-and-forget — they must never block or crash the audio
// pipeline if Next.js is slow or temporarily unreachable.
const NEXT_SESSION_BASE    = `${FRONTEND_URL}/api/internal/audio-session`;
const NOTIFY_TIMEOUT_MS    = 4000; // ms — abort notification if Next.js is slow

// ── Dev / smoke-test fallback credentials (NOT used for authenticated sessions)
// These values are read only if sonicPanel is null in the validate response,
// which only happens when a presenter has no SonicPanelCredential row in the DB.
// In a fully-configured production system they will never be used for streaming.
//
// They are still used by the standalone smoke-test scripts (shoutcast-smoke.ts, etc.)
// and are kept here for developer convenience.
const DEV_SHOUT_HOST    = process.env.SHOUTCAST_HOST        ?? '';
const DEV_SHOUT_PORT    = parseInt(process.env.SHOUTCAST_PORT ?? '8000', 10);
const DEV_SHOUT_PASS    = process.env.SHOUTCAST_PASSWORD     ?? '';
const DEV_SHOUT_USER    = process.env.SHOUTCAST_DJ_USERNAME  ?? 'source';
const DEV_SHOUT_SOURCE  = process.env.SHOUTCAST_SOURCE_PATH  ?? '/';
const DEV_SHOUT_BITRATE = parseInt(process.env.SHOUTCAST_BITRATE ?? '64', 10);

// ── FFmpeg binary path ────────────────────────────────────────────────────────
// Defaults to 'ffmpeg' (system PATH). Override with FFMPEG_PATH env var for
// environments where ffmpeg is installed at a non-standard location.
// On the VPS: FFMPEG_PATH=/home/egyona/bin/ffmpeg
const FFMPEG_BIN = process.env.FFMPEG_PATH ?? 'ffmpeg';

// ── SonicPanel credential shape — matches what Next.js validate returns ───────
//
// Returned by POST /api/internal/audio-token/validate when the presenter has an
// active SonicPanelCredential row in the database.  Passwords are decrypted
// server-side by Next.js and delivered over localhost only; they must NEVER be
// logged in full.
interface SonicPanelCredentials {
  host:           string;
  port:           number;
  djUsername:     string;
  djPassword:     string;   // ← plaintext — NEVER log this field
  streamPassword: string | null;
  mount:          string | null;
  sid:            string | null;
  bitrate:        number;
}

// ── Token validation result ───────────────────────────────────────────────────
interface TokenValidationResult {
  ok:               boolean;
  presenterId?:     string;
  scheduleId?:      string | null;
  stationId?:       string | null;
  sessionMode?:     string | null;  // 'SCHEDULED' | 'DIRECT_DJ'
  directDjRadioId?: string | null;
  expiresAt?:       string;
  sonicPanel?:      SonicPanelCredentials | null;
  error?:           string;
}

// ── Startup banner ────────────────────────────────────────────────────────────

function printBanner() {
  console.log(`=========================================`);
  console.log(`EGONAIR Backend Audio Service`);
  console.log(`Listening on ws://${WS_HOST}:${WS_PORT}/audio`);
  console.log(`Token validation: ${NEXT_VALIDATE}`);
  if (ENABLE_SHOUTCAST_LIVE) {
    console.log(`SHOUTcast live: ENABLED`);
    console.log(`  Credential source: per-presenter DB record (via validate endpoint)`);
    console.log(`  Dev fallback host: ${DEV_SHOUT_HOST || '(none set)'}`);
    console.log(`  IMPORTANT: Presenter streams use sonicPanel credentials from the DB.`);
    console.log(`             .env values are only used when sonicPanel is null (no DB row).`);
  } else {
    console.log(`SHOUTcast live: DISABLED (set ENABLE_SHOUTCAST_LIVE=true to enable)`);
    console.log(`  Local WebM recording is active.`);
  }
  console.log(`=========================================`);
}

// ── Session lifecycle notification helpers ───────────────────────────────────
//
// All three functions are fire-and-forget: they POST to the Next.js internal
// API endpoints and log a warning if the call fails, but they NEVER throw or
// await in the hot audio path.
//
// SECURITY:
//   - DJ passwords and SHOUTcast credentials are NEVER included in any payload.
//   - Only presenterId, scheduleId, timing, byte counts, and file paths are sent.
//   - Error messages are pre-sanitized by the caller before being passed here.
//
// TODO (production hardening): Add a shared INTERNAL_SECRET header so the
//   Next.js endpoints can verify the call comes from backend-audio, not an
//   external source that guessed the localhost port.

interface SessionStartedPayload {
  presenterId:            string;
  scheduleId?:            string | null;
  startedAt?:             string;       // ISO 8601
  localPath?:             string;
}

interface SessionEndedPayload {
  presenterId:            string;
  scheduleId?:            string | null;
  endedAt?:               string;       // ISO 8601
  reason?:                string;       // "disconnect" | "stale_timeout"
  localPath?:             string;
  bytesReceived?:         number;
  bytesSentToShoutcast?:  number;
  // Station context from token validate — used by frontend to populate Recording.stationId/sourceType
  stationId?:             string | null;
  sessionMode?:           string | null;  // 'SCHEDULED' | 'DIRECT_DJ'
  directDjRadioId?:       string | null;
}

interface SessionErrorPayload {
  presenterId:    string;
  scheduleId?:    string | null;
  occurredAt?:    string;               // ISO 8601
  errorMessage?:  string;               // safe, no credentials
}

function notifySessionStarted(payload: SessionStartedPayload): void {
  const url = `${NEXT_SESSION_BASE}/started`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOTIFY_TIMEOUT_MS);
  fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
    signal:  controller.signal,
  })
    .then(() => clearTimeout(timer))
    .catch((err) => {
      clearTimeout(timer);
      console.warn(`[Notify] session-started call failed (non-fatal): ${(err as Error).message}`);
    });
}

function notifySessionEnded(payload: SessionEndedPayload): void {
  const url = `${NEXT_SESSION_BASE}/ended`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOTIFY_TIMEOUT_MS);
  fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
    signal:  controller.signal,
  })
    .then(() => clearTimeout(timer))
    .catch((err) => {
      clearTimeout(timer);
      console.warn(`[Notify] session-ended call failed (non-fatal): ${(err as Error).message}`);
    });
}

function notifySessionError(payload: SessionErrorPayload): void {
  const url = `${NEXT_SESSION_BASE}/error`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOTIFY_TIMEOUT_MS);
  fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
    signal:  controller.signal,
  })
    .then(() => clearTimeout(timer))
    .catch((err) => {
      clearTimeout(timer);
      console.warn(`[Notify] session-error call failed (non-fatal): ${(err as Error).message}`);
    });
}

// ── HTTP server ───────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('EGONAIR Backend Audio Service\n');
});

// ── Token validation helper ───────────────────────────────────────────────────

async function validateToken(token: string): Promise<TokenValidationResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT);

  try {
    const res = await fetch(NEXT_VALIDATE, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token }),
      signal:  controller.signal,
    });
    clearTimeout(timer);
    return (await res.json()) as TokenValidationResult;
  } catch (err) {
    clearTimeout(timer);
    const msg = (err as Error).message ?? 'unknown';
    return { ok: false, error: `Validation request failed: ${msg}` };
  }
}

// ── SHOUTcast v2 SOURCE handshake builder ─────────────────────────────────────
//
// Accepts the resolved credential values for this specific session.
// Never logs the password — the caller decides what to show in logs.
//
// ⚠️  The exact format (SOURCE … HTTP/1.0, \r\n line endings) is required by
//    SHOUTcast v2.  Do NOT change line endings, HTTP version, or header order.
//    See ISSUES_AND_FIXES.md FIX-003 for the full explanation.

function buildV2Handshake(opts: {
  djUsername:  string;
  djPassword:  string;
  host:        string;
  sourcePath:  string;
  bitrate:     number;
}): string {
  const credentials = Buffer.from(`${opts.djUsername}:${opts.djPassword}`).toString('base64');
  return [
    `SOURCE ${opts.sourcePath} HTTP/1.0`,
    `Host: ${opts.host}`,
    `Authorization: Basic ${credentials}`,
    `User-Agent: EGONAIR-Remote-Studio/1.0`,
    `content-type: audio/mpeg`,
    `icy-name: EGONAIR Remote Studio`,
    `icy-genre: Talk`,
    `icy-br: ${opts.bitrate}`,
    `icy-pub: 0`,
    `\r\n`,
  ].join('\r\n');
}

// ── Active session registry — one slot per presenterId ────────────────────────
// Prevents duplicate concurrent connections from multiple browser tabs.
const activeSessions = new Map<string, WebSocket>();

const wss = new WebSocketServer({ server, path: '/audio' });

wss.on('connection', async (ws: WebSocket, req: http.IncomingMessage) => {
  const clientIp = req.socket.remoteAddress ?? 'unknown';

  // ── Step 1: Extract token from query string ──────────────────────────────
  const reqUrl = new URL(req.url ?? '/', `http://localhost:${WS_PORT}`);
  const token  = reqUrl.searchParams.get('token') ?? '';
  const audioFormat = reqUrl.searchParams.get('format') ?? 'webm';

  if (!token) {
    console.warn(`[Auth] Connection from ${clientIp} rejected — no token provided`);
    ws.close(1008, 'Missing authentication token');
    return;
  }

  // ── Step 2: Validate token with Next.js (also fetches sonicPanel creds) ──
  console.log(`[Auth] Validating token for client ${clientIp}...`);
  const validation = await validateToken(token);

  if (!validation.ok || !validation.presenterId) {
    console.warn(`[Auth] Token rejected for ${clientIp} — ${validation.error ?? 'invalid token'}`);
    ws.close(1008, 'Invalid or expired authentication token');
    return;
  }

  const { presenterId, scheduleId } = validation;
  // Capture station context from token validate — used in notifySessionEnded to populate Recording
  const validatedStationId      = validation.stationId      ?? null;
  const validatedSessionMode    = validation.sessionMode    ?? null;  // 'SCHEDULED' | 'DIRECT_DJ'
  const validatedDirectDjRadioId = validation.directDjRadioId ?? null;

  // ── Step 3: Reject duplicate concurrent connections ──────────────────────
  if (activeSessions.has(presenterId)) {
    console.warn(`[Auth] Presenter ${presenterId} already has an active session — rejecting duplicate connection from ${clientIp}`);
    ws.close(1008, 'Duplicate session — another connection is already active for this presenter');
    
    // Notify the currently active session about the intrusion attempt
    const activeWs = activeSessions.get(presenterId);
    if (activeWs && activeWs.readyState === WebSocket.OPEN) {
      activeWs.send(JSON.stringify({ type: 'duplicate_attempt', ip: clientIp }));
    }
    return;
  }

  // ── Step 4: Resolve SonicPanel credentials for this session ─────────────
  //
  // CREDENTIAL RESOLUTION PRIORITY:
  //   1. validation.sonicPanel  — per-presenter credentials from the DB (preferred in production)
  //   2. DEV_SHOUT_* env vars   — fallback for dev mode / smoke tests / no DB row
  //
  // When ENABLE_SHOUTCAST_LIVE=true:
  //   • If validation.sonicPanel exists:  use it (production path)
  //   • If validation.sonicPanel is null: use DEV_SHOUT_* as fallback
  //     BUT if the dev fallback host is also empty, reject the connection
  //     because we have no usable credentials.
  //
  // When ENABLE_SHOUTCAST_LIVE=false:
  //   • Credentials are never consulted — the live pipeline does not run.

  let resolvedCreds: {
    host:       string;
    port:       number;
    djUsername: string;
    djPassword: string;
    sourcePath: string;
    bitrate:    number;
    source:     'db' | 'env_fallback';
  } | null = null;

  if (ENABLE_SHOUTCAST_LIVE) {
    const sp = validation.sonicPanel;

    if (sp) {
      // ✅ Production path — credentials from the DB via Next.js validate
      resolvedCreds = {
        host:       sp.host,
        port:       sp.port,
        djUsername: sp.djUsername,
        djPassword: sp.djPassword,                // ← NEVER log this
        sourcePath: sp.mount ?? '/',
        bitrate:    sp.bitrate,
        source:     'db',
      };
      console.log(`[Auth] SonicPanel credentials loaded from DB for ${presenterId}: ${sp.djUsername}@${sp.host}:${sp.port} bitrate=${sp.bitrate}kbps`);
    } else {
      // ⚠️  sonicPanel is null — no DB row for this presenter.
      // Fall back to dev env vars if configured.
      if (DEV_SHOUT_HOST && DEV_SHOUT_PASS) {
        resolvedCreds = {
          host:       DEV_SHOUT_HOST,
          port:       DEV_SHOUT_PORT,
          djUsername: DEV_SHOUT_USER,
          djPassword: DEV_SHOUT_PASS,             // ← NEVER log this
          sourcePath: DEV_SHOUT_SOURCE,
          bitrate:    DEV_SHOUT_BITRATE,
          source:     'env_fallback',
        };
        console.warn(`[Auth] sonicPanel is null for presenter ${presenterId} — using DEV env fallback credentials (${DEV_SHOUT_USER}@${DEV_SHOUT_HOST}:${DEV_SHOUT_PORT})`);
      } else {
        // No usable credentials — reject the connection cleanly
        console.error(
          `[Auth] LIVE MODE: sonicPanel is null for presenter ${presenterId} and no DEV fallback credentials are set.` +
          ` Rejecting WebSocket connection. Ensure the presenter has a SonicPanelCredential row in the DB.`
        );
        ws.close(1011, 'Streaming credentials not configured for this presenter');
        return;
      }
    }
  }

  activeSessions.set(presenterId, ws);
  console.log(`[+] Presenter ${presenterId} connected from ${clientIp}`);
  if (scheduleId) console.log(`    Schedule: ${scheduleId}`);

  // ── Status helper: send JSON status to browser (never blocks, never throws) ─
  function sendStatus(payload: Record<string, unknown>): void {
    if (ws.readyState === 1 /* OPEN */) {
      try { ws.send(JSON.stringify(payload)); } catch { /* non-fatal */ }
    }
  }

  // Immediately tell the browser the WS is open and recording will start
  sendStatus({ type: 'ws_connected', presenterId: presenterId.slice(0, 8) });
  if (!ENABLE_SHOUTCAST_LIVE) {
    sendStatus({ type: 'recording_only', message: 'SHOUTcast disabled — recording locally only' });
    console.log('[Session] ENABLE_SHOUTCAST_LIVE=false — recording-only mode. Radio not active.');
  }

  // ── Step 5: Set up WebM recording ────────────────────────────────────────
  // RECORDINGS_BASE_DIR: production path (e.g. /tmp/recordings on GCE or Cloud Run).
  // Falls back to debug-recordings/ next to the src dir for local dev.
  const recordingsDir = process.env.RECORDINGS_BASE_DIR
    ? path.resolve(process.env.RECORDINGS_BASE_DIR)
    : path.join(__dirname, '..', 'debug-recordings');
  if (!fs.existsSync(recordingsDir)) {
    fs.mkdirSync(recordingsDir, { recursive: true });
  }

  const startedAt = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const timestamp = `${startedAt.getFullYear()}${pad(startedAt.getMonth() + 1)}${pad(startedAt.getDate())}-${pad(startedAt.getHours())}${pad(startedAt.getMinutes())}${pad(startedAt.getSeconds())}`;

  const extension     = audioFormat === 'pcm' ? 'pcm' : 'webm';
  const filename      = `session-${timestamp}-${presenterId.slice(0, 8)}.${extension}`;
  const debugFilePath = path.join(recordingsDir, filename);
  const writeStream   = fs.createWriteStream(debugFilePath);

  let chunkCount   = 0;
  let totalBytesIn = 0;
  let sessionStartNotified = false; // guard: fire notifySessionStarted only once

  // ── Stale session watchdog ────────────────────────────────────────────────
  // staleTimer fires STALE_TIMEOUT_MS after the last binary chunk.
  // staleClose is set to true when the watchdog triggers the close so that
  // ws.on('close') can send reason="stale_timeout" instead of "disconnect".
  let staleTimer: NodeJS.Timeout | null = null;
  let staleClose = false;

  function startStaleTimer() {
    if (staleTimer) clearTimeout(staleTimer);
    staleTimer = setTimeout(() => {
      staleClose = true;
      console.warn(
        `[Watchdog] No audio received for ${STALE_TIMEOUT_MS / 1000}s ` +
        `— closing stale session for presenter ${presenterId.slice(0, 8)}`
      );
      if (ENABLE_SHOUTCAST_LIVE) {
        cleanupLivePipeline('stale_timeout');
      }
      // ws.close() triggers ws.on('close') which handles notifications and
      // recording finalization — do not duplicate that logic here.
      ws.close(1001, 'Stale session — no audio received');
    }, STALE_TIMEOUT_MS);
  }

  // ── Step 6: SHOUTcast live pipeline (only when ENABLE_SHOUTCAST_LIVE=true)
  let ffmpeg:        ChildProcess | null = null;
  let shoutSocket:   net.Socket   | null = null;
  let shoutBytesSent = 0;
  let pipelineReady  = false;
  let pendingChunks: Buffer[] = [];

  if (ENABLE_SHOUTCAST_LIVE && resolvedCreds) {
    // Capture resolved values into local consts — they are used inside closures
    // and must not change during the session.  The password is in scope but is
    // passed only to buildV2Handshake() and never to any log call.
    const sessionHost       = resolvedCreds.host;
    const sessionPort       = resolvedCreds.port;
    const sessionDjUsername = resolvedCreds.djUsername;
    const sessionDjPassword = resolvedCreds.djPassword; // ← NEVER log
    const sessionSourcePath = resolvedCreds.sourcePath;
    const sessionBitrate    = resolvedCreds.bitrate;
    const credSource        = resolvedCreds.source;

    shoutSocket = new net.Socket();

    const handshakeTimer = setTimeout(() => {
      console.warn(`[SHOUTcast] Handshake timeout after ${SHOUT_HANDSHAKE_TIMEOUT_MS}ms — aborting live pipeline`);
      cleanupLivePipeline('Handshake timeout');
    }, SHOUT_HANDSHAKE_TIMEOUT_MS);

    shoutSocket.on('error', (err) => {
      console.error(`[SHOUTcast] Socket error: ${err.message}`);
      sendStatus({ type: 'shoutcast_error', error: err.message });
      notifySessionError({
        presenterId,
        scheduleId: scheduleId ?? null,
        occurredAt: new Date().toISOString(),
        errorMessage: `SHOUTcast socket error: ${err.message}`,
      });
      cleanupLivePipeline(`SHOUTcast socket error: ${err.message}`);
    });

    shoutSocket.on('connect', () => {
      console.log(`[SHOUTcast] TCP connected to ${sessionHost}:${sessionPort} (creds from ${credSource})`);
      console.log(`[SHOUTcast] Sending v2 SOURCE handshake for ${sessionDjUsername}@${sessionHost}:${sessionPort}`);
      sendStatus({ type: 'shoutcast_connecting', host: sessionHost, port: sessionPort });
      shoutSocket!.write(buildV2Handshake({
        djUsername:  sessionDjUsername,
        djPassword:  sessionDjPassword,   // ← passed in but never logged
        host:        sessionHost,
        sourcePath:  sessionSourcePath,
        bitrate:     sessionBitrate,
      }));
    });

    let headerBuffer  = '';
    let handshakeDone = false;

    shoutSocket.on('data', (data: Buffer) => {
      if (handshakeDone) return;

      headerBuffer += data.toString('utf8');
      // Wait until we have enough of the response to determine status
      if (
        !headerBuffer.includes('\r\n\r\n') &&
        !headerBuffer.includes('\n\n') &&
        !headerBuffer.includes('200')
      ) return;

      clearTimeout(handshakeTimer);
      const firstLine = headerBuffer.split('\n')[0].trim();
      console.log(`[SHOUTcast] Server response: "${firstLine}"`);

      if (!firstLine.toUpperCase().includes('200')) {
        console.error(`[SHOUTcast] Handshake rejected — aborting live pipeline`);
        sendStatus({ type: 'shoutcast_error', error: 'SHOUTcast handshake rejected — check credentials' });
        notifySessionError({
          presenterId,
          scheduleId: scheduleId ?? null,
          occurredAt: new Date().toISOString(),
          errorMessage: 'SHOUTcast handshake rejected by server',
        });
        cleanupLivePipeline('SHOUTcast rejected handshake');
        return;
      }

      handshakeDone = true;
      console.log(`[SHOUTcast] Handshake accepted ✓ — starting FFmpeg encoder`);
      sendStatus({ type: 'shoutcast_ok', host: sessionHost, port: sessionPort });

      // notifySessionStarted is already called when first chunk arrives — no duplicate needed here.

      // ── Spawn FFmpeg: WebM/Opus stdin → MP3 stdout ─────────────────────
      // Bitrate is taken from the presenter's credential row (sessionBitrate),
      // ensuring it always matches what the SHOUTcast server expects (icy-br).
      const ffmpegArgs = audioFormat === 'pcm' 
        ? [
            '-f', 's16le',
            '-ar', '44100',
            '-ac', '1',
            '-i', 'pipe:0',
            '-vn',
            '-codec:a', 'libmp3lame',
            '-b:a', `${sessionBitrate}k`,
            '-f', 'mp3',
            'pipe:1',
          ]
        : [
            '-f', 'webm',
            '-i', 'pipe:0',
            '-vn',
            '-codec:a', 'libmp3lame',
            '-b:a', `${sessionBitrate}k`,
            '-f', 'mp3',
            'pipe:1',
          ];

      ffmpeg = spawn(FFMPEG_BIN, ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] });

      console.log(`[FFmpeg] Process started. PID: ${ffmpeg.pid}`);

      ffmpeg.stderr?.on('data', (d: Buffer) => {
        const line = d.toString().trim();
        if (line.includes('bitrate=') || line.includes('Error') || line.includes('error')) {
          console.log(`[FFmpeg] ${line.substring(0, 120)}`);
        }
      });

      // Pipe FFmpeg stdout → SHOUTcast socket
      ffmpeg.stdout?.on('data', (mp3Chunk: Buffer) => {
        if (shoutSocket && !shoutSocket.destroyed) {
          shoutSocket.write(mp3Chunk);
          shoutBytesSent += mp3Chunk.length;
          // Log a progress line roughly every 8 KB sent
          if (shoutBytesSent % 8000 < mp3Chunk.length) {
            console.log(`[SHOUTcast] → ${shoutBytesSent} bytes sent to server`);
          }
        }
      });

      ffmpeg.on('close', (code) => {
        console.log(`[FFmpeg] Process exited (code ${code})`);
      });

      ffmpeg.on('error', (err) => {
        console.error(`[FFmpeg] Spawn error: ${err.message}`);
        notifySessionError({
          presenterId,
          scheduleId: scheduleId ?? null,
          occurredAt: new Date().toISOString(),
          errorMessage: 'FFmpeg process failed to start',
        });
        cleanupLivePipeline('FFmpeg spawn error');
      });

      pipelineReady = true;

      // Flush any chunks that arrived before the pipeline was ready
      if (pendingChunks.length > 0) {
        console.log(`[FFmpeg] Flushing ${pendingChunks.length} buffered chunk(s) received before pipeline was ready`);
        pendingChunks.forEach(c => ffmpeg!.stdin?.write(c));
        pendingChunks = [];
      }
    });

    console.log(`[SHOUTcast] Connecting to ${sessionHost}:${sessionPort}...`);
    shoutSocket.connect(sessionPort, sessionHost);
  }

  // ── Step 7: Receive audio chunks ──────────────────────────────────────────
  ws.on('message', (message: WebSocket.RawData, isBinary: boolean) => {
    chunkCount++;
    if (!isBinary) {
      console.log(`[Data] Text frame (ignored): ${(message as Buffer).toString().slice(0, 80)}`);
      return;
    }

    const buffer = message as Buffer;
    totalBytesIn += buffer.length;

    // Always write to local WebM recording — independent of SHOUTcast
    writeStream.write(buffer);

    // On first chunk: notify Next.js that recording has started and send status to browser.
    // This is done here (not after SHOUTcast handshake) so recordings are always created.
    if (!sessionStartNotified) {
      sessionStartNotified = true;
      console.log(`[Recording] First chunk received — notifying session started (recording-independent)`);
      sendStatus({ type: 'recording_started', file: filename });
      notifySessionStarted({
        presenterId,
        scheduleId: scheduleId ?? null,
        startedAt:  startedAt.toISOString(),
        localPath:  debugFilePath,
      });
    }

    console.log(`[Data] ${presenterId.slice(0, 8)} — chunk #${chunkCount} (${buffer.length} bytes)`);

    // Reset stale watchdog on every binary chunk received
    startStaleTimer();

    // When live pipeline is enabled, feed FFmpeg (or buffer until ready)
    if (ENABLE_SHOUTCAST_LIVE) {
      if (pipelineReady && ffmpeg?.stdin && !ffmpeg.stdin.destroyed) {
        ffmpeg.stdin.write(buffer);
      } else if (!pipelineReady) {
        pendingChunks.push(buffer);
      }
      // If pipelineReady=false after handshake failure, chunks are silently
      // dropped for live but still saved to the local WebM recording.
    }
  });

  // ── Step 8: Cleanup on disconnect ─────────────────────────────────────────
  ws.on('close', () => {
    // Cancel watchdog — prevents it from firing after the socket is already gone
    if (staleTimer) {
      clearTimeout(staleTimer);
      staleTimer = null;
    }

    activeSessions.delete(presenterId);
    const endedAt = new Date();

    // Flush and close recording file, then convert to MP3 for archive playback.
    // disconnectReason must be declared before writeStream.end() so it is in
    // scope inside all async callbacks (conv.on('close'), conv.on('error')).
    const disconnectReason = staleClose ? 'stale_timeout' : 'disconnect';
    const logLabel         = staleClose ? '[Watchdog]'   : '[-]';

    writeStream.end(() => {
      // Fire-and-forget GCS upload — non-blocking, non-fatal
      uploadRecordingToGCS(debugFilePath, filename).then((gcsUrl) => {
        if (gcsUrl) {
          console.log(`[GCS] Recording available at: ${gcsUrl}`);
        }
      });

      // ── MP3 conversion: WebM/Opus/PCM → MP3 for browser-compatible archive ──
      const mp3Filename = filename.replace(/\.(webm|pcm)$/, '.mp3');
      const mp3FilePath = path.join(recordingsDir, mp3Filename);

      console.log(`[Convert] Starting Conversion: ${debugFilePath} → ${mp3FilePath}`);

      const convArgs = audioFormat === 'pcm'
        ? [
            '-y',
            '-f', 's16le',
            '-ar', '44100',
            '-ac', '1',
            '-i', debugFilePath,
            '-vn',
            '-codec:a', 'libmp3lame',
            '-b:a', '128k',
            mp3FilePath,
          ]
        : [
            '-y',
            '-i', debugFilePath,
            '-vn',
            '-codec:a', 'libmp3lame',
            '-b:a', '128k',
            mp3FilePath,
          ];

      const conv = spawn(FFMPEG_BIN, convArgs, { stdio: ['ignore', 'ignore', 'pipe'] });

      let convStderr = '';
      conv.stderr?.on('data', (d: Buffer) => { convStderr += d.toString(); });

      conv.on('error', (err) => {
        console.error(`[Convert] FFmpeg spawn error: ${err.message} — falling back to WebM`);
        // Fallback: notify with original .webm path
        notifySessionEnded({
          presenterId,
          scheduleId:           scheduleId           ?? null,
          endedAt:              endedAt.toISOString(),
          reason:               disconnectReason,
          localPath:            debugFilePath,
          bytesReceived:        totalBytesIn,
          bytesSentToShoutcast: ENABLE_SHOUTCAST_LIVE ? shoutBytesSent : 0,
          stationId:            validatedStationId,
          sessionMode:          validatedSessionMode,
          directDjRadioId:      validatedDirectDjRadioId,
        });
      });

      conv.on('close', (code) => {
        if (code === 0) {
          const mp3Size = fs.existsSync(mp3FilePath) ? fs.statSync(mp3FilePath).size : 0;
          console.log(`[Convert] ✓ MP3 ready: ${mp3FilePath} (${(mp3Size / 1024).toFixed(1)} KB)`);
          console.log(`[Convert] Raw WebM kept as backup: ${debugFilePath}`);
          // Success: notify with .mp3 filename so DB and archive serve the MP3
          notifySessionEnded({
            presenterId,
            scheduleId:           scheduleId           ?? null,
            endedAt:              endedAt.toISOString(),
            reason:               disconnectReason,
            localPath:            mp3FilePath,          // ← MP3 path
            bytesReceived:        totalBytesIn,
            bytesSentToShoutcast: ENABLE_SHOUTCAST_LIVE ? shoutBytesSent : 0,
            stationId:            validatedStationId,
            sessionMode:          validatedSessionMode,
            directDjRadioId:      validatedDirectDjRadioId,
          });
        } else {
          // Conversion failed — log stderr and fall back to .webm
          console.error(`[Convert] FFmpeg exited ${code} — falling back to WebM`);
          if (convStderr) console.error(`[Convert] FFmpeg stderr:\n${convStderr.slice(-600)}`);
          notifySessionEnded({
            presenterId,
            scheduleId:           scheduleId           ?? null,
            endedAt:              endedAt.toISOString(),
            reason:               disconnectReason,
            localPath:            debugFilePath,        // ← WebM fallback
            bytesReceived:        totalBytesIn,
            bytesSentToShoutcast: ENABLE_SHOUTCAST_LIVE ? shoutBytesSent : 0,
            stationId:            validatedStationId,
            sessionMode:          validatedSessionMode,
            directDjRadioId:      validatedDirectDjRadioId,
          });
        }
      });
    });

    // Only run live cleanup for a normal disconnect — the watchdog already
    // called cleanupLivePipeline() before invoking ws.close().
    if (ENABLE_SHOUTCAST_LIVE && !staleClose) {
      cleanupLivePipeline('WebSocket client disconnected');
    }

    console.log(`${logLabel} Presenter ${presenterId} session ended (reason: ${disconnectReason})`);
    console.log(`[Archive] Session Recording Summary:`);
    console.log(`  - File Path:   ${debugFilePath}`);
    console.log(`  - Bytes in:    ${totalBytesIn} (from browser)`);
    console.log(`  - Started At:  ${startedAt.toISOString()}`);
    console.log(`  - Ended At:    ${endedAt.toISOString()}`);
    console.log(`  - Reason:      ${disconnectReason}`);
    if (ENABLE_SHOUTCAST_LIVE) {
      console.log(`  - Bytes sent:  ${shoutBytesSent} (to SHOUTcast)`);
    }
    // NOTE: notifySessionEnded is now called inside the writeStream.end() → conv.on('close')
    // callback above to ensure the DB always receives the final (mp3 or webm) path.
  });

  ws.on('error', (error) => {
    console.error(`[!] WebSocket error for presenter ${presenterId}: ${error.message}`);
  });

  // ── Live pipeline cleanup helper ───────────────────────────────────────────
  // Safe to call multiple times; guarded by destroyed/null checks.
  function cleanupLivePipeline(reason: string) {
    console.log(`[Cleanup] ${reason}`);

    if (ffmpeg?.stdin && !ffmpeg.stdin.destroyed) {
      console.log(`[FFmpeg] Closing stdin — flushing encoder...`);
      ffmpeg.stdin.end();
    }

    // Give FFmpeg ~1.5 s to flush remaining MP3 frames before destroying socket
    setTimeout(() => {
      if (shoutSocket && !shoutSocket.destroyed) {
        shoutSocket.destroy();
        console.log(`[SHOUTcast] Socket closed`);
      }
    }, 1500);
  }
});

// ── Start server ───────────────────────────────────────────────────────────────

server.listen(WS_PORT, WS_HOST, () => {
  printBanner();
});
