import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Search, LayoutGrid, List, Leaf, ClipboardCheck, LayoutDashboard,
  CalendarDays, Eye, Clock, MapPin, ClipboardList, Sprout, Layers, FileSpreadsheet, BarChart2,
  X, CheckCircle2, AlertTriangle, History, ShieldAlert, ClipboardX
} from "lucide-react";

const BRAND = "#00AECD";
const NAVY  = "#0f2a36";

function Sidebar({ active }: { active: string }) {
  const nav = [
    { icon: LayoutDashboard, label: "Dashboard" },
    { icon: List,            label: "Asset Register", id: "list" },
    { icon: CalendarDays,    label: "Schedule" },
    { icon: ClipboardCheck,  label: "Audits",          id: "audits" },
    { icon: Sprout,          label: "Infill Planting",  id: "planting" },
    { icon: Layers,          label: "Mulching",         id: "mulching" },
    { icon: FileSpreadsheet, label: "Specification",   id: "spec" },
    { icon: BarChart2,       label: "Reports",         id: "reports" },
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
            <div key={label} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${isActive ? "text-white" : "text-white/60 hover:text-white hover:bg-white/10"}`}
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
  date: string;
  worker: string;
  initials: string;
  allocatedMins: number;
  actualMins: number;
  tasksComplete: string;
  notes: string;
  pestPlants: string;
}

interface AuditRecord {
  date: string;
  auditor: string;
  type: string;
  score: number;
  result: "pass" | "fail" | "partial";
  flags: string[];
}

const WORK_HISTORY: WorkRecord[] = [
  { date: "18 Mar 2026", worker: "Barry Lavakula",    initials: "BL", allocatedMins: 90,  actualMins: 88,  tasksComplete: "8/8", notes: "",                                            pestPlants: "" },
  { date: "4 Mar 2026",  worker: "Barry Lavakula",    initials: "BL", allocatedMins: 90,  actualMins: 97,  tasksComplete: "7/8", notes: "Mulch depth incomplete — supply not available. Rescheduled.", pestPlants: "" },
  { date: "18 Feb 2026", worker: "Felise Maiava",     initials: "FM", allocatedMins: 90,  actualMins: 85,  tasksComplete: "8/8", notes: "",                                            pestPlants: "Tradescantia (NE corner)" },
  { date: "4 Feb 2026",  worker: "Barry Lavakula",    initials: "BL", allocatedMins: 90,  actualMins: 91,  tasksComplete: "8/8", notes: "",                                            pestPlants: "" },
  { date: "21 Jan 2026", worker: "Joe Daish",         initials: "JD", allocatedMins: 90,  actualMins: 103, tasksComplete: "6/8", notes: "Access restricted — event on site. Pruning and edging deferred.", pestPlants: "" },
];

const ASSET_AUDITS: AuditRecord[] = [
  { date: "24 Mar 2026", auditor: "Jude Morison",    type: "Completed Works", score: 91, result: "pass",    flags: [] },
  { date: "3 Feb 2026",  auditor: "Tim Broadwith",   type: "Outcomes Based",  score: 79, result: "partial", flags: ["Weed cover marginal — 6%"] },
  { date: "12 Jan 2026", auditor: "Daniela Biaggio", type: "Completed Works", score: 88, result: "pass",    flags: [] },
];

const SAMPLE_DATA = [
  { id: "GRD-2024-0847", site: "Aotea Lagoon Reserve",   type: "Ornamental",        standard: "High",   area: 142,  serviceTime: 90,  freq: "Fortnightly", nextDue: "18 Mar 2026", team: "Mobile 2", compliance: "in-spec"       as ComplianceStatus, suburb: "Aotea",        ward: "Western",  locationType: "Parkgarden",   plantCoverage: 97, trafficControl: false },
  { id: "GRD-2024-0212", site: "Cobham Court",           type: "Roses & Perennials", standard: "High",  area: 68,   serviceTime: 120, freq: "Weekly",       nextDue: "14 Mar 2026", team: "Mobile 1", compliance: "audit-due"     as ComplianceStatus, suburb: "Papakowhai",  ward: "Northern", locationType: "Parkgarden",   plantCoverage: 95, trafficControl: false },
  { id: "GRD-2024-0391", site: "Titahi Bay Esplanade",   type: "Annuals",            standard: "High",  area: 95,   serviceTime: 75,  freq: "Fortnightly", nextDue: "20 Mar 2026", team: "Mobile 2", compliance: "in-spec"       as ComplianceStatus, suburb: "Titahi Bay",  ward: "Western",  locationType: "Streetgarden", plantCoverage: 93, trafficControl: true  },
  { id: "GRD-2024-0558", site: "Kenepuru Landing",       type: "Reveg",              standard: "Medium",area: 520,  serviceTime: 45,  freq: "Monthly",      nextDue: "01 Apr 2026", team: "CBD",      compliance: "non-compliant" as ComplianceStatus, suburb: "Kenepuru",    ward: "Northern", locationType: "Parkgarden",   plantCoverage: 82, trafficControl: false },
  { id: "GRD-2024-0629", site: "Paremata Station",       type: "Bush",               standard: "Low",   area: 1240, serviceTime: 30,  freq: "Bimonthly",    nextDue: "Sep 2026",    team: "CBD",      compliance: "in-spec"       as ComplianceStatus, suburb: "Paremata",    ward: "Northern", locationType: "Parkgarden",   plantCoverage: 88, trafficControl: false },
  { id: "GRD-2024-0714", site: "Elsdon Reserve",         type: "Ornamental",         standard: "High",  area: 203,  serviceTime: 60,  freq: "Monthly",      nextDue: "5 Apr 2026",  team: "Mobile 2", compliance: "overdue"       as ComplianceStatus, suburb: "Elsdon",       ward: "Eastern",  locationType: "Parkgarden",   plantCoverage: 91, trafficControl: false },
  { id: "GRD-2024-0801", site: "Mungavin Ave Berm",      type: "Annuals",            standard: "High",  area: 48,   serviceTime: 45,  freq: "Fortnightly", nextDue: "18 Mar 2026", team: "Mobile 1", compliance: "in-spec"       as ComplianceStatus, suburb: "Porirua East", ward: "Eastern",  locationType: "Streetgarden", plantCoverage: 96, trafficControl: true  },
  { id: "GRD-2024-0022", site: "Waitangirua Mall Entry", type: "Roses & Perennials", standard: "High",  area: 32,   serviceTime: 120, freq: "Weekly",       nextDue: "13 Mar 2026", team: "Mobile 1", compliance: "in-spec"       as ComplianceStatus, suburb: "Waitangirua", ward: "Eastern",  locationType: "Streetgarden", plantCoverage: 98, trafficControl: true  },
];

type Asset = typeof SAMPLE_DATA[0];

function ComplianceBadge({ status }: { status: ComplianceStatus }) {
  const c = COMPLIANCE_CONFIG[status];
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: c.bg, color: c.text }}>
      {c.icon}{c.label}
    </span>
  );
}

function AssetDetailPanel({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const [tab, setTab] = useState<"history" | "audits">("history");
  const comp = COMPLIANCE_CONFIG[asset.compliance];

  return (
    <div className="fixed inset-y-0 right-0 w-[400px] bg-white shadow-2xl border-l border-gray-200 flex flex-col z-40 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b flex items-start justify-between flex-shrink-0" style={{ background: NAVY }}>
        <div>
          <h2 className="text-sm font-bold text-white">{asset.site}</h2>
          <p className="text-[10px] text-white/40 font-mono mt-0.5">{asset.id}</p>
          <div className="flex gap-1.5 mt-2">
            <Badge className={`text-[10px] border-0 ${TYPE_COLORS[asset.type]}`}>{asset.type}</Badge>
            <Badge className={`text-[10px] border-0 ${STANDARD_COLORS[asset.standard]}`}>{asset.standard}</Badge>
            <Badge className="text-[10px] border-0 bg-white/10 text-white/70">{asset.team}</Badge>
          </div>
        </div>
        <button onClick={onClose} className="text-white/40 hover:text-white mt-0.5">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Compliance status strip */}
      <div className="px-5 py-2.5 flex items-center gap-2 flex-shrink-0 border-b" style={{ background: comp.bg }}>
        <span style={{ color: comp.text }}>{comp.icon}</span>
        <span className="text-[11px] font-bold" style={{ color: comp.text }}>{comp.label}</span>
        {asset.compliance === "non-compliant" && (
          <span className="text-[10px] ml-auto font-medium" style={{ color: comp.text }}>Kenepuru Landing — audit failed 12 Mar</span>
        )}
        {asset.compliance === "overdue" && (
          <span className="text-[10px] ml-auto font-medium" style={{ color: comp.text }}>3 days overdue</span>
        )}
        {asset.compliance === "audit-due" && (
          <span className="text-[10px] ml-auto font-medium" style={{ color: comp.text }}>Last audit 42 days ago</span>
        )}
      </div>

      {/* Asset quick stats — row 1 */}
      <div className="grid grid-cols-4 gap-0 border-b flex-shrink-0">
        {[
          { label: "Area",      value: `${asset.area} m²` },
          { label: "Service",   value: `${asset.serviceTime} min` },
          { label: "Frequency", value: asset.freq },
          { label: "Next Due",  value: asset.nextDue.replace(" 2026", "") },
        ].map(({ label, value }) => (
          <div key={label} className="px-3 py-3 text-center border-r last:border-r-0">
            <p className="text-[9px] text-gray-400 uppercase tracking-wide">{label}</p>
            <p className="text-[11px] font-semibold text-gray-800 mt-0.5 leading-tight">{value}</p>
          </div>
        ))}
      </div>
      {/* Asset quick stats — row 2 */}
      <div className="grid grid-cols-4 gap-0 border-b flex-shrink-0">
        <div className="px-3 py-3 text-center border-r">
          <p className="text-[9px] text-gray-400 uppercase tracking-wide">Ward</p>
          <p className="text-[11px] font-semibold text-gray-800 mt-0.5 leading-tight">{asset.ward}</p>
        </div>
        <div className="px-3 py-3 text-center border-r">
          <p className="text-[9px] text-gray-400 uppercase tracking-wide">Loc. Type</p>
          <p className="text-[11px] font-semibold text-gray-800 mt-0.5 leading-tight">{asset.locationType}</p>
        </div>
        <div className="px-3 py-3 text-center border-r">
          <p className="text-[9px] text-gray-400 uppercase tracking-wide">Coverage</p>
          <p className="text-[11px] font-semibold text-gray-800 mt-0.5 leading-tight">{asset.plantCoverage}%</p>
        </div>
        <div className="px-3 py-3 text-center">
          <p className="text-[9px] text-gray-400 uppercase tracking-wide">Traffic Ctrl</p>
          <p className={`text-[11px] font-bold mt-0.5 leading-tight ${asset.trafficControl ? "text-red-600" : "text-green-600"}`}>
            {asset.trafficControl ? "Required" : "Not req."}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b px-5 flex-shrink-0 bg-gray-50">
        {[
          { id: "history", icon: History,      label: "Work History" },
          { id: "audits",  icon: ClipboardX,   label: "Audit History" },
        ].map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setTab(id as "history" | "audits")}
            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${
              tab === id ? "border-[#00AECD] text-[#00AECD]" : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "history" && (
          <div className="divide-y divide-gray-50">
            {WORK_HISTORY.map((r, i) => {
              const over    = r.actualMins > r.allocatedMins;
              const variance = Math.abs(r.actualMins - r.allocatedMins);
              return (
                <div key={i} className="px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ background: NAVY }}>
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

      {/* Footer actions */}
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

function TileCard({ row, onSelect }: { row: Asset; onSelect: () => void }) {
  return (
    <Card className="rounded-2xl border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={onSelect}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-semibold text-gray-900 text-sm">{row.site}</p>
            <p className="text-[10px] text-gray-400 font-mono mt-0.5">{row.id}</p>
          </div>
          <button className="text-gray-400 hover:text-gray-600"><Eye className="w-4 h-4" /></button>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          <Badge className={`text-[10px] ${TYPE_COLORS[row.type]} border-0`}>{row.type}</Badge>
          <Badge className={`text-[10px] ${STANDARD_COLORS[row.standard]} border-0`}>{row.standard}</Badge>
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Area</span><span className="font-medium">{row.area} m²</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Service</span><span className="font-medium">{row.serviceTime} min · {row.freq}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Next due</span>
            <span className="font-medium" style={{ color: BRAND }}>{row.nextDue}</span>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t flex items-center justify-between">
          <Badge className="bg-gray-100 text-gray-600 border-0 text-[10px]">{row.team}</Badge>
          <ComplianceBadge status={row.compliance} />
        </div>
      </CardContent>
    </Card>
  );
}

export function AssetList() {
  const [view,     setView]     = useState<"table" | "tile">("table");
  const [selected, setSelected] = useState<string | null>(null);
  const selectedAsset = SAMPLE_DATA.find(d => d.id === selected) ?? null;

  const nonCompliant = SAMPLE_DATA.filter(d => d.compliance === "non-compliant" || d.compliance === "overdue").length;

  return (
    <div className="flex min-h-screen bg-[#f5f7f9] font-sans">
      <Sidebar active="list" />
      <main className="flex-1 overflow-auto">
        <header className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Garden Assets</h1>
            <p className="text-xs text-gray-400">{SAMPLE_DATA.length} assets across Porirua City</p>
          </div>
          <Button size="sm" style={{ background: BRAND }} className="text-white hover:opacity-90">
            + New Asset
          </Button>
        </header>

        <div className="px-8 py-5">
          {/* Filters row */}
          <div className="flex items-center gap-3 mb-5">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input placeholder="Search assets…" className="pl-9 rounded-xl text-sm" />
            </div>
            <Select defaultValue="all-types">
              <SelectTrigger className="w-40 rounded-xl text-sm"><SelectValue placeholder="Garden Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all-types">All Types</SelectItem>
                {["Annuals","Roses & Perennials","Ornamental","Amenity","Rain Garden","Reveg","Bush","Tree Planter/Pits","Hedge"].map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select defaultValue="all-wards">
              <SelectTrigger className="w-36 rounded-xl text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all-wards">All Wards</SelectItem>
                {["Eastern", "Northern", "Western"].map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select defaultValue="all-compliance">
              <SelectTrigger className="w-44 rounded-xl text-sm"><SelectValue placeholder="Compliance" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all-compliance">All Compliance</SelectItem>
                <SelectItem value="in-spec">In Spec</SelectItem>
                <SelectItem value="audit-due">Audit Due</SelectItem>
                <SelectItem value="non-compliant">Non-Compliant</SelectItem>
                <SelectItem value="overdue">Visit Overdue</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="all-teams">
              <SelectTrigger className="w-36 rounded-xl text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all-teams">All Teams</SelectItem>
                {["CBD", "Mobile 1", "Mobile 2", "Specialist"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="ml-auto flex border rounded-xl overflow-hidden">
              <button onClick={() => setView("table")} className={`px-3 py-2 ${view === "table" ? "text-white" : "bg-white text-gray-400"}`} style={view === "table" ? { background: BRAND } : {}}>
                <List className="w-4 h-4" />
              </button>
              <button onClick={() => setView("tile")} className={`px-3 py-2 ${view === "tile" ? "text-white" : "bg-white text-gray-400"}`} style={view === "tile" ? { background: BRAND } : {}}>
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Summary chips */}
          <div className="flex gap-2 mb-4">
            {[
              { label: "8 Total",           color: "bg-gray-100 text-gray-700" },
              { label: "2 Due This Week",   color: "bg-amber-100 text-amber-700" },
              { label: "3 Teams Active",    color: "bg-teal-100 text-teal-700" },
              { label: `${nonCompliant} Need Attention`, color: nonCompliant > 0 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500" },
            ].map(c => (
              <span key={c.label} className={`text-xs px-3 py-1 rounded-full font-medium ${c.color}`}>{c.label}</span>
            ))}
          </div>

          {view === "table" ? (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    {["ID", "Site Name", "Type", "Standard", "Area", "Service", "Frequency", "Next Due", "Compliance", "Team", ""].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SAMPLE_DATA.map(row => (
                    <tr
                      key={row.id}
                      onClick={() => setSelected(selected === row.id ? null : row.id)}
                      className={`border-b cursor-pointer transition-colors ${selected === row.id ? "bg-[#00AECD]/5 border-l-2 border-l-[#00AECD]" : "hover:bg-gray-50"}`}
                    >
                      <td className="px-4 py-3 font-mono text-[10px] text-gray-400">{row.id}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{row.site}</td>
                      <td className="px-4 py-3"><Badge className={`text-[10px] ${TYPE_COLORS[row.type]} border-0`}>{row.type}</Badge></td>
                      <td className="px-4 py-3"><Badge className={`text-[10px] ${STANDARD_COLORS[row.standard]} border-0`}>{row.standard}</Badge></td>
                      <td className="px-4 py-3 text-gray-600">{row.area} m²</td>
                      <td className="px-4 py-3 text-gray-600">{row.serviceTime} min</td>
                      <td className="px-4 py-3 text-gray-600">{row.freq}</td>
                      <td className="px-4 py-3 font-medium text-xs" style={{ color: BRAND }}>{row.nextDue}</td>
                      <td className="px-4 py-3"><ComplianceBadge status={row.compliance} /></td>
                      <td className="px-4 py-3 text-xs text-gray-500">{row.team}</td>
                      <td className="px-4 py-3">
                        <button className="text-gray-400 hover:text-gray-600"><Eye className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {SAMPLE_DATA.map(row => (
                <TileCard key={row.id} row={row} onSelect={() => setSelected(selected === row.id ? null : row.id)} />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Detail panel */}
      {selectedAsset && (
        <>
          <div className="fixed inset-0 z-30 bg-black/10" onClick={() => setSelected(null)} />
          <AssetDetailPanel asset={selectedAsset} onClose={() => setSelected(null)} />
        </>
      )}
    </div>
  );
}
