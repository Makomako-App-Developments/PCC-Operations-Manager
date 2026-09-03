import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ChevronDown, Users, UsersRound, BarChart3, MapPin, Ruler, Clock, UserCheck, AlertTriangle, Loader2, RefreshCw, Pencil, Trash2, Plus, Check, X, UserPlus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { DEPARTMENTS, departmentLabel, type DepartmentValue } from "@workspace/asset-definitions";

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
  meta: { productiveTimeMins: number; annualFteHours: number; workingDaysPerYear: number; standardCrewSize: number };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const OFFICE_ROLES = new Set(["administrator", "manager"]);
const DEFAULT_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

type Status = "available" | "annual_leave" | "sick" | "statutory_holiday" | "unpaid_leave" | "training";

const STATUS_OPTIONS: { value: Status; label: string; color: string; bg: string }[] = [
  { value: "available",          label: "Available",          color: "text-green-700",  bg: "bg-green-100"  },
  { value: "annual_leave",       label: "Annual Leave",       color: "text-blue-700",   bg: "bg-blue-100"   },
  { value: "sick",               label: "Sick",               color: "text-red-700",    bg: "bg-red-100"    },
  { value: "statutory_holiday",  label: "Statutory Holiday",  color: "text-purple-700", bg: "bg-purple-100" },
  { value: "unpaid_leave",       label: "Unpaid Leave",       color: "text-gray-700",   bg: "bg-gray-100"   },
  { value: "training",           label: "Training",           color: "text-amber-700",  bg: "bg-amber-100"  },
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
  const { data: users } = useQuery<{ data: Array<{ id: string; name: string; role: string; teamId: string | null; isActive: boolean }> }>({
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

  const accountPeople: LivePerson[] = (users?.data ?? [])
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
  department:  DepartmentValue;
  createdAt:   string;
  memberCount: number;
}

interface CrewMember {
  id:         string;
  userId:     string | null;
  personName: string;
  teamId:     string;
  hasAccount: boolean;
  role:       string;
}

interface UserSafe {
  id:       string;
  name:     string;
  email:    string;
  initials: string;
  role:     string;
  teamId:   string | null;
  isActive: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  administrator: "Administrator",
  manager:       "Manager",
  supervisor:    "Supervisor",
  field_worker:  "Field Worker",
};

const ROLE_COLOURS: Record<string, { bg: string; text: string }> = {
  administrator: { bg: "#fef3c7", text: "#92400e" },
  manager:       { bg: "#e0f2fe", text: "#0369a1" },
  supervisor:    { bg: "#ede9fe", text: "#7c3aed" },
  field_worker:  { bg: "#dcfce7", text: "#16a34a" },
};

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

  const { data: usersData } = useQuery<{ data: UserSafe[] }>({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch("/api/users", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load users");
      return res.json();
    },
    staleTime: 60_000,
  });
  const allUsers = usersData?.data ?? [];

  // Team CRUD state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName]   = useState("");
  const [creating, setCreating]   = useState(false);
  const [newName, setNewName]     = useState("");
  const [newDepartment, setNewDepartment] = useState<DepartmentValue | "">("");

  // Member management state
  const [addingToTeam, setAddingToTeam] = useState<string | null>(null);
  const [addMode, setAddMode]           = useState<"assign" | "new">("assign");
  const [newCrewName, setNewCrewName]   = useState("");
  const [newCrewRole, setNewCrewRole]   = useState<"field_worker" | "supervisor">("field_worker");
  const [assignSearch, setAssignSearch] = useState("");

  const autoInitials = (name: string) =>
    name.trim().split(/\s+/).map(n => n[0]?.toUpperCase() ?? "").join("").slice(0, 2) || "?";

  // ── Team mutations ──────────────────────────────────────────────────────────

  const rename = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await fetch(`/api/teams/${id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Failed to rename"); }
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["teams-with-counts"] }); qc.invalidateQueries({ queryKey: ["teams"] }); setEditingId(null); toast({ title: "Team renamed" }); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const createTeam = useMutation({
    mutationFn: async ({ name, department }: { name: string; department: DepartmentValue }) => {
      const res = await fetch("/api/teams", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, department }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Failed to create"); }
      return res.json();
    },
    onSuccess: (t: TeamWithCount) => { qc.invalidateQueries({ queryKey: ["teams-with-counts"] }); qc.invalidateQueries({ queryKey: ["teams"] }); setCreating(false); setNewName(""); setNewDepartment(""); toast({ title: "Team created", description: `${t.name} · ${departmentLabel(t.department)}` }); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteTeam = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/teams/${id}`, { method: "DELETE", credentials: "include" });
      if (res.status === 409) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Cannot delete"); }
      if (!res.ok) throw new Error("Failed to delete team");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["teams-with-counts"] }); qc.invalidateQueries({ queryKey: ["teams"] }); toast({ title: "Team deleted" }); },
    onError: (err: Error) => toast({ title: "Cannot delete", description: err.message, variant: "destructive" }),
  });

  // ── Member mutations ────────────────────────────────────────────────────────

  const addCrewMember = useMutation({
    mutationFn: async ({ personName, teamId, role }: { personName: string; teamId: string; role: string }) => {
      const initials = personName.trim().split(/\s+/).map(n => n[0]?.toUpperCase() ?? "").join("").slice(0, 4) || personName[0]?.toUpperCase() || "?";
      const res = await fetch("/api/team-members", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personName, teamId, role, initials }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Failed to add member"); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crew-members"] });
      qc.invalidateQueries({ queryKey: ["teams-with-counts"] });
      setNewCrewName(""); setNewCrewRole("field_worker"); setAddingToTeam(null);
      toast({ title: "Crew member added" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const assignUserToTeam = useMutation({
    mutationFn: async ({ userId, teamId }: { userId: string; teamId: string }) => {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId }),
      });
      if (!res.ok) throw new Error("Failed to assign");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crew-members"] });
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["teams-with-counts"] });
      setAddingToTeam(null); setAssignSearch("");
      toast({ title: "Staff member assigned" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const removeMember = useMutation({
    mutationFn: async (m: CrewMember) => {
      if (!m.hasAccount) {
        // Pure crew-only: remove the team_members row
        const res = await fetch(`/api/team-members/${m.id}`, { method: "DELETE", credentials: "include" });
        if (!res.ok) throw new Error("Failed to remove");
      } else if (m.userId && m.id !== m.userId) {
        // Has BOTH a team_members row AND a user account (name-matched): remove both
        await fetch(`/api/team-members/${m.id}`, { method: "DELETE", credentials: "include" });
        const res = await fetch(`/api/users/${m.userId}`, {
          method: "PATCH", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId: null }),
        });
        if (!res.ok) throw new Error("Failed to remove");
      } else {
        // Account-only (no team_members row): patch user teamId to null using userId
        const uid = m.userId ?? m.id;
        const res = await fetch(`/api/users/${uid}`, {
          method: "PATCH", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId: null }),
        });
        if (!res.ok) throw new Error("Failed to remove");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crew-members"] });
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["teams-with-counts"] });
      toast({ title: "Removed from team" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const startEdit = (team: TeamWithCount) => { setEditingId(team.id); setEditName(team.name); };
  const cancelEdit = () => setEditingId(null);
  const saveEdit   = () => { if (!editingId || !editName.trim()) return; rename.mutate({ id: editingId, name: editName.trim() }); };

  const closeAddPanel = () => { setAddingToTeam(null); setNewCrewName(""); setNewCrewRole("field_worker"); setAssignSearch(""); };

  const openAddPanel = (teamId: string) => {
    setAddingToTeam(teamId); setAddMode("assign"); setAssignSearch(""); setNewCrewName("");
  };

  const teamNameMap = Object.fromEntries(teams.map(t => [t.id, t.name]));

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-gray-500">
          Manage who is on each team. To create a login account, go to{" "}
          <a href="/settings" className="text-[#00AECD] hover:underline font-medium">Settings → Users</a>.
        </p>
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

      <div className="space-y-3">
        {isLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex items-center justify-center py-12 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />Loading…
          </div>
        ) : teams.length === 0 && !creating ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col items-center justify-center py-16 text-gray-400">
            <UsersRound className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">No teams yet — create one to get started</p>
          </div>
        ) : (
          <>
            {teams.map(team => {
              const members = crewMembers.filter(m => m.teamId === team.id);
              const isAddingHere = addingToTeam === team.id;

              const assignableUsers = allUsers.filter(u =>
                u.isActive &&
                u.teamId !== team.id &&
                !members.find(m => m.hasAccount && m.id === u.id) &&
                u.name.toLowerCase().includes(assignSearch.toLowerCase()),
              );

              return (
                <div key={team.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  {/* Team header */}
                  <div className="flex items-center gap-3 px-5 py-3.5 group">
                    {editingId === team.id ? (
                      <>
                        <Input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); saveEdit(); } if (e.key === "Escape") cancelEdit(); }}
                          className="h-8 text-sm flex-1 max-w-xs" />
                        <button onClick={saveEdit} disabled={rename.isPending || !editName.trim()} className="p-1.5 rounded-md hover:bg-emerald-50 text-emerald-600 disabled:opacity-40 transition-colors" title="Save">
                          {rename.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        </button>
                        <button onClick={cancelEdit} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 transition-colors" title="Cancel">
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <UsersRound className="w-4 h-4 text-gray-300 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-800">{team.name}</div>
                          <div className="text-[11px] text-gray-400">{departmentLabel(team.department)}</div>
                        </div>
                        <span className="text-xs text-gray-400 mr-1">{members.length} member{members.length !== 1 ? "s" : ""}</span>
                        <button onClick={() => startEdit(team)} className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all" title="Rename">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            const msg = members.length > 0
                              ? `Delete "${team.name}"? Its ${members.length} member(s) will be unassigned.`
                              : `Delete "${team.name}"?`;
                            if (window.confirm(msg)) deleteTeam.mutate(team.id);
                          }}
                          disabled={deleteTeam.isPending}
                          className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all disabled:opacity-40"
                          title="Delete team"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>

                  {/* Member list */}
                  {members.length === 0 ? (
                    <div className="border-t border-gray-100 px-5 py-3 text-xs text-gray-400 italic">
                      No members yet
                    </div>
                  ) : (
                    <div className="border-t border-gray-100 divide-y divide-gray-50">
                      {members.map(m => {
                        const initials = m.personName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
                        const roleConf = ROLE_COLOURS[m.role] ?? ROLE_COLOURS.field_worker;
                        return (
                          <div key={m.id} className="flex items-center gap-3 px-5 py-2.5 group/row">
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                              style={{ backgroundColor: m.hasAccount ? BRAND : "#9ca3af" }}
                            >
                              {initials}
                            </div>
                            <span className="flex-1 text-sm text-gray-800">{m.personName}</span>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: roleConf.bg, color: roleConf.text }}>
                              {ROLE_LABELS[m.role] ?? "Field Worker"}
                            </span>
                            {m.hasAccount ? (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-100">Has account</span>
                            ) : (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 border border-gray-200">Crew only</span>
                            )}
                            <button
                              onClick={() => removeMember.mutate(m)}
                              disabled={removeMember.isPending}
                              className="opacity-0 group-hover/row:opacity-100 p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all disabled:opacity-40 flex-shrink-0"
                              title="Remove from team"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add member section */}
                  <div className="border-t border-gray-100">
                    {isAddingHere ? (
                      <div className="px-5 py-3 bg-gray-50/60">
                        {/* Mode toggle */}
                        <div className="flex gap-1 mb-3 bg-gray-100 rounded-lg p-1 w-fit">
                          <button
                            onClick={() => setAddMode("assign")}
                            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${addMode === "assign" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                          >
                            Staff with account
                          </button>
                          <button
                            onClick={() => setAddMode("new")}
                            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${addMode === "new" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                          >
                            New crew-only person
                          </button>
                        </div>

                        {addMode === "assign" ? (
                          <div className="space-y-2">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" />
                              <Input
                                autoFocus
                                placeholder="Search by name…"
                                value={assignSearch}
                                onChange={e => setAssignSearch(e.target.value)}
                                className="pl-8 h-8 text-xs"
                              />
                            </div>
                            <div className="max-h-44 overflow-y-auto bg-white border border-gray-200 rounded-lg divide-y divide-gray-50">
                              {assignableUsers.length === 0 ? (
                                <p className="px-3 py-3 text-xs text-gray-400 italic">
                                  {allUsers.filter(u => u.isActive && u.teamId !== team.id).length === 0
                                    ? "All active staff are already in this team"
                                    : "No matching staff"}
                                </p>
                              ) : assignableUsers.map(u => (
                                <button
                                  key={u.id}
                                  onClick={() => assignUserToTeam.mutate({ userId: u.id, teamId: team.id })}
                                  disabled={assignUserToTeam.isPending}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 transition-colors disabled:opacity-50"
                                >
                                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0" style={{ backgroundColor: BRAND }}>
                                    {u.initials}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-gray-800 truncate">{u.name}</p>
                                    <p className="text-[10px] text-gray-400 truncate">
                                      {ROLE_LABELS[u.role] ?? u.role}
                                      {u.teamId ? ` · ${teamNameMap[u.teamId] ?? "another team"}` : " · unassigned"}
                                    </p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <form
                            onSubmit={e => {
                              e.preventDefault();
                              if (!newCrewName.trim()) return;
                              addCrewMember.mutate({ personName: newCrewName.trim(), teamId: team.id, role: newCrewRole });
                            }}
                            className="space-y-2"
                          >
                            {/* Name row with initials preview */}
                            <div className="flex items-center gap-2">
                              <div
                                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 bg-gray-300"
                                title="Auto-generated initials"
                              >
                                {autoInitials(newCrewName)}
                              </div>
                              <Input
                                autoFocus
                                placeholder="Full name…"
                                value={newCrewName}
                                onChange={e => setNewCrewName(e.target.value)}
                                className="h-8 text-xs flex-1"
                              />
                            </div>
                            {/* Role row */}
                            <div className="flex items-center gap-2">
                              <div className="w-7 flex-shrink-0" />
                              <select
                                value={newCrewRole}
                                onChange={e => setNewCrewRole(e.target.value as "field_worker" | "supervisor")}
                                className="h-8 text-xs flex-1 rounded-md border border-gray-200 bg-white px-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#00AECD]/30"
                              >
                                <option value="field_worker">Field Worker</option>
                                <option value="supervisor">Supervisor</option>
                              </select>
                              <button
                                type="submit"
                                disabled={addCrewMember.isPending || !newCrewName.trim()}
                                className="p-1.5 rounded-md hover:bg-emerald-50 text-emerald-600 disabled:opacity-40 transition-colors flex-shrink-0"
                                title="Add crew member"
                              >
                                {addCrewMember.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                              </button>
                            </div>
                          </form>
                        )}

                        <button onClick={closeAddPanel} className="mt-2.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => openAddPanel(team.id)}
                        className="w-full flex items-center gap-2 px-5 py-2.5 text-xs text-gray-400 hover:text-[#00AECD] hover:bg-gray-50/60 transition-colors"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Add member
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* New team input */}
            {creating && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex items-end gap-3 px-5 py-4">
                <UsersRound className="w-4 h-4 text-gray-300 flex-shrink-0" />
                <div className="grid flex-1 grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-[11px] font-medium text-gray-500">Team name</span>
                    <Input
                      id="new-team-input"
                      autoFocus
                      placeholder="Team name…"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (newName.trim() && newDepartment) createTeam.mutate({ name: newName.trim(), department: newDepartment });
                        }
                        if (e.key === "Escape") { setCreating(false); setNewName(""); setNewDepartment(""); }
                      }}
                      className="h-9 text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] font-medium text-gray-500">Department</span>
                    <Select value={newDepartment} onValueChange={value => setNewDepartment(value as DepartmentValue)}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Select department…" />
                      </SelectTrigger>
                      <SelectContent>
                        {DEPARTMENTS.map(({ value, label }) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                </div>
                <button onClick={() => { if (newName.trim() && newDepartment) createTeam.mutate({ name: newName.trim(), department: newDepartment }); }} disabled={createTeam.isPending || !newName.trim() || !newDepartment} className="p-1.5 rounded-md hover:bg-emerald-50 text-emerald-600 disabled:opacity-40 transition-colors" title="Create">
                  {createTeam.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
                <button onClick={() => { setCreating(false); setNewName(""); setNewDepartment(""); }} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 transition-colors" title="Cancel">
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
          { icon: Ruler,      label: "Total Area",        value: `${Number(totals?.totalAreaM2 ?? 0).toFixed(1)} m²`,     sub: "across all teams"      },
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
            <span className="font-semibold text-gray-600">{data.meta.annualFteHours} hrs/FTE/year</span>
            <span>× crew of</span>
            <span className="font-semibold text-gray-600">{data.meta.standardCrewSize}</span>
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
                      <span className="text-sm font-semibold text-gray-800">{Number(row.totalAreaM2).toFixed(1)}</span>
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
                              style={{ width: `${Math.min(100, (row.ftesRequired / 4) * 100)}%`, background: BRAND }}
                            />
                          </div>
                          <span
                            className="text-sm font-bold tabular-nums"
                            style={{ color: BRAND }}
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
                    <span className="text-sm font-bold" style={{ color: NAVY }}>{Number(totals.totalAreaM2).toFixed(1)} m²</span>
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
            FTE calculation: (annual service hours × crew size {data.meta.standardCrewSize}) ÷ {data.meta.annualFteHours} hrs/FTE/year.
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
  const { toast } = useToast();
  const qc = useQueryClient();
  const canEdit = user?.role === "administrator" || user?.role === "manager" || user?.role === "supervisor";
  const PEOPLE = useLivePeople();

  const [activeTab, setActiveTab] = useState<"workload" | "composition" | "availability">("availability");
  const [weekMon, setWeekMon]     = useState<Date>(() => getMondayOfWeek(new Date()));
  const [activeDay, setActiveDay] = useState(0);

  const [capacityWarning,             setCapacityWarning]            = useState<CapacityWarning | null>(null);
  const [capacityUnreliableDismissed, setCapacityUnreliableDismissed] = useState(false);
  const [replanLoading,      setReplanLoading]      = useState(false);
  const [replanSuccess,      setReplanSuccess]      = useState(false);
  const [replanError,        setReplanError]        = useState<string | null>(null);
  const [strandedJobsWarn,   setStrandedJobsWarn]   = useState<{
    personName: string; date: string; count: number;
  } | null>(null);

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

  const saveAvailability = async (body: { personName: string; date: string; hour: number; status: Status; skipSpill?: boolean }) => {
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
      spilledCount: number;
      targetDate: string;
      strandedJobs: { id: string; issueType: string; description: string }[];
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
      qc.invalidateQueries({ queryKey: ["day-capacity-reliable", variables.date] });

      // Auto-spill toast
      if (data.spilledCount > 0) {
        setCapacityWarning(null);
        const dayName = new Date(data.targetDate + "T12:00:00Z")
          .toLocaleDateString("en-NZ", { weekday: "long" });
        toast({
          title: "Schedule adjusted automatically",
          description: `${data.spilledCount} job${data.spilledCount !== 1 ? "s" : ""} moved to ${dayName} to fit reduced capacity.`,
        });
        qc.invalidateQueries({ queryKey: ["/api/schedule/week"] });
        qc.invalidateQueries({ queryKey: ["/api/schedule/range"] });
      } else {
        applyCapacityWarning(data, variables.personName, variables.date);
      }

      // Stranded reactive jobs warning
      if (data.strandedJobs?.length > 0) {
        setStrandedJobsWarn({ personName: variables.personName, date: variables.date, count: data.strandedJobs.length });
        toast({
          title: "Unscheduled work needs reassignment",
          description: `${variables.personName} has ${data.strandedJobs.length} unscheduled job${data.strandedJobs.length !== 1 ? "s" : ""} on this day that need a new assignee.`,
        });
      }
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

  // Unique non-null teamIds represented in the current people list
  const uniqueTeamIds = useMemo(
    () => [...new Set(PEOPLE.map(p => p.teamId).filter((id): id is string => id !== null))],
    [PEOPLE],
  );

  // Reliability query — re-runs whenever the active day changes; invalidated after any save/replan.
  // Returns true when ANY visible team's capacity figures should be treated as approximate.
  const { data: capacityUnreliable = false } = useQuery<boolean>({
    queryKey: ["day-capacity-reliable", dayDate],
    queryFn: async () => {
      if (uniqueTeamIds.length === 0) return false;
      const results = await Promise.all(
        uniqueTeamIds.map(teamId =>
          fetch(`/api/schedule/day-capacity?teamId=${teamId}&date=${dayDate}`, { credentials: "include" })
            .then(r => r.ok ? r.json() : null) as Promise<{ capacityDataReliable?: boolean } | null>,
        ),
      );
      return results.some(r => r !== null && r.capacityDataReliable === false);
    },
    enabled: activeTab === "availability" && uniqueTeamIds.length > 0,
    staleTime: 30_000,
  });

  const handleSave = (personName: string, hour: number, status: Status) => {
    mutation.mutate({ personName, date: dayDate, hour, status });
  };

  const handleSetWholeDay = async (personName: string, status: Status) => {
    // skipSpill=true on each parallel save to avoid race conditions — one
    // clean spill is triggered below after all saves have committed.
    const wholeResults = await Promise.all(HOURS.map(h => saveAvailability({ personName, date: dayDate, hour: h, status, skipSpill: true })));
    qc.invalidateQueries({ queryKey: ["team-avail", weekStart] });

    // Check stranded reactive jobs from any of the parallel saves
    const strandedJobs = wholeResults.flatMap(r => r.strandedJobs ?? []);
    if (strandedJobs.length > 0) {
      setStrandedJobsWarn({ personName, date: dayDate, count: strandedJobs.length });
      toast({
        title: "Unscheduled work needs reassignment",
        description: `${personName} has ${strandedJobs.length} unscheduled job${strandedJobs.length !== 1 ? "s" : ""} on this day that need a new assignee.`,
      });
    }

    const person = PEOPLE.find(p => p.name === personName);
    if (person?.teamId) {
      try {
        const cap = await fetch(
          `/api/schedule/day-capacity?teamId=${person.teamId}&date=${dayDate}`,
          { credentials: "include" },
        ).then(r => r.ok ? r.json() : null) as { utilizationPct: number } | null;

        // Invalidate the reliability query so the banner reflects the new state
        qc.invalidateQueries({ queryKey: ["day-capacity-reliable", dayDate] });

        if (cap && cap.utilizationPct > 100) {
          // Auto-spill: call replan-day which handles geosequence + multi-day overflow
          const spillRes = await fetch("/api/schedule/replan-day", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ teamId: person.teamId, date: dayDate }),
          });
          if (spillRes.ok) {
            const result = await spillRes.json() as { jobsOnDate: number; jobsSpilled: number };
            if (result.jobsSpilled > 0) {
              const dayName = new Date(dayDate + "T12:00:00Z")
                .toLocaleDateString("en-NZ", { weekday: "long" });
              toast({
                title: "Schedule adjusted automatically",
                description: `${result.jobsSpilled} job${result.jobsSpilled !== 1 ? "s" : ""} moved to next working day to fit reduced capacity on ${dayName}.`,
              });
              qc.invalidateQueries({ queryKey: ["/api/schedule/week"] });
              qc.invalidateQueries({ queryKey: ["/api/schedule/range"] });
            }
            setCapacityWarning(null);
            setReplanSuccess(false);
          }
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

      // Invalidate the reliability query so the banner reflects the post-replan state
      qc.invalidateQueries({ queryKey: ["day-capacity-reliable", capacityWarning.date] });

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
    <div className="flex flex-col flex-1 overflow-y-auto bg-[#f5f7f9]">
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
                <button
                  onClick={() => setCapacityWarning(null)}
                  aria-label="Dismiss warning"
                  className="text-red-400 hover:text-red-600 transition-colors flex-shrink-0 mt-0.5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Under-count warning banner */}
            {capacityUnreliable && !capacityUnreliableDismissed && (
              <div className="flex items-start gap-2 rounded-xl border border-yellow-300 bg-yellow-50 px-5 py-3">
                <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-yellow-800 flex-1">
                  <span className="font-semibold">Scheduled minutes may be under-counted.</span>{" "}
                  One or more capacity sub-queries returned no data while others returned results — capacity figures should be treated as approximate.
                </p>
                <button
                  onClick={() => setCapacityUnreliableDismissed(true)}
                  aria-label="Dismiss warning"
                  className="text-yellow-600 hover:text-yellow-800 transition-colors flex-shrink-0 mt-0.5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Stranded reactive jobs warning */}
            {strandedJobsWarn && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-start gap-4">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-800">
                    {strandedJobsWarn.personName} has{" "}
                    {strandedJobsWarn.count} unscheduled {strandedJobsWarn.count !== 1 ? "jobs" : "job"} on{" "}
                    {new Date(strandedJobsWarn.date + "T12:00:00Z").toLocaleDateString("en-NZ", {
                      weekday: "long", day: "numeric", month: "long",
                    })}{" "}that need reassigning.
                  </p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    They're marked unavailable — these jobs won't get done without a new assignee.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <a
                    href="/reactive-jobs"
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ background: "#f59e0b" }}
                  >
                    View Jobs
                  </a>
                  <button
                    onClick={() => setStrandedJobsWarn(null)}
                    className="text-amber-400 hover:text-amber-600 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
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
