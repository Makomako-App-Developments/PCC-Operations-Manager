import app from "./app";
import { startOverdueChecker } from "./lib/overdue-checker";
import { runStartupPatches } from "./lib/startup-patch";
import { runProductionTestingBacklogCleanup } from "./lib/testing-backlog-cleanup";
import {
  ensurePhotoObjectCleanupQueue,
  startPhotoObjectCleanupWorker,
} from "./lib/photo-object-cleanup";

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
  process.exit(1);
});

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function startServer(): Promise<void> {
  // Retire the fixed test backlog before overdue notifications or requests can
  // expose it to the client. Failure aborts startup so the app never serves a
  // partially applied cleanup; the single SQL statement is atomic and safe to retry.
  await runProductionTestingBacklogCleanup();
  await ensurePhotoObjectCleanupQueue();

  startOverdueChecker();
  startPhotoObjectCleanupWorker();
  void runStartupPatches();

  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

void startServer().catch((err) => {
  console.error("[startup] Failed before server start:", err);
  process.exit(1);
});
