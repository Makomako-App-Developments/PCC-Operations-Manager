import { useState } from "react";
import { 
  useGetScheduleWeek, 
  getGetScheduleWeekQueryKey, 
  useListTeams, 
  getListTeamsQueryKey,
  useGenerateSchedule 
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { format, addWeeks, subWeeks, startOfWeek, endOfWeek } from "date-fns";
import { 
  ChevronLeft, ChevronRight, Zap, Route, CheckCircle2, Clock
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const BRAND = "#00AECD";

const TEAM_COLORS = [
  "#00AECD", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899", "#06b6d4"
];

export default function Schedule() {
  const [currentWeekDate, setCurrentWeekDate] = useState(new Date());
  const [selectedTeamId, setSelectedTeamId] = useState<string>("all");
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const weekStr = format(currentWeekDate, "yyyy-MM-dd");

  const { data: teamsData } = useListTeams({
    query: { queryKey: getListTeamsQueryKey() }
  });

  const { data: scheduleData, isLoading } = useGetScheduleWeek(
    { week: weekStr, ...(selectedTeamId !== "all" ? { teamId: selectedTeamId } : {}) },
    { query: { queryKey: getGetScheduleWeekQueryKey({ week: weekStr, teamId: selectedTeamId !== "all" ? selectedTeamId : undefined }) } }
  );

  const generateSchedule = useGenerateSchedule({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Schedule generated", description: `Generated ${data.jobsCreated} jobs.` });
        queryClient.invalidateQueries({ queryKey: ["/api/schedule"] });
      },
      onError: (err: any) => {
        toast({ title: "Generation failed", description: err?.message || "Unknown error", variant: "destructive" });
      }
    }
  });

  const handleGenerate = () => {
    const fromDate = format(startOfWeek(currentWeekDate, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const toDate = format(endOfWeek(currentWeekDate, { weekStartsOn: 1 }), "yyyy-MM-dd");
    generateSchedule.mutate({ data: { fromDate, toDate } });
  };

  const nextWeek = () => setCurrentWeekDate(d => addWeeks(d, 1));
  const prevWeek = () => setCurrentWeekDate(d => subWeeks(d, 1));

  const getTeamColor = (teamId?: string | null) => {
    if (!teamId || !teamsData) return "#94a3b8";
    const idx = teamsData.findIndex(t => t.id === teamId);
    return TEAM_COLORS[idx % TEAM_COLORS.length] || "#94a3b8";
  };

  const getTeamName = (teamId?: string | null) => {
    if (!teamId || !teamsData) return "Unassigned";
    return teamsData.find(t => t.id === teamId)?.name || "Unassigned";
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f5f7f9]">
      <header className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-10 flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Maintenance Scheduler</h1>
          <p className="text-xs text-gray-400">
            {scheduleData ? `Week of ${format(new Date(scheduleData.weekStart), "d MMM")} – ${format(new Date(scheduleData.weekEnd), "d MMM yyyy")}` : "Loading..."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            size="sm" 
            style={{ background: BRAND }} 
            className="text-white hover:opacity-90"
            onClick={handleGenerate}
            disabled={generateSchedule.isPending}
            data-testid="btn-generate-schedule"
          >
            {generateSchedule.isPending ? "Generating..." : "Generate Schedule"}
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-8 space-y-5">
        <div className="flex items-center gap-4">
          <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
            <SelectTrigger className="w-48 rounded-xl text-sm bg-white" data-testid="select-team">
              <SelectValue placeholder="All Teams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Teams</SelectItem>
              {teamsData?.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={prevWeek}
              className="p-1.5 rounded-lg bg-white shadow-sm border text-gray-500 hover:text-gray-800"
              data-testid="btn-prev-week"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-gray-600 font-medium px-2">
              {scheduleData ? `${format(new Date(scheduleData.weekStart), "MMM d")}` : "..."}
            </span>
            <button
              onClick={nextWeek}
              className="p-1.5 rounded-lg bg-white shadow-sm border text-gray-500 hover:text-gray-800"
              data-testid="btn-next-week"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Stats summary */}
        {scheduleData && (
          <div className="flex gap-4">
             <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center gap-4">
               <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                 <Route className="w-5 h-5 text-blue-600" />
               </div>
               <div>
                 <p className="text-2xl font-bold text-gray-900 leading-none">{scheduleData.totalJobs}</p>
                 <p className="text-xs text-gray-500 mt-1">Total Scheduled Jobs</p>
               </div>
             </div>
             <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center gap-4">
               <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
                 <CheckCircle2 className="w-5 h-5 text-green-600" />
               </div>
               <div>
                 <p className="text-2xl font-bold text-gray-900 leading-none">{scheduleData.completedJobs}</p>
                 <p className="text-xs text-gray-500 mt-1">Completed Jobs</p>
               </div>
             </div>
          </div>
        )}

        {isLoading ? (
          <Skeleton className="w-full h-96 rounded-2xl" />
        ) : scheduleData?.days ? (
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
            {scheduleData.days.map((day) => {
              const dateObj = new Date(day.date);
              const isToday = format(new Date(), "yyyy-MM-dd") === day.date;
              
              return (
                <Card key={day.date} className={`rounded-xl border-0 shadow-sm flex flex-col h-[600px] ${isToday ? 'ring-2 ring-[#00AECD]' : ''}`}>
                  <div className="px-4 py-3 border-b bg-gray-50/50 flex-shrink-0 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase">{format(dateObj, "EEEE")}</p>
                      <p className="text-sm font-semibold text-gray-900">{format(dateObj, "d MMM")}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] bg-white">
                      {day.jobs.length} jobs
                    </Badge>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50">
                    {day.jobs.length === 0 ? (
                      <p className="text-center text-xs text-gray-400 py-4 italic">No jobs scheduled</p>
                    ) : (
                      day.jobs.map((job) => {
                        const isComplete = job.status === "completed";
                        const isSkipped = job.status === "skipped";
                        const isOverdue = job.status === "overdue";
                        const inProgress = job.status === "in_progress";
                        
                        return (
                          <div 
                            key={job.id} 
                            className={`p-3 rounded-lg border shadow-sm bg-white relative overflow-hidden transition-all ${
                              isComplete ? 'opacity-60 border-gray-200' : 
                              isSkipped ? 'border-orange-200 bg-orange-50' :
                              inProgress ? 'border-[#00AECD] ring-1 ring-[#00AECD]' :
                              isOverdue ? 'border-red-200 bg-red-50' : 'border-gray-200'
                            }`}
                          >
                            <div 
                              className="absolute top-0 left-0 w-1 h-full" 
                              style={{ background: getTeamColor(job.teamId) }} 
                            />
                            <div className="pl-2">
                              <div className="flex justify-between items-start mb-1">
                                <p className={`text-xs font-semibold truncate pr-2 ${isComplete || isSkipped ? 'line-through text-gray-500' : 'text-gray-900'}`} title={job.assetName}>
                                  {job.assetName}
                                </p>
                              </div>
                              <p className="text-[10px] text-gray-500 font-mono mb-2">{job.assetRef}</p>
                              
                              <div className="flex flex-wrap gap-1 mb-2">
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 truncate max-w-[100px]">
                                  {job.gardenType.replace("_", " ")}
                                </span>
                                {isComplete && <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">Done</span>}
                                {isSkipped && <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">Skipped</span>}
                                {isOverdue && <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">Overdue</span>}
                              </div>
                              
                              <div className="flex items-center justify-between text-[10px] text-gray-400 mt-2 pt-2 border-t border-gray-100">
                                <span>{getTeamName(job.teamId)}</span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" /> {job.serviceTimeMins}m
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
