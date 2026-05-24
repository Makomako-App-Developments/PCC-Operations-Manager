import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Zap } from "lucide-react";

interface ReactivePriority {
  id: string;
  emoji: string;
  label: string;
  responseTime: string;
  description: string;
  color: string;
  bg: string;
}

const DEFAULT_PRIORITIES: ReactivePriority[] = [
  {
    id: "urgent",
    emoji: "🔴",
    label: "Urgent / High Priority",
    responseTime: "1–2 hours",
    description:
      "Emergencies that pose an immediate risk to public health, safety, or major property damage. This includes major water leaks and sewer overflows.",
    color: "#dc2626",
    bg: "#fef2f2",
  },
  {
    id: "standard",
    emoji: "🟡",
    label: "Standard / Medium Priority",
    responseTime: "2–5 days",
    description:
      "Repairs that do not pose an immediate risk but require attention soon (e.g., minor footpath trips, blocked stormwater grates).",
    color: "#d97706",
    bg: "#fef3c7",
  },
  {
    id: "routine",
    emoji: "🟢",
    label: "Routine / Low Priority",
    responseTime: "Up to 20 days",
    description:
      "Non-structural issues or routine maintenance, such as minor pothole repairs or aesthetic street cleaning.",
    color: "#6b7280",
    bg: "#f3f4f6",
  },
];

export default function ReactivePrioritiesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [priorities, setPriorities] = useState<ReactivePriority[]>(DEFAULT_PRIORITIES);
  const [saved, setSaved] = useState<string>("");
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/settings", { credentials: "include" })
      .then(r => r.json())
      .then((d: { reactivePriorities?: ReactivePriority[] }) => {
        const p = d.reactivePriorities?.length ? d.reactivePriorities : DEFAULT_PRIORITIES;
        setPriorities(p);
        setSaved(JSON.stringify(p));
      })
      .catch(() => toast({ title: "Failed to load settings", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  const update = (idx: number, field: keyof ReactivePriority, value: string) => {
    setPriorities(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  const isDirty = JSON.stringify(priorities) !== saved;

  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reactivePriorities: priorities }),
      });
      if (!r.ok) throw new Error(await r.text());
      setSaved(JSON.stringify(priorities));
      toast({ title: "Priorities saved" });
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

  return (
    <div className="max-w-2xl mx-auto px-8 py-8 space-y-6">
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
        <div className="flex items-center gap-2.5 pb-2 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
            <Zap className="w-4 h-4 text-amber-500" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Reactive Job Priorities</h2>
            <p className="text-xs text-gray-400">
              Customise the three priority levels shown when creating a reactive job
            </p>
          </div>
        </div>

        <div className="space-y-5">
          {priorities.map((p, idx) => (
            <div
              key={p.id}
              className="rounded-xl border p-4 space-y-3"
              style={{ borderColor: p.color + "40", background: p.bg }}
            >
              {/* Header row */}
              <div className="flex items-center gap-2">
                <span className="text-lg">{p.emoji}</span>
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: p.bg, color: p.color, border: `1px solid ${p.color}40` }}
                >
                  {p.label}
                </span>
              </div>

              {/* Editable fields */}
              <div className="space-y-2 bg-white rounded-lg p-3 border border-gray-100">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block">
                    Label
                  </label>
                  <input
                    value={p.label}
                    onChange={e => update(idx, "label", e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-[#00AECD]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block">
                    Response Time
                  </label>
                  <input
                    value={p.responseTime}
                    onChange={e => update(idx, "responseTime", e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-[#00AECD]"
                    placeholder="e.g. 1–2 hours"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block">
                    Description
                  </label>
                  <textarea
                    value={p.description}
                    onChange={e => update(idx, "description", e.target.value)}
                    rows={3}
                    className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-[#00AECD] resize-none"
                  />
                </div>
              </div>
            </div>
          ))}
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
