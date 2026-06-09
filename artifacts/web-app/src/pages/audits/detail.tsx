import { useParams, useLocation } from "wouter";
import { useGetAudit, useDeleteAudit, getListAuditsQueryKey } from "@workspace/api-client-react";
import { useListAssets, useListUsers, useListTeams } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Edit, Trash2, CheckCircle2, XCircle, MinusCircle, MapPin, Camera } from "lucide-react";
import { format } from "date-fns";
import { KPI_SECTIONS, ALL_KPIS } from "./kpi-config";

const TYPE_COLORS: Record<string, string> = {
  roses_perennials:  "bg-pink-100 text-pink-700",
  annuals:           "bg-yellow-100 text-yellow-700",
  ornamental:        "bg-purple-100 text-purple-700",
  amenity:           "bg-sky-100 text-sky-700",
  rain_garden:       "bg-cyan-100 text-cyan-700",
  reveg:             "bg-lime-100 text-lime-700",
  bush:              "bg-green-100 text-green-700",
  tree_planter_pits: "bg-stone-100 text-stone-700",
  hedge:             "bg-amber-100 text-amber-800",
};

function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-4xl font-bold text-gray-300">—</span>;
  const n = Number(score);
  const color = n >= 80 ? "#16a34a" : n >= 60 ? "#d97706" : "#dc2626";
  return <span className="text-4xl font-bold" style={{ color }}>{n.toFixed(0)}%</span>;
}

function ResultBadge({ result }: { result: string | null }) {
  if (!result) return <span className="text-xs text-gray-300 border border-gray-200 rounded-full px-2.5 py-1">—</span>;
  const cfg: Record<string, { label: string; bg: string; color: string; icon: React.ReactNode }> = {
    pass: { label: "Pass", bg: "#dcfce7", color: "#16a34a", icon: <CheckCircle2 className="w-3 h-3" /> },
    fail: { label: "Fail", bg: "#fee2e2", color: "#dc2626", icon: <XCircle className="w-3 h-3" /> },
    na:   { label: "N/A",  bg: "#f3f4f6", color: "#6b7280", icon: <MinusCircle className="w-3 h-3" /> },
  };
  const c = cfg[result] ?? cfg.pass;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: c.bg, color: c.color }}>
      {c.icon} {c.label}
    </span>
  );
}

