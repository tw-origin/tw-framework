/**
 * TW SDK -- Helper functions.
 *
 * All the define* helpers, middleware/router utilities, html/css/json
 * template helpers, and store integration.
 */

import { join as pathJoin } from "node:path";

import type {
  PageDefinition,
  LayoutDefinition,
  Middleware,
  PluginDefinition,
  PluginHooks,
  HookName,
  ComponentDefinition,
  RouteDefinition,
  RouteHandler,
  RequestContext,
  CookieOptions,
} from "./types";

// --- Page & Layout Helpers --------------------------------------------

export function definePage(
  path: string,
  component: ComponentDefinition,
  opts?: Partial<Omit<PageDefinition, "path" | "component">>,
): PageDefinition {
  return {
    path,
    component,
    layout: opts?.layout,
    middleware: opts?.middleware,
    loading: opts?.loading,
    error: opts?.error,
    meta: opts?.meta,
    revalidate: opts?.revalidate,
    static: opts?.static,
    serverOnly: opts?.serverOnly,
  };
}

export function defineLayout(
  name: string,
  component: ComponentDefinition,
  opts?: Partial<LayoutDefinition>,
): LayoutDefinition {
  return {
    name,
    component,
    slots: opts?.slots ?? ["default"],
    middleware: opts?.middleware,
  };
}

// --- Middleware Helper ------------------------------------------------

export function defineMiddleware(handler: Middleware): Middleware {
  return handler;
}

// --- Plugin Helper ----------------------------------------------------

export function definePlugin(
  name: string,
  hooks: Partial<PluginHooks>,
  config?: Record<string, unknown>,
): PluginDefinition {
  return {
    name,
    version: "0.0.1",
    hooks,
    config,
  };
}

// --- Route Helper -----------------------------------------------------

export function defineRoute(
  method: string,
  path: string,
  handler: RouteHandler,
  middleware?: string[],
): RouteDefinition {
  return { method: method.toUpperCase(), path, handler, middleware };
}

// --- Template Helpers -------------------------------------------------

/**
 * Tagged template literal for HTML.
 * Interpolates values safely (escapes strings).
 *
 * @example
 * const view = html`<div class="card">${user.name}</div>`;
 */
export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((acc, str, i) => {
    const val = values[i - 1] ?? "";
    if (i === 0) return str;
    const safe = typeof val === "string" ? escapeHtml(val) : String(val ?? "");
    return acc + safe + str;
  }, "");
}

/**
 * Tagged template literal for CSS.
 * Passes values through without escaping.
 *
 * @example
 * const styles = css`.card { color: ${theme.primary}; }`;
 */
export function css(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((acc, str, i) => {
    const val = values[i - 1] ?? "";
    if (i === 0) return str;
    return acc + String(val ?? "") + str;
  }, "");
}

/**
 * Tagged template literal for JSON.
 * Parses and stringifies values to ensure valid JSON output.
 */
export function json(strings: TemplateStringsArray, ...values: unknown[]): string {
  const raw = strings.reduce((acc, str, i) => {
    const val = values[i - 1] ?? "";
    if (i === 0) return str;
    return acc + String(val ?? "") + str;
  }, "");
  try {
    return JSON.stringify(JSON.parse(raw));
  } catch {
    return JSON.stringify(raw);
  }
}

// --- Escape / Unescape ------------------------------------------------

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function unescapeHtml(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// --- Path Utilities ---------------------------------------------------

export function join(...paths: string[]): string {
  return paths.filter(Boolean).join("/");
}

export function normalizePath(p: string): string {
  return p.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

// --- Cookie Utilities -------------------------------------------------

export function serializeCookie(name: string, value: string, opts: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  if (opts.maxAge) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.path) parts.push(`Path=${opts.path}`);
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  return parts.join("; ");
}

export function parseCookies(cookieStr: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieStr) return cookies;
  for (const part of cookieStr.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      cookies[key] = decodeURIComponent(val);
    } catch {
      cookies[key] = val;
    }
  }
  return cookies;
}

// --- Middleware Factories ---------------------------------------------

/**
 * CORS middleware factory.
 */
