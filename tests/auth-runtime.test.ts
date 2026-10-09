import { describe, test, expect, beforeEach } from "bun:test";
import { createAuth } from "../packages/server/tw/auth-runtime.ts";

// strategies.auth.model: session (default) | jwt | oauth.
// One entry point, `createAuth()`, whatever the model.

function reqWith(cookie?: string, auth?: string): any {
  const h = new Map<string, string>();
  if (cookie) h.set("cookie", cookie);
  if (auth) h.set("authorization", auth);
  return { headers: { get: (k: string) => h.get(k.toLowerCase()) ?? null } };
}

beforeEach(() => { process.env.JWT_SECRET = "test-secret-do-not-use"; });

describe("auth runtime: model", () => {
  test("defaults to session", () => {
    expect(createAuth().model).toBe("session");
    expect(createAuth({ model: "bogus" as any }).model).toBe("session");
  });
  test("jwt and oauth are honoured", () => {
    expect(createAuth({ model: "jwt" }).model).toBe("jwt");
    expect(createAuth({ model: "oauth", oauth: { clientId: "x", clientSecret: "y", authorizeUrl: "https://a", tokenUrl: "https://t", userinfoUrl: "https://u", redirectUri: "https://r" } }).model).toBe("oauth");
  });
  test("oauth client only exists for the oauth model", () => {
    expect(createAuth({ model: "jwt" }).oauth).toBeNull();
  });
});

describe("auth runtime: login and user", () => {
  test("a login cookie round-trips back to the user", async () => {
    const auth = createAuth();
    const { token, setCookie } = await auth.login({ id: "u1", role: "admin" });
    expect(token.split(".").length).toBe(3);
    expect(setCookie).toContain("session=");
    expect(setCookie).toContain("HttpOnly");
    const cookie = setCookie.split(";")[0];
    const u = await auth.user(reqWith(cookie));
    expect(u?.id).toBe("u1");
    expect(u?.role).toBe("admin");
  });

  test("a bearer token works too", async () => {
    const auth = createAuth({ model: "jwt" });
    const { token } = await auth.login({ id: "u2" });
    expect((await auth.user(reqWith(undefined, `Bearer ${token}`)))?.id).toBe("u2");
  });

  test("no credential means no user", async () => {
    expect(await createAuth().user(reqWith())).toBeNull();
  });

  test("a tampered token is rejected", async () => {
    const auth = createAuth();
    const { token } = await auth.login({ id: "u3" });
    const bad = token.slice(0, -3) + "aaa";
    expect(await auth.user(reqWith(`session=${bad}`))).toBeNull();
  });

  test("an expired token is rejected", async () => {
    const auth = createAuth();
    const { token } = await auth.login({ id: "u4" }, { maxAge: -1 });
    expect(await auth.user(reqWith(`session=${token}`))).toBeNull();
  });

  test("a token signed with another secret is rejected", async () => {
    const a = createAuth({ secret: "secret-a" });
    const b = createAuth({ secret: "secret-b" });
    const { token } = await a.login({ id: "u5" });
    expect(await b.user(reqWith(`session=${token}`))).toBeNull();
  });
});

describe("auth runtime: requireUser and logout", () => {
  test("requireUser throws a 401 when there is no user", async () => {
    const auth = createAuth();
    await expect(auth.requireUser(reqWith())).rejects.toThrow(/Unauthorized/);
  });
  test("requireUser returns the user when signed in", async () => {
    const auth = createAuth();
    const { setCookie } = await auth.login({ id: "u6" });
    expect((await auth.requireUser(reqWith(setCookie.split(";")[0])))?.id).toBe("u6");
  });
  test("logout clears the cookie", () => {
    const { setCookie } = createAuth().logout();
    expect(setCookie).toContain("Max-Age=0");
  });
  test("login without a secret fails loudly", async () => {
    delete process.env.JWT_SECRET;
    delete process.env.TW_AUTH_SECRET;
    await expect(createAuth({ secret: "" }).login({ id: "x" })).rejects.toThrow(/secret/);
    process.env.JWT_SECRET = "test-secret-do-not-use";
  });
});

describe("auth runtime: oauth client", () => {
  const cfg = {
    clientId: "cid", clientSecret: "csec",
    authorizeUrl: "https://idp.example/authorize",
    tokenUrl: "https://idp.example/token",
    userinfoUrl: "https://idp.example/userinfo",
    redirectUri: "https://app.example/callback",
    scope: "openid email",
  };

  test("authorizeUrl carries the client, redirect and state", () => {
    const auth = createAuth({ model: "oauth", oauth: cfg });
    const url = new URL(auth.oauth!.authorizeUrl("state123"));
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("state")).toBe("state123");
    expect(url.searchParams.get("scope")).toBe("openid email");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example/callback");
  });

  test("exchange posts the code and returns the access token", async () => {
    const auth = createAuth({ model: "oauth", oauth: cfg });
    const realFetch = globalThis.fetch;
    let body = "";
    (globalThis as any).fetch = async (_u: string, init: any) => {
      body = String(init?.body ?? "");
      return new Response(JSON.stringify({ access_token: "at-123" }), { status: 200 });
    };
    try {
      const out = await auth.oauth!.exchange("code-xyz");
      expect(out.accessToken).toBe("at-123");
      expect(body).toContain("grant_type=authorization_code");
      expect(body).toContain("code=code-xyz");
      expect(body).toContain("client_secret=csec");
    } finally { (globalThis as any).fetch = realFetch; }
  });

  test("userinfo sends the bearer and normalises the id", async () => {
    const auth = createAuth({ model: "oauth", oauth: cfg });
    const realFetch = globalThis.fetch;
    let authHeader = "";
    (globalThis as any).fetch = async (_u: string, init: any) => {
      authHeader = String(init?.headers?.Authorization ?? "");
      return new Response(JSON.stringify({ sub: "sub-9", email: "a@b.c" }), { status: 200 });
    };
    try {
      const u = await auth.oauth!.userinfo("at-123");
      expect(authHeader).toBe("Bearer at-123");
      expect(u.id).toBe("sub-9");
      expect(u.email).toBe("a@b.c");
    } finally { (globalThis as any).fetch = realFetch; }
  });

  test("a failed exchange throws with the status", async () => {
    const auth = createAuth({ model: "oauth", oauth: cfg });
    const realFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => new Response("nope", { status: 400 });
    try { await expect(auth.oauth!.exchange("bad")).rejects.toThrow(/400/); }
    finally { (globalThis as any).fetch = realFetch; }
  });
});
