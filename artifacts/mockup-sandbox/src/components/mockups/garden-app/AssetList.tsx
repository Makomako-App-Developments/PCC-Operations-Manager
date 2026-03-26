import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Search, LayoutGrid, List, Filter, Leaf, ClipboardList, LayoutDashboard,
  CalendarDays, ChevronUp, ChevronDown, Eye, Clock, MapPin, Pencil, ClipboardCheck, Sprout, FileSpreadsheet, BarChart2
} from "lucide-react";

const BRAND = "#00AECD";

function Sidebar({ active }: { active: string }) {
  const nav = [
    { icon: LayoutDashboard, label: "Dashboard" },
    { icon: List, label: "Asset Register", id: "list" },
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

const TYPE_COLORS: Record<string, string> = {
  "Rose": "bg-pink-100 text-pink-700",
  "Annual Bedding": "bg-yellow-100 text-yellow-700",
  "Shrub Bed": "bg-emerald-100 text-emerald-700",
  "Revegetation": "bg-lime-100 text-lime-700",
  "Bush": "bg-green-100 text-green-700",
};

const LOS_COLORS: Record<number, string> = {
  1: "bg-purple-100 text-purple-700",
  2: "bg-blue-100 text-blue-700",
  3: "bg-teal-100 text-teal-700",
  4: "bg-orange-100 text-orange-700",
  5: "bg-red-100 text-red-700",
};

const CONDITION_COLORS: Record<number, string> = {
  1: "text-green-600",
  2: "text-lime-600",
  3: "text-yellow-600",
  4: "text-orange-600",
  5: "text-red-600",
};

const SAMPLE_DATA = [
  { id: "GRD-2024-0847", site: "Aotea Lagoon Reserve", type: "Shrub Bed", los: 2, area: 142, serviceTime: 90, freq: "Fortnightly", nextDue: "18 Mar 2026", condition: 2, team: "Team A" },
  { id: "GRD-2024-0212", site: "Cobham Court", type: "Rose", los: 1, area: 68, serviceTime: 120, freq: "Weekly", nextDue: "14 Mar 2026", condition: 1, team: "Team A" },
  { id: "GRD-2024-0391", site: "Titahi Bay Esplanade", type: "Annual Bedding", los: 2, area: 95, serviceTime: 75, freq: "Fortnightly", nextDue: "20 Mar 2026", condition: 3, team: "Team B" },
  { id: "GRD-2024-0558", site: "Kenepuru Landing", type: "Revegetation", los: 4, area: 520, serviceTime: 45, freq: "Monthly", nextDue: "01 Apr 2026", condition: 3, team: "Team C" },
  { id: "GRD-2024-0629", site: "Paremata Station", type: "Bush", los: 5, area: 1240, serviceTime: 30, freq: "6-Monthly", nextDue: "Sep 2026", condition: 4, team: "Team C" },
  { id: "GRD-2024-0714", site: "Elsdon Reserve", type: "Shrub Bed", los: 3, area: 203, serviceTime: 60, freq: "Monthly", nextDue: "5 Apr 2026", condition: 2, team: "Team B" },
  { id: "GRD-2024-0801", site: "Mungavin Ave Berm", type: "Annual Bedding", los: 2, area: 48, serviceTime: 45, freq: "Fortnightly", nextDue: "18 Mar 2026", condition: 2, team: "Team A" },
  { id: "GRD-2024-0022", site: "Waitangirua Mall Entry", type: "Rose", los: 1, area: 32, serviceTime: 120, freq: "Weekly", nextDue: "13 Mar 2026", condition: 1, team: "Team A" },
];

function TileCard({ row }: { row: typeof SAMPLE_DATA[0] }) {
  return (
    <Card className="rounded-2xl border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
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
          <Badge className={`text-[10px] ${LOS_COLORS[row.los]} border-0`}>LOS {row.los}</Badge>
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
          <span className={`text-xs font-semibold ${CONDITION_COLORS[row.condition]}`}>Condition {row.condition}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export function AssetList() {
  const [view, setView] = useState<"table" | "tile">("table");
  const [selected, setSelected] = useState<string | null>("GRD-2024-0847");

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
              <Input placeholder="Search assets…" className="pl-9 rounded-xl text-sm" defaultValue="" />
            </div>
            <Select defaultValue="all-types">
              <SelectTrigger className="w-40 rounded-xl text-sm">
                <SelectValue placeholder="Garden Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-types">All Types</SelectItem>
                {["Rose", "Annual Bedding", "Shrub Bed", "Revegetation", "Bush"].map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select defaultValue="all-los">
              <SelectTrigger className="w-36 rounded-xl text-sm">
                <SelectValue placeholder="LOS Grade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-los">All LOS</SelectItem>
                {[1,2,3,4,5].map(g => <SelectItem key={g} value={String(g)}>Grade {g}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select defaultValue="all-teams">
              <SelectTrigger className="w-36 rounded-xl text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-teams">All Teams</SelectItem>
                {["Team A", "Team B", "Team C"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
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
              { label: "8 Total", color: "bg-gray-100 text-gray-700" },
              { label: "2 Due This Week", color: "bg-amber-100 text-amber-700" },
              { label: "3 Teams Active", color: "bg-teal-100 text-teal-700" },
            ].map(c => (
              <span key={c.label} className={`text-xs px-3 py-1 rounded-full font-medium ${c.color}`}>{c.label}</span>
            ))}
          </div>

          {view === "table" ? (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    {["ID", "Site Name", "Type", "LOS", "Area", "Service Time", "Frequency", "Next Due", "Condition", "Team", ""].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SAMPLE_DATA.map(row => (
                    <tr
                      key={row.id}
                      onClick={() => setSelected(row.id)}
                      className={`border-b cursor-pointer transition-colors ${selected === row.id ? "bg-[#00AECD]/5 border-l-2 border-l-[#00AECD]" : "hover:bg-gray-50"}`}
                    >
                      <td className="px-4 py-3 font-mono text-[10px] text-gray-400">{row.id}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{row.site}</td>
                      <td className="px-4 py-3"><Badge className={`text-[10px] ${TYPE_COLORS[row.type]} border-0`}>{row.type}</Badge></td>
                      <td className="px-4 py-3"><Badge className={`text-[10px] ${LOS_COLORS[row.los]} border-0`}>Grade {row.los}</Badge></td>
                      <td className="px-4 py-3 text-gray-600">{row.area} m²</td>
                      <td className="px-4 py-3 text-gray-600">{row.serviceTime} min</td>
                      <td className="px-4 py-3 text-gray-600">{row.freq}</td>
                      <td className="px-4 py-3 text-[#00AECD] font-medium text-xs">{row.nextDue}</td>
                      <td className="px-4 py-3"><span className={`font-semibold ${CONDITION_COLORS[row.condition]}`}>{row.condition}/5</span></td>
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
              {SAMPLE_DATA.map(row => <TileCard key={row.id} row={row} />)}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
