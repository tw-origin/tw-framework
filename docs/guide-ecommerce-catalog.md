# TW Framework — Guide: Building a Product Catalog

This guide covers one thing completely: a storefront catalog — category browsing, product detail pages, a cart and the API that powers checkout.

---

## The Route Shape

```text
home/
├── layout.tw                      ← store chrome
├── shop/
│   ├── layout.tw                   ← shop section: filters + grid shell
│   ├── page.tw                     ← /shop — all products
│   ├── [category]/
│   │   └── page.tw                 ← /shop/electronics
│   └── [category]/
│       └── [slug]/
│           └── page.tw             ← /shop/electronics/widget-1
└── api/
    ├── cart/route.twm              ← add / list cart items
    └── checkout/route.twm          ← place the order
```

## The Product Grid

```tw
// home/shop/[category]/page.tw
page { title "Shop — MyStore" render ssr }

state {
  products = [
    { id: 1, name: "Widget", price: 499, image: "/img/widget.jpg" },
    { id: 2, name: "Gadget", price: 999, image: "/img/gadget.jpg" }
  ]
}

div.grid {
  for p in {products} {
    div.product-card {
      img :src "p.image" alt "p.name"
      h3 "{p.name}"
      span "₹{p.price}"
      button on:click "addToCart(p.id)" { "Add to cart" }
    }
  }
}
```

## The Product Page

```tw
// home/shop/[category]/[slug]/page.tw
page { title "Widget — MyStore" render ssr }

head {
  meta property "og:type" content "product"
  meta property "og:image" content "/img/widget.jpg"
}

div.product {
  img.product-image src "/img/widget.jpg" alt "Widget"
  div.product-info {
    h1 "Widget"
    p.price "₹ 499"
    p "The widget does everything you need."
    button "Add to cart" on:click "addToCart(1)" { }
  }
}
```

## The Cart

```tw
// in the shop layout — visible on every shop page
state { cart = [] cartOpen = false }

div.cart-bar {
  button on:click "cartOpen = !cartOpen" { "Cart ({cart.length})" }

  if cartOpen {
    div.cart-panel {
      for item in {cart} {
        div.cart-row {
          span "{item.name} × {item.qty}"
          button on:click "cart = cart.filter(x => x.id !== item.id)" { "x" }
        }
      }
      if cart.length == 0 { p "Your cart is empty" }
      if cart.length > 0 {
        button "Checkout" on:click "checkout()" { }
      }
    }
  }
}
```

## The APIs

```twm
// home/api/cart/route.twm
fn post(request) {
  const body = request.body || {}
  if (!body.id) {
    return { status: 400, json: { error: "id required" } }
  }
  // validate the product exists, return the cart line
  return { status: 200, json: { ok: true, item: { id: body.id, qty: body.qty || 1 } } }
}
```

```twm
// home/api/checkout/route.twm
fn post(request) {
  const body = request.body || {}
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return { status: 400, json: { error: "Cart is empty" } }
  }
  const total = body.items.reduce((sum, i) => sum + (i.price * i.qty), 0)
  return { status: 201, json: { ok: true, orderId: Date.now(), total } }
}
```

Validate prices **server-side** — never trust totals computed in the browser.

## Protecting Checkout

```twm
rule "checkout-rate" {
  match "/api/checkout"
  rate_limit { requests 10 window 300 identity "ip" }
  response { status 429 json { error "Too many attempts" } }
}
```

And require the same-origin on the endpoint:

```twm
rule "checkout-origin" {
  match "/api/checkout"
  origin { require true allow_referer true }
  response { status 403 json { error "Bad origin" } }
}
```

## Rendering Choice per Page

| Page | Mode | Why |
|------|------|-----|
| Product grid | `ssr` | fresh inventory, SEO |
| Product detail | `ssr` | per-product meta tags |
| Cart panel | island/interactive part | live quantity updates |

## Related

- [Fetching Data](./guide-data-fetching.md) · [Forms](./guide-forms.md)
- [Security](./security.md) · [SEO](./guide-seo.md)
