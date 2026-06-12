import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ClipboardCheck } from "lucide-react";

interface Settings {
  auditQuotaCompletedWorksCount: number;
  auditQuotaOutcomesBasedCount: number;
}

export default function AuditQuotaPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [cw, setCw]             = useState("");
  const [ob, setOb]             = useState("");
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/settings", { credentials: "include" })
      .then(r => r.json())
      .then((d: Settings) => {
        setSettings(d);
        setCw(String(d.auditQuotaCompletedWorksCount ?? 15));
        setOb(String(d.auditQuotaOutcomesBasedCount  ?? 5));
      })
      .catch(() => toast({ title: "Failed to load settings", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    const cwVal = parseInt(cw);
    const obVal = parseInt(ob);
    if (isNaN(cwVal) || cwVal < 0 || cwVal > 100) {
      toast({ title: "Invalid value", description: "Completed Works must be 0–100.", variant: "destructive" });
      return;
    }
    if (isNaN(obVal) || obVal < 0 || obVal > 100) {
      toast({ title: "Invalid value", description: "Outcomes Based must be 0–100.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auditQuotaCompletedWorksCount: cwVal,
          auditQuotaOutcomesBasedCount:  obVal,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const updated: Settings = await r.json();
      setSettings(updated);
      toast({ title: "Quota updated", description: `${cwVal} completed works + ${obVal} outcomes based = ${cwVal + obVal} total per supervisor per week.` });
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

  const cwVal = parseInt(cw) || 0;
  const obVal = parseInt(ob) || 0;
  const isDirty = settings !== null && (
    cwVal !== settings.auditQuotaCompletedWorksCount ||
    obVal !== settings.auditQuotaOutcomesBasedCount
  );

  return (
    <div className="max-w-2xl mx-auto px-8 py-8 space-y-8">
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
        <div className="flex items-center gap-2.5 pb-2 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-[#00AECD]/10 flex items-center justify-center">
            <ClipboardCheck className="w-4 h-4 text-[#00AECD]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Weekly Audit Quota</h2>
            <p className="text-xs text-gray-400">Number of audits each supervisor must complete per week</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <Label htmlFor="cw-count" className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Completed Works
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="cw-count"
                type="number"
                min="0"
                max="100"
                step="1"
                value={cw}
                onChange={e => setCw(e.target.value)}
                className="text-sm w-24"
              />
              <span className="text-xs text-gray-500">audits</span>
            </div>
            <p className="text-xs text-gray-400">Sites where a job was recently completed</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ob-count" className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Outcomes Based
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="ob-count"
                type="number"
                min="0"
                max="100"
                step="1"
                value={ob}
                onChange={e => setOb(e.target.value)}
                className="text-sm w-24"
              />
              <span className="text-xs text-gray-500">audits</span>
            </div>
            <p className="text-xs text-gray-400">Random sample from sites over past 90 days</p>
          </div>
        </div>

        {(cwVal + obVal) > 0 && (
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Summary</p>
            <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
              <li>Each supervisor must complete <strong>{cwVal + obVal} audits</strong> per week</li>
              <li><strong>{cwVal}</strong> from sites with recent completed jobs (±3 days window)</li>
              <li><strong>{obVal}</strong> random samples from any site active in the past 90 days</li>
              <li>The queue is generated fresh each Monday and shown in the FieldOps app</li>
            </ul>
          </div>
        )}

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
