import { describe, expect, it } from "vitest";
import {
  DbCircuitBreaker,
  dbCircuitBreaker,
  executeWithCircuitBreaker,
  isTransientDatabaseRestartError,
  type CircuitBreakerOperationOptions,
} from "./index.js";
import { afterEach, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("transient database restart classification", () => {
  it("recognises PostgreSQL administrator shutdown errors", () => {
    expect(isTransientDatabaseRestartError(Object.assign(new Error("terminating connection due to administrator command"), { code: "57P01" }))).toBe(true);
    expect(isTransientDatabaseRestartError(Object.assign(new Error("server closed connection unexpectedly"), { code: "08006" }))).toBe(true);
  });

  it("does not classify ordinary query failures as restart errors", () => {
    expect(isTransientDatabaseRestartError(Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" }))).toBe(false);
  });
});

describe("safe-read retry contract", () => {
  it("retries one transient failure for an explicitly safe read", async () => {
    vi.spyOn(dbCircuitBreaker, "tryAcquire").mockReturnValue(true);
    vi.spyOn(dbCircuitBreaker, "getProbeGeneration").mockReturnValue(0);
    const success = vi.spyOn(dbCircuitBreaker, "recordSuccess");
    const failure = vi.spyOn(dbCircuitBreaker, "recordFailure");
    const read = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("terminating connection due to administrator command"), { code: "57P01" }))
      .mockResolvedValueOnce(["recovered"]);

    await expect(executeWithCircuitBreaker(read, { safeRead: true })).resolves.toEqual(["recovered"]);
    expect(read).toHaveBeenCalledTimes(2);
    expect(success).toHaveBeenCalledOnce();
    expect(failure).not.toHaveBeenCalled();
  });

  it("does not retry a transient failure for the default write operation", async () => {
    vi.spyOn(dbCircuitBreaker, "tryAcquire").mockReturnValue(true);
    vi.spyOn(dbCircuitBreaker, "getProbeGeneration").mockReturnValue(0);
    const write = vi.fn().mockRejectedValue(
      Object.assign(new Error("terminating connection due to administrator command"), { code: "57P01" }),
    );

    await expect(executeWithCircuitBreaker(write)).rejects.toMatchObject({ code: "57P01" });
    expect(write).toHaveBeenCalledOnce();
  });
});