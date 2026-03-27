import { useState } from "react";
import {
  Leaf, List, LayoutDashboard, CalendarDays, ClipboardCheck,
  Sprout, Layers, FileSpreadsheet, BarChart2, TrendingUp, TrendingDown,
  Minus, AlertTriangle, CheckCircle2, Clock, SkipForward,
  Target, ChevronDown, Download, DollarSign, TriangleAlert, Users,
  Map as MapIcon
} from "lucide-react";

const BRAND = "#00AECD";
const NAVY  = "#0f2a36";

function Sidebar({ active }: { active: string }) {
  const nav = [
    { icon: LayoutDashboard, label: "Dashboard",      id: "dashboard" },
    { icon: List,            label: "Asset Register" },
    { icon: MapIcon,         label: "Map",            id: "map" },
    { icon: CalendarDays,    label: "Schedule" },
    { icon: ClipboardCheck,  label: "Audits",          id: "audits" },
    { icon: Sprout,          label: "Infill Planting",  id: "planting" },
    { icon: Layers,          label: "Mulching",         id: "mulching" },
    { icon: FileSpreadsheet, label: "Specification",   id: "spec" },
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
            <div key={label}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${isActive ? "text-white" : "text-white/60 hover:text-white hover:bg-white/10"}`}
              style={isActive ? { background: BRAND } : {}}>
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
  { site: "Rātā St Entrance Beds",    auditor: "Jude Morison",  fail: "Weed cover >5%",             date: "24 Mar", severity: "high" },
  { site: "Mungavin Ave Hedges",       auditor: "Jude Morison",  fail: "Edging not vertical/smooth", date: "23 Mar", severity: "med"  },
  { site: "Cobham Ct Rose Garden",     auditor: "Tim Broadwith", fail: "Mulch depth <50mm",          date: "21 Mar", severity: "med"  },
  { site: "Waitangirua Memorial Park", auditor: "Tim Broadwith", fail: "Litter not fully removed",   date: "20 Mar", severity: "low"  },
  { site: "Elsdon Park Bush Edge",     auditor: "Jude Morison",  fail: "Plant coverage <95%",        date: "18 Mar", severity: "high" },
];

const EXCUSES = [
  { type: "task", worker: "Barry Lavakula",    site: "Tui Park Rose Garden",     item: "Mulch depth",         reason: "Supply not delivered. Rescheduled Fri.", date: "25 Mar" },
  { type: "task", worker: "Felise Maiava",     site: "Rātā St Entrance Beds",    item: "Pest & disease check", reason: "Products not stocked on van.",          date: "24 Mar" },
  { type: "site", worker: "Joe Daish",         site: "Steyne Ave Amenity Strip", item: "Full service",         reason: "Access blocked — contractor on site.",   date: "24 Mar" },
  { type: "task", worker: "June Rameka",       site: "Cobham Ct Rose Garden",    item: "Pruning",              reason: "Tool breakage. Reported to supervisor.", date: "22 Mar" },
  { type: "task", worker: "David Wos",         site: "Mungavin Ave Hedges",      item: "Edging",               reason: "Ground too wet after overnight rain.",   date: "21 Mar" },
  { type: "site", worker: "Tana Tanielu-Dick", site: "Waitangirua Sports Park",  item: "Full service",         reason: "Public event on site — deferred.",       date: "20 Mar" },
];

const PRODUCTIVITY = [
  { name: "Barry Lavakula",    initials: "BL", allocated: 38, actual: 41, sites: 6 },
  { name: "David Wos",         initials: "DW", allocated: 36, actual: 33, sites: 5 },
  { name: "Felise Maiava",     initials: "FM", allocated: 36, actual: 38, sites: 6 },
  { name: "Joe Daish",         initials: "JD", allocated: 34, actual: 34, sites: 5 },
  { name: "June Rameka",       initials: "JR", allocated: 38, actual: 36, sites: 6 },
  { name: "Tana Tanielu-Dick", initials: "TT", allocated: 32, actual: 29, sites: 4 },
];

const HOURLY_RATE = 35; // NZD per hour — garden worker rate

const COMPLETED_WORKS = [
  { date: "25 Mar", worker: "Barry Lavakula",    initials: "BL", site: "Tui Park Rose Garden",     allocated: 45,  actual: 48,  tasks: "7/8", pestPlants: 0 },
  { date: "25 Mar", worker: "Felise Maiava",     initials: "FM", site: "Rātā St Entrance Beds",    allocated: 60,  actual: 57,  tasks: "8/8", pestPlants: 1 },
  { date: "24 Mar", worker: "Joe Daish",         initials: "JD", site: "Cobham Court Amenity",     allocated: 90,  actual: 88,  tasks: "8/8", pestPlants: 0 },
  { date: "24 Mar", worker: "June Rameka",       initials: "JR", site: "Titahi Bay Esplanade",     allocated: 75,  actual: 79,  tasks: "7/8", pestPlants: 0 },
  { date: "23 Mar", worker: "David Wos",         initials: "DW", site: "Waitangirua Mall Entry",   allocated: 120, actual: 112, tasks: "8/8", pestPlants: 0 },
  { date: "23 Mar", worker: "Tana Tanielu-Dick", initials: "TT", site: "Mungavin Ave Berm",        allocated: 45,  actual: 42,  tasks: "8/8", pestPlants: 0 },
  { date: "22 Mar", worker: "Barry Lavakula",    initials: "BL", site: "Aotea Lagoon Reserve",     allocated: 90,  actual: 94,  tasks: "7/8", pestPlants: 0 },
  { date: "22 Mar", worker: "Felise Maiava",     initials: "FM", site: "Parumoana St Roundabout",  allocated: 45,  actual: 44,  tasks: "8/8", pestPlants: 0 },
  { date: "21 Mar", worker: "Joe Daish",         initials: "JD", site: "Kenepuru Landing",         allocated: 45,  actual: 52,  tasks: "6/8", pestPlants: 0 },
  { date: "20 Mar", worker: "David Wos",         initials: "DW", site: "Paremata Station Edge",    allocated: 30,  actual: 28,  tasks: "8/8", pestPlants: 0 },
];

const PEST_SIGHTINGS = [
  { site: "Aotea Lagoon Reserve",   species: "Tradescantia (Wandering Jew)", location: "NE corner near fence", worker: "Felise Maiava",  date: "18 Feb" },
  { site: "Kenepuru Landing",       species: "Old man's beard",              location: "South boundary",       worker: "Joe Daish",       date: "21 Mar" },
  { site: "Elsdon Reserve",         species: "Woolly nightshade",            location: "Western edge",         worker: "Barry Lavakula",  date: "5 Mar"  },
  { site: "Mungavin Ave Median",    species: "Tradescantia (Wandering Jew)", location: "Central bed",          worker: "Tana Tanielu-Dick", date: "20 Mar" },
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
          <Icon className="w-5 h-5" style={{ color: color || BRAND }} />
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
            <div className="w-full rounded-t-lg" style={{ height: `${w.pct}%`, background: w.current ? BRAND : `${stateColor[w.state]}40` }} />
            <span className="text-[10px] font-semibold text-gray-400">{w.label}</span>
            <span className="text-[9px] font-medium" style={{ color: stateColor[w.state] }}>{stateLabel[w.state]}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-4">
        {[["#22c55e","Ahead"],[BRAND,"On Target"],["#f97316","Behind"]].map(([c,l]) => (
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

  const worksToShow    = period === "week" ? COMPLETED_WORKS.slice(0, 6) : COMPLETED_WORKS;
  const totalCostHours = totalActual; // hours
  const totalCostNZD   = Math.round(totalCostHours * HOURLY_RATE);
  const budgetNZD      = period === "week" ? 8000 : 32000;
  const costVarPct     = Math.round(((totalCostNZD - budgetNZD) / budgetNZD) * 100);

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans text-sm">
      <Sidebar active="dashboard" />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="bg-white border-b px-8 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-xl font-black" style={{ color: NAVY }}>Dashboard</h1>
            <p className="text-xs text-gray-400">Operational performance · Porirua City Council Gardens</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-xl overflow-hidden border border-gray-200 text-[12px] font-semibold">
              {(["week","month"] as Period[]).map(p => (
                <button key={p} onClick={() => setPeriod(p)} className="px-4 py-2 capitalize transition-colors"
                  style={period === p ? { background: BRAND, color: "#fff" } : { background: "#fff", color: "#6b7280" }}>
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

          {/* Quick stat cards */}
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-gray-400 mb-3">This {period === "week" ? "Week" : "Month"} at a Glance</p>
            <div className="grid grid-cols-6 gap-4">
              <StatCard icon={AlertTriangle}  label="Audit Fails"       value={String(failsCount)}
                sub={`${period === "week" ? "2 high" : "4 high"} severity`}
                trend={period === "week" ? "+1 vs last wk" : "+2 vs last mo"} trendDir="up" color="#ef4444" />
              <StatCard icon={CheckCircle2}   label="Completed Sites"   value={period === "week" ? "14" : "52"}
                sub={`of ${period === "week" ? "18" : "60"} scheduled`}
                trend={period === "week" ? "78% rate" : "87% rate"} trendDir="flat" color="#22c55e" />
              <StatCard icon={Clock}          label="Team Productivity"  value={`${efficiencyPct}%`}
                sub={`${totalAllocated}h alloc · ${totalActual}h actual`}
                trend={`${totalActual > totalAllocated ? "+" : ""}${totalActual - totalAllocated}h`}
                trendDir={totalActual > totalAllocated ? "up" : "down"} color={BRAND} />
              <StatCard icon={SkipForward}    label="Excuses / Skips"   value={String(excuseCount)}
                sub={`${period === "week" ? "3 tasks · 1 site" : "4 tasks · 2 sites"} skipped`}
                trend="Logged to supervisor" trendDir="flat" color="#f59e0b" />
              <StatCard icon={Target}         label="Schedule State"     value="84%"
                sub="Week 12 completion rate" trend="On Target" trendDir="flat" color="#22c55e" />
              <StatCard icon={DollarSign}     label="Labour Cost"        value={`$${totalCostNZD.toLocaleString()}`}
                sub={`vs $${budgetNZD.toLocaleString()} budget`}
                trend={`${costVarPct > 0 ? "+" : ""}${costVarPct}% variance`}
                trendDir={costVarPct > 0 ? "up" : "down"} color={costVarPct > 5 ? "#ef4444" : "#22c55e"} />
            </div>
          </div>

          {/* Main 2-col layout */}
          <div className="grid grid-cols-2 gap-6">

            {/* ── Left column ── */}
            <div className="space-y-5">

              {/* Audit Fails */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold" style={{ color: NAVY }}>Audit Fails</h3>
                    <p className="text-[11px] text-gray-400">Sites that did not meet their Standard</p>
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

              {/* Pest plant sightings */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Leaf className="w-4 h-4 text-red-400" />
                    <div>
                      <h3 className="text-sm font-bold" style={{ color: NAVY }}>Pest Plant Sightings</h3>
                      <p className="text-[11px] text-gray-400">Logged by field workers during sign-off</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600">{PEST_SIGHTINGS.length} this month</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {PEST_SIGHTINGS.map((p, i) => (
                    <div key={i} className="px-5 py-3 flex items-start gap-3">
                      <TriangleAlert className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-gray-800">{p.species}</p>
                        <p className="text-[11px] text-gray-500 truncate">{p.site} — {p.location}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{p.worker} · {p.date}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Right column ── */}
            <div className="space-y-5">

              {/* Team Productivity + FTE Cost */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold" style={{ color: NAVY }}>Team Productivity & Labour Cost</h3>
                    <p className="text-[11px] text-gray-400">Actual vs allocated · @${HOURLY_RATE}/hr · {period === "week" ? "this week" : "this month"}</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg" style={{ background: `${BRAND}18`, color: BRAND }}>
                    <Users className="w-3.5 h-3.5" />6 workers
                  </div>
                </div>
                <div className="divide-y divide-gray-50">
                  {PRODUCTIVITY.map((w) => {
                    const over    = w.actual > w.allocated;
                    const pctDiff = Math.round(Math.abs(w.actual - w.allocated) / w.allocated * 100);
                    const cost    = Math.round(w.actual * HOURLY_RATE);
                    return (
                      <div key={w.name} className="px-5 py-3 flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ background: NAVY }}>
                          {w.initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-[12px] font-semibold text-gray-800">{w.name.split(" ")[0]}</p>
                            <div className="flex items-center gap-2">
                              <p className="text-[10px] text-gray-400">${cost.toLocaleString()}</p>
                              <p className={`text-[11px] font-bold ${over ? "text-red-500" : "text-green-500"}`}>
                                {over ? "+" : "-"}{pctDiff}%
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full"
                                style={{ width: `${Math.min((w.actual / w.allocated) * 100, 100)}%`, background: over ? "#ef4444" : BRAND }} />
                            </div>
                            <span className="text-[10px] text-gray-400 flex-shrink-0">{w.actual}h / {w.allocated}h</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Cost total row */}
                <div className="px-5 py-3 border-t bg-gray-50 flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-gray-500">Total labour cost this {period}</p>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-gray-400">Budget: ${budgetNZD.toLocaleString()}</span>
                    <span className={`text-sm font-black ${costVarPct > 0 ? "text-red-500" : "text-green-600"}`}>
                      ${totalCostNZD.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Excuses / Skips */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b">
                  <h3 className="text-sm font-bold" style={{ color: NAVY }}>Excuses & Skips</h3>
                  <p className="text-[11px] text-gray-400">Tasks and sites not completed · logged by worker</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {EXCUSES.slice(0, period === "week" ? 4 : 6).map((e, i) => (
                    <div key={i} className="px-5 py-3 flex items-start gap-3">
                      <span className={`mt-0.5 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0 ${
                        e.type === "site" ? "bg-red-50 text-red-500" : "bg-amber-50 text-amber-500"
                      }`}>{e.type}</span>
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

          {/* ── Completed Works section (full width) ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold" style={{ color: NAVY }}>Completed Works</h3>
                <p className="text-[11px] text-gray-400">
                  {worksToShow.length} jobs signed off · actual vs allocated · {period === "week" ? "this week" : "this month"}
                </p>
              </div>
              <button className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-1.5 text-[11px] text-gray-500 font-medium hover:bg-gray-50">
                <Download className="w-3 h-3" />Export
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  {["Date", "Worker", "Site", "Allocated", "Actual", "Variance", "Tasks", "Pest Plants", "Cost"].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {worksToShow.map((r, i) => {
                  const over    = r.actual > r.allocated;
                  const variance = r.actual - r.allocated;
                  const cost     = Math.round((r.actual / 60) * HOURLY_RATE);
                  return (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-2.5 text-[11px] text-gray-400">{r.date}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0" style={{ background: NAVY }}>{r.initials}</div>
                          <span className="text-[11px] font-medium text-gray-700">{r.worker.split(" ")[0]}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-[12px] font-medium text-gray-800">{r.site}</td>
                      <td className="px-4 py-2.5 text-[11px] text-gray-500">{r.allocated} min</td>
                      <td className="px-4 py-2.5 text-[11px] text-gray-700 font-medium">{r.actual} min</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[11px] font-bold ${over ? "text-red-500" : "text-green-600"}`}>
                          {over ? "+" : ""}{variance} min
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[11px] font-medium ${r.tasks === "8/8" ? "text-green-600" : "text-amber-600"}`}>{r.tasks}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {r.pestPlants > 0
                          ? <span className="flex items-center gap-1 text-[11px] font-medium text-red-500"><Leaf className="w-3 h-3" />{r.pestPlants} logged</span>
                          : <span className="text-[11px] text-gray-300">—</span>
                        }
                      </td>
                      <td className="px-4 py-2.5 text-[11px] text-gray-500">${cost}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={3} className="px-4 py-2.5 text-[11px] font-bold text-gray-600">Totals</td>
                  <td className="px-4 py-2.5 text-[11px] font-bold text-gray-600">
                    {worksToShow.reduce((s, r) => s + r.allocated, 0)} min
                  </td>
                  <td className="px-4 py-2.5 text-[11px] font-bold text-gray-600">
                    {worksToShow.reduce((s, r) => s + r.actual, 0)} min
                  </td>
                  <td className="px-4 py-2.5">
                    {(() => {
                      const v = worksToShow.reduce((s, r) => s + (r.actual - r.allocated), 0);
                      return <span className={`text-[11px] font-bold ${v > 0 ? "text-red-500" : "text-green-600"}`}>{v > 0 ? "+" : ""}{v} min</span>;
                    })()}
                  </td>
                  <td className="px-4 py-2.5 text-[11px] font-bold text-gray-600">
                    {worksToShow.filter(r => r.tasks === "8/8").length}/{worksToShow.length} full
                  </td>
                  <td className="px-4 py-2.5 text-[11px] font-bold text-red-500">
                    {worksToShow.reduce((s, r) => s + r.pestPlants, 0) > 0
                      ? `${worksToShow.reduce((s, r) => s + r.pestPlants, 0)} sightings`
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-[11px] font-bold text-gray-600">
                    ${worksToShow.reduce((s, r) => s + Math.round((r.actual / 60) * HOURLY_RATE), 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

        </div>
      </div>
    </div>
  );
}
