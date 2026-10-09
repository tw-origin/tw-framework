# Cache

Scoped first, global second.

```ts
import { cache, cached, draftMode } from "tw";
```

---

## `cache(name)` — the primary API

```ts
const products = cache("products");

await products.get(key);
await products.set(key, value, { tags: ["products"], revalidate: "5m" });
await products.delete(key);
await products.has(key);
await products.keys();
products.stats();               // { entries, hits, misses, evictions }
```

One giant global object gets messy, so a name scopes the keys and the tags.

**Tags** are how you invalidate a group:

```ts
await products.invalidateTag("products");       // -> number dropped
await products.invalidateImage("/hero.png");    // tagged image:/hero.png
await products.clear();                         // this namespace only
```

`revalidate` takes a duration string (`"5m"`) or ms; omit it for no expiry.

## `getCache()` — the global handle

The same object with no namespace, for when you really want everything.
`resetCache()` clears every namespace (mostly for tests).

---

## `cached(fn, opts)` — a **stable** name

Next ships `unstable_cache`. This one is stable, and does two things it does not:

```ts
const getProducts = cached(async (page: number) => fetchProducts(page), {
  key: "products",
  tags: ["products"],
  revalidate: "1m",
  staleWhileRevalidate: true,
  onHit: (k) => metrics.hit(k),
  onMiss: (k) => metrics.miss(k),
});

await getProducts(1);
await getProducts.invalidate();
getProducts.tag;    // the tag every entry carries
```

- **Stale-while-revalidate** — after the TTL, the stale value is served *and* a
  refresh runs in the background. Callers never wait.
- **Hit/miss callbacks** — for your metrics.
- **Concurrent misses are de-duplicated** — three parallel calls run the
  function once.

---

## `draftMode()` — signed preview mode

```ts
const dm = draftMode(req);
dm.isEnabled;
const header = await dm.enable();    // a Set-Cookie value
dm.disable();
```

Call `setDraftSecret(secret)` at startup and the enabling cookie is
**signed** — so preview mode cannot be turned on by guessing the cookie name,
which is the gap in the usual implementation.

```ts
await verifyDraftCookie(value, secret);   // true / false
```
