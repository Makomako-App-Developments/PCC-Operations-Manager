import { Feather } from "@expo/vector-icons";
import { useListAssets } from "@workspace/api-client-react";
import * as Location from "expo-location";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getLastAssetId } from "@/lib/lastAsset";
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
import { AssetMap } from "@/components/AssetMap";

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

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export default function AssetsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [mapView, setMapView] = useState(false);
  const [nearbySort, setNearbySort] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const isMounted = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!isMounted.current) {
        isMounted.current = true;
        return;
      }
      const id = getLastAssetId();
      if (id) {
        router.push(`/asset/${id}` as any);
      }
    }, [router]),
  );

  // Request location when switching to map view
  useEffect(() => {
    if (!mapView) return;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setUserLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        }
      } catch {}
    })();
  }, [mapView]);

  const { data, isLoading, refetch, isRefetching } = useListAssets({
    limit: 2000,
    isActive: true,
  });

  const assets = data?.data ?? [];

  // Filter by name, suburb, or street address
  const filtered = useMemo(() => {
    let list = assets;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.suburb ?? "").toLowerCase().includes(q) ||
          ((a as any).streetAddress ?? "").toLowerCase().includes(q),
      );
    }
    if (nearbySort && userLocation) {
      list = [...list].sort((a, b) => {
        const da = a.lat && a.lng ? haversineKm(userLocation.lat, userLocation.lng, a.lat, a.lng) : Infinity;
        const db = b.lat && b.lng ? haversineKm(userLocation.lat, userLocation.lng, b.lat, b.lng) : Infinity;
        return da - db;
      });
    }
    return list;
  }, [assets, search, nearbySort, userLocation]);

  // Leaflet map HTML — mirrors audits.tsx pattern
  const mapHtml = useMemo(() => {
    const center = userLocation
      ? [userLocation.lat, userLocation.lng]
      : [-41.1342, 174.8492]; // Porirua fallback

    const mapAssets = assets
      .filter((a) => a.lat && a.lng)
      .map((a) => ({
        id: a.id,
        name: a.name ?? "",
        desc: (a as any).description ?? "",
        lat: a.lat,
        lng: a.lng,
      }));

    const userMarker = userLocation
      ? `L.circleMarker([${userLocation.lat},${userLocation.lng}],{radius:8,color:"#fff",fillColor:"#0f2a36",fillOpacity:1,weight:2}).bindPopup('<b style="font-family:sans-serif">You are here</b>').addTo(map);`
      : "";

    return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
html,body,#map{margin:0;padding:0;height:100%;width:100%;}
.open-btn{margin-top:8px;padding:7px 16px;background:#00AECD;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;width:100%;}
.open-btn:active{background:#0095b3;}
.popup-name{font-weight:600;font-size:14px;font-family:sans-serif;display:block;margin-bottom:2px;}
.popup-desc{font-size:12px;font-family:sans-serif;color:#6b7280;display:block;margin-bottom:4px;}
</style>
</head><body><div id="map"></div><script>
var _assets=${JSON.stringify(mapAssets).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029')};
function _esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function _openAsset(idx){
  var a=_assets[idx];
  var msg=JSON.stringify({type:'openAsset',id:a.id,name:a.name});
  try{window.ReactNativeWebView.postMessage(msg);}
  catch(e){window.parent.postMessage({type:'openAsset',id:a.id,name:a.name},'*');}
}
var map=L.map('map',{zoomControl:true,attributionControl:false}).setView([${center[0]},${center[1]}],14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
_assets.forEach(function(a,i){
  var desc=a.desc?'<span class="popup-desc">'+_esc(a.desc)+'</span>':'';
  var popup='<span class="popup-name">'+_esc(a.name)+'</span>'+desc+'<button class="open-btn" onclick="_openAsset('+i+')">View asset</button>';
  L.circleMarker([a.lat,a.lng],{radius:7,color:"#00AECD",fillColor:"#00AECD",fillOpacity:0.9,weight:1.5})
    .bindPopup(popup,{maxWidth:220}).addTo(map);
});
${userMarker}
</script></body></html>`;
  }, [userLocation, assets]);

  const handleOpenAsset = useCallback((asset: { id: string; name: string }) => {
    router.push(`/asset/${asset.id}` as any);
  }, [router]);

  const topPad = insets.top;
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 84 : 84);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
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
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>Assets</Text>
          {/* List / Map toggle */}
          <View style={[styles.viewToggle, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <TouchableOpacity
              onPress={() => setMapView(false)}
              style={[styles.toggleBtn, !mapView && { backgroundColor: "#00AECD" }]}
              activeOpacity={0.8}
            >
              <Feather name="list" size={16} color={!mapView ? "#fff" : colors.mutedForeground} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setMapView(true)}
              style={[styles.toggleBtn, mapView && { backgroundColor: "#00AECD" }]}
              activeOpacity={0.8}
            >
              <Feather name="map" size={16} color={mapView ? "#fff" : colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search bar (list mode only) */}
        {!mapView && (
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
              placeholder="Search by name, suburb or address…"
              placeholderTextColor={colors.mutedForeground}
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>
        )}

        {/* Nearby chip (list mode, location available) */}
        {!mapView && userLocation && (
          <TouchableOpacity
            onPress={() => setNearbySort((v) => !v)}
            activeOpacity={0.75}
            style={[
              styles.nearbyChip,
              {
                backgroundColor: nearbySort ? "#00AECD" : colors.background,
                borderColor: nearbySort ? "#00AECD" : colors.border,
              },
            ]}
          >
            <Feather name="navigation" size={12} color={nearbySort ? "#fff" : colors.mutedForeground} />
            <Text style={[styles.nearbyChipText, { color: nearbySort ? "#fff" : colors.mutedForeground }]}>
              Nearby
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Map view */}
      {mapView ? (
        <View style={styles.mapContainer}>
          {isLoading ? (
            <ActivityIndicator style={{ marginTop: 48 }} color="#00AECD" size="large" />
          ) : (
            <AssetMap html={mapHtml} onOpenAsset={handleOpenAsset} />
          )}
        </View>
      ) : (
        /* List view */
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
                {nearbySort && userLocation ? " · sorted by distance" : ""}
              </Text>
              {filtered.map((asset) => {
                const distKm =
                  nearbySort && userLocation && asset.lat && asset.lng
                    ? haversineKm(userLocation.lat, userLocation.lng, asset.lat, asset.lng)
                    : null;

                return (
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
                      <View style={styles.cardRight}>
                        {distKm !== null && (
                          <View style={[styles.distBadge, { backgroundColor: "#e0f7fb" }]}>
                            <Feather name="navigation" size={10} color="#00AECD" />
                            <Text style={styles.distText}>{fmtDistance(distKm)}</Text>
                          </View>
                        )}
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
                );
              })}
            </>
          )}
        </ScrollView>
      )}
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
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 26,
  },
  viewToggle: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
  },
  toggleBtn: {
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
    width: 38,
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
  nearbyChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  nearbyChipText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  mapContainer: { flex: 1 },
  map: { flex: 1 },
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
  cardRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  distBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  distText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: "#00AECD",
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
