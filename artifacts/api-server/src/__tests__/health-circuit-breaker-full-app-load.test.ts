/**
 * Full-app concurrent-request load test for GET /api/health/circuit-breaker
 *
 * The existing concurrency test (health-circuit-breaker-concurrency-load.test.ts)
 * mounts only the circuit-breaker router in isolation. This companion suite
 * mounts the *full* app (app.ts — all routes, all middleware) and fires
 * BG_CONCURRENCY concurrent requests to /api/health/ready, each mocked to
 * take 200 ms waiting on a simulated DB response, while CB_CONCURRENCY probes
 * hit /api/health/circuit-breaker in parallel.
 *
 * What this test validates:
 *   - The circuit-breaker endpoint (pure in-memory read, no I/O) stays fast
 *     even when the full middleware stack is loaded and other routes have many
 *     concurrent async I/O waits outstanding.
 *   - All three breaker states return the correct HTTP 200 shape.
 *
 * What this test does NOT claim:
 *   - The mocked 200 ms delay is a Promise + setTimeout, not synchronous CPU
 *     work. It does not monopolise the event-loop tick; it creates concurrent
 *     async-I/O pressure (pending promises, timer callbacks, TCP connections).
 *     This mirrors the realistic production pattern of concurrent DB awaits.
 *
 * Synchronisation guarantee:
 *   A per-call barrier tracks how many /api/health/ready handlers have entered
 *   the simulated DB wait (i.e. called db.execute). The timed CB batch does
 *   not start until all BG_CONCURRENCY background handlers are inside the
 *   delay, so every p99 measurement is taken while the full concurrent load is
 *   active — not before it ramps up.
 *
 * Threshold:
 *   P99_DEADLINE_MS is set to 100 ms rather than the isolation suite's 50 ms.
 *   The full app runs helmet, CORS, body-parser, cookie-parser, and the DB
 *   circuit-breaker middleware on every request, adding ~5–20 ms of baseline
 *   overhead versus the minimal router. 100 ms is still a tight bound for an
 *   endpoint that does no I/O, and it would catch any catastrophic regression.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";

// ── Module-level mocks ────────────────────────────────────────────────────────
// These are hoisted by Vitest before any import or variable initialiser in this
// file.  Values that must be shared between the mock factory and test code are
// stored via globalThis so both sides can access them across the hoist boundary.
//
// Specifically, the db.execute mock calls globalThis.__dbEnterCallback() at the
// start of each invocation (before the timer fires). Test code installs a
// barrier function here and waits until BG_CONCURRENCY invocations have started
// before beginning the timed CB batch.

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return {
    ...actual,
    db: {
      // Simulates a 200 ms DB round-trip used by /api/health/ready.
      // Signals globalThis.__dbEnterCallback on each entry so the test's
      // barrier knows when all background handlers are actively waiting.
      execute: vi.fn().mockImplementation(
        () =>
          new Promise<unknown[]>((resolve) => {
            const cb = (globalThis as Record<string, unknown>)["__dbEnterCallback"];
            if (typeof cb === "function") cb();
            setTimeout(() => resolve([]), 200);
          }),
      ),
    },
    dbCircuitBreaker: {
      getState: vi.fn().mockReturnValue("CLOSED"),
      getOpenedAt: vi.fn().mockReturnValue(null),
    },
    // Transparent wrapper so /api/health/ready calls through to the slow
    // db.execute mock and takes ~200 ms.
    executeWithCircuitBreaker: vi.fn().mockImplementation(
      async (fn: () => Promise<unknown>) => fn(),
    ),
  };
});

vi.mock("../lib/sentry", () => ({
  initSentry: vi.fn(),
  Sentry: { captureException: vi.fn() },
}));

vi.mock("../lib/objectStorage", () => ({
  objectStorageClient: {
    bucket: vi.fn().mockReturnValue({
      file: vi.fn().mockReturnValue({
        exists: vi.fn().mockResolvedValue([false]),
        getMetadata: vi.fn().mockResolvedValue([{}]),
        createReadStream: vi.fn(),
      }),
    }),
  },
}));

vi.mock("../middlewares/auth", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// The full app mounts a rate-limiter (300 req / 15 min window) that would
// fire 429s once the cumulative request count across all test cases exceeds
// the cap. The rate-limiter is infrastructure rather than the system under
// test; replace it with a transparent pass-through for this load suite.
vi.mock("express-rate-limit", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  rateLimit: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// ── App import (after all mocks are registered) ───────────────────────────────

import app from "../app";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Concurrent circuit-breaker probe requests per timed batch. */
const CB_CONCURRENCY = 50;
/** Concurrent background slow-route requests (simulated DB waits). */
const BG_CONCURRENCY = 10;
/**
 * p99 deadline for the full-app configuration.
 *
 * 100 ms rather than the isolation suite's 50 ms: the full app runs helmet,
 * CORS, body-parser, cookie-parser, and the circuit-breaker middleware on
 * every request, adding measurable overhead above the bare router.  100 ms
 * is still tight for an endpoint that does zero I/O.
 */
