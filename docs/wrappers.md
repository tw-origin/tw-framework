# Request and response wrappers

```ts
import { TWRequest, TWResponse, twRequest } from "tw";
```

Thin wrappers that compose with the rest of the runtime API layer, so
`req.ip()` just works:

```ts
export function GET(req: TWRequest) {
  if (req.geo().country !== "IN") return TWResponse.redirect("/global");
  return TWResponse.json({ ip: req.ip().ip, mobile: req.ua().isMobile });
}
```

---

## `TWRequest`

| Member | Gives you |
|---|---|
| `pathname`, `url`, `method`, `hash` | URL parts |
| `searchParams()` | read **and** write |
| `param(name, "int" \| "float" \| "bool")` | a coerced query value |
| `header(name)` / `headers()` | request headers |
| `ip()` | `ClientIp` — address with provenance |
| `geo()` | `Geo` — city, country, flag, `isEU`, `distanceTo` |
| `ua()` | parsed user agent |
| `cookies` | a `CookieJar` — read and stage writes |
| `json()` / `text()` / `formData()` | body readers |

### `CookieJar`

```ts
req.cookies.get("sid");
req.cookies.set("sid", "abc", { secure: true, sameSite: "Lax" });
req.cookies.delete("old");
req.cookies.setCookieHeaders();    // staged Set-Cookie values
```

Nothing is sent until you flush — so a handler can decide late.

---

## `TWResponse`

```ts
TWResponse.json(data, 201);
TWResponse.html(markup);
TWResponse.text(body);
TWResponse.redirect("/a", { preserveQuery: req.toRequest() });
TWResponse.noContent();
TWResponse.json({}).withCookies(req.cookies);   // flush the jar onto it
```
