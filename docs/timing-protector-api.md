# TW Framework — Timing Protector

This document covers one thing completely: `createTimingProtector` from `@tw/security` — normalizing response and operation times so duration differences do not leak secrets.

---

## Creating the Protector

```twm
import { createTimingProtector } from "@tw/security"

const timing = createTimingProtector({
  normalizeResponseTime: true,   // enable padding
  minResponseTime: 100,          // pad every operation to at least this many ms
  addJitter: true,               // add randomness on top
  jitterRange: 50,               // 0-50 ms of extra padding
})
```

## wrap

```twm
const safeCompare = timing.wrap(async (candidate: string) => {
  return await db.lookupUser(candidate)     // full operation INSIDE the wrap
})

const user = await safeCompare(username)
// Total time: max(minResponseTime, real duration) + jitter — regardless of
// how deep into the lookup the answer was found.
```

`wrap(fn)` returns an async wrapper that awaits `fn`, measures its FULL duration, then sleeps whatever remains of `minResponseTime` (plus jitter). Because the wrapped call is awaited, a slow database miss and a fast username hit produce indistinguishable total times.

## normalize

```twm
const start = Date.now()
await doWork()
await timing.normalize(start)      // sleep until minResponseTime (+ jitter) passed since start
```

Manual form for handlers you cannot wrap — call it as the LAST statement before returning the response.

## middleware

```twm
const mw = timing.middleware()
// ctx-style middleware: records the start, pads the response before it leaves
```

## What It Protects Against

Timing attacks read duration differences to learn secrets one comparison at a time — a user-exists lookup that returns early, a password check that fails fast on the first byte. The padding makes every outcome cost the same minimum time, and the jitter prevents averaging attacks over repeated samples.

## When Not to Use It

- Endpoints whose timing is not a function of secret data — padding only adds latency.
- Tight loops that run thousands of times — prefer constant-time primitives (`constantTimeCompare` from the same package) over sleeps.

## Rules

- Wrap the WHOLE secret-dependent operation — including database lookups — or the early-exit cost still leaks.
- Keep `minResponseTime` above your worst-case honest duration only slightly; oversized padding wastes every request's time.
- Jitter does not replace padding: without a floor, both branches still differ by their true cost.
