import { useState, useEffect } from "react";
import {
  ChevronLeft, Camera, CheckCircle2, Circle, Clock,
  WifiOff, AlertCircle, X, ImageIcon, ChevronDown, Send,
  MapPin, Layers, Star, ChevronUp, Navigation
} from "lucide-react";

const BRAND = "#00AECD";
const NAVY = "#0f2a36";

const ALLOCATED_SECS = 45 * 60;        // 45 min allocated
const START_ELAPSED  = 23 * 60 + 45;   // already 23:45 in when screen opens
const START_REMAINING = ALLOCATED_SECS - START_ELAPSED; // 21:15

type TaskStatus = "complete" | "incomplete" | "pending";

interface Task {
  id: number;
  label: string;
  status: TaskStatus;
  hasPhoto: boolean;
  note: string;
  showNote: boolean;
}

const INITIAL_TASKS: Task[] = [
  { id: 1, label: "Litter — remove all old litter",              status: "complete",   hasPhoto: true,  note: "", showNote: false },
  { id: 2, label: "Dead heading — visually pleasing",            status: "complete",   hasPhoto: true,  note: "", showNote: false },
  { id: 3, label: "Weed control — ≤5% total cover",             status: "complete",   hasPhoto: true,  note: "", showNote: false },
  { id: 4, label: "Mulch depth — 50–125mm, clear of stems",     status: "incomplete", hasPhoto: false, note: "", showNote: true  },
  { id: 5, label: "Pruning — best practice, road clearance",    status: "pending",    hasPhoto: false, note: "", showNote: false },
  { id: 6, label: "Pest & disease — copper & winter oil check", status: "pending",    hasPhoto: false, note: "", showNote: false },
  { id: 7, label: "Edging — vertical, smooth & neat",           status: "pending",    hasPhoto: false, note: "", showNote: false },
  { id: 8, label: "Plant coverage — ≥95%",                      status: "pending",    hasPhoto: false, note: "", showNote: false },
];

