import { Router } from "express";
import { db, auditsTable, auditWeeklyQuotasTable, auditQuotaItemsTable, jobsTable, assetsTable } from "@workspace/db";
import { eq, and, sql, isNull } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

interface SampleRow { asset_id: string; asset_name: string; source_job_id: string; }

const router = Router();

function getISOWeekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function samplePool(
  weekStart: Date,
  auditType: "completed-works" | "outcomes-based",
  limit: number,
): Promise<{ assetId: string; assetName: string; sourceJobId: string }[]> {
  let fromDate: Date;
  let toDate: Date;

  if (auditType === "completed-works") {
    fromDate = new Date(weekStart);
    fromDate.setUTCDate(fromDate.getUTCDate() - 3);
    toDate = new Date(weekStart);
    toDate.setUTCDate(toDate.getUTCDate() + 7);
  } else {
    fromDate = new Date(weekStart);
    fromDate.setUTCDate(fromDate.getUTCDate() - 90);
    toDate = new Date(weekStart);
    toDate.setUTCDate(toDate.getUTCDate() - 7);
  }

  // Use a CTE to first deduplicate by asset (picking one random job per asset
  // via DISTINCT ON ordered by random()), then draw a true SQL random sample
  // from the deduplicated set — no JS-level shuffling or manual LIMIT tricks.
  const result = await db.execute<SampleRow>(sql`
    WITH deduped AS (
      SELECT DISTINCT ON (j.asset_id)
        j.asset_id,
        a.name   AS asset_name,
        j.id     AS source_job_id
      FROM   jobs   j
      JOIN   assets a ON a.id = j.asset_id
      WHERE  j.status       = 'completed'
        AND  j.completed_at >= ${fromDate.toISOString()}
        AND  j.completed_at <  ${toDate.toISOString()}
      ORDER BY j.asset_id, random()
    )
    SELECT asset_id, asset_name, source_job_id
    FROM   deduped
    ORDER BY random()
    LIMIT  ${limit}
  `);

  return result.rows.map((r) => ({
    assetId:     r.asset_id,
    assetName:   r.asset_name ?? "Unknown site",
    sourceJobId: r.source_job_id,
  }));
}

async function buildOrLoadQuota(supervisorId: string, weekStart: Date) {
  const weekStartStr = toDateStr(weekStart);

  const [existing] = await db
    .select()
    .from(auditWeeklyQuotasTable)
    .where(
      and(
        eq(auditWeeklyQuotasTable.supervisorId, supervisorId),
        eq(auditWeeklyQuotasTable.weekStart, weekStartStr),
      ),
    )
    .limit(1);

  if (existing) {
    return loadQuotaDetail(existing.id);
  }
  return generateQuota(supervisorId, weekStartStr);
}

async function generateQuota(supervisorId: string, weekStartStr: string) {
  const weekStart = new Date(weekStartStr + "T00:00:00Z");

  // Find or create the quota record for this supervisor+week
  let [quota] = await db
    .select()
    .from(auditWeeklyQuotasTable)
    .where(
      and(
        eq(auditWeeklyQuotasTable.supervisorId, supervisorId),
        eq(auditWeeklyQuotasTable.weekStart, weekStartStr),
      ),
    )
    .limit(1);

  if (quota) {
    // Preserve completed items — only delete pending (unlinked) ones
    await db
      .delete(auditQuotaItemsTable)
      .where(
        and(
          eq(auditQuotaItemsTable.quotaId, quota.id),
          isNull(auditQuotaItemsTable.auditId),
        ),
      );
    // Refresh the generatedAt timestamp
    await db
      .update(auditWeeklyQuotasTable)
      .set({ generatedAt: new Date() })
      .where(eq(auditWeeklyQuotasTable.id, quota.id));
  } else {
    const [inserted] = await db
      .insert(auditWeeklyQuotasTable)
      .values({ supervisorId, weekStart: weekStartStr })
      .returning();
    quota = inserted;
  }

  // Determine how many of each type are already completed (to avoid over-sampling)
  const existingCompleted = await db
    .select()
    .from(auditQuotaItemsTable)
    .where(
      and(
        eq(auditQuotaItemsTable.quotaId, quota.id),
        sql`${auditQuotaItemsTable.auditId} IS NOT NULL`,
      ),
    );
  const cwDone = existingCompleted.filter((i) => i.auditType === "completed-works").length;
  const obDone = existingCompleted.filter((i) => i.auditType === "outcomes-based").length;

  const cwNeeded = Math.max(0, 15 - cwDone);
  const obNeeded = Math.max(0, 5  - obDone);

  const [cwPool, obPool] = await Promise.all([
    cwNeeded > 0 ? samplePool(weekStart, "completed-works", cwNeeded) : Promise.resolve([]),
    obNeeded > 0 ? samplePool(weekStart, "outcomes-based",  obNeeded) : Promise.resolve([]),
  ]);

  const items = [
    ...cwPool.map((r) => ({
      quotaId:     quota.id,
      assetId:     r.assetId,
      assetName:   r.assetName,
      auditType:   "completed-works" as const,
      sourceJobId: r.sourceJobId,
    })),
    ...obPool.map((r) => ({
      quotaId:     quota.id,
      assetId:     r.assetId,
      assetName:   r.assetName,
      auditType:   "outcomes-based" as const,
      sourceJobId: r.sourceJobId,
    })),
  ];

  if (items.length > 0) {
    await db.insert(auditQuotaItemsTable).values(items);
  }

  return loadQuotaDetail(quota.id);
}

