# Navigation hooks

Four hooks for reading (and changing) the current URL. Next.js ships
`usePathname` / `useSearchParams` / `useParams` / `useSelectedLayoutSegment` as
read-only imports; these parse for you, and `useSearchParams` writes back.

```ts
import { usePathname, useSearchParams, useParams, useParamInt, useRouteSegments } from "@tw/runtime";
```

---

## `usePathname()` — with pattern matching

```ts
usePathname();                              // "/blog/hello"
usePathname({ pattern: "/blog/[slug]" });   // { matches: true, params: { slug: "hello" }, score: 0.5 }
```

`score` is 0-1 — the share of segments that matched literally, so you can rank
candidates. `matchPathPattern(path, pattern)` is exported on its own.
Both `[slug]` and `:slug` forms are understood.

## `useSearchParams()` — read **and** write

```ts
const sp = useSearchParams();
sp.get("page");        // "2"
sp.getAll("tag");      // ["a","b"]
sp.has("page");        // true
sp.keys(); sp.entries(); sp.toString();

sp.set("page", "3");   // stage a change
sp.append("tag", "x");
sp.delete("page");
sp.toggle("dark", "1");
await sp.commit();     // push the new URL -- exactly one navigation

// stage several at once
sp.update({ page: 2, sort: "latest", tag: ["a", "b"], drop: null });
await sp.commit();
```

Next's version is read-only — changing a param means calling `router.replace`
yourself. Here `set()` / `update()` stage the change and `commit()` performs
**one** navigation. Staging matters: mutating the URL on every `set()` would
fire a navigation per call.

## `useParams()` — typed, with coercion

```ts
useParams();                       // { id: "42", tags: "a,b" }
useParam("id");                    // "42"
useParam("id", { parse: "int" });  // 42
useParamInt("id");                 // 42
useParamBool("flag");              // true
useParamList("tags");              // ["a", "b"]
```

Parses: `"string" | "int" | "float" | "bool" | "json" | "date"`. A value that
will not parse returns `undefined` rather than `NaN`.

## `useRouteSegments()` — richer than `useSelectedLayoutSegment`

```ts
const info = useRouteSegments();
info.path;      // "/blog/hello"
info.segments;  // [{ value: "blog", type: "static", index: 0 },
                //  { value: "[slug]", type: "dynamic", index: 1, param: "slug", isDynamic: true }]
info.groups;    // route groups like "(marketing)", which are not in the URL
info.isActive("/blog");                    // true  -- ancestors count
info.isActive("/blog", { exact: true });   // false
```

Segment types: `static`, `dynamic`, `catch-all`, `group`. `isActive()` covers
the nav-highlighting case that otherwise needs a second hook.
