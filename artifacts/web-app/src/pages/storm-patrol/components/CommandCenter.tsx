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
  useAcknowledgeStormPatrolAlert,
  useRetryStormPatrolAlertEmail,
  useCancelStormPatrolJob,
  useUpdateStormPatrolAlertActionNote,
  useUpdateStormPatrolObservationActionNote,
  getDownloadCompletionReportUrl,
  getGetStormPatrolReportUrl,
  getGetCurrentStormPatrolQueryKey,
  getListStormPatrolEventsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  CloudLightning, Loader2, Plus, Users, MapPin, Search, Check, ChevronDown, ChevronUp,
  AlertTriangle, Eye, ArrowLeft, ArrowRight, Save, Download, Navigation, Clock, ClipboardCheck, X
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
import { useAuth } from "@/lib/auth";

const BRAND = "#00AECD";
const RED = "#ef4444";
const ORANGE = "#f97316";
const YELLOW = "#eab308";
const GREEN = "#22c55e";

type PriorityFilter = "all" | StormwaterAssetDetails["priority"];
type HotspotFilter = "all" | StormwaterAssetDetails["hotspot"];
type LiveJobSortKey = "phase" | "site" | "team" | "status" | "comments";
type StormObservation = {
  id: string;
  eventId: string;
  description: string;
  notes?: string | null;
  managerActionNote?: string | null;
  managerActionNoteByName?: string | null;
  managerActionNoteAt?: string | null;
  managerActionNoteRevision?: number;
  observerName?: string | null;
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
type UrgentIssue = NonNullable<NonNullable<StormCurrentResponseData>["alerts"]>[number];

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

function finiteCoordinate(value: unknown): number | null {
  if (value == null || value === "") return null;
  const coordinate = typeof value === "number" ? value : Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
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

function ResizeObservationMap() {
  const map = useMap();

  React.useEffect(() => {
    const timeout = window.setTimeout(() => map.invalidateSize(), 0);
    return () => window.clearTimeout(timeout);
  }, [map]);

  return null;
}

interface CommandCenterProps {
  data: StormCurrentResponseData;
  readOnly?: boolean;
  onBack?: () => void;
}

export default function CommandCenter({ data, readOnly = false, onBack }: CommandCenterProps) {
  const { event, jobs, summary } = data!;
  const actualTimeMinutes = summary.actualMinutes ?? jobs.reduce((total, job) => total + (job.actualTimeMins ?? 0), 0);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const canEditManagerActionNotes = !readOnly && (user?.role === "administrator" || user?.role === "manager");

  const { data: teamsData } = useListTeams();
  const { data: assetsData } = useListAssets({ department: "stormwater", limit: 2000 });
  
  const publishPackage = usePublishStormPatrolPackage();
  const closeEvent = useCloseStormPatrolEvent();
  const ackAlert = useAcknowledgeStormPatrolAlert();
  const retryEmail = useRetryStormPatrolAlertEmail();
  const cancelJob = useCancelStormPatrolJob();
  const updateAlertActionNote = useUpdateStormPatrolAlertActionNote();
  const updateObservationActionNote = useUpdateStormPatrolObservationActionNote();
  
  const [selectedCompletedJob, setSelectedCompletedJob] = useState<StormJob | null>(null);
  const [selectedUrgentIssue, setSelectedUrgentIssue] = useState<UrgentIssue | null>(null);
  const [urgentActionNoteDraft, setUrgentActionNoteDraft] = useState("");
  const [urgentActionNoteDirty, setUrgentActionNoteDirty] = useState(false);
  const [acknowledgingUrgentIssueId, setAcknowledgingUrgentIssueId] = useState<string | null>(null);
  const acknowledgementAttempts = useRef(new Set<string>());
  const [selectedObservation, setSelectedObservation] = useState<StormObservation | null>(null);
  const [observationActionNoteDraft, setObservationActionNoteDraft] = useState("");
  const [observationActionNoteDirty, setObservationActionNoteDirty] = useState(false);
  const urgentIssueLat = finiteCoordinate(selectedUrgentIssue?.lat);
  const urgentIssueLng = finiteCoordinate(selectedUrgentIssue?.lng);
  const observationLat = finiteCoordinate(selectedObservation?.locationLat);
  const observationLng = finiteCoordinate(selectedObservation?.locationLng);
  const completedJobLat = finiteCoordinate(selectedCompletedJob?.lat);
  const completedJobLng = finiteCoordinate(selectedCompletedJob?.lng);
  const [urgentIssueTilesFailed, setUrgentIssueTilesFailed] = useState(false);
  const [urgentIssueTileAttempt, setUrgentIssueTileAttempt] = useState(0);
  const urgentIssueTileAttemptHadError = useRef(false);
  const [observationTilesFailed, setObservationTilesFailed] = useState(false);
  const [observationTileAttempt, setObservationTileAttempt] = useState(0);
  const observationTileAttemptHadError = useRef(false);
  const [completedJobTilesFailed, setCompletedJobTilesFailed] = useState(false);
  const [completedJobTileAttempt, setCompletedJobTileAttempt] = useState(0);
  const completedJobTileAttemptHadError = useRef(false);
  const [pendingCancelJob, setPendingCancelJob] = useState<StormJob | null>(null);

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
  const [livePhaseFilter, setLivePhaseFilter] = useState<"all" | "pre" | "mid" | "post">("all");
  const [liveJobSort, setLiveJobSort] = useState<{ key: LiveJobSortKey; direction: "asc" | "desc" }>({
    key: "phase",
    direction: "asc",
  });
  const hasInitializedPackageView = useRef(false);

  useEffect(() => {
    if (hasInitializedPackageView.current) return;
    hasInitializedPackageView.current = true;
    if (jobs.length > 0) setIsPackageCollapsed(true);
  }, [jobs.length]);

  useEffect(() => {
    setObservationTilesFailed(false);
    observationTileAttemptHadError.current = false;
  }, [selectedObservation?.id]);

  useEffect(() => {
    setUrgentActionNoteDraft(selectedUrgentIssue?.managerActionNote ?? "");
    setUrgentActionNoteDirty(false);
  }, [selectedUrgentIssue?.id]);

  useEffect(() => {
    setObservationActionNoteDraft(selectedObservation?.managerActionNote ?? "");
    setObservationActionNoteDirty(false);
  }, [selectedObservation?.id]);

  useEffect(() => {
    if (!selectedUrgentIssue) return;
    const freshIssue = data?.alerts?.find(issue => issue.id === selectedUrgentIssue.id);
    if (!freshIssue) return;
    if (urgentActionNoteDirty) {
      if (
        (freshIssue.managerActionNoteRevision ?? 0) === (selectedUrgentIssue.managerActionNoteRevision ?? 0)
        && (freshIssue.managerActionNote ?? "") === urgentActionNoteDraft
      ) {
        setUrgentActionNoteDirty(false);
      }
      return;
    }
    setSelectedUrgentIssue(current => current ? {
      ...current,
      managerActionNote: freshIssue.managerActionNote,
      managerActionNoteByName: freshIssue.managerActionNoteByName,
      managerActionNoteAt: freshIssue.managerActionNoteAt,
      managerActionNoteRevision: freshIssue.managerActionNoteRevision,
    } : current);
    setUrgentActionNoteDraft(freshIssue.managerActionNote ?? "");
  }, [
    data?.alerts,
    selectedUrgentIssue?.id,
    selectedUrgentIssue?.managerActionNoteRevision,
    urgentActionNoteDirty,
    urgentActionNoteDraft,
  ]);

  useEffect(() => {
    if (!selectedObservation) return;
    const freshObservation = observations.find(observation => observation.id === selectedObservation.id);
    if (!freshObservation) return;
    if (observationActionNoteDirty) {
      if (
        (freshObservation.managerActionNoteRevision ?? 0) === (selectedObservation.managerActionNoteRevision ?? 0)
        && (freshObservation.managerActionNote ?? "") === observationActionNoteDraft
      ) {
        setObservationActionNoteDirty(false);
      }
      return;
    }
    setSelectedObservation(current => current ? {
      ...current,
      managerActionNote: freshObservation.managerActionNote,
      managerActionNoteByName: freshObservation.managerActionNoteByName,
      managerActionNoteAt: freshObservation.managerActionNoteAt,
      managerActionNoteRevision: freshObservation.managerActionNoteRevision,
    } : current);
    setObservationActionNoteDraft(freshObservation.managerActionNote ?? "");
  }, [
    observationActionNoteDirty,
    observationActionNoteDraft,
    observations,
    selectedObservation?.id,
    selectedObservation?.managerActionNoteRevision,
  ]);

  useEffect(() => {
    const issue = selectedUrgentIssue;
    if (readOnly || !issue || issue.acknowledgedAt || acknowledgementAttempts.current.has(issue.id)) return;

    acknowledgementAttempts.current.add(issue.id);
    setAcknowledgingUrgentIssueId(issue.id);

    void ackAlert.mutateAsync({ id: issue.id })
      .then(async acknowledged => {
        setSelectedUrgentIssue(current => current?.id === issue.id
          ? {
              ...current,
              acknowledgedAt: acknowledged.acknowledgedAt ?? new Date().toISOString(),
              acknowledgedByName: acknowledged.acknowledgedByName ?? null,
            }
          : current);
        await queryClient.invalidateQueries({ queryKey: getGetCurrentStormPatrolQueryKey() });
      })
      .catch(error => {
        console.error("Unable to acknowledge urgent issue:", error);
        toast({
          title: "Urgent issue opened, but acknowledgement failed",
          description: "The issue remains unacknowledged. Please close it and try opening it again.",
          variant: "destructive",
        });
      })
      .finally(() => {
        setAcknowledgingUrgentIssueId(current => current === issue.id ? null : current);
      });
  }, [ackAlert, queryClient, readOnly, selectedUrgentIssue, toast]);

  const saveUrgentActionNote = async () => {
    if (!selectedUrgentIssue) return;
    try {
      const updated = await updateAlertActionNote.mutateAsync({
        id: selectedUrgentIssue.id,
        data: {
          managerActionNote: urgentActionNoteDraft.trim() || null,
          expectedManagerActionNoteRevision: selectedUrgentIssue.managerActionNoteRevision ?? 0,
        },
      });
      setSelectedUrgentIssue(current => current?.id === selectedUrgentIssue.id
        ? { ...current, ...updated }
        : current);
      setUrgentActionNoteDraft(updated.managerActionNote ?? "");
      await queryClient.invalidateQueries({ queryKey: getGetCurrentStormPatrolQueryKey() });
      toast({ title: updated.managerActionNote ? "Manager action note saved" : "Manager action note cleared" });
    } catch (error) {
      toast({
        title: "Failed to save manager action note",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const saveObservationActionNote = async () => {
    if (!selectedObservation) return;
    try {
      const updated = await updateObservationActionNote.mutateAsync({
        id: selectedObservation.id,
        data: {
          managerActionNote: observationActionNoteDraft.trim() || null,
          expectedManagerActionNoteRevision: selectedObservation.managerActionNoteRevision ?? 0,
        },
      });
      setSelectedObservation(current => current?.id === selectedObservation.id
        ? { ...current, ...updated }
        : current);
      setObservationActionNoteDraft(updated.managerActionNote ?? "");
      await queryClient.invalidateQueries({ queryKey: getGetCurrentStormPatrolQueryKey() });
      toast({ title: updated.managerActionNote ? "Manager action note saved" : "Manager action note cleared" });
    } catch (error) {
      toast({
        title: "Failed to save manager action note",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (!observationTilesFailed) return;

    const retryTimer = window.setInterval(() => {
      observationTileAttemptHadError.current = false;
      setObservationTileAttempt(attempt => attempt + 1);
    }, 10_000);

    return () => window.clearInterval(retryTimer);
  }, [observationTilesFailed]);

  const visibleLiveJobs = useMemo(() => {
    const filtered = livePhaseFilter === "all" ? jobs : jobs.filter(job => job.phase === livePhaseFilter);
    const valueFor = (job: StormJob, key: LiveJobSortKey) => {
      if (key === "site") return job.assetName ?? "";
      if (key === "team") return job.teamName ?? "";
      if (key === "comments") return job.comments ?? "";
      return job[key] ?? "";
    };
    return [...filtered].sort((a, b) => {
      const comparison = String(valueFor(a, liveJobSort.key)).localeCompare(
        String(valueFor(b, liveJobSort.key)),
        undefined,
        { numeric: true, sensitivity: "base" },
      );
      return liveJobSort.direction === "asc" ? comparison : -comparison;
    });
  }, [jobs, liveJobSort, livePhaseFilter]);

  const toggleLiveJobSort = (key: LiveJobSortKey) => {
    setLiveJobSort(current => current.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: "asc" });
  };

  const confirmCancelJob = async () => {
    if (!pendingCancelJob) return;
    try {
      await cancelJob.mutateAsync({ id: pendingCancelJob.id });
      toast({ title: "Pending job cancelled", description: `${pendingCancelJob.assetName || "Storm Patrol job"} was removed from live operations.` });
      setPendingCancelJob(null);
      await queryClient.invalidateQueries({ queryKey: getGetCurrentStormPatrolQueryKey() });
    } catch (error) {
      toast({
        title: "Unable to cancel job",
        description: error instanceof Error ? error.message : "The job may already have been claimed.",
        variant: "destructive",
      });
    }
  };

  // Alerts & Observations State

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
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-white ${readOnly ? "bg-white/15" : "bg-red-500"}`}>
                {readOnly ? "Archived · Read only" : "Active"}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-1 text-xs text-white/50">
              <span>Activated: {event.activatedAt ? format(new Date(event.activatedAt), "HH:mm, d MMM") : "Unknown"}</span>
              <span>•</span>
              <span>Rate: ${(event.hourlyRateCents / 100).toFixed(2)}/hr</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {readOnly && onBack && (
            <Button
              type="button"
              variant="outline"
              className="bg-transparent border-white/10 text-white hover:bg-white/10"
              onClick={onBack}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Previous Events
            </Button>
          )}
          <Button 
            variant="outline" 
            className="bg-transparent border-white/10 text-white hover:bg-white/10"
            onClick={() => {
              const a = document.createElement("a");
              a.href = getGetStormPatrolReportUrl(event.id, { format: "xlsx" });
              a.click();
            }}
            data-testid="btn-download-active-report"
          >
            <Download className="w-4 h-4 mr-2" />
            Excel
          </Button>
          <Button
            variant="outline"
            className="bg-transparent border-white/10 text-white hover:bg-white/10"
            onClick={() => {
              const a = document.createElement("a");
              a.href = getGetStormPatrolReportUrl(event.id, { format: "pdf" });
              a.click();
            }}
          >
            PDF
          </Button>
          <Button
            variant="outline"
            className="bg-transparent border-white/10 text-white hover:bg-white/10"
            onClick={() => {
              const a = document.createElement("a");
              a.href = getGetStormPatrolReportUrl(event.id, { format: "pdf", photos: "include" });
              a.click();
            }}
            data-testid="btn-download-photo-report"
          >
            PDF + photos
          </Button>
          {!readOnly && <Button
            variant="outline" 
            className="bg-red-500/20 border-red-500/30 text-red-500 hover:bg-red-500/30 hover:text-red-400"
            onClick={handleCloseEvent}
            disabled={closeEvent.isPending}
            data-testid="btn-close-event"
          >
            {closeEvent.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Close Event
          </Button>}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          
          <div className="grid min-h-full grid-cols-1 gap-6 lg:grid-cols-4">
            
            {/* Left Column: Stats & Alerts */}
            <div className="lg:col-span-1 space-y-6">
              {/* Stats */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">{readOnly ? "Event Summary" : "Live Status"}</h3>
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
                    <p className="text-3xl font-black text-purple-300">{actualTimeMinutes}</p>
                    <p className="text-xs text-purple-300/60 font-medium">Actual Minutes</p>
                  </div>
                </div>
              </div>

              
              {/* Urgent Issues */}
              {data?.alerts && data.alerts.length > 0 && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                  <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Urgent Issues
                  </h3>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {data.alerts.map(alert => (
                      <div
                        key={alert.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          urgentIssueTileAttemptHadError.current = false;
                          setUrgentIssueTilesFailed(false);
                          setSelectedUrgentIssue(alert);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          urgentIssueTileAttemptHadError.current = false;
                          setUrgentIssueTilesFailed(false);
                          setSelectedUrgentIssue(alert);
                        }}
                        aria-label={`Open urgent issue: ${alert.message}`}
                        className={`w-full p-3 rounded-lg border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${!alert.acknowledgedAt ? "bg-orange-500/10 border-orange-500/30 hover:bg-orange-500/15" : "bg-black/20 border-white/5 hover:bg-white/10"}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className={`text-sm ${!alert.acknowledgedAt ? "text-orange-100" : "text-white/60"}`}>{alert.message}</p>
                            {alert.assetName && <p className="mt-1 text-xs font-medium text-white/45">{alert.assetName}</p>}
                          </div>
                          {!alert.acknowledgedAt && (
                            <span className="shrink-0 rounded-full bg-orange-500/20 px-2 py-0.5 text-[10px] font-semibold text-orange-300">
                              Unacknowledged
                            </span>
                          )}
                        </div>
                        {alert.acknowledgedAt && (
                          <p className="text-[10px] text-white/40 mt-1">
                            Acknowledged at {format(new Date(alert.acknowledgedAt), "HH:mm")}
                            {alert.acknowledgedByName ? ` by ${alert.acknowledgedByName}` : ""}
                          </p>
                        )}
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <p className={`text-[10px] ${alert.emailStatus === "sent" ? "text-green-400" : alert.emailStatus === "failed" ? "text-red-400" : "text-white/40"}`}>
                            Email {alert.emailStatus}
                          </p>
                          {!readOnly && alert.emailStatus === "failed" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={retryEmail.isPending}
                              onClick={async (event) => {
                                event.stopPropagation();
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

              {/* New Observations */}
              {observations.length > 0 && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                  <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Eye className="w-4 h-4" /> New Observation
                  </h3>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {observations.map((obs) => (
                      <button
                        key={obs.id}
                        type="button"
                        className="w-full cursor-pointer rounded-lg bg-black/20 border border-white/5 p-3 text-left transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00AECD]"
                        aria-label={`Open New Observation: ${obs.description}`}
                        onClick={() => setSelectedObservation(obs)}
                      >
                        <p className="text-sm font-medium text-white/90 mb-1">{obs.description}</p>
                        {obs.notes && <p className="text-xs text-white/60 mb-2">{obs.notes}</p>}
                        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-white/45">
                          {obs.observerName ? `${obs.observerName} · ` : ""}
                          {obs.createdAt ? format(new Date(obs.createdAt), "d MMM yyyy") : "Date not recorded"}
                        </p>
                        
                        {/* Check if a follow-up job exists */}
                        {data?.followUps?.find((f: any) => f.id === obs.reactiveJobId) ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-400 bg-green-400/10 px-2 py-0.5 rounded">
                            <Check className="w-3 h-3" /> Draft Unscheduled job created
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-white/40">
                            Logged {obs.createdAt ? format(new Date(obs.createdAt), "HH:mm") : ""}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* Right Column: Work Packages & Jobs */}
            <div className="flex min-h-0 flex-col gap-6 lg:col-span-3">
              
              {/* Package Creator */}
              {!readOnly && (
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
              )}

              {/* Live Jobs Table */}
              <div className="flex min-h-[400px] flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                <div className="p-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
                  <h2 className="text-base font-semibold text-white">{readOnly ? "Event Work" : "Live Field Operations"}</h2>
                  <div className="flex items-center gap-2">
                    <Select value={livePhaseFilter} onValueChange={(value: "all" | "pre" | "mid" | "post") => setLivePhaseFilter(value)}>
                      <SelectTrigger aria-label="Filter live jobs by phase" className="h-8 w-[130px] border-white/10 bg-black/20 text-xs text-white">
                        <SelectValue placeholder="All phases" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All phases</SelectItem>
                        <SelectItem value="pre">Pre</SelectItem>
                        <SelectItem value="mid">Mid</SelectItem>
                        <SelectItem value="post">Post</SelectItem>
                      </SelectContent>
                    </Select>
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
                        {([
                          ["phase", "Phase"],
                          ["site", "Site"],
                          ["team", "Team"],
                          ["status", "Status"],
                          ["comments", "Comments"],
                        ] as const).map(([key, title]) => (
                          <th key={key} className="px-4 py-3 font-medium" aria-sort={liveJobSort.key === key ? (liveJobSort.direction === "asc" ? "ascending" : "descending") : "none"}>
                            <button
                              type="button"
                              className="flex items-center gap-1 rounded text-left hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00AECD]"
                              onClick={() => toggleLiveJobSort(key)}
                              aria-label={`Sort by ${title}`}
                            >
                              {title}
                              {liveJobSort.key === key && (liveJobSort.direction === "asc"
                                ? <ChevronUp className="h-3.5 w-3.5" />
                                : <ChevronDown className="h-3.5 w-3.5" />)}
                            </button>
                          </th>
                        ))}
                        <th className="w-12 px-4 py-3"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {visibleLiveJobs.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-white/40">
                            {jobs.length === 0 ? "No jobs dispatched yet." : "No jobs match this phase."}
                          </td>
                        </tr>
                      ) : (
                        visibleLiveJobs.map(job => {
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
                              <td className="px-4 py-3 text-right">
                                {!readOnly && job.status === "pending" && (
                                  <button
                                    type="button"
                                    aria-label={`Cancel pending job for ${job.assetName || "Unknown Asset"}`}
                                    className="inline-flex h-7 w-7 items-center justify-center rounded text-red-400 transition-colors hover:bg-red-500/15 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setPendingCancelJob(job);
                                    }}
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                )}
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
          open={selectedUrgentIssue !== null}
          onOpenChange={(open) => {
            if (!open) {
              if (selectedUrgentIssue) acknowledgementAttempts.current.delete(selectedUrgentIssue.id);
              setSelectedUrgentIssue(null);
            }
          }}
        >
          <DialogContent className="max-h-[88vh] overflow-y-auto border-white/10 bg-[#0f2a36] text-white sm:max-w-2xl">
            {selectedUrgentIssue && (
              <>
                <DialogHeader className="border-b border-white/10 pb-4 pr-8">
                  <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-orange-400">
                    <AlertTriangle className="h-4 w-4" />
                    Urgent issue
                  </div>
                  <DialogTitle className="text-xl text-white">
                    {selectedUrgentIssue.assetName || "Unknown site"}
                  </DialogTitle>
                  <DialogDescription className="text-white/55">
                    {selectedUrgentIssue.streetAddress
                      || selectedUrgentIssue.assetDescription
                      || "Storm Patrol urgent issue details"}
                  </DialogDescription>
                </DialogHeader>

                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/45">Issue reported</h3>
                  <div className="rounded-lg border border-orange-500/25 bg-orange-500/10 p-4 text-sm leading-relaxed text-orange-50">
                    {selectedUrgentIssue.message}
                  </div>
                  <p className="mt-2 text-xs text-white/45">
                    Reported {selectedUrgentIssue.createdAt ? format(new Date(selectedUrgentIssue.createdAt), "HH:mm, d MMM yyyy") : "at an unknown time"}
                  </p>
                </section>

                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/45">Manager action taken</h3>
                  {canEditManagerActionNotes ? (
                    <div className="space-y-2">
                      <Textarea
                        aria-label="Manager action taken for urgent issue"
                        value={urgentActionNoteDraft}
                        onChange={event => {
                          setUrgentActionNoteDraft(event.target.value);
                          setUrgentActionNoteDirty(true);
                        }}
                        maxLength={5000}
                        placeholder="Record what action was taken, who was contacted, or the next step."
                        className="min-h-24 border-white/10 bg-black/20 text-white placeholder:text-white/30"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-white/45">
                          {selectedUrgentIssue.managerActionNoteAt
                            ? `Last updated ${format(new Date(selectedUrgentIssue.managerActionNoteAt), "HH:mm, d MMM yyyy")}${selectedUrgentIssue.managerActionNoteByName ? ` by ${selectedUrgentIssue.managerActionNoteByName}` : ""}`
                            : "No manager action recorded yet."}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          disabled={updateAlertActionNote.isPending}
                          onClick={() => { void saveUrgentActionNote(); }}
                          className="bg-[#00AECD] text-white hover:bg-[#00AECD]/90"
                        >
                          {updateAlertActionNote.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Save action note
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-white/10 bg-black/15 p-3">
                      <p className="text-sm leading-relaxed text-white/80">
                        {selectedUrgentIssue.managerActionNote || "No manager action recorded."}
                      </p>
                      {selectedUrgentIssue.managerActionNoteAt && (
                        <p className="mt-2 text-xs text-white/45">
                          Recorded {format(new Date(selectedUrgentIssue.managerActionNoteAt), "HH:mm, d MMM yyyy")}
                          {selectedUrgentIssue.managerActionNoteByName ? ` by ${selectedUrgentIssue.managerActionNoteByName}` : ""}
                        </p>
                      )}
                    </div>
                  )}
                </section>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ["Phase", selectedUrgentIssue.phase ? selectedUrgentIssue.phase.toUpperCase() : "—"],
                    ["Team", selectedUrgentIssue.teamName || "—"],
                    ["Field worker", selectedUrgentIssue.workerName || "—"],
                    ["Status", selectedUrgentIssue.acknowledgedAt
                      ? "Acknowledged"
                      : acknowledgingUrgentIssueId === selectedUrgentIssue.id
                        ? "Acknowledging…"
                        : "Unacknowledged"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">{label}</p>
                      <p className="mt-1 text-sm font-medium text-white/90">{value}</p>
                    </div>
                  ))}
                </div>

                {urgentIssueLat != null && urgentIssueLng != null && (
                  <section>
                    <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/45">
                      <MapPin className="h-3.5 w-3.5" />
                      Site location
                    </h3>
                    <div className="relative h-56 w-full overflow-hidden rounded-lg border border-white/10 bg-black/20 sm:h-64">
                      <MapContainer
                        center={[urgentIssueLat, urgentIssueLng]}
                        zoom={17}
                        scrollWheelZoom
                        className="h-full w-full"
                        aria-label={`Urgent issue location for ${selectedUrgentIssue.assetName || "unknown site"}`}
                      >
                        <TileLayer
                          key={urgentIssueTileAttempt}
                          attribution="&copy; OpenStreetMap contributors"
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                          eventHandlers={{
                            tileerror: () => {
                              urgentIssueTileAttemptHadError.current = true;
                              setUrgentIssueTilesFailed(true);
                            },
                            load: () => {
                              if (!urgentIssueTileAttemptHadError.current) setUrgentIssueTilesFailed(false);
                            },
                          }}
                        />
                        <CircleMarker
                          center={[urgentIssueLat, urgentIssueLng]}
                          radius={9}
                          pathOptions={{ color: "#ffffff", weight: 3, fillColor: ORANGE, fillOpacity: 1 }}
                        >
                          <Popup>{selectedUrgentIssue.assetName || "Urgent issue location"}</Popup>
                        </CircleMarker>
                        <ResizeObservationMap />
                      </MapContainer>
                      {urgentIssueTilesFailed && (
                        <div role="status" className="absolute inset-0 z-[500] flex items-center justify-center bg-[#102d38]/95 p-6 text-center">
                          <div className="max-w-sm">
                            <MapPin className="mx-auto mb-3 h-7 w-7 text-orange-400" />
                            <p className="font-semibold text-white">Map tiles are unavailable</p>
                            <p className="mt-1 text-sm text-white/65">The site coordinates remain available below.</p>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="mt-3 border-white/15 bg-white/5 text-white hover:bg-white/10"
                              onClick={() => {
                                urgentIssueTileAttemptHadError.current = false;
                                setUrgentIssueTilesFailed(false);
                                setUrgentIssueTileAttempt(attempt => attempt + 1);
                              }}
                            >
                              Retry map
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-white/45">
                      {[selectedUrgentIssue.streetAddress, selectedUrgentIssue.suburb].filter(Boolean).join(", ")}
                      {selectedUrgentIssue.streetAddress || selectedUrgentIssue.suburb ? " · " : ""}
                      {urgentIssueLat.toFixed(5)}, {urgentIssueLng.toFixed(5)}
                    </p>
                  </section>
                )}

                <section>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/45">
                    <Eye className="h-3.5 w-3.5" />
                    Photo
                  </h3>
                  {selectedUrgentIssue.photoUrl ? (
                    <figure className="overflow-hidden rounded-lg border border-white/10 bg-black/20">
                      <AuthenticatedImage
                        src={selectedUrgentIssue.photoUrl}
                        alt={`Urgent issue at ${selectedUrgentIssue.assetName || "unknown site"}`}
                        className="max-h-[420px] w-full object-contain"
                      />
                    </figure>
                  ) : (
                    <div className="rounded-lg border border-dashed border-white/10 bg-black/15 p-4 text-sm text-white/45">
                      No photo was attached to this urgent issue.
                    </div>
                  )}
                </section>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                  <p className={`text-xs ${selectedUrgentIssue.emailStatus === "sent" ? "text-green-400" : selectedUrgentIssue.emailStatus === "failed" ? "text-red-400" : "text-white/45"}`}>
                    Email {selectedUrgentIssue.emailStatus}
                  </p>
                  {selectedUrgentIssue.acknowledgedAt && (
                    <p className="text-xs text-green-300">
                      Acknowledged at {format(new Date(selectedUrgentIssue.acknowledgedAt), "HH:mm, d MMM yyyy")}
                      {selectedUrgentIssue.acknowledgedByName ? ` by ${selectedUrgentIssue.acknowledgedByName}` : ""}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={() => {
                        acknowledgementAttempts.current.delete(selectedUrgentIssue.id);
                        setSelectedUrgentIssue(null);
                      }}
                      className="bg-[#00AECD] text-white hover:bg-[#00AECD]/90"
                    >
                      Close
                    </Button>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
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
                  <div className="flex items-start justify-between gap-4">
                    <div>
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
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-label="Download completed work PDF"
                      className="shrink-0 border-white/15 bg-white/5 text-white hover:bg-white/10"
                      onClick={() => {
                        const link = document.createElement("a");
                        link.href = getDownloadCompletionReportUrl(selectedCompletedJob.id, { source: "storm_patrol" });
                        link.click();
                      }}
                    >
                      <Download className="mr-1.5 h-4 w-4" />
                      PDF
                    </Button>
                  </div>
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

                {completedJobLat != null && completedJobLng != null && (
                  <section>
                    <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/45">
                      <MapPin className="h-3.5 w-3.5" />
                      Site location
                    </h3>
                    <div className="relative h-56 w-full overflow-hidden rounded-lg border border-white/10 bg-black/20">
                      <MapContainer
                        center={[completedJobLat, completedJobLng]}
                        zoom={17}
                        scrollWheelZoom
                        className="h-full w-full"
                        aria-label={`Completed work location for ${selectedCompletedJob.assetName || "unknown site"}`}
                      >
                        <TileLayer
                          key={completedJobTileAttempt}
                          attribution="&copy; OpenStreetMap contributors"
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                          eventHandlers={{
                            tileerror: () => {
                              completedJobTileAttemptHadError.current = true;
                              setCompletedJobTilesFailed(true);
                            },
                            load: () => {
                              if (!completedJobTileAttemptHadError.current) setCompletedJobTilesFailed(false);
                            },
                          }}
                        />
                        <CircleMarker
                          center={[completedJobLat, completedJobLng]}
                          radius={9}
                          pathOptions={{ color: "#ffffff", weight: 3, fillColor: GREEN, fillOpacity: 1 }}
                        >
                          <Popup>{selectedCompletedJob.assetName || "Completed work location"}</Popup>
                        </CircleMarker>
                        <ResizeObservationMap />
                      </MapContainer>
                      {completedJobTilesFailed && (
                        <div role="status" className="absolute inset-0 z-[500] flex items-center justify-center bg-[#102d38]/95 p-6 text-center">
                          <div className="max-w-sm">
                            <MapPin className="mx-auto mb-3 h-7 w-7 text-green-400" />
                            <p className="font-semibold text-white">Map tiles are unavailable</p>
                            <p className="mt-1 text-sm text-white/65">The site coordinates remain available below.</p>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="mt-3 border-white/15 bg-white/5 text-white hover:bg-white/10"
                              onClick={() => {
                                completedJobTileAttemptHadError.current = false;
                                setCompletedJobTilesFailed(false);
                                setCompletedJobTileAttempt(attempt => attempt + 1);
                              }}
                            >
                              Retry map
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-white/45">
                      {[selectedCompletedJob.streetAddress, selectedCompletedJob.suburb].filter(Boolean).join(", ")}
                      {selectedCompletedJob.streetAddress || selectedCompletedJob.suburb ? " · " : ""}
                      {completedJobLat.toFixed(5)}, {completedJobLng.toFixed(5)}
                    </p>
                  </section>
                )}

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
          open={pendingCancelJob !== null}
          onOpenChange={(open) => {
            if (!open && !cancelJob.isPending) setPendingCancelJob(null);
          }}
        >
          <DialogContent className="border-white/10 bg-[#0f2a36] text-white sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-white">Cancel pending job?</DialogTitle>
              <DialogDescription className="text-white/55">
                {pendingCancelJob?.assetName || "This Storm Patrol job"} will be removed from Live Field Operations. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-3 pt-3">
              <Button
                type="button"
                variant="outline"
                disabled={cancelJob.isPending}
                onClick={() => setPendingCancelJob(null)}
                className="border-white/10 bg-transparent text-white hover:bg-white/10"
              >
                Keep job
              </Button>
              <Button
                type="button"
                disabled={cancelJob.isPending}
                onClick={() => { void confirmCancelJob(); }}
                className="bg-red-600 text-white hover:bg-red-500"
              >
                {cancelJob.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Cancel job
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog
          open={selectedObservation !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedObservation(null);
          }}
        >
          <DialogContent className="max-h-[85vh] overflow-y-auto border-white/10 bg-[#0f2a36] text-white sm:max-w-xl">
            {selectedObservation && observationLat != null && observationLng != null && (
              <>
                <DialogHeader className="border-b border-white/10 pb-4 pr-8">
                  <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#65d8e8]">
                    <Eye className="h-4 w-4" />
                    New Observation
                  </div>
                  <DialogTitle className="text-xl text-white">{selectedObservation.description}</DialogTitle>
                  <DialogDescription className="text-white/55">
                    Logged by {selectedObservation.observerName || "Unknown field worker"}
                    {" · "}
                    {selectedObservation.createdAt ? format(new Date(selectedObservation.createdAt), "HH:mm, d MMM yyyy") : "time unknown"}
                  </DialogDescription>
                </DialogHeader>

                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/45">Recorded location</h3>
                  <div className="relative h-52 w-full overflow-hidden rounded-lg border border-white/10 bg-black/20 sm:h-60">
                    <MapContainer
                      center={[observationLat, observationLng]}
                      zoom={17}
                      scrollWheelZoom
                      className="h-full w-full"
                      aria-label="New Observation recorded location"
                    >
                      <TileLayer
                        key={observationTileAttempt}
                        attribution="&copy; OpenStreetMap contributors"
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        eventHandlers={{
                          tileerror: () => {
                            observationTileAttemptHadError.current = true;
                            setObservationTilesFailed(true);
                          },
                          load: () => {
                            if (!observationTileAttemptHadError.current) {
                              setObservationTilesFailed(false);
                            }
                          },
                        }}
                      />
                      <CircleMarker
                        center={[observationLat, observationLng]}
                        radius={9}
                        pathOptions={{ color: "#ffffff", weight: 3, fillColor: BRAND, fillOpacity: 1 }}
                      >
                        <Popup>Recorded New Observation location</Popup>
                      </CircleMarker>
                      <ResizeObservationMap />
                    </MapContainer>
                    {observationTilesFailed && (
                      <div
                        role="status"
                        className="absolute inset-0 z-[500] flex items-center justify-center bg-[#102d38]/95 p-6 text-center"
                      >
                        <div className="max-w-sm">
                          <MapPin className="mx-auto mb-3 h-7 w-7 text-[#65d8e8]" />
                          <p className="font-semibold text-white">Map tiles are unavailable</p>
                          <p className="mt-1 text-sm leading-relaxed text-white/65">
                            The recorded coordinates are still available below. The map will return automatically when tile access recovers.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Latitude</p>
                    <p className="mt-1 text-sm font-medium text-white/90">{observationLat.toFixed(5)}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Longitude</p>
                    <p className="mt-1 text-sm font-medium text-white/90">{observationLng.toFixed(5)}</p>
                  </div>
                </div>

                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/45">Notes</h3>
                  <div className="rounded-lg border border-white/10 bg-black/15 p-3 text-sm leading-relaxed text-white/80">
                    {selectedObservation.notes || "No additional notes recorded."}
                  </div>
                </section>

                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/45">Manager action taken</h3>
                  {canEditManagerActionNotes ? (
                    <div className="space-y-2">
                      <Textarea
                        aria-label="Manager action taken for new observation"
                        value={observationActionNoteDraft}
                        onChange={event => {
                          setObservationActionNoteDraft(event.target.value);
                          setObservationActionNoteDirty(true);
                        }}
                        maxLength={5000}
                        placeholder="Record what action was taken, who was contacted, or the next step."
                        className="min-h-24 border-white/10 bg-black/20 text-white placeholder:text-white/30"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-white/45">
                          {selectedObservation.managerActionNoteAt
                            ? `Last updated ${format(new Date(selectedObservation.managerActionNoteAt), "HH:mm, d MMM yyyy")}${selectedObservation.managerActionNoteByName ? ` by ${selectedObservation.managerActionNoteByName}` : ""}`
                            : "No manager action recorded yet."}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          disabled={updateObservationActionNote.isPending}
                          onClick={() => { void saveObservationActionNote(); }}
                          className="bg-[#00AECD] text-white hover:bg-[#00AECD]/90"
                        >
                          {updateObservationActionNote.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Save action note
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-white/10 bg-black/15 p-3">
                      <p className="text-sm leading-relaxed text-white/80">
                        {selectedObservation.managerActionNote || "No manager action recorded."}
                      </p>
                      {selectedObservation.managerActionNoteAt && (
                        <p className="mt-2 text-xs text-white/45">
                          Recorded {format(new Date(selectedObservation.managerActionNoteAt), "HH:mm, d MMM yyyy")}
                          {selectedObservation.managerActionNoteByName ? ` by ${selectedObservation.managerActionNoteByName}` : ""}
                        </p>
                      )}
                    </div>
                  )}
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
                    aria-label="Close New Observation"
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
