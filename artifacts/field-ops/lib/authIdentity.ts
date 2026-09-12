export interface AuthOwnerGuard {
  ownerId: string;
  generation: number;
}

let currentOwnerId: string | null = null;
let generation = 0;

export function setCurrentAuthOwner(ownerId: string | null): void {
  if (currentOwnerId === ownerId) return;
  currentOwnerId = ownerId;
  generation += 1;
}

export function captureAuthOwner(ownerId: string): AuthOwnerGuard {
  if (currentOwnerId !== ownerId) {
    throw new Error("The signed-in account changed. This photo remains queued for its original owner.");
  }
  return { ownerId, generation };
}

export function assertAuthOwner(guard: AuthOwnerGuard): void {
  if (currentOwnerId !== guard.ownerId || generation !== guard.generation) {
    throw new Error("The signed-in account changed. This photo remains queued for its original owner.");
  }
}

export function assertRefreshedTokenOwner(token: string): void {
  let tokenOwner: unknown;
  try {
    const payload = token.split(".")[1];
    if (!payload || typeof globalThis.atob !== "function") throw new Error("Invalid access token");
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    tokenOwner = JSON.parse(globalThis.atob(padded)).userId;
  } catch {
    tokenOwner = null;
  }
  if (typeof tokenOwner !== "string" || tokenOwner !== currentOwnerId) {
    setCurrentAuthOwner(null);
    throw new Error("The refreshed session belongs to a different account.");
  }
}