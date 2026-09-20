/**
 * Request logging middleware -- structured logging with request IDs.
 * @module sdk/middleware
 */

export interface LoggerOptions {
  format?: "combined" | "common" | "dev" | "short" | "tiny" | "json";
  skip?: (req: Request, res: Response) => boolean;
  stream?: { write: (message: string) => void };
  requestIdHeader?: string;
  colorize?: boolean;
  immediate?: boolean;
}

export interface RequestLog {
  method: string;
  url: string;
  status: number;
  responseTime: number;
  contentLength: string | null;
  userAgent: string | null;
  ip: string | null;
  requestId: string;
  timestamp: string;
}

export function requestLogger(options: LoggerOptions = {}): (req: Request, res: Response, next: () => void) => void {
  const {
    format = "dev",
    skip = () => false,
    stream = { write: (msg: string) => console.log(msg.trim()) },
    requestIdHeader = "x-request-id",
    colorize = format === "dev",
    immediate = false,
  } = options;

  return (req: Request, res: Response, next: () => void) => {
    const startTime = performance.now();
    const requestId = req.headers.get(requestIdHeader) ?? generateRequestId();
    const timestamp = new Date().toISOString();
    const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
    const userAgent = req.headers.get("user-agent");

    if (immediate) {
      logImmediate(req, requestId, timestamp, ip, userAgent, format, colorize, stream);
      next();
      return;
    }

    const originalEnd = res.headers.set.bind(res.headers);
    res.headers.set = (key: string, value: string) => {
      res.headers.set = originalEnd;
      const responseTime = performance.now() - startTime;
      if (!skip(req, res)) {
        logRequest(req, res, requestId, timestamp, ip, userAgent, responseTime, format, colorize, stream);
      }
      return originalEnd(key, value);
    };

    next();
  };
}

