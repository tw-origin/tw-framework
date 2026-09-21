#!/usr/bin/env node
/**
 * TW Framework — Node deployment adapter (zero dependencies).
 *
 * Serves a `tw build` output directory (default: .tw/) with plain Node 18+:
 *   - clean URLs ( /about -> about.html or about/index.html )
 *   - ETag / 304 responses, Cache-Control for hashed assets
 *   - gzip for compressible responses (zlib)
 *   - Range requests (single range) for media files
 *   - SPA fallback ( index.html ) for unknown routes
 *   - security: server-only files (.twm/.ts/.env, dotfiles) are NEVER served,
 *     path traversal is blocked, X-Content-Type-Options: nosniff always set
 *
 * Usage:  node server.mjs           (from the app root, after `tw build`)
 * Env:    PORT (default 8000)  HOST (default 0.0.0.0)  TW_ROOT (default .tw)
 */

import { createServer } from "node:http";
import { createGzip } from "node:zlib";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, statSync, readFileSync } from "node:fs";
import { join, normalize, extname, resolve, sep } from "node:path";

const ROOT = resolve(process.env.TW_ROOT ?? ".tw");
const PORT = Number(process.env.PORT ?? 8000);
const HOST = process.env.HOST ?? "0.0.0.0";

if (!existsSync(ROOT)) {
  console.error(`Build output not found: ${ROOT}`);
  console.error("Run `tw build` first (or set TW_ROOT).");
  process.exit(1);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".pdf": "application/pdf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".wasm": "application/wasm",
};

const COMPRESSIBLE = new Set([".html", ".css", ".js", ".mjs", ".json", ".svg", ".txt", ".xml"]);
const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};

/** Never serve server-only files or dotfiles (mirrors TW StaticHandler). */
function isForbidden(pathname) {
  const segments = pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "";
  if (/\.(twm|ts|tsx|mts|cts)$/i.test(last) || /^\.env/i.test(last)) return true;
  return segments.some((s) => s.startsWith(".") && s !== ".");
}

/** Resolve a pathname inside ROOT, blocking traversal. Returns null if unsafe. */
function safeResolve(pathname) {
  const target = normalize(join(ROOT, pathname));
  if (target !== ROOT && !target.startsWith(ROOT + sep)) return null;
  return target;
}

/** Clean-URL resolution: exact file -> +.html -> dir/index.html. */
function resolveFile(pathname) {
  const candidates = [];
  const base = safeResolve(pathname);
  if (base === null) return null;
  if (pathname === "/" || pathname === "") {
    candidates.push(join(ROOT, "index.html"));
  } else {
    candidates.push(base);
    if (!extname(base)) {
      candidates.push(base + ".html");
      candidates.push(join(base, "index.html"));
    }
  }
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function etagFor(stat) {
  const h = createHash("sha1").update(`${stat.size}:${stat.mtimeMs}`).digest("hex").slice(0, 16);
  return `"${h}"`;
}

const server = createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? "/", "http://local").pathname);
  } catch {
    res.writeHead(400, { "content-type": "text/plain" });
    return res.end("Bad Request");
  }
  // Collapse duplicate slashes (`//x` must match `/x`).
  pathname = pathname.replace(/\/{2,}/g, "/");

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { allow: "GET, HEAD", ...SECURITY_HEADERS });
    return res.end("Method Not Allowed");
  }

  if (isForbidden(pathname)) {
    res.writeHead(404, { "content-type": "text/plain", ...SECURITY_HEADERS });
    return res.end("Not Found");
  }

  const file = resolveFile(pathname);
  const spaFallback = file === null;
  const finalPath = file ?? ((existsSync(join(ROOT, "index.html")) && pathname !== "/") ? join(ROOT, "index.html") : null);
  if (!finalPath) {
    // Custom 404 page if the build produced one.
    const notFound = join(ROOT, "404.html");
    if (existsSync(notFound)) {
      res.writeHead(404, { "content-type": "text/html; charset=utf-8", ...SECURITY_HEADERS });
      if (req.method === "HEAD") return res.end();
      return createReadStream(notFound).pipe(res);
    }
    res.writeHead(404, { "content-type": "text/plain", ...SECURITY_HEADERS });
    return res.end("Not Found");
  }
  // Unknown routes served through the SPA fallback must answer 404 -- a
  // 200 soft-404 hides broken links from crawlers and uptime checks. The
  // built 404.html takes priority; otherwise the shell is served WITH the
  // 404 status so client-side routing still works.
  if (spaFallback) {
    const notFoundPage = join(ROOT, "404.html");
    const spaPath = existsSync(notFoundPage) ? notFoundPage : finalPath;
    res.writeHead(404, { "content-type": "text/html; charset=utf-8", ...SECURITY_HEADERS });
    if (req.method === "HEAD") return res.end();
    return createReadStream(spaPath).pipe(res);
  }

  const stat = statSync(finalPath);
  const ext = extname(finalPath).toLowerCase();
  const type = MIME[ext] ?? "application/octet-stream";
  const etag = etagFor(stat);
  const headers = { ...SECURITY_HEADERS, "content-type": type, etag };

  // Hashed assets get long caching (assets/<name>.<hash>.<ext>).
  if (/\/assets\/[^/]+\.[0-9a-f]{8,}\.(css|js)$/i.test(finalPath)) {
    headers["cache-control"] = "public, max-age=31536000, immutable";
  } else {
    headers["cache-control"] = "no-cache";
  }

  // Conditional request
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, { etag, ...SECURITY_HEADERS });
    return res.end();
  }

  // Range request (single range only)
  const range = req.headers.range;
  if (range && /^bytes=\d*-\d*$/.test(range)) {
    const [startStr, endStr] = range.slice(6).split("-");
    const start = startStr === "" ? 0 : Number(startStr);
    const end = endStr === "" ? stat.size - 1 : Math.min(Number(endStr), stat.size - 1);
    if (start <= end && start < stat.size) {
      res.writeHead(206, {
        ...headers,
        "content-range": `bytes ${start}-${end}/${stat.size}`,
        "content-length": String(end - start + 1),
        "accept-ranges": "bytes",
      });
      if (req.method === "HEAD") return res.end();
      return createReadStream(finalPath, { start, end }).pipe(res);
    }
    res.writeHead(416, { "content-range": `bytes */${stat.size}` });
    return res.end();
  }

  headers["accept-ranges"] = "bytes";
  headers["content-length"] = String(stat.size);

  // gzip when the client accepts it and the type is compressible.
  const acceptEncoding = String(req.headers["accept-encoding"] ?? "");
  const wantsGzip = COMPRESSIBLE.has(ext) && stat.size > 1024 && acceptEncoding.includes("gzip");
  if (wantsGzip) {
    delete headers["content-length"];
    headers["content-encoding"] = "gzip";
    headers["vary"] = "Accept-Encoding";
    res.writeHead(200, headers);
    if (req.method === "HEAD") return res.end();
    return createReadStream(finalPath).pipe(createGzip()).pipe(res);
  }

  res.writeHead(200, headers);
  if (req.method === "HEAD") return res.end();
  createReadStream(finalPath).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`  TW Node adapter — serving ${ROOT}`);
  console.log(`  http://${HOST}:${PORT}\n`);
});

// Drain connections on SIGTERM/SIGINT (docker stop, k8s, Ctrl+C)
const shutdown = (signal) => {
  console.log(`  [TW] ${signal} received — shutting down gracefully...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  console.warn("[TW] Unhandled promise rejection:", reason?.message ?? reason);
});
