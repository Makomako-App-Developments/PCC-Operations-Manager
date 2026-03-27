import { useState, useMemo } from "react";
import {
  LayoutDashboard, List, CalendarDays, ClipboardCheck, Sprout,
  Layers, FileSpreadsheet, BarChart2, Map as MapIcon,
  ChevronDown, ChevronUp, X, Filter
} from "lucide-react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup, ZoomControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const BRAND = "#00AECD";
const NAVY  = "#0f2a36";

// ─── Asset dataset ────────────────────────────────────────────────────────────

type ScheduleState = "due-today" | "due-this-week" | "in-progress" | "just-completed" | "overdue" | "upcoming";
type JobType       = "Scheduled" | "Reactive" | "Mulching" | "Infill Planting";

interface MapAsset {
  id: string; site: string;
  type: string; standard: string;
  area: number; serviceTime: number;
  freq: string; team: string;
  nextDue: string; lastVisit: string;
  lat: number; lng: number;
  scheduleState: ScheduleState;
  jobs: JobType[];
  suburb: string;
}

const ASSETS: MapAsset[] = [
  {
    id: "GRD-2024-0847", site: "Aotea Lagoon Reserve",
    type: "Ornamental", standard: "High", area: 142, serviceTime: 90,
    freq: "Fortnightly", team: "Mobile 2", nextDue: "1 Apr 2026", lastVisit: "18 Mar 2026",
    lat: -41.1068, lng: 174.8386, scheduleState: "due-this-week",
    jobs: ["Scheduled"], suburb: "Aotea",
  },
  {
    id: "GRD-2024-0212", site: "Cobham Court",
    type: "Roses & Perennials", standard: "High", area: 68, serviceTime: 120,
    freq: "Weekly", team: "Mobile 1", nextDue: "27 Mar 2026", lastVisit: "20 Mar 2026",
    lat: -41.1042, lng: 174.8628, scheduleState: "due-today",
    jobs: ["Scheduled", "Mulching"], suburb: "Papakowhai",
  },
  {
    id: "GRD-2024-0391", site: "Titahi Bay Esplanade",
    type: "Annuals", standard: "High", area: 95, serviceTime: 75,
    freq: "Fortnightly", team: "Mobile 2", nextDue: "3 Apr 2026", lastVisit: "20 Mar 2026",
    lat: -41.0883, lng: 174.8254, scheduleState: "just-completed",
    jobs: ["Scheduled"], suburb: "Titahi Bay",
  },
  {
    id: "GRD-2024-0558", site: "Kenepuru Landing",
    type: "Reveg", standard: "Medium", area: 520, serviceTime: 45,
    freq: "Monthly", team: "CBD", nextDue: "1 Apr 2026", lastVisit: "1 Mar 2026",
    lat: -41.1318, lng: 174.8494, scheduleState: "overdue",
    jobs: ["Scheduled", "Infill Planting"], suburb: "Kenepuru",
  },
  {
    id: "GRD-2024-0629", site: "Paremata Station",
    type: "Bush", standard: "Low", area: 1240, serviceTime: 30,
    freq: "Bimonthly", team: "CBD", nextDue: "Sep 2026", lastVisit: "Sep 2025",
    lat: -41.0997, lng: 174.8705, scheduleState: "upcoming",
    jobs: ["Scheduled"], suburb: "Paremata",
  },
  {
    id: "GRD-2024-0714", site: "Elsdon Reserve",
    type: "Ornamental", standard: "High", area: 203, serviceTime: 60,
    freq: "Monthly", team: "Mobile 2", nextDue: "5 Apr 2026", lastVisit: "5 Mar 2026",
    lat: -41.1248, lng: 174.8491, scheduleState: "overdue",
    jobs: ["Scheduled", "Reactive"], suburb: "Elsdon",
  },
  {
    id: "GRD-2024-0801", site: "Mungavin Ave Berm",
    type: "Annuals", standard: "High", area: 48, serviceTime: 45,
    freq: "Fortnightly", team: "Mobile 1", nextDue: "1 Apr 2026", lastVisit: "18 Mar 2026",
    lat: -41.1352, lng: 174.8523, scheduleState: "due-this-week",
    jobs: ["Scheduled"], suburb: "Porirua East",
  },
  {
    id: "GRD-2024-0022", site: "Waitangirua Mall Entry",
    type: "Roses & Perennials", standard: "High", area: 32, serviceTime: 120,
    freq: "Weekly", team: "Mobile 1", nextDue: "27 Mar 2026", lastVisit: "20 Mar 2026",
    lat: -41.1443, lng: 174.8642, scheduleState: "in-progress",
    jobs: ["Scheduled", "Reactive"], suburb: "Waitangirua",
  },
];

