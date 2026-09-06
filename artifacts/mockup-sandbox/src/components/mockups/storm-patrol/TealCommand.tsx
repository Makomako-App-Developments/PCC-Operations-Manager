import { useState } from "react";
import {
  AlertTriangle, CalendarDays, CheckSquare, ChevronDown, CloudLightning,
  Download, FileText, Grid2X2, HelpCircle, Layers, List, LogOut, Map,
  Navigation, Plus, Search, Settings, Sprout, UsersRound,
} from "lucide-react";

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

export function TealCommand() {
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [team, setTeam] = useState("");
  const [alert, setAlert] = useState("");
  const [sent, setSent] = useState(false);
  const [closed, setClosed] = useState(false);
  const [published, setPublished] = useState(false);
  const [packageCollapsed, setPackageCollapsed] = useState(false);
  const [exported, setExported] = useState("");
  const [phase, setPhase] = useState("Pre-Storm Preparation");
  const visible = assets.filter((a) => `${a.name} ${a.address}`.toLowerCase().includes(search.toLowerCase()));
  const allSelected = visible.length > 0 && visible.every((a) => selected.includes(a.id));
  const toggle = (id: string) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const selectAll = () => setSelected(allSelected ? selected.filter((id) => !visible.some((a) => a.id === id)) : [...new Set([...selected, ...visible.map((a) => a.id)])]);

  return <div className="tc-page">
    <style>{`
      .tc-page{--navy:#0b2632;--rail:#08232e;--teal:#087f88;--cyan:#18c4cf;--surface:#123943;--surface2:#174550;--line:rgba(111,224,226,.22);--muted:#91b5ba;min-height:100vh;display:flex;background:#0e5660;color:#eefdfd;font-family:ui-sans-serif,system-ui,sans-serif;font-size:13px;box-sizing:border-box}.tc-page *{box-sizing:border-box}.tc-page button,.tc-page input,.tc-page textarea{font:inherit}
      .tc-sidebar{width:190px;flex:none;display:flex;flex-direction:column;background:var(--rail);border-right:2px solid rgba(28,199,205,.35);min-height:100vh}.tc-brand-wrap{padding:18px 16px 16px;border-bottom:1px solid var(--line)}.tc-brand{background:#13afbd;border-radius:6px;padding:9px 4px;text-align:center;font-size:16px;line-height:18px;font-weight:800;box-shadow:inset 0 0 0 1px rgba(255,255,255,.3)}.tc-product{text-align:center;text-transform:uppercase;letter-spacing:1.2px;color:#77a4aa;font-size:8px;margin-top:5px}
      .tc-nav{flex:1;padding:14px 10px}.tc-nav-item{border:0;background:transparent;color:#93b2b7;width:100%;border-radius:6px;padding:8px 9px;display:flex;gap:11px;align-items:center;text-align:left;cursor:pointer;font-size:12px;margin-bottom:2px}.tc-nav-item.active{color:#fff;background:var(--teal);box-shadow:0 0 0 1px rgba(95,234,232,.5),0 3px 8px rgba(0,0,0,.22)}.tc-user{border-top:1px solid var(--line);padding:12px 14px;color:#8fafb3}.tc-user-row{display:flex;align-items:center;gap:8px;margin-bottom:12px}.tc-user-row>svg{margin-left:auto;color:#638b91}.tc-avatar{width:27px;height:27px;border-radius:50%;background:#12aeb9;display:grid;place-items:center;color:#fff;font-weight:800;font-size:10px}.tc-user b{display:block;color:#e9ffff;font-size:10px}.tc-user small{display:block;color:#6f999e;font-size:8px;margin-top:2px}.tc-user button{color:#8fafb3;background:none;border:0;padding:0 4px;display:flex;gap:8px;align-items:center;font-size:11px;cursor:pointer}
      .tc-workspace{min-width:0;flex:1;display:flex;flex-direction:column;background:linear-gradient(135deg,#0c6670 0%,#0e5360 55%,#124b59 100%)}.tc-header{min-height:84px;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;background:#092f3b;border-bottom:1px solid var(--line)}.tc-event{display:flex;align-items:center;gap:13px}.tc-storm-icon{width:40px;height:40px;border-radius:9px;display:grid;place-items:center;background:rgba(239,68,68,.17);color:#ff6565;border:1px solid rgba(255,104,104,.35)}.tc-event-title{font-size:17px;font-weight:750;letter-spacing:-.25px}.tc-event-title span{margin-left:8px;vertical-align:2px;background:#e84949;padding:3px 6px;border-radius:3px;font-size:9px;letter-spacing:.5px}.tc-event-meta{color:#88b6ba;font-size:10px;margin-top:5px}.tc-event-meta i{font-style:normal;margin:0 11px;color:#4e8990}.tc-header-actions{display:flex;gap:8px}.tc-header-actions button{color:#d9ffff;background:#103b46;border:1px solid var(--line);border-radius:5px;padding:8px 13px;display:flex;gap:7px;align-items:center;font-weight:600;font-size:12px;cursor:pointer}.tc-header-actions .close{background:rgba(207,57,57,.2);border-color:rgba(255,102,102,.35);color:#ff8585}
      .tc-content{padding:8px 18px 28px;display:grid;grid-template-columns:188px minmax(0,1fr);gap:18px;overflow:auto}.tc-card{border:1px solid var(--line);background:rgba(13,44,54,.78);border-radius:14px;box-shadow:0 8px 22px rgba(2,28,34,.16)}.tc-status{margin-bottom:18px;padding:18px 16px}.tc-card h3{font-size:11px;letter-spacing:.8px;color:#9bc2c5;margin:0 0 17px;font-weight:700}.tc-stats{display:grid;grid-template-columns:1fr 1fr;gap:14px}.tc-stats strong{font-size:26px;display:block;line-height:27px}.tc-stats span{color:#79a5aa;font-size:10px;display:block;margin-top:3px}.tc-stats .cyan strong,.tc-stats .cyan span{color:#22d4dd}.tc-stats .orange strong,.tc-stats .orange span{color:#ff9a3d}.tc-stats .red strong,.tc-stats .red span{color:#ff6262}
      .tc-alert{padding:16px;border:1px solid rgba(255,151,57,.38);background:rgba(121,60,16,.35);border-radius:12px}.tc-alert h3{margin:0 0 11px;display:flex;align-items:center;gap:6px;color:#ffae4b;font-size:11px}.tc-alert textarea{display:block;resize:none;width:100%;height:58px;border-radius:4px;border:1px solid rgba(255,169,71,.3);background:#102f36;padding:8px;color:#f4ffff;outline:none;font-size:11px}.tc-alert textarea::placeholder{color:#719095}.tc-send{width:100%;margin-top:10px;border:1px solid rgba(255,191,107,.36);background:#c96c18;color:#fff;border-radius:4px;padding:8px;font-size:12px;font-weight:700;cursor:pointer}
       .tc-main{min-width:0}.tc-package{padding:20px;margin-bottom:18px;display:flex;flex-direction:column;height:calc(100vh - 118px);max-height:calc(100vh - 118px);min-height:0}.tc-package.collapsed{height:auto;max-height:none}.tc-package-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}.tc-package-head button{border:1px solid var(--line);background:transparent;color:#b0d6d8;border-radius:4px;padding:6px 9px;cursor:pointer;font-size:10px}.tc-package h2,.tc-operations h2{margin:0;color:#edffff;font-size:16px;font-weight:650;display:flex;gap:10px;align-items:center}.tc-package h2 svg{color:#31d8df}.tc-controls{display:grid;grid-template-columns:1.05fr 1fr 1fr;gap:20px;margin:0 0 20px;align-items:end}.tc-controls label{color:#9bc2c5;font-size:11px}.tc-select{height:32px;margin-top:7px;border:1px solid var(--line);background:#0d303a;border-radius:3px;color:#eaffff;display:flex;align-items:center;justify-content:space-between;padding:0 10px;font-size:11px;cursor:pointer}.tc-select.placeholder{color:#79a1a5}.tc-publish{height:32px;border:1px solid rgba(59,222,226,.5);background:#16aeb8;color:white;border-radius:4px;display:flex;justify-content:center;align-items:center;gap:7px;font-size:11px;font-weight:700;cursor:pointer}.tc-publish:disabled{opacity:.45;cursor:not-allowed}
       .tc-asset-box{flex:1;min-height:0;border:1px solid var(--line);border-radius:9px;overflow:hidden;background:#f1f5f4}.tc-toolbar{height:47px;padding:8px 11px;display:flex;align-items:center;gap:16px;background:#e5eeee;border-bottom:1px solid #c1d1d1;color:#48636a;font-size:11px}.tc-search{width:205px;height:27px;display:flex;align-items:center;gap:6px;padding:0 8px;background:#fff;border:1px solid #c1d1d1;border-radius:3px}.tc-search svg{color:#729096}.tc-search input{border:0;outline:0;background:transparent;color:#16333d;width:100%;font-size:11px}.tc-search input::placeholder{color:#8aa0a3}.tc-toolbar span{margin-left:auto}.tc-toolbar b{color:#16333d}.tc-toolbar button{border:0;background:transparent;color:#48636a;font-size:10px;cursor:pointer}.tc-asset-content{display:flex;height:calc(100% - 47px)}.tc-list{width:40%;min-width:190px;overflow:auto;padding:7px;border-right:1px solid #c1d1d1}.tc-asset{display:flex;gap:9px;padding:8px;border:1px solid transparent;border-radius:6px;align-items:flex-start;font-size:11px;cursor:pointer;color:#16333d}.tc-asset.selected{background:#d7f0ef;border-color:#8ccfcd}.tc-asset input{accent-color:#0d9ea8;margin:3px 0 0}.tc-asset b,.tc-asset span{display:block}.tc-asset b{font-weight:600}.tc-asset span{color:#6d858a;font-size:10px;margin-top:2px}.tc-asset em{font-style:normal;font-size:8px;font-weight:800;color:#d84949;background:#fde3e3;padding:3px 4px;border-radius:3px;margin-left:auto}.tc-map{position:relative;overflow:hidden;flex:1;background:#dfe8e7;isolation:isolate}.tc-map:after{content:"";position:absolute;inset:-10%;background:radial-gradient(ellipse at 55% 40%,rgba(134,182,177,.35),transparent 45%),linear-gradient(145deg,transparent 42%,rgba(116,150,145,.38) 42.2%,transparent 43%),repeating-linear-gradient(132deg,transparent 0 28px,rgba(116,150,145,.25) 29px 30px,transparent 31px 60px);opacity:.9;z-index:-1}.tc-map-label{position:absolute;color:rgba(46,77,80,.55);font-size:12px;font-weight:700;letter-spacing:1px}.tc-porirua{left:51%;top:50%}.tc-request{transform:rotate(-47deg);top:35%;left:8%}.tc-road{position:absolute;height:2px;background:rgba(88,119,115,.5);transform:rotate(-48deg)}.tc-r1{width:280px;top:54%;left:12%}.tc-r2{width:250px;top:30%;left:45%}.tc-r3{width:170px;top:73%;left:31%}.tc-point{position:absolute;width:7px;height:7px;border-radius:100%;border:2px solid #607c7d;background:#fff}.tc-p1{left:45%;top:30%}.tc-p2{left:71%;top:61%}.tc-p3{left:34%;top:74%}.tc-zoom{position:absolute;top:10px;left:10px;display:flex;flex-direction:column;box-shadow:0 1px 3px rgba(34,64,68,.28)}.tc-zoom button{width:25px;height:25px;border:0;background:#fff;color:#16424a;font-size:19px;line-height:1;cursor:pointer}.tc-zoom button+button{border-top:1px solid #c1d1d1}
      .tc-operations{height:218px;overflow:hidden}.tc-operations-head{height:45px;padding:0 13px;display:flex;align-items:center;justify-content:space-between;background:rgba(87,203,202,.09);border-bottom:1px solid var(--line)}.tc-operations h2{font-size:13px}.tc-operations-head span{color:#9bc2c5;font-size:10px;display:flex;align-items:center;gap:5px}.tc-operations-head i{width:7px;height:7px;border-radius:100%;background:#50df82}.tc-operations table{width:100%;border-collapse:collapse;font-size:11px;text-align:left}.tc-operations th{padding:11px 13px;background:rgba(2,35,43,.32);color:#8eb7bb;font-weight:500}.tc-operations td{text-align:center;color:#77a1a5;padding-top:30px}
      @media(max-width:820px){.tc-sidebar{width:160px}.tc-content{grid-template-columns:1fr}.tc-left{display:grid;grid-template-columns:1fr 1fr;gap:16px}.tc-status{margin:0}.tc-controls{grid-template-columns:1fr}.tc-header-actions{display:none}}
     `}</style>
     <style>{`
       .tc-page{position:relative;isolation:isolate}
       .tc-page:before{content:"";position:absolute;inset:0;pointer-events:none;z-index:-1;opacity:.28;background:linear-gradient(115deg,rgba(116,242,237,.16),transparent 24%,transparent 78%,rgba(6,28,39,.28))}
       .tc-page button{transition:transform .16s ease,background-color .16s ease,border-color .16s ease,box-shadow .16s ease}
       .tc-page button:active{transform:translateY(1px)}
       .tc-page button:focus-visible,.tc-page input:focus-visible,.tc-page textarea:focus-visible{outline:2px solid #8af6f1;outline-offset:2px}
       .tc-sidebar{box-shadow:10px 0 28px rgba(3,28,37,.16)}
       .tc-brand{box-shadow:inset 0 0 0 1px rgba(255,255,255,.3),0 6px 14px rgba(0,0,0,.16)}
       .tc-header{box-shadow:0 8px 22px rgba(3,31,39,.13)}
       .tc-header-actions button:hover{background:#185260;border-color:rgba(138,246,241,.55)}
       .tc-header-actions .close:hover{background:rgba(207,57,57,.34)}
       .tc-card{background:rgba(13,44,54,.84);box-shadow:0 8px 22px rgba(2,28,34,.16),inset 0 1px 0 rgba(170,255,250,.05)}
       .tc-select:hover{border-color:rgba(138,246,241,.58);background:#123f49}
       .tc-publish:hover:not(:disabled){background:#23c7ce;box-shadow:0 5px 12px rgba(6,211,215,.18)}
       .tc-operations-head i{box-shadow:0 0 0 3px rgba(80,223,130,.12)}
     `}</style>
    <aside className="tc-sidebar"><div className="tc-brand-wrap"><div className="tc-brand">poriruacity</div><div className="tc-product">Gardens Manager</div></div><nav className="tc-nav">{nav.map(([Icon, name]) => <button className={`tc-nav-item ${name === "Storm Patrol" ? "active" : ""}`} key={name}><Icon size={15} strokeWidth={1.8}/><span>{name}</span></button>)}</nav><div className="tc-user"><div className="tc-user-row"><span className="tc-avatar">CW</span><div><b>Cameron Walker</b><small>ADMINISTRATOR</small></div><Settings size={14}/></div><button><LogOut size={14}/>Sign Out</button></div></aside>
     <section className="tc-workspace"><header className="tc-header"><div className="tc-event"><div className="tc-storm-icon"><CloudLightning size={24}/></div><div><div className="tc-event-title">Cyclone Timbo <span>{closed ? "CLOSED" : "ACTIVE"}</span></div><div className="tc-event-meta">Activated: 13:12, 4 Sep <i>•</i> Rate: $100.00/hr</div></div></div><div className="tc-header-actions">{exported && <span style={{color:"#8af6f1",fontSize:10,alignSelf:"center"}}>{exported} ready</span>}<button onClick={() => setExported("CSV")}><Download size={15}/> CSV</button><button onClick={() => setExported("PDF")}>PDF</button><button className="close" onClick={() => setClosed(!closed)}>{closed ? "Reopen Event" : "Close Event"}</button></div></header>
      <main className="tc-content"><aside className="tc-left"><section className="tc-card tc-status"><h3>LIVE STATUS</h3><div className="tc-stats"><div><strong>0</strong><span>Total Jobs</span></div><div className="cyan"><strong>0</strong><span>Completed</span></div><div className="orange"><strong>0</strong><span>In Progress</span></div><div className="red"><strong>0</strong><span>Escalations</span></div></div></section><section className="tc-alert"><h3><AlertTriangle size={17}/> BROADCAST ALERT</h3><textarea value={alert} onChange={(e) => {setAlert(e.target.value);setSent(false)}} placeholder="Urgent message for all field teams..."/><button className="tc-send" onClick={() => setSent(true)}>{sent ? "Sent to Field" : "Send to Field"}</button></section></aside>
          <div className="tc-main">
            <section className={`tc-card tc-package ${packageCollapsed ? "collapsed" : ""}`}>
              <div className="tc-package-head">
                <h2><Navigation size={20}/> Create Work Package</h2>
                <button onClick={() => setPackageCollapsed(!packageCollapsed)}>
                  {packageCollapsed ? "Open" : "Collapse"}
                </button>
              </div>
              {packageCollapsed ? (
                <div style={{color:"#9bc2c5",fontSize:11}}>
                  Last package published: {selected.length} site{selected.length === 1 ? "" : "s"}. Ready for the next package.
                </div>
              ) : (
                <>
                  <div className="tc-controls">
                    <label>Response Phase<span className="tc-select" onClick={() => setPhase(phase === "Pre-Storm Preparation" ? "Mid-Storm Response" : "Pre-Storm Preparation")}>{phase} <ChevronDown size={15}/></span></label>
                    <label>Assign To Team<span className={`tc-select ${!team ? "placeholder" : ""}`} onClick={() => setTeam(team ? "" : "Northern Crew")}>{team || "Select team..."} <ChevronDown size={15}/></span></label>
                    <button className="tc-publish" disabled={!team || selected.length === 0} onClick={() => { setPublished(true); setPackageCollapsed(true); }}><Plus size={16}/> {published ? "Package Published" : `Publish (${selected.length} Sites)`}</button>
                  </div>
                  <div className="tc-asset-box"><div className="tc-toolbar"><div className="tc-search"><Search size={15}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search stormwater assets..."/></div><span>Selected: <b>{selected.length}</b></span><button onClick={selectAll}>{allSelected ? "Deselect All" : "Select All Filtered"}</button></div><div className="tc-asset-content"><div className="tc-list">{visible.map((asset) => <label className={`tc-asset ${selected.includes(asset.id) ? "selected" : ""}`} key={asset.id}><input type="checkbox" checked={selected.includes(asset.id)} onChange={() => toggle(asset.id)}/><div><b>{asset.name}</b><span>{asset.address}</span></div>{asset.hot && <em>HOTSPOT</em>}</label>)}</div><div className="tc-map"><div className="tc-map-label tc-porirua">PORIRUA</div><div className="tc-map-label tc-request">REQUESTED</div><div className="tc-road tc-r1"/><div className="tc-road tc-r2"/><div className="tc-road tc-r3"/><div className="tc-point tc-p1"/><div className="tc-point tc-p2"/><div className="tc-point tc-p3"/><div className="tc-zoom"><button>+</button><button>−</button></div></div></div></div>
                </>
              )}
            </section>
            <section className="tc-card tc-operations"><div className="tc-operations-head"><h2>Live Field Operations</h2><span><i/> Auto-syncing</span></div><table><thead><tr><th>Phase</th><th>Site</th><th>Team</th><th>Status</th><th>Comments</th></tr></thead><tbody><tr><td colSpan={5}>No jobs dispatched yet.</td></tr></tbody></table></section>
          </div>
        </main>
      </section>
  </div>;
}