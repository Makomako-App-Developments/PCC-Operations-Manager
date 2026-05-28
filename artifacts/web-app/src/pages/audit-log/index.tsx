import { useState } from "react";
import { format } from "date-fns";
import { Shield, Search, ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// Inline fetch — no generated hook yet; the spec will be extended post-Phase 4
// For now we call the API directly.
import { useQuery } from "@tanstack/react-query";

const BRAND = "#00AECD";
const NAVY  = "#0f2a36";

const TABLE_OPTIONS = [
  { value: "all",           label: "All tables" },
  { value: "assets",        label: "Assets" },
  { value: "jobs",          label: "Jobs" },
  { value: "reactive_jobs", label: "Unscheduled Work" },
  { value: "audits",        label: "Audits" },
  { value: "infill_orders", label: "Infill Orders" },
  { value: "mulching_records", label: "Mulching Records" },
];

const ACTION_COLORS: Record<string, { bg: string; text: string }> = {
  INSERT: { bg: "#dcfce7", text: "#16a34a" },
  UPDATE: { bg: "#dbeafe", text: "#2563eb" },
  DELETE: { bg: "#fee2e2", text: "#dc2626" },
};

interface AuditEntry {
  id:            string;
  tableName:     string;
  recordId:      string | null;
  action:        string;
  changedAt:     string;
  ipAddress:     string | null;
  oldData:       Record<string, unknown> | null;
  newData:       Record<string, unknown> | null;
  changedById:   string | null;
  changedByName: string | null;
}

function useAuditLog(params: { table?: string; limit: number; offset: number }) {
  const qs = new URLSearchParams();
  if (params.table && params.table !== "all") qs.set("table", params.table);
  qs.set("limit",  String(params.limit));
  qs.set("offset", String(params.offset));

  return useQuery<{ data: AuditEntry[]; limit: number; offset: number }>({
    queryKey: ["audit-log", params],
    queryFn: async () => {
      const res = await fetch(`/api/audit-log?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch audit log");
      return res.json() as Promise<{ data: AuditEntry[]; limit: number; offset: number }>;
    },
    refetchInterval: 30_000,
  });
}

function DiffRow({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  const conf = ACTION_COLORS[entry.action] ?? { bg: "#f3f4f6", text: "#6b7280" };

  return (
    <>
      <tr
        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
        onClick={() => setOpen(o => !o)}
      >
        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
          {format(new Date(entry.changedAt), "d MMM yyyy HH:mm:ss")}
        </td>
        <td className="px-4 py-3">
          <span
            className="text-[11px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: conf.bg, color: conf.text }}
          >
            {entry.action}
          </span>
        </td>
        <td className="px-4 py-3 text-xs font-medium text-gray-700">{entry.tableName}</td>
        <td className="px-4 py-3 text-[11px] font-mono text-gray-400 truncate max-w-[120px]">
          {entry.recordId?.slice(0, 8)}…
        </td>
        <td className="px-4 py-3 text-xs text-gray-600">{entry.changedByName ?? "—"}</td>
        <td className="px-4 py-3 text-[11px] font-mono text-gray-400">{entry.ipAddress ?? "—"}</td>
        <td className="px-4 py-3 text-right pr-4">
          {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 inline" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 inline" />}
        </td>
      </tr>
      {open && (entry.oldData || entry.newData) && (
        <tr className="bg-gray-50 border-b border-gray-200">
          <td colSpan={7} className="px-6 py-3">
            <div className="grid grid-cols-2 gap-4 max-w-4xl">
              {entry.oldData && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Before</p>
                  <pre className="text-[11px] bg-white border border-gray-200 rounded-lg p-3 overflow-auto max-h-48 text-gray-700">
                    {JSON.stringify(entry.oldData, null, 2)}
                  </pre>
                </div>
              )}
              {entry.newData && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">After</p>
                  <pre className="text-[11px] bg-white border border-gray-200 rounded-lg p-3 overflow-auto max-h-48 text-gray-700">
                    {JSON.stringify(entry.newData, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

const PAGE_SIZE = 50;

export default function AuditLog({ embedded }: { embedded?: boolean } = {}) {
  const [table,  setTable]  = useState("all");
  const [search, setSearch] = useState("");
  const [page,   setPage]   = useState(0);

  const { data, isLoading } = useAuditLog({ table, limit: PAGE_SIZE, offset: page * PAGE_SIZE });

  const rows = data?.data ?? [];
  const filtered = search
    ? rows.filter(r =>
        r.tableName.includes(search.toLowerCase()) ||
        r.changedByName?.toLowerCase().includes(search.toLowerCase()) ||
        r.recordId?.startsWith(search.toLowerCase())
      )
    : rows;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f5f7f9]">
      {!embedded && (
        <header className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: NAVY }}>
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Audit Log</h1>
              <p className="text-xs text-gray-400">Immutable record of all data changes</p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs" style={{ color: BRAND, borderColor: BRAND }}>
            Manager / Supervisor only
          </Badge>
        </header>
      )}

      {/* Filters */}
      <div className="px-8 py-3 border-b bg-white flex gap-3 sticky top-[73px] z-10 shadow-sm">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
          <Input
            placeholder="Search table, user, record ID…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pl-8 h-9 w-64 text-sm"
          />
        </div>
        <Select value={table} onValueChange={v => { setTable(v); setPage(0); }}>
          <SelectTrigger className="w-44 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TABLE_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Shield className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">No audit entries found</p>
              <p className="text-xs mt-1">Changes to assets, jobs, audits and programmes will appear here</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500">Timestamp</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500">Action</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500">Table</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500">Record</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500">Changed by</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500">IP</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(entry => <DiffRow key={entry.id} entry={entry} />)}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!isLoading && rows.length > 0 && (
          <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
            <span>Showing {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + filtered.length}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={rows.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
