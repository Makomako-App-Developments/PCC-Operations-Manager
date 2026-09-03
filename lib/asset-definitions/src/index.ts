export const DEPARTMENTS = [
  { value: "horticulture", label: "Horticulture" },
  { value: "mowing", label: "Mowing" },
  { value: "litter", label: "Litter" },
  { value: "sportsfields", label: "Sportsfields" },
  { value: "cemetery", label: "Cemetery" },
  { value: "city_services_maintenance", label: "City Services Maintenance" },
  { value: "tracks_coastal_rangers", label: "Tracks & Coastal Rangers" },
  { value: "biosecurity_rangers", label: "Biosecurity Rangers" },
] as const;

export type DepartmentValue = (typeof DEPARTMENTS)[number]["value"];

export type DepartmentDetailValue = string | number;

export type DepartmentRule = {
  specificationLabel: string;
  specificationKey: string;
  specificationOptions: readonly { value: string; label: string }[];
  specificationRequired: boolean;
  areaLabel: string;
  areaRequired: boolean;
  serviceTimeLabel: string;
  frequencyLabel: string;
};

const OPTIONS = {
  gardenType: [
    { value: "amenity", label: "Amenity" },
    { value: "annuals", label: "Annuals" },
    { value: "bush", label: "Bush" },
    { value: "hedge", label: "Hedge" },
    { value: "ornamental", label: "Ornamental" },
    { value: "rain_garden", label: "Rain Garden" },
    { value: "reveg", label: "Revegetation" },
    { value: "roses_perennials", label: "Roses & Perennials" },
    { value: "tree_planter_pits", label: "Tree Planter Pits" },
  ],
  mowingType: [
    { value: "amenity_turf", label: "Amenity turf" },
    { value: "sports_turf", label: "Sports turf" },
    { value: "roadside_verge", label: "Roadside verge" },
    { value: "rough_grass", label: "Rough grass" },
  ],
  surfaceType: [
    { value: "natural_turf", label: "Natural turf" },
    { value: "artificial_turf", label: "Artificial turf" },
    { value: "hard_court", label: "Hard court" },
  ],
  cleaningType: [
    { value: "litter_bin", label: "Litter bin" },
    { value: "street_sweeping", label: "Street sweeping" },
    { value: "graffiti", label: "Graffiti" },
    { value: "pressure_washing", label: "Pressure washing" },
  ],
} as const;

const genericRule = (departmentName: string): DepartmentRule => ({
  specificationLabel: `${departmentName} Asset Type`,
  specificationKey: "assetType",
  specificationOptions: [],
  specificationRequired: false,
  areaLabel: "Service Area (m²)",
  areaRequired: false,
  serviceTimeLabel: "Service Time (mins)",
  frequencyLabel: "Service Frequency",
});

export const DEPARTMENT_RULES: Record<DepartmentValue, DepartmentRule> = {
  horticulture: {
    specificationLabel: "Garden Type",
    specificationKey: "gardenType",
    specificationOptions: OPTIONS.gardenType,
    specificationRequired: true,
    areaLabel: "Area (m²)",
    areaRequired: true,
    serviceTimeLabel: "Service Time (mins)",
    frequencyLabel: "Frequency",
  },
  mowing: {
    specificationLabel: "Mowing Type",
    specificationKey: "mowingType",
    specificationOptions: OPTIONS.mowingType,
    specificationRequired: true,
    areaLabel: "Mowing Area (m²)",
    areaRequired: true,
    serviceTimeLabel: "Mowing Time (mins)",
    frequencyLabel: "Mowing Frequency",
  },
  sportsfields: {
    specificationLabel: "Playing Surface",
    specificationKey: "surfaceType",
    specificationOptions: OPTIONS.surfaceType,
    specificationRequired: true,
    areaLabel: "Playing Area (m²)",
    areaRequired: true,
    serviceTimeLabel: "Maintenance Time (mins)",
    frequencyLabel: "Maintenance Frequency",
  },
  litter: {
    specificationLabel: "Cleaning Service",
    specificationKey: "cleaningType",
    specificationOptions: OPTIONS.cleaningType,
    specificationRequired: true,
    areaLabel: "Service Area (m²)",
    areaRequired: false,
    serviceTimeLabel: "Service Time (mins)",
    frequencyLabel: "Cleaning Frequency",
  },
  cemetery: genericRule("Cemetery"),
  city_services_maintenance: genericRule("City Services Maintenance"),
  tracks_coastal_rangers: genericRule("Tracks & Coastal Rangers"),
  biosecurity_rangers: genericRule("Biosecurity Rangers"),
};

export function departmentRule(value?: string | null): DepartmentRule {
  return DEPARTMENT_RULES[(value as DepartmentValue) ?? "horticulture"] ?? DEPARTMENT_RULES.horticulture;
}

export function assetSpecification(asset: {
  department?: string | null;
  gardenType?: string | null;
  departmentDetails?: Record<string, DepartmentDetailValue> | object | null;
}): string {
  const rule = departmentRule(asset.department);
  const value =
    rule.specificationKey === "gardenType"
      ? asset.gardenType
      : (asset.departmentDetails as Record<string, DepartmentDetailValue> | undefined)?.[rule.specificationKey];
  return (
    rule.specificationOptions.find((option) => option.value === value)?.label ??
    String(value ?? "—").replace(/_/g, " ")
  );
}

const DEPARTMENT_LABELS: Record<DepartmentValue, string> = Object.fromEntries(
  DEPARTMENTS.map(({ value, label }) => [value, label]),
) as Record<DepartmentValue, string>;

export const DEPARTMENT_VALUES = DEPARTMENTS.map(
  ({ value }) => value,
) as [DepartmentValue, ...DepartmentValue[]];

export function departmentLabel(value?: string | null): string {
  return (
    (value && DEPARTMENT_LABELS[value as DepartmentValue]) ??
    value?.replace(/_/g, " ") ??
    "Horticulture"
  );
}