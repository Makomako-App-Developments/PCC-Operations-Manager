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

function SectionHeader({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <div className="px-5 py-2.5 flex items-center gap-2" style={{ background: accent ? BRAND : NAVY }}>
      <span className="text-[10px] font-bold uppercase tracking-widest text-white/80">{label}</span>
    </div>
  );
}

export function VariantC() {
  const [conflict, setConflict] = useState<ConflictMode>("none");
  const [jobActions, setJobActions] = useState<Record<string, string>>({});

  const existing = 265;
  const added = 145;
  const total = existing + added;
  const over = total > PRODUCTIVE;
  const overage = total - PRODUCTIVE;

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center">
      <div className="w-full max-w-[420px] flex flex-col shadow-xl overflow-hidden rounded-2xl border border-gray-200">

        {/* Hero */}
        <div className="px-5 py-5 flex items-start justify-between" style={{ background: NAVY }}>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest" style={{ background: BRAND, color: "white" }}>Mulching</span>
              <span className="text-[9px] text-gray-500">Draft</span>
            </div>
            <h2 className="text-xl font-black text-white leading-tight">Moana Road</h2>
            <p className="text-[12px] text-gray-400 mt-1">Garden next door No. 88</p>
          </div>
          <button className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}>✕</button>
        </div>

        {/* Mulch Details */}
        <SectionHeader label="Mulch Details" />
        <div className="px-5 py-4 bg-white flex gap-3">
          <div className="flex-1 rounded-xl border-2 border-amber-200 bg-amber-50 p-3.5">
            <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-1.5">Current Depth</p>
            <p className="text-2xl font-black text-amber-600 leading-none">−31mm</p>
            <p className="text-[10px] text-amber-400 mt-1.5">Threshold: 50mm · deficit 19mm</p>
          </div>
          <div className="flex-1 rounded-xl border-2 border-gray-200 bg-white p-3.5">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">To Apply</p>
            <p className="text-2xl font-black text-gray-700 leading-none">4.83m³</p>
            <p className="text-[10px] text-gray-400 mt-1.5">Bark Mulch · Projected 18 Jun</p>
          </div>
        </div>

        {/* Configure */}
        <SectionHeader label="Configure" />
        <div className="px-5 py-4 bg-white space-y-3">
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Team</label>
            <div className="w-full px-4 py-3 border-2 border-gray-100 rounded-xl text-sm font-bold text-gray-700 flex justify-between items-center bg-white hover:border-gray-200">
              CBD
              <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7"/></svg>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Date</label>
              <div className="px-4 py-3 border-2 border-gray-100 rounded-xl text-sm font-bold text-gray-700">18/06/2026</div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Duration (mins)</label>
              <div className="px-4 py-3 border-2 border-gray-100 rounded-xl text-sm font-bold text-gray-700">145</div>
            </div>
          </div>
        </div>

        {/* Capacity */}
        <SectionHeader label="Capacity — CBD · Thu 18 Jun" accent />
        <div className="px-5 py-4 bg-white space-y-3">
          {/* Bar */}
          <div className="h-4 rounded-full bg-gray-100 overflow-hidden flex">
            <div style={{ width: `${(existing / PRODUCTIVE) * 100}%`, background: "#94a3b8" }} className="h-full" />
            <div style={{ width: `${Math.min((added / PRODUCTIVE) * 100, 100 - (existing / PRODUCTIVE) * 100)}%`, background: over ? "#ef4444" : BRAND }} className="h-full" />
            {over && <div className="h-full flex-1 bg-red-200/50" />}
          </div>
          <div className="flex justify-between items-center">
            <div className="flex gap-3 text-[10px] text-gray-400">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-slate-400" />{fmtMins(existing)}</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: over ? "#ef4444" : BRAND }} />+{fmtMins(added)}</span>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-black" style={{ color: over ? "#dc2626" : "#16a34a" }}>{fmtMins(total)}</span>
              <span className="text-[10px] text-gray-400"> / 6h 30m</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1">
            {[["Existing", fmtMins(existing), "#374151"], [`+ Mulch`, `+${fmtMins(added)}`, BRAND], ["Total", fmtMins(total), over ? "#dc2626" : "#16a34a"]].map(([l, v, c]) => (
              <div key={l} className="text-center p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                <p className="text-[9px] text-gray-400 mb-0.5">{l}</p>
                <p className="text-sm font-black" style={{ color: c }}>{v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Conflict Resolution */}
        {over && (
          <>
            <SectionHeader label={`Resolve Conflict — ${fmtMins(overage)} over target`} />
            <div className="px-5 py-4 bg-white space-y-2">

              {/* Option 1 */}
              <button onClick={() => setConflict(c => c === "overtime" ? "none" : "overtime")}
                className="w-full p-4 rounded-xl border-2 transition-all flex items-center gap-4"
                style={conflict === "overtime"
                  ? { borderColor: "#f97316", background: "#fff7ed" }
                  : { borderColor: "#e5e7eb", background: "white" }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg"
                  style={{ background: conflict === "overtime" ? "#f97316" : "#fff7ed" }}>⏱</div>
                <div className="text-left">
                  <p className="text-sm font-bold text-gray-800">Accept Overtime</p>
                  <p className="text-[11px] text-gray-400">Proceed {fmtMins(overage)} over the daily target</p>
                </div>
                <div className="ml-auto w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                  style={conflict === "overtime" ? { borderColor: "#f97316", background: "#f97316" } : { borderColor: "#d1d5db" }}>
                  {conflict === "overtime" && <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>}
                </div>
              </button>

              {/* Option 2 */}
              <button onClick={() => setConflict(c => c === "push-all" ? "none" : "push-all")}
                className="w-full p-4 rounded-xl border-2 transition-all flex items-center gap-4"
                style={conflict === "push-all"
                  ? { borderColor: BRAND, background: "#e6f9fd" }
                  : { borderColor: "#e5e7eb", background: "white" }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg"
                  style={{ background: conflict === "push-all" ? "#e6f9fd" : "#f8fafc" }}>⏩</div>
                <div className="text-left">
                  <p className="text-sm font-bold text-gray-800">Push Whole Schedule</p>
                  <p className="text-[11px] text-gray-400">Move tail of route to next working day</p>
                </div>
                <div className="ml-auto w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                  style={conflict === "push-all" ? { borderColor: BRAND, background: BRAND } : { borderColor: "#d1d5db" }}>
                  {conflict === "push-all" && <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>}
                </div>
              </button>

              {/* Option 3 */}
              <button onClick={() => setConflict(c => c === "push-individual" ? "none" : "push-individual")}
                className="w-full p-4 rounded-xl border-2 transition-all flex items-center gap-4"
                style={conflict === "push-individual"
                  ? { borderColor: "#7c3aed", background: "#f5f3ff" }
                  : { borderColor: "#e5e7eb", background: "white" }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg"
                  style={{ background: conflict === "push-individual" ? "#f5f3ff" : "#f8fafc" }}>⚙️</div>
                <div className="text-left">
                  <p className="text-sm font-bold text-gray-800">Manage Individual Jobs</p>
                  <p className="text-[11px] text-gray-400">Push, defer or delete specific jobs</p>
                </div>
                <svg className="ml-auto w-4 h-4 text-gray-300 flex-shrink-0 transition-transform"
                  style={{ transform: conflict === "push-individual" ? "rotate(180deg)" : "none" }}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
              </button>

              {conflict === "push-individual" && (
                <div className="rounded-xl overflow-hidden border-2 border-violet-200">
                  <div className="px-4 py-2.5 flex justify-between items-center" style={{ background: "#7c3aed" }}>
                    <span className="text-[10px] font-bold text-white uppercase tracking-wider">CBD · 18 Jun · 3 jobs</span>
                    <span className="text-[10px] font-bold text-violet-200">6h 20m scheduled</span>
                  </div>
                  {sampleJobs.map((job, i) => {
                    const a = jobActions[job.id];
                    return (
                      <div key={job.id} className={`px-4 py-3 ${i > 0 ? "border-t border-violet-100" : ""}`}
                        style={{ background: a && a !== "none" ? "#faf5ff" : "white" }}>
                        <div className="flex items-center justify-between mb-2.5">
                          <div>
                            <p className="text-[12px] font-bold text-gray-800">{job.name}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">{job.suburb} · {fmtMins(job.mins)}</p>
                          </div>
                          {a && a !== "none" && (
                            <span className="text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-wide"
                              style={a === "delete" ? { background: "#fee2e2", color: "#dc2626" } : { background: "#ede9fe", color: "#7c3aed" }}>
                              {a === "push" ? "→ +1d" : a === "defer" ? "→ +3d" : "✕ Removed"}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {[["push", "Push +1d"], ["defer", "Defer +3d"], ["delete", "Delete"]].map(([action, label]) => (
                            <button key={action}
                              onClick={() => setJobActions(p => ({ ...p, [job.id]: p[job.id] === action ? "none" : action }))}
                              className="py-1.5 rounded-lg text-[10px] font-bold border-2 transition-all"
                              style={jobActions[job.id] === action
                                ? action === "delete"
                                  ? { background: "#fee2e2", borderColor: "#fca5a5", color: "#dc2626" }
                                  : { background: "#ede9fe", borderColor: "#c4b5fd", color: "#7c3aed" }
                                : { background: "white", borderColor: "#e5e7eb", color: "#9ca3af" }}>
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
        <div className="px-5 py-4 grid grid-cols-3 gap-2 border-t border-gray-100 bg-white">
          <button className="py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500">Cancel</button>
          <button className="col-span-2 py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2"
            style={{ background: over && conflict === "none" ? "#94a3b8" : NAVY }}>
            Publish to Schedule
          </button>
        </div>
      </div>
    </div>
  );
}
