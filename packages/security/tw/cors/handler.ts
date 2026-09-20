/**
 * CORS Handler -- Cross-Origin Resource Sharing configuration and
 * preflight request handling.
 *
 * Supports: per-origin allowlists, wildcard origins (configurable),
 * credentials, preflight caching, header exposure, and custom
 * origin validators.
 *
 * @module security/cors/handler
 */

/** CORS configuration. */
export interface CORSConfig {
  /** Allowed origins -- array of strings, or "*" for all. */
  origins: string[] | "*";
  /** Allowed HTTP methods. */
  methods?: string[];
  /** Allowed headers. */
  allowedHeaders?: string[];
  /** Headers exposed to the client. */
  exposedHeaders?: string[];
  /** Whether to allow credentials (cookies, auth headers). */
  credentials?: boolean;
  /** Max age for preflight cache (seconds). */
  maxAge?: number;
  /** Custom origin validator function. */
  validateOrigin?: (origin: string) => boolean;
  /** Whether to handle OPTIONS preflight automatically. */
  handlePreflight?: boolean;
}

/** Default CORS configuration values. */
const DEFAULT_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const DEFAULT_HEADERS = [
  "Content-Type", "Authorization", "X-Requested-With",
  "X-CSRF-Token", "X-API-Key", "Accept",
];
const DEFAULT_MAX_AGE = 86400; // 24 hours

/** Result of CORS handling. */
export interface CORSResult {
  headers: Record<string, string>;
  handled: boolean;
  isPreflight: boolean;
}

/**
 * CORS Handler -- processes requests and adds appropriate CORS headers.
 */
export class CORSHandler {
  private config: CORSConfig;
  private originSet: Set<string> | null;
  private isWildcard: boolean;

  constructor(config: CORSConfig) {
    this.config = {
      methods: DEFAULT_METHODS,
      allowedHeaders: DEFAULT_HEADERS,
      credentials: false,
      maxAge: DEFAULT_MAX_AGE,
      handlePreflight: true,
      ...config,
    };
    this.isWildcard = config.origins === "*";
    this.originSet = Array.isArray(config.origins) ? new Set(config.origins) : null;
  }

  /**
   * Checks if an origin is allowed.
   */
  private isOriginAllowed(origin: string): boolean {
    if (this.isWildcard) return true;
    if (!this.originSet) return false;

    // Exact match
    if (this.originSet.has(origin)) return true;

    // Wildcard subdomain match (e.g., *.example.com)
    for (const allowed of this.originSet) {
      if (allowed.startsWith("*.")) {
        const domain = allowed.slice(1); // .example.com
        if (origin.endsWith(domain)) {
          const prefix = origin.slice(0, origin.length - domain.length);
          if (prefix.length > 0 && prefix.includes(".")) {
            continue; // Only match one level deep
          }
          return true;
        }
      }
    }

    // Custom validator
    if (this.config.validateOrigin) {
      return this.config.validateOrigin(origin);
    }

    return false;
  }

  /**
   * Processes a request and returns CORS headers.
   * If it's a preflight OPTIONS request, returns a preflight response.
   */
  handle(req: Request): CORSResult {
    const origin = req.headers.get("origin") ?? "";
    const method = req.method.toUpperCase();

    const headers: Record<string, string> = {};

    // Handle Origin
    if (origin) {
      if (this.isOriginAllowed(origin)) {
        if (this.isWildcard && !this.config.credentials) {
          headers["Access-Control-Allow-Origin"] = "*";
        } else {
          headers["Access-Control-Allow-Origin"] = origin;
          headers["Vary"] = "Origin";
        }

        if (this.config.credentials) {
          headers["Access-Control-Allow-Credentials"] = "true";
        }
      } else {
        return { headers: {}, handled: false, isPreflight: false };
      }
    }

    // Handle preflight OPTIONS
    const isPreflight = method === "OPTIONS" &&
      req.headers.get("access-control-request-method") !== null;

    if (isPreflight && this.config.handlePreflight) {
      const reqMethod = req.headers.get("access-control-request-method");
      const reqHeaders = req.headers.get("access-control-request-headers");

      if (reqMethod && (this.config.methods ?? []).includes(reqMethod.toUpperCase())) {
        headers["Access-Control-Allow-Methods"] = (this.config.methods ?? DEFAULT_METHODS).join(", ");
      }

      if (reqHeaders) {
        const requestedHeaders = reqHeaders.split(",").map(h => h.trim());
        const allowedHeaders = this.config.allowedHeaders ?? DEFAULT_HEADERS;
        const allAllowed = requestedHeaders.every(h =>
          allowedHeaders.some(ah => ah.toLowerCase() === h.toLowerCase())
        );
        if (allAllowed) {
          headers["Access-Control-Allow-Headers"] = reqHeaders;
        } else {
          headers["Access-Control-Allow-Headers"] = allowedHeaders.join(", ");
        }
      } else {
        headers["Access-Control-Allow-Headers"] = (this.config.allowedHeaders ?? DEFAULT_HEADERS).join(", ");
      }

      headers["Access-Control-Max-Age"] = String(this.config.maxAge ?? DEFAULT_MAX_AGE);

      return { headers, handled: true, isPreflight: true };
    }

    // Expose headers for actual responses
    if (this.config.exposedHeaders && this.config.exposedHeaders.length > 0) {
      headers["Access-Control-Expose-Headers"] = this.config.exposedHeaders.join(", ");
    }

    return { headers, handled: false, isPreflight: false };
  }

  /**
   * Creates a Bun.serve-compatible middleware.
   * Usage: `Bun.serve({ fetch: cors.middleware(handler) })`
   */
  middleware(handler: (req: Request) => Response | Promise<Response>) {
    return (req: Request): Response | Promise<Response> => {
      const result = this.handle(req);

      if (result.isPreflight && result.handled) {
        return new Response(null, {
          status: 204,
          headers: result.headers,
        });
      }

      return Promise.resolve(handler(req)).then(res => {
        const newHeaders = new Headers(res.headers);
        for (const [key, value] of Object.entries(result.headers)) {
          newHeaders.set(key, value);
        }
        return new Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers: newHeaders,
        });
      });
    };
  }

  /** Updates the allowed origins at runtime. */
  setOrigins(origins: string[] | "*"): void {
    this.config.origins = origins;
    this.isWildcard = origins === "*";
    this.originSet = Array.isArray(origins) ? new Set(origins) : null;
  }

  /** Adds an origin to the allowlist. */
  addOrigin(origin: string): void {
    if (this.isWildcard) return;
    if (!this.originSet) this.originSet = new Set();
    this.originSet.add(origin);
    this.config.origins = Array.from(this.originSet);
  }

  /** Removes an origin from the allowlist. */
  removeOrigin(origin: string): void {
    if (this.originSet) {
      this.originSet.delete(origin);
      this.config.origins = Array.from(this.originSet);
    }
  }
}

/** Creates a new CORS handler. */
export function createCORSHandler(config: CORSConfig): CORSHandler {
  return new CORSHandler(config);
}

/** Creates a permissive CORS handler (all origins). */
export function permissiveCORS(): CORSHandler {
  return new CORSHandler({
    origins: "*",
    methods: DEFAULT_METHODS,
    allowedHeaders: DEFAULT_HEADERS,
    credentials: false,
  });
}

/** Creates a strict CORS handler (same-origin only). */
export function strictCORS(allowedOrigins: string[]): CORSHandler {
  return new CORSHandler({
    origins: allowedOrigins,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 3600,
  });
}
