/**
 * Tween animation engine -- interpolate values over time with easing.
 * @module runtime/animation
 */

import type { EasingFunction } from "./easing";
import { linear } from "./easing";

export interface TweenOptions {
  duration: number;
  easing?: EasingFunction;
  delay?: number;
  repeat?: number;
  repeatDelay?: number;
  yoyo?: boolean;
  onStart?: () => void;
  onUpdate?: (progress: number, value: number) => void;
  onComplete?: () => void;
  onRepeat?: (count: number) => void;
}

export class Tween {
  private from: number;
  private to: number;
  private duration: number;
  private easing: EasingFunction;
  private delay: number;
  private repeat: number;
  private repeatDelay: number;
  private yoyo: boolean;
  private onStart?: () => void;
  private onUpdate?: (progress: number, value: number) => void;
  private onComplete?: () => void;
  private onRepeat?: (count: number) => void;

  private elapsed: number = 0;
  private delayElapsed: number = 0;
  private repeatCount: number = 0;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private isComplete: boolean = false;
  private direction: number = 1;
  private rafId: number | null = null;
  private lastTime: number = 0;

  constructor(from: number, to: number, options: TweenOptions) {
    this.from = from;
    this.to = to;
    this.duration = options.duration;
    this.easing = options.easing ?? linear;
    this.delay = options.delay ?? 0;
    this.repeat = options.repeat ?? 0;
    this.repeatDelay = options.repeatDelay ?? 0;
    this.yoyo = options.yoyo ?? false;
    this.onStart = options.onStart;
    this.onUpdate = options.onUpdate;
    this.onComplete = options.onComplete;
    this.onRepeat = options.onRepeat;
  }

  start(): this {
    if (this.isRunning) return this;
    this.isRunning = true;
    this.isPaused = false;
    this.isComplete = false;
    this.elapsed = 0;
    this.delayElapsed = 0;
    this.repeatCount = 0;
    this.direction = 1;
    this.onStart?.();
    this.lastTime = performance.now();
    this.tick();
    return this;
  }

  private tick = (): void => {
    if (!this.isRunning || this.isPaused) return;
    const now = performance.now();
    const delta = now - this.lastTime;
    this.lastTime = now;

    if (this.delayElapsed < this.delay) {
      this.delayElapsed += delta;
      this.rafId = requestAnimationFrame(this.tick);
      return;
    }

    this.elapsed += delta;
    const progress = Math.min(this.elapsed / this.duration, 1);
    const easedProgress = this.easing(this.direction === 1 ? progress : 1 - progress);
    const value = this.from + (this.to - this.from) * easedProgress;
    this.onUpdate?.(easedProgress, value);

    if (progress >= 1) {
      if (this.repeatCount < this.repeat) {
        this.repeatCount++;
        this.onRepeat?.(this.repeatCount);
        this.elapsed = 0;
        if (this.yoyo) this.direction *= -1;
        if (this.repeatDelay > 0) {
          this.delayElapsed = 0;
          this.delay = this.repeatDelay;
        }
        this.rafId = requestAnimationFrame(this.tick);
      } else {
        this.isRunning = false;
        this.isComplete = true;
        this.onComplete?.();
      }
    } else {
      this.rafId = requestAnimationFrame(this.tick);
    }
  };

  pause(): this {
    this.isPaused = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    return this;
  }

  resume(): this {
    if (!this.isPaused) return this;
    this.isPaused = false;
    this.lastTime = performance.now();
    this.tick();
    return this;
  }

  stop(): this {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    return this;
  }

  reset(): this {
    this.stop();
    this.elapsed = 0;
    this.delayElapsed = 0;
    this.repeatCount = 0;
    this.direction = 1;
    this.isComplete = false;
    return this;
  }

  complete(): this {
    this.elapsed = this.duration;
    if (this.onUpdate) {
      const value = this.direction === 1 ? this.to : this.from;
      this.onUpdate(1, value);
    }
    this.stop();
    this.isComplete = true;
    this.onComplete?.();
    return this;
  }

  getProgress(): number {
    return Math.min(this.elapsed / this.duration, 1);
  }

