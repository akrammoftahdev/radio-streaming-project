"use client";

import { useRef, useEffect, useCallback } from "react";
import NoSleep from "nosleep.js";

/**
 * useAudioMixer — Foundation hook that owns the AudioContext, mixer destination,
 * keepalive node, monitor gain, and pre-created mic gain.
 *
 * Every other audio hook depends on the refs this hook provides.
 */
export interface AudioMixerRefs {
  audioCtxRef:    React.MutableRefObject<AudioContext | null>;
  mixerDestRef:   React.MutableRefObject<MediaStreamAudioDestinationNode | null>;
  keepaliveRef:   React.MutableRefObject<ConstantSourceNode | null>;
  monitorGainRef: React.MutableRefObject<GainNode | null>;
  micGainRef:     React.MutableRefObject<GainNode | null>;
  noSleepRef:     React.MutableRefObject<any>;
}

export function useAudioMixer(isConnected: boolean): AudioMixerRefs {
  const audioCtxRef    = useRef<AudioContext | null>(null);
  const mixerDestRef   = useRef<MediaStreamAudioDestinationNode | null>(null);
  const keepaliveRef   = useRef<ConstantSourceNode | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);
  const micGainRef     = useRef<GainNode | null>(null);
  const noSleepRef     = useRef<any>(null);
  const wakeLockRef    = useRef<any>(null);

  // ── NoSleep initialization ──
  useEffect(() => {
    if (!noSleepRef.current) {
      noSleepRef.current = new NoSleep();
    }
  }, []);

  // ── Wake Lock Management ──
  useEffect(() => {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && isConnected) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
          console.log('[WakeLock] Screen wake lock acquired');
          wakeLockRef.current.addEventListener('release', () => {
            console.log('[WakeLock] Screen wake lock released');
          });
        } catch (err: any) {
          console.warn('[WakeLock] Failed to acquire screen wake lock:', err.message);
        }
      }
    };
    if (isConnected) {
      requestWakeLock();
    } else {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    }
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [isConnected]);

  return { audioCtxRef, mixerDestRef, keepaliveRef, monitorGainRef, micGainRef, noSleepRef };
}
