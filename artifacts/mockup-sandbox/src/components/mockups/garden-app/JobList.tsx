import { Badge } from "@/components/ui/badge";
import {
  MapPin, Clock, Wifi, WifiOff, ChevronRight, CheckCircle2,
  Circle, PlayCircle, LayoutDashboard, List, CalendarDays,
  ClipboardCheck, Sprout, FileSpreadsheet, RefreshCw
} from "lucide-react";

const BRAND = "#00AECD";
const NAVY = "#0f2a36";

const JOBS = [
  {
    day: "Thursday 27 Mar",
    items: [
      {
        id: 1, site: "Tui Park Rose Garden", type: "Rose", los: 2,
        mins: 45, suburb: "Elsdon", status: "inprogress",
        tasksTotal: 8, tasksDone: 3,
      },
      {
        id: 2, site: "McLeay Park Shrub Beds", type: "Shrub Bed", los: 3,
        mins: 90, suburb: "Whitby", status: "pending",
        tasksTotal: 7, tasksDone: 0,
      },
    ],
  },
  {
    day: "Friday 28 Mar",
    items: [
      {
        id: 3, site: "Bracken Park Annuals", type: "Annual Bedding", los: 1,
        mins: 30, suburb: "Porirua East", status: "pending",
        tasksTotal: 6, tasksDone: 0,
      },
      {
        id: 4, site: "Elsdon Reserve", type: "Revegetation", los: null,
        mins: 120, suburb: "Elsdon", status: "pending",
        tasksTotal: 5, tasksDone: 0,
      },
    ],
  },
];

const TYPE_COLORS: Record<string, string> = {
  Rose: "#ec4899",
  "Shrub Bed": BRAND,
  "Annual Bedding": "#f59e0b",
  Revegetation: "#16a34a",
  Bush: "#166534",
};

function StatusBadge({ status }: { status: string }) {
  if (status === "inprogress") return (
    <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#dcfce7", color: "#15803d" }}>
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
      In Progress
    </span>
  );
  if (status === "complete") return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Complete</span>
  );
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">Pending</span>
  );
}

