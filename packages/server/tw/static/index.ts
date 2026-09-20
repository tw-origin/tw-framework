/** Static file serving -- with MIME types, caching, ETag, range requests. */

import { existsSync, statSync } from "node:fs";
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
    const file = Bun.file(filePath);
    const content = await file.arrayBuffer();
    const bytes = new Uint8Array(content);

    // Generate ETag
    let etagValue = "";
    if (this.etag) {
      etagValue = `"${sha256(filePath + stat.mtime + stat.size).slice(0, 16)}"`;
    }

    // Build headers
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
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

    // Gzip compression for compressible types when the client accepts it
    const COMPRESSIBLE = ["text/", "application/javascript", "application/json", "application/xml", "image/svg+xml"];
    const acceptEnc = request?.headers.get("accept-encoding") ?? "";
    if (
      request && acceptEnc.includes("gzip") &&
      COMPRESSIBLE.some(t => contentType.startsWith(t)) &&
      bytes.length > 1024
    ) {
      try {
        const gz = Bun.gzipSync(bytes);
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
