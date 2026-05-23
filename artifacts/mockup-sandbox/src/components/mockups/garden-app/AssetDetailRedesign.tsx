/**
 * Asset Detail — Full-Page Redesign Mockup
 * Shows a full-page layout (not a drawer) with:
 *   Left column: asset identity, key stats, mini map, core details
 *   Right column (tabbed):
 *     1. Scheduled Jobs  — upcoming pending / in-progress
 *     2. Works History   — all completed jobs (regular + reactive) with photo expansion
 *     3. Field Changes   — field-level audit trail
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, MapPin, Clock, CalendarDays, Ruler,
  CheckCircle2, AlertTriangle, ShieldAlert, ClipboardList,
  ChevronDown, ChevronRight, Camera, History, Wrench,
  Pencil, CalendarCheck, Zap, LayoutDashboard, List,
  ClipboardCheck, Sprout, Layers, FileSpreadsheet, BarChart2,
  User, Image as ImageIcon, Leaf, Info, Tag,
} from "lucide-react";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const BRAND = "#00AECD";
const NAVY  = "#0f2a36";

// ─── Type helpers ──────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  "Roses & Perennials": "bg-pink-100 text-pink-700",
  "Annuals":            "bg-yellow-100 text-yellow-700",
  "Ornamental":         "bg-purple-100 text-purple-700",
  "Amenity":            "bg-sky-100 text-sky-700",
  "Rain Garden":        "bg-cyan-100 text-cyan-700",
  "Reveg":              "bg-lime-100 text-lime-700",
  "Bush":               "bg-green-100 text-green-700",
  "Tree Planter/Pits":  "bg-stone-100 text-stone-700",
  "Hedge":              "bg-emerald-100 text-emerald-700",
};

const STANDARD_COLORS: Record<string, string> = {
  High:   "bg-green-100 text-green-700",
  Medium: "bg-amber-100 text-amber-700",
  Low:    "bg-gray-100 text-gray-600",
};

type ComplianceStatus = "in-spec" | "audit-due" | "non-compliant" | "overdue";

const COMPLIANCE_CONFIG: Record<ComplianceStatus, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  "in-spec":       { label: "In Spec",       bg: "#dcfce7", text: "#16a34a", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  "audit-due":     { label: "Audit Due",     bg: "#fef9c3", text: "#854d0e", icon: <ClipboardList className="w-3.5 h-3.5" /> },
  "non-compliant": { label: "Non-Compliant", bg: "#fee2e2", text: "#dc2626", icon: <ShieldAlert className="w-3.5 h-3.5" /> },
  "overdue":       { label: "Visit Overdue", bg: "#fed7aa", text: "#c2410c", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
};

// ─── Mock data ────────────────────────────────────────────────────────────────

const ASSET = {
  id: "GRD-2024-0212",
  site: "Cobham Court",
  type: "Roses & Perennials",
  standard: "High",
  area: 68,
  serviceTime: 120,
  freq: "Weekly",
  team: "Mobile 1",
  compliance: "audit-due" as ComplianceStatus,
  suburb: "Papakowhai",
  ward: "Northern",
  siteType: "Parkgarden",
  streetAddress: "Cobham Court, Papakowhai",
  plantCoverage: 95,
  trafficControl: false,
  lat: -41.1042,
  lng: 174.8628,
  notes: "High-profile display garden adjacent to playground entry. Seasonal colour changes required prior to Christmas and Easter.",
};

interface ScheduledJob {
  id: string; date: string; jobType: string; status: "pending" | "in_progress" | "overdue";
  team: string; estimatedMins: number; assignedUser?: string;
}

const SCHEDULED_JOBS: ScheduledJob[] = [
  { id: "j1", date: "28 May 2026", jobType: "Scheduled",  status: "pending",     team: "Mobile 1", estimatedMins: 120, assignedUser: "Barry Lavakula" },
  { id: "j2", date: "4 Jun 2026",  jobType: "Scheduled",  status: "pending",     team: "Mobile 1", estimatedMins: 120 },
  { id: "j3", date: "11 Jun 2026", jobType: "Scheduled",  status: "pending",     team: "Mobile 1", estimatedMins: 120 },
  { id: "j4", date: "18 Jun 2026", jobType: "Scheduled",  status: "pending",     team: "Mobile 1", estimatedMins: 120 },
  { id: "j5", date: "22 May 2026", jobType: "Scheduled",  status: "in_progress", team: "Mobile 1", estimatedMins: 120, assignedUser: "Felise Maiava" },
];

type PhotoEntry = { url: string; caption: string };

interface WorksEntry {
  id: string; date: string; jobType: string; kind: "scheduled" | "reactive";
  team: string; worker: string; initials: string;
  actualMins: number; allocatedMins: number;
  status: "completed" | "skipped"; notes: string; pestPlants?: string;
  photos: PhotoEntry[];
}

const WORKS_HISTORY: WorksEntry[] = [
  {
    id: "w1", date: "21 May 2026", jobType: "Scheduled", kind: "scheduled",
    team: "Mobile 1", worker: "Barry Lavakula", initials: "BL",
    actualMins: 118, allocatedMins: 120, status: "completed",
    notes: "", pestPlants: "",
    photos: [
      { url: "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=300&q=80", caption: "East bed — after deadheading" },
      { url: "https://images.unsplash.com/photo-1597848212624-a19eb35e2651?w=300&q=80", caption: "West bed — full bloom" },
      { url: "https://images.unsplash.com/photo-1501004318641-b39e6451bec6?w=300&q=80", caption: "Roses — pruning complete" },
    ],
  },
  {
    id: "w2", date: "14 May 2026", jobType: "Scheduled", kind: "scheduled",
    team: "Mobile 1", worker: "Barry Lavakula", initials: "BL",
    actualMins: 133, allocatedMins: 120, status: "completed",
    notes: "Dead-heading incomplete — ran over time. Back to finish next visit.", pestPlants: "",
    photos: [
      { url: "https://images.unsplash.com/photo-1471086569966-db3eebc25a59?w=300&q=80", caption: "Incomplete dead-heading noted" },
    ],
  },
  {
    id: "w3", date: "9 May 2026", jobType: "Reactive", kind: "reactive",
    team: "Mobile 1", worker: "Felise Maiava", initials: "FM",
    actualMins: 45, allocatedMins: 60, status: "completed",
    notes: "Vandalism repair — broken rose stem splinted and tied. Soil compaction around base addressed.",
    pestPlants: "",
    photos: [
      { url: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=300&q=80", caption: "Before — broken stem" },
      { url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=300&q=80", caption: "After — repaired and mulched" },
    ],
  },
  {
    id: "w4", date: "7 May 2026", jobType: "Scheduled", kind: "scheduled",
    team: "Mobile 1", worker: "Felise Maiava", initials: "FM",
    actualMins: 115, allocatedMins: 120, status: "completed",
    notes: "", pestPlants: "Oxalis (SW bed)",
    photos: [],
  },
  {
    id: "w5", date: "30 Apr 2026", jobType: "Scheduled", kind: "scheduled",
    team: "Mobile 1", worker: "Barry Lavakula", initials: "BL",
    actualMins: 121, allocatedMins: 120, status: "completed",
    notes: "", pestPlants: "",
    photos: [],
  },
  {
    id: "w6", date: "23 Apr 2026", jobType: "Mulching", kind: "scheduled",
    team: "CBD", worker: "Joe Daish", initials: "JD",
    actualMins: 90, allocatedMins: 80, status: "completed",
    notes: "Applied 80mm mulch layer to all beds. Topped up around roses.",
    pestPlants: "",
    photos: [
      { url: "https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=300&q=80", caption: "Mulch application complete" },
    ],
  },
];

interface ChangeEntry {
  date: string; user: string; field: string; from: string; to: string;
}

const FIELD_CHANGES: ChangeEntry[] = [
  { date: "12 May 2026", user: "Daniela Biaggio", field: "Service Time",      from: "100 min", to: "120 min" },
  { date: "12 May 2026", user: "Daniela Biaggio", field: "Frequency",         from: "Fortnightly", to: "Weekly" },
  { date: "3 Mar 2026",  user: "Daniela Biaggio", field: "Assigned Team",     from: "CBD", to: "Mobile 1" },
  { date: "14 Jan 2026", user: "Tim Broadwith",   field: "Standard",          from: "Medium", to: "High" },
  { date: "14 Jan 2026", user: "Tim Broadwith",   field: "Notes",             from: "(empty)", to: "High-profile display garden…" },
];

// ─── Sidebar nav ──────────────────────────────────────────────────────────────

function Sidebar() {
  const nav = [
    { icon: LayoutDashboard, label: "Dashboard" },
    { icon: List,            label: "Asset Register", id: "list" },
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
          const isActive = (id || label.toLowerCase()) === "list";
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

// ─── Job type badge ───────────────────────────────────────────────────────────

function JobTypeBadge({ type, kind }: { type: string; kind?: "scheduled" | "reactive" }) {
  if (kind === "reactive" || type === "Reactive") {
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700"><Zap className="w-2.5 h-2.5" />Reactive</span>;
  }
  if (type === "Mulching") {
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 text-stone-700"><Leaf className="w-2.5 h-2.5" />Mulching</span>;
  }
  return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700"><CalendarCheck className="w-2.5 h-2.5" />Scheduled</span>;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "in_progress") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">In Progress</span>;
  if (status === "overdue")     return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Overdue</span>;
  if (status === "skipped")     return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Skipped</span>;
  if (status === "completed")   return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Completed</span>;
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Pending</span>;
}

// ─── Left detail column ───────────────────────────────────────────────────────

function AssetInfoColumn() {
  const comp = COMPLIANCE_CONFIG[ASSET.compliance];
  return (
    <div className="w-80 flex-shrink-0 flex flex-col gap-0 overflow-y-auto" style={{ borderRight: "1px solid #e5e7eb" }}>

      {/* Identity header */}
      <div className="px-5 py-5 flex-shrink-0" style={{ background: NAVY }}>
        <p className="text-[10px] text-white/40 font-mono mb-1">{ASSET.id}</p>
        <h2 className="text-lg font-bold text-white leading-snug">{ASSET.site}</h2>
        <p className="text-[11px] text-white/50 mt-0.5 flex items-center gap-1">
          <MapPin className="w-3 h-3" />{ASSET.streetAddress}
        </p>
        <div className="flex flex-wrap gap-1.5 mt-3">
          <Badge className={`text-[10px] border-0 ${TYPE_COLORS[ASSET.type]}`}>{ASSET.type}</Badge>
          <Badge className={`text-[10px] border-0 ${STANDARD_COLORS[ASSET.standard]}`}>{ASSET.standard}</Badge>
          <Badge className="text-[10px] border-0 bg-white/10 text-white/70">{ASSET.team}</Badge>
        </div>
      </div>

      {/* Compliance strip */}
      <div className="px-5 py-2.5 flex items-center gap-2 flex-shrink-0 border-b" style={{ background: comp.bg }}>
        <span style={{ color: comp.text }}>{comp.icon}</span>
        <span className="text-[11px] font-bold" style={{ color: comp.text }}>{comp.label}</span>
        <span className="text-[10px] ml-auto font-medium" style={{ color: comp.text }}>42 days ago</span>
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-2 gap-px bg-gray-200 border-b flex-shrink-0">
        {[
          { icon: Ruler,        label: "Area",      value: `${ASSET.area} m²` },
          { icon: Clock,        label: "Service",   value: `${ASSET.serviceTime} min` },
          { icon: CalendarDays, label: "Frequency", value: ASSET.freq },
          { icon: Tag,          label: "Site Type", value: ASSET.siteType },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="px-4 py-3 bg-white">
            <p className="text-[9px] text-gray-400 uppercase tracking-wide flex items-center gap-1">
              <Icon className="w-2.5 h-2.5" />{label}
            </p>
            <p className="text-[12px] font-semibold text-gray-800 mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {/* Mini map */}
      <div className="flex-shrink-0 relative" style={{ height: 180 }}>
        <MapContainer
          center={[ASSET.lat, ASSET.lng]}
          zoom={15}
          style={{ height: "100%", width: "100%" }}
          zoomControl={false}
          attributionControl={false}
          dragging={false}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          touchZoom={false}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <CircleMarker
            center={[ASSET.lat, ASSET.lng]}
            radius={11}
            pathOptions={{ color: "#fff", weight: 2.5, fillColor: BRAND, fillOpacity: 1 }}
          >
            <Tooltip permanent direction="top" offset={[0, -14]}>
              <span className="text-[10px] font-semibold">{ASSET.site}</span>
            </Tooltip>
          </CircleMarker>
        </MapContainer>
        <div className="absolute bottom-2 left-2 z-[500] bg-white/90 backdrop-blur-sm rounded-lg px-2 py-1 shadow-sm text-[10px] font-medium text-gray-700">
          {ASSET.suburb} · {ASSET.ward} Ward
        </div>
      </div>

      {/* Classification details */}
      <div className="px-5 py-4 border-b">
        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-3">Classification</p>
        <div className="space-y-2.5">
          {[
            { label: "Ward",       value: ASSET.ward },
            { label: "Suburb",     value: ASSET.suburb },
            { label: "Site Type",  value: ASSET.siteType },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between">
              <span className="text-[11px] text-gray-400">{label}</span>
              <span className="text-[11px] font-semibold text-gray-700">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
      {ASSET.notes && (
        <div className="px-5 py-4 border-b">
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">Notes</p>
          <p className="text-[11px] text-gray-600 leading-relaxed">{ASSET.notes}</p>
        </div>
      )}

      {/* Traffic control */}
      <div className="px-5 py-3 border-b">
        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">Traffic Control</p>
        {ASSET.trafficControl ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-red-600 bg-red-50 px-2.5 py-1 rounded-lg">
            <AlertTriangle className="w-3 h-3" />Required
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-lg">
            <CheckCircle2 className="w-3 h-3" />Not required
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="px-5 py-4 mt-auto space-y-2 flex-shrink-0 sticky bottom-0 bg-gray-50 border-t">
        <button className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
          <Pencil className="w-3.5 h-3.5" />Edit Asset Details
        </button>
        <button className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: BRAND }}>
          <ClipboardCheck className="w-3.5 h-3.5" />New Audit
        </button>
      </div>
    </div>
  );
}

// ─── Scheduled Jobs tab ───────────────────────────────────────────────────────

function ScheduledJobsTab() {
  const sorted = [...SCHEDULED_JOBS].sort((a, b) => {
    const order = { in_progress: 0, overdue: 1, pending: 2 };
    return (order[a.status] ?? 3) - (order[b.status] ?? 3);
  });
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-800">Upcoming Jobs</p>
          <p className="text-xs text-gray-400 mt-0.5">{sorted.length} jobs scheduled for this asset</p>
        </div>
        <button className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: BRAND }}>
          <CalendarDays className="w-3.5 h-3.5" />Schedule Job
        </button>
      </div>

      <div className="divide-y divide-gray-100">
        {sorted.map(job => (
          <div key={job.id} className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors cursor-pointer">
            {/* Date badge */}
            <div className="flex-shrink-0 w-14 text-center">
              <div className="rounded-xl overflow-hidden shadow-sm border border-gray-200">
                <div className="py-0.5 text-[9px] font-bold text-white uppercase tracking-wide" style={{ background: NAVY }}>
                  {job.date.split(" ")[1]}
                </div>
                <div className="py-1.5 bg-white">
                  <p className="text-lg font-bold text-gray-800 leading-none">{job.date.split(" ")[0]}</p>
                </div>
              </div>
            </div>

            {/* Job info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <JobTypeBadge type={job.jobType} />
                <StatusBadge status={job.status} />
              </div>
              <p className="text-[12px] text-gray-600 flex items-center gap-1">
                <User className="w-3 h-3 text-gray-400" />
                {job.assignedUser ? job.assignedUser : <span className="text-gray-400 italic">Unassigned</span>}
                <span className="text-gray-300 mx-1">·</span>
                {job.team}
              </p>
            </div>

            {/* Time */}
            <div className="flex-shrink-0 text-right">
              <div className="flex items-center gap-1 text-[11px] font-semibold text-gray-600">
                <Clock className="w-3 h-3 text-gray-400" />{job.estimatedMins} min
              </div>
            </div>

            <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Works History tab ────────────────────────────────────────────────────────

function PhotoGrid({ photos }: { photos: PhotoEntry[] }) {
  const [selected, setSelected] = useState<PhotoEntry | null>(null);
  return (
    <div className="mt-3">
      <div className="grid grid-cols-3 gap-2">
        {photos.map((p, i) => (
          <button key={i} onClick={() => setSelected(p)}
            className="rounded-lg overflow-hidden border border-gray-200 hover:border-teal-400 hover:shadow-sm transition-all text-left group">
            <div className="relative h-20 bg-gray-100">
              <img src={p.url} alt={p.caption} className="w-full h-full object-cover group-hover:opacity-90 transition-opacity" />
            </div>
            {p.caption && <p className="px-1.5 py-1 text-[9px] text-gray-500 leading-tight truncate">{p.caption}</p>}
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setSelected(null)}>
          <div className="max-w-lg w-full mx-4 rounded-2xl overflow-hidden shadow-2xl bg-white" onClick={e => e.stopPropagation()}>
            <img src={selected.url} alt={selected.caption} className="w-full object-cover max-h-80" />
            {selected.caption && (
              <div className="px-4 py-3 flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">{selected.caption}</p>
                <button onClick={() => setSelected(null)} className="text-xs text-gray-400 hover:text-gray-700">Close</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function WorksHistoryTab() {
  const [expanded, setExpanded] = useState<string | null>("w1");

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-800">Completed Works</p>
          <p className="text-xs text-gray-400 mt-0.5">{WORKS_HISTORY.length} records — regular &amp; reactive jobs</p>
        </div>
        <div className="flex gap-2">
          <button className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 font-semibold hover:bg-gray-50">All types</button>
        </div>
      </div>

      <div className="divide-y divide-gray-100">
        {WORKS_HISTORY.map(w => {
          const isOpen  = expanded === w.id;
          const over    = w.actualMins > w.allocatedMins;
          const delta   = Math.abs(w.actualMins - w.allocatedMins);
          return (
            <div key={w.id}>
              {/* Row header — always visible */}
              <button
                onClick={() => setExpanded(isOpen ? null : w.id)}
                className="w-full px-6 py-4 flex items-start gap-4 hover:bg-gray-50 transition-colors text-left">

                {/* Date column */}
                <div className="flex-shrink-0 w-20">
                  <p className="text-[12px] font-bold text-gray-800 leading-tight">{w.date.split(" ").slice(0, 2).join(" ")}</p>
                  <p className="text-[10px] text-gray-400">{w.date.split(" ")[2]}</p>
                </div>

                {/* Type + info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <JobTypeBadge type={w.jobType} kind={w.kind} />
                    <StatusBadge status={w.status} />
                    {w.pestPlants && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600">
                        <Leaf className="w-2.5 h-2.5" />Pest plants
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold flex-shrink-0" style={{ background: NAVY }}>{w.initials}</div>
                    {w.worker}
                    <span className="text-gray-300">·</span>{w.team}
                  </p>
                </div>

                {/* Time variance */}
                <div className="flex-shrink-0 text-right mr-2">
                  <p className={`text-[11px] font-bold ${over ? "text-red-500" : "text-green-600"}`}>
                    {over ? `+${delta}` : `-${delta}`} min
                  </p>
                  <p className="text-[10px] text-gray-400">{w.actualMins} / {w.allocatedMins}</p>
                </div>

                {/* Photos count */}
                {w.photos.length > 0 && (
                  <div className="flex items-center gap-1 text-[10px] text-gray-400 flex-shrink-0 mr-2">
                    <Camera className="w-3 h-3" />{w.photos.length}
                  </div>
                )}

                <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {/* Expanded panel */}
              {isOpen && (
                <div className="px-6 pb-5 pt-1 bg-gray-50 border-t border-gray-100">
                  {w.notes && (
                    <div className="mb-3 flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100">
                      <Info className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <p className="text-[11px] text-amber-800 leading-relaxed">{w.notes}</p>
                    </div>
                  )}
                  {w.pestPlants && (
                    <div className="mb-3 flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100">
                      <Leaf className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-[11px] text-red-700 leading-relaxed">Pest plants noted: <strong>{w.pestPlants}</strong></p>
                    </div>
                  )}
                  {w.photos.length > 0 ? (
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" />Photos ({w.photos.length})
                      </p>
                      <PhotoGrid photos={w.photos} />
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-400 italic flex items-center gap-1.5">
                      <Camera className="w-3 h-3" />No photos attached to this visit
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Field Changes tab ────────────────────────────────────────────────────────

function FieldChangesTab() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-6 py-4 border-b bg-gray-50">
        <p className="text-sm font-semibold text-gray-800">Field Changes</p>
        <p className="text-xs text-gray-400 mt-0.5">{FIELD_CHANGES.length} edits recorded</p>
      </div>

      <div className="divide-y divide-gray-100">
        {FIELD_CHANGES.map((c, i) => (
          <div key={i} className="px-6 py-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <span className="text-[11px] font-bold text-gray-800 px-2 py-0.5 rounded-md bg-gray-100">{c.field}</span>
                <span className="text-[10px] text-gray-400 ml-2">{c.date}</span>
              </div>
              <span className="text-[10px] text-gray-400 flex items-center gap-1">
                <User className="w-3 h-3" />{c.user}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] px-2.5 py-1 rounded-lg bg-red-50 text-red-700 font-medium">{c.from}</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-[11px] px-2.5 py-1 rounded-lg bg-green-50 text-green-700 font-medium">{c.to}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AssetDetailRedesign() {
  const [tab, setTab] = useState<"scheduled" | "history" | "changes">("history");

  const tabs = [
    { id: "scheduled", icon: CalendarCheck, label: "Scheduled Jobs",   count: SCHEDULED_JOBS.length },
    { id: "history",   icon: Wrench,        label: "Works History",    count: WORKS_HISTORY.length },
    { id: "changes",   icon: History,       label: "Field Changes",    count: FIELD_CHANGES.length },
  ];

  return (
    <div className="flex min-h-screen bg-[#f5f7f9] font-sans overflow-hidden" style={{ height: "100vh" }}>
      <Sidebar />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top breadcrumb bar */}
        <header className="bg-white border-b px-6 py-3 flex items-center gap-3 flex-shrink-0 z-10">
          <button className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
            <ArrowLeft className="w-4 h-4" />Asset Register
          </button>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-semibold text-gray-800">{ASSET.site}</span>
          <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{ASSET.id}</span>
        </header>

        {/* Two-column content */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Left: asset info column */}
          <AssetInfoColumn />

          {/* Right: tabbed content */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white">

            {/* Tab bar */}
            <div className="flex border-b px-6 bg-white flex-shrink-0">
              {tabs.map(({ id, icon: Icon, label, count }) => (
                <button key={id}
                  onClick={() => setTab(id as typeof tab)}
                  className={`flex items-center gap-2 px-4 py-3.5 text-[12px] font-semibold border-b-2 transition-colors whitespace-nowrap ${
                    tab === id ? "border-[#00AECD] text-[#00AECD]" : "border-transparent text-gray-400 hover:text-gray-600"
                  }`}>
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tab === id ? "bg-teal-100 text-teal-700" : "bg-gray-100 text-gray-500"}`}>
                    {count}
                  </span>
                </button>
              ))}
            </div>

            {/* Tab content */}
            {tab === "scheduled" && <ScheduledJobsTab />}
            {tab === "history"   && <WorksHistoryTab />}
            {tab === "changes"   && <FieldChangesTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
