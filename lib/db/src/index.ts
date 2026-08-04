import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

/**
 * Pool configuration — network-partition behaviour
 * -------------------------------------------------
 * connectionTimeoutMillis (5 000 ms)
 *   Caps how long pool.connect() will wait for a new TCP connection.
 *   During a partition, any new connection attempt rejects after 5 s with
 *   a timeout error instead of hanging indefinitely. This is the primary
 *   guard that keeps /health/ready responsive during a partition.
 *
 * keepAlive / keepAliveInitialDelayMillis (10 000 ms)
 *   Once a TCP connection is established, the OS sends keepalive probes
 *   after 10 s of inactivity. If the remote side is unreachable (partition),
 *   the probes fail and the OS closes the socket — at which point pg emits
 *   an 'error' event on the pool for that idle client. The pool's 'error'
 *   listener (below) absorbs this without crashing the process.
 *   Note: the OS-level TCP_KEEPINTVL + TCP_KEEPCNT determine the total time
 *   before the kernel gives up (~90 s on Linux defaults). keepAlive ensures
 *   this happens rather than leaving zombie connections open forever.
 *
 * idleTimeoutMillis (30 000 ms)
 *   Closes idle pool clients after 30 s. During a clean idle period this
 *   reduces the number of sockets that need to be recovered by keepalive
 *   probes after a partition clears.
 *
 * Together these settings mean:
 *   - New requests during a partition: fail within 5 s (connectionTimeoutMillis)
 *   - Idle clients that were alive at partition start: recovered within
 *     ~10 s + OS TCP keepalive timeout (keepAlive + keepAliveInitialDelayMillis)
 *   - No hung requests, no zombie connections
 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

pool.on("error", (err) => {
  console.error("[db-pool] idle client error", err);
});

export const db = drizzle(pool, { schema });

// ---------------------------------------------------------------------------
// Circuit breaker — prevents a thundering herd of reconnect attempts from
// overwhelming a freshly-restarted Postgres after an outage.
//
// States:
//   CLOSED    — normal operation; all queries pass through.
//   OPEN      — DB has been failing; queries fast-fail immediately with
//               code CIRCUIT_OPEN so callers return 503 without queuing up
//               and waiting out connectionTimeoutMillis on every probe.
//   HALF_OPEN — recovery window: exactly ONE probe is allowed through at a
//               time (tracked by `probeInFlight`). Concurrent requests while
//               a probe is in-flight fast-fail just like OPEN. Success closes
//               the circuit; failure re-opens it and resets the timer.
//
// Tuning constants:
//   FAILURE_THRESHOLD   — consecutive failures before opening (default 3)
//   RECOVERY_TIMEOUT_MS — how long to stay OPEN before allowing a probe (15 s)
//
// The class is exported so it can be instantiated with an injected clock in
// tests — the singleton `dbCircuitBreaker` is what production code uses.
// ---------------------------------------------------------------------------

export type CbState = "CLOSED" | "OPEN" | "HALF_OPEN";

export const CB_FAILURE_THRESHOLD = 3;
export const CB_RECOVERY_TIMEOUT_MS = 15_000;

export class DbCircuitBreaker {
  private state: CbState = "CLOSED";
  private consecutiveFailures = 0;
  private lastFailureAt = 0;
  /** Epoch ms when the circuit last opened; null when CLOSED. */
  private openedAt: number | null = null;
  /** True while the single HALF_OPEN probe is in-flight. */
  private probeInFlight = false;
  private readonly clock: () => number;

  /** @param clock — injectable clock; defaults to Date.now for production. */
  constructor(clock: () => number = Date.now) {
    this.clock = clock;
  }

  /** Current state — useful for health/metrics responses. */
  getState(): CbState {
    // Transition OPEN → HALF_OPEN once the recovery window has elapsed.
    if (
      this.state === "OPEN" &&
      this.clock() - this.lastFailureAt >= CB_RECOVERY_TIMEOUT_MS
    ) {
      this.state = "HALF_OPEN";
    }
    return this.state;
  }

  /**
   * Returns the epoch ms timestamp when the circuit last opened, or null
   * when CLOSED. Useful for health responses (time-since-open calculation).
   */
  getOpenedAt(): number | null {
    return this.openedAt;
  }

  /**
   * Atomically decides whether a call should be allowed through.
   *
   * Returns `true`  → caller may proceed.
   * Returns `false` → caller must fast-fail (circuit is blocking).
   *
   * CLOSED    → always true.
   * OPEN      → always false.
   * HALF_OPEN → true for the FIRST caller only (sets probeInFlight).
   *             All other concurrent callers return false until the probe
   *             settles and `recordSuccess` / `recordFailure` is called.
   */
  tryAcquire(): boolean {
    const state = this.getState();
    if (state === "CLOSED") return true;
    if (state === "OPEN") return false;
    // HALF_OPEN: serialise probes — only one in-flight at a time.
    if (!this.probeInFlight) {
      this.probeInFlight = true;
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.probeInFlight = false;
    this.consecutiveFailures = 0;
    if (this.state !== "CLOSED") {
      console.info(
        JSON.stringify({
          event: "db_circuit_breaker_closed",
          message: "Circuit breaker CLOSED — database recovered",
          timestamp: new Date(this.clock()).toISOString(),
        }),
      );
    }
    this.state = "CLOSED";
    this.openedAt = null;
  }

  recordFailure(): void {
    this.probeInFlight = false;
    this.consecutiveFailures++;
    this.lastFailureAt = this.clock();
    if (this.consecutiveFailures >= CB_FAILURE_THRESHOLD) {
      if (this.state !== "OPEN") {
        const now = this.clock();
        this.openedAt = now;
        // Structured log event — parseable by log aggregators and Sentry.
        console.error(
          JSON.stringify({
            event: "db_circuit_breaker_opened",
            message: `Circuit breaker OPEN after ${this.consecutiveFailures} consecutive DB failures`,
            consecutiveFailures: this.consecutiveFailures,
            openedAt: new Date(now).toISOString(),
            recoverAfterMs: CB_RECOVERY_TIMEOUT_MS,
          }),
        );
      }
      this.state = "OPEN";
    }
  }
}

export const dbCircuitBreaker = new DbCircuitBreaker();

/**
 * Wraps any database operation with circuit-breaker logic.
 *
 * - When OPEN or HALF_OPEN (with probe already in-flight):
 *     throws immediately with `code: "CIRCUIT_OPEN"` so the caller can
 *     return 503 without waiting for the pool connection timeout.
 * - When HALF_OPEN (first caller):
 *     lets one probe through; closes on success, re-opens on failure.
 * - When CLOSED:
 *     transparent pass-through; records success / failure.
 *
 * Usage:
 *   const rows = await executeWithCircuitBreaker(() => db.execute(sql`SELECT 1`));
 */
export async function executeWithCircuitBreaker<T>(
  fn: () => Promise<T>,
): Promise<T> {
  if (!dbCircuitBreaker.tryAcquire()) {
    throw Object.assign(
      new Error("Circuit breaker OPEN — database is temporarily unavailable"),
      { code: "CIRCUIT_OPEN" },
    );
  }
  try {
    const result = await fn();
    dbCircuitBreaker.recordSuccess();
    return result;
  } catch (err) {
    dbCircuitBreaker.recordFailure();
    throw err;
  }
}

export * from "./schema";
