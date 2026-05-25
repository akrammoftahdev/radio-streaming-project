import LiveAudioStream from 'react-native-live-audio-stream';
import { Buffer } from 'buffer';

export interface AudioStreamOptions {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  audioSource: number;
  bufferSize: number;
  wavFile: string;
}

const defaultOptions: AudioStreamOptions = {
  sampleRate: 44100, // Matches FFmpeg backend default
  channels: 1,       // Mono
  bitsPerSample: 16, // 16-bit
  audioSource: 1,    // MediaRecorder.AudioSource.MIC on Android
  bufferSize: 4096,  // Chunk size
  wavFile: 'temp.wav' // Required by Options
};

export class AudioStream {
  private static isInitialized = false;
  private static listeners: ((data: Buffer) => void)[] = [];

  static init(options: Partial<AudioStreamOptions> = {}) {
    if (this.isInitialized) return;
    const finalOptions = { ...defaultOptions, ...options };
    LiveAudioStream.init(finalOptions);
    this.isInitialized = true;
    
    // LiveAudioStream outputs Base64 encoded string chunks
    LiveAudioStream.on('data', (data: string) => {
      // Decode Base64 to binary Buffer
      const buffer = Buffer.from(data, 'base64');
      this.listeners.forEach(listener => listener(buffer));
    });
  }

  static start() {
    if (!this.isInitialized) this.init();
    LiveAudioStream.start();
  }

  static stop() {
    LiveAudioStream.stop();
  }

  static onData(listener: (data: Buffer) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  static removeAllListeners() {
    this.listeners = [];
  }
}
