import { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import {
  useListReactiveJobs, getListReactiveJobsQueryKey,
  useUpdateReactiveJob,
  useListTeams,
  useListAssets,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  Zap, Plus, Search, X, MapPin, Clock, Calendar, CalendarCheck, Trash2,
  ChevronUp, ChevronDown, ChevronsUpDown, FileText, User, Hash, AlertTriangle,
  CheckCircle2, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useSearch } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  ReactiveJobWizard,
  BRAND, NAVY,
  DEFAULT_PRIORITIES, PRIORITY_CONFIG, STATUS_CONFIG,
  type ReactivePriority, type AssetStub, type TeamStub,
} from "@/components/reactive-job-wizard";

type SortCol = "site" | "description" | "priority" | "status" | "scheduledDate" | "team" | "time" | "origin";
type SortDir = "asc" | "desc";

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, standard: 2, routine: 3 };
const STATUS_ORDER: Record<string, number> = { raised: 0, assigned: 1, in_progress: 2, completed: 3, cancelled: 4 };

export default function ReactiveJobs() {
  const [wizardOpen, setWizardOpen] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("new") === "1";
  });
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<"all" | "this_week" | "this_month" | "custom">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedJob, setSelectedJob] = useState<Record<string, unknown> | null>(null);
  const [sortCol, setSortCol] = useState<SortCol>("scheduledDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [editMode, setEditMode] = useState(false);
  const [editFields, setEditFields] = useState<Record<string, unknown>>({});
  const [editSaving, setEditSaving] = useState(false);

  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: teamsData } = useListTeams();
  const { data: assetsData } = useListAssets({ limit: 2000 });
  const { data: jobsData, isLoading } = useListReactiveJobs({
    query: { queryKey: getListReactiveJobsQueryKey() },
  });
  const { data: listSettingsData } = useQuery<{ reactivePriorities?: ReactivePriority[] }>({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const r = await fetch("/api/settings", { credentials: "include" });
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const listPriorities: ReactivePriority[] =
    listSettingsData?.reactivePriorities?.length ? listSettingsData.reactivePriorities : DEFAULT_PRIORITIES;

  // Fetch attachments when a job is selected
  const { data: attachmentsData } = useQuery<{ data: { id: string; blobUrl: string; caption: string | null }[] }>({
    queryKey: ["reactive-job-photos", selectedJob?.id],
    queryFn: async () => {
      const r = await fetch(`/api/reactive-jobs/${selectedJob!.id}/photos`, { credentials: "include" });
      return r.json();
    },
    enabled: !!selectedJob?.id,
  });

  const updateMutation = useUpdateReactiveJob({
    mutation: {
      onSuccess: () => {
        toast({ title: "Status updated" });
        void qc.invalidateQueries({ queryKey: getListReactiveJobsQueryKey() });
        setSelectedJob(prev => prev ? { ...prev, status: updateMutation.variables?.data?.status ?? prev.status } : null);
      },
      onError: (e: unknown) => {
        const msg = e instanceof Error ? e.message : "Unknown error";
        toast({ title: "Update failed", description: msg, variant: "destructive" });
      },
    },
  });

  const teams: TeamStub[] = (teamsData ?? []) as TeamStub[];
  const assets: AssetStub[] = (assetsData?.data ?? []) as AssetStub[];

  // Reset edit state when a different job is opened
  useEffect(() => {
    if (selectedJob) {
      setEditMode(false);
      setEditFields({
        issueType:        (selectedJob.issueType as string) ?? "",
        description:      (selectedJob.description as string) ?? "",
        priority:         (selectedJob.priority as string) ?? "",
        assignedTeamId:   (selectedJob.assignedTeamId as string) ?? "",
        scheduledDate:    (selectedJob.scheduledDate as string) ?? "",
        estimatedTimeMins: selectedJob.estimatedTimeMins != null ? String(selectedJob.estimatedTimeMins) : "",
        notes:            (selectedJob.notes as string) ?? "",
      });
    }
  }, [(selectedJob as any)?.id]);

  const handleEditSave = async () => {
    if (!selectedJob) return;
    setEditSaving(true);
    try {
      const f = editFields;
      const patch: Record<string, unknown> = {
        issueType:        (f.issueType as string) || null,
        description:      (f.description as string) || null,
        priority:         (f.priority as string) || null,
        assignedTeamId:   (f.assignedTeamId as string) || null,
        scheduledDate:    (f.scheduledDate as string) || null,
        estimatedTimeMins: (f.estimatedTimeMins as string) ? parseInt(f.estimatedTimeMins as string) : null,
        notes:            (f.notes as string) || null,
      };
      await (updateMutation.mutateAsync as any)({ id: selectedJob.id, data: patch });
      qc.invalidateQueries({ queryKey: getListReactiveJobsQueryKey() });
      setSelectedJob(prev => prev ? { ...prev, ...patch } : null);
      setEditMode(false);
      toast({ title: "Changes saved" });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  };

  const getTeamName = (id?: string | null) => {
    if (!id) return "Unassigned";
    return teams.find(t => t.id === id)?.name ?? "Unassigned";
  };

  const getSiteName = (job: Record<string, unknown>) => {
    if (job.assetId) {
      return assets.find(a => a.id === (job.assetId as string))?.name ?? "—";
    }
    return (job.location as string | null) ?? "—";
  };

  const searchStr = useSearch();
  const needsReassignmentParam = useMemo(() => new URLSearchParams(searchStr).get("needsReassignment") === "1", [searchStr]);

  const allJobs = (jobsData?.data ?? []) as unknown as Record<string, unknown>[];

  const filteredSortedJobs = useMemo(() => {
    let jobs = allJobs;
    if (overdueOnly) {
      jobs = jobs.filter(j =>
        j.scheduledDate != null &&
        (j.scheduledDate as string) <= TODAY &&
        !["completed", "cancelled"].includes(j.status as string),
      );
    }
    if (statusFilter !== "all") jobs = jobs.filter(j => j.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      jobs = jobs.filter(j =>
        getSiteName(j).toLowerCase().includes(q) ||
        String(j.issueType ?? "").toLowerCase().includes(q) ||
        String(j.description ?? "").toLowerCase().includes(q) ||
        getTeamName(j.assignedTeamId as string | null).toLowerCase().includes(q),
      );
    }
    if (teamFilter !== "all") {
      jobs = jobs.filter(j => (j.assignedTeamId as string | null) === teamFilter);
    }
    if (dateFilter !== "all") {
      const today = new Date();
      const monday = new Date(today);
      monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      monday.setHours(0, 0, 0, 0);
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      jobs = jobs.filter(j => {
        const d = j.scheduledDate as string | null;
        if (!d) return false;
        const date = new Date(d + "T00:00:00");
        if (dateFilter === "this_week") return date >= monday;
        if (dateFilter === "this_month") return date >= monthStart;
        if (dateFilter === "custom") {
          if (dateFrom && date < new Date(dateFrom)) return false;
          if (dateTo && date > new Date(dateTo)) return false;
          return true;
        }
        return true;
      });
    }

    return [...jobs].sort((a, b) => {
      let cmp = 0;
      switch (sortCol) {
        case "site":
          cmp = getSiteName(a).localeCompare(getSiteName(b));
          break;
        case "description":
          cmp = String(a.issueType ?? "").localeCompare(String(b.issueType ?? ""));
          break;
        case "priority": {
          const pa = PRIORITY_ORDER[a.priority as string] ?? 99;
          const pb = PRIORITY_ORDER[b.priority as string] ?? 99;
          cmp = pa - pb;
          break;
        }
        case "status": {
          const sa = STATUS_ORDER[a.status as string] ?? 99;
          const sb = STATUS_ORDER[b.status as string] ?? 99;
          cmp = sa - sb;
          break;
        }
        case "scheduledDate":
          cmp = String(a.scheduledDate ?? "9999").localeCompare(String(b.scheduledDate ?? "9999"));
          break;
        case "team":
          cmp = getTeamName(a.assignedTeamId as string | null).localeCompare(
            getTeamName(b.assignedTeamId as string | null),
          );
          break;
        case "time": {
          const ta = (a.estimatedTimeMins as number | null) ?? 0;
          const tb = (b.estimatedTimeMins as number | null) ?? 0;
          cmp = ta - tb;
          break;
        }
        case "origin":
          cmp = String(a.origin ?? "").localeCompare(String(b.origin ?? ""));
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [allJobs, statusFilter, search, sortCol, sortDir, assets, teams]);

  const TODAY = new Date().toISOString().slice(0, 10);
  const needsReassignmentJobs = useMemo(
    () => allJobs.filter(j =>
      j.scheduledDate != null &&
      (j.scheduledDate as string) <= TODAY &&
      !["completed", "cancelled"].includes(j.status as string),
    ),
    [allJobs],
  );

  const reactiveBaseFiltered = useMemo(() => {
    let jobs = allJobs;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      jobs = jobs.filter(j =>
        getSiteName(j).toLowerCase().includes(q) ||
        String(j.issueType ?? "").toLowerCase().includes(q) ||
        String(j.description ?? "").toLowerCase().includes(q) ||
        getTeamName(j.assignedTeamId as string | null).toLowerCase().includes(q),
      );
    }
    if (teamFilter !== "all") {
      jobs = jobs.filter(j => (j.assignedTeamId as string | null) === teamFilter);
    }
    if (dateFilter !== "all") {
      const today = new Date();
      const monday = new Date(today);
      monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      monday.setHours(0, 0, 0, 0);
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      jobs = jobs.filter(j => {
        const d = j.scheduledDate as string | null;
        if (!d) return false;
        const date = new Date(d + "T00:00:00");
        if (dateFilter === "this_week") return date >= monday;
        if (dateFilter === "this_month") return date >= monthStart;
        if (dateFilter === "custom") {
          if (dateFrom && date < new Date(dateFrom)) return false;
          if (dateTo && date > new Date(dateTo)) return false;
          return true;
        }
        return true;
      });
    }
    return jobs;
  }, [allJobs, search, teamFilter, dateFilter, dateFrom, dateTo]);

  const statusCounts = useMemo(
    () => ({
      all: reactiveBaseFiltered.length,
      raised: reactiveBaseFiltered.filter(j => j.status === "raised").length,
      assigned: reactiveBaseFiltered.filter(j => j.status === "assigned").length,
      in_progress: reactiveBaseFiltered.filter(j => j.status === "in_progress").length,
      completed: reactiveBaseFiltered.filter(j => j.status === "completed").length,
      cancelled: reactiveBaseFiltered.filter(j => j.status === "cancelled").length,
    }),
    [reactiveBaseFiltered],
  );

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: SortCol }) => {
    if (sortCol !== col) return <ChevronsUpDown className="w-3 h-3 text-gray-300 ml-1 inline" />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3 h-3 text-[#00AECD] ml-1 inline" />
      : <ChevronDown className="w-3 h-3 text-[#00AECD] ml-1 inline" />;
  };

  if (wizardOpen) {
    return (
      <ReactiveJobWizard
        teamsData={teams}
        assetsData={assets}
        onClose={() => setWizardOpen(false)}
        onPublished={() => { setWizardOpen(false); void qc.invalidateQueries({ queryKey: getListReactiveJobsQueryKey() }); }}
      />
    );
  }

  function exportCSV() {
    const rows = filteredSortedJobs.map(j => ({
      Site:             getSiteName(j),
      "Issue Type":     j.issueType ?? "",
      Description:      j.description ?? "",
      Priority:         PRIORITY_CONFIG[j.priority as string]?.label ?? (j.priority ?? ""),
      Status:           STATUS_CONFIG[j.status as string]?.label ?? (j.status ?? ""),
      "Scheduled Date": j.scheduledDate ? format(new Date((j.scheduledDate as string) + "T00:00:00"), "d MMM yyyy") : "",
      Team:             getTeamName(j.assignedTeamId as string | null),
      "Est. Time (min)": j.estimatedTimeMins ?? "",
      Origin:           j.origin ?? "",
    }));
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [headers.join(","), ...rows.map(r => headers.map(h => escape(r[h as keyof typeof r])).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "unscheduled-work.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f5f7f9]">
      {/* Header */}
      <header
        className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-10 flex-shrink-0"
        style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
      >
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2" style={{ color: NAVY }}>
            Unscheduled Work
          </h1>
          <p className="text-xs text-gray-400">Ad-hoc requests, emergency work</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={() => setWizardOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
            style={{ background: BRAND }}
          >
            <Plus className="w-4 h-4" />
            New Unscheduled Work
          </button>
        </div>
      </header>

      {/* ── Stat cards ── */}
      <div className="px-8 pt-5 pb-5 grid grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${BRAND}1a` }}>
            <Zap className="w-4 h-4" style={{ color: BRAND }} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide leading-tight">Total Jobs</p>
            <p className="text-xl font-black mt-0.5" style={{ color: NAVY }}>{statusCounts.all}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#fef3c7" }}>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide leading-tight">Draft</p>
            <p className="text-xl font-black mt-0.5" style={{ color: NAVY }}>{statusCounts.raised}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#eff6ff" }}>
            <Calendar className="w-4 h-4 text-blue-500" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide leading-tight">Assigned</p>
            <p className="text-xl font-black mt-0.5" style={{ color: NAVY }}>{statusCounts.assigned}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#dcfce7" }}>
            <CheckCircle2 className="w-4 h-4 text-green-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide leading-tight">Completed</p>
            <p className="text-xl font-black mt-0.5" style={{ color: NAVY }}>{statusCounts.completed}</p>
          </div>
        </div>
      </div>

      {/* Needs-reassignment banner — jobs with a past/today date still active */}
      {needsReassignmentJobs.length > 0 && (
        <div className="mx-8 mb-4 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3.5 flex items-center gap-4 flex-shrink-0">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">
              {needsReassignmentJobs.length} job{needsReassignmentJobs.length !== 1 ? "s" : ""} due today or overdue — action needed
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              These unscheduled jobs have a scheduled date in the past and haven't been completed or cancelled yet.
            </p>
          </div>
          {overdueOnly ? (
            <button
              onClick={() => setOverdueOnly(false)}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-400 text-amber-700 bg-amber-100 hover:bg-amber-200 transition-colors whitespace-nowrap flex items-center gap-1.5"
            >
              <span>Overdue filter active</span>
              <span className="font-bold">×</span>
            </button>
          ) : (
            <button
              onClick={() => setOverdueOnly(true)}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-amber-500 hover:bg-amber-600 transition-colors whitespace-nowrap"
            >
              Show overdue
            </button>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border-b px-8 py-3 flex items-center gap-3 flex-shrink-0 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="pl-8 h-9 text-sm bg-white w-44"
            />
          </div>
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="w-[150px] h-9 text-sm bg-white">
              <SelectValue placeholder="All Teams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Teams</SelectItem>
              {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={dateFilter} onValueChange={v => setDateFilter(v as typeof dateFilter)}>
            <SelectTrigger className="w-[150px] h-9 text-sm bg-white">
              <SelectValue placeholder="All dates" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All dates</SelectItem>
              <SelectItem value="this_week">This week</SelectItem>
              <SelectItem value="this_month">This month</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          {dateFilter === "custom" && (
            <>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#00AECD] focus:ring-offset-0"
              />
              <span className="text-xs text-gray-400">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#00AECD] focus:ring-offset-0"
              />
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : filteredSortedJobs.length === 0 ? (
          <div className="py-20 text-center bg-white rounded-2xl border border-dashed border-gray-200">
            <Zap className="w-10 h-10 text-gray-100 mx-auto mb-3" />
            <p className="text-gray-500 font-semibold">No unscheduled work</p>
            <p className="text-sm text-gray-400 mt-1">
              {statusFilter !== "all" || search ? "Try adjusting your filters" : "Click 'New Unscheduled Work' to log one"}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                {([
                  { col: "site",          label: "Site" },
                  { col: "description",   label: "Job details" },
                  { col: "priority",      label: "Priority" },
                  { col: "status",        label: "Status" },
                  { col: "scheduledDate", label: "Scheduled" },
                  { col: "team",          label: "Team" },
                  { col: "time",          label: "Time (min)" },
                  { col: "origin",        label: "Raised by" },
                ] as { col: SortCol; label: string }[]).map(({ col, label }) => (
                  <th
                    key={col}
                    onClick={() => handleSort(col)}
                    className="sticky top-0 z-10 bg-gray-50 text-left px-4 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-100 select-none whitespace-nowrap"
                  >
                    {label}<SortIcon col={col} />
                  </th>
                ))}
                <th className="sticky top-0 z-10 bg-gray-50 px-4 py-3 border-b border-gray-100 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSortedJobs.map((job, idx) => {
                const pEntry = listPriorities.find(p => p.id === (job.priority as string));
                const pConf = pEntry ?? PRIORITY_CONFIG[job.priority as string] ?? PRIORITY_CONFIG.medium;
                const sConf = STATUS_CONFIG[job.status as string] ?? STATUS_CONFIG.raised;
                const site = getSiteName(job);
                const rowBg = idx % 2 === 0 ? "bg-white" : "bg-gray-50/60";

                return (
                  <tr
                    key={job.id as string}
                    onClick={() => setSelectedJob(job)}
                    className={`${rowBg} cursor-pointer hover:bg-[#00AECD]/5 transition-colors`}
                  >
                    {/* Site */}
                    <td className="px-4 py-3 max-w-[180px] border-b border-gray-100">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 text-gray-300 flex-shrink-0" />
                        <span className="font-semibold text-gray-800 truncate" title={site}>{site}</span>
                      </div>
                      {(() => {
                        const desc = job.assetId
                          ? assets.find(a => a.id === (job.assetId as string))?.description
                          : null;
                        return desc
                          ? <p className="text-[10px] text-gray-400 truncate mt-0.5 pl-4">{desc}</p>
                          : null;
                      })()}
                    </td>

                    {/* Description */}
                    <td className="px-4 py-3 text-gray-600 max-w-[220px] border-b border-gray-100">
                      <p className="font-medium text-gray-800 truncate">{job.issueType as string}</p>
                      <p className="text-[11px] text-gray-400 truncate">{job.description as string}</p>
                    </td>

                    {/* Priority */}
                    <td className="px-4 py-3 border-b border-gray-100">
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap"
                        style={{ color: pConf.color, background: pConf.bg }}
                      >
                        {pConf.label}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 border-b border-gray-100">
                      {(() => {
                        const StatusIcon = sConf.icon;
                        return (
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 w-fit uppercase tracking-wider whitespace-nowrap"
                            style={{ background: sConf.bg, color: sConf.color }}
                          >
                            <StatusIcon className="w-3 h-3" />
                            {sConf.label}
                          </span>
                        );
                      })()}
                    </td>

                    {/* Scheduled */}
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-[12px] border-b border-gray-100">
                      {(job.scheduledDate as string | null)
                        ? format(new Date((job.scheduledDate as string) + "T00:00:00"), "d MMM yyyy")
                        : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Team */}
                    <td className="px-4 py-3 text-gray-600 text-[12px] whitespace-nowrap border-b border-gray-100">
                      {getTeamName(job.assignedTeamId as string | null)}
                    </td>

                    {/* Time */}
                    <td className="px-4 py-3 text-gray-600 text-[12px] tabular-nums border-b border-gray-100">
                      {(job.estimatedTimeMins as number | null) ?? <span className="text-gray-300">—</span>}
                    </td>

                    {/* Origin */}
                    <td className="px-4 py-3 border-b border-gray-100">
                      {(job.raisedByName as string | null)
                        ? <span className="text-[12px] text-gray-600 whitespace-nowrap">{job.raisedByName as string}</span>
                        : <span className="text-gray-300 text-[12px]">—</span>}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 border-b border-gray-100" onClick={e => e.stopPropagation()}>
                      {job.status !== "completed" && job.status !== "cancelled" && (
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            variant="ghost" size="sm"
                            className="h-8 w-8 p-0 hover:bg-[#e0f7fb]"
                            style={{ color: "#2563eb" }}
                            title="Open to schedule"
                            onClick={() => setSelectedJob(job)}>
                            <CalendarCheck className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            className="h-8 w-8 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50"
                            title="Cancel job"
                            onClick={() => updateMutation.mutate({ id: job.id as string, data: { status: "cancelled" } })}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredSortedJobs.length > 0 && (
            <p className="text-center text-[11px] text-gray-400 py-3 border-t border-gray-100">
              {filteredSortedJobs.length} job{filteredSortedJobs.length !== 1 ? "s" : ""}
            </p>
          )}
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selectedJob && (() => {
        const pEntry = listPriorities.find(p => p.id === (selectedJob.priority as string));
        const pConf = pEntry ?? PRIORITY_CONFIG[selectedJob.priority as string] ?? PRIORITY_CONFIG.medium;
        const sConf = STATUS_CONFIG[selectedJob.status as string] ?? STATUS_CONFIG.raised;
        const site = getSiteName(selectedJob);
        const photos = attachmentsData?.data ?? [];

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">

              {/* Modal header */}
              <div className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0">
                <div className="flex items-start gap-2 min-w-0">
                  <Zap className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <h2 className="font-bold text-gray-900 truncate leading-tight">{site || "Unknown site"}</h2>
                    {(() => {
                      const desc = (selectedJob.assetDescription as string | null)
                        ?? assets.find(a => a.id === (selectedJob.assetId as string))?.description
                        ?? null;
                      return desc
                        ? <p className="text-[11px] text-gray-400 truncate mt-0.5">{desc}</p>
                        : null;
                    })()}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  {(selectedJob.status as string) !== "completed" && (selectedJob.status as string) !== "cancelled" && (
                    <button
                      onClick={() => setEditMode(v => !v)}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors"
                      style={editMode
                        ? { borderColor: "#dc2626", color: "#dc2626", background: "#fef2f2" }
                        : { borderColor: "#e5e7eb", color: "#6b7280", background: "white" }}>
                      {editMode ? "Cancel" : "Edit"}
                    </button>
                  )}
                  <button onClick={() => { setSelectedJob(null); setEditMode(false); }} className="text-gray-300 hover:text-gray-500">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">

                {editMode ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold block mb-1">Issue Type</label>
                        <input value={editFields.issueType as string}
                          onChange={e => setEditFields(p => ({ ...p, issueType: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] bg-white" />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold block mb-1">Description</label>
                        <textarea value={editFields.description as string}
                          onChange={e => setEditFields(p => ({ ...p, description: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] bg-white resize-none"
                          rows={3} />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold block mb-1">Priority</label>
                        <select value={editFields.priority as string}
                          onChange={e => setEditFields(p => ({ ...p, priority: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] bg-white">
                          {listPriorities.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold block mb-1">Team</label>
                        <select value={editFields.assignedTeamId as string}
                          onChange={e => setEditFields(p => ({ ...p, assignedTeamId: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] bg-white">
                          <option value="">— Unassigned —</option>
                          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold block mb-1">Scheduled Date</label>
                        <input type="date" value={editFields.scheduledDate as string}
                          onChange={e => setEditFields(p => ({ ...p, scheduledDate: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] bg-white" />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold block mb-1">Est. Time (mins)</label>
                        <input type="number" value={editFields.estimatedTimeMins as string}
                          onChange={e => setEditFields(p => ({ ...p, estimatedTimeMins: e.target.value }))}
                          min="0" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] bg-white" />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold block mb-1">Notes</label>
                        <textarea value={editFields.notes as string}
                          onChange={e => setEditFields(p => ({ ...p, notes: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] bg-white resize-none"
                          rows={3} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                {/* Badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1"
                    style={{ background: sConf.bg, color: sConf.color }}
                  >
                    {(() => { const I = sConf.icon; return <I className="w-3 h-3" />; })()}
                    {sConf.label}
                  </span>
                  <span
                    className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider"
                    style={{ color: pConf.color, background: pConf.bg }}
                  >
                    {pConf.label}
                  </span>
                  <div className="ml-auto text-right">
                    {(selectedJob.raisedByName as string | null) && (
                      <p className="text-[10px] text-gray-400">
                        Raised by: {selectedJob.raisedByName as string}
                      </p>
                    )}
                    {(selectedJob.raisedAt as string | null) && (
                      <p className="text-[10px] text-gray-400">
                        {format(new Date(selectedJob.raisedAt as string), "EEEE d MMM yyyy")}
                      </p>
                    )}
                  </div>
                </div>

                {/* Description */}
                {(selectedJob.description as string) && (
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5 font-semibold">Description</p>
                    <p className="text-sm text-gray-700 leading-relaxed">{selectedJob.description as string}</p>
                  </div>
                )}

                {/* Key details grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-xl p-3.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <MapPin className="w-3.5 h-3.5 text-gray-400" />
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Site</p>
                    </div>
                    <p className="text-sm font-semibold text-gray-800">{site}</p>
                    {(selectedJob.location as string | null) && (selectedJob.assetId as string | null) && (
                      <p className="text-[11px] text-gray-400 mt-0.5">{selectedJob.location as string}</p>
                    )}
                  </div>

                  <div className="bg-gray-50 rounded-xl p-3.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <User className="w-3.5 h-3.5 text-gray-400" />
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Team</p>
                    </div>
                    <p className="text-sm font-semibold text-gray-800">
                      {getTeamName(selectedJob.assignedTeamId as string | null)}
                    </p>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-3.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Scheduled</p>
                    </div>
                    <p className="text-sm font-semibold text-gray-800">
                      {(selectedJob.scheduledDate as string | null)
                        ? format(new Date((selectedJob.scheduledDate as string) + "T00:00:00"), "EEE d MMM yyyy")
                        : "Not scheduled"}
                    </p>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-3.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Time</p>
                    </div>
                    <p className="text-sm font-semibold text-gray-800">
                      {(selectedJob.estimatedTimeMins as number | null)
                        ? `${selectedJob.estimatedTimeMins} min`
                        : "—"}
                    </p>
                  </div>
                </div>

                {/* Notes */}
                {(selectedJob.notes as string | null) && (
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5 font-semibold">Notes</p>
                    <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 rounded-xl p-3.5">
                      {selectedJob.notes as string}
                    </p>
                  </div>
                )}

                {/* Attachments */}
                {photos.length > 0 && (
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2 font-semibold">
                      Attachments ({photos.length})
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {photos.map(p => {
                        const isImage = /\.(jpe?g|png|webp|gif|heic)$/i.test(p.blobUrl);
                        return isImage ? (
                          <a key={p.id} href={p.blobUrl} target="_blank" rel="noopener noreferrer">
                            <img
                              src={p.blobUrl}
                              alt={p.caption ?? "attachment"}
                              className="w-full h-24 object-cover rounded-xl border border-gray-100 hover:opacity-90 transition-opacity"
                            />
                          </a>
                        ) : (
                          <a
                            key={p.id}
                            href={p.blobUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex flex-col items-center justify-center h-24 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors gap-1 px-2"
                          >
                            <FileText className="w-6 h-6 text-gray-400" />
                            <span className="text-[10px] text-gray-500 text-center truncate w-full text-center">
                              {p.caption ?? "Document"}
                            </span>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
                  </>
                )}

                {/* Status update */}
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2 font-semibold">Update Status</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(["raised", "assigned", "in_progress", "completed", "cancelled"] as const).map(s => {
                      const conf = STATUS_CONFIG[s];
                      const SIcon = conf.icon;
                      const isActive = selectedJob.status === s;
                      const canAssign = !!(selectedJob.assignedTeamId) && !!(selectedJob.scheduledDate);
                      const isBlocked = s === "assigned" && !canAssign;
                      return (
                        <button
                          key={s}
                          title={isBlocked ? "Assign a team and scheduled date before marking as Assigned" : undefined}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${isActive ? "text-white border-transparent" : isBlocked ? "border-gray-100 text-gray-300 cursor-not-allowed" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                          style={isActive ? { background: BRAND } : {}}
                          onClick={() => {
                            if (isBlocked) return;
                            updateMutation.mutate({ id: selectedJob.id as string, data: { status: s } });
                            setSelectedJob(prev => prev ? { ...prev, status: s } : null);
                          }}
                          disabled={updateMutation.isPending || isActive || isBlocked}
                        >
                          <SIcon className="w-4 h-4" />
                          {conf.label}
                        </button>
                      );
                    })}
                  </div>
                  {!(selectedJob.assignedTeamId) || !(selectedJob.scheduledDate) ? (
                    <p className="text-[10px] text-amber-500 mt-2 flex items-center gap-1">
                      <span>⚠</span> Set a team and scheduled date to enable "Assigned"
                    </p>
                  ) : null}
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-2 flex-shrink-0">
                {editMode ? (
                  <>
                    <button
                      onClick={() => setEditMode(false)}
                      className="px-4 py-2 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors">
                      Cancel
                    </button>
                    <button
                      onClick={handleEditSave}
                      disabled={editSaving}
                      className="px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-colors"
                      style={{ background: BRAND }}>
                      {editSaving ? "Saving…" : "Save changes"}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setSelectedJob(null)}
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
