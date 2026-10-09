/**
 * Client-address helpers (docs/request-context.md).
 *
 * Lives in `@tw/shared` because the server, the security middleware and the
 * SDK all need it -- before this existed the same
 * `x-forwarded-for` split was copy-pasted in seven places.
 *
 * Understands seven proxy header families; the caller is told which one
 * answered and whether the value should be trusted.
 */

export interface ClientIp {
  /** Best-guess client address -- IPv4 or IPv6, no port, no `::ffff:`. */
  ip: string;
  version: 4 | 6;
  /** True when the value came from a proxy header, not the socket. */
  trusted: boolean;
  /** Which header answered, or "socket" when none was present. */
  source: string;
  isPrivate: boolean;
  isLoopback: boolean;
}

/** Anything that can carry headers. */
export type HeaderBag = Request | Headers | Record<string, string | undefined>;

/**
 * Case-insensitive header read across every shape a handler sees:
 *
 *   - a real `Request` (server, tests)
 *   - a `Headers` instance
 *   - a plain headers object
 *   - a `.twm` handler's context object -- `{ headers, method, url, ... }`,
 *     which is NOT a `Request` (docs/api-routes.md). Without this case,
 *     `clientIp(request)` inside a route found no headers and reported the
 *     socket, so every request looked like it came from nowhere.
 */
export function readHeader(bag: HeaderBag, name: string): string | undefined {
  if (!bag) return undefined;

  if (typeof Request !== "undefined" && bag instanceof Request) return bag.headers.get(name) ?? undefined;
  if (typeof Headers !== "undefined" && bag instanceof Headers) return bag.get(name) ?? undefined;

  const rec = bag as Record<string, unknown>;

  // a `.twm` context (or any wrapper) that nests the headers one level down
  const nested = rec.headers;
  if (nested && typeof nested === "object") {
    // a nested Headers instance (or anything with .get) -- read it directly
    const viaGet = nested as { get?: (n: string) => string | null };
    if (typeof viaGet.get === "function") {
      const got = viaGet.get(name);
      if (got !== null && got !== undefined) return got;
    }
    const inner = nested as Record<string, string | undefined>;
    const lower = name.toLowerCase();
    for (const k of Object.keys(inner)) {
      if (k.toLowerCase() === lower) {
        const v = inner[k];
        return typeof v === "string" ? v : undefined;
      }
    }
  }

  const lower = name.toLowerCase();
  for (const k of Object.keys(rec)) {
    if (k.toLowerCase() === lower) {
      const v = rec[k];
      return typeof v === "string" ? v : undefined;
    }
  }
  return undefined;
}

/** Header families we understand, most-trusted first. */
export const IP_HEADERS = [
  "cf-connecting-ip",       // Cloudflare
  "true-client-ip",         // Cloudflare Enterprise / Akamai
  "fly-client-ip",          // Fly.io
  "x-vercel-forwarded-for", // Vercel
  "x-real-ip",              // nginx
  "x-forwarded-for",        // generic (may be a comma list)
] as const;

/** Strip a port and an IPv4-mapped IPv6 prefix. */
export function normalizeIp(raw: string): string {
  let ip = (raw ?? "").trim();
  if (!ip) return "";
  if (ip.startsWith("[")) {
    const end = ip.indexOf("]");
    if (end !== -1) ip = ip.slice(1, end);
  } else if (ip.split(":").length === 2 && ip.includes(".")) {
    ip = ip.split(":")[0];
  }
  if (ip.toLowerCase().startsWith("::ffff:")) ip = ip.slice(7);
  return ip;
}

/** True when the address is IPv6-shaped. */
export function isIpv6(ip: string): boolean {
  return ip.includes(":");
}

/** RFC 7239 `Forwarded: for=1.2.3.4;proto=https, for=5.6.7.8` */
export function fromForwardedHeader(value: string): string | undefined {
  const first = value.split(",")[0];
  const m = /for="?\[?([^;"\]]+)/i.exec(first);
  return m ? normalizeIp(m[1]) : undefined;
}

