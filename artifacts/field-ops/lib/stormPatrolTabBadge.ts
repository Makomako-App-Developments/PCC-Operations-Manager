export function isStormPatrolPath(pathname: string) {
  return pathname.endsWith("/storm-patrol");
}

export function stormPatrolTabBadgePresentation(hasUnseenJobs: boolean) {
  return {
    classicBadge: hasUnseenJobs ? "1" : undefined,
    accessibilityLabel: hasUnseenJobs ? "Storm Patrol, new jobs available" : "Storm Patrol",
    nativeBadge: {
      children: hasUnseenJobs ? "1" : undefined,
      hidden: !hasUnseenJobs,
    },
  };
}