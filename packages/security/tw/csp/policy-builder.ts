/**
 * CSP Policy Builder -- constructs Content-Security-Policy headers
 * with fine-grained directive control, per-route overrides, and
 * report-only mode support.
 *
 * @module security/csp/policy-builder
 */

/** A single CSP source value -- either a keyword, scheme, host, or nonce/hash. */
export type CSPSource = string;

/** All CSP level-3 directives supported by the builder. */
export interface CSPDirectives {
  "default-src"?: CSPSource[];
  "script-src"?: CSPSource[];
  "script-src-elem"?: CSPSource[];
  "script-src-attr"?: CSPSource[];
  "style-src"?: CSPSource[];
  "style-src-elem"?: CSPSource[];
  "style-src-attr"?: CSPSource[];
  "img-src"?: CSPSource[];
  "font-src"?: CSPSource[];
  "connect-src"?: CSPSource[];
  "media-src"?: CSPSource[];
  "object-src"?: CSPSource[];
  "frame-src"?: CSPSource[];
  "child-src"?: CSPSource[];
  "worker-src"?: CSPSource[];
  "manifest-src"?: CSPSource[];
  "prefetch-src"?: CSPSource[];
  "form-action"?: CSPSource[];
  "frame-ancestors"?: CSPSource[];
  "navigate-to"?: CSPSource[];
  "base-uri"?: CSPSource[];
  "plugin-types"?: string[];
  "require-sri-for"?: string[];
  "sandbox"?: string[];
  "report-uri"?: string[];
  "report-to"?: string;
  "upgrade-insecure-requests"?: boolean;
  "block-all-mixed-content"?: boolean;
}

/** Result of building a CSP policy. */
export interface CSPBuildResult {
  header: string;
  reportOnlyHeader: string | null;
  directives: CSPDirectives;
  warnings: string[];
}

/** Per-route override map -- route path -> directive patch. */
export type CSPRouteOverrides = Map<string, Partial<CSPDirectives>>;

/** Options passed to the policy builder. */
export interface CSPOptions {
  directives?: CSPDirectives;
  reportOnly?: boolean;
  reportUri?: string;
  reportTo?: string;
  nonce?: string;
  routeOverrides?: CSPRouteOverrides;
  strict?: boolean;
}

const KEYWORDS = new Set([
  "'self'", "'none'", "'unsafe-inline'", "'unsafe-eval'",
  "'strict-dynamic'", "'unsafe-hashes'", "'wasm-unsafe-eval'",
]);

/** Escapes a source value for safe inclusion in a CSP header. */
function escapeSource(src: string): string {
  const trimmed = src.trim();
  // Keywords are wrapped in single quotes -- don't re-escape
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed;
  }
  // Schemes like data:, blob:, https:
  if (trimmed.endsWith(":")) {
    return trimmed;
  }
  // Nonces and hashes already have the right format
  if (trimmed.startsWith("'nonce-") || trimmed.startsWith("'sha")) {
    return trimmed;
  }
  // Wildcard hosts (*.example.com) and plain hosts
  return trimmed;
}

/** Validates a source list for conflicting or dangerous entries. */
function validateSources(directive: string, sources: CSPSource[]): string[] {
  const warnings: string[] = [];
  if (sources.includes("'unsafe-inline'") && sources.includes("'unsafe-eval'")) {
    warnings.push(`${directive}: both 'unsafe-inline' and 'unsafe-eval' present -- high XSS risk`);
  }
  if (directive === "object-src" && sources.length > 0 && !sources.includes("'none'")) {
    warnings.push("object-src should be 'none' to prevent Flash/plugin attacks");
  }
  if (sources.some(s => s === "*") || sources.some(s => s === "http:")) {
    warnings.push(`${directive}: wildcard or http: source -- allows any origin`);
  }
  if (sources.some(s => s.startsWith("http://"))) {
    warnings.push(`${directive}: insecure http:// source detected -- use https:// or upgrade-insecure-requests`);
  }
  return warnings;
}

