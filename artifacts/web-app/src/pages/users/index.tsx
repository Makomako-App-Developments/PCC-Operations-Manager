import { useState } from "react";
import { format } from "date-fns";
import { Users as UsersIcon, Plus, ToggleLeft, ToggleRight, Loader2, Search, ChevronDown, HardHat } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const BRAND = "#00AECD";
const NAVY  = "#0f2a36";

interface UserSafe {
  id:        string;
  email:     string;
  name:      string;
  initials:  string;
  role:      "administrator" | "manager" | "supervisor" | "field_worker";
  teamId:    string | null;
  isActive:  boolean;
  createdAt: string;
  updatedAt: string;
}

interface Team {
  id:   string;
  name: string;
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

interface CrewMember {
  id:         string;
  personName: string;
  teamId:     string;
  hasAccount: boolean;
}

function useUsers() {
  return useQuery<{ data: UserSafe[]; total: number }>({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch("/api/users", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load users");
      return res.json();
    },
  });
}

function useCrewMembers() {
  return useQuery<CrewMember[]>({
    queryKey: ["crew-members"],
    queryFn: async () => {
      const res = await fetch("/api/team-members", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load crew members");
      return res.json();
    },
  });
}

function useTeams() {
  return useQuery<Team[]>({
    queryKey: ["teams"],
    queryFn: async () => {
      const res = await fetch("/api/teams", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load teams");
      return res.json();
    },
  });
}

function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: Partial<UserSafe> & { id: string; password?: string }) => {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update user");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["teams-with-counts"] });
    },
  });
}

function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      email: string;
      name: string;
      initials: string;
      password: string;
      role: string;
      teamId?: string;
    }) => {
      const res = await fetch("/api/users", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to create user");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["teams-with-counts"] });
    },
  });
}

