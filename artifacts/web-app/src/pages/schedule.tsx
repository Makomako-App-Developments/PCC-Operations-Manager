import { useState } from "react";
import {
  useGetScheduleWeek,
  getGetScheduleWeekQueryKey,
  useListTeams,
  getListTeamsQueryKey,
  useGenerateSchedule,
  useUpdateJob,
  useCreateJob,
  useListAssets,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  format, addWeeks, subWeeks, addDays, startOfWeek,
  addMonths, startOfMonth, endOfMonth,
} from "date-fns";
import {
  ChevronLeft, ChevronRight, ChevronDown, Route, CheckCircle2, Clock,
  CalendarRange, CalendarDays, Calendar, LayoutGrid, CheckCircle, AlertTriangle, XCircle,
  Zap, RotateCcw, PlayCircle, Search, X, Users,
} from "lucide-react";
import { ReactiveJobWizard } from "@/components/reactive-job-wizard";
import type { AssetStub, TeamStub } from "@/components/reactive-job-wizard";
import { useToast } from "@/hooks/use-toast";

const BRAND = "#00AECD";

const TEAM_COLORS = [
  "#00AECD", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899", "#06b6d4",
];

const TYPE_BADGES: Record<string, string> = {
  roses_perennials:  "bg-pink-100 text-pink-700",
  annuals:           "bg-yellow-100 text-yellow-700",
  ornamental:        "bg-purple-100 text-purple-700",
  amenity:           "bg-cyan-100 text-cyan-700",
  rain_garden:       "bg-sky-100 text-sky-700",
  reveg:             "bg-lime-100 text-lime-700",
  bush:              "bg-green-100 text-green-700",
  tree_planter_pits: "bg-stone-100 text-stone-600",
  hedge:             "bg-emerald-100 text-emerald-700",
};

const STANDARD_BADGES: Record<string, string> = {
  high:   "bg-green-100 text-green-700",
  medium: "bg-yellow-100 text-yellow-700",
  low:    "bg-slate-100 text-slate-600",
};

type ViewType = "day" | "week" | "gantt";

interface GanttAssetRow {
  assetId: string;
  assetName: string;
  assetRef: string;
  assetDesc: string | null;
  gardenType: string;
  standard: string;
  frequency: string;
  serviceTimeMins: number;
  teamId: string | null;
  jobs: { id: string; scheduledDate: string; status: string }[];
}

interface GanttData {
  from: string;
  to: string;
  rows: GanttAssetRow[];
}

function defaultFrom(d: Date) {
  return format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
}
function defaultTo(d: Date) {
  return format(addWeeks(startOfWeek(d, { weekStartsOn: 1 }), 12), "yyyy-MM-dd");
}

