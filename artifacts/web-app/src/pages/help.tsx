import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  ClipboardCheck,
  FileText,
  Layers,
  List,
  Map,
  Sprout,
  UsersRound,
  XCircle,
} from "lucide-react";

const NAVY = "#0f2a36";
const BRAND = "#00AECD";

const sections = [
  {
    title: "Getting around",
    icon: List,
    items: [
      ["Dashboard", "A quick view of team performance, completed work, skipped jobs, labour cost, and the current schedule position."],
      ["Asset Register", "The master list of gardens and other maintained sites. Open an asset to see its details, history, audits, and recorded work."],
      ["Map", "A location view of assets and their current work information."],
      ["Schedule", "The planned work calendar. Managers can review workload, assign teams, and move work when circumstances change."],
      ["Completed Works", "A record of work that has been completed, useful for checking history and reporting."],
      ["Reports", "Summary information for understanding delivery and operational performance."],
      ["Specification", "The agreed service standards and reference information for field work."],
    ],
  },
  {
    title: "Work types",
    icon: Layers,
    items: [
      ["Unscheduled Work", "Work that needs attention but is not part of the regular planned programme. It can be reviewed, prioritised, and scheduled."],
      ["Infill Planting", "Planting assessments and planting jobs created from them. An assessment becomes a draft job until it is reviewed and scheduled."],
      ["Mulching", "Mulch-depth readings and mulching work. A low-depth reading creates or updates a manager-review draft rather than sending work directly to a crew."],
      ["Audits", "Checks against the required garden standards. Audit results support follow-up work and performance reporting."],
    ],
  },
  {
    title: "How work moves through the system",
    icon: CalendarDays,
    items: [
      ["Draft", "The work has been identified but still needs a manager or supervisor to review it. Drafts are not field-worker work."],
      ["Scheduled", "A team and date have been selected. The work is now part of the planned programme."],
      ["In progress", "The team has started the work."],
      ["Completed", "The work has been finished and recorded."],
      ["Skipped", "The planned visit was not completed. Managers review the reason and decide whether to accept it, reject it, or arrange another action."],
      ["Cancelled / Not required", "The work will not go ahead. This is different from completed work."],
    ],
  },
  {
    title: "Team availability and absences",
    icon: UsersRound,
    items: [
      ["Marking someone away", "Availability is recorded by hour. Five or more non-available hours counts as that person being absent for the day."],
      ["One person away", "The team is shown as reduced. The system adjusts the estimated time because fewer people are available."],
      ["Two people away", "For a normal two-person team, the team has no available crew. Pending work is not treated as safely covered on that date; the replan process moves pending scheduled work to the next working day."],
      ["Example", "If Mobile 1 has two people and both are away on Monday, Monday’s pending scheduled visits are moved to Tuesday (or the next weekday if Tuesday is a weekend or holiday). Work already completed, skipped, cancelled, or left as a draft is not moved by this rule."],
      ["Important", "A reduced team may take longer to complete the same work. Check the capacity warning and schedule after changing availability."],
    ],
  },
  {
    title: "Capacity and dashboard warnings",
    icon: AlertTriangle,
    items: [
      ["Capacity", "Capacity compares planned minutes with the team’s productive working time. It helps prevent more work being placed on a day than the team can reasonably complete."],
      ["Yellow warning", "“Scheduled minutes may be under-counted” means the system could not find data for one or more work categories while other categories had data. Treat the totals as approximate until the missing category or data source is available."],
      ["No warning", "A normal capacity result does not guarantee that every real-world interruption is known. Managers should still review weather, access, vehicle, and staff circumstances."],
    ],
  },
  {
    title: "Mulch-depth uploads",
    icon: Sprout,
    items: [
      ["Validate first", "A manager uploads the workbook for a preview. The system checks the sheet, required columns, dates, mulch depths, and whether each GlobalID matches an active asset."],
      ["Confirm second", "The manager uploads the exact same workbook again and confirms the import. This protects against importing a changed or incomplete file."],
      ["What is created", "Each valid row creates a depth reading and a linked draft mulching record together. The draft is for manager review; no team is assigned and no work is sent to the field automatically."],
      ["Production", "When using the live system, upload the workbook through the published application. A development upload does not by itself create records in the production database."],
    ],
  },
  {
    title: "Who does what?",
    icon: ClipboardCheck,
    items: [
      ["Managers", "Manage the programme, review drafts, assign work, respond to capacity warnings, manage teams, and import mulch-depth workbooks."],
      ["Supervisors", "View and manage operational work for their team, record progress, and complete the actions available to their role."],
      ["Field workers", "Use the field-facing information and service specification needed to carry out assigned work. Draft manager-review work is not field work."],
    ],
  },
];

function HelpSection({ title, icon: Icon, items }: {
  title: string;
  icon: React.ElementType;
  items: string[][];
}) {
  return (
    <details className="group rounded-2xl border border-gray-200 bg-white shadow-sm" open={title === "Team availability and absences"}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 marker:hidden">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `${BRAND}15`, color: BRAND }}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="flex-1 text-sm font-bold" style={{ color: NAVY }}>{title}</span>
        <span className="text-xl leading-none text-gray-400 transition-transform group-open:rotate-45" aria-hidden="true">+</span>
      </summary>
      <div className="space-y-3 border-t border-gray-100 px-5 pb-5 pt-4">
        {items.map(([label, description]) => (
          <div key={label} className="grid gap-1 sm:grid-cols-[150px_1fr] sm:gap-4">
            <dt className="text-xs font-bold text-gray-700">{label}</dt>
            <dd className="text-sm leading-relaxed text-gray-600">{description}</dd>
          </div>
        ))}
      </div>
    </details>
  );
}

export default function HelpPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#f5f7f9]">
      <header className="shrink-0 border-b border-gray-200 bg-white px-8 py-6">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#e5f7fa] text-[#087d93]">
              <CircleHelp className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Help &amp; how the system works</h1>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">
                A plain-language guide to planning garden work, managing teams, and understanding the information on screen.
              </p>
            </div>
          </div>
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-[#bfe7ec] bg-[#effbfd] px-4 py-3 text-sm text-[#355f68]">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#087d93]" aria-hidden="true" />
            <p><strong className="text-[#244d59]">Quick tip:</strong> Open a section below to find the explanation you need. The team-availability section is open because it describes a common scheduling question.</p>
          </div>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-5xl space-y-3">
          {sections.map(section => <HelpSection key={section.title} {...section} />)}
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p><strong>Still unsure?</strong> Check the relevant record’s status and date first. If the system shows a warning or unexpected result, ask a manager to review the schedule and the underlying work records.</p>
          </div>
          <div className="pb-3 pt-3 text-center text-xs text-gray-400">
            GardenOps help guide · Porirua City Council
          </div>
        </div>
      </main>
    </div>
  );
}