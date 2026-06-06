import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

const PRIMARY = "#00AECD";
const NAVY    = "#0f2a36";

type Badge = "high" | "medium" | "low" | "weed-free" | "none";
type Cell  = string | { text: string; badge: Badge };

interface SpecType {
  id:        string;
  typeNum:   string;
  label:     string;
  standard:  "High" | "Medium" | "Low";
  frequency: string;
  weedControl: string;
  weedCover:    Cell;
  weedMaxHeight: string;
  pestPlants:   string;
  litter:       string;
  plantHealth: string;
  mulching:   string;
  plantCoverage?: string;
  edging:           string;
  damage:           string;
  stakesAndTies?:   string;
  pestsAndDiseases?: string;
  pruning:          string;
  pruningLabel?:  string;
  note?:        string;
}

const SPECS: SpecType[] = [
  {
    id: "annuals", typeNum: "Type 1", label: "Annuals",
    standard: "High", frequency: "Weekly", weedControl: "No herbicides",
    weedCover: { text: "Weed free", badge: "weed-free" }, weedMaxHeight: "None allowed",
    pestPlants: "None allowed",
    litter: "No old litter", plantHealth: "Regular monitoring & treatment",
    plantCoverage: "100% as appropriate to each design",
    edging: "Built edge safe, clean & functional. Soft edging (turf) sloping edge (approx 15–25° from vertical) to grassed area, consistent with boundary & shape of garden, 75–100mm deep.",
    damage: "No damage to any assets including desirable plants from herbicide use. Surrounding lawns must be protected from undue compression or damage during all maintenance operations.",
    pestsAndDiseases: "Maintained to healthy standard. Report presence at each visit.",
    mulching: "", pruning: "Only 2% dead heads allowed", pruningLabel: "Dead Heading",
  },
  {
    id: "roses", typeNum: "Type 2", label: "Roses & Perennials",
    standard: "High", frequency: "Fortnightly", weedControl: "Mechanical",
    weedCover: { text: "Weed free", badge: "weed-free" }, weedMaxHeight: "None allowed",
    pestPlants: "None allowed",
    litter: "No old litter", plantHealth: "Regular monitoring & treatment",
    plantCoverage: "90%",
    edging: "Built edge safe, clean & functional. Soft edging (turf) sloping edge (approx 15–25° from vertical) to grassed area, consistent with boundary & shape of garden, 75–100mm deep.",
    damage: "No damage to any assets including desirable plants from herbicide use. Surrounding lawns must be protected from undue compression or damage during all maintenance operations.",
    stakesAndTies: "Stake & tie plants as necessary to ensure plants are always protected from damage, healthy development is encouraged and the required form of growth is achieved. Removed when not necessary.",
    pestsAndDiseases: "Maintained to healthy standard. Report presence at each visit.",
    mulching: "75–100mm depth maintained", pruning: "Build strong framework, maintain shape, maximise flowering, clearance from assets, pedestrians & carriageway. Maintain 2.5m vertical clearance.",
  },
  {
    id: "ornamental", typeNum: "Type 3", label: "Ornamental",
    standard: "High", frequency: "Fortnightly", weedControl: "Mechanical",
    weedCover: "2%", weedMaxHeight: "Max height 100mm",
    pestPlants: "None allowed",
    litter: "No old litter", plantHealth: "Regular monitoring",
    plantCoverage: "90%",
    edging: "Built edge safe, clean & functional. Soft edging (turf) sloping edge (approx 15–25° from vertical) to grassed area, consistent with boundary & shape of garden, 75–100mm deep.",
    damage: "No damage to any assets including desirable plants from herbicide use. Surrounding lawns must be protected from undue compression or damage during all maintenance operations.",
    stakesAndTies: "Stake & tie plants as necessary to ensure plants are always protected from damage, healthy development is encouraged and the required form of growth is achieved. Removed when not necessary.",
    pestsAndDiseases: "Maintained to healthy standard. Report presence at each visit.",
    mulching: "75–100mm depth maintained", pruning: "Build strong framework, maintain shape, maximise flowering, clearance from assets, pedestrians & carriageway. Maintain 2.5m vertical clearance.",
  },
  {
    id: "amenity", typeNum: "Type 4", label: "Amenity",
    standard: "Medium", frequency: "Monthly", weedControl: "Mechanical",
    weedCover: "5%", weedMaxHeight: "Max height 150mm",
    pestPlants: "None allowed",
    litter: "No old litter", plantHealth: "Monitoring as required",
    plantCoverage: "90%",
    edging: "Built edge safe, clean & functional. Soft edging (turf) sloping edge (approx 15–25° from vertical) to grassed area, consistent with boundary & shape of garden, 75–100mm deep.",
    damage: "No damage to any assets including desirable plants from herbicide use. Surrounding lawns must be protected from undue compression or damage during all maintenance operations.",
    stakesAndTies: "Stake & tie plants as necessary to ensure plants are always protected from damage, healthy development is encouraged and the required form of growth is achieved. Removed when not necessary.",
    pestsAndDiseases: "Maintained to healthy standard. Report presence at each visit.",
    mulching: "50–75mm depth maintained", pruning: "Build strong framework, maintain shape, maximise flowering, clearance from assets, pedestrians & carriageway. Maintain 2.5m vertical clearance.",
  },
  {
    id: "rain", typeNum: "Type 5", label: "Rain Garden",
    standard: "Medium", frequency: "Monthly", weedControl: "Mechanical",
    weedCover: "5%", weedMaxHeight: "Max height 150mm",
    pestPlants: "None allowed",
    litter: "No old litter", plantHealth: "Monitoring as required",
    plantCoverage: "90%",
    edging: "Built edge safe, clean & functional. Soft edging (turf) sloping edge (approx 15–25° from vertical) to grassed area, consistent with boundary & shape of garden, 75–100mm deep.",
    damage: "No damage to any assets including desirable plants from herbicide use. Surrounding lawns must be protected from undue compression or damage during all maintenance operations.",
    stakesAndTies: "Stake & tie plants as necessary to ensure plants are always protected from damage, healthy development is encouraged and the required form of growth is achieved. Removed when not necessary.",
    pestsAndDiseases: "Maintained to healthy standard. Report presence at each visit.",
    mulching: "50–75mm depth maintained", pruning: "Build strong framework, maintain shape, maximise flowering, clearance from assets, pedestrians & carriageway. Maintain 2.5m vertical clearance.",
  },
  {
    id: "reveg", typeNum: "Type 6", label: "Revegetation",
    standard: "Medium", frequency: "Quarterly", weedControl: "Chemical",
    weedCover: "5%", weedMaxHeight: "Max height 500mm",
    pestPlants: "None allowed",
    litter: "No old litter", plantHealth: "Monitoring as required",
    plantCoverage: "90%",
    edging: "Built edge safe, clean & functional. Soft edging (turf) sloping edge (approx 15–25° from vertical) to grassed area, consistent with boundary & shape of garden, 75–100mm deep.",
    damage: "No damage to any assets including desirable plants from herbicide use. Surrounding lawns must be protected from undue compression or damage during all maintenance operations.",
    stakesAndTies: "Stake & tie plants as necessary to ensure plants are always protected from damage, healthy development is encouraged and the required form of growth is achieved. Removed when not necessary.",
    pestsAndDiseases: "Maintained to healthy standard. Report presence at each visit.",
    mulching: "As required", pruning: "Build strong framework, maintain shape, maximise flowering, clearance from assets, pedestrians & carriageway. Maintain 2.5m vertical clearance.",
  },
  {
    id: "bush", typeNum: "Type 7", label: "Bush",
    standard: "Low", frequency: "Bimonthly", weedControl: "Chemical",
    weedCover: "15%", weedMaxHeight: "Max height 150mm",
    pestPlants: "None allowed",
    litter: "No old litter", plantHealth: "Monitoring as required",
    plantCoverage: "90%",
    edging: "Built edge safe, clean & functional. Soft edging (turf) sloping edge (approx 15–25° from vertical) to grassed area, consistent with boundary & shape of garden, 75–100mm deep.",
    damage: "No damage to any assets including desirable plants from herbicide use. Surrounding lawns must be protected from undue compression or damage during all maintenance operations.",
    stakesAndTies: "Stake & tie plants as necessary to ensure plants are always protected from damage, healthy development is encouraged and the required form of growth is achieved. Removed when not necessary.",
    mulching: "Not required", pruning: "",
  },
  {
    id: "tree", typeNum: "Type 8", label: "Tree Planter Pits",
    standard: "Medium", frequency: "Monthly", weedControl: "Mechanical",
    weedCover: "5%", weedMaxHeight: "Max height 100mm",
    pestPlants: "None allowed",
    litter: "No old litter", plantHealth: "Regular monitoring & treatment",
    plantCoverage: "90%",
    edging: "Built edge safe, clean & functional. Soft edging (turf) sloping edge (approx 15–25° from vertical) to grassed area, consistent with boundary & shape of garden, 75–100mm deep.",
    damage: "No damage to any assets including desirable plants from herbicide use. Surrounding lawns must be protected from undue compression or damage during all maintenance operations.",
    stakesAndTies: "Stake & tie plants as necessary to ensure plants are always protected from damage, healthy development is encouraged and the required form of growth is achieved. Removed when not necessary.",
    pestsAndDiseases: "Maintained to healthy standard. Report presence at each visit.",
    mulching: "75–100mm depth maintained", pruning: "Build strong framework, maintain shape, maximise flowering, clearance from assets, pedestrians & carriageway. Maintain 2.5m vertical clearance.",
  },
  {
    id: "hedges", typeNum: "Type 9", label: "Hedges",
    standard: "Medium", frequency: "Seasonal", weedControl: "Chemical",
    weedCover: "5%", weedMaxHeight: "Max height 150mm",
    pestPlants: "None allowed",
    litter: "No old litter", plantHealth: "Monitoring as required",
    plantCoverage: "100%",
    edging: "Built edge safe, clean & functional. Soft edging (turf) sloping edge (approx 15–25° from vertical) to grassed area, consistent with boundary & shape of garden, 75–100mm deep.",
    damage: "No damage to any assets including desirable plants from herbicide use. Surrounding lawns must be protected from undue compression or damage during all maintenance operations.",
    stakesAndTies: "Stake & tie plants as necessary to ensure plants are always protected from damage, healthy development is encouraged and the required form of growth is achieved. Removed when not necessary.",
    pestsAndDiseases: "Maintained to healthy standard. Report presence at each visit.",
    mulching: "As required", pruning: "Build strong framework, maintain shape, maximise flowering, clearance from assets, pedestrians & carriageway. Maintain 2.5m vertical clearance.",
  },
];

