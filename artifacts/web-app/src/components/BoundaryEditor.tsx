import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Polygon, Polyline, CircleMarker, Tooltip as LeafletTooltip, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type GeoPolygon = { type: "Polygon"; coordinates: number[][][] };

interface Props {
  initialBoundary?: GeoPolygon | null;
  initialLat?: number | string | null;
  initialLng?: number | string | null;
  onChange: (boundary: GeoPolygon | null, lat: number | null, lng: number | null) => void;
  height?: number;
}

const BRAND = "#00AECD";
const PORIRUA: [number, number] = [-41.1340, 174.8530];

function centroid(pts: [number, number][]): [number, number] {
  const lat = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const lng = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return [lat, lng];
}

function geoFromVerts(verts: [number, number][]): GeoPolygon {
  const ring = [...verts, verts[0]].map(([lat, lng]) => [lng, lat]);
  return { type: "Polygon", coordinates: [ring] };
}

function vertsFromGeo(geo: GeoPolygon): [number, number][] {
  const ring = geo.coordinates[0];
  return ring.slice(0, -1).map(([lng, lat]) => [lat, lng]);
}

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 1) {
      map.fitBounds(L.latLngBounds(positions), { padding: [32, 32], maxZoom: 20 });
    }
  }, []);
  return null;
}

function MapClickHandler({
  drawing,
  onAddVertex,
  onSetPoint,
}: {
  drawing: boolean;
  onAddVertex: (latlng: [number, number]) => void;
  onSetPoint: (latlng: [number, number]) => void;
}) {
  useMapEvents({
    click(e) {
      if (drawing) {
        onAddVertex([e.latlng.lat, e.latlng.lng]);
      } else {
        onSetPoint([e.latlng.lat, e.latlng.lng]);
      }
    },
  });
  return null;
}

