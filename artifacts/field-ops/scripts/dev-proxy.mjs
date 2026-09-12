/**
 * dev-proxy.mjs
 *
 * Thin reverse-proxy that sits between the Replit shared proxy (port 21340)
 * and the Metro dev server (port 21341).
 *
 * Problem solved: Metro generates `<script src="/node_modules/...">` as an
 * absolute URL. When served through the main Replit proxy at /field-ops/, the
 * browser requests /node_modules/... which routes to the web-app instead of
 * Metro → MIME error → blank screen.
 *
 * Fix: intercept the HTML entry point and rewrite all absolute /node_modules/
 * and /_expo/ src/href attributes to /field-ops/node_modules/ and
 * /field-ops/_expo/ so the Replit proxy correctly routes them back to port
 * 21340 (this service).
 *
 * All other requests have any leading /field-ops prefix stripped and are
 * forwarded verbatim to Metro on INTERNAL_PORT. WebSocket upgrades (Metro HMR)
 * are also proxied transparently.
 */

import http from "http";
import net from "net";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const PORT = parseInt(process.env.PORT ?? "21340", 10);
const INTERNAL_PORT = PORT + 1;
const PUBLIC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const PWA_FILES = new Map([
  ["/manifest.json", ["manifest.json", "application/manifest+json; charset=utf-8"]],
  ["/service-worker.js", ["service-worker.js", "application/javascript; charset=utf-8"]],
  ["/icons/icon-192.png", ["icons/icon-192.png", "image/png"]],
  ["/icons/icon-512.png", ["icons/icon-512.png", "image/png"]],
]);

// Paths that Metro serves its HTML shell from
const HTML_PATHS = new Set(["/", "/field-ops", "/field-ops/"]);

// ── Start Metro on INTERNAL_PORT ────────────────────────────────────────────

const expoEnv = {
  ...process.env,
  PORT: String(INTERNAL_PORT),
};

const metro = spawn(
  "pnpm",
  ["exec", "expo", "start", "--localhost", "--port", String(INTERNAL_PORT)],
  {
    env: expoEnv,
    stdio: "inherit",
    shell: false,
  }
);

metro.on("error", (err) => {
  console.error("[dev-proxy] Failed to start Metro:", err);
  process.exit(1);
});

metro.on("exit", (code) => {
  console.log(`[dev-proxy] Metro exited with code ${code}`);
  process.exit(code ?? 0);
});

process.on("SIGTERM", () => {
  metro.kill("SIGTERM");
  process.exit(0);
});

process.on("SIGINT", () => {
  metro.kill("SIGINT");
  process.exit(0);
});

// ── Wait for Metro to be ready ──────────────────────────────────────────────

async function waitForMetro(maxWaitMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(
          `http://localhost:${INTERNAL_PORT}/`,
          { timeout: 2000 },
          (res) => { res.resume(); resolve(); }
        );
        req.on("error", reject);
        req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
      });
      console.log("[dev-proxy] Metro is ready");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error("[dev-proxy] Metro did not become ready in time");
}

// ── HTML rewriting helper ───────────────────────────────────────────────────

