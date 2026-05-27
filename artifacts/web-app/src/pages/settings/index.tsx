import { useState } from "react";
import { Shield, Users, Clock, Route, Sunrise, Zap, UsersRound, Lock } from "lucide-react";
import UsersPage from "@/pages/users/index";
import AuditLogPage from "@/pages/audit-log/index";
import ProductiveTimePage from "./ProductiveTimePage";
import RouteOptimisationPage from "./RouteOptimisationPage";
import WorkHoursPage from "./WorkHoursPage";
import ReactivePrioritiesPage from "./ReactivePrioritiesPage";
import TeamsPage from "./TeamsPage";
import RolesPermissionsPage from "./RolesPermissionsPage";

const TABS = [
  { id: "users",                label: "Users",                icon: Users       },
  { id: "teams",                label: "Teams",                icon: UsersRound  },
  { id: "roles",                label: "Roles & Permissions",  icon: Lock        },
  { id: "audit-log",            label: "Audit Log",            icon: Shield      },
  { id: "work-hours",           label: "Work Hours",           icon: Sunrise     },
  { id: "reactive-priorities",  label: "Reactive Priorities",  icon: Zap         },
  { id: "productive-time",      label: "Productive Time",      icon: Clock       },
  { id: "route-optimisation",   label: "Route Optimisation",   icon: Route       },
];

export default function SettingsPage() {
  const [tab, setTab] = useState("users");

  return (
    <div className="flex flex-col min-h-full bg-[#f5f7f9]">
      <div className="bg-white border-b border-gray-200 px-8 py-5">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage users, teams and system configuration</p>
      </div>

      <div className="bg-white border-b border-gray-100 px-8">
        <div className="flex gap-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                tab === t.id
                  ? "border-[#00AECD] text-[#00AECD]"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1">
        {tab === "users"              && <UsersPage embedded />}
        {tab === "teams"              && <TeamsPage />}
        {tab === "roles"              && <RolesPermissionsPage />}
        {tab === "audit-log"          && <AuditLogPage embedded />}
        {tab === "work-hours"         && <WorkHoursPage />}
        {tab === "reactive-priorities" && <ReactivePrioritiesPage />}
        {tab === "productive-time"    && <ProductiveTimePage />}
        {tab === "route-optimisation" && <RouteOptimisationPage />}
      </div>
    </div>
  );
}
