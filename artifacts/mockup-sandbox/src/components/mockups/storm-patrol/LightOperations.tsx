import { useState } from "react";
import {
  AlertTriangle, CalendarDays, CheckSquare, ChevronDown, CloudLightning,
  Download, FileText, Grid2X2, HelpCircle, Layers, List, LogOut, Map,
  Navigation, Plus, Search, Settings, Sprout, UsersRound, X,
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

export function LightOperations() {
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [team, setTeam] = useState("");
  const [alert, setAlert] = useState("");
  const [sent, setSent] = useState(false);
  const visibleAssets = assets.filter((asset) => `${asset.name} ${asset.address}`.toLowerCase().includes(search.toLowerCase()));
  const allSelected = visibleAssets.length > 0 && visibleAssets.every((asset) => selected.includes(asset.id));
  const toggle = (id: string) => setSelected((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  const selectAll = () => setSelected(allSelected ? selected.filter((id) => !visibleAssets.some((asset) => asset.id === id)) : [...new Set([...selected, ...visibleAssets.map((asset) => asset.id)])]);
  const exportData = (kind: string) => window.alert(`${kind} export prepared for Cyclone Timbo.`);

  return (
    <div className="min-h-[100dvh] flex overflow-hidden bg-[#e8f0f1] text-[#16333d] font-['DM_Sans',sans-serif] text-[13px]">
      <aside className="w-[190px] shrink-0 min-h-[100dvh] flex flex-col bg-[#0d2b36] border-r border-[#274b55] text-white">
        <div className="px-4 pt-[18px] pb-4 border-b border-white/10">
          <div className="rounded-md bg-[#09abc5] py-[9px] text-center text-base font-extrabold shadow-[inset_0_0_0_1px_rgba(255,255,255,.28)]">poriruacity</div>
          <div className="mt-[5px] text-center uppercase tracking-[1.2px] text-[8px] text-white/50">Gardens Manager</div>
        </div>
        <nav className="flex-1 px-[10px] py-[14px]">
          {nav.map(([Icon, name]) => <button key={name} onClick={() => undefined} className={`mb-0.5 flex w-full items-center gap-[11px] rounded-md px-[9px] py-2 text-left text-xs transition-colors ${name === "Storm Patrol" ? "bg-[#08acc7] text-white shadow-sm" : "text-white/65 hover:bg-white/10"}`}><Icon size={15} strokeWidth={1.8}/><span>{name}</span></button>)}
        </nav>
        <div className="border-t border-white/10 px-[14px] py-3 text-white/65">
          <div className="mb-3 flex items-center gap-2"><span className="grid h-[27px] w-[27px] place-items-center rounded-full bg-[#08acc7] text-[10px] font-extrabold text-white">CW</span><div><b className="block text-[10px] text-white">Cameron Walker</b><small className="mt-0.5 block text-[8px] text-white/45">ADMINISTRATOR</small></div><Settings size={14} className="ml-auto text-white/45"/></div>
          <button onClick={() => window.alert("Signed out")} className="flex items-center gap-2 px-1 text-[11px]"><LogOut size={14}/>Sign Out</button>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-[84px] items-center justify-between border-b border-[#c8d8db] bg-[#f8fbfb] px-5 py-4 shadow-[0_1px_5px_rgba(22,51,61,.06)]">
          <div className="flex items-center gap-[13px]"><div className="grid h-10 w-10 place-items-center rounded-[9px] border border-red-200 bg-red-50 text-red-600"><CloudLightning size={24}/></div><div><div className="text-[17px] font-extrabold tracking-[-.25px]">Cyclone Timbo <span className="ml-2 align-[2px] rounded-[3px] bg-[#dc3d45] px-1.5 py-[3px] text-[9px] font-extrabold tracking-[.5px] text-white">ACTIVE</span></div><div className="mt-1 text-[10px] text-[#6f858b]">Activated: 13:12, 4 Sep <i className="mx-[11px] not-italic">•</i> Rate: $100.00/hr <i className="mx-[11px] not-italic">•</i> ID: 92d83cbe</div></div></div>
          <div className="flex gap-2"><button onClick={() => exportData("CSV")} className="flex items-center gap-1.5 rounded border border-[#c8d8db] bg-white px-[13px] py-2 text-xs font-semibold text-[#31545d]"><Download size={15}/>CSV</button><button onClick={() => exportData("PDF")} className="rounded border border-[#c8d8db] bg-white px-[13px] py-2 text-xs font-semibold text-[#31545d]">PDF</button><button onClick={() => window.confirm("Close Cyclone Timbo event?") && window.alert("Event closed")} className="flex items-center gap-1.5 rounded border border-red-200 bg-red-50 px-[13px] py-2 text-xs font-semibold text-red-600"><X size={15}/>Close Event</button></div>
        </header>

        <main className="grid min-w-0 flex-1 grid-cols-[188px_minmax(0,1fr)] gap-[18px] overflow-auto bg-[#e8f0f1] px-[18px] pb-7 pt-2">
          <aside>
            <section className="mb-[18px] rounded-[14px] border border-[#cbdcdf] bg-white p-[18px_16px] shadow-[0_2px_8px_rgba(26,62,70,.06)]"><h3 className="mb-[17px] text-[11px] font-bold tracking-[.8px] text-[#627b82]">LIVE STATUS</h3><div className="grid grid-cols-2 gap-[14px]">
              <div><strong className="block text-[26px] leading-[27px]">0</strong><span className="mt-0.5 block text-[10px] text-[#799097]">Total Jobs</span></div><div><strong className="block text-[26px] leading-[27px] text-[#089ab4]">0</strong><span className="mt-0.5 block text-[10px] text-[#089ab4]">Completed</span></div><div><strong className="block text-[26px] leading-[27px] text-[#ee7717]">0</strong><span className="mt-0.5 block text-[10px] text-[#ee7717]">In Progress</span></div><div><strong className="block text-[26px] leading-[27px] text-[#d9434a]">0</strong><span className="mt-0.5 block text-[10px] text-[#d9434a]">Escalations</span></div>
            </div></section>
            <section className="rounded-xl border border-orange-200 bg-[#fff8ed] p-4"><h3 className="mb-[11px] flex items-center gap-1.5 text-[11px] font-bold text-[#dc7410]"><AlertTriangle size={17}/>BROADCAST ALERT</h3><textarea value={alert} onChange={(e) => {setAlert(e.target.value);setSent(false)}} placeholder="Urgent message for all field teams..." className="block h-[58px] w-full resize-none rounded border border-orange-200 bg-white p-2 text-[11px] text-[#263f47] outline-none placeholder:text-[#9aaeb1]"/><button onClick={() => {setSent(true); window.alert("Broadcast sent to all field teams.")}} className="mt-2.5 w-full rounded border border-orange-300 bg-[#df760e] p-2 text-xs font-bold text-white">{sent ? "Sent to Field" : "Send to Field"}</button></section>
          </aside>

          <div className="min-w-0">
            <section className="mb-[18px] rounded-[14px] border border-[#cbdcdf] bg-white p-5 shadow-[0_2px_8px_rgba(26,62,70,.06)]"><h2 className="flex items-center gap-2.5 text-base font-bold text-[#16333d]"><Navigation size={20} className="text-[#089eb8]"/>Create Work Package</h2>
              <div className="my-5 grid grid-cols-[1.05fr_1fr_1fr] items-end gap-5"><label className="text-[11px] text-[#6f858b]">Response Phase<span className="mt-[7px] flex h-8 items-center justify-between rounded border border-[#cbdcdf] bg-[#f7fafb] px-2.5 text-[11px] text-[#274750]">Pre-Storm Preparation<ChevronDown size={15}/></span></label><label className="text-[11px] text-[#6f858b]">Assign To Team<span onClick={() => setTeam(team ? "" : "Northern Crew")} className={`mt-[7px] flex h-8 cursor-pointer items-center justify-between rounded border border-[#cbdcdf] bg-[#f7fafb] px-2.5 text-[11px] ${team ? "text-[#274750]" : "text-[#9aadb1]"}`}>{team || "Select team..."}<ChevronDown size={15}/></span></label><button disabled={!team || selected.length === 0} onClick={() => window.alert(`Published ${selected.length} sites to ${team}.`)} className="flex h-8 items-center justify-center gap-1.5 rounded border border-[#6dcbd8] bg-[#0aa7bf] text-[11px] font-bold text-white disabled:opacity-40"><Plus size={16}/>Publish ({selected.length} Sites)</button></div>
              <div className="h-[322px] overflow-hidden rounded-[9px] border border-[#cbdcdf] bg-[#f5f9f9]"><div className="flex h-[47px] items-center gap-4 border-b border-[#d5e1e3] bg-[#f8fbfb] px-[11px] text-[11px] text-[#6f858b]"><div className="flex h-[27px] w-[205px] items-center gap-1.5 rounded border border-[#cbdcdf] bg-white px-2"><Search size={15} className="text-[#8da2a7]"/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search stormwater assets..." className="w-full bg-transparent text-[11px] outline-none placeholder:text-[#9aadb1]"/></div><span className="ml-auto">Selected: <b className="text-[#16333d]">{selected.length}</b></span><button onClick={selectAll} className="text-[10px] text-[#46717b]">{allSelected ? "Deselect All" : "Select All Filtered"}</button></div><div className="flex h-[calc(100%-47px)]"><div className="w-2/5 min-w-[190px] overflow-auto border-r border-[#d5e1e3] p-1.5">{visibleAssets.map((asset) => <label key={asset.id} className={`flex items-start gap-2 rounded-md border p-2 text-[11px] ${selected.includes(asset.id) ? "border-[#78ccd5] bg-[#e4f7f8]" : "border-transparent"}`}><input type="checkbox" checked={selected.includes(asset.id)} onChange={() => toggle(asset.id)} className="mt-0.5 accent-[#08a7bf]"/><div><b className="block font-semibold text-[#23434c]">{asset.name}</b><span className="mt-0.5 block text-[10px] text-[#80959a]">{asset.address}</span></div>{asset.hot && <em className="ml-auto rounded bg-red-50 px-1 py-0.5 text-[8px] font-extrabold not-italic text-red-600">HOTSPOT</em>}</label>)}</div><div className="relative flex-1 overflow-hidden bg-[#dbe9e7]"><div className="absolute inset-[-10%] opacity-80" style={{backgroundImage:"radial-gradient(ellipse at 55% 40%,rgba(105,160,157,.35),transparent 45%),linear-gradient(145deg,transparent 42%,rgba(85,132,126,.45) 42.2%,transparent 43%),repeating-linear-gradient(132deg,transparent 0 28px,rgba(76,119,112,.25) 29px 30px,transparent 31px 60px)"}}/><span className="absolute left-[51%] top-1/2 text-xs font-bold tracking-wider text-[#6a8f8d]">PORIRUA</span><span className="absolute left-[8%] top-[35%] -rotate-45 text-xs font-bold tracking-wider text-[#729492]">REQUESTED</span>{["left-[45%] top-[30%]","left-[71%] top-[61%]","left-[34%] top-[74%]"].map((pos) => <i key={pos} className={`absolute h-2 w-2 rounded-full border-2 border-[#16727b] bg-white ${pos}`}/>) }<div className="absolute left-2.5 top-2.5 flex flex-col shadow-sm"><button className="h-7 w-7 bg-white text-xl text-[#29464e]">+</button><button className="h-7 w-7 border-t border-[#d1d1d1] bg-white text-xl text-[#29464e]">−</button></div></div></div></div>
            </section>
            <section className="h-[218px] overflow-hidden rounded-[14px] border border-[#cbdcdf] bg-white shadow-[0_2px_8px_rgba(26,62,70,.06)]"><div className="flex h-[45px] items-center justify-between border-b border-[#d5e1e3] bg-[#f5f9f9] px-[13px]"><h2 className="text-[13px] font-bold">Live Field Operations</h2><span className="flex items-center gap-1.5 text-[10px] text-[#70878c]"><i className="h-[7px] w-[7px] rounded-full bg-[#22a85b]"/>Auto-syncing</span></div><table className="w-full border-collapse text-left text-[11px]"><thead><tr>{["Phase","Site","Team","Status","Comments"].map((head) => <th key={head} className="bg-[#edf5f5] px-[13px] py-[11px] font-medium text-[#688086]">{head}</th>)}</tr></thead><tbody><tr><td colSpan={5} className="pt-[30px] text-center text-[#91a4a8]">No jobs dispatched yet.</td></tr></tbody></table></section>
          </div>
        </main>
      </section>
    </div>
  );
}