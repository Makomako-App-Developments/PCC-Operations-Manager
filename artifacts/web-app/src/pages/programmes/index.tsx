import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useListAssets, getListAssetsQueryKey,
  useListMulchingRecords, getListMulchingRecordsQueryKey,
  useCreateMulchingRecord, useUpdateMulchingRecord,
  useListTeams, getListTeamsQueryKey,
  useGetScheduleWeek, getGetScheduleWeekQueryKey,
} from "@workspace/api-client-react";
import { CapBar, fmtMins, mondayOf, PRODUCTIVE } from "@/components/reactive-job-wizard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import {
  Sprout, Plus, Layers, X, Search, ChevronRight,
  Calendar, Users, Leaf, FileText, AlertTriangle, CheckCircle2,
} from "lucide-react";

const BRAND = "#00AECD";
const NAVY  = "#0f2a36";

// ─── Species catalogue ────────────────────────────────────────────────────────

type SpeciesCategory = "Native Trees" | "Native Shrubs" | "Groundcovers" | "Annual Bedding" | "Roses";

interface Species {
  name: string; maori?: string; category: SpeciesCategory;
  size: "Small" | "Medium" | "Large"; note: string;
}

const SPECIES_LIST: Species[] = [
  { name: "Cordyline australis",    maori: "Tī kōuka",   category: "Native Trees",   size: "Large",  note: "Cabbage tree — excellent focal point" },
  { name: "Sophora microphylla",    maori: "Kōwhai",     category: "Native Trees",   size: "Medium", note: "Seasonal yellow flowers, bird-attracting" },
  { name: "Metrosideros excelsa",   maori: "Pōhutukawa", category: "Native Trees",   size: "Large",  note: "Coastal, summer red flowers" },
  { name: "Kunzea ericoides",       maori: "Kānuka",     category: "Native Trees",   size: "Medium", note: "Fast growing, good nurse tree" },
  { name: "Pittosporum tenuifolium",maori: "Kōhūhū",     category: "Native Trees",   size: "Medium", note: "Shade tolerant, fragrant flowers" },
  { name: "Phormium tenax",         maori: "Harakeke",   category: "Native Shrubs",  size: "Large",  note: "NZ flax — bold structural plant" },
  { name: "Hebe stricta",           maori: "Koromiko",   category: "Native Shrubs",  size: "Small",  note: "White flowers, good filler" },
  { name: "Hebe topiaria",                               category: "Native Shrubs",  size: "Small",  note: "Dense grey-green dome form" },
  { name: "Coprosma robusta",       maori: "Karamu",     category: "Native Shrubs",  size: "Medium", note: "Glossy leaves, orange berries" },
  { name: "Coprosma propinqua",                          category: "Native Shrubs",  size: "Small",  note: "Divaricating, suits revegetation" },
  { name: "Corokia cotoneaster",                         category: "Native Shrubs",  size: "Small",  note: "Wire-netting bush, hardy" },
  { name: "Leptospermum scoparium", maori: "Mānuka",     category: "Native Shrubs",  size: "Medium", note: "Pioneer shrub, fast growing" },
  { name: "Carex secta",            maori: "Purei",      category: "Groundcovers",   size: "Medium", note: "Wetland sedge, good under canopy" },
  { name: "Carex testacea",                              category: "Groundcovers",   size: "Small",  note: "Orange sedge, ornamental" },
  { name: "Libertia grandiflora",   maori: "Mikoikoi",   category: "Groundcovers",   size: "Small",  note: "White flowers, sun/partial shade" },
  { name: "Pratia angulata",                             category: "Groundcovers",   size: "Small",  note: "Creeping groundcover, white flowers" },
  { name: "Festuca glauca",                              category: "Groundcovers",   size: "Small",  note: "Blue fescue, ornamental grass" },
  { name: "Alyssum",                                     category: "Annual Bedding", size: "Small",  note: "White/purple, fragrant edging" },
  { name: "Begonia",                                     category: "Annual Bedding", size: "Small",  note: "Shade tolerant, long flowering" },
  { name: "Impatiens",                                   category: "Annual Bedding", size: "Small",  note: "Busy Lizzie — shade beds" },
  { name: "Lobelia",                                     category: "Annual Bedding", size: "Small",  note: "Blue/white edging, cascading" },
  { name: "Marigold (Tagetes)",                          category: "Annual Bedding", size: "Small",  note: "Bright, long season, pest deterrent" },
  { name: "Pansy (Viola)",                               category: "Annual Bedding", size: "Small",  note: "Cool season colour" },
  { name: "Petunia",                                     category: "Annual Bedding", size: "Small",  note: "Summer to autumn, trailing" },
  { name: "Salvia",                                      category: "Annual Bedding", size: "Small",  note: "Long-flowering, heat tolerant" },
  { name: "'Iceberg'",                                   category: "Roses",          size: "Medium", note: "Floribunda, white, repeat flowering" },
  { name: "'Queen Elizabeth'",                           category: "Roses",          size: "Large",  note: "Floribunda, pink, vigorous" },
  { name: "'Mr Lincoln'",                                category: "Roses",          size: "Medium", note: "Hybrid Tea, deep red, fragrant" },
  { name: "'Just Joey'",                                 category: "Roses",          size: "Medium", note: "Hybrid Tea, apricot, fragrant" },
  { name: "'Double Delight'",                            category: "Roses",          size: "Medium", note: "Hybrid Tea, red/cream, highly fragrant" },
];

