import { useState } from "react";
import {
  useListAudits, getListAuditsQueryKey,
  useCreateAudit, useListAssets, getListAssetsQueryKey,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ClipboardCheck, Plus, CheckCircle2, Clock, XCircle, AlertTriangle } from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  pending:  { label: "Pending",  color: "#2563eb", bg: "#eff6ff",  icon: Clock },
  passed:   { label: "Passed",   color: "#16a34a", bg: "#dcfce7",  icon: CheckCircle2 },
  failed:   { label: "Failed",   color: "#dc2626", bg: "#fef2f2",  icon: XCircle },
  overdue:  { label: "Overdue",  color: "#ea580c", bg: "#fff7ed",  icon: AlertTriangle },
};

const CRITERIA = [
  "Weed control", "Plant health", "Mulch condition", "Edging quality",
  "Pruning/deadheading", "Litter removal", "Irrigation check", "Signage condition",
];

export default function Audits() {
  const [createOpen, setCreateOpen] = useState(false);
  const [detailAudit, setDetailAudit] = useState<any | null>(null);
  const [form, setForm] = useState({ assetId: "", scheduledDate: "", notes: "" });
  const [statusFilter, setStatusFilter] = useState("all");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: auditsData, isLoading } = useListAudits({
    query: { queryKey: getListAuditsQueryKey() },
  });

  const { data: assetsData } = useListAssets({ limit: 200 }, {
    query: { queryKey: getListAssetsQueryKey({ limit: 200 }) },
  });

  const createMutation = useCreateAudit({
    mutation: {
      onSuccess: () => {
        toast({ title: "Audit created" });
        queryClient.invalidateQueries({ queryKey: ["/api/audits"] });
        setCreateOpen(false);
        setForm({ assetId: "", scheduledDate: "", notes: "" });
      },
      onError: () => toast({ title: "Failed to create audit", variant: "destructive" }),
    },
  });

  const audits = auditsData?.data ?? [];
  const filtered = statusFilter === "all" ? audits : audits.filter((a: any) => a.status === statusFilter);

  const getAssetName = (id: string) =>
    assetsData?.data.find((a) => a.id === id)?.name ?? id;

  const handleCreate = () => {
    if (!form.assetId || !form.scheduledDate) {
      toast({ title: "Asset and scheduled date are required", variant: "destructive" });
      return;
    }
    createMutation.mutate({ data: { assetId: form.assetId, scheduledDate: form.scheduledDate, notes: form.notes || undefined } as any });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f5f7f9]">
      <header className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-10 flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Quality Audits</h1>
          <p className="text-xs text-gray-400">{audits.length} audit{audits.length !== 1 ? "s" : ""} on record</p>
        </div>
        <Button
          className="bg-[#00AECD] hover:bg-[#0097b2] text-white gap-1.5 h-9 text-sm"
          onClick={() => setCreateOpen(true)}
          data-testid="btn-new-audit"
        >
          <Plus className="w-4 h-4" /> New Audit
        </Button>
      </header>

      <div className="px-8 py-3 border-b bg-white flex gap-3 sticky top-[73px] z-10 shadow-sm flex-shrink-0">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] h-9 text-sm bg-white" data-testid="select-audit-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="passed">Passed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
        {statusFilter !== "all" && (
          <Button variant="ghost" size="sm" className="h-9 px-3 text-gray-500" onClick={() => setStatusFilter("all")}>Clear</Button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-8">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="w-full h-20 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <ClipboardCheck className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm font-medium">No audits yet</p>
            <p className="text-xs mt-1">Create your first audit to track quality compliance</p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
            <table className="w-full text-sm" data-testid="table-audits">
              <thead>
                <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-5 py-3">Asset</th>
                  <th className="text-left px-5 py-3">Scheduled</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-left px-5 py-3">Score</th>
                  <th className="text-left px-5 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((audit: any) => {
                  const conf = STATUS_CONFIG[audit.status] ?? STATUS_CONFIG.pending;
                  const Icon = conf.icon;
                  return (
                    <tr
                      key={audit.id}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => setDetailAudit(audit)}
                      data-testid={`row-audit-${audit.id}`}
                    >
                      <td className="px-5 py-3.5 font-medium text-gray-900">{getAssetName(audit.assetId)}</td>
                      <td className="px-5 py-3.5 text-gray-600">{format(new Date(audit.scheduledDate), "d MMM yyyy")}</td>
                      <td className="px-5 py-3.5">
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full uppercase tracking-wide"
                          style={{ background: conf.bg, color: conf.color }}
                        >
                          <Icon className="w-3 h-3" /> {conf.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {audit.overallScore != null ? (
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${Math.min(Number(audit.overallScore), 100)}%`,
                                  background: Number(audit.overallScore) >= 70 ? "#16a34a" : Number(audit.overallScore) >= 50 ? "#d97706" : "#dc2626",
                                }}
                              />
                            </div>
                            <span className="text-xs font-bold text-gray-700">{Number(audit.overallScore).toFixed(0)}%</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-gray-500 text-xs max-w-[200px] truncate">{audit.notes || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create dialog */}
      {createOpen && <Dialog open onOpenChange={(o) => { if (!o) setCreateOpen(false); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>New Quality Audit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Asset <span className="text-red-500">*</span></Label>
              <Select value={form.assetId} onValueChange={(v) => setForm((f) => ({ ...f, assetId: v }))}>
                <SelectTrigger data-testid="select-audit-asset">
                  <SelectValue placeholder="Select asset…" />
                </SelectTrigger>
                <SelectContent>
                  {assetsData?.data.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} <span className="text-gray-400 text-xs ml-1">{a.reference}</span></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Scheduled Date <span className="text-red-500">*</span></Label>
              <Input
                type="date"
                value={form.scheduledDate}
                onChange={(e) => setForm((f) => ({ ...f, scheduledDate: e.target.value }))}
                data-testid="input-audit-date"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                placeholder="Any initial notes…"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-700">
              <p className="font-semibold mb-1">Standard criteria ({CRITERIA.length})</p>
              <p className="text-blue-600">{CRITERIA.join(" · ")}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              className="bg-[#00AECD] hover:bg-[#0097b2] text-white"
              onClick={handleCreate}
              disabled={createMutation.isPending}
              data-testid="btn-submit-audit"
            >
              {createMutation.isPending ? "Creating…" : "Create Audit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>}

      {/* Detail dialog */}
      {detailAudit && <Dialog open onOpenChange={(o) => { if (!o) setDetailAudit(null); }}>
        <DialogContent className="sm:max-w-[500px]">
          {detailAudit && (
            <>
              <DialogHeader>
                <DialogTitle>Audit Detail</DialogTitle>
                <div className="text-sm text-gray-500 mt-1">
                  <p className="font-semibold text-gray-900">{getAssetName(detailAudit.assetId)}</p>
                  <p className="text-xs">Scheduled: {format(new Date(detailAudit.scheduledDate), "d MMM yyyy")}</p>
                </div>
              </DialogHeader>
              <div className="py-3 space-y-3">
                {detailAudit.overallScore != null && (
                  <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                    <span className="text-sm font-medium text-gray-700">Overall Score</span>
                    <span className="text-2xl font-bold text-gray-900">{Number(detailAudit.overallScore).toFixed(0)}%</span>
                  </div>
                )}
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Criteria</p>
                  <div className="rounded-lg border divide-y text-sm">
                    {CRITERIA.map((c) => (
                      <div key={c} className="flex items-center justify-between px-4 py-2.5 text-gray-700">
                        <span>{c}</span>
                        <span className="text-xs text-gray-400">—</span>
                      </div>
                    ))}
                  </div>
                </div>
                {detailAudit.notes && (
                  <div className="text-xs text-gray-600 bg-gray-50 rounded-lg px-4 py-3">{detailAudit.notes}</div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDetailAudit(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>}
    </div>
  );
}
