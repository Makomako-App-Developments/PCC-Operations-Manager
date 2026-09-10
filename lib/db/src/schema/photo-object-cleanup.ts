import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Internal retry queue for objects uploaded before a database write failed.
 *
 * objectName and bucketId are intentionally not exposed through an API. They
 * are retained here because a retry must address the exact object that was
 * uploaded, while logs and health responses use only safe counts/fingerprints.
 */
export const photoObjectCleanupTable = pgTable("photo_object_cleanup_queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  bucketId: text("bucket_id").notNull(),
  objectName: text("object_name").notNull(),
  route: text("route").notNull(),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at").notNull().defaultNow(),
  lastAttemptAt: timestamp("last_attempt_at"),
  claimToken: text("claim_token"),
  leaseUntil: timestamp("lease_until"),
  completedAt: timestamp("completed_at"),
  permanentlyFailedAt: timestamp("permanently_failed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("photo_object_cleanup_pending_idx").on(t.nextAttemptAt),
  index("photo_object_cleanup_lease_idx").on(t.leaseUntil),
  index("photo_object_cleanup_permanent_idx").on(t.permanentlyFailedAt),
]);

export type PhotoObjectCleanup = typeof photoObjectCleanupTable.$inferSelect;