"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { Category } from "@/app/studio/studio-types";

/**
 * useSfxPads — SFX buffer preload, play/stop, volume management.
 */

export interface SfxPadsHook {
  sfxVolume:         number;
  setSfxVolume:      React.Dispatch<React.SetStateAction<number>>;
  sfxPreloadStatus:  'idle' | 'loading' | 'ready';
  playSfx:           (trackId: string) => void;
  stopSfx:           (trackId: string) => void;
  stopAllSfx:        () => void;
  // For stopBroadcastSession cleanup
  sfxCleanup:        () => void;
  // Refs exposed for stopBroadcastSession
  activeSfxRef:      React.MutableRefObject<Map<string, AudioBufferSourceNode>>;
  sfxGainRef:        React.MutableRefObject<GainNode | null>;
  sfxBuffersRef:     React.MutableRefObject<Map<string, AudioBuffer>>;
  setSfxPreloadStatus: React.Dispatch<React.SetStateAction<'idle' | 'loading' | 'ready'>>;
}

export function useSfxPads(
  audioCtxRef:    React.MutableRefObject<AudioContext | null>,
  mixerDestRef:   React.MutableRefObject<MediaStreamAudioDestinationNode | null>,
  monitorGainRef: React.MutableRefObject<GainNode | null>,
  sfxCategories:  Category[],
  isConnected:    boolean,
  ensureRecordingStarted: (reason: 'mic' | 'background' | 'queue') => void,
): SfxPadsHook {
  const sfxBuffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const activeSfxRef  = useRef<Map<string, AudioBufferSourceNode>>(new Map());
  const sfxGainRef    = useRef<GainNode | null>(null);
  const [sfxVolume, setSfxVolume]     = useState(0.8);
  const sfxVolumeRef = useRef(0.8);
  const [sfxPreloadStatus, setSfxPreloadStatus] = useState<'idle' | 'loading' | 'ready'>('idle');

  // Keep sfxVolumeRef in sync
  useEffect(() => { sfxVolumeRef.current = sfxVolume; }, [sfxVolume]);

  // Apply sfxVolume to gain node
  useEffect(() => {
    if (sfxGainRef.current) sfxGainRef.current.gain.value = sfxVolume;
  }, [sfxVolume]);

  // Preload SFX buffers
  const preloadSfxBuffers = useCallback(async () => {
    const ctx = audioCtxRef.current;
    if (!ctx || sfxCategories.length === 0) return;
    setSfxPreloadStatus('loading');
    console.log('[SFX] Preloading buffers...');

    const allTracks = sfxCategories.flatMap(c => c.tracks);

    await Promise.all(allTracks.map(async (track) => {
      if (sfxBuffersRef.current.has(track.id)) return;
      try {
        const url = `/api/tracks/${track.id}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arrayBuf = await res.arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(arrayBuf);
        sfxBuffersRef.current.set(track.id, audioBuf);
      } catch (err) {
        console.warn(`[SFX] Failed to preload: ${track.title}`, err);
      }
    }));

    setSfxPreloadStatus('ready');
    console.log(`[SFX] Preloaded ${sfxBuffersRef.current.size}/${allTracks.length} buffers`);
  }, [audioCtxRef, sfxCategories]);

  // Auto-preload when connected
  useEffect(() => {
    if (audioCtxRef.current && sfxCategories.length > 0 && sfxPreloadStatus === 'idle') {
      preloadSfxBuffers();
    }
  }, [isConnected, sfxCategories, sfxPreloadStatus, preloadSfxBuffers, audioCtxRef]);

  // Play an SFX pad
  const playSfx = useCallback((trackId: string) => {
    const ctx = audioCtxRef.current;
    const buffer = sfxBuffersRef.current.get(trackId);
    if (!ctx || !buffer) {
      console.warn(`[SFX] Cannot play — ${!ctx ? 'no AudioContext' : 'buffer not loaded'}`);
      return;
    }
    const existing = activeSfxRef.current.get(trackId);
    if (existing) { try { existing.stop(); } catch {/* already stopped */} }

    if (!sfxGainRef.current) {
      const g = ctx.createGain();
      g.gain.value = sfxVolumeRef.current;
      if (mixerDestRef.current) g.connect(mixerDestRef.current);
      if (monitorGainRef.current) g.connect(monitorGainRef.current);
      sfxGainRef.current = g;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(sfxGainRef.current);
    source.onended = () => { activeSfxRef.current.delete(trackId); };
    activeSfxRef.current.set(trackId, source);
    source.start(0);
    console.log(`[SFX] Playing: ${trackId}`);
    ensureRecordingStarted('queue');
  }, [audioCtxRef, mixerDestRef, monitorGainRef, ensureRecordingStarted]);

  // Stop individual SFX
  const stopSfx = useCallback((trackId: string) => {
    const source = activeSfxRef.current.get(trackId);
    if (source) {
      try { source.stop(); } catch {/* already stopped */}
      activeSfxRef.current.delete(trackId);
    }
  }, []);

  // Stop all SFX
  const stopAllSfx = useCallback(() => {
    activeSfxRef.current.forEach((source) => {
      try { source.stop(); } catch {/* ignore */}
    });
    activeSfxRef.current.clear();
  }, []);

  // Cleanup for stopBroadcastSession
  const sfxCleanup = useCallback(() => {
    activeSfxRef.current.forEach(s => { try { s.stop(); } catch {/* */} });
    activeSfxRef.current.clear();
    try { sfxGainRef.current?.disconnect(); } catch {/* ignore */}
    sfxGainRef.current = null;
    sfxBuffersRef.current.clear();
    setSfxPreloadStatus('idle');
  }, []);

  return {
    sfxVolume, setSfxVolume, sfxPreloadStatus,
    playSfx, stopSfx, stopAllSfx, sfxCleanup,
    activeSfxRef, sfxGainRef, sfxBuffersRef, setSfxPreloadStatus,
  };
}
