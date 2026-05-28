import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useGetAsset, useListTeams, getGetAssetQueryKey, getListTeamsQueryKey } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, MapPin, Clock, CalendarDays, Ruler, Tag,
  CheckCircle2, AlertTriangle, ChevronDown, ChevronRight,
  Camera, History, Wrench, Pencil, CalendarCheck, Zap,
  User, ImageIcon, Leaf, Info, Loader2, X, ClipboardCheck,
} from "lucide-react";
import { MapContainer, TileLayer, CircleMarker, Polygon, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const BRAND = "#00AECD";
const NAVY = "#0f2a36";

type GeoPolygon = { type: "Polygon"; coordinates: number[][][] };

const TYPE_COLORS: Record<string, string> = {
  roses_perennials: "bg-pink-100 text-pink-700",
  annuals:          "bg-yellow-100 text-yellow-700",
  ornamental:       "bg-purple-100 text-purple-700",
  amenity:          "bg-sky-100 text-sky-700",
  rain_garden:      "bg-cyan-100 text-cyan-700",
  reveg:            "bg-lime-100 text-lime-700",
  bush:             "bg-green-100 text-green-700",
  tree_planter_pits:"bg-stone-100 text-stone-700",
  hedge:            "bg-emerald-100 text-emerald-700",
};

const STANDARD_COLORS: Record<string, string> = {
  high:   "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  low:    "bg-gray-100 text-gray-600",
};

const ACTION_DOT: Record<string, string>   = { INSERT: "#16a34a", UPDATE: BRAND, DELETE: "#dc2626" };
const ACTION_LABEL: Record<string, string> = { INSERT: "Asset created", UPDATE: "Updated", DELETE: "Archived" };

// ─── FitBounds helper ─────────────────────────────────────────────────────────

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 1) {
      map.fitBounds(L.latLngBounds(positions), { padding: [24, 24], maxZoom: 20 });
    }
  }, [map]);
  return null;
}

// ─── Asset map with aerial/street toggle + polygon support ────────────────────