// ─── Config ───────────────────────────────────────────────────────────────────

const SCHEDULE_CONFIG: Record<ScheduleState, { label: string; color: string; bg: string }> = {
  "due-today":      { label: "Due Today",      color: "#f59e0b", bg: "#fef3c7" },
  "due-this-week":  { label: "Due This Week",  color: "#3b82f6", bg: "#dbeafe" },
  "in-progress":    { label: "In Progress",    color: "#00AECD", bg: "#e0f7fb" },
  "just-completed": { label: "Just Completed", color: "#10b981", bg: "#d1fae5" },
  "overdue":        { label: "Overdue",        color: "#ef4444", bg: "#fee2e2" },
  "upcoming":       { label: "Upcoming",       color: "#8b5cf6", bg: "#ede9fe" },
};

const TYPE_COLORS: Record<string, string> = {
  "Roses & Perennials": "#ec4899",
  "Annuals":            "#f59e0b",
  "Ornamental":         "#8b5cf6",
  "Amenity":            "#0ea5e9",
  "Rain Garden":        "#06b6d4",
  "Reveg":              "#84cc16",
  "Bush":               "#22c55e",
  "Tree Planter/Pits":  "#78716c",
  "Hedge":              "#10b981",
};

const GARDEN_TYPES = ["Annuals","Roses & Perennials","Ornamental","Amenity","Rain Garden","Reveg","Bush","Tree Planter/Pits","Hedge"];
const SCHEDULE_STATES: ScheduleState[] = ["due-today","due-this-week","in-progress","just-completed","overdue","upcoming"];
const JOB_TYPES: JobType[] = ["Scheduled","Reactive","Mulching","Infill Planting"];
const FREQUENCIES = ["Weekly","Fortnightly","Monthly","Bimonthly","Quarterly"];
const TEAMS = ["CBD","Mobile 1","Mobile 2","Specialist"];

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar() {
  const nav = [
    { icon: LayoutDashboard, label: "Dashboard" },
    { icon: List,            label: "Asset Register" },
    { icon: MapIcon,         label: "Map",           id: "map" },
    { icon: CalendarDays,    label: "Schedule" },
    { icon: ClipboardCheck,  label: "Audits" },
    { icon: Sprout,          label: "Infill Planting" },
    { icon: Layers,          label: "Mulching" },
    { icon: FileSpreadsheet, label: "Specification" },
    { icon: BarChart2,       label: "Reports" },
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
          const isActive = (id || label.toLowerCase()) === "map";
          return (
            <div key={label}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${isActive ? "text-white" : "text-white/60 hover:text-white hover:bg-white/10"}`}
              style={isActive ? { background: BRAND } : {}}>
              <Icon className="w-4 h-4" />
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

// ─── Filter panel ─────────────────────────────────────────────────────────────

function FilterGroup({
  title, open, onToggle, children,
}: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-bold text-gray-700 uppercase tracking-wider hover:bg-gray-50 transition-colors"
      >
        {title}
        {open ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
      </button>
      {open && <div className="px-4 pb-3 space-y-1.5">{children}</div>}
    </div>
  );
}

function ToggleChip({
  label, active, color, onToggle,
}: { label: string; active: boolean; color?: string; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all text-left ${
        active ? "border-transparent text-white" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
      }`}
      style={active ? { background: color || BRAND } : {}}
    >
      {color && (
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
      )}
      {label}
      {active && <X className="w-3 h-3 ml-auto opacity-70" />}
    </button>
  );
}

