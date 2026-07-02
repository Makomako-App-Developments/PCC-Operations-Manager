import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { requestCameraPermission, requestMediaLibraryPermission } from "@/hooks/usePhotoLibraryPermission";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { getApiUrl } from "@/lib/api";
import { useOfflinePhotoQueue } from "@/hooks/useOfflinePhotoQueue";
import { PinMap } from "@/components/PinMap";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReactiveJob {
  id: string;
  issueType: string;
  description: string | null;
  location: string | null;
  locationLat: number | null;
  locationLng: number | null;
  assetId: string | null;
  status: string;
  priority: string;
  scheduledDate: string | null;
  estimatedTimeMins: number | null;
  notes: string | null;
  raisedAt: string;
  assignedTeamId: string | null;
}

interface JobPhoto {
  id: string;
  blobUrl: string;
  caption: string | null;
  createdAt: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  urgent:   { label: "Urgent",   color: "#c2410c", bg: "#fff7ed" },
  high:     { label: "High",     color: "#b45309", bg: "#fffbeb" },
  medium:   { label: "Medium",   color: "#0369a1", bg: "#eff6ff" },
  low:      { label: "Low",      color: "#15803d", bg: "#f0fdf4" },
  standard: { label: "Standard", color: "#0369a1", bg: "#eff6ff" },
  routine:  { label: "Routine",  color: "#15803d", bg: "#f0fdf4" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  raised:      { label: "Draft",       color: "#9333ea", bg: "#faf5ff", icon: "alert-circle" },
  assigned:    { label: "Assigned",    color: "#0369a1", bg: "#eff6ff", icon: "user-check" },
  in_progress: { label: "In Progress", color: "#d97706", bg: "#fffbeb", icon: "play-circle" },
  completed:   { label: "Completed",   color: "#15803d", bg: "#f0fdf4", icon: "check-circle" },
  cancelled:   { label: "Cancelled",   color: "#6b7280", bg: "#f9fafb", icon: "x-circle" },
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useReactiveJob(id: string) {
  return useQuery<ReactiveJob>({
    queryKey: ["reactive-job", id],
    queryFn: async () => {
      const res = await fetch(getApiUrl(`/api/reactive-jobs/${id}`), { credentials: "include" });
      if (!res.ok) throw new Error("Job not found");
      const body = await res.json();
      // API may wrap in data or return directly
      return (body.data ?? body) as ReactiveJob;
    },
    enabled: !!id,
  });
}

function useReactiveJobPhotos(id: string) {
  return useQuery<{ data: JobPhoto[] }>({
    queryKey: ["reactive-job-photos", id],
    queryFn: async () => {
      const res = await fetch(getApiUrl(`/api/reactive-jobs/${id}/photos`), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load attachments");
      return res.json();
    },
    enabled: !!id,
  });
}

function useUploadReactivePhoto(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ uri, file }: { uri: string; file?: File }): Promise<JobPhoto | { queued: true; uri: string }> => {
      try {
        const form = new FormData();
        if (Platform.OS === "web") {
          if (file) {
            form.append("photo", file);
          } else {
            const filename = uri.split("/").pop() ?? "photo.jpg";
            const mimeType = filename.endsWith(".png") ? "image/png" : "image/jpeg";
            const blob = await fetch(uri).then(r => r.blob());
            form.append("photo", new File([blob], filename, { type: mimeType }));
          }
        } else {
          const filename = uri.split("/").pop() ?? "photo.jpg";
          const mimeType = filename.endsWith(".png") ? "image/png" : "image/jpeg";
          form.append("photo", { uri, name: filename, type: mimeType } as any);
        }
        const res = await fetch(getApiUrl(`/api/reactive-jobs/${jobId}/photos`), {
          method: "POST",
          credentials: "include",
          body: form,
        });
        if (!res.ok) throw new Error("Upload failed");
        const photo = await res.json() as JobPhoto;
        qc.invalidateQueries({ queryKey: ["reactive-job-photos", jobId] });
        return photo;
      } catch (err) {
        if (Platform.OS !== "web" && err instanceof TypeError) {
          return { queued: true, uri };
        }
        throw err;
      }
    },
    onError: () => Alert.alert("Upload failed", "Could not upload photo. Please try again."),
  });
}

function useUpdateReactiveJobStatus(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (status: string) => {
      const res = await fetch(getApiUrl(`/api/reactive-jobs/${jobId}`), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Update failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reactive-job", jobId] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => Alert.alert("Update failed", "Could not update status. Please try again."),
  });
}

// ─── Photo Attachment Row ─────────────────────────────────────────────────────

