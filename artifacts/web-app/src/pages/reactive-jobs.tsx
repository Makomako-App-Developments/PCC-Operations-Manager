import { useState, useMemo, useEffect, useRef } from "react";
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSearch } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { AuthenticatedImage, AuthenticatedMediaLink } from "@/components/authenticated-image";
import { isImageAttachment } from "@/lib/attachment-media";

export type ReactiveJobAttachment = {
  id: string;
  blobUrl: string;
  contentType: string | null;
  caption: string | null;
};

export function ReactiveJobAttachments({ attachments }: { attachments: ReactiveJobAttachment[] }) {
  if (attachments.length === 0) return null;

  return (
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2 font-semibold">
        Attachments ({attachments.length})
      </p>
      <div className="grid grid-cols-3 gap-2">
        {attachments.map(p => {
          const isImage = isImageAttachment(p.contentType);
          return isImage ? (
            <AuthenticatedMediaLink key={p.id} src={p.blobUrl} unavailableMessage="Photo unavailable" className="block w-full">
              <AuthenticatedImage
                src={p.blobUrl}
                alt={p.caption ?? "attachment"}
                className="w-full h-24 object-cover rounded-xl border border-gray-100 hover:opacity-90 transition-opacity"
              />
            </AuthenticatedMediaLink>
          ) : (
            <AuthenticatedMediaLink
              key={p.id}
              src={p.blobUrl}
              className="flex w-full flex-col items-center justify-center h-24 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors gap-1 px-2"
            >
              <FileText className="w-6 h-6 text-gray-400" />
              <span className="text-[10px] text-gray-500 text-center truncate w-full">
                {p.caption ?? "Document"}
              </span>
            </AuthenticatedMediaLink>
          );
        })}
      </div>
    </div>
  );
}
import {
  ReactiveJobWizard,
  ReactiveJobReviewDrawer,
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
  const [jobTypeFilter, setJobTypeFilter] = useState("all");
  const [selectedJob, setSelectedJob] = useState<Record<string, unknown> | null>(null);
  const [sortCol, setSortCol] = useState<SortCol>("scheduledDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [editDrawerJob, setEditDrawerJob] = useState<Record<string, unknown> | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTeam, setBulkTeam] = useState("");
  const [bulkDate, setBulkDate] = useState("");
  const [isBulkAssigning, setIsBulkAssigning] = useState(false);
  const [isBulkActioning, setIsBulkActioning] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  // Bulk assign confirmation banner
  type BulkConfirm = { teamId: string; teamName: string; date: string; jobIds: string[] };
  const [bulkConfirm, setBulkConfirm] = useState<BulkConfirm | null>(null);
  const bulkConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bulkConfirmRemainingRef = useRef<number>(8000);
  const bulkConfirmPausedAtRef = useRef<number | null>(null);

  // Bulk status confirmation banner (complete / cancel)
  type BulkStatusConfirm = { jobIds: string[]; status: "completed" | "cancelled"; prevStatuses: Record<string, string> };
  const [bulkStatusConfirm, setBulkStatusConfirm] = useState<BulkStatusConfirm | null>(null);
  const bulkStatusConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const { data: attachmentsData } = useQuery<{ data: { id: string; blobUrl: string; contentType: string | null; caption: string | null }[] }>({
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

  const uniqueJobTypes = useMemo(() => {
    const types = new Set(allJobs.map(j => String(j.issueType ?? "")).filter(Boolean));
    return [...types].sort((a, b) => a.localeCompare(b));
  }, [allJobs]);

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
    if (jobTypeFilter !== "all") jobs = jobs.filter(j => String(j.issueType ?? "") === jobTypeFilter);
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
  }, [allJobs, statusFilter, jobTypeFilter, search, sortCol, sortDir, assets, teams]);

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
    if (jobTypeFilter !== "all") jobs = jobs.filter(j => String(j.issueType ?? "") === jobTypeFilter);
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
  }, [allJobs, jobTypeFilter, search, teamFilter, dateFilter, dateFrom, dateTo]);

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

  const toggleSelectId = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (prev.size === 0) {
          if (bulkStatusConfirmTimerRef.current) clearTimeout(bulkStatusConfirmTimerRef.current);
          setBulkStatusConfirm(null);
          if (bulkConfirmTimerRef.current) clearTimeout(bulkConfirmTimerRef.current);
          setBulkConfirm(null);
        }
        next.add(id);
      }
      return next;
    });
  };

  const allVisibleSelected =
    filteredSortedJobs.length > 0 &&
    filteredSortedJobs.every(j => selectedIds.has(j.id as string));

  const someVisibleSelected =
    !allVisibleSelected && filteredSortedJobs.some(j => selectedIds.has(j.id as string));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filteredSortedJobs.forEach(j => next.delete(j.id as string));
        return next;
      });
    } else {
      if (selectedIds.size === 0) {
        if (bulkStatusConfirmTimerRef.current) clearTimeout(bulkStatusConfirmTimerRef.current);
        setBulkStatusConfirm(null);
        if (bulkConfirmTimerRef.current) clearTimeout(bulkConfirmTimerRef.current);
        setBulkConfirm(null);
      }
      setSelectedIds(prev => {
        const next = new Set(prev);
        filteredSortedJobs.forEach(j => next.add(j.id as string));
        return next;
      });
    }
  };

  const handleBulkAssign = async () => {
    if (!bulkTeam || !bulkDate || selectedIds.size === 0) return;
    setIsBulkAssigning(true);
    const ids = [...selectedIds];
    const teamName = teams.find(t => t.id === bulkTeam)?.name ?? bulkTeam;
    const assignedDate = bulkDate;
    const assignedTeamId = bulkTeam;
    const results = await Promise.allSettled(
      ids.map(id =>
        fetch(`/api/reactive-jobs/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assignedTeamId: bulkTeam, scheduledDate: bulkDate }),
        }).then(r => { if (!r.ok) throw new Error(r.statusText); })
      ),
    );
    const failed = results.filter(r => r.status === "rejected").length;
    const succeeded = ids.length - failed;
    setIsBulkAssigning(false);
    setSelectedIds(new Set());
    setBulkTeam("");
    setBulkDate("");
    void qc.invalidateQueries({ queryKey: getListReactiveJobsQueryKey() });
    if (failed === 0) {
      if (bulkConfirmTimerRef.current) clearTimeout(bulkConfirmTimerRef.current);
      setBulkConfirm({ teamId: assignedTeamId, teamName, date: assignedDate, jobIds: ids });
    } else {
      toast({
        title: `${succeeded} assigned, ${failed} failed`,
        description: "Some jobs could not be updated — please try again.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (!bulkConfirm) return;

    const DURATION = 8000;
    bulkConfirmRemainingRef.current = DURATION;
    bulkConfirmPausedAtRef.current = null;

    const startTimer = (ms: number) => {
      if (bulkConfirmTimerRef.current) clearTimeout(bulkConfirmTimerRef.current);
      const startedAt = Date.now();
      bulkConfirmTimerRef.current = setTimeout(() => setBulkConfirm(null), ms);
      bulkConfirmPausedAtRef.current = startedAt;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (bulkConfirmTimerRef.current) {
          clearTimeout(bulkConfirmTimerRef.current);
          bulkConfirmTimerRef.current = null;
          const elapsed = bulkConfirmPausedAtRef.current
            ? Date.now() - bulkConfirmPausedAtRef.current
            : 0;
          bulkConfirmRemainingRef.current = Math.max(0, bulkConfirmRemainingRef.current - elapsed);
          bulkConfirmPausedAtRef.current = null;
        }
      } else {
        if (bulkConfirmRemainingRef.current > 0) {
          startTimer(bulkConfirmRemainingRef.current);
        } else {
          setBulkConfirm(null);
        }
      }
    };

    // Only start if tab is currently visible
    if (document.visibilityState === "visible") {
      startTimer(DURATION);
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (bulkConfirmTimerRef.current) clearTimeout(bulkConfirmTimerRef.current);
    };
  }, [bulkConfirm]);

  useEffect(() => {
    if (!bulkStatusConfirm) return;
    if (bulkStatusConfirmTimerRef.current) clearTimeout(bulkStatusConfirmTimerRef.current);
    bulkStatusConfirmTimerRef.current = setTimeout(() => setBulkStatusConfirm(null), 8000);
    return () => { if (bulkStatusConfirmTimerRef.current) clearTimeout(bulkStatusConfirmTimerRef.current); };
  }, [bulkStatusConfirm]);

  // Dismiss confirmation banners when any filter changes
  useEffect(() => {
    if (bulkStatusConfirm) {
      if (bulkStatusConfirmTimerRef.current) clearTimeout(bulkStatusConfirmTimerRef.current);
      setBulkStatusConfirm(null);
    }
    if (bulkConfirm) {
      if (bulkConfirmTimerRef.current) clearTimeout(bulkConfirmTimerRef.current);
      setBulkConfirm(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, teamFilter, dateFilter, dateFrom, dateTo, jobTypeFilter, overdueOnly]);

  const handleBulkStatusUpdate = async (status: "completed" | "cancelled") => {
    if (selectedIds.size === 0) return;
    setIsBulkActioning(true);
    const ids = [...selectedIds];
    // Snapshot previous statuses so Undo can revert each job individually
    const prevStatuses: Record<string, string> = {};
    for (const id of ids) {
      const job = allJobs.find(j => j.id === id);
      if (job) prevStatuses[id] = job.status as string;
    }
    const results = await Promise.allSettled(
      ids.map(id =>
        fetch(`/api/reactive-jobs/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }).then(r => { if (!r.ok) throw new Error(r.statusText); })
      ),
    );
    const failed = results.filter(r => r.status === "rejected").length;
    const succeeded = ids.length - failed;
    setIsBulkActioning(false);
    setSelectedIds(new Set());
    setBulkTeam("");
    setBulkDate("");
    void qc.invalidateQueries({ queryKey: getListReactiveJobsQueryKey() });
    if (failed === 0) {
      if (bulkStatusConfirmTimerRef.current) clearTimeout(bulkStatusConfirmTimerRef.current);
      setBulkStatusConfirm({ jobIds: ids, status, prevStatuses });
    } else {
      toast({
        title: `${succeeded} ${status === "completed" ? "completed" : "cancelled"}, ${failed} failed`,
        description: "Some jobs could not be updated — please try again.",
        variant: "destructive",
      });
    }
  };

  const handleUndoBulkStatus = async () => {
    if (!bulkStatusConfirm) return;
    if (bulkStatusConfirmTimerRef.current) clearTimeout(bulkStatusConfirmTimerRef.current);
    const { jobIds, prevStatuses } = bulkStatusConfirm;
    setBulkStatusConfirm(null);
    setIsBulkActioning(true);
    await Promise.allSettled(
      jobIds.map(id =>
        fetch(`/api/reactive-jobs/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: prevStatuses[id] ?? "raised" }),
        }).then(r => { if (!r.ok) throw new Error(r.statusText); })
      ),
    );
    setIsBulkActioning(false);
    setSelectedIds(new Set(jobIds));
    void qc.invalidateQueries({ queryKey: getListReactiveJobsQueryKey() });
  };

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
          <Select value={jobTypeFilter} onValueChange={setJobTypeFilter}>
            <SelectTrigger className="w-[175px] h-9 text-sm bg-white">
              <SelectValue placeholder="All job types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All job types</SelectItem>
              {uniqueJobTypes.map(t => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
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

      {/* Bulk assign confirmation banner */}
      {bulkConfirm && selectedIds.size === 0 && (
        <div
          className="mx-6 mt-4 flex items-center gap-3 px-5 py-3 rounded-xl border flex-shrink-0 flex-wrap"
          style={{ background: "#166534", borderColor: "#15803d" }}
        >
          <CheckCircle2 className="w-5 h-5 text-green-300 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">
              {bulkConfirm.jobIds.length} job{bulkConfirm.jobIds.length !== 1 ? "s" : ""} assigned
            </p>
            <p className="text-xs text-green-200 mt-0.5">
              Team: <span className="font-semibold text-white">{bulkConfirm.teamName}</span>
              {" · "}
              Date: <span className="font-semibold text-white">{format(new Date(bulkConfirm.date + "T00:00:00"), "d MMM yyyy")}</span>
            </p>
          </div>
          <button
            onClick={() => {
              if (bulkConfirmTimerRef.current) clearTimeout(bulkConfirmTimerRef.current);
              setSelectedIds(new Set(bulkConfirm.jobIds));
              setBulkTeam(bulkConfirm.teamId);
              setBulkDate(bulkConfirm.date);
              setBulkConfirm(null);
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-green-900 bg-green-200 hover:bg-green-100 transition-colors whitespace-nowrap flex-shrink-0"
          >
            Undo
          </button>
          <button
            onClick={() => { if (bulkConfirmTimerRef.current) clearTimeout(bulkConfirmTimerRef.current); setBulkConfirm(null); }}
            className="text-green-300 hover:text-white transition-colors flex-shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Bulk status confirmation banner (complete / cancel) */}
      {bulkStatusConfirm && selectedIds.size === 0 && (
        <div
          className="mx-6 mt-4 flex items-center gap-3 px-5 py-3 rounded-xl border flex-shrink-0 flex-wrap"
          style={
            bulkStatusConfirm.status === "completed"
              ? { background: "#166534", borderColor: "#15803d" }
              : { background: "#7c2d12", borderColor: "#9a3412" }
          }
        >
          {bulkStatusConfirm.status === "completed"
            ? <CheckCircle2 className="w-5 h-5 text-green-300 flex-shrink-0" />
            : <X className="w-5 h-5 text-orange-300 flex-shrink-0" />
          }
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">
              {bulkStatusConfirm.jobIds.length} job{bulkStatusConfirm.jobIds.length !== 1 ? "s" : ""}{" "}
              marked {bulkStatusConfirm.status === "completed" ? "complete" : "cancelled"}
            </p>
            <p className={`text-xs mt-0.5 ${bulkStatusConfirm.status === "completed" ? "text-green-200" : "text-orange-200"}`}>
              Action applied to {bulkStatusConfirm.jobIds.length} job{bulkStatusConfirm.jobIds.length !== 1 ? "s" : ""}
              {" "}— use Undo to revert
            </p>
          </div>
          <button
            onClick={handleUndoBulkStatus}
            disabled={isBulkActioning}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-40 transition-colors whitespace-nowrap flex-shrink-0 ${
              bulkStatusConfirm.status === "completed"
                ? "text-green-900 bg-green-200 hover:bg-green-100"
                : "text-orange-900 bg-orange-200 hover:bg-orange-100"
            }`}
          >
            Undo
          </button>
          <button
            onClick={() => { if (bulkStatusConfirmTimerRef.current) clearTimeout(bulkStatusConfirmTimerRef.current); setBulkStatusConfirm(null); }}
            className={`transition-colors flex-shrink-0 ${bulkStatusConfirm.status === "completed" ? "text-green-300 hover:text-white" : "text-orange-300 hover:text-white"}`}
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div
          className="mx-6 mt-4 flex items-center gap-3 px-5 py-3 rounded-xl border flex-shrink-0 flex-wrap"
          style={{ background: `${NAVY}f2`, borderColor: `${NAVY}` }}
        >
          <span className="text-sm font-bold text-white whitespace-nowrap">
            {selectedIds.size} job{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            <Select value={bulkTeam} onValueChange={setBulkTeam}>
              <SelectTrigger className="w-[160px] h-9 text-sm bg-white/10 border-white/20 text-white">
                <SelectValue placeholder="Choose team…" />
              </SelectTrigger>
              <SelectContent>
                {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <input
              type="date"
              value={bulkDate}
              onChange={e => setBulkDate(e.target.value)}
              className="h-9 rounded-md border border-white/20 bg-white/10 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40 focus:ring-offset-0 [color-scheme:dark]"
            />
            <button
              onClick={handleBulkAssign}
              disabled={!bulkTeam || !bulkDate || isBulkAssigning || isBulkActioning}
              className="px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40 transition-opacity"
              style={{ background: BRAND }}
            >
              {isBulkAssigning ? "Assigning…" : `Assign ${selectedIds.size} job${selectedIds.size !== 1 ? "s" : ""}`}
            </button>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => handleBulkStatusUpdate("completed")}
              disabled={isBulkActioning || isBulkAssigning}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white bg-green-600 hover:bg-green-700 disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isBulkActioning ? "Updating…" : `Mark ${selectedIds.size} complete`}
            </button>
            <button
              onClick={() => setCancelConfirmOpen(true)}
              disabled={isBulkActioning || isBulkAssigning}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              <Trash2 className="w-4 h-4" />
              {isBulkActioning ? "Updating…" : `Cancel ${selectedIds.size}`}
            </button>
          </div>
          <button
            onClick={() => { setSelectedIds(new Set()); setBulkTeam(""); setBulkDate(""); }}
            className="text-white/60 hover:text-white text-sm font-semibold transition-colors whitespace-nowrap"
          >
            Deselect
          </button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0 p-6">
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
          <div className="rounded-xl border border-gray-200 bg-white overflow-auto flex-1 min-h-0">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                {/* Checkbox column */}
                <th className="sticky top-0 z-10 bg-gray-50 px-4 py-3 border-b border-gray-100 w-10">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    ref={el => { if (el) el.indeterminate = someVisibleSelected; }}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded cursor-pointer accent-[#00AECD]"
                    title="Select all visible"
                  />
                </th>
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

                const isSelected = selectedIds.has(job.id as string);
                return (
                  <tr
                    key={job.id as string}
                    onClick={() => job.status === "raised" ? setEditDrawerJob(job) : setSelectedJob(job)}
                    className={`${isSelected ? "bg-[#00AECD]/8" : rowBg} cursor-pointer hover:bg-[#00AECD]/5 transition-colors`}
                  >
                    {/* Checkbox — td stops row click; input onChange is the sole toggle */}
                    <td className="px-4 py-3 border-b border-gray-100 w-10" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectId(job.id as string)}
                        className="w-4 h-4 rounded cursor-pointer accent-[#00AECD]"
                      />
                    </td>
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
                            onClick={() => job.status === "raised" ? setEditDrawerJob(job) : setSelectedJob(job)}>
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
                      onClick={() => { setEditDrawerJob(selectedJob); setSelectedJob(null); }}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors"
                      style={{ borderColor: "#e5e7eb", color: "#6b7280", background: "white" }}>
                      Edit
                    </button>
                  )}
                  <button onClick={() => setSelectedJob(null)} className="text-gray-300 hover:text-gray-500">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">

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
                <ReactiveJobAttachments attachments={photos} />

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
              <div className="px-6 py-4 border-t bg-gray-50 flex justify-end flex-shrink-0">
                <button
                  onClick={() => setSelectedJob(null)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Review & Schedule Drawer (draft/raised jobs + Edit from modal) ── */}
      {editDrawerJob && (
        <ReactiveJobReviewDrawer
          job={editDrawerJob}
          teamsData={teams}
          assetsData={assets}
          onClose={() => setEditDrawerJob(null)}
          onSaved={() => {
            setEditDrawerJob(null);
            void qc.invalidateQueries({ queryKey: getListReactiveJobsQueryKey() });
          }}
        />
      )}

      {/* ── Bulk-cancel confirmation dialog ── */}
      <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {selectedIds.size} job{selectedIds.size !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark <strong>{selectedIds.size} job{selectedIds.size !== 1 ? "s" : ""}</strong> as cancelled.
              This action is difficult to undo — are you sure you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep jobs</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => handleBulkStatusUpdate("cancelled")}
            >
              Yes, cancel jobs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
