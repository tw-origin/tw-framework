/**
 * @tw/image — the TW Framework image engine.
 *
 * One package, two halves:
 *   1. `imageAttributesFor()` — pure URL math shared by the compiler and the
 *      server, so the markup the compiler writes always matches what the
 *      server serves.
 *   2. `createImageHandler()` — the request engine behind /_tw/img/*:
 *      resize + format conversion (via sharp when installed), content-keyed
 *      disk cache, ETag/304, remote-image proxying behind an allowlist.
 *
 * Works with zero configuration for local images; `sharp` is optional —
 * without it images are served as-is (correct content type, caching intact).
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, normalize, resolve, extname } from "node:path";
import { pathToFileURL } from "node:url";

// --- Config -------------------------------------------------------------------

export interface ImageConfig {
  /** Quality for lossy formats (1-100) */
  quality: number;
  /** Output formats, best-first. The first the browser accepts wins. */
  formats: ("avif" | "webp" | "jpeg" | "png")[];
  /** Widths generated into srcset */
  breakpoints: number[];
  /** Remote hosts allowed through the optimizer proxy (SSRF guard) */
  remoteAllowHosts: string[];
  /** How long processed images are cacheable (seconds) */
  cacheMaxAge: number;
}

export const DEFAULT_IMAGE_CONFIG: ImageConfig = {
  quality: 75,
  formats: ["avif", "webp"],
  breakpoints: [320, 640, 768, 1024, 1280, 1920],
  remoteAllowHosts: [],
  cacheMaxAge: 86400,
};

export interface ImageTagOptions {
  src: string;
  width?: number;
  height?: number;
  quality?: number;
  /** Above-the-fold image: eager loading, no low res srcset capping */
  priority?: boolean;
  /** blur = soft background placeholder while loading */
  placeholder?: "blur" | "empty";
}

export interface ImageAttributes {
  src: string;
  srcset: string;
  sizes: string;
  width: number;
  height: number;
  loading: "lazy" | "eager";
  decoding: "async";
  format: string;
}

// --- URL math (shared by compiler + server) ------------------------------------

/**
 * The canonical URL for an optimized variant of `src`.
 * `f=auto` lets the server negotiate avif/webp per request.
 */
export function optimizedImageUrl(
  src: string,
  opts: { width?: number; height?: number; quality?: number; format?: string } = {}
): string {
  const p = new URLSearchParams();
  if (opts.width) p.set("w", String(opts.width));
  if (opts.height) p.set("h", String(opts.height));
  if (opts.quality) p.set("q", String(opts.quality));
  p.set("f", opts.format ?? "auto");
  const qs = p.toString();
  return `/_tw/img${src.startsWith("/") ? src : "/" + src}?${qs}`;
}

/**
 * Compute every attribute the optimized <img> needs: src, srcset, sizes,
 * loading, decoding. Used by the compiler at build time and callable directly.
 */
export function imageAttributesFor(
  opts: ImageTagOptions,
  config: ImageConfig = DEFAULT_IMAGE_CONFIG
): ImageAttributes {
  const width = opts.width ?? 0;
  const quality = opts.quality ?? config.quality;
  const format = config.formats[0] ?? "webp";

  // Remote sources go through the proxy endpoint as a query param — the
  // path form would not survive URL `//` normalization.
  const isRemote = /^https?:\/\//i.test(opts.src);
  const src = isRemote
    ? `/_tw/img/_remote?src=${encodeURIComponent(opts.src)}&w=${opts.width ?? ""}&h=${opts.height ?? ""}&q=${quality}&f=auto`
    : optimizedImageUrl(opts.src, { width: opts.width, height: opts.height, quality });

  // Responsive srcset: every breakpoint up to 2x the declared width.
  const widths = config.breakpoints.filter((bp) => width === 0 || bp <= width * 2);
  const srcset = widths
    .map((bp) =>
      isRemote
        ? `/_tw/img/_remote?src=${encodeURIComponent(opts.src)}&w=${bp}&q=${quality}&f=auto ${bp}w`
        : `${optimizedImageUrl(opts.src, { width: bp, quality })} ${bp}w`
    )
    .join(", ");

  const sizes = width > 0 ? `(max-width: ${width}px) 100vw, ${width}px` : "100vw";
  const loading = opts.priority ? "eager" : "lazy";

  return { src, srcset, sizes, width, height: opts.height ?? 0, loading, decoding: "async", format };
}

