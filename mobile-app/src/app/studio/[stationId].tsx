import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { requestRecordingPermissionsAsync } from "expo-audio";
import LiveAudioStream from "../../../modules/live-audio-stream/src";
import { colors } from "../../theme/colors";
import { ChevronLeft, Mic, MicOff, Radio, Square, Headphones, Volume2, AlertTriangle } from "lucide-react-native";
import { MediaLibrary, LocalMediaFile } from "../../components/studio/MediaLibrary";
import { MediaQueue, QueueItem } from "../../components/studio/MediaQueue";
import { WaitScreen } from "../../components/studio/WaitScreen";
import { RecordingMiniPlayer, RecordingItem } from "../../components/studio/RecordingMiniPlayer";
import { api } from "../../core/api";

// ── Constants ─────────────────────────────────────────────────────────────────
const BG_DUCK_RATIO = 0.10;   // Background ducks to 10% when mic is open
const DUCK_FADE_SEC = 0.3;    // Ducking fade duration
const BG_FADE_OUT_SEC = 3.0;  // Background fade out when queue starts
const BG_FADE_IN_SEC = 2.0;   // Background fade in when queue ends

// ── Volume bar ────────────────────────────────────────────────────────────────
function VolumeBar({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const pct = Math.round(value * 100);
  const step = 0.1;
  return (
    <View style={vb.row}>
      <Text style={vb.label}>{label}</Text>
      <TouchableOpacity onPress={() => onChange(Math.max(0, parseFloat((value - step).toFixed(1))))} style={vb.btn}>
        <Text style={vb.btnTxt}>－</Text>
      </TouchableOpacity>
      <View style={vb.track}>
        <View style={[vb.fill, { width: `${pct}%` as any }]} />
      </View>
      <TouchableOpacity onPress={() => onChange(Math.min(1, parseFloat((value + step).toFixed(1))))} style={vb.btn}>
        <Text style={vb.btnTxt}>＋</Text>
      </TouchableOpacity>
      <Text style={vb.pct}>{pct}%</Text>
    </View>
  );
}
const vb = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch' },
  label: { color: '#888', fontSize: 11, fontFamily: 'Tajawal-Regular', minWidth: 40, textAlign: 'right' },
  btn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#444' },
  btnTxt: { color: '#fff', fontSize: 16, lineHeight: 20 },
  track: { flex: 1, height: 4, backgroundColor: '#333', borderRadius: 2 },
  fill: { height: 4, backgroundColor: '#d97706', borderRadius: 2 },
  pct: { color: '#666', fontSize: 10, minWidth: 30, textAlign: 'center' },
});

// ─────────────────────────────────────────────────────────────────────────────


