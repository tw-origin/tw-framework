# TW Framework — Error Reference

Every error the TW compiler, runtime, and CLI can produce, with explanations and fixes.

---

## How Errors Work

When something goes wrong, TW Framework gives you:
1. **Error code** (e.g., `TW001`)
2. **File and line number** (e.g., `home/page.tw:12:3`)
3. **What went wrong** (human-readable message)
4. **How to fix it** (suggested solution)

### Error severity levels

| Level | Meaning |
|-------|---------|
| `error` | Stops compilation. Must fix. |
| `warning` | Compiles but may cause issues. Should fix. |
| `info` | Informational. No action needed. |

---

## Syntax Errors (TW001–TW020)

### TW001 — Unexpected Token

```
Error TW001: Unexpected token "}" at home/page.tw:15:1

  Expected: attribute name, text, or child element
  Found: "}"

  Fix: Check for missing opening brace "{" or extra closing brace "}".
      Every tag.class { ... } must have matching braces.
```

**Cause:** You have an extra `}` or missing `{`.

**Fix:**
```tw
// WRONG:
div.container {
  h1 "Hello"
}    // ← extra brace

// CORRECT:
div.container {
  h1 "Hello"
}
```

---

### TW002 — Missing Closing Tag

```
Error TW002: Missing closing tag for <div> at home/page.tw:8:3

  The <div> element was opened but never closed.

  Fix: Add the closing brace "}" for the div element.
```

**Cause:** You forgot to close an element with `}`.

**Fix:**
```tw
// WRONG:
div.container {
  h1 "Hello"
  p "World"
// ← missing }

// CORRECT:
div.container {
  h1 "Hello"
  p "World"
}
```

---

### TW003 — Invalid Attribute Value

```
Error TW003: Invalid attribute value at home/page.tw:10:15

  Attribute "href" expects a string value in quotes.
  Found: href /about (without quotes)

  Fix: Wrap the value in quotes: href "/about"
```

**Cause:** Attribute value not in quotes.

**Fix:**
```tw
// WRONG:
a href /about { "About" }

// CORRECT:
a.nav-link "About" {
  href "/about"
}
```

---

### TW004 — Duplicate Page Config

```
Error TW004: Duplicate page { } block at home/page.tw:20:1

  A page { } block was already defined at line 5.
  Only one page { } block is allowed per file.

  Fix: Remove the duplicate page { } block.
```

**Cause:** You have two `page { }` blocks in the same file.

---

### TW005 — Invalid Directive

```
Error TW005: Unknown directive "@unknown" at home/page.tw:3:1

  "@unknown" is not a recognized TW directive.

  Valid directives: page, state, head, body, section, layout, load, render,
  revalidate, redirect, rewrite, import, export, define, config, middleware, meta

  Fix: Check the directive name spelling or remove it.
```

---

### TW006 — State Declaration Error

```
Error TW006: Invalid state declaration at home/page.tw:8:3

  State variable "count" must have an initial value.
  Found: count (no value)

  Fix: Assign a value: count = 0
```

**Cause:** State variable without initial value.

**Fix:**
```tw
// WRONG:
state {
  count
}

// CORRECT:
state {
  count = 0
}
```

---

### TW007 — Mismatched Closing Tag

```
Error TW007: Mismatched closing tag at home/page.tw:15:1

  Expected </div> but got </section>

  Fix: Make sure closing tag matches the opening tag.
```

---

## Routing Errors (TW100–TW120)

### TW100 — Route Not Found

```
Error TW100: Route not found: /nonexistent

  No page.tw file matches the URL "/nonexistent".

  Fix:
    1. Create home/nonexistent/page.tw
    2. Or create a not-found.tw in the nearest layout directory
    3. Or create a global home/not-found.tw for all 404s
```

**Cause:** The URL has no matching route.

---

### TW101 — Duplicate Route

```
Error TW101: Duplicate route at /about

  Two files resolve to the same URL "/about":
    - home/about/page.tw
    - home/(marketing)/about/page.tw

  Fix: Rename one of the directories or use different route groups.
```

**Cause:** Two directories resolve to the same URL path (route groups are transparent).

---

### TW102 — Missing page.tw

```
Error TW102: Directory "home/about/" has no page.tw

  The directory exists but contains no page.tw file.
  Directories without page.tw are not routes.

  Fix:
    1. Create home/about/page.tw
    2. Or remove the directory if it is not a route
```

