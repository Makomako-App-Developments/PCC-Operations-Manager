import {
  MapPin, Clock, ChevronLeft, WifiOff, Star,
  Navigation, Layers, Camera, CheckSquare, Info, Play
} from "lucide-react";

const BRAND = "#00AECD";
const NAVY = "#0f2a36";

const TASKS = [
  "Litter — remove all old litter",
  "Weed control — ≤5% total cover",
  "Dead heading — visually pleasing",
  "Mulch depth — 50–125mm, clear of stems",
  "Pruning — best practice, road clearance",
  "Pest & disease — copper & winter oil check",
  "Edging — vertical, smooth & neat",
  "Plant coverage — ≥95%",
];

const TILES = [
  { label: "Location", value: "Tui Park, Elsdon", icon: MapPin },
  { label: "Garden Type", value: "Rose Garden", icon: Layers },
  { label: "LOS Grade", value: "Level 2", icon: Star },
  { label: "Time Allocated", value: "45 min", icon: Clock },
];

export function JobDetail() {
  return (
    <div className="flex flex-col min-h-screen bg-gray-50 font-sans" style={{ maxWidth: 390 }}>
      {/* Status bar */}
      <div className="h-10 flex items-center justify-between px-5 text-[11px] font-medium bg-white" style={{ color: NAVY }}>
        <span>9:41</span>
        <span className="flex items-center gap-1 text-amber-500">
          <WifiOff className="w-3.5 h-3.5" />Offline
        </span>
      </div>

      {/* Top nav */}
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <button className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <ChevronLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-gray-400 font-medium">Job Instructions</p>
          <p className="text-sm font-bold truncate" style={{ color: NAVY }}>Tui Park Rose Garden</p>
        </div>
        <span className="text-[10px] font-semibold px-2 py-1 rounded-full text-blue-600 bg-blue-50">Pending</span>
      </div>

      {/* Offline cached banner */}
      <div className="mx-4 mt-3 rounded-xl px-3 py-2 flex items-center gap-2 bg-amber-50 border border-amber-200">
        <WifiOff className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
        <p className="text-[11px] text-amber-700"><span className="font-semibold">Offline ready.</span> All site data & maps cached. Photos queue when reconnected.</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Map placeholder */}
        <div className="mx-4 mt-3 rounded-2xl overflow-hidden shadow-sm relative" style={{ height: 180 }}>
          {/* Simulated map */}
          <div className="absolute inset-0" style={{
            background: "linear-gradient(135deg, #e8f4f0 0%, #d4ede6 40%, #c8e6dc 100%)"
          }}>
            {/* Road lines */}
            <svg width="100%" height="100%" viewBox="0 0 350 180" className="absolute inset-0">
              <line x1="0" y1="100" x2="350" y2="95" stroke="#fff" strokeWidth="8" opacity="0.7" />
              <line x1="180" y1="0" x2="175" y2="180" stroke="#fff" strokeWidth="6" opacity="0.5" />
              <line x1="0" y1="50" x2="180" y2="100" stroke="#fff" strokeWidth="4" opacity="0.4" />
              <rect x="120" y="60" width="80" height="60" rx="4" fill="#d6e8e0" stroke="#b8d8cc" strokeWidth="1" />
              <rect x="30" y="110" width="60" height="40" rx="4" fill="#d6e8e0" stroke="#b8d8cc" strokeWidth="1" />
              <rect x="230" y="40" width="90" height="55" rx="4" fill="#d6e8e0" stroke="#b8d8cc" strokeWidth="1" />
              {/* Park area */}
              <ellipse cx="175" cy="100" rx="38" ry="28" fill="#4ade8060" stroke="#22c55e" strokeWidth="1.5" />
            </svg>
            {/* Pin */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full">
              <div className="w-8 h-8 rounded-full border-4 border-white shadow-lg flex items-center justify-center" style={{ background: BRAND }}>
                <MapPin className="w-4 h-4 text-white" />
              </div>
              <div className="w-2 h-2 rounded-full mx-auto -mt-0.5 shadow" style={{ background: BRAND }} />
            </div>
          </div>
          {/* Navigate button */}
          <button className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-white shadow-md rounded-xl px-3 py-2">
            <Navigation className="w-3.5 h-3.5" style={{ color: BRAND }} />
            <span className="text-[11px] font-semibold" style={{ color: NAVY }}>Navigate</span>
          </button>
          {/* Offline badge on map */}
          <div className="absolute top-3 left-3 bg-white/90 rounded-lg px-2 py-1 flex items-center gap-1">
            <WifiOff className="w-2.5 h-2.5 text-amber-500" />
            <span className="text-[10px] text-amber-600 font-medium">Cached map</span>
          </div>
        </div>

        {/* Info grid */}
        <div className="mx-4 mt-3 grid grid-cols-2 gap-2">
          {TILES.map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100">
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className="w-3.5 h-3.5" style={{ color: BRAND }} />
                <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">{label}</span>
              </div>
              <p className="text-sm font-semibold text-gray-800">{value}</p>
            </div>
          ))}
        </div>

        {/* Task checklist preview */}
        <div className="mx-4 mt-3 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-4 h-4" style={{ color: BRAND }} />
              <span className="text-sm font-semibold" style={{ color: NAVY }}>Task Checklist</span>
            </div>
            <span className="text-[11px] text-gray-400 font-medium">{TASKS.length} tasks</span>
          </div>
          {TASKS.map((task, i) => (
            <div key={i} className={`flex items-start gap-3 px-4 py-3 ${i < TASKS.length - 1 ? "border-b border-gray-50" : ""}`}>
              <div className="w-5 h-5 rounded-full border-2 border-gray-200 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-gray-700 leading-snug">{task}</p>
              </div>
              <Camera className="w-4 h-4 text-gray-200 flex-shrink-0 mt-0.5" />
            </div>
          ))}
        </div>

        {/* Info note */}
        <div className="mx-4 mt-3 mb-3 flex items-start gap-2 bg-blue-50 rounded-xl px-3 py-2.5">
          <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-blue-600 leading-relaxed">
            Each task requires a photo before it can be marked complete. Incomplete tasks require a written note at sign-off.
          </p>
        </div>
      </div>

      {/* Start Job CTA */}
      <div className="px-4 py-4 bg-white border-t">
        <button
          className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 shadow-lg"
          style={{ background: `linear-gradient(135deg, ${BRAND}, #0097b2)` }}
        >
          <Play className="w-5 h-5" />
          Start Job — Record Start Time
        </button>
        <p className="text-center text-[10px] text-gray-400 mt-2">Start time will be recorded automatically</p>
      </div>
    </div>
  );
}
