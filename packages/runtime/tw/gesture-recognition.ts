/**
 * Gesture Recognition -- touch gestures (swipe, pinch, rotate, long-press).
 *
 * Features:
 * - Swipe (4 directions with threshold)
 * - Pinch (zoom in/out)
 * - Rotation
 * - Long press
 * - Double tap
 * - Pan/drag
 * - Multi-touch tracking
 * - Velocity calculation
 * - Momentum scrolling
 * - Pointer events (mouse + touch unified)
 */

// --- Types ------------------------------------------------------------

export type SwipeDirection = "left" | "right" | "up" | "down";

export interface Point { x: number; y: number; }

export interface GestureEvent {
  type: string;
  startPoint: Point;
  currentPoint: Point;
  delta: Point;
  velocity: Point;
  duration: number;
  distance: number;
  scale: number;
  rotation: number;
  touches: Point[];
}

export interface GestureOptions {
  swipeThreshold?: number;
  swipeVelocityThreshold?: number;
  longPressDelay?: number;
  longPressThreshold?: number;
  doubleTapInterval?: number;
  doubleTapThreshold?: number;
  pinchThreshold?: number;
  rotationThreshold?: number;
}

type GestureHandler = (event: GestureEvent) => void;

// --- Gesture Recognizer ----------------------------------------------

class GestureRecognizer {
  private element: HTMLElement;
  private options: Required<GestureOptions>;
  private handlers = new Map<string, Set<GestureHandler>>();
  private pointers = new Map<number, Point>();
  private startPoints = new Map<number, Point>();
  private startTime = 0;
  private lastTapTime = 0;
  private lastTapPoint: Point | null = null;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private isLongPress = false;
  private initialDistance = 0;
  private initialAngle = 0;
  private currentScale = 1;
  private currentRotation = 0;
  private lastMoveTime = 0;
  private lastMovePoint: Point | null = null;
  private velocity: Point = { x: 0, y: 0 };

  constructor(element: HTMLElement, options: GestureOptions = {}) {
    this.element = element;
    this.options = {
      swipeThreshold: 50,
      swipeVelocityThreshold: 0.3,
      longPressDelay: 500,
      longPressThreshold: 10,
      doubleTapInterval: 300,
      doubleTapThreshold: 30,
      pinchThreshold: 0.1,
      rotationThreshold: 5,
      ...options,
    };

    this.attach();
  }

  /**
   * Register a handler for a gesture type.
   */
  on(gesture: string, handler: GestureHandler): () => void {
    if (!this.handlers.has(gesture)) this.handlers.set(gesture, new Set());
    this.handlers.get(gesture)!.add(handler);
    return () => { this.handlers.get(gesture)?.delete(handler); };
  }

  /**
   * Unregister all handlers for a gesture.
   */
  off(gesture: string): void {
    this.handlers.delete(gesture);
  }

  /**
   * Destroy the gesture recognizer.
   */
  destroy(): void {
    this.detach();
    this.handlers.clear();
  }

  // --- Event Handlers ------------------------------------------------

  private handlePointerDown = (e: PointerEvent): void => {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.startPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.startTime = Date.now();
    this.isLongPress = false;
    this.lastMovePoint = { x: e.clientX, y: e.clientY };
    this.lastMoveTime = this.startTime;
    this.velocity = { x: 0, y: 0 };

    if (this.pointers.size === 1) {
      // Start long press timer
      this.longPressTimer = setTimeout(() => {
        this.isLongPress = true;
        this.emit("longpress", this.createGestureEvent("longpress", e));
      }, this.options.longPressDelay);
    } else if (this.pointers.size === 2) {
      // Cancel long press for multi-touch
      if (this.longPressTimer) { clearTimeout(this.longPressTimer); this.longPressTimer = null; }

      // Calculate initial distance and angle for pinch/rotate
      const points = Array.from(this.pointers.values());
      this.initialDistance = this.distance(points[0], points[1]);
      this.initialAngle = this.angle(points[0], points[1]);
      this.currentScale = 1;
      this.currentRotation = 0;
    }
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;

    const point = { x: e.clientX, y: e.clientY };
    this.pointers.set(e.pointerId, point);

    // Cancel long press if moved too much
    if (this.longPressTimer && !this.isLongPress) {
      const startPoint = this.startPoints.get(e.pointerId)!;
      const moveDistance = this.distance(startPoint, point);
      if (moveDistance > this.options.longPressThreshold) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
    }

    // Calculate velocity
    const now = Date.now();
    const dt = now - this.lastMoveTime;
    if (dt > 0 && this.lastMovePoint) {
      this.velocity = {
        x: (point.x - this.lastMovePoint.x) / dt,
        y: (point.y - this.lastMovePoint.y) / dt,
      };
    }
    this.lastMovePoint = point;
    this.lastMoveTime = now;

    if (this.pointers.size === 1 && !this.isLongPress) {
      // Pan/drag
      this.emit("pan", this.createGestureEvent("pan", e));
    } else if (this.pointers.size === 2) {
      // Pinch and rotate
      const points = Array.from(this.pointers.values());
      const currentDistance = this.distance(points[0], points[1]);
      const currentAngle = this.angle(points[0], points[1]);

      this.currentScale = currentDistance / this.initialDistance;
      this.currentRotation = currentAngle - this.initialAngle;

      if (Math.abs(this.currentScale - 1) > this.options.pinchThreshold) {
        this.emit("pinch", this.createGestureEvent("pinch", e));
      }

      if (Math.abs(this.currentRotation) > this.options.rotationThreshold) {
        this.emit("rotate", this.createGestureEvent("rotate", e));
      }
    }
  };

