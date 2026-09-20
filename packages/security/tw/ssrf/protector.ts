/**
 * SSRF Protector -- prevents Server-Side Request Forgery attacks
 * by validating URLs, checking destination IPs against blocklists,
 * and preventing DNS rebinding.
 *
 * @module security/ssrf/protector
 */

/** SSRF check result. */
export interface SSRFResult {
  allowed: boolean;
  reason: string;
  url: string;
  host: string;
  ip: string | null;
  risk: "none" | "low" | "medium" | "high" | "critical";
}

/** Configuration for SSRF protection. */
export interface SSRFConfig {
  /** Allowed URL protocols. */
  allowedProtocols?: string[];
  /** Blocked IP ranges (CIDR notation). */
  blockedIpRanges?: string[];
  /** Allowed IP ranges (if set, only these are allowed). */
  allowedIpRanges?: string[];
  /** Whether to block localhost. */
  blockLoopback?: boolean;
  /** Whether to block private IPs. */
  blockPrivate?: boolean;
  /** Whether to block link-local. */
  blockLinkLocal?: boolean;
  /** Whether to block multicast. */
  blockMulticast?: boolean;
  /** Whether to block cloud metadata endpoints. */
  blockCloudMetadata?: boolean;
  /** DNS resolution timeout (ms). */
  dnsTimeout?: number;
  /** Whether to pin DNS resolution (prevents rebinding). */
  pinDns?: boolean;
  /** Maximum redirects to follow. */
  maxRedirects?: number;
  /** Blocked hostnames (regex patterns). */
  blockedHosts?: string[];
}

/** Private IP ranges (RFC 1918). */
const PRIVATE_RANGES = [
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
];

/** Loopback ranges. */
const LOOPBACK_RANGES = [
  "127.0.0.0/8",
  "::1/128",
];

/** Link-local ranges. */
const LINK_LOCAL_RANGES = [
  "169.254.0.0/16",
  "fe80::/10",
];

/** Cloud metadata endpoints. */
const CLOUD_METADATA_HOSTS = [
  "169.254.169.254",     // AWS, GCP, Azure
  "metadata.google.internal",
  "metadata.azure.com",
  "100.100.100.200",     // Alibaba Cloud
  "fd00:ec2::254",       // AWS IPv6
];

/** Hostnames that always resolve to loopback -- never safe to fetch. */
const ALWAYS_LOCAL_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "0.0.0.0",
]);

function isAlwaysLocalHostname(hostname: string): boolean {
  if (ALWAYS_LOCAL_HOSTNAMES.has(hostname)) return true;
  if (hostname.endsWith(".localhost")) return true;
  if (hostname.endsWith(".local")) return true;
  return false;
}

/** Converts an IP address to a numeric value for range checking. */
function ipToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return 0;
  }
  return (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
}

/** Converts CIDR to a range check function. */
function inCidr(ip: string, cidr: string): boolean {
  const [range, bits] = cidr.split("/");
  const ipNum = ipToInt(ip);
  const rangeNum = ipToInt(range);
  const mask = bits ? (0xFFFFFFFF << (32 - parseInt(bits))) >>> 0 : 0xFFFFFFFF;
  return (ipNum & mask) === (rangeNum & mask);
}

/** Checks if an IP is in any of the given CIDR ranges. */
function isInAnyRange(ip: string, ranges: string[]): boolean {
  return ranges.some(cidr => inCidr(ip, cidr));
}

/** Checks if a hostname looks like an IP address. */
function isIPAddress(hostname: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^[0-9a-f:]+$/i.test(hostname);
}

/** Validates an IP address format. */
function isValidIP(ip: string): boolean {
  // IPv4
  const v4Parts = ip.split(".");
  if (v4Parts.length === 4) {
    return v4Parts.every(p => {
      const n = parseInt(p, 10);
      return n >= 0 && n <= 255;
    });
  }
  // IPv6 -- basic check
  return /^[0-9a-f:]+$/i.test(ip) && ip.includes(":");
}

/**
 * SSRF Protector -- validates URLs and prevents access to
 * internal/private network resources.
 */
export class SSRFProtector {
  private config: Required<SSRFConfig>;

  constructor(config: SSRFConfig = {}) {
    this.config = {
      allowedProtocols: config.allowedProtocols ?? ["https:", "http:"],
      blockedIpRanges: config.blockedIpRanges ?? [],
      allowedIpRanges: config.allowedIpRanges ?? [],
      blockLoopback: config.blockLoopback ?? true,
      blockPrivate: config.blockPrivate ?? true,
      blockLinkLocal: config.blockLinkLocal ?? true,
      blockMulticast: config.blockMulticast ?? true,
      blockCloudMetadata: config.blockCloudMetadata ?? true,
      dnsTimeout: config.dnsTimeout ?? 5000,
      pinDns: config.pinDns ?? true,
      maxRedirects: config.maxRedirects ?? 0,
      blockedHosts: config.blockedHosts ?? [],
    };
  }

  /** Validates a URL for SSRF safety. */
  validate(url: string): SSRFResult {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return {
        allowed: false,
        reason: "Invalid URL format",
        url,
        host: "",
        ip: null,
        risk: "critical",
      };
    }

