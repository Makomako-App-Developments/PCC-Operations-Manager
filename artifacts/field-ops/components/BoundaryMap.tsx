import React from "react";
import { View, StyleSheet, Platform } from "react-native";
import { WebView } from "react-native-webview";

type GeoPolygon = { type: "Polygon"; coordinates: number[][][] };

interface Props {
  boundary: GeoPolygon | null | undefined;
  lat?: number | string | null;
  lng?: number | string | null;
  color?: string;
  height?: number;
}

function buildHtml(
  boundary: GeoPolygon | null | undefined,
  lat: number,
  lng: number,
  color: string
): string {
  const hasPolygon = boundary?.coordinates?.[0]?.length;
  // GeoJSON [lng,lat] → Leaflet [lat,lng]
  const leafletCoords = hasPolygon
    ? JSON.stringify(
        boundary!.coordinates[0].map(([lo, la]: number[]) => [la, lo])
      )
    : "[]";

  const center = hasPolygon
    ? (() => {
        const pts = boundary!.coordinates[0];
        const clat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
        const clng = pts.reduce((s, p) => s + p[0], 0) / pts.length;
        return `[${clat}, ${clng}]`;
      })()
    : `[${lat}, ${lng}]`;

  const zoom = hasPolygon ? 17 : 18;

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body,#map { width:100%; height:100%; }
</style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map', { zoomControl: false, attributionControl: false })
    .setView(${center}, ${zoom});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

  var coords = ${leafletCoords};
  if (coords.length > 0) {
    var poly = L.polygon(coords, {
      color: '${color}',
      fillColor: '${color}',
      fillOpacity: 0.25,
      weight: 3
    }).addTo(map);
    map.fitBounds(poly.getBounds(), { padding: [20, 20] });
  } else {
    L.circleMarker([${lat}, ${lng}], {
      radius: 10,
      color: '#fff',
      weight: 2,
      fillColor: '${color}',
      fillOpacity: 1
    }).addTo(map);
  }
</script>
</body>
</html>`;
}

export function BoundaryMap({ boundary, lat, lng, color = "#00AECD", height = 200 }: Props) {
  const clat = lat != null ? Number(lat) : -41.13;
  const clng = lng != null ? Number(lng) : 174.85;

  if (!boundary && !lat && !lng) return null;

  const html = buildHtml(boundary, clat, clng, color);

  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, { height }]}>
        <iframe
          srcDoc={html}
          style={{ width: "100%", height: "100%", border: "none" }}
          sandbox="allow-scripts"
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        source={{ html }}
        style={{ flex: 1 }}
        scrollEnabled={false}
        javaScriptEnabled
        originWhitelist={["*"]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    overflow: "hidden",
    borderRadius: 12,
  },
});
