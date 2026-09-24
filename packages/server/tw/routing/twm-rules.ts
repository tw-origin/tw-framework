/**
 * TWM Rule DSL — the `rule "name" { ... }` middleware format.
 *
 * middleware.twm can be written either as a JS module (exported middleware
 * function) or as the declarative rule DSL documented in docs/middleware.md.
 * This module parses and evaluates the rule form:
 *
 *   rule "blocked-bots" {
 *     match "/**"
 *     user_agent { block ["curl/"] empty_is_blocked false }
 *     response { status 403 html "<h1>403</h1>" }
 *   }
 *
 * Rules evaluate in file order; the first rule whose path matches AND whose
 * condition blocks all pass produces its response. No match -> null (the
 * request continues to normal routing).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

// --- Types --------------------------------------------------------------------

export interface UserAgentCond {
  allow?: string[];
  block?: string[];
  emptyIsBlocked?: boolean;
}

export interface PathCond {
  prefixes?: string[];
  contains?: string[];
  extensions?: string[];
  denyTraversal?: boolean;
  denyNullBytes?: boolean;
}

export interface AuthCond {
  cookie?: string;
  jwtSecretEnv?: string;
}

export interface RateLimitCond {
  requests?: number;
  window?: number;
  identity?: "path" | "ip";
}

export interface OriginCond {
  allow?: string[];
  require?: boolean;
  allowReferer?: boolean;
}

export interface RuleResponse {
  status: number;
  json?: any;
  html?: string;
  text?: string;
}

export interface MiddlewareRule {
  name: string;
  match: string;
  userAgent?: UserAgentCond;
  path?: PathCond;
  auth?: AuthCond;
  rateLimit?: RateLimitCond;
  origin?: OriginCond;
  methods?: string[];
  response?: RuleResponse;
}

// --- Detection ------------------------------------------------------------------

/** Does this .twm source use the rule DSL (vs a JS module)? */
export function isRuleDsl(source: string): boolean {
  const stripped = source
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, "").trim())
    .filter((l) => l.length > 0)
    .join("\n");
  return stripped.startsWith('rule "') || stripped.startsWith("rule '");
}

// --- Tokenizer -------------------------------------------------------------------

type Tok = { t: "str" | "num" | "ident" | "punc"; v: string };

