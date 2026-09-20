import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
/** SSR rendering -- compile .tw files on the server and render HTML. */

import { sha256 } from "@tw/shared";
import { createHash } from "node:crypto";
import { join } from "node:path";

export interface SSROptions {
  pagesDir: string;
  cacheDir?: string;
  enableCache?: boolean;
  cacheTTL?: number;
}

export interface SSRResult {
  html: string;
  css: string;
  js: string;
  fromCache: boolean;
  durationMs: number;
}

export class SSRRenderer {
  private pagesDir: string;
  private cacheDir: string | null;
  private enableCache: boolean;
  private cacheTTL: number;
  private cache: Map<string, { result: SSRResult; expiresAt: number }> = new Map();

  constructor(opts: SSROptions) {
    this.pagesDir = opts.pagesDir;
    this.cacheDir = opts.cacheDir ?? null;
    this.enableCache = opts.enableCache ?? true;
    this.cacheTTL = opts.cacheTTL ?? 60000;
  }

  async render(pathname: string, stateVars?: Record<string, string>): Promise<SSRResult | null> {
    const startTime = performance.now();
    const cacheKey = sha256(`${pathname}:${JSON.stringify(stateVars ?? {})}`);

    // Check cache
    if (this.enableCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        return { ...cached.result, fromCache: true, durationMs: 0 };
      }
    }

    // Find the .tw file for this route
    const filePath = this.resolveRoute(pathname);
    if (!filePath) return null;

    try {
      const source = await Bun.file(filePath).text();
      const { compile } = await import("@tw/compiler");
      const result = await compile(source, {
        filePath,
        optimize: true,
        diagnostics: false,
        transforms: true,
        stateVars,
      });

      const ssrResult: SSRResult = {
        html: result.html,
        css: result.css,
        js: result.js,
        fromCache: false,
        durationMs: performance.now() - startTime,
      };

      // Cache the result
      if (this.enableCache) {
        // Evict oldest entries if cache exceeds 100 entries -- prevents memory leak
        if (this.cache.size >= 100) {
          const oldest = this.cache.keys().next().value;
          if (oldest) this.cache.delete(oldest);
        }
        this.cache.set(cacheKey, {
          result: ssrResult,
          expiresAt: Date.now() + this.cacheTTL,
        });
      }

      return ssrResult;
    } catch (err: any) {
      return {
        html: `<html><body><h1>SSR Error</h1><pre>${escapeHtml(err.message)}</pre></body></html>`,
        css: "",
        js: "",
        fromCache: false,
        durationMs: performance.now() - startTime,
      };
    }
  }

  renderSync(pathname: string, stateVars?: Record<string, string>): SSRResult | null {
    const startTime = performance.now();
    const cacheKey = sha256(`sync:${pathname}:${JSON.stringify(stateVars ?? {})}`);

    if (this.enableCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        return { ...cached.result, fromCache: true, durationMs: 0 };
      }
    }

    const filePath = this.resolveRoute(pathname);
    if (!filePath || !existsSync(filePath)) return null;

    try {
      const source = readFileSync(filePath, 'utf-8');
      // Dynamic import is async, so for sync we use a simpler approach
      // In production, this would use a precompiled bundle
      return {
        html: `<html><body>SSR sync not available</body></html>`,
        css: "",
        js: "",
        fromCache: false,
        durationMs: performance.now() - startTime,
      };
    } catch {
      return null;
    }
  }

  clearCache(pattern?: string): void {
    if (pattern) {
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  getCacheStats(): { entries: number; hitRate: number } {
    return {
      entries: this.cache.size,
      hitRate: 0, // Would track in real impl
    };
  }

  private resolveRoute(pathname: string): string | null {
    const segments = pathname.split("/").filter(Boolean);
    let currentDir = this.pagesDir;

    // Handle root: home/page.tw (convention) or home/index.tw (legacy)
    if (segments.length === 0) {
      const pagePath = join(this.pagesDir, "page.tw");
      if (existsSync(pagePath)) return pagePath;
      const indexPath = join(this.pagesDir, "index.tw");
      if (existsSync(indexPath)) return indexPath;
      return null;
    }

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const isLast = i === segments.length - 1;
      const entries = existsSync(currentDir) ? require("node:fs").readdirSync(currentDir) : [];

      if (isLast) {
        // seg.tw file
        const exactPath = join(currentDir, seg + ".tw");
        if (existsSync(exactPath)) return exactPath;
        // seg/page.tw (directory convention)
        const dirPage = join(currentDir, seg, "page.tw");
        if (existsSync(dirPage)) return dirPage;
        // [param].tw file
        const paramFile = entries.find((e: string) => e.match(/^\[([^\]]+)\]\.tw$/));
        if (paramFile) return join(currentDir, paramFile);
        // [param]/page.tw directory
        const paramDir = entries.find((e: string) => e.match(/^\[([^\]]+)\]$/));
        if (paramDir) {
          const p = join(currentDir, paramDir, "page.tw");
          if (existsSync(p)) return p;
          const pIdx = join(currentDir, paramDir, "index.tw");
          if (existsSync(pIdx)) return pIdx;
        }
        // seg/index.tw (legacy)
        const idx = join(currentDir, seg, "index.tw");
        if (existsSync(idx)) return idx;
        return null;
      }

      // Intermediate segment: exact dir, else [param] dir
      const dirPath = join(currentDir, seg);
      if (existsSync(dirPath) && require("node:fs").statSync(dirPath).isDirectory()) {
        currentDir = dirPath;
      } else {
        const paramDir = entries.find((e: string) => e.match(/^\[([^\]]+)\]$/));
        if (!paramDir) return null;
        currentDir = join(currentDir, paramDir);
      }
    }

    return null;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// --- ETag and Disk Cache Support ------------------------------------