/** Builds a single directive string from its name and source list. */
function buildDirective(name: string, sources: CSPSource[]): string {
  const escaped = sources.map(escapeSource);
  return `${name} ${escaped.join(" ")}`;
}

/** Deep-merges two directive objects (patch over base). */
function mergeDirectives(base: CSPDirectives, patch: Partial<CSPDirectives>): CSPDirectives {
  const result: CSPDirectives = { ...base };
  for (const key of Object.keys(patch) as (keyof CSPDirectives)[]) {
    const patchVal = patch[key];
    if (patchVal === undefined) continue;
    if (Array.isArray(patchVal)) {
      const baseVal = base[key];
      if (Array.isArray(baseVal)) {
        // Merge unique sources
        const merged = [...new Set([...baseVal, ...patchVal])];
        (result as Record<string, unknown>)[key] = merged;
      } else {
        (result as Record<string, unknown>)[key] = patchVal;
      }
    } else if (typeof patchVal === "boolean") {
      (result as Record<string, unknown>)[key] = patchVal;
    } else if (typeof patchVal === "string") {
      (result as Record<string, unknown>)[key] = patchVal;
    }
  }
  return result;
}

/** The main CSP policy builder class. */
export class CSPPolicyBuilder {
  private directives: CSPDirectives;
  private reportOnly: boolean;
  private reportUri: string | null;
  private reportTo: string | null;
  private nonce: string | null;
  private routeOverrides: CSPRouteOverrides;
  private strict: boolean;

  constructor(options: CSPOptions = {}) {
    this.directives = options.directives ?? this.getDefaultDirectives();
    this.reportOnly = options.reportOnly ?? false;
    this.reportUri = options.reportUri ?? null;
    this.reportTo = options.reportTo ?? null;
    this.nonce = options.nonce ?? null;
    this.routeOverrides = options.routeOverrides ?? new Map();
    this.strict = options.strict ?? false;
  }

