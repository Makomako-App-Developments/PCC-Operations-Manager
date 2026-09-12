import React, { useState, useMemo, useEffect, useRef } from "react";
import { 
  Asset,
  StormCurrentResponseData, 
  StormJob,
  StormwaterAssetDetails, 
  useListTeams, 
  useListAssets,
  usePublishStormPatrolPackage,
  useCloseStormPatrolEvent,
  useCreateStormPatrolAlert,
  useAcknowledgeStormPatrolAlert,
  useRetryStormPatrolAlertEmail,
  getGetStormPatrolReportUrl,
  getGetCurrentStormPatrolQueryKey,
  getListStormPatrolEventsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  CloudLightning, Loader2, Plus, Users, MapPin, Search, Check, ChevronDown, ChevronUp,
  AlertTriangle, Eye, ArrowRight, Save, Download, Navigation, Clock, ClipboardCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { AuthenticatedImage } from "@/components/authenticated-image";
import StormwaterAssetImport from "./StormwaterAssetImport";
import { format } from "date-fns";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const BRAND = "#00AECD";
const RED = "#ef4444";
const ORANGE = "#f97316";
const YELLOW = "#eab308";
const GREEN = "#22c55e";

type PriorityFilter = "all" | StormwaterAssetDetails["priority"];
type HotspotFilter = "all" | StormwaterAssetDetails["hotspot"];
type StormObservation = {
  id: string;
  eventId: string;
  description: string;
  notes?: string | null;
  locationLat: number;
  locationLng: number;
  reactiveJobId?: string | null;
  createdAt: string;
  photos: Array<{
    id: string;
    blobUrl: string;
    caption?: string | null;
  }>;
};

export function filterStormwaterAssets(
  assets: Asset[],
  search: string,
  priority: PriorityFilter,
  hotspot: HotspotFilter,
) {
  const query = search.trim().toLowerCase();

  return assets.filter((asset) => {
    const details = asset.departmentDetails as StormwaterAssetDetails | null;
    const matchesSearch = !query
      || asset.name.toLowerCase().includes(query)
      || asset.streetAddress?.toLowerCase().includes(query);
    const matchesPriority = priority === "all" || details?.priority === priority;
    const matchesHotspot = hotspot === "all" || details?.hotspot === hotspot;

    return matchesSearch && matchesPriority && matchesHotspot;
  });
}

const PRIORITY_STYLES: Record<StormwaterAssetDetails["priority"], string> = {
  High: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  Medium: "bg-amber-500/15 text-amber-300 border-amber-500/25",
  Low: "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

function FitBounds({ assets }: { assets: any[] }) {
  const map = useMap();
  React.useEffect(() => {
    if (assets.length === 0) return;
    const lats = assets.map(a => a.lat).filter(Boolean);
    const lngs = assets.map(a => a.lng).filter(Boolean);
    if (lats.length === 0 || lngs.length === 0) return;
    
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    
    map.fitBounds([[minLat, minLng], [maxLat, maxLng]], { padding: [20, 20], maxZoom: 16 });
  }, [assets, map]);
  return null;
}

interface CommandCenterProps {
  data: StormCurrentResponseData;
}

export default function CommandCenter({ data }: CommandCenterProps) {
  const { event, jobs, summary } = data!;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: teamsData } = useListTeams();
  const { data: assetsData } = useListAssets({ department: "stormwater", limit: 2000 });
  
  const publishPackage = usePublishStormPatrolPackage();
  const closeEvent = useCloseStormPatrolEvent();
  const ackAlert = useAcknowledgeStormPatrolAlert();
  const createAlert = useCreateStormPatrolAlert();
  const retryEmail = useRetryStormPatrolAlertEmail();
  
  const [isAlerting, setIsAlerting] = useState(false);
  const [selectedCompletedJob, setSelectedCompletedJob] = useState<StormJob | null>(null);
  const [selectedObservation, setSelectedObservation] = useState<StormObservation | null>(null);

  const teams = teamsData || [];
  const assets = assetsData?.data || [];
  const observations = (data?.observations ?? []) as unknown as StormObservation[];

  const [activeTab, setActiveTab] = useState<"overview" | "jobs" | "packages">("overview");

  // Create Work Package State
  const [selectedPhase, setSelectedPhase] = useState<"pre" | "mid" | "post">("pre");
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [assetSearch, setAssetSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [hotspotFilter, setHotspotFilter] = useState<HotspotFilter>("all");
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [isPackageCollapsed, setIsPackageCollapsed] = useState(false);
  const [lastPublishedSiteCount, setLastPublishedSiteCount] = useState(0);
  const hasInitializedPackageView = useRef(false);

  useEffect(() => {
    if (hasInitializedPackageView.current) return;
    hasInitializedPackageView.current = true;
    if (jobs.length > 0) setIsPackageCollapsed(true);
  }, [jobs.length]);

  // Alerts & Observations State
  const [alertMessage, setAlertMessage] = useState("");

  const handlePublishPackage = async () => {
    if (!selectedTeam || selectedAssets.size === 0) return;
    try {
      await publishPackage.mutateAsync({
        id: event.id,
        data: {
          phase: selectedPhase,
          teamId: selectedTeam,
          assetIds: Array.from(selectedAssets),
          idempotencyKey: crypto.randomUUID(),
        }
      });
      toast({ title: "Work package published", description: `${selectedAssets.size} jobs assigned.` });
      setLastPublishedSiteCount(selectedAssets.size);
      setIsPackageCollapsed(true);
      setSelectedAssets(new Set());
      queryClient.invalidateQueries({ queryKey: getGetCurrentStormPatrolQueryKey() });
    } catch (err: any) {
      toast({ title: "Failed to publish", description: err.message, variant: "destructive" });
    }
  };

  const handleCloseEvent = async () => {
    if (!window.confirm(`Are you sure you want to close "${event.name}"?`)) return;
    try {
      await closeEvent.mutateAsync({ id: event.id });
      toast({ title: "Storm event closed" });
      queryClient.invalidateQueries({ queryKey: getGetCurrentStormPatrolQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListStormPatrolEventsQueryKey() });
    } catch (err: any) {
      toast({ title: "Failed to close event", description: err.message, variant: "destructive" });
    }
  };

  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alertMessage.trim()) return;
    try {
      setIsAlerting(true);
      await createAlert.mutateAsync({
        data: {
          eventId: event.id,
          message: alertMessage,
          idempotencyKey: crypto.randomUUID(),
        },
      });
      toast({ title: "Alert broadcasted" });
      setAlertMessage("");
      queryClient.invalidateQueries({ queryKey: getGetCurrentStormPatrolQueryKey() });
    } catch (err: any) {
      toast({ title: "Failed to create alert", description: err.message, variant: "destructive" });
    } finally {
      setIsAlerting(false);
    }
  };

  const filteredAssets = useMemo(() => {
    return filterStormwaterAssets(assets, assetSearch, priorityFilter, hotspotFilter);
  }, [assets, assetSearch, priorityFilter, hotspotFilter]);
  const allocatedAssetIds = useMemo(
    () => new Set(jobs.filter(job => job.phase === selectedPhase).map(job => job.assetId)),
    [jobs, selectedPhase],
  );
  const selectableFilteredAssets = useMemo(
    () => filteredAssets.filter(asset => !allocatedAssetIds.has(asset.id)),
    [filteredAssets, allocatedAssetIds],
  );
  const mapFocusAssets = useMemo(
    () => filteredAssets.filter(asset => selectedAssets.has(asset.id) || allocatedAssetIds.has(asset.id)),
    [filteredAssets, selectedAssets, allocatedAssetIds],
  );

  const hasActiveAssetFilters =
    assetSearch.trim().length > 0 || priorityFilter !== "all" || hotspotFilter !== "all";

  const resetAssetFilters = () => {
    setAssetSearch("");
    setPriorityFilter("all");
    setHotspotFilter("all");
  };

  const toggleAsset = (id: string) => {
    if (allocatedAssetIds.has(id)) return;
    const next = new Set(selectedAssets);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedAssets(next);
  };

  const selectAllFiltered = () => {
    const next = new Set(selectedAssets);
    const allAdded = selectableFilteredAssets.length > 0 && selectableFilteredAssets.every(a => next.has(a.id));
    if (allAdded) {
      selectableFilteredAssets.forEach(a => next.delete(a.id));
    } else {
      selectableFilteredAssets.forEach(a => next.add(a.id));
    }
    setSelectedAssets(next);
  };

  return (
    <div className="storm-patrol-teal flex-1 flex flex-col h-full text-white overflow-hidden">
      <style>{`
        .storm-patrol-teal {
          background: linear-gradient(135deg, #0c6670 0%, #0e5360 55%, #124b59 100%);
        }
        .storm-patrol-teal > header {
          background: #092f3b !important;
          border-color: rgba(111, 224, 226, 0.22) !important;
          box-shadow: 0 8px 22px rgba(3, 31, 39, 0.13);
        }
        .storm-patrol-teal [class*="bg-white/5"] {
          background: rgba(13, 44, 54, 0.84) !important;
          border-color: rgba(111, 224, 226, 0.22) !important;
          box-shadow: 0 8px 22px rgba(2, 28, 34, 0.16), inset 0 1px 0 rgba(170, 255, 250, 0.05);
        }
        .storm-patrol-teal [class*="bg-black/20"] {
          background: rgba(9, 48, 58, 0.62) !important;
        }
        .storm-patrol-teal [class*="border-white/10"] {
          border-color: rgba(111, 224, 226, 0.22) !important;
        }
        .storm-patrol-teal [class*="bg-white/5"] [class*="bg-white/5"] {
          background: rgba(23, 69, 80, 0.72) !important;
        }
        .storm-patrol-teal [class*="text-white/60"] {
          color: #9bc2c5 !important;
        }
        .storm-patrol-teal [class*="text-white/40"] {
          color: #79a5aa !important;
        }
        .storm-patrol-teal [class*="text-[#00AECD]"] {
          color: #31d8df !important;
        }
        .storm-patrol-teal [class*="bg-[#00AECD]"] {
          background: #16aeb8 !important;
        }
        .storm-patrol-teal [class*="hover\\:bg-[#00AECD]"]:hover {
          background: #23c7ce !important;
        }
      `}</style>
      {/* Header */}
      <header className="px-6 py-5 border-b border-white/10 flex-shrink-0 flex items-center justify-between bg-black/20">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center border border-red-500/30">
            <CloudLightning className="w-6 h-6 text-red-500 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-white tracking-tight">{event.name}</h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-500 text-white">Active</span>
            </div>
            <div className="flex items-center gap-4 mt-1 text-xs text-white/50">
              <span>Activated: {event.activatedAt ? format(new Date(event.activatedAt), "HH:mm, d MMM") : "Unknown"}</span>
              <span>•</span>
              <span>Rate: ${(event.hourlyRateCents / 100).toFixed(2)}/hr</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            className="bg-transparent border-white/10 text-white hover:bg-white/10"
            onClick={() => {
              const a = document.createElement("a");
              a.href = `${getGetStormPatrolReportUrl(event.id)}?format=csv`;
              a.click();
            }}
            data-testid="btn-download-active-report"
          >
            <Download className="w-4 h-4 mr-2" />
            CSV
          </Button>
          <Button
            variant="outline"
            className="bg-transparent border-white/10 text-white hover:bg-white/10"
            onClick={() => {
              const a = document.createElement("a");
              a.href = `${getGetStormPatrolReportUrl(event.id)}?format=pdf`;
              a.click();
            }}
          >
            PDF
          </Button>
          <Button 
            variant="outline" 
            className="bg-red-500/20 border-red-500/30 text-red-500 hover:bg-red-500/30 hover:text-red-400"
            onClick={handleCloseEvent}
            disabled={closeEvent.isPending}
            data-testid="btn-close-event"
          >
            {closeEvent.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Close Event
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            
            {/* Left Column: Stats & Alerts */}
            <div className="lg:col-span-1 space-y-6">
              {/* Stats */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">Live Status</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-3xl font-black text-white">{jobs.length}</p>
                    <p className="text-xs text-white/40 font-medium">Total Jobs</p>
                  </div>
                  <div>
                    <p className="text-3xl font-black text-[#00AECD]">{jobs.filter(j => j.status === 'completed').length}</p>
                    <p className="text-xs text-[#00AECD]/60 font-medium">Completed</p>
                  </div>
                  <div>
                    <p className="text-3xl font-black text-orange-500">{jobs.filter(j => j.status === 'in_progress').length}</p>
                    <p className="text-xs text-orange-500/60 font-medium">In Progress</p>
                  </div>
                  <div>
                    <p className="text-3xl font-black text-red-500">{jobs.filter(j => j.comments?.includes('dangerous') || j.actualTimeMins === 0 && j.status === 'completed').length}</p>
                    <p className="text-xs text-red-500/60 font-medium">Escalations</p>
                  </div>
                </div>
              </div>

              
              {/* Active Alerts */}
              {data?.alerts && data.alerts.length > 0 && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                  <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Active Alerts
                  </h3>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {data.alerts.map(alert => (
                      <div key={alert.id} className={`p-3 rounded-lg border ${!alert.acknowledgedAt ? "bg-orange-500/10 border-orange-500/30" : "bg-black/20 border-white/5"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm ${!alert.acknowledgedAt ? "text-orange-100" : "text-white/60"}`}>{alert.message}</p>
                          {!alert.acknowledgedAt && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={async () => {
                                try {
                                  await ackAlert.mutateAsync({ id: alert.id });
                                  queryClient.invalidateQueries({ queryKey: getGetCurrentStormPatrolQueryKey() });
                                } catch (e) {
                                  console.error(e);
                                }
                              }}
                              className="h-6 text-[10px] px-2 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border-orange-500/30"
                            >
                              Ack
                            </Button>
                          )}
                        </div>
                        {alert.acknowledgedAt && (
                          <p className="text-[10px] text-white/40 mt-1">Ack'd {format(new Date(alert.acknowledgedAt), "HH:mm")}</p>
                        )}
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <p className={`text-[10px] ${alert.emailStatus === "sent" ? "text-green-400" : alert.emailStatus === "failed" ? "text-red-400" : "text-white/40"}`}>
                            Email {alert.emailStatus}{alert.emailAttempts ? ` · ${alert.emailAttempts} attempt${alert.emailAttempts === 1 ? "" : "s"}` : ""}
                          </p>
                          {alert.emailStatus === "failed" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={retryEmail.isPending}
                              onClick={async () => {
                                await retryEmail.mutateAsync({ id: alert.id });
                                queryClient.invalidateQueries({ queryKey: getGetCurrentStormPatrolQueryKey() });
                              }}
                              className="h-6 text-[10px] px-2 bg-red-500/10 text-red-300 border-red-500/30"
                            >
                              Retry email
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Field Observations */}
              {observations.length > 0 && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                  <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Eye className="w-4 h-4" /> Field Observations
                  </h3>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {observations.map((obs) => (
                      <button
                        key={obs.id}
                        type="button"
                        className="w-full cursor-pointer rounded-lg bg-black/20 border border-white/5 p-3 text-left transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00AECD]"
                        aria-label={`Open field observation: ${obs.description}`}
                        onClick={() => setSelectedObservation(obs)}
                      >
                        <p className="text-sm font-medium text-white/90 mb-1">{obs.description}</p>
                        {obs.notes && <p className="text-xs text-white/60 mb-2">{obs.notes}</p>}
                        
                        {/* Check if a follow-up job exists */}
                        {data?.followUps?.find((f: any) => f.id === obs.reactiveJobId) ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-400 bg-green-400/10 px-2 py-0.5 rounded">
                            <Check className="w-3 h-3" /> Job Created
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-white/40">
                            Logged {obs.createdAt ? format(new Date(obs.createdAt), "HH:mm") : ""}
                          </span>
                        )}
                        <span className="mt-2 block text-[10px] font-semibold uppercase tracking-wider text-[#65d8e8]">View details</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Broadcast Alert */}
              <div className="bg-[#0d2c36] border border-orange-500/30 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-5 h-5 text-orange-500" />
                  <h3 className="text-sm font-semibold text-orange-500 uppercase tracking-wider">Broadcast Alert</h3>
                </div>
                <form onSubmit={handleCreateAlert} className="space-y-3">
                  <Textarea 
                    value={alertMessage}
                    onChange={e => setAlertMessage(e.target.value)}
                    placeholder="Urgent message for all field teams..."
                    className="bg-black/20 border-orange-500/20 text-white placeholder:text-white/30 resize-none h-20"
                    data-testid="input-alert-message"
                    required
                  />
                  <Button 
                    type="submit" 
                    disabled={isAlerting || !alertMessage.trim()}
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold"
                    data-testid="btn-send-alert"
                  >
                    {isAlerting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Send to Field
                  </Button>
                </form>
              </div>

            </div>

            {/* Right Column: Work Packages & Jobs */}
            <div className="lg:col-span-3 space-y-6">
              
              {/* Package Creator */}
              <div className={`bg-white/5 border border-white/10 rounded-2xl p-6 ${isPackageCollapsed ? "" : "lg:h-[calc(100dvh-9rem)] lg:max-h-[calc(100dvh-9rem)] lg:min-h-0 flex flex-col"}`}>
                <div className={`flex items-center justify-between ${isPackageCollapsed ? "" : "mb-6"}`}>
                  <div className="flex items-center gap-3">
                    <Navigation className="w-5 h-5 text-[#00AECD]" />
                    <h2 className="text-lg font-semibold text-white">Create Work Package</h2>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsPackageCollapsed(collapsed => !collapsed)}
                    className="h-8 px-2 text-xs text-white/60 hover:text-white hover:bg-white/10"
                    aria-label={`${isPackageCollapsed ? "Expand" : "Collapse"} Create Work Package`}
                  >
                    {isPackageCollapsed ? <><ChevronDown className="w-4 h-4 mr-1" />Open</> : <><ChevronUp className="w-4 h-4 mr-1" />Collapse</>}
                  </Button>
                </div>

                {isPackageCollapsed ? (
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/60">
                    <span>
                      {lastPublishedSiteCount > 0
                        ? `Last package published: ${lastPublishedSiteCount} site${lastPublishedSiteCount === 1 ? "" : "s"}.`
                        : `${jobs.length} issued field job${jobs.length === 1 ? "" : "s"} ready for live operations.`}
                    </span>
                    <span className="text-green-400">Ready for the next package</span>
                  </div>
                ) : (
                <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                  <div className="space-y-2">
                    <Label className="text-white/60">Response Phase</Label>
                     <Select value={selectedPhase} onValueChange={v => {
                       setSelectedPhase(v as "pre" | "mid" | "post");
                       setSelectedAssets(new Set());
                     }}>
                      <SelectTrigger aria-label="Response phase" className="bg-black/20 border-white/10 h-10">
                        <SelectValue />
                      </SelectTrigger>
                       <SelectContent style={{ zIndex: 1000 }}>
                        <SelectItem value="pre">Pre-Storm Preparation</SelectItem>
                        <SelectItem value="mid">Mid-Storm Response</SelectItem>
                        <SelectItem value="post">Post-Storm Recovery</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-white/60">Assign To Team</Label>
                    <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                      <SelectTrigger aria-label="Assign to team" className="bg-black/20 border-white/10 h-10">
                        <SelectValue placeholder="Select team..." />
                      </SelectTrigger>
                       <SelectContent style={{ zIndex: 1000 }}>
                        {teams.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 flex flex-col justify-end">
                    <Button 
                      onClick={handlePublishPackage}
                      disabled={publishPackage.isPending || !selectedTeam || selectedAssets.size === 0}
                      className="bg-[#00AECD] hover:bg-[#00AECD]/90 text-white h-10 font-semibold"
                      data-testid="btn-publish-package"
                    >
                      {publishPackage.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                      Publish ({selectedAssets.size} Sites)
                    </Button>
                  </div>
                </div>

                <StormwaterAssetImport />

                {/* Asset Selector & Map Preview */}
                <div className="border border-white/10 rounded-xl overflow-hidden bg-black/20 flex flex-col flex-1 min-h-0">
                  <div className="p-3 border-b border-white/10 bg-white/5 space-y-3">
                    <div className="flex flex-col xl:flex-row xl:items-center gap-2">
                      <div className="relative min-w-0 flex-1">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                        <Input
                          value={assetSearch}
                          onChange={e => setAssetSearch(e.target.value)}
                          placeholder="Search stormwater assets..."
                          aria-label="Search stormwater assets"
                          className="pl-9 h-9 bg-black/20 border-white/10 text-xs text-white placeholder:text-white/30"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2 xl:w-[360px]">
                        <Select value={priorityFilter} onValueChange={v => setPriorityFilter(v as PriorityFilter)}>
                          <SelectTrigger
                            aria-label="Filter sites by priority"
                            className="h-9 bg-black/20 border-white/10 text-xs text-white"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent style={{ zIndex: 1000 }}>
                            <SelectItem value="all">All priorities</SelectItem>
                            <SelectItem value="High">High priority</SelectItem>
                            <SelectItem value="Medium">Medium priority</SelectItem>
                            <SelectItem value="Low">Low priority</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={hotspotFilter} onValueChange={v => setHotspotFilter(v as HotspotFilter)}>
                          <SelectTrigger
                            aria-label="Filter sites by hotspot"
                            className="h-9 bg-black/20 border-white/10 text-xs text-white"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent style={{ zIndex: 1000 }}>
                            <SelectItem value="all">All sites</SelectItem>
                            <SelectItem value="Yes">Hotspots</SelectItem>
                            <SelectItem value="No">Not hotspots</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-3">
                        <span className="text-white/60" data-testid="asset-filter-count">
                          Showing <strong className="text-white">{filteredAssets.length}</strong> of {assets.length}
                        </span>
                        {hasActiveAssetFilters && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={resetAssetFilters}
                            className="h-7 px-2 text-xs text-[#65d8e8] hover:text-white hover:bg-white/10"
                          >
                            Clear filters
                          </Button>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-white/60">Selected: <strong className="text-white">{selectedAssets.size}</strong></span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={selectAllFiltered}
                           disabled={selectableFilteredAssets.length === 0}
                          className="h-8 text-xs text-white/60 hover:text-white hover:bg-white/10"
                        >
                           {selectableFilteredAssets.length > 0 && selectableFilteredAssets.every(a => selectedAssets.has(a.id))
                             ? "Deselect All"
                             : "Select All Filtered"}
                        </Button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex-1 flex overflow-hidden">
                    {/* List */}
                    <div className="w-[40%] flex-shrink-0 border-r border-white/10 overflow-y-auto p-2 space-y-1">
                      {filteredAssets.length === 0 ? (
                        <div className="text-center py-8 px-4 text-white/50 text-sm">
                          <p>No sites match these filters.</p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={resetAssetFilters}
                            className="mt-2 h-8 text-xs text-[#65d8e8] hover:text-white hover:bg-white/10"
                          >
                            Reset filters
                          </Button>
                        </div>
                      ) : (
                        filteredAssets.map(asset => {
                          const details = asset.departmentDetails as StormwaterAssetDetails;
                           const isAllocated = allocatedAssetIds.has(asset.id);
                           const isSelected = selectedAssets.has(asset.id);
                          return (
                            <label
                              key={asset.id}
                               className={`flex items-start gap-3 p-2 rounded-lg transition-colors ${
                                 isAllocated
                                   ? "bg-blue-500/15 border-blue-400/30 cursor-not-allowed"
                                   : isSelected
                                     ? "bg-[#00AECD]/20 border-[#00AECD]/30 cursor-pointer"
                                     : "hover:bg-white/5 border-transparent cursor-pointer"
                               } border`}
                            >
                              <input
                                type="checkbox"
                                aria-label={`Select ${asset.name}`}
                                className="mt-1 flex-shrink-0 accent-[#00AECD] border-white/20 rounded bg-black/40"
                                 checked={isSelected || isAllocated}
                                 disabled={isAllocated}
                                onChange={() => toggleAsset(asset.id)}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-white truncate">{asset.name}</p>
                                <p className="text-xs text-white/40 truncate">{asset.streetAddress || "No address"}</p>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                {details?.priority && (
                                  <span className={`px-2 py-0.5 rounded border text-[10px] font-semibold uppercase ${PRIORITY_STYLES[details.priority]}`}>
                                    {details.priority}
                                  </span>
                                )}
                                {details?.hotspot === "Yes" && (
                                  <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] font-bold">HOTSPOT</span>
                                )}
                                 {isAllocated && (
                                   <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-200 text-[10px] font-bold">ALLOCATED</span>
                                 )}
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                    
                    {/* Map */}
                    <div className="flex-1 relative bg-black">
                      <MapContainer
                        center={[-41.133, 174.833]}
                        zoom={12}
                        style={{ width: "100%", height: "100%" }}
                        zoomControl={true}
                        attributionControl={true}
                      >
                        <TileLayer
                           url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                           attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        />
                         <FitBounds assets={mapFocusAssets} />
                        
                        {filteredAssets.map(asset => {
                          if (!asset.lat || !asset.lng) return null;
                           const isAllocated = allocatedAssetIds.has(asset.id);
                           const isSelected = selectedAssets.has(asset.id);
                           const isMarked = isSelected || isAllocated;
                          const isHotspot = (asset.departmentDetails as StormwaterAssetDetails)?.hotspot === "Yes";
                          
                           let color = "#111827"; // black for standard sites
                           let fillColor = "transparent";
                           if (isMarked) {
                             color = "#2563eb";
                             fillColor = "#2563eb";
                          } else if (isHotspot) {
                            color = "#ef4444"; // red-500
                          }

                          return (
                            <CircleMarker
                              key={asset.id}
                              center={[asset.lat, asset.lng]}
                                radius={isMarked ? 8 : 5}
                               pathOptions={{
                                 color,
                                 fillColor,
                                  fillOpacity: isMarked ? 1 : 0,
                                  weight: isMarked ? 3 : 2,
                               }}
                              eventHandlers={{
                                 click: () => toggleAsset(asset.id)
                              }}
                            >
                              <Popup className="bg-[#0f2a36] text-white border border-white/10 rounded-lg">
                                <div className="p-1">
                                  <h4 className="font-bold text-sm text-gray-900">{asset.name}</h4>
                                  <p className="text-xs text-gray-500 mb-2">{asset.streetAddress}</p>
                                  <Button 
                                    size="sm"
                                     onClick={() => toggleAsset(asset.id)}
                                     disabled={isAllocated}
                                     className={`w-full h-7 text-xs ${isAllocated ? 'bg-blue-500/20 text-blue-200' : isSelected ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20' : 'bg-[#00AECD] text-white hover:bg-[#00AECD]/90'}`}
                                  >
                                     {isAllocated ? "Already allocated" : isSelected ? "Remove from Package" : "Add to Package"}
                                  </Button>
                                </div>
                              </Popup>
                            </CircleMarker>
                          );
                        })}
                      </MapContainer>
                    </div>
                  </div>
                </div>
                </>
                )}
              </div>

              {/* Live Jobs Table */}
              <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden flex flex-col h-[400px]">
                <div className="p-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
                  <h2 className="text-base font-semibold text-white">Live Field Operations</h2>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 text-xs text-white/60">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                      Auto-syncing
                    </span>
                  </div>
                </div>
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-black/20 text-white/50 sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-3 font-medium">Phase</th>
                        <th className="px-4 py-3 font-medium">Site</th>
                        <th className="px-4 py-3 font-medium">Team</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Comments</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {jobs.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-white/40">No jobs dispatched yet.</td>
                        </tr>
                      ) : (
                        jobs.map(job => {
                          return (
                            <tr
                              key={job.id}
                              className={`hover:bg-white/5 transition-colors ${
                                job.status === "completed" || job.status === "too_dangerous"
                                  ? "cursor-pointer focus-visible:outline-none focus-visible:bg-white/10"
                                  : ""
                              }`}
                              tabIndex={job.status === "completed" || job.status === "too_dangerous" ? 0 : undefined}
                              aria-label={job.status === "completed" || job.status === "too_dangerous"
                                ? `Open completed work for ${job.assetName || "Unknown Asset"}`
                                : undefined}
                              onClick={() => {
                                if (job.status === "completed" || job.status === "too_dangerous") {
                                  setSelectedCompletedJob(job);
                                }
                              }}
                              onKeyDown={(event) => {
                                if (
                                  (job.status === "completed" || job.status === "too_dangerous")
                                  && (event.key === "Enter" || event.key === " ")
                                ) {
                                  event.preventDefault();
                                  setSelectedCompletedJob(job);
                                }
                              }}
                            >
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                                  job.phase === 'pre' ? 'bg-yellow-500/20 text-yellow-500' :
                                  job.phase === 'mid' ? 'bg-orange-500/20 text-orange-500' :
                                  'bg-green-500/20 text-green-500'
                                }`}>
                                  {job.phase}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-medium text-white/90">
                                {job.assetName || "Unknown Asset"}
                                {job.workerName && <span className="block text-[10px] text-white/40 font-normal">Assigned: {job.workerName}</span>}
                              </td>
                              <td className="px-4 py-3 text-white/60">
                                {job.teamName || "Unknown Team"}
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-xs font-medium text-white/80 flex items-center gap-1.5">
                                  {job.status === 'completed' && <Check className="w-3.5 h-3.5 text-green-500" />}
                                  {job.status === 'in_progress' && <Loader2 className="w-3.5 h-3.5 text-orange-500 animate-spin" />}
                                  {job.status === 'pending' && <span className="w-2 h-2 rounded-full bg-white/30" />}
                                  {job.status.replace("_", " ")}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-white/60 truncate max-w-[200px]" title={job.comments || ""}>
                                {job.comments || "-"}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </main>
        <Dialog
          open={selectedCompletedJob !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedCompletedJob(null);
          }}
        >
          <DialogContent className="max-h-[85vh] overflow-y-auto border-white/10 bg-[#0f2a36] text-white sm:max-w-xl">
            {selectedCompletedJob && (
              <>
                <DialogHeader className="border-b border-white/10 pb-4 pr-8">
                  <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-green-400">
                    <ClipboardCheck className="h-4 w-4" />
                    {selectedCompletedJob.status === "too_dangerous" ? "Too dangerous" : "Completed work"}
                  </div>
                  <DialogTitle className="text-xl text-white">
                    {selectedCompletedJob.assetName || "Unknown Asset"}
                  </DialogTitle>
                  <DialogDescription className="text-white/55">
                    {selectedCompletedJob.assetDescription || selectedCompletedJob.streetAddress || "Storm Patrol job details"}
                  </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    ["Phase", selectedCompletedJob.phase.toUpperCase()],
                    ["Team", selectedCompletedJob.teamName || "Unknown Team"],
                    ["Completed by", selectedCompletedJob.workerName || "Team sign-off"],
                    ["Route", selectedCompletedJob.routeOrder != null ? String(selectedCompletedJob.routeOrder) : "—"],
                    ["Suburb", selectedCompletedJob.suburb || "—"],
                    ["Actual time", selectedCompletedJob.actualTimeMins != null ? `${selectedCompletedJob.actualTimeMins} min` : "—"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">{label}</p>
                      <p className="mt-1 text-sm font-medium text-white/90">{value}</p>
                    </div>
                  ))}
                </div>

                {selectedCompletedJob.workTypes && selectedCompletedJob.workTypes.length > 0 && (
                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/45">Work completed</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedCompletedJob.workTypes.map((workType) => (
                        <span key={workType} className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80">
                          {workType.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  </section>
                )}

                <section>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/45">
                    <Clock className="h-3.5 w-3.5" />
                    Field comments
                  </h3>
                  <div className="rounded-lg border border-white/10 bg-black/15 p-3 text-sm leading-relaxed text-white/80">
                    {selectedCompletedJob.comments || "No comments recorded."}
                  </div>
                </section>

                <section>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/45">
                    <Eye className="h-3.5 w-3.5" />
                    Before and after photos
                  </h3>
                  {selectedCompletedJob.photos && selectedCompletedJob.photos.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {selectedCompletedJob.photos.map((photo, index) => (
                        <figure key={photo.id} className="overflow-hidden rounded-lg border border-white/10 bg-black/20">
              <AuthenticatedImage
                src={photo.blobUrl}
                            alt={`${photo.purpose === "after" ? "After" : "Before"} photo ${index + 1}`}
                            className="aspect-square w-full object-cover"
                          />
                          <figcaption className="p-2 text-xs capitalize text-white/60">
                            {photo.caption || photo.purpose}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-white/10 bg-black/15 p-4 text-sm text-white/45">
                      No before or after photos were attached.
                    </div>
                  )}
                </section>

                <div className="flex justify-end border-t border-white/10 pt-4">
                  <Button
                    type="button"
                    aria-label="Close completed work"
                    onClick={() => setSelectedCompletedJob(null)}
                    className="bg-[#00AECD] text-white hover:bg-[#00AECD]/90"
                  >
                    Close
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
        <Dialog
          open={selectedObservation !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedObservation(null);
          }}
        >
          <DialogContent className="max-h-[85vh] overflow-y-auto border-white/10 bg-[#0f2a36] text-white sm:max-w-xl">
            {selectedObservation && (
              <>
                <DialogHeader className="border-b border-white/10 pb-4 pr-8">
                  <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#65d8e8]">
                    <Eye className="h-4 w-4" />
                    Field observation
                  </div>
                  <DialogTitle className="text-xl text-white">{selectedObservation.description}</DialogTitle>
                  <DialogDescription className="text-white/55">
                    Logged {selectedObservation.createdAt ? format(new Date(selectedObservation.createdAt), "HH:mm, d MMM yyyy") : "at an unknown time"}
                  </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Latitude</p>
                    <p className="mt-1 text-sm font-medium text-white/90">{selectedObservation.locationLat.toFixed(5)}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Longitude</p>
                    <p className="mt-1 text-sm font-medium text-white/90">{selectedObservation.locationLng.toFixed(5)}</p>
                  </div>
                </div>

                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/45">Notes</h3>
                  <div className="rounded-lg border border-white/10 bg-black/15 p-3 text-sm leading-relaxed text-white/80">
                    {selectedObservation.notes || "No additional notes recorded."}
                  </div>
                </section>

                <section>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/45">
                    <Eye className="h-3.5 w-3.5" />
                    Photos
                  </h3>
                  {selectedObservation.photos.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {selectedObservation.photos.map((photo, index) => (
                        <figure key={photo.id} className="overflow-hidden rounded-lg border border-white/10 bg-black/20">
                          <AuthenticatedImage
                            src={photo.blobUrl}
                            alt={`Observation photo ${index + 1}`}
                            className="aspect-square w-full object-cover"
                          />
                          {photo.caption && <figcaption className="p-2 text-xs text-white/60">{photo.caption}</figcaption>}
                        </figure>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-white/10 bg-black/15 p-4 text-sm text-white/45">
                      No photos were attached to this observation.
                    </div>
                  )}
                </section>

                <div className="flex justify-end border-t border-white/10 pt-4">
                  <Button
                    type="button"
                    aria-label="Close field observation"
                    onClick={() => setSelectedObservation(null)}
                    className="bg-[#00AECD] text-white hover:bg-[#00AECD]/90"
                  >
                    Close
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
