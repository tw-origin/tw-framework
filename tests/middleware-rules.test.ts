import { describe, test, expect } from "bun:test";
import { createHmac } from "node:crypto";
import { isRuleDsl, parseRules, evaluateRules } from "../packages/server/tw/routing/twm-rules";

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function signJwt(payload: object, secret: string): string {
  const h = b64url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const p = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(createHmac("sha256", secret).update(`${h}.${p}`).digest());
  return `${h}.${p}.${sig}`;
}

const SCAFFOLD = `rule "api-rate-limit" {
  match "/api/**"
  rate_limit { requests 3, window 60, identity "path" }
  response { status 429, json { error "Too many requests" } }
}

rule "blocked-bots" {
  match "/**"
  user_agent {
    block ["curl/", "wget/"]
    empty_is_blocked false
  }
  response { status 403, html "<h1>403 Forbidden</h1>" }
}
`;

/**
 * Minimal request stub. `new Request()` under `bun test` drops the cookie
 * header (forbidden-header quirk), so tests use a plain object exposing the
 * same surface evaluateRules reads: url, method, headers.get().
 */
function req(path: string, init: { method?: string; headers?: Record<string, string> } = {}): any {
  const headers = new Headers(init.headers ?? {});
  return {
    url: `http://localhost${path}`,
    method: init.method ?? "GET",
    headers,
  };
}

describe("rule DSL detection and parsing", () => {
  test("isRuleDsl detects the rule format, not JS modules", () => {
    expect(isRuleDsl('// comment\nrule "a" { match "/**" }')).toBe(true);
    expect(isRuleDsl('export function middleware() {}')).toBe(false);
    expect(isRuleDsl("")).toBe(false);
  });

  test("parses the scaffold format (commas, inline json)", () => {
    const rules = parseRules(SCAFFOLD);
    expect(rules).toHaveLength(2);
    expect(rules[0].name).toBe("api-rate-limit");
    expect(rules[0].rateLimit!.requests).toBe(3);
    expect(rules[0].rateLimit!.window).toBe(60);
    expect(rules[0].response!.status).toBe(429);
    expect(rules[0].response!.json).toEqual({ error: "Too many requests" });
    expect(rules[1].userAgent!.block).toEqual(["curl/", "wget/"]);
    expect(rules[1].userAgent!.emptyIsBlocked).toBe(false);
  });

  test("parses the docs format (multi-line blocks)", () => {
    const docs = `rule "admin-auth" {
  match "/admin/**"
  auth {
    cookie "admin_token"
    jwt_secret_env "JWT_SECRET"
  }
  methods ["GET", "POST"]
  response { status 401 text "Unauthorized" }
}`;
    const rules = parseRules(docs);
    expect(rules[0].auth).toEqual({ cookie: "admin_token", jwtSecretEnv: "JWT_SECRET" });
    expect(rules[0].methods).toEqual(["GET", "POST"]);
  });

  test("a rule without a response block is a parse error", () => {
    expect(() => parseRules('rule "x" { match "/**" }')).toThrow();
  });

  test("wrongly-typed fields give clear parse errors", () => {
    expect(() => parseRules('rule "x" { match "/**" response { status "abc" } }')).toThrow(/status.*number/);
    expect(() => parseRules('rule "x" { match "/**" user_agent { block "curl" } response { status 403 } }')).toThrow(/string array/);
    expect(() => parseRules('rule "x" { match "/**" rate_limit { requests "many" } response { status 429 } }')).toThrow(/number/);
    expect(() => parseRules('rule "x" { match "/**" unknown_thing "v" response { status 403 } }')).toThrow(/unknown rule section/);
    expect(() => parseRules('rule "x" { match "/**" response { status 403 text "a" html "b" } }')).toThrow(/multiple body forms/);
  });

  test("junk inputs throw cleanly, never hang or crash", () => {
    const junk = ["rule", "{}", 'rule "x"', "rule \"x\" { response { status 403 } } rule", ''];
    for (const j of junk) {
      try { parseRules(j, "fuzz"); } catch { /* expected */ }
    }
    // deep pathological nesting
    const deep = 'rule "x" { match "/**" response { status 403 json { a { b { c ' + '{ k "v" '.repeat(300) + "}".repeat(301) + " } } }";
    expect(() => parseRules(deep, "deep")).toThrow();
  });
});

