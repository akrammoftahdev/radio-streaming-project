import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * shoutcast-file-test.ts
 * --------------------------------------------------------
 * Safe one-shot file-stream test for SonicPanel / SHOUTcast.
 *
 * Reads an existing local 64 kbps MP3 file, authenticates
 * to the confirmed v2 SOURCE endpoint, then streams the file
 * bytes at real-time rate (64 kbps = ~8000 bytes/second).
 *
 * ⚠️  THIS WILL BRIEFLY PUT AUDIO ON THE LIVE RADIO SERVER.
 * A 5-second countdown is shown before streaming begins.
 * Press Ctrl+C to abort.
 *
 * Does NOT use a microphone.
 * Does NOT run continuously.
 * Does NOT start FFmpeg live encoding.
 * Streams only the pre-converted debug MP3 file.
 * --------------------------------------------------------
 */

// ── Config ─────────────────────────────────────────────────────────────────

const BITRATE_KBPS   = parseInt(process.env.SHOUTCAST_BITRATE   ?? '64', 10);
const BYTES_PER_SEC  = (BITRATE_KBPS * 1000) / 8;   // ~8000 bytes/s at 64 kbps
const CHUNK_MS       = 100;                           // send every 100ms
const CHUNK_BYTES    = Math.floor(BYTES_PER_SEC * (CHUNK_MS / 1000)); // ~800 bytes

const host       = process.env.SHOUTCAST_HOST;
const portStr    = process.env.SHOUTCAST_PORT;
const password   = process.env.SHOUTCAST_PASSWORD;
const djUser     = process.env.SHOUTCAST_DJ_USERNAME ?? 'source';
const sid        = process.env.SHOUTCAST_SID         ?? '1';
const sourcePath = process.env.SHOUTCAST_SOURCE_PATH ?? '/';

// ── Validate env ────────────────────────────────────────────────────────────

const missing: string[] = [];
if (!host)     missing.push('SHOUTCAST_HOST');
if (!portStr)  missing.push('SHOUTCAST_PORT');
if (!password) missing.push('SHOUTCAST_PASSWORD');

if (missing.length > 0) {
  console.error('[Error] Missing required environment variables:');
  missing.forEach(v => console.error(`  - ${v}`));
  process.exit(1);
}

const port            = parseInt(portStr!, 10);
const hiddenPassword  = '*'.repeat(password!.length);

// ── Validate input file ─────────────────────────────────────────────────────

const debugDir = path.join(__dirname, '..', 'debug-recordings');
const mp3File  = path.join(debugDir, 'latest-converted-64kbps.mp3');

if (!fs.existsSync(mp3File)) {
  console.error(`[Error] File not found: ${mp3File}`);
  console.error('        Run: npm run convert:test  to generate it first.');
  process.exit(1);
}

const fileBytes  = fs.readFileSync(mp3File);
const fileSizeKB = (fileBytes.length / 1024).toFixed(1);

// ── Warning countdown ───────────────────────────────────────────────────────

console.log('');
console.log('╔══════════════════════════════════════════════════════╗');
console.log('║  ⚠️   SHOUTcast File Stream Test — LIVE SERVER       ║');
console.log('╠══════════════════════════════════════════════════════╣');
console.log(`║  Host:        ${host!.padEnd(38)}║`);
console.log(`║  Port:        ${String(port).padEnd(38)}║`);
console.log(`║  Source Path: ${sourcePath.padEnd(38)}║`);
console.log(`║  DJ User:     ${djUser.padEnd(38)}║`);
console.log(`║  Password:    ${hiddenPassword.padEnd(38)}║`);
console.log(`║  File:        latest-converted-64kbps.mp3             ║`);
console.log(`║  File size:   ${(fileSizeKB + ' KB').padEnd(38)}║`);
console.log(`║  Bitrate:     ${(BITRATE_KBPS + ' kbps').padEnd(38)}║`);
console.log('╠══════════════════════════════════════════════════════╣');
console.log('║  This will briefly put audio on the live server.     ║');
console.log('║  Press Ctrl+C NOW to abort.                          ║');
console.log('╚══════════════════════════════════════════════════════╝');
console.log('');

