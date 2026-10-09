/**
 * TW request and response wrappers (docs/wrappers.md).
 *
 * In `@tw/shared` so `import { TWRequest, TWResponse } from "tw"` works.
 */

import { clientIp, geolocation, userAgent, type ClientIp, type Geo, type UserAgentInfo } from "../net/request-context";
import { redirect as redirectResponse, type RedirectOptions } from "./response";

/** A cookie on the way in, plus any staged change on the way out. */
export class CookieJar {
  private staged = new Map<string, string | null>();

  constructor(private incoming: Record<string, string> = {}) {}

  get(name: string): string | undefined {
    if (this.staged.has(name)) return this.staged.get(name) ?? undefined;
    return this.incoming[name];
  }

  has(name: string): boolean { return this.get(name) !== undefined; }

  all(): Record<string, string> {
    const out: Record<string, string> = { ...this.incoming };
    for (const [k, v] of this.staged) {
      if (v === null) delete out[k];
      else out[k] = v;
    }
    return out;
  }

  /** Stage a Set-Cookie. Nothing is sent until you read `setCookieHeaders()`. */
  set(name: string, value: string, opts: { path?: string; maxAge?: number; httpOnly?: boolean; secure?: boolean; sameSite?: "Lax" | "Strict" | "None" } = {}): void {
    const parts = [`${name}=${encodeURIComponent(value)}`];
    parts.push(`Path=${opts.path ?? "/"}`);
    if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
    if (opts.httpOnly !== false) parts.push("HttpOnly");
    if (opts.secure) parts.push("Secure");
    parts.push(`SameSite=${opts.sameSite ?? "Lax"}`);
    this.staged.set(name, parts.join("; "));
  }

  delete(name: string, opts: { path?: string } = {}): void {
    this.staged.set(name, `${name}=; Path=${opts.path ?? "/"}; Max-Age=0`);
  }

  /** Every staged Set-Cookie header value. */
  setCookieHeaders(): string[] {
    return [...this.staged.values()].filter((v): v is string => v !== null && v.includes("="));
  }
}

function parseCookieHeader(raw: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

/** A `Request` with the TW helpers attached. */
export class TWRequest {
  readonly raw: Request;
  readonly cookies: CookieJar;
  private urlObject: URL;

  constructor(input: Request | string | URL, init?: RequestInit) {
    this.raw = input instanceof Request ? input : new Request(input as string | URL, init);
    this.urlObject = new URL(this.raw.url);
    this.cookies = new CookieJar(parseCookieHeader(this.raw.headers.get("cookie")));
  }

  get url(): string { return this.raw.url; }
  get method(): string { return this.raw.method; }
  get pathname(): string { return this.urlObject.pathname; }
  get hash(): string { return this.urlObject.hash; }

  /** Query params, readable **and** writable. */
  searchParams(): URLSearchParams { return new URLSearchParams(this.urlObject.search); }

  /** A param from the query string, coerced on request. */
  param(name: string, parse: "string" | "int" | "float" | "bool" = "string"): string | number | boolean | undefined {
    const raw = this.searchParams().get(name);
    if (raw === null) return undefined;
    if (parse === "int") { const n = Number.parseInt(raw, 10); return Number.isNaN(n) ? undefined : n; }
    if (parse === "float") { const n = Number.parseFloat(raw); return Number.isNaN(n) ? undefined : n; }
    if (parse === "bool") return raw === "1" || raw.toLowerCase() === "true";
    return raw;
  }

  header(name: string): string | undefined { return this.raw.headers.get(name) ?? undefined; }
  headers(): Record<string, string> {
    const out: Record<string, string> = {};
    this.raw.headers.forEach((v, k) => { out[k] = v; });
    return out;
  }

  /** The client address, with provenance. */
  ip(): ClientIp { return clientIp(this.raw); }
  /** Geolocation from edge headers. */
  geo(): Geo { return geolocation(this.raw); }
  /** The parsed user agent. */
  ua(): UserAgentInfo { return userAgent(this.raw); }

  async json<T = unknown>(): Promise<T> { return (await this.raw.clone().json()) as T; }
  async text(): Promise<string> { return this.raw.clone().text(); }
  async formData(): Promise<FormData> { return this.raw.clone().formData(); }

  /** A copy of the underlying request (for forwarding). */
  toRequest(): Request { return this.raw.clone(); }
}

/** A `Response` builder with the TW helpers attached. */
export class TWResponse {
  readonly raw: Response;
  private jar: CookieJar | null = null;

  constructor(raw: Response) { this.raw = raw; }

  get status(): number { return this.raw.status; }
  get headers(): Headers { return this.raw.headers; }

  /** Attach a cookie jar, so staged cookies are flushed onto this response. */
  withCookies(jar: CookieJar): TWResponse {
    this.jar = jar;
    for (const c of jar.setCookieHeaders()) this.raw.headers.append("set-cookie", c);
    return this;
  }

  set(name: string, value: string): TWResponse { this.raw.headers.set(name, value); return this; }

  static json(data: unknown, status = 200, headers: Record<string, string> = {}): TWResponse {
    return new TWResponse(new Response(JSON.stringify(data), {
      status, headers: { "content-type": "application/json; charset=utf-8", ...headers },
    }));
  }

  static html(markup: string, status = 200, headers: Record<string, string> = {}): TWResponse {
    return new TWResponse(new Response(markup, {
      status, headers: { "content-type": "text/html; charset=utf-8", ...headers },
    }));
  }

  static text(body: string, status = 200, headers: Record<string, string> = {}): TWResponse {
    return new TWResponse(new Response(body, {
      status, headers: { "content-type": "text/plain; charset=utf-8", ...headers },
    }));
  }

  static redirect(to: string, opts: RedirectOptions = {}): TWResponse {
    return new TWResponse(redirectResponse(to, opts));
  }

  static noContent(status = 204): TWResponse { return new TWResponse(new Response(null, { status })); }
}

/** Wrap a request in the TW helpers. */
export function twRequest(input: Request | string | URL, init?: RequestInit): TWRequest {
  return new TWRequest(input, init);
}
