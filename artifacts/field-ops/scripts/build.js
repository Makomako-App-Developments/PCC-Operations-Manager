const { execSync } = require("child_process");
const fs = require("fs");
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

  // Patch dist/index.html: viewport-fit=cover + full overflow lock for iOS Safari
  const indexPath = path.join(projectRoot, "dist", "index.html");
  let html = fs.readFileSync(indexPath, "utf8");

  // Add viewport-fit=cover to the viewport meta tag
  html = html.replace(
    /(<meta name="viewport" content="[^"]*)(")(\s*\/>)/,
    (_, before, _q, end) => {
      if (before.includes("viewport-fit")) return before + '"' + end;
      return before + ", viewport-fit=cover\"" + end;
    }
  );

  // Replace the entire expo-reset style block with a hardened version
  html = html.replace(
    /<style id="expo-reset">[\s\S]*?<\/style>/,
    `<style id="expo-reset">
      html {
        height: 100%;
        width: 100%;
        overflow: hidden;
      }
      body {
        height: 100%;
        width: 100%;
        overflow: hidden;
        margin: 0;
        padding: 0;
      }
      #root {
        display: flex;
        height: 100%;
        width: 100%;
        flex: 1;
        overflow: hidden;
      }
      /* Prevent iOS Safari from zooming on input focus (requires font-size >= 16px) */
      input, textarea, select { font-size: 16px !important; }
    </style>`
  );

  fs.writeFileSync(indexPath, html, "utf8");
  console.log("Patched dist/index.html with viewport-fit=cover and iOS Safari overflow fix.");
} catch (error) {
  console.error("Build failed:", error.message);
  process.exit(1);
}
