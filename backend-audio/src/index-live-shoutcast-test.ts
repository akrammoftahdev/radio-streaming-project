import * as net from 'net';
import * as http from 'http';
import * as dotenv from 'dotenv';
import { spawn, ChildProcess } from 'child_process';
import WebSocket, { WebSocketServer } from 'ws';

dotenv.config();

/**
 * index-live-shoutcast-test.ts
 * --------------------------------------------------------
 * Controlled end-to-end live pipeline test:
 *
 *   Browser MediaRecorder (WebM/Opus)
 *     → WebSocket ws://localhost:4003/audio
 *       → FFmpeg stdin (decode + encode to MP3 64kbps)
 *         → FFmpeg stdout
 *           → SonicPanel/SHOUTcast TCP socket (v2 SOURCE)
 *
 * ⚠️  LIVE SERVER: Connects to the real SonicPanel endpoint.
 * ⚠️  Audio from the browser microphone will be on-air.
 *
 * This is a controlled test script — not production.
 * Does NOT auto-stream. Waits for a WebSocket client to connect.
 * Cleans up fully on client disconnect.
 * --------------------------------------------------------
 */

const WS_PORT      = 4003;
const TIMEOUT_MS   = 10000; // SHOUTcast handshake timeout

// ── Load & validate env ────────────────────────────────────────────────────

const host       = process.env.SHOUTCAST_HOST;
const portStr    = process.env.SHOUTCAST_PORT;
const password   = process.env.SHOUTCAST_PASSWORD;
const djUser     = process.env.SHOUTCAST_DJ_USERNAME ?? 'source';
const bitrate    = process.env.SHOUTCAST_BITRATE     ?? '64';
const sourcePath = process.env.SHOUTCAST_SOURCE_PATH ?? '/';

const missing: string[] = [];
if (!host)     missing.push('SHOUTCAST_HOST');
if (!portStr)  missing.push('SHOUTCAST_PORT');
if (!password) missing.push('SHOUTCAST_PASSWORD');

if (missing.length > 0) {
  console.error('[Error] Missing required environment variables:');
  missing.forEach(v => console.error(`  - ${v}`));
  process.exit(1);
}

const shoutPort      = parseInt(portStr!, 10);
const hiddenPassword = '*'.repeat(password!.length);

// ── Helpers ────────────────────────────────────────────────────────────────

function log(tag: string, msg: string) {
  console.log(`[${tag}] ${msg}`);
}

function buildV2Handshake(): string {
  const credentials = Buffer.from(`${djUser}:${password}`).toString('base64');
  return [
    `SOURCE ${sourcePath} HTTP/1.0`,
    `Host: ${host}`,
    `Authorization: Basic ${credentials}`,
    `User-Agent: EGONAIR-Remote-Studio/1.0`,
    `content-type: audio/mpeg`,
    `icy-name: EGONAIR Remote Studio`,
    `icy-genre: Talk`,
    `icy-br: ${bitrate}`,
    `icy-pub: 0`,
    `\r\n`,
  ].join('\r\n');
}

// ── Warning + countdown ─────────────────────────────────────────────────────

console.log('');
console.log('╔══════════════════════════════════════════════════════╗');
console.log('║  ⚠️   LIVE END-TO-END PIPELINE TEST                  ║');
console.log('║  Browser mic → FFmpeg → SonicPanel/SHOUTcast         ║');
console.log('╠══════════════════════════════════════════════════════╣');
console.log(`║  SHOUTcast Host:   ${host!.padEnd(33)}║`);
console.log(`║  SHOUTcast Port:   ${String(shoutPort).padEnd(33)}║`);
console.log(`║  Source Path:      ${sourcePath.padEnd(33)}║`);
console.log(`║  DJ User:          ${djUser.padEnd(33)}║`);
console.log(`║  Password:         ${hiddenPassword.padEnd(33)}║`);
console.log(`║  Bitrate:          ${(bitrate + ' kbps').padEnd(33)}║`);
console.log(`║  WS listen port:   ${String(WS_PORT).padEnd(33)}║`);
console.log('╠══════════════════════════════════════════════════════╣');
console.log('║  Audio from the browser mic will be LIVE on-air.    ║');
console.log('║  Press Ctrl+C NOW to abort.                          ║');
console.log('╚══════════════════════════════════════════════════════╝');
console.log('');

