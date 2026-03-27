import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard, List, CalendarDays, ClipboardCheck, Sprout,
  FileSpreadsheet, BarChart2, Plus, X, Search, Users, Calendar,
  CheckCircle2, Clock, ChevronRight, Leaf, AlertCircle, Filter
} from "lucide-react";

const BRAND = "#00AECD";
const NAVY  = "#0f2a36";

// ─── Sidebar ────────────────────────────────────────────────────────────────

function Sidebar({ active }: { active: string }) {
  const nav = [
    { icon: LayoutDashboard, label: "Dashboard" },
    { icon: List,            label: "Asset Register" },
    { icon: CalendarDays,   label: "Schedule" },
    { icon: ClipboardCheck, label: "Audits",          id: "audits"    },
    { icon: Sprout,         label: "Infill Planting", id: "planting"  },
    { icon: FileSpreadsheet,label: "Specification",   id: "spec"      },
    { icon: BarChart2,      label: "Reports",         id: "reports"   },
  ];
  return (
    <aside className="w-56 flex-shrink-0 bg-[#0f2a36] flex flex-col min-h-screen">
      <div className="px-5 py-5 border-b border-white/10">
        <div className="bg-[#00AECD] rounded-lg px-3 py-2 text-center">
          <span className="text-white font-bold text-lg tracking-tight">poriruacity</span>
        </div>
        <p className="text-white/50 text-[10px] text-center mt-1 uppercase tracking-widest">Gardens Manager</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ icon: Icon, label, id }) => {
          const isActive = active === (id || label.toLowerCase());
          return (
            <div key={label} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${isActive ? "bg-[#00AECD] text-white" : "text-white/60 hover:text-white hover:bg-white/10"}`}>
              <Icon className="w-4 h-4" />
              <span className="text-sm font-medium">{label}</span>
            </div>
          );
        })}
      </nav>
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#00AECD] flex items-center justify-center text-white text-xs font-bold">JM</div>
          <div>
            <p className="text-white text-xs font-medium">Jude Morison</p>
            <p className="text-white/40 text-[10px]">Team Leader — Horticulture</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── Species Data ────────────────────────────────────────────────────────────

type SpeciesCategory = "Native Trees" | "Native Shrubs" | "Groundcovers" | "Annual Bedding" | "Roses";

interface Species {
  name: string; maori?: string; category: SpeciesCategory;
  size: "Small" | "Medium" | "Large"; note: string;
}

const SPECIES_LIST: Species[] = [
  // Native Trees
  { name: "Cordyline australis", maori: "Tī kōuka", category: "Native Trees", size: "Large", note: "Cabbage tree — excellent focal point" },
  { name: "Sophora microphylla", maori: "Kōwhai",   category: "Native Trees", size: "Medium", note: "Seasonal yellow flowers, bird-attracting" },
  { name: "Metrosideros excelsa", maori: "Pōhutukawa", category: "Native Trees", size: "Large", note: "Coastal, summer red flowers" },
  { name: "Kunzea ericoides",    maori: "Kānuka",   category: "Native Trees", size: "Medium", note: "Fast growing, good nurse tree" },
  { name: "Pittosporum tenuifolium", maori: "Kōhūhū", category: "Native Trees", size: "Medium", note: "Shade tolerant, fragrant flowers" },
  // Native Shrubs
  { name: "Phormium tenax",      maori: "Harakeke", category: "Native Shrubs", size: "Large",  note: "NZ flax — bold structural plant" },
  { name: "Hebe stricta",        maori: "Koromiko", category: "Native Shrubs", size: "Small",  note: "White flowers, good filler" },
  { name: "Hebe topiaria",       category: "Native Shrubs", size: "Small",  note: "Dense grey-green dome form" },
  { name: "Coprosma robusta",    maori: "Karamu",   category: "Native Shrubs", size: "Medium", note: "Glossy leaves, orange berries" },
  { name: "Coprosma propinqua",  category: "Native Shrubs", size: "Small",  note: "Divaricating, suits revegetation" },
  { name: "Corokia cotoneaster", category: "Native Shrubs", size: "Small",  note: "Wire-netting bush, hardy" },
  { name: "Leptospermum scoparium", maori: "Mānuka", category: "Native Shrubs", size: "Medium", note: "Pioneer shrub, fast growing" },
  // Groundcovers
  { name: "Carex secta",         maori: "Purei",    category: "Groundcovers", size: "Medium", note: "Wetland sedge, good under canopy" },
  { name: "Carex testacea",      category: "Groundcovers", size: "Small",  note: "Orange sedge, ornamental" },
  { name: "Libertia grandiflora", maori: "Mikoikoi", category: "Groundcovers", size: "Small",  note: "White flowers, sun/partial shade" },
  { name: "Pratia angulata",     category: "Groundcovers", size: "Small",  note: "Creeping groundcover, white flowers" },
  { name: "Festuca glauca",      category: "Groundcovers", size: "Small",  note: "Blue fescue, ornamental grass" },
  // Annual Bedding
  { name: "Alyssum",             category: "Annual Bedding", size: "Small",  note: "White/purple, fragrant edging" },
  { name: "Begonia",             category: "Annual Bedding", size: "Small",  note: "Shade tolerant, long flowering" },
  { name: "Impatiens",           category: "Annual Bedding", size: "Small",  note: "Busy Lizzie — shade beds" },
  { name: "Lobelia",             category: "Annual Bedding", size: "Small",  note: "Blue/white edging, cascading" },
  { name: "Marigold (Tagetes)",  category: "Annual Bedding", size: "Small",  note: "Bright, long season, pest deterrent" },
  { name: "Pansy (Viola)",       category: "Annual Bedding", size: "Small",  note: "Cool season colour" },
  { name: "Petunia",             category: "Annual Bedding", size: "Small",  note: "Summer to autumn, trailing" },
  { name: "Salvia",              category: "Annual Bedding", size: "Small",  note: "Long-flowering, heat tolerant" },
  // Roses
  { name: "'Iceberg'",           category: "Roses", size: "Medium", note: "Floribunda, white, repeat flowering" },
  { name: "'Queen Elizabeth'",   category: "Roses", size: "Large",  note: "Floribunda, pink, vigorous" },
  { name: "'Mr Lincoln'",        category: "Roses", size: "Medium", note: "Hybrid Tea, deep red, fragrant" },
  { name: "'Just Joey'",         category: "Roses", size: "Medium", note: "Hybrid Tea, apricot, fragrant" },
  { name: "'Double Delight'",    category: "Roses", size: "Medium", note: "Hybrid Tea, red/cream, highly fragrant" },
];

const CATEGORIES: SpeciesCategory[] = ["Native Trees", "Native Shrubs", "Groundcovers", "Annual Bedding", "Roses"];

const CAT_COLORS: Record<SpeciesCategory, string> = {
  "Native Trees":   "bg-emerald-100 text-emerald-800",
  "Native Shrubs":  "bg-green-100 text-green-700",
  "Groundcovers":   "bg-lime-100 text-lime-700",
  "Annual Bedding": "bg-yellow-100 text-yellow-700",
  "Roses":          "bg-pink-100 text-pink-700",
};

// ─── Assessment Records (seeded data) ───────────────────────────────────────

interface SelectedSpecies { name: string; category: SpeciesCategory; qty: number; }

interface Assessment {
  id: string; assetId: string; assetName: string; assetType: string;
  assessedBy: string; assessedDate: string; notes: string;
  species: SelectedSpecies[];
  status: "assessed" | "assigned" | "completed";
  assignedTeam?: string; plannedDate?: string; estimatedMins?: number;
}

const INITIAL_ASSESSMENTS: Assessment[] = [
  {
    id: "IP-001", assetId: "GRD-0022", assetName: "Waitangirua Mall Entry", assetType: "Rose",
    assessedBy: "Jude Morison", assessedDate: "12 Mar 2026", notes: "Several gaps near south entrance following winter dieback.",
    species: [
      { name: "'Iceberg'",         category: "Roses",          qty: 3 },
      { name: "'Queen Elizabeth'", category: "Roses",          qty: 2 },
      { name: "Alyssum",           category: "Annual Bedding", qty: 24 },
    ],
    status: "assigned", assignedTeam: "Team A", plannedDate: "4 Apr 2026", estimatedMins: 120,
  },
  {
    id: "IP-002", assetId: "GRD-0558", assetName: "Kenepuru Landing", assetType: "Revegetation",
    assessedBy: "Jude Morison", assessedDate: "18 Mar 2026", notes: "Significant gaps in canopy layer. Rabbit browsing evident.",
    species: [
      { name: "Cordyline australis", category: "Native Trees",  qty: 8  },
      { name: "Sophora microphylla", category: "Native Trees",  qty: 5  },
      { name: "Coprosma robusta",    category: "Native Shrubs", qty: 15 },
      { name: "Leptospermum scoparium", category: "Native Shrubs", qty: 20 },
      { name: "Carex secta",         category: "Groundcovers",  qty: 30 },
    ],
    status: "assessed",
  },
  {
    id: "IP-003", assetId: "GRD-0801", assetName: "Mungavin Ave Berm", assetType: "Annual Bedding",
    assessedBy: "Jude Morison", assessedDate: "20 Mar 2026", notes: "End-of-season change needed. Install summer colour.",
    species: [
      { name: "Lobelia",   category: "Annual Bedding", qty: 48 },
      { name: "Petunia",   category: "Annual Bedding", qty: 36 },
      { name: "Marigold (Tagetes)", category: "Annual Bedding", qty: 24 },
    ],
    status: "completed", assignedTeam: "Team A", plannedDate: "25 Mar 2026", estimatedMins: 90,
  },
];

const ASSETS = [
  { id: "GRD-0022", name: "Waitangirua Mall Entry",  type: "Rose"          },
  { id: "GRD-0212", name: "Cobham Court",             type: "Rose"          },
  { id: "GRD-0801", name: "Mungavin Ave Berm",        type: "Annual Bedding"},
  { id: "GRD-0847", name: "Aotea Lagoon Reserve",     type: "Shrub Bed"     },
  { id: "GRD-0391", name: "Titahi Bay Esplanade",     type: "Annual Bedding"},
  { id: "GRD-0714", name: "Elsdon Reserve",           type: "Shrub Bed"     },
  { id: "GRD-0558", name: "Kenepuru Landing",         type: "Revegetation"  },
  { id: "GRD-0629", name: "Paremata Station",         type: "Bush"          },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadge(status: Assessment["status"]) {
  const map: Record<string, { label: string; cls: string }> = {
    assessed:  { label: "Assessed",  cls: "bg-amber-100 text-amber-700"  },
    assigned:  { label: "Assigned",  cls: "bg-blue-100 text-blue-700"    },
    completed: { label: "Completed", cls: "bg-green-100 text-green-700"  },
  };
  const { label, cls } = map[status];
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

function totalPlants(a: Assessment) { return a.species.reduce((s, sp) => s + sp.qty, 0); }

// ─── Species Picker Modal ─────────────────────────────────────────────────────

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
    const matchSearch = search === "" ||
      sp.name.toLowerCase().includes(search.toLowerCase()) ||
      (sp.maori?.toLowerCase().includes(search.toLowerCase()));
    return matchCat && matchSearch;
  });

  const isSelected = (name: string) => selected.some(s => s.name === name);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Select Species</h3>
            <p className="text-[11px] text-gray-400">{selected.length} species selected · {selected.reduce((s, sp) => s + sp.qty, 0)} plants total</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        {/* Search + category tabs */}
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
                className={`text-[11px] font-semibold px-3 py-1 rounded-full transition-colors ${activeTab === cat ? "text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                style={activeTab === cat ? { background: BRAND } : {}}>
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Species grid */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-2 gap-2">
            {filtered.map(sp => {
              const sel = isSelected(sp.name);
              const selRecord = selected.find(s => s.name === sp.name);
              return (
                <div key={sp.name}
                  className={`p-3 rounded-xl border-2 transition-all cursor-pointer ${sel ? "border-[#00AECD] bg-[#00AECD08]" : "border-gray-100 hover:border-gray-200 bg-white"}`}
                  onClick={() => !sel && onToggle(sp)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-900 leading-tight">{sp.name}</p>
                      {sp.maori && <p className="text-[10px] text-gray-400 mt-0.5 italic">{sp.maori}</p>}
                      <p className="text-[10px] text-gray-500 mt-0.5">{sp.note}</p>
                    </div>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${CAT_COLORS[sp.category]}`}>{sp.size}</span>
                  </div>
                  {sel && (
                    <div className="mt-2 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      <span className="text-[10px] text-gray-500">Qty:</span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => onQtyChange(sp.name, Math.max(1, (selRecord?.qty || 1) - 1))}
                          className="w-5 h-5 rounded bg-gray-100 text-gray-600 text-xs font-bold flex items-center justify-center hover:bg-gray-200">−</button>
                        <span className="w-8 text-center text-xs font-bold" style={{ color: BRAND }}>{selRecord?.qty}</span>
                        <button onClick={() => onQtyChange(sp.name, (selRecord?.qty || 1) + 1)}
                          className="w-5 h-5 rounded bg-gray-100 text-gray-600 text-xs font-bold flex items-center justify-center hover:bg-gray-200">+</button>
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

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between">
          <p className="text-xs text-gray-400">{selected.length} species · {selected.reduce((s, sp) => s + sp.qty, 0)} plants</p>
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

// ─── New Assessment Modal ─────────────────────────────────────────────────────

function NewAssessmentModal({
  onClose, onSave,
}: { onClose: () => void; onSave: (a: Assessment) => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [assetId, setAssetId] = useState("");
  const [notes, setNotes] = useState("");
  const [species, setSpecies] = useState<SelectedSpecies[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  const asset = ASSETS.find(a => a.id === assetId);

  const toggleSpecies = (sp: Species) => {
    setSpecies(prev => prev.some(s => s.name === sp.name)
      ? prev.filter(s => s.name !== sp.name)
      : [...prev, { name: sp.name, category: sp.category, qty: 5 }]
    );
  };
  const setQty = (name: string, qty: number) => {
    setSpecies(prev => prev.map(s => s.name === name ? { ...s, qty } : s));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6">
      {showPicker && (
        <SpeciesPicker selected={species} onToggle={toggleSpecies} onQtyChange={setQty}
          onClose={() => setShowPicker(false)} onSave={() => setShowPicker(false)} />
      )}
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-900">New Planting Assessment</h3>
            <p className="text-[11px] text-gray-400">Step {step} of 3</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {step === 1 && (
            <>
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1.5">Garden Asset *</label>
                <select value={assetId} onChange={e => setAssetId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] bg-white">
                  <option value="">— Select an asset —</option>
                  {ASSETS.map(a => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1.5">Assessment Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                  placeholder="Describe coverage gaps, conditions, observations…"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] resize-none" />
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
                  <p className="text-[10px] text-gray-400">{asset?.type} · {asset?.id}</p>
                </div>
              </div>

              {species.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
                  <Sprout className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">No species selected yet</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {species.map(sp => (
                    <div key={sp.name} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50">
                      <div>
                        <p className="text-xs font-semibold text-gray-800">{sp.name}</p>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${CAT_COLORS[sp.category]}`}>{sp.category}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setQty(sp.name, Math.max(1, sp.qty - 1))} className="w-5 h-5 rounded bg-gray-200 text-xs font-bold flex items-center justify-center">−</button>
                        <span className="text-sm font-bold w-6 text-center" style={{ color: BRAND }}>{sp.qty}</span>
                        <button onClick={() => setQty(sp.name, sp.qty + 1)} className="w-5 h-5 rounded bg-gray-200 text-xs font-bold flex items-center justify-center">+</button>
                        <button onClick={() => setSpecies(p => p.filter(s => s.name !== sp.name))} className="text-red-300 hover:text-red-500 ml-1"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button onClick={() => setShowPicker(true)}
                className="w-full py-2.5 rounded-xl border-2 border-dashed border-[#00AECD] text-sm font-semibold flex items-center justify-center gap-2"
                style={{ color: BRAND }}>
                <Plus className="w-4 h-4" /> Add / Edit Species
              </button>

              {species.length > 0 && (
                <div className="text-xs text-gray-500 text-right">
                  Total: <span className="font-bold text-gray-800">{species.reduce((s, sp) => s + sp.qty, 0)} plants</span> across {species.length} species
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-green-50 border border-green-200">
                <p className="text-sm font-bold text-green-800 mb-2">{asset?.name}</p>
                <div className="space-y-1">
                  {species.map(sp => (
                    <div key={sp.name} className="flex justify-between text-xs text-green-700">
                      <span>{sp.name}</span><span className="font-semibold">{sp.qty} plants</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 pt-2 border-t border-green-300 flex justify-between text-xs font-bold text-green-800">
                  <span>Total</span><span>{species.reduce((s, sp) => s + sp.qty, 0)} plants</span>
                </div>
              </div>
              {notes && <p className="text-xs text-gray-500 italic">"{notes}"</p>}
              <p className="text-xs text-gray-400">Assessed by: <span className="font-semibold text-gray-600">Jude Morison · {new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })}</span></p>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="px-6 py-4 border-t flex items-center justify-between">
          <button onClick={() => step > 1 ? setStep(s => (s - 1) as 1 | 2 | 3) : onClose()}
            className="text-sm text-gray-400 hover:text-gray-600">
            {step === 1 ? "Cancel" : "← Back"}
          </button>
          {step < 3 ? (
            <button onClick={() => setStep(s => (s + 1) as 1 | 2 | 3)}
              disabled={step === 1 ? !assetId : species.length === 0}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: BRAND }}>
              Next →
            </button>
          ) : (
            <button onClick={() => {
              onSave({
                id: `IP-${String(Date.now()).slice(-3)}`,
                assetId: asset!.id, assetName: asset!.name, assetType: asset!.type,
                assessedBy: "Jude Morison", assessedDate: new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" }),
                notes, species, status: "assessed",
              });
              onClose();
            }}
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

// ─── Assign to Team Modal ─────────────────────────────────────────────────────

function AssignModal({ assessment, onClose, onSave }: {
  assessment: Assessment; onClose: () => void;
  onSave: (team: string, date: string, mins: number) => void;
}) {
  const defaultMins = Math.max(30, Math.round(totalPlants(assessment) * 3));
  const [team, setTeam] = useState("Team A");
  const [date, setDate] = useState("8 Apr 2026");
  const [mins, setMins] = useState(defaultMins);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">Assign Planting Job</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {/* Summary */}
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
            <p className="text-xs font-bold text-emerald-800">{assessment.assetName}</p>
            <p className="text-[11px] text-emerald-700 mt-0.5">
              {assessment.species.length} species · {totalPlants(assessment)} plants total
            </p>
            <div className="mt-2 space-y-0.5">
              {assessment.species.map(sp => (
                <div key={sp.name} className="flex justify-between text-[10px] text-emerald-700">
                  <span>{sp.name}</span><span className="font-semibold">{sp.qty}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 font-medium block mb-1.5">Assign to Team *</label>
            <select value={team} onChange={e => setTeam(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] bg-white">
              <option>Team A</option><option>Team B</option><option>Team C</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium block mb-1.5">Planned Date *</label>
            <input value={date} onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD]" />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium block mb-1.5">
              Estimated time (min)
              <span className="text-gray-400 font-normal"> — auto: ~3 min/plant</span>
            </label>
            <input type="number" value={mins} onChange={e => setMins(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD]" />
          </div>
        </div>
        <div className="px-6 py-4 border-t flex items-center justify-between">
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
          <button onClick={() => { onSave(team, date, mins); onClose(); }}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: BRAND }}>
            <CheckCircle2 className="w-4 h-4" /> Assign Job
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function InfillPlanting() {
  const [assessments, setAssessments] = useState<Assessment[]>(INITIAL_ASSESSMENTS);
  const [showNew, setShowNew] = useState(false);
  const [assignTarget, setAssignTarget] = useState<Assessment | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | Assessment["status"]>("all");

  const stats = useMemo(() => ({
    total:     assessments.length,
    assessed:  assessments.filter(a => a.status === "assessed").length,
    assigned:  assessments.filter(a => a.status === "assigned").length,
    completed: assessments.filter(a => a.status === "completed").length,
    plants:    assessments.filter(a => a.status !== "completed").reduce((s, a) => s + totalPlants(a), 0),
  }), [assessments]);

  const filtered = filterStatus === "all" ? assessments : assessments.filter(a => a.status === filterStatus);

  const addAssessment = (a: Assessment) => setAssessments(prev => [a, ...prev]);

  const assignJob = (id: string, team: string, date: string, mins: number) => {
    setAssessments(prev => prev.map(a => a.id === id ? { ...a, status: "assigned", assignedTeam: team, plannedDate: date, estimatedMins: mins } : a));
  };

  return (
    <div className="flex min-h-screen bg-[#f5f7f9] font-sans">
      {showNew && <NewAssessmentModal onClose={() => setShowNew(false)} onSave={addAssessment} />}
      {assignTarget && (
        <AssignModal assessment={assignTarget} onClose={() => setAssignTarget(null)}
          onSave={(team, date, mins) => { assignJob(assignTarget.id, team, date, mins); setAssignTarget(null); }} />
      )}

      <Sidebar active="planting" />

      <main className="flex-1 overflow-auto">
        <header className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Infill Planting</h1>
            <p className="text-xs text-gray-400">Species requirements assessed by Jude Morison · assign to teams when ready</p>
          </div>
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: BRAND }}>
            <Plus className="w-4 h-4" /> New Assessment
          </button>
        </header>

        <div className="px-8 py-5 space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Total Assessments",  value: stats.total,     color: "#374151" },
              { label: "Pending Assignment", value: stats.assessed,  color: "#d97706" },
              { label: "Jobs Assigned",      value: stats.assigned,  color: "#2563eb" },
              { label: "Plants Pending",     value: stats.plants,    color: BRAND     },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-2xl shadow-sm border-0 p-4">
                <p className="text-[11px] text-gray-400 mb-1">{label}</p>
                <p className="text-2xl font-black" style={{ color }}>{value}</p>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2">
            {(["all", "assessed", "assigned", "completed"] as const).map(f => (
              <button key={f} onClick={() => setFilterStatus(f)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors capitalize ${filterStatus === f ? "text-white" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"}`}
                style={filterStatus === f ? { background: BRAND } : {}}>
                {f === "all" ? "All" : f}
                {" "}({f === "all" ? assessments.length : assessments.filter(a => a.status === f).length})
              </button>
            ))}
          </div>

          {/* Assessment list */}
          <div className="bg-white rounded-2xl border-0 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b bg-gray-50">
              <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">Assessment Records</p>
            </div>
            <div className="divide-y divide-gray-50">
              {filtered.length === 0 && (
                <div className="py-12 text-center text-gray-400 text-sm">No assessments match this filter.</div>
              )}
              {filtered.map(a => (
                <div key={a.id} className="px-5 py-4 hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Sprout className="w-5 h-5 text-emerald-600" />
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900">{a.assetName}</p>
                        {statusBadge(a.status)}
                        <span className="text-[10px] text-gray-400 font-mono">{a.assetId}</span>
                      </div>

                      {/* Species chips */}
                      <div className="flex flex-wrap gap-1 mb-2">
                        {a.species.map(sp => (
                          <span key={sp.name} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${CAT_COLORS[sp.category]}`}>
                            {sp.qty}× {sp.name}
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-gray-400">
                        <span className="flex items-center gap-1">
                          <Leaf className="w-3 h-3" />{totalPlants(a)} plants · {a.species.length} species
                        </span>
                        <span>·</span>
                        <span>Assessed by {a.assessedBy} · {a.assessedDate}</span>
                        {a.assignedTeam && <>
                          <span>·</span>
                          <span className="flex items-center gap-1"><Users className="w-3 h-3" />{a.assignedTeam}</span>
                          <span>·</span>
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{a.plannedDate}</span>
                          <span>·</span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{a.estimatedMins}m</span>
                        </>}
                      </div>
                      {a.notes && <p className="text-[11px] text-gray-400 italic mt-1">"{a.notes}"</p>}
                    </div>

                    {/* Actions */}
                    <div className="flex-shrink-0 flex flex-col gap-1.5">
                      {a.status === "assessed" && (
                        <button onClick={() => setAssignTarget(a)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                          style={{ background: BRAND }}>
                          <Users className="w-3.5 h-3.5" /> Assign to Team
                        </button>
                      )}
                      {a.status === "assigned" && (
                        <>
                          <button onClick={() => setAssessments(prev => prev.map(x => x.id === a.id ? { ...x, status: "completed" } : x))}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500 text-white">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Mark Complete
                          </button>
                          <button onClick={() => setAssignTarget(a)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-500 bg-white hover:bg-gray-50">
                            Edit Assignment
                          </button>
                        </>
                      )}
                      {a.status === "completed" && (
                        <span className="flex items-center gap-1 text-xs text-green-600 font-semibold px-2">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Done
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Info note */}
          <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-100">
            <AlertCircle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700">
              <span className="font-semibold">Assessments are added by Jude Morison in the field</span> using the mobile app or this page. Once species and quantities are recorded, the manager assigns the planting work to a team — creating a job that appears in their job list with full plant requirements.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
