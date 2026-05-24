import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, X, Filter, Tag } from "lucide-react";
import { MapContainer, TileLayer, Polygon, CircleMarker, Tooltip, Popup, ZoomControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  useListAssets,
  useListTeams,
  useListJobs,
  useListReactiveJobs,
  useListMulchingRecords,
  useListInfillOrders,
} from "@workspace/api-client-react";
import type { Asset, Job, ReactiveJob, MulchingRecord, InfillOrder } from "@workspace/api-client-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const BRAND = "#00AECD";

type ScheduleState = "due-today" | "due-this-week" | "in-progress" | "just-completed" | "overdue" | "upcoming" | "no-jobs";
type JobType = "Scheduled" | "Reactive" | "Mulching" | "Infill Planting";
type ColorMode = "schedule" | "type";
type LayerMode = "street" | "aerial";

const TILE_LAYERS: Record<LayerMode, { url: string; attribution: string; maxNativeZoom: number }> = {
  street: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors",
    maxNativeZoom: 19,
  },
  aerial: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "© Esri, Maxar, Earthstar Geographics",
    maxNativeZoom: 20,
  },
};

// Convert GeoJSON ring ([lng,lat] pairs) → Leaflet LatLng tuples ([lat,lng])
function geoRingToLeaflet(ring: number[][]): [number, number][] {
  return ring.map(([lng, lat]) => [lat, lng]);
}

// Returns an array of rings (one per polygon) from a GeoJSON Polygon or MultiPolygon
function boundaryToPolygons(boundary: any): [number, number][][] {
  if (!boundary) return [];
  if (boundary.type === "Polygon") {
    return [geoRingToLeaflet(boundary.coordinates[0])];
  }
  if (boundary.type === "MultiPolygon") {
    return boundary.coordinates.map((poly: number[][][]) => geoRingToLeaflet(poly[0]));
  }
  return [];
}

const SCHEDULE_CONFIG: Record<ScheduleState, { label: string; color: string; bg: string }> = {
  "due-today":      { label: "Due Today",      color: "#f59e0b", bg: "#fef3c7" },
  "due-this-week":  { label: "Due This Week",  color: "#3b82f6", bg: "#dbeafe" },
  "in-progress":    { label: "In Progress",    color: "#00AECD", bg: "#e0f7fb" },
  "just-completed": { label: "Just Completed", color: "#10b981", bg: "#d1fae5" },
  "overdue":        { label: "Overdue",        color: "#ef4444", bg: "#fee2e2" },
  "upcoming":       { label: "Upcoming",       color: "#8b5cf6", bg: "#ede9fe" },
  "no-jobs":        { label: "No Jobs",        color: "#9ca3af", bg: "#f3f4f6" },
};

const TYPE_COLORS: Record<string, string> = {
  annuals:           "#f59e0b",
  roses_perennials:  "#ec4899",
  ornamental:        "#8b5cf6",
  amenity:           "#0ea5e9",
  rain_garden:       "#06b6d4",
  reveg:             "#84cc16",
  bush:              "#22c55e",
  tree_planter_pits: "#78716c",
  hedge:             "#10b981",
};

const TYPE_LABELS: Record<string, string> = {
  annuals:           "Annuals",
  roses_perennials:  "Roses & Perennials",
  ornamental:        "Ornamental",
  amenity:           "Amenity",
  rain_garden:       "Rain Garden",
  reveg:             "Reveg",
  bush:              "Bush",
  tree_planter_pits: "Tree Planter/Pits",
  hedge:             "Hedge",
};

const FREQ_LABELS: Record<string, string> = {
  weekly:      "Weekly",
  fortnightly: "Fortnightly",
  monthly:     "Monthly",
  bimonthly:   "Bimonthly",
  quarterly:   "Quarterly",
};

