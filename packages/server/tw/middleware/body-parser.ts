/**
 * Body parsing middleware -- JSON, URL-encoded, text, raw, multipart.
 * @module server/middleware
 */

export interface BodyParserOptions {
  json?: { limit?: number; strict?: boolean; type?: string };
  urlencoded?: { limit?: number; extended?: boolean };
  text?: { limit?: number; type?: string };
  raw?: { limit?: number; type?: string };
  multipart?: { limit?: number; fieldSize?: number; fileSize?: number; fields?: number; files?: number };
}

export interface ParsedBody {
  json?: unknown;
  urlencoded?: Record<string, string>;
  text?: string;
  raw?: Buffer;
  multipart?: { fields: Record<string, string>; files: Array<{ name: string; data: Buffer; mimetype: string; size: number }> };
}

const DEFAULT_LIMIT = 1024 * 1024; // 1MB

export function bodyParse(options: BodyParserOptions = {}): (req: Request, res: Response, next: () => void) => Promise<void> {
  const jsonOpts = { limit: DEFAULT_LIMIT, strict: true, type: "application/json", ...options.json };
  const urlencodedOpts = { limit: DEFAULT_LIMIT, extended: false, ...options.urlencoded };
  const textOpts = { limit: DEFAULT_LIMIT, type: "text/*", ...options.text };
  const rawOpts = { limit: DEFAULT_LIMIT, type: "application/octet-stream", ...options.raw };
  const multipartOpts = { limit: DEFAULT_LIMIT, fieldSize: 1024, fileSize: DEFAULT_LIMIT, fields: 10, files: 5, ...options.multipart };

  return async (req: Request, res: Response, next: () => void) => {
    const contentType = req.headers.get("content-type") ?? "";
    const contentLength = parseInt(req.headers.get("content-length") ?? "0", 10);

    // Skip only when there is genuinely nothing to read. A chunked request
    // (Transfer-Encoding: chunked, no Content-Length header) parses to 0 here
    // but still carries a real body stream -- skipping silently dropped it.
    if (contentLength === 0 && req.body == null) {
      next();
      return;
    }

    try {
      if (contentType.includes("application/json") && jsonOpts) {
        const text = await readBody(req, jsonOpts.limit);
        const parsed = JSON.parse(text);
        (req as unknown as { body: unknown }).body = jsonOpts.strict ? ensureObject(parsed) : parsed;
      } else if (contentType.includes("application/x-www-form-urlencoded") && urlencodedOpts) {
        const text = await readBody(req, urlencodedOpts.limit);
        const parsed = parseUrlEncoded(text);
        (req as unknown as { body: Record<string, string> }).body = parsed;
      } else if (contentType.match(textOpts.type ?? "text/*") && textOpts) {
        const text = await readBody(req, textOpts.limit);
        (req as unknown as { body: string }).body = text;
      } else if (contentType.includes(rawOpts.type ?? "application/octet-stream") && rawOpts) {
        const buffer = await readBuffer(req, rawOpts.limit);
        (req as unknown as { body: Buffer }).body = buffer;
      } else if (contentType.includes("multipart/form-data") && multipartOpts) {
        const buffer = await readBuffer(req, multipartOpts.limit);
        const parsed = parseMultipart(buffer, contentType, multipartOpts);
        (req as unknown as { body: ParsedBody["multipart"] }).body = parsed;
      }
    } catch (error) {
      (res as any).status = 400;
      res.headers.set("content-type", "application/json");
      (res as any).body = JSON.stringify({ error: "Body parsing failed", message: (error as Error).message });
      return;
    }

    next();
  };
}

