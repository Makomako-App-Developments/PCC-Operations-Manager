import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { useCreateReactiveJob } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { requestCameraPermission, requestMediaLibraryPermission } from "@/hooks/usePhotoLibraryPermission";
import * as Location from "expo-location";
import { useFocusEffect, useNavigation } from "expo-router";
import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { getApiUrl } from "@/lib/api";

const REPORT_DRAFT_KEY = "@report_draft_v1";

// ─── Pest Plants ─────────────────────────────────────────────────────────────

const PEST_PLANTS_LIST: string[] = [
  "African feathergrass", "Agapanthus", "Alligator weed", "Apple of Sodom",
  "Arrowhead", "Banana passionfruit", "Barberry", "Boneseed", "Boxthorn",
  "Bridal creeper", "Broom (Scotch)", "Broom (Montpellier)", "Broom (Spanish)",
  "Buddleja", "Buffalo grass", "Cape ivy", "Cape tulip", "Chilean flame creeper",
  "Chinese privet", "Climbing dock", "Climbing spindle berry", "Coarse-leaved mallow",
  "Cootamundra wattle", "Cotoneaster", "Cut-leaved nightshade", "Datura",
  "Devil's fig", "Elephant grass", "Elodea", "English ivy", "Fatsia",
  "Field bindweed", "Fireweed", "Fountain grass", "German ivy", "Giant buttercup",
  "Giant reed", "Gorse", "Green cestrum", "Hakea", "Himalayan honeysuckle",
  "Hoary cress", "Holly", "Horsetail", "Japanese honeysuckle", "Jerusalem cherry",
  "Karaka", "Kudzu", "Lantana", "Lagarosiphon", "Mexican daisy",
  "Mimosa", "Montbretia", "Mother of millions", "Moth plant", "Muehlenbeckia",
  "Nassella tussock", "Old man's beard", "Onion weed", "Pampas grass",
  "Pare", "Parrot's feather", "Passionfruit (banana)", "Periwinkle", "Piri piri bur",
  "Pittosporum undulatum", "Plume poppy", "Prickly pear", "Privet (large-leaved)",
  "Purple loosestrife", "Ragwort", "Reed sweet grass", "Rhododendron", "Rowan",
  "Rubus fruticosus (blackberry)", "Russian vine", "Selaginella", "Silver poplar",
  "Spartina", "Spiny emex", "St John's wort", "Tobacco weed", "Tree of heaven",
  "Tropical soda apple", "Tutsan", "Umbrella sedge", "Viper's bugloss",
  "Water hyacinth", "Water lettuce", "Watsonia", "White bryony", "Wild ginger",
  "Willow (crack)", "Willow (weeping)", "Yellow flag iris", "Yellow flag",
];

// ─── Config ───────────────────────────────────────────────────────────────────

const ISSUE_TYPES = [
  { value: "pest_plant_sighting", label: "Pest Plant Sighting" },
  { value: "vandalism", label: "Vandalism / Graffiti" },
  { value: "weed_breakout", label: "Weed Breakout" },
  { value: "storm_damage", label: "Storm Damage" },
  { value: "safety_hazard", label: "Safety Hazard" },
  { value: "plant_failure", label: "Plant Failure" },
  { value: "irrigation_fault", label: "Irrigation Fault" },
  { value: "other", label: "Other" },
];

const PRIORITIES = [
  { value: "low", label: "Low", color: "#64748b" },
  { value: "medium", label: "Medium", color: "#f59e0b" },
  { value: "high", label: "High", color: "#f97316" },
  { value: "urgent", label: "Urgent", color: "#ef4444" },
];

// ─── Pest Plant Modal ─────────────────────────────────────────────────────────

interface PestPlantsModalProps {
  visible: boolean;
  selected: string[];
  onChange: (next: string[]) => void;
  onClose: () => void;
}