  getValue(): number {
    const progress = this.getProgress();
    const easedProgress = this.easing(this.direction === 1 ? progress : 1 - progress);
    return this.from + (this.to - this.from) * easedProgress;
  }

  isPlaying(): boolean {
    return this.isRunning && !this.isPaused;
  }

  isDone(): boolean {
    return this.isComplete;
  }

  seek(time: number): this {
    this.elapsed = Math.max(0, Math.min(time, this.duration));
    const progress = this.getProgress();
    const easedProgress = this.easing(this.direction === 1 ? progress : 1 - progress);
    const value = this.from + (this.to - this.from) * easedProgress;
    this.onUpdate?.(easedProgress, value);
    return this;
  }

  setDuration(duration: number): this {
    this.duration = duration;
    return this;
  }

  setEasing(easing: EasingFunction): this {
    this.easing = easing;
    return this;
  }

  setFrom(value: number): this {
    this.from = value;
    return this;
  }

  setTo(value: number): this {
    this.to = value;
    return this;
  }

  static create(from: number, to: number, duration: number, options: Partial<TweenOptions> = {}): Tween {
    return new Tween(from, to, { duration, ...options });
  }

  static to(value: number, duration: number, options: Partial<TweenOptions> = {}): Tween {
    return new Tween(0, value, { duration, ...options });
  }

  static from(value: number, duration: number, options: Partial<TweenOptions> = {}): Tween {
    return new Tween(value, 0, { duration, ...options });
  }

  static delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const tween = new Tween(0, 1, { duration: ms, onUpdate: () => {}, onComplete: resolve });
      tween.start();
    });
  }
}

export interface TweenGroupOptions {
  onStart?: () => void;
  onUpdate?: () => void;
  onComplete?: () => void;
}

export class TweenGroup {
  private tweens: Set<Tween> = new Set();
  private onStart?: () => void;
  private onUpdate?: () => void;
  private onComplete?: () => void;
  private started: boolean = false;

  constructor(options: TweenGroupOptions = {}) {
    this.onStart = options.onStart;
    this.onUpdate = options.onUpdate;
    this.onComplete = options.onComplete;
  }

  add(tween: Tween): this {
    this.tweens.add(tween);
    return this;
  }

  remove(tween: Tween): this {
    this.tweens.delete(tween);
    return this;
  }

  start(): this {
    if (this.started) return this;
    this.started = true;
    this.onStart?.();
    for (const tween of this.tweens) {
      tween.start();
    }
    this.checkComplete();
    return this;
  }

  private checkComplete = (): void => {
    let allComplete = true;
    for (const tween of this.tweens) {
      if (!tween.isDone()) {
        allComplete = false;
        break;
      }
    }
    if (allComplete) {
      this.onComplete?.();
    } else {
      this.onUpdate?.();
      requestAnimationFrame(this.checkComplete);
    }
  };

  pause(): this {
    for (const tween of this.tweens) tween.pause();
    return this;
  }

  resume(): this {
    for (const tween of this.tweens) tween.resume();
    return this;
  }

  stop(): this {
    for (const tween of this.tweens) tween.stop();
    return this;
  }

  reset(): this {
    for (const tween of this.tweens) tween.reset();
    this.started = false;
    return this;
  }

  size(): number {
    return this.tweens.size;
  }

  isDone(): boolean {
    for (const tween of this.tweens) {
      if (!tween.isDone()) return false;
    }
    return true;
  }

  clear(): this {
    this.tweens.clear();
    return this;
  }
}

export class TweenChain {
  private tweens: Array<() => Tween> = [];
  private current: Tween | null = null;
  private isRunning: boolean = false;
  private onComplete?: () => void;

  constructor(onComplete?: () => void) {
    this.onComplete = onComplete;
  }

  then(tweenFactory: () => Tween): this {
    this.tweens.push(tweenFactory);
    return this;
  }

  start(): this {
    if (this.isRunning) return this;
    this.isRunning = true;
    this.runNext();
    return this;
  }