function declaredLength(req: Request): number | null {
  const raw = req.headers.get("content-length");
  if (raw == null) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

/** Rejects a request whose DECLARED size already exceeds the limit, before any body is read. */
function precheckDeclared(req: Request, limit: number): void {
  const declared = declaredLength(req);
  if (declared !== null && declared > limit) {
    throw new Error(`Body exceeds limit of ${limit} bytes`);
  }
}

async function readBody(req: Request, limit: number): Promise<string> {
  // 1) Honest clients that declared an oversized Content-Length are
  //    rejected without buffering anything.
  precheckDeclared(req, limit);
  // 2) Stream the body and abort as soon as the limit is crossed, so a
  //    large (or endless) upload cannot buffer unbounded data in memory
  //    before the check fires. Plain-object request shims without a
  //    `body` stream fall back to the buffered path.
  if (req.body) {
    const reader = (req.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let received = 0;
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > limit) {
        await reader.cancel().catch(() => {});
        throw new Error(`Body exceeds limit of ${limit} bytes`);
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  }
  const text = await req.text();
  if (text.length > limit) throw new Error(`Body exceeds limit of ${limit} bytes`);
  return text;
}

async function readBuffer(req: Request, limit: number): Promise<Buffer> {
  precheckDeclared(req, limit);
  if (req.body) {
    const reader = (req.body as ReadableStream<Uint8Array>).getReader();
    const chunks: Buffer[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > limit) {
        await reader.cancel().catch(() => {});
        throw new Error(`Body exceeds limit of ${limit} bytes`);
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }
  const arrayBuffer = await req.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length > limit) throw new Error(`Body exceeds limit of ${limit} bytes`);
  return buffer;
}

function ensureObject(value: unknown): unknown {
  if (value === null || typeof value === "object") return value;
  throw new Error("Strict JSON parsing requires an object or array");
}

function parseUrlEncoded(text: string): Record<string, string> {
  const params = new URLSearchParams(text);
  const result: Record<string, string> = {};
  params.forEach((value, key) => { result[key] = value; });
  return result;
}

function parseMultipart(buffer: Buffer, contentType: string, options: { fieldSize: number; fileSize: number; fields: number; files: number }): ParsedBody["multipart"] {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
  const boundary = boundaryMatch ? (boundaryMatch[1] ?? boundaryMatch[2]) : "";
  if (!boundary) throw new Error("No boundary found in multipart content type");

  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const parts = splitBuffer(buffer, boundaryBuffer);
  const fields: Record<string, string> = {};
  const files: Array<{ name: string; data: Buffer; mimetype: string; size: number }> = [];

  for (const part of parts) {
    if (part.length === 0 || part.toString().startsWith("--")) continue;
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) continue;

    const headerStr = part.slice(0, headerEnd).toString();
    const bodyBuffer = part.slice(headerEnd + 4);

    const nameMatch = headerStr.match(/name="([^"]+)"/);
    const filenameMatch = headerStr.match(/filename="([^"]+)"/);
    const contentTypeMatch = headerStr.match(/Content-Type: ([^\r\n]+)/);

    if (filenameMatch) {
      if (files.length >= options.files) continue;
      if (bodyBuffer.length > options.fileSize) throw new Error(`File size exceeds limit of ${options.fileSize}`);
      files.push({
        name: nameMatch ? nameMatch[1] : filenameMatch[1],
        data: bodyBuffer,
        mimetype: contentTypeMatch ? contentTypeMatch[1].trim() : "application/octet-stream",
        size: bodyBuffer.length,
      });
    } else if (nameMatch) {
      if (Object.keys(fields).length >= options.fields) continue;
      fields[nameMatch[1]] = bodyBuffer.toString().trim();
    }
  }

  return { fields, files };
}

function splitBuffer(buffer: Buffer, delimiter: Buffer): Buffer[] {
  const parts: Buffer[] = [];
  let start = 0;
  let idx = buffer.indexOf(delimiter, start);
  while (idx !== -1) {
    parts.push(buffer.slice(start, idx - 2)); // -2 for \r\n before boundary
    start = idx + delimiter.length;
    idx = buffer.indexOf(delimiter, start);
  }
  if (start < buffer.length) {
    parts.push(buffer.slice(start));
  }
  return parts;
}

export function jsonBody(limit: number = DEFAULT_LIMIT): (req: Request, res: Response, next: () => void) => Promise<void> {
  return bodyParse({ json: { limit, strict: true } });
}

export function urlEncodedBody(limit: number = DEFAULT_LIMIT): (req: Request, res: Response, next: () => void) => Promise<void> {
  return bodyParse({ urlencoded: { limit, extended: true } });
}

export function textBody(limit: number = DEFAULT_LIMIT): (req: Request, res: Response, next: () => void) => Promise<void> {
  return bodyParse({ text: { limit, type: "text/*" } });
}

export function rawBody(limit: number = DEFAULT_LIMIT): (req: Request, res: Response, next: () => void) => Promise<void> {
  return bodyParse({ raw: { limit, type: "application/octet-stream" } });
}

export function multipartBody(limit: number = 10 * DEFAULT_LIMIT): (req: Request, res: Response, next: () => void) => Promise<void> {
  return bodyParse({ multipart: { limit, fileSize: 5 * DEFAULT_LIMIT, fields: 20, files: 10 } });
}

export function anyBody(options: BodyParserOptions = {}): (req: Request, res: Response, next: () => void) => Promise<void> {
  return bodyParse({
    json: { limit: DEFAULT_LIMIT, ...options.json },
    urlencoded: { limit: DEFAULT_LIMIT, ...options.urlencoded },
    text: { limit: DEFAULT_LIMIT, ...options.text },
    raw: { limit: DEFAULT_LIMIT, ...options.raw },
    multipart: { limit: 10 * DEFAULT_LIMIT, ...options.multipart },
  });
}

export class BodyParser {
  private options: BodyParserOptions;

  constructor(options: BodyParserOptions = {}) {
    this.options = options;
  }

  middleware(): (req: Request, res: Response, next: () => void) => Promise<void> {
    return bodyParse(this.options);
  }

