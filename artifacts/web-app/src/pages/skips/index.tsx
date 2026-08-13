import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  CheckCircle2, XCircle, ChevronDown, ChevronUp,
  Filter, Loader2, ClipboardCheck, SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useListTeams, getListTeamsQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const NAVY  = "#0f2a36";
const BRAND = "#00AECD";

// ─── Types ─────────────────────────────────────────────────────────────────
interface TaskSkipReason {
  id: string;
  taskIndex: number;
  taskLabel: string;
  reason: string;
}

interface SkippedJob {
  id: string;
  assetId: string;
  jobType: string;
  scheduledDate: string;
  teamId: string | null;
  skipReason: string | null;
  notes: string | null;
  skipReviewedAt: string | null;
  skipReviewedById: string | null;
  skipReviewOutcome: "accepted" | "rejected" | null;
  skipReviewNotes: string | null;
  reviewerName: string | null;
  reviewerInitials: string | null;
  taskSkipReasons: TaskSkipReason[];
}

// ─── API helpers ───────────────────────────────────────────────────────────
const PAGE_LIMIT = 100; // max per page — API cap is 500

async function fetchAllSkips(params: {
  teamId?: string;
  from?: string;
  to?: string;
  reviewed?: string;
}): Promise<{ data: SkippedJob[]; page: number; limit: number }> {
  const all: SkippedJob[] = [];
  let page = 1;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const qs = new URLSearchParams();
    if (params.teamId)   qs.set("teamId",   params.teamId);
    if (params.from)     qs.set("from",      params.from);
    if (params.to)       qs.set("to",        params.to);
    if (params.reviewed) qs.set("reviewed", params.reviewed);
    qs.set("limit", String(PAGE_LIMIT));
    qs.set("page",  String(page));

    const res = await fetch(`/api/jobs/skips?${qs}`);
    if (!res.ok) throw new Error("Failed to load skips");
    const body: { data: SkippedJob[]; page: number; limit: number } = await res.json();
    all.push(...body.data);

    // Stop when the server returned fewer results than the page size
    if (body.data.length < PAGE_LIMIT) break;
    page++;
  }

  return { data: all, page: 1, limit: PAGE_LIMIT };
}

async function fetchAssets(): Promise<{ data: { id: string; name: string; description: string | null }[] }> {
  const res = await fetch("/api/assets?limit=1200");
  if (!res.ok) throw new Error("Failed to load assets");
  return res.json();
}

async function submitReview(
  jobId: string,
  outcome: "accepted" | "rejected",
  notes: string
): Promise<void> {
  const res = await fetch(`/api/jobs/${jobId}/skip-review`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ outcome, notes: notes.trim() || undefined }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? "Failed to submit review");
  }
}

// ─── Sub-components ────────────────────────────────────────────────────────
function OutcomeBadge({ outcome }: { outcome: "accepted" | "rejected" | null }) {
  if (!outcome) return null;
  const accepted = outcome === "accepted";
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${
        accepted ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
      }`}
    >
      {accepted ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {accepted ? "Accepted" : "Rejected"}
    </span>
  );
}

function ReviewForm({
  jobId,
  onDone,
}: {
  jobId: string;
  onDone: () => void;
}) {
  const [outcome, setOutcome]   = useState<"accepted" | "rejected" | "">("");
  const [notes, setNotes]       = useState("");
  const [busy, setBusy]         = useState(false);
  const { toast }               = useToast();
  const qc                      = useQueryClient();

  async function handleSubmit() {
    if (!outcome) return;
    setBusy(true);
    try {
      await submitReview(jobId, outcome, notes);
      toast({ title: outcome === "accepted" ? "Skip accepted" : "Skip rejected" });
      // invalidate both the skips list and any jobs list
      qc.invalidateQueries({ predicate: q => String((q.queryKey as any[])[0]).includes("jobs") });
      onDone();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-2">
      <div className="flex gap-2">
        <button
          onClick={() => setOutcome("accepted")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
            outcome === "accepted"
              ? "bg-green-600 text-white border-green-600"
              : "bg-white text-green-700 border-green-200 hover:bg-green-50"
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          Accept
        </button>
        <button
          onClick={() => setOutcome("rejected")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
            outcome === "rejected"
              ? "bg-red-600 text-white border-red-600"
              : "bg-white text-red-600 border-red-200 hover:bg-red-50"
          }`}
        >
          <XCircle className="w-3.5 h-3.5" />
          Reject
        </button>
      </div>
      <Textarea
        placeholder="Optional note (e.g. wet weather confirmed, no valid reason provided…)"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        className="text-xs min-h-[56px] resize-none"
      />
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" disabled={!outcome || busy} onClick={handleSubmit}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
          Submit
        </Button>
      </div>
    </div>
  );
}