describe("rule DSL evaluation", () => {
  test("user_agent block: curl UA gets 403, normal UA passes", () => {
    const rules = parseRules(SCAFFOLD);
    const blocked = evaluateRules(rules, req("/", { headers: { "user-agent": "curl/8.0" } }))!;
    expect(blocked).toBeInstanceOf(Response);
    expect(blocked.status).toBe(403);
    expect(blocked.headers.get("x-tw-middleware")).toBe("blocked-bots");
    expect(evaluateRules(rules, req("/", { headers: { "user-agent": "Mozilla/5.0" } }))).toBeNull();
  });

  test("empty user-agent: blocked only when empty_is_blocked true", () => {
    const r1 = parseRules('rule "e" { match "/**" user_agent { empty_is_blocked true } response { status 403 text "x" } }');
    expect(evaluateRules(r1, req("/"))).toBeInstanceOf(Response);
    const r2 = parseRules('rule "e" { match "/**" user_agent { empty_is_blocked false } response { status 403 text "x" } }');
    expect(evaluateRules(r2, req("/"))).toBeNull();
  });

  test("match pattern: /api/** covers /api, /api/x — not /apifoo", () => {
    const rules = parseRules('rule "r" { match "/api/**" user_agent { block ["bot"] } response { status 403 text "x" } }');
    const bot = { headers: { "user-agent": "bot" } } as RequestInit;
    expect(evaluateRules(rules, req("/api", bot))).toBeInstanceOf(Response);
    expect(evaluateRules(rules, req("/api/users/7", bot))).toBeInstanceOf(Response);
    expect(evaluateRules(rules, req("/apifoo", bot))).toBeNull();
    expect(evaluateRules(rules, req("/", bot))).toBeNull();
  });

  test("rate_limit: 429 after the allowed burst", () => {
    const rules = parseRules(SCAFFOLD); // requests 3 per 60s, identity "path"
    const ok = { headers: { "user-agent": "Mozilla/5.0" } } as RequestInit;
    expect(evaluateRules(rules, req("/api/a", ok))).toBeNull();
    expect(evaluateRules(rules, req("/api/a", ok))).toBeNull();
    expect(evaluateRules(rules, req("/api/a", ok))).toBeNull(); // 3 used
    const limited = evaluateRules(rules, req("/api/a", ok))!;
    expect(limited).toBeInstanceOf(Response);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("x-tw-middleware")).toBe("api-rate-limit");
    // a different path has its own bucket (identity "path")
    expect(evaluateRules(rules, req("/api/b", ok))).toBeNull();
  });

  test("auth: valid JWT passes, invalid or missing secret blocks", () => {
    const rules = parseRules('rule "a" { match "/admin/**" auth { cookie "tok" jwt_secret_env "JWT_SECRET" } response { status 401 text "no" } }');
    const tok = signJwt({ sub: "admin", exp: Math.floor(Date.now() / 1000) + 3600 }, "s3cret");
    process.env.JWT_SECRET = "s3cret";
    expect(evaluateRules(rules, req("/admin", { headers: { cookie: `tok=${tok}` } }))).toBeNull();
    // wrong signature
    const bad = signJwt({ sub: "admin", exp: Math.floor(Date.now() / 1000) + 3600 }, "wrong");
    expect(evaluateRules(rules, req("/admin", { headers: { cookie: `tok=${bad}` } }))).toBeInstanceOf(Response);
    // expired
    const old = signJwt({ sub: "admin", exp: 1 }, "s3cret");
    expect(evaluateRules(rules, req("/admin", { headers: { cookie: `tok=${old}` } }))).toBeInstanceOf(Response);
    delete process.env.JWT_SECRET;
  });

  test("methods: unlisted method is blocked", () => {
    const rules = parseRules('rule "m" { match "/api/**" methods ["GET"] response { status 405 text "no" } }');
    expect(evaluateRules(rules, req("/api/x", { method: "GET" }))).toBeNull();
    expect(evaluateRules(rules, req("/api/x", { method: "DELETE" }))).toBeInstanceOf(Response);
  });

  test("origin: require true blocks missing Origin, allow-list admits known origins", () => {
    const rules = parseRules('rule "o" { match "/api/**" origin { allow ["https://myapp.com"] require true } response { status 403 text "no" } }');
    expect(evaluateRules(rules, req("/api/x", { headers: {} }))).toBeInstanceOf(Response);
    expect(evaluateRules(rules, req("/api/x", { headers: { origin: "https://evil.test" } }))).toBeInstanceOf(Response);
    expect(evaluateRules(rules, req("/api/x", { headers: { origin: "https://myapp.com" } }))).toBeNull();
  });

  test("response forms: json/html/text each set the right content type", async () => {
    const mk = (body: string) => parseRules(`rule "x" { match "/**" user_agent { block ["bot"] } response { ${body} } }`);
    const bot = { headers: { "user-agent": "bot" } } as RequestInit;
    const j = evaluateRules(mk('status 400 json { error "bad" }'), req("/", bot))!;
    expect(j.headers.get("content-type")).toBe("application/json");
    expect(await j.json()).toEqual({ error: "bad" });
    const h = evaluateRules(mk('status 403 html "<h1>no</h1>"'), req("/", bot))!;
    expect(h.headers.get("content-type")).toContain("text/html");
    const t = evaluateRules(mk('status 418 text "teapot"'), req("/", bot))!;
    expect(t.headers.get("content-type")).toContain("text/plain");
    expect(await t.text()).toBe("teapot");
  });
});
