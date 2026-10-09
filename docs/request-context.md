# Request context — who is calling, from where, how long have I got

TW 2.1 adds a request-context module so you never hand-parse a proxy header
again. Everything here takes a `Request`, a `Headers`, or a plain header object
and returns a richer, typed answer.

```ts
import { clientIp, geolocation, waitUntil, env, deadline, userAgent } from "tw";
```

> Before this existed, the same `x-forwarded-for` split was copy-pasted in
> **nine** places across the server, security and SDK packages. They now all
> call `ipAddress()`.

---

## Client address

### `clientIp(req)` — the address, with provenance

```ts
const c = clientIp(request);
// { ip: "203.0.113.7", version: 4, trusted: true, source: "cf-connecting-ip",
//   isPrivate: false, isLoopback: false }
```

| Field | Meaning |
|---|---|
| `ip` | best-guess client address, no port, no `::ffff:` |
| `version` | `4` or `6` |
| `trusted` | came from a proxy header, not the socket |
| `source` | **which** header answered (`cf-connecting-ip`, `forwarded`, … or `socket`) |
| `isPrivate` / `isLoopback` | range checks |

It understands seven header families, most-trusted first:
`cf-connecting-ip`, `true-client-ip`, `fly-client-ip`, `x-vercel-forwarded-for`,
`x-real-ip`, `x-forwarded-for`, and RFC 7239 `Forwarded`.

### The rest of the family

```ts
ipAddress(req)                 // plain string shorthand
normalizeIp("[::1]:443")       // "::1"
isPrivateIp("10.0.0.1")        // true
inCidr("10.1.2.3", "10.0.0.0/8")   // true -- IPv4 and IPv6
trustProxy(req, 1)             // Nth address from the right (hop counting)
```

---

## Geolocation

```ts
const g = geolocation(request);
// { city, country, countryName, region, continent, latitude, longitude,
//   postalCode, timezone, flag, currency, isEU, metroCode, confidence, source }
g.distanceTo(28.61, 77.20);    // km, or null when lat/lng are unknown
```

Reads the **Vercel, Cloudflare, CloudFront and Fastly** header shapes, in that
order, and reports which one answered via `source`. `flag` is an emoji derived
from `country`; `isEU` saves you maintaining a country list.

---

## Deferred work

```ts
waitUntil(fetch("/analytics", { method: "POST" }));   // after the response
after(() => logAccess());                             // Next-style callback
defer(() => warmCache());                             // alias of after
background(sync(), { retries: 3, timeout: "10s" });  // retried + timed out
```

`timeout` takes a duration **string** (`"10s"`, `"500ms"`, `"2m"`, `"1h"`) or a
number of ms. `parseDuration("10s")` is exported if you want it directly.

Every one returns a `DeferredTask`:

```ts
const t = background(sync());
t.status;        // "pending" | "done" | "failed"
t.result;        // the value, once done
t.error;         // the failure, when status === "failed"
await t;         // the task is thenable
await t.done;    // same, explicit; never rejects
pendingTasks();  // how many are still in flight
```

On Workers or Vercel, call `setWaitUntilHook(ctx.waitUntil)` once so tasks
survive the response.

---

## Environment

```ts
env.require("DATABASE_URL");   // throws a named error when missing
env.int("PORT");               // 3000        (throws on garbage)
env.int("PORT", 3000);         // with a default
env.float("RATIO");
env.bool("DEBUG");             // "1"/"true"/"yes"/"on" -> true
env.url("API_BASE");           // a URL, or throws
env.json<Config>("CONFIG");    // parsed, or throws
env.list("ALLOWED_HOSTS");     // ["a","b","c"]
getEnv();                      // the same reader (the @vercel/functions shape)
```

### Validate the whole set at once

```ts
const r = getEnv().schema({ PORT: "int", DEBUG: "bool", DATABASE_URL: "url" });
if (!r.ok) {
  console.error(r.errors);   // every problem, not just the first
  process.exit(1);
}
r.values.PORT;               // typed as number
```

Types: `"string" | "int" | "float" | "bool" | "url" | "json" | "list"`.

A missing required variable fails loudly at boot instead of silently at
request 10,000.

---

## Deadline

```ts
const d = deadline();
fetch(url, { signal: d.abortSignal });   // pass it straight through
d.remaining;      // ms left
d.isExpired;
d.onExpiring(() => cancelWork());
d.throwIfExpired();
getDeadline();    // the bare number, if that is all you want
```

---

## Metrics

```ts
metric("checkout", 1, { plan: "pro" });
counter("requests").add();
gauge("queue_depth").set(12);
histogram("latency_ms").observe(37);
const t = timer("render"); t.stop();
collectedMetrics();            // every point, for tests
clearMetrics();                // reset them
setMetricSink(console.log);    // ship them somewhere
```

---

## User agent

```ts
const ua = userAgent(request);
// { raw, browser, browserVersion, os, osVersion, device,
//   isMobile, isTablet, isDesktop, isBot, botName }
```

Parsed, not raw — no `ua-parser` dependency.

---

## Request-time intent

```ts
await connection();        // this render needs the request
await dynamic("needs cookies");
staticRoute();             // named intent: this route is static (a marker)

dynamicReasons();          // why routes went dynamic -- the build profiler reads this
clearDynamicReasons();     // reset that log (tests, or between builds)
```

`staticRoute()` is spelled that way rather than `static()` because `static` is
a reserved word — an `export { x as static }` alias does not survive every
bundler's namespace interop, so the import would silently be `undefined`.

---

## Migrating off hand-rolled IP parsing

If you had this:

```ts
const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
```

replace it with:

```ts
import { ipAddress } from "tw";
const ip = ipAddress(req) ?? "unknown";
```

You now also get `cf-connecting-ip`, `true-client-ip`, `fly-client-ip`,
`x-real-ip` and RFC 7239 `Forwarded` — for free.