const CATEGORIES: SpeciesCategory[] = ["Native Trees", "Native Shrubs", "Groundcovers", "Annual Bedding", "Roses"];

const CAT_COLORS: Record<SpeciesCategory, string> = {
  "Native Trees":   "bg-emerald-100 text-emerald-800",
  "Native Shrubs":  "bg-green-100 text-green-700",
  "Groundcovers":   "bg-lime-100 text-lime-700",
  "Annual Bedding": "bg-yellow-100 text-yellow-700",
  "Roses":          "bg-pink-100 text-pink-700",
};

// ─── Status configs ───────────────────────────────────────────────────────────

type JobStatus = "draft" | "scheduled" | "in_progress" | "completed" | "cancelled";

const JOB_STATUS: Record<JobStatus, { label: string; color: string; bg: string }> = {
  draft:       { label: "Draft",       color: "#6b7280", bg: "#f3f4f6" },
  scheduled:   { label: "Scheduled",   color: "#2563eb", bg: "#eff6ff" },
  in_progress: { label: "In Progress", color: "#d97706", bg: "#fef3c7" },
  completed:   { label: "Completed",   color: "#16a34a", bg: "#dcfce7" },
  cancelled:   { label: "Cancelled",   color: "#9ca3af", bg: "#f9fafb" },
};

const ALLOWED_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  draft:       ["cancelled"],
  scheduled:   ["in_progress", "draft", "cancelled"],
  in_progress: ["completed", "scheduled", "cancelled"],
  completed:   [],
  cancelled:   ["draft"],
};

const MULCH_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  due:          { label: "Due",          color: "#dc2626", bg: "#fef2f2" },
  scheduled:    { label: "Scheduled",    color: "#2563eb", bg: "#eff6ff" },
  completed:    { label: "Completed",    color: "#16a34a", bg: "#dcfce7" },
  not_required: { label: "Not Required", color: "#6b7280", bg: "#f3f4f6" },
};

const MULCH_TYPES = ["Bark Mulch", "Wood Chip", "Compost", "Straw", "Pea Gravel"];

// ─── Types ────────────────────────────────────────────────────────────────────

interface SpeciesLine { speciesName: string; speciesCategory: string; quantity: number; }

interface InfillJob {
  id: string;
  assetId: string;
  assetName: string | null;
  assessorName: string | null;
  assessmentDate: string;
  assessmentNotes: string | null;
  assignedTeamId: string | null;
  teamName: string | null;
  plannedDate: string | null;
  estimatedMins: number | null;
  status: JobStatus;
  species: SpeciesLine[];
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SciName({ name, className = "" }: { name: string; className?: string }) {
  return name.startsWith("'")
    ? <span className={className}>{name}</span>
    : <em className={className}>{name}</em>;
}

function StatusBadge({ status }: { status: JobStatus }) {
  const cfg = JOB_STATUS[status] ?? JOB_STATUS.draft;
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ color: cfg.color, background: cfg.bg }}>
      {cfg.label}
    </span>
  );
}

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  try { return format(parseISO(d), "d MMM yyyy"); } catch { return d; }
}

// ─── Species Picker modal ─────────────────────────────────────────────────────

interface SelectedSpecies { name: string; category: SpeciesCategory; qty: number; notes?: string; }

