import { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import {
  useCreateReactiveJob,
  useGetScheduleWeek, getGetScheduleWeekQueryKey,
  useUpdateJob,
  useUpdateReactiveJob,
  getListReactiveJobsQueryKey,
} from "@workspace/api-client-react";
import type { JobWithAsset } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, CheckCircle2, Clock, MapPin, Plus, ArrowRight,
  Trash2, Users, Bell, Calendar, X, AlertCircle, Zap,
  SkipForward, Shield, Info, Search, RotateCcw,
  Paperclip, FileText, Image as ImageIcon, Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export const BRAND = "#00AECD";
export const NAVY = "#0f2a36";
export const PRODUCTIVE = 390;
const COMBINE_THRESHOLD = 5;

const REASON_TYPES = [
  "Contractor damage",
  "Councillor request",
  "Dumped rubbish",
  "Event prep",
  "Plant delivery",
  "Resident complaint",
  "Safety hazard",
  "Storm / wind damage",
  "Vandalism / graffiti",
  "Other",
];

function localDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function mondayOf(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return localDateStr(d);
}

function fmtDateStr(dateStr: string, fmt = "d MMM") {
  try { return format(new Date(dateStr + "T00:00:00"), fmt); } catch { return dateStr; }
}

export function addDaysStr(dateStr: string, days: number) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}

export function fmtMins(m: number) {
  if (m <= 0) return "0m";
  const h = Math.floor(m / 60),
    r = m % 60;
  return h > 0 ? `${h}h${r > 0 ? ` ${r}m` : ""}` : `${r}m`;
}

export function capacityBand(mins: number): "green" | "red" {
  return mins > PRODUCTIVE ? "red" : "green";
}

export function bandColor(band: "green" | "red") {
  return band === "green" ? "#16a34a" : "#dc2626";
}

function freqWindowDays(freq: string) {
  switch (freq) {
    case "weekly": return 7;
    case "fortnightly": return 14;
    case "monthly": return 30;
    case "bimonthly": return 60;
    case "quarterly": return 90;
    default: return 14;
  }
}

function workingDaysBetween(from: string, to: string) {
  const a = new Date(from + "T00:00:00");
  const b = new Date(to + "T00:00:00");
  if (b <= a) return 0;
  let days = 0;
  const cur = new Date(a);
  while (cur < b) {
    cur.setDate(cur.getDate() + 1);
    const day = cur.getDay();
    if (day !== 0 && day !== 6) days++;
  }
  return days;
}

type JobAction = "none" | "push" | "defer" | "delete" | "reassign";

export interface ReactivePriority {
  id: string;
  emoji: string;
  label: string;
  responseTime: string;
  description: string;
  color: string;
  bg: string;
}

export const DEFAULT_PRIORITIES: ReactivePriority[] = [
  { id: "urgent",   emoji: "🔴", label: "Urgent / High Priority",    responseTime: "1–2 hours",    description: "Emergencies that pose an immediate risk to public health, safety, or major property damage.",            color: "#dc2626", bg: "#fef2f2" },
  { id: "standard", emoji: "🟡", label: "Standard / Medium Priority", responseTime: "2–5 days",     description: "Repairs that do not pose an immediate risk but require attention soon.",                               color: "#d97706", bg: "#fef3c7" },
  { id: "routine",  emoji: "🟢", label: "Routine / Low Priority",     responseTime: "Up to 20 days", description: "Non-structural issues or routine maintenance, such as minor pothole repairs or aesthetic cleaning.", color: "#6b7280", bg: "#f3f4f6" },
];

export const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  low:      { label: "Low",      color: "#6b7280", bg: "#f3f4f6" },
  medium:   { label: "Medium",   color: "#d97706", bg: "#fef3c7" },
  high:     { label: "High",     color: "#ea580c", bg: "#ffedd5" },
  urgent:   { label: "Urgent",   color: "#dc2626", bg: "#fef2f2" },
  standard: { label: "Standard", color: "#d97706", bg: "#fef3c7" },
  routine:  { label: "Routine",  color: "#6b7280", bg: "#f3f4f6" },
};

export const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    color: string;
    bg: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  raised:      { label: "Draft",       color: "#6b7280", bg: "#f3f4f6", icon: AlertTriangle },
  assigned:    { label: "Assigned",    color: "#2563eb", bg: "#eff6ff", icon: Clock },
  in_progress: { label: "In Progress", color: "#16a34a", bg: "#dcfce7", icon: CheckCircle2 },
  completed:   { label: "Completed",  color: "#059669", bg: "#ecfdf5", icon: CheckCircle2 },
  cancelled:   { label: "Cancelled",  color: "#dc2626", bg: "#fef2f2", icon: X },
};

export function CapBar({
  total,
  reactive,
  teamName,
  dateLabel,
}: {
  total: number;
  reactive: number;
  teamName: string;
  dateLabel: string;
}) {
  const band = capacityBand(total);
  const color = bandColor(band);
  const safe = Math.max(0, total);
  const scale = Math.max(PRODUCTIVE * 1.25, safe);
  const pctGreen = Math.min(100, (Math.min(safe, PRODUCTIVE) / scale) * 100);
  const pctRed = safe > PRODUCTIVE ? Math.min(100, ((safe - PRODUCTIVE) / scale) * 100) : 0;
  const targetMark = (PRODUCTIVE / scale) * 100;

  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1.5">
        <span className="font-semibold" style={{ color: NAVY }}>
          {teamName} — {dateLabel}
        </span>
        <span className="font-bold">
          <span style={{ color }}>{fmtMins(total)}</span>
          <span className="text-gray-900"> / {fmtMins(PRODUCTIVE)} target</span>
        </span>
      </div>
      <div className="relative h-5 rounded-full overflow-hidden bg-gray-100 flex">
        <div
          className="h-full rounded-l-full transition-all"
          style={{ width: `${pctGreen}%`, background: "#16a34a" }}
        />
        {pctRed > 0 && (
          <div
            className="h-full rounded-r-full transition-all"
            style={{ width: `${pctRed}%`, background: "#dc2626" }}
          />
        )}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white/80"
          style={{ left: `${targetMark}%` }}
        />
      </div>
      <div className="flex gap-3 mt-2 flex-wrap text-[11px]">
        <span className="flex items-center gap-1 text-green-700">
          <span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" />
          Within target
        </span>
        <span className="flex items-center gap-1 text-red-600">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" />
          Over target
        </span>
      </div>
    </div>
  );
}

export interface AssetStub {
  id: string;
  name: string;
  reference: string;
  serviceTimeMins: number;
  frequency: string;
  teamId?: string | null;
  suburb?: string | null;
}

export interface TeamStub {
  id: string;
  name: string;
}

export interface WizardProps {
  teamsData: TeamStub[];
  assetsData: AssetStub[];
  onClose: () => void;
  onPublished: () => void;
}

