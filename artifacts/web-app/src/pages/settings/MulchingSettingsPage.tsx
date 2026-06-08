import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Layers } from "lucide-react";

const BRAND = "#00AECD";

interface SystemSettings {
  id: number;
  mulchDecayRateMmPerMonth: number;
  mulchSpreadingRateM3PerHour: number;
  updatedAt: string;
}

export default function MulchingSettingsPage() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);

  const [decayRate, setDecayRate]       = useState("");
  const [spreadingRate, setSpreadingRate] = useState("");

  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/settings", { credentials: "include" })
      .then(r => r.json())
      .then((d: SystemSettings) => {
        setSettings(d);
        setDecayRate(String(d.mulchDecayRateMmPerMonth ?? 5));
        setSpreadingRate(String(d.mulchSpreadingRateM3PerHour ?? 2));
      })
      .catch(() => toast({ title: "Failed to load settings", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    const decay    = parseFloat(decayRate);
    const spreading = parseFloat(spreadingRate);
    if (isNaN(decay) || decay < 0.1 || decay > 50) {
      toast({ title: "Invalid decay rate", description: "Enter a value between 0.1 and 50 mm/month.", variant: "destructive" });
      return;
    }
    if (isNaN(spreading) || spreading < 0.1 || spreading > 20) {
      toast({ title: "Invalid spreading rate", description: "Enter a value between 0.1 and 20 m³/hr.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mulchDecayRateMmPerMonth:   decay,
          mulchSpreadingRateM3PerHour: spreading,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const updated: SystemSettings = await r.json();
      setSettings(updated);
      toast({ title: "Mulching settings saved" });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  const isDirty = settings !== null && (
    parseFloat(decayRate)    !== settings.mulchDecayRateMmPerMonth ||
    parseFloat(spreadingRate) !== settings.mulchSpreadingRateM3PerHour
  );

  const decayVal    = parseFloat(decayRate) || 0;
  const spreadVal   = parseFloat(spreadingRate) || 0;

  return (
    <div className="max-w-2xl mx-auto px-8 py-8 space-y-8">

      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
        <div className="flex items-center gap-2.5 pb-2 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${BRAND}1a` }}>
            <Layers className="w-4 h-4" style={{ color: BRAND }} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Mulching Parameters</h2>
            <p className="text-xs text-gray-400">Factors used to project top-up schedules and estimate job durations</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Decay rate */}
          <div className="space-y-1.5">
            <Label htmlFor="decay-rate" className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Default Decay Rate
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="decay-rate"
                type="number"
                min="0.1"
                max="50"
                step="0.5"
                value={decayRate}
                onChange={e => setDecayRate(e.target.value)}
                className="text-sm w-24"
              />
              <span className="text-xs text-gray-500">mm / month</span>
            </div>
            <p className="text-xs text-gray-400">
              Applied when mulch type is unspecified. Per-type rates (e.g. Bark Mulch 4 mm/month, Compost 7 mm/month) still take precedence.
            </p>
          </div>

          {/* Spreading rate */}
          <div className="space-y-1.5">
            <Label htmlFor="spreading-rate" className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Spreading Rate
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="spreading-rate"
                type="number"
                min="0.1"
                max="20"
                step="0.1"
                value={spreadingRate}
                onChange={e => setSpreadingRate(e.target.value)}
                className="text-sm w-24"
              />
              <span className="text-xs text-gray-500">m³ / hr (crew of 2)</span>
            </div>
            <p className="text-xs text-gray-400">
              Used to auto-calculate estimated job duration from required volume when a new depth reading is recorded.
            </p>
          </div>
        </div>

        {/* Explanation box */}
        <div className="bg-gray-50 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">How these are used</p>
          <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
            <li>
              <strong>Decay rate ({decayVal || "?"} mm/month)</strong> — projects when mulch will reach the 50 mm action threshold, setting the draft job date.
            </li>
            <li>
              <strong>Spreading rate ({spreadVal || "?"} m³/hr)</strong> — divides the calculated volume by this rate to estimate how long the job will take.{" "}
              {spreadVal > 0 && (
                <span>Example: 1 m³ job ≈ <strong>{Math.round(60 / spreadVal)} min</strong>.</span>
              )}
            </li>
            <li>Both values can still be overridden manually on individual job records.</li>
          </ul>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="gap-2 text-white"
            style={{ background: BRAND }}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? "Saving…" : isDirty ? "Save Changes" : "Saved"}
          </Button>
        </div>
      </section>

      {/* Per-type reference table */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="pb-2 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Per-Type Decay Reference</h3>
          <p className="text-xs text-gray-400 mt-0.5">Fixed empirical rates used when a specific mulch type is recorded — these are not editable.</p>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-400 uppercase tracking-wide text-left">
              <th className="pb-2 font-semibold">Mulch Type</th>
              <th className="pb-2 font-semibold text-right">Decay Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {[
              { type: "Bark Mulch",  rate: "4 mm/month",   note: "Durable bark chip, slow breakdown" },
              { type: "Wood Chip",   rate: "3 mm/month",   note: "Very durable, coarser chip" },
              { type: "Compost",     rate: "7 mm/month",   note: "Finer material, breaks down faster" },
              { type: "Straw",       rate: "10 mm/month",  note: "Fast decomposer, mostly seasonal" },
              { type: "Pea Gravel",  rate: "0.5 mm/month", note: "Displacement only, near-permanent" },
            ].map(row => (
              <tr key={row.type} className="text-gray-600">
                <td className="py-2">
                  <span className="font-medium text-gray-800">{row.type}</span>
                  <span className="ml-2 text-gray-400">{row.note}</span>
                </td>
                <td className="py-2 text-right font-mono text-gray-700">{row.rate}</td>
              </tr>
            ))}
            <tr className="text-gray-500 bg-gray-50/60">
              <td className="py-2 pl-1 italic">All other / unspecified</td>
              <td className="py-2 text-right font-mono">{decayVal || "?"} mm/month <span className="text-gray-400">(your setting)</span></td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
