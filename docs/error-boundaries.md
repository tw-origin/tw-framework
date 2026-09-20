# TW Framework — Error Boundaries

This document covers one thing completely: containing render errors — one component's crash shows a fallback instead of taking the page down.

---

## The Boundary

```twm
import { ErrorBoundary } from "@tw/runtime"
import { h } from "@tw/runtime"

const boundary = new ErrorBoundary({
  children: [h(BillingPanel)],
  fallback: (error, info) => h("div", { class: "err" }, "This section failed to load."),
  onError: (error, info) => console.error("panel failed:", error)
})

div.page {
  h1 { "Settings" }
}
```

Each child renders inside a try/catch owned by the boundary. If `BillingPanel` throws while rendering, the boundary calls its `fallback` with the error and the component stack — the heading, the nav, the rest of the page all stay on screen.

## Behaviour

| Failure | Without boundary | With boundary |
|---------|------------------|----------------|
| component render throws | the whole render fails | fallback shown, page survives |
| async data rejects | the panel breaks | fallback shown where the panel was |
| event handler throws | caught at the handler, page unaffected | same |

## The Class and the Helper

| API | Shape |
|-----|-------|
| `ErrorBoundary` | component class — props: `children`, `fallback(error, info)`, `onError(error, info)` |
| `createErrorBoundary` | builds one programmatically with options |

## Where to Put Boundaries

- around third-party widgets you do not control
- around panels fed by remote data
- at natural page seams (header / main / footer) on complex pages

Do not wrap everything in one boundary — that just moves the failure point. Wrap the parts that are allowed to fail.

## Fallback Content

A useful fallback says what happened and offers the next step — build it inside the fallback function:

```twm
fallback: () => h("div", { class: "err" },
  h("p", null, "This panel could not load."),
  h("a", { href: "/settings" }, "Retry")
)

## Related

- [Suspense](./suspense.md)
- [Error Handling in Routes](./error-handling-routes.md)