**Cause:** You created a directory but forgot to add `page.tw`.

---

### TW103 — Invalid Route File Name

```
Error TW103: Invalid route file "about.tw"

  Files like "about.tw" are not recognized as routes.
  Every route must be a directory containing "page.tw".

  Fix: Move about.tw to about/page.tw
       mkdir -p home/about && mv home/about.tw home/about/page.tw
```

**Cause:** You used `about.tw` instead of `about/page.tw`.

---

### TW104 — Private Folder Contains page.tw

```
Error TW104: Private folder "_components" contains page.tw

  Private folders (starting with "_") are excluded from routing.
  page.tw inside a private folder has no effect.

  Fix: Remove _components/page.tw or rename the folder.
```

---

## Render Mode Errors (TW200–TW210)

### TW200 — Interactive State in Static Render

```
Error TW200: Interactive state is not allowed in static rendering mode.

  → File: home/about/page.tw:5:1
  → Render mode: static
  → Problem: state { } block with reactive variables is present,
    but "render static" is set in page config.

  Static pages are pre-rendered at build time. They cannot have
  client-side interactivity (state, event handlers).

  Fix:
    1. Change render mode: render ssr (allows interactivity)
    2. Or remove the state { } block if the page is truly static
    3. Or use render island for partial hydration
```

**Cause:** You have `render static` + `state` + `on:click` in the same file.

**Fix:**
```tw
// WRONG:
page { render static }
state { count = 0 }
button on:click "count++" { "Click" }

// FIX option 1: Change to ssr
page { render ssr }
state { count = 0 }
button on:click "count++" { "Click" }

// FIX option 2: Remove interactivity
page { render static }
// no state, no on:click
p "This is a static page"
```

---

### TW201 — Invalid Render Mode

```
Error TW201: Invalid render mode "hybrid"

  Valid render modes: static, ssr, island, edge

  Fix: Use one of the valid modes.
       page { render ssr }
```

---

## Extension Errors (TW300–TW310)

### TW300 — Wrong Extension for File Type

```
Error TW300: File "loading.twm" should use .tw extension

  UI special files (loading, error, not-found, global-error, default, head,
  page, layout, template) must use the .tw extension.

  .twm is for server-side files only (route, middleware).

  Fix: Rename loading.twm to loading.tw
```

**Cause:** You used `.twm` for a UI file.

**Fix:** Rename `loading.twm` → `loading.tw`

---

### TW301 — TSS Shorthand in CSS File

```
Error TW301: TSS shorthand "bg" is not valid in a .css file.

  → File: components/Card.module.css:12:3
  → Written: bg: #f00;
  → Problem: "bg" is a TSS shorthand, not a standard CSS property.

  TSS shorthands only work in .tss and .module.tss files.
  Plain .css and .module.css files require standard CSS property names.

  Fix:
    1. Use full CSS property:  background: #f00;
    2. Or rename file to .tss:  Card.module.tss (shorthands allowed)
```

**Cause:** You wrote `bg`, `p`, `m`, etc. in a `.css` file.

**Fix:**
```css
/* WRONG (.css file): */
.card { bg: #fff; p: 20px; }

/* CORRECT (.css file): */
.card { background: #fff; padding: 20px; }
```

Or rename the file to `.tss` and keep shorthands.

---

### TW302 — API Function in .tw File

```
Error TW302: Function declaration "fn get()" is not allowed in .tw files

  → File: home/api/route.tw:1:1
  → Problem: "fn get(request) { }" is server-side syntax.
    API functions belong in .twm files, not .tw files.

  Fix: Rename the file from route.tw to route.twm
```

**Cause:** You wrote `fn get()` in a `.tw` file.

**Fix:** Rename to `.twm`.

---

### TW303 — Markup in .twm File

```
Error TW303: Markup is not allowed in .twm files

  → File: home/api/route.twm:10:1
  → Problem: Tag "div" found. .twm files contain server-side
    JavaScript functions only, not markup.

  Fix: Move markup to a .tw file.
```

---

### TW304 — Middleware in Wrong Location

```
Error TW304: middleware.twm must be at project root, not inside home/

  → File: home/middleware.twm
  → Problem: Middleware must be placed at the project root level,
    not inside the home/ routing directory.

  Fix: Move home/middleware.twm to ./middleware.twm (project root)
```

