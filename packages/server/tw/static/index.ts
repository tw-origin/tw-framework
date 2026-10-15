/** Static file serving -- with MIME types, caching, ETag, range requests. */

import { existsSync, statSync } from "node:fs";
import { readTextFile, readBytes, gzipBytes } from "../fs-compat";
import { join, extname, normalize, resolve, sep } from "node:path";
import { MIME_TYPES } from "@tw/shared";
import { sha256 } from "@tw/shared";

export interface StaticOptions {
  root: string;
  maxAge?: number;
  etag?: boolean;
  lastModified?: boolean;
  cacheControl?: string;
  indexFile?: string;
  spa?: boolean;
}

export class StaticHandler {
  private root: string;
  private maxAge: number;
  private etag: boolean;
  private lastModified: boolean;
  private cacheControl: string | null;
  private indexFile: string;
  private spa: boolean;
  private cache: Map<string, { content: Uint8Array; etag: string; mtime: number }> = new Map();

  constructor(opts: StaticOptions) {
    this.root = normalize(opts.root);
    this.maxAge = opts.maxAge ?? 3600;
    this.etag = opts.etag ?? true;
    this.lastModified = opts.lastModified ?? true;
    this.cacheControl = opts.cacheControl ?? null;
    this.indexFile = opts.indexFile ?? "index.html";
    this.spa = opts.spa ?? false;
  }

  async serve(pathname: string, request?: Request): Promise<Response> {
    // Prevent path traversal. The strip regex only removes a `..` that is
    // immediately followed by a separator, so a bare trailing `..`
    // (normalize('..') === '..') survives it -- belt-and-braces: also verify
    // the joined path still resolves INSIDE the root before serving.
    const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
    const rootResolved = resolve(this.root);
    const candidate = resolve(join(this.root, safePath));
    if (candidate !== rootResolved && !candidate.startsWith(rootResolved + sep)) {
      return new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain" } });
    }

    // SECURITY: never serve server-only files. `tw build` copies lib/*.ts,
    // middleware.twm and params.twm into the output dir for the runtime --
    // serving them would disclose application source and secrets.
    const segments = safePath.split("/").filter(Boolean);
    const lastSegment = segments[segments.length - 1] ?? "";
    const isServerFile = /\.(twm|ts|tsx|mts|cts)$/i.test(lastSegment) || /^\.env/i.test(lastSegment);
    const hasDotSegment = segments.some(seg => seg.startsWith(".") && seg !== ".");
    if (isServerFile || hasDotSegment) {
      return new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain" } });
    }

    let filePath = join(this.root, safePath);

    // Directory request ("/", "/menu") → serve index.html inside it instead
    // of trying to read the directory as a file (EISDIR).
    if (existsSync(filePath) && statSync(filePath).isDirectory()) {
      filePath = join(filePath, this.indexFile);
    }

    // Try index file for directory
    if (!existsSync(filePath)) {
      // Try .html extension (clean URLs)
      filePath = join(this.root, safePath + ".html");
    }

    if (!existsSync(filePath)) {
      // Try index.html in subdirectory
      filePath = join(this.root, safePath, this.indexFile);
    }

    if (!existsSync(filePath)) {
      // SPA fallback
      if (this.spa) {
        filePath = join(this.root, this.indexFile);
        if (!existsSync(filePath)) {
          return new Response("Not Found", { status: 404 });
        }
      } else {
        // Try 404.html
        filePath = join(this.root, "404.html");
        if (!existsSync(filePath)) {
          return new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain" } });
        }
      }
    }

    const stat = statSync(filePath);
    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

    // Read file
    const bytes = await readBytes(filePath);

    // Generate ETag -- CONTENT-based (a hash of the bytes). The old hash of
    // path+mtime+size never changed when only the content did, so clients kept
    // serving stale copies.
    let etagValue = "";
    if (this.etag) {
      etagValue = `"${sha256(bytes).slice(0, 16)}"`;
    }

    // Build headers
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
    };

    if (this.etag) {
      headers["ETag"] = etagValue;
    }

    if (this.lastModified) {
      headers["Last-Modified"] = new Date(stat.mtime).toUTCString();
    }

    if (this.cacheControl) {
      headers["Cache-Control"] = this.cacheControl;
    } else {
      headers["Cache-Control"] = `public, max-age=${this.maxAge}`;
    }

