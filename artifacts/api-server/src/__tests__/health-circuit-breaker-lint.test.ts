/**
 * Guard tests for the ESLint no-restricted-imports rule on health-circuit-breaker.ts.
 *
 * These tests verify that the constraint "this file must never import db or
 * executeWithCircuitBreaker from @workspace/db" is enforced by the linter, not
 * just by convention. The lint check is wired into the build via `prebuild` in
 * package.json, so every `pnpm build` aborts if the rule is violated.
 *
 * Tests do:
 *   1. Confirm `pnpm lint` exits 0 on the current, clean file.
 *   2. Confirm the rule flags a rogue `db` import via --stdin-filename (which
 *      applies the same file-scoped rule to injected source without touching the
 *      real file on disk).
 *   3. Confirm the rule flags a rogue `executeWithCircuitBreaker` import.
 *   4. Confirm a clean `dbCircuitBreaker`-only import does not trigger the rule.
 *
 * If a contributor accidentally adds `import { db } from "@workspace/db"` to
 * health-circuit-breaker.ts, test 1 fails AND `pnpm build` aborts. If someone
 * removes the ESLint rule, test 2/3 fail. Together they close both escape
 * hatches.
 */
import { describe, it, expect } from "vitest";
import { execSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";

// Root of the api-server package — tests run from the workspace root.
const PKG_ROOT = resolve(import.meta.dirname, "../..");

describe("ESLint import guard — health-circuit-breaker.ts", () => {
  it("pnpm lint passes on the current file — no rogue db imports present", () => {
    // If the file accidentally imports db or executeWithCircuitBreaker this exits non-zero.
    expect(() =>
      execSync("pnpm --silent lint", {
        cwd: PKG_ROOT,
        stdio: "pipe",
        encoding: "utf8",
      }),
    ).not.toThrow();
  });

  it("the no-restricted-imports rule flags a rogue `db` import — rule is active", () => {
    // Inject source code that imports `db`, pretending it is health-circuit-breaker.ts.
    // ESLint picks up eslint.config.mjs and applies the file-scoped rule.
    const rogueSource = [
      'import { Router } from "express";',
      // This import must be caught:
      'import { dbCircuitBreaker, db } from "@workspace/db";',
      "const router = Router();",
      "export default router;",
    ].join("\n");

    const result = spawnSync(
      "node_modules/.bin/eslint",
      [
        "--stdin",
        "--stdin-filename",
        "src/routes/health-circuit-breaker.ts",
      ],
      {
        cwd: PKG_ROOT,
        input: rogueSource,
        encoding: "utf8",
      },
    );

    // ESLint exits 1 when there are lint errors.
    expect(result.status).toBe(1);

    // The output should mention the specific restricted-import.
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/no-restricted-imports/);
  });

  it("the no-restricted-imports rule flags a rogue `executeWithCircuitBreaker` import — rule is active", () => {
    const rogueSource = [
      'import { Router } from "express";',
      // This import must be caught:
      'import { dbCircuitBreaker, executeWithCircuitBreaker } from "@workspace/db";',
      "const router = Router();",
      "export default router;",
    ].join("\n");

    const result = spawnSync(
      "node_modules/.bin/eslint",
      [
        "--stdin",
        "--stdin-filename",
        "src/routes/health-circuit-breaker.ts",
      ],
      {
        cwd: PKG_ROOT,
        input: rogueSource,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/no-restricted-imports/);
  });

  it("a clean import of dbCircuitBreaker alone passes the rule", () => {
    // Only dbCircuitBreaker is allowed — verify the rule is correctly scoped.
    const cleanSource = [
      'import { Router } from "express";',
      'import { dbCircuitBreaker } from "@workspace/db";',
      "const router = Router();",
      "export default router;",
    ].join("\n");

    const result = spawnSync(
      "node_modules/.bin/eslint",
      [
        "--stdin",
        "--stdin-filename",
        "src/routes/health-circuit-breaker.ts",
      ],
      {
        cwd: PKG_ROOT,
        input: cleanSource,
        encoding: "utf8",
      },
    );

    // Should exit 0 — no violations.
    expect(result.status).toBe(0);
  });
});