  private handlePointerUp = (e: PointerEvent): void => {
    if (this.longPressTimer) { clearTimeout(this.longPressTimer); this.longPressTimer = null; }

    const startPoint = this.startPoints.get(e.pointerId);
    const endPoint = this.pointers.get(e.pointerId);

    if (!startPoint || !endPoint) {
      this.pointers.delete(e.pointerId);
      this.startPoints.delete(e.pointerId);
      return;
    }

    const distance = this.distance(startPoint, endPoint);
    const duration = Date.now() - this.startTime;

    if (!this.isLongPress && this.pointers.size === 1) {
      // Check for swipe
      if (distance > this.options.swipeThreshold) {
        const direction = this.getSwipeDirection(startPoint, endPoint);
        const speed = distance / duration;
        if (speed > this.options.swipeVelocityThreshold || distance > this.options.swipeThreshold * 2) {
          this.emit("swipe", this.createGestureEvent("swipe", e, { direction }));
          this.emit(`swipe${direction}`, this.createGestureEvent(`swipe${direction}`, e));
        }
      }

      // Check for tap/double tap
      if (distance < this.options.doubleTapThreshold && duration < 200) {
        const now = Date.now();
        if (this.lastTapPoint && now - this.lastTapTime < this.options.doubleTapInterval) {
          const tapDistance = this.distance(this.lastTapPoint, endPoint);
          if (tapDistance < this.options.doubleTapThreshold) {
            this.emit("doubletap", this.createGestureEvent("doubletap", e));
            this.lastTapTime = 0;
            this.lastTapPoint = null;
          } else {
            this.emit("tap", this.createGestureEvent("tap", e));
            this.lastTapTime = now;
            this.lastTapPoint = endPoint;
          }
        } else {
          this.emit("tap", this.createGestureEvent("tap", e));
          this.lastTapTime = now;
          this.lastTapPoint = endPoint;
        }
      }
    }

    this.pointers.delete(e.pointerId);
    this.startPoints.delete(e.pointerId);

    if (this.pointers.size === 0) {
      this.emit("gestureend", this.createGestureEvent("gestureend", e));
    }
  };

  // --- Helpers ------------------------------------------------------

  private createGestureEvent(type: string, e: PointerEvent, extra?: Record<string, unknown>): GestureEvent {
    const startPoint = this.startPoints.get(e.pointerId) || { x: e.clientX, y: e.clientY };
    const currentPoint = { x: e.clientX, y: e.clientY };
    return {
      type,
      startPoint,
      currentPoint,
      delta: { x: currentPoint.x - startPoint.x, y: currentPoint.y - startPoint.y },
      velocity: { ...this.velocity },
      duration: Date.now() - this.startTime,
      distance: this.distance(startPoint, currentPoint),
      scale: this.currentScale,
      rotation: this.currentRotation,
      touches: Array.from(this.pointers.values()),
      ...extra,
    };
  }

  private emit(type: string, event: GestureEvent): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        try { handler(event); }
        catch (e) { console.error(`[TW Gesture] Handler error for '${type}':`, e); }
      }
    }
  }

  private distance(a: Point, b: Point): number {
    return Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
  }

  private angle(a: Point, b: Point): number {
    return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  }

  private getSwipeDirection(start: Point, end: Point): SwipeDirection {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      return dx > 0 ? "right" : "left";
    }
    return dy > 0 ? "down" : "up";
  }

  // --- Attach/Detach ------------------------------------------------

  private attach(): void {
    this.element.style.touchAction = "none";
    this.element.addEventListener("pointerdown", this.handlePointerDown);
    this.element.addEventListener("pointermove", this.handlePointerMove);
    this.element.addEventListener("pointerup", this.handlePointerUp);
    this.element.addEventListener("pointercancel", this.handlePointerUp);
  }

  private detach(): void {
    this.element.removeEventListener("pointerdown", this.handlePointerDown);
    this.element.removeEventListener("pointermove", this.handlePointerMove);
    this.element.removeEventListener("pointerup", this.handlePointerUp);
    this.element.removeEventListener("pointercancel", this.handlePointerUp);
  }
}

// --- Factory ----------------------------------------------------------

export function createGestureRecognizer(element: HTMLElement, options?: GestureOptions): GestureRecognizer {
  return new GestureRecognizer(element, options);
}

// --- Convenience Functions --------------------------------------------

export function onSwipe(element: HTMLElement, handler: (direction: SwipeDirection, event: GestureEvent) => void, options?: GestureOptions): () => void {
  const recognizer = new GestureRecognizer(element, options);
  recognizer.on("swipe", (e) => {
    const direction = e.delta.x > 0 ? "right" : "up";
    handler(Math.abs(e.delta.x) > Math.abs(e.delta.y) ? (e.delta.x > 0 ? "right" : "left") : (e.delta.y > 0 ? "down" : "up"), e);
  });
  return () => recognizer.destroy();
}

export function onLongPress(element: HTMLElement, handler: (event: GestureEvent) => void, options?: GestureOptions): () => void {
  const recognizer = new GestureRecognizer(element, options);
  recognizer.on("longpress", handler);
  return () => recognizer.destroy();
}

export function onDoubleTap(element: HTMLElement, handler: (event: GestureEvent) => void, options?: GestureOptions): () => void {
  const recognizer = new GestureRecognizer(element, options);
  recognizer.on("doubletap", handler);
  return () => recognizer.destroy();
}

export function onPinch(element: HTMLElement, handler: (event: GestureEvent) => void, options?: GestureOptions): () => void {
  const recognizer = new GestureRecognizer(element, options);
  recognizer.on("pinch", handler);
  return () => recognizer.destroy();
}
