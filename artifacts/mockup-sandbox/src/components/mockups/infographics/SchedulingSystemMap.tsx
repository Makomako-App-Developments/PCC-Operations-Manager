import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CirclePause,
  ClipboardCheck,
  Clock3,
  Database,
  GitBranch,
  History,
  MapPinned,
  Play,
  RefreshCw,
  Route,
  ShieldCheck,
  SkipForward,
  Users,
  Workflow,
} from "lucide-react";

const C = {
  ink: "#12313a",
  navy: "#123844",
  teal: "#00aeca",
  tealDark: "#008ba3",
  tealPale: "#eafafd",
  green: "#15803d",
  greenPale: "#ecfdf3",
  amber: "#b45309",
  amberPale: "#fff8e7",
  red: "#b42318",
  redPale: "#fff1f0",
  blue: "#2563eb",
  bluePale: "#eff6ff",
  slate: "#64748b",
  line: "#d8e3e7",
  paper: "#f5f8f9",
};

function Step({
  n,
  title,
  children,
  tone = "teal",
}: {
  n: string;
  title: string;
  children: React.ReactNode;
  tone?: "teal" | "green" | "amber" | "blue";
}) {
  const tones = {
    teal: [C.tealDark, C.tealPale],
    green: [C.green, C.greenPale],
    amber: [C.amber, C.amberPale],
    blue: [C.blue, C.bluePale],
  };
  const [fg, bg] = tones[tone];
  return (
    <div className="flex-1 min-w-0 rounded-2xl border bg-white px-4 py-4 shadow-[0_3px_12px_rgba(18,49,58,0.05)]" style={{ borderColor: C.line }}>
      <div className="flex items-center gap-2.5 mb-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[12px] font-black" style={{ color: fg, background: bg }}>{n}</span>
        <h3 className="text-[14px] font-extrabold leading-tight" style={{ color: C.ink }}>{title}</h3>
      </div>
      <div className="text-[11px] leading-[1.55]" style={{ color: C.slate }}>{children}</div>
    </div>
  );
}

function Connector() {
  return <ArrowRight className="w-5 h-5 shrink-0" style={{ color: "#8fb1ba" }} strokeWidth={2.3} />;
}

function SectionTitle({ number, title, subtitle }: { number: string; title: string; subtitle: string }) {
  return (
    <div className="flex items-end justify-between gap-8 mb-4">
      <div className="flex items-center gap-3">
        <span className="text-[12px] font-black tracking-[0.18em]" style={{ color: C.tealDark }}>{number}</span>
        <h2 className="text-[23px] leading-none font-black tracking-[-0.03em]" style={{ color: C.ink }}>{title}</h2>
      </div>
      <p className="max-w-[470px] text-right text-[11px] leading-relaxed" style={{ color: C.slate }}>{subtitle}</p>
    </div>
  );
}

function State({
  label,
  detail,
  color,
  pale,
  icon,
}: {
  label: string;
  detail: string;
  color: string;
  pale: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex-1 min-w-0 rounded-xl border px-3.5 py-3.5" style={{ borderColor: color + "40", background: pale }}>
      <div className="flex items-center gap-2 mb-1.5" style={{ color }}>
        {icon}
        <span className="text-[12px] font-black uppercase tracking-[0.08em]">{label}</span>
      </div>
      <p className="text-[10px] leading-[1.45]" style={{ color: C.slate }}>{detail}</p>
    </div>
  );
}

function ArrowLabel({ children, down = false }: { children: React.ReactNode; down?: boolean }) {
  return (
    <div className={`shrink-0 flex ${down ? "flex-col" : "flex-row"} items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-wide`} style={{ color: "#78949d" }}>
      {children}
      {down ? <ArrowDown className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}
    </div>
  );
}

function ActionPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "green" | "red" | "blue" | "amber" }) {
  const tones = {
    neutral: [C.ink, "#eef3f5"],
    green: [C.green, C.greenPale],
    red: [C.red, C.redPale],
    blue: [C.blue, C.bluePale],
    amber: [C.amber, C.amberPale],
  };
  return <span className="rounded-full px-3 py-1.5 text-[10px] font-extrabold" style={{ color: tones[tone][0], background: tones[tone][1] }}>{children}</span>;
}