function AttachmentsSection({ jobId, isDone }: { jobId: string; isDone: boolean }) {
  const colors = useColors();
  const { data, isLoading } = useReactiveJobPhotos(jobId);
  const upload = useUploadReactivePhoto(jobId);
  const { pending: queuedPhotos, isFlushing, add: addToQueue } = useOfflinePhotoQueue("reactive-job", jobId);
  const photos = data?.data ?? [];
  const totalCount = photos.length + queuedPhotos.length;

  const handleMutateResult = async (result: any, uri: string) => {
    if (result && result.queued === true) {
      await addToQueue(uri);
    }
  };

  const pickFromLibrary = async () => {
    if (!(await requestMediaLibraryPermission())) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      upload.mutate(
        { uri: asset.uri, file: (asset as any).file ?? undefined },
        { onSuccess: (r) => handleMutateResult(r, asset.uri) },
      );
    }
  };

  const takePhoto = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Not supported", "Camera capture is not available on web. Use the library picker instead.");
      return;
    }
    if (!(await requestCameraPermission())) return;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      upload.mutate(
        { uri, file: (result.assets[0] as any).file ?? undefined },
        { onSuccess: (r) => handleMutateResult(r, uri) },
      );
    }
  };

  const isImage = (url: string) => /\.(jpe?g|png|webp|gif|heic)$/i.test(url);

  return (
    <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
      <View style={styles.sectionHeader}>
        <Feather name="paperclip" size={16} color={colors.primary} />
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Attachments</Text>
        {totalCount > 0 && (
          <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>{totalCount}</Text>
        )}
        {(queuedPhotos.length > 0 || isFlushing) && (
          <View style={[styles.queueBadge, { backgroundColor: "#fef3c7" }]}>
            <Feather name={isFlushing ? "upload-cloud" : "clock"} size={11} color="#b45309" />
            <Text style={[styles.queueBadgeText, { color: "#b45309" }]}>
              {isFlushing ? "Uploading…" : `${queuedPhotos.length} queued`}
            </Text>
          </View>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginBottom: 14 }} />
      ) : totalCount === 0 ? (
        <Text style={[styles.emptyPhotos, { color: colors.mutedForeground }]}>No attachments yet</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.photoRow}
        >
          {photos.map(photo => (
            isImage(photo.blobUrl) ? (
              <TouchableOpacity
                key={photo.id}
                style={styles.photoThumb}
                onPress={() => Linking.openURL(getApiUrl(photo.blobUrl))}
                activeOpacity={0.8}
              >
                <Image
                  source={{ uri: getApiUrl(photo.blobUrl) }}
                  style={[styles.thumbImage, { borderRadius: colors.radius / 2, borderColor: colors.border }]}
                  resizeMode="cover"
                />
                {photo.caption ? (
                  <Text style={[styles.caption, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {photo.caption}
                  </Text>
                ) : null}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                key={photo.id}
                style={[styles.docThumb, { backgroundColor: colors.background, borderColor: colors.border, borderRadius: colors.radius / 2 }]}
                onPress={() => Linking.openURL(getApiUrl(photo.blobUrl))}
                activeOpacity={0.8}
              >
                <Feather name="file-text" size={24} color={colors.mutedForeground} />
                <Text style={[styles.caption, { color: colors.mutedForeground, textAlign: "center" }]} numberOfLines={2}>
                  {photo.caption ?? "Document"}
                </Text>
              </TouchableOpacity>
            )
          ))}
          {queuedPhotos.map(q => (
            <View key={q.id} style={styles.photoThumb}>
              <Image
                source={{ uri: q.uri }}
                style={[styles.thumbImage, { borderRadius: colors.radius / 2, borderColor: colors.border, opacity: 0.65 }]}
                resizeMode="cover"
              />
              <View style={[styles.queuedOverlay, { borderRadius: colors.radius / 2 }]}>
                <Feather name="clock" size={16} color="#fff" />
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {!isDone && (
        <View style={[styles.photoActions, { borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.photoBtn, { borderColor: colors.border, borderRadius: colors.radius, flex: 1 }]}
            onPress={takePhoto}
            activeOpacity={0.8}
            disabled={upload.isPending}
          >
            <Feather name="camera" size={15} color={colors.primary} />
            <Text style={[styles.photoBtnText, { color: colors.foreground }]}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.photoBtn, { borderColor: colors.border, borderRadius: colors.radius, flex: 1 }]}
            onPress={pickFromLibrary}
            activeOpacity={0.8}
            disabled={upload.isPending}
          >
            {upload.isPending ? (
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

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ReactiveJobDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);

  const { data: job, isLoading, refetch, isRefetching } = useReactiveJob(id ?? "");
  const updateStatus = useUpdateReactiveJobStatus(id ?? "");

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 16);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  };

  const formatRaisedAt = (dateStr: string) => {
    const d = new Date(dateStr);
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, "0");
    const ampm = h >= 12 ? "pm" : "am";
    const hour = h % 12 || 12;
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${hour}:${m}${ampm}`;
  };

  const handleUpdateStatus = (status: string) => {
    setPendingStatus(null);
    updateStatus.mutate(status, {
      onSuccess: () => refetch(),
    });
  };

  if (isLoading) {
    return (
      <View style={[styles.centre, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!job) {
    return (
      <View style={[styles.centre, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <Text style={[styles.errorText, { color: colors.mutedForeground }]}>Job not found.</Text>
      </View>
    );
  }

  const pConf = PRIORITY_CONFIG[job.priority] ?? PRIORITY_CONFIG.medium!;
  const sConf = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.raised!;
  const isDone = job.status === "completed" || job.status === "cancelled";
  const canStart = job.status === "assigned" || job.status === "raised";
  const isActive = job.status === "in_progress";

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
          <Text style={[styles.navSub, { color: colors.mutedForeground }]}>Unscheduled Work</Text>
          <Text style={[styles.navTitle, { color: colors.foreground }]} numberOfLines={1}>
            {job.issueType}
          </Text>
        </View>
        {/* Status badge */}
        <View style={[styles.statusPill, { backgroundColor: sConf.bg }]}>
          <Feather name={sConf.icon as any} size={11} color={sConf.color} />
          <Text style={[styles.statusPillText, { color: sConf.color }]}>{sConf.label}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
        }
      >
        {/* Raised timestamp + priority */}
        <View style={styles.metaRow}>
          <View style={[styles.priorityPill, { backgroundColor: pConf.bg }]}>
            <Text style={[styles.priorityPillText, { color: pConf.color }]}>{pConf.label} priority</Text>
          </View>
          <Text style={[styles.raisedAt, { color: colors.mutedForeground }]}>
            Raised {formatRaisedAt(job.raisedAt)}
          </Text>
        </View>

        {/* Unscheduled banner */}
        <View style={[styles.banner, { backgroundColor: "#fff7ed", borderColor: "#fed7aa" }]}>
          <Feather name="zap" size={15} color="#f59e0b" />
          <Text style={[styles.bannerText, { color: "#92400e" }]}>
            Unscheduled work — complete and add at least one photo as evidence.
          </Text>
        </View>

        {/* Description */}
        {job.description ? (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={styles.sectionHeader}>
              <Feather name="file-text" size={16} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Description</Text>
            </View>
            <Text style={[styles.bodyText, { color: colors.foreground }]}>{job.description}</Text>
          </View>
        ) : null}

        {/* Location section */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, overflow: "hidden" }]}>
          <View style={[styles.sectionHeader, { paddingBottom: 6 }]}>
            <Feather name="map-pin" size={16} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Site / Location</Text>
          </View>
          <Text style={[styles.bodyText, { color: colors.foreground, marginBottom: job.locationLat != null ? 12 : 0 }]}>
            {job.location ?? "—"}
          </Text>
          {job.locationLat != null && job.locationLng != null && (
            <>
              <View style={{ borderRadius: colors.radius, overflow: "hidden", marginHorizontal: -16, height: 220 }}>
                <PinMap lat={job.locationLat} lng={job.locationLng} height={220} />
              </View>
              <TouchableOpacity
                style={[styles.navigateBtn, { backgroundColor: colors.primary, borderRadius: colors.radius, marginTop: 12 }]}
                onPress={() => {
                  const url = Platform.select({
                    ios: `maps://maps.apple.com/?q=${job.locationLat},${job.locationLng}&ll=${job.locationLat},${job.locationLng}&z=17`,
                    android: `geo:${job.locationLat},${job.locationLng}?z=17`,
                    default: `https://maps.google.com/?q=${job.locationLat},${job.locationLng}`,
                  });
                  Linking.openURL(url!);
                }}
                activeOpacity={0.85}
              >
                <Feather name="navigation" size={15} color="#fff" />
                <Text style={styles.navigateBtnText}>Navigate Here</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Details grid */}
        <View style={styles.infoGrid}>

          {/* Scheduled date */}
          <View style={[styles.infoTile, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={styles.infoTileHeader}>
              <Feather name="calendar" size={13} color={colors.primary} />
              <Text style={[styles.infoTileLabel, { color: colors.mutedForeground }]}>Scheduled</Text>
            </View>
            <Text style={[styles.infoTileValue, { color: colors.foreground }]}>
              {job.scheduledDate ? formatDate(job.scheduledDate) : "Not set"}
            </Text>
          </View>

          {/* Time estimate */}
          <View style={[styles.infoTile, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={styles.infoTileHeader}>
              <Feather name="clock" size={13} color={colors.primary} />
              <Text style={[styles.infoTileLabel, { color: colors.mutedForeground }]}>Est. Time</Text>
            </View>
            <Text style={[styles.infoTileValue, { color: colors.foreground }]}>
              {job.estimatedTimeMins != null ? `${job.estimatedTimeMins} min` : "—"}
            </Text>
          </View>
        </View>

        {/* Notes */}
        {job.notes ? (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={styles.sectionHeader}>
              <Feather name="message-square" size={16} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Notes</Text>
            </View>
            <Text style={[styles.bodyText, { color: colors.foreground }]}>{job.notes}</Text>
          </View>
        ) : null}

        {/* Attachments */}
        <AttachmentsSection jobId={id ?? ""} isDone={isDone} />
      </ScrollView>

      {/* Action bar — only shown when not done/cancelled */}
      {!isDone && (
        <View style={[styles.actionBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: bottomPad }]}>
          {pendingStatus ? (
            <View style={styles.confirmBar}>
              <Text style={[styles.confirmMsg, { color: colors.foreground }]}>
                {pendingStatus === "in_progress" ? "Mark this job as in progress?" : "Mark this job as complete?"}
              </Text>
              <View style={styles.confirmRow}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: colors.border, borderRadius: colors.radius }]}
                  onPress={() => setPendingStatus(null)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, {
                    backgroundColor: pendingStatus === "completed" ? "#22c55e" : colors.primary,
                    borderRadius: colors.radius,
                  }]}
                  onPress={() => handleUpdateStatus(pendingStatus)}
                  activeOpacity={0.85}
                  disabled={updateStatus.isPending}
                >
                  {updateStatus.isPending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.confirmBtnText}>
                      {pendingStatus === "completed" ? "Confirm Complete" : "Confirm"}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : canStart ? (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
              onPress={() => setPendingStatus("in_progress")}
              activeOpacity={0.85}
            >
              <Feather name="play" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Start Job</Text>
            </TouchableOpacity>
          ) : isActive ? (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: "#22c55e", borderRadius: colors.radius }]}
              onPress={() => setPendingStatus("completed")}
              activeOpacity={0.85}
            >
              <Feather name="check-circle" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Mark Complete</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
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
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    flexShrink: 0,
  },
  statusPillText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },

  scroll: { flex: 1 },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  priorityPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  priorityPillText: { fontFamily: "Inter_700Bold", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  raisedAt: { fontFamily: "Inter_400Regular", fontSize: 12 },

  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  bannerText: { fontFamily: "Inter_500Medium", fontSize: 13, flex: 1, lineHeight: 18 },

  section: { borderWidth: 1, overflow: "hidden", marginBottom: 12 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, padding: 14, paddingBottom: 10 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, flex: 1 },
  sectionCount: { fontFamily: "Inter_500Medium", fontSize: 13 },
  bodyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },

  infoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 },
  infoTile: { width: "47.5%", borderWidth: 1, padding: 12 },
  infoTileWide: { width: "100%" },
  infoTileHeader: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 },
  infoTileLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    flex: 1,
  },
  infoTileValue: { fontFamily: "Inter_600SemiBold", fontSize: 14 },

  photoRow: { paddingHorizontal: 14, paddingBottom: 14, gap: 10, flexDirection: "row" },
  photoThumb: { width: 90 },
  thumbImage: { width: 90, height: 90, borderWidth: 1 },
  queuedOverlay: {
    position: "absolute", top: 0, left: 0, width: 90, height: 90,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  queueBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10,
  },
  queueBadgeText: { fontFamily: "Inter_500Medium", fontSize: 11 },
  docThumb: {
    width: 90,
    height: 90,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    gap: 6,
  },
  caption: { fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 4 },
  emptyPhotos: { fontFamily: "Inter_400Regular", fontSize: 13, paddingHorizontal: 14, paddingBottom: 14 },
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
  photoBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },

  actionBar: { padding: 16, paddingTop: 12, borderTopWidth: 1 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  primaryBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },

  confirmBar: { gap: 10 },
  confirmMsg: { fontFamily: "Inter_600SemiBold", fontSize: 14, textAlign: "center" },
  confirmRow: { flexDirection: "row", gap: 10 },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderWidth: 1,
  },
  cancelBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  confirmBtn: {
    flex: 2,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
  },
  confirmBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" },

  navigateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    marginHorizontal: 14,
    marginBottom: 14,
  },
  navigateBtnText: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#fff" },
});