// 5-second countdown
const COUNTDOWN_SEC = 5;
let remaining = COUNTDOWN_SEC;

const countdownInterval = setInterval(() => {
  process.stdout.write(`\r  Starting in ${remaining}s... (Ctrl+C to abort) `);
  remaining--;
  if (remaining < 0) {
    clearInterval(countdownInterval);
    process.stdout.write('\r                                               \r');
    startStream();
  }
}, 1000);

// ── Streaming ───────────────────────────────────────────────────────────────

function startStream(): void {
  console.log('[1] Connecting via TCP...');

  const socket = new net.Socket();
  let handshakeDone = false;
  let headerBuffer  = '';
  let bytesSent     = 0;
  let chunkInterval: ReturnType<typeof setInterval> | null = null;
  let offset        = 0;

  socket.on('error', (err) => {
    console.error(`\n[Error] TCP error: ${err.message}`);
    process.exit(1);
  });

  socket.on('connect', () => {
    console.log(`[2] TCP connected to ${host}:${port}`);
    console.log('[3] Sending v2 SOURCE handshake...');

    const credentials = Buffer.from(`${djUser}:${password}`).toString('base64');
    const handshake = [
      `SOURCE ${sourcePath} HTTP/1.0`,
      `Host: ${host}`,
      `Authorization: Basic ${credentials}`,
      `User-Agent: EGONAIR-Remote-Studio/1.0`,
      `content-type: audio/mpeg`,
      `icy-name: EGONAIR Remote Studio Test`,
      `icy-genre: Talk`,
      `icy-br: ${BITRATE_KBPS}`,
      `icy-pub: 0`,
      `\r\n`,
    ].join('\r\n');

    socket.write(handshake);
  });

  // Read server response (handshake reply)
  socket.on('data', (data: Buffer) => {
    if (handshakeDone) return; // ignore further server data during stream

    headerBuffer += data.toString('utf8');
    const safeHeader = headerBuffer.replace(
      new RegExp(password!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
      hiddenPassword
    );

    // Detect end of HTTP header block
    if (!headerBuffer.includes('\r\n\r\n') && !headerBuffer.includes('\n\n')) return;

    const firstLine = headerBuffer.split('\n')[0].trim();
    console.log(`[4] Server response: "${firstLine}"`);

    if (!firstLine.toUpperCase().includes('200')) {
      console.error(`[Error] Handshake not accepted (expected 200 OK). Aborting.`);
      console.error(`        Full response: ${safeHeader.trim()}`);
      socket.destroy();
      process.exit(1);
    }

    handshakeDone = true;
    console.log('[5] Handshake accepted. Starting file stream...');
    console.log(`    File: ${mp3File}`);
    console.log(`    Size: ${fileSizeKB} KB  |  Rate: ${BITRATE_KBPS} kbps  |  Chunk: ${CHUNK_BYTES} bytes / ${CHUNK_MS}ms`);
    console.log('');

    // Stream the MP3 file in real-time sized chunks
    chunkInterval = setInterval(() => {
      if (offset >= fileBytes.length) {
        clearInterval(chunkInterval!);
        socket.end();
        console.log('');
        console.log('[6] File fully streamed.');
        console.log(`    Total bytes sent: ${bytesSent}`);
        console.log('[7] Socket closed. Stream test complete.');
        return;
      }

      const chunk = fileBytes.slice(offset, offset + CHUNK_BYTES);
      socket.write(chunk);
      bytesSent += chunk.length;
      offset    += CHUNK_BYTES;

      // Progress indicator every ~1 second (10 chunks × 100ms)
      const chunkNum = Math.floor(offset / CHUNK_BYTES);
      if (chunkNum % 10 === 0) {
        const pct = Math.min(100, Math.floor((offset / fileBytes.length) * 100));
        process.stdout.write(`\r    Streaming... ${bytesSent} bytes sent (${pct}%)  `);
      }
    }, CHUNK_MS);
  });

  socket.on('close', () => {
    if (chunkInterval) clearInterval(chunkInterval);
  });

  socket.connect(port, host!);
}
