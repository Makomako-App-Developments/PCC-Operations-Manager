export type GeoPolygon = { type: "Polygon"; coordinates: number[][][] };

export function isRenderableBoundary(boundary: GeoPolygon | null | undefined): boolean {
  return (
    boundary?.type === "Polygon" &&
    Array.isArray(boundary.coordinates?.[0]) &&
    boundary.coordinates[0].length >= 3 &&
    boundary.coordinates[0].every(
      (point) =>
        Array.isArray(point) &&
        point.length >= 2 &&
        Number.isFinite(Number(point[0])) &&
        Number.isFinite(Number(point[1])),
    )
  );
}