function tokenize(src: string, file: string): Tok[] {
  const toks: Tok[] = [];
  const s = src;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    // Comments are stripped OUTSIDE strings only — URLs inside strings
    // (https://…) must survive.
    if (c === "/" && s[i + 1] === "/") {
      while (i < s.length && s[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && s[i + 1] === "*") {
      i += 2;
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let out = "";
      while (j < s.length && s[j] !== c) {
        if (s[j] === "\\") { out += s[j + 1] ?? ""; j += 2; }
        else { out += s[j]; j++; }
      }
      if (j >= s.length) throw new Error(`${file}: unterminated string at offset ${i}`);
      toks.push({ t: "str", v: out });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      toks.push({ t: "num", v: s.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
      toks.push({ t: "ident", v: s.slice(i, j) });
      i = j;
      continue;
    }
    if ("{}[],".includes(c)) {
      toks.push({ t: "punc", v: c });
      i++;
      continue;
    }
    throw new Error(`${file}: unexpected character '${c}' at offset ${i}`);
  }
  return toks;
}

// --- Parser -----------------------------------------------------------------------

class Parser {
  private pos = 0;
  constructor(private toks: Tok[], private file: string) {}

  private peek(): Tok | undefined { return this.toks[this.pos]; }
  private next(): Tok | undefined { return this.toks[this.pos++]; }
  private expectPunc(v: string): void {
    const t = this.next();
    if (!t || t.t !== "punc" || t.v !== v) {
      throw new Error(`${this.file}: expected '${v}' but got ${t ? JSON.stringify(t.v) : "end of file"}`);
    }
  }
  private expectIdent(v?: string): string {
    const t = this.next();
    if (!t || t.t !== "ident" || (v && t.v !== v)) {
      throw new Error(`${this.file}: expected ${v ? `'${v}'` : "an identifier"} but got ${t ? JSON.stringify(t.v) : "end of file"}`);
    }
    return t.v;
  }
  private expectString(): string {
    const t = this.next();
    if (!t || t.t !== "str") {
      throw new Error(`${this.file}: expected a string but got ${t ? JSON.stringify(t.v) : "end of file"}`);
    }
    return t.v;
  }
  private strArray(): string[] {
    this.expectPunc("[");
    const out: string[] = [];
    while (this.peek() && this.peek()!.v !== "]") {
      out.push(this.expectString());
      if (this.peek()?.v === ",") this.next();
    }
    this.expectPunc("]");
    return out;
  }
  private value(): any {
    const t = this.peek();
    if (!t) throw new Error(`${this.file}: expected a value`);
    if (t.v === "[") return this.strArray();
    this.pos++;
    if (t.t === "str") return t.v;
    if (t.t === "num") return Number(t.v);
    if (t.t === "ident" && t.v === "true") return true;
    if (t.t === "ident" && t.v === "false") return false;
    throw new Error(`${this.file}: unexpected value ${JSON.stringify(t.v)}`);
  }
  /** Parse `key value` pairs (and one inline `json { ... }` object) until `}`. */
  private fields(allowJsonBlock = false): Record<string, any> {
    this.expectPunc("{");
    const out: Record<string, any> = {};
    while (this.peek() && this.peek()!.v !== "}") {
      if (this.peek()!.v === ",") { this.pos++; continue; } // optional separators
      const key = this.expectIdent();
      if (allowJsonBlock && key === "json" && this.peek()?.v === "{") {
        out.json = this.jsonObject();
      } else {
        out[key] = this.value();
      }
    }
    this.expectPunc("}");
    return out;
  }
  /** `json { error "msg" }` — string/number/bool values only. */
  private jsonObject(): Record<string, any> {
    this.expectPunc("{");
    const out: Record<string, any> = {};
    while (this.peek() && this.peek()!.v !== "}") {
      if (this.peek()!.v === ",") { this.pos++; continue; } // optional separators
      const key = this.expectIdent();
      out[key] = this.value();
    }
    this.expectPunc("}");
    return out;
  }

  /** Array-or-undefined with a clear error for wrong types. */
  private strArrayField(rule: string, block: string, key: string, v: any): string[] | undefined {
    if (v === undefined) return undefined;
    if (!Array.isArray(v) || v.some((x: any) => typeof x !== "string")) {
      throw new Error(`${this.file}: '${key}' in '${block}' of rule "${rule}" must be a string array like ["a", "b"]`);
    }
    return v;
  }

  private numField(rule: string, block: string, key: string, v: any): number | undefined {
    if (v === undefined) return undefined;
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new Error(`${this.file}: '${key}' in '${block}' of rule "${rule}" must be a number`);
    }
    return v;
  }

  parseRules(): MiddlewareRule[] {
    const rules: MiddlewareRule[] = [];
    while (this.peek()) {
      this.expectIdent("rule");
      const name = this.expectString();
      this.expectPunc("{");
      const rule: MiddlewareRule = { name, match: "/**" };
      while (this.peek() && this.peek()!.v !== "}") {
        const key = this.expectIdent();
        switch (key) {
          case "match":
            rule.match = this.expectString();
            break;
          case "user_agent": {
            const f = this.fields();
            rule.userAgent = {
              allow: this.strArrayField(name, "user_agent", "allow", f.allow),
              block: this.strArrayField(name, "user_agent", "block", f.block),
              emptyIsBlocked: f.empty_is_blocked === true,
            };
            break;
          }
          case "path": {
            const f = this.fields();
            rule.path = {
              prefixes: this.strArrayField(name, "path", "prefixes", f.prefixes),
              contains: this.strArrayField(name, "path", "contains", f.contains),
              extensions: this.strArrayField(name, "path", "extensions", f.extensions),
              denyTraversal: f.deny_traversal === true,
              denyNullBytes: f.deny_null_bytes === true,
            };
            break;
          }
          case "auth": {
            const f = this.fields();
            rule.auth = { cookie: f.cookie, jwtSecretEnv: f.jwt_secret_env };
            break;
          }
          case "rate_limit": {
            const f = this.fields();
            rule.rateLimit = {
              requests: this.numField(name, "rate_limit", "requests", f.requests),
              window: this.numField(name, "rate_limit", "window", f.window),
              identity: f.identity === "ip" ? "ip" : "path",
            };
            break;
          }
          case "origin": {
            const f = this.fields();
            rule.origin = {
              allow: this.strArrayField(name, "origin", "allow", f.allow),
              require: f.require === true,
              allowReferer: f.allow_referer === true,
            };
            break;
          }
          case "methods":
            rule.methods = this.strArray().map((m) => m.toUpperCase());
            break;
          case "response": {
            const f = this.fields(true);
            const status = this.numField(name, "response", "status", f.status);
            const bodyForms = [f.json, f.html, f.text].filter((v) => v !== undefined);
            if (bodyForms.length > 1) {
              throw new Error(`${this.file}: rule "${name}" response has multiple body forms (json/html/text) — pick one`);
            }
            rule.response = {
              status: status ?? 403,
              json: f.json, html: f.html, text: f.text,
            };
            break;
          }
          default:
            throw new Error(`${this.file}: unknown rule section '${key}' in rule "${name}"`);
        }
      }
      this.expectPunc("}");
      if (!rule.response) {
        throw new Error(`${this.file}: rule "${name}" has no response block`);
      }
      rules.push(rule);
    }
    return rules;
  }
}

export function parseRules(source: string, file = "middleware.twm"): MiddlewareRule[] {
  return new Parser(tokenize(source, file), file).parseRules();
}

// --- Rate limit state (in-memory, per process) -------------------------------------
// Stale buckets are swept on each rule evaluation: with identity "path" an
// attacker can hit unlimited unique paths, so unbounded growth must be pruned.

const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const RATE_BUCKETS_MAX = 10_000;

function sweepRateBuckets(now: number): void {
  if (rateBuckets.size <= RATE_BUCKETS_MAX) {
    for (const [k, b] of rateBuckets) {
      if (b.resetAt <= now) rateBuckets.delete(k);
    }
    return;
  }
  // Over the cap: keep only live buckets, evicting oldest-first.
  const live = [...rateBuckets.entries()].filter(([, b]) => b.resetAt > now);
  live.sort((a, b) => a[1].resetAt - b[1].resetAt);
  rateBuckets.clear();
  for (const [k, b] of live.slice(live.length - RATE_BUCKETS_MAX)) {
    rateBuckets.set(k, b);
  }
}

// --- JWT (HS256 verify only — signing belongs to your app) --------------------------

function b64urlDecode(s: string): Buffer {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function verifyJwt_hs256(token: string, secret: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [h, p, sig] = parts;
  let header: any, payload: any;
  try {
    header = JSON.parse(b64urlDecode(h).toString("utf-8"));
    payload = JSON.parse(b64urlDecode(p).toString("utf-8"));
  } catch { return false; }
  if (header?.alg !== "HS256") return false;
  const expected = createHmac("sha256", secret).update(`${h}.${p}`).digest();
  let got: Buffer;
  try { got = b64urlDecode(sig); } catch { return false; }
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return false;
  if (typeof payload?.exp === "number" && payload.exp * 1000 < Date.now()) return false;
  return true;
}

// --- Evaluation ----------------------------------------------------------------------

function matchPath(pattern: string, pathname: string): boolean {
  // Round 4: normalize -- percent-decode and drop the trailing slash so
  // a rule for "/blog" matches "/blog/" and encoded paths match too.
  const norm = (p: string): string => {
    let x = p;
    try { x = decodeURIComponent(x); } catch { /* keep raw */ }
    if (x.length > 1 && x.endsWith("/")) x = x.slice(0, -1);
    return x;
  };
  const pat = norm(pattern);
  const path = norm(pathname);
  if (pat === "/**") return true;
  if (pat === "/*") return path === "" || path === "/";
  if (pat.endsWith("/**")) {
    const prefix = pat.slice(0, -3);
    return path === prefix || path.startsWith(prefix + "/");
  }
  if (pat.endsWith("/*")) {
    // `/*` is a SINGLE-SEGMENT wildcard: /blog/* matches /blog/x but
    // NOT /blog/x/y (that is what /** is for). The old code treated
    // both identically.
    const prefix = pat.slice(0, -2);
    if (!path.startsWith(prefix + "/")) return path === prefix;
    const rest = path.slice(prefix.length + 1);
    return !rest.includes("/");
  }
  return path === pat;
}

function ruleBlocked(rule: MiddlewareRule, request: Request, pathname: string): boolean {
  const headers = request.headers;

  // user_agent: block-list substring match; allow-list wins; empty handling.
  if (rule.userAgent) {
    const ua = (headers.get("user-agent") ?? "").toLowerCase();
    if (!ua) {
      if (rule.userAgent.emptyIsBlocked) return true;
    } else {
      const blocked = (rule.userAgent.block ?? []).some((b) => b.toLowerCase() && ua.includes(b.toLowerCase()));
      const allowed = (rule.userAgent.allow ?? []).some((a) => ua.includes(a.toLowerCase()));
      if (blocked && !allowed) return true;
    }
  }

  // path conditions
  if (rule.path) {
    const p = rule.path;
    if ((p.prefixes ?? []).some((x) => pathname === x || pathname.startsWith(x.endsWith("/") ? x : x + "/"))) return true;
    if ((p.contains ?? []).some((x) => pathname.includes(x))) return true;
    if ((p.extensions ?? []).some((x) => pathname.toLowerCase().endsWith(x.startsWith(".") ? x.toLowerCase() : "." + x.toLowerCase()))) return true;
    if (p.denyTraversal && (pathname.includes("..") || pathname.toLowerCase().includes("%2e%2e"))) return true;
    if (p.denyNullBytes && (pathname.includes("\0") || pathname.toLowerCase().includes("%00"))) return true;
  }

  // auth: verified JWT in a cookie
  if (rule.auth) {
    const cookieName = rule.auth.cookie ?? "token";
    const cookieHeader = headers.get("cookie") ?? "";
    const escaped = cookieName.replace(/[.*+?^${}()|[\\\\]/g, "\\$&");
    const m = new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`).exec(cookieHeader);
    const token = m ? m[1].trim() : "";
    const secret = rule.auth.jwtSecretEnv ? (process.env[rule.auth.jwtSecretEnv] ?? "") : "";
    if (!token || !secret || !verifyJwt_hs256(token, secret)) return true;
  }

  // rate_limit: fixed window, per identity bucket
  if (rule.rateLimit) {
    const rl = rule.rateLimit;
    const max = rl.requests ?? 60;
    const windowMs = (rl.window ?? 60) * 1000;
    const id = rl.identity === "ip"
      ? ((headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local")
      : pathname;
    const key = `${rule.name}:${id}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    } else if (++bucket.count > max) {
      return true;
    }
  }

  // origin / referer
  if (rule.origin) {
    const o = rule.origin;
    let origin = headers.get("origin") ?? "";
    if (!origin && o.allowReferer) origin = headers.get("referer") ?? "";
    if (!origin) {
      if (o.require) return true;
    } else {
      const originRoot = origin.replace(/\/$/, "");
      if (!(o.allow ?? []).some((a) => originRoot === a.replace(/\/$/, ""))) return true;
    }
  }

  // methods
  if (rule.methods && !rule.methods.includes((request.method ?? "GET").toUpperCase())) {
    return true;
  }

  return false;
}

/**
 * CORS headers a matched origin-rule grants to an ALLOWED origin.
 * `origin allow [...]` is access control (deny side: the rule's response);
 * the allow side emits real CORS headers so browsers can read the response:
 *   - allowed origin on a normal request  -> Access-Control-Allow-Origin
 *   - allowed origin on an OPTIONS preflight -> full preflight answer
 */
export function corsHeadersFor(rules: MiddlewareRule[], request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin) return {};
  let pathname = "/";
  try { pathname = new URL(request.url).pathname; } catch { /* keep "/" */ }

  for (const rule of rules) {
    if (!rule.origin) continue;
    if (!matchPath(rule.match, pathname)) continue;
    const o = rule.origin;
    let effective = origin;
    if (!effective && o.allowReferer) effective = request.headers.get("referer") ?? "";
    const allowed = (o.allow ?? []).some((a) => effective.replace(/\/$/, "") === a.replace(/\/$/, ""));
    if (!allowed) continue;

    const headers: Record<string, string> = {
      "Access-Control-Allow-Origin": origin,
      "Vary": "Origin",
    };
    const isPreflight = (request.method ?? "").toUpperCase() === "OPTIONS"
      && !!request.headers.get("access-control-request-method");
    if (isPreflight) {
      const method = request.headers.get("access-control-request-method")!.toUpperCase();
      // Honour the rule's methods filter; default to the standard verb set.
      headers["Access-Control-Allow-Methods"] = rule.methods?.length
        ? rule.methods.join(", ")
        : [method, "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].join(", ");
      const reqHeaders = request.headers.get("access-control-request-headers");
      if (reqHeaders) headers["Access-Control-Allow-Headers"] = reqHeaders;
      headers["Access-Control-Max-Age"] = "600";
    }
    return headers;
  }
  return {};
}

/**
 * Evaluate rules against a request. Returns a Response when a rule blocks,
 * null when the request may continue.
 */
export function evaluateRules(rules: MiddlewareRule[], request: Request): Response | null {
  let pathname = "/";
  try { pathname = new URL(request.url).pathname; } catch { /* keep "/" */ }
  sweepRateBuckets(Date.now());

  for (const rule of rules) {
    if (!matchPath(rule.match, pathname)) continue;
    if (!ruleBlocked(rule, request, pathname)) continue;

    const r = rule.response!;
    const headers: Record<string, string> = { "X-TW-Middleware": rule.name };
    if (!Number.isFinite(r.status) || r.status < 100 || r.status > 599) {
      console.error(`[twm-rules] rule "${rule.name}" has invalid status ${r.status}; using 500`);
    }
    let body: string | null = null;
    if (r.json !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(r.json);
    } else if (r.html !== undefined) {
      headers["content-type"] = "text/html; charset=utf-8";
      body = r.html;
    } else if (r.text !== undefined) {
      headers["content-type"] = "text/plain; charset=utf-8";
      body = r.text;
    }
    return new Response(body, {
      status: Number.isFinite(r.status) && r.status >= 100 && r.status <= 599 ? r.status : 500,
      headers,
    });
  }
  return null;
}
