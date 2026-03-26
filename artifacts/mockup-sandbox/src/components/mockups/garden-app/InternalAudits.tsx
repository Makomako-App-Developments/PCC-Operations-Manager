import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard, ClipboardList, List, CalendarDays,
  ClipboardCheck, Sprout, Construction, FileSpreadsheet
} from "lucide-react";

const BRAND = "#00AECD";

function Sidebar({ active }: { active: string }) {
  const nav = [
    { icon: LayoutDashboard, label: "Dashboard" },
    { icon: ClipboardList, label: "Data Collection" },
    { icon: List, label: "Asset Register" },
    { icon: CalendarDays, label: "Schedule" },
    { icon: ClipboardCheck, label: "Audits", id: "audits" },
    { icon: Sprout, label: "Infill Planting", id: "planting" },
    { icon: FileSpreadsheet, label: "Specification", id: "spec" },
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

export function InternalAudits() {
  return (
    <div className="flex min-h-screen bg-[#f5f7f9] font-sans">
      <Sidebar active="audits" />
      <main className="flex-1 flex flex-col">
        <header className="bg-white border-b px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Audits</h1>
            <p className="text-xs text-gray-400">Garden asset quality and compliance auditing</p>
          </div>
          <Badge className="text-white border-0 text-xs px-3" style={{ background: BRAND }}>Coming Soon</Badge>
        </header>

        <div className="flex-1 flex items-center justify-center p-12">
          <div className="text-center max-w-md">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg"
              style={{ background: `linear-gradient(135deg, ${BRAND}22, ${BRAND}44)` }}
            >
              <ClipboardCheck className="w-10 h-10" style={{ color: BRAND }} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Audits</h2>
            <p className="text-gray-500 text-sm leading-relaxed mb-8">
              This module will allow you to schedule and record internal quality audits across your garden asset base — tracking compliance against Level of Service standards and flagging assets that require remedial action.
            </p>

            <div className="grid grid-cols-2 gap-3 text-left mb-8">
              {[
                { title: "Audit Scheduling", desc: "Plan regular LOS compliance checks" },
                { title: "Scoring & Grading", desc: "Structured assessment templates" },
                { title: "Photo Evidence", desc: "Capture before/after imagery" },
                { title: "Remedial Actions", desc: "Track follow-up work orders" },
              ].map(({ title, desc }) => (
                <Card key={title} className="rounded-xl border-0 shadow-sm">
                  <CardContent className="p-3">
                    <div className="w-2 h-2 rounded-full mb-2" style={{ background: BRAND }} />
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
