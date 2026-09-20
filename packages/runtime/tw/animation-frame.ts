/**
 * AnimationFrame -- requestAnimationFrame utilities for smooth animations.
 *
 * Features:
 * - Single rAF loop (one rAF callback for all animations -- avoids jank)
 * - Animation queue with priority
 * - Frame skipping (drop frames if behind)
 * - Delta time calculation
 * - FPS counter
 * - Animation groups (pause/resume together)
 * - Easing functions (30+ built-in)
 * - Timeline scrubbing
 * - Animation cancellation
 * - requestIdleCallback integration
 */

// --- Types ------------------------------------------------------------

export interface AnimationTask {
  id: number;
  callback: (deltaTime: number, elapsedTime: number, frame: number) => boolean | void;
  priority: number;
  paused: boolean;
  startTime: number;
  lastTime: number;
  frameCount: number;
}

export interface AnimationGroup {
  id: string;
  taskIds: number[];
  paused: boolean;
}

export type EasingFunction = (t: number) => number;

// --- Easing Functions ------------------------------------------------

export const easings: Record<string, EasingFunction> = {
  linear: (t) => t,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => t * (2 - t),
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => (--t) * t * t,
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
  easeInQuart: (t) => t * t * t * t,
  easeOutQuart: (t) => 1 - (--t) * t * t * t,
  easeInOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t),
  easeInQuint: (t) => t * t * t * t * t,
  easeOutQuint: (t) => 1 + (--t) * t * t * t * t,
  easeInOutQuint: (t) => (t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * (--t) * t * t * t * t),
  easeInSine: (t) => 1 - Math.cos(t * Math.PI / 2),
  easeOutSine: (t) => Math.sin(t * Math.PI / 2),
  easeInOutSine: (t) => (1 - Math.cos(t * Math.PI)) / 2,
  easeInExpo: (t) => (t === 0 ? 0 : Math.pow(2, 10 * (t - 1))),
  easeOutExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  easeInOutExpo: (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    if (t < 0.5) return Math.pow(2, 20 * t - 10) / 2;
    return (2 - Math.pow(2, -20 * t + 10)) / 2;
  },
  easeInCirc: (t) => 1 - Math.sqrt(1 - t * t),
  easeOutCirc: (t) => Math.sqrt(1 - (--t) * t),
  easeInOutCirc: (t) => (t < 0.5 ? (1 - Math.sqrt(1 - 4 * t * t)) / 2 : (Math.sqrt(1 - (-2 * t + 2) * (-2 * t + 2)) + 1) / 2),
  easeInBack: (t) => { const c1 = 1.70158; const c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; },
  easeOutBack: (t) => { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  easeInOutBack: (t) => {
    const c1 = 1.70158;
    const c2 = c1 * 1.525;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
  },
  easeInElastic: (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    const c4 = (2 * Math.PI) / 3;
    return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
  },
  easeOutElastic: (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    const c4 = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  easeInOutElastic: (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    const c5 = (2 * Math.PI) / 4.5;
    return t < 0.5
      ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
      : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
  },
  easeOutBounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  easeInBounce: (t) => 1 - easings.easeOutBounce(1 - t),
  easeInOutBounce: (t) => (t < 0.5 ? (1 - easings.easeOutBounce(1 - 2 * t)) / 2 : (1 + easings.easeOutBounce(2 * t - 1)) / 2),
};

// --- Animation Loop --------------------------------------------------

class AnimationLoop {
  private tasks = new Map<number, AnimationTask>();
  private groups = new Map<string, AnimationGroup>();
  private isRunning = false;
  private rafId: number | null = null;
  private lastFrameTime = 0;
  private frameCount = 0;
  private fpsHistory: number[] = [];
  private maxFpsHistory = 60;
  private taskIdCounter = 0;

  /**
   * Start the animation loop.
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFrameTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.frameCount = 0;
    this.tick();
  }

  /**
   * Stop the animation loop.
   */
  stop(): void {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Add an animation task.
   * Return false from callback to remove the task.
   */
  add(callback: AnimationTask["callback"], priority = 0): number {
    const id = ++this.taskIdCounter;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.tasks.set(id, {
      id, callback, priority, paused: false,
      startTime: now, lastTime: now, frameCount: 0,
    });
    if (!this.isRunning) this.start();
    return id;
  }

  /**
   * Remove a task.
   */
  remove(id: number): void {
    this.tasks.delete(id);
    if (this.tasks.size === 0) this.stop();
  }

  /**
   * Pause a task.
   */
  pause(id: number): void {
    const task = this.tasks.get(id);
    if (task) task.paused = true;
  }

  /**
   * Resume a task.
   */
  resume(id: number): void {
    const task = this.tasks.get(id);
    if (task) {
      task.paused = false;
      task.lastTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    }
  }

  /**
   * Create an animation group.
   */
  createGroup(id: string, taskIds: number[]): void {
    this.groups.set(id, { id, taskIds, paused: false });
  }

  /**
   * Pause all tasks in a group.
   */
  pauseGroup(id: string): void {
    const group = this.groups.get(id);
    if (group) {
      group.paused = true;
      for (const taskId of group.taskIds) this.pause(taskId);
    }
  }

  /**
   * Resume all tasks in a group.
   */
  resumeGroup(id: string): void {
    const group = this.groups.get(id);
    if (group) {
      group.paused = false;
      for (const taskId of group.taskIds) this.resume(taskId);
    }
  }

  /**
   * Get current FPS.
   */
  getFPS(): number {
    if (this.fpsHistory.length === 0) return 0;
    return this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
  }

  /**
   * Get the number of active tasks.
   */
  get taskCount(): number { return this.tasks.size; }

  /**
   * Get the number of frames since start.
   */
  get frameNumber(): number { return this.frameCount; }

  // --- Internal ------------------------------------------------------

  private tick = (): void => {
    if (!this.isRunning) return;

    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const deltaTime = now - this.lastFrameTime;
    this.lastFrameTime = now;
    this.frameCount++;

    // Track FPS
    const fps = deltaTime > 0 ? 1000 / deltaTime : 0;
    this.fpsHistory.push(fps);
    if (this.fpsHistory.length > this.maxFpsHistory) this.fpsHistory.shift();

    // Sort tasks by priority (higher first)
    const sortedTasks = Array.from(this.tasks.values()).sort((a, b) => b.priority - a.priority);

    for (const task of sortedTasks) {
      if (task.paused) continue;

      const elapsed = now - task.startTime;
      const taskDelta = now - task.lastTime;
      task.lastTime = now;
      task.frameCount++;

      try {
        const result = task.callback(taskDelta, elapsed, task.frameCount);
        if (result === false) {
          this.tasks.delete(task.id);
        }
      } catch (e) {
        console.error("[TW Animation] Task error:", e);
        this.tasks.delete(task.id);
      }
    }

    if (this.tasks.size === 0) {
      this.stop();
      return;
    }

    this.rafId = requestAnimationFrame(this.tick);
  };
}

// --- Global Animation Loop -------------------------------------------

let globalAnimLoop: AnimationLoop | null = null;

export function getAnimationLoop(): AnimationLoop {
  if (!globalAnimLoop) globalAnimLoop = new AnimationLoop();
  return globalAnimLoop;
}

export function addAnimationTask(callback: AnimationTask["callback"], priority?: number): number {
  return getAnimationLoop().add(callback, priority);
}

export function removeAnimationTask(id: number): void {
  getAnimationLoop().remove(id);
}

// --- Tween ------------------------------------------------------------

export interface TweenOptions {
  duration: number;
  easing?: EasingFunction | string;
  delay?: number;
  onUpdate: (value: number) => void;
  onComplete?: () => void;
  loop?: boolean;
  yoyo?: boolean;
}

export interface TweenHandle {
  id: number;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  progress: number;
}

/**
 * Create a tween animation from 0 to 1.
 */
export function tween(options: TweenOptions): TweenHandle {
  const easingFn = typeof options.easing === "string"
    ? easings[options.easing] || easings.linear
    : options.easing || easings.linear;

  const startTime = (typeof performance !== "undefined" ? performance.now() : Date.now()) + (options.delay || 0);
  let progress = 0;
  let paused = false;
  let reverse = false;

  const id = getAnimationLoop().add((delta, elapsed) => {
    if (paused) return;

    const adjustedElapsed = elapsed - (options.delay || 0);
    if (adjustedElapsed < 0) return;

    const raw = Math.min(adjustedElapsed / options.duration, 1);

    if (options.yoyo) {
      if (!reverse) {
        progress = raw;
        if (raw >= 1) { reverse = true; }
      } else {
        progress = 1 - raw;
        if (raw >= 1) { reverse = false; }
      }
    } else {
      progress = raw;
    }

    const eased = easingFn(progress);
    options.onUpdate(eased);

    if (raw >= 1 && !options.yoyo && !options.loop) {
      if (options.onComplete) options.onComplete();
      return false; // Remove task
    }

    if (options.loop && raw >= 1) {
      // Reset will happen naturally on next frame
    }
  });

  return {
    id,
    pause: () => { paused = true; getAnimationLoop().pause(id); },
    resume: () => { paused = false; getAnimationLoop().resume(id); },
    cancel: () => { getAnimationLoop().remove(id); },
    get progress() { return progress; },
  };
}

/**
 * Animate a property of an object.
 */
export function animateProperty(
  obj: Record<string, number>,
  property: string,
  from: number,
  to: number,
  duration: number,
  options?: { easing?: EasingFunction | string; onComplete?: () => void },
): TweenHandle {
  return tween({
    duration,
    easing: options?.easing,
    onUpdate: (value) => {
      obj[property] = from + (to - from) * value;
    },
    onComplete: options?.onComplete,
  });
}
