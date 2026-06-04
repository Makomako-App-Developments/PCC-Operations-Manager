import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { getApiUrl } from "@/lib/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const STATUS_LABEL: Record<string, string> = {
  draft:       "Draft",
  scheduled:   "Scheduled",
  in_progress: "In Progress",
  completed:   "Completed",
  cancelled:   "Cancelled",
};

const STATUS_NEXT: Record<string, string | null> = {
  draft:       "in_progress",
  scheduled:   "in_progress",
  in_progress: "completed",
  completed:   null,
  cancelled:   null,
};

const STATUS_NEXT_LABEL: Record<string, string> = {
  draft:       "Start",
  scheduled:   "Start",
  in_progress: "Complete",
};

function statusColor(status: string, colors: any) {
  switch (status) {
    case "completed": return colors.success;
    case "in_progress": return colors.primary;
    case "scheduled": return colors.warning;
    case "cancelled": return colors.mutedForeground;
    default: return colors.mutedForeground;
  }
}

// ─── Depth Recording Modal ────────────────────────────────────────────────────

interface DepthModalProps {
  visible: boolean;
  assetId: string;
  assetName: string;
  onClose: () => void;
  onSubmit: (data: {
    assetId: string;
    depthMm: number;
    mulchType?: string;
    recordedAt: string;
    isFreshApplication: boolean;
    notes?: string;
  }) => Promise<void>;
}

function DepthModal({ visible, assetId, assetName, onClose, onSubmit }: DepthModalProps) {
  const colors = useColors();
  const [depthStr, setDepthStr] = useState("");
  const [mulchType, setMulchType] = useState("");
  const [isFresh, setIsFresh] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setDepthStr("");
    setMulchType("");
    setIsFresh(false);
    setNotes("");
    setSubmitting(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    const depthMm = parseInt(depthStr, 10);
    if (!isFresh && (isNaN(depthMm) || depthMm < 0)) {
      Alert.alert("Invalid depth", "Enter a depth in millimetres.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        assetId,
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={handleClose} />
      <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Record Mulch Depth</Text>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
        <Text style={[styles.modalSite, { color: colors.mutedForeground }]}>{assetName}</Text>

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
              style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background, borderRadius: colors.radius / 2 }]}
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
            style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background, borderRadius: colors.radius / 2 }]}
            value={mulchType}
            onChangeText={setMulchType}
            placeholder="e.g. bark, wood chip"
            placeholderTextColor={colors.mutedForeground}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Notes <Text style={{ fontFamily: "Inter_400Regular" }}>(optional)</Text></Text>
          <TextInput
            style={[styles.fieldInput, styles.fieldMultiline, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background, borderRadius: colors.radius / 2 }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Any observations…"
            placeholderTextColor={colors.mutedForeground}
            multiline
            textAlignVertical="top"
          />
        </View>

        <TouchableOpacity
          style={[styles.modalSubmitBtn, { backgroundColor: submitting ? colors.muted : colors.primary }]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.modalSubmitText}>Save Reading</Text>
          )}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

type ActiveTab = "infill" | "mulch";

