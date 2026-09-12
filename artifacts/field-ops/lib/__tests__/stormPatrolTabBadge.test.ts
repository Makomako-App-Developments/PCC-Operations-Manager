import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  isStormPatrolPath,
  stormPatrolTabBadgePresentation,
} from "../stormPatrolTabBadge";

describe("Storm Patrol bottom-tab badge", () => {
  it("renders an accessible red-dot value only when pending work is unseen", () => {
    expect(stormPatrolTabBadgePresentation(true)).toEqual({
      classicBadge: " ",
      accessibilityLabel: "Storm Patrol, new jobs available",
      nativeBadge: { children: "1", hidden: false },
    });
    expect(stormPatrolTabBadgePresentation(false)).toEqual({
      classicBadge: undefined,
      accessibilityLabel: "Storm Patrol",
      nativeBadge: { children: undefined, hidden: true },
    });
  });

  it("marks the badge as read only while the Storm Patrol tab is active", () => {
    expect(isStormPatrolPath("/storm-patrol")).toBe(true);
    expect(isStormPatrolPath("/field-ops/storm-patrol")).toBe(true);
    expect(isStormPatrolPath("/")).toBe(false);
  });

  it("keeps navigation modules lazily loaded to avoid production initialization crashes", async () => {
    const source = await readFile("app/(tabs)/_layout.tsx", "utf8");
    expect(source).not.toMatch(/from ["']expo-router["']/);
    expect(source).not.toMatch(/from ["']expo-blur["']/);
    expect(source).not.toMatch(/from ["']expo-symbols["']/);
    expect(source).not.toMatch(/from ["']expo-router\/unstable-native-tabs["']/);
    expect(source).toContain('require("expo-router")');
    expect(source).toContain('require("expo-router/unstable-native-tabs")');
  });
});