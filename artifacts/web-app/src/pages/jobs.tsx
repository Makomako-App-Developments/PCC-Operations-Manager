import { useState } from "react";
import { useListJobs, getListJobsQueryKey, useListTeams, getListTeamsQueryKey, useUpdateJob } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { CheckCircle2, PlayCircle, SkipForward, AlertTriangle, Clock, MapPin, List as ListIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const BRAND = "#00AECD";

const STATUS_CONFIG: Record<string, { label: string, color: string, bg: string, icon: any }> = {
  pending: { label: "Pending", color: "#2563eb", bg: "#eff6ff", icon: Clock },
  in_progress: { label: "In Progress", color: "#16a34a", bg: "#dcfce7", icon: PlayCircle },
  completed: { label: "Completed", color: "#6b7280", bg: "#f3f4f6", icon: CheckCircle2 },
  skipped: { label: "Skipped", color: "#ea580c", bg: "#fff7ed", icon: SkipForward },
  overdue: { label: "Overdue", color: "#dc2626", bg: "#fef2f2", icon: AlertTriangle },
};

export default function Jobs() {
  const [status, setStatus] = useState<any>("all");
  const [teamId, setTeamId] = useState<any>("all");
  const [selectedJob, setSelectedJob] = useState<any | null>(null);

  const { data: teamsData } = useListTeams({ query: { queryKey: getListTeamsQueryKey() }});

  const queryParams: any = { limit: 100 };
  if (status && status !== "all") queryParams.status = status;
  if (teamId && teamId !== "all") queryParams.teamId = teamId;

  const { data: jobsData, isLoading } = useListJobs(queryParams, {
    query: { queryKey: getListJobsQueryKey(queryParams) }
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateMutation = useUpdateJob({
    mutation: {
      onSuccess: () => {
        toast({ title: "Job updated" });
        queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
        setSelectedJob(null);
      }
    }
  });

  const handleStatusUpdate = (jobId: string, newStatus: any) => {
    updateMutation.mutate({ id: jobId, data: { status: newStatus } });
  };

  const getTeamName = (id?: string | null) => {
    if (!id || !teamsData) return "Unassigned";
    return teamsData.find(t => t.id === id)?.name || "Unassigned";
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f5f7f9]">
      <header className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-10 flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Job Operations</h1>
          <p className="text-xs text-gray-400">{jobsData?.data.length || 0} scheduled jobs</p>
        </div>
      </header>

      <div className="px-8 py-4 border-b bg-white flex gap-3 sticky top-[73px] z-10 shadow-sm flex-shrink-0">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[160px] h-9 text-sm bg-white" data-testid="select-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>

        <Select value={teamId} onValueChange={setTeamId}>
          <SelectTrigger className="w-[160px] h-9 text-sm bg-white" data-testid="select-team">
            <SelectValue placeholder="Assigned Team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Teams</SelectItem>
            {teamsData?.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(status !== "all" || teamId !== "all") && (
          <Button variant="ghost" size="sm" className="h-9 px-3 text-gray-500" onClick={() => { setStatus("all"); setTeamId("all"); }}>
            Clear
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-8">
        {isLoading ? (
          <Skeleton className="w-full h-[600px] rounded-xl" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {jobsData?.data.map((job) => {
              const conf = STATUS_CONFIG[job.status] || STATUS_CONFIG.pending;
              const Icon = conf.icon;
              return (
                <Card 
                  key={job.id} 
                  className={`rounded-xl border border-gray-200 shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-all ${job.status === "in_progress" ? "ring-2 ring-[#00AECD] ring-offset-1" : ""}`}
                  onClick={() => setSelectedJob(job)}
                  data-testid={`card-job-${job.id}`}
                >
                  <div className="p-4 bg-white flex flex-col h-full">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 uppercase tracking-wider mb-2" style={{ background: conf.bg, color: conf.color }}>
                          <Icon className="w-3 h-3" /> {conf.label}
                        </span>
                        <h3 className="font-bold text-gray-900 leading-tight mb-0.5">{job.assetName}</h3>
                        <p className="text-[10px] text-gray-400 font-mono">{job.assetRef}</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 mb-4 mt-auto">
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <ListIcon className="w-3.5 h-3.5 text-gray-400" /> <span className="capitalize">{job.jobType.replace("_", " ")}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <MapPin className="w-3.5 h-3.5 text-gray-400" /> <span className="truncate">{job.suburb || "-"}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <Clock className="w-3.5 h-3.5 text-gray-400" /> {job.serviceTimeMins}m allocated
                      </div>
                    </div>

                    <div className="pt-3 border-t border-gray-100 flex items-center justify-between mt-auto">
                      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-widest">{getTeamName(job.teamId)}</p>
                      <p className="text-[11px] font-bold text-gray-900">{format(new Date(job.scheduledDate), "d MMM yyyy")}</p>
                    </div>
                  </div>
                </Card>
              );
            })}
            {jobsData?.data.length === 0 && (
              <div className="col-span-full py-12 text-center text-gray-500 bg-white rounded-xl border border-dashed">
                No jobs match the current filters.
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={!!selectedJob} onOpenChange={(open) => !open && setSelectedJob(null)}>
        <DialogContent className="sm:max-w-[425px]">
          {selectedJob && (
            <>
              <DialogHeader>
                <DialogTitle>Update Job Status</DialogTitle>
                <div className="text-sm text-gray-500 mt-2">
                  <p className="font-bold text-gray-900">{selectedJob.assetName}</p>
                  <p className="font-mono text-xs">{selectedJob.assetRef}</p>
                  <p className="mt-2 text-xs">Scheduled: {format(new Date(selectedJob.scheduledDate), "d MMM yyyy")}</p>
                </div>
              </DialogHeader>
              <div className="py-4 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Select new status</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { val: "pending", label: "Pending", icon: Clock },
                    { val: "in_progress", label: "In Progress", icon: PlayCircle },
                    { val: "completed", label: "Completed", icon: CheckCircle2 },
                    { val: "skipped", label: "Skipped", icon: SkipForward },
                  ].map(s => (
                    <Button 
                      key={s.val} 
                      variant={selectedJob.status === s.val ? "default" : "outline"}
                      className={`justify-start gap-2 ${selectedJob.status === s.val ? "bg-[#00AECD] text-white hover:bg-[#0097b2]" : ""}`}
                      onClick={() => handleStatusUpdate(selectedJob.id, s.val)}
                      disabled={updateMutation.isPending || selectedJob.status === s.val}
                    >
                      <s.icon className="w-4 h-4" /> {s.label}
                    </Button>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedJob(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
