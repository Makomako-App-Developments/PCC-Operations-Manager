import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { getGetCurrentStormPatrolQueryKey, useClaimStormPatrolJob, useGetCurrentStormPatrol, type StormCurrentResponse, type StormJob } from "@workspace/api-client-react";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PinMap } from "@/components/PinMap";
import { requestCameraPermission, requestMediaLibraryPermission } from "@/hooks/usePhotoLibraryPermission";
import { useColors } from "@/hooks/useColors";
import { clearQueuedStormPhotos, enqueueStormAlert, enqueueStormCompletion, enqueueStormObservation, enqueueStormObservationPhoto, enqueueStormPhoto, flushStormQueue, getStormPatrolCompletionRequirements, loadStormQueue, stormQueueId, type StormPhotoPurpose, type StormQueueItem } from "@/lib/stormPatrolQueue";

const CACHE_KEY = "@storm_patrol_current_v1";
const WORK_TYPES = [
  ["silt_clearance", "Silt clearance"], ["litter_clearance", "Litter clearance"],
  ["debris_clearance", "Debris clearance"], ["visual_check_only", "Visual check only"],
  ["litter_debris_removed_from_site", "Litter/debris removed from site"],
  ["site_made_safe", "Site made safe"],
] as const;
type Job = StormJob & { startedAt?: string | null };
type Patrol = NonNullable<StormCurrentResponse["data"]>;
const label = (phase: string) => ({ pre: "Before storm", mid: "During storm", post: "After storm" }[phase] ?? phase);