import { existsSync as existsSyncSync } from "node:fs";

const _ssrCache = new Map<string, { html: string; etag: string; expires: number }>();
const _diskCacheDir = join(process.cwd(), ".tw", "ssr-cache");

export function getCachedSSR(pathname: string): { html: string; etag: string } | null {
  // Check memory cache
  const mem = _ssrCache.get(pathname);
  if (mem && mem.expires > Date.now()) {
    return { html: mem.html, etag: mem.etag };
  }
  // Check disk cache
  const diskPath = join(_diskCacheDir, pathname.replace(/[\/]/g, "_") + ".html");
  if (existsSyncSync(diskPath)) {
    const content = readFileSync(diskPath, "utf-8");
    const etag = createHash("sha256").update(content).digest("hex").slice(0, 16);
    _ssrCache.set(pathname, { html: content, etag, expires: Date.now() + 60000 });
    return { html: content, etag };
  }
  return null;
}

export function setCachedSSR(pathname: string, html: string): string {
  const etag = createHash("sha256").update(html).digest("hex").slice(0, 16);
  _ssrCache.set(pathname, { html, etag, expires: Date.now() + 60000 });
  // Write to disk
  try {
    if (!existsSyncSync(_diskCacheDir)) mkdirSync(_diskCacheDir, { recursive: true });
    const diskPath = join(_diskCacheDir, pathname.replace(/[\/]/g, "_") + ".html");
    writeFileSync(diskPath, html);
  } catch { /* ignored */ }
  return etag;
}

export function invalidateSSRCache(pathname?: string): void {
  if (pathname) {
    _ssrCache.delete(pathname);
  } else {
    _ssrCache.clear();
  }
}

// --- Streaming SSR --------------------------------------------------

export async function* streamSSR(
  pathname: string,
  renderFn: () => Promise<string>
): AsyncGenerator<string> {
  // Stream the opening HTML
  yield "<!DOCTYPE html><html><head>";
  // Stream the body in chunks
  const body = await renderFn();
  yield body;
  yield "</head></html>";
}

// --- Preload Generation ---------------------------------------------

export function generatePreloadHints(assets: string[]): string {
  const hints: string[] = [];
  for (const asset of assets) {
    if (asset.endsWith(".js")) {
      hints.push(`<link rel="preload" href="${asset}" as="script">`);
    } else if (asset.endsWith(".css")) {
      hints.push(`<link rel="preload" href="${asset}" as="style">`);
    } else if (asset.match(/\.(woff2?|ttf|otf)$/)) {
      hints.push(`<link rel="preload" href="${asset}" as="font" crossorigin>`);
    } else if (asset.match(/\.(png|jpg|jpeg|webp|avif)$/)) {
      hints.push(`<link rel="preload" href="${asset}" as="image">`);
    }
  }
  return hints.join("\n");
}
