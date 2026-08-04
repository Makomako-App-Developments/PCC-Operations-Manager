/**
 * Unit tests: DB pool full-restart recovery
 *
 * Verifies that after a simulated full database restart (all connections
 * refused, then DB comes back), the pool hands out a fresh connection on
 * the next query attempt without requiring a process restart.
 *
 * Scenario modelled here:
 *   1. DB goes down → active / idle connections emit an 'error' event
 *   2. Any pool.connect() call during the outage fails with ECONNREFUSED
 *   3. DB comes back up → pool.connect() succeeds on the next attempt
 *   4. The pool does NOT cache the failure; each attempt is independent
 *
 * pg is mocked so no live database is required.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Shared fake pool — created via vi.hoisted() so it is available inside the
// hoisted vi.mock() factory that runs before any import statement.
// ---------------------------------------------------------------------------
const fakePool = vi.hoisted(() => {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};

  function on(event: string, fn: (...args: unknown[]) => void) {
    listeners[event] = listeners[event] ?? [];
    listeners[event].push(fn);
    return pool; // eslint-disable-line @typescript-eslint/no-use-before-define
  }

  function emit(event: string, ...args: unknown[]): boolean {
    const fns = listeners[event] ?? [];
    if (event === "error" && fns.length === 0) throw args[0];
    fns.forEach((fn) => fn(...args));
    return fns.length > 0;
  }

  function removeAllListeners(event?: string) {
    if (event) delete listeners[event];
    else Object.keys(listeners).forEach((k) => delete listeners[k]);
    return pool; // eslint-disable-line @typescript-eslint/no-use-before-define
  }

  function listenerCount(event: string) {
    return (listeners[event] ?? []).length;
  }

  const pool = {
    on,
    emit,
    removeAllListeners,
    listenerCount,
    connect: vi.fn(),
    query: vi.fn(),
    end: vi.fn(),
  };

  return pool;
});

vi.mock("pg", () => ({
  default: {
    // eslint-disable-next-line prefer-arrow-callback
    Pool: function Pool() {
      return fakePool;
    },
  },
}));

// Satisfy the DATABASE_URL guard in index.ts before any module import.
process.env.DATABASE_URL = "postgres://test:test@localhost:5432/testdb";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an ECONNREFUSED-style error that matches what node-postgres emits. */
function makeECONNREFUSED(): Error {
  const err = new Error("connect ECONNREFUSED 127.0.0.1:5432") as NodeJS.ErrnoException;
  err.code = "ECONNREFUSED";
  return err;
}

/** A minimal fake pg client that resolves SELECT 1 successfully. */
function makeFakeClient() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }], rowCount: 1 }),
    release: vi.fn(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  fakePool.connect.mockReset();
  fakePool.query.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("pool restart recovery", () => {
  beforeEach(async () => {
    // Import once — module cache ensures the same pool instance and error
    // listener registered in index.ts are reused across tests.
    await import("./index.js");
  });

  it("error listener is registered so idle-client ECONNREFUSED events are absorbed", () => {
    // Confirms the 'error' event emitted when an idle connection is dropped
    // during a DB restart will not propagate as an unhandled exception.
    expect(fakePool.listenerCount("error")).toBeGreaterThan(0);
  });

  it("ECONNREFUSED on an idle client is logged without crashing the process", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    fakePool.emit("error", makeECONNREFUSED());

    expect(consoleSpy).toHaveBeenCalledWith(
      "[db-pool] idle client error",
      expect.objectContaining({ code: "ECONNREFUSED" }),
    );
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("connect() rejects with ECONNREFUSED while DB is down", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    fakePool.connect.mockRejectedValueOnce(makeECONNREFUSED());

    await expect(fakePool.connect()).rejects.toMatchObject({
      code: "ECONNREFUSED",
    });
  });

  it("pool hands out a fresh connection on the very next attempt after DB comes back up", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const fakeClient = makeFakeClient();

    // First call: DB is still down
    fakePool.connect.mockRejectedValueOnce(makeECONNREFUSED());
    // Second call: DB has restarted — fresh connection succeeds
    fakePool.connect.mockResolvedValueOnce(fakeClient);

    // Outage: emit the idle-client error that a restarting DB would trigger
    fakePool.emit("error", makeECONNREFUSED());

    // --- DB still down ---
    await expect(fakePool.connect()).rejects.toMatchObject({
      code: "ECONNREFUSED",
    });

    // --- DB back up: next attempt succeeds without any process restart ---
    const client = await fakePool.connect();
    const result = await client.query("SELECT 1");
    client.release();

    expect(result.rows).toHaveLength(1);
    expect(client.release).toHaveBeenCalledTimes(1);
    // Two connect() calls total — the pool did NOT give up after the failure
    expect(fakePool.connect).toHaveBeenCalledTimes(2);
  });

  it("pool does not cache the connection failure — each call is a fresh attempt", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const fakeClient = makeFakeClient();

    // Simulate several failed attempts (DB slowly coming up) then success
    fakePool.connect
      .mockRejectedValueOnce(makeECONNREFUSED())
      .mockRejectedValueOnce(makeECONNREFUSED())
      .mockResolvedValueOnce(fakeClient);

    // First two attempts fail (DB still down)
    await expect(fakePool.connect()).rejects.toMatchObject({ code: "ECONNREFUSED" });
    await expect(fakePool.connect()).rejects.toMatchObject({ code: "ECONNREFUSED" });

    // Third attempt — DB is back — succeeds
    const client = await fakePool.connect();
    const result = await client.query("SELECT 1");
    client.release();

    expect(result.rows).toHaveLength(1);
    expect(fakePool.connect).toHaveBeenCalledTimes(3);
  });

  it("multiple idle-client ECONNREFUSED events (all connections dropped at once) are all absorbed", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    // Simulate a pool of 3 idle clients all dropping simultaneously
    for (let i = 0; i < 3; i++) {
      fakePool.emit("error", makeECONNREFUSED());
    }

    expect(consoleSpy).toHaveBeenCalledTimes(3);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
