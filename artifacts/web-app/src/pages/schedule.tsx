import { useState } from "react";
import {
  useGetScheduleWeek,
  getGetScheduleWeekQueryKey,
  useListTeams,
  getListTeamsQueryKey,
  useGenerateSchedule,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  format, addWeeks, subWeeks, addDays, startOfWeek,
  addMonths, startOfMonth, endOfMonth,
} from "date-fns";
import {
  ChevronLeft, ChevronRight, Route, CheckCircle2, Clock,
  CalendarRange, CalendarDays, Calendar, LayoutGrid, CheckCircle, AlertTriangle, XCircle,
} from "lucide-react";
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
  getTeamColor,
  getTeamName,
}: {
  ganttStart: Date;
  selectedTeamId: string;
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

  const rows = data?.rows ?? [];

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
                      <p className="text-gray-400 font-mono text-[10px]">{row.assetRef}</p>
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
  getTeamColor,
  getTeamName,
}: {
  currentDate: Date;
  weekData: any;
  isLoading: boolean;
  getTeamColor: (id?: string | null) => string;
  getTeamName:  (id?: string | null) => string;
}) {
  const dayStr = format(currentDate, "yyyy-MM-dd");
  const jobs: any[] = weekData?.days?.find((d: any) => d.date === dayStr)?.jobs ?? [];

  if (isLoading) return <div className="p-8"><Skeleton className="w-full h-96 rounded-2xl" /></div>;

  return (
    <div className="p-8">
      <div className="max-w-2xl space-y-3">
        {jobs.length === 0 ? (
          <div className="text-center py-16 text-sm text-gray-400 italic bg-white rounded-2xl border border-gray-100">
            No jobs scheduled for {format(currentDate, "EEEE d MMMM yyyy")}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4 text-sm text-gray-500">
              <Route className="w-4 h-4" />
              <span className="font-medium text-gray-700">{jobs.length}</span> jobs scheduled
            </div>
            {jobs.map((job: any) => {
              const done       = job.status === "completed";
              const overdue    = job.status === "overdue";
              const crewNone   = job.crewStatus === "none";
              const crewReduced = job.crewStatus === "reduced";
              const color      = getTeamColor(job.teamId);
              const displayTime = job.estimatedTimeMins ?? job.serviceTimeMins;
              return (
                <div
                  key={job.id}
                  className={`p-4 rounded-xl border shadow-sm bg-white relative overflow-hidden ${
                    crewNone   ? "border-red-300 bg-red-50/40" :
                    crewReduced ? "border-amber-200 bg-amber-50/30" :
                    done       ? "opacity-60 border-gray-200" :
                    overdue    ? "border-red-200 bg-red-50" : "border-gray-200"
                  }`}
                >
                  <div className="absolute top-0 left-0 w-1 h-full rounded-l-xl" style={{ background: color }} />
                  <div className="pl-3 flex items-start justify-between">
                    <div>
                      <p className={`text-sm font-semibold ${done ? "line-through text-gray-400" : "text-gray-900"}`}>{job.assetName}</p>
                      <p className="text-[11px] text-gray-400 font-mono mt-0.5">{job.assetRef}</p>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      {done       && <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Done</span>}
                      {overdue    && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Overdue</span>}
                      {crewNone   && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium flex items-center gap-1"><XCircle className="w-2.5 h-2.5" />No crew</span>}
                      {crewReduced && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium flex items-center gap-1"><AlertTriangle className="w-2.5 h-2.5" />Reduced crew</span>}
                    </div>
                  </div>
                  <div className="pl-3 flex items-center justify-between mt-2 text-[11px] text-gray-400">
                    <span>{getTeamName(job.teamId)}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {crewReduced || crewNone
                        ? <><span className="line-through mr-0.5">{job.serviceTimeMins}m</span><span className={crewNone ? "text-red-600 font-semibold" : "text-amber-600 font-semibold"}>{displayTime}m</span></>
                        : <span>{displayTime}m</span>
                      }
                    </span>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

// ── Week View ─────────────────────────────────────────────────────────────────
function WeekView({
  weekData,
  isLoading,
  getTeamColor,
  getTeamName,
}: {
  weekData: any;
  isLoading: boolean;
  getTeamColor: (id?: string | null) => string;
  getTeamName:  (id?: string | null) => string;
}) {
  if (isLoading) return <div className="p-8"><Skeleton className="w-full h-96 rounded-2xl" /></div>;
  if (!weekData?.days) return null;

  return (
    <div className="flex-1 overflow-auto p-5">
      <div className="grid grid-cols-7 gap-3" style={{ minWidth: 840, minHeight: 520 }}>
        {weekData.days.map((day: any) => {
          const dateObj = new Date(day.date + "T00:00:00");
          const isToday = format(new Date(), "yyyy-MM-dd") === day.date;
          return (
            <div
              key={day.date}
              className={`rounded-xl shadow-sm flex flex-col bg-white ${isToday ? "ring-2 ring-[#00AECD]" : "border border-gray-100"}`}
              style={{ minHeight: 480 }}
            >
              <div className="px-3 py-2.5 border-b bg-gray-50/60 flex-shrink-0 flex items-center justify-between rounded-t-xl">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{format(dateObj, "EEE")}</p>
                  <p className={`text-sm font-semibold ${isToday ? "text-[#00AECD]" : "text-gray-900"}`}>{format(dateObj, "d MMM")}</p>
                </div>
                <Badge variant="outline" className="text-[10px] bg-white border-gray-200 font-medium">
                  {day.jobs.length}
                </Badge>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {day.jobs.length === 0 ? (
                  <p className="text-center text-[11px] text-gray-400 py-6 italic">No jobs</p>
                ) : day.jobs.map((job: any) => {
                  const done        = job.status === "completed";
                  const skipped     = job.status === "skipped";
                  const overdue     = job.status === "overdue";
                  const inProgress  = job.status === "in_progress";
                  const crewNone    = job.crewStatus === "none";
                  const crewReduced = job.crewStatus === "reduced";
                  const displayTime = job.estimatedTimeMins ?? job.serviceTimeMins;
                  return (
                    <div
                      key={job.id}
                      className={`p-2.5 rounded-lg border shadow-sm bg-white relative overflow-hidden ${
                        crewNone    ? "border-red-300 bg-red-50/50" :
                        crewReduced ? "border-amber-200 bg-amber-50/40" :
                        done        ? "opacity-60 border-gray-200" :
                        skipped     ? "border-orange-200 bg-orange-50" :
                        inProgress  ? "border-[#00AECD] ring-1 ring-[#00AECD]" :
                        overdue     ? "border-red-200 bg-red-50" : "border-gray-200"
                      }`}
                    >
                      <div className="absolute top-0 left-0 w-1 h-full" style={{ background: getTeamColor(job.teamId) }} />
                      <div className="pl-2">
                        <p className={`text-[11px] font-semibold truncate ${done || skipped ? "line-through text-gray-400" : "text-gray-900"}`} title={job.assetName}>
                          {job.assetName}
                        </p>
                        <p className="text-[9px] text-gray-400 font-mono mb-1">{job.assetRef}</p>
                        {crewNone && (
                          <p className="text-[9px] text-red-600 font-semibold flex items-center gap-0.5 mb-1"><XCircle className="w-2.5 h-2.5" />No crew available</p>
                        )}
                        {crewReduced && (
                          <p className="text-[9px] text-amber-600 font-semibold flex items-center gap-0.5 mb-1"><AlertTriangle className="w-2.5 h-2.5" />Reduced crew</p>
                        )}
                        <div className="flex items-center justify-between text-[10px] text-gray-400 border-t border-gray-100 pt-1.5">
                          <span className="truncate max-w-[60px]">{getTeamName(job.teamId)}</span>
                          <span className="flex items-center gap-0.5 flex-shrink-0">
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
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Schedule Page ────────────────────────────────────────────────────────
export default function Schedule() {
  const [view, setView]                 = useState<ViewType>("week");
  const [currentDate, setCurrentDate]   = useState(new Date());
  const [ganttStart, setGanttStart]     = useState(() => startOfMonth(new Date()));
  const [selectedTeamId, setSelectedTeamId] = useState("all");
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [genFrom, setGenFrom]           = useState("");
  const [genTo, setGenTo]               = useState("");

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
      onSuccess: (data) => {
        setDialogOpen(false);
        toast({
          title: "Schedule generated",
          description: `${data.jobsCreated} jobs created from ${format(new Date(genFrom), "d MMM yyyy")} to ${format(new Date(genTo), "d MMM yyyy")}.`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/schedule/week"] });
        queryClient.invalidateQueries({ queryKey: ["/api/schedule/range"] });
      },
      onError: (err: any) => {
        toast({ title: "Generation failed", description: err?.message || "Unknown error", variant: "destructive" });
      },
    },
  });

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
              getTeamColor={getTeamColor}
              getTeamName={getTeamName}
            />
          </div>
        )}
        {view === "week" && (
          <WeekView
            weekData={weekData}
            isLoading={weekLoading}
            getTeamColor={getTeamColor}
            getTeamName={getTeamName}
          />
        )}
        {view === "gantt" && (
          <GanttView
            ganttStart={ganttStart}
            selectedTeamId={selectedTeamId}
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
              Jobs will be created for all active assets within the selected date range, skipping dates that already have jobs.
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
                Jobs from <span className="font-medium text-gray-700">{format(new Date(genFrom), "d MMM yyyy")}</span> to{" "}
                <span className="font-medium text-gray-700">{format(new Date(genTo), "d MMM yyyy")}</span> — existing jobs won't be duplicated.
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
    </div>
  );
}
