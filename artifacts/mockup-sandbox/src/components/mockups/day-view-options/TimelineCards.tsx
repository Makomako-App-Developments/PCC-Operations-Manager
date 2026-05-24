import { useState } from "react";
import { ChevronDown, ChevronRight, Clock, CheckCircle2, MapPin, Navigation2, Circle } from "lucide-react";

const BRAND = "#00AECD";
const NAVY = "#0f2a36";

const TEAMS = [
  {
    id: "t1", name: "Tawa Crew", color: "#00AECD",
    jobs: [
      { id: 1, stop: 1, name: "Tawa Town Centre Gardens", ref: "TAW-001", status: "completed", mins: 90, dist: null },
      { id: 2, stop: 2, name: "Redwood Reserve", ref: "RED-004", status: "completed", mins: 60, dist: "1.2" },
      { id: 3, stop: 3, name: "Linden Village Green", ref: "LIN-002", status: "in_progress", mins: 75, dist: "0.9" },
      { id: 4, stop: 4, name: "Takapu Rd Median Strip", ref: "TAK-007", status: "pending", mins: 45, dist: "2.1" },
      { id: 5, stop: 5, name: "Linden Shops Planters", ref: "LIN-011", status: "pending", mins: 30, dist: "0.4" },
    ],
  },
  {
    id: "t2", name: "Porirua Central", color: "#f59e0b",
    jobs: [
      { id: 6, stop: 1, name: "Cobham Court Roundabout", ref: "COB-001", status: "completed", mins: 45, dist: null },
      { id: 7, stop: 2, name: "Porirua Station Plaza", ref: "POR-003", status: "pending", mins: 60, dist: "0.7" },
      { id: 8, stop: 3, name: "Solway Ave Berms", ref: "SOL-002", status: "pending", mins: 50, dist: "1.4" },
      { id: 9, stop: 4, name: "Mungavin Ave Gardens", ref: "MUN-005", status: "pending", mins: 70, dist: "0.8" },
    ],
  },
  {
    id: "t3", name: "Whitby Team", color: "#8b5cf6",
    jobs: [
      { id: 10, stop: 1, name: "Whitby Town Square", ref: "WHI-001", status: "pending", mins: 80, dist: null },
      { id: 11, stop: 2, name: "Awarua St Entrance", ref: "AWA-003", status: "pending", mins: 55, dist: "1.1" },
      { id: 12, stop: 3, name: "Mana Esplanade Strip", ref: "MAN-007", status: "pending", mins: 40, dist: "2.8" },
    ],
  },
];

function StopDot({ status, stop, color }: { status: string; stop: number; color: string }) {
  if (status === "completed") {
    return (
      <div className="w-7 h-7 rounded-full bg-green-100 border-2 border-green-300 flex items-center justify-center flex-shrink-0">
        <CheckCircle2 className="w-4 h-4 text-green-500" />
      </div>
    );
  }
  if (status === "in_progress") {
    return (
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border-2 text-xs font-bold"
        style={{ background: color + "20", borderColor: color, color }}>
        {stop}
      </div>
    );
  }
  return (
    <div className="w-7 h-7 rounded-full bg-gray-100 border-2 border-gray-200 flex items-center justify-center flex-shrink-0 text-xs font-bold text-gray-400">
      {stop}
    </div>
  );
}

