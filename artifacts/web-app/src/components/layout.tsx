import React from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { SystemStatusBanner } from "@/components/SystemStatusBanner";
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
  CheckSquare,
  ClipboardCheck,
  Shield,
  Settings,
  FileText,
  UsersRound,
} from "lucide-react";

function useAuditBadge(isSupervisor: boolean) {
  return useQuery<{ outstanding: number }>({
    queryKey: ["audit-quota-badge"],
    queryFn: async () => {
      const res = await fetch("/api/audit-quota/badge", { credentials: "include" });
      if (!res.ok) return { outstanding: 0 };
      return res.json();
    },
    enabled: isSupervisor,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const isSupervisor = user?.role === "supervisor";
  const { data: badgeData } = useAuditBadge(isSupervisor);
  const auditBadge = badgeData?.outstanding ?? 0;

  const allNav = [
    { icon: LayoutDashboard, label: "Dashboard",       href: "/dashboard",         activePrefix: "/dashboard",     managerOnly: false },
    { icon: List,            label: "Asset Register",  href: "/assets",            activePrefix: "/assets",        managerOnly: false },
    { icon: Map,             label: "Map",             href: "/map",               activePrefix: "/map",           managerOnly: false },
    { icon: CalendarDays,    label: "Schedule",        href: "/schedule",          activePrefix: "/schedule",      managerOnly: false },
    { icon: AlertTriangle,   label: "Unscheduled Work",href: "/reactive-jobs",     activePrefix: "/reactive-jobs", managerOnly: false },
    { icon: Sprout,          label: "Infill Planting", href: "/programmes/infill",   activePrefix: "/programmes/infill",   managerOnly: false },
    { icon: Layers,          label: "Mulching",        href: "/programmes/mulching", activePrefix: "/programmes/mulching", managerOnly: false },
    { icon: CheckSquare,     label: "Completed Works", href: "/completed-works",   activePrefix: "/completed-works", managerOnly: false },
    { icon: ClipboardCheck,  label: "Audits",          href: "/audits",            activePrefix: "/audits",        managerOnly: false },
    { icon: BarChart2,       label: "Reports",         href: "/reports",           activePrefix: "/reports",       managerOnly: false },
    { icon: FileText,        label: "Specification",   href: "/specification",     activePrefix: "/specification", managerOnly: false },
    { icon: UsersRound,      label: "Team",            href: "/team",              activePrefix: "/team",          managerOnly: false },
  ];
  const isWorker = user?.role === "field_worker";
  const isPrivileged = user?.role === "administrator" || user?.role === "manager" || user?.role === "supervisor";
  const isManagerOrAdmin = user?.role === "administrator" || user?.role === "manager";
  const nav = isWorker
    ? allNav.filter(item => item.href === "/specification")
    : allNav.filter(item => !item.managerOnly || isPrivileged);

  return (
    <div className="flex h-screen overflow-hidden bg-[#f5f7f9] font-sans">
      <aside className="w-56 flex-shrink-0 flex flex-col sticky top-0 h-screen bg-[#0f2a36] overflow-hidden">
        <div className="px-5 py-5 border-b border-white/10">
          <div className="bg-[#00AECD] rounded-lg px-3 py-2 text-center">
            <span className="text-white font-bold text-lg tracking-tight">poriruacity</span>
          </div>
          <p className="text-white/50 text-[10px] text-center mt-1 uppercase tracking-widest">Gardens Manager</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {nav.map(({ icon: Icon, label, href, activePrefix, managerOnly: _m }) => {
            const isActive = location.startsWith(activePrefix);
            const showBadge = label === "Audits" && isSupervisor && auditBadge > 0;
            return (
              <Link key={label} href={href} className="block">
                <div
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                    isActive ? "bg-[#00AECD] text-white" : "text-white/60 hover:text-white hover:bg-white/10"
                  }`}
                  data-testid={`nav-${label.toLowerCase().replace(" ", "-")}`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm font-medium flex-1">{label}</span>
                  {showBadge && (
                    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                      {auditBadge}
                    </span>
                  )}
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
            {isManagerOrAdmin && (
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
      <main className="flex-1 overflow-hidden flex flex-col">
        <SystemStatusBanner />
        {children}
      </main>
    </div>
  );
}
