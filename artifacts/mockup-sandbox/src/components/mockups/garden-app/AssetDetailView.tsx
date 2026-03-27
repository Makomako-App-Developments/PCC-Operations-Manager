/**
 * Standalone preview: Asset Register with Cobham Court detail panel open.
 * Imports the live AssetList component and pre-selects an asset via a wrapper
 * that patches window.history so useState reads the query-param default.
 *
 * Strategy: re-implement the full page here but with `selected` defaulting to
 * the Cobham Court asset ID so the detail panel is always visible on load.
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Search, LayoutGrid, List, Leaf, ClipboardCheck, LayoutDashboard,
  CalendarDays, Eye, MapPin, ClipboardList, Sprout, Layers, FileSpreadsheet, BarChart2,
  X, CheckCircle2, AlertTriangle, History, ShieldAlert, ClipboardX, Info, Pencil
} from "lucide-react";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const BRAND = "#00AECD";
const NAVY  = "#0f2a36";

// ─── Shared data (mirrors AssetList.tsx) ─────────────────────────────────────

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
  "in-spec":       { label: "In Spec",       bg: "#dcfce7", text: "#16a34a", icon: <CheckCircle2 className="w-3 h-3" /> },
  "audit-due":     { label: "Audit Due",     bg: "#fef9c3", text: "#854d0e", icon: <ClipboardList className="w-3 h-3" /> },
  "non-compliant": { label: "Non-Compliant", bg: "#fee2e2", text: "#dc2626", icon: <ShieldAlert className="w-3 h-3" /> },
  "overdue":       { label: "Visit Overdue", bg: "#fed7aa", text: "#c2410c", icon: <AlertTriangle className="w-3 h-3" /> },
};

interface WorkRecord {
  date: string; worker: string; initials: string;
  allocatedMins: number; actualMins: number;
  tasksComplete: string; notes: string; pestPlants: string;
}
interface AuditRecord {
  date: string; auditor: string; type: string;
  score: number; result: "pass" | "fail" | "partial"; flags: string[];
}

const WORK_HISTORY: WorkRecord[] = [
  { date: "18 Mar 2026", worker: "Barry Lavakula",  initials: "BL", allocatedMins: 120, actualMins: 118, tasksComplete: "8/8", notes: "",                                                     pestPlants: "" },
  { date: "11 Mar 2026", worker: "Barry Lavakula",  initials: "BL", allocatedMins: 120, actualMins: 133, tasksComplete: "7/8", notes: "Dead-heading incomplete — ran over time. Back to finish next visit.", pestPlants: "" },
  { date: "4 Mar 2026",  worker: "Felise Maiava",   initials: "FM", allocatedMins: 120, actualMins: 115, tasksComplete: "8/8", notes: "",                                                     pestPlants: "Oxalis (SW bed)" },
  { date: "25 Feb 2026", worker: "Barry Lavakula",  initials: "BL", allocatedMins: 120, actualMins: 121, tasksComplete: "8/8", notes: "",                                                     pestPlants: "" },
  { date: "18 Feb 2026", worker: "Joe Daish",       initials: "JD", allocatedMins: 120, actualMins: 138, tasksComplete: "6/8", notes: "Pruning deferred — equipment fault. Rescheduled for next visit.", pestPlants: "" },
];

const ASSET_AUDITS: AuditRecord[] = [
  { date: "10 Feb 2026", auditor: "Jude Morison",    type: "Completed Works", score: 88, result: "pass",    flags: [] },
  { date: "18 Nov 2025", auditor: "Daniela Biaggio", type: "Outcomes Based",  score: 82, result: "partial", flags: ["Rose black-spot visible on 3 plants"] },
  { date: "14 Aug 2025", auditor: "Tim Broadwith",   type: "Completed Works", score: 91, result: "pass",    flags: [] },
];

const ASSET = {
  id: "GRD-2024-0212", site: "Cobham Court",
  type: "Roses & Perennials", standard: "High",
  area: 68, serviceTime: 120, freq: "Weekly",
  nextDue: "14 Mar 2026", team: "Mobile 1",
  compliance: "audit-due" as ComplianceStatus,
  suburb: "Papakowhai", ward: "Northern",
  locationType: "Parkgarden",
  plantCoverage: 95, trafficControl: false,
  lat: -41.1042, lng: 174.8628,
};

const ALL_ASSETS = [
  { id: "GRD-2024-0847", site: "Aotea Lagoon Reserve",   type: "Ornamental",         standard: "High",   freq: "Fortnightly", team: "Mobile 2", compliance: "in-spec"       as ComplianceStatus },
  { id: "GRD-2024-0212", site: "Cobham Court",            type: "Roses & Perennials", standard: "High",   freq: "Weekly",      team: "Mobile 1", compliance: "audit-due"     as ComplianceStatus },
  { id: "GRD-2024-0391", site: "Titahi Bay Esplanade",   type: "Annuals",             standard: "High",   freq: "Fortnightly", team: "Mobile 2", compliance: "in-spec"       as ComplianceStatus },
  { id: "GRD-2024-0558", site: "Kenepuru Landing",        type: "Reveg",               standard: "Medium", freq: "Monthly",     team: "CBD",      compliance: "non-compliant" as ComplianceStatus },
  { id: "GRD-2024-0629", site: "Paremata Station",        type: "Bush",                standard: "Low",    freq: "Bimonthly",   team: "CBD",      compliance: "in-spec"       as ComplianceStatus },
  { id: "GRD-2024-0714", site: "Elsdon Reserve",          type: "Ornamental",          standard: "High",   freq: "Monthly",     team: "Mobile 2", compliance: "overdue"       as ComplianceStatus },
  { id: "GRD-2024-0801", site: "Mungavin Ave Berm",       type: "Annuals",             standard: "High",   freq: "Fortnightly", team: "Mobile 1", compliance: "in-spec"       as ComplianceStatus },
  { id: "GRD-2024-0022", site: "Waitangirua Mall Entry",  type: "Roses & Perennials",  standard: "High",   freq: "Weekly",      team: "Mobile 1", compliance: "in-spec"       as ComplianceStatus },
];

// ─── Sidebar ──────────────────────────────────────────────────────────────────

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

// ─── Detail panel ─────────────────────────────────────────────────────────────

function AssetDetailPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"details" | "history" | "audits">("details");
  const comp = COMPLIANCE_CONFIG[ASSET.compliance];

  return (
    <div className="absolute inset-y-0 right-0 w-[420px] bg-white shadow-2xl border-l border-gray-200 flex flex-col overflow-hidden z-20">

      {/* Header */}
      <div className="px-5 py-4 border-b flex items-start justify-between flex-shrink-0" style={{ background: NAVY }}>
        <div>
          <h2 className="text-sm font-bold text-white leading-snug">{ASSET.site}</h2>
          <p className="text-[10px] text-white/40 font-mono mt-0.5">{ASSET.id}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Badge className={`text-[10px] border-0 ${TYPE_COLORS[ASSET.type]}`}>{ASSET.type}</Badge>
            <Badge className={`text-[10px] border-0 ${STANDARD_COLORS[ASSET.standard]}`}>{ASSET.standard} Standard</Badge>
            <Badge className="text-[10px] border-0 bg-white/10 text-white/70">{ASSET.team}</Badge>
          </div>
        </div>
        <button onClick={onClose} className="text-white/40 hover:text-white mt-0.5 flex-shrink-0 ml-3">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Compliance strip */}
      <div className="px-5 py-2 flex items-center gap-2 flex-shrink-0 border-b" style={{ background: comp.bg }}>
        <span style={{ color: comp.text }}>{comp.icon}</span>
        <span className="text-[11px] font-bold" style={{ color: comp.text }}>{comp.label}</span>
        <span className="text-[10px] ml-auto font-medium" style={{ color: comp.text }}>Last audit 42 days ago</span>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-4 gap-0 border-b flex-shrink-0">
        {[
          { label: "Area",      value: `${ASSET.area} m²` },
          { label: "Service",   value: `${ASSET.serviceTime} min` },
          { label: "Frequency", value: ASSET.freq },
          { label: "Next Due",  value: ASSET.nextDue.replace(" 2026","") },
        ].map(({ label, value }) => (
          <div key={label} className="px-3 py-2.5 text-center border-r last:border-r-0">
            <p className="text-[9px] text-gray-400 uppercase tracking-wide">{label}</p>
            <p className="text-[11px] font-semibold text-gray-800 mt-0.5 leading-tight">{value}</p>
          </div>
        ))}
      </div>

      {/* Mini Leaflet map */}
      <div className="flex-shrink-0 relative" style={{ height: 168 }}>
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
            radius={10}
            pathOptions={{ color: "#fff", weight: 2.5, fillColor: BRAND, fillOpacity: 1 }}
          >
            <Tooltip permanent direction="top" offset={[0, -14]}>
              <span className="text-[10px] font-semibold">{ASSET.site}</span>
            </Tooltip>
          </CircleMarker>
        </MapContainer>
        <div className="absolute bottom-2 left-2 z-[500] flex items-center gap-1 bg-white/90 backdrop-blur-sm rounded-lg px-2 py-1 shadow-sm">
          <MapPin className="w-3 h-3" style={{ color: BRAND }} />
          <span className="text-[10px] font-medium text-gray-700">{ASSET.suburb} · {ASSET.ward} Ward</span>
        </div>
        <div className="absolute top-2 right-2 z-[500] bg-white/90 backdrop-blur-sm rounded-lg px-2 py-1 shadow-sm">
          <span className="text-[10px] text-gray-400 font-mono">{ASSET.lat.toFixed(4)}, {ASSET.lng.toFixed(4)}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b px-4 flex-shrink-0 bg-gray-50">
        {[
          { id: "details", icon: Info,       label: "Details" },
          { id: "history", icon: History,    label: "Work History" },
          { id: "audits",  icon: ClipboardX, label: "Audits" },
        ].map(({ id, icon: Icon, label }) => (
          <button key={id}
            onClick={() => setTab(id as "details" | "history" | "audits")}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-semibold border-b-2 transition-colors ${
              tab === id ? "border-[#00AECD] text-[#00AECD]" : "border-transparent text-gray-400 hover:text-gray-600"
            }`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
        <button className="ml-auto flex items-center gap-1 px-3 py-2.5 text-[11px] font-semibold text-gray-400 hover:text-gray-700 transition-colors">
          <Pencil className="w-3 h-3" />Edit
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Details ── */}
        {tab === "details" && (
          <div className="px-5 py-4 space-y-5">
            <section>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">Classification</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {[
                  { label: "Garden Type",     value: ASSET.type },
                  { label: "Maint. Standard", value: ASSET.standard },
                  { label: "Ward",            value: ASSET.ward },
                  { label: "Location Type",   value: ASSET.locationType },
                  { label: "Suburb",          value: ASSET.suburb },
                  { label: "Assigned Team",   value: ASSET.team },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-[9px] text-gray-400 uppercase tracking-wide">{label}</p>
                    <p className="text-[12px] font-semibold text-gray-800 mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
            </section>

            <div className="border-t" />

            <section>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">Schedule</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {[
                  { label: "Service Frequency", value: ASSET.freq },
                  { label: "Service Time",       value: `${ASSET.serviceTime} min` },
                  { label: "Next Due",           value: ASSET.nextDue },
                  { label: "Compliance Status",  value: COMPLIANCE_CONFIG[ASSET.compliance].label },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-[9px] text-gray-400 uppercase tracking-wide">{label}</p>
                    <p className="text-[12px] font-semibold text-gray-800 mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
            </section>

            <div className="border-t" />

            <section>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">Physical Attributes</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <div>
                  <p className="text-[9px] text-gray-400 uppercase tracking-wide">Area</p>
                  <p className="text-[12px] font-semibold text-gray-800 mt-0.5">{ASSET.area} m²</p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-400 uppercase tracking-wide">Plant Coverage</p>
                  <p className="text-[12px] font-semibold text-gray-800 mt-0.5">{ASSET.plantCoverage}%</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[9px] text-gray-400 uppercase tracking-wide">Traffic Control</p>
                  <div className="mt-1">
                    {ASSET.trafficControl ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-red-600 bg-red-50 px-2.5 py-1 rounded-lg">
                        <AlertTriangle className="w-3 h-3" />Required — TCP must be in place before works
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-lg">
                        <CheckCircle2 className="w-3 h-3" />Not required
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <div className="border-t" />

            <section>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">Location</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <div>
                  <p className="text-[9px] text-gray-400 uppercase tracking-wide">Latitude</p>
                  <p className="text-[12px] font-semibold text-gray-800 mt-0.5 font-mono">{ASSET.lat.toFixed(4)}</p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-400 uppercase tracking-wide">Longitude</p>
                  <p className="text-[12px] font-semibold text-gray-800 mt-0.5 font-mono">{ASSET.lng.toFixed(4)}</p>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ── Work History ── */}
        {tab === "history" && (
          <div className="divide-y divide-gray-50">
            {WORK_HISTORY.map((r, i) => {
              const over     = r.actualMins > r.allocatedMins;
              const variance = Math.abs(r.actualMins - r.allocatedMins);
              return (
                <div key={i} className="px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: NAVY }}>
                        {r.initials}
                      </div>
                      <div>
                        <p className="text-[12px] font-semibold text-gray-800">{r.date}</p>
                        <p className="text-[10px] text-gray-400">{r.worker}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-[11px] font-bold ${over ? "text-red-500" : "text-green-600"}`}>
                        {over ? `+${variance}` : `-${variance}`} min
                      </p>
                      <p className="text-[10px] text-gray-400">{r.actualMins} / {r.allocatedMins} min</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mb-1.5">
                    <span className="text-[10px] text-gray-500">Tasks: <strong className="text-gray-700">{r.tasksComplete}</strong></span>
                    {r.pestPlants && (
                      <span className="flex items-center gap-0.5 text-[10px] text-red-500 font-medium">
                        <Leaf className="w-2.5 h-2.5" />{r.pestPlants}
                      </span>
                    )}
                  </div>
                  {r.notes && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 leading-relaxed">{r.notes}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Audits ── */}
        {tab === "audits" && (
          <div className="divide-y divide-gray-50">
            {ASSET_AUDITS.map((a, i) => {
              const cfg = a.result === "pass"
                ? { bg: "#dcfce7", text: "#16a34a", label: "Pass" }
                : a.result === "fail"
                ? { bg: "#fee2e2", text: "#dc2626", label: "Fail" }
                : { bg: "#fef3c7", text: "#92400e", label: "Partial" };
              return (
                <div key={i} className="px-5 py-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <p className="text-[12px] font-semibold text-gray-800">{a.date}</p>
                      <p className="text-[10px] text-gray-400">{a.type} · {a.auditor}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-bold text-gray-700">{a.score}%</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.text }}>{cfg.label}</span>
                    </div>
                  </div>
                  {a.flags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {a.flags.map(f => (
                        <span key={f} className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600">{f}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t bg-gray-50 flex gap-2 flex-shrink-0">
        <button className="flex-1 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-white transition-colors flex items-center justify-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5" />View Schedule
        </button>
        <button className="flex-1 py-2 rounded-xl text-xs font-semibold text-white transition-opacity hover:opacity-90 flex items-center justify-center gap-1.5"
          style={{ background: BRAND }}>
          <ClipboardCheck className="w-3.5 h-3.5" />New Audit
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function AssetDetailView() {
  const [panelOpen, setPanelOpen] = useState(true);

  return (
    <div className="flex min-h-screen bg-[#f5f7f9] font-sans relative overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-auto relative">
        {/* Header */}
        <header className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Garden Assets</h1>
            <p className="text-xs text-gray-400">8 assets across Porirua City</p>
          </div>
          <button className="text-sm px-4 py-2 rounded-lg text-white font-semibold" style={{ background: BRAND }}>
            + New Asset
          </button>
        </header>

        {/* Table — dimmed to show panel takes focus */}
        <div className="px-8 py-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input placeholder="Search assets…" className="pl-9 w-full px-3 py-2 border rounded-xl text-sm outline-none" />
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm overflow-hidden" style={{ opacity: panelOpen ? 0.45 : 1, transition: "opacity 0.2s" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  {["ID","Site Name","Type","Standard","Area","Service","Frequency","Next Due","Compliance","Team",""].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ALL_ASSETS.map(row => {
                  const comp = COMPLIANCE_CONFIG[row.compliance];
                  const isSelected = row.id === ASSET.id;
                  return (
                    <tr key={row.id}
                      onClick={() => setPanelOpen(true)}
                      className={`border-b cursor-pointer transition-colors ${
                        isSelected ? "bg-[#00AECD]/5 border-l-2 border-l-[#00AECD]" : "hover:bg-gray-50"
                      }`}>
                      <td className="px-4 py-3 font-mono text-[10px] text-gray-400">{row.id}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{row.site}</td>
                      <td className="px-4 py-3">
                        <Badge className={`text-[10px] ${TYPE_COLORS[row.type]} border-0`}>{row.type}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`text-[10px] ${STANDARD_COLORS[row.standard]} border-0`}>{row.standard}</Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">—</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">—</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{row.freq}</td>
                      <td className="px-4 py-3 text-xs font-medium" style={{ color: BRAND }}>—</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: comp.bg, color: comp.text }}>
                          {comp.icon}{comp.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{row.team}</td>
                      <td className="px-4 py-3">
                        <button className="text-gray-400 hover:text-gray-600"><Eye className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Scrim when panel open */}
        {panelOpen && (
          <div className="absolute inset-0 z-10 bg-black/10" onClick={() => setPanelOpen(false)} />
        )}
      </main>

      {/* Detail panel */}
      {panelOpen && <AssetDetailPanel onClose={() => setPanelOpen(false)} />}
    </div>
  );
}
