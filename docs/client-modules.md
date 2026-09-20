# TW Framework — Client Modules & Dependency Graph

This document explains how npm packages, local modules and framework modules flow through a TW project: where an import can be written, who receives it, how bundles are shared, and which boundaries the compiler enforces. After reading this, you will know exactly what happens when you write `import dayjs from "dayjs"` in a page or layout.

---

## 1. The Mental Model

Every import answers three questions, in this order:

1. **Where does it come from?** — decided by the shape of the specifier (npm, local file, or framework).
2. **Where does it run?** — on the server, or in the browser (the two dependency graphs).
3. **Who receives it?** — decided by *where the import is written*: a page gets its own imports, a layout's imports flow to every page under it.

You never configure bundlers, split points or chunk names by hand. The build reads your imports, builds the dependency graph, and emits optimized shared chunks automatically.

---

## 2. Import Sources — Where an Import Comes From

The specifier (the string inside the quotes) decides the source:

| You write | Source | Runs in browser? |
|---|---|---|
| `import dayjs from "dayjs"` | npm package (`node_modules`) | Yes, when imported in a `.tw` file |
| `import Chart from "chart.js"` | npm package | Yes, when imported in a `.tw` file |
| `import { x } from "@scope/pkg"` | npm package (scoped) | Yes, when imported in a `.tw` file |
| `import { db } from "lib/db"` | your project's `lib/` folder (server code) | No — server only |
| `import Header from "@./components/Header.tw"` | local TW component | No — compiled to HTML at build time |
| `import "@./style/global.tss"` | local TW stylesheet | No — compiled to CSS at build time |
| `import { z } from "zod"` inside `lib/*.ts` or a `.twm` route | npm package, server side | No — server only |
| `import { testRoute } from "@tw/testing"` | TW framework module | No — server only |
| `import { toast, formatCurrency } from "@tw/runtime"` | TW framework client utilities | Yes, when imported in a `.tw` file — bundled into a shared, tree-shaken chunk like an npm package |

The rule is simple: **a leading `./`, `../`, `@./` or `lib/` means your own code; `@tw/` means the framework; everything else is an npm package.**

Installing packages works with your normal package manager:

```bash
bun add dayjs        # or: npm install dayjs
```

`bun add` only downloads the package to `node_modules`. Nothing reaches any page until you write an import.

---

## 3. Where an Import Can Live

Client imports (bare npm specifiers) are written directly inside `.tw` files. The file you write them in decides who receives the dependency:

```text
home/
├── layout.tw              → import dayjs from "dayjs"
│                            ROOT LAYOUT: chunk loads on every page of the site
│
├── page.tw                → (no import)          receives: dayjs chunk only
├── about/page.tw          → (no import)          receives: dayjs chunk only
│
├── shop/
│   ├── layout.tw          → import Chart from "chart.js"
│   │                                             SECTION LAYOUT: chunk loads on
│   │                                             every page inside shop/
│   ├── page.tw            → (no import)          receives: dayjs + chart.js chunks
│   └── deals/page.tw      → (no import)          receives: dayjs + chart.js chunks
│
├── dashboard/
│   └── page.tw            → import ms from "ms"  PAGE: chunk loads on this page only
└── report/page.tw         → (no import)          receives: dayjs chunk only
```

### The three levels

| Import written in | Who loads the chunk |
|---|---|
| `home/page.tw` (any page) | That page only |
| A nested `layout.tw` | Every page under that layout (nested layouts stack) |
| `home/layout.tw` (root layout) | Every page in the site |

Pages with no imports in their chain load no client chunk at all — not a single extra byte.

---

## 4. Symbol Access vs Dependency Inheritance

This is the most important rule in the system, and it keeps modules predictable:

> **Import = symbol access. Layout import = dependency inheritance.**

Writing `import Chart from "chart.js"` in `shop/layout.tw` guarantees that the chart.js **chunk is loaded** for every page under `shop/`. It does **not** make the name `Chart` usable inside those pages' handlers.

A page that wants to *use* a symbol imports it itself:

```tw
// shop/dashboard/page.tw
import Chart from "chart.js"     // page imports it itself → Chart is usable below

page { title "Dashboard" render interactive }

state { drawn = false }

div {
  button on:click "Chart.defaults.color = '#333'; drawn = true" { "Draw" }
  p "chart ready: {drawn}"
}
```

