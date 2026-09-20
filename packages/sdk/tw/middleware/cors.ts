/**
 * CORS (Cross-Origin Resource Sharing) middleware.
 * @module sdk/middleware
 */

export interface CORSOptions {
  origin?: string | string[] | ((origin: string) => string | false);
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
  optionsSuccessStatus?: number;
  preflightContinue?: boolean;
}

const DEFAULT_OPTIONS: Required<Omit<CORSOptions, "origin" | "methods" | "allowedHeaders" | "exposedHeaders" | "credentials" | "maxAge" | "optionsSuccessStatus" | "preflightContinue">> = {};

export function cors(options: CORSOptions = {}): (req: Request, res: Response, next: () => void) => void {
  const {
    origin = "*",
    methods = ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
    allowedHeaders = ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders = [],
    credentials = false,
    maxAge = 86400,
    optionsSuccessStatus = 204,
    preflightContinue = false,
  } = options;

  return (req: Request, res: Response, next: () => void) => {
    const requestOrigin = req.headers.get("origin") ?? "";
    let allowedOrigin: string | false = false;

    if (origin === "*") {
      allowedOrigin = credentials ? requestOrigin || "*" : "*";
    } else if (typeof origin === "function") {
      allowedOrigin = origin(requestOrigin);
    } else if (Array.isArray(origin)) {
      if (origin.includes(requestOrigin)) {
        allowedOrigin = requestOrigin;
      }
    } else if (origin === requestOrigin) {
      allowedOrigin = requestOrigin;
    }

    if (allowedOrigin) {
      res.headers.set("Access-Control-Allow-Origin", allowedOrigin);
      if (credentials) {
        res.headers.set("Access-Control-Allow-Credentials", "true");
      }
      if (exposedHeaders.length > 0) {
        res.headers.set("Access-Control-Expose-Headers", exposedHeaders.join(", "));
      }
    }

    if (req.method === "OPTIONS") {
      if (methods.length > 0) {
        res.headers.set("Access-Control-Allow-Methods", methods.join(", "));
      }
      if (allowedHeaders.length > 0) {
        const requestHeaders = req.headers.get("access-control-request-headers");
        if (requestHeaders && allowedHeaders.includes("*")) {
          res.headers.set("Access-Control-Allow-Headers", requestHeaders);
        } else {
          res.headers.set("Access-Control-Allow-Headers", allowedHeaders.join(", "));
        }
      }
      if (maxAge > 0) {
        res.headers.set("Access-Control-Max-Age", String(maxAge));
      }
      if (!preflightContinue) {
        (res as any).status = optionsSuccessStatus;
        res.headers.set("Content-Length", "0");
        return;
      }
    }

    next();
  };
}

export function strictCORS(origin: string): (req: Request, res: Response, next: () => void) => void {
  return cors({
    origin,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
    credentials: true,
    maxAge: 3600,
  });
}

export function permissiveCORS(): (req: Request, res: Response, next: () => void) => void {
  return cors({
    origin: "*",
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["*"],
    exposedHeaders: ["*"],
    credentials: false,
    maxAge: 86400,
  });
}

export function sameOriginCORS(): (req: Request, res: Response, next: () => void) => void {
  return cors({
    origin: (requestOrigin: string) => {
      if (!requestOrigin) return false;
      try {
        const url = new URL(requestOrigin);
        return url.origin === requestOrigin ? requestOrigin : false;
      } catch {
        return false;
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 3600,
  });
}

export function whitelistCORS(origins: string[]): (req: Request, res: Response, next: () => void) => void {
  const originSet = new Set(origins);
  return cors({
    origin: (requestOrigin: string) => originSet.has(requestOrigin) ? requestOrigin : false,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["X-Total-Count", "X-Page-Count"],
    maxAge: 3600,
  });
}

export function regexCORS(pattern: RegExp): (req: Request, res: Response, next: () => void) => void {
  return cors({
    origin: (requestOrigin: string) => pattern.test(requestOrigin) ? requestOrigin : false,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 3600,
  });
}

export function subdomainCORS(baseDomain: string): (req: Request, res: Response, next: () => void) => void {
  const pattern = new RegExp(`^https?:\/\/([a-z0-9-]+\.)*${baseDomain.replace(".", "\\.")}$`, "i");
  return regexCORS(pattern);
}

export function environmentCORS(devOrigins: string[], prodOrigin: string, isDev: boolean): (req: Request, res: Response, next: () => void) => void {
  if (isDev) {
    return whitelistCORS(devOrigins);
  }
  return strictCORS(prodOrigin);
}

export function handlePreflight(req: Request, res: Response, options: CORSOptions): boolean {
  if (req.method !== "OPTIONS") return false;
  const middleware = cors(options);
  middleware(req, res, () => {});
  return true;
}

export function validateOrigin(origin: string, allowed: string | string[] | ((origin: string) => string | false)): string | false {
  if (typeof allowed === "string") {
    return allowed === "*" || allowed === origin ? (allowed === "*" ? "*" : origin) : false;
  }
  if (Array.isArray(allowed)) {
    return allowed.includes(origin) ? origin : false;
  }
  return allowed(origin);
}

export function getCORSHeaders(origin: string, options: CORSOptions): Record<string, string> {
  const headers: Record<string, string> = {};
  const allowed = validateOrigin(origin, options.origin ?? "*");
  if (allowed) {
    headers["Access-Control-Allow-Origin"] = allowed;
    if (options.credentials) {
      headers["Access-Control-Allow-Credentials"] = "true";
    }
    if (options.exposedHeaders && options.exposedHeaders.length > 0) {
      headers["Access-Control-Expose-Headers"] = options.exposedHeaders.join(", ");
    }
    if (options.methods && options.methods.length > 0) {
      headers["Access-Control-Allow-Methods"] = options.methods.join(", ");
    }
    if (options.allowedHeaders && options.allowedHeaders.length > 0) {
      headers["Access-Control-Allow-Headers"] = options.allowedHeaders.join(", ");
    }
    if (options.maxAge !== undefined) {
      headers["Access-Control-Max-Age"] = String(options.maxAge);
    }
  }
  return headers;
}

export function applyCORSHeaders(res: Response, headers: Record<string, string>): void {
  for (const [key, value] of Object.entries(headers)) {
    res.headers.set(key, value);
  }
}

export class CORSHandler {
  private options: CORSOptions;

  constructor(options: CORSOptions = {}) {
    this.options = options;
  }

  handle(req: Request, res: Response, next: () => void): void {
    const middleware = cors(this.options);
    middleware(req, res, next);
  }

  preflight(req: Request, res: Response): boolean {
    return handlePreflight(req, res, this.options);
  }

  getHeaders(origin: string): Record<string, string> {
    return getCORSHeaders(origin, this.options);
  }

  setOrigin(origin: string | string[] | ((origin: string) => string | false)): void {
    this.options.origin = origin;
  }

  setMethods(methods: string[]): void {
    this.options.methods = methods;
  }

  setHeaders(headers: string[]): void {
    this.options.allowedHeaders = headers;
  }

  setCredentials(enabled: boolean): void {
    this.options.credentials = enabled;
  }

  setMaxAge(seconds: number): void {
    this.options.maxAge = seconds;
  }
}