    // Check protocol
    if (!this.config.allowedProtocols.includes(parsed.protocol)) {
      return {
        allowed: false,
        reason: `Protocol '${parsed.protocol}' not allowed`,
        url,
        host: parsed.hostname,
        ip: null,
        risk: "high",
      };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Check blocked hosts (regex patterns)
    for (const pattern of this.config.blockedHosts) {
      if (new RegExp(pattern, "i").test(hostname)) {
        return {
          allowed: false,
          reason: `Host matches blocked pattern: ${pattern}`,
          url,
          host: hostname,
          ip: null,
          risk: "high",
        };
      }
    }

    // Check cloud metadata endpoints
    if (this.config.blockCloudMetadata) {
      if (CLOUD_METADATA_HOSTS.includes(hostname)) {
        return {
          allowed: false,
          reason: `Cloud metadata endpoint blocked: ${hostname}`,
          url,
          host: hostname,
          ip: hostname,
          risk: "critical",
        };
      }
    }

    // Hostnames that ALWAYS resolve to loopback/private addresses and can
    // never be safe -- block without DNS.
    if (this.config.blockLoopback && isAlwaysLocalHostname(hostname)) {
      return {
        allowed: false,
        reason: `Loopback hostname blocked: ${hostname}`,
        url,
        host: hostname,
        ip: null,
        risk: "critical",
      };
    }

    // If hostname is an IP address, validate it
    if (isIPAddress(hostname)) {
      return this.checkIP(url, hostname, hostname);
    }

    // For hostnames, we can't resolve DNS in this context
    // Return a result indicating DNS resolution is needed
    return {
      allowed: true,
      reason: "URL structure valid -- DNS resolution required",
      url,
      host: hostname,
      ip: null,
      risk: "low",
    };
  }

  /** Checks if an IP address is safe to access. */
  private checkIP(url: string, host: string, ip: string): SSRFResult {
    // Check if it's a valid IP
    if (!isValidIP(ip)) {
      return {
        allowed: false,
        reason: `Invalid IP address: ${ip}`,
        url,
        host,
        ip,
        risk: "medium",
      };
    }

    // IPv4 checks
    if (ip.includes(".")) {
      // Check loopback
      if (this.config.blockLoopback && isInAnyRange(ip, LOOPBACK_RANGES)) {
        return {
          allowed: false,
          reason: `Loopback address blocked: ${ip}`,
          url,
          host,
          ip,
          risk: "critical",
        };
      }

      // Check private ranges
      if (this.config.blockPrivate && isInAnyRange(ip, PRIVATE_RANGES)) {
        return {
          allowed: false,
          reason: `Private IP address blocked: ${ip}`,
          url,
          host,
          ip,
          risk: "critical",
        };
      }

      // Check link-local
      if (this.config.blockLinkLocal && isInAnyRange(ip, LINK_LOCAL_RANGES)) {
        return {
          allowed: false,
          reason: `Link-local address blocked: ${ip}`,
          url,
          host,
          ip,
          risk: "high",
        };
      }

      // Check multicast (224.0.0.0/4)
      if (this.config.blockMulticast) {
        const firstOctet = parseInt(ip.split(".")[0], 10);
        if (firstOctet >= 224 && firstOctet <= 239) {
          return {
            allowed: false,
            reason: `Multicast address blocked: ${ip}`,
            url,
            host,
            ip,
            risk: "high",
          };
        }
      }
    }

    // Check blocked IP ranges
    for (const cidr of this.config.blockedIpRanges) {
      if (inCidr(ip, cidr)) {
        return {
          allowed: false,
          reason: `IP in blocked range: ${cidr}`,
          url,
          host,
          ip,
          risk: "high",
        };
      }
    }

    // Check allowed IP ranges (if set)
    if (this.config.allowedIpRanges.length > 0) {
      const inAllowed = this.config.allowedIpRanges.some(cidr => inCidr(ip, cidr));
      if (!inAllowed) {
        return {
          allowed: false,
          reason: `IP not in allowed ranges`,
          url,
          host,
          ip,
          risk: "medium",
        };
      }
    }

    return {
      allowed: true,
      reason: "IP address is safe",
      url,
      host,
      ip,
      risk: "none",
    };
  }

  /** Validates a URL after DNS resolution. */
  validateWithDNS(url: string, resolvedIp: string): SSRFResult {
    const baseResult = this.validate(url);
    if (!baseResult.allowed) return baseResult;

    return this.checkIP(url, baseResult.host, resolvedIp);
  }

  /** Checks if a URL is safe. */
  isSafe(url: string): boolean {
    return this.validate(url).allowed;
  }

  /** Returns a safe fetch function that validates URLs before fetching. */
  createSafeFetch(): (url: string, init?: RequestInit) => Promise<Response> {
    return async (url: string, init?: RequestInit) => {
      const result = this.validate(url);
      if (!result.allowed) {
        throw new Error(`SSRF protection: ${result.reason}`);
      }

      // validate() can only filter literal-IP URLs; for hostnames it stops
      // at "structure valid". Resolve the hostname and check EVERY address
      // it maps to, otherwise `http://attacker.example` -> 169.254.169.254
      // sails straight through to the real fetch.
      // (node:dns is imported dynamically so this module can still be
      // bundled for non-node environments that never call createSafeFetch.)
      let addresses: string[];
      try {
        const dns = await import("node:dns");
        const records = await dns.promises.lookup(new URL(url).hostname, { all: true });
        addresses = records.map((r: { address: string }) => r.address);
      } catch (err) {
        // Fail CLOSED: if we cannot resolve the host, we cannot vet it.
        throw new Error(`SSRF protection: could not resolve host (${String(err)})`);
      }
      for (const address of addresses) {
        const ipResult = this.checkIP(url, new URL(url).hostname, address);
        if (!ipResult.allowed) {
          throw new Error(`SSRF protection: ${ipResult.reason}`);
        }
      }

      // NOTE: fetch() re-resolves DNS itself, so a rebinding attack between
      // this check and the actual connection remains theoretically possible;
      // callers needing that guarantee should pin the vetted IP (fetch it
      // directly with a Host header).
      return fetch(url, init);
    };
  }
}

/** Creates a new SSRF protector. */
export function createSSRFProtector(config?: SSRFConfig): SSRFProtector {
  return new SSRFProtector(config);
}
