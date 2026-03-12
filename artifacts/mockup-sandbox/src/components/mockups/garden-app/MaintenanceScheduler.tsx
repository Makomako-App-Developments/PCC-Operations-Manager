import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CalendarDays, ClipboardList, LayoutDashboard, List, Users, ChevronLeft, ChevronRight, CheckCircle2, ClipboardCheck, Sprout
} from "lucide-react";

const BRAND = "#00AECD";

function Sidebar({ active }: { active: string }) {
  const nav = [
    { icon: LayoutDashboard, label: "Dashboard" },
    { icon: ClipboardList, label: "Data Collection" },
    { icon: List, label: "Asset List" },
    { icon: CalendarDays, label: "Maintenance", id: "maintenance" },
    { icon: ClipboardCheck, label: "Internal Audits", id: "audits" },
    { icon: Sprout, label: "Infill Planting", id: "planting" },
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

const TEAM_COLORS: Record<string, string> = {
  "Team A": "#00AECD",
  "Team B": "#8b5cf6",
  "Team C": "#10b981",
};

interface ScheduleItem {
  id: string;
  site: string;
  type: string;
  los: number;
  runNo: number;
  serviceTime: number;
  freq: string;
  team: string;
  dates: string[];
  completed: number[];
}

const SCHEDULE: ScheduleItem[] = [
  { id: "GRD-0022", site: "Waitangirua Mall Entry", type: "Rose", los: 1, runNo: 1, serviceTime: 120, freq: "Weekly", team: "Team A", dates: ["13 Mar", "20 Mar", "27 Mar", "3 Apr", "10 Apr", "17 Apr"], completed: [0] },
  { id: "GRD-0212", site: "Cobham Court", type: "Rose", los: 1, runNo: 2, serviceTime: 120, freq: "Weekly", team: "Team A", dates: ["13 Mar", "20 Mar", "27 Mar", "3 Apr", "10 Apr", "17 Apr"], completed: [0] },
  { id: "GRD-0801", site: "Mungavin Ave Berm", type: "Annual Bedding", los: 2, runNo: 3, serviceTime: 45, freq: "Fortnightly", team: "Team A", dates: ["18 Mar", "1 Apr", "15 Apr", "29 Apr"], completed: [] },
  { id: "GRD-0847", site: "Aotea Lagoon Reserve", type: "Shrub Bed", los: 2, runNo: 4, serviceTime: 90, freq: "Fortnightly", team: "Team B", dates: ["18 Mar", "1 Apr", "15 Apr", "29 Apr"], completed: [] },
  { id: "GRD-0391", site: "Titahi Bay Esplanade", type: "Annual Bedding", los: 2, runNo: 5, serviceTime: 75, freq: "Fortnightly", team: "Team B", dates: ["20 Mar", "3 Apr", "17 Apr", "1 May"], completed: [] },
  { id: "GRD-0714", site: "Elsdon Reserve", type: "Shrub Bed", los: 3, runNo: 6, serviceTime: 60, freq: "Monthly", team: "Team B", dates: ["5 Apr", "5 May", "5 Jun"], completed: [] },
  { id: "GRD-0558", site: "Kenepuru Landing", type: "Revegetation", los: 4, runNo: 7, serviceTime: 45, freq: "Monthly", team: "Team C", dates: ["1 Apr", "1 May", "1 Jun"], completed: [] },
  { id: "GRD-0629", site: "Paremata Station", type: "Bush", los: 5, runNo: 8, serviceTime: 30, freq: "6-Monthly", team: "Team C", dates: ["Sep 2026"], completed: [] },
];

const MONTHS = ["Mar", "Apr", "May", "Jun", "Jul", "Aug"];

const TYPE_COLORS: Record<string, string> = {
  "Rose": "bg-pink-100 text-pink-700",
  "Annual Bedding": "bg-yellow-100 text-yellow-700",
  "Shrub Bed": "bg-emerald-100 text-emerald-700",
  "Revegetation": "bg-lime-100 text-lime-700",
  "Bush": "bg-green-100 text-green-700",
};

function TeamStats() {
  const stats = [
    { team: "Team A", assets: 3, totalMins: 7 * (120 + 120 + 45 / 2), fte: "1.0" },
    { team: "Team B", assets: 3, totalMins: 7 * (90 / 2 + 75 / 2 + 60 / 4), fte: "0.9" },
    { team: "Team C", assets: 2, totalMins: 4 * (45 + 30 / 4), fte: "0.5" },
  ];
  return (
    <div className="grid grid-cols-3 gap-3">
      {stats.map(s => (
        <Card key={s.team} className="rounded-xl border-0 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full" style={{ background: TEAM_COLORS[s.team] }} />
              <span className="text-xs font-semibold text-gray-700">{s.team}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>{s.assets} assets</span>
              <span className="font-bold text-gray-800">{s.fte} FTE</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function MaintenanceScheduler() {
  const [selectedTeam, setSelectedTeam] = useState("all");
  const [monthOffset, setMonthOffset] = useState(0);

  const visibleMonths = MONTHS.slice(monthOffset, monthOffset + 4);
  const filteredSchedule = selectedTeam === "all" ? SCHEDULE : SCHEDULE.filter(s => s.team === selectedTeam);

  return (
    <div className="flex min-h-screen bg-[#f5f7f9] font-sans">
      <Sidebar active="maintenance" />
      <main className="flex-1 overflow-auto">
        <header className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Maintenance Scheduler</h1>
            <p className="text-xs text-gray-400">2026 Service Programme — Porirua City Gardens</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm">Export Schedule</Button>
            <Button size="sm" style={{ background: BRAND }} className="text-white hover:opacity-90">
              Regenerate Schedule
            </Button>
          </div>
        </header>

        <div className="px-8 py-5 space-y-5">
          {/* Team summary */}
          <TeamStats />

          {/* Controls */}
          <div className="flex items-center gap-4">
            <Select value={selectedTeam} onValueChange={setSelectedTeam}>
              <SelectTrigger className="w-36 rounded-xl text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Teams</SelectItem>
                <SelectItem value="Team A">Team A</SelectItem>
                <SelectItem value="Team B">Team B</SelectItem>
                <SelectItem value="Team C">Team C</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => setMonthOffset(Math.max(0, monthOffset - 1))}
                className="p-1.5 rounded-lg bg-white shadow-sm border text-gray-500 hover:text-gray-800 disabled:opacity-30"
                disabled={monthOffset === 0}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600 font-medium">{visibleMonths[0]} – {visibleMonths[visibleMonths.length - 1]} 2026</span>
              <button
                onClick={() => setMonthOffset(Math.min(MONTHS.length - 4, monthOffset + 1))}
                className="p-1.5 rounded-lg bg-white shadow-sm border text-gray-500 hover:text-gray-800 disabled:opacity-30"
                disabled={monthOffset >= MONTHS.length - 4}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Schedule table */}
          <Card className="rounded-2xl border-0 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wide w-8">Run</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wide">Site</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wide">Type</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wide">LOS</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wide">Freq</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wide">Time</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wide">Team</th>
                    {visibleMonths.map(m => (
                      <th key={m} className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wide text-center">{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredSchedule.map((row, ri) => (
                    <tr key={row.id} className={`border-b ${ri % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                      <td className="px-4 py-3 text-center">
                        <span className="w-5 h-5 rounded-full text-[10px] font-bold text-white flex items-center justify-center" style={{ background: TEAM_COLORS[row.team] }}>
                          {row.runNo}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 text-xs">{row.site}</p>
                        <p className="text-[10px] text-gray-400 font-mono">{row.id}</p>
                      </td>
                      <td className="px-4 py-3"><Badge className={`text-[9px] border-0 ${TYPE_COLORS[row.type]}`}>{row.type}</Badge></td>
                      <td className="px-4 py-3 text-xs text-gray-600 font-semibold">LOS {row.los}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{row.freq}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{row.serviceTime}m</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ background: TEAM_COLORS[row.team] }} />
                          <Select defaultValue={row.team}>
                            <SelectTrigger className="h-6 text-[10px] w-20 border-0 bg-transparent p-0 shadow-none">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {["Team A", "Team B", "Team C"].map(t => (
                                <SelectItem key={t} value={t}>{t}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </td>
                      {visibleMonths.map(month => {
                        const serviceDates = row.dates.filter(d => d.includes(month));
                        const isCompleted = serviceDates.some((_, i) => row.completed.includes(i));
                        return (
                          <td key={month} className="px-2 py-3 text-center">
                            {serviceDates.length > 0 ? (
                              <div className="flex flex-col items-center gap-1">
                                {serviceDates.map((date, i) => (
                                  <div
                                    key={i}
                                    className={`text-[9px] px-2 py-1 rounded-lg font-medium ${
                                      row.completed.includes(i)
                                        ? "bg-green-100 text-green-700 line-through"
                                        : "text-white"
                                    }`}
                                    style={!row.completed.includes(i) ? { background: TEAM_COLORS[row.team] } : {}}
                                  >
                                    {date}
                                    {row.completed.includes(i) && <CheckCircle2 className="w-2.5 h-2.5 inline ml-0.5" />}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-200">–</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Footer summary */}
          <div className="flex items-center justify-between px-1">
            <p className="text-xs text-gray-400">Schedule auto-generated in geosequence order (Run 1 → 8) · Start date: 13 Mar 2026</p>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <div className="w-3 h-3 rounded" style={{ background: BRAND }} />
                Scheduled
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <div className="w-3 h-3 rounded bg-green-100 border border-green-300" />
                Completed
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