const P99_DEADLINE_MS = 100;

// ── Server lifecycle ──────────────────────────────────────────────────────────

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer(app);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("unexpected address type"));
        return;
      }
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  // Warm-up: prime the JIT for both routes before the timed batches so that
  // first-run compilation overhead doesn't skew the p99 measurements.
  await Promise.all([
    fetch(`${baseUrl}/api/health/circuit-breaker`),
    fetch(`${baseUrl}/api/health/ready`),
  ]);
});

afterAll(
  () =>
    new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    ),
);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Return the p99 value of an array of latency samples (milliseconds). */
function p99(latencies: number[]): number {
  const sorted = [...latencies].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.99) - 1;
  return sorted[Math.max(0, idx)];
}

/** Set the circuit-breaker mock state for the current test. */
async function setCbState(
  state: "CLOSED" | "OPEN" | "HALF_OPEN",
  openedAtMs: number | null = null,
): Promise<void> {
  const { dbCircuitBreaker } = await import("@workspace/db");
  vi.mocked(dbCircuitBreaker.getState).mockReturnValue(state);
  vi.mocked(dbCircuitBreaker.getOpenedAt).mockReturnValue(openedAtMs);
}

/**
 * Install a barrier on globalThis.__dbEnterCallback that resolves once
 * `count` invocations of db.execute have started (i.e. the simulated DB
 * delay has begun but not yet resolved).
 */
function waitForDbEnters(count: number): Promise<void> {
  return new Promise<void>((resolve) => {
    let entered = 0;
    (globalThis as Record<string, unknown>)["__dbEnterCallback"] = () => {
      entered++;
      if (entered >= count) {
        // Clear the callback so warm-up requests in the next test don't leak.
        (globalThis as Record<string, unknown>)["__dbEnterCallback"] = null;
        resolve();
      }
    };
  });
}

interface LoadResult {
  latencies: number[];
  statuses: number[];
  bodies: Array<{
    state: string;
    openedAt: string | null;
    openDurationMs: number | null;
  }>;
}

/**
 * Fire CB_CONCURRENCY requests to /api/health/circuit-breaker while
 * BG_CONCURRENCY requests to /api/health/ready (slow, ~200 ms each) are
 * concurrently awaiting their mocked DB response.
 *
 * Synchronisation: waits until all BG_CONCURRENCY background handlers have
 * entered the simulated DB delay before beginning the timed CB batch, so
 * every measured request runs while the full async load is active.
 */
async function fireUnderLoad(): Promise<LoadResult> {
  // Arm the barrier for the background requests that are about to start.
  const allBgActive = waitForDbEnters(BG_CONCURRENCY);

  // Kick off background slow requests without awaiting — we need them to
  // start independently so the barrier can count their db.execute entries.
  const bgPromises = Array.from({ length: BG_CONCURRENCY }, () =>
    fetch(`${baseUrl}/api/health/ready`).catch(() => {}),
  );

  // Block until every background handler is inside the 200 ms wait.
  // This guarantees the full concurrent load is active during CB measurement.
  await allBgActive;

  // Measure circuit-breaker probes while the background load is in flight.
  const raw = await Promise.all(
    Array.from({ length: CB_CONCURRENCY }, async () => {
      const t0 = performance.now();
      const res = await fetch(`${baseUrl}/api/health/circuit-breaker`);
      const latencyMs = performance.now() - t0;
      const body = (await res.json()) as {
        state: string;
        openedAt: string | null;
        openDurationMs: number | null;
      };
      return { latencyMs, status: res.status, body };
    }),
  );

  // Drain background requests so the server is fully idle before the next test.
  await Promise.allSettled(bgPromises);

  return {
    latencies: raw.map((r) => r.latencyMs),
    statuses: raw.map((r) => r.status),
    bodies: raw.map((r) => r.body),
  };
}

