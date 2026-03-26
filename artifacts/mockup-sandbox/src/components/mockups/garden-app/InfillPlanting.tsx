import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard, ClipboardList, List, CalendarDays,
  ClipboardCheck, Sprout, Construction, FileSpreadsheet, BarChart2
} from "lucide-react";

const BRAND = "#00AECD";

function Sidebar({ active }: { active: string }) {
  const nav = [
    { icon: LayoutDashboard, label: "Dashboard" },
    { icon: List, label: "Asset Register" },
    { icon: CalendarDays, label: "Schedule" },
    { icon: ClipboardCheck, label: "Audits", id: "audits" },
    { icon: Sprout, label: "Infill Planting", id: "planting" },
    { icon: FileSpreadsheet, label: "Specification", id: "spec" },
    { icon: BarChart2, label: "Reports", id: "reports" },
  ];
  return (
    <aside className="w-56 flex-shrink-0 bg-[#0f2a36] flex flex-col min-h-screen">
      <div className="px-5 py-5 border-b border-white/10">
        <div className="bg-[#00AECD] rounded-lg px-3 py-2 text-center">
          <span className="text-white font-bold text-lg tracking-tight">poriruacity</span>
        </div>
        <p className="text-white/50 text-[10px] text-center mt-1 uppercase tracking-widest">Gardens Manager</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ icon: Icon, label, id }) => {
          const isActive = active === (id || label.toLowerCase());
          return (
            <div key={label} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${isActive ? "bg-[#00AECD] text-white" : "text-white/60 hover:text-white hover:bg-white/10"}`}>
              <Icon className="w-4 h-4" />
              <span className="text-sm font-medium">{label}</span>
            </div>
          );
        })}
      </nav>
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#00AECD] flex items-center justify-center text-white text-xs font-bold">DB</div>
          <div>
            <p className="text-white text-xs font-medium">Daniela Biaggio</p>
            <p className="text-white/40 text-[10px]">Urban Ecology Manager</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function InfillPlanting() {
  return (
    <div className="flex min-h-screen bg-[#f5f7f9] font-sans">
      <Sidebar active="planting" />
      <main className="flex-1 flex flex-col">
        <header className="bg-white border-b px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Infill Planting</h1>
            <p className="text-xs text-gray-400">Track and manage plant coverage gaps across all garden assets</p>
          </div>
          <Badge className="text-white border-0 text-xs px-3" style={{ background: BRAND }}>Coming Soon</Badge>
        </header>

        <div className="flex-1 flex items-center justify-center p-12">
          <div className="text-center max-w-md">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg"
              style={{ background: "linear-gradient(135deg, #10b98122, #10b98144)" }}
            >
              <Sprout className="w-10 h-10 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Infill Planting</h2>
            <p className="text-gray-500 text-sm leading-relaxed mb-8">
              This module will help you manage plant coverage gaps identified during data collection. Generate infill planting orders by garden, track plant species, quantities, and costs — and record completion once planting is done.
            </p>

            <div className="grid grid-cols-2 gap-3 text-left mb-8">
              {[
                { title: "Coverage Gap Tracking", desc: "Auto-pull gaps from field data (qty to 95%)" },
                { title: "Species Selection", desc: "Match plants to garden type & LOS" },
                { title: "Order Management", desc: "Generate and track planting orders" },
                { title: "Completion Records", desc: "Log planting dates and outcomes" },
              ].map(({ title, desc }) => (
                <Card key={title} className="rounded-xl border-0 shadow-sm">
                  <CardContent className="p-3">
                    <div className="w-2 h-2 rounded-full mb-2 bg-emerald-500" />
                    <p className="text-xs font-semibold text-gray-800">{title}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 border border-amber-200">
              <Construction className="w-4 h-4 text-amber-500" />
              <span className="text-xs text-amber-700 font-medium">Planned for a future release</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
