# TW Framework — Gesture Recognition

This document covers one thing completely: `createGestureRecognizer`, `onSwipe`, `onLongPress`, `onDoubleTap`, and `onPinch` — touch and pointer gestures exported by `@tw/runtime`.

---

## createGestureRecognizer

Attaches a gesture recognizer to an element and returns it. Register listeners on named gestures, or use the shortcut helpers below.

```twm
import { createGestureRecognizer } from "@tw/runtime"

const recognizer = createGestureRecognizer(sliderElement, {
  swipeThreshold: 40,             // px before a swipe counts
  swipeVelocityThreshold: 0.5,    // px/ms — fast short drags still count
  longPressDelay: 500,            // ms of holding before longpress fires
  longPressThreshold: 10,        // px of movement that cancels a long press
  doubleTapInterval: 300,         // ms between taps that form a doubletap
  doubleTapThreshold: 30,         // px between taps of one doubletap
  pinchThreshold: 0.3,            // relative scale change before pinch fires
  rotationThreshold: 15,          // degrees before rotate fires
})

recognizer.on("swipe", (e) => {})
recognizer.on("swipeleft", (e) => {})
recognizer.on("tap", (e) => {})
recognizer.destroy()               // detach all listeners
```

Gesture events emitted by the recognizer:

| Event | Fires when |
|-------|-----------|
| `swipe` | A drag passes the distance/velocity threshold — direction on `e` |
| `swipeleft`, `swiperight`, `swipeup`, `swipedown` | Direction-specific swipes |
| `tap` | Quick touch with no significant movement |
| `doubletap` | Two taps within `doubleTapInterval` |
| `longpress` | Hold past `longPressDelay` without moving beyond threshold |
| `pinch` | Two-finger scale change past `pinchThreshold` |
| `rotate` | Two-finger rotation past `rotationThreshold` |

## GestureEvent

Every handler receives one `GestureEvent`:

```twm
{
  type: "swipe",
  startPoint: { x, y },     // where the gesture began
  currentPoint: { x, y },   // latest position
  delta: { x, y },          // currentPoint - startPoint
  velocity: { x, y },       // px per millisecond
  duration: 245,            // ms since gesture start
  distance: 180,            // total travel in px
  scale: 1.4,               // pinch scale factor
  rotation: 22,             // rotation in degrees
  touches: [{ x, y }],     // all active touch points
}
```

## Shortcut Helpers

Each returns its own unsubscribe function.

```twm
import { onSwipe, onLongPress, onDoubleTap, onPinch } from "@tw/runtime"

const offSwipe = onSwipe(card, (direction, event) => {
  // direction: "left" | "right" | "up" | "down"
  if (direction === "right") like(card)
})

const offLongPress = onLongPress(item, (event) => showContextMenu(event.currentPoint))

const offDoubleTap = onDoubleTap(image, (event) => zoomIn(event))

const offPinch = onPinch(canvas, (event) => setZoom(event.scale))

offSwipe(); offLongPress(); offDoubleTap(); offPinch()   // teardown
```

## Tuning for the App

- Fast flickable carousels: lower `swipeVelocityThreshold` so short fast swipes register.
- Scroll-safe long-press menus: raise `longPressThreshold` slightly so page scroll doesn't cancel the menu.
- Zoomable viewers: lower `pinchThreshold` for responsive zoom; keep `rotationThreshold` above accidental twist.

Gestures work with touch and pointer events; the recognizer handles listener wiring and cleanup — always call `destroy()` (or the returned unsubscribe) when the element leaves the DOM.
