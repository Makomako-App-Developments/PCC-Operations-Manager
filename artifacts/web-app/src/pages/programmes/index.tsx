import { useState } from "react";
import {
  useListInfillOrders, getListInfillOrdersQueryKey,
  useCreateInfillOrder, useUpdateInfillOrder,
  useListMulchingRecords, getListMulchingRecordsQueryKey,
  useCreateMulchingRecord, useUpdateMulchingRecord,
  useListAssets, getListAssetsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Sprout, Plus, Layers, Package, CheckCircle2, Clock, Truck, Leaf } from "lucide-react";

const INFILL_STATUS: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  draft:     { label: "Draft",     color: "#6b7280", bg: "#f3f4f6", icon: Clock },
  ordered:   { label: "Ordered",   color: "#2563eb", bg: "#eff6ff", icon: Package },
  delivered: { label: "Delivered", color: "#d97706", bg: "#fef3c7", icon: Truck },
  planted:   { label: "Planted",   color: "#16a34a", bg: "#dcfce7", icon: Leaf },
};

const MULCH_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  due:          { label: "Due",          color: "#dc2626", bg: "#fef2f2" },
  scheduled:    { label: "Scheduled",    color: "#2563eb", bg: "#eff6ff" },
  completed:    { label: "Completed",    color: "#16a34a", bg: "#dcfce7" },
  not_required: { label: "Not Required", color: "#6b7280", bg: "#f3f4f6" },
};

const SPECIES_CATEGORIES = [
  "Annual Bedding", "Roses", "Perennials", "Shrubs",
  "Trees", "Ground Cover", "Bulbs", "Grasses",
];

const MULCH_TYPES = ["Bark Mulch", "Wood Chip", "Compost", "Straw", "Pea Gravel"];

