import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useListAudits, getListAuditsQueryKey, useListAssets, useListTeams } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { ClipboardCheck, Plus, Eye, Download, Search, Trophy, TrendingDown, XCircle, BookOpen } from "lucide-react";
import { KPI_SECTIONS, ALL_KPIS } from "./kpi-config";

const BRAND = "#00AECD";
const NAVY  = "#0f2a36";

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

export default function Audits() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");

  const { data: auditsData, isLoading } = useListAudits({ query: { queryKey: getListAuditsQueryKey() } });
  const { data: assetsData } = useListAssets({ limit: 2000 });
  const { data: teamsData } = useListTeams();
  const { data: stats, isLoading: statsLoading } = useAuditStats();

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

  // ── Derived stats ───────────────────────────────────────────────────────────
  const { highTeam, lowTeam, topKpi, topSpec } = useMemo(() => {
    if (!stats) return { highTeam: null, lowTeam: null, topKpi: null, topSpec: null };

    const sorted = [...stats.teamScores].sort((a, b) => Number(b.avgScore) - Number(a.avgScore));
    const highTeam = sorted[0] ?? null;
    const lowTeam  = sorted[sorted.length - 1] !== sorted[0] ? sorted[sorted.length - 1] : null;

    // Most failed KPI
    const topCriterion = stats.criterionFails[0] ?? null;
    const topKpi = topCriterion
      ? {
          label: ALL_KPIS.find(k => k.key === topCriterion.criterion)?.label ?? topCriterion.criterion,
          count: topCriterion.failCount,
        }
      : null;

    // Most failed specification (section)
    const sectionFails: Record<string, number> = {};
    for (const { criterion, failCount } of stats.criterionFails) {
      const section = KPI_SECTIONS.find(s => s.kpis.some(k => k.key === criterion));
      if (section) sectionFails[section.title] = (sectionFails[section.title] ?? 0) + Number(failCount);
    }
    const topSectionEntry = Object.entries(sectionFails).sort((a, b) => b[1] - a[1])[0] ?? null;
    const topSpec = topSectionEntry ? { title: topSectionEntry[0], count: topSectionEntry[1] } : null;

    return { highTeam, lowTeam, topKpi, topSpec };
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
          <p className="text-xs text-gray-400">Porirua Gardens Baseline Audit results</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 h-9 text-sm" onClick={handleExportCsv}>
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          <Button className="bg-[#00AECD] hover:bg-[#0097b2] text-white gap-1.5 h-9 text-sm" onClick={() => navigate("/audits/new")}>
            <Plus className="w-4 h-4" /> New Audit
          </Button>
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
          label="Most Failed Specification"
          value={topSpec ? topSpec.title : "—"}
          sub={topSpec ? `${topSpec.count} total fail${topSpec.count !== 1 ? "s" : ""} in this section` : "No failures recorded"}
          iconBg={`${BRAND}1a`}
          iconColor={BRAND}
          loading={statsLoading}
        />
      </div>

      <div className="px-8 py-3 border-b bg-white flex gap-3 sticky top-[73px] z-10 shadow-sm flex-shrink-0 mt-4">
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
                  <tr key={audit.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3.5 text-gray-600 text-sm">
                      {format(new Date(audit.conductedAt ?? audit.createdAt), "d MMM yyyy")}
                    </td>
                    <td className="px-5 py-3.5 font-medium text-gray-900">{getAssetName(audit.assetId)}</td>
                    <td className="px-5 py-3.5 text-gray-600">{getTeamName(audit.teamId)}</td>
                    <td className="px-5 py-3.5">
                      <ScoreBadge score={audit.overallScore} />
                    </td>
                    <td className="px-5 py-3.5">
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
                          onClick={() => window.open(`/api/audits/${audit.id}/pdf`, "_blank")}
                          title="Download PDF"
                        >
                          <Download className="w-4 h-4" />
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
    </div>
  );
}
