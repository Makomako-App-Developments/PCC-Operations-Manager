import { useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { useListAssets } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type ImportPreview = {
  batchKey: string;
  valid: boolean;
  summary: {
    validRows: number;
    invalidRows: number;
    warnings: number;
    alreadyImported: boolean;
  };
  errors: string[];
};

export default function StormwaterAssetImport() {
  const { data: assetsData, isLoading, refetch } = useListAssets({
    department: "stormwater",
    limit: 1,
  });
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const assets = assetsData?.data ?? [];
  if (isLoading || assets.length > 0) return null;

  const submit = async (commit: boolean) => {
    if (!file) return;
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("workbook", file);
      if (commit) form.append("batchKey", preview?.batchKey ?? "");
      const response = await fetch(`/api/storm-patrol/assets/import/${commit ? "commit" : "preview"}`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to import workbook.");
      if (commit) {
        toast({
          title: "Stormwater assets imported",
          description: `${payload.created} created, ${payload.updated} updated in the Asset Register.`,
        });
        setPreview(null);
        setFile(null);
        await refetch();
      } else {
        setPreview(payload);
      }
    } catch (error) {
      toast({
        title: commit ? "Import failed" : "Preview failed",
        description: error instanceof Error ? error.message : "Unable to import workbook.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-6 md:p-8 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-amber-300/15 p-2.5">
          <Upload className="h-5 w-5 text-amber-100" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">Load Stormwater Asset Register</h2>
          <p className="mt-1 text-sm text-amber-50/70">
            This one-off import is available without an active storm. Preview the authoritative 7 September 2026 workbook, then confirm the identical file.
          </p>
        </div>
      </div>

      <input
        type="file"
        accept=".xlsx"
        onChange={event => {
          setFile(event.target.files?.[0] ?? null);
          setPreview(null);
        }}
        className="block w-full text-sm text-white/70 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white"
        data-testid="stormwater-import-file"
      />

      {preview && (
        <div className="rounded-lg bg-black/20 p-3 text-sm text-white/80">
          <p>{preview.summary.validRows} valid rows · {preview.summary.invalidRows} errors · {preview.summary.warnings} normalizations</p>
          {preview.errors.slice(0, 3).map(error => <p key={error} className="mt-1 text-red-300">{error}</p>)}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={!file || submitting} onClick={() => submit(false)}>
          {submitting && !preview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Preview workbook
        </Button>
        {preview?.valid && !preview.summary.alreadyImported && (
          <Button type="button" disabled={submitting} onClick={() => submit(true)} className="bg-[#00AECD] text-white">
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Confirm Asset Register import
          </Button>
        )}
      </div>
    </section>
  );
}