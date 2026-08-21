import { useState } from "react";
import { ArrowRight, CalendarDays, Check, ChevronRight, Minus, Target, TrendingUp } from "lucide-react";
import "./_group.css";

const BRAND = "#00AECD";
const NAVY = "#0f2a36";
const PALE = "#f5f7f9";

const weeks = [
  { label: "Week 18", short: "W18", pct: 84, state: "On Target", tone: "teal", note: "Strong opening" },
  { label: "Week 19", short: "W19", pct: 71, state: "Behind", tone: "orange", note: "One point under" },
  { label: "Week 20", short: "W20", pct: 86, state: "On Target", tone: "teal", note: "Recovered quickly" },
  { label: "Week 21", short: "W21", pct: 78, state: "On Target", tone: "current", note: "Current week" },
] as const;

const toneStyles = {
  teal: { ink: BRAND, fill: "#d8f3f7", soft: "#eefbfd" },
  orange: { ink: "#d66518", fill: "#fbe3d2", soft: "#fff8f2" },
  current: { ink: NAVY, fill: "#c7e9ed", soft: "#eefbfc" },
};

export function CalendarRhythm() {
  const [activeWeek, setActiveWeek] = useState(3);
  const current = weeks[activeWeek];

  return (
    <main className="schedule-state-frame" style={{ background: PALE, color: NAVY }}>
      <section
        className="mx-auto w-full max-w-[720px] overflow-hidden rounded-[26px] border border-[#dce8eb] bg-white shadow-[0_18px_50px_rgba(15,42,54,0.10)]"
        aria-labelledby="schedule-title"
      >
        <div className="relative overflow-hidden bg-[#e9f7f8] px-6 pb-6 pt-6 sm:px-8">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full border-[28px] border-white/45" />
          <div className="pointer-events-none absolute -bottom-24 right-24 h-40 w-40 rounded-full border-[18px] border-[#b9e7eb]/50" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#4c7881]">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                Schedule state
              </div>
              <h1 id="schedule-title" className="font-['Plus_Jakarta_Sans'] text-[22px] font-extrabold tracking-[-0.04em] text-[#0f2a36] sm:text-[26px]">
                A steady rhythm, with room to recover
              </h1>
              <p className="mt-2 max-w-[430px] text-[12px] leading-relaxed text-[#42656e]">
                Rolling 4-week completion rate. Compare each week to the 72% target line.
              </p>
            </div>
            <div className="hidden shrink-0 rounded-2xl border border-[#a8dce2] bg-white/75 px-3 py-2 text-right sm:block">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#5a7c83]">Target</p>
              <p className="mt-0.5 text-lg font-black text-[#0f2a36]">72%</p>
            </div>
          </div>

          <div className="relative mt-6 flex items-center gap-3 rounded-2xl border border-white/80 bg-white/70 p-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0f2a36] text-white">
              <Target className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#5a7c83]">Current state</p>
              <p className="mt-0.5 text-sm font-extrabold text-[#0f2a36]">
                On Target <span className="font-medium text-[#54747b]">· Week 21 is 6 points above target</span>
              </p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#d8f3f7] text-[#087e91]">
              <TrendingUp className="h-5 w-5" aria-hidden="true" />
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 pt-6 sm:px-8">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.17em] text-[#789198]">The last four weeks</p>
              <p className="mt-1 text-sm font-bold text-[#0f2a36]">Recovery is visible after the dip</p>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#789198]">
              <span className="h-2 w-2 rounded-full bg-[#d66518]" /> under target
            </div>
          </div>

          <div className="relative grid grid-cols-4 gap-2 sm:gap-3" role="list" aria-label="Weekly completion rates">
            <div className="pointer-events-none absolute left-0 right-0 top-[106px] border-t border-dashed border-[#9eb9bf]" aria-hidden="true" />
            <div className="pointer-events-none absolute left-0 right-0 top-[82px] border-t border-dashed border-[#b6d1d5]" aria-hidden="true" />
            <span className="pointer-events-none absolute -top-4 right-0 text-[9px] font-bold text-[#789198]">72% target</span>
            {weeks.map((week, index) => {
              const styles = toneStyles[week.tone];
              const isActive = activeWeek === index;
              return (
                <button
                  key={week.label}
                  type="button"
                  role="listitem"
                  onClick={() => setActiveWeek(index)}
                  aria-pressed={isActive}
                  aria-label={`${week.label}, ${week.pct} percent, ${week.state}`}
                  className="group relative z-[1] rounded-2xl border p-2 text-left transition-transform duration-200 hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-[#00AECD] focus:ring-offset-2 sm:p-3"
                  style={{
                    borderColor: isActive ? styles.ink : "#e3ecee",
                    background: isActive ? styles.soft : "#fbfcfc",
                    boxShadow: isActive ? `0 8px 20px ${styles.ink}18` : "none",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black tracking-wide text-[#66848a]">{week.short}</span>
                    {isActive && <Check className="h-3.5 w-3.5" style={{ color: styles.ink }} aria-hidden="true" />}
                  </div>
                  <div className="relative mt-3 h-[112px]">
                    <div className="absolute bottom-0 left-0 right-0 h-[72%] rounded-xl bg-[#edf3f4]" />
                    <div
                      className="absolute bottom-0 left-0 right-0 rounded-xl transition-all duration-500 group-hover:opacity-90"
                      style={{ height: `${week.pct}%`, background: styles.fill }}
                    />
                    <span className="absolute bottom-3 left-0 right-0 text-center font-['Space_Mono'] text-[21px] font-bold" style={{ color: styles.ink }}>
                      {week.pct}%
                    </span>
                  </div>
                  <p className="mt-3 truncate text-[10px] font-bold text-[#0f2a36]">{week.label}</p>
                  <p className="mt-1 truncate text-[9px] font-bold" style={{ color: styles.ink }}>{week.state}</p>
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex items-center justify-between rounded-2xl bg-[#f5f8f8] px-4 py-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#789198]">Selected week</p>
              <p className="mt-1 truncate text-xs font-bold text-[#0f2a36]">
                {current.label}: {current.note}
              </p>
            </div>
            <div className="ml-3 flex items-center gap-2 text-[10px] font-bold text-[#4d7078]">
              <span className="font-['Space_Mono'] text-sm text-[#0f2a36]">{current.pct - 72 >= 0 ? "+" : ""}{current.pct - 72} pts</span>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-[#e8eff0] pt-4">
            <div className="flex items-center gap-2 text-[10px] text-[#789198]">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#d8f3f7] text-[#087e91]"><Check className="h-3 w-3" aria-hidden="true" /></span>
              <span><strong className="text-[#0f2a36]">On Target</strong> means 72–89%</span>
            </div>
            <span className="hidden items-center gap-1 text-[10px] font-bold text-[#087e91] sm:flex">
              4-week view <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </span>
          </div>
        </div>
      </section>
      <p className="mx-auto mt-4 flex max-w-[720px] items-center gap-2 text-[11px] font-medium text-[#81979c]">
        <Minus className="h-3.5 w-3.5" aria-hidden="true" /> Calendar Rhythm · individual weeks stay scannable
      </p>
    </main>
  );
}