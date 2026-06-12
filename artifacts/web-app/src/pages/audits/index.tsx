import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useListAudits, getListAuditsQueryKey, useListAssets, useListTeams, useDeleteAudit } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { ClipboardCheck, Plus, Eye, Download, Search, Trophy, TrendingDown, XCircle, BookOpen, Trash2, Pencil, CalendarCheck, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { KPI_SECTIONS, ALL_KPIS } from "./kpi-config";
import { useAuth } from "@/lib/auth";

const BRAND = "#00AECD";

interface AuditStats {
  teamScores: { teamId: string; teamName: string; avgScore: number; auditCount: number }[];
  criterionFails: { criterion: string; failCount: number }[];
}

function useAuditStats() {
  return useQuery<AuditStats>({
    queryKey: ["audit-stats"],
    queryFn: async () => {
      const res = await fetch("/api/audits/stats", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load stats");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });
}

interface QuotaItem {
  id: string;
  assetId: string;
  assetName: string;
  auditType: string;
  sourceJobId: string | null;
  auditId: string | null;
  completed: boolean;
}

interface QuotaDetail {
  id: string;
  weekStart: string;
  progress: {
    completedWorks: { done: number; total: number };
    outcomesBased: { done: number; total: number };
    overall: { done: number; total: number };
  };
  items: QuotaItem[];
}

function useWeeklyQuota() {
  return useQuery<QuotaDetail>({
    queryKey: ["audit-quota-current"],
    queryFn: async () => {
      const res = await fetch("/api/audit-quota/current", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load quota");
      return res.json();
    },
    staleTime: 60_000,
  });
}

function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-xs text-gray-400">—</span>;
  const n = Number(score);
  const bg = n >= 80 ? "#dcfce7" : n >= 60 ? "#fef3c7" : "#fee2e2";
  const color = n >= 80 ? "#16a34a" : n >= 60 ? "#d97706" : "#dc2626";
  return (
    <span className="inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: bg, color }}>
      {n.toFixed(0)}%
    </span>
  );
}

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
  iconBg: string;
  iconColor: string;
  loading?: boolean;
}

function StatCard({ icon: Icon, label, value, sub, iconBg, iconColor, loading }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-start gap-3 min-w-0">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
        <Icon className="w-4 h-4" style={{ color: iconColor }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
        {loading ? (
          <Skeleton className="h-5 w-28 mb-1" />
        ) : (
          <p className="text-sm font-bold text-gray-900 truncate">{value}</p>
        )}
        {loading ? (
          <Skeleton className="h-3 w-20" />
        ) : (
          <p className="text-[11px] text-gray-400 truncate">{sub}</p>
        )}
      </div>
    </div>
  );
}

function ProgressStrip({ label, done, total, color }: { label: string; done: number; total: number; color: string }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-gray-700">{label}</span>
        <span className="text-xs font-bold" style={{ color }}>
          {done} / {total}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

function ThisWeekTab() {
  const [, navigate] = useLocation();
  const { data: quota, isLoading, refetch } = useWeeklyQuota();
  const { toast } = useToast();
  const [regenerating, setRegenerating] = useState(false);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-8">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!quota) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <CalendarCheck className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm font-medium">Could not load this week's quota</p>
      </div>
    );
  }

  const { progress, items } = quota;
  const cwPending = items.filter((i) => i.auditType === "completed-works" && !i.completed);
  const obPending = items.filter((i) => i.auditType === "outcomes-based" && !i.completed);
  const cwDone    = items.filter((i) => i.auditType === "completed-works" && i.completed);
  const obDone    = items.filter((i) => i.auditType === "outcomes-based"  && i.completed);

  const weekLabel = format(new Date(quota.weekStart + "T00:00:00"), "d MMM yyyy");

  const handleStartAudit = (item: QuotaItem) => {
    navigate(`/audits/new?assetId=${item.assetId}`);
  };

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      {/* Header + progress */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">Week of {weekLabel}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {progress.overall.done} of {progress.overall.total} audits completed
            </p>
          </div>
        </div>
        <div className="flex gap-6">
          <ProgressStrip
            label="Completed Works"
            done={progress.completedWorks.done}
            total={progress.completedWorks.total}
            color={BRAND}
          />
          <ProgressStrip
            label="Outcomes Based"
            done={progress.outcomesBased.done}
            total={progress.outcomesBased.total}
            color="#7c3aed"
          />
        </div>
      </div>

      {/* Pending items */}
      {cwPending.length > 0 && (
        <section>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">
            Completed Works — {cwPending.length} pending
          </h3>
          <Card className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="divide-y divide-gray-100">
              {cwPending.map((item) => (
                <div key={item.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.assetName}</p>
                    <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#e0f7fb] text-[#00AECD] mt-1">
                      Completed Works
                    </span>
                  </div>
                  <Button
                    size="sm"
                    className="bg-[#00AECD] hover:bg-[#0097b2] text-white h-8 text-xs"
                    onClick={() => handleStartAudit(item)}
                  >
                    Start Audit
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </section>
      )}

      {obPending.length > 0 && (
        <section>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">
            Outcomes Based — {obPending.length} pending
          </h3>
          <Card className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="divide-y divide-gray-100">
              {obPending.map((item) => (
                <div key={item.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.assetName}</p>
                    <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 mt-1">
                      Outcomes Based
                    </span>
                  </div>
                  <Button
                    size="sm"
                    className="bg-purple-600 hover:bg-purple-700 text-white h-8 text-xs"
                    onClick={() => handleStartAudit(item)}
                  >
                    Start Audit
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </section>
      )}

      {/* Completed items */}
      {(cwDone.length > 0 || obDone.length > 0) && (
        <section>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">
            Completed this week — {cwDone.length + obDone.length}
          </h3>
          <Card className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="divide-y divide-gray-100">
              {[...cwDone, ...obDone].map((item) => (
                <div key={item.id} className="flex items-center justify-between px-5 py-3 bg-gray-50/50">
                  <div>
                    <p className="text-sm font-medium text-gray-500 line-through">{item.assetName}</p>
                    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 ${item.auditType === "completed-works" ? "bg-[#e0f7fb] text-[#00AECD]" : "bg-purple-100 text-purple-700"}`}>
                      {item.auditType === "completed-works" ? "Completed Works" : "Outcomes Based"}
                    </span>
                  </div>
                  <span className="text-xs text-green-600 font-semibold flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    Done
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </section>
      )}

      {progress.overall.total === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <CalendarCheck className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm font-medium">No completed jobs found to sample from</p>
          <p className="text-xs mt-1 text-center max-w-xs">
            The quota draws from jobs completed in the last 3–90 days. No eligible jobs were found for this week.
          </p>
        </div>
      )}
    </div>
  );
}

export default function Audits() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"results" | "this-week">("results");
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();

  const isSupervisor = (user as any)?.role === "supervisor";
  // Only supervisors see the quota tab and weekly queue

  const { data: auditsData, isLoading } = useListAudits({ query: { queryKey: getListAuditsQueryKey() } });
  const { data: assetsData } = useListAssets({ limit: 2000 });
  const { data: teamsData } = useListTeams();
  const { data: stats, isLoading: statsLoading } = useAuditStats();

  const deleteMutation = useDeleteAudit({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListAuditsQueryKey() });
        toast({ title: "Audit deleted" });
        setConfirmDeleteId(null);
      },
      onError: () => {
        toast({ title: "Failed to delete audit", variant: "destructive" });
        setConfirmDeleteId(null);
      },
    },
  });

  const audits = (auditsData?.data ?? []) as Record<string, any>[];
  const assets = assetsData?.data ?? [];
  const teams = (teamsData ?? []) as { id: string; name: string }[];

  const getAssetName = (id: string) => assets.find((a) => a.id === id)?.name ?? "—";
  const getTeamName  = (id: string | null) => {
    if (!id) return "—";
    return teams.find((t) => t.id === id)?.name ?? "—";
  };

  const filtered = audits.filter((a) => {
    const name = getAssetName(a.assetId).toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase());
    const matchTeam   = teamFilter === "all" || a.teamId === teamFilter;
    return matchSearch && matchTeam;
  });

  const { highTeam, lowTeam, topKpi } = useMemo(() => {
    if (!stats) return { highTeam: null, lowTeam: null, topKpi: null };
    const sorted = [...stats.teamScores].sort((a, b) => Number(b.avgScore) - Number(a.avgScore));
    const highTeam = sorted[0] ?? null;
    const lowTeam  = sorted[sorted.length - 1] !== sorted[0] ? sorted[sorted.length - 1] : null;
    const topCriterion = stats.criterionFails[0] ?? null;
    const topKpi = topCriterion
      ? {
          label: ALL_KPIS.find(k => k.key === topCriterion.criterion)?.label ?? topCriterion.criterion,
          count: topCriterion.failCount,
        }
      : null;
    return { highTeam, lowTeam, topKpi };
  }, [stats]);

  const handleExportCsv = () => {
    const rows = [
      ["Date", "Site", "Team", "Score", "Status"],
      ...filtered.map((a) => [
        format(new Date(a.conductedAt ?? a.createdAt), "d MMM yyyy"),
        getAssetName(a.assetId),
        getTeamName(a.teamId),
        a.overallScore != null ? `${Number(a.overallScore).toFixed(0)}%` : "",
        a.status,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `audit-results-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f5f7f9]">
      <header className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-10 flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Audit Results</h1>
          <p className="text-xs text-gray-400">Porirua Gardens audit results</p>
        </div>
        <div className="flex gap-2">
          {activeTab === "results" && (
            <>
              <Button variant="outline" size="sm" className="gap-1.5 h-9 text-sm" onClick={handleExportCsv}>
                <Download className="w-4 h-4" /> Export CSV
              </Button>
              <Button className="bg-[#00AECD] hover:bg-[#0097b2] text-white gap-1.5 h-9 text-sm" onClick={() => navigate("/audits/new")}>
                <Plus className="w-4 h-4" /> New Audit
              </Button>
            </>
          )}
          {activeTab === "this-week" && (
            <Button className="bg-[#00AECD] hover:bg-[#0097b2] text-white gap-1.5 h-9 text-sm" onClick={() => navigate("/audits/new")}>
              <Plus className="w-4 h-4" /> New Audit
            </Button>
          )}
        </div>
      </header>

      {/* ── Summary stat cards ─────────────────────────────────────────────── */}
      <div className="px-8 pt-5 pb-1 grid grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
        <StatCard
          icon={Trophy}
          label="Highest Performing Team"
          value={highTeam ? highTeam.teamName : "—"}
          sub={highTeam ? `${Number(highTeam.avgScore).toFixed(0)}% avg · ${highTeam.auditCount} audit${highTeam.auditCount !== 1 ? "s" : ""}` : "No data yet"}
          iconBg="#dcfce7"
          iconColor="#16a34a"
          loading={statsLoading}
        />
        <StatCard
          icon={TrendingDown}
          label="Lowest Performing Team"
          value={lowTeam ? lowTeam.teamName : highTeam ? highTeam.teamName : "—"}
          sub={
            lowTeam
              ? `${Number(lowTeam.avgScore).toFixed(0)}% avg · ${lowTeam.auditCount} audit${lowTeam.auditCount !== 1 ? "s" : ""}`
              : highTeam
              ? `${Number(highTeam.avgScore).toFixed(0)}% avg · only 1 team`
              : "No data yet"
          }
          iconBg="#fee2e2"
          iconColor="#dc2626"
          loading={statsLoading}
        />
        <StatCard
          icon={XCircle}
          label="Most Failed KPI"
          value={topKpi ? topKpi.label : "—"}
          sub={topKpi ? `Failed ${topKpi.count} time${topKpi.count !== 1 ? "s" : ""} across all audits` : "No failures recorded"}
          iconBg="#fff7ed"
          iconColor="#ea580c"
          loading={statsLoading}
        />
        <StatCard
          icon={BookOpen}
          label="Most Failed KPI"
          value={topKpi ? topKpi.label : "—"}
          sub={topKpi ? `Failed ${topKpi.count} time${topKpi.count !== 1 ? "s" : ""} across all audits` : "No failures recorded"}
          iconBg={`${BRAND}1a`}
          iconColor={BRAND}
          loading={statsLoading}
        />
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="px-8 mt-4 border-b bg-white flex items-center gap-0 sticky top-[73px] z-10 shadow-sm flex-shrink-0">
        <button
          onClick={() => setActiveTab("results")}
          className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "results"
              ? "border-[#00AECD] text-[#00AECD]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          All Results
        </button>
        {isSupervisor && (
          <button
            onClick={() => setActiveTab("this-week")}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "this-week"
                ? "border-[#00AECD] text-[#00AECD]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <CalendarCheck className="w-4 h-4" />
            This Week
          </button>
        )}
      </div>

      {activeTab === "this-week" && isSupervisor ? (
        <div className="flex-1 overflow-auto">
          <ThisWeekTab />
        </div>
      ) : (
        <>
          <div className="px-8 py-3 border-b bg-white flex gap-3 flex-shrink-0 mt-0">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search audits..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm bg-white"
              />
            </div>
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="w-[160px] h-9 text-sm bg-white">
                <SelectValue placeholder="All Teams" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Teams</SelectItem>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 overflow-auto p-8">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="w-full h-14 rounded-xl" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <ClipboardCheck className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm font-medium">No audits yet</p>
                <p className="text-xs mt-1">
                  {search || teamFilter !== "all" ? "Try adjusting your filters" : "Click '+ New Audit' to conduct your first audit"}
                </p>
              </div>
            ) : (
              <Card className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm" data-testid="table-audits">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                      <th className="text-left px-5 py-3">Date</th>
                      <th className="text-left px-5 py-3">Site</th>
                      <th className="text-left px-5 py-3">Team</th>
                      <th className="text-left px-5 py-3">Score</th>
                      <th className="text-right px-5 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((audit) => (
                      <tr key={audit.id} className="hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => navigate(`/audits/${audit.id}`)}>
                        <td className="px-5 py-3.5 text-gray-600 text-sm">
                          {format(new Date(audit.conductedAt ?? audit.createdAt), "d MMM yyyy")}
                        </td>
                        <td className="px-5 py-3.5 font-medium text-gray-900">{getAssetName(audit.assetId)}</td>
                        <td className="px-5 py-3.5 text-gray-600">{getTeamName(audit.teamId)}</td>
                        <td className="px-5 py-3.5">
                          <ScoreBadge score={audit.overallScore} />
                        </td>
                        <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-[#00AECD] hover:text-[#00AECD] hover:bg-[#e6f8fb]"
                              onClick={() => navigate(`/audits/${audit.id}`)}
                              title="View audit"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-gray-500 hover:text-gray-700"
                              onClick={() => navigate(`/audits/${audit.id}/edit`)}
                              title="Edit audit"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-gray-500 hover:text-gray-700"
                              onClick={() => window.open(`/api/audits/${audit.id}/pdf`, "_blank")}
                              title="Download PDF"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50"
                              onClick={() => setConfirmDeleteId(audit.id)}
                              title="Delete audit"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>
        </>
      )}

      <AlertDialog open={!!confirmDeleteId} onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete audit?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the audit and all its results. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => { if (confirmDeleteId) deleteMutation.mutate({ id: confirmDeleteId }); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