function generateRequestId(): string {
  return `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function logRequest(
  req: Request,
  res: Response,
  requestId: string,
  timestamp: string,
  ip: string | null,
  userAgent: string | null,
  responseTime: number,
  format: string,
  colorize: boolean,
  stream: { write: (message: string) => void },
): void {
  const method = req.method;
  const url = new URL(req.url).pathname;
  const status = res.status;
  const contentLength = res.headers.get("content-length");

  let message: string;
  switch (format) {
    case "combined":
      message = `${ip} - - [${timestamp}] "${method} ${url} HTTP/1.1" ${status} ${contentLength ?? "-"} "${userAgent ?? "-"}" "${req.headers.get("referer") ?? "-"}"`;
      break;
    case "common":
      message = `${ip} - - [${timestamp}] "${method} ${url} HTTP/1.1" ${status} ${contentLength ?? "-"}`;
      break;
    case "dev":
      message = colorize
        ? `${colorStatus(status)} ${method} ${colorUrl(url)} ${colorTime(responseTime)}`
        : `${status} ${method} ${url} ${responseTime.toFixed(2)}ms`;
      break;
    case "short":
      message = `${ip} ${method} ${url} ${status} ${responseTime.toFixed(2)}ms`;
      break;
    case "tiny":
      message = `${method} ${url} ${status} ${responseTime.toFixed(0)}ms`;
      break;
    case "json":
      message = JSON.stringify({
        timestamp,
        requestId,
        method,
        url,
        status,
        responseTime: Math.round(responseTime * 100) / 100,
        contentLength,
        ip,
        userAgent,
      });
      break;
    default:
      message = `${method} ${url} ${status} ${responseTime.toFixed(2)}ms`;
  }
  stream.write(message + "\n");
}

function logImmediate(
  req: Request,
  requestId: string,
  timestamp: string,
  ip: string | null,
  userAgent: string | null,
  format: string,
  colorize: boolean,
  stream: { write: (message: string) => void },
): void {
  const method = req.method;
  const url = new URL(req.url).pathname;
  const message = format === "json"
    ? JSON.stringify({ timestamp, requestId, method, url, ip, userAgent, phase: "request" })
    : `-> ${method} ${url}`;
  stream.write(message + "\n");
}

function colorStatus(status: number): string {
  if (status >= 500) return `\x1b[31m${status}\x1b[0m`;
  if (status >= 400) return `\x1b[33m${status}\x1b[0m`;
  if (status >= 300) return `\x1b[36m${status}\x1b[0m`;
  if (status >= 200) return `\x1b[32m${status}\x1b[0m`;
  return String(status);
}

function colorUrl(url: string): string {
  return `\x1b[37m${url}\x1b[0m`;
}

function colorTime(ms: number): string {
  if (ms < 100) return `\x1b[32m${ms.toFixed(2)}ms\x1b[0m`;
  if (ms < 500) return `\x1b[33m${ms.toFixed(2)}ms\x1b[0m`;
  return `\x1b[31m${ms.toFixed(2)}ms\x1b[0m`;
}

export function combinedLogger(): (req: Request, res: Response, next: () => void) => void {
  return requestLogger({ format: "combined" });
}

export function commonLogger(): (req: Request, res: Response, next: () => void) => void {
  return requestLogger({ format: "common" });
}

export function devLogger(): (req: Request, res: Response, next: () => void) => void {
  return requestLogger({ format: "dev", colorize: true });
}

export function shortLogger(): (req: Request, res: Response, next: () => void) => void {
  return requestLogger({ format: "short" });
}

export function tinyLogger(): (req: Request, res: Response, next: () => void) => void {
  return requestLogger({ format: "tiny" });
}

export function jsonLogger(): (req: Request, res: Response, next: () => void) => void {
  return requestLogger({ format: "json" });
}

export function silentLogger(paths: string[]): (req: Request, res: Response, next: () => void) => void {
  return requestLogger({
    skip: (req) => {
      const url = new URL(req.url).pathname;
      return paths.some((path) => url.startsWith(path));
    },
  });
}

export function healthCheckLogger(): (req: Request, res: Response, next: () => void) => void {
  return silentLogger(["/health", "/healthz", "/ready", "/readyz"]);
}

export function statusFilterLogger(statuses: number[]): (req: Request, res: Response, next: () => void) => void {
  return requestLogger({
    skip: (_req, res) => statuses.includes(res.status),
  });
}

export function errorOnlyLogger(): (req: Request, res: Response, next: () => void) => void {
  return statusFilterLogger([200, 201, 204, 301, 302, 304]);
}

export function slowRequestLogger(threshold: number = 1000): (req: Request, res: Response, next: () => void) => void {
  const logs: Array<{ req: Request; res: Response; requestId: string; timestamp: string; ip: string | null; userAgent: string | null; startTime: number }> = [];
  return (req: Request, res: Response, next: () => void) => {
    const startTime = performance.now();
    const requestId = req.headers.get("x-request-id") ?? generateRequestId();
    const timestamp = new Date().toISOString();
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const userAgent = req.headers.get("user-agent");

    logs.push({ req, res, requestId, timestamp, ip, userAgent, startTime });

    const originalEnd = res.headers.set.bind(res.headers);
    res.headers.set = (key: string, value: string) => {
      res.headers.set = originalEnd;
      const responseTime = performance.now() - startTime;
      if (responseTime >= threshold) {
        console.warn(`Slow request: ${req.method} ${new URL(req.url).pathname} took ${responseTime.toFixed(2)}ms`);
      }
      return originalEnd(key, value);
    };
    next();
  };
}

export function requestTimer(): (req: Request, res: Response, next: () => void) => void {
  return (req: Request, res: Response, next: () => void) => {
    const start = performance.now();
    const originalSet = res.headers.set.bind(res.headers);
    res.headers.set = (key: string, value: string) => {
      res.headers.set = originalSet;
      const duration = performance.now() - start;
      res.headers.set("x-response-time", duration.toFixed(2));
      return originalSet(key, value);
    };
    next();
  };
}

export function requestIdMiddleware(headerName: string = "x-request-id"): (req: Request, res: Response, next: () => void) => void {
  return (req: Request, res: Response, next: () => void) => {
    const id = req.headers.get(headerName) ?? generateRequestId();
    res.headers.set(headerName, id);
    next();
  };
}

export function ipExtractor(): (req: Request, res: Response, next: () => void) => void {
  return (req: Request, res: Response, next: () => void) => {
    const forwarded = req.headers.get("x-forwarded-for");
    const real = req.headers.get("x-real-ip");
    const remote = req.headers.get("remote-addr");
    const ip = forwarded?.split(",")[0].trim() ?? real ?? remote ?? "unknown";
    res.headers.set("x-client-ip", ip);
    next();
  };
}

export function userAgentParser(): (req: Request, res: Response, next: () => void) => void {
  return (req: Request, res: Response, next: () => void) => {
    const ua = req.headers.get("user-agent") ?? "";
    const browser = parseBrowser(ua);
    const os = parseOS(ua);
    const device = parseDevice(ua);
    res.headers.set("x-browser", browser);
    res.headers.set("x-os", os);
    res.headers.set("x-device", device);
    next();
  };
}

function parseBrowser(ua: string): string {
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Edg")) return "Edge";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Safari")) return "Safari";
  if (ua.includes("OPR") || ua.includes("Opera")) return "Opera";
  if (ua.includes("MSIE") || ua.includes("Trident")) return "IE";
  return "Unknown";
}

function parseOS(ua: string): string {
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Mac OS")) return "macOS";
  if (ua.includes("Linux")) return "Linux";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
  return "Unknown";
}

function parseDevice(ua: string): string {
  if (ua.includes("Mobile")) return "Mobile";
  if (ua.includes("iPad") || ua.includes("Tablet")) return "Tablet";
  if (ua.includes("Android")) return "Mobile";
  return "Desktop";
}

export class RequestLogger {
  private options: LoggerOptions;
  private logs: RequestLog[] = [];
  private maxLogs: number;

  constructor(options: LoggerOptions = {}, maxLogs: number = 1000) {
    this.options = options;
    this.maxLogs = maxLogs;
  }

  middleware(): (req: Request, res: Response, next: () => void) => void {
    return (req: Request, res: Response, next: () => void) => {
      const startTime = performance.now();
      const requestId = req.headers.get(this.options.requestIdHeader ?? "x-request-id") ?? generateRequestId();
      const timestamp = new Date().toISOString();
      const ip = req.headers.get("x-forwarded-for") ?? "unknown";
      const userAgent = req.headers.get("user-agent");

      const originalSet = res.headers.set.bind(res.headers);
      res.headers.set = (key: string, value: string) => {
        res.headers.set = originalSet;
        const responseTime = performance.now() - startTime;
        const log: RequestLog = {
          method: req.method,
          url: new URL(req.url).pathname,
          status: res.status,
          responseTime,
          contentLength: res.headers.get("content-length"),
          userAgent,
          ip,
          requestId,
          timestamp,
        };
        this.addLog(log);
        return originalSet(key, value);
      };
      next();
    };
  }

  private addLog(log: RequestLog): void {
    this.logs.push(log);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }

  getLogs(): RequestLog[] {
    return [...this.logs];
  }

  getLogsByStatus(status: number): RequestLog[] {
    return this.logs.filter((log) => log.status === status);
  }

  getLogsByMethod(method: string): RequestLog[] {
    return this.logs.filter((log) => log.method === method);
  }

  getLogsByUrl(url: string): RequestLog[] {
    return this.logs.filter((log) => log.url === url);
  }

  getSlowestRequests(count: number = 10): RequestLog[] {
    return [...this.logs].sort((a, b) => b.responseTime - a.responseTime).slice(0, count);
  }

  getFastestRequests(count: number = 10): RequestLog[] {
    return [...this.logs].sort((a, b) => a.responseTime - b.responseTime).slice(0, count);
  }

  getAverageResponseTime(): number {
    if (this.logs.length === 0) return 0;
    return this.logs.reduce((sum, log) => sum + log.responseTime, 0) / this.logs.length;
  }

  getStats(): {
    totalRequests: number;
    averageResponseTime: number;
    statusCodes: Record<number, number>;
    methods: Record<string, number>;
    topUrls: Array<{ url: string; count: number }>;
  } {
    const statusCodes: Record<number, number> = {};
    const methods: Record<string, number> = {};
    const urlCounts: Record<string, number> = {};
    for (const log of this.logs) {
      statusCodes[log.status] = (statusCodes[log.status] ?? 0) + 1;
      methods[log.method] = (methods[log.method] ?? 0) + 1;
      urlCounts[log.url] = (urlCounts[log.url] ?? 0) + 1;
    }
    const topUrls = Object.entries(urlCounts)
      .map(([url, count]) => ({ url, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    return {
      totalRequests: this.logs.length,
      averageResponseTime: this.getAverageResponseTime(),
      statusCodes,
      methods,
      topUrls,
    };
  }

  clear(): void {
    this.logs = [];
  }

  export(format: "json" | "csv" = "json"): string {
    if (format === "csv") {
      const header = "timestamp,requestId,method,url,status,responseTime,contentLength,ip,userAgent\n";
      const rows = this.logs.map((log) =>
        `${log.timestamp},${log.requestId},${log.method},${log.url},${log.status},${log.responseTime.toFixed(2)},${log.contentLength ?? ""},${log.ip ?? ""},${log.userAgent ?? ""}`,
      ).join("\n");
      return header + rows;
    }
    return JSON.stringify(this.logs, null, 2);
  }
}
