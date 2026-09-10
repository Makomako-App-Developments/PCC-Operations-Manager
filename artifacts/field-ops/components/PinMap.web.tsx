import React from "react";
import { View } from "react-native";

interface Props {
  lat: number;
  lng: number;
  height?: number;
  mapType?: "map" | "aerial";
}

function buildHtml(lat: number, lng: number, mapType: "map" | "aerial"): string {
  const tileUrl = mapType === "aerial"
    ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
    : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{margin:0;padding:0;height:100%;width:100%;}</style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map', { zoomControl: true, attributionControl: false })
    .setView([${lat}, ${lng}], 17);
  L.tileLayer(
    '${tileUrl}',
    { maxZoom: 19 }
  ).addTo(map);
  L.marker([${lat}, ${lng}]).addTo(map);
</script>
</body>
</html>`;
}

export function PinMap({ lat, lng, height = 220, mapType = "aerial" }: Props) {
  return (
    <View style={{ height, width: "100%" }}>
      <iframe
        srcDoc={buildHtml(lat, lng, mapType)}
        style={{ height: "100%", width: "100%", border: "none" } as any}
        sandbox="allow-scripts"
      />
    </View>
  );
}
