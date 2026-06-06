import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";

const PRIVILEGED_ROLES = ["administrator", "manager", "supervisor"];

export default function TabLayout() {
  const { user } = useAuth();
  const isPrivileged = PRIVILEGED_ROLES.includes(user?.role ?? "");
  const isManager = user?.role === "manager";

  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom,
        },
        tabBarBackground: () => (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={isManager ? { href: null } : {
          title: "Today",
          tabBarIcon: ({ color }) => <Feather name="home" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="assets"
        options={isPrivileged ? {
          title: "Assets",
          tabBarIcon: ({ color }) => <Feather name="map" size={22} color={color} />,
        } : { href: null }}
      />
      <Tabs.Screen
        name="spec"
        options={{
          title: "Spec",
          tabBarIcon: ({ color }) => <Feather name="file-text" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="audits"
        options={isPrivileged ? {
          title: "Audits",
          tabBarIcon: ({ color }) => <Feather name="check-square" size={22} color={color} />,
        } : { href: null }}
      />
      <Tabs.Screen
        name="programmes"
        options={isPrivileged ? {
          title: "Programmes",
          tabBarIcon: ({ color }) => <Feather name="activity" size={22} color={color} />,
        } : { href: null }}
      />
      <Tabs.Screen
        name="report"
        options={isManager ? { href: null } : {
          title: "Report",
          tabBarIcon: ({ color }) => <Feather name="alert-circle" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: "Me",
          tabBarIcon: ({ color }) => <Feather name="user" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
