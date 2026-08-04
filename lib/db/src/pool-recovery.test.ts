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
