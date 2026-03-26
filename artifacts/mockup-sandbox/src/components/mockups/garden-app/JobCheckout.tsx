import { useState } from "react";
import {
  ChevronLeft, Camera, CheckCircle2, Circle, Clock,
  WifiOff, AlertCircle, X, ImageIcon, ChevronDown, Send
} from "lucide-react";

const BRAND = "#00AECD";
const NAVY = "#0f2a36";

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

export function JobCheckout() {
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [showSignOff, setShowSignOff] = useState(false);

  const done = tasks.filter(t => t.status === "complete").length;
  const total = tasks.length;
  const progress = Math.round((done / total) * 100);

  const incompleteWithoutNote = tasks.filter(t => t.status === "incomplete" && !t.note.trim());
  const canSignOff = incompleteWithoutNote.length === 0 && tasks.every(t => t.status !== "pending");
  const hasPending = tasks.some(t => t.status === "pending");

  const toggleNote = (id: number) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, showNote: !t.showNote } : t));
  };

  const setNote = (id: number, note: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, note } : t));
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 font-sans" style={{ maxWidth: 390 }}>
      {/* Status bar */}
      <div className="h-10 flex items-center justify-between px-5 text-[11px] font-medium bg-white" style={{ color: NAVY }}>
        <span>9:41</span>
        <span className="flex items-center gap-1 text-amber-500">
          <WifiOff className="w-3.5 h-3.5" />Offline
        </span>
      </div>

      {/* Header */}
      <div className="bg-white border-b px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <button className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-gray-400 font-medium">Active Job</p>
            <p className="text-sm font-bold truncate" style={{ color: NAVY }}>Tui Park Rose Garden</p>
          </div>
          {/* Live timer */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl" style={{ background: BRAND + "18" }}>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: BRAND }} />
            <span className="text-sm font-bold tabular-nums" style={{ color: BRAND }}>00:23:45</span>
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
          <span className="font-medium">{done} of {total} tasks complete</span>
          <span className="font-bold" style={{ color: BRAND }}>{progress}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${BRAND}, #0097b2)` }}
          />
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {tasks.map((task) => {
          const isComplete = task.status === "complete";
          const isIncomplete = task.status === "incomplete";
          const isPending = task.status === "pending";

          return (
            <div
              key={task.id}
              className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
                isComplete ? "border-green-100" : isIncomplete ? "border-amber-200" : "border-gray-100"
              }`}
            >
              <div className="flex items-start gap-3 p-3">
                {/* Status icon */}
                <div className="flex-shrink-0 mt-0.5">
                  {isComplete
                    ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                    : isIncomplete
                    ? <AlertCircle className="w-5 h-5 text-amber-500" />
                    : <Circle className="w-5 h-5 text-gray-300" />
                  }
                </div>

                {/* Task info */}
                <div className="flex-1 min-w-0">
                  <p className={`text-[12px] leading-snug font-medium ${isComplete ? "line-through text-gray-400" : isPending ? "text-gray-500" : "text-gray-800"}`}>
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

                {/* Photo thumbnail */}
                <PhotoThumb hasPhoto={task.hasPhoto} />
              </div>

              {/* Expandable note for incomplete */}
              {isIncomplete && task.showNote && (
                <div className="px-3 pb-3 border-t border-amber-100 pt-2">
                  <p className="text-[10px] text-amber-600 font-semibold mb-1.5 uppercase tracking-wide">Why is this task incomplete?</p>
                  <textarea
                    value={task.note}
                    onChange={e => setNote(task.id, e.target.value)}
                    placeholder="e.g. Mulch supply not available on site today. Scheduled for delivery Friday."
                    className="w-full text-[12px] rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 resize-none focus:outline-none focus:ring-2 text-gray-700 placeholder-gray-400"
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
      <div className="px-4 py-4 bg-white border-t space-y-2">
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
          disabled={!canSignOff && !hasPending}
          onClick={() => setShowSignOff(true)}
          className={`w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all ${
            canSignOff
              ? "text-white shadow-lg"
              : "text-gray-300 bg-gray-100 cursor-not-allowed"
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

      {/* Sign-off confirmation overlay */}
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
                { label: "Site", value: "Tui Park Rose Garden" },
                { label: "Started", value: "9:18am" },
                { label: "Duration", value: "23 min 45 sec" },
                { label: "Tasks complete", value: `${done}/${total}` },
                { label: "Photos taken", value: "3" },
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
