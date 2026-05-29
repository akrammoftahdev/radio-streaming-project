import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { colors } from '../../theme/colors';
import { Clock } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { RecordingMiniPlayer, RecordingItem } from './RecordingMiniPlayer';

interface WaitScreenProps {
  scheduledStartTime: Date;
  allowConnectMinutesBefore?: number;  // From server (default 5)
  recordings?: RecordingItem[];
  recordingsLoading?: boolean;
  onAdmit: () => void;
}

export function WaitScreen({
  scheduledStartTime,
  allowConnectMinutesBefore = 5,
  recordings = [],
  recordingsLoading = false,
  onAdmit,
}: WaitScreenProps) {
  const router = useRouter();
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [canEnter, setCanEnter] = useState(false);

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      // Allow entry N minutes early (from server setting)
      const admitTime = new Date(scheduledStartTime.getTime() - allowConnectMinutesBefore * 60 * 1000);
      const diff = admitTime.getTime() - now.getTime();
      
      if (diff <= 0) {
        setCanEnter(true);
        setTimeRemaining(0);
      } else {
        setCanEnter(false);
        setTimeRemaining(Math.floor(diff / 1000));
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [scheduledStartTime, allowConnectMinutesBefore]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatStartTime = () => {
    const hours = scheduledStartTime.getHours().toString().padStart(2, '0');
    const mins = scheduledStartTime.getMinutes().toString().padStart(2, '0');
    return `${hours}:${mins}`;
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Clock size={56} color={colors.primary} style={{ marginBottom: 20 }} />
          <Text style={styles.title}>يرجى الانتظار</Text>
          <Text style={styles.subtitle}>
            سيتم فتح الاستوديو قبل {allowConnectMinutesBefore} دقائق من موعد البدء المجدول.
          </Text>

          {/* Scheduled time display */}
          <View style={styles.scheduleInfo}>
            <Text style={styles.scheduleLabel}>موعد البث</Text>
            <Text style={styles.scheduleTime}>{formatStartTime()}</Text>
          </View>
          
          {!canEnter ? (
            <View style={styles.timerContainer}>
              <Text style={styles.timerLabel}>يفتح الاستوديو خلال</Text>
              <Text style={styles.timerValue}>{formatTime(timeRemaining)}</Text>
            </View>
          ) : (
            <View style={[styles.timerContainer, styles.timerReady]}>
              <Text style={styles.timerReadyLabel}>الاستوديو جاهز الآن! 🎙️</Text>
            </View>
          )}

          <View style={styles.actions}>
            <TouchableOpacity 
              style={[styles.btn, styles.btnSecondary]} 
              onPress={() => router.back()}
            >
              <Text style={styles.btnSecondaryText}>العودة للرئيسية</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.btn, styles.btnPrimary, !canEnter && styles.btnDisabled]} 
              onPress={onAdmit}
              disabled={!canEnter}
            >
              <Text style={styles.btnPrimaryText}>دخول الاستوديو</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recordings section */}
        <View style={styles.recordingsCard}>
          <RecordingMiniPlayer
            recordings={recordings}
            loading={recordingsLoading}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#171717',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: '#262626',
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontFamily: 'Tajawal-Bold',
    marginBottom: 12,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    fontFamily: 'Tajawal-Regular',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  scheduleInfo: {
    alignItems: 'center',
    marginBottom: 16,
  },
  scheduleLabel: {
    color: '#666',
    fontSize: 11,
    fontFamily: 'Tajawal-Regular',
    marginBottom: 4,
  },
  scheduleTime: {
    color: colors.primary,
    fontSize: 28,
    fontFamily: 'Tajawal-Bold',
    letterSpacing: 3,
  },
  timerContainer: {
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    marginBottom: 32,
    width: '100%',
  },
  timerReady: {
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
  },
  timerLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: 'Tajawal-Medium',
    marginBottom: 8,
  },
  timerValue: {
    color: colors.primary,
    fontSize: 36,
    fontFamily: 'Tajawal-Bold',
    letterSpacing: 2,
  },
  timerReadyLabel: {
    color: '#22c55e',
    fontSize: 16,
    fontFamily: 'Tajawal-Bold',
  },
  actions: {
    flexDirection: 'column',
    width: '100%',
    gap: 12,
  },
  btn: {
    width: '100%',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnPrimary: {
    backgroundColor: colors.primary,
  },
  btnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#333',
  },
  btnDisabled: {
    backgroundColor: '#333',
    opacity: 0.5,
  },
  btnPrimaryText: {
    color: '#000',
    fontSize: 16,
    fontFamily: 'Tajawal-Bold',
  },
  btnSecondaryText: {
    color: colors.text,
    fontSize: 16,
    fontFamily: 'Tajawal-Medium',
  },
  recordingsCard: {
    backgroundColor: '#171717',
    borderRadius: 20,
    padding: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#262626',
  },
});
