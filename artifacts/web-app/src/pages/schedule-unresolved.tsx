import { useState, useMemo } from "react";
import {
  useGetOverdueScheduleJobs, 
  getGetOverdueScheduleJobsQueryKey, 
  useResolveOverdueScheduleJobs,
  JobWithAsset,
  Team,
  ResolveOverdueJobResult,
  getGetScheduleWeekQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format, differenceInDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface UnresolvedWorkViewProps {
  selectedTeamIds: string[];
  teams: Team[];
  getTeamColor: (id?: string | null) => string;
  getTeamName: (id?: string | null) => string;
}

export function UnresolvedWorkView({ selectedTeamIds, teams, getTeamColor, getTeamName }: UnresolvedWorkViewProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const apiTeamId = selectedTeamIds.length === 1 ? selectedTeamIds[0] : undefined;
  
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const { data, isLoading } = useGetOverdueScheduleJobs({ before: todayStr, ...(apiTeamId ? { teamId: apiTeamId } : {}) });
  const resolveMutation = useResolveOverdueScheduleJobs();
  
  const allJobs = data?.jobs ?? [];
  const filteredJobs = useMemo(() => {
    if (selectedTeamIds.length === 0) return allJobs;
    return allJobs.filter(j => !j.teamId || selectedTeamIds.includes(j.teamId));
  }, [allJobs, selectedTeamIds]);

  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  
  const toggleJob = (id: string) => {
    const next = new Set(selectedJobIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedJobIds(next);
  };
  
  const toggleAll = () => {
    if (selectedJobIds.size === filteredJobs.length && filteredJobs.length > 0) {
      setSelectedJobIds(new Set());
    } else {
      setSelectedJobIds(new Set(filteredJobs.map(j => j.id)));
    }
  };

  const [actionDialog, setActionDialog] = useState<{
    open: boolean;
    action: "keep" | "move" | "reassign" | "complete" | "skip";
    reason?: string;
    destinationDate?: string;
    destinationTeamId?: string;
  }>({ open: false, action: "keep" });

  const [failureResults, setFailureResults] = useState<ResolveOverdueJobResult[]>([]);

  const handleAction = async (forceCapacity = false) => {
    if (selectedJobIds.size === 0) return;
    const { action, reason, destinationDate, destinationTeamId } = actionDialog;
    
    if (action === "skip" && !reason?.trim()) {
      toast({ title: "Reason required", description: "Please provide a reason to skip.", variant: "destructive" });
      return;
    }
    if (action === "move" && !destinationDate) {
      toast({ title: "Date required", description: "Please select a destination date.", variant: "destructive" });
      return;
    }
    if (action === "reassign" && !destinationTeamId) {
      toast({ title: "Team required", description: "Please select a destination team.", variant: "destructive" });
      return;
    }

    try {
      const res = await resolveMutation.mutateAsync({
        data: {
          jobIds: Array.from(selectedJobIds),
          action: action,
          reason: reason?.trim() || `Authorised ${action} from unresolved queue`,
          destinationDate: destinationDate,
          destinationTeamId: destinationTeamId,
          forceCapacity
        }
      });
      
      if (res.failed > 0) {
        setFailureResults(res.results.filter(r => !r.success));
        const failedIds = new Set(res.results.filter(r => !r.success).map(r => r.jobId));
        setSelectedJobIds(failedIds);
        setActionDialog(p => ({ ...p, open: false })); // Close dialog but keep parameters for retry
        if (res.succeeded > 0) {
          toast({ title: "Partial success", description: `${res.succeeded} jobs resolved, ${res.failed} failed.` });
        }
      } else {
        toast({ title: "Success", description: `${res.succeeded} jobs resolved.` });
        setSelectedJobIds(new Set());
        setActionDialog({ open: false, action: "keep" });
        setFailureResults([]);
      }
      
      queryClient.invalidateQueries({ queryKey: getGetOverdueScheduleJobsQueryKey({ before: todayStr, ...(apiTeamId ? { teamId: apiTeamId } : {}) }) });
      queryClient.invalidateQueries({ queryKey: ["/api/schedule/range"] });
      queryClient.invalidateQueries({ queryKey: getGetScheduleWeekQueryKey() });
      
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to resolve jobs",
        variant: "destructive",
      });
    }
  };

  const failureMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of failureResults) {
      map.set(f.jobId, f.message);
    }
    return map;
  }, [failureResults]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const today = new Date();

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            Unresolved Work
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {filteredJobs.length} scheduled jobs that are past their target date
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {selectedJobIds.size > 0 && (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
              <span className="text-sm font-medium px-3 py-1.5 rounded-md border" style={{ backgroundColor: "rgba(0,174,205,0.1)", color: "#008ba3", borderColor: "rgba(0,174,205,0.2)" }}>
                {selectedJobIds.size} selected
              </span>
              <div className="h-6 w-px bg-gray-200 mx-1" />
              <Button size="sm" variant="outline" className="border-gray-200" onClick={() => setActionDialog({ open: true, action: "keep", reason: "" })}>Keep</Button>
              <Button size="sm" variant="outline" className="border-gray-200" onClick={() => setActionDialog({ open: true, action: "move", reason: "" })}>Move</Button>
              <Button size="sm" variant="outline" className="border-gray-200" onClick={() => setActionDialog({ open: true, action: "reassign", reason: "" })}>Reassign</Button>
              <Button size="sm" variant="outline" className="border-gray-200 text-green-700 hover:text-green-800 hover:bg-green-50" onClick={() => setActionDialog({ open: true, action: "complete", reason: "Authorised completion correction" })}>Complete</Button>
              <Button size="sm" variant="outline" className="border-gray-200 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setActionDialog({ open: true, action: "skip", reason: "" })}>Skip...</Button>
            </div>
          )}
        </div>
      </div>

      {failureResults.length > 0 && (
        <div className="m-4 p-4 rounded-xl bg-red-50 border border-red-200 flex flex-col gap-3 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-red-800">Action failed for {failureResults.length} jobs</h3>
              <p className="text-sm text-red-700 mt-1">
                Some jobs could not be modified because the destination team has reached its capacity limit for the day.
                You can force this action to override the limits.
              </p>
            </div>
          </div>
          <div className="flex gap-2 ml-8">
            <Button variant="destructive" size="sm" onClick={() => handleAction(true)} disabled={resolveMutation.isPending}>
              {resolveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Force Action Anyway
            </Button>
            <Button variant="outline" size="sm" className="bg-white" onClick={() => { setFailureResults([]); setSelectedJobIds(new Set()); setActionDialog(p => ({...p, open: false})); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_rgba(0,0,0,0.05)]">
            <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50/80">
              <th className="p-3 w-12 text-center border-b border-gray-100">
                <Checkbox 
                  checked={filteredJobs.length > 0 && selectedJobIds.size === filteredJobs.length} 
                  onCheckedChange={toggleAll}
                  disabled={filteredJobs.length === 0}
                />
              </th>
              <th className="p-3 w-16 border-b border-gray-100 text-center">GS #</th>
              <th className="p-3 border-b border-gray-100 min-w-[200px]">Asset</th>
              <th className="p-3 w-32 border-b border-gray-100">Original Date</th>
              <th className="p-3 w-32 border-b border-gray-100">Current Date</th>
              <th className="p-3 w-20 border-b border-gray-100 text-right">Age</th>
              <th className="p-3 w-28 border-b border-gray-100">Status</th>
              <th className="p-3 w-36 border-b border-gray-100">Team</th>
              <th className="p-3 w-20 border-b border-gray-100 text-right">Mins</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredJobs.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <CheckCircle2 className="w-8 h-8 text-gray-300" />
                    <p>No unresolved work.</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredJobs.map(job => {
                const isSelected = selectedJobIds.has(job.id);
                const failureMsg = failureMap.get(job.id);
                const jobDate = new Date(job.scheduledDate);
                const ageDays = differenceInDays(today, jobDate);
                
                return (
                  <tr 
                    key={job.id} 
                    className={`transition-colors hover:bg-gray-50/50 ${isSelected ? "bg-[#00AECD]/10" : ""} ${failureMsg ? "bg-red-50/30" : ""}`}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).tagName === "A") {
                        return;
                      }
                      toggleJob(job.id);
                    }}
                  >
                    <td className="p-3 text-center align-top">
                      <Checkbox 
                        checked={isSelected} 
                        onCheckedChange={() => toggleJob(job.id)} 
                      />
                    </td>
                    <td className="p-3 text-center align-top font-mono text-[10px] text-gray-400 pt-3.5">
                      {(job as any).routeOrder ?? "—"}
                    </td>
                    <td className="p-3 align-top">
                      <a 
                        href={`/assets/${job.assetId}`} 
                        className="font-semibold text-gray-800 hover:text-primary hover:underline block leading-snug"
                        onClick={e => e.stopPropagation()}
                      >
                        {job.assetName}
                      </a>
                      <p className="text-[11px] text-gray-500 mt-0.5">{job.assetRef || job.suburb || "—"}</p>
                      {failureMsg && (
                        <p className="text-xs text-red-600 mt-2 font-medium bg-red-100/50 inline-block px-2 py-1 rounded">
                          {failureMsg}
                        </p>
                      )}
                    </td>
                    <td className="p-3 align-top text-gray-600 pt-3.5">
                      {job.originalScheduledDate ? format(new Date(job.originalScheduledDate), "d MMM yyyy") : "—"}
                    </td>
                    <td className="p-3 align-top text-gray-900 font-medium pt-3.5">
                      {format(jobDate, "d MMM yyyy")}
                    </td>
                    <td className="p-3 align-top text-right pt-3.5">
                      <Badge variant="outline" className={`${ageDays > 14 ? "bg-red-50 text-red-700 border-red-200" : "bg-orange-50 text-orange-700 border-orange-200"}`}>
                        {ageDays}d
                      </Badge>
                    </td>
                    <td className="p-3 align-top pt-3.5">
                      <span className="text-[11px] uppercase tracking-wider font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded">
                        {job.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="p-3 align-top pt-3.5">
                      {job.teamId ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getTeamColor(job.teamId) }} />
                          <span className="text-gray-700 truncate max-w-[120px]" title={getTeamName(job.teamId)}>
                            {getTeamName(job.teamId)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="p-3 align-top text-right font-medium text-gray-700 pt-3.5">
                      {(job as any).estimatedTimeMins ?? job.serviceTimeMins}m
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={actionDialog.open} onOpenChange={o => !o && setActionDialog(p => ({ ...p, open: false }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog.action === "keep" && "Keep Selected Jobs"}
              {actionDialog.action === "move" && "Move Selected Jobs"}
              {actionDialog.action === "reassign" && "Reassign Selected Jobs"}
              {actionDialog.action === "complete" && "Mark Selected Jobs Complete"}
              {actionDialog.action === "skip" && "Skip Selected Jobs"}
            </DialogTitle>
            <DialogDescription>
              You are about to {actionDialog.action === "complete" ? "mark" : actionDialog.action} {selectedJobIds.size} {selectedJobIds.size === 1 ? "job" : "jobs"}{actionDialog.action === "complete" ? " as complete" : ""}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {actionDialog.action === "move" && (
              <div className="space-y-2">
                <Label>Destination Date</Label>
                <Input 
                  type="date" 
                  value={actionDialog.destinationDate || ""} 
                  onChange={e => setActionDialog(p => ({ ...p, destinationDate: e.target.value }))} 
                />
              </div>
            )}

            {actionDialog.action === "reassign" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Destination Team</Label>
                  <Select value={actionDialog.destinationTeamId} onValueChange={v => setActionDialog(p => ({ ...p, destinationTeamId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select team..." /></SelectTrigger>
                    <SelectContent>
                      {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Move to new date (Optional)</Label>
                  <Input 
                    type="date" 
                    value={actionDialog.destinationDate || ""} 
                    onChange={e => setActionDialog(p => ({ ...p, destinationDate: e.target.value }))} 
                  />
                  <p className="text-[11px] text-gray-500">If left blank, the jobs will retain their current past dates.</p>
                </div>
              </div>
            )}

            {actionDialog.action === "skip" && (
              <div className="space-y-2">
                <Label>Reason for skipping <span className="text-red-500">*</span></Label>
                <Textarea 
                  value={actionDialog.reason || ""} 
                  onChange={e => setActionDialog(p => ({ ...p, reason: e.target.value }))}
                  placeholder="Why are these jobs being skipped? This will be recorded."
                  rows={3}
                />
              </div>
            )}
            
            {actionDialog.action !== "skip" && (
              <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Textarea 
                  value={actionDialog.reason || ""} 
                  onChange={e => setActionDialog(p => ({ ...p, reason: e.target.value }))}
                  placeholder={actionDialog.action === "complete" ? "Authorised completion correction" : "Optional notes for the audit log"}
                  rows={2}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(p => ({ ...p, open: false }))}>Cancel</Button>
            <Button 
              variant={actionDialog.action === "skip" ? "destructive" : "default"}
              onClick={() => handleAction(false)}
              disabled={resolveMutation.isPending}
            >
              {resolveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm {actionDialog.action === "skip" ? "Skip" : actionDialog.action === "complete" ? "Completion" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}