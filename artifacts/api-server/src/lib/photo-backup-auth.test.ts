import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import jwt from "jsonwebtoken";
import { PHOTO_BACKUP_AUDIENCE, PHOTO_BACKUP_WORKFLOW, verifyPhotoBackupToken } from "./photo-backup-auth";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const now = Math.floor(Date.now() / 1000);
const claims = {
  iss: "https://token.actions.githubusercontent.com", aud: PHOTO_BACKUP_AUDIENCE,
  sub: "repo:Makomako-App-Developments@329351463/PCC-Operations-Manager@1376574979:ref:refs/heads/master",
  repository_id: "1376574979", repository_owner_id: "329351463",
  workflow_ref: PHOTO_BACKUP_WORKFLOW, ref: "refs/heads/master", event_name: "workflow_dispatch",
  run_id: "123", run_attempt: "1", iat: now, exp: now + 900,
};
function token(change = {}) {
  return jwt.sign({ ...claims, ...change }, privateKey, { algorithm: "RS256", keyid: "test" });
}
describe("photo backup service identity", () => {
  it("accepts only a verified repository, branch, workflow and audience", async () => {
    await expect(verifyPhotoBackupToken(token(), async () => publicKey)).resolves.toBeUndefined();
  });
  it.each([
    { repository_id: "other" }, { repository_owner_id: "other" }, { ref: "refs/heads/other" },
    { workflow_ref: "other" }, { event_name: "pull_request" }, { aud: "other" },
    { iss: "other" }, { sub: "other" }, { run_id: 123 }, { exp: now - 1 },
    { iat: now + 300, exp: now + 600 }, { exp: now + 4000 },
  ])("rejects malformed or unauthorized signed claims: %j", async change => {
    await expect(verifyPhotoBackupToken(token(change), async () => publicKey)).rejects.toThrow();
  });
  it("rejects user JWTs and wrong signing keys", async () => {
    await expect(verifyPhotoBackupToken(jwt.sign({ id: 1 }, "dummy-user-secret"), async () => publicKey)).rejects.toThrow();
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
    await expect(verifyPhotoBackupToken(token(), async () => other.publicKey)).rejects.toThrow();
  });
});
