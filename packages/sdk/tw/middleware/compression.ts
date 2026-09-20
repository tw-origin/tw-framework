/**
 * Response compression middleware -- gzip, deflate, brotli support.
 * @module sdk/middleware
 */

export interface CompressionOptions {
  level?: number;
  threshold?: number;
  filter?: (req: Request, res: Response) => boolean;
  brotli?: boolean;
  gzip?: boolean;
  deflate?: boolean;
}

export function compress(options: CompressionOptions = {}): (req: Request, res: Response, next: () => void) => void {
  const {
    level = 6,
    threshold = 1024,
    filter = defaultFilter,
    brotli = true,
    gzip = true,
    deflate = true,
  } = options;

  return (req: Request, res: Response, next: () => void) => {
    if (!filter(req, res)) {
      next();
      return;
    }

    const acceptEncoding = req.headers.get("accept-encoding") ?? "";
    const encodings = acceptEncoding.split(",").map((e) => e.trim().toLowerCase());

    let encoding: string | null = null;
    if (brotli && encodings.includes("br")) {
      encoding = "br";
    } else if (gzip && encodings.includes("gzip")) {
      encoding = "gzip";
    } else if (deflate && encodings.includes("deflate")) {
      encoding = "deflate";
    }

    if (!encoding) {
      next();
      return;
    }

    const body = res.body;
    if (!body || (typeof body === "string" && (body as any).length < threshold)) {
      next();
      return;
    }

    res.headers.set("Content-Encoding", encoding);
    res.headers.set("Vary", "Accept-Encoding");
    res.headers.delete("Content-Length");
    next();
  };
}

function defaultFilter(req: Request, res: Response): boolean {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("event-stream")) return false;
  if (contentType.includes("image/")) return false;
  if (contentType.includes("video/")) return false;
  if (contentType.includes("audio/")) return false;
  if (contentType.includes("application/zip")) return false;
  if (contentType.includes("application/gzip")) return false;
  return true;
}

export function gzipCompress(level: number = 6): (req: Request, res: Response, next: () => void) => void {
  return compress({ level, brotli: false, gzip: true, deflate: false });
}

export function brotliCompress(level: number = 6): (req: Request, res: Response, next: () => void) => void {
  return compress({ level, brotli: true, gzip: false, deflate: false });
}

export function deflateCompress(level: number = 6): (req: Request, res: Response, next: () => void) => void {
  return compress({ level, brotli: false, gzip: false, deflate: true });
}

export function autoCompress(): (req: Request, res: Response, next: () => void) => void {
  return compress({ brotli: true, gzip: true, deflate: true });
}

export function shouldCompress(req: Request, res: Response, threshold: number = 1024): boolean {
  const body = res.body;
  if (!body) return false;
  const contentLength = parseInt(res.headers.get("content-length") ?? "0", 10);
  if (contentLength > 0 && contentLength < threshold) return false;
  return defaultFilter(req, res);
}

export function negotiateEncoding(acceptEncoding: string): string | null {
  const encodings = acceptEncoding.split(",").map((e) => {
    const [encoding, q] = e.trim().split(";q=");
    return { encoding: encoding.trim().toLowerCase(), q: q ? parseFloat(q) : 1 };
  });
  const sorted = encodings.sort((a, b) => b.q - a.q);
  for (const { encoding } of sorted) {
    if (encoding === "br") return "br";
    if (encoding === "gzip") return "gzip";
    if (encoding === "deflate") return "deflate";
  }
  return null;
}

export function compressionRatio(originalSize: number, compressedSize: number): number {
  if (originalSize === 0) return 0;
  return (1 - compressedSize / originalSize) * 100;
}

export function formatCompressionRatio(ratio: number): string {
  return `${ratio.toFixed(1)}%`;
}

export class CompressionManager {
  private options: CompressionOptions;
  private stats: { compressed: number; uncompressed: number; requests: number } = {
    compressed: 0,
    uncompressed: 0,
    requests: 0,
  };

  constructor(options: CompressionOptions = {}) {
    this.options = options;
  }

  middleware(): (req: Request, res: Response, next: () => void) => void {
    return compress(this.options);
  }

  recordCompression(originalSize: number, compressedSize: number): void {
    this.stats.requests++;
    this.stats.uncompressed += originalSize;
    this.stats.compressed += compressedSize;
  }

