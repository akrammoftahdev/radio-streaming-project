import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const debugDir = path.join(__dirname, '..', 'debug-recordings');

// Find the latest session-*.webm file by name (timestamps sort lexicographically)
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
  console.error('[ERROR] No session-*.webm files found in debug-recordings/');
  console.error('        Please record a session first using npm run dev and the StudioUI.');
  process.exit(1);
}

const outputFile = path.join(debugDir, 'latest-converted-64kbps.mp3');

console.log('FFmpeg Conversion Test');
console.log('======================');
console.log(`Input:  ${inputFile}`);
console.log(`Output: ${outputFile}`);
console.log('Bitrate: 64 kbps');
console.log('Converting...');

try {
  execSync(
    `ffmpeg -y -i "${inputFile}" -codec:a libmp3lame -b:a 64k "${outputFile}"`,
    { stdio: 'inherit' }
  );

  const outputStats = fs.statSync(outputFile);
  console.log('\n======================');
  console.log('[OK] Conversion successful');
  console.log(`Input file:   ${inputFile}`);
  console.log(`Output file:  ${outputFile}`);
  console.log(`Output size:  ${outputStats.size} bytes (${(outputStats.size / 1024).toFixed(1)} KB)`);
} catch (err) {
  console.error('[ERROR] FFmpeg conversion failed:', (err as Error).message);
  process.exit(1);
}
