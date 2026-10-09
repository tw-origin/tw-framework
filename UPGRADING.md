# Upgrading TW Framework -- The Complete Migration Guide

This document covers one thing completely: moving an application from any
prior TW Framework 1.0.x release to a newer one -- what changed, what you
must do, what you should never have to do, and how to verify the upgrade
took -- for every release in the 1.0.x line.

The golden rule first: **every 1.0.x release is drop-in.** If an upgrade
forces you to change your markup, that is a bug in the release, not a
step in your migration. File it.

---

## 1.0.9 -> 2.0.0 (the strategy layer)

### The golden rule still holds

Every 2.0.0 feature is **opt-in**. Existing projects build and run
byte-for-byte as before; nothing in your markup, config or commands has to
change. If an upgrade forces a change, that is a bug — file it.

### What was added

1. **Strategies** (`strategies` in `tw.config.ts`). Each subsystem now ships
   *all* of its options instead of one: signals transport
   (`sse` | `ws` | `long-poll`), CSS engine (`tss` | `tailwind` | `css` |
   `scss`), render engine (`tw-vdom` | `react` | `preact` | `none`), server
   runtime, API runtime, state model, data layer, cache mode, package
   manager, hydration mode. Omitted fields keep the previous behaviour, so
   the defaults are exactly what 1.0.9 did. See `docs/strategies.md`.
2. **Two more signal transports.** SSE stays the default; WebSocket
   (`--signals=ws`) and long-poll (`--signals=long-poll`) carry the same
   frame protocol, so app code never changes. See
   `docs/signal-streaming.md`.
3. **`tw doctor`.** Reports the active option in every subsystem, whether
   the selected option is available here, and any conflicting combination —
   with a fix for each. `tw doctor --json` is the CI form; exit codes are
   `0` ok, `1` invalid value, `2` unsupported combination, `3` option
   unavailable.
4. **Cross-field validation.** A combination that cannot work (WebSocket on
   a runtime with no WebSocket server, ISR on a runtime with no writable
   cache, `hydration.mode=none` next to a client-side state model) is now a
   config error at load, with the fix in the message.
5. **Four new diagnostics** — `TW094`–`TW097` (state literals, for-loop
   iterables, unknown state variables, `while` with a comparison). See
   `docs/error-reference.md`.

### What you must do

Nothing. If you want any of the new options, set it in `strategies` or pass
the matching flag; otherwise keep building as you always have.

### How to verify

```bash
tw doctor          # shows every option, what changed, and any conflict
tw build           # unchanged output for an unchanged project
tw test            # your suite, green
```

---

## 1.0.5 -> 1.0.6 (the explicit cache layer)

### What was added

- `cache { }` directive on pages and (as `fn cached`) on .twm handlers:
  `revalidate`, `stale`, `expire`, `life "<profile>"`, `tag "<name>"`.
- cacheLife profiles: builtin (seconds, minutes, hours, days, max) plus
  custom in tw.config.ts `cache.profiles`.
- `revalidateTag()` from the `"tw"` import; action results may return
  `revalidateTag` (updateTag semantics).
- New diagnostics TW090-TW093 (build-time gates).
- routes.json values may now be window objects; bare numbers remain valid.
- Repo infrastructure: 2692-test suite, 322-case eval harness, 6-metric
  bench gate, 14 examples, this manual set (AGENTS.md, contributing/).

### Migration steps (all optional)

1. Replace the old zip in place. No config or markup change is required.
2. Verify: `tw build` in your app, then `tw serve` and load a page --
   behavior identical to 1.0.5.
3. Optional modernization, per page, when convenient:

   ```tw
   page { revalidate 60 }                       # before (still works forever)
   page { cache { revalidate 60 } }             # after (same semantics + tag support)
   page { cache { life "minutes", tag "p" } }   # profile + invalidation family
   ```

4. Optional custom profile:

   ```ts
   // tw.config.ts
   export default {
     cache: { profiles: { product: { stale: 2, revalidate: 3, expire: 8 } } },
   }
   ```

   `bun scripts/generate-errors-json.ts`-grade note: profiles resolve at
   build time; unknown names fail the build with TW092.

5. If you use `fn cached` handlers: keep them pure. `request.params` and
   `request.query` are fine (they are part of the cache key);
   `request.cookies`, `request.headers`, `request.body`, and `setSignal`
   fail the build (TW091). `Date.now()`/`Math.random()` warn (TW093)
   because the value freezes into the cache entry.

### What did NOT change

- Legacy `page { revalidate N }`: fresh N seconds, then
   stale-while-revalidate forever. Byte-identical to 1.0.5 (locked by a
   dedicated regression test).
- Middleware rule DSL, render modes, signal streaming, the CLI surface.
- routes.json: existing numeric values are read exactly as before.

## 1.0.4 -> 1.0.5

The 50-bug hardening batch: ~50 real bugs found by the table-driven hunt
(four missing ARIA attributes, the missing `table` role, email validator
factory API, handlerBodyEnd depth bug, TW090 regex). No API changes.
Upgrade = replace zip, rebuild.

## 1.0.3 -> 1.0.4

PPR / render modes: `render static | ssr | island | stream`. Existing
pages default to their previous behavior. New mode opt-in per page.

## 1.0.2 -> 1.0.3

Signal streaming: `render stream` + `setSignal`. Purely additive.

## 1.0.1 -> 1.0.2

Middleware rule DSL (`rule "name" { match ... response ... }`). Purely
additive; no rule file = no middleware, same as before.

## 1.0.0 -> 1.0.1

`revalidatePath` / `revalidateRoute`. Purely additive.

## Verification after ANY upgrade

The five-minute ritual:

```sh
tw build                       # must succeed, zero new diagnostics
tw serve --port 8123 &          # in one shell:
curl -sI http://127.0.0.1:8123/ | head -20
curl -s http://127.0.0.1:8123/ | grep -c "<"   # markup present
kill %1
```

Then spot-check your most complex page and your API routes. If anything
differs from the previous release, that is a release bug -- report it with
the repro (contributing/issue-triage.md).
