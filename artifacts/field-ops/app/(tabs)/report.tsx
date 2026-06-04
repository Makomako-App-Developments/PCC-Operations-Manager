import { Feather } from "@expo/vector-icons";
import { useCreateReactiveJob, useListAssets } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import React, { useState, useMemo } from "react";
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

// ─── Pest Plants ─────────────────────────────────────────────────────────────

const PEST_PLANTS_LIST: string[] = [
  "African feathergrass", "Agapanthus", "Alligator weed", "Apple of Sodom",
  "Arrowhead", "Banana passionfruit", "Barberry", "Boneseed", "Boxthorn",
  "Bridal creeper", "Broom (Scotch)", "Broom (Montpellier)", "Broom (Spanish)",
  "Buddleja", "Buffalo grass", "Cape ivy", "Cape tulip", "Chilean flame creeper",
  "Chinese privet", "Climbing dock", "Climbing spindle berry", "Coarse-leaved mallow",
  "Cootamundra wattle", "Cotoneaster", "Cut-leaved nightshade", "Datura",
  "Devil's fig", "Elephant grass", "Elodea", "English ivy", "Fatsia",
  "Field bindweed", "Fireweed", "Fountain grass", "German ivy", "Giant buttercup",
  "Giant reed", "Gorse", "Green cestrum", "Hakea", "Himalayan honeysuckle",
  "Hoary cress", "Holly", "Horsetail", "Japanese honeysuckle", "Jerusalem cherry",
  "Karaka", "Kudzu", "Lantana", "Lagarosiphon", "Mexican daisy",
  "Mimosa", "Montbretia", "Mother of millions", "Moth plant", "Muehlenbeckia",
  "Nassella tussock", "Old man's beard", "Onion weed", "Pampas grass",
  "Pare", "Parrot's feather", "Passionfruit (banana)", "Periwinkle", "Piri piri bur",
  "Pittosporum undulatum", "Plume poppy", "Prickly pear", "Privet (large-leaved)",
  "Purple loosestrife", "Ragwort", "Reed sweet grass", "Rhododendron", "Rowan",
  "Rubus fruticosus (blackberry)", "Russian vine", "Selaginella", "Silver poplar",
  "Spartina", "Spiny emex", "St John's wort", "Tobacco weed", "Tree of heaven",
  "Tropical soda apple", "Tutsan", "Umbrella sedge", "Viper's bugloss",
  "Water hyacinth", "Water lettuce", "Watsonia", "White bryony", "Wild ginger",
  "Willow (crack)", "Willow (weeping)", "Yellow flag iris", "Yellow flag",
];

// ─── Config ───────────────────────────────────────────────────────────────────