If a page uses a name without importing it, the handler fails with a `ReferenceError` at that point — the same behaviour as any module system. Nothing is silently injected into a page's scope.

**Why chunks are loaded for descendants anyway:** layout imports keep the dependency warm — the chunk is in the browser cache, so when a child page imports the same package and the user navigates to it, there is no second download.

---

## 5. The Two Dependency Graphs

Every import in the project is placed into one of two graphs at build time:

```text
                       all imports
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
        SERVER GRAPH                CLIENT GRAPH
              │                           │
       .twm API routes              page.tw / layout.tw
       lib/*.ts modules            npm packages (browser builds)
       server-only libraries       client-side handlers
       database clients, secrets   interactive expressions
              │                           │
              ▼                           ▼
        runs on the server          runs in the browser
```

The same npm package can exist in both graphs — `zod` in `lib/validator.ts` is a server dependency, while `dayjs` in a page is a client dependency. Each is bundled and delivered separately for its own graph.

---

## 6. The Server Boundary — TW1007

Server-only code must never reach the browser: database clients, credentials, filesystem access and private business logic live in `lib/` and `.twm` files. The compiler enforces this at build time.

Writing a server-only import inside a page or layout fails the build:

```tw
// home/admin/page.tw  — WRONG
import db from "../lib/db"

page { title "Admin" }
div { "..." }
```

```text
✗ Build failed — server-only module in client module
    TW1007: home/admin/page.tw → ../lib/db
      Server-only modules (lib/, .twm, @tw/*) cannot be imported from page.tw / layout.tw.
```

The same import inside a `.twm` route or `lib/*.ts` module is correct — that is where server code belongs:

```ts
// home/api/orders/route.twm  — CORRECT
import { db } from "lib/db"
```

Protected specifiers inside `.tw` files: `lib/...`, relative `.js`/`.ts` paths (`../lib/db`, `./secret`), and `@tw/*` framework modules. Relative `.tw` components and `.tss` styles are always allowed — they are compiled away at build time.

This is not only an optimization — it is a correctness and security boundary. A mistake fails the build loudly instead of leaking a database client into a public web page.

---

## 7. How Chunks Are Generated

The build creates **one shared chunk per unique import**, not one bundle per page:

```text
.tw/js/
├── c-a81f2k.js      ← dayjs (content-hashed, tree-shaken, minified)
├── c-92bd1m.js      ← chart.js
└── p-f31ac7.js      ← page scope file (the page's own symbol bindings)
```

**Shared across pages.** Four pages that all use dayjs reference the *same* `c-*.js` file. A visitor who loaded it once on the first page gets it from the browser cache on the next three.

**Content-hashed names.** The filename is derived from the chunk's own bytes. Same content → same name → long-lived browser caching. Change the dependency (or upgrade its version) → new name → no stale cache.

**Tree-shaken.** If a package exports twenty functions and the page imports one, only the used code enters the chunk.

**Minified in production.** `tw build` emits minified chunks; `tw dev` keeps them readable for debugging.

**Zero when zero.** A page whose chain declares no client imports gets no chunk tag at all — only the ~5KB TW runtime.

### What a compiled page looks like

```html
<!-- .tw/shop/index.html -->
<script src="/js/c-a81f2k.js"></script>    <!-- dayjs (root layout) -->
<script src="/js/c-92bd1m.js"></script>   <!-- chart.js (shop layout) -->
<script src="/js/p-f31ac7.js"></script>   <!-- this page's own symbol scope -->
<script src="/__tw_runtime.js"></script>  <!-- TW runtime (last) -->
```

Chunk order does not matter; the runtime always loads last.

---

## 8. Complete Worked Example

A small store illustrates every rule working together:

```text
store/
├── package.json
├── home/
│   ├── layout.tw           → import dayjs from "dayjs"      (whole site)
│   ├── page.tw                                             (home)
│   ├── about/page.tw
│   ├── checkout/
│   │   ├── layout.tw       → import confetti from "canvas-confetti"
│   │   └── page.tw         → import dayjs from "dayjs"
│   └── api/orders/route.twm → import { db } from "lib/db"
├── lib/
│   ├── db.ts               → import mongoose from "mongoose"
│   └── mailer.ts            → import nodemailer from "nodemailer"
```

