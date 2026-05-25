import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, Plus, Check, X, Users, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const BRAND = "#00AECD";
const NAVY  = "#0f2a36";

interface TeamWithCount {
  id:          string;
  name:        string;
  createdAt:   string;
  memberCount: number;
}

function useTeams() {
  return useQuery<TeamWithCount[]>({
    queryKey: ["teams-with-counts"],
    queryFn: async () => {
      const res = await fetch("/api/teams/with-counts", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load teams");
      return res.json();
    },
  });
}

export default function TeamsPage() {
  const qc = useQueryClient();
  const { data: teams = [], isLoading } = useTeams();
  const { toast } = useToast();

  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editName, setEditName]       = useState("");
  const [creating, setCreating]       = useState(false);
  const [newName, setNewName]         = useState("");

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

  const startEdit = (team: TeamWithCount) => {
    setEditingId(team.id);
    setEditName(team.name);
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = () => {
    if (!editingId || !editName.trim()) return;
    rename.mutate({ id: editingId, name: editName.trim() });
  };

  const handleCreateKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); if (newName.trim()) create.mutate(newName.trim()); }
    if (e.key === "Escape") { setCreating(false); setNewName(""); }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); saveEdit(); }
    if (e.key === "Escape") cancelEdit();
  };

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: NAVY }}>
            <Users className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Teams</h2>
            <p className="text-xs text-gray-400">Rename teams or create new ones. Move staff via the Users tab.</p>
          </div>
        </div>
        {!creating && (
          <Button
            size="sm"
            className="gap-1.5 text-white"
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
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading…
          </div>
        ) : teams.length === 0 && !creating ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Users className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">No teams yet</p>
          </div>
        ) : (
          <>
            {teams.map(team => (
              <div key={team.id} className="flex items-center gap-3 px-5 py-3.5 group">
                {editingId === team.id ? (
                  <>
                    <Input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={handleEditKeyDown}
                      className="h-8 text-sm flex-1 max-w-xs"
                    />
                    <button
                      onClick={saveEdit}
                      disabled={rename.isPending || !editName.trim()}
                      className="p-1.5 rounded-md hover:bg-emerald-50 text-emerald-600 disabled:opacity-40 transition-colors"
                      title="Save"
                    >
                      {rename.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 transition-colors"
                      title="Cancel"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-medium text-gray-800">{team.name}</span>
                    <span className="text-xs text-gray-400 mr-2">
                      {team.memberCount} active member{team.memberCount !== 1 ? "s" : ""}
                    </span>
                    <button
                      onClick={() => startEdit(team)}
                      className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all"
                      title="Rename"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => remove.mutate(team.id)}
                      disabled={remove.isPending}
                      className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all disabled:opacity-40"
                      title={team.memberCount > 0 ? "Cannot delete — has members" : "Delete team"}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            ))}

            {creating && (
              <div className="flex items-center gap-3 px-5 py-3.5">
                <Input
                  id="new-team-input"
                  autoFocus
                  placeholder="Team name…"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={handleCreateKeyDown}
                  className="h-8 text-sm flex-1 max-w-xs"
                />
                <button
                  onClick={() => { if (newName.trim()) create.mutate(newName.trim()); }}
                  disabled={create.isPending || !newName.trim()}
                  className="p-1.5 rounded-md hover:bg-emerald-50 text-emerald-600 disabled:opacity-40 transition-colors"
                  title="Create"
                >
                  {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => { setCreating(false); setNewName(""); }}
                  className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 transition-colors"
                  title="Cancel"
                >
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
