import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";

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

const GARDEN_TYPE_DESC: Record<string, string> = {
  annuals: "Seasonal flowering beds requiring regular deadheading, edging and replanting to maintain colour and coverage.",
  roses_perennials: "Mixed beds of roses and perennial plants needing structured pruning, pest management and mulching.",
  ornamental: "Feature planting areas maintained for shape, form and visual appeal with regular pruning and tidying.",
  amenity: "Mown grass and low-maintenance open areas maintained for public use and safety.",
  rain_garden: "Stormwater management planting — keep inlets/outlets clear and ensure plants are thriving.",
  reveg: "Ecological restoration planting — weed control and plant survival checks are the priority.",
  bush: "Native bush areas requiring invasive weed control, path clearance and canopy management.",
  tree_planter_pits: "Individual tree pit maintenance — mulch, ties, guards and watering checks.",
  hedge: "Formal hedge trimming for clean lines and path clearance.",
};

const SPEC_TASKS: Record<string, { label: string; standard: string }[]> = {
  annuals: [
    { label: "Litter removal", standard: "Remove all visible litter from bed and surrounds" },
    { label: "Weed control", standard: "Total weed cover ≤5% — hand-pull or spot-spray" },
    { label: "Dead heading", standard: "Remove spent flowers — visually pleasing result" },
    { label: "Plant coverage", standard: "Minimum 95% coverage — flag gaps for replanting" },
    { label: "Edging", standard: "Vertical cut, smooth & neat along all bed edges" },
    { label: "Soil condition", standard: "Check for compaction — aerate if required" },
  ],
  roses_perennials: [
    { label: "Litter removal", standard: "Remove all visible litter from bed and surrounds" },
    { label: "Weed control", standard: "Total weed cover ≤5% — hand-pull or spot-spray" },
    { label: "Dead heading", standard: "Remove spent flowers — visually pleasing result" },
    { label: "Mulch depth", standard: "50–125mm depth, keep clear of stems" },
    { label: "Pruning", standard: "Best practice pruning — maintain road clearance" },
    { label: "Pest & disease", standard: "Apply copper & winter oil — check and record" },
    { label: "Edging", standard: "Vertical cut, smooth & neat along all bed edges" },
    { label: "Plant coverage", standard: "Minimum 95% coverage — flag gaps for replanting" },
  ],
  ornamental: [
    { label: "Litter removal", standard: "Remove all visible litter from bed and surrounds" },
    { label: "Weed control", standard: "Total weed cover ≤5% — hand-pull or spot-spray" },
    { label: "Pruning", standard: "Shape maintenance — retain intended form" },
    { label: "Mulch depth", standard: "50–125mm depth maintained" },
    { label: "Edging", standard: "Vertical cut, smooth & neat along all bed edges" },
    { label: "Plant coverage", standard: "Minimum 90% coverage" },
  ],
  amenity: [
    { label: "Litter removal", standard: "Remove all visible litter from grass and surrounds" },
    { label: "Weed control", standard: "Spot-spray where required — no bare patches" },
    { label: "Mowing", standard: "Mow to correct height per season — no scalping" },
    { label: "Edging", standard: "Clean edge along all paths and driveways" },
    { label: "Obstacle trimming", standard: "Trim neatly around all fixtures and obstacles" },
  ],
  rain_garden: [
    { label: "Litter removal", standard: "Remove all visible litter from bed and surrounds" },
    { label: "Weed control", standard: "Total weed cover ≤5% — hand-pull or spot-spray" },
    { label: "Inlet/outlet check", standard: "Both inlet and outlet must be clear and unobstructed" },
    { label: "Mulch depth", standard: "50–125mm depth maintained" },
    { label: "Plant coverage", standard: "Minimum 90% coverage" },
  ],
  reveg: [
    { label: "Litter removal", standard: "Remove all visible litter from area" },
    { label: "Weed control", standard: "Total weed cover ≤5% — priority task for this type" },
    { label: "Plant survival check", standard: "Record any dead or failing plants" },
    { label: "Mulch depth", standard: "50–125mm depth maintained" },
    { label: "Replanting", standard: "Replace failed plants if stock available" },
  ],
  bush: [
    { label: "Litter removal", standard: "Remove all visible litter from area" },
    { label: "Weed control", standard: "Total weed cover ≤5% — focus on invasive species" },
    { label: "Invasive species check", standard: "Identify and record any new invasive growth" },
    { label: "Branch pruning", standard: "Prune overhanging branches for path clearance" },
    { label: "Path clearance", standard: "All public paths clear and safe" },
  ],
  tree_planter_pits: [
    { label: "Litter removal", standard: "Remove all visible litter from pit and surrounds" },
    { label: "Weed control", standard: "Pits must be weed-free" },
    { label: "Mulch depth", standard: "50–125mm depth — keep clear of trunk" },
    { label: "Ties & guards check", standard: "Check and adjust ties — no girdling, no damage" },
    { label: "Watering", standard: "Water if soil dry — especially new plantings" },
  ],
  hedge: [
    { label: "Litter removal", standard: "Remove all visible litter from base and surrounds" },
    { label: "Hedge trimming", standard: "Even, flat-top profile — sharp, clean lines" },
    { label: "Clipping clearance", standard: "All clippings cleared from paths and surfaces" },
    { label: "Pest & disease check", standard: "Inspect and report any signs of disease or pest damage" },
    { label: "Base edging", standard: "Clean edge at base of hedge" },
  ],
};

const DEFAULT_SPEC_TASKS = [
  { label: "Litter removal", standard: "Remove all visible litter from area" },
  { label: "Weed control", standard: "Total weed cover ≤5%" },
  { label: "Edging", standard: "Vertical cut, smooth & neat" },
  { label: "Plant coverage", standard: "Minimum 95% coverage" },
];

interface Props {
  visible: boolean;
  gardenType: string;
  onClose: () => void;
}

export function SpecModal({ visible, gardenType, onClose }: Props) {
  const colors = useColors();
  const label = GARDEN_TYPE_LABEL[gardenType] ?? gardenType;
  const desc = GARDEN_TYPE_DESC[gardenType] ?? "";
  const tasks = SPEC_TASKS[gardenType] ?? DEFAULT_SPEC_TASKS;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
          <View style={styles.headerLeft}>
            <Feather name="book-open" size={18} color={colors.primary} />
            <View style={{ marginLeft: 10 }}>
              <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>Specification</Text>
              <Text style={[styles.headerTitle, { color: colors.foreground }]}>{label}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.75}>
            <Feather name="x" size={20} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {desc ? (
            <View style={[styles.descBox, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}30` }]}>
              <Text style={[styles.descText, { color: colors.foreground }]}>{desc}</Text>
            </View>
          ) : null}

          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Required Tasks & Standards</Text>

          <View style={[styles.taskList, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius }]}>
            {tasks.map((task, i) => (
              <View
                key={i}
                style={[
                  styles.taskRow,
                  i < tasks.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                ]}
              >
                <View style={[styles.taskDot, { backgroundColor: colors.primary }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.taskLabel, { color: colors.foreground }]}>{task.label}</Text>
                  <Text style={[styles.taskStandard, { color: colors.mutedForeground }]}>{task.standard}</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 1 },
  headerTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  closeBtn: { padding: 4 },
  content: { padding: 16, paddingBottom: 40 },
  descBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
  },
  descText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  taskList: {
    borderWidth: 1,
    overflow: "hidden",
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
  },
  taskDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
    flexShrink: 0,
  },
  taskLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  taskStandard: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
});
