# TW Framework — Hot Reload

This document covers one thing completely: what `tw dev` picks up without a restart — pages, components, middleware and config.

---

## What Reloads Live

| You edit | What happens |
|----------|--------------|
| a `page.tw` | the next request renders the new version |
| a component `.tw` file | components are rescanned before the next render |
| `middleware.twm` | the middleware module is reloaded per its file time; the next request runs the new rules |
| `lib/*.ts` used by a route | the next request picks up the change |

No restart, no manual refresh command — the dev server watches file times and reloads what changed.

```bash
tw dev
# edit home/about/page.tw in your editor
curl -s localhost:3000/about   # renders the edited version
```

## What Needs a Restart

- installing new npm dependencies (`bun install` / `npm install`)
- changing the dev server's port or hostname (restart with the new flags)
- environment variables read at process start

## Middleware Edits

Middleware is reloaded when its file's modification time changes — an edit, a save, a write. The rate-limit counters and other in-memory state of the old module are discarded with it.

## Components

Component changes are rescanned before every render in dev, so adding a component file or editing an existing one is visible immediately — including new components referenced by pages that did not change.

## Production

`tw serve` runs the compiled `.tw/` output. Nothing hot-reloads: a deploy is `tw build` followed by a server restart. The build is the unit of change.

## Verifying Behaviour

```bash
tw dev &
printf 'h1 "Before"' > home/about/page.tw
curl -s localhost:3000/about
printf 'h1 "After"' > home/about/page.tw
curl -s localhost:3000/about   # "After"
```

## Related

- [Dev Server](./dev-server.md)
- [Middleware](./middleware.md)
