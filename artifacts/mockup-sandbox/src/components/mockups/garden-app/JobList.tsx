import { useState } from "react";
import {
  MapPin, Clock, Wifi, WifiOff, ChevronRight, CheckCircle2,
  PlayCircle, RefreshCw, Route, SkipForward, X, AlertTriangle,
  CalendarDays, Send
} from "lucide-react";

const BRAND = "#00AECD";
const NAVY = "#0f2a36";

type JobStatus = "complete" | "inprogress" | "pending" | "skipped";

interface Job {
  id: number;
  runNo: number;
  site: string;
  type: string;
  los: number | null;
  mins: number;
  suburb: string;
  status: JobStatus;
  tasksTotal: number;
  tasksDone: number;
  skipReason?: string;
}

const INITIAL_JOBS: Job[] = [
  { id: 1, runNo: 1, site: "Waitangirua Mall Entry",  type: "Rose",           los: 1, mins: 120, suburb: "Waitangirua",  status: "complete",   tasksTotal: 8, tasksDone: 8 },
  { id: 2, runNo: 2, site: "Cobham Court",             type: "Rose",           los: 1, mins: 120, suburb: "Porirua CBD", status: "inprogress", tasksTotal: 8, tasksDone: 3 },
  { id: 3, runNo: 3, site: "Mungavin Ave Berm",        type: "Annual Bedding", los: 2, mins: 45,  suburb: "Porirua",     status: "pending",    tasksTotal: 6, tasksDone: 0 },
  { id: 4, runNo: 4, site: "Aotea Lagoon Reserve",     type: "Shrub Bed",      los: 2, mins: 90,  suburb: "Papakowhai",  status: "pending",    tasksTotal: 7, tasksDone: 0 },
  { id: 5, runNo: 5, site: "Titahi Bay Esplanade",     type: "Annual Bedding", los: 2, mins: 75,  suburb: "Titahi Bay",  status: "pending",    tasksTotal: 6, tasksDone: 0 },
];

const TYPE_COLORS: Record<string, string> = {
  Rose: "#ec4899",
  "Shrub Bed": BRAND,
  "Annual Bedding": "#f59e0b",
  Revegetation: "#16a34a",
  Bush: "#166534",
};

function StatusBadge({ status }: { status: JobStatus }) {
  if (status === "inprogress") return (
    <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#dcfce7", color: "#15803d" }}>
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
      In Progress
    </span>
  );
  if (status === "complete") return (
    <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
      <CheckCircle2 className="w-3 h-3" />Complete
    </span>
  );
  if (status === "skipped") return (
    <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-500">
      <SkipForward className="w-3 h-3" />Skipped
    </span>
  );
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">Pending</span>
  );
}

interface JobCardProps {
  job: Job;
  isNext: boolean;
  onSkip: (job: Job) => void;
}

