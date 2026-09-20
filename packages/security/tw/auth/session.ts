/**
 * Session Manager -- server-side session management with
 * cookie-based session IDs, TTL, sliding expiration, and
 * session store backends.
 *
 * @module security/auth/session
 */

/** Session data stored per user. */
export interface SessionData {
  sessionId: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  data: Record<string, unknown>;
  ipHash: string | null;
  userAgentHash: string | null;
}

/** Session store interface -- implement for different backends. */
export interface SessionStore {
  get(sessionId: string): Promise<SessionData | null>;
  set(sessionId: string, data: SessionData): Promise<void>;
  delete(sessionId: string): Promise<void>;
  clear(): Promise<void>;
  size(): Promise<number>;
  cleanup(): Promise<number>;
}

/** Session configuration. */
export interface SessionConfig {
  store?: SessionStore;
  ttl?: number; // milliseconds
  slidingExpiration?: boolean;
  cookieName?: string;
  cookiePath?: string;
  cookieDomain?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  sessionIdLength?: number;
  maxSessions?: number;
}

/** In-memory session store implementation. */
export class MemorySessionStore implements SessionStore {
  private sessions: Map<string, SessionData> = new Map();
  private maxSessions: number;

  constructor(maxSessions: number = 100000) {
    this.maxSessions = maxSessions;
  }

  async get(sessionId: string): Promise<SessionData | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async set(sessionId: string, data: SessionData): Promise<void> {
    if (this.sessions.size >= this.maxSessions) {
      await this.cleanup();
    }
    this.sessions.set(sessionId, data);
  }

  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async clear(): Promise<void> {
    this.sessions.clear();
  }

  async size(): Promise<number> {
    return this.sessions.size;
  }

  async cleanup(): Promise<number> {
    const now = Date.now();
    let removed = 0;
    for (const [id, session] of this.sessions) {
      if (now > session.expiresAt) {
        this.sessions.delete(id);
        removed++;
      }
    }
    return removed;
  }
}

