export const DEPARTMENTS = [
  { value: "garden", label: "Garden" },
  { value: "mowing", label: "Mowing" },
  { value: "stormwater", label: "Stormwater" },
  { value: "sportsfields", label: "Sportsfields" },
  { value: "city_cleaning", label: "City Cleaning" },
] as const;

export type DepartmentValue = (typeof DEPARTMENTS)[number]["value"];

export type DepartmentDetailValue = string | number;

export type DepartmentRule = {
  specificationLabel: string;
  specificationKey: string;
  specificationOptions: readonly { value: string; label: string }[];
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
  stormwaterType: [
    { value: "swale", label: "Swale" },
    { value: "detention_basin", label: "Detention basin" },
    { value: "wetland", label: "Wetland" },
    { value: "rain_garden", label: "Rain garden" },
    { value: "catchpit", label: "Catchpit" },
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

export const DEPARTMENT_RULES: Record<DepartmentValue, DepartmentRule> = {
  garden: {
    specificationLabel: "Garden Type",
    specificationKey: "gardenType",
    specificationOptions: OPTIONS.gardenType,
    areaLabel: "Area (m²)",
    areaRequired: true,
    serviceTimeLabel: "Service Time (mins)",
    frequencyLabel: "Frequency",
  },
  mowing: {
    specificationLabel: "Mowing Type",
    specificationKey: "mowingType",
    specificationOptions: OPTIONS.mowingType,
    areaLabel: "Mowing Area (m²)",
    areaRequired: true,
    serviceTimeLabel: "Mowing Time (mins)",
    frequencyLabel: "Mowing Frequency",
  },
  stormwater: {
    specificationLabel: "Stormwater Facility",
    specificationKey: "stormwaterType",
    specificationOptions: OPTIONS.stormwaterType,
    areaLabel: "Catchment / Footprint (m²)",
    areaRequired: false,
    serviceTimeLabel: "Inspection Time (mins)",
    frequencyLabel: "Inspection Frequency",
  },
  sportsfields: {
    specificationLabel: "Playing Surface",
    specificationKey: "surfaceType",
    specificationOptions: OPTIONS.surfaceType,
    areaLabel: "Playing Area (m²)",
    areaRequired: true,
    serviceTimeLabel: "Maintenance Time (mins)",
    frequencyLabel: "Maintenance Frequency",
  },
  city_cleaning: {
    specificationLabel: "Cleaning Service",
    specificationKey: "cleaningType",
    specificationOptions: OPTIONS.cleaningType,
    areaLabel: "Service Area (m²)",
    areaRequired: false,
    serviceTimeLabel: "Service Time (mins)",
    frequencyLabel: "Cleaning Frequency",
  },
};

export function departmentRule(value?: string | null): DepartmentRule {
  return DEPARTMENT_RULES[(value as DepartmentValue) ?? "garden"] ?? DEPARTMENT_RULES.garden;
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
    "Garden"
  );
}