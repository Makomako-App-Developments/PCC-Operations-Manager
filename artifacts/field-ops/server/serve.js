/**
 * Production server for Expo web export.
 *
 * Serves the output of `expo export --platform web` (dist/) as a static SPA.
 * - Strips BASE_PATH prefix from incoming requests
 * - Serves files directly from dist/ when they exist
 * - Falls back to dist/index.html for all other routes (SPA client-side routing)
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const DIST_ROOT = path.resolve(__dirname, "..", "dist");
const basePath = (process.env.BASE_PATH || "/").replace(/\/+$/, "");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json",
  ".webp": "image/webp",
};

function getMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

function send404(res) {
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("Not Found");
}

const indexHtml = path.join(DIST_ROOT, "index.html");

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  let pathname = url.pathname;

  if (basePath && pathname.startsWith(basePath)) {
    pathname = pathname.slice(basePath.length) || "/";
  }
  if (!pathname.startsWith("/")) pathname = "/" + pathname;

  const safePath = path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(DIST_ROOT, safePath);

  if (!filePath.startsWith(DIST_ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { "content-type": getMime(filePath) });
    res.end(content);
    return;
  }

  if (!fs.existsSync(indexHtml)) {
    res.writeHead(503, { "content-type": "text/html; charset=utf-8" });
    res.end("<h1>Build not found</h1><p>Run <code>pnpm build</code> first.</p>");
    return;
  }

  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(fs.readFileSync(indexHtml));
});

const port = parseInt(process.env.PORT || "3000", 10);
server.listen(port, "0.0.0.0", () => {
  console.log(`Serving Expo web build from dist/ on port ${port}`);
  console.log(`Base path: ${basePath || "/"}`);
  if (!fs.existsSync(indexHtml)) {
    console.warn("WARNING: dist/index.html not found — run `pnpm build` first");
  }
});
