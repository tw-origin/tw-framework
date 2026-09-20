/**
 * Animation Timeline -- orchestrates multiple tweens and animations.
 * @module runtime/animation
 */

import { Tween, TweenGroup, TweenChain, Sequence, Parallel } from "./tween";
import type { EasingFunction } from "./easing";

export interface TimelineOptions {
  repeat?: number;
  yoyo?: boolean;
  delay?: number;
  autoStart?: boolean;
}

export interface TimelineTrack {
  name: string;
  tweens: Tween[];
  offset: number;
}

export class Timeline {
  private tracks: TimelineTrack[] = [];
  private currentTrack: TimelineTrack | null = null;
  private options: TimelineOptions;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private elapsed: number = 0;
  private duration: number = 0;
  private startTime: number = 0;
  private rafId: number | null = null;
  private repeatCount: number = 0;
  private direction: number = 1;
  private callbacks: {
    onStart?: () => void;
    onUpdate?: (progress: number) => void;
    onComplete?: () => void;
    onRepeat?: (count: number) => void;
  } = {};

  constructor(options: TimelineOptions = {}) {
    this.options = {
      repeat: 0,
      yoyo: false,
      delay: 0,
      autoStart: false,
      ...options,
    };
  }

  track(name: string): this {
    this.currentTrack = { name, tweens: [], offset: this.duration };
    this.tracks.push(this.currentTrack);
    return this;
  }

  add(tween: Tween, offset?: number): this {
    if (!this.currentTrack) this.track("default");
    const track = this.currentTrack!;
    if (offset !== undefined) {
      tween["delay"] = offset;
    }
    track.tweens.push(tween);
    const tweenEnd = (offset ?? 0) + (tween["duration"] ?? 0) + (tween["delay"] ?? 0);
    if (tweenEnd > this.duration) this.duration = tweenEnd;
    return this;
  }

  to(from: number, to: number, duration: number, onUpdate: (value: number) => void, offset?: number): this {
    const tween = new Tween(from, to, { duration, onUpdate: (_p, v) => onUpdate(v) });
    return this.add(tween, offset);
  }

  fromTo(from: number, to: number, duration: number, onUpdate: (value: number) => void, offset?: number): this {
    return this.to(from, to, duration, onUpdate, offset);
  }

  delay(ms: number): this {
    this.duration += ms;
    return this;
  }

  call(fn: () => void, offset?: number): this {
    setTimeout(fn, (offset ?? 0) + (this.options.delay ?? 0));
    return this;
  }

  repeat(count: number): this {
    this.options.repeat = count;
    return this;
  }

  yoyo(enabled: boolean = true): this {
    this.options.yoyo = enabled;
    return this;
  }

  onStart(fn: () => void): this {
    this.callbacks.onStart = fn;
    return this;
  }

  onUpdate(fn: (progress: number) => void): this {
    this.callbacks.onUpdate = fn;
    return this;
  }

  onComplete(fn: () => void): this {
    this.callbacks.onComplete = fn;
    return this;
  }

  onRepeat(fn: (count: number) => void): this {
    this.callbacks.onRepeat = fn;
    return this;
  }

  start(): this {
    if (this.isRunning) return this;
    this.isRunning = true;
    this.isPaused = false;
    this.elapsed = 0;
    this.repeatCount = 0;
    this.direction = 1;
    this.callbacks.onStart?.();
    this.startTime = performance.now();
    this.startTweens();
    this.tick();
    return this;
  }

  private startTweens(): void {
    for (const track of this.tracks) {
      for (const tween of track.tweens) {
        let delay = (tween["delay"] ?? 0);
        if (delay <= this.elapsed) {
          if (!tween.isPlaying() && !tween.isDone()) {
            tween.start();
          }
        } else {
          setTimeout(() => {
            if (this.isRunning && !this.isPaused) tween.start();
          }, delay - this.elapsed);
        }
      }
    }
  }