  /** Returns a secure default directive set. */
  private getDefaultDirectives(): CSPDirectives {
    return {
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:", "blob:", "https:"],
      "font-src": ["'self'", "data:"],
      "connect-src": ["'self'"],
      "media-src": ["'self'"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "frame-ancestors": ["'none'"],
      "form-action": ["'self'"],
      "upgrade-insecure-requests": true,
    };
  }

  /** Adds a source to a specific directive. */
  addSource(directive: keyof CSPDirectives, source: CSPSource): this {
    const current = this.directives[directive];
    if (Array.isArray(current)) {
      if (!current.includes(source)) {
        current.push(source);
      }
    } else {
      (this.directives as Record<string, unknown>)[directive] = [source];
    }
    return this;
  }

  /** Removes a source from a specific directive. */
  removeSource(directive: keyof CSPDirectives, source: CSPSource): this {
    const current = this.directives[directive];
    if (Array.isArray(current)) {
      const filtered = current.filter(s => s !== source);
      (this.directives as Record<string, unknown>)[directive] = filtered;
    }
    return this;
  }

  /** Sets an entire directive source list. */
  setDirective(directive: keyof CSPDirectives, sources: CSPSource[]): this {
    (this.directives as Record<string, unknown>)[directive] = sources;
    return this;
  }

  /** Adds a route-specific override. */
  addRouteOverride(route: string, patch: Partial<CSPDirectives>): this {
    this.routeOverrides.set(route, patch);
    return this;
  }

  /** Sets the nonce for script-src and style-src. */
  setNonce(nonce: string): this {
    this.nonce = nonce;
    return this;
  }

  /** Enables or disables report-only mode. */
  setReportOnly(enabled: boolean): this {
    this.reportOnly = enabled;
    return this;
  }

  /** Builds the CSP header string from current directives. */
  build(route?: string): CSPBuildResult {
    let directives = this.directives;

    // Apply route overrides if a route is specified
    if (route && this.routeOverrides.has(route)) {
      const patch = this.routeOverrides.get(route)!;
      directives = mergeDirectives(directives, patch);
    }

    // Apply nonce if set
    if (this.nonce) {
      const nonceSource = `'nonce-${this.nonce}'`;
      const scriptSrc = directives["script-src"];
      if (Array.isArray(scriptSrc) && !scriptSrc.includes(nonceSource)) {
        scriptSrc.push(nonceSource);
      }
      const styleSrc = directives["style-src"];
      if (Array.isArray(styleSrc) && !styleSrc.includes(nonceSource)) {
        styleSrc.push(nonceSource);
      }
    }

    // Build header string
    const parts: string[] = [];
    const warnings: string[] = [];

    const directiveOrder: (keyof CSPDirectives)[] = [
      "default-src", "script-src", "script-src-elem", "script-src-attr",
      "style-src", "style-src-elem", "style-src-attr",
      "img-src", "font-src", "connect-src", "media-src",
      "object-src", "frame-src", "child-src", "worker-src",
      "manifest-src", "prefetch-src",
      "form-action", "frame-ancestors", "navigate-to",
      "base-uri", "plugin-types", "require-sri-for", "sandbox",
      "upgrade-insecure-requests", "block-all-mixed-content",
    ];

    for (const directive of directiveOrder) {
      const value = directives[directive];
      if (value === undefined || value === null) continue;

      if (typeof value === "boolean") {
        if (value) {
          parts.push(directive as string);
        }
      } else if (Array.isArray(value)) {
        if (value.length === 0) continue;
        parts.push(buildDirective(directive as string, value));
        // Validate sources
        if (this.strict) {
          warnings.push(...validateSources(directive as string, value));
        }
      }
    }

    // Add reporting directives
    if (this.reportUri) {
      directives["report-uri"] = [this.reportUri];
      parts.push(`report-uri ${this.reportUri}`);
    }
    if (this.reportTo) {
      parts.push(`report-to ${this.reportTo}`);
    }

    const headerName = this.reportOnly
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy";

    return {
      header: parts.join("; "),
      reportOnlyHeader: this.reportOnly ? headerName : null,
      directives,
      warnings,
    };
  }

  /** Builds the header object for HTTP responses. */
  buildHeader(route?: string): Record<string, string> {
    const result = this.build(route);
    const headerName = this.reportOnly
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy";
    return { [headerName]: result.header };
  }

  /** Creates a clone of this builder. */
  clone(): CSPPolicyBuilder {
    return new CSPPolicyBuilder({
      directives: JSON.parse(JSON.stringify(this.directives)),
      reportOnly: this.reportOnly,
      reportUri: this.reportUri ?? undefined,
      reportTo: this.reportTo ?? undefined,
      nonce: this.nonce ?? undefined,
      routeOverrides: new Map(this.routeOverrides),
      strict: this.strict,
    });
  }

  /** Resets to defaults. */
  reset(): this {
    this.directives = this.getDefaultDirectives();
    this.nonce = null;
    this.routeOverrides = new Map();
    return this;
  }
}

/** Creates a new CSP policy builder with the given options. */
export function createCSPPolicy(options?: CSPOptions): CSPPolicyBuilder {
  return new CSPPolicyBuilder(options);
}

/** Returns a strict default policy suitable for production. */
export function strictCSP(): CSPPolicyBuilder {
  return new CSPPolicyBuilder({
    directives: {
      "default-src": ["'none'"],
      "script-src": ["'self'"],
      "style-src": ["'self'"],
      "img-src": ["'self'"],
      "font-src": ["'self'"],
      "connect-src": ["'self'"],
      "base-uri": ["'none'"],
      "form-action": ["'self'"],
      "frame-ancestors": ["'none'"],
      "upgrade-insecure-requests": true,
    },
    strict: true,
  });
}

/** Returns a development-friendly policy (more permissive). */
export function devCSP(): CSPPolicyBuilder {
  return new CSPPolicyBuilder({
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:", "blob:"],
      "font-src": ["'self'", "data:"],
      "connect-src": ["'self'", "ws:", "wss:"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
    },
    reportOnly: false,
  });
}