export default function BoundaryEditor({
  initialBoundary,
  initialLat,
  initialLng,
  onChange,
  height = 320,
}: Props) {
  const [layer, setLayer] = useState<"aerial" | "street">("aerial");
  const [boundary, setBoundary] = useState<GeoPolygon | null>(initialBoundary ?? null);
  const [drawing, setDrawing] = useState(false);
  const [vertices, setVertices] = useState<[number, number][]>([]);
  // Standalone point marker — tracks lat/lng when no polygon (or alongside polygon centroid)
  const [point, setPoint] = useState<[number, number] | null>(
    initialLat != null && initialLng != null
      ? [Number(initialLat), Number(initialLng)]
      : null
  );

  const tiles = {
    aerial: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: "Tiles &copy; Esri",
    },
    street: {
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  };

  const existingVerts = boundary ? vertsFromGeo(boundary) : [];
  const center: [number, number] =
    existingVerts.length > 1
      ? centroid(existingVerts)
      : point
      ? point
      : PORIRUA;

  function handleSetPoint(latlng: [number, number]) {
    setPoint(latlng);
    // Keep existing boundary; update lat/lng to the clicked point
    onChange(boundary, latlng[0], latlng[1]);
  }

  function startDrawing() {
    setDrawing(true);
    setVertices([]);
  }

  function cancelDrawing() {
    setDrawing(false);
    setVertices([]);
  }

  function addVertex(latlng: [number, number]) {
    setVertices(prev => [...prev, latlng]);
  }

  function finishDrawing() {
    if (vertices.length < 3) return;
    const geo = geoFromVerts(vertices);
    const c = centroid(vertices);
    setBoundary(geo);
    setPoint(c);
    onChange(geo, c[0], c[1]);
    setDrawing(false);
    setVertices([]);
  }

  function clearBoundary() {
    setBoundary(null);
    // Keep point (lat/lng) — just remove the polygon shape
    onChange(null, point ? point[0] : null, point ? point[1] : null);
  }

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {!drawing ? (
          <>
            <button
              type="button"
              onClick={startDrawing}
              className="text-xs px-3 py-1.5 rounded-md border font-semibold transition-colors"
              style={{ borderColor: BRAND, color: BRAND, background: "white" }}
            >
              {boundary ? "Redraw boundary" : "Draw boundary"}
            </button>
            {boundary && (
              <button
                type="button"
                onClick={clearBoundary}
                className="text-xs px-3 py-1.5 rounded-md border border-red-300 text-red-600 font-semibold hover:bg-red-50 transition-colors"
              >
                Clear boundary
              </button>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={finishDrawing}
              disabled={vertices.length < 3}
              className="text-xs px-3 py-1.5 rounded-md font-semibold text-white transition-colors disabled:opacity-40"
              style={{ background: BRAND }}
            >
              Finish ({vertices.length} pts{vertices.length < 3 ? ", need 3+" : ""})
            </button>
            <button
              type="button"
              onClick={cancelDrawing}
              className="text-xs px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 font-semibold hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </>
        )}
        {!drawing && (
          <div className="ml-auto flex rounded-md overflow-hidden border border-gray-300 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setLayer("aerial")}
              className="px-2.5 py-1 transition-colors"
              style={layer === "aerial" ? { background: BRAND, color: "#fff" } : { background: "#fff", color: "#374151" }}
            >Aerial</button>
            <button
              type="button"
              onClick={() => setLayer("street")}
              className="px-2.5 py-1 border-l border-gray-300 transition-colors"
              style={layer === "street" ? { background: BRAND, color: "#fff" } : { background: "#fff", color: "#374151" }}
            >Street</button>
          </div>
        )}
      </div>

      {/* Instruction banner */}
      {drawing ? (
        <p className="text-[11px] text-teal-700 bg-teal-50 border border-teal-200 rounded-md px-3 py-2">
          Click the map to add polygon vertices. Add at least 3, then press <strong>Finish</strong>.
        </p>
      ) : (
        <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
          <strong>Click the map</strong> to set the site location marker •{" "}
          Use <strong>Draw boundary</strong> to outline the garden polygon
        </p>
      )}

      {/* Map */}
      <div className="rounded-lg overflow-hidden border border-gray-200" style={{ height }}>
        <MapContainer
          center={center}
          zoom={existingVerts.length > 1 ? 17 : point ? 17 : 14}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
          zoomControl
        >
          <TileLayer
            key={layer}
            url={tiles[layer].url}
            attribution={tiles[layer].attribution}
            maxNativeZoom={19}
            maxZoom={21}
          />
          {existingVerts.length > 1 && <FitBounds positions={existingVerts} />}

          <MapClickHandler
            drawing={drawing}
            onAddVertex={addVertex}
            onSetPoint={handleSetPoint}
          />

          {/* Existing / committed polygon */}
          {!drawing && boundary && existingVerts.length > 2 && (
            <Polygon
              positions={existingVerts}
              pathOptions={{ color: BRAND, fillColor: BRAND, fillOpacity: 0.2, weight: 2.5 }}
            />
          )}

          {/* Standalone point marker (shown when no polygon, or as centroid indicator) */}
          {!drawing && point && (
            <CircleMarker
              center={point}
              radius={9}
              pathOptions={{ color: "#fff", weight: 2.5, fillColor: BRAND, fillOpacity: 1 }}
            >
              <LeafletTooltip direction="top" offset={[0, -14]} permanent={!boundary}>
                <span className="text-[10px] font-semibold">
                  {point[0].toFixed(5)}, {point[1].toFixed(5)}
                </span>
              </LeafletTooltip>
            </CircleMarker>
          )}

          {/* In-progress polygon outline */}
          {drawing && vertices.length >= 2 && (
            <Polyline
              positions={vertices}
              pathOptions={{ color: BRAND, weight: 2.5, dashArray: "6 4" }}
            />
          )}

          {/* Vertex dots while drawing */}
          {drawing &&
            vertices.map((v, i) => (
              <CircleMarker
                key={i}
                center={v}
                radius={i === 0 ? 7 : 5}
                pathOptions={{
                  color: "#fff",
                  weight: 2,
                  fillColor: i === 0 ? "#16a34a" : BRAND,
                  fillOpacity: 1,
                }}
              />
            ))}
        </MapContainer>
      </div>

      {/* Status */}
      <div className="flex gap-4 text-[11px] text-gray-400">
        {boundary && !drawing && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: BRAND, opacity: 0.6 }} />
            Boundary: {existingVerts.length} vertices
          </span>
        )}
        {point && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: BRAND }} />
            Location: {point[0].toFixed(5)}, {point[1].toFixed(5)}
          </span>
        )}
        {!boundary && !point && (
          <span>No location set — click the map to place a marker</span>
        )}
      </div>
    </div>
  );
}
