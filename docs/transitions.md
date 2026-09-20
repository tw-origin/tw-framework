# TW Framework — Transitions

This document covers one thing completely: the transition manager — animating elements when they enter, leave or change.

---

## The Manager

```twm
import { createTransitionManager } from "@tw/runtime"

const manager = createTransitionManager(document.body)
```

The manager tracks transitions on the elements under its root and cleans up state for elements that leave the tree.

## Built-In Transitions

`createBuiltinTransitions()` returns the standard set — ready-made transition definitions you can apply by name:

| Name | For |
|------|-----|
| fade | anything appearing or disappearing |
| slide | panels, drawers, list reorders |
| scale | modals, popovers |

```twm
import { createBuiltinTransitions } from "@tw/runtime"

const transitions = createBuiltinTransitions()
transitions.fade   // a transition definition
```

## Applying One

A transition definition pairs with an element lifecycle — entering (from hidden to visible), leaving (visible to removed), or a property change:

```twm
// fade an element in
manager.enter(el, transitions.fade)
```

The manager runs the animation and reports completion, so removal from the DOM waits for the leave transition to finish.

## The Animation Loop

Transitions ride the runtime's animation frame loop (see the `tween`, `easings` exports of `@tw/runtime`) — no new requestAnimationFrame bookkeeping per element.

| API | Purpose |
|-----|---------|
| `createTransitionManager(root)` | manage transitions under a root |
| `createBuiltinTransitions()` | the standard named set |
| `tween(options)` | tween a numeric value with easing |
| `easings` | named easing curves |

## Related

- [Scheduler](./scheduler.md)
- [Client Runtime](./client-runtime.md)