  async parse(req: Request): Promise<ParsedBody> {
    const contentType = req.headers.get("content-type") ?? "";
    const result: ParsedBody = {};
    // parse() runs the same per-type limits as the middleware factory --
    // previously it read the body with NO size check at all.
    const limitFor = (type: "json" | "urlencoded" | "text" | "raw"): number =>
      (this.options[type] as { limit?: number } | undefined)?.limit ?? DEFAULT_LIMIT;
    if (contentType.includes("application/json")) {
      result.json = JSON.parse(await readBody(req, limitFor("json")));
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const text = await readBody(req, limitFor("urlencoded"));
      result.urlencoded = parseUrlEncoded(text);
    } else if (contentType.includes("text/")) {
      result.text = await readBody(req, limitFor("text"));
    } else if (contentType.includes("application/octet-stream")) {
      result.raw = await readBuffer(req, limitFor("raw"));
    }
    return result;
  }

  getOptions(): BodyParserOptions {
    return this.options;
  }

  setLimit(type: keyof BodyParserOptions, limit: number): void {
    if (!this.options[type]) this.options[type] = {} as Record<string, unknown>;
    (this.options[type] as Record<string, unknown>).limit = limit;
  }
}

export function validateBody(schema: Record<string, { type: string; required?: boolean; min?: number; max?: number; pattern?: RegExp }>): (req: Request, res: Response, next: () => void) => Promise<void> {
  return async (req: Request, res: Response, next: () => void) => {
    const body = (req as unknown as { body: Record<string, unknown> }).body;
    if (!body) {
      (res as any).status = 400;
      (res as any).body = JSON.stringify({ error: "No body provided" });
      return;
    }
    const errors: string[] = [];
    for (const [field, rules] of Object.entries(schema)) {
      if (rules.required && !(field in body)) {
        errors.push(`Missing required field: ${field}`);
        continue;
      }
      if (field in body) {
        const value = body[field];
        if (typeof value !== rules.type) {
          errors.push(`Field ${field} must be of type ${rules.type}`);
          continue;
        }
        if (rules.min !== undefined && typeof value === "number" && value < rules.min) {
          errors.push(`Field ${field} must be at least ${rules.min}`);
        }
        if (rules.max !== undefined && typeof value === "number" && value > rules.max) {
          errors.push(`Field ${field} must be at most ${rules.max}`);
        }
        if (rules.pattern && typeof value === "string" && !rules.pattern.test(value)) {
          errors.push(`Field ${field} does not match required pattern`);
        }
      }
    }
    if (errors.length > 0) {
      (res as any).status = 400;
      res.headers.set("content-type", "application/json");
      (res as any).body = JSON.stringify({ errors });
      return;
    }
    next();
  };
}

export function sanitizeBody(): (req: Request, res: Response, next: () => void) => Promise<void> {
  return async (req: Request, _res: Response, next: () => void) => {
    const body = (req as unknown as { body: unknown }).body;
    if (body && typeof body === "object") {
      (req as unknown as { body: unknown }).body = sanitizeObject(body);
    }
    next();
  };
}

function sanitizeObject(obj: unknown): unknown {
  if (typeof obj === "string") return sanitizeString(obj);
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[sanitizeString(key) as string] = sanitizeObject(value);
    }
    return result;
  }
  return obj;
}

function sanitizeString(str: string): string {
  return str
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/&/g, "&amp;");
}

export function limitBodySize(maxSize: number): (req: Request, res: Response, next: () => void) => Promise<void> {
  return async (req: Request, res: Response, next: () => void) => {
    const contentLength = parseInt(req.headers.get("content-length") ?? "0", 10);
    if (contentLength > maxSize) {
      (res as any).status = 413;
      res.headers.set("content-type", "application/json");
      (res as any).body = JSON.stringify({ error: "Request entity too large", maxSize });
      return;
    }
    next();
  };
}

export function contentTypeFilter(allowed: string[]): (req: Request, res: Response, next: () => void) => Promise<void> {
  return async (req: Request, res: Response, next: () => void) => {
    const contentType = req.headers.get("content-type") ?? "";
    if (req.method === "GET" || req.method === "HEAD" || req.method === "DELETE") {
      next();
      return;
    }
    if (!allowed.some((type) => contentType.includes(type))) {
      (res as any).status = 415;
      res.headers.set("content-type", "application/json");
      (res as any).body = JSON.stringify({ error: "Unsupported media type", allowed });
      return;
    }
    next();
  };
}

export function methodFilter(allowed: string[]): (req: Request, res: Response, next: () => void) => void {
  return (req: Request, res: Response, next: () => void) => {
    if (!allowed.includes(req.method)) {
      (res as any).status = 405;
      res.headers.set("Allow", allowed.join(", "));
      res.headers.set("content-type", "application/json");
      (res as any).body = JSON.stringify({ error: "Method not allowed", allowed });
      return;
    }
    next();
  };
}

export function acceptFilter(allowed: string[]): (req: Request, res: Response, next: () => void) => void {
  return (req: Request, res: Response, next: () => void) => {
    const accept = req.headers.get("accept") ?? "*/*";
    if (accept === "*/*") {
      next();
      return;
    }
    if (!allowed.some((type) => accept.includes(type))) {
      (res as any).status = 406;
      res.headers.set("content-type", "application/json");
      (res as any).body = JSON.stringify({ error: "Not acceptable", allowed });
      return;
    }
    next();
  };
}

