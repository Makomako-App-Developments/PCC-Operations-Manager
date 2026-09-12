const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { assertNoRouteTests } = require("./check-route-tests");
const { createServiceWorkerRegistration } = require("./service-worker-registration");

const projectRoot = path.resolve(__dirname, "..");
const basePath = "/field-ops";

if (!assertNoRouteTests()) {
  process.exit(1);
}

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
console.log(`Base URL: ${basePath} (configured in app.json)`);

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

  const distRoot = path.join(projectRoot, "dist");
  fs.cpSync(path.join(projectRoot, "public"), distRoot, { recursive: true });

  // Patch dist/index.html: PWA metadata + browser layout fixes
  const indexPath = path.join(distRoot, "index.html");
  let html = fs.readFileSync(indexPath, "utf8");

  const pwaHead = [
    `<link rel="manifest" href="${basePath}/manifest.json">`,
    `<meta name="theme-color" content="#166534">`,
    `<link rel="apple-touch-icon" href="${basePath}/icons/icon-192.png">`,
  ].join("\n    ");
  const serviceWorkerRegistration = createServiceWorkerRegistration(basePath);

  if (!html.includes('rel="manifest"')) {
    html = html.replace("</head>", `    ${pwaHead}\n  </head>`);
  }
  if (!html.includes("navigator.serviceWorker.register")) {
    html = html.replace("</body>", `    ${serviceWorkerRegistration}\n  </body>`);
  }

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
        overflow-x: clip;
        overflow-y: hidden;
        max-width: 100vw;
      }
      body {
        height: 100%;
        overflow-x: clip;
        overflow-y: hidden;
        max-width: 100vw;
        margin: 0;
        padding: 0;
        touch-action: pan-y;
        overscroll-behavior-x: none;
      }
      #root {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        overflow: hidden;
        display: flex;
      }
      input, textarea, select { font-size: 16px !important; }
    </style>`
  );

  fs.writeFileSync(indexPath, html, "utf8");
  console.log("Patched dist/index.html with PWA metadata and browser layout fixes.");
} catch (error) {
  console.error("Build failed:", error.message);
  process.exit(1);
}
