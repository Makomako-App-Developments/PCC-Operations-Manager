import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetCurrentStormPatrol, 
  useListStormPatrolEvents, 
  useCreateStormPatrolEvent,
  getGetCurrentStormPatrolQueryKey,
  getListStormPatrolEventsQueryKey,
} from "@workspace/api-client-react";
import { Loader2, Plus, CloudLightning, Archive, Calendar, DollarSign, Download, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import CommandCenter from "./components/CommandCenter";

function escapeCsv(val: any) {
  if (val == null) return '""';
  const str = String(val);
  if (str.includes('"') || str.includes(',')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

export default function StormPatrol() {
  const { data: currentData, isLoading: currentLoading } = useGetCurrentStormPatrol({
    query: { refetchInterval: 15000, queryKey: getGetCurrentStormPatrolQueryKey() }
  });
  
  const { data: eventsData, isLoading: eventsLoading } = useListStormPatrolEvents({
    query: { queryKey: getListStormPatrolEventsQueryKey() }
  });
  const createEvent = useCreateStormPatrolEvent();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isCreating, setIsCreating] = useState(false);
  const [eventName, setEventName] = useState("");
  const [hourlyRate, setHourlyRate] = useState<number | "">("");

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventName || !hourlyRate) return;
    
    try {
      await createEvent.mutateAsync({
        data: {
          name: eventName,
          hourlyRateCents: Math.round(Number(hourlyRate) * 100),
          activate: true,
        }
      });
      toast({ title: "Storm event activated" });
      setIsCreating(false);
      setEventName("");
      setHourlyRate("");
      queryClient.invalidateQueries({ queryKey: getGetCurrentStormPatrolQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListStormPatrolEventsQueryKey() });
    } catch (err: any) {
      toast({ title: "Failed to create event", description: err.message, variant: "destructive" });
    }
  };

  const handleDownloadReport = async (eventId: string, eventName: string) => {
    try {
      const res = await fetch(`/api/storm-patrol/events/${eventId}/report`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load report");
      const report = await res.json();
      
      const csv = [
        ["Event Name", "Status", "Total Jobs", "Completed Jobs", "Total Hours", "Labour Charge ($)"],
        [
          escapeCsv(report.event.name),
          escapeCsv(report.event.status),
          escapeCsv(report.selectedCount),
          escapeCsv(report.checkedCount),
          escapeCsv(report.totalHours.toFixed(2)),
          escapeCsv((report.labourChargeCents / 100).toFixed(2))
        ],
        [],
        ["Jobs"],
        ["ID", "Phase", "Asset ID", "Team ID", "Status", "Time (Mins)", "Comments"],
        ...(report.jobs || []).map((j: any) => [
          escapeCsv(j.id),
          escapeCsv(j.phase),
          escapeCsv(j.assetId),
          escapeCsv(j.teamId),
          escapeCsv(j.status),
          escapeCsv(j.actualTimeMins),
          escapeCsv(j.comments)
        ])
      ].map(r => r.join(",")).join("\n");

      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; 
      a.download = `Storm-Report-${eventName.replace(/[^a-z0-9]/gi, '_')}.csv`; 
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "Report generation failed", description: err.message, variant: "destructive" });
    }
  };

  if (currentLoading || eventsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#00AECD]" />
      </div>
    );
  }

  const activeEventData = currentData?.data;

  if (activeEventData?.event) {
    return <CommandCenter data={activeEventData} />;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0f2a36] text-white">
      <div className="flex-1 overflow-y-auto px-8 py-10">
        
        <div className="max-w-4xl mx-auto space-y-12">
          {/* Header */}
          <div>
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#00AECD]/20 mb-4">
              <CloudLightning className="w-6 h-6 text-[#00AECD]" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Storm Patrol Command</h1>
            <p className="text-white/60 text-lg">
              No active storm event. Activate a new event to begin coordinating field work and tracking jobs.
            </p>
          </div>

          {/* Create Section */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8">
            <h2 className="text-xl font-semibold text-white mb-6">Activate New Event</h2>
            <form onSubmit={handleCreateEvent} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="eventName" className="text-white/80">Event Name</Label>
                  <Input 
                    id="eventName"
                    value={eventName}
                    onChange={e => setEventName(e.target.value)}
                    placeholder="e.g. Cyclone Gabrielle Response"
                    className="bg-black/20 border-white/10 text-white placeholder:text-white/30 h-11"
                    data-testid="input-event-name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hourlyRate" className="text-white/80">Hourly Rate (NZD)</Label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                    <Input 
                      id="hourlyRate"
                      type="number"
                      min="0"
                      step="0.01"
                      value={hourlyRate}
                      onChange={e => setHourlyRate(e.target.value ? Number(e.target.value) : "")}
                      placeholder="85.50"
                      className="pl-9 bg-black/20 border-white/10 text-white placeholder:text-white/30 h-11"
                      data-testid="input-hourly-rate"
                      required
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end">
                <Button 
                  type="submit" 
                  disabled={createEvent.isPending || !eventName || !hourlyRate}
                  className="bg-[#00AECD] hover:bg-[#00AECD]/90 text-white h-11 px-8 rounded-xl font-semibold shadow-lg shadow-[#00AECD]/20"
                  data-testid="button-activate-event"
                >
                  {createEvent.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CloudLightning className="w-4 h-4 mr-2" />}
                  Activate Event
                </Button>
              </div>
            </form>
          </div>

          {/* Historical Events */}
          <div>
            <div className="flex items-center gap-3 mb-6">
              <Archive className="w-5 h-5 text-white/40" />
              <h2 className="text-lg font-semibold text-white/90">Previous Events</h2>
            </div>
            
            {!eventsData?.data || eventsData.data.length === 0 ? (
              <div className="text-center py-12 bg-white/5 border border-white/10 rounded-2xl border-dashed">
                <p className="text-white/40">No historical events found.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {eventsData.data.filter(e => e.status !== "active").map(event => (
                  <div key={event.id} className="bg-black/20 border border-white/5 rounded-xl p-4 flex items-center justify-between group hover:bg-black/40 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                        <CloudLightning className="w-5 h-5 text-white/40" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">{event.name}</h3>
                        <div className="flex items-center gap-3 mt-1 text-xs text-white/40">
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {event.activatedAt ? format(new Date(event.activatedAt), "d MMM yyyy") : "Unknown"}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> {(event.hourlyRateCents / 100).toFixed(2)}/hr</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleDownloadReport(event.id, event.name)}
                        className="p-2 rounded-lg bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                        title="Download Report CSV"
                        data-testid={`btn-download-${event.id}`}
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
