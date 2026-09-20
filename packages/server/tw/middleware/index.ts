/** Middleware system -- composable request processing pipeline. */

import type { RouteContext } from "../router";

function safeJsonParse(json, fallback) {
  try { return JSON.parse(json); }
  catch { return fallback; }
}

export type Middleware = (ctx: RouteContext, next: () => Promise<void>) => Promise<void> | void;

export class MiddlewarePipeline {
  private middlewares: { name: string; fn: Middleware }[] = [];

  use(name: string, fn: Middleware): void {
    this.middlewares.push({ name, fn });
  }

  useFn(fn: Middleware): void {
    this.middlewares.push({ name: `mw-${this.middlewares.length}`, fn });
  }

  async run(ctx: RouteContext, finalHandler: () => Promise<Response | void>): Promise<Response | void> {
    let i = 0;
    const stack = this.middlewares;

    const next = async (): Promise<void> => {
      if (i >= stack.length) {
        await finalHandler();
        return;
      }
      const mw = stack[i++];
      await mw.fn(ctx, next);
    };

    await next();
    return (ctx as any).response ?? undefined;
  }

  size(): number {
    return this.middlewares.length;
  }

  list(): string[] {
    return this.middlewares.map((m) => m.name);
  }
}

// Built-in middleware factories

export function corsMiddleware(opts: {
  origin?: string | string[] | ((origin: string) => string | null);
  methods?: string[];
  headers?: string[];
  credentials?: boolean;
  maxAge?: number;
}): Middleware {
  const origin = opts.origin ?? "*";
  const methods = (opts.methods ?? ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]).join(", ");
  const headers = (opts.headers ?? ["Content-Type", "Authorization", "X-Requested-With"]).join(", ");
  const credentials = opts.credentials ?? false;
  const maxAge = opts.maxAge ?? 86400;

  return async (ctx, next) => {
    const requestOrigin = ctx.headers["origin"] || "";
    let allowedOrigin = "*";

    if (typeof origin === "function") {
      allowedOrigin = origin(requestOrigin) ?? "*";
    } else if (Array.isArray(origin)) {
      allowedOrigin = origin.includes(requestOrigin) ? requestOrigin : "*";
    } else {
      allowedOrigin = origin;
    }

    ctx.headers["access-control-allow-origin"] = allowedOrigin;
    ctx.headers["access-control-allow-methods"] = methods;
    ctx.headers["access-control-allow-headers"] = headers;
    if (credentials) {
      ctx.headers["access-control-allow-credentials"] = "true";
    }
    ctx.headers["access-control-max-age"] = String(maxAge);

    if (ctx.method === "OPTIONS") {
      return;
    }

    await next();
  };
}

export function loggingMiddleware(opts?: { logBody?: boolean }): Middleware {
  return async (ctx, next) => {
    const start = performance.now();
    await next();
    const elapsed = (performance.now() - start).toFixed(2);
    const method = ctx.method.padEnd(6);
    const path = ctx.url.pathname;
    console.debug(`  ${method} ${path} (${elapsed}ms)`);
  };
}

export function rateLimitMiddleware(opts: {
  windowMs: number;
  max: number;
  keyFn?: (ctx: RouteContext) => string;
}): Middleware {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const keyFn = opts.keyFn ?? ((ctx) => ctx.headers["x-forwarded-for"] || ctx.request.headers.get("x-real-ip") || "unknown");

  return async (ctx, next) => {
    const key = keyFn(ctx);
    const now = Date.now();
    let entry = hits.get(key);

    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + opts.windowMs };
      hits.set(key, entry);
    }

    entry.count++;

    if (entry.count > opts.max) {
      // Answer 429 directly -- a bare `return` without a response leaves the
      // client with an empty/hung request.
      (ctx as any).response = new Response(
        JSON.stringify({ ok: false, error: "Too Many Requests" }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(Math.ceil((entry.resetAt - now) / 1000)),
          },
        },
      );
      return;
    }

    ctx.headers["x-ratelimit-limit"] = String(opts.max);
    ctx.headers["x-ratelimit-remaining"] = String(Math.max(0, opts.max - entry.count));
    ctx.headers["x-ratelimit-reset"] = String(entry.resetAt);

    await next();
  };
}

export function compressionMiddleware(): Middleware {
  return async (ctx, next) => {
    await next();
    // Compression is handled at the response layer (the static handler and
    // the server's response path gzip compressible bodies). Setting a
    // `content-encoding` header HERE without compressing the body would tell
    // the browser to decompress plain bytes and corrupt the response -- so
    // this middleware deliberately does not touch encoding headers.
  };
}

export function securityHeadersMiddleware(): Middleware {
  return async (ctx, next) => {
    ctx.headers["x-content-type-options"] = "nosniff";
    ctx.headers["x-frame-options"] = "DENY";
    ctx.headers["x-xss-protection"] = "1; mode=block";
    ctx.headers["referrer-policy"] = "strict-origin-when-cross-origin";
    ctx.headers["permissions-policy"] = "camera=(), microphone=(), geolocation=()";
    await next();
  };
}

export function bodyParserMiddleware(opts?: { limit?: number }): Middleware {
  const limit = opts?.limit ?? 1024 * 1024; // 1MB default

  return async (ctx, next) => {
    const contentType = ctx.headers["content-type"] || "";

    if (ctx.method === "GET" || ctx.method === "HEAD") {
      await next();
      return;
    }

    try {
      const contentLength = parseInt(ctx.headers["content-length"] || "0", 10);
      if (contentLength > limit) {
        // Answer 413 directly -- a bare `return` would silently drop the
        // request (no status, no next()).
        (ctx as any).response = new Response(
          JSON.stringify({ ok: false, error: "Payload too large" }),
          { status: 413, headers: { "Content-Type": "application/json" } },
        );
        return;
      }

      if (contentType.includes("application/json")) {
        const text = await ctx.request.text();
        ctx.body = JSON.parse(text);
      } else if (contentType.includes("application/x-www-form-urlencoded")) {
        const text = await ctx.request.text();
        const params = new URLSearchParams(text);
        ctx.body = Object.fromEntries(params);
      } else if (contentType.includes("multipart/form-data")) {
        const formData = await ctx.request.formData();
        ctx.body = Object.fromEntries(formData.entries());
      } else {
        ctx.body = await ctx.request.text();
      }
    } catch {
      ctx.body = null;
    }

    await next();
  };
}

export { BodyParser, MemoryStore, acceptFilter, anyBody, bodyParse, cacheHeaders, clearCookie, combinedSecurityMiddleware, concurrencyLimit, conditionalGet, contentTypeFilter, cookieParser, cookieSerializer, cspMiddleware, csrfProtection, errorBoundary, favicon, healthCheck, hostFilter, hstsMiddleware, httpsOnly, ipFilter, jsonBody, limitBodySize, lowerCasePaths, methodFilter, methodOverride, mount, multipartBody, noCache, nonWWWRedirect, notFound, poweredBy, protocolFilter, queryParser, rangeRequest, rateLimit, rawBody, redirectToHTTPS, redirectToNonWWW, redirectToWWW, refererFilter, removeHeader, sanitizeBody, sessionMiddleware, setHeaders, signedCookie, slowDown, textBody, timeoutMiddleware, trailingSlash, urlEncodedBody, userAgentFilter, validateBody, verifySignedCookie, vhost, wwwRedirect } from "./body-parser";
export type { BodyParserOptions, ParsedBody, RateLimitStore } from "./body-parser";
