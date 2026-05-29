import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import Slider from '@react-native-community/slider';
import { api } from '../../core/api';
import { colors } from '../../theme/colors';
import { Play, Pause, Square, Disc3 } from 'lucide-react-native';

export interface RecordingItem {
  id: string;
  localPath: string;
  startedAt: string;
  endedAt?: string | null;
  durationSeconds?: number | null;
  format: string;
  presenterNameSnapshot?: string | null;
  programTitleSnapshot?: string | null;
  stationNameSnapshot?: string | null;
  playbackUrl: string;
}

interface RecordingMiniPlayerProps {
  recordings: RecordingItem[];
  loading?: boolean;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const hours = d.getHours().toString().padStart(2, '0');
  const mins = d.getMinutes().toString().padStart(2, '0');
  return `${day}/${month} ${hours}:${mins}`;
}

function formatDuration(secs?: number | null) {
  if (!secs) return '--:--';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function fmtTime(s: number): string {
  if (!isFinite(s) || isNaN(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ── Active Player ──────────────────────────────────────────────────────────
function ActivePlayer({ item, onStop }: { item: RecordingItem; onStop: () => void }) {
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const label = item.stationNameSnapshot || item.programTitleSnapshot || 'تسجيل';

  useEffect(() => {
    let cancelled = false;
    const download = async () => {
      try {
        // Use axios with Bearer auth (same as the recordings list endpoint)
        const filename = encodeURIComponent(item.localPath);
        const relUrl = `/mobile/recordings/play/${filename}`;
        console.log('[Download] Requesting:', relUrl);

        const response = await api.get(relUrl, {
          responseType: 'arraybuffer',
          timeout: 30000,
        });

        if (cancelled) return;
        console.log('[Download] Got:', response.status, response.data?.byteLength, 'bytes');

        if (!response.data || response.data.byteLength < 1024) {
          setError('ملف فارغ أو تالف');
          setDownloading(false);
          return;
        }

        // Save to local cache
        const cacheDir = FileSystem.cacheDirectory + 'recordings/';
        await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true }).catch(() => {});

        const baseName = item.localPath.replace(/\.(webm|mp3|pcm)$/i, '');
        const localFile = cacheDir + baseName + '.mp3';

        const bytes = new Uint8Array(response.data);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);

        await FileSystem.writeAsStringAsync(localFile, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        console.log('[Download] Saved:', localFile);
        if (!cancelled) {
          setLocalUri(localFile);
          setDownloading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error('[Download] Error:', err.message, err.response?.status);
          setError(err.response?.status ? `HTTP ${err.response.status}` : err.message);
          setDownloading(false);
        }
      }
    };
    download();
    return () => { cancelled = true; };
  }, [item.playbackUrl]);

  if (downloading) {
    return (
      <View style={styles.nowPlaying}>
        <View style={styles.npHeader}>
          <ActivityIndicator size="small" color="#d97706" />
          <View style={styles.npInfo}>
            <Text style={styles.npTitle} numberOfLines={1}>{label}</Text>
            <Text style={styles.npDate}>جارٍ تحميل التسجيل...</Text>
          </View>
          <TouchableOpacity onPress={onStop} style={styles.npCloseBtn}>
            <Square size={14} color="#666" fill="#666" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.nowPlaying}>
        <View style={styles.npHeader}>
          <View style={styles.npInfo}>
            <Text style={styles.npTitle} numberOfLines={1}>{label}</Text>
            <Text style={[styles.npDate, { color: '#ef4444' }]}>{error}</Text>
          </View>
          <TouchableOpacity onPress={onStop} style={styles.npCloseBtn}>
            <Square size={14} color="#666" fill="#666" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return <LocalFilePlayer localUri={localUri!} item={item} onStop={onStop} />;
}

// ── Plays local file ───────────────────────────────────────────────────────
function LocalFilePlayer({ localUri, item, onStop }: { localUri: string; item: RecordingItem; onStop: () => void }) {
  const player = useAudioPlayer({ uri: localUri });
  const status = useAudioPlayerStatus(player);
  const [isSeeking, setIsSeeking] = useState(false);
  const didAutoPlay = useRef(false);

  const currentTime = status?.currentTime ?? 0;
  const duration = status?.duration ?? (item.durationSeconds ?? 0);
  const isPlaying = status?.playing ?? false;
  const label = item.stationNameSnapshot || item.programTitleSnapshot || 'تسجيل';

  useEffect(() => {
    if (!didAutoPlay.current && player) {
      didAutoPlay.current = true;
      const t = setTimeout(() => {
        try { player.play(); } catch (e) { console.warn('[Player] play error:', e); }
      }, 200);
      return () => clearTimeout(t);
    }
  }, [player]);

  useEffect(() => {
    return () => { try { player.pause(); } catch (e) {} };
  }, [player]);

  const togglePlay = () => {
    if (isPlaying) player.pause();
    else player.play();
  };

  return (
    <View style={styles.nowPlaying}>
      <View style={styles.npHeader}>
        <TouchableOpacity onPress={togglePlay} style={[styles.npPlayBtn, isPlaying && styles.npPlayBtnActive]}>
          {isPlaying ? <Pause size={18} color="#d97706" /> : <Play size={18} color="#d97706" />}
        </TouchableOpacity>
        <View style={styles.npInfo}>
          <Text style={styles.npTitle} numberOfLines={1}>{label}</Text>
          <Text style={styles.npDate}>{formatDate(item.startedAt)}</Text>
        </View>
        <Text style={styles.npTime}>{fmtTime(currentTime)} / {fmtTime(duration)}</Text>
        <TouchableOpacity onPress={onStop} style={styles.npCloseBtn}>
          <Square size={14} color="#666" fill="#666" />
        </TouchableOpacity>
      </View>
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={duration > 0 ? duration : 1}
        value={isSeeking ? undefined : currentTime}
        onSlidingStart={() => setIsSeeking(true)}
        onSlidingComplete={(v) => { player.seekTo(v); setIsSeeking(false); }}
        minimumTrackTintColor="#d97706"
        maximumTrackTintColor="#333"
        thumbTintColor="#d97706"
      />
    </View>
  );
}

// ── Recording Row ──────────────────────────────────────────────────────────
function RecordingRow({ item, isActive, onSelect }: { item: RecordingItem; isActive: boolean; onSelect: () => void }) {
  const label = item.stationNameSnapshot || item.programTitleSnapshot || 'تسجيل';
  return (
    <TouchableOpacity style={[styles.item, isActive && styles.itemActive]} onPress={onSelect} activeOpacity={0.7}>
      <View style={[styles.playBtn, isActive && styles.playBtnActive]}>
        {isActive ? <Pause size={16} color="#d97706" /> : <Play size={16} color="#888" />}
      </View>
      <View style={styles.info}>
        <Text style={styles.programName} numberOfLines={1}>{label}</Text>
        <Text style={styles.meta}>{formatDate(item.startedAt)} · {formatDuration(item.durationSeconds)}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
export function RecordingMiniPlayer({ recordings, loading }: RecordingMiniPlayerProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeItem = activeId ? recordings.find(r => r.id === activeId) ?? null : null;

  const handleSelect = useCallback((item: RecordingItem) => {
    setActiveId(prev => prev === item.id ? null : item.id);
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.loadingText}>جارٍ تحميل التسجيلات...</Text>
      </View>
    );
  }

  if (recordings.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Disc3 size={32} color="#444" />
        <Text style={styles.emptyText}>لا توجد تسجيلات بعد</Text>
        <Text style={styles.emptySubtext}>ستظهر هنا بعد أول بثّ</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>🎙️ آخر التسجيلات</Text>
      {activeItem && <ActivePlayer key={activeItem.id} item={activeItem} onStop={() => setActiveId(null)} />}
      {recordings.map((item) => (
        <RecordingRow key={item.id} item={item} isActive={activeId === item.id} onSelect={() => handleSelect(item)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 16 },
  sectionTitle: { color: colors.text, fontSize: 14, fontFamily: 'Tajawal-Bold', marginBottom: 12, textAlign: 'right' },
  loadingContainer: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  loadingText: { color: colors.textMuted, fontSize: 12, fontFamily: 'Tajawal-Regular' },
  emptyContainer: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyText: { color: '#666', fontSize: 14, fontFamily: 'Tajawal-Medium' },
  emptySubtext: { color: '#444', fontSize: 12, fontFamily: 'Tajawal-Regular' },
  nowPlaying: {
    backgroundColor: 'rgba(217,119,6,0.06)', borderWidth: 1, borderColor: 'rgba(217,119,6,0.25)',
    borderRadius: 16, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8, marginBottom: 14,
  },
  npHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  npPlayBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(217,119,6,0.12)',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(217,119,6,0.3)',
  },
  npPlayBtnActive: { backgroundColor: 'rgba(217,119,6,0.2)', borderColor: 'rgba(217,119,6,0.5)' },
  npInfo: { flex: 1 },
  npTitle: { color: '#e5e5e5', fontSize: 14, fontFamily: 'Tajawal-Bold', textAlign: 'right' },
  npDate: { color: '#777', fontSize: 11, fontFamily: 'Tajawal-Regular', textAlign: 'right', marginTop: 1 },
  npTime: { color: '#d97706', fontSize: 11, fontFamily: 'Tajawal-Medium', minWidth: 70, textAlign: 'center' },
  npCloseBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  slider: { width: '100%', height: 28, marginTop: 4 },
  item: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 10, marginBottom: 6, backgroundColor: 'rgba(255,255,255,0.03)', gap: 12,
  },
  itemActive: { backgroundColor: 'rgba(217,119,6,0.08)', borderWidth: 1, borderColor: 'rgba(217,119,6,0.2)' },
  playBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#1a1a1a',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#333',
  },
  playBtnActive: { backgroundColor: 'rgba(217,119,6,0.15)', borderColor: 'rgba(217,119,6,0.4)' },
  info: { flex: 1 },
  programName: { color: colors.text, fontSize: 13, fontFamily: 'Tajawal-Medium', textAlign: 'right' },
  meta: { color: '#666', fontSize: 11, fontFamily: 'Tajawal-Regular', textAlign: 'right', marginTop: 2 },
});
