# TW Framework — Dev Server

This document covers one thing completely: `tw dev` — the development server, its flags, live reload, and the everyday dev loop.

---

## Starting It

```bash
tw dev
```

Serves at `http://localhost:3000` by default. Runs with Bun.

| Flag | Effect |
|------|--------|
| `--port <n>` | serve on this port instead |
| `--host <addr>` | bind to this host |

Port precedence when several are set:

```
--port flag  >  PORT environment variable  >  tw.config.ts port  >  3000
```

The same precedence holds for `tw serve` (production) — see [Server Features](./server-features.md).

---

## What Happens on Startup

```
1. Scans home/ and builds the route tree
2. Loads middleware.twm (if present)
3. Loads tw.config.ts (port, redirects, headers)
4. Starts the file watcher
5. Serves at the chosen port
```

The console prints the routes it found and the URL to open.

---

## The Dev Loop

1. Edit any `.tw`, `.twm`, `.tss`, `.scss`, `.css` or `.ts` file
2. The watcher detects the save
3. The changed file is recompiled (the route tree too, if routing changed)
4. The browser updates — no restart, no manual refresh

```bash
tw dev
# ...edit home/page.tw, save...
# browser updates instantly
```

---

## Live Reload — What Updates and How

| You change | What happens |
|------------|--------------|
| A page or component's markup | that page re-renders |
| A style file | styles hot-swap |
| `state { }` or handlers | the page re-renders with fresh code |
| A routing file (page.tw added/removed) | route tree rebuilds, new routes appear |
| `middleware.twm` | rules reload |
| `tw.config.ts` | config reloads |

Edits are picked up on the next request — no WebSocket connection or manual refresh needed. The dev server watches file times (pages, components, middleware, lib/) and recompiles what changed before rendering; see docs/hot-reload.md for exactly what reloads live.

---

## Compilation On Demand

Dev compiles what you visit, not the whole project:

- Open `/` → that page's chain compiles and serves
- Open `/dashboard/settings` → that chain compiles
- Chunks for npm imports build per page as you browse them

A large project stays fast in dev because only visited routes pay compile cost. `tw build` compiles everything up front instead.

---

## Debugging Output

- Styles and chunks are served **unminified** in dev — readable in the browser devtools
- Compile errors appear in the terminal and as an overlay in the browser
- Server-only import violations print **TW1007** to the dev console (the same mistake fails the production build)

---

## Everyday Commands

```bash
tw dev                      # default port 3000
tw dev --port 4000          # different port
PORT=5000 tw dev            # port via environment
```

Stop with Ctrl+C.

---

## Common Mistakes

### Editing .tw/ output during dev

`.tw/` is the production build output. In dev nothing reads from it — edit the sources (`home/`, `components/`, `style/`).

### Expecting config-only changes to rebuild .tw

`tw dev` and `tw build` are separate. Config port changes take effect on restart; the build output is only refreshed by `tw build`.

### Adding an npm import and restarting

Not needed — save the page; the chunk appears on the next request.

---

## Quick Reference

```bash
tw dev                    # http://localhost:3000
tw dev --port 4000
tw dev --host 0.0.0.0     # expose on the network
```

## Related

- [Build Output](./build-output.md) — `tw build`
- [Server Features](./server-features.md) — `tw serve`
- [Commands Reference](./commands-reference.md)
- [Configuration](./configuration.md)
