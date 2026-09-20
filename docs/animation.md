# TW Framework — Animation

This document covers one thing completely: the animation utilities exported by `@tw/runtime` — `animateProperty`, `tween`, the shared animation loop, and the easing library.

---

## The Shared Animation Loop

Every animation runs on one shared `requestAnimationFrame` loop, so thousands of tweens cost one rAF subscription.

```twm
import { addAnimationTask, removeAnimationTask, getAnimationLoop } from "@tw/runtime"

// Run a callback every frame until removed (return true to self-remove).
const id = addAnimationTask((dt, elapsed, frame) => {
  console.log("frame delta", dt)
}, 10 /* priority: lower numbers run first */)

removeAnimationTask(id)          // stop the task
getAnimationLoop().running       // inspect the shared loop
```

| API | Purpose |
|-----|---------|
| `addAnimationTask(callback, priority?)` | Register a per-frame callback; returns a task id |
| `removeAnimationTask(id)` | Unregister a task |
| `getAnimationLoop()` | The shared loop (`.running`, start/stop are managed internally) |

The callback receives `(deltaTime, elapsedTime, frame)` — frame delta, elapsed time (ms), and the frame counter; returning `true` removes the task.

## animateProperty

Animates one numeric property of an object from one value to another.

```twm
import { animateProperty } from "@tw/runtime"

const box = { width: 0 }
animateProperty(box, "width", 0, 400, 800, {
  easing: "easeOutCubic",       // EasingFunction or its name
  onComplete: () => console.log("done"),
})
// box.width smoothly goes 0 -> 400 over 800ms
```

```twm
animateProperty(obj, property, from, to, duration, options?)
```

| Parameter | Type | Meaning |
|-----------|------|---------|
| `obj` | `Record<string, number>` | Object holding the property |
| `property` | `string` | Numeric property name |
| `from`, `to` | `number` | Start and end values |
| `duration` | `number` | Milliseconds |
| `options.easing` | `EasingFunction \| string` | Easing function or name (default `linear`) |
| `options.onComplete` | `() => void` | Called when the tween finishes |

## tween

The lower-level primitive both return a `TweenHandle`.

```twm
import { tween } from "@tw/runtime"

const handle = tween(0, 100, 1000, (value, progress) => {
  console.log(value, progress)   // interpolated value, 0..1 progress
}, {
  duration: 1000,               // see TweenOptions below
  easing: "easeInOutQuad",
  delay: 200,
  repeat: 2,                     // play 3 times total
  repeatDelay: 100,
  yoyo: true,                     // play backwards on every other repeat
  onStart: () => console.log("start"),
  onUpdate: (progress, value) => {},
  onComplete: () => console.log("complete"),
  onRepeat: (count) => console.log("repeat", count),
})
```

`TweenHandle` exposes `.stop()` to cancel early.

### TweenOptions

| Option | Default | Meaning |
|--------|---------|---------|
| `duration` | — | Length in milliseconds (required) |
| `easing` | `linear` | `EasingFunction` or its registered name |
| `delay` | `0` | Wait before starting |
| `repeat` | `0` | Extra repetitions |
| `repeatDelay` | `0` | Pause between repeats |
| `yoyo` | `false` | Reverse direction on alternate repeats |
| `onStart` / `onUpdate` / `onComplete` / `onRepeat` | — | Lifecycle callbacks |

## Easings

Import the library and pass a function — or its string name — to any `easing` option.

```twm
import { easings } from "@tw/runtime"

easings.easeOutCubic            // (t: number) => number
easings["easeInOutElastic"]     // string-indexed access also works
```

Available functions (all `(t: number) => number`, `t` in `0..1`):

`linear`, `easeInQuad`, `easeOutQuad`, `easeInOutQuad`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, `easeInQuart`, `easeOutQuart`, `easeInOutQuart`, `easeInQuint`, `easeOutQuint`, `easeInOutQuint`, `easeInSine`, `easeOutSine`, `easeInOutSine`, `easeInExpo`, `easeOutExpo`, `easeInOutExpo`, `easeInCirc`, `easeOutCirc`, `easeInOutCirc`, `easeInElastic`, `easeOutElastic`, `easeInOutElastic`, `easeInBack`, `easeOutBack`, `easeInOutBack`, `easeInBounce`, `easeOutBounce`, `easeInOutBounce`

## Choosing Between the APIs

- One numeric property on an object → `animateProperty`
- Full control over the interpolated values → `tween`
- Anything custom that must run per-frame → `addAnimationTask`
