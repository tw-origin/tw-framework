# TW Framework — Middleware

This document covers one thing completely: `middleware.twm` — rules that run before every request: auth, rate limiting, bot filtering, CORS and path security.

---

## The Middleware File

One file, project root, next to `home/`:

```text
my-app/
├── home/
├── style/
├── middleware.twm      ← here
├── tw.config.ts
└── package.json
```

`tw dev` and `tw serve` load it at startup and run it before route matching, on **every** request. A request that matches no rule passes through to normal routing.

---

## Rule Structure

```twm
rule "rule-name" {
  match "/path/pattern/**"
  // condition blocks...
  response {
    status 403
    json { error "Access Denied" }
  }
}
```

| Part | Meaning |
|------|---------|
| `rule "name"` | unique identifier, shown in logs |
| `match "..."` | which URL paths the rule applies to |
| condition blocks | the checks — all must pass to block |
| `response { }` | what to answer when they do |

The `**` wildcard matches any suffix — `/api/**` covers `/api`, `/api/users`, `/api/users/7`.

---

## Complete Example

```twm
// middleware.twm — root middleware, runs before ALL routes

rule "blocked-bots" {
  match "/**"
  user_agent {
    allow ["googlebot", "bingbot", "gptbot"]
    block ["curl/", "wget/", "python-requests", "scrapy"]
    empty_is_blocked false
  }
  response {
    status 403
    html "<h1>403 Forbidden</h1>"
  }
}

rule "admin-auth" {
  match "/admin/**"
  auth {
    cookie "admin_token"
    jwt_secret_env "JWT_SECRET"
  }
  response {
    status 401
    text "Unauthorized"
  }
}

rule "api-rate-limit" {
  match "/api/**"
  rate_limit {
    requests 60
    window 60
    identity "path"
  }
  response {
    status 429
    json { error "Too many requests" }
  }
}

rule "api-cors" {
  match "/api/**"
  methods ["GET", "POST"]
  origin {
    allow ["https://myapp.com", "http://localhost:3000"]
    require true
    allow_referer true
  }
  response {
    status 403
    json { error "Access Denied" }
  }
}
```

---

## Condition Blocks

| Block | Purpose | Fields |
|-------|---------|--------|
| `user_agent` | filter browsers/bots | `allow`, `block`, `empty_is_blocked` |
| `path` | filter by URL path | `prefixes`, `contains`, `extensions`, `deny_traversal`, `deny_null_bytes` |
| `auth` | require authentication | `cookie`, `jwt_secret_env` |
| `rate_limit` | limit request rate | `requests`, `window`, `identity` |
| `origin` | CORS control | `allow`, `require`, `allow_referer` |
| `methods` | HTTP method filter | `["GET", "POST", ...]` |

### user_agent

Substring matching against the `User-Agent` header. `allow` lists bots that pass regardless of `block`; `empty_is_blocked true` rejects requests with no User-Agent at all.

### auth

Requires a JWT in the named cookie, verified against the secret in the named environment variable (`JWT_SECRET` by convention — never hardcode secrets in the file).

### rate_limit

`requests 60 window 60` = at most 60 requests per 60 seconds. `identity "path"` buckets per path; use `"ip"` to bucket per client.

### origin

Cross-origin protection. `require true` rejects requests with no matching Origin/Referer — the standard protection for state-changing browser requests.

### methods

Rejects any method not listed — e.g. only `GET`/`POST` reach your API, everything else gets the response block's status.

---

## Response Forms

| Form | Renders |
|------|---------|
| `json { key "value" }` | JSON body |
| `html "<h1>...</h1>"` | HTML body |
| `text "message"` | plain text body |
| `status XXX` | the status code (required) |

---

## Request Processing Order

```
1. Request arrives
2. middleware.twm rules run in file order, first match wins
3. Blocked  → the rule's response is returned immediately
4. No match → route matching proceeds (page render / .twm API)
```

Because middleware runs first, it protects pages and API routes alike — `/admin/**` covers the admin pages, `/api/**` covers every API endpoint.

---

## Writing Middleware — Practical Patterns

### Protect an admin area

```twm
rule "admin-auth" {
  match "/admin/**"
  auth {
    cookie "admin_token"
    jwt_secret_env "JWT_SECRET"
  }
  response { status 401 text "Unauthorized" }
}
```

### Keep scrapers off the whole site

```twm
rule "no-scrapers" {
  match "/**"
  user_agent {
    block ["curl/", "wget/", "python-requests", "scrapy", "headlesschrome"]
    empty_is_blocked true
  }
  response { status 403 text "Forbidden" }
}
```

### Rate-limit the API per IP

```twm
rule "api-rate" {
  match "/api/**"
  rate_limit {
    requests 100
    window 60
    identity "ip"
  }
  response { status 429 json { error "Slow down" } }
}
```

### Lock the API to known origins

```twm
rule "api-origin" {
  match "/api/**"
  origin {
    allow ["https://myapp.com"]
    require true
    allow_referer true
  }
  response { status 403 json { error "Bad origin" } }
}
```

---

## Common Mistakes

### Placing the file inside home/

`middleware.twm` lives at the project root, beside `home/` — not inside it. A `home/middleware.twm` is never loaded.

### Overbroad match

`match "/**"` on a blocking rule locks the whole site. Scope each rule to the paths it must guard.

### Ordering

Rules evaluate in file order. Put security-critical rules (auth) before convenience rules (rate limit) so the strictest check runs first.

### Secrets in the file

Use `jwt_secret_env "JWT_SECRET"` — the value comes from the environment, never from the file you commit.

---

## Quick Reference

```twm
rule "name" {
  match "/path/**"
  user_agent { allow [...] block [...] }
  auth { cookie "..." jwt_secret_env "..." }
  rate_limit { requests N window S identity "path" }
  origin { allow [...] require true }
  methods ["GET", "POST"]
  response { status 403 json { error "..." } }
}
```

## Related

- [API Routes](./api-routes.md)
- [Security](./security.md) — the programmatic security package
- [Core System](./core-system.md)
- [Error Reference](./error-reference.md)