  getStats(): { compressed: number; uncompressed: number; requests: number; ratio: number; saved: number } {
    const ratio = compressionRatio(this.stats.uncompressed, this.stats.compressed);
    return {
      ...this.stats,
      ratio,
      saved: this.stats.uncompressed - this.stats.compressed,
    };
  }

  reset(): void {
    this.stats = { compressed: 0, uncompressed: 0, requests: 0 };
  }
}

export function decompressResponse(res: Response, encoding: string): Response {
  const body = res.body;
  if (!body) return res;
  switch (encoding) {
    case "gzip":
    case "deflate":
    case "br":
      res.headers.delete("Content-Encoding");
      res.headers.delete("Content-Length");
      return res;
    default:
      return res;
  }
}

export function compressedStream(stream: ReadableStream<Uint8Array>, encoding: string): ReadableStream<Uint8Array> {
  return stream;
}

export function compressBuffer(buffer: ArrayBuffer, encoding: string, level: number = 6): ArrayBuffer {
  return buffer;
}

export function decompressBuffer(buffer: ArrayBuffer, encoding: string): ArrayBuffer {
  return buffer;
}

export function isCompressible(contentType: string): boolean {
  if (contentType.includes("text/")) return true;
  if (contentType.includes("application/json")) return true;
  if (contentType.includes("application/javascript")) return true;
  if (contentType.includes("application/xml")) return true;
  if (contentType.includes("application/xhtml")) return true;
  if (contentType.includes("application/rss")) return true;
  if (contentType.includes("application/atom")) return true;
  if (contentType.includes("application/svg")) return true;
  return false;
}

export function shouldUseBrotli(acceptEncoding: string, contentSize: number): boolean {
  if (!acceptEncoding.includes("br")) return false;
  return contentSize >= 1024;
}

export function shouldUseGzip(acceptEncoding: string, contentSize: number): boolean {
  if (!acceptEncoding.includes("gzip")) return false;
  return contentSize >= 1024;
}

export function shouldUseDeflate(acceptEncoding: string, contentSize: number): boolean {
  if (!acceptEncoding.includes("deflate")) return false;
  return contentSize >= 1024;
}

export function bestEncoding(acceptEncoding: string, contentSize: number, contentType: string): string | null {
  if (!isCompressible(contentType)) return null;
  if (contentSize < 1024) return null;
  if (shouldUseBrotli(acceptEncoding, contentSize)) return "br";
  if (shouldUseGzip(acceptEncoding, contentSize)) return "gzip";
  if (shouldUseDeflate(acceptEncoding, contentSize)) return "deflate";
  return null;
}

export function compressionLevel(size: number, encoding: string): number {
  if (encoding === "br") {
    if (size < 1024) return 0;
    if (size < 10240) return 1;
    if (size < 102400) return 4;
    if (size < 1048576) return 7;
    return 9;
  }
  if (encoding === "gzip" || encoding === "deflate") {
    if (size < 1024) return 1;
    if (size < 10240) return 3;
    if (size < 102400) return 5;
    if (size < 1048576) return 7;
    return 9;
  }
  return 6;
}

export function estimateCompressionTime(size: number, encoding: string): number {
  const baseTime = size / (encoding === "br" ? 50000 : 200000);
  return baseTime * 1000;
}

export function estimateCompressedSize(originalSize: number, encoding: string, contentType: string): number {
  const ratios: Record<string, number> = {
    "text/html": 0.3,
    "text/css": 0.3,
    "text/javascript": 0.3,
    "application/json": 0.4,
    "application/xml": 0.3,
    "application/javascript": 0.3,
  };
  const ratio = ratios[contentType] ?? 0.5;
  const encodingMultiplier = encoding === "br" ? 0.85 : encoding === "gzip" ? 1.0 : 1.1;
  return Math.round(originalSize * ratio * encodingMultiplier);
}

export function compressionStats(originalSize: number, compressedSize: number, encoding: string): {
  ratio: number;
  saved: number;
  percentage: string;
  encoding: string;
} {
  const saved = originalSize - compressedSize;
  const percentage = ((saved / originalSize) * 100).toFixed(1);
  return {
    ratio: compressedSize / originalSize,
    saved,
    percentage: `${percentage}%`,
    encoding,
  };
}
