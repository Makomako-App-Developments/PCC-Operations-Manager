import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Users, BarChart3, MapPin, Ruler, Clock, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/lib/auth";

const BRAND = "#00AECD";
const NAVY  = "#0f2a36";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LivePerson {
  id:     string;
  name:   string;
  teamId: string | null;
  team:   string;
}

interface WorkloadRow {
  teamId:       string | null;
  teamName:     string;
  siteCount:    number;
  totalAreaM2:  number;
  annualHours:  number;
  ftesRequired: number;
}

interface WorkloadData {
  rows: WorkloadRow[];
  meta: { productiveTimeMins: number; annualFteHours: number; workingDaysPerYear: number };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const OFFICE_ROLES = new Set(["administrator", "manager"]);
const DEFAULT_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

type Status = "available" | "annual_leave" | "sick" | "statutory_holiday" | "unpaid_leave";

const STATUS_OPTIONS: { value: Status; label: string; color: string; bg: string }[] = [
  { value: "available",          label: "Available",          color: "text-green-700",  bg: "bg-green-100"  },
  { value: "annual_leave",       label: "Annual Leave",       color: "text-blue-700",   bg: "bg-blue-100"   },
  { value: "sick",               label: "Sick",               color: "text-red-700",    bg: "bg-red-100"    },
  { value: "statutory_holiday",  label: "Statutory Holiday",  color: "text-purple-700", bg: "bg-purple-100" },
  { value: "unpaid_leave",       label: "Unpaid Leave",       color: "text-gray-700",   bg: "bg-gray-100"   },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMondayOfWeek(d: Date) {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function formatHour(h: number) {
  return h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;
}

function formatWeekLabel(mon: Date) {
  const fri = addDays(mon, 4);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${mon.toLocaleDateString("en-NZ", opts)} – ${fri.toLocaleDateString("en-NZ", opts)}`;
}

function getStatusStyle(status: Status) {
  return STATUS_OPTIONS.find(s => s.value === status) ?? STATUS_OPTIONS[0];
}

function fmt(n: number) {
  return n.toLocaleString("en-NZ");
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useLivePeople(): LivePerson[] {
  const { data: users = [] } = useQuery<{ data: Array<{ id: string; name: string; role: string; teamId: string | null; isActive: boolean }> }>({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch("/api/users", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60_000,
  });
  const { data: teams = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["teams"],
    queryFn: async () => {
      const res = await fetch("/api/teams", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60_000,
  });

  const teamMap = Object.fromEntries(teams.map(t => [t.id, t.name]));
  return (users.data ?? [])
    .filter(u => u.isActive && !OFFICE_ROLES.has(u.role))
    .map(u => ({
      id:     u.id,
      name:   u.name,
      teamId: u.teamId,
      team:   u.teamId ? (teamMap[u.teamId] ?? "—") : "—",
    }));
}

// ─── Workload Tab ─────────────────────────────────────────────────────────────

function WorkloadTab() {
  const { data, isLoading, error } = useQuery<WorkloadData>({
    queryKey: ["teams-workload"],
    queryFn: async () => {
      const res = await fetch("/api/teams/workload", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load workload data");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  const totals = useMemo(() => {
    if (!data) return null;
    return {
      siteCount:    data.rows.reduce((s, r) => s + r.siteCount, 0),
      totalAreaM2:  data.rows.reduce((s, r) => s + r.totalAreaM2, 0),
      annualHours:  data.rows.reduce((s, r) => s + r.annualHours, 0),
      ftesRequired: data.rows.filter(r => r.teamId !== null).reduce((s, r) => s + r.ftesRequired, 0),
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400 text-sm">
        Loading workload data…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-24 text-red-400 text-sm">
        Failed to load workload data.
      </div>
    );
  }

  const teamColors: Record<string, string> = {
    "CBD":        "#00AECD",
    "Mobile 1":   "#0f2a36",
    "Mobile 2":   "#7c3aed",
    "Specialist": "#ea580c",
    "All Teams":  "#64748b",
  };

  const getTeamColor = (name: string) => teamColors[name] ?? BRAND;

  return (
    <div className="space-y-6">
      {/* Summary stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { icon: MapPin,     label: "Total Sites",       value: fmt(totals?.siteCount ?? 0),                              sub: "active garden sites"   },
          { icon: Ruler,      label: "Total Area",        value: `${fmt(totals?.totalAreaM2 ?? 0)} m²`,                   sub: "across all teams"      },
          { icon: Clock,      label: "Annual Hours",      value: `${fmt(totals?.annualHours ?? 0)} hrs`,                  sub: "scheduled maintenance" },
          { icon: UserCheck,  label: "FTEs Required",     value: `${totals?.ftesRequired.toFixed(1) ?? "—"} FTE`,         sub: "for named teams"       },
        ].map(({ icon: Icon, label, value, sub }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-3">
            <div className="p-2 rounded-lg" style={{ background: `${BRAND}18` }}>
              <Icon className="w-4 h-4" style={{ color: BRAND }} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
              <p className="text-xl font-bold mt-0.5" style={{ color: NAVY }}>{value}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Per-team breakdown table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-bold" style={{ color: NAVY }}>Team Breakdown</h2>
          <div className="text-[10px] text-gray-400 flex items-center gap-1">
            <span>Based on</span>
            <span className="font-semibold text-gray-600">{data.meta.productiveTimeMins} mins/day</span>
            <span>productive time ×</span>
            <span className="font-semibold text-gray-600">{data.meta.workingDaysPerYear} working days</span>
            <span>=</span>
            <span className="font-semibold text-gray-600">{data.meta.annualFteHours} hrs/FTE/year</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-[10px] font-bold uppercase tracking-wider text-gray-500 px-6 py-3">Team</th>
                <th className="text-right text-[10px] font-bold uppercase tracking-wider text-gray-500 px-4 py-3">Sites</th>
                <th className="text-right text-[10px] font-bold uppercase tracking-wider text-gray-500 px-4 py-3">Area (m²)</th>
                <th className="text-right text-[10px] font-bold uppercase tracking-wider text-gray-500 px-4 py-3">Weekly Hrs</th>
                <th className="text-right text-[10px] font-bold uppercase tracking-wider text-gray-500 px-4 py-3">Annual Hrs</th>
                <th className="text-right text-[10px] font-bold uppercase tracking-wider text-gray-500 px-6 py-3">FTEs Required</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.rows.map(row => {
                const color = getTeamColor(row.teamName);
                const isAllTeams = row.teamId === null;
                return (
                  <tr key={row.teamId ?? "all"} className={`hover:bg-gray-50/60 transition-colors ${isAllTeams ? "bg-gray-50/40" : ""}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ background: color }}
                        />
                        <span className={`text-sm font-semibold ${isAllTeams ? "text-gray-500 italic" : "text-gray-800"}`}>
                          {row.teamName}
                        </span>
                        {isAllTeams && (
                          <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">shared workload</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="text-sm font-semibold text-gray-800">{fmt(row.siteCount)}</span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="text-sm font-semibold text-gray-800">{fmt(row.totalAreaM2)}</span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="text-sm font-semibold text-gray-800">{(row.annualHours / 52).toFixed(1)}</span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="text-sm font-semibold text-gray-800">{fmt(row.annualHours)}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {isAllTeams ? (
                        <span className="text-xs text-gray-400 italic">shared across teams</span>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <div className="flex-1 max-w-[80px] bg-gray-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${Math.min(100, (row.ftesRequired / 4) * 100)}%`, background: color }}
                            />
                          </div>
                          <span
                            className="text-sm font-bold tabular-nums"
                            style={{ color }}
                          >
                            {row.ftesRequired.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {/* Totals row */}
              {totals && (
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td className="px-6 py-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Total</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold" style={{ color: NAVY }}>{fmt(totals.siteCount)}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold" style={{ color: NAVY }}>{fmt(totals.totalAreaM2)} m²</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold" style={{ color: NAVY }}>{(totals.annualHours / 52).toFixed(1)} hrs</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold" style={{ color: NAVY }}>{fmt(totals.annualHours)} hrs</span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <span className="text-sm font-bold" style={{ color: NAVY }}>{totals.ftesRequired.toFixed(2)} FTE</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footnote */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/60">
          <p className="text-[10px] text-gray-400">
            FTE calculation: annual service hours ÷ {data.meta.annualFteHours} productive hrs/FTE/year.
            "All Teams" sites are shared across all field teams on scheduled days and are excluded from individual FTE totals.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Cell Popover ─────────────────────────────────────────────────────────────

function CellPopover({
  personName, date, hour, status, canEdit, onSave,
}: {
  personName: string; date: string; hour: number;
  status: Status; canEdit: boolean; onSave: (s: Status) => void;
}) {
  const [open, setOpen] = useState(false);
  const style = getStatusStyle(status);

  if (!canEdit) {
    return (
      <div
        className={`w-full h-7 rounded text-[10px] font-bold flex items-center justify-center ${style.bg} ${style.color}`}
        title={style.label}
      >
        {status === "available" ? "" : style.label.slice(0, 2).toUpperCase()}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`w-full h-7 rounded text-[10px] font-bold transition-opacity hover:opacity-80 ${style.bg} ${style.color}`}
          title={style.label}
        >
          {status === "available" ? "" : style.label.slice(0, 2).toUpperCase()}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1.5" align="center">
        <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider px-2 pb-1">
          {personName} — {formatHour(hour)}
        </p>
        {STATUS_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => { onSave(opt.value); setOpen(false); }}
            className={`w-full text-left px-2 py-1.5 rounded text-xs font-medium flex items-center gap-2 hover:bg-gray-50 transition-colors ${status === opt.value ? "ring-1 ring-inset ring-gray-300 bg-gray-50" : ""}`}
          >
            <span className={`w-2.5 h-2.5 rounded-full ${opt.bg}`} />
            {opt.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// ─── Set Day Button ───────────────────────────────────────────────────────────

function SetDayButton({
  personName, date, onSave,
}: {
  personName: string; date: string; onSave: (s: Status) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs h-7 px-2">
          Set all
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1.5" align="center">
        <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider px-2 pb-1">Set whole day</p>
        {STATUS_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => { onSave(opt.value); setOpen(false); }}
            className="w-full text-left px-2 py-1.5 rounded text-xs font-medium flex items-center gap-2 hover:bg-gray-50 transition-colors"
          >
            <span className={`w-2.5 h-2.5 rounded-full ${opt.bg}`} />
            {opt.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const canEdit = user?.role === "manager" || user?.role === "supervisor";
  const PEOPLE = useLivePeople();

  const [activeTab, setActiveTab] = useState<"workload" | "availability">("workload");
  const [weekMon, setWeekMon]     = useState<Date>(() => getMondayOfWeek(new Date()));
  const [activeDay, setActiveDay] = useState(0);

  const { data: settingsData } = useQuery<{ workStartHour: number; workEndHour: number }>({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const HOURS = settingsData
    ? Array.from(
        { length: settingsData.workEndHour - settingsData.workStartHour + 1 },
        (_, i) => settingsData.workStartHour + i,
      )
    : DEFAULT_HOURS;

  const weekStart = toDateStr(weekMon);

  const { data: rows = [], isLoading } = useQuery<AvailRow[]>({
    queryKey: ["team-avail", weekStart],
    queryFn: async () => {
      const res = await fetch(`/api/team/availability?weekStart=${weekStart}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load availability");
      return res.json();
    },
    enabled: activeTab === "availability",
  });

  const saveAvailability = async (body: { personName: string; date: string; hour: number; status: Status }) => {
    const res = await fetch(`/api/team/availability`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Failed to save");
    return res.json();
  };

  const mutation = useMutation({
    mutationFn: saveAvailability,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-avail", weekStart] }),
  });

  const availMap = useMemo(() => {
    const m: Record<string, Status> = {};
    for (const r of rows) m[`${r.personName}|${r.date}|${r.hour}`] = r.status;
    return m;
  }, [rows]);

  const getStatus = (personName: string, date: string, hour: number): Status =>
    availMap[`${personName}|${date}|${hour}`] ?? "available";

  const dayDate = toDateStr(addDays(weekMon, activeDay));

  const handleSave = (personName: string, hour: number, status: Status) => {
    mutation.mutate({ personName, date: dayDate, hour, status });
  };

  const handleSetWholeDay = async (personName: string, status: Status) => {
    await Promise.all(HOURS.map(h => saveAvailability({ personName, date: dayDate, hour: h, status })));
    qc.invalidateQueries({ queryKey: ["team-avail", weekStart] });
  };

  const isCurrentWeek = toDateStr(getMondayOfWeek(new Date())) === weekStart;

  const getDaySummary = (personName: string, dayIdx: number): Status | "mixed" => {
    const date = toDateStr(addDays(weekMon, dayIdx));
    const statuses = HOURS.map(h => getStatus(personName, date, h));
    const unique = [...new Set(statuses)];
    if (unique.length === 1) return unique[0];
    return "mixed";
  };

  const prevWeek = () => setWeekMon(d => addDays(d, -7));
  const nextWeek = () => setWeekMon(d => addDays(d, 7));
  const thisWeek = () => setWeekMon(getMondayOfWeek(new Date()));

  return (
    <div className="flex flex-col min-h-full bg-[#f5f7f9]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeTab === "availability"
              ? `Availability schedule — ${formatWeekLabel(weekMon)}`
              : "Resource planning & workload summary"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Tab toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-1">
            <button
              onClick={() => setActiveTab("workload")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === "workload"
                  ? "bg-white shadow-sm text-gray-800"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Workload
            </button>
            <button
              onClick={() => setActiveTab("availability")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === "availability"
                  ? "bg-white shadow-sm text-gray-800"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Availability
            </button>
          </div>

          {/* Week nav — only shown on availability tab */}
          {activeTab === "availability" && (
            <div className="flex items-center gap-2">
              {!isCurrentWeek && (
                <Button variant="outline" size="sm" onClick={thisWeek}>This Week</Button>
              )}
              <Button variant="outline" size="icon" onClick={prevWeek}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={nextWeek}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 p-6 space-y-4">
        {/* ── Workload Tab ── */}
        {activeTab === "workload" && <WorkloadTab />}

        {/* ── Availability Tab ── */}
        {activeTab === "availability" && (
          <>
            {/* Week overview strip */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Week Overview</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="text-left font-semibold text-gray-500 pb-2 pr-4 w-40">Person</th>
                      {DAYS.map((d, i) => (
                        <th key={d} className="text-center font-semibold text-gray-500 pb-2 px-1">
                          {d.slice(0, 3)} {toDateStr(addDays(weekMon, i)).slice(8)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {PEOPLE.map(person => (
                      <tr key={person.name}>
                        <td className="py-1.5 pr-4">
                          <span className="font-medium text-gray-800">{person.name}</span>
                          <span className="text-gray-400 text-[10px] ml-1.5">{person.team}</span>
                        </td>
                        {DAYS.map((_, i) => {
                          const summary = getDaySummary(person.name, i);
                          if (summary === "mixed") {
                            return (
                              <td key={i} className="py-1.5 px-1 text-center">
                                <button
                                  onClick={() => setActiveDay(i)}
                                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                                >
                                  Mixed
                                </button>
                              </td>
                            );
                          }
                          const style = getStatusStyle(summary);
                          return (
                            <td key={i} className="py-1.5 px-1 text-center">
                              <button
                                onClick={() => setActiveDay(i)}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${style.bg} ${style.color} hover:opacity-80 transition-opacity`}
                              >
                                {summary === "available" ? "Avail" : style.label.split(" ").map(w => w[0]).join("")}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Day detail grid */}
            <div className="bg-white rounded-xl border border-gray-200">
              {/* Day tabs */}
              <div className="flex border-b border-gray-100">
                {DAYS.map((day, i) => {
                  const date = toDateStr(addDays(weekMon, i));
                  const isToday = date === toDateStr(new Date());
                  return (
                    <button
                      key={day}
                      onClick={() => setActiveDay(i)}
                      className={`flex-1 py-3 px-2 text-sm font-semibold transition-colors relative ${
                        activeDay === i
                          ? "text-[#00AECD] border-b-2 border-[#00AECD]"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {day.slice(0, 3)}
                      {isToday && (
                        <span className="ml-1 text-[9px] bg-[#00AECD] text-white px-1 rounded-full align-middle">Today</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Grid */}
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-gray-700">
                    {DAYS[activeDay]}, {addDays(weekMon, activeDay).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {STATUS_OPTIONS.map(opt => (
                      <span key={opt.value} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${opt.bg} ${opt.color}`}>
                        {opt.label}
                      </span>
                    ))}
                  </div>
                </div>

                {isLoading ? (
                  <div className="text-center text-gray-400 py-10 text-sm">Loading…</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider pb-3 pr-4 w-44">
                            Person
                          </th>
                          {HOURS.map(h => (
                            <th key={h} className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider pb-3 px-0.5 min-w-[52px]">
                              {formatHour(h)}
                            </th>
                          ))}
                          {canEdit && (
                            <th className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider pb-3 pl-3 w-28">
                              Set Day
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {PEOPLE.map(person => (
                          <tr key={person.name} className="group">
                            <td className="py-2 pr-4 align-middle">
                              <div>
                                <p className="text-sm font-semibold text-gray-800">{person.name}</p>
                                <p className="text-[10px] text-gray-400">{person.team}</p>
                              </div>
                            </td>
                            {HOURS.map(h => {
                              const status = getStatus(person.name, dayDate, h);
                              return (
                                <td key={h} className="py-2 px-0.5 align-middle">
                                  <CellPopover
                                    personName={person.name}
                                    date={dayDate}
                                    hour={h}
                                    status={status}
                                    canEdit={canEdit}
                                    onSave={(s) => handleSave(person.name, h, s)}
                                  />
                                </td>
                              );
                            })}
                            {canEdit && (
                              <td className="py-2 pl-3 align-middle">
                                <SetDayButton
                                  personName={person.name}
                                  date={dayDate}
                                  onSave={(s) => handleSetWholeDay(person.name, s)}
                                />
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Type used by availability query
interface AvailRow {
  personName: string;
  date:       string;
  hour:       number;
  status:     Status;
}