function SkipCard({
  job,
  assetName,
  teamName,
}: {
  job: SkippedJob;
  assetName: string;
  teamName: string;
}) {
  const [expanded, setExpanded]     = useState(false);
  const [reviewing, setReviewing]   = useState(false);
  const reviewed = !!job.skipReviewedAt;

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${reviewed ? "border-gray-100" : "border-amber-200"}`}>
      {/* Header row */}
      <div className="px-5 py-4 flex items-start gap-3">
        <span className={`mt-0.5 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0 ${
          reviewed ? "bg-gray-100 text-gray-400" : "bg-amber-50 text-amber-500"
        }`}>
          skip
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-800 truncate">{assetName}</p>
            <OutcomeBadge outcome={job.skipReviewOutcome} />
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {job.jobType.replace(/_/g, " ")}
            {teamName ? ` · ${teamName}` : ""}
            {" · "}
            {job.scheduledDate ? format(parseISO(job.scheduledDate), "d MMM yyyy") : "—"}
          </p>

          {(job.skipReason || job.notes) && (
            <p className="text-[11px] text-amber-600 italic mt-1 leading-relaxed">
              "{job.skipReason || job.notes}"
            </p>
          )}

          {/* Reviewed info */}
          {reviewed && (
            <p className="text-[10px] text-gray-400 mt-1">
              Reviewed by {job.reviewerName ?? "Unknown"} · {format(parseISO(job.skipReviewedAt!), "d MMM yyyy HH:mm")}
              {job.skipReviewNotes ? ` — "${job.skipReviewNotes}"` : ""}
            </p>
          )}
        </div>

        {/* Expand / action buttons */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          {!reviewed && !reviewing && (
            <Button
              size="sm"
              variant="outline"
              className="text-[11px] h-7 px-2.5"
              onClick={() => { setReviewing(true); setExpanded(true); }}
            >
              Review
            </Button>
          )}
          {reviewed && !reviewing && (
            <Button
              size="sm"
              variant="ghost"
              className="text-[11px] h-7 px-2 text-gray-400"
              onClick={() => { setReviewing(true); setExpanded(true); }}
            >
              Re-review
            </Button>
          )}
          {(job.taskSkipReasons.length > 0) && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600"
            >
              {job.taskSkipReasons.length} task excuse{job.taskSkipReasons.length !== 1 ? "s" : ""}
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-5 pb-4">
          {job.taskSkipReasons.length > 0 && (
            <div className="space-y-1.5 mb-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Per-task excuses</p>
              {job.taskSkipReasons.map(r => (
                <div key={r.id} className="flex gap-2 items-start">
                  <span className="text-[10px] text-gray-400 flex-shrink-0 mt-0.5">#{r.taskIndex + 1}</span>
                  <div>
                    <p className="text-[11px] font-semibold text-gray-700">{r.taskLabel}</p>
                    <p className="text-[11px] text-amber-600 italic">"{r.reason}"</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {reviewing && (
            <ReviewForm
              jobId={job.id}
              onDone={() => { setReviewing(false); }}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────
export default function SkipsPage() {
  const [teamFilter,     setTeamFilter]     = useState<string>("all");
  const [reviewedFilter, setReviewedFilter] = useState<"all" | "no" | "yes">("all");

  const { data: teamsData } = useListTeams({ query: { queryKey: getListTeamsQueryKey() } });

  const { data: assetsRaw } = useQuery({
    queryKey: ["assets-skips-page"],
    queryFn:  fetchAssets,
  });

  const { data: skipsRaw, isLoading } = useQuery({
    queryKey: ["jobs-skips", teamFilter, reviewedFilter],
    queryFn:  () => fetchAllSkips({
      teamId:   teamFilter !== "all" ? teamFilter : undefined,
      reviewed: reviewedFilter,
    }),
  });

  const assetName = useMemo(() => {
    const m = new Map<string, string>();
    (assetsRaw?.data ?? []).forEach(a => m.set(a.id, a.name));
    return m;
  }, [assetsRaw]);

  const teamName = useMemo(() => {
    const m = new Map<string, string>();
    (teamsData ?? []).forEach(t => m.set(t.id, t.name));
    return m;
  }, [teamsData]);

  const jobs   = skipsRaw?.data ?? [];
  const unreviewed = jobs.filter(j => !j.skipReviewedAt).length;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black" style={{ color: NAVY }}>Skips & Excuses Review</h1>
          <p className="text-[12px] text-gray-400 mt-0.5">
            {unreviewed > 0
              ? `${unreviewed} unreviewed skip${unreviewed !== 1 ? "s" : ""} · ${jobs.length} total`
              : `${jobs.length} skip${jobs.length !== 1 ? "s" : ""} · all reviewed`}
          </p>
        </div>
        {unreviewed > 0 && (
          <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
            <ClipboardCheck className="w-3.5 h-3.5" />
            {unreviewed} pending
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger className="h-8 text-xs w-44">
            <Filter className="w-3 h-3 mr-1 text-gray-400" />
            <SelectValue placeholder="All teams" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All teams</SelectItem>
            {(teamsData ?? []).map(t => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={reviewedFilter} onValueChange={v => setReviewedFilter(v as any)}>
          <SelectTrigger className="h-8 text-xs w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All skips</SelectItem>
            <SelectItem value="no">Unreviewed only</SelectItem>
            <SelectItem value="yes">Reviewed only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <SkipForward className="w-8 h-8 mb-2 opacity-30" />
          <p className="text-sm font-medium">No skipped jobs found</p>
          <p className="text-[11px] mt-1">Try adjusting the filters above</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Unreviewed group */}
          {jobs.filter(j => !j.skipReviewedAt).length > 0 && (
            <>
              <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest px-1">
                Awaiting review ({jobs.filter(j => !j.skipReviewedAt).length})
              </p>
              {jobs
                .filter(j => !j.skipReviewedAt)
                .map(j => (
                  <SkipCard
                    key={j.id}
                    job={j}
                    assetName={assetName.get(j.assetId) ?? "Unknown site"}
                    teamName={j.teamId ? (teamName.get(j.teamId) ?? "") : ""}
                  />
                ))}
            </>
          )}

          {/* Reviewed group */}
          {jobs.filter(j => j.skipReviewedAt).length > 0 && (
            <>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1 mt-4">
                Reviewed ({jobs.filter(j => j.skipReviewedAt).length})
              </p>
              {jobs
                .filter(j => j.skipReviewedAt)
                .map(j => (
                  <SkipCard
                    key={j.id}
                    job={j}
                    assetName={assetName.get(j.assetId) ?? "Unknown site"}
                    teamName={j.teamId ? (teamName.get(j.teamId) ?? "") : ""}
                  />
                ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
