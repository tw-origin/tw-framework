# Forms & Validation -- Server-Side Contract

A contact form whose rules live in the POST handler: 422s with field names, no validation JavaScript shipped.

This example is part of the TW Framework example matrix -- every app here
builds with `tw build` and serves with `tw serve`, and CI builds all of
them on every push. It is the pattern for forms in TW: the API is the contract, the client is sugar.

## Quick start

```sh
cd examples/forms-validation
bun install
tw dev            # development server
# or the long way, from the repo root:
bun ../../apps/cli/tw/bin.ts dev
```

Production build and serve:

```sh
tw build
tw serve --port 8123
```

Check it:

```sh
curl -s http://127.0.0.1:8123/ | head -20
```

## What this example teaches

- The three input shapes (text, email, message) in TW form syntax
- `fn post` returning 422 + { field, error } for each rejection
- Why validation belongs to the server, not the page
- A curl-able endpoint you can test without a browser

## The files, one by one

### `home/api/contact/route.twm`

```twm
fn post(request) {
  const b = request.body ?? {}
  if (!b.name || String(b.name).trim() === "") {
    return { status: 422, json: { ok: false, field: "name", error: "Name is required" } }
  }
  if (!b.email || !String(b.email).includes("@")) {
    return { status: 422, json: { ok: false, field: "email", error: "Valid email required" } }
  }
  return { status: 200, json: { ok: true, thanks: b.name } }
}
```

### `home/page.tw`

```tw
import "./../style/global.tss"

page { title "Contact -- TW Forms and Validation" render ssr }

state { sent = false }

div.form {
  header.head {
    h1 "Contact"
    p "A form with real server-side validation. The API returns 422 with a field name for every rejected input -- the page teaches where errors belong."
  }

  form.contactbox {
    label "Name" { }
    input type "text" placeholder "Your full name" { }
    label "Email" { }
    input type "email" placeholder "you@example.com" { }
    label "Message" { }
    input type "text" placeholder "What can we help with?" { }
    button on:click "sent = true" { "Send" }
    p.state "{sent ? \"sent (client state)\" : \"not sent yet\"}"
  }

  section.rules {
    h2 "The validation rules (server, not client)"
    table {
      thead { tr { th "Field" th "Rule" th "On failure" } }
      tbody {
        tr { td "name" td "non-empty after trim" td "422, field: name" }
        tr { td "email" td "must contain @" td "422, field: email" }
        tr { td "message" td "optional" td "-" }
      }
    }
    code 'curl -X POST -d "{\'name\':\'\',\'email\':\'x\'}" http://127.0.0.1:8123/api/contact'
  }

  section.philosophy {
    h2 "Why validation lives on the server"
    p "Client-side checks are UX sugar; the server is the contract. This page ships no validation JavaScript at all -- the API is the single source of truth, and the same rules would apply to any caller: forms, scripts, or other services."
  }

  footer.foot {
    p "Part of the TW example matrix: examples/forms-validation."
  }
}
```

### `home/style.tss`

```tss
.head { mb 24px }
.head h1 { fs 28px; mb 8px }
.head p { c #445; maxw 560px }
.contactbox { d flex; fd column; gap 10px; maxw 420px; bg #f6f7f9; br 14px; p 20px; mb 28px }
.contactbox label { fs 13px; fw 600; c #334 }
.contactbox input { p 10px; br 10px; border 1px solid #ccd; bg #fff }
.contactbox button { p 10px; br 10px; bg #16a34a; c #fff; fw 700 }
.state { fs 12px; c #667 }
.rules { mb 28px }
.rules h2, .philosophy h2 { fs 18px; mb 10px }
.rules table { border-collapse collapse; mb 12px }
.rules th { text-align left; fs 12px; c #889; pb 6px }
.rules td { pb 6px; pr 16px; fs 14px; border-bottom 1px solid #eef }
.rules code { d block; bg #111; c #0f0; p 8px; br 8px; fs 12px }
.philosophy { mb 28px; maxw 560px }
.philosophy p { c #445; fs 14px }
.foot { mt 28px; pt 14px; border-top 1px solid #eef; fs 12px; c #889 }
```

### `style/global.tss`

```tss
body { font-family: system-ui; margin: 0; padding: 24px }
.err { color #dc2626 }
```

## How it works under the hood

The handler reads request.body and applies the rules in order:
name must be non-empty after trim, email must contain @, message is
optional. Rejections return 422 with the offending field named, so the
page (or any other caller) can highlight the right input. The page itself
ships zero validation JS -- the same endpoint protects forms, scripts,
and third-party services equally, which is the entire argument for
server-side validation.

## Try it -- ten exercises

1. POST an empty body -- expect 422 with field: name.
2. POST a name but a bad email -- expect field: email.
3. POST everything valid -- expect the ok payload.
4. Add a rule: message must be under 500 characters.
5. Add a select or textarea variant to the form.
6. Wire the button to a client-side optimistic state (the sent indicator).
7. Add rate limiting to the endpoint via middleware.
8. Try the same POST from a script -- identical rules apply.
9. Change a status code and observe which clients treat it as an error.
10. Run the master gate.

## FAQ

**Should I also validate client-side?** For UX only (instant feedback,
fewer round-trips). The server rules are the contract; duplicate them in
the client if the UX needs it, never instead of them.

**Why 422 and not 400?** 400 says the request is malformed; 422 says the
request is understood but semantically rejected -- the accurate code for
a validation failure with a field name attached.

**Where does CSRF fit?** Production forms add the CSRF token from
packages/security; this example keeps the validation story single-purpose.

## How the build sees this app

`tw build` walks `home/` looking for the file conventions (`page.tw`,
`layout.tw`, `error.tw`, `loading.tw`, `not-found.tw`, `api/*/route.twm`),
compiles each `.tw` page (template -> HTML + VDOM + JS bundle), compiles
each linked `.tss` stylesheet, resolves cache profiles from `tw.config.ts`
(when present), runs the TW090-TW093 build gates, and emits everything to
`.tw/` with a `routes.json` manifest.

Route naming follows directories: `home/blog/page.tw` serves at `/blog`,
and `home/blog/[id]/page.tw` serves at `/blog/<anything>`. The trailing
`page.tw` segment IS the route (a `home/secret/page.tw` serves at
`/secret`, not `/secret/page`).

## Deploying this example

`tw ship` writes a complete deployment for 15 targets:

node, bun, docker (full + static), vercel, netlify, cloudflare, aws,
digitalocean, render, railway, fly, github-pages, firebase, nginx, caddy --
each with the config files that platform expects and next-step instructions.
Static pages ship as pure files; SSR/cache pages ship with the runtime.

## Verify it yourself (the honest checklist)

```sh
tw build                        # 1. must compile clean
tw serve --port 8123 &          # 2. in ONE shell (background servers
curl -sI http://127.0.0.1:8123/ | head -12   #    die between calls)
curl -s  http://127.0.0.1:8123/ | grep -c "<" # 3. markup present
kill %1
```

## Where to go next

- Full language reference and every table: AGENTS.md (the operating manual)
- Cache semantics deep-dive: docs/cache-tags.md
- Render modes: RENDER-SYSTEM.md and docs/render-modes.md
- Testing conventions: docs/testing.md + contributing/core-testing.md
- The complete example matrix: examples/README.md

