/**
 * Image loader (tw.config.ts `images.loader`).
 *
 * Turns a source image plus the width/quality/format you want into a real URL
 * on whichever CDN you configured, and builds a matching `srcset`. Remote
 * sources are only allowed through when their host is in `remoteAllowHosts`,
 * so a page cannot be tricked into proxying an arbitrary origin.
 *
 *   default     -- the built-in optimizer's own URL (/tw/img?...)
 *   imgix       -- https://<host>/<path>?w=&q=&auto=format
 *   cloudinary  -- https://res.cloudinary.com/<cloud>/image/upload/w_,q_,f_/...
 *   vercel      -- /_next/image?url=&w=&q=
 *   cloudflare  -- /cdn-cgi/image/width=,quality=,format=/<path>
 *   custom      -- your own URL template with {width} {quality} {format} {src}
 */

export type ImageLoaderName = "default" | "imgix" | "cloudinary" | "vercel" | "cloudflare" | "custom";

export interface ImageLoaderConfig {
  loader?: ImageLoaderName;
  remoteAllowHosts?: string[];
  domain?: string;
  cloud?: string;
  template?: string;
  quality?: number;
}

export interface ImageRequest {
  src: string;
  width: number;
  quality?: number;
  format?: "auto" | "webp" | "avif" | "png" | "jpeg";
}

/** True when `src` is a remote URL whose host is allowed (or it is local). */
export function isAllowedSource(src: string, allowHosts: string[] = []): boolean {
  if (!/^https?:\/\//i.test(src)) return true;
  let host: string;
  try { host = new URL(src).host; } catch { return false; }
  return allowHosts.some((allowed) => {
    if (allowed.startsWith(".")) return host === allowed.slice(1) || host.endsWith(allowed);
    return host === allowed;
  });
}

function assertAllowed(src: string, allowHosts: string[]): void {
  if (!isAllowedSource(src, allowHosts)) {
    const err: any = new Error(
      `images: remote host for "${src}" is not in remoteAllowHosts. ` +
      `Add it to tw.config.ts images.remoteAllowHosts to use it.`,
    );
    err.code = "IMAGE_HOST_NOT_ALLOWED";
    throw err;
  }
}

/** Build the transform URL for one image request. */
export function buildImageUrl(req: ImageRequest, config: ImageLoaderConfig = {}): string {
  const loader = config.loader ?? "default";
  const quality = req.quality ?? config.quality ?? 75;
  const format = req.format ?? "auto";
  const allow = config.remoteAllowHosts ?? [];
  assertAllowed(req.src, allow);

  switch (loader) {
    case "imgix": {
      const domain = config.domain ?? "";
      const base = /^https?:\/\//.test(req.src) ? req.src : `https://${domain}${req.src.startsWith("/") ? "" : "/"}${req.src}`;
      const u = new URL(base);
      u.searchParams.set("w", String(req.width));
      u.searchParams.set("q", String(quality));
      if (format === "auto") u.searchParams.set("auto", "format");
      else u.searchParams.set("fm", format);
      return u.toString();
    }
    case "cloudinary": {
      const cloud = config.cloud ?? "demo";
      const path = req.src.replace(/^https?:\/\/[^/]+/, "");
      const t = ["w_" + req.width, "q_" + quality, format === "auto" ? "f_auto" : "f_" + format].join(",");
      return `https://res.cloudinary.com/${cloud}/image/upload/${t}${path}`;
    }
    case "vercel": {
      const q = new URLSearchParams({ url: req.src, w: String(req.width), q: String(quality) });
      return `/_next/image?${q.toString()}`;
    }
    case "cloudflare": {
      const parts = ["width=" + req.width, "quality=" + quality, "format=" + format, "fit=scale-down"];
      return `/cdn-cgi/image/${parts.join(",")}${req.src}`;
    }
    case "custom": {
      const t = config.template ?? "{src}?w={width}&q={quality}&f={format}";
      return t
        .replace("{src}", req.src)
        .replace("{width}", String(req.width))
        .replace("{quality}", String(quality))
        .replace("{format}", format);
    }
    default: {
      const q = new URLSearchParams({ url: req.src, w: String(req.width), q: String(quality), f: format });
      return `/tw/img?${q.toString()}`;
    }
  }
}

/** Build a `srcset` string across the widths you pass. */
export function buildSrcSet(
  src: string,
  widths: number[],
  config: ImageLoaderConfig = {},
  opts: { quality?: number; format?: ImageRequest["format"] } = {},
): string {
  return widths
    .map((width) => `${buildImageUrl({ src, width, quality: opts.quality, format: opts.format }, config)} ${width}w`)
    .join(", ");
}

/** Build a `<link rel="preload" as="image">` for the LCP image. */
export function preloadLink(src: string, config: ImageLoaderConfig = {}, opts: { width?: number; quality?: number; format?: ImageRequest["format"] } = {}): string {
  const href = buildImageUrl({ src, width: opts.width ?? 1200, quality: opts.quality, format: opts.format ?? "webp" }, config);
  return `<link rel="preload" as="image" href="${href}" imagesrcset="${buildSrcSet(src, [640, 960, 1200], config, { quality: opts.quality, format: opts.format ?? "webp" })}" imagesizes="100vw">`;
}

export interface ImageLoader {
  name: ImageLoaderName;
  url(req: ImageRequest): string;
  srcset(src: string, widths: number[], opts?: { quality?: number; format?: ImageRequest["format"] }): string;
  preload(src: string, opts?: { width?: number; quality?: number; format?: ImageRequest["format"] }): string;
  allows(src: string): boolean;
}

/** Build the image loader for the configured CDN. */
export function createImageLoader(config: ImageLoaderConfig = {}): ImageLoader {
  const name: ImageLoaderName = (["imgix", "cloudinary", "vercel", "cloudflare", "custom"] as const)
    .includes(config.loader as any) ? config.loader as ImageLoaderName : "default";
  const cfg = { ...config, loader: name };
  return {
    name,
    url: (req) => buildImageUrl(req, cfg),
    srcset: (src, widths, opts = {}) => buildSrcSet(src, widths, cfg, opts),
    preload: (src, opts = {}) => preloadLink(src, cfg, opts),
    allows: (src) => isAllowedSource(src, cfg.remoteAllowHosts ?? []),
  };
}