export function corsMiddlewareFactory(opts: {
  origin?: string | string[] | ((ctx: RequestContext) => string | null);
  methods?: string[];
  credentials?: boolean;
  maxAge?: number;
}): Middleware {
  const defaultMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
  const methods = opts.methods ?? defaultMethods;
  const maxAge = opts.maxAge ?? 86400;

  return async (ctx, next) => {
    const origin = ctx.headers["origin"];
    if (!origin) {
      await next();
      return;
    }

    let allowedOrigin: string | null = null;
    if (typeof opts.origin === "function") {
      allowedOrigin = opts.origin(ctx);
    } else if (Array.isArray(opts.origin)) {
      allowedOrigin = opts.origin.includes(origin) ? origin : null;
    } else {
      allowedOrigin = opts.origin ?? "*";
    }

    if (allowedOrigin) {
      ctx.setHeader("Access-Control-Allow-Origin", allowedOrigin);
      ctx.setHeader("Access-Control-Allow-Methods", methods.join(", "));
      ctx.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
      if (opts.credentials) {
        ctx.setHeader("Access-Control-Allow-Credentials", "true");
      }
      ctx.setHeader("Access-Control-Max-Age", String(maxAge));
    }

    // Handle preflight
    if (ctx.method === "OPTIONS") {
      ctx.response = new Response(null, { status: 204 });
      return;
    }

    await next();
  };
}

/**
 * Logging middleware factory.
 */
export function loggingMiddlewareFactory(opts?: {
  format?: (ctx: RequestContext) => string;
}): Middleware {
  const format = opts?.format ?? ((ctx: RequestContext) => {
    return `${ctx.method} ${ctx.path} -- ${ctx.headers["user-agent"] ?? "unknown"}`;
  });

  return async (ctx, next) => {
    const start = performance.now();
    await next();
    const duration = (performance.now() - start).toFixed(2);
    console.log(`  ${format(ctx)} [${duration}ms]`);
  };
}

/**
 * Rate limiting middleware factory (in-memory, fixed window).
 */
export function rateLimitMiddlewareFactory(opts: {
  windowMs: number;
  max: number;
}): Middleware {
  const windows = new Map<string, { count: number; resetAt: number }>();

  return async (ctx, next) => {
    const ip = ctx.headers["x-forwarded-for"]?.split(",")[0]?.trim() ?? ctx.headers["host"] ?? "unknown";
    const now = Date.now();

    let window = windows.get(ip);
    if (!window || window.resetAt < now) {
      window = { count: 0, resetAt: now + opts.windowMs };
      windows.set(ip, window);
    }

    window.count++;

    if (window.count > opts.max) {
      const retryAfter = Math.ceil((window.resetAt - now) / 1000);
      ctx.response = new Response(
        JSON.stringify({ error: "Rate limit exceeded" }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(retryAfter),
          },
        },
      );
      return;
    }

    ctx.setHeader("X-RateLimit-Limit", String(opts.max));
    ctx.setHeader("X-RateLimit-Remaining", String(Math.max(0, opts.max - window.count)));
    ctx.setHeader("X-RateLimit-Reset", String(Math.ceil(window.resetAt / 1000)));

    await next();
  };
}

// --- Built-in Middleware ----------------------------------------------

export const loggingMiddleware: Middleware = loggingMiddlewareFactory();
export const corsMiddleware: Middleware = corsMiddlewareFactory({ origin: "*" });

// --- Async Component Helper --------------------------------------------

/**
 * Define an async component that loads on demand.
 * Supports loading state, error boundary, and timeout.
 *
 * @example
 * const AsyncChart = defineAsyncComponent(() => import("./Chart.ts"));
 */
