import { useState } from "react";

export function VariantC() {
  const [expanded, setExpanded] = useState(false);
  const TEAL = "#00AECD";

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-8 gap-6">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Variant C — Status cards below toolbar</div>

      <div className="w-full bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden" style={{ maxWidth: 1060 }}>
        {/* Toolbar row */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100">
          {/* Search */}
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 w-44">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/></svg>
            <span className="text-xs text-gray-400">Search site or ref…</span>
          </div>
          {/* Team */}
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 min-w-[130px]">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2h5m6 0H6m6 0v-4m0 4v4"/></svg>
            <span className="text-xs text-gray-700">Mobile 1</span>
            <svg className="w-3 h-3 text-gray-400 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
          </div>

          {/* Nav */}
          <div className="ml-auto flex items-center gap-2">
            <button className="p-1.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-500">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
            </button>
            <span className="text-sm font-medium text-gray-600 px-2 whitespace-nowrap">8 Jun – 21 Jun 2026</span>
            <button className="p-1.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-500">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
            </button>
          </div>
        </div>

        {/* Stat cards row */}
        <div className="grid grid-cols-4 divide-x divide-gray-100 border-b border-gray-100">
          {/* Jobs */}
          <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderTop: `2px solid ${TEAL}` }}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${TEAL}15` }}>
              <svg className="w-4 h-4" style={{ color: TEAL }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2"/></svg>
            </div>
            <div>
              <div className="text-lg font-bold text-gray-800 leading-none">528</div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">Jobs this week</div>
            </div>
          </div>

          {/* Completed */}
          <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderTop: "2px solid #10b981" }}>
            <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg>
            </div>
            <div>
              <div className="text-lg font-bold text-gray-800 leading-none">3</div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">Completed</div>
            </div>
          </div>

          {/* Overdue */}
          <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderTop: "2px solid #ef4444" }}>
            <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
            </div>
            <div>
              <div className="text-lg font-bold text-red-600 leading-none">528</div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">Overdue</div>
            </div>
          </div>

          {/* Days behind — new */}
          <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderTop: "2px solid #f59e0b" }}>
            <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg>
            </div>
            <div>
              <div className="text-lg font-bold text-amber-700 leading-none">14</div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">Days behind</div>
            </div>
          </div>
        </div>

        {/* Gantt stub */}
        <div className="h-12 bg-white flex items-center justify-center">
          <span className="text-xs text-gray-400 italic">Gantt table…</span>
        </div>
      </div>

      <p className="text-xs text-gray-500 max-w-[600px] text-center">Stats become 4 equal metric cards with a color-coded top border (teal = neutral, green = good, red = alert, amber = warning). Each card shows a large number for immediate scanning. The toolbar row stays clean with just controls.</p>
    </div>
  );
}
