# TW Framework — Guide: Fetching Data

This guide covers one thing completely: getting data into a TW app — compile-time data on the server, runtime fetching in the browser, loading states and the API routes that serve the data.

---

## Where Data Comes From

| When | Where | How |
|------|-------|-----|
| Build/render time (server) | the page markup itself | state + interpolation, rendered during SSR |
| On user action (browser) | the client runtime | `fetch` inside `on:*` handlers |
| On page load (browser) | the client runtime | `fetch` on an initial event, or a data attribute pattern |

---

## Data in the Page — Server Side

Pages render with their declared state. For data that does not change per visitor, put it in the markup and let the render pipeline bake it in:

```tw
page { title "Products" render ssr }

state {
  products = [
    { id: 1, name: "Widget", price: "₹ 499" },
    { id: 2, name: "Gadget", price: "₹ 999" }
  ]
}

div.grid {
  for p in {products} {
    div.card {
      h3 "{p.name}"
      span "{p.price}"
    }
  }
}
```

For per-request data, a `.twm` API serves it and the browser fetches it.

## The API That Serves Data

```twm
// home/api/products/route.twm
fn get(request) {
  const page = Number(request.query?.page || "1")
  const items = listProducts(page)        // your data source
  return { status: 200, json: { items, page } }
}
```

## Fetching on a User Action

```tw
state { items = [] loading = false error = "" }

div {
  button on:click "loading = true; fetch('/api/products').then(r => r.json()).then(d => { items = d.items; loading = false }).catch(() => { error = 'Could not load'; loading = false })" {
    "Load products"
  }

  if loading { p "Loading..." }
  if error { p.error "{error}" }
  for p in {items} {
    div.card {
      h3 "{p.name}"
      span "{p.price}"
    }
  }
}
```

The pattern that matters: **set state → the page reacts**. `loading` flips a conditional, `items` fills a loop, `error` shows a message — all live, no reload.

## Fetching on Page Load

Trigger the same fetch when the page appears — bind it to the page container's load, or use a button-free pattern:

```tw
state { stats = null }

div.main on:load "fetch('/api/stats').then(r => r.json()).then(d => { stats = d })" {
  if stats == null {
    div.skeleton { "Loading stats..." }
  } else {
    div.stat { span "{stats.revenue}" }
    div.stat { span "{stats.users}" }
  }
}
```

## Loading and Error States — Always Both

```tw
if loading {
  div.spinner { }
} else if error {
  p.error "{error}"
  button on:click "error = ''; load()" { "Retry" }
} else {
  for item in {items} { div.row { "{item.name}" } }
}
```

## Paginated Data

```tw
state { page = 1 items = [] }

div {
  div.list {
    for p in {items} { div.row { "{p.name}" } }
  }
  div.pager {
    button on:click "page = page - 1" { "Prev" }
    span "Page {page}"
    button on:click "page = page + 1" { "Next" }
  }
}
```

Drive the fetch off the page state in the load handler:

```
fetch('/api/products?page=' + page)
```

## Cache-Friendly Responses

Set headers on the API so repeat visits are cheap:

```twm
fn get(request) {
  return {
    status: 200,
    json: { items },
    headers: { "Cache-Control": "public, max-age=60" }
  }
}
```

## Testing the Data Flow

```ts
test("GET /api/products returns the list", async () => {
  const res = await testRoute(process.cwd(), "GET", "/api/products");
  expect(res.status).toBe(200);
  expect(Array.isArray(res.json.items)).toBe(true);
});
```

## Related

- [State](./syntax-state.md) · [Events](./syntax-events.md) · [Loops](./syntax-loops.md)
- [API Routes](./api-routes.md)
- [Client Runtime](./client-runtime.md) — why the page reacts without reloading
