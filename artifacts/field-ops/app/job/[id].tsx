import { Feather } from "@expo/vector-icons";
import {
  useGetAsset,
  useGetJob,
  useGetScheduleWeek,
  useUpdateJob,
  getGetJobQueryKey,
  getListJobsQueryKey,
  getGetScheduleWeekQueryKey,
} from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { requestCameraPermission, requestMediaLibraryPermission } from "@/hooks/usePhotoLibraryPermission";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
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
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { StatusBadge } from "@/components/StatusBadge";
import { BoundaryMap } from "@/components/BoundaryMap";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { getApiUrl } from "@/lib/api";
import { useOfflinePhotoQueue } from "@/hooks/useOfflinePhotoQueue";

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

const UNIVERSAL_PREVIEW_TASKS = [
  "Litter — remove all old litter",
  "Weed control – remove all weeds",
  "Pest Plants – remove and note all pest plants",
  "Ensure mulch is: Clear of trunks/stems/crowns, evenly spread, not spilling over garden edge",
  "Pruning – maintain clearance from assets, pedestrians and carriageways. Shape is maintained and flowering is maximised (not required in bush assets)",
  "Remove dead heads",
  "Report any pests and diseases or plants that aren't healthy or vigorous",
  "Ensure soft and built garden edges are functional, and too spec.",
];

const UNIVERSAL_CHECKLIST_TASKS = [
  "I have removed all old litter",
  "Weeds controlled",
  "No pest plants exist in this garden.",
  "If present mulch is: Clear of trunks/stems/crowns, evenly spread, not spilling over garden edge",
  "Plants have been pruned away from assets, pedestrians and carriageways. Shape has been maintained and flowering maximised as a result of my work.",
  "All dead heads have been removed",
  "Presence of pests and diseases or plants that aren't healthy or vigorous have been reported",
  "Soft and built garden edges are functional, and too spec.",
  "I haven't damaged any assets during this service.",
];

const MULCHING_TASKS = [
  "Clear area of weeds and debris before applying",
  "Apply mulch to specified depth (50–125 mm)",
  "Keep mulch clear of plant stems and tree trunks",
  "Ensure even coverage across the full bed",
  "Check and clear edge restraints",
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
    mutationFn: async ({ uri, file, caption }: { uri: string; file?: File; caption?: string }): Promise<JobPhoto | { queued: true; uri: string; caption?: string }> => {
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
        if (caption) form.append("caption", caption);
        const res = await fetch(getApiUrl(`/api/jobs/${jobId}/photos`), {
          method: "POST",
          credentials: "include",
          body: form,
        });
        if (!res.ok) throw new Error("Upload failed");
        const photo = await res.json() as JobPhoto;
        qc.invalidateQueries({ queryKey: ["job-photos", jobId] });
        return photo;
      } catch (err) {
        if (Platform.OS !== "web" && err instanceof TypeError) {
          return { queued: true, uri, caption };
        }
        throw err;
      }
    },
    onError: () => Alert.alert("Upload failed", "Could not attach photo. Please try again."),
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

// ─── Observations Section ────────────────────────────────────────────────────

