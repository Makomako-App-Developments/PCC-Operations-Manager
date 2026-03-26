import { useState } from "react";
import {
  Leaf, List, LayoutDashboard, CalendarDays, ClipboardCheck,
  Sprout, FileSpreadsheet, BarChart2, TrendingUp, TrendingDown,
  Minus, AlertTriangle, CheckCircle2, Clock, SkipForward,
  Users, Target, ChevronDown, Download, Calendar
} from "lucide-react";

const BRAND = "#00AECD";
const NAVY  = "#0f2a36";

function Sidebar({ active }: { active: string }) {
  const nav = [
    { icon: LayoutDashboard, label: "Dashboard",     id: "dashboard" },
    { icon: List,            label: "Asset Register" },
    { icon: CalendarDays,    label: "Schedule" },
    { icon: ClipboardCheck,  label: "Audits",         id: "audits" },
    { icon: Sprout,          label: "Infill Planting", id: "planting" },
    { icon: FileSpreadsheet, label: "Specification",  id: "spec" },
    { icon: BarChart2,       label: "Reports",        id: "reports" },
  ];
  return (
    <aside className="w-56 flex-shrink-0 flex flex-col min-h-screen" style={{ background: NAVY }}>
      <div className="px-5 py-5 border-b border-white/10">
        <div className="rounded-lg px-3 py-2 text-center" style={{ background: BRAND }}>
          <span className="text-white font-bold text-lg tracking-tight">poriruacity</span>
        </div>
        <p className="text-white/50 text-[10px] text-center mt-1 uppercase tracking-widest">Gardens Manager</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ icon: Icon, label, id }) => {
          const isActive = active === (id || label.toLowerCase());
          return (
            <div
              key={label}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                isActive ? "text-white" : "text-white/60 hover:text-white hover:bg-white/10"
              }`}
              style={isActive ? { background: BRAND } : {}}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm font-medium">{label}</span>
            </div>
          );
        })}
      </nav>
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: BRAND }}>DB</div>
          <div>
            <p className="text-white text-xs font-medium">Daniela Biaggio</p>
            <p className="text-white/40 text-[10px]">Urban Ecology Manager</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

type Period = "week" | "month";

const AUDIT_FAILS = [
  { site: "Rātā St Entrance Beds",     auditor: "Jude Morison",  fail: "Weed cover >5%",              date: "24 Mar", severity: "high" },
  { site: "Mungavin Ave Hedges",        auditor: "Jude Morison",  fail: "Edging not vertical/smooth",  date: "23 Mar", severity: "med" },
  { site: "Cobham Ct Rose Garden",      auditor: "Tim Broadwith", fail: "Mulch depth <50mm",           date: "21 Mar", severity: "med" },
  { site: "Waitangirua Memorial Park",  auditor: "Tim Broadwith", fail: "Litter not fully removed",    date: "20 Mar", severity: "low" },
  { site: "Elsdon Park Bush Edge",      auditor: "Jude Morison",  fail: "Plant coverage <95%",         date: "18 Mar", severity: "high" },
];

const EXCUSES = [
  { type: "task",  worker: "Barry Lavakula",    site: "Tui Park Rose Garden",    item: "Mulch depth",        reason: "Supply not delivered. Rescheduled Fri.", date: "25 Mar" },
  { type: "task",  worker: "Felise Maiava",     site: "Rātā St Entrance Beds",   item: "Pest & disease check", reason: "Products not stocked on van.",         date: "24 Mar" },
  { type: "site",  worker: "Joe Daish",         site: "Steyne Ave Amenity Strip", item: "Full service",       reason: "Access blocked — contractor on site.",  date: "24 Mar" },
  { type: "task",  worker: "June Rameka",       site: "Cobham Ct Rose Garden",   item: "Pruning",            reason: "Tool breakage. Reported to supervisor.", date: "22 Mar" },
  { type: "task",  worker: "David Wos",         site: "Mungavin Ave Hedges",     item: "Edging",             reason: "Ground too wet after overnight rain.",   date: "21 Mar" },
  { type: "site",  worker: "Tana Tanielu-Dick", site: "Waitangirua Sports Park", item: "Full service",       reason: "Public event on site — deferred.",       date: "20 Mar" },
];

const PRODUCTIVITY = [
  { name: "Barry Lavakula",    initials: "BL", allocated: 38, actual: 41, sites: 6 },
  { name: "David Wos",         initials: "DW", allocated: 36, actual: 33, sites: 5 },
  { name: "Felise Maiava",     initials: "FM", allocated: 36, actual: 38, sites: 6 },
  { name: "Joe Daish",         initials: "JD", allocated: 34, actual: 34, sites: 5 },
  { name: "June Rameka",       initials: "JR", allocated: 38, actual: 36, sites: 6 },
  { name: "Tana Tanielu-Dick", initials: "TT", allocated: 32, actual: 29, sites: 4 },
];

function StatCard({
  icon: Icon, label, value, sub, trend, trendDir, color
}: {
  icon: React.ElementType; label: string; value: string; sub: string;
  trend?: string; trendDir?: "up" | "down" | "flat"; color?: string;
}) {
  const tc = trendDir === "up" ? "text-red-500" : trendDir === "down" ? "text-green-500" : "text-gray-400";
  const TrendIcon = trendDir === "up" ? TrendingUp : trendDir === "down" ? TrendingDown : Minus;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: (color || BRAND) + "18" }}>
          <Icon className="w-4.5 h-4.5" style={{ color: color || BRAND }} />
        </div>
        {trend && (
          <span className={`flex items-center gap-1 text-[11px] font-semibold ${tc}`}>
            <TrendIcon className="w-3 h-3" />{trend}
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-black" style={{ color: NAVY }}>{value}</p>
        <p className="text-[11px] text-gray-400 font-medium mt-0.5">{sub}</p>
      </div>
      <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide">{label}</p>
    </div>
  );
}

function ScheduleState() {
  const weeks = [
    { label: "Wk 9",  pct: 92, state: "ahead" },
    { label: "Wk 10", pct: 88, state: "ahead" },
    { label: "Wk 11", pct: 74, state: "behind" },
    { label: "Wk 12", pct: 84, state: "on-target", current: true },
  ];
  const stateColor: Record<string, string> = { ahead: "#22c55e", "on-target": BRAND, behind: "#f97316" };
  const stateLabel: Record<string, string> = { ahead: "Ahead", "on-target": "On Target", behind: "Behind" };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold" style={{ color: NAVY }}>Schedule State</h3>
          <p className="text-[11px] text-gray-400">Rolling 4-week completion rate</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ background: `${BRAND}18` }}>
          <Target className="w-3.5 h-3.5" style={{ color: BRAND }} />
          <span className="text-[12px] font-bold" style={{ color: BRAND }}>On Target</span>
        </div>
      </div>
      <div className="flex items-end gap-3 h-24">
        {weeks.map(w => (
          <div key={w.label} className="flex-1 flex flex-col items-center gap-1.5">
            <span className="text-[10px] font-bold" style={{ color: stateColor[w.state] }}>{w.pct}%</span>
            <div className="w-full rounded-t-lg transition-all" style={{ height: `${w.pct}%`, background: w.current ? BRAND : `${stateColor[w.state]}40`, border: w.current ? "none" : "none" }} />
            <span className="text-[10px] font-semibold text-gray-400">{w.label}</span>
            <span className="text-[9px] font-medium" style={{ color: stateColor[w.state] }}>{stateLabel[w.state]}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-4">
        {[["#22c55e","Ahead"],["#00AECD","On Target"],["#f97316","Behind"]].map(([c,l]) => (
          <span key={l} className="flex items-center gap-1 text-[10px] text-gray-400">
            <span className="w-2 h-2 rounded-full" style={{ background: c }} />{l}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Reports() {
  const [period, setPeriod] = useState<Period>("week");

  const totalAllocated = PRODUCTIVITY.reduce((s, w) => s + w.allocated, 0);
  const totalActual    = PRODUCTIVITY.reduce((s, w) => s + w.actual, 0);
  const efficiencyPct  = Math.round((totalAllocated / totalActual) * 100);
  const failsCount     = period === "week" ? 3 : AUDIT_FAILS.length;
  const excuseCount    = period === "week" ? 4 : EXCUSES.length;

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans text-sm">
      <Sidebar active="reports" />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="bg-white border-b px-8 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-xl font-black" style={{ color: NAVY }}>Reports</h1>
            <p className="text-xs text-gray-400">Operational performance overview · Porirua City Council Gardens</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Period toggle */}
            <div className="flex rounded-xl overflow-hidden border border-gray-200 text-[12px] font-semibold">
              {(["week","month"] as Period[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className="px-4 py-2 capitalize transition-colors"
                  style={period === p ? { background: BRAND, color: "#fff" } : { background: "#fff", color: "#6b7280" }}
                >
                  This {p}
                </button>
              ))}
            </div>
            <button className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 text-[12px] text-gray-500 font-medium hover:bg-gray-50">
              <Download className="w-3.5 h-3.5" />Export PDF
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">

          {/* Quick stats */}
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-gray-400 mb-3">Quick Reports</p>
            <div className="grid grid-cols-5 gap-4">
              <StatCard
                icon={AlertTriangle}
                label="Audit Fails"
                value={String(failsCount)}
                sub={`This ${period} · ${period === "week" ? "2 high severity" : "4 high severity"}`}
                trend={period === "week" ? "+1 vs last wk" : "+2 vs last mo"}
                trendDir="up"
                color="#ef4444"
              />
              <StatCard
                icon={CheckCircle2}
                label="Completed Sites"
                value={period === "week" ? "14" : "52"}
                sub={`This ${period} · ${period === "week" ? "18 scheduled" : "60 scheduled"}`}
                trend={period === "week" ? "78% rate" : "87% rate"}
                trendDir="flat"
                color="#22c55e"
              />
              <StatCard
                icon={Clock}
                label="Team Productivity"
                value={`${efficiencyPct}%`}
                sub={`${totalAllocated}h allocated · ${totalActual}h actual`}
                trend={`${totalActual > totalAllocated ? "+" : ""}${totalActual - totalAllocated}h variance`}
                trendDir={totalActual > totalAllocated ? "up" : "down"}
                color={BRAND}
              />
              <StatCard
                icon={SkipForward}
                label="Excuses / Skips"
                value={String(excuseCount)}
                sub={`${period === "week" ? "3 tasks · 1 site" : "4 tasks · 2 sites"} skipped`}
                trend="Logged to supervisor"
                trendDir="flat"
                color="#f59e0b"
              />
              <StatCard
                icon={Target}
                label="Schedule State"
                value="84%"
                sub="Week 12 completion rate"
                trend="On Target"
                trendDir="flat"
                color="#22c55e"
              />
            </div>
          </div>

          {/* Bottom two columns */}
          <div className="grid grid-cols-2 gap-6">

            {/* Left col */}
            <div className="space-y-5">

              {/* Audit Fails */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold" style={{ color: NAVY }}>Audit Fails</h3>
                    <p className="text-[11px] text-gray-400">Sites that did not meet LOS standard</p>
                  </div>
                  <button className="flex items-center gap-1 text-[11px] font-medium text-gray-400 hover:text-gray-600">
                    All fails <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
                <div className="divide-y divide-gray-50">
                  {AUDIT_FAILS.slice(0, period === "week" ? 3 : 5).map((f, i) => (
                    <div key={i} className="px-5 py-3 flex items-start gap-3">
                      <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                        f.severity === "high" ? "bg-red-400" : f.severity === "med" ? "bg-amber-400" : "bg-gray-300"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-gray-800 truncate">{f.site}</p>
                        <p className="text-[11px] text-gray-400">{f.fail}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[10px] text-gray-400">{f.auditor.split(" ")[0]}</p>
                        <p className="text-[10px] text-gray-300">{f.date}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Schedule state */}
              <ScheduleState />
            </div>

            {/* Right col */}
            <div className="space-y-5">

              {/* Team Productivity */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b">
                  <h3 className="text-sm font-bold" style={{ color: NAVY }}>Team Productivity</h3>
                  <p className="text-[11px] text-gray-400">Allocated vs actual hours · {period === "week" ? "this week" : "this month"}</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {PRODUCTIVITY.map((w) => {
                    const over = w.actual > w.allocated;
                    const pctDiff = Math.round(Math.abs(w.actual - w.allocated) / w.allocated * 100);
                    return (
                      <div key={w.name} className="px-5 py-3 flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ background: NAVY }}>
                          {w.initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-[12px] font-semibold text-gray-800 truncate">{w.name.split(" ")[0]}</p>
                            <p className={`text-[11px] font-bold ${over ? "text-red-500" : "text-green-500"}`}>
                              {over ? "+" : "-"}{pctDiff}%
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${Math.min((w.actual / w.allocated) * 100, 100)}%`, background: over ? "#ef4444" : BRAND }}
                              />
                            </div>
                            <span className="text-[10px] text-gray-400 flex-shrink-0">{w.actual}h / {w.allocated}h alloc.</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Excuses / Skips */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold" style={{ color: NAVY }}>Excuses & Skips</h3>
                    <p className="text-[11px] text-gray-400">Tasks and sites not completed · logged to supervisor</p>
                  </div>
                </div>
                <div className="divide-y divide-gray-50">
                  {EXCUSES.slice(0, period === "week" ? 4 : 6).map((e, i) => (
                    <div key={i} className="px-5 py-3 flex items-start gap-3">
                      <span className={`mt-0.5 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0 ${
                        e.type === "site" ? "bg-red-50 text-red-500" : "bg-amber-50 text-amber-500"
                      }`}>
                        {e.type}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-gray-800">{e.item}</p>
                        <p className="text-[10px] text-gray-400 truncate">{e.site} · {e.worker.split(" ")[0]}</p>
                        <p className="text-[10px] text-gray-500 italic mt-0.5 leading-relaxed">"{e.reason}"</p>
                      </div>
                      <p className="text-[9px] text-gray-300 flex-shrink-0 mt-0.5">{e.date}</p>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
