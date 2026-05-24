import { useState, useEffect, useMemo } from "react";
import { useListAssets, getListAssetsQueryKey, useListTeams, getListTeamsQueryKey, getGetAssetQueryKey, useGetAsset, useDeleteAsset } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, ChevronUp, ChevronDown, ChevronsUpDown, Loader2, Pencil } from "lucide-react";
import { Link, useLocation } from "wouter";
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

type SortCol = "reference" | "name" | "gardenType" | "serviceTimeMins" | "siteType" | "frequency" | "team";
type SortDir = "asc" | "desc";

function SortTh({ label, col, sortCol, sortDir, onSort, className }: {
  label: string; col: SortCol; sortCol: SortCol; sortDir: SortDir;
  onSort: (c: SortCol) => void; className?: string;
}) {
  const active = sortCol === col;
  const Icon = active ? (sortDir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th
      className={`px-4 py-3 font-semibold text-gray-500 uppercase tracking-wide text-xs cursor-pointer select-none group ${className ?? ""}`}
      onClick={() => onSort(col)}
    >
      <span className="flex items-center gap-1">
        {label}
        <Icon className={`w-3 h-3 transition-opacity ${active ? "opacity-100" : "opacity-30 group-hover:opacity-60"}`} />
      </span>
    </th>
  );
}

