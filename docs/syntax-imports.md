# TW Framework — Imports

This document covers one thing completely: the `import` statement in `.tw` files — every form, every path alias, where imports must be written, and how each kind of import behaves at build time.

---

## The One Rule

Imports are always written at the **top of the file**, before `page { }`, `state { }` and markup. The compiler reads the import block first; everything after it is template content.

```tw
import Header from "@./components/Header.tw"
import styles from "@./components/Button.module.tss"
import { formatDate } from "@./lib/utils.ts"
import "@./style/global.tss"
import dayjs from "dayjs"

page { title "Clock" }

div { }
```

---

## The Four Import Forms

### 1. Component import (default import)

Imports a `.tw` component so it can be used as a tag in markup.

```tw
import Header from "@./components/Header.tw"
import Button from "@./components/Button.tw"

Header { }

Button {
  label "Save Changes"
  on:click "save()"
}
```

The imported name becomes a custom tag. The tag name must match the import name exactly — `Button { }` works, `button { }` renders a plain HTML `<button>` instead.

### 2. Style import (side-effect import)

Includes a stylesheet in the page's CSS output. No name is bound.

```tw
import "@./style/global.tss"
import "@./style/dashboard.tss"
```

The styles are compiled and merged into the page's stylesheet chain automatically. See [Scoped Styles](./scoped-styles.md) and [TSS Syntax](./tss-syntax.md) for what happens inside those files.

### 3. Scoped style import (named import)

Binds the scoped stylesheet's class map to a name.

```tw
import styles from "@./components/Button.module.tss"
```

See [Scoped Styles](./scoped-styles.md) for the full scoping model.

### 4. Named import from TypeScript

Imports functions and values from `.ts` utility files.

```tw
import { formatDate, slugify } from "@./lib/utils.ts"
```

The imported functions are usable inside interpolated expressions and event handler expressions on that page.

---

## Client (npm) Imports

Bare specifiers — package names without `./` or `@./` — import npm packages directly into the page's client bundle:

```tw
import dayjs from "dayjs"
import Chart from "chart.js"
import { parse } from "marked"

page { title "Reports" render ssr }

div {
  button on:click "stamp = dayjs().format('DD/MM/YYYY HH:mm')" { "Now" }
  p "{stamp}"
}
```

Everything about where these can live, how they are bundled into shared chunks, and the server boundary is covered in [Client Modules & Dependency Graph](./client-modules.md).

---

## Path Aliases

| Alias | Resolves to | Example |
|-------|-------------|---------|
| `@./` | Relative to the current file | `@./components/Header.tw` |
| `@/` | Relative to the project root | `@/components/Header.tw` |
| `./`, `../` | Plain relative paths (server code) | `../lib/db` |

Inside `.tw` files, always prefer `@./` and `@/` — they are stable when files move and they clearly mark template-relative imports.

---

## Import Rules by File Type

| Import | Written in `.tw` page | Written in `layout.tw` | Written in `.twm` route |
|--------|----------------------|----------------------|------------------------|
| `@./components/X.tw` | Yes | Yes | No — components are UI |
| `@./style/x.tss` | Yes | Yes | No |
| `@/lib/utils.ts` (pure helpers) | Yes | Yes | Yes |
| Bare npm specifier (`dayjs`) | Yes — client chunk | Yes — inherited chunk | Yes — server-side |
| `lib/db`, `../lib/db`, `@tw/*` | **No — TW1007 build error** | **No — TW1007** | Yes — server graph |

The last row is the server boundary: database clients, secrets and framework-internal modules must never enter the client graph. The compiler fails the build with error TW1007 if you try. See [Client Modules](./client-modules.md) for the complete rules.

---

## Import in a Page vs a Layout

The file the import is written in decides who receives it:

```text
home/
├── layout.tw          import dayjs from "dayjs"    → chunk loads on EVERY page
├── page.tw            (no imports)                 → receives dayjs chunk
├── shop/
│   ├── layout.tw      import Chart from "chart.js"  → chunk loads on every
│   │                                                page under shop/
│   └── page.tw        (no imports)                 → receives dayjs + chart.js
└── report/page.tw     import ms from "ms"           → chunk loads on this
                                                     page only
```

- **Page import** — the chunk and the symbol belong to that page.
- **Layout import** — the chunk loads for every page under the layout (nested layouts stack), but the *symbol* is not usable in those pages; a page that wants to use the name imports it itself.

---

## Common Mistakes

### Using the component after importing something else over the name

```tw
import Header from "@./components/Header.tw"
import Header from "@./components/Nav.tw"   // duplicate name — last one wins
```

Give every import a unique local name.

### Importing a `.tw` component inside a `.twm` route

Components are compiled UI. Server modules import TypeScript helpers, not components.

### Expecting a layout's import to give a page the symbol

```tw
// home/shop/layout.tw
import Chart from "chart.js"
```

`Chart` is not defined inside `shop/page.tw` handlers. The chunk is warm in the browser cache, but the page must write its own import to use the name.

### Forgetting quotes

```tw
import dayjs from dayjs        // WRONG
import dayjs from "dayjs"      // RIGHT
```

---

## Quick Reference

```tw
// top of file, in this order:
import Component from "@./components/Component.tw"   // component
import "@./style/global.tss"                          // global style
import styles from "@./components/X.module.tss"       // scoped style
import { helper } from "@/lib/utils.ts"               // TS helpers
import pkg from "package-name"                        // client npm
```

## Related

- [Syntax Overview](./syntax-guide.md)
- [Client Modules & Dependency Graph](./client-modules.md)
- [Extensions Guide](./extensions-guide.md)
- [Error Reference](./error-reference.md) — TW1007 and import errors
