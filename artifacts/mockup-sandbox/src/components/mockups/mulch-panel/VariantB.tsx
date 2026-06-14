import { useState } from "react";

const BRAND = "#00AECD";
const NAVY = "#0f2a36";
const PRODUCTIVE = 390;

const sampleJobs = [
  { id: "1", name: "Te Rauparaha Park", suburb: "Porirua City Centre", mins: 42 },
  { id: "2", name: "Cobham Court Reserve", suburb: "Porirua City Centre", mins: 35 },
  { id: "3", name: "Parumoana St Berm", suburb: "Cannons Creek", mins: 28 },
];

type ConflictMode = "none" | "overtime" | "push-all" | "push-individual";

function fmtMins(m: number) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? `${h}h ${min > 0 ? min + "m" : ""}`.trim() : `${min}m`;
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="text-[9px] font-bold tracking-widest uppercase text-gray-400">{label}</span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  );
}

export function VariantB() {
  const [conflict, setConflict] = useState<ConflictMode>("none");
  const [jobActions, setJobActions] = useState<Record<string, string>>({});

  const existing = 265;
  const added = 145;
  const total = existing + added;
  const over = total > PRODUCTIVE;
  const overage = total - PRODUCTIVE;

  return (
    <div className="min-h-screen bg-white flex items-start justify-center">
      <div className="w-full max-w-[420px]">

        {/* Slim top bar */}
        <div className="px-5 py-4 flex items-start justify-between border-b border-gray-100" style={{ background: NAVY }}>
          <div>
            <h2 className="text-base font-black text-white">Moana Road</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">Garden next door No. 88  ·  Mulching</p>
          </div>
          <button className="w-7 h-7 flex items-center justify-center rounded-full bg-white/10 text-white text-sm">✕</button>
        </div>

        <div className="px-5 py-4 space-y-4">

          {/* Mulch Details */}
          <Divider label="Mulch Details" />
          <div className="flex gap-3">
            <div className="flex-1 flex items-center gap-3 bg-amber-50 rounded-xl px-3.5 py-3 border border-amber-100">
              <div>
                <p className="text-[9px] font-bold text-amber-500 uppercase tracking-wide">Depth</p>
                <p className="text-lg font-black text-amber-700 leading-none">−31mm</p>
                <p className="text-[9px] text-amber-400 mt-0.5">threshold 50mm</p>
              </div>
            </div>
            <div className="flex-1 flex items-center gap-3 bg-gray-50 rounded-xl px-3.5 py-3 border border-gray-100">
              <div>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Volume</p>
                <p className="text-lg font-black text-gray-700 leading-none">4.83m³</p>
                <p className="text-[9px] text-gray-400 mt-0.5">Bark Mulch</p>
              </div>
            </div>
          </div>

          {/* Configure */}
          <Divider label="Configure" />
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-3">
              <label className="text-[10px] font-semibold text-gray-400 block mb-1">Team</label>
              <div className="w-full px-3 py-2.5 text-sm font-semibold border border-gray-200 rounded-xl text-gray-700 flex justify-between items-center">
                CBD <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-[10px] font-semibold text-gray-400 block mb-1">Date</label>
              <div className="px-3 py-2.5 text-sm font-semibold border border-gray-200 rounded-xl text-gray-700">18/06/2026</div>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-gray-400 block mb-1">Mins</label>
              <div className="px-3 py-2.5 text-sm font-semibold border border-gray-200 rounded-xl text-gray-700">145</div>
            </div>
          </div>

          {/* Capacity */}
          <Divider label="Capacity — CBD · Thu 18 Jun" />
          <div className="space-y-2.5">
            {/* Bar */}
            <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden flex">
              <div style={{ width: `${(existing / PRODUCTIVE) * 100}%`, background: "#94a3b8" }} className="h-full" />
              <div style={{ width: `${Math.min((added / PRODUCTIVE) * 100, 100 - (existing / PRODUCTIVE) * 100)}%`, background: over ? "#ef4444" : BRAND }} className="h-full" />
            </div>
            <div className="flex justify-between text-[10px] text-gray-500">
              <span className="flex gap-2">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block bg-slate-400" />{fmtMins(existing)} existing</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: over ? "#ef4444" : BRAND }} />+{fmtMins(added)} mulch</span>
              </span>
              <span className="font-bold" style={{ color: over ? "#dc2626" : "#16a34a" }}>{fmtMins(total)} / 6h 30m</span>
            </div>
          </div>

          {/* Conflict resolution */}
          {over && (
            <>
              <Divider label={`Conflict — ${fmtMins(overage)} over target`} />
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setConflict(c => c === "overtime" ? "none" : "overtime")}
                    className="py-2.5 px-3 rounded-xl border-2 text-xs font-bold text-left transition-all"
                    style={conflict === "overtime"
                      ? { borderColor: "#f97316", background: "#fff7ed", color: "#ea580c" }
                      : { borderColor: "#fed7aa", background: "white", color: "#9a3412" }}>
                    <div className="text-base mb-0.5">⏱</div>
                    Accept Overtime
                    <div className="text-[9px] font-normal opacity-70 mt-0.5">+{fmtMins(overage)} over</div>
                  </button>
                  <button onClick={() => setConflict(c => c === "push-all" ? "none" : "push-all")}
                    className="py-2.5 px-3 rounded-xl border-2 text-xs font-bold text-left transition-all"
                    style={conflict === "push-all"
                      ? { borderColor: BRAND, background: "#e6f9fd", color: "#0e7490" }
                      : { borderColor: "#b3ebf5", background: "white", color: "#0e7490" }}>
                    <div className="text-base mb-0.5">⏩</div>
                    Push Schedule
                    <div className="text-[9px] font-normal opacity-70 mt-0.5">Move tail to next day</div>
                  </button>
                </div>
                <button onClick={() => setConflict(c => c === "push-individual" ? "none" : "push-individual")}
                  className="w-full py-2.5 px-3 rounded-xl border-2 text-xs font-bold text-left transition-all flex items-center justify-between"
                  style={conflict === "push-individual"
                    ? { borderColor: "#7c3aed", background: "#f5f3ff", color: "#6d28d9" }
                    : { borderColor: "#ddd6fe", background: "white", color: "#5b21b6" }}>
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5"><span>⚙️</span> Manage Individual Jobs</div>
                    <div className="text-[9px] font-normal opacity-70">Push, defer or delete specific jobs from this day</div>
                  </div>
                  <svg className="w-4 h-4 flex-shrink-0 transition-transform ml-2" style={{ transform: conflict === "push-individual" ? "rotate(180deg)" : "none" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                </button>

                {conflict === "push-individual" && (
                  <div className="rounded-xl overflow-hidden border border-gray-100">
                    <div className="bg-gray-50 px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wide flex justify-between">
                      <span>CBD · 18 Jun</span><span>6h 20m scheduled</span>
                    </div>
                    {sampleJobs.map(job => {
                      const a = jobActions[job.id];
                      return (
                        <div key={job.id} className="border-t border-gray-50 bg-white px-3 py-2.5">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="text-[11px] font-semibold text-gray-800">{job.name}</p>
                              <p className="text-[10px] text-gray-400">{fmtMins(job.mins)} · {job.suburb}</p>
                            </div>
                            {a && a !== "none" && (
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                                style={{ background: a === "delete" ? "#fee2e2" : "#e6f9fd", color: a === "delete" ? "#dc2626" : BRAND }}>
                                {a === "push" ? "→ +1d" : a === "defer" ? "→ +3d" : "Deleted"}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-1.5">
                            {[["push", "+1d"], ["defer", "+3d"], ["delete", "Delete"]].map(([action, label]) => (
                              <button key={action} onClick={() => setJobActions(p => ({ ...p, [job.id]: p[job.id] === action ? "none" : action }))}
                                className="flex-1 py-1 rounded-lg text-[10px] font-bold border transition-all"
                                style={jobActions[job.id] === action
                                  ? { background: action === "delete" ? "#fee2e2" : "#e6f9fd", borderColor: action === "delete" ? "#fca5a5" : BRAND, color: action === "delete" ? "#dc2626" : BRAND }
                                  : { background: "#f8fafc", borderColor: "#e2e8f0", color: "#94a3b8" }}>
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Footer */}
          <div className="flex gap-2 pt-1 pb-2">
            <button className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600">Cancel</button>
            <button className="flex-2 flex-grow-[2] py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2"
              style={{ background: over && conflict === "none" ? "#94a3b8" : BRAND }}>
              Publish to Schedule
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
