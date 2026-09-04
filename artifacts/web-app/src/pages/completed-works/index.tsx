import React, { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { Search, X, Clock, Camera, FileText, ChevronRight, CheckCircle2, ArrowUpRight, ArrowDownRight, Minus, ChevronsUpDown, ChevronUp, ChevronDown, MapPin, Maximize2, Download, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

// ─── types ───────────────────────────────────────────────────────────────────

interface CompletedWork {
  id: string;
  jobType?: string;
  scheduledDate?: string;
  startedAt?: string | null;
  completedAt: string | null;
  actualTimeMins: number | null;
  estimatedTimeMins?: number | null;
  notes?: string | null;
  crewStatus?: string;
  isAllTeams?: boolean;
  teamId: string | null;
  teamName: string | null;
  assignedUserName?: string | null;
  workerName?: string | null;
  assetId: string | null;
  assetName: string | null;
  assetDescription: string | null;
  gardenType?: string | null;
  ward?: string | null;
  suburb?: string | null;
  areaM2?: number | null;

  // Storm Patrol Specific
  workSource: "garden" | "storm_patrol";
  phase?: string;
  outcome?: string;
  comments?: string | null;
  stormName?: string;
  hourlyRateCents?: number;
  workTypes?: string[];
  chargeCents?: number;
}

interface Photo {
  id: string;
  blobUrl: string;
  caption: string | null;
  createdAt: string;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const GARDEN_TYPE_LABELS: Record<string, string> = {
  annuals:           "Annuals",
  roses_perennials:  "Roses & Perennials",
  ornamental:        "Ornamental",
  amenity:           "Amenity",
  rain_garden:       "Rain Garden",
  reveg:             "Revegetation",
  bush:              "Bush",
  tree_planter_pits: "Tree Planter Pits",
  hedge:             "Hedge",
};

const WARD_LABELS: Record<string, string> = {
  eastern:  "Eastern",
  northern: "Northern",
  western:  "Western",
};

const JOB_TYPE_LABELS: Record<string, string> = {
  scheduled:       "Scheduled",
  reactive:        "Reactive",
  mulching:        "Mulching",
  infill_planting: "Infill Planting",
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-NZ", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatMins(m: number | null) {
  if (m == null) return "—";
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}m`;
  return min === 0 ? `${h}h` : `${h}h ${min}m`;
}

function varianceMins(actual: number | null, estimated: number | null): number | null {
  if (actual == null || estimated == null) return null;
  return actual - estimated;
}

// ─── detail panel ────────────────────────────────────────────────────────────

function DetailPanel({ job, onClose }: { job: CompletedWork; onClose: () => void }) {
  const isStorm = job.workSource === "storm_patrol";
  const { data: photosData } = useQuery<{ data: Photo[] }>({
    queryKey: ["job-photos", job.id, job.workSource],
    queryFn: async () => {
      if (isStorm) return { data: [] };
      const res = await fetch(`/api/jobs/${job.id}/photos`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const photos = photosData?.data ?? [];
  const variance = varianceMins(job.actualTimeMins, job.estimatedTimeMins ?? null);

  return (
    <div className="w-[420px] flex-shrink-0 flex flex-col h-full bg-white border-l border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 bg-gray-50">
        <div className="flex-1 min-w-0 pr-3">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
            <span className="text-xs font-medium text-green-700 uppercase tracking-wide">
              {job.outcome === "too_dangerous" ? "Too Dangerous" : "Completed"}
            </span>
          </div>
          <h2 className="text-base font-semibold text-gray-900 leading-tight truncate">
            {job.assetName ?? "Unknown Site"}
          </h2>
          {isStorm && (
            <p className="text-xs text-red-500 font-medium mt-1">{job.stormName}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

        {/* Key info grid */}
        <div className="grid grid-cols-2 gap-3">
          {isStorm ? (
             <InfoBlock label="Completed" value={formatDate(job.completedAt)} />
          ) : (
            <InfoBlock label="Scheduled Date" value={formatDate(job.scheduledDate ?? null)} />
          )}
          {isStorm ? null : <InfoBlock label="Start Time" value={formatDateTime(job.startedAt ?? null)} />}
          {isStorm ? null : <InfoBlock label="Completed" value={formatDateTime(job.completedAt)} />}
          <InfoBlock label="Team" value={job.isAllTeams ? "All Teams" : (job.teamName ?? "—")} />
          <InfoBlock label="Completed by" value={job.isAllTeams ? "Team sign-off" : (job.assignedUserName || job.workerName || "—")} />

          {isStorm ? (
            <>
              <InfoBlock label="Phase" value={<span className="uppercase text-xs font-bold">{job.phase}</span>} />
              <InfoBlock label="Charge" value={job.chargeCents != null ? `${(job.chargeCents/100).toFixed(2)}` : "—"} />
            </>
          ) : (
            <InfoBlock label="Job Type" value={job.jobType ? (JOB_TYPE_LABELS[job.jobType] ?? job.jobType) : "—"} />
          )}

          <InfoBlock label="Ward" value={job.ward ? WARD_LABELS[job.ward] ?? job.ward : "—"} />

          {isStorm ? null : <InfoBlock label="Garden Type" value={job.gardenType ? GARDEN_TYPE_LABELS[job.gardenType] ?? job.gardenType : "—"} />}

          {job.suburb && <InfoBlock label="Suburb" value={job.suburb} />}
          {job.areaM2 != null && <InfoBlock label="Area" value={`${Number(job.areaM2).toFixed(1)} m²`} />}

          {isStorm ? null : (
            <InfoBlock
              label="Crew"
              value={job.crewStatus === "full" ? "Full crew" : job.crewStatus === "reduced" ? "Reduced crew" : "No crew"}
            />
          )}
        </div>

        {/* Work Types */}
        {isStorm && job.workTypes && job.workTypes.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Work Performed</h3>
            <div className="flex flex-wrap gap-2">
              {job.workTypes.map(t => (
                <span key={t} className="px-2 py-1 bg-gray-100 border border-gray-200 rounded text-xs text-gray-700">
                  {t.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Time breakdown */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Time
          </h3>
          <div className="bg-gray-50 rounded-lg p-3 space-y-2.5">
            {isStorm ? null : <TimeRow label="Scheduled" mins={job.estimatedTimeMins ?? null} />}
            <TimeRow label="Actual" mins={job.actualTimeMins} highlight />
            {!isStorm && variance != null && (
              <div className="pt-1.5 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Variance</span>
                  <span className={`text-sm font-semibold flex items-center gap-1 ${
                    variance > 0 ? "text-red-600" : variance < 0 ? "text-green-600" : "text-gray-500"
                  }`}>
                    {variance > 0 ? (
                      <><ArrowUpRight className="w-3.5 h-3.5" />+{formatMins(variance)} over</>
                    ) : variance < 0 ? (
                      <><ArrowDownRight className="w-3.5 h-3.5" />{formatMins(Math.abs(variance))} under</>
                    ) : (
                      <><Minus className="w-3.5 h-3.5" />On time</>
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Notes */}
        {(job.notes || job.comments) && (
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Worker Notes
            </h3>
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{job.notes || job.comments}</p>
            </div>
          </section>
        )}

        {/* Photos */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5" /> Photos
            {photos.length > 0 && (
              <span className="ml-auto text-xs font-normal text-gray-400 normal-case">{photos.length} photo{photos.length !== 1 ? "s" : ""}</span>
            )}
          </h3>
          {photos.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No photos attached.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {photos.map(photo => (
                <a
                  key={photo.id}
                  href={photo.blobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group relative rounded-lg overflow-hidden border border-gray-200 aspect-square bg-gray-100"
                >
                  <img
                    src={photo.blobUrl}
                    alt={photo.caption ?? "Job photo"}
                    className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                  />
                  {photo.caption && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-2 py-1 text-white text-[10px] truncate">
                      {photo.caption}
                    </div>
                  )}
                  <div className="absolute top-1.5 right-1.5 bg-black/30 rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronRight className="w-3 h-3 text-white" />
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>

        {/* Download PDF */}
        <div className="pt-1 pb-2">
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => window.open(`/api/jobs/${job.id}/pdf`, "_blank")}
          >
            <Download className="w-4 h-4" />
            Download PDF
          </Button>
        </div>
      </div>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-gray-800 font-medium">{value}</p>
    </div>
  );
}

function TimeRow({ label, mins, highlight = false }: { label: string; mins: number | null; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm font-semibold ${highlight ? "text-gray-900" : "text-gray-500"}`}>
        {formatMins(mins)}
      </span>
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function CompletedWorks() {
  const search$ = useSearch();
  const jobParam = new URLSearchParams(search$).get("job");

  const [search, setSearch] = useState("");
  const [teamId, setTeamId] = useState("all");
  const [gardenType, setGardenType] = useState("all");
  const [workSource, setWorkSource] = useState("garden");
  const [dateRange, setDateRange] = useState<"all" | "this-week" | "this-month" | "custom">("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedJob, setSelectedJob] = useState<CompletedWork | null>(null);
  const [sortKey, setSortKey] = useState<string>("scheduledDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // ── CSV export dialog state ───────────────────────────────────────────────
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFrom, setExportFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [exportTo, setExportTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [exportTeamIds, setExportTeamIds] = useState<Set<string>>(new Set());
  const [exportLoading, setExportLoading] = useState(false);

  // Compute from/to from dateRange preset
  const computedFrom = (() => {
    if (dateRange === "this-week") {
      const d = new Date();
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return d.toISOString().slice(0, 10);
    }
    if (dateRange === "this-month") {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    }
    if (dateRange === "custom") return customFrom;
    return "";
  })();
  const computedTo = dateRange === "custom" ? customTo : "";

  // Build query string from filters (debounce search client-side)
  const params = new URLSearchParams({ limit: "500" });
  if (teamId !== "all")     params.set("teamId", teamId);
  if (gardenType !== "all") params.set("gardenType", gardenType);
  if (workSource !== "all") params.set("workSource", workSource);
  if (computedFrom)         params.set("from", computedFrom);
  if (computedTo)           params.set("to", computedTo);

  const { data, isLoading } = useQuery<{ data: CompletedWork[] }>({
    queryKey: ["completed-works", teamId, gardenType, workSource, computedFrom, computedTo],
    queryFn: async () => {
      const res = await fetch(`/api/completed-works?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30_000,
  });

  // Auto-open a job when navigated here with ?job=<id>
  useEffect(() => {
    if (!jobParam || !data?.data) return;
    const match = data.data.find(j => j.id === jobParam);
    if (match) setSelectedJob(match);
  }, [jobParam, data]);

  const { data: teamsData } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["teams"],
    queryFn: async () => {
      const res = await fetch("/api/teams", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60_000,
  });

  const teams = teamsData ?? [];

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const rows = useMemo(() => {
    const all = data?.data ?? [];
    const filtered = search.trim()
      ? (() => {
          const q = search.toLowerCase();
          return all.filter(r =>
            r.assetName?.toLowerCase().includes(q) ||
            r.assetDescription?.toLowerCase().includes(q) ||
            r.suburb?.toLowerCase().includes(q) ||
            r.teamName?.toLowerCase().includes(q) ||
            r.notes?.toLowerCase().includes(q)
          );
        })()
      : all;

    return [...filtered].sort((a, b) => {
      let av: string | number | null = null;
      let bv: string | number | null = null;
      if (sortKey === "scheduledDate")      { av = a.scheduledDate ?? null; bv = b.scheduledDate ?? null; }
      else if (sortKey === "assetName")     { av = a.assetName; bv = b.assetName; }
      else if (sortKey === "assetDescription") { av = a.assetDescription; bv = b.assetDescription; }
      else if (sortKey === "gardenType")    { av = a.gardenType ?? null; bv = b.gardenType ?? null; }
      else if (sortKey === "ward")          { av = a.ward ?? null; bv = b.ward ?? null; }
      else if (sortKey === "teamName")      { av = a.isAllTeams ? "All Teams" : (a.teamName ?? ""); bv = b.isAllTeams ? "All Teams" : (b.teamName ?? ""); }
      else if (sortKey === "estimatedTimeMins") { av = a.estimatedTimeMins ?? null; bv = b.estimatedTimeMins ?? null; }
      else if (sortKey === "actualTimeMins")    { av = a.actualTimeMins; bv = b.actualTimeMins; }
      else if (sortKey === "variance") {
        av = a.actualTimeMins != null && a.estimatedTimeMins != null ? a.actualTimeMins - a.estimatedTimeMins : null;
        bv = b.actualTimeMins != null && b.estimatedTimeMins != null ? b.actualTimeMins - b.estimatedTimeMins : null;
      }
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, search, sortKey, sortDir]);

  const stats = useMemo(() => {
    const uniqueAssets = new Map<string, number | null>();
    let totalActualMins = 0;
    let totalScheduledMins = 0;
    for (const r of rows) {
      if (r.assetId && !uniqueAssets.has(r.assetId)) {
        uniqueAssets.set(r.assetId, r.areaM2 ?? null);
      }
      totalActualMins += r.actualTimeMins ?? 0;
      totalScheduledMins += r.estimatedTimeMins ?? 0;
    }
    const totalAreaM2 = [...uniqueAssets.values()].reduce<number>((s, a) => s + Number(a ?? 0), 0);
    return {
      gardens: uniqueAssets.size,
      hours: totalActualMins / 60,
      areaM2: totalAreaM2,
      varianceMins: totalActualMins - totalScheduledMins,
    };
  }, [rows]);

  function clearFilters() {
    setSearch("");
    setTeamId("all");
    setGardenType("all");
    setDateRange("all");
    setCustomFrom("");
    setCustomTo("");
  }

  const hasFilters = search || teamId !== "all" || gardenType !== "all" || dateRange !== "all";

  async function handleExportCSV() {
    setExportLoading(true);
    try {
      const params = new URLSearchParams({ limit: "10000" });
      if (exportFrom) params.set("from", exportFrom);
      if (exportTo)   params.set("to", exportTo);
      if (workSource !== "all") params.set("workSource", workSource);

      const res = await fetch(`/api/completed-works?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch data");
      const json: { data: CompletedWork[] } = await res.json();

      const allRows = json.data;
      const filtered = exportTeamIds.size > 0
        ? allRows.filter(r => r.teamId != null && exportTeamIds.has(r.teamId))
        : allRows;

      const headers = ["Date", "Source", "Site", "Description", "Specification", "Ward", "Suburb", "Team", "Completed by", "Estimated (min)", "Actual (min)", "Variance (min)", "Status", "Charge ($)", "Notes"];
      const csvRows = filtered.map(r => {
        const est = r.estimatedTimeMins ?? 0;
        const act = r.actualTimeMins ?? est;
        return [
          r.workSource === "storm_patrol" ? (r.completedAt ? r.completedAt.slice(0, 10) : "") : (r.scheduledDate ?? ""),
          r.workSource === "storm_patrol" ? `Storm: ${r.stormName}` : "Maintenance",
          r.assetName ?? "",
          r.assetDescription ?? "",
          r.workSource === "storm_patrol" ? r.workTypes?.join("; ") : (GARDEN_TYPE_LABELS[r.gardenType ?? ""] ?? r.gardenType ?? ""),
          WARD_LABELS[r.ward ?? ""] ?? r.ward ?? "",
          r.suburb ?? "",
          r.isAllTeams ? "All Teams" : (r.teamName ?? ""),
           r.isAllTeams ? "Team sign-off" : (r.assignedUserName || r.workerName || ""),
          est,
          act,
          r.workSource === "storm_patrol" ? 0 : (act - est),
          r.crewStatus || r.outcome || "completed",
          r.chargeCents ? (r.chargeCents / 100).toFixed(2) : "",
          (r.notes || r.comments || "").replace(/"/g, '""'),
        ];
      });

      const csv = [headers, ...csvRows].map(row => row.map(v => `"${v}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const fromLabel = exportFrom || "all";
      const toLabel = exportTo || "all";
      a.download = `completed-works-${fromLabel}-to-${toLabel}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setExportOpen(false);
    } finally {
      setExportLoading(false);
    }
  }

  function openExportDialog() {
    setExportTeamIds(new Set());
    setExportOpen(true);
  }

  function toggleExportTeam(id: string) {
    setExportTeamIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllTeams(checked: boolean) {
    if (checked) {
      setExportTeamIds(new Set());
    }
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-[#f5f7f9]">

        {/* ── Page header ───────────────────────────────────────────────────── */}
        <header className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-10 flex-shrink-0">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Completed Works</h1>
            <p className="text-xs text-gray-400">History of all finished jobs with times, notes and photos</p>
          </div>
          <div className="flex items-center gap-2">
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-gray-500 gap-1.5">
                <X className="w-3.5 h-3.5" /> Clear filters
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={openExportDialog} className="gap-1.5 h-9 text-sm">
              <Download className="w-4 h-4" /> Export CSV
            </Button>
          </div>
        </header>

        {/* ── Summary stat cards ────────────────────────────────────────────── */}
        <div className="px-8 pt-5 pb-1 grid grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
          {/* Gardens Serviced */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#00AECD]/10 flex items-center justify-center flex-shrink-0">
              <MapPin className="w-4 h-4 text-[#00AECD]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Gardens Serviced</p>
              <p className="text-sm font-bold text-gray-900">{isLoading ? "—" : stats.gardens.toLocaleString()}</p>
              <p className="text-[11px] text-gray-400">unique sites in view</p>
            </div>
          </div>
          {/* Total Service Hours */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
              <Clock className="w-4 h-4 text-purple-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Total Service Hours</p>
              <p className="text-sm font-bold text-gray-900">{isLoading ? "—" : `${stats.hours.toFixed(1)} hrs`}</p>
              <p className="text-[11px] text-gray-400">actual time logged</p>
            </div>
          </div>
          {/* Total Area */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
              <Maximize2 className="w-4 h-4 text-green-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Total Area</p>
              <p className="text-sm font-bold text-gray-900">{isLoading ? "—" : `${Number(stats.areaM2).toFixed(1)} m²`}</p>
              <p className="text-[11px] text-gray-400">combined garden area</p>
            </div>
          </div>
          {/* Time Variance */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-start gap-3 min-w-0">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
              !isLoading && stats.varianceMins < 0 ? "bg-green-50" : !isLoading && stats.varianceMins > 0 ? "bg-red-50" : "bg-gray-100"
            }`}>
              {!isLoading && stats.varianceMins < 0
                ? <ArrowDownRight className="w-4 h-4 text-green-600" />
                : !isLoading && stats.varianceMins > 0
                ? <ArrowUpRight className="w-4 h-4 text-red-500" />
                : <Minus className="w-4 h-4 text-gray-400" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Time Variance</p>
              <p className={`text-sm font-bold ${
                isLoading ? "text-gray-900" : stats.varianceMins < 0 ? "text-green-600" : stats.varianceMins > 0 ? "text-red-500" : "text-gray-500"
              }`}>
                {isLoading ? "—" : stats.varianceMins === 0 ? "On time" : `${stats.varianceMins > 0 ? "+" : ""}${formatMins(Math.abs(stats.varianceMins))}`}
              </p>
              <p className="text-[11px] text-gray-400">
                {isLoading ? "" : stats.varianceMins < 0 ? "under scheduled" : stats.varianceMins > 0 ? "over scheduled" : "vs scheduled"}
              </p>
            </div>
          </div>
        </div>

        {/* ── Filter bar ────────────────────────────────────────────────────── */}
        <div className="px-8 py-3 mt-4 border-b bg-white flex flex-wrap gap-2 items-center flex-shrink-0">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <Input
              placeholder="Search site, suburb, notes…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
          <Select value={teamId} onValueChange={setTeamId}>
            <SelectTrigger className="h-9 text-sm w-[160px]">
              <SelectValue placeholder="All teams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All teams</SelectItem>
              {teams.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={workSource} onValueChange={setWorkSource}>
            <SelectTrigger className="h-9 text-sm w-[160px]">
              <SelectValue placeholder="All Sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="garden">Routine Maintenance</SelectItem>
              <SelectItem value="storm_patrol">Storm Patrol</SelectItem>
            </SelectContent>
          </Select>
          <Select value={gardenType} onValueChange={setGardenType}>
            <SelectTrigger className="h-9 text-sm w-[180px]">
              <SelectValue placeholder="All specifications" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All specifications</SelectItem>
              {Object.entries(GARDEN_TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as typeof dateRange)}>
            <SelectTrigger className="h-9 text-sm w-[160px]">
              <SelectValue placeholder="All dates" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All dates</SelectItem>
              <SelectItem value="this-week">This week</SelectItem>
              <SelectItem value="this-month">This month</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          {dateRange === "custom" && (
            <>
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#00AECD] focus:ring-offset-0"
              />
              <span className="text-xs text-gray-400">to</span>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#00AECD] focus:ring-offset-0"
              />
            </>
          )}
        </div>

        {/* ── Table ─────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto p-8">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
              <CheckCircle2 className="w-8 h-8 text-gray-300" />
              <p className="text-sm">No completed works found</p>
              {hasFilters && <p className="text-xs">Try adjusting your filters</p>}
            </div>
          ) : (
            <Card className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                    {[
                      { key: "scheduledDate", label: "Date", align: "left", nowrap: true },
                      { key: "workSource", label: "Source", align: "left", nowrap: true },
                      { key: "assetName", label: "Site", align: "left", nowrap: false },
                      { key: "gardenType", label: "Specification/Work", align: "left", nowrap: true },
                      { key: "teamName", label: "Team", align: "left", nowrap: false },
                      { key: "estimatedTimeMins", label: "Scheduled", align: "right", nowrap: true },
                      { key: "actualTimeMins", label: "Actual", align: "right", nowrap: true },
                      { key: "chargeCents", label: "Charge ($)", align: "right", nowrap: true },
                    ].map(col => {
                      const active = sortKey === col.key;
                      const Icon = active ? (sortDir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
                      return (
                        <th
                          key={col.key}
                          onClick={() => toggleSort(col.key)}
                          className={`px-5 py-3 cursor-pointer select-none hover:text-gray-800 hover:bg-gray-100 transition-colors ${col.nowrap ? "whitespace-nowrap" : ""} ${col.align === "right" ? "text-right" : "text-left"}`}
                        >
                          <span className={`inline-flex items-center gap-1 ${col.align === "right" ? "flex-row-reverse" : ""}`}>
                            {col.label}
                            <Icon className={`w-3 h-3 flex-shrink-0 ${active ? "text-[#00AECD]" : "text-gray-300"}`} />
                          </span>
                        </th>
                      );
                    })}
                    <th className="px-4 py-3 text-right w-20">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map(row => {
                    const isStorm = row.workSource === "storm_patrol";
                    const isSelected = selectedJob?.id === row.id;
                    return (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedJob(isSelected ? null : row)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? "bg-[#00AECD]/10 hover:bg-[#00AECD]/15" : "hover:bg-gray-50"
                        }`}
                      >
                        <td className="px-5 py-3 text-gray-600 whitespace-nowrap text-xs">
                          {formatDate(isStorm ? (row.completedAt ? row.completedAt.slice(0, 10) : "") : (row.scheduledDate ?? ""))}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-xs text-gray-600">
                          {isStorm ? <span className="text-red-500 font-semibold">{row.stormName}</span> : "Routine Maintenance"}
                        </td>
                        <td className="px-5 py-3">
                          <div className="font-medium text-gray-900 truncate max-w-[220px]">{row.assetName ?? "—"}</div>
                          {row.assetDescription && (
                            <div className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[220px]">{row.assetDescription}</div>
                          )}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-xs text-gray-600">
                          {isStorm ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium uppercase tracking-wider text-[10px]">{row.phase}</span>
                              <span className="text-gray-400 truncate max-w-[150px]">{row.workTypes?.join("; ") || "—"}</span>
                            </div>
                          ) : (
                            GARDEN_TYPE_LABELS[row.gardenType ?? ""] ?? row.gardenType ?? "—"
                          )}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-xs text-gray-600">
                          {row.isAllTeams ? "All Teams" : (row.teamName ?? "—")}
                        </td>
                        <td className="px-5 py-3 text-right text-xs text-gray-500 whitespace-nowrap">
                          {isStorm ? "—" : formatMins(row.estimatedTimeMins ?? null)}
                        </td>
                        <td className="px-5 py-3 text-right text-xs font-medium text-gray-900 whitespace-nowrap">
                          {formatMins(row.actualTimeMins)}
                        </td>
                        <td className="px-5 py-3 text-right text-xs text-gray-900 whitespace-nowrap">
                          {row.chargeCents != null ? `$${(row.chargeCents / 100).toFixed(2)}` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            {(row.notes || row.comments) && <FileText className="w-3 h-3 text-amber-400 flex-shrink-0" aria-label="Has notes" />}
                            <button
                              title="Download PDF"
                              onClick={e => { e.stopPropagation(); window.open(`/api/jobs/${row.id}/pdf`, "_blank"); }}
                              className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-[#00AECD] transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selectedJob && (
        <DetailPanel job={selectedJob} onClose={() => setSelectedJob(null)} />
      )}

      {/* ── CSV Export Dialog ──────────────────────────────────────────────── */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="w-4 h-4 text-[#00AECD]" />
              Export Completed Works
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Date range */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Date range</p>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={exportFrom}
                  onChange={e => setExportFrom(e.target.value)}
                  className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#00AECD] focus:ring-offset-0"
                />
                <span className="text-xs text-gray-400 flex-shrink-0">to</span>
                <input
                  type="date"
                  value={exportTo}
                  onChange={e => setExportTo(e.target.value)}
                  className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#00AECD] focus:ring-offset-0"
                />
              </div>
            </div>

            {/* Team selection */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Teams</p>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                {/* All teams option */}
                <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors">
                  <Checkbox
                    id="export-team-all"
                    checked={exportTeamIds.size === 0}
                    onCheckedChange={(checked) => toggleAllTeams(!!checked)}
                  />
                  <span className="text-sm text-gray-700 font-medium">All teams</span>
                </label>
                {teams.map(t => (
                  <label key={t.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors">
                    <Checkbox
                      id={`export-team-${t.id}`}
                      checked={exportTeamIds.has(t.id)}
                      onCheckedChange={() => toggleExportTeam(t.id)}
                    />
                    <span className="text-sm text-gray-700">{t.name}</span>
                  </label>
                ))}
              </div>
              {exportTeamIds.size > 0 && (
                <p className="text-xs text-[#00AECD]">
                  {exportTeamIds.size} team{exportTeamIds.size !== 1 ? "s" : ""} selected
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setExportOpen(false)} disabled={exportLoading}>
              Cancel
            </Button>
            <Button
              onClick={handleExportCSV}
              disabled={exportLoading || !exportFrom || !exportTo}
              className="bg-[#00AECD] hover:bg-[#0099b8] text-white gap-2"
            >
              {exportLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Exporting…</>
              ) : (
                <><Download className="w-4 h-4" /> Export CSV</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
