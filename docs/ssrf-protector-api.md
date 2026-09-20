# TW Framework — SSRF Protector

This document covers one thing completely: `createSSRFProtector` from `@tw/security` — validating URLs and blocking requests to internal networks, with a safe-fetch wrapper that resolves DNS before connecting.

---

## Creating the Protector

```twm
import { createSSRFProtector } from "@tw/security"

const ssrf = createSSRFProtector({
  allowedHosts: ["api.partner.io"],     // external hosts your app may call
  blockedHosts: [],
  allowedProtocols: ["https:"],
  allowPrivateNetworks: false,          // the important one
})
```

## validate

```twm
const result = ssrf.validate("http://169.254.169.254/latest/meta-data")

// { allowed: false, reason: "IP is in a blocked range", ... }
```

`validate(url)` checks scheme, hostname, and — for literal-IP URLs — every blocked range:

| Blocked | Ranges |
|---------|--------|
| Loopback | 127.0.0.0/8, `::1`, `localhost` and friends |
| Private | 10/8, 172.16/12, 192.168/16, IPv6 unique-local (fc00::/7) |
| Link-local | 169.254/16, fe80::/10 — the cloud-metadata range |
| Multicast / reserved | 224/4 and above, `::` |

## createSafeFetch — the One That Matters

The safe wrapper performs the full check INCLUDING DNS:

```twm
const safeFetch = ssrf.createSafeFetch()

try {
  const res = await safeFetch("http://innocent-looking.example.com/api")
} catch (err) {
  // "SSRF protection: ..." — hostname resolved to a private/metadata IP
}
```

For every hostname request, `createSafeFetch` resolves the hostname and checks EVERY address it maps to before calling the real `fetch` — a hostname that resolves to `169.254.169.254` or `127.0.0.1` is refused. Unresolvable hosts fail CLOSED (an SSRF error, not a fetch error).

## validateWithDNS

```twm
const result = ssrf.validateWithDNS(url, resolvedIp)   // your own resolution flow
```

When you resolve DNS yourself (a custom resolver, a connection pool), the check applies to the IP you actually connect to.

## API Surface

| Method | Purpose |
|--------|---------|
| `validate(url)` | Static checks (scheme, host, literal IPs) |
| `validateWithDNS(url, ip)` | Full check against a resolved address |
| `createSafeFetch()` | Drop-in `fetch` replacement with DNS validation |
| `isSafe(url)` | Boolean shorthand for `validate(url).allowed` |

## Remaining Caveat

`fetch` re-resolves DNS at connect time, so a rebinding attack that flips the record between the check and the connection remains theoretically possible — the mitigation is fetching the VETTED IP directly with a `Host` header. The allowlist (`allowedHosts`) is the primary control; DNS validation closes the unlisted-hostname hole.

## Pattern: Outbound Webhook Handler

```twm
const ssrf = createSSRFProtector({ allowedProtocols: ["https:"] })
const safeFetch = ssrf.createSafeFetch()

fn post(request) {
  const { callbackUrl } = request.body.json
  const check = ssrf.validate(callbackUrl)
  if (!check.allowed) {
    return { status: 400, json: { ok: false, error: check.reason } }
  }
  const res = await safeFetch(callbackUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event: "order.created" }),
  })
  return { status: 200, json: { delivered: res.ok } }
}
```