export function conditionalGet(): (req: Request, res: Response, next: () => void) => void {
  return (req: Request, res: Response, next: () => void) => {
    const ifNoneMatch = req.headers.get("if-none-match");
    const ifModifiedSince = req.headers.get("if-modified-since");
    if (ifNoneMatch && res.headers.get("etag") === ifNoneMatch) {
      (res as any).status = 304;
      (res as any).body = "";
      return;
    }
    if (ifModifiedSince) {
      const since = new Date(ifModifiedSince);
      const modified = res.headers.get("last-modified");
      if (modified && new Date(modified) <= since) {
        (res as any).status = 304;
        (res as any).body = "";
        return;
      }
    }
    next();
  };
}

export function rangeRequest(): (req: Request, res: Response, next: () => void) => void {
  return (req: Request, res: Response, next: () => void) => {
    const range = req.headers.get("range");
    if (!range) {
      next();
      return;
    }
    const match = range.match(/bytes=(\d+)-(\d*)/);
    if (!match) {
      (res as any).status = 416;
      (res as any).body = "Invalid range";
      return;
    }
    const start = parseInt(match[1], 10);
    const end = match[2] ? parseInt(match[2], 10) : undefined;
    const contentLength = parseInt(res.headers.get("content-length") ?? "0", 10);
    if (start >= contentLength || (end !== undefined && end >= contentLength)) {
      (res as any).status = 416;
      res.headers.set("content-range", `bytes */${contentLength}`);
      (res as any).body = "Range not satisfiable";
      return;
    }
    (res as any).status = 206;
    res.headers.set("content-range", `bytes ${start}-${end ?? contentLength - 1}/${contentLength}`);
    res.headers.set("accept-ranges", "bytes");
    next();
  };
}

export function timeoutMiddleware(ms: number = 30000): (req: Request, res: Response, next: () => void) => void {
  return (req: Request, res: Response, next: () => void) => {
    const timer = setTimeout(() => {
      (res as any).status = 408;
      res.headers.set("content-type", "application/json");
      (res as any).body = JSON.stringify({ error: "Request timeout", timeout: ms });
    }, ms);
    const originalSet = res.headers.set.bind(res.headers);
    res.headers.set = (key: string, value: string) => {
      clearTimeout(timer);
      return originalSet(key, value);
    };
    next();
  };
}

export function errorBoundary(onError?: (error: Error, req: Request) => void): (req: Request, res: Response, next: () => void) => void {
  return (req: Request, res: Response, next: () => void) => {
    try {
      next();
    } catch (error) {
      if (onError) {
        onError(error as Error, req);
      } else {
        console.error("[ErrorBoundary]", error);
      }
      (res as any).status = 500;
      res.headers.set("content-type", "application/json");
      (res as any).body = JSON.stringify({ error: "Internal server error", message: (error as Error).message });
    }
  };
}

export function notFound(): (req: Request, res: Response, next: () => void) => void {
  return (req: Request, res: Response, next: () => void) => {
    if (res.status === 404 || res.body === undefined) {
      (res as any).status = 404;
      res.headers.set("content-type", "application/json");
      (res as any).body = JSON.stringify({ error: "Not found", path: new URL(req.url).pathname });
      return;
    }
    next();
  };
}

export function favicon(): (req: Request, res: Response, next: () => void) => void {
  return (req: Request, res: Response, next: () => void) => {
    if (new URL(req.url).pathname === "/favicon.ico") {
      (res as any).status = 204;
      (res as any).body = "";
      return;
    }
    next();
  };
}

export function healthCheck(path: string = "/health"): (req: Request, res: Response, next: () => void) => void {
  return (req: Request, res: Response, next: () => void) => {
    if (new URL(req.url).pathname === path) {
      (res as any).status = 200;
      res.headers.set("content-type", "application/json");
      (res as any).body = JSON.stringify({ status: "ok", timestamp: new Date().toISOString() });
      return;
    }
    next();
  };
}

export function poweredBy(header: string = "TW"): (req: Request, res: Response, next: () => void) => void {
  return (req: Request, res: Response, next: () => void) => {
    res.headers.set("X-Powered-By", header);
    next();
  };
}

export function removeHeader(...headers: string[]): (req: Request, res: Response, next: () => void) => void {
  return (req: Request, res: Response, next: () => void) => {
    for (const header of headers) {
      res.headers.delete(header);
    }
    next();
  };
}

export function setHeaders(headers: Record<string, string>): (req: Request, res: Response, next: () => void) => void {
  return (req: Request, res: Response, next: () => void) => {
    for (const [key, value] of Object.entries(headers)) {
      res.headers.set(key, value);
    }
    next();
  };
}

export function cacheHeaders(maxAge: number = 3600, isImmutable: boolean = false): (req: Request, res: Response, next: () => void) => void {
  return (req: Request, res: Response, next: () => void) => {
    res.headers.set("Cache-Control", isImmutable ? `public, max-age=${maxAge}, immutable` : `public, max-age=${maxAge}`);
    next();
  };
}

export function noCache(): (req: Request, res: Response, next: () => void) => void {
  return (req: Request, res: Response, next: () => void) => {
    res.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
    next();
  };
}

