export interface KpiDef {
  key: string;
  label: string;
  description: string;
  allowNA: boolean;
}

export interface KpiSection {
  title: string;
  kpis: KpiDef[];
}

export const KPI_SECTIONS: KpiSection[] = [
  {
    title: "Garden Condition",
    kpis: [
      {
        key: "litter",
        label: "Litter",
        description:
          "No old litter, including dead plants. All surplus plant material and debris must be removed from the sites immediately after each maintenance visit.",
        allowNA: false,
      },
      {
        key: "weeds",
        label: "Weeds",
        description:
          "Weed height and coverage are less than specification for that garden type. No rogue plants.",
        allowNA: false,
      },
      {
        key: "plant_pests",
        label: "Plant Pests",
        description: "None allowed.",
        allowNA: false,
      },
      {
        key: "mulch",
        label: "Mulch",
        description:
          "50–100mm in ornamental, amenity and tree pits. No mulch required on sites where the slope is over 30 degrees, where flooding occurs, where the intended vegetation has totally covered the site and bare ground cannot be seen from outside the bed.",
        allowNA: true,
      },
      {
        key: "pruning",
        label: "Pruning",
        description:
          "No dead, weak, diseased or damaged vegetation. Intended shape is retained. Definition between neighbouring plants retained. Health, vigour & flowering potential are maximised. All pruning to industry best practices; footpaths, roads and fixed assets including buildings are clear of vegetation up to 2.5m high (street gardens max height is 1m).",
        allowNA: true,
      },
      {
        key: "dead_heading",
        label: "Dead Heading",
        description:
          "Dead heading completed to specification (not required in revege, bush or hedges).",
        allowNA: true,
      },
      {
        key: "pests_diseases",
        label: "Pests & Diseases",
        description:
          "Pest & diseases have no impact on plant health or appearance.",
        allowNA: false,
      },
    ],
  },
  {
    title: "Edges & Borders",
    kpis: [
      {
        key: "edging",
        label: "Edging",
        description:
          "Hard edging: maintain a clear chamfer between 75–100mm deep, shaped to rise from the bottom of that edge (max 45°). Soft edging: form and maintain a sloping edge (approx 15–25° from vertical), consistent with the boundary and shape of the garden. Edge kept to 75–100mm deep.",
        allowNA: true,
      },
    ],
  },
  {
    title: "Plant Support & Protection",
    kpis: [
      {
        key: "stakes_ties",
        label: "Stakes & Ties",
        description:
          "Provides stability, protected from the wind, growth trained to required form, removed when not necessary.",
        allowNA: true,
      },
      {
        key: "damage",
        label: "Damage",
        description:
          "No damage to plants, surrounding lawns or other assets from horticulture operations.",
        allowNA: true,
      },
    ],
  },
];

export const ALL_KPIS: KpiDef[] = KPI_SECTIONS.flatMap((s) => s.kpis);

export type KpiResult = "pass" | "fail" | "na" | null;

export interface ResponseState {
  result: KpiResult;
  notes: string;
  failLat: number | null;
  failLng: number | null;
  photos: File[];
  existingPhotos: { id: string; blobUrl: string }[];
  depthMm: string;
}

export function emptyResponse(): ResponseState {
  return { result: null, notes: "", failLat: null, failLng: null, photos: [], existingPhotos: [], depthMm: "" };
}

export function calcAuditScore(responses: Record<string, ResponseState>): number | null {
  const scored = ALL_KPIS.filter(
    (k) => responses[k.key]?.result === "pass" || responses[k.key]?.result === "fail",
  );
  if (!scored.length) return null;
  const passes = scored.filter((k) => responses[k.key]?.result === "pass").length;
  return Math.round((passes / scored.length) * 100);
}
