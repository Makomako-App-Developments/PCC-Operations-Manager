import { beforeEach, describe, expect, it } from "vitest";
import {
  assertAuthOwner,
  assertRefreshedTokenOwner,
  captureAuthOwner,
  setCurrentAuthOwner,
} from "../authIdentity";

function tokenFor(userId: string): string {
  const payload = btoa(JSON.stringify({ userId }));
    return `header.${payload}.signature`;
}

describe("auth-bound queued uploads", () => {
  beforeEach(() => setCurrentAuthOwner("user-one"));

  it("accepts a refreshed access token for the same owner", () => {
    expect(() => assertRefreshedTokenOwner(tokenFor("user-one"))).not.toThrow();
    expect(() => assertAuthOwner(captureAuthOwner("user-one"))).not.toThrow();
  });

  it("invalidates the upload generation when another tab refreshes as a different owner", () => {
    const guard = captureAuthOwner("user-one");
    expect(() => assertRefreshedTokenOwner(tokenFor("user-two"))).toThrow("different account");
    expect(() => assertAuthOwner(guard)).toThrow("signed-in account changed");
  });
});