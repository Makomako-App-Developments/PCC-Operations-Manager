import { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import {
  useListReactiveJobs, getListReactiveJobsQueryKey,
  useUpdateReactiveJob,
  useCreateReactiveJob,
  useListTeams,
  useListAssets,
  useGetScheduleWeek, getGetScheduleWeekQueryKey,
  useUpdateJob,
} from "@workspace/api-client-react";
import type { JobWithAsset } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, CheckCircle2, Clock, MapPin, Plus, ArrowRight,
  Trash2, Users, Bell, Calendar, X, AlertCircle, Zap,
  SkipForward, Shield, Info, Search, PlayCircle, XCircle, RotateCcw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BRAND = "#00AECD";
const NAVY = "#0f2a36";
const PRODUCTIVE = 360;
const MAX_CAP = 480;
const COMBINE_THRESHOLD = 5;

const REASON_TYPES = [
  "Storm / wind damage",
  "Vandalism / graffiti",
  "Resident complaint",
  "Councillor request",
  "Contractor damage",
  "Safety hazard",
  "Event prep",
  "Other",
];

function mondayOf(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  return m.toISOString().split("T")[0];
}

function addDaysStr(dateStr: string, days: number) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function fmtMins(m: number) {
  if (m <= 0) return "0m";
  const h = Math.floor(m / 60),
    r = m % 60;
  return h > 0 ? `${h}h${r > 0 ? ` ${r}m` : ""}` : `${r}m`;
}

function capacityBand(mins: number): "green" | "amber" | "red" {
  if (mins > MAX_CAP) return "red";
  if (mins > PRODUCTIVE) return "amber";
  return "green";
}

function bandColor(band: "green" | "amber" | "red") {
  return band === "green" ? "#16a34a" : band === "amber" ? "#d97706" : "#dc2626";
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

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: "Low", color: "#6b7280", bg: "#f3f4f6" },
  medium: { label: "Medium", color: "#d97706", bg: "#fef3c7" },
  high: { label: "High", color: "#ea580c", bg: "#ffedd5" },
  urgent: { label: "Urgent", color: "#dc2626", bg: "#fef2f2" },
};

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    color: string;
    bg: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  raised: { label: "Raised", color: "#6b7280", bg: "#f3f4f6", icon: AlertTriangle },
  assigned: { label: "Assigned", color: "#2563eb", bg: "#eff6ff", icon: Clock },
  in_progress: { label: "In Progress", color: "#16a34a", bg: "#dcfce7", icon: PlayCircle },
  completed: { label: "Completed", color: "#059669", bg: "#ecfdf5", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", color: "#dc2626", bg: "#fef2f2", icon: XCircle },
};

