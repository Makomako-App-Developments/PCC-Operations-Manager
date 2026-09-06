import { useState } from "react";
import {
  AlertTriangle, CalendarDays, Check, CheckSquare, ChevronDown, CloudLightning,
  Download, FileText, Grid2X2, HelpCircle, Layers, List, LogOut, Map,
  MapPin, Navigation, Plus, Search, Settings, Sprout, UsersRound,
} from "lucide-react";
import "./_group.css";

const nav = [
  [Grid2X2, "Dashboard"], [List, "Asset Register"], [Map, "Map"], [CalendarDays, "Schedule"],
  [AlertTriangle, "Unscheduled Work"], [CloudLightning, "Storm Patrol"], [Sprout, "Infill Planting"],
  [Layers, "Mulching"], [CheckSquare, "Completed Works"], [FileText, "Audits"],
  [Grid2X2, "Reports"], [FileText, "Specification"], [UsersRound, "Team"], [HelpCircle, "Help"],
] as const;

const assets = [
  { id: "bodman", name: "Bodman SW grate", address: "56d Bodmans Lane", hot: false },
  { id: "titahi", name: "Titahi Bay catchpit", address: "16 Bay Drive", hot: true },
  { id: "mexted", name: "Mexted Terrace culvert", address: "25 Mexted Terrace", hot: false },
  { id: "cannons", name: "Cannons Creek drain", address: "1 Bedford Street", hot: true },
];

export function Current() {
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [team, setTeam] = useState("");
  const [alert, setAlert] = useState("");
  const visibleAssets = assets.filter((asset) => `${asset.name} ${asset.address}`.toLowerCase().includes(search.toLowerCase()));
  const allSelected = visibleAssets.length > 0 && visibleAssets.every((asset) => selected.includes(asset.id));
  const toggle = (id: string) => setSelected((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  const selectAll = () => setSelected(allSelected ? selected.filter((id) => !visibleAssets.some((asset) => asset.id === id)) : [...new Set([...selected, ...visibleAssets.map((asset) => asset.id)])]);

  return (
    <div className="sp-page">
      <aside className="sp-sidebar">
        <div className="sp-brand-wrap">
          <div className="sp-brand">poriruacity</div>
          <div className="sp-product">Gardens Manager</div>
        </div>
        <nav className="sp-nav">
          {nav.map(([Icon, name]) => (
            <button className={`sp-nav-item ${name === "Storm Patrol" ? "active" : ""}`} key={name}>
              <Icon size={15} strokeWidth={1.8} /><span>{name}</span>
            </button>
          ))}
        </nav>
        <div className="sp-user">
          <div className="sp-user-row"><span className="sp-avatar">CW</span><div><b>Cameron Walker</b><small>ADMINISTRATOR</small></div><Settings size={14} /></div>
          <button><LogOut size={14} />Sign Out</button>
        </div>
      </aside>

      <section className="sp-workspace">
        <header className="sp-header">
          <div className="sp-event">
            <div className="sp-storm-icon"><CloudLightning size={24} /></div>
            <div>
              <div className="sp-event-title">Cyclone Timbo <span>ACTIVE</span></div>
              <div className="sp-event-meta">Activated: 13:12, 4 Sep <i>•</i> Rate: $100.00/hr</div>
            </div>
          </div>
          <div className="sp-header-actions">
            <button><Download size={15} /> CSV</button><button>PDF</button><button className="close">Close Event</button>
          </div>
        </header>

        <main className="sp-content">
          <aside className="sp-left-column">
            <section className="sp-card sp-status">
              <h3>LIVE STATUS</h3>
              <div className="sp-stats">
                <div><strong>0</strong><span>Total Jobs</span></div>
                <div className="cyan"><strong>0</strong><span>Completed</span></div>
                <div className="orange"><strong>0</strong><span>In Progress</span></div>
                <div className="red"><strong>0</strong><span>Escalations</span></div>
              </div>
            </section>
            <section className="sp-alert-card">
              <h3><AlertTriangle size={17} /> BROADCAST ALERT</h3>
              <textarea value={alert} onChange={(event) => setAlert(event.target.value)} placeholder="Urgent message for all field teams..." />
              <button className="sp-send">Send to Field</button>
            </section>
          </aside>

          <div className="sp-main-column">
            <section className="sp-card sp-package">
              <h2><Navigation size={20} /> Create Work Package</h2>
              <div className="sp-package-controls">
                <label>Response Phase<span className="sp-select">Pre-Storm Preparation <ChevronDown size={15} /></span></label>
                <label>Assign To Team<span className={`sp-select ${!team ? "placeholder" : ""}`} onClick={() => setTeam(team ? "" : "Northern Crew")}>{team || "Select team..."} <ChevronDown size={15} /></span></label>
                <button className="sp-publish" disabled={!team || selected.length === 0}><Plus size={16} /> Publish ({selected.length} Sites)</button>
              </div>
              <div className="sp-asset-box">
                <div className="sp-asset-toolbar">
                  <div className="sp-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search stormwater assets..." /></div>
                  <span>Selected: <b>{selected.length}</b></span>
                  <button onClick={selectAll}>{allSelected ? "Deselect All" : "Select All Filtered"}</button>
                </div>
                <div className="sp-asset-content">
                  <div className="sp-asset-list">
                    {visibleAssets.map((asset) => <label className={`sp-asset ${selected.includes(asset.id) ? "selected" : ""}`} key={asset.id}>
                      <input type="checkbox" checked={selected.includes(asset.id)} onChange={() => toggle(asset.id)} />
                      <div><b>{asset.name}</b><span>{asset.address}</span></div>{asset.hot && <em>HOTSPOT</em>}
                    </label>)}
                  </div>
                  <div className="sp-map">
                    <div className="sp-map-label porirua">PORIRUA</div><div className="sp-map-label request">REQUESTED</div>
                    <div className="sp-map-road r1" /><div className="sp-map-road r2" /><div className="sp-map-road r3" />
                    <div className="sp-map-point p1" /><div className="sp-map-point p2" /><div className="sp-map-point p3" />
                    <div className="sp-zoom"><button>+</button><button>−</button></div>
                  </div>
                </div>
              </div>
            </section>
            <section className="sp-card sp-operations">
              <div className="sp-operations-head"><h2>Live Field Operations</h2><span><i /> Auto-syncing</span></div>
              <table><thead><tr><th>Phase</th><th>Site</th><th>Team</th><th>Status</th><th>Comments</th></tr></thead><tbody><tr><td colSpan={5}>No jobs dispatched yet.</td></tr></tbody></table>
            </section>
          </div>
        </main>
      </section>
    </div>
  );
}