export default function Programmes() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [infillOpen, setInfillOpen] = useState(false);
  const [mulchOpen, setMulchOpen] = useState(false);
  const [infillForm, setInfillForm] = useState({
    assetId: "", speciesName: "", speciesCategory: "", quantity: "",
    orderDate: "", supplierRef: "", unitCostNzd: "", notes: "",
  });
  const [mulchForm, setMulchForm] = useState({
    assetId: "", scheduledDate: "", volumeM3: "", mulchType: "",
    contractor: "", costNzd: "", notes: "",
  });

  const { data: assetsData } = useListAssets({ limit: 200 }, {
    query: { queryKey: getListAssetsQueryKey({ limit: 200 }) },
  });
  const { data: infillData, isLoading: loadingInfill } = useListInfillOrders({}, {
    query: { queryKey: getListInfillOrdersQueryKey() },
  });
  const { data: mulchData, isLoading: loadingMulch } = useListMulchingRecords({}, {
    query: { queryKey: getListMulchingRecordsQueryKey() },
  });

  const createInfill = useCreateInfillOrder({
    mutation: {
      onSuccess: () => {
        toast({ title: "Infill planting created" });
        queryClient.invalidateQueries({ queryKey: ["/api/infill-orders"] });
        setInfillOpen(false);
        setInfillForm({ assetId: "", speciesName: "", speciesCategory: "", quantity: "", orderDate: "", supplierRef: "", unitCostNzd: "", notes: "" });
      },
      onError: () => toast({ title: "Failed to create order", variant: "destructive" }),
    },
  });

  const updateInfill = useUpdateInfillOrder({
    mutation: {
      onSuccess: () => {
        toast({ title: "Order updated" });
        queryClient.invalidateQueries({ queryKey: ["/api/infill-orders"] });
      },
    },
  });

  const createMulch = useCreateMulchingRecord({
    mutation: {
      onSuccess: () => {
        toast({ title: "Mulching record created" });
        queryClient.invalidateQueries({ queryKey: ["/api/mulching-records"] });
        setMulchOpen(false);
        setMulchForm({ assetId: "", scheduledDate: "", volumeM3: "", mulchType: "", contractor: "", costNzd: "", notes: "" });
      },
      onError: () => toast({ title: "Failed to create record", variant: "destructive" }),
    },
  });

  const updateMulch = useUpdateMulchingRecord({
    mutation: {
      onSuccess: () => {
        toast({ title: "Record updated" });
        queryClient.invalidateQueries({ queryKey: ["/api/mulching-records"] });
      },
    },
  });

  const handleCreateInfill = () => {
    if (!infillForm.assetId || !infillForm.speciesName || !infillForm.speciesCategory || !infillForm.quantity) {
      toast({ title: "Asset, species name, category, and quantity are required", variant: "destructive" });
      return;
    }
    createInfill.mutate({
      data: {
        assetId: infillForm.assetId,
        speciesName: infillForm.speciesName,
        speciesCategory: infillForm.speciesCategory,
        quantity: parseInt(infillForm.quantity, 10),
        orderDate: infillForm.orderDate || undefined,
        supplierRef: infillForm.supplierRef || undefined,
        unitCostNzd: infillForm.unitCostNzd || undefined,
        notes: infillForm.notes || undefined,
      } as any,
    });
  };

  const handleCreateMulch = () => {
    if (!mulchForm.assetId) {
      toast({ title: "Asset is required", variant: "destructive" });
      return;
    }
    createMulch.mutate({
      data: {
        assetId: mulchForm.assetId,
        scheduledDate: mulchForm.scheduledDate || undefined,
        volumeM3: mulchForm.volumeM3 || undefined,
        mulchType: mulchForm.mulchType || undefined,
        contractor: mulchForm.contractor || undefined,
        costNzd: mulchForm.costNzd || undefined,
        notes: mulchForm.notes || undefined,
      } as any,
    });
  };

  const infillOrders = infillData?.data ?? [];
  const mulchRecords = mulchData?.data ?? [];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f5f7f9]">
      <header className="bg-white border-b px-8 py-4 sticky top-0 z-10 flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-900">Programmes</h1>
        <p className="text-xs text-gray-400">Infill planting orders and mulching records</p>
      </header>

      <div className="flex-1 overflow-auto p-8">
        <Tabs defaultValue="infill">
          <TabsList className="mb-6 bg-white border shadow-sm h-10">
            <TabsTrigger value="infill" className="gap-1.5 text-sm data-[state=active]:bg-[#00AECD] data-[state=active]:text-white">
              <Sprout className="w-3.5 h-3.5" /> Infill Planting ({infillOrders.length})
            </TabsTrigger>
            <TabsTrigger value="mulching" className="gap-1.5 text-sm data-[state=active]:bg-[#00AECD] data-[state=active]:text-white">
              <Layers className="w-3.5 h-3.5" /> Mulching Records ({mulchRecords.length})
            </TabsTrigger>
          </TabsList>

          {/* ── Infill Planting ── */}
          <TabsContent value="infill">
            <div className="flex justify-end mb-4">
              <Button
                className="bg-[#00AECD] hover:bg-[#0097b2] text-white gap-1.5 h-9 text-sm"
                onClick={() => setInfillOpen(true)}
                data-testid="btn-new-infill"
              >
                <Plus className="w-4 h-4" /> New Infill Planting
              </Button>
            </div>
            {loadingInfill ? (
              <Skeleton className="w-full h-64 rounded-xl" />
            ) : infillOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400 bg-white rounded-xl border border-dashed">
                <Sprout className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm font-medium">No infill planting yet</p>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                <table className="w-full text-sm" data-testid="table-infill">
                  <thead>
                    <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <th className="text-left px-5 py-3">Asset</th>
                      <th className="text-left px-5 py-3">Species</th>
                      <th className="text-left px-5 py-3">Category</th>
                      <th className="text-left px-5 py-3">Qty</th>
                      <th className="text-left px-5 py-3">Status</th>
                      <th className="text-left px-5 py-3">Order Date</th>
                      <th className="text-left px-5 py-3">Advance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {infillOrders.map((o: any) => {
                      const conf = INFILL_STATUS[o.status] ?? INFILL_STATUS.draft;
                      const Icon = conf.icon;
                      const nextStatuses: Record<string, string> = { draft: "ordered", ordered: "delivered", delivered: "planted" };
                      const next = nextStatuses[o.status];
                      return (
                        <tr key={o.id} className="hover:bg-gray-50 transition-colors" data-testid={`row-infill-${o.id}`}>
                          <td className="px-5 py-3.5 font-medium text-gray-900">{o.assetName ?? "—"}</td>
                          <td className="px-5 py-3.5 text-gray-700">{o.speciesName}</td>
                          <td className="px-5 py-3.5 text-gray-600">{o.speciesCategory}</td>
                          <td className="px-5 py-3.5 font-bold text-gray-900">{o.quantity}</td>
                          <td className="px-5 py-3.5">
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full uppercase tracking-wide" style={{ background: conf.bg, color: conf.color }}>
                              <Icon className="w-3 h-3" /> {conf.label}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-gray-600 text-xs">{o.orderDate ? format(new Date(o.orderDate), "d MMM yyyy") : "—"}</td>
                          <td className="px-5 py-3.5">
                            {next && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs px-2.5"
                                onClick={() => updateInfill.mutate({ id: o.id, data: { status: next as any } })}
                                disabled={updateInfill.isPending}
                                data-testid={`btn-advance-infill-${o.id}`}
                              >
                                → {INFILL_STATUS[next].label}
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* ── Mulching Records ── */}
          <TabsContent value="mulching">
            <div className="flex justify-end mb-4">
              <Button
                className="bg-[#00AECD] hover:bg-[#0097b2] text-white gap-1.5 h-9 text-sm"
                onClick={() => setMulchOpen(true)}
                data-testid="btn-new-mulch"
              >
                <Plus className="w-4 h-4" /> New Mulching Record
              </Button>
            </div>
            {loadingMulch ? (
              <Skeleton className="w-full h-64 rounded-xl" />
            ) : mulchRecords.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400 bg-white rounded-xl border border-dashed">
                <Layers className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm font-medium">No mulching records yet</p>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                <table className="w-full text-sm" data-testid="table-mulching">
                  <thead>
                    <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <th className="text-left px-5 py-3">Asset</th>
                      <th className="text-left px-5 py-3">Scheduled</th>
                      <th className="text-left px-5 py-3">Status</th>
                      <th className="text-left px-5 py-3">Type</th>
                      <th className="text-left px-5 py-3">Volume (m³)</th>
                      <th className="text-left px-5 py-3">Contractor</th>
                      <th className="text-left px-5 py-3">Advance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {mulchRecords.map((r: any) => {
                      const conf = MULCH_STATUS[r.status] ?? MULCH_STATUS.due;
                      const nextStatuses: Record<string, string> = { due: "scheduled", scheduled: "completed" };
                      const next = nextStatuses[r.status];
                      return (
                        <tr key={r.id} className="hover:bg-gray-50 transition-colors" data-testid={`row-mulch-${r.id}`}>
                          <td className="px-5 py-3.5 font-medium text-gray-900">{r.assetName ?? "—"}</td>
                          <td className="px-5 py-3.5 text-gray-600 text-xs">{r.scheduledDate ? format(new Date(r.scheduledDate), "d MMM yyyy") : "—"}</td>
                          <td className="px-5 py-3.5">
                            <span className="inline-flex items-center text-[11px] font-semibold px-2 py-1 rounded-full uppercase tracking-wide" style={{ background: conf.bg, color: conf.color }}>
                              {conf.label}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-gray-600">{r.mulchType ?? "—"}</td>
                          <td className="px-5 py-3.5 text-gray-700">{r.volumeM3 ?? "—"}</td>
                          <td className="px-5 py-3.5 text-gray-600">{r.contractor ?? "—"}</td>
                          <td className="px-5 py-3.5">
                            {next && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs px-2.5"
                                onClick={() => updateMulch.mutate({ id: r.id, data: { status: next as any } })}
                                disabled={updateMulch.isPending}
                                data-testid={`btn-advance-mulch-${r.id}`}
                              >
                                → {MULCH_STATUS[next].label}
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Infill dialog */}
      {infillOpen && <Dialog open onOpenChange={(o) => { if (!o) setInfillOpen(false); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>New Infill Planting Order</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Asset <span className="text-red-500">*</span></Label>
                <Select value={infillForm.assetId} onValueChange={(v) => setInfillForm((f) => ({ ...f, assetId: v }))}>
                  <SelectTrigger data-testid="select-infill-asset"><SelectValue placeholder="Select asset…" /></SelectTrigger>
                  <SelectContent>
                    {assetsData?.data.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Species Name <span className="text-red-500">*</span></Label>
                <Input placeholder="e.g. Agapanthus" value={infillForm.speciesName} onChange={(e) => setInfillForm((f) => ({ ...f, speciesName: e.target.value }))} data-testid="input-species-name" />
              </div>
              <div className="space-y-1.5">
                <Label>Category <span className="text-red-500">*</span></Label>
                <Select value={infillForm.speciesCategory} onValueChange={(v) => setInfillForm((f) => ({ ...f, speciesCategory: v }))}>
                  <SelectTrigger data-testid="select-species-cat"><SelectValue placeholder="Category…" /></SelectTrigger>
                  <SelectContent>
                    {SPECIES_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Quantity <span className="text-red-500">*</span></Label>
                <Input type="number" min={1} placeholder="e.g. 50" value={infillForm.quantity} onChange={(e) => setInfillForm((f) => ({ ...f, quantity: e.target.value }))} data-testid="input-quantity" />
              </div>
              <div className="space-y-1.5">
                <Label>Order Date</Label>
                <Input type="date" value={infillForm.orderDate} onChange={(e) => setInfillForm((f) => ({ ...f, orderDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Supplier Ref</Label>
                <Input placeholder="PO-12345" value={infillForm.supplierRef} onChange={(e) => setInfillForm((f) => ({ ...f, supplierRef: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Unit Cost (NZD)</Label>
                <Input placeholder="4.50" value={infillForm.unitCostNzd} onChange={(e) => setInfillForm((f) => ({ ...f, unitCostNzd: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Notes</Label>
                <Textarea rows={2} value={infillForm.notes} onChange={(e) => setInfillForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInfillOpen(false)}>Cancel</Button>
            <Button className="bg-[#00AECD] hover:bg-[#0097b2] text-white" onClick={handleCreateInfill} disabled={createInfill.isPending} data-testid="btn-submit-infill">
              {createInfill.isPending ? "Creating…" : "Create Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>}

      {/* Create Mulching dialog */}
      {mulchOpen && <Dialog open onOpenChange={(o) => { if (!o) setMulchOpen(false); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>New Mulching Record</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Asset <span className="text-red-500">*</span></Label>
                <Select value={mulchForm.assetId} onValueChange={(v) => setMulchForm((f) => ({ ...f, assetId: v }))}>
                  <SelectTrigger data-testid="select-mulch-asset"><SelectValue placeholder="Select asset…" /></SelectTrigger>
                  <SelectContent>
                    {assetsData?.data.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Scheduled Date</Label>
                <Input type="date" value={mulchForm.scheduledDate} onChange={(e) => setMulchForm((f) => ({ ...f, scheduledDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Volume (m³)</Label>
                <Input placeholder="e.g. 12.5" value={mulchForm.volumeM3} onChange={(e) => setMulchForm((f) => ({ ...f, volumeM3: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Mulch Type</Label>
                <Select value={mulchForm.mulchType} onValueChange={(v) => setMulchForm((f) => ({ ...f, mulchType: v }))}>
                  <SelectTrigger data-testid="select-mulch-type"><SelectValue placeholder="Type…" /></SelectTrigger>
                  <SelectContent>
                    {MULCH_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Contractor</Label>
                <Input placeholder="Contractor name" value={mulchForm.contractor} onChange={(e) => setMulchForm((f) => ({ ...f, contractor: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Cost (NZD)</Label>
                <Input placeholder="1200.00" value={mulchForm.costNzd} onChange={(e) => setMulchForm((f) => ({ ...f, costNzd: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Notes</Label>
                <Textarea rows={2} value={mulchForm.notes} onChange={(e) => setMulchForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMulchOpen(false)}>Cancel</Button>
            <Button className="bg-[#00AECD] hover:bg-[#0097b2] text-white" onClick={handleCreateMulch} disabled={createMulch.isPending} data-testid="btn-submit-mulch">
              {createMulch.isPending ? "Creating…" : "Create Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>}
    </div>
  );
}