function AssetMap({ asset }: { asset: any }) {
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

  const tiles = {
    street: {
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
    aerial: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: "Tiles &copy; Esri",
    },
  };

  return (
    <div className="relative flex-shrink-0" style={{ height: 200 }}>
      <MapContainer
        center={center}
        zoom={17}
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
        {hasPolygon ? (
          <>
            <FitBounds positions={positions} />
            <Polygon
              positions={positions}
              pathOptions={{ color: BRAND, fillColor: BRAND, fillOpacity: 0.2, weight: 3 }}
            />
          </>
        ) : (
          <CircleMarker
            center={center}
            radius={10}
            pathOptions={{ color: "#fff", weight: 2.5, fillColor: BRAND, fillOpacity: 1 }}
          >
            <Tooltip permanent direction="top" offset={[0, -14]}>
              <span className="text-[10px] font-semibold">{asset.name}</span>
            </Tooltip>
          </CircleMarker>
        )}
      </MapContainer>
      <div className="absolute top-2 right-2 z-[1000] flex rounded-md overflow-hidden shadow-md border border-gray-300 text-[11px] font-semibold">
        <button
          onClick={() => setLayer("aerial")}
          className={`px-2.5 py-1 transition-colors ${layer === "aerial" ? "text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
          style={layer === "aerial" ? { background: BRAND } : {}}
        >Aerial</button>
        <button
          onClick={() => setLayer("street")}
          className={`px-2.5 py-1 transition-colors border-l border-gray-300 ${layer === "street" ? "text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
          style={layer === "street" ? { background: BRAND } : {}}
        >Street</button>
      </div>
    </div>
  );
}

// ─── Job type / status badges ─────────────────────────────────────────────────

function JobTypeBadge({ type, reactive }: { type: string; reactive?: boolean }) {
  if (reactive)
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700"><Zap className="w-2.5 h-2.5" />Reactive</span>;
  if (type === "mulching")
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 text-stone-700"><Leaf className="w-2.5 h-2.5" />Mulching</span>;
  if (type === "infill_planting")
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-lime-100 text-lime-700"><Leaf className="w-2.5 h-2.5" />Infill Planting</span>;
  return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700"><CalendarCheck className="w-2.5 h-2.5" />Scheduled</span>;
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    in_progress: "bg-blue-100 text-blue-700",
    overdue:     "bg-red-100 text-red-700",
    skipped:     "bg-gray-100 text-gray-500",
    completed:   "bg-green-100 text-green-700",
    cancelled:   "bg-gray-100 text-gray-500",
    pending:     "bg-slate-100 text-slate-500",
    raised:      "bg-yellow-100 text-yellow-700",
    assigned:    "bg-blue-50 text-blue-600",
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg[status] ?? "bg-gray-100 text-gray-500"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ─── Form helpers ─────────────────────────────────────────────────────────────

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</Label>
      {children}
    </div>
  );
}

// ─── Scheduled Jobs tab ───────────────────────────────────────────────────────

function ScheduledJobsTab({ assetId, getTeamName }: { assetId: string; getTeamName: (id?: string | null) => string }) {
  const [jobs, setJobs]       = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/jobs?assetId=${assetId}&status=pending,in_progress,overdue&limit=50`, { credentials: "include" })
      .then(r => r.json())
      .then(d => setJobs(d.data ?? []))
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, [assetId]);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-800">Upcoming Jobs</p>
          <p className="text-xs text-gray-400 mt-0.5">{jobs.length} job{jobs.length !== 1 ? "s" : ""} scheduled</p>
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <CalendarDays className="w-8 h-8 mb-3 opacity-40" />
          <p className="text-sm font-medium">No upcoming jobs scheduled</p>
          <p className="text-xs mt-1">Jobs will appear here once scheduled</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {jobs.map(job => {
            const dateStr = job.scheduledDate
              ? new Date(job.scheduledDate).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })
              : "—";
            const dayNum = job.scheduledDate ? new Date(job.scheduledDate).getDate() : "—";
            const monthShort = job.scheduledDate
              ? new Date(job.scheduledDate).toLocaleDateString("en-NZ", { month: "short" })
              : "";
            return (
              <div key={job.id} className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50/60 transition-colors">
                <div className="flex-shrink-0 w-14 text-center">
                  <div className="rounded-xl overflow-hidden shadow-sm border border-gray-200">
                    <div className="py-0.5 text-[9px] font-bold text-white uppercase tracking-wide" style={{ background: NAVY }}>
                      {monthShort}
                    </div>
                    <div className="py-1.5 bg-white">
                      <p className="text-lg font-bold text-gray-800 leading-none">{dayNum}</p>
                    </div>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <JobTypeBadge type={job.jobType} />
                    <StatusBadge status={job.status} />
                  </div>
                  <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
                    <User className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    {getTeamName(job.teamId)}
                    {job.estimatedTimeMins && (
                      <><span className="text-gray-300 mx-0.5">·</span>
                      <Clock className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      {job.estimatedTimeMins} min</>
                    )}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Works History tab ────────────────────────────────────────────────────────

interface WorksRow {
  id: string; date: string; jobType: string; reactive: boolean;
  team: string; actualMins?: number | null; estimatedMins?: number | null;
  status: string; notes?: string | null; hasPhotos?: boolean;
}

function PhotoPanel({ jobId }: { jobId: string }) {
  const [photos, setPhotos]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<any | null>(null);

  useEffect(() => {
    fetch(`/api/jobs/${jobId}/photos`, { credentials: "include" })
      .then(r => r.json())
      .then(d => setPhotos(d.data ?? []))
      .catch(() => setPhotos([]))
      .finally(() => setLoading(false));
  }, [jobId]);

  if (loading) return (
    <div className="flex items-center gap-2 text-[11px] text-gray-400 py-1">
      <Loader2 className="w-3 h-3 animate-spin" />Loading photos…
    </div>
  );

  if (photos.length === 0) return (
    <p className="text-[11px] text-gray-400 italic flex items-center gap-1.5">
      <Camera className="w-3 h-3" />No photos attached to this visit
    </p>
  );

  return (
    <>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1">
        <ImageIcon className="w-3 h-3" />Photos ({photos.length})
      </p>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((p: any) => (
          <button key={p.id} onClick={() => setLightbox(p)}
            className="rounded-lg overflow-hidden border border-gray-200 hover:border-teal-400 hover:shadow-sm transition-all text-left group">
            <div className="bg-gray-100">
              <img src={p.blobUrl} alt={p.caption || "Photo"} className="w-full object-contain group-hover:opacity-90 transition-opacity" />
            </div>
            {p.caption && <p className="px-1.5 py-1 text-[9px] text-gray-500 leading-tight truncate">{p.caption}</p>}
          </button>
        ))}
      </div>
      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setLightbox(null)}>
          <div className="max-w-lg w-full mx-4 rounded-2xl overflow-hidden shadow-2xl bg-white" onClick={e => e.stopPropagation()}>
            <img src={lightbox.blobUrl} alt={lightbox.caption || "Photo"} className="w-full object-contain max-h-[80vh]" />
            <div className="px-4 py-3 flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700">{lightbox.caption || ""}</p>
              <button onClick={() => setLightbox(null)} className="text-gray-400 hover:text-gray-700">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function WorksHistoryTab({ assetId, getTeamName }: { assetId: string; getTeamName: (id?: string | null) => string }) {
  const [rows, setRows]           = useState<WorksRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [expanded, setExpanded]   = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/jobs?assetId=${assetId}&status=completed,skipped&limit=100`, { credentials: "include" }).then(r => r.json()),
      fetch(`/api/reactive-jobs?assetId=${assetId}&status=completed,cancelled&limit=100`, { credentials: "include" }).then(r => r.json()),
    ])
      .then(([jobsData, reactiveData]) => {
        const jobRows: WorksRow[] = (jobsData.data ?? []).map((j: any) => ({
          id:            j.id,
          date:          j.completedAt ?? j.scheduledDate,
          jobType:       j.jobType,
          reactive:      false,
          team:          getTeamName(j.teamId),
          actualMins:    j.actualTimeMins,
          estimatedMins: j.estimatedTimeMins,
          status:        j.status,
          notes:         j.notes,
        }));
        const reactiveRows: WorksRow[] = (reactiveData.data ?? []).map((r: any) => ({
          id:            r.id,
          date:          r.completedAt ?? r.raisedAt,
          jobType:       r.issueType ?? "Reactive",
          reactive:      true,
          team:          getTeamName(r.assignedTeamId),
          actualMins:    r.actualTimeMins,
          estimatedMins: null,
          status:        r.status,
          notes:         r.description,
        }));
        const all = [...jobRows, ...reactiveRows].sort((a, b) => {
          const ad = a.date ? new Date(a.date).getTime() : 0;
          const bd = b.date ? new Date(b.date).getTime() : 0;
          return bd - ad;
        });
        setRows(all);
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [assetId]);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-6 py-4 border-b bg-gray-50">
        <p className="text-sm font-semibold text-gray-800">Completed Works</p>
        <p className="text-xs text-gray-400 mt-0.5">{rows.length} record{rows.length !== 1 ? "s" : ""} — scheduled &amp; reactive jobs</p>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Wrench className="w-8 h-8 mb-3 opacity-40" />
          <p className="text-sm font-medium">No completed works yet</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {rows.map(row => {
            const isOpen = expanded === row.id;
            const dateFormatted = row.date
              ? new Date(row.date).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })
              : "—";
            const over  = (row.actualMins ?? 0) > (row.estimatedMins ?? row.actualMins ?? 0);
            const delta = row.estimatedMins != null && row.actualMins != null
              ? Math.abs(row.actualMins - row.estimatedMins)
              : null;
            return (
              <div key={row.id}>
                <button
                  onClick={() => setExpanded(isOpen ? null : row.id)}
                  className="w-full px-6 py-4 flex items-start gap-4 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex-shrink-0 w-20">
                    <p className="text-[12px] font-bold text-gray-800 leading-tight">
                      {row.date ? new Date(row.date).toLocaleDateString("en-NZ", { day: "numeric", month: "short" }) : "—"}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {row.date ? new Date(row.date).getFullYear() : ""}
                    </p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <JobTypeBadge type={row.jobType} reactive={row.reactive} />
                      <StatusBadge status={row.status} />
                    </div>
                    <p className="text-[11px] text-gray-500">{row.team || "—"}</p>
                  </div>
                  {delta != null && (
                    <div className="flex-shrink-0 text-right mr-2">
                      <p className={`text-[11px] font-bold ${over ? "text-red-500" : "text-green-600"}`}>
                        {over ? `+${delta}` : `-${delta}`} min
                      </p>
                      <p className="text-[10px] text-gray-400">{row.actualMins} / {row.estimatedMins}</p>
                    </div>
                  )}
                  <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform mt-0.5 ${isOpen ? "rotate-180" : ""}`} />
                </button>

                {isOpen && (
                  <div className="px-6 pb-5 pt-2 bg-gray-50 border-t border-gray-100">
                    {row.notes && (
                      <div className="mb-3 flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100">
                        <Info className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <p className="text-[11px] text-amber-800 leading-relaxed">{row.notes}</p>
                      </div>
                    )}
                    {!row.reactive && <PhotoPanel jobId={row.id} />}
                    {row.reactive && (
                      <p className="text-[11px] text-gray-400 italic flex items-center gap-1.5">
                        <Camera className="w-3 h-3" />Photo upload not available for reactive jobs
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Field Changes tab ────────────────────────────────────────────────────────

interface HistoryEntry {
  id: string; action: string; changedAt: string; changedByName: string;
  changes: Array<{ field: string; label: string; old: any; new: any }>;
}

function FieldChangesTab({ assetId }: { assetId: string }) {
  const [history, setHistory]   = useState<HistoryEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const { toast }               = useToast();

  useEffect(() => {
    fetch(`/api/assets/${assetId}/history`, { credentials: "include" })
      .then(r => r.json())
      .then(setHistory)
      .catch(() => toast({ title: "Failed to load history", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [assetId]);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-6 py-4 border-b bg-gray-50">
        <p className="text-sm font-semibold text-gray-800">Asset Edits</p>
        <p className="text-xs text-gray-400 mt-0.5">Changes to core asset details</p>
      </div>

      {history.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <History className="w-8 h-8 mb-3 opacity-40" />
          <p className="text-sm font-medium">No changes recorded yet</p>
        </div>
      ) : (
        <div className="px-6 py-5 space-y-3">
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
  );
}

// ─── Edit form ────────────────────────────────────────────────────────────────

type EditForm = {
  name: string; description: string; gardenType: string; standard: string; areaM2: string;
  serviceTimeMins: string; frequency: string; siteType: string; ward: string;
  teamId: string; suburb: string; streetAddress: string; notes: string;
};

function EditPanel({
  asset, teams, onCancel, onSaved,
}: {
  asset: any;
  teams: any[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditForm>({
    name:            asset.name || "",
    description:     asset.description || "",
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
    notes:           asset.notes || "",
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
        description:     form.description    || null,
        suburb:          form.suburb        || null,
        streetAddress:   form.streetAddress || null,
        notes:           form.notes         || null,
      };
      const r = await fetch(`/api/assets/${asset.id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(await r.text());
      toast({ title: "Asset updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: getGetAssetQueryKey(asset.id) });
      onSaved();
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 flex items-center justify-between border-b bg-gray-50 flex-shrink-0">
        <p className="text-sm font-semibold text-gray-800">Edit Asset Details</p>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <FormField label="Site Name">
          <Input value={form.name} onChange={e => f("name", e.target.value)} className="text-sm" />
        </FormField>
        <FormField label="Description">
          <Input value={form.description} onChange={e => f("description", e.target.value)} className="text-sm" placeholder="e.g. Carpark garden, Playground garden…" />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
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
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Area (m²)">
            <Input type="number" value={form.areaM2} onChange={e => f("areaM2", e.target.value)} className="text-sm" />
          </FormField>
          <FormField label="Service Time (mins)">
            <Input type="number" value={form.serviceTimeMins} onChange={e => f("serviceTimeMins", e.target.value)} className="text-sm" />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Frequency">
            <Select value={form.frequency} onValueChange={v => f("frequency", v)}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["weekly","fortnightly","monthly","bimonthly","quarterly"].map(v => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
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
        <div className="grid grid-cols-2 gap-3">
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
                {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
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
        <FormField label="Notes">
          <Textarea value={form.notes} onChange={e => f("notes", e.target.value)} className="text-sm" rows={3} />
        </FormField>
      </div>
      <div className="px-5 py-4 border-t bg-gray-50 flex items-center justify-end gap-2 flex-shrink-0">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={saving} style={{ background: BRAND }} className="text-white">
          {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</> : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<"scheduled" | "history" | "changes">("history");

  const { data: asset, isLoading } = useGetAsset(id!, {
    query: { enabled: !!id, queryKey: getGetAssetQueryKey(id!) },
  });
  const { data: teamsData } = useListTeams({ query: { queryKey: getListTeamsQueryKey() } });

  const getTeamName = useCallback((teamId?: string | null) => {
    if (!teamId || !teamsData) return "Unassigned";
    return teamsData.find(t => t.id === teamId)?.name || "Unassigned";
  }, [teamsData]);

  const [scheduledCount, setScheduledCount]   = useState<number | null>(null);
  const [historyCount, setHistoryCount]       = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/jobs?assetId=${id}&status=pending,in_progress,overdue&limit=50`, { credentials: "include" })
      .then(r => r.json()).then(d => setScheduledCount((d.data ?? []).length)).catch(() => {});
    Promise.all([
      fetch(`/api/jobs?assetId=${id}&status=completed,skipped&limit=100`, { credentials: "include" }).then(r => r.json()),
      fetch(`/api/reactive-jobs?assetId=${id}&status=completed,cancelled&limit=100`, { credentials: "include" }).then(r => r.json()),
    ]).then(([j, r]) => setHistoryCount((j.data?.length ?? 0) + (r.data?.length ?? 0))).catch(() => {});
  }, [id]);

  const tabs = [
    { id: "scheduled", icon: CalendarCheck, label: "Scheduled Jobs", count: scheduledCount },
    { id: "history",   icon: Wrench,        label: "Works History",  count: historyCount },
    { id: "changes",   icon: History,       label: "Asset Edits",    count: null },
  ] as const;

  if (isLoading || !asset) {
    return (
      <div className="flex-1 flex flex-col bg-[#f5f7f9]">
        <div className="bg-white border-b px-6 py-3">
          <Skeleton className="h-5 w-64" />
        </div>
        <div className="flex flex-1 min-h-0 p-8 gap-6">
          <Skeleton className="w-[368px] h-full rounded-xl" />
          <Skeleton className="flex-1 h-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#f5f7f9]">
      {/* Breadcrumb */}
      <header className="bg-white border-b px-6 py-3 flex items-center gap-3 flex-shrink-0 z-10">
        <Link href="/assets">
          <button className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
            <ArrowLeft className="w-4 h-4" />Asset Register
          </button>
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-semibold text-gray-800 truncate">{asset.name}</span>
      </header>

      {/* Two-column layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: asset info / edit panel */}
        <div className="w-[368px] flex-shrink-0 flex flex-col bg-white overflow-hidden" style={{ borderRight: "1px solid #e5e7eb" }}>
          {editing ? (
            <EditPanel
              asset={asset}
              teams={teamsData ?? []}
              onCancel={() => setEditing(false)}
              onSaved={() => setEditing(false)}
            />
          ) : (
            <div className="flex flex-col h-full overflow-y-auto">
              {/* Identity header */}
              <div className="px-5 py-5 flex-shrink-0" style={{ background: NAVY }}>
                <h2 className="text-base font-bold text-white leading-snug">{asset.name}</h2>
                {asset.description && (
                  <p className="text-[11px] text-white/60 mt-1 leading-snug">{asset.description}</p>
                )}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  <Badge className={`text-[10px] border-0 capitalize ${TYPE_COLORS[asset.gardenType] ?? "bg-gray-100 text-gray-700"}`}>
                    {asset.gardenType.replace(/_/g, " ")}
                  </Badge>
                  <Badge className={`text-[10px] border-0 capitalize ${STANDARD_COLORS[asset.standard]}`}>
                    {asset.standard} Standard
                  </Badge>
                  <Badge variant="outline" className="text-[10px] text-white/70 border-white/20 bg-white/5">
                    {getTeamName(asset.teamId)}
                  </Badge>
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-px bg-gray-200 border-b flex-shrink-0">
                {[
                  { icon: Ruler,        label: "Area",      value: `${asset.areaM2} m²` },
                  { icon: Clock,        label: "Service",   value: `${asset.serviceTimeMins} min` },
                  { icon: CalendarDays, label: "Frequency", value: asset.frequency },
                  { icon: Tag,          label: "Site Type", value: (asset as any).siteType || "—" },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="px-4 py-3 bg-white">
                    <p className="text-[9px] text-gray-400 uppercase tracking-wide flex items-center gap-1">
                      <Icon className="w-2.5 h-2.5" />{label}
                    </p>
                    <p className="text-[12px] font-semibold text-gray-800 mt-0.5 capitalize">{value}</p>
                  </div>
                ))}
              </div>

              {/* Map */}
              {(asset.lat || (asset as any).boundary) && <AssetMap asset={asset} />}

              {/* Classification */}
              <div className="px-5 py-4 border-b">
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-3">Classification</p>
                <div className="space-y-2">
                  {[
                    { label: "Ward",    value: asset.ward },
                    { label: "Suburb",  value: asset.suburb },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-[11px] text-gray-400">{label}</span>
                      <span className="text-[11px] font-semibold text-gray-700 capitalize">{value || "—"}</span>
                    </div>
                  ))}
                  {asset.routeOrder != null && (
                    <div className="flex justify-between">
                      <span className="text-[11px] text-gray-400">Geosequence</span>
                      <span className="text-[11px] font-semibold text-gray-700">{asset.routeOrder}</span>
                    </div>
                  )}
                  {(asset as any).globalId && (
                    <div className="flex justify-between">
                      <span className="text-[11px] text-gray-400">Global ID</span>
                      <span className="text-[10px] font-mono text-gray-500 break-all text-right max-w-[160px]">{(asset as any).globalId}</span>
                    </div>
                  )}
                  {asset.lat != null && (
                    <div className="flex justify-between">
                      <span className="text-[11px] text-gray-400">Coordinates</span>
                      <span className="text-[10px] font-mono text-gray-500">{Number(asset.lat).toFixed(4)}, {Number(asset.lng).toFixed(4)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              {asset.notes && (
                <div className="px-5 py-4 border-b">
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">Notes</p>
                  <div className="bg-gray-50 rounded-lg p-3 text-[11px] text-gray-700 border border-gray-100 whitespace-pre-wrap leading-relaxed">
                    {asset.notes}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="px-5 py-4 mt-auto flex-shrink-0 border-t bg-gray-50 sticky bottom-0 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 text-gray-500 border-gray-300 hover:bg-gray-100 text-xs px-3 h-8"
                >
                  <Pencil className="w-3 h-3" />Edit
                </Button>
                <Button
                  size="sm"
                  onClick={() => navigate(`/audits/new?assetId=${asset.id}`)}
                  className="flex items-center gap-1.5 text-white text-xs px-3 h-8 flex-1"
                  style={{ background: BRAND }}
                >
                  <ClipboardCheck className="w-3.5 h-3.5" />Audit Asset
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Right: tabbed content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white">
          {/* Tab bar */}
          <div className="flex border-b px-6 bg-white flex-shrink-0">
            {tabs.map(({ id: tabId, icon: Icon, label, count }) => (
              <button key={tabId}
                onClick={() => setActiveTab(tabId)}
                className={`flex items-center gap-2 px-4 py-3.5 text-[12px] font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tabId ? "border-[#00AECD] text-[#00AECD]" : "border-transparent text-gray-400 hover:text-gray-600"
                }`}>
                <Icon className="w-3.5 h-3.5" />
                {label}
                {count != null && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === tabId ? "bg-teal-100 text-teal-700" : "bg-gray-100 text-gray-500"}`}>
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {activeTab === "scheduled" && (
              <ScheduledJobsTab key={`sched-${id}`} assetId={id!} getTeamName={getTeamName} />
            )}
            {activeTab === "history" && (
              <WorksHistoryTab key={`hist-${id}`} assetId={id!} getTeamName={getTeamName} />
            )}
            {activeTab === "changes" && (
              <FieldChangesTab key={`changes-${id}`} assetId={id!} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