function SpeciesPicker({
  selected, onToggle, onQtyChange, onClose, onSave,
}: {
  selected: SelectedSpecies[];
  onToggle: (sp: Species) => void;
  onQtyChange: (name: string, qty: number) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<SpeciesCategory | "All">("All");

  const filtered = SPECIES_LIST.filter(sp => {
    const matchCat = activeTab === "All" || sp.category === activeTab;
    const q = search.toLowerCase();
    return matchCat && (!q || sp.name.toLowerCase().includes(q) || (sp.maori?.toLowerCase().includes(q)));
  });
  const isSelected = (name: string) => selected.some(s => s.name === name);
  const totalPlants = selected.reduce((s, sp) => s + sp.qty, 0);

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[85vh]">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Select Species</h3>
            <p className="text-[11px] text-gray-400">{selected.length} species · {totalPlants} plants total</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="px-6 py-3 border-b space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search species or Māori name…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD]" />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {(["All", ...CATEGORIES] as const).map(cat => (
              <button key={cat} onClick={() => setActiveTab(cat as SpeciesCategory | "All")}
                className="text-[11px] font-semibold px-3 py-1 rounded-full transition-colors"
                style={activeTab === cat
                  ? { background: BRAND, color: "white" }
                  : { background: "#f3f4f6", color: "#6b7280" }}>
                {cat}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-2 gap-2">
            {filtered.map(sp => {
              const sel = isSelected(sp.name);
              const selRecord = selected.find(s => s.name === sp.name);
              return (
                <div key={sp.name}
                  className="p-3 rounded-xl border-2 transition-all cursor-pointer"
                  style={{ borderColor: sel ? BRAND : "#f3f4f6", background: sel ? "#00AECD08" : "white" }}
                  onClick={() => !sel && onToggle(sp)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <SciName name={sp.name} className="text-xs font-semibold text-gray-900 leading-tight" />
                      {sp.maori && <p className="text-[10px] text-gray-400 mt-0.5 italic">{sp.maori}</p>}
                      <p className="text-[10px] text-gray-500 mt-0.5">{sp.note}</p>
                    </div>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${CAT_COLORS[sp.category]}`}>{sp.size}</span>
                  </div>
                  {sel && (
                    <div className="mt-2 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      <span className="text-[10px] text-gray-500">Qty:</span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => onQtyChange(sp.name, Math.max(1, (selRecord?.qty ?? 1) - 1))}
                          className="w-5 h-5 rounded bg-gray-100 text-xs font-bold flex items-center justify-center hover:bg-gray-200">−</button>
                        <span className="w-8 text-center text-xs font-bold" style={{ color: BRAND }}>{selRecord?.qty}</span>
                        <button onClick={() => onQtyChange(sp.name, (selRecord?.qty ?? 1) + 1)}
                          className="w-5 h-5 rounded bg-gray-100 text-xs font-bold flex items-center justify-center hover:bg-gray-200">+</button>
                      </div>
                      <button onClick={() => onToggle(sp)} className="ml-auto text-red-400 hover:text-red-600">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {filtered.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">No species match your search.</div>
          )}
        </div>
        <div className="px-6 py-4 border-t flex items-center justify-between">
          <p className="text-xs text-gray-400">{selected.length} species · {totalPlants} plants</p>
          <button onClick={onSave} disabled={selected.length === 0}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: BRAND }}>
            Confirm Selection
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── New Assessment drawer ────────────────────────────────────────────────────

function NewAssessmentDrawer({
  assets, onClose, onSave,
}: {
  assets: { id: string; name: string; description?: string | null }[];
  onClose: () => void;
  onSave: (job: { assetId: string; assessmentDate: string; assessmentNotes: string; species: SelectedSpecies[] }) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [assetId, setAssetId] = useState("");
  const [assessmentDate, setAssessmentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [species, setSpecies] = useState<SelectedSpecies[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  const asset = assets.find(a => a.id === assetId);
  const totalPlants = species.reduce((s, sp) => s + sp.qty, 0);

  const toggleSpecies = (sp: Species) =>
    setSpecies(prev =>
      prev.some(s => s.name === sp.name)
        ? prev.filter(s => s.name !== sp.name)
        : [...prev, { name: sp.name, category: sp.category, qty: 5 }]
    );
  const setQty = (name: string, qty: number) =>
    setSpecies(prev => prev.map(s => s.name === name ? { ...s, qty } : s));

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6">
      {showPicker && (
        <SpeciesPicker selected={species} onToggle={toggleSpecies} onQtyChange={setQty}
          onClose={() => setShowPicker(false)} onSave={() => setShowPicker(false)} />
      )}
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl">
        {/* Header with step indicator */}
        <div className="px-6 py-4 border-b flex items-start justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-900">New Planting Assessment</h3>
            <div className="flex items-center gap-1 mt-1.5">
              {([1, 2, 3] as const).map(n => (
                <div key={n} className="flex items-center gap-1">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all"
                    style={{ background: step >= n ? BRAND : "#e5e7eb", color: step >= n ? "white" : "#9ca3af" }}>
                    {n}
                  </div>
                  {n < 3 && <div className="w-6 h-px transition-all" style={{ background: step > n ? BRAND : "#e5e7eb" }} />}
                </div>
              ))}
              <span className="text-[11px] text-gray-400 ml-1.5">
                {step === 1 ? "Asset & Notes" : step === 2 ? "Species" : "Review"}
              </span>
            </div>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        {/* Step bodies */}
        <div className="px-6 py-5 space-y-4">
          {step === 1 && (
            <>
              <div>
                <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Garden Asset</Label>
                <select value={assetId} onChange={e => setAssetId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] bg-white">
                  <option value="">— Select an asset —</option>
                  {assets.map(a => <option key={a.id} value={a.id}>{a.name}{a.description ? `, ${a.description}` : ""}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Assessment Date</Label>
                <Input type="date" value={assessmentDate} onChange={e => setAssessmentDate(e.target.value)}
                  className="rounded-xl" />
              </div>
              <div>
                <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Assessment Notes</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                  placeholder="Describe coverage gaps, conditions, observations…"
                  className="rounded-xl resize-none" />
              </div>
            </>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-gray-50 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <Leaf className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-800">{asset?.name}</p>
                  <p className="text-[10px] text-gray-400">{fmt(assessmentDate)}</p>
                </div>
              </div>

              {species.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
                  <Sprout className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">No species selected yet</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {species.map(sp => (
                    <div key={sp.name} className="px-3 py-2 rounded-lg bg-gray-50 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <SciName name={sp.name} className="text-xs font-semibold text-gray-800" />
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${CAT_COLORS[sp.category]}`}>{sp.category}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setQty(sp.name, Math.max(1, sp.qty - 1))}
                            className="w-5 h-5 rounded bg-gray-200 text-xs font-bold flex items-center justify-center">−</button>
                          <span className="text-sm font-bold w-6 text-center" style={{ color: BRAND }}>{sp.qty}</span>
                          <button onClick={() => setQty(sp.name, sp.qty + 1)}
                            className="w-5 h-5 rounded bg-gray-200 text-xs font-bold flex items-center justify-center">+</button>
                          <button onClick={() => setSpecies(p => p.filter(s => s.name !== sp.name))}
                            className="text-red-300 hover:text-red-500 ml-1"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                      <input
                        value={sp.notes ?? ""}
                        onChange={e => setSpecies(prev => prev.map(s => s.name === sp.name ? { ...s, notes: e.target.value } : s))}
                        placeholder="Species notes (optional)"
                        className="w-full px-2 py-1 text-[11px] border border-gray-200 rounded-lg outline-none focus:border-[#00AECD] bg-white"
                      />
                    </div>
                  ))}
                </div>
              )}

              <button onClick={() => setShowPicker(true)}
                className="w-full py-2.5 rounded-xl border-2 border-dashed text-sm font-semibold flex items-center justify-center gap-2"
                style={{ borderColor: BRAND, color: BRAND }}>
                <Plus className="w-4 h-4" /> Add / Edit Species
              </button>

              {species.length > 0 && (
                <p className="text-xs text-gray-500 text-right">
                  Total: <span className="font-bold text-gray-800">{totalPlants} plants</span> across {species.length} species
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                <p className="text-sm font-bold text-emerald-800 mb-1">{asset?.name}</p>
                <p className="text-[11px] text-emerald-600 mb-2">{fmt(assessmentDate)}</p>
                {notes && <p className="text-xs text-emerald-700 italic mb-3">{notes}</p>}
                <div className="space-y-1">
                  {species.map(sp => (
                    <div key={sp.name} className="flex justify-between text-xs text-emerald-700">
                      <SciName name={sp.name} />
                      <span className="font-semibold">{sp.qty} plants</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 pt-2 border-t border-emerald-300 flex justify-between text-xs font-bold text-emerald-800">
                  <span>Total</span>
                  <span>{totalPlants} plants</span>
                </div>
              </div>
              <p className="text-[11px] text-gray-400 text-center">
                Saved as <span className="font-semibold text-gray-600">Draft</span>. Schedule it to a team from the detail panel.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between">
          {step > 1
            ? <button onClick={() => setStep(s => (s - 1) as any)} className="text-sm text-gray-400 hover:text-gray-600">← Back</button>
            : <div />
          }
          {step < 3 ? (
            <button
              onClick={() => setStep(s => (s + 1) as any)}
              disabled={step === 1 ? !assetId : species.length === 0}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40 flex items-center gap-1"
              style={{ background: BRAND }}>
              Next <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => onSave({ assetId, assessmentDate, assessmentNotes: notes, species })}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: BRAND }}>
              Save Assessment
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Job Detail panel ─────────────────────────────────────────────────────────

function JobDetailPanel({
  job, teams, assetTeamId, onClose, onSchedule, onStatusChange,
}: {
  job: InfillJob;
  teams: { id: string; name: string }[];
  assetTeamId?: string | null;
  onClose: () => void;
  onSchedule: (jobId: string, teamId: string, plannedDate: string, estimatedMins: number) => void;
  onStatusChange: (jobId: string, status: JobStatus) => void;
}) {
  const defaultTeam = job.assignedTeamId ?? assetTeamId ?? "";
  const [teamId, setTeamId] = useState(defaultTeam);
  const autoAssigned = !job.assignedTeamId && !!assetTeamId && teamId === assetTeamId;
  const [plannedDate, setPlannedDate] = useState(job.plannedDate ?? "");
  const [estMins, setEstMins] = useState(String(job.estimatedMins ?? ""));
  const totalPlants = job.species.reduce((s, sp) => s + sp.quantity, 0);

  const weekStr = plannedDate ? mondayOf(plannedDate) : "";
  const selectedTeam = teams.find(t => t.id === teamId);
  const teamName = selectedTeam?.name ?? "Team";
  const dateLabel = plannedDate
    ? format(new Date(plannedDate + "T00:00:00"), "EEE d MMM")
    : "";

  const { data: weekData, isLoading: weekLoading } = useGetScheduleWeek(
    { week: weekStr, teamId: teamId || undefined },
    {
      query: {
        queryKey: getGetScheduleWeekQueryKey({ week: weekStr, teamId: teamId || undefined }),
        enabled: !!weekStr && !!teamId,
      },
    },
  );

  const dayJobs = useMemo(
    () => (weekData as any)?.days?.find((d: any) => d.date === plannedDate)?.jobs ?? [],
    [weekData, plannedDate],
  );

  const totalScheduled = useMemo(
    () => dayJobs.reduce((s: number, j: any) => s + (j.serviceTimeMins ?? 0), 0),
    [dayJobs],
  );
  const infillMins = parseInt(estMins) || 0;
  const totalWithInfill = totalScheduled + infillMins;
  const showImpact = !!teamId && !!plannedDate;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-[420px] bg-white shadow-2xl flex flex-col overflow-y-auto">
        {/* Panel header */}
        <div className="px-6 py-4 border-b flex items-start justify-between" style={{ background: NAVY }}>
          <div>
            <p className="text-white text-sm font-bold">{job.assetName ?? "Unknown asset"}</p>
            <p className="text-white/50 text-[11px] mt-0.5">Assessed {fmt(job.assessmentDate)}</p>
            <div className="mt-2"><StatusBadge status={job.status} /></div>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-white/40 hover:text-white" /></button>
        </div>

        <div className="flex-1 p-6 space-y-6">
          {/* Assessment notes */}
          {job.assessmentNotes && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
              <div className="flex items-center gap-1.5 mb-1">
                <FileText className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-[11px] font-semibold text-amber-700">Assessment Notes</span>
              </div>
              <p className="text-xs text-amber-700">{job.assessmentNotes}</p>
            </div>
          )}

          {/* Species lines */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Species Plan · {totalPlants} plants
            </p>
            <div className="space-y-1.5">
              {job.species.map((sp, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50">
                  <div>
                    <SciName name={sp.speciesName} className="text-xs font-semibold text-gray-800" />
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${CAT_COLORS[sp.speciesCategory as SpeciesCategory] ?? "bg-gray-100 text-gray-600"}`}>
                      {sp.speciesCategory}
                    </span>
                  </div>
                  <span className="text-sm font-bold" style={{ color: BRAND }}>{sp.quantity}</span>
                </div>
              ))}
              {job.species.length === 0 && (
                <p className="text-xs text-gray-400 italic">No species lines recorded.</p>
              )}
            </div>
          </div>

          {/* Schedule section */}
          {job.status !== "completed" && job.status !== "cancelled" && (
            <div className="border rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                <Calendar className="w-4 h-4" style={{ color: BRAND }} /> Schedule to Team
              </p>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-[11px] text-gray-500">Assign Team</Label>
                  {autoAssigned && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ background: "#e0f7fb", color: BRAND }}>
                      Area team
                    </span>
                  )}
                </div>
                <select value={teamId} onChange={e => setTeamId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] bg-white">
                  <option value="">— Select team —</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px] text-gray-500 mb-1 block">Planned Date</Label>
                  <Input type="date" value={plannedDate} onChange={e => setPlannedDate(e.target.value)} className="rounded-xl text-sm" />
                </div>
                <div>
                  <Label className="text-[11px] text-gray-500 mb-1 block">Est. time (mins)</Label>
                  <Input type="number" value={estMins} onChange={e => setEstMins(e.target.value)}
                    placeholder="e.g. 120" className="rounded-xl text-sm" />
                </div>
              </div>

              {/* Schedule impact — shown once team + date are both set */}
              {showImpact && (
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-4">
                  <p className="text-xs font-bold text-gray-700">
                    Schedule impact — {teamName}, {dateLabel}
                  </p>
                  {weekLoading ? (
                    <div className="h-10 flex items-center justify-center text-gray-400 text-xs">
                      Loading schedule data…
                    </div>
                  ) : (
                    <>
                      <CapBar
                        total={totalWithInfill}
                        reactive={infillMins}
                        teamName={teamName}
                        dateLabel={dateLabel}
                      />

                      <div className="flex items-center gap-2">
                        <div className="flex-1 text-center p-3 rounded-xl bg-white border border-gray-100">
                          <p className="text-[10px] text-gray-400 mb-1">Scheduled today</p>
                          <p className="text-lg font-black text-gray-700">{fmtMins(totalScheduled)}</p>
                        </div>
                        <span className="text-lg font-bold text-gray-400 flex-shrink-0">+</span>
                        <div className="flex-1 text-center p-3 rounded-xl bg-white border border-gray-100">
                          <p className="text-[10px] text-gray-400 mb-1">Infill work</p>
                          <p className="text-lg font-black text-gray-700">+{fmtMins(infillMins)}</p>
                        </div>
                        <span className="text-lg font-bold text-gray-400 flex-shrink-0">=</span>
                        <div className="flex-1 text-center p-3 rounded-xl bg-white border border-gray-100">
                          <p className="text-[10px] text-gray-400 mb-1">New total</p>
                          <p className="text-lg font-black" style={{ color: totalWithInfill > PRODUCTIVE ? "#dc2626" : "#16a34a" }}>
                            {fmtMins(totalWithInfill)}
                          </p>
                        </div>
                      </div>

                      {totalWithInfill > PRODUCTIVE ? (
                        <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex gap-2.5">
                          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-bold text-red-700">
                              {teamName} will be {fmtMins(totalWithInfill - PRODUCTIVE)} over the daily target
                            </p>
                            <p className="text-[11px] text-red-600 mt-0.5">
                              Consider adjusting the date or redistributing scheduled work.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 rounded-xl bg-green-50 border border-green-200 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                          <p className="text-[11px] font-semibold text-green-700">
                            Within productive target — no capacity issues.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <button
                onClick={() => onSchedule(job.id, teamId, plannedDate, parseInt(estMins) || 0)}
                disabled={!teamId || !plannedDate}
                className="w-full py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: BRAND }}>
                Schedule Job
              </button>
            </div>
          )}

          {/* Status update buttons — state machine constrained */}
          {ALLOWED_TRANSITIONS[job.status].length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Update Status</p>
              <div className="flex flex-wrap gap-2">
                {ALLOWED_TRANSITIONS[job.status].map(s => (
                  <button key={s} onClick={() => onStatusChange(job.id, s)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
                    style={{ borderColor: JOB_STATUS[s].color, color: JOB_STATUS[s].color }}>
                    Mark {JOB_STATUS[s].label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Mulching tab ─────────────────────────────────────────────────────────────

function MulchingTab({ assets }: { assets: { id: string; name: string; description?: string | null }[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: mulchData, isLoading: mulchLoading } = useListMulchingRecords(undefined, {
    query: { queryKey: getListMulchingRecordsQueryKey() },
  });
  const mulchRecords: any[] = (mulchData as any)?.data ?? [];

  const createMulch = useCreateMulchingRecord();
  const updateMulch = useUpdateMulchingRecord();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ assetId: "", scheduledDate: "", volumeM3: "", mulchType: "", contractor: "", costNzd: "", notes: "" });

  const handleCreate = async () => {
    try {
      await (createMulch.mutateAsync as any)({ data: { assetId: form.assetId, scheduledDate: form.scheduledDate || null, volumeM3: form.volumeM3 || null, mulchType: form.mulchType || null, contractor: form.contractor || null, costNzd: form.costNzd || null, notes: form.notes || null } });
      qc.invalidateQueries({ queryKey: getListMulchingRecordsQueryKey() });
      toast({ title: "Mulching record added" });
      setOpen(false);
      setForm({ assetId: "", scheduledDate: "", volumeM3: "", mulchType: "", contractor: "", costNzd: "", notes: "" });
    } catch {
      toast({ title: "Failed to add record", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Mulching Programme</h2>
          <p className="text-sm text-gray-400">{mulchRecords.length} records</p>
        </div>
        <Button onClick={() => setOpen(true)} style={{ background: BRAND }}>
          <Plus className="w-4 h-4 mr-1" /> Add Record
        </Button>
      </div>

      {mulchLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
      ) : mulchRecords.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Layers className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No mulching records yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {mulchRecords.map((r: any) => {
            const st = MULCH_STATUS[r.status] ?? MULCH_STATUS.due;
            return (
              <div key={r.id} className="bg-white rounded-xl border px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{r.assetName ?? "Unknown asset"}</p>
                  <p className="text-[11px] text-gray-400">
                    {r.scheduledDate ? fmt(r.scheduledDate) : "No date"} · {r.mulchType ?? "No type"} · {r.volumeM3 ? `${r.volumeM3} m³` : "Vol TBD"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ color: st.color, background: st.bg }}>{st.label}</span>
                  {r.status !== "completed" && (
                    <button
                      onClick={() => (updateMulch.mutateAsync as any)({ id: r.id, data: { status: "completed", completedDate: new Date().toISOString().slice(0, 10) } }).then(() => qc.invalidateQueries({ queryKey: getListMulchingRecordsQueryKey() }))}
                      className="text-[11px] text-green-600 hover:text-green-800 font-medium">
                      Mark Done
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader><DialogTitle>Add Mulching Record</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-gray-500">Garden Asset</Label>
              <select value={form.assetId} onChange={e => setForm(f => ({ ...f, assetId: e.target.value }))}
                className="mt-1 w-full px-3 py-2 text-sm border rounded-xl bg-white">
                <option value="">— Select asset —</option>
                {assets.map(a => <option key={a.id} value={a.id}>{a.name}{a.description ? `, ${a.description}` : ""}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-500">Scheduled Date</Label>
                <Input type="date" value={form.scheduledDate} onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-gray-500">Volume (m³)</Label>
                <Input type="number" value={form.volumeM3} onChange={e => setForm(f => ({ ...f, volumeM3: e.target.value }))} className="mt-1" placeholder="e.g. 2.5" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Mulch Type</Label>
              <select value={form.mulchType} onChange={e => setForm(f => ({ ...f, mulchType: e.target.value }))}
                className="mt-1 w-full px-3 py-2 text-sm border rounded-xl bg-white">
                <option value="">— Select type —</option>
                {MULCH_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Contractor</Label>
              <Input value={form.contractor} onChange={e => setForm(f => ({ ...f, contractor: e.target.value }))} className="mt-1" placeholder="Optional" />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1 resize-none" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!form.assetId} style={{ background: BRAND }}>Add Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Programmes() {
  const qc = useQueryClient();
  const { toast } = useToast();

  // Infill jobs
  const { data: jobsData, isLoading: jobsLoading } = useQuery<{ data: InfillJob[]; total: number }>({
    queryKey: ["/api/infill-jobs"],
    queryFn: () => fetch("/api/infill-jobs", { credentials: "include" }).then(r => r.json()),
  });
  const jobs = jobsData?.data ?? [];

  // Assets
  const { data: assetsData } = useListAssets({ limit: 500 }, {
    query: { queryKey: getListAssetsQueryKey({ limit: 500 }) },
  });
  const assets: { id: string; name: string; description?: string | null; teamId?: string | null }[] = ((assetsData as any)?.data ?? []).map((a: any) => ({ id: a.id, name: a.name, description: a.description ?? null, teamId: a.teamId ?? null }));

  // Teams
  const { data: teamsRaw } = useListTeams({ query: { queryKey: getListTeamsQueryKey() } as any });
  const teams: { id: string; name: string }[] = (teamsRaw ?? []) as any;

  // Create job mutation
  const createJob = useMutation({
    mutationFn: (body: any) =>
      fetch("/api/infill-jobs", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/infill-jobs"] });
      toast({ title: "Assessment saved" });
      setDrawerOpen(false);
    },
    onError: () => toast({ title: "Failed to save assessment", variant: "destructive" }),
  });

  // Update job mutation
  const updateJob = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      fetch(`/api/infill-jobs/${id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/infill-jobs"] }),
    onError: () => toast({ title: "Failed to update job", variant: "destructive" }),
  });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<JobStatus | "all">("all");

  const selectedJob = jobs.find(j => j.id === selectedJobId) ?? null;

  const filteredJobs = useMemo(
    () => statusFilter === "all" ? jobs : jobs.filter(j => j.status === statusFilter),
    [jobs, statusFilter]
  );

  const statCounts = useMemo(() => {
    const c: Partial<Record<JobStatus | "all", number>> = { all: jobs.length };
    for (const j of jobs) c[j.status] = (c[j.status] ?? 0) + 1;
    return c;
  }, [jobs]);

  const handleSaveAssessment = (form: { assetId: string; assessmentDate: string; assessmentNotes: string; species: SelectedSpecies[] }) => {
    createJob.mutate({
      assetId:         form.assetId,
      assessmentDate:  form.assessmentDate,
      assessmentNotes: form.assessmentNotes,
      species: form.species.map(sp => ({
        speciesName:     sp.name,
        speciesCategory: sp.category,
        quantity:        sp.qty,
        notes:           sp.notes || undefined,
      })),
    });
  };

  const handleSchedule = (jobId: string, teamId: string, plannedDate: string, estimatedMins: number) => {
    updateJob.mutate({ id: jobId, data: { assignedTeamId: teamId, plannedDate, estimatedMins, status: "scheduled" } });
    toast({ title: "Job scheduled" });
    setSelectedJobId(null);
  };

  const handleStatusChange = (jobId: string, status: JobStatus) => {
    updateJob.mutate({ id: jobId, data: { status } });
    setSelectedJobId(null);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold" style={{ color: NAVY }}>Programmes</h1>
        <p className="text-sm text-gray-500">Infill planting assessments and mulching records</p>
      </div>

      <Tabs defaultValue="infill">
        <TabsList className="mb-6">
          <TabsTrigger value="infill" className="flex items-center gap-1.5">
            <Sprout className="w-4 h-4" /> Infill Planting
          </TabsTrigger>
          <TabsTrigger value="mulching" className="flex items-center gap-1.5">
            <Layers className="w-4 h-4" /> Mulching
          </TabsTrigger>
        </TabsList>

        {/* ── Infill Planting ── */}
        <TabsContent value="infill">
          <div className="space-y-5">
            {/* Stat chips */}
            <div className="grid grid-cols-5 gap-3">
              {(["all", "draft", "scheduled", "in_progress", "completed"] as const).map(s => {
                const cfg = s === "all" ? null : JOB_STATUS[s];
                const active = statusFilter === s;
                return (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className="rounded-xl border p-3 text-left transition-all"
                    style={{
                      borderColor: active ? (cfg?.color ?? BRAND) : "#e5e7eb",
                      background:  active ? (cfg?.bg ?? "#f0fafb") : "white",
                    }}>
                    <p className="text-xl font-bold" style={{ color: cfg?.color ?? BRAND }}>{statCounts[s] ?? 0}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{s === "all" ? "All Jobs" : cfg!.label}</p>
                  </button>
                );
              })}
            </div>

            {/* Toolbar */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                {filteredJobs.length} assessment{filteredJobs.length !== 1 ? "s" : ""}
                {statusFilter !== "all" && ` · ${JOB_STATUS[statusFilter].label}`}
              </p>
              <Button onClick={() => setDrawerOpen(true)} style={{ background: BRAND }}>
                <Plus className="w-4 h-4 mr-1" /> New Assessment
              </Button>
            </div>

            {/* Jobs list */}
            {jobsLoading ? (
              <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
            ) : filteredJobs.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Sprout className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">No assessments found</p>
                {statusFilter === "all" && (
                  <p className="text-xs mt-1">Click <strong>New Assessment</strong> to create the first one.</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredJobs.map(job => {
                  const totalPlants = job.species.reduce((s, sp) => s + sp.quantity, 0);
                  return (
                    <div key={job.id}
                      className="bg-white rounded-xl border hover:border-[#00AECD] transition-colors group">
                      {/* Main card body — click to open detail */}
                      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-4 cursor-pointer"
                        onClick={() => setSelectedJobId(job.id)}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-900 truncate">{job.assetName ?? "Unknown asset"}</span>
                            <StatusBadge status={job.status} />
                          </div>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            Assessed {fmt(job.assessmentDate)}{job.assessorName ? ` by ${job.assessorName}` : ""}
                          </p>
                          {job.assessmentNotes && (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-1 italic">{job.assessmentNotes}</p>
                          )}
                          {/* Species chips */}
                          {job.species.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {job.species.slice(0, 3).map((sp, i) => (
                                <span key={i} className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${CAT_COLORS[sp.speciesCategory as SpeciesCategory] ?? "bg-gray-100 text-gray-600"}`}>
                                  {sp.quantity}× <SciName name={sp.speciesName} />
                                </span>
                              ))}
                              {job.species.length > 3 && (
                                <span className="text-[9px] text-gray-400">+{job.species.length - 3} more</span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-4 flex-shrink-0 text-right">
                          <div>
                            <p className="text-lg font-bold" style={{ color: BRAND }}>{totalPlants}</p>
                            <p className="text-[10px] text-gray-400">plants</p>
                          </div>
                          {job.teamName && (
                            <div>
                              <div className="flex items-center gap-1 text-[11px] text-gray-600">
                                <Users className="w-3 h-3" /> {job.teamName}
                              </div>
                              {job.plannedDate && (
                                <div className="flex items-center gap-1 text-[11px] text-gray-400 mt-0.5">
                                  <Calendar className="w-3 h-3" /> {fmt(job.plannedDate)}
                                </div>
                              )}
                            </div>
                          )}
                          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#00AECD] transition-colors" />
                        </div>
                      </div>

                      {/* Quick-advance footer — one-click status advance */}
                      {(() => {
                        const nextMap: Partial<Record<JobStatus, { label: string; next: JobStatus }>> = {
                          draft:       { label: "Schedule →", next: "scheduled" },
                          scheduled:   { label: "Start →",    next: "in_progress" },
                          in_progress: { label: "Complete →", next: "completed" },
                        };
                        const advance = nextMap[job.status];
                        if (!advance) return null;
                        const isDraft = job.status === "draft";
                        return (
                          <div className="px-5 pb-3 pt-0 border-t border-gray-50 flex items-center justify-between">
                            <span className="text-[10px] text-gray-400">
                              {isDraft ? "Open detail to schedule" : `→ ${JOB_STATUS[advance.next].label}`}
                            </span>
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                if (isDraft) { setSelectedJobId(job.id); return; }
                                updateJob.mutate({ id: job.id, data: { status: advance.next } });
                              }}
                              className="text-[11px] font-semibold px-3 py-1 rounded-lg transition-colors"
                              style={{ color: JOB_STATUS[advance.next].color, background: JOB_STATUS[advance.next].bg }}>
                              {advance.label}
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Mulching ── */}
        <TabsContent value="mulching">
          <MulchingTab assets={assets} />
        </TabsContent>
      </Tabs>

      {/* Modals */}
      {drawerOpen && (
        <NewAssessmentDrawer
          assets={assets}
          onClose={() => setDrawerOpen(false)}
          onSave={handleSaveAssessment}
        />
      )}
      {selectedJob && (
        <JobDetailPanel
          job={selectedJob}
          teams={teams}
          assetTeamId={assets.find(a => a.id === selectedJob.assetId)?.teamId ?? null}
          onClose={() => setSelectedJobId(null)}
          onSchedule={handleSchedule}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}
