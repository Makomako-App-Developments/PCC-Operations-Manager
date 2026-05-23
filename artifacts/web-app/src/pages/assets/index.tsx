import { useState, useEffect } from "react";
import { useListAssets, getListAssetsQueryKey, useListTeams, getListTeamsQueryKey, useUpdateAsset, getGetAssetQueryKey, useGetAsset, useDeleteAsset } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, MapPin, Map as MapIcon, CheckCircle2, AlertTriangle, Filter, List as ListIcon, X } from "lucide-react";
import { Link } from "wouter";
import { MapContainer, TileLayer, CircleMarker, Polygon, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";

type GeoPolygon = { type: "Polygon"; coordinates: number[][][] };

const MAP_COLORS: Record<string, string> = {
  "roses_perennials": "#ec4899",
  "annuals":          "#f59e0b",
  "ornamental":       "#8b5cf6",
  "amenity":          "#00AECD",
  "rain_garden":      "#06b6d4",
  "reveg":            "#84cc16",
  "bush":             "#16a34a",
  "tree_planter_pits":"#78716c",
  "hedge":            "#10b981",
};
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const BRAND = "#00AECD";

const TILES = {
  street: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  aerial: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, GeoEye, Earthstar Geographics",
  },
};

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 1) {
      map.fitBounds(L.latLngBounds(positions), { padding: [24, 24], maxZoom: 20 });
    }
  }, [map]);
  return null;
}

