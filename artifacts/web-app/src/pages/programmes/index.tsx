import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useListAssets, getListAssetsQueryKey,
  useListMulchingRecords, getListMulchingRecordsQueryKey,
  useCreateMulchingRecord, useUpdateMulchingRecord,
  useListTeams, getListTeamsQueryKey,
  useGetScheduleWeek, getGetScheduleWeekQueryKey,
  useUpdateJob,
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
  Download, ChevronDown, ChevronUp, Package, List, Map as MapIcon, ExternalLink,
  Ruler, History, ClipboardList, Zap, SkipForward, Trash2, Clock,
} from "lucide-react";
import { useLocation, useSearch } from "wouter";
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, ZoomControl, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const BRAND = "#00AECD";
const NAVY  = "#0f2a36";

// ─── Plant grades (NZ nursery standard) ───────────────────────────────────────

type PlantGrade = "Root Trainer" | "1 litre" | "1.5 litre/PB2" | "2 litre/PB3" | "5 litre/PB 6.5" | "PB 8" | "PB12" | "PB40" | "PB95";

const PLANT_GRADES: PlantGrade[] = [
  "Root Trainer", "1 litre", "1.5 litre/PB2", "2 litre/PB3",
  "5 litre/PB 6.5", "PB 8", "PB12", "PB40", "PB95",
];

const GRADE_COLORS: Record<PlantGrade, string> = {
  "Root Trainer":    "bg-sky-100 text-sky-700",
  "1 litre":         "bg-teal-100 text-teal-700",
  "1.5 litre/PB2":   "bg-cyan-100 text-cyan-700",
  "2 litre/PB3":     "bg-emerald-100 text-emerald-700",
  "5 litre/PB 6.5":  "bg-green-100 text-green-700",
  "PB 8":            "bg-lime-100 text-lime-700",
  "PB12":            "bg-amber-100 text-amber-700",
  "PB40":            "bg-orange-100 text-orange-700",
  "PB95":            "bg-rose-100 text-rose-700",
};

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
  draft:        { label: "Draft — awaiting review", color: "#7c3aed", bg: "#f5f3ff" },
  due:          { label: "Due",          color: "#dc2626", bg: "#fef2f2" },
  scheduled:    { label: "Scheduled",    color: "#2563eb", bg: "#eff6ff" },
  completed:    { label: "Completed",    color: "#16a34a", bg: "#dcfce7" },
  not_required: { label: "Not Required", color: "#6b7280", bg: "#f3f4f6" },
};

// ─── Mulch decay rate constants (client-side mirror of server logic) ──────────

const MULCH_DECAY_RATE_MM_PER_MONTH: Record<string, number> = {
  "Bark Mulch": 4,
  "Wood Chip":  3,
  "Compost":    7,
  "Straw":      10,
  "Pea Gravel": 0.5,
};
const STANDARD_DEPTH_MM   = 50;
const ACTION_THRESHOLD_MM = 25;

function decayRate(mulchType: string): number {
  return MULCH_DECAY_RATE_MM_PER_MONTH[mulchType] ?? 5;
}

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function isWeekendStr(dateStr: string): boolean {
  const day = new Date(dateStr + "T00:00:00Z").getUTCDay();
  return day === 0 || day === 6;
}
function toWeekdayStr(dateStr: string): string {
  let d = dateStr;
  while (isWeekendStr(d)) d = addDaysStr(d, 1);
  return d;
}
function projectJobDate(depthMm: number, mulchType: string, readingDate: string): string {
  const rate = decayRate(mulchType);
  const depthToLose = Math.max(0, depthMm - ACTION_THRESHOLD_MM);
  // At/below threshold — job needed immediately, no negative flex
  if (depthToLose === 0) return toWeekdayStr(readingDate);
  const monthsUntil = depthToLose / rate;
  const daysUntil = Math.round(monthsUntil * 30.44);
  const naturalDate = addDaysStr(readingDate, daysUntil);
  const flexStart = addDaysStr(naturalDate, -3);
  // Clamp: flex start must not precede reading date
  return toWeekdayStr(flexStart >= readingDate ? flexStart : readingDate);
}

// ─── Record Depth Drawer ──────────────────────────────────────────────────────

