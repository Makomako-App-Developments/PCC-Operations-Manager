import {
  PHOTO_RECONCILIATION_MIN_GRACE_MS,
  reconcilePhotoObjects,
} from "../lib/photo-object-cleanup";

const deleteObjects = process.argv.includes("--delete");
const graceArg = process.argv.find((arg) => arg.startsWith("--grace-hours="));
const graceHours = graceArg ? Number(graceArg.split("=")[1]) : 24;
const gracePeriodMs = graceHours * 60 * 60 * 1000;

if (!Number.isFinite(gracePeriodMs) || gracePeriodMs < PHOTO_RECONCILIATION_MIN_GRACE_MS) {
  throw new Error("--grace-hours must be a number of at least 1");
}

const report = await reconcilePhotoObjects({
  dryRun: !deleteObjects,
  gracePeriodMs,
});

console.info(JSON.stringify(report, null, 2));