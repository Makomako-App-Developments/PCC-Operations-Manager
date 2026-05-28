export function UpNextGeosequence() {
  const jobs = [
    { seq: 1, name: "Karehana Park", desc: "Streamside planting", suburb: "Plimmerton", type: "Amenity", time: "30m", status: "In Progress", statusColor: "#00AECD", statusBg: "#e6f8fb", statusBorder: "#b3ecf5" },
    { seq: 2, name: "Karehana Park", desc: "Airlie road Entrance", suburb: "Plimmerton", type: "Amenity", time: "6m", status: "Pending", statusColor: "#6b7280", statusBg: "#f3f4f6", statusBorder: "#e5e7eb" },
    { seq: 3, name: "Kerehana Park", desc: "Kerehana petanque court garden", suburb: "Plimmerton", type: "Ornamental", time: "20m", status: "Pending", statusColor: "#6b7280", statusBg: "#f3f4f6", statusBorder: "#e5e7eb" },
    { seq: 4, name: "Kerehana Park", desc: "Cluny Rd entrance garden", suburb: "Plimmerton", type: "Ornamental", time: "30m", status: "Pending", statusColor: "#6b7280", statusBg: "#f3f4f6", statusBorder: "#e5e7eb" },
    { seq: 5, name: "Plimmerton boat club", desc: "Entrance garden", suburb: "Plimmerton", type: "Ornamental", time: "45m", status: "Pending", statusColor: "#6b7280", statusBg: "#f3f4f6", statusBorder: "#e5e7eb" },
  ];

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#f0f2f5", minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "0" }}>
      {/* Phone shell */}
      <div style={{ width: 390, background: "#0f2a36", minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative" }}>

        {/* Header */}
        <div style={{ background: "#0f2a36", padding: "52px 20px 20px", flexShrink: 0 }}>
          <p style={{ color: "#94a3b8", fontSize: 13, margin: "0 0 4px", fontWeight: 400 }}>Good morning, Felise</p>
          <h1 style={{ color: "#fff", fontSize: 26, fontWeight: 700, margin: "0 0 20px", letterSpacing: -0.5 }}>Thursday, 28 May</h1>

          {/* Stats bar */}
          <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 14, display: "flex" }}>
            {[["9", "Remaining"], ["1", "Completed"], ["10", "Total Today"]].map(([n, label], i) => (
              <div key={i} style={{ flex: 1, padding: "14px 0", textAlign: "center", borderRight: i < 2 ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
                <div style={{ color: "#fff", fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{n}</div>
                <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Scroll body */}
        <div style={{ background: "#f0f2f5", borderTopLeftRadius: 24, borderTopRightRadius: 24, flex: 1, padding: "18px 14px 24px", overflowY: "auto" }}>

          {/* Section header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, padding: "0 2px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#00AECD" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span style={{ fontWeight: 700, fontSize: 15, color: "#0f2a36" }}>Up Next</span>
            </div>
            <span style={{ color: "#94a3b8", fontSize: 13, fontWeight: 500 }}>9</span>
          </div>

          {/* Job cards */}
          {jobs.map((job) => (
            <div key={job.seq} style={{
              background: "#fff",
              borderRadius: 14,
              border: "1px solid #e5e7eb",
              padding: "12px 14px",
              marginBottom: 10,
              position: "relative",
            }}>
              {/* Card header row */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                {/* Title with sequence indicator */}
                <div style={{ flex: 1, display: "flex", alignItems: "flex-start", gap: 8 }}>
                  {/* === GEOSEQUENCE BADGE === */}
                  <div style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    background: "#f3f4f6",
                    border: "1px solid #e5e7eb",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginTop: 1,
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", lineHeight: 1 }}>{job.seq}</span>
                  </div>
                  {/* === END GEOSEQUENCE BADGE === */}
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 600, fontSize: 15, color: "#0f172a", margin: 0, lineHeight: 1.3 }}>{job.name}</p>
                    <p style={{ fontSize: 12, color: "#94a3b8", margin: "2px 0 0", lineHeight: 1.3 }}>{job.desc}</p>
                  </div>
                </div>
                {/* Status badge */}
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: job.statusColor,
                  background: job.statusBg,
                  border: `1px solid ${job.statusBorder}`,
                  borderRadius: 20,
                  padding: "3px 9px",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}>{job.status}</span>
              </div>

              {/* Footer row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <MetaChip icon="map-pin" label={job.suburb} />
                  <MetaChip icon="layers" label={job.type} />
                  <MetaChip icon="clock" label={job.time} accent />
                </div>
                <button style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "5px 9px",
                  borderRadius: 8,
                  border: "1px solid rgba(0,174,205,0.4)",
                  background: "rgba(0,174,205,0.07)",
                  cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#00AECD",
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
                  Navigate
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom nav */}
        <div style={{ background: "#fff", borderTop: "1px solid #e5e7eb", display: "flex", padding: "10px 0 24px" }}>
          {[
            { label: "Today", icon: "home", active: true },
            { label: "Assets", icon: "layers" },
            { label: "Spec", icon: "file-text" },
            { label: "Report", icon: "alert-circle" },
            { label: "Me", icon: "user" },
          ].map((tab) => (
            <div key={tab.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <NavIcon name={tab.icon} active={tab.active} />
              <span style={{ fontSize: 10, fontWeight: tab.active ? 600 : 400, color: tab.active ? "#00AECD" : "#94a3b8" }}>{tab.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetaChip({ icon, label, accent }: { icon: string; label: string; accent?: boolean }) {
  const paths: Record<string, string> = {
    "map-pin": "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
    "layers": "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
    "clock": "M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm1-8h3v2h-5V7h2v5z",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={accent ? "#00AECD" : "#94a3b8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {paths[icon]?.split(" M").map((d, i) => <path key={i} d={i === 0 ? d : "M" + d} />)}
      </svg>
      <span style={{ fontSize: 12, color: accent ? "#00AECD" : "#94a3b8", fontWeight: accent ? 600 : 400 }}>{label}</span>
    </div>
  );
}

function NavIcon({ name, active }: { name: string; active?: boolean }) {
  const color = active ? "#00AECD" : "#94a3b8";
  const icons: Record<string, React.ReactNode> = {
    home: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    layers: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
    "file-text": <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
    "alert-circle": <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
    user: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  };
  return <>{icons[name]}</>;
}