    // Conditional request: If-None-Match / If-Modified-Since -> 304 Not Modified
    if (request && this.handleConditionalRequest(request, etagValue, stat.mtime as any)) {
      return new Response(null, {
        status: 304,
        headers: { ETag: etagValue, "Cache-Control": headers["Cache-Control"] },
      });
    }

    // Range request: answer 206 with just the requested slice (416 when the
    // range cannot be satisfied). Served uncompressed so byte offsets are
    // exact.
    if (request) {
      const rangeHeader = request.headers.get("range");
      if (rangeHeader) {
        const range = this.parseRange(rangeHeader, bytes.length);
        if (range === "unsatisfiable") {
          return new Response(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${bytes.length}`, "Accept-Ranges": "bytes" },
          });
        }
        if (range) {
          const slice = bytes.subarray(range.start, range.end + 1);
          return new Response(slice, {
            status: 206,
            headers: {
              ...headers,
              "Content-Length": String(slice.length),
              "Content-Range": `bytes ${range.start}-${range.end}/${bytes.length}`,
            },
          });
        }
      }
    }

    // Gzip compression for compressible types when the client accepts it
    const COMPRESSIBLE = ["text/", "application/javascript", "application/json", "application/xml", "image/svg+xml"];
    const acceptEnc = request?.headers.get("accept-encoding") ?? "";
    if (
      request && acceptEnc.includes("gzip") &&
      COMPRESSIBLE.some(t => contentType.startsWith(t)) &&
      bytes.length > 1024
    ) {
      try {
        const gz = gzipBytes(bytes);
        if (gz.length < bytes.length) {
          const gzHeaders = { ...headers, "Content-Encoding": "gzip", "Content-Length": String(gz.length), Vary: "Accept-Encoding" };
          delete gzHeaders["Content-Length"];
          if (this.lastModified) delete gzHeaders["Last-Modified"];
          return new Response(gz, { headers: gzHeaders });
        }
      } catch { /* gzip unavailable -- serve uncompressed */ }
    }

    return new Response(bytes, { headers });
  }

  /**
   * Parse a `Range: bytes=...` header against a known content length.
   * Returns { start, end } (inclusive) for a satisfiable single range,
   * "unsatisfiable" for a 416, or null to ignore the header (malformed /
   * unsupported form -- the full body is served instead).
   */
  private parseRange(header: string, size: number): { start: number; end: number } | "unsatisfiable" | null {
    const m = /^bytes=(.+)$/i.exec(header.trim());
    if (!m) return null;
    // Only the first range of a multi-range request is honoured.
    const spec = m[1].split(",")[0].trim();
    const dash = spec.indexOf("-");
    if (dash === -1) return null;
    const startStr = spec.slice(0, dash).trim();
    const endStr = spec.slice(dash + 1).trim();

    if (startStr === "") {
      // Suffix range: the final N bytes.
      if (endStr === "") return null;
      const suffix = Number(endStr);
      if (!Number.isFinite(suffix) || suffix <= 0) return "unsatisfiable";
      if (size === 0) return "unsatisfiable";
      return { start: Math.max(0, size - suffix), end: size - 1 };
    }

    const start = Number(startStr);
    if (!Number.isFinite(start) || start < 0) return null;
    if (start >= size) return "unsatisfiable";
    let end = endStr === "" ? size - 1 : Number(endStr);
    if (!Number.isFinite(end) || end < start) return "unsatisfiable";
    if (end > size - 1) end = size - 1;
    return { start, end };
  }

  handleConditionalRequest(request: Request, etag: string, mtime: number): boolean {
    const ifNoneMatch = request.headers.get("if-none-match");
    const ifModifiedSince = request.headers.get("if-modified-since");

    if (ifNoneMatch && ifNoneMatch === etag) {
      return true;
    }

    if (ifModifiedSince) {
      const sinceDate = new Date(ifModifiedSince).getTime();
      // HTTP dates truncate to seconds; file mtimes carry milliseconds.
      // Compare at second granularity, or fresh files look "modified".
      if (Math.floor(new Date(mtime).getTime() / 1000) <= Math.floor(sinceDate / 1000)) {
        return true;
      }
    }

    return false;
  }

  clearCache(): void {
    this.cache.clear();
  }
}