export default function StudioScreen() {
  const { stationId } = useLocalSearchParams<{
    stationId: string;
  }>();
  const router = useRouter();

  // ── Native WebSocket ref ─────────────────────────────────────────────────
  const wsRef = useRef<WebSocket | null>(null);
  const audioSubRef = useRef<any>(null);
  const fileCompleteSubRef = useRef<any>(null);
  const isRecordingRef = useRef(false);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Schedule state (fetched from server) ─────────────────────────────────
  const [scheduleMode, setScheduleMode] = useState<string | null>(null); // null=loading, SCHEDULED, DIRECT_DJ, NO_SCHEDULE
  const [scheduledStartTime, setScheduledStartTime] = useState<string | null>(null);
  const [sessionEndTime, setSessionEndTime] = useState<string | null>(null);
  const [allowConnectMinutesBefore, setAllowConnectMinutesBefore] = useState(5);
  const [scheduleLoading, setScheduleLoading] = useState(true);

  // ── Recordings state ────────────────────────────────────────────────────
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [recordingsLoading, setRecordingsLoading] = useState(true);

  // ── Session-end watchdog ─────────────────────────────────────────────────
  const [sessionWarning, setSessionWarning] = useState(false);
  const [sessionTimeLeft, setSessionTimeLeft] = useState<number | null>(null);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [hasPassedWait, setHasPassedWait] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isOnAir, setIsOnAir] = useState(false);
  const [isMicOpen, setIsMicOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // ── Volume state ─────────────────────────────────────────────────────────
  const [micVolume, setMicVolume] = useState(1.0);
  const [mediaVolume, setMediaVolume] = useState(0.7);
  const [monitorVolume, setMonitorVolume] = useState(0.5);
  const [monitorEnabled, setMonitorEnabled] = useState(false);

  // ── Background music ─────────────────────────────────────────────────────
  const [bgFile, setBgFile] = useState<LocalMediaFile | null>(null);
  const [bgVolume, setBgVolume] = useState(0.5);

  // ── Queue ─────────────────────────────────────────────────────────────────
  const [files, setFiles] = useState<LocalMediaFile[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const isQueuePlayingRef = useRef(false);
  const manualStopRef = useRef(false);
  const isMicOpenRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => { isMicOpenRef.current = isMicOpen; }, [isMicOpen]);
  useEffect(() => { isQueuePlayingRef.current = !!playingId; }, [playingId]);

  // ── Fetch schedule + recordings on mount ─────────────────────────────────
  useEffect(() => {
    const fetchSchedule = async () => {
      try {
        const res = await api.get(`/mobile/schedule?stationId=${stationId}`);
        const data = res.data;
        setScheduleMode(data.mode);
        setScheduledStartTime(data.scheduledStartTime);
        setSessionEndTime(data.sessionEndTime);
        setAllowConnectMinutesBefore(data.allowConnectMinutesBefore || 5);

        // DIRECT_DJ: skip wait screen (no schedule concept)
        if (data.mode === 'DIRECT_DJ') {
          setHasPassedWait(true);
        }
        // NO_SCHEDULE: will show blocked screen (handled in render)
      } catch (e) {
        console.error('[SCHEDULE] Failed to fetch:', e);
        // On error, skip waitscreen to avoid blocking
        setScheduleMode('NO_SCHEDULE');
        setHasPassedWait(true);
      } finally {
        setScheduleLoading(false);
      }
    };

    const fetchRecordings = async () => {
      try {
        const res = await api.get(`/mobile/recordings?take=10`);
        setRecordings(res.data);
      } catch (e) {
        console.error('[RECORDINGS] Failed to fetch:', e);
      } finally {
        setRecordingsLoading(false);
      }
    };

    fetchSchedule();
    fetchRecordings();
  }, [stationId]);

  // ── Session-end watchdog ─────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionEndTime || !isOnAir) return;

    const endMs = new Date(sessionEndTime).getTime();

    const interval = setInterval(() => {
      const remaining = Math.floor((endMs - Date.now()) / 1000);
      setSessionTimeLeft(remaining);

      if (remaining <= 60 && remaining > 0) {
        setSessionWarning(true);
      } else if (remaining <= 0) {
        // Auto-disconnect
        console.log('[WATCHDOG] Session ended — auto-disconnecting');
        setSessionWarning(false);
        stopAll();
        Alert.alert(
          'انتهى وقت البث',
          'تم قطع الاتصال تلقائياً لأن وقت برنامجك انتهى.',
          [{ text: 'حسناً', onPress: () => router.back() }]
        );
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionEndTime, isOnAir]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopAll();
    };
  }, []);
  // ── Track if engine is running ──────────────────────────────────────────────
  const engineRunningRef = useRef(false);

  // ── Ensure engine is running (called before any audio action) ──────────────
  const ensureEngine = useCallback(async () => {
    if (engineRunningRef.current) return true;
    try {
      // Engine needs mic permission (AVAudioEngine.inputNode requires it)
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        setErrorMsg("يرجى السماح للتطبيق باستخدام الميكروفون من إعدادات الهاتف");
        return false;
      }

      console.log('[ENGINE] Starting native AVAudioEngine...');
      // Stop keepalive — engine tap will send continuous PCM from now on
      if (keepAliveRef.current) { clearInterval(keepAliveRef.current); keepAliveRef.current = null; }

      // Subscribe to continuous PCM chunks from native module
      audioSubRef.current = LiveAudioStream.onAudioData((event) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        wsRef.current.send(event.data);
      });
      // Start the native engine (44100 Hz, mono, Int16)
      LiveAudioStream.start({ sampleRate: 44100, channelCount: 1 });

      // Mic starts MUTED — user must tap to open
      LiveAudioStream.setMicVolume(0);
      LiveAudioStream.setMediaVolume(mediaVolume);

      // Subscribe to file completion events for queue auto-advance
      fileCompleteSubRef.current = LiveAudioStream.onFileComplete(() => {
        console.log('[QUEUE] File complete — auto-advancing...');
        handleFileComplete();
      });

      engineRunningRef.current = true;
      console.log('[ENGINE] ✅ Audio engine started');
      return true;
    } catch (e: any) {
      console.error('[ENGINE] startEngine ERROR:', e?.message || e);
      setErrorMsg(`خطأ في المحرك: ${(e?.message || String(e)).slice(0, 120)}`);
      return false;
    }
  }, [mediaVolume]);

  // ── Open mic ───────────────────────────────────────────────────────────────
  const openMic = useCallback(async () => {
    if (!(await ensureEngine())) return;
    isRecordingRef.current = true;
    LiveAudioStream.setMicVolume(micVolume);
    setIsMicOpen(true);
    console.log('[MIC] ✅ Mic opened');
  }, [micVolume, ensureEngine]);

  // ── Close mic (just mute) ──────────────────────────────────────────────────
  const closeMic = useCallback(() => {
    isRecordingRef.current = false;
    LiveAudioStream.setMicVolume(0);
    setIsMicOpen(false);
    console.log('[MIC] Mic closed (muted)');
  }, []);

  // ── Connect to stream ─────────────────────────────────────────────────────
  const connect = async () => {
    try {
      setErrorMsg("");
      setIsConnecting(true);

      const jwt = await SecureStore.getItemAsync("egonair_mobile_jwt");
      if (!jwt) throw new Error("يرجى تسجيل الدخول مجدداً");

      const res = await fetch("https://studio.egonair.com/api/mobile/audio-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${jwt}`,
        },
        body: JSON.stringify({ stationId }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`خطأ ${res.status}: ${body.slice(0, 200)}`);
      }

      const data = await res.json();
      const token = data.token;
      if (!token) throw new Error("لم يصدر السيرفر توكن");

      const ws = new WebSocket(`wss://studio.egonair.com/audio?token=${token}&format=pcm`);

      ws.onopen = () => {
        wsRef.current = ws;
        setIsOnAir(true);
        setIsConnecting(false);
        setErrorMsg("");

        // Keepalive until engine starts (engine starts on first mic/music use)
        const SILENCE = 'A'.repeat(5460) + 'AA==';
        keepAliveRef.current = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN && !engineRunningRef.current) {
            wsRef.current.send(SILENCE);
          }
        }, 5000);
      };
      ws.onerror = () => {
        setErrorMsg("تعذّر الاتصال بالسيرفر");
        setIsConnecting(false);
      };
      ws.onclose = (e) => {
        if (keepAliveRef.current) { clearInterval(keepAliveRef.current); keepAliveRef.current = null; }
        setIsOnAir(false);
        setIsMicOpen(false);
        wsRef.current = null;
        isRecordingRef.current = false;
        engineRunningRef.current = false;
        if (e.reason) setErrorMsg(`انقطع الاتصال: ${e.reason}`);
      };
    } catch (err: any) {
      setErrorMsg(err.message || "فشل الاتصال");
      setIsConnecting(false);
    }
  };

  // ── Disconnect ──────────────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    isRecordingRef.current = false;
    engineRunningRef.current = false;
    if (keepAliveRef.current) { clearInterval(keepAliveRef.current); keepAliveRef.current = null; }
    try { LiveAudioStream.stop(); } catch (_) {}
    if (audioSubRef.current) { audioSubRef.current.remove(); audioSubRef.current = null; }
    if (fileCompleteSubRef.current) { fileCompleteSubRef.current.remove(); fileCompleteSubRef.current = null; }
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    setIsOnAir(false);
    setIsMicOpen(false);
    setIsConnecting(false);
    setPlayingId(null);
    isQueuePlayingRef.current = false;
  }, []);

  // ── Mic toggle ─────────────────────────────────────────────────────────────
  const toggleMic = async () => {
    if (!isOnAir) return;
    if (isMicOpen) {
      closeMic();
      // Restore media volume when mic closes (un-duck)
      const restoreVol = isQueuePlayingRef.current ? mediaVolume : (bgFile ? bgVolume : mediaVolume);
      LiveAudioStream.fadeMediaVolume(restoreVol, DUCK_FADE_SEC);
      return;
    }
    await openMic();
    // Duck media when mic opens — applies to both background and queue
    const currentVol = isQueuePlayingRef.current ? mediaVolume : (bgFile ? bgVolume : mediaVolume);
    LiveAudioStream.fadeMediaVolume(currentVol * BG_DUCK_RATIO, DUCK_FADE_SEC);
  };


  // ── Volume handlers ───────────────────────────────────────────────────────
  const handleMicVolume = (v: number) => {
    setMicVolume(v);
    LiveAudioStream.setMicVolume(v);
  };

  const handleMediaVolume = (v: number) => {
    setMediaVolume(v);
    LiveAudioStream.setMediaVolume(v);
  };

  const handleMonitorVolume = (v: number) => {
    setMonitorVolume(v);
    LiveAudioStream.setMonitorVolume(v);
  };

  const toggleMonitor = () => {
    if (!monitorEnabled) {
      // Show headphone warning before enabling
      Alert.alert(
        "🎧 تنبيه",
        "يُرجى استخدام سماعات الرأس لتجنب التشويش والصدى أثناء البث.",
        [
          { text: "إلغاء", style: "cancel" },
          {
            text: "فهمت، تفعيل",
            onPress: () => {
              setMonitorEnabled(true);
              LiveAudioStream.setMonitorEnabled(true);
              LiveAudioStream.setMonitorVolume(monitorVolume);
            }
          },
        ]
      );
    } else {
      setMonitorEnabled(false);
      LiveAudioStream.setMonitorEnabled(false);
    }
  };

  // ── Background ────────────────────────────────────────────────────────────
  const handleSetBg = async (file: LocalMediaFile) => {
    setBgFile(file);
    if (isOnAir) {
      if (!(await ensureEngine())) return;
      // Play through native mixer with LOOP
      LiveAudioStream.playFile(file.uri, true);
      // Apply ducking if mic is open
      const targetVol = isMicOpenRef.current ? bgVolume * BG_DUCK_RATIO : bgVolume;
      LiveAudioStream.setMediaVolume(targetVol);
    }
  };

  const handleStopBg = () => {
    setBgFile(null);
    if (isOnAir) {
      manualStopRef.current = true;
      LiveAudioStream.stopFile();
      setTimeout(() => { manualStopRef.current = false; }, 100);
    }
  };

  const handleBgVolume = (v: number) => {
    setBgVolume(v);
    if (isOnAir) {
      const targetVol = isMicOpenRef.current ? v * BG_DUCK_RATIO : v;
      LiveAudioStream.setMediaVolume(targetVol);
    }
  };

  // ── Queue ─────────────────────────────────────────────────────────────────
  const enqueue = (file: LocalMediaFile) => {
    setQueue(q => [...q, { id: Math.random().toString(36).slice(2), file, status: "QUEUED" }]);
  };

  const playNow = async (id: string) => {
    const item = queue.find(q => q.id === id);
    if (!item) return;
    setPlayingId(id);
    isQueuePlayingRef.current = true;
    setQueue(q => q.map(i => ({ ...i, status: i.id === id ? "PLAYING" : i.status === "PLAYING" ? "QUEUED" : i.status })));

    if (isOnAir) {
      if (!(await ensureEngine())) return;

      if (bgFile) {
        // Background is playing — quick fade out (0.5s), THEN play queue
        // IMPORTANT: setMediaVolume is called AFTER fade completes (550ms > 500ms)
        // to avoid the race condition from May 27 KB
        LiveAudioStream.fadeMediaVolume(0, 0.5);
        setTimeout(() => {
          manualStopRef.current = true;       // guard before stopFile
          LiveAudioStream.stopFile();
          LiveAudioStream.playFile(item.file.uri, false);
          LiveAudioStream.setMediaVolume(mediaVolume);
          setTimeout(() => { manualStopRef.current = false; }, 100);
        }, 550);
      } else {
        // No background — play immediately
        manualStopRef.current = true;         // guard before stopFile
        LiveAudioStream.stopFile();
        LiveAudioStream.playFile(item.file.uri, false);
        LiveAudioStream.setMediaVolume(mediaVolume);
        setTimeout(() => { manualStopRef.current = false; }, 100);
      }
    }
  };

  const stopQueue = () => {
    manualStopRef.current = true;           // guard: block onFileComplete cascade
    LiveAudioStream.stopFile();
    setPlayingId(null);
    isQueuePlayingRef.current = false;
    setQueue(q => q.map(i => ({ ...i, status: i.status === "PLAYING" ? "QUEUED" : i.status })));
    // Restore background
    if (bgFile && isOnAir) {
      const targetVol = isMicOpenRef.current ? bgVolume * BG_DUCK_RATIO : bgVolume;
      LiveAudioStream.fadeMediaVolume(targetVol, BG_FADE_IN_SEC);
      setTimeout(() => {
        if (bgFile) LiveAudioStream.playFile(bgFile.uri, true);
        manualStopRef.current = false;      // release guard after bg is safely playing
      }, BG_FADE_IN_SEC * 1000 + 100);
    } else {
      setTimeout(() => { manualStopRef.current = false; }, 100);
    }
  };

  // ── File completion handler (auto-advance queue) ──────────────────────────
  const handleFileComplete = useCallback(() => {
    if (manualStopRef.current) return;      // ignore events during manual stop
    setQueue(prevQueue => {
      const currentIdx = prevQueue.findIndex(i => i.status === "PLAYING");
      if (currentIdx === -1) {
        // No queue item was playing — might be background
        return prevQueue;
      }

      // Mark current as done
      const updated = [...prevQueue];
      updated[currentIdx] = { ...updated[currentIdx], status: "DONE" };

      // Find next QUEUED item
      const nextItem = updated.find(i => i.status === "QUEUED");
      if (nextItem) {
        // Auto-play next
        nextItem.status = "PLAYING";
        setPlayingId(nextItem.id);
        setTimeout(() => {
          LiveAudioStream.playFile(nextItem.file.uri, false);
        }, 50);
      } else {
        // Queue exhausted — restore background
        setPlayingId(null);
        isQueuePlayingRef.current = false;
        if (bgFile) {
          const targetVol = isMicOpenRef.current ? bgVolume * BG_DUCK_RATIO : bgVolume;
          LiveAudioStream.fadeMediaVolume(targetVol, BG_FADE_IN_SEC);
          // Replay background
          setTimeout(() => {
            if (bgFile) LiveAudioStream.playFile(bgFile.uri, true);
          }, BG_FADE_IN_SEC * 1000 + 100);
        }
      }

      return updated;
    });
  }, [bgFile, bgVolume]);

  // ── Loading state ─────────────────────────────────────────────────────────
  if (scheduleLoading) {
    return (
      <SafeAreaView style={s.root}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: colors.textMuted, fontFamily: 'Tajawal-Regular', fontSize: 14 }}>جارٍ التحميل...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Wait screen ───────────────────────────────────────────────────────────
  if (!hasPassedWait && scheduledStartTime) {
    return (
      <WaitScreen
        scheduledStartTime={new Date(scheduledStartTime)}
        allowConnectMinutesBefore={allowConnectMinutesBefore}
        recordings={recordings}
        recordingsLoading={recordingsLoading}
        onAdmit={() => setHasPassedWait(true)}
      />
    );
  }

  // ── NO_SCHEDULE blocked screen ────────────────────────────────────────────
  if (scheduleMode === 'NO_SCHEDULE') {
    return (
      <SafeAreaView style={s.root}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <Text style={{ color: '#f59e0b', fontSize: 48, marginBottom: 16 }}>📅</Text>
          <Text style={{ color: colors.text, fontSize: 18, fontFamily: 'Tajawal-Bold', textAlign: 'center', marginBottom: 8 }}>
            لا يوجد موعد بث
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14, fontFamily: 'Tajawal-Regular', textAlign: 'center', marginBottom: 32, lineHeight: 22 }}>
            لا يوجد برنامج مجدول لك على هذه المحطة حالياً.
            تواصل مع الإدارة لجدولة برنامجك.
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}
          >
            <Text style={{ color: colors.text, fontSize: 15, fontFamily: 'Tajawal-Bold' }}>العودة للرئيسية</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const onAirLabel = isMicOpen ? "على الهواء · المايك مفتوح" : "على الهواء · بدون مايك";

  return (
    <SafeAreaView style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={s.headerMid}>
          <Radio size={15} color={isOnAir ? "#ef4444" : "#555"} />
          <Text style={s.headerTitle}>LIVE STUDIO</Text>
          {isOnAir && <View style={s.liveDot} />}
        </View>
        <View style={s.iconBtn} />
      </View>

      {/* Session-end warning banner */}
      {sessionWarning && sessionTimeLeft !== null && sessionTimeLeft > 0 && (
        <View style={s.warnBanner}>
          <AlertTriangle size={16} color="#f59e0b" />
          <Text style={s.warnText}>
            ⚠️ سيتم إنهاء البث خلال {sessionTimeLeft} ثانية
          </Text>
        </View>
      )}

      {/* Error banner */}
      {!!errorMsg && (
        <View style={s.errBanner}>
          <Text style={s.errText}>{errorMsg}</Text>
        </View>
      )}

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Connect + Mic ─────────────────────────────────────────────── */}
        <View style={s.topRow}>
          <TouchableOpacity
            style={[s.bigBtn, isOnAir && s.bigBtnActive, isConnecting && s.bigBtnConnecting]}
            onPress={isOnAir ? stopAll : isConnecting ? undefined : connect}
            disabled={isConnecting}
          >
            <Radio size={32} color={isOnAir ? "#ef4444" : isConnecting ? colors.primary : "#666"} />
            <Text style={[s.bigBtnLabel, isOnAir && { color: "#ef4444" }]}>
              {isConnecting ? "جارٍ الاتصال..." : isOnAir ? "قطع البث" : "ابدأ البث"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.bigBtn, isMicOpen && s.bigBtnMic, !isOnAir && s.bigBtnDisabled]}
            onPress={toggleMic}
            disabled={!isOnAir}
          >
            {isMicOpen
              ? <Mic size={32} color="#ef4444" />
              : <MicOff size={32} color={isOnAir ? "#888" : "#444"} />
            }
            <Text style={[s.bigBtnLabel, isMicOpen && { color: "#ef4444" }]}>
              {isMicOpen ? "أغلق المايك" : "افتح المايك"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* On-air status */}
        {isOnAir && (
          <View style={s.statusStrip}>
            <View style={s.statusDot} />
            <Text style={s.statusTxt}>{onAirLabel}</Text>
          </View>
        )}

        {/* ── Volume Controls ──────────────────────────────────────────── */}
        {isOnAir && (
          <View style={s.card}>
            <Text style={s.cardTitle}>🎚️ التحكم بالصوت</Text>
            <View style={{ gap: 10, marginTop: 8 }}>
              <VolumeBar label="🎤 مايك" value={micVolume} onChange={handleMicVolume} />
              <VolumeBar label="🎵 ميديا" value={mediaVolume} onChange={handleMediaVolume} />

              {/* Monitor toggle + volume */}
              <View style={s.monitorRow}>
                <TouchableOpacity
                  style={[s.monitorBtn, monitorEnabled && s.monitorBtnActive]}
                  onPress={toggleMonitor}
                >
                  <Headphones size={16} color={monitorEnabled ? "#d97706" : "#666"} />
                  <Text style={[s.monitorBtnTxt, monitorEnabled && { color: "#d97706" }]}>
                    {monitorEnabled ? "المراقبة مفعلة" : "مراقبة الصوت"}
                  </Text>
                </TouchableOpacity>
                {monitorEnabled && (
                  <View style={{ flex: 1 }}>
                    <VolumeBar label="🔊" value={monitorVolume} onChange={handleMonitorVolume} />
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {/* ── Background Music ─────────────────────────────────────────── */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>🎵 موسيقى الخلفية</Text>
            {bgFile && (
              <TouchableOpacity onPress={handleStopBg} style={s.stopBtn}>
                <Square size={12} color="#ef4444" />
                <Text style={s.stopBtnTxt}>إيقاف</Text>
              </TouchableOpacity>
            )}
          </View>
          {bgFile
            ? <Text style={s.activeName} numberOfLines={1}>▶ {bgFile.name}</Text>
            : <Text style={s.hint}>اختر ملفاً من المكتبة وضعه كخلفية</Text>
          }
          <VolumeBar label="مستوى" value={bgVolume} onChange={handleBgVolume} />
        </View>

        {/* ── Queue ────────────────────────────────────────────────────── */}
        <View style={s.card}>
          <MediaQueue
            queue={queue}
            onRemove={(id) => { if (playingId === id) stopQueue(); setQueue(q => q.filter(i => i.id !== id)); }}
            onPlayNow={playNow}
            onStop={stopQueue}
            isMicOpen={isMicOpen}
          />
        </View>

        {/* ── Media Library ────────────────────────────────────────────── */}
        <View style={s.card}>
          <MediaLibrary
            files={files}
            onAddFile={f => setFiles(prev => [...prev, f])}
            onRemoveFile={id => setFiles(prev => prev.filter(f => f.id !== id))}
            onEnqueue={enqueue}
            onSetBackground={handleSetBg}
            activeBgId={bgFile?.id ?? null}
          />
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
  },
  iconBtn: { width: 36, alignItems: 'center' },
  headerMid: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { color: colors.primary, fontSize: 14, fontFamily: 'Tajawal-Bold', letterSpacing: 2 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#ef4444' },
  errBanner: { backgroundColor: 'rgba(239,68,68,0.1)', padding: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(239,68,68,0.25)' },
  errText: { color: '#ef4444', textAlign: 'center', fontFamily: 'Tajawal-Medium', fontSize: 13 },
  warnBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(245,158,11,0.1)', padding: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(245,158,11,0.25)',
  },
  warnText: { color: '#f59e0b', textAlign: 'center', fontFamily: 'Tajawal-Bold', fontSize: 14 },
  scroll: { flex: 1 },
  scrollContent: { padding: 14, gap: 12, paddingBottom: 40 },
  topRow: { flexDirection: 'row', gap: 12 },
  bigBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 22, borderRadius: 16, gap: 8,
    backgroundColor: '#171717', borderWidth: 1, borderColor: '#2a2a2a',
  },
  bigBtnActive: { borderColor: 'rgba(239,68,68,0.4)', backgroundColor: 'rgba(239,68,68,0.07)' },
  bigBtnMic: { borderColor: 'rgba(239,68,68,0.4)', backgroundColor: 'rgba(239,68,68,0.07)' },
  bigBtnConnecting: { opacity: 0.6 },
  bigBtnDisabled: { opacity: 0.35 },
  bigBtnLabel: { color: '#888', fontFamily: 'Tajawal-Medium', fontSize: 13 },
  statusStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(239,68,68,0.07)', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' },
  statusTxt: { color: '#ef4444', fontFamily: 'Tajawal-Medium', fontSize: 13 },
  card: { backgroundColor: '#141414', borderRadius: 14, borderWidth: 1, borderColor: '#222', padding: 14 },
  cardHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardTitle: { color: colors.text, fontFamily: 'Tajawal-Bold', fontSize: 14 },
  stopBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 6,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
  },
  stopBtnTxt: { color: '#ef4444', fontSize: 12, fontFamily: 'Tajawal-Medium' },
  activeName: { color: '#d97706', fontFamily: 'Tajawal-Regular', fontSize: 13, textAlign: 'right', marginBottom: 8 },
  hint: { color: '#555', fontFamily: 'Tajawal-Regular', fontSize: 12, textAlign: 'right', marginBottom: 8 },
  monitorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 4,
  },
  monitorBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#1a1a1a', borderRadius: 8,
    borderWidth: 1, borderColor: '#333',
  },
  monitorBtnActive: {
    borderColor: 'rgba(217,119,6,0.4)', backgroundColor: 'rgba(217,119,6,0.07)',
  },
  monitorBtnTxt: { color: '#666', fontSize: 12, fontFamily: 'Tajawal-Medium' },
});
