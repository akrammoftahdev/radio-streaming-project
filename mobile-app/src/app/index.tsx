import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Image } from "react-native";
import { auth, User } from "../core/auth";
import { api } from "../core/api";
import { useRouter } from "expo-router";
import { colors, glassStyles } from "../theme/colors";
import { LogOut, Mic2, Radio } from "lucide-react-native";

interface Station {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
}

export default function DashboardScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const loadData = async () => {
      try {
        const currentUser = await auth.getUser();
        setUser(currentUser);
        
        if (currentUser) {
          const res = await api.get("/mobile/stations");
          setStations(res.data);
        }
      } catch (error) {
        console.error("Failed to load stations:", error);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, []);

  const handleLogout = async () => {
    await auth.logout();
    router.replace("/login");
  };

  const handleStationPress = (stationId: string) => {
    router.push(`/studio/${stationId}`);
  };

  if (!user) return null;

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
      <View style={styles.content}>
        <View style={[glassStyles.container, styles.welcomeCard]}>
          <Text style={styles.welcomeTitle}>Welcome back,</Text>
          <Text style={styles.username}>{user.username}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{user.role.replace("_", " ")}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Your Stations</Text>
        
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : stations.length === 0 ? (
          <Text style={styles.emptyText}>You have no stations assigned.</Text>
        ) : (
          <FlatList
            data={stations}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[glassStyles.container, styles.stationCard]}
                onPress={() => handleStationPress(item.id)}
                activeOpacity={0.8}
              >
                <View style={styles.stationIconContainer}>
                  {item.logoUrl ? (
                    <Image source={{ uri: item.logoUrl }} style={styles.stationLogo} />
                  ) : (
                    <Radio size={28} color={colors.primary} />
                  )}
                </View>
                <View style={styles.stationInfo}>
                  <Text style={styles.stationName}>{item.name}</Text>
                  <Text style={styles.stationSlug}>/{item.slug}</Text>
                </View>
              </TouchableOpacity>
            )}
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        )}
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
    padding: 24,
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
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 40,
    fontSize: 16,
  },
  stationCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    marginBottom: 16,
  },
  stationIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(229, 9, 20, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
    borderWidth: 1,
    borderColor: "rgba(229, 9, 20, 0.3)",
  },
  stationLogo: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  stationInfo: {
    flex: 1,
  },
  stationName: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
  },
  stationSlug: {
    color: colors.textMuted,
    fontSize: 14,
  },
});
