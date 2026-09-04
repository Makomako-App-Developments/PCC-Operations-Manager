import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../lib/password";
import {
  canChangeUserPassword,
  passwordChangeAuditData,
} from "../lib/user-password";

describe("manager password management", () => {
  it("allows managers to change staff passwords but not administrator passwords", () => {
    expect(canChangeUserPassword("manager", "field_worker")).toBe(true);
    expect(canChangeUserPassword("manager", "supervisor")).toBe(true);
    expect(canChangeUserPassword("manager", "manager")).toBe(true);
    expect(canChangeUserPassword("manager", "administrator")).toBe(false);
    expect(canChangeUserPassword("administrator", "administrator")).toBe(true);
  });

  it("stores a one-way password hash rather than the plaintext value", async () => {
    const password = "Managed-Password-42!";
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    expect(hash).not.toContain(password);
    expect(await verifyPassword(password, hash)).toBe(true);
  });

  it("records a password-change event without adding password data", () => {
    const auditData = passwordChangeAuditData(
      { id: "user-1", email: "worker@example.test", role: "field_worker" },
      true,
    );

    expect(auditData).toEqual({
      id: "user-1",
      email: "worker@example.test",
      role: "field_worker",
      passwordChanged: true,
    });
    expect(auditData).not.toHaveProperty("password");
    expect(auditData).not.toHaveProperty("passwordHash");
  });
});
