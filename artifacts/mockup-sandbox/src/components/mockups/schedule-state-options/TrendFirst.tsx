import { Activity, ArrowDownRight, ArrowUpRight, Check, ChevronRight, Minus, Target } from "lucide-react";
import "./_group.css";

const weeks = [
  { label: "Week 18", short: "W18", pct: 84, state: "On Target" },
  { label: "Week 19", short: "W19", pct: 71, state: "Behind" },
  { label: "Week 20", short: "W20", pct: 86, state: "On Target" },
  { label: "Week 21", short: "W21", pct: 78, state: "On Target", current: true },
];

const BRAND = "#00AECD";
const NAVY = "#0f2a36";
const INK = "#183b49";
const ORANGE = "#d97706";

function stateTone(state: string) {
  return state === "Behind"
    ? { color: ORANGE, soft: "#fff5df", label: "Below target" }
    : { color: BRAND, soft: "#e8f8fb", label: "Within target" };
}

export function TrendFirst() {
  const start = weeks[0].pct;
  const current = weeks[3].pct;
  const delta = current - start;
  const points = weeks.map((week, index) => {
    const x = 16 + index * 90;
    const y = 126 - ((week.pct - 65) / 25) * 82;
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="schedule-state-frame" style={{ fontFamily: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif" }}>
      <main className="mx-auto w-full max-w-[560px]">
        <section className="overflow-hidden rounded-[24px] border border-[#cde5e9] bg-[#fbfdfd] shadow-[0_18px_45px_rgba(15,42,54,0.10)]">
          <div className="relative bg-[#eaf7f8] px-6 pb-5 pt-6">
            <div className="absolute right-0 top-0 h-28 w-28 rounded-bl-[70px] bg-[#d5f0f2]" />
            <div className="relative flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#367384]">
                  <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                  Operational pulse
                </div>
                <h2 className="text-[20px] font-extrabold tracking-[-0.03em]" style={{ color: NAVY }}>
                  Schedule State
                </h2>
                <p className="mt-1 text-[12px] font-medium text-[#52707a]">Rolling 4-week completion rate</p>
              </div>
              <div className="relative flex shrink-0 items-center gap-2 rounded-full border border-[#a7dce2] bg-[#f9ffff] px-3 py-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#d9f3f5]">
                  <Check className="h-3.5 w-3.5 text-[#087d93]" strokeWidth={3} aria-hidden="true" />
                </span>
                <span className="text-[12px] font-extrabold text-[#087d93]">On Target</span>
              </div>
            </div>

            <div className="relative mt-7 flex items-end justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#52707a]">Current week</p>
                <p className="mt-1 text-[42px] font-extrabold leading-none tracking-[-0.06em]" style={{ color: NAVY }}>
                  {current}<span className="ml-1 text-[22px] text-[#4e7c86]">%</span>
                </p>
              </div>
              <div className="mb-1 flex items-center gap-1.5 rounded-lg bg-[#dff4e6] px-2.5 py-1.5 text-[11px] font-extrabold text-[#176b3c]">
                {delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />}
                {Math.abs(delta)} pts vs W18
              </div>
            </div>
          </div>

          <div className="px-6 pb-6 pt-5">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-[13px] font-extrabold" style={{ color: INK }}>The trend is recovering</p>
                <p className="mt-0.5 text-[11px] font-medium text-[#6b858c]">One dip, then two weeks above the line</p>
              </div>
              <span className="rounded-md bg-[#f1f5f5] px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#607b83]">
                Target 72%
              </span>
            </div>

            <div className="relative mt-5 rounded-2xl border border-[#e0ebec] bg-[#f8fbfb] px-3 pb-2 pt-3">
              <div className="pointer-events-none absolute left-3 right-3 top-[52%] border-t border-dashed border-[#b7cdd0]" />
              <div className="pointer-events-none absolute left-3 top-[calc(52%-10px)] rounded bg-[#f8fbfb] px-1 text-[9px] font-bold text-[#799298]">
                target 72%
              </div>
              <svg viewBox="0 0 286 154" className="h-[154px] w-full overflow-visible" role="img" aria-label="Completion rate rises from 84 percent to 86 percent, dips to 71 percent in week 19, then ends at 78 percent in week 21">
                <defs>
                  <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#00AECD" stopOpacity="0.20" />
                    <stop offset="100%" stopColor="#00AECD" stopOpacity="0.01" />
                  </linearGradient>
                </defs>
                <path d={`M16 ${126 - ((weeks[0].pct - 65) / 25) * 82} ${points.slice(points.indexOf(" "))} L286 145 L16 145 Z`} fill="url(#trendFill)" />
                <polyline points={points} fill="none" stroke={BRAND} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                {weeks.map((week, index) => {
                  const x = 16 + index * 90;
                  const y = 126 - ((week.pct - 65) / 25) * 82;
                  const tone = stateTone(week.state);
                  return (
                    <g key={week.label} className="transition-transform duration-200 hover:scale-110" style={{ transformOrigin: `${x}px ${y}px` }}>
                      {week.current && <circle cx={x} cy={y} r="12" fill="#00AECD" opacity="0.12" />}
                      <circle cx={x} cy={y} r={week.current ? "6.5" : "5.5"} fill="#fbfdfd" stroke={week.state === "Behind" ? ORANGE : BRAND} strokeWidth="3" />
                      <text x={x} y={y - 14} textAnchor="middle" fill={tone.color} fontSize="12" fontWeight="800">{week.pct}%</text>
                      <text x={x} y="151" textAnchor="middle" fill="#66828a" fontSize="10" fontWeight="700">{week.short}</text>
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="mt-4 grid grid-cols-4 gap-2">
              {weeks.map((week) => {
                const tone = stateTone(week.state);
                return (
                  <div key={week.label} className={`rounded-xl border px-2.5 py-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm ${week.current ? "border-[#8fd4dc] bg-[#effbfc]" : "border-[#e4edef] bg-white"}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-[#789198]">{week.short}</span>
                      {week.current && <span className="h-1.5 w-1.5 rounded-full bg-[#00AECD]" aria-label="Current week" />}
                    </div>
                    <p className="mt-1 text-[18px] font-extrabold tracking-[-0.04em]" style={{ color: NAVY }}>{week.pct}%</p>
                    <p className="mt-0.5 text-[9px] font-extrabold" style={{ color: tone.color }}>{tone.label}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex items-start gap-3 rounded-xl border border-[#d8e9eb] bg-[#f3f9f9] p-3">
              <Target className="mt-0.5 h-4 w-4 shrink-0 text-[#087d93]" aria-hidden="true" />
              <p className="text-[11px] font-medium leading-relaxed text-[#4e6e77]">
                <span className="font-extrabold text-[#244d59]">Read: intervene only if the next week slips.</span>{" "}
                Current performance is 6 points above the 72% target, despite last week’s dip.
              </p>
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[#77949b]" aria-hidden="true" />
            </div>

            <div className="mt-4 flex items-center gap-4 border-t border-[#e8eff0] pt-3 text-[10px] font-bold text-[#718a91]">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#15803d]" />Ahead · 90%+</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#00AECD]" />On Target · 72–89%</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#d97706]" />Behind · &lt;72%</span>
            </div>
          </div>
        </section>
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-[#81969b]">
          <Minus className="h-3.5 w-3.5" aria-hidden="true" />
          Trend First · foregrounds momentum before exact figures
        </div>
      </main>
    </div>
  );
}