async function loadQuotaDetail(quotaId: string) {
  const [quota] = await db
    .select()
    .from(auditWeeklyQuotasTable)
    .where(eq(auditWeeklyQuotasTable.id, quotaId))
    .limit(1);

  if (!quota) return null;

  const items = await db
    .select({
      id:          auditQuotaItemsTable.id,
      assetId:     auditQuotaItemsTable.assetId,
      assetName:   auditQuotaItemsTable.assetName,
      auditType:   auditQuotaItemsTable.auditType,
      sourceJobId: auditQuotaItemsTable.sourceJobId,
      auditId:     auditQuotaItemsTable.auditId,
      suburb:      assetsTable.suburb,
    })
    .from(auditQuotaItemsTable)
    .leftJoin(assetsTable, eq(auditQuotaItemsTable.assetId, assetsTable.id))
    .where(eq(auditQuotaItemsTable.quotaId, quotaId));

  const cwItems = items.filter((i) => i.auditType === "completed-works");
  const obItems = items.filter((i) => i.auditType === "outcomes-based");

  return {
    id:           quota.id,
    supervisorId: quota.supervisorId,
    weekStart:    quota.weekStart,
    generatedAt:  quota.generatedAt,
    progress: {
      completedWorks: { done: cwItems.filter((i) => i.auditId).length, total: cwItems.length },
      outcomesBased:  { done: obItems.filter((i) => i.auditId).length, total: obItems.length },
      overall:        { done: items.filter((i) => i.auditId).length,   total: items.length },
    },
    items: items.map((i) => ({
      id:          i.id,
      assetId:     i.assetId,
      assetName:   i.assetName,
      auditType:   i.auditType,
      sourceJobId: i.sourceJobId,
      auditId:     i.auditId,
      completed:   !!i.auditId,
      suburb:      i.suburb ?? null,
    })),
  };
}

// ── GET /api/audit-quota/badge ────────────────────────────────────────────────
// Supervisor: auto-generates (or loads) the current week's quota and returns
// { outstanding: number } so the tab badge is accurate from the moment the
// supervisor logs in, not only after they open Audits.
// Manager/admin: returns { outstanding: 0 } — they don't own a quota.
router.get("/audit-quota/badge", requireAuth, requireRole("supervisor", "manager", "administrator"), async (req, res) => {
  const { userId, role } = req.auth!;

  if (role !== "supervisor") {
    res.json({ outstanding: 0 });
    return;
  }

  const weekStart = getISOWeekStart(new Date());
  const detail = await buildOrLoadQuota(userId, weekStart);

  if (!detail) {
    res.json({ outstanding: 0 });
    return;
  }

  const { done, total } = detail.progress.overall;
  const outstanding = Math.max(0, total - done);
  res.json({ outstanding });
});

// ── GET /api/audit-quota/current ──────────────────────────────────────────────
// Supervisor-only: loads or auto-generates the calling supervisor's quota
// for the current ISO week.
router.get("/audit-quota/current", requireAuth, requireRole("supervisor"), async (req, res) => {
  const supervisorId = req.auth!.userId;
  const weekStart = getISOWeekStart(new Date());
  const detail = await buildOrLoadQuota(supervisorId, weekStart);
  res.json(detail);
});

// ── POST /api/audit-quota/generate ────────────────────────────────────────────
// Manager/admin only: force-regenerates (replaces pending items only) for a
// given supervisorId and weekStart.
router.post("/audit-quota/generate", requireAuth, requireRole("manager", "administrator"), async (req, res) => {
  const { supervisorId, weekStart } = req.body as { supervisorId?: string; weekStart?: string };
  if (!supervisorId) {
    res.status(400).json({ error: "supervisorId required" });
    return;
  }
  const ws = weekStart ? new Date(weekStart + "T00:00:00Z") : getISOWeekStart(new Date());
  const weekStartStr = toDateStr(ws);
  const detail = await generateQuota(supervisorId, weekStartStr);
  res.json(detail);
});

// ── Helper: link a quota item once the audit is fully completed ───────────────
// Called from the audits route only after status transitions to passed/failed.
export async function linkQuotaItemIfMatches(assetId: string, auditorId: string, auditId: string) {
  const weekStart = getISOWeekStart(new Date());
  const weekStartStr = toDateStr(weekStart);

  const [quota] = await db
    .select({ id: auditWeeklyQuotasTable.id })
    .from(auditWeeklyQuotasTable)
    .where(
      and(
        eq(auditWeeklyQuotasTable.supervisorId, auditorId),
        eq(auditWeeklyQuotasTable.weekStart, weekStartStr),
      ),
    )
    .limit(1);

  if (!quota) return;

  await db
    .update(auditQuotaItemsTable)
    .set({ auditId })
    .where(
      and(
        eq(auditQuotaItemsTable.quotaId, quota.id),
        eq(auditQuotaItemsTable.assetId, assetId),
        isNull(auditQuotaItemsTable.auditId),
      ),
    );
}

export default router;
