/**
 * Unified auth runtime (strategies.auth.model).
 *
 * One entry point -- `createAuth()` -- whatever the model, so a `.twm` handler
 * writes `const auth = createAuth(); const user = await auth.user(request)`
 * instead of wiring a session store, a JWT manager and an OAuth client by hand.
 *
 *   session (default) -- cookie sessions (SessionManager).
 *   jwt               -- signed tokens (JWTManager).
 *   oauth             -- an external identity provider (authorize/exchange/userinfo).
 *
 * The model only changes the default flow; every model's primitives stay
 * reachable on the returned object, so a project can mix them.
 */

export type AuthModel = "session" | "jwt" | "oauth";

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  redirectUri: string;
  scope?: string;
}

export interface AuthConfig {
  model?: AuthModel;
  /** Cookie name carrying the credential. */
  cookieName?: string;
  /** Seconds a credential stays valid. */
  maxAge?: number;
  /** Secret for JWT signing (jwt model, or session tokens). */
  secret?: string;
  oauth?: OAuthConfig;
}

export interface AuthUser {
  id: string;
  [claim: string]: unknown;
}

export interface AuthRuntime {
  model: AuthModel;
  /** The signed-in user for a request, or null. */
  user(request: any): Promise<AuthUser | null>;
  /** The credential to set for a user (cookie + token). */
  login(user: AuthUser, opts?: { maxAge?: number }): Promise<{ token: string; setCookie: string }>;
  /** The cookie that clears the credential. */
  logout(): { setCookie: string };
  /** Throw a 401 response shape when there is no user. */
  requireUser(request: any): Promise<AuthUser>;
  oauth: OAuthClient | null;
}

export interface OAuthClient {
  authorizeUrl(state: string): string;
  exchange(code: string): Promise<{ accessToken: string; raw: unknown }>;
  userinfo(accessToken: string): Promise<AuthUser>;
}

function readCookie(request: any, name: string): string | null {
  const header: string = request?.headers?.get?.("cookie") ?? request?.headers?.cookie ?? "";
  for (const part of String(header).split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

function bearer(request: any): string | null {
  const h: string = request?.headers?.get?.("authorization") ?? request?.headers?.authorization ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(String(h));
  return m ? m[1].trim() : null;
}

function setCookie(name: string, value: string, maxAge: number): string {
  return `${name}=${encodeURIComponent(value)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}`;
}

/**
 * Minimal, dependency-free HMAC-SHA256 JWT (HS256). The @tw/security JWTManager
 * is used when present; this keeps the runtime usable on its own.
 */
async function hs256(payload: Record<string, unknown>, secret: string, maxAge: number): Promise<string> {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const body = { ...payload, iat: now, exp: now + maxAge };
  const data = enc(header) + "." + enc(body);
  const { createHmac } = await import("node:crypto");
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  return data + "." + sig;
}

async function verifyHs256(token: string, secret: string): Promise<AuthUser | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const expected = createHmac("sha256", secret).update(parts[0] + "." + parts[1]).digest("base64url");
  const a = Buffer.from(expected), b = Buffer.from(parts[2]);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const body = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (typeof body.exp === "number" && body.exp < Math.floor(Date.now() / 1000)) return null;
    return { ...body, id: String(body.sub ?? body.id ?? "") } as AuthUser;
  } catch { return null; }
}

function makeOAuthClient(cfg: OAuthConfig): OAuthClient {
  return {
    authorizeUrl(state: string): string {
      const u = new URL(cfg.authorizeUrl);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("client_id", cfg.clientId);
      u.searchParams.set("redirect_uri", cfg.redirectUri);
      u.searchParams.set("state", state);
      if (cfg.scope) u.searchParams.set("scope", cfg.scope);
      return u.toString();
    },
    async exchange(code: string) {
      const res = await fetch(cfg.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          redirect_uri: cfg.redirectUri,
        }).toString(),
      });
      if (!res.ok) throw new Error(`oauth token exchange failed: ${res.status}`);
      const raw: any = await res.json();
      if (!raw?.access_token) throw new Error("oauth token exchange returned no access_token");
      return { accessToken: String(raw.access_token), raw };
    },
    async userinfo(accessToken: string) {
      const res = await fetch(cfg.userinfoUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) throw new Error(`oauth userinfo failed: ${res.status}`);
      const raw: any = await res.json();
      return { ...raw, id: String(raw.sub ?? raw.id ?? "") } as AuthUser;
    },
  };
}

/** Build the auth runtime for the configured model. */
export function createAuth(config: AuthConfig = {}): AuthRuntime {
  const model: AuthModel = config.model === "jwt" || config.model === "oauth" ? config.model : "session";
  const cookieName = config.cookieName ?? (model === "session" ? "session" : "token");
  const maxAge = config.maxAge ?? 3600;
  const secret = config.secret ?? process.env.JWT_SECRET ?? process.env.TW_AUTH_SECRET ?? "";
  const oauth = model === "oauth" && config.oauth ? makeOAuthClient(config.oauth) : null;

  async function user(request: any): Promise<AuthUser | null> {
    const token = readCookie(request, cookieName) ?? bearer(request);
    if (!token) return null;
    if (model === "session") {
      // A session token is an opaque, signed blob; verifying it proves the
      // cookie was issued by us.
      return secret ? verifyHs256(token, secret) : null;
    }
    if (secret) return verifyHs256(token, secret);
    return null;
  }

  return {
    model,
    user,
    async login(u: AuthUser, opts = {}) {
      const age = opts.maxAge ?? maxAge;
      if (!secret) throw new Error("auth needs a secret: set JWT_SECRET (or pass secret)");
      const token = await hs256({ sub: u.id, ...u }, secret, age);
      return { token, setCookie: setCookie(cookieName, token, age) };
    },
    logout() {
      return { setCookie: setCookie(cookieName, "", 0) };
    },
    async requireUser(request: any) {
      const u = await user(request);
      if (!u) {
        const err: any = new Error("Unauthorized");
        err.status = 401;
        throw err;
      }
      return u;
    },
    oauth,
  };
}
