"use client";

import { useRef, useCallback } from "react";

/**
 * useRecording — MediaRecorder management, session recording start/stop.
 */

export interface RecordingHook {
  mediaRecorderRef:        React.MutableRefObject<MediaRecorder | null>;
  pendingRecordingReasonRef: React.MutableRefObject<'mic' | 'background' | 'queue' | null>;
  startSessionRecording:   (reason: string) => void;
  ensureRecordingStarted:  (reason: 'mic' | 'background' | 'queue') => void;
}

export function useRecording(
  wsRef:       React.MutableRefObject<WebSocket | null>,
  mixerDestRef: React.MutableRefObject<MediaStreamAudioDestinationNode | null>,
): RecordingHook {
  const mediaRecorderRef         = useRef<MediaRecorder | null>(null);
  const pendingRecordingReasonRef = useRef<'mic' | 'background' | 'queue' | null>(null);

  // Internal executor: creates + starts MediaRecorder on mixerDestination.stream
  const startSessionRecording = useCallback((reason: string) => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') return;

    const ws   = wsRef.current;
    const dest = mixerDestRef.current;

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('[Recording] startSessionRecording: WS not OPEN — cannot start (reason:', reason, ')');
      return;
    }
    if (!dest) {
      console.warn('[Recording] startSessionRecording: mixerDest not ready — cannot start (reason:', reason, ')');
      return;
    }

    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/aac',
    ];
    let selectedMime = undefined;
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) {
        selectedMime = t;
        break;
      }
    }
    console.log('[Recording] Selected MIME type:', selectedMime || 'default');
    
    const options = selectedMime ? { mimeType: selectedMime } : undefined;
    const recorder = new MediaRecorder(dest.stream, options);
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = async (e) => {
      if (e.data && e.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(e.data);
    };
    recorder.start(1000);
    console.log('[Recording] Started after real source:', reason);
  }, [wsRef, mixerDestRef]);

  // Public entry point called by every real audio source
  const ensureRecordingStarted = useCallback((reason: 'mic' | 'background' | 'queue') => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') return;

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      pendingRecordingReasonRef.current = reason;
      console.log('[Recording] Pending start until WebSocket opens:', reason);
      return;
    }

    startSessionRecording(reason);
  }, [wsRef, startSessionRecording]);

  return {
    mediaRecorderRef, pendingRecordingReasonRef,
    startSessionRecording, ensureRecordingStarted,
  };
}
