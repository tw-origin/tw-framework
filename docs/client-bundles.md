# What actually reaches the browser

A common question: is the JavaScript the client downloads plain, or minified,
or encoded? The answer, precisely:

| Output | Production build | `tw dev` |
|---|---|---|
| App chunks (`js/c-*.js`) | **minified** (esbuild `--minify`) | readable, comments kept |
| Hydration runtime (`__tw_runtime.js`) | **minified** | readable |
| Page scope (`js/p-*.js`) | small, not mangled | same |
| `public/` files | copied **verbatim** | copied verbatim |

## It is minified, not encoded

There is no encoding, encryption or obfuscation anywhere. "Minified" means:

- whitespace and comments removed
- local variable names shortened (`theRunningTotal` -> `t`)
- dead code and unused exports tree-shaken away

The result is still ordinary JavaScript that a browser runs directly and a
developer can read after formatting. Nothing is hidden — minification is about
**bytes on the wire**, not secrecy. Do not treat it as a security boundary; if
you need to keep logic private, keep it on the server.

## Example

Source:

```js
export function calculateTheTotalPrice(items) {
  let theRunningTotal = 0;
  for (const item of items) { theRunningTotal = theRunningTotal + item.price; }
  return theRunningTotal;
}
```

Shipped in a production build:

```js
"use strict";(()=>{function e(l){let t=0;for(let o of l)t=t+o.price;return t}globalThis.__twClient=globalThis.__twClient||{};globalThis.__twClient.calculateTheTotalPrice=e;})();
```

`tw dev` ships the first form, so breakpoints and stack traces stay useful.

## Sizes

The hydration runtime is the one file that loads on every client page, so it is
worth watching:

| | bytes |
|---|---|
| Source (with comments) | 23,914 |
| Shipped, production | **9,747** (-59%) |

Only pages that need the client load it — a fully static page ships **zero**
bytes of JavaScript.