  private runNext = (): void => {
    if (this.tweens.length === 0) {
      this.isRunning = false;
      this.onComplete?.();
      return;
    }
    const factory = this.tweens.shift()!;
    this.current = factory();
    const originalComplete = this.current["onComplete"];
    this.current["onComplete"] = () => {
      originalComplete?.();
      this.runNext();
    };
    this.current.start();
  };

  stop(): this {
    this.isRunning = false;
    this.current?.stop();
    return this;
  }

  isPlaying(): boolean {
    return this.isRunning;
  }
}

export function tween(from: number, to: number, duration: number, onUpdate: (value: number, progress: number) => void, options: Partial<TweenOptions> = {}): Tween {
  return new Tween(from, to, {
    duration,
    onUpdate: (progress, value) => onUpdate(value, progress),
    ...options,
  }).start();
}

export function tweenTo(to: number, duration: number, onUpdate: (value: number, progress: number) => void, options: Partial<TweenOptions> = {}): Tween {
  return tween(0, to, duration, onUpdate, options);
}

export function tweenFrom(from: number, duration: number, onUpdate: (value: number, progress: number) => void, options: Partial<TweenOptions> = {}): Tween {
  return tween(from, 0, duration, onUpdate, options);
}

export interface PropertyTweenOptions extends Omit<TweenOptions, "onUpdate"> {
  target: Record<string, number>;
  property: string;
}

export function tweenProperty(options: PropertyTweenOptions): Tween {
  const { target, property, duration, ...rest } = options;
  const from = target[property] ?? 0;
  const to = rest["to" as never] as unknown as number;
  return new Tween(from, to, {
    duration,
    onUpdate: (_progress, value) => {
      target[property] = value;
    },
    ...rest,
  }).start();
}

export class ValueTween<T> {
  private from: T;
  private to: T;
  private duration: number;
  private elapsed: number = 0;
  private isRunning: boolean = false;
  private isComplete: boolean = false;
  private interpolate: (from: T, to: T, t: number) => T;
  private onUpdate?: (value: T) => void;
  private onComplete?: () => void;
  private rafId: number | null = null;
  private lastTime: number = 0;

  constructor(
    from: T,
    to: T,
    duration: number,
    interpolate: (from: T, to: T, t: number) => T,
    onUpdate?: (value: T) => void,
    onComplete?: () => void,
  ) {
    this.from = from;
    this.to = to;
    this.duration = duration;
    this.interpolate = interpolate;
    this.onUpdate = onUpdate;
    this.onComplete = onComplete;
  }

  start(): this {
    if (this.isRunning) return this;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.tick();
    return this;
  }

  private tick = (): void => {
    if (!this.isRunning) return;
    const now = performance.now();
    const delta = now - this.lastTime;
    this.lastTime = now;
    this.elapsed += delta;
    const t = Math.min(this.elapsed / this.duration, 1);
    const value = this.interpolate(this.from, this.to, t);
    this.onUpdate?.(value);
    if (t >= 1) {
      this.isRunning = false;
      this.isComplete = true;
      this.onComplete?.();
    } else {
      this.rafId = requestAnimationFrame(this.tick);
    }
  };

  stop(): this {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    return this;
  }

  isDone(): boolean {
    return this.isComplete;
  }
}

