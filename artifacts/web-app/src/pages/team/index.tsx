import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ChevronDown, Users, UsersRound, BarChart3, MapPin, Ruler, Clock, UserCheck, AlertTriangle, Loader2, RefreshCw, Pencil, Trash2, Plus, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

const BRAND = "#00AECD";
const NAVY  = "#0f2a36";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LivePerson {
  id:     string;
  name:   string;
  teamId: string | null;
  team:   string;
}

interface WorkloadRow {
  teamId:       string | null;
  teamName:     string;
  siteCount:    number;
  totalAreaM2:  number;
  annualHours:  number;
  ftesRequired: number;
}

interface WorkloadData {
  rows: WorkloadRow[];
  meta: { productiveTimeMins: number; annualFteHours: number; workingDaysPerYear: number };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const OFFICE_ROLES = new Set(["administrator", "manager"]);
const DEFAULT_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

type Status = "available" | "annual_leave" | "sick" | "statutory_holiday" | "unpaid_leave";

const STATUS_OPTIONS: { value: Status; label: string; color: string; bg: string }[] = [
  { value: "available",          label: "Available",          color: "text-green-700",  bg: "bg-green-100"  },
  { value: "annual_leave",       label: "Annual Leave",       color: "text-blue-700",   bg: "bg-blue-100"   },
  { value: "sick",               label: "Sick",               color: "text-red-700",    bg: "bg-red-100"    },
  { value: "statutory_holiday",  label: "Statutory Holiday",  color: "text-purple-700", bg: "bg-purple-100" },
  { value: "unpaid_leave",       label: "Unpaid Leave",       color: "text-gray-700",   bg: "bg-gray-100"   },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMondayOfWeek(d: Date) {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatHour(h: number) {
  return h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;
}

function formatWeekLabel(mon: Date) {
  const fri = addDays(mon, 4);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${mon.toLocaleDateString("en-NZ", opts)} – ${fri.toLocaleDateString("en-NZ", opts)}`;
}

function getStatusStyle(status: Status) {
  return STATUS_OPTIONS.find(s => s.value === status) ?? STATUS_OPTIONS[0];
}

function fmt(n: number) {
  return n.toLocaleString("en-NZ");
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useLivePeople(): LivePerson[] {
  const { data: users = [] } = useQuery<{ data: Array<{ id: string; name: string; role: string; teamId: string | null; isActive: boolean }> }>({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch("/api/users", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60_000,
  });
  const { data: teams = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["teams"],
    queryFn: async () => {
      const res = await fetch("/api/teams", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60_000,
  });
  const { data: crewMembers = [] } = useQuery<Array<{ id: string; personName: string; teamId: string }>>({
    queryKey: ["crew-members"],
    queryFn: async () => {
      const res = await fetch("/api/team-members", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60_000,
  });

  const teamMap = Object.fromEntries(teams.map(t => [t.id, t.name]));

  const accountPeople: LivePerson[] = (users.data ?? [])
    .filter(u => u.isActive && !OFFICE_ROLES.has(u.role))
    .map(u => ({
      id:     u.id,
      name:   u.name,
      teamId: u.teamId,
      team:   u.teamId ? (teamMap[u.teamId] ?? "—") : "—",
    }));

  const accountNames = new Set(accountPeople.map(p => p.name));

  const crewOnlyPeople: LivePerson[] = crewMembers
    .filter(m => !accountNames.has(m.personName))
    .map(m => ({
      id:     m.id,
      name:   m.personName,
      teamId: m.teamId,
      team:   m.teamId ? (teamMap[m.teamId] ?? "—") : "—",
    }));

  return [...accountPeople, ...crewOnlyPeople].sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Composition Tab ──────────────────────────────────────────────────────────

interface TeamWithCount {
  id:          string;
  name:        string;
  createdAt:   string;
  memberCount: number;
}

interface CrewMember {
  id:         string;
  personName: string;
  teamId:     string;
  hasAccount: boolean;
}

function CompositionTab() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: teams = [], isLoading } = useQuery<TeamWithCount[]>({
    queryKey: ["teams-with-counts"],
    queryFn: async () => {
      const res = await fetch("/api/teams/with-counts", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load teams");
      return res.json();
    },
  });

  const { data: crewMembers = [] } = useQuery<CrewMember[]>({
    queryKey: ["crew-members"],
    queryFn: async () => {
      const res = await fetch("/api/team-members", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load crew members");
      return res.json();
    },
  });

  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editName, setEditName]       = useState("");
  const [creating, setCreating]       = useState(false);
  const [newName, setNewName]         = useState("");
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) =>
    setExpandedTeams(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const rename = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await fetch(`/api/teams/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to rename team");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams-with-counts"] });
      qc.invalidateQueries({ queryKey: ["teams"] });
      setEditingId(null);
      toast({ title: "Team renamed" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const create = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/teams", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to create team");
      }
      return res.json();
    },
    onSuccess: (t: TeamWithCount) => {
      qc.invalidateQueries({ queryKey: ["teams-with-counts"] });
      qc.invalidateQueries({ queryKey: ["teams"] });
      setCreating(false);
      setNewName("");
      toast({ title: "Team created", description: t.name });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/teams/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.status === 409) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Cannot delete team");
      }
      if (!res.ok) throw new Error("Failed to delete team");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams-with-counts"] });
      qc.invalidateQueries({ queryKey: ["teams"] });
      toast({ title: "Team deleted" });
    },
    onError: (err: Error) => toast({ title: "Cannot delete", description: err.message, variant: "destructive" }),
  });

  const startEdit = (team: TeamWithCount) => { setEditingId(team.id); setEditName(team.name); };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = () => { if (!editingId || !editName.trim()) return; rename.mutate({ id: editingId, name: editName.trim() }); };

  const handleCreateKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); if (newName.trim()) create.mutate(newName.trim()); }
    if (e.key === "Escape") { setCreating(false); setNewName(""); }
  };
  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); saveEdit(); }
    if (e.key === "Escape") cancelEdit();
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-gray-500">Create teams, rename them, and see who's in each one. Move staff between teams via the Users tab in Settings.</p>
        {!creating && (
          <Button
            size="sm"
            className="gap-1.5 text-white flex-shrink-0 ml-4"
            style={{ backgroundColor: BRAND }}
            onClick={() => { setCreating(true); setTimeout(() => document.getElementById("new-team-input")?.focus(), 50); }}
          >
            <Plus className="w-4 h-4" />
            New Team
          </Button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />Loading…
          </div>
        ) : teams.length === 0 && !creating ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <UsersRound className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">No teams yet</p>
          </div>
        ) : (
          <>
            {teams.map(team => {
              const members = crewMembers.filter(m => m.teamId === team.id);
              const isExpanded = expandedTeams.has(team.id);
              return (
                <div key={team.id} className="divide-y divide-gray-50">
                  <div className="flex items-center gap-3 px-5 py-3.5 group">
                    {editingId === team.id ? (
                      <>
                        <Input autoFocus value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={handleEditKeyDown} className="h-8 text-sm flex-1 max-w-xs" />
                        <button onClick={saveEdit} disabled={rename.isPending || !editName.trim()} className="p-1.5 rounded-md hover:bg-emerald-50 text-emerald-600 disabled:opacity-40 transition-colors" title="Save">
                          {rename.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        </button>
                        <button onClick={cancelEdit} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 transition-colors" title="Cancel">
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        {members.length > 0 ? (
                          <button onClick={() => toggleExpand(team.id)} className="p-0.5 rounded text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0">
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                        ) : (
                          <div className="w-5 flex-shrink-0" />
                        )}
                        <span className="flex-1 text-sm font-medium text-gray-800">{team.name}</span>
                        <span className="text-xs text-gray-400 mr-2">{team.memberCount} active member{team.memberCount !== 1 ? "s" : ""}</span>
                        <button onClick={() => startEdit(team)} className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all" title="Rename">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => remove.mutate(team.id)} disabled={remove.isPending} className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all disabled:opacity-40" title={team.memberCount > 0 ? "Cannot delete — has members" : "Delete team"}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                  {isExpanded && members.length > 0 && (
                    <div className="bg-gray-50/60 px-5 py-2 space-y-1.5">
                      {members.map(m => (
                        <div key={m.id} className="flex items-center gap-2.5">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0" style={{ backgroundColor: m.hasAccount ? BRAND : "#9ca3af" }}>
                            {m.personName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                          </div>
                          <span className="text-xs text-gray-700 flex-1">{m.personName}</span>
                          {m.hasAccount ? (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-100">Has account</span>
                          ) : (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 border border-gray-200">Crew only</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {creating && (
              <div className="flex items-center gap-3 px-5 py-3.5">
                <div className="w-5 flex-shrink-0" />
                <Input id="new-team-input" autoFocus placeholder="Team name…" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={handleCreateKeyDown} className="h-8 text-sm flex-1 max-w-xs" />
                <button onClick={() => { if (newName.trim()) create.mutate(newName.trim()); }} disabled={create.isPending || !newName.trim()} className="p-1.5 rounded-md hover:bg-emerald-50 text-emerald-600 disabled:opacity-40 transition-colors" title="Create">
                  {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
                <button onClick={() => { setCreating(false); setNewName(""); }} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 transition-colors" title="Cancel">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Workload Tab ─────────────────────────────────────────────────────────────

function WorkloadTab() {
  const { data, isLoading, error } = useQuery<WorkloadData>({
    queryKey: ["teams-workload"],
    queryFn: async () => {
      const res = await fetch("/api/teams/workload", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load workload data");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  const { data: crewMembers = [] } = useQuery<Array<{ id: string; personName: string; teamId: string }>>({
    queryKey: ["crew-members"],
    queryFn: async () => {
      const res = await fetch("/api/team-members", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60_000,
  });

  const teamMemberNames = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const m of crewMembers) {
      if (!map[m.teamId]) map[m.teamId] = [];
      map[m.teamId].push(m.personName);
    }
    return map;
  }, [crewMembers]);

  const totals = useMemo(() => {
    if (!data) return null;
    return {
      siteCount:    data.rows.reduce((s, r) => s + r.siteCount, 0),
      totalAreaM2:  data.rows.reduce((s, r) => s + r.totalAreaM2, 0),
      annualHours:  data.rows.reduce((s, r) => s + r.annualHours, 0),
      ftesRequired: data.rows.filter(r => r.teamId !== null).reduce((s, r) => s + r.ftesRequired, 0),
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400 text-sm">
        Loading workload data…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-24 text-red-400 text-sm">
        Failed to load workload data.
      </div>
    );
  }

  const teamColors: Record<string, string> = {
    "CBD":        "#00AECD",
    "Mobile 1":   "#0f2a36",
    "Mobile 2":   "#7c3aed",
    "Specialist": "#ea580c",
    "All Teams":  "#64748b",
  };

  const getTeamColor = (name: string) => teamColors[name] ?? BRAND;

  return (
    <div className="space-y-6">
      {/* Summary stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { icon: MapPin,     label: "Total Sites",       value: fmt(totals?.siteCount ?? 0),                              sub: "active garden sites"   },
          { icon: Ruler,      label: "Total Area",        value: `${fmt(totals?.totalAreaM2 ?? 0)} m²`,                   sub: "across all teams"      },
          { icon: Clock,      label: "Annual Hours",      value: `${fmt(totals?.annualHours ?? 0)} hrs`,                  sub: "scheduled maintenance" },
          { icon: UserCheck,  label: "FTEs Required",     value: `${totals?.ftesRequired.toFixed(1) ?? "—"} FTE`,         sub: "for named teams"       },
        ].map(({ icon: Icon, label, value, sub }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-3">
            <div className="p-2 rounded-lg" style={{ background: `${BRAND}18` }}>
              <Icon className="w-4 h-4" style={{ color: BRAND }} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
              <p className="text-xl font-bold mt-0.5" style={{ color: NAVY }}>{value}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Per-team breakdown table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-bold" style={{ color: NAVY }}>Team Breakdown</h2>
          <div className="text-[10px] text-gray-400 flex items-center gap-1">
            <span>Based on</span>
            <span className="font-semibold text-gray-600">{data.meta.productiveTimeMins} mins/day</span>
            <span>productive time ×</span>
            <span className="font-semibold text-gray-600">{data.meta.workingDaysPerYear} working days</span>
            <span>=</span>
            <span className="font-semibold text-gray-600">{data.meta.annualFteHours} hrs/FTE/year</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-[10px] font-bold uppercase tracking-wider text-gray-500 px-6 py-3">Team</th>
                <th className="text-right text-[10px] font-bold uppercase tracking-wider text-gray-500 px-4 py-3">Sites</th>
                <th className="text-right text-[10px] font-bold uppercase tracking-wider text-gray-500 px-4 py-3">Area (m²)</th>
                <th className="text-right text-[10px] font-bold uppercase tracking-wider text-gray-500 px-4 py-3">Weekly Hrs</th>
                <th className="text-right text-[10px] font-bold uppercase tracking-wider text-gray-500 px-4 py-3">Annual Hrs</th>
                <th className="text-right text-[10px] font-bold uppercase tracking-wider text-gray-500 px-6 py-3">FTEs Required</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.rows.map(row => {
                const color = getTeamColor(row.teamName);
                const isAllTeams = row.teamId === null;
                return (
                  <tr key={row.teamId ?? "all"} className={`hover:bg-gray-50/60 transition-colors ${isAllTeams ? "bg-gray-50/40" : ""}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ background: color }}
                        />
                        <span className={`text-sm font-semibold ${isAllTeams ? "text-gray-500 italic" : "text-gray-800"}`}>
                          {row.teamName}
                        </span>
                        {isAllTeams && (
                          <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">shared workload</span>
                        )}
                        {!isAllTeams && row.teamId && teamMemberNames[row.teamId] && (
                          <span className="text-[11px] font-medium" style={{ color: BRAND }}>
                            {teamMemberNames[row.teamId].join(", ")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="text-sm font-semibold text-gray-800">{fmt(row.siteCount)}</span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="text-sm font-semibold text-gray-800">{fmt(row.totalAreaM2)}</span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="text-sm font-semibold text-gray-800">{(row.annualHours / 52).toFixed(1)}</span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="text-sm font-semibold text-gray-800">{fmt(row.annualHours)}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {isAllTeams ? (
                        <span className="text-xs text-gray-400 italic">shared across teams</span>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <div className="flex-1 max-w-[80px] bg-gray-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${Math.min(100, (row.ftesRequired / 4) * 100)}%`, background: color }}
                            />
                          </div>
                          <span
                            className="text-sm font-bold tabular-nums"
                            style={{ color }}
                          >
                            {row.ftesRequired.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {/* Totals row */}
              {totals && (
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td className="px-6 py-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Total</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold" style={{ color: NAVY }}>{fmt(totals.siteCount)}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold" style={{ color: NAVY }}>{fmt(totals.totalAreaM2)} m²</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold" style={{ color: NAVY }}>{(totals.annualHours / 52).toFixed(1)} hrs</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold" style={{ color: NAVY }}>{fmt(totals.annualHours)} hrs</span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <span className="text-sm font-bold" style={{ color: NAVY }}>{totals.ftesRequired.toFixed(2)} FTE</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footnote */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/60">
          <p className="text-[10px] text-gray-400">
            FTE calculation: annual service hours ÷ {data.meta.annualFteHours} productive hrs/FTE/year.
            "All Teams" sites are shared across all field teams on scheduled days and are excluded from individual FTE totals.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Cell Popover ─────────────────────────────────────────────────────────────

function CellPopover({
  personName, date, hour, status, canEdit, onSave,
}: {
  personName: string; date: string; hour: number;
  status: Status; canEdit: boolean; onSave: (s: Status) => void;
}) {
  const [open, setOpen] = useState(false);
  const style = getStatusStyle(status);

  if (!canEdit) {
    return (
      <div
        className={`w-full h-7 rounded text-[10px] font-bold flex items-center justify-center ${style.bg} ${style.color}`}
        title={style.label}
      >
        {status === "available" ? "" : style.label.slice(0, 2).toUpperCase()}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`w-full h-7 rounded text-[10px] font-bold transition-opacity hover:opacity-80 ${style.bg} ${style.color}`}
          title={style.label}
        >
          {status === "available" ? "" : style.label.slice(0, 2).toUpperCase()}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1.5" align="center">
        <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider px-2 pb-1">
          {personName} — {formatHour(hour)}
        </p>
        {STATUS_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => { onSave(opt.value); setOpen(false); }}
            className={`w-full text-left px-2 py-1.5 rounded text-xs font-medium flex items-center gap-2 hover:bg-gray-50 transition-colors ${status === opt.value ? "ring-1 ring-inset ring-gray-300 bg-gray-50" : ""}`}
          >
            <span className={`w-2.5 h-2.5 rounded-full ${opt.bg}`} />
            {opt.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// ─── Set Day Button ───────────────────────────────────────────────────────────

function SetDayButton({
  personName, date, onSave,
}: {
  personName: string; date: string; onSave: (s: Status) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs h-7 px-2">
          Set all
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1.5" align="center">
        <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider px-2 pb-1">Set whole day</p>
        {STATUS_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => { onSave(opt.value); setOpen(false); }}
            className="w-full text-left px-2 py-1.5 rounded text-xs font-medium flex items-center gap-2 hover:bg-gray-50 transition-colors"
          >
            <span className={`w-2.5 h-2.5 rounded-full ${opt.bg}`} />
            {opt.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const canEdit = user?.role === "manager" || user?.role === "supervisor";
  const PEOPLE = useLivePeople();

  const [activeTab, setActiveTab] = useState<"workload" | "composition" | "availability">("workload");
  const [weekMon, setWeekMon]     = useState<Date>(() => getMondayOfWeek(new Date()));
  const [activeDay, setActiveDay] = useState(0);

  const [capacityWarning, setCapacityWarning] = useState<CapacityWarning | null>(null);
  const [replanLoading, setReplanLoading]     = useState(false);
  const [replanSuccess, setReplanSuccess]     = useState(false);
  const [replanError, setReplanError]         = useState<string | null>(null);

  const { data: settingsData } = useQuery<{ workStartHour: number; workEndHour: number }>({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const HOURS = settingsData
    ? Array.from(
        { length: settingsData.workEndHour - settingsData.workStartHour + 1 },
        (_, i) => settingsData.workStartHour + i,
      )
    : DEFAULT_HOURS;

  const weekStart = toDateStr(weekMon);

  const { data: rows = [], isLoading } = useQuery<AvailRow[]>({
    queryKey: ["team-avail", weekStart],
    queryFn: async () => {
      const res = await fetch(`/api/team/availability?weekStart=${weekStart}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load availability");
      return res.json();
    },
    enabled: activeTab === "availability",
  });

  const saveAvailability = async (body: { personName: string; date: string; hour: number; status: Status }) => {
    const res = await fetch(`/api/team/availability`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Failed to save");
    return res.json() as Promise<{
      ok: boolean;
      jobsRefreshed: number;
      capacityAfter: { totalScheduledMins: number; productiveTimeMins: number; utilizationPct: number } | null;
    }>;
  };

  const applyCapacityWarning = (
    data: Awaited<ReturnType<typeof saveAvailability>>,
    personName: string,
    date: string,
  ) => {
    const person = PEOPLE.find(p => p.name === personName);
    if (data.capacityAfter && data.capacityAfter.utilizationPct > 100) {
      if (person?.teamId) {
        setCapacityWarning({
          teamId:         person.teamId,
          teamName:       person.team,
          date,
          utilizationPct: data.capacityAfter.utilizationPct,
        });
        setReplanSuccess(false);
        setReplanError(null);
      }
    } else if (capacityWarning?.date === date && capacityWarning?.teamId === person?.teamId) {
      setCapacityWarning(null);
    }
  };

  const mutation = useMutation({
    mutationFn: saveAvailability,
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ["team-avail", weekStart] });
      applyCapacityWarning(data, variables.personName, variables.date);
    },
  });

  const availMap = useMemo(() => {
    const m: Record<string, Status> = {};
    for (const r of rows) m[`${r.personName}|${r.date}|${r.hour}`] = r.status;
    return m;
  }, [rows]);

  const getStatus = (personName: string, date: string, hour: number): Status =>
    availMap[`${personName}|${date}|${hour}`] ?? "available";

  const dayDate = toDateStr(addDays(weekMon, activeDay));

  const handleSave = (personName: string, hour: number, status: Status) => {
    mutation.mutate({ personName, date: dayDate, hour, status });
  };

  const handleSetWholeDay = async (personName: string, status: Status) => {
    await Promise.all(HOURS.map(h => saveAvailability({ personName, date: dayDate, hour: h, status })));
    qc.invalidateQueries({ queryKey: ["team-avail", weekStart] });
    // After all parallel saves complete, do one authoritative capacity check for
    // the final DB state (individual parallel responses may be from intermediate states).
    const person = PEOPLE.find(p => p.name === personName);
    if (person?.teamId) {
      try {
        const cap = await fetch(
          `/api/schedule/day-capacity?teamId=${person.teamId}&date=${dayDate}`,
          { credentials: "include" },
        ).then(r => r.ok ? r.json() : null) as { utilizationPct: number } | null;
        if (cap && cap.utilizationPct > 100) {
          setCapacityWarning({
            teamId:         person.teamId,
            teamName:       person.team,
            date:           dayDate,
            utilizationPct: cap.utilizationPct,
          });
          setReplanSuccess(false);
          setReplanError(null);
        } else if (capacityWarning?.date === dayDate && capacityWarning?.teamId === person.teamId) {
          setCapacityWarning(null);
        }
      } catch {
        // Best-effort — warning may not appear, but saves still succeeded
      }
    }
  };

  const handleReplan = async () => {
    if (!capacityWarning) return;
    setReplanLoading(true);
    setReplanError(null);
    setReplanSuccess(false);
    try {
      const res = await fetch("/api/schedule/replan-day", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: capacityWarning.teamId,
          date:   capacityWarning.date,
        }),
      });
      if (!res.ok) throw new Error("Re-plan request failed");

      // Re-check actual capacity after the replan — only clear the warning if
      // the day is genuinely no longer over capacity (avoid optimistic false positives).
      const capRes = await fetch(
        `/api/schedule/day-capacity?teamId=${capacityWarning.teamId}&date=${capacityWarning.date}`,
        { credentials: "include" },
      );
      const cap = capRes.ok ? (await capRes.json() as { utilizationPct: number }) : null;

      if (!cap || cap.utilizationPct <= 100) {
        setReplanSuccess(true);
        setCapacityWarning(null);
      } else {
        // Day is still over capacity (all future days were also full) — keep
        // the warning but update the utilization to the new value.
        setCapacityWarning(prev => prev ? { ...prev, utilizationPct: cap.utilizationPct } : null);
        setReplanError(
          `Re-plan redistributed some jobs, but the day is still at ${cap.utilizationPct}% — further redistribution may be needed.`,
        );
      }

      qc.invalidateQueries({ queryKey: ["team-avail", weekStart] });
    } catch (e) {
      setReplanError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setReplanLoading(false);
    }
  };

  const isCurrentWeek = toDateStr(getMondayOfWeek(new Date())) === weekStart;

  const getDaySummary = (personName: string, dayIdx: number): Status | "mixed" => {
    const date = toDateStr(addDays(weekMon, dayIdx));
    const statuses = HOURS.map(h => getStatus(personName, date, h));
    const unique = [...new Set(statuses)];
    if (unique.length === 1) return unique[0];
    return "mixed";
  };

  const prevWeek = () => setWeekMon(d => addDays(d, -7));
  const nextWeek = () => setWeekMon(d => addDays(d, 7));
  const thisWeek = () => setWeekMon(getMondayOfWeek(new Date()));

  return (
    <div className="flex flex-col min-h-full bg-[#f5f7f9]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeTab === "availability"
              ? `Availability schedule — ${formatWeekLabel(weekMon)}`
              : activeTab === "composition"
              ? "Manage teams — create, rename, and view members"
              : "Resource planning & workload summary"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Tab toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-1">
            <button
              onClick={() => setActiveTab("workload")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === "workload"
                  ? "bg-white shadow-sm text-gray-800"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Workload
            </button>
            <button
              onClick={() => setActiveTab("composition")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === "composition"
                  ? "bg-white shadow-sm text-gray-800"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <UsersRound className="w-3.5 h-3.5" />
              Composition
            </button>
            <button
              onClick={() => setActiveTab("availability")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === "availability"
                  ? "bg-white shadow-sm text-gray-800"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Availability
            </button>
          </div>

          {/* Week nav — only shown on availability tab */}
          {activeTab === "availability" && (
            <div className="flex items-center gap-2">
              {!isCurrentWeek && (
                <Button variant="outline" size="sm" onClick={thisWeek}>This Week</Button>
              )}
              <Button variant="outline" size="icon" onClick={prevWeek}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={nextWeek}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 p-6 space-y-4">
        {/* ── Workload Tab ── */}
        {activeTab === "workload" && <WorkloadTab />}

        {/* ── Composition Tab ── */}
        {activeTab === "composition" && <CompositionTab />}

        {/* ── Availability Tab ── */}
        {activeTab === "availability" && (
          <>
            {/* Week overview strip */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Week Overview</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="text-left font-semibold text-gray-500 pb-2 pr-4 w-40">Person</th>
                      {DAYS.map((d, i) => (
                        <th key={d} className="text-center font-semibold text-gray-500 pb-2 px-1">
                          {d.slice(0, 3)} {toDateStr(addDays(weekMon, i)).slice(8)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {PEOPLE.map(person => (
                      <tr key={person.name}>
                        <td className="py-1.5 pr-4">
                          <span className="font-medium text-gray-800">{person.name}</span>
                          <span className="text-gray-400 text-[10px] ml-1.5">{person.team}</span>
                        </td>
                        {DAYS.map((_, i) => {
                          const summary = getDaySummary(person.name, i);
                          if (summary === "mixed") {
                            return (
                              <td key={i} className="py-1.5 px-1 text-center">
                                <button
                                  onClick={() => setActiveDay(i)}
                                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                                >
                                  Mixed
                                </button>
                              </td>
                            );
                          }
                          const style = getStatusStyle(summary);
                          return (
                            <td key={i} className="py-1.5 px-1 text-center">
                              <button
                                onClick={() => setActiveDay(i)}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${style.bg} ${style.color} hover:opacity-80 transition-opacity`}
                              >
                                {summary === "available" ? "Avail" : style.label.split(" ").map(w => w[0]).join("")}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Over-capacity warning banner */}
            {capacityWarning && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex items-start gap-4">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-red-800">
                    {capacityWarning.teamName} is over capacity on{" "}
                    {new Date(capacityWarning.date + "T00:00:00").toLocaleDateString("en-NZ", {
                      weekday: "long", day: "numeric", month: "long",
                    })}{" "}
                    ({capacityWarning.utilizationPct}%)
                  </p>
                  <p className="text-xs text-red-600 mt-0.5">
                    Pending jobs now exceed productive time. Re-plan to redistribute work that no longer fits.
                  </p>
                  {replanError && (
                    <p className="text-xs text-red-700 font-medium mt-1">{replanError}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  disabled={replanLoading}
                  onClick={handleReplan}
                  className="flex-shrink-0 bg-red-600 hover:bg-red-700 text-white text-xs h-8 px-3 gap-1.5"
                >
                  {replanLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  {replanLoading ? "Re-planning…" : "Re-plan this day"}
                </Button>
              </div>
            )}

            {/* Re-plan success confirmation */}
            {replanSuccess && !capacityWarning && (
              <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-3 flex items-center gap-3">
                <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-green-800">
                  Day re-planned — jobs redistributed to the next available working day.
                </p>
                <button
                  onClick={() => setReplanSuccess(false)}
                  className="ml-auto text-green-500 hover:text-green-700 text-xs"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Day detail grid */}
            <div className="bg-white rounded-xl border border-gray-200">
              {/* Day tabs */}
              <div className="flex border-b border-gray-100">
                {DAYS.map((day, i) => {
                  const date = toDateStr(addDays(weekMon, i));
                  const isToday = date === toDateStr(new Date());
                  return (
                    <button
                      key={day}
                      onClick={() => setActiveDay(i)}
                      className={`flex-1 py-3 px-2 text-sm font-semibold transition-colors relative ${
                        activeDay === i
                          ? "text-[#00AECD] border-b-2 border-[#00AECD]"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {day.slice(0, 3)}
                      {isToday && (
                        <span className="ml-1 text-[9px] bg-[#00AECD] text-white px-1 rounded-full align-middle">Today</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Grid */}
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-gray-700">
                    {DAYS[activeDay]}, {addDays(weekMon, activeDay).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {STATUS_OPTIONS.map(opt => (
                      <span key={opt.value} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${opt.bg} ${opt.color}`}>
                        {opt.label}
                      </span>
                    ))}
                  </div>
                </div>

                {isLoading ? (
                  <div className="text-center text-gray-400 py-10 text-sm">Loading…</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider pb-3 pr-4 w-44">
                            Person
                          </th>
                          {HOURS.map(h => (
                            <th key={h} className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider pb-3 px-0.5 min-w-[52px]">
                              {formatHour(h)}
                            </th>
                          ))}
                          {canEdit && (
                            <th className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider pb-3 pl-3 w-28">
                              Set Day
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {PEOPLE.map(person => (
                          <tr key={person.name} className="group">
                            <td className="py-2 pr-4 align-middle">
                              <div>
                                <p className="text-sm font-semibold text-gray-800">{person.name}</p>
                                <p className="text-[10px] text-gray-400">{person.team}</p>
                              </div>
                            </td>
                            {HOURS.map(h => {
                              const status = getStatus(person.name, dayDate, h);
                              return (
                                <td key={h} className="py-2 px-0.5 align-middle">
                                  <CellPopover
                                    personName={person.name}
                                    date={dayDate}
                                    hour={h}
                                    status={status}
                                    canEdit={canEdit}
                                    onSave={(s) => handleSave(person.name, h, s)}
                                  />
                                </td>
                              );
                            })}
                            {canEdit && (
                              <td className="py-2 pl-3 align-middle">
                                <SetDayButton
                                  personName={person.name}
                                  date={dayDate}
                                  onSave={(s) => handleSetWholeDay(person.name, s)}
                                />
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Type used by availability query
interface AvailRow {
  personName: string;
  date:       string;
  hour:       number;
  status:     Status;
}

interface CapacityWarning {
  teamId:       string;
  teamName:     string;
  date:         string;
  utilizationPct: number;
}