---

## Import Errors (TW400–TW410)

### TW400 — Module Not Found

```
Error TW400: Cannot find module "@./components/Header.tw"

  → File: home/page.tw:1:1
  → Problem: The imported file does not exist.

  Fix:
    1. Check the path: does home/../components/Header.tw exist?
    2. Check spelling: Header.tw vs header.tw (case-sensitive)
    3. Create the file if it does not exist
```

---

### TW401 — Circular Import

```
Error TW401: Circular import detected

  → home/page.tw imports components/Layout.tw
  → components/Layout.tw imports home/page.tw

  Fix: Break the cycle. Layouts should not import pages.
       Use slot { } for child content instead of importing.
```

---

### TW402 — Invalid Import Path

```
Error TW402: Invalid import path "components/Header"

  → File: home/page.tw:1:1
  → Problem: Import path must start with "@./" or "@/"
    and include the file extension.

  Fix: import Header from "@./components/Header.tw"
       or:   import Header from "@/components/Header.tw"
```

### TW1007 — Server-Only Module in Client Module

Server-only code (`lib/` modules, relative `.js`/`.ts` files, `@tw/*` framework
modules) was imported from a page or layout — a client module. Server
dependencies must never enter the client graph: they can hold database clients,
credentials and other private logic.

```
✗ Build failed — server-only module in client module
    TW1007: home/admin/page.tw → ../lib/db
      Server-only modules (lib/, .twm, @tw/*) cannot be imported from page.tw / layout.tw.
```

Fix: move the server logic into `lib/*.ts` or a `.twm` API route, and let the
page call it through an API route instead of importing it directly.

```
  → Problem: page.tw is a client module; ../lib/db runs on the server only.

  Fix:
    1. Create a route:   home/api/orders/route.twm
    2. Import server code there:  import { db } from "lib/db"
    3. Call it from the page with a fetch("/api/orders") in a handler
```

`tw dev` reports the same violation in the dev console instead of failing
the page. See the client modules guide for the full server/client boundary.

---

## Build Errors (TW500–TW520)

### TW500 — Build Failed

```
Error TW500: Build failed — 3 errors found

  3 files had compilation errors. Fix the errors above and try again.

  Run "tw check" to see all errors.
```

---

### TW501 — Output Directory Not Writable

```
Error TW501: Cannot write to output directory ".tw/"

  → Permission denied or directory does not exist.

  Fix:
    1. Create the directory: mkdir -p .tw
    2. Check permissions: chmod -R 755 .tw/
    3. Or change outputDir in tw.config.ts
```

---

### TW502 — Port Already in Use

```
Error TW502: Port 3000 is already in use

  Another process is using port 3000.

  Fix:
    1. Use a different port: tw dev --port 3001
    2. Or kill the process using port 3000:
       lsof -i :3000  (find PID)
       kill <PID>
```

---

## Runtime Errors (TW600–TW620)

### TW600 — Server Error

```
Error TW600: Internal Server Error

  An unexpected error occurred while rendering /blog/hello-world.

  Check:
    1. home/blog/[slug]/page.tw for syntax errors
    2. State variables referenced in markup are declared
    3. No undefined function calls
```

---

### TW601 — State Variable Not Defined

```
Error TW601: State variable "userName" is not defined

  → File: home/page.tw:12:5
  → Problem: "{userName}" is used in interpolation but not declared in state { }.

  Fix: Add "userName" to the state block:
       state { userName = "default" }
```

---

### TW602 — Undefined Event Handler

```
Error TW602: Event handler "submitForm" is not defined

  → File: home/page.tw:15:20
  → Problem: on:click "submitForm()" references "submitForm"
    which is not a recognized state operation or function.

  Fix:
    1. If it is a state operation, use: on:click "count++"
    2. If it is a function, define it in a <script> block
    3. Or import it from a .ts file
```

---

## CLI Errors (TW700–TW710)

### TW700 — Command Not Found

```
Error TW700: Unknown command "tw buildz"

  Did you mean "tw build"?

  Available commands:
    tw create <name>     Create a new project
    tw dev               Start dev server
    tw build             Build for production
    tw serve             Serve production build
    tw check             Type check
    tw ship              Build + deploy
```

---

### TW701 — Project Not Found

