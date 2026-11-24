# TW Framework v2.0.4

A patch release on top of 2.0.3: bug fixes, plus one deliberate behaviour change
that is called out below.

## Install

```bash
npm install tw-framework@2.0.4
# or
bun add tw-framework@2.0.4
```

New project:

```bash
npm create tw-framework@2.0.4 my-app
```

## What was fixed

**`tw dev` runs `server { }` blocks.** Dev called the compiler without the flag
that makes the parser emit server blocks, so `collectServerBlocks()` always came
back empty and the block never ran — a page whose content came from `server { }`
showed empty lists while `tw build` rendered it correctly. The values are merged
the way the serve path does, which is what actually gets them into the markup.

**`tw dev` sets `Content-Type` for `public/` files.** `new Response(Bun.file())`
does not carry the file's type, so `.svg`, `.css` and `.json` arrived without one
and every image was a broken icon.

**`state { }` in `layout.tw`.** Only the page's state was seeded into the vars the
layout's markup is generated from, so a layout holding state for its own chrome —
drawer open, active tab — rendered empty. Layouts are seeded first, so the page
still wins a name clash.

**`TW003` on valid inline tags.** `b`, `i`, `em`, `strong`, `small`, `u`, `s`,
`ins`, `del`, `sub`, `sup`, `nobr`, `big`, `tt` and the SVG children were missing
from the element list, which produced a warning per tag on markup that renders
fine — 38 of them on one small site, burying the real findings.

**`tw serve` answered 200 for an unknown dynamic param.** A route with a
`params.twm` enumerates its slugs and the static build only writes those, but the
server matched `[slug]` for anything and rendered the fallback branch with 200, so
search engines indexed those as real pages. An unenumerated param is a 404 now,
through the normal not-found path, so a custom `not-found.tw` is still used.

**`headers` config ignored an unknown key.** `{ path, headers }` is the natural
guess — docs say `{ source, headers }` — and it was accepted silently while doing
nothing, so a CSP or X-Frame-Options set there never reached the response. The
server names the unknown key at startup now.

**`tw adapter` notice counts SSR pages too.** It reported only `.twm` API routes;
pages with `render ssr`, `stream`, `csr` or `ppr` cannot be served by a static
adapter either, and are counted now.

## Behaviour change

**Raw HTML in a `.tw` file is a build error (`TW123`).** It was never a supported
form, but it parsed and then had its text rewritten by the class shorthand:
`one two.` became `<two>`, `mid. sentence` became `<mid class="sentence">`, and
`with x` lost the first word — with no diagnostic at all. Write the element in TW
syntax instead:

```tw
p { "with x" }
```

`<if>`, `<for>`, `<while>`, `<switch>` and components are unaffected. Nothing in
the framework's own examples or docs uses raw HTML in a `.tw` file.

## Docs

`docs/syntax-interpolation.md` now documents printing a literal brace — `\{` and
`\}` — which already worked but was not written down. A missing escape is not
silent: the expression prints as its own source and raises `TW096`.

## Compatibility

- No configuration changes, no migration steps for TW-syntax projects.
- Test suite: 3,914 tests, all passing. All 31 examples build.
