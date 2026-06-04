import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";

const ROLE_LABEL: Record<string, string> = {
  manager: "Manager",
  supervisor: "Supervisor",
  team_leader: "Team Leader",
  field_worker: "Field Worker",
};

export default function MeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout, setNotificationsEnabled } = useAuth();

  const [notifEnabled, setNotifEnabled] = useState(
    user?.pushNotificationsEnabled !== false,
  );
  const [notifLoading, setNotifLoading] = useState(false);

  // Sync toggle state whenever the user object changes (e.g. after cold-start
  // once the persisted session loads, or after a server-side preference update)
  React.useEffect(() => {
    setNotifEnabled(user?.pushNotificationsEnabled !== false);
  }, [user?.pushNotificationsEnabled]);

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          await logout();
          router.replace("/login");
        },
      },
    ]);
  };

  const handleNotifToggle = async (value: boolean) => {
    setNotifEnabled(value);
    setNotifLoading(true);
    try {
      await setNotificationsEnabled(value);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      setNotifEnabled(!value);
      Alert.alert("Error", "Could not update notification preference. Please try again.");
    } finally {
      setNotifLoading(false);
    }
  };

  const topPad = insets.top;
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 84 : 84);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomPad }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.profileHeader,
            {
              backgroundColor: colors.navy,
              paddingTop: topPad + 24,
            },
          ]}
        >
          <View
            style={[
              styles.avatar,
              { backgroundColor: colors.primary },
            ]}
          >
            <Text style={styles.avatarText}>{user?.initials ?? "??"}</Text>
          </View>
          <Text style={styles.name}>{user?.name ?? "—"}</Text>
          <Text style={styles.role}>
            {ROLE_LABEL[user?.role ?? ""] ?? user?.role ?? "—"}
          </Text>
        </View>

        <View style={{ padding: 16, gap: 12 }}>
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: colors.radius,
              },
            ]}
          >
            <Text style={[styles.cardTitle, { color: colors.mutedForeground }]}>
              Account
            </Text>
            <View style={styles.infoRow}>
              <Feather name="user" size={16} color={colors.primary} />
              <View>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Name</Text>
                <Text style={[styles.infoValue, { color: colors.foreground }]}>
                  {user?.name ?? "—"}
                </Text>
              </View>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.infoRow}>
              <Feather name="shield" size={16} color={colors.primary} />
              <View>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Role</Text>
                <Text style={[styles.infoValue, { color: colors.foreground }]}>
                  {ROLE_LABEL[user?.role ?? ""] ?? user?.role ?? "—"}
                </Text>
              </View>
            </View>
          </View>

          {["administrator", "manager", "supervisor"].includes(user?.role ?? "") && (
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: colors.radius,
              },
            ]}
          >
            <Text style={[styles.cardTitle, { color: colors.mutedForeground }]}>
              Notifications
            </Text>
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Feather name="bell" size={16} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoValue, { color: colors.foreground }]}>
                    Push notifications
                  </Text>
                  <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>
                    Get notified when jobs are assigned or overdue
                  </Text>
                </View>
              </View>
              <Switch
                value={notifEnabled}
                onValueChange={handleNotifToggle}
                disabled={notifLoading}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
              />
            </View>
          </View>
          )}

          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: colors.radius,
              },
            ]}
          >
            <Text style={[styles.cardTitle, { color: colors.mutedForeground }]}>
              App
            </Text>
            <View style={styles.infoRow}>
              <Feather name="info" size={16} color={colors.primary} />
              <View>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Version</Text>
                <Text style={[styles.infoValue, { color: colors.foreground }]}>1.0.0</Text>
              </View>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.infoRow}>
              <Feather name="server" size={16} color={colors.primary} />
              <View>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Organisation</Text>
                <Text style={[styles.infoValue, { color: colors.foreground }]}>
                  Porirua City Council
                </Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.logoutBtn,
              {
                backgroundColor: "#fee2e2",
                borderRadius: colors.radius,
              },
            ]}
            onPress={handleLogout}
            activeOpacity={0.8}
          >
            <Feather name="log-out" size={18} color="#b91c1c" />
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  profileHeader: {
    alignItems: "center",
    paddingBottom: 32,
    gap: 8,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  avatarText: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: "#fff",
  },
  name: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: "#fff",
  },
  role: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
  },
  card: {
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  cardTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  toggleInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  infoLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  infoValue: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    marginTop: 4,
  },
  logoutText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#b91c1c",
  },
});