export default function StormPatrolScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const current = useGetCurrentStormPatrol({
    query: { queryKey: getGetCurrentStormPatrolQueryKey(), refetchInterval: 30_000 },
  });
  const claim = useClaimStormPatrolJob();
  const [cached, setCached] = useState<Patrol | null>(null);
  const [queue, setQueue] = useState<StormQueueItem[]>([]);
  const [selected, setSelected] = useState<Job | null>(null);
  const [photos, setPhotos] = useState<Array<{ uri: string; purpose: StormPhotoPurpose }>>([]);
  const [workTypes, setWorkTypes] = useState<string[]>([]);
  const [comments, setComments] = useState("");
  const [dangerous, setDangerous] = useState(false);
  const [dangerReason, setDangerReason] = useState("");
  const [issue, setIssue] = useState("");
  const [urgentExpanded, setUrgentExpanded] = useState(false);
  const [observation, setObservation] = useState("");
  const [observationPhoto, setObservationPhoto] = useState<string | null>(null);
  const [observationLocation, setObservationLocation] = useState<{ locationLat: number; locationLng: number } | null>(null);
  const [capturingLocation, setCapturingLocation] = useState(false);
  const [discardingPhotos, setDiscardingPhotos] = useState(false);
  const [flooding, setFlooding] = useState(false);
  const [floodingDescription, setFloodingDescription] = useState("");
  const [slips, setSlips] = useState(false);
  const [slipDescription, setSlipDescription] = useState("");
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [photoSourcePurpose, setPhotoSourcePurpose] = useState<StormPhotoPurpose | null>(null);
  const [jobMapType, setJobMapType] = useState<"map" | "aerial">("map");
  const patrol = ((current.data as unknown as { data?: Patrol } | undefined)?.data ?? cached) as Patrol | null;

  const refreshQueue = useCallback(() => loadStormQueue().then(setQueue).catch(() => {}), []);
  useFocusEffect(useCallback(() => {
    void flushStormQueue().then(setQueue).catch(refreshQueue);
  }, [refreshQueue]));
  useEffect(() => {
    const live = (current.data as unknown as { data?: Patrol } | undefined)?.data;
    if (live) { setCached(live); AsyncStorage.setItem(CACHE_KEY, JSON.stringify(live)).catch(() => {}); }
  }, [current.data]);
  useEffect(() => { AsyncStorage.getItem(CACHE_KEY).then(raw => raw && setCached(JSON.parse(raw))).catch(() => {}); }, []);
  useEffect(() => {
    if (!selected?.startedAt) { setElapsedMinutes(0); return; }
    const update = () => setElapsedMinutes(Math.max(0, Math.floor((Date.now() - new Date(selected.startedAt!).getTime()) / 60_000)));
    update(); const timer = setInterval(update, 15_000); return () => clearInterval(timer);
  }, [selected?.id, selected?.startedAt]);

  const grouped = useMemo(() => ["pre", "mid", "post"].map(phase => [phase, (patrol?.jobs ?? []).filter(j => j.phase === phase).sort((a, b) => (a.routeOrder ?? Number.MAX_SAFE_INTEGER) - (b.routeOrder ?? Number.MAX_SAFE_INTEGER))] as const), [patrol]);
  const queuedPhotoCount = queue.filter(item => item.kind === "photo").length;
  const photoQueueBlocked = queuedPhotoCount > 0 && queue.some(item => item.kind === "photo" && item.lastError?.includes("Photo is required"));
  const take = async (purpose: StormPhotoPurpose) => {
    if (Platform.OS === "web") { await library(purpose); return; }
    if (!(await requestCameraPermission())) return;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.75 });
    if (!result.canceled && result.assets[0]) {
      if (purpose === "observation" && !selected) setObservationPhoto(result.assets[0].uri);
      else setPhotos(p => [...p, { uri: result.assets[0].uri, purpose }]);
    }
  };
  const library = async (purpose: StormPhotoPurpose) => {
    if (!(await requestMediaLibraryPermission())) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.75 });
    if (!result.canceled && result.assets[0]) {
      if (purpose === "observation" && !selected) setObservationPhoto(result.assets[0].uri);
      else setPhotos(p => [...p, { uri: result.assets[0].uri, purpose }]);
    }
  };
  const choosePhoto = (purpose: StormPhotoPurpose) => {
    setPhotoSourcePurpose(purpose);
  };
  const location = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") throw new Error("Location permission is required to submit a Storm Patrol record.");
    const point = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { locationLat: point.coords.latitude, locationLng: point.coords.longitude };
  };
  const sync = async (showFailure = false) => {
    const remaining = await flushStormQueue();
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
    Alert.alert(
      "Discard queued photos?",
      `This will permanently remove ${queuedPhotoCount} local Storm Patrol photo${queuedPhotoCount === 1 ? "" : "s"} that could not upload. Completed patrol records, observations, and alerts will not be removed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Discard photos",
          style: "destructive",
          onPress: () => {
            setDiscardingPhotos(true);
            setQueue(current => current.filter(item => item.kind !== "photo"));
            void clearQueuedStormPhotos()
              .then(setQueue)
              .catch(error => {
                Alert.alert("Unable to discard photos", error instanceof Error ? error.message : "Try again.");
                return refreshQueue();
              })
              .finally(() => setDiscardingPhotos(false));
          },
        },
      ],
    );
  };
  const complete = async () => {
    if (!selected) return;
    const missing = getStormPatrolCompletionRequirements({
      photoPurposes: photos.map(p => p.purpose),
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
    try {
      const point = await location();
      const observationItems: StormQueueItem[] = [];
      if (selected.phase === "post") {
        if (flooding) observationItems.push(await enqueueStormObservation({ eventId: selected.eventId, assetId: selected.assetId, sourceJobId: selected.id, description: "New flooding", notes: floodingDescription.trim(), idempotencyKey: `storm-flooding-${stormQueueId()}`, ...point }));
        if (slips) observationItems.push(await enqueueStormObservation({ eventId: selected.eventId, assetId: selected.assetId, sourceJobId: selected.id, description: "New slip", notes: slipDescription.trim(), idempotencyKey: `storm-slip-${stormQueueId()}`, ...point }));
      }
      for (const photo of photos.filter(p => p.purpose === "new_flooding" || p.purpose === "new_slip")) {
        const parent = photo.purpose === "new_flooding" ? observationItems.find(x => (x.payload.data as any)?.description === "New flooding") : observationItems.find(x => (x.payload.data as any)?.description === "New slip");
        if (parent) await enqueueStormPhoto(selected.id, photo.uri, photo.purpose, parent.id);
      }
      const completionKey = `storm-completion-${stormQueueId()}`;
      const result = await enqueueStormCompletion(selected.id, { outcome: dangerous ? "too_dangerous" : "completed", actualTimeMins: elapsedMinutes, comments: comments.trim() || undefined, workTypes: (dangerous ? ["site_too_dangerous"] : workTypes) as any, dangerousReason: dangerous ? dangerReason.trim() : undefined, idempotencyKey: completionKey, ...point }, observationItems.at(-1)?.id);
      for (const photo of photos) await enqueueStormPhoto(selected.id, photo.uri, photo.purpose, result.id);
      await sync();
      setSelected(null); setPhotos([]); setComments(""); setWorkTypes([]); setDangerous(false); setDangerReason(""); setFlooding(false); setSlips(false); setFloodingDescription(""); setSlipDescription("");
    } catch (error) { Alert.alert("Saved for sync", error instanceof Error ? error.message : "Your patrol record will retry when online."); refreshQueue(); }
  };
  const submitObservation = async () => {
    if (!patrol) return;
    if (!observation.trim()) { Alert.alert("Description required", "Describe what you observed before sending."); return; }
    if (!observationLocation) { Alert.alert("Location required", "Capture your current location before sending the observation."); return; }
    try {
      const idempotencyKey = `storm-observation-${stormQueueId()}`;
      const item = await enqueueStormObservation({ eventId: patrol.event.id, description: observation.trim(), idempotencyKey, ...observationLocation });
      if (observationPhoto) await enqueueStormObservationPhoto(observationPhoto, idempotencyKey, item.id);
      setObservation(""); setObservationPhoto(null); setObservationLocation(null); await sync();
    } catch (error) { Alert.alert("Observation queued", error instanceof Error ? error.message : "It will retry when online."); refreshQueue(); }
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
    if (!patrol || !selected || !issue.trim()) return;
    const urgentPhotos = photos.filter(p => p.purpose === "urgent_issue");
    if (!urgentPhotos.length) { Alert.alert("Urgent photo required", "Capture an urgent issue photo before sending the alert."); return; }
    const alert = await enqueueStormAlert(patrol.event.id, issue.trim(), selected.id);
    for (const photo of urgentPhotos) await enqueueStormPhoto(selected.id, photo.uri, "urgent_issue", alert.id);
    setIssue(""); setUrgentExpanded(false); await sync().catch(refreshQueue);
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

  if (selected) return <><ScrollView style={[styles.root, { backgroundColor: colors.background }]} contentContainerStyle={[styles.detail, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 }]}>
    <TouchableOpacity onPress={() => setSelected(null)}><Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>‹ Patrol list</Text></TouchableOpacity>
    <Text style={[styles.title, { color: colors.foreground }]}>{selected.assetName ?? "Stormwater site"}</Text>
    <Text style={[styles.sub, { color: colors.mutedForeground }]}>{label(selected.phase)} · Route {selected.routeOrder ?? "—"}</Text>
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
    <Button title="Before photo" icon="camera" onPress={() => choosePhoto("before")} color={colors.primary}/>
    {photos.length > 0 && <ScrollView horizontal contentContainerStyle={styles.photos}>{photos.map((p, i) => <View key={`${p.uri}-${i}`}><Image source={{ uri: p.uri }} style={styles.photo}/><Text style={[styles.caption, { color: colors.mutedForeground }]}>{p.purpose.replace("_", " ")}</Text></View>)}</ScrollView>}
    <Text style={[styles.heading, { color: colors.foreground }]}>2. Work completed</Text>
    <Pressable onPress={() => setDangerous(x => !x)} style={styles.check}><Feather name={dangerous ? "check-square" : "square"} size={20} color={dangerous ? colors.primary : colors.mutedForeground}/><Text style={{ color: colors.foreground }}>Site is too dangerous to complete</Text></Pressable>
    {dangerous && <TextInput value={dangerReason} onChangeText={setDangerReason} multiline placeholder="Why is it unsafe?" placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.note, { color: colors.foreground, borderColor: colors.border }]}/>}
    <View style={styles.chips}>{WORK_TYPES.map(([value, text]) => <Pressable key={value} onPress={() => setWorkTypes(w => w.includes(value) ? w.filter(x => x !== value) : [...w, value])} style={[styles.chip, { borderColor: workTypes.includes(value) ? colors.primary : colors.border, backgroundColor: workTypes.includes(value) ? colors.secondary : colors.card }]}><Text style={{ color: colors.foreground }}>{text}</Text></Pressable>)}</View>
    {selected.phase === "post" && <><Text style={[styles.heading, { color: colors.foreground }]}>Post-storm conditions</Text><BooleanQuestion title="New flooding?" value={flooding} onChange={setFlooding} color={colors.primary}/>{flooding && <><TextInput value={floodingDescription} onChangeText={setFloodingDescription} multiline placeholder="Describe the flooding" placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.note, { color: colors.foreground, borderColor: colors.border }]}/><Button title="Flooding photo" icon="camera" onPress={() => take("new_flooding")} color={colors.primary}/></>}<BooleanQuestion title="New slips?" value={slips} onChange={setSlips} color={colors.primary}/>{slips && <><TextInput value={slipDescription} onChangeText={setSlipDescription} multiline placeholder="Describe the slip" placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.note, { color: colors.foreground, borderColor: colors.border }]}/><Button title="Slip photo" icon="camera" onPress={() => take("new_slip")} color={colors.primary}/></>}</>}
    <TextInput value={comments} onChangeText={setComments} multiline placeholder={workTypes.includes("visual_check_only") && !dangerous ? "Comments (required for visual check only)" : "Comments (optional)"} placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.note, { color: colors.foreground, borderColor: colors.border }]}/>
    <Text style={[styles.heading, { color: colors.foreground }]}>3. After photo</Text>
    <Button title="After photo" icon="camera" onPress={() => choosePhoto("after")} color={colors.primary}/>
    <Button title={dangerous ? "Report dangerous site" : "Complete patrol"} icon="check-circle" onPress={complete} color={dangerous ? colors.destructive : colors.success}/>
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
  </ScrollView>
    {photoSourcePurpose && <Modal transparent animationType="fade" visible onRequestClose={() => setPhotoSourcePurpose(null)}>
      <Pressable style={styles.photoSourceOverlay} onPress={() => setPhotoSourcePurpose(null)}>
        <Pressable style={[styles.photoSourceCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={(event) => event.stopPropagation()}>
          <Text style={[styles.photoSourceTitle, { color: colors.foreground }]}>
            {photoSourcePurpose === "before" ? "Add before photo" : photoSourcePurpose === "after" ? "Add after photo" : "Add observation photo"}
          </Text>
          <Text style={[styles.help, { color: colors.mutedForeground }]}>Choose where to get the photo.</Text>
          <TouchableOpacity
            style={[styles.photoSourceAction, { backgroundColor: colors.primary }]}
            onPress={() => {
              const purpose = photoSourcePurpose;
              setPhotoSourcePurpose(null);
              void take(purpose);
            }}
          >
            <Feather name="camera" size={18} color="#fff"/>
            <Text style={styles.photoSourceActionText}>Take photo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.photoSourceAction, { backgroundColor: colors.secondary }]}
            onPress={() => {
              const purpose = photoSourcePurpose;
              setPhotoSourcePurpose(null);
              void library(purpose);
            }}
          >
            <Feather name="image" size={18} color={colors.primary}/>
            <Text style={[styles.photoSourceActionText, { color: colors.foreground }]}>Choose from library</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.photoSourceCancel} onPress={() => setPhotoSourcePurpose(null)}>
            <Text style={[styles.photoSourceCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>}
  </>;

  return <><View style={[styles.root, { backgroundColor: colors.background }]}><ScrollView contentContainerStyle={[styles.list, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 }]} refreshControl={<RefreshControl refreshing={current.isRefetching} onRefresh={() => { void sync().catch(refreshQueue); }} tintColor={colors.primary}/>}>
    <Text style={[styles.title, { color: colors.foreground }]}>Storm Patrol</Text>
    {patrol ? <><Text style={[styles.sub, { color: colors.mutedForeground }]}>{patrol.event.name} · {patrol.summary.checkedCount}/{patrol.summary.selectedCount} checked</Text>
      {queue.length > 0 && <View style={[styles.sync, { backgroundColor: colors.secondary }]}>
        <Pressable testID="storm-sync-retry" onPress={() => { void sync(true).catch(refreshQueue); }} style={styles.syncRetry}>
          <Feather name="upload-cloud" color={colors.primary} size={16}/>
          <View style={{ flex: 1 }}><Text style={{ color: colors.foreground }}>{queue.length} item{queue.length === 1 ? "" : "s"} waiting to sync — Retry</Text>{queue[0].lastError ? <Text style={[styles.syncError, { color: colors.mutedForeground }]} numberOfLines={2}>{queue[0].lastError}</Text> : null}</View>
        </Pressable>
        {photoQueueBlocked && <TouchableOpacity testID="storm-sync-clear-photos" disabled={discardingPhotos} onPress={discardQueuedPhotos} style={[styles.clearPhotos, { borderColor: colors.destructive, opacity: discardingPhotos ? 0.6 : 1 }]}>
          <Text style={[styles.clearPhotosText, { color: colors.destructive }]}>{discardingPhotos ? "Discarding queued photos…" : `Discard ${queuedPhotoCount} queued photo${queuedPhotoCount === 1 ? "" : "s"}`}</Text>
        </TouchableOpacity>}
      </View>}
      {grouped.map(([phase, jobs]) => jobs.length ? <View key={phase}><Text style={[styles.phase, { color: colors.primary }]}>{label(phase)}</Text>{jobs.map((job, index) => <Pressable key={job.id} onPress={() => job.status === "pending" ? claim.mutate({ id: job.id }, { onSuccess: claimed => { const started = (claimed as Job).startedAt ?? new Date().toISOString(); setSelected({ ...job, ...claimed, startedAt: started }); current.refetch(); }, onError: () => Alert.alert("Unable to claim", "This patrol may have been claimed by another crew member.") }) : setSelected(job)} style={[styles.job, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.jobSequence, { backgroundColor: colors.primary }]}><Text style={styles.jobSequenceText}>{index + 1}</Text></View><View style={{ flex: 1 }}><Text style={[styles.jobTitle, { color: colors.foreground }]}>{job.assetName ?? "Stormwater site"}</Text><Text style={[styles.sub, { color: colors.mutedForeground }]}>Route {job.routeOrder ?? "—"} · {job.status.replace("_", " ")}</Text></View><Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>{job.status === "pending" ? "Start" : "Open"}</Text></Pressable>)}</View> : null)}</>
      : current.isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 50 }}/> : <Text style={[styles.empty, { color: colors.mutedForeground }]}>There is no active Storm Patrol for your team.</Text>}
    {patrol && <View style={[styles.observation, { borderColor: colors.border }]}>
      <Text style={[styles.heading, { color: colors.foreground }]}>General observation</Text>
      <Text style={[styles.help, { color: colors.mutedForeground }]}>Record storm related issues on new, unregistered sites.</Text>
      <TextInput value={observation} onChangeText={setObservation} multiline placeholder="Describe what you see" placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.note, { color: colors.foreground, borderColor: colors.border }]}/>
      <Button title={observationPhoto ? "Change observation photo" : "Observation photo"} icon="camera" onPress={() => choosePhoto("observation")} color={colors.primary}/>
      {observationPhoto && <Image source={{ uri: observationPhoto }} style={styles.observationPhoto}/>}
      <Button title={capturingLocation ? "Capturing location…" : "Capture location"} icon="map-pin" onPress={() => { if (!capturingLocation) void captureObservationLocation(); }} color={colors.primary}/>
      {observationLocation && <Text style={[styles.locationStatus, { color: colors.success }]}>Location captured: {observationLocation.locationLat.toFixed(5)}, {observationLocation.locationLng.toFixed(5)}</Text>}
      <Button title="Send observation" icon="send" onPress={submitObservation} color={colors.success}/>
    </View>}
  </ScrollView></View>
    {photoSourcePurpose && !selected && <Modal transparent animationType="fade" visible onRequestClose={() => setPhotoSourcePurpose(null)}>
      <Pressable style={styles.photoSourceOverlay} onPress={() => setPhotoSourcePurpose(null)}>
        <Pressable style={[styles.photoSourceCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={(event) => event.stopPropagation()}>
          <Text style={[styles.photoSourceTitle, { color: colors.foreground }]}>Add observation photo</Text>
          <Text style={[styles.help, { color: colors.mutedForeground }]}>Choose where to get the photo.</Text>
          <TouchableOpacity style={[styles.photoSourceAction, { backgroundColor: colors.primary }]} onPress={() => { setPhotoSourcePurpose(null); void take("observation"); }}>
            <Feather name="camera" size={18} color="#fff"/><Text style={styles.photoSourceActionText}>Take photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.photoSourceAction, { backgroundColor: colors.secondary }]} onPress={() => { setPhotoSourcePurpose(null); void library("observation"); }}>
            <Feather name="image" size={18} color={colors.primary}/><Text style={[styles.photoSourceActionText, { color: colors.foreground }]}>Choose from library</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.photoSourceCancel} onPress={() => setPhotoSourcePurpose(null)}><Text style={[styles.photoSourceCancelText, { color: colors.mutedForeground }]}>Cancel</Text></TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>}
  </>;
}
function Button({ title, icon, onPress, color }: { title: string; icon: any; onPress: () => void; color: string }) { return <TouchableOpacity onPress={onPress} style={[styles.button, { backgroundColor: color }]}><Feather name={icon} size={16} color="#fff"/><Text style={styles.buttonText}>{title}</Text></TouchableOpacity>; }
function BooleanQuestion({ title, value, onChange, color }: { title: string; value: boolean; onChange: (value: boolean) => void; color: string }) { return <View style={styles.question}><Text style={styles.questionText}>{title}</Text><Button title="Yes" icon={value ? "check-circle" : "circle"} onPress={() => onChange(true)} color={value ? color : "#64748b"}/><Button title="No" icon={!value ? "check-circle" : "circle"} onPress={() => onChange(false)} color={!value ? color : "#64748b"}/></View>; }
const styles = StyleSheet.create({ root:{flex:1}, list:{padding:16,gap:14}, detail:{padding:16,gap:12}, title:{fontFamily:"Inter_700Bold",fontSize:26}, sub:{fontFamily:"Inter_400Regular",fontSize:13},assetMapSection:{gap:10},mapToggle:{alignSelf:"flex-end",flexDirection:"row",borderWidth:1,borderRadius:10,padding:3},mapToggleButton:{minHeight:34,paddingHorizontal:12,borderRadius:7,flexDirection:"row",alignItems:"center",gap:6},mapToggleText:{fontFamily:"Inter_600SemiBold",fontSize:13},assetMapFrame:{height:212,borderWidth:1,borderRadius:12,overflow:"hidden"},mapUnavailable:{borderWidth:1,borderRadius:12,padding:14,flexDirection:"row",alignItems:"center",gap:8},phase:{fontFamily:"Inter_700Bold",fontSize:13,textTransform:"uppercase",marginTop:12,marginBottom:6}, job:{borderWidth:StyleSheet.hairlineWidth,borderRadius:12,padding:14,flexDirection:"row",alignItems:"center",marginBottom:8,gap:10},jobSequence:{width:28,height:28,borderRadius:14,alignItems:"center",justifyContent:"center"},jobSequenceText:{fontFamily:"Inter_700Bold",fontSize:13,color:"#fff"}, jobTitle:{fontFamily:"Inter_600SemiBold",fontSize:16}, sync:{padding:12,borderRadius:10,gap:8},syncRetry:{flexDirection:"row",gap:8,alignItems:"center"},syncError:{fontFamily:"Inter_400Regular",fontSize:11,marginTop:3},clearPhotos:{borderTopWidth:StyleSheet.hairlineWidth,paddingTop:9,alignItems:"center"},clearPhotosText:{fontFamily:"Inter_600SemiBold",fontSize:13},empty:{textAlign:"center",marginTop:60,fontFamily:"Inter_400Regular"}, heading:{fontFamily:"Inter_700Bold",fontSize:18,marginTop:10}, help:{fontFamily:"Inter_400Regular",fontSize:13,lineHeight:19}, actions:{flexDirection:"row",gap:8}, button:{padding:12,borderRadius:10,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:7,flex:1}, buttonText:{fontFamily:"Inter_600SemiBold",color:"#fff",fontSize:13}, photos:{gap:8}, photo:{width:72,height:72,borderRadius:8},observationPhoto:{width:96,height:96,borderRadius:10},locationStatus:{fontFamily:"Inter_600SemiBold",fontSize:12},caption:{fontFamily:"Inter_400Regular",fontSize:10,textAlign:"center",width:72}, chips:{flexDirection:"row",flexWrap:"wrap",gap:7}, chip:{borderWidth:1,borderRadius:18,paddingHorizontal:10,paddingVertical:7}, input:{borderWidth:1,borderRadius:10,padding:12,fontFamily:"Inter_400Regular",fontSize:14}, note:{minHeight:88,textAlignVertical:"top"}, check:{flexDirection:"row",alignItems:"center",gap:8,paddingVertical:5},sectionDivider:{height:StyleSheet.hairlineWidth,width:"100%",marginTop:6},urgentPanel:{borderRadius:12,padding:14,gap:12},urgentHeader:{minHeight:32,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},urgentTitle:{fontFamily:"Inter_700Bold",fontSize:18,color:"#000"},urgentContent:{gap:10},urgentInput:{minHeight:48},observation:{borderTopWidth:StyleSheet.hairlineWidth,paddingTop:14,gap:8,marginTop:10},question:{flexDirection:"row",alignItems:"center",gap:6},questionText:{flex:1,fontFamily:"Inter_600SemiBold"},photoSourceOverlay:{flex:1,justifyContent:"flex-end",backgroundColor:"rgba(0,0,0,0.45)",padding:16},photoSourceCard:{borderWidth:1,borderRadius:18,padding:18,gap:12},photoSourceTitle:{fontFamily:"Inter_700Bold",fontSize:20},photoSourceAction:{minHeight:50,borderRadius:12,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:9},photoSourceActionText:{fontFamily:"Inter_600SemiBold",fontSize:15,color:"#fff"},photoSourceCancel:{paddingVertical:10,alignItems:"center"},photoSourceCancelText:{fontFamily:"Inter_600SemiBold",fontSize:14} });