export default function ProgrammesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<ActiveTab>("infill");
  const [depthModal, setDepthModal] = useState<{ assetId: string; assetName: string } | null>(null);
  const [expandedInfill, setExpandedInfill] = useState<Set<string>>(new Set());

  const bottomPad = insets.bottom + (Platform.OS === "web" ? 84 : 100);

  // ── Infill Jobs ──
  const {
    data: infillData,
    isLoading: loadingInfill,
    refetch: refetchInfill,
    isRefetching: refetchingInfill,
  } = useQuery({
    queryKey: ["infill-jobs-mobile"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/infill-jobs?status=draft&status=scheduled&status=in_progress"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch infill jobs");
      return res.json() as Promise<{ data: any[] }>;
    },
    enabled: !!token && activeTab === "infill",
  });

  // Separate call to fetch in-progress too (query string doesn't support multiple status values in this API)
  const { data: infillAll } = useQuery({
    queryKey: ["infill-jobs-all-mobile"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/infill-jobs"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch all infill jobs");
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

  // ── Infill status mutation ──
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
      qc.invalidateQueries({ queryKey: ["infill-jobs-mobile"] });
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

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.navy, paddingTop: insets.top + 16 }]}>
        <Text style={styles.headerTitle}>Programmes</Text>
      </View>

      {/* Tabs */}
      <View style={[styles.tabRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(["infill", "mulch"] as ActiveTab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, activeTab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(t)}
          >
            <Text style={[styles.tabBtnText, { color: activeTab === t ? colors.primary : colors.mutedForeground }]}>
              {t === "infill" ? "Infill Planting" : "Mulching"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Infill tab */}
      {activeTab === "infill" && (
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
              <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>Scheduled and in-progress planting jobs appear here.</Text>
            </View>
          ) : (
            infillJobs.map((job: any) => {
              const expanded = expandedInfill.has(job.id);
              const nextStatus = STATUS_NEXT[job.status as string];
              const nextLabel = STATUS_NEXT_LABEL[job.status as string];
              const color = statusColor(job.status, colors);
              return (
                <View key={job.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                  <TouchableOpacity onPress={() => toggleExpand(job.id)} activeOpacity={0.7}>
                    <View style={styles.cardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{job.assetName ?? "Unknown site"}</Text>
                        {job.plannedDate && (
                          <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                            Planned: {new Date(job.plannedDate + "T00:00:00").toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })}
                          </Text>
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
                          {job.species.map((sp: any) => (
                            <View key={sp.id} style={styles.speciesRow}>
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

                      {/* Advance status button */}
                      {nextStatus && nextLabel && (
                        <TouchableOpacity
                          style={[styles.advanceBtn, { backgroundColor: nextStatus === "completed" ? colors.success : colors.primary, borderRadius: colors.radius / 2 }]}
                          onPress={() => {
                            Alert.alert(
                              `Mark as ${STATUS_LABEL[nextStatus]}?`,
                              `Move "${job.assetName}" to ${STATUS_LABEL[nextStatus]}.`,
                              [
                                { text: "Cancel", style: "cancel" },
                                { text: nextLabel, onPress: () => advanceInfill.mutate({ id: job.id, status: nextStatus }) },
                              ],
                            );
                          }}
                          disabled={advanceInfill.isPending}
                        >
                          {advanceInfill.isPending ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text style={styles.advanceBtnText}>{nextLabel}</Text>
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
      )}

      {/* Mulching tab */}
      {activeTab === "mulch" && (
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
              <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>Records created from depth readings appear here.</Text>
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
                      <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{record.assetName ?? "Unknown site"}</Text>
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
                  <TouchableOpacity
                    style={[styles.depthBtn, { borderColor: colors.primary + "60", backgroundColor: colors.primary + "12", borderRadius: colors.radius / 2 }]}
                    onPress={() => setDepthModal({ assetId: record.assetId, assetName: record.assetName ?? "Site" })}
                  >
                    <Feather name="bar-chart-2" size={14} color={colors.primary} />
                    <Text style={[styles.depthBtnText, { color: colors.primary }]}>Record Depth</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Depth recording modal */}
      {depthModal && (
        <DepthModal
          visible={!!depthModal}
          assetId={depthModal.assetId}
          assetName={depthModal.assetName}
          onClose={() => setDepthModal(null)}
          onSubmit={async (data) => {
            await recordDepth.mutateAsync(data);
          }}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: "#ffffff" },

  tabRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
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

  expandedBody: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  speciesHeader: { fontFamily: "Inter_500Medium", fontSize: 11, textTransform: "uppercase", marginBottom: 6 },
  speciesRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  speciesDot: { width: 6, height: 6, borderRadius: 3 },
  speciesName: { fontFamily: "Inter_400Regular", fontSize: 13, flex: 1 },
  speciesQty: { fontFamily: "Inter_600SemiBold", fontSize: 13 },

  advanceBtn: {
    marginTop: 12,
    paddingVertical: 11,
    alignItems: "center",
  },
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
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
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
  fieldInput: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  fieldMultiline: { minHeight: 72, textAlignVertical: "top" },

  modalSubmitBtn: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  modalSubmitText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" },
});
