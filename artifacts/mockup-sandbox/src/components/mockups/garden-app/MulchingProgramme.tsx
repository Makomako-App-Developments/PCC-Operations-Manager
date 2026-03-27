import { useState, useMemo } from "react";
import {
  LayoutDashboard, List, CalendarDays, ClipboardCheck, Sprout,
  FileSpreadsheet, BarChart2, X, Layers, CheckCircle2, Clock,
  AlertTriangle, AlertCircle, Zap, ChevronRight, CalendarRange,
  TrendingUp, Truck, Info, Download, ChevronDown, FileText, Table2,
  Map as MapIcon
} from "lucide-react";

const BRAND = "#00AECD";
const NAVY  = "#0f2a36";

// ─── Mulch rules (from PCC Horticulture Maintenance Spec) ────────────────────

// Types that DO require 50mm mulch, topped up every 9–12 months
const MULCH_REQUIRED = new Set([
  "Roses & Perennials", "Ornamental", "Amenity",
  "Reveg", "Bush", "Hedge", "Tree Planter/Pits",
]);
// NOT mulched: Annuals (disturbed at each planting), Rain Garden (permeable surface must stay clear)

// ─── Data types ──────────────────────────────────────────────────────────────

interface MulchAsset {
  id: string;
  name: string;
  code: string;
  type: string;
  standard: "High" | "Medium" | "Low";
  area: number;           // m² (planting area only — hard surfaces excluded)
  team: string;
  lastMulchDate: string;  // "MMM YYYY"
  cycleMonths: number;    // default 10 (midpoint of 9–12)
  visitFreq: string;      // for display
  nextVisit: string;      // "D MMM YYYY" — next scheduled maintenance visit
  scheduledMulch?: { team: string; date: string; estMins: number };
}

// ─── Seed data ───────────────────────────────────────────────────────────────

const ASSETS: MulchAsset[] = [
  {
    id: "M1", name: "Waitangirua Mall Entry", code: "GRD-0022",
    type: "Roses & Perennials", standard: "High",
    area: 45, team: "Mobile 1", lastMulchDate: "Feb 2025", cycleMonths: 10,
    visitFreq: "Weekly", nextVisit: "30 Mar 2026",
  },
  {
    id: "M2", name: "Kenepuru Landing", code: "GRD-0558",
    type: "Reveg", standard: "Medium",
    area: 180, team: "CBD", lastMulchDate: "Mar 2025", cycleMonths: 10,
    visitFreq: "Monthly", nextVisit: "1 Apr 2026",
  },
  {
    id: "M3", name: "Cobham Court", code: "GRD-0031",
    type: "Ornamental", standard: "High",
    area: 30, team: "Mobile 1", lastMulchDate: "Jun 2025", cycleMonths: 10,
    visitFreq: "Weekly", nextVisit: "2 Apr 2026",
  },
  {
    id: "M4", name: "Mungavin Ave Berm", code: "GRD-0145",
    type: "Amenity", standard: "Medium",
    area: 25, team: "Mobile 1", lastMulchDate: "May 2025", cycleMonths: 10,
    visitFreq: "Fortnightly", nextVisit: "1 Apr 2026",
  },
  {
    id: "M5", name: "Aotea Lagoon Reserve", code: "GRD-0287",
    type: "Reveg", standard: "Medium",
    area: 350, team: "Mobile 2", lastMulchDate: "Aug 2025", cycleMonths: 10,
    visitFreq: "Fortnightly", nextVisit: "8 Apr 2026",
  },
  {
    id: "M6", name: "Titahi Bay Esplanade", code: "GRD-0412",
    type: "Amenity", standard: "Medium",
    area: 65, team: "Mobile 2", lastMulchDate: "Jul 2025", cycleMonths: 10,
    visitFreq: "Fortnightly", nextVisit: "9 Apr 2026",
  },
  {
    id: "M7", name: "Paremata Station", code: "GRD-0789",
    type: "Bush", standard: "Low",
    area: 480, team: "CBD", lastMulchDate: "Nov 2025", cycleMonths: 12,
    visitFreq: "Bimonthly", nextVisit: "Oct 2026",
  },
  {
    id: "M8", name: "Elsdon Reserve", code: "GRD-0714",
    type: "Ornamental", standard: "High",
    area: 40, team: "Mobile 2", lastMulchDate: "Aug 2025", cycleMonths: 10,
    visitFreq: "Monthly", nextVisit: "5 Apr 2026",
  },
];

