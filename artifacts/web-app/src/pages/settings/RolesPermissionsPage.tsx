import { Check, Minus, Pencil, Eye, Smartphone } from "lucide-react";

const BRAND = "#00AECD";
const NAVY  = "#0f2a36";

type Access = "edit" | "view" | "none" | "mobile";

interface Row {
  group:   string;
  screen:  string;
  admin:   Access;
  manager: Access;
  leader:  Access;
  worker:  Access;
  note?:   string;
}

const ROWS: Row[] = [
  { group: "Desktop", screen: "Dashboard & Map",               admin: "edit",   manager: "edit",   leader: "view",   worker: "none"   },
  { group: "Desktop", screen: "Asset Register — View",         admin: "edit",   manager: "edit",   leader: "view",   worker: "none"   },
  { group: "Desktop", screen: "Asset Register — Add / Edit",   admin: "edit",   manager: "edit",   leader: "none",   worker: "none"   },
  { group: "Desktop", screen: "Maintenance Schedule",          admin: "edit",   manager: "edit",   leader: "view",   worker: "none"   },
  { group: "Desktop", screen: "Reactive Jobs",                 admin: "edit",   manager: "edit",   leader: "view",   worker: "none"   },
  { group: "Desktop", screen: "Completed Works",               admin: "edit",   manager: "edit",   leader: "view",   worker: "none"   },
  { group: "Desktop", screen: "Programmes",                    admin: "edit",   manager: "edit",   leader: "view",   worker: "none"   },
  { group: "Desktop", screen: "Audits",                        admin: "edit",   manager: "edit",   leader: "view",   worker: "none"   },
  { group: "Desktop", screen: "Reports",                       admin: "edit",   manager: "edit",   leader: "view",   worker: "none"   },
  { group: "Desktop", screen: "Specification — View",          admin: "edit",   manager: "edit",   leader: "view",   worker: "view"   },
  { group: "Desktop", screen: "Specification — Edit",          admin: "edit",   manager: "edit",   leader: "none",   worker: "none",  note: "Daniela Biaggio, Tim Broadwith & Administrator only" },
  { group: "Desktop", screen: "Settings",                      admin: "edit",   manager: "edit",   leader: "none",   worker: "none"   },
  { group: "Mobile",  screen: "My Jobs",                       admin: "mobile", manager: "mobile", leader: "mobile", worker: "mobile" },
  { group: "Mobile",  screen: "Job Detail",                    admin: "mobile", manager: "mobile", leader: "mobile", worker: "mobile" },
  { group: "Mobile",  screen: "Active Job & Sign-off",         admin: "mobile", manager: "mobile", leader: "mobile", worker: "mobile" },
];

const ROLES = [
  { key: "admin",   label: "Administrator", sub: "Full admin control"     },
  { key: "manager", label: "Manager",       sub: "All access, full edit"  },
  { key: "leader",  label: "Team Leader",   sub: "View all, limited edit" },
  { key: "worker",  label: "Worker",        sub: "Mobile screens only"    },
] as const;

type RoleKey = "admin" | "manager" | "leader" | "worker";

function Cell({ access }: { access: Access }) {
  if (access === "edit") return (
    <div className="flex items-center justify-center">
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold text-white" style={{ background: BRAND }}>
        <Pencil className="w-2.5 h-2.5" />Full Edit
      </span>
    </div>
  );
  if (access === "view") return (
    <div className="flex items-center justify-center">
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border" style={{ color: BRAND, borderColor: `${BRAND}55`, background: `${BRAND}12` }}>
        <Eye className="w-2.5 h-2.5" />View Only
      </span>
    </div>
  );
  if (access === "mobile") return (
    <div className="flex items-center justify-center">
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border border-violet-200 text-violet-600 bg-violet-50">
        <Smartphone className="w-2.5 h-2.5" />Access
      </span>
    </div>
  );
  return (
    <div className="flex items-center justify-center">
      <Minus className="w-4 h-4 text-gray-200" />
    </div>
  );
}

export default function RolesPermissionsPage() {
  let lastGroup = "";

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h2 className="text-lg font-bold mb-1" style={{ color: NAVY }}>Roles & Permissions</h2>
        <p className="text-sm text-gray-400">What each role can see and do across the GardenOps platform</p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold text-white" style={{ background: BRAND }}>
          <Pencil className="w-2.5 h-2.5" />Full Edit
        </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border" style={{ color: BRAND, borderColor: `${BRAND}55`, background: `${BRAND}12` }}>
          <Eye className="w-2.5 h-2.5" />View Only
        </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border border-violet-200 text-violet-600 bg-violet-50">
          <Smartphone className="w-2.5 h-2.5" />Mobile Access
        </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border border-gray-100 text-gray-300 bg-white">
          <Minus className="w-2.5 h-2.5" />No Access
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ background: NAVY }}>
              <th className="text-left px-5 py-4 text-white/60 text-[11px] font-semibold uppercase tracking-widest w-56">
                Screen / Feature
              </th>
              {ROLES.map(r => (
                <th key={r.key} className="px-4 py-4 text-center w-36">
                  <p className="text-white font-bold text-sm leading-tight">{r.label}</p>
                  <p className="text-white/40 text-[10px] font-normal mt-0.5">{r.sub}</p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, i) => {
              const showGroup = row.group !== lastGroup;
              lastGroup = row.group;
              return (
                <>
                  {showGroup && (
                    <tr key={`group-${row.group}`}>
                      <td colSpan={5} className="px-5 pt-4 pb-1.5">
                        <div className="flex items-center gap-2">
                          {row.group === "Mobile" && <Smartphone className="w-3 h-3" style={{ color: BRAND }} />}
                          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: BRAND }}>
                            {row.group}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                  <tr
                    key={row.screen}
                    className={`border-t border-gray-50 transition-colors hover:bg-gray-50/60 ${row.group === "Mobile" ? "bg-violet-50/20" : ""}`}
                  >
                    <td className="px-5 py-3">
                      <p className="text-[13px] font-semibold text-gray-700">{row.screen}</p>
                      {row.note && <p className="text-[10px] text-gray-400 mt-0.5">{row.note}</p>}
                    </td>
                    {ROLES.map(r => (
                      <td key={r.key} className="px-4 py-3 text-center">
                        <Cell access={row[r.key as RoleKey]} />
                      </td>
                    ))}
                  </tr>
                </>
              );
            })}
          </tbody>
        </table>

        <div className="px-5 py-4 border-t border-gray-100 bg-blue-50/40">
          <p className="text-[11px] text-blue-500 leading-relaxed">
            <strong>Note:</strong> Workers only access the mobile field screens (My Jobs, Job Detail, Active Job & Sign-off). All other modules are desktop-only for office and management staff. Authentication is via Porirua City Council Microsoft 365 SSO or email + password.
          </p>
        </div>
      </div>
    </div>
  );
}
