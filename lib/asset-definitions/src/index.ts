export const DEPARTMENTS = [
  { value: "garden", label: "Garden" },
  { value: "mowing", label: "Mowing" },
  { value: "stormwater", label: "Stormwater" },
  { value: "sportsfields", label: "Sportsfields" },
  { value: "city_cleaning", label: "City Cleaning" },
] as const;

export type DepartmentValue = (typeof DEPARTMENTS)[number]["value"];

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