```
Error TW701: No TW project found in current directory

  Could not find tw.config.ts or home/ directory.

  Fix:
    1. Navigate to your project: cd my-app
    2. Or create a new project: tw create my-app
```

---

### TW702 — Bun Not Installed

```
Error TW702: Bun runtime is not installed

  TW Framework requires Bun 1.0+.

  Install:
    curl -fsSL https://bun.sh/install | bash

  Or use Node.js as fallback:
    npm install
    npx tw dev
```

---

## Cache Errors (TW090–TW093)

### TW090 — Cache Directive Without a Window

```
Error TW090: cache { } requires a `revalidate N` window or a `life "profile"` (docs/cache-tags.md)
```

A `cache { }` block (page frontmatter or `fn cached` handler) has neither
`revalidate` nor `life`. **Fix:** add a window — `cache { revalidate 60 }` —
or a profile — `cache { life "hours" }` (docs/cache-tags.md).

### TW091 — Impure Cached Handler

```
Error TW091: fn cached get in home/api/x/route.twm is impure (request.cookies) -- handler excluded from caching
```

A `fn cached` body touches `request.cookies`, `request.headers`,
`request.body`, or calls `setSignal(...)`. Cached responses are shared
across visitors — per-request input cannot be part of one. **Fix:** remove
`fn cached` from this handler, or drop the impure access. `request.params`
and `request.query` are allowed (they are part of the cache key).

### TW092 — Unknown Cache Profile

```
Error TW092: Unknown cache profile "product". Add it to tw.config.ts cache.profiles or use one of: seconds, minutes, hours, days, max.
```

**Fix:** define the profile in `tw.config.ts` under `cache.profiles`, or
use a built-in name.

### TW093 — Non-Deterministic Cached Handler (warning)

```
Warning TW093: fn cached get calls a non-deterministic function -- the value freezes into the cache entry
```

The handler calls `Date.now()`, `Math.random()`, or `crypto.randomUUID()`.
The first value becomes part of the cached entry until it refreshes.
Legitimate for "generated at" stamps; remove the call if you need
per-request freshness.

---

## Error Recovery

The TW compiler has built-in error recovery:

1. **Single-token insertion:** If a token is missing, the compiler synthesizes it and continues
2. **Single-token deletion:** If an unexpected token appears, the compiler skips it
3. **Panic mode:** On severe errors, the compiler skips to the next safe point (next tag or directive)
4. **Partial output:** The compiler produces output even with errors (best-effort rendering)

This means a single error does not stop the entire build. You get all errors at once, fix them, and rebuild.

---

## Debug Tips

| Symptom | What to check |
|---------|---------------|
| Blank page | Browser console for JS errors, check if page.tw has valid markup |
| 404 error | Check if route directory has page.tw, check spelling |
| Styles missing | Check if .tss file is imported, check if selectors match |
| State not updating | Check if on:click handler is correct, check state variable name |
| Layout not wrapping | Check if layout.tw exists in parent directory, check for slot { } |
| Component not rendering | Check import path, check component name (case-sensitive) |
| API returns 500 | Check route.twm syntax, check for undefined variables |
| Slow build | Check for large imports, enable code splitting in config |

---

## Reading an Error

Every error carries a code, a file position and a fix. The general workflow:

1. Read the code's range below — the prefix tells you the system
2. Open the file at the reported line
3. Apply the fix from the error's message

## Error Code Ranges

| Range | System |
|-------|--------|
| TW001–TW020 | Syntax — parsing `.tw` files |
| TW100–TW120 | Routing — paths, route files, page placement |
| TW200–TW210 | Render modes — interactivity rules |
| TW300–TW310 | Extensions — wrong file type or syntax for the extension |
| TW1007 | The server boundary — server-only import in a page/layout |

## TW1007 — The Most Important Build Error

```
✗ Build failed — server-only module in client module
    TW1007: home/admin/page.tw → ../lib/db
```

A page or layout imported something from the server graph: `lib/...`, a relative `.js`/`.ts` file, or `@tw/*`. Server code belongs in `lib/` modules and `.twm` routes. This failure is a protection — it stops database clients and secrets from being bundled into a public page. The complete model: [Client Modules](./client-modules.md).

## Related

- [Client Modules](./client-modules.md) — TW1007 in context
- [Render Modes](./render-modes.md) — TW200 rules
- [Syntax Overview](./syntax-guide.md)
