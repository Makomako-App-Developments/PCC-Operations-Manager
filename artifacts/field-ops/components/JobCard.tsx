import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { StatusBadge } from "./StatusBadge";

interface JobCardProps {
  id: string;
  assetName: string;
  assetRef: string;
  gardenType: string;
  suburb?: string | null;
  serviceTimeMins: number;
  status: string;
  scheduledDate: string;
  isAllTeams?: boolean;
}

const GARDEN_TYPE_LABEL: Record<string, string> = {
  annuals: "Annuals",
  roses_perennials: "Roses & Perennials",
  ornamental: "Ornamental",
  amenity: "Amenity",
  rain_garden: "Rain Garden",
  reveg: "Revegetation",
  bush: "Bush",
  tree_planter_pits: "Tree Planter Pits",
  hedge: "Hedge",
};

export function JobCard({
  id,
  assetName,
  assetRef,
  gardenType,
  suburb,
  serviceTimeMins,
  status,
  isAllTeams,
}: JobCardProps) {
  const colors = useColors();
  const router = useRouter();

  const hrs = Math.floor(serviceTimeMins / 60);
  const mins = serviceTimeMins % 60;
  const timeLabel =
    hrs > 0 ? `${hrs}h ${mins > 0 ? `${mins}m` : ""}`.trim() : `${mins}m`;

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => router.push(`/job/${id}`)}
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <Text
            style={[styles.assetName, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {assetName}
          </Text>
          <Text style={[styles.ref, { color: colors.mutedForeground }]}>
            {assetRef}
          </Text>
        </View>
        <StatusBadge status={status as Parameters<typeof StatusBadge>[0]["status"]} small />
      </View>

      {isAllTeams && (
        <View style={[styles.allTeamsBadge, { backgroundColor: "#00AECD18", borderColor: "#00AECD40" }]}>
          <Feather name="users" size={10} color="#00AECD" />
          <Text style={[styles.allTeamsText, { color: "#00AECD" }]}>All Teams Job</Text>
        </View>
      )}

      <View style={styles.meta}>
        {suburb ? (
          <View style={styles.metaItem}>
            <Feather name="map-pin" size={12} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
              {suburb}
            </Text>
          </View>
        ) : null}
        <View style={styles.metaItem}>
          <Feather name="layers" size={12} color={colors.mutedForeground} />
          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
            {GARDEN_TYPE_LABEL[gardenType] ?? gardenType}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Feather name="clock" size={12} color={colors.primary} />
          <Text style={[styles.metaText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
            {timeLabel}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },
  titleGroup: {
    flex: 1,
  },
  assetName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    marginBottom: 2,
  },
  ref: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  meta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  allTeamsBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginBottom: 8,
  },
  allTeamsText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
});
