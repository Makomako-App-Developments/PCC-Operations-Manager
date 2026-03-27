import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LayoutDashboard, ClipboardList, List, CalendarDays, ClipboardCheck,
  Sprout, Layers, FileSpreadsheet, Pencil, Save, X, Info, BarChart2, Lock
} from "lucide-react";

const BRAND = "#00AECD";
const NAVY  = "#0f2a36";

function Sidebar({ active }: { active: string }) {
  const nav = [
    { icon: LayoutDashboard, label: "Dashboard" },
    { icon: List,            label: "Asset Register" },
    { icon: CalendarDays,    label: "Schedule" },
    { icon: ClipboardCheck,  label: "Audits",          id: "audits" },
    { icon: Sprout,          label: "Infill Planting",  id: "planting" },
    { icon: Layers,          label: "Mulching",         id: "mulching" },
    { icon: FileSpreadsheet, label: "Specification",   id: "spec" },
    { icon: BarChart2,       label: "Reports",          id: "reports" },
  ];
  return (
    <aside className="w-56 flex-shrink-0 flex flex-col min-h-screen" style={{ background: NAVY }}>
      <div className="px-5 py-5 border-b border-white/10">
        <div className="rounded-lg px-3 py-2 text-center" style={{ background: BRAND }}>
          <span className="text-white font-bold text-lg tracking-tight">poriruacity</span>
        </div>
        <p className="text-white/50 text-[10px] text-center mt-1 uppercase tracking-widest">Gardens Manager</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ icon: Icon, label, id }) => {
          const isActive = active === (id || label.toLowerCase());
          return (
            <div
              key={label}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                isActive ? "text-white" : "text-white/60 hover:text-white hover:bg-white/10"
              }`}
              style={isActive ? { background: BRAND } : {}}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm font-medium">{label}</span>
            </div>
          );
        })}
      </nav>
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: BRAND }}>DB</div>
          <div>
            <p className="text-white text-xs font-medium">Daniela Biaggio</p>
            <p className="text-white/40 text-[10px]">Urban Ecology Manager</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── Columns (9 garden types from PCC Hort Maintenance Spec Mar 2026) ────────

const COLUMNS = [
  { id: "annuals",       label: "Annuals",             color: "#f59e0b" },
  { id: "roses",         label: "Roses & Perennials",  color: "#ec4899" },
  { id: "ornamental",    label: "Ornamental",          color: "#8b5cf6" },
  { id: "amenity",       label: "Amenity",             color: BRAND },
  { id: "rain_garden",   label: "Rain Garden",         color: "#06b6d4" },
  { id: "reveg",         label: "Reveg",               color: "#84cc16" },
  { id: "bush",          label: "Bush",                color: "#16a34a" },
  { id: "tree_planters", label: "Tree Planters/Pits",  color: "#78716c" },
  { id: "hedges",        label: "Hedges",              color: "#6b7280" },
];

type RowType = "select" | "text" | "readonly";

interface SpecRow {
  id: string;
  label: string;
  type: RowType;
  options?: string[];
  values: Record<string, string>;
  group: string;
}

const SPEC_ROWS: SpecRow[] = [
  // ── Service Standards ────────────────────────────────────────────────────
  {
    id: "grade", label: "Standard", type: "select", group: "Service Standards",
    options: ["High", "Medium", "Low"],
    values: {
      annuals: "High", roses: "High", ornamental: "High", amenity: "Medium",
      rain_garden: "Medium", reveg: "Medium", bush: "Low", tree_planters: "Medium", hedges: "Medium",
    },
  },
  {
    id: "frequency", label: "Frequency", type: "select", group: "Service Standards",
    options: ["Weekly", "Fortnightly", "Monthly", "Quarterly", "Bimonthly", "Seasonal"],
    values: {
      annuals: "Weekly", roses: "Fortnightly", ornamental: "Fortnightly", amenity: "Monthly",
      rain_garden: "Monthly", reveg: "Quarterly", bush: "Bimonthly", tree_planters: "Monthly", hedges: "Seasonal",
    },
  },
  {
    id: "agrichem", label: "Agri-chemical / Mechanical", type: "select", group: "Service Standards",
    options: ["No herbicides", "Mechanical", "Chemical", "Mechanical & Chemical"],
    values: {
      annuals: "No herbicides", roses: "Mechanical", ornamental: "Mechanical", amenity: "Mechanical",
      rain_garden: "Mechanical", reveg: "Chemical", bush: "Chemical", tree_planters: "Mechanical", hedges: "Chemical",
    },
  },

  // ── Litter & Weeds ───────────────────────────────────────────────────────
  {
    id: "litter", label: "Litter", type: "text", group: "Litter & Weeds",
    values: {
      annuals:       "No old litter. Includes dead plants.",
      roses:         "No old litter. Includes dead plants. All surplus plant material removed from site immediately after each maintenance visit.",
      ornamental:    "No old litter. Includes dead plants. All surplus removed immediately after each maintenance visit.",
      amenity:       "No old litter. Includes dead plants. All surplus removed immediately after each maintenance visit.",
      rain_garden:   "No old litter. Includes dead plants. All surplus removed immediately after each maintenance visit.",
      reveg:         "No old litter. Includes dead plants. All surplus removed immediately after each maintenance visit.",
      bush:          "No old litter. All surplus plant material and debris removed immediately after each maintenance visit.",
      tree_planters: "No old litter. All surplus plant material and debris removed immediately after each maintenance visit.",
      hedges:        "No old litter. All surplus plant material and debris removed immediately after each maintenance visit.",
    },
  },
  {
    id: "weedCoverTotal", label: "Weed Cover — Total", type: "readonly", group: "Litter & Weeds",
    values: {
      annuals: "Weed free", roses: "Weed free", ornamental: "2%", amenity: "5%",
      rain_garden: "5%", reveg: "5%", bush: "15%", tree_planters: "5%", hedges: "5%",
    },
  },
  {
    id: "weedCoverM2", label: "Weed Cover — per 1m²", type: "readonly", group: "Litter & Weeds",
    values: {
      annuals: "Weed free", roses: "Weed free", ornamental: "10%", amenity: "10%",
      rain_garden: "10%", reveg: "30%", bush: "30%", tree_planters: "10%", hedges: "10%",
    },
  },
  {
    id: "weedHeight", label: "Weed Height / Width Max", type: "text", group: "Litter & Weeds",
    values: {
      annuals:       "None allowed",
      roses:         "Weed free",
      ornamental:    "100mm tall, 100mm wide",
      amenity:       "150mm tall, 100mm wide",
      rain_garden:   "150mm tall, 100mm wide",
      reveg:         "500mm (weeds cannot restrict growth of natives)",
      bush:          "150mm tall, 100mm wide — visible edge only",
      tree_planters: "100mm tall, 100mm wide",
      hedges:        "150mm tall, 100mm wide",
    },
  },
  {
    id: "plantPests", label: "Plant Pests (noxious)", type: "select", group: "Litter & Weeds",
    options: ["None allowed", "Manage as required"],
    values: {
      annuals: "None allowed", roses: "None allowed", ornamental: "None allowed", amenity: "None allowed",
      rain_garden: "None allowed", reveg: "None allowed", bush: "None allowed", tree_planters: "None allowed", hedges: "None allowed",
    },
  },

  // ── Mulch ────────────────────────────────────────────────────────────────
  {
    id: "mulchDepth", label: "Mulch Depth", type: "text", group: "Mulch",
    values: {
      annuals:       "n/a",
      roses:         "50–100mm. No mulch required on slopes >30°, flood-prone sites, or where vegetation has fully covered the site.",
      ornamental:    "50–100mm. No mulch required on slopes >30°, flood-prone sites, or where vegetation has fully covered the site.",
      amenity:       "50–100mm. No mulch required on slopes >30°, flood-prone sites, or where vegetation has fully covered the site.",
      rain_garden:   "None allowed",
      reveg:         "Mulched once at inception only",
      bush:          "n/a",
      tree_planters: "50–100mm if already present. No mulch on slopes >30°, flood-prone sites, or where vegetation has fully covered the site.",
      hedges:        "n/a",
    },
  },
  {
    id: "mulchType", label: "Mulch Type", type: "text", group: "Mulch",
    values: {
      annuals:       "n/a",
      roses:         "Fine bark mulch, aged tree chip or compost",
      ornamental:    "Alpine/Rock: crushed rock. Woodland: bark, aged tree chip or mushroom compost. Herbaceous: aged tree chip, mushroom compost, approved weed-free organic compost or fine granulated bark.",
      amenity:       "Bark or aged tree chip",
      rain_garden:   "n/a",
      reveg:         "n/a",
      bush:          "n/a",
      tree_planters: "Bark mulch, gravel or lime chip",
      hedges:        "n/a",
    },
  },
  {
    id: "mulchPlacement", label: "Mulch Placement", type: "text", group: "Mulch",
    values: {
      annuals:       "n/a",
      roses:         "Clear of trunks, plant stems and crowns; not buried. Evenly spread. Not allowed to spill over garden edges.",
      ornamental:    "Clear of trunks, plant stems and crowns; not buried. Not allowed to spill over garden edges.",
      amenity:       "Clear of trunks, plant stems and crowns; not buried. Not allowed to spill over garden edges.",
      rain_garden:   "n/a",
      reveg:         "n/a",
      bush:          "n/a",
      tree_planters: "Clear of trunks, plant stems and crowns; not buried. Not allowed to spill over garden edges.",
      hedges:        "n/a",
    },
  },

  // ── Plant Care ───────────────────────────────────────────────────────────
  {
    id: "pruningOutcome", label: "Pruning — Outcome", type: "text", group: "Plant Care",
    values: {
      annuals:       "n/a",
      roses:         "Build strong framework; maintain shape & balance; maximise flowering; keep growth healthy & vigorous; to dimensions within space available; remove danger/nuisance; repair wind/vandalism damage.",
      ornamental:    "Build strong framework; maintain shape & balance; maximise flowering; keep growth healthy & vigorous; to dimensions within space available; remove danger/nuisance; repair wind/vandalism damage.",
      amenity:       "Build strong framework; maintain shape & balance; maximise flowering; keep growth healthy & vigorous; to dimensions within space available.",
      rain_garden:   "Build strong framework; maintain shape & balance; maximise flowering; keep growth healthy & vigorous; to dimensions within space available.",
      reveg:         "Repair minor damage from wind or vandalism; remove danger or nuisance.",
      bush:          "Clearance trimming only.",
      tree_planters: "Build strong framework; maintain shape & balance; maximise flowering; keep growth healthy & vigorous; remove danger/nuisance; repair minor damage.",
      hedges:        "Maintain shape & balance; remove danger/nuisance; repair minor damage.",
    },
  },
  {
    id: "pruningMetrics", label: "Pruning — Metrics", type: "text", group: "Plant Care",
    values: {
      annuals:       "n/a",
      roses:         "Accepted & up-to-date techniques. Remove dead, diseased, twiggy, spindly & crossing branches. Encourage new growth. Clean cuts at appropriate angles. SEE METHODOLOGY FOR SPECIFIC ROSE TYPES.",
      ornamental:    "No dead/weak/diseased material. Retain intended shape. Definition between neighbouring plants. Maximise health/vigour/flowering. Best practice — prune to nodes, no stubs. Clearance: footpaths vertical 2.5m / horizontal 100mm; roads/carparks/railways vertical 2.5m / horizontal 100mm. Street gardens max 1m high.",
      amenity:       "No dead/weak/diseased material. Retain intended shape. Definition between neighbouring plants. Maximise health/vigour/flowering. Best practice. Clearance: footpaths vertical 2.5m / horizontal 100mm; roads/railways 2.5m / 100mm. Street gardens max 1m high.",
      rain_garden:   "Clearance: footpaths vertical 2.5m / horizontal 100mm; roads/railways 2.5m / 100mm. Nothing dead/dying/diseased. No dead/weak material. Definition between neighbouring plants.",
      reveg:         "Clearance: footpaths vertical 2.5m / horizontal 100mm. Nothing dead/dying/diseased. Deadwood removal only if prominent, a risk to health of other vegetation, particularly unsightly or hazardous.",
      bush:          "Removal of deadwood/dead plants only if prominent, risk to other vegetation, unsightly or hazardous.",
      tree_planters: "No dead/weak/diseased material. Retain intended shape. Best practice — prune to nodes, no stubs. Clearance: footpaths vertical 2.5m / horizontal 100mm; roads/railways 2.5m / 100mm. Street gardens max 1m high.",
      hedges:        "Max 100mm growth (griselinia / mixed natives / escalonia). Max 50mm (korokia). Max 30mm (buxus). Evenly cut to accepted horticultural standards. Cut just above previous growth. Max 2m tall. Private boundary side trimming not necessary.",
    },
  },
  {
    id: "deadHeading", label: "Dead Heading", type: "text", group: "Plant Care",
    values: {
      annuals:       "Max 2% deadheads",
      roses:         "Summer dead heading to industry best practice",
      ornamental:    "Max 20% deadheads (10% in Japanese garden)",
      amenity:       "Max 30% deadheads",
      rain_garden:   "Max 30% deadheads",
      reveg:         "n/a",
      bush:          "Not required",
      tree_planters: "Max 30% deadheads",
      hedges:        "Not required",
    },
  },
  {
    id: "pestDisease", label: "Pests & Diseases", type: "text", group: "Plant Care",
    values: {
      annuals:       "Monitor; develop appropriate strategies; maintain preventative and responsive control programmes; provide early treatment to prevent/control pests and diseases adversely impacting plant growth, health, appearance and longevity. Minimise impact on beneficial insects and biological agents.",
      roses:         "No adverse impact on plant health and appearance. Provide early treatment to prevent/control pests and diseases. Minimise impact on beneficial insects and biological agents.",
      ornamental:    "Maintained to a healthy standard. Report presence of any pests and diseases at each visit. Minimise impact on beneficial insects and biological agents.",
      amenity:       "Maintained to a healthy standard. Report presence of any pests and diseases at each visit. Minimise impact on beneficial insects and biological agents.",
      rain_garden:   "Maintained to a healthy standard. Report presence of any pests and diseases at each visit. Minimise impact on beneficial insects and biological agents.",
      reveg:         "Maintained to a healthy standard. Report presence of any pests and diseases at each visit.",
      bush:          "n/a",
      tree_planters: "Maintained to a healthy standard. Report presence of any pests and diseases at each visit.",
      hedges:        "Maintained to a healthy standard. Report presence of any pests and diseases at each visit. Minimise impact on beneficial insects and biological agents.",
    },
  },
  {
    id: "healthVigor", label: "Health & Vigour", type: "text", group: "Plant Care",
    values: {
      annuals:       "Report drainage issues. Maintain soil conditions and health suitable for outstanding seasonal bedding displays.",
      roses:         "Fertilise as required.",
      ornamental:    "Fertilise only where nutrient deficiency or poor/weak plant growth is apparent.",
      amenity:       "Report struggling plants or weak plant growth.",
      rain_garden:   "Report struggling plants or weak plant growth.",
      reveg:         "Report struggling plants or weak plant growth.",
      bush:          "n/a",
      tree_planters: "Report struggling plants or weak plant growth.",
      hedges:        "Report struggling plants or weak plant growth.",
    },
  },
  {
    id: "irrigation", label: "Irrigation", type: "text", group: "Plant Care",
    values: {
      annuals:       "Irrigate as required: sustain healthy vigorous growth and flowering for maximum time throughout season; minimise pest and disease incidence.",
      roses:         "Irrigate as required: sustain healthy vigorous growth and flowering throughout season; minimise pest and disease incidence. Water at base only.",
      ornamental:    "Irrigate as required: sustain healthy vigorous growth and flowering throughout season; minimise pest and disease incidence.",
      amenity:       "Not required unless extreme dry conditions occur.",
      rain_garden:   "Not required unless extreme dry conditions occur.",
      reveg:         "n/a",
      bush:          "Not required.",
      tree_planters: "Not required.",
      hedges:        "Not required unless extreme dry conditions occur.",
    },
  },
  {
    id: "plantCoverage", label: "Plant Coverage", type: "text", group: "Plant Care",
    values: {
      annuals:       "100% as appropriate to each design",
      roses:         "90%",
      ornamental:    "90%",
      amenity:       "90%",
      rain_garden:   "90%",
      reveg:         "Report >10% plant loss during first 5 years of establishment.",
      bush:          "90%",
      tree_planters: "90%",
      hedges:        "100%",
    },
  },

  // ── Presentation ─────────────────────────────────────────────────────────
  {
    id: "edging", label: "Edging", type: "text", group: "Presentation",
    values: {
      annuals:       "Permanent edging (e.g. path or concrete strip). Clear chamfer 50–75mm deep. Shaped to rise from bottom of edge (max 45°). Minimise soil collapse.",
      roses:         "Hard edging (e.g. path or concrete strip). Clear chamfer 75–100mm deep. Shaped to rise from bottom of edge (max 45°). Minimise soil/mulch spillage.",
      ornamental:    "Hard edging (e.g. path or concrete strip). Clear chamfer 75–100mm deep. Shaped to rise from edge bottom (max 45°). Minimise soil/mulch spillage.",
      amenity:       "Hard edging (e.g. path or concrete strip). Clear chamfer 75–100mm deep. Shaped to rise from edge bottom (max 45°). Minimise soil/mulch spillage.",
      rain_garden:   "Hard edging (e.g. path or concrete strip). Clear chamfer 75–100mm deep. See specification for specific detail.",
      reveg:         "Chemical spray line edge at original garden extent (no creep). Existing dug edge maintained as per General Shrub Gardens standard.",
      bush:          "Hard edging (e.g. path or concrete strip). Clear chamfer 75–100mm deep. Shaped to rise from edge bottom (max 45°). Minimise soil/mulch spillage.",
      tree_planters: "Hard edging (e.g. path or concrete strip). Clear chamfer 75–100mm deep. Shaped to rise from edge bottom (max 45°). Minimise soil/mulch spillage.",
      hedges:        "Hard edging (e.g. path or concrete strip). Clear chamfer 75–100mm deep. Shaped to rise from edge bottom (max 45°). Minimise soil/mulch spillage.",
    },
  },
];

const GROUPS = ["Service Standards", "Litter & Weeds", "Mulch", "Plant Care", "Presentation"];

const GROUP_COLORS: Record<string, string> = {
  "Service Standards": "#f0f9ff",
  "Litter & Weeds":    "#fefce8",
  "Mulch":             "#f0fdf4",
  "Plant Care":        "#fdf4ff",
  "Presentation":      "#fff7ed",
};

const GROUP_BORDER: Record<string, string> = {
  "Service Standards": "#bae6fd",
  "Litter & Weeds":    "#fde68a",
  "Mulch":             "#bbf7d0",
  "Plant Care":        "#e9d5ff",
  "Presentation":      "#fed7aa",
};

// ─── Cell ────────────────────────────────────────────────────────────────────

function Cell({
  row, colId, editing, value, onChange,
}: {
  row: SpecRow; colId: string; editing: boolean; value: string; onChange: (v: string) => void;
}) {
  const isNA = value === "n/a" || value === "—";

  if (!editing || row.type === "readonly") {
    return (
      <div
        className={`px-3 py-2 text-[11px] leading-snug ${isNA ? "text-gray-400 italic" : "text-gray-700"}`}
        style={{ maxWidth: 200 }}
      >
        {value}
      </div>
    );
  }

  if (row.type === "select" && row.options) {
    return (
      <div className="px-2 py-1">
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="h-7 text-[11px] rounded border-gray-200 bg-white shadow-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {row.options.map(o => (
              <SelectItem key={o} value={o} className="text-[11px]">{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="px-2 py-1">
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full text-[11px] border border-gray-200 rounded bg-white shadow-sm px-2 py-1 resize-none focus:outline-none"
        style={{ minHeight: 56, maxWidth: 196 }}
      />
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

type SimRole = "manager" | "leader" | "worker";
const SIM_ROLES: { key: SimRole; label: string; initials: string }[] = [
  { key: "manager", label: "Daniela Biaggio (Manager)", initials: "DB" },
  { key: "leader",  label: "Jude Morison (Team Leader)", initials: "JM" },
  { key: "worker",  label: "Barry Lavakula (Worker)", initials: "BL" },
];

export function Specification() {
  const [simRole, setSimRole]       = useState<SimRole>("manager");
  const canEdit                     = simRole === "manager";
  const [editing, setEditing]       = useState(false);
  const [saved, setSaved]           = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>("All");

  const initialValues: Record<string, Record<string, string>> = {};
  for (const row of SPEC_ROWS) initialValues[row.id] = { ...row.values };
  const [values, setValues] = useState(initialValues);

  const handleChange = (rowId: string, colId: string, v: string) => {
    setValues(prev => ({ ...prev, [rowId]: { ...prev[rowId], [colId]: v } }));
  };

  const handleSave = () => {
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const visibleRows = activeFilter === "All"
    ? SPEC_ROWS
    : SPEC_ROWS.filter(r => r.group === activeFilter);

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans">
      <Sidebar active="spec" />
      <main className="flex-1 overflow-hidden flex flex-col">

        {/* Header */}
        <header className="bg-white border-b px-8 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-xl font-black" style={{ color: NAVY }}>Maintenance Specification</h1>
            <p className="text-xs text-gray-400">PCC Horticulture Maintenance Spec — March 2026 · 9 garden types</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Role simulator — for mockup review only */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-200">
              <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Viewing as</span>
              <select
                value={simRole}
                onChange={e => { setSimRole(e.target.value as SimRole); setEditing(false); }}
                className="text-xs font-semibold text-gray-700 bg-transparent outline-none cursor-pointer"
              >
                {SIM_ROLES.map(r => (
                  <option key={r.key} value={r.key}>{r.label}</option>
                ))}
              </select>
            </div>

            {/* Permission indicator */}
            {!canEdit && (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
                <Lock className="w-3.5 h-3.5" />View only — Manager & Admin can edit
              </span>
            )}

            {saved && <span className="text-xs text-green-600 font-semibold">✓ Saved</span>}
            {canEdit && editing ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                  <X className="w-3.5 h-3.5 mr-1" />Cancel
                </Button>
                <Button size="sm" className="text-white hover:opacity-90" style={{ background: BRAND }} onClick={handleSave}>
                  <Save className="w-3.5 h-3.5 mr-1" />Save Changes
                </Button>
              </>
            ) : canEdit ? (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="w-3.5 h-3.5 mr-1" />Edit Specifications
              </Button>
            ) : null}
          </div>
        </header>

        {/* Group filter tabs */}
        <div className="bg-white border-b px-8 py-2.5 flex items-center gap-2 flex-shrink-0 flex-wrap">
          {["All", ...GROUPS].map(g => (
            <button
              key={g}
              onClick={() => setActiveFilter(g)}
              className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors whitespace-nowrap ${
                activeFilter === g ? "text-white" : "text-gray-500 bg-gray-100 hover:bg-gray-200"
              }`}
              style={activeFilter === g ? { background: BRAND } : {}}
            >
              {g}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1.5 text-[10px] text-gray-400">
            <Info className="w-3 h-3" />
            Click "Edit Specifications" to modify values
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto px-8 py-4">
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="text-sm w-full border-collapse" style={{ minWidth: 1400 }}>
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th
                      className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 border-r border-gray-200 sticky left-0 z-20"
                      style={{ minWidth: 190 }}
                    >
                    </th>
                    {COLUMNS.map(col => (
                      <th key={col.id} className="px-3 py-3 text-center" style={{ minWidth: 160 }}>
                        <div
                          className="rounded-lg px-2 py-1.5 mx-1"
                          style={{ background: col.color + "18", borderTop: `3px solid ${col.color}` }}
                        >
                          <p className="text-xs font-semibold text-gray-800 leading-tight">{col.label}</p>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, ri) => {
                    const groupRows    = visibleRows.filter(r => r.group === row.group);
                    const isFirstInGroup = groupRows[0].id === row.id;
                    const bgColor      = GROUP_COLORS[row.group] ?? "#fff";
                    const borderColor  = GROUP_BORDER[row.group] ?? "#e5e7eb";

                    return (
                      <tr
                        key={row.id}
                        className={`border-b border-gray-100 transition-colors ${editing && row.type !== "readonly" ? "hover:bg-yellow-50/30" : "hover:bg-gray-50/60"}`}
                        style={{ background: ri % 2 === 0 ? "white" : "#fafafa" }}
                      >
                        <td
                          className="px-4 py-2 border-r border-gray-200 sticky left-0 z-10 align-top"
                          style={{ background: bgColor, borderLeft: `3px solid ${borderColor}`, minWidth: 190 }}
                        >
                          {isFirstInGroup && (
                            <div className="text-[9px] font-black uppercase tracking-wider mb-1 opacity-60">
                              {row.group}
                            </div>
                          )}
                          <p className="text-xs font-medium text-gray-700 leading-tight">{row.label}</p>
                          {row.type === "readonly" && (
                            <span className="text-[9px] text-gray-400 italic">locked</span>
                          )}
                        </td>
                        {COLUMNS.map(col => (
                          <td key={col.id} className="border-r border-gray-100 align-top">
                            <Cell
                              row={row}
                              colId={col.id}
                              editing={editing}
                              value={values[row.id]?.[col.id] ?? "—"}
                              onChange={v => handleChange(row.id, col.id, v)}
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[10px] text-gray-400 mt-3 px-1 leading-relaxed">
            Source: PCC Horticulture Maintenance Specification, March 2026.
            Supplier is exempt from spreading mulch on slopes &gt;30°, flood-prone sites, or where the intended vegetation has totally covered the site and bare ground cannot be seen from outside the bed.
            Weed height maximums apply at time of spraying — weeds in excess of maximum must be reduced by hand or mechanically before herbicide treatment.
          </p>
        </div>
      </main>
    </div>
  );
}