/**
 * server.trustProxy -- when false, the forwarded-header families are ignored
 * (a client cannot spoof its address through X-Forwarded-For). Default true,
 * which is the behaviour every deployment behind a proxy expects.
 */
let trustProxyEnabled = true;
export function setTrustProxy(v: boolean): void { trustProxyEnabled = !!v; }
export function getTrustProxy(): boolean { return trustProxyEnabled; }

/** The client address, with provenance. */
export function clientIp(bag: HeaderBag): ClientIp {
  let ip = "";
  let source = "socket";

  if (trustProxyEnabled) {
    const forwarded = readHeader(bag, "forwarded");
    if (forwarded) {
      const parsed = fromForwardedHeader(forwarded);
      if (parsed) { ip = parsed; source = "forwarded"; }
    }

    if (!ip) {
      for (const h of IP_HEADERS) {
        const raw = readHeader(bag, h);
        if (!raw) continue;
        const candidate = normalizeIp(raw.split(",")[0]);
        if (candidate) { ip = candidate; source = h; break; }
      }
    }
  }

  return {
    ip,
    version: isIpv6(ip) ? 6 : 4,
    trusted: source !== "socket",
    source,
    isPrivate: isPrivateIp(ip),
    isLoopback: ip === "127.0.0.1" || ip === "::1",
  };
}

/** Plain string shorthand. */
export function ipAddress(bag: HeaderBag): string | undefined {
  const { ip } = clientIp(bag);
  return ip || undefined;
}

/** True for RFC1918, loopback, link-local, CGNAT and IPv6 ULA. */
export function isPrivateIp(ip: string): boolean {
  if (!ip) return false;
  if (isIpv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::1") return true;
    if (v.startsWith("fc") || v.startsWith("fd")) return true; // fc00::/7
    if (v.startsWith("fe80")) return true;                     // link-local
    return false;
  }
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return false;
  if (p[0] === 10) return true;
  if (p[0] === 127) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 169 && p[1] === 254) return true;
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
  return false;
}

/** Pack an address into a bigint so IPv4 and IPv6 share one comparison. */
export function ipToBigInt(ip: string): bigint | null {
  if (isIpv6(ip)) {
    const parts = ip.split("::");
    if (parts.length > 2) return null;
    const left = parts[0] ? parts[0].split(":") : [];
    const right = parts[1] ? parts[1].split(":") : [];
    const fill = 8 - left.length - right.length;
    if (fill < 0) return null;
    const full = [...left, ...Array(fill).fill("0"), ...right];
    let n = 0n;
    for (const g of full) {
      const v = parseInt(g || "0", 16);
      if (Number.isNaN(v)) return null;
      n = (n << 16n) | BigInt(v);
    }
    return n;
  }
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return (BigInt(p[0]) << 24n) | (BigInt(p[1]) << 16n) | (BigInt(p[2]) << 8n) | BigInt(p[3]);
}

/** True when `ip` falls inside a CIDR range, IPv4 or IPv6. */
export function inCidr(ip: string, range: string): boolean {
  const [base, bitsRaw] = range.split("/");
  if (!base) return false;
  const target = ipToBigInt(normalizeIp(ip));
  const net = ipToBigInt(normalizeIp(base));
  if (target === null || net === null) return false;
  const total = isIpv6(normalizeIp(base)) ? 128 : 32;
  const bits = bitsRaw === undefined ? total : Number(bitsRaw);
  if (Number.isNaN(bits) || bits < 0 || bits > total) return false;
  if (bits === 0) return true;
  const shift = BigInt(total - bits);
  return (target >> shift) === (net >> shift);
}

/** Take the Nth-from-the-right address in x-forwarded-for (hop counting). */
export function trustProxy(bag: HeaderBag, hops: number): string {
  const raw = readHeader(bag, "x-forwarded-for");
  if (!raw) return "";
  const list = raw.split(",").map((s) => normalizeIp(s)).filter(Boolean);
  if (list.length === 0) return "";
  const idx = Math.max(0, list.length - 1 - Math.max(0, hops));
  return list[idx] ?? "";
}
