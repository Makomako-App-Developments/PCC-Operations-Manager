export function UpNextGeosequence() {
  const jobs = [
    { seq: 1, name: "Karehana Park", desc: "Streamside planting", suburb: "Plimmerton", type: "Amenity", time: "30m", status: "In Progress", accent: true },
    { seq: 2, name: "Karehana Park", desc: "Airlie road Entrance", suburb: "Plimmerton", type: "Amenity", time: "6m", status: "Pending", accent: false },
    { seq: 3, name: "Kerehana Park", desc: "Kerehana petanque court garden", suburb: "Plimmerton", type: "Ornamental", time: "20m", status: "Pending", accent: false },
    { seq: 4, name: "Kerehana Park", desc: "Cluny Rd entrance garden", suburb: "Plimmerton", type: "Ornamental", time: "30m", status: "Pending", accent: false },
    { seq: 5, name: "Plimmerton boat club", desc: "Entrance garden", suburb: "Plimmerton", type: "Ornamental", time: "45m", status: "Pending", accent: false },
  ];

  return (
    <div style={{ background: "#f0f2f5", minHeight: "100vh", display: "flex", justifyContent: "center" }}>
      <div style={{ width: 390, background: "#f0f2f5", display: "flex", flexDirection: "column" }}>

        {/* Dark header */}
        <div style={{ background: "#0f2a36", padding: "52px 20px 22px" }}>
          <p style={{ color: "#94a3b8", fontSize: 13, margin: "0 0 2px" }}>Good morning, Felise</p>
          <h1 style={{ color: "#fff", fontSize: 26, fontWeight: 700, margin: "0 0 18px", letterSpacing: -0.5 }}>Thursday, 28 May</h1>
          <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 14, display: "flex" }}>
            {[["9","Remaining"],["1","Completed"],["10","Total Today"]].map(([n,l],i) => (
              <div key={i} style={{ flex:1, padding:"13px 0", textAlign:"center", borderRight: i<2 ? "1px solid rgba(255,255,255,0.09)" : "none" }}>
                <div style={{ color:"#fff", fontSize:21, fontWeight:700 }}>{n}</div>
                <div style={{ color:"#94a3b8", fontSize:11, marginTop:3 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* White rounded body */}
        <div style={{ background: "#f0f2f5", borderTopLeftRadius: 22, borderTopRightRadius: 22, marginTop: -10, padding: "18px 14px 32px", flex:1 }}>

          {/* Section header */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#00AECD" strokeWidth="2.2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span style={{ fontWeight:700, fontSize:15, color:"#0f2a36" }}>Up Next</span>
            </div>
            <span style={{ color:"#94a3b8", fontSize:13 }}>9</span>
          </div>

          {/* Cards */}
          {jobs.map((job) => (
            <div key={job.seq} style={{ background:"#fff", borderRadius:14, border:"1px solid #e5e7eb", padding:"13px 14px", marginBottom:10 }}>

              {/* Header row */}
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8, marginBottom:9 }}>
                {/* Left: seq badge + title */}
                <div style={{ display:"flex", alignItems:"flex-start", gap:8, flex:1 }}>
                  {/* GEOSEQUENCE BADGE */}
                  <div style={{
                    width:20, height:20,
                    borderRadius:6,
                    background:"#f3f4f6",
                    border:"1px solid #e5e7eb",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    flexShrink:0, marginTop:1,
                  }}>
                    <span style={{ fontSize:10, fontWeight:700, color:"#9ca3af", lineHeight:1 }}>{job.seq}</span>
                  </div>
                  <div>
                    <p style={{ fontWeight:600, fontSize:15, color:"#0f172a", margin:0 }}>{job.name}</p>
                    <p style={{ fontSize:12, color:"#94a3b8", margin:"2px 0 0" }}>{job.desc}</p>
                  </div>
                </div>
                {/* Status */}
                <span style={{
                  fontSize:11, fontWeight:600, borderRadius:20, padding:"3px 9px", flexShrink:0,
                  color: job.accent ? "#00AECD" : "#6b7280",
                  background: job.accent ? "#e6f8fb" : "#f3f4f6",
                  border: job.accent ? "1px solid #b3ecf5" : "1px solid #e5e7eb",
                }}>{job.status}</span>
              </div>

              {/* Footer row */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ display:"flex", alignItems:"center", gap:3 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    <span style={{ fontSize:12, color:"#94a3b8" }}>{job.suburb}</span>
                  </span>
                  <span style={{ display:"flex", alignItems:"center", gap:3 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
                    <span style={{ fontSize:12, color:"#94a3b8" }}>{job.type}</span>
                  </span>
                  <span style={{ display:"flex", alignItems:"center", gap:3 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00AECD" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    <span style={{ fontSize:12, color:"#00AECD", fontWeight:600 }}>{job.time}</span>
                  </span>
                </div>
                <button style={{ display:"flex", alignItems:"center", gap:4, padding:"5px 10px", borderRadius:8, border:"1px solid rgba(0,174,205,0.35)", background:"rgba(0,174,205,0.07)", fontSize:11, fontWeight:600, color:"#00AECD", cursor:"pointer" }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
                  Navigate
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom nav */}
        <div style={{ background:"#fff", borderTop:"1px solid #e5e7eb", display:"flex", padding:"10px 0 20px" }}>
          {[["Today",true],["Assets",false],["Spec",false],["Report",false],["Me",false]].map(([label, active]) => (
            <div key={label as string} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
              <div style={{ width:22, height:22, background: active ? "rgba(0,174,205,0.1)" : "transparent", borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center" }}>
                <div style={{ width:16, height:16, borderRadius:3, background: active ? "#00AECD" : "#cbd5e1" }} />
              </div>
              <span style={{ fontSize:10, fontWeight: active ? 600 : 400, color: active ? "#00AECD" : "#94a3b8" }}>{label as string}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