function CapBar({
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
  const pctProd = Math.min(100, (Math.min(safe, PRODUCTIVE) / MAX_CAP) * 100);
  const pctAmb = Math.max(
    0,
    Math.min(100, ((Math.min(safe, MAX_CAP) - PRODUCTIVE) / MAX_CAP) * 100),
  );
  const pctOver = Math.max(0, Math.min(20, ((safe - MAX_CAP) / MAX_CAP) * 100));
  const prodMark = (PRODUCTIVE / MAX_CAP) * 100;

  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1.5">
        <span className="font-semibold" style={{ color: NAVY }}>
          {teamName} — {dateLabel}
        </span>
        <span className="font-bold" style={{ color }}>
          {fmtMins(total)} / 8h day
        </span>
      </div>
      <div className="relative h-5 rounded-full overflow-hidden bg-gray-100 flex">
        <div
          className="h-full rounded-l-full transition-all"
          style={{ width: `${pctProd}%`, background: "#16a34a" }}
        />
        {pctAmb > 0 && (
          <div
            className="h-full transition-all"
            style={{ width: `${pctAmb}%`, background: "#d97706" }}
          />
        )}
        {pctOver > 0 && (
          <div
            className="h-full rounded-r-full transition-all"
            style={{ width: `${pctOver}%`, background: "#dc2626" }}
          />
        )}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white/80"
          style={{ left: `${prodMark}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] mt-1 text-gray-400">
        <span>0</span>
        <span>↑ 6h target</span>
        <span>8h max</span>
      </div>
      <div className="flex gap-3 mt-2 flex-wrap text-[11px]">
        <span className="flex items-center gap-1 text-green-700">
          <span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" />
          Productive ({fmtMins(PRODUCTIVE)})
        </span>
        <span className="flex items-center gap-1 text-amber-700">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />
          Contingency buffer
        </span>
        <span className="flex items-center gap-1 text-red-600">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" />
          Over maximum
        </span>
        {reactive > 0 && (
          <span className="flex items-center gap-1 text-purple-600 ml-auto">
            <Zap className="w-3 h-3" />+{fmtMins(reactive)} reactive
          </span>
        )}
      </div>
    </div>
  );
}

interface AssetStub {
  id: string;
  name: string;
  reference: string;
  serviceTimeMins: number;
  frequency: string;
  teamId?: string | null;
  suburb?: string | null;
}

interface TeamStub {
  id: string;
  name: string;
}

interface WizardProps {
  teamsData: TeamStub[];
  assetsData: AssetStub[];
  onClose: () => void;
  onPublished: () => void;
}

function ReactiveJobWizard({ teamsData, assetsData, onClose, onPublished }: WizardProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const today = new Date().toISOString().split("T")[0];

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const [locationType, setLocationType] = useState<"asset" | "other">("other");
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [freeTextLocation, setFreeTextLocation] = useState("");
  const [extraDescription, setExtraDescription] = useState("");
  const [combineScheduled, setCombineScheduled] = useState(false);
  const [reason, setReason] = useState(REASON_TYPES[0]);
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedTeamId, setSelectedTeamId] = useState(teamsData[0]?.id ?? "");
  const [reactiveMin, setReactiveMin] = useState(90);
  const [priority, setPriority] = useState<"urgent" | "normal">("urgent");
  const [notes, setNotes] = useState("");

  const [actions, setActions] = useState<Record<string, JobAction>>({});
  const [reassignTo, setReassignTo] = useState<Record<string, string>>({});
  const [contingencyApproved, setContingencyApproved] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

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
  const combinedMins = combineScheduled && canCombine ? assetServiceMins : 0;
  const serviceMin = reactiveMin + combinedMins;

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

  const overMax = resolvedTotal > MAX_CAP;
  const inContingency = resolvedTotal > PRODUCTIVE && resolvedTotal <= MAX_CAP;
  const isGreen = resolvedTotal <= PRODUCTIVE;
  const canPublish = !overMax && (isGreen || contingencyApproved);

  const resolvedJobsList = dayJobs.filter(j => actions[j.id] && actions[j.id] !== "none");

  const updateJob = useUpdateJob();
  const createRJ = useCreateReactiveJob();

  const handlePublish = async () => {
    if (!canPublish) return;
    setIsPublishing(true);
    try {
      const rjBody: Record<string, unknown> = {
        issueType: reason,
        description: notes || location || reason,
        priority,
        assignedTeamId: selectedTeamId || undefined,
        scheduledDate: selectedDate,
        estimatedTimeMins: serviceMin,
        location: location || undefined,
        status: "raised",
      };
      if (locationType === "asset" && selectedAssetId) {
        rjBody.assetId = selectedAssetId;
      }

      await (
        createRJ as { mutateAsync: (d: unknown) => Promise<unknown> }
      ).mutateAsync(rjBody);

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
        qc.invalidateQueries({ queryKey: ["/api/dashboard/summary"] }),
      ]);

      toast({
        title: "Reactive job published",
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
    <div className="fixed inset-0 left-56 z-50 bg-[#f5f7f9] flex flex-col overflow-hidden">
      {/* Header */}
      <header
        className="bg-white border-b px-8 py-4 flex items-center justify-between flex-shrink-0"
        style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
      >
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2" style={{ color: NAVY }}>
            <Zap className="w-5 h-5 text-amber-500" />
            New Reactive Job
          </h1>
          <p className="text-xs text-gray-400">
            Ad-hoc work insertion with schedule impact management
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-300 hover:text-gray-500 p-1.5 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
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
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <MapPin className="w-4 h-4" style={{ color: BRAND }} />
                  Location
                </h2>
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
                    <div>
                      <label className="text-xs text-gray-500 font-medium block mb-1.5">
                        Select garden asset *
                      </label>
                      <select
                        value={selectedAssetId}
                        onChange={e => {
                          setSelectedAssetId(e.target.value);
                          setCombineScheduled(false);
                          const asset = assetsData.find(a => a.id === e.target.value);
                          if (asset?.teamId) setSelectedTeamId(asset.teamId);
                        }}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] bg-white"
                      >
                        <option value="">— Select an asset —</option>
                        {assetsData.map(a => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({a.reference})
                          </option>
                        ))}
                      </select>
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
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Zap className="w-4 h-4" style={{ color: BRAND }} />
                  Job Details
                </h2>
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1.5">
                      Reason / Type *
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
                    <label className="text-xs text-gray-500 font-medium block mb-1.5">Date *</label>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={e => setSelectedDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1.5">
                      Assign to Team *
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
                      Reactive time (min) *
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
                    <div className="flex gap-3">
                      {(["urgent", "normal"] as const).map(p => (
                        <button
                          key={p}
                          onClick={() => setPriority(p)}
                          className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                            priority === p
                              ? p === "urgent"
                                ? "border-red-400 bg-red-50 text-red-700"
                                : "border-[#00AECD] text-[#00AECD] bg-[#f0fafe]"
                              : "border-gray-200 text-gray-400 bg-white"
                          }`}
                        >
                          {p === "urgent" ? "🔴 Urgent" : "🟡 Normal"}
                        </button>
                      ))}
                    </div>
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
              </div>

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
                    background: PRIORITY_CONFIG[priority]?.bg,
                    color: PRIORITY_CONFIG[priority]?.color,
                  }}
                >
                  {priority === "urgent" ? "Urgent" : "Normal"}
                </span>
              </div>

              {/* Capacity impact card */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h3 className="text-sm font-bold text-gray-900 mb-4">
                  Schedule impact — {teamName}, {dateLabel}
                </h3>
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

                    <div className="mt-5 grid grid-cols-3 gap-4">
                      {[
                        { label: "Scheduled today", value: fmtMins(totalScheduled), color: "#374151" },
                        { label: "+ Reactive job", value: `+${fmtMins(serviceMin)}`, color: "#d97706" },
                        {
                          label: "New total",
                          value: fmtMins(totalWithReactive),
                          color:
                            totalWithReactive > MAX_CAP
                              ? "#dc2626"
                              : totalWithReactive > PRODUCTIVE
                              ? "#d97706"
                              : "#16a34a",
                        },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="text-center p-3 rounded-xl bg-gray-50">
                          <p className="text-[11px] text-gray-400 mb-1">{label}</p>
                          <p className="text-xl font-black" style={{ color }}>
                            {value}
                          </p>
                        </div>
                      ))}
                    </div>

                    {totalWithReactive > MAX_CAP && (
                      <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 flex gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-bold text-red-700">
                            {teamName} will be {fmtMins(totalWithReactive - MAX_CAP)} over the
                            8-hour maximum
                          </p>
                          <p className="text-xs text-red-600 mt-0.5">
                            Push, defer, delete or reassign at least{" "}
                            {fmtMins(totalWithReactive - MAX_CAP)} of scheduled work on the next
                            step.
                          </p>
                        </div>
                      </div>
                    )}
                    {totalWithReactive > PRODUCTIVE && totalWithReactive <= MAX_CAP && (
                      <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 flex gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-bold text-amber-700">
                            {teamName} will use {fmtMins(totalWithReactive - PRODUCTIVE)} of the
                            2-hour contingency buffer
                          </p>
                          <p className="text-xs text-amber-600 mt-0.5">
                            Within the 8-hour maximum. Proceed with contingency authorisation or
                            reschedule some work.
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
                                    ? "today"
                                    : `in ${assetDayJobWorkingDays} working day${assetDayJobWorkingDays !== 1 ? "s" : ""}`}{" "}
                                  ({assetDayJob.date})
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
                                      +{fmtMins(assetServiceMins)} → {fmtMins(serviceMin)} total
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
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="text-sm text-gray-400 hover:text-gray-600"
                >
                  ← Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={weekLoading}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  style={{ background: BRAND }}
                >
                  {totalWithReactive > MAX_CAP ? "Resolve Conflicts" : "Review & Confirm"}{" "}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {/* ── STEP 3 ──────────────────────────────────────────────── */}
          {step === 3 && (
            <>
              {/* Live capacity bar */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <CapBar
                  total={resolvedTotal}
                  reactive={serviceMin}
                  teamName={teamName}
                  dateLabel={dateLabel}
                />
                {overMax && (
                  <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <p className="text-xs font-semibold text-red-700">
                      Still {fmtMins(resolvedTotal - MAX_CAP)} over maximum — move or remove more
                      work.
                    </p>
                  </div>
                )}
                {inContingency && !contingencyApproved && (
                  <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      <p className="text-xs font-semibold text-amber-700">
                        Using {fmtMins(resolvedTotal - PRODUCTIVE)} of contingency — authorise to
                        proceed.
                      </p>
                    </div>
                    <button
                      onClick={() => setContingencyApproved(true)}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white bg-amber-500 hover:bg-amber-600 transition-colors whitespace-nowrap"
                    >
                      Authorise Additional Hours
                    </button>
                  </div>
                )}
                {inContingency && contingencyApproved && (
                  <div className="mt-3 p-3 rounded-xl bg-green-50 border border-green-200 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <p className="text-xs font-semibold text-green-700">
                      Contingency authorised — team approved to work up to 8 hours.
                    </p>
                  </div>
                )}
                {isGreen && (
                  <div className="mt-3 p-3 rounded-xl bg-green-50 border border-green-200 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <p className="text-xs font-semibold text-green-700">
                      Within productive target — no contingency needed.
                    </p>
                  </div>
                )}
              </div>

              {/* Jobs list */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
                  <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                    {teamName} — {dateLabel} jobs
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {dayJobs.length} job{dayJobs.length !== 1 ? "s" : ""} ·{" "}
                    {fmtMins(totalScheduled)}
                  </p>
                </div>
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
                                {job.assetRef && (
                                  <span className="font-mono text-gray-300">{job.assetRef}</span>
                                )}
                                {job.suburb && <span>{job.suburb}</span>}
                              </div>
                              {action === "push" && (
                                <span
                                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1.5 inline-block ${windowBreach(1) ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-700"}`}
                                >
                                  {windowBreach(1)
                                    ? "⚠ May breach service window"
                                    : `✓ Pushed → ${addDaysStr(job.scheduledDate, 1)}`}
                                </span>
                              )}
                              {action === "defer" && (
                                <span
                                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1.5 inline-block ${windowBreach(3) ? "bg-red-50 text-red-600" : "bg-purple-50 text-purple-700"}`}
                                >
                                  {windowBreach(3)
                                    ? "⚠ May breach service window"
                                    : `✓ Deferred → ${addDaysStr(job.scheduledDate, 3)}`}
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
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={() => setStep(2)}
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
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  Reactive job to be added
                </h3>
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
                      background: PRIORITY_CONFIG[priority]?.bg,
                      color: PRIORITY_CONFIG[priority]?.color,
                    }}
                  >
                    {priority === "urgent" ? "Urgent" : "Normal"}
                  </span>
                </div>
              </div>

              {/* Schedule changes */}
              {resolvedJobsList.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <h3 className="text-sm font-bold text-gray-900 mb-4">
                    Schedule changes ({resolvedJobsList.length} job
                    {resolvedJobsList.length !== 1 ? "s" : ""})
                  </h3>
                  <div className="space-y-2">
                    {resolvedJobsList.map(job => {
                      const a = actions[job.id];
                      const desc =
                        a === "push"
                          ? `Pushed to ${addDaysStr(job.scheduledDate, 1)} (+1 day)`
                          : a === "defer"
                          ? `Deferred to ${addDaysStr(job.scheduledDate, 3)} (+3 days)`
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
                </div>
              )}

              {/* Final capacity */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h3 className="text-sm font-bold text-gray-900 mb-4">
                  Final capacity — {teamName}, {dateLabel}
                </h3>
                <CapBar
                  total={resolvedTotal}
                  reactive={serviceMin}
                  teamName={teamName}
                  dateLabel={dateLabel}
                />
                {contingencyApproved && (
                  <div className="mt-3 flex items-center gap-2 text-[11px] text-amber-700 font-semibold">
                    <Shield className="w-3.5 h-3.5" />
                    Contingency hours authorised
                  </div>
                )}
              </div>

              {/* Notification preview */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <Bell className="w-4 h-4" style={{ color: BRAND }} />
                  Worker notifications on publish
                </h3>
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
                          ? `moved to ${addDaysStr(j.scheduledDate, 1)}`
                          : actions[j.id] === "defer"
                          ? `deferred to ${addDaysStr(j.scheduledDate, 3)}`
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
              </div>

              <div className="flex items-center justify-between pb-8">
                <button
                  onClick={() => setStep(3)}
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
              const pConf = PRIORITY_CONFIG[job.priority as string] ?? PRIORITY_CONFIG.medium;
              const sConf = STATUS_CONFIG[job.status as string] ?? STATUS_CONFIG.raised;
              const StatusIcon = sConf.icon;
              const isUrgent = job.priority === "urgent";

              return (
                <div
                  key={job.id as string}
                  onClick={() => setSelectedJob(job)}
                  className={`bg-white rounded-2xl border shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-all ${isUrgent ? "border-orange-200 ring-1 ring-orange-100" : "border-gray-100"}`}
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