export function SchedulingSystemMap() {
  return (
    <div className="w-[1100px] min-h-[2460px] bg-white p-8 font-sans" style={{ color: C.ink }}>
      <style>{`
        @page { size: 1100px 2800px; margin: 0; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: #ffffff !important; }
        }
      `}</style>
      <header className="relative overflow-hidden rounded-[30px] px-9 py-8 text-white" style={{ background: `linear-gradient(125deg, ${C.navy} 0%, #0c5361 68%, ${C.tealDark} 100%)` }}>
        <div className="absolute -right-16 -top-20 h-72 w-72 rounded-full border border-white/10" />
        <div className="absolute right-9 top-7 opacity-10"><Route className="h-40 w-40" strokeWidth={1.2} /></div>
        <div className="relative flex items-start justify-between">
          <div className="max-w-[720px]">
            <div className="mb-5 flex items-center gap-3">
              <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100">PCC Gardens Manager</span>
              <span className="text-[10px] font-semibold text-cyan-100/70">Operational explainer</span>
            </div>
            <h1 className="text-[42px] leading-[1.02] font-black tracking-[-0.045em]">The complete scheduling<br /><span className="text-cyan-300">system map</span></h1>
            <p className="mt-4 max-w-[650px] text-[14px] leading-relaxed text-cyan-50/75">
              How recurring maintenance becomes a daily route, what every worker action changes,
              and how managers resolve skips, missed work, absences and urgent insertions.
            </p>
          </div>
          <div className="mt-1 rounded-2xl border border-white/15 bg-white/10 px-5 py-4 text-right backdrop-blur">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-100/70">Three governing rules</div>
            <div className="mt-2 text-[13px] font-extrabold">Route order first</div>
            <div className="text-[13px] font-extrabold">Capacity decides the day</div>
            <div className="text-[13px] font-extrabold">History is never silently erased</div>
          </div>
        </div>
      </header>

      <section className="mt-7">
        <SectionTitle
          number="01"
          title="Generate Schedule"
          subtitle="The Generate button rebuilds only safe-to-rebuild future pending work. Active, historical and reviewed records keep their identity."
        />
        <div className="rounded-[24px] border p-5" style={{ borderColor: C.line, background: C.paper }}>
          <div className="flex items-stretch gap-2.5">
            <Step n="1" title="Choose range & team">
              Managers can generate all teams. Supervisors must select their own team.
            </Step>
            <Connector />
            <Step n="2" title="Safety guard" tone="amber">
              Team generation stops if scheduled jobs are <b>in progress</b> in the selected range.
            </Step>
            <Connector />
            <Step n="3" title="Clear rebuildable rows">
              Deletes future <b>pending generated</b> jobs only. Keeps active, completed, skipped and accepted-skip drafts.
            </Step>
            <Connector />
            <Step n="4" title="Load operating facts" tone="blue">
              Active schedulable assets, team members, absences, service time, crew size and productive minutes.
            </Step>
          </div>
          <div className="my-3 flex justify-center"><ArrowDown className="h-5 w-5" style={{ color: "#8fb1ba" }} /></div>
          <div className="flex items-stretch gap-2.5">
            <Step n="5" title="Calculate recurring cycles" tone="blue">
              Frequency dates are anchored to <b>1 Jan 2024</b>, then moved to weekdays. Each cycle can land within <b>±3 days</b>.
            </Step>
            <Connector />
            <Step n="6" title="Walk the geosequence">
              For each team and workday, sites are considered in <b>routeOrder</b>. Existing cycle reservations are skipped.
            </Step>
            <Connector />
            <Step n="7" title="Fit or carry" tone="amber">
              If it fits, create a pending job. If not, carry the route tail to the next working day. Oversized single jobs become explicit overruns.
            </Step>
            <Connector />
            <Step n="8" title="Save & refresh" tone="green">
              New jobs are inserted in batches. Existing pending jobs have crew-adjusted time and crew status refreshed.
            </Step>
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-xl border px-4 py-3" style={{ borderColor: "#bce7ef", background: C.tealPale }}>
            <ShieldCheck className="h-5 w-5 shrink-0" style={{ color: C.tealDark }} />
            <p className="text-[11px] leading-relaxed" style={{ color: C.ink }}>
              <b>Cycle reservation:</b> a pending job, accepted-skip draft, deliberately placed draft, or system-retired testing occurrence prevents the same recurring cycle being generated again.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <SectionTitle
          number="02"
          title="Field worker job lifecycle"
          subtitle="One worker claims an ordinary job when starting it. All-Teams work remains collaborative and records a separate completion for each team."
        />
        <div className="rounded-[24px] border bg-white p-5 shadow-[0_4px_18px_rgba(18,49,58,0.05)]" style={{ borderColor: C.line }}>
          <div className="flex items-stretch gap-2">
            <State label="Pending" detail="Shown in route order. Today also includes unresolved jobs carried from earlier dates." color={C.blue} pale={C.bluePale} icon={<CalendarClock className="h-4 w-4" />} />
            <ArrowLabel>Start</ArrowLabel>
            <State label="In progress" detail="Worker is claimed atomically. Server records start time. Out-of-sequence starts require a reason." color={C.tealDark} pale={C.tealPale} icon={<Play className="h-4 w-4" />} />
            <ArrowLabel>Pause</ArrowLabel>
            <State label="Paused" detail="Pause timestamp is stored. Resume adds paused seconds, then returns to in progress." color={C.amber} pale={C.amberPale} icon={<CirclePause className="h-4 w-4" />} />
            <ArrowLabel>Resume</ArrowLabel>
          </div>

          <div className="my-5 grid grid-cols-[1fr_52px_1fr] items-stretch gap-3">
            <div className="rounded-2xl border px-5 py-4" style={{ borderColor: "#acd9b8", background: C.greenPale }}>
              <div className="flex items-center gap-2 text-[14px] font-black" style={{ color: C.green }}><CheckCircle2 className="h-5 w-5" />Complete</div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-white/80 p-2 text-[10px] leading-relaxed"><b>Photo required</b><br /><span style={{ color: C.slate }}>At least one evidence photo.</span></div>
                <div className="rounded-lg bg-white/80 p-2 text-[10px] leading-relaxed"><b>Checklist checked</b><br /><span style={{ color: C.slate }}>Unchecked tasks need reasons.</span></div>
                <div className="rounded-lg bg-white/80 p-2 text-[10px] leading-relaxed"><b>Actual time</b><br /><span style={{ color: C.slate }}>Wall time minus pauses.</span></div>
              </div>
              <p className="mt-3 text-[10px] font-semibold" style={{ color: C.green }}>Result: terminal history; no longer in Remaining.</p>
            </div>
            <div className="flex flex-col items-center justify-center gap-1 text-[9px] font-bold uppercase" style={{ color: "#78949d" }}><span>or</span><GitBranch className="h-5 w-5" /></div>
            <div className="rounded-2xl border px-5 py-4" style={{ borderColor: "#f0b7b2", background: C.redPale }}>
              <div className="flex items-center gap-2 text-[14px] font-black" style={{ color: C.red }}><SkipForward className="h-5 w-5" />Skip job</div>
              <p className="mt-2 text-[10px] leading-relaxed" style={{ color: C.slate }}>Worker must enter a job-level reason. Any task-level excuses are retained separately. Status becomes <b>skipped</b> and enters manager review.</p>
              <div className="mt-3 flex items-center gap-2">
                <ActionPill tone="red">Skipped</ActionPill>
                <ArrowRight className="h-4 w-4" style={{ color: "#9d7774" }} />
                <ActionPill tone="amber">Manager review queue</ActionPill>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: "#f1f5f9" }}>
            <Users className="h-5 w-5 shrink-0" style={{ color: C.slate }} />
            <p className="text-[10px] leading-relaxed" style={{ color: C.slate }}>
              A claimed job is read-only for other workers. Completed and skipped jobs remain visible as done history; pending, in-progress, paused and overdue jobs count as remaining.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <SectionTitle
          number="03"
          title="What happens after a worker skips?"
          subtitle="A skip is not silently regenerated. Management makes an explicit accept/reject decision, and acceptance creates a deliberate placement workflow."
        />
        <div className="grid grid-cols-[290px_1fr] gap-5">
          <div className="rounded-[24px] p-5 text-white" style={{ background: C.navy }}>
            <ClipboardCheck className="h-8 w-8 text-cyan-300" />
            <h3 className="mt-4 text-[20px] font-black">Skip review</h3>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-300">
              Managers see the worker’s job reason, task-level reasons, asset, original team and date.
            </p>
            <div className="mt-5 space-y-2 text-[10px]">
              <div className="rounded-lg bg-white/10 px-3 py-2"><b>Reject</b> means the job returns to pending.</div>
              <div className="rounded-lg bg-white/10 px-3 py-2"><b>Accept</b> means the job becomes a draft awaiting placement.</div>
            </div>
          </div>
          <div className="rounded-[24px] border p-5" style={{ borderColor: C.line, background: C.paper }}>
            <div className="flex items-stretch gap-2">
              <State label="Skipped" detail="Worker reason and original job identity retained." color={C.red} pale={C.redPale} icon={<SkipForward className="h-4 w-4" />} />
              <ArrowLabel>Reject</ArrowLabel>
              <State label="Pending again" detail="Same job returns to the live schedule; review decision is stored." color={C.blue} pale={C.bluePale} icon={<RefreshCw className="h-4 w-4" />} />
            </div>
            <div className="my-3 flex justify-center"><span className="rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-wide" style={{ color: C.amber, background: C.amberPale }}>Alternative: Accept</span></div>
            <div className="flex items-stretch gap-2">
              <State label="Draft" detail="Hidden from worker schedule and day capacity, but reserves the original recurring cycle." color={C.amber} pale={C.amberPale} icon={<CalendarDays className="h-4 w-4" />} />
              <ArrowLabel>Choose team + date</ArrowLabel>
              <State label="Capacity check" detail="Team/day decisions are serialized. Manager may explicitly force an over-capacity placement." color={C.tealDark} pale={C.tealPale} icon={<Clock3 className="h-4 w-4" />} />
              <ArrowLabel>Place</ArrowLabel>
              <State label="Pending" detail="Same job identity returns to the live schedule; original and selected cycles stay reserved." color={C.green} pale={C.greenPale} icon={<CheckCircle2 className="h-4 w-4" />} />
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <SectionTitle
          number="04"
          title="When scheduled work passes its date"
          subtitle="Missed work is carried forward for action without changing its scheduled date. Managers can resolve it, but generation cannot erase it."
        />
        <div className="rounded-[24px] border p-5" style={{ borderColor: C.line, background: "#fffdf8" }}>
          <div className="grid grid-cols-[240px_1fr] gap-5">
            <div className="rounded-2xl border p-5" style={{ borderColor: "#f4d49a", background: C.amberPale }}>
              <History className="h-7 w-7" style={{ color: C.amber }} />
              <h3 className="mt-3 text-[16px] font-black">Prior-date + unresolved</h3>
              <p className="mt-2 text-[10px] leading-relaxed" style={{ color: C.slate }}>
                Scheduled job with status pending, in progress, paused or overdue, and date earlier than today.
              </p>
              <div className="mt-3 text-[10px] font-bold" style={{ color: C.amber }}>Original date stays intact.</div>
            </div>
            <div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border bg-white p-4" style={{ borderColor: C.line }}>
                  <div className="flex items-center gap-2 text-[13px] font-black"><MapPinned className="h-4 w-4" style={{ color: C.tealDark }} />Field Ops Today</div>
                  <p className="mt-2 text-[10px] leading-relaxed" style={{ color: C.slate }}>Merged ahead of today’s literal jobs, deduplicated by job ID, sorted by geosequence then original date.</p>
                </div>
                <div className="rounded-xl border bg-white p-4" style={{ borderColor: C.line }}>
                  <div className="flex items-center gap-2 text-[13px] font-black"><AlertTriangle className="h-4 w-4" style={{ color: C.red }} />Manager Unresolved Work</div>
                  <p className="mt-2 text-[10px] leading-relaxed" style={{ color: C.slate }}>Shows original/current date, age, team and status. Every resolution requires a reason and writes an audit record.</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-white p-4">
                <span className="mr-1 text-[10px] font-black uppercase tracking-wide" style={{ color: C.slate }}>Manager actions</span>
                <ActionPill>Keep in carry-over</ActionPill>
                <ActionPill tone="blue">Move date</ActionPill>
                <ActionPill tone="blue">Reassign team</ActionPill>
                <ActionPill tone="green">Completion correction</ActionPill>
                <ActionPill tone="red">Skip with reason</ActionPill>
              </div>
              <p className="mt-2 text-[9px] leading-relaxed" style={{ color: C.slate }}>
                Move/reassign checks current or future working-day capacity. Supervisors can resolve their own team but cannot authorise completion corrections.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <SectionTitle
          number="05"
          title="Capacity changes & manual insertions"
          subtitle="These flows alter a narrow part of the plan rather than regenerating everything."
        />
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-2xl border p-5" style={{ borderColor: "#b8d0f7", background: C.bluePale }}>
            <Users className="h-6 w-6" style={{ color: C.blue }} />
            <h3 className="mt-3 text-[15px] font-black">Worker becomes unavailable</h3>
            <p className="mt-2 text-[10px] leading-relaxed" style={{ color: C.slate }}>
              <b>Replan Day</b> recalculates crew-adjusted times for that team/date only. Pending ordinary jobs stay in geosequence; overflow seeks the first available day within 10 working days.
            </p>
            <div className="mt-3 text-[9px] font-bold" style={{ color: C.blue }}>Past dates are blocked and must use Unresolved Work.</div>
          </div>
          <div className="rounded-2xl border p-5" style={{ borderColor: "#bce7ef", background: C.tealPale }}>
            <SkipForward className="h-6 w-6" style={{ color: C.tealDark }} />
            <h3 className="mt-3 text-[15px] font-black">Urgent work needs room</h3>
            <p className="mt-2 text-[10px] leading-relaxed" style={{ color: C.slate }}>
              <b>Push Forward</b> moves pending regular maintenance only. It pushes the highest route-order jobs first, then cascades over-capacity work to later working days.
            </p>
            <div className="mt-3 text-[9px] font-bold" style={{ color: C.tealDark }}>Undo is available for 15 minutes.</div>
          </div>
          <div className="rounded-2xl border p-5" style={{ borderColor: "#f4d49a", background: C.amberPale }}>
            <CalendarDays className="h-6 w-6" style={{ color: C.amber }} />
            <h3 className="mt-3 text-[15px] font-black">Insert infill or mulch</h3>
            <p className="mt-2 text-[10px] leading-relaxed" style={{ color: C.slate }}>
              Server checks all active work against team/day capacity. If over capacity, the manager can choose another date, explicitly force it, or push regular route work before placing it.
            </p>
            <div className="mt-3 text-[9px] font-bold" style={{ color: C.amber }}>Reactive work is separate, but appears in schedule views.</div>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <SectionTitle
          number="06"
          title="What each schedule surface is showing"
          subtitle="The same underlying work is presented differently depending on whether the goal is planning, route execution or exception resolution."
        />
        <div className="grid grid-cols-4 gap-3">
          {[
            ["Day / Week", "Regular maintenance + infill + mulch + scheduled reactive work, grouped by date and route order.", CalendarDays],
            ["Gantt / Range", "Asset-centred timeline across a selected period. Accepted-skip drafts are deliberately hidden.", Workflow],
            ["Field Ops Today", "Today’s jobs plus every unresolved prior-date job, with route order as the primary sequence.", Route],
            ["Unresolved Work", "Only missed scheduled work needing an explicit keep, move, reassign, complete or skip decision.", AlertTriangle],
          ].map(([title, body, Icon]) => {
            const I = Icon as typeof CalendarDays;
            return (
              <div key={title as string} className="rounded-2xl border bg-white p-4" style={{ borderColor: C.line }}>
                <I className="h-5 w-5" style={{ color: C.tealDark }} />
                <h3 className="mt-3 text-[13px] font-black">{title as string}</h3>
                <p className="mt-2 text-[10px] leading-relaxed" style={{ color: C.slate }}>{body as string}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-8 rounded-[24px] px-6 py-5" style={{ background: C.navy }}>
        <div className="flex items-center justify-between gap-6">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">Status key</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <ActionPill tone="blue">Pending: ready / remaining</ActionPill>
              <ActionPill>In progress: claimed</ActionPill>
              <ActionPill tone="amber">Paused: timer stopped</ActionPill>
              <ActionPill tone="green">Completed: terminal history</ActionPill>
              <ActionPill tone="red">Skipped: reviewable history</ActionPill>
              <ActionPill tone="amber">Draft: accepted skip awaiting placement</ActionPill>
            </div>
          </div>
          <div className="max-w-[330px] border-l border-white/15 pl-6 text-[10px] leading-relaxed text-slate-300">
            <b className="text-white">The mental model:</b> generation creates the route; workers advance job state; managers resolve exceptions; capacity tools move only pending future work; audit/history protects what actually happened.
          </div>
        </div>
      </section>

      <footer className="mt-5 flex items-center justify-between border-t pt-4 text-[9px]" style={{ borderColor: C.line, color: "#8aa0a7" }}>
        <span>Source: PCC Gardens Manager scheduling, job lifecycle and Field Ops implementation</span>
        <span>Operational map · 8 September 2026</span>
      </footer>
    </div>
  );
}

export default SchedulingSystemMap;