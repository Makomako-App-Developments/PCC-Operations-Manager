import { Feather } from "@expo/vector-icons";
import { useGetAsset } from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BoundaryMap } from "@/components/BoundaryMap";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";

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

const STANDARD_COLOR: Record<string, string> = {
  high: "#22c55e",
  medium: "#f59e0b",
  low: "#94a3b8",
};

const PRIVILEGED_ROLES = ["administrator", "manager", "supervisor"];

export default function AssetDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { height: windowHeight } = useWindowDimensions();
  const { user } = useAuth();
  const canAudit = PRIVILEGED_ROLES.includes(user?.role ?? "");

  const { data: asset, isLoading } = useGetAsset(id ?? "", {
    query: { enabled: !!id } as any,
  });

  const topPad = insets.top;
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 16);

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.background,
          ...(Platform.OS === "web" ? { height: windowHeight } : {}),
        },
      ]}
    >
      {/* Nav bar */}
      <View
        style={[
          styles.navBar,
          {
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
            paddingTop: topPad + 8,
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.backBtn,
            { backgroundColor: colors.background, borderRadius: colors.radius },
          ]}
          onPress={() => router.back()}
          activeOpacity={0.75}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.navCenter}>
          <Text style={[styles.navSub, { color: colors.mutedForeground }]}>
            Asset Detail
          </Text>
          <Text
            style={[styles.navTitle, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {asset?.name ?? "Loading…"}
          </Text>
        </View>
        {asset && (
          <View style={styles.standardBadge}>
            <View
              style={[
                styles.standardDot,
                {
                  backgroundColor:
                    STANDARD_COLOR[(asset as any).standard] ??
                    colors.mutedForeground,
                },
              ]}
            />
            <Text
              style={[
                styles.standardText,
                { color: colors.mutedForeground },
              ]}
            >
              {(asset as any).standard}
            </Text>
          </View>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator
          style={{ marginTop: 60 }}
          color={colors.primary}
          size="large"
        />
      ) : !asset ? (
        <View style={styles.centered}>
          <Feather name="alert-circle" size={32} color={colors.mutedForeground} />
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
            Asset not found
          </Text>
        </View>
      ) : (
        <>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ padding: 16, paddingBottom: canAudit ? bottomPad + 96 : bottomPad + 32 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Info grid */}
          <View style={styles.infoGrid}>
            {/* Description — full width */}
            {(asset as any).description ? (
              <View
                style={[
                  styles.infoTile,
                  styles.infoTileWide,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    borderRadius: colors.radius,
                  },
                ]}
              >
                <View style={styles.infoTileHeader}>
                  <Feather name="info" size={13} color={colors.primary} />
                  <Text
                    style={[
                      styles.infoTileLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Description
                  </Text>
                </View>
                <Text
                  style={[styles.infoTileValue, { color: colors.foreground }]}
                >
                  {(asset as any).description}
                </Text>
              </View>
            ) : null}

            {/* Garden Type */}
            <View
              style={[
                styles.infoTile,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderRadius: colors.radius,
                },
              ]}
            >
              <View style={styles.infoTileHeader}>
                <Feather name="tag" size={13} color={colors.primary} />
                <Text
                  style={[
                    styles.infoTileLabel,
                    { color: colors.mutedForeground },
                  ]}
                >
                  Garden Type
                </Text>
              </View>
              <Text
                style={[styles.infoTileValue, { color: colors.foreground }]}
              >
                {GARDEN_TYPE_LABEL[(asset as any).gardenType] ??
                  (asset as any).gardenType}
              </Text>
            </View>

            {/* Specification */}
            <View
              style={[
                styles.infoTile,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderRadius: colors.radius,
                },
              ]}
            >
              <View style={styles.infoTileHeader}>
                <Feather name="book-open" size={13} color={colors.primary} />
                <Text
                  style={[
                    styles.infoTileLabel,
                    { color: colors.mutedForeground },
                  ]}
                >
                  Specification
                </Text>
              </View>
              <Text
                style={[styles.infoTileValue, { color: colors.foreground }]}
              >
                {(asset as any).standard
                  ? (asset as any).standard.charAt(0).toUpperCase() +
                    (asset as any).standard.slice(1)
                  : "—"}
              </Text>
            </View>

            {/* Suburb */}
            {(asset as any).suburb ? (
              <View
                style={[
                  styles.infoTile,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    borderRadius: colors.radius,
                  },
                ]}
              >
                <View style={styles.infoTileHeader}>
                  <Feather name="map-pin" size={13} color={colors.primary} />
                  <Text
                    style={[
                      styles.infoTileLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Suburb
                  </Text>
                </View>
                <Text
                  style={[styles.infoTileValue, { color: colors.foreground }]}
                >
                  {(asset as any).suburb}
                </Text>
              </View>
            ) : null}

            {/* Service Time */}
            <View
              style={[
                styles.infoTile,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderRadius: colors.radius,
                },
              ]}
            >
              <View style={styles.infoTileHeader}>
                <Feather name="clock" size={13} color={colors.primary} />
                <Text
                  style={[
                    styles.infoTileLabel,
                    { color: colors.mutedForeground },
                  ]}
                >
                  Service Time
                </Text>
              </View>
              <Text
                style={[styles.infoTileValue, { color: colors.foreground }]}
              >
                {(asset as any).serviceTimeMins != null
                  ? `${(asset as any).serviceTimeMins} min`
                  : "—"}
              </Text>
            </View>
          </View>

          {/* Garden Boundary Map */}
          {((asset as any).boundary || (asset as any).lat) && (
            <View
              style={[
                styles.mapSection,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderRadius: colors.radius,
                  overflow: "hidden",
                },
              ]}
            >
              <View style={styles.sectionHeader}>
                <Feather name="map" size={16} color={colors.primary} />
                <Text
                  style={[styles.sectionTitle, { color: colors.foreground }]}
                >
                  Garden Boundary
                </Text>
              </View>
              <BoundaryMap
                boundary={(asset as any).boundary}
                lat={(asset as any).lat}
                lng={(asset as any).lng}
                color={colors.primary}
                height={260}
              />
            </View>
          )}
        </ScrollView>

        {canAudit && (
          <View
            style={[
              styles.auditFooter,
              {
                backgroundColor: colors.card,
                borderTopColor: colors.border,
                paddingBottom: insets.bottom + (Platform.OS === "web" ? 16 : 8),
              },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.auditBtn,
                { backgroundColor: colors.primary, borderRadius: colors.radius },
              ]}
              activeOpacity={0.8}
              onPress={() =>
                router.push(
                  `/(tabs)/audits?startAssetId=${encodeURIComponent(id ?? "")}&startAssetName=${encodeURIComponent((asset as any)?.name ?? "")}` as any,
                )
              }
            >
              <Feather name="check-square" size={18} color="#fff" />
              <Text style={styles.auditBtnText}>Start Audit</Text>
            </TouchableOpacity>
          </View>
        )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  navCenter: { flex: 1 },
  navSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  navTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    marginTop: 1,
  },
  standardBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
  },
  standardDot: { width: 7, height: 7, borderRadius: 4 },
  standardText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    textTransform: "capitalize",
  },
  scroll: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12,
  },
  infoTile: {
    borderWidth: 1,
    padding: 12,
    minWidth: "45%",
    flex: 1,
  },
  infoTileWide: {
    width: "100%",
    flex: undefined,
    minWidth: "100%",
  },
  infoTileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 6,
  },
  infoTileLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  infoTileValue: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  mapSection: {
    borderWidth: 1,
    padding: 0,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  auditFooter: {
    padding: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  auditBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  auditBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#fff",
  },
});
