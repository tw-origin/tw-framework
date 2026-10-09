/**
 * TW response helpers (docs/response-helpers.md).
 *
 * In `@tw/shared` so `@tw/server` -- and the user-facing `"tw"` specifier --
 * reach them: `import { redirect } from "tw"`.
 */

export interface RedirectOptions {
  /** 308 instead of 307 -- a permanent move. */
  permanent?: boolean;
  /** Explicit status; overrides `permanent`. */
  status?: number;
  /**
   * Carry the incoming query string onto the target. Pass the request (or its
   * URL) so we know what to carry.
   */
  preserveQuery?: boolean | Request | string;
  /** Append a fragment. */
  hash?: string;
}

/**
 * A header value must not contain CR or LF -- that is header injection.
 * We strip them rather than throw, so a bad target degrades to a safe redirect
 * instead of taking the request down.
 */
function safeHeader(value: string): string {
  return String(value).replace(/[\r\n\u0000]/g, "");
}

const REDIRECT_PERMANENT = 308;
const REDIRECT_TEMPORARY = 307;

function queryOf(source: boolean | Request | string | undefined): string {
  if (!source) return "";
  let url: URL | undefined;
  if (source instanceof Request) url = new URL(source.url);
  else if (typeof source === "string") { try { url = new URL(source, "http://x"); } catch { return ""; } }
  if (!url || !url.search) return "";
  return url.search.startsWith("?") ? url.search.slice(1) : url.search;
}

/**
 * Redirect to `to`. Temporary (307) unless you say otherwise.
 *
 * `preserveQuery: req` is the bit everyone hand-rolls -- it carries the
 * incoming query string onto the target.
 */
export function redirect(to: string, opts: RedirectOptions = {}): Response {
  const status = opts.status ?? (opts.permanent ? REDIRECT_PERMANENT : REDIRECT_TEMPORARY);

  let target = to;
  const carried = opts.preserveQuery ? queryOf(opts.preserveQuery) : "";
  if (carried) {
    target += (target.includes("?") ? "&" : "?") + carried;
  }
  if (opts.hash) {
    target += opts.hash.startsWith("#") ? opts.hash : "#" + opts.hash;
  }

  return new Response(null, { status, headers: { location: safeHeader(target) } });
}

/** A permanent (308) redirect. */
export function permanentRedirect(to: string, opts: Omit<RedirectOptions, "permanent"> = {}): Response {
  return redirect(to, { ...opts, permanent: true });
}

export interface ErrorPageOptions {
  /** Rendered by a boundary template when one exists. */
  boundary?: string;
  /** Extra headers. */
  headers?: Record<string, string>;
  /** Content type for the inline body. */
  contentType?: string;
}

function bodyFor(status: number, message: string, contentType: string): BodyInit {
  if (contentType.includes("json")) return JSON.stringify({ error: message, status });
  return `<!doctype html><meta charset="utf-8"><title>${status}</title><h1>${status}</h1><p>${message}</p>`;
}

/**
 * 403 -- the caller is known but not allowed.
 *
 * `reason` is for you and your logs; it is not sent to the client unless
 * `expose` is set, so you never leak why something was refused.
 */
export function forbidden(
  reason = "Forbidden",
  opts: ErrorPageOptions & { expose?: boolean } = {},
): Response {
  const contentType = opts.contentType ?? "text/html; charset=utf-8";
  const message = opts.expose ? reason : "Forbidden";
  return new Response(bodyFor(403, message, contentType), {
    status: 403,
    headers: { "content-type": contentType, ...(opts.headers ?? {}) },
  });
}

export interface UnauthorizedOptions extends ErrorPageOptions {
  /** Auth scheme for the challenge, e.g. "Bearer" or "Basic". */
  scheme?: string;
  /** Realm for Basic challenges. */
  realm?: string;
  /** Set when the scheme uses a charset (Basic). */
  charset?: "UTF-8";
  /** Extra params appended to the challenge, e.g. { error: "invalid_token" }. */
  params?: Record<string, string>;
}

/**
 * 401 -- the caller is not authenticated, with a correct `WWW-Authenticate`.
 *
 * Next renders an `unauthorized.tsx` and leaves the header to you. A 401
 * without a challenge is a protocol bug, so we build it for you.
 */
export function unauthorized(opts: UnauthorizedOptions = {}): Response {
  const contentType = opts.contentType ?? "text/html; charset=utf-8";
  const headers: Record<string, string> = { "content-type": contentType, ...(opts.headers ?? {}) };

  const scheme = opts.scheme ?? "Bearer";
  const parts: string[] = [];
  if (opts.realm !== undefined) parts.push(`realm="${safeHeader(opts.realm).replace(/"/g, "")}"`);
  if (opts.charset) parts.push(`charset="${opts.charset}"`);
  for (const [k, v] of Object.entries(opts.params ?? {})) parts.push(`${k}="${safeHeader(v).replace(/"/g, "")}"`);
  headers["www-authenticate"] = safeHeader(parts.length ? `${scheme} ${parts.join(", ")}` : scheme);

  return new Response(bodyFor(401, "Unauthorized", contentType), { status: 401, headers });
}

/** 404 -- route-level, with the same optional-boundary shape. */
export function notFound(opts: ErrorPageOptions = {}): Response {
  const contentType = opts.contentType ?? "text/html; charset=utf-8";
  return new Response(bodyFor(404, "Not found", contentType), {
    status: 404,
    headers: { "content-type": contentType, ...(opts.headers ?? {}) },
  });
}

/** 400 with a message you do want the client to see. */
export function badRequest(message = "Bad request", opts: ErrorPageOptions = {}): Response {
  const contentType = opts.contentType ?? "application/json; charset=utf-8";
  return new Response(bodyFor(400, message, contentType), {
    status: 400,
    headers: { "content-type": contentType, ...(opts.headers ?? {}) },
  });
}

/** A JSON response, with the content type already set. */
export function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}
