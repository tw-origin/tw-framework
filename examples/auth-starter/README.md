# Auth Starter -- Login Form, POST Handler, Guarded Route

A login page with a validation API and a middleware rule that fail-closes an /admin path.

This example is part of the TW Framework example matrix -- every app here
builds with `tw build` and serves with `tw serve`, and CI builds all of
them on every push. It wires the three auth touchpoints in TW: a form, a handler, and a guard -- with the security defaults the framework ships.

## Quick start

```sh
cd examples/auth-starter
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

- A login form (inputs + button) posting to `fn post`
- Server-side validation with 422-style field errors
- `middleware.twm` with `match "/admin/**"` and an `auth` block
- Secrets from env (`jwt_secret_env`), never literals

## The files, one by one

### `.tw/api/login/route.twm`

```twm
fn post(request) {
  const u = String(request.body?.user ?? "")
  if (!u) return { status: 400, json: { ok: false, error: "user required" } }
  return { status: 200, json: { ok: true, user: u } }
}
```

### `.tw/middleware.twm`

```twm
rule "guard admin" {
    match "/admin/**"
    auth {
        cookie "session"
        jwt_secret_env "JWT_SECRET"
    }
    response {
        status 401
        html "<h1>401 Unauthorized</h1>"
    }
}
```

### `home/api/login/route.twm`

```twm
fn post(request) {
  const u = String(request.body?.user ?? "")
  if (!u) return { status: 400, json: { ok: false, error: "user required" } }
  return { status: 200, json: { ok: true, user: u } }
}
```

### `home/page.tw`

```tw
import "./../style/global.tss"

page { title "Sign in -- TW Auth Starter" render ssr }

state { user = "" }

div.login {
  header.head {
    h1 "Sign in"
    p "A wiring skeleton: form, POST handler, guarded route. Bring your own session store."
  }

  form.loginbox {
    label "Username" { }
    input type "text" placeholder "e.g. mlkraj" { }
    label "Password" { }
    input type "password" placeholder "not stored, not logged" { }
    button "Log in" { }
    p.note "POSTs to /api/login. Empty user gets a 400 with a field error; a valid user gets the ok payload."
  }

  section.explain {
    h2 "What the middleware does"
    p "middleware.twm declares one rule: match /admin/** with an auth block. The session cookie is checked against a JWT whose secret comes from the JWT_SECRET environment variable -- never from code."
    p "Guards are fail-closed: a request that matches the guarded path and fails the condition gets the rule's 401 response before any page code runs."
    ul.guards {
      li { strong "Auth" span " -- cookie + jwt_secret_env" }
      li { strong "User agent" span " -- block lists for bots" }
      li { strong "Response" span " -- status + html body for rejects" }
    }
  }

  section.checklist {
    h2 "Before this becomes production"
    ol.hardening {
      li "Wire the session store (packages/security sessions API)"
      li "Add CSRF protection on the login POST"
      li "Add rate limiting on the auth routes"
      li "Set JWT_SECRET in the deployment environment, never in a file"
      li "Add a real password check -- this starter echoes the user"
    }
  }

  footer.foot {
    p "Demo only -- this is the correct shape, not a real identity provider."
  }
}
```

### `home/style.tss`

```tss
.head { mb 24px }
.loginbox { d flex; fd column; gap 10px; maxw 360px; bg #f6f7f9; br 14px; p 20px; mb 28px }
.loginbox label { fs 13px; fw 600; c #334 }
.loginbox input { p 10px; br 10px; border 1px solid #ccd; bg #fff }
.loginbox button { p 10px; br 10px; bg #111; c #fff; fw 700 }
.note { fs 12px; c #667 }
.explain { mb 28px; maxw 560px }
.explain h2 { fs 18px; mb 10px }
.explain p { fs 14px; c #445; mb 8px }
.guards { mt 8px }
.guards li { pb 6px; fs 13px }
.checklist { mb 28px }
.hardening li { pb 6px; fs 14px; c #445 }
.foot { mt 28px; pt 14px; border-top 1px solid #eef; fs 12px; c #889 }
```

### `middleware.twm`

```twm
rule "guard admin" {
    match "/admin/**"
    auth {
        cookie "session"
        jwt_secret_env "JWT_SECRET"
    }
    response {
        status 401
        html "<h1>401 Unauthorized</h1>"
    }
}
```

### `style/global.tss`

```tss
body { font-family: system-ui; margin: 0; padding: 24px }
```

## How it works under the hood

The middleware rule runs before routing: any path matching
`/admin/**` that fails the auth condition (session cookie checked against
a JWT whose secret comes from the environment) gets the rule response --
a 401 -- with no page code ever executing. Guards are fail-closed: no rule
matching a guarded path means the guard still applies. The login handler
itself is a plain POST route returning JSON; wiring the session cookie is
deliberately left to the security package session API so the example
stays dependency-honest.

## Try it -- ten exercises

1. POST a login without a user (an empty JSON body) -- expect 400.
2. POST with a user -- expect the ok payload with the echoed user.
3. GET /admin without a session -- expect the rule 401 response.
4. Change the rule status to 403 and re-test.
5. Add a user_agent block that blocks curl -- then test with curl (expect 403).
6. Move the match to `/admin/*` and compare which nested paths still match.
7. Add a second rule and observe first-match-wins ordering.
8. Try putting a secret literal in the auth block -- read what the review guide says about it.
9. Check the security package docs for the session API to wire a real cookie.
10. Run the master gate.

## FAQ

**Is this production auth?** No -- it is the correct wiring
skeleton. Production adds the session store, CSRF, and rate limiting from
packages/security (docs/ has the security series).

**Why fail-closed?** An open-by-default guard is a security hole with a
doorbell. The DSL makes the guarded path explicit and the failure state
explicit.

**Where does JWT_SECRET come from?** The environment -- never code, never
commits. `jwt_secret_env "JWT_SECRET"` names the variable; the deployment
provides it.
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

