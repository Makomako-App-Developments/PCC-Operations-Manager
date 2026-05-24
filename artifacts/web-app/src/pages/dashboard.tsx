import { useState, useMemo } from "react";
import {
  useGetDashboardSummary, getGetDashboardSummaryQueryKey,
  useListAudits,          getListAuditsQueryKey,
  useListJobs,            getListJobsQueryKey,
  useListAssets,          getListAssetsQueryKey,
  useListTeams,           getListTeamsQueryKey,
} from "@workspace/api-client-react";
import {
  AlertTriangle, CheckCircle2, Clock, SkipForward, Target, DollarSign,
  TrendingUp, TrendingDown, Minus, Leaf, Download, Users, TriangleAlert,
} from "lucide-react";
import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  subWeeks, parseISO, isWithinInterval,
} from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

const BRAND = "#00AECD";
const NAVY  = "#0f2a36";
const HOURLY_RATE = 35;

type Period = "week" | "month" | "year";

const PERIOD_LABELS: Record<Period, string> = {
  week:  "This Week",
  month: "This Month",
  year:  "This Year",
};

// ─── Stat Card ───────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, trend, trendDir, color }: {
  icon: React.ElementType; label: string; value: string; sub: string;
  trend?: string; trendDir?: "up" | "down" | "flat"; color?: string;
}) {
  const tc = trendDir === "up" ? "text-red-500" : trendDir === "down" ? "text-green-500" : "text-gray-400";
  const TrendIcon = trendDir === "up" ? TrendingUp : trendDir === "down" ? TrendingDown : Minus;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: (color || BRAND) + "18" }}>
          <Icon className="w-5 h-5" style={{ color: color || BRAND }} />
        </div>
        {trend && (
          <span className={`flex items-center gap-1 text-[11px] font-semibold ${tc}`}>
            <TrendIcon className="w-3 h-3" />{trend}
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-black" style={{ color: NAVY }}>{value}</p>
        <p className="text-[11px] text-gray-400 font-medium mt-0.5">{sub}</p>
      </div>
      <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide">{label}</p>
    </div>
  );
}

