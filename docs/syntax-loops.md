# TW Framework — Loops

This document covers one thing completely: `for` and `while` loops — rendering lists, arrays of objects, indexes, per-item events and live re-rendering.

---

## for — Over an Array

```tw
state {
  items = ["Apple", "Banana", "Cherry"]
}

for item in {items} {
  div.card {
    h3 "{item}"
  }
}
```

- The list is a **bare expression in braces**: `for item in {items}`
- The loop variable (`item`) is used bare in interpolations: `"{item}"`
- One iteration renders per element

---

## for — With Index

```tw
for item, index in {items} {
  div.row {
    span "#{index + 1}. "
    span "{item}"
  }
}
```

The second name captures the zero-based index.

---

## for — Over an Array of Objects

The most common real-world shape:

```tw
state {
  posts = [
    { title: "First Post", slug: "first-post", date: "2026-01-01" },
    { title: "Second Post", slug: "second-post", date: "2026-02-01" }
  ]
}

for post in {posts} {
  article.post {
    h2 "{post.title}"
    p "{post.date}"
    a "Read" { href "/blog/{post.slug}" }
  }
}
```

---

## Per-Item Event Handlers

Handlers inside a loop close over the current iteration's item. Write the loop variable **bare** in the handler expression — no quotes, no braces:

```tw
state {
  todos = [
    { id: 1, text: "Write docs" },
    { id: 2, text: "Ship release" }
  ]
}

for t in {todos} {
  li "{t.text}"
    button on:click "todos = todos.filter(x => x.id !== t.id)" { "x" }
}
```

The runtime substitutes the current iteration's item into the handler, so each remove button removes exactly its own row. The same works for selecting, toggling and editing:

```tw
for t in {todos} {
  li :class "t.done ? 'done' : ''" on:click "t.done = !t.done" {
    "{t.text}"
  }
}
```

---

## Live Lists

Loops re-render when the list they read changes:

```tw
state { items = ["One"] }

button on:click "items.push('Another')" { "Add" }
button on:click "items = items.slice(0, -1)" { "Remove last" }

for item, i in {items} {
  p "#{i + 1}: {item}"
}
```

Adding or removing elements updates the rendered rows in place. Loop items keep object identity across re-renders, which is what makes per-item handlers stable.

---

## while

```tw
state { loading = true }

while loading {
  div.spinner { "Loading..." }
}
```

`while` renders its body while the condition is truthy. The condition is a bare expression like `if`. In the browser, the block re-evaluates when `loading` changes.

---

## Nesting

Loops nest inside each other, inside conditionals, and inside elements:

```tw
for category in {categories} {
  section.category {
    h2 "{category.name}"
    if category.products.length > 0 {
      div.grid {
        for product in {category.products} {
          div.card {
            h3 "{product.title}"
            span "₹{product.price}"
          }
        }
      }
    } else {
      p "No products yet"
    }
  }
}
```

---

## Everything Available Inside an Iteration

| What | How |
|------|-----|
| The item | `"{item}"`, `"{item.field}"` |
| The index | `for item, index in {list}` then `"{index}"` |
| Item fields in attributes | `href "/blog/{post.slug}"` |
| Bound attributes | `:class "t.done ? 'done' : ''"` |
| Per-item events | `on:click "remove(t)"` — bare `t` |
| Nested loops | a `for` inside a `for` |

---

## Common Mistakes

### Quoting the list

```tw
for item in items { }          // wrong — needs braces
for item in "items" { }        // wrong — that's the string "items"
for item in {items} { }        // right
```

### Quoting the loop variable in handlers

```tw
button on:click "remove('t')" { }    // wrong — the string 't'
button on:click "remove(t)" { }      // right — this iteration's item
```

### Reading the loop variable outside the loop

`item` exists only inside the loop body. Outside, use the state list directly.

### Mutating while iterating via index

Prefer filter/map/assignment expressions over index surgery:

```tw
on:click "todos = todos.filter(x => x.id !== t.id)"   // clear and correct
```

---

## Quick Reference

```tw
for item in {list} { }
for item, index in {list} { }
for post in {posts} { "{post.title}" }
while condition { }
// per-item handler:
button on:click "remove(t)" { }
```

## Related

- [Conditionals](./syntax-conditionals.md)
- [State](./syntax-state.md)
- [Events](./syntax-events.md) — per-item handlers
- [Client Runtime](./client-runtime.md) — how lists re-render
