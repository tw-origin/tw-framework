# @tw/plugin-sitemap

Official TW Framework plugin — serves **`/sitemap.xml`** and **`/robots.txt`**
generated from the pages your app already has. No build step, no extra files to
keep in sync.

## Install

```bash
tw plugin install @tw/plugin-sitemap
```

That installs the package and enables it. Then give it your site origin:

```ts
// tw.config.ts
export default {
  plugins: [
    {
      name: "@tw/plugin-sitemap",
      options: { siteUrl: "https://example.com" },
    },
  ],
};
```

Start the server with Bun (`tw serve`) and open `/sitemap.xml`.

## What it does

- `GET /sitemap.xml` — every static route, discovered by walking `home/`:
  `home/page.tw` → `/`, `home/about/page.tw` → `/about`,
  `home/(app)/dash/page.tw` → `/dash` (route groups are not part of the URL).
- `GET /robots.txt` — allows everything and points at the sitemap.

Dynamic routes (`blog/[slug]/page.tw`) cannot be read from the file system, so
list the concrete URLs yourself:

```ts
options: {
  siteUrl: "https://example.com",
  routes: ["/blog/hello-world", "/blog/folders-are-routes"],
}
```

## Options

| Option | Default | Meaning |
|--------|---------|---------|
| `siteUrl` | — | **Required.** Absolute origin, e.g. `https://example.com`. |
| `exclude` | `[]` | Paths to drop. `*` matches one segment, `**` matches any. |
| `routes` | `[]` | Extra paths to include (for dynamic routes). |
| `includeApi` | `false` | Also list `route.twm` endpoints. |
| `changefreq` | `"weekly"` | `<changefreq>` on every entry. |
| `priority` | `0.5` | `<priority>` on every entry. |
| `robots` | `true` | Serve `/robots.txt` as well. |
| `rootDir` | `process.cwd()` | Project root to scan. |

### Excluding paths

```ts
options: {
  siteUrl: "https://example.com",
  exclude: ["/admin/**", "/draft/*", "/thanks"],
}
```

`*` matches within one path segment; `**` matches across segments.

## Notes

- A sitemap needs absolute URLs, so `siteUrl` is required. Without it the plugin
  warns once at startup and leaves `/sitemap.xml` to your app.
- If your app already defines `/robots.txt` (a `public/robots.txt` or a route),
  set `robots: false` so this plugin does not shadow it.

## License

MIT