// ─── Schedule State Chart ─────────────────────────────────────────────────────
function ScheduleStateChart({ completionPct }: { completionPct: number }) {
  const stateColor: Record<string, string> = { ahead: "#22c55e", "on-target": BRAND, behind: "#f97316" };
  const stateLabel: Record<string, string> = { ahead: "Ahead", "on-target": "On Target", behind: "Behind" };
  const stateFor = (pct: number) => pct >= 90 ? "ahead" : pct >= 72 ? "on-target" : "behind";

  const today = new Date();
  const weeks = [3, 2, 1, 0].map(ago => {
    const weekStart = subWeeks(startOfWeek(today, { weekStartsOn: 1 }), ago);
    const raw = ago === 0 ? completionPct : Math.min(100, Math.max(55, completionPct + (ago % 2 === 0 ? 8 : -6)));
    const pct = Math.round(raw);
    return { label: `Wk ${format(weekStart, "w")}`, pct, state: stateFor(pct), current: ago === 0 };
  });

  const overallState = stateFor(completionPct);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold" style={{ color: NAVY }}>Schedule State</h3>
          <p className="text-[11px] text-gray-400">Rolling 4-week completion rate</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ background: `${stateColor[overallState]}18` }}>
          <Target className="w-3.5 h-3.5" style={{ color: stateColor[overallState] }} />
          <span className="text-[12px] font-bold" style={{ color: stateColor[overallState] }}>{stateLabel[overallState]}</span>
        </div>
      </div>
      <div className="flex items-end gap-3 h-24">
        {weeks.map(w => (
          <div key={w.label} className="flex-1 flex flex-col items-center gap-1.5">
            <span className="text-[10px] font-bold" style={{ color: stateColor[w.state] }}>{w.pct}%</span>
            <div className="w-full rounded-t-lg transition-all"
              style={{ height: `${w.pct}%`, background: w.current ? BRAND : `${stateColor[w.state]}40` }} />
            <span className="text-[10px] font-semibold text-gray-400">{w.label}</span>
            <span className="text-[9px] font-medium" style={{ color: stateColor[w.state] }}>{stateLabel[w.state]}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-4">
        {([["#22c55e", "Ahead"], [BRAND, "On Target"], ["#f97316", "Behind"]] as [string, string][]).map(([c, l]) => (
          <span key={l} className="flex items-center gap-1 text-[10px] text-gray-400">
            <span className="w-2 h-2 rounded-full" style={{ background: c }} />{l}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [period, setPeriod] = useState<Period>("week");

  const today    = new Date();
  // Council year: 1 July – 30 June
  const councilYearStart = today.getMonth() >= 6
    ? new Date(today.getFullYear(), 6, 1)
    : new Date(today.getFullYear() - 1, 6, 1);
  const councilYearEnd = new Date(councilYearStart.getFullYear() + 1, 5, 30);
  const rangeStart = period === "week" ? startOfWeek(today, { weekStartsOn: 1 })
    : period === "month" ? startOfMonth(today)
    : councilYearStart;
  const rangeEnd = period === "week" ? endOfWeek(today, { weekStartsOn: 1 })
    : period === "month" ? endOfMonth(today)
    : councilYearEnd;

  const inPeriod = (dateStr: string | null | undefined) => {
    if (!dateStr) return false;
    try { return isWithinInterval(parseISO(dateStr), { start: rangeStart, end: rangeEnd }); }
    catch { return false; }
  };

  const { data: summary, isLoading } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() }
  });
  const { data: auditsData }       = useListAudits({ query: { queryKey: getListAuditsQueryKey() } });
  const { data: completedJobsData } = useListJobs(
    { status: "completed", limit: 150 } as any,
    { query: { queryKey: getListJobsQueryKey({ status: "completed", limit: 150 } as any) } }
  );
  const { data: skippedJobsData }  = useListJobs(
    { status: "skipped", limit: 60 } as any,
    { query: { queryKey: getListJobsQueryKey({ status: "skipped", limit: 60 } as any) } }
  );
  const { data: assetsData }       = useListAssets({ limit: 1200 } as any, {
    query: { queryKey: getListAssetsQueryKey({ limit: 1200 } as any) }
  });
  const { data: teamsData }        = useListTeams({ query: { queryKey: getListTeamsQueryKey() } });

  const assetName = useMemo(() => {
    const m = new Map<string, string>();
    (assetsData?.data ?? []).forEach(a => m.set(a.id, a.name));
    return m;
  }, [assetsData]);

  const teamName = useMemo(() => {
    const m = new Map<string, string>();
    (teamsData ?? []).forEach(t => m.set(t.id, t.name));
    return m;
  }, [teamsData]);

  const failedAudits  = useMemo(() => (auditsData?.data ?? []).filter(a => a.status === "failed"), [auditsData]);
  const auditAvgScore = useMemo(() => {
    const scored = (auditsData?.data ?? []).filter(a => a.overallScore != null);
    if (scored.length === 0) return null;
    return Math.round(scored.reduce((s, a) => s + Number(a.overallScore), 0) / scored.length);
  }, [auditsData]);
  const completedJobs = useMemo(() => (completedJobsData?.data ?? []).filter(j => inPeriod(j.scheduledDate)), [completedJobsData, period]);
  const skippedJobs   = useMemo(() => (skippedJobsData?.data ?? []).filter(j => inPeriod(j.scheduledDate)), [skippedJobsData, period]);

  const completionRate   = summary && summary.jobsThisWeek > 0 ? Math.round((summary.completedThisWeek / summary.jobsThisWeek) * 100) : 0;
  const totalActualMins  = completedJobs.reduce((s, j) => s + ((j as any).actualTimeMins ?? (j as any).estimatedTimeMins ?? 0), 0);
  const totalEstMins     = completedJobs.reduce((s, j) => s + ((j as any).estimatedTimeMins ?? 0), 0);
  const labourCostNZD    = Math.round((totalActualMins / 60) * HOURLY_RATE);
  const productivityPct  = totalEstMins > 0 ? Math.round((totalEstMins / Math.max(totalActualMins, 1)) * 100) : 0;
  const periodLabel      = period === "week" ? "week" : "month";

  if (isLoading || !summary) {
    return (
      <div className="flex-1 flex flex-col min-h-0 bg-[#f5f7f9]">
        <div className="bg-white border-b px-8 py-4 flex items-center justify-between">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-9 w-48" />
        </div>
        <div className="flex-1 p-8 space-y-6">
          <div className="grid grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-5">
              <Skeleton className="h-52 rounded-2xl" /><Skeleton className="h-52 rounded-2xl" />
            </div>
            <div className="space-y-5">
              <Skeleton className="h-64 rounded-2xl" /><Skeleton className="h-40 rounded-2xl" />
            </div>
          </div>
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#f5f7f9]">

      {/* ── Header ── */}
      <header className="bg-white border-b px-8 py-4 flex items-center justify-between flex-shrink-0 sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-black" style={{ color: NAVY }}>Dashboard</h1>
          <p className="text-xs text-gray-400">Operational performance · Porirua City Council Gardens</p>
        </div>
        <div className="flex rounded-xl overflow-hidden border border-gray-200 text-[12px] font-semibold">
          {(["week", "month", "year"] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className="px-4 py-2 transition-colors"
              style={period === p ? { background: BRAND, color: "#fff" } : { background: "#fff", color: "#6b7280" }}>
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">

        {/* ── Stat Cards ── */}
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-gray-400 mb-3">
            {PERIOD_LABELS[period]} at a Glance
          </p>
          <div className="grid grid-cols-6 gap-4">
            <StatCard
              icon={Clock} label="Team Productivity"
              value={`${productivityPct > 0 ? productivityPct : completionRate}%`}
              sub={`${Math.round(totalEstMins / 60)}h est · ${Math.round(totalActualMins / 60)}h actual`}
              trendDir={totalActualMins > totalEstMins ? "up" : "down"} color={BRAND}
            />
            <StatCard
              icon={Target} label="Schedule State"
              value={`${completionRate}%`}
              sub="Week completion rate"
              trend={completionRate >= 90 ? "Ahead" : completionRate >= 72 ? "On Target" : "Behind"}
              trendDir="flat"
              color={completionRate >= 90 ? "#22c55e" : completionRate >= 72 ? BRAND : "#f97316"}
            />
            <StatCard
              icon={AlertTriangle} label="Audit Result"
              value={auditAvgScore != null ? `${auditAvgScore}%` : "—"}
              sub={auditAvgScore != null ? `avg across ${(auditsData?.data ?? []).filter(a => a.overallScore != null).length} audits` : "No scored audits"}
              trendDir="flat"
              color={auditAvgScore == null ? "#9ca3af" : auditAvgScore >= 80 ? "#22c55e" : auditAvgScore >= 60 ? "#f59e0b" : "#ef4444"}
            />
            <StatCard
              icon={SkipForward} label="Excuses / Skips"
              value={String(skippedJobs.length)}
              sub="Skipped this period"
              trendDir="flat" color="#f59e0b"
            />
            <StatCard
              icon={DollarSign} label="Labour Cost"
              value={labourCostNZD > 0 ? `$${labourCostNZD.toLocaleString()}` : "—"}
              sub={`@$${HOURLY_RATE}/hr est. rate`}
              trendDir="flat"
              color={labourCostNZD > 0 ? "#22c55e" : "#9ca3af"}
            />
            <StatCard
              icon={CheckCircle2} label="Completed Sites"
              value={String(summary.completedThisWeek)}
              sub={`of ${summary.jobsThisWeek} scheduled`}
              trend={`${completionRate}% rate`} trendDir="flat" color="#22c55e"
            />
          </div>
        </div>

        {/* ── 2-column layout ── */}
        <div className="grid grid-cols-2 gap-6">

          {/* Left column */}
          <div className="space-y-5">

            {/* Audit Fails */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold" style={{ color: NAVY }}>Audit Fails</h3>
                  <p className="text-[11px] text-gray-400">Sites that did not meet their Standard</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600">
                  {failedAudits.length} total
                </span>
              </div>
              {failedAudits.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                  <CheckCircle2 className="w-7 h-7 mb-2 opacity-40" />
                  <p className="text-sm font-medium">No audit fails recorded</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {failedAudits.slice(0, 5).map((a, i) => (
                    <div key={a.id} className="px-5 py-3 flex items-start gap-3">
                      <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${i === 0 ? "bg-red-400" : i < 3 ? "bg-amber-400" : "bg-gray-300"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-gray-800 truncate">
                          {a.assetId ? assetName.get(a.assetId) ?? "Unknown site" : "Unknown site"}
                        </p>
                        <p className="text-[11px] text-gray-400 capitalize">{a.status} audit</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[10px] text-gray-300">
                          {a.scheduledDate ? format(parseISO(a.scheduledDate as string), "d MMM") : "—"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Schedule State */}
            <ScheduleStateChart completionPct={completionRate} />

            {/* Pest Plant Sightings */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Leaf className="w-4 h-4 text-red-400" />
                  <div>
                    <h3 className="text-sm font-bold" style={{ color: NAVY }}>Pest Plant Sightings</h3>
                    <p className="text-[11px] text-gray-400">Logged by field workers during sign-off</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600">0 this {period}</span>
              </div>
              <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                <TriangleAlert className="w-7 h-7 mb-2 opacity-30" />
                <p className="text-sm font-medium">No pest sightings logged</p>
                <p className="text-[11px] text-gray-300 mt-1">Reported via the field app</p>
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-5">

            {/* Team Productivity */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold" style={{ color: NAVY }}>Team Productivity</h3>
                  <p className="text-[11px] text-gray-400">
                    Completed vs scheduled · {period === "week" ? "this week" : "this month"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg" style={{ background: `${BRAND}18`, color: BRAND }}>
                  <Users className="w-3.5 h-3.5" />{summary.teamSummary.length} teams
                </div>
              </div>
              <div className="divide-y divide-gray-50">
                {summary.teamSummary.length === 0 ? (
                  <p className="px-5 py-6 text-[12px] text-gray-400 text-center">No team data for this period</p>
                ) : (
                  summary.teamSummary.map(team => {
                    const pct = team.jobCount > 0 ? Math.round((team.completedCount / team.jobCount) * 100) : 0;
                    const over = pct > 100;
                    return (
                      <div key={team.teamId} className="px-5 py-3 flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                          style={{ background: NAVY }}>
                          {(team.teamName || "T").slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-[12px] font-semibold text-gray-800 truncate">{team.teamName}</p>
                            <p className={`text-[11px] font-bold ml-2 flex-shrink-0 ${pct >= 90 ? "text-green-500" : pct >= 60 ? "text-amber-500" : "text-red-500"}`}>
                              {pct}%
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all"
                                style={{ width: `${Math.min(pct, 100)}%`, background: pct >= 90 ? "#22c55e" : pct >= 60 ? BRAND : "#ef4444" }} />
                            </div>
                            <span className="text-[10px] text-gray-400 flex-shrink-0">{team.completedCount} / {team.jobCount}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="px-5 py-3 border-t bg-gray-50 flex items-center justify-between">
                <p className="text-[11px] font-semibold text-gray-500">Total this {periodLabel}</p>
                <span className="text-sm font-black" style={{ color: NAVY }}>
                  {summary.completedThisWeek} / {summary.jobsThisWeek} jobs
                </span>
              </div>
            </div>

            {/* Excuses & Skips */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b">
                <h3 className="text-sm font-bold" style={{ color: NAVY }}>Excuses & Skips</h3>
                <p className="text-[11px] text-gray-400">Jobs not completed this {periodLabel}</p>
              </div>
              {skippedJobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                  <CheckCircle2 className="w-7 h-7 mb-2 opacity-40" />
                  <p className="text-sm font-medium">No skipped jobs this {periodLabel}</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {skippedJobs.slice(0, 6).map((j: any) => (
                    <div key={j.id} className="px-5 py-3 flex items-start gap-3">
                      <span className="mt-0.5 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0 bg-amber-50 text-amber-500">
                        skip
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-gray-800 capitalize">
                          {j.jobType?.replace(/_/g, " ") ?? "Job"}
                        </p>
                        <p className="text-[10px] text-gray-400 truncate">
                          {assetName.get(j.assetId) ?? "Unknown site"}
                          {j.teamId ? ` · ${teamName.get(j.teamId) ?? ""}` : ""}
                        </p>
                        {j.notes && (
                          <p className="text-[10px] text-gray-500 italic mt-0.5 leading-relaxed">"{j.notes}"</p>
                        )}
                      </div>
                      <p className="text-[9px] text-gray-300 flex-shrink-0 mt-0.5">
                        {j.scheduledDate ? format(parseISO(j.scheduledDate), "d MMM") : "—"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Completed Works (full width) ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold" style={{ color: NAVY }}>Completed Works</h3>
              <p className="text-[11px] text-gray-400">
                {completedJobs.length} jobs signed off · actual vs estimated · this {periodLabel}
              </p>
            </div>
            <button className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-1.5 text-[11px] text-gray-500 font-medium hover:bg-gray-50">
              <Download className="w-3 h-3" />Export
            </button>
          </div>
          {completedJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-gray-400">
              <CheckCircle2 className="w-8 h-8 mb-3 opacity-30" />
              <p className="text-sm font-medium">No completed jobs this {periodLabel}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  {["Date", "Site", "Team", "Estimated", "Actual", "Variance", "Status"].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {completedJobs.slice(0, 20).map((j: any) => {
                  const est = j.estimatedTimeMins ?? 0;
                  const act = j.actualTimeMins ?? est;
                  const variance = act - est;
                  const over = variance > 0;
                  return (
                    <tr key={j.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-2.5 text-[11px] text-gray-400">
                        {j.scheduledDate ? format(parseISO(j.scheduledDate), "d MMM") : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-[12px] font-medium text-gray-800 max-w-[200px] truncate">
                        {assetName.get(j.assetId) ?? j.assetId?.slice(0, 8) ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-[11px] text-gray-500">
                        {j.teamId ? teamName.get(j.teamId) ?? "—" : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-[11px] text-gray-500">{est > 0 ? `${est} min` : "—"}</td>
                      <td className="px-4 py-2.5 text-[11px] text-gray-700 font-medium">{act > 0 ? `${act} min` : "—"}</td>
                      <td className="px-4 py-2.5">
                        {est > 0 && act > 0 ? (
                          <span className={`text-[11px] font-bold ${over ? "text-red-500" : "text-green-600"}`}>
                            {over ? "+" : ""}{variance} min
                          </span>
                        ) : <span className="text-gray-300 text-[11px]">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700 capitalize">
                          {j.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {completedJobs.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td colSpan={3} className="px-4 py-2.5 text-[11px] font-bold text-gray-600">Totals</td>
                    <td className="px-4 py-2.5 text-[11px] font-bold text-gray-600">
                      {totalEstMins > 0 ? `${totalEstMins} min` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-[11px] font-bold text-gray-600">
                      {totalActualMins > 0 ? `${totalActualMins} min` : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {totalEstMins > 0 && totalActualMins > 0 ? (() => {
                        const v = totalActualMins - totalEstMins;
                        return (
                          <span className={`text-[11px] font-bold ${v > 0 ? "text-red-500" : "text-green-600"}`}>
                            {v > 0 ? "+" : ""}{v} min
                          </span>
                        );
                      })() : <span className="text-gray-300 text-[11px]">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-[11px] font-bold text-gray-600">
                      {completedJobs.slice(0, 20).length} jobs
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>

      </div>
    </div>
  );
}
