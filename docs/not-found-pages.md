# TW Framework — Not Found Pages

This document covers one thing completely: `not-found.tw` — the page the server shows when no route matches.

---

## The File

A root `home/not-found.tw` renders for every URL with no matching route, with a real 404 status:

```tw
// home/not-found.tw
div.nf {
  h1 { "404 — page not found" }
  p { "The page you were looking for moved or never existed." }
  a "Back home" { href "/" }
}
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" localhost:8123/does-not-exist
# 404
```

## Status and SEO

The response status is `404` — crawlers de-index the URL, and the body is your own branded page, not a server default. Keep links in it (home, popular pages) so visitors have somewhere to go.

## Which URLs Show It

| URL | Renders |
|-----|---------|
| no matching route | `not-found.tw` |
| matching route | that route |
| matching catch-all | the catch-all page |
| blocked by middleware | the middleware rule's response, not the 404 |

## Static and Server Pages

The not-found page works in both setups — it is rendered by the same pipeline as any page, so it can use state, components and layouts like the rest of the site.

## Common Shape

```tw
div.nf-wrap {
  div.nf-code { "404" }
  div.nf-text {
    h1 { "Page not found" }
    p { "Check the URL, or start from the beginning." }
    a "Home" { href "/" }
  }
}
```

## Related

- [Dynamic Routes](./dynamic-routes.md)
- [Error Handling in Routes](./error-handling-routes.md)
