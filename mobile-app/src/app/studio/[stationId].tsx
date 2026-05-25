import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { requestRecordingPermissionsAsync } from "expo-audio";
import { colors, glassStyles } from "../../theme/colors";
import { ChevronLeft, Mic, MicOff, Radio } from "lucide-react-native";
import { AudioStream } from "../../core/audioStream";

export default function StudioScreen() {
  const { stationId } = useLocalSearchParams();
  const router = useRouter();

  const [isConnecting, setIsConnecting] = useState(false);
  const [isOnAir, setIsOnAir] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      stopBroadcast();
    };
  }, []);

  const stopBroadcast = () => {
    AudioStream.stop();
    AudioStream.removeAllListeners();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsOnAir(false);
    setIsConnecting(false);
  };

  const startBroadcast = async () => {
    try {
      setErrorMsg("");
      setIsConnecting(true);

      // 1. Request microphone permissions
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        throw new Error("Microphone permission is required to broadcast.");
      }

      // 2. Get JWT token
      const token = await SecureStore.getItemAsync("egonair_mobile_jwt");
      if (!token) {
        throw new Error("You are not logged in. Please log in again.");
      }

      // 3. Initialize WebSocket
      const wsUrl = `wss://studio.egonair.com/audio?token=${token}&format=pcm`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected!");
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "ws_connected" || msg.type === "shoutcast_ok" || msg.type === "recording_started") {
            // Backend is ready to accept audio!
            if (!isOnAir) {
              startAudioStream(ws);
            }
          } else if (msg.type === "shoutcast_error") {
            stopBroadcast();
            setErrorMsg("SHOUTcast Error: " + msg.error);
          }
        } catch (err) {
          // non-JSON message
        }
      };

      ws.onerror = (e) => {
        console.error("WebSocket error", e);
        stopBroadcast();
        setErrorMsg("Connection failed. Check your internet.");
      };

      ws.onclose = (e) => {
        console.log("WebSocket closed", e.reason);
        stopBroadcast();
        if (e.reason) setErrorMsg(`Disconnected: ${e.reason}`);
      };

    } catch (err: any) {
      stopBroadcast();
      setErrorMsg(err.message || "Failed to start broadcasting");
    }
  };

  const startAudioStream = (ws: WebSocket) => {
    // Initialize stream at 44100Hz, 1 channel, 16-bit
    AudioStream.init({
      sampleRate: 44100,
      channels: 1,
      bitsPerSample: 16
    });

    AudioStream.onData((buffer) => {
      // Send raw PCM buffer via WebSocket
      if (ws.readyState === WebSocket.OPEN) {
        // Convert Node Buffer to ArrayBuffer for React Native WebSocket
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        ws.send(arrayBuffer);
      }
    });

    AudioStream.start();
    setIsOnAir(true);
    setIsConnecting(false);
  };

  const toggleBroadcast = () => {
    if (isOnAir || isConnecting) {
      stopBroadcast();
    } else {
      startBroadcast();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerText}>LIVE STUDIO</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.stationLabel}>Station ID: {stationId}</Text>
        
        {errorMsg ? (
          <Text style={styles.errorText}>{errorMsg}</Text>
        ) : null}

        <View style={styles.micContainer}>
          <TouchableOpacity 
            onPress={toggleBroadcast}
            disabled={isConnecting}
            style={[
              glassStyles.container, 
              styles.micButton,
              isOnAir && styles.micButtonActive,
              isConnecting && styles.micButtonConnecting
            ]}
          >
            {isOnAir ? (
              <Radio size={64} color="#ef4444" />
            ) : isConnecting ? (
              <Text style={{ color: colors.text }}>Connecting...</Text>
            ) : (
              <Mic size={64} color={colors.textMuted} />
            )}
          </TouchableOpacity>
          <Text style={[styles.statusText, isOnAir && { color: "#ef4444", fontWeight: "bold" }]}>
            {isOnAir ? "ON AIR" : isConnecting ? "Connecting to Studio..." : "Tap to Connect"}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    padding: 4,
  },
  headerText: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 2,
  },
  content: {
    flex: 1,
    alignItems: "center",
    padding: 24,
  },
  stationLabel: {
    color: colors.textMuted,
    fontSize: 16,
    marginBottom: 40,
  },
  errorText: {
    color: "#ef4444",
    marginBottom: 20,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  micContainer: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  micButton: {
    width: 200,
    height: 200,
    borderRadius: 100,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 30,
    borderWidth: 2,
    borderColor: colors.border,
  },
  micButtonActive: {
    borderColor: "#ef4444",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  micButtonConnecting: {
    borderColor: colors.primary,
    opacity: 0.7,
  },
  statusText: {
    color: colors.textMuted,
    fontSize: 18,
    letterSpacing: 1,
  },
});