  private tick = (): void => {
    if (!this.isRunning || this.isPaused) return;
    const now = performance.now();
    this.elapsed = now - this.startTime;
    const progress = Math.min(this.elapsed / this.duration, 1);
    const easedProgress = this.direction === 1 ? progress : 1 - progress;
    this.callbacks.onUpdate?.(easedProgress);

    if (progress >= 1) {
      if (this.repeatCount < (this.options.repeat ?? 0)) {
        this.repeatCount++;
        this.callbacks.onRepeat?.(this.repeatCount);
        this.elapsed = 0;
        this.startTime = now;
        if (this.options.yoyo) this.direction *= -1;
        for (const track of this.tracks) {
          for (const tween of track.tweens) tween.reset();
        }
        this.startTweens();
        this.rafId = requestAnimationFrame(this.tick);
      } else {
        this.isRunning = false;
        this.callbacks.onComplete?.();
      }
    } else {
      this.rafId = requestAnimationFrame(this.tick);
    }
  };

  pause(): this {
    this.isPaused = true;
    for (const track of this.tracks) {
      for (const tween of track.tweens) tween.pause();
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    return this;
  }

  resume(): this {
    if (!this.isPaused) return this;
    this.isPaused = false;
    this.startTime = performance.now() - this.elapsed;
    for (const track of this.tracks) {
      for (const tween of track.tweens) tween.resume();
    }
    this.tick();
    return this;
  }

  stop(): this {
    this.isRunning = false;
    for (const track of this.tracks) {
      for (const tween of track.tweens) tween.stop();
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    return this;
  }

  reset(): this {
    this.stop();
    this.elapsed = 0;
    this.repeatCount = 0;
    this.direction = 1;
    for (const track of this.tracks) {
      for (const tween of track.tweens) tween.reset();
    }
    return this;
  }

  seek(time: number): this {
    this.elapsed = Math.max(0, Math.min(time, this.duration));
    const progress = this.elapsed / this.duration;
    this.callbacks.onUpdate?.(progress);
    return this;
  }

  getProgress(): number {
    return Math.min(this.elapsed / this.duration, 1);
  }

  getDuration(): number {
    return this.duration;
  }

  isPlaying(): boolean {
    return this.isRunning && !this.isPaused;
  }

  isDone(): boolean {
    return !this.isRunning && this.elapsed >= this.duration;
  }

  reverse(): this {
    this.direction *= -1;
    return this;
  }

  timeScale(scale: number): this {
    return this;
  }

  clear(): this {
    this.tracks = [];
    this.currentTrack = null;
    this.duration = 0;
    this.elapsed = 0;
    return this;
  }

  getTracks(): TimelineTrack[] {
    return [...this.tracks];
  }

  getTrack(name: string): TimelineTrack | undefined {
    return this.tracks.find((t) => t.name === name);
  }

  removeTrack(name: string): this {
    this.tracks = this.tracks.filter((t) => t.name !== name);
    return this;
  }
}

export class KeyframeAnimation {
  private keyframes: Array<{ time: number; value: number; easing?: EasingFunction }> = [];
  private duration: number;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private elapsed: number = 0;
  private startTime: number = 0;
  private rafId: number | null = null;
  private currentValue: number = 0;
  private onUpdate?: (value: number) => void;
  private onComplete?: () => void;

  constructor(duration: number, onUpdate?: (value: number) => void, onComplete?: () => void) {
    this.duration = duration;
    this.onUpdate = onUpdate;
    this.onComplete = onComplete;
  }

  addKeyframe(time: number, value: number, easing?: EasingFunction): this {
    this.keyframes.push({ time, value, easing });
    this.keyframes.sort((a, b) => a.time - b.time);
    return this;
  }

  start(): this {
    if (this.isRunning || this.keyframes.length === 0) return this;
    this.isRunning = true;
    this.startTime = performance.now();
    this.tick();
    return this;
  }

  private tick = (): void => {
    if (!this.isRunning || this.isPaused) return;
    const now = performance.now();
    this.elapsed = now - this.startTime;
    const progress = Math.min(this.elapsed / this.duration, 1);

    if (this.keyframes.length === 1) {
      this.currentValue = this.keyframes[0].value;
    } else {
      let prev = this.keyframes[0];
      let next = this.keyframes[this.keyframes.length - 1];
      for (let i = 0; i < this.keyframes.length - 1; i++) {
        if (this.keyframes[i].time <= progress && this.keyframes[i + 1].time >= progress) {
          prev = this.keyframes[i];
          next = this.keyframes[i + 1];
          break;
        }
      }
      const segmentProgress = (progress - prev.time) / Math.max(next.time - prev.time, 0.0001);
      const easedProgress = prev.easing ? prev.easing(segmentProgress) : segmentProgress;
      this.currentValue = prev.value + (next.value - prev.value) * easedProgress;
    }

    this.onUpdate?.(this.currentValue);

    if (progress >= 1) {
      this.isRunning = false;
      this.onComplete?.();
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
    this.startTime = performance.now() - this.elapsed;
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

  getValue(): number {
    return this.currentValue;
  }

  getProgress(): number {
    return Math.min(this.elapsed / this.duration, 1);
  }

  isDone(): boolean {
    return !this.isRunning && this.elapsed >= this.duration;
  }
}

export class AnimationController {
  private animations: Set<Tween | Timeline | KeyframeAnimation> = new Set();
  private isPaused: boolean = false;

  add(animation: Tween | Timeline | KeyframeAnimation): this {
    this.animations.add(animation);
    return this;
  }

  remove(animation: Tween | Timeline | KeyframeAnimation): this {
    this.animations.delete(animation);
    return this;
  }

  startAll(): this {
    for (const animation of this.animations) {
      if ("start" in animation) animation.start();
    }
    return this;
  }

  pauseAll(): this {
    this.isPaused = true;
    for (const animation of this.animations) {
      if ("pause" in animation) animation.pause();
    }
    return this;
  }

  resumeAll(): this {
    this.isPaused = false;
    for (const animation of this.animations) {
      if ("resume" in animation) animation.resume();
    }
    return this;
  }

  stopAll(): this {
    for (const animation of this.animations) {
      if ("stop" in animation) animation.stop();
    }
    return this;
  }

  resetAll(): this {
    for (const animation of this.animations) {
      if ("reset" in animation) animation.reset();
    }
    return this;
  }

  clear(): this {
    this.stopAll();
    this.animations.clear();
    return this;
  }

  isAllDone(): boolean {
    for (const animation of this.animations) {
      if ("isDone" in animation && !animation.isDone()) return false;
    }
    return true;
  }

  size(): number {
    return this.animations.size;
  }

  getActiveCount(): number {
    let count = 0;
    for (const animation of this.animations) {
      if ("isPlaying" in animation && animation.isPlaying()) count++;
    }
    return count;
  }

  waitForAll(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.isAllDone()) {
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    });
  }
}

export function animate(
  from: number,
  to: number,
  duration: number,
  easing: EasingFunction | undefined,
  onUpdate: (value: number) => void,
  onComplete?: () => void,
): Tween {
  const tween = new Tween(from, to, {
    duration,
    easing,
    onUpdate: (_progress, value) => onUpdate(value),
    onComplete,
  });
  return tween.start();
}

export function animateTo(
  to: number,
  duration: number,
  onUpdate: (value: number) => void,
  onComplete?: () => void,
): Tween {
  return animate(0, to, duration, undefined, onUpdate, onComplete);
}

export function animateFrom(
  from: number,
  duration: number,
  onUpdate: (value: number) => void,
  onComplete?: () => void,
): Tween {
  return animate(from, 0, duration, undefined, onUpdate, onComplete);
}

export function staggered(
  items: Array<{ from: number; to: number; duration: number; easing?: EasingFunction }>,
  staggerTime: number,
  onUpdate: (index: number, value: number) => void,
  onComplete?: () => void,
): TweenGroup {
  const group = new TweenGroup({ onComplete });
  let delay = 0;
  for (let i = 0; i < items.length; i++) {
    const { from, to, duration, easing } = items[i];
    const index = i;
    setTimeout(() => {
      const tween = new Tween(from, to, {
        duration,
        easing,
        delay: 0,
        onUpdate: (_progress, value) => onUpdate(index, value),
      });
      tween.start();
      group.add(tween);
    }, delay);
    delay += staggerTime;
  }
  return group;
}

export function sequence(
  items: Array<{ from: number; to: number; duration: number; easing?: EasingFunction }>,
  onUpdate: (index: number, value: number) => void,
  onComplete?: () => void,
): Sequence {
  const seq = new Sequence(onComplete);
  for (let i = 0; i < items.length; i++) {
    const { from, to, duration, easing } = items[i];
    const index = i;
    seq.add(new Tween(from, to, {
      duration,
      easing,
      onUpdate: (_progress, value) => onUpdate(index, value),
    }));
  }
  return seq;
}

export function parallel(
  items: Array<{ from: number; to: number; duration: number; easing?: EasingFunction }>,
  onUpdate: (index: number, value: number) => void,
  onComplete?: () => void,
): Parallel {
  const par = new Parallel(onComplete);
  for (let i = 0; i < items.length; i++) {
    const { from, to, duration, easing } = items[i];
    const index = i;
    par.add(new Tween(from, to, {
      duration,
      easing,
      onUpdate: (_progress, value) => onUpdate(index, value),
    }));
  }
  return par;
}

export function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const tween = new Tween(0, 1, { duration: ms, onComplete: resolve });
    tween.start();
  });
}