const ISSUE_TYPES = [
  { value: "pest_plant_sighting", label: "Pest Plant Sighting" },
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

// ─── Pest Plant Modal ─────────────────────────────────────────────────────────

interface PestPlantsModalProps {
  visible: boolean;
  selected: string[];
  onChange: (next: string[]) => void;
  onClose: () => void;
}

function PestPlantsModal({ visible, selected, onChange, onClose }: PestPlantsModalProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? PEST_PLANTS_LIST.filter(p => p.toLowerCase().includes(q)) : PEST_PLANTS_LIST;
  }, [search]);

  const toggle = (species: string) => {
    if (selected.includes(species)) {
      onChange(selected.filter(s => s !== species));
    } else {
      onChange([...selected, species]);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[pestStyles.root, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
        <View style={[pestStyles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[pestStyles.title, { color: colors.foreground }]}>Pest Plant Species</Text>
            <Text style={[pestStyles.sub, { color: colors.mutedForeground }]}>
              {selected.length > 0 ? `${selected.length} selected` : "Select all species found"}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={[pestStyles.doneBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
            activeOpacity={0.85}
          >
            <Text style={pestStyles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>

        <View style={[pestStyles.searchRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[pestStyles.searchInput, { color: colors.foreground }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search species…"
            placeholderTextColor={colors.mutedForeground}
            clearButtonMode="while-editing"
            autoCorrect={false}
          />
          {search.length > 0 && Platform.OS !== "ios" && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Feather name="x" size={15} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {filtered.length === 0 ? (
            <Text style={[pestStyles.empty, { color: colors.mutedForeground }]}>No species match "{search}"</Text>
          ) : (
            filtered.map(species => {
              const checked = selected.includes(species);
              return (
                <TouchableOpacity
                  key={species}
                  style={[pestStyles.item, { borderBottomColor: colors.border, backgroundColor: checked ? colors.secondary : "transparent" }]}
                  onPress={() => toggle(species)}
                  activeOpacity={0.75}
                >
                  <View style={[pestStyles.checkbox, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : "transparent", borderRadius: 4 }]}>
                    {checked && <Feather name="check" size={12} color="#fff" />}
                  </View>
                  <Text style={[pestStyles.itemText, { color: colors.foreground }]}>{species}</Text>
                </TouchableOpacity>
              );
            })
          )}
          <View style={{ height: insets.bottom + 24 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const pestStyles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 20, marginBottom: 2 },
  sub: { fontFamily: "Inter_400Regular", fontSize: 13 },
  doneBtn: { paddingHorizontal: 18, paddingVertical: 9 },
  doneBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    paddingVertical: 2,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 16,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  itemText: { fontFamily: "Inter_400Regular", fontSize: 15, flex: 1 },
  empty: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center", marginTop: 32 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ReportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [issueType, setIssueType] = useState<string>("");
  const [priority, setPriority] = useState<string>("medium");
  const [description, setDescription] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState<string>("");
  const [selectedAssetName, setSelectedAssetName] = useState<string>("");
  const [pestPlantsSelected, setPestPlantsSelected] = useState<string[]>([]);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showPestModal, setShowPestModal] = useState(false);
  const [success, setSuccess] = useState(false);

  const { data: assetsData } = useListAssets({ limit: 100, isActive: true });
  const assets = assetsData?.data ?? [];

  const mutation = useCreateReactiveJob();

  const isPestSighting = issueType === "pest_plant_sighting";

  const handleSubmit = async () => {
    if (!selectedAssetId || !issueType) return;
    if (isPestSighting && pestPlantsSelected.length === 0) return;
    if (!isPestSighting && !description.trim()) return;

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const finalDescription = description.trim() || pestPlantsSelected.join(", ");

    mutation.mutate(
      {
        data: {
          assetId: selectedAssetId,
          issueType,
          description: finalDescription,
          priority: priority as "low" | "medium" | "high" | "urgent",
          ...(isPestSighting && pestPlantsSelected.length > 0
            ? { pestPlantsPresent: JSON.stringify(pestPlantsSelected) }
            : {}),
        } as any,
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
          setPestPlantsSelected([]);
          setTimeout(() => setSuccess(false), 4000);
        },
        onError: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        },
      },
    );
  };

  const isValid = !!selectedAssetId && !!issueType && (
    isPestSighting ? pestPlantsSelected.length > 0 : description.trim().length > 0
  );

  const topPad = insets.top;
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 84 : 84);

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
          <View style={[styles.successBanner, { backgroundColor: "#dcfce7", borderRadius: colors.radius }]}>
            <Feather name="check-circle" size={18} color="#16a34a" />
            <Text style={styles.successText}>Issue raised successfully!</Text>
          </View>
        ) : null}

        {mutation.isError ? (
          <View style={[styles.errorBanner, { backgroundColor: "#fee2e2", borderRadius: colors.radius }]}>
            <Text style={styles.errorText}>Failed to raise issue. Please try again.</Text>
          </View>
        ) : null}

        <View
          style={[
            styles.formCard,
            { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
          ]}
        >
          {/* Asset */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Asset <Text style={{ color: colors.destructive }}>*</Text>
            </Text>
            <TouchableOpacity
              style={[styles.selector, { backgroundColor: colors.background, borderColor: selectedAssetId ? colors.primary : colors.border, borderRadius: colors.radius }]}
              onPress={() => setShowAssetModal(true)}
              activeOpacity={0.8}
            >
              <Text style={[styles.selectorText, { color: selectedAssetName ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                {selectedAssetName || "Select an asset…"}
              </Text>
              <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* Issue Type */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Issue Type <Text style={{ color: colors.destructive }}>*</Text>
            </Text>
            <TouchableOpacity
              style={[styles.selector, { backgroundColor: colors.background, borderColor: issueType ? colors.primary : colors.border, borderRadius: colors.radius }]}
              onPress={() => setShowIssueModal(true)}
              activeOpacity={0.8}
            >
              <Text style={[styles.selectorText, { color: selectedIssue ? colors.foreground : colors.mutedForeground }]}>
                {selectedIssue?.label ?? "Select issue type…"}
              </Text>
              <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* Pest Plants — only shown when type is pest_plant_sighting */}
          {isPestSighting && (
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>
                Species Found <Text style={{ color: colors.destructive }}>*</Text>
              </Text>
              <TouchableOpacity
                style={[styles.selector, { backgroundColor: colors.background, borderColor: pestPlantsSelected.length > 0 ? colors.primary : colors.border, borderRadius: colors.radius }]}
                onPress={() => setShowPestModal(true)}
                activeOpacity={0.8}
              >
                <Text style={[styles.selectorText, { color: pestPlantsSelected.length > 0 ? colors.foreground : colors.mutedForeground }]}>
                  {pestPlantsSelected.length > 0 ? `${pestPlantsSelected.length} species selected` : "Select pest plants found…"}
                </Text>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
              {pestPlantsSelected.length > 0 && (
                <View style={styles.pillRow}>
                  {pestPlantsSelected.map(species => (
                    <TouchableOpacity
                      key={species}
                      style={[styles.pill, { backgroundColor: "#fef3c7", borderColor: "#f59e0b", borderRadius: colors.radius }]}
                      onPress={() => setPestPlantsSelected(prev => prev.filter(s => s !== species))}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.pillText}>{species}</Text>
                      <Feather name="x" size={11} color="#92400e" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Priority */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Priority</Text>
            <View style={styles.priorityRow}>
              {PRIORITIES.map((p) => (
                <TouchableOpacity
                  key={p.value}
                  style={[styles.priorityBtn, { backgroundColor: priority === p.value ? p.color : colors.background, borderColor: priority === p.value ? p.color : colors.border, borderRadius: colors.radius }]}
                  onPress={() => setPriority(p.value)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.priorityText, { color: priority === p.value ? "#fff" : colors.foreground }]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Description */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              {isPestSighting ? "Notes" : <>Description <Text style={{ color: colors.destructive }}>*</Text></>}
            </Text>
            <TextInput
              style={[styles.textarea, { backgroundColor: colors.background, borderColor: description ? colors.primary : colors.border, color: colors.foreground, borderRadius: colors.radius }]}
              value={description}
              onChangeText={setDescription}
              placeholder={isPestSighting ? "Add any additional notes (optional)…" : "Describe the issue clearly…"}
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
            { backgroundColor: isValid ? (selectedPriority?.color ?? colors.primary) : colors.muted, borderRadius: colors.radius, opacity: mutation.isPending ? 0.7 : 1 },
          ]}
          onPress={handleSubmit}
          disabled={!isValid || mutation.isPending}
          activeOpacity={0.8}
        >
          {mutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Feather name={isPestSighting ? "alert-triangle" : "alert-circle"} size={18} color="#fff" />
              <Text style={styles.submitText}>{isPestSighting ? "Record Sighting" : "Raise Issue"}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Issue Type Modal */}
      <Modal visible={showIssueModal} transparent animationType="slide">
        <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowIssueModal(false)} activeOpacity={1} />
        <View style={[styles.modalSheet, { backgroundColor: colors.card, borderTopLeftRadius: colors.radius * 3, borderTopRightRadius: colors.radius * 3, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Issue Type</Text>
          {ISSUE_TYPES.map((t) => (
            <TouchableOpacity
              key={t.value}
              style={[styles.modalItem, { borderBottomColor: colors.border }, issueType === t.value && { backgroundColor: colors.secondary }]}
              onPress={() => {
                setIssueType(t.value);
                if (t.value !== "pest_plant_sighting") setPestPlantsSelected([]);
                setShowIssueModal(false);
              }}
              activeOpacity={0.75}
            >
              {t.value === "pest_plant_sighting" && (
                <Feather name="alert-triangle" size={16} color="#f59e0b" style={{ marginRight: 8 }} />
              )}
              <Text style={[styles.modalItemText, { color: colors.foreground }]}>{t.label}</Text>
              {issueType === t.value && <Feather name="check" size={18} color={colors.primary} />}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>

      {/* Asset Modal */}
      <Modal visible={showAssetModal} transparent animationType="slide">
        <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowAssetModal(false)} activeOpacity={1} />
        <View style={[styles.modalSheet, styles.modalSheetTall, { backgroundColor: colors.card, borderTopLeftRadius: colors.radius * 3, borderTopRightRadius: colors.radius * 3, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Select Asset</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {assets.map((a) => (
              <TouchableOpacity
                key={a.id}
                style={[styles.modalItem, { borderBottomColor: colors.border }, selectedAssetId === a.id && { backgroundColor: colors.secondary }]}
                onPress={() => {
                  setSelectedAssetId(a.id);
                  setSelectedAssetName(a.name);
                  setShowAssetModal(false);
                }}
                activeOpacity={0.75}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modalItemText, { color: colors.foreground }]}>{a.name}</Text>
                  <Text style={[styles.modalItemSub, { color: colors.mutedForeground }]}>{a.suburb ?? ""}</Text>
                </View>
                {selectedAssetId === a.id && <Feather name="check" size={18} color={colors.primary} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* Pest Plants Full-Screen Modal */}
      <PestPlantsModal
        visible={showPestModal}
        selected={pestPlantsSelected}
        onChange={setPestPlantsSelected}
        onClose={() => setShowPestModal(false)}
      />
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
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  pillText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "#92400e",
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