function formatTime(secs: number): string {
  const abs = Math.abs(secs);
  const m = Math.floor(abs / 60).toString().padStart(2, "0");
  const s = (abs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function PhotoThumb({ hasPhoto }: { hasPhoto: boolean }) {
  if (hasPhoto) {
    return (
      <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 relative">
        <div className="w-full h-full" style={{ background: "linear-gradient(135deg, #d1fae5, #a7f3d0)" }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <ImageIcon className="w-4 h-4 text-green-600 opacity-70" />
        </div>
        <div className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full flex items-center justify-center">
          <CheckCircle2 className="w-2.5 h-2.5 text-white" />
        </div>
      </div>
    );
  }
  return (
    <button className="w-12 h-12 rounded-xl border-2 border-dashed border-gray-200 flex-shrink-0 flex items-center justify-center bg-gray-50">
      <Camera className="w-4 h-4 text-gray-300" />
    </button>
  );
}

function MiniMap() {
  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ height: 130 }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #e8f4f0, #d4ede6, #c8e6dc)" }}>
        <svg width="100%" height="100%" viewBox="0 0 350 130" className="absolute inset-0">
          <line x1="0" y1="72" x2="350" y2="68" stroke="#fff" strokeWidth="8" opacity="0.7" />
          <line x1="180" y1="0" x2="175" y2="130" stroke="#fff" strokeWidth="6" opacity="0.5" />
          <line x1="0" y1="36" x2="180" y2="72" stroke="#fff" strokeWidth="4" opacity="0.4" />
          <rect x="120" y="40" width="70" height="44" rx="4" fill="#d6e8e0" stroke="#b8d8cc" strokeWidth="1" />
          <rect x="30" y="80" width="50" height="30" rx="4" fill="#d6e8e0" stroke="#b8d8cc" strokeWidth="1" />
          <rect x="230" y="28" width="80" height="40" rx="4" fill="#d6e8e0" stroke="#b8d8cc" strokeWidth="1" />
          <ellipse cx="175" cy="72" rx="32" ry="22" fill="#4ade8060" stroke="#22c55e" strokeWidth="1.5" />
        </svg>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full">
          <div className="w-7 h-7 rounded-full border-3 border-white shadow-lg flex items-center justify-center" style={{ background: BRAND }}>
            <MapPin className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="w-1.5 h-1.5 rounded-full mx-auto -mt-0.5 shadow" style={{ background: BRAND }} />
        </div>
      </div>
      <button className="absolute bottom-2 right-2 flex items-center gap-1 bg-white/95 shadow rounded-lg px-2 py-1">
        <Navigation className="w-3 h-3" style={{ color: BRAND }} />
        <span className="text-[10px] font-semibold" style={{ color: NAVY }}>Navigate</span>
      </button>
      <div className="absolute top-2 left-2 bg-white/90 rounded-md px-1.5 py-0.5 flex items-center gap-1">
        <WifiOff className="w-2.5 h-2.5 text-amber-500" />
        <span className="text-[9px] text-amber-600 font-medium">Cached</span>
      </div>
    </div>
  );
}

export function JobCheckout() {
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [showSignOff, setShowSignOff] = useState(false);
  const [infoExpanded, setInfoExpanded] = useState(false);
  const [remaining, setRemaining] = useState(START_REMAINING);

  useEffect(() => {
    const id = setInterval(() => setRemaining(r => r - 1), 1000);
    return () => clearInterval(id);
  }, []);

  const isOverTime = remaining < 0;
  const timeColor = isOverTime ? "#ef4444" : remaining < 5 * 60 ? "#f97316" : BRAND;

  const done = tasks.filter(t => t.status === "complete").length;
  const total = tasks.length;
  const progress = Math.round((done / total) * 100);

  const incompleteWithoutNote = tasks.filter(t => t.status === "incomplete" && !t.note.trim());
  const canSignOff = incompleteWithoutNote.length === 0 && tasks.every(t => t.status !== "pending");
  const hasPending = tasks.some(t => t.status === "pending");

  const toggleNote = (id: number) =>
    setTasks(prev => prev.map(t => t.id === id ? { ...t, showNote: !t.showNote } : t));

  const setNote = (id: number, note: string) =>
    setTasks(prev => prev.map(t => t.id === id ? { ...t, note } : t));

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 font-sans" style={{ maxWidth: 390 }}>

      {/* Status bar */}
      <div className="h-10 flex items-center justify-between px-5 text-[11px] font-medium bg-white" style={{ color: NAVY }}>
        <span>9:41</span>
        <span className="flex items-center gap-1 text-amber-500">
          <WifiOff className="w-3.5 h-3.5" />Offline
        </span>
      </div>

      {/* ── Sticky header block ── */}
      <div className="bg-white border-b flex-shrink-0">

        {/* Row 1: back + title + countdown */}
        <div className="flex items-center gap-3 px-4 pt-3 pb-2">
          <button className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-gray-400 font-medium">Active Job</p>
            <p className="text-sm font-bold truncate" style={{ color: NAVY }}>Tui Park Rose Garden</p>
          </div>
          {/* Countdown timer */}
          <div
            className="flex flex-col items-end px-3 py-1.5 rounded-xl flex-shrink-0"
            style={{ background: isOverTime ? "#fef2f2" : `${timeColor}18` }}
          >
            <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: timeColor }}>
              {isOverTime ? "Over time" : "Remaining"}
            </span>
            <span className="text-base font-black tabular-nums leading-tight" style={{ color: timeColor }}>
              {isOverTime ? `+${formatTime(remaining)}` : formatTime(remaining)}
            </span>
            <span className="text-[8px] text-gray-400">of 45 min</span>
          </div>
        </div>

        {/* Row 2: persistent site info strip */}
        <button
          onClick={() => setInfoExpanded(e => !e)}
          className="w-full flex items-center gap-2 px-4 py-2 border-t border-gray-50 bg-gray-50/70 text-left"
        >
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white" style={{ background: "#ec4899" }}>Rose</span>
          <span className="flex items-center gap-1 text-[11px] font-medium text-gray-500">
            <Star className="w-3 h-3 text-gray-400" />High
          </span>
          <span className="flex items-center gap-1 text-[11px] text-gray-400 min-w-0 flex-1 truncate">
            <MapPin className="w-3 h-3 flex-shrink-0" />Tui Park, Elsdon
          </span>
          <span className="flex items-center gap-0.5 text-[10px] font-medium flex-shrink-0" style={{ color: BRAND }}>
            {infoExpanded
              ? <><ChevronUp className="w-3 h-3" />Hide map</>
              : <><ChevronDown className="w-3 h-3" />Map</>
            }
          </span>
        </button>

        {/* Expandable map + detail tiles */}
        {infoExpanded && (
          <div className="px-4 pb-3 border-t border-gray-50 bg-gray-50/50 space-y-2">
            <MiniMap />
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: Layers, label: "Type",      value: "Rose Garden" },
                { icon: Star,   label: "Standard", value: "High" },
                { icon: Clock,  label: "Allocated",  value: "45 min" },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="bg-white rounded-xl p-2 shadow-sm border border-gray-100">
                  <Icon className="w-3 h-3 mb-1" style={{ color: BRAND }} />
                  <p className="text-[9px] text-gray-400 uppercase tracking-wide">{label}</p>
                  <p className="text-[11px] font-semibold text-gray-800 leading-tight">{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Row 3: progress bar */}
        <div className="px-4 pb-3 pt-1">
          <div className="flex justify-between text-[11px] text-gray-400 mb-1">
            <span className="font-medium">{done} of {total} tasks complete</span>
            <span className="font-bold" style={{ color: BRAND }}>{progress}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${BRAND}, #0097b2)` }}
            />
          </div>
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {tasks.map((task) => {
          const isComplete  = task.status === "complete";
          const isIncomplete = task.status === "incomplete";
          const isPending   = task.status === "pending";

          return (
            <div
              key={task.id}
              className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
                isComplete ? "border-green-100" : isIncomplete ? "border-amber-200" : "border-gray-100"
              }`}
            >
              <div className="flex items-start gap-3 p-3">
                <div className="flex-shrink-0 mt-0.5">
                  {isComplete   ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                  : isIncomplete ? <AlertCircle  className="w-5 h-5 text-amber-500" />
                  :                <Circle       className="w-5 h-5 text-gray-300" />}
                </div>

                <div className="flex-1 min-w-0">
                  <p className={`text-[12px] leading-snug font-medium ${
                    isComplete ? "line-through text-gray-400" : isPending ? "text-gray-500" : "text-gray-800"
                  }`}>
                    {task.label}
                  </p>

                  {isComplete && (
                    <p className="text-[10px] text-green-500 mt-0.5 font-medium">✓ Photo added · Marked complete</p>
                  )}
                  {isIncomplete && (
                    <button
                      onClick={() => toggleNote(task.id)}
                      className="flex items-center gap-1 mt-1 text-[11px] text-amber-600 font-medium"
                    >
                      <ChevronDown className={`w-3 h-3 transition-transform ${task.showNote ? "rotate-180" : ""}`} />
                      {task.note ? "Note added" : "Add note — required for sign-off"}
                    </button>
                  )}
                  {isPending && (
                    <p className="text-[10px] text-gray-400 mt-0.5">Take photo to begin this task</p>
                  )}
                </div>

                <PhotoThumb hasPhoto={task.hasPhoto} />
              </div>

              {isIncomplete && task.showNote && (
                <div className="px-3 pb-3 border-t border-amber-100 pt-2">
                  <p className="text-[10px] text-amber-600 font-semibold mb-1.5 uppercase tracking-wide">Why is this task incomplete?</p>
                  <textarea
                    value={task.note}
                    onChange={e => setNote(task.id, e.target.value)}
                    placeholder="e.g. Mulch supply not available on site today. Scheduled for delivery Friday."
                    className="w-full text-[12px] rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 resize-none focus:outline-none text-gray-700 placeholder-gray-400"
                    style={{ minHeight: 72 }}
                  />
                  {!task.note.trim() && (
                    <p className="text-[10px] text-amber-500 mt-1">⚠ Note required before you can sign off</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sign-off CTA */}
      <div className="px-4 py-4 bg-white border-t space-y-2 flex-shrink-0">
        {hasPending && (
          <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <p className="text-[11px] text-gray-500">Complete or add notes for all tasks before signing off</p>
          </div>
        )}
        {!hasPending && incompleteWithoutNote.length > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 rounded-xl px-3 py-2 border border-amber-200">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            <p className="text-[11px] text-amber-700">
              {incompleteWithoutNote.length} incomplete task{incompleteWithoutNote.length > 1 ? "s" : ""} need{incompleteWithoutNote.length === 1 ? "s" : ""} a note before sign-off
            </p>
          </div>
        )}
        <button
          disabled={!canSignOff}
          onClick={() => setShowSignOff(true)}
          className={`w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all ${
            canSignOff ? "text-white shadow-lg" : "text-gray-300 bg-gray-100 cursor-not-allowed"
          }`}
          style={canSignOff ? { background: `linear-gradient(135deg, ${BRAND}, #0097b2)` } : {}}
        >
          <Send className="w-5 h-5" />
          Sign Off & Close Job
        </button>
        {canSignOff && (
          <p className="text-center text-[10px] text-gray-400">Work record will be saved against Tui Park Rose Garden</p>
        )}
      </div>

      {/* Sign-off confirmation sheet */}
      {showSignOff && (
        <div className="absolute inset-0 bg-black/50 flex items-end z-50">
          <div className="w-full bg-white rounded-t-3xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold" style={{ color: NAVY }}>Confirm Sign-Off</h3>
              <button onClick={() => setShowSignOff(false)}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="space-y-2 mb-4">
              {[
                { label: "Site",           value: "Tui Park Rose Garden" },
                { label: "Started",        value: "9:18am" },
                { label: "Time on site",   value: `${formatTime(START_ELAPSED)} (${isOverTime ? "over" : "under"} allocated)` },
                { label: "Tasks complete", value: `${done}/${total}` },
                { label: "Photos taken",   value: "3" },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-gray-400">{label}</span>
                  <span className="font-semibold text-gray-800">{value}</span>
                </div>
              ))}
            </div>
            <button
              className="w-full py-4 rounded-2xl text-white font-bold text-base shadow-lg"
              style={{ background: `linear-gradient(135deg, ${BRAND}, #0097b2)` }}
              onClick={() => setShowSignOff(false)}
            >
              Confirm & Submit
            </button>
            <p className="text-center text-[10px] text-gray-400 mt-2">Data will sync when connection is restored</p>
          </div>
        </div>
      )}
    </div>
  );
}
