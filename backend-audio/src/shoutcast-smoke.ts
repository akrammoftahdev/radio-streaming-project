import * as net from 'net';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * shoutcast-smoke.ts
 * --------------------------------------------------------
 * Safe SHOUTcast / SonicPanel TCP connectivity smoke test.
 * Supports two handshake modes via SHOUTCAST_MODE env var:
 *
 *   v1: SHOUTcast v1 — sends password\r\n, expects OK2
 *   v2: SHOUTcast v2 / SonicPanel HTTP-style SOURCE request
 *       ⚠️  EXPERIMENTAL — behaviour varies by server version
 *
 * Does NOT send audio.
 * Does NOT start FFmpeg.
 * Does NOT maintain a live stream.
 *
 * TODO (full streaming phase): After smoke test confirms
 * auth succeeds, replace socket.destroy() with the live
 * FFmpeg MP3 pipe connected to this TCP socket.
 * --------------------------------------------------------
 */

const TIMEOUT_MS = 5000;

// ── Load & validate env ────────────────────────────────────────────────────

const host       = process.env.SHOUTCAST_HOST;
const portStr    = process.env.SHOUTCAST_PORT;
const password   = process.env.SHOUTCAST_PASSWORD;
const sid        = process.env.SHOUTCAST_SID          ?? '1';
const bitrate    = process.env.SHOUTCAST_BITRATE      ?? '64';
const mode       = (process.env.SHOUTCAST_MODE        ?? 'v1').toLowerCase();
const djUser     = process.env.SHOUTCAST_DJ_USERNAME  ?? 'source';
const sourcePath = process.env.SHOUTCAST_SOURCE_PATH  ?? '/';   // configurable mount path for v2

const missing: string[] = [];
if (!host)     missing.push('SHOUTCAST_HOST');
if (!portStr)  missing.push('SHOUTCAST_PORT');
if (!password) missing.push('SHOUTCAST_PASSWORD');

if (missing.length > 0) {
  console.error('[Error] Missing required environment variables:');
  missing.forEach(v => console.error(`  - ${v}`));
  console.error('\nSet them in backend-audio/.env and retry.');
  process.exit(1);
}

if (mode !== 'v1' && mode !== 'v2') {
  console.error(`[Error] SHOUTCAST_MODE must be "v1" or "v2" (got: "${mode}")`);
  process.exit(1);
}

const port = parseInt(portStr!, 10);
if (isNaN(port) || port < 1 || port > 65535) {
  console.error(`[Error] SHOUTCAST_PORT "${portStr}" is not a valid port number.`);
  process.exit(1);
}

const hiddenPassword = '*'.repeat(password!.length);

