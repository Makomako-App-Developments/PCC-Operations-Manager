import { useState } from "react";
import { useGetDashboardSummary, useListAssets, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format, startOfWeek } from "date-fns";
import {
  Leaf, AlertCircle, Users, TrendingUp, Clock, CheckCircle, Sprout, MapPin
} from "lucide-react";
import { MapContainer, TileLayer, CircleMarker, Polygon, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

type GeoPolygon = { type: "Polygon"; coordinates: number[][][] };

const BRAND = "#00AECD";

const TYPE_COLORS: Record<string, string> = {
  "roses_perennials": "#ec4899",
  "annuals":            "#f59e0b",
  "ornamental":         "#8b5cf6",
  "amenity":            "#00AECD",
  "rain_garden":        "#06b6d4",
  "reveg":              "#84cc16",
  "bush":               "#16a34a",
  "tree_planter_pits":  "#78716c",
  "hedge":              "#6b7280",
};

function MetricCard({ icon: Icon, label, value, sub, color, testId }: any) {
  return (
    <Card className="rounded-2xl border-0 shadow-sm" data-testid={testId}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
          </div>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: color + "15" }}>
            <Icon className="w-5 h-5" style={{ color }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AssetMapFeature({ asset }: { asset: any }) {
  const color = TYPE_COLORS[asset.gardenType] || BRAND;
  const boundary = asset.boundary as GeoPolygon | null;
  const tip = (
    <Tooltip permanent={false} direction="top">
      <div className="min-w-[160px]">
        <p className="font-bold text-xs mb-0.5">{asset.name}</p>
        <p className="text-[10px] text-gray-500 font-mono mb-1">{asset.reference}</p>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 font-medium">
          {asset.gardenType.replace(/_/g, " ")}
        </span>
      </div>
    </Tooltip>
  );

  if (boundary?.coordinates?.[0]?.length) {
    const positions: [number, number][] = boundary.coordinates[0].map(
      ([lng, lat]) => [lat, lng]
    );
    return (
      <Polygon
        key={asset.id}
        positions={positions}
        pathOptions={{ color, fillColor: color, fillOpacity: 0.25, weight: 2 }}
      >
        {tip}
      </Polygon>
    );
  }

  if (!asset.lat || !asset.lng) return null;
  return (
    <CircleMarker
      key={asset.id}
      center={[Number(asset.lat), Number(asset.lng)]}
      radius={6}
      pathOptions={{ fillColor: color, fillOpacity: 0.9, color: "#fff", weight: 2 }}
    >
      {tip}
    </CircleMarker>
  );
}

function MapView() {
  const { data } = useListAssets({ limit: 2000 });

  if (!data) return <Skeleton className="w-full rounded-2xl" style={{ height: 360 }} />;

  return (
    <div className="relative w-full rounded-2xl overflow-hidden" data-testid="dashboard-map" style={{ height: 360 }}>
      <MapContainer
        center={[-41.13, 174.85]}
        zoom={13}
        style={{ height: 360, width: "100%" }}
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap'
        />
        {data.data.map(asset => (
          <AssetMapFeature key={asset.id} asset={asset} />
        ))}
      </MapContainer>
    </div>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() }
  });

  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "d MMM yyyy");

  if (isLoading || !summary) {
    return (
      <div className="p-8 space-y-5">
        <Skeleton className="w-full h-24" />
        <Skeleton className="w-full h-64" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f5f7f9]">
      <header className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-10 flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>
          <p className="text-xs text-gray-400">Porirua City — Garden Asset Overview · Week of {weekStart}</p>
        </div>
        <div className="flex gap-2">
          {summary.overdueJobs > 0 && (
            <Badge className="bg-red-100 text-red-700 border-0 text-xs px-3">
              {summary.overdueJobs} Overdue Jobs
            </Badge>
          )}
          <Badge className="bg-[#00AECD] text-white border-0 text-xs px-3">
            {summary.activeAssets} Active Assets
          </Badge>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-8 space-y-5">
        {/* Metric cards */}
        <div className="grid grid-cols-4 gap-4">
          <MetricCard 
            icon={Leaf} 
            label="Total Garden Assets" 
            value={summary.totalAssets} 
            sub={`${summary.activeAssets} active`} 
            color={BRAND} 
            testId="metric-total-assets"
          />
          <MetricCard 
            icon={Clock} 
            label="Jobs This Week" 
            value={summary.jobsThisWeek} 
            sub={`${summary.completedThisWeek} completed`} 
            color="#8b5cf6" 
            testId="metric-jobs"
          />
          <MetricCard 
            icon={AlertCircle} 
            label="Open Reactive Jobs" 
            value={summary.openReactiveJobs} 
            sub="Requires attention" 
            color="#f59e0b" 
            testId="metric-reactive"
          />
          <MetricCard 
            icon={CheckCircle} 
            label="Completion Rate" 
            value={summary.jobsThisWeek > 0 ? `${Math.round((summary.completedThisWeek / summary.jobsThisWeek) * 100)}%` : "0%"} 
            sub="For current week" 
            color="#10b981" 
            testId="metric-completion"
          />
        </div>

        <div className="grid grid-cols-3 gap-5">
          <div className="col-span-2">
            <Card className="rounded-2xl border-0 shadow-sm overflow-hidden">
              <MapView />
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="rounded-2xl border-0 shadow-sm flex-1">
              <CardContent className="p-4">
                <p className="text-xs font-semibold text-gray-700 mb-3">Gardens by Type</p>
                <div className="space-y-3">
                  {summary.assetsByType.map(({ gardenType, count }) => {
                    const pct = summary.activeAssets > 0 ? (count / summary.activeAssets) * 100 : 0;
                    return (
                      <div key={gardenType}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-600 capitalize">{gardenType.replace("_", " ")}</span>
                          <span className="text-gray-900 font-medium">{count}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div 
                            className="h-1.5 rounded-full" 
                            style={{ width: `${pct}%`, background: TYPE_COLORS[gardenType] || BRAND }} 
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5">
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-[#00AECD]" /> Team Performance (This Week)
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {summary.teamSummary.map((team) => (
                  <div key={team.teamId} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <p className="font-semibold text-sm text-gray-900 mb-2">{team.teamName}</p>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Progress</span>
                      <span>{team.completedCount} / {team.jobCount}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                      <div 
                        className="h-2 rounded-full bg-[#00AECD]" 
                        style={{ width: team.jobCount > 0 ? `${(team.completedCount / team.jobCount) * 100}%` : '0%' }} 
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