// ── Tests — CLOSED ────────────────────────────────────────────────────────────

describe(
  "GET /api/health/circuit-breaker — full-app concurrent load, state=CLOSED",
  () => {
    it(
      `all ${CB_CONCURRENCY} responses are 200 with state=CLOSED while ${BG_CONCURRENCY} slow-route requests are in flight`,
      async () => {
        await setCbState("CLOSED");
        const { statuses, bodies } = await fireUnderLoad();

        for (const status of statuses) expect(status).toBe(200);
        for (const body of bodies) {
          expect(body.state).toBe("CLOSED");
          expect(body.openedAt).toBeNull();
          expect(body.openDurationMs).toBeNull();
        }
      },
    );

    it(
      `p99 latency < ${P99_DEADLINE_MS} ms with ${BG_CONCURRENCY} concurrent slow-route requests active (state=CLOSED)`,
      async () => {
        await setCbState("CLOSED");
        const { latencies } = await fireUnderLoad();
        expect(p99(latencies)).toBeLessThan(P99_DEADLINE_MS);
      },
    );
  },
);

// ── Tests — OPEN ──────────────────────────────────────────────────────────────

describe(
  "GET /api/health/circuit-breaker — full-app concurrent load, state=OPEN",
  () => {
    it(
      `all ${CB_CONCURRENCY} responses are 200 with state=OPEN and valid timestamps while ${BG_CONCURRENCY} slow-route requests are in flight`,
      async () => {
        const openedAtMs = Date.now() - 10_000; // opened 10 s ago
        await setCbState("OPEN", openedAtMs);
        const { statuses, bodies } = await fireUnderLoad();

        for (const status of statuses) expect(status).toBe(200);
        for (const body of bodies) {
          expect(body.state).toBe("OPEN");
          expect(typeof body.openedAt).toBe("string");
          expect(new Date(body.openedAt!).toISOString()).toBe(body.openedAt);
          expect(typeof body.openDurationMs).toBe("number");
          expect(body.openDurationMs).toBeGreaterThanOrEqual(0);
        }
      },
    );

    it(
      `p99 latency < ${P99_DEADLINE_MS} ms with ${BG_CONCURRENCY} concurrent slow-route requests active (state=OPEN)`,
      async () => {
        const openedAtMs = Date.now() - 10_000;
        await setCbState("OPEN", openedAtMs);
        const { latencies } = await fireUnderLoad();
        expect(p99(latencies)).toBeLessThan(P99_DEADLINE_MS);
      },
    );
  },
);

// ── Tests — HALF_OPEN ─────────────────────────────────────────────────────────

describe(
  "GET /api/health/circuit-breaker — full-app concurrent load, state=HALF_OPEN",
  () => {
    it(
      `all ${CB_CONCURRENCY} responses are 200 with state=HALF_OPEN and valid timestamps while ${BG_CONCURRENCY} slow-route requests are in flight`,
      async () => {
        const openedAtMs = Date.now() - 25_000; // opened 25 s ago, now half-open
        await setCbState("HALF_OPEN", openedAtMs);
        const { statuses, bodies } = await fireUnderLoad();

        for (const status of statuses) expect(status).toBe(200);
        for (const body of bodies) {
          expect(body.state).toBe("HALF_OPEN");
          expect(typeof body.openedAt).toBe("string");
          expect(new Date(body.openedAt!).toISOString()).toBe(body.openedAt);
          expect(typeof body.openDurationMs).toBe("number");
          expect(body.openDurationMs).toBeGreaterThanOrEqual(0);
        }
      },
    );

    it(
      `p99 latency < ${P99_DEADLINE_MS} ms with ${BG_CONCURRENCY} concurrent slow-route requests active (state=HALF_OPEN)`,
      async () => {
        const openedAtMs = Date.now() - 25_000;
        await setCbState("HALF_OPEN", openedAtMs);
        const { latencies } = await fireUnderLoad();
        expect(p99(latencies)).toBeLessThan(P99_DEADLINE_MS);
      },
    );
  },
);
