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

function CapBar({ existing, added, total }: { existing: number; added: number; total: number }) {
  const pctExisting = Math.min(100, (existing / PRODUCTIVE) * 100);
  const pctAdded = Math.min(100, (added / PRODUCTIVE) * 100);
  const over = total > PRODUCTIVE;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-semibold text-gray-500">{over ? "⚠ Over target" : "Within target"}</span>
        <span className="text-[11px] font-bold" style={{ color: over ? "#dc2626" : "#16a34a" }}>
          {fmtMins(total)} / 6h 30m target
        </span>
      </div>
      <div className="h-3 rounded-full bg-gray-100 overflow-hidden flex">
        <div className="h-full rounded-l-full transition-all" style={{ width: `${pctExisting}%`, background: "#94a3b8" }} />
        <div className="h-full transition-all" style={{ width: `${Math.min(pctAdded, 100 - pctExisting)}%`, background: over ? "#ef4444" : BRAND }} />
      </div>
      <div className="flex gap-2 text-[10px] text-gray-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block bg-slate-400" />Existing {fmtMins(existing)}</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: over ? "#ef4444" : BRAND }} />Mulch +{fmtMins(added)}</span>
      </div>
    </div>
  );
}

function SectionCard({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black text-white flex-shrink-0"
          style={{ background: BRAND }}>
          {num}
        </div>
        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function VariantA() {
  const [conflict, setConflict] = useState<ConflictMode>("none");
  const [jobActions, setJobActions] = useState<Record<string, "push" | "defer" | "delete" | "none">>({});

  const existing = 265;
  const added = 145;
  const total = existing + added;
  const over = total > PRODUCTIVE;

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4">
      <div className="w-full max-w-[420px] flex flex-col gap-3">

        {/* Header */}
        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: NAVY }}>
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-teal-400 mb-1">Review & Schedule</p>
                <h2 className="text-lg font-black text-white leading-tight">Moana Road</h2>
                <p className="text-[12px] text-gray-400 mt-0.5">Garden next door No. 88</p>
              </div>
              <div className="text-right">
                <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold" style={{ background: "#1a3a4a", color: "#5dd8ef" }}>Mulching</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 1 — Mulch Details */}
        <SectionCard num={1} title="Mulch Details">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
              <p className="text-[9px] font-bold text-amber-600 uppercase tracking-wider mb-1">Depth Reading</p>
              <p className="text-xl font-black text-amber-700">−31mm</p>
              <p className="text-[9px] text-amber-500 mt-0.5">Threshold 50mm</p>
            </div>
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">To Apply</p>
              <p className="text-xl font-black text-gray-700">4.83m³</p>
              <p className="text-[9px] text-gray-400 mt-0.5">Bark Mulch</p>
            </div>
          </div>
          <p className="mt-2.5 text-[10px] text-gray-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-300 inline-block" />
            Projected visit date: 18 Jun 2026
          </p>
        </SectionCard>

        {/* Section 2 — Configure */}
        <SectionCard num={2} title="Configure">
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-semibold text-gray-400 block mb-1.5">Team</label>
              <div className="w-full px-3 py-2.5 text-sm font-semibold border border-gray-200 rounded-xl bg-white text-gray-700 flex items-center justify-between">
                CBD
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[10px] font-semibold text-gray-400 block mb-1.5">Date</label>
                <div className="px-3 py-2.5 text-sm font-semibold border border-gray-200 rounded-xl bg-white text-gray-700">18/06/2026</div>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-400 block mb-1.5">Duration (mins)</label>
                <div className="px-3 py-2.5 text-sm font-semibold border border-gray-200 rounded-xl bg-white text-gray-700">145</div>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Section 3 — Capacity */}
        <SectionCard num={3} title="Capacity — CBD · Thu 18 Jun">
          <div className="space-y-3">
            <CapBar existing={existing} added={added} total={total} />
            <div className="grid grid-cols-3 gap-2 text-center">
              {[["Existing", fmtMins(existing), "text-gray-700"], ["+ Mulch", `+${fmtMins(added)}`, "text-blue-600"], ["= Total", fmtMins(total), over ? "text-red-600" : "text-green-600"]].map(([l, v, c]) => (
                <div key={l} className="bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                  <p className="text-[9px] text-gray-400 mb-0.5">{l}</p>
                  <p className={`text-sm font-black ${c}`}>{v}</p>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* Section 4 — Conflict Resolution */}
        {over && (
          <SectionCard num={4} title="Resolve Conflict">
            <div className="space-y-2">
              {/* Option 1 */}
              <button onClick={() => setConflict(c => c === "overtime" ? "none" : "overtime")}
                className="w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left"
                style={conflict === "overtime"
                  ? { borderColor: "#f97316", background: "#fff7ed" }
                  : { borderColor: "#fed7aa", background: "white" }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm"
                  style={{ background: conflict === "overtime" ? "#f97316" : "#fff7ed", color: conflict === "overtime" ? "white" : "#f97316" }}>1</div>
                <div>
                  <p className="text-xs font-bold text-gray-700">Accept Overtime</p>
                  <p className="text-[10px] text-gray-400">+{fmtMins(total - PRODUCTIVE)} over daily target</p>
                </div>
                {conflict === "overtime" && <span className="ml-auto text-xs font-bold text-orange-500">✓</span>}
              </button>

              {/* Option 2 */}
              <button onClick={() => setConflict(c => c === "push-all" ? "none" : "push-all")}
                className="w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left"
                style={conflict === "push-all"
                  ? { borderColor: BRAND, background: "#e6f9fd" }
                  : { borderColor: "#b3ebf5", background: "white" }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm"
                  style={{ background: conflict === "push-all" ? BRAND : "#e6f9fd", color: conflict === "push-all" ? "white" : BRAND }}>2</div>
                <div>
                  <p className="text-xs font-bold text-gray-700">Push Whole Schedule</p>
                  <p className="text-[10px] text-gray-400">Move tail of route to next working day</p>
                </div>
                {conflict === "push-all" && <span className="ml-auto text-xs font-bold" style={{ color: BRAND }}>✓</span>}
              </button>

              {/* Option 3 */}
              <button onClick={() => setConflict(c => c === "push-individual" ? "none" : "push-individual")}
                className="w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left"
                style={conflict === "push-individual"
                  ? { borderColor: "#7c3aed", background: "#f5f3ff" }
                  : { borderColor: "#ddd6fe", background: "white" }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm"
                  style={{ background: conflict === "push-individual" ? "#7c3aed" : "#f5f3ff", color: conflict === "push-individual" ? "white" : "#7c3aed" }}>3</div>
                <div>
                  <p className="text-xs font-bold text-gray-700">Manage Individual Jobs</p>
                  <p className="text-[10px] text-gray-400">Push, defer or delete specific jobs</p>
                </div>
                <svg className="ml-auto w-4 h-4 text-gray-300 transition-transform" style={{ transform: conflict === "push-individual" ? "rotate(180deg)" : "none" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>

              {conflict === "push-individual" && (
                <div className="rounded-xl border border-gray-100 overflow-hidden mt-1">
                  <div className="px-3 py-2 bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider">CBD — 18 Jun (3 jobs)</div>
                  {sampleJobs.map(job => (
                    <div key={job.id} className="px-3 py-3 border-t border-gray-50 bg-white">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-xs font-semibold text-gray-800">{job.name}</p>
                          <p className="text-[10px] text-gray-400">{job.suburb} · {fmtMins(job.mins)}</p>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        {["push", "defer", "delete"].map(a => (
                          <button key={a} onClick={() => setJobActions(prev => ({ ...prev, [job.id]: jobActions[job.id] === a ? "none" : a as any }))}
                            className="flex-1 py-1.5 rounded-lg text-[10px] font-bold border transition-all capitalize"
                            style={jobActions[job.id] === a
                              ? { background: a === "delete" ? "#fee2e2" : "#e6f9fd", borderColor: a === "delete" ? "#fca5a5" : BRAND, color: a === "delete" ? "#dc2626" : BRAND }
                              : { background: "white", borderColor: "#e5e7eb", color: "#6b7280" }}>
                            {a === "push" ? "→+1d" : a === "defer" ? "→+3d" : "Delete"}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SectionCard>
        )}

        {/* Footer buttons */}
        <div className="grid grid-cols-2 gap-2 pb-4">
          <button className="py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 bg-white">Cancel</button>
          <button className="py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2"
            style={{ background: over && conflict === "none" ? "#94a3b8" : BRAND }}>
            Publish to Schedule
          </button>
        </div>
      </div>
    </div>
  );
}
