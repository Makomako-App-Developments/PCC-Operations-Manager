import { Feather } from "@expo/vector-icons";
import { useCreateReactiveJob, useListAssets } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
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

import { useColors } from "@/hooks/useColors";

const ISSUE_TYPES = [
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

export default function ReportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [issueType, setIssueType] = useState<string>("");
  const [priority, setPriority] = useState<string>("medium");
  const [description, setDescription] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState<string>("");
  const [selectedAssetName, setSelectedAssetName] = useState<string>("");
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [success, setSuccess] = useState(false);

  const { data: assetsData } = useListAssets({ limit: 100, isActive: true });
  const assets = assetsData?.data ?? [];

  const mutation = useCreateReactiveJob();

  const handleSubmit = async () => {
    if (!selectedAssetId || !issueType || !description.trim()) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    mutation.mutate(
      {
        data: {
          assetId: selectedAssetId,
          issueType,
          description: description.trim(),
          priority: priority as "low" | "medium" | "high" | "urgent",
        },
      },
      {
        onSuccess: async () => {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setSuccess(true);
          setIssueType("");
          setPriority("medium");
          setDescription("");
          setSelectedAssetId("");
          setSelectedAssetName("");
          setTimeout(() => setSuccess(false), 4000);
        },
        onError: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        },
      },
    );
  };

  const isValid = !!selectedAssetId && !!issueType && description.trim().length > 0;

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 84);

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
        {success ? (
          <View
            style={[
              styles.successBanner,
              { backgroundColor: "#dcfce7", borderRadius: colors.radius },
            ]}
          >
            <Feather name="check-circle" size={18} color="#16a34a" />
            <Text style={styles.successText}>Issue raised successfully!</Text>
          </View>
        ) : null}

        {mutation.isError ? (
          <View
            style={[
              styles.errorBanner,
              { backgroundColor: "#fee2e2", borderRadius: colors.radius },
            ]}
          >
            <Text style={styles.errorText}>Failed to raise issue. Please try again.</Text>
          </View>
        ) : null}

        <View
          style={[
            styles.formCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: colors.radius,
            },
          ]}
        >
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Asset <Text style={{ color: colors.destructive }}>*</Text>
            </Text>
            <TouchableOpacity
              style={[
                styles.selector,
                {
                  backgroundColor: colors.background,
                  borderColor: selectedAssetId ? colors.primary : colors.border,
                  borderRadius: colors.radius,
                },
              ]}
              onPress={() => setShowAssetModal(true)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.selectorText,
                  { color: selectedAssetName ? colors.foreground : colors.mutedForeground },
                ]}
                numberOfLines={1}
              >
                {selectedAssetName || "Select an asset…"}
              </Text>
              <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Issue Type <Text style={{ color: colors.destructive }}>*</Text>
            </Text>
            <TouchableOpacity
              style={[
                styles.selector,
                {
                  backgroundColor: colors.background,
                  borderColor: issueType ? colors.primary : colors.border,
                  borderRadius: colors.radius,
                },
              ]}
              onPress={() => setShowIssueModal(true)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.selectorText,
                  { color: selectedIssue ? colors.foreground : colors.mutedForeground },
                ]}
              >
                {selectedIssue?.label ?? "Select issue type…"}
              </Text>
              <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Priority</Text>
            <View style={styles.priorityRow}>
              {PRIORITIES.map((p) => (
                <TouchableOpacity
                  key={p.value}
                  style={[
                    styles.priorityBtn,
                    {
                      backgroundColor:
                        priority === p.value ? p.color : colors.background,
                      borderColor: priority === p.value ? p.color : colors.border,
                      borderRadius: colors.radius,
                    },
                  ]}
                  onPress={() => setPriority(p.value)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.priorityText,
                      { color: priority === p.value ? "#fff" : colors.foreground },
                    ]}
                  >
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Description <Text style={{ color: colors.destructive }}>*</Text>
            </Text>
            <TextInput
              style={[
                styles.textarea,
                {
                  backgroundColor: colors.background,
                  borderColor: description ? colors.primary : colors.border,
                  color: colors.foreground,
                  borderRadius: colors.radius,
                },
              ]}
              value={description}
              onChangeText={setDescription}
              placeholder="Describe the issue clearly…"
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.submitBtn,
            {
              backgroundColor: isValid ? selectedPriority?.color ?? colors.primary : colors.muted,
              borderRadius: colors.radius,
              opacity: mutation.isPending ? 0.7 : 1,
            },
          ]}
          onPress={handleSubmit}
          disabled={!isValid || mutation.isPending}
          activeOpacity={0.8}
        >
          {mutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Feather name="alert-circle" size={18} color="#fff" />
              <Text style={styles.submitText}>Raise Issue</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={showIssueModal} transparent animationType="slide">
        <TouchableOpacity
          style={styles.modalBackdrop}
          onPress={() => setShowIssueModal(false)}
          activeOpacity={1}
        />
        <View
          style={[
            styles.modalSheet,
            {
              backgroundColor: colors.card,
              borderTopLeftRadius: colors.radius * 3,
              borderTopRightRadius: colors.radius * 3,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Issue Type</Text>
          {ISSUE_TYPES.map((t) => (
            <TouchableOpacity
              key={t.value}
              style={[
                styles.modalItem,
                { borderBottomColor: colors.border },
                issueType === t.value && { backgroundColor: colors.secondary },
              ]}
              onPress={() => {
                setIssueType(t.value);
                setShowIssueModal(false);
              }}
              activeOpacity={0.75}
            >
              <Text style={[styles.modalItemText, { color: colors.foreground }]}>
                {t.label}
              </Text>
              {issueType === t.value && (
                <Feather name="check" size={18} color={colors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>

      <Modal visible={showAssetModal} transparent animationType="slide">
        <TouchableOpacity
          style={styles.modalBackdrop}
          onPress={() => setShowAssetModal(false)}
          activeOpacity={1}
        />
        <View
          style={[
            styles.modalSheet,
            styles.modalSheetTall,
            {
              backgroundColor: colors.card,
              borderTopLeftRadius: colors.radius * 3,
              borderTopRightRadius: colors.radius * 3,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Select Asset</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {assets.map((a) => (
              <TouchableOpacity
                key={a.id}
                style={[
                  styles.modalItem,
                  { borderBottomColor: colors.border },
                  selectedAssetId === a.id && { backgroundColor: colors.secondary },
                ]}
                onPress={() => {
                  setSelectedAssetId(a.id);
                  setSelectedAssetName(a.name);
                  setShowAssetModal(false);
                }}
                activeOpacity={0.75}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modalItemText, { color: colors.foreground }]}>
                    {a.name}
                  </Text>
                  <Text style={[styles.modalItemSub, { color: colors.mutedForeground }]}>
                    {a.suburb ?? ""}
                  </Text>
                </View>
                {selectedAssetId === a.id && (
                  <Feather name="check" size={18} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
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
