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
  bufferSize: 8192,  // 8192 is stable for iOS hardware audio queue (185ms chunks)
  wavFile: 'temp.wav' // Required by Options
};

export class AudioStream {
  private static isInitialized = false;
  private static listeners: ((data: string) => void)[] = [];

  static init(options: Partial<AudioStreamOptions> = {}) {
    if (this.isInitialized) return;
    const finalOptions = { ...defaultOptions, ...options };
    LiveAudioStream.init(finalOptions);
    this.isInitialized = true;
    
    // LiveAudioStream outputs Base64 encoded string chunks
    LiveAudioStream.on('data', (data: string) => {
      // Send raw base64 string directly to avoid React Native binary bridge bottlenecks
      this.listeners.forEach(listener => listener(data));
    });
  }

  static start() {
    if (!this.isInitialized) this.init();
    LiveAudioStream.start();
  }

  static stop() {
    LiveAudioStream.stop();
  }

  static onData(listener: (data: string) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  static removeAllListeners() {
    this.listeners = [];
  }
}
