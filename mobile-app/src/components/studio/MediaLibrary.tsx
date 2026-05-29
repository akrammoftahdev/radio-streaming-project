import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, PermissionsAndroid } from 'react-native';
import { colors } from '../../theme/colors';
import { Plus, Play, Trash2, Music2 } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';

export type MediaType = 'BACKGROUND' | 'SONG' | 'BREAK' | 'AD';
export type MediaTab = 'background' | 'songs' | 'breaks' | 'ads';

export interface LocalMediaFile {
  id: string;
  name: string;
  uri: string;
  mediaType: MediaType;
}

interface MediaLibraryProps {
  files: LocalMediaFile[];
  onAddFile: (file: LocalMediaFile) => void;
  onRemoveFile: (id: string) => void;
  onEnqueue: (file: LocalMediaFile) => void;
  onSetBackground?: (file: LocalMediaFile) => void;
  activeBgId?: string | null;
}

const TAB_LABELS: Record<MediaTab, string> = {
  background: 'خلفيات',
  songs: 'أغاني',
  breaks: 'فواصل',
  ads: 'إعلانات',
};

const TAB_TO_MEDIA_TYPE: Record<MediaTab, MediaType> = {
  background: 'BACKGROUND',
  songs: 'SONG',
  breaks: 'BREAK',
  ads: 'AD',
};

export function MediaLibrary({
  files,
  onAddFile,
  onRemoveFile,
  onEnqueue,
  onSetBackground,
  activeBgId,
}: MediaLibraryProps) {
  const [activeTab, setActiveTab] = useState<MediaTab>('background');

  const handlePickFile = async () => {
    try {
      // Android needs a one-time storage permission — iOS document picker handles itself
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
          {
            title: 'إذن الوصول للملفات',
            message: 'يحتاج التطبيق للوصول إلى ملفاتك الصوتية',
            buttonPositive: 'سماح',
            buttonNegative: 'رفض',
          }
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) return;
      }
      // iOS: system document picker handles its own security (no permission needed)
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const newFile: LocalMediaFile = {
          id: Math.random().toString(36).substr(2, 9),
          name: asset.name,
          uri: asset.uri,
          mediaType: TAB_TO_MEDIA_TYPE[activeTab],
        };
        onAddFile(newFile);
      }
    } catch (err) {
      console.log('Error picking document', err);
    }
  };

  const filteredFiles = files.filter(
    (f) => f.mediaType === TAB_TO_MEDIA_TYPE[activeTab]
  );

  return (
    <View style={styles.container}>
      {/* Section title */}
      <Text style={styles.sectionTitle}>📂 مكتبة الميديا</Text>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        {(Object.keys(TAB_LABELS) as MediaTab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {TAB_LABELS[tab]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Add file button */}
      <TouchableOpacity style={styles.addButton} onPress={handlePickFile}>
        <Plus size={16} color={colors.text} />
        <Text style={styles.addButtonText}>إضافة من الجهاز</Text>
      </TouchableOpacity>

      {/* File list */}
      <ScrollView style={styles.list} nestedScrollEnabled>
        {filteredFiles.length === 0 ? (
          <Text style={styles.emptyText}>لا توجد ملفات في هذه الفئة</Text>
        ) : (
          filteredFiles.map((f) => {
            const isActiveBg = f.id === activeBgId;
            return (
              <View key={f.id} style={[styles.fileRow, isActiveBg && styles.activeRow]}>
                <Music2
                  size={16}
                  color={isActiveBg ? colors.primary : colors.textMuted}
                  style={{ flexShrink: 0 }}
                />
                <Text
                  style={[styles.fileName, isActiveBg && { color: colors.primary }]}
                  numberOfLines={1}
                >
                  {f.name}
                </Text>
                <View style={styles.actions}>
                  {activeTab === 'background' && onSetBackground ? (
                    <TouchableOpacity
                      onPress={() => onSetBackground(f)}
                      style={styles.actionBtn}
                    >
                      <Text style={[styles.bgBtnText, isActiveBg && styles.bgBtnActive]}>
                        {isActiveBg ? '✔ خلفية' : 'تشغيل'}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity onPress={() => onEnqueue(f)} style={styles.actionBtn}>
                      <Play size={18} color={colors.primary} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => onRemoveFile(f.id)} style={styles.actionBtn}>
                    <Trash2 size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: 'Tajawal-Bold',
    fontSize: 15,
    textAlign: 'right',
    marginBottom: 10,
  },
  tabContainer: {
    flexDirection: 'row-reverse',
    backgroundColor: '#0a0a0a',
    borderRadius: 10,
    padding: 3,
    marginBottom: 10,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: colors.primary,
  },
  tabText: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: 'Tajawal-Medium',
  },
  activeTabText: {
    color: '#000',
    fontFamily: 'Tajawal-Bold',
  },
  addButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    backgroundColor: '#1f1f1f',
    borderRadius: 8,
    gap: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#333',
    borderStyle: 'dashed',
  },
  addButtonText: {
    color: colors.text,
    fontSize: 13,
    fontFamily: 'Tajawal-Medium',
  },
  list: {
    maxHeight: 220,
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 20,
    fontFamily: 'Tajawal-Regular',
    fontSize: 13,
  },
  fileRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#1f1f1f',
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
    gap: 8,
  },
  activeRow: {
    backgroundColor: 'rgba(217,119,6,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(217,119,6,0.3)',
  },
  fileName: {
    color: colors.text,
    fontSize: 13,
    flex: 1,
    fontFamily: 'Tajawal-Regular',
    textAlign: 'right',
  },
  actions: {
    flexDirection: 'row-reverse',
    gap: 8,
    alignItems: 'center',
  },
  actionBtn: {
    padding: 4,
  },
  bgBtnText: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: 'Tajawal-Medium',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  bgBtnActive: {
    color: colors.primary,
    borderColor: colors.primary,
  },
});