function JobCard({ job }: { job: typeof JOBS[0]["items"][0] }) {
  const color = TYPE_COLORS[job.type] || BRAND;
  const hrs = Math.floor(job.mins / 60);
  const mins = job.mins % 60;
  const timeLabel = hrs > 0 ? `${hrs}h ${mins > 0 ? mins + "m" : ""}`.trim() : `${mins}m`;
  const isActive = job.status === "inprogress";

  return (
    <div className={`mx-4 mb-3 rounded-2xl border bg-white shadow-sm overflow-hidden ${isActive ? "ring-2" : ""}`}
      style={isActive ? { ringColor: BRAND, borderColor: BRAND + "40" } : { borderColor: "#e5e7eb" }}>
      {isActive && (
        <div className="px-4 py-1.5 flex items-center gap-2" style={{ background: BRAND }}>
          <PlayCircle className="w-3.5 h-3.5 text-white" />
          <span className="text-white text-[11px] font-semibold">Currently active · 00:23:45</span>
        </div>
      )}
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <StatusBadge status={job.status} />
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full text-white" style={{ background: color }}>
                {job.type}
              </span>
              {job.los && (
                <span className="text-[10px] text-gray-500 font-medium">LOS {job.los}</span>
              )}
            </div>
            <p className="text-sm font-semibold text-gray-900 truncate">{job.site}</p>
            <div className="flex items-center gap-3 mt-1.5">
              <span className="flex items-center gap-1 text-[11px] text-gray-400">
                <MapPin className="w-3 h-3" />{job.suburb}
              </span>
              <span className="flex items-center gap-1 text-[11px] text-gray-400">
                <Clock className="w-3 h-3" />{timeLabel}
              </span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" />
        </div>
        {isActive && (
          <div className="mt-3">
            <div className="flex justify-between text-[10px] text-gray-500 mb-1">
              <span>{job.tasksDone} of {job.tasksTotal} tasks complete</span>
              <span>{Math.round((job.tasksDone / job.tasksTotal) * 100)}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${(job.tasksDone / job.tasksTotal) * 100}%`, background: BRAND }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function JobList() {
  const totalJobs = JOBS.flatMap(g => g.items).length;
  const doneJobs = JOBS.flatMap(g => g.items).filter(j => j.status === "complete").length;
  const isOffline = false;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 font-sans" style={{ maxWidth: 390 }}>
      {/* Status bar sim */}
      <div className="h-10 flex items-center justify-between px-5 text-[11px] font-medium bg-white" style={{ color: NAVY }}>
        <span>9:41</span>
        <span className="flex items-center gap-1">
          {isOffline
            ? <><WifiOff className="w-3.5 h-3.5 text-orange-500" /><span className="text-orange-500">Offline</span></>
            : <><Wifi className="w-3.5 h-3.5" style={{ color: BRAND }} /><span style={{ color: BRAND }}>Online</span></>
          }
        </span>
      </div>

      {/* Header */}
      <div className="px-5 pt-3 pb-4 bg-white border-b">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">Week of 27 Mar 2026</p>
            <h1 className="text-xl font-bold mt-0.5" style={{ color: NAVY }}>My Jobs</h1>
            <p className="text-xs text-gray-400 mt-0.5">James Turner · Field Surveyor</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: BRAND }}>JT</div>
            <span className="flex items-center gap-1 text-[10px] text-gray-400">
              <RefreshCw className="w-2.5 h-2.5" />Synced 8:42am
            </span>
          </div>
        </div>

        {/* Summary pills */}
        <div className="flex gap-2 mt-3">
          <div className="flex-1 rounded-xl py-2 px-3 text-center" style={{ background: BRAND + "15" }}>
            <p className="text-lg font-bold" style={{ color: BRAND }}>{totalJobs}</p>
            <p className="text-[10px] text-gray-500">Total jobs</p>
          </div>
          <div className="flex-1 rounded-xl py-2 px-3 text-center bg-green-50">
            <p className="text-lg font-bold text-green-600">{doneJobs}</p>
            <p className="text-[10px] text-gray-500">Complete</p>
          </div>
          <div className="flex-1 rounded-xl py-2 px-3 text-center bg-blue-50">
            <p className="text-lg font-bold text-blue-600">{totalJobs - doneJobs}</p>
            <p className="text-[10px] text-gray-500">Remaining</p>
          </div>
        </div>
      </div>

      {/* Offline banner */}
      <div className="mx-4 mt-3 rounded-xl px-3 py-2 flex items-center gap-2 bg-amber-50 border border-amber-200">
        <WifiOff className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
        <p className="text-[11px] text-amber-700">
          <span className="font-semibold">Offline mode ready.</span> All job data cached locally. Photos will sync when reconnected.
        </p>
      </div>

      {/* Job groups */}
      <div className="flex-1 overflow-y-auto py-3">
        {JOBS.map(group => (
          <div key={group.day} className="mb-2">
            <p className="px-5 pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">{group.day}</p>
            {group.items.map(job => <JobCard key={job.id} job={job} />)}
          </div>
        ))}
      </div>

      {/* Bottom nav */}
      <div className="border-t bg-white px-2 py-2 flex justify-around">
        {[
          { icon: CalendarDays, label: "My Jobs", active: true },
          { icon: CheckCircle2, label: "Completed", active: false },
          { icon: MapPin, label: "Map", active: false },
        ].map(({ icon: Icon, label, active }) => (
          <button key={label} className="flex flex-col items-center gap-0.5 px-4 py-1">
            <Icon className="w-5 h-5" style={{ color: active ? BRAND : "#9ca3af" }} />
            <span className="text-[10px] font-medium" style={{ color: active ? BRAND : "#9ca3af" }}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