export function createTimeline(options?: TimelineOptions): Timeline {
  return new Timeline(options);
}

export function createKeyframeAnimation(duration: number, onUpdate?: (value: number) => void): KeyframeAnimation {
  return new KeyframeAnimation(duration, onUpdate);
}

export function createAnimationController(): AnimationController {
  return new AnimationController();
}

export class SpringAnimation {
  private position: number;
  private velocity: number = 0;
  private target: number;
  private stiffness: number;
  private damping: number;
  private mass: number;
  private isRunning: boolean = false;
  private rafId: number | null = null;
  private lastTime: number = 0;
  private onUpdate?: (value: number) => void;
  private onComplete?: () => void;
  private threshold: number = 0.01;

  constructor(
    initial: number,
    target: number,
    stiffness: number = 100,
    damping: number = 10,
    mass: number = 1,
    onUpdate?: (value: number) => void,
    onComplete?: () => void,
  ) {
    this.position = initial;
    this.target = target;
    this.stiffness = stiffness;
    this.damping = damping;
    this.mass = mass;
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
    const dt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    let force = -this.stiffness * (this.position - this.target);
    const dampForce = -this.damping * this.velocity;
    const acceleration = (force + dampForce) / this.mass;
    this.velocity += acceleration * dt;
    this.position += this.velocity * dt;

    this.onUpdate?.(this.position);

    if (Math.abs(this.position - this.target) < this.threshold && Math.abs(this.velocity) < this.threshold) {
      this.position = this.target;
      this.isRunning = false;
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

  setTarget(target: number): this {
    this.target = target;
    if (!this.isRunning) this.start();
    return this;
  }

  getValue(): number {
    return this.position;
  }

  getVelocity(): number {
    return this.velocity;
  }

  isDone(): boolean {
    return !this.isRunning;
  }
}

export function spring(
  from: number,
  to: number,
  stiffness: number = 100,
  damping: number = 10,
  onUpdate: (value: number) => void,
  onComplete?: () => void,
): SpringAnimation {
  return new SpringAnimation(from, to, stiffness, damping, 1, onUpdate, onComplete).start();
}

export class PhysicsAnimation {
  private position: number;
  private velocity: number = 0;
  private acceleration: number = 0;
  private force: number = 0;
  private mass: number;
  private friction: number;
  private gravity: number = 0;
  private isRunning: boolean = false;
  private rafId: number | null = null;
  private lastTime: number = 0;
  private onUpdate?: (value: number, velocity: number) => void;
  private onComplete?: () => void;
  private bounds: { min: number; max: number } | null = null;
  private bounce: number = 0.8;

  constructor(
    initial: number,
    mass: number = 1,
    friction: number = 0.1,
    onUpdate?: (value: number, velocity: number) => void,
    onComplete?: () => void,
  ) {
    this.position = initial;
    this.mass = mass;
    this.friction = friction;
    this.onUpdate = onUpdate;
    this.onComplete = onComplete;
  }

  applyForce(force: number): this {
    this.force += force;
    return this;
  }

  setGravity(gravity: number): this {
    this.gravity = gravity;
    return this;
  }

  setBounds(min: number, max: number, bounce: number = 0.8): this {
    this.bounds = { min, max };
    this.bounce = bounce;
    return this;
  }

  setVelocity(velocity: number): this {
    this.velocity = velocity;
    return this;
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
    const dt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    this.acceleration = (this.force + this.gravity * this.mass) / this.mass;
    this.velocity += this.acceleration * dt;
    this.velocity *= (1 - this.friction);
    this.position += this.velocity * dt;

    if (this.bounds) {
      if (this.position < this.bounds.min) {
        this.position = this.bounds.min;
        this.velocity = -this.velocity * this.bounce;
      }
      if (this.position > this.bounds.max) {
        this.position = this.bounds.max;
        this.velocity = -this.velocity * this.bounce;
      }
    }

    this.onUpdate?.(this.position, this.velocity);
    this.force = 0;

    if (Math.abs(this.velocity) < 0.001 && Math.abs(this.acceleration) < 0.001) {
      this.isRunning = false;
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

  getPosition(): number {
    return this.position;
  }

  getVelocity(): number {
    return this.velocity;
  }

  isDone(): boolean {
    return !this.isRunning;
  }
}

export function physics(
  initial: number,
  options: { mass?: number; friction?: number; gravity?: number; velocity?: number },
  onUpdate: (value: number, velocity: number) => void,
  onComplete?: () => void,
): PhysicsAnimation {
  const { mass = 1, friction = 0.1, gravity = 0, velocity = 0 } = options;
  const anim = new PhysicsAnimation(initial, mass, friction, onUpdate, onComplete);
  anim.setGravity(gravity);
  anim.setVelocity(velocity);
  return anim.start();
}

export class DragAnimation {
  private position: number;
  private dragOffset: number = 0;
  private isDragging: boolean = false;
  private physics: PhysicsAnimation;
  private onUpdate?: (value: number) => void;

  constructor(initial: number, onUpdate?: (value: number) => void) {
    this.position = initial;
    this.onUpdate = onUpdate;
    this.physics = new PhysicsAnimation(initial, 1, 0.15, (value) => {
      this.position = value;
      this.onUpdate?.(value);
    });
  }

  startDrag(position: number): this {
    this.isDragging = true;
    this.dragOffset = position - this.position;
    this.physics.stop();
    return this;
  }

  drag(position: number): this {
    if (!this.isDragging) return this;
    this.position = position - this.dragOffset;
    this.onUpdate?.(this.position);
    return this;
  }

  endDrag(velocity: number = 0): this {
    if (!this.isDragging) return this;
    this.isDragging = false;
    this.physics.setVelocity(velocity);
    this.physics.start();
    return this;
  }

  getPosition(): number {
    return this.position;
  }

  isBeingDragged(): boolean {
    return this.isDragging;
  }

  isAnimating(): boolean {
    return !this.isDragging && !this.physics.isDone();
  }
}

export function createDragAnimation(initial: number, onUpdate?: (value: number) => void): DragAnimation {
  return new DragAnimation(initial, onUpdate);
}
