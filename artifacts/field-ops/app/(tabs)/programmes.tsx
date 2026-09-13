import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { requestCameraPermission, requestMediaLibraryPermission } from "@/hooks/usePhotoLibraryPermission";
import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { useFocusEffect, useLocalSearchParams } from "expo-router";

import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { getApiUrl } from "@/lib/api";
import { pickWebCameraPhoto } from "@/lib/webPhotoPicker";
import { PhotoQueueActions } from "@/components/PhotoQueueActions";
import { AuthenticatedPhoto } from "@/components/AuthenticatedPhoto";
import { useOfflinePhotoQueue } from "@/hooks/useOfflinePhotoQueue";
import type { AttachmentSource } from "@/lib/attachmentUpload";
import { enqueuePhoto, flushQueuedPhoto, type QueuedPhoto } from "@/lib/photoQueue";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function localMondayOf(d: Date): string {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  return localDateStr(mon);
}

function formatDayLabel(d: Date): string {
  const todayStr = localDateStr(new Date());
  const ds = localDateStr(d);
  const tmrw = new Date(); tmrw.setDate(tmrw.getDate() + 1);
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  if (ds === todayStr) return "Today";
  if (ds === localDateStr(tmrw)) return "Tomorrow";
  if (ds === localDateStr(yest)) return "Yesterday";
  return d.toLocaleDateString("en-NZ", { weekday: "long" });
}

function formatDateFull(d: Date): string {
  return d.toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" });
}

const TEAM_PALETTE = [
  "#00AECD", "#f97316", "#10b981", "#f59e0b",
  "#ec4899", "#06b6d4", "#8b5cf6", "#84cc16",
];

const STATUS_LABEL: Record<string, string> = {
  draft:       "Draft",
  scheduled:   "Scheduled",
  in_progress: "In Progress",
  completed:   "Completed",
  cancelled:   "Cancelled",
};

// Backend ALLOWED_TRANSITIONS:
//   draft       → ["scheduled", "cancelled"]
//   scheduled   → ["in_progress", "draft", "cancelled"]
//   in_progress → ["completed", "scheduled", "cancelled"]
const STATUS_ACTION: Record<string, { next: string; label: string; needsSchedule: boolean } | null> = {
  draft:       { next: "scheduled",   label: "Schedule",  needsSchedule: true  },
  scheduled:   { next: "in_progress", label: "Start",     needsSchedule: false },
  in_progress: { next: "completed",   label: "Complete",  needsSchedule: false },
  completed:   null,
  cancelled:   null,
};

function statusColor(status: string, colors: any) {
  switch (status) {
    case "completed":   return colors.success;
    case "in_progress": return colors.primary;
    case "scheduled":   return "#f59e0b"; // amber
    case "cancelled":   return colors.mutedForeground;
    default:            return colors.mutedForeground;
  }
}

// ─── Schedule Modal ───────────────────────────────────────────────────────────

interface ScheduleModalProps {
  visible: boolean;
  job: any;
  userTeamId: string | null;
  token: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

function ScheduleModal({ visible, job, userTeamId, token, onClose, onSuccess }: ScheduleModalProps) {
  const colors = useColors();
  const [dateStr, setDateStr] = useState(() => job?.plannedDate ?? localDateStr(new Date()));
  const [submitting, setSubmitting] = useState(false);

  const teamId = job?.assignedTeamId ?? userTeamId;

  const handleClose = () => { setSubmitting(false); onClose(); };

  const handleSubmit = async () => {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      Alert.alert("Invalid date", "Enter a date in YYYY-MM-DD format (e.g. 2026-06-15).");
      return;
    }
    if (!teamId) {
      Alert.alert("No team assigned", "This job has no team assigned. Please assign a team from the web app before scheduling.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(getApiUrl(`/api/infill-jobs/${job.id}`), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "scheduled", plannedDate: dateStr, assignedTeamId: teamId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Failed to schedule job");
      }
      onSuccess();
      handleClose();
    } catch (e: any) {
      Alert.alert("Schedule failed", e.message ?? "Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={handleClose} />
      <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Schedule Job</Text>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
        <Text style={[styles.modalSite, { color: colors.mutedForeground }]}>{job?.assetName ?? "Site"}</Text>

        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Planned Date</Text>
          <TextInput
            style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background, borderRadius: colors.radius / 2 }]}
            value={dateStr}
            onChangeText={setDateStr}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="numbers-and-punctuation"
          />
        </View>

        {!teamId && (
          <View style={[styles.warnBox, { backgroundColor: "#fef3c7", borderColor: "#f59e0b" }]}>
            <Feather name="alert-triangle" size={14} color="#b45309" />
            <Text style={[styles.warnText, { color: "#b45309" }]}>
              No team is assigned to this job. Assign a team from the web app before scheduling.
            </Text>
          </View>
        )}
        {teamId && (
          <Text style={[styles.teamNote, { color: colors.mutedForeground }]}>
            Team: {job?.teamName ?? "your team"}
          </Text>
        )}

        <TouchableOpacity
          style={[styles.modalSubmitBtn, { backgroundColor: submitting || !teamId ? colors.muted : colors.primary }]}
          onPress={handleSubmit}
          disabled={submitting || !teamId}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.modalSubmitText}>Confirm Schedule</Text>
          )}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ─── Record Depth Modal (standalone — includes asset search) ──────────────────

interface RecordDepthModalProps {
  visible: boolean;
  token: string | null;
  onClose: () => void;
  initialAsset?: { id: string; name: string } | null;
  onSubmit: (data: {
    assetId: string;
    depthMm: number;
    mulchType?: string;
    recordedAt: string;
    isFreshApplication: boolean;
    notes?: string;
  }) => Promise<void>;
}