function RecordDepthDrawer({
  assetId, assetName, onClose, onSaved,
}: {
  assetId: string;
  assetName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [depthMm, setDepthMm] = useState("");
  const [mulchType, setMulchType] = useState(MULCH_TYPES[0]);
  const [recordedAt, setRecordedAt] = useState(today);
  const [notes, setNotes] = useState("");
  const [isFresh, setIsFresh] = useState(false);
  const [saving, setSaving] = useState(false);

  const effectiveDepth = isFresh ? STANDARD_DEPTH_MM : (depthMm === "" ? 0 : Number(depthMm));
  // Always show projected date when depth is entered (including at/below threshold = immediate job)
  const projectedDate = (depthMm !== "" || isFresh) && mulchType && recordedAt
    ? projectJobDate(effectiveDepth, mulchType, recordedAt)
    : null;
  const isImmediate = effectiveDepth <= ACTION_THRESHOLD_MM && effectiveDepth >= 0 && (depthMm !== "" || isFresh);

  const handleFresh = () => {
    setIsFresh(true);
    setDepthMm(String(STANDARD_DEPTH_MM));
  };

  const handleDepthChange = (v: string) => {
    setIsFresh(false);
    setDepthMm(v);
  };

  const handleSave = async () => {
    if (depthMm === "" && !isFresh) { toast({ title: "Enter a depth in mm", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/mulch-depth-readings", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId, depthMm: isFresh ? STANDARD_DEPTH_MM : effectiveDepth,
          mulchType, recordedAt, notes: notes || null, isFreshApplication: isFresh,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      toast({ title: "Depth recorded", description: projectedDate ? `Draft job projected for ${fmt(projectedDate)}` : "Reading saved" });
      onSaved();
      onClose();
    } catch (e: unknown) {
      toast({ title: "Failed to save", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-[400px] bg-white shadow-2xl flex flex-col overflow-y-auto">
        <div className="px-6 py-4 border-b flex items-start justify-between" style={{ background: NAVY }}>
          <div>
            <p className="text-white text-sm font-bold flex items-center gap-2">
              <Ruler className="w-4 h-4" /> Record Mulch Depth
            </p>
            <p className="text-white/50 text-[11px] mt-0.5">{assetName}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-white/40 hover:text-white" /></button>
        </div>

        <div className="flex-1 p-6 space-y-5">
          {/* Freshly mulched shortcut */}
          <button
            onClick={handleFresh}
            className="w-full py-3 rounded-xl border-2 font-semibold text-sm flex items-center justify-center gap-2 transition-all"
            style={isFresh
              ? { borderColor: BRAND, background: "#e0f7fb", color: BRAND }
              : { borderColor: "#e5e7eb", background: "white", color: "#374151" }}
          >
            <CheckCircle2 className="w-4 h-4" />
            Freshly Mulched — set to {STANDARD_DEPTH_MM}mm
          </button>

          <div className="relative flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-[11px] text-gray-400">or enter measured depth</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Depth input */}
          <div>
            <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Current Depth (mm)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number" min="0" max="200"
                value={depthMm}
                onChange={e => handleDepthChange(e.target.value)}
                placeholder="e.g. 32"
                className="rounded-xl flex-1"
              />
              <span className="text-sm text-gray-400 font-medium">mm</span>
            </div>
          </div>

          {/* Mulch type */}
          <div>
            <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Mulch Type</Label>
            <select
              value={mulchType}
              onChange={e => setMulchType(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] bg-white"
            >
              {MULCH_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
            <p className="text-[10px] text-gray-400 mt-1">
              Decay rate: ~{decayRate(mulchType)} mm/month · threshold {ACTION_THRESHOLD_MM}mm
            </p>
          </div>

          {/* Reading date */}
          <div>
            <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Reading Date</Label>
            <Input type="date" value={recordedAt} onChange={e => setRecordedAt(e.target.value)} className="rounded-xl" />
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Notes (optional)</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="rounded-xl resize-none" />
          </div>

          {/* Live projected date preview — always shown when depth is entered */}
          {projectedDate && (
            <div className={`p-4 rounded-xl border ${isImmediate ? "bg-red-50 border-red-200" : "bg-violet-50 border-violet-200"}`}>
              <div className="flex items-center gap-2 mb-1">
                <Calendar className={`w-4 h-4 ${isImmediate ? "text-red-500" : "text-violet-600"}`} />
                <span className={`text-xs font-bold ${isImmediate ? "text-red-800" : "text-violet-800"}`}>
                  {isImmediate ? "⚠ Immediate action needed — projected job date" : "Projected next job"}
                </span>
              </div>
              <p className={`text-lg font-black ${isImmediate ? "text-red-700" : "text-violet-700"}`}>{fmt(projectedDate)}</p>
              <p className={`text-[10px] mt-0.5 ${isImmediate ? "text-red-500" : "text-violet-500"}`}>
                {isImmediate
                  ? `Depth ${effectiveDepth}mm is at or below the ${ACTION_THRESHOLD_MM}mm threshold — job required immediately.`
                  : `Based on ${effectiveDepth}mm depth · ${mulchType} · ${decayRate(mulchType)} mm/month decay`}
              </p>
              <p className={`text-[10px] mt-1 font-medium ${isImmediate ? "text-red-600" : "text-violet-600"}`}>
                A draft mulching job will be created for this date.
              </p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t flex items-center gap-3">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || (depthMm === "" && !isFresh)}
            className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: BRAND }}
          >
            {saving ? "Saving…" : "Save Reading"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Mulching Review & Schedule Drawer ───────────────────────────────────────
// Implements the same conflict/capacity resolution flow as the ReactiveJobWizard:
//   Step 1 – Configure (team, date, estimated minutes)
//   Step 2 – Capacity check + clash resolution (push +1d / defer +3d / delete / reassign)
//   Step 3 – Confirm & Publish (applies all actions atomically)
// Publish is gated: only enabled when resolvedTotal + mulchMins ≤ PRODUCTIVE,
//   OR when the user explicitly accepts overtime after reviewing the full impact.

type ConflictAction = "none" | "push" | "defer" | "delete" | "reassign";

function MulchingReviewDrawer({
  record, teams, onClose, onPublished,
}: {
  record: any;
  teams: { id: string; name: string }[];
  onClose: () => void;
  onPublished: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const updateJob = useUpdateJob();

  // Step 1 fields
  const [teamId, setTeamId] = useState(record.assignedTeamId ?? (teams[0]?.id ?? ""));
  const [scheduledDate, setScheduledDate] = useState(record.scheduledDate ?? "");
  const [estMins, setEstMins] = useState(record.estimatedMins ? String(record.estimatedMins) : "120");

  // Step 2 conflict state
  const [actions, setActions] = useState<Record<string, ConflictAction>>({});
  const [reassignTo, setReassignTo] = useState<Record<string, string>>({});
  const [overtimeAccepted, setOvertimeAccepted] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset conflict state whenever scheduling inputs change — user must re-resolve
  useEffect(() => {
    setActions({});
    setReassignTo({});
    setOvertimeAccepted(false);
  }, [teamId, scheduledDate, estMins]);

  const selectedTeam = teams.find(t => t.id === teamId);
  const teamName = selectedTeam?.name ?? "Team";

  const weekStr = scheduledDate ? (() => {
    const d = new Date(scheduledDate + "T00:00:00");
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })() : "";
  const dateLabel = scheduledDate ? format(new Date(scheduledDate + "T00:00:00"), "EEE d MMM") : "";

  const { data: weekData, isLoading: weekLoading } = useGetScheduleWeek(
    { week: weekStr, teamId: teamId || undefined },
    {
      query: {
        queryKey: getGetScheduleWeekQueryKey({ week: weekStr, teamId: teamId || undefined }),
        enabled: !!weekStr && !!teamId,
      },
    },
  );

  const dayJobs: any[] = useMemo(
    () => (weekData as any)?.days?.find((d: any) => d.date === scheduledDate)?.jobs ?? [],
    [weekData, scheduledDate],
  );

  const mulchMins = parseInt(estMins) || 0;
  const totalScheduled = dayJobs.reduce((s: number, j: any) => s + (j.serviceTimeMins ?? 0), 0);
  const totalWithMulch = totalScheduled + mulchMins;

  // Minutes freed by resolved actions (push/defer/delete remove them from this day; reassign too)
  const resolvedSaved = dayJobs
    .filter(j => {
      const a = actions[j.id] ?? "none";
      return a !== "none" && (a !== "reassign" || reassignTo[j.id]);
    })
    .reduce((s: number, j: any) => s + (j.serviceTimeMins ?? 0), 0);
  const resolvedTotal = totalWithMulch - resolvedSaved;

  const showImpact = !!teamId && !!scheduledDate;
  const isOverCapacity = resolvedTotal > PRODUCTIVE;

  const setAction = (id: string, a: ConflictAction) => {
    setActions(prev => ({ ...prev, [id]: a }));
    if (a !== "reassign") setReassignTo(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  // Publish enabled when: team + date set, AND (resolved total ≤ PRODUCTIVE OR overtime explicitly accepted)
  const canPublish = !!teamId && !!scheduledDate && (!isOverCapacity || overtimeAccepted) && !weekLoading;

  const handlePublish = async () => {
    if (!teamId || !scheduledDate) { toast({ title: "Select a team and date", variant: "destructive" }); return; }
    if (isOverCapacity && !overtimeAccepted) {
      toast({ title: "Capacity conflict", description: "Resolve conflicts or accept overtime before publishing.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      // 1. Publish the mulching record
      const r = await fetch(`/api/mulching-records/${record.id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "scheduled",
          scheduledDate,
          assignedTeamId: teamId,
          estimatedMins: mulchMins || null,
          notes: record.notes,
        }),
      });
      if (!r.ok) throw new Error(await r.text());

      // 2. Apply all conflict resolution actions atomically
      await Promise.all(
        dayJobs
          .filter(j => (actions[j.id] ?? "none") !== "none")
          .map(j => {
            const a = actions[j.id];
            if (a === "push")   return (updateJob as any).mutateAsync({ id: j.id, data: { scheduledDate: addDaysStr(j.scheduledDate, 1) } });
            if (a === "defer")  return (updateJob as any).mutateAsync({ id: j.id, data: { scheduledDate: addDaysStr(j.scheduledDate, 3) } });
            if (a === "delete") return (updateJob as any).mutateAsync({ id: j.id, data: { status: "skipped" } });
            if (a === "reassign" && reassignTo[j.id]) return (updateJob as any).mutateAsync({ id: j.id, data: { teamId: reassignTo[j.id] } });
            return Promise.resolve();
          }),
      );

      await Promise.all([
        qc.invalidateQueries({ queryKey: getListMulchingRecordsQueryKey() }),
        qc.invalidateQueries({ queryKey: ["/api/schedule/week"] }),
      ]);

      toast({ title: "Mulching job scheduled", description: `${record.assetName} → ${teamName}, ${dateLabel}` });
      onPublished();
      onClose();
    } catch (e: unknown) {
      toast({ title: "Failed to schedule", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const actionColors: Record<ConflictAction, string> = {
    none: "#6b7280", push: "#2563eb", defer: "#7c3aed", delete: "#dc2626", reassign: "#9333ea",
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-[480px] bg-white shadow-2xl flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-start justify-between" style={{ background: NAVY }}>
          <div>
            <p className="text-white text-sm font-bold flex items-center gap-2">
              <ClipboardList className="w-4 h-4" /> Review & Schedule Mulching
            </p>
            <p className="text-white/50 text-[11px] mt-0.5">{record.assetName}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-white/40 hover:text-white" /></button>
        </div>

        <div className="flex-1 p-6 space-y-5 overflow-y-auto">
          {/* Draft context */}
          <div className="p-3 rounded-xl bg-violet-50 border border-violet-200 space-y-1">
            <p className="text-xs font-bold text-violet-800">Draft job from depth reading</p>
            {record.scheduledDate && (
              <p className="text-[11px] text-violet-700">Projected date: <strong>{fmt(record.scheduledDate)}</strong></p>
            )}
            {record.projectedDepthAtDue != null && (
              <p className="text-[10px] text-violet-500">
                Depth at job date: ~{record.projectedDepthAtDue}mm (threshold {ACTION_THRESHOLD_MM}mm)
              </p>
            )}
            {record.mulchType && <p className="text-[10px] text-violet-500">Type: {record.mulchType}</p>}
          </div>

          {/* Step 1 – Configure */}
          <div className="space-y-3">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">1 — Configure</p>
            <div>
              <Label className="text-[11px] text-gray-500 mb-1.5 block">Assign Team</Label>
              <select value={teamId} onChange={e => setTeamId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] bg-white">
                <option value="">— Select team —</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-gray-500 mb-1.5 block">Scheduled Date</Label>
                <Input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} className="rounded-xl text-sm" />
              </div>
              <div>
                <Label className="text-[11px] text-gray-500 mb-1.5 block">Est. time (mins)</Label>
                <Input type="number" value={estMins} onChange={e => setEstMins(e.target.value)}
                  placeholder="e.g. 120" min="0" className="rounded-xl text-sm" />
              </div>
            </div>
          </div>

          {/* Step 2 – Capacity & Conflict Resolution */}
          {showImpact && (
            <div className="space-y-3">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">2 — Capacity &amp; Conflicts</p>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-4">
                {weekLoading ? (
                  <div className="h-10 flex items-center justify-center text-gray-400 text-xs">Loading…</div>
                ) : (
                  <>
                    <CapBar total={resolvedTotal} reactive={mulchMins} teamName={teamName} dateLabel={dateLabel} />
                    <div className="flex items-center gap-2">
                      <div className="flex-1 text-center p-2.5 rounded-xl bg-white border text-center">
                        <p className="text-[9px] text-gray-400 mb-0.5">Existing</p>
                        <p className="text-base font-black text-gray-700">{fmtMins(totalScheduled - resolvedSaved)}</p>
                      </div>
                      <span className="text-gray-400 font-bold">+</span>
                      <div className="flex-1 text-center p-2.5 rounded-xl bg-white border">
                        <p className="text-[9px] text-gray-400 mb-0.5">Mulch</p>
                        <p className="text-base font-black text-gray-700">+{fmtMins(mulchMins)}</p>
                      </div>
                      <span className="text-gray-400 font-bold">=</span>
                      <div className="flex-1 text-center p-2.5 rounded-xl bg-white border">
                        <p className="text-[9px] text-gray-400 mb-0.5">Total</p>
                        <p className="text-base font-black" style={{ color: isOverCapacity ? "#dc2626" : "#16a34a" }}>
                          {fmtMins(resolvedTotal)}
                        </p>
                      </div>
                    </div>

                    {/* Existing jobs with push/defer/delete/reassign actions */}
                    {dayJobs.length > 0 && (
                      <div className="rounded-xl border border-gray-100 overflow-hidden">
                        <div className="px-4 py-2 bg-gray-100 text-[10px] font-bold text-gray-600 uppercase tracking-wider flex items-center justify-between">
                          <span>{teamName} — {dateLabel} ({dayJobs.length} jobs)</span>
                          <span>{fmtMins(totalScheduled)}</span>
                        </div>
                        <div className="divide-y divide-gray-50 bg-white">
                          {dayJobs.map((job: any) => {
                            const action = actions[job.id] ?? "none";
                            const resolved = action !== "none";
                            const jobMins = job.serviceTimeMins ?? 0;
                            return (
                              <div key={job.id} className={`px-4 py-3 transition-colors ${resolved ? "bg-green-50/60" : ""}`}>
                                <div className="flex items-start gap-3">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-gray-800">{job.assetName ?? "Job"}</p>
                                    <p className="text-[10px] text-gray-400 flex items-center gap-1">
                                      <Clock className="w-2.5 h-2.5" />{fmtMins(jobMins)}
                                      {job.suburb && <span>· {job.suburb}</span>}
                                    </p>
                                    {action === "push"   && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 mt-1 inline-block">→ {addDaysStr(job.scheduledDate, 1)}</span>}
                                    {action === "defer"  && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 mt-1 inline-block">→ {addDaysStr(job.scheduledDate, 3)}</span>}
                                    {action === "delete" && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 mt-1 inline-block">✕ Removed from schedule</span>}
                                    {action === "reassign" && reassignTo[job.id] && (
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 mt-1 inline-block">
                                        → {teams.find(t => t.id === reassignTo[job.id])?.name ?? "team"}
                                      </span>
                                    )}
                                  </div>
                                  {resolved && <p className="text-[10px] text-green-600 font-bold flex-shrink-0">-{fmtMins(jobMins)}</p>}
                                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                                    <div className="flex items-center gap-1">
                                      {(["push", "defer", "delete"] as ConflictAction[]).map(a => {
                                        const active = action === a;
                                        const iconMap = { push: <SkipForward className="w-2.5 h-2.5" />, defer: <Calendar className="w-2.5 h-2.5" />, delete: <Trash2 className="w-2.5 h-2.5" /> };
                                        const lblMap = { push: "+1d", defer: "+3d", delete: "Del" };
                                        return (
                                          <button key={a} onClick={() => setAction(job.id, active ? "none" : a)}
                                            className="flex items-center gap-0.5 px-2 py-1 rounded-lg text-[9px] font-bold border transition-all"
                                            style={active
                                              ? { background: actionColors[a], color: "white", borderColor: actionColors[a] }
                                              : { background: "white", color: actionColors[a], borderColor: "#e5e7eb" }}>
                                            {iconMap[a as keyof typeof iconMap]}{lblMap[a as keyof typeof lblMap]}
                                          </button>
                                        );
                                      })}
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => setAction(job.id, action === "reassign" ? "none" : "reassign")}
                                        className="flex items-center gap-0.5 px-2 py-1 rounded-lg text-[9px] font-bold border transition-all"
                                        style={action === "reassign"
                                          ? { background: actionColors.reassign, color: "white", borderColor: actionColors.reassign }
                                          : { background: "white", color: actionColors.reassign, borderColor: "#e5e7eb" }}>
                                        <Users className="w-2.5 h-2.5" />Re
                                      </button>
                                      {action === "reassign" && (
                                        <select value={reassignTo[job.id] ?? ""} onChange={e => setReassignTo(p => ({ ...p, [job.id]: e.target.value }))}
                                          className="text-[9px] px-1.5 py-1 border rounded-lg bg-white outline-none max-w-[80px]">
                                          <option value="">Team…</option>
                                          {teams.filter(t => t.id !== teamId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                        </select>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Over-capacity / resolved / overtime */}
                    {isOverCapacity ? (
                      <div className="space-y-2">
                        <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-bold text-red-700">
                              {fmtMins(resolvedTotal - PRODUCTIVE)} over daily target after conflict resolution
                            </p>
                            <p className="text-[10px] text-red-600 mt-0.5">
                              Continue resolving jobs above, adjust the date, or accept overtime.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setOvertimeAccepted(v => !v)}
                          className="w-full py-2.5 rounded-xl border-2 font-bold text-sm flex items-center justify-center gap-2 transition-all"
                          style={overtimeAccepted
                            ? { borderColor: "#dc2626", background: "#fef2f2", color: "#dc2626" }
                            : { borderColor: "#fca5a5", background: "white", color: "#ef4444" }}>
                          {overtimeAccepted
                            ? <><CheckCircle2 className="w-4 h-4" /> Overtime authorised — publish unlocked</>
                            : <><AlertTriangle className="w-4 h-4" /> Accept overtime to unlock publish</>}
                        </button>
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl bg-green-50 border border-green-200 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                        <p className="text-[11px] font-semibold text-green-700">
                          {resolvedSaved > 0
                            ? `Conflicts resolved — freed ${fmtMins(resolvedSaved)}. Ready to publish.`
                            : "Within productive target — ready to publish."}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t flex items-center gap-3">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handlePublish}
            disabled={saving || !canPublish}
            className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ background: BRAND }}
          >
            <Zap className="w-4 h-4" />
            {saving ? "Scheduling…" : "Publish to Schedule"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Reading History Panel ────────────────────────────────────────────────────

function ReadingHistoryPanel({ assetId }: { assetId: string }) {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = useQuery<{ data: any[]; total: number }>({
    queryKey: ["/api/mulch-depth-readings", assetId],
    queryFn: () => fetch(`/api/mulch-depth-readings?assetId=${assetId}`, { credentials: "include" }).then(r => r.json()),
    enabled: expanded,
  });
  const readings = data?.data ?? [];

  return (
    <div className="border rounded-xl overflow-hidden mt-2">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between text-left hover:bg-gray-100 transition-colors"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-gray-700">
          <History className="w-3.5 h-3.5 text-gray-400" />
          Reading History
        </span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
      </button>
      {expanded && (
        <div className="px-4 py-3">
          {isLoading ? (
            <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-8 w-full rounded" />)}</div>
          ) : readings.length === 0 ? (
            <p className="text-[11px] text-gray-400 italic py-2">No depth readings recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {readings.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="text-xs font-semibold text-gray-800">
                      {r.depthMm}mm
                      {r.isFreshApplication && (
                        <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700">Fresh</span>
                      )}
                    </p>
                    <p className="text-[10px] text-gray-400">{r.mulchType ?? "Type not set"} · {r.recordedByName ?? "Unknown"}</p>
                    {r.notes && <p className="text-[10px] text-gray-500 italic mt-0.5">{r.notes}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-medium text-gray-600">{fmt(r.recordedAt)}</p>
                    {r.projectedJobDate && (
                      <p className="text-[10px] text-violet-500">→ {fmt(r.projectedJobDate)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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

interface SelectedSpecies { name: string; grade: PlantGrade; qty: number; notes?: string; }

function SpeciesPicker({
  selected, onToggle, onQtyChange, onGradeChange, onClose, onSave,
}: {
  selected: SelectedSpecies[];
  onToggle: (sp: Species) => void;
  onQtyChange: (name: string, qty: number) => void;
  onGradeChange: (name: string, grade: PlantGrade) => void;
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
                  </div>
                  {sel && (
                    <div className="mt-2 space-y-1.5" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
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
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-500 flex-shrink-0">Grade:</span>
                        <select
                          value={selRecord?.grade ?? "1 litre"}
                          onChange={e => onGradeChange(sp.name, e.target.value as PlantGrade)}
                          className="text-[10px] font-semibold flex-1 border border-gray-200 rounded-lg px-1.5 py-0.5 bg-white outline-none focus:border-[#00AECD]">
                          {PLANT_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </div>
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
  assets, onClose, onSave, initialAssetId,
}: {
  assets: { id: string; name: string; description?: string | null }[];
  onClose: () => void;
  onSave: (job: { assetId: string; assessmentDate: string; assessmentNotes: string; species: SelectedSpecies[] }) => void;
  initialAssetId?: string;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [assetId, setAssetId] = useState(initialAssetId ?? "");
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
        : [...prev, { name: sp.name, grade: "1 litre" as PlantGrade, qty: 5 }]
    );
  const setQty   = (name: string, qty: number) =>
    setSpecies(prev => prev.map(s => s.name === name ? { ...s, qty } : s));
  const setGrade = (name: string, grade: PlantGrade) =>
    setSpecies(prev => prev.map(s => s.name === name ? { ...s, grade } : s));

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6">
      {showPicker && (
        <SpeciesPicker selected={species} onToggle={toggleSpecies} onQtyChange={setQty}
          onGradeChange={setGrade}
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
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <SciName name={sp.name} className="text-xs font-semibold text-gray-800" />
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${GRADE_COLORS[sp.grade] ?? "bg-gray-100 text-gray-600"}`}>{sp.grade}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button onClick={() => setQty(sp.name, Math.max(1, sp.qty - 1))}
                            className="w-5 h-5 rounded bg-gray-200 text-xs font-bold flex items-center justify-center">−</button>
                          <span className="text-sm font-bold w-6 text-center" style={{ color: BRAND }}>{sp.qty}</span>
                          <button onClick={() => setQty(sp.name, sp.qty + 1)}
                            className="w-5 h-5 rounded bg-gray-200 text-xs font-bold flex items-center justify-center">+</button>
                          <button onClick={() => setSpecies(p => p.filter(s => s.name !== sp.name))}
                            className="text-red-300 hover:text-red-500 ml-1"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-500 flex-shrink-0">Grade:</span>
                        <select value={sp.grade} onChange={e => setGrade(sp.name, e.target.value as PlantGrade)}
                          className="text-[10px] font-semibold flex-1 border border-gray-200 rounded-lg px-1.5 py-0.5 bg-white outline-none focus:border-[#00AECD]">
                          {PLANT_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
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
                    <div key={sp.name} className="flex justify-between text-xs text-emerald-700 gap-2">
                      <SciName name={sp.name} />
                      <span className="font-semibold shrink-0">{sp.grade} · {sp.qty} plants</span>
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
  job, teams, assetTeamId, assetLat, assetLng, onClose, onSchedule, onStatusChange,
}: {
  job: InfillJob;
  teams: { id: string; name: string }[];
  assetTeamId?: string | null;
  assetLat?: number | null;
  assetLng?: number | null;
  onClose: () => void;
  onSchedule: (jobId: string, teamId: string, plannedDate: string, estimatedMins: number) => void;
  onStatusChange: (jobId: string, status: JobStatus) => void;
}) {
  const [, navigate] = useLocation();
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
            <div className="mt-2 flex items-center gap-2">
              <StatusBadge status={job.status} />
              {assetLat != null && assetLng != null && (
                <button
                  onClick={() => navigate(`/map?assetId=${job.assetId}&jobId=${job.id}`)}
                  className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors"
                  style={{ background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.75)" }}
                  title="View this site on the main map"
                >
                  <MapIcon className="w-3 h-3" />
                  View on map
                  <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                </button>
              )}
            </div>
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
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${GRADE_COLORS[sp.speciesCategory as PlantGrade] ?? "bg-gray-100 text-gray-600"}`}>
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

function MulchingTab({
  assets, teams,
}: {
  assets: { id: string; name: string; description?: string | null }[];
  teams: { id: string; name: string }[];
}) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: mulchData, isLoading: mulchLoading } = useListMulchingRecords(undefined, {
    query: { queryKey: getListMulchingRecordsQueryKey() },
  });
  const mulchRecords: any[] = (mulchData as any)?.data ?? [];

  const updateMulch = useUpdateMulchingRecord();
  const createMulch = useCreateMulchingRecord();

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ assetId: "", scheduledDate: "", volumeM3: "", mulchType: "", contractor: "", costNzd: "", notes: "" });

  // Record Depth drawer state
  const [depthTarget, setDepthTarget] = useState<{ id: string; name: string } | null>(null);
  // Review & Schedule drawer state
  const [reviewTarget, setReviewTarget] = useState<any | null>(null);
  // Expanded history asset
  const [historyAssetId, setHistoryAssetId] = useState<string | null>(null);

  const handleCreate = async () => {
    try {
      await (createMulch.mutateAsync as any)({ data: { assetId: form.assetId, scheduledDate: form.scheduledDate || null, volumeM3: form.volumeM3 || null, mulchType: form.mulchType || null, contractor: form.contractor || null, costNzd: form.costNzd || null, notes: form.notes || null } });
      qc.invalidateQueries({ queryKey: getListMulchingRecordsQueryKey() });
      toast({ title: "Mulching record added" });
      setAddOpen(false);
      setForm({ assetId: "", scheduledDate: "", volumeM3: "", mulchType: "", contractor: "", costNzd: "", notes: "" });
    } catch {
      toast({ title: "Failed to add record", variant: "destructive" });
    }
  };

  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: getListMulchingRecordsQueryKey() });
  };

  const draftCount = mulchRecords.filter(r => r.status === "draft").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Mulching Programme</h2>
          <p className="text-sm text-gray-400">
            {mulchRecords.length} records
            {draftCount > 0 && (
              <span className="ml-2 text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ color: "#7c3aed", background: "#f5f3ff" }}>
                {draftCount} draft{draftCount !== 1 ? "s" : ""} awaiting review
              </span>
            )}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} style={{ background: BRAND }}>
          <Plus className="w-4 h-4 mr-1" /> Add Record
        </Button>
      </div>

      {/* Drawers */}
      {depthTarget && (
        <RecordDepthDrawer
          assetId={depthTarget.id}
          assetName={depthTarget.name}
          onClose={() => setDepthTarget(null)}
          onSaved={handleRefresh}
        />
      )}
      {reviewTarget && (
        <MulchingReviewDrawer
          record={reviewTarget}
          teams={teams}
          onClose={() => setReviewTarget(null)}
          onPublished={handleRefresh}
        />
      )}

      {/* Records list */}
      {mulchLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
      ) : mulchRecords.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Layers className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No mulching records yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {mulchRecords.map((r: any) => {
            const st = MULCH_STATUS[r.status] ?? MULCH_STATUS.due;
            const isDraft = r.status === "draft";
            const assetObj = assets.find(a => a.id === r.assetId);
            const showHistory = historyAssetId === r.assetId;

            return (
              <div key={r.id} className="bg-white rounded-xl border overflow-hidden"
                style={isDraft ? { borderColor: "#c4b5fd", boxShadow: "0 0 0 1px #ede9fe" } : {}}>
                <div className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{r.assetName ?? "Unknown asset"}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {r.scheduledDate ? fmt(r.scheduledDate) : "No date"}
                      {r.mulchType ? ` · ${r.mulchType}` : ""}
                      {r.volumeM3 ? ` · ${r.volumeM3} m³` : ""}
                    </p>
                    {isDraft && r.projectedDepthAtDue != null && (
                      <p className="text-[10px] text-violet-500 mt-0.5">
                        Projected depth at job date: ~{r.projectedDepthAtDue}mm (threshold {ACTION_THRESHOLD_MM}mm)
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                    {/* Status badge */}
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                      style={{ color: st.color, background: st.bg }}>{st.label}</span>

                    {/* Record Depth button */}
                    {r.status !== "completed" && assetObj && (
                      <button
                        onClick={() => setDepthTarget({ id: r.assetId, name: r.assetName ?? assetObj.name })}
                        className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        <Ruler className="w-3 h-3" /> Record Depth
                      </button>
                    )}

                    {/* Review & Schedule for drafts */}
                    {isDraft && (
                      <button
                        onClick={() => setReviewTarget(r)}
                        className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors"
                        style={{ background: "#7c3aed", color: "white" }}
                      >
                        <Zap className="w-3 h-3" /> Review &amp; Schedule
                      </button>
                    )}

                    {/* Mark done for non-draft, non-completed */}
                    {r.status !== "completed" && r.status !== "draft" && (
                      <button
                        onClick={() => (updateMulch.mutateAsync as any)({ id: r.id, data: { status: "completed", completedDate: new Date().toISOString().slice(0, 10) } }).then(handleRefresh)}
                        className="text-[11px] text-green-600 hover:text-green-800 font-medium">
                        Mark Done
                      </button>
                    )}

                    {/* History toggle */}
                    <button
                      onClick={() => setHistoryAssetId(showHistory ? null : r.assetId)}
                      className="text-gray-300 hover:text-gray-500 transition-colors"
                      title="View reading history"
                    >
                      <History className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Reading history panel — collapsible */}
                {showHistory && (
                  <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
                    <ReadingHistoryPanel assetId={r.assetId} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add record dialog (manual entry) */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
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
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!form.assetId} style={{ background: BRAND }}>Add Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Status colours for map markers ──────────────────────────────────────────

const MARKER_COLORS: Record<JobStatus, string> = {
  draft:       "#6b7280",
  scheduled:   "#00AECD",
  in_progress: "#d97706",
  completed:   "#16a34a",
  cancelled:   "#9ca3af",
};

// ─── Infill Map View ──────────────────────────────────────────────────────────

interface MappedAsset {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
}

// Spread N markers in a circle around a centre point (lat/lng degrees).
// ~0.00035° ≈ 35 m at NZ latitudes — enough to visually separate markers.
const SPIDER_RADIUS = 0.00035;

function spiderOffsets(count: number): Array<[number, number]> {
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    return [SPIDER_RADIUS * Math.cos(angle), SPIDER_RADIUS * Math.sin(angle)];
  });
}

function makeClusterIcon(count: number) {
  const size = count > 9 ? 44 : 38;
  return L.divIcon({
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:#0f2a36;border:3px solid white;
      display:flex;align-items:center;justify-content:center;
      font-family:system-ui,sans-serif;font-weight:700;font-size:${count > 9 ? 13 : 15}px;
      color:white;box-shadow:0 2px 8px rgba(0,0,0,0.35);cursor:pointer;
    ">${count}</div>`,
    className: "",
    iconSize: L.point(size, size),
    iconAnchor: L.point(size / 2, size / 2),
  });
}

function InfillMapView({
  jobs,
  assets,
  statusFilter,
  onSelectJob,
}: {
  jobs: InfillJob[];
  assets: MappedAsset[];
  statusFilter: JobStatus | "all";
  onSelectJob: (id: string) => void;
}) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const assetCoords = useMemo(() => {
    const m = new Map<string, { lat: number; lng: number }>();
    for (const a of assets) {
      if (a.lat != null && a.lng != null) {
        const lat = Number(a.lat);
        const lng = Number(a.lng);
        if (!isNaN(lat) && !isNaN(lng)) m.set(a.id, { lat, lng });
      }
    }
    return m;
  }, [assets]);

  const visibleJobs = useMemo(() => {
    const filtered = statusFilter === "all" ? jobs : jobs.filter(j => j.status === statusFilter);
    return filtered
      .map(job => {
        const coords = assetCoords.get(job.assetId);
        if (!coords) return null;
        const totalPlants = job.species.reduce((s, sp) => s + sp.quantity, 0);
        return { job, lat: coords.lat, lng: coords.lng, totalPlants };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [jobs, statusFilter, assetCoords]);

  // Group by exact lat/lng position so stacked markers are detected.
  const clusters = useMemo(() => {
    const map = new Map<string, typeof visibleJobs>();
    for (const item of visibleJobs) {
      const key = `${item.lat.toFixed(7)},${item.lng.toFixed(7)}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  }, [visibleJobs]);

  const unmapped = useMemo(() => {
    const filtered = statusFilter === "all" ? jobs : jobs.filter(j => j.status === statusFilter);
    return filtered.filter(j => !assetCoords.has(j.assetId)).length;
  }, [jobs, statusFilter, assetCoords]);

  function toggleCluster(key: string) {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function ZoomCollapser() {
    useMapEvents({ zoomend: () => setExpandedKeys(new Set()) });
    return null;
  }

  return (
    <div className="space-y-3">
      {unmapped > 0 && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {unmapped} assessment{unmapped !== 1 ? "s" : ""} hidden — asset{unmapped !== 1 ? "s" : ""} have no map coordinates.
        </p>
      )}
      <div style={{ height: 540, borderRadius: 16, overflow: "hidden", border: "1px solid #e5e7eb" }}>
        <MapContainer
          center={[-41.1280, 174.8520]}
          zoom={13}
          maxZoom={21}
          style={{ height: "100%", width: "100%" }}
          zoomControl={false}
          attributionControl={false}
        >
          <ZoomCollapser />
          <ZoomControl position="bottomright" />
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="© OpenStreetMap contributors"
            maxNativeZoom={19}
            maxZoom={21}
          />

          {Array.from(clusters.entries()).map(([key, items]) => {
            const { lat, lng } = items[0];

            // ── Single job at this position ──────────────────────────────
            if (items.length === 1) {
              const { job, totalPlants } = items[0];
              const color = MARKER_COLORS[job.status] ?? "#6b7280";
              const cfg = JOB_STATUS[job.status];
              const radius = Math.max(10, Math.min(22, 10 + Math.sqrt(totalPlants) * 0.9));
              return (
                <CircleMarker
                  key={job.id}
                  center={[lat, lng]}
                  radius={radius}
                  pathOptions={{ fillColor: color, fillOpacity: 0.9, color: "white", weight: 2.5 }}
                  eventHandlers={{ click: () => onSelectJob(job.id) }}
                >
                  <Tooltip direction="top" offset={[0, -(radius + 4)]} opacity={1}>
                    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: 1.5, minWidth: 140 }}>
                      <p style={{ fontWeight: 700, fontSize: 12, color: "#0f2a36", margin: 0 }}>
                        {job.assetName ?? "Unknown site"}
                      </p>
                      <p style={{ fontSize: 10, margin: "2px 0 0", fontWeight: 600, color: cfg.color }}>
                        {cfg.label}
                      </p>
                      <p style={{ fontSize: 10, color: "#6b7280", margin: "1px 0 0" }}>
                        {totalPlants} plant{totalPlants !== 1 ? "s" : ""}
                      </p>
                      <p style={{ fontSize: 9, color: "#9ca3af", margin: "3px 0 0" }}>
                        Click to open detail
                      </p>
                    </div>
                  </Tooltip>
                </CircleMarker>
              );
            }

            // ── Multiple jobs at this position ───────────────────────────
            const isExpanded = expandedKeys.has(key);

            if (!isExpanded) {
              // Collapsed: show a single cluster badge
              return (
                <Marker
                  key={key}
                  position={[lat, lng]}
                  icon={makeClusterIcon(items.length)}
                  eventHandlers={{ click: () => toggleCluster(key) }}
                >
                  <Tooltip direction="top" offset={[0, -22]} opacity={1}>
                    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: 1.5, minWidth: 150 }}>
                      <p style={{ fontWeight: 700, fontSize: 12, color: "#0f2a36", margin: 0 }}>
                        {items[0].job.assetName ?? "Unknown site"}
                      </p>
                      <p style={{ fontSize: 10, color: "#6b7280", margin: "2px 0 0" }}>
                        {items.length} overlapping jobs
                      </p>
                      <p style={{ fontSize: 9, color: "#9ca3af", margin: "3px 0 0" }}>
                        Click to expand
                      </p>
                    </div>
                  </Tooltip>
                </Marker>
              );
            }

            // Expanded: fan out individual markers in a circle
            const offsets = spiderOffsets(items.length);
            return items.flatMap(({ job, totalPlants }, idx) => {
              const color = MARKER_COLORS[job.status] ?? "#6b7280";
              const cfg = JOB_STATUS[job.status];
              const radius = Math.max(10, Math.min(22, 10 + Math.sqrt(totalPlants) * 0.9));
              const [dLat, dLng] = offsets[idx];
              const offsetPos: [number, number] = [lat + dLat, lng + dLng];
              return [
                <Polyline
                  key={`${job.id}-leg`}
                  positions={[[lat, lng], offsetPos]}
                  pathOptions={{ color: "#9ca3af", weight: 1, opacity: 0.7, dashArray: "4 4" }}
                  interactive={false}
                />,
                <CircleMarker
                  key={job.id}
                  center={offsetPos}
                  radius={radius}
                  pathOptions={{ fillColor: color, fillOpacity: 0.9, color: "white", weight: 2.5 }}
                  eventHandlers={{
                    click: (e) => {
                      e.originalEvent.stopPropagation();
                      onSelectJob(job.id);
                    },
                  }}
                >
                  <Tooltip direction="top" offset={[0, -(radius + 4)]} opacity={1}>
                    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: 1.5, minWidth: 150 }}>
                      <p style={{ fontWeight: 700, fontSize: 12, color: "#0f2a36", margin: 0 }}>
                        {job.assetName ?? "Unknown site"}
                      </p>
                      <p style={{ fontSize: 10, margin: "2px 0 0", fontWeight: 600, color: cfg.color }}>
                        {cfg.label}
                      </p>
                      <p style={{ fontSize: 10, color: "#6b7280", margin: "1px 0 0" }}>
                        {totalPlants} plant{totalPlants !== 1 ? "s" : ""}
                      </p>
                      <p style={{ fontSize: 9, color: "#00aecd", margin: "3px 0 0" }}>
                        Click to open · {idx + 1}/{items.length}
                      </p>
                    </div>
                  </Tooltip>
                </CircleMarker>,
              ];
            });
          })}
        </MapContainer>
      </div>

      {/* Map legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Status</p>
        {(["draft", "scheduled", "in_progress", "completed"] as JobStatus[]).map(s => (
          <div key={s} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: MARKER_COLORS[s] }} />
            <span className="text-[10px] text-gray-600">{JOB_STATUS[s].label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full flex-shrink-0 bg-[#0f2a36] flex items-center justify-center" style={{ fontSize: 7, color: "white", fontWeight: 700 }}>N</span>
          <span className="text-[10px] text-gray-600">Cluster (click to expand)</span>
        </div>
        <span className="text-[10px] text-gray-400 ml-auto">Marker size ∝ plant quantity</span>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Programmes() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const search = useSearch();
  const [, navigate] = useLocation();

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
  const assets: { id: string; name: string; description?: string | null; teamId?: string | null; lat: number | null; lng: number | null }[] = ((assetsData as any)?.data ?? []).map((a: any) => ({ id: a.id, name: a.name, description: a.description ?? null, teamId: a.teamId ?? null, lat: a.lat ?? null, lng: a.lng ?? null }));

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
  const [prefilledAssetId, setPrefilledAssetId] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<JobStatus | "all">("all");
  const [infillView, setInfillView] = useState<"list" | "map">("list");

  useEffect(() => {
    const params = new URLSearchParams(search);
    const assetId = params.get("newAssessment");
    if (assetId) {
      setPrefilledAssetId(assetId);
      setDrawerOpen(true);
      navigate("/programmes", { replace: true });
      return;
    }
    const jobId = params.get("jobId");
    if (jobId) {
      setSelectedJobId(jobId);
      navigate("/programmes", { replace: true });
    }
  }, [search]);

  type SortKey = "assetName" | "assessmentNotes" | "totalPlants" | "status" | "teamName";
  const [sortKey, setSortKey] = useState<SortKey>("assetName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const selectedJob = jobs.find(j => j.id === selectedJobId) ?? null;

  const filteredJobs = useMemo(
    () => statusFilter === "all" ? jobs : jobs.filter(j => j.status === statusFilter),
    [jobs, statusFilter]
  );

  const sortedJobs = useMemo(() => {
    return [...filteredJobs].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      if (sortKey === "assetName") { av = a.assetName ?? ""; bv = b.assetName ?? ""; }
      else if (sortKey === "assessmentNotes") { av = a.assessmentNotes ?? ""; bv = b.assessmentNotes ?? ""; }
      else if (sortKey === "totalPlants") { av = a.species.reduce((s, sp) => s + sp.quantity, 0); bv = b.species.reduce((s, sp) => s + sp.quantity, 0); }
      else if (sortKey === "status") { av = a.status; bv = b.status; }
      else if (sortKey === "teamName") { av = a.teamName ?? ""; bv = b.teamName ?? ""; }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredJobs, sortKey, sortDir]);

  const statCounts = useMemo(() => {
    const c: Partial<Record<JobStatus | "all", number>> = { all: jobs.length };
    for (const j of jobs) c[j.status] = (c[j.status] ?? 0) + 1;
    return c;
  }, [jobs]);

  const plantTotals = useMemo(() => {
    let required = 0;
    let inGround = 0;
    for (const j of jobs) {
      if (j.status === "cancelled") continue;
      const qty = j.species.reduce((s, sp) => s + sp.quantity, 0);
      required += qty;
      if (j.status === "completed") inGround += qty;
    }
    return { required, inGround };
  }, [jobs]);

  type SpeciesScope = "all" | "needs_ordering" | "in_ground";
  type SpeciesSortKey = "speciesName" | "category" | "totalQty" | "sites" | "completedQty";
  const [speciesScope, setSpeciesScope]         = useState<SpeciesScope>("all");
  const [speciesSortKey, setSpeciesSortKey]     = useState<SpeciesSortKey>("totalQty");
  const [speciesSortDir, setSpeciesSortDir]     = useState<"asc" | "desc">("desc");
  const [speciesExpanded, setSpeciesExpanded]   = useState(true);

  const handleSpeciesSort = (key: SpeciesSortKey) => {
    if (speciesSortKey === key) setSpeciesSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSpeciesSortKey(key); setSpeciesSortDir(key === "totalQty" ? "desc" : "asc"); }
  };

  const speciesSummary = useMemo(() => {
    const map = new Map<string, {
      speciesName: string; category: string;
      totalQty: number; siteIds: Set<string>;
      draftQty: number; scheduledQty: number; completedQty: number;
    }>();
    for (const j of jobs) {
      if (j.status === "cancelled") continue;
      if (speciesScope === "needs_ordering" && (j.status === "completed" || j.status === "in_progress")) continue;
      if (speciesScope === "in_ground"      && j.status !== "completed") continue;
      for (const sp of j.species) {
        const key = `${sp.speciesName}||${sp.speciesCategory}`;
        const existing = map.get(key);
        if (existing) {
          existing.totalQty += sp.quantity;
          existing.siteIds.add(j.id);
          if (j.status === "draft")       existing.draftQty     += sp.quantity;
          if (j.status === "scheduled")   existing.scheduledQty += sp.quantity;
          if (j.status === "completed")   existing.completedQty += sp.quantity;
        } else {
          map.set(key, {
            speciesName:  sp.speciesName,
            category:     sp.speciesCategory,
            totalQty:     sp.quantity,
            siteIds:      new Set([j.id]),
            draftQty:     j.status === "draft"     ? sp.quantity : 0,
            scheduledQty: j.status === "scheduled" ? sp.quantity : 0,
            completedQty: j.status === "completed" ? sp.quantity : 0,
          });
        }
      }
    }
    const rows = Array.from(map.values()).map(r => ({ ...r, sites: r.siteIds.size }));
    return rows.sort((a, b) => {
      const numKeys: SpeciesSortKey[] = ["totalQty", "sites", "completedQty"];
      const av = numKeys.includes(speciesSortKey)
        ? (a[speciesSortKey as "totalQty" | "sites" | "completedQty"] as number)
        : (a[speciesSortKey as "speciesName" | "category"] as string).toLowerCase();
      const bv = numKeys.includes(speciesSortKey)
        ? (b[speciesSortKey as "totalQty" | "sites" | "completedQty"] as number)
        : (b[speciesSortKey as "speciesName" | "category"] as string).toLowerCase();
      if (av < bv) return speciesSortDir === "asc" ? -1 : 1;
      if (av > bv) return speciesSortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [jobs, speciesScope, speciesSortKey, speciesSortDir]);

  const exportSpeciesCSV = () => {
    const headers = ["Species", "Category", "Total Qty", "Sites"];
    const rows = speciesSummary.map(s =>
      [s.speciesName, s.category, s.totalQty, s.sites]
    );
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "infill-species-summary.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveAssessment = (form: { assetId: string; assessmentDate: string; assessmentNotes: string; species: SelectedSpecies[] }) => {
    createJob.mutate({
      assetId:         form.assetId,
      assessmentDate:  form.assessmentDate,
      assessmentNotes: form.assessmentNotes,
      species: form.species.map(sp => ({
        speciesName:     sp.name,
        speciesCategory: sp.grade,
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
            {/* Plant totals summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border p-4 bg-white flex items-center gap-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "#e0f7fb" }}>
                  <Sprout className="w-5 h-5" style={{ color: BRAND }} />
                </div>
                <div>
                  <p className="text-2xl font-black" style={{ color: BRAND }}>
                    {jobsLoading ? "—" : plantTotals.required.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">Total plants required</p>
                </div>
              </div>
              <div className="rounded-xl border p-4 bg-white flex items-center gap-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "#dcfce7" }}>
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-black text-green-600">
                    {jobsLoading ? "—" : plantTotals.inGround.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">Total plants in the ground</p>
                </div>
              </div>
            </div>

            {/* Species order summary */}
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              {/* Header */}
              <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100 bg-gray-50">
                <button
                  className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900"
                  onClick={() => setSpeciesExpanded(v => !v)}>
                  <Package className="w-4 h-4" style={{ color: BRAND }} />
                  Species Order Summary
                  <span className="text-[11px] font-normal text-gray-400 ml-1">
                    {speciesSummary.length} species
                  </span>
                  {speciesExpanded
                    ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                    : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                </button>
                <button
                  onClick={exportSpeciesCSV}
                  className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                  <Download className="w-3 h-3" /> Export CSV
                </button>
              </div>

              {speciesExpanded && (
                <>
                  {/* Scope filter */}
                  <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
                    <span className="text-[11px] text-gray-400 mr-1">Show:</span>
                    {([
                      { key: "all",            label: "All" },
                      { key: "needs_ordering", label: "Needs ordering" },
                      { key: "in_ground",      label: "In ground" },
                    ] as { key: SpeciesScope; label: string }[]).map(s => (
                      <button key={s.key}
                        onClick={() => setSpeciesScope(s.key)}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors"
                        style={{
                          borderColor: speciesScope === s.key ? BRAND : "#e5e7eb",
                          background:  speciesScope === s.key ? "#e0f7fb" : "white",
                          color:       speciesScope === s.key ? BRAND : "#6b7280",
                        }}>
                        {s.label}
                      </button>
                    ))}
                  </div>

                  {/* Table */}
                  {speciesSummary.length === 0 ? (
                    <div className="py-8 text-center text-gray-400 text-sm">
                      No species data for this filter.
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100">
                          {([
                            { key: "speciesName", label: "Species" },
                            { key: "category",    label: "Grade/size" },
                            { key: "totalQty",    label: "Total qty" },
                            { key: "sites",       label: "Sites" },
                          ] as { key: SpeciesSortKey; label: string }[]).map(col => (
                            <th key={col.key}
                              className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 whitespace-nowrap"
                              onClick={() => handleSpeciesSort(col.key)}>
                              <span className="flex items-center gap-1">
                                {col.label}
                                <span className="text-gray-300">
                                  {speciesSortKey === col.key ? (speciesSortDir === "asc" ? "↑" : "↓") : "↕"}
                                </span>
                              </span>
                            </th>
                          ))}
                          <th
                            className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 whitespace-nowrap"
                            onClick={() => handleSpeciesSort("completedQty")}>
                            <span className="flex items-center gap-1">
                              Breakdown
                              <span className="text-gray-300">
                                {speciesSortKey === "completedQty" ? (speciesSortDir === "asc" ? "↑" : "↓") : "↕"}
                              </span>
                            </span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {speciesSummary.map(row => (
                          <tr key={`${row.speciesName}||${row.category}`} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5">
                              <span className="font-semibold text-gray-800 italic">{row.speciesName}</span>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${GRADE_COLORS[row.category as PlantGrade] ?? "bg-gray-100 text-gray-600"}`}>
                                {row.category}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="text-lg font-black" style={{ color: BRAND }}>{row.totalQty}</span>
                            </td>
                            <td className="px-4 py-2.5 text-sm text-gray-600">{row.sites}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {row.draftQty > 0 && (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                    style={{ background: JOB_STATUS.draft.bg, color: JOB_STATUS.draft.color }}>
                                    {row.draftQty} draft
                                  </span>
                                )}
                                {row.scheduledQty > 0 && (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                    style={{ background: JOB_STATUS.scheduled.bg, color: JOB_STATUS.scheduled.color }}>
                                    {row.scheduledQty} scheduled
                                  </span>
                                )}
                                {row.completedQty > 0 && (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                    style={{ background: JOB_STATUS.completed.bg, color: JOB_STATUS.completed.color }}>
                                    {row.completedQty} in ground
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>

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
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-gray-500 flex-1">
                {filteredJobs.length} assessment{filteredJobs.length !== 1 ? "s" : ""}
                {statusFilter !== "all" && ` · ${JOB_STATUS[statusFilter].label}`}
              </p>
              {/* List / Map toggle */}
              <div className="flex rounded-lg border border-gray-200 overflow-hidden flex-shrink-0">
                <button
                  onClick={() => setInfillView("list")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${infillView === "list" ? "text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
                  style={infillView === "list" ? { background: BRAND } : {}}>
                  <List className="w-3.5 h-3.5" /> List
                </button>
                <button
                  onClick={() => setInfillView("map")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors border-l border-gray-200 ${infillView === "map" ? "text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
                  style={infillView === "map" ? { background: BRAND } : {}}>
                  <MapIcon className="w-3.5 h-3.5" /> Map
                </button>
              </div>
              <Button onClick={() => setDrawerOpen(true)} style={{ background: BRAND }}>
                <Plus className="w-4 h-4 mr-1" /> New Assessment
              </Button>
            </div>

            {/* Map view */}
            {infillView === "map" && (
              <InfillMapView
                jobs={jobs}
                assets={assets}
                statusFilter={statusFilter}
                onSelectJob={setSelectedJobId}
              />
            )}

            {/* Jobs table (list view) */}
            {infillView === "list" && (jobsLoading ? (
              <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}</div>
            ) : sortedJobs.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Sprout className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">No assessments found</p>
                {statusFilter === "all" && (
                  <p className="text-xs mt-1">Click <strong>New Assessment</strong> to create the first one.</p>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {([
                        { key: "assetName",       label: "Site name" },
                        { key: "assessmentNotes",  label: "Description" },
                        { key: "totalPlants",      label: "Plants" },
                        { key: "status",           label: "Status" },
                        { key: "teamName",         label: "Team" },
                      ] as { key: SortKey; label: string }[]).map(col => (
                        <th key={col.key}
                          className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider select-none cursor-pointer hover:text-gray-800 whitespace-nowrap"
                          onClick={() => handleSort(col.key)}>
                          <span className="flex items-center gap-1">
                            {col.label}
                            <span className="text-gray-300">
                              {sortKey === col.key
                                ? sortDir === "asc" ? "↑" : "↓"
                                : "↕"}
                            </span>
                          </span>
                        </th>
                      ))}
                      <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sortedJobs.map(job => {
                      const totalPlants = job.species.reduce((s, sp) => s + sp.quantity, 0);
                      const canSchedule = job.status === "draft";
                      const canCancel   = job.status === "draft" || job.status === "scheduled";
                      return (
                        <tr key={job.id}
                          className="hover:bg-[#f0fafb] cursor-pointer transition-colors group"
                          onClick={() => setSelectedJobId(job.id)}>
                          <td className="px-4 py-3">
                            <span className="font-semibold text-gray-900 group-hover:text-[#00AECD] transition-colors">
                              {job.assetName ?? "—"}
                            </span>
                            <div className="text-[10px] text-gray-400 mt-0.5">
                              {fmt(job.assessmentDate)}{job.assessorName ? ` · ${job.assessorName}` : ""}
                            </div>
                          </td>
                          <td className="px-4 py-3 max-w-[220px]">
                            <span className="text-gray-600 line-clamp-2 text-xs">
                              {job.assessmentNotes || <span className="text-gray-300 italic">—</span>}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="font-bold text-base" style={{ color: BRAND }}>{totalPlants}</span>
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={job.status} />
                          </td>
                          <td className="px-4 py-3">
                            {job.teamName ? (
                              <div>
                                <div className="text-xs font-medium text-gray-700">{job.teamName}</div>
                                {job.plannedDate && (
                                  <div className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />{fmt(job.plannedDate)}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-300 text-xs italic">Unassigned</span>
                            )}
                          </td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1.5 justify-end">
                              {canSchedule && (
                                <button
                                  onClick={() => setSelectedJobId(job.id)}
                                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors"
                                  style={{ color: JOB_STATUS.scheduled.color, background: JOB_STATUS.scheduled.bg }}>
                                  Schedule
                                </button>
                              )}
                              <button
                                onClick={() => setSelectedJobId(job.id)}
                                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                                Edit
                              </button>
                              {canCancel && (
                                <button
                                  onClick={() => updateJob.mutate({ id: job.id, data: { status: "cancelled" } })}
                                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors"
                                  style={{ color: "#dc2626", background: "#fef2f2" }}>
                                  Cancel
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ── Mulching ── */}
        <TabsContent value="mulching">
          <MulchingTab assets={assets} teams={teams} />
        </TabsContent>
      </Tabs>

      {/* Modals */}
      {drawerOpen && (
        <NewAssessmentDrawer
          assets={assets}
          initialAssetId={prefilledAssetId}
          onClose={() => { setDrawerOpen(false); setPrefilledAssetId(""); }}
          onSave={handleSaveAssessment}
        />
      )}
      {selectedJob && (
        <JobDetailPanel
          job={selectedJob}
          teams={teams}
          assetTeamId={assets.find(a => a.id === selectedJob.assetId)?.teamId ?? null}
          assetLat={assets.find(a => a.id === selectedJob.assetId)?.lat ?? null}
          assetLng={assets.find(a => a.id === selectedJob.assetId)?.lng ?? null}
          onClose={() => setSelectedJobId(null)}
          onSchedule={handleSchedule}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}
