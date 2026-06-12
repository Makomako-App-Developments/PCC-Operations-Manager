import { Feather } from "@expo/vector-icons";
import { useListAssets } from "@workspace/api-client-react";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useLocalSearchParams } from "expo-router";
import React, { useState, useMemo, useEffect, useRef } from "react";
import { AuditMap } from "@/components/AuditMap";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { getApiUrl } from "@/lib/api";

// ─── Weekly Quota Banner ──────────────────────────────────────────────────────

interface QuotaItem {
  id: string;
  assetId: string;
  assetName: string;
  auditType: string;
  completed: boolean;
  suburb: string | null;
}

interface QuotaDetail {
  progress: {
    overall: { done: number; total: number };
    completedWorks: { done: number; total: number };
    outcomesBased: { done: number; total: number };
  };
  items: QuotaItem[];
}

function WeeklyQueueBanner({
  token,
  onStartAudit,
}: {
  token: string;
  onStartAudit: (assetId: string, assetName: string) => void;
}) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(true);

  const { data: quota, isLoading } = useQuery<QuotaDetail>({
    queryKey: ["audit-quota-current"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/audit-quota/current"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load quota");
      return res.json();
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <View style={[bannerStyles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (!quota || quota.progress.overall.total === 0) return null;

  const { done, total } = quota.progress.overall;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const allDone = done >= total;

  // Group pending items by suburb (sorted alphabetically, nulls last)
  const pending = quota.items
    .filter((i) => !i.completed)
    .sort((a, b) => {
      if (!a.suburb && !b.suburb) return a.assetName.localeCompare(b.assetName);
      if (!a.suburb) return 1;
      if (!b.suburb) return -1;
      const s = a.suburb.localeCompare(b.suburb);
      return s !== 0 ? s : a.assetName.localeCompare(b.assetName);
    });

  const suburbGroups: { suburb: string; items: QuotaItem[] }[] = [];
  for (const item of pending) {
    const label = item.suburb ?? "Other";
    const last = suburbGroups[suburbGroups.length - 1];
    if (last && last.suburb === label) {
      last.items.push(item);
    } else {
      suburbGroups.push({ suburb: label, items: [item] });
    }
  }

  return (
    <View style={[bannerStyles.container, { backgroundColor: allDone ? colors.success + "11" : colors.primary + "0d", borderColor: allDone ? colors.success + "44" : colors.primary + "33" }]}>
      <TouchableOpacity
        style={bannerStyles.header}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
      >
        <View style={bannerStyles.headerLeft}>
          <Feather name="calendar" size={14} color={allDone ? colors.success : colors.primary} />
          <Text style={[bannerStyles.title, { color: allDone ? colors.success : colors.primary }]}>
            This Week's Queue
          </Text>
        </View>
        <View style={bannerStyles.headerRight}>
          <View style={[bannerStyles.progressPill, { backgroundColor: allDone ? colors.success + "22" : colors.primary + "22" }]}>
            <Text style={[bannerStyles.progressText, { color: allDone ? colors.success : colors.primary }]}>
              {done} / {total}
            </Text>
          </View>
          <Feather
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            color={colors.mutedForeground}
          />
        </View>
      </TouchableOpacity>

      {/* Progress bar */}
      <View style={[bannerStyles.barTrack, { backgroundColor: allDone ? colors.success + "22" : colors.primary + "22" }]}>
        <View
          style={[
            bannerStyles.barFill,
            { width: `${pct}%` as any, backgroundColor: allDone ? colors.success : colors.primary },
          ]}
        />
      </View>

      {expanded && suburbGroups.length > 0 && (
        <View style={bannerStyles.list}>
          {suburbGroups.map((group) => (
            <View key={group.suburb}>
              <View style={[bannerStyles.suburbHeader, { backgroundColor: colors.primary + "0d", borderTopColor: colors.border }]}>
                <Feather name="map-pin" size={11} color={colors.primary} />
                <Text style={[bannerStyles.suburbLabel, { color: colors.primary }]}>{group.suburb}</Text>
                <Text style={[bannerStyles.suburbCount, { color: colors.mutedForeground }]}>{group.items.length}</Text>
              </View>
              {group.items.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[bannerStyles.item, { borderTopColor: colors.border }]}
                  onPress={() => onStartAudit(item.assetId, item.assetName)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[bannerStyles.itemName, { color: colors.foreground }]} numberOfLines={1}>
                      {item.assetName}
                    </Text>
                    <Text style={[bannerStyles.itemType, { color: item.auditType === "completed-works" ? colors.primary : "#7c3aed" }]}>
                      {item.auditType === "completed-works" ? "Completed Works" : "Outcomes Based"}
                    </Text>
                  </View>
                  <Feather name="navigation" size={18} color={item.auditType === "completed-works" ? colors.primary : "#7c3aed"} />
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      )}

      {expanded && allDone && (
        <View style={bannerStyles.allDoneRow}>
          <Feather name="check-circle" size={14} color={colors.success} />
          <Text style={[bannerStyles.allDoneText, { color: colors.success }]}>
            All audits complete for this week!
          </Text>
        </View>
      )}
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  progressPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  progressText: { fontFamily: "Inter_700Bold", fontSize: 12 },
  barTrack: { height: 4, marginHorizontal: 14, marginBottom: 4, borderRadius: 2, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 2 },
  list: {},
  suburbHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  suburbLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    flex: 1,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  suburbCount: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  itemName: { fontFamily: "Inter_500Medium", fontSize: 13 },
  itemType: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 1 },
  allDoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.06)",
  },
  allDoneText: { fontFamily: "Inter_500Medium", fontSize: 12 },
});

// ─── KPI Config ───────────────────────────────────────────────────────────────

const KPI_SECTIONS = [
  {
    section: "Garden Condition",
    items: [
      { id: "litter",        label: "Litter" },
      { id: "weeds",         label: "Weeds" },
      { id: "plant_pests",   label: "Pest Plants" },
      { id: "mulch",         label: "Mulch" },
      { id: "pruning",       label: "Pruning" },
      { id: "dead_heading",  label: "Dead Heading" },
      { id: "pests_diseases",label: "Pests & Diseases" },
    ],
  },
  {
    section: "Edges & Borders",
    items: [{ id: "edging", label: "Edging" }],
  },
  {
    section: "Plant Support & Protection",
    items: [
      { id: "stakes_ties", label: "Stakes & Ties" },
      { id: "damage",      label: "Damage" },
    ],
  },
];

const ALL_KPI_IDS = KPI_SECTIONS.flatMap((s) => s.items.map((i) => i.id));

type Result = "pass" | "fail" | "na" | "";

interface KpiResponse {
  result: Result;
  notes: string;
}

interface LocalPhoto {
  uri: string;
  mimeType?: string;
  fileName?: string;
}

// ─── Status pill ──────────────────────────────────────────────────────────────

function AuditStatusBadge({ status, score }: { status: string; score?: number | string | null }) {
  const colors = useColors();
  const scoreNum = score != null ? Number(score) : null;
  const bg =
    status === "passed" ? colors.success + "22" :
    status === "failed" ? colors.destructive + "22" :
    colors.muted;
  const fg =
    status === "passed" ? colors.success :
    status === "failed" ? colors.destructive :
    colors.mutedForeground;
  const label =
    status === "passed" ? `Passed${scoreNum != null ? ` · ${scoreNum}%` : ""}` :
    status === "failed" ? `Failed${scoreNum != null ? ` · ${scoreNum}%` : ""}` :
    "Pending";
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

// ─── KPI row ─────────────────────────────────────────────────────────────────

function KpiRow({
  id,
  label,
  response,
  photo,
  onChange,
  onPhotoAdd,
}: {
  id: string;
  label: string;
  response: KpiResponse;
  photo: LocalPhoto | null;
  onChange: (r: Partial<KpiResponse>) => void;
  onPhotoAdd: () => void;
}) {
  const colors = useColors();

  const btnStyle = (val: Result) => ({
    flex: 1,
    paddingVertical: 8,
    borderRadius: colors.radius / 2,
    alignItems: "center" as const,
    backgroundColor:
      response.result === val
        ? val === "pass" ? colors.success
        : val === "fail" ? colors.destructive
        : colors.muted
        : colors.background,
    borderWidth: 1,
    borderColor:
      response.result === val
        ? val === "pass" ? colors.success
        : val === "fail" ? colors.destructive
        : colors.mutedForeground
        : colors.border,
  });
  const btnText = (val: Result) => ({
    fontFamily: "Inter_600SemiBold" as const,
    fontSize: 12,
    color:
      response.result === val
        ? val === "pass" || val === "fail" ? "#fff" : colors.foreground
        : colors.mutedForeground,
  });

  return (
    <View style={[styles.kpiRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.kpiLabel, { color: colors.foreground }]}>{label}</Text>
      <View style={styles.kpiBtns}>
        <TouchableOpacity style={btnStyle("pass")} onPress={() => onChange({ result: "pass" })}>
          <Text style={btnText("pass")}>Pass</Text>
        </TouchableOpacity>
        <TouchableOpacity style={btnStyle("fail")} onPress={() => onChange({ result: "fail" })}>
          <Text style={btnText("fail")}>Fail</Text>
        </TouchableOpacity>
        <TouchableOpacity style={btnStyle("na")} onPress={() => onChange({ result: "na" })}>
          <Text style={btnText("na")}>N/A</Text>
        </TouchableOpacity>
      </View>
      {response.result === "fail" && (
        <View style={styles.kpiFailExtras}>
          <TextInput
            style={[styles.kpiNotes, { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground, borderRadius: colors.radius / 2 }]}
            placeholder="Notes on failure…"
            placeholderTextColor={colors.mutedForeground}
            value={response.notes}
            onChangeText={(v) => onChange({ notes: v })}
            multiline
            textAlignVertical="top"
          />
          {photo ? (
            <View style={styles.photoThumbRow}>
              <Image source={{ uri: photo.uri }} style={styles.photoThumb} />
              <Text style={[styles.photoThumbLabel, { color: colors.success }]}>Photo added</Text>
            </View>
          ) : (
            <TouchableOpacity style={[styles.addPhotoBtn, { borderColor: colors.border, borderRadius: colors.radius / 2 }]} onPress={onPhotoAdd}>
              <Feather name="camera" size={14} color={colors.primary} />
              <Text style={[styles.addPhotoBtnText, { color: colors.primary }]}>Add Photo</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function AuditsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const qc = useQueryClient();

  type View = "list" | "pick" | "conduct" | "done";
  const [view, setView] = useState<View>("list");
  const [assetSearch, setAssetSearch] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<{ id: string; name: string } | null>(null);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, KpiResponse>>({});
  const [photos, setPhotos] = useState<Record<string, LocalPhoto>>({});
  const [submitting, setSubmitting] = useState(false);
  const [doneScore, setDoneScore] = useState<number | null>(null);
  const [openingAuditId, setOpeningAuditId] = useState<string | null>(null);
  const [selectedAssetDetail, setSelectedAssetDetail] = useState<any>(null);

  const { startAssetId, startAssetName } = useLocalSearchParams<{ startAssetId?: string; startAssetName?: string }>();
  const autoStartHandled = useRef(false);

  const bottomPad = insets.bottom + (Platform.OS === "web" ? 84 : 100);

  // ── Location for map ──
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (view !== "pick") return;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setUserLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        }
      } catch {}
    })();
  }, [view]);

  // ── Assets for picker (must be declared before mapHtml useMemo that depends on it) ──
  const { data: assetsData } = useListAssets(
    { limit: 500 },
    { query: { enabled: view === "pick" } as any },
  );

  // ── Audits list ──
  const {
    data: auditsList,
    isLoading: loadingAudits,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["audits"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/audits"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch audits");
      return res.json() as Promise<{ data: any[] }>;
    },
    enabled: !!token && view === "list",
  });

  // ── Leaflet map HTML ──
  const mapHtml = useMemo(() => {
    const center = userLocation
      ? [userLocation.lat, userLocation.lng]
      : [-41.1342, 174.8492]; // Porirua fallback

    const mapAssets = ((assetsData as any)?.data ?? [])
      .filter((a: any) => a.lat && a.lng)
      .map((a: any) => ({ id: a.id, name: a.name ?? "", lat: a.lat, lng: a.lng }));

    const userMarker = userLocation
      ? `L.circleMarker([${userLocation.lat},${userLocation.lng}],{radius:8,color:"#fff",fillColor:"#0f2a36",fillOpacity:1,weight:2}).addTo(map);`
      : "";

    return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
html,body,#map{margin:0;padding:0;height:100%;width:100%;}
.select-btn{margin-top:8px;padding:7px 16px;background:#00AECD;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;width:100%;}
.select-btn:active{background:#0095b3;}
.popup-name{font-weight:600;font-size:14px;font-family:sans-serif;display:block;margin-bottom:2px;}
</style>
</head><body><div id="map"></div><script>
var _assets=${JSON.stringify(mapAssets)};
function _selectAsset(idx){
  var a=_assets[idx];
  var msg=JSON.stringify({type:'selectAsset',id:a.id,name:a.name});
  try{window.ReactNativeWebView.postMessage(msg);}
  catch(e){window.parent.postMessage({type:'selectAsset',id:a.id,name:a.name},'*');}
}
var map=L.map('map',{zoomControl:false,attributionControl:false}).setView([${center[0]},${center[1]}],14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
_assets.forEach(function(a,i){
  var popup='<span class="popup-name">'+a.name+'</span><button class="select-btn" onclick="_selectAsset('+i+')">Select this site</button>';
  L.circleMarker([a.lat,a.lng],{radius:6,color:"#00AECD",fillColor:"#00AECD",fillOpacity:0.85,weight:1.5})
    .bindPopup(popup,{maxWidth:200}).addTo(map);
});
${userMarker}
</script></body></html>`;
  }, [userLocation, assetsData]);

  const filteredAssets = useMemo(() => {
    const all = (assetsData as any)?.data ?? [];
    if (!assetSearch.trim()) return all;
    const q = assetSearch.toLowerCase();
    return all.filter(
      (a: any) =>
        a.name?.toLowerCase().includes(q) ||
        a.suburb?.toLowerCase().includes(q) ||
        a.streetAddress?.toLowerCase().includes(q),
    );
  }, [assetsData, assetSearch]);

  // ── Create audit mutation ──
  const createAudit = useMutation({
    mutationFn: async (assetId: string) => {
      const res = await fetch(getApiUrl("/api/audits"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ assetId }),
      });
      if (!res.ok) throw new Error("Failed to create audit");
      return res.json();
    },
    onSuccess: (data) => {
      setAuditId(data.id);
      const init: Record<string, KpiResponse> = {};
      ALL_KPI_IDS.forEach((id) => { init[id] = { result: "", notes: "" }; });
      setResponses(init);
      setPhotos({});
      setView("conduct");
    },
    onError: () => Alert.alert("Error", "Could not start audit. Please try again."),
  });

  const handlePickAsset = (asset: { id: string; name: string }) => {
    setSelectedAsset(asset);
    const full = ((assetsData as any)?.data ?? []).find((a: any) => a.id === asset.id) ?? null;
    setSelectedAssetDetail(full);
    createAudit.mutate(asset.id);
  };

  // ── Auto-start audit when navigated from asset detail screen ──
  useEffect(() => {
    if (!startAssetId || !startAssetName || !token || autoStartHandled.current) return;
    autoStartHandled.current = true;
    setSelectedAsset({ id: startAssetId, name: startAssetName });
    fetch(getApiUrl(`/api/assets/${startAssetId}`), { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((detail) => setSelectedAssetDetail(detail))
      .catch(() => {});
    createAudit.mutate(startAssetId);
  }, [startAssetId, startAssetName, token]);

  const handlePhotoAdd = async (criterion: string) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow photo library access to add photos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      quality: 0.7,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPhotos((prev) => ({
        ...prev,
        [criterion]: { uri: asset.uri, mimeType: asset.mimeType ?? "image/jpeg", fileName: asset.fileName ?? `audit-${criterion}.jpg` },
      }));
    }
  };

  const handleSubmit = async () => {
    if (!auditId) return;

    const scored = Object.values(responses).filter((r) => r.result !== "");
    if (scored.length === 0) {
      Alert.alert("No scores entered", "Please score at least one KPI item before submitting.");
      return;
    }

    const kpiLabelMap: Record<string, string> = {};
    KPI_SECTIONS.forEach((s) => s.items.forEach((i) => { kpiLabelMap[i.id] = i.label; }));

    const failsWithoutPhoto = Object.entries(responses)
      .filter(([criterion, r]) => r.result === "fail" && !photos[criterion])
      .map(([criterion]) => kpiLabelMap[criterion] ?? criterion);

    if (failsWithoutPhoto.length > 0) {
      Alert.alert(
        "Photos required",
        `Please add a photo for each failed item:\n\n• ${failsWithoutPhoto.join("\n• ")}`,
      );
      return;
    }

    setSubmitting(true);
    try {
      const responsePayload = Object.entries(responses)
        .filter(([, r]) => r.result !== "")
        .map(([criterion, r]) => ({
          criterion,
          result: r.result,
          notes: r.notes || undefined,
        }));

      const putRes = await fetch(getApiUrl(`/api/audits/${auditId}/responses`), {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ responses: responsePayload }),
      });
      if (!putRes.ok) throw new Error("Failed to submit responses");
      const detail = await putRes.json();

      // Upload photos for any fail items that have a local photo
      const photoEntries = Object.entries(photos);
      for (const [criterion, photo] of photoEntries) {
        const item = detail.items?.find((i: any) => i.criterion === criterion);
        if (!item) continue;
        const formData = new FormData();
        if (Platform.OS === "web") {
          const blob = await (await fetch(photo.uri)).blob();
          formData.append("photo", blob, photo.fileName ?? "photo.jpg");
        } else {
          formData.append("photo", {
            uri: photo.uri,
            type: photo.mimeType ?? "image/jpeg",
            name: photo.fileName ?? "photo.jpg",
          } as any);
        }
        await fetch(getApiUrl(`/api/audits/${auditId}/items/${item.id}/photos`), {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
      }

      setDoneScore(detail.overallScore != null ? Number(detail.overallScore) : null);
      qc.invalidateQueries({ queryKey: ["audits"] });
      qc.invalidateQueries({ queryKey: ["audit-quota-badge"] });
      qc.invalidateQueries({ queryKey: ["audit-quota-current"] });
      setView("done");
    } catch {
      Alert.alert("Submit failed", "Could not save the audit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const resetToList = () => {
    setView("list");
    setSelectedAsset(null);
    setSelectedAssetDetail(null);
    setAuditId(null);
    setResponses({});
    setPhotos({});
    setDoneScore(null);
    setAssetSearch("");
  };

  const openAudit = async (audit: any) => {
    if (openingAuditId) return;
    setOpeningAuditId(audit.id);
    try {
      const [auditRes, assetRes] = await Promise.all([
        fetch(getApiUrl(`/api/audits/${audit.id}`), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(getApiUrl(`/api/assets/${audit.assetId}`), { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (!auditRes.ok) throw new Error("Failed to load audit");
      const [detail, assetDetail] = await Promise.all([auditRes.json(), assetRes.ok ? assetRes.json() : null]);
      const init: Record<string, KpiResponse> = {};
      ALL_KPI_IDS.forEach((id) => { init[id] = { result: "", notes: "" }; });
      (detail.items ?? []).forEach((item: any) => {
        if (init[item.criterion] !== undefined) {
          init[item.criterion] = { result: item.result ?? "", notes: item.notes ?? "" };
        }
      });
      setAuditId(audit.id);
      setSelectedAsset({ id: audit.assetId, name: audit.assetName ?? "Unknown site" });
      setSelectedAssetDetail(assetDetail);
      setResponses(init);
      setPhotos({});
      setView("conduct");
    } catch {
      Alert.alert("Error", "Could not load audit. Please try again.");
    } finally {
      setOpeningAuditId(null);
    }
  };

  const isSupervisor = user?.role === "supervisor";

  const handleQueueItemStart = (assetId: string, assetName: string) => {
    setSelectedAsset({ id: assetId, name: assetName });
    fetch(getApiUrl(`/api/assets/${assetId}`), { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((detail) => setSelectedAssetDetail(detail))
      .catch(() => {});
    createAudit.mutate(assetId);
  };

  // ─── Render: List ─────────────────────────────────────────────────────────

  if (view === "list") {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.navy, paddingTop: insets.top + 16 }]}>
          <Text style={styles.headerTitle}>Audits</Text>
          <TouchableOpacity
            style={[styles.newBtn, { backgroundColor: colors.primary }]}
            onPress={() => setView("pick")}
          >
            <Feather name="plus" size={16} color="#fff" />
            <Text style={styles.newBtnText}>New Audit</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ padding: 0, paddingBottom: bottomPad }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {isSupervisor && token && (
            <WeeklyQueueBanner
              token={token}
              onStartAudit={handleQueueItemStart}
            />
          )}
          <View style={{ padding: 16, gap: 10 }}>
          {loadingAudits ? (
            <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} size="large" />
          ) : !auditsList?.data?.length ? (
            <View style={styles.empty}>
              <Feather name="check-square" size={40} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No audits yet</Text>
              <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>Tap "New Audit" to start a site audit.</Text>
            </View>
          ) : (
            auditsList.data.map((audit: any) => (
              <TouchableOpacity
                key={audit.id}
                activeOpacity={0.75}
                onPress={() => openAudit(audit)}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
              >
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
                      {audit.assetName ?? "Unknown site"}
                    </Text>
                    <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                      {new Date(audit.conductedAt).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <AuditStatusBadge status={audit.status} score={audit.overallScore} />
                    {openingAuditId === audit.id
                      ? <ActivityIndicator size="small" color={colors.primary} />
                      : <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                    }
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
          </View>
        </ScrollView>
      </View>
    );
  }

  // ─── Render: Asset Picker ──────────────────────────────────────────────────

  if (view === "pick") {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.navy, paddingTop: insets.top + 16 }]}>
          <TouchableOpacity onPress={resetToList} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="arrow-left" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { flex: 1, marginLeft: 12 }]}>Select Site</Text>
        </View>

        <AuditMap html={mapHtml} onAssetSelect={handlePickAsset} />

        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search by name, suburb or address…"
            placeholderTextColor={colors.mutedForeground}
            value={assetSearch}
            onChangeText={setAssetSearch}
            autoFocus
          />
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: bottomPad }} showsVerticalScrollIndicator={false}>
          {createAudit.isPending ? (
            <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} size="large" />
          ) : filteredAssets.length === 0 ? (
            <Text style={[styles.emptySubtitle, { color: colors.mutedForeground, padding: 24, textAlign: "center" }]}>
              No sites found
            </Text>
          ) : (
            filteredAssets.map((asset: any) => (
              <TouchableOpacity
                key={asset.id}
                style={[styles.assetRow, { borderBottomColor: colors.border }]}
                onPress={() => handlePickAsset({ id: asset.id, name: asset.name })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.assetRowName, { color: colors.foreground }]}>{asset.name}</Text>
                  {((asset as any).description || asset.suburb) && (
                    <Text style={[styles.assetRowSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {(asset as any).description || asset.suburb}
                    </Text>
                  )}
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  // ─── Render: Conduct Form ──────────────────────────────────────────────────

  if (view === "conduct") {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.navy, paddingTop: insets.top + 16 }]}>
          <TouchableOpacity
            onPress={() => {
              if (Platform.OS === "web") {
                if (window.confirm("Cancel audit? Progress will be lost.")) resetToList();
              } else {
                Alert.alert("Cancel audit?", "Progress will be lost.", [
                  { text: "Keep going" },
                  { text: "Cancel audit", style: "destructive", onPress: resetToList },
                ]);
              }
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="x" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>{selectedAsset?.name ?? "Audit"}</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: bottomPad + 80 }}
          showsVerticalScrollIndicator={false}
        >
          {selectedAssetDetail && (() => {
            const d = selectedAssetDetail;
            const GARDEN_LABELS: Record<string, string> = {
              annuals: "Annuals", roses_perennials: "Roses & Perennials",
              ornamental: "Ornamental", amenity: "Amenity", rain_garden: "Rain Garden",
              reveg: "Revegetation", bush: "Bush", tree_planter_pits: "Tree Planter Pits", hedge: "Hedge",
            };
            const rows = [
              d.description && { label: "Description", value: d.description },
              d.standard    && { label: "Specification", value: d.standard.charAt(0).toUpperCase() + d.standard.slice(1) },
              d.gardenType  && { label: "Garden Type", value: GARDEN_LABELS[d.gardenType] ?? d.gardenType },
              d.suburb      && { label: "Suburb", value: d.suburb },
              d.serviceTimeMins != null && { label: "Service Time", value: `${d.serviceTimeMins} min` },
            ].filter(Boolean) as { label: string; value: string }[];
            return (
              <View style={[styles.siteInfoCard, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "33", borderRadius: colors.radius }]}>
                <Text style={[styles.siteInfoName, { color: colors.primary }]}>{selectedAsset?.name}</Text>
                {rows.map((row) => (
                  <View key={row.label} style={styles.siteInfoRow}>
                    <Text style={[styles.siteInfoLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
                    <Text style={[styles.siteInfoValue, { color: colors.foreground }]}>{row.value}</Text>
                  </View>
                ))}
              </View>
            );
          })()}
          {KPI_SECTIONS.map((section) => (
            <View key={section.section} style={{ marginBottom: 4 }}>
              <Text style={[styles.sectionHeader, { color: colors.primary, backgroundColor: colors.muted }]}>
                {section.section}
              </Text>
              <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                {section.items.map((item) => (
                  <KpiRow
                    key={item.id}
                    id={item.id}
                    label={item.label}
                    response={responses[item.id] ?? { result: "", notes: "" }}
                    photo={photos[item.id] ?? null}
                    onChange={(r) => setResponses((prev) => ({
                      ...prev,
                      [item.id]: { ...prev[item.id], ...r },
                    }))}
                    onPhotoAdd={() => handlePhotoAdd(item.id)}
                  />
                ))}
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={[styles.actionBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + (Platform.OS === "web" ? 72 : 16) }]}>
          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: submitting ? colors.muted : colors.primary }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Feather name="check" size={18} color="#fff" />
                <Text style={styles.submitBtnText}>Submit Audit</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Render: Done ─────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }]}>
      <View style={[styles.doneCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <View style={[styles.doneIcon, { backgroundColor: (doneScore ?? 0) >= 80 ? colors.success + "22" : colors.destructive + "22" }]}>
          <Feather
            name={(doneScore ?? 0) >= 80 ? "check-circle" : "alert-circle"}
            size={40}
            color={(doneScore ?? 0) >= 80 ? colors.success : colors.destructive}
          />
        </View>
        {doneScore != null && (
          <Text style={[styles.doneScore, { color: (doneScore ?? 0) >= 80 ? colors.success : colors.destructive }]}>
            {doneScore}%
          </Text>
        )}
        <Text style={[styles.doneTitle, { color: colors.foreground }]}>Audit Submitted</Text>
        <Text style={[styles.doneSite, { color: colors.mutedForeground }]}>{selectedAsset?.name}</Text>
        <TouchableOpacity style={[styles.doneBtn, { backgroundColor: colors.primary }]} onPress={resetToList}>
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: "#ffffff",
  },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  newBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
  map: { height: 190, width: "100%" },
  scroll: { flex: 1 },
  empty: { alignItems: "center", marginTop: 80, gap: 12 },
  emptyTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16 },
  emptySubtitle: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center" },

  // Cards
  card: { borderWidth: 1, padding: 14, marginBottom: 0 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  cardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  cardSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },

  // Badge
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },

  // Search
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 10,
  },
  searchInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14 },

  // Asset rows
  assetRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  assetRowName: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  assetRowSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },

  // KPI section
  sectionHeader: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  siteInfoCard: {
    margin: 16,
    marginBottom: 8,
    padding: 14,
    borderWidth: 1,
  },
  siteInfoName: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    marginBottom: 10,
  },
  siteInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    gap: 12,
  },
  siteInfoLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    flexShrink: 0,
  },
  siteInfoValue: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    textAlign: "right",
    flex: 1,
  },

  sectionCard: {
    borderWidth: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    marginBottom: 12,
    overflow: "hidden",
  },

  // KPI row
  kpiRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  kpiLabel: { fontFamily: "Inter_500Medium", fontSize: 14, marginBottom: 8 },
  kpiBtns: { flexDirection: "row", gap: 8 },
  kpiFailExtras: { marginTop: 10, gap: 8 },
  kpiNotes: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    minHeight: 56,
  },
  addPhotoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  addPhotoBtnText: { fontFamily: "Inter_500Medium", fontSize: 13 },
  photoThumbRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  photoThumb: { width: 52, height: 52, borderRadius: 6 },
  photoThumbLabel: { fontFamily: "Inter_500Medium", fontSize: 12 },

  // Action bar
  actionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 10,
  },
  submitBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },

  // Done
  doneCard: {
    borderWidth: 1,
    padding: 32,
    marginHorizontal: 32,
    alignItems: "center",
    gap: 12,
  },
  doneIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  doneScore: { fontFamily: "Inter_700Bold", fontSize: 48 },
  doneTitle: { fontFamily: "Inter_700Bold", fontSize: 20 },
  doneSite: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center" },
  doneBtn: { paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8, marginTop: 8 },
  doneBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" },
});
