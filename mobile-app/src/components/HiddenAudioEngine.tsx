import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

// ── Types ─────────────────────────────────────────────────────────────────────
// Mic/WebSocket commands are now handled NATIVELY.
// This WebView is responsible ONLY for local audio playback (background + queue).
export type AudioEngineCommand =
  | { type: 'PLAY_BACKGROUND'; url: string }
  | { type: 'STOP_BACKGROUND' }
  | { type: 'SET_BG_VOLUME'; volume: number }
  | { type: 'PLAY_QUEUE'; url: string }
  | { type: 'STOP_QUEUE' }
  | { type: 'SET_QUEUE_VOLUME'; volume: number };

export interface HiddenAudioEngineRef {
  sendCommand: (cmd: AudioEngineCommand) => void;
}

interface Props {
  onQueueEnded?: () => void;
}

// ── Injected HTML (no getUserMedia, no WebSocket, just audio playback) ────────
const ENGINE_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body>
<script>
  var bgEl = null;
  var queueEl = null;
  var bgVolume = 0.5;

  function sendToNative(msg) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    }
  }

  function playBackground(url) {
    if (bgEl) { bgEl.pause(); bgEl = null; }
    bgEl = new Audio(url);
    bgEl.loop = true;
    bgEl.volume = bgVolume;
    bgEl.play().catch(function(e){ sendToNative({type:'BG_ERROR', msg: e.message}); });
  }

  function stopBackground() {
    if (bgEl) { bgEl.pause(); bgEl = null; }
  }

  function playQueue(url) {
    if (queueEl) { queueEl.pause(); queueEl = null; }
    queueEl = new Audio(url);
    queueEl.volume = 0.85;
    // Duck background while queue plays
    if (bgEl) bgEl.volume = 0;
    queueEl.onended = function() {
      if (bgEl) bgEl.volume = bgVolume;
      sendToNative({type:'QUEUE_ENDED'});
    };
    queueEl.play().catch(function(e){ sendToNative({type:'QUEUE_ERROR', msg: e.message}); });
  }

  function stopQueue() {
    if (queueEl) { queueEl.pause(); queueEl = null; }
    if (bgEl) bgEl.volume = bgVolume;
  }

  window.addEventListener('message', function(event) {
    try {
      var data = JSON.parse(event.data);
      switch(data.type) {
        case 'PLAY_BACKGROUND':  playBackground(data.url); break;
        case 'STOP_BACKGROUND':  stopBackground(); break;
        case 'SET_BG_VOLUME':
          bgVolume = data.volume;
          if (bgEl) bgEl.volume = bgVolume;
          break;
        case 'PLAY_QUEUE':       playQueue(data.url); break;
        case 'STOP_QUEUE':       stopQueue(); break;
        case 'SET_QUEUE_VOLUME':
          if (queueEl) queueEl.volume = data.volume;
          break;
      }
    } catch(e) {}
  });
</script>
</body>
</html>
`;

// ── Component ─────────────────────────────────────────────────────────────────
export const HiddenAudioEngine = forwardRef<HiddenAudioEngineRef, Props>(
  ({ onQueueEnded }, ref) => {
    const webViewRef = useRef<WebView>(null);

    useImperativeHandle(ref, () => ({
      sendCommand: (cmd: AudioEngineCommand) => {
        const json = JSON.stringify(cmd).replace(/'/g, "\\'");
        const script = "window.postMessage('" + json + "', '*'); true;";
        webViewRef.current?.injectJavaScript(script);
      },
    }));

    const onMessage = (event: any) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === 'QUEUE_ENDED') onQueueEnded?.();
      } catch (e) {}
    };

    return (
      <View style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
        <WebView
          ref={webViewRef}
          source={{ html: ENGINE_HTML }}
          originWhitelist={['*']}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          style={{ width: 1, height: 1 }}
          onMessage={onMessage}
          javaScriptEnabled={true}
        />
      </View>
    );
  }
);
