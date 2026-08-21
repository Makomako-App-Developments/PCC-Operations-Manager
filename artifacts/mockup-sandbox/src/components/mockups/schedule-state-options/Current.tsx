import { Minus, Target } from "lucide-react";
import "./_group.css";

const BRAND = "#00AECD";
const NAVY = "#0f2a36";
const weeks = [
  { label: "Wk 18", pct: 84, state: "on-target", current: false },
  { label: "Wk 19", pct: 71, state: "behind", current: false },
  { label: "Wk 20", pct: 86, state: "on-target", current: false },
  { label: "Wk 21", pct: 78, state: "on-target", current: true },
];

const stateColor: Record<string, string> = { ahead: "#22c55e", "on-target": BRAND, behind: "#f97316" };
const stateLabel: Record<string, string> = { ahead: "Ahead", "on-target": "On Target", behind: "Behind" };

export function Current() {
  const overallState = "on-target";

  return (
    <div className="schedule-state-frame">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold" style={{ color: NAVY }}>Schedule State</h3>
            <p className="text-[11px] text-gray-400">Rolling 4-week completion rate</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ background: `${stateColor[overallState]}18` }}>
            <Target className="w-3.5 h-3.5" style={{ color: stateColor[overallState] }} />
            <span className="text-[12px] font-bold" style={{ color: stateColor[overallState] }}>{stateLabel[overallState]}</span>
          </div>
        </div>
        <div className="flex items-end gap-3 h-24">
          {weeks.map((week) => (
            <div key={week.label} className="flex-1 flex flex-col items-center gap-1.5">
              <span className="text-[10px] font-bold" style={{ color: stateColor[week.state] }}>{week.pct}%</span>
              <div className="w-full rounded-t-lg transition-all" style={{ height: `${week.pct}%`, background: week.current ? BRAND : `${stateColor[week.state]}40` }} />
              <span className="text-[10px] font-semibold text-gray-400">{week.label}</span>
              <span className="text-[9px] font-medium" style={{ color: stateColor[week.state] }}>{stateLabel[week.state]}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-4">
          {([["#22c55e", "Ahead"], [BRAND, "On Target"], ["#f97316", "Behind"]] as [string, string][]).map(([color, label]) => (
            <span key={label} className="flex items-center gap-1 text-[10px] text-gray-400">
              <span className="w-2 h-2 rounded-full" style={{ background: color }} />{label}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
        <Minus className="w-3.5 h-3.5" /> Current dashboard card
      </div>
    </div>
  );
}