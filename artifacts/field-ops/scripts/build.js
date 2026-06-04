const { execSync } = require("child_process");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");

console.log("Building Expo web export...");
console.log("Base URL: /field-ops (configured in app.json)");

try {
  execSync("pnpm exec expo export --platform web", {
    stdio: "inherit",
    cwd: projectRoot,
  });
  console.log("Build complete! Output written to dist/");
} catch (error) {
  console.error("Build failed:", error.message);
  process.exit(1);
}
