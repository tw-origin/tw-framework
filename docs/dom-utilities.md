# TW Framework — DOM Utilities

This document covers one thing completely: the element finding, traversal, attribute, style, and event helpers exported by `@tw/runtime` — the layer beneath directives and components.

---

## Event Helpers

```twm
import { on, once } from "@tw/runtime"

const off = on(button, "click", (e) => save(), { passive: false })
once(dialog, "close", () => console.log("closed"))
off()                                  // remove the listener
```

`on(element, type, handler, options?)` returns an unsubscribe function — prefer it over `removeEventListener` bookkeeping. Options match the DOM (`capture`, `passive`, `once`).

## Finding and Traversal

```twm
import { find, findAll, closest } from "@tw/runtime"

const row = find(list, ".row.active")          // querySelector scoped to a root
const cells = findAll(row, "td")                // querySelectorAll scoped
const panel = closest(input, "[role=panel]")    // Element.closest
```

| Function | Purpose |
|----------|---------|
| `find(root, selector)` | First descendant matching the selector |
| `findAll(root, selector)` | All descendants matching |
| `closest(el, selector)` | Nearest ancestor (or self) matching |
| `isElement(value)` | Safe DOM-node check for untrusted values |

## Creating and Shaping Nodes

```twm
import { createElement, createText, append, prepend, insertBefore, replaceChild, remove } from "@tw/runtime"

const badge = createElement("span")
createText("New")                       // text node
append(list, item)                       // appendChild
prepend(list, item)                      // insertBefore firstChild
insertBefore(anchor, node)               // node before anchor
replaceChild(oldNode, newNode)
remove(node)                              // detach from parent safely
```

## Attributes and Classes

```twm
import { setAttr, getAttr, hasAttr, removeAttr, setAttrs } from "@tw/runtime"

setAttr(input, "aria-label", "Search")
getAttr(input, "value") ?? ""
hasAttr(form, "novalidate")
removeAttr(el, "hidden")
setAttrs(el, { role: "switch", "aria-checked": "true" })

import { addClass, removeClass, toggleClass, hasClass, setClasses } from "@tw/runtime"

addClass(el, "visible")
removeClass(el, "visible")
toggleClass(el, "open")
hasClass(el, "open")
setClasses(el, ["card", "card--active"])   // replaces the full class list
```

## Styles and Geometry

```twm
import { setStyle, setStyles, getStyle, removeStyle, styleToString } from "@tw/runtime"

setStyle(el, "transform", "translateX(10px)")
setStyles(el, { opacity: "0", transform: "scale(1.2)" })
getStyle(el, "display")
removeStyle(el, "opacity")
styleToString({ margin: "0", padding: "4px" })   // for inline style strings

import { getOffset, getScrollParent, isInViewport, scrollTo } from "@tw/runtime"

getOffset(el)            // { top, left } relative to the document
getScrollParent(el)      // nearest scrollable ancestor
isInViewport(el)         // boolean
scrollTo(el, { top: 0, behavior: "smooth" })
```

## Batched DOM Reads and Writes

```twm
import { readDOM, writeDOM } from "@tw/runtime"

const measurements = readDOM(() => {
  return rows.map(row => row.getBoundingClientRect().height)   // forced layout ONCE
})

writeDOM(() => {
  rows.forEach((row, i) => { row.style.height = measurements[i] + "px" })  // write once
})
```

`readDOM` batches layout reads so the browser computes style once; `writeDOM` batches mutations. Alternating raw reads and writes per element forces layout each time — the wrappers keep list updates fast.

## Practical Pattern

```twm
import { find, findAll, on, addClass, removeClass } from "@tw/runtime"

const tabs = findAll(tabBar, "[role=tab]")
tabs.forEach((tab, i) => {
  const off = on(tab, "click", () => {
    tabs.forEach(t => removeClass(t, "active"))
    addClass(tab, "active")
    select(i)
  })
  offs.push(off)
})
```
