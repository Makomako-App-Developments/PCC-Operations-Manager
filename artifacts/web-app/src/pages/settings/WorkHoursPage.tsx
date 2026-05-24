import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sunrise } from "lucide-react";

const API = (path: string) => fetch(path, { credentials: "include" });

interface SystemSettings {
  workStartHour: number;
  workEndHour: number;
}

const HOUR_OPTIONS = Array.from({ length: 17 }, (_, i) => i + 5); // 5am–9pm

function formatHourLabel(h: number) {
  if (h === 0)  return "12am";
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

export default function WorkHoursPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [startHour, setStartHour] = useState(8);
  const [endHour, setEndHour]     = useState(16);
  const [saved, setSaved]         = useState<{ start: number; end: number } | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    API("/api/settings")
      .then(r => r.json())
      .then((d: SystemSettings) => {
        const s = d.workStartHour ?? 8;
        const e = d.workEndHour   ?? 16;
        setStartHour(s);
        setEndHour(e);
        setSaved({ start: s, end: e });
      })
      .catch(() => toast({ title: "Failed to load settings", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  const isDirty = saved !== null && (startHour !== saved.start || endHour !== saved.end);

  const handleSave = async () => {
    if (endHour <= startHour) {
      toast({ title: "Invalid hours", description: "Finish time must be after start time.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workStartHour: startHour, workEndHour: endHour }),
      });
      if (!r.ok) throw new Error(await r.text());
      setSaved({ start: startHour, end: endHour });
      toast({ title: "Work hours saved", description: `${formatHourLabel(startHour)} – ${formatHourLabel(endHour)}` });
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

  const spanHours = endHour - startHour;

  return (
    <div className="max-w-2xl mx-auto px-8 py-8 space-y-8">
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
        <div className="flex items-center gap-2.5 pb-2 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-[#00AECD]/10 flex items-center justify-center">
            <Sunrise className="w-4 h-4 text-[#00AECD]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Standard Work Hours</h2>
            <p className="text-xs text-gray-400">Sets the time range shown on the Team availability grid</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block">Start Time</label>
            <select
              value={startHour}
              onChange={e => setStartHour(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] bg-white"
            >
              {HOUR_OPTIONS.filter(h => h < endHour).map(h => (
                <option key={h} value={h}>{formatHourLabel(h)}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block">Finish Time</label>
            <select
              value={endHour}
              onChange={e => setEndHour(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#00AECD] bg-white"
            >
              {HOUR_OPTIONS.filter(h => h > startHour).map(h => (
                <option key={h} value={h}>{formatHourLabel(h)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#00AECD]" />
          <p className="text-xs text-gray-600">
            Team availability grid will show <strong>{spanHours} hour{spanHours !== 1 ? "s" : ""}</strong> from{" "}
            <strong>{formatHourLabel(startHour)}</strong> to <strong>{formatHourLabel(endHour)}</strong>
          </p>
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