export function defineAsyncComponent(
  loader: () => Promise<{ default: ComponentDefinition } | ComponentDefinition>,
  opts?: {
    loading?: ComponentDefinition;
    timeout?: number;
    onError?: (error: Error) => void;
  },
): ComponentDefinition {
  let cached: ComponentDefinition | null = null;
  let loading: Promise<ComponentDefinition> | null = null;
  const timeout = opts?.timeout ?? 30000;

  return {
    __isTWComponent: true,
    name: "async-component",
    options: { name: "async-component" },

    create(props: Record<string, unknown> = {}) {
      if (cached) {
        return cached.create(props);
      }

      if (!loading) {
        loading = (async () => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeout);

          try {
            const mod = await loader();
            const component = (mod as { default?: ComponentDefinition }).default ?? (mod as ComponentDefinition);
            cached = component;
            clearTimeout(timer);
            return component;
          } catch (err) {
            clearTimeout(timer);
            opts?.onError?.(err as Error);
            throw err;
          }
        })();
      }

      // Return a placeholder instance while loading
      const placeholder: import("./types").ComponentInstance = {
        name: "async-loading",
        props,
        state: {},
        methods: {},
        computed: {},
        isMounted: false,
        dom: null,
        render: () => opts?.loading ? "<div class='tw-loading'>Loading...</div>" : "",
        setState: () => {},
        forceUpdate: () => {},
        mount: () => {},
        unmount: () => {},
      };

      return placeholder;
    },
  };
}

// --- Error Boundary Helper ---------------------------------------------

export function defineErrorBoundary(
  fallback: ComponentDefinition,
  onError?: (error: Error, errorInfo: { componentStack: string }) => void,
): ComponentDefinition {
  return {
    __isTWComponent: true,
    name: "error-boundary",
    options: {
      name: "error-boundary",
      lifecycle: {
        onError(error, errorInfo) {
          onError?.(error, errorInfo);
        },
      },
    },
    create(props: Record<string, unknown> = {}) {
      const instance = fallback.create(props);
      const originalRender = instance.render.bind(instance);

      instance.render = () => {
        try {
          return originalRender();
        } catch (err) {
          onError?.(err as Error, { componentStack: instance.name });
          return "";
        }
      };

      return instance;
    },
  };
}

// --- Suspense Helper ---------------------------------------------------

export function defineSuspense(
  content: ComponentDefinition,
  fallback: ComponentDefinition,
): ComponentDefinition {
  return {
    __isTWComponent: true,
    name: "suspense",
    options: { name: "suspense" },
    create(props: Record<string, unknown> = {}) {
      // In a full implementation this would track async state
      return content.create(props);
    },
  };
}

// --- Memo Helper -------------------------------------------------------

export function memo(
  component: ComponentDefinition,
  compare?: (oldProps: Record<string, unknown>, newProps: Record<string, unknown>) => boolean,
): ComponentDefinition {
  let lastProps: Record<string, unknown> | null = null;
  let lastInstance: import("./types").ComponentInstance | null = null;

  const defaultCompare = (a: Record<string, unknown>, b: Record<string, unknown>): boolean => {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) => a[k] === b[k]);
  };

  return {
    ...component,
    create(props: Record<string, unknown> = {}) {
      const shouldReuse = lastInstance && lastProps && (compare ?? defaultCompare)(lastProps, props);
      if (shouldReuse) {
        return lastInstance!;
      }
      lastProps = { ...props };
      lastInstance = component.create(props);
      return lastInstance;
    },
  };
}

// --- Global State (for createRouter integration) ----------------------

export interface SDKRouter {
  push(path: string): void;
  replace(path: string): void;
  back(): void;
  forward(): void;
  get current(): string;
  onNavigate(callback: (path: string) => void): () => void;
}

export function createRouter(routes?: RouteDefinition[]): SDKRouter {
  let currentPath = typeof window !== "undefined" ? window.location.pathname : "/";
  const listeners = new Set<(path: string) => void>();

  const navigate = (path: string, replace: boolean = false) => {
    if (typeof window !== "undefined") {
      if (replace) {
        window.history.replaceState({}, "", path);
      } else {
        window.history.pushState({}, "", path);
      }
    }
    currentPath = path;
    for (const listener of listeners) {
      listener(path);
    }
  };

  // Listen to popstate events (back/forward navigation)
  if (typeof window !== "undefined") {
    window.addEventListener("popstate", () => {
      currentPath = window.location.pathname;
      for (const listener of listeners) {
        listener(currentPath);
      }
    });
  }

  return {
    push(path: string) { navigate(path, false); },
    replace(path: string) { navigate(path, true); },
    back() { if (typeof window !== "undefined") window.history.back(); },
    forward() { if (typeof window !== "undefined") window.history.forward(); },
    get current() { return currentPath; },
    onNavigate(callback: (path: string) => void) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
  };
}
