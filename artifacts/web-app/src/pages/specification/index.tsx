import { FileText, Download, ExternalLink } from "lucide-react";

const BRAND = "#00AECD";
const NAVY  = "#0f2a36";

const PDF_URL = `${import.meta.env.BASE_URL}pcc-hort-spec.pdf`;

// ─── Spec data ───────────────────────────────────────────────────────────────

const COLUMNS = [
  { id: "annuals",    type: "Type 1", label: "Annuals" },
  { id: "roses",      type: "Type 2", label: "Roses &\nPerennials" },
  { id: "ornamental", type: "Type 3", label: "Ornamental" },
  { id: "amenity",    type: "Type 4", label: "Amenity" },
  { id: "rain",       type: "Type 5", label: "Rain Garden" },
  { id: "reveg",      type: "Type 6", label: "Reveg" },
  { id: "bush",       type: "Type 7", label: "Bush" },
  { id: "tree",       type: "Type 8", label: "Tree\nPlanters/Pits" },
  { id: "hedges",     type: "Type 9", label: "Hedges" },
] as const;

type ColId = typeof COLUMNS[number]["id"];

type Cell =
  | string
  | { text: string; badge: "high" | "medium" | "low" | "weed-free" | "none" };

type Row = { label: string; sub?: string; values: Record<ColId, Cell> };

function grade(g: "High" | "Medium" | "Low"): Cell {
  return { text: g, badge: g === "High" ? "high" : g === "Low" ? "low" : "medium" };
}
const wf  = { text: "Weed free",    badge: "weed-free" } as const;
const na  = { text: "None allowed", badge: "none"      } as const;

