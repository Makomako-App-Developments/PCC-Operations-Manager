import { useState } from "react";
import {
  LayoutDashboard, List, CalendarDays, ClipboardCheck, Sprout,
  FileSpreadsheet, BarChart2, Plus, CheckCircle2, XCircle,
  Clock, ChevronRight, Search, MapPin,
  AlertTriangle, X, Shuffle, Wrench, CalendarPlus, CheckCheck
} from "lucide-react";

const BRAND = "#00AECD";
const SIDEBAR = "#0f2a36";

function Sidebar({ active }: { active: string }) {
  const nav = [
    { icon: LayoutDashboard, label: "Dashboard" },
    { icon: List,            label: "Asset Register" },
    { icon: CalendarDays,    label: "Schedule" },
    { icon: ClipboardCheck,  label: "Audits",          id: "audits" },
    { icon: Sprout,          label: "Infill Planting",  id: "planting" },
    { icon: FileSpreadsheet, label: "Specification",   id: "spec" },
    { icon: BarChart2,       label: "Reports",         id: "reports" },
  ];
  return (
    <aside className="w-56 flex-shrink-0 flex flex-col min-h-screen" style={{ background: SIDEBAR }}>
      <div className="px-5 py-5 border-b border-white/10">
        <div className="rounded-lg px-3 py-2 text-center" style={{ background: BRAND }}>
          <span className="text-white font-bold text-lg tracking-tight">poriruacity</span>
        </div>
        <p className="text-white/50 text-[10px] text-center mt-1 uppercase tracking-widest">Gardens Manager</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ icon: Icon, label, id }) => {
          const isActive = active === (id || label.toLowerCase());
          return (
            <div key={label}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${isActive ? "text-white" : "text-white/60 hover:text-white hover:bg-white/10"}`}
              style={isActive ? { background: BRAND } : {}}>
              <Icon className="w-4 h-4" />
              <span className="text-sm font-medium">{label}</span>
            </div>
          );
        })}
      </nav>
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: BRAND }}>DB</div>
          <div>
            <p className="text-white text-xs font-medium">Daniela Biaggio</p>
            <p className="text-white/40 text-[10px]">Urban Ecology Manager</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

type AuditType   = "completed-works" | "outcomes";
type AuditResult = "pass" | "fail" | "partial";

interface AuditRecord {
  id: number;
  type: AuditType;
  site: string;
  gardenType: string;
  suburb: string;
  servicedDate: string;
  auditDate: string;
  auditor: string;
  score: number;
  result: AuditResult;
  daysAfterService?: number;
  flags: string[];
}

const AUDITS: AuditRecord[] = [
  { id: 1, type: "completed-works", site: "Waitangirua Mall Entry",   gardenType: "Rose",     suburb: "Waitangirua",  servicedDate: "22 Mar", auditDate: "24 Mar", auditor: "Daniela Biaggio", score: 91, result: "pass",    daysAfterService: 2, flags: [] },
  { id: 2, type: "completed-works", site: "Cobham Court Reserve",     gardenType: "Amenity",  suburb: "Papakowhai",   servicedDate: "21 Mar", auditDate: "24 Mar", auditor: "Jude Morison",    score: 62, result: "fail",    daysAfterService: 3, flags: ["Litter not cleared", "Edging incomplete"] },
  { id: 3, type: "outcomes",        site: "Kenepuru Stream Edge",      gardenType: "Reveg",    suburb: "Kenepuru",     servicedDate: "–",      auditDate: "23 Mar", auditor: "Daniela Biaggio", score: 84, result: "pass",    flags: [] },
  { id: 4, type: "completed-works", site: "Titahi Bay Esplanade",     gardenType: "Ornamental",suburb: "Titahi Bay",  servicedDate: "22 Mar", auditDate: "25 Mar", auditor: "Tim Broadwith",   score: 78, result: "partial", daysAfterService: 3, flags: ["Weed cover marginal — 8%"] },
  { id: 5, type: "outcomes",        site: "Mungavin Ave Median",      gardenType: "Amenity",  suburb: "Porirua East", servicedDate: "–",      auditDate: "22 Mar", auditor: "Jude Morison",    score: 55, result: "fail",    flags: ["Weed cover >15%", "Mulch depth inadequate", "Edging overgrown"] },
  { id: 6, type: "completed-works", site: "Parumoana St Roundabout",  gardenType: "Annuals",  suburb: "Porirua",      servicedDate: "20 Mar", auditDate: "23 Mar", auditor: "Tim Broadwith",   score: 96, result: "pass",    daysAfterService: 3, flags: [] },
  { id: 7, type: "outcomes",        site: "Aotea Lagoon Surrounds",   gardenType: "Reveg",    suburb: "Aotea",        servicedDate: "–",      auditDate: "21 Mar", auditor: "Daniela Biaggio", score: 88, result: "pass",    flags: [] },
  { id: 8, type: "completed-works", site: "Leulumoega Dr Reserve",    gardenType: "Amenity",  suburb: "Cannons Creek",servicedDate: "19 Mar", auditDate: "21 Mar", auditor: "Jude Morison",    score: 70, result: "partial", daysAfterService: 2, flags: ["Dead heading missed"] },
];

const SITES_IN_WINDOW = [
  { id: "S1", site: "Rangituhi Reserve",    type: "Amenity", suburb: "Waitangirua", servicedDate: "22 Mar", daysAgo: 4 },
  { id: "S2", site: "Papakowhai Entrance",  type: "Rose",    suburb: "Papakowhai",  servicedDate: "23 Mar", daysAgo: 3 },
  { id: "S3", site: "Te Pua o Wairaka",     type: "Reveg",   suburb: "Porirua",     servicedDate: "24 Mar", daysAgo: 2 },
  { id: "S4", site: "Elsdon Park Edge",     type: "Ornamental", suburb: "Elsdon",   servicedDate: "25 Mar", daysAgo: 1 },
];

const ALL_SITES = [
  { id: "A1", site: "Kenepuru Stream Edge",     type: "Reveg",    suburb: "Kenepuru",    lastService: "2 Mar"  },
  { id: "A2", site: "Aotea Lagoon Surrounds",   type: "Reveg",    suburb: "Aotea",       lastService: "15 Mar" },
  { id: "A3", site: "Cobham Ct Reserve",        type: "Amenity",  suburb: "Papakowhai",  lastService: "21 Mar" },
  { id: "A4", site: "Mungavin Ave Median",      type: "Amenity",  suburb: "Porirua East",lastService: "8 Mar"  },
  { id: "A5", site: "Tītahi Bay Esplanade",     type: "Ornamental",suburb: "Titahi Bay",  lastService: "18 Mar" },
  { id: "A6", site: "Waitangirua Mall Entry",   type: "Rose",     suburb: "Waitangirua", lastService: "22 Mar" },
];

const PRIORITY_OPTIONS = [
  { value: "urgent",  label: "Urgent — within 2 days",  color: "#dc2626" },
  { value: "high",    label: "High — within 1 week",    color: "#ea580c" },
  { value: "standard",label: "Standard — next service", color: "#16a34a" },
];

function ResultBadge({ result }: { result: AuditResult }) {
  if (result === "pass") return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700">
      <CheckCircle2 className="w-3 h-3" />Pass
    </span>
  );
  if (result === "fail") return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600">
      <XCircle className="w-3 h-3" />Fail
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
      <AlertTriangle className="w-3 h-3" />Partial
    </span>
  );
}

function ScoreBar({ score, result }: { score: number; result: AuditResult }) {
  const colour = result === "pass" ? "#16a34a" : result === "fail" ? "#dc2626" : "#d97706";
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: colour }} />
      </div>
      <span className="text-xs font-semibold" style={{ color: colour }}>{score}%</span>
    </div>
  );
}

function RemedialModal({ audit, onClose }: { audit: AuditRecord; onClose: () => void }) {
  const [priority, setPriority] = useState("high");
  const [date,     setDate]     = useState("2 Apr 2026");
  const [note,     setNote]     = useState(audit.flags.join("; "));
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl shadow-2xl w-[440px] p-8 text-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: `${BRAND}18` }}>
            <CheckCheck className="w-7 h-7" style={{ color: BRAND }} />
          </div>
          <h2 className="text-base font-bold text-gray-900 mb-1">Remedial Task Created</h2>
          <p className="text-sm text-gray-500 mb-1"><strong>{audit.site}</strong></p>
          <p className="text-sm text-gray-400 mb-6">Scheduled for {date} · Priority: {PRIORITY_OPTIONS.find(p => p.value === priority)?.label}</p>
          <p className="text-xs text-gray-400 mb-4">This job has been added to the Schedule and assigned to Team B. Jude Morison has been notified.</p>
          <button onClick={onClose} className="w-full py-3 rounded-xl font-semibold text-white text-sm" style={{ background: BRAND }}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-[500px] flex flex-col overflow-hidden max-h-[80vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-red-50">
              <Wrench className="w-4.5 h-4.5 text-red-500" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">Create Remedial Task</h2>
              <p className="text-xs text-gray-400">From audit fail · {audit.site}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Audit summary */}
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-100 space-y-1.5">
            <p className="text-[11px] font-bold text-red-700 uppercase tracking-wide">Audit Findings</p>
            <p className="text-xs text-red-800 font-semibold">{audit.site} · {audit.auditDate} · {audit.score}%</p>
            {audit.flags.map(f => (
              <p key={f} className="text-[11px] text-red-700 flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />{f}
              </p>
            ))}
          </div>

          {/* Priority */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">Priority</p>
            <div className="space-y-2">
              {PRIORITY_OPTIONS.map(p => (
                <button key={p.value} onClick={() => setPriority(p.value)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border-2 text-left transition-all ${
                    priority === p.value ? "border-transparent" : "border-gray-100 hover:border-gray-200"
                  }`}
                  style={priority === p.value ? { borderColor: p.color, background: p.color + "0f" } : {}}>
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.color }} />
                  <span className="text-sm font-medium text-gray-800">{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Scheduled date */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">Scheduled for</p>
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50">
              <CalendarPlus className="w-4 h-4 text-gray-400" />
              <input
                value={date}
                onChange={e => setDate(e.target.value)}
                className="flex-1 text-sm bg-transparent outline-none text-gray-700"
                placeholder="Select date…"
              />
            </div>
          </div>

          {/* Remedial notes */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">Work instructions for crew</p>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full text-sm rounded-xl border border-gray-200 px-3.5 py-2.5 resize-none outline-none focus:border-[#00AECD] text-gray-700 placeholder-gray-400"
              style={{ minHeight: 72 }}
              placeholder="Describe what needs to be corrected…"
            />
          </div>

          {/* Assign team */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">Assign to</p>
            <div className="flex gap-2">
              {["Team A", "Team B", "Team C"].map(t => (
                <button key={t}
                  className={`flex-1 py-2 rounded-xl border-2 text-xs font-semibold transition-all ${
                    t === "Team B" ? "border-[#00AECD] text-[#00AECD] bg-[#00AECD08]" : "border-gray-100 text-gray-500 hover:border-gray-200"
                  }`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between flex-shrink-0">
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">Cancel</button>
          <button
            onClick={() => setSubmitted(true)}
            className="px-6 py-2.5 rounded-xl text-sm font-bold text-white flex items-center gap-2"
            style={{ background: "#dc2626" }}
          >
            <Wrench className="w-4 h-4" />Create Remedial Task
          </button>
        </div>
      </div>
    </div>
  );
}

type ModalStep = "type" | "site" | null;

function NewAuditModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<ModalStep>("type");
  const [auditType, setAuditType] = useState<AuditType | null>(null);
  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const windowSites = SITES_IN_WINDOW;
  const allSites = ALL_SITES.filter(s => s.site.toLowerCase().includes(search.toLowerCase()));
  const randomSite = () => {
    const s = ALL_SITES[Math.floor(Math.random() * ALL_SITES.length)];
    setSelectedSite(s.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-[540px] max-h-[80vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">New Audit</h2>
            <p className="text-xs text-gray-400">
              {step === "type" ? "Step 1 of 2 — Select audit type" : "Step 2 of 2 — Select site"}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex h-1">
          <div className="h-full transition-all" style={{ width: step === "type" ? "50%" : "100%", background: BRAND }} />
          <div className="flex-1 bg-gray-100" />
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {step === "type" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 mb-4">Choose the type of audit you are conducting today.</p>
              <button onClick={() => { setAuditType("completed-works"); setStep("site"); }}
                className="w-full text-left p-4 rounded-xl border-2 transition-all hover:border-[#00AECD] hover:bg-[#00AECD08] group border-gray-200">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#00AECD15] flex-shrink-0">
                    <ClipboardCheck className="w-5 h-5" style={{ color: BRAND }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900 mb-0.5">Completed Works Audit</p>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      Did the team do the job correctly? Only sites serviced <strong>within the last 4 days</strong> are eligible.
                    </p>
                    <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#00AECD15] text-[#00AECD]">
                      <Clock className="w-3 h-3" />{SITES_IN_WINDOW.length} sites in audit window
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#00AECD] mt-3 transition-colors" />
                </div>
              </button>
              <button onClick={() => { setAuditType("outcomes"); setStep("site"); }}
                className="w-full text-left p-4 rounded-xl border-2 transition-all hover:border-purple-400 hover:bg-purple-50/30 group border-gray-200">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-purple-50 flex-shrink-0">
                    <Shuffle className="w-5 h-5 text-purple-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900 mb-0.5">Outcomes Based Audit</p>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      Is the site in-spec right now? Audits <strong>any site at any time</strong> to validate whether maintenance frequency is set correctly.
                    </p>
                    <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full bg-purple-50 text-purple-600">
                      <MapPin className="w-3 h-3" />All {ALL_SITES.length}+ sites available
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-purple-400 mt-3 transition-colors" />
                </div>
              </button>
            </div>
          )}

          {step === "site" && auditType === "completed-works" && (
            <div>
              <p className="text-sm text-gray-500 mb-4">Only sites serviced within the last 4 days are eligible for a Completed Works audit.</p>
              <div className="space-y-2">
                {windowSites.map(s => (
                  <button key={s.id} onClick={() => setSelectedSite(s.id)}
                    className={`w-full text-left p-3.5 rounded-xl border-2 transition-all ${selectedSite === s.id ? "border-[#00AECD] bg-[#00AECD08]" : "border-gray-100 hover:border-gray-200"}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{s.site}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[11px] text-gray-400">{s.suburb}</span>
                          <span className="text-[11px] text-gray-400">{s.type}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-gray-400">Serviced {s.servicedDate}</p>
                        <p className={`text-[11px] font-semibold mt-0.5 ${s.daysAgo >= 3 ? "text-amber-600" : "text-gray-500"}`}>Day {s.daysAgo} of 4</p>
                      </div>
                    </div>
                    {s.daysAgo >= 4 && (
                      <div className="mt-1.5 flex items-center gap-1 text-[11px] text-amber-600">
                        <AlertTriangle className="w-3 h-3" />Last day in window — audit today
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === "site" && auditType === "outcomes" && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
                  <input className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-[#00AECD]"
                    placeholder="Search site..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <button onClick={randomSite}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                  <Shuffle className="w-3.5 h-3.5" />Random
                </button>
              </div>
              <div className="space-y-2">
                {allSites.map(s => (
                  <button key={s.id} onClick={() => setSelectedSite(s.id)}
                    className={`w-full text-left p-3.5 rounded-xl border-2 transition-all ${selectedSite === s.id ? "border-purple-400 bg-purple-50/30" : "border-gray-100 hover:border-gray-200"}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{s.site}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[11px] text-gray-400">{s.suburb}</span>
                          <span className="text-[11px] text-gray-400">{s.type}</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-gray-400">Last service {s.lastService}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t flex items-center justify-between">
          {step === "site" ? (
            <button onClick={() => setStep("type")} className="text-sm text-gray-400 hover:text-gray-600">← Back</button>
          ) : <div />}
          {step === "site" && selectedSite && (
            <button className="px-5 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: auditType === "outcomes" ? "#9333ea" : BRAND }}
              onClick={onClose}>
              Begin Audit →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function InternalAudits() {
  const [tab,          setTab]          = useState<AuditType>("completed-works");
  const [showModal,    setShowModal]    = useState(false);
  const [search,       setSearch]       = useState("");
  const [remedialFor,  setRemedialFor]  = useState<AuditRecord | null>(null);
  const [remedialDone, setRemedialDone] = useState<Set<number>>(new Set());

  const filtered     = AUDITS.filter(a => a.type === tab && a.site.toLowerCase().includes(search.toLowerCase()));
  const cwAudits     = AUDITS.filter(a => a.type === "completed-works");
  const obAudits     = AUDITS.filter(a => a.type === "outcomes");
  const cwPass       = cwAudits.filter(a => a.result === "pass").length;
  const obPass       = obAudits.filter(a => a.result === "pass").length;
  const windowPending = SITES_IN_WINDOW.length;

  const needsRemedial = (a: AuditRecord) => a.result === "fail" || a.result === "partial";

  return (
    <div className="flex min-h-screen bg-[#f5f7f9] font-sans">
      {showModal    && <NewAuditModal onClose={() => setShowModal(false)} />}
      {remedialFor  && <RemedialModal audit={remedialFor} onClose={() => { setRemedialDone(s => new Set(s).add(remedialFor!.id)); setRemedialFor(null); }} />}

      <Sidebar active="audits" />

      <main className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Audits</h1>
            <p className="text-xs text-gray-400">Completed Works & Outcomes Based — field auditing & office review</p>
          </div>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90"
            style={{ background: BRAND }}>
            <Plus className="w-4 h-4" />New Audit
          </button>
        </header>

        <div className="flex-1 p-6 space-y-5">
          {/* Stat cards */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "CW Pass Rate",      value: `${Math.round((cwPass / cwAudits.length) * 100)}%`, sub: `${cwPass} of ${cwAudits.length} pass`,          colour: "#16a34a" },
              { label: "OB Pass Rate",      value: `${Math.round((obPass / obAudits.length) * 100)}%`, sub: `${obPass} of ${obAudits.length} pass`,          colour: "#9333ea" },
              { label: "In Audit Window",   value: String(windowPending),                              sub: "sites eligible for CW audit",                    colour: BRAND    },
              { label: "Audits This Month", value: String(AUDITS.length),                              sub: `${cwAudits.length} CW · ${obAudits.length} OB`, colour: "#64748b" },
            ].map(({ label, value, sub, colour }) => (
              <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
                <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wider mb-1">{label}</p>
                <p className="text-2xl font-bold" style={{ color: colour }}>{value}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>
              </div>
            ))}
          </div>

          {/* Tab + table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-4 border-b">
              <div className="flex gap-1">
                <button onClick={() => setTab("completed-works")}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${tab === "completed-works" ? "border-[#00AECD] text-[#00AECD]" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
                  <ClipboardCheck className="w-3.5 h-3.5" />Completed Works
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${tab === "completed-works" ? "bg-[#00AECD15] text-[#00AECD]" : "bg-gray-100 text-gray-400"}`}>{cwAudits.length}</span>
                </button>
                <button onClick={() => setTab("outcomes")}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${tab === "outcomes" ? "border-purple-500 text-purple-600" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
                  <Shuffle className="w-3.5 h-3.5" />Outcomes Based
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${tab === "outcomes" ? "bg-purple-50 text-purple-600" : "bg-gray-100 text-gray-400"}`}>{obAudits.length}</span>
                </button>
              </div>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
                <input className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-[#00AECD] w-48"
                  placeholder="Search audits..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>

            {tab === "completed-works" && (
              <div className="px-3 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-xs text-amber-700 font-medium">
                  {windowPending} sites in the 4-day audit window — <button className="underline" onClick={() => setShowModal(true)}>start a new audit</button>
                </span>
              </div>
            )}
            {tab === "outcomes" && (
              <div className="px-3 py-2 bg-purple-50 border-b border-purple-100 flex items-center gap-2">
                <Shuffle className="w-3.5 h-3.5 text-purple-500" />
                <span className="text-xs text-purple-700 font-medium">Random spot-checks — any site, any time. Low pass rates indicate frequency needs review.</span>
              </div>
            )}

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50">
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Site</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Auditor</th>
                  {tab === "completed-works" && <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Serviced</th>}
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Audited</th>
                  {tab === "completed-works" && <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Window</th>}
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Score</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Result</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => (
                  <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="text-[13px] font-semibold text-gray-900">{a.site}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-gray-400 flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{a.suburb}</span>
                        <span className="text-[11px] text-gray-400">{a.gardenType}</span>
                      </div>
                      {a.flags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {a.flags.map(f => (
                            <span key={f} className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600">{f}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ background: BRAND }}>
                          {a.auditor.split(" ").map(n => n[0]).join("")}
                        </div>
                        <span className="text-xs text-gray-700">{a.auditor}</span>
                      </div>
                    </td>
                    {tab === "completed-works" && <td className="px-4 py-3.5 text-xs text-gray-500">{a.servicedDate}</td>}
                    <td className="px-4 py-3.5 text-xs text-gray-500">{a.auditDate}</td>
                    {tab === "completed-works" && (
                      <td className="px-4 py-3.5">
                        <span className={`text-xs font-medium ${(a.daysAfterService ?? 0) >= 4 ? "text-amber-600" : "text-gray-400"}`}>
                          Day {a.daysAfterService} of 4
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-3.5"><ScoreBar score={a.score} result={a.result} /></td>
                    <td className="px-4 py-3.5"><ResultBadge result={a.result} /></td>
                    <td className="px-4 py-3.5 text-right">
                      {needsRemedial(a) ? (
                        remedialDone.has(a.id) ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                            <CheckCheck className="w-3 h-3" />Remedial set
                          </span>
                        ) : (
                          <button
                            onClick={() => setRemedialFor(a)}
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg text-white transition-opacity hover:opacity-90"
                            style={{ background: "#dc2626" }}
                          >
                            <Wrench className="w-3 h-3" />Remedial
                          </button>
                        )
                      ) : (
                        <button className="text-gray-300 hover:text-gray-500"><ChevronRight className="w-4 h-4" /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="py-12 text-center text-gray-400 text-sm">No audits found</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
