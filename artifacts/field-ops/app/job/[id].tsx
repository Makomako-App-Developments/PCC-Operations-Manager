import { Feather } from "@expo/vector-icons";
import {
  useGetAsset,
  useGetJob,
  useUpdateJob,
} from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { StatusBadge } from "@/components/StatusBadge";
import { BoundaryMap } from "@/components/BoundaryMap";
import { useColors } from "@/hooks/useColors";
import { getApiUrl } from "@/lib/api";

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

const TASKS_BY_GARDEN_TYPE: Record<string, string[]> = {
  annuals: [
    "Litter — remove all old litter",
    "Weed control — ≤5% total cover",
    "Dead heading — visually pleasing",
    "Plant coverage — ≥95%",
    "Edging — vertical, smooth & neat",
    "Soil condition — check for compaction",
  ],
  roses_perennials: [
    "Litter — remove all old litter",
    "Weed control — ≤5% total cover",
    "Dead heading — visually pleasing",
    "Mulch depth — 50–125mm, clear of stems",
    "Pruning — best practice, road clearance",
    "Pest & disease — copper & winter oil check",
    "Edging — vertical, smooth & neat",
    "Plant coverage — ≥95%",
  ],
  ornamental: [
    "Litter — remove all old litter",
    "Weed control — ≤5% total cover",
    "Pruning — shape maintenance",
    "Mulch depth — 50–125mm",
    "Edging — vertical, smooth & neat",
    "Plant coverage — ≥90%",
  ],
  amenity: [
    "Litter — remove all old litter",
    "Weed control — spot spray where required",
    "Mow to correct height",
    "Edging along paths and driveways",
    "Trim around obstacles",
  ],
  rain_garden: [
    "Litter — remove all old litter",
    "Weed control — ≤5% total cover",
    "Check inlet and outlet clear",
    "Mulch depth — 50–125mm",
    "Plant coverage — ≥90%",
  ],
  reveg: [
    "Litter — remove all old litter",
    "Weed control — ≤5% total cover",
    "Check planting survival",
    "Mulch depth — 50–125mm",
    "Replace failed plants if needed",
  ],
  bush: [
    "Litter — remove all old litter",
    "Weed control — ≤5% total cover",
    "Check for invasive species",
    "Prune overhanging branches",
    "Clear paths",
  ],
  tree_planter_pits: [
    "Litter — remove all old litter",
    "Weed control — clear pits",
    "Mulch depth — 50–125mm",
    "Check tree ties and guards",
    "Water if required",
  ],
  hedge: [
    "Litter — remove all old litter",
    "Trim to shape — even and flat top",
    "Clear clippings from paths",
    "Pest & disease — check and report",
    "Edging at base",
  ],
};

const DEFAULT_TASKS = [
  "Litter — remove all old litter",
  "Weed control — ≤5% total cover",
  "Edging — vertical, smooth & neat",
  "Plant coverage — ≥95%",
];

interface JobPhoto {
  id: string;
  blobUrl: string;
  caption: string | null;
  createdAt: string;
}

