import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, X, Check, Leaf } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const BRAND = "#00AECD";

const PLANT_TYPES = ["Tree", "Shrub", "Ground cover", "Fern", "Grass", "Herbaceous perennial"] as const;
type PlantType = typeof PLANT_TYPES[number];

const TYPE_COLORS: Record<PlantType, string> = {
  "Tree":                  "bg-green-100 text-green-800",
  "Shrub":                 "bg-emerald-100 text-emerald-700",
  "Ground cover":          "bg-teal-100 text-teal-700",
  "Fern":                  "bg-lime-100 text-lime-700",
  "Grass":                 "bg-yellow-100 text-yellow-700",
  "Herbaceous perennial":  "bg-purple-100 text-purple-700",
};

interface Species {
  id: string;
  botanicalName: string;
  plantType: string;
}

async function fetchPalette(): Promise<Species[]> {
  const r = await fetch("/api/plant-palette", { credentials: "include" });
  if (!r.ok) throw new Error("Failed to load palette");
  return r.json();
}

export default function PlantPaletteSettingsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: species = [], isLoading } = useQuery<Species[]>({
    queryKey: ["/api/plant-palette"],
    queryFn: fetchPalette,
  });

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<PlantType>("Shrub");

  const [editId, setEditId]   = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<PlantType>("Shrub");

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const addMutation = useMutation({
    mutationFn: (data: { botanicalName: string; plantType: string }) =>
      fetch("/api/plant-palette", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/plant-palette"] });
      setNewName(""); setNewType("Shrub"); setShowAdd(false);
      toast({ title: "Species added" });
    },
    onError: () => toast({ title: "Failed to add species", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { botanicalName: string; plantType: string } }) =>
      fetch(`/api/plant-palette/${id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/plant-palette"] });
      setEditId(null);
      toast({ title: "Species updated" });
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/plant-palette/${id}`, { method: "DELETE", credentials: "include" })
        .then(r => { if (!r.ok) throw new Error(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/plant-palette"] });
      setDeleteId(null);
      toast({ title: "Species removed" });
    },
    onError: () => toast({ title: "Failed to remove", variant: "destructive" }),
  });

  const startEdit = (sp: Species) => {
    setEditId(sp.id);
    setEditName(sp.botanicalName);
    setEditType(sp.plantType as PlantType);
    setShowAdd(false);
    setDeleteId(null);
  };

  const handleAdd = () => {
    if (!newName.trim()) { toast({ title: "Enter a botanical name", variant: "destructive" }); return; }
    addMutation.mutate({ botanicalName: newName.trim(), plantType: newType });
  };

  const handleUpdate = () => {
    if (!editName.trim() || !editId) return;
    updateMutation.mutate({ id: editId, data: { botanicalName: editName.trim(), plantType: editType } });
  };

  const categoryCount = PLANT_TYPES.filter(t => species.some(s => s.plantType === t)).length;

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Leaf className="w-5 h-5" style={{ color: BRAND }} />
            Species Palette
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {species.length} species across {categoryCount} categories — used when creating infill planting assessments.
          </p>
        </div>
        <Button
          onClick={() => { setShowAdd(v => !v); setEditId(null); setDeleteId(null); }}
          className="flex items-center gap-2 text-sm font-semibold text-white rounded-xl"
          style={{ background: BRAND }}
        >
          <Plus className="w-4 h-4" />
          Add species
        </Button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="mb-6 border border-dashed border-[#00AECD] rounded-xl p-4 bg-teal-50/40">
          <p className="text-xs font-semibold text-gray-700 mb-3">New species</p>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Label className="text-[11px] text-gray-500 mb-1 block">Botanical name</Label>
              <Input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAdd()}
                placeholder="e.g. Coprosma robusta"
                className="rounded-xl text-sm italic"
              />
            </div>
            <div className="w-52">
              <Label className="text-[11px] text-gray-500 mb-1 block">Category</Label>
              <select
                value={newType}
                onChange={e => setNewType(e.target.value as PlantType)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] bg-white"
              >
                {PLANT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <Button
              onClick={handleAdd}
              disabled={addMutation.isPending}
              className="text-white rounded-xl shrink-0"
              style={{ background: BRAND }}
            >
              {addMutation.isPending ? "Adding…" : "Add"}
            </Button>
            <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Species list */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Loading palette…</div>
      ) : (
        <div className="space-y-6">
          {PLANT_TYPES.map(type => {
            const items = species.filter(s => s.plantType === type);
            if (items.length === 0) return null;
            return (
              <div key={type}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${TYPE_COLORS[type]}`}>
                    {type}
                  </span>
                  <span className="text-[11px] text-gray-400">{items.length} species</span>
                </div>

                <div className="border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-50">
                  {items.map(sp => (
                    <div key={sp.id} className={`flex items-center gap-3 px-4 py-3 transition-colors ${editId === sp.id ? "bg-teal-50/40" : "bg-white hover:bg-gray-50"}`}>

                      {editId === sp.id ? (
                        /* ── Inline edit row ── */
                        <>
                          <Input
                            autoFocus
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") handleUpdate(); if (e.key === "Escape") setEditId(null); }}
                            className="flex-1 rounded-xl text-sm italic h-8"
                          />
                          <select
                            value={editType}
                            onChange={e => setEditType(e.target.value as PlantType)}
                            className="w-44 px-2 py-1.5 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] bg-white"
                          >
                            {PLANT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <button
                            onClick={handleUpdate}
                            disabled={updateMutation.isPending}
                            className="p-1.5 rounded-lg text-white shrink-0"
                            style={{ background: BRAND }}
                            title="Save"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditId(null)}
                            className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 shrink-0"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : deleteId === sp.id ? (
                        /* ── Delete confirm row ── */
                        <>
                          <span className="flex-1 text-sm italic text-gray-400 line-through">{sp.botanicalName}</span>
                          <span className="text-xs text-red-500 font-medium">Remove this species?</span>
                          <button
                            onClick={() => deleteMutation.mutate(sp.id)}
                            disabled={deleteMutation.isPending}
                            className="px-3 py-1 text-xs font-semibold text-white rounded-lg bg-red-500 hover:bg-red-600 shrink-0"
                          >
                            {deleteMutation.isPending ? "…" : "Remove"}
                          </button>
                          <button
                            onClick={() => setDeleteId(null)}
                            className="px-3 py-1 text-xs font-semibold text-gray-600 rounded-lg border border-gray-200 hover:bg-gray-100 shrink-0"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        /* ── Normal row ── */
                        <>
                          <span className="flex-1 text-sm italic text-gray-800">{sp.botanicalName}</span>
                          <button
                            onClick={() => startEdit(sp)}
                            className="p-1.5 rounded-lg border border-gray-100 text-gray-400 hover:text-gray-600 hover:border-gray-200 transition-colors shrink-0"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { setDeleteId(sp.id); setEditId(null); }}
                            className="p-1.5 rounded-lg border border-gray-100 text-gray-400 hover:text-red-500 hover:border-red-100 transition-colors shrink-0"
                            title="Remove"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
