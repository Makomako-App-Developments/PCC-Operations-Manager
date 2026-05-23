import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Clock } from "lucide-react";

const API = (path: string) => fetch(path, { credentials: "include" });

interface SystemSettings {
  id: number;
  productiveTimeMins: number;
  standardCrewSize: number;
  routesLastOptimised: string | null;
  updatedAt: string;
}

export default function ProductiveTimePage() {
  const [settings, setSettings]       = useState<SystemSettings | null>(null);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);

  // Editable form state (hours)
  const [hoursPerDay, setHoursPerDay] = useState("");
  const [crewSize, setCrewSize]       = useState("");

  const { toast } = useToast();

  useEffect(() => {
    API("/api/settings")
      .then(r => r.json())
      .then((d: SystemSettings) => {
        setSettings(d);
        setHoursPerDay(String((d.productiveTimeMins / 60).toFixed(1)));
        setCrewSize(String(d.standardCrewSize));
      })
      .catch(() => {
        toast({ title: "Failed to load settings", variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    const hrs  = parseFloat(hoursPerDay);
    const crew = parseInt(crewSize);
    if (isNaN(hrs) || hrs < 1 || hrs > 10) {
      toast({ title: "Invalid hours", description: "Enter a value between 1 and 10 hours.", variant: "destructive" });
      return;
    }
    if (isNaN(crew) || crew < 1 || crew > 10) {
      toast({ title: "Invalid crew size", description: "Enter a value between 1 and 10.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/settings", {
        method:  "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ productiveTimeMins: Math.round(hrs * 60), standardCrewSize: crew }),
      });
      if (!r.ok) throw new Error(await r.text());
      const updated: SystemSettings = await r.json();
      setSettings(updated);
      toast({ title: "Settings saved", description: `${hrs}h productive time, crew size ${crew}.` });
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

  const currentMins = Math.round(parseFloat(hoursPerDay) * 60) || 0;
  const isDirty =
    settings !== null &&
    (Math.round(parseFloat(hoursPerDay) * 60) !== settings.productiveTimeMins ||
     parseInt(crewSize) !== settings.standardCrewSize);

  return (
    <div className="max-w-2xl mx-auto px-8 py-8 space-y-8">

      {/* Productive time section */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
        <div className="flex items-center gap-2.5 pb-2 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-[#00AECD]/10 flex items-center justify-center">
            <Clock className="w-4 h-4 text-[#00AECD]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Daily Capacity</h2>
            <p className="text-xs text-gray-400">Productive work hours available per team per day</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <Label htmlFor="hours-per-day" className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Productive Hours / Day
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="hours-per-day"
                type="number"
                min="1"
                max="10"
                step="0.5"
                value={hoursPerDay}
                onChange={e => setHoursPerDay(e.target.value)}
                className="text-sm w-24"
              />
              <span className="text-xs text-gray-500">hours</span>
            </div>
            {currentMins > 0 && (
              <p className="text-xs text-gray-400">{currentMins} minutes · tolerance ±5%</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="crew-size" className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Standard Crew Size
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="crew-size"
                type="number"
                min="1"
                max="10"
                step="1"
                value={crewSize}
                onChange={e => setCrewSize(e.target.value)}
                className="text-sm w-24"
              />
              <span className="text-xs text-gray-500">people</span>
            </div>
            <p className="text-xs text-gray-400">All service times calibrated for this crew size</p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">How this works</p>
          <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
            <li>Each team has <strong>{hoursPerDay || "?"} productive hours</strong> available per day ({currentMins || "?"} min)</li>
            <li>The scheduler fills days smallest-jobs-first, then carries overflow to the next working day (up to 5 days)</li>
            <li>A 5% tolerance allows days to reach <strong>{currentMins ? Math.round(currentMins * 1.05) : "?"} min</strong> before carrying forward</li>
            <li>Teams with fewer than {crewSize || "?"} crew get proportionally adjusted job times</li>
          </ul>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="gap-2 text-white"
            style={{ background: "#00AECD" }}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? "Saving…" : isDirty ? "Save Changes" : "Saved"}
          </Button>
        </div>
      </section>
    </div>
  );
}
