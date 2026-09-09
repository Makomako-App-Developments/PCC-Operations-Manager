import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { getGetCurrentStormPatrolQueryKey, useClaimStormPatrolJob, useGetCurrentStormPatrol, type StormCurrentResponse, type StormJob } from "@workspace/api-client-react";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { requestCameraPermission, requestMediaLibraryPermission } from "@/hooks/usePhotoLibraryPermission";
import { useColors } from "@/hooks/useColors";
import { clearQueuedStormPhotos, enqueueStormAlert, enqueueStormCompletion, enqueueStormObservation, enqueueStormPhoto, flushStormQueue, loadStormQueue, stormQueueId, validatePostStormConditions, validateStormCompletionComments, validateStormPhaseCompletion, type StormPhotoPurpose, type StormQueueItem } from "@/lib/stormPatrolQueue";

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
  const [observation, setObservation] = useState("");
  const [flooding, setFlooding] = useState(false);
  const [floodingDescription, setFloodingDescription] = useState("");
  const [slips, setSlips] = useState(false);
  const [slipDescription, setSlipDescription] = useState("");
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [photoSourcePurpose, setPhotoSourcePurpose] = useState<StormPhotoPurpose | null>(null);
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
    if (!result.canceled && result.assets[0]) setPhotos(p => [...p, { uri: result.assets[0].uri, purpose }]);
  };
  const library = async (purpose: StormPhotoPurpose) => {
    if (!(await requestMediaLibraryPermission())) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.75 });
    if (!result.canceled && result.assets[0]) setPhotos(p => [...p, { uri: result.assets[0].uri, purpose }]);
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
  const confirmClearQueuedPhotos = () => {
    Alert.alert(
      "Discard queued photos?",
      `This will permanently remove ${queuedPhotoCount} local Storm Patrol photo${queuedPhotoCount === 1 ? "" : "s"} that could not upload. Completed patrol records, observations, and alerts will not be removed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Discard photos",
          style: "destructive",
          onPress: () => {
            void clearQueuedStormPhotos()
              .then(async remaining => {
                setQueue(remaining);
                if (remaining.length > 0) await sync();
              })
              .catch(refreshQueue);
          },
        },
      ],
    );
  };
  const complete = async () => {
    if (!selected) return;
    const commentsError = dangerous ? null : validateStormCompletionComments(workTypes, comments);
    if (commentsError) { Alert.alert("Comments required", commentsError); return; }
    const evidenceError = validateStormPhaseCompletion(selected.phase, photos.map(p => p.purpose), dangerous);
    if (evidenceError) { Alert.alert("Photos required", evidenceError); return; }
    if (dangerous && !dangerReason.trim()) { Alert.alert("Reason required", "Explain why the site is too dangerous."); return; }
    try {
      const postError = selected.phase === "post" ? validatePostStormConditions(
        { present: flooding, description: floodingDescription, hasPhoto: photos.some(p => p.purpose === "new_flooding") },
        { present: slips, description: slipDescription, hasPhoto: photos.some(p => p.purpose === "new_slip") },
      ) : null;
      if (postError) { Alert.alert("Post-storm check incomplete", postError); return; }
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
    if (!patrol || !observation.trim()) return;
    try {
      const point = await location();
      const item = await enqueueStormObservation({ eventId: patrol.event.id, sourceJobId: selected?.id, assetId: selected?.assetId, description: observation.trim(), idempotencyKey: `storm-observation-${stormQueueId()}`, ...point });
      if (selected) {
        for (const photo of photos.filter(p => p.purpose === "observation")) {
          await enqueueStormPhoto(selected.id, photo.uri, "observation", item.id);
        }
      }
      setObservation(""); await sync();
    } catch (error) { Alert.alert("Observation queued", error instanceof Error ? error.message : "It will retry when online."); refreshQueue(); }
  };
  const urgent = async () => {
    if (!patrol || !selected || !issue.trim()) return;
    const urgentPhotos = photos.filter(p => p.purpose === "urgent_issue");
    if (!urgentPhotos.length) { Alert.alert("Urgent photo required", "Capture an urgent issue photo before sending the alert."); return; }
    const alert = await enqueueStormAlert(patrol.event.id, issue.trim(), selected.id);
    for (const photo of urgentPhotos) await enqueueStormPhoto(selected.id, photo.uri, "urgent_issue", alert.id);
    setIssue(""); await sync().catch(refreshQueue);
  };

  if (selected) return <><ScrollView style={[styles.root, { backgroundColor: colors.background }]} contentContainerStyle={[styles.detail, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 }]}>
    <TouchableOpacity onPress={() => setSelected(null)}><Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>‹ Patrol list</Text></TouchableOpacity>
    <Text style={[styles.title, { color: colors.foreground }]}>{selected.assetName ?? "Stormwater site"}</Text>
    <Text style={[styles.sub, { color: colors.mutedForeground }]}>{label(selected.phase)} · Route {selected.routeOrder ?? "—"}</Text>
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
    <Text style={[styles.heading, { color: colors.foreground }]}>Urgent issue</Text><TextInput value={issue} onChangeText={setIssue} placeholder="Tell managers what needs urgent attention" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}/><Button title="Urgent issue photo" icon="camera" onPress={() => take("urgent_issue")} color={colors.destructive}/><Button title="Send urgent alert" icon="alert-circle" onPress={urgent} color={colors.destructive}/>
  </ScrollView>
    {photoSourcePurpose && <Modal transparent animationType="fade" visible onRequestClose={() => setPhotoSourcePurpose(null)}>
      <Pressable style={styles.photoSourceOverlay} onPress={() => setPhotoSourcePurpose(null)}>
        <Pressable style={[styles.photoSourceCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={(event) => event.stopPropagation()}>
          <Text style={[styles.photoSourceTitle, { color: colors.foreground }]}>
            {photoSourcePurpose === "before" ? "Add before photo" : "Add after photo"}
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

  return <View style={[styles.root, { backgroundColor: colors.background }]}><ScrollView contentContainerStyle={[styles.list, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 }]} refreshControl={<RefreshControl refreshing={current.isRefetching} onRefresh={() => { void sync().catch(refreshQueue); }} tintColor={colors.primary}/>}>
    <Text style={[styles.title, { color: colors.foreground }]}>Storm Patrol</Text>
    {patrol ? <><Text style={[styles.sub, { color: colors.mutedForeground }]}>{patrol.event.name} · {patrol.summary.checkedCount}/{patrol.summary.selectedCount} checked</Text>
      {queue.length > 0 && <View style={[styles.sync, { backgroundColor: colors.secondary }]}>
        <Pressable testID="storm-sync-retry" onPress={() => { void sync(true).catch(refreshQueue); }} style={styles.syncRetry}>
          <Feather name="upload-cloud" color={colors.primary} size={16}/>
          <View style={{ flex: 1 }}><Text style={{ color: colors.foreground }}>{queue.length} item{queue.length === 1 ? "" : "s"} waiting to sync — Retry</Text>{queue[0].lastError ? <Text style={[styles.syncError, { color: colors.mutedForeground }]} numberOfLines={2}>{queue[0].lastError}</Text> : null}</View>
        </Pressable>
        {photoQueueBlocked && <TouchableOpacity testID="storm-sync-clear-photos" onPress={confirmClearQueuedPhotos} style={[styles.clearPhotos, { borderColor: colors.destructive }]}>
          <Text style={[styles.clearPhotosText, { color: colors.destructive }]}>Discard {queuedPhotoCount} queued photo{queuedPhotoCount === 1 ? "" : "s"}</Text>
        </TouchableOpacity>}
      </View>}
      {grouped.map(([phase, jobs]) => jobs.length ? <View key={phase}><Text style={[styles.phase, { color: colors.primary }]}>{label(phase)}</Text>{jobs.map(job => <Pressable key={job.id} onPress={() => job.status === "pending" ? claim.mutate({ id: job.id }, { onSuccess: claimed => { const started = (claimed as Job).startedAt ?? new Date().toISOString(); setSelected({ ...job, ...claimed, startedAt: started }); current.refetch(); }, onError: () => Alert.alert("Unable to claim", "This patrol may have been claimed by another crew member.") }) : setSelected(job)} style={[styles.job, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={{ flex: 1 }}><Text style={[styles.jobTitle, { color: colors.foreground }]}>{job.assetName ?? "Stormwater site"}</Text><Text style={[styles.sub, { color: colors.mutedForeground }]}>Route {job.routeOrder ?? "—"} · {job.status.replace("_", " ")}</Text></View><Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>{job.status === "pending" ? "Claim" : "Open"}</Text></Pressable>)}</View> : null)}</>
      : current.isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 50 }}/> : <Text style={[styles.empty, { color: colors.mutedForeground }]}>There is no active Storm Patrol for your team.</Text>}
    {patrol && <View style={[styles.observation, { borderColor: colors.border }]}><Text style={[styles.heading, { color: colors.foreground }]}>General observation</Text><Text style={[styles.help, { color: colors.mutedForeground }]}>Record storm related issues on new, unregistered sites.</Text><TextInput value={observation} onChangeText={setObservation} placeholder="Describe what you see" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}/><Button title="Record GPS observation" icon="map-pin" onPress={submitObservation} color={colors.primary}/></View>}
  </ScrollView></View>;
}
function Button({ title, icon, onPress, color }: { title: string; icon: any; onPress: () => void; color: string }) { return <TouchableOpacity onPress={onPress} style={[styles.button, { backgroundColor: color }]}><Feather name={icon} size={16} color="#fff"/><Text style={styles.buttonText}>{title}</Text></TouchableOpacity>; }
function BooleanQuestion({ title, value, onChange, color }: { title: string; value: boolean; onChange: (value: boolean) => void; color: string }) { return <View style={styles.question}><Text style={styles.questionText}>{title}</Text><Button title="Yes" icon={value ? "check-circle" : "circle"} onPress={() => onChange(true)} color={value ? color : "#64748b"}/><Button title="No" icon={!value ? "check-circle" : "circle"} onPress={() => onChange(false)} color={!value ? color : "#64748b"}/></View>; }
const styles = StyleSheet.create({ root:{flex:1}, list:{padding:16,gap:14}, detail:{padding:16,gap:12}, title:{fontFamily:"Inter_700Bold",fontSize:26}, sub:{fontFamily:"Inter_400Regular",fontSize:13}, phase:{fontFamily:"Inter_700Bold",fontSize:13,textTransform:"uppercase",marginTop:12,marginBottom:6}, job:{borderWidth:StyleSheet.hairlineWidth,borderRadius:12,padding:14,flexDirection:"row",alignItems:"center",marginBottom:8,gap:8}, jobTitle:{fontFamily:"Inter_600SemiBold",fontSize:16}, sync:{padding:12,borderRadius:10,gap:8},syncRetry:{flexDirection:"row",gap:8,alignItems:"center"},syncError:{fontFamily:"Inter_400Regular",fontSize:11,marginTop:3},clearPhotos:{borderTopWidth:StyleSheet.hairlineWidth,paddingTop:9,alignItems:"center"},clearPhotosText:{fontFamily:"Inter_600SemiBold",fontSize:13},empty:{textAlign:"center",marginTop:60,fontFamily:"Inter_400Regular"}, heading:{fontFamily:"Inter_700Bold",fontSize:18,marginTop:10}, help:{fontFamily:"Inter_400Regular",fontSize:13,lineHeight:19}, actions:{flexDirection:"row",gap:8}, button:{padding:12,borderRadius:10,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:7,flex:1}, buttonText:{fontFamily:"Inter_600SemiBold",color:"#fff",fontSize:13}, photos:{gap:8}, photo:{width:72,height:72,borderRadius:8}, caption:{fontFamily:"Inter_400Regular",fontSize:10,textAlign:"center",width:72}, chips:{flexDirection:"row",flexWrap:"wrap",gap:7}, chip:{borderWidth:1,borderRadius:18,paddingHorizontal:10,paddingVertical:7}, input:{borderWidth:1,borderRadius:10,padding:12,fontFamily:"Inter_400Regular",fontSize:14}, note:{minHeight:88,textAlignVertical:"top"}, check:{flexDirection:"row",alignItems:"center",gap:8,paddingVertical:5}, observation:{borderTopWidth:StyleSheet.hairlineWidth,paddingTop:14,gap:8,marginTop:10},question:{flexDirection:"row",alignItems:"center",gap:6},questionText:{flex:1,fontFamily:"Inter_600SemiBold"},photoSourceOverlay:{flex:1,justifyContent:"flex-end",backgroundColor:"rgba(0,0,0,0.45)",padding:16},photoSourceCard:{borderWidth:1,borderRadius:18,padding:18,gap:12},photoSourceTitle:{fontFamily:"Inter_700Bold",fontSize:20},photoSourceAction:{minHeight:50,borderRadius:12,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:9},photoSourceActionText:{fontFamily:"Inter_600SemiBold",fontSize:15,color:"#fff"},photoSourceCancel:{paddingVertical:10,alignItems:"center"},photoSourceCancelText:{fontFamily:"Inter_600SemiBold",fontSize:14} });