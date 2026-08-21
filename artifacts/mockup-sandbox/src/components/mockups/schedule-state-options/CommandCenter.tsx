import { useState } from "react";
import { ArrowRight, Check, ChevronDown, Gauge, Target, TrendingUp } from "lucide-react";
import "./_group.css";

const BRAND = "#00AECD";
const NAVY = "#0f2a36";
const weeks = [
  { label: "Week 18", pct: 84, state: "On Target", tone: "teal" },
  { label: "Week 19", pct: 71, state: "Behind", tone: "orange" },
  { label: "Week 20", pct: 86, state: "On Target", tone: "teal" },
  { label: "Week 21", pct: 78, state: "On Target", tone: "current" },
];

export function CommandCenter() {
  const [showDetail, setShowDetail] = useState(false);
  const current = weeks[3];

  return (
    <main className="schedule-state-frame command-frame">
      <style>{`
        .command-frame { background: #eef4f5; color: ${NAVY}; }
        .command-frame * { box-sizing: border-box; }
        .command-shell { max-width: 920px; margin: 0 auto; }
        .command-card { overflow: hidden; border: 1px solid #d6e6e9; border-radius: 24px; background: #fbfdfd; box-shadow: 0 18px 45px rgba(15,42,54,.10); }
        .command-hero { position: relative; padding: 27px 30px 25px; background: ${NAVY}; color: #f6fbfb; }
        .command-hero:after { content: ""; position: absolute; right: -48px; top: -58px; width: 220px; height: 220px; border: 1px solid rgba(0,174,205,.25); border-radius: 50%; box-shadow: 0 0 0 24px rgba(0,174,205,.04), 0 0 0 48px rgba(0,174,205,.025); pointer-events: none; }
        .command-kicker { color: #7ed5df; letter-spacing: .13em; font-size: 10px; font-weight: 800; text-transform: uppercase; }
        .command-status { display: flex; align-items: center; gap: 7px; width: fit-content; margin-top: 17px; padding: 6px 10px 6px 7px; color: #d9f7e7; background: rgba(58, 189, 119, .14); border: 1px solid rgba(109, 221, 155, .35); border-radius: 999px; font-size: 11px; font-weight: 800; }
        .command-dot { width: 8px; height: 8px; border-radius: 50%; background: #65d691; box-shadow: 0 0 0 4px rgba(101,214,145,.12); }
        .command-number { margin: 7px 0 0; color: #fff; font-size: 62px; line-height: .95; letter-spacing: -.065em; font-weight: 850; }
        .command-subtitle { max-width: 390px; margin-top: 9px; color: #b6cbd0; font-size: 12px; line-height: 1.45; }
        .command-target { position: absolute; right: 30px; bottom: 28px; z-index: 1; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-left: 2px solid ${BRAND}; color: #c9dde0; font-size: 11px; }
        .command-target strong { display: block; color: white; font-size: 17px; }
        .command-body { padding: 22px 30px 26px; }
        .history-head { display: flex; justify-content: space-between; align-items: end; margin-bottom: 14px; }
        .history-title { font-size: 13px; font-weight: 800; }
        .history-caption { margin-top: 3px; color: #789096; font-size: 11px; }
        .history-summary { color: #4c6b72; font-size: 11px; font-weight: 700; }
        .history-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        .week-tile { position: relative; min-height: 138px; padding: 13px 13px 12px; border: 1px solid #dce8e9; border-radius: 15px; background: #f7faf9; transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease; }
        .week-tile:hover { transform: translateY(-3px); border-color: #82cbd3; box-shadow: 0 8px 18px rgba(15,42,54,.08); }
        .week-tile.current { background: #e6f6f7; border: 2px solid ${BRAND}; padding: 12px; box-shadow: inset 0 0 0 1px rgba(0,174,205,.08); }
        .week-label { color: #789096; font-size: 10px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
        .week-tile.current .week-label { color: #0b7585; }
        .week-pct { margin-top: 7px; color: ${NAVY}; font-size: 27px; line-height: 1; font-weight: 850; letter-spacing: -.04em; }
        .week-state { display: flex; align-items: center; gap: 5px; margin-top: 8px; color: #567178; font-size: 10px; font-weight: 750; }
        .week-state.teal { color: #057c8d; }
        .week-state.orange { color: #b75b18; }
        .state-mark { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
        .current-mark { position: absolute; right: 12px; top: 12px; color: #08798a; font-size: 9px; font-weight: 850; text-transform: uppercase; letter-spacing: .06em; }
        .week-meter { position: absolute; left: 13px; right: 13px; bottom: 12px; height: 5px; overflow: hidden; border-radius: 99px; background: #d6e4e4; }
        .week-tile.current .week-meter { left: 12px; right: 12px; }
        .week-fill { height: 100%; border-radius: inherit; background: #93c4c8; transition: width .5s ease; }
        .week-tile.current .week-fill { background: ${BRAND}; }
        .week-tile:nth-child(2) .week-fill { background: #e99455; }
        .threshold-note { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 17px; padding-top: 15px; border-top: 1px solid #e2ebeb; }
        .threshold-note p { margin: 0; color: #607a80; font-size: 11px; line-height: 1.4; }
        .threshold-note strong { color: ${NAVY}; }
        .detail-button { display: inline-flex; align-items: center; gap: 5px; border: 0; background: transparent; color: #08798a; font: inherit; font-size: 11px; font-weight: 800; cursor: pointer; }
        .detail-button svg { transition: transform .2s ease; }
        .detail-button.open svg { transform: rotate(180deg); }
        .detail-copy { margin-top: 11px; padding: 11px 12px; border-radius: 11px; background: #f0f7f7; color: #557077; font-size: 11px; line-height: 1.45; }
        .command-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 17px; color: #789096; font-size: 10px; }
        .footer-check { display: flex; align-items: center; gap: 6px; }
        .footer-check svg { color: #2da66b; }
        @media (max-width: 640px) {
          .schedule-state-frame { padding: 13px; }
          .command-hero, .command-body { padding-left: 20px; padding-right: 20px; }
          .command-target { position: static; margin-top: 20px; }
          .command-number { font-size: 54px; }
          .history-grid { grid-template-columns: repeat(2, 1fr); }
          .command-footer { align-items: flex-start; flex-direction: column; }
        }
      `}</style>
      <section className="command-shell">
        <div className="command-card">
          <header className="command-hero">
            <div className="command-kicker">Schedule state · morning briefing</div>
            <div className="command-status"><span className="command-dot" />On Target</div>
            <p className="command-number">{current.pct}%</p>
            <p className="command-subtitle">Current completion rate across scheduled garden work. Stable enough to keep the plan moving.</p>
            <div className="command-target"><Target size={16} color={BRAND} /><span>Target<strong>72%</strong></span></div>
          </header>
          <div className="command-body">
            <div className="history-head">
              <div><div className="history-title">What got us here</div><div className="history-caption">Rolling four-week completion rate</div></div>
              <div className="history-summary"><TrendingUp size={13} style={{ verticalAlign: "middle", marginRight: 3 }} /> +7 pts vs target</div>
            </div>
            <div className="history-grid" aria-label="Weekly completion rates">
              {weeks.map((week) => (
                <article className={`week-tile ${week.tone === "current" ? "current" : ""}`} key={week.label}>
                  {week.tone === "current" && <span className="current-mark">Current</span>}
                  <div className="week-label">{week.label}</div>
                  <div className="week-pct">{week.pct}%</div>
                  <div className={`week-state ${week.tone === "orange" ? "orange" : "teal"}`}><span className="state-mark" />{week.state}</div>
                  <div className="week-meter"><div className="week-fill" style={{ width: `${week.pct}%` }} /></div>
                </article>
              ))}
            </div>
            <div className="threshold-note">
              <p><strong>Decision cue:</strong> current performance is above the 72% threshold.</p>
              <button className={`detail-button ${showDetail ? "open" : ""}`} onClick={() => setShowDetail(!showDetail)} aria-expanded={showDetail}>
                Why this state <ChevronDown size={14} />
              </button>
            </div>
            {showDetail && <div className="detail-copy"><Gauge size={14} style={{ verticalAlign: "middle", marginRight: 5, color: BRAND }} /> On Target means the current week is meeting the minimum completion threshold. No intervention is indicated; keep monitoring the next scheduled run.</div>}
            <div className="command-footer">
              <span className="footer-check"><Check size={14} /> State is clear without colour alone</span>
              <span>Figures fixed for exploration <ArrowRight size={12} style={{ verticalAlign: "middle", marginLeft: 4 }} /></span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}