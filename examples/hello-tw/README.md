# hello-tw

Built with TW Framework 1.0.0.

## Getting Started

```bash
npm install
npm run dev
```

## Build

```bash
npx tw build
npx tw serve
```

## Project Structure

```
hello-tw/
├── home/              # File-based routing (root)
│   ├── layout.tw        # Root layout (wraps all pages)
│   ├── page.tw          # Home page → /
│   ├── loading.tw       # Loading UI
│   ├── error.tw         # Error boundary
│   ├── not-found.tw     # 404 page
│   ├── about/
│   │   └── page.tw      # → /about
│   └── blog/
│       └── [slug]/
│           └── page.tw      # → /blog/:slug
├── components/         # Reusable components
├── style/              # .tss stylesheets
├─│ lib/                # Utils and helpers (.ts)
├─│ public/             # Static assets
├─│ middleware.twm      # Root middleware
├─│ tw.config.ts        # Framework config
└── package.json
```

## Extensions

| Extension | Purpose |
|-----------|---------|
| .tw | UI components (pages, layouts, loading, error, etc.) |
| .twm | Server-side modules (API routes, middleware) |
| .tss | Styles (CSS + shorthands) |
| .ts | Pure logic / config |

## Routing Rules

- Every route is a directory containing `page.tw`
- `layout.tw` wraps children automatically
- `[slug]/page.tw` creates dynamic routes
- `[...rest]/page.tw` creates catch-all routes
- `[[...optional]]/page.tw` creates optional catch-alls
- `(group)/` creates route groups (hidden from URL)
- `@slot/` creates parallel route slots
- `route.twm` creates API endpoints
