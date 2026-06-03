import { useState, useEffect, useMemo, useRef } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Route, CheckCircle2, AlertCircle, GripVertical,
  Save, Search, MapPin, RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip } from "react-leaflet";
import { useListTeams } from "@workspace/api-client-react";
import "leaflet/dist/leaflet.css";

// apiFetch with silent 401 → token-refresh → retry, matching the shared API client behaviour.
// Without this, saves fail silently after the 15-min access token expires mid-session.
async function apiFetch(path: string, opts?: RequestInit): Promise<Response> {
  let r = await fetch(path, { credentials: "include", ...opts });
  if (r.status === 401) {
    const refreshed = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
    if (refreshed.ok) {
      r = await fetch(path, { credentials: "include", ...opts });
    }
  }
  return r;
}

interface SystemSettings {
  id: number;
  routesLastOptimised: string | null;
}

interface RouteAsset {
  id:         string;
  name:       string;
  suburb:     string | null;
  gardenType: string;
  routeOrder: number | null;
  lat:        number | null;
  lng:        number | null;
}

const TYPE_COLORS: Record<string, string> = {
  annuals:           "#f59e0b",
  ornamental:        "#8b5cf6",
  amenity:           "#0ea5e9",
  bush:              "#22c55e",
  tree_planter_pits: "#78716c",
  hedge:             "#10b981",
};
const TYPE_LABELS: Record<string, string> = {
  annuals:           "Annuals",
  ornamental:        "Ornamental",
  amenity:           "Amenity",
  bush:              "Bush",
  tree_planter_pits: "Tree Pit",
  hedge:             "Hedge",
};