// Excluded (shown as reference only)
const EXCLUDED = [
  { name: "Festival Beds — Cobham", type: "Annuals",    reason: "Annuals — mulch would impede replanting" },
  { name: "Mungavin Rain Garden",   type: "Rain Garden", reason: "Permeable surface must remain clear" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const NOW_MONTH   = 2;  // March (0-indexed)
const NOW_YEAR    = 2026;
const NOW_DAY     = 27;

function parseMY(s: string): { m: number; y: number } {
  const [mn, yr] = s.split(" ");
  return { m: MONTH_NAMES.indexOf(mn), y: parseInt(yr) };
}
function addMY(s: string, months: number): string {
  let { m, y } = parseMY(s);
  m += months;
  while (m >= 12) { m -= 12; y++; }
  return `${MONTH_NAMES[m]} ${y}`;
}
function diffMonths(fromM: number, fromY: number, toM: number, toY: number) {
  return (toY - fromY) * 12 + (toM - fromM);
}

function dueDate(a: MulchAsset): string {
  return addMY(a.lastMulchDate, a.cycleMonths);
}
function dueMonthsFromNow(a: MulchAsset): number {
  const { m, y } = parseMY(dueDate(a));
  return diffMonths(NOW_MONTH, NOW_YEAR, m, y);
}
function volumeM3(a: MulchAsset): number {
  return +(0.05 * a.area).toFixed(2);  // 50mm × area(m²) = volume(m³)
}
function elapsedMonths(a: MulchAsset): number {
  const { m, y } = parseMY(a.lastMulchDate);
  return diffMonths(m, y, NOW_MONTH, NOW_YEAR);
}
function degradationPct(a: MulchAsset): number {
  return Math.min(100, Math.round((elapsedMonths(a) / a.cycleMonths) * 100));
}

type Status = "overdue" | "due" | "upcoming" | "far" | "scheduled";

function status(a: MulchAsset): Status {
  if (a.scheduledMulch) return "scheduled";
  const d = dueMonthsFromNow(a);
  if (d < 0) return "overdue";
  if (d === 0) return "due";
  if (d <= 3) return "upcoming";
  return "far";
}

// Is the next scheduled visit within ~4 weeks of the mulch due date?
function combineOpportunity(a: MulchAsset): string | null {
  const s = status(a);
  if (s === "scheduled" || s === "far") return null;
  if (a.nextVisit.startsWith("Oct") || a.nextVisit.startsWith("Nov") || a.nextVisit.startsWith("Dec")) return null;
  if (["overdue","due","upcoming"].includes(s)) return a.nextVisit;
  return null;
}

function statusLabel(s: Status) {
  return s === "overdue" ? "Overdue" : s === "due" ? "Due this month"
       : s === "upcoming" ? "Upcoming" : s === "far" ? "Planned" : "Scheduled";
}
function statusColor(s: Status) {
  return s === "overdue" ? "bg-red-100 text-red-700 border-red-200"
       : s === "due"      ? "bg-amber-100 text-amber-700 border-amber-200"
       : s === "upcoming" ? "bg-blue-50 text-blue-700 border-blue-200"
       : s === "far"      ? "bg-gray-100 text-gray-500 border-gray-200"
       : "bg-green-100 text-green-700 border-green-200";
}
function standardBadge(s: "High"|"Medium"|"Low") {
  return s === "High" ? "bg-rose-100 text-rose-700"
       : s === "Medium" ? "bg-amber-50 text-amber-700"
       : "bg-emerald-50 text-emerald-700";
}
function fmtVol(v: number) {
  return v >= 10 ? `${v.toFixed(1)} m³` : `${v.toFixed(2)} m³`;
}

// ─── Capacity heatmap (same logic as InfillPlanting) ─────────────────────────

const PRODUCTIVE_MIN = 360;
const MAX_CAP_MIN    = 480;

const WEEK_DAYS: { label: string; date: string }[] = [
  { label: "Mon", date: "30 Mar" }, { label: "Tue", date: "31 Mar" },
  { label: "Wed", date: "1 Apr"  }, { label: "Thu", date: "2 Apr"  },
  { label: "Fri", date: "3 Apr"  },
  { label: "Mon", date: "6 Apr"  }, { label: "Tue", date: "7 Apr"  },
  { label: "Wed", date: "8 Apr"  }, { label: "Thu", date: "9 Apr"  },
  { label: "Fri", date: "10 Apr" },
  { label: "Mon", date: "13 Apr" }, { label: "Tue", date: "14 Apr" },
  { label: "Wed", date: "15 Apr" }, { label: "Thu", date: "16 Apr" },
  { label: "Fri", date: "17 Apr" },
];

const TEAM_BASE: Record<string, number[]> = {
  "Mobile 1": [280, 315, 375, 250, 120,  320, 360, 110, 290, 260,  295, 320, 375, 80,  270],
  "Mobile 2": [165, 90,  165, 75,  90,   165, 90,  75,  165, 60,   90,  165, 75,  90,  60 ],
  "CBD":      [45,  0,   90,  45,  0,    45,  0,   45,  0,   45,   45,  0,   45,  0,   45 ],
};

function capBand(m: number): "green" | "amber" | "red" {
  return m > MAX_CAP_MIN ? "red" : m > PRODUCTIVE_MIN ? "amber" : "green";
}
function capColor(b: "green" | "amber" | "red") {
  return b === "green" ? "#16a34a" : b === "amber" ? "#d97706" : "#dc2626";
}
function capBg(b: "green" | "amber" | "red") {
  return b === "green" ? "bg-green-100 border-green-300 text-green-800"
       : b === "amber" ? "bg-amber-50 border-amber-300 text-amber-800"
       : "bg-red-50 border-red-300 text-red-700";
}
function fmtM(m: number) {
  const h = Math.floor(m / 60), r = m % 60;
  return h > 0 ? `${h}h${r > 0 ? ` ${r}m` : ""}` : `${r}m`;
}

// Mulch application time estimate: ~15 min per m³ (wheelbarrow + spread + rake)
function mulchMins(a: MulchAsset): number {
  return Math.max(30, Math.round(volumeM3(a) * 15));
}

// ─── Schedule Modal ───────────────────────────────────────────────────────────

interface ScheduleModalProps {
  asset: MulchAsset;
  onClose: () => void;
  onSave: (team: string, date: string, estMins: number) => void;
}

function ScheduleModal({ asset, onClose, onSave }: ScheduleModalProps) {
  const vol     = volumeM3(asset);
  const defaultMins = mulchMins(asset);
  const [selTeam, setSelTeam] = useState(asset.team);
  const [selDay,  setSelDay]  = useState<{ label: string; date: string; scheduled: number } | null>(null);
  const [estMins, setEstMins] = useState(defaultMins);
  const [contingencyOk, setContingencyOk] = useState(false);

  const combine = combineOpportunity(asset);

  const calDays = WEEK_DAYS.map((d, i) => ({
    ...d, scheduled: TEAM_BASE[selTeam][i],
  }));

  const dayTotal      = selDay ? selDay.scheduled + estMins : 0;
  const resolvedTotal = dayTotal;  // no conflict resolution in this simpler flow
  const dayBand       = selDay ? capBand(resolvedTotal) : "green";
  const overMax       = resolvedTotal > MAX_CAP_MIN;
  const canConfirm    = selDay && !overMax && (dayBand !== "amber" || contingencyOk);

  const pickTeam = (t: string) => { setSelTeam(t); setSelDay(null); setContingencyOk(false); };
  const pickDay  = (d: typeof calDays[0]) => { setSelDay(d); setContingencyOk(false); };
  const teamGreen = (t: string) => WEEK_DAYS.filter((_, i) => capBand(TEAM_BASE[t][i] + estMins) === "green").length;

  // Check if the selected day matches the next scheduled visit date
  const isMatchVisit = selDay && combine && combine.includes(selDay.date.split(" ")[0]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="px-6 py-4 border-b flex items-start justify-between flex-shrink-0">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Schedule Mulch Job — {asset.name}</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {asset.type} · {asset.area} m² · <strong>{fmtVol(vol)}</strong> of mulch at 50mm depth
            </p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Smart combine banner */}
          {combine && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
              <Zap className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-800">Combine opportunity</p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  {asset.team} is already scheduled to visit {asset.name} on <strong>{combine}</strong>.
                  Pick that date to fold the mulch job into the existing visit — no extra travel.
                </p>
              </div>
            </div>
          )}

          {/* Volume summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 text-center">
              <p className="text-[10px] text-gray-400 font-medium">Area</p>
              <p className="text-lg font-bold text-gray-900 mt-0.5">{asset.area} m²</p>
            </div>
            <div className="p-3 rounded-xl bg-teal-50 border border-teal-100 text-center">
              <p className="text-[10px] text-teal-600 font-medium">Volume @ 50mm</p>
              <p className="text-lg font-bold text-teal-700 mt-0.5">{fmtVol(vol)}</p>
              <p className="text-[9px] text-teal-500">0.05 m × {asset.area} m²</p>
            </div>
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 text-center">
              <p className="text-[10px] text-gray-400 font-medium">Next top-up</p>
              <p className="text-sm font-bold text-gray-900 mt-0.5">{addMY("Apr 2026", asset.cycleMonths)}</p>
              <p className="text-[9px] text-gray-400">+{asset.cycleMonths} months</p>
            </div>
          </div>

          {/* Estimated time */}
          <div className="flex items-center gap-4 p-3 rounded-xl bg-gray-50 border border-gray-100">
            <div className="flex-1">
              <p className="text-xs font-semibold text-gray-700">Estimated application time</p>
              <p className="text-[10px] text-gray-400">~15 min/m³ (wheelbarrow, spread, rake) · adjust if needed</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setEstMins(m => Math.max(15, m - 15))} className="w-7 h-7 rounded-lg bg-white border text-sm font-bold text-gray-600 hover:bg-gray-100">−</button>
              <span className="text-sm font-bold text-gray-900 w-12 text-center">{fmtM(estMins)}</span>
              <button onClick={() => setEstMins(m => m + 15)} className="w-7 h-7 rounded-lg bg-white border text-sm font-bold text-gray-600 hover:bg-gray-100">+</button>
            </div>
          </div>

          {/* Team selector */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">Assign to team</p>
            <div className="flex gap-2">
              {["Mobile 1", "Mobile 2", "CBD"].map(t => {
                const g = teamGreen(t);
                const active = selTeam === t;
                const isAssetTeam = t === asset.team;
                return (
                  <button key={t} onClick={() => pickTeam(t)}
                    className={`flex-1 p-3 rounded-xl border-2 text-left transition-all ${active ? "border-[#00AECD] bg-[#00AECD08]" : "border-gray-200 hover:border-gray-300 bg-white"}`}>
                    <div className="flex items-center gap-1.5">
                      <p className={`text-xs font-bold ${active ? "text-[#00AECD]" : "text-gray-700"}`}>{t}</p>
                      {isAssetTeam && <span className="text-[9px] bg-[#00AECD] text-white px-1.5 py-0.5 rounded-full">asset team</span>}
                    </div>
                    <div className="flex gap-0.5 mt-1">
                      {WEEK_DAYS.map((_, i) => {
                        const b = capBand(TEAM_BASE[t][i] + estMins);
                        return <div key={i} className="w-1.5 h-3 rounded-sm" style={{ background: capColor(b) }} />;
                      })}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">{g} of 15 days free</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3-week heatmap */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">
              Pick a date — capacity after adding mulch job ({fmtM(estMins)})
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              {["Week 1 (30 Mar)", "Week 2 (6 Apr)", "Week 3 (13 Apr)"].map(w => (
                <div key={w} className="col-span-5 text-[10px] text-gray-400 font-semibold uppercase tracking-wide pt-1">{w}</div>
              )).reduce((acc: JSX.Element[], el, wi) => {
                const slice = calDays.slice(wi * 5, wi * 5 + 5);
                return [...acc, el, ...slice.map(d => {
                  const total = d.scheduled + estMins;
                  const band  = capBand(total);
                  const isSel = selDay?.date === d.date;
                  const isCombine = combine && combine.includes(d.date.split(" ")[0]);
                  return (
                    <button key={d.date} onClick={() => pickDay(d)}
                      className={`p-2 rounded-xl border-2 text-left transition-all relative ${isSel ? "ring-2 ring-offset-1 ring-[#00AECD]" : "hover:opacity-90"} ${capBg(band)}`}>
                      {isCombine && (
                        <span className="absolute top-1 right-1">
                          <Zap className="w-2.5 h-2.5 text-amber-500" />
                        </span>
                      )}
                      <p className="text-[10px] font-bold">{d.label}</p>
                      <p className="text-[10px] leading-tight">{d.date}</p>
                      <p className="text-[9px] mt-1 font-semibold">{fmtM(total)}</p>
                    </button>
                  );
                })];
              }, [])}
            </div>
            <div className="flex flex-wrap gap-4 mt-2">
              {(["green","amber","red"] as const).map(b => (
                <span key={b} className="flex items-center gap-1.5 text-[10px] text-gray-500">
                  <span className="w-3 h-3 rounded-sm" style={{ background: capColor(b) }} />
                  {b === "green" ? "Within target (≤6h)" : b === "amber" ? "Contingency (6–8h)" : "Over maximum (>8h)"}
                </span>
              ))}
              <span className="flex items-center gap-1.5 text-[10px] text-amber-600">
                <Zap className="w-3 h-3" /> Scheduled visit — combine here
              </span>
            </div>
          </div>

          {/* Selected day panel */}
          {selDay && (
            <div className={`rounded-xl border-2 overflow-hidden ${capBg(dayBand)}`}>
              <div className="px-4 py-3 border-b border-current/20 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold">{selDay.label} {selDay.date}</p>
                  <p className="text-[11px] mt-0.5">
                    {fmtM(selDay.scheduled)} scheduled + {fmtM(estMins)} mulch = <strong>{fmtM(dayTotal)}</strong>
                  </p>
                </div>
                {dayBand === "green" && <CheckCircle2 className="w-5 h-5 text-green-600" />}
                {dayBand === "amber" && <AlertCircle className="w-5 h-5 text-amber-500" />}
                {dayBand === "red"   && <AlertTriangle className="w-5 h-5 text-red-500" />}
              </div>
              <div className="px-4 py-3 space-y-2">
                {isMatchVisit && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-100 border border-amber-200">
                    <Zap className="w-3.5 h-3.5 text-amber-600" />
                    <p className="text-[11px] font-semibold text-amber-800">Combined with scheduled visit — no additional travel cost</p>
                  </div>
                )}
                {dayBand === "green" && (
                  <p className="text-xs text-green-800">✓ Fits within the 6-hour productive target. Ready to confirm.</p>
                )}
                {dayBand === "amber" && !contingencyOk && (
                  <>
                    <p className="text-xs text-amber-800">Uses <strong>{fmtM(resolvedTotal - PRODUCTIVE_MIN)}</strong> of contingency buffer (between 6h and 8h max). Authorise to proceed.</p>
                    <button onClick={() => setContingencyOk(true)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-white hover:bg-amber-600">
                      Authorise Additional Hours
                    </button>
                  </>
                )}
                {dayBand === "amber" && contingencyOk && (
                  <p className="text-xs flex items-center gap-1.5 text-green-700 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Contingency authorised — team approved to work up to 8 hours.
                  </p>
                )}
                {dayBand === "red" && (
                  <p className="text-xs text-red-700">Team is over the 8-hour maximum on this day. Choose a greener day or reduce the estimated time.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between flex-shrink-0">
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
          <button
            disabled={!canConfirm}
            onClick={() => { onSave(selTeam, selDay!.date + " 2026", estMins); onClose(); }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
            style={{ background: BRAND }}>
            <CheckCircle2 className="w-4 h-4" />
            {selDay ? `Schedule for ${selTeam} — ${selDay.date}` : "Select a date above"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Forward programme (12-month timeline) ────────────────────────────────────

function ForwardProgramme({ assets, onSchedule }: { assets: MulchAsset[]; onSchedule: (a: MulchAsset) => void }) {
  // Group assets by due month (Apr 2026 – Mar 2027), then add second cycle
  const months: { label: string; items: { asset: MulchAsset; vol: number; isCycle2: boolean }[] }[] = [];

  for (let i = 0; i < 12; i++) {
    let m = NOW_MONTH + i, y = NOW_YEAR;
    if (m >= 12) { m -= 12; y++; }
    const label = `${MONTH_NAMES[m]} ${y}`;
    const items: { asset: MulchAsset; vol: number; isCycle2: boolean }[] = [];

    assets.forEach(a => {
      const due = parseMY(dueDate(a));
      // Cycle 1
      if (due.m === m && due.y === y) items.push({ asset: a, vol: volumeM3(a), isCycle2: false });
      // Cycle 2 (10 months after cycle 1)
      const due2 = parseMY(addMY(dueDate(a), a.cycleMonths));
      if (due2.m === m && due2.y === y) items.push({ asset: a, vol: volumeM3(a), isCycle2: true });
    });

    months.push({ label, items });
  }

  const totalFwd = months.reduce((s, mo) => s + mo.items.reduce((ss, i) => ss + i.vol, 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-3 rounded-xl bg-teal-50 border border-teal-100">
        <TrendingUp className="w-4 h-4 text-teal-600" />
        <div>
          <p className="text-xs font-bold text-teal-800">12-month forward programme</p>
          <p className="text-[11px] text-teal-700">
            {assets.length} assets · <strong>{totalFwd.toFixed(1)} m³</strong> total mulch over 12 months
          </p>
        </div>
      </div>

      {months.filter(mo => mo.items.length > 0).map(mo => {
        const monthVol = mo.items.reduce((s, i) => s + i.vol, 0);
        return (
          <div key={mo.label}>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-bold text-gray-700">{mo.label}</p>
              <span className="text-[10px] text-gray-400">{fmtVol(monthVol)} total</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>
            <div className="space-y-1.5">
              {mo.items.map(({ asset: a, vol, isCycle2 }) => {
                const s = status(a);
                const canSched = !a.scheduledMulch && (s === "overdue" || s === "due" || s === "upcoming");
                return (
                  <div key={`${a.id}-${isCycle2 ? "c2" : "c1"}`}
                    className="flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-100 hover:border-gray-200 transition-colors">
                    <div className={`w-2 h-8 rounded-full flex-shrink-0 ${s === "overdue" ? "bg-red-400" : s === "due" ? "bg-amber-400" : s === "upcoming" ? "bg-blue-400" : "bg-green-400"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-gray-900 truncate">{a.name}</p>
                        {isCycle2 && <span className="text-[9px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full">2nd cycle</span>}
                        {a.scheduledMulch && <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">✓ Scheduled</span>}
                      </div>
                      <p className="text-[10px] text-gray-400">{a.team} · {a.type} · {a.area} m²</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-teal-700">{fmtVol(vol)}</p>
                      <p className="text-[9px] text-gray-400">@ 50mm</p>
                    </div>
                    {canSched && !isCycle2 && (
                      <button onClick={() => onSchedule(a)}
                        className="text-[10px] font-semibold px-2.5 py-1.5 rounded-lg text-white flex-shrink-0"
                        style={{ background: BRAND }}>
                        Schedule
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const NAV = [
  { icon: LayoutDashboard, label: "Dashboard"      },
  { icon: List,            label: "Asset Register" },
  { icon: MapIcon,         label: "Map",           id: "map" },
  { icon: CalendarDays,    label: "Schedule"       },
  { icon: ClipboardCheck,  label: "Audits"         },
  { icon: Sprout,          label: "Infill Planting"},
  { icon: Layers,          label: "Mulching",       active: true },
  { icon: FileSpreadsheet, label: "Specification"  },
  { icon: BarChart2,       label: "Reports"        },
];

function Sidebar() {
  return (
    <aside className="w-56 flex-shrink-0 flex flex-col" style={{ background: NAVY }}>
      <div className="px-5 py-5">
        <div className="text-white font-bold text-sm tracking-tight">poriruacity</div>
        <div className="text-xs mt-0.5" style={{ color: BRAND }}>GARDENS MANAGER</div>
      </div>
      <nav className="flex-1 px-2 space-y-0.5">
        {NAV.map(n => (
          <div key={n.label}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm cursor-pointer transition-colors ${
              n.active ? "text-white font-semibold" : "text-white/50 hover:text-white/80 hover:bg-white/5"
            }`}
            style={n.active ? { background: BRAND } : {}}>
            <n.icon className="w-4 h-4 flex-shrink-0" />
            <span>{n.label}</span>
          </div>
        ))}
      </nav>
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold">DB</div>
          <div>
            <p className="text-white text-xs font-semibold">Daniela Biaggio</p>
            <p className="text-white/40 text-[10px]">Urban Ecology Manager</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── Asset card ───────────────────────────────────────────────────────────────

function AssetCard({ asset, onSchedule, onComplete }: {
  asset: MulchAsset;
  onSchedule: () => void;
  onComplete: () => void;
}) {
  const s   = status(asset);
  const vol = volumeM3(asset);
  const deg = degradationPct(asset);
  const due = dueDate(asset);
  const comb = combineOpportunity(asset);

  const degColor = deg >= 100 ? "bg-red-400" : deg >= 80 ? "bg-amber-400" : "bg-green-400";

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 hover:border-gray-200 transition-colors">
      <div className="flex items-start gap-4">
        {/* Left: icon */}
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${BRAND}18` }}>
          <Layers className="w-5 h-5" style={{ color: BRAND }} />
        </div>

        {/* Middle: info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <p className="text-sm font-bold text-gray-900">{asset.name}</p>
            <span className="text-[10px] text-gray-400">{asset.code}</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusColor(s)}`}>
              {statusLabel(s)}
            </span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${standardBadge(asset.standard)}`}>
              {asset.standard}
            </span>
          </div>
          <p className="text-[11px] text-gray-500">
            {asset.type} · {asset.team} · {asset.visitFreq} visit
          </p>

          {/* Degradation bar */}
          <div className="mt-2 mb-1">
            <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
              <span>Mulch degradation — {deg}% through {asset.cycleMonths}-month cycle</span>
              <span>Last: {asset.lastMulchDate} → Due: {due}</span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${degColor}`} style={{ width: `${Math.min(100, deg)}%` }} />
            </div>
          </div>

          {/* Volume + next visit */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-gray-500">
            <span className="flex items-center gap-1">
              <Truck className="w-3 h-3 text-teal-500" />
              <strong className="text-teal-700">{fmtVol(vol)}</strong> @ 50mm depth
              <span className="text-gray-300 mx-1">·</span>
              <span className="text-gray-400">{asset.area} m² × 0.05 m</span>
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-gray-400" />
              ~{fmtM(mulchMins(asset))} application time
            </span>
            {comb && (
              <span className="flex items-center gap-1 text-amber-600 font-semibold">
                <Zap className="w-3 h-3" />
                Combine with {asset.team} visit {comb}
              </span>
            )}
            {asset.scheduledMulch && (
              <span className="flex items-center gap-1 text-green-600 font-semibold">
                <CheckCircle2 className="w-3 h-3" />
                Scheduled {asset.scheduledMulch.team} · {asset.scheduledMulch.date}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 flex-shrink-0">
          {!asset.scheduledMulch ? (
            <button onClick={onSchedule}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
              style={{ background: BRAND }}>
              <CalendarDays className="w-3.5 h-3.5" />
              Schedule
            </button>
          ) : (
            <button onClick={onComplete}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-green-600">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Mark Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Export helpers ───────────────────────────────────────────────────────────

function exportCSV(assets: MulchAsset[]) {
  const headers = [
    "Asset Code", "Site Name", "Type", "Standard", "Area (m²)", "Volume (m³)",
    "Last Mulched", "Due Date", "Status", "Months Remaining",
    "Scheduled Date", "Assigned Team", "Est. Time (min)",
  ];
  const rows = assets.map(a => {
    const s   = status(a);
    const vol = volumeM3(a);
    return [
      a.code, a.name, a.type, a.standard,
      a.area, vol.toFixed(2),
      a.lastMulchDate, dueDate(a), statusLabel(s), dueMonthsFromNow(a),
      a.scheduledMulch?.date ?? "",
      a.scheduledMulch?.team ?? a.team,
      mulchMins(a),
    ];
  });
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  link.download = "mulching-programme.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function exportPDF(assets: MulchAsset[]) {
  const statusColour: Record<Status, string> = {
    overdue:   "#dc2626",
    due:       "#d97706",
    upcoming:  "#2563eb",
    far:       "#64748b",
    scheduled: "#16a34a",
  };
  const tableRows = assets.map(a => {
    const s   = status(a);
    const vol = volumeM3(a);
    return `<tr>
      <td>${a.code}</td>
      <td><strong>${a.name}</strong></td>
      <td>${a.type}</td>
      <td>${a.standard}</td>
      <td style="text-align:right">${a.area}</td>
      <td style="text-align:right">${fmtVol(vol)}</td>
      <td>${a.lastMulchDate}</td>
      <td>${dueDate(a)}</td>
      <td style="color:${statusColour[s]};font-weight:600">${statusLabel(s)}</td>
      <td>${a.scheduledMulch?.date ?? "—"}</td>
      <td>${a.scheduledMulch?.team ?? a.team}</td>
      <td style="text-align:right">${mulchMins(a)} min</td>
    </tr>`;
  }).join("");

  const totalVol = assets.reduce((s, a) => s + volumeM3(a), 0).toFixed(1);
  const today    = new Date().toLocaleDateString("en-NZ", { day:"numeric", month:"long", year:"numeric" });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Mulching Programme — Porirua City Council</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #222; padding: 24px 32px; }
    .header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; border-bottom: 3px solid #00AECD; padding-bottom: 14px; }
    .header-left h1 { font-size: 18px; color: #0f2a36; font-weight: 800; }
    .header-left p  { color: #666; margin-top: 3px; font-size: 11px; }
    .header-right   { text-align: right; color: #666; font-size: 10px; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: #0f2a36; color: #fff; padding: 6px 8px; text-align: left; font-size: 10px; letter-spacing: 0.03em; }
    td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: middle; }
    tr:nth-child(even) td { background: #f8fafc; }
    .summary { display: flex; gap: 24px; font-size: 11px; color: #444; margin-bottom: 16px; }
    .summary span { font-weight: 700; }
    .footer { margin-top: 12px; font-size: 10px; color: #aaa; }
    .actions { margin-top: 20px; display: flex; gap: 10px; }
    .btn { padding: 9px 22px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; }
    .btn-primary { background: #00AECD; color: #fff; }
    .btn-secondary { background: #f3f4f6; color: #374151; }
    @media print {
      .actions { display: none; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <h1>Mulching Programme</h1>
      <p>Porirua City Council — Gardens &amp; Ecology · 50 mm application depth · 9–12 month cycle</p>
    </div>
    <div class="header-right">
      Exported ${today}<br/>
      Prepared by: Gardens Manager<br/>
      DRAFT — for internal use
    </div>
  </div>

  <div class="summary">
    <div>Total assets: <span>${assets.length}</span></div>
    <div>Total volume required: <span>${totalVol} m³</span></div>
    <div>Overdue: <span style="color:#dc2626">${assets.filter(a => status(a) === "overdue").length}</span></div>
    <div>Due this month: <span style="color:#d97706">${assets.filter(a => status(a) === "due").length}</span></div>
    <div>Scheduled: <span style="color:#16a34a">${assets.filter(a => status(a) === "scheduled").length}</span></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Code</th><th>Site</th><th>Type</th><th>Standard</th>
        <th>Area (m²)</th><th>Volume</th><th>Last Mulched</th><th>Due</th>
        <th>Status</th><th>Scheduled</th><th>Team</th><th>Est. Time</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>

  <div class="footer">
    PCC Gardens Manager · ${assets.length} assets listed · Volume based on 50mm depth × planting area · Time estimates at 15 min/m³
  </div>

  <div class="actions">
    <button class="btn btn-primary" onclick="window.print()">Print / Save as PDF</button>
    <button class="btn btn-secondary" onclick="window.close()">Close</button>
  </div>
</body>
</html>`;

  const w = window.open("", "_blank", "width=1100,height=750");
  if (w) { w.document.write(html); w.document.close(); }
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MulchingProgramme() {
  const [assets, setAssets] = useState<MulchAsset[]>(ASSETS);
  const [filter, setFilter] = useState<"all" | "overdue" | "due" | "upcoming" | "scheduled" | "combine">("all");
  const [modalTarget, setModalTarget] = useState<MulchAsset | null>(null);
  const [view, setView] = useState<"programme" | "forward">("programme");
  const [showExportMenu, setShowExportMenu] = useState(false);

  const stats = useMemo(() => ({
    total:     assets.length,
    overdue:   assets.filter(a => status(a) === "overdue").length,
    due:       assets.filter(a => status(a) === "due").length,
    scheduled: assets.filter(a => status(a) === "scheduled").length,
    combines:  assets.filter(a => combineOpportunity(a) !== null).length,
    pendingVol: assets.filter(a => !a.scheduledMulch && ["overdue","due","upcoming"].includes(status(a)))
                      .reduce((s, a) => s + volumeM3(a), 0),
  }), [assets]);

  const filtered = useMemo(() => {
    if (filter === "all")      return assets;
    if (filter === "combine")  return assets.filter(a => combineOpportunity(a) !== null);
    return assets.filter(a => status(a) === filter);
  }, [assets, filter]);

  const saveSchedule = (id: string, team: string, date: string, estMins: number) => {
    setAssets(prev => prev.map(a => a.id === id
      ? { ...a, scheduledMulch: { team, date, estMins } }
      : a
    ));
  };
  const markDone = (id: string) => {
    setAssets(prev => prev.map(a => a.id === id
      ? { ...a, scheduledMulch: undefined, lastMulchDate: "Mar 2026" }
      : a
    ));
  };

  const FILTERS: { key: typeof filter; label: string; count?: number }[] = [
    { key: "all",       label: `All (${stats.total})` },
    { key: "overdue",   label: `Overdue (${stats.overdue})` },
    { key: "due",       label: `Due (${stats.due})` },
    { key: "upcoming",  label: `Upcoming` },
    { key: "scheduled", label: `Scheduled (${stats.scheduled})` },
    { key: "combine",   label: `⚡ Combine (${stats.combines})` },
  ];

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden text-gray-800">
      <Sidebar />

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b px-8 py-5 flex items-start justify-between flex-shrink-0">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Mulching Programme</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              50mm application · 9–12 month cycle · volume auto-calculated from asset area
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Export dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(v => !v)}
                onBlur={() => setTimeout(() => setShowExportMenu(false), 150)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:border-gray-300 bg-white transition-all">
                <Download className="w-4 h-4" />Export
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showExportMenu ? "rotate-180" : ""}`} />
              </button>
              {showExportMenu && (
                <div className="absolute right-0 top-full mt-1.5 bg-white rounded-xl border border-gray-100 shadow-lg z-20 w-52 py-1.5 overflow-hidden">
                  <button
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { exportCSV(assets); setShowExportMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                    <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
                      <Table2 className="w-3.5 h-3.5 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-800">Spreadsheet (CSV)</p>
                      <p className="text-[10px] text-gray-400">Opens in Excel / Sheets</p>
                    </div>
                  </button>
                  <button
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { exportPDF(assets); setShowExportMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                    <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-3.5 h-3.5 text-red-500" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-800">PDF Report</p>
                      <p className="text-[10px] text-gray-400">Print or save as PDF</p>
                    </div>
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => setView(v => v === "programme" ? "forward" : "programme")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${view === "forward" ? "text-white border-transparent" : "text-gray-600 border-gray-200 hover:border-gray-300 bg-white"}`}
              style={view === "forward" ? { background: BRAND } : {}}>
              {view === "forward" ? <><Layers className="w-4 h-4" /> Programme view</> : <><CalendarRange className="w-4 h-4" /> 12-month forward</>}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="px-8 py-4 grid grid-cols-5 gap-4 flex-shrink-0">
          {[
            { label: "Total assets",       value: stats.total,                          accent: false },
            { label: "Overdue",            value: stats.overdue,                        accent: true, color: "text-red-600"   },
            { label: "Due this month",     value: stats.due,                            accent: true, color: "text-amber-600" },
            { label: "Scheduled",          value: stats.scheduled,                      accent: true, color: "text-green-600" },
            { label: "Pending volume",     value: `${stats.pendingVol.toFixed(1)} m³`,  accent: false, color: "text-teal-700", sub: "mulch required" },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-xl p-4 border border-gray-100">
              <p className="text-[11px] text-gray-400 font-medium">{c.label}</p>
              <p className={`text-2xl font-bold mt-1 ${c.color || "text-gray-900"}`}>{c.value}</p>
              {c.sub && <p className="text-[10px] text-gray-400 mt-0.5">{c.sub}</p>}
            </div>
          ))}
        </div>

        {/* Combine opportunities banner */}
        {stats.combines > 0 && view === "programme" && (
          <div className="px-8 pb-3 flex-shrink-0">
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
              <Zap className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-bold text-amber-800">{stats.combines} combine opportunities this week</p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  {assets.filter(a => combineOpportunity(a)).map(a => a.name).join(", ")} —
                  schedule their mulch jobs on the same day as their next maintenance visit to avoid extra site trips.
                </p>
              </div>
              <button onClick={() => setFilter("combine")}
                className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 flex-shrink-0">
                View all
              </button>
            </div>
          </div>
        )}

        {/* Excluded assets notice */}
        <div className="px-8 pb-3 flex-shrink-0">
          <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-gray-500">
              <strong className="text-gray-600">{EXCLUDED.length} assets excluded from mulching programme: </strong>
              {EXCLUDED.map(e => `${e.name} (${e.reason})`).join(" · ")}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 pb-6">
          {view === "forward" ? (
            <ForwardProgramme
              assets={assets}
              onSchedule={a => setModalTarget(a)}
            />
          ) : (
            <>
              {/* Filter tabs */}
              <div className="flex gap-1 mb-4 bg-white rounded-xl p-1 border border-gray-100 w-fit">
                {FILTERS.map(f => (
                  <button key={f.key} onClick={() => setFilter(f.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filter === f.key ? "text-white" : "text-gray-500 hover:text-gray-700"}`}
                    style={filter === f.key ? { background: BRAND } : {}}>
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Asset cards */}
              <div className="space-y-3">
                {filtered.length === 0 ? (
                  <div className="text-center py-12 text-sm text-gray-400">No assets match this filter.</div>
                ) : (
                  filtered
                    .sort((a, b) => {
                      const order: Record<Status, number> = { overdue: 0, due: 1, upcoming: 2, scheduled: 3, far: 4 };
                      return order[status(a)] - order[status(b)];
                    })
                    .map(a => (
                      <AssetCard
                        key={a.id}
                        asset={a}
                        onSchedule={() => setModalTarget(a)}
                        onComplete={() => markDone(a.id)}
                      />
                    ))
                )}
              </div>
            </>
          )}
        </div>
      </main>

      {/* Schedule modal */}
      {modalTarget && (
        <ScheduleModal
          asset={modalTarget}
          onClose={() => setModalTarget(null)}
          onSave={(team, date, estMins) => {
            saveSchedule(modalTarget.id, team, date, estMins);
            setModalTarget(null);
          }}
        />
      )}
    </div>
  );
}
