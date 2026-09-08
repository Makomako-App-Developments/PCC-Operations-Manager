import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  Clock3,
  FileWarning,
  GitBranch,
  Leaf,
  MapPin,
  MapPinned,
  Megaphone,
  MoveRight,
  PackagePlus,
  Play,
  Route,
  ShieldAlert,
  ShieldCheck,
  Sprout,
  Trees,
  UserCheck,
  Users,
  XCircle,
  Zap,
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
  purple: "#7e22ce",
  purplePale: "#faf5ff",
  slate: "#64748b",
  line: "#d8e3e7",
  paper: "#f5f8f9",
};

function SectionTitle({ number, title, subtitle }: { number: string; title: string; subtitle: string }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-8">
      <div className="flex items-center gap-3">
        <span className="text-[12px] font-black tracking-[0.18em]" style={{ color: C.tealDark }}>{number}</span>
        <h2 className="text-[23px] font-black leading-none tracking-[-0.03em]" style={{ color: C.ink }}>{title}</h2>
      </div>
      <p className="max-w-[470px] text-right text-[11px] leading-relaxed" style={{ color: C.slate }}>{subtitle}</p>
    </div>
  );
}

function Arrow({ label }: { label?: string }) {
  return (
    <div className="flex shrink-0 items-center gap-1 text-[8px] font-black uppercase tracking-wide" style={{ color: "#78949d" }}>
      {label && <span>{label}</span>}<ArrowRight className="h-5 w-5" />
    </div>
  );
}

function Stage({
  title,
  detail,
  icon,
  color = C.tealDark,
  pale = C.tealPale,
}: {
  title: string;
  detail: string;
  icon: React.ReactNode;
  color?: string;
  pale?: string;
}) {
  return (
    <div className="min-w-0 flex-1 rounded-xl border px-4 py-3.5" style={{ borderColor: color + "45", background: pale }}>
      <div className="mb-2 flex items-center gap-2" style={{ color }}>
        {icon}<span className="text-[12px] font-black uppercase tracking-[0.07em]">{title}</span>
      </div>
      <p className="text-[10px] leading-[1.5]" style={{ color: C.slate }}>{detail}</p>
    </div>
  );
}

function WorkCard({
  title,
  kicker,
  detail,
  effect,
  icon,
  color,
  pale,
}: {
  title: string;
  kicker: string;
  detail: string;
  effect: string;
  icon: React.ReactNode;
  color: string;
  pale: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-[0_3px_12px_rgba(18,49,58,0.05)]" style={{ borderColor: C.line }}>
      <div className="flex items-start justify-between">
        <div className="grid h-10 w-10 place-items-center rounded-xl" style={{ color, background: pale }}>{icon}</div>
        <span className="rounded-full px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.12em]" style={{ color, background: pale }}>{kicker}</span>
      </div>
      <h3 className="mt-4 text-[16px] font-black">{title}</h3>
      <p className="mt-2 min-h-[46px] text-[10px] leading-relaxed" style={{ color: C.slate }}>{detail}</p>
      <div className="mt-3 rounded-lg px-3 py-2 text-[9px] font-bold leading-relaxed" style={{ color, background: pale }}>{effect}</div>
    </div>
  );
}

function Decision({
  n,
  title,
  detail,
  color,
  pale,
}: {
  n: string;
  title: string;
  detail: string;
  color: string;
  pale: string;
}) {
  return (
    <div className="flex-1 rounded-2xl border bg-white p-4" style={{ borderColor: color + "40" }}>
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg text-[11px] font-black" style={{ color, background: pale }}>{n}</span>
        <h3 className="text-[13px] font-black">{title}</h3>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed" style={{ color: C.slate }}>{detail}</p>
    </div>
  );
}

function Pill({ children, color = C.ink, pale = "#eef3f5" }: { children: React.ReactNode; color?: string; pale?: string }) {
  return <span className="rounded-full px-3 py-1.5 text-[9px] font-black" style={{ color, background: pale }}>{children}</span>;
}