const ROWS: Row[] = [
  {
    label: "Standard / Grade",
    values: {
      annuals: grade("High"), roses: grade("High"), ornamental: grade("High"),
      amenity: grade("Medium"), rain: grade("Medium"), reveg: grade("Medium"),
      bush: grade("Low"), tree: grade("Medium"), hedges: grade("Medium"),
    },
  },
  {
    label: "Maintenance Frequency",
    values: {
      annuals: "Weekly", roses: "Fortnightly", ornamental: "Fortnightly",
      amenity: "Monthly", rain: "Monthly", reveg: "Quarterly",
      bush: "Bimonthly", tree: "Monthly", hedges: "Seasonal",
    },
  },
  {
    label: "Weed Control Method",
    values: {
      annuals: "No herbicides", roses: "Mechanical", ornamental: "Mechanical",
      amenity: "Mechanical", rain: "Mechanical", reveg: "Chemical",
      bush: "Chemical", tree: "Mechanical", hedges: "Chemical",
    },
  },
  {
    label: "Litter",
    values: {
      annuals: "No old litter — surplus plant material removed immediately after each visit",
      roses:   "No old litter — surplus plant material removed immediately after each visit",
      ornamental: "No old litter — surplus plant material removed immediately after each visit",
      amenity: "No old litter — surplus plant material removed immediately after each visit",
      rain:    "No old litter — surplus plant material removed immediately after each visit",
      reveg:   "No old litter — surplus plant material removed immediately after each visit",
      bush:    "No old litter — all surplus plant material removed immediately after each visit",
      tree:    "No old litter — all surplus plant material removed immediately after each visit",
      hedges:  "No old litter — all surplus plant material and debris removed after each visit",
    },
  },
  {
    label: "Weeds — Total % Cover",
    values: {
      annuals: wf, roses: wf, ornamental: "2%",
      amenity: "5%", rain: "5%", reveg: "5%",
      bush: "15%", tree: "5%", hedges: "5%",
    },
  },
  {
    label: "Weeds — Max per 1m²",
    values: {
      annuals: wf, roses: wf, ornamental: "10%",
      amenity: "10%", rain: "10%", reveg: "30%",
      bush: "30%", tree: "10%", hedges: "10%",
    },
  },
  {
    label: "Weeds — Max Height × Width",
    values: {
      annuals: na, roses: wf,
      ornamental: "100mm × 100mm",
      amenity: "150mm × 100mm",
      rain: "150mm × 100mm",
      reveg: "500mm (must not restrict natives)",
      bush: "150mm × 100mm (visible edge only)",
      tree: "100mm × 100mm",
      hedges: "150mm × 100mm",
    },
  },
  {
    label: "Plant Pests (Noxious)",
    values: {
      annuals: na, roses: na, ornamental: na,
      amenity: na, rain: na, reveg: na,
      bush: na, tree: na, hedges: na,
    },
  },
  {
    label: "Mulch Depth",
    values: {
      annuals: "n/a",
      roses:   "50–100mm",
      ornamental: "50–100mm",
      amenity: "50–100mm",
      rain:    "None",
      reveg:   "Mulched once at inception",
      bush:    "None",
      tree:    "50–100mm if already present",
      hedges:  "None",
    },
  },
  {
    label: "Mulch Type",
    values: {
      annuals: "n/a",
      roses:   "Fine bark, aged tree chip or compost",
      ornamental: "Alpine/Rock: crushed rock · Woodland: bark or aged tree chip · Herbaceous: aged tree chip or fine bark",
      amenity: "Bark or aged tree chip",
      rain:    "n/a",
      reveg:   "n/a",
      bush:    "Bark or aged tree chip",
      tree:    "Bark mulch, gravel or lime chip",
      hedges:  "n/a",
    },
  },
  {
    label: "Mulch Placement",
    values: {
      annuals: "n/a",
      roses:   "Clear of trunks/stems/crowns · evenly spread · not spilling over garden edges",
      ornamental: "Clear of trunks/stems/crowns · not spilling over garden edges",
      amenity: "Clear of trunks/stems/crowns · not spilling over garden edges",
      rain:    "n/a",
      reveg:   "n/a",
      bush:    "Clear of trunks/stems/crowns · not spilling over garden edges",
      tree:    "Clear of trunks/stems/crowns · not spilling over garden edges",
      hedges:  "n/a",
    },
  },
  {
    label: "Pruning — Outcome",
    values: {
      annuals: "n/a",
      roses:   "Build strong framework · maintain shape · maximise flowering · remove danger/nuisance",
      ornamental: "Build strong framework · maintain shape · maximise flowering · remove danger/nuisance",
      amenity: "Build strong framework · maintain shape · maximise flowering",
      rain:    "Build strong framework · maintain shape · repair wind/vandalism damage",
      reveg:   "Repair minor damage from wind or vandalism · remove danger/nuisance",
      bush:    "Clearance trimming only",
      tree:    "Build strong framework · maintain shape · maximise flowering",
      hedges:  "Maintain shape and balance · remove danger/nuisance",
    },
  },
  {
    label: "Pruning — Key Metrics",
    values: {
      annuals: "See methodology for specific rose types",
      roses:   "Vertical clearance max 2.5m · horizontal max 100mm · street gardens max 1m high",
      ornamental: "Vertical clearance max 2.5m · horizontal max 100mm · street gardens max 1m high",
      amenity: "Vertical clearance max 2.5m · horizontal max 100mm · road clearance 2.5m vertical/100mm horizontal",
      rain:    "Vertical clearance max 2.5m · horizontal max 100mm",
      reveg:   "Remove deadwood only if prominent, risk to health, or hazardous",
      bush:    "n/a",
      tree:    "Vertical clearance max 2.5m · horizontal max 100mm",
      hedges:  "Max 100mm growth (griselinia/mixed/escallonia) · max 50mm (korokia) · max 30mm (buxus) · max 2m tall",
    },
  },
  {
    label: "Dead Heading",
    values: {
      annuals: "2% deadheads allowed",
      roses:   "Summer dead heading to industry best practice",
      ornamental: "20% deadheads allowed (10% in Japanese garden)",
      amenity: "30% deadheads allowed",
      rain:    "30% deadheads allowed",
      reveg:   "n/a",
      bush:    "Not required",
      tree:    "30% deadheads allowed",
      hedges:  "Not required",
    },
  },
  {
    label: "Pests & Diseases",
    values: {
      annuals: "Develop monitoring strategies · preventative and responsive control programmes",
      roses:   "No adverse impact on plant health · minimise impact on beneficial insects",
      ornamental: "Maintained to healthy standard · report presence at each visit",
      amenity: "Maintained to healthy standard · report presence at each visit",
      rain:    "Maintained to healthy standard · report presence at each visit",
      reveg:   "Maintained to healthy standard · report presence at each visit",
      bush:    "n/a",
      tree:    "Maintained to healthy standard · report presence at each visit",
      hedges:  "Maintained to healthy standard · report presence at each visit",
    },
  },
  {
    label: "Health & Vigour",
    values: {
      annuals: "Report drainage issues · maintain soil conditions for outstanding seasonal displays",
      roses:   "Fertilise as required",
      ornamental: "Fertilise only where nutrient deficiency or poor growth apparent",
      amenity: "Report struggling plants or weak growth",
      rain:    "Report struggling plants or weak growth",
      reveg:   "Report struggling plants or weak growth",
      bush:    "n/a",
      tree:    "Report struggling plants or weak growth",
      hedges:  "Report struggling plants or weak plant growth",
    },
  },
  {
    label: "Irrigation",
    values: {
      annuals: "Irrigate as required for healthy vigorous growth throughout season",
      roses:   "Irrigate as required · watering at base only",
      ornamental: "Irrigate as required for healthy vigorous growth",
      amenity: "Not required unless extreme dry conditions",
      rain:    "Not required unless extreme dry conditions",
      reveg:   "Not required",
      bush:    "Not required",
      tree:    "Not required",
      hedges:  "Not required unless extreme dry conditions",
    },
  },
  {
    label: "Plant Coverage",
    values: {
      annuals: "100% as appropriate to each design",
      roses:   "90%",
      ornamental: "90%",
      amenity: "90%",
      rain:    "90%",
      reveg:   "Report >10% plant loss in first 5 years of establishment",
      bush:    "90%",
      tree:    "90%",
      hedges:  "100%",
    },
  },
  {
    label: "Edging",
    values: {
      annuals: "Permanent edging — chamfer 50–75mm deep · max 45° slope",
      roses:   "Hard edging — chamfer 75–100mm deep · max 45° slope",
      ornamental: "Hard edging — chamfer 75–100mm deep · max 45° slope",
      amenity: "Hard edging — chamfer 75–100mm deep · max 45° slope",
      rain:    "Hard edging — chamfer 75–100mm deep",
      reveg:   "Chemical spray line edge at original extent (no creep)",
      bush:    "Existing dug edge maintained per General Shrub Gardens spec",
      tree:    "Hard edging — chamfer 75–100mm deep",
      hedges:  "Hard edging — chamfer 75–100mm deep · max 45° slope",
    },
  },
];

