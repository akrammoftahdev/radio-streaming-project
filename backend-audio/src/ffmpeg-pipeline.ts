import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';

/**
 * ffmpeg-pipeline.ts
 * --------------------------------------------------------
 * Reusable FFmpeg MP3 encoding pipeline utility.
 *
 * Accepts a local output file path, spawns an FFmpeg process
 * reading WebM/Opus from stdin and writing 64 kbps MP3 to disk.
 *
 * Future use: replace the file output with a TCP/HTTP push
 * to a SHOUTcast / SonicPanel source connection.
 * --------------------------------------------------------
 */

export interface FfmpegPipeline {
  /** Write a raw binary chunk from the WebSocket into FFmpeg stdin */
  writeChunk(buffer: Buffer): void;
  /** Close stdin and wait for FFmpeg to finish encoding */
  stop(): void;
}

export function startFfmpegMp3Pipeline(outputPath: string): FfmpegPipeline {
  const ffmpegArgs = [
    '-f', 'webm',        // input container hint from MediaRecorder
    '-i', 'pipe:0',      // read raw audio stream from stdin
    '-vn',               // drop any video streams
    '-codec:a', 'libmp3lame',
    '-b:a', '64k',
    '-y',                // overwrite output without prompting
    outputPath,
  ];

  let process: ChildProcess;
  try {
    process = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
    console.log(`[FFmpeg] Pipeline started. PID: ${process.pid}`);
    console.log(`[FFmpeg] Output: ${outputPath}`);
  } catch (err) {
    throw new Error(`[FFmpeg] Failed to start pipeline: ${(err as Error).message}`);
  }

  // Log FFmpeg stderr line by line (progress + errors)
  process.stderr?.on('data', (data: Buffer) => {
    const line = data.toString().trim();
    if (line) console.log(`[FFmpeg] ${line}`);
  });

  process.on('error', (err) => {
    console.error(`[FFmpeg] Process error: ${err.message}`);
  });

  process.on('close', (code) => {
    if (code === 0 || code === null) {
      const size = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0;
      console.log(`[FFmpeg] Encoding complete.`);
      console.log(`[FFmpeg] Output: ${outputPath}`);
      console.log(`[FFmpeg] Size: ${size} bytes (${(size / 1024).toFixed(1)} KB)`);
    } else {
      console.error(`[FFmpeg] Exited with code ${code}`);
    }
  });

  return {
    writeChunk(buffer: Buffer): void {
      if (process.stdin && !process.stdin.destroyed) {
        process.stdin.write(buffer);
      }
    },

    stop(): void {
      if (process.stdin && !process.stdin.destroyed) {
        console.log(`[FFmpeg] Closing stdin — flushing encoder...`);
        process.stdin.end();
      }
    },
  };
}