let remaining = 5;
const countdown = setInterval(() => {
  process.stdout.write(`\r  Starting in ${remaining}s... (Ctrl+C to abort) `);
  remaining--;
  if (remaining < 0) {
    clearInterval(countdown);
    process.stdout.write('\r                                               \r');
    startServer();
  }
}, 1000);

// ── Main server ─────────────────────────────────────────────────────────────

function startServer() {
  const httpServer = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('EGONAIR Live Shoutcast Test\n');
  });

  const wss = new WebSocketServer({ server: httpServer, path: '/audio' });
  log('WS', `WebSocket server listening on ws://localhost:${WS_PORT}/audio`);
  log('WS', 'Waiting for browser client to connect...');
  log('WS', 'Point StudioUI (temporarily) at ws://localhost:4003/audio and enable mic.');

  wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    const clientIp = req.socket.remoteAddress;
    log('WS', `Client connected from ${clientIp}`);
    log('WS', 'Starting FFmpeg + SHOUTcast pipeline...');

    let ffmpeg:       ChildProcess | null = null;
    let shoutSocket:  net.Socket   | null = null;
    let wsChunks      = 0;
    let wsBytesIn     = 0;
    let shoutBytesSent = 0;
    let handshakeDone = false;
    let headerBuffer  = '';
    let pipelineReady = false;
    let pendingWsChunks: Buffer[] = [];

    // ── Step 1: Connect to SHOUTcast ─────────────────────────────────────

    shoutSocket = new net.Socket();
    const handshakeTimer = setTimeout(() => {
      log('SHOUTcast', 'Handshake timeout — closing');
      cleanupAll('Handshake timeout');
    }, TIMEOUT_MS);

    shoutSocket.on('error', (err) => {
      log('SHOUTcast', `Socket error: ${err.message}`);
      cleanupAll(`SHOUTcast socket error: ${err.message}`);
    });

    shoutSocket.on('connect', () => {
      log('SHOUTcast', `TCP connected to ${host}:${shoutPort}`);
      log('SHOUTcast', 'Sending v2 SOURCE handshake...');
      log('SHOUTcast', `  SOURCE ${sourcePath} HTTP/1.0`);
      log('SHOUTcast', `  Authorization: Basic base64(${djUser}:${hiddenPassword})`);
      shoutSocket!.write(buildV2Handshake());
    });

    shoutSocket.on('data', (data: Buffer) => {
      if (handshakeDone) return;

      headerBuffer += data.toString('utf8');
      if (!headerBuffer.includes('\r\n\r\n') && !headerBuffer.includes('\n\n') && !headerBuffer.includes('200')) return;

      clearTimeout(handshakeTimer);
      const firstLine = headerBuffer.split('\n')[0].trim();
      log('SHOUTcast', `Server response: "${firstLine}"`);

      if (!firstLine.toUpperCase().includes('200')) {
        log('SHOUTcast', 'Handshake not accepted — aborting');
        cleanupAll('SHOUTcast rejected handshake');
        return;
      }

      handshakeDone = true;
      log('SHOUTcast', 'Handshake accepted ✓ — starting FFmpeg encoder');

      // ── Step 2: Start FFmpeg ──────────────────────────────────────────

      ffmpeg = spawn('ffmpeg', [
        '-f', 'webm',
        '-i', 'pipe:0',
        '-vn',
        '-codec:a', 'libmp3lame',
        '-b:a', `${bitrate}k`,
        '-f', 'mp3',
        'pipe:1',            // output MP3 to stdout
      ], { stdio: ['pipe', 'pipe', 'pipe'] });

      log('FFmpeg', `Process started. PID: ${ffmpeg.pid}`);

      // Pipe FFmpeg stderr for progress logging
      ffmpeg.stderr?.on('data', (d: Buffer) => {
        const line = d.toString().trim();
        if (line.includes('bitrate=') || line.includes('Error') || line.includes('error')) {
          log('FFmpeg', line.substring(0, 120));
        }
      });

      // ── Step 3: Pipe FFmpeg stdout → SHOUTcast socket ────────────────
      ffmpeg.stdout?.on('data', (mp3Chunk: Buffer) => {
        if (shoutSocket && !shoutSocket.destroyed) {
          shoutSocket.write(mp3Chunk);
          shoutBytesSent += mp3Chunk.length;
          if (shoutBytesSent % 8000 < mp3Chunk.length) {
            log('SHOUTcast', `→ ${shoutBytesSent} bytes sent to server`);
          }
        }
      });

      ffmpeg.on('close', (code) => {
        log('FFmpeg', `Process exited (code ${code})`);
      });

      ffmpeg.on('error', (err) => {
        log('FFmpeg', `Spawn error: ${err.message}`);
        cleanupAll('FFmpeg spawn error');
      });

      pipelineReady = true;

      // Flush any chunks that arrived before pipeline was ready
      if (pendingWsChunks.length > 0) {
        log('FFmpeg', `Flushing ${pendingWsChunks.length} buffered WebSocket chunks`);
        pendingWsChunks.forEach(c => ffmpeg!.stdin?.write(c));
        pendingWsChunks = [];
      }
    });

    // ── Handle incoming WebSocket binary chunks ───────────────────────────

    ws.on('message', (message: WebSocket.RawData, isBinary: boolean) => {
      if (!isBinary) return;
      const buffer = message as Buffer;
      wsChunks++;
      wsBytesIn += buffer.length;
      log('WS', `Chunk #${wsChunks} received — ${buffer.length} bytes (total in: ${wsBytesIn})`);

      if (pipelineReady && ffmpeg?.stdin && !ffmpeg.stdin.destroyed) {
        ffmpeg.stdin.write(buffer);
      } else {
        // Buffer until pipeline is ready (SHOUTcast handshake in flight)
        pendingWsChunks.push(buffer);
      }
    });

    ws.on('close', () => {
      log('WS', `Client disconnected. Chunks: ${wsChunks}, Bytes in: ${wsBytesIn}`);
      cleanupAll('WebSocket client disconnected');
    });

    ws.on('error', (err) => {
      log('WS', `Error: ${err.message}`);
      cleanupAll('WebSocket error');
    });

    // ── Cleanup ────────────────────────────────────────────────────────────

    function cleanupAll(reason: string) {
      log('Cleanup', reason);

      if (ffmpeg?.stdin && !ffmpeg.stdin.destroyed) {
        log('FFmpeg', 'Closing stdin — flushing encoder...');
        ffmpeg.stdin.end();
      }
      setTimeout(() => {
        if (shoutSocket && !shoutSocket.destroyed) {
          shoutSocket.destroy();
          log('SHOUTcast', 'Socket closed');
        }
        if (ws.readyState === WebSocket.OPEN) ws.close();

        log('Summary', '════════════════════════════════');
        log('Summary', `WebSocket chunks received: ${wsChunks}`);
        log('Summary', `Bytes received from browser: ${wsBytesIn}`);
        log('Summary', `Bytes sent to SHOUTcast:     ${shoutBytesSent}`);
        log('Summary', '════════════════════════════════');
        log('Summary', 'Pipeline closed cleanly. Ready for next connection.');
      }, 1500); // give FFmpeg time to flush
    }

    // ── Start SHOUTcast TCP connection ─────────────────────────────────────
    log('SHOUTcast', `Connecting to ${host}:${shoutPort}...`);
    shoutSocket.connect(shoutPort, host!);
  });

  httpServer.listen(WS_PORT);
}