// ─── Badge component ──────────────────────────────────────────────────────────

function Badge({ cell }: { cell: Cell }) {
  if (typeof cell === "string") {
    return <span className="text-gray-700 text-xs leading-snug">{cell}</span>;
  }
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    high:      { bg: "#dcfce7", color: "#16a34a", border: "#bbf7d0" },
    medium:    { bg: "#e0f2fe", color: "#0369a1", border: "#bae6fd" },
    low:       { bg: "#fef9c3", color: "#a16207", border: "#fef08a" },
    "weed-free": { bg: "#fee2e2", color: "#dc2626", border: "#fecaca" },
    none:      { bg: "#fee2e2", color: "#dc2626", border: "#fecaca" },
  };
  const s = styles[cell.badge] ?? styles.medium;
  return (
    <span
      className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {cell.text}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SpecificationPage() {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f5f7f9]">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b px-8 py-5 flex items-start justify-between sticky top-0 z-20">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Specification Display</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            PCC Horticultural Maintenance Specifications — March 2026
          </p>
        </div>
        <div className="flex gap-2 mt-1">
          <a
            href={PDF_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            View PDF
          </a>
          <a
            href={PDF_URL}
            download="PCC-Hort-Maintenance-Spec-March-2026.pdf"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: BRAND }}
          >
            <Download className="w-4 h-4" />
            Download PDF
          </a>
        </div>
      </header>

      <div className="flex-1 overflow-auto px-8 py-6 space-y-6">

        {/* ── Document card ──────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between rounded-xl px-6 py-4"
          style={{ backgroundColor: "#e0f9ff", border: `1px solid #b3f0fb` }}
        >
          <div className="flex items-center gap-4">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: BRAND }}
            >
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">PCC Hort Maintenance Specifications</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Porirua City Council · Issued 21 March 2026 · 9 garden types
              </p>
            </div>
          </div>
          <a
            href={PDF_URL}
            download="PCC-Hort-Maintenance-Spec-March-2026.pdf"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
            style={{ backgroundColor: BRAND }}
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </a>
        </div>

        {/* ── Stats cards ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
              Garden Types
            </p>
            <p className="text-4xl font-bold mb-2" style={{ color: NAVY }}>9</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              Annuals · Roses &amp; Perennials · Ornamental · Amenity · Rain Garden · Reveg · Bush · Tree Planters/Pits · Hedges
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
              Quality Grades
            </p>
            <p className="text-4xl font-bold mb-2" style={{ color: NAVY }}>3</p>
            <div className="flex gap-2 flex-wrap">
              {[
                { label: "High",   bg: "#dcfce7", color: "#16a34a", border: "#bbf7d0" },
                { label: "Medium", bg: "#e0f2fe", color: "#0369a1", border: "#bae6fd" },
                { label: "Low",    bg: "#fef9c3", color: "#a16207", border: "#fef08a" },
              ].map(({ label, bg, color, border }) => (
                <span
                  key={label}
                  className="px-2.5 py-0.5 rounded-full text-xs font-semibold"
                  style={{ background: bg, color, border: `1px solid ${border}` }}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
              Maintenance Frequencies
            </p>
            <p className="text-4xl font-bold mb-2" style={{ color: NAVY }}>6</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              Weekly · Fortnightly · Monthly · Quarterly · Bimonthly · Seasonal
            </p>
          </div>
        </div>

        {/* ── Full specification matrix ───────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Full Specification Matrix</h2>
            <p className="text-xs text-gray-400 mt-0.5">Scroll horizontally to view all garden types</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse" style={{ minWidth: 1100 }}>
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {/* Sticky attribute column */}
                  <th
                    className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-500 border-r border-gray-200 bg-gray-50"
                    style={{ minWidth: 180, position: "sticky", left: 0, zIndex: 10 }}
                  >
                    Attribute
                  </th>
                  {COLUMNS.map((col) => (
                    <th
                      key={col.id}
                      className="px-4 py-3 text-center border-r border-gray-100 last:border-r-0"
                      style={{ minWidth: 130 }}
                    >
                      <span className="block text-[10px] font-medium text-gray-400 mb-0.5">
                        {col.type}
                      </span>
                      <span className="block text-xs font-bold text-gray-700 whitespace-pre-line leading-tight">
                        {col.label}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row, ri) => (
                  <tr
                    key={ri}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    {/* Sticky first column */}
                    <td
                      className="px-5 py-3 border-r border-gray-200 bg-white"
                      style={{ position: "sticky", left: 0, zIndex: 9 }}
                    >
                      <span className="text-xs font-semibold text-gray-800">{row.label}</span>
                      {row.sub && (
                        <span className="block text-[10px] text-gray-400 mt-0.5">{row.sub}</span>
                      )}
                    </td>
                    {COLUMNS.map((col) => (
                      <td
                        key={col.id}
                        className="px-4 py-3 text-center align-middle border-r border-gray-100 last:border-r-0"
                      >
                        <Badge cell={row.values[col.id]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