export function redirectToHTTPS(): (req: Request, res: Response, next: () => void) => void {
  return (req: Request, res: Response, next: () => void) => {
    const proto = req.headers.get("x-forwarded-proto");
    if (proto === "http") {
      const url = new URL(req.url);
      url.protocol = "https:";
      (res as any).status = 301;
      res.headers.set("Location", url.toString());
      (res as any).body = "";
      return;
    }
    next();
  };
}

export function redirectToWWW(): (req: Request, res: Response, next: () => void) => void {
  return (req: Request, res: Response, next: () => void) => {
    const host = req.headers.get("host") ?? "";
    if (!host.startsWith("www.")) {
      const url = new URL(req.url);
      url.hostname = "www." + host;
      (res as any).status = 301;
      res.headers.set("Location", url.toString());
      (res as any).body = "";
      return;
    }
    next();
  };
}

export function redirectToNonWWW(): (req: Request, res: Response, next: () => void) => void {
  return (req: Request, res: Response, next: () => void) => {
    const host = req.headers.get("host") ?? "";
    if (host.startsWith("www.")) {
      const url = new URL(req.url);
      url.hostname = host.slice(4);
      (res as any).status = 301;
      res.headers.set("Location", url.toString());
      (res as any).body = "";
      return;
    }
    next();
  };
}

export function trailingSlash(enabled: boolean = true): (req: Request, res: Response, next: () => void) => void {
  return (req: Request, res: Response, next: () => void) => {
    const url = new URL(req.url);
    const hasTrailingSlash = url.pathname.endsWith("/");
    if (enabled && !hasTrailingSlash && url.pathname !== "/") {
      url.pathname += "/";
      (res as any).status = 301;
      res.headers.set("Location", url.toString());
      (res as any).body = "";
      return;
    }
    if (!enabled && hasTrailingSlash && url.pathname !== "/") {
      url.pathname = url.pathname.slice(0, -1);
      (res as any).status = 301;
      res.headers.set("Location", url.toString());
      (res as any).body = "";
      return;
    }
    next();
  };
}

export function lowerCasePaths(): (req: Request, res: Response, next: () => void) => void {
  return (req: Request, res: Response, next: () => void) => {
    const url = new URL(req.url);
    if (url.pathname !== url.pathname.toLowerCase()) {
      url.pathname = url.pathname.toLowerCase();
      (res as any).status = 301;
      res.headers.set("Location", url.toString());
      (res as any).body = "";
      return;
    }
    next();
  };
}

export function httpsOnly(): (req: Request, res: Response, next: () => void) => void {
  return redirectToHTTPS();
}

export function wwwRedirect(): (req: Request, res: Response, next: () => void) => void {
  return redirectToWWW();
}

export function nonWWWRedirect(): (req: Request, res: Response, next: () => void) => void {
  return redirectToNonWWW();
}

export interface RateLimitStore {
  hit(key: string, windowMs: number): number;
  reset(key: string): void;
  get(key: string): { count: number; resetTime: number } | undefined;
}

export class MemoryStore implements RateLimitStore {
  private hits = new Map<string, { count: number; resetTime: number }>();

  hit(key: string, windowMs: number): number {
    const now = Date.now();
    const record = this.hits.get(key);
    if (!record || now > record.resetTime) {
      this.hits.set(key, { count: 1, resetTime: now + windowMs });
      return 1;
    }
    record.count++;
    return record.count;
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  get(key: string): { count: number; resetTime: number } | undefined {
    const record = this.hits.get(key);
    if (!record || Date.now() > record.resetTime) return undefined;
    return record;
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.hits) {
      if (now > record.resetTime) this.hits.delete(key);
    }
  }

  size(): number {
    return this.hits.size;
  }

  clear(): void {
    this.hits.clear();
  }
}

export function rateLimit(options: { windowMs?: number; max?: number; message?: string; statusCode?: number; keyGenerator?: (req: Request) => string; skip?: (req: Request) => boolean; store?: RateLimitStore } = {}): (req: Request, res: Response, next: () => void) => void {
  const { windowMs = 60000, max = 100, message = "Too many requests", statusCode = 429, keyGenerator = (req) => req.headers.get("x-forwarded-for") ?? "unknown", skip = () => false, store = new MemoryStore() } = options;

  return (req: Request, res: Response, next: () => void) => {
    if (skip(req)) {
      next();
      return;
    }
    const key = keyGenerator(req);
    const count = store.hit(key, windowMs);
    const record = store.get(key);
    const remaining = Math.max(0, max - count);
    const resetTime = record ? Math.ceil((record.resetTime - Date.now()) / 1000) : Math.ceil(windowMs / 1000);

    res.headers.set("X-RateLimit-Limit", String(max));
    res.headers.set("X-RateLimit-Remaining", String(remaining));
    res.headers.set("X-RateLimit-Reset", String(resetTime));

    if (count > max) {
      (res as any).status = statusCode;
      res.headers.set("content-type", "application/json");
      res.headers.set("Retry-After", String(resetTime));
      (res as any).body = JSON.stringify({ error: message, retryAfter: resetTime });
      return;
    }
    next();
  };
}