function useJobPhotos(jobId: string) {
  return useQuery<{ data: JobPhoto[] }>({
    queryKey: ["job-photos", jobId],
    queryFn: async () => {
      const res = await fetch(getApiUrl(`/api/jobs/${jobId}/photos`), {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load photos");
      return res.json();
    },
    enabled: !!jobId,
  });
}

function useUploadPhoto(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ uri, caption }: { uri: string; caption?: string }) => {
      const form = new FormData();
      const filename = uri.split("/").pop() ?? "photo.jpg";
      const mimeType = filename.endsWith(".png") ? "image/png" : "image/jpeg";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      form.append("photo", { uri, name: filename, type: mimeType } as any);
      if (caption) form.append("caption", caption);
      const res = await fetch(getApiUrl(`/api/jobs/${jobId}/photos`), {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json() as Promise<JobPhoto>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job-photos", jobId] }),
  });
}

function PhotoSection({ jobId, isDone }: { jobId: string; isDone: boolean }) {
  const colors = useColors();
  const { data, isLoading } = useJobPhotos(jobId);
  const uploadPhoto = useUploadPhoto(jobId);
  const photos = data?.data ?? [];

  const pickFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow photo library access in Settings.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      uploadPhoto.mutate({ uri: result.assets[0].uri });
    }
  };

  const takePhoto = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Not supported", "Camera capture is not available on web. Use the library picker instead.");
      return;
    }
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow camera access in Settings.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      uploadPhoto.mutate({ uri: result.assets[0].uri });
    }
  };

  return (
    <View
      style={[
        styles.section,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
        },
      ]}
    >
      <View style={styles.sectionHeader}>
        <Feather name="camera" size={16} color={colors.primary} />
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Photo Evidence
        </Text>
        {photos.length > 0 && (
          <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>
            {photos.length}
          </Text>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ margin: 14 }} />
      ) : photos.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.photoRow}
        >
          {photos.map(photo => (
            <View key={photo.id} style={styles.photoThumb}>
              <Image
                source={{ uri: getApiUrl(photo.blobUrl) }}
                style={[styles.thumbImage, { borderRadius: colors.radius / 2 }]}
                resizeMode="cover"
              />
              {photo.caption ? (
                <Text
                  style={[styles.caption, { color: colors.mutedForeground }]}
                  numberOfLines={1}
                >
                  {photo.caption}
                </Text>
              ) : null}
            </View>
          ))}
        </ScrollView>
      ) : (
        <Text
          style={[
            styles.emptyPhotos,
            { color: colors.mutedForeground },
          ]}
        >
          No photos attached yet
        </Text>
      )}

      {!isDone && (
        <View style={[styles.photoActions, { borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[
              styles.photoBtn,
              {
                borderColor: colors.border,
                borderRadius: colors.radius,
                flex: 1,
              },
            ]}
            onPress={takePhoto}
            activeOpacity={0.8}
            disabled={uploadPhoto.isPending}
          >
            <Feather name="camera" size={15} color={colors.primary} />
            <Text style={[styles.photoBtnText, { color: colors.foreground }]}>
              Camera
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.photoBtn,
              {
                borderColor: colors.border,
                borderRadius: colors.radius,
                flex: 1,
              },
            ]}
            onPress={pickFromLibrary}
            activeOpacity={0.8}
            disabled={uploadPhoto.isPending}
          >
            {uploadPhoto.isPending ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Feather name="image" size={15} color={colors.primary} />
                <Text style={[styles.photoBtnText, { color: colors.foreground }]}>
                  Library
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function JobDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [checkedTasks, setCheckedTasks] = useState<Record<number, boolean>>({});
  const [notes, setNotes] = useState("");

  const { data: job, isLoading: jobLoading } = useGetJob(id ?? "");
  const { data: asset, isLoading: assetLoading } = useGetAsset(
    job?.assetId ?? "",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { enabled: !!job?.assetId } as any },
  );
  const updateJob = useUpdateJob();

  const tasks =
    TASKS_BY_GARDEN_TYPE[asset?.gardenType ?? ""] ?? DEFAULT_TASKS;
  const checkedCount = Object.values(checkedTasks).filter(Boolean).length;

  const toggleTask = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCheckedTasks((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const handleStart = () => {
    if (!id) return;
    Alert.alert("Start Job", "Record your start time now?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Start",
        onPress: () => {
          updateJob.mutate(
            { id, data: { status: "in_progress", startedAt: new Date().toISOString() } },
            {
              onSuccess: () => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              },
            },
          );
        },
      },
    ]);
  };

  const handleComplete = () => {
    if (!id) return;
    updateJob.mutate(
      {
        id,
        data: {
          status: "completed",
          completedAt: new Date().toISOString(),
          notes: notes.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
        },
      },
    );
  };

  const handleSkip = () => {
    if (!id) return;
    Alert.alert("Skip Job", "Mark this job as skipped?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Skip",
        style: "destructive",
        onPress: () => {
          updateJob.mutate(
            {
              id,
              data: {
                status: "skipped",
                notes: notes.trim() || undefined,
              },
            },
            {
              onSuccess: () => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                router.back();
              },
            },
          );
        },
      },
    ]);
  };

  const isLoading = jobLoading || assetLoading;
  const status = job?.status;
  const isActive = status === "in_progress";
  const isDone = status === "completed" || status === "skipped";

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 16);

  const hrs = asset ? Math.floor(asset.serviceTimeMins / 60) : 0;
  const mins = asset ? asset.serviceTimeMins % 60 : 0;
  const timeLabel = hrs > 0 ? `${hrs}h ${mins > 0 ? `${mins}m` : ""}`.trim() : `${mins}m`;

  if (isLoading) {
    return (
      <View
        style={[
          styles.loadingRoot,
          { backgroundColor: colors.background, paddingTop: topPad },
        ]}
      >
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!job || !asset) {
    return (
      <View
        style={[
          styles.loadingRoot,
          { backgroundColor: colors.background, paddingTop: topPad },
        ]}
      >
        <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
          Job not found.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
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
          style={[styles.backBtn, { backgroundColor: colors.background, borderRadius: colors.radius }]}
          onPress={() => router.back()}
          activeOpacity={0.75}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.navCenter}>
          <Text style={[styles.navSub, { color: colors.mutedForeground }]}>Job Instructions</Text>
          <Text style={[styles.navTitle, { color: colors.foreground }]} numberOfLines={1}>
            {asset.name}
          </Text>
        </View>
        <StatusBadge
          status={status as Parameters<typeof StatusBadge>[0]["status"]}
          small
        />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 80 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.infoGrid}>
          {[
            {
              icon: "map-pin" as const,
              label: "Location",
              value: asset.suburb ?? asset.streetAddress ?? "—",
            },
            {
              icon: "tag" as const,
              label: "Specification",
              value: GARDEN_TYPE_LABEL[asset.gardenType] ?? asset.gardenType,
            },
            {
              icon: "award" as const,
              label: "Standard",
              value: asset.standard.charAt(0).toUpperCase() + asset.standard.slice(1),
            },
            {
              icon: "clock" as const,
              label: "Time Allocated",
              value: timeLabel,
            },
          ].map(({ icon, label, value }) => (
            <View
              key={label}
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
                <Feather name={icon} size={13} color={colors.primary} />
                <Text style={[styles.infoTileLabel, { color: colors.mutedForeground }]}>
                  {label}
                </Text>
              </View>
              <Text style={[styles.infoTileValue, { color: colors.foreground }]}>
                {value}
              </Text>
            </View>
          ))}
        </View>

        {(asset.boundary || asset.lat) && (
          <View
            style={[
              styles.section,
              { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, overflow: "hidden", padding: 0 },
            ]}
          >
            <View style={[styles.sectionHeader, { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 }]}>
              <Feather name="map" size={16} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Garden Boundary</Text>
            </View>
            <BoundaryMap
              boundary={(asset as any).boundary}
              lat={asset.lat}
              lng={asset.lng}
              color={colors.primary}
              height={220}
            />
          </View>
        )}

        <View
          style={[
            styles.section,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: colors.radius,
            },
          ]}
        >
          <View style={styles.sectionHeader}>
            <Feather name="check-square" size={16} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Task Checklist
            </Text>
            <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>
              {checkedCount}/{tasks.length}
            </Text>
          </View>
          {tasks.map((task, i) => (
            <TouchableOpacity
              key={i}
              style={[
                styles.taskRow,
                i < tasks.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: colors.border,
                },
              ]}
              onPress={() => !isDone && toggleTask(i)}
              activeOpacity={isDone ? 1 : 0.75}
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    borderColor: checkedTasks[i] ? colors.primary : colors.border,
                    backgroundColor: checkedTasks[i] ? colors.primary : "transparent",
                  },
                ]}
              >
                {checkedTasks[i] ? (
                  <Feather name="check" size={12} color="#fff" />
                ) : null}
              </View>
              <Text
                style={[
                  styles.taskText,
                  {
                    color: checkedTasks[i] ? colors.mutedForeground : colors.foreground,
                    textDecorationLine: checkedTasks[i] ? "line-through" : "none",
                  },
                ]}
              >
                {task}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {id && <PhotoSection jobId={id} isDone={isDone} />}

        {!isDone && (
          <View
            style={[
              styles.section,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: colors.radius,
              },
            ]}
          >
            <View style={styles.sectionHeader}>
              <Feather name="edit-3" size={16} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Notes</Text>
            </View>
            <TextInput
              style={[
                styles.notesInput,
                {
                  color: colors.foreground,
                  borderColor: colors.border,
                  borderRadius: colors.radius,
                  backgroundColor: colors.background,
                },
              ]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Any observations or issues to note…"
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>
        )}
      </ScrollView>

      {!isDone && (
        <View
          style={[
            styles.actionBar,
            {
              backgroundColor: colors.card,
              borderTopColor: colors.border,
              paddingBottom: bottomPad,
            },
          ]}
        >
          {!isActive ? (
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                { backgroundColor: colors.primary, borderRadius: colors.radius },
              ]}
              onPress={handleStart}
              activeOpacity={0.85}
              disabled={updateJob.isPending}
            >
              {updateJob.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Feather name="play" size={18} color="#fff" />
                  <Text style={styles.primaryBtnText}>Start Job</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[
                  styles.secondaryBtn,
                  {
                    borderColor: colors.border,
                    borderRadius: colors.radius,
                    flex: 1,
                  },
                ]}
                onPress={handleSkip}
                activeOpacity={0.8}
              >
                <Feather name="skip-forward" size={16} color={colors.mutedForeground} />
                <Text style={[styles.secondaryBtnText, { color: colors.mutedForeground }]}>
                  Skip
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  {
                    backgroundColor: "#22c55e",
                    borderRadius: colors.radius,
                    flex: 2,
                  },
                ]}
                onPress={handleComplete}
                activeOpacity={0.85}
                disabled={updateJob.isPending}
              >
                {updateJob.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Feather name="check-circle" size={18} color="#fff" />
                    <Text style={styles.primaryBtnText}>Mark Complete</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loadingRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
  },
  navBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  navCenter: { flex: 1 },
  navSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginBottom: 1,
  },
  navTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
  scroll: { flex: 1 },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12,
  },
  infoTile: {
    width: "47.5%",
    borderWidth: 1,
    padding: 12,
  },
  infoTileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 6,
  },
  infoTileLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  infoTileValue: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  section: {
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 14,
    paddingBottom: 10,
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    flex: 1,
  },
  sectionCount: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    flexShrink: 0,
  },
  taskText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
  },
  photoRow: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 10,
    flexDirection: "row",
  },
  photoThumb: {
    width: 90,
  },
  thumbImage: {
    width: 90,
    height: 90,
  },
  caption: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginTop: 4,
  },
  emptyPhotos: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  photoActions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  photoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderWidth: 1,
  },
  photoBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  notesInput: {
    borderWidth: 1,
    margin: 14,
    marginTop: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    minHeight: 80,
  },
  actionBar: {
    padding: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  primaryBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#fff",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
});
