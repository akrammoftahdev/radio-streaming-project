import React, { useEffect, useState, useRef, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image, TextInput, Keyboard, ScrollView } from "react-native";
import { auth, User } from "../core/auth";
import { api } from "../core/api";
import { useRouter } from "expo-router";
import { colors, glassStyles } from "../theme/colors";
import { LogOut, Mic2, Radio, Search, ChevronDown, ChevronUp, Clock, Calendar, Headphones } from "lucide-react-native";
import { RecordingMiniPlayer, RecordingItem } from "../components/studio/RecordingMiniPlayer";

interface Station {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
}

interface ScheduleInfo {
  mode: string; // SCHEDULED | DIRECT_DJ | NO_SCHEDULE
  scheduledStartTime: string | null;
  sessionEndTime: string | null;
  allowConnectMinutesBefore: number;
  gateOpen: boolean;
  programTitle: string | null;
  stationName: string | null;
}

export default function DashboardScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [presenterMode, setPresenterMode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Recordings state
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [recordingsLoading, setRecordingsLoading] = useState(true);

  // Schedule state (for SINGLE_STATION auto-fetch / MULTI_STATION after selection)
  const [schedule, setSchedule] = useState<ScheduleInfo | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);

  // Countdown state
  const [countdown, setCountdown] = useState<string>("");
  const [canEnter, setCanEnter] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Dropdown state (MULTI_STATION only)
  const [searchQuery, setSearchQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const searchInputRef = useRef<TextInput>(null);

  const router = useRouter();

  // ── Load data on mount ──────────────────────────────────────────────────
  useEffect(() => {
    const loadData = async () => {
      try {
        const currentUser = await auth.getUser();
        setUser(currentUser);

        if (currentUser) {
          const res = await api.get("/mobile/stations");
          const data = res.data;
          // New API returns { stations, presenterMode }
          const stationsList = data.stations || data;
          const mode = data.presenterMode || null;
          setStations(stationsList);
          setPresenterMode(mode);

          // Fetch recordings
          try {
            const recRes = await api.get("/mobile/recordings?take=10");
            setRecordings(recRes.data);
          } catch (recErr) {
            console.error("Failed to load recordings:", recErr);
          } finally {
            setRecordingsLoading(false);
          }

          // SINGLE_STATION: auto-fetch schedule for the only station
          if (mode === "SINGLE_STATION" && stationsList.length === 1) {
            setSelectedStationId(stationsList[0].id);
            fetchScheduleForStation(stationsList[0].id);
          }
        }
      } catch (error) {
        console.error("Failed to load stations:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // ── Fetch schedule for a station ──────────────────────────────────────────
  const fetchScheduleForStation = useCallback(async (stationId: string) => {
    setScheduleLoading(true);
    setSchedule(null);
    setCanEnter(false);
    setCountdown("");
    try {
      const res = await api.get(`/mobile/schedule?stationId=${stationId}`);
      setSchedule(res.data);
    } catch (e) {
      console.error("[SCHEDULE] Failed:", e);
      setSchedule({ mode: "NO_SCHEDULE", scheduledStartTime: null, sessionEndTime: null, allowConnectMinutesBefore: 0, gateOpen: false, programTitle: null, stationName: null });
    } finally {
      setScheduleLoading(false);
    }
  }, []);

  // ── Countdown timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);

    if (!schedule || schedule.mode !== "SCHEDULED" || !schedule.scheduledStartTime) {
      setCountdown("");
      setCanEnter(false);
      return;
    }

    const startMs = new Date(schedule.scheduledStartTime).getTime();
    const gateMs = startMs - (schedule.allowConnectMinutesBefore * 60 * 1000);

    const tick = () => {
      const now = Date.now();
      if (now >= gateMs) {
        setCanEnter(true);
        // Still show countdown to start time if gate is open but broadcast hasn't started
        if (now < startMs) {
          const diff = startMs - now;
          setCountdown(formatCountdown(diff));
        } else {
          setCountdown("");
        }
      } else {
        setCanEnter(false);
        const diff = gateMs - now;
        setCountdown(formatCountdown(diff));
      }
    };

    tick(); // run immediately
    countdownRef.current = setInterval(tick, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [schedule]);

  // ── Format countdown ──────────────────────────────────────────────────────
  const formatCountdown = (ms: number): string => {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;

    if (days > 0) {
      return `${days} يوم ${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // ── Format date/time in Arabic Cairo ──────────────────────────────────────
  const formatBroadcastTime = (iso: string): string => {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("ar-EG", {
      timeZone: "Africa/Cairo",
      weekday: "long",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  };

  const formatTimeRange = (start: string, end: string): string => {
    const fmt = (iso: string) => new Intl.DateTimeFormat("ar-EG", {
      timeZone: "Africa/Cairo",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
    return `من ${fmt(start)} إلى ${fmt(end)}`;
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    await auth.logout();
    router.replace("/login");
  };

  const handleStationSelect = (stationId: string) => {
    setIsDropdownOpen(false);
    Keyboard.dismiss();
    setSelectedStationId(stationId);
    fetchScheduleForStation(stationId);
  };

  const handleEnterStudio = () => {
    if (selectedStationId) {
      router.push(`/studio/${selectedStationId}`);
    }
  };

  const handleDirectDjEnter = (radioId: string) => {
    router.push(`/studio/${radioId}`);
  };

  const filteredStations = stations.filter(station =>
    station.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    station.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!user) return null;

  // ── Render helpers ────────────────────────────────────────────────────────

  /** Schedule card — shown for SINGLE_STATION and MULTI_STATION after selection */
  const renderScheduleCard = () => {
    if (scheduleLoading) {
      return (
        <View style={[glassStyles.container, styles.scheduleCard]}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.scheduleLoadingText}>جارٍ تحميل الجدول...</Text>
        </View>
      );
    }

    if (!schedule) return null;

    if (schedule.mode === "NO_SCHEDULE") {
      return (
        <View style={[glassStyles.container, styles.scheduleCard]}>
          <Calendar size={32} color="#666" style={{ marginBottom: 12 }} />
          <Text style={styles.noScheduleTitle}>لا يوجد موعد بث</Text>
          <Text style={styles.noScheduleSubtitle}>
            لا يوجد برنامج مجدول لك على هذه المحطة حالياً
          </Text>
        </View>
      );
    }

    if (schedule.mode === "SCHEDULED" && schedule.scheduledStartTime) {
      const stationName = schedule.stationName;
      const programTitle = schedule.programTitle;

      return (
        <View style={[glassStyles.container, styles.scheduleCard]}>
          {/* Program title */}
          {programTitle && (
            <Text style={styles.programTitle}>{programTitle}</Text>
          )}

          {/* Station name */}
          {stationName && (
            <View style={styles.stationBadge}>
              <Radio size={12} color="#06b6d4" />
              <Text style={styles.stationBadgeText}>{stationName}</Text>
            </View>
          )}

          {/* Time range */}
          {schedule.sessionEndTime && (
            <Text style={styles.timeRange}>
              {formatTimeRange(schedule.scheduledStartTime, schedule.sessionEndTime)}
            </Text>
          )}

          {/* Broadcast date */}
          <Text style={styles.broadcastDate}>
            {formatBroadcastTime(schedule.scheduledStartTime)}
          </Text>

          {/* Status + Countdown */}
          {canEnter ? (
            <View style={styles.gateOpenContainer}>
              <View style={styles.gateOpenBadge}>
                <View style={styles.gateOpenDot} />
                <Text style={styles.gateOpenText}>مسموح لك بالبث الآن</Text>
              </View>
              {countdown ? (
                <Text style={styles.countdownSmall}>يبدأ خلال {countdown}</Text>
              ) : null}
            </View>
          ) : (
            <View style={styles.countdownContainer}>
              <Clock size={18} color="#f59e0b" />
              <Text style={styles.countdownLabel}>يفتح الاستوديو خلال</Text>
              <Text style={styles.countdownText}>{countdown}</Text>
            </View>
          )}

          {/* Enter Studio Button */}
          <TouchableOpacity
            style={[styles.enterBtn, !canEnter && styles.enterBtnDisabled]}
            onPress={handleEnterStudio}
            disabled={!canEnter}
            activeOpacity={0.7}
          >
            <Mic2 size={20} color={canEnter ? "#fff" : "#666"} />
            <Text style={[styles.enterBtnText, !canEnter && styles.enterBtnTextDisabled]}>
              دخول الاستوديو
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    return null;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <Mic2 size={24} color={colors.primary} />
          <Text style={styles.headerText}>EGONAIR</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <LogOut size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
        <View style={[glassStyles.container, styles.welcomeCard]}>
          <Text style={styles.welcomeTitle}>Welcome back,</Text>
          <Text style={styles.username}>{user.username}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{user.role.replace("_", " ")}</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : presenterMode === "DIRECT_DJ" ? (
          /* ── DIRECT_DJ: Radio list, enter anytime ───────────────────── */
          <View>
            <Text style={styles.sectionTitle}>إذاعاتك</Text>
            {stations.length === 0 ? (
              <View style={[glassStyles.container, styles.scheduleCard]}>
                <Headphones size={32} color="#666" style={{ marginBottom: 12 }} />
                <Text style={styles.noScheduleTitle}>لا توجد إذاعات مضافة</Text>
                <Text style={styles.noScheduleSubtitle}>تواصل مع الإدارة لإضافة إذاعة</Text>
              </View>
            ) : (
              stations.map((radio) => (
                <TouchableOpacity
                  key={radio.id}
                  style={[glassStyles.container, styles.radioCard]}
                  onPress={() => handleDirectDjEnter(radio.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.radioInfo}>
                    <View style={styles.radioIconContainer}>
                      <Headphones size={22} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.radioName}>{radio.name}</Text>
                      <Text style={styles.radioSlug}>بدون جدول · بث مباشر</Text>
                    </View>
                  </View>
                  <View style={styles.djEnterBtn}>
                    <Mic2 size={16} color="#fff" />
                    <Text style={styles.djEnterText}>بث</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        ) : presenterMode === "SINGLE_STATION" ? (
          /* ── SINGLE_STATION: Auto schedule, no dropdown ─────────────── */
          <View>
            {renderScheduleCard()}
          </View>
        ) : (
          /* ── MULTI_STATION (or unknown): Station dropdown + schedule ── */
          <View>
            <Text style={styles.sectionTitle}>اختر المحطة</Text>

            {stations.length === 0 ? (
              <Text style={styles.emptyText}>لا توجد محطات مخصصة لك.</Text>
            ) : (
              <View style={styles.dropdownContainer}>
                {/* Search Input Box */}
                <TouchableOpacity
                  style={[glassStyles.container, styles.searchInputContainer]}
                  activeOpacity={1}
                  onPress={() => {
                    setIsDropdownOpen(true);
                    searchInputRef.current?.focus();
                  }}
                >
                  <Search size={20} color={colors.textMuted} style={styles.searchIcon} />
                  <TextInput
                    ref={searchInputRef}
                    style={styles.searchInput}
                    placeholder="ابحث عن محطة..."
                    placeholderTextColor={colors.textMuted}
                    value={searchQuery}
                    onChangeText={(text) => {
                      setSearchQuery(text);
                      setIsDropdownOpen(true);
                    }}
                    onFocus={() => setIsDropdownOpen(true)}
                  />
                  <TouchableOpacity
                    style={styles.chevronBtn}
                    onPress={() => {
                      if (isDropdownOpen) {
                        setIsDropdownOpen(false);
                        Keyboard.dismiss();
                      } else {
                        setIsDropdownOpen(true);
                      }
                    }}
                  >
                    {isDropdownOpen ? (
                      <ChevronUp size={20} color={colors.textMuted} />
                    ) : (
                      <ChevronDown size={20} color={colors.textMuted} />
                    )}
                  </TouchableOpacity>
                </TouchableOpacity>

                {/* Dropdown List — using map() not FlatList to avoid VirtualizedList crash */}
                {isDropdownOpen && (
                  <View style={[glassStyles.container, styles.dropdownList]}>
                    {filteredStations.length === 0 ? (
                      <Text style={styles.noResultsText}>لا توجد نتائج.</Text>
                    ) : (
                      <ScrollView style={{ maxHeight: 300 }} nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
                        {filteredStations.map((item) => (
                          <TouchableOpacity
                            key={item.id}
                            style={[styles.dropdownItem, selectedStationId === item.id && styles.dropdownItemSelected]}
                            onPress={() => handleStationSelect(item.id)}
                            activeOpacity={0.7}
                          >
                            <View style={styles.stationIconContainerSmall}>
                              {item.logoUrl ? (
                                <Image source={{ uri: item.logoUrl }} style={styles.stationLogoSmall} />
                              ) : (
                                <Radio size={20} color={colors.primary} />
                              )}
                            </View>
                            <View style={styles.stationInfo}>
                              <Text style={styles.stationNameSmall}>{item.name}</Text>
                              <Text style={styles.stationSlugSmall}>/{item.slug}</Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* Schedule card appears after station selection */}
            {selectedStationId && renderScheduleCard()}
          </View>
        )}

        {/* ── Previous Recordings ──────────────────────────────────── */}
        <View style={[glassStyles.container, styles.recordingsCard]}>
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  headerTitle: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerText: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "bold",
    marginLeft: 8,
    letterSpacing: 1,
  },
  logoutBtn: {
    padding: 8,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 24,
    paddingBottom: 40,
  },
  recordingsCard: {
    padding: 20,
    marginTop: 20,
  },
  welcomeCard: {
    padding: 24,
    alignItems: "center",
    marginBottom: 30,
  },
  welcomeTitle: {
    fontSize: 16,
    color: colors.textMuted,
  },
  username: {
    fontSize: 32,
    fontWeight: "bold",
    color: colors.text,
    marginTop: 4,
    marginBottom: 16,
  },
  roleBadge: {
    backgroundColor: colors.primaryDark,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  roleText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "600",
  },
  sectionTitle: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 16,
    marginLeft: 4,
    textAlign: "right",
    fontFamily: "Tajawal-Bold",
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 40,
    fontSize: 16,
    fontFamily: "Tajawal-Regular",
  },

  // ── Schedule card ──
  scheduleCard: {
    padding: 24,
    alignItems: "center",
    marginTop: 8,
  },
  scheduleLoadingText: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: "Tajawal-Regular",
    marginTop: 8,
  },
  noScheduleTitle: {
    color: colors.text,
    fontSize: 16,
    fontFamily: "Tajawal-Bold",
    textAlign: "center",
    marginBottom: 6,
  },
  noScheduleSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: "Tajawal-Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  programTitle: {
    color: colors.text,
    fontSize: 18,
    fontFamily: "Tajawal-Bold",
    textAlign: "center",
    marginBottom: 8,
  },
  stationBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(6,182,212,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(6,182,212,0.25)",
    marginBottom: 12,
  },
  stationBadgeText: {
    color: "#06b6d4",
    fontSize: 12,
    fontFamily: "Tajawal-Medium",
  },
  timeRange: {
    color: colors.text,
    fontSize: 15,
    fontFamily: "Tajawal-Medium",
    textAlign: "center",
    marginBottom: 4,
  },
  broadcastDate: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: "Tajawal-Regular",
    textAlign: "center",
    marginBottom: 16,
  },
  gateOpenContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  gateOpenBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(34,197,94,0.1)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.3)",
  },
  gateOpenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22c55e",
  },
  gateOpenText: {
    color: "#22c55e",
    fontSize: 14,
    fontFamily: "Tajawal-Bold",
  },
  countdownSmall: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: "Tajawal-Regular",
    marginTop: 6,
  },
  countdownContainer: {
    alignItems: "center",
    marginBottom: 16,
    gap: 6,
  },
  countdownLabel: {
    color: "#f59e0b",
    fontSize: 13,
    fontFamily: "Tajawal-Medium",
  },
  countdownText: {
    color: "#f59e0b",
    fontSize: 32,
    fontWeight: "bold",
    fontFamily: "Tajawal-Bold",
    letterSpacing: 2,
  },
  enterBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
    width: "100%",
    shadowColor: colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  enterBtnDisabled: {
    backgroundColor: "rgba(255,255,255,0.06)",
    shadowOpacity: 0,
    elevation: 0,
  },
  enterBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Tajawal-Bold",
  },
  enterBtnTextDisabled: {
    color: "#555",
  },

  // ── DIRECT_DJ radio cards ──
  radioCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    marginBottom: 10,
  },
  radioInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 14,
  },
  radioIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(229, 9, 20, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(229, 9, 20, 0.3)",
  },
  radioName: {
    color: colors.text,
    fontSize: 16,
    fontFamily: "Tajawal-Bold",
    textAlign: "right",
  },
  radioSlug: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: "Tajawal-Regular",
    textAlign: "right",
    marginTop: 2,
  },
  djEnterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  djEnterText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Tajawal-Bold",
  },

  // ── MULTI_STATION dropdown ──
  dropdownContainer: {
    position: "relative",
    zIndex: 10,
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    height: 60,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    height: "100%",
    textAlign: "right",
    fontFamily: "Tajawal-Regular",
  },
  chevronBtn: {
    padding: 10,
  },
  dropdownList: {
    marginTop: 8,
    borderRadius: 16,
    overflow: "hidden",
  },
  noResultsText: {
    color: colors.textMuted,
    padding: 20,
    textAlign: "center",
    fontFamily: "Tajawal-Regular",
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  dropdownItemSelected: {
    backgroundColor: "rgba(229, 9, 20, 0.08)",
    borderBottomColor: "rgba(229, 9, 20, 0.15)",
  },
  stationIconContainerSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(229, 9, 20, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
    borderWidth: 1,
    borderColor: "rgba(229, 9, 20, 0.3)",
  },
  stationLogoSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  stationInfo: {
    flex: 1,
  },
  stationNameSmall: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 2,
    textAlign: "right",
    fontFamily: "Tajawal-Bold",
  },
  stationSlugSmall: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: "right",
    fontFamily: "Tajawal-Regular",
  },
});
