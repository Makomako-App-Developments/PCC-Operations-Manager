import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LayoutDashboard, ClipboardList, List, CalendarDays, ClipboardCheck,
  Sprout, FileSpreadsheet, Pencil, Save, X, Construction, Info, BarChart2
} from "lucide-react";

const BRAND = "#00AECD";

function Sidebar({ active }: { active: string }) {
  const nav = [
    { icon: LayoutDashboard, label: "Dashboard" },
    { icon: List, label: "Asset Register" },
    { icon: CalendarDays, label: "Schedule" },
    { icon: ClipboardCheck, label: "Audits", id: "audits" },
    { icon: Sprout, label: "Infill Planting", id: "planting" },
    { icon: FileSpreadsheet, label: "Specification", id: "spec" },
    { icon: BarChart2, label: "Reports", id: "reports" },
  ];
  return (
    <aside className="w-56 flex-shrink-0 bg-[#0f2a36] flex flex-col min-h-screen">
      <div className="px-5 py-5 border-b border-white/10">
        <div className="bg-[#00AECD] rounded-lg px-3 py-2 text-center">
          <span className="text-white font-bold text-lg tracking-tight">poriruacity</span>
        </div>
        <p className="text-white/50 text-[10px] text-center mt-1 uppercase tracking-widest">Gardens Manager</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ icon: Icon, label, id }) => {
          const isActive = active === (id || label.toLowerCase());
          return (
            <div key={label} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${isActive ? "bg-[#00AECD] text-white" : "text-white/60 hover:text-white hover:bg-white/10"}`}>
              <Icon className="w-4 h-4" />
              <span className="text-sm font-medium">{label}</span>
            </div>
          );
        })}
      </nav>
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#00AECD] flex items-center justify-center text-white text-xs font-bold">DB</div>
          <div>
            <p className="text-white text-xs font-medium">Daniela Biaggio</p>
            <p className="text-white/40 text-[10px]">Urban Ecology Manager</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── Data ───────────────────────────────────────────────────────────────────

const COLUMNS = [
  { id: "annuals",   label: "Annual Bedding",    los: "n/a",   color: "#f59e0b" },
  { id: "roses",     label: "Rose",              los: "n/a",   color: "#ec4899" },
  { id: "amenity1",  label: "Amenity — LOS 1",   los: "GC1MP · GC1MT1 · GC1MT2", color: "#8b5cf6" },
  { id: "amenity2",  label: "Amenity — LOS 2",   los: "GC2MP · GC2MT1 · GC2MT2 · GC2CP", color: BRAND },
  { id: "amenity3",  label: "Amenity — LOS 3",   los: "GC3MP · GC3MT1 · GC3MT2 · GC3CP", color: "#10b981" },
  { id: "reveg",     label: "Revegetation",       los: "n/a",   color: "#84cc16" },
  { id: "bush",      label: "Bush",               los: "n/a",   color: "#16a34a" },
  { id: "hedges",    label: "Hedges",             los: "n/a",   color: "#6b7280" },
];

type RowType = "select" | "text" | "percent" | "mm" | "readonly";

interface SpecRow {
  id: string;
  label: string;
  type: RowType;
  options?: string[];
  values: Record<string, string>;
  group?: string;
}

const SPEC_ROWS: SpecRow[] = [
  {
    id: "agrichem",
    label: "Agri-chem / Mechanical",
    type: "select",
    group: "Control",
    options: ["Mechanical only", "Chemical only", "Both", "See code note", "Unknown"],
    values: {
      annuals: "Mechanical only",
      roses: "Mechanical only",
      amenity1: "See code note",
      amenity2: "See code note",
      amenity3: "See code note",
      reveg: "Chemical only",
      bush: "Chemical only",
      hedges: "Unknown",
    },
  },
  {
    id: "litter",
    label: "Litter",
    type: "select",
    group: "Control",
    options: ["No old litter", "Litter within visible edge", "Unknown"],
    values: {
      annuals: "No old litter",
      roses: "No old litter",
      amenity1: "No old litter",
      amenity2: "No old litter",
      amenity3: "No old litter",
      reveg: "No old litter",
      bush: "Litter within visible edge",
      hedges: "No old litter",
    },
  },
  {
    id: "weedCoverTotal",
    label: "Weed Cover — Total (%)",
    type: "percent",
    group: "Weeds",
    values: {
      annuals: "0",
      roses: "5",
      amenity1: "5",
      amenity2: "10",
      amenity3: "15",
      reveg: "5",
      bush: "0",
      hedges: "Unknown",
    },
  },
  {
    id: "weedCoverM2",
    label: "Weed Cover — per m² (%)",
    type: "percent",
    group: "Weeds",
    values: {
      annuals: "0",
      roses: "15",
      amenity1: "15",
      amenity2: "25",
      amenity3: "35",
      reveg: "30",
      bush: "n/a",
      hedges: "Unknown",
    },
  },
  {
    id: "weedHeight",
    label: "Weed Height/Width Max (mm)",
    type: "mm",
    group: "Weeds",
    values: {
      annuals: "0",
      roses: "100",
      amenity1: "100",
      amenity2: "150",
      amenity3: "250",
      reveg: "500",
      bush: "n/a",
      hedges: "Unknown",
    },
  },
  {
    id: "plantPests",
    label: "Plant Pests (noxious)",
    type: "select",
    group: "Weeds",
    options: ["None allowed", "Manage as required", "Unknown"],
    values: {
      annuals: "None allowed",
      roses: "None allowed",
      amenity1: "None allowed",
      amenity2: "None allowed",
      amenity3: "None allowed",
      reveg: "None allowed",
      bush: "None allowed",
      hedges: "None allowed",
    },
  },
  {
    id: "mulchDepth",
    label: "Mulch Depth (mm)",
    type: "text",
    group: "Mulch",
    values: {
      annuals: "n/a",
      roses: "50–125",
      amenity1: "50–125",
      amenity2: "50–125",
      amenity3: "50–125",
      reveg: "Unknown",
      bush: "None",
      hedges: "Unknown",
    },
  },
  {
    id: "mulchPlace",
    label: "Mulch Placement",
    type: "select",
    group: "Mulch",
    options: ["n/a", "Clear of trunks & stems, crowns not buried", "Unknown"],
    values: {
      annuals: "n/a",
      roses: "Clear of trunks & stems, crowns not buried",
      amenity1: "Clear of trunks & stems, crowns not buried",
      amenity2: "Clear of trunks & stems, crowns not buried",
      amenity3: "Clear of trunks & stems, crowns not buried",
      reveg: "Unknown",
      bush: "n/a",
      hedges: "Unknown",
    },
  },
  {
    id: "pruning",
    label: "Pruning",
    type: "select",
    group: "Plant Care",
    options: ["n/a", "Best practice — plant health, road & pedestrian clearance", "Overhang only", "Trimmed to intended shape — industry best practice", "Healthy optimum plant health", "Unknown"],
    values: {
      annuals: "n/a",
      roses: "Healthy optimum plant health",
      amenity1: "Best practice — plant health, road & pedestrian clearance",
      amenity2: "Best practice — plant health, road & pedestrian clearance",
      amenity3: "Best practice — plant health, road & pedestrian clearance",
      reveg: "Overhang only",
      bush: "Overhang only",
      hedges: "Trimmed to intended shape — industry best practice",
    },
  },
  {
    id: "pestDisease",
    label: "Pest & Disease",
    type: "select",
    group: "Plant Care",
    options: ["None", "Copper & winter oil after winter pruning", "Health & vigour", "When necessary to prevent plant death", "n/a", "Maintained to healthy standard"],
    values: {
      annuals: "None",
      roses: "Copper & winter oil after winter pruning",
      amenity1: "Health & vigour",
      amenity2: "Health & vigour",
      amenity3: "Health & vigour",
      reveg: "When necessary to prevent plant death",
      bush: "n/a",
      hedges: "Maintained to healthy standard",
    },
  },
  {
    id: "plantCoverage",
    label: "Plant Coverage (%)",
    type: "percent",
    group: "Plant Care",
    values: {
      annuals: "100",
      roses: "95",
      amenity1: "90",
      amenity2: "90",
      amenity3: "90",
      reveg: "90",
      bush: "n/a",
      hedges: "n/a",
    },
  },
  {
    id: "watering",
    label: "Watering",
    type: "select",
    group: "Plant Care",
    options: ["Irrigation or by hand at each visit — SOP 3.1(c)", "n/a", "Unknown"],
    values: {
      annuals: "Irrigation or by hand at each visit — SOP 3.1(c)",
      roses: "Irrigation or by hand at each visit — SOP 3.1(c)",
      amenity1: "Irrigation or by hand at each visit — SOP 3.1(c)",
      amenity2: "Irrigation or by hand at each visit — SOP 3.1(c)",
      amenity3: "Irrigation or by hand at each visit — SOP 3.1(c)",
      reveg: "Irrigation or by hand at each visit — SOP 3.1(c)",
      bush: "n/a",
      hedges: "Irrigation or by hand at each visit — SOP 3.1(c)",
    },
  },
  {
    id: "deadheading",
    label: "Dead Heading",
    type: "select",
    group: "Plant Care",
    options: ["Always", "Yes", "Visually pleasing", "None", "n/a"],
    values: {
      annuals: "Always",
      roses: "Yes",
      amenity1: "Visually pleasing",
      amenity2: "Visually pleasing",
      amenity3: "Visually pleasing",
      reveg: "None",
      bush: "None",
      hedges: "n/a",
    },
  },
  {
    id: "edging",
    label: "Edging",
    type: "select",
    group: "Presentation",
    options: [
      "Vertical, smooth & neat — aesthetically pleasing natural form",
      "<100mm hanging over / inside edge — lowest use possible",
      "Unknown",
      "n/a",
    ],
    values: {
      annuals: "Vertical, smooth & neat — aesthetically pleasing natural form",
      roses: "Vertical, smooth & neat — aesthetically pleasing natural form",
      amenity1: "Vertical, smooth & neat — aesthetically pleasing natural form",
      amenity2: "Vertical, smooth & neat — aesthetically pleasing natural form",
      amenity3: "Vertical, smooth & neat — aesthetically pleasing natural form",
      reveg: "<100mm hanging over / inside edge — lowest use possible",
      bush: "Unknown",
      hedges: "Unknown",
    },
  },
];

const GROUPS = ["Control", "Weeds", "Mulch", "Plant Care", "Presentation"];

const GROUP_COLORS: Record<string, string> = {
  Control: "#f0f9ff",
  Weeds: "#fefce8",
  Mulch: "#f0fdf4",
  "Plant Care": "#fdf4ff",
  Presentation: "#fff7ed",
};

const GROUP_BORDER: Record<string, string> = {
  Control: "#bae6fd",
  Weeds: "#fde68a",
  Mulch: "#bbf7d0",
  "Plant Care": "#e9d5ff",
  Presentation: "#fed7aa",
};

// ─── Cell component ──────────────────────────────────────────────────────────

function Cell({
  row,
  colId,
  editing,
  value,
  onChange,
}: {
  row: SpecRow;
  colId: string;
  editing: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  const isNA = value === "n/a" || value === "Unknown" || value === "0";

  if (!editing) {
    return (
      <div className={`px-3 py-2 text-[11px] leading-snug ${isNA ? "text-gray-400 italic" : "text-gray-700"}`}>
        {row.type === "percent" && value !== "n/a" && value !== "Unknown"
          ? `${value}%`
          : row.type === "mm" && value !== "n/a" && value !== "Unknown"
          ? `${value} mm`
          : value}
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

  if (row.type === "percent") {
    return (
      <div className="px-2 py-1 flex items-center gap-1">
        <input
          type="number"
          value={value === "n/a" || value === "Unknown" ? "" : value}
          onChange={e => onChange(e.target.value)}
          className="w-14 h-7 px-2 text-[11px] border border-gray-200 rounded bg-white text-center shadow-sm"
          min={0} max={100}
        />
        <span className="text-[11px] text-gray-400">%</span>
      </div>
    );
  }

  if (row.type === "mm") {
    return (
      <div className="px-2 py-1 flex items-center gap-1">
        <input
          type="number"
          value={value === "n/a" || value === "Unknown" ? "" : value}
          onChange={e => onChange(e.target.value)}
          className="w-16 h-7 px-2 text-[11px] border border-gray-200 rounded bg-white text-center shadow-sm"
        />
        <span className="text-[11px] text-gray-400">mm</span>
      </div>
    );
  }

  return (
    <div className="px-2 py-1">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full h-7 px-2 text-[11px] border border-gray-200 rounded bg-white shadow-sm"
      />
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function Specification() {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>("All");

  const initialValues: Record<string, Record<string, string>> = {};
  for (const row of SPEC_ROWS) {
    initialValues[row.id] = { ...row.values };
  }
  const [values, setValues] = useState(initialValues);

  const handleChange = (rowId: string, colId: string, v: string) => {
    setValues(prev => ({
      ...prev,
      [rowId]: { ...prev[rowId], [colId]: v },
    }));
  };

  const handleSave = () => {
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const visibleRows = activeFilter === "All"
    ? SPEC_ROWS
    : SPEC_ROWS.filter(r => r.group === activeFilter);

  return (
    <div className="flex min-h-screen bg-[#f5f7f9] font-sans">
      <Sidebar active="spec" />
      <main className="flex-1 overflow-hidden flex flex-col">
        {/* Header */}
        <header className="bg-white border-b px-8 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Maintenance Specification</h1>
            <p className="text-xs text-gray-400">Horticultural standards by garden type — edit to customise for Porirua City</p>
          </div>
          <div className="flex items-center gap-3">
            {saved && (
              <span className="text-xs text-green-600 font-medium">✓ Saved</span>
            )}
            {editing ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                  <X className="w-3.5 h-3.5 mr-1" /> Cancel
                </Button>
                <Button size="sm" style={{ background: BRAND }} className="text-white hover:opacity-90" onClick={handleSave}>
                  <Save className="w-3.5 h-3.5 mr-1" /> Save Changes
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="w-3.5 h-3.5 mr-1" /> Edit Specifications
              </Button>
            )}
          </div>
        </header>

        {/* Group filter tabs */}
        <div className="bg-white border-b px-8 py-2 flex items-center gap-2 flex-shrink-0">
          {["All", ...GROUPS].map(g => (
            <button
              key={g}
              onClick={() => setActiveFilter(g)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                activeFilter === g
                  ? "text-white"
                  : "text-gray-500 bg-gray-100 hover:bg-gray-200"
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

        {/* Scrollable table */}
        <div className="flex-1 overflow-auto px-8 py-4">
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="text-sm w-full border-collapse" style={{ minWidth: 1100 }}>
                <thead>
                  {/* Garden type headers */}
                  <tr className="border-b-2 border-gray-200">
                    <th
                      className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 border-r border-gray-200 sticky left-0 z-20"
                      style={{ minWidth: 180 }}
                    >
                      Specification
                    </th>
                    {COLUMNS.map(col => (
                      <th
                        key={col.id}
                        className="px-3 py-3 text-center"
                        style={{ minWidth: 150 }}
                      >
                        <div
                          className="rounded-lg px-2 py-1.5 mx-1"
                          style={{ background: col.color + "18", borderTop: `3px solid ${col.color}` }}
                        >
                          <p className="text-xs font-semibold text-gray-800">{col.label}</p>
                          {col.los !== "n/a" && (
                            <p className="text-[9px] text-gray-400 mt-0.5 leading-tight">{col.los}</p>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, ri) => {
                    const groupRows = visibleRows.filter(r => r.group === row.group);
                    const isFirstInGroup = groupRows[0].id === row.id;
                    const bgColor = GROUP_COLORS[row.group || "Control"];
                    const borderColor = GROUP_BORDER[row.group || "Control"];

                    return (
                      <tr
                        key={row.id}
                        className={`border-b border-gray-100 transition-colors ${editing ? "hover:bg-yellow-50/30" : "hover:bg-gray-50/70"}`}
                        style={{ background: ri % 2 === 0 ? "white" : "#fafafa" }}
                      >
                        <td
                          className="px-4 py-2 border-r border-gray-200 sticky left-0 z-10"
                          style={{ background: bgColor, borderLeft: `3px solid ${borderColor}`, minWidth: 180 }}
                        >
                          {isFirstInGroup && (
                            <div className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: borderColor.replace("0", "8") }}>
                              {row.group}
                            </div>
                          )}
                          <p className="text-xs font-medium text-gray-700 leading-tight">{row.label}</p>
                        </td>
                        {COLUMNS.map(col => (
                          <td key={col.id} className="border-r border-gray-100 align-middle">
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

          {/* Footer note */}
          <p className="text-[10px] text-gray-400 mt-3 px-1">
            Code note: G = Garden · C = Category · M = Mechanical · C = Chemical · P = Park · T = Traffic/Streetscape (Level 1 or 2).
            Supplier exempt from spreading mulch on slopes &gt;30°, flood-prone sites, or where intended vegetation has totally covered the site.
          </p>
        </div>
      </main>
    </div>
  );
}