function ObservationsSection({
  jobId,
  job,
  readOnly,
}: {
  jobId: string;
  job: any;
  readOnly: boolean;
}) {
  const colors = useColors();
  const qc = useQueryClient();
  const updateJob = useUpdateJob();

  const [expanded, setExpanded] = useState(false);
  const [pests, setPests] = useState<string>(job?.pestsAndDiseases ?? "");
  const [plantHealth, setPlantHealth] = useState<string>(job?.plantHealthVigor ?? "");
  const [general, setGeneral] = useState<string>(job?.generalComments ?? "");

  // Keep local state in sync if job data reloads
  useEffect(() => { setPests(job?.pestsAndDiseases ?? ""); }, [job?.pestsAndDiseases]);
  useEffect(() => { setPlantHealth(job?.plantHealthVigor ?? ""); }, [job?.plantHealthVigor]);
  useEffect(() => { setGeneral(job?.generalComments ?? ""); }, [job?.generalComments]);

  const save = (field: string, value: string) => {
    updateJob.mutate(
      { id: jobId, data: { [field]: value.trim() || null } as any },
      { onSuccess: () => qc.invalidateQueries({ queryKey: ["job-obs", jobId] }) },
    );
  };

  return (
    <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => setExpanded(e => !e)}
        activeOpacity={0.7}
      >
        <Feather name="clipboard" size={16} color={colors.primary} />
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Observations & Notes</Text>
        <Feather
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={colors.mutedForeground}
          style={{ marginLeft: "auto" }}
        />
      </TouchableOpacity>

      {expanded && (
        <>
          {/* Pests & Diseases */}
          <View style={[styles.obsField, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
            <Text style={[styles.obsLabel, { color: colors.mutedForeground }]}>Pests & Diseases</Text>
            {readOnly ? (
              <Text style={[styles.obsReadOnly, { color: pests ? colors.foreground : colors.mutedForeground }]}>
                {pests || "None recorded"}
              </Text>
            ) : (
              <TextInput
                style={[styles.obsInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background, borderRadius: colors.radius / 2 }]}
                value={pests}
                onChangeText={setPests}
                onBlur={() => save("pestsAndDiseases", pests)}
                placeholder="Any pests or diseases observed…"
                placeholderTextColor={colors.mutedForeground}
                multiline
                textAlignVertical="top"
              />
            )}
          </View>

          {/* Plant Health & Vigor */}
          <View style={[styles.obsField, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
            <Text style={[styles.obsLabel, { color: colors.mutedForeground }]}>Plant Health & Vigor</Text>
            {readOnly ? (
              <Text style={[styles.obsReadOnly, { color: plantHealth ? colors.foreground : colors.mutedForeground }]}>
                {plantHealth || "None recorded"}
              </Text>
            ) : (
              <TextInput
                style={[styles.obsInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background, borderRadius: colors.radius / 2 }]}
                value={plantHealth}
                onChangeText={setPlantHealth}
                onBlur={() => save("plantHealthVigor", plantHealth)}
                placeholder="Notes on plant health and vigor…"
                placeholderTextColor={colors.mutedForeground}
                multiline
                textAlignVertical="top"
              />
            )}
          </View>

          {/* General Comments */}
          <View style={[styles.obsField, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
            <Text style={[styles.obsLabel, { color: colors.mutedForeground }]}>General Comments & Observations</Text>
            {readOnly ? (
              <Text style={[styles.obsReadOnly, { color: general ? colors.foreground : colors.mutedForeground }]}>
                {general || "None recorded"}
              </Text>
            ) : (
              <TextInput
                style={[styles.obsInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background, borderRadius: colors.radius / 2 }]}
                value={general}
                onChangeText={setGeneral}
                onBlur={() => save("generalComments", general)}
                placeholder="Any other observations or comments…"
                placeholderTextColor={colors.mutedForeground}
                multiline
                textAlignVertical="top"
              />
            )}
          </View>
        </>
      )}
    </View>
  );
}

// ─── Photo Section ────────────────────────────────────────────────────────────

function PhotoSection({ jobId, readOnly }: { jobId: string; readOnly: boolean }) {
  const colors = useColors();
  const { data, isLoading } = useJobPhotos(jobId);
  const uploadPhoto = useUploadPhoto(jobId);
  const { pending: queuedPhotos, isFlushing, add: addToQueue } = useOfflinePhotoQueue("job", jobId);
  const photos = data?.data ?? [];
  const totalCount = photos.length + queuedPhotos.length;

  const handleMutateResult = async (result: any, uri: string, caption?: string) => {
    if (result && result.queued === true) {
      await addToQueue(uri, caption);
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
      uploadPhoto.mutate(
        { uri: asset.uri, file: (asset as any).file ?? undefined },
        { onSuccess: (r) => handleMutateResult(r, asset.uri) },
      );
    }
  };

  const takePhoto = async () => {
    if (Platform.OS === "web") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      // setAttribute is required on Android Chrome — setting .capture as a JS
      // property is silently ignored on many Android browsers.
      input.setAttribute("capture", "environment");
      input.onchange = async (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const uri = URL.createObjectURL(file);
          uploadPhoto.mutate({ uri, file });
        }
      };
      // Must be in the DOM before click() — mobile browsers drop programmatic
      // clicks on detached elements.
      input.style.display = "none";
      document.body.appendChild(input);
      input.click();
      // Clean up after the picker closes (change fires before this runs on
      // desktop; on mobile the cleanup happens after selection).
      setTimeout(() => document.body.removeChild(input), 30_000);
      return;
    }
    if (!(await requestCameraPermission())) return;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      uploadPhoto.mutate(
        { uri },
        { onSuccess: (r) => handleMutateResult(r, uri) },
      );
    }
  };

  return (
    <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
      <View style={styles.sectionHeader}>
        <Feather name="camera" size={16} color={colors.primary} />
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Photo Record</Text>
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
        <ActivityIndicator color={colors.primary} style={{ margin: 14 }} />
      ) : totalCount > 0 ? (
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
          {queuedPhotos.map(q => (
            <View key={q.id} style={styles.photoThumb}>
              <Image
                source={{ uri: q.uri }}
                style={[styles.thumbImage, { borderRadius: colors.radius / 2, opacity: 0.65 }]}
                resizeMode="cover"
              />
              <View style={[styles.queuedOverlay, { borderRadius: colors.radius / 2 }]}>
                <Feather name="clock" size={16} color="#fff" />
              </View>
              {q.caption ? (
                <Text style={[styles.caption, { color: colors.mutedForeground }]} numberOfLines={1}>{q.caption}</Text>
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

// ─── Incomplete Tasks Warning Modal ──────────────────────────────────────────

interface IncompleteTasksWarningModalProps {
  tasks: { index: number; label: string }[];
  onConfirm: () => void;
  onCancel: () => void;
}

function IncompleteTasksWarningModal({ tasks, onConfirm, onCancel }: IncompleteTasksWarningModalProps) {
  const colors = useColors();
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <View style={[styles.skipModalRoot, { backgroundColor: colors.background }]}>
        <View style={[styles.skipModalHeader, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.skipModalSub, { color: "#f59e0b" }]}>
              {tasks.length} task{tasks.length > 1 ? "s" : ""} not completed
            </Text>
            <Text style={[styles.skipModalTitle, { color: colors.foreground }]}>Complete job anyway?</Text>
          </View>
          <TouchableOpacity onPress={onCancel} style={{ padding: 4 }}>
            <Feather name="x" size={20} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <View style={styles.skipModalBody}>
          <View style={[styles.skipTaskCard, { backgroundColor: "#fffbeb", borderColor: "#fde68a", borderRadius: colors.radius, marginBottom: 12 }]}>
            <Feather name="alert-triangle" size={16} color="#f59e0b" />
            <Text style={[styles.skipTaskLabel, { color: "#92400e" }]}>
              The following checklist items were not confirmed. You'll need to provide a reason for each before the job is marked complete.
            </Text>
          </View>
          {tasks.map((t, i) => (
            <View
              key={i}
              style={[
                styles.incompleteTaskRow,
                { borderColor: colors.border, borderRadius: colors.radius, backgroundColor: colors.card },
              ]}
            >
              <Feather name="x-circle" size={14} color="#f59e0b" />
              <Text style={[styles.incompleteTaskText, { color: colors.foreground }]}>{t.label}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.skipModalFooter, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={[styles.skipCancelBtn, { borderColor: colors.border, borderRadius: colors.radius }]}
            onPress={onCancel}
            activeOpacity={0.8}
          >
            <Text style={[styles.skipCancelText, { color: colors.mutedForeground }]}>Go back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.skipNextBtn, { backgroundColor: "#f59e0b", borderRadius: colors.radius }]}
            onPress={onConfirm}
            activeOpacity={0.85}
          >
            <Text style={styles.skipNextText}>Continue</Text>
            <Feather name="arrow-right" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Task Skip Reason Modal ───────────────────────────────────────────────────

const CANT_SPRAY_REASON = "Conditions not suitable for spraying";

interface SkipReasonItem {
  taskIndex: number;
  taskLabel: string;
  reason: string;
  createSprayJob?: boolean;
}

interface SkipReasonModalProps {
  tasks: { index: number; label: string }[];
  onConfirm: (reasons: SkipReasonItem[]) => void;
  onCancel: () => void;
}

function TaskSkipReasonModal({ tasks, onConfirm, onCancel }: SkipReasonModalProps) {
  const colors = useColors();
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [sprayJobTasks, setSprayJobTasks] = useState<Set<number>>(new Set());
  const [current, setCurrent] = useState(0);

  const task = tasks[current];
  const reason = reasons[task.index] ?? "";
  const isLast = current === tasks.length - 1;
  const isWeedsTask = task.label === "Weeds controlled";
  const spraySelected = sprayJobTasks.has(task.index);

  // On Android, hardware back steps to the previous task rather than closing the modal.
  // When already on the first task, it cancels (closes the modal).
  const handleRequestClose = () => {
    if (current > 0) {
      setCurrent(c => c - 1);
    } else {
      onCancel();
    }
  };

  const handleSelectSprayOption = () => {
    setReasons(prev => ({ ...prev, [task.index]: CANT_SPRAY_REASON }));
    setSprayJobTasks(prev => new Set([...prev, task.index]));
  };

  const handleNext = () => {
    if (!reason.trim()) return;
    if (isLast) {
      const result = tasks.map(t => ({
        taskIndex: t.index,
        taskLabel: t.label,
        reason: reasons[t.index]?.trim() ?? "",
        createSprayJob: sprayJobTasks.has(t.index),
      }));
      onConfirm(result);
    } else {
      setCurrent(c => c + 1);
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={handleRequestClose}>
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

            {isWeedsTask && (
              <TouchableOpacity
                onPress={handleSelectSprayOption}
                activeOpacity={0.8}
                style={[
                  styles.sprayOptionChip,
                  {
                    borderRadius: colors.radius,
                    borderColor: spraySelected ? colors.primary : colors.border,
                    backgroundColor: spraySelected ? colors.primary + "15" : colors.card,
                  },
                ]}
              >
                <Feather
                  name={spraySelected ? "check-circle" : "cloud-drizzle"}
                  size={16}
                  color={spraySelected ? colors.primary : colors.mutedForeground}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sprayOptionLabel, { color: spraySelected ? colors.primary : colors.foreground }]}>
                    {CANT_SPRAY_REASON}
                  </Text>
                  <Text style={[styles.sprayOptionSub, { color: colors.mutedForeground }]}>
                    A draft spray job will be raised for this site
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            <Text style={[styles.skipReasonLabel, { color: colors.mutedForeground }]}>
              {isWeedsTask ? "Or describe the reason:" : "Why wasn't this task completed?"}
            </Text>
            <TextInput
              style={[styles.skipReasonInput, { color: colors.foreground, borderColor: reason.trim() ? colors.primary : colors.border, borderRadius: colors.radius, backgroundColor: colors.background }]}
              value={reason}
              onChangeText={v => {
                setReasons(prev => ({ ...prev, [task.index]: v }));
                if (isWeedsTask && spraySelected) {
                  setSprayJobTasks(prev => { const s = new Set(prev); s.delete(task.index); return s; });
                }
              }}
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

// ─── Job Skip Reason Modal ────────────────────────────────────────────────────

interface JobSkipReasonModalProps {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

function JobSkipReasonModal({ onConfirm, onCancel }: JobSkipReasonModalProps) {
  const colors = useColors();
  const [reason, setReason] = useState("");

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={[styles.skipModalRoot, { backgroundColor: colors.background }]}>
          <View style={[styles.skipModalHeader, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.skipModalSub, { color: colors.mutedForeground }]}>Skip job</Text>
              <Text style={[styles.skipModalTitle, { color: colors.foreground }]}>Reason required</Text>
            </View>
            <TouchableOpacity onPress={onCancel} style={{ padding: 4 }}>
              <Feather name="x" size={20} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <View style={styles.skipModalBody}>
            <View style={[styles.skipTaskCard, { backgroundColor: "#fef2f2", borderColor: "#fecaca", borderRadius: colors.radius }]}>
              <Feather name="alert-triangle" size={16} color="#ef4444" />
              <Text style={[styles.skipTaskLabel, { color: "#dc2626" }]}>
                This job will be marked as skipped and rescheduled.
              </Text>
            </View>

            <Text style={[styles.skipReasonLabel, { color: colors.mutedForeground }]}>
              Why is this job being skipped?
            </Text>
            <TextInput
              style={[styles.skipReasonInput, { color: colors.foreground, borderColor: reason.trim() ? "#ef4444" : colors.border, borderRadius: colors.radius, backgroundColor: colors.background }]}
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. Access blocked, unsafe conditions, equipment fault…"
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
              style={[styles.skipNextBtn, { backgroundColor: reason.trim() ? "#ef4444" : colors.border, borderRadius: colors.radius }]}
              onPress={() => { if (reason.trim()) onConfirm(reason.trim()); }}
              disabled={!reason.trim()}
              activeOpacity={0.85}
            >
              <Text style={styles.skipNextText}>Continue</Text>
              <Feather name="arrow-right" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function localDateStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const TODAY = localDateStr();

// ─── Out-of-sequence warning modal ───────────────────────────────────────────

function OutOfSequenceModal({
  visible,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const colors = useColors();
  const [step, setStep] = useState<"confirm" | "reason">("confirm");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (visible) { setStep("confirm"); setReason(""); }
  }, [visible]);

  // On Android, hardware back steps from "reason" back to "confirm" rather than
  // closing the modal entirely. On the "confirm" step, back closes the modal.
  const handleRequestClose = () => {
    if (step === "reason") {
      setStep("confirm");
    } else {
      onCancel();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleRequestClose}>
      <KeyboardAvoidingView
        style={styles.seqOverlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.seqCard, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
          {step === "confirm" ? (
            <>
              <View style={styles.seqIconRow}>
                <Feather name="alert-triangle" size={26} color="#f59e0b" />
              </View>
              <Text style={[styles.seqTitle, { color: colors.foreground }]}>Out of sequence</Text>
              <Text style={[styles.seqBody, { color: colors.mutedForeground }]}>
                This isn't the next job on the run. Are you sure you want to start this job?
              </Text>
              <View style={styles.seqButtons}>
                <TouchableOpacity
                  style={[styles.seqBtn, { borderWidth: 1, borderColor: colors.border }]}
                  onPress={onCancel}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.seqBtnText, { color: colors.foreground }]}>No, go back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.seqBtn, { backgroundColor: "#f59e0b" }]}
                  onPress={() => setStep("reason")}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.seqBtnText, { color: "#fff" }]}>Yes, continue</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.seqTitle, { color: colors.foreground }]}>Reason required</Text>
              <Text style={[styles.seqBody, { color: colors.mutedForeground }]}>
                Why are you starting out of sequence?
              </Text>
              <TextInput
                style={[styles.seqInput, {
                  backgroundColor: colors.background,
                  borderColor: reason.trim() ? colors.primary : colors.border,
                  color: colors.foreground,
                  borderRadius: colors.radius,
                }]}
                placeholder="Enter reason…"
                placeholderTextColor={colors.mutedForeground}
                value={reason}
                onChangeText={setReason}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                autoFocus
              />
              <View style={styles.seqButtons}>
                <TouchableOpacity
                  style={[styles.seqBtn, { borderWidth: 1, borderColor: colors.border }]}
                  onPress={() => setStep("confirm")}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.seqBtnText, { color: colors.foreground }]}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.seqBtn, { backgroundColor: colors.primary, opacity: reason.trim() ? 1 : 0.4 }]}
                  onPress={() => { if (reason.trim()) onConfirm(reason.trim()); }}
                  disabled={!reason.trim()}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.seqBtnText, { color: "#fff" }]}>Start Job</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function JobDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [checkedTasks, setCheckedTasks] = useState<Record<number, boolean>>({});
  const [pendingAction, setPendingAction] = useState<"start" | "complete" | "pause" | "resume" | "skip" | null>(null);
  const [pendingIncomplete, setPendingIncomplete] = useState<{ index: number; label: string }[] | null>(null);
  const [skipTasks, setSkipTasks] = useState<{ index: number; label: string }[] | null>(null);
  const [showJobSkipModal, setShowJobSkipModal] = useState(false);
  const [jobSkipReason, setJobSkipReason] = useState("");
  const [showOutOfSeqModal, setShowOutOfSeqModal] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<ScrollView>(null);

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
      // Invalidate all schedule week queries (no-arg key = prefix match, catches teamId variants)
      queryClient.invalidateQueries({ queryKey: getGetScheduleWeekQueryKey() });
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

  const isLoading = jobLoading || assetLoading;
  const isMutating = updateJob.isPending || teamComplete.isPending || postSkipReason.isPending;
  const status = job?.status;
  const isPending = status === "pending";
  const isActive = status === "in_progress";
  const isPaused = status === "paused";
  const isDone = status === "completed" || status === "skipped";
  const isActionable = isPending || isActive || isPaused;
  const isMulching = (job as any)?.jobType === "mulching";
  const mulchingCanAct = isMulching && isPending;

  const tasks = isMulching
    ? MULCHING_TASKS
    : (isActive || isPaused ? UNIVERSAL_CHECKLIST_TASKS : UNIVERSAL_PREVIEW_TASKS);
  const checkedCount = Object.values(checkedTasks).filter(Boolean).length;
  const photoCount = photosData?.data?.length ?? 0;

  // Geosequence check — only needed when job is pending and scheduled today
  const isScheduledToday = job?.scheduledDate === TODAY;
  const teamParam = user?.teamId ? { teamId: user.teamId } : {};
  const { data: todaySchedule } = useGetScheduleWeek(
    { week: TODAY, ...teamParam },
    { query: { enabled: isPending && isScheduledToday && !isMulching } as any },
  );
  const isNextInSequence = useMemo(() => {
    if (!todaySchedule?.days) return true;
    const todayDay = (todaySchedule.days as { date: string; jobs: any[] }[])
      .find(d => d.date === TODAY);
    if (!todayDay) return true;
    const pendingJobs = todayDay.jobs.filter((j: any) => j.status === "pending");
    if (pendingJobs.length === 0) return true;
    return pendingJobs[0].id === id;
  }, [todaySchedule, id]);

  // Confirm before leaving when job is active or paused
  const handleBack = () => {
    if (isActive || isPaused) {
      Alert.alert(
        "Leave without pausing?",
        "This job is still in progress. Tap Pause first to save your progress, or leave anyway.",
        [
          { text: "Stay", style: "cancel" },
          { text: "Leave", style: "destructive", onPress: () => router.back() },
        ],
      );
    } else {
      router.back();
    }
  };

  // Android back: dismiss inline confirmation bar rather than navigating away;
  // also intercept hardware back when job is active or paused
  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (pendingAction) {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        setPendingAction(null);
        return true;
      });
      return () => sub.remove();
    }
    if (isActive || isPaused) {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        handleBack();
        return true;
      });
      return () => sub.remove();
    }
  }, [pendingAction, isActive, isPaused]);

  const toggleTask = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCheckedTasks(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const handleStart = () => {
    if (isPending && isScheduledToday && !isMulching && !isNextInSequence) {
      setShowOutOfSeqModal(true);
      return;
    }
    setPendingAction("start");
  };

  const handleOutOfSeqConfirmed = (reason: string) => {
    setShowOutOfSeqModal(false);
    if (!id) return;
    updateJob.mutate(
      { id, data: { status: "in_progress", outOfSequenceReason: reason } as any },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          invalidateJob();
        },
        onError: () => Alert.alert("Error", "Could not start job. Please try again."),
      },
    );
  };

  const handleOutOfSeqCancel = () => {
    setShowOutOfSeqModal(false);
    router.back();
  };

  const handlePause = () => setPendingAction("pause");
  const handleResume = () => setPendingAction("resume");
  const handleSkipJob = () => setShowJobSkipModal(true);

  const handleJobSkipReasonConfirmed = (reason: string) => {
    setJobSkipReason(reason);
    setShowJobSkipModal(false);
    setPendingAction("skip");
  };

  const handleComplete = () => {
    setPhotoError(false);
    if (photoCount === 0) {
      setPhotoError(true);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
      return;
    }
    // Check tasks — collect unchecked ones
    const unchecked = tasks
      .map((label, index) => ({ index, label }))
      .filter(t => !checkedTasks[t.index]);
    if (unchecked.length > 0) {
      setPendingIncomplete(unchecked);
      return;
    }
    setPendingAction("complete");
  };

  const executeComplete = () => {
    if (!id) return;
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
  };

  const handleSkipReasonsConfirmed = async (
    reasons: SkipReasonItem[]
  ) => {
    setSkipTasks(null);
    for (const r of reasons) {
      await postSkipReason.mutateAsync(r).catch(() => {});
    }
    const needsSprayJob = reasons.some(r => r.createSprayJob);
    if (needsSprayJob && job?.assetId) {
      try {
        await fetch(getApiUrl("/api/reactive-jobs"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assetId: job.assetId,
            issueType: "Can't spray",
            priority: "medium",
            description: `Conditions not suitable for spraying — raised automatically from job checklist on ${new Date().toLocaleDateString("en-NZ")}.`,
          }),
        });
      } catch {
        // Non-fatal — job completion still proceeds
      }
    }
    executeComplete();
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
        { id, data: { status: "skipped", skipReason: jobSkipReason } as any },
        {
          onSuccess: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            setPendingAction(null);
            setJobSkipReason("");
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

  // Mulching jobs skip start/pause — tasks are always checkable and Complete is available from pending

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

  const topPad = insets.top;
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
    <View style={[styles.root, { backgroundColor: colors.background, ...(Platform.OS === "web" ? { height: windowHeight } : {}) }]}>
      {/* Nav bar */}
      <View style={[styles.navBar, { backgroundColor: colors.card, borderBottomColor: colors.border, paddingTop: topPad + 8 }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: colors.background, borderRadius: colors.radius }]}
          onPress={handleBack}
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
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Known Hazards — always first, prominent warning */}
        {(asset as any).knownHazards ? (
          <View style={[styles.hazardBanner, { backgroundColor: "#fef3c7", borderColor: "#fbbf24" }]}>
            <Feather name="alert-triangle" size={16} color="#b45309" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.hazardTitle, { color: "#92400e" }]}>Known Hazards</Text>
              <Text style={[styles.hazardText, { color: "#92400e" }]}>{(asset as any).knownHazards}</Text>
            </View>
          </View>
        ) : null}

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

          {/* Specification — tappable */}
          <TouchableOpacity
            style={[styles.infoTile, styles.infoTileTappable, { backgroundColor: colors.card, borderColor: colors.primary + "60", borderRadius: colors.radius }]}
            onPress={() => router.push("/(tabs)/spec")}
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

        {/* Mulching banner */}
        {isMulching && (
          <View style={[styles.allTeamsBanner, { backgroundColor: "#78350f18", borderColor: "#92400e40" }]}>
            <Feather name="layers" size={15} color="#92400e" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.allTeamsBannerTitle, { color: "#92400e" }]}>Mulching Job</Text>
              <Text style={[styles.allTeamsBannerSub, { color: "#92400e" }]}>
                {(job as any).mulchType ? `Mulch type: ${(job as any).mulchType}. ` : ""}
                Check all tasks and mark complete when done.
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

        {/* Task list — read-only (preview) or checkable (active/paused/mulching) */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <View style={styles.sectionHeader}>
            <Feather name={isActive || isPaused || mulchingCanAct ? "check-square" : "list"} size={16} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {isActive || isPaused || mulchingCanAct ? "Task Checklist" : "Tasks to Complete"}
            </Text>
            {(isActive || isPaused || mulchingCanAct) && (
              <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>
                {checkedCount}/{tasks.length}
              </Text>
            )}
          </View>
          {tasks.map((task, i) => {
            const isChecked = !!checkedTasks[i];
            const canCheck = isActive || isPaused || mulchingCanAct;
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

        {/* Observations — shown once job is active, paused, or done */}
        {(isActive || isPaused || isDone) && id && (
          <ObservationsSection jobId={id} job={job} readOnly={status === "skipped"} />
        )}

        {/* Photo evidence — shown while actionable or done (including mulching jobs) */}
        {(isActive || isPaused || isDone || mulchingCanAct) && id && (
          <>
            <PhotoSection jobId={id} readOnly={status === "skipped"} />
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
      {(isActionable || mulchingCanAct) && (
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
            // Preview state: Start + Skip (or Complete for mulching)
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: colors.border, borderRadius: colors.radius, flex: 1 }]}
                onPress={handleSkipJob}
                activeOpacity={0.8}
              >
                <Feather name="skip-forward" size={16} color={colors.mutedForeground} />
                <Text style={[styles.secondaryBtnText, { color: colors.mutedForeground }]}>Skip</Text>
              </TouchableOpacity>
              {isMulching ? (
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
                      <Feather name="check-circle" size={18} color="#fff" />
                      <Text style={styles.primaryBtnText}>Mark Complete</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: colors.primary, borderRadius: colors.radius, flex: 2 }]}
                  onPress={handleStart}
                  activeOpacity={0.85}
                  disabled={isMutating}
                >
                  <Feather name="play" size={18} color="#fff" />
                  <Text style={styles.primaryBtnText}>Start Job</Text>
                </TouchableOpacity>
              )}
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

      {/* Out-of-sequence warning modal */}
      <OutOfSequenceModal
        visible={showOutOfSeqModal}
        onConfirm={handleOutOfSeqConfirmed}
        onCancel={handleOutOfSeqCancel}
      />

      {/* Job skip reason modal */}
      {showJobSkipModal && (
        <JobSkipReasonModal
          onConfirm={handleJobSkipReasonConfirmed}
          onCancel={() => setShowJobSkipModal(false)}
        />
      )}

      {/* Incomplete tasks warning modal */}
      {pendingIncomplete && (
        <IncompleteTasksWarningModal
          tasks={pendingIncomplete}
          onConfirm={() => {
            const tasks = pendingIncomplete;
            setPendingIncomplete(null);
            setSkipTasks(tasks);
          }}
          onCancel={() => setPendingIncomplete(null)}
        />
      )}

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
  root: { flex: 1, overflow: "hidden" },
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
  hazardBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    borderWidth: 1.5, borderRadius: 12, padding: 12, marginBottom: 12,
  },
  hazardTitle: { fontFamily: "Inter_700Bold", fontSize: 13, marginBottom: 3 },
  hazardText: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19 },
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
  incompleteTaskRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  incompleteTaskText: { fontFamily: "Inter_400Regular", fontSize: 13, flex: 1, lineHeight: 18 },
  skipTaskCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 14, borderWidth: 1, marginBottom: 20,
  },
  skipTaskLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14, flex: 1 },
  skipReasonLabel: { fontFamily: "Inter_500Medium", fontSize: 13, marginBottom: 8 },
  sprayOptionChip: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 14, borderWidth: 1.5, marginBottom: 14,
  },
  sprayOptionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14, marginBottom: 2 },
  sprayOptionSub: { fontFamily: "Inter_400Regular", fontSize: 11 },
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
  // Out-of-sequence modal
  seqOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center", alignItems: "center", padding: 28,
  },
  seqCard: {
    width: "100%", padding: 24,
    shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 24, elevation: 12,
  },
  seqIconRow: { alignItems: "center", marginBottom: 14 },
  seqTitle: { fontFamily: "Inter_700Bold", fontSize: 18, textAlign: "center", marginBottom: 8 },
  seqBody: {
    fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20,
    textAlign: "center", marginBottom: 22,
  },
  seqInput: {
    borderWidth: 1.5, padding: 12,
    fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20,
    minHeight: 88, marginBottom: 18,
  },
  seqButtons: { flexDirection: "row", gap: 10 },
  seqBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
  },
  seqBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  // Observations section
  obsField: { paddingHorizontal: 14, paddingVertical: 12, alignSelf: "stretch", overflow: "hidden" },
  obsLabel: { fontFamily: "Inter_500Medium", fontSize: 12, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  obsInput: {
    borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8,
    fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20, minHeight: 72,
    width: "100%", alignSelf: "stretch",
  },
  obsReadOnly: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20 },
});
