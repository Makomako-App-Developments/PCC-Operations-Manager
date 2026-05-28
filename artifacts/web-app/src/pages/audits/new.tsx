import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { useListAssets, useListTeams, useCreateAudit, useSaveAuditResponses } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, MapPin, Locate, X, CheckCircle2, XCircle, MinusCircle, ChevronDown, ChevronUp } from "lucide-react";
import { KPI_SECTIONS, ALL_KPIS, ResponseState, KpiResult, emptyResponse, calcAuditScore } from "./kpi-config";
import { format } from "date-fns";
import { MapContainer, TileLayer, Marker, useMapEvents, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png", iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png", shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png" });

function MapClickHandler({ onPin }: { onPin: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPin(e.latlng.lat, e.latlng.lng) });
  return null;
}

function BoundaryFit({ boundary }: { boundary: any }) {
  const map = useMap();
  useEffect(() => {
    if (!boundary) return;
    try {
      const layer = L.geoJSON(boundary);
      const bounds = layer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24] });
    } catch {}
  }, [boundary, map]);
  return null;
}

interface PinMapModalProps {
  onConfirm: (lat: number, lng: number) => void;
  onClose: () => void;
  initial?: { lat: number; lng: number };
  assetBoundary?: any;
}
function PinMapModal({ onConfirm, onClose, initial, assetBoundary }: PinMapModalProps) {
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(initial ?? null);
  const center: [number, number] = initial ? [initial.lat, initial.lng] : [-41.09, 174.87];
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <p className="font-semibold text-gray-900">Drop Pin on Map</p>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
        <p className="text-xs text-gray-500 px-5 py-2">Click anywhere on the map to drop a pin.</p>
        <div className="h-64">
          <MapContainer center={center} zoom={16} style={{ height: "100%", width: "100%" }}>
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="Esri" maxZoom={19} />
            <MapClickHandler onPin={(lat, lng) => setPin({ lat, lng })} />
            {assetBoundary && (
              <>
                <GeoJSON key={JSON.stringify(assetBoundary)} data={assetBoundary} style={{ color: "#00AECD", weight: 2.5, fillColor: "#00AECD", fillOpacity: 0.12 }} />
                <BoundaryFit boundary={assetBoundary} />
              </>
            )}
            {pin && <Marker position={[pin.lat, pin.lng]} />}
          </MapContainer>
        </div>
        <div className="px-5 py-4 flex items-center justify-between border-t">
          {pin ? (
            <p className="text-xs text-gray-500 font-mono">{pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}</p>
          ) : (
            <p className="text-xs text-gray-400">No pin dropped yet</p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" className="bg-[#00AECD] hover:bg-[#0097b2] text-white" disabled={!pin} onClick={() => { if (pin) { onConfirm(pin.lat, pin.lng); onClose(); } }}>
              Confirm
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface KpiCardProps {
  kpi: typeof ALL_KPIS[0];
  state: ResponseState;
  onChange: (s: ResponseState) => void;
  showError: boolean;
  assetBoundary?: any;
}
function KpiCard({ kpi, state, onChange, showError, assetBoundary }: KpiCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pinModal, setPinModal] = useState(false);
  const [locating, setLocating] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const set = useCallback((patch: Partial<ResponseState>) => onChange({ ...state, ...patch }), [state, onChange]);

  const hasFailWithoutPhoto = state.result === "fail" && state.photos.length === 0 && state.existingPhotos.length === 0;
  const error = showError && hasFailWithoutPhoto;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const total = state.photos.length + state.existingPhotos.length;
    const remaining = Math.max(0, 5 - total);
    set({ photos: [...state.photos, ...files.slice(0, remaining)] });
    e.target.value = "";
  };

  const captureGps = () => {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { set({ failLat: pos.coords.latitude, failLng: pos.coords.longitude }); setLocating(false); },
      () => { setLocating(false); },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const resultBtn = (r: Exclude<KpiResult, null>, label: string, icon: React.ReactNode, activeClass: string) => (
    <button
      type="button"
      onClick={() => set({ result: r })}
      className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full border-2 text-sm font-semibold transition-all ${state.result === r ? activeClass : "border-gray-200 text-gray-400 bg-white"}`}
    >
      {icon} {label}
    </button>
  );

  return (
    <div className={`bg-white rounded-2xl border-2 shadow-sm transition-colors ${error ? "border-red-300" : state.result === "pass" ? "border-green-200" : state.result === "fail" ? "border-red-200" : "border-gray-100"}`}>
      <div className="flex items-start justify-between px-5 py-4 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <div className="flex-1 pr-4">
          <p className="font-semibold text-gray-900">{kpi.label}</p>
          {!expanded && state.result && (
            <span className={`text-xs font-bold uppercase ${state.result === "pass" ? "text-green-600" : state.result === "fail" ? "text-red-600" : "text-gray-400"}`}>
              {state.result.toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {state.result === "pass" && <CheckCircle2 className="w-5 h-5 text-green-500" />}
          {state.result === "fail" && <XCircle className="w-5 h-5 text-red-500" />}
          {state.result === "na" && <MinusCircle className="w-5 h-5 text-gray-400" />}
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-gray-50 pt-4">
          <p className="text-sm text-gray-500 leading-relaxed">{kpi.description}</p>

          {/* Result buttons */}
          <div className="flex flex-wrap gap-2">
            {resultBtn("pass", "Pass", <CheckCircle2 className="w-4 h-4" />, "border-green-400 bg-green-50 text-green-700")}
            {resultBtn("fail", "Fail", <XCircle className="w-4 h-4" />, "border-red-400 bg-red-50 text-red-700")}
            {kpi.allowNA && resultBtn("na", "N/A", <MinusCircle className="w-4 h-4" />, "border-gray-300 bg-gray-50 text-gray-600")}
          </div>

          {error && (
            <p className="text-xs text-red-600 font-medium">⚠ A photo is required for all Fail responses.</p>
          )}

          {/* Comment */}
          <div>
            <label className="text-xs text-gray-500 font-medium block mb-1">Comments</label>
            <Textarea
              placeholder="Add observations..."
              rows={2}
              value={state.notes}
              onChange={(e) => set({ notes: e.target.value })}
              className="text-sm resize-none"
            />
          </div>

          {/* Photos */}
          <div>
            <label className="text-xs text-gray-500 font-medium block mb-2">
              Photos (Max 5) {state.result === "fail" && <span className="text-red-500">*</span>}
            </label>
            <div className="flex flex-wrap gap-2">
              {state.photos.map((f, i) => (
                <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                  <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => set({ photos: state.photos.filter((_, j) => j !== i) })}
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
              {(state.photos.length + state.existingPhotos.length) < 5 && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-[#00AECD] hover:text-[#00AECD] transition-colors"
                >
                  <Camera className="w-5 h-5" />
                  <span className="text-[10px]">Add Photo</span>
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={handleFile} />
          </div>

          {/* Fail location (only for fails) */}
          {state.result === "fail" && (
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-2">Fail Location</label>
              <div className="flex flex-wrap items-center gap-2">
                {state.failLat != null ? (
                  <>
                    <span className="inline-flex items-center gap-1.5 text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-3 py-1 font-medium">
                      <MapPin className="w-3 h-3" /> Location captured
                    </span>
                    <span className="text-xs text-gray-400 font-mono">{state.failLat.toFixed(5)}, {state.failLng?.toFixed(5)}</span>
                    <button type="button" onClick={() => set({ failLat: null, failLng: null })} className="text-gray-400 hover:text-red-500">
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <Button type="button" variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={captureGps} disabled={locating}>
                      <Locate className="w-3.5 h-3.5" /> {locating ? "Locating..." : "Use My Location"}
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setPinModal(true)}>
                      <MapPin className="w-3.5 h-3.5" /> Drop Pin on Map
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {pinModal && (
        <PinMapModal
          onConfirm={(lat, lng) => set({ failLat: lat, failLng: lng })}
          onClose={() => setPinModal(false)}
          initial={state.failLat != null ? { lat: state.failLat, lng: state.failLng! } : undefined}
          assetBoundary={assetBoundary}
        />
      )}
    </div>
  );
}

export default function NewAudit() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { user } = useAuth();
  const { data: assetsData } = useListAssets({ limit: 2000 });
  const { data: teamsData } = useListTeams();

  const [assetSearch, setAssetSearch] = useState("");
  const [assetOpen, setAssetOpen] = useState(false);
  const prefilledAssetId = new URLSearchParams(window.location.search).get("assetId") ?? "";
  const [assetId, setAssetId] = useState(prefilledAssetId);
  const [conductedAt, setConductedAt] = useState(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [responses, setResponses] = useState<Record<string, ResponseState>>(() =>
    Object.fromEntries(ALL_KPIS.map((k) => [k.key, emptyResponse()])),
  );
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const assets = (assetsData?.data ?? []) as Record<string, any>[];
  const teams = (teamsData ?? []) as { id: string; name: string }[];

  const selectedAsset = assets.find((a) => a.id === assetId);

  const filteredAssets = assets.filter((a) => {
    const q = assetSearch.toLowerCase();
    return !q || a.name?.toLowerCase().includes(q) || a.description?.toLowerCase().includes(q);
  }).slice(0, 50);

  const score = calcAuditScore(responses);
  const answered = ALL_KPIS.filter((k) => responses[k.key]?.result != null).length;

  const createMutation = useCreateAudit();
  const saveMutation = useSaveAuditResponses();

  const handleSubmit = async () => {
    if (!assetId) { toast({ title: "Please select a site", variant: "destructive" }); return; }

    // Check all KPIs answered
    const unanswered = ALL_KPIS.filter((k) => responses[k.key]?.result == null);
    if (unanswered.length > 0) {
      toast({ title: `${unanswered.length} KPI${unanswered.length > 1 ? "s" : ""} not yet answered`, variant: "destructive" });
      setShowErrors(true);
      return;
    }

    // Check fails have photos
    const failsWithoutPhotos = ALL_KPIS.filter((k) => responses[k.key]?.result === "fail" && responses[k.key]?.photos.length === 0 && responses[k.key]?.existingPhotos.length === 0);
    if (failsWithoutPhotos.length > 0) {
      toast({ title: "All Fail responses require at least one photo", description: failsWithoutPhotos.map((k) => k.label).join(", "), variant: "destructive" });
      setShowErrors(true);
      return;
    }

    setSubmitting(true);
    try {
      const teamId = selectedAsset?.teamId ?? null;

      // 1. Create audit
      const audit = await createMutation.mutateAsync({
        data: { assetId, teamId, conductedAt: new Date(conductedAt).toISOString() } as any,
      });
      const auditId = (audit as any).id;

      // 2. Save responses (override auditorId via header workaround - auditorId set server-side)
      const responseArray = ALL_KPIS.map((k) => {
        const r = responses[k.key];
        return {
          criterion: k.key,
          result: r.result as string,
          notes: r.notes || undefined,
          failLat: r.failLat ?? undefined,
          failLng: r.failLng ?? undefined,
        };
      });
      const detail = await saveMutation.mutateAsync({ id: auditId, data: { responses: responseArray } as any }) as any;

      // 3. Upload photos
      const uploadPromises: Promise<void>[] = [];
      for (const kpi of ALL_KPIS) {
        const r = responses[kpi.key];
        if (!r.photos.length) continue;
        const item = detail?.items?.find((i: any) => i.criterion === kpi.key);
        if (!item) continue;
        for (const file of r.photos) {
          const fd = new FormData();
          fd.append("photo", file);
          uploadPromises.push(
            fetch(`/api/audits/${auditId}/items/${item.id}/photos`, { method: "POST", body: fd, credentials: "include" }).then(() => {}),
          );
        }
      }
      await Promise.all(uploadPromises);

      await qc.invalidateQueries({ queryKey: ["/api/audits"] });
      toast({ title: "Audit submitted successfully" });
      navigate(`/audits/${auditId}`);
    } catch (e: any) {
      toast({ title: "Failed to submit audit", description: e?.message ?? "Unknown error", variant: "destructive" });
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f5f7f9]">
      {/* Header */}
      <header className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="gap-1.5 text-gray-500" onClick={() => navigate("/audits")}>
            <ArrowLeft className="w-4 h-4" /> Back to Results
          </Button>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="text-xs text-gray-400">Score</p>
            <p className={`text-lg font-bold ${score == null ? "text-gray-300" : score >= 80 ? "text-green-600" : score >= 60 ? "text-amber-600" : "text-red-600"}`}>
              {score != null ? `${score}%` : "—"}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400">Answered</p>
            <p className="text-lg font-bold text-gray-700">{answered}/{ALL_KPIS.length}</p>
          </div>
          <Button
            className="bg-[#00AECD] hover:bg-[#0097b2] text-white gap-1.5 h-9 text-sm"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "Submitting..." : "Submit Audit"}
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
          {/* Title */}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Garden Baseline Audit</h1>
            <p className="text-sm text-gray-400 mt-1">{format(new Date(), "d MMMM yyyy")} · Score: {score != null ? `${score}%` : "0%"}</p>
          </div>

          {/* Site Information */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Site Information</h2>
              <p className="text-xs text-gray-400 mt-0.5">Search and select the garden site, then fill in audit details</p>
            </div>

            {/* Asset combobox */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Garden Site <span className="text-red-500">*</span></label>
              <div className="relative">
                <input
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#00AECD] cursor-pointer"
                  placeholder="Search by name or description..."
                  value={assetOpen ? assetSearch : (selectedAsset?.name ?? "")}
                  onFocus={() => { setAssetOpen(true); setAssetSearch(""); }}
                  onChange={(e) => setAssetSearch(e.target.value)}
                  onBlur={() => setTimeout(() => setAssetOpen(false), 150)}
                />
                {assetOpen && (
                  <div className="absolute z-20 mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-lg max-h-52 overflow-auto">
                    {filteredAssets.length === 0 ? (
                      <p className="text-sm text-gray-400 px-4 py-3">No results</p>
                    ) : filteredAssets.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors"
                        onMouseDown={() => { setAssetId(a.id); setAssetOpen(false); }}
                      >
                        <span className="font-medium text-gray-900">{a.name}</span>
                        {a.description && <span className="text-gray-400 ml-2 text-xs">{a.description}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Asset info card */}
            {selectedAsset && (
              <div className="bg-[#f0fafe] border border-[#00AECD]/20 rounded-xl p-4 text-sm space-y-2">
                <p className="font-semibold text-[#00AECD]">{selectedAsset.name}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {selectedAsset.description && <><span className="text-gray-500">Description:</span><span className="text-gray-800">{selectedAsset.description}</span></>}
                  {selectedAsset.standard && <><span className="text-gray-500">Specification:</span><span className="text-gray-800 capitalize">{selectedAsset.standard}</span></>}
                  {selectedAsset.gardenType && <><span className="text-gray-500">Garden Type:</span><span className="text-gray-800 capitalize">{selectedAsset.gardenType.replace(/_/g, " ")}</span></>}
                  {selectedAsset.suburb && <><span className="text-gray-500">Suburb:</span><span className="text-gray-800">{selectedAsset.suburb}</span></>}
                </div>
              </div>
            )}

            {/* Mini map */}
            {selectedAsset?.lat && selectedAsset?.lng && (
              <div className="rounded-xl overflow-hidden border border-gray-200 h-48">
                <MapContainer center={[Number(selectedAsset.lat), Number(selectedAsset.lng)]} zoom={17} style={{ height: "100%", width: "100%" }} zoomControl>
                  <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="Esri" maxZoom={19} />
                  <Marker position={[Number(selectedAsset.lat), Number(selectedAsset.lng)]} />
                </MapContainer>
              </div>
            )}

            {/* Auditor (auto-set to logged-in user) */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Auditor</label>
              <div className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 text-gray-700 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#00AECD] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {(user?.name ?? user?.email ?? "?")[0].toUpperCase()}
                </span>
                {user?.name ?? user?.email ?? "You"}
                <span className="ml-auto text-xs text-gray-400 italic">auto-assigned</span>
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Date & Time</label>
              <input
                type="datetime-local"
                value={conductedAt}
                onChange={(e) => setConductedAt(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#00AECD]"
              />
            </div>
          </div>

          {/* KPI Sections */}
          {KPI_SECTIONS.map((section) => (
            <div key={section.title}>
              <h2 className="text-base font-bold text-[#00AECD] mb-3">{section.title}</h2>
              <div className="space-y-3">
                {section.kpis.map((kpi) => (
                  <KpiCard
                    key={kpi.key}
                    kpi={kpi}
                    state={responses[kpi.key]}
                    onChange={(s) => setResponses((prev) => ({ ...prev, [kpi.key]: s }))}
                    showError={showErrors}
                    assetBoundary={selectedAsset?.boundary}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Submit */}
          <div className="pb-8">
            <Button
              className="w-full bg-[#00AECD] hover:bg-[#0097b2] text-white h-11 text-base font-semibold"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "Submitting Audit..." : "Submit Audit"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