function rewriteHtml(html) {
  // Rewrite absolute paths that Metro embeds in the HTML shell so the browser
  // requests them through /field-ops/ (which the Replit proxy routes here).
  let rewritten = html
    .replace(/src="\/node_modules\//g, 'src="/field-ops/node_modules/')
    .replace(/href="\/node_modules\//g, 'href="/field-ops/node_modules/')
    .replace(/src="\/\/_expo\//g, 'src="/field-ops/_expo/')
    .replace(/href="\/\/_expo\//g, 'href="/field-ops/_expo/')
    .replace(/src="\/_expo\//g, 'src="/field-ops/_expo/')
    .replace(/href="\/_expo\//g, 'href="/field-ops/_expo/');

  if (!rewritten.includes('rel="manifest"')) {
    rewritten = rewritten.replace(
      "</head>",
      '  <link rel="manifest" href="/field-ops/manifest.json">\n' +
        '  <meta name="theme-color" content="#166534">\n' +
        '  <link rel="apple-touch-icon" href="/field-ops/icons/icon-192.png">\n' +
        "</head>",
    );
  }
  if (!rewritten.includes("navigator.serviceWorker.register")) {
    rewritten = rewritten.replace(
      "</body>",
      '  <script>if ("serviceWorker" in navigator) window.addEventListener("load", function () { navigator.serviceWorker.register("/field-ops/service-worker.js", { scope: "/field-ops/" }); });</script>\n</body>',
    );
  }
  return rewritten;
}

// ── Generic reverse-proxy helper ────────────────────────────────────────────

function proxyRequest(clientReq, clientRes, targetPath) {
  const options = {
    hostname: "localhost",
    port: INTERNAL_PORT,
    path: targetPath,
    method: clientReq.method,
    headers: { ...clientReq.headers, host: `localhost:${INTERNAL_PORT}` },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    const contentType = proxyRes.headers["content-type"] ?? "";
    const isHtml = contentType.includes("text/html");

    if (isHtml) {
      // Buffer and rewrite before forwarding
      let body = "";
      proxyRes.setEncoding("utf8");
      proxyRes.on("data", (chunk) => { body += chunk; });
      proxyRes.on("end", () => {
        const rewritten = rewriteHtml(body);
        const buf = Buffer.from(rewritten, "utf8");
        const headers = {
          ...proxyRes.headers,
          "content-length": String(buf.byteLength),
        };
        delete headers["transfer-encoding"];
        clientRes.writeHead(proxyRes.statusCode ?? 200, headers);
        clientRes.end(buf);
      });
    } else {
      clientRes.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
      proxyRes.pipe(clientRes);
    }
  });

  proxyReq.on("error", (err) => {
    console.error("[dev-proxy] Proxy error:", err.message);
    if (!clientRes.headersSent) {
      clientRes.writeHead(502);
      clientRes.end("Bad Gateway");
    }
  });

  clientReq.pipe(proxyReq);
}

// ── Resolve target path (strip /field-ops prefix) ──────────────────────────

function targetPath(reqUrl) {
  const url = reqUrl ?? "/";
  // Strip /field-ops prefix so Metro sees its native paths
  if (url.startsWith("/field-ops/")) return url.slice("/field-ops".length);
  if (url === "/field-ops") return "/";
  return url;
}

// ── HTTP server ─────────────────────────────────────────────────────────────

const server = http.createServer((req, clientRes) => {
  const requestPath = targetPath(req.url);
  const pathname = new URL(requestPath, "http://localhost").pathname;
  const pwaFile = PWA_FILES.get(pathname);

  if (pwaFile) {
    const [relativePath, contentType] = pwaFile;
    const headers = { "content-type": contentType };
    if (pathname === "/service-worker.js") headers["cache-control"] = "no-cache";
    clientRes.writeHead(200, headers);
    clientRes.end(fs.readFileSync(path.join(PUBLIC_ROOT, relativePath)));
    return;
  }

  // Always serve Metro HTML for the entry points (even without prefix) and
  // the raw Metro root (which may redirect to the HTML shell)
  if (HTML_PATHS.has(req.url ?? "/") || HTML_PATHS.has(requestPath)) {
    proxyRequest(req, clientRes, "/");
    return;
  }

  proxyRequest(req, clientRes, requestPath);
});

// ── WebSocket proxy (Metro HMR) ──────────────────────────────────────────────

server.on("upgrade", (req, socket, head) => {
  const upstream = net.connect(INTERNAL_PORT, "localhost", () => {
    const reqLine = `${req.method} ${targetPath(req.url)} HTTP/${req.httpVersion}\r\n`;
    const headers =
      Object.entries(req.headers)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\r\n") + "\r\n\r\n";
    upstream.write(reqLine + headers);
    if (head && head.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });

  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});

// ── Boot sequence ────────────────────────────────────────────────────────────

waitForMetro()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`[dev-proxy] Listening on port ${PORT}, Metro on ${INTERNAL_PORT}`);
    });
  })
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
