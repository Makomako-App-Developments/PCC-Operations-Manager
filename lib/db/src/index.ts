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
/**
 * Maximum time a HALF_OPEN probe may be in-flight before it is considered
 * abandoned. If the caller that acquired the probe never calls
 * recordSuccess / recordFailure (e.g. due to a request-level timeout or an
 * unhandled rejection), probeInFlight would otherwise stay true forever,
 * permanently blocking recovery. After this window the next caller may start
 * a fresh probe. Set to twice connectionTimeoutMillis (2 × 5 s = 10 s) so
 * legitimate slow probes still have plenty of room, but a truly lost probe
 * does not block recovery for more than one extra recovery cycle.
 */
export const CB_PROBE_TIMEOUT_MS = 10_000;

export class DbCircuitBreaker {
  private state: CbState = "CLOSED";
  private consecutiveFailures = 0;
  private lastFailureAt = 0;
  /** Epoch ms when the circuit last opened; null when CLOSED. */
  private openedAt: number | null = null;
  /** True while the single HALF_OPEN probe is in-flight. */
  private probeInFlight = false;
  /** Epoch ms when the current probe was started; 0 when no probe is in-flight. */
  private probeStartedAt = 0;
  /**
   * Monotonically increasing generation counter. Incremented each time a new
   * HALF_OPEN probe is admitted (including when a timed-out probe is replaced).
   * Callers capture this value after tryAcquire() and supply it to
   * recordSuccess / recordFailure so that a stale, abandoned probe that
   * eventually settles cannot mutate the state of its replacement.
   */
  private probeGeneration = 0;
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
   * Returns the generation token of the probe that was most recently admitted
   * in HALF_OPEN state. Callers MUST read this immediately after a successful
   * tryAcquire() (no await in between — JS is single-threaded so the two
   * synchronous calls are atomic) and pass the token to recordSuccess /
   * recordFailure so that a late-settling abandoned probe cannot corrupt the
   * state of its replacement.
   *
   * Returns 0 when no HALF_OPEN probe has ever been issued (i.e. the breaker
   * has never left CLOSED) — callers in CLOSED state may pass any value or
   * omit the argument entirely.
   */
  getProbeGeneration(): number {
    return this.probeGeneration;
  }

  /**
   * Atomically decides whether a call should be allowed through.
   *
   * Returns `true`  → caller may proceed; immediately call getProbeGeneration()
   *                   to capture the ownership token (required in HALF_OPEN).
   * Returns `false` → caller must fast-fail (circuit is blocking).
   *
   * CLOSED    → always true.
   * OPEN      → always false.
   * HALF_OPEN → true for the FIRST caller only (sets probeInFlight, bumps
   *             probeGeneration). All other concurrent callers return false
   *             until the probe settles. If the in-flight probe has exceeded
   *             CB_PROBE_TIMEOUT_MS without settling, it is treated as
   *             abandoned and the next caller may take a fresh probe (the
   *             generation is bumped again so the stale probe's eventual
   *             settlement is ignored).
   */
  tryAcquire(): boolean {
    const state = this.getState();
    if (state === "CLOSED") return true;
    if (state === "OPEN") return false;
    // HALF_OPEN: serialise probes — only one in-flight at a time.
    if (!this.probeInFlight) {
      this.probeInFlight = true;
      this.probeStartedAt = this.clock();
      this.probeGeneration++;
      return true;
    }
    // If the in-flight probe has been running longer than CB_PROBE_TIMEOUT_MS,
    // treat it as abandoned (e.g. the caller timed out without ever settling
    // the probe). Bump the generation so the stale probe's eventual
    // recordSuccess / recordFailure is silently discarded, then admit a fresh
    // probe so recovery is not permanently blocked.
    if (this.clock() - this.probeStartedAt >= CB_PROBE_TIMEOUT_MS) {
      const now = this.clock();
      const probeAgeMs = now - this.probeStartedAt;
      console.warn(
        JSON.stringify({
          event: "db_circuit_breaker_probe_abandoned",
          message: `HALF_OPEN probe abandoned after ${probeAgeMs} ms — admitting fresh probe`,
          probeAgeMs,
          probeStartedAt: new Date(this.probeStartedAt).toISOString(),
          timestamp: new Date(now).toISOString(),
        }),
      );
      this.probeStartedAt = now;
      this.probeGeneration++;
      return true;
    }
    return false;
  }

  /**
   * Record that the most recent database call succeeded.
   *
   * @param probeGeneration — the generation token returned by
   *   getProbeGeneration() immediately after tryAcquire(). When supplied in
   *   HALF_OPEN state, the settlement is only applied if the token matches the
   *   current active generation; a stale token (from an abandoned probe that
   *   finally resolved) is silently discarded. Omitting the argument (or
   *   passing undefined) bypasses the generation check — acceptable for CLOSED
   *   state or unit tests that drive the state machine directly.
   */
  recordSuccess(probeGeneration?: number): void {
    // Ignore settlements from stale (abandoned) probes regardless of current
    // state. The generation check is intentionally state-agnostic: a stale
    // probe that fires *after* its replacement has already settled (moving the
    // breaker to CLOSED or OPEN) must not corrupt the new state — for example,
    // a stale success must not close a freshly-reopened breaker, and a stale
    // failure must not accumulate towards a reopen threshold after the breaker
    // has already been recovered. Omitting the argument (undefined) bypasses
    // the check for callers that do not hold a generation token (e.g. CLOSED-
    // state calls or direct unit-test invocations).
    if (
      probeGeneration !== undefined &&
      probeGeneration !== this.probeGeneration
    ) {
      return;
    }
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

  /**
   * Record that the most recent database call failed.
   *
   * @param probeGeneration — same ownership token as for recordSuccess().
   *   Stale tokens in HALF_OPEN state are silently discarded so an abandoned
   *   probe cannot re-open the circuit after its replacement succeeds.
   */
  recordFailure(probeGeneration?: number): void {
    // Same state-agnostic stale-probe guard as recordSuccess — see comment there.
    if (
      probeGeneration !== undefined &&
      probeGeneration !== this.probeGeneration
    ) {
      return;
    }
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
  // Capture the probe generation token synchronously (no await between tryAcquire
  // and this read — JS single-threaded guarantee makes this atomic). The token
  // is passed to recordSuccess / recordFailure so that a stale, abandoned probe
  // that eventually settles cannot corrupt the state of its replacement.
  const gen = dbCircuitBreaker.getProbeGeneration();
  try {
    const result = await fn();
    dbCircuitBreaker.recordSuccess(gen);
    return result;
  } catch (err) {
    dbCircuitBreaker.recordFailure(gen);
    throw err;
  }
}

export * from "./schema";
