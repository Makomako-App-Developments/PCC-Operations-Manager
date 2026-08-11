/**
 * ESLint flat config for @workspace/api-server
 *
 * Key rule: health-circuit-breaker.ts must never import `db` or
 * `executeWithCircuitBreaker` from @workspace/db.
 *
 * The /health/circuit-breaker endpoint is the one health route that must never
 * touch the DB pool — it is safe to poll at high frequency precisely because it
 * reads in-memory circuit-breaker state only. If a future contributor
 * accidentally adds a db.execute() call (e.g. to log a state change), it would
 * silently add pool pressure and defeat the point of the endpoint.
 *
 * This rule makes that constraint fail-fast: `pnpm lint` exits non-zero as soon
 * as the import appears, before tests run and before the code ships.
 */
import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["src/routes/health-circuit-breaker.ts"],
    languageOptions: {
      parser: tsParser,
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@workspace/db",
              importNames: ["db"],
              message:
                "health-circuit-breaker.ts must never import `db` — this endpoint must not issue any DB query. " +
                "Add DB access to a different health route (e.g. /health/ready) instead.",
            },
            {
              name: "@workspace/db",
              importNames: ["executeWithCircuitBreaker"],
              message:
                "health-circuit-breaker.ts must never import `executeWithCircuitBreaker` — this endpoint must not issue any DB query. " +
                "Add DB access to a different health route (e.g. /health/ready) instead.",
            },
          ],
        },
      ],
    },
  },
];