function DrawerMap({ asset }: { asset: any }) {
  const [layer, setLayer] = useState<"street" | "aerial">("aerial");
  const boundary = asset.boundary as GeoPolygon | null;
  const hasPolygon = !!(boundary?.coordinates?.[0]?.length);
  const positions: [number, number][] = hasPolygon
    ? boundary!.coordinates[0].map(([lng, lat]: number[]) => [lat, lng])
    : [];
  const center: [number, number] = hasPolygon
    ? [
        positions.reduce((s, p) => s + p[0], 0) / positions.length,
        positions.reduce((s, p) => s + p[1], 0) / positions.length,
      ]
    : [Number(asset.lat), Number(asset.lng)];

  return (
    <div className="h-64 flex-shrink-0 relative border-b border-gray-200">
      <MapContainer
        center={center}
        zoom={17}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom
        zoomControl
      >
        <TileLayer
          key={layer}
          url={TILES[layer].url}
          attribution={TILES[layer].attribution}
          maxNativeZoom={layer === "aerial" ? 19 : 19}
          maxZoom={21}
        />
        {hasPolygon ? (
          <>
            <FitBounds positions={positions} />
            <Polygon
              positions={positions}
              pathOptions={{ color: "#00AECD", fillColor: "#00AECD", fillOpacity: 0.2, weight: 3 }}
            />
          </>
        ) : (
          <CircleMarker
            center={center}
            radius={10}
            pathOptions={{ color: "#fff", weight: 2, fillColor: BRAND, fillOpacity: 1 }}
          />
        )}
      </MapContainer>

      {/* Layer toggle */}
      <div className="absolute top-2 right-2 z-[1000] flex rounded-md overflow-hidden shadow-md border border-gray-300 text-[11px] font-semibold">
        <button
          onClick={() => setLayer("aerial")}
          className={`px-2.5 py-1 transition-colors ${layer === "aerial" ? "bg-[#00AECD] text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
        >
          Aerial
        </button>
        <button
          onClick={() => setLayer("street")}
          className={`px-2.5 py-1 transition-colors border-l border-gray-300 ${layer === "street" ? "bg-[#00AECD] text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
        >
          Street
        </button>
      </div>
    </div>
  );
}

const TYPE_COLORS: Record<string, string> = {
  "roses_perennials": "bg-pink-100 text-pink-700",
  "annuals":            "bg-yellow-100 text-yellow-700",
  "ornamental":         "bg-purple-100 text-purple-700",
  "amenity":            "bg-sky-100 text-sky-700",
  "rain_garden":        "bg-cyan-100 text-cyan-700",
  "reveg":              "bg-lime-100 text-lime-700",
  "bush":               "bg-green-100 text-green-700",
  "tree_planter_pits":  "bg-stone-100 text-stone-700",
  "hedge":              "bg-emerald-100 text-emerald-700",
};

const STANDARD_COLORS: Record<string, string> = {
  high:   "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  low:    "bg-gray-100 text-gray-600",
};

export default function Assets() {
  const [search, setSearch] = useState("");
  const [gardenType, setGardenType] = useState<any>("all");
  const [ward, setWard] = useState<any>("all");
  const [teamId, setTeamId] = useState<any>("all");
  const [view, setView] = useState<"list"|"map">("list");
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  const { data: teamsData } = useListTeams({ query: { queryKey: getListTeamsQueryKey() }});

  const queryParams: any = { limit: 100 };
  if (search) queryParams.search = search;
  if (gardenType && gardenType !== "all") queryParams.gardenType = gardenType;
  if (ward && ward !== "all") queryParams.ward = ward;
  if (teamId && teamId !== "all") queryParams.teamId = teamId;

  const { data: assetsData, isLoading } = useListAssets(queryParams, {
    query: { queryKey: getListAssetsQueryKey(queryParams) }
  });

  const getTeamName = (id?: string | null) => {
    if (!id || !teamsData) return "Unassigned";
    return teamsData.find(t => t.id === id)?.name || "Unassigned";
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f5f7f9] relative">
      <header className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-10 flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Asset Register</h1>
          <p className="text-xs text-gray-400">{assetsData?.total || 0} garden assets found</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button 
              onClick={() => setView("list")} 
              className={`p-1.5 rounded-md flex items-center justify-center transition-colors ${view === "list" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
              title="List View"
            >
              <ListIcon className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setView("map")} 
              className={`p-1.5 rounded-md flex items-center justify-center transition-colors ${view === "map" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
              title="Map View"
            >
              <MapIcon className="w-4 h-4" />
            </button>
          </div>
          <Link href="/assets/new">
            <Button size="sm" style={{ background: BRAND }} className="text-white hover:opacity-90 flex items-center gap-1.5" data-testid="btn-new-asset">
              <Plus className="w-3.5 h-3.5" /> New Asset
            </Button>
          </Link>
        </div>
      </header>

      <div className="px-8 py-4 border-b bg-white flex gap-3 sticky top-[73px] z-10 shadow-sm flex-shrink-0">
        <div className="relative w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input 
            placeholder="Search by name, ref..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        
        <Select value={gardenType} onValueChange={setGardenType}>
          <SelectTrigger className="w-[160px] h-9 text-sm bg-white">
            <SelectValue placeholder="Specification" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Specifications</SelectItem>
            <SelectItem value="amenity">Amenity</SelectItem>
            <SelectItem value="annuals">Annuals</SelectItem>
            <SelectItem value="bush">Bush</SelectItem>
            <SelectItem value="hedge">Hedge</SelectItem>
            <SelectItem value="ornamental">Ornamental</SelectItem>
            <SelectItem value="rain_garden">Rain Garden</SelectItem>
            <SelectItem value="reveg">Reveg</SelectItem>
            <SelectItem value="roses_perennials">Roses & Perennials</SelectItem>
            <SelectItem value="tree_planter_pits">Tree Planter Pits</SelectItem>
          </SelectContent>
        </Select>

        <Select value={ward} onValueChange={setWard}>
          <SelectTrigger className="w-[140px] h-9 text-sm bg-white">
            <SelectValue placeholder="Ward" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Wards</SelectItem>
            <SelectItem value="eastern">Eastern</SelectItem>
            <SelectItem value="northern">Northern</SelectItem>
            <SelectItem value="western">Western</SelectItem>
          </SelectContent>
        </Select>

        <Select value={teamId} onValueChange={setTeamId}>
          <SelectTrigger className="w-[160px] h-9 text-sm bg-white">
            <SelectValue placeholder="Assigned Team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Teams</SelectItem>
            {teamsData?.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(search || gardenType !== "all" || ward !== "all" || teamId !== "all") && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-9 px-3 text-gray-500 hover:text-gray-900"
            onClick={() => {
              setSearch("");
              setGardenType("all");
              setWard("all");
              setTeamId("all");
            }}
          >
            Clear Filters
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-8">
        {isLoading ? (
          <Skeleton className="w-full h-96 rounded-xl" />
        ) : view === "list" ? (
          <Card className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase tracking-wide text-xs">Reference</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase tracking-wide text-xs">Site Name</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase tracking-wide text-xs">Type</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase tracking-wide text-xs">Standard</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase tracking-wide text-xs">Location</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase tracking-wide text-xs">Freq</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase tracking-wide text-xs">Team</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {assetsData?.data.map((asset) => (
                  <tr 
                    key={asset.id} 
                    className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                    onClick={() => setSelectedAssetId(asset.id)}
                    data-testid={`row-asset-${asset.id}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{asset.reference}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{asset.name}</td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className={`text-[10px] uppercase font-bold tracking-wider rounded border-0 ${TYPE_COLORS[asset.gardenType] || "bg-gray-100 text-gray-700"}`}>
                        {asset.gardenType.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${STANDARD_COLORS[asset.standard]}`}>
                        {asset.standard}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 text-gray-400" />
                        <span className="truncate max-w-[120px]">{asset.suburb || asset.ward || "-"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 capitalize">{asset.frequency}</td>
                    <td className="px-4 py-3 text-gray-500">{getTeamName(asset.teamId)}</td>
                  </tr>
                ))}
                {assetsData?.data.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      No assets found matching filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        ) : (
          <div className="w-full h-[600px] rounded-xl overflow-hidden shadow-sm border border-gray-200">
            <MapContainer
              center={[-41.13, 174.85]}
              zoom={13}
              style={{ height: "100%", width: "100%" }}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {assetsData?.data.map(asset => {
                const color = MAP_COLORS[asset.gardenType] || BRAND;
                const boundary = (asset as any).boundary as GeoPolygon | null;
                const tip = <Tooltip><b>{asset.name}</b><br />{asset.reference}</Tooltip>;
                if (boundary?.coordinates?.[0]?.length) {
                  const positions: [number, number][] = boundary.coordinates[0].map(
                    ([lng, lat]: number[]) => [lat, lng]
                  );
                  return (
                    <Polygon
                      key={asset.id}
                      positions={positions}
                      pathOptions={{ color, fillColor: color, fillOpacity: 0.3, weight: 2 }}
                      eventHandlers={{ click: () => setSelectedAssetId(asset.id) }}
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
                    radius={8}
                    eventHandlers={{ click: () => setSelectedAssetId(asset.id) }}
                    pathOptions={{ fillColor: color, fillOpacity: 0.9, color: "#fff", weight: 2 }}
                  >
                    {tip}
                  </CircleMarker>
                );
              })}
            </MapContainer>
          </div>
        )}
      </div>

      <AssetDetailDrawer 
        assetId={selectedAssetId} 
        onClose={() => setSelectedAssetId(null)}
        teamName={getTeamName}
      />
    </div>
  );
}

function AssetDetailDrawer({ assetId, onClose, teamName }: { assetId: string | null, onClose: () => void, teamName: (id?: string|null) => string }) {
  const { data: asset, isLoading } = useGetAsset(assetId || "", {
    query: { enabled: !!assetId, queryKey: getGetAssetQueryKey(assetId || "") }
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const deleteMutation = useDeleteAsset({
    mutation: {
      onSuccess: () => {
        toast({ title: "Asset archived" });
        queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
        onClose();
      }
    }
  });

  return (
    <Sheet open={!!assetId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[480px] sm:max-w-md p-0 flex flex-col gap-0 border-l border-gray-200" data-testid="drawer-asset-detail">
        {isLoading || !asset ? (
          <div className="p-6"><Skeleton className="h-64" /></div>
        ) : (
          <>
            <div className="px-5 py-5 border-b bg-[#0f2a36] flex-shrink-0">
              <div className="flex justify-between items-start mb-2">
                <h2 className="text-lg font-bold text-white leading-snug">{asset.name}</h2>
              </div>
              <p className="text-[11px] text-white/50 font-mono mb-3">{asset.reference}</p>
              <div className="flex flex-wrap gap-2">
                <Badge className={`text-[10px] border-0 capitalize ${TYPE_COLORS[asset.gardenType] || "bg-gray-100 text-gray-700"}`}>
                  {asset.gardenType.replace("_", " ")}
                </Badge>
                <Badge className={`text-[10px] border-0 capitalize ${STANDARD_COLORS[asset.standard]}`}>
                  {asset.standard} Standard
                </Badge>
                <Badge variant="outline" className="text-[10px] text-white/70 border-white/20 bg-white/5">
                  {teamName(asset.teamId)}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-0 border-b flex-shrink-0 bg-white">
              {[
                { label: "Area",      value: `${asset.areaM2} m²` },
                { label: "Service",   value: `${asset.serviceTimeMins} min` },
                { label: "Freq",      value: asset.frequency },
                { label: "Ward",      value: asset.ward || "-" },
              ].map(({ label, value }) => (
                <div key={label} className="px-3 py-3 text-center border-r border-gray-100 last:border-r-0">
                  <p className="text-[9px] text-gray-400 uppercase tracking-widest font-semibold">{label}</p>
                  <p className="text-[12px] font-bold text-gray-900 mt-1 truncate">{value}</p>
                </div>
              ))}
            </div>

            {(asset.lat || (asset as any).boundary) && (
              <DrawerMap asset={asset} />
            )}

            <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-white">
              <section>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Location Details</p>
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="text-gray-500">Suburb:</span>
                    <span className="col-span-2 font-medium text-gray-900">{asset.suburb || "-"}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="text-gray-500">Address:</span>
                    <span className="col-span-2 font-medium text-gray-900">{asset.streetAddress || "-"}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="text-gray-500">Coordinates:</span>
                    <span className="col-span-2 font-mono text-gray-700">{asset.lat != null ? Number(asset.lat).toFixed(4) : "—"}, {asset.lng != null ? Number(asset.lng).toFixed(4) : "—"}</span>
                  </div>
                </div>
              </section>

              {asset.notes && (
                <section>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Notes</p>
                  <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 border border-gray-100 whitespace-pre-wrap">
                    {asset.notes}
                  </div>
                </section>
              )}
            </div>

            <div className="p-4 border-t bg-gray-50 flex items-center justify-between flex-shrink-0">
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => {
                  if (confirm("Are you sure you want to archive this asset?")) {
                    deleteMutation.mutate({ id: asset.id });
                  }
                }}
                disabled={deleteMutation.isPending}
              >
                Archive Asset
              </Button>
              <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
