import { useState, useEffect } from "react";
import { useGetDashboardSummary, getGetDashboardSummaryQueryKey, useListJobs, getListJobsQueryKey, useListAudits, getListAuditsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { CheckCircle2, AlertTriangle, TrendingUp, Percent, History, BarChart2, ArrowRight, Download } from "lucide-react";

const BRAND = "#00AECD";
const NAVY  = "#0f2a36";

const TYPE_COLORS: Record<string, string> = {
  annuals:          "#f59e0b",
  roses_perennials: "#ec4899",
  ornamental:       "#8b5cf6",
  amenity:          BRAND,
  rain_garden:      "#06b6d4",
  reveg:            "#84cc16",
  bush:             "#16a34a",
  tree_planter_pits:"#78716c",
  hedge:            "#6b7280",
};

const JOB_STATUS_COLORS: Record<string, string> = {
  pending:     "#3b82f6",
  in_progress: "#00AECD",
  completed:   "#16a34a",
  skipped:     "#ea580c",
  overdue:     "#dc2626",
};

const ACTION_COLORS: Record<string, string> = {
  INSERT: "#16a34a",
  UPDATE: BRAND,
  DELETE: "#dc2626",
};
const ACTION_LABELS: Record<string, string> = {
  INSERT: "Created",
  UPDATE: "Updated",
  DELETE: "Archived",
};

function MetricCard({ icon: Icon, label, value, sub, color }: any) {
  return (
    <Card className="rounded-2xl border-0 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className="text-3xl font-bold text-gray-900">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: color + "18" }}>
            <Icon className="w-5 h-5" style={{ color }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-800 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: <span className="font-bold">{p.value}</span></p>
      ))}
    </div>
  );
};

interface ChangeEntry {
  id: string;
  assetId: string;
  assetName: string;
  assetReference: string;
  action: string;
  changedAt: string;
  changedByName: string;
  changes: Array<{ field: string; label: string; old: any; new: any }>;
}