function TeamCell({ user, teams }: { user: UserSafe; teams: Team[] }) {
  const updateUser = useUpdateUser();
  const { toast } = useToast();
  const currentTeam = teams.find(t => t.id === user.teamId);

  const assign = async (teamId: string | null) => {
    try {
      await updateUser.mutateAsync({ id: user.id, teamId });
      toast({
        title: teamId ? "Team assigned" : "Removed from team",
        description: teamId ? `${user.name} → ${teams.find(t => t.id === teamId)?.name}` : user.name,
      });
    } catch {
      toast({ title: "Error", description: "Could not update team.", variant: "destructive" });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1 text-xs rounded px-2 py-1 hover:bg-gray-100 transition-colors max-w-[140px] group"
          title="Change team"
        >
          <span className={`truncate ${currentTeam ? "text-gray-700 font-medium" : "text-gray-400 italic"}`}>
            {currentTeam?.name ?? "Unassigned"}
          </span>
          <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {teams.map(t => (
          <DropdownMenuItem
            key={t.id}
            onClick={() => assign(t.id)}
            className={t.id === user.teamId ? "font-semibold text-[#00AECD]" : ""}
          >
            {t.name}
            {t.id === user.teamId && <span className="ml-auto text-[10px] text-[#00AECD]">current</span>}
          </DropdownMenuItem>
        ))}
        {user.teamId && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => assign(null)} className="text-gray-400">
              Remove from team
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const EMPTY_FORM = { name: "", email: "", initials: "", password: "", role: "field_worker", teamId: "" };

function CreateUserDialog({ open, onClose, teams }: { open: boolean; onClose: () => void; teams: Team[] }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const createUser = useCreateUser();
  const { toast } = useToast();

  const set = (k: string) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: Record<string, string> = { ...form };
      if (payload.teamId === "__none__") payload.teamId = "";
      if (!payload.teamId) delete payload.teamId;
      await createUser.mutateAsync(payload as Parameters<typeof createUser.mutateAsync>[0]);
      toast({ title: "Account created", description: `${form.name} can now sign in.` });
      setForm(EMPTY_FORM);
      onClose();
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Staff Account</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>Full name</Label>
              <Input required value={form.name} onChange={e => set("name")(e.target.value)} placeholder="Jane Smith" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Email address</Label>
              <Input required type="email" value={form.email} onChange={e => set("email")(e.target.value)} placeholder="jane.smith@poriruacity.govt.nz" />
            </div>
            <div className="space-y-1">
              <Label>Initials</Label>
              <Input required maxLength={4} value={form.initials} onChange={e => set("initials")(e.target.value.toUpperCase())} placeholder="JS" className="uppercase" />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={set("role")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="field_worker">Field Worker</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="administrator">Administrator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {teams.length > 0 && (
              <div className="col-span-2 space-y-1">
                <Label>Team <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Select value={form.teamId} onValueChange={set("teamId")}>
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="col-span-2 space-y-1">
              <Label>Temporary password</Label>
              <Input required minLength={8} type="password" value={form.password} onChange={e => set("password")(e.target.value)} placeholder="Min 8 characters" />
              <p className="text-[11px] text-gray-400">Ask the staff member to change this after first sign-in.</p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={createUser.isPending}>Cancel</Button>
            <Button type="submit" disabled={createUser.isPending} style={{ backgroundColor: BRAND }}>
              {createUser.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function UsersPage({ embedded }: { embedded?: boolean } = {}) {
  const { data, isLoading } = useUsers();
  const { data: teams = [] } = useTeams();
  const { data: crewMembers = [] } = useCrewMembers();
  const updateUser = useUpdateUser();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const users = data?.data ?? [];
  const filtered = search
    ? users.filter(u =>
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        u.role.includes(search.toLowerCase())
      )
    : users;

  // Crew-only members: no system account
  const crewOnly = crewMembers.filter(m => !m.hasAccount && (
    !search || m.personName.toLowerCase().includes(search.toLowerCase())
  ));

  const toggleActive = async (user: UserSafe) => {
    try {
      await updateUser.mutateAsync({ id: user.id, isActive: !user.isActive });
      toast({
        title: user.isActive ? "Account deactivated" : "Account reactivated",
        description: user.name,
      });
    } catch {
      toast({ title: "Error", description: "Could not update account.", variant: "destructive" });
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f5f7f9]">
      {!embedded && (
        <header className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: NAVY }}>
              <UsersIcon className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Users</h1>
              <p className="text-xs text-gray-400">Manage staff accounts and access</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-xs" style={{ color: BRAND, borderColor: BRAND }}>
              Manager only
            </Badge>
            <Button
              size="sm"
              className="gap-1.5 text-white"
              style={{ backgroundColor: BRAND }}
              onClick={() => setCreating(true)}
            >
              <Plus className="w-4 h-4" />
              New Account
            </Button>
          </div>
        </header>
      )}
      {embedded && (
        <div className="px-8 py-3 bg-white border-b flex justify-end">
          <Button
            size="sm"
            className="gap-1.5 text-white"
            style={{ backgroundColor: BRAND }}
            onClick={() => setCreating(true)}
          >
            <Plus className="w-4 h-4" />
            New Account
          </Button>
        </div>
      )}

      <div className="px-8 py-3 border-b bg-white sticky top-[73px] z-10 shadow-sm">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
          <Input
            placeholder="Search by name, email or role…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-9 w-72 text-sm"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <UsersIcon className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">No staff accounts found</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500">Staff Member</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500">Email</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500">Role</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500">Team</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500">Since</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(user => {
                  const roleConf = ROLE_COLOURS[user.role] ?? { bg: "#f3f4f6", text: "#6b7280" };
                  return (
                    <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                            style={{ backgroundColor: user.isActive ? BRAND : "#9ca3af" }}
                          >
                            {user.initials}
                          </div>
                          <span className="font-medium text-gray-900">{user.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-gray-500 text-xs">{user.email}</td>
                      <td className="px-4 py-3.5">
                        <span
                          className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                          style={{ background: roleConf.bg, color: roleConf.text }}
                        >
                          {ROLE_LABELS[user.role] ?? user.role}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <TeamCell user={user} teams={teams} />
                      </td>
                      <td className="px-4 py-3.5 text-xs text-gray-400">
                        {format(new Date(user.createdAt), "d MMM yyyy")}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                          style={user.isActive
                            ? { background: "#dcfce7", color: "#16a34a" }
                            : { background: "#fee2e2", color: "#dc2626" }
                          }
                        >
                          {user.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          onClick={() => toggleActive(user)}
                          disabled={updateUser.isPending}
                          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors ml-auto"
                          title={user.isActive ? "Deactivate account" : "Reactivate account"}
                        >
                          {user.isActive
                            ? <ToggleRight className="w-5 h-5 text-green-500" />
                            : <ToggleLeft className="w-5 h-5 text-gray-400" />
                          }
                          {user.isActive ? "Deactivate" : "Reactivate"}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {/* Crew-only members — no system account */}
                {crewOnly.length > 0 && (
                  <>
                    <tr>
                      <td colSpan={7} className="px-5 pt-4 pb-1.5">
                        <div className="flex items-center gap-2">
                          <HardHat className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                            Crew members — no system account
                          </span>
                        </div>
                      </td>
                    </tr>
                    {crewOnly.map(m => {
                      const team = teams.find(t => t.id === m.teamId);
                      const initials = m.personName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
                      return (
                        <tr key={m.id} className="border-b border-gray-100 bg-gray-50/40 opacity-70">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 bg-gray-300">
                                {initials}
                              </div>
                              <span className="font-medium text-gray-500">{m.personName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs italic">No PCC account</td>
                          <td className="px-4 py-3">
                            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-400">
                              Field Worker
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400">{team?.name ?? "—"}</td>
                          <td className="px-4 py-3 text-xs text-gray-300">—</td>
                          <td className="px-4 py-3">
                            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-400">
                              Crew only
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400 text-right italic">No login</td>
                        </tr>
                      );
                    })}
                  </>
                )}
              </tbody>
            </table>
          )}
        </div>

        {!isLoading && data && (
          <p className="text-xs text-gray-400 mt-3 text-right">
            {data.total} staff account{data.total !== 1 ? "s" : ""}
            {crewOnly.length > 0 && ` · ${crewOnly.length} crew-only`}
          </p>
        )}
      </div>

      {creating && <CreateUserDialog open onClose={() => setCreating(false)} teams={teams} />}
    </div>
  );
}
