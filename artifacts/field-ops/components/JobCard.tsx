import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Alert, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { StatusBadge } from "./StatusBadge";

interface JobCardProps {
  id: string;
  assetName: string;
  assetDesc?: string | null;
  gardenType: string;
  suburb?: string | null;
  streetAddress?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  serviceTimeMins: number;
  status: string;
  scheduledDate: string;
  isAllTeams?: boolean;
  jobType?: string | null;
  geoSeq?: number;
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

function openMaps(lat?: number | string | null, lng?: number | string | null, label?: string) {
  const latN = lat != null ? Number(lat) : null;
  const lngN = lng != null ? Number(lng) : null;
  const hasCoords = latN != null && !isNaN(latN) && lngN != null && !isNaN(lngN);
  const encodedLabel = encodeURIComponent(label ?? "Garden Site");

  if (Platform.OS === "web") {
    const url = hasCoords
      ? `https://www.google.com/maps/dir/?api=1&destination=${latN},${lngN}`
      : `https://www.google.com/maps/search/${encodedLabel}`;
    window.open(url, "_blank");
    return;
  }

  if (Platform.OS === "ios") {
    // Try Apple Maps first, fall back to Google Maps
    const appleUrl = hasCoords
      ? `maps://?daddr=${latN},${lngN}&q=${encodedLabel}`
      : `maps://?q=${encodedLabel}`;
    const googleUrl = hasCoords
      ? `comgooglemaps://?daddr=${latN},${lngN}&directionsmode=driving`
      : `comgooglemaps://?q=${encodedLabel}`;
    const googleWebUrl = hasCoords
      ? `https://www.google.com/maps/dir/?api=1&destination=${latN},${lngN}`
      : `https://www.google.com/maps/search/${encodedLabel}`;

    Linking.canOpenURL(appleUrl).then(canApple => {
      if (canApple) {
        Linking.openURL(appleUrl);
      } else {
        Linking.canOpenURL(googleUrl).then(canGoogle => {
          Linking.openURL(canGoogle ? googleUrl : googleWebUrl);
        });
      }
    });
    return;
  }

  // Android — prefer Google Maps app, fall back to browser
  const googleUrl = hasCoords
    ? `geo:${latN},${lngN}?q=${latN},${lngN}(${encodedLabel})`
    : `geo:0,0?q=${encodedLabel}`;
  const googleWebUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${latN},${lngN}`
    : `https://www.google.com/maps/search/${encodedLabel}`;

  Linking.canOpenURL(googleUrl).then(can => {
    Linking.openURL(can ? googleUrl : googleWebUrl);
  });
}

export function JobCard({
  id,
  assetName,
  assetDesc,
  gardenType,
  suburb,
  streetAddress,
  lat,
  lng,
  serviceTimeMins,
  status,
  isAllTeams,
  jobType,
  geoSeq,
}: JobCardProps) {
  const colors = useColors();
  const router = useRouter();

  const hrs = Math.floor(serviceTimeMins / 60);
  const mins = serviceTimeMins % 60;
  const timeLabel =
    hrs > 0 ? `${hrs}h ${mins > 0 ? `${mins}m` : ""}`.trim() : `${mins}m`;

  const hasCoords = lat != null && lng != null && !isNaN(Number(lat)) && !isNaN(Number(lng));
  const hasAddress = !!streetAddress;
  const canNavigate = hasCoords || hasAddress;

  const handleNavigate = (e: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
    if (!canNavigate) {
      Alert.alert("No location data", "This asset has no coordinates or address saved.");
      return;
    }
    openMaps(lat, lng, [assetName, suburb].filter(Boolean).join(", "));
  };

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() =>
        router.push(jobType === "unscheduled" ? `/reactive-job/${id}` : `/job/${id}`)
      }
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
        {geoSeq != null && (
          <View style={[styles.seqBadge, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Text style={[styles.seqText, { color: colors.mutedForeground }]}>{geoSeq}</Text>
          </View>
        )}
        <View style={styles.titleGroup}>
          <Text
            style={[styles.assetName, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {assetName}
          </Text>
          {assetDesc ? (
            <Text style={[styles.ref, { color: colors.mutedForeground }]} numberOfLines={1}>
              {assetDesc}
            </Text>
          ) : null}
        </View>
        <StatusBadge status={status as Parameters<typeof StatusBadge>[0]["status"]} small />
      </View>

      {isAllTeams && (
        <View style={[styles.allTeamsBadge, { backgroundColor: "#00AECD18", borderColor: "#00AECD40" }]}>
          <Feather name="users" size={10} color="#00AECD" />
          <Text style={[styles.allTeamsText, { color: "#00AECD" }]}>All Teams Job</Text>
        </View>
      )}
      {jobType === "mulching" && (
        <View style={[styles.allTeamsBadge, { backgroundColor: "#78350f18", borderColor: "#92400e40" }]}>
          <Feather name="layers" size={10} color="#92400e" />
          <Text style={[styles.allTeamsText, { color: "#92400e" }]}>Mulching</Text>
        </View>
      )}

      <View style={styles.footer}>
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

        <TouchableOpacity
          style={[
            styles.navBtn,
            {
              borderColor: canNavigate ? colors.primary + "50" : colors.border,
              backgroundColor: canNavigate ? colors.primary + "12" : colors.background,
              borderRadius: colors.radius / 1.5,
            },
          ]}
          onPress={handleNavigate}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="navigation" size={13} color={canNavigate ? colors.primary : colors.mutedForeground} />
          <Text style={[styles.navBtnText, { color: canNavigate ? colors.primary : colors.mutedForeground }]}>
            Navigate
          </Text>
        </TouchableOpacity>
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
  seqBadge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  seqText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    lineHeight: 12,
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
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  meta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    flex: 1,
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
  navBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderWidth: 1,
    flexShrink: 0,
  },
  navBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
});
