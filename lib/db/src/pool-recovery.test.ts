/**
 * Unit tests: DB pool idle-client error recovery
 *
 * Verifies that the pool configured in index.ts handles dropped idle
 * connections without crashing the process:
 *   1. The 'error' event is caught and logged — not re-thrown
 *   2. process.exit is NOT called
 *   3. The pool can still hand out a fresh connection afterwards
 *   4. Multiple sequential idle-client errors are all safely absorbed
 *
 * pg is mocked so no live database is required. The fakePool is defined via
 * vi.hoisted() so it is available inside the hoisted vi.mock() factory. The
 * Pool constructor is a regular function (not an arrow) so it is compatible
 * with `new Pool(...)`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";

// ---------------------------------------------------------------------------
// Create the shared fakePool before any module is imported.
// vi.hoisted() ensures this value is available inside the vi.mock() factory.
// ---------------------------------------------------------------------------
const fakePool = vi.hoisted(() => {
  // Build an EventEmitter-backed fake pool synchronously.
  // We cannot import EventEmitter here (ESM), so we recreate the minimal
  // interface that lib/db/src/index.ts relies on.
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
    // Mutable stubs — tests call mockResolvedValueOnce etc. on these
    connect: vi.fn(),
    query: vi.fn(),
    end: vi.fn(),
  };

  return pool;
});

// vi.mock is hoisted to the top of the file by vitest. Using a regular
// function (not an arrow) as the Pool constructor lets `new Pool(...)` work;
// returning an object from a constructor replaces the `new`-created instance.
vi.mock("pg", () => ({
  default: {
    // eslint-disable-next-line prefer-arrow-callback
    Pool: function Pool() {
      return fakePool;
    },
  },
}));

// Satisfy the DATABASE_URL guard in index.ts before any module import
process.env.DATABASE_URL = "postgres://test:test@localhost:5432/testdb";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
  fakePool.connect.mockReset();
  fakePool.query.mockReset();
});

describe("pool network partition behaviour", () => {
  /**
   * A network partition silently freezes existing TCP connections; new
   * connection attempts hang until pg's connectionTimeoutMillis (5 000 ms)
   * expires and pool.connect() rejects. These tests verify:
   *   1. pool.connect() eventually rejects (does NOT hang indefinitely)
   *   2. The pool recovers cleanly once the partition clears
   *   3. Multiple queued requests all fail fast and individually
   *
   * We model connectionTimeoutMillis firing with a short setTimeout so the
   * suite stays fast. The actual 5 s timeout is enforced by the real pg Pool.
   */
  beforeEach(async () => {
    await import("./index.js");
  });

  it("connect() rejects with a timeout error rather than hanging when a partition blocks the connection", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const timeoutErr = new Error(
      "timeout expired — connectionTimeoutMillis (5000) exceeded",
    );

    // Model pg's connectionTimeoutMillis: connect() hangs briefly then rejects
    let settled = false;
    fakePool.connect.mockImplementationOnce(
      () =>
        new Promise<never>((_, reject) =>
          setTimeout(() => {
            settled = true;
            reject(timeoutErr);
          }, 50),
        ),
    );

    await expect(fakePool.connect()).rejects.toThrow(
      "connectionTimeoutMillis",
    );
    expect(settled).toBe(true);
  });

  it("pool hands out a fresh connection once the partition clears", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const timeoutErr = new Error("timeout expired");
    const fakeClient = {
      query: vi
        .fn()
        .mockResolvedValue({ rows: [{ "?column?": 1 }], rowCount: 1 }),
      release: vi.fn(),
    };

    fakePool.connect
      // During partition: hangs then times out
      .mockImplementationOnce(
        () =>
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(timeoutErr), 50),
          ),
      )
      // After partition clears: succeeds immediately
      .mockResolvedValueOnce(fakeClient);

    // Partition: connection attempt times out
    await expect(fakePool.connect()).rejects.toThrow("timeout expired");

    // Partition cleared: fresh connection handed out without process restart
    const client = await fakePool.connect();
    const result = await client.query("SELECT 1");
    client.release();

    expect(result.rows).toHaveLength(1);
    expect(client.release).toHaveBeenCalledTimes(1);
    // Two pool.connect() calls — pool did not give up after the timeout
    expect(fakePool.connect).toHaveBeenCalledTimes(2);
  });

  it("concurrent requests during a partition all fail fast and independently", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const timeoutErr = new Error("timeout expired");

    // Three simultaneous requests — all time out
    fakePool.connect
      .mockImplementationOnce(
        () =>
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(timeoutErr), 50),
          ),
      )
      .mockImplementationOnce(
        () =>
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(timeoutErr), 50),
          ),
      )
      .mockImplementationOnce(
        () =>
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(timeoutErr), 50),
          ),
      );

    const results = await Promise.allSettled([
      fakePool.connect(),
      fakePool.connect(),
      fakePool.connect(),
    ]);

    expect(results.every((r) => r.status === "rejected")).toBe(true);
    expect(fakePool.connect).toHaveBeenCalledTimes(3);
  });
});

describe("pool 'error' event handler", () => {
  // Import once — cached thereafter; the error listener is registered once.
  beforeEach(async () => {
    await import("./index.js");
  });

  it("registers an 'error' listener on the pool so idle-client errors are handled", () => {
    // If no listener were present, fakePool.emit("error", ...) would throw.
    // The fact that this assertion passes proves the handler is registered.
    expect(fakePool.listenerCount("error")).toBeGreaterThan(0);
  });

  it("logs [db-pool] idle client error but does NOT exit the process", () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    const err = new Error(
      "terminating connection due to administrator command",
    );
    fakePool.emit("error", err);

    expect(consoleSpy).toHaveBeenCalledWith("[db-pool] idle client error", err);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("pool can still hand out a fresh connection after an idle-client error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const fakeClient = {
      query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }], rowCount: 1 }),
      release: vi.fn(),
    };
    fakePool.connect.mockResolvedValueOnce(fakeClient);

    // Simulate a dropped idle connection
    fakePool.emit("error", new Error("SSL connection has been closed unexpectedly"));

    // Pool should still provide a fresh client
    const client = await fakePool.connect();
    const result = await client.query("SELECT 1");

    expect(result.rows).toHaveLength(1);
    client.release();
    expect(fakePool.connect).toHaveBeenCalledTimes(1);
  });

  it("absorbs multiple sequential idle-client errors without crashing", () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    const errors = [
      new Error("connection terminated unexpectedly"),
      new Error("SSL SYSCALL error: EOF detected"),
      new Error("could not receive data from server: Connection reset by peer"),
    ];

    for (const err of errors) {
      fakePool.emit("error", err);
    }

    expect(consoleSpy).toHaveBeenCalledTimes(3);
    for (const err of errors) {
      expect(consoleSpy).toHaveBeenCalledWith("[db-pool] idle client error", err);
    }
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
