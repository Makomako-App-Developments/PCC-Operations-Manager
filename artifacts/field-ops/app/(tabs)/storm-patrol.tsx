import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { getGetCurrentStormPatrolQueryKey, useClaimStormPatrolJob, useDeleteStormPatrolJobPhoto, useGetCurrentStormPatrol, type StormCurrentResponse, type StormJob } from "@workspace/api-client-react";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PinMap } from "@/components/PinMap";
import { requestCameraPermission, requestMediaLibraryPermission } from "@/hooks/usePhotoLibraryPermission";
import { useColors } from "@/hooks/useColors";
import { clearStormQueueItems, createStormQueueItem, enqueueStormItems, flushStormQueue, getStormPatrolCompletionRequirements, isUnrecoverableQueuedStormPhoto, loadStormQueue, stormQueueId, type StormPhotoPurpose, type StormQueueItem } from "@/lib/stormPatrolQueue";
import { persistAttachment, removeManagedAttachment, type AttachmentSource, type DurableAttachment } from "@/lib/attachmentUpload";
import { useAuth } from "@/context/auth";

const CACHE_KEY = "@storm_patrol_current_v1";
const MAX_PHOTOS_PER_SECTION = 3;
const WORK_TYPES = [
  ["silt_clearance", "Silt clearance"], ["litter_clearance", "Litter clearance"],
  ["debris_clearance", "Debris clearance"], ["visual_check_only", "Visual check only"],
  ["litter_debris_removed_from_site", "Litter/debris removed from site"],
  ["site_made_safe", "Site made safe"],
] as const;
type Job = StormJob & { startedAt?: string | null };
type Patrol = NonNullable<StormCurrentResponse["data"]>;
const PHASES = ["pre", "mid", "post"] as const;
const COMPLETED_STATUSES = new Set(["completed", "too_dangerous"]);
const label = (phase: string) => ({ pre: "Before storm", mid: "During storm", post: "After storm" }[phase] ?? phase);
const isCompletedJob = (job: Pick<Job, "status">) => COMPLETED_STATUSES.has(job.status);

async function stageAttachments(sources: readonly AttachmentSource[]): Promise<DurableAttachment[]> {
  const staged: DurableAttachment[] = [];
  try {
    for (const source of sources) staged.push(await persistAttachment(source));
    return staged;
  } catch (error) {
    await Promise.all(staged.map(attachment => removeManagedAttachment(attachment)));
    throw error;
  }
}

