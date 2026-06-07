import { Feather } from "@expo/vector-icons";
import { useListAssets } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
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

export default function AssetsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch, isRefetching } = useListAssets({
    limit: 2000,
    isActive: true,
  });

  const assets = data?.data ?? [];

  const filtered = useMemo(() => {
    if (!search.trim()) return assets;
    const q = search.toLowerCase();
    return assets.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.suburb ?? "").toLowerCase().includes(q),
    );
  }, [assets, search]);

  const topPad = insets.top;
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 84 : 84);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
            paddingTop: topPad + 12,
          },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Assets</Text>
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              borderRadius: colors.radius,
            },
          ]}
        >
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or suburb…"
            placeholderTextColor={colors.mutedForeground}
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomPad }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} size="large" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="layers"
            title={search ? "No assets found" : "No assets yet"}
            subtitle={search ? "Try a different search term." : "Assets will appear here once added."}
          />
        ) : (
          <>
            <Text style={[styles.countLabel, { color: colors.mutedForeground }]}>
              {filtered.length} asset{filtered.length !== 1 ? "s" : ""}
            </Text>
            {filtered.map((asset) => (
              <TouchableOpacity
                key={asset.id}
                activeOpacity={0.75}
                onPress={() => router.push(`/asset/${asset.id}` as any)}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    borderRadius: colors.radius,
                  },
                ]}
              >
                <View style={styles.cardTop}>
                  <View style={styles.cardTitleGroup}>
                    <Text style={[styles.assetName, { color: colors.foreground }]} numberOfLines={1}>
                      {asset.name}
                    </Text>
                  </View>
                  <View style={styles.standardBadge}>
                    <View
                      style={[
                        styles.standardDot,
                        { backgroundColor: STANDARD_COLOR[asset.standard] ?? colors.mutedForeground },
                      ]}
                    />
                    <Text style={[styles.standardText, { color: colors.mutedForeground }]}>
                      {asset.standard}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardMeta}>
                  {asset.suburb ? (
                    <View style={styles.metaItem}>
                      <Feather name="map-pin" size={12} color={colors.mutedForeground} />
                      <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                        {asset.suburb}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.metaItem}>
                    <Feather name="tag" size={12} color={colors.mutedForeground} />
                    <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                      {GARDEN_TYPE_LABEL[asset.gardenType] ?? asset.gardenType}
                    </Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Feather name="clock" size={12} color={colors.primary} />
                    <Text style={[styles.metaText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                      {asset.serviceTimeMins}m
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    marginBottom: 10,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    padding: 0,
  },
  scroll: { flex: 1 },
  countLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    marginBottom: 10,
  },
  card: {
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  cardTitleGroup: { flex: 1 },
  assetName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    marginBottom: 2,
  },
  assetRef: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  standardBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  standardDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  standardText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    textTransform: "capitalize",
  },
  cardMeta: {
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
});
