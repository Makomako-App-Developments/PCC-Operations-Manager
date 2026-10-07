import { createPublicKey, type KeyObject } from "node:crypto";
import jwt from "jsonwebtoken";

export const PHOTO_BACKUP_AUDIENCE = "pcc-operations-manager-photo-backup";
export const PHOTO_BACKUP_WORKFLOW =
  "Makomako-App-Developments/PCC-Operations-Manager/.github/workflows/azure-photo-backup.yml@refs/heads/master";
const ISSUER = "https://token.actions.githubusercontent.com";
const SUBJECT = "repo:Makomako-App-Developments@329351463/PCC-Operations-Manager@1376574979:ref:refs/heads/master";
let keys = new Map<string, KeyObject>();
let refreshedAt = 0;
let pending: Promise<void> | undefined;

async function githubKey(kid: string): Promise<KeyObject> {
  if (Date.now() - refreshedAt > 300_000 || (!keys.has(kid) && Date.now() - refreshedAt > 30_000)) {
    pending ??= (async () => {
      const response = await fetch(`${ISSUER}/.well-known/jwks`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error("Identity verification unavailable");
      const body = await response.json() as { keys?: Array<Record<string, unknown>> };
      if (!Array.isArray(body.keys) || body.keys.length === 0 || body.keys.length > 20) {
        throw new Error("Invalid identity keys");
      }
      const next = new Map<string, KeyObject>();
      for (const key of body.keys) {
        if (key.kty === "RSA" && typeof key.kid === "string" && key.use === "sig") {
          next.set(key.kid, createPublicKey({ key: key as never, format: "jwk" }));
        }
      }
      if (!next.size) throw new Error("No signing keys");
      keys = next;
      refreshedAt = Date.now();
    })().finally(() => { pending = undefined; });
    await pending;
  }
  const key = keys.get(kid);
  if (!key) throw new Error("Unknown identity key");
  return key;
}

/** Separate service identity; never accepts application cookies or user JWTs. */
export async function verifyPhotoBackupToken(
  token: string,
  resolveKey: (kid: string) => Promise<KeyObject> = githubKey,
): Promise<void> {
  if (token.length > 8192) throw new Error("Invalid identity token");
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || decoded.header.alg !== "RS256" ||
      typeof decoded.header.kid !== "string" || decoded.header.kid.length > 256) {
    throw new Error("Invalid identity token");
  }
  const payload = jwt.verify(token, await resolveKey(decoded.header.kid), {
    algorithms: ["RS256"], issuer: ISSUER, audience: PHOTO_BACKUP_AUDIENCE,
    clockTolerance: 15, maxAge: "20m",
  });
  if (typeof payload !== "object" ||
      payload.sub !== SUBJECT ||
      payload.repository_id !== "1376574979" ||
      payload.repository_owner_id !== "329351463" ||
      payload.ref !== "refs/heads/master" ||
      payload.workflow_ref !== PHOTO_BACKUP_WORKFLOW ||
      !["workflow_dispatch", "schedule"].includes(payload.event_name) ||
      typeof payload.exp !== "number" || typeof payload.iat !== "number" ||
      !Number.isFinite(payload.exp) || !Number.isFinite(payload.iat) ||
      payload.exp - payload.iat > 3600 || payload.exp <= payload.iat ||
      payload.iat > Date.now() / 1000 + 15 ||
      typeof payload.run_id !== "string" || !/^\d+$/.test(payload.run_id) ||
      typeof payload.run_attempt !== "string" || !/^\d+$/.test(payload.run_attempt)) {
    throw new Error("Untrusted backup identity");
  }
}
