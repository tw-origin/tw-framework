/**
 * HSTS Manager -- HTTP Strict Transport Security management
 * with preload list support and domain tracking.
 *
 * @module security/headers/hsts
 */

/** HSTS configuration. */
export interface HSTSConfig {
  maxAge: number;
  includeSubdomains: boolean;
  preload: boolean;
}

/** A domain tracked in the HSTS preload list. */
export interface HSTSDomain {
  domain: string;
  addedAt: number;
  config: HSTSConfig;
}

/** Default HSTS configuration. */
const DEFAULT_HSTS: HSTSConfig = {
  maxAge: 31536000, // 1 year
  includeSubdomains: true,
  preload: false,
};

/**
 * HSTS Manager -- manages HSTS policy generation, domain tracking,
 * and preload list submission preparation.
 */
export class HSTSManager {
  private config: HSTSConfig;
  private domains: Map<string, HSTSDomain> = new Map();
  private maxDomains: number;

  constructor(config: Partial<HSTSConfig> = {}, maxDomains: number = 10000) {
    this.config = { ...DEFAULT_HSTS, ...config };
    this.maxDomains = maxDomains;
  }

  /** Builds the HSTS header value. */
  buildHeader(): string {
    const parts: string[] = [`max-age=${this.config.maxAge}`];
    if (this.config.includeSubdomains) parts.push("includeSubDomains");
    if (this.config.preload) parts.push("preload");
    return parts.join("; ");
  }

  /** Returns the Strict-Transport-Security header value. */
  getHeader(): string {
    return this.buildHeader();
  }

  /** Registers a domain for HSTS tracking. */
  registerDomain(domain: string, config?: Partial<HSTSConfig>): void {
    if (this.domains.size >= this.maxDomains) {
      this.evictOldest();
    }
    this.domains.set(domain, {
      domain,
      addedAt: Date.now(),
      config: { ...this.config, ...config },
    });
  }

  /** Unregisters a domain. */
  unregisterDomain(domain: string): void {
    this.domains.delete(domain);
  }

  /** Checks if a domain is HSTS-protected. */
  isProtected(domain: string): boolean {
    return this.domains.has(domain);
  }

  /** Returns all registered domains. */
  getDomains(): HSTSDomain[] {
    return Array.from(this.domains.values());
  }

  /** Generates the preload list JSON for hstspreload.org submission. */
  generatePreloadList(): Array<{ name: string; include_subdomains: boolean }> {
    return Array.from(this.domains.values())
      .filter(d => d.config.preload)
      .map(d => ({
        name: d.domain,
        include_subdomains: d.config.includeSubdomains,
      }));
  }

  /** Updates the HSTS configuration. */
  updateConfig(config: Partial<HSTSConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Creates a middleware that adds HSTS headers to HTTPS responses. */
  middleware() {
    return (req: Request, res: Response): Response => {
      // Only add HSTS on HTTPS
      const isHttps = req.url.startsWith("https://") ||
        req.headers.get("x-forwarded-proto") === "https";

      if (!isHttps) return res;

      const newHeaders = new Headers(res.headers);
      newHeaders.set("Strict-Transport-Security", this.buildHeader());

      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: newHeaders,
      });
    };
  }

  private evictOldest(): void {
    const sorted = Array.from(this.domains.values())
      .sort((a, b) => a.addedAt - b.addedAt);
    const toRemove = Math.ceil(sorted.length * 0.1);
    for (let i = 0; i < toRemove; i++) {
      this.domains.delete(sorted[i].domain);
    }
  }
}

/** Creates a new HSTS manager. */
export function createHSTSManager(config?: Partial<HSTSConfig>): HSTSManager {
  return new HSTSManager(config);
}