function PestPlantsModal({ visible, selected, onChange, onClose }: PestPlantsModalProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? PEST_PLANTS_LIST.filter(p => p.toLowerCase().includes(q)) : PEST_PLANTS_LIST;
  }, [search]);

  const toggle = (species: string) => {
    if (selected.includes(species)) {
      onChange(selected.filter(s => s !== species));
    } else {
      onChange([...selected, species]);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[pestStyles.root, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
        <View style={[pestStyles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[pestStyles.title, { color: colors.foreground }]}>Pest Plant Species</Text>
            <Text style={[pestStyles.sub, { color: colors.mutedForeground }]}>
              {selected.length > 0 ? `${selected.length} selected` : "Select all species found"}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={[pestStyles.doneBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
            activeOpacity={0.85}
          >
            <Text style={pestStyles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>

        <View style={[pestStyles.searchRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[pestStyles.searchInput, { color: colors.foreground }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search species…"
            placeholderTextColor={colors.mutedForeground}
            clearButtonMode="while-editing"
            autoCorrect={false}
          />
          {search.length > 0 && Platform.OS !== "ios" && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Feather name="x" size={15} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {filtered.length === 0 ? (
            <Text style={[pestStyles.empty, { color: colors.mutedForeground }]}>No species match "{search}"</Text>
          ) : (
            filtered.map(species => {
              const checked = selected.includes(species);
              return (
                <TouchableOpacity
                  key={species}
                  style={[pestStyles.item, { borderBottomColor: colors.border, backgroundColor: checked ? colors.secondary : "transparent" }]}
                  onPress={() => toggle(species)}
                  activeOpacity={0.75}
                >
                  <View style={[pestStyles.checkbox, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : "transparent", borderRadius: 4 }]}>
                    {checked && <Feather name="check" size={12} color="#fff" />}
                  </View>
                  <Text style={[pestStyles.itemText, { color: colors.foreground }]}>{species}</Text>
                </TouchableOpacity>
              );
            })
          )}
          <View style={{ height: insets.bottom + 24 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const pestStyles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 20, marginBottom: 2 },
  sub: { fontFamily: "Inter_400Regular", fontSize: 13 },
  doneBtn: { paddingHorizontal: 18, paddingVertical: 9 },
  doneBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    paddingVertical: 2,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 16,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  itemText: { fontFamily: "Inter_400Regular", fontSize: 15, flex: 1 },
  empty: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center", marginTop: 32 },
});

// ─── Asset Picker Modal ───────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface AssetPickerModalProps {
  visible: boolean;
  token: string | null;
  selectedId: string;
  onSelect: (id: string, name: string) => void;
  onClose: () => void;
}

function AssetPickerModal({ visible, token, selectedId, onSelect, onClose }: AssetPickerModalProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"idle" | "search" | "nearby">("idle");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      setQuery("");
      setMode("idle");
      setResults([]);
      setLocError(null);
    }
  }, [visible]);

  useEffect(() => {
    if (mode !== "search") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          getApiUrl(`/api/assets?search=${encodeURIComponent(query.trim())}&limit=20&isActive=true`),
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const json = await res.json();
        setResults(json.data ?? []);
      } catch { setResults([]); }
      setLoading(false);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, mode, token]);

  const handleNearMe = async () => {
    setLocError(null);
    setMode("nearby");
    setQuery("");
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocError("Location permission denied. Please enable it in Settings.");
        setLoading(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      const res = await fetch(
        getApiUrl(`/api/assets?limit=500&isActive=true`),
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const json = await res.json();
      const all: any[] = json.data ?? [];
      const sorted = all
        .filter(a => a.lat != null && a.lng != null)
        .map(a => ({ ...a, distKm: haversineKm(latitude, longitude, Number(a.lat), Number(a.lng)) }))
        .sort((a, b) => a.distKm - b.distKm)
        .slice(0, 25);
      setResults(sorted);
    } catch {
      setLocError("Could not get your location. Please try again.");
    }
    setLoading(false);
  };

  const formatDist = (km: number) =>
    km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[apStyles.root, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
        {/* Header */}
        <View style={[apStyles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Text style={[apStyles.title, { color: colors.foreground }]}>Select Asset</Text>
          <TouchableOpacity
            onPress={onClose}
            style={[apStyles.cancelBtn, { borderColor: colors.border, borderRadius: colors.radius }]}
            activeOpacity={0.8}
          >
            <Text style={[apStyles.cancelBtnTxt, { color: colors.foreground }]}>Cancel</Text>
          </TouchableOpacity>
        </View>

        {/* Search + Near Me row */}
        <View style={[apStyles.searchRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <View style={[apStyles.searchBox, { backgroundColor: colors.background, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[apStyles.searchInput, { color: colors.foreground }]}
              value={query}
              onChangeText={(t) => { setMode("search"); setQuery(t); }}
              placeholder="Search by name…"
              placeholderTextColor={colors.mutedForeground}
              clearButtonMode="while-editing"
              autoCorrect={false}
            />
            {query.length > 0 && Platform.OS !== "ios" && (
              <TouchableOpacity onPress={() => { setQuery(""); setResults([]); setMode("idle"); }}>
                <Feather name="x" size={15} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[
              apStyles.nearBtn,
              {
                backgroundColor: mode === "nearby" ? colors.primary : colors.background,
                borderColor: mode === "nearby" ? colors.primary : colors.border,
                borderRadius: colors.radius,
              },
            ]}
            onPress={handleNearMe}
            activeOpacity={0.8}
          >
            <Feather name="navigation" size={15} color={mode === "nearby" ? "#fff" : colors.primary} />
            <Text style={[apStyles.nearBtnTxt, { color: mode === "nearby" ? "#fff" : colors.primary }]}>
              Near Me
            </Text>
          </TouchableOpacity>
        </View>

        {locError && (
          <View style={[apStyles.errorBanner, { backgroundColor: "#fee2e2" }]}>
            <Feather name="alert-circle" size={14} color="#ef4444" />
            <Text style={apStyles.errorTxt}>{locError}</Text>
          </View>
        )}

        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} size="large" />
          ) : results.length === 0 && (mode === "nearby" || (mode === "search" && query.trim())) ? (
            <View style={apStyles.emptyState}>
              <Feather name={mode === "nearby" ? "map-pin" : "search"} size={38} color={colors.border} />
              <Text style={[apStyles.emptyTxt, { color: colors.mutedForeground }]}>
                {mode === "nearby" ? "No assets found nearby" : `No assets match "${query}"`}
              </Text>
            </View>
          ) : results.length === 0 ? (
            <View style={apStyles.emptyState}>
              <Feather name="map" size={38} color={colors.border} />
              <Text style={[apStyles.emptyTxt, { color: colors.mutedForeground }]}>
                Type a name to search, or tap{" "}
                <Text style={{ fontFamily: "Inter_600SemiBold" }}>Near Me</Text>
                {" "}to find assets close to your location
              </Text>
            </View>
          ) : (
            <>
              {mode === "nearby" && (
                <Text style={[apStyles.sectionHint, { color: colors.mutedForeground }]}>
                  Nearest {results.length} assets to your location
                </Text>
              )}
              {results.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  style={[
                    apStyles.item,
                    { borderBottomColor: colors.border },
                    selectedId === a.id && { backgroundColor: colors.secondary },
                  ]}
                  onPress={() => { onSelect(a.id, a.name); onClose(); }}
                  activeOpacity={0.75}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[apStyles.itemName, { color: colors.foreground }]}>{a.name}</Text>
                    {(a.description || a.suburb) ? (
                      <Text style={[apStyles.itemSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {a.description || a.suburb}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    {a.distKm != null && (
                      <View style={[apStyles.distPill, { backgroundColor: colors.primary + "18" }]}>
                        <Feather name="navigation" size={10} color={colors.primary} />
                        <Text style={[apStyles.distTxt, { color: colors.primary }]}>{formatDist(a.distKm)}</Text>
                      </View>
                    )}
                    {selectedId === a.id && <Feather name="check" size={18} color={colors.primary} />}
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}
          <View style={{ height: insets.bottom + 24 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const apStyles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 20 },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
  },
  cancelBtnTxt: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    paddingVertical: 2,
  },
  nearBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1.5,
  },
  nearBtnTxt: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  errorTxt: { fontFamily: "Inter_400Regular", fontSize: 13, color: "#ef4444", flex: 1 },
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTxt: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
  },
  sectionHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 16,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemName: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  itemSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  distPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  distTxt: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ReportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const navigation = useNavigation();

  const [issueType, setIssueType] = useState<string>("");
  const [priority, setPriority] = useState<string>("medium");
  const [description, setDescription] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState<string>("");
  const [selectedAssetName, setSelectedAssetName] = useState<string>("");
  const [pestPlantsSelected, setPestPlantsSelected] = useState<string[]>([]);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showPestModal, setShowPestModal] = useState(false);
  const [success, setSuccess] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<Array<{ uri: string; file?: File }>>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);

  const mutation = useCreateReactiveJob();

  const hasDraft =
    !!selectedAssetId ||
    !!issueType ||
    description.trim().length > 0 ||
    pestPlantsSelected.length > 0 ||
    selectedPhotos.length > 0;

  const saveDraft = useCallback(async () => {
    if (!hasDraft) {
      await AsyncStorage.removeItem(REPORT_DRAFT_KEY);
      return;
    }
    await AsyncStorage.setItem(
      REPORT_DRAFT_KEY,
      JSON.stringify({
        issueType,
        priority,
        description,
        selectedAssetId,
        selectedAssetName,
        pestPlantsSelected,
        photoUris: selectedPhotos.map(p => p.uri),
      }),
    );
  }, [hasDraft, issueType, priority, description, selectedAssetId, selectedAssetName, pestPlantsSelected, selectedPhotos]);

  const clearDraft = useCallback(async () => {
    await AsyncStorage.removeItem(REPORT_DRAFT_KEY);
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const raw = await AsyncStorage.getItem(REPORT_DRAFT_KEY);
          if (!raw) return;
          const draft = JSON.parse(raw);
          if (draft.issueType) setIssueType(draft.issueType);
          if (draft.priority) setPriority(draft.priority);
          if (draft.description) setDescription(draft.description);
          if (draft.selectedAssetId) setSelectedAssetId(draft.selectedAssetId);
          if (draft.selectedAssetName) setSelectedAssetName(draft.selectedAssetName);
          if (Array.isArray(draft.pestPlantsSelected)) setPestPlantsSelected(draft.pestPlantsSelected);
          if (Array.isArray(draft.photoUris) && draft.photoUris.length > 0) {
            setSelectedPhotos(draft.photoUris.map((uri: string) => ({ uri })));
          }
          setDraftRestored(true);
        } catch { /* ignore corrupt drafts */ }
      })();
    }, []),
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener("blur", () => {
      saveDraft();
    });
    return unsubscribe;
  }, [navigation, saveDraft]);

  const uploadPhotos = async (jobId: string) => {
    for (const photo of selectedPhotos) {
      try {
        const form = new FormData();
        if (Platform.OS === "web") {
          if (photo.file) {
            form.append("photo", photo.file);
          } else {
            const filename = photo.uri.split("/").pop() ?? "photo.jpg";
            const mimeType = filename.endsWith(".png") ? "image/png" : "image/jpeg";
            const blob = await fetch(photo.uri).then(r => r.blob());
            form.append("photo", new File([blob], filename, { type: mimeType }));
          }
        } else {
          const filename = photo.uri.split("/").pop() ?? "photo.jpg";
          const mimeType = filename.endsWith(".png") ? "image/png" : "image/jpeg";
          form.append("photo", { uri: photo.uri, name: filename, type: mimeType } as any);
        }
        const res = await fetch(getApiUrl(`/api/reactive-jobs/${jobId}/photos`), {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        if (!res.ok) throw new Error("Upload failed");
      } catch (err) {
        if (Platform.OS !== "web" && err instanceof TypeError) {
          const { enqueuePhoto } = await import("@/hooks/useOfflinePhotoQueue");
          await enqueuePhoto("reactive-job", jobId, photo.uri);
        }
      }
    }
  };

  const pickFromLibrary = async () => {
    if (!(await requestMediaLibraryPermission())) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: 5,
    });
    if (!result.canceled) {
      setSelectedPhotos(prev => [
        ...prev,
        ...result.assets.map(a => ({ uri: a.uri, file: (a as any).file ?? undefined })),
      ]);
    }
  };

  const takePhoto = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Not available", "Camera capture is not supported on web. Use the library picker instead.");
      return;
    }
    if (!(await requestCameraPermission())) return;
    try {
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
      if (!result.canceled && result.assets[0]) {
        const a = result.assets[0];
        setSelectedPhotos(prev => [...prev, { uri: a.uri, file: (a as any).file ?? undefined }]);
      }
    } catch {
      Alert.alert(
        "Camera unavailable",
        "GardenOps could not open your camera. Please close and reopen the app, then try again. You can still attach a photo from your library.",
      );
    }
  };

  const removePhoto = (idx: number) =>
    setSelectedPhotos(prev => prev.filter((_, i) => i !== idx));

  const isPestSighting = issueType === "pest_plant_sighting";

  const handleSubmit = async () => {
    if (!selectedAssetId || !issueType) return;
    if (isPestSighting && pestPlantsSelected.length === 0) return;
    if (!isPestSighting && !description.trim()) return;

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const finalDescription = description.trim() || pestPlantsSelected.join(", ");

    mutation.mutate(
      {
        data: {
          assetId: selectedAssetId,
          issueType,
          description: finalDescription,
          priority: priority as "low" | "medium" | "high" | "urgent",
          ...(isPestSighting && pestPlantsSelected.length > 0
            ? { pestPlantsPresent: JSON.stringify(pestPlantsSelected) }
            : {}),
        } as any,
      },
      {
        onSuccess: async (newJob: any) => {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          if (selectedPhotos.length > 0 && newJob?.id) {
            setUploadingPhotos(true);
            await uploadPhotos(newJob.id);
            setUploadingPhotos(false);
          }
          await clearDraft();
          setSuccess(true);
          setDraftRestored(false);
          setIssueType("");
          setPriority("medium");
          setDescription("");
          setSelectedAssetId("");
          setSelectedAssetName("");
          setPestPlantsSelected([]);
          setSelectedPhotos([]);
          setTimeout(() => setSuccess(false), 4000);
        },
        onError: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        },
      },
    );
  };

  const isValid = !!selectedAssetId && !!issueType && (
    isPestSighting ? pestPlantsSelected.length > 0 : description.trim().length > 0
  );

  const topPad = insets.top;
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 84 : 84);

  const selectedPriority = PRIORITIES.find((p) => p.value === priority);
  const selectedIssue = ISSUE_TYPES.find((t) => t.value === issueType);

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
        <Text style={[styles.title, { color: colors.foreground }]}>Report Issue</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Raise unscheduled work for your supervisor
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomPad }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {draftRestored ? (
          <View style={[styles.draftBanner, { backgroundColor: "#fef9c3", borderColor: "#fde047", borderRadius: colors.radius }]}>
            <Feather name="edit-2" size={15} color="#854d0e" />
            <Text style={styles.draftBannerText}>Draft restored</Text>
            <TouchableOpacity
              onPress={async () => {
                await clearDraft();
                setDraftRestored(false);
                setIssueType("");
                setPriority("medium");
                setDescription("");
                setSelectedAssetId("");
                setSelectedAssetName("");
                setPestPlantsSelected([]);
                setSelectedPhotos([]);
              }}
              activeOpacity={0.75}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.draftBannerDiscard}>Discard</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {success ? (
          <View style={[styles.successBanner, { backgroundColor: "#dcfce7", borderRadius: colors.radius }]}>
            <Feather name="check-circle" size={18} color="#16a34a" />
            <Text style={styles.successText}>Issue raised successfully!</Text>
          </View>
        ) : null}

        {mutation.isError ? (
          <View style={[styles.errorBanner, { backgroundColor: "#fee2e2", borderRadius: colors.radius }]}>
            <Text style={styles.errorText}>Failed to raise issue. Please try again.</Text>
          </View>
        ) : null}

        <View
          style={[
            styles.formCard,
            { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
          ]}
        >
          {/* Asset */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Asset <Text style={{ color: colors.destructive }}>*</Text>
            </Text>
            <TouchableOpacity
              style={[styles.selector, { backgroundColor: colors.background, borderColor: selectedAssetId ? colors.primary : colors.border, borderRadius: colors.radius }]}
              onPress={() => setShowAssetModal(true)}
              activeOpacity={0.8}
            >
              <Text style={[styles.selectorText, { color: selectedAssetName ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                {selectedAssetName || "Select an asset…"}
              </Text>
              <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* Issue Type */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Issue Type <Text style={{ color: colors.destructive }}>*</Text>
            </Text>
            <TouchableOpacity
              style={[styles.selector, { backgroundColor: colors.background, borderColor: issueType ? colors.primary : colors.border, borderRadius: colors.radius }]}
              onPress={() => setShowIssueModal(true)}
              activeOpacity={0.8}
            >
              <Text style={[styles.selectorText, { color: selectedIssue ? colors.foreground : colors.mutedForeground }]}>
                {selectedIssue?.label ?? "Select issue type…"}
              </Text>
              <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* Pest Plants — only shown when type is pest_plant_sighting */}
          {isPestSighting && (
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>
                Species Found <Text style={{ color: colors.destructive }}>*</Text>
              </Text>
              <TouchableOpacity
                style={[styles.selector, { backgroundColor: colors.background, borderColor: pestPlantsSelected.length > 0 ? colors.primary : colors.border, borderRadius: colors.radius }]}
                onPress={() => setShowPestModal(true)}
                activeOpacity={0.8}
              >
                <Text style={[styles.selectorText, { color: pestPlantsSelected.length > 0 ? colors.foreground : colors.mutedForeground }]}>
                  {pestPlantsSelected.length > 0 ? `${pestPlantsSelected.length} species selected` : "Select pest plants found…"}
                </Text>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
              {pestPlantsSelected.length > 0 && (
                <View style={styles.pillRow}>
                  {pestPlantsSelected.map(species => (
                    <TouchableOpacity
                      key={species}
                      style={[styles.pill, { backgroundColor: "#fef3c7", borderColor: "#f59e0b", borderRadius: colors.radius }]}
                      onPress={() => setPestPlantsSelected(prev => prev.filter(s => s !== species))}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.pillText}>{species}</Text>
                      <Feather name="x" size={11} color="#92400e" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Priority */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Priority</Text>
            <View style={styles.priorityRow}>
              {PRIORITIES.map((p) => (
                <TouchableOpacity
                  key={p.value}
                  style={[styles.priorityBtn, { backgroundColor: priority === p.value ? p.color : colors.background, borderColor: priority === p.value ? p.color : colors.border, borderRadius: colors.radius }]}
                  onPress={() => setPriority(p.value)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.priorityText, { color: priority === p.value ? "#fff" : colors.foreground }]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Description */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              {isPestSighting ? "Notes" : <>Description <Text style={{ color: colors.destructive }}>*</Text></>}
            </Text>
            <TextInput
              style={[styles.textarea, { backgroundColor: colors.background, borderColor: description ? colors.primary : colors.border, color: colors.foreground, borderRadius: colors.radius }]}
              value={description}
              onChangeText={setDescription}
              placeholder={isPestSighting ? "Add any additional notes (optional)…" : "Describe the issue clearly…"}
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* Photos */}
          <View style={[styles.field, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 14 }]}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Photos (optional)</Text>

            {/* Thumbnail strip */}
            {selectedPhotos.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.photoStrip}
                contentContainerStyle={{ gap: 8, paddingRight: 4 }}
              >
                {selectedPhotos.map((p, idx) => (
                  <View key={idx} style={styles.thumbWrap}>
                    <Image source={{ uri: p.uri }} style={styles.thumb} />
                    <TouchableOpacity
                      style={[styles.thumbRemove, { backgroundColor: colors.destructive }]}
                      onPress={() => removePhoto(idx)}
                      activeOpacity={0.8}
                    >
                      <Feather name="x" size={10} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}

            {/* Add buttons */}
            <View style={styles.photoActions}>
              <TouchableOpacity
                style={[styles.photoBtn, { borderColor: colors.border, borderRadius: colors.radius, backgroundColor: colors.background }]}
                onPress={takePhoto}
                activeOpacity={0.8}
              >
                <Feather name="camera" size={16} color={colors.primary} />
                <Text style={[styles.photoBtnText, { color: colors.foreground }]}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.photoBtn, { borderColor: colors.border, borderRadius: colors.radius, backgroundColor: colors.background }]}
                onPress={pickFromLibrary}
                activeOpacity={0.8}
              >
                <Feather name="image" size={16} color={colors.primary} />
                <Text style={[styles.photoBtnText, { color: colors.foreground }]}>Library</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.submitBtn,
            { backgroundColor: isValid ? (selectedPriority?.color ?? colors.primary) : colors.muted, borderRadius: colors.radius, opacity: mutation.isPending ? 0.7 : 1 },
          ]}
          onPress={handleSubmit}
          disabled={!isValid || mutation.isPending}
          activeOpacity={0.8}
        >
          {mutation.isPending || uploadingPhotos ? (
            <>
              <ActivityIndicator color="#fff" />
              {uploadingPhotos && (
                <Text style={styles.submitText}>Uploading photos…</Text>
              )}
            </>
          ) : (
            <>
              <Feather name={isPestSighting ? "alert-triangle" : "alert-circle"} size={18} color="#fff" />
              <Text style={styles.submitText}>
                {isPestSighting ? "Record Sighting" : "Raise Issue"}
                {selectedPhotos.length > 0 ? ` + ${selectedPhotos.length} photo${selectedPhotos.length > 1 ? "s" : ""}` : ""}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Issue Type Modal */}
      <Modal visible={showIssueModal} transparent animationType="slide" onRequestClose={() => setShowIssueModal(false)}>
        <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowIssueModal(false)} activeOpacity={1} />
        <View style={[styles.modalSheet, { backgroundColor: colors.card, borderTopLeftRadius: colors.radius * 3, borderTopRightRadius: colors.radius * 3, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Issue Type</Text>
          {ISSUE_TYPES.map((t) => (
            <TouchableOpacity
              key={t.value}
              style={[styles.modalItem, { borderBottomColor: colors.border }, issueType === t.value && { backgroundColor: colors.secondary }]}
              onPress={() => {
                setIssueType(t.value);
                if (t.value !== "pest_plant_sighting") setPestPlantsSelected([]);
                setShowIssueModal(false);
              }}
              activeOpacity={0.75}
            >
              <Text style={[styles.modalItemText, { color: colors.foreground }]}>{t.label}</Text>
              {issueType === t.value && <Feather name="check" size={18} color={colors.primary} />}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>

      {/* Asset Picker Modal */}
      <AssetPickerModal
        visible={showAssetModal}
        token={token}
        selectedId={selectedAssetId}
        onSelect={(id, name) => { setSelectedAssetId(id); setSelectedAssetName(name); }}
        onClose={() => setShowAssetModal(false)}
      />

      {/* Pest Plants Full-Screen Modal */}
      <PestPlantsModal
        visible={showPestModal}
        selected={pestPlantsSelected}
        onChange={setPestPlantsSelected}
        onClose={() => setShowPestModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    marginBottom: 2,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
  },
  scroll: { flex: 1 },
  draftBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 12,
    borderWidth: 1,
  },
  draftBannerText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: "#854d0e",
    flex: 1,
  },
  draftBannerDiscard: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#b45309",
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    marginBottom: 12,
  },
  successText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#16a34a",
  },
  errorBanner: {
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#b91c1c",
  },
  formCard: {
    borderWidth: 1,
    padding: 16,
    gap: 16,
    marginBottom: 16,
  },
  field: { gap: 6 },
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  selector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  selectorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    flex: 1,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  pillText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "#92400e",
  },
  priorityRow: {
    flexDirection: "row",
    gap: 8,
  },
  priorityBtn: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: 9,
    alignItems: "center",
  },
  priorityText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  textarea: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    minHeight: 100,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    marginBottom: 8,
  },
  submitText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#fff",
  },
  photoStrip: {
    marginBottom: 10,
  },
  thumbWrap: {
    position: "relative",
    width: 76,
    height: 76,
  },
  thumb: {
    width: 76,
    height: 76,
    borderRadius: 8,
  },
  thumbRemove: {
    position: "absolute",
    top: 3,
    right: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  photoActions: {
    flexDirection: "row",
    gap: 10,
  },
  photoBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 11,
    borderWidth: 1,
  },
  photoBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalSheet: {
    paddingHorizontal: 16,
    paddingTop: 12,
    maxHeight: "60%",
  },
  modalSheetTall: {
    maxHeight: "75%",
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    marginBottom: 8,
  },
  modalItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 4,
  },
  modalItemText: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
  },
  modalItemSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
});
