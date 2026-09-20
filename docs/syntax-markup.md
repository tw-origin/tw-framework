# TW Framework — Markup & Elements

This document covers one thing completely: writing elements in a `.tw` file — tags, classes, text, children, self-closing elements and comments.

---

## The Element Form

Every element follows one shape:

```tw
tag.class-name "optional text" {
  // optional attributes
  // optional children
}
```

All parts except the tag are optional:

| Part | Syntax | Required |
|------|--------|----------|
| Tag | `div`, `h1`, `img`, ... | Yes |
| Classes | `.card.active` after the tag | No |
| Text | `"quoted string"` before `{ }` | No |
| Attributes | `name "value"` inside `{ }` | No |
| Children | nested elements inside `{ }` | No |

---

## Basic Elements

### Empty element

```tw
div { }
```
Renders: `<div></div>`

### Element with class (dot notation)

```tw
div.container { }
div.card.active { }
section.hero.dark { }
```
Renders: `<div class="container"></div>`, `<div class="card active"></div>`, `<section class="hero dark"></section>`

Multiple classes chain directly — no quotes, no commas.

### Element with text

```tw
h1 "Hello World"
p "This is a paragraph"
span "© 2026"
```
Renders: `<h1>Hello World</h1>`, ...

### Element with attributes

```tw
a href "/about" target "_blank" { "About" }
img src "/logo.png" alt "Logo"
input type "email" placeholder "Enter email"
```

Attributes are `name "value"` pairs, written inside the braces. See [Attributes](./syntax-attributes.md) for the complete rules.

### Element with text and attributes

```tw
a.nav-link "About" {
  href "/about"
}
```
Renders: `<a class="nav-link" href="/about">About</a>`

### Element with children

```tw
div.container {
  h1 "Title"
  p "Description"
  button "Click me"
}
```

Nesting is unlimited. Indentation is for readability — the braces define the structure:

```tw
div {
  section.hero {
    div.container {
      h1 "Deeply nested"
      p "Still fine"
    }
  }
}
```

### Element with text AND children

```tw
div.card "Card Title" {
  p "Card description"
  a "Read more" { href "/post/1" }
}
```
Renders: `<div class="card">Card Title<p>...</p><a ...>Read more</a></div>`

---

## Self-Closing and Void Elements

These HTML tags never have children, so the braces are optional:

```tw
img src "/logo.png" alt "Logo"
input type "text" value "{name}"
br
hr
```

The full list of auto-closing (void) elements: `area`, `base`, `br`, `col`, `embed`, `hr`, `img`, `input`, `link`, `meta`, `param`, `source`, `track`, `wbr`.

Writing `br { }` is valid but unnecessary; writing `div` without braces when it has no text is not — use `div { }`.

---

## Comments

```tw
// Single-line comment — the compiler ignores it

div.container {
  h1 "Hello"            // inline comment
  // p "This line is commented out"
}
```

Comments exist only in the source. They are stripped from the compiled HTML — nothing leaks to the browser.

---

## Whitespace and Text

Text content is the quoted string before the braces. To put text inside children, place it on its own element:

```tw
p {
  "You can also write text"
}
```

Plain (unquoted) words inside braces are attributes or child elements — they are not text. Always quote text:

```tw
p "Correct quoted text"          // ✓
```

---

## HTML Entities and Special Characters

Quoted text passes through to HTML, so entities work as-is:

```tw
p "Price: ₹ 499"
span "5 < 10"
```

---

## Component Tags

An imported component is used exactly like an element — capitalized tag, same body rules:

```tw
import Card from "@./components/Card.tw"

Card {
  h3 "Title"
  p "Content"
}
```

Component tags look like elements, but they are expanded at compile time. Full rules in [Components](./syntax-components.md).

---

## Style and Script Blocks

A `.tw` file can carry its own style block:

```tw
div.card {
  h1 "Title"
}

style {
  .card {
    bg #fff
    p 20px
    br 8px
  }
}
```

The compiler extracts the block and merges it into the page's CSS output. See [TSS Syntax](./tss-syntax.md).

---

## Complete Example

```tw
page { title "Markup Demo" render ssr }

div.page {
  header.site-header {
    nav.nav {
      a.brand "MySite" { href "/" }
      div.links {
        a "Home" { href "/" }
        a "About" { href "/about" }
        a "Contact" { href "/contact" }
      }
    }
  }

  main.content {
    section.hero "Welcome" {
      p "This is the hero section."
      a.cta "Get Started" { href "/signup" }
    }

    div.grid {
      div.card "First" {
        p "Card one content"
        a "More" { href "/1" }
      }
      div.card "Second" {
        p "Card two content"
        a "More" { href "/2" }
      }
    }
  }

  footer.site-footer {
    hr
    p "© 2026 MySite"
  }
}
```

---

## Quick Reference

```tw
tag                          // void element
tag { }                      // empty element
tag.class { }                // with class
tag "text"                   // with text
tag.class "text" { }         // text + class
tag.class "text" { attr "value" }   // everything
tag { child "text" { } }     // children nest
// comment
```

## Related

- [Syntax Overview](./syntax-guide.md)
- [Attributes](./syntax-attributes.md)
- [Interpolation](./syntax-interpolation.md)
- [Head Block](./syntax-head-block.md)