const GARDEN_TYPES = Object.keys(TYPE_COLORS);
const SCHEDULE_STATES: ScheduleState[] = ["due-today", "due-this-week", "in-progress", "just-completed", "overdue", "upcoming", "no-jobs"];
const JOB_TYPES: JobType[] = ["Scheduled", "Reactive", "Mulching", "Infill Planting"];
const FREQUENCIES = ["weekly", "fortnightly", "monthly", "bimonthly", "quarterly"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveScheduleState(
  assetId: string,
  jobs: Job[],
  reactiveJobs: ReactiveJob[],
): ScheduleState {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const assetJobs = jobs.filter(j => j.assetId === assetId);
  const assetReactive = reactiveJobs.filter(r => r.assetId === assetId);

  if (assetJobs.length === 0 && assetReactive.length === 0) return "no-jobs";

  if (assetJobs.some(j => j.status === "overdue")) return "overdue";
  if (assetReactive.some(r => r.status === "open" || r.status === "in_progress")) {
    if (assetJobs.some(j => j.status === "in_progress")) return "in-progress";
  }
  if (assetJobs.some(j => j.status === "in_progress")) return "in-progress";

  const pendingJobs = assetJobs.filter(j => j.status === "pending");
  for (const job of pendingJobs) {
    if (!job.scheduledDate) continue;
    const d = new Date(job.scheduledDate);
    d.setHours(0, 0, 0, 0);
    if (d.getTime() === today.getTime()) return "due-today";
  }
  for (const job of pendingJobs) {
    if (!job.scheduledDate) continue;
    const d = new Date(job.scheduledDate);
    d.setHours(0, 0, 0, 0);
    if (d >= today && d <= weekEnd) return "due-this-week";
  }

  const recentCompleted = assetJobs.filter(j => {
    if (j.status !== "completed" || !j.scheduledDate) return false;
    const d = new Date(j.scheduledDate);
    return d >= weekAgo && d <= today;
  });
  if (recentCompleted.length > 0) return "just-completed";

  return "upcoming";
}

function deriveJobTypes(
  assetId: string,
  jobs: Job[],
  reactiveJobs: ReactiveJob[],
  mulchingRecords: MulchingRecord[],
  infillOrders: InfillOrder[],
): JobType[] {
  const types: JobType[] = [];
  if (jobs.some(j => j.assetId === assetId && (j.status === "pending" || j.status === "in_progress"))) {
    types.push("Scheduled");
  }
  if (reactiveJobs.some(r => r.assetId === assetId && (r.status === "open" || r.status === "in_progress"))) {
    types.push("Reactive");
  }
  if (mulchingRecords.some(m => m.assetId === assetId)) types.push("Mulching");
  if (infillOrders.some(i => i.assetId === assetId)) types.push("Infill Planting");
  return types;
}

function pinColor(asset: Asset, scheduleState: ScheduleState, mode: ColorMode): string {
  if (mode === "schedule") return SCHEDULE_CONFIG[scheduleState].color;
  return TYPE_COLORS[asset.gardenType] ?? BRAND;
}

function jobStroke(jobs: JobType[]): { color: string; weight: number; dashArray?: string } {
  if (jobs.includes("Reactive"))          return { color: "#ef4444", weight: 3.5, dashArray: "5 4" };
  if (jobs.includes("Infill Planting"))   return { color: "#22c55e", weight: 3.5, dashArray: "8 3 2 3" };
  if (jobs.includes("Mulching"))          return { color: "#f59e0b", weight: 3.5, dashArray: "2 3" };
  return { color: "#ffffff", weight: 2.5 };
}

// ─── Filter sub-components ────────────────────────────────────────────────────

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
  label, active, color, dimmed, onToggle,
}: { label: string; active: boolean; color?: string; dimmed?: boolean; onToggle: () => void }) {
  const swatchColor = dimmed ? "#d1d5db" : color;
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all text-left ${
        active ? "border-transparent text-white" : "border-gray-200 bg-white hover:border-gray-300"
      } ${dimmed && !active ? "text-gray-400" : "text-gray-600"}`}
      style={active ? { background: dimmed ? "#9ca3af" : (color || BRAND) } : {}}
    >
      {color && (
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-colors" style={{ background: swatchColor }} />
      )}
      {label}
      {active && <X className="w-3 h-3 ml-auto opacity-70" />}
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MapPage() {
  const [typeFilter,     setTypeFilter]     = useState<Set<string>>(new Set());
  const [scheduleFilter, setScheduleFilter] = useState<Set<ScheduleState>>(new Set());
  const [jobFilter,      setJobFilter]      = useState<Set<JobType>>(new Set());
  const [freqFilter,     setFreqFilter]     = useState<Set<string>>(new Set());
  const [teamFilter,     setTeamFilter]     = useState<Set<string>>(new Set());
  const [colorMode,      setColorMode]      = useState<ColorMode>("schedule");
  const [showLabels,     setShowLabels]     = useState(false);
  const [layerMode,      setLayerMode]      = useState<LayerMode>("street");
  const [openSections,   setOpenSections]   = useState<Record<string, boolean>>({
    schedule: true, type: true, jobs: true, freq: false, team: false,
  });

  const { data: assetsResp }   = useListAssets({ limit: 2000 } as any);
  const { data: teamsData }    = useListTeams();
  const { data: jobsResp }     = useListJobs({ limit: 5000, status: "pending,in_progress,overdue,completed" } as any);
  const { data: reactiveResp } = useListReactiveJobs();
  const { data: mulchResp }    = useListMulchingRecords({ limit: 2000 } as any);
  const { data: infillResp }   = useListInfillOrders({ limit: 2000 } as any);

  const assets       = useMemo(() => assetsResp?.data ?? [], [assetsResp]);
  const teams        = useMemo(() => teamsData ?? [], [teamsData]);
  const jobs         = useMemo(() => jobsResp?.data ?? [], [jobsResp]);
  const reactiveJobs = useMemo(() => reactiveResp?.data ?? [], [reactiveResp]);
  const mulching     = useMemo(() => mulchResp?.data ?? [], [mulchResp]);
  const infill       = useMemo(() => infillResp?.data ?? [], [infillResp]);

  const teamMap = useMemo(() => {
    const m = new Map<string, string>();
    teams.forEach(t => m.set(t.id, t.name));
    return m;
  }, [teams]);

  const mappableAssets = useMemo(
    () => assets.filter(a => a.lat != null && a.lng != null && a.isActive),
    [assets],
  );

  const enriched = useMemo(() => mappableAssets.map(a => ({
    asset: a,
    scheduleState: deriveScheduleState(a.id, jobs, reactiveJobs),
    jobTypes: deriveJobTypes(a.id, jobs, reactiveJobs, mulching, infill),
    teamName: a.teamId ? (teamMap.get(a.teamId) ?? "Unassigned") : "Unassigned",
  })), [mappableAssets, jobs, reactiveJobs, mulching, infill, teamMap]);

  function toggle<T>(set: Set<T>, val: T): Set<T> {
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

  const visible = useMemo(() => enriched.filter(({ asset, scheduleState, jobTypes }) => {
    if (typeFilter.size > 0     && !typeFilter.has(asset.gardenType))    return false;
    if (scheduleFilter.size > 0 && !scheduleFilter.has(scheduleState))   return false;
    if (jobFilter.size > 0      && !jobTypes.some(j => jobFilter.has(j))) return false;
    if (freqFilter.size > 0     && !freqFilter.has(asset.frequency))     return false;
    if (teamFilter.size > 0     && !teamFilter.has(asset.teamId ?? ""))  return false;
    return true;
  }), [enriched, typeFilter, scheduleFilter, jobFilter, freqFilter, teamFilter]);

  const visibleKey = visible.map(e => e.asset.id).join("|");

  const uniqueTeams = useMemo(() => teams, [teams]);
  const presentTypes = useMemo(
    () => GARDEN_TYPES.filter(t => enriched.some(e => e.asset.gardenType === t)),
    [enriched],
  );

  const JOB_TYPE_COLORS: Record<JobType, string> = {
    "Scheduled":       "#1d4ed8",
    "Reactive":        "#dc2626",
    "Mulching":        "#b45309",
    "Infill Planting": "#16a34a",
  };
  const JOB_TYPE_BG: Record<JobType, string> = {
    "Scheduled":       "#dbeafe",
    "Reactive":        "#fee2e2",
    "Mulching":        "#fef3c7",
    "Infill Planting": "#dcfce7",
  };

  return (
    <div className="flex overflow-hidden" style={{ height: "100vh" }}>
      {/* ── Filter panel ── */}
      <div className="w-[264px] flex-shrink-0 bg-white border-r border-gray-100 flex flex-col shadow-sm z-10">
        {/* Header */}
        <div className="px-4 py-3.5 border-b flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-bold text-gray-800">Filters</span>
            {activeFilterCount > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: BRAND }}>
                {activeFilterCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowLabels(v => !v)}
              title={showLabels ? "Hide labels" : "Show labels"}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium transition-colors ${
                showLabels
                  ? "text-white border-transparent"
                  : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
              style={showLabels ? { background: BRAND } : {}}
            >
              <Tag className="w-3 h-3" />
              Labels
            </button>
            {activeFilterCount > 0 && (
              <button onClick={clearAll} className="text-[11px] text-gray-400 hover:text-gray-700 font-medium transition-colors">
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* Colour mode toggle */}
        <div className="px-4 py-3 border-b flex-shrink-0">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Colour pins by</p>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {(["schedule", "type"] as ColorMode[]).map(m => (
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

        {/* Filter groups */}
        <div className="flex-1 overflow-y-auto">
          <FilterGroup title="Schedule State" open={openSections.schedule} onToggle={() => toggleSection("schedule")}>
            {SCHEDULE_STATES.map(s => (
              <ToggleChip key={s}
                label={SCHEDULE_CONFIG[s].label}
                active={scheduleFilter.has(s)}
                color={SCHEDULE_CONFIG[s].color}
                dimmed={colorMode !== "schedule"}
                onToggle={() => setScheduleFilter(toggle(scheduleFilter, s))}
              />
            ))}
          </FilterGroup>

          <FilterGroup title="Garden Type" open={openSections.type} onToggle={() => toggleSection("type")}>
            {(presentTypes.length > 0 ? presentTypes : GARDEN_TYPES).map(t => (
              <ToggleChip key={t}
                label={TYPE_LABELS[t] ?? t}
                active={typeFilter.has(t)}
                color={TYPE_COLORS[t]}
                dimmed={colorMode !== "type"}
                onToggle={() => setTypeFilter(toggle(typeFilter, t))}
              />
            ))}
          </FilterGroup>

          <FilterGroup title="Job Type" open={openSections.jobs} onToggle={() => toggleSection("jobs")}>
            {JOB_TYPES.map(j => (
              <ToggleChip key={j}
                label={j}
                active={jobFilter.has(j)}
                onToggle={() => setJobFilter(toggle(jobFilter, j))}
              />
            ))}
          </FilterGroup>

          <FilterGroup title="Frequency" open={openSections.freq} onToggle={() => toggleSection("freq")}>
            {FREQUENCIES.map(f => (
              <ToggleChip key={f}
                label={FREQ_LABELS[f] ?? f}
                active={freqFilter.has(f)}
                onToggle={() => setFreqFilter(toggle(freqFilter, f))}
              />
            ))}
          </FilterGroup>

          <FilterGroup title="Team" open={openSections.team} onToggle={() => toggleSection("team")}>
            {uniqueTeams.map(t => (
              <ToggleChip key={t.id}
                label={t.name}
                active={teamFilter.has(t.id)}
                onToggle={() => setTeamFilter(toggle(teamFilter, t.id))}
              />
            ))}
          </FilterGroup>
        </div>

        {/* Result count footer */}
        <div className="px-4 py-3 border-t bg-gray-50 flex-shrink-0">
          <p className="text-xs text-gray-500">
            Showing <span className="font-bold text-gray-800">{visible.length}</span> of{" "}
            <span className="font-bold text-gray-800">{mappableAssets.length}</span> mapped assets
            {assets.length - mappableAssets.length > 0 && (
              <span className="text-gray-400"> ({assets.length - mappableAssets.length} without coords)</span>
            )}
          </p>
        </div>
      </div>

      {/* ── Map ── */}
      <div className="flex-1 relative">
        {/* Legend overlay */}
        <div className="absolute top-3 right-3 z-[500] pointer-events-none">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-2.5 pointer-events-auto max-w-[340px]">
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
              {colorMode === "schedule" ? "Schedule State" : "Garden Type"}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {colorMode === "schedule"
                ? SCHEDULE_STATES.filter(s => visible.some(e => e.scheduleState === s)).map(s => (
                    <div key={s} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: SCHEDULE_CONFIG[s].color }} />
                      <span className="text-[10px] text-gray-600">{SCHEDULE_CONFIG[s].label}</span>
                    </div>
                  ))
                : GARDEN_TYPES.filter(t => visible.some(e => e.asset.gardenType === t)).map(t => (
                    <div key={t} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: TYPE_COLORS[t] }} />
                      <span className="text-[10px] text-gray-600">{TYPE_LABELS[t] ?? t}</span>
                    </div>
                  ))
              }
            </div>
            <div className="border-t border-gray-100 mt-2 pt-2">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Pin outline · Job type</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {([
                  { label: "Reactive",       dash: "5 4",     color: "#ef4444" },
                  { label: "Infill Planting", dash: "8 3 2 3", color: "#22c55e" },
                  { label: "Mulching",       dash: "2 3",     color: "#f59e0b" },
                  { label: "Scheduled only", dash: undefined,  color: "#d1d5db" },
                ] as const).map(({ label, dash, color }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 14 14">
                      <circle cx="7" cy="7" r="5" fill="none"
                        stroke={color} strokeWidth="2.5"
                        strokeDasharray={dash ?? "none"}
                      />
                    </svg>
                    <span className="text-[10px] text-gray-600">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Layer switcher */}
        <div className="absolute bottom-6 left-3 z-[500]">
          <div className="flex rounded-lg overflow-hidden shadow border border-gray-200 bg-white">
            {(["street", "aerial"] as LayerMode[]).map(m => (
              <button
                key={m}
                onClick={() => setLayerMode(m)}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                  layerMode === m ? "text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
                style={layerMode === m ? { background: BRAND } : {}}
              >
                {m === "street" ? "Street" : "Aerial"}
              </button>
            ))}
          </div>
        </div>

        <MapContainer
          center={[-41.1280, 174.8520]}
          zoom={13}
          maxZoom={21}
          style={{ height: "100%", width: "100%" }}
          zoomControl={false}
          attributionControl={false}
        >
          <ZoomControl position="bottomright" />
          <TileLayer
            key={layerMode}
            url={TILE_LAYERS[layerMode].url}
            attribution={TILE_LAYERS[layerMode].attribution}
            maxNativeZoom={TILE_LAYERS[layerMode].maxNativeZoom}
            maxZoom={21}
          />

          {/* Garden boundary outlines */}
          {visible.map(({ asset, scheduleState }) => {
            const boundary = (asset as any).boundary;
            const rings = boundaryToPolygons(boundary);
            if (rings.length === 0) return null;
            const color = pinColor(asset, scheduleState, colorMode);
            return rings.map((positions, i) => (
              <Polygon
                key={`${asset.id}-outline-${i}`}
                positions={positions}
                pathOptions={{
                  color,
                  weight: 2,
                  fillColor: color,
                  fillOpacity: 0.15,
                  opacity: 0.8,
                }}
              />
            ));
          })}

          {visible.map(({ asset, scheduleState, jobTypes, teamName }) => {
            const color = pinColor(asset, scheduleState, colorMode);
            const schedCfg = SCHEDULE_CONFIG[scheduleState];
            const stroke = jobStroke(jobTypes);
            const lastVisitJob = jobs
              .filter(j => j.assetId === asset.id && j.status === "completed" && j.scheduledDate)
              .sort((a, b) => new Date(b.scheduledDate!).getTime() - new Date(a.scheduledDate!).getTime())[0];
            const nextDueJob = jobs
              .filter(j => j.assetId === asset.id && (j.status === "pending" || j.status === "overdue") && j.scheduledDate)
              .sort((a, b) => new Date(a.scheduledDate!).getTime() - new Date(b.scheduledDate!).getTime())[0];

            return (
              <CircleMarker
                key={`${asset.id}:${visibleKey}`}
                center={[asset.lat as number, asset.lng as number]}
                radius={13}
                pathOptions={{
                  ...stroke,
                  fillColor: color,
                  fillOpacity: 0.92,
                }}
              >
                {showLabels && (
                  <Tooltip permanent direction="top" offset={[0, -18]} opacity={1}>
                    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: 1.3 }}>
                      <div style={{ fontWeight: 700, fontSize: 11, color: "#0f2a36", whiteSpace: "nowrap" }}>
                        {asset.name}
                      </div>
                      <div style={{ fontSize: 10, color: "#6b7280", marginTop: 1, whiteSpace: "nowrap" }}>
                        {asset.serviceTimeMins} min · {FREQ_LABELS[asset.frequency] ?? asset.frequency}
                      </div>
                    </div>
                  </Tooltip>
                )}

                <Popup offset={[0, -16]} closeButton={false} className="garden-popup">
                  <div style={{ fontFamily: "system-ui, sans-serif", width: 220, padding: "4px 2px" }}>
                    <div style={{ marginBottom: 8 }}>
                      <p style={{ fontWeight: 700, fontSize: 13, color: "#0f2a36", margin: 0 }}>{asset.name}</p>
                      <p style={{ fontSize: 10, color: "#9ca3af", fontFamily: "monospace", margin: "2px 0 0" }}>{asset.reference}</p>
                    </div>

                    <div style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      background: schedCfg.bg, color: schedCfg.color,
                      borderRadius: 20, padding: "2px 8px", fontSize: 10, fontWeight: 700,
                      marginBottom: 10,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: schedCfg.color, flexShrink: 0 }} />
                      {schedCfg.label}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", marginBottom: 10 }}>
                      {[
                        { l: "Type",      v: TYPE_LABELS[asset.gardenType] ?? asset.gardenType },
                        { l: "Standard",  v: asset.standard.charAt(0).toUpperCase() + asset.standard.slice(1) },
                        { l: "Area",      v: `${asset.areaM2} m²` },
                        { l: "Service",   v: `${asset.serviceTimeMins} min` },
                        { l: "Frequency", v: FREQ_LABELS[asset.frequency] ?? asset.frequency },
                        { l: "Team",      v: teamName },
                        { l: "Next Due",  v: nextDueJob?.scheduledDate ? new Date(nextDueJob.scheduledDate).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" }) : "—" },
                        { l: "Last Visit",v: lastVisitJob?.scheduledDate ? new Date(lastVisitJob.scheduledDate).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" }) : "—" },
                      ].map(({ l, v }) => (
                        <div key={l}>
                          <p style={{ fontSize: 9, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>{l}</p>
                          <p style={{ fontSize: 11, fontWeight: 600, color: "#1f2937", margin: "1px 0 0" }}>{v}</p>
                        </div>
                      ))}
                    </div>

                    {jobTypes.length > 0 && (
                      <div>
                        <p style={{ fontSize: 9, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Active Jobs</p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {jobTypes.map(j => (
                            <span key={j} style={{
                              fontSize: 10, fontWeight: 600,
                              background: JOB_TYPE_BG[j], color: JOB_TYPE_COLORS[j],
                              borderRadius: 12, padding: "2px 8px",
                            }}>{j}</span>
                          ))}
                        </div>
                      </div>
                    )}
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