// Redact the real password from any server echo
function redact(str: string): string {
  return str.replace(
    new RegExp(password!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
    hiddenPassword
  );
}

// ── Build handshake payload ────────────────────────────────────────────────

function buildV1Handshake(): string {
  // SHOUTcast v1 source protocol: send password, await "OK2"
  return `${password}\r\n`;
}

function buildV2Handshake(): string {
  // ⚠️  EXPERIMENTAL: SHOUTcast v2 / SonicPanel HTTP-style source handshake.
  // Authorization header uses Basic base64("<djUser>:<password>").
  // djUser defaults to "source" for standard SHOUTcast v2;
  // SonicPanel DJ accounts use the actual DJ username set in the admin panel.
  const credentials = Buffer.from(`${djUser}:${password}`).toString('base64');

  return [
    `SOURCE ${sourcePath} HTTP/1.0`,
    `Host: ${host}`,
    `Authorization: Basic ${credentials}`,
    `User-Agent: EGONAIR-Remote-Studio/1.0`,
    `content-type: audio/mpeg`,
    `icy-name: EGONAIR Remote Studio Test`,
    `icy-genre: Talk`,
    `icy-br: ${bitrate}`,
    `icy-pub: 0`,
    `\r\n`,
  ].join('\r\n');
}

// ── Smoke test ─────────────────────────────────────────────────────────────

const modeLabel = mode === 'v2'
  ? 'v2 — SHOUTcast v2 / SonicPanel HTTP-style SOURCE (⚠️ Experimental)'
  : 'v1 — SHOUTcast v1 password handshake';

console.log('');
console.log('SHOUTcast / SonicPanel — TCP Smoke Test');
console.log('========================================');
console.log(`  Host:        ${host}`);
console.log(`  Port:        ${port}`);
console.log(`  SID:         ${sid}`);
console.log(`  Bitrate:     ${bitrate} kbps`);
console.log(`  Password:    ${hiddenPassword}`);
if (mode === 'v2') {
  console.log(`  DJ User:     ${djUser}`);
  console.log(`  Source Path: ${sourcePath}`);
}
console.log(`  Mode:        ${modeLabel}`);
console.log(`  Timeout:     ${TIMEOUT_MS / 1000}s`);
console.log('========================================');
console.log('');
console.log('[1] Connecting via TCP...');

const socket = new net.Socket();
let settled  = false;

const finish = (label: string, exitCode: number) => {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  socket.destroy();
  console.log('');
  console.log('========================================');
  console.log(`  Result: ${label}`);
  console.log('========================================');
  console.log('');
  process.exit(exitCode);
};

const timer = setTimeout(() => {
  finish('TIMEOUT — no response within 5 seconds', 2);
}, TIMEOUT_MS);

socket.on('error', (err) => {
  console.error(`[Error] TCP error: ${err.message}`);
  finish(`FAILED — ${err.message}`, 1);
});

socket.on('connect', () => {
  console.log(`[2] TCP connected to ${host}:${port}`);

  if (mode === 'v1') {
    console.log('[3] Sending SHOUTcast v1 password handshake...');
    socket.write(buildV1Handshake());
  } else {
    console.log('[3] Sending SHOUTcast v2 HTTP-style SOURCE handshake (⚠️ Experimental)...');
    // Log headers without Authorization value for safety — show DJ username and path, never password
    console.log(`    SOURCE ${sourcePath} HTTP/1.0`);
    console.log(`    Host: ${host}`);
    console.log(`    Authorization: Basic base64(${djUser}:${'*'.repeat(hiddenPassword.length)})`);
    console.log(`    User-Agent: EGONAIR-Remote-Studio/1.0`);
    console.log(`    content-type: audio/mpeg`);
    console.log(`    icy-name: EGONAIR Remote Studio Test`);
    console.log(`    icy-br: ${bitrate}`);
    socket.write(buildV2Handshake());
  }
});

socket.on('data', (data: Buffer) => {
  const raw  = redact(data.toString('utf8').trim());
  console.log(`[4] Server response: "${raw}"`);

  const upper = raw.toUpperCase();

  // ── v1 response patterns ──────────────────────────────────────────────
  if (upper.includes('OK2') || (mode === 'v1' && upper.includes('OK'))) {
    finish('CONNECTED — v1 handshake accepted', 0);
  }
  // ── v2 / HTTP response patterns ───────────────────────────────────────
  else if (upper.includes('HTTP/1') && upper.includes('200')) {
    finish('CONNECTED — v2 HTTP 200 handshake accepted', 0);
  }
  else if (upper.includes('HTTP/1') && upper.includes('401')) {
    finish('AUTH FAILED — v2 HTTP 401 Unauthorized (wrong password or SID)', 1);
  }
  else if (upper.includes('HTTP/1') && upper.includes('403')) {
    finish('AUTH FAILED — v2 HTTP 403 Forbidden', 1);
  }
  else if (upper.includes('INVALID') || upper.includes('WRONG') || upper.includes('BAD') || upper.includes('DENIED')) {
    finish(`AUTH FAILED — server rejected credentials: "${raw}"`, 1);
  }
  else {
    finish(`UNKNOWN RESPONSE — "${raw}" (server may require different handshake)`, 1);
  }
});

socket.connect(port, host!);
