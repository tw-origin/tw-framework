# TW Framework — Session Manager

This document covers one thing completely: `createSessionManager` — server-side sessions with a pluggable `SessionStore`, sliding expiration, and hardening built in.

---

## createSessionManager

```twm
import { createSessionManager } from "@tw/security"

const sessions = createSessionManager({
  store: undefined,            // default: MemorySessionStore
  ttl: 3_600_000,              // ms
  slidingExpiration: true,     // activity extends the session
  cookieName: "tw_session",
  cookiePath: "/",
  cookieDomain: undefined,
  secure: true,
  httpOnly: true,
  sameSite: "Lax",             // "Strict" | "Lax" | "None"
  sessionIdLength: 32,
  maxSessions: 10000,
})
```

## Creating and Reading

```twm
const session = await sessions.create(userId, {
  ip: requestIp,          // hashed into the record
  userAgent: ua,           // hashed into the record
  data: { role: "admin", cart: [] },
})

const found = await sessions.get(sessionId)   // SessionData | null
```

`SessionData`:

| Field | Meaning |
|-------|---------|
| `sessionId` | Opaque id (crypto-random) |
| `userId` | Owner |
| `createdAt` / `updatedAt` / `expiresAt` | Timestamps |
| `data` | Your arbitrary payload |
| `ipHash` / `userAgentHash` | Client fingerprint hashes |

## Ending Sessions

```twm
await sessions.destroy(sessionId)                  // one session
await sessions.destroyAllForUser(userId)             // every device
```

## Expiration

- `ttl` sets the lifetime; `slidingExpiration: true` (default) refreshes `expiresAt` on every read that passes validation.
- Expired sessions are refused on `get` — not just cleaned later.
- `MemorySessionStore.cleanup()` prunes expired records and returns how many; call it from a timer in long-lived processes.

## Hardening

- Session ids come from crypto randomness — no sequential ids to guess.
- `ipHash`/`userAgentHash` let you bind a session to its client; compare them on read and treat mismatch as suspect.
- Cookie attributes default to `secure` + `httpOnly` + `Lax` — only loosen `sameSite` to `None` for cross-site embedding, and then only with `secure: true`.

## Custom Stores

Implement `SessionStore` for any backend:

```twm
import type { SessionStore, SessionData } from "@tw/security"

class RedisSessionStore implements SessionStore {
  async get(id: string) { return redisGet("sess:" + id) }
  async set(id: string, data: SessionData) { await redisSet("sess:" + id, data, data.expiresAt) }
  async delete(id: string) { await redisDel("sess:" + id) }
  async clear() { /* flush namespace */ }
  async size() { return redisCount("sess:*") }
  async cleanup() { return 0 }   // TTL handled by redis
}

const sessions = createSessionManager({ store: new RedisSessionStore() })
```

`MemorySessionStore` is for development and single-process deployments — restarts clear it and multiple processes do not share it.
