import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Route, CheckCircle2, AlertCircle } from "lucide-react";
import { format } from "date-fns";

const API = (path: string) => fetch(path, { credentials: "include" });

interface SystemSettings {
  id: number;
  productiveTimeMins: number;
  standardCrewSize: number;
  routesLastOptimised: string | null;
  updatedAt: string;
}

export default function RouteOptimisationPage() {
  const [settings, setSettings]     = useState<SystemSettings | null>(null);
  const [loading, setLoading]       = useState(true);
  const [optimising, setOptimising] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    API("/api/settings")
      .then(r => r.json())
      .then((d: SystemSettings) => setSettings(d))
      .catch(() => toast({ title: "Failed to load settings", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  const handleOptimise = async () => {
    setOptimising(true);
    try {
      const r = await fetch("/api/assets/optimise-routes", {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setSettings(prev => prev ? { ...prev, routesLastOptimised: data.routesLastOptimised } : prev);
      toast({
        title: "Routes optimised",
        description: `${data.assetsUpdated} assets across ${data.teamsOptimised} teams geosequenced via nearest-neighbour.`,
      });
    } catch {
      toast({ title: "Optimisation failed", variant: "destructive" });
    } finally {
      setOptimising(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-8 py-8">
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
        <div className="flex items-center gap-2.5 pb-2 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
            <Route className="w-4 h-4 text-purple-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Route Optimisation</h2>
            <p className="text-xs text-gray-400">Nearest-neighbour geosequencing per team — rolling daily routes</p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">How this works</p>
          <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
            <li>Each asset is assigned a permanent <strong>route order</strong> position within its team</li>
            <li>The schedule sorts each day's jobs by route order — crews work through the city in a continuous sequence</li>
            <li>Day 2 picks up geographically where Day 1 finished — no backtracking</li>
            <li>Re-run any time assets are added, removed, or reassigned to teams</li>
          </ul>
        </div>

        {settings?.routesLastOptimised ? (
          <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
            Last optimised {format(new Date(settings.routesLastOptimised), "d MMM yyyy 'at' HH:mm")}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            Routes not yet optimised — click below to run the first optimisation
          </div>
        )}

        <div className="flex justify-end">
          <Button
            onClick={handleOptimise}
            disabled={optimising}
            variant="outline"
            className="gap-2 border-purple-200 text-purple-700 hover:bg-purple-50"
          >
            {optimising ? <Loader2 className="w-4 h-4 animate-spin" /> : <Route className="w-4 h-4" />}
            {optimising ? "Optimising routes…" : "Re-optimise Routes"}
          </Button>
        </div>
      </section>
    </div>
  );
}
