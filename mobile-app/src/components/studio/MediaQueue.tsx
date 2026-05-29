import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { colors } from '../../theme/colors';
import { X, PlayCircle, Square } from 'lucide-react-native';
import { LocalMediaFile } from './MediaLibrary';

export interface QueueItem {
  id: string;
  file: LocalMediaFile;
  status: 'QUEUED' | 'READY' | 'PLAYING';
}

interface MediaQueueProps {
  queue: QueueItem[];
  onRemove: (id: string) => void;
  onPlayNow: (id: string) => void;
  onStop: () => void;
  isMicOpen: boolean;
}

export function MediaQueue({ queue, onRemove, onPlayNow, onStop, isMicOpen }: MediaQueueProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>قائمة التشغيل</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{queue.length}</Text>
        </View>
      </View>

      <ScrollView style={styles.list}>
        {queue.length === 0 ? (
          <Text style={styles.emptyText}>القائمة فارغة</Text>
        ) : (
          queue.map((item, index) => (
            <View key={item.id} style={[styles.itemRow, item.status === 'PLAYING' && styles.playingRow]}>
              
              <View style={styles.itemInfo}>
                <Text style={[styles.itemName, item.status === 'PLAYING' && styles.playingText]} numberOfLines={1}>
                  {item.file.name}
                </Text>
                <View style={styles.metaRow}>
                  <Text style={styles.typeText}>{
                    item.file.mediaType === 'SONG' ? 'أغنية' :
                    item.file.mediaType === 'BREAK' ? 'فاصل' :
                    item.file.mediaType === 'BACKGROUND' ? 'خلفية' : 'إعلان'
                  }</Text>
                  
                  {isMicOpen && item.file.mediaType !== 'BACKGROUND' ? (
                    <Text style={styles.waitingText}>ينتظر غلق المايك</Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.actions}>
                {item.status !== 'PLAYING' && (
                  <>
                    <TouchableOpacity onPress={() => onPlayNow(item.id)} style={styles.actionBtn}>
                      <PlayCircle size={22} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => onRemove(item.id)} style={styles.actionBtn}>
                      <X size={22} color={colors.textMuted} />
                    </TouchableOpacity>
                  </>
                )}
                {item.status === 'PLAYING' && (
                  <>
                    <View style={styles.playingIndicator}>
                      <View style={[styles.bar, styles.bar1]} />
                      <View style={[styles.bar, styles.bar2]} />
                      <View style={[styles.bar, styles.bar3]} />
                    </View>
                    <TouchableOpacity onPress={onStop} style={styles.actionBtn}>
                      <Square size={20} color="#ef4444" />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#171717',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#262626',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#0a0a0a',
    borderBottomWidth: 1,
    borderBottomColor: '#262626',
  },
  headerTitle: {
    color: colors.text,
    fontSize: 16,
    fontFamily: 'Tajawal-Bold',
  },
  badge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  badgeText: {
    color: '#000',
    fontSize: 12,
    fontFamily: 'Tajawal-Bold',
  },
  list: {
    flex: 1,
    padding: 8,
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 20,
    fontFamily: 'Tajawal-Regular',
  },
  itemRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#262626',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  playingRow: {
    backgroundColor: 'rgba(217, 119, 6, 0.1)',
    borderColor: 'rgba(217, 119, 6, 0.3)',
    borderWidth: 1,
  },
  itemInfo: {
    flex: 1,
    marginLeft: 12,
    alignItems: 'flex-end',
  },
  itemName: {
    color: colors.text,
    fontSize: 14,
    fontFamily: 'Tajawal-Medium',
    textAlign: 'right',
  },
  playingText: {
    color: colors.primary,
  },
  metaRow: {
    flexDirection: 'row-reverse',
    gap: 8,
    marginTop: 4,
    alignItems: 'center',
  },
  typeText: {
    color: colors.textMuted,
    fontSize: 10,
    backgroundColor: '#333',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontFamily: 'Tajawal-Regular',
  },
  waitingText: {
    color: '#fbbf24',
    fontSize: 10,
    fontFamily: 'Tajawal-Regular',
  },
  actions: {
    flexDirection: 'row-reverse',
    gap: 8,
    alignItems: 'center',
  },
  actionBtn: {
    padding: 4,
  },
  playingIndicator: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 16,
    gap: 2,
  },
  bar: {
    width: 3,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  bar1: { height: 12 },
  bar2: { height: 16 },
  bar3: { height: 8 },
});