// --- The request engine ----------------------------------------------------------

const IMAGE_EXTENSIONS: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".avif": "image/avif", ".gif": "image/gif",
  ".svg": "image/svg+xml", ".ico": "image/x-icon",
};

const SHARP_FORMATS: Record<string, string> = {
  avif: "avif", webp: "webp", jpeg: "jpeg", jpg: "jpeg", png: "png",
};

export interface ImageHandlerOptions {
  /** App root — the public/ dir lives here */
  rootDir: string;
  /** Where source images live (default: rootDir/public) */
  sourceDir?: string;
  /** Where processed variants are cached (default: rootDir/.tw/img) */
  cacheDir?: string;
  config?: Partial<ImageConfig>;
}

export function createImageHandler(options: ImageHandlerOptions) {
  const rootDir = resolve(options.rootDir);
  const sourceDir = resolve(options.sourceDir ?? join(rootDir, "public"));
  const cacheDir = resolve(options.cacheDir ?? join(rootDir, ".tw", "img", "cache"));
  const config: ImageConfig = { ...DEFAULT_IMAGE_CONFIG, ...options.config };

  let sharpPromise: Promise<any> | null = null;
  let warnedNoSharp = false;

  async function loadSharp(): Promise<any | null> {
    if (!sharpPromise) {
      // Resolution order (first module that works wins):
      //   1. require(<app>/node_modules/sharp)   -- CJS load, symlink-safe
      //   2. import(<app>/node_modules/sharp)   -- ESM form
      //   3. require("sharp") / import("sharp") -- normal resolution
      // Loading from the app root matters inside the monorepo: the package
      // dir is a symlink, so bare "sharp" would resolve against the repo
      // (where sharp is not installed) instead of the app.
      sharpPromise = (async () => {
        let req: any;
        try {
          const { createRequire } = await import("node:module");
          req = createRequire(join(rootDir, "package.json"));
        } catch { /* no createRequire */ }
        const candidates = [
          join(rootDir, "node_modules", "sharp"),
          "sharp",
        ];
        for (const candidate of candidates) {
          if (typeof req === "function") {
            try {
              const m = req(candidate);
              const mod = m?.default ?? m;
              if (mod && typeof mod === "function") return mod;
            } catch { /* try next */ }
          }
          try {
            const href = candidate.startsWith("/")
              ? pathToFileURL(candidate).href : candidate;
            const m: any = await import(href as string);
            const mod = m?.default ?? m;
            if (mod && typeof mod === "function") return mod;
          } catch { /* try next */ }
        }
        return null;
      })();
    }
    return sharpPromise;
  }

  function contentTypeFor(path: string): string {
    return IMAGE_EXTENSIONS[extname(path).toLowerCase()] ?? "application/octet-stream";
  }

  /** Negotiate the best output format for this request. */
  function negotiateFormat(requested: string | null, accept: string): string | null {
    if (requested && requested !== "auto") {
      return SHARP_FORMATS[requested.toLowerCase()] ?? null;
    }
    const acceptLc = (accept ?? "").toLowerCase();
    for (const f of config.formats) {
      if (acceptLc.includes(`image/${f}`)) return f === "jpeg" ? "jpeg" : f;
    }
    return null;
  }

  function isRemoteSource(src: string): boolean {
    return /^https?:\/\//i.test(src);
  }

  /** SSRF guard: only allowlisted hosts, no credentials, http(s) only. */
  function remoteAllowed(url: URL): boolean {
    if (!config.remoteAllowHosts.includes(url.hostname)) return false;
    if (url.username || url.password) return false;
    return url.protocol === "https:" || url.protocol === "http:";
  }

  /**
   * Private / reserved address check: loopback, private ranges, link-local,
   * multicast, IPv6 unique-local and link-local, and IPv4-mapped IPv6.
   */
  function isPrivateAddress(host: string): boolean {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (m) {
      const a = Number(m[1]), b = Number(m[2]);
      if (a === 0 || a === 10 || a === 127) return true;
      if (a === 169 && b === 254) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a >= 224) return true;
      return false;
    }
    const h = host.toLowerCase();
    if (h === "::" || h === "::1") return true;
    if (h.startsWith("fe80:")) return true;
    if (h.startsWith("fc") || h.startsWith("fd")) return true;
    if (h.startsWith("::ffff:")) return isPrivateAddress(h.slice(7));
    return false;
  }

  /**
   * Fetch a remote image with full SSRF protection:
   *   - every hop (redirects included) must be an allowlisted host
   *   - the hostname is resolved and every resolved address is checked
   *     against private/reserved ranges (mitigates DNS rebinding to
   *     internal targets)
   *   - no credentials, http/https only, at most 3 redirects
   */
  async function safeFetchRemote(src: string): Promise<Buffer | null> {
    let url: URL;
    try { url = new URL(src); } catch { return null; }
    for (let hop = 0; hop < 3; hop++) {
      if (!remoteAllowed(url)) return null;
      try {
        const dns = await import("node:dns");
        const addrs = await dns.promises.lookup(url.hostname, { all: true });
        if (!addrs.length) return null;
        for (const a of addrs) {
          if (isPrivateAddress(a.address)) return null;
        }
      } catch { return null; }
      let res: Response;
      try {
        res = await fetch(url, { redirect: "manual" });
      } catch { return null; }
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return null;
        try { url = new URL(loc, url); } catch { return null; }
        continue; // each redirect target is re-allowlist-checked
      }
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    }
    return null;
  }

  async function readSource(src: string): Promise<{ data: Buffer; mtime: number } | null> {
    if (isRemoteSource(src)) {
      const data = await safeFetchRemote(src);
      return data ? { data, mtime: 0 } : null;
    }

    // Local: normalize, then resolve under sourceDir. Anything that escapes
    // the source directory (../, absolute paths, symlink tricks caught by
    // the prefix check) is rejected.
    let decoded: string;
    try {
      decoded = decodeURIComponent(src);
    } catch {
      // Malformed percent-encoding (e.g. /_tw/img/%zz) -- must be a 404,
      // not an unhandled URIError that 500s the request.
      return null;
    }
    const clean = normalize(decoded).replace(/\\/g, "/");
    if (clean.includes("\0") || clean.includes("..")) return null;
    const file = resolve(sourceDir, "." + (clean.startsWith("/") ? clean : "/" + clean));
    if (!file.startsWith(sourceDir + "/") && file !== sourceDir) return null;
    const dot = clean.split("/").pop() ?? "";
    if (dot.startsWith(".")) return null;
    if (!existsSync(file)) return null;
    const st = statSync(file);
    if (!st.isFile()) return null;
    return { data: readFileSync(file), mtime: st.mtimeMs };
  }

  function cacheKey(src: string, w: number, h: number, q: number, f: string, mtime: number): string {
    return createHash("sha256").update(`${src}|${mtime}|${w}|${h}|${q}|${f}`).digest("hex").slice(0, 32);
  }

  async function processBuffer(data: Buffer, w: number, h: number, q: number, format: string | null):
    Promise<{ data: Buffer; contentType: string; viaSharp: boolean }> {
    const sharp = await loadSharp();
    if (sharp && format) {
      try {
        let img = sharp(data);
        if (w || h) {
          img = img.resize(w || undefined, h || undefined, {
            fit: "inside",
            withoutEnlargement: true,
          });
        }
        if (format !== "jpeg" && format !== "png") {
          img = img.toFormat(format, { quality: q });
        } else if (format === "jpeg") {
          img = img.jpeg({ quality: q });
        }
        const out = await img.toBuffer();
        return { data: out, contentType: `image/${format}`, viaSharp: true };
      } catch (err: any) {
        // A broken image or a processor failure must never 500 the page —
        // fall through to serving the original bytes.
        console.warn(`  [tw/image] processing failed (${format}, ${w}x${h}), serving original: ${err?.message ?? err}`);
        return { data, contentType: "", viaSharp: false };
      }
    }

    // No sharp (or unsupported format): serve the original bytes untouched.
    if (!warnedNoSharp) {
      warnedNoSharp = true;
      console.warn("  [tw/image] sharp not installed — serving original images (bun add sharp to enable resizing/WebP/AVIF)");
    }
    return { data, contentType: "", viaSharp: false };
  }

  /**
   * Handle a request. Returns a Response when the path is an image route,
   * null otherwise (caller continues normal routing).
   */
  async function handle(request: Request): Promise<Response | null> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    if (!pathname.startsWith("/_tw/img/") && pathname !== "/_tw/img") return null;
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const q = url.searchParams;

    // Remote proxy form: /_tw/img/_remote?src=<encoded url>
    let src: string;
    if (pathname === "/_tw/img/_remote") {
      src = q.get("src") ?? "";
      if (!src) return new Response("Not Found", { status: 404 });
    } else {
      // /_tw/img/<source path...>
      src = pathname.slice("/_tw/img".length) || "/";
      if (src === "/" || src === "") return new Response("Not Found", { status: 404 });
    }
    const w = Math.max(0, Math.min(10000, parseInt(q.get("w") ?? "0", 10) || 0));
    const h = Math.max(0, Math.min(10000, parseInt(q.get("h") ?? "0", 10) || 0));
    const quality = Math.max(1, Math.min(100, parseInt(q.get("q") ?? String(config.quality), 10) || config.quality));
    const format = negotiateFormat(q.get("f"), request.headers.get("accept") ?? "");

    const source = await readSource(src);
    if (!source) return new Response("Not Found", { status: 404 });

    // SVG is already optimal — pass through untouched.
    if (extname(src).toLowerCase() === ".svg") {
      return new Response(new Uint8Array(source.data), {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": `public, max-age=${config.cacheMaxAge}`,
          "X-TW-Image": "svg-passthrough",
        },
      });
    }

    // Nothing to do and nothing to convert to -> original bytes.
    if (!w && !h && !format) {
      return new Response(new Uint8Array(source.data), {
        status: 200,
        headers: {
          "Content-Type": contentTypeFor(src),
          "Cache-Control": `public, max-age=${config.cacheMaxAge}`,
          "X-TW-Image": "original",
        },
      });
    }

    const key = cacheKey(src, w, h, quality, format ?? "orig", source.mtime);
    const cacheFile = join(cacheDir, `${key}${format ? "." + format : ""}`);
    const etag = `"${key}"`;

    // Revalidation
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag } });
    }

    // Disk cache hit
    if (existsSync(cacheFile)) {
      const cached = readFileSync(cacheFile);
      return new Response(new Uint8Array(cached), {
        status: 200,
        headers: {
          "Content-Type": contentTypeFor(cacheFile),
          "Cache-Control": `public, max-age=${config.cacheMaxAge}`,
          ETag: etag,
          "X-TW-Image": "cache",
        },
      });
    }

    // Process
    const result = await processBuffer(source.data, w, h, quality, format);
    // Only cache REAL conversions: a fallback (sharp missing / transient
    // processing failure) serves the ORIGINAL bytes — caching those under a
    // `.webp` name would permanently serve wrong-format data even after
    // sharp recovers.
    if (result.viaSharp) {
      try {
        mkdirSync(cacheDir, { recursive: true });
        writeFileSync(cacheFile, result.data);
      } catch { /* cache write failures are non-fatal */ }
    }

    return new Response(new Uint8Array(result.data), {
      status: 200,
      headers: {
        "Content-Type": result.contentType || contentTypeFor(src),
        "Cache-Control": `public, max-age=${config.cacheMaxAge}`,
        ETag: etag,
        "X-TW-Image": result.viaSharp ? "optimized" : "passthrough",
      },
    });
  }

  return { handle, sourceDir, cacheDir, config };
}

export type ImageHandler = ReturnType<typeof createImageHandler>;
