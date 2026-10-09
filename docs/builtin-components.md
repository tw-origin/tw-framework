# Builtin components — Head and Script

Import them by specifier; the compiler replaces the tag with plain HTML and
nothing from the package reaches the browser.

```tw
import Head from "@tw/Head"
import Script from "@tw/Script"
```

---

## `@tw/Head` — typed meta, not string soup

```tw
Head {
  title "TW Framework"
  description "Full-stack web framework"
  canonical "https://tw.test/"
  ogImage "/og.png"
  ogType "website"
  twitterCard "summary_large_image"
  twitterSite "@twframework"
  themeColor "#0a0a0a"
  jsonLd '{"@type":"SoftwareApplication","name":"TW"}'
}
```

Compiles to the meta set a browser wants, in order: charset, viewport, title,
description, robots, theme-color, the OpenGraph block, the Twitter block,
canonical, and the JSON-LD script.

**Fallbacks work like you expect.** `og:title` falls back to `title`,
`og:description` to `description`, `twitter:title` to `og:title` to `title`.
So setting `title` and `description` alone still gives a complete social card.

**Escaping is handled.** A title containing `<script>` is escaped, and a
JSON-LD payload containing `</script>` cannot break out of the tag.

### Programmatic builders

```ts
import { og, twitter, jsonLd, renderHead } from "@tw/Head";

og({ title: "x", image: "/i.png" });   // { "og:title": "x", "og:image": "/i.png" }
twitter({ card: "summary" });          // { "twitter:card": "summary" }
jsonLd({ "@type": "WebSite" });        // a JSON string
renderHead({ title: "x" });            // the whole head as HTML
headTagsFor({ title: "x" });           // the same, as classified MetaTag objects
```

### One thing to know

If your **layout** already renders `<title>` from `page { title "..." }`, using
`Head { title "..." }` too gives you two `<title>` tags. Use one: either drop
the title from `<Head>`, or stop rendering it in the layout.

---

## `@tw/Script` — five strategies, not three

```tw
Script { src "/analytics.js" strategy "lazyOnload" sri "sha384-abc" nonce "n1" }
```

| Strategy | Behaviour |
|---|---|
| `beforeInteractive` | runs during parse — **not** deferred |
| `afterInteractive` | default — `defer` |
| `lazyOnload` | loaded after the page settles |
| `worker` | runs off the main thread |
| `idle` | waits for `requestIdleCallback` |

Next gives you the first three. `worker` and `idle` are TW additions, marked
with `data-tw-strategy` for the runtime.

**SRI is built in.** Pass `sri` and you get `integrity` plus a
`crossorigin="anonymous"` — integrity is meaningless without a cross-origin
policy, so we add it rather than leaving a silent no-op.

**CSP nonce.** Pass `nonce` and it lands on the tag.

```ts
import { scriptAttributesFor, renderScript, isScriptStrategy, SCRIPT_STRATEGIES } from "@tw/Script";
scriptAttributesFor({ src: "/a.js", sri: "sha384-x" });
renderScript({ inline: "console.log(1)" });
isScriptStrategy("worker");   // true -- validate a value from config
```


---

## `@tw/Form` — progressive enhancement first

```tw
import Form from "@tw/Form"

Form {
  action "/subscribe"
  method "post"
}
  Field { name "email" label "Email" type "email" required "true" }
```

Compiles to `<form method="POST" action="/subscribe" data-tw-form>` — a real
form that submits correctly with **JS off**. `data-tw-form` lets the runtime
upgrade it to a fetch submit when JS is available. Pass `native "true"` to opt
out of the upgrade entirely.

Next's `next/form` assumes JavaScript; a plain POST is the accident. Here it is
the baseline.

```ts
import { formAttributesFor, renderForm, renderField } from "@tw/Form";
renderField({ name: "email", label: "Email", required: true, error: "Required" });
// -> label + input + <p role="alert" aria-live="polite">
```

`renderField` emits the three things every form repeats: a label bound to the
input, the input with `aria-invalid` when there is an error, and an
`aria-live` region so screen readers announce it.

---

## `@tw/og` — social cards, no dependency

```ts
import { imageResponse, ogTemplate, toSvg, toPng, setPngRenderer } from "@tw/og";

export function GET() {
  return imageResponse({ title: "TW 2.1", eyebrow: "tw framework", badge: "v2.1" });
}
```

Renders **SVG** — no satori, no native binary, works on every runtime including
the edge. `imageResponse()` returns a real `Response` with cache headers.

Next's `ImageResponse` rasterises JSX to PNG. If you need PNG, register a
rasteriser once and the same call sites work:

```ts
setPngRenderer(async (svg, w, h) => renderWithResvg(svg, w, h));
canRenderPng();              // true once a renderer is registered
await toPng(card);           // -> Uint8Array
await pngResponse(card);     // -> an image/png Response
```

Long titles wrap and are truncated with an ellipsis; text is escaped.
`wrapText()` and `toSvg()` are exported on their own.