export function UnscheduledWorkSystemMap() {
  return (
    <div className="w-[1100px] min-h-[2680px] bg-white p-8 font-sans" style={{ color: C.ink }}>
      <style>{`
        @page { size: 1100px 3000px; margin: 0; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: #ffffff !important; }
        }
      `}</style>

      <header className="relative overflow-hidden rounded-[30px] px-9 py-8 text-white" style={{ background: `linear-gradient(125deg, ${C.navy} 0%, #0c5361 67%, ${C.tealDark} 100%)` }}>
        <div className="absolute -right-12 -top-20 h-72 w-72 rounded-full border border-white/10" />
        <div className="absolute right-10 top-12 opacity-10"><Zap className="h-40 w-40" strokeWidth={1.15} /></div>
        <div className="relative flex items-start justify-between gap-8">
          <div className="max-w-[735px]">
            <div className="mb-5 flex items-center gap-3">
              <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100">PCC Gardens Manager</span>
              <span className="text-[10px] font-semibold text-cyan-100/70">Operational explainer</span>
            </div>
            <h1 className="text-[41px] font-black leading-[1.02] tracking-[-0.045em]">The complete unscheduled<br /><span className="text-cyan-300">work system map</span></h1>
            <p className="mt-4 max-w-[670px] text-[14px] leading-relaxed text-cyan-50/75">
              How ad-hoc requests, urgent jobs, infill and mulching enter operations—and how an explicit capacity policy decides whether recurring maintenance gives way.
            </p>
          </div>
          <div className="mt-1 w-[255px] rounded-2xl border border-white/15 bg-white/10 px-5 py-4 backdrop-blur">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100/70">Core principle</div>
            <div className="mt-2 text-[16px] font-black leading-snug">Unscheduled work gets a choice—not a blank cheque.</div>
            <div className="mt-2 text-[10px] leading-relaxed text-cyan-50/70">Team, date, time and an explicit precedence policy determine the operational impact.</div>
          </div>
        </div>
      </header>

      <section className="mt-7">
        <SectionTitle number="01" title="What counts as unscheduled work?" subtitle="It is an umbrella for work created outside the recurring maintenance generator. Each source enters the plan differently." />
        <div className="grid grid-cols-3 gap-4 rounded-[24px] border p-5" style={{ borderColor: C.line, background: C.paper }}>
          <WorkCard
            title="Reactive request"
            kicker="Raise → triage"
            detail="Ad-hoc issue or emergency raised by a field worker, supervisor or manager. Can be linked to an asset or recorded with its own location."
            effect="Starts as RAISED. Until it has a team and date, it is queue work—not route work."
            icon={<Megaphone className="h-5 w-5" />}
            color={C.purple}
            pale={C.purplePale}
          />
          <WorkCard
            title="Urgent schedule job"
            kicker="Review impact"
            detail="A manager inserts urgent work directly from the Schedule against an asset, its team and a selected day."
            effect="Created as an active reactive job in the main schedule and participates in that day’s regular-job capacity."
            icon={<Zap className="h-5 w-5" />}
            color={C.red}
            pale={C.redPale}
          />
          <WorkCard
            title="Infill or mulching"
            kicker="Plan → insert"
            detail="One-off operational work placed from Schedule or its programme workflow with an asset, team, date and estimated duration."
            effect="Appears alongside maintenance and is included in the shared day-capacity total."
            icon={<Sprout className="h-5 w-5" />}
            color={C.green}
            pale={C.greenPale}
          />
        </div>
      </section>

      <section className="mt-8">
        <SectionTitle number="02" title="Reactive requests: from report to field work" subtitle="All creators enter the same controlled lifecycle. No role can create a request already completed or bypass the initial raised state." />
        <div className="rounded-[24px] border bg-white p-5 shadow-[0_4px_18px_rgba(18,49,58,0.05)]" style={{ borderColor: C.line }}>
          <div className="flex items-stretch gap-2">
            <Stage title="Raised" detail="Issue type, description, asset or GPS location, attachments and origin are retained. Field workers supply basic details only." icon={<FileWarning className="h-4 w-4" />} color={C.purple} pale={C.purplePale} />
            <Arrow label="Review" />
            <Stage title="Triaged" detail="Supervisor or manager confirms priority, estimated minutes, team, date and—optionally—an individual assignee." icon={<ClipboardList className="h-4 w-4" />} color={C.blue} pale={C.bluePale} />
            <Arrow label="Publish" />
            <Stage title="Assigned" detail="Requires both team and scheduled date. The team can see it; assignment notifications are sent when applicable." icon={<UserCheck className="h-4 w-4" />} color={C.tealDark} pale={C.tealPale} />
            <Arrow label="Start" />
            <Stage title="In progress" detail="Starting atomically claims the request to one worker and records the start time." icon={<Play className="h-4 w-4" />} color={C.amber} pale={C.amberPale} />
          </div>
          <div className="my-4 flex justify-center"><ArrowDown className="h-5 w-5" style={{ color: "#8fb1ba" }} /></div>
          <div className="grid grid-cols-[1fr_44px_1fr] gap-3">
            <div className="rounded-2xl border px-5 py-4" style={{ borderColor: "#acd9b8", background: C.greenPale }}>
              <div className="flex items-center gap-2 text-[14px] font-black" style={{ color: C.green }}><CheckCircle2 className="h-5 w-5" />Completed</div>
              <p className="mt-2 text-[10px] leading-relaxed" style={{ color: C.slate }}>Worker records notes, actual time and evidence attachments. Completion requires the job to have been started and claimed first.</p>
            </div>
            <div className="flex flex-col items-center justify-center text-[9px] font-black uppercase" style={{ color: "#78949d" }}><span>or</span><GitBranch className="mt-1 h-5 w-5" /></div>
            <div className="rounded-2xl border px-5 py-4" style={{ borderColor: "#cbd5e1", background: "#f8fafc" }}>
              <div className="flex items-center gap-2 text-[14px] font-black" style={{ color: C.slate }}><XCircle className="h-5 w-5" />Cancelled</div>
              <p className="mt-2 text-[10px] leading-relaxed" style={{ color: C.slate }}>Removed from active schedule views while preserving the record, origin, description and management history.</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: "#f1f5f9" }}>
            <ShieldCheck className="h-5 w-5 shrink-0" style={{ color: C.slate }} />
            <p className="text-[10px] leading-relaxed" style={{ color: C.slate }}>Claim protection applies: another worker cannot overwrite or complete work already claimed by someone else.</p>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <SectionTitle number="03" title="The capacity decision" subtitle="A date can contain recurring maintenance, active main-schedule jobs, infill and mulching. Productive minutes are the common budget—and precedence makes the trade-off explicit." />
        <div className="rounded-[24px] border p-5" style={{ borderColor: C.line, background: "#fffdf8" }}>
          <div className="grid grid-cols-[310px_1fr] gap-5">
            <div className="rounded-2xl p-5 text-white" style={{ background: C.navy }}>
              <Clock3 className="h-8 w-8 text-cyan-300" />
              <h3 className="mt-4 text-[19px] font-black">Day capacity</h3>
              <div className="mt-4 rounded-xl bg-white/10 p-4">
                <div className="flex items-center justify-between text-[11px]"><span>Existing active minutes</span><b>A</b></div>
                <div className="my-2 h-px bg-white/15" />
                <div className="flex items-center justify-between text-[11px]"><span>New work estimate</span><b>+ B</b></div>
                <div className="my-2 h-px bg-white/15" />
                <div className="flex items-center justify-between text-[12px] font-black text-cyan-300"><span>Compared with</span><span>productive minutes</span></div>
              </div>
              <p className="mt-3 text-[9px] leading-relaxed text-slate-300">If any capacity source is unreliable, placement fails closed rather than pretending the day is empty.</p>
            </div>
            <div className="flex flex-col justify-center gap-3">
              <div className="flex items-stretch gap-2">
                <Decision n="1" title="It fits" detail="Place the work on the chosen team/date. Nothing else moves." color={C.green} pale={C.greenPale} />
                <Arrow />
                <Decision n="2" title="It does not fit" detail="Show the existing load, new minutes and shortfall before any change." color={C.amber} pale={C.amberPale} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Decision n="1" title="Make scheduled maintenance give way" detail="Default. Move only the minimum eligible pending recurring maintenance, taking the route tail first, then place the unscheduled work." color={C.tealDark} pale={C.tealPale} />
                <Decision n="2" title="Do scheduled maintenance first" detail="Protect the plan. Choose another date—or explicitly accept a visible over-capacity day." color={C.blue} pale={C.bluePale} />
              </div>
              <div className="rounded-xl border px-4 py-3 text-[10px] leading-relaxed" style={{ borderColor: "#f0b7b2", background: C.redPale, color: C.red }}>
                <b>Either way:</b> the manager sees the existing load, new minutes and shortfall before confirming. Urgency remains a separate label; it does not silently change this capacity policy.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <SectionTitle number="04" title="Exactly how scheduled maintenance is affected" subtitle="The default makes room carefully; the protected option leaves recurring work in place. Neither policy changes the geosequence rule." />
        <div className="grid grid-cols-[1fr_1.1fr] gap-5">
          <div className="rounded-[24px] border p-5" style={{ borderColor: "#bce7ef", background: C.tealPale }}>
            <div className="flex items-center gap-2 text-[16px] font-black" style={{ color: C.tealDark }}><MoveRight className="h-6 w-6" />What can move</div>
            <div className="mt-4 space-y-2">
              {[
                "Default policy: minimum eligible work only",
                "Pending recurring maintenance on the same team",
                "Route tail first for geosequence-aware pushes",
                "Receiving-day overflow cascades to later working days",
              ].map((t, i) => (
                <div key={t} className="flex items-center gap-3 rounded-lg bg-white/80 px-3 py-2 text-[10px] font-bold">
                  <span className="grid h-5 w-5 place-items-center rounded-md text-[9px]" style={{ color: C.tealDark, background: "#d7f4f8" }}>{i + 1}</span>{t}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[24px] border p-5" style={{ borderColor: "#f0b7b2", background: C.redPale }}>
            <div className="flex items-center gap-2 text-[16px] font-black" style={{ color: C.red }}><ShieldAlert className="h-6 w-6" />What never moves automatically</div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                ["In progress", "Someone has started it"],
                ["Completed / skipped", "Historical outcome"],
                ["Accepted-skip draft", "Manager placement queue"],
                ["Reactive work", "The inserted priority work"],
                ["Infill / mulching", "The one-off programme work"],
                ["Missed historical work", "Resolve explicitly, do not replan"],
              ].map(([t, d]) => (
                <div key={t} className="rounded-lg bg-white/80 px-3 py-2">
                  <div className="text-[10px] font-black">{t}</div>
                  <div className="mt-0.5 text-[9px]" style={{ color: C.slate }}>{d}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg bg-white/80 px-3 py-2 text-[9px] font-bold leading-relaxed" style={{ color: C.red }}>
              Scheduled-first keeps these dates protected. If the new work cannot fit, choose another date or record the explicit overload.
            </div>
          </div>
        </div>
        <div className="mt-4 rounded-[20px] border bg-white p-5" style={{ borderColor: C.line }}>
          <div className="flex items-center gap-3">
            <Route className="h-6 w-6" style={{ color: C.tealDark }} />
            <div>
              <h3 className="text-[14px] font-black">Route-order consequence</h3>
              <p className="mt-1 text-[10px] leading-relaxed" style={{ color: C.slate }}>
                Capacity precedence is not route priority. Asset-linked work still inherits the asset’s route position; a location-only reactive request with GPS is slotted after the nearest route anchor. Work without a usable route or location falls to the end.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <SectionTitle number="05" title="Three insertion paths—and one precedence choice" subtitle="Where the work is created changes the review surface, but the same two capacity policies apply whenever an authorised manager or supervisor confirms team and date." />
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-2xl border p-5" style={{ borderColor: "#d8b4fe", background: C.purplePale }}>
            <Megaphone className="h-6 w-6" style={{ color: C.purple }} />
            <h3 className="mt-3 text-[14px] font-black">Unscheduled Work page</h3>
            <p className="mt-2 text-[10px] leading-relaxed" style={{ color: C.slate }}>Raise first, then management assigns team/date/priority/time. The default policy is reviewed at authorised assignment; a field-raised request cannot displace maintenance by itself.</p>
            <div className="mt-3 text-[9px] font-black" style={{ color: C.purple }}>Policy choice is visible before publish.</div>
          </div>
          <div className="rounded-2xl border p-5" style={{ borderColor: "#f0b7b2", background: C.redPale }}>
            <Zap className="h-6 w-6" style={{ color: C.red }} />
            <h3 className="mt-3 text-[14px] font-black">Urgent Job from Schedule</h3>
            <p className="mt-2 text-[10px] leading-relaxed" style={{ color: C.slate }}>Loads the target day first and presents the same precedence choice: make minimum route-tail room, or protect scheduled work and choose another date/accept overload.</p>
            <div className="mt-3 text-[9px] font-black" style={{ color: C.red }}>Urgency and precedence stay separate.</div>
          </div>
          <div className="rounded-2xl border p-5" style={{ borderColor: "#acd9b8", background: C.greenPale }}>
            <PackagePlus className="h-6 w-6" style={{ color: C.green }} />
            <h3 className="mt-3 text-[14px] font-black">Insert Infill / Mulching</h3>
            <p className="mt-2 text-[10px] leading-relaxed" style={{ color: C.slate }}>Server checks the shared day total before creation. The default moves only enough eligible recurring work; scheduled-first protects it.</p>
            <div className="mt-3 text-[9px] font-black" style={{ color: C.green }}>Server-enforced capacity gate.</div>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <SectionTitle number="06" title="Where the work appears" subtitle="Unscheduled work is merged into operational views, but its visibility depends on assignment, date and whether it is linked to an asset." />
        <div className="grid grid-cols-4 gap-3">
          {[
            ["Unscheduled Work", "Master queue for raised, assigned, active, completed and cancelled reactive requests.", ClipboardList],
            ["Day / Week", "Dated reactive, urgent, infill and mulching work appears beside recurring maintenance.", CalendarDays],
            ["Gantt / Range", "Asset-linked work appears on the asset timeline. Location-only reactive work is omitted.", Trees],
            ["Field Ops", "Assigned team work opens its own reactive detail flow with claim, notes, time and photos.", MapPinned],
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
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">Operational rule of thumb</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill color={C.purple} pale={C.purplePale}>Raised = queue only</Pill>
              <Pill color={C.blue} pale={C.bluePale}>Team + date = visible work</Pill>
              <Pill color={C.amber} pale={C.amberPale}>Minutes = capacity impact</Pill>
              <Pill color={C.tealDark} pale={C.tealPale}>Default = minimum room</Pill>
              <Pill color={C.blue} pale={C.bluePale}>Protected = choose / overload</Pill>
              <Pill color={C.red} pale={C.redPale}>Force = accepted overload</Pill>
            </div>
          </div>
          <div className="max-w-[355px] border-l border-white/15 pl-6 text-[10px] leading-relaxed text-slate-300">
            <b className="text-white">The mental model:</b> unscheduled work enters operations; capacity determines whether it fits; the default makes minimum room from the route tail, while the protected option keeps scheduled work in place; route order remains the organising spine.
          </div>
        </div>
      </section>

      <footer className="mt-5 flex items-center justify-between border-t pt-4 text-[9px]" style={{ borderColor: C.line, color: "#8aa0a7" }}>
        <span>Source: PCC Gardens Manager unscheduled, reactive, infill, mulching and capacity workflows</span>
        <span>Operational map · 8 September 2026</span>
      </footer>
    </div>
  );
}

export default UnscheduledWorkSystemMap;