export default function Assets() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [gardenType, setGardenType] = useState<any>("all");
  const [ward, setWard] = useState<any>("all");
  const [teamId, setTeamId] = useState<any>("all");
  const [sortCol, setSortCol] = useState<SortCol>("reference");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { data: teamsData } = useListTeams({ query: { queryKey: getListTeamsQueryKey() }});

  const queryParams: any = { limit: 2000 };
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

  const handleSort = (col: SortCol) => {
    if (col === sortCol) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const sortedAssets = useMemo(() => {
    const rows = [...(assetsData?.data ?? [])];
    rows.sort((a, b) => {
      let av: any, bv: any;
      if (sortCol === "reference")      { av = a.reference;       bv = b.reference; }
      else if (sortCol === "name")      { av = a.name;            bv = b.name; }
      else if (sortCol === "gardenType"){ av = a.gardenType;      bv = b.gardenType; }
      else if (sortCol === "serviceTimeMins") { av = a.serviceTimeMins ?? 0; bv = b.serviceTimeMins ?? 0; }
      else if (sortCol === "siteType")  { av = a.siteType || ""; bv = b.siteType || ""; }
      else if (sortCol === "frequency") { av = a.frequency;       bv = b.frequency; }
      else if (sortCol === "team")      { av = getTeamName(a.teamId); bv = getTeamName(b.teamId); }
      if (av == null) av = ""; if (bv == null) bv = "";
      const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [assetsData?.data, sortCol, sortDir, teamsData]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f5f7f9] relative">
      <header className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-10 flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Asset Register</h1>
          <p className="text-xs text-gray-400">{assetsData?.total || 0} garden assets found</p>
        </div>
        <div className="flex items-center gap-3">
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
        ) : (
          <Card className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <SortTh label="Reference"     col="reference"      sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Site Name"     col="name"           sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Description</th>
                  <SortTh label="Specification" col="gardenType"     sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Service Time"  col="serviceTimeMins" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Garden Type"   col="siteType"       sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Freq"          col="frequency"      sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Team"          col="team"           sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedAssets.map((asset) => (
                  <tr 
                    key={asset.id} 
                    className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                    onClick={() => navigate("/assets/" + asset.id)}
                    data-testid={`row-asset-${asset.id}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{asset.reference}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{asset.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-[220px]">
                      <span className="line-clamp-2" title={asset.description ?? undefined}>{asset.description || <span className="text-gray-300">—</span>}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className={`text-[10px] uppercase font-bold tracking-wider rounded border-0 ${TYPE_COLORS[asset.gardenType] || "bg-gray-100 text-gray-700"}`}>
                        {asset.gardenType.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{asset.serviceTimeMins} min</td>
                    <td className="px-4 py-3">
                      {asset.siteType ? (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${asset.siteType === "park" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                          {asset.siteType}
                        </span>
                      ) : <span className="text-gray-300 text-xs">—</span>}
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
        )}
      </div>

    </div>
  );
}

type EditForm = {
  name: string; gardenType: string; standard: string; areaM2: string;
  serviceTimeMins: string; frequency: string; siteType: string; ward: string;
  teamId: string; suburb: string; streetAddress: string; description: string; notes: string;
};

interface HistoryEntry {
  id: string; action: string; changedAt: string; changedByName: string;
  changes: Array<{ field: string; label: string; old: any; new: any }>;
}

function InfoRow({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <span className="text-gray-500">{label}:</span>
      <span className={`col-span-2 font-medium text-gray-900 ${mono ? "font-mono text-xs text-gray-600 break-all" : ""}`}>
        {value || "—"}
      </span>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</Label>
      {children}
    </div>
  );
}

const ACTION_DOT: Record<string, string> = { INSERT: "#16a34a", UPDATE: "#00AECD", DELETE: "#dc2626" };
const ACTION_LABEL: Record<string, string> = { INSERT: "Asset created", UPDATE: "Updated", DELETE: "Archived" };

function AssetDetailDrawer({ assetId, onClose, teamName }: { assetId: string | null, onClose: () => void, teamName: (id?: string|null) => string }) {
  const { data: asset, isLoading } = useGetAsset(assetId || "", {
    query: { enabled: !!assetId, queryKey: getGetAssetQueryKey(assetId || "") }
  });
  const { data: teamsData } = useListTeams({ query: { queryKey: getListTeamsQueryKey() } });

  const [activeTab, setActiveTab] = useState<"details" | "history">("details");
  const [editing, setEditing]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [history, setHistory]     = useState<HistoryEntry[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [form, setForm] = useState<EditForm>({
    name: "", gardenType: "", standard: "", areaM2: "", serviceTimeMins: "",
    frequency: "", siteType: "", ward: "", teamId: "", suburb: "", streetAddress: "", description: "", notes: "",
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Reset on asset change
  useEffect(() => {
    setEditing(false);
    setActiveTab("details");
    setHistory([]);
  }, [assetId]);

  // Populate form when asset loads
  useEffect(() => {
    if (asset) {
      setForm({
        name:            asset.name || "",
        gardenType:      asset.gardenType || "",
        standard:        asset.standard || "",
        areaM2:          String(asset.areaM2 ?? ""),
        serviceTimeMins: String(asset.serviceTimeMins ?? ""),
        frequency:       asset.frequency || "",
        siteType:        (asset as any).siteType || "",
        ward:            asset.ward || "",
        teamId:          asset.teamId || "",
        suburb:          asset.suburb || "",
        streetAddress:   asset.streetAddress || "",
        description:     asset.description || "",
        notes:           asset.notes || "",
      });
    }
  }, [asset]);

  // Load history when tab is activated
  useEffect(() => {
    if (activeTab === "history" && assetId && history.length === 0) {
      setHistLoading(true);
      fetch(`/api/assets/${assetId}/history`, { credentials: "include" })
        .then(r => r.json())
        .then(setHistory)
        .catch(() => toast({ title: "Failed to load history", variant: "destructive" }))
        .finally(() => setHistLoading(false));
    }
  }, [activeTab, assetId]);

  const deleteMutation = useDeleteAsset({
    mutation: {
      onSuccess: () => {
        toast({ title: "Asset archived" });
        queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
        onClose();
      }
    }
  });

  const f = (key: keyof EditForm, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        areaM2:          parseInt(form.areaM2) || 0,
        serviceTimeMins: parseInt(form.serviceTimeMins) || 0,
        siteType:        form.siteType      || null,
        ward:            form.ward          || null,
        teamId:          form.teamId        || null,
        suburb:          form.suburb        || null,
        streetAddress:   form.streetAddress || null,
        description:     form.description   || null,
        notes:           form.notes         || null,
      };
      const r = await fetch(`/api/assets/${asset!.id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(await r.text());
      toast({ title: "Asset updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: getGetAssetQueryKey(asset!.id) });
      setEditing(false);
      setHistory([]); // reset so history reloads fresh
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={!!assetId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[520px] sm:max-w-lg p-0 flex flex-col gap-0 border-l border-gray-200" data-testid="drawer-asset-detail">
        {isLoading || !asset ? (
          <div className="p-6"><Skeleton className="h-64" /></div>
        ) : (
          <>
            {/* Header */}
            <div className="px-5 py-4 border-b bg-[#0f2a36] flex-shrink-0">
              <div className="flex justify-between items-start mb-1">
                <h2 className="text-base font-bold text-white leading-snug">{asset.name}</h2>
                {!editing && (
                  <button onClick={() => setEditing(true)} className="ml-3 flex items-center gap-1 text-white/60 hover:text-white text-[11px] flex-shrink-0">
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                )}
              </div>
              <p className="text-[11px] text-white/50 font-mono mb-2.5">{asset.reference}</p>
              <div className="flex flex-wrap gap-1.5">
                <Badge className={`text-[10px] border-0 capitalize ${TYPE_COLORS[asset.gardenType] || "bg-gray-100 text-gray-700"}`}>
                  {asset.gardenType.replace(/_/g, " ")}
                </Badge>
                <Badge className={`text-[10px] border-0 capitalize ${STANDARD_COLORS[asset.standard]}`}>
                  {asset.standard} Standard
                </Badge>
                <Badge variant="outline" className="text-[10px] text-white/70 border-white/20 bg-white/5">
                  {teamName(asset.teamId)}
                </Badge>
              </div>
            </div>

            {/* Stats bar */}
            {!editing && (
              <div className="grid grid-cols-4 gap-0 border-b flex-shrink-0 bg-white">
                {[
                  { label: "Area",    value: `${asset.areaM2} m²` },
                  { label: "Service", value: `${asset.serviceTimeMins} min` },
                  { label: "Freq",    value: asset.frequency },
                  { label: "Ward",    value: asset.ward || "-" },
                ].map(({ label, value }) => (
                  <div key={label} className="px-3 py-2.5 text-center border-r border-gray-100 last:border-r-0">
                    <p className="text-[9px] text-gray-400 uppercase tracking-widest font-semibold">{label}</p>
                    <p className="text-[11px] font-bold text-gray-900 mt-0.5 truncate capitalize">{value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Tabs (only in view mode) */}
            {!editing && (
              <div className="flex border-b bg-white flex-shrink-0 px-5">
                {(["details", "history"] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setActiveTab(t)}
                    className={`px-1 py-2.5 text-xs font-semibold mr-4 border-b-2 transition-colors capitalize ${
                      activeTab === t ? "border-[#00AECD] text-[#00AECD]" : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {t === "history" ? "Change History" : "Details"}
                  </button>
                ))}
              </div>
            )}

            {/* ── DETAILS TAB (view) ── */}
            {!editing && activeTab === "details" && (
              <>
                {(asset.lat || (asset as any).boundary) && <DrawerMap asset={asset} />}
                <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-white">
                  <section>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Location Details</p>
                    <div className="space-y-2">
                      <InfoRow label="Site Type"   value={(asset as any).siteType} />
                      <InfoRow label="Global ID"   value={(asset as any).globalId} mono />
                      <InfoRow label="Suburb"      value={asset.suburb} />
                      <InfoRow label="Address"     value={asset.streetAddress} />
                      <InfoRow label="Description" value={asset.description} />
                      <InfoRow label="Coordinates" mono
                        value={asset.lat != null ? `${Number(asset.lat).toFixed(4)}, ${Number(asset.lng).toFixed(4)}` : null} />
                    </div>
                  </section>
                  {asset.notes && (
                    <section>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Notes</p>
                      <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 border border-gray-100 whitespace-pre-wrap">{asset.notes}</div>
                    </section>
                  )}
                </div>
                <div className="p-4 border-t bg-gray-50 flex items-center justify-between flex-shrink-0">
                  <Button variant="destructive" size="sm" disabled={deleteMutation.isPending}
                    onClick={() => { if (confirm("Archive this asset?")) deleteMutation.mutate({ id: asset.id }); }}
                  >Archive Asset</Button>
                  <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
                </div>
              </>
            )}

            {/* ── EDIT FORM ── */}
            {editing && (
              <>
                <div className="flex-1 overflow-y-auto p-5 bg-white">
                  <div className="space-y-4">
                    <FormField label="Site Name">
                      <Input value={form.name} onChange={e => f("name", e.target.value)} className="text-sm" />
                    </FormField>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField label="Specification">
                        <Select value={form.gardenType} onValueChange={v => f("gardenType", v)}>
                          <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {["amenity","annuals","bush","hedge","ornamental","rain_garden","reveg","roses_perennials","tree_planter_pits"].map(g => (
                              <SelectItem key={g} value={g}>{g.replace(/_/g, " ")}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormField>
                      <FormField label="Standard">
                        <Select value={form.standard} onValueChange={v => f("standard", v)}>
                          <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormField>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField label="Area (m²)">
                        <Input type="number" value={form.areaM2} onChange={e => f("areaM2", e.target.value)} className="text-sm" />
                      </FormField>
                      <FormField label="Service Time (mins)">
                        <Input type="number" value={form.serviceTimeMins} onChange={e => f("serviceTimeMins", e.target.value)} className="text-sm" />
                      </FormField>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField label="Frequency">
                        <Select value={form.frequency} onValueChange={v => f("frequency", v)}>
                          <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="fortnightly">Fortnightly</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="bimonthly">Bimonthly</SelectItem>
                            <SelectItem value="quarterly">Quarterly</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormField>
                      <FormField label="Site Type">
                        <Select value={form.siteType || "__none__"} onValueChange={v => f("siteType", v === "__none__" ? "" : v)}>
                          <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            <SelectItem value="park">Park</SelectItem>
                            <SelectItem value="street">Street</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormField>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField label="Ward">
                        <Select value={form.ward || "__none__"} onValueChange={v => f("ward", v === "__none__" ? "" : v)}>
                          <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            <SelectItem value="eastern">Eastern</SelectItem>
                            <SelectItem value="northern">Northern</SelectItem>
                            <SelectItem value="western">Western</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormField>
                      <FormField label="Team">
                        <Select value={form.teamId || "__none__"} onValueChange={v => f("teamId", v === "__none__" ? "" : v)}>
                          <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Unassigned</SelectItem>
                            {teamsData?.map(t => (
                              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormField>
                    </div>
                    <FormField label="Suburb">
                      <Input value={form.suburb} onChange={e => f("suburb", e.target.value)} className="text-sm" />
                    </FormField>
                    <FormField label="Street Address">
                      <Input value={form.streetAddress} onChange={e => f("streetAddress", e.target.value)} className="text-sm" />
                    </FormField>
                    <FormField label="Description">
                      <Input value={form.description} onChange={e => f("description", e.target.value)} className="text-sm" placeholder="e.g. Corner of Karearea Ave and Bluff Rd" />
                    </FormField>
                    <FormField label="Notes">
                      <Textarea value={form.notes} onChange={e => f("notes", e.target.value)} className="text-sm" rows={3} />
                    </FormField>
                  </div>
                </div>
                <div className="p-4 border-t bg-gray-50 flex items-center justify-end gap-2 flex-shrink-0">
                  <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
                  <Button size="sm" onClick={handleSave} disabled={saving} style={{ background: "#00AECD" }} className="text-white">
                    {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</> : "Save Changes"}
                  </Button>
                </div>
              </>
            )}

            {/* ── HISTORY TAB ── */}
            {!editing && activeTab === "history" && (
              <div className="flex-1 overflow-y-auto p-5 bg-white">
                {histLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                  </div>
                ) : history.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-12">No changes recorded yet.</p>
                ) : (
                  <div className="space-y-3">
                    {history.map((entry, i) => (
                      <div key={entry.id} className="relative pl-6">
                        {i < history.length - 1 && (
                          <div className="absolute left-[7px] top-5 bottom-0 w-px bg-gray-200" />
                        )}
                        <div
                          className="absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm"
                          style={{ background: ACTION_DOT[entry.action] ?? "#94a3b8" }}
                        />
                        <div className="bg-gray-50 rounded-xl border border-gray-100 p-3 space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-semibold text-gray-800">
                              {ACTION_LABEL[entry.action] ?? entry.action}
                            </span>
                            <span className="text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0">
                              {new Date(entry.changedAt).toLocaleString("en-NZ", {
                                day: "numeric", month: "short", year: "numeric",
                                hour: "2-digit", minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500">by {entry.changedByName}</p>
                          {entry.changes.length > 0 && (
                            <div className="space-y-1 pt-1 border-t border-gray-200 mt-1">
                              {entry.changes.map(c => (
                                <div key={c.field} className="text-[11px] flex items-start gap-1.5 flex-wrap">
                                  <span className="font-semibold text-gray-700 w-28 flex-shrink-0">{c.label}</span>
                                  <span className="line-through text-red-500 max-w-[120px] truncate">{String(c.old ?? "—")}</span>
                                  <span className="text-gray-400">→</span>
                                  <span className="text-green-700 font-medium max-w-[120px] truncate">{String(c.new ?? "—")}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
