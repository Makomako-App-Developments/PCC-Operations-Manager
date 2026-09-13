export function programmeCompletionAudit(
  previousStatus: string,
  nextStatus: unknown,
  userId: string,
  completedAt = new Date(),
) {
  if (nextStatus !== "completed" || previousStatus === "completed") return {};
  return { completedAt, completedById: userId };
}

export function mulchingCompletionAudit(
  previousStatus: string,
  nextStatus: unknown,
  userId: string,
  completedAt = new Date(),
) {
  if (previousStatus === "completed" && nextStatus !== undefined && nextStatus !== "completed") {
    return {
      completedAt: null,
      completedById: null,
      completedDate: null,
    };
  }
  const audit = programmeCompletionAudit(previousStatus, nextStatus, userId, completedAt);
  if (!("completedAt" in audit)) return audit;
  return {
    ...audit,
    completedDate: completedAt.toISOString().slice(0, 10),
  };
}