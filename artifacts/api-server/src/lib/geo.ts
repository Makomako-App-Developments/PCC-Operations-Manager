/**
 * Geographic utilities: Haversine distance + nearest-neighbour route optimisation.
 */

/** Earth radius in km */
const R = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Haversine great-circle distance in kilometres */
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface GeoPoint {
  id:  string;
  lat: number;
  lng: number;
}

/**
 * Nearest-neighbour TSP approximation.
 * Starts from the northernmost point (highest lat) for a deterministic result.
 * Returns asset IDs in visit order.
 */
export function nearestNeighbourRoute(points: GeoPoint[]): string[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [points[0].id];

  // Start from northernmost point
  let startIdx = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].lat > points[startIdx].lat) startIdx = i;
  }

  const unvisited = [...points];
  const route: string[] = [];
  let current = unvisited.splice(startIdx, 1)[0];
  route.push(current.id);

  while (unvisited.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < unvisited.length; i++) {
      const d = haversineKm(current.lat, current.lng, unvisited[i].lat, unvisited[i].lng);
      if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
    }
    current = unvisited.splice(nearestIdx, 1)[0];
    route.push(current.id);
  }

  return route;
}
