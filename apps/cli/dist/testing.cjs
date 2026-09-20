var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// packages/server/tw/routing/revalidate.ts
function revalidatePath(pathname, opts) {
  return activePipeline ? activePipeline.revalidatePath(pathname, opts) : 0;
}
var activePipeline;
var init_revalidate = __esm({
  "packages/server/tw/routing/revalidate.ts"() {
    activePipeline = null;
  }
});

// packages/server/tw/routing/signal-stream.ts
function getSignalHub() {
  if (!hub) hub = new SignalHub();
  return hub;
}
function setSignal(name, value, opts) {
  let session = opts?.session;
  if (!session && opts?.request) {
    try {
      const cookies = opts.request.cookies;
      if (cookies && typeof cookies.get === "function") {
        session = cookies.get("tw_session") ?? void 0;
      } else {
        const header = opts.request.headers?.get?.("cookie") ?? "";
        const m = /(?:^|;\s*)tw_session=([^;]+)/.exec(header);
        if (m) session = decodeURIComponent(m[1].trim().replace(/^"|"$/g, ""));
      }
    } catch {
    }
  }
  return getSignalHub().setSignal(name, value, session ? { session } : void 0);
}
var BATCH_MS, HISTORY_LIMIT, SignalHub, hub;
var init_signal_stream = __esm({
  "packages/server/tw/routing/signal-stream.ts"() {
    BATCH_MS = 100;
    HISTORY_LIMIT = 1e3;
    SignalHub = class {
      clients = /* @__PURE__ */ new Map();
      nextClientId = 1;
      seq = 0;
      values = /* @__PURE__ */ new Map();
      kinds = /* @__PURE__ */ new Map();
      history = [];
      pending = /* @__PURE__ */ new Map();
      pendingSession;
      timer = null;
      /**
       * Server-side mutation (route handlers): queue an update, batch-flush.
       * With `session` (derived from the request's tw_session cookie) private
       * signals are delivered only to clients authenticated as that session.
       */
      setSignal(name, value, opts) {
        const kind = this.kinds.get(name) ?? "public";
        this.values.set(name, value);
        this.kinds.set(name, kind);
        this.pending.set(name, value);
        if (opts?.session) this.pendingSession = opts.session;
        if (this.timer == null) {
          this.timer = setTimeout(() => this.flush(), BATCH_MS);
        }
        return { queued: true, kind };
      }
      /** Latest known values (also used for fresh snapshots). */
      snapshot() {
        return { seq: this.seq, snapshot: Object.fromEntries(this.values) };
      }
      register(declared, session) {
        const id = this.nextClientId++;
        for (const [name, kind] of declared) {
          if (!this.kinds.has(name)) this.kinds.set(name, kind);
        }
        const client = {
          id,
          declared,
          session,
          send: () => {
          },
          close: () => this.clients.delete(id)
        };
        this.clients.set(id, client);
        return client;
      }
      /** Build the replay/snapshot preamble for a connecting client. */
      connectPayloads(since, declared, session) {
        const out = [];
        const hasCoverage = since <= this.seq && this.history.length > 0 && since >= this.history[0].seq - 1;
        if (hasCoverage) {
          for (const entry of this.history) {
            if (entry.seq > since && this.sessionMatches(session, entry) && this.deliversTo(declared, entry.names)) {
              out.push(entry.payload);
            }
          }
        } else if (this.values.size > 0) {
          const snap = {};
          for (const [name, value] of this.values) {
            if (this.sessionMatches(session, { names: [name], session: this.valueSessions.get(name) }) && this.deliversTo(declared, [name])) snap[name] = value;
          }
          if (Object.keys(snap).length > 0) {
            out.push(this.frame({ v: 1, seq: this.seq, snapshot: snap }));
          }
        }
        return out;
      }
      /** latest-known session per signal (for snapshot filtering) */
      valueSessions = /* @__PURE__ */ new Map();
      sessionMatches(clientSession, entry) {
        if (!entry.session) return true;
        return entry.session === clientSession;
      }
      deliversTo(declared, names) {
        return names.some((n) => {
          const kind = this.kinds.get(n) ?? "public";
          return kind === "public" || declared.has(n);
        });
      }
      flush() {
        this.timer = null;
        if (this.pending.size === 0) return;
        const updates = [...this.pending.entries()];
        const session = this.pendingSession;
        this.pending.clear();
        this.pendingSession = void 0;
        this.seq++;
        const names = updates.map(([n]) => n);
        for (const [n] of updates) this.valueSessions.set(n, session);
        const payload = this.frame({ v: 1, seq: this.seq, updates });
        this.history.push({ seq: this.seq, payload, names, session });
        if (this.history.length > HISTORY_LIMIT) this.history.shift();
        for (const client of this.clients.values()) {
          if (this.sessionMatches(client.session, { names, session }) && this.deliversTo(client.declared, names)) client.send(payload);
        }
      }
      frame(obj) {
        return JSON.stringify(obj).replace(/</g, "\\u003c");
      }
    };
    hub = null;
  }
});

