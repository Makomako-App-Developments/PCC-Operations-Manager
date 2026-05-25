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
  AlertTriangle, CheckCircle2, Clock, MapPin, Plus, Zap,
  Search, X, PlayCircle, XCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  ReactiveJobWizard,
  BRAND, NAVY,
  DEFAULT_PRIORITIES, PRIORITY_CONFIG, STATUS_CONFIG,
  type ReactivePriority, type AssetStub, type TeamStub,
} from "@/components/reactive-job-wizard";

export default function ReactiveJobs() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedJob, setSelectedJob] = useState<Record<string, unknown> | null>(null);

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

  const updateMutation = useUpdateReactiveJob({
    mutation: {
      onSuccess: () => {
        toast({ title: "Status updated" });
        void qc.invalidateQueries({ queryKey: getListReactiveJobsQueryKey() });
        setSelectedJob(null);
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

  const getAssetName = (id?: string | null) => {
    if (!id) return "—";
    return assets.find(a => a.id === id)?.name ?? "—";
  };

  const allJobs = (jobsData?.data ?? []) as unknown as Record<string, unknown>[];

  const filteredJobs = useMemo(() => {
    let jobs = allJobs;
    if (statusFilter !== "all") jobs = jobs.filter(j => j.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      jobs = jobs.filter(
        j =>
          String(j.issueType ?? "").toLowerCase().includes(q) ||
          String(j.description ?? "").toLowerCase().includes(q) ||
          getAssetName(j.assetId as string | null).toLowerCase().includes(q) ||
          getTeamName(j.assignedTeamId as string | null).toLowerCase().includes(q),
      );
    }
    return jobs;
  }, [allJobs, statusFilter, search]);

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

  if (wizardOpen) {
    return (
      <ReactiveJobWizard
        teamsData={teams}
        assetsData={assets}
        onClose={() => setWizardOpen(false)}
        onPublished={() => setWizardOpen(false)}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f5f7f9]">
      <header
        className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-10 flex-shrink-0"
        style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
      >
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2" style={{ color: NAVY }}>
            <Zap className="w-5 h-5 text-amber-500" />
            Reactive Jobs
          </h1>
          <p className="text-xs text-gray-400">Ad-hoc requests, emergency work, and community issues</p>
        </div>
        <button
          onClick={() => setWizardOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
          style={{ background: BRAND }}
        >
          <Plus className="w-4 h-4" />
          New Reactive Job
        </button>
      </header>

      {/* Filters */}
      <div className="bg-white border-b px-8 py-3 flex items-center gap-3 flex-shrink-0 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {(["all", "raised", "assigned", "in_progress", "completed", "cancelled"] as const).map(
            s => {
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
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${statusFilter === s ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}
                  >
                    {count}
                  </span>
                </button>
              );
            },
          )}
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

      {/* Job grid */}
      <div className="flex-1 overflow-auto p-8">
        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-44 rounded-2xl bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="py-20 text-center bg-white rounded-2xl border border-dashed border-gray-200">
            <Zap className="w-10 h-10 text-gray-100 mx-auto mb-3" />
            <p className="text-gray-500 font-semibold">No reactive jobs</p>
            <p className="text-sm text-gray-400 mt-1">
              {statusFilter !== "all" || search
                ? "Try adjusting your filters"
                : "Click 'New Reactive Job' to log one"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredJobs.map(job => {
              const pEntry = listPriorities.find(p => p.id === (job.priority as string));
              const pConf = pEntry ?? PRIORITY_CONFIG[job.priority as string] ?? PRIORITY_CONFIG.medium;
              const sConf = STATUS_CONFIG[job.status as string] ?? STATUS_CONFIG.raised;
              const StatusIcon = sConf.icon;
              const isHighest = job.priority === listPriorities[0]?.id || job.priority === "urgent";

              return (
                <div
                  key={job.id as string}
                  onClick={() => setSelectedJob(job)}
                  className={`bg-white rounded-2xl border shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-all ${isHighest ? "border-orange-200 ring-1 ring-orange-100" : "border-gray-100"}`}
                >
                  <div className="p-5 flex flex-col">
                    <div className="flex items-start justify-between mb-3 pb-3 border-b border-gray-50">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 uppercase tracking-wider"
                          style={{ background: sConf.bg, color: sConf.color }}
                        >
                          <StatusIcon className="w-3 h-3" />
                          {sConf.label}
                        </span>
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
                          style={{ color: pConf.color, background: pConf.bg }}
                        >
                          {pConf.label}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-1 rounded flex-shrink-0">
                        {format(new Date(job.raisedAt as string), "d MMM, h:mm a")}
                      </span>
                    </div>

                    <div className="mb-4">
                      <h3 className="font-bold text-gray-900 mb-1">{job.issueType as string}</h3>
                      <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed">
                        {job.description as string}
                      </p>
                      {(job.location as string | null | undefined) && (
                        <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {job.location as string}
                        </p>
                      )}
                    </div>

                    <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-0.5">
                          Asset
                        </p>
                        <p className="text-[11px] font-bold text-gray-700">
                          {job.assetId
                            ? getAssetName(job.assetId as string)
                            : (job.location as string | null) ?? "—"}
                        </p>
                      </div>
                      {(job.scheduledDate as string | null | undefined) && (
                        <div className="text-center">
                          <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-0.5">
                            Scheduled
                          </p>
                          <p className="text-[11px] font-bold text-gray-700">
                            {format(
                              new Date((job.scheduledDate as string) + "T00:00:00"),
                              "d MMM",
                            )}
                          </p>
                        </div>
                      )}
                      <div className="text-right">
                        <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-0.5">
                          Team
                        </p>
                        <p className="text-[11px] font-bold text-gray-700">
                          {getTeamName(job.assignedTeamId as string | null)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Update status dialog */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b flex items-center justify-between">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                Update Reactive Job
              </h2>
              <button
                onClick={() => setSelectedJob(null)}
                className="text-gray-300 hover:text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 mb-4">
                <p className="font-bold text-gray-900 mb-1">{selectedJob.issueType as string}</p>
                <p className="text-xs text-gray-600 mb-2">{selectedJob.description as string}</p>
                <div className="flex items-center gap-3 text-[11px] text-gray-400 flex-wrap">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {selectedJob.assetId
                      ? getAssetName(selectedJob.assetId as string)
                      : (selectedJob.location as string | null) ?? "—"}
                  </span>
                  <span>·</span>
                  <span>{getTeamName(selectedJob.assignedTeamId as string | null)}</span>
                </div>
              </div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Update status
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  ["raised", "assigned", "in_progress", "completed", "cancelled"] as const
                ).map(s => {
                  const conf = STATUS_CONFIG[s];
                  const SIcon = conf.icon;
                  const isActive = selectedJob.status === s;
                  return (
                    <button
                      key={s}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${isActive ? "text-white border-transparent" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                      style={isActive ? { background: BRAND } : {}}
                      onClick={() =>
                        updateMutation.mutate({
                          id: selectedJob.id as string,
                          data: { status: s },
                        })
                      }
                      disabled={updateMutation.isPending || isActive}
                    >
                      <SIcon className="w-4 h-4" />
                      {conf.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="p-4 border-t bg-gray-50 flex justify-end">
              <button
                onClick={() => setSelectedJob(null)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
