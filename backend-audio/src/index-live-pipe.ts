import WebSocket, { WebSocketServer } from 'ws';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { startFfmpegMp3Pipeline, FfmpegPipeline } from './ffmpeg-pipeline';

/**
 * Live Pipe Test Server
 * --------------------------------------------------------
 * WebSocket server on port 4002 that pipes incoming binary
 * audio chunks (WebM/Opus from MediaRecorder) directly into
 * the reusable FfmpegMp3Pipeline, converting to a local
 * 64 kbps MP3 file in real-time.
 *
 * This is a safe local test — does NOT connect to SHOUTcast.
 * The main debug recording server (index.ts / port 4001) is
 * unchanged.
 * --------------------------------------------------------
 */

const PORT = 4002;

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Backend Audio — Live Pipe Test Mode\n');
});

const wss = new WebSocketServer({ server, path: '/audio' });

wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[+] Client connected from ${clientIp}`);

  const debugDir = path.join(__dirname, '..', 'debug-recordings');
  if (!fs.existsSync(debugDir)) {
    fs.mkdirSync(debugDir, { recursive: true });
  }

  const outputFile = path.join(debugDir, 'live-pipe-test-64kbps.mp3');

  let pipeline: FfmpegPipeline;
  try {
    pipeline = startFfmpegMp3Pipeline(outputFile);
  } catch (err) {
    console.error((err as Error).message);
    ws.close();
    return;
  }

  let chunkCount = 0;

  ws.on('message', (message: WebSocket.RawData, isBinary: boolean) => {
    chunkCount++;
    if (isBinary) {
      const buffer = message as Buffer;
      console.log(`[Data] Piping binary chunk #${chunkCount} — ${buffer.length} bytes → FFmpeg stdin`);
      pipeline.writeChunk(buffer);
    } else {
      console.log(`[Data] Text message received (ignored): ${message.toString()}`);
    }
  });

  ws.on('close', () => {
    console.log(`\n[-] Client disconnected. Total chunks piped: ${chunkCount}`);
    pipeline.stop();
  });

  ws.on('error', (error) => {
    console.error(`[!] WebSocket error: ${error.message}`);
    pipeline.stop();
  });
});

server.listen(PORT, () => {
  console.log(`=====================================================`);
  console.log(`Backend Audio — Live Pipe Test Mode`);
  console.log(`Listening on ws://localhost:${PORT}/audio`);
  console.log(`Output: debug-recordings/live-pipe-test-64kbps.mp3`);
  console.log(`=====================================================`);
});
