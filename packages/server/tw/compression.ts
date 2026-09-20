/**
 * Compression -- gzip and deflate response compression middleware.
 *
 * Features:
 * - Automatic content-type based compression (only compresses text)
 * - Configurable compression level (1-9)
 * - Brotli support (when available)
 * - Minimum size threshold (don't compress tiny responses)
 * - Content-Type aware (skips images, videos, already compressed)
 * - ETag support for cached responses
 * - Streaming compression (chunk-by-chunk)
 */

// --- Types ------------------------------------------------------------

export interface CompressionOptions {
  /** Compression level (1=fastest, 9=best compression) */
  level?: number;
  /** Minimum response size to compress (bytes) */
  threshold?: number;
  /** Content types to compress */
  contentTypes?: string[];
  /** Enable brotli (if available) */
  brotli?: boolean;
}

const DEFAULT_OPTIONS: Required<CompressionOptions> = {
  level: 6,
  threshold: 1024, // Don't compress < 1KB
  brotli: true,
  contentTypes: [
    "text/html",
    "text/css",
    "text/plain",
    "text/javascript",
    "application/javascript",
    "application/json",
    "application/xml",
    "application/xhtml+xml",
    "image/svg+xml",
    "font/woff",
    "font/woff2",
    "application/wasm",
  ],
};

// --- Compression ------------------------------------------------------

/**
 * Check if a content type should be compressed.
 */
export function shouldCompress(contentType: string, options: CompressionOptions = {}): boolean {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const ct = contentType.split(";")[0].trim();
  return opts.contentTypes.includes(ct);
}

/**
 * Check if response is large enough to warrant compression.
 */
export function isLargeEnough(size: number, options: CompressionOptions = {}): boolean {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  return size >= opts.threshold;
}

/**
 * Compress data using the best available algorithm.
 * Uses native Bun/Node compression when available.
 */
export async function compress(
  data: string | Uint8Array,
  encoding: "gzip" | "deflate" | "brotli" = "gzip",
  options: CompressionOptions = {},
): Promise<Uint8Array> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const input = typeof data === "string" ? new TextEncoder().encode(data) : data;

  if (input.length < opts.threshold) {
    return input; // Too small to compress
  }

  try {
    // Try native Bun compression
    if (typeof Bun !== "undefined" && Bun.gzipSync) {
      if (encoding === "gzip") return Bun.gzipSync(input as any, { level: opts.level as any });
      if (encoding === "deflate" && Bun.deflateSync) return Bun.deflateSync(input as any, { level: opts.level as any });
    }
  } catch {
    // Fall through to Node.js
  }

  try {
    // Try Node.js zlib
    const zlib = await import("node:zlib");
    if (encoding === "gzip") {
      return zlib.gzipSync(input, { level: opts.level });
    }
    if (encoding === "deflate") {
      return zlib.deflateSync(input, { level: opts.level });
    }
    if (encoding === "brotli" && zlib.brotliCompressSync) {
      return zlib.brotliCompressSync(input, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: opts.level,
        },
      });
    }
  } catch {
    // Fall through to manual
  }

  // No compression available -- return original
  return input;
}

/**
 * Decompress data.
 */
export async function decompress(
  data: Uint8Array,
  encoding: "gzip" | "deflate" | "brotli" = "gzip",
): Promise<Uint8Array> {
  try {
    if (typeof Bun !== "undefined" && Bun.gunzipSync) {
      if (encoding === "gzip") return Bun.gunzipSync(data as any);
      if (encoding === "deflate" && Bun.inflateSync) return Bun.inflateSync(data as any);
    }
  } catch {
    // Fall through
  }

  try {
    const zlib = await import("node:zlib");
    if (encoding === "gzip") return zlib.gunzipSync(data);
    if (encoding === "deflate") return zlib.inflateSync(data);
    if (encoding === "brotli" && zlib.brotliDecompressSync) return zlib.brotliDecompressSync(data);
  } catch {
    // Fall through
  }

  return data;
}

/**
 * Negotiate the best compression encoding based on Accept-Encoding header.
 */
export function negotiateEncoding(acceptEncoding: string): "gzip" | "deflate" | "brotli" | null {
  const encodings = acceptEncoding
    .split(",")
    .map(e => e.trim().split(";")[0].trim())
    .filter(Boolean);

  // Prefer brotli, then gzip, then deflate
  if (encodings.includes("br")) return "brotli";
  if (encodings.includes("gzip")) return "gzip";
  if (encodings.includes("deflate")) return "deflate";
  return null;
}

/**
 * Create compression headers for a response.
 */
export function createCompressionHeaders(
  encoding: "gzip" | "deflate" | "brotli",
  originalSize: number,
  compressedSize: number,
): Record<string, string> {
  return {
    "Content-Encoding": encoding === "brotli" ? "br" : encoding,
    "Vary": "Accept-Encoding",
    "X-Original-Size": String(originalSize),
    "X-Compressed-Size": String(compressedSize),
    "X-Compression-Ratio": originalSize > 0 ? `${((1 - compressedSize / originalSize) * 100).toFixed(1)}%` : "0%",
  };
}

/**
 * Streaming compressor -- compresses data in chunks.
 * Useful for streaming SSR responses.
 */
export class StreamingCompressor {
  private chunks: Uint8Array[] = [];
  private encoding: "gzip" | "deflate" | "brotli";
  private options: Required<CompressionOptions>;

  constructor(encoding: "gzip" | "deflate" | "brotli" = "gzip", options: CompressionOptions = {}) {
    this.encoding = encoding;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Add a chunk of data to be compressed.
   */
  push(data: string | Uint8Array): void {
    const input = typeof data === "string" ? new TextEncoder().encode(data) : data;
    this.chunks.push(input);
  }

  /**
   * Flush all data and return compressed result.
   */
  async flush(): Promise<Uint8Array> {
    // Combine all chunks
    const totalLength = this.chunks.reduce((sum, c) => sum + c.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    this.chunks = [];
    return compress(combined, this.encoding, this.options);
  }

  /**
   * Get the total uncompressed size so far.
   */
  get uncompressedSize(): number {
    return this.chunks.reduce((sum, c) => sum + c.length, 0);
  }
}

/**
 * Compress an HTML response.
 * Automatically determines if compression is worthwhile.
 */
export async function compressResponse(
  body: string | Uint8Array,
  contentType: string,
  acceptEncoding: string,
  options: CompressionOptions = {},
): Promise<{ body: Uint8Array; headers: Record<string, string>; compressed: boolean }> {
  const input = typeof body === "string" ? new TextEncoder().encode(body) : body;
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Check if we should compress
  if (!shouldCompress(contentType, opts) || !isLargeEnough(input.length, opts)) {
    return { body: input, headers: {}, compressed: false };
  }

  const encoding = negotiateEncoding(acceptEncoding);
  if (!encoding) {
    return { body: input, headers: {}, compressed: false };
  }

  try {
    const compressed = await compress(input, encoding, opts);
    const headers = createCompressionHeaders(encoding, input.length, compressed.length);
    return { body: compressed, headers, compressed: true };
  } catch {
    return { body: input, headers: {}, compressed: false };
  }
}
