import React, { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { Search, X, Clock, Camera, FileText, ChevronRight, CheckCircle2, ArrowUpRight, ArrowDownRight, Minus, ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ─── types ───────────────────────────────────────────────────────────────────

interface CompletedWork {
  id: string;
  jobType: string;
  scheduledDate: string;
  completedAt: string | null;
  actualTimeMins: number | null;
  estimatedTimeMins: number | null;
  notes: string | null;
  crewStatus: string;
  isAllTeams: boolean;
  teamId: string | null;
  teamName: string | null;
  assetId: string | null;
  assetName: string | null;
  assetDescription: string | null;
  gardenType: string | null;
  ward: string | null;
  suburb: string | null;
  areaM2: number | null;
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
  const { data: photosData } = useQuery<{ data: Photo[] }>({
    queryKey: ["job-photos", job.id],
    queryFn: async () => {
      const res = await fetch(`/api/jobs/${job.id}/photos`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const photos = photosData?.data ?? [];
  const variance = varianceMins(job.actualTimeMins, job.estimatedTimeMins);

  return (
    <div className="w-[420px] flex-shrink-0 flex flex-col h-full bg-white border-l border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 bg-gray-50">
        <div className="flex-1 min-w-0 pr-3">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
            <span className="text-xs font-medium text-green-700 uppercase tracking-wide">Completed</span>
          </div>
          <h2 className="text-base font-semibold text-gray-900 leading-tight truncate">
            {job.assetName ?? "Unknown Site"}
          </h2>
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
          <InfoBlock label="Scheduled Date" value={formatDate(job.scheduledDate)} />
          <InfoBlock label="Completed" value={formatDateTime(job.completedAt)} />
          <InfoBlock label="Team" value={job.isAllTeams ? "All Teams" : (job.teamName ?? "—")} />
          <InfoBlock label="Job Type" value={JOB_TYPE_LABELS[job.jobType] ?? job.jobType} />
          <InfoBlock label="Ward" value={job.ward ? WARD_LABELS[job.ward] ?? job.ward : "—"} />
          <InfoBlock label="Garden Type" value={job.gardenType ? GARDEN_TYPE_LABELS[job.gardenType] ?? job.gardenType : "—"} />
          {job.suburb && <InfoBlock label="Suburb" value={job.suburb} />}
          {job.areaM2 != null && <InfoBlock label="Area" value={`${job.areaM2.toLocaleString()} m²`} />}
          <InfoBlock
            label="Team"
            value={job.crewStatus === "full" ? "Full crew" : job.crewStatus === "reduced" ? "Reduced crew" : "No crew"}
          />
        </div>

        {/* Time breakdown */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Time
          </h3>
          <div className="bg-gray-50 rounded-lg p-3 space-y-2.5">
            <TimeRow label="Scheduled" mins={job.estimatedTimeMins} />
            <TimeRow label="Actual" mins={job.actualTimeMins} highlight />
            {variance != null && (
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
        {job.notes && (
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Worker Notes
            </h3>
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{job.notes}</p>
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
      </div>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
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
  const [ward, setWard] = useState("all");
  const [gardenType, setGardenType] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedJob, setSelectedJob] = useState<CompletedWork | null>(null);
  const [sortKey, setSortKey] = useState<string>("scheduledDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Build query string from filters (debounce search client-side)
  const params = new URLSearchParams({ limit: "500" });
  if (teamId !== "all")     params.set("teamId", teamId);
  if (ward !== "all")       params.set("ward", ward);
  if (gardenType !== "all") params.set("gardenType", gardenType);
  if (from)                 params.set("from", from);
  if (to)                   params.set("to", to);

  const { data, isLoading } = useQuery<{ data: CompletedWork[] }>({
    queryKey: ["completed-works", teamId, ward, gardenType, from, to],
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
      if (sortKey === "scheduledDate")      { av = a.scheduledDate; bv = b.scheduledDate; }
      else if (sortKey === "assetName")     { av = a.assetName; bv = b.assetName; }
      else if (sortKey === "assetDescription") { av = a.assetDescription; bv = b.assetDescription; }
      else if (sortKey === "gardenType")    { av = a.gardenType; bv = b.gardenType; }
      else if (sortKey === "ward")          { av = a.ward; bv = b.ward; }
      else if (sortKey === "teamName")      { av = a.isAllTeams ? "All Teams" : (a.teamName ?? ""); bv = b.isAllTeams ? "All Teams" : (b.teamName ?? ""); }
      else if (sortKey === "estimatedTimeMins") { av = a.estimatedTimeMins; bv = b.estimatedTimeMins; }
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

  function clearFilters() {
    setSearch("");
    setTeamId("all");
    setWard("all");
    setGardenType("all");
    setFrom("");
    setTo("");
  }

  const hasFilters = search || teamId !== "all" || ward !== "all" || gardenType !== "all" || from || to;

  return (
    <div className="flex h-[calc(100vh-0px)] overflow-hidden">
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Page header */}
        <div className="px-8 pt-7 pb-4 bg-white border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Completed Works</h1>
              <p className="text-sm text-gray-500 mt-0.5">History of all finished jobs with times, notes and photos</p>
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-gray-500 gap-1.5">
                <X className="w-3.5 h-3.5" /> Clear filters
              </Button>
            )}
          </div>

          {/* Filter bar */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <Input
                placeholder="Search site, suburb, notes…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>

            {/* Team */}
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

            {/* Ward */}
            <Select value={ward} onValueChange={setWard}>
              <SelectTrigger className="h-9 text-sm w-[140px]">
                <SelectValue placeholder="All wards" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All wards</SelectItem>
                <SelectItem value="eastern">Eastern</SelectItem>
                <SelectItem value="northern">Northern</SelectItem>
                <SelectItem value="western">Western</SelectItem>
              </SelectContent>
            </Select>

            {/* Garden type */}
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

            {/* Date range */}
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#00AECD] focus:ring-offset-0"
            />
            <span className="text-xs text-gray-400">to</span>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#00AECD] focus:ring-offset-0"
            />
          </div>
        </div>

        {/* Results count */}
        <div className="px-8 py-2.5 bg-white border-b border-gray-100 flex-shrink-0">
          <p className="text-xs text-gray-400">
            {isLoading ? "Loading…" : `${rows.length.toLocaleString()} result${rows.length !== 1 ? "s" : ""}`}
          </p>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
              <CheckCircle2 className="w-8 h-8 text-gray-300" />
              <p className="text-sm">No completed works found</p>
              {hasFilters && <p className="text-xs">Try adjusting your filters</p>}
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 border-b border-gray-200">
                  {[
                    { key: "scheduledDate", label: "Date", align: "left", nowrap: true },
                    { key: "assetName", label: "Site", align: "left", nowrap: false },
                    { key: "assetDescription", label: "Description", align: "left", nowrap: false },
                    { key: "gardenType", label: "Specification", align: "left", nowrap: true },
                    { key: "ward", label: "Ward", align: "left", nowrap: false },
                    { key: "teamName", label: "Team", align: "left", nowrap: false },
                    { key: "estimatedTimeMins", label: "Scheduled", align: "right", nowrap: true },
                    { key: "actualTimeMins", label: "Actual", align: "right", nowrap: true },
                    { key: "variance", label: "+/−", align: "right", nowrap: true },
                  ].map(col => {
                    const active = sortKey === col.key;
                    const Icon = active ? (sortDir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
                    return (
                      <th
                        key={col.key}
                        onClick={() => toggleSort(col.key)}
                        className={`px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-800 hover:bg-gray-100 transition-colors ${col.nowrap ? "whitespace-nowrap" : ""} ${col.align === "right" ? "text-right" : "text-left"}`}
                      >
                        <span className={`inline-flex items-center gap-1 ${col.align === "right" ? "flex-row-reverse" : ""}`}>
                          {col.label}
                          <Icon className={`w-3 h-3 flex-shrink-0 ${active ? "text-[#00AECD]" : "text-gray-300"}`} />
                        </span>
                      </th>
                    );
                  })}
                  <th className="px-4 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(row => {
                  const v = varianceMins(row.actualTimeMins, row.estimatedTimeMins);
                  const isSelected = selectedJob?.id === row.id;
                  return (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedJob(isSelected ? null : row)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-[#00AECD]/10 hover:bg-[#00AECD]/15"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap text-xs">
                        {formatDate(row.scheduledDate)}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-gray-900 truncate max-w-[220px]">{row.assetName ?? "—"}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="text-xs text-gray-600 truncate max-w-[260px]">{row.assetDescription ?? "—"}</div>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="text-xs text-gray-600">
                          {GARDEN_TYPE_LABELS[row.gardenType ?? ""] ?? row.gardenType ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="text-xs text-gray-600">
                          {row.ward ? WARD_LABELS[row.ward] : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="text-xs text-gray-600">
                          {row.isAllTeams ? "All Teams" : (row.teamName ?? "—")}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-gray-500 whitespace-nowrap">
                        {formatMins(row.estimatedTimeMins)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs font-medium text-gray-900 whitespace-nowrap">
                        {formatMins(row.actualTimeMins)}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {v == null ? (
                          <span className="text-xs text-gray-300">—</span>
                        ) : v === 0 ? (
                          <span className="text-xs text-gray-400">0</span>
                        ) : v > 0 ? (
                          <span className="text-xs font-medium text-red-600">+{formatMins(v)}</span>
                        ) : (
                          <span className="text-xs font-medium text-green-600">−{formatMins(Math.abs(v))}</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-1 justify-end">
                          {row.notes && <FileText className="w-3 h-3 text-amber-500" title="Has notes" />}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selectedJob && (
        <DetailPanel job={selectedJob} onClose={() => setSelectedJob(null)} />
      )}
    </div>
  );
}
