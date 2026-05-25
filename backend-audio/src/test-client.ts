/**
 * test-client.ts
 * --------------------------------------------------------
 * Standalone WebSocket test client for the live:pipe server.
 * Reads the latest session-*.webm from debug-recordings and
 * streams it in 16KB chunks to ws://localhost:4002/audio,
 * simulating what the browser MediaRecorder sends in real time.
 * --------------------------------------------------------
 */
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';

const CHUNK_SIZE = 16384; // 16 KB per send — similar to a 1-second MediaRecorder slice
const CHUNK_INTERVAL_MS = 100; // send chunks faster than real-time for quick test

const debugDir = path.join(__dirname, '..', 'debug-recordings');

// Find the latest session-*.webm file
function findLatestWebm(): string | null {
  if (!fs.existsSync(debugDir)) return null;
  const files = fs.readdirSync(debugDir)
    .filter(f => f.match(/^session-\d{8}-\d{6}\.webm$/))
    .sort();
  if (files.length === 0) return null;
  return path.join(debugDir, files[files.length - 1]);
}

const inputFile = findLatestWebm();
if (!inputFile) {
  console.error('[Client] No session-*.webm found in debug-recordings/');
  console.error('[Client] Run npm run dev with the StudioUI first to record a session.');
  process.exit(1);
}

const fileData = fs.readFileSync(inputFile);
const totalChunks = Math.ceil(fileData.length / CHUNK_SIZE);

console.log('[Client] ======================================');
console.log(`[Client] Input file: ${inputFile}`);
console.log(`[Client] File size:  ${fileData.length} bytes`);
console.log(`[Client] Chunk size: ${CHUNK_SIZE} bytes`);
console.log(`[Client] Chunks:     ${totalChunks}`);
console.log('[Client] Connecting to ws://localhost:4002/audio ...');
console.log('[Client] ======================================');

const ws = new WebSocket('ws://localhost:4002/audio');

ws.on('open', () => {
  console.log('[Client] Connected. Streaming chunks...');

  let offset = 0;
  let sent = 0;

  const interval = setInterval(() => {
    if (offset >= fileData.length) {
      clearInterval(interval);
      console.log(`[Client] All ${sent} chunks sent. Closing connection...`);
      ws.close();
      return;
    }

    const chunk = fileData.slice(offset, offset + CHUNK_SIZE);
    ws.send(chunk);
    offset += CHUNK_SIZE;
    sent++;
    console.log(`[Client] Sent chunk #${sent} / ${totalChunks} (${chunk.length} bytes)`);
  }, CHUNK_INTERVAL_MS);
});

ws.on('close', () => {
  console.log('[Client] WebSocket closed.');
  console.log('[Client] Check debug-recordings/live-pipe-test-64kbps.mp3 for output.');
});

ws.on('error', (err) => {
  console.error(`[Client] WebSocket error: ${err.message}`);
  console.error('[Client] Is npm run live:pipe running on port 4002?');
  process.exit(1);
});