export class ColorTween extends ValueTween<string> {
  constructor(
    from: string,
    to: string,
    duration: number,
    onUpdate?: (value: string) => void,
    onComplete?: () => void,
  ) {
    const interpolateColor = (a: string, b: string, t: number): string => {
      const parseHex = (hex: string): [number, number, number] => {
        const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
        return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
      };
      const [ar, ag, ab] = parseHex(a);
      const [br, bg, bb] = parseHex(b);
      const r = Math.round(ar + (br - ar) * t);
      const g = Math.round(ag + (bg - ag) * t);
      const b2 = Math.round(ab + (bb - ab) * t);
      return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b2.toString(16).padStart(2, "0")}`;
    };
    super(from, to, duration, interpolateColor, onUpdate, onComplete);
  }
}

export class ArrayTween extends ValueTween<number[]> {
  constructor(
    from: number[],
    to: number[],
    duration: number,
    onUpdate?: (value: number[]) => void,
    onComplete?: () => void,
  ) {
    const interpolateArray = (a: number[], b: number[], t: number): number[] => {
      return a.map((v, i) => v + (b[i] - v) * t);
    };
    super(from, to, duration, interpolateArray, onUpdate, onComplete);
  }
}

export class ObjectTween<T extends Record<string, number>> extends ValueTween<T> {
  constructor(
    from: T,
    to: T,
    duration: number,
    onUpdate?: (value: T) => void,
    onComplete?: () => void,
  ) {
    const interpolateObject = (a: T, b: T, t: number): T => {
      const result: Record<string, number> = {};
      for (const key in a) {
        result[key] = a[key] + (b[key] - a[key]) * t;
      }
      return result as T;
    };
    super(from, to, duration, interpolateObject, onUpdate, onComplete);
  }
}

export class Sequence {
  private tweens: Tween[] = [];
  private currentIndex: number = 0;
  private isRunning: boolean = false;
  private onComplete?: () => void;

  constructor(onComplete?: () => void) {
    this.onComplete = onComplete;
  }

  add(tween: Tween): this {
    this.tweens.push(tween);
    return this;
  }

  start(): this {
    if (this.isRunning || this.tweens.length === 0) return this;
    this.isRunning = true;
    this.currentIndex = 0;
    this.playCurrent();
    return this;
  }

  private playCurrent = (): void => {
    if (this.currentIndex >= this.tweens.length) {
      this.isRunning = false;
      this.onComplete?.();
      return;
    }
    const tween = this.tweens[this.currentIndex];
    const originalComplete = tween["onComplete"];
    tween["onComplete"] = () => {
      originalComplete?.();
      this.currentIndex++;
      this.playCurrent();
    };
    tween.start();
  };

  stop(): this {
    this.isRunning = false;
    if (this.currentIndex < this.tweens.length) {
      this.tweens[this.currentIndex].stop();
    }
    return this;
  }

  reset(): this {
    this.stop();
    this.currentIndex = 0;
    for (const tween of this.tweens) tween.reset();
    return this;
  }

  isDone(): boolean {
    return !this.isRunning && this.currentIndex >= this.tweens.length;
  }

  getProgress(): number {
    if (this.tweens.length === 0) return 1;
    const completed = this.currentIndex;
    const currentProgress = this.currentIndex < this.tweens.length ? this.tweens[this.currentIndex].getProgress() : 0;
    return (completed + currentProgress) / this.tweens.length;
  }
}

export class Parallel {
  private tweens: Tween[] = [];
  private onComplete?: () => void;
  private isRunning: boolean = false;

  constructor(onComplete?: () => void) {
    this.onComplete = onComplete;
  }

  add(tween: Tween): this {
    this.tweens.push(tween);
    return this;
  }

  start(): this {
    if (this.isRunning) return this;
    this.isRunning = true;
    let completed = 0;
    const total = this.tweens.length;
    for (const tween of this.tweens) {
      const originalComplete = tween["onComplete"];
      tween["onComplete"] = () => {
        originalComplete?.();
        completed++;
        if (completed >= total) {
          this.isRunning = false;
          this.onComplete?.();
        }
      };
      tween.start();
    }
    return this;
  }

  stop(): this {
    this.isRunning = false;
    for (const tween of this.tweens) tween.stop();
    return this;
  }

  isDone(): boolean {
    return this.tweens.every((t) => t.isDone());
  }

  getProgress(): number {
    if (this.tweens.length === 0) return 1;
    return this.tweens.reduce((sum, t) => sum + t.getProgress(), 0) / this.tweens.length;
  }
}

export function stagger(tweens: Tween[], staggerTime: number): Parallel {
  const parallel = new Parallel();
  let delay = 0;
  for (const tween of tweens) {
    const originalStart = tween["onStart"];
    const d = delay;
    tween["onStart"] = undefined;
    setTimeout(() => {
      tween["onStart"] = originalStart;
      tween.start();
    }, d);
    parallel.add(tween);
    delay += staggerTime;
  }
  parallel.start();
  return parallel;
}