export function TimelineCards() {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ t3: true });
  const toggle = (id: string) => setCollapsed(s => ({ ...s, [id]: !s[id] }));

  return (
    <div className="min-h-screen bg-[#f5f7f9] font-sans">
      {/* Page header */}
      <div className="bg-white border-b px-6 py-3 flex items-center gap-3">
        <div>
          <p className="text-xs text-gray-400">Day View · Monday 26 May 2026</p>
          <p className="text-sm font-bold" style={{ color: NAVY }}>
            {TEAMS.reduce((s, t) => s + t.jobs.length, 0)} jobs across {TEAMS.length} teams
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-xs">
          <Navigation2 className="w-3.5 h-3.5" style={{ color: BRAND }} />
          <span style={{ color: BRAND }} className="font-semibold">Geo-sequenced routes</span>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {TEAMS.map(team => {
          const isCollapsed = collapsed[team.id];
          const done = team.jobs.filter(j => j.status === "completed").length;
          const inProg = team.jobs.filter(j => j.status === "in_progress").length;
          const totalMins = team.jobs.reduce((s, j) => s + j.mins, 0);
          const doneMins = team.jobs.filter(j => j.status === "completed").reduce((s, j) => s + j.mins, 0);
          const progress = Math.round((doneMins / totalMins) * 100);

          return (
            <div key={team.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Team header */}
              <button
                onClick={() => toggle(team.id)}
                className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/70 transition-colors text-left"
              >
                {/* Color accent bar */}
                <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ background: team.color }} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-gray-800">{team.name}</span>
                    {inProg > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                        style={{ background: team.color + "20", color: team.color }}>
                        In progress
                      </span>
                    )}
                  </div>
                  {/* Route dots strip */}
                  <div className="flex items-center gap-1">
                    {team.jobs.map((j, i) => (
                      <span key={j.id} className="flex items-center">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{
                            background: j.status === "completed" ? "#10b981"
                              : j.status === "in_progress" ? team.color
                              : "#d1d5db"
                          }}
                        />
                        {i < team.jobs.length - 1 && (
                          <span className="w-3 h-px mx-0.5" style={{ background: "#e5e7eb" }} />
                        )}
                      </span>
                    ))}
                    <span className="text-[11px] text-gray-400 ml-2">{done}/{team.jobs.length} done · {totalMins}m</span>
                  </div>
                </div>

                {/* Progress % */}
                <div className="flex-shrink-0 text-right mr-1">
                  <div className="text-sm font-bold" style={{ color: progress === 100 ? "#10b981" : team.color }}>{progress}%</div>
                  <div className="text-[10px] text-gray-400">complete</div>
                </div>

                <div className="text-gray-400 flex-shrink-0">
                  {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {/* Timeline body */}
              {!isCollapsed && (
                <div className="border-t border-gray-50 px-5 py-3">
                  <div className="relative">
                    {/* Vertical line */}
                    <div className="absolute left-3 top-3.5 bottom-3.5 w-px bg-gray-100" />

                    <div className="space-y-0">
                      {team.jobs.map((job, idx) => (
                        <div key={job.id}>
                          <div
                            className={`flex items-start gap-4 py-2.5 pl-0 cursor-pointer group rounded-xl px-2 -ml-2 hover:bg-gray-50 transition-colors ${
                              job.status === "completed" ? "opacity-50" : ""
                            }`}
                          >
                            <StopDot status={job.status} stop={job.stop} color={team.color} />
                            <div className="flex-1 min-w-0 pt-0.5">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className={`text-sm font-semibold leading-tight ${job.status === "completed" ? "line-through text-gray-400" : "text-gray-800"}`}>
                                    {job.name}
                                  </p>
                                  <p className="text-[11px] text-gray-400 font-mono mt-0.5">{job.ref}</p>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
                                  {job.status === "in_progress" && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                                      style={{ background: team.color + "20", color: team.color }}>Active</span>
                                  )}
                                  <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
                                    <Clock className="w-3 h-3" />{job.mins}m
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Travel gap between stops */}
                          {job.dist && idx < team.jobs.length - 1 && (
                            <div className="flex items-center gap-3 py-0.5 pl-1">
                              <div className="w-5 flex justify-center">
                                <div className="w-px h-5 border-l border-dashed border-gray-200" />
                              </div>
                              <span className="text-[10px] text-gray-400 flex items-center gap-1">
                                <MapPin className="w-2.5 h-2.5 text-gray-300" />{job.dist}km
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
