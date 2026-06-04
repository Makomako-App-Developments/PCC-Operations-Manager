const { execSync } = require("child_process");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");

function getProductionDomain() {
  const raw =
    process.env.REPLIT_INTERNAL_APP_DOMAIN ||
    process.env.REPLIT_DEV_DOMAIN ||
    process.env.EXPO_PUBLIC_DOMAIN ||
    "";

  if (!raw) {
    console.error(
      "ERROR: Cannot determine deployment domain. " +
        "Set REPLIT_INTERNAL_APP_DOMAIN, REPLIT_DEV_DOMAIN, or EXPO_PUBLIC_DOMAIN.",
    );
    process.exit(1);
  }

  let urlString = raw.trim();
  if (!/^https?:\/\//i.test(urlString)) {
    urlString = `https://${urlString}`;
  }
  return new URL(urlString).host;
}

const domain = getProductionDomain();
console.log(`Building Expo web export for domain: ${domain}`);
console.log("Base URL: /field-ops (configured in app.json)");

const env = {
  ...process.env,
  EXPO_PUBLIC_DOMAIN: domain,
};

try {
  execSync("pnpm exec expo export --platform web", {
    stdio: "inherit",
    cwd: projectRoot,
    env,
  });
  console.log("Build complete! Output written to dist/");
} catch (error) {
  console.error("Build failed:", error.message);
  process.exit(1);
}
