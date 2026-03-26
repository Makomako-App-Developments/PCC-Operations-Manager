import { useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Leaf, ClipboardList, LayoutDashboard, CalendarDays, List,
  Users, TrendingUp, AlertCircle, CheckCircle, Clock, ClipboardCheck, Sprout, FileSpreadsheet
} from "lucide-react";

const BRAND = "#00AECD";

function Sidebar({ active }: { active: string }) {
  const nav = [
    { icon: LayoutDashboard, label: "Dashboard", id: "dashboard" },
    { icon: ClipboardList, label: "Data Collection" },
    { icon: List, label: "Asset Register" },
    { icon: CalendarDays, label: "Schedule" },
    { icon: ClipboardCheck, label: "Audits", id: "audits" },
    { icon: Sprout, label: "Infill Planting", id: "planting" },
    { icon: FileSpreadsheet, label: "Specification", id: "spec" },
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
  "Rose": "#ec4899",
  "Annual Bedding": "#f59e0b",
  "Shrub Bed": "#10b981",
  "Revegetation": "#84cc16",
  "Bush": "#16a34a",
};

// Real Porirua City coordinates
const MAP_PINS = [
  { id: "GRD-0847", site: "Aotea Lagoon Reserve", type: "Shrub Bed", los: 2, area: 142, lat: -41.0987, lng: 174.8756 },
  { id: "GRD-0212", site: "Cobham Court", type: "Rose", los: 1, area: 68, lat: -41.1281, lng: 174.8523 },
  { id: "GRD-0391", site: "Titahi Bay Esplanade", type: "Annual Bedding", los: 2, area: 95, lat: -41.0956, lng: 174.8293 },
  { id: "GRD-0558", site: "Kenepuru Landing", type: "Revegetation", los: 4, area: 520, lat: -41.1378, lng: 174.8697 },
  { id: "GRD-0629", site: "Paremata Station", type: "Bush", los: 5, area: 1240, lat: -41.1089, lng: 174.8634 },
  { id: "GRD-0714", site: "Elsdon Reserve", type: "Shrub Bed", los: 3, area: 203, lat: -41.1456, lng: 174.8467 },
  { id: "GRD-0801", site: "Mungavin Ave Berm", type: "Annual Bedding", los: 2, area: 48, lat: -41.1367, lng: 174.8512 },
  { id: "GRD-0022", site: "Waitangirua Mall Entry", type: "Rose", los: 1, area: 32, lat: -41.1523, lng: 174.8389 },
];

function PoriruaMap() {
  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden">
      <MapContainer
        center={[-41.1280, 174.8520]}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={false}
        zoomControl={true}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        {MAP_PINS.map(pin => (
          <CircleMarker
            key={pin.id}
            center={[pin.lat, pin.lng]}
            radius={12}
            pathOptions={{
              fillColor: TYPE_COLORS[pin.type],
              fillOpacity: 0.9,
              color: "#fff",
              weight: 2,
            }}
          >
            <Tooltip permanent={false} direction="top" offset={[0, -12]}>
              <div style={{ minWidth: 160 }}>
                <p style={{ fontWeight: 700, fontSize: 12, margin: "0 0 2px" }}>{pin.site}</p>
                <p style={{ fontSize: 10, color: "#666", margin: "0 0 4px", fontFamily: "monospace" }}>{pin.id}</p>
                <div style={{ display: "flex", gap: 4 }}>
                  <span style={{ fontSize: 10, background: TYPE_COLORS[pin.type] + "22", color: TYPE_COLORS[pin.type], padding: "1px 6px", borderRadius: 99, fontWeight: 600 }}>{pin.type}</span>
                  <span style={{ fontSize: 10, background: "#f0f0f0", color: "#555", padding: "1px 6px", borderRadius: 99 }}>LOS {pin.los}</span>
                </div>
                <p style={{ fontSize: 10, color: "#888", margin: "4px 0 0" }}>{pin.area} m²</p>
              </div>
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* Legend overlay */}
      <div style={{
        position: "absolute", bottom: 12, left: 12, zIndex: 1000,
        background: "rgba(255,255,255,0.95)", borderRadius: 12, padding: "10px 12px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)"
      }}>
        <p style={{ fontSize: 9, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Garden Type</p>
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <div key={type} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, border: "1.5px solid white", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
            <span style={{ fontSize: 10, color: "#555" }}>{type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub, color }: { icon: any, label: string, value: string, sub: string, color: string }) {
  return (
    <Card className="rounded-2xl border-0 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
          </div>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: color + "15" }}>
            <Icon className="w-5 h-5" style={{ color }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const TYPE_COUNTS = [
  { type: "Shrub Bed", count: 3, pct: 37 },
  { type: "Rose", count: 2, pct: 25 },
  { type: "Annual Bedding", count: 2, pct: 25 },
  { type: "Revegetation", count: 1, pct: 13 },
];

const LOS_COUNTS = [
  { grade: 1, count: 2, color: "#8b5cf6" },
  { grade: 2, count: 3, color: BRAND },
  { grade: 3, count: 1, color: "#10b981" },
  { grade: 4, count: 1, color: "#f59e0b" },
  { grade: 5, count: 1, color: "#ef4444" },
];

const RECENT = [
  { site: "Cobham Court", type: "Rose", date: "Today 9:42am", team: "Team A" },
  { site: "Waitangirua Mall Entry", type: "Rose", date: "Today 8:15am", team: "Team A" },
  { site: "Aotea Lagoon Reserve", type: "Shrub Bed", date: "Yesterday 2:30pm", team: "Team B" },
];

const DUE_THIS_WEEK = [
  { site: "Cobham Court", nextDue: "13 Mar", type: "Rose", urgent: true },
  { site: "Waitangirua Mall Entry", nextDue: "13 Mar", type: "Rose", urgent: true },
  { site: "Titahi Bay Esplanade", nextDue: "20 Mar", type: "Annual Bedding", urgent: false },
];

export function Dashboard() {
  return (
    <div className="flex min-h-screen bg-[#f5f7f9] font-sans">
      <Sidebar active="dashboard" />
      <main className="flex-1 overflow-auto">
        <header className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>
            <p className="text-xs text-gray-400">Porirua City — Garden Asset Overview · Week of 12 Mar 2026</p>
          </div>
          <div className="flex gap-2">
            <Badge className="bg-amber-100 text-amber-700 border-0 text-xs px-3">2 Due Today</Badge>
            <Badge className="text-white border-0 text-xs px-3" style={{ background: BRAND }}>8 Total Assets</Badge>
          </div>
        </header>

        <div className="px-8 py-5 space-y-5">
          {/* Metric cards */}
          <div className="grid grid-cols-4 gap-4">
            <MetricCard icon={Leaf} label="Total Garden Assets" value="8" sub="Across 7 reserves" color={BRAND} />
            <MetricCard icon={AlertCircle} label="Due This Week" value="3" sub="2 urgent today" color="#f59e0b" />
            <MetricCard icon={Users} label="FTE Required" value="2.4" sub="Based on current LOS" color="#8b5cf6" />
            <MetricCard icon={TrendingUp} label="Avg Cost / m²" value="$4.80" sub="Per service visit" color="#10b981" />
          </div>

          {/* Map + side panels */}
          <div className="grid grid-cols-3 gap-5">
            <div className="col-span-2">
              <Card className="rounded-2xl border-0 shadow-sm overflow-hidden" style={{ height: 300 }}>
                <PoriruaMap />
              </Card>
            </div>

            <div className="space-y-4">
              {/* By Type */}
              <Card className="rounded-2xl border-0 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs font-semibold text-gray-700 mb-3">Gardens by Type</p>
                  <div className="space-y-2">
                    {TYPE_COUNTS.map(({ type, count, pct }) => (
                      <div key={type}>
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="text-gray-600">{type}</span>
                          <span className="text-gray-400">{count}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: TYPE_COLORS[type] }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* By LOS */}
              <Card className="rounded-2xl border-0 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs font-semibold text-gray-700 mb-3">Gardens by LOS</p>
                  <div className="flex items-end gap-1 h-14">
                    {LOS_COUNTS.map(({ grade, count, color }) => (
                      <div key={grade} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-[9px] text-gray-500">{count}</span>
                        <div className="w-full rounded-t" style={{ height: `${count * 14}px`, background: color }} />
                        <span className="text-[9px] text-gray-500">G{grade}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Bottom panels */}
          <div className="grid grid-cols-2 gap-5">
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5" style={{ color: BRAND }} /> Due for Service This Week
                </p>
                <div className="space-y-2">
                  {DUE_THIS_WEEK.map(d => (
                    <div key={d.site} className={`flex items-center justify-between p-2.5 rounded-xl ${d.urgent ? "bg-amber-50 border border-amber-200" : "bg-gray-50"}`}>
                      <div>
                        <p className="text-xs font-medium text-gray-900">{d.site}</p>
                        <p className="text-[10px] text-gray-500">{d.type}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {d.urgent && <Badge className="bg-amber-100 text-amber-700 border-0 text-[9px]">Urgent</Badge>}
                        <span className="text-xs font-medium" style={{ color: BRAND }}>{d.nextDue}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-green-500" /> Recently Completed Services
                </p>
                <div className="space-y-2">
                  {RECENT.map(r => (
                    <div key={r.site} className="flex items-center justify-between p-2.5 bg-green-50 border border-green-100 rounded-xl">
                      <div>
                        <p className="text-xs font-medium text-gray-900">{r.site}</p>
                        <p className="text-[10px] text-gray-500">{r.type} · {r.team}</p>
                      </div>
                      <span className="text-[10px] text-green-600 font-medium">{r.date}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
