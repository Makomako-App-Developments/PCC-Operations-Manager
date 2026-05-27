import { Feather } from "@expo/vector-icons";
import {
  useGetAsset,
  useGetJob,
  useUpdateJob,
  getGetJobQueryKey,
  getListJobsQueryKey,
  getGetScheduleWeekQueryKey,
} from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState, useEffect, useRef } from "react";
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
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { StatusBadge } from "@/components/StatusBadge";
import { BoundaryMap } from "@/components/BoundaryMap";
import { SpecModal } from "@/components/SpecModal";
import { useColors } from "@/hooks/useColors";
import { getApiUrl } from "@/lib/api";

// ─── Task definitions ────────────────────────────────────────────────────────

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

// ─── Types ───────────────────────────────────────────────────────────────────

interface JobPhoto {
  id: string;
  blobUrl: string;
  caption: string | null;
  createdAt: string;
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useJobPhotos(jobId: string) {
  return useQuery<{ data: JobPhoto[] }>({
    queryKey: ["job-photos", jobId],
    queryFn: async () => {
      const res = await fetch(getApiUrl(`/api/jobs/${jobId}/photos`), { credentials: "include" });
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

function usePostTaskSkipReason(jobId: string) {
  return useMutation({
    mutationFn: async (body: { taskIndex: number; taskLabel: string; reason: string }) => {
      const res = await fetch(getApiUrl(`/api/jobs/${jobId}/task-skip-reasons`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save skip reason");
      return res.json();
    },
  });
}

function useTeamComplete(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ notes }: { notes?: string }) => {
      const res = await fetch(getApiUrl(`/api/jobs/${jobId}/team-complete`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error("Sign-off failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["job", jobId] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

// ─── Photo Section ────────────────────────────────────────────────────────────

function PhotoSection({ jobId, readOnly }: { jobId: string; readOnly: boolean }) {
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
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (!result.canceled && result.assets[0]) {
      uploadPhoto.mutate({ uri: result.assets[0].uri });
    }
  };

  return (
    <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
      <View style={styles.sectionHeader}>
        <Feather name="camera" size={16} color={colors.primary} />
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Photo Evidence</Text>
        {photos.length > 0 && (
          <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>{photos.length}</Text>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ margin: 14 }} />
      ) : photos.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
          {photos.map(photo => (
            <View key={photo.id} style={styles.photoThumb}>
              <Image
                source={{ uri: getApiUrl(photo.blobUrl) }}
                style={[styles.thumbImage, { borderRadius: colors.radius / 2 }]}
                resizeMode="cover"
              />
              {photo.caption ? (
                <Text style={[styles.caption, { color: colors.mutedForeground }]} numberOfLines={1}>{photo.caption}</Text>
              ) : null}
            </View>
          ))}
        </ScrollView>
      ) : (
        <Text style={[styles.emptyPhotos, { color: colors.mutedForeground }]}>No photos attached yet</Text>
      )}

      {!readOnly && (
        <View style={[styles.photoActions, { borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.photoBtn, { borderColor: colors.border, borderRadius: colors.radius, flex: 1 }]}
            onPress={takePhoto}
            activeOpacity={0.8}
            disabled={uploadPhoto.isPending}
          >
            <Feather name="camera" size={15} color={colors.primary} />
            <Text style={[styles.photoBtnText, { color: colors.foreground }]}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.photoBtn, { borderColor: colors.border, borderRadius: colors.radius, flex: 1 }]}
            onPress={pickFromLibrary}
            activeOpacity={0.8}
            disabled={uploadPhoto.isPending}
          >
            {uploadPhoto.isPending ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Feather name="image" size={15} color={colors.primary} />
                <Text style={[styles.photoBtnText, { color: colors.foreground }]}>Library</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Task Skip Reason Modal ───────────────────────────────────────────────────

interface SkipReasonModalProps {
  tasks: { index: number; label: string }[];
  onConfirm: (reasons: { taskIndex: number; taskLabel: string; reason: string }[]) => void;
  onCancel: () => void;
}

function TaskSkipReasonModal({ tasks, onConfirm, onCancel }: SkipReasonModalProps) {
  const colors = useColors();
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [current, setCurrent] = useState(0);

  const task = tasks[current];
  const reason = reasons[task.index] ?? "";
  const isLast = current === tasks.length - 1;

  const handleNext = () => {
    if (!reason.trim()) return;
    if (isLast) {
      const result = tasks.map(t => ({ taskIndex: t.index, taskLabel: t.label, reason: reasons[t.index]?.trim() ?? "" }));
      onConfirm(result);
    } else {
      setCurrent(c => c + 1);
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={[styles.skipModalRoot, { backgroundColor: colors.background }]}>
          <View style={[styles.skipModalHeader, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.skipModalSub, { color: colors.mutedForeground }]}>
                Skipped task {current + 1} of {tasks.length}
              </Text>
              <Text style={[styles.skipModalTitle, { color: colors.foreground }]}>Reason required</Text>
            </View>
            <TouchableOpacity onPress={onCancel} style={{ padding: 4 }}>
              <Feather name="x" size={20} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <View style={styles.skipModalBody}>
            <View style={[styles.skipTaskCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <Feather name="alert-circle" size={16} color="#f59e0b" />
              <Text style={[styles.skipTaskLabel, { color: colors.foreground }]}>{task.label}</Text>
            </View>

            <Text style={[styles.skipReasonLabel, { color: colors.mutedForeground }]}>
              Why wasn't this task completed?
            </Text>
            <TextInput
              style={[styles.skipReasonInput, { color: colors.foreground, borderColor: reason.trim() ? colors.primary : colors.border, borderRadius: colors.radius, backgroundColor: colors.background }]}
              value={reason}
              onChangeText={v => setReasons(prev => ({ ...prev, [task.index]: v }))}
              placeholder="Enter reason…"
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              autoFocus
            />
          </View>

          <View style={[styles.skipModalFooter, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
            <TouchableOpacity
              style={[styles.skipCancelBtn, { borderColor: colors.border, borderRadius: colors.radius }]}
              onPress={onCancel}
              activeOpacity={0.8}
            >
              <Text style={[styles.skipCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.skipNextBtn, { backgroundColor: reason.trim() ? colors.primary : colors.border, borderRadius: colors.radius }]}
              onPress={handleNext}
              disabled={!reason.trim()}
              activeOpacity={0.85}
            >
              <Text style={styles.skipNextText}>{isLast ? "Done" : "Next"}</Text>
              <Feather name={isLast ? "check" : "arrow-right"} size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const TODAY = new Date().toISOString().split("T")[0]!;

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function JobDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [checkedTasks, setCheckedTasks] = useState<Record<number, boolean>>({});
  const [specModalOpen, setSpecModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<"start" | "complete" | "pause" | "resume" | "skip" | null>(null);
  const [skipTasks, setSkipTasks] = useState<{ index: number; label: string }[] | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const queryClient = useQueryClient();

  const { data: job, isLoading: jobLoading } = useGetJob(id ?? "");
  const { data: asset, isLoading: assetLoading } = useGetAsset(
    job?.assetId ?? "",
    { query: { enabled: !!job?.assetId } as any },
  );
  const { data: photosData } = useJobPhotos(id ?? "");
  const updateJob = useUpdateJob();
  const teamComplete = useTeamComplete(id ?? "");
  const postSkipReason = usePostTaskSkipReason(id ?? "");
  const isAllTeams = !!(job as any)?.isAllTeams;

  const invalidateJob = () => {
    if (id) {
      queryClient.invalidateQueries({ queryKey: getGetJobQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
      // Invalidate the schedule week so the Today screen reflects the new status
      queryClient.invalidateQueries({ queryKey: getGetScheduleWeekQueryKey({ week: TODAY }) });
    }
  };

  // Timer — counts down remaining time, accounts for paused elapsed seconds
  useEffect(() => {
    const startedAt = (job as any)?.startedAt;
    const pausedElapsedSecs: number = (job as any)?.pausedElapsedSecs ?? 0;
    const totalSecs = asset ? asset.serviceTimeMins * 60 : null;
    const status = job?.status;

    if (status !== "in_progress" || !totalSecs || !startedAt) {
      if (timerRef.current) clearInterval(timerRef.current);
      setRemainingSeconds(null);
      return;
    }

    const calcRemaining = () => {
      const wallElapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
      const activeElapsed = wallElapsed - pausedElapsedSecs;
      return totalSecs - activeElapsed;
    };

    setRemainingSeconds(calcRemaining());
    timerRef.current = setInterval(() => setRemainingSeconds(calcRemaining()), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [job?.status, (job as any)?.startedAt, (job as any)?.pausedElapsedSecs, asset?.serviceTimeMins]);

  const tasks = TASKS_BY_GARDEN_TYPE[asset?.gardenType ?? ""] ?? DEFAULT_TASKS;
  const checkedCount = Object.values(checkedTasks).filter(Boolean).length;
  const photoCount = photosData?.data?.length ?? 0;

  const toggleTask = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCheckedTasks(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const handleStart = () => setPendingAction("start");
  const handlePause = () => setPendingAction("pause");
  const handleResume = () => setPendingAction("resume");
  const handleSkipJob = () => setPendingAction("skip");

  const handleComplete = () => {
    setPhotoError(false);
    // Check photos
    if (photoCount === 0) {
      setPhotoError(true);
      return;
    }
    // Check tasks — collect unchecked ones
    const unchecked = tasks
      .map((label, index) => ({ index, label }))
      .filter(t => !checkedTasks[t.index]);
    if (unchecked.length > 0) {
      setSkipTasks(unchecked);
      return;
    }
    setPendingAction("complete");
  };

  const handleSkipReasonsConfirmed = async (
    reasons: { taskIndex: number; taskLabel: string; reason: string }[]
  ) => {
    setSkipTasks(null);
    // Save each skip reason individually
    for (const r of reasons) {
      await postSkipReason.mutateAsync(r).catch(() => {});
    }
    setPendingAction("complete");
  };

  const execMutate = (status: string, extra?: Record<string, unknown>) => {
    updateJob.mutate(
      { id: id!, data: { status, ...extra } as any },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setPendingAction(null);
          invalidateJob();
        },
        onError: () => setPendingAction(null),
      },
    );
  };

  const handleConfirm = () => {
    if (!id || !pendingAction) return;
    if (pendingAction === "start") {
      execMutate("in_progress");
    } else if (pendingAction === "resume") {
      execMutate("in_progress");
    } else if (pendingAction === "pause") {
      execMutate("paused");
    } else if (pendingAction === "skip") {
      updateJob.mutate(
        { id, data: { status: "skipped" } as any },
        {
          onSuccess: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            setPendingAction(null);
            invalidateJob();
            router.back();
          },
          onError: () => setPendingAction(null),
        },
      );
    } else if (pendingAction === "complete") {
      if (isAllTeams) {
        teamComplete.mutate(
          {},
          {
            onSuccess: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setPendingAction(null);
              invalidateJob();
              router.back();
            },
            onError: () => setPendingAction(null),
          },
        );
      } else {
        updateJob.mutate(
          { id, data: { status: "completed" } as any },
          {
            onSuccess: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setPendingAction(null);
              invalidateJob();
              router.back();
            },
            onError: () => setPendingAction(null),
          },
        );
      }
    }
  };

  const isLoading = jobLoading || assetLoading;
  const isMutating = updateJob.isPending || teamComplete.isPending || postSkipReason.isPending;
  const status = job?.status;
  const isPending = status === "pending";
  const isActive = status === "in_progress";
  const isPaused = status === "paused";
  const isDone = status === "completed" || status === "skipped";
  const isActionable = isPending || isActive || isPaused;

  const formatTimer = (secs: number) => {
    const isOver = secs < 0;
    const abs = Math.abs(secs);
    const h = Math.floor(abs / 3600);
    const m = Math.floor((abs % 3600) / 60);
    const s = abs % 60;
    const parts = h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
    return isOver ? `-${parts}` : parts;
  };

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 16);

  const hrs = asset ? Math.floor(asset.serviceTimeMins / 60) : 0;
  const mins = asset ? asset.serviceTimeMins % 60 : 0;
  const timeLabel = hrs > 0 ? `${hrs}h ${mins > 0 ? `${mins}m` : ""}`.trim() : `${mins}m`;

  if (isLoading) {
    return (
      <View style={[styles.loadingRoot, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!job || !asset) {
    return (
      <View style={[styles.loadingRoot, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <Text style={[styles.errorText, { color: colors.mutedForeground }]}>Job not found.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Nav bar */}
      <View style={[styles.navBar, { backgroundColor: colors.card, borderBottomColor: colors.border, paddingTop: topPad + 8 }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: colors.background, borderRadius: colors.radius }]}
          onPress={() => router.back()}
          activeOpacity={0.75}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.navCenter}>
          <Text style={[styles.navSub, { color: colors.mutedForeground }]}>Job Instructions</Text>
          <Text style={[styles.navTitle, { color: colors.foreground }]} numberOfLines={1}>{asset.name}</Text>
        </View>
        <StatusBadge status={status as Parameters<typeof StatusBadge>[0]["status"]} small />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Info tiles */}
        <View style={styles.infoGrid}>
          {/* Description — full width, first */}
          {(asset as any).description ? (
            <View style={[styles.infoTile, styles.infoTileWide, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <View style={styles.infoTileHeader}>
                <Feather name="info" size={13} color={colors.primary} />
                <Text style={[styles.infoTileLabel, { color: colors.mutedForeground }]}>Description</Text>
              </View>
              <Text style={[styles.infoTileValue, { color: colors.foreground }]}>{(asset as any).description}</Text>
            </View>
          ) : null}

          {/* Suburb */}
          <View style={[styles.infoTile, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={styles.infoTileHeader}>
              <Feather name="map-pin" size={13} color={colors.primary} />
              <Text style={[styles.infoTileLabel, { color: colors.mutedForeground }]}>Suburb</Text>
            </View>
            <Text style={[styles.infoTileValue, { color: colors.foreground }]}>
              {asset.suburb ?? (asset as any).streetAddress ?? "—"}
            </Text>
          </View>

          {/* Specification — tappable */}
          <TouchableOpacity
            style={[styles.infoTile, styles.infoTileTappable, { backgroundColor: colors.card, borderColor: colors.primary + "60", borderRadius: colors.radius }]}
            onPress={() => setSpecModalOpen(true)}
            activeOpacity={0.75}
          >
            <View style={styles.infoTileHeader}>
              <Feather name="book-open" size={13} color={colors.primary} />
              <Text style={[styles.infoTileLabel, { color: colors.primary }]}>Specification</Text>
              <Feather name="chevron-right" size={12} color={colors.primary} style={{ marginLeft: "auto" }} />
            </View>
            <Text style={[styles.infoTileValue, { color: colors.foreground }]}>
              {GARDEN_TYPE_LABEL[asset.gardenType] ?? asset.gardenType}
            </Text>
          </TouchableOpacity>

          {/* Time Allocated */}
          <View style={[styles.infoTile, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={styles.infoTileHeader}>
              <Feather name="clock" size={13} color={colors.primary} />
              <Text style={[styles.infoTileLabel, { color: colors.mutedForeground }]}>Time Allocated</Text>
            </View>
            <Text style={[styles.infoTileValue, { color: colors.foreground }]}>{timeLabel}</Text>
          </View>
        </View>

        {/* All Teams banner */}
        {isAllTeams && (
          <View style={[styles.allTeamsBanner, { backgroundColor: "#00AECD18", borderColor: "#00AECD40" }]}>
            <Feather name="users" size={15} color="#00AECD" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.allTeamsBannerTitle, { color: "#00AECD" }]}>All Teams Job</Text>
              <Text style={[styles.allTeamsBannerSub, { color: "#00AECD" }]}>
                Every team works this site and signs off independently. Your sign-off records your team's completion.
              </Text>
            </View>
          </View>
        )}

        {/* Garden Boundary Map */}
        {((asset as any).boundary || asset.lat) && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, overflow: "hidden", padding: 0 }]}>
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

        {/* Task list — read-only (preview) or checkable (active/paused) */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <View style={styles.sectionHeader}>
            <Feather name={isActive || isPaused ? "check-square" : "list"} size={16} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {isActive || isPaused ? "Task Checklist" : "Tasks to Complete"}
            </Text>
            {(isActive || isPaused) && (
              <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>
                {checkedCount}/{tasks.length}
              </Text>
            )}
          </View>
          {tasks.map((task, i) => {
            const isChecked = !!checkedTasks[i];
            const canCheck = isActive || isPaused;
            return (
              <TouchableOpacity
                key={i}
                style={[
                  styles.taskRow,
                  i < tasks.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                ]}
                onPress={() => canCheck && toggleTask(i)}
                activeOpacity={canCheck ? 0.75 : 1}
              >
                {canCheck ? (
                  <View style={[styles.checkbox, { borderColor: isChecked ? colors.primary : colors.border, backgroundColor: isChecked ? colors.primary : "transparent" }]}>
                    {isChecked && <Feather name="check" size={12} color="#fff" />}
                  </View>
                ) : (
                  <View style={[styles.taskBullet, { backgroundColor: colors.primary }]} />
                )}
                <Text style={[styles.taskText, { color: isChecked ? colors.mutedForeground : colors.foreground, textDecorationLine: isChecked ? "line-through" : "none" }]}>
                  {task}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Asset Notes — read-only, sourced from asset record */}
        {(asset as any).notes ? (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={styles.sectionHeader}>
              <Feather name="file-text" size={16} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Notes</Text>
            </View>
            <Text style={[styles.notesText, { color: colors.foreground }]}>{(asset as any).notes}</Text>
          </View>
        ) : null}

        {/* Photo evidence — only shown while active or done */}
        {(isActive || isPaused || isDone) && id && (
          <>
            <PhotoSection jobId={id} readOnly={isDone} />
            {photoError && (
              <View style={[styles.photoErrorBanner, { backgroundColor: "#fee2e2", borderColor: "#fca5a5" }]}>
                <Feather name="alert-circle" size={14} color="#ef4444" />
                <Text style={[styles.photoErrorText, { color: "#ef4444" }]}>
                  At least 1 photo is required before completing this job.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Action bar */}
      {isActionable && (
        <View style={[styles.actionBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: bottomPad }]}>
          {pendingAction ? (
            // Inline confirmation
            <View style={styles.confirmBar}>
              <Text style={[styles.confirmMsg, { color: colors.foreground }]}>
                {pendingAction === "start" ? "Start this job now?" :
                 pendingAction === "resume" ? "Resume this job?" :
                 pendingAction === "pause" ? "Pause and come back later?" :
                 pendingAction === "skip" ? "Mark this job as skipped?" :
                 isAllTeams ? "Sign off for your team?" : "Mark as complete?"}
              </Text>
              <View style={styles.confirmRow}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: colors.border, borderRadius: colors.radius }]}
                  onPress={() => setPendingAction(null)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, {
                    backgroundColor:
                      pendingAction === "skip" ? "#ef4444" :
                      pendingAction === "pause" ? "#f59e0b" :
                      pendingAction === "complete" ? "#22c55e" :
                      colors.primary,
                    borderRadius: colors.radius,
                  }]}
                  onPress={handleConfirm}
                  activeOpacity={0.85}
                  disabled={isMutating}
                >
                  {isMutating ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.confirmBtnText}>
                      {pendingAction === "start" ? "Start" :
                       pendingAction === "resume" ? "Resume" :
                       pendingAction === "pause" ? "Pause" :
                       pendingAction === "skip" ? "Skip Job" :
                       isAllTeams ? "Sign Off" : "Complete"}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : isPending ? (
            // Preview state: Start + Skip
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: colors.border, borderRadius: colors.radius, flex: 1 }]}
                onPress={handleSkipJob}
                activeOpacity={0.8}
              >
                <Feather name="skip-forward" size={16} color={colors.mutedForeground} />
                <Text style={[styles.secondaryBtnText, { color: colors.mutedForeground }]}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary, borderRadius: colors.radius, flex: 2 }]}
                onPress={handleStart}
                activeOpacity={0.85}
                disabled={isMutating}
              >
                <Feather name="play" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>Start Job</Text>
              </TouchableOpacity>
            </View>
          ) : isPaused ? (
            // Paused state: Resume
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: "#f59e0b", borderRadius: colors.radius }]}
              onPress={handleResume}
              activeOpacity={0.85}
              disabled={isMutating}
            >
              <Feather name="play" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Resume Job</Text>
            </TouchableOpacity>
          ) : (
            // Active state: timer + Pause + Mark Complete
            <View style={{ gap: 10 }}>
              {remainingSeconds !== null && (
                <View style={[styles.timerRow, {
                  borderColor: remainingSeconds < 0 ? "#fca5a5" : `${colors.primary}40`,
                  backgroundColor: remainingSeconds < 0 ? "#fee2e2" : `${colors.primary}12`,
                }]}>
                  <Feather name="clock" size={14} color={remainingSeconds < 0 ? "#ef4444" : colors.primary} />
                  <Text style={[styles.timerLabel, { color: remainingSeconds < 0 ? "#ef4444" : colors.foreground }]}>
                    {remainingSeconds >= 0 ? "Time remaining" : "Over time"}
                  </Text>
                  <Text style={[styles.timerValue, { color: remainingSeconds < 0 ? "#ef4444" : colors.primary }]}>
                    {formatTimer(remainingSeconds)}
                  </Text>
                </View>
              )}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.secondaryBtn, { borderColor: "#f59e0b60", borderRadius: colors.radius, flex: 1 }]}
                  onPress={handlePause}
                  activeOpacity={0.8}
                >
                  <Feather name="pause" size={16} color="#f59e0b" />
                  <Text style={[styles.secondaryBtnText, { color: "#f59e0b" }]}>Pause</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: "#22c55e", borderRadius: colors.radius, flex: 2 }]}
                  onPress={handleComplete}
                  activeOpacity={0.85}
                  disabled={isMutating}
                >
                  {isMutating ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Feather name={isAllTeams ? "users" : "check-circle"} size={18} color="#fff" />
                      <Text style={styles.primaryBtnText}>{isAllTeams ? "Sign Off" : "Mark Complete"}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Spec modal */}
      <SpecModal
        visible={specModalOpen}
        gardenType={asset.gardenType}
        onClose={() => setSpecModalOpen(false)}
      />

      {/* Task skip reason modal */}
      {skipTasks && (
        <TaskSkipReasonModal
          tasks={skipTasks}
          onConfirm={handleSkipReasonsConfirmed}
          onCancel={() => setSkipTasks(null)}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  loadingRoot: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 16 },
  navBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  navCenter: { flex: 1 },
  navSub: { fontFamily: "Inter_400Regular", fontSize: 11, marginBottom: 1 },
  navTitle: { fontFamily: "Inter_700Bold", fontSize: 15 },
  scroll: { flex: 1 },
  infoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 },
  infoTile: { width: "47.5%", borderWidth: 1, padding: 12 },
  infoTileTappable: { borderWidth: 1.5 },
  infoTileWide: { width: "100%" },
  infoTileHeader: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 },
  infoTileLabel: { fontFamily: "Inter_500Medium", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, flex: 1 },
  infoTileValue: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  allTeamsBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12,
  },
  allTeamsBannerTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, marginBottom: 2 },
  allTeamsBannerSub: { fontFamily: "Inter_400Regular", fontSize: 12, opacity: 0.85 },
  section: { borderWidth: 1, overflow: "hidden", marginBottom: 12 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, padding: 14, paddingBottom: 10 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, flex: 1 },
  sectionCount: { fontFamily: "Inter_500Medium", fontSize: 13 },
  taskRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  checkbox: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center", marginTop: 1, flexShrink: 0 },
  taskBullet: { width: 6, height: 6, borderRadius: 3, marginTop: 6, flexShrink: 0 },
  taskText: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, flex: 1 },
  photoRow: { paddingHorizontal: 14, paddingBottom: 14, gap: 10, flexDirection: "row" },
  photoThumb: { width: 90 },
  thumbImage: { width: 90, height: 90 },
  caption: { fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 4 },
  emptyPhotos: { fontFamily: "Inter_400Regular", fontSize: 13, paddingHorizontal: 14, paddingBottom: 14 },
  photoActions: {
    flexDirection: "row", gap: 10,
    paddingHorizontal: 14, paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12,
  },
  photoBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 10, borderWidth: 1,
  },
  photoBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  photoErrorBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 12,
  },
  photoErrorText: { fontFamily: "Inter_500Medium", fontSize: 13, flex: 1 },
  notesText: {
    fontFamily: "Inter_400Regular", fontSize: 14,
    lineHeight: 20, paddingHorizontal: 14, paddingBottom: 14,
  },
  actionBar: { padding: 16, paddingTop: 12, borderTopWidth: 1 },
  actionRow: { flexDirection: "row", gap: 10 },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14,
  },
  primaryBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },
  secondaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 14, borderWidth: 1,
  },
  secondaryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  timerRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1,
  },
  timerLabel: { fontFamily: "Inter_500Medium", fontSize: 13, flex: 1 },
  timerValue: { fontFamily: "Inter_700Bold", fontSize: 18, letterSpacing: 0.5 },
  confirmBar: { gap: 10 },
  confirmMsg: { fontFamily: "Inter_600SemiBold", fontSize: 14, textAlign: "center" },
  confirmRow: { flexDirection: "row", gap: 10 },
  cancelBtn: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingVertical: 13, borderWidth: 1,
  },
  cancelBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  confirmBtn: {
    flex: 2, alignItems: "center", justifyContent: "center", paddingVertical: 13,
  },
  confirmBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" },
  // Skip reason modal
  skipModalRoot: { flex: 1 },
  skipModalHeader: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16,
    paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  skipModalSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 2 },
  skipModalTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  skipModalBody: { flex: 1, padding: 16 },
  skipTaskCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 14, borderWidth: 1, marginBottom: 20,
  },
  skipTaskLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14, flex: 1 },
  skipReasonLabel: { fontFamily: "Inter_500Medium", fontSize: 13, marginBottom: 8 },
  skipReasonInput: {
    borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, fontFamily: "Inter_400Regular", minHeight: 100,
  },
  skipModalFooter: {
    flexDirection: "row", gap: 10, padding: 16, borderTopWidth: StyleSheet.hairlineWidth,
  },
  skipCancelBtn: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingVertical: 13, borderWidth: 1,
  },
  skipCancelText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  skipNextBtn: {
    flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 13,
  },
  skipNextText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" },
});