function RecordDepthModal({ visible, token, onClose, onSubmit, initialAsset }: RecordDepthModalProps) {
  const colors = useColors();
  const [assetQuery, setAssetQuery] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<{ id: string; name: string } | null>(null);
  const hasSetInitialDepth = useRef(false);
  useEffect(() => {
    if (visible && initialAsset && !hasSetInitialDepth.current) {
      hasSetInitialDepth.current = true;
      setSelectedAsset(initialAsset);
      setAssetQuery(initialAsset.name);
    }
    if (!visible) hasSetInitialDepth.current = false;
  }, [visible, initialAsset]);
  const [depthStr, setDepthStr] = useState("");
  const [mulchType, setMulchType] = useState("");
  const [isFresh, setIsFresh] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: assetResults, isFetching: fetchingAssets } = useQuery({
    queryKey: ["asset-search-depth", assetQuery],
    queryFn: async () => {
      const res = await fetch(getApiUrl(`/api/assets?search=${encodeURIComponent(assetQuery)}&limit=10`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { data: [] };
      return res.json() as Promise<{ data: any[] }>;
    },
    enabled: !!token && assetQuery.trim().length >= 2 && !selectedAsset,
    staleTime: 30000,
  });
  const assetOptions: any[] = assetResults?.data ?? [];

  const reset = () => {
    setAssetQuery("");
    setSelectedAsset(null);
    setDepthStr("");
    setMulchType("");
    setIsFresh(false);
    setNotes("");
    setSubmitting(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (!selectedAsset) { Alert.alert("Site required", "Search and select a site."); return; }
    const depthMm = parseInt(depthStr, 10);
    if (!isFresh && (isNaN(depthMm) || depthMm < 0)) {
      Alert.alert("Invalid depth", "Enter a depth in millimetres.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        assetId: selectedAsset.id,
        depthMm: isFresh ? 75 : depthMm,
        mulchType: mulchType.trim() || undefined,
        recordedAt: localDateStr(new Date()),
        isFreshApplication: isFresh,
        notes: notes.trim() || undefined,
      });
      reset();
      onClose();
    } catch {
      Alert.alert("Error", "Could not save depth reading. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={[naStyles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[naStyles.headerSub, { color: colors.mutedForeground }]}>Mulching</Text>
            <Text style={[naStyles.headerTitle, { color: colors.foreground }]}>Record Mulch Depth</Text>
          </View>
          <TouchableOpacity onPress={handleClose} style={{ padding: 4 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18, gap: 18, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {/* Site picker */}
          <View>
            <Text style={[naStyles.sectionLabel, { color: colors.foreground }]}>Site <Text style={{ color: "#ef4444" }}>*</Text></Text>
            {selectedAsset ? (
              <View style={[naStyles.selectedSite, { backgroundColor: colors.primary + "18", borderColor: colors.primary, borderRadius: colors.radius }]}>
                <Feather name="map-pin" size={14} color={colors.primary} />
                <Text style={[naStyles.selectedSiteName, { color: colors.primary, flex: 1 }]} numberOfLines={1}>{selectedAsset.name}</Text>
                <TouchableOpacity onPress={() => { setSelectedAsset(null); setAssetQuery(""); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="x-circle" size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <View style={[naStyles.searchRow, { borderColor: colors.border, borderRadius: colors.radius, backgroundColor: colors.card }]}>
                  <Feather name="search" size={16} color={colors.mutedForeground} />
                  <TextInput
                    style={[naStyles.searchInput, { color: colors.foreground, flex: 1 }]}
                    value={assetQuery}
                    onChangeText={setAssetQuery}
                    placeholder="Search site name…"
                    placeholderTextColor={colors.mutedForeground}
                    autoCorrect={false}
                  />
                  {fetchingAssets && <ActivityIndicator size="small" color={colors.primary} />}
                </View>
                {assetQuery.trim().length >= 2 && (
                  <View style={[naStyles.resultsList, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius }]}>
                    {assetOptions.length === 0 ? (
                      <Text style={[naStyles.noResults, { color: colors.mutedForeground }]}>No sites found</Text>
                    ) : (
                      assetOptions.map((a: any) => (
                        <TouchableOpacity
                          key={a.id}
                          style={[naStyles.resultRow, { borderBottomColor: colors.border }]}
                          onPress={() => { setSelectedAsset({ id: a.id, name: a.name }); setAssetQuery(""); }}
                          activeOpacity={0.7}
                        >
                          <Text style={[naStyles.resultName, { color: colors.foreground }]} numberOfLines={1}>{a.name}</Text>
                          {(a.description || a.suburb) && <Text style={[naStyles.resultSub, { color: colors.mutedForeground }]} numberOfLines={1}>{a.description || a.suburb}</Text>}
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Fresh application toggle */}
          <View style={[styles.freshRow, { borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Fresh Application?</Text>
              <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>Tick if mulch was just applied today</Text>
            </View>
            <Switch
              value={isFresh}
              onValueChange={setIsFresh}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>

          {!isFresh && (
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Current Depth (mm)</Text>
              <TextInput
                style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card, borderRadius: colors.radius / 2 }]}
                value={depthStr}
                onChangeText={setDepthStr}
                keyboardType="numeric"
                placeholder="e.g. 45"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
          )}

          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Mulch Type <Text style={{ fontFamily: "Inter_400Regular" }}>(optional)</Text></Text>
            <TextInput
              style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card, borderRadius: colors.radius / 2 }]}
              value={mulchType}
              onChangeText={setMulchType}
              placeholder="e.g. bark, wood chip"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Notes <Text style={{ fontFamily: "Inter_400Regular" }}>(optional)</Text></Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldMultiline, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card, borderRadius: colors.radius / 2 }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Any observations…"
              placeholderTextColor={colors.mutedForeground}
              multiline
              textAlignVertical="top"
            />
          </View>
        </ScrollView>

        <View style={[naStyles.footer, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={[naStyles.cancelBtn, { borderColor: colors.border, borderRadius: colors.radius }]}
            onPress={handleClose}
            activeOpacity={0.8}
          >
            <Text style={[naStyles.cancelBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[naStyles.submitBtn, { backgroundColor: submitting ? colors.primary + "80" : colors.primary, borderRadius: colors.radius, flex: 1 }]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Feather name="bar-chart-2" size={16} color="#fff" />
                <Text style={naStyles.submitBtnText}>Save Reading</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── New Assessment Modal ─────────────────────────────────────────────────────

const PLANT_GRADES = [
  "Root Trainer", "1 litre", "1.5 litre/PB2", "2 litre/PB3",
  "5 litre/PB 6.5", "PB 8", "PB12", "PB40", "PB95",
];

interface SpeciesRow { speciesName: string; speciesCategory: string; quantity: string; }

interface NewAssessmentModalProps {
  visible: boolean;
  token: string | null;
  onClose: () => void;
  onSuccess: () => void;
  initialAsset?: { id: string; name: string } | null;
}

function NewAssessmentModal({ visible, token, onClose, onSuccess, initialAsset }: NewAssessmentModalProps) {
  const colors = useColors();
  const [assetQuery, setAssetQuery] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<{ id: string; name: string } | null>(null);
  const hasSetInitialAssessment = useRef(false);
  useEffect(() => {
    if (visible && initialAsset && !hasSetInitialAssessment.current) {
      hasSetInitialAssessment.current = true;
      setSelectedAsset(initialAsset);
      setAssetQuery(initialAsset.name);
    }
    if (!visible) hasSetInitialAssessment.current = false;
  }, [visible, initialAsset]);
  const [assessmentDate, setAssessmentDate] = useState(() => localDateStr(new Date()));
  const [notes, setNotes] = useState("");
  const [species, setSpecies] = useState<SpeciesRow[]>([{ speciesName: "", speciesCategory: "1 litre", quantity: "" }]);
  const [submitting, setSubmitting] = useState(false);

  const { data: assetResults, isFetching: fetchingAssets } = useQuery({
    queryKey: ["asset-search-assessment", assetQuery],
    queryFn: async () => {
      const res = await fetch(getApiUrl(`/api/assets?search=${encodeURIComponent(assetQuery)}&limit=10`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { data: [] };
      return res.json() as Promise<{ data: any[] }>;
    },
    enabled: !!token && assetQuery.trim().length >= 2 && !selectedAsset,
    staleTime: 30000,
  });
  const assetOptions: any[] = assetResults?.data ?? [];

  // Plant palette for species autocomplete
  const { data: paletteData } = useQuery({
    queryKey: ["plant-palette"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/plant-palette"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json() as Promise<{ id: string; botanicalName: string; plantType: string }[]>;
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  });
  const palette = paletteData ?? [];

  const [palettePickerIdx, setPalettePickerIdx] = useState<number | null>(null);
  const [paletteSearch, setPaletteSearch] = useState("");

  const reset = () => {
    setAssetQuery("");
    setSelectedAsset(null);
    setAssessmentDate(localDateStr(new Date()));
    setNotes("");
    setSpecies([{ speciesName: "", speciesCategory: "", quantity: "" }]);
    setSubmitting(false);
    setPalettePickerIdx(null);
    setPaletteSearch("");
  };

  const handleClose = () => { reset(); onClose(); };

  const updateRow = (idx: number, field: keyof SpeciesRow, value: string) =>
    setSpecies(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  const addRow = () => setSpecies(prev => [...prev, { speciesName: "", speciesCategory: "1 litre", quantity: "" }]);
  const removeRow = (idx: number) => setSpecies(prev => prev.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    if (!selectedAsset) { Alert.alert("Site required", "Search and select a site."); return; }
    if (!assessmentDate || !/^\d{4}-\d{2}-\d{2}$/.test(assessmentDate)) {
      Alert.alert("Invalid date", "Enter a date in YYYY-MM-DD format (e.g. 2026-06-15).");
      return;
    }
    const validSpecies = species.filter(s => s.speciesName.trim() && s.speciesCategory.trim() && parseInt(s.quantity, 10) > 0);
    if (validSpecies.length === 0) {
      Alert.alert("Species required", "Add at least one species with a name, grade, and quantity greater than zero.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(getApiUrl("/api/infill-jobs"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: selectedAsset.id,
          assessmentDate,
          assessmentNotes: notes.trim() || undefined,
          species: validSpecies.map(s => ({
            speciesName: s.speciesName.trim(),
            speciesCategory: s.speciesCategory.trim(),
            quantity: parseInt(s.quantity, 10),
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Failed to create assessment");
      }
      onSuccess();
      reset();
    } catch (e: any) {
      Alert.alert("Failed to save", e.message ?? "Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        {/* Header */}
        <View style={[naStyles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[naStyles.headerSub, { color: colors.mutedForeground }]}>Infill Planting</Text>
            <Text style={[naStyles.headerTitle, { color: colors.foreground }]}>New Assessment</Text>
          </View>
          <TouchableOpacity onPress={handleClose} style={{ padding: 4 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18, gap: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {/* Site picker */}
          <View>
            <Text style={[naStyles.sectionLabel, { color: colors.foreground }]}>Site <Text style={{ color: "#ef4444" }}>*</Text></Text>
            {selectedAsset ? (
              <View style={[naStyles.selectedSite, { backgroundColor: colors.primary + "18", borderColor: colors.primary, borderRadius: colors.radius }]}>
                <Feather name="map-pin" size={14} color={colors.primary} />
                <Text style={[naStyles.selectedSiteName, { color: colors.primary, flex: 1 }]} numberOfLines={1}>{selectedAsset.name}</Text>
                <TouchableOpacity onPress={() => { setSelectedAsset(null); setAssetQuery(""); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="x-circle" size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <View style={[naStyles.searchRow, { borderColor: colors.border, borderRadius: colors.radius, backgroundColor: colors.card }]}>
                  <Feather name="search" size={16} color={colors.mutedForeground} />
                  <TextInput
                    style={[naStyles.searchInput, { color: colors.foreground, flex: 1 }]}
                    value={assetQuery}
                    onChangeText={setAssetQuery}
                    placeholder="Search site name…"
                    placeholderTextColor={colors.mutedForeground}
                    autoCorrect={false}
                  />
                  {fetchingAssets && <ActivityIndicator size="small" color={colors.primary} />}
                </View>
                {assetQuery.trim().length >= 2 && (
                  <View style={[naStyles.resultsList, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius }]}>
                    {assetOptions.length === 0 ? (
                      <Text style={[naStyles.noResults, { color: colors.mutedForeground }]}>No sites found</Text>
                    ) : (
                      assetOptions.map((a: any) => (
                        <TouchableOpacity
                          key={a.id}
                          style={[naStyles.resultRow, { borderBottomColor: colors.border }]}
                          onPress={() => { setSelectedAsset({ id: a.id, name: a.name }); setAssetQuery(""); }}
                          activeOpacity={0.7}
                        >
                          <Text style={[naStyles.resultName, { color: colors.foreground }]} numberOfLines={1}>{a.name}</Text>
                          {(a.description || a.suburb) && <Text style={[naStyles.resultSub, { color: colors.mutedForeground }]} numberOfLines={1}>{a.description || a.suburb}</Text>}
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Assessment date */}
          <View>
            <Text style={[naStyles.sectionLabel, { color: colors.foreground }]}>Assessment Date <Text style={{ color: "#ef4444" }}>*</Text></Text>
            <TextInput
              style={[naStyles.dateInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card, borderRadius: colors.radius }]}
              value={assessmentDate}
              onChangeText={setAssessmentDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numbers-and-punctuation"
            />
          </View>

          {/* Notes */}
          <View>
            <Text style={[naStyles.sectionLabel, { color: colors.foreground }]}>
              Notes <Text style={[naStyles.optional, { color: colors.mutedForeground }]}>(optional)</Text>
            </Text>
            <TextInput
              style={[naStyles.notesInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card, borderRadius: colors.radius }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Assessment observations…"
              placeholderTextColor={colors.mutedForeground}
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* Species rows */}
          <View>
            <View style={naStyles.speciesHeader}>
              <Text style={[naStyles.sectionLabel, { color: colors.foreground }]}>
                Species / Qty <Text style={{ color: "#ef4444" }}>*</Text>
              </Text>
              <Text style={[naStyles.speciesHint, { color: colors.mutedForeground }]}>At least one required</Text>
            </View>

            {species.map((row, idx) => (
              <View key={idx} style={[naStyles.speciesCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                <View style={naStyles.speciesCardHeader}>
                  <Text style={[naStyles.speciesIdx, { color: colors.mutedForeground }]}>#{idx + 1}</Text>
                  {species.length > 1 && (
                    <TouchableOpacity onPress={() => removeRow(idx)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <Feather name="trash-2" size={15} color="#ef4444" />
                    </TouchableOpacity>
                  )}
                </View>

                <Text style={[naStyles.rowLabel, { color: colors.mutedForeground }]}>Species Name</Text>
                <TouchableOpacity
                  style={[naStyles.rowInput, { borderColor: colors.border, backgroundColor: colors.background, borderRadius: colors.radius / 2, marginBottom: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}
                  onPress={() => { setPaletteSearch(""); setPalettePickerIdx(idx); }}
                  activeOpacity={0.7}
                >
                  <Text style={{ color: row.speciesName ? colors.foreground : colors.mutedForeground, fontSize: 15, flex: 1 }} numberOfLines={1}>
                    {row.speciesName || "Select from palette…"}
                  </Text>
                  <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
                <View style={{ height: 10 }} />

                <Text style={[naStyles.rowLabel, { color: colors.mutedForeground }]}>Grade / Container Size</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {PLANT_GRADES.map(grade => (
                      <TouchableOpacity
                        key={grade}
                        style={[
                          naStyles.catChip,
                          row.speciesCategory === grade
                            ? { backgroundColor: colors.primary, borderColor: colors.primary }
                            : { backgroundColor: "transparent", borderColor: colors.border },
                        ]}
                        onPress={() => updateRow(idx, "speciesCategory", grade)}
                      >
                        <Text style={[naStyles.catChipText, { color: row.speciesCategory === grade ? "#fff" : colors.foreground }]}>{grade}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                <Text style={[naStyles.rowLabel, { color: colors.mutedForeground }]}>Quantity</Text>
                <TextInput
                  style={[naStyles.rowInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background, borderRadius: colors.radius / 2 }]}
                  value={row.quantity}
                  onChangeText={v => updateRow(idx, "quantity", v.replace(/[^0-9]/g, ""))}
                  placeholder="e.g. 5"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                />
              </View>
            ))}

            <TouchableOpacity
              style={[naStyles.addRowBtn, { borderColor: colors.primary, borderRadius: colors.radius }]}
              onPress={addRow}
              activeOpacity={0.7}
            >
              <Feather name="plus" size={15} color={colors.primary} />
              <Text style={[naStyles.addRowText, { color: colors.primary }]}>Add species</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Palette picker modal — only mount content when open so autoFocus
            doesn't fire while hidden (React Native Web renders Modal children
            into a portal even when visible=false, which triggers error #300). */}
        {palettePickerIdx !== null && <Modal
          visible
          animationType="slide"
          transparent
          onRequestClose={() => setPalettePickerIdx(null)}
        >
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}>
            <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: "82%", paddingBottom: 24 }}>
              {/* Handle + header */}
              <View style={{ alignItems: "center", paddingTop: 10, paddingBottom: 6 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, flex: 1 }}>Select Species</Text>
                <TouchableOpacity onPress={() => setPalettePickerIdx(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="x" size={20} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              {/* Search bar */}
              <View style={{ flexDirection: "row", alignItems: "center", margin: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.background, paddingHorizontal: 10, gap: 8 }}>
                <Feather name="search" size={15} color={colors.mutedForeground} />
                <TextInput
                  style={{ flex: 1, fontSize: 14, color: colors.foreground, paddingVertical: 9 }}
                  placeholder="Search species…"
                  placeholderTextColor={colors.mutedForeground}
                  value={paletteSearch}
                  onChangeText={setPaletteSearch}
                  autoFocus={Platform.OS !== "web"}
                  autoCorrect={false}
                />
                {paletteSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setPaletteSearch("")} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Feather name="x-circle" size={15} color={colors.mutedForeground} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Species list */}
              <FlatList
                data={palette.filter(p =>
                  paletteSearch.trim().length === 0 ||
                  p.botanicalName.toLowerCase().includes(paletteSearch.toLowerCase())
                )}
                keyExtractor={p => p.id}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <View style={{ padding: 24, alignItems: "center" }}>
                    <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>No species found</Text>
                  </View>
                }
                renderItem={({ item: p }) => (
                  <TouchableOpacity
                    style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border }}
                    onPress={() => {
                      if (palettePickerIdx !== null) {
                        setSpecies(prev => prev.map((r, i) => i === palettePickerIdx ? {
                          ...r,
                          speciesName: p.botanicalName,
                          speciesCategory: r.speciesCategory || "1 litre",
                        } : r));
                      }
                      setPalettePickerIdx(null);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{p.botanicalName}</Text>
                      <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 1 }}>{p.plantType}</Text>
                    </View>
                    <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </Modal>}

        {/* Footer */}
        <View style={[naStyles.footer, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={[naStyles.cancelBtn, { borderColor: colors.border, borderRadius: colors.radius }]}
            onPress={handleClose}
            activeOpacity={0.8}
          >
            <Text style={[naStyles.cancelBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[naStyles.submitBtn, { backgroundColor: submitting ? colors.primary + "80" : colors.primary, borderRadius: colors.radius, flex: 1 }]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Feather name="check" size={16} color="#fff" />
                <Text style={naStyles.submitBtnText}>Save Assessment</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Infill completion photos ─────────────────────────────────────────────────

interface InfillPhoto {
  id: string;
  blobUrl: string;
  caption?: string | null;
  createdAt: string;
}

function InfillCompletionPhotos({
  jobId,
  token,
}: {
  jobId: string;
  token: string | null;
}) {
  const colors = useColors();
  const { data, isLoading, isError, refetch, isFetching } = useQuery<{ data: InfillPhoto[] }>({
    queryKey: ["infill-job-photos", jobId],
    queryFn: async () => {
      const res = await fetch(getApiUrl(`/api/infill-jobs/${jobId}/photos`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load completion photos");
      return res.json();
    },
    enabled: !!token && !!jobId,
  });
  const { user } = useAuth();
  const {
    pending: queuedPhotos,
    isFlushing,
    track: trackQueuedPhoto,
  } = useOfflinePhotoQueue("infill-job", jobId);
  const uploadPhoto = useMutation({
    mutationFn: async (source: AttachmentSource) => {
      if (!user) throw new Error("Sign in again before saving this photo.");
      const queued = await enqueuePhoto(user.id, "infill-job", jobId, source);
      if (await flushQueuedPhoto(queued, user.id)) {
        await refetch();
        return { uploaded: true };
      }
      return { queued: true, item: queued };
    },
    onSuccess: result => {
      if (result.queued) {
        trackQueuedPhoto(result.item);
        Alert.alert(
          "Photo saved for sync",
          "The photo is safe on this device and will upload automatically when the connection is available.",
        );
      }
    },
    onError: error => Alert.alert(
      "Photo not saved",
      error instanceof Error
        ? error.message
        : "GardenOps could not safely store this photo. Please select it again.",
    ),
  });
  const photos = data?.data ?? [];
  const totalCount = photos.length + queuedPhotos.length;

  const addPhoto = (source: AttachmentSource) => {
    const mimeType = source.mimeType?.trim().toLowerCase() || source.file?.type?.trim().toLowerCase();
    const fileName = source.fileName?.trim().toLowerCase() || source.uri.split("?")[0]?.toLowerCase();
    const isPdfCompatible = mimeType
      ? mimeType === "image/jpeg" || mimeType === "image/jpg" || mimeType === "image/png"
      : fileName?.endsWith(".jpg") || fileName?.endsWith(".jpeg") || fileName?.endsWith(".png");
    if (!isPdfCompatible) {
      Alert.alert(
        "Choose a JPEG or PNG photo",
        "Infill completion photos must be JPEG or PNG so they can be included in the completion PDF.",
      );
      return;
    }
    uploadPhoto.mutate(source);
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
      addPhoto({ ...asset, file: asset.file });
    }
  };

  const takePhoto = async () => {
    if (Platform.OS === "web") {
      try {
        const source = await pickWebCameraPhoto();
        if (source) addPhoto(source);
      } catch {
        Alert.alert(
          "Camera unavailable",
          "Chrome could not open the camera. Check the site camera permission, then try again. You can still choose a photo from the gallery.",
        );
      }
      return;
    }
    if (!(await requestCameraPermission())) return;
    try {
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
      if (!result.canceled && result.assets[0]) addPhoto(result.assets[0]);
    } catch {
      Alert.alert(
        "Camera unavailable",
        "GardenOps could not open your camera. You can still attach a photo from your library.",
      );
    }
  };

  return (
    <View style={[styles.infillPhotos, { borderTopColor: colors.border }]}>
      <View style={styles.infillPhotosHeader}>
        <Feather name="camera" size={15} color={colors.primary} />
        <Text style={[styles.infillPhotosTitle, { color: colors.foreground }]}>
          Completion photos
        </Text>
        {totalCount > 0 && (
          <Text style={[styles.infillPhotosCount, { color: colors.mutedForeground }]}>
            {totalCount}
          </Text>
        )}
        {(queuedPhotos.length > 0 || isFlushing) && (
          <Text style={[styles.infillPhotosQueue, { color: "#b45309" }]}>
            {isFlushing ? "Uploading…" : `${queuedPhotos.length} queued`}
          </Text>
        )}
      </View>

      {isError ? (
        <View style={styles.infillPhotosError}>
          <Text style={[styles.infillPhotosHint, { color: colors.mutedForeground }]}>
            Photos are unavailable right now.
          </Text>
          <TouchableOpacity onPress={() => refetch()} disabled={isFetching}>
            {isFetching
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Text style={[styles.infillPhotosRetry, { color: colors.primary }]}>Retry</Text>}
          </TouchableOpacity>
        </View>
      ) : isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 10 }} />
      ) : totalCount > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.infillPhotoRow}>
          {photos.map(photo => (
            <AuthenticatedPhoto
              key={photo.id}
              uri={getApiUrl(photo.blobUrl)}
              token={token}
              style={[styles.infillPhotoThumb, { borderRadius: colors.radius / 2 }]}
              placeholderColor={colors.card}
              iconColor={colors.mutedForeground}
            />
          ))}
          {queuedPhotos.map((photo: QueuedPhoto) => (
            <View key={photo.id} style={styles.infillPhotoPending}>
              <Image
                source={{ uri: photo.uri }}
                style={[styles.infillPhotoThumb, { borderRadius: colors.radius / 2, opacity: 0.65 }]}
              />
              <View style={[styles.infillPhotoPendingOverlay, { borderRadius: colors.radius / 2 }]}>
                <Feather name="clock" size={15} color="#fff" />
              </View>
            </View>
          ))}
        </ScrollView>
      ) : (
        <Text style={[styles.infillPhotosHint, { color: colors.mutedForeground }]}>
          Add photos showing the completed planting work.
        </Text>
      )}

      <PhotoQueueActions
        containerStyle={styles.infillPhotoActions}
        buttonStyle={[styles.infillPhotoButton, { borderColor: colors.border, borderRadius: colors.radius / 2 }]}
        textStyle={[styles.infillPhotoButtonText, { color: colors.foreground }]}
        iconColor={colors.primary}
        isPending={uploadPhoto.isPending}
        onTakePhoto={takePhoto}
        onPickFromLibrary={pickFromLibrary}
      />
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

type ActiveTab = "schedule" | "infill" | "mulch";

export default function ProgrammesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const qc = useQueryClient();

  const isPrivileged = ["administrator", "manager", "supervisor"].includes(user?.role ?? "");

  const [activeTab, setActiveTab] = useState<ActiveTab>("schedule");
  const [showDepthModal, setShowDepthModal] = useState(false);
  const [scheduleModal, setScheduleModal] = useState<any | null>(null);
  const [expandedInfill, setExpandedInfill] = useState<Set<string>>(new Set());
  const [showNewAssessment, setShowNewAssessment] = useState(false);
  const [preFillAsset, setPreFillAsset] = useState<{ id: string; name: string } | null>(null);

  // ── Deep-link params from asset detail ──
  const { openTab, openModal, preAssetId, preAssetName, ts } = useLocalSearchParams<{
    openTab?: string; openModal?: string; preAssetId?: string; preAssetName?: string; ts?: string;
  }>();
  const lastHandledTs = useRef<string | null>(null);
  useFocusEffect(useCallback(() => {
    if (!openTab || !openModal) return;
    const key = ts ?? `${openTab}|${openModal}|${preAssetId}`;
    if (key === lastHandledTs.current) return;
    lastHandledTs.current = key;
    const asset = preAssetId && preAssetName ? { id: preAssetId, name: preAssetName } : null;
    setActiveTab(openTab as ActiveTab);
    setPreFillAsset(asset);
    if (openModal === "depth") setShowDepthModal(true);
    else if (openModal === "assessment") setShowNewAssessment(true);
  }, [openTab, openModal, preAssetId, preAssetName, ts]));

  // ── Schedule tab state ──
  const [scheduleDate, setScheduleDate] = useState(() => new Date());
  const [collapsedTeams, setCollapsedTeams] = useState<Set<string>>(new Set());

  const bottomPad = insets.bottom + (Platform.OS === "web" ? 84 : 100);

  // ── Schedule tab data ──
  const scheduleDateStr = localDateStr(scheduleDate);
  const weekStr = localMondayOf(scheduleDate);

  const {
    data: schedWeekData,
    isLoading: loadingSchedule,
    refetch: refetchSchedule,
    isRefetching: refetchingSchedule,
  } = useQuery({
    queryKey: ["schedule-week-mobile", weekStr],
    queryFn: async () => {
      const res = await fetch(getApiUrl(`/api/schedule/week?week=${weekStr}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch schedule");
      return res.json() as Promise<{ days: { date: string; jobs: any[] }[] }>;
    },
    enabled: !!token && activeTab === "schedule",
  });

  const { data: teamsResp } = useQuery({
    queryKey: ["teams-mobile"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/teams"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json() as Promise<any[]>;
    },
    enabled: !!token,
    staleTime: 5 * 60_000,
  });

  const teamsArr: any[] = teamsResp ?? [];
  const teamColorMap = useMemo(() => {
    const sorted = [...teamsArr].sort((a, b) => a.name.localeCompare(b.name));
    const m = new Map<string, string>();
    sorted.forEach((t, i) => m.set(t.id, TEAM_PALETTE[i % TEAM_PALETTE.length]));
    return m;
  }, [teamsArr]);

  const getTeamColor = (id?: string | null) => teamColorMap.get(id ?? "") ?? "#94a3b8";
  const getTeamName = (id?: string | null) => teamsArr.find(t => t.id === id)?.name ?? "Unknown Team";

  const todayJobs: any[] = useMemo(() => {
    const dayObj = schedWeekData?.days?.find((d: any) => d.date === scheduleDateStr);
    return dayObj?.jobs ?? [];
  }, [schedWeekData, scheduleDateStr]);

  const sortedTeamGroups: [string, any[]][] = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const job of todayJobs) {
      if (job.isAllTeams) {
        for (const t of teamsArr) {
          if (!groups.has(t.id)) groups.set(t.id, []);
          groups.get(t.id)!.push(job);
        }
      } else if (job.teamId) {
        if (!groups.has(job.teamId)) groups.set(job.teamId, []);
        groups.get(job.teamId)!.push(job);
      }
    }
    return [...groups.entries()]
      .filter(([, jobs]) => jobs.length > 0)
      .sort(([aId], [bId]) => getTeamName(aId).localeCompare(getTeamName(bId)));
  }, [todayJobs, teamsArr]);

  const prevDay = () => setScheduleDate(d => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; });
  const nextDay = () => setScheduleDate(d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; });
  const goToToday = () => setScheduleDate(new Date());
  const toggleTeamCollapse = (id: string) =>
    setCollapsedTeams(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  // ── Infill Jobs ──
  const {
    data: infillAll,
    isLoading: loadingInfill,
    refetch: refetchInfill,
    isRefetching: refetchingInfill,
  } = useQuery({
    queryKey: ["infill-jobs-all-mobile"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/infill-jobs"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch infill jobs");
      return res.json() as Promise<{ data: any[] }>;
    },
    enabled: !!token && activeTab === "infill",
  });

  const infillJobs: any[] = (infillAll?.data ?? []).filter(
    (j: any) => ["draft", "scheduled", "in_progress"].includes(j.status),
  );

  // ── Mulching Records ──
  const {
    data: mulchData,
    isLoading: loadingMulch,
    refetch: refetchMulch,
    isRefetching: refetchingMulch,
  } = useQuery({
    queryKey: ["mulching-records-mobile"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/mulching-records"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch mulching records");
      return res.json() as Promise<{ data: any[] }>;
    },
    enabled: !!token && activeTab === "mulch",
  });

  const mulchRecords: any[] = (mulchData?.data ?? []).filter(
    (r: any) => r.status !== "completed",
  );

  // ── Advance-status mutation (for non-schedule transitions) ──
  const advanceInfill = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(getApiUrl(`/api/infill-jobs/${id}`), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Failed to update status");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["infill-jobs-all-mobile"] });
    },
    onError: (err: any) => Alert.alert("Update failed", err.message ?? "Please try again."),
  });

  // ── Mulch depth mutation ──
  const recordDepth = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(getApiUrl("/api/mulch-depth-readings"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to record depth");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mulching-records-mobile"] });
      Alert.alert("Saved", "Depth reading recorded. Next mulching date updated.");
    },
    onError: () => { throw new Error("Failed to record depth"); },
  });

  const toggleExpand = (id: string) => {
    setExpandedInfill((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAction = (job: any) => {
    const action = STATUS_ACTION[job.status as string];
    if (!action) return;
    if (action.needsSchedule) {
      setScheduleModal(job);
      return;
    }
    Alert.alert(
      `Mark as ${STATUS_LABEL[action.next]}?`,
      `Move "${job.assetName}" to ${STATUS_LABEL[action.next]}.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: action.label, onPress: () => advanceInfill.mutate({ id: job.id, status: action.next }) },
      ],
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.navy, paddingTop: insets.top + 16 }]}>
        <Text style={styles.headerTitle}>Schedule</Text>
      </View>

      {/* Tabs */}
      <View style={[styles.tabRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(["schedule", "infill", "mulch"] as ActiveTab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, activeTab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(t)}
          >
            <Text style={[styles.tabBtnText, { color: activeTab === t ? colors.primary : colors.mutedForeground }]}>
              {t === "schedule" ? "Schedule" : t === "infill" ? "Infill" : "Mulching"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Schedule tab ───────────────────────────────────────────────── */}
      {activeTab === "schedule" && (
        <View style={{ flex: 1 }}>
          {/* Date navigation bar */}
          <View style={[sStyles.dateBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={prevDay} style={sStyles.arrowBtn} activeOpacity={0.7}>
              <Feather name="chevron-left" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <TouchableOpacity style={sStyles.dateCenter} onPress={goToToday} activeOpacity={0.7}>
              <Text style={[sStyles.dayLabel, { color: colors.foreground }]}>
                {formatDayLabel(scheduleDate)}
              </Text>
              <Text style={[sStyles.dateLabel, { color: colors.mutedForeground }]}>
                {formatDateFull(scheduleDate)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={nextDay} style={sStyles.arrowBtn} activeOpacity={0.7}>
              <Feather name="chevron-right" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: bottomPad }}
            refreshControl={
              <RefreshControl
                refreshing={refetchingSchedule}
                onRefresh={refetchSchedule}
                tintColor={colors.primary}
              />
            }
            showsVerticalScrollIndicator={false}
          >
            {loadingSchedule ? (
              <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} size="large" />
            ) : todayJobs.length === 0 ? (
              <View style={styles.empty}>
                <Feather name="calendar" size={40} color={colors.border} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No jobs scheduled</Text>
                <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
                  No jobs are scheduled for this day.{"\n"}Tap the date to jump back to today.
                </Text>
              </View>
            ) : (
              <>
                {/* Summary */}
                <Text style={[sStyles.summary, { color: colors.mutedForeground }]}>
                  {todayJobs.length} job{todayJobs.length !== 1 ? "s" : ""} across{" "}
                  {sortedTeamGroups.length} team{sortedTeamGroups.length !== 1 ? "s" : ""}
                </Text>

                {sortedTeamGroups.map(([teamId, teamJobs]) => {
                  const teamColor = getTeamColor(teamId);
                  const teamName = getTeamName(teamId);
                  const isCollapsed = collapsedTeams.has(teamId);
                  const totalMins = teamJobs.reduce(
                    (s: number, j: any) => s + (j.estimatedTimeMins ?? j.serviceTimeMins ?? 0), 0,
                  );
                  const doneCount = teamJobs.filter((j: any) => j.status === "completed").length;
                  const inProgCount = teamJobs.filter((j: any) => j.status === "in_progress").length;
                  const doneMins = teamJobs
                    .filter((j: any) => j.status === "completed")
                    .reduce((s: number, j: any) => s + (j.estimatedTimeMins ?? j.serviceTimeMins ?? 0), 0);
                  const progress = totalMins > 0 ? Math.round((doneMins / totalMins) * 100) : 0;
                  const donePct = teamJobs.length > 0 ? (doneCount / teamJobs.length) * 100 : 0;
                  const inProgPct = teamJobs.length > 0 ? (inProgCount / teamJobs.length) * 100 : 0;

                  return (
                    <View
                      key={teamId}
                      style={[
                        sStyles.teamCard,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                          borderRadius: colors.radius,
                        },
                      ]}
                    >
                      {/* Team header — tappable to collapse */}
                      <TouchableOpacity
                        style={sStyles.teamHeader}
                        onPress={() => toggleTeamCollapse(teamId)}
                        activeOpacity={0.75}
                      >
                        <View style={[sStyles.teamStripe, { backgroundColor: teamColor }]} />
                        <View style={{ flex: 1, gap: 5 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Text style={[sStyles.teamName, { color: colors.foreground }]}>{teamName}</Text>
                            {inProgCount > 0 && (
                              <View style={[sStyles.inProgBadge, { backgroundColor: teamColor + "22" }]}>
                                <Text style={[sStyles.inProgBadgeText, { color: teamColor }]}>In Progress</Text>
                              </View>
                            )}
                          </View>
                          {/* Segmented progress bar */}
                          <View style={sStyles.progressRow}>
                            <View style={[sStyles.progressTrack, { backgroundColor: colors.border }]}>
                              {donePct > 0 && (
                                <View style={[sStyles.progressSeg, { width: `${donePct}%` as any, backgroundColor: "#10b981" }]} />
                              )}
                              {inProgPct > 0 && (
                                <View style={[sStyles.progressSeg, { width: `${inProgPct}%` as any, backgroundColor: teamColor }]} />
                              )}
                            </View>
                            <Text style={[sStyles.progressHint, { color: colors.mutedForeground }]}>
                              {doneCount}/{teamJobs.length} · {totalMins}m
                            </Text>
                          </View>
                        </View>
                        <View style={sStyles.progressPctWrap}>
                          <Text style={[sStyles.progressPct, { color: progress === 100 ? "#10b981" : teamColor }]}>
                            {progress}%
                          </Text>
                          <Text style={[sStyles.progressPctSub, { color: colors.mutedForeground }]}>done</Text>
                        </View>
                        <Feather
                          name={isCollapsed ? "chevron-right" : "chevron-down"}
                          size={16}
                          color={colors.mutedForeground}
                        />
                      </TouchableOpacity>

                      {/* Job list */}
                      {!isCollapsed && (
                        <View style={[sStyles.jobList, { borderTopColor: colors.border }]}>
                          {/* Vertical guide line */}
                          <View style={[sStyles.guideLine, { backgroundColor: colors.border }]} />
                          {teamJobs.map((job: any, idx: number) => {
                            const done = job.status === "completed";
                            const overdue = job.status === "overdue";
                            const inProg = job.status === "in_progress";
                            const dotBg = done
                              ? "#d1fae5"
                              : inProg
                              ? teamColor + "22"
                              : overdue
                              ? "#fee2e2"
                              : colors.background;
                            const dotBorder = done
                              ? "#6ee7b7"
                              : inProg
                              ? teamColor
                              : overdue
                              ? "#fca5a5"
                              : colors.border;
                            const dotTxt = done
                              ? "#059669"
                              : inProg
                              ? teamColor
                              : overdue
                              ? "#ef4444"
                              : colors.mutedForeground;
                            const displayTime = job.estimatedTimeMins ?? job.serviceTimeMins;
                            return (
                              <View
                                key={job.id}
                                style={[
                                  sStyles.jobRow,
                                  { borderBottomColor: colors.border, opacity: done ? 0.55 : 1 },
                                ]}
                              >
                                <View
                                  style={[
                                    sStyles.stopDot,
                                    { backgroundColor: dotBg, borderColor: dotBorder },
                                  ]}
                                >
                                  {done ? (
                                    <Feather name="check" size={11} color={dotTxt} />
                                  ) : (
                                    <Text style={[sStyles.stopNum, { color: dotTxt }]}>{idx + 1}</Text>
                                  )}
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text
                                    style={[
                                      sStyles.jobName,
                                      {
                                        color: done
                                          ? colors.mutedForeground
                                          : overdue
                                          ? "#ef4444"
                                          : colors.foreground,
                                        textDecorationLine: done ? "line-through" : "none",
                                      },
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {job.assetName}
                                  </Text>
                                  {job.assetDesc ? (
                                    <Text style={[sStyles.jobDesc, { color: colors.mutedForeground }]} numberOfLines={1}>
                                      {job.assetDesc}
                                    </Text>
                                  ) : null}
                                </View>
                                <View style={sStyles.jobMeta}>
                                  {overdue && (
                                    <View style={sStyles.overduePill}>
                                      <Text style={sStyles.overduePillTxt}>Overdue</Text>
                                    </View>
                                  )}
                                  {inProg && (
                                    <View style={[sStyles.inProgPill, { backgroundColor: teamColor + "22" }]}>
                                      <Text style={[sStyles.inProgPillTxt, { color: teamColor }]}>In Progress</Text>
                                    </View>
                                  )}
                                  <Text style={[sStyles.jobTime, { color: colors.mutedForeground }]}>
                                    {displayTime}m
                                  </Text>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })}
              </>
            )}
          </ScrollView>
        </View>
      )}

      {/* Infill tab */}
      {activeTab === "infill" && (
        <View style={{ flex: 1 }}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: bottomPad }}
          refreshControl={<RefreshControl refreshing={refetchingInfill} onRefresh={refetchInfill} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {loadingInfill ? (
            <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} size="large" />
          ) : infillJobs.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="activity" size={40} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No active infill jobs</Text>
              <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
                Draft, scheduled, and in-progress planting jobs appear here.
              </Text>
            </View>
          ) : (
            infillJobs.map((job: any) => {
              const expanded = expandedInfill.has(job.id);
              const action = STATUS_ACTION[job.status as string];
              const color = statusColor(job.status, colors);
              return (
                <View key={job.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                  <TouchableOpacity onPress={() => toggleExpand(job.id)} activeOpacity={0.7}>
                    <View style={styles.cardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
                          {job.assetName ?? "Unknown site"}
                        </Text>
                        {job.plannedDate && (
                          <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                            Planned: {new Date(job.plannedDate + "T00:00:00").toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })}
                          </Text>
                        )}
                        {job.teamName && (
                          <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>Team: {job.teamName}</Text>
                        )}
                      </View>
                      <View style={[styles.statusPill, { backgroundColor: color + "22" }]}>
                        <Text style={[styles.statusPillText, { color }]}>{STATUS_LABEL[job.status] ?? job.status}</Text>
                      </View>
                      <Feather name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
                    </View>
                  </TouchableOpacity>

                  {expanded && (
                    <View style={[styles.expandedBody, { borderTopColor: colors.border }]}>
                      {/* Species list */}
                      {job.species?.length > 0 && (
                        <View style={{ gap: 4, marginBottom: 12 }}>
                          <Text style={[styles.speciesHeader, { color: colors.mutedForeground }]}>Species / Qty</Text>
                          {job.species.map((sp: any, idx: number) => (
                            <View key={sp.id ?? idx} style={styles.speciesRow}>
                              <View style={[styles.speciesDot, { backgroundColor: colors.primary }]} />
                              <Text style={[styles.speciesName, { color: colors.foreground }]}>{sp.speciesName}</Text>
                              <Text style={[styles.speciesQty, { color: colors.mutedForeground }]}>×{sp.quantity}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                      {job.assessmentNotes && (
                        <Text style={[styles.cardNotes, { color: colors.mutedForeground }]}>{job.assessmentNotes}</Text>
                      )}

                      {job.status === "in_progress" && (
                        <InfillCompletionPhotos jobId={job.id} token={token} />
                      )}

                      {/* Action button */}
                      {action && (
                        <TouchableOpacity
                          style={[
                            styles.advanceBtn,
                            {
                              backgroundColor:
                                action.next === "completed" ? colors.success :
                                action.next === "scheduled" ? "#f59e0b" :
                                colors.primary,
                              borderRadius: colors.radius / 2,
                            },
                          ]}
                          onPress={() => handleAction(job)}
                          disabled={advanceInfill.isPending}
                        >
                          {advanceInfill.isPending ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text style={styles.advanceBtnText}>{action.label}</Text>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
        {isPrivileged && (
          <TouchableOpacity
            style={[naStyles.fab, { backgroundColor: colors.primary }]}
            onPress={() => setShowNewAssessment(true)}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={22} color="#fff" />
          </TouchableOpacity>
        )}
        </View>
      )}

      {/* Mulching tab */}
      {activeTab === "mulch" && (
        <View style={{ flex: 1 }}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: bottomPad }}
          refreshControl={<RefreshControl refreshing={refetchingMulch} onRefresh={refetchMulch} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {loadingMulch ? (
            <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} size="large" />
          ) : mulchRecords.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="layers" size={40} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No pending mulching records</Text>
              <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
                Records created from depth readings appear here.
              </Text>
            </View>
          ) : (
            mulchRecords.map((record: any) => {
              const scheduledDate = record.scheduledDate
                ? new Date(record.scheduledDate + "T00:00:00").toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })
                : "TBC";
              return (
                <View key={record.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
                        {record.assetName ?? "Unknown site"}
                      </Text>
                      <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                        Due: {scheduledDate}
                        {record.projectedDepthAtDue != null ? `  ·  ${record.projectedDepthAtDue}mm projected` : ""}
                      </Text>
                      {record.mulchType && (
                        <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{record.mulchType}</Text>
                      )}
                    </View>
                    <View style={[styles.statusPill, { backgroundColor: statusColor(record.status, colors) + "22" }]}>
                      <Text style={[styles.statusPillText, { color: statusColor(record.status, colors) }]}>
                        {STATUS_LABEL[record.status] ?? record.status}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
        {isPrivileged && (
          <TouchableOpacity
            style={[naStyles.fab, { backgroundColor: colors.primary }]}
            onPress={() => setShowDepthModal(true)}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
      )}

      {/* Schedule modal */}
      <ScheduleModal
        visible={!!scheduleModal}
        job={scheduleModal}
        userTeamId={user?.teamId ?? null}
        token={token}
        onClose={() => setScheduleModal(null)}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ["infill-jobs-all-mobile"] });
          setScheduleModal(null);
        }}
      />

      {/* Standalone depth recording modal */}
      <RecordDepthModal
        visible={showDepthModal}
        token={token}
        initialAsset={preFillAsset}
        onClose={() => { setShowDepthModal(false); setPreFillAsset(null); }}
        onSubmit={async (data) => {
          await recordDepth.mutateAsync(data);
        }}
      />

      {/* New assessment modal */}
      <NewAssessmentModal
        visible={showNewAssessment}
        token={token}
        initialAsset={preFillAsset}
        onClose={() => { setShowNewAssessment(false); setPreFillAsset(null); }}
        onSuccess={() => {
          setShowNewAssessment(false);
          setPreFillAsset(null);
          qc.invalidateQueries({ queryKey: ["infill-jobs-all-mobile"] });
        }}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 16 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: "#ffffff" },

  tabRow: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn: {
    flex: 1,
    paddingVertical: 13,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },

  scroll: { flex: 1 },
  empty: { alignItems: "center", marginTop: 80, gap: 12 },
  emptyTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16 },
  emptySubtitle: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center" },

  card: { borderWidth: 1, padding: 14 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  cardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  cardSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  cardNotes: { fontFamily: "Inter_400Regular", fontSize: 12, marginBottom: 10, fontStyle: "italic" },

  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, alignSelf: "flex-start" },
  statusPillText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },

  expandedBody: { marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  speciesHeader: { fontFamily: "Inter_500Medium", fontSize: 11, textTransform: "uppercase", marginBottom: 6 },
  speciesRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  speciesDot: { width: 6, height: 6, borderRadius: 3 },
  speciesName: { fontFamily: "Inter_400Regular", fontSize: 13, flex: 1 },
  speciesQty: { fontFamily: "Inter_600SemiBold", fontSize: 13 },

  infillPhotos: { marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  infillPhotosHeader: { flexDirection: "row", alignItems: "center", gap: 7 },
  infillPhotosTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  infillPhotosCount: { fontFamily: "Inter_500Medium", fontSize: 12 },
  infillPhotosQueue: { fontFamily: "Inter_500Medium", fontSize: 11, marginLeft: "auto" },
  infillPhotosError: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 },
  infillPhotosHint: { fontFamily: "Inter_400Regular", fontSize: 12, paddingVertical: 10 },
  infillPhotosRetry: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  infillPhotoRow: { gap: 8, paddingVertical: 10 },
  infillPhotoThumb: { width: 72, height: 72 },
  infillPhotoPending: { position: "relative" },
  infillPhotoPendingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.3)",
  },
  infillPhotoActions: { flexDirection: "row", gap: 8, paddingTop: 8 },
  infillPhotoButton: { flex: 1, minHeight: 38, borderWidth: 1, justifyContent: "center" },
  infillPhotoButtonText: { fontFamily: "Inter_500Medium", fontSize: 12 },

  advanceBtn: { marginTop: 12, paddingVertical: 11, alignItems: "center" },
  advanceBtnText: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#fff" },

  depthBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  depthBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },

  // Modal
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  modalSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 24,
    paddingBottom: 40,
    gap: 4,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 18 },
  modalSite: { fontFamily: "Inter_400Regular", fontSize: 13, marginBottom: 16 },

  warnBox: {
    flexDirection: "row",
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    alignItems: "flex-start",
  },
  warnText: { fontFamily: "Inter_400Regular", fontSize: 12, flex: 1 },
  teamNote: { fontFamily: "Inter_400Regular", fontSize: 12, marginBottom: 8 },

  freshRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    gap: 12,
  },

  fieldGroup: { marginBottom: 14 },
  fieldLabel: { fontFamily: "Inter_500Medium", fontSize: 13, marginBottom: 6 },
  fieldHint: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  fieldInput: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "Inter_400Regular", fontSize: 14 },
  fieldMultiline: { minHeight: 72, textAlignVertical: "top" },

  modalSubmitBtn: { marginTop: 8, paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  modalSubmitText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" },
});

// ─── Schedule Tab Styles ──────────────────────────────────────────────────────

const sStyles = StyleSheet.create({
  dateBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  arrowBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  dateCenter: {
    flex: 1,
    alignItems: "center",
    gap: 1,
  },
  dayLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  dateLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  summary: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    paddingHorizontal: 2,
  },
  teamCard: {
    borderWidth: 1,
    overflow: "hidden",
  },
  teamHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingRight: 14,
    gap: 10,
  },
  teamStripe: {
    width: 4,
    alignSelf: "stretch",
    borderRadius: 2,
    marginLeft: 4,
  },
  teamName: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
  inProgBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  inProgBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  progressTrack: {
    height: 5,
    width: 100,
    borderRadius: 3,
    flexDirection: "row",
    overflow: "hidden",
  },
  progressSeg: {
    height: "100%" as any,
  },
  progressHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
  progressPctWrap: {
    alignItems: "flex-end",
    marginRight: 6,
  },
  progressPct: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
  progressPctSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
  },
  jobList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingLeft: 18,
    paddingRight: 14,
    paddingVertical: 6,
    position: "relative",
  },
  guideLine: {
    position: "absolute",
    left: 29,
    top: 20,
    bottom: 20,
    width: 1,
  },
  jobRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stopDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    zIndex: 1,
  },
  stopNum: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
  },
  jobName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  jobDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginTop: 1,
  },
  jobMeta: {
    alignItems: "flex-end",
    gap: 3,
    flexShrink: 0,
  },
  overduePill: {
    backgroundColor: "#fee2e2",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  overduePillTxt: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: "#ef4444",
  },
  inProgPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  inProgPillTxt: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
  },
  jobTime: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
});

// ─── New Assessment Styles ────────────────────────────────────────────────────

const naStyles = StyleSheet.create({
  // FAB
  fab: {
    position: "absolute",
    bottom: 110,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },

  // Modal header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 12 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 18 },

  // Section labels
  sectionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14, marginBottom: 8 },
  optional: { fontFamily: "Inter_400Regular", fontSize: 13 },

  // Asset picker
  selectedSite: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 1,
  },
  selectedSiteName: { fontFamily: "Inter_500Medium", fontSize: 14 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  searchInput: { fontFamily: "Inter_400Regular", fontSize: 14, paddingVertical: 0 },
  resultsList: {
    marginTop: 4,
    borderWidth: 1,
    overflow: "hidden",
  },
  resultRow: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultName: { fontFamily: "Inter_500Medium", fontSize: 14 },
  resultSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 1 },
  noResults: { fontFamily: "Inter_400Regular", fontSize: 13, padding: 14, textAlign: "center" },

  // Date + notes
  dateInput: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  notesInput: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    minHeight: 72,
    textAlignVertical: "top",
  },

  // Species section
  speciesHeader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 },
  speciesHint: { fontFamily: "Inter_400Regular", fontSize: 12 },
  speciesCard: { borderWidth: 1, padding: 12, marginBottom: 10 },
  speciesCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  speciesIdx: { fontFamily: "Inter_600SemiBold", fontSize: 12, textTransform: "uppercase" },
  rowLabel: { fontFamily: "Inter_500Medium", fontSize: 12, marginBottom: 5 },
  rowInput: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    marginBottom: 10,
    width: "100%",
    alignSelf: "stretch",
  },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  catChipText: { fontFamily: "Inter_500Medium", fontSize: 12 },
  catCustom: { fontFamily: "Inter_400Regular", fontSize: 11, marginBottom: 4 },

  // Species autocomplete suggestions
  suggestions: {
    borderWidth: 1,
    marginTop: 2,
    overflow: "hidden",
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  suggestionName: { fontFamily: "Inter_500Medium", fontSize: 13 },
  suggestionType: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 1 },
  addRowBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  addRowText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },

  // Footer
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
    paddingBottom: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cancelBtn: {
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
  },
  submitBtnText: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#fff" },
});