function JobCard({ job, isNext, onSkip }: JobCardProps) {
  const color = TYPE_COLORS[job.type] || BRAND;
  const hrs = Math.floor(job.mins / 60);
  const mins = job.mins % 60;
  const timeLabel = hrs > 0 ? `${hrs}h${mins > 0 ? ` ${mins}m` : ""}` : `${mins}m`;
  const isActive = job.status === "inprogress";
  const isSkipped = job.status === "skipped";
  const isComplete = job.status === "complete";

  return (
    <div
      className={`mx-4 mb-3 rounded-2xl border bg-white shadow-sm overflow-hidden transition-all ${
        isActive ? "border-[#00AECD40]" : isSkipped ? "border-orange-100 opacity-70" : "border-gray-100"
      } ${isNext ? "ring-2 ring-offset-1" : ""}`}
      style={isNext ? { ringColor: BRAND } : {}}
    >
      {/* Active job banner */}
      {isActive && (
        <div className="px-4 py-1.5 flex items-center gap-2" style={{ background: BRAND }}>
          <PlayCircle className="w-3.5 h-3.5 text-white" />
          <span className="text-white text-[11px] font-semibold">Currently active · 00:23:45</span>
        </div>
      )}

      {/* Up next banner */}
      {isNext && !isActive && (
        <div className="px-4 py-1.5 flex items-center gap-2 bg-blue-500">
          <span className="text-white text-[11px] font-semibold">↓ Up next on your route</span>
        </div>
      )}

      <div className="flex items-stretch">
        {/* Run number column */}
        <div className={`w-12 flex-shrink-0 flex flex-col items-center justify-center py-3 ${isSkipped ? "bg-orange-50" : isComplete ? "bg-gray-50" : "bg-gray-50"}`}>
          <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Run</span>
          <span className={`text-lg font-black ${isComplete ? "text-gray-300" : isSkipped ? "text-orange-300" : isActive ? "text-[#00AECD]" : "text-gray-700"}`}>
            {job.runNo}
          </span>
          {isComplete && <CheckCircle2 className="w-3.5 h-3.5 text-green-400 mt-0.5" />}
        </div>

        {/* Divider */}
        <div className="w-px bg-gray-100 my-3" />

        {/* Main content */}
        <div className="flex-1 min-w-0 px-3 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                <StatusBadge status={job.status} />
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full text-white" style={{ background: color }}>
                  {job.type}
                </span>
                {job.los && (
                  <span className="text-[10px] text-gray-400 font-medium">LOS {job.los}</span>
                )}
              </div>
              <p className={`text-[13px] font-semibold truncate ${isSkipped ? "line-through text-gray-400" : "text-gray-900"}`}>
                {job.site}
              </p>
              <div className="flex items-center gap-3 mt-1">
                <span className="flex items-center gap-1 text-[11px] text-gray-400">
                  <MapPin className="w-3 h-3" />{job.suburb}
                </span>
                <span className="flex items-center gap-1 text-[11px] text-gray-400">
                  <Clock className="w-3 h-3" />{timeLabel}
                </span>
              </div>

              {/* Skip reason */}
              {isSkipped && job.skipReason && (
                <p className="text-[10px] text-orange-500 mt-1 italic">"{job.skipReason}"</p>
              )}
            </div>
            <ChevronRight className="w-4 h-4 text-gray-200 flex-shrink-0 mt-1" />
          </div>

          {/* Progress bar for active */}
          {isActive && (
            <div className="mt-2">
              <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                <span>{job.tasksDone} of {job.tasksTotal} tasks complete</span>
                <span style={{ color: BRAND }}>{Math.round((job.tasksDone / job.tasksTotal) * 100)}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(job.tasksDone / job.tasksTotal) * 100}%`, background: BRAND }} />
              </div>
            </div>
          )}

          {/* Skip button for pending */}
          {(job.status === "pending") && (
            <div className="mt-2 pt-2 border-t border-gray-50 flex justify-end">
              <button
                onClick={(e) => { e.stopPropagation(); onSkip(job); }}
                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-orange-500 transition-colors"
              >
                <SkipForward className="w-3 h-3" />
                Skip this site
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface SkipModalProps {
  job: Job;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

const SKIP_REASONS = [
  "Site inaccessible — event or obstruction",
  "Safety concern on site",
  "Insufficient time remaining today",
  "Equipment issue",
  "Other (see note below)",
];

function SkipModal({ job, onConfirm, onCancel }: SkipModalProps) {
  const [selected, setSelected] = useState("");
  const [custom, setCustom] = useState("");
  const reason = selected === "Other (see note below)" ? custom.trim() : selected;
  const canConfirm = reason.length > 0;

  return (
    <div className="absolute inset-0 bg-black/50 flex items-end z-50">
      <div className="w-full bg-white rounded-t-3xl overflow-hidden">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        <div className="px-5 pb-2 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold" style={{ color: NAVY }}>Skip Site</h3>
            <p className="text-[11px] text-gray-400">Run {job.runNo} · {job.site}</p>
          </div>
          <button onClick={onCancel} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Warning */}
        <div className="mx-5 mb-3 flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5">
          <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-orange-700 leading-relaxed">
            Skipping a site is recorded against your work log and visible to your supervisor. A reason is required.
          </p>
        </div>

        {/* Reason picker */}
        <div className="px-5 mb-3">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Select a reason</p>
          <div className="space-y-2">
            {SKIP_REASONS.map(r => (
              <button
                key={r}
                onClick={() => setSelected(r)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border text-[12px] font-medium transition-all ${
                  selected === r
                    ? "border-[#00AECD] text-[#00AECD] bg-[#00AECD10]"
                    : "border-gray-100 text-gray-700 bg-gray-50"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {selected === "Other (see note below)" && (
            <textarea
              value={custom}
              onChange={e => setCustom(e.target.value)}
              placeholder="Describe the reason for skipping this site…"
              className="w-full mt-2 text-[12px] rounded-xl border border-gray-200 px-3 py-2 resize-none focus:outline-none focus:ring-2 text-gray-700"
              style={{ minHeight: 72, focusRingColor: BRAND }}
            />
          )}
        </div>

        {/* Actions */}
        <div className="px-5 pb-6 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-2xl border border-gray-200 text-gray-600 font-semibold text-sm"
          >
            Cancel
          </button>
          <button
            disabled={!canConfirm}
            onClick={() => canConfirm && onConfirm(reason)}
            className={`flex-1 py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
              canConfirm ? "text-white shadow-md" : "bg-gray-100 text-gray-300 cursor-not-allowed"
            }`}
            style={canConfirm ? { background: "#f97316" } : {}}
          >
            <Send className="w-4 h-4" />
            Confirm Skip
          </button>
        </div>
      </div>
    </div>
  );
}

export function JobList() {
  const [jobs, setJobs] = useState<Job[]>(INITIAL_JOBS);
  const [skipTarget, setSkipTarget] = useState<Job | null>(null);

  const totalJobs = jobs.length;
  const doneJobs = jobs.filter(j => j.status === "complete").length;
  const remaining = jobs.filter(j => j.status !== "complete" && j.status !== "skipped").length;
  const nextPending = jobs.find(j => j.status === "pending");

  const handleSkip = (reason: string) => {
    if (!skipTarget) return;
    setJobs(prev => prev.map(j =>
      j.id === skipTarget.id ? { ...j, status: "skipped" as JobStatus, skipReason: reason } : j
    ));
    setSkipTarget(null);
  };

  return (
    <div className="relative flex flex-col min-h-screen bg-gray-50 font-sans overflow-hidden" style={{ maxWidth: 390 }}>
      {/* Status bar */}
      <div className="h-10 flex items-center justify-between px-5 text-[11px] font-medium bg-white" style={{ color: NAVY }}>
        <span>9:41</span>
        <span className="flex items-center gap-1" style={{ color: BRAND }}>
          <Wifi className="w-3.5 h-3.5" />Online
        </span>
      </div>

      {/* Header */}
      <div className="px-5 pt-3 pb-4 bg-white border-b">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">Week of 27 Mar 2026</p>
            <h1 className="text-xl font-bold mt-0.5" style={{ color: NAVY }}>My Jobs</h1>
            <p className="text-xs text-gray-400 mt-0.5">James Turner · Field Surveyor</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: BRAND }}>JT</div>
            <span className="flex items-center gap-1 text-[10px] text-gray-400">
              <RefreshCw className="w-2.5 h-2.5" />Synced 8:42am
            </span>
          </div>
        </div>

        {/* Summary pills */}
        <div className="flex gap-2 mt-3">
          <div className="flex-1 rounded-xl py-2 px-3 text-center" style={{ background: BRAND + "15" }}>
            <p className="text-lg font-bold" style={{ color: BRAND }}>{totalJobs}</p>
            <p className="text-[10px] text-gray-500">Total</p>
          </div>
          <div className="flex-1 rounded-xl py-2 px-3 text-center bg-green-50">
            <p className="text-lg font-bold text-green-600">{doneJobs}</p>
            <p className="text-[10px] text-gray-500">Complete</p>
          </div>
          <div className="flex-1 rounded-xl py-2 px-3 text-center bg-blue-50">
            <p className="text-lg font-bold text-blue-600">{remaining}</p>
            <p className="text-[10px] text-gray-500">Remaining</p>
          </div>
        </div>
      </div>

      {/* Route optimised banner */}
      <div className="mx-4 mt-3 rounded-xl px-3 py-2.5 flex items-center gap-2.5" style={{ background: BRAND + "12", border: `1px solid ${BRAND}30` }}>
        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: BRAND }}>
          <Route className="w-3.5 h-3.5 text-white" />
        </div>
        <div>
          <p className="text-[12px] font-bold" style={{ color: NAVY }}>Route optimised — follow jobs in order</p>
          <p className="text-[10px] text-gray-500">Run numbers reflect the most efficient travel sequence for today.</p>
        </div>
      </div>

      {/* Offline banner */}
      <div className="mx-4 mt-2 rounded-xl px-3 py-2 flex items-center gap-2 bg-amber-50 border border-amber-200">
        <WifiOff className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
        <p className="text-[11px] text-amber-700">
          <span className="font-semibold">Offline mode ready.</span> Data cached. Photos sync when reconnected.
        </p>
      </div>

      {/* Job list */}
      <div className="flex-1 overflow-y-auto py-3">
        <p className="px-5 pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Thursday 27 Mar</p>
        {jobs.map(job => (
          <JobCard
            key={job.id}
            job={job}
            isNext={nextPending?.id === job.id}
            onSkip={setSkipTarget}
          />
        ))}
      </div>

      {/* Bottom nav */}
      <div className="border-t bg-white px-2 py-2 flex justify-around">
        {[
          { icon: CalendarDays, label: "My Jobs", active: true },
          { icon: CheckCircle2, label: "Completed", active: false },
          { icon: MapPin, label: "Map", active: false },
        ].map(({ icon: Icon, label, active }) => (
          <button key={label} className="flex flex-col items-center gap-0.5 px-4 py-1">
            <Icon className="w-5 h-5" style={{ color: active ? BRAND : "#9ca3af" }} />
            <span className="text-[10px] font-medium" style={{ color: active ? BRAND : "#9ca3af" }}>{label}</span>
          </button>
        ))}
      </div>

      {/* Skip modal */}
      {skipTarget && (
        <SkipModal
          job={skipTarget}
          onConfirm={handleSkip}
          onCancel={() => setSkipTarget(null)}
        />
      )}
    </div>
  );
}
