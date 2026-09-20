# TW Framework — Tips: Syntax

This is a quick-fire collection of practical syntax tips — the small habits that keep `.tw` files clean. Each links to the full document.

---

## File Order — Always the Same

```tw
// 1. imports    2. page { }    3. state { }    4. markup
```

Consistent order makes every file scannable. [Syntax Overview](./syntax-guide.md)

## Quote Text, Brace Values

```tw
p "Hello {name}"       // text + interpolation
img :src "user.avatar"  // binding — no braces
```

## Class Chaining Beats class=""

```tw
div.card.active.visible { }    // fast to read, fast to write
```

## Group State for Objects

```tw
state {
  user = { name: "Aarav", role: "admin" }   // not three loose vars
}
```

`"{user.name}"` reads better than three interpolations, and passing `user={user}` to a component is one prop. [State](./syntax-state.md)

## Bare Loop Variable in Handlers

```tw
for t in {todos} {
  button on:click "remove(t)" { "x" }      // t — no quotes, no braces
}
```

Quotes make it the *string* `"t"`; braces are for interpolations. [Loops](./syntax-loops.md)

## .prevent on Every Form

```tw
form on:submit.prevent "save()" { }        // no page reload, ever
```

[Events](./syntax-events.md)

## :class for State-Driven Styling

```tw
div :class "done ? 'complete' : 'pending'" { }
```

Never build class strings by hand in handlers. [Bindings](./syntax-bindings.md)

## Components Own Structure, Pages Own Data

```tw
Card title="{post.title}" {        // page supplies data
  p "{post.body}"                   // page supplies content
}
```

The component stays reusable; nothing page-specific lives in it. [Components](./syntax-components.md)

## Private Folders for Non-Routes

```text
_components/    ← never a URL, never scanned
```

[Project Structure](./project-tree.md)

## Interpolate Attributes, Don't Concatenate

```tw
a "Read" { href "/blog/{post.slug}" }      // right
// not: href handled by a handler
```

[Attributes](./syntax-attributes.md)

## Keep Conditions in the Template

```tw
if items.length == 0 { p "Nothing yet" }   // visible, testable
```

State stays a source of truth; the template decides presentation. [Conditionals](./syntax-conditionals.md)

## One Topic Per File

```tw
// PageA.tw        — one page's markup
// components/B.tw — one reusable piece
```

The compiler does not care, but every reader does.