const STANDARD_COLOR: Record<string, string> = {
  High:   "#22c55e",
  Medium: "#f59e0b",
  Low:    "#94a3b8",
};

function WeedBadge({ value }: { value: Cell }) {
  if (typeof value === "string") return null;
  const colors: Record<Badge, { bg: string; text: string }> = {
    "weed-free": { bg: "#dcfce7", text: "#15803d" },
    "none":      { bg: "#fef2f2", text: "#dc2626" },
    "high":      { bg: "#dcfce7", text: "#15803d" },
    "medium":    { bg: "#fef9c3", text: "#a16207" },
    "low":       { bg: "#f1f5f9", text: "#64748b" },
  };
  const c = colors[value.badge] ?? colors["weed-free"];
  return (
    <View style={[styles.weedBadge, { backgroundColor: c.bg }]}>
      <Text style={[styles.weedBadgeText, { color: c.text }]}>{value.text}</Text>
    </View>
  );
}

function SpecCard({ spec, colors: c }: { spec: SpecType; colors: ReturnType<typeof useColors> }) {
  const [expanded, setExpanded] = useState(false);
  const stdColor = STANDARD_COLOR[spec.standard] ?? PRIMARY;
  const weedText = typeof spec.weedCover === "string" ? spec.weedCover : null;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => setExpanded(v => !v)}
      style={[styles.card, { backgroundColor: c.card, borderColor: c.border, borderRadius: c.radius }]}
    >
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleGroup}>
          <Text style={[styles.cardLabel, { color: c.foreground }]}>{spec.label}</Text>
        </View>
        <View style={styles.cardHeaderRight}>
          <View style={[styles.stdBadge, { borderColor: stdColor }]}>
            <View style={[styles.stdDot, { backgroundColor: stdColor }]} />
            <Text style={[styles.stdText, { color: stdColor }]}>{spec.standard}</Text>
          </View>
          <Feather name={expanded ? "chevron-up" : "chevron-down"} size={16} color={c.mutedForeground} />
        </View>
      </View>

      {/* Key info — always visible */}
      <View style={styles.keyRow}>
        <View style={styles.keyItem}>
          <Feather name="calendar" size={11} color={c.mutedForeground} />
          <Text style={[styles.keyText, { color: c.mutedForeground }]}>{spec.frequency}</Text>
        </View>
        <View style={styles.keyItem}>
          <Feather name={spec.weedControl === "Chemical" ? "droplet" : "scissors"} size={11} color={c.mutedForeground} />
          <Text style={[styles.keyText, { color: c.mutedForeground }]}>{spec.weedControl}</Text>
        </View>
      </View>

      {/* Expanded detail */}
      {expanded && (
        <View style={[styles.detail, { borderTopColor: c.border }]}>
          {[
            { icon: "percent",   label: "Weeds",            value: (weedText ? `Max ${weedText} weed coverage` : (typeof spec.weedCover !== "string" ? spec.weedCover.text : "")) + ` — ${spec.weedMaxHeight}` },
            { icon: "x-circle",  label: "Pest Plants",     value: spec.pestPlants },
            { icon: "trash-2",   label: "Litter",          value: spec.litter },
            { icon: "activity",  label: "Health & Vigour", value: spec.plantHealth },
            { icon: "sun",       label: "Plant Coverage",  value: spec.plantCoverage ?? "" },
            { icon: "scissors",  label: "Edging",          value: spec.edging },
            { icon: "alert-triangle", label: "Damage",        value: spec.damage },
            { icon: "anchor",         label: "Stakes & Ties",   value: spec.stakesAndTies ?? "" },
            { icon: "shield",         label: "Pests & Diseases", value: spec.pestsAndDiseases ?? "" },
            { icon: "layers",         label: "Mulching",         value: spec.mulching },
            { icon: "git-merge", label: spec.pruningLabel ?? "Pruning", value: spec.pruning },
          ].filter(({ value }) => !!value).map(({ icon, label, value }) => (
            <View key={label} style={styles.detailRow}>
              <Feather name={icon as any} size={13} color={PRIMARY} style={styles.detailIcon} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.detailLabel, { color: c.mutedForeground }]}>{label}</Text>
                <Text style={[styles.detailValue, { color: c.foreground }]}>{value}</Text>
              </View>
            </View>
          ))}
          {spec.note && (
            <Text style={[styles.note, { color: c.mutedForeground }]}>{spec.note}</Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function SpecScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad    = insets.top;
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 84 : 84);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, paddingTop: topPad + 12 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Specification</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Porirua City Council — 9 garden types
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomPad }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Tap a card to expand full details
        </Text>
        {SPECS.map(spec => (
          <SpecCard key={spec.id} spec={spec} colors={colors} />
        ))}
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
            Porirua City Council · Horticulture Specification · Issued March 2026
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1 },
  header:     { paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  title:      { fontFamily: "Inter_700Bold", fontSize: 26, marginBottom: 2 },
  subtitle:   { fontFamily: "Inter_400Regular", fontSize: 13 },
  scroll:     { flex: 1 },
  hint:       { fontFamily: "Inter_400Regular", fontSize: 12, marginBottom: 12 },

  card:       { borderWidth: 1, padding: 14, marginBottom: 10 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 },
  cardTitleGroup: { flex: 1 },
  typeNum:    { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 0.5, marginBottom: 1 },
  cardLabel:  { fontFamily: "Inter_700Bold", fontSize: 17 },
  cardHeaderRight: { flexDirection: "row", alignItems: "center", gap: 8 },

  stdBadge:   { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  stdDot:     { width: 6, height: 6, borderRadius: 3 },
  stdText:    { fontFamily: "Inter_600SemiBold", fontSize: 11 },

  keyRow:     { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 2 },
  keyItem:    { flexDirection: "row", alignItems: "center", gap: 4 },
  keyText:    { fontFamily: "Inter_400Regular", fontSize: 12 },

  weedBadge:      { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  weedBadgeText:  { fontFamily: "Inter_600SemiBold", fontSize: 11 },

  detail:     { borderTopWidth: 1, marginTop: 12, paddingTop: 12, gap: 10 },
  detailRow:  { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  detailIcon: { marginTop: 2 },
  detailLabel: { fontFamily: "Inter_400Regular", fontSize: 11, marginBottom: 1 },
  detailValue: { fontFamily: "Inter_500Medium", fontSize: 13 },
  note:       { fontFamily: "Inter_400Regular", fontSize: 11, fontStyle: "italic", marginTop: 4 },

  footer:     { borderTopWidth: 1, paddingTop: 16, marginTop: 8 },
  footerText: { fontFamily: "Inter_400Regular", fontSize: 11, textAlign: "center" },
});
