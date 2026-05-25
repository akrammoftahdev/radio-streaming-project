import { execSync } from 'child_process';

function checkFfmpeg() {
  console.log('Checking for FFmpeg...');
  try {
    const output = execSync('ffmpeg -version', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    const versionMatch = output.match(/ffmpeg version (.*?) /);
    const version = versionMatch ? versionMatch[1] : 'unknown';
    console.log('\x1b[32m[OK]\x1b[0m FFmpeg found');
    console.log(`Version: ${version}`);
  } catch (error) {
    console.log('\x1b[31m[ERROR]\x1b[0m FFmpeg not found');
    console.log('Please install FFmpeg to enable audio processing features.');
    process.exit(1);
  }
}

checkFfmpeg();
