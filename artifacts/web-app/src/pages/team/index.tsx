import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Users, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/lib/auth";

const BRAND = "#00AECD";

const PEOPLE = [
  { name: "June Rameka",        team: "CBD" },
  { name: "Tana Tanielu-Dick",  team: "CBD" },
  { name: "Felise Maiava",      team: "Mobile 1" },
  { name: "Joe Daish",          team: "Mobile 2" },
  { name: "David Wos",          team: "Mobile 2" },
  { name: "Barry Lavakula",     team: "Specialist" },
];

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16];

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

type Status = "available" | "annual_leave" | "sick" | "statutory_holiday" | "unpaid_leave";

const STATUS_OPTIONS: { value: Status; label: string; color: string; bg: string }[] = [
  { value: "available",          label: "Available",          color: "text-emerald-700", bg: "bg-emerald-100" },
  { value: "annual_leave",       label: "Annual Leave",       color: "text-blue-700",    bg: "bg-blue-100"    },
  { value: "sick",               label: "Sick",               color: "text-amber-700",   bg: "bg-amber-100"   },
  { value: "statutory_holiday",  label: "Statutory Holiday",  color: "text-purple-700",  bg: "bg-purple-100"  },
  { value: "unpaid_leave",       label: "Unpaid Leave",       color: "text-rose-700",    bg: "bg-rose-100"    },
];

function getStatusStyle(status: Status) {
  return STATUS_OPTIONS.find(s => s.value === status) ?? STATUS_OPTIONS[0];
}

function formatHour(h: number) {
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

function getMondayOfWeek(d: Date) {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d);
  mon.setDate(diff);
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

function formatWeekLabel(mon: Date) {
  const fri = addDays(mon, 4);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${mon.toLocaleDateString("en-NZ", opts)} – ${fri.toLocaleDateString("en-NZ", opts)}`;
}

interface AvailRow {
  id: string;
  personName: string;
  date: string;
  hour: number;
  status: Status;
}

function CellPopover({
  personName,
  date,
  hour,
  status,
  canEdit,
  onSave,
}: {
  personName: string;
  date: string;
  hour: number;
  status: Status;
  canEdit: boolean;
  onSave: (s: Status) => void;
}) {
  const [open, setOpen] = useState(false);
  const style = getStatusStyle(status);

  if (!canEdit) {
    return (
      <div
        className={`h-7 w-full rounded text-[10px] font-semibold flex items-center justify-center select-none ${style.bg} ${style.color}`}
        title={style.label}
      >
        {formatHour(hour)}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`h-7 w-full rounded text-[10px] font-semibold flex items-center justify-center transition-opacity hover:opacity-80 ${style.bg} ${style.color}`}
          title={style.label}
        >
          {formatHour(hour)}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1.5" align="center">
        <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider px-2 pb-1">{formatHour(hour)}</p>
        {STATUS_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => { onSave(opt.value); setOpen(false); }}
            className={`w-full text-left px-2 py-1.5 rounded text-xs font-medium flex items-center gap-2 hover:bg-gray-50 transition-colors ${status === opt.value ? "ring-1 ring-inset ring-gray-300 bg-gray-50" : ""}`}
          >
            <span className={`w-2.5 h-2.5 rounded-full ${opt.bg} border ${opt.color.replace("text-", "border-")}`} />
            {opt.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export default function TeamPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const canEdit = user?.role === "manager" || user?.role === "supervisor";

  const [weekMon, setWeekMon] = useState<Date>(() => getMondayOfWeek(new Date()));
  const [activeDay, setActiveDay] = useState(0);

  const weekStart = toDateStr(weekMon);

  const { data: rows = [], isLoading } = useQuery<AvailRow[]>({
    queryKey: ["team-avail", weekStart],
    queryFn: async () => {
      const res = await fetch(`/api/team/availability?weekStart=${weekStart}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load availability");
      return res.json();
    },
  });

  const mutation = useMutation({
    mutationFn: async (body: { personName: string; date: string; hour: number; status: Status }) => {
      const res = await fetch(`/api/team/availability`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
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

  const handleSetWholeDay = (personName: string, status: Status) => {
    for (const h of HOURS) {
      mutation.mutate({ personName, date: dayDate, hour: h, status });
    }
  };

  const prevWeek = () => setWeekMon(d => addDays(d, -7));
  const nextWeek = () => setWeekMon(d => addDays(d, 7));
  const thisWeek = () => setWeekMon(getMondayOfWeek(new Date()));

  const isCurrentWeek = toDateStr(getMondayOfWeek(new Date())) === weekStart;

  const getDaySummary = (personName: string, dayIdx: number): Status | "mixed" => {
    const date = toDateStr(addDays(weekMon, dayIdx));
    const statuses = HOURS.map(h => getStatus(personName, date, h));
    const unique = [...new Set(statuses)];
    if (unique.length === 1) return unique[0];
    return "mixed";
  };

  return (
    <div className="flex flex-col min-h-full bg-[#f5f7f9]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <p className="text-sm text-gray-500 mt-0.5">Availability schedule — {formatWeekLabel(weekMon)}</p>
        </div>
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
      </div>

      <div className="flex-1 p-6 space-y-4">
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
              {/* Legend */}
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
      </div>
    </div>
  );
}

function SetDayButton({
  personName,
  date,
  onSave,
}: {
  personName: string;
  date: string;
  onSave: (s: Status) => void;
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