async function fetchScheduleRange(from: string, to: string, teamId?: string): Promise<GanttData> {
  const params = new URLSearchParams({ from, to });
  if (teamId && teamId !== "all") params.set("teamId", teamId);
  const res = await fetch(`/api/schedule/range?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch schedule range");
  return res.json();
}

// ── Job pill (Gantt) ──────────────────────────────────────────────────────────
function JobPill({ job, color }: { job: { scheduledDate: string; status: string }; color: string }) {
  const done    = job.status === "completed";
  const overdue = job.status === "overdue";
  return (
    <div
      className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded text-white whitespace-nowrap leading-none"
      style={{ background: done ? "#10b981" : overdue ? "#ef4444" : color, opacity: done ? 0.8 : 1 }}
      title={`${format(new Date(job.scheduledDate + "T00:00:00"), "d MMM yyyy")} — ${job.status}`}
    >
      {done && <CheckCircle className="w-2.5 h-2.5 flex-shrink-0" />}
      {format(new Date(job.scheduledDate + "T00:00:00"), "d MMM")}
    </div>
  );
}

// ── Gantt View ────────────────────────────────────────────────────────────────
function GanttView({
  ganttStart,
  selectedTeamId,
  searchTerm,
  getTeamColor,
  getTeamName,
}: {
  ganttStart: Date;
  selectedTeamId: string;
  searchTerm: string;
  getTeamColor: (id?: string | null) => string;
  getTeamName: (id?: string | null) => string;
}) {
  const MONTH_COUNT = 4;
  const ganttFrom = format(ganttStart, "yyyy-MM-dd");
  const ganttTo   = format(endOfMonth(addMonths(ganttStart, MONTH_COUNT - 1)), "yyyy-MM-dd");

  const { data, isLoading } = useQuery<GanttData>({
    queryKey: ["/api/schedule/range", ganttFrom, ganttTo, selectedTeamId],
    queryFn:  () => fetchScheduleRange(ganttFrom, ganttTo, selectedTeamId),
  });

  const months = Array.from({ length: MONTH_COUNT }, (_, i) => {
    const d = addMonths(ganttStart, i);
    return { key: format(d, "yyyy-MM"), label: format(d, "MMM").toUpperCase() };
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="w-full h-10 rounded-xl" />
        ))}
      </div>
    );
  }

  const allRows = data?.rows ?? [];
  const q = searchTerm.trim().toLowerCase();
  const rows = q
    ? allRows.filter(r =>
        r.assetName.toLowerCase().includes(q) ||
        r.assetRef.toLowerCase().includes(q),
      )
    : allRows;

  // Team summary
  const teamJobMap   = new Map<string, number>();
  const teamAssetMap = new Map<string, number>();
  for (const row of rows) {
    const k = row.teamId ?? "__none__";
    teamJobMap.set(k,   (teamJobMap.get(k)   ?? 0) + row.jobs.length);
    teamAssetMap.set(k, (teamAssetMap.get(k) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Team summary pills */}
      {rows.length > 0 && (
        <div className="flex gap-3 px-6 pt-4 pb-3 flex-shrink-0 overflow-x-auto border-b border-gray-100">
          {Array.from(teamJobMap.entries()).slice(0, 8).map(([k, jobCount]) => {
            const tid   = k === "__none__" ? null : k;
            const color = getTeamColor(tid);
            const name  = getTeamName(tid);
            return (
              <div key={k} className="bg-white rounded-xl px-4 py-2 shadow-sm border border-gray-100 flex items-center gap-2.5 flex-shrink-0">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                <div>
                  <p className="text-xs font-semibold text-gray-800 leading-tight">{name}</p>
                  <p className="text-[10px] text-gray-500">{teamAssetMap.get(k)} assets · {jobCount} jobs</p>
                </div>
              </div>
            );
          })}
          <div className="bg-white rounded-xl px-4 py-2 shadow-sm border border-gray-100 flex items-center gap-2 flex-shrink-0">
            <Route className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-xs font-semibold text-gray-800">{rows.reduce((s, r) => s + r.jobs.length, 0)}</span>
            <span className="text-[10px] text-gray-500">total jobs</span>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400 italic">
          No scheduled jobs in this period — click "Generate Schedule" to create jobs.
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs border-collapse" style={{ minWidth: 860 + MONTH_COUNT * 100 }}>
            <thead className="sticky top-0 z-20 bg-white shadow-sm">
              <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                <th className="text-left py-2.5 px-3 w-8 border-b border-gray-200">#</th>
                <th className="text-left py-2.5 px-3 border-b border-gray-200" style={{ minWidth: 190 }}>Site</th>
                <th className="text-left py-2.5 px-3 border-b border-gray-200">Type</th>
                <th className="text-left py-2.5 px-3 border-b border-gray-200">Standard</th>
                <th className="text-left py-2.5 px-3 border-b border-gray-200">Freq</th>
                <th className="text-left py-2.5 px-3 border-b border-gray-200">Time</th>
                <th className="text-left py-2.5 px-3 border-b border-gray-200" style={{ minWidth: 100 }}>Team</th>
                {months.map(m => (
                  <th key={m.key} className="text-left py-2.5 px-3 border-b border-gray-200 border-l border-l-gray-100" style={{ minWidth: 100 }}>
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const color = getTeamColor(row.teamId);
                const name  = getTeamName(row.teamId);
                const jobsByMonth = new Map<string, typeof row.jobs>(months.map(m => [m.key, []]));
                for (const job of row.jobs) {
                  const mk = job.scheduledDate.slice(0, 7);
                  jobsByMonth.get(mk)?.push(job);
                }
                return (
                  <tr
                    key={row.assetId}
                    className={`border-b border-gray-100 hover:bg-blue-50/30 transition-colors ${idx % 2 === 0 ? "" : "bg-gray-50/40"}`}
                  >
                    <td className="py-2 px-3">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                        style={{ background: color }}
                      >
                        {idx + 1}
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <p className="font-semibold text-gray-800 truncate max-w-[185px]" title={row.assetName}>{row.assetName}</p>
                      <p className="text-gray-400 text-[10px] truncate max-w-[185px]">{row.assetDesc ?? row.assetRef}</p>
                    </td>
                    <td className="py-2 px-3">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold capitalize ${TYPE_BADGES[row.gardenType] ?? "bg-gray-100 text-gray-600"}`}>
                        {row.gardenType.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold capitalize ${STANDARD_BADGES[row.standard] ?? "bg-gray-100 text-gray-600"}`}>
                        {row.standard}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-gray-600 capitalize">{row.frequency}</td>
                    <td className="py-2 px-3 text-gray-600">{row.serviceTimeMins}m</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                        <span className="text-gray-600 truncate max-w-[90px]">{name}</span>
                      </div>
                    </td>
                    {months.map(m => (
                      <td key={m.key} className="py-2 px-2 border-l border-l-gray-100 align-top">
                        <div className="flex flex-col gap-0.5">
                          {(jobsByMonth.get(m.key) ?? []).map(job => (
                            <JobPill key={job.id} job={job} color={color} />
                          ))}
                        </div>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-center text-[10px] text-gray-400 py-3">
            {rows.length} assets with scheduled jobs in this period
          </p>
        </div>
      )}
    </div>
  );
}

// ── Day View ──────────────────────────────────────────────────────────────────
function DayView({
  currentDate,
  weekData,
  isLoading,
  searchTerm,
  teamsData,
  getTeamColor,
  getTeamName,
  onJobClick,
}: {
  currentDate: Date;
  weekData: any;
  isLoading: boolean;
  searchTerm: string;
  teamsData: any[];
  getTeamColor: (id?: string | null) => string;
  getTeamName:  (id?: string | null) => string;
  onJobClick:   (job: any) => void;
}) {
  const dayStr = format(currentDate, "yyyy-MM-dd");
  const rawJobs: any[] = weekData?.days?.find((d: any) => d.date === dayStr)?.jobs ?? [];
  const q = searchTerm.trim().toLowerCase();
  const jobs = q
    ? rawJobs.filter((j: any) =>
        j.assetName?.toLowerCase().includes(q) ||
        j.assetRef?.toLowerCase().includes(q),
      )
    : rawJobs;

  // Group by team — All Teams jobs are fanned out into every team's bucket
  const teamGroups: Map<string, any[]> = new Map();
  for (const job of jobs) {
    if ((job as any).isAllTeams) {
      for (const team of teamsData) {
        if (!teamGroups.has(team.id)) teamGroups.set(team.id, []);
        teamGroups.get(team.id)!.push(job);
      }
    } else if (job.teamId) {
      if (!teamGroups.has(job.teamId)) teamGroups.set(job.teamId, []);
      teamGroups.get(job.teamId)!.push(job);
    }
  }
  const sortedGroups = [...teamGroups.entries()]
    .filter(([, tjobs]) => tjobs.length > 0)
    .sort(([aId], [bId]) => getTeamName(aId).localeCompare(getTeamName(bId)));

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleTeam = (key: string) => setCollapsed(s => ({ ...s, [key]: !s[key] }));

  if (isLoading) return <div className="p-8"><Skeleton className="w-full h-96 rounded-2xl" /></div>;

  return (
    <div className="p-5 overflow-auto h-full">
      {jobs.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-400 italic bg-white rounded-2xl border border-gray-100 max-w-2xl">
          No jobs scheduled for {format(currentDate, "EEEE d MMMM yyyy")}
        </div>
      ) : (
        <div className="space-y-4 max-w-3xl">
          {/* Summary row */}
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Route className="w-4 h-4" />
            <span className="font-medium text-gray-700">{jobs.length}</span> jobs across
            <span className="font-medium text-gray-700">{sortedGroups.length}</span> team{sortedGroups.length !== 1 ? "s" : ""}
          </div>

          {sortedGroups.map(([teamId, teamJobs]) => {
            const groupKey    = teamId;
            const color       = getTeamColor(teamId);
            const name        = getTeamName(teamId);
            const isJobDoneForTeam = (j: any) =>
              j.isAllTeams
                ? (j.teamCompletions ?? []).some((c: any) => c.teamId === teamId)
                : j.status === "completed";
            const totalMin    = teamJobs.reduce((s: number, j: any) => s + (j.estimatedTimeMins ?? j.serviceTimeMins ?? 0), 0);
            const doneMins    = teamJobs.filter(isJobDoneForTeam).reduce((s: number, j: any) => s + (j.estimatedTimeMins ?? j.serviceTimeMins ?? 0), 0);
            const doneCount   = teamJobs.filter(isJobDoneForTeam).length;
            const inProgCount = teamJobs.filter((j: any) => !j.isAllTeams && j.status === "in_progress").length;
            const progress    = totalMin > 0 ? Math.round((doneMins / totalMin) * 100) : 0;
            const isCollapsed = collapsed[groupKey];

            return (
              <div key={groupKey} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Team header — collapsible */}
                <button
                  onClick={() => toggleTeam(groupKey)}
                  className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/70 transition-colors text-left"
                >
                  <div className="w-1 h-9 rounded-full flex-shrink-0" style={{ background: color }} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-sm font-bold text-gray-800">{name}</span>
                      {inProgCount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                          style={{ background: color + "22", color }}>
                          In progress
                        </span>
                      )}
                    </div>
                    {/* Segmented progress bar */}
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex h-1.5 rounded-full overflow-hidden w-36 flex-shrink-0 bg-gray-100">
                        {(() => {
                          const total = teamJobs.length;
                          const donePct    = (teamJobs.filter((j: any) => j.status === "completed").length  / total) * 100;
                          const inProgPct  = (teamJobs.filter((j: any) => j.status === "in_progress").length / total) * 100;
                          const overduePct = (teamJobs.filter((j: any) => j.status === "overdue").length    / total) * 100;
                          return (<>
                            {donePct    > 0 && <div style={{ width: `${donePct}%`,    background: "#10b981" }} />}
                            {inProgPct  > 0 && <div style={{ width: `${inProgPct}%`,  background: color }} />}
                            {overduePct > 0 && <div style={{ width: `${overduePct}%`, background: "#ef4444" }} />}
                          </>);
                        })()}
                      </div>
                      <span className="text-[11px] text-gray-400 whitespace-nowrap">
                        {doneCount}/{teamJobs.length} done · {totalMin}m
                      </span>
                    </div>
                  </div>

                  {/* Progress % */}
                  <div className="flex-shrink-0 text-right mr-2">
                    <div className="text-sm font-bold" style={{ color: progress === 100 ? "#10b981" : color }}>
                      {progress}%
                    </div>
                    <div className="text-[10px] text-gray-400">complete</div>
                  </div>

                  <ChevronDown
                    className="w-4 h-4 text-gray-400 flex-shrink-0 transition-transform"
                    style={{ transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
                  />
                </button>

                {/* Timeline body */}
                {!isCollapsed && (
                  <div className="border-t border-gray-50 px-5 py-3">
                    <div className="relative">
                      {/* Vertical guide line */}
                      <div className="absolute left-[13px] top-4 bottom-4 w-px bg-gray-100" />

                      <div className="space-y-0">
                        {teamJobs.map((job: any, idx: number) => {
                          const done        = job.status === "completed";
                          const overdue     = job.status === "overdue";
                          const inProg      = job.status === "in_progress";
                          const crewNone    = job.crewStatus === "none";
                          const crewReduced = job.crewStatus === "reduced";
                          const displayTime = job.estimatedTimeMins ?? job.serviceTimeMins;

                          // Stop circle style
                          const dotBg    = done    ? "#d1fae5" : inProg ? color + "22" : overdue ? "#fee2e2" : "#f1f5f9";
                          const dotBorder = done   ? "#a7f3d0" : inProg ? color       : overdue ? "#fca5a5" : "#e2e8f0";
                          const dotColor  = done   ? "#059669" : inProg ? color       : overdue ? "#ef4444" : "#94a3b8";

                          return (
                            <div
                              key={job.id}
                              onClick={() => onJobClick(job)}
                              className={`flex items-start gap-4 py-2.5 px-2 -ml-2 rounded-xl cursor-pointer transition-colors hover:bg-gray-50 ${
                                crewNone    ? "bg-red-50/40 hover:bg-red-50/60" :
                                crewReduced ? "bg-amber-50/30 hover:bg-amber-50/50" :
                                done        ? "opacity-50" : ""
                              }`}
                            >
                              {/* Stop circle */}
                              <div
                                className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold border-2 z-10 bg-white"
                                style={{ borderColor: dotBorder, background: dotBg, color: dotColor }}
                              >
                                {done ? <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "#10b981" }} /> : idx + 1}
                              </div>

                              {/* Job info */}
                              <div className="flex-1 min-w-0 pt-0.5">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className={`text-sm font-semibold leading-tight ${done ? "line-through text-gray-400" : overdue ? "text-red-700" : "text-gray-800"}`}>
                                      {job.assetName}
                                    </p>
                                    <p className="text-[11px] text-gray-400 mt-0.5 truncate">{(job as any).assetDesc ?? job.assetRef}</p>
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-shrink-0 pt-0.5 flex-wrap justify-end">
                                    {overdue     && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">Overdue</span>}
                                    {crewNone    && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold flex items-center gap-0.5"><XCircle className="w-2.5 h-2.5" />No crew</span>}
                                    {crewReduced && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold flex items-center gap-0.5"><AlertTriangle className="w-2.5 h-2.5" />Reduced</span>}
                                    {(job as any).isAllTeams && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5" style={{ background: "#00AECD20", color: "#00AECD" }}>
                                        <Users className="w-2.5 h-2.5" />All Teams · {((job as any).teamCompletions ?? []).length}/{teamsData.length}✓
                                      </span>
                                    )}
                                    <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
                                      <Clock className="w-3 h-3" />
                                      {crewReduced || crewNone
                                        ? <><span className="line-through mr-0.5">{job.serviceTimeMins}m</span><span className={crewNone ? "text-red-600 font-semibold" : "text-amber-600 font-semibold"}>{displayTime}m</span></>
                                        : <span>{displayTime}m</span>
                                      }
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Week View ─────────────────────────────────────────────────────────────────
function WeekView({
  weekData,
  isLoading,
  selectedTeamId,
  searchTerm,
  teamsCount,
  getTeamColor,
  getTeamName,
  onJobClick,
}: {
  weekData: any;
  isLoading: boolean;
  selectedTeamId: string;
  searchTerm: string;
  teamsCount: number;
  getTeamColor: (id?: string | null) => string;
  getTeamName:  (id?: string | null) => string;
  onJobClick:   (job: any) => void;
}) {
  // Collapsed state keyed by teamId — collapsing a team folds it across all day columns
  const [collapsedTeams, setCollapsedTeams] = useState<Set<string>>(new Set());
  const toggleTeam = (teamId: string) =>
    setCollapsedTeams(prev => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId); else next.add(teamId);
      return next;
    });

  const [showWeekend, setShowWeekend] = useState(false);

  if (isLoading) return <div className="p-8"><Skeleton className="w-full h-96 rounded-2xl" /></div>;
  if (!weekData?.days) return null;

  const productiveTimeMins: number = weekData?.settings?.productiveTimeMins ?? 390;
  const q = searchTerm.trim().toLowerCase();

  const visibleDays: any[] = weekData.days.filter((d: any) => {
    const dow = new Date(d.date + "T00:00:00").getDay(); // 0=Sun, 6=Sat
    return showWeekend || (dow !== 0 && dow !== 6);
  });

  /** Group jobs by teamId, preserving insertion order for first-seen team. */
  function groupByTeam(jobs: any[]): Map<string, any[]> {
    const map = new Map<string, any[]>();
    for (const job of jobs) {
      if (!job.teamId) continue; // skip jobs with no team assignment
      if (!map.has(job.teamId)) map.set(job.teamId, []);
      map.get(job.teamId)!.push(job);
    }
    return map;
  }

  /**
   * Sort jobs within a team cluster by routeOrder (geosequence).
   * Nulls sort last; ties broken by assetRef.
   */
  function geoSort(jobs: any[]): any[] {
    return [...jobs].sort((a, b) => {
      const ro_a = a.routeOrder ?? 999999;
      const ro_b = b.routeOrder ?? 999999;
      if (ro_a !== ro_b) return ro_a - ro_b;
      return (a.assetRef ?? "").localeCompare(b.assetRef ?? "");
    });
  }

  const colCount = visibleDays.length;

  return (
    <div className="flex-1 overflow-auto p-5">
      <div className="flex items-center justify-end mb-3">
        <button
          onClick={() => setShowWeekend(v => !v)}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            showWeekend
              ? "bg-[#00AECD]/10 border-[#00AECD]/30 text-[#00AECD] font-semibold"
              : "bg-white border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300"
          }`}
        >
          <CalendarDays className="w-3.5 h-3.5" />
          {showWeekend ? "Hide weekend" : "Show weekend"}
        </button>
      </div>
      <div
        className="gap-3"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
          minWidth: colCount === 7 ? 840 : 600,
          minHeight: 520,
        }}
      >
        {visibleDays.map((day: any) => {
          const day_ = q
            ? { ...day, jobs: day.jobs.filter((j: any) =>
                j.assetName?.toLowerCase().includes(q) ||
                j.assetRef?.toLowerCase().includes(q),
              )}
            : day;
          day = day_;
          const dateObj = new Date(day.date + "T00:00:00");
          const isToday = format(new Date(), "yyyy-MM-dd") === day.date;

          // Capacity bar calculation
          const relevantJobs = selectedTeamId !== "all"
            ? day.jobs.filter((j: any) => j.teamId === selectedTeamId)
            : day.jobs;
          const totalMins    = relevantJobs.reduce((s: number, j: any) => s + (j.estimatedTimeMins ?? j.serviceTimeMins ?? 0), 0);
          const capacityMins = selectedTeamId !== "all" ? productiveTimeMins : productiveTimeMins * teamsCount;
          const pct      = capacityMins > 0 ? Math.min((totalMins / capacityMins) * 100, 100) : 0;
          const isOver   = totalMins > capacityMins * 1.05;
          const isHigh   = totalMins > capacityMins * 0.9;
          const barColor = isOver ? "#ef4444" : isHigh ? "#f59e0b" : "#10b981";

          // Build team clusters for this day
          const teamGroups = groupByTeam(day.jobs);

          return (
            <div
              key={day.date}
              className={`rounded-xl shadow-sm flex flex-col bg-white ${isToday ? "ring-2 ring-[#00AECD]" : "border border-gray-100"}`}
              style={{ minHeight: 480 }}
            >
              {/* Day header */}
              <div className="px-3 pt-2.5 pb-2 border-b bg-gray-50/60 flex-shrink-0 rounded-t-xl">
                <div className="flex items-center justify-between mb-1.5">
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{format(dateObj, "EEE")}</p>
                    <p className={`text-sm font-semibold ${isToday ? "text-[#00AECD]" : "text-gray-900"}`}>{format(dateObj, "d MMM")}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-white border-gray-200 font-medium">
                    {day.jobs.length}
                  </Badge>
                </div>
                {totalMins > 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
                    </div>
                    <span style={{ color: barColor }} className="text-[9px] font-bold whitespace-nowrap leading-none">
                      {(totalMins / 60).toFixed(1)}h
                    </span>
                  </div>
                )}
              </div>

              {/* Team clusters */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {day.jobs.length === 0 ? (
                  <p className="text-center text-[11px] text-gray-400 py-6 italic">No jobs</p>
                ) : Array.from(teamGroups.entries()).map(([teamKey, rawJobs]) => {
                  const tidArg   = teamKey === "__unassigned__" ? null : teamKey;
                  const color    = getTeamColor(tidArg);
                  const name     = getTeamName(tidArg);
                  const sorted   = geoSort(rawJobs);
                  const teamMins = sorted.reduce((s: number, j: any) => s + (j.estimatedTimeMins ?? j.serviceTimeMins ?? 0), 0);
                  const isCollapsed = collapsedTeams.has(teamKey);

                  return (
                    <div key={teamKey}>
                      {/* Team cluster header */}
                      <button
                        onClick={() => toggleTeam(teamKey)}
                        className="w-full flex items-center gap-1.5 px-2 py-1 rounded-md mb-1 hover:brightness-95 transition-all"
                        style={{ background: color + "1a", borderLeft: `3px solid ${color}` }}
                      >
                        <span className="text-[10px] font-bold flex-1 text-left truncate" style={{ color }}>
                          {name}
                        </span>
                        <span className="text-[9px] text-gray-400 whitespace-nowrap flex-shrink-0">
                          {sorted.length} · {(teamMins / 60).toFixed(1)}h
                        </span>
                        {isCollapsed
                          ? <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                          : <ChevronDown  className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        }
                      </button>

                      {/* Geosequenced job cards */}
                      {!isCollapsed && (
                        <div className="space-y-1.5">
                          {sorted.map((job: any) => {
                            const done       = job.status === "completed";
                            const skipped    = job.status === "skipped";
                            const overdue    = job.status === "overdue";
                            const inProgress = job.status === "in_progress";
                            const crewNone    = job.crewStatus === "none";
                            const crewReduced = job.crewStatus === "reduced";
                            const displayTime = job.estimatedTimeMins ?? job.serviceTimeMins;
                            return (
                              <div
                                key={job.id}
                                onClick={() => onJobClick(job)}
                                className={`p-2.5 rounded-lg border shadow-sm bg-white relative overflow-hidden cursor-pointer hover:shadow-md transition-shadow ${
                                  crewNone    ? "border-red-300 bg-red-50/50" :
                                  crewReduced ? "border-amber-200 bg-amber-50/40" :
                                  done        ? "opacity-60 border-gray-200" :
                                  skipped     ? "border-orange-200 bg-orange-50" :
                                  inProgress  ? "border-[#00AECD] ring-1 ring-[#00AECD]" :
                                  overdue     ? "border-red-200 bg-red-50" : "border-gray-200"
                                }`}
                              >
                                <div className="absolute top-0 left-0 w-1 h-full" style={{ background: color }} />
                                <div className="pl-2">
                                  <p className={`text-[11px] font-semibold truncate ${done || skipped ? "line-through text-gray-400" : "text-gray-900"}`} title={job.assetName}>
                                    {job.assetName}
                                  </p>
                                  <p className="text-[9px] text-gray-400 mb-1 truncate">{(job as any).assetDesc ?? job.assetRef}</p>
                                  {crewNone && (
                                    <p className="text-[9px] text-red-600 font-semibold flex items-center gap-0.5 mb-1"><XCircle className="w-2.5 h-2.5" />No crew available</p>
                                  )}
                                  {crewReduced && (
                                    <p className="text-[9px] text-amber-600 font-semibold flex items-center gap-0.5 mb-1"><AlertTriangle className="w-2.5 h-2.5" />Reduced crew</p>
                                  )}
                                  <div className="flex items-center justify-end text-[10px] text-gray-400 border-t border-gray-100 pt-1.5">
                                    <span className="flex items-center gap-0.5">
                                      <Clock className="w-2.5 h-2.5" />
                                      {crewReduced || crewNone
                                        ? <><span className="line-through mr-0.5 text-[9px]">{job.serviceTimeMins}m</span><span className={crewNone ? "text-red-600 font-bold" : "text-amber-600 font-bold"}>{displayTime}m</span></>
                                        : <span>{displayTime}m</span>
                                      }
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Advance dateStr by 1+ days, skipping weekends */
function nextWorkingDayStr(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

const FREQ_DAYS_LABEL: Record<string, number> = {
  weekly: 7, fortnightly: 14, monthly: 28, bimonthly: 56, quarterly: 91,
};
function nextScheduledDate(scheduledDate: string, frequency: string): string {
  const days = FREQ_DAYS_LABEL[frequency] ?? 28;
  const d = new Date(scheduledDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const STATUS_OPTIONS = [
  { value: "pending",     label: "Pending",     color: "text-gray-600" },
  { value: "in_progress", label: "In Progress", color: "text-blue-600" },
  { value: "completed",   label: "Completed",   color: "text-green-600" },
  { value: "skipped",     label: "Skipped",     color: "text-orange-600" },
];

// ── Main Schedule Page ────────────────────────────────────────────────────────
export default function Schedule() {
  const [view, setView]                 = useState<ViewType>("week");
  const [currentDate, setCurrentDate]   = useState(new Date());
  const [ganttStart, setGanttStart]     = useState(() => startOfMonth(new Date()));
  const [selectedTeamId, setSelectedTeamId] = useState("all");
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [genFrom, setGenFrom]           = useState("");
  const [genTo, setGenTo]               = useState("");

  // Job update sheet
  const [selectedJob, setSelectedJob]   = useState<any | null>(null);
  const [jobStatus, setJobStatus]       = useState("");
  const [jobActualTime, setJobActualTime] = useState("");
  const [jobNotes, setJobNotes]         = useState("");

  // Urgent job dialog
  const [wizardOpen, setWizardOpen]     = useState(false);
  const [urgentOpen, setUrgentOpen]     = useState(false);
  const [urgentSearch, setUrgentSearch] = useState("");
  const [urgentAsset, setUrgentAsset]   = useState<any | null>(null);
  const [urgentDate, setUrgentDate]     = useState("");
  const [urgentNotes, setUrgentNotes]   = useState("");
  const [urgentPriority, setUrgentPriority] = useState("high");

  // Urgent job step 2 — capacity impact
  const [urgentStep, setUrgentStep]         = useState<1 | 2>(1);
  const [dayCapacity, setDayCapacity]       = useState<any | null>(null);
  const [dayCapLoading, setDayCapLoading]   = useState(false);
  const [jobsToPush, setJobsToPush]         = useState<Set<string>>(new Set());

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const weekStr = format(currentDate, "yyyy-MM-dd");

  const { data: teamsData } = useListTeams({ query: { queryKey: getListTeamsQueryKey() } });

  const { data: weekData, isLoading: weekLoading } = useGetScheduleWeek(
    { week: weekStr, ...(selectedTeamId !== "all" ? { teamId: selectedTeamId } : {}) },
    { query: { queryKey: getGetScheduleWeekQueryKey({ week: weekStr, teamId: selectedTeamId !== "all" ? selectedTeamId : undefined }) } },
  );

  const generateSchedule = useGenerateSchedule({
    mutation: {
      onSuccess: (data: any) => {
        setDialogOpen(false);
        const parts = [`${data.jobsCreated} new jobs`];
        if (data.jobsRefreshed)      parts.push(`${data.jobsRefreshed} refreshed`);
        if (data.jobsCarriedForward) parts.push(`${data.jobsCarriedForward} carried forward`);
        if (data.capacityConflicts)  parts.push(`${data.capacityConflicts} capacity conflicts`);
        toast({
          title: "Schedule generated",
          description: `${parts.join(" · ")} · ${format(new Date(genFrom), "d MMM")}–${format(new Date(genTo), "d MMM yyyy")}.`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/schedule/week"] });
        queryClient.invalidateQueries({ queryKey: ["/api/schedule/range"] });
      },
      onError: (err: any) => {
        toast({ title: "Generation failed", description: err?.message || "Unknown error", variant: "destructive" });
      },
    },
  });

  // ── Job update ──────────────────────────────────────────────────────────────
  const updateJob = useUpdateJob({
    mutation: {
      onSuccess: (updated: any) => {
        setSelectedJob(null);
        const isSkipped = updated.status === "skipped";
        toast({
          title: isSkipped ? "Job skipped — rescheduled" : "Job updated",
          description: isSkipped && updated.rescheduledTo
            ? `Rescheduled to ${format(new Date(updated.rescheduledTo + "T00:00:00"), "d MMM yyyy")}.`
            : `Status set to ${updated.status.replace("_", " ")}.`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/schedule/week"] });
        queryClient.invalidateQueries({ queryKey: ["/api/schedule/range"] });
      },
      onError: (err: any) => {
        toast({ title: "Update failed", description: err?.message ?? "Unknown error", variant: "destructive" });
      },
    },
  });

  const handleJobClick = (job: any) => {
    setSelectedJob(job);
    setJobStatus(job.status);
    setJobActualTime(job.actualTimeMins ? String(job.actualTimeMins) : "");
    setJobNotes(job.notes ?? "");
  };

  const handleJobSave = () => {
    if (!selectedJob) return;
    const patch: Record<string, unknown> = { status: jobStatus };
    if (jobNotes) patch.notes = jobNotes;
    if (jobActualTime && jobStatus === "completed") patch.actualTimeMins = parseInt(jobActualTime);
    updateJob.mutate({ id: selectedJob.id, data: patch as any });
  };

  // ── Urgent job ──────────────────────────────────────────────────────────────
  const { data: allAssets } = useListAssets(
    { limit: 2000 },
    { query: { enabled: urgentOpen || wizardOpen } },
  );

  const createJob = useCreateJob({
    mutation: {
      onSuccess: () => {
        setUrgentOpen(false);
        setUrgentAsset(null);
        setUrgentSearch("");
        setUrgentDate("");
        setUrgentNotes("");
        toast({ title: "Urgent job added", description: "The job has been added to the schedule." });
        queryClient.invalidateQueries({ queryKey: ["/api/schedule/week"] });
        queryClient.invalidateQueries({ queryKey: ["/api/schedule/range"] });
      },
      onError: (err: any) => {
        toast({ title: "Failed to add job", description: err?.message ?? "Unknown error", variant: "destructive" });
      },
    },
  });

  const openUrgentJob = () => {
    setUrgentDate(format(currentDate, "yyyy-MM-dd"));
    setUrgentSearch("");
    setUrgentAsset(null);
    setUrgentNotes("");
    setUrgentPriority("high");
    setUrgentStep(1);
    setDayCapacity(null);
    setJobsToPush(new Set());
    setUrgentOpen(true);
  };

  /** Advance to step 2 by fetching the day's capacity data */
  const handleReviewImpact = async () => {
    if (!urgentAsset || !urgentDate) return;
    if (!urgentAsset.teamId) {
      // No team assigned — skip capacity check and go straight to confirm
      handleAddUrgentJobFinal(new Set());
      return;
    }
    setDayCapLoading(true);
    try {
      const r = await fetch(
        `/api/schedule/day-capacity?date=${urgentDate}&teamId=${urgentAsset.teamId}`,
        { credentials: "include" },
      );
      if (!r.ok) throw new Error("Failed to load capacity");
      const data = await r.json();
      setDayCapacity(data);
      setJobsToPush(new Set());
      setUrgentStep(2);
    } catch {
      toast({ title: "Could not load capacity", variant: "destructive" });
    } finally {
      setDayCapLoading(false);
    }
  };

  /** Final confirmation — optionally push selected jobs then add reactive job */
  const handleAddUrgentJobFinal = (pushIds = jobsToPush) => {
    if (!urgentAsset || !urgentDate) return;
    // Push marked jobs to next working day first, then create urgent job
    const pushArray = Array.from(pushIds);
    const pushDate = nextWorkingDayStr(urgentDate);

    const doPushThenCreate = async () => {
      for (const jobId of pushArray) {
        await fetch(`/api/jobs/${jobId}`, {
          method:  "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ scheduledDate: pushDate }),
        });
      }
      createJob.mutate({
        data: {
          assetId:       urgentAsset.id,
          jobType:       "reactive",
          teamId:        urgentAsset.teamId ?? undefined,
          scheduledDate: urgentDate,
          status:        "pending",
          crewStatus:    "full",
          notes:         urgentNotes || undefined,
        } as any,
      });
    };

    doPushThenCreate().catch(() =>
      toast({ title: "Error while pushing jobs", variant: "destructive" }),
    );
  };

  const [search, setSearch] = useState("");

  const filteredAssets = (allAssets?.data ?? []).filter((a: any) =>
    urgentSearch.length < 2 ? false :
    a.name.toLowerCase().includes(urgentSearch.toLowerCase()) ||
    a.reference.toLowerCase().includes(urgentSearch.toLowerCase()),
  ).slice(0, 8);

  const openGenerateDialog = () => {
    setGenFrom(defaultFrom(currentDate));
    setGenTo(defaultTo(currentDate));
    setDialogOpen(true);
  };

  const handleConfirmGenerate = () => {
    if (!genFrom || !genTo || genFrom > genTo) return;
    generateSchedule.mutate({ data: { fromDate: genFrom, toDate: genTo } });
  };

  const handleSetView = (v: ViewType) => {
    if (v === "gantt") setGanttStart(startOfMonth(currentDate));
    setView(v);
  };

  const prevPeriod = () => {
    if (view === "day")   setCurrentDate(d => addDays(d, -1));
    if (view === "week")  setCurrentDate(d => subWeeks(d, 1));
    if (view === "gantt") setGanttStart(d => addMonths(d, -4));
  };
  const nextPeriod = () => {
    if (view === "day")   setCurrentDate(d => addDays(d, 1));
    if (view === "week")  setCurrentDate(d => addWeeks(d, 1));
    if (view === "gantt") setGanttStart(d => addMonths(d, 4));
  };

  const periodLabel = () => {
    if (view === "day")  return format(currentDate, "EEEE, d MMM yyyy");
    if (view === "week") {
      if (!weekData) return "...";
      return `${format(new Date(weekData.weekStart + "T00:00:00"), "d MMM")} – ${format(new Date(weekData.weekEnd + "T00:00:00"), "d MMM yyyy")}`;
    }
    const ganttEnd = addMonths(ganttStart, 3);
    return `${format(ganttStart, "MMM")} – ${format(ganttEnd, "MMM yyyy")}`;
  };

  const getTeamColor = (teamId?: string | null) => {
    if (!teamId || !teamsData) return "#94a3b8";
    const idx = teamsData.findIndex(t => t.id === teamId);
    return TEAM_COLORS[idx % TEAM_COLORS.length] ?? "#94a3b8";
  };
  const getTeamName = (teamId?: string | null) => {
    if (!teamId || !teamsData) return "Unassigned";
    return teamsData.find(t => t.id === teamId)?.name ?? "Unassigned";
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f5f7f9]">
      {/* Header */}
      <header className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-10 flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Maintenance Scheduler</h1>
          <p className="text-xs text-gray-400">
            {view === "gantt"
              ? `${format(ganttStart, "MMM")} – ${format(addMonths(ganttStart, 3), "MMM yyyy")} · Porirua City Gardens`
              : weekData
                ? `Week of ${format(new Date(weekData.weekStart + "T00:00:00"), "d MMM")} – ${format(new Date(weekData.weekEnd + "T00:00:00"), "d MMM yyyy")}`
                : "Loading..."}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs font-medium shadow-sm">
            {(["day", "week", "gantt"] as ViewType[]).map(v => {
              const Icon  = { day: CalendarDays, week: LayoutGrid, gantt: Calendar }[v];
              const label = { day: "Day", week: "Week", gantt: "Gantt" }[v];
              return (
                <button
                  key={v}
                  onClick={() => handleSetView(v)}
                  className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors border-r border-gray-200 last:border-r-0 ${
                    view === v ? "bg-[#00AECD] text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              );
            })}
          </div>

          <Button
            size="sm"
            variant="outline"
            className="gap-2 border-orange-200 text-orange-700 hover:bg-orange-50"
            onClick={() => setWizardOpen(true)}
          >
            <Zap className="w-4 h-4" />
            Add Reactive Job
          </Button>
          <Button
            size="sm"
            style={{ background: BRAND }}
            className="text-white hover:opacity-90 gap-2"
            onClick={openGenerateDialog}
            disabled={generateSchedule.isPending}
            data-testid="btn-generate-schedule"
          >
            <CalendarRange className="w-4 h-4" />
            Generate Schedule
          </Button>
        </div>
      </header>

      {/* Sub-toolbar */}
      <div className="bg-white border-b px-8 py-2.5 flex items-center gap-4 flex-shrink-0">
        <div className="relative w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search site name or ref…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00AECD]/30 focus:border-[#00AECD] placeholder:text-gray-400"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
          <SelectTrigger className="w-44 text-sm" data-testid="select-team">
            <SelectValue placeholder="All Teams" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Teams</SelectItem>
            {teamsData?.map(t => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {view !== "gantt" && weekData && (
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Route className="w-3.5 h-3.5 text-gray-400" />
              <span className="font-semibold text-gray-700">{weekData.totalJobs}</span> jobs this week
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              <span className="font-semibold text-gray-700">{weekData.completedJobs}</span> completed
            </span>
          </div>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <button onClick={prevPeriod} className="p-1.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-600 font-medium px-2 min-w-[200px] text-center">
            {periodLabel()}
          </span>
          <button onClick={nextPeriod} className="p-1.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors" data-testid="btn-next-week">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* View body */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {view === "day" && (
          <div className="flex-1 overflow-auto">
            <DayView
              currentDate={currentDate}
              weekData={weekData}
              isLoading={weekLoading}
              searchTerm={search}
              teamsData={teamsData ?? []}
              getTeamColor={getTeamColor}
              getTeamName={getTeamName}
              onJobClick={handleJobClick}
            />
          </div>
        )}
        {view === "week" && (
          <WeekView
            weekData={weekData}
            isLoading={weekLoading}
            selectedTeamId={selectedTeamId}
            searchTerm={search}
            teamsCount={teamsData?.length ?? 1}
            getTeamColor={getTeamColor}
            getTeamName={getTeamName}
            onJobClick={handleJobClick}
          />
        )}
        {view === "gantt" && (
          <GanttView
            ganttStart={ganttStart}
            selectedTeamId={selectedTeamId}
            searchTerm={search}
            getTeamColor={getTeamColor}
            getTeamName={getTeamName}
          />
        )}
      </div>

      {/* Generate Schedule dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Schedule</DialogTitle>
            <DialogDescription>
              New jobs will be created for all active assets in the date range. Existing pending jobs will have their crew status refreshed. In-progress, completed, and skipped jobs are never touched.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="gen-from">From</Label>
                <Input id="gen-from" type="date" value={genFrom} onChange={e => setGenFrom(e.target.value)} className="text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gen-to">To</Label>
                <Input id="gen-to" type="date" value={genTo} min={genFrom} onChange={e => setGenTo(e.target.value)} className="text-sm" />
              </div>
            </div>
            {genFrom && genTo && genFrom <= genTo && (
              <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                <span className="font-medium text-gray-700">{format(new Date(genFrom), "d MMM yyyy")}</span> to{" "}
                <span className="font-medium text-gray-700">{format(new Date(genTo), "d MMM yyyy")}</span>
              </p>
            )}
            {genFrom && genTo && genFrom > genTo && (
              <p className="text-xs text-red-500">"To" date must be after "From" date.</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              style={{ background: BRAND }}
              className="text-white hover:opacity-90"
              onClick={handleConfirmGenerate}
              disabled={generateSchedule.isPending || !genFrom || !genTo || genFrom > genTo}
            >
              {generateSchedule.isPending ? "Generating..." : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Job Update Sheet ───────────────────────────────────────────────── */}
      <Sheet open={!!selectedJob} onOpenChange={open => { if (!open) setSelectedJob(null); }}>
        <SheetContent className="w-[420px] sm:w-[460px] flex flex-col">
          <SheetHeader className="pb-4 border-b">
            <SheetTitle className="text-base font-semibold text-gray-900">
              {selectedJob?.assetName ?? "Job"}
            </SheetTitle>
            <SheetDescription className="text-xs text-gray-400 font-mono">
              {selectedJob?.assetRef} · {selectedJob?.scheduledDate ? format(new Date(selectedJob.scheduledDate + "T00:00:00"), "EEEE d MMM yyyy") : ""}
            </SheetDescription>
          </SheetHeader>

          {selectedJob && (
            <div className="flex-1 overflow-y-auto py-5 space-y-5">
              {/* Info pills */}
              <div className="flex flex-wrap gap-2">
                <span className="text-[11px] px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">
                  {getTeamName(selectedJob.teamId)}
                </span>
                <span className="text-[11px] px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 font-medium flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Est. {selectedJob.estimatedTimeMins ?? selectedJob.serviceTimeMins}m
                </span>
                {selectedJob.jobType === "reactive" && (
                  <span className="text-[11px] px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 font-medium flex items-center gap-1">
                    <Zap className="w-3 h-3" />Urgent
                  </span>
                )}
                {selectedJob.crewStatus === "reduced" && (
                  <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 font-medium flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />Reduced crew
                  </span>
                )}
                {selectedJob.crewStatus === "none" && (
                  <span className="text-[11px] px-2.5 py-1 rounded-full bg-red-100 text-red-700 font-medium flex items-center gap-1">
                    <XCircle className="w-3 h-3" />No crew
                  </span>
                )}
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Status</Label>
                <div className="grid grid-cols-2 gap-2">
                  {STATUS_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setJobStatus(opt.value)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                        jobStatus === opt.value
                          ? "border-[#00AECD] bg-[#00AECD]/5 text-[#00AECD] shadow-sm"
                          : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {opt.value === "pending"     && <RotateCcw className="w-3.5 h-3.5" />}
                      {opt.value === "in_progress" && <PlayCircle className="w-3.5 h-3.5" />}
                      {opt.value === "completed"   && <CheckCircle className="w-3.5 h-3.5" />}
                      {opt.value === "skipped"     && <XCircle className="w-3.5 h-3.5" />}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Actual time (only when completing) */}
              {jobStatus === "completed" && (
                <div className="space-y-1.5">
                  <Label htmlFor="actual-time" className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                    Actual time (minutes)
                  </Label>
                  <Input
                    id="actual-time"
                    type="number"
                    min={1}
                    placeholder={String(selectedJob.estimatedTimeMins ?? selectedJob.serviceTimeMins)}
                    value={jobActualTime}
                    onChange={e => setJobActualTime(e.target.value)}
                    className="text-sm"
                  />
                </div>
              )}

              {/* Skip reschedule notice */}
              {jobStatus === "skipped" && selectedJob.jobType === "scheduled" && (
                <div className="rounded-lg bg-orange-50 border border-orange-200 px-4 py-3 text-xs text-orange-800">
                  <p className="font-semibold mb-0.5">This job will be rescheduled</p>
                  <p>A new pending job will be created for the next scheduled occurrence.</p>
                </div>
              )}

              {/* Notes */}
              <div className="space-y-1.5">
                <Label htmlFor="job-notes" className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Notes</Label>
                <Textarea
                  id="job-notes"
                  placeholder="Add notes about this job…"
                  value={jobNotes}
                  onChange={e => setJobNotes(e.target.value)}
                  className="text-sm resize-none"
                  rows={3}
                />
              </div>
            </div>
          )}

          <SheetFooter className="pt-4 border-t gap-2">
            <Button variant="outline" onClick={() => setSelectedJob(null)}>Cancel</Button>
            <Button
              style={{ background: BRAND }}
              className="text-white hover:opacity-90 flex-1"
              onClick={handleJobSave}
              disabled={updateJob.isPending || !jobStatus}
            >
              {updateJob.isPending ? "Saving…" : "Save changes"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ── Add Urgent Job dialog ──────────────────────────────────────────── */}
      <Dialog open={urgentOpen} onOpenChange={o => { if (!o) { setUrgentOpen(false); setUrgentStep(1); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-orange-500" />
              {urgentStep === 1 ? "Add Urgent Job" : "Capacity Impact"}
            </DialogTitle>
            <DialogDescription>
              {urgentStep === 1
                ? "Add a reactive or urgent job to the schedule. It won't be touched by the schedule generator."
                : `Reviewing ${format(new Date(urgentDate + "T00:00:00"), "EEEE d MMM")} for ${getTeamName(urgentAsset?.teamId)}`}
            </DialogDescription>
          </DialogHeader>

          {/* ── Step 1 ── */}
          {urgentStep === 1 && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Asset</Label>
                {urgentAsset ? (
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-[#00AECD] bg-[#00AECD]/5">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{urgentAsset.name}</p>
                      <p className="text-[11px] text-gray-400 font-mono">{urgentAsset.reference} · {getTeamName(urgentAsset.teamId)}</p>
                    </div>
                    <button onClick={() => { setUrgentAsset(null); setUrgentSearch(""); }} className="text-xs text-gray-400 hover:text-gray-700 underline">Change</button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Input
                      placeholder="Search by name or ref…"
                      value={urgentSearch}
                      onChange={e => setUrgentSearch(e.target.value)}
                      className="text-sm"
                      autoFocus
                    />
                    {urgentSearch.length >= 2 && filteredAssets.length === 0 && (
                      <p className="text-xs text-gray-400 px-1">No assets found.</p>
                    )}
                    {filteredAssets.length > 0 && (
                      <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm max-h-48 overflow-y-auto">
                        {filteredAssets.map((a: any) => (
                          <button
                            key={a.id}
                            onClick={() => { setUrgentAsset(a); setUrgentSearch(""); }}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors"
                          >
                            <p className="text-sm font-medium text-gray-900">{a.name}</p>
                            <p className="text-[11px] text-gray-400 font-mono">{a.reference} · {getTeamName(a.teamId)}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="urgent-date" className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Date</Label>
                <Input
                  id="urgent-date"
                  type="date"
                  value={urgentDate}
                  onChange={e => setUrgentDate(e.target.value)}
                  className="text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="urgent-notes" className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                  Notes <span className="font-normal text-gray-400 normal-case">(optional)</span>
                </Label>
                <Textarea
                  id="urgent-notes"
                  placeholder="Describe the urgent work required…"
                  value={urgentNotes}
                  onChange={e => setUrgentNotes(e.target.value)}
                  className="text-sm resize-none"
                  rows={2}
                />
              </div>
            </div>
          )}

          {/* ── Step 2: Capacity Impact ── */}
          {urgentStep === 2 && dayCapacity && (
            <div className="space-y-4 py-2">
              {/* Capacity bar */}
              {(() => {
                const cap   = dayCapacity.productiveTimeMins as number;
                const urgentMins = urgentAsset?.serviceTimeMins ?? 0;
                const pushedMins = dayCapacity.jobs
                  .filter((j: any) => jobsToPush.has(j.id))
                  .reduce((s: number, j: any) => s + (j.estimatedTimeMins ?? j.serviceTimeMins ?? 0), 0);
                const afterMins = dayCapacity.totalScheduledMins - pushedMins + urgentMins;
                const pct       = Math.min((afterMins / cap) * 100, 105);
                const isOver    = afterMins > cap * 1.05;
                const isHigh    = afterMins > cap * 0.9;
                const barColor  = isOver ? "#ef4444" : isHigh ? "#f59e0b" : "#10b981";
                return (
                  <div className={`rounded-xl p-4 space-y-2 ${isOver ? "bg-red-50 border border-red-200" : isHigh ? "bg-amber-50 border border-amber-200" : "bg-green-50 border border-green-200"}`}>
                    <div className="flex items-center justify-between text-xs font-semibold" style={{ color: barColor }}>
                      <span>{isOver ? "Over capacity after adding urgent job" : isHigh ? "Near capacity" : "Within capacity"}</span>
                      <span>{(afterMins / 60).toFixed(1)}h / {(cap / 60).toFixed(1)}h ({Math.round(pct)}%)</span>
                    </div>
                    <div className="w-full h-2 bg-white/60 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} />
                    </div>
                    {jobsToPush.size > 0 && (
                      <p className="text-[11px]" style={{ color: barColor }}>
                        {jobsToPush.size} job{jobsToPush.size > 1 ? "s" : ""} selected to push → saves {(pushedMins / 60).toFixed(1)}h
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Existing jobs list */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                  Scheduled jobs that day
                  {dayCapacity.jobs.filter((j: any) => j.jobType === "scheduled").length === 0 && (
                    <span className="font-normal text-gray-400 normal-case ml-1">— none</span>
                  )}
                </p>
                <div className="space-y-1 max-h-52 overflow-y-auto">
                  {dayCapacity.jobs
                    .filter((j: any) => j.jobType === "scheduled")
                    .map((j: any) => {
                      const isPushed = jobsToPush.has(j.id);
                      const mins = j.estimatedTimeMins ?? j.serviceTimeMins ?? 0;
                      return (
                        <label
                          key={j.id}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                            isPushed ? "bg-amber-50 border-amber-200" : "bg-white border-gray-200 hover:bg-gray-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isPushed}
                            onChange={e => {
                              setJobsToPush(prev => {
                                const next = new Set(prev);
                                e.target.checked ? next.add(j.id) : next.delete(j.id);
                                return next;
                              });
                            }}
                            className="accent-amber-500 w-3.5 h-3.5 flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${isPushed ? "line-through text-gray-400" : "text-gray-900"}`}>{j.assetName}</p>
                            <p className="text-[10px] text-gray-400 truncate">{(j as any).assetDesc ?? j.assetRef}</p>
                          </div>
                          <span className="text-xs text-gray-500 flex-shrink-0">{(mins / 60).toFixed(1)}h</span>
                          {isPushed && (
                            <span className="text-[10px] text-amber-600 font-semibold flex-shrink-0">
                              → {format(new Date(nextWorkingDayStr(urgentDate) + "T00:00:00"), "d MMM")}
                            </span>
                          )}
                        </label>
                      );
                    })
                  }
                </div>
                {dayCapacity.jobs.filter((j: any) => j.jobType === "scheduled").length > 0 && (
                  <p className="text-[11px] text-gray-400 pl-1">Check jobs to push them to the next working day to make space.</p>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {urgentStep === 1 ? (
              <>
                <Button variant="outline" onClick={() => setUrgentOpen(false)}>Cancel</Button>
                <Button
                  className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
                  onClick={handleReviewImpact}
                  disabled={dayCapLoading || !urgentAsset || !urgentDate}
                >
                  {dayCapLoading ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  {dayCapLoading ? "Loading…" : "Review Capacity Impact →"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setUrgentStep(1)}>← Back</Button>
                <Button
                  className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
                  onClick={() => handleAddUrgentJobFinal()}
                  disabled={createJob.isPending}
                >
                  <Zap className="w-4 h-4" />
                  {createJob.isPending
                    ? "Adding…"
                    : jobsToPush.size > 0
                      ? `Push ${jobsToPush.size} & Add to Schedule`
                      : "Add to Schedule"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reactive Job Wizard ─────────────────────────────────────────────── */}
      {wizardOpen && (
        <ReactiveJobWizard
          teamsData={(teamsData ?? []) as TeamStub[]}
          assetsData={(allAssets?.data ?? []) as AssetStub[]}
          onClose={() => setWizardOpen(false)}
          onPublished={() => setWizardOpen(false)}
        />
      )}
    </div>
  );
}
