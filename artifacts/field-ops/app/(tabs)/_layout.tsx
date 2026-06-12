import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { getApiUrl } from "@/lib/api";

const PRIVILEGED_ROLES = ["administrator", "manager", "supervisor"];

function useAuditBadge(token: string | null, isPrivileged: boolean) {
  return useQuery<{ outstanding: number }>({
    queryKey: ["audit-quota-badge"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/audit-quota/badge"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { outstanding: 0 };
      return res.json();
    },
    enabled: isPrivileged && !!token,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

function NativeTabLayout({
  isPrivileged,
  isManager,
  auditBadge,
}: {
  isPrivileged: boolean;
  isManager: boolean;
  auditBadge: number;
}) {
  const { Icon, Label, Badge, NativeTabs } = require("expo-router/unstable-native-tabs") as typeof import("expo-router/unstable-native-tabs");
  return (
    <NativeTabs>
      {!isManager && (
        <NativeTabs.Trigger name="index">
          <Icon sf={{ default: "house", selected: "house.fill" }} />
          <Label>Today</Label>
        </NativeTabs.Trigger>
      )}
      <NativeTabs.Trigger name="spec">
        <Icon sf={{ default: "doc.text", selected: "doc.text.fill" }} />
        <Label>Spec</Label>
      </NativeTabs.Trigger>
      {isPrivileged && (
        <NativeTabs.Trigger name="audits">
          <Icon sf={{ default: "checkmark.seal", selected: "checkmark.seal.fill" }} />
          <Label>Audits</Label>
          <Badge hidden={auditBadge === 0}>{String(auditBadge)}</Badge>
        </NativeTabs.Trigger>
      )}
      {isPrivileged && (
        <NativeTabs.Trigger name="programmes">
          <Icon sf={{ default: "calendar", selected: "calendar.fill" }} />
          <Label>Schedule</Label>
        </NativeTabs.Trigger>
      )}
      {isPrivileged && (
        <NativeTabs.Trigger name="assets">
          <Icon sf={{ default: "map", selected: "map.fill" }} />
          <Label>Assets</Label>
        </NativeTabs.Trigger>
      )}
      {!isManager && (
        <NativeTabs.Trigger name="report">
          <Icon sf={{ default: "exclamationmark.circle", selected: "exclamationmark.circle.fill" }} />
          <Label>Report</Label>
        </NativeTabs.Trigger>
      )}
      <NativeTabs.Trigger name="me">
        <Icon sf={{ default: "person", selected: "person.fill" }} />
        <Label>Me</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout({
  isPrivileged,
  isManager,
  auditBadge,
}: {
  isPrivileged: boolean;
  isManager: boolean;
  auditBadge: number;
}) {
  const { Tabs } = require("expo-router") as typeof import("expo-router");
  const { BlurView } = require("expo-blur") as typeof import("expo-blur");
  const { SymbolView } = require("expo-symbols") as typeof import("expo-symbols");

  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 56 + insets.bottom, paddingBottom: insets.bottom } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={isManager ? { href: null } : {
          title: "Today",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="house" tintColor={color} size={24} />
            ) : (
              <Feather name="home" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="assets"
        options={isPrivileged ? {
          title: "Assets",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="map" tintColor={color} size={24} />
            ) : (
              <Feather name="map" size={22} color={color} />
            ),
        } : { href: null }}
      />
      <Tabs.Screen
        name="spec"
        options={{
          title: "Spec",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="doc.text" tintColor={color} size={24} />
            ) : (
              <Feather name="file-text" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="audits"
        options={isPrivileged ? {
          title: "Audits",
          tabBarBadge: auditBadge > 0 ? auditBadge : undefined,
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="checkmark.seal" tintColor={color} size={24} />
            ) : (
              <Feather name="check-square" size={22} color={color} />
            ),
        } : { href: null }}
      />
      <Tabs.Screen
        name="programmes"
        options={isPrivileged ? {
          title: "Schedule",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="calendar" tintColor={color} size={24} />
            ) : (
              <Feather name="calendar" size={22} color={color} />
            ),
        } : { href: null }}
      />
      <Tabs.Screen
        name="report"
        options={isManager ? { href: null } : {
          title: "Report",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="exclamationmark.circle" tintColor={color} size={24} />
            ) : (
              <Feather name="alert-circle" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: "Me",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="person" tintColor={color} size={24} />
            ) : (
              <Feather name="user" size={22} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  const { user, token } = useAuth();
  const isPrivileged = PRIVILEGED_ROLES.includes(user?.role ?? "");
  const isManager = user?.role === "manager";

  const { data: badgeData } = useAuditBadge(token, isPrivileged);
  const auditBadge = badgeData?.outstanding ?? 0;

  if (Platform.OS !== "web") {
    const { isLiquidGlassAvailable } = require("expo-glass-effect") as typeof import("expo-glass-effect");
    if (isLiquidGlassAvailable()) {
      return <NativeTabLayout isPrivileged={isPrivileged} isManager={isManager} auditBadge={auditBadge} />;
    }
  }
  return <ClassicTabLayout isPrivileged={isPrivileged} isManager={isManager} auditBadge={auditBadge} />;
}