export function slowDown(options: { windowMs?: number; delayAfter?: number; delayMs?: number; maxDelayMs?: number; keyGenerator?: (req: Request) => string; skip?: (req: Request) => boolean; store?: RateLimitStore } = {}): (req: Request, res: Response, next: () => void) => void {
  const { windowMs = 60000, delayAfter = 50, delayMs = 500, maxDelayMs = 10000, keyGenerator = (req) => req.headers.get("x-forwarded-for") ?? "unknown", skip = () => false, store = new MemoryStore() } = options;

  return (req: Request, res: Response, next: () => void) => {
    if (skip(req)) {
      next();
      return;
    }
    const key = keyGenerator(req);
    const count = store.hit(key, windowMs);
    if (count > delayAfter) {
      const delay = Math.min((count - delayAfter) * delayMs, maxDelayMs);
      setTimeout(next, delay);
      return;
    }
    next();
  };
}

export function concurrencyLimit(max: number = 100): (req: Request, res: Response, next: () => void) => void {
  let current = 0;
  const queue: Array<() => void> = [];
  return (req: Request, res: Response, next: () => void) => {
    if (current >= max) {
      queue.push(next);
      const originalSet = res.headers.set.bind(res.headers);
      res.headers.set = (key: string, value: string) => {
        current--;
        if (queue.length > 0) {
          const nextInQueue = queue.shift()!;
          nextInQueue();
        }
        return originalSet(key, value);
      };
      return;
    }
    current++;
    const originalSet = res.headers.set.bind(res.headers);
    res.headers.set = (key: string, value: string) => {
      current--;
      if (queue.length > 0) {
        const nextInQueue = queue.shift()!;
        nextInQueue();
      }
      return originalSet(key, value);
    };
    next();
  };
}

export function ipFilter(allowlist: string[] = [], denylist: string[] = []): (req: Request, res: Response, next: () => void) => void {
  const allowSet = new Set(allowlist);
  const denySet = new Set(denylist);
  return (req: Request, res: Response, next: () => void) => {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
    if (denySet.has(ip)) {
      (res as any).status = 403;
      res.headers.set("content-type", "application/json");
      (res as any).body = JSON.stringify({ error: "Forbidden", message: "Your IP is blocked" });
      return;
    }
    if (allowSet.size > 0 && !allowSet.has(ip)) {
      (res as any).status = 403;
      res.headers.set("content-type", "application/json");
      (res as any).body = JSON.stringify({ error: "Forbidden", message: "Your IP is not allowed" });
      return;
    }
    next();
  };
}

export function userAgentFilter(blocked: string[] = []): (req: Request, res: Response, next: () => void) => void {
  const blockedSet = new Set(blocked);
  return (req: Request, res: Response, next: () => void) => {
    const ua = req.headers.get("user-agent") ?? "";
    for (const blockedUA of blockedSet) {
      if (ua.toLowerCase().includes(blockedUA.toLowerCase())) {
        (res as any).status = 403;
        res.headers.set("content-type", "application/json");
        (res as any).body = JSON.stringify({ error: "Forbidden", message: "User agent blocked" });
        return;
      }
    }
    next();
  };
}

export function refererFilter(allowed: string[] = []): (req: Request, res: Response, next: () => void) => void {
  return (req: Request, res: Response, next: () => void) => {
    if (req.method === "GET" || req.method === "HEAD") {
      next();
      return;
    }
    const referer = req.headers.get("referer") ?? "";
    if (!referer) {
      (res as any).status = 403;
      (res as any).body = JSON.stringify({ error: "Forbidden", message: "Referer required" });
      return;
    }
    if (allowed.length > 0 && !allowed.some((a) => referer.includes(a))) {
      (res as any).status = 403;
      (res as any).body = JSON.stringify({ error: "Forbidden", message: "Invalid referer" });
      return;
    }
    next();
  };
}

export function hostFilter(allowed: string[]): (req: Request, res: Response, next: () => void) => void {
  const allowSet = new Set(allowed);
  return (req: Request, res: Response, next: () => void) => {
    const host = req.headers.get("host") ?? "";
    if (!allowSet.has(host)) {
      (res as any).status = 403;
      (res as any).body = JSON.stringify({ error: "Forbidden", message: "Invalid host" });
      return;
    }
    next();
  };
}

export function protocolFilter(allowed: string[] = ["https"]): (req: Request, res: Response, next: () => void) => void {
  return (req: Request, res: Response, next: () => void) => {
    const protocol = new URL(req.url).protocol.slice(0, -1);
    if (!allowed.includes(protocol)) {
      (res as any).status = 403;
      (res as any).body = JSON.stringify({ error: "Forbidden", message: "Protocol not allowed" });
      return;
    }
    next();
  };
}

export function methodOverride(header: string = "x-http-method-override"): (req: Request, res: Response, next: () => void) => void {
  return (req: Request, res: Response, next: () => void) => {
    if (req.method === "POST") {
      const override = req.headers.get(header);
      if (override) {
        (req as unknown as { method: string }).method = override.toUpperCase();
      }
    }
    next();
  };
}

