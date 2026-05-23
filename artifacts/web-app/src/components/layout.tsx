import React from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard,
  List,
  Map,
  CalendarDays,
  LogOut,
  Sprout,
  Layers,
  BarChart2,
  AlertTriangle,
  ClipboardList,
  ClipboardCheck,
  Shield,
  Settings,
  FileText,
  UsersRound,
} from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const allNav = [
    { icon: LayoutDashboard, label: "Dashboard",    href: "/dashboard",     managerOnly: false },
    { icon: List,            label: "Asset Register", href: "/assets",      managerOnly: false },
    { icon: Map,             label: "Map",           href: "/map",          managerOnly: false },
    { icon: CalendarDays,    label: "Schedule",      href: "/schedule",     managerOnly: false },
    { icon: ClipboardList,   label: "Jobs",          href: "/jobs",         managerOnly: false },
    { icon: AlertTriangle,   label: "Reactive Jobs", href: "/reactive-jobs", managerOnly: false },
    { icon: ClipboardCheck,  label: "Audits",        href: "/audits",       managerOnly: false },
    { icon: Sprout,          label: "Programmes",    href: "/programmes",   managerOnly: false },
    { icon: BarChart2,       label: "Reports",       href: "/reports",      managerOnly: false },
    { icon: FileText,        label: "Specification", href: "/specification", managerOnly: false },
    { icon: UsersRound,      label: "Team",          href: "/team",         managerOnly: false },
  ];
  const isPrivileged = user?.role === "manager" || user?.role === "supervisor";
  const nav = allNav.filter(item => !item.managerOnly || isPrivileged);

  return (
    <div className="flex min-h-screen bg-[#f5f7f9] font-sans">
      <aside className="w-56 flex-shrink-0 flex flex-col sticky top-0 h-screen bg-[#0f2a36] overflow-hidden">
        <div className="px-5 py-5 border-b border-white/10">
          <div className="bg-[#00AECD] rounded-lg px-3 py-2 text-center">
            <span className="text-white font-bold text-lg tracking-tight">poriruacity</span>
          </div>
          <p className="text-white/50 text-[10px] text-center mt-1 uppercase tracking-widest">Gardens Manager</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {nav.map(({ icon: Icon, label, href, managerOnly: _m }) => {
            const isActive = location.startsWith(href);
            return (
              <Link key={label} href={href} className="block">
                <div
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                    isActive ? "bg-[#00AECD] text-white" : "text-white/60 hover:text-white hover:bg-white/10"
                  }`}
                  data-testid={`nav-${label.toLowerCase().replace(" ", "-")}`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{label}</span>
                </div>
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-4 border-t border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-[#00AECD] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {user?.initials || "??"}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-white text-xs font-medium truncate">{user?.name || "User"}</p>
              <p className="text-white/40 text-[10px] uppercase truncate">{user?.role?.replace("_", " ")}</p>
            </div>
            {isPrivileged && (
              <Link href="/settings">
                <div
                  className={`p-1.5 rounded-md cursor-pointer transition-colors ${location.startsWith("/settings") ? "bg-[#00AECD] text-white" : "text-white/40 hover:text-white hover:bg-white/10"}`}
                  title="Settings"
                  data-testid="nav-settings"
                >
                  <Settings className="w-4 h-4" />
                </div>
              </Link>
            )}
          </div>
          <button
            onClick={() => logout()}
            className="w-full flex items-center gap-2 text-white/60 hover:text-white text-xs font-medium px-2 py-1.5 transition-colors"
            data-testid="btn-logout"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto flex flex-col">
        {children}
      </main>
    </div>
  );
}