export default function AuditDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: audit, isLoading } = useGetAudit(id!, { query: { queryKey: [`/api/audits/${id}`] } });
  const { data: assetsData } = useListAssets({ limit: 2000 });
  const { data: usersData } = useListUsers();
  const { data: teamsData } = useListTeams();

  const deleteMutation = useDeleteAudit({
    mutation: {
      onSuccess: () => {
        toast({ title: "Audit deleted" });
        qc.invalidateQueries({ queryKey: getListAuditsQueryKey() });
        navigate("/audits");
      },
      onError: () => toast({ title: "Failed to delete audit", variant: "destructive" }),
    },
  });

  const assets = (assetsData?.data ?? []) as Record<string, any>[];
  const users = (usersData?.data ?? []) as Record<string, any>[];
  const teams = (teamsData ?? []) as { id: string; name: string }[];

  if (isLoading) {
    return (
      <div className="flex-1 bg-[#f5f7f9] p-8 space-y-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="w-full h-24 rounded-xl" />)}
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#f5f7f9]">
        <p className="text-gray-400">Audit not found.</p>
      </div>
    );
  }

  const a = audit as any;
  const asset = assets.find((x) => x.id === a.assetId);
  const auditor = users.find((u) => u.id === a.auditorId);
  const team = teams.find((t) => t.id === a.teamId);
  const items: any[] = a.items ?? [];
  const getItem = (key: string) => items.find((i) => i.criterion === key);

  const scored = items.filter((i) => i.result === "pass" || i.result === "fail");
  const passes = items.filter((i) => i.result === "pass").length;
  const fails = items.filter((i) => i.result === "fail").length;
  const nas = items.filter((i) => i.result === "na").length;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f5f7f9]">
      <header className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-10 flex-shrink-0">
        <Button variant="ghost" size="sm" className="gap-1.5 text-gray-500" onClick={() => navigate("/audits")}>
          <ArrowLeft className="w-4 h-4" /> Back to Results
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-9 text-sm"
            onClick={() => window.open(`/api/audits/${id}/pdf`, "_blank")}
          >
            <Download className="w-4 h-4" /> Download PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-9 text-sm border-[#00AECD] text-[#00AECD] hover:bg-[#e6f8fb]"
            onClick={() => navigate(`/audits/${id}/edit`)}
          >
            <Edit className="w-4 h-4" /> Edit Audit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-9 text-sm border-red-300 text-red-600 hover:bg-red-50"
            onClick={() => { if (confirm("Delete this audit?")) deleteMutation.mutate({ id: id! }); }}
          >
            <Trash2 className="w-4 h-4" /> Delete
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
          {/* Report header */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Garden Audit Report</h1>
                {a.auditType && (
                  <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full mt-2 ${
                    a.auditType === "completed-works"
                      ? "bg-[#e0f7fb] text-[#00AECD]"
                      : "bg-purple-50 text-purple-700"
                  }`}>
                    {a.auditType === "completed-works" ? "Completed Works Audit" : "Outcomes Based Audit"}
                  </span>
                )}
              </div>
              <div className="text-right">
                <ScoreBadge score={a.overallScore} />
                <p className="text-xs text-gray-400 mt-1">TOTAL SCORE</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-gray-100">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1 mb-1"><span>📍</span> SITE</p>
                <p className="text-sm font-semibold text-gray-900">{asset?.name ?? "—"}</p>
                {asset?.description && (
                  <p className="text-xs text-gray-500 mt-0.5">{asset.description}</p>
                )}
                {asset?.gardenType && (
                  <span className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${TYPE_COLORS[asset.gardenType] ?? "bg-gray-100 text-gray-600"}`}>
                    {asset.gardenType.replace(/_/g, " ")}
                  </span>
                )}
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1 mb-1"><span>👥</span> TEAM</p>
                <p className="text-sm font-semibold text-gray-900">{team?.name ?? "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1 mb-1"><span>👤</span> AUDITOR</p>
                <p className="text-sm font-semibold text-gray-900">{auditor?.name ?? auditor?.email ?? "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1 mb-1"><span>📅</span> DATE</p>
                <p className="text-sm font-semibold text-gray-900">
                  {a.conductedAt ? format(new Date(a.conductedAt), "d MMM yyyy") : "—"}
                </p>
              </div>
            </div>

            {/* Summary counts */}
            <div className="flex items-center gap-6 mt-5 pt-4 border-t border-gray-100">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{passes}</p>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Pass</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-600">{fails}</p>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Fail</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-400">{nas}</p>
                <p className="text-xs text-gray-400 uppercase tracking-wide">N/A</p>
              </div>
            </div>
          </div>

          {/* KPI Sections */}
          {KPI_SECTIONS.map((section) => (
            <div key={section.title}>
              <h2 className="text-base font-bold text-[#00AECD] mb-3">{section.title}</h2>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
                {section.kpis.map((kpi) => {
                  const item = getItem(kpi.key);
                  const photos: any[] = item?.photos ?? [];
                  return (
                    <div key={kpi.key} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div>
                          <p className="font-semibold text-gray-900">{kpi.label}</p>
                          {item?.failLat && (
                            <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3" /> {Number(item.failLat).toFixed(5)}, {Number(item.failLng).toFixed(5)}
                            </p>
                          )}
                        </div>
                        <ResultBadge result={item?.result ?? null} />
                      </div>

                      {item?.notes && (
                        <p className="text-sm text-gray-500 italic mt-1">{item.notes}</p>
                      )}

                      {photos.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {photos.map((p: any) => (
                            <a key={p.id} href={p.blobUrl} target="_blank" rel="noreferrer" className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 block">
                              <img src={p.blobUrl} alt="" className="w-full h-full object-cover hover:opacity-90 transition-opacity" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
