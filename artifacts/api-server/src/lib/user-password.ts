export function canChangeUserPassword(
  callerRole: string,
  targetRole: string,
): boolean {
  if (callerRole === "administrator") return true;
  return callerRole === "manager" && targetRole !== "administrator";
}

export function passwordChangeAuditData<T extends Record<string, unknown>>(
  safeUser: T,
  passwordChanged: boolean,
): T | (T & { passwordChanged: true }) {
  return passwordChanged ? { ...safeUser, passwordChanged: true } : safeUser;
}