Resulting behaviour:

| Page | Chunks loaded | Symbols usable in handlers |
|---|---|---|
| `/` | dayjs | — (no own import) |
| `/about` | dayjs | — |
| `/checkout` | dayjs, confetti | `dayjs` (own import) |
| API `POST /api/orders` | none (server) | `db`, `mongoose` — server side |

`confetti` loads for `/checkout` pages only. `mongoose` and `nodemailer` never leave the server — and an attempt to import `lib/db` from `checkout/page.tw` would fail the build with TW1007.

---

## 9. Development vs Production

| | `tw dev` | `tw build` + `tw serve` |
|---|---|---|
| Chunks | built on demand, per page you visit | all built up front |
| Readable | yes (unminified) | no (minified) |
| Caching | rebuilt when imports change | content-hashed, cache-forever |
| TW1007 | printed to the dev console | build fails with exit code 1 |

Adding a new import and saving the page is enough in dev — the chunk appears on the next request. No restart needed.

---

## 10. Script Tags Still Work

npm imports are not the only option. Any library with a CDN/browser build can be loaded the classic way, and its global is usable directly in handlers:

```tw
page { title "Confetti" render interactive }

html {
  head {
    script src "https://cdn.example.com/confetti.min.js" { }
  }
  body {
    button on:click "confetti()" { "Celebrate" }
  }
}
```

Use npm imports when the package is on npm and you want versioning through `package.json`, tree-shaking and hashing. Use a script tag when a CDN build is more convenient. Both work on every page.

---

## 11. Quick Reference

- `bun add <package>` — install; nothing is shipped until imported
- Bare specifier (`"dayjs"`, `"@scope/pkg"`) in a `.tw` file → client chunk
- Same import on many pages → one shared chunk, browser-cached
- Page import → symbol access for that page
- Layout import → chunk inheritance for all pages below it
- Root layout import → whole site
- `lib/`, `.twm`, `.ts` server files → server graph, never bundled for the browser
- `import db from "../lib/db"` inside a page → **TW1007 build failure**
- No imports in the chain → no chunk loaded

### Common questions

**I imported a package in the root layout — why is it "not defined" in my page handler?**
Layout imports carry the dependency, not the symbol. Write the import in the page that uses it; the chunk is already cached, so it costs nothing.

**Does a package get downloaded once per page?**
No. One unique import produces one shared chunk file. Every page references the same file, and the browser caches it across pages.

**I want a library available on every page.**
Import it in `home/layout.tw`. Its chunk will load on every page of the site.

**Why did my build fail with TW1007?**
A page or layout imports a server-only module (`lib/...`, a relative `.js`/`.ts` file, or `@tw/*`). Move that import into `lib/` code or a `.twm` route — server code belongs there.

**Can two pages use different versions of the same package?**
No — one project, one `node_modules`, one version per package. All pages share it.

---

## Related

- [Template syntax](./syntax-guide.md) — page/layout syntax and event handlers
- [Project structure](./project-tree.md) — where `layout.tw` files live and how routes are derived
- [Error reference](./error-reference.md) — TW1007 and all other error codes
- [API Routes](./api-routes.md) — server-side route modules (`.twm`)

---

## Import Matrix — Every Combination

| Written in | Specifier | Result |
|------------|-----------|--------|
| page.tw | `dayjs` | client chunk for that page + symbol access |
| layout.tw | `dayjs` | chunk for every page below the layout, no symbol access |
| page.tw | `@./components/X.tw` | compiled component, server side |
| page.tw | `@./style/x.tss` | compiled CSS, never a client chunk |
| page.tw | `../lib/db` | **TW1007 build failure** |
| page.tw | `@tw/*` | **TW1007 build failure** |
| .twm route | `mongoose` | server-side dependency |
| lib/*.ts | `zod` | server-side dependency |
| .twm route | `lib/db` | correct — the server graph |

## Related

- [Imports](./syntax-imports.md) — the four import forms
- [Client Runtime](./client-runtime.md) — what the chunks do after they load
- [Security](./security.md) — why the server boundary exists
