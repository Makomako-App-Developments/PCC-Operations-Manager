import { describe, expect, it } from "vitest";
import { isRenderableBoundary } from "../boundaryValidation";

describe("partial asset boundary data", () => {
  it("accepts a complete polygon", () => {
    expect(isRenderableBoundary({
      type: "Polygon",
      coordinates: [[[-41.1, 174.8], [-41.2, 174.8], [-41.2, 174.9]]],
    })).toBe(true);
  });

  it.each([
    undefined,
    null,
    { type: "Polygon", coordinates: [] },
    { type: "Polygon", coordinates: [[]] },
    { type: "Polygon", coordinates: [[[-41.1, 174.8], ["bad", 174.8], [-41.2, 174.9]]] },
  ])("rejects malformed boundary %j without throwing", (boundary) => {
    expect(isRenderableBoundary(boundary as never)).toBe(false);
  });
});