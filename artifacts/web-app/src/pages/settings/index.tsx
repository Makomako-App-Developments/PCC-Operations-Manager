import { useState } from "react";
import { Shield, Users, Clock, Route, Sunrise, Zap, Lock, Layers, Leaf, ClipboardCheck } from "lucide-react";
import UsersPage from "@/pages/users/index";
import AuditLogPage from "@/pages/audit-log/index";
import ProductiveTimePage from "./ProductiveTimePage";
import RouteOptimisationPage from "./RouteOptimisationPage";
import WorkHoursPage from "./WorkHoursPage";
import ReactivePrioritiesPage from "./ReactivePrioritiesPage";
import RolesPermissionsPage from "./RolesPermissionsPage";
import MulchingSettingsPage from "./MulchingSettingsPage";
import PlantPaletteSettingsPage from "./PlantPaletteSettingsPage";
import AuditQuotaPage from "./AuditQuotaPage";
import { useAuth } from "@/lib/auth";

const BASE_TABS = [
  { id: "users",                label: "Users",                icon: Users,           managerOnly: false, adminOnly: false },
  { id: "roles",                label: "Roles & Permissions",  icon: Lock,            managerOnly: false, adminOnly: false },
  { id: "audit-log",            label: "Change log",           icon: Shield,          managerOnly: false, adminOnly: true  },
  { id: "work-hours",           label: "Work Hours",           icon: Sunrise,         managerOnly: false, adminOnly: false },
  { id: "reactive-priorities",  label: "Reactive Priorities",  icon: Zap,             managerOnly: false, adminOnly: false },
  { id: "productive-time",      label: "Productive Time",      icon: Clock,           managerOnly: false, adminOnly: false },
  { id: "route-optimisation",   label: "Route Optimisation",   icon: Route,           managerOnly: false, adminOnly: false },
  { id: "mulching",             label: "Mulching",             icon: Layers,          managerOnly: false, adminOnly: false },
  { id: "infill-planting",      label: "Infill Planting",      icon: Leaf,            managerOnly: false, adminOnly: false },
  { id: "audit-quota",          label: "Audit Quota",          icon: ClipboardCheck,  managerOnly: true,  adminOnly: false },
];

export default function SettingsPage() {
  const [tab, setTab] = useState("users");
  const { user } = useAuth();
  const isManager = user?.role === "manager" || user?.role === "administrator";
  const isAdmin = user?.role === "administrator";

  const TABS = BASE_TABS.filter(t => (!t.managerOnly || isManager) && (!t.adminOnly || isAdmin));

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-[#f5f7f9]">
      <div className="bg-white border-b border-gray-200 px-8 py-5 flex-shrink-0">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage users, teams and system configuration</p>
      </div>

      <div className="bg-white border-b border-gray-100 px-8 flex-shrink-0">
        <div className="flex gap-0 flex-wrap">
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

      <div className="flex-1 overflow-y-auto">
        {tab === "users"              && <UsersPage embedded />}
        {tab === "roles"              && <RolesPermissionsPage />}
        {tab === "audit-log"          && <AuditLogPage embedded />}
        {tab === "work-hours"         && <WorkHoursPage />}
        {tab === "reactive-priorities" && <ReactivePrioritiesPage />}
        {tab === "productive-time"    && <ProductiveTimePage />}
        {tab === "route-optimisation" && <RouteOptimisationPage />}
        {tab === "mulching"           && <MulchingSettingsPage />}
        {tab === "infill-planting"    && <PlantPaletteSettingsPage />}
        {tab === "audit-quota"        && isManager && <AuditQuotaPage />}
      </div>
    </div>
  );
}
