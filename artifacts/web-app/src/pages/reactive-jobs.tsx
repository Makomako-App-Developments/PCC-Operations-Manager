import { useState } from "react";
import { useListReactiveJobs, getListReactiveJobsQueryKey, useListTeams, getListTeamsQueryKey, useUpdateReactiveJob } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { AlertTriangle, Clock, PlayCircle, CheckCircle2, XCircle, FileText, Zap } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const BRAND = "#00AECD";

const PRIORITY_CONFIG: Record<string, { label: string, color: string, bg: string }> = {
  low: { label: "Low", color: "#6b7280", bg: "#f3f4f6" },
  medium: { label: "Medium", color: "#d97706", bg: "#fef3c7" },
  high: { label: "High", color: "#ea580c", bg: "#ffedd5" },
  urgent: { label: "Urgent", color: "#dc2626", bg: "#fef2f2" },
};

const STATUS_CONFIG: Record<string, { label: string, color: string, bg: string, icon: any }> = {
  raised: { label: "Raised", color: "#6b7280", bg: "#f3f4f6", icon: AlertTriangle },
  assigned: { label: "Assigned", color: "#2563eb", bg: "#eff6ff", icon: Clock },
  in_progress: { label: "In Progress", color: "#16a34a", bg: "#dcfce7", icon: PlayCircle },
  completed: { label: "Completed", color: "#059669", bg: "#ecfdf5", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", color: "#dc2626", bg: "#fef2f2", icon: XCircle },
};

export default function ReactiveJobs() {
  const [selectedJob, setSelectedJob] = useState<any | null>(null);

  const { data: teamsData } = useListTeams({ query: { queryKey: getListTeamsQueryKey() }});
  
  const { data: jobsData, isLoading } = useListReactiveJobs({
    query: { queryKey: getListReactiveJobsQueryKey() }
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const updateMutation = useUpdateReactiveJob({
    mutation: {
      onSuccess: () => {
        toast({ title: "Reactive job updated" });
        queryClient.invalidateQueries({ queryKey: ["/api/reactive-jobs"] });
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
          <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Zap className="w-5 h-5 text-orange-500" /> Reactive Jobs
          </h1>
          <p className="text-xs text-gray-400">Ad-hoc requests and community issues</p>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-8">
        {isLoading ? (
          <Skeleton className="w-full h-[600px] rounded-xl" />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {jobsData?.data.map((job) => {
              const pConf = PRIORITY_CONFIG[job.priority] || PRIORITY_CONFIG.medium;
              const sConf = STATUS_CONFIG[job.status] || STATUS_CONFIG.raised;
              const Icon = sConf.icon;
              
              return (
                <Card 
                  key={job.id} 
                  className={`rounded-xl border border-gray-200 shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-all ${job.status === "raised" ? "border-orange-200 ring-1 ring-orange-100" : ""}`}
                  onClick={() => setSelectedJob(job)}
                  data-testid={`card-reactive-${job.id}`}
                >
                  <div className="p-5 bg-white flex flex-col h-full">
                    <div className="flex items-start justify-between mb-3 border-b border-gray-50 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 uppercase tracking-wider" style={{ background: sConf.bg, color: sConf.color }}>
                          <Icon className="w-3 h-3" /> {sConf.label}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border border-gray-100" style={{ color: pConf.color, background: pConf.bg }}>
                          {pConf.label} Priority
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-400 font-medium bg-gray-50 px-2 py-1 rounded">
                        {format(new Date(job.raisedAt), "d MMM, h:mm a")}
                      </span>
                    </div>
                    
                    <div className="mb-4">
                      <h3 className="font-bold text-gray-900 mb-1">{job.issueType}</h3>
                      <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed">{job.description}</p>
                    </div>

                    <div className="pt-3 border-t border-gray-100 flex items-center justify-between mt-auto">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[9px] font-bold text-gray-500">
                          ID
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-gray-900">Asset {job.assetId.substring(0, 8)}...</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-0.5">Assigned</p>
                        <p className="text-[11px] font-bold text-gray-700">{getTeamName(job.assignedTeamId)}</p>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
            {jobsData?.data.length === 0 && (
              <div className="col-span-full py-12 text-center text-gray-500 bg-white rounded-xl border border-dashed">
                No reactive jobs found.
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
                <DialogTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-orange-500" /> Update Reactive Job
                </DialogTitle>
                <div className="text-sm text-gray-500 mt-2 text-left bg-gray-50 p-3 rounded-lg border border-gray-100">
                  <p className="font-bold text-gray-900 mb-1">{selectedJob.issueType}</p>
                  <p className="text-xs text-gray-600">{selectedJob.description}</p>
                </div>
              </DialogHeader>
              <div className="py-4 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { val: "raised", label: "Raised", icon: AlertTriangle },
                    { val: "assigned", label: "Assigned", icon: Clock },
                    { val: "in_progress", label: "In Progress", icon: PlayCircle },
                    { val: "completed", label: "Completed", icon: CheckCircle2 },
                    { val: "cancelled", label: "Cancelled", icon: XCircle },
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
