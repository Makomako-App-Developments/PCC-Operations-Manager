const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const appRoot = path.join(projectRoot, "app");

const TEST_DIRECTORY_NAMES = new Set([
  "__tests__",
  "__test__",
  "__specs__",
  "__spec__",
]);
const TEST_FILE_SUFFIX = /\.(?:test|spec)(?:\.[^.]+)+$/i;
const VITEST_IMPORT = /(?:from\s+["']vitest["']|require\(\s*["']vitest["']\s*\))/;

function isTestFile(fileName, relativePath, contents) {
  const pathParts = relativePath.split(path.sep);
  return (
    pathParts.some((part) => TEST_DIRECTORY_NAMES.has(part)) ||
    TEST_FILE_SUFFIX.test(fileName) ||
    VITEST_IMPORT.test(contents)
  );
}

function findRouteTestFiles(root = appRoot) {
  if (!fs.existsSync(root)) return [];

  const violations = [];

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;

      const relativePath = path.relative(root, absolutePath);
      let contents = "";
      try {
        contents = fs.readFileSync(absolutePath, "utf8");
      } catch {
        // A file that cannot be read should still be reported by Expo or Git.
        // The guard only needs contents to identify an otherwise ordinary file.
      }

      if (isTestFile(entry.name, relativePath, contents)) {
        violations.push(relativePath);
      }
    }
  }

  visit(root);
  return violations.sort();
}

function assertNoRouteTests(root = appRoot) {
  const violations = findRouteTestFiles(root);
  if (violations.length === 0) return true;

  console.error(
    "Field Ops production build blocked: test/spec files cannot be placed under artifacts/field-ops/app.",
  );
  console.error(
    "Expo Router treats every file in that directory as a production route. Move these files outside the route tree:",
  );
  for (const violation of violations) {
    console.error(`  - app/${violation}`);
  }
  return false;
}

if (require.main === module) {
  process.exitCode = assertNoRouteTests() ? 0 : 1;
}

module.exports = { assertNoRouteTests, findRouteTestFiles };