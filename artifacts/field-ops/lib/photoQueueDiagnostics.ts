import * as Sentry from "@sentry/react-native";

import type { QueueReadState } from "@/lib/photoQueue";

const FAILURE_EVENT_INTERVAL_MS = 5 * 60 * 1000;

export interface PhotoQueueReadDiagnostic {
  event:
    | "photo_queue_read_unavailable"
    | "photo_queue_read_corrupt"
    | "photo_queue_read_recovered";
  state: QueueReadState;
  retryAttempt: number;
  suppressedCount: number;
  failureDurationMs?: number;
  recoveredFrom?: "unavailable" | "corrupt";
}

type DiagnosticHandler = (diagnostic: PhotoQueueReadDiagnostic) => void;

const defaultDiagnosticHandler: DiagnosticHandler = diagnostic => {
  Sentry.captureMessage(diagnostic.event, {
    level: diagnostic.event === "photo_queue_read_recovered" ? "info" : "warning",
    tags: {
      diagnostic: "photo_queue_read",
      queueReadState: diagnostic.state,
    },
    extra: { ...diagnostic },
  });
};

let diagnosticHandler: DiagnosticHandler = defaultDiagnosticHandler;
let failureStartedAt: number | null = null;
let lastFailureState: "unavailable" | "corrupt" | null = null;
let lastEmittedAt = 0;
let retryAttempt = 0;
let suppressedCount = 0;

export function recordPhotoQueueReadState(state: QueueReadState): void {
  const now = Date.now();
  if (state === "unavailable" || state === "corrupt") {
    retryAttempt += 1;
    failureStartedAt ??= now;

    const stateChanged = lastFailureState !== state;
    const intervalElapsed = now - lastEmittedAt >= FAILURE_EVENT_INTERVAL_MS;
    if (stateChanged || lastEmittedAt === 0 || intervalElapsed) {
      diagnosticHandler({
        event: state === "unavailable"
          ? "photo_queue_read_unavailable"
          : "photo_queue_read_corrupt",
        state,
        retryAttempt,
        suppressedCount,
      });
      lastEmittedAt = now;
      suppressedCount = 0;
    } else {
      suppressedCount += 1;
    }
    lastFailureState = state;
    return;
  }

  if (lastFailureState !== null && failureStartedAt !== null) {
    diagnosticHandler({
      event: "photo_queue_read_recovered",
      state,
      retryAttempt,
      suppressedCount,
      failureDurationMs: Math.max(0, now - failureStartedAt),
      recoveredFrom: lastFailureState,
    });
  }

  failureStartedAt = null;
  lastFailureState = null;
  lastEmittedAt = 0;
  retryAttempt = 0;
  suppressedCount = 0;
}

export function setPhotoQueueDiagnosticHandler(handler?: DiagnosticHandler): void {
  diagnosticHandler = handler ?? defaultDiagnosticHandler;
  failureStartedAt = null;
  lastFailureState = null;
  lastEmittedAt = 0;
  retryAttempt = 0;
  suppressedCount = 0;
}