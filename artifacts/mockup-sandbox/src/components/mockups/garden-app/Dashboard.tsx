import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Leaf, ClipboardList, LayoutDashboard, CalendarDays, List,
  Users, TrendingUp, AlertCircle, CheckCircle, MapPin, Clock
} from "lucide-react";

const BRAND = "#00AECD";

function Sidebar({ active }: { active: string }) {
  const nav = [
    { icon: LayoutDashboard, label: "Dashboard", id: "dashboard" },
    { icon: ClipboardList, label: "Data Collection" },
    { icon: List, label: "Asset List" },
    { icon: CalendarDays, label: "Maintenance" },
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
            <p className="text-white/40 text-[10px]">Parks Manager</p>
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

const MAP_PINS = [
  { id: "GRD-0847", site: "Aotea Lagoon Reserve", type: "Shrub Bed", los: 2, x: 38, y: 45 },
  { id: "GRD-0212", site: "Cobham Court", type: "Rose", los: 1, x: 55, y: 30 },
  { id: "GRD-0391", site: "Titahi Bay Esplanade", type: "Annual Bedding", los: 2, x: 20, y: 22 },
  { id: "GRD-0558", site: "Kenepuru Landing", type: "Revegetation", los: 4, x: 65, y: 55 },
  { id: "GRD-0629", site: "Paremata Station", type: "Bush", los: 5, x: 72, y: 35 },
  { id: "GRD-0714", site: "Elsdon Reserve", type: "Shrub Bed", los: 3, x: 45, y: 62 },
  { id: "GRD-0801", site: "Mungavin Ave", type: "Annual Bedding", los: 2, x: 50, y: 48 },
  { id: "GRD-0022", site: "Waitangirua Mall", type: "Rose", los: 1, x: 30, y: 38 },
];

function MapMockup() {
  const [hovered, setHovered] = useState<string | null>(null);
  const pin = hovered ? MAP_PINS.find(p => p.id === hovered) : null;

  return (
    <div className="relative w-full h-full overflow-hidden rounded-xl" style={{ background: "#e8f0e8" }}>
      {/* Map background grid */}
      <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#888" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Simulated roads */}
      <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <path d="M 0 40% Q 40% 35% 100% 45%" fill="none" stroke="white" strokeWidth="6" opacity="0.7"/>
        <path d="M 30% 0 Q 45% 50% 35% 100%" fill="none" stroke="white" strokeWidth="5" opacity="0.7"/>
        <path d="M 0 65% Q 55% 60% 100% 70%" fill="none" stroke="white" strokeWidth="4" opacity="0.6"/>
        <path d="M 60% 0 Q 65% 40% 70% 100%" fill="none" stroke="white" strokeWidth="4" opacity="0.6"/>
        <rect x="10%" y="20%" width="18%" height="12%" rx="4" fill="#c8d8c8" opacity="0.5"/>
        <rect x="50%" y="55%" width="22%" height="14%" rx="4" fill="#c8d8c8" opacity="0.5"/>
        <rect x="35%" y="25%" width="15%" height="10%" rx="4" fill="#d0dcd0" opacity="0.4"/>
        <path d="M 5% 80% Q 50% 75% 95% 82%" fill="none" stroke="#4a90a4" strokeWidth="8" opacity="0.3"/>
      </svg>

      {/* Map pins */}
      {MAP_PINS.map(pin => (
        <div
          key={pin.id}
          className="absolute cursor-pointer transition-transform hover:scale-125 z-10"
          style={{ left: `${pin.x}%`, top: `${pin.y}%`, transform: "translate(-50%, -100%)" }}
          onMouseEnter={() => setHovered(pin.id)}
          onMouseLeave={() => setHovered(null)}
        >
          <div
            className="w-7 h-7 rounded-full border-2 border-white shadow-lg flex items-center justify-center"
            style={{ background: TYPE_COLORS[pin.type] }}
          >
            <span className="text-white text-[9px] font-bold">{pin.los}</span>
          </div>
          <div className="w-0.5 h-2 mx-auto" style={{ background: TYPE_COLORS[pin.type] }} />
        </div>
      ))}

      {/* Hover tooltip */}
      {hovered && pin && (
        <div
          className="absolute z-20 bg-white rounded-xl shadow-xl p-3 w-48 pointer-events-none"
          style={{ left: `${MAP_PINS.find(p => p.id === hovered)!.x}%`, top: `${MAP_PINS.find(p => p.id === hovered)!.y - 12}%`, transform: "translate(-50%, -100%)" }}
        >
          <p className="font-semibold text-xs text-gray-900">{pin.site}</p>
          <p className="text-[10px] text-gray-400 font-mono mb-2">{pin.id}</p>
          <div className="flex gap-1.5">
            <Badge className="text-[9px] border-0" style={{ background: TYPE_COLORS[pin.type] + "20", color: TYPE_COLORS[pin.type] }}>{pin.type}</Badge>
            <Badge className="text-[9px] bg-gray-100 text-gray-600 border-0">LOS {pin.los}</Badge>
          </div>
        </div>
      )}

      {/* Map legend */}
      <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur rounded-xl p-3 shadow">
        <p className="text-[9px] font-semibold text-gray-600 mb-2 uppercase tracking-wide">Garden Type</p>
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5 mb-1">
            <div className="w-3 h-3 rounded-full border border-white shadow-sm" style={{ background: color }} />
            <span className="text-[9px] text-gray-600">{type}</span>
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
  { grade: 1, count: 2, label: "Premium", color: "#8b5cf6" },
  { grade: 2, count: 3, label: "High", color: BRAND },
  { grade: 3, count: 1, label: "Standard", color: "#10b981" },
  { grade: 4, count: 1, label: "Basic", color: "#f59e0b" },
  { grade: 5, count: 1, label: "Minimum", color: "#ef4444" },
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
            {/* Map */}
            <div className="col-span-2">
              <Card className="rounded-2xl border-0 shadow-sm h-72">
                <CardContent className="p-3 h-full">
                  <MapMockup />
                </CardContent>
              </Card>
            </div>

            {/* Right side */}
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
            {/* Due this week */}
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

            {/* Recent services */}
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
