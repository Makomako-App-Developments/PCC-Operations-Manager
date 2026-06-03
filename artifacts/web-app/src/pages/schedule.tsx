import { useState } from "react";
import { Link } from "wouter";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  format, addWeeks, subWeeks, addDays, startOfWeek,
  addMonths, startOfMonth, endOfMonth, parseISO,
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

type ViewType = "day" | "week" | "gantt" | "gantt-day";

interface GanttAssetRow {
  assetId: string;
  assetName: string;
  assetDesc: string | null;
  gardenType: string;
  standard: string;
  frequency: string;
  serviceTimeMins: number;
  routeOrder: number | null;
  teamId: string | null;
  jobs: {
    id: string;
    scheduledDate: string;
    status: string;
    jobType?: string;
    estimatedTimeMins?: number | null;
    crewStatus?: string | null;
    teamId?: string | null;
    notes?: string | null;
    mulchType?: string | null;
  }[];
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
function JobPill({ job }: { job: { scheduledDate: string; status: string } }) {
  const done       = job.status === "completed";
  const overdue    = job.status === "overdue";
  const inProgress = job.status === "in_progress";
  const bg = done ? "#10b981" : overdue ? "#ef4444" : inProgress ? "#00AECD" : "#64748b";
  return (
    <div
      className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded text-white whitespace-nowrap leading-none"
      style={{ background: bg, opacity: done ? 0.8 : 1 }}
      title={`${format(new Date(job.scheduledDate + "T00:00:00"), "d MMM yyyy")} — ${job.status}`}
    >
      {done && <CheckCircle className="w-2.5 h-2.5 flex-shrink-0" />}
      {format(new Date(job.scheduledDate + "T00:00:00"), "d MMM")}
    </div>
  );
}

const GANTT_WEEK_COUNT = 13;
const GANTT_DAY_COUNT  = 14; // 2 weeks shown in daily Gantt

// ── Daily Gantt View ──────────────────────────────────────────────────────────
function DailyGanttView({
  ganttDayStart,
  selectedTeamIds,
  searchTerm,
  getTeamColor,
  getTeamName,
  onJobClick,
}: {
  ganttDayStart: Date;
  selectedTeamIds: string[];
  searchTerm: string;
  getTeamColor: (id?: string | null) => string;
  getTeamName: (id?: string | null) => string;
  onJobClick: (job: any) => void;
}) {
  const from = format(ganttDayStart, "yyyy-MM-dd");
  const to   = format(addDays(ganttDayStart, GANTT_DAY_COUNT - 1), "yyyy-MM-dd");
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const apiTeamId = selectedTeamIds.length === 1 ? selectedTeamIds[0] : undefined;

  const days = Array.from({ length: GANTT_DAY_COUNT }, (_, i) => {
    const d = addDays(ganttDayStart, i);
    return {
      key:       format(d, "yyyy-MM-dd"),
      dayLabel:  format(d, "EEE"),
      dateLabel: format(d, "d"),
      monthLabel:format(d, "MMM"),
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
      isToday:   format(d, "yyyy-MM-dd") === todayStr,
    };
  });

  const { data, isLoading } = useQuery<GanttData>({
    queryKey: ["/api/schedule/range", from, to, selectedTeamIds.join(",")],
    queryFn:  () => fetchScheduleRange(from, to, apiTeamId),
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
  const teamFiltered = selectedTeamIds.length > 1
    ? allRows.filter(r => selectedTeamIds.includes(r.teamId ?? ""))
    : allRows;
  const rows = q
    ? teamFiltered.filter(r =>
        r.assetName.toLowerCase().includes(q),
      )
    : teamFiltered;

  // Index jobs by date for fast lookup
  const jobsByAssetDay = new Map<string, typeof rows[0]["jobs"]>();
  for (const row of rows) {
    for (const job of row.jobs) {
      const key = `${row.assetId}|${job.scheduledDate}`;
      if (!jobsByAssetDay.has(key)) jobsByAssetDay.set(key, []);
      jobsByAssetDay.get(key)!.push(job);
    }
  }

  const COL_W  = 58; // px per day column
  const FIXED  = 550; // fixed left cols total width (40 seq + 190 site + 80 type + 70 freq + 55 mins + 115 team)

  return (
    <div className="flex flex-col h-full min-h-0">
      {rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400 italic">
          No scheduled jobs in this period — click "Generate Schedule" to create jobs.
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="text-xs border-collapse" style={{ minWidth: FIXED + GANTT_DAY_COUNT * COL_W }}>
            <thead className="sticky top-0 z-30 bg-white shadow-sm">
              {/* Month / week grouping row */}
              <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                <th colSpan={6} className="sticky bg-white z-30" style={{ left: 0, minWidth: FIXED }} />
                {days.map((d, i) => {
                  const showMonth = i === 0 || d.key.slice(8) === "01" || days[i - 1].key.slice(5, 7) !== d.key.slice(5, 7);
                  return (
                    <th
                      key={d.key}
                      className={`py-1 px-1 text-center ${d.isWeekend ? "bg-gray-50" : ""} ${d.isToday ? "bg-teal-50" : ""}`}
                      style={{ minWidth: COL_W, width: COL_W }}
                    >
                      {showMonth ? <span className="text-gray-400">{d.monthLabel}</span> : ""}
                    </th>
                  );
                })}
              </tr>
              {/* Day header row */}
              <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                <th className="text-center py-2 px-1 border-b border-gray-200 sticky bg-white z-30" style={{ left: 0, minWidth: 40, width: 40 }}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">#</span>
                    </TooltipTrigger>
                    <TooltipContent side="right">Geosequence number</TooltipContent>
                  </Tooltip>
                </th>
                <th className="text-left py-2 px-3 border-b border-gray-200 sticky bg-white z-30" style={{ left: 40,  minWidth: 190, width: 190 }}>Site</th>
                <th className="text-left py-2 px-3 border-b border-gray-200 sticky bg-white z-30" style={{ left: 230, minWidth: 80,  width: 80  }}>Specification</th>
                <th className="text-left py-2 px-3 border-b border-gray-200 sticky bg-white z-30" style={{ left: 310, minWidth: 70,  width: 70  }}>Freq</th>
                <th className="text-left py-2 px-3 border-b border-gray-200 sticky bg-white z-30" style={{ left: 380, minWidth: 55,  width: 55  }}>Mins</th>
                <th className="text-left py-2 px-3 border-b border-gray-200 sticky bg-white z-30 border-r border-gray-200" style={{ left: 435, minWidth: 115, width: 115 }}>Team</th>
                {days.map(d => (
                  <th
                    key={d.key}
                    className={`py-2 px-1 border-b border-l border-gray-200 text-center leading-tight ${d.isWeekend ? "bg-gray-50 text-gray-300" : ""} ${d.isToday ? "bg-teal-50 text-teal-600" : ""}`}
                    style={{ minWidth: COL_W, width: COL_W }}
                  >
                    <div className="font-semibold">{d.dayLabel}</div>
                    <div className={`text-[11px] font-bold ${d.isToday ? "text-teal-600" : "text-gray-700"}`}>{d.dateLabel}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const color = getTeamColor(row.teamId);
                const name  = getTeamName(row.teamId);
                const rowBg = idx % 2 === 0 ? "#ffffff" : "#f9fafb";
                return (
                  <tr
                    key={row.assetId}
                    className={`border-b border-gray-100 hover:bg-blue-50/30 transition-colors`}
                  >
                    <td className="py-1.5 px-1 sticky z-10 text-center font-mono text-gray-400 text-[10px]" style={{ left: 0,   background: rowBg, width: 40  }}>
                      {row.routeOrder ?? "—"}
                    </td>
                    <td className="py-1.5 px-3 sticky z-10" style={{ left: 40,  background: rowBg, width: 190 }}>
                      <Link href={`/assets/${row.assetId}`} className="font-semibold text-gray-800 hover:text-teal-600 hover:underline truncate max-w-[185px] block leading-snug" title={row.assetName}>{row.assetName}</Link>
                      <p className="text-gray-400 text-[10px] truncate max-w-[185px]">{row.assetDesc}</p>
                    </td>
                    <td className="py-1.5 px-3 sticky z-10" style={{ left: 230, background: rowBg, width: 80 }}>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold capitalize ${TYPE_BADGES[row.gardenType] ?? "bg-gray-100 text-gray-600"}`}>
                        {row.gardenType.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 sticky z-10 text-gray-600 capitalize" style={{ left: 310, background: rowBg, width: 70 }}>{row.frequency}</td>
                    <td className="py-1.5 px-3 sticky z-10 text-gray-600"            style={{ left: 380, background: rowBg, width: 55 }}>{row.jobs[0]?.estimatedTimeMins ?? row.serviceTimeMins}m</td>
                    <td className="py-1.5 px-3 sticky z-10 border-r border-gray-200" style={{ left: 435, background: rowBg, width: 115 }}>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                        <span className="text-gray-600 truncate max-w-[90px]">{name}</span>
                      </div>
                    </td>
                    {days.map(d => {
                      const cellJobs = jobsByAssetDay.get(`${row.assetId}|${d.key}`) ?? [];
                      const cellBg = d.isToday
                        ? (rowBg === "#f9fafb" ? "#e2f7f3" : "#edfaf6")
                        : d.isWeekend
                        ? (rowBg === "#f9fafb" ? "#f1f2f4" : "#f5f6f8")
                        : rowBg;
                      return (
                        <td
                          key={d.key}
                          className="py-1 px-1 border-l border-gray-100 align-middle text-center"
                          style={{ minWidth: COL_W, width: COL_W, background: cellBg }}
                        >
                          {cellJobs.length > 0 && (
                            <div className="flex flex-col gap-0.5 items-center">
                              {cellJobs.map(job => {
                                const done        = job.status === "completed";
                                const inProgress  = job.status === "in_progress";
                                const overdue     = job.status === "overdue";
                                const isMulching  = job.jobType === "mulching";
                                const isInfill    = job.jobType === "infill_planting";
                                const MULCH_COLOR = "#92400e";
                                const INFILL_COLOR = "#166534";
                                const bg = done       ? "#10b981"
                                         : isMulching ? "#fef3c7"
                                         : isInfill   ? "#f0fdf4"
                                         : overdue    ? "#ef4444"
                                         : inProgress ? "#00AECD"
                                         : "#64748b";
                                const textColor = isMulching && !done ? MULCH_COLOR
                                               : isInfill && !done   ? INFILL_COLOR
                                               : "white";
                                const effectiveTeamId = job.teamId ?? row.teamId;
                                return (
                                  <button
                                    key={job.id}
                                    onClick={() => onJobClick({
                                      ...job,
                                      assetName: row.assetName,
                                      teamId: effectiveTeamId,
                                      serviceTimeMins: row.serviceTimeMins,
                                    })}
                                    className="w-6 h-6 rounded-full flex items-center justify-center hover:opacity-80 transition-opacity flex-shrink-0 border"
                                    style={{
                                      background: bg,
                                      color: textColor,
                                      borderColor: isMulching && !done ? "#fde68a" : isInfill && !done ? "#86efac" : "transparent",
                                    }}
                                    title={`${row.assetName} — ${isMulching ? "Mulching" : isInfill ? "Infill Planting" : job.status.replace("_", " ")}`}
                                  >
                                    {done
                                      ? <CheckCircle className="w-3.5 h-3.5" style={{ color: (isMulching || isInfill) ? (isMulching ? MULCH_COLOR : INFILL_COLOR) : "white" }} />
                                      : isMulching
                                      ? <span className="text-[8px] font-bold leading-none">🌱</span>
                                      : isInfill
                                      ? <span className="text-[8px] font-bold leading-none">🌿</span>
                                      : <span className="text-[9px] font-bold text-white">{job.estimatedTimeMins ?? row.serviceTimeMins}m</span>
                                    }
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-center text-[10px] text-gray-400 py-3">
            {rows.length} assets · {rows.reduce((s, r) => s + r.jobs.length, 0)} jobs in this period
          </p>
        </div>
      )}
    </div>
  );
}

// ── Gantt View ────────────────────────────────────────────────────────────────
function GanttView({
  ganttStart,
  selectedTeamIds,
  searchTerm,
  getTeamColor,
  getTeamName,
}: {
  ganttStart: Date;
  selectedTeamIds: string[];
  searchTerm: string;
  getTeamColor: (id?: string | null) => string;
  getTeamName: (id?: string | null) => string;
}) {
  const ganttFrom = format(ganttStart, "yyyy-MM-dd");
  const ganttTo   = format(addWeeks(ganttStart, GANTT_WEEK_COUNT), "yyyy-MM-dd");
  const apiTeamId = selectedTeamIds.length === 1 ? selectedTeamIds[0] : undefined;

  const { data, isLoading } = useQuery<GanttData>({
    queryKey: ["/api/schedule/range", ganttFrom, ganttTo, selectedTeamIds.join(",")],
    queryFn:  () => fetchScheduleRange(ganttFrom, ganttTo, apiTeamId),
  });

  const weeks = Array.from({ length: GANTT_WEEK_COUNT }, (_, i) => {
    const monday = addWeeks(ganttStart, i);
    return { key: format(monday, "yyyy-MM-dd"), label: format(monday, "d MMM") };
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
  const teamFiltered = selectedTeamIds.length > 1
    ? allRows.filter(r => selectedTeamIds.includes(r.teamId ?? ""))
    : allRows;
  const rows = q
    ? teamFiltered.filter(r =>
        r.assetName.toLowerCase().includes(q),
      )
    : teamFiltered;

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
            <span className="text-[10px] text-gray-500">jobs in period</span>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400 italic">
          No scheduled jobs in this period — click "Generate Schedule" to create jobs.
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="text-xs border-collapse" style={{ minWidth: 550 + GANTT_WEEK_COUNT * 85 }}>
            <thead className="sticky top-0 z-30 bg-white shadow-sm">
              <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                <th className="text-center py-2.5 px-1 border-b border-gray-200 sticky bg-white z-30" style={{ left: 0, minWidth: 40, width: 40 }}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">#</span>
                    </TooltipTrigger>
                    <TooltipContent side="right">Geosequence number</TooltipContent>
                  </Tooltip>
                </th>
                <th className="text-left py-2.5 px-3 border-b border-gray-200 sticky bg-white z-30" style={{ left: 40,  minWidth: 190, width: 190 }}>Site</th>
                <th className="text-left py-2.5 px-3 border-b border-gray-200 sticky bg-white z-30" style={{ left: 230, minWidth: 80,  width: 80 }}>Specification</th>
                <th className="text-left py-2.5 px-3 border-b border-gray-200 sticky bg-white z-30" style={{ left: 310, minWidth: 70,  width: 70 }}>Freq</th>
                <th className="text-left py-2.5 px-3 border-b border-gray-200 sticky bg-white z-30" style={{ left: 380, minWidth: 55,  width: 55 }}>Time</th>
                <th className="text-left py-2.5 px-3 border-b border-gray-200 sticky bg-white z-30 border-r border-gray-200" style={{ left: 435, minWidth: 115, width: 115 }}>Team</th>
                {weeks.map(w => (
                  <th key={w.key} className="text-left py-2.5 px-3 border-b border-gray-200 border-l border-l-gray-100" style={{ minWidth: 85 }}>
                    {w.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const color  = getTeamColor(row.teamId);
                const name   = getTeamName(row.teamId);
                const rowBg  = idx % 2 === 0 ? "#ffffff" : "#f9fafb";
                const jobsByWeek = new Map<string, typeof row.jobs>(weeks.map(w => [w.key, []]));
                for (const job of row.jobs) {
                  const monday = startOfWeek(parseISO(job.scheduledDate), { weekStartsOn: 1 });
                  const wk = format(monday, "yyyy-MM-dd");
                  jobsByWeek.get(wk)?.push(job);
                }
                return (
                  <tr
                    key={row.assetId}
                    className={`border-b border-gray-100 hover:bg-blue-50/30 transition-colors ${idx % 2 === 0 ? "" : "bg-gray-50/40"}`}
                  >
                    <td className="py-2 px-1 sticky z-10 text-center font-mono text-gray-400 text-[10px]" style={{ left: 0,   background: rowBg, width: 40  }}>
                      {row.routeOrder ?? "—"}
                    </td>
                    <td className="py-2 px-3 sticky z-10" style={{ left: 40,  background: rowBg, width: 190 }}>
                      <Link href={`/assets/${row.assetId}`} className="font-semibold text-gray-800 hover:text-teal-600 hover:underline truncate max-w-[185px] block leading-snug" title={row.assetName}>{row.assetName}</Link>
                      <p className="text-gray-400 text-[10px] truncate max-w-[185px]">{row.assetDesc || row.assetRef}</p>
                    </td>
                    <td className="py-2 px-3 sticky z-10" style={{ left: 230, background: rowBg, width: 80 }}>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold capitalize ${TYPE_BADGES[row.gardenType] ?? "bg-gray-100 text-gray-600"}`}>
                        {row.gardenType.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="py-2 px-3 sticky z-10 text-gray-600 capitalize" style={{ left: 310, background: rowBg, width: 70 }}>{row.frequency}</td>
                    <td className="py-2 px-3 sticky z-10 text-gray-600"            style={{ left: 380, background: rowBg, width: 55 }}>{row.jobs[0]?.estimatedTimeMins ?? row.serviceTimeMins}m</td>
                    <td className="py-2 px-3 sticky z-10 border-r border-gray-200" style={{ left: 435, background: rowBg, width: 115 }}>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                        <span className="text-gray-600 truncate max-w-[90px]">{name}</span>
                      </div>
                    </td>
                    {weeks.map(w => (
                      <td key={w.key} className="py-2 px-2 border-l border-l-gray-100 align-top" style={{ background: rowBg }}>
                        <div className="flex flex-col gap-0.5">
                          {(jobsByWeek.get(w.key) ?? []).map(job => (
                            <JobPill key={job.id} job={job} />
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
        j.assetName?.toLowerCase().includes(q),
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
                                    <p className="text-[11px] text-gray-400 mt-0.5 truncate">{(job as any).assetDesc}</p>
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-shrink-0 pt-0.5 flex-wrap justify-end">
                                    {overdue     && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">Overdue</span>}
                                    {crewNone    && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold flex items-center gap-0.5"><XCircle className="w-2.5 h-2.5" />No crew</span>}
                                    {crewReduced && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold flex items-center gap-0.5"><AlertTriangle className="w-2.5 h-2.5" />Reduced</span>}
                                    {(job as any).isAllTeams && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5" style={{ background: "#00AECD20", color: "#00AECD" }}>
                                        <Users className="w-2.5 h-2.5" />Full Team · {((job as any).teamCompletions ?? []).length}/{teamsData.length}✓
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
  searchTerm,
  getTeamColor,
  getTeamName,
  onJobClick,
}: {
  weekData: any;
  isLoading: boolean;
  searchTerm: string;
  teamsCount: number;
  getTeamColor: (id?: string | null) => string;
  getTeamName:  (id?: string | null) => string;
  onJobClick:   (job: any) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleTeam = (key: string) => setCollapsed(s => ({ ...s, [key]: !s[key] }));
  const [showWeekend, setShowWeekend] = useState(false);
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});
  const isDayCollapsed = (teamKey: string, date: string) => {
    const key = `${teamKey}::${date}`;
    if (key in collapsedDays) return collapsedDays[key];
    return date !== todayStr; // default: today expanded, all others collapsed
  };
  const toggleDay = (teamKey: string, date: string) => {
    const key = `${teamKey}::${date}`;
    setCollapsedDays(s => ({ ...s, [key]: !isDayCollapsed(teamKey, date) }));
  };

  if (isLoading) return <div className="p-8"><Skeleton className="w-full h-96 rounded-2xl" /></div>;
  if (!weekData?.days) return null;

  const q = searchTerm.trim().toLowerCase();

  const visibleDays: any[] = weekData.days.filter((d: any) => {
    const dow = new Date(d.date + "T00:00:00").getDay();
    return showWeekend || (dow !== 0 && dow !== 6);
  });

  // Collect all jobs across visible days, tagged with their date
  const allJobs: any[] = [];
  for (const day of visibleDays) {
    const dayJobs = q
      ? day.jobs.filter((j: any) =>
          j.assetName?.toLowerCase().includes(q))
      : day.jobs;
    for (const job of dayJobs) {
      allJobs.push({ ...job, _date: day.date });
    }
  }

  // Group by team, sorted by team name
  const teamGroups = new Map<string, any[]>();
  for (const job of allJobs) {
    const key = job.teamId ?? "__unassigned__";
    if (!teamGroups.has(key)) teamGroups.set(key, []);
    teamGroups.get(key)!.push(job);
  }
  const sortedGroups = [...teamGroups.entries()]
    .filter(([, jobs]) => jobs.length > 0)
    .sort(([aId], [bId]) =>
      getTeamName(aId === "__unassigned__" ? null : aId)
        .localeCompare(getTeamName(bId === "__unassigned__" ? null : bId))
    );

  const totalJobs = allJobs.length;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 flex-shrink-0">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Route className="w-4 h-4" />
          <span className="font-medium text-gray-700">{totalJobs}</span> jobs across&nbsp;
          <span className="font-medium text-gray-700">{sortedGroups.length}</span> team{sortedGroups.length !== 1 ? "s" : ""}
        </div>
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

      {totalJobs === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center py-16 text-sm text-gray-400 italic bg-white rounded-2xl border border-gray-100 max-w-2xl px-8">
            No jobs scheduled for this week
          </div>
        </div>
      ) : (
        /* Horizontal team columns — each scrolls independently */
        <div className="flex-1 min-h-0 flex gap-3 overflow-x-auto overflow-y-hidden px-5 pb-4">
          {sortedGroups.map(([teamKey, teamJobs]) => {
            const teamId      = teamKey === "__unassigned__" ? null : teamKey;
            const color       = getTeamColor(teamId);
            const name        = getTeamName(teamId);
            const totalMin    = teamJobs.reduce((s: number, j: any) => s + (j.estimatedTimeMins ?? j.serviceTimeMins ?? 0), 0);
            const doneMins    = teamJobs.filter((j: any) => j.status === "completed").reduce((s: number, j: any) => s + (j.estimatedTimeMins ?? j.serviceTimeMins ?? 0), 0);
            const doneCount   = teamJobs.filter((j: any) => j.status === "completed").length;
            const inProgCount = teamJobs.filter((j: any) => j.status === "in_progress").length;
            const progress    = totalMin > 0 ? Math.round((doneMins / totalMin) * 100) : 0;

            // Sub-group by date, each day's jobs sorted by routeOrder
            const byDate = new Map<string, any[]>();
            for (const job of teamJobs) {
              if (!byDate.has(job._date)) byDate.set(job._date, []);
              byDate.get(job._date)!.push(job);
            }
            const sortedDays = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));

            return (
              <div
                key={teamKey}
                className="flex-shrink-0 flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
                style={{ width: 300, borderTop: `3px solid ${color}` }}
              >
                {/* Team header — sticky within column */}
                <div className="px-4 pt-3 pb-2.5 border-b border-gray-100 flex-shrink-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-bold text-gray-800 truncate">{name}</span>
                      {inProgCount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0"
                          style={{ background: color + "22", color }}>
                          Active
                        </span>
                      )}
                    </div>
                    <span
                      className="text-sm font-bold flex-shrink-0 ml-2"
                      style={{ color: progress === 100 ? "#10b981" : color }}
                    >
                      {progress}%
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-100 mb-1.5">
                    {(() => {
                      const total      = teamJobs.length;
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
                  <p className="text-[10px] text-gray-400">
                    {doneCount}/{teamJobs.length} done · {(totalMin / 60).toFixed(1)}h
                  </p>
                </div>

                {/* Scrollable job list */}
                <div className="flex-1 overflow-y-auto min-h-0">
                  {sortedDays.map(([date, dayJobs]) => {
                    const sorted = [...dayJobs].sort((a, b) => {
                      const ra = a.routeOrder ?? 999999;
                      const rb = b.routeOrder ?? 999999;
                      if (ra !== rb) return ra - rb;
                      return (a.assetName ?? "").localeCompare(b.assetName ?? "");
                    });
                    const dateObj = new Date(date + "T00:00:00");
                    const isToday = todayStr === date;
                    const dayCollapsed = isDayCollapsed(teamKey, date);
                    const dayDoneMins = sorted.filter((j: any) => j.status === "completed").reduce((s: number, j: any) => s + (j.estimatedTimeMins ?? j.serviceTimeMins ?? 0), 0);
                    const dayTotalMins = sorted.reduce((s: number, j: any) => s + (j.estimatedTimeMins ?? j.serviceTimeMins ?? 0), 0);

                    return (
                      <div key={date}>
                        {/* Day sub-header — clickable to collapse/expand */}
                        <button
                          onClick={() => toggleDay(teamKey, date)}
                          className={`w-full px-4 py-1.5 flex items-center gap-2 border-b border-gray-50 sticky top-0 z-10 text-left transition-colors ${
                            isToday ? "bg-[#00AECD]/5 hover:bg-[#00AECD]/10" : "bg-gray-50/60 hover:bg-gray-100/80"
                          }`}
                        >
                          <ChevronDown
                            className={`w-3 h-3 flex-shrink-0 transition-transform ${dayCollapsed ? "-rotate-90" : ""} ${isToday ? "text-[#00AECD]" : "text-gray-400"}`}
                          />
                          <span className={`text-[11px] font-bold uppercase tracking-wide ${isToday ? "text-[#00AECD]" : "text-gray-500"}`}>
                            {format(dateObj, "EEE d MMM")}
                          </span>
                          <Badge variant="outline" className="text-[10px] bg-white border-gray-200 font-medium ml-auto">
                            {sorted.length}
                          </Badge>
                          {dayCollapsed && dayTotalMins > 0 && (
                            <span className="text-[10px] text-gray-400 flex-shrink-0">
                              {dayDoneMins > 0 ? `${sorted.filter((j: any) => j.status === "completed").length}/` : ""}{sorted.length} · {(dayTotalMins / 60).toFixed(1)}h
                            </span>
                          )}
                        </button>

                        {/* Geosequenced job rows — hidden when collapsed */}
                        {!dayCollapsed && (
                        <div className="px-3 py-2 relative">
                          <div className="absolute left-[22px] top-6 bottom-2 w-px bg-gray-100" />
                          <div className="space-y-0">
                            {sorted.map((job: any, idx: number) => {
                              const done        = job.status === "completed";
                              const overdue     = job.status === "overdue";
                              const inProg      = job.status === "in_progress";
                              const crewNone    = job.crewStatus === "none";
                              const crewReduced = job.crewStatus === "reduced";
                              const isMulching  = job.jobType === "mulching";
                              const isInfill    = job.jobType === "infill_planting";
                              const displayTime = job.estimatedTimeMins ?? job.serviceTimeMins;

                              const MULCH_COLOR  = "#92400e";
                              const INFILL_COLOR = "#166534";
                              const dotBg     = done      ? "#d1fae5"
                                              : isMulching && !done ? "#fef3c7"
                                              : isInfill && !done   ? "#f0fdf4"
                                              : inProg    ? color + "22"
                                              : overdue   ? "#fee2e2"
                                              : "#f1f5f9";
                              const dotBorder = done      ? "#a7f3d0"
                                              : isMulching && !done ? "#fde68a"
                                              : isInfill && !done   ? "#86efac"
                                              : inProg    ? color
                                              : overdue   ? "#fca5a5"
                                              : "#e2e8f0";
                              const dotColor  = done      ? "#059669"
                                              : isMulching && !done ? MULCH_COLOR
                                              : isInfill && !done   ? INFILL_COLOR
                                              : inProg    ? color
                                              : overdue   ? "#ef4444"
                                              : "#94a3b8";

                              return (
                                <div
                                  key={job.id}
                                  onClick={() => onJobClick(job)}
                                  className={`flex items-start gap-3 py-2 px-1 rounded-xl cursor-pointer transition-colors hover:bg-gray-50 ${
                                    isMulching && !done ? "bg-amber-50/20 hover:bg-amber-50/40" :
                                    isInfill   && !done ? "bg-green-50/20 hover:bg-green-50/40" :
                                    crewNone    ? "bg-red-50/40 hover:bg-red-50/60" :
                                    crewReduced ? "bg-amber-50/30 hover:bg-amber-50/50" :
                                    done        ? "opacity-50" : ""
                                  }`}
                                >
                                  {/* Stop circle */}
                                  <div
                                    className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold border-2 z-10"
                                    style={{ borderColor: dotBorder, background: dotBg, color: dotColor }}
                                  >
                                    {done ? <CheckCircle2 className="w-3 h-3" style={{ color: "#10b981" }} /> : idx + 1}
                                  </div>

                                  {/* Job info */}
                                  <div className="flex-1 min-w-0 pt-0.5">
                                    <p className={`text-[12px] font-semibold leading-tight truncate ${done ? "line-through text-gray-400" : overdue ? "text-red-700" : "text-gray-800"}`}>
                                      {job.assetName}
                                    </p>
                                    <p className="text-[10px] text-gray-400 mt-0.5 truncate">{(job as any).assetDesc}</p>
                                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                      {isMulching  && <span className="text-[9px] px-1 py-0.5 rounded font-semibold" style={{ background: "#fef3c7", color: "#92400e" }}>Mulching</span>}
                                      {isInfill    && <span className="text-[9px] px-1 py-0.5 rounded font-semibold" style={{ background: "#f0fdf4", color: "#166534" }}>Infill</span>}
                                      {overdue     && <span className="text-[9px] px-1 py-0.5 rounded bg-red-100 text-red-700 font-semibold">Overdue</span>}
                                      {crewNone    && <span className="text-[9px] px-1 py-0.5 rounded bg-red-100 text-red-700 font-semibold flex items-center gap-0.5"><XCircle className="w-2 h-2" />No crew</span>}
                                      {crewReduced && <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold flex items-center gap-0.5"><AlertTriangle className="w-2 h-2" />Reduced</span>}
                                      <span className="text-[10px] text-gray-400 flex items-center gap-0.5 ml-auto">
                                        <Clock className="w-2.5 h-2.5" />
                                        {crewReduced || crewNone
                                          ? <><span className="line-through mr-0.5">{job.serviceTimeMins}m</span><span className={crewNone ? "text-red-600 font-semibold" : "text-amber-600 font-semibold"}>{displayTime}m</span></>
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
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
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
  const [view, setView]                 = useState<ViewType>("gantt-day");
  const [currentDate, setCurrentDate]   = useState(new Date());
  const [ganttStart, setGanttStart]     = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [ganttDayStart, setGanttDayStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [teamPickerOpen, setTeamPickerOpen] = useState(false);
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

  const apiTeamId = selectedTeamIds.length === 1 ? selectedTeamIds[0] : undefined;

  const { data: weekData, isLoading: weekLoading } = useGetScheduleWeek(
    { week: weekStr, ...(apiTeamId ? { teamId: apiTeamId } : {}) },
    { query: { queryKey: getGetScheduleWeekQueryKey({ week: weekStr, teamId: apiTeamId }) } },
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
    a.name.toLowerCase().includes(urgentSearch.toLowerCase()),
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
    if (v === "gantt")     setGanttStart(startOfWeek(currentDate, { weekStartsOn: 1 }));
    if (v === "gantt-day") setGanttDayStart(startOfWeek(currentDate, { weekStartsOn: 1 }));
    setView(v);
  };

  const prevPeriod = () => {
    if (view === "day")       setCurrentDate(d => addDays(d, -1));
    if (view === "week")      setCurrentDate(d => subWeeks(d, 1));
    if (view === "gantt")     setGanttStart(d => addWeeks(d, -GANTT_WEEK_COUNT));
    if (view === "gantt-day") setGanttDayStart(d => addWeeks(d, -1));
  };
  const nextPeriod = () => {
    if (view === "day")       setCurrentDate(d => addDays(d, 1));
    if (view === "week")      setCurrentDate(d => addWeeks(d, 1));
    if (view === "gantt")     setGanttStart(d => addWeeks(d, GANTT_WEEK_COUNT));
    if (view === "gantt-day") setGanttDayStart(d => addWeeks(d, 1));
  };

  const periodLabel = () => {
    if (view === "day")  return format(currentDate, "EEEE, d MMM yyyy");
    if (view === "week") {
      if (!weekData) return "...";
      return `${format(new Date(weekData.weekStart + "T00:00:00"), "d MMM")} – ${format(new Date(weekData.weekEnd + "T00:00:00"), "d MMM yyyy")}`;
    }
    if (view === "gantt-day") {
      const end = addDays(ganttDayStart, GANTT_DAY_COUNT - 1);
      return `${format(ganttDayStart, "d MMM")} – ${format(end, "d MMM yyyy")}`;
    }
    const ganttEnd = addWeeks(ganttStart, GANTT_WEEK_COUNT - 1);
    return `${format(ganttStart, "d MMM")} – ${format(ganttEnd, "d MMM yyyy")}`;
  };

  const getTeamColor = (teamId?: string | null) => {
    if (!teamId) return "#00AECD";
    if (!teamsData) return "#94a3b8";
    const idx = teamsData.findIndex(t => t.id === teamId);
    return TEAM_COLORS[idx % TEAM_COLORS.length] ?? "#94a3b8";
  };
  const getTeamName = (teamId?: string | null) => {
    if (!teamId) return "Full Team";
    if (!teamsData) return "Full Team";
    return teamsData.find(t => t.id === teamId)?.name ?? "Full Team";
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f5f7f9]">
      {/* Header */}
      <header className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-10 flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Maintenance Scheduler</h1>
          <p className="text-xs text-gray-400">
            {view === "gantt"
              ? `${format(ganttStart, "d MMM")} – ${format(addWeeks(ganttStart, GANTT_WEEK_COUNT - 1), "d MMM yyyy")} · Porirua City Gardens`
              : view === "gantt-day"
              ? `${format(ganttDayStart, "d MMM")} – ${format(addDays(ganttDayStart, GANTT_DAY_COUNT - 1), "d MMM yyyy")} · Porirua City Gardens`
              : weekData
                ? `Week of ${format(new Date(weekData.weekStart + "T00:00:00"), "d MMM")} – ${format(new Date(weekData.weekEnd + "T00:00:00"), "d MMM yyyy")}`
                : "Loading..."}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs font-medium shadow-sm">
            {([
              { v: "day",       Icon: CalendarDays, label: "Day"       },
              { v: "week",      Icon: LayoutGrid,   label: "Week"      },
              { v: "gantt-day", Icon: CalendarDays, label: "Daily"     },
              { v: "gantt",     Icon: Calendar,     label: "Weekly"    },
            ] as { v: ViewType; Icon: React.ElementType; label: string }[]).map(({ v, Icon, label }) => (
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
            ))}
          </div>

          <Button
            size="sm"
            variant="outline"
            className="gap-2 border-orange-200 text-orange-700 hover:bg-orange-50"
            onClick={() => setWizardOpen(true)}
          >
            <Zap className="w-4 h-4" />
            Add Unscheduled Work
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
      <div className="bg-white border-b px-8 py-2.5 flex items-center gap-4 flex-shrink-0 sticky top-[69px] z-10">
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
        {/* Multi-select team picker */}
        <Popover open={teamPickerOpen} onOpenChange={setTeamPickerOpen}>
          <PopoverTrigger asChild>
            <button
              data-testid="select-team"
              className="flex items-center gap-2 h-9 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50 transition-colors min-w-[11rem] max-w-[14rem]"
            >
              <Users className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span className="truncate flex-1 text-left">
                {selectedTeamIds.length === 0
                  ? "All Teams"
                  : selectedTeamIds.length === 1
                  ? (teamsData?.find(t => t.id === selectedTeamIds[0])?.name ?? "1 team")
                  : `${selectedTeamIds.length} teams`}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="p-1.5 w-52">
            {/* All Teams toggle */}
            <button
              onClick={() => setSelectedTeamIds([])}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                selectedTeamIds.length === 0
                  ? "bg-[#00AECD]/10 text-[#00AECD] font-semibold"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${selectedTeamIds.length === 0 ? "bg-[#00AECD] border-[#00AECD]" : "border-gray-300"}`}>
                {selectedTeamIds.length === 0 && <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </span>
              All Teams
            </button>
            <div className="my-1 border-t border-gray-100" />
            {teamsData?.map(t => {
              const checked = selectedTeamIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedTeamIds(prev =>
                    checked ? prev.filter(id => id !== t.id) : [...prev, t.id]
                  )}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                    checked ? "bg-[#00AECD]/10 text-[#00AECD] font-semibold" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${checked ? "bg-[#00AECD] border-[#00AECD]" : "border-gray-300"}`}>
                    {checked && <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </span>
                  {t.name}
                </button>
              );
            })}
          </PopoverContent>
        </Popover>

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
            searchTerm={search}
            teamsCount={teamsData?.length ?? 1}
            getTeamColor={getTeamColor}
            getTeamName={getTeamName}
            onJobClick={handleJobClick}
          />
        )}
        {view === "gantt-day" && (
          <DailyGanttView
            ganttDayStart={ganttDayStart}
            selectedTeamIds={selectedTeamIds}
            searchTerm={search}
            getTeamColor={getTeamColor}
            getTeamName={getTeamName}
            onJobClick={handleJobClick}
          />
        )}
        {view === "gantt" && (
          <GanttView
            ganttStart={ganttStart}
            selectedTeamIds={selectedTeamIds}
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
              {selectedJob?.scheduledDate ? format(new Date(selectedJob.scheduledDate + "T00:00:00"), "EEEE d MMM yyyy") : ""}
            </SheetDescription>
          </SheetHeader>

          {selectedJob && selectedJob.jobType === "mulching" ? (
            /* ── Mulching job — read-only info panel ── */
            <div className="flex-1 overflow-y-auto py-5 space-y-5">
              <div className="rounded-lg px-4 py-3 border flex items-center gap-2 text-sm font-medium" style={{ background: "#fef3c7", borderColor: "#fde68a", color: "#92400e" }}>
                <span className="text-base">🌱</span>
                Mulching job — managed via the field app
              </div>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500 font-medium">Date</dt>
                  <dd className="text-gray-900 font-semibold">
                    {selectedJob.scheduledDate ? format(new Date(selectedJob.scheduledDate + "T00:00:00"), "EEEE d MMM yyyy") : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500 font-medium">Team</dt>
                  <dd className="text-gray-900 font-semibold">{getTeamName(selectedJob.teamId)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500 font-medium">Est. time</dt>
                  <dd className="text-gray-900 font-semibold flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                    {selectedJob.estimatedTimeMins ?? selectedJob.serviceTimeMins ?? "—"}m
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500 font-medium">Status</dt>
                  <dd className="font-semibold capitalize" style={{ color: selectedJob.status === "completed" ? "#10b981" : "#92400e" }}>
                    {selectedJob.status === "completed" ? "Completed" : "Scheduled"}
                  </dd>
                </div>
                {selectedJob.notes && (
                  <div>
                    <dt className="text-gray-500 font-medium mb-1">Notes</dt>
                    <dd className="text-gray-700 text-xs bg-gray-50 rounded-lg px-3 py-2">{selectedJob.notes}</dd>
                  </div>
                )}
              </dl>
            </div>
          ) : selectedJob && selectedJob.jobType === "infill_planting" ? (
            /* ── Infill planting job — read-only info panel ── */
            <div className="flex-1 overflow-y-auto py-5 space-y-5">
              <div className="rounded-lg px-4 py-3 border flex items-center gap-2 text-sm font-medium" style={{ background: "#f0fdf4", borderColor: "#86efac", color: "#166534" }}>
                <span className="text-base">🌿</span>
                Infill planting job — managed via Programmes
              </div>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500 font-medium">Date</dt>
                  <dd className="text-gray-900 font-semibold">
                    {selectedJob.scheduledDate ? format(new Date(selectedJob.scheduledDate + "T00:00:00"), "EEEE d MMM yyyy") : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500 font-medium">Team</dt>
                  <dd className="text-gray-900 font-semibold">{getTeamName(selectedJob.teamId)}</dd>
                </div>
                {selectedJob.estimatedTimeMins && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500 font-medium">Est. time</dt>
                    <dd className="text-gray-900 font-semibold flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                      {selectedJob.estimatedTimeMins}m
                    </dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-gray-500 font-medium">Status</dt>
                  <dd className="font-semibold capitalize" style={{ color: selectedJob.status === "completed" ? "#10b981" : "#166534" }}>
                    {selectedJob.status === "completed" ? "Completed" : "Scheduled"}
                  </dd>
                </div>
                {selectedJob.notes && (
                  <div>
                    <dt className="text-gray-500 font-medium mb-1">Notes</dt>
                    <dd className="text-gray-700 text-xs bg-gray-50 rounded-lg px-3 py-2">{selectedJob.notes}</dd>
                  </div>
                )}
              </dl>
            </div>
          ) : selectedJob && (
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
            <Button variant="outline" onClick={() => setSelectedJob(null)}>
              {(selectedJob?.jobType === "mulching" || selectedJob?.jobType === "infill_planting") ? "Close" : "Cancel"}
            </Button>
            {selectedJob?.jobType !== "mulching" && selectedJob?.jobType !== "infill_planting" && (
              <Button
                style={{ background: BRAND }}
                className="text-white hover:opacity-90 flex-1"
                onClick={handleJobSave}
                disabled={updateJob.isPending || !jobStatus}
              >
                {updateJob.isPending ? "Saving…" : "Save changes"}
              </Button>
            )}
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
                      <p className="text-[11px] text-gray-400">{getTeamName(urgentAsset.teamId)}</p>
                    </div>
                    <button onClick={() => { setUrgentAsset(null); setUrgentSearch(""); }} className="text-xs text-gray-400 hover:text-gray-700 underline">Change</button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Input
                      placeholder="Search by name…"
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
                            <p className="text-[11px] text-gray-400">{getTeamName(a.teamId)}</p>
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
                            <p className="text-[10px] text-gray-400 truncate">{(j as any).assetDesc}</p>
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