/** Hashes a string (for IP/UA fingerprinting). */
async function hashString(str: string): Promise<string> {
  const data = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

/** Generates a random session ID. */
function generateSessionId(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Session Manager -- creates, validates, and manages user sessions
 * with configurable TTL, sliding expiration, and session stores.
 */
export class SessionManager {
  private store: SessionStore;
  private ttl: number;
  private slidingExpiration: boolean;
  private cookieName: string;
  private cookiePath: string;
  private cookieDomain: string | undefined;
  private secure: boolean;
  private httpOnly: boolean;
  private sameSite: "Strict" | "Lax" | "None";
  private sessionIdLength: number;
  private cleanupInterval: ReturnType<typeof setInterval> | null;

  constructor(config: SessionConfig = {}) {
    this.store = config.store ?? new MemorySessionStore();
    this.ttl = config.ttl ?? 86400000; // 24 hours
    this.slidingExpiration = config.slidingExpiration ?? true;
    this.cookieName = config.cookieName ?? "tw_session";
    this.cookiePath = config.cookiePath ?? "/";
    this.cookieDomain = config.cookieDomain;
    this.secure = config.secure ?? true;
    this.httpOnly = config.httpOnly ?? true;
    this.sameSite = config.sameSite ?? "Lax";
    this.sessionIdLength = config.sessionIdLength ?? 32;
    this.cleanupInterval = setInterval(() => {
      this.store.cleanup().catch(() => {});
    }, 300000); // 5 minutes
    if (typeof this.cleanupInterval.unref === "function") {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Creates a new session for a user.
   */
  async create(userId: string, options?: {
    data?: Record<string, unknown>;
    ip?: string;
    userAgent?: string;
    ttl?: number;
  }): Promise<SessionData> {
    const sessionId = generateSessionId(this.sessionIdLength);
    const now = Date.now();
    const ttl = options?.ttl ?? this.ttl;

    const session: SessionData = {
      sessionId,
      userId,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + ttl,
      data: options?.data ?? {},
      ipHash: options?.ip ? await hashString(options.ip) : null,
      userAgentHash: options?.userAgent ? await hashString(options.userAgent) : null,
    };

    await this.store.set(sessionId, session);
    return session;
  }

  /**
   * Gets a session by ID. Returns null if expired or not found.
   */
  async get(sessionId: string): Promise<SessionData | null> {
    const session = await this.store.get(sessionId);
    if (!session) return null;

    const now = Date.now();
    if (now > session.expiresAt) {
      await this.store.delete(sessionId);
      return null;
    }

    // Sliding expiration -- extend the session
    if (this.slidingExpiration) {
      session.updatedAt = now;
      session.expiresAt = now + this.ttl;
      await this.store.set(sessionId, session);
    }

    return session;
  }

  /**
   * Updates session data.
   */
  async update(sessionId: string, data: Record<string, unknown>): Promise<SessionData | null> {
    const session = await this.get(sessionId);
    if (!session) return null;

    session.data = { ...session.data, ...data };
    session.updatedAt = Date.now();

    if (this.slidingExpiration) {
      session.expiresAt = Date.now() + this.ttl;
    }

    await this.store.set(sessionId, session);
    return session;
  }

  /**
   * Validates a session against IP and User-Agent fingerprints.
   */
  async validate(sessionId: string, options?: {
    ip?: string;
    userAgent?: string;
  }): Promise<boolean> {
    const session = await this.get(sessionId);
    if (!session) return false;

    if (options?.ip && session.ipHash) {
      const ipHash = await hashString(options.ip);
      if (ipHash !== session.ipHash) return false;
    }

    if (options?.userAgent && session.userAgentHash) {
      const uaHash = await hashString(options.userAgent);
      if (uaHash !== session.userAgentHash) return false;
    }

    return true;
  }

  /**
   * Destroys a session.
   */
  async destroy(sessionId: string): Promise<void> {
    await this.store.delete(sessionId);
  }

  /**
   * Destroys all sessions for a user.
   */
  async destroyAllForUser(userId: string): Promise<number> {
    // This requires iterating all sessions -- only feasible with in-memory store
    if (this.store instanceof MemorySessionStore) {
      let count = 0;
      for (const [id, session] of (this.store as unknown as { sessions: Map<string, SessionData> }).sessions) {
        if (session.userId === userId) {
          await this.store.delete(id);
          count++;
        }
      }
      return count;
    }
    return 0;
  }

  /** Builds the Set-Cookie header for a session. */
  buildCookieHeader(sessionId: string, ttl?: number): string {
    const parts: string[] = [`${this.cookieName}=${sessionId}`];
    parts.push(`Path=${this.cookiePath}`);
    if (this.cookieDomain) parts.push(`Domain=${this.cookieDomain}`);
    parts.push(`SameSite=${this.sameSite}`);
    if (this.secure) parts.push("Secure");
    if (this.httpOnly) parts.push("HttpOnly");
    parts.push(`Max-Age=${Math.floor((ttl ?? this.ttl) / 1000)}`);
    return parts.join("; ");
  }

  /** Builds the Set-Cookie header to clear the session cookie. */
  buildClearCookieHeader(): string {
    const parts: string[] = [`${this.cookieName}=`, "Max-Age=0"];
    parts.push(`Path=${this.cookiePath}`);
    if (this.cookieDomain) parts.push(`Domain=${this.cookieDomain}`);
    return parts.join("; ");
  }

  /** Returns the cookie name. */
  getCookieName(): string {
    return this.cookieName;
  }

  /** Extracts session ID from a cookie header. */
  extractSessionId(cookieHeader: string | null): string | null {
    if (!cookieHeader) return null;
    const cookies = cookieHeader.split(";");
    for (const cookie of cookies) {
      const [name, ...valueParts] = cookie.trim().split("=");
      if (name?.trim() === this.cookieName) {
        return valueParts.join("=").trim() || null;
      }
    }
    return null;
  }

  /** Returns the session store (for custom queries). */
  getStore(): SessionStore {
    return this.store;
  }

  /** Destroys the session manager. */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

/** Creates a new session manager. */
export function createSessionManager(config?: SessionConfig): SessionManager {
  return new SessionManager(config);
}
