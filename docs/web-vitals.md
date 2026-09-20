# TW Framework — Web Vitals

This document covers one thing completely: `observeLCP`, `observeFID`, `observeCLS`, `observeINP`, `observeTTFB`, `observeFCP`, and `observeAllVitals` — real-user performance metrics from `@tw/runtime`.

---

## One Metric at a Time

Each observer registers a callback and returns its unsubscribe function:

```twm
import { observeLCP } from "@tw/runtime"

const stop = observeLCP((metric) => {
  console.log("LCP", metric.value, "ms", metric.rating)
  sendToAnalytics(metric)
})

stop()     // stop observing
```

| Observer | Metric |
|----------|--------|
| `observeLCP` | Largest Contentful Paint — loading experience |
| `observeFID` | First Input Delay — initial responsiveness |
| `observeCLS` | Cumulative Layout Shift — visual stability |
| `observeINP` | Interaction to Next Paint — overall responsiveness |
| `observeTTFB` | Time to First Byte — server + network |
| `observeFCP` | First Contentful Paint — first pixel of content |

## observeAllVitals

```twm
import { observeAllVitals } from "@tw/runtime"

const stop = observeAllVitals((metric) => {
  // receives every metric type as it reports
  analytics.track(metric.name, { value: metric.value, rating: metric.rating })
})
```

## The Metric Object

| Field | Meaning |
|-------|---------|
| `name` | `"LCP"`, `"FID"`, `"CLS"`, `"INP"`, `"TTFB"`, `"FCP"` |
| `value` | The measurement (ms for all except CLS, which is unitless) |
| `rating` | `"good" \| "needs-improvement" \| "poor"` against standard thresholds |
| `id` | Unique per-page-load identifier for deduplication in analytics |

## Thresholds

The built-in `VitalThresholds` follow the standard web-vitals bands:

| Metric | Good | Needs improvement |
|--------|------|-------------------|
| LCP | ≤ 2500 ms | ≤ 4000 ms |
| FID | ≤ 100 ms | ≤ 300 ms |
| CLS | ≤ 0.1 | ≤ 0.25 |
| INP | ≤ 200 ms | ≤ 500 ms |
| TTFB | ≤ 800 ms | ≤ 1800 ms |
| FCP | ≤ 1800 ms | ≤ 3000 ms |

## Shipping to Analytics

```twm
import { observeAllVitals } from "@tw/runtime"

observeAllVitals((m) => {
  // batched beacon: keeps the page's own workload invisible in the numbers
  const batch = JSON.parse(sessionStorage.getItem("vitals") ?? "[]")
  batch.push({ name: m.name, value: m.value, rating: m.rating, id: m.id })
  sessionStorage.setItem("vitals", JSON.stringify(batch))
})

addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") navigator.sendBeacon("/api/vitals", sessionStorage.getItem("vitals"))
})
```

LCP, CLS, and INP report once per page (on the final/best value); FID reports on the first interaction. Always send metrics on `visibilitychange` — not `beforeunload`, which mobile browsers frequently drop.
