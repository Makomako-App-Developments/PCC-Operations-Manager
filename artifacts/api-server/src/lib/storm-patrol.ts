/** Rounds once at report-total level; never sum individually rounded checks. */
export function calculateStormChargeCents(totalActualMinutes: number, hourlyRateCents: number): number {
  return Math.round(totalActualMinutes * hourlyRateCents / 60);
}

export function arePublishableStormwaterAssets(
  assets: Array<{ department: string; isActive: boolean }>,
  expectedCount: number,
): boolean {
  return assets.length === expectedCount
    && assets.every(asset => asset.isActive && asset.department.toLowerCase() === "stormwater");
}

export function escapeCsvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

export function requiresStormVisualCheckComments(
  workTypes: readonly string[],
  comments: string | undefined,
): boolean {
  return workTypes.includes("visual_check_only") && !comments?.trim();
}