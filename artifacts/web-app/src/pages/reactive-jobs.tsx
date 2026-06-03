import { useState, useMemo } from "react";
import { format } from "date-fns";
import {
  useListReactiveJobs, getListReactiveJobsQueryKey,
  useUpdateReactiveJob,
  useListTeams,
  useListAssets,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  Zap, Plus, Search, X, MapPin, Clock, Calendar,
  ChevronUp, ChevronDown, ChevronsUpDown, FileText, User, Hash,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  ReactiveJobWizard,
  BRAND, NAVY,
  DEFAULT_PRIORITIES, PRIORITY_CONFIG, STATUS_CONFIG,
  type ReactivePriority, type AssetStub, type TeamStub,
} from "@/components/reactive-job-wizard";

type SortCol = "site" | "description" | "priority" | "status" | "scheduledDate" | "team" | "time";
type SortDir = "asc" | "desc";

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, standard: 2, routine: 3 };
const STATUS_ORDER: Record<string, number> = { raised: 0, assigned: 1, in_progress: 2, completed: 3, cancelled: 4 };

export default function ReactiveJobs() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedJob, setSelectedJob] = useState<Record<string, unknown> | null>(null);
  const [sortCol, setSortCol] = useState<SortCol>("scheduledDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

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

  const allJobs = (jobsData?.data ?? []) as unknown as Record<string, unknown>[];

  const filteredSortedJobs = useMemo(() => {
    let jobs = allJobs;
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
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [allJobs, statusFilter, search, sortCol, sortDir, assets, teams]);

  const statusCounts = useMemo(
    () => ({
      all: allJobs.length,
      raised: allJobs.filter(j => j.status === "raised").length,
      assigned: allJobs.filter(j => j.status === "assigned").length,
      in_progress: allJobs.filter(j => j.status === "in_progress").length,
      completed: allJobs.filter(j => j.status === "completed").length,
      cancelled: allJobs.filter(j => j.status === "cancelled").length,
    }),
    [allJobs],
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

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f5f7f9]">
      {/* Header */}
      <header
        className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-10 flex-shrink-0"
        style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
      >
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2" style={{ color: NAVY }}>
            <Zap className="w-5 h-5 text-amber-500" />
            Unscheduled Work
          </h1>
          <p className="text-xs text-gray-400">Ad-hoc requests, emergency work, and community issues</p>
        </div>
        <button
          onClick={() => setWizardOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
          style={{ background: BRAND }}
        >
          <Plus className="w-4 h-4" />
          New Unscheduled Work
        </button>
      </header>

      {/* Filters */}
      <div className="bg-white border-b px-8 py-3 flex items-center gap-3 flex-shrink-0 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {(["all", "raised", "assigned", "in_progress", "completed", "cancelled"] as const).map(s => {
            const label = s === "all" ? "All" : (STATUS_CONFIG[s]?.label ?? s);
            const count = statusCounts[s] ?? 0;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${statusFilter === s ? "text-white" : "text-gray-500 hover:bg-gray-50"}`}
                style={statusFilter === s ? { background: BRAND } : {}}
              >
                {label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${statusFilter === s ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto relative">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-[#00AECD] w-48"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-8 space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : filteredSortedJobs.length === 0 ? (
          <div className="m-8 py-20 text-center bg-white rounded-2xl border border-dashed border-gray-200">
            <Zap className="w-10 h-10 text-gray-100 mx-auto mb-3" />
            <p className="text-gray-500 font-semibold">No unscheduled work</p>
            <p className="text-sm text-gray-400 mt-1">
              {statusFilter !== "all" || search ? "Try adjusting your filters" : "Click 'New Unscheduled Work' to log one"}
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-white shadow-sm">
              <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                {([
                  { col: "site",          label: "Site" },
                  { col: "description",   label: "Description" },
                  { col: "priority",      label: "Priority" },
                  { col: "status",        label: "Status" },
                  { col: "scheduledDate", label: "Scheduled" },
                  { col: "team",          label: "Team" },
                  { col: "time",          label: "Time (min)" },
                ] as { col: SortCol; label: string }[]).map(({ col, label }) => (
                  <th
                    key={col}
                    onClick={() => handleSort(col)}
                    className="text-left px-4 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 select-none whitespace-nowrap"
                  >
                    {label}<SortIcon col={col} />
                  </th>
                ))}
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
                    className={`${rowBg} border-b border-gray-100 cursor-pointer hover:bg-[#00AECD]/5 transition-colors`}
                  >
                    {/* Site */}
                    <td className="px-4 py-3 font-semibold text-gray-800 max-w-[180px]">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 text-gray-300 flex-shrink-0" />
                        <span className="truncate" title={site}>{site}</span>
                      </div>
                    </td>

                    {/* Description */}
                    <td className="px-4 py-3 text-gray-600 max-w-[220px]">
                      <p className="font-medium text-gray-800 truncate">{job.issueType as string}</p>
                      <p className="text-[11px] text-gray-400 truncate">{job.description as string}</p>
                    </td>

                    {/* Priority */}
                    <td className="px-4 py-3">
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap"
                        style={{ color: pConf.color, background: pConf.bg }}
                      >
                        {pConf.label}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-[12px]">
                      {(job.scheduledDate as string | null)
                        ? format(new Date((job.scheduledDate as string) + "T00:00:00"), "d MMM yyyy")
                        : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Team */}
                    <td className="px-4 py-3 text-gray-600 text-[12px] whitespace-nowrap">
                      {getTeamName(job.assignedTeamId as string | null)}
                    </td>

                    {/* Time */}
                    <td className="px-4 py-3 text-gray-600 text-[12px] tabular-nums">
                      {(job.estimatedTimeMins as number | null) ?? <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {filteredSortedJobs.length > 0 && (
          <p className="text-center text-[11px] text-gray-400 py-3">
            {filteredSortedJobs.length} job{filteredSortedJobs.length !== 1 ? "s" : ""}
          </p>
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
                <h2 className="font-bold text-gray-900 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  {selectedJob.issueType as string}
                </h2>
                <button onClick={() => setSelectedJob(null)} className="text-gray-300 hover:text-gray-500">
                  <X className="w-5 h-5" />
                </button>
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
                  {(selectedJob.raisedAt as string) && (
                    <span className="text-[10px] text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full ml-auto">
                      Raised {format(new Date(selectedJob.raisedAt as string), "d MMM yyyy, h:mm a")}
                    </span>
                  )}
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

                {/* Status update */}
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2 font-semibold">Update Status</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(["raised", "assigned", "in_progress", "completed", "cancelled"] as const).map(s => {
                      const conf = STATUS_CONFIG[s];
                      const SIcon = conf.icon;
                      const isActive = selectedJob.status === s;
                      return (
                        <button
                          key={s}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${isActive ? "text-white border-transparent" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                          style={isActive ? { background: BRAND } : {}}
                          onClick={() => {
                            updateMutation.mutate({ id: selectedJob.id as string, data: { status: s } });
                            setSelectedJob(prev => prev ? { ...prev, status: s } : null);
                          }}
                          disabled={updateMutation.isPending || isActive}
                        >
                          <SIcon className="w-4 h-4" />
                          {conf.label}
                        </button>
                      );
                    })}
                  </div>
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
    </div>
  );
}