export function vhost(hostnames: Record<string, (req: Request, res: Response, next: () => void) => void>): (req: Request, res: Response, next: () => void) => void {
  return (req: Request, res: Response, next: () => void) => {
    const host = req.headers.get("host") ?? "";
    for (const [pattern, handler] of Object.entries(hostnames)) {
      if (host.match(pattern)) {
        handler(req, res, next);
        return;
      }
    }
    next();
  };
}

export function mount(path: string, handler: (req: Request, res: Response, next: () => void) => void): (req: Request, res: Response, next: () => void) => void {
  return (req: Request, res: Response, next: () => void) => {
    const url = new URL(req.url);
    if (url.pathname.startsWith(path)) {
      const originalUrl = req.url;
      url.pathname = url.pathname.slice(path.length) || "/";
      (req as unknown as { url: string }).url = url.toString();
      handler(req, res, () => {
        (req as unknown as { url: string }).url = originalUrl;
        next();
      });
      return;
    }
    next();
  };
}

export function queryParser(options: { allowDots?: boolean; arrayFormat?: "indices" | "brackets" | "repeat" | "comma" } = {}): (req: Request, res: Response, next: () => void) => void {
  return (req: Request, res: Response, next: () => void) => {
    const url = new URL(req.url);
    const query: Record<string, string | string[]> = {};
    url.searchParams.forEach((value, key) => {
      if (key in query) {
        const existing = query[key];
        if (Array.isArray(existing)) {
          existing.push(value);
        } else {
          query[key] = [existing, value];
        }
      } else {
        query[key] = value;
      }
    });
    (req as unknown as { query: Record<string, string | string[]> }).query = query;
    next();
  };
}

export function cookieParser(secret?: string): (req: Request, res: Response, next: () => void) => void {
  return (req: Request, res: Response, next: () => void) => {
    const cookieHeader = req.headers.get("cookie") ?? "";
    const cookies: Record<string, string> = {};
    cookieHeader.split(";").forEach((cookie) => {
      const [name, ...valueParts] = cookie.trim().split("=");
      if (name) {
        const value = decodeURIComponent(valueParts.join("="));
        cookies[name] = value;
      }
    });
    (req as unknown as { cookies: Record<string, string> }).cookies = cookies;
    next();
  };
}

export function cookieSerializer(name: string, value: string, options: { maxAge?: number; domain?: string; path?: string; secure?: boolean; httpOnly?: boolean; sameSite?: "strict" | "lax" | "none"; expires?: Date } = {}): string {
  const { maxAge, domain, path = "/", secure, httpOnly = true, sameSite = "lax", expires } = options;
  let cookie = `${name}=${encodeURIComponent(value)}`;
  if (expires) cookie += `; Expires=${expires.toUTCString()}`;
  if (maxAge !== undefined) cookie += `; Max-Age=${maxAge}`;
  if (domain) cookie += `; Domain=${domain}`;
  if (path) cookie += `; Path=${path}`;
  if (secure) cookie += "; Secure";
  if (httpOnly) cookie += "; HttpOnly";
  if (sameSite) cookie += `; SameSite=${sameSite}`;
  return cookie;
}

