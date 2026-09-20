# TW Framework — Guide: Building a Dashboard

This guide covers one thing completely: an authenticated dashboard — sidebar chrome, stat cards, a data table with actions, and the API that feeds it.

---

## The Route Shape

```text
home/
├── layout.tw                  ← public site chrome
├── (app)/                      ← route group — no URL change
│   └── dashboard/
│       ├── layout.tw            ← sidebar + topbar shell
│       ├── page.tw              ← overview (/dashboard)
│       └── settings/
│           └── page.tw          ← /dashboard/settings
└── api/
    └── stats/route.twm          ← the data endpoint
```

## Guard the Whole Area

```twm
// middleware.twm
rule "dashboard-auth" {
  match "/dashboard/**"
  auth {
    cookie "session"
    jwt_secret_env "JWT_SECRET"
  }
  response { status 401 text "Unauthorized" }
}
```

See [Authentication](./guide-auth.md) for the login flow that sets the cookie.

## The Sidebar Shell

```tw
// home/(app)/dashboard/layout.tw
import "@./style/dashboard.tss"

page { title "Dashboard" }

div.dashboard {
  aside.sidebar {
    div.brand "MyApp"
    nav {
      a.nav-link "Overview" { href "/dashboard" }
      a.nav-link "Settings" { href "/dashboard/settings" }
    }
  }
  div.main {
    slot { }
  }
}
```

## The Overview Page — Stats + Table

```tw
// home/(app)/dashboard/page.tw
page { title "Overview — Dashboard" render ssr }

state {
  stats = [
    { label: "Revenue", value: "₹12,40,000", change: "+8%" },
    { label: "Users", value: "3,214", change: "+3%" },
    { label: "Churn", value: "1.2%", change: "-0.1%" }
  ]
  rows = [
    { id: 1, customer: "Acme", plan: "pro", status: "active" },
    { id: 2, customer: "Globex", plan: "starter", status: "trial" },
    { id: 3, customer: "Initech", plan: "pro", status: "past due" }
  ]
  selected = 0
}

div.overview {
  div.stats-grid {
    for s in {stats} {
      div.stat-card {
        span.stat-label "{s.label}"
        span.stat-value "{s.value}"
        span.stat-change "{s.change}"
      }
    }
  }

  table.rows {
    thead { tr { th "Customer" th "Plan" th "Status" th "" } }
    tbody {
      for r in {rows} {
        tr :class "r.id == selected ? 'selected' : ''" {
          td "{r.customer}"
          td "{r.plan}"
          td "{r.status}"
          td { button on:click "selected = r.id" { "Select" } }
        }
      }
    }
  }
}
```

Per-row handlers and `:class` bindings make the table interactive — see [Loops](./syntax-loops.md) and [Bindings](./syntax-bindings.md).

## The Data Endpoint

```twm
// home/api/stats/route.twm
fn get(request) {
  return {
    status: 200,
    json: {
      stats: [
        { label: "Revenue", value: "₹12,40,000", change: "+8%" }
      ]
    },
    headers: { "Cache-Control": "private, no-store" }
  }
}
```

Dashboards are personal data — `no-store` keeps it out of shared caches. Fetch it live with the patterns in [Fetching Data](./guide-data-fetching.md).

## Live-Refreshing Stats

```tw
state { stats = null }

div.stats-grid on:load "fetch('/api/stats').then(r => r.json()).then(d => { stats = d.stats })" {
  if stats {
    for s in {stats} {
      div.stat-card { span "{s.label}" span "{s.value}" }
    }
  } else {
    div.skeleton { "Loading..." }
  }
}
```

## Deploying a Dashboard

Dashboards need the full server — SSR per request, APIs, middleware auth:

```bash
tw build
tw adapter docker        # any container platform
# or: tw adapter railway / fly / render (docker service)
```

See [Choosing a Platform](./guide-deployment-choose.md).

## Related

- [Authentication](./guide-auth.md) · [Fetching Data](./guide-data-fetching.md)
- [Layouts](./layouts.md) · [Render Modes](./render-modes.md)