function AssetChangesTab() {
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [from, setFrom] = useState(thirtyDaysAgo.toISOString().slice(0, 10));
  const [to,   setTo]   = useState(today.toISOString().slice(0, 10));
  const [data, setData]       = useState<ChangeEntry[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200", offset: "0" });
      if (from) params.set("from", new Date(from).toISOString());
      if (to)   params.set("to",   new Date(to + "T23:59:59").toISOString());
      const r = await fetch(`/api/reports/asset-changes?${params}`, { credentials: "include" });
      if (!r.ok) throw new Error();
      const json = await r.json();
      setData(json.data);
      setTotal(json.total);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleExportCSV = () => {
    const rows = [
      ["Date", "Asset Reference", "Asset Name", "Action", "Changed By", "Fields Changed", "Details"],
      ...data.map(e => [
        new Date(e.changedAt).toLocaleString("en-NZ"),
        e.assetReference,
        e.assetName,
        ACTION_LABELS[e.action] ?? e.action,
        e.changedByName,
        e.changes.length.toString(),
        e.changes.map(c => `${c.label}: ${c.old ?? "—"} → ${c.new ?? "—"}`).join("; "),
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `asset-changes-${from}-to-${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Filters */}
      <Card className="rounded-2xl border-0 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">From</p>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="text-sm w-40 h-9" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">To</p>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="text-sm w-40 h-9" />
            </div>
            <Button onClick={load} disabled={loading} size="sm" style={{ background: BRAND }} className="text-white h-9">
              {loading ? "Loading…" : "Apply"}
            </Button>
            {data.length > 0 && (
              <Button onClick={handleExportCSV} variant="outline" size="sm" className="h-9 gap-1.5">
                <Download className="w-3.5 h-3.5" /> Export CSV
              </Button>
            )}
            <span className="text-xs text-gray-400 ml-auto">{total} record{total !== 1 ? "s" : ""}</span>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="rounded-2xl border-0 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
          </div>
        ) : data.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">No asset changes found in this date range.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="text-left px-5 py-3">Date / Time</th>
                <th className="text-left px-5 py-3">Asset</th>
                <th className="text-left px-5 py-3">Action</th>
                <th className="text-left px-5 py-3">Changed By</th>
                <th className="text-left px-5 py-3">Fields</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map(entry => (
                <>
                  <tr
                    key={entry.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                  >
                    <td className="px-5 py-3 text-gray-500 whitespace-nowrap text-xs">
                      {new Date(entry.changedAt).toLocaleString("en-NZ", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900 leading-tight">{entry.assetName}</p>
                      <p className="text-[10px] font-mono text-gray-400">{entry.assetReference}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase"
                        style={{ background: (ACTION_COLORS[entry.action] ?? BRAND) + "18", color: ACTION_COLORS[entry.action] ?? BRAND }}
                      >
                        {ACTION_LABELS[entry.action] ?? entry.action}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{entry.changedByName}</td>
                    <td className="px-5 py-3 text-gray-500">
                      {entry.changes.length > 0 ? (
                        <span className="text-xs">{entry.changes.length} field{entry.changes.length !== 1 ? "s" : ""}</span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-3 text-gray-400">
                      {entry.changes.length > 0 && (
                        <ArrowRight className={`w-3.5 h-3.5 transition-transform ${expanded === entry.id ? "rotate-90" : ""}`} />
                      )}
                    </td>
                  </tr>
                  {expanded === entry.id && entry.changes.length > 0 && (
                    <tr key={entry.id + "-detail"} className="bg-blue-50/40">
                      <td colSpan={6} className="px-5 py-3">
                        <div className="space-y-1.5">
                          {entry.changes.map(c => (
                            <div key={c.field} className="flex items-center gap-2 text-xs flex-wrap">
                              <span className="font-semibold text-gray-700 w-36 flex-shrink-0">{c.label}</span>
                              <span className="line-through text-red-500 max-w-[180px] truncate">{String(c.old ?? "—")}</span>
                              <ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                              <span className="text-green-700 font-medium max-w-[180px] truncate">{String(c.new ?? "—")}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

export default function Reports() {
  const [tab, setTab] = useState<"performance" | "asset-changes">("performance");

  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() },
  });
  const { data: jobsData, isLoading: loadingJobs } = useListJobs({ limit: 200 }, {
    query: { queryKey: getListJobsQueryKey({ limit: 200 }) },
  });
  const { data: auditsData } = useListAudits({
    query: { queryKey: getListAuditsQueryKey() },
  });

  const jobs   = jobsData?.data ?? [];
  const audits = auditsData?.data ?? [];

  const jobStatusCounts = jobs.reduce<Record<string, number>>((acc, j) => {
    acc[j.status] = (acc[j.status] ?? 0) + 1;
    return acc;
  }, {});
  const jobStatusData = Object.entries(jobStatusCounts).map(([status, count]) => ({
    name:  status.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase()),
    count,
    fill:  JOB_STATUS_COLORS[status] ?? "#94a3b8",
  }));

  const assetTypeData = (summary?.assetsByType ?? []).map(a => ({
    name:  a.gardenType.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase()),
    value: a.count,
    fill:  TYPE_COLORS[a.gardenType] ?? "#94a3b8",
  }));

  const teamData = (summary?.teamSummary ?? []).map(t => ({
    name:      t.teamName,
    Total:     t.jobCount,
    Completed: t.completedCount,
    rate:      t.jobCount > 0 ? Math.round((t.completedCount / t.jobCount) * 100) : 0,
  }));

  const auditsPassed   = audits.filter((a: any) => a.status === "passed").length;
  const auditsTotal    = audits.length;
  const complianceRate = auditsTotal > 0 ? Math.round((auditsPassed / auditsTotal) * 100) : 0;
  const completionRate = summary?.jobsThisWeek
    ? Math.round((summary.completedThisWeek / summary.jobsThisWeek) * 100)
    : 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f5f7f9]">
      <header className="bg-white border-b px-8 py-4 sticky top-0 z-10 flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-900">Reports &amp; Analytics</h1>
        <p className="text-xs text-gray-400">Live performance metrics and asset change history</p>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b px-8 flex-shrink-0">
        <div className="flex gap-0">
          {[
            { id: "performance",    label: "Performance",     icon: BarChart2 },
            { id: "asset-changes",  label: "Asset Changes",   icon: History   },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as any)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                tab === t.id
                  ? "border-[#00AECD] text-[#00AECD]"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-8">
        {tab === "asset-changes" ? (
          <AssetChangesTab />
        ) : loadingSummary ? (
          <div className="space-y-6">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="w-full h-40 rounded-2xl" />)}
          </div>
        ) : (
          <div className="space-y-8">
            {/* KPI strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard icon={CheckCircle2} label="Jobs Completed This Week"  value={summary?.completedThisWeek ?? 0}  sub={`of ${summary?.jobsThisWeek ?? 0} scheduled`} color="#16a34a" />
              <MetricCard icon={TrendingUp}  label="Weekly Completion Rate"    value={`${completionRate}%`}              sub="this week"                                       color={BRAND} />
              <MetricCard icon={AlertTriangle} label="Overdue Jobs"            value={summary?.overdueJobs ?? 0}         sub="need attention"                                 color="#dc2626" />
              <MetricCard icon={Percent}     label="Audit Compliance"          value={`${complianceRate}%`}              sub={`${auditsPassed} of ${auditsTotal} passed`}     color="#8b5cf6" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <Card className="rounded-2xl border-0 shadow-sm">
                <CardHeader className="pb-2 pt-5 px-6">
                  <CardTitle className="text-sm font-semibold text-gray-700">Job Status Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  {loadingJobs ? <Skeleton className="w-full h-52" /> : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={jobStatusData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6b7280" }} />
                        <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} allowDecimals={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="count" name="Jobs" radius={[6, 6, 0, 0]}>
                          {jobStatusData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-0 shadow-sm">
                <CardHeader className="pb-2 pt-5 px-6">
                  <CardTitle className="text-sm font-semibold text-gray-700">Assets by Specification</CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  {assetTypeData.length === 0 ? (
                    <div className="flex items-center justify-center h-52 text-gray-400 text-sm">No data</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={assetTypeData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value" nameKey="name">
                          {assetTypeData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                        </Pie>
                        <Tooltip formatter={(v: any) => [`${v} assets`, ""]} />
                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-2xl border-0 shadow-sm">
              <CardHeader className="pb-2 pt-5 px-6">
                <CardTitle className="text-sm font-semibold text-gray-700">Team Performance — All Time</CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                {teamData.length === 0 ? (
                  <div className="flex items-center justify-center h-52 text-gray-400 text-sm">No team data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={teamData} margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6b7280" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} allowDecimals={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Total"     name="Total Jobs"     fill={NAVY}  radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Completed" name="Jobs Completed" fill={BRAND} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {teamData.length > 0 && (
              <Card className="rounded-2xl border-0 shadow-sm overflow-hidden">
                <CardHeader className="pb-2 pt-5 px-6">
                  <CardTitle className="text-sm font-semibold text-gray-700">Team Completion Rates</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        <th className="text-left px-6 py-3">Team</th>
                        <th className="text-left px-6 py-3">Total Jobs</th>
                        <th className="text-left px-6 py-3">Completed</th>
                        <th className="text-left px-6 py-3">Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {teamData.map(t => (
                        <tr key={t.name} className="hover:bg-gray-50">
                          <td className="px-6 py-3.5 font-medium text-gray-900">{t.name}</td>
                          <td className="px-6 py-3.5 text-gray-600">{t.Total}</td>
                          <td className="px-6 py-3.5 text-gray-600">{t.Completed}</td>
                          <td className="px-6 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${t.rate}%`, background: t.rate >= 80 ? "#16a34a" : t.rate >= 50 ? BRAND : "#dc2626" }} />
                              </div>
                              <span className="text-xs font-bold text-gray-700">{t.rate}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
