import { useState } from "react";
import { ChevronDown, ChevronRight, Clock, CheckCircle2, AlertTriangle, XCircle, MapPin, Navigation } from "lucide-react";

const BRAND = "#00AECD";
const NAVY = "#0f2a36";

const TEAMS = [
  {
    id: "t1", name: "Tawa Crew", color: "#00AECD",
    jobs: [
      { id: 1, stop: 1, name: "Tawa Town Centre Gardens", ref: "TAW-001", status: "completed", mins: 90, dist: null, lat: -41.178, lng: 174.951 },
      { id: 2, stop: 2, name: "Redwood Reserve", ref: "RED-004", status: "completed", mins: 60, dist: "1.2km", lat: -41.183, lng: 174.955 },
      { id: 3, stop: 3, name: "Linden Village Green", ref: "LIN-002", status: "in_progress", mins: 75, dist: "0.9km", lat: -41.190, lng: 174.960 },
      { id: 4, stop: 4, name: "Takapu Rd Median Strip", ref: "TAK-007", status: "pending", mins: 45, dist: "2.1km", lat: -41.196, lng: 174.966 },
      { id: 5, stop: 5, name: "Linden Shops Planters", ref: "LIN-011", status: "pending", mins: 30, dist: "0.4km", lat: -41.199, lng: 174.963 },
    ],
  },
  {
    id: "t2", name: "Porirua Central", color: "#f59e0b",
    jobs: [
      { id: 6, stop: 1, name: "Cobham Court Roundabout", ref: "COB-001", status: "completed", mins: 45, dist: null, lat: -41.130, lng: 174.845 },
      { id: 7, stop: 2, name: "Porirua Station Plaza", ref: "POR-003", status: "pending", mins: 60, dist: "0.7km", lat: -41.133, lng: 174.850 },
      { id: 8, stop: 3, name: "Solway Ave Berms", ref: "SOL-002", status: "pending", mins: 50, dist: "1.4km", lat: -41.139, lng: 174.856 },
      { id: 9, stop: 4, name: "Mungavin Ave Gardens", ref: "MUN-005", status: "pending", mins: 70, dist: "0.8km", lat: -41.143, lng: 174.860 },
    ],
  },
  {
    id: "t3", name: "Whitby Team", color: "#8b5cf6",
    jobs: [
      { id: 10, stop: 1, name: "Whitby Town Square", ref: "WHI-001", status: "pending", mins: 80, dist: null, lat: -41.086, lng: 174.897 },
      { id: 11, stop: 2, name: "Awarua St Entrance", ref: "AWA-003", status: "pending", mins: 55, dist: "1.1km", lat: -41.090, lng: 174.904 },
      { id: 12, stop: 3, name: "Mana Esplanade Strip", ref: "MAN-007", status: "pending", mins: 40, dist: "2.8km", lat: -41.101, lng: 174.872 },
    ],
  },
];

function statusBadge(status: string) {
  if (status === "completed") return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold flex items-center gap-1"><CheckCircle2 className="w-2.5 h-2.5" />Done</span>;
  if (status === "in_progress") return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">In Progress</span>;
  return null;
}

function stopNumStyle(status: string, color: string) {
  if (status === "completed") return { background: "#d1fae5", color: "#059669", border: "1.5px solid #a7f3d0" };
  if (status === "in_progress") return { background: color + "22", color, border: `1.5px solid ${color}88` };
  return { background: "#f1f5f9", color: "#94a3b8", border: "1.5px solid #e2e8f0" };
}

export function RouteList() {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setCollapsed(s => ({ ...s, [id]: !s[id] }));

  return (
    <div className="min-h-screen bg-[#f5f7f9] font-sans">
      {/* Page header */}
      <div className="bg-white border-b px-6 py-3 flex items-center gap-3">
        <div>
          <p className="text-xs text-gray-400">Day View · Monday 26 May 2026</p>
          <p className="text-sm font-bold" style={{ color: NAVY }}>
            {TEAMS.reduce((s, t) => s + t.jobs.length, 0)} jobs across {TEAMS.length} teams — geo-sequenced routes
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-gray-400">
          <Navigation className="w-3.5 h-3.5" style={{ color: BRAND }} />
          <span style={{ color: BRAND }} className="font-semibold">Nearest-neighbour order</span>
        </div>
      </div>

      <div className="p-5 space-y-4 max-w-2xl">
        {TEAMS.map(team => {
          const isCollapsed = collapsed[team.id];
          const done = team.jobs.filter(j => j.status === "completed").length;
          const totalMins = team.jobs.reduce((s, j) => s + j.mins, 0);
          const progress = Math.round((done / team.jobs.length) * 100);

          return (
            <div key={team.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Team header — click to collapse */}
              <button
                onClick={() => toggle(team.id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: team.color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-800">{team.name}</span>
                    <span className="text-[11px] text-gray-400">{team.jobs.length} stops · {totalMins}m</span>
                    {done > 0 && <span className="text-[11px] font-semibold text-green-600">{done}/{team.jobs.length} done</span>}
                  </div>
                  {/* Progress bar */}
                  <div className="mt-1.5 h-1 rounded-full bg-gray-100 w-48">
                    <div className="h-1 rounded-full transition-all" style={{ width: `${progress}%`, background: team.color }} />
                  </div>
                </div>
                <div className="flex-shrink-0 text-gray-400">
                  {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {/* Route stops */}
              {!isCollapsed && (
                <div className="border-t border-gray-50 px-4 py-3 space-y-0">
                  {team.jobs.map((job, idx) => (
                    <div key={job.id}>
                      {/* Travel indicator between stops */}
                      {job.dist && (
                        <div className="flex items-center gap-2 py-1 pl-[22px]">
                          <div className="w-px h-4 bg-gray-200 mx-0.5" />
                          <span className="text-[10px] text-gray-400 flex items-center gap-1">
                            <MapPin className="w-2.5 h-2.5" />{job.dist} drive
                          </span>
                        </div>
                      )}
                      {/* Job row */}
                      <div
                        className={`flex items-center gap-3 py-2.5 px-2 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors ${
                          job.status === "completed" ? "opacity-55" : ""
                        }`}
                      >
                        {/* Stop number badge */}
                        <div
                          className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold"
                          style={stopNumStyle(job.status, team.color)}
                        >
                          {job.status === "completed" ? "✓" : job.stop}
                        </div>

                        {/* Site info */}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold truncate ${job.status === "completed" ? "line-through text-gray-400" : "text-gray-800"}`}>
                            {job.name}
                          </p>
                          <p className="text-[11px] text-gray-400 font-mono">{job.ref}</p>
                        </div>

                        {/* Right side */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {statusBadge(job.status)}
                          <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
                            <Clock className="w-3 h-3" />{job.mins}m
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
