import { useState, useMemo } from "react";
import {
  AlertTriangle, CheckCircle2, Clock, MapPin, Plus, ArrowRight,
  Trash2, Users, Bell, Calendar, X, ChevronRight, AlertCircle,
  Zap, RefreshCw, SkipForward, Shield, Info
} from "lucide-react";

const BRAND = "#00AECD";
const NAVY  = "#0f2a36";
const PRODUCTIVE = 360;
const MAX_CAP     = 480;

// ─── Data ────────────────────────────────────────────────────────────────────

interface Job {
  id: string; site: string; type: string; typeColor: string;
  mins: number; freq: string; dayOf: number; windowSize: number;
  lastVisit: string; nextDue: string;
}

const JOBS: Job[] = [
  { id: "J1", site: "Waitangirua Mall Entry", type: "Roses & Perennials", typeColor: "#ec4899", mins: 120, freq: "Weekly",      dayOf: 7, windowSize: 7,  lastVisit: "20 Mar", nextDue: "27 Mar" },
  { id: "J2", site: "Cobham Court",            type: "Roses & Perennials", typeColor: "#ec4899", mins: 120, freq: "Weekly",      dayOf: 7, windowSize: 7,  lastVisit: "20 Mar", nextDue: "27 Mar" },
  { id: "J3", site: "Mungavin Ave Berm",        type: "Annuals",            typeColor: "#f59e0b", mins: 45,  freq: "Fortnightly", dayOf: 9, windowSize: 14, lastVisit: "18 Mar", nextDue: "1 Apr"  },
  { id: "J4", site: "Aotea Lagoon Reserve",     type: "Ornamental",         typeColor: "#8b5cf6", mins: 90,  freq: "Fortnightly", dayOf: 9, windowSize: 14, lastVisit: "18 Mar", nextDue: "1 Apr"  },
  { id: "J5", site: "Titahi Bay Esplanade",     type: "Annuals",            typeColor: "#f59e0b", mins: 75,  freq: "Fortnightly", dayOf: 7, windowSize: 14, lastVisit: "20 Mar", nextDue: "3 Apr"  },
];

const REASSIGN_OPTIONS = [
  { team: "Mobile 2", scheduled: 285, max: 480 },
  { team: "CBD",      scheduled: 420, max: 480 },
];

const REASON_TYPES = [
  "Storm / wind damage", "Vandalism / graffiti", "Resident complaint",
  "Councillor request", "Contractor damage", "Safety hazard", "Event prep",
];

// Known garden assets with upcoming scheduled info (relative to reactive date 27 Mar)
interface AssetScheduleInfo {
  id: string; nextDate: string; workingDays: number;
  scheduledMins: number; team: string; freq: string;
  lastVisit: string; daysSinceLastVisit: number; minInterval: number;
}

const ASSET_SCHEDULE: Record<string, AssetScheduleInfo> = {
  "Waitangirua Mall Entry": { id: "GRD-0022", nextDate: "27 Mar", workingDays: 0,   scheduledMins: 120, team: "Mobile 1", freq: "Weekly",      lastVisit: "20 Mar",  daysSinceLastVisit: 7,   minInterval: 5  },
  "Cobham Court":            { id: "GRD-0212", nextDate: "27 Mar", workingDays: 0,   scheduledMins: 120, team: "Mobile 1", freq: "Weekly",      lastVisit: "20 Mar",  daysSinceLastVisit: 7,   minInterval: 5  },
  "Mungavin Ave Berm":       { id: "GRD-0801", nextDate: "1 Apr",  workingDays: 3,   scheduledMins: 45,  team: "Mobile 1", freq: "Fortnightly", lastVisit: "18 Mar",  daysSinceLastVisit: 9,   minInterval: 10 },
  "Aotea Lagoon Reserve":    { id: "GRD-0847", nextDate: "1 Apr",  workingDays: 3,   scheduledMins: 90,  team: "Mobile 2", freq: "Fortnightly", lastVisit: "18 Mar",  daysSinceLastVisit: 9,   minInterval: 10 },
  "Titahi Bay Esplanade":    { id: "GRD-0391", nextDate: "3 Apr",  workingDays: 5,   scheduledMins: 75,  team: "Mobile 2", freq: "Fortnightly", lastVisit: "20 Mar",  daysSinceLastVisit: 7,   minInterval: 10 },
  "Elsdon Reserve":          { id: "GRD-0714", nextDate: "5 Apr",  workingDays: 7,   scheduledMins: 60,  team: "Mobile 2", freq: "Monthly",     lastVisit: "5 Mar",   daysSinceLastVisit: 22,  minInterval: 20 },
  "Kenepuru Landing":        { id: "GRD-0558", nextDate: "1 Apr",  workingDays: 3,   scheduledMins: 45,  team: "CBD",      freq: "Monthly",     lastVisit: "1 Mar",   daysSinceLastVisit: 26,  minInterval: 20 },
  "Paremata Station":        { id: "GRD-0629", nextDate: "Sep 2026", workingDays: 130, scheduledMins: 30, team: "CBD",     freq: "Bimonthly",   lastVisit: "Sep 2025", daysSinceLastVisit: 182, minInterval: 90 },
};