export default function StormPatrolScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const current = useGetCurrentStormPatrol({
    query: { queryKey: getGetCurrentStormPatrolQueryKey(), refetchInterval: 30_000 },
  });
  const claim = useClaimStormPatrolJob();
  const deleteSavedPhoto = useDeleteStormPatrolJobPhoto();
  const [cached, setCached] = useState<Patrol | null>(null);
  const [queue, setQueue] = useState<StormQueueItem[]>([]);
  const [selected, setSelected] = useState<Job | null>(null);
  const [photos, setPhotos] = useState<Array<{ source: AttachmentSource; purpose: StormPhotoPurpose }>>([]);
  const [workTypes, setWorkTypes] = useState<string[]>([]);
  const [comments, setComments] = useState("");
  const [dangerous, setDangerous] = useState(false);
  const [dangerReason, setDangerReason] = useState("");
  const [issue, setIssue] = useState("");
  const [urgentExpanded, setUrgentExpanded] = useState(false);
  const [observation, setObservation] = useState("");
  const [observationPhotos, setObservationPhotos] = useState<AttachmentSource[]>([]);
  const [observationLocation, setObservationLocation] = useState<{ locationLat: number; locationLng: number } | null>(null);
  const [capturingLocation, setCapturingLocation] = useState(false);
  const [discardingPhotos, setDiscardingPhotos] = useState(false);
  const [showDiscardConfirmation, setShowDiscardConfirmation] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);
  const [flooding, setFlooding] = useState(false);
  const [floodingDescription, setFloodingDescription] = useState("");
  const [slips, setSlips] = useState(false);
  const [slipDescription, setSlipDescription] = useState("");
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [jobMapType, setJobMapType] = useState<"map" | "aerial">("map");
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(() => new Set());
  const [removedSavedPhotoIds, setRemovedSavedPhotoIds] = useState<Set<string>>(() => new Set());
  const patrol = ((current.data as unknown as { data?: Patrol } | undefined)?.data ?? cached) as Patrol | null;

  const refreshQueue = useCallback(() => user ? loadStormQueue(user.id).then(setQueue).catch(() => {}) : Promise.resolve(), [user]);
  useFocusEffect(useCallback(() => {
    if (user) void flushStormQueue(user.id).then(setQueue).catch(refreshQueue);
  }, [refreshQueue, user]));
  useEffect(() => {
    const live = (current.data as unknown as { data?: Patrol } | undefined)?.data;
    if (live) { setCached(live); AsyncStorage.setItem(CACHE_KEY, JSON.stringify(live)).catch(() => {}); }
  }, [current.data]);
  useEffect(() => { AsyncStorage.getItem(CACHE_KEY).then(raw => raw && setCached(JSON.parse(raw))).catch(() => {}); }, []);
  useEffect(() => {
    if (!selected?.startedAt) { setElapsedMinutes(selected?.actualTimeMins ?? 0); return; }
    if (isCompletedJob(selected)) { setElapsedMinutes(selected.actualTimeMins ?? 0); return; }
    const update = () => setElapsedMinutes(Math.max(0, Math.floor((Date.now() - new Date(selected.startedAt!).getTime()) / 60_000)));
    update(); const timer = setInterval(update, 15_000); return () => clearInterval(timer);
  }, [selected?.id, selected?.startedAt, selected?.status, selected?.actualTimeMins]);

  const grouped = useMemo(() => PHASES.map(phase => [phase, (patrol?.jobs ?? []).filter(j => j.phase === phase).sort((a, b) => (a.routeOrder ?? Number.MAX_SAFE_INTEGER) - (b.routeOrder ?? Number.MAX_SAFE_INTEGER))] as const), [patrol]);
  const automaticallyCollapsedPhases = useMemo(() => grouped
    .filter(([phase, jobs]) => {
      if (!jobs.length || !jobs.every(isCompletedJob)) return false;
      const phaseIndex = PHASES.indexOf(phase);
      return grouped.some(([laterPhase, laterJobs]) => PHASES.indexOf(laterPhase) > phaseIndex && laterJobs.length > 0);
    })
    .map(([phase]) => phase)
    .join(","), [grouped]);
  useEffect(() => {
    setCollapsedPhases(new Set());
  }, [patrol?.event.id]);
  useEffect(() => {
    if (!automaticallyCollapsedPhases) return;
    setCollapsedPhases(currentPhases => new Set([
      ...currentPhases,
      ...automaticallyCollapsedPhases.split(","),
    ]));
  }, [automaticallyCollapsedPhases]);
  const unrecoverablePhotos = queue.filter(isUnrecoverableQueuedStormPhoto);
  const photoQueueBlocked = unrecoverablePhotos.length > 0;
  const photoCount = (purpose: StormPhotoPurpose) => {
    if (purpose === "observation" && !selected) return observationPhotos.length;
    return (selected?.photos ?? []).filter(photo => photo.purpose === purpose && !removedSavedPhotoIds.has(photo.id)).length
      + photos.filter(photo => photo.purpose === purpose).length;
  };
  const canAddPhoto = (purpose: StormPhotoPurpose) => {
    if (!["before", "after", "observation"].includes(purpose)) return true;
    if (photoCount(purpose) < MAX_PHOTOS_PER_SECTION) return true;
    Alert.alert("Photo limit reached", `You can add up to ${MAX_PHOTOS_PER_SECTION} ${purpose === "observation" ? "general observation" : purpose} photos.`);
    return false;
  };
  const take = async (purpose: StormPhotoPurpose) => {
    if (!canAddPhoto(purpose)) return;
    if (Platform.OS === "web") { await library(purpose); return; }
    if (!(await requestCameraPermission())) return;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.75 });
    if (!result.canceled && result.assets[0]) {
      if (purpose === "observation" && !selected) setObservationPhotos(current => [...current, result.assets[0]]);
      else setPhotos(p => [...p, { source: result.assets[0], purpose }]);
    }
  };
  const library = async (purpose: StormPhotoPurpose) => {
    if (!canAddPhoto(purpose)) return;
    if (!(await requestMediaLibraryPermission())) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.75 });
    if (!result.canceled && result.assets[0]) {
      if (purpose === "observation" && !selected) setObservationPhotos(current => [...current, result.assets[0]]);
      else setPhotos(p => [...p, { source: result.assets[0], purpose }]);
    }
  };
  const choosePhoto = (purpose: StormPhotoPurpose) => { void take(purpose); };
  const removePendingPhoto = (photo: { source: AttachmentSource; purpose: StormPhotoPurpose }) => {
    setPhotos(current => current.filter(candidate => candidate !== photo));
  };
  const removeObservationPhoto = (photo: AttachmentSource) => {
    setObservationPhotos(current => current.filter(candidate => candidate !== photo));
  };
  const removeSavedPhoto = (photoId: string) => {
    if (!selected) return;
    Alert.alert("Delete photo?", "This photo will be permanently removed.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteSavedPhoto.mutate(
          { id: selected.id, photoId },
          {
            onSuccess: () => {
              setRemovedSavedPhotoIds(current => new Set([...current, photoId]));
              void current.refetch();
            },
            onError: () => Alert.alert("Unable to delete photo", "The photo was not removed. Check your connection and try again."),
          },
        ),
      },
    ]);
  };
  const location = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") throw new Error("Location permission is required to submit a Storm Patrol record.");
    const point = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { locationLat: point.coords.latitude, locationLng: point.coords.longitude };
  };
  const sync = async (showFailure = false) => {
    if (!user) throw new Error("Sign in again before syncing Storm Patrol.");
    const remaining = await flushStormQueue(user.id);
    setQueue(remaining);
    await current.refetch();
    if (showFailure && remaining.length > 0) {
      Alert.alert(
        "Still waiting to sync",
        remaining[0].lastError ?? "The item could not be sent. Sign out and back in, then retry.",
      );
    }
    return remaining;
  };
  const discardQueuedPhotos = () => {
    if (discardingPhotos) return;
    setDiscardError(null);
    setShowDiscardConfirmation(true);
  };
  const confirmDiscardQueuedPhotos = () => {
    if (discardingPhotos) return;
    setDiscardingPhotos(true);
    setDiscardError(null);
    const unavailableIds = unrecoverablePhotos.map(item => item.id);
    void clearStormQueueItems(unavailableIds)
      .then(remaining => {
        setQueue(remaining);
        setShowDiscardConfirmation(false);
      })
      .catch(async error => {
        setDiscardError(error instanceof Error ? error.message : "Try again.");
        await refreshQueue();
      })
      .finally(() => setDiscardingPhotos(false));
  };
  const complete = async () => {
    if (!selected || !user) return;
    if (photos.some(photo => photo.purpose === "urgent_issue")) {
      Alert.alert("Urgent issue not sent", "Send or remove the urgent issue photo before completing this patrol check.");
      return;
    }
    if (isCompletedJob(selected)) {
      const replacementPhotos = photos.filter(photo => photo.purpose === "before" || photo.purpose === "after");
      if (!replacementPhotos.length) {
        Alert.alert("No new photos", "Select a before or after photo to add to this completed patrol.");
        return;
      }
      let stagedPhotos: DurableAttachment[] = [];
      let durablyQueued = false;
      try {
        stagedPhotos = await stageAttachments(replacementPhotos.map(photo => photo.source));
        const pendingItems = stagedPhotos.map((attachment, index) => {
          const idempotencyKey = `storm-photo-${stormQueueId()}`;
          return createStormQueueItem({
            ownerId: user.id,
            kind: "photo",
            idempotencyKey,
            payload: {
              jobId: selected.id,
              attachment,
              purpose: replacementPhotos[index].purpose,
              idempotencyKey,
            },
          });
        });
        const queuedItems = await enqueueStormItems(pendingItems);
        durablyQueued = true;
        const remaining = await sync();
        if (remaining.some(item => queuedItems.some(queued => queued.id === item.id))) {
          Alert.alert("Photos saved for sync", "The photos are safe in this browser. GardenOps will keep retrying until they are sent.");
        }
        setSelected(null);
        setPhotos([]);
        return;
      } catch (error) {
        if (!durablyQueued) await Promise.all(stagedPhotos.map(removeManagedAttachment));
        Alert.alert("Photos not saved", error instanceof Error ? error.message : "GardenOps could not safely queue these replacement photos.");
        refreshQueue();
        return;
      }
    }
    const existingPhotoPurposes = selected.photos?.map(photo => photo.purpose) ?? [];
    const acceptedPhotoPurposes = [...existingPhotoPurposes, ...photos.map(photo => photo.purpose)];
    const missing = getStormPatrolCompletionRequirements({
      photoPurposes: acceptedPhotoPurposes,
      workTypes,
      comments,
      tooDangerous: dangerous,
      dangerousReason: dangerReason,
      flooding: selected.phase === "post" ? { present: flooding, description: floodingDescription, hasPhoto: photos.some(p => p.purpose === "new_flooding") } : undefined,
      slips: selected.phase === "post" ? { present: slips, description: slipDescription, hasPhoto: photos.some(p => p.purpose === "new_slip") } : undefined,
    });
    if (missing.length > 0) {
      Alert.alert("Complete these items", missing.map(item => `• ${item}`).join("\n"));
      return;
    }
    let stagedPhotos: Array<{ source: DurableAttachment; purpose: StormPhotoPurpose }> = [];
    const queuedAttachmentIds = new Set<string>();
    try {
      const point = await location();
      const stagedAttachments = await stageAttachments(photos.map(photo => photo.source));
      stagedPhotos = photos.map((photo, index) => ({ ...photo, source: stagedAttachments[index] }));
      const pendingItems: StormQueueItem[] = [];
      if (selected.phase === "post") {
        for (const observation of [
          flooding ? { purpose: "new_flooding" as const, description: "New flooding", notes: floodingDescription.trim(), key: `storm-flooding-${stormQueueId()}` } : undefined,
          slips ? { purpose: "new_slip" as const, description: "New slip", notes: slipDescription.trim(), key: `storm-slip-${stormQueueId()}` } : undefined,
        ].filter(Boolean)) {
          if (!observation) continue;
          const parent = createStormQueueItem({
            kind: "observation",
            ownerId: user.id,
            idempotencyKey: observation.key,
            payload: { data: { eventId: selected.eventId, assetId: selected.assetId, sourceJobId: selected.id, description: observation.description, notes: observation.notes, idempotencyKey: observation.key, ...point } },
          });
          pendingItems.push(parent);
          for (const photo of stagedPhotos.filter(candidate => candidate.purpose === observation.purpose)) {
            const idempotencyKey = `storm-photo-${stormQueueId()}`;
            pendingItems.push(createStormQueueItem({
              kind: "photo",
              ownerId: user.id,
              idempotencyKey,
              dependsOn: parent.id,
              payload: { attachment: photo.source, purpose: "observation", observationIdempotencyKey: observation.key, idempotencyKey },
            }));
          }
        }
      }
      let completionItemId: string | undefined;
      if (!isCompletedJob(selected)) {
        const completionKey = `storm-completion-${stormQueueId()}`;
        const completion = createStormQueueItem({
          kind: "completion",
          ownerId: user.id,
          idempotencyKey: completionKey,
          payload: { jobId: selected.id, data: { outcome: dangerous ? "too_dangerous" : "completed", actualTimeMins: elapsedMinutes, comments: comments.trim() || undefined, workTypes: (dangerous ? ["site_too_dangerous"] : workTypes) as any, dangerousReason: dangerous ? dangerReason.trim() : undefined, idempotencyKey: completionKey, ...point } },
        });
        completionItemId = completion.id;
        pendingItems.push(completion);
      }
      for (const photo of stagedPhotos.filter(p => p.purpose === "before" || p.purpose === "after")) {
        const idempotencyKey = `storm-photo-${stormQueueId()}`;
        pendingItems.push(createStormQueueItem({
          kind: "photo",
          ownerId: user.id,
          idempotencyKey,
          dependsOn: completionItemId,
          payload: { jobId: selected.id, attachment: photo.source, purpose: photo.purpose, idempotencyKey },
        }));
      }
      const queuedItems = await enqueueStormItems(pendingItems);
      stagedPhotos.forEach(photo => queuedAttachmentIds.add(photo.source.uploadId));
      const submittedItemIds = queuedItems.map(item => item.id);
      const remaining = await sync();
      if (remaining.some(item => submittedItemIds.includes(item.id))) {
        Alert.alert("Saved for sync", "The patrol details are safe on this device. GardenOps will keep retrying any attachments that have not sent yet.");
      }
      setSelected(null); setPhotos([]); setComments(""); setWorkTypes([]); setDangerous(false); setDangerReason(""); setFlooding(false); setSlips(false); setFloodingDescription(""); setSlipDescription("");
    } catch (error) {
      await Promise.all(stagedPhotos
        .filter(photo => !queuedAttachmentIds.has(photo.source.uploadId))
        .map(photo => removeManagedAttachment(photo.source)));
      Alert.alert("Patrol not saved", error instanceof Error ? error.message : "GardenOps could not safely queue this patrol and its photos.");
      refreshQueue();
    }
  };
  const submitObservation = async () => {
    if (!patrol || !user) return;
    if (!observation.trim()) { Alert.alert("Description required", "Describe what you observed before sending."); return; }
    if (!observationLocation) { Alert.alert("Location required", "Capture your current location before sending the observation."); return; }
    let stagedPhotos: DurableAttachment[] = [];
    const queuedAttachmentIds = new Set<string>();
    try {
      const idempotencyKey = `storm-observation-${stormQueueId()}`;
      stagedPhotos = await stageAttachments(observationPhotos);
      const item = createStormQueueItem({ ownerId: user.id, kind: "observation", idempotencyKey, payload: { data: { eventId: patrol.event.id, description: observation.trim(), idempotencyKey, ...observationLocation } } });
      const pendingItems = [item];
      for (const photo of stagedPhotos) {
        const photoIdempotencyKey = `storm-photo-${stormQueueId()}`;
        pendingItems.push(createStormQueueItem({
          kind: "photo",
          ownerId: user.id,
          idempotencyKey: photoIdempotencyKey,
          dependsOn: item.id,
          payload: { attachment: photo, purpose: "observation", observationIdempotencyKey: idempotencyKey, idempotencyKey: photoIdempotencyKey },
        }));
      }
      const queuedItems = await enqueueStormItems(pendingItems);
      stagedPhotos.forEach(photo => queuedAttachmentIds.add(photo.uploadId));
      const remaining = await sync();
      setObservation(""); setObservationPhotos([]); setObservationLocation(null);
      if (remaining.some(queued => queuedItems.some(item => item.id === queued.id))) {
        Alert.alert("Observation saved for sync", "The observation is safe on this device. GardenOps will keep retrying until its attachment is sent.");
      }
    } catch (error) {
      await Promise.all(stagedPhotos
        .filter(photo => !queuedAttachmentIds.has(photo.uploadId))
        .map(removeManagedAttachment));
      Alert.alert("Observation not queued", error instanceof Error ? error.message : "GardenOps could not safely queue this observation and its photos.");
      refreshQueue();
    }
  };
  const captureObservationLocation = async () => {
    setCapturingLocation(true);
    try {
      setObservationLocation(await location());
    } catch (error) {
      Alert.alert("Location unavailable", error instanceof Error ? error.message : "Unable to capture your current location.");
    } finally {
      setCapturingLocation(false);
    }
  };
  const urgent = async () => {
    if (!patrol || !selected || !issue.trim() || !user) return;
    const urgentPhotos = photos.filter(p => p.purpose === "urgent_issue");
    if (!urgentPhotos.length) { Alert.alert("Urgent photo required", "Capture an urgent issue photo before sending the alert."); return; }
    let stagedUrgentPhotos: DurableAttachment[] = [];
    let durablyQueued = false;
    try {
      stagedUrgentPhotos = await stageAttachments(urgentPhotos.map(photo => photo.source));
      const alertIdempotencyKey = `storm-alert-${stormQueueId()}`;
      const alert = createStormQueueItem({
        kind: "alert",
        ownerId: user.id,
        idempotencyKey: alertIdempotencyKey,
        payload: { eventId: patrol.event.id, message: issue.trim(), stormJobId: selected.id, idempotencyKey: alertIdempotencyKey },
      });
      const pendingItems = [alert, ...stagedUrgentPhotos.map(photo => {
        const idempotencyKey = `storm-photo-${stormQueueId()}`;
        return createStormQueueItem({
          kind: "photo",
          ownerId: user.id,
          idempotencyKey,
          dependsOn: alert.id,
          payload: { jobId: selected.id, attachment: photo, purpose: "urgent_issue", idempotencyKey },
        });
      })];
      const queuedItems = await enqueueStormItems(pendingItems);
      durablyQueued = true;
      setIssue(""); setUrgentExpanded(false); setPhotos(currentPhotos => currentPhotos.filter(photo => photo.purpose !== "urgent_issue"));
      const remaining = await sync().catch(async () => { await refreshQueue(); return loadStormQueue(user.id); });
      if (remaining.some(item => queuedItems.some(queued => queued.id === item.id))) {
        Alert.alert("Urgent issue saved for sync", "The alert is safe on this device. GardenOps will keep retrying its attachment.");
      }
    } catch (error) {
      if (!durablyQueued) await Promise.all(stagedUrgentPhotos.map(removeManagedAttachment));
      Alert.alert("Urgent issue not queued", error instanceof Error ? error.message : "GardenOps could not safely queue the alert and its photo.");
      refreshQueue();
    }
  };
  const selectedLat = selected?.lat == null ? null : Number(selected.lat);
  const selectedLng = selected?.lng == null ? null : Number(selected.lng);
  const hasSelectedCoordinates = selectedLat != null && Number.isFinite(selectedLat) && selectedLng != null && Number.isFinite(selectedLng);
  const navigateToSelectedAsset = () => {
    if (!hasSelectedCoordinates) {
      Alert.alert("Location unavailable", "This stormwater asset does not have valid map coordinates.");
      return;
    }
    const destination = `${selectedLat},${selectedLng}`;
    void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving&dir_action=navigate`);
  };
  const openJob = (job: Job) => {
    const dangerousFollowUp = (patrol?.followUps ?? []).find(
      (followUp: any) => followUp?.stormSourceJobId === job.id && followUp?.origin === "storm_patrol",
    ) as { description?: string } | undefined;
    setPhotos([]);
    setRemovedSavedPhotoIds(new Set());
    setWorkTypes((job.workTypes ?? []).filter(type => type !== "site_too_dangerous"));
    setComments(job.comments ?? "");
    setDangerous(job.status === "too_dangerous");
    setDangerReason(job.status === "too_dangerous" ? dangerousFollowUp?.description ?? "" : "");
    setFlooding(false);
    setSlips(false);
    setFloodingDescription("");
    setSlipDescription("");
    setSelected(job);
  };
  const togglePhase = (phase: string) => {
    setCollapsedPhases(currentPhases => {
      const next = new Set(currentPhases);
      if (next.has(phase)) next.delete(phase);
      else next.add(phase);
      return next;
    });
  };

  if (selected) return <><ScrollView style={[styles.root, { backgroundColor: colors.background }]} contentContainerStyle={[styles.detail, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 }]}>
    <TouchableOpacity onPress={() => setSelected(null)}><Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>‹ Patrol list</Text></TouchableOpacity>
    <Text style={[styles.title, { color: colors.foreground }]}>{selected.assetName ?? "Stormwater site"}</Text>
    <Text style={[styles.sub, { color: colors.mutedForeground }]}>{label(selected.phase)}</Text>
    {hasSelectedCoordinates ? <View style={styles.assetMapSection}>
      <View style={[styles.mapToggle, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TouchableOpacity onPress={() => setJobMapType("map")} style={[styles.mapToggleButton, jobMapType === "map" && { backgroundColor: colors.primary }]}>
          <Feather name="map" size={15} color={jobMapType === "map" ? "#fff" : colors.mutedForeground}/>
          <Text style={[styles.mapToggleText, { color: jobMapType === "map" ? "#fff" : colors.foreground }]}>Map</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setJobMapType("aerial")} style={[styles.mapToggleButton, jobMapType === "aerial" && { backgroundColor: colors.primary }]}>
          <Feather name="image" size={15} color={jobMapType === "aerial" ? "#fff" : colors.mutedForeground}/>
          <Text style={[styles.mapToggleText, { color: jobMapType === "aerial" ? "#fff" : colors.foreground }]}>Aerial</Text>
        </TouchableOpacity>
      </View>
      <View style={[styles.assetMapFrame, { borderColor: colors.border }]}>
        <PinMap key={jobMapType} lat={selectedLat} lng={selectedLng} height={210} mapType={jobMapType}/>
      </View>
      <Button title="Navigate to" icon="navigation" onPress={navigateToSelectedAsset} color={colors.primary}/>
    </View> : <View style={[styles.mapUnavailable, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Feather name="map-pin" size={18} color={colors.mutedForeground}/>
      <Text style={[styles.help, { color: colors.mutedForeground }]}>No mapped location is available for this asset.</Text>
    </View>}
    <View style={[styles.sectionDivider, { backgroundColor: colors.border }]}/>
    <Text style={[styles.heading, { color: colors.foreground }]}>1. Before photo</Text>
    <Button title={`Before photo (${photoCount("before")}/${MAX_PHOTOS_PER_SECTION})`} icon="camera" onPress={() => choosePhoto("before")} color={colors.primary}/>
    {photoCount("before") > 0 && <ScrollView horizontal contentContainerStyle={styles.photos}>
      {(selected.photos ?? []).filter(photo => photo.purpose === "before" && !removedSavedPhotoIds.has(photo.id)).map(photo => <PhotoThumbnail key={photo.id} uri={photo.blobUrl} label="before" testID={`remove-saved-photo-${photo.id}`} onRemove={() => removeSavedPhoto(photo.id)} colors={colors}/>)}
      {photos.filter(photo => photo.purpose === "before").map((photo, i) => <PhotoThumbnail key={`${photo.source.uri}-${i}`} uri={photo.source.uri} label="before" testID={`remove-before-photo-${i}`} onRemove={() => removePendingPhoto(photo)} colors={colors}/>)}
    </ScrollView>}
    <Text style={[styles.heading, { color: colors.foreground }]}>2. Work completed</Text>
    <Pressable onPress={() => setDangerous(x => !x)} style={styles.check}><Feather name={dangerous ? "check-square" : "square"} size={20} color={dangerous ? colors.primary : colors.mutedForeground}/><Text style={{ color: colors.foreground }}>Site is too dangerous to complete</Text></Pressable>
    {dangerous && <TextInput value={dangerReason} onChangeText={setDangerReason} multiline placeholder="Why is it unsafe?" placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.note, { color: colors.foreground, borderColor: colors.border }]}/>}
    <View style={styles.chips}>{WORK_TYPES.map(([value, text]) => <Pressable key={value} onPress={() => setWorkTypes(w => w.includes(value) ? w.filter(x => x !== value) : [...w, value])} style={[styles.chip, { borderColor: workTypes.includes(value) ? colors.primary : colors.border, backgroundColor: workTypes.includes(value) ? colors.secondary : colors.card }]}><Text style={{ color: colors.foreground }}>{text}</Text></Pressable>)}</View>
    {selected.phase === "post" && <><Text style={[styles.heading, { color: colors.foreground }]}>Post-storm conditions</Text><BooleanQuestion title="New flooding?" value={flooding} onChange={value => { setFlooding(value); if (!value) { setFloodingDescription(""); setPhotos(currentPhotos => currentPhotos.filter(photo => photo.purpose !== "new_flooding")); } }} color={colors.primary}/>{flooding && <><TextInput value={floodingDescription} onChangeText={setFloodingDescription} multiline placeholder="Describe the flooding" placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.note, { color: colors.foreground, borderColor: colors.border }]}/><Button title="Flooding photo" icon="camera" onPress={() => take("new_flooding")} color={colors.primary}/></>}<BooleanQuestion title="New slips?" value={slips} onChange={value => { setSlips(value); if (!value) { setSlipDescription(""); setPhotos(currentPhotos => currentPhotos.filter(photo => photo.purpose !== "new_slip")); } }} color={colors.primary}/>{slips && <><TextInput value={slipDescription} onChangeText={setSlipDescription} multiline placeholder="Describe the slip" placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.note, { color: colors.foreground, borderColor: colors.border }]}/><Button title="Slip photo" icon="camera" onPress={() => take("new_slip")} color={colors.primary}/></>}</>}
    <TextInput value={comments} onChangeText={setComments} multiline placeholder={workTypes.includes("visual_check_only") && !dangerous ? "Comments (required for visual check only)" : "Comments (optional)"} placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.note, { color: colors.foreground, borderColor: colors.border }]}/>
    <Text style={[styles.heading, { color: colors.foreground }]}>3. After photo</Text>
    <Button title={`After photo (${photoCount("after")}/${MAX_PHOTOS_PER_SECTION})`} icon="camera" onPress={() => choosePhoto("after")} color={colors.primary}/>
    {photoCount("after") > 0 && <ScrollView horizontal contentContainerStyle={styles.photos}>
      {(selected.photos ?? []).filter(photo => photo.purpose === "after" && !removedSavedPhotoIds.has(photo.id)).map(photo => <PhotoThumbnail key={photo.id} uri={photo.blobUrl} label="after" testID={`remove-saved-photo-${photo.id}`} onRemove={() => removeSavedPhoto(photo.id)} colors={colors}/>)}
      {photos.filter(photo => photo.purpose === "after").map((photo, i) => <PhotoThumbnail key={`${photo.source.uri}-${i}`} uri={photo.source.uri} label="after" testID={`remove-after-photo-${i}`} onRemove={() => removePendingPhoto(photo)} colors={colors}/>)}
    </ScrollView>}
    <Button title={isCompletedJob(selected) ? "Save changes" : dangerous ? "Report dangerous site" : "Complete patrol"} icon="check-circle" onPress={complete} color={dangerous ? colors.destructive : colors.success}/>
    <View style={[styles.sectionDivider, { backgroundColor: colors.border }]}/>
    <View style={[styles.urgentPanel, { backgroundColor: colors.destructive }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: urgentExpanded }}
        testID="storm-urgent-toggle"
        onPress={() => setUrgentExpanded(expanded => !expanded)}
        style={styles.urgentHeader}
      >
        <Text style={styles.urgentTitle}>Urgent issue</Text>
        <Feather name={urgentExpanded ? "chevron-up" : "chevron-down"} size={22} color="#000"/>
      </Pressable>
      {urgentExpanded && <View style={styles.urgentContent}>
        <TextInput value={issue} onChangeText={setIssue} placeholder="Tell managers what needs urgent attention" placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.urgentInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}/>
        <Button title="Urgent issue photo" icon="camera" onPress={() => take("urgent_issue")} color={colors.primary}/>
        <Button title="Send urgent alert" icon="alert-circle" onPress={urgent} color="#7f1d1d"/>
      </View>}
    </View>
  </ScrollView></>;

  return <View style={[styles.root, { backgroundColor: colors.background }]}><ScrollView contentContainerStyle={[styles.list, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 }]} refreshControl={<RefreshControl refreshing={current.isRefetching} onRefresh={() => { void sync().catch(refreshQueue); }} tintColor={colors.primary}/>}>
    <Text style={[styles.title, { color: colors.foreground }]}>Storm Patrol</Text>
    {patrol ? <><Text style={[styles.sub, { color: colors.mutedForeground }]}>{patrol.event.name} · {patrol.summary.checkedCount}/{patrol.summary.selectedCount} checked</Text>
      {queue.length > 0 && <View style={[styles.sync, { backgroundColor: colors.secondary }]}>
        <Pressable testID="storm-sync-retry" onPress={() => { void sync(true).catch(refreshQueue); }} style={styles.syncRetry}>
          <Feather name="upload-cloud" color={colors.primary} size={16}/>
          <View style={{ flex: 1 }}><Text style={{ color: colors.foreground }}>{queue.length} item{queue.length === 1 ? "" : "s"} waiting to sync — Retry</Text>{queue[0].lastError ? <Text style={[styles.syncError, { color: colors.mutedForeground }]} numberOfLines={2}>{queue[0].lastError}</Text> : null}</View>
        </Pressable>
        {photoQueueBlocked && <TouchableOpacity testID="storm-sync-clear-photos" disabled={discardingPhotos} onPress={discardQueuedPhotos} style={[styles.clearPhotos, { borderColor: colors.destructive, opacity: discardingPhotos ? 0.6 : 1 }]}>
          <Text style={[styles.clearPhotosText, { color: colors.destructive }]}>{discardingPhotos ? "Discarding unavailable photos…" : `Discard ${unrecoverablePhotos.length} unavailable photo${unrecoverablePhotos.length === 1 ? "" : "s"} and reselect`}</Text>
        </TouchableOpacity>}
      </View>}
      {grouped.map(([phase, jobs]) => {
        if (!jobs.length) return null;
        const collapsed = collapsedPhases.has(phase);
        return <View key={phase}>
          <Pressable testID={`storm-phase-${phase}`} accessibilityRole="button" accessibilityState={{ expanded: !collapsed }} onPress={() => togglePhase(phase)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={[styles.phase, { color: colors.primary }]}>{label(phase)}</Text>
            <Feather name={collapsed ? "chevron-down" : "chevron-up"} size={18} color={colors.primary}/>
          </Pressable>
          {!collapsed && jobs.map((job, index) => {
            const completed = isCompletedJob(job);
            return <Pressable
              key={job.id}
              testID={`storm-job-${job.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${job.assetName ?? "Stormwater site"}, ${job.status.replace("_", " ")}`}
              onPress={() => job.status === "pending"
                ? claim.mutate({ id: job.id }, { onSuccess: claimed => { const started = (claimed as Job).startedAt ?? new Date().toISOString(); openJob({ ...job, ...claimed, startedAt: started }); current.refetch(); }, onError: () => Alert.alert("Unable to claim", "This patrol may have been claimed by another crew member.") })
                : openJob(job)}
              style={[styles.job, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View testID={`storm-job-number-${job.id}`} style={[styles.jobSequence, { backgroundColor: completed ? "#9ca3af" : colors.primary }]}><Text style={styles.jobSequenceText}>{index + 1}</Text></View>
              <View style={{ flex: 1 }}>
                <Text testID={`storm-job-title-${job.id}`} style={[styles.jobTitle, { color: completed ? "#9ca3af" : colors.foreground }]}>{job.assetName ?? "Stormwater site"}</Text>
                <Text style={[styles.sub, { color: completed ? "#9ca3af" : colors.mutedForeground }]}>{job.status.replace("_", " ")}</Text>
              </View>
              {!completed && <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>{job.status === "pending" ? "Start" : "Open"}</Text>}
            </Pressable>;
          })}
        </View>;
      })}</>
      : current.isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 50 }}/> : <Text style={[styles.empty, { color: colors.mutedForeground }]}>There is no active Storm Patrol for your team.</Text>}
    {patrol && <View style={[styles.observation, { borderColor: colors.border }]}>
      <Text style={[styles.heading, { color: colors.foreground }]}>General observation</Text>
      <Text style={[styles.help, { color: colors.mutedForeground }]}>Record storm related issues on new, unregistered sites.</Text>
      <TextInput value={observation} onChangeText={setObservation} multiline placeholder="Describe what you see" placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.note, { color: colors.foreground, borderColor: colors.border }]}/>
      <Button title={`Observation photo (${observationPhotos.length}/${MAX_PHOTOS_PER_SECTION})`} icon="camera" onPress={() => choosePhoto("observation")} color={colors.primary}/>
      {observationPhotos.length > 0 && <ScrollView horizontal contentContainerStyle={styles.photos}>
        {observationPhotos.map((photo, index) => <PhotoThumbnail key={`${photo.uri}-${index}`} uri={photo.uri} large testID={`remove-observation-photo-${index}`} onRemove={() => removeObservationPhoto(photo)} colors={colors}/>)}
      </ScrollView>}
      <Button title={capturingLocation ? "Capturing location…" : "Capture location"} icon="map-pin" onPress={() => { if (!capturingLocation) void captureObservationLocation(); }} color={colors.primary}/>
      {observationLocation && <Text style={[styles.locationStatus, { color: colors.success }]}>Location captured: {observationLocation.locationLat.toFixed(5)}, {observationLocation.locationLng.toFixed(5)}</Text>}
      <Button title="Send observation" icon="send" onPress={submitObservation} color={colors.success}/>
    </View>}
  </ScrollView>
    {showDiscardConfirmation && <Modal visible transparent animationType="fade" onRequestClose={() => { if (!discardingPhotos) setShowDiscardConfirmation(false); }}>
      <View style={styles.confirmOverlay}>
        <View accessibilityViewIsModal style={[styles.confirmCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.confirmTitle, { color: colors.foreground }]}>Discard queued photos?</Text>
          <Text style={[styles.confirmMessage, { color: colors.mutedForeground }]}>
            This will permanently remove {unrecoverablePhotos.length} unavailable local Storm Patrol photo{unrecoverablePhotos.length === 1 ? "" : "s"}. Completed patrol records, observations, alerts, and other retryable photos will not be removed. Select these photos again from the completed job after clearing them.
          </Text>
          {discardError && <Text accessibilityRole="alert" testID="storm-discard-error" style={[styles.confirmError, { color: colors.destructive }]}>Unable to discard photos: {discardError}</Text>}
          <View style={styles.confirmActions}>
            <TouchableOpacity testID="storm-discard-cancel" disabled={discardingPhotos} accessibilityRole="button" onPress={() => setShowDiscardConfirmation(false)} style={[styles.confirmButton, { borderColor: colors.border }]}>
              <Text style={[styles.confirmButtonText, { color: colors.foreground }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="storm-discard-confirm" disabled={discardingPhotos} accessibilityRole="button" onPress={confirmDiscardQueuedPhotos} style={[styles.confirmButton, { backgroundColor: colors.destructive, borderColor: colors.destructive }]}>
              <Text style={[styles.confirmButtonText, { color: "#fff" }]}>{discardingPhotos ? "Discarding…" : "Discard photos"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>}
  </View>;
}
function Button({ title, icon, onPress, color }: { title: string; icon: any; onPress: () => void; color: string }) { return <TouchableOpacity onPress={onPress} style={[styles.button, { backgroundColor: color }]}><Feather name={icon} size={16} color="#fff"/><Text style={styles.buttonText}>{title}</Text></TouchableOpacity>; }
function PhotoThumbnail({ uri, label, large = false, testID, onRemove, colors }: { uri: string; label?: string; large?: boolean; testID: string; onRemove: () => void; colors: ReturnType<typeof useColors> }) {
  return <View style={styles.photoContainer}>
    <Image source={{ uri }} style={large ? styles.observationPhoto : styles.photo}/>
    <TouchableOpacity testID={testID} accessibilityRole="button" accessibilityLabel={`Remove ${label ?? "observation"} photo`} onPress={onRemove} style={[styles.photoRemove, { backgroundColor: colors.destructive, borderColor: colors.card }]}>
      <Feather name="x" size={14} color="#fff"/>
    </TouchableOpacity>
    {label && <Text style={[styles.caption, { color: colors.mutedForeground }]}>{label}</Text>}
  </View>;
}
function BooleanQuestion({ title, value, onChange, color }: { title: string; value: boolean; onChange: (value: boolean) => void; color: string }) { return <View style={styles.question}><Text style={styles.questionText}>{title}</Text><Button title="Yes" icon={value ? "check-circle" : "circle"} onPress={() => onChange(true)} color={value ? color : "#64748b"}/><Button title="No" icon={!value ? "check-circle" : "circle"} onPress={() => onChange(false)} color={!value ? color : "#64748b"}/></View>; }
const styles = StyleSheet.create({ root:{flex:1}, list:{padding:16,gap:14}, detail:{padding:16,gap:12}, title:{fontFamily:"Inter_700Bold",fontSize:26}, sub:{fontFamily:"Inter_400Regular",fontSize:13},assetMapSection:{gap:10},mapToggle:{alignSelf:"flex-end",flexDirection:"row",borderWidth:1,borderRadius:10,padding:3},mapToggleButton:{minHeight:34,paddingHorizontal:12,borderRadius:7,flexDirection:"row",alignItems:"center",gap:6},mapToggleText:{fontFamily:"Inter_600SemiBold",fontSize:13},assetMapFrame:{height:212,borderWidth:1,borderRadius:12,overflow:"hidden"},mapUnavailable:{borderWidth:1,borderRadius:12,padding:14,flexDirection:"row",alignItems:"center",gap:8},phase:{fontFamily:"Inter_700Bold",fontSize:13,textTransform:"uppercase",marginTop:12,marginBottom:6}, job:{borderWidth:StyleSheet.hairlineWidth,borderRadius:12,padding:14,flexDirection:"row",alignItems:"center",marginBottom:8,gap:10},jobSequence:{width:28,height:28,borderRadius:14,alignItems:"center",justifyContent:"center"},jobSequenceText:{fontFamily:"Inter_700Bold",fontSize:13,color:"#fff"}, jobTitle:{fontFamily:"Inter_600SemiBold",fontSize:16}, sync:{padding:12,borderRadius:10,gap:8},syncRetry:{flexDirection:"row",gap:8,alignItems:"center"},syncError:{fontFamily:"Inter_400Regular",fontSize:11,marginTop:3},clearPhotos:{borderTopWidth:StyleSheet.hairlineWidth,paddingTop:9,alignItems:"center"},clearPhotosText:{fontFamily:"Inter_600SemiBold",fontSize:13},empty:{textAlign:"center",marginTop:60,fontFamily:"Inter_400Regular"}, heading:{fontFamily:"Inter_700Bold",fontSize:18,marginTop:10}, help:{fontFamily:"Inter_400Regular",fontSize:13,lineHeight:19}, actions:{flexDirection:"row",gap:8}, button:{padding:12,borderRadius:10,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:7,flex:1}, buttonText:{fontFamily:"Inter_600SemiBold",color:"#fff",fontSize:13}, photos:{gap:8},photoContainer:{position:"relative"},photoRemove:{position:"absolute",top:4,right:4,width:24,height:24,borderRadius:12,borderWidth:2,alignItems:"center",justifyContent:"center",zIndex:2}, photo:{width:72,height:72,borderRadius:8},observationPhoto:{width:96,height:96,borderRadius:10},locationStatus:{fontFamily:"Inter_600SemiBold",fontSize:12},caption:{fontFamily:"Inter_400Regular",fontSize:10,textAlign:"center",width:72}, chips:{flexDirection:"row",flexWrap:"wrap",gap:7}, chip:{borderWidth:1,borderRadius:18,paddingHorizontal:10,paddingVertical:7}, input:{borderWidth:1,borderRadius:10,padding:12,fontFamily:"Inter_400Regular",fontSize:14}, note:{minHeight:88,textAlignVertical:"top"}, check:{flexDirection:"row",alignItems:"center",gap:8,paddingVertical:5},sectionDivider:{height:StyleSheet.hairlineWidth,width:"100%",marginTop:6},urgentPanel:{borderRadius:12,padding:14,gap:12},urgentHeader:{minHeight:32,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},urgentTitle:{fontFamily:"Inter_700Bold",fontSize:18,color:"#000"},urgentContent:{gap:10},urgentInput:{minHeight:48},observation:{borderTopWidth:StyleSheet.hairlineWidth,paddingTop:14,gap:8,marginTop:10},question:{flexDirection:"row",alignItems:"center",gap:6},questionText:{flex:1,fontFamily:"Inter_600SemiBold"},photoSourceOverlay:{flex:1,justifyContent:"flex-end",backgroundColor:"rgba(0,0,0,0.45)",padding:16},photoSourceCard:{borderWidth:1,borderRadius:18,padding:18,gap:12},photoSourceTitle:{fontFamily:"Inter_700Bold",fontSize:20},photoSourceAction:{minHeight:50,borderRadius:12,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:9},photoSourceActionText:{fontFamily:"Inter_600SemiBold",fontSize:15,color:"#fff"},photoSourceCancel:{paddingVertical:10,alignItems:"center"},photoSourceCancelText:{fontFamily:"Inter_600SemiBold",fontSize:14},confirmOverlay:{flex:1,justifyContent:"center",alignItems:"center",backgroundColor:"rgba(15,23,42,0.55)",padding:24},confirmCard:{width:"100%",maxWidth:440,borderWidth:1,borderRadius:16,padding:20,gap:14},confirmTitle:{fontFamily:"Inter_700Bold",fontSize:20},confirmMessage:{fontFamily:"Inter_400Regular",fontSize:14,lineHeight:21},confirmError:{fontFamily:"Inter_600SemiBold",fontSize:13,lineHeight:19},confirmActions:{flexDirection:"row",gap:10,justifyContent:"flex-end"},confirmButton:{minHeight:46,borderWidth:1,borderRadius:10,paddingHorizontal:16,alignItems:"center",justifyContent:"center"},confirmButtonText:{fontFamily:"Inter_600SemiBold",fontSize:14} });