// packages/server/tw/routing/twm-rules.ts
var twm_rules_exports = {};
__export(twm_rules_exports, {
  corsHeadersFor: () => corsHeadersFor,
  evaluateRules: () => evaluateRules,
  isRuleDsl: () => isRuleDsl,
  parseRules: () => parseRules
});
function isRuleDsl(source) {
  const stripped = source.split("\n").map((l) => l.replace(/\/\/.*$/, "").trim()).filter((l) => l.length > 0).join("\n");
  return stripped.startsWith('rule "') || stripped.startsWith("rule '");
}
function tokenize(src, file) {
  const toks = [];
  const s = src;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
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
        if (s[j] === "\\") {
          out += s[j + 1] ?? "";
          j += 2;
        } else {
          out += s[j];
          j++;
        }
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
function parseRules(source, file = "middleware.twm") {
  return new Parser(tokenize(source, file), file).parseRules();
}
function sweepRateBuckets(now) {
  if (rateBuckets.size <= RATE_BUCKETS_MAX) {
    for (const [k, b] of rateBuckets) {
      if (b.resetAt <= now) rateBuckets.delete(k);
    }
    return;
  }
  const live = [...rateBuckets.entries()].filter(([, b]) => b.resetAt > now);
  live.sort((a, b) => a[1].resetAt - b[1].resetAt);
  rateBuckets.clear();
  for (const [k, b] of live.slice(live.length - RATE_BUCKETS_MAX)) {
    rateBuckets.set(k, b);
  }
}
function b64urlDecode(s) {
  const pad = "=".repeat((4 - s.length % 4) % 4);
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}
function verifyJwt_hs256(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [h, p, sig] = parts;
  let header, payload;
  try {
    header = JSON.parse(b64urlDecode(h).toString("utf-8"));
    payload = JSON.parse(b64urlDecode(p).toString("utf-8"));
  } catch {
    return false;
  }
  if (header?.alg !== "HS256") return false;
  const expected = (0, import_node_crypto.createHmac)("sha256", secret).update(`${h}.${p}`).digest();
  let got;
  try {
    got = b64urlDecode(sig);
  } catch {
    return false;
  }
  if (expected.length !== got.length || !(0, import_node_crypto.timingSafeEqual)(expected, got)) return false;
  if (typeof payload?.exp === "number" && payload.exp * 1e3 < Date.now()) return false;
  return true;
}
function matchPath(pattern, pathname) {
  if (pattern === "/**" || pattern === "/*") return true;
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return pathname === prefix || pathname.startsWith(prefix + "/");
  }
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -2);
    return pathname === prefix || pathname.startsWith(prefix + "/");
  }
  return pathname === pattern;
}
function ruleBlocked(rule, request, pathname) {
  const headers = request.headers;
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
  if (rule.path) {
    const p = rule.path;
    if ((p.prefixes ?? []).some((x) => pathname === x || pathname.startsWith(x.endsWith("/") ? x : x + "/"))) return true;
    if ((p.contains ?? []).some((x) => pathname.includes(x))) return true;
    if ((p.extensions ?? []).some((x) => pathname.toLowerCase().endsWith(x.startsWith(".") ? x.toLowerCase() : "." + x.toLowerCase()))) return true;
    if (p.denyTraversal && (pathname.includes("..") || pathname.toLowerCase().includes("%2e%2e"))) return true;
    if (p.denyNullBytes && (pathname.includes("\0") || pathname.toLowerCase().includes("%00"))) return true;
  }
  if (rule.auth) {
    const cookieName = rule.auth.cookie ?? "token";
    const cookieHeader = headers.get("cookie") ?? "";
    const escaped = cookieName.replace(/[.*+?^${}()|[\\\\]/g, "\\$&");
    const m = new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`).exec(cookieHeader);
    const token = m ? m[1].trim() : "";
    const secret = rule.auth.jwtSecretEnv ? process.env[rule.auth.jwtSecretEnv] ?? "" : "";
    if (!token || !secret || !verifyJwt_hs256(token, secret)) return true;
  }
  if (rule.rateLimit) {
    const rl = rule.rateLimit;
    const max = rl.requests ?? 60;
    const windowMs = (rl.window ?? 60) * 1e3;
    const id = rl.identity === "ip" ? (headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local" : pathname;
    const key = `${rule.name}:${id}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    } else if (++bucket.count > max) {
      return true;
    }
  }
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
  if (rule.methods && !rule.methods.includes((request.method ?? "GET").toUpperCase())) {
    return true;
  }
  return false;
}
function corsHeadersFor(rules, request) {
  const origin = request.headers.get("origin");
  if (!origin) return {};
  let pathname = "/";
  try {
    pathname = new URL(request.url).pathname;
  } catch {
  }
  for (const rule of rules) {
    if (!rule.origin) continue;
    if (!matchPath(rule.match, pathname)) continue;
    const o = rule.origin;
    let effective = origin;
    if (!effective && o.allowReferer) effective = request.headers.get("referer") ?? "";
    const allowed = (o.allow ?? []).some((a) => effective.replace(/\/$/, "") === a.replace(/\/$/, ""));
    if (!allowed) continue;
    const headers = {
      "Access-Control-Allow-Origin": origin,
      "Vary": "Origin"
    };
    const isPreflight = (request.method ?? "").toUpperCase() === "OPTIONS" && !!request.headers.get("access-control-request-method");
    if (isPreflight) {
      const method = request.headers.get("access-control-request-method").toUpperCase();
      headers["Access-Control-Allow-Methods"] = rule.methods?.length ? rule.methods.join(", ") : [method, "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].join(", ");
      const reqHeaders = request.headers.get("access-control-request-headers");
      if (reqHeaders) headers["Access-Control-Allow-Headers"] = reqHeaders;
      headers["Access-Control-Max-Age"] = "600";
    }
    return headers;
  }
  return {};
}
function evaluateRules(rules, request) {
  let pathname = "/";
  try {
    pathname = new URL(request.url).pathname;
  } catch {
  }
  sweepRateBuckets(Date.now());
  for (const rule of rules) {
    if (!matchPath(rule.match, pathname)) continue;
    if (!ruleBlocked(rule, request, pathname)) continue;
    const r = rule.response;
    const headers = { "X-TW-Middleware": rule.name };
    if (!Number.isFinite(r.status) || r.status < 100 || r.status > 599) {
      console.error(`[twm-rules] rule "${rule.name}" has invalid status ${r.status}; using 500`);
    }
    let body = null;
    if (r.json !== void 0) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(r.json);
    } else if (r.html !== void 0) {
      headers["content-type"] = "text/html; charset=utf-8";
      body = r.html;
    } else if (r.text !== void 0) {
      headers["content-type"] = "text/plain; charset=utf-8";
      body = r.text;
    }
    return new Response(body, {
      status: Number.isFinite(r.status) && r.status >= 100 && r.status <= 599 ? r.status : 500,
      headers
    });
  }
  return null;
}
var import_node_crypto, Parser, rateBuckets, RATE_BUCKETS_MAX;
var init_twm_rules = __esm({
  "packages/server/tw/routing/twm-rules.ts"() {
    import_node_crypto = require("node:crypto");
    Parser = class {
      constructor(toks, file) {
        this.toks = toks;
        this.file = file;
      }
      pos = 0;
      peek() {
        return this.toks[this.pos];
      }
      next() {
        return this.toks[this.pos++];
      }
      expectPunc(v) {
        const t = this.next();
        if (!t || t.t !== "punc" || t.v !== v) {
          throw new Error(`${this.file}: expected '${v}' but got ${t ? JSON.stringify(t.v) : "end of file"}`);
        }
      }
      expectIdent(v) {
        const t = this.next();
        if (!t || t.t !== "ident" || v && t.v !== v) {
          throw new Error(`${this.file}: expected ${v ? `'${v}'` : "an identifier"} but got ${t ? JSON.stringify(t.v) : "end of file"}`);
        }
        return t.v;
      }
      expectString() {
        const t = this.next();
        if (!t || t.t !== "str") {
          throw new Error(`${this.file}: expected a string but got ${t ? JSON.stringify(t.v) : "end of file"}`);
        }
        return t.v;
      }
      strArray() {
        this.expectPunc("[");
        const out = [];
        while (this.peek() && this.peek().v !== "]") {
          out.push(this.expectString());
          if (this.peek()?.v === ",") this.next();
        }
        this.expectPunc("]");
        return out;
      }
      value() {
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
      fields(allowJsonBlock = false) {
        this.expectPunc("{");
        const out = {};
        while (this.peek() && this.peek().v !== "}") {
          if (this.peek().v === ",") {
            this.pos++;
            continue;
          }
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
      jsonObject() {
        this.expectPunc("{");
        const out = {};
        while (this.peek() && this.peek().v !== "}") {
          if (this.peek().v === ",") {
            this.pos++;
            continue;
          }
          const key = this.expectIdent();
          out[key] = this.value();
        }
        this.expectPunc("}");
        return out;
      }
      /** Array-or-undefined with a clear error for wrong types. */
      strArrayField(rule, block, key, v) {
        if (v === void 0) return void 0;
        if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
          throw new Error(`${this.file}: '${key}' in '${block}' of rule "${rule}" must be a string array like ["a", "b"]`);
        }
        return v;
      }
      numField(rule, block, key, v) {
        if (v === void 0) return void 0;
        if (typeof v !== "number" || !Number.isFinite(v)) {
          throw new Error(`${this.file}: '${key}' in '${block}' of rule "${rule}" must be a number`);
        }
        return v;
      }
      parseRules() {
        const rules = [];
        while (this.peek()) {
          this.expectIdent("rule");
          const name = this.expectString();
          this.expectPunc("{");
          const rule = { name, match: "/**" };
          while (this.peek() && this.peek().v !== "}") {
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
                  emptyIsBlocked: f.empty_is_blocked === true
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
                  denyNullBytes: f.deny_null_bytes === true
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
                  identity: f.identity === "ip" ? "ip" : "path"
                };
                break;
              }
              case "origin": {
                const f = this.fields();
                rule.origin = {
                  allow: this.strArrayField(name, "origin", "allow", f.allow),
                  require: f.require === true,
                  allowReferer: f.allow_referer === true
                };
                break;
              }
              case "methods":
                rule.methods = this.strArray().map((m) => m.toUpperCase());
                break;
              case "response": {
                const f = this.fields(true);
                const status = this.numField(name, "response", "status", f.status);
                const bodyForms = [f.json, f.html, f.text].filter((v) => v !== void 0);
                if (bodyForms.length > 1) {
                  throw new Error(`${this.file}: rule "${name}" response has multiple body forms (json/html/text) \u2014 pick one`);
                }
                rule.response = {
                  status: status ?? 403,
                  json: f.json,
                  html: f.html,
                  text: f.text
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
    };
    rateBuckets = /* @__PURE__ */ new Map();
    RATE_BUCKETS_MAX = 1e4;
  }
});

// packages/shared/tw/node-import.ts
var node_import_exports = {};
__export(node_import_exports, {
  twImportTs: () => twImportTs
});
async function twImportTs(tsPath) {
  if (!globalThis.__TW_NODE) {
    return import(tsPath);
  }
  const esbuildMain = globalThis.__TW_ESBUILD_MODULE;
  const esbuild = await (esbuildMain ? import(esbuildMain) : import("esbuild"));
  const safe = tsPath.replace(/[^a-zA-Z0-9]/g, "_").slice(-120);
  const cachePath = (0, import_node_path.join)((0, import_node_os.tmpdir)(), "tw-" + safe + ".mjs");
  await esbuild.build({
    entryPoints: [tsPath],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node18",
    outfile: cachePath,
    logLevel: "silent"
  });
  return import((0, import_node_url.pathToFileURL)(cachePath).href);
}
var import_node_path, import_node_os, import_node_url;
var init_node_import = __esm({
  "packages/shared/tw/node-import.ts"() {
    import_node_path = require("node:path");
    import_node_os = require("node:os");
    import_node_url = require("node:url");
  }
});

// packages/server/tw/routing/twm-loader.ts
var twm_loader_exports = {};
__export(twm_loader_exports, {
  clearRouteCache: () => clearRouteCache,
  clearTWMCache: () => clearTWMCache,
  executeMiddleware: () => executeMiddleware,
  executeRouteHandler: () => executeRouteHandler,
  loadTWMModule: () => loadTWMModule,
  revalidateRoute: () => revalidateRoute,
  shouldMatchMiddleware: () => shouldMatchMiddleware
});
function clearTWMCache() {
  moduleCache.clear();
}
async function loadLibModule(rootDir, name) {
  let rel = name.replace(/^@\//, "").replace(/^\.\//, "").replace(/^lib\//, "");
  const cacheKey = rootDir + "/" + rel;
  if (libCache.has(cacheKey)) return libCache.get(cacheKey);
  const libPath = (0, import_node_path2.join)(rootDir, "lib", rel + ".ts");
  if (!(0, import_node_fs.existsSync)(libPath)) {
    throw new Error("Module '" + name + "' not found. Create lib/" + name + ".ts");
  }
  try {
    const { twImportTs: twImportTs2 } = await Promise.resolve().then(() => (init_node_import(), node_import_exports));
    const mod = await twImportTs2(libPath);
    libCache.set(cacheKey, mod);
    return mod;
  } catch (e) {
    throw new Error("Failed to load lib/" + name + ".ts: " + e.message);
  }
}
function compileTwm(source) {
  const cleaned = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/gm, "");
  const importRegex = /import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];?/g;
  const codeWithoutImports = cleaned.replace(importRegex, "");
  return codeWithoutImports.replace(/\bexport\s+(?=(async\s+)?(function|const|let|var|class))/g, "").replace(/\bfn\s+delete\b/g, "function deleteFn").replace(/\bfn\s+/g, "function ");
}
function extractImports(source) {
  const cleaned = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/gm, "");
  const importRegex = /import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];?/g;
  const imports = [];
  let match;
  while ((match = importRegex.exec(cleaned)) !== null) {
    const names = match[1].split(",").map(function(s) {
      return s.trim();
    }).filter(Boolean);
    imports.push({ names, module: match[2] });
  }
  return imports;
}
function stripImports(source) {
  const importRegex = /import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];?/g;
  return source.replace(importRegex, "");
}
async function loadTWMModule(filePath, rootDir) {
  const cacheKey = filePath;
  const cached = moduleCache.get(cacheKey);
  if (cached) return cached;
  if (!(0, import_node_fs.existsSync)(filePath)) {
    throw new Error("TWM module not found: " + filePath);
  }
  const source = (0, import_node_fs.readFileSync)(filePath, "utf-8");
  const rd = rootDir || process.cwd();
  if (isRuleDsl(source)) {
    try {
      const rules = parseRules(source, filePath);
      const mod = { rules };
      moduleCache.set(cacheKey, mod);
      return mod;
    } catch (err) {
      console.error("[twm-loader] Error parsing rules in " + filePath + ":", err.message);
      const mod = {};
      moduleCache.set(cacheKey, mod);
      return mod;
    }
  }
  const imports = extractImports(source);
  const jsCode = compileTwm(source);
  const codeWithoutImports = stripImports(jsCode);
  const injected = {};
  for (const imp of imports) {
    if (imp.module === "tw" || imp.module === "@tw/server") {
      for (const name of imp.names) {
        if (name === "revalidatePath") injected.revalidatePath = revalidatePath;
        else if (name === "revalidateRoute") injected.revalidateRoute = revalidateRoute;
        else if (name === "setSignal") injected.setSignal = setSignal;
      }
      continue;
    }
    try {
      const mod = await loadLibModule(rd, imp.module);
      for (const name of imp.names) {
        if (name in mod) {
          injected[name] = mod[name];
        }
      }
    } catch (e) {
    }
  }
  const actionNames = /* @__PURE__ */ new Set();
  for (const m of codeWithoutImports.matchAll(/\bfunction\s+(action[A-Za-z0-9_]*)\s*\(/g)) actionNames.add(m[1]);
  for (const m of codeWithoutImports.matchAll(/\b(?:const|let|var)\s+(action[A-Za-z0-9_]*)\s*=/g)) actionNames.add(m[1]);
  const moduleCode = codeWithoutImports + "\nreturn { get: typeof get !== 'undefined' ? get : null, post: typeof post !== 'undefined' ? post : null, put: typeof put !== 'undefined' ? put : null, patch: typeof patch !== 'undefined' ? patch : null, deleteFn: typeof deleteFn !== 'undefined' ? deleteFn : null, GET: typeof GET !== 'undefined' ? GET : null, POST: typeof POST !== 'undefined' ? POST : null, PUT: typeof PUT !== 'undefined' ? PUT : null, PATCH: typeof PATCH !== 'undefined' ? PATCH : null, DELETE: typeof DELETE !== 'undefined' ? DELETE : null, middleware: typeof middleware !== 'undefined' ? middleware : null, generate: typeof generate !== 'undefined' ? generate : null, config: typeof config !== 'undefined' ? config : null, action: typeof action !== 'undefined' ? action : null, revalidate: typeof revalidate !== 'undefined' ? revalidate : null, " + [...actionNames].map((n) => `${n}: typeof ${n} !== 'undefined' ? ${n} : null`).join(", ") + " };";
  const injectedKeys = Object.keys(injected);
  let module2 = {};
  try {
    const moduleFunc = new Function(...injectedKeys, moduleCode);
    const handlers = moduleFunc(...injectedKeys.map(function(k) {
      return injected[k];
    }));
    const H = handlers;
    module2 = {
      get: H.get || H.GET || void 0,
      post: H.post || H.POST || void 0,
      put: H.put || H.PUT || void 0,
      delete: H.deleteFn || H.DELETE || void 0,
      patch: H.patch || H.PATCH || void 0,
      middleware: H.middleware || void 0,
      generate: H.generate || void 0,
      config: H.config || void 0,
      action: H.action || void 0,
      revalidate: typeof H.revalidate === "number" && H.revalidate > 0 ? H.revalidate : void 0
    };
    for (const n of actionNames) if (H[n]) module2[n] = H[n];
  } catch (err) {
    console.error("[twm-loader] Error parsing " + filePath + ":", err);
  }
  moduleCache.set(cacheKey, module2);
  return module2;
}
function parseCookies(headerVal) {
  const out = {};
  if (!headerVal) return out;
  for (const part of headerVal.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}
function sameOriginAllowed(req) {
  try {
    const host = new URL(req.url).host;
    const origin = req.headers["origin"] || req.headers["Origin"];
    if (origin) return new URL(origin).host === host;
    const referer = req.headers["referer"] || req.headers["Referer"];
    if (referer) return new URL(referer).host === host;
  } catch {
  }
  return false;
}
function clearRouteCache() {
  routeCache.clear();
}
function revalidateRoute(pathname, opts) {
  const want = pathname.startsWith("/") ? pathname : "/" + pathname;
  let dropped = 0;
  for (const [key, entry] of routeCache) {
    const hit = opts?.prefix ? entry.pathname === want || entry.pathname.startsWith(want.endsWith("/") ? want : want + "/") : entry.pathname === want;
    if (hit) {
      routeCache.delete(key);
      dropped++;
    }
  }
  return dropped;
}
async function executeRouteHandler(filePath, method, request, rootDir) {
  const mod = await loadTWMModule(filePath, rootDir);
  const methodLower = method.toLowerCase();
  let earlyAction;
  if (method.toUpperCase() === "POST") {
    try {
      earlyAction = new URL(request?.url ?? "http://local").searchParams.get("_action") ?? new URL(request?.url ?? "http://local").searchParams.get("action") ?? void 0;
    } catch {
    }
  }
  const handler = methodLower === "delete" ? mod.delete : mod[methodLower] ?? (methodLower === "head" ? mod.get : void 0) ?? mod[method];
  if (!handler && earlyAction === void 0) {
    return { status: 405, json: { ok: false, error: "Method " + method + " not allowed" } };
  }
  const MAX_BODY_BYTES = 10 * 1024 * 1024;
  const contentLength = Number(request?.headers?.get?.("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return { status: 413, json: { ok: false, error: "Payload too large" } };
  }
  let parsedBody = {};
  if (typeof request?.json === "function") {
    try {
      parsedBody = await request.json();
    } catch {
      parsedBody = {};
    }
  } else if (request?.body && typeof request.body === "object") {
    parsedBody = request.body;
  }
  let query = {};
  try {
    const u = new URL(request.url);
    query = Object.fromEntries(u.searchParams.entries());
  } catch {
  }
  const headersObj = typeof request.headers?.entries === "function" ? Object.fromEntries(request.headers.entries()) : request.headers ?? {};
  const cookies = parseCookies(headersObj["cookie"] ?? headersObj["Cookie"]);
  const req = {
    method: request.method ?? method,
    url: request.url ?? "",
    params: request?.params ?? {},
    headers: headersObj,
    query,
    body: parsedBody,
    cookies: {
      ...cookies,
      get: (name) => name in cookies ? cookies[name] : void 0,
      getAll: () => ({ ...cookies }),
      has: (name) => name in cookies
    }
  };
  if (request?.session !== void 0) req.session = request.session;
  if (request?.ip !== void 0) req.ip = request.ip;
  const actionName = method.toUpperCase() === "POST" ? query._action ?? query.action : void 0;
  if (actionName !== void 0) {
    if (!sameOriginAllowed(req)) {
      return { status: 403, json: { ok: false, error: "Forbidden: server actions require a same-origin request" } };
    }
    const fn = actionName === "" ? mod.action : mod["action" + actionName.charAt(0).toUpperCase() + actionName.slice(1)];
    if (typeof fn !== "function") {
      return { status: 404, json: { ok: false, error: "Unknown action: " + actionName } };
    }
    let actionResult;
    try {
      actionResult = await fn(req);
    } catch (err) {
      console.error("[tw] action error (" + filePath + "):", err?.message ?? err);
      return { status: 500, json: { ok: false, error: "Internal Server Error" } };
    }
    if (!actionResult || typeof actionResult !== "object") {
      return { status: 500, json: { ok: false, error: "Internal Server Error" } };
    }
    return {
      status: typeof actionResult.status === "number" ? actionResult.status : 200,
      json: actionResult.json || actionResult.body || {},
      html: typeof actionResult.html === "string" ? actionResult.html : void 0,
      text: typeof actionResult.text === "string" ? actionResult.text : void 0,
      headers: actionResult.headers
    };
  }
  const rv = mod.revalidate;
  const isCacheableMethod = method.toUpperCase() === "GET" || method.toUpperCase() === "HEAD";
  let routeCacheKey = null;
  if (rv && isCacheableMethod && !actionName) {
    try {
      const u = new URL(request.url ?? "http://local");
      routeCacheKey = filePath + ":" + u.pathname + u.search;
    } catch {
      routeCacheKey = filePath;
    }
    const hit = routeCache.get(routeCacheKey);
    if (hit && Date.now() < hit.expiresAt) {
      return {
        ...hit.result,
        headers: { ...hit.result.headers ?? {}, "x-tw-route-cache": "HIT" }
      };
    }
  }
  let result;
  try {
    result = await handler(req);
  } catch (err) {
    console.error("[tw] route handler error (" + filePath + "):", err?.message ?? err);
    return { status: 500, json: { ok: false, error: "Internal Server Error" } };
  }
  if (!result || typeof result !== "object") {
    console.error("[tw] route handler returned no result (" + filePath + ")");
    return { status: 500, json: { ok: false, error: "Internal Server Error" } };
  }
  const finalResult = {
    status: typeof result.status === "number" ? result.status : 200,
    json: result.json || result.body || {},
    html: typeof result.html === "string" ? result.html : void 0,
    text: typeof result.text === "string" ? result.text : void 0,
    headers: result.headers
  };
  if (routeCacheKey && finalResult.status === 200) {
    let cachedPath = "";
    try {
      cachedPath = new URL(request.url ?? "http://local").pathname;
    } catch {
      cachedPath = "";
    }
    routeCache.set(routeCacheKey, { result: finalResult, expiresAt: Date.now() + rv * 1e3, pathname: cachedPath });
  }
  return finalResult;
}
async function executeMiddleware(filePath, request, rootDir) {
  const mod = await loadTWMModule(filePath, rootDir);
  if (mod.rules) {
    const block = evaluateRules(mod.rules, request);
    if (block) return block;
    const { corsHeadersFor: corsHeadersFor2 } = await Promise.resolve().then(() => (init_twm_rules(), twm_rules_exports));
    const cors = corsHeadersFor2(mod.rules, request);
    const req = request;
    const isPreflight = (req.method ?? req.method ?? "").toUpperCase() === "OPTIONS" && !!req.headers?.get?.("access-control-request-method");
    if (isPreflight) {
      return new Response(null, { status: 204, headers: cors });
    }
    if (Object.keys(cors).length > 0) return { headers: cors };
    return null;
  }
  if (!mod.middleware) {
    return null;
  }
  return mod.middleware(request);
}
function shouldMatchMiddleware(matchers, pathname) {
  if (!matchers || matchers.length === 0) return true;
  for (const pattern of matchers) {
    if (pattern === "/*" || pattern === "/**") return true;
    if (pattern === pathname) return true;
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -2);
      if (pathname === prefix || pathname.startsWith(prefix + "/")) return true;
    }
    if (pattern.endsWith("/**")) {
      const prefix = pattern.slice(0, -3);
      if (pathname === prefix || pathname.startsWith(prefix + "/")) return true;
    }
  }
  return false;
}
var import_node_fs, import_node_path2, moduleCache, libCache, routeCache;
var init_twm_loader = __esm({
  "packages/server/tw/routing/twm-loader.ts"() {
    import_node_fs = require("node:fs");
    init_revalidate();
    init_signal_stream();
    import_node_path2 = require("node:path");
    init_twm_rules();
    moduleCache = /* @__PURE__ */ new Map();
    libCache = /* @__PURE__ */ new Map();
    routeCache = /* @__PURE__ */ new Map();
  }
});

// packages/server/tw/testing/index.ts
var testing_exports = {};
__export(testing_exports, {
  testPage: () => testPage,
  testRoute: () => testRoute
});
module.exports = __toCommonJS(testing_exports);
var import_node_path3 = require("node:path");
var import_node_fs2 = require("node:fs");
var import_meta = {};
function resolveRouteFile(rootDir, pathname) {
  const homeDir = (0, import_node_path3.join)(rootDir, "home");
  if (!(0, import_node_fs2.existsSync)(homeDir)) return null;
  const segments = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const isDir = (p) => {
    try {
      return (0, import_node_fs2.existsSync)(p) && (0, import_node_fs2.statSync)(p).isDirectory();
    } catch {
      return false;
    }
  };
  function walk(dir, i, params) {
    if (i >= segments.length) {
      const f = (0, import_node_path3.join)(dir, "route.twm");
      return (0, import_node_fs2.existsSync)(f) ? { file: f, params } : null;
    }
    const seg = segments[i];
    const exact = (0, import_node_path3.join)(dir, seg);
    if (isDir(exact)) {
      const r = walk(exact, i + 1, params);
      if (r) return r;
    }
    for (const entry of (0, import_node_fs2.readdirSync)(dir)) {
      if (/^\(.*\)$/.test(entry) && isDir((0, import_node_path3.join)(dir, entry))) {
        const r = walk((0, import_node_path3.join)(dir, entry), i, params);
        if (r) return r;
      }
      const m = /^\[([^\].]+)\]$/.exec(entry);
      if (m && isDir((0, import_node_path3.join)(dir, entry))) {
        const r = walk((0, import_node_path3.join)(dir, entry), i + 1, { ...params, [m[1]]: seg });
        if (r) return r;
      }
      const c = /^\[\.\.\.(.+)\]$/.exec(entry) || /^\[\[\.\.\.(.+)\]\]$/.exec(entry);
      if (c && isDir((0, import_node_path3.join)(dir, entry))) {
        const f = (0, import_node_path3.join)(dir, entry, "route.twm");
        if ((0, import_node_fs2.existsSync)(f)) return { file: f, params: { ...params, [c[1]]: segments.slice(i).join("/") } };
      }
    }
    return null;
  }
  return walk(homeDir, 0, {});
}
async function testRoute(rootDir, method, pathname, init = {}) {
  const { executeRouteHandler: executeRouteHandler2 } = await Promise.resolve().then(() => (init_twm_loader(), twm_loader_exports));
  const resolved = resolveRouteFile(rootDir, pathname);
  if (!resolved) {
    return { status: 404, json: { ok: false, error: "route not found: " + pathname } };
  }
  const queryStr = new URLSearchParams(init.query ?? {}).toString();
  const url = "http://test.local" + pathname + (queryStr ? "?" + queryStr : "");
  const headers = new Headers(init.headers ?? {});
  let body = init.body;
  if (body !== void 0 && typeof body === "object") {
    body = JSON.stringify(body);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  }
  const request = new Request(url, { method: method.toUpperCase(), headers, body });
  request.params = resolved.params;
  return executeRouteHandler2(resolved.file, method.toUpperCase(), request, rootDir);
}
async function testPage(rootDir, pathname) {
  const homeDir = (0, import_node_path3.join)(rootDir, "home");
  const segments = pathname.split("/").filter(Boolean);
  const isDir = (p) => {
    try {
      return (0, import_node_fs2.existsSync)(p) && (0, import_node_fs2.statSync)(p).isDirectory();
    } catch {
      return false;
    }
  };
  function walk(dir, i, params) {
    if (i >= segments.length) {
      const f = (0, import_node_path3.join)(dir, "page.tw");
      return (0, import_node_fs2.existsSync)(f) ? { file: f, params } : null;
    }
    const seg = segments[i];
    const exact = (0, import_node_path3.join)(dir, seg);
    if (isDir(exact)) {
      const r = walk(exact, i + 1, params);
      if (r) return r;
    }
    for (const entry of (0, import_node_fs2.readdirSync)(dir)) {
      if (/^\(.*\)$/.test(entry) && isDir((0, import_node_path3.join)(dir, entry))) {
        const r = walk((0, import_node_path3.join)(dir, entry), i, params);
        if (r) return r;
      }
      const m = /^\[([^\].]+)\]$/.exec(entry);
      if (m && isDir((0, import_node_path3.join)(dir, entry))) {
        const r = walk((0, import_node_path3.join)(dir, entry), i + 1, { ...params, [m[1]]: seg });
        if (r) return r;
      }
      const c = /^\[\.\.\.(.+)\]$/.exec(entry);
      if (c && isDir((0, import_node_path3.join)(dir, entry))) {
        const f = (0, import_node_path3.join)(dir, entry, "page.tw");
        if ((0, import_node_fs2.existsSync)(f)) return { file: f, params: { ...params, [c[1]]: segments.slice(i).join("/") } };
      }
    }
    return null;
  }
  const resolved = walk(homeDir, 0, {});
  if (!resolved) return { status: 404, html: "" };
  const { compileSync, generateWithLayoutChain, registerComponentTemplate, clearComponentRegistry } = await findCompiler();
  clearComponentRegistry();
  const compDir = (0, import_node_path3.join)(rootDir, "components");
  if ((0, import_node_fs2.existsSync)(compDir)) {
    for (const f of (0, import_node_fs2.readdirSync)(compDir).filter((f2) => f2.endsWith(".tw"))) {
      const fp = (0, import_node_path3.join)(compDir, f);
      const r = compileSync((0, import_node_fs2.readFileSync)(fp, "utf-8"), { filePath: fp, transforms: false, diagnostics: false });
      if (r.ast) registerComponentTemplate(f.replace(/\.tw$/, ""), r.ast);
    }
  }
  const result = compileSync((0, import_node_fs2.readFileSync)(resolved.file, "utf-8"), { filePath: resolved.file, stateVars: resolved.params });
  let html = result.html;
  const pageProgram = result.ast;
  const layouts = [];
  let d = (0, import_node_path3.dirname)(resolved.file);
  while (true) {
    const lp = (0, import_node_path3.join)(d, "layout.tw");
    if ((0, import_node_fs2.existsSync)(lp) && d.startsWith(homeDir)) layouts.unshift(lp);
    if (d === homeDir || !d.startsWith(homeDir)) break;
    const parent = (0, import_node_path3.dirname)(d);
    if (parent === d) break;
    d = parent;
  }
  if (layouts.length > 0) {
    const progs = layouts.map((lp) => compileSync((0, import_node_fs2.readFileSync)(lp, "utf-8"), { filePath: lp }).ast).filter(Boolean);
    if (progs.length > 0 && generateWithLayoutChain) {
      html = generateWithLayoutChain(progs, pageProgram, resolved.params);
    }
  }
  const css = result.css;
  if (css) html = html.replace("</head>", "<style>" + css + "</style>\n</head>");
  return { status: 200, html };
}
async function findCompiler() {
  const candidates = [
    (0, import_node_path3.join)(rootDirGlobal, "node_modules/tw-framework/packages/compiler/tw/index.ts"),
    (0, import_node_path3.join)(rootDirGlobal, "packages/compiler/tw/index.ts"),
    process.env.TW_COMPILER_PATH ?? ""
  ].filter(Boolean);
  for (const c of candidates) if ((0, import_node_fs2.existsSync)(c)) return import(c);
  const selfDir = import_meta.dir ?? (typeof __dirname !== "undefined" ? __dirname : "");
  return import((0, import_node_path3.join)(selfDir, "../../../compiler/tw/index.ts"));
}
var rootDirGlobal = process.cwd();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  testPage,
  testRoute
});