function TypeBadge({ type }: { type: string }) {
  const color = TYPE_COLORS[type] ?? "#6b7280";
  const label = TYPE_LABELS[type] ?? type;
  return (
    <span style={{
      background: color + "18",
      color,
      fontSize: 10,
      fontWeight: 600,
      padding: "1px 7px",
      borderRadius: 10,
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

function DragRow({ asset, index, searchTerm }: { asset: RouteAsset; index: number; searchTerm: string }) {
  const controls = useDragControls();
  const highlight = searchTerm.length >= 2 &&
    (asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
     (asset.suburb ?? "").toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <Reorder.Item
      value={asset}
      dragListener={false}
      dragControls={controls}
      style={{ listStyle: "none" }}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-colors select-none ${
        highlight
          ? "bg-teal-50 border-teal-200"
          : "bg-white border-gray-100 hover:border-gray-200"
      }`}
      whileDrag={{ boxShadow: "0 4px 20px rgba(0,0,0,0.12)", zIndex: 50, background: "#fff" }}
    >
      <button
        className="cursor-grab active:cursor-grabbing touch-none p-0.5 text-gray-300 hover:text-gray-500 flex-shrink-0"
        onPointerDown={e => controls.start(e)}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>

      <span className="w-8 text-right text-xs font-mono font-semibold text-gray-400 flex-shrink-0">
        {index + 1}
      </span>

      <span className="flex-1 min-w-0">
        <span className="text-xs font-semibold text-gray-800 truncate block">{asset.name}</span>
        {asset.suburb && (
          <span className="text-[10px] text-gray-400">{asset.suburb}</span>
        )}
      </span>

      <TypeBadge type={asset.gardenType} />

      {asset.lat == null && (
        <span title="No coordinates" className="text-gray-300">
          <MapPin className="w-3 h-3" />
        </span>
      )}
    </Reorder.Item>
  );
}

function RouteMap({ assets, teamId }: { assets: RouteAsset[]; teamId: string }) {
  const withCoords = assets.filter(a => a.lat != null && a.lng != null);
  const polyline = withCoords.map(a => [a.lat!, a.lng!] as [number, number]);

  const bounds: [[number, number], [number, number]] | undefined = useMemo(() => {
    if (withCoords.length === 0) return undefined;
    const lats = withCoords.map(a => a.lat!);
    const lngs = withCoords.map(a => a.lng!);
    return [
      [Math.min(...lats) - 0.002, Math.min(...lngs) - 0.002],
      [Math.max(...lats) + 0.002, Math.max(...lngs) + 0.002],
    ];
  }, [withCoords.length, teamId]);

  if (withCoords.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-gray-400 bg-gray-50 rounded-xl">
        No coordinates to display
      </div>
    );
  }

  return (
    <MapContainer
      key={teamId}
      bounds={bounds}
      style={{ height: "100%", width: "100%", borderRadius: 12 }}
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxNativeZoom={19}
      />
      {polyline.length > 1 && (
        <Polyline
          positions={polyline}
          pathOptions={{ color: "#00AECD", weight: 2, opacity: 0.6 }}
        />
      )}
      {withCoords.map((a, i) => (
        <CircleMarker
          key={a.id}
          center={[a.lat!, a.lng!]}
          radius={9}
          pathOptions={{ fillColor: "#00AECD", fillOpacity: 0.9, color: "#0f2a36", weight: 1 }}
        >
          <Tooltip permanent direction="center" offset={[0, 0]} opacity={1} className="route-seq-label">
            <span style={{ fontWeight: 700, fontSize: 9, color: "#fff", display: "block", textAlign: "center" }}>
              {i + 1}
            </span>
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

export default function RouteOptimisationPage() {
  const [settings, setSettings]     = useState<SystemSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [optimising, setOptimising] = useState(false);

  const { data: teamsData } = useListTeams();
  const teams = teamsData ?? [];

  const [selectedTeamId, setSelectedTeamId] = useState<string>("");

  // Default to CBD team on first load
  useEffect(() => {
    if (selectedTeamId || teams.length === 0) return;
    const cbd = teams.find(t => t.name.toLowerCase().includes("cbd"));
    if (cbd) setSelectedTeamId(cbd.id);
    else setSelectedTeamId(teams[0].id);
  }, [teams]);
  const [assets, setAssets]                 = useState<RouteAsset[]>([]);
  const [loadingAssets, setLoadingAssets]   = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [isDirty, setIsDirty]               = useState(false);
  const [searchTerm, setSearchTerm]         = useState("");
  const [mapKey, setMapKey]                 = useState(0);

  const { toast } = useToast();

  useEffect(() => {
    apiFetch("/api/settings")
      .then(r => r.json())
      .then((d: SystemSettings) => setSettings(d))
      .catch(() => toast({ title: "Failed to load settings", variant: "destructive" }))
      .finally(() => setSettingsLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedTeamId) { setAssets([]); return; }
    setLoadingAssets(true);
    setIsDirty(false);
    apiFetch(`/api/assets/by-team-route?teamId=${selectedTeamId}`)
      .then(r => r.json())
      .then((data: unknown) => { setAssets(Array.isArray(data) ? data : []); })
      .catch(() => toast({ title: "Failed to load route assets", variant: "destructive" }))
      .finally(() => setLoadingAssets(false));
  }, [selectedTeamId]);

  const handleReorder = (newOrder: RouteAsset[]) => {
    setAssets(newOrder);
    setIsDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = assets.map((a, i) => ({ id: a.id, routeOrder: i + 1 }));
      const r = await apiFetch("/api/assets/route-order", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      if (!r.ok) throw new Error(await r.text());
      setAssets(prev => prev.map((a, i) => ({ ...a, routeOrder: i + 1 })));
      setIsDirty(false);
      setMapKey(k => k + 1);
      toast({ title: "Route order saved", description: `${updates.length} sites updated.` });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleOptimise = async () => {
    setOptimising(true);
    try {
      const r = await apiFetch("/api/assets/optimise-routes", { method: "POST" });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setSettings(prev => prev ? { ...prev, routesLastOptimised: data.routesLastOptimised } : prev);
      toast({
        title: "Routes auto-optimised",
        description: `${data.assetsUpdated} assets re-sequenced across ${data.teamsOptimised} teams.`,
      });
      if (selectedTeamId) {
        setLoadingAssets(true);
        const r2 = await apiFetch(`/api/assets/by-team-route?teamId=${selectedTeamId}`);
        const refreshed = await r2.json();
        setAssets(refreshed);
        setIsDirty(false);
        setMapKey(k => k + 1);
        setLoadingAssets(false);
      }
    } catch {
      toast({ title: "Optimisation failed", variant: "destructive" });
    } finally {
      setOptimising(false);
    }
  };

  const matchCount = useMemo(() => {
    if (searchTerm.length < 2) return 0;
    const q = searchTerm.toLowerCase();
    return assets.filter(a =>
      a.name.toLowerCase().includes(q) || (a.suburb ?? "").toLowerCase().includes(q)
    ).length;
  }, [searchTerm, assets]);

  const selectedTeam = teams.find(t => t.id === selectedTeamId);

  return (
    <div className="px-8 py-8 space-y-6 max-w-7xl mx-auto">

      {/* ── Top: Auto-optimise card ─────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Route className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Auto Route Optimisation</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Spatial grid + Or-opt geosequencing across all teams — use as a starting point, then fine-tune below
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {!settingsLoading && (
              settings?.routesLastOptimised ? (
                <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 rounded-lg px-3 py-1.5">
                  <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                  Last run {format(new Date(settings.routesLastOptimised), "d MMM yyyy HH:mm")}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" />
                  Not yet run
                </div>
              )
            )}
            <Button
              onClick={handleOptimise}
              disabled={optimising}
              variant="outline"
              size="sm"
              className="gap-2 border-purple-200 text-purple-700 hover:bg-purple-50"
            >
              {optimising
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <RefreshCw className="w-3.5 h-3.5" />}
              {optimising ? "Optimising…" : "Re-optimise All"}
            </Button>
          </div>
        </div>
      </section>

      {/* ── Bottom: Manual drag-reorder ─────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0">
              <GripVertical className="w-4 h-4 text-teal-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Manual Route Editor</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Drag sites to fine-tune the sequence for a team — changes apply to the schedule immediately on save
              </p>
            </div>
          </div>

          {isDirty && (
            <Button
              onClick={handleSave}
              disabled={saving}
              size="sm"
              className="gap-2 bg-[#00AECD] hover:bg-[#0099b8] text-white flex-shrink-0"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? "Saving…" : `Save Order`}
            </Button>
          )}
        </div>

        {/* Team selector */}
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
          <span className="text-xs font-medium text-gray-500 flex-shrink-0">Team</span>
          <div className="flex gap-2 flex-wrap">
            {teams.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedTeamId(t.id)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                  selectedTeamId === t.id
                    ? "bg-[#0f2a36] text-white"
                    : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        {!selectedTeamId ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
            <Route className="w-8 h-8 text-gray-200" />
            <p className="text-sm">Select a team to view and edit its route sequence</p>
          </div>
        ) : loadingAssets ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="flex h-[600px]">

            {/* ── Left: sortable list ──────────────────────────────────── */}
            <div className="flex flex-col w-[42%] border-r border-gray-100">
              {/* Search */}
              <div className="px-3 py-2.5 border-b border-gray-100">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  <Input
                    placeholder="Search by name or suburb…"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-8 h-8 text-xs border-gray-200"
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] text-gray-400">
                    {assets.length} sites · drag <GripVertical className="inline w-2.5 h-2.5" /> to reorder
                  </span>
                  {searchTerm.length >= 2 && (
                    <span className="text-[10px] text-teal-600 font-medium">
                      {matchCount} match{matchCount !== 1 ? "es" : ""} highlighted
                    </span>
                  )}
                </div>
              </div>

              {/* Draggable list */}
              <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                <Reorder.Group
                  axis="y"
                  values={assets}
                  onReorder={handleReorder}
                  style={{ listStyle: "none", margin: 0, padding: 0 }}
                  className="space-y-0.5"
                >
                  {assets.map((asset, i) => (
                    <DragRow
                      key={asset.id}
                      asset={asset}
                      index={i}
                      searchTerm={searchTerm}
                    />
                  ))}
                </Reorder.Group>
              </div>
            </div>

            {/* ── Right: live route map ────────────────────────────────── */}
            <div className="flex-1 p-3">
              <div className="h-full relative">
                <RouteMap key={mapKey} assets={assets} teamId={selectedTeamId} />

                {isDirty && (
                  <div className="absolute top-2 left-2 bg-amber-500 text-white text-[10px] font-semibold px-2 py-1 rounded-md shadow z-[1000]">
                    Unsaved changes — map shows current drag order
                  </div>
                )}

                <div className="absolute bottom-2 right-2 bg-white/90 text-[10px] text-gray-500 px-2 py-1 rounded shadow z-[1000]">
                  {selectedTeam?.name} · {assets.filter(a => a.lat != null).length} mapped sites
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