// ─── Pin colour logic ─────────────────────────────────────────────────────────

type ColorMode = "schedule" | "type";

function pinColor(asset: MapAsset, mode: ColorMode): string {
  if (mode === "schedule") return SCHEDULE_CONFIG[asset.scheduleState].color;
  return TYPE_COLORS[asset.type] ?? BRAND;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AssetMap() {
  // Filter state — empty set = show all
  const [typeFilter,     setTypeFilter]     = useState<Set<string>>(new Set());
  const [scheduleFilter, setScheduleFilter] = useState<Set<string>>(new Set());
  const [jobFilter,      setJobFilter]      = useState<Set<string>>(new Set());
  const [freqFilter,     setFreqFilter]     = useState<Set<string>>(new Set());
  const [teamFilter,     setTeamFilter]     = useState<Set<string>>(new Set());
  const [colorMode,      setColorMode]      = useState<ColorMode>("schedule");

  // Section open/closed
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    schedule: true, type: true, jobs: true, freq: false, team: false,
  });

  function toggle<T extends string>(set: Set<T>, val: T): Set<T> {
    const next = new Set(set);
    next.has(val) ? next.delete(val) : next.add(val);
    return next;
  }

  function toggleSection(k: string) {
    setOpenSections(s => ({ ...s, [k]: !s[k] }));
  }

  const activeFilterCount =
    typeFilter.size + scheduleFilter.size + jobFilter.size + freqFilter.size + teamFilter.size;

  function clearAll() {
    setTypeFilter(new Set());
    setScheduleFilter(new Set());
    setJobFilter(new Set());
    setFreqFilter(new Set());
    setTeamFilter(new Set());
  }

  // Filtered assets
  const visible = useMemo(() => ASSETS.filter(a => {
    if (typeFilter.size > 0     && !typeFilter.has(a.type))             return false;
    if (scheduleFilter.size > 0 && !scheduleFilter.has(a.scheduleState)) return false;
    if (jobFilter.size > 0      && !a.jobs.some(j => jobFilter.has(j))) return false;
    if (freqFilter.size > 0     && !freqFilter.has(a.freq))             return false;
    if (teamFilter.size > 0     && !teamFilter.has(a.team))             return false;
    return true;
  }), [typeFilter, scheduleFilter, jobFilter, freqFilter, teamFilter]);

  return (
    <div className="flex h-screen bg-[#f5f7f9] font-sans overflow-hidden">
      <Sidebar />

      {/* ── Filter panel ── */}
      <div className="w-[264px] flex-shrink-0 bg-white border-r border-gray-100 flex flex-col shadow-sm z-10">
        {/* Filter header */}
        <div className="px-4 py-3.5 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-bold text-gray-800">Filters</span>
            {activeFilterCount > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: BRAND }}>
                {activeFilterCount}
              </span>
            )}
          </div>
          {activeFilterCount > 0 && (
            <button onClick={clearAll} className="text-[11px] text-gray-400 hover:text-gray-700 font-medium transition-colors">
              Clear all
            </button>
          )}
        </div>

        {/* Colour mode toggle */}
        <div className="px-4 py-3 border-b">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Colour pins by</p>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {(["schedule","type"] as ColorMode[]).map(m => (
              <button key={m}
                onClick={() => setColorMode(m)}
                className={`flex-1 py-1.5 text-xs font-semibold transition-colors ${
                  colorMode === m ? "text-white" : "bg-white text-gray-500 hover:bg-gray-50"
                }`}
                style={colorMode === m ? { background: BRAND } : {}}>
                {m === "schedule" ? "Schedule" : "Garden Type"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* Schedule State */}
          <FilterGroup title="Schedule State" open={openSections.schedule} onToggle={() => toggleSection("schedule")}>
            {SCHEDULE_STATES.map(s => (
              <ToggleChip key={s}
                label={SCHEDULE_CONFIG[s].label}
                active={scheduleFilter.has(s)}
                color={SCHEDULE_CONFIG[s].color}
                onToggle={() => setScheduleFilter(toggle(scheduleFilter, s))}
              />
            ))}
          </FilterGroup>

          {/* Garden Type */}
          <FilterGroup title="Garden Type" open={openSections.type} onToggle={() => toggleSection("type")}>
            {GARDEN_TYPES.map(t => (
              <ToggleChip key={t}
                label={t}
                active={typeFilter.has(t)}
                color={TYPE_COLORS[t]}
                onToggle={() => setTypeFilter(toggle(typeFilter, t))}
              />
            ))}
          </FilterGroup>

          {/* Jobs */}
          <FilterGroup title="Jobs" open={openSections.jobs} onToggle={() => toggleSection("jobs")}>
            {JOB_TYPES.map(j => {
              const jobColors: Record<JobType,string> = {
                "Scheduled":      "#3b82f6",
                "Reactive":       "#ef4444",
                "Mulching":       "#f59e0b",
                "Infill Planting":"#22c55e",
              };
              return (
                <ToggleChip key={j}
                  label={j}
                  active={jobFilter.has(j)}
                  color={jobColors[j]}
                  onToggle={() => setJobFilter(toggle(jobFilter, j))}
                />
              );
            })}
          </FilterGroup>

          {/* Frequency */}
          <FilterGroup title="Frequency" open={openSections.freq} onToggle={() => toggleSection("freq")}>
            {FREQUENCIES.map(f => (
              <ToggleChip key={f}
                label={f}
                active={freqFilter.has(f)}
                onToggle={() => setFreqFilter(toggle(freqFilter, f))}
              />
            ))}
          </FilterGroup>

          {/* Team */}
          <FilterGroup title="Team" open={openSections.team} onToggle={() => toggleSection("team")}>
            {TEAMS.map(t => (
              <ToggleChip key={t}
                label={t}
                active={teamFilter.has(t)}
                onToggle={() => setTeamFilter(toggle(teamFilter, t))}
              />
            ))}
          </FilterGroup>
        </div>

        {/* Result count footer */}
        <div className="px-4 py-3 border-t bg-gray-50">
          <p className="text-xs text-gray-500">
            Showing <span className="font-bold text-gray-800">{visible.length}</span> of {ASSETS.length} assets
          </p>
        </div>
      </div>

      {/* ── Map ── */}
      <div className="flex-1 relative">
        {/* Header bar over map */}
        <div className="absolute top-0 left-0 right-0 z-[500] px-6 py-3 flex items-center justify-between pointer-events-none">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-2 pointer-events-auto">
            <h1 className="text-sm font-bold text-gray-900">Garden Asset Map</h1>
            <p className="text-[10px] text-gray-400">Porirua City · {visible.length} assets displayed</p>
          </div>

          {/* Legend */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-2.5 pointer-events-auto">
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
              {colorMode === "schedule" ? "Schedule State" : "Garden Type"}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {colorMode === "schedule"
                ? SCHEDULE_STATES.filter(s => visible.some(a => a.scheduleState === s)).map(s => (
                    <div key={s} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: SCHEDULE_CONFIG[s].color }} />
                      <span className="text-[10px] text-gray-600">{SCHEDULE_CONFIG[s].label}</span>
                    </div>
                  ))
                : GARDEN_TYPES.filter(t => visible.some(a => a.type === t)).map(t => (
                    <div key={t} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: TYPE_COLORS[t] }} />
                      <span className="text-[10px] text-gray-600">{t}</span>
                    </div>
                  ))
              }
            </div>
          </div>
        </div>

        <MapContainer
          center={[-41.1280, 174.8520]}
          zoom={13}
          style={{ height: "100%", width: "100%" }}
          zoomControl={false}
          attributionControl={false}
        >
          <ZoomControl position="bottomright" />
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

          {visible.map(asset => {
            const color = pinColor(asset, colorMode);
            const schedCfg = SCHEDULE_CONFIG[asset.scheduleState];
            return (
              <CircleMarker
                key={asset.id}
                center={[asset.lat, asset.lng]}
                radius={13}
                pathOptions={{
                  color: "#fff",
                  weight: 2.5,
                  fillColor: color,
                  fillOpacity: 0.95,
                }}
              >
                {/* Always-visible label: name + service time */}
                <Tooltip
                  permanent
                  direction="top"
                  offset={[0, -18]}
                  opacity={1}
                >
                  <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: 1.3 }}>
                    <div style={{ fontWeight: 700, fontSize: 11, color: "#0f2a36", whiteSpace: "nowrap" }}>
                      {asset.site}
                    </div>
                    <div style={{ fontSize: 10, color: "#6b7280", marginTop: 1, whiteSpace: "nowrap" }}>
                      {asset.serviceTime} min · {asset.freq}
                    </div>
                  </div>
                </Tooltip>

                {/* Click popup: full detail card */}
                <Popup
                  offset={[0, -16]}
                  closeButton={false}
                  className="garden-popup"
                >
                  <div style={{ fontFamily: "system-ui, sans-serif", width: 220, padding: "4px 2px" }}>
                    {/* Site name + ID */}
                    <div style={{ marginBottom: 8 }}>
                      <p style={{ fontWeight: 700, fontSize: 13, color: "#0f2a36", margin: 0 }}>{asset.site}</p>
                      <p style={{ fontSize: 10, color: "#9ca3af", fontFamily: "monospace", margin: "2px 0 0" }}>{asset.id}</p>
                    </div>

                    {/* Schedule badge */}
                    <div style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      background: schedCfg.bg, color: schedCfg.color,
                      borderRadius: 20, padding: "2px 8px", fontSize: 10, fontWeight: 700,
                      marginBottom: 10,
                    }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: schedCfg.color, flexShrink: 0,
                      }} />
                      {schedCfg.label}
                    </div>

                    {/* Stats grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", marginBottom: 10 }}>
                      {[
                        { l: "Type",      v: asset.type },
                        { l: "Standard",  v: asset.standard },
                        { l: "Area",      v: `${asset.area} m²` },
                        { l: "Service",   v: `${asset.serviceTime} min` },
                        { l: "Frequency", v: asset.freq },
                        { l: "Team",      v: asset.team },
                        { l: "Next Due",  v: asset.nextDue },
                        { l: "Last Visit",v: asset.lastVisit },
                      ].map(({ l, v }) => (
                        <div key={l}>
                          <p style={{ fontSize: 9, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>{l}</p>
                          <p style={{ fontSize: 11, fontWeight: 600, color: "#1f2937", margin: "1px 0 0" }}>{v}</p>
                        </div>
                      ))}
                    </div>

                    {/* Jobs */}
                    <div>
                      <p style={{ fontSize: 9, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Active Jobs</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {asset.jobs.map(j => {
                          const jobColors: Record<string, string> = {
                            "Scheduled": "#dbeafe", "Reactive": "#fee2e2",
                            "Mulching": "#fef3c7", "Infill Planting": "#dcfce7",
                          };
                          const jobText: Record<string, string> = {
                            "Scheduled": "#1d4ed8", "Reactive": "#dc2626",
                            "Mulching": "#b45309", "Infill Planting": "#16a34a",
                          };
                          return (
                            <span key={j} style={{
                              fontSize: 10, fontWeight: 600,
                              background: jobColors[j], color: jobText[j],
                              borderRadius: 12, padding: "2px 8px",
                            }}>{j}</span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
