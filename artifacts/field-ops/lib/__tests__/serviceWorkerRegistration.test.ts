import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const requireFromProject = createRequire(`${process.cwd()}/package.json`);
const { createServiceWorkerRegistration } = requireFromProject(
  "./scripts/service-worker-registration.js",
) as {
  createServiceWorkerRegistration: (basePath: string) => string;
};

describe("service worker registration", () => {
  it("handles registration rejection instead of creating an unhandled promise rejection", () => {
    const markup = createServiceWorkerRegistration("/field-ops");

    expect(markup).toContain('register("/field-ops/service-worker.js", { scope: "/field-ops/" })');
    expect(markup).toContain(".catch(function (error)");
    expect(markup).toContain('console.warn("[pwa] Service worker registration failed", error)');
  });
});