export function signedCookie(value: string, secret: string): string {
  const crypto = globalThis.crypto;
  if (!crypto) return value;
  const key = `${value}.${secret}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash) + key.charCodeAt(i);
    hash = hash & hash;
  }
  return `s:${value}.${Math.abs(hash).toString(16)}`;
}

export function verifySignedCookie(signed: string, secret: string): string | false {
  if (!signed.startsWith("s:")) return false;
  const dotIndex = signed.lastIndexOf(".");
  if (dotIndex === -1) return false;
  const value = signed.slice(2, dotIndex);
  const expected = signedCookie(value, secret);
  if (expected === signed) return value;
  return false;
}

export function clearCookie(name: string, options: { path?: string; domain?: string } = {}): string {
  return cookieSerializer(name, "", { ...options, expires: new Date(0), maxAge: 0 });
}

export function sessionMiddleware(options: { name?: string; secret?: string; resave?: boolean; saveUninitialized?: boolean; cookie?: { maxAge?: number; secure?: boolean; httpOnly?: boolean; sameSite?: "strict" | "lax" | "none" }; store?: Map<string, Record<string, unknown>> } = {}): (req: Request, res: Response, next: () => void) => void {
  const { name = "tw.sid", secret = process.env.TW_SESSION_SECRET ?? (console.warn("[TW] TW_SESSION_SECRET not set -- using insecure default. Set it in production!"), "tw-dev-only-insecure-secret"), resave = false, saveUninitialized = false, cookie: cookieOpts = { maxAge: 86400000, httpOnly: true, sameSite: "lax" }, store = new Map() } = options;
  return (req: Request, res: Response, next: () => void) => {
    const cookieHeader = req.headers.get("cookie") ?? "";
    const sessionId = parseSessionId(cookieHeader, name);
    let session: Record<string, unknown> = {};
    if (sessionId && store.has(sessionId)) {
      session = store.get(sessionId)!;
    } else {
      const newSessionId = generateSessionId();
      (req as unknown as { sessionId: string }).sessionId = newSessionId;
      if (saveUninitialized) {
        store.set(newSessionId, session);
      }
    }
    (req as unknown as { session: Record<string, unknown> }).session = session;
    const originalSet = res.headers.set.bind(res.headers);
    res.headers.set = (key: string, value: string) => {
      if (key === "set-cookie" || key === "Set-Cookie") {
        if (resave || Object.keys(session).length > 0) {
          const sid = (req as unknown as { sessionId: string }).sessionId ?? generateSessionId();
          store.set(sid, session);
          let cookie = cookieSerializer(name, sid, cookieOpts);
          return originalSet("set-cookie", cookie);
        }
      }
      return originalSet(key, value);
    };
    next();
  };
}

function parseSessionId(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

function generateSessionId(): string {
  return `sid_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function csrfProtection(options: { tokenLength?: number; cookieName?: string; headerName?: string } = {}): (req: Request, res: Response, next: () => void) => void {
  const { tokenLength = 32, cookieName = "tw.csrf", headerName = "x-csrf-token" } = options;
  const tokens = new Set<string>();
  return (req: Request, res: Response, next: () => void) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      let token = generateCSRFToken(tokenLength);
      tokens.add(token);
      res.headers.set("set-cookie", cookieSerializer(cookieName, token, { httpOnly: true, sameSite: "strict" }));
      (req as unknown as { csrfToken: string }).csrfToken = token;
      next();
      return;
    }
    const cookieHeader = req.headers.get("cookie") ?? "";
    const cookieToken = parseSessionId(cookieHeader, cookieName);
    const headerToken = req.headers.get(headerName);
    if (!cookieToken || !headerToken || cookieToken !== headerToken || !tokens.has(cookieToken)) {
      (res as any).status = 403;
      res.headers.set("content-type", "application/json");
      (res as any).body = JSON.stringify({ error: "CSRF token mismatch" });
      return;
    }
    next();
  };
}

function generateCSRFToken(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let token = "";
  for (let i = 0; i < length; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

export function cspMiddleware(options: { reportOnly?: boolean; reportUri?: string; directives?: Record<string, string[]> } = {}): (req: Request, res: Response, next: () => void) => void {
  const { reportOnly = false, reportUri, directives = {} } = options;
  return (req: Request, res: Response, next: () => void) => {
    const defaultDirectives: Record<string, string[]> = {
      "default-src": ["'self'"],
      "script-src": ["'self'", "'unsafe-inline'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:", "https:"],
      "font-src": ["'self'", "https:"],
      "connect-src": ["'self'"],
      "frame-src": ["'none'"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "form-action": ["'self'"],
    };
    const merged = { ...defaultDirectives, ...directives };
    const cspString = Object.entries(merged).map(([directive, sources]) => `${directive} ${sources.join(" ")}`).join("; ");
    if (reportUri) {
      merged["report-uri"] = [reportUri];
    }
    const headerName = reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
    res.headers.set(headerName, cspString);
    next();
  };
}

export function hstsMiddleware(options: { maxAge?: number; includeSubDomains?: boolean; preload?: boolean } = {}): (req: Request, res: Response, next: () => void) => void {
  const { maxAge = 31536000, includeSubDomains = true, preload = false } = options;
  return (req: Request, res: Response, next: () => void) => {
    let header = `max-age=${maxAge}`;
    if (includeSubDomains) header += "; includeSubDomains";
    if (preload) header += "; preload";
    res.headers.set("Strict-Transport-Security", header);
    next();
  };
}

export function securityHeadersMiddleware(): (req: Request, res: Response, next: () => void) => void {
  return (req: Request, res: Response, next: () => void) => {
    res.headers.set("X-Content-Type-Options", "nosniff");
    res.headers.set("X-Frame-Options", "SAMEORIGIN");
    res.headers.set("X-XSS-Protection", "1; mode=block");
    res.headers.set("X-Permitted-Cross-Domain-Policies", "none");
    res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
    res.headers.set("Cross-Origin-Embedder-Policy", "require-corp");
    res.headers.set("Cross-Origin-Resource-Policy", "same-origin");
    res.headers.delete("X-Powered-By");
    next();
  };
}

export function combinedSecurityMiddleware(options: { cors?: Record<string, unknown>; csp?: Record<string, unknown>; hsts?: Record<string, unknown>; rateLimit?: Record<string, unknown> } = {}): (req: Request, res: Response, next: () => void) => void {
  const middlewares = [
    securityHeadersMiddleware(),
    hstsMiddleware(options.hsts ?? {}),
    cspMiddleware(options.csp ?? {}),
  ];
  return (req: Request, res: Response, next: () => void) => {
    let i = 0;
    const runNext = () => {
      if (i >= middlewares.length) {
        next();
        return;
      }
      const middleware = middlewares[i++];
      middleware(req, res, runNext);
    };
    runNext();
  };
}