const COMBINE_THRESHOLD = 5; // working days

// ─── Helpers ─────────────────────────────────────────────────────────────────

function capacityBand(mins: number): "green" | "amber" | "red" {
  if (mins > MAX_CAP)     return "red";
  if (mins > PRODUCTIVE)  return "amber";
  return "green";
}

function bandColor(band: "green" | "amber" | "red") {
  return band === "green" ? "#16a34a" : band === "amber" ? "#d97706" : "#dc2626";
}

function fmtMins(m: number) {
  const h = Math.floor(m / 60), r = m % 60;
  return h > 0 ? `${h}h ${r > 0 ? r + "m" : ""}`.trim() : `${r}m`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CapBar({ total, reactive }: { total: number; reactive: number }) {
  const band   = capacityBand(total);
  const color  = bandColor(band);
  const pctProd = Math.min(100, (Math.min(total, PRODUCTIVE) / MAX_CAP) * 100);
  const pctAmb  = Math.max(0, Math.min(100, ((Math.min(total, MAX_CAP) - PRODUCTIVE) / MAX_CAP) * 100));
  const pctOver = Math.max(0, ((total - MAX_CAP) / MAX_CAP) * 100);
  const prodMark = (PRODUCTIVE / MAX_CAP) * 100;

  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1.5">
        <span className="font-semibold" style={{ color: NAVY }}>Mobile 1 capacity — Wed 27 Mar</span>
        <span className="font-bold" style={{ color }}>{fmtMins(total)} / 8h day</span>
      </div>
      <div className="relative h-5 rounded-full overflow-hidden bg-gray-100 flex">
        {/* Productive (green) fill */}
        <div className="h-full rounded-l-full transition-all" style={{ width: `${pctProd}%`, background: "#16a34a" }} />
        {/* Contingency (amber) fill */}
        {pctAmb > 0 && <div className="h-full transition-all" style={{ width: `${pctAmb}%`, background: "#d97706" }} />}
        {/* Over-max (red) fill */}
        {pctOver > 0 && <div className="h-full rounded-r-full transition-all" style={{ width: `${pctOver}%`, background: "#dc2626" }} />}
        {/* Productive target marker */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-white/80" style={{ left: `${prodMark}%` }} />
      </div>
      <div className="flex justify-between text-[10px] mt-1 text-gray-400">
        <span>0</span>
        <span style={{ marginLeft: `${prodMark - 5}%` }}>↑ 6h target</span>
        <span>8h max</span>
      </div>
      <div className="flex gap-3 mt-2">
        <span className="flex items-center gap-1 text-[11px] text-green-700"><span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" />Productive ({fmtMins(PRODUCTIVE)})</span>
        <span className="flex items-center gap-1 text-[11px] text-amber-700"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />Contingency buffer</span>
        <span className="flex items-center gap-1 text-[11px] text-red-600"><span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" />Over maximum</span>
        {reactive > 0 && <span className="flex items-center gap-1 text-[11px] text-purple-600 ml-auto"><Zap className="w-3 h-3" />+{fmtMins(reactive)} reactive job</span>}
      </div>
    </div>
  );
}

function WindowBadge({ job, pushDays = 1 }: { job: Job; pushDays?: number }) {
  const newDay = job.dayOf + pushDays;
  const breach = newDay > job.windowSize;
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${breach ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"}`}>
      {breach ? `⚠ Day ${newDay} of ${job.windowSize} — BREACH` : `✓ Day ${newDay} of ${job.windowSize} — within window`}
    </span>
  );
}

type JobAction = "none" | "push" | "defer" | "delete" | "reassign";

// ─── Main Component ───────────────────────────────────────────────────────────

interface ReactiveJobFlowProps {
  onClose?: () => void;
}

export function ReactiveJobFlow({ onClose }: ReactiveJobFlowProps = {}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1 form — location
  const [locationType,      setLocationType]      = useState<"asset" | "other">("other");
  const [selectedAsset,     setSelectedAsset]     = useState<string>("");
  const [freeTextLocation,  setFreeTextLocation]  = useState("Parumoana St Roundabout");
  const [combineScheduled,  setCombineScheduled]  = useState(false);

  // Step 1 form — job details
  const [reason,    setReason]    = useState("Storm / wind damage");
  const [reactiveMin, setReactiveMin] = useState(90);
  const [priority,  setPriority]  = useState<"urgent" | "normal">("urgent");
  const [assignTeam, setAssignTeam] = useState("Mobile 1");

  // Derived: asset info and combination logic
  const assetInfo = selectedAsset ? ASSET_SCHEDULE[selectedAsset] : null;
  const tooEarlyToMaintain = assetInfo ? assetInfo.daysSinceLastVisit < assetInfo.minInterval : false;
  const withinCombineWindow = assetInfo ? assetInfo.workingDays <= COMBINE_THRESHOLD : false;
  const canCombine = withinCombineWindow && !tooEarlyToMaintain;
  const scheduledMins = combineScheduled && assetInfo ? assetInfo.scheduledMins : 0;
  const serviceMin = reactiveMin + scheduledMins;
  const location = locationType === "asset" && selectedAsset ? selectedAsset : freeTextLocation;

  // Step 3 resolutions
  const [actions, setActions] = useState<Record<string, JobAction>>({
    J1: "none", J2: "none", J3: "none", J4: "none", J5: "none",
  });
  const [reassignTo, setReassignTo] = useState<Record<string, string>>({});
  const [contingencyApproved, setContingencyApproved] = useState(false);
  const [reassignOpen, setReassignOpen] = useState<string | null>(null);

  const setAction = (id: string, a: JobAction) => {
    setActions(prev => ({ ...prev, [id]: a }));
    if (a !== "reassign") setReassignTo(prev => { const n = { ...prev }; delete n[id]; return n; });
    if (reassignOpen === id && a !== "reassign") setReassignOpen(null);
  };

  // Live capacity calculation
  const { totalScheduled, totalWithReactive, resolvedTotal } = useMemo(() => {
    const totalScheduled = JOBS.reduce((s, j) => s + j.mins, 0); // 450
    const totalWithReactive = totalScheduled + serviceMin;
    const removed = JOBS.filter(j => actions[j.id] === "push" || actions[j.id] === "defer" || actions[j.id] === "delete" || (actions[j.id] === "reassign" && reassignTo[j.id])).reduce((s, j) => s + j.mins, 0);
    const resolvedTotal = totalWithReactive - removed;
    return { totalScheduled, totalWithReactive, resolvedTotal };
  }, [actions, reassignTo, serviceMin]);

  const overMax      = resolvedTotal > MAX_CAP;
  const inContingency = resolvedTotal > PRODUCTIVE && resolvedTotal <= MAX_CAP;
  const isGreen      = resolvedTotal <= PRODUCTIVE;
  const canPublish   = !overMax && (isGreen || contingencyApproved);

  const resolvedJobs = JOBS.filter(j => actions[j.id] !== "none");

  const STEP_LABELS = ["Create Job", "Schedule Impact", "Resolve Conflicts", "Confirm & Publish"];

  return (
    <div className="min-h-screen bg-[#f5f7f9] font-sans">
      {/* Page header */}
      <header className="bg-white border-b px-8 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: NAVY }}>New Reactive Job</h1>
          <p className="text-xs text-gray-400">Reactive / ad-hoc work insertion with schedule impact management</p>
        </div>
        <button onClick={onClose} className="text-gray-300 hover:text-gray-500"><X className="w-5 h-5" /></button>
      </header>

      {/* Step progress */}
      <div className="bg-white border-b px-8 py-3">
        <div className="flex items-center gap-0 max-w-2xl">
          {STEP_LABELS.map((label, i) => {
            const n = i + 1;
            const done = step > n;
            const active = step === n;
            return (
              <div key={label} className="flex items-center gap-0 flex-1">
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${done ? "text-white" : active ? "text-white" : "bg-gray-100 text-gray-400"}`}
                    style={done || active ? { background: BRAND } : {}}>
                    {done ? <CheckCircle2 className="w-4 h-4" /> : n}
                  </div>
                  <span className={`text-xs font-medium ${active ? "text-gray-900" : done ? "text-gray-500" : "text-gray-300"}`}>{label}</span>
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div className="flex-1 h-px mx-3" style={{ background: done ? BRAND : "#e5e7eb" }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-8 py-6">

        {/* ── Step 1: Create job ──────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-5">

            {/* ── Location block ── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                <MapPin className="w-4 h-4" style={{ color: BRAND }} />Location
              </h2>

              {/* Toggle: known asset vs other public land */}
              <div className="flex gap-2 mb-4">
                {(["asset", "other"] as const).map(t => (
                  <button key={t} onClick={() => { setLocationType(t); setSelectedAsset(""); setCombineScheduled(false); }}
                    className={`flex-1 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${locationType === t ? "text-white border-transparent" : "border-gray-200 text-gray-500 bg-white"}`}
                    style={locationType === t ? { background: BRAND } : {}}>
                    {t === "asset" ? "📋 Known garden asset" : "📍 Other public land"}
                  </button>
                ))}
              </div>

              {locationType === "asset" ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1.5">Select garden asset *</label>
                    <select value={selectedAsset} onChange={e => { setSelectedAsset(e.target.value); setCombineScheduled(false); if (e.target.value) setAssignTeam(ASSET_SCHEDULE[e.target.value]?.team || "Mobile 1"); }}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] bg-white">
                      <option value="">— Select an asset —</option>
                      {Object.entries(ASSET_SCHEDULE).map(([name, info]) => (
                        <option key={name} value={name}>{name} ({info.id})</option>
                      ))}
                    </select>
                  </div>
                  {selectedAsset && assetInfo && (
                    <div className="text-[11px] text-gray-400 flex items-center gap-3 px-1">
                      <span>Team: <span className="font-semibold text-gray-600">{assetInfo.team}</span></span>
                      <span>·</span>
                      <span>Freq: <span className="font-semibold text-gray-600">{assetInfo.freq}</span></span>
                      <span>·</span>
                      <span>Last visit: <span className="font-semibold text-gray-600">{assetInfo.lastVisit}</span></span>
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1.5">Additional description (optional)</label>
                    <input placeholder="e.g. NE corner near entrance gate…"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD]" />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1.5">Location / Description *</label>
                  <input value={freeTextLocation} onChange={e => setFreeTextLocation(e.target.value)}
                    placeholder="e.g. Parumoana St Roundabout, outside 42 Kenepuru Dr…"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD]" />
                  <p className="text-[10px] text-gray-400 mt-1.5">Any publicly managed land — road berms, reserves, footpaths, parks not in the asset register.</p>
                </div>
              )}

              {/* ── Combined visit recommendation ── */}
              {locationType === "asset" && selectedAsset && assetInfo && (
                <div className={`mt-4 p-4 rounded-xl border-2 ${canCombine ? "bg-green-50 border-green-200" : tooEarlyToMaintain ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200"}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${canCombine ? "bg-green-100" : tooEarlyToMaintain ? "bg-blue-100" : "bg-gray-100"}`}>
                      {canCombine ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : tooEarlyToMaintain ? <Info className="w-4 h-4 text-blue-500" /> : <Clock className="w-4 h-4 text-gray-400" />}
                    </div>
                    <div className="flex-1">
                      {canCombine && (
                        <>
                          <p className="text-sm font-bold text-green-800">
                            {assetInfo.workingDays === 0 ? "Scheduled maintenance is due today" : `Scheduled maintenance due ${assetInfo.nextDate} — ${assetInfo.workingDays} working day${assetInfo.workingDays !== 1 ? "s" : ""} away`}
                          </p>
                          <p className="text-xs text-green-700 mt-0.5">
                            Within the {COMBINE_THRESHOLD}-working-day window. Recommend combining into a single visit to avoid a separate trip.
                          </p>
                          <div className="mt-3 flex items-center gap-3">
                            <button onClick={() => setCombineScheduled(v => !v)}
                              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 text-xs font-bold transition-all ${combineScheduled ? "bg-green-600 border-green-600 text-white" : "border-green-400 text-green-700 bg-white"}`}>
                              {combineScheduled ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                              {combineScheduled ? "Combined visit — scheduled included" : "Combine with scheduled maintenance"}
                            </button>
                            {combineScheduled && (
                              <span className="text-[11px] text-green-700 font-semibold">
                                +{fmtMins(assetInfo.scheduledMins)} scheduled → {fmtMins(reactiveMin + assetInfo.scheduledMins)} total
                              </span>
                            )}
                          </div>
                          {combineScheduled && (
                            <p className="text-[10px] text-green-600 mt-2">
                              ✓ Scheduled visit on {assetInfo.nextDate} will be marked complete · next recurrence calculated from today
                            </p>
                          )}
                        </>
                      )}
                      {tooEarlyToMaintain && (
                        <>
                          <p className="text-sm font-bold text-blue-800">Scheduled next due {assetInfo.nextDate} — but last serviced {assetInfo.daysSinceLastVisit} days ago</p>
                          <p className="text-xs text-blue-700 mt-0.5">
                            Garden was recently maintained. Reactive visit only recommended — do not pull forward scheduled work (min interval: {assetInfo.minInterval} days).
                          </p>
                        </>
                      )}
                      {!canCombine && !tooEarlyToMaintain && (
                        <>
                          <p className="text-sm font-bold text-gray-700">Scheduled maintenance not due for {assetInfo.workingDays} working days ({assetInfo.nextDate})</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Beyond the {COMBINE_THRESHOLD}-working-day window. Reactive visit only — do not pull forward scheduled work.
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Job details block ── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Zap className="w-4 h-4" style={{ color: BRAND }} />Job Details
              </h2>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1.5">Reason / Job Type *</label>
                  <select value={reason} onChange={e => setReason(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] bg-white">
                    {REASON_TYPES.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1.5">Date *</label>
                  <input type="text" defaultValue="27 Mar 2026"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD]" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1.5">Assign to Team *</label>
                  <select value={assignTeam} onChange={e => setAssignTeam(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] bg-white">
                    <option>Mobile 1</option>
                    <option>Mobile 2</option>
                    <option>CBD</option>
                    <option>Specialist</option>
                  </select>
                  {locationType === "asset" && selectedAsset && assetInfo && assignTeam !== assetInfo.team && (
                    <p className="text-[10px] text-amber-600 mt-1">⚠ This asset is normally serviced by {assetInfo.team}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1.5">Reactive time (min) *</label>
                  <input type="number" value={reactiveMin} onChange={e => setReactiveMin(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD]" />
                </div>
                {combineScheduled && assetInfo && (
                  <div className="col-span-2 p-3 rounded-xl bg-green-50 border border-green-200 flex items-center justify-between">
                    <div className="text-xs text-green-800">
                      <span className="font-semibold">Total time on site:</span>{" "}
                      {fmtMins(reactiveMin)} reactive + {fmtMins(assetInfo.scheduledMins)} scheduled maintenance
                    </div>
                    <span className="text-sm font-black text-green-700">{fmtMins(serviceMin)}</span>
                  </div>
                )}
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 font-medium block mb-1.5">Priority</label>
                  <div className="flex gap-3">
                    {(["urgent", "normal"] as const).map(p => (
                      <button key={p} onClick={() => setPriority(p)}
                        className={`flex-1 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${priority === p ? p === "urgent" ? "border-red-400 bg-red-50 text-red-700" : "border-[#00AECD] text-[#00AECD] bg-[#00AECD08]" : "border-gray-200 text-gray-400 bg-white"}`}>
                        {p === "urgent" ? "🔴 Urgent" : "🟡 Normal"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={() => setStep(2)}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: BRAND }}>
                Check Schedule Impact <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Impact ──────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-5">
            {/* Reactive job summary */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-5">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#fef3c7" }}>
                <Zap className="w-6 h-6 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-900">{location}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[11px] text-gray-400">{reason}</span>
                  <span className="text-[11px] text-gray-400">·</span>
                  <span className="text-[11px] font-medium" style={{ color: BRAND }}>Mobile 1 · Wed 27 Mar</span>
                  <span className="text-[11px] text-gray-400">·</span>
                  <span className="flex items-center gap-1 text-[11px] text-gray-500"><Clock className="w-3 h-3" />{fmtMins(serviceMin)}</span>
                </div>
              </div>
              <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-red-50 text-red-700">Urgent</span>
            </div>

            {/* Capacity impact */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className="text-sm font-bold text-gray-900 mb-4">Schedule impact — Mobile 1, Wed 27 Mar</h3>
              <CapBar total={totalWithReactive} reactive={serviceMin} />

              <div className="mt-5 grid grid-cols-3 gap-4">
                {[
                  { label: "Scheduled today",   value: fmtMins(totalScheduled),   color: "#374151" },
                  { label: "+ Reactive job",     value: `+${fmtMins(serviceMin)}`, color: "#d97706" },
                  { label: "New total",          value: fmtMins(totalWithReactive), color: totalWithReactive > MAX_CAP ? "#dc2626" : "#d97706" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center p-3 rounded-xl bg-gray-50">
                    <p className="text-[11px] text-gray-400 mb-1">{label}</p>
                    <p className="text-xl font-black" style={{ color }}>{value}</p>
                  </div>
                ))}
              </div>

              {totalWithReactive > MAX_CAP && (
                <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-red-700">Mobile 1 will be {fmtMins(totalWithReactive - MAX_CAP)} over the 8-hour maximum</p>
                    <p className="text-xs text-red-600 mt-0.5">
                      You need to push, defer, delete, or reassign at least {fmtMins(totalWithReactive - MAX_CAP)} of scheduled work before you can publish this change.
                    </p>
                  </div>
                </div>
              )}
              {totalWithReactive > PRODUCTIVE && totalWithReactive <= MAX_CAP && (
                <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 flex gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-amber-700">Mobile 1 will be using {fmtMins(totalWithReactive - PRODUCTIVE)} of the 2-hour contingency buffer</p>
                    <p className="text-xs text-amber-600 mt-0.5">This is within the 8-hour maximum. You can proceed with contingency authorisation, or reschedule some work.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <button onClick={() => setStep(1)} className="text-sm text-gray-400 hover:text-gray-600">← Back</button>
              <button onClick={() => setStep(3)}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: BRAND }}>
                {totalWithReactive > MAX_CAP ? "Resolve Conflicts" : "Review & Confirm"} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Resolve ─────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-5">
            {/* Live capacity bar */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <CapBar total={resolvedTotal} reactive={serviceMin} />
              {overMax && (
                <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-xs font-semibold text-red-700">Still {fmtMins(resolvedTotal - MAX_CAP)} over maximum — move or remove more work to continue.</p>
                </div>
              )}
              {inContingency && !contingencyApproved && (
                <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <p className="text-xs font-semibold text-amber-700">Using {fmtMins(resolvedTotal - PRODUCTIVE)} of contingency — authorise to proceed.</p>
                  </div>
                  <button onClick={() => setContingencyApproved(true)}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white bg-amber-500 hover:bg-amber-600 transition-colors whitespace-nowrap">
                    Authorise Additional Hours
                  </button>
                </div>
              )}
              {inContingency && contingencyApproved && (
                <div className="mt-3 p-3 rounded-xl bg-green-50 border border-green-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <p className="text-xs font-semibold text-green-700">Contingency hours authorised — team approved to work up to 8 hours today.</p>
                </div>
              )}
              {isGreen && (
                <div className="mt-3 p-3 rounded-xl bg-green-50 border border-green-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <p className="text-xs font-semibold text-green-700">Within productive target — no contingency needed.</p>
                </div>
              )}
            </div>

            {/* Job resolution list */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">Mobile 1 — Scheduled jobs for Wed 27 Mar</p>
                <p className="text-[11px] text-gray-400">Push/Defer ≤1 day where possible · service windows shown</p>
              </div>
              <div className="divide-y divide-gray-50">
                {JOBS.map(job => {
                  const action = actions[job.id];
                  const resolved = action !== "none";
                  const atWindowEdge = job.dayOf >= job.windowSize;

                  return (
                    <div key={job.id} className={`px-5 py-4 transition-colors ${resolved ? "bg-green-50/40" : ""}`}>
                      <div className="flex items-start gap-4">
                        {/* Job info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: job.typeColor }}>{job.type}</span>
                            <span className="text-[10px] text-gray-400">{job.freq}</span>
                            {atWindowEdge && (
                              <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">
                                ⚠ Window edge — push may breach
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-semibold text-gray-900">{job.site}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-[11px] text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" />{fmtMins(job.mins)}</span>
                            <span className="text-[11px] text-gray-400">Due {job.nextDue} · last visit {job.lastVisit}</span>
                          </div>
                          {action === "push" && <WindowBadge job={job} pushDays={1} />}
                          {action === "defer" && <WindowBadge job={job} pushDays={3} />}
                          {action === "reassign" && reassignTo[job.id] && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 mt-1 inline-block">
                              → Reassigned to {reassignTo[job.id]}
                            </span>
                          )}
                          {action === "delete" && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 mt-1 inline-block">
                              ✕ Removed from schedule
                            </span>
                          )}
                        </div>

                        {/* Saved time */}
                        {resolved && (
                          <div className="flex-shrink-0 text-right">
                            <p className="text-[11px] text-green-600 font-bold">-{fmtMins(job.mins)} freed</p>
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end max-w-xs">
                          {(["push", "defer", "delete", "reassign"] as const).map(a => {
                            const active = action === a;
                            const icons: Record<string, React.ReactElement> = {
                              push:     <SkipForward className="w-3 h-3" />,
                              defer:    <Calendar className="w-3 h-3" />,
                              delete:   <Trash2 className="w-3 h-3" />,
                              reassign: <Users className="w-3 h-3" />,
                            };
                            const labels: Record<string, string> = { push: "Push +1d", defer: "Defer", delete: "Delete", reassign: "Reassign" };
                            const colors: Record<string, string> = {
                              push:     active ? "#2563eb" : "",
                              defer:    active ? "#7c3aed" : "",
                              delete:   active ? "#dc2626" : "",
                              reassign: active ? "#9333ea" : "",
                            };
                            return (
                              <button key={a}
                                onClick={() => { setAction(job.id, active ? "none" : a); if (a === "reassign" && !active) setReassignOpen(job.id); }}
                                className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border-2 transition-all ${active ? "text-white border-transparent" : "border-gray-200 text-gray-500 hover:border-gray-300 bg-white"}`}
                                style={active ? { background: colors[a], borderColor: colors[a] } : {}}>
                                {icons[a]}{labels[a]}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Reassign sub-panel */}
                      {action === "reassign" && (
                        <div className="mt-3 ml-0 pl-0 pt-3 border-t border-gray-100">
                          <p className="text-[11px] font-semibold text-gray-500 mb-2">Available teams on 27 Mar:</p>
                          <div className="flex gap-2">
                            {REASSIGN_OPTIONS.map(opt => {
                              const newTotal = opt.scheduled + job.mins;
                              const band = capacityBand(newTotal);
                              const fits = newTotal <= MAX_CAP;
                              const selected = reassignTo[job.id] === opt.team;
                              return (
                                <button key={opt.team}
                                  onClick={() => fits && setReassignTo(prev => ({ ...prev, [job.id]: opt.team }))}
                                  disabled={!fits}
                                  className={`flex-1 p-3 rounded-xl border-2 text-left transition-all ${selected ? "border-purple-400 bg-purple-50" : fits ? "border-gray-200 hover:border-gray-300 bg-white" : "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"}`}>
                                  <p className="text-xs font-bold text-gray-800">{opt.team}</p>
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                      <div className="h-full rounded-full" style={{ width: `${(opt.scheduled / MAX_CAP) * 100}%`, background: bandColor(capacityBand(opt.scheduled)) }} />
                                    </div>
                                    <span className="text-[10px]" style={{ color: bandColor(band) }}>
                                      {fmtMins(opt.scheduled)} + {fmtMins(job.mins)} = {fmtMins(newTotal)}
                                    </span>
                                  </div>
                                  {!fits && <p className="text-[10px] text-red-500 mt-1">Over capacity</p>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button onClick={() => setStep(2)} className="text-sm text-gray-400 hover:text-gray-600">← Back</button>
              <button onClick={() => setStep(4)} disabled={!canPublish}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity ${canPublish ? "opacity-100" : "opacity-40 cursor-not-allowed"}`}
                style={{ background: BRAND }}>
                Review & Confirm <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Confirm & Publish ───────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-5">
            {/* Reactive job card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />Reactive job to be added
              </h3>
              <div className="flex items-center gap-4 p-4 rounded-xl bg-amber-50 border border-amber-200">
                <div>
                  <p className="text-sm font-bold text-gray-900">{location}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[11px] text-gray-500">{reason}</span>
                    <span className="text-[11px] text-gray-500">·</span>
                    <span className="text-[11px] text-gray-500">Mobile 1 · Wed 27 Mar · {fmtMins(serviceMin)}</span>
                    <span className="text-[11px] font-bold text-red-600">Urgent</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Schedule changes */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-4">Schedule changes ({resolvedJobs.length} job{resolvedJobs.length !== 1 ? "s" : ""} affected)</h3>
              {resolvedJobs.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No scheduled jobs were changed.</p>
              ) : (
                <div className="space-y-2">
                  {resolvedJobs.map(job => {
                    const a = actions[job.id];
                    const desc = a === "push" ? "Pushed to 28 Mar (+1 day)" : a === "defer" ? "Deferred to 30 Mar (+3 days)" : a === "delete" ? "Removed from schedule" : `Reassigned to ${reassignTo[job.id] || "—"}`;
                    const color = a === "delete" ? "text-red-600" : a === "push" || a === "defer" ? "text-blue-600" : "text-purple-600";
                    return (
                      <div key={job.id} className="flex items-center justify-between py-2 px-3 rounded-xl bg-gray-50">
                        <div>
                          <p className="text-[13px] font-semibold text-gray-800">{job.site}</p>
                          <p className={`text-[11px] font-medium mt-0.5 ${color}`}>{desc}</p>
                        </div>
                        <span className="text-[11px] text-gray-400">{fmtMins(job.mins)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Final capacity */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-4">Final capacity — Mobile 1, Wed 27 Mar</h3>
              <CapBar total={resolvedTotal} reactive={serviceMin} />
              {contingencyApproved && (
                <div className="mt-3 flex items-center gap-2 text-[11px] text-amber-700 font-semibold">
                  <Shield className="w-3.5 h-3.5" />Contingency hours authorised — manager approved overtime today
                </div>
              )}
            </div>

            {/* Worker notification preview */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Bell className="w-4 h-4" style={{ color: BRAND }} />Worker notifications on publish
              </h3>
              <div className="space-y-2">
                {[
                  { worker: "Barry Lavakula", initials: "BL", msg: `New job added: ${location} (${fmtMins(serviceMin)})` },
                  ...resolvedJobs.filter(j => actions[j.id] !== "reassign").map(j => ({
                    worker: "Barry Lavakula", initials: "BL",
                    msg: `${j.site} — ${actions[j.id] === "delete" ? "removed from your schedule" : actions[j.id] === "push" ? "moved to 28 Mar" : "deferred to 30 Mar"}`
                  })),
                  ...resolvedJobs.filter(j => actions[j.id] === "reassign" && reassignTo[j.id]).map(j => ({
                    worker: `${reassignTo[j.id]} worker`, initials: reassignTo[j.id]?.replace("Team ", "T") || "",
                    msg: `New job added to your schedule: ${j.site} (${fmtMins(j.mins)})`
                  })),
                ].map((n, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ background: BRAND }}>
                      {n.initials}
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-gray-700">{n.worker}</p>
                      <p className="text-[11px] text-gray-500">{n.msg}</p>
                    </div>
                    <Bell className="w-3.5 h-3.5 text-gray-300 ml-auto" />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button onClick={() => setStep(3)} className="text-sm text-gray-400 hover:text-gray-600">← Back</button>
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-bold text-white shadow-lg transition-opacity hover:opacity-90"
                style={{ background: BRAND }}>
                <CheckCircle2 className="w-5 h-5" />Publish Changes & Notify Workers
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