function WizardSectionCard({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100">
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black text-white flex-shrink-0"
          style={{ background: BRAND }}
        >{num}</div>
        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function ReactiveJobWizard({ teamsData, assetsData, onClose, onPublished }: WizardProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const today = localDateStr(new Date());

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const [locationType, setLocationType] = useState<"asset" | "other">("asset");
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [assetSearch, setAssetSearch] = useState("");
  const [assetDropdownOpen, setAssetDropdownOpen] = useState(false);
  const [freeTextLocation, setFreeTextLocation] = useState("");
  const [extraDescription, setExtraDescription] = useState("");
  const [combineScheduled, setCombineScheduled] = useState(false);
  const [reason, setReason] = useState(REASON_TYPES[0]);
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedTeamId, setSelectedTeamId] = useState(teamsData[0]?.id ?? "");
  const [reactiveMin, setReactiveMin] = useState(90);
  const [priority, setPriority] = useState<string>("urgent");
  const [notes, setNotes] = useState("");

  const [attachments, setAttachments] = useState<File[]>([]);
  const [actions, setActions] = useState<Record<string, JobAction>>({});
  const [reassignTo, setReassignTo] = useState<Record<string, string>>({});
  const [isPublishing, setIsPublishing] = useState(false);
  const [acceptOvertime, setAcceptOvertime] = useState(false);
  const [pushingScheduleForward, setPushingScheduleForward] = useState(false);
  const [scheduleWasPushed, setScheduleWasPushed] = useState(false);
  const [pushSessionToken, setPushSessionToken] = useState<string | null>(null);
  const [undoingPush, setUndoingPush] = useState(false);

  const UNDO_WINDOW_MS = 15 * 60 * 1000;
  const undoExpired = pushSessionToken
    ? Date.now() - new Date(pushSessionToken).getTime() > UNDO_WINDOW_MS
    : false;

  const { data: settingsData } = useQuery<{ reactivePriorities?: ReactivePriority[] }>({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const r = await fetch("/api/settings", { credentials: "include" });
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const priorities: ReactivePriority[] =
    settingsData?.reactivePriorities?.length ? settingsData.reactivePriorities : DEFAULT_PRIORITIES;

  const selectedAsset = assetsData.find(a => a.id === selectedAssetId);
  const selectedTeam = teamsData.find(t => t.id === selectedTeamId);
  const teamName = selectedTeam?.name ?? "Team";
  const weekStr = selectedDate ? mondayOf(selectedDate) : today;
  const dateLabel = selectedDate
    ? format(new Date(selectedDate + "T00:00:00"), "EEE d MMM")
    : "";

  const { data: weekData, isLoading: weekLoading } = useGetScheduleWeek(
    { week: weekStr, teamId: selectedTeamId || undefined },
    {
      query: {
        queryKey: getGetScheduleWeekQueryKey({ week: weekStr, teamId: selectedTeamId || undefined }),
        enabled: step >= 2 && !!weekStr && !!selectedTeamId,
      },
    },
  );

  const dayJobs: JobWithAsset[] = useMemo(
    () => weekData?.days?.find(d => d.date === selectedDate)?.jobs ?? [],
    [weekData, selectedDate],
  );

  useEffect(() => {
    if (dayJobs.length > 0) {
      setActions(prev => {
        const next = { ...prev };
        dayJobs.forEach(j => {
          if (!(j.id in next)) next[j.id] = "none";
        });
        return next;
      });
    }
  }, [dayJobs]);

  useEffect(() => {
    setScheduleWasPushed(false);
    setPushSessionToken(null);
  }, [selectedDate, selectedTeamId]);

  const assetDayJob = useMemo(() => {
    if (!selectedAssetId || !weekData) return null;
    for (const day of weekData.days) {
      const job = day.jobs.find(j => j.assetId === selectedAssetId);
      if (job) return { ...job, date: day.date };
    }
    return null;
  }, [weekData, selectedAssetId]);

  const assetDayJobWorkingDays =
    assetDayJob ? workingDaysBetween(selectedDate, assetDayJob.date) : null;
  const canCombine =
    assetDayJobWorkingDays !== null && assetDayJobWorkingDays <= COMBINE_THRESHOLD;
  const assetServiceMins = assetDayJob?.serviceTimeMins ?? selectedAsset?.serviceTimeMins ?? 0;
  // combinedMins is only used for the informational label on the combine button.
  // It is NOT added to serviceMin — the scheduled job's time is already counted
  // in totalScheduled, so the capacity impact is just the reactive work itself.
  const combinedVisitMins = combineScheduled && canCombine ? reactiveMin + assetServiceMins : 0;
  const serviceMin = reactiveMin;

  const location =
    locationType === "asset" && selectedAsset ? selectedAsset.name : freeTextLocation;

  const totalScheduled = dayJobs.reduce(
    (s, j) => s + (j.serviceTimeMins ?? 0),
    0,
  );
  const totalWithReactive = totalScheduled + serviceMin;

  const { resolvedTotal } = useMemo(() => {
    const freed = dayJobs
      .filter(j => {
        const a = actions[j.id];
        return (
          a === "push" ||
          a === "defer" ||
          a === "delete" ||
          (a === "reassign" && reassignTo[j.id])
        );
      })
      .reduce((s, j) => s + (j.serviceTimeMins ?? 0), 0);
    return { resolvedTotal: totalWithReactive - freed };
  }, [actions, reassignTo, dayJobs, totalWithReactive]);

  const overTarget = resolvedTotal > PRODUCTIVE;
  const isGreen = resolvedTotal <= PRODUCTIVE;
  const canPublish = !overTarget || acceptOvertime || scheduleWasPushed;

  const resolvedJobsList = dayJobs.filter(j => actions[j.id] && actions[j.id] !== "none");

  const updateJob = useUpdateJob();
  const createRJ = useCreateReactiveJob();

  const handlePushSchedule = async () => {
    if (!selectedTeamId || !selectedDate) return;
    setPushingScheduleForward(true);
    try {
      const res = await fetch("/api/schedule/push-forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          teamId: selectedTeamId,
          fromDate: selectedDate,
          minutesToFree: Math.max(1, resolvedTotal - PRODUCTIVE),
          insertionAssetId: selectedAssetId ?? undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setScheduleWasPushed(true);
      setPushSessionToken(data.pushedAt ?? new Date().toISOString());
      qc.invalidateQueries({ queryKey: getGetScheduleWeekQueryKey({ teamId: selectedTeamId }) });
      setStep(4);
    } catch (err) {
      toast({ title: "Push failed", description: String(err), variant: "destructive" });
    } finally {
      setPushingScheduleForward(false);
    }
  };

  const handleUndoPush = async () => {
    if (!selectedTeamId || !selectedDate) return;
    setUndoingPush(true);
    try {
      const res = await fetch("/api/schedule/push-forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          teamId: selectedTeamId,
          fromDate: selectedDate,
          deltaDays: -1,
          pushedAt: pushSessionToken ?? undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body?.error === "undo_expired") {
          toast({
            title: "Undo unavailable",
            description: "The 15-minute undo window has passed. The schedule change cannot be reversed.",
            variant: "destructive",
          });
          return;
        }
        throw new Error(body?.message ?? res.statusText);
      }
      setScheduleWasPushed(false);
      setPushSessionToken(null);
      qc.invalidateQueries({ queryKey: getGetScheduleWeekQueryKey({ teamId: selectedTeamId }) });
      setStep(3);
    } catch (err) {
      toast({ title: "Undo failed", description: String(err), variant: "destructive" });
    } finally {
      setUndoingPush(false);
    }
  };

  const handlePublish = async () => {
    if (!canPublish) return;
    setIsPublishing(true);
    try {
      const priorityMap: Record<string, string> = { urgent: "urgent", standard: "medium", routine: "low" };
      const rjBody: Record<string, unknown> = {
        issueType: reason,
        description: notes || location || reason,
        priority: priorityMap[priority] ?? "medium",
        assignedTeamId: selectedTeamId || undefined,
        scheduledDate: selectedDate,
        estimatedTimeMins: serviceMin,
        location: location || undefined,
        status: selectedTeamId ? "assigned" : "raised",
      };
      if (locationType === "asset" && selectedAssetId) {
        rjBody.assetId = selectedAssetId;
      }

      const newJob = await (
        createRJ as { mutateAsync: (d: unknown) => Promise<{ id: string }> }
      ).mutateAsync({ data: rjBody });

      // Upload any attachments collected in Step 1
      if (attachments.length > 0 && newJob?.id) {
        await Promise.all(
          attachments.map(file => {
            const fd = new FormData();
            fd.append("photo", file);
            return fetch(`/api/reactive-jobs/${newJob.id}/photos`, {
              method: "POST",
              credentials: "include",
              body: fd,
            });
          }),
        );
      }

      await Promise.all(
        dayJobs
          .filter(j => actions[j.id] && actions[j.id] !== "none")
          .map(j => {
            const a = actions[j.id];
            if (a === "push")
              return updateJob.mutateAsync({
                id: j.id,
                data: { scheduledDate: addDaysStr(j.scheduledDate, 1) } as never,
              });
            if (a === "defer")
              return updateJob.mutateAsync({
                id: j.id,
                data: { scheduledDate: addDaysStr(j.scheduledDate, 3) } as never,
              });
            if (a === "delete")
              return updateJob.mutateAsync({
                id: j.id,
                data: { status: "skipped" } as never,
              });
            if (a === "reassign" && reassignTo[j.id])
              return updateJob.mutateAsync({
                id: j.id,
                data: { teamId: reassignTo[j.id] } as never,
              });
            return Promise.resolve();
          }),
      );

      await Promise.all([
        qc.invalidateQueries({ queryKey: getListReactiveJobsQueryKey() }),
        qc.invalidateQueries({ queryKey: ["/api/schedule/week"] }),
        qc.invalidateQueries({ queryKey: ["/api/schedule/range"] }),
        qc.invalidateQueries({ queryKey: ["/api/dashboard/summary"] }),
      ]);

      toast({
        title: "Unscheduled work published",
        description: `${location} assigned to ${teamName} for ${dateLabel}`,
      });
      onPublished();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast({ title: "Failed to publish", description: msg, variant: "destructive" });
    } finally {
      setIsPublishing(false);
    }
  };

  const setAction = (id: string, a: JobAction) => {
    setActions(prev => ({ ...prev, [id]: a }));
    if (a !== "reassign") {
      setReassignTo(prev => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
    }
  };

  const STEP_LABELS = ["Create Job", "Schedule Impact", "Resolve Conflicts", "Confirm & Publish"];
  const step1Valid =
    (locationType === "asset" ? !!selectedAssetId : !!freeTextLocation.trim()) &&
    !!selectedTeamId &&
    reactiveMin > 0;

  return (
    <div className="fixed inset-0 left-56 z-50 bg-gray-50 flex flex-col overflow-hidden">
      {/* Hero header */}
      <header className="px-8 pt-5 pb-4 flex-shrink-0" style={{ background: NAVY }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: BRAND }}>Unscheduled Work</p>
            <h1 className="text-lg font-black text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              New Reactive Job
            </h1>
            <p className="text-[11px] text-gray-400 mt-0.5">Ad-hoc work insertion with schedule impact management</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors mt-0.5 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Step progress */}
      <div className="bg-white border-b px-8 py-3 flex-shrink-0">
        <div className="flex items-center max-w-2xl">
          {STEP_LABELS.map((label, i) => {
            const n = (i + 1) as 1 | 2 | 3 | 4;
            const done = step > n;
            const active = step === n;
            return (
              <div key={label} className="flex items-center flex-1">
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${done || active ? "text-white" : "bg-gray-100 text-gray-400"}`}
                    style={done || active ? { background: BRAND } : {}}
                  >
                    {done ? <CheckCircle2 className="w-4 h-4" /> : n}
                  </div>
                  <span
                    className={`text-xs font-medium ${active ? "text-gray-900" : done ? "text-gray-500" : "text-gray-300"}`}
                  >
                    {label}
                  </span>
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div
                    className="flex-1 h-px mx-3"
                    style={{ background: done ? BRAND : "#e5e7eb" }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-8 py-6 space-y-5">

          {/* ── STEP 1 ──────────────────────────────────────────────── */}
          {step === 1 && (
            <>
              <WizardSectionCard num={1} title="Location">
                <div className="flex gap-2 mb-4">
                  {(["asset", "other"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => {
                        setLocationType(t);
                        setSelectedAssetId("");
                        setCombineScheduled(false);
                      }}
                      className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${locationType === t ? "text-white border-transparent" : "border-gray-200 text-gray-500 bg-white"}`}
                      style={locationType === t ? { background: BRAND } : {}}
                    >
                      {t === "asset" ? "📋 Known garden asset" : "📍 Other public land"}
                    </button>
                  ))}
                </div>

                {locationType === "asset" ? (
                  <div className="space-y-3">
                    <div className="relative">
                      <label className="text-xs text-gray-500 font-medium block mb-1.5">
                        Select garden asset *
                      </label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                        <input
                          type="text"
                          value={selectedAssetId
                            ? (assetsData.find(a => a.id === selectedAssetId)?.name ?? assetSearch)
                            : assetSearch}
                          onChange={e => {
                            setAssetSearch(e.target.value);
                            setSelectedAssetId("");
                            setCombineScheduled(false);
                            setAssetDropdownOpen(true);
                          }}
                          onFocus={() => {
                            if (selectedAssetId) setAssetSearch("");
                            setAssetDropdownOpen(true);
                          }}
                          onBlur={() => setTimeout(() => setAssetDropdownOpen(false), 150)}
                          placeholder="Search by name…"
                          className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] bg-white"
                        />
                      </div>
                      {assetDropdownOpen && (
                        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                          {(() => {
                            const q = assetSearch.toLowerCase();
                            const filtered = assetsData.filter(a =>
                              !q ||
                              a.name.toLowerCase().includes(q) ||
                              ((a as any).description ?? "").toLowerCase().includes(q)
                            );
                            return filtered.length === 0
                              ? <p className="px-4 py-3 text-sm text-gray-400 text-center">No assets found</p>
                              : filtered.slice(0, 50).map(a => (
                                <button
                                  key={a.id}
                                  type="button"
                                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors flex items-start justify-between gap-2"
                                  onMouseDown={() => {
                                    setSelectedAssetId(a.id);
                                    setAssetSearch("");
                                    setAssetDropdownOpen(false);
                                    setCombineScheduled(false);
                                    if (a.teamId) setSelectedTeamId(a.teamId);
                                  }}
                                >
                                  <span className="flex flex-col min-w-0">
                                    <span className="font-medium text-gray-900 truncate">{a.name}</span>
                                    {(a as any).description && (
                                      <span className="text-[11px] text-gray-400 truncate">{(a as any).description}</span>
                                    )}
                                  </span>
                                </button>
                              ));
                          })()}
                        </div>
                      )}
                    </div>
                    {selectedAsset && (
                      <div className="text-[11px] text-gray-400 flex items-center gap-3 px-1 flex-wrap">
                        <span>
                          Freq:{" "}
                          <span className="font-semibold text-gray-600 capitalize">
                            {selectedAsset.frequency}
                          </span>
                        </span>
                        <span>·</span>
                        <span>
                          Service time:{" "}
                          <span className="font-semibold text-gray-600">
                            {fmtMins(selectedAsset.serviceTimeMins)}
                          </span>
                        </span>
                        {selectedAsset.suburb && (
                          <>
                            <span>·</span>
                            <span>{selectedAsset.suburb}</span>
                          </>
                        )}
                      </div>
                    )}
                    <div>
                      <label className="text-xs text-gray-500 font-medium block mb-1.5">
                        Additional description (optional)
                      </label>
                      <input
                        value={extraDescription}
                        onChange={e => setExtraDescription(e.target.value)}
                        placeholder="e.g. NE corner near entrance gate…"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD]"
                      />
                    </div>
                    {selectedAssetId && selectedTeamId && (
                      <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-2">
                        <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
                        <p className="text-xs text-blue-700">
                          Schedule combination check runs when you advance to Step 2.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1.5">
                      Location / Description *
                    </label>
                    <input
                      value={freeTextLocation}
                      onChange={e => setFreeTextLocation(e.target.value)}
                      placeholder="e.g. Parumoana St Roundabout, outside 42 Kenepuru Dr…"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD]"
                    />
                    <p className="text-[10px] text-gray-400 mt-1.5">
                      Any publicly managed land — road berms, reserves, footpaths, parks not in the
                      asset register.
                    </p>
                  </div>
                )}
              </WizardSectionCard>

              <WizardSectionCard num={2} title="Job Details">
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1.5">
                      Reason / Type
                    </label>
                    <select
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] bg-white"
                    >
                      {REASON_TYPES.map(r => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1.5">Scheduled on</label>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={e => setSelectedDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1.5">
                      Assign to Team
                    </label>
                    <select
                      value={selectedTeamId}
                      onChange={e => setSelectedTeamId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] bg-white"
                    >
                      <option value="">— Select a team —</option>
                      {teamsData.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    {locationType === "asset" &&
                      selectedAsset?.teamId &&
                      selectedTeamId !== selectedAsset.teamId && (
                        <p className="text-[10px] text-amber-600 mt-1.5">
                          ⚠ Normally serviced by{" "}
                          {teamsData.find(t => t.id === selectedAsset.teamId)?.name ??
                            "another team"}
                        </p>
                      )}
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1.5">
                      Allocated time (min)
                    </label>
                    <input
                      type="number"
                      value={reactiveMin}
                      onChange={e => setReactiveMin(Number(e.target.value))}
                      min={5}
                      max={480}
                      step={5}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD]"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 font-medium block mb-1.5">Priority</label>
                    <div className="flex gap-2">
                      {priorities.map(p => (
                        <button
                          key={p.id}
                          onClick={() => setPriority(p.id)}
                          className="flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all"
                          style={
                            priority === p.id
                              ? { borderColor: p.color, background: p.bg, color: p.color }
                              : { borderColor: "#e5e7eb", background: "white", color: "#9ca3af" }
                          }
                        >
                          {p.emoji} {p.label.split(" / ")[0]}
                        </button>
                      ))}
                    </div>
                    {priorities.find(p => p.id === priority) && (
                      <p className="text-[11px] text-gray-400 mt-1.5 pl-1">
                        <span className="font-semibold" style={{ color: priorities.find(p => p.id === priority)!.color }}>
                          {priorities.find(p => p.id === priority)!.responseTime}
                        </span>
                        {" — "}
                        {priorities.find(p => p.id === priority)!.description}
                      </p>
                    )}
                    {priority === "urgent" && selectedDate && (() => {
                      const diffDays = Math.round((new Date(selectedDate + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) / 86_400_000);
                      return diffDays > 2 ? (
                        <p className="text-[11px] text-amber-600 mt-2 pl-1 flex items-start gap-1">
                          <span>⚠</span>
                          <span>Urgent jobs are typically attended within 1–2 hours — is <strong>{format(new Date(selectedDate + "T00:00:00"), "EEE d MMM")}</strong> the correct date?</span>
                        </p>
                      ) : null;
                    })()}
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 font-medium block mb-1.5">
                      Notes (optional)
                    </label>
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      rows={2}
                      placeholder="Any additional context or instructions…"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] resize-none"
                    />
                  </div>
                </div>
              </WizardSectionCard>

              {/* ── Attachments ──────────────────────────────────────────── */}
              <WizardSectionCard num={3} title="Attachments (optional)">
                {/* Drop / click zone */}
                <label
                  className="flex flex-col items-center justify-center gap-2 w-full border-2 border-dashed border-gray-200 rounded-xl py-6 px-4 cursor-pointer hover:border-[#00AECD] hover:bg-[#00AECD]/5 transition-colors"
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault();
                    const files = Array.from(e.dataTransfer.files);
                    setAttachments(prev => {
                      const existing = new Set(prev.map(f => f.name + f.size));
                      return [...prev, ...files.filter(f => !existing.has(f.name + f.size))];
                    });
                  }}
                >
                  <input
                    type="file"
                    multiple
                    accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                    className="hidden"
                    onChange={e => {
                      const files = Array.from(e.target.files ?? []);
                      setAttachments(prev => {
                        const existing = new Set(prev.map(f => f.name + f.size));
                        return [...prev, ...files.filter(f => !existing.has(f.name + f.size))];
                      });
                      e.target.value = "";
                    }}
                  />
                  <Paperclip className="w-5 h-5 text-gray-300" />
                  <p className="text-sm text-gray-500 text-center">
                    <span className="font-semibold text-[#00AECD]">Click to browse</span> or drag files here
                  </p>
                  <p className="text-[11px] text-gray-400">Images, PDF, Word, Excel — max 20 MB each</p>
                </label>

                {/* File list */}
                {attachments.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {attachments.map((file, idx) => {
                      const isImage = file.type.startsWith("image/");
                      const previewUrl = isImage ? URL.createObjectURL(file) : null;
                      const sizeMb = (file.size / 1024 / 1024).toFixed(1);
                      return (
                        <div
                          key={idx}
                          className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100"
                        >
                          {previewUrl ? (
                            <img
                              src={previewUrl}
                              alt={file.name}
                              className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-gray-200"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
                              {file.type === "application/pdf"
                                ? <FileText className="w-5 h-5 text-red-500" />
                                : <FileText className="w-5 h-5 text-blue-500" />}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                            <p className="text-[11px] text-gray-400">{sizeMb} MB</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                            className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="Remove"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </WizardSectionCard>

              <div className="flex justify-end">
                <button
                  onClick={() => setStep(2)}
                  disabled={!step1Valid}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity ${!step1Valid ? "opacity-40 cursor-not-allowed" : "hover:opacity-90"}`}
                  style={{ background: BRAND }}
                >
                  Check Schedule Impact <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {/* ── STEP 2 ──────────────────────────────────────────────── */}
          {step === 2 && (
            <>
              {/* Reactive job summary pill */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-5">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-amber-50 flex-shrink-0">
                  <Zap className="w-6 h-6 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{location || "—"}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[11px]">
                    <span className="text-gray-400">{reason}</span>
                    <span className="text-gray-300">·</span>
                    <span className="font-medium" style={{ color: BRAND }}>
                      {teamName} · {dateLabel}
                    </span>
                    <span className="text-gray-300">·</span>
                    <span className="flex items-center gap-1 text-gray-500">
                      <Clock className="w-3 h-3" />
                      {fmtMins(serviceMin)}
                    </span>
                  </div>
                </div>
                <span
                  className="text-[11px] font-bold px-3 py-1 rounded-full flex-shrink-0"
                  style={{
                    background: (priorities.find(p => p.id === priority) ?? PRIORITY_CONFIG[priority])?.bg,
                    color: (priorities.find(p => p.id === priority) ?? PRIORITY_CONFIG[priority])?.color,
                  }}
                >
                  {priorities.find(p => p.id === priority)?.label.split(" / ")[0] ?? priority}
                </span>
              </div>

              {/* Capacity impact card */}
              <WizardSectionCard num={1} title={`Schedule Impact — ${teamName}, ${dateLabel}`}>
                {weekLoading ? (
                  <div className="h-24 flex items-center justify-center text-gray-400 text-sm">
                    Loading schedule data…
                  </div>
                ) : (
                  <>
                    <CapBar
                      total={totalWithReactive}
                      reactive={serviceMin}
                      teamName={teamName}
                      dateLabel={dateLabel}
                    />

                    <div className="mt-5 flex items-center gap-2">
                      <div className="flex-1 text-center p-3 rounded-xl bg-gray-50">
                        <p className="text-[11px] text-gray-400 mb-1">Scheduled {dateLabel}</p>
                        <p className="text-xl font-black" style={{ color: "#374151" }}>{fmtMins(totalScheduled)}</p>
                      </div>
                      <span className="text-xl font-bold text-gray-400 flex-shrink-0">+</span>
                      <div className="flex-1 text-center p-3 rounded-xl bg-gray-50">
                        <p className="text-[11px] text-gray-400 mb-1">Unscheduled work</p>
                        <p className="text-xl font-black" style={{ color: "#374151" }}>+{fmtMins(serviceMin)}</p>
                      </div>
                      <span className="text-xl font-bold text-gray-400 flex-shrink-0">=</span>
                      <div className="flex-1 text-center p-3 rounded-xl bg-gray-50">
                        <p className="text-[11px] text-gray-400 mb-1">New total</p>
                        <p className="text-xl font-black" style={{ color: totalWithReactive > PRODUCTIVE ? "#dc2626" : "#16a34a" }}>{fmtMins(totalWithReactive)}</p>
                      </div>
                    </div>

                    {totalWithReactive > PRODUCTIVE && (
                      <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 flex gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-bold text-red-700">
                            {teamName} will be {fmtMins(totalWithReactive - PRODUCTIVE)} over the
                            daily target
                          </p>
                          <p className="text-xs text-red-600 mt-0.5">
                            Push, defer, delete or reassign at least{" "}
                            {fmtMins(totalWithReactive - PRODUCTIVE)} of scheduled work on the next
                            step.
                          </p>
                        </div>
                      </div>
                    )}
                    {totalWithReactive <= PRODUCTIVE && (
                      <div className="mt-4 p-3 rounded-xl bg-green-50 border border-green-200 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <p className="text-xs font-semibold text-green-700">
                          Within productive target — no capacity issues.
                        </p>
                      </div>
                    )}

                    {/* Combine recommendation */}
                    {locationType === "asset" && selectedAssetId && (
                      <>
                        {assetDayJob && canCombine && (
                          <div className="mt-4 p-4 rounded-xl bg-green-50 border-2 border-green-200">
                            <div className="flex items-start gap-3">
                              <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                              <div className="flex-1">
                                <p className="text-sm font-bold text-green-800">
                                  Scheduled maintenance due{" "}
                                  {assetDayJob.date === selectedDate
                                    ? "on the same day"
                                    : `in ${assetDayJobWorkingDays} working day${assetDayJobWorkingDays !== 1 ? "s" : ""}`}{" "}
                                  ({fmtDateStr(assetDayJob.date, "d MMM yyyy")})
                                </p>
                                <p className="text-xs text-green-700 mt-0.5">
                                  Within the {COMBINE_THRESHOLD}-day window. Combine into a single
                                  visit to avoid a separate trip.
                                </p>
                                <div className="mt-3 flex items-center gap-3">
                                  <button
                                    onClick={() => setCombineScheduled(v => !v)}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 text-xs font-bold transition-all ${combineScheduled ? "bg-green-600 border-green-600 text-white" : "border-green-400 text-green-700 bg-white"}`}
                                  >
                                    {combineScheduled ? (
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                    ) : (
                                      <Plus className="w-3.5 h-3.5" />
                                    )}
                                    {combineScheduled
                                      ? "Combined — includes scheduled"
                                      : "Combine with scheduled visit"}
                                  </button>
                                  {combineScheduled && (
                                    <span className="text-[11px] text-green-700 font-semibold">
                                      {fmtMins(combinedVisitMins)} combined visit
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        {assetDayJob && !canCombine && (
                          <div className="mt-4 p-4 rounded-xl bg-gray-50 border border-gray-200 flex gap-3">
                            <Clock className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-bold text-gray-700">
                                Scheduled maintenance on {assetDayJob.date} —{" "}
                                {assetDayJobWorkingDays} working days away
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                Beyond the {COMBINE_THRESHOLD}-day window. Reactive visit only.
                              </p>
                            </div>
                          </div>
                        )}
                        {!assetDayJob && !weekLoading && (
                          <div className="mt-4 p-3 rounded-xl bg-gray-50 border border-gray-100 flex items-center gap-2">
                            <Info className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <p className="text-xs text-gray-500">
                              No scheduled maintenance for this asset this week.
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </WizardSectionCard>

              <div className="flex items-center justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="text-sm text-gray-400 hover:text-gray-600"
                >
                  ← Back
                </button>
                <button
                  onClick={() => setStep(totalWithReactive > PRODUCTIVE ? 3 : 4)}
                  disabled={weekLoading}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  style={{ background: BRAND }}
                >
                  {totalWithReactive > PRODUCTIVE ? "Resolve Conflicts" : "Review & Confirm"}{" "}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {/* ── STEP 3 ──────────────────────────────────────────────── */}
          {step === 3 && (
            <>
              {/* Live capacity bar */}
              <WizardSectionCard num={1} title="Capacity">
                <CapBar
                  total={resolvedTotal}
                  reactive={serviceMin}
                  teamName={teamName}
                  dateLabel={dateLabel}
                />
                {overTarget && !acceptOvertime && !scheduleWasPushed && (
                  <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200">
                    <div className="flex items-start gap-2 mb-3">
                      <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs font-semibold text-red-700 flex-1">
                        Still {fmtMins(resolvedTotal - PRODUCTIVE)} over target — choose an option below or amend individual jobs.
                      </p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => { setAcceptOvertime(true); setStep(4); }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-red-300 text-red-700 hover:bg-red-100 transition-colors flex-shrink-0"
                      >
                        1 — Accept overtime
                      </button>
                      <button
                        onClick={handlePushSchedule}
                        disabled={pushingScheduleForward}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-blue-300 text-blue-700 hover:bg-blue-50 transition-colors flex-shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {pushingScheduleForward
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <SkipForward className="w-3 h-3" />}
                        2 — Push to make room ({fmtMins(serviceMin)})
                      </button>
                    </div>
                  </div>
                )}
                {overTarget && acceptOvertime && (
                  <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <p className="text-xs font-semibold text-amber-700 flex-1">
                      Overtime accepted — team will work {fmtMins(resolvedTotal - PRODUCTIVE)} over target.
                    </p>
                    <button
                      onClick={() => setAcceptOvertime(false)}
                      className="text-xs text-amber-600 underline hover:text-amber-800 flex-shrink-0"
                    >
                      Undo
                    </button>
                  </div>
                )}
                {scheduleWasPushed && (
                  <div className="mt-3 p-3 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-2">
                    <SkipForward className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    <p className="text-xs font-semibold text-blue-700 flex-1">
                      Schedule pushed +1 working day — all jobs on {dateLabel} moved to the next working day.
                    </p>
                  </div>
                )}
                {isGreen && (
                  <div className="mt-3 p-3 rounded-xl bg-green-50 border border-green-200 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <p className="text-xs font-semibold text-green-700">
                      Within daily target — ready to publish.
                    </p>
                  </div>
                )}
              </WizardSectionCard>

              {/* Jobs list — section 2 of step 3, labelled as option 3 per the step flow */}
              <WizardSectionCard num={2} title={`Amend Individual Jobs — ${teamName}, ${dateLabel} · ${dayJobs.length} job${dayJobs.length !== 1 ? "s" : ""} · ${fmtMins(totalScheduled)}`}>
                <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-2">3 — or amend individual jobs below</div>
                {dayJobs.length === 0 ? (
                  <div className="px-5 py-10 text-center text-sm text-gray-400">
                    {weekLoading
                      ? "Loading…"
                      : "No scheduled jobs for this team on this day."}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {dayJobs.map(job => {
                      const action = actions[job.id] ?? "none";
                      const resolved = action !== "none";
                      const freq = job.gardenType ? "fortnightly" : "fortnightly";
                      const windowDays = freqWindowDays(freq);
                      const windowBreach = (n: number) => n > Math.ceil(windowDays * 0.3);
                      const jobMins = job.serviceTimeMins ?? 0;

                      return (
                        <div
                          key={job.id}
                          className={`px-5 py-4 transition-colors ${resolved ? "bg-green-50/40" : ""}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white bg-gray-500 capitalize">
                                  {(job.gardenType ?? "garden").replace(/_/g, " ")}
                                </span>
                              </div>
                              <p className="text-sm font-semibold text-gray-900">{job.assetName}</p>
                              <div className="flex items-center gap-3 mt-0.5 flex-wrap text-[11px] text-gray-400">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {fmtMins(jobMins)}
                                </span>
                                {job.suburb && <span>{job.suburb}</span>}
                              </div>
                              {action === "push" && (
                                <span
                                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1.5 inline-block ${windowBreach(1) ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-700"}`}
                                >
                                  {windowBreach(1)
                                    ? "⚠ May breach service window"
                                    : `✓ Pushed → ${fmtDateStr(addDaysStr(job.scheduledDate, 1))}`}
                                </span>
                              )}
                              {action === "defer" && (
                                <span
                                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1.5 inline-block ${windowBreach(3) ? "bg-red-50 text-red-600" : "bg-purple-50 text-purple-700"}`}
                                >
                                  {windowBreach(3)
                                    ? "⚠ May breach service window"
                                    : `✓ Deferred → ${fmtDateStr(addDaysStr(job.scheduledDate, 3))}`}
                                </span>
                              )}
                              {action === "reassign" && reassignTo[job.id] && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 mt-1.5 inline-block">
                                  → {teamsData.find(t => t.id === reassignTo[job.id])?.name ?? "team"}
                                </span>
                              )}
                              {action === "delete" && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600 mt-1.5 inline-block">
                                  ✕ Removed from schedule
                                </span>
                              )}
                            </div>

                            {resolved && (
                              <p className="text-[11px] text-green-600 font-bold flex-shrink-0">
                                -{fmtMins(jobMins)}
                              </p>
                            )}

                            <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end max-w-[220px]">
                              {(
                                ["push", "defer", "delete", "reassign"] as const
                              ).map(a => {
                                const active = action === a;
                                const iconMap: Record<string, React.ReactNode> = {
                                  push: <SkipForward className="w-3 h-3" />,
                                  defer: <Calendar className="w-3 h-3" />,
                                  delete: <Trash2 className="w-3 h-3" />,
                                  reassign: <Users className="w-3 h-3" />,
                                };
                                const labelMap: Record<string, string> = {
                                  push: "Push +1d",
                                  defer: "Defer +3d",
                                  delete: "Delete",
                                  reassign: "Reassign",
                                };
                                const colMap: Record<string, string> = {
                                  push: "#2563eb",
                                  defer: "#7c3aed",
                                  delete: "#dc2626",
                                  reassign: "#9333ea",
                                };
                                return (
                                  <button
                                    key={a}
                                    onClick={() => setAction(job.id, active ? "none" : a)}
                                    className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border-2 transition-all ${active ? "text-white border-transparent" : "border-gray-200 text-gray-500 hover:border-gray-300 bg-white"}`}
                                    style={
                                      active
                                        ? { background: colMap[a], borderColor: colMap[a] }
                                        : {}
                                    }
                                  >
                                    {iconMap[a]}
                                    {labelMap[a]}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {action === "reassign" && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                              <p className="text-[11px] font-semibold text-gray-500 mb-2">
                                Reassign to which team?
                              </p>
                              <div className="flex gap-2 flex-wrap">
                                {teamsData
                                  .filter(t => t.id !== selectedTeamId)
                                  .map(t => (
                                    <button
                                      key={t.id}
                                      onClick={() =>
                                        setReassignTo(prev => ({ ...prev, [job.id]: t.id }))
                                      }
                                      className={`px-3 py-2 rounded-xl border-2 text-xs font-semibold transition-all ${
                                        reassignTo[job.id] === t.id
                                          ? "border-purple-400 bg-purple-50 text-purple-800"
                                          : "border-gray-200 hover:border-gray-300 bg-white text-gray-700"
                                      }`}
                                    >
                                      {t.name}
                                    </button>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </WizardSectionCard>

              <div className="flex items-center justify-between">
                <button
                  onClick={() => { setStep(2); setAcceptOvertime(false); setScheduleWasPushed(false); }}
                  className="text-sm text-gray-400 hover:text-gray-600"
                >
                  ← Back
                </button>
                <button
                  onClick={() => setStep(4)}
                  disabled={!canPublish}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity ${!canPublish ? "opacity-40 cursor-not-allowed" : "hover:opacity-90"}`}
                  style={{ background: BRAND }}
                >
                  Review & Confirm <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {/* ── STEP 4 ──────────────────────────────────────────────── */}
          {step === 4 && (
            <>
              {/* Reactive job summary */}
              <WizardSectionCard num={1} title="Unscheduled Work to be Added">
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-900">{location}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px] text-gray-500">
                      <span>{reason}</span>
                      <span className="text-gray-300">·</span>
                      <span>{teamName}</span>
                      <span className="text-gray-300">·</span>
                      <span>{dateLabel}</span>
                      <span className="text-gray-300">·</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {fmtMins(serviceMin)}
                      </span>
                    </div>
                    {extraDescription && (
                      <p className="text-[11px] text-gray-500 mt-1 italic">{extraDescription}</p>
                    )}
                    {notes && <p className="text-[11px] text-gray-500 mt-1">{notes}</p>}
                  </div>
                  <span
                    className="text-[11px] font-bold px-3 py-1 rounded-full flex-shrink-0"
                    style={{
                      background: (priorities.find(p => p.id === priority) ?? PRIORITY_CONFIG[priority])?.bg,
                      color: (priorities.find(p => p.id === priority) ?? PRIORITY_CONFIG[priority])?.color,
                    }}
                  >
                    {priorities.find(p => p.id === priority)?.label.split(" / ")[0] ?? priority}
                  </span>
                </div>
              </WizardSectionCard>

              {/* Schedule changes */}
              {(scheduleWasPushed || resolvedJobsList.length > 0) && (
                <WizardSectionCard num={2} title={`Schedule Changes${resolvedJobsList.length > 0 ? ` (${resolvedJobsList.length} job${resolvedJobsList.length !== 1 ? "s" : ""})` : ""}`}>
                  <div className="space-y-2">
                    {scheduleWasPushed && (
                      <div className="flex items-center gap-3 py-2.5 px-4 rounded-xl bg-blue-50 border border-blue-100">
                        <SkipForward className="w-4 h-4 text-blue-500 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-[13px] font-semibold text-gray-800">
                            Whole schedule pushed forward
                          </p>
                          <p className="text-[11px] font-medium mt-0.5 text-blue-600">
                            All scheduled jobs shifted +1 working day from {dateLabel}
                          </p>
                        </div>
                        {undoExpired ? (
                          <span
                            className="text-[11px] font-semibold text-gray-400 flex-shrink-0 cursor-default"
                            title="The 15-minute undo window has passed"
                          >
                            Undo expired
                          </span>
                        ) : (
                          <button
                            onClick={handleUndoPush}
                            disabled={undoingPush}
                            className="text-[11px] font-semibold text-blue-500 hover:text-blue-700 disabled:opacity-50 flex-shrink-0 underline underline-offset-2"
                          >
                            {undoingPush ? "Undoing…" : "Undo"}
                          </button>
                        )}
                      </div>
                    )}
                    {resolvedJobsList.map(job => {
                      const a = actions[job.id];
                      const desc =
                        a === "push"
                          ? `Pushed to ${fmtDateStr(addDaysStr(job.scheduledDate, 1))} (+1 day)`
                          : a === "defer"
                          ? `Deferred to ${fmtDateStr(addDaysStr(job.scheduledDate, 3))} (+3 days)`
                          : a === "delete"
                          ? "Removed from schedule"
                          : `Reassigned to ${
                              teamsData.find(t => t.id === reassignTo[job.id])?.name ?? "—"
                            }`;
                      const col =
                        a === "delete"
                          ? "text-red-600"
                          : a === "push" || a === "defer"
                          ? "text-blue-600"
                          : "text-purple-600";
                      return (
                        <div
                          key={job.id}
                          className="flex items-center justify-between py-2.5 px-4 rounded-xl bg-gray-50"
                        >
                          <div>
                            <p className="text-[13px] font-semibold text-gray-800">
                              {job.assetName}
                            </p>
                            <p className={`text-[11px] font-medium mt-0.5 ${col}`}>{desc}</p>
                          </div>
                          <span className="text-[11px] text-gray-400">
                            {fmtMins(job.serviceTimeMins ?? 0)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </WizardSectionCard>
              )}

              {/* Final capacity */}
              <WizardSectionCard num={3} title={`Final Capacity — ${teamName}, ${dateLabel}`}>
                <CapBar
                  total={resolvedTotal}
                  reactive={serviceMin}
                  teamName={teamName}
                  dateLabel={dateLabel}
                />
              </WizardSectionCard>

              {/* Notification preview */}
              <WizardSectionCard num={4} title="Worker Notifications on Publish">
                <div className="space-y-2">
                  {[
                    {
                      initials: (selectedTeam?.name ?? "T").slice(0, 2).toUpperCase(),
                      name: `${teamName} workers`,
                      msg: `New job added: ${location} (${fmtMins(serviceMin)})`,
                    },
                    ...resolvedJobsList.map(j => ({
                      initials: (selectedTeam?.name ?? "T").slice(0, 2).toUpperCase(),
                      name: `${teamName} workers`,
                      msg: `${j.assetName} — ${
                        actions[j.id] === "delete"
                          ? "removed from schedule"
                          : actions[j.id] === "push"
                          ? `moved to ${fmtDateStr(addDaysStr(j.scheduledDate, 1))}`
                          : actions[j.id] === "defer"
                          ? `deferred to ${fmtDateStr(addDaysStr(j.scheduledDate, 3))}`
                          : `reassigned to ${
                              teamsData.find(t => t.id === reassignTo[j.id])?.name ?? "team"
                            }`
                      }`,
                    })),
                  ].map((n, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                        style={{ background: BRAND }}
                      >
                        {n.initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-gray-700">{n.name}</p>
                        <p className="text-[11px] text-gray-500 truncate">{n.msg}</p>
                      </div>
                      <Bell className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                    </div>
                  ))}
                </div>
              </WizardSectionCard>

              <div className="flex items-center justify-between pb-8">
                <button
                  onClick={() => setStep(totalWithReactive > PRODUCTIVE ? 3 : 2)}
                  className="text-sm text-gray-400 hover:text-gray-600"
                >
                  ← Back
                </button>
                <button
                  onClick={handlePublish}
                  disabled={isPublishing || !canPublish}
                  className="flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-bold text-white shadow-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                  style={{ background: BRAND }}
                >
                  {isPublishing ? (
                    <>
                      <RotateCcw className="w-4 h-4 animate-spin" />
                      Publishing…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      Publish Changes & Notify Workers
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Reactive Job Review & Schedule Drawer ────────────────────────────────────

export interface ReactiveJobReviewDrawerProps {
  job: Record<string, unknown>;
  teamsData: TeamStub[];
  assetsData: AssetStub[];
  onClose: () => void;
  onSaved: () => void;
}

export function ReactiveJobReviewDrawer({
  job,
  teamsData,
  assetsData,
  onClose,
  onSaved,
}: ReactiveJobReviewDrawerProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: settingsData } = useQuery<{ reactivePriorities?: ReactivePriority[] }>({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const r = await fetch("/api/settings", { credentials: "include" });
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const priorities: ReactivePriority[] =
    settingsData?.reactivePriorities?.length ? settingsData.reactivePriorities : DEFAULT_PRIORITIES;

  const [issueType, setIssueType]       = useState((job.issueType as string) ?? "");
  const [description, setDescription]   = useState((job.description as string) ?? "");
  const [priority, setPriority]         = useState((job.priority as string) ?? "medium");
  const [notes, setNotes]               = useState((job.notes as string) ?? "");
  const linkedAsset = assetsData.find(a => a.id === (job.assetId as string | null));
  const [teamId, setTeamId]             = useState(
    (job.assignedTeamId as string | null) || linkedAsset?.teamId || ""
  );
  const [date, setDate]                 = useState((job.scheduledDate as string) ?? "");
  const [estMins, setEstMins]           = useState(
    job.estimatedTimeMins != null ? String(job.estimatedTimeMins) : "90"
  );
  const [saving, setSaving]             = useState(false);
  const [actions, setActions]           = useState<Record<string, JobAction>>({});
  const [reassignTo, setReassignTo]     = useState<Record<string, string>>({});

  const weekStr   = date ? mondayOf(date) : "";
  const dateLabel = date ? format(new Date(date + "T00:00:00"), "EEE d MMM") : "";
  const serviceMin = Math.max(0, parseInt(estMins) || 0);

  const { data: weekData } = useGetScheduleWeek(
    { week: weekStr, teamId: teamId || undefined },
    {
      query: {
        queryKey: getGetScheduleWeekQueryKey({ week: weekStr, teamId: teamId || undefined }),
        enabled: !!weekStr && !!teamId,
      },
    },
  );

  const dayJobs: JobWithAsset[] = useMemo(
    () => weekData?.days?.find(d => d.date === date)?.jobs ?? [],
    [weekData, date],
  );

  // Initialise action slots when the day's job list arrives
  useEffect(() => {
    if (dayJobs.length > 0) {
      setActions(prev => {
        const next = { ...prev };
        dayJobs.forEach(j => { if (!(j.id in next)) next[j.id] = "none"; });
        return next;
      });
    }
  }, [dayJobs]);

  // Reset conflict decisions when the user picks a different team / date
  useEffect(() => {
    setActions({});
    setReassignTo({});
  }, [teamId, date]);

  const totalScheduled = dayJobs.reduce((s, j) => s + (j.serviceTimeMins ?? 0), 0);
  const totalWithJob   = totalScheduled + serviceMin;

  const freedMins = useMemo(() => dayJobs
    .filter(j => {
      const a = actions[j.id];
      return a === "push" || a === "defer" || a === "delete" || (a === "reassign" && reassignTo[j.id]);
    })
    .reduce((s, j) => s + (j.serviceTimeMins ?? 0), 0),
  [actions, reassignTo, dayJobs]);

  const resolvedTotal = totalWithJob - freedMins;
  const overTarget    = totalWithJob > PRODUCTIVE;
  const isGreen       = resolvedTotal <= PRODUCTIVE;
  const teamName      = teamsData.find(t => t.id === teamId)?.name ?? "Team";

  const setAction = (id: string, a: JobAction) => {
    setActions(prev => ({ ...prev, [id]: a }));
    if (a !== "reassign") {
      setReassignTo(prev => { const n = { ...prev }; delete n[id]; return n; });
    }
  };

  const updateJob = useUpdateJob();
  const updateRJ  = useUpdateReactiveJob();

  const handleSave = async (assign: boolean) => {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {
        issueType:         issueType || undefined,
        description:       description || undefined,
        priority,
        notes:             notes || undefined,
        assignedTeamId:    teamId || undefined,
        scheduledDate:     date || undefined,
        estimatedTimeMins: serviceMin > 0 ? serviceMin : undefined,
      };
      if (assign && teamId && date) patch.status = "assigned";
      await (updateRJ as { mutateAsync: (d: unknown) => Promise<unknown> }).mutateAsync({
        id: job.id as string,
        data: patch,
      });

      // Apply any conflict resolution actions to existing scheduled jobs
      await Promise.all(
        dayJobs
          .filter(j => actions[j.id] && actions[j.id] !== "none")
          .map(j => {
            const a = actions[j.id];
            if (a === "push")
              return updateJob.mutateAsync({ id: j.id, data: { scheduledDate: addDaysStr(j.scheduledDate, 1) } as never });
            if (a === "defer")
              return updateJob.mutateAsync({ id: j.id, data: { scheduledDate: addDaysStr(j.scheduledDate, 3) } as never });
            if (a === "delete")
              return updateJob.mutateAsync({ id: j.id, data: { status: "skipped" } as never });
            if (a === "reassign" && reassignTo[j.id])
              return updateJob.mutateAsync({ id: j.id, data: { teamId: reassignTo[j.id] } as never });
            return Promise.resolve();
          }),
      );

      await Promise.all([
        qc.invalidateQueries({ queryKey: getListReactiveJobsQueryKey() }),
        qc.invalidateQueries({ queryKey: ["/api/schedule/week"] }),
        qc.invalidateQueries({ queryKey: ["/api/dashboard/summary"] }),
      ]);
      toast({
        title: assign ? "Job assigned" : "Draft saved",
        description: assign ? `Assigned to ${teamName} for ${dateLabel}` : "Job details updated",
      });
      onSaved();
    } catch (e) {
      toast({ title: "Save failed", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const site     = linkedAsset?.name ?? (job.location as string | null) ?? "Unscheduled Work";
  const siteDesc = linkedAsset?.description ?? (job.assetDescription as string | null) ?? null;
  const pConf    = priorities.find(p => p.id === priority) ?? PRIORITY_CONFIG[priority];
  const canAssign = !!teamId && !!date;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="w-[520px] bg-gray-50 flex flex-col h-full shadow-2xl overflow-hidden">

        {/* Hero header */}
        <div className="px-6 pt-5 pb-4 flex-shrink-0" style={{ background: NAVY }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: BRAND }}>
                Review &amp; Schedule
              </p>
              <h2 className="text-lg font-black text-white leading-tight flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400 flex-shrink-0" />
                {site}
              </h2>
              {siteDesc && <p className="text-[12px] text-gray-400 mt-0.5">{siteDesc}</p>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
              {pConf && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                  style={{ background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.8)" }}>
                  {(pConf as { label: string }).label?.split(" / ")[0] ?? priority}
                </span>
              )}
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold"
                style={{ background: "rgba(0,174,205,0.2)", color: "#5dd8ef" }}>
                Reactive
              </span>
              <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">

          {/* ── 1 — Job Details ── */}
          <WizardSectionCard num={1} title="Job Details">
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold block mb-1">Issue Type</label>
                <input
                  value={issueType}
                  onChange={e => setIssueType(e.target.value)}
                  placeholder="e.g. Storm damage, Vandalism…"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] bg-white"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold block mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] bg-white resize-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold block mb-1">Priority</label>
                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] bg-white"
                >
                  {priorities.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  {!priorities.some(p => p.id === priority) && (
                    <option value={priority}>{PRIORITY_CONFIG[priority]?.label ?? priority}</option>
                  )}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold block mb-1">Notes</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Any additional notes…"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] bg-white resize-none"
                />
              </div>
            </div>
          </WizardSectionCard>

          {/* ── 2 — Schedule to Team ── */}
          <WizardSectionCard num={2} title="Schedule to Team">
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold block mb-1">Assign Team</label>
                <select
                  value={teamId}
                  onChange={e => setTeamId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] bg-white font-semibold text-gray-700"
                >
                  <option value="">— Unassigned —</option>
                  {teamsData.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                {linkedAsset?.teamId && teamId && teamId !== linkedAsset.teamId && (
                  <p className="text-[10px] text-amber-600 mt-1.5">
                    ⚠ Normally serviced by {teamsData.find(t => t.id === linkedAsset.teamId)?.name ?? "another team"}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold block mb-1">Planned Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] bg-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold block mb-1">Est. time (mins)</label>
                  <input
                    type="number"
                    min="0"
                    value={estMins}
                    onChange={e => setEstMins(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] bg-white"
                  />
                </div>
              </div>
            </div>
          </WizardSectionCard>

          {/* ── 3 — Schedule Impact (shown once team + date are set) ── */}
          {teamId && date && (
            <WizardSectionCard num={3} title={`Schedule Impact — ${teamName}, ${dateLabel}`}>
              <div className="space-y-3">

                {/* Capacity bar */}
                <CapBar
                  total={resolvedTotal}
                  reactive={serviceMin}
                  teamName={teamName}
                  dateLabel={dateLabel}
                />

                {/* Status line */}
                {isGreen ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 border border-green-100">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                    <p className="text-[11px] font-semibold text-green-700">Within daily target — ready to assign.</p>
                  </div>
                ) : overTarget ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-100">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                    <p className="text-[11px] font-semibold text-red-700">
                      {fmtMins(resolvedTotal - PRODUCTIVE)} over target — resolve conflicts below or accept overtime.
                    </p>
                  </div>
                ) : null}

                {/* Per-job conflict resolution */}
                {dayJobs.length > 0 && (
                  <div className="rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        {dayJobs.length} job{dayJobs.length !== 1 ? "s" : ""} already scheduled · {fmtMins(totalScheduled)}
                      </p>
                    </div>
                    <div className="divide-y divide-gray-50 bg-white">
                      {dayJobs.map(j => {
                        const action = actions[j.id] ?? "none";
                        const resolved = action !== "none";
                        const jobMins = j.serviceTimeMins ?? 0;
                        return (
                          <div key={j.id} className={`px-4 py-3 transition-colors ${resolved ? "bg-green-50/40" : ""}`}>
                            <div className="flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-semibold text-gray-900 truncate">{j.assetName}</p>
                                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-400">
                                  <Clock className="w-3 h-3" />
                                  <span>{fmtMins(jobMins)}</span>
                                  {j.suburb && <><span>·</span><span>{j.suburb}</span></>}
                                </div>
                                {action === "push" && (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 mt-1 inline-block">
                                    ✓ Pushed → {fmtDateStr(addDaysStr(j.scheduledDate, 1))}
                                  </span>
                                )}
                                {action === "defer" && (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 mt-1 inline-block">
                                    ✓ Deferred → {fmtDateStr(addDaysStr(j.scheduledDate, 3))}
                                  </span>
                                )}
                                {action === "delete" && (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600 mt-1 inline-block">
                                    ✕ Removed from schedule
                                  </span>
                                )}
                                {action === "reassign" && reassignTo[j.id] && (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 mt-1 inline-block">
                                    → {teamsData.find(t => t.id === reassignTo[j.id])?.name ?? "team"}
                                  </span>
                                )}
                              </div>
                              {resolved && (
                                <span className="text-[11px] font-bold text-green-600 flex-shrink-0 mt-0.5">
                                  -{fmtMins(jobMins)}
                                </span>
                              )}
                            </div>
                            {/* Action buttons */}
                            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                              {(["push", "defer", "delete", "reassign"] as const).map(a => {
                                const active = action === a;
                                const iconMap: Record<string, React.ReactNode> = {
                                  push:     <SkipForward className="w-3 h-3" />,
                                  defer:    <Calendar className="w-3 h-3" />,
                                  delete:   <Trash2 className="w-3 h-3" />,
                                  reassign: <Users className="w-3 h-3" />,
                                };
                                const labelMap: Record<string, string> = {
                                  push: "Push +1d", defer: "Defer +3d", delete: "Delete", reassign: "Reassign",
                                };
                                const colMap: Record<string, string> = {
                                  push: "#2563eb", defer: "#7c3aed", delete: "#dc2626", reassign: "#9333ea",
                                };
                                return (
                                  <button
                                    key={a}
                                    onClick={() => setAction(j.id, active ? "none" : a)}
                                    className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border-2 transition-all ${active ? "text-white border-transparent" : "border-gray-200 text-gray-500 hover:border-gray-300 bg-white"}`}
                                    style={active ? { background: colMap[a], borderColor: colMap[a] } : {}}
                                  >
                                    {iconMap[a]}
                                    {labelMap[a]}
                                  </button>
                                );
                              })}
                            </div>
                            {/* Reassign team picker */}
                            {action === "reassign" && (
                              <select
                                value={reassignTo[j.id] ?? ""}
                                onChange={e => setReassignTo(prev => ({ ...prev, [j.id]: e.target.value }))}
                                className="mt-2 w-full px-2 py-1.5 text-xs border border-purple-200 rounded-lg outline-none focus:border-purple-400 bg-white"
                              >
                                <option value="">— Pick a team —</option>
                                {teamsData.filter(t => t.id !== teamId).map(t => (
                                  <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {dayJobs.length === 0 && (
                  <p className="text-[11px] text-gray-400 italic">No other jobs scheduled for this day.</p>
                )}
              </div>
            </WizardSectionCard>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-white flex items-center justify-between flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-40 transition-colors"
            >
              Save Draft
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={saving || !canAssign}
              title={!canAssign ? "Set a team and date first" : undefined}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-colors"
              style={{ background: BRAND }}
            >
              <CheckCircle2 className="w-4 h-4" />
              Save &amp; Assign
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
