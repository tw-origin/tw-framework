# TW Framework — Security

This document covers one thing completely: how security is handled in TW Framework — the protections built into the framework, how to report a vulnerability, and what is in scope.

---

## Reporting a Vulnerability

Found something that looks like a security issue? Report it privately — do not open a public issue.

**Contact:** mlkraj290@gmail.com

Include what you can: the component involved (compiler, server, runtime, adapter), steps to reproduce, affected behavior, and your assessment of impact. Reports are acknowledged, and fixes ship with release notes crediting the reporter (unless you prefer to stay anonymous).

## Built-In Protections

These ship enabled or available by default — no third-party wiring required.

### Server

- **Security headers** — CSP, HSTS, X-Content-Type-Options, Referrer-Policy and friends via `security.headers` in `tw.config.ts` (docs/security-headers-api.md)
- **Path traversal containment** — the static file server and the image handler run their own boundary checks (docs/path-traversal-api.md)
- **SSRF protection** — outbound fetches from route handlers pass through an allow-list aware guard (docs/ssrf-protector-api.md)
- **Rate limiting** — per-route and global limits, configurable through `rateLimit` (docs/rate-limiting.md)
- **Request smuggling / header injection detection** — malformed requests are rejected before they reach handlers

### Sessions, Auth, CSRF

- **Session management** — signed, cookie-based sessions with configurable lifetime (`tw_session`, docs/security.md)
- **CSRF tokens** — form-token flows and double-submit protection (docs/csrf-api.md)
- **Server actions** — every action POST is fail-closed same-origin: Origin or Referer must match the serving host, otherwise the request is refused before the action runs (docs/server-actions.md)

### Render-Time

- **Escaping by default** — interpolated values in `.tw` markup are HTML-escaped; raw HTML requires an explicit opt-in
- **XSS detection and sanitizers** — the sanitizer flags known evasion patterns and cleans user-supplied content (docs/sanitizer-api.md)
- **Signal permissions** — `serverOnlySignal` values are never serialized, never streamed and never rendered; `privateSignal` updates are scoped to the caller's session (docs/signal-streaming.md)
- **Signal stream delivery** — the `/_tw/stream` connection only receives the signals the page declared, and only the updates its permissions allow

### Input Handling

- **Sanitizers** — HTML, URL and general-purpose value sanitization available to route handlers (`@tw/security`)
- **Validation** — typed request-shape checking for params, query and body

## Scope

In scope: the compiler, the server and runtime packages, the CLI, the adapters, and the documentation that defines their behavior.

Out of scope: applications *built with* TW Framework (their own dependencies, their own configurations), and findings that require an already-compromised host.

## Configuration Reference

| Area | Setting | Doc |
|------|---------|-----|
| Headers | `security.headers` | docs/security-headers-api.md |
| Rate limits | `rateLimit` | docs/rate-limiting.md |
| Images | `images.domains` | docs/image-handler.md |
| Sessions | session config | docs/security.md |
| CSRF | `@tw/security` | docs/csrf-api.md |

The full security reference set lives under [docs/](./docs/) — every `*-api.md` security module documents its own surface.
