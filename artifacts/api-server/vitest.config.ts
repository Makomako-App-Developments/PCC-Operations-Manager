import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals:     true,
    environment: "node",
    include:     ["src/**/*.test.ts", "src/**/*.spec.ts"],
    // Run test files sequentially to prevent sustained-load tests and
    // concurrency-load tests from saturating the event loop simultaneously.
    // Without this, the tight REGRESSION_THRESHOLD_MS in the CB concurrency
    // suite occasionally flips when a new parallel load-test file is added.
    // The wall-clock overhead is small (the test suite accumulates ~40 s of
    // test work; sequential execution adds only scheduling overhead).
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include:  ["src/**/*.ts"],
      exclude:  ["src/**/*.test.ts", "src/**/*.spec.ts", "src/index.ts"],
    },
  },
});
