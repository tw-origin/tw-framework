# TW Framework — Component API

This document covers one thing completely: `defineComponent` — defining components in TypeScript with props, state, computed values, methods, and lifecycle hooks — plus `memo`, `forwardRef`, `Fragment`, and `withScope`.

---

## defineComponent

```twm
import { defineComponent, createVNode } from "@tw/runtime"

const Counter = defineComponent({
  name: "Counter",

  props: [
    "start",                                    // shorthand: prop name
    { name: "step", type: Number, required: false, default: 1 },
  ],

  data(this: any, props) {                       // reactive state factory
    return { count: props.start ?? 0 }
  },

  computed: {                                     // cached derived values
    doubled(this: any) { return this.count * 2 },
  },

  methods: {                                     // callable from templates/handlers
    increment(this: any) { this.count += this.step },
    reset(this: any) { this.count = this.props.start ?? 0 },
  },

  render(this: any) {                             // virtual DOM output
    return createVNode("button", {
      class: "counter",
      onClick: () => this.increment(),
    }, [String(this.count) + " (x2 = " + this.doubled + ")"])
  },

  mounted(this: any) { console.log("Counter ready at", this.count) },
  beforeUnmount(this: any) { console.log("Counter leaving") },
})
```

## ComponentOptions

| Field | Form |
|-------|------|
| `name` | Component name (keep-alive, devtools) |
| `props` | `(keyof P)[]` or `{ name, type?, required?, default? }[]` |
| `setup` | `(props, ctx) => render function` — alternative to `data`+`render` |
| `data` | `(props) => S` initial state |
| `computed` | `Record<string, (this: S & { props }) => unknown>` |
| `methods` | `Record<string, function>` bound to the component instance |
| `render` | `(this) => VNode \| VNodeChild[] \| null` |
| `mounted`, `beforeUnmount` | Lifecycle hooks |

### setup vs data+render

`setup(props, ctx)` returns a render function and composes with signals for full control:

```twm
const Timer = defineComponent({
  props: ["label"],
  setup(props, ctx) {
    let seconds = 0
    return () => createVNode("span", {}, [props.label + ": " + seconds])
  },
})
```

`ctx` (SetupContext) exposes `emit(event, ...args)` for parent events and `attrs` for non-prop attributes.

## memo

Wraps a component so it re-renders only when its props actually change (shallow compare):

```twm
import { memo } from "@tw/runtime"

const ExpensiveRow = memo(Row)
```

Use for pure, expensive children in large lists. Props that are new objects every render defeat the comparison — pass stable references.

## forwardRef

Forwards the DOM ref to a wrapped component:

```twm
import { forwardRef } from "@tw/runtime"

const FancyInput = forwardRef(BaseInput)
// <FancyInput ref={inputRef} /> forwards inputRef to BaseInput's root element
```

## Fragment

Render multiple root nodes:

```twm
import { Fragment, fragment, createVNode } from "@tw/runtime"

createVNode(Fragment, null, [
  createVNode("dt", {}, ["Term"]),
  createVNode("dd", {}, ["Definition"]),
])
// fragment() is the empty-children shorthand
```

## withScope

Runs a function inside a component's reactive scope — effects created inside are owned by the scope and disposed with it:

```twm
import { withScope } from "@tw/runtime"

withScope(componentScope, () => {
  watchSignal(...)      // auto-disposed when the scope dies
})
```

## Rules

- `render` may return a single `VNode`, an array, or `null`.
- `computed` members are cached; they recompute only when the state they read changes.
- `methods` are auto-bound — safe to pass directly as handlers.
- Lifecycle hooks: `mounted` after DOM insertion, `beforeUnmount` before removal (clean up timers and listeners there).
