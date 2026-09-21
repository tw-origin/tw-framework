var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// packages/runtime/tw/dependency-graph.ts
var currentEffect = null;
var batchDepth = 0;
var batchedEffects = /* @__PURE__ */ new Set();
function startBatch() {
  batchDepth++;
}
function endBatch() {
  batchDepth--;
  if (batchDepth <= 0) {
    batchDepth = 0;
    const effects = Array.from(batchedEffects);
    batchedEffects.clear();
    for (const eff of effects) {
      try {
        eff();
      } catch (e) {
        console.error("[TW Reactivity] Batch effect error:", e);
      }
    }
  }
}
function batch(fn) {
  startBatch();
  try {
    fn();
  } finally {
    endBatch();
  }
}
var SignalImpl = class {
  constructor(value, equals) {
    __publicField(this, "value");
    __publicField(this, "subscribers", /* @__PURE__ */ new Set());
    __publicField(this, "equals");
    this.value = value;
    this.equals = equals || ((a, b) => a === b);
  }
  get() {
    if (currentEffect) {
      this.subscribers.add(currentEffect);
    }
    return this.value;
  }
  set(value) {
    if (this.equals(this.value, value)) return;
    this.value = value;
    if (batchDepth > 0) {
      for (const sub of this.subscribers) {
        batchedEffects.add(sub);
      }
    } else {
      const subs = Array.from(this.subscribers);
      for (const sub of subs) {
        try {
          sub();
        } catch (e) {
          console.error("[TW Reactivity] Signal subscriber error:", e);
        }
      }
    }
  }
  update(fn) {
    this.set(fn(this.value));
  }
  peek() {
    return this.value;
  }
  unsubscribe(sub) {
    this.subscribers.delete(sub);
  }
  get subscriberCount() {
    return this.subscribers.size;
  }
};
function signal(value, equals) {
  const impl = new SignalImpl(value, equals);
  const getter = (() => impl.get());
  getter.set = (v) => impl.set(v);
  getter.update = (fn) => impl.update(fn);
  getter.peek = () => impl.peek();
  return getter;
}
var ComputedImpl = class {
  constructor(fn, equals) {
    __publicField(this, "cachedValue");
    __publicField(this, "cached", false);
    __publicField(this, "subscribers", /* @__PURE__ */ new Set());
    __publicField(this, "deps", /* @__PURE__ */ new Set());
    __publicField(this, "fn");
    __publicField(this, "equals");
    this.fn = fn;
    this.equals = equals || ((a, b) => a === b);
  }
  get() {
    if (!this.cached) {
      const prevDeps = new Set(this.deps);
      this.deps.clear();
      const prevEffect = currentEffect;
      currentEffect = () => {
        this.cached = false;
        this.notify();
      };
      const trackSignal = (s) => {
        this.deps.add(s);
      };
      try {
        this.cachedValue = this.fn();
        this.cached = true;
      } catch (e) {
        console.error("[TW Reactivity] Computed error:", e);
        this.cachedValue = void 0;
        this.cached = true;
      } finally {
        currentEffect = prevEffect;
      }
      for (const dep of this.deps) {
        if (!prevDeps.has(dep)) {
          const depImpl = dep;
          if (depImpl.subscribers) {
            depImpl.subscribers.add(() => {
              this.cached = false;
              this.notify();
            });
          }
        }
      }
    }
    if (currentEffect) {
      this.subscribers.add(currentEffect);
    }
    return this.cachedValue;
  }
  notify() {
    const subs = Array.from(this.subscribers);
    for (const sub of subs) {
      try {
        sub();
      } catch (e) {
        console.error("[TW Reactivity] Computed subscriber error:", e);
      }
    }
  }
  set(_value) {
    throw new Error("Cannot set a computed signal");
  }
  update(_fn) {
    throw new Error("Cannot update a computed signal");
  }
  peek() {
    if (!this.cached) {
      return this.get();
    }
    return this.cachedValue;
  }
  get dependencies() {
    return new Set(this.deps);
  }
};
function computed(fn, equals) {
  const impl = new ComputedImpl(fn, equals);
  const getter = (() => impl.get());
  getter.set = (v) => impl.set(v);
  getter.update = (fn2) => impl.update(fn2);
  getter.peek = () => impl.peek();
  Object.defineProperty(getter, "dependencies", {
    get: () => impl.dependencies
  });
  return getter;
}
function effect(fn) {
  let cleanup = null;
  let destroyed = false;
  const run = () => {
    if (destroyed) return;
    if (cleanup) {
      try {
        cleanup();
      } catch (e) {
        console.error("[TW Reactivity] Effect cleanup error:", e);
      }
      cleanup = null;
    }
    const prevEffect = currentEffect;
    currentEffect = run;
    try {
      const result = fn();
      if (typeof result === "function") {
        cleanup = result;
      }
    } catch (e) {
      console.error("[TW Reactivity] Effect error:", e);
    } finally {
      currentEffect = prevEffect;
    }
  };
  run();
  const destroy = () => {
    destroyed = true;
    if (cleanup) {
      try {
        cleanup();
      } catch (e) {
        console.error("[TW Reactivity] Effect destroy error:", e);
      }
    }
  };
  const eff = run;
  eff.destroy = destroy;
  return eff;
}
function watch(source, callback) {
  let oldValue = source.peek();
  const eff = effect(() => {
    const newValue = source();
    if (newValue !== oldValue) {
      callback(newValue, oldValue);
      oldValue = newValue;
    }
  });
  return () => eff.destroy();
}
var watchEffect = effect;
function reactive(obj) {
  const signals = /* @__PURE__ */ new Map();
  for (const key of Object.keys(obj)) {
    signals.set(key, signal(obj[key]));
  }
  const proxy = new Proxy(obj, {
    get(target, prop) {
      if (signals.has(prop)) {
        return signals.get(prop)();
      }
      return target[prop];
    },
    set(target, prop, value) {
      if (signals.has(prop)) {
        signals.get(prop).set(value);
      } else {
        signals.set(prop, signal(value));
      }
      target[prop] = value;
      return true;
    },
    has(target, prop) {
      return signals.has(prop) || prop in target;
    },
    ownKeys(target) {
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(target, prop) {
      if (signals.has(prop)) {
        return {
          enumerable: true,
          configurable: true,
          get() {
            return signals.get(prop)();
          },
          set(value) {
            signals.get(prop).set(value);
          }
        };
      }
      return Reflect.getOwnPropertyDescriptor(target, prop);
    }
  });
  return proxy;
}
function ref(value) {
  const s = signal(value);
  return {
    get value() {
      return s();
    },
    set value(v) {
      s.set(v);
    }
  };
}
function toRef(obj, key) {
  return {
    get value() {
      return obj[key];
    },
    set value(v) {
      obj[key] = v;
    }
  };
}
function toRefs(obj) {
  const result = {};
  for (const key of Object.keys(obj)) {
    result[key] = toRef(obj, key);
  }
  return result;
}
function untrack(fn) {
  const prev = currentEffect;
  currentEffect = null;
  try {
    return fn();
  } finally {
    currentEffect = prev;
  }
}
var currentCleanup = null;
function onCleanup(fn) {
  if (currentCleanup) {
    currentCleanup(fn);
  }
}
function getSubscriberCount(s) {
  const impl = s;
  return impl.subscriberCount || 0;
}
function isSignal(value) {
  return typeof value === "function" && "set" in value && "peek" in value;
}
function isComputed(value) {
  return isSignal(value) && "dependencies" in value;
}
var ReactiveScope = class {
  constructor() {
    __publicField(this, "effects", []);
  }
  run(fn) {
    const prevCleanup = currentCleanup;
    const collectedCleanups = [];
    currentCleanup = (cleanupFn) => {
      collectedCleanups.push(cleanupFn);
    };
    try {
      const result = fn();
      return result;
    } finally {
      currentCleanup = prevCleanup;
    }
  }
  track(eff) {
    this.effects.push(eff);
  }
  dispose() {
    for (const eff of this.effects) {
      try {
        eff.destroy();
      } catch (e) {
        console.error("[TW Reactivity] Scope dispose error:", e);
      }
    }
    this.effects = [];
  }
};
function createScope() {
  return new ReactiveScope();
}

// packages/runtime/tw/animation-frame.ts
var easings = {
  linear: (t2) => t2,
  easeInQuad: (t2) => t2 * t2,
  easeOutQuad: (t2) => t2 * (2 - t2),
  easeInOutQuad: (t2) => t2 < 0.5 ? 2 * t2 * t2 : -1 + (4 - 2 * t2) * t2,
  easeInCubic: (t2) => t2 * t2 * t2,
  easeOutCubic: (t2) => --t2 * t2 * t2,
  easeInOutCubic: (t2) => t2 < 0.5 ? 4 * t2 * t2 * t2 : (t2 - 1) * (2 * t2 - 2) * (2 * t2 - 2) + 1,
  easeInQuart: (t2) => t2 * t2 * t2 * t2,
  easeOutQuart: (t2) => 1 - --t2 * t2 * t2 * t2,
  easeInOutQuart: (t2) => t2 < 0.5 ? 8 * t2 * t2 * t2 * t2 : 1 - 8 * --t2 * t2 * t2 * t2,
  easeInQuint: (t2) => t2 * t2 * t2 * t2 * t2,
  easeOutQuint: (t2) => 1 + --t2 * t2 * t2 * t2 * t2,
  easeInOutQuint: (t2) => t2 < 0.5 ? 16 * t2 * t2 * t2 * t2 * t2 : 1 + 16 * --t2 * t2 * t2 * t2 * t2,
  easeInSine: (t2) => 1 - Math.cos(t2 * Math.PI / 2),
  easeOutSine: (t2) => Math.sin(t2 * Math.PI / 2),
  easeInOutSine: (t2) => (1 - Math.cos(t2 * Math.PI)) / 2,
  easeInExpo: (t2) => t2 === 0 ? 0 : Math.pow(2, 10 * (t2 - 1)),
  easeOutExpo: (t2) => t2 === 1 ? 1 : 1 - Math.pow(2, -10 * t2),
  easeInOutExpo: (t2) => {
    if (t2 === 0) return 0;
    if (t2 === 1) return 1;
    if (t2 < 0.5) return Math.pow(2, 20 * t2 - 10) / 2;
    return (2 - Math.pow(2, -20 * t2 + 10)) / 2;
  },
  easeInCirc: (t2) => 1 - Math.sqrt(1 - t2 * t2),
  easeOutCirc: (t2) => Math.sqrt(1 - --t2 * t2),
  easeInOutCirc: (t2) => t2 < 0.5 ? (1 - Math.sqrt(1 - 4 * t2 * t2)) / 2 : (Math.sqrt(1 - (-2 * t2 + 2) * (-2 * t2 + 2)) + 1) / 2,
  easeInBack: (t2) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return c3 * t2 * t2 * t2 - c1 * t2 * t2;
  },
  easeOutBack: (t2) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t2 - 1, 3) + c1 * Math.pow(t2 - 1, 2);
  },
  easeInOutBack: (t2) => {
    const c1 = 1.70158;
    const c2 = c1 * 1.525;
    return t2 < 0.5 ? Math.pow(2 * t2, 2) * ((c2 + 1) * 2 * t2 - c2) / 2 : (Math.pow(2 * t2 - 2, 2) * ((c2 + 1) * (t2 * 2 - 2) + c2) + 2) / 2;
  },
  easeInElastic: (t2) => {
    if (t2 === 0) return 0;
    if (t2 === 1) return 1;
    const c4 = 2 * Math.PI / 3;
    return -Math.pow(2, 10 * t2 - 10) * Math.sin((t2 * 10 - 10.75) * c4);
  },
  easeOutElastic: (t2) => {
    if (t2 === 0) return 0;
    if (t2 === 1) return 1;
    const c4 = 2 * Math.PI / 3;
    return Math.pow(2, -10 * t2) * Math.sin((t2 * 10 - 0.75) * c4) + 1;
  },
  easeInOutElastic: (t2) => {
    if (t2 === 0) return 0;
    if (t2 === 1) return 1;
    const c5 = 2 * Math.PI / 4.5;
    return t2 < 0.5 ? -(Math.pow(2, 20 * t2 - 10) * Math.sin((20 * t2 - 11.125) * c5)) / 2 : Math.pow(2, -20 * t2 + 10) * Math.sin((20 * t2 - 11.125) * c5) / 2 + 1;
  },
  easeOutBounce: (t2) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t2 < 1 / d1) return n1 * t2 * t2;
    if (t2 < 2 / d1) return n1 * (t2 -= 1.5 / d1) * t2 + 0.75;
    if (t2 < 2.5 / d1) return n1 * (t2 -= 2.25 / d1) * t2 + 0.9375;
    return n1 * (t2 -= 2.625 / d1) * t2 + 0.984375;
  },
  easeInBounce: (t2) => 1 - easings.easeOutBounce(1 - t2),
  easeInOutBounce: (t2) => t2 < 0.5 ? (1 - easings.easeOutBounce(1 - 2 * t2)) / 2 : (1 + easings.easeOutBounce(2 * t2 - 1)) / 2
};
var AnimationLoop = class {
  constructor() {
    __publicField(this, "tasks", /* @__PURE__ */ new Map());
    __publicField(this, "groups", /* @__PURE__ */ new Map());
    __publicField(this, "isRunning", false);
    __publicField(this, "rafId", null);
    __publicField(this, "lastFrameTime", 0);
    __publicField(this, "frameCount", 0);
    __publicField(this, "fpsHistory", []);
    __publicField(this, "maxFpsHistory", 60);
    __publicField(this, "taskIdCounter", 0);
    // --- Internal ------------------------------------------------------
    __publicField(this, "tick", () => {
      if (!this.isRunning) return;
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const deltaTime = now - this.lastFrameTime;
      this.lastFrameTime = now;
      this.frameCount++;
      const fps = deltaTime > 0 ? 1e3 / deltaTime : 0;
      this.fpsHistory.push(fps);
      if (this.fpsHistory.length > this.maxFpsHistory) this.fpsHistory.shift();
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
    });
  }
  /**
   * Start the animation loop.
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFrameTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.frameCount = 0;
    this.tick();
  }
  /**
   * Stop the animation loop.
   */
  stop() {
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
  add(callback, priority = 0) {
    const id = ++this.taskIdCounter;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.tasks.set(id, {
      id,
      callback,
      priority,
      paused: false,
      startTime: now,
      lastTime: now,
      frameCount: 0
    });
    if (!this.isRunning) this.start();
    return id;
  }
  /**
   * Remove a task.
   */
  remove(id) {
    this.tasks.delete(id);
    if (this.tasks.size === 0) this.stop();
  }
  /**
   * Pause a task.
   */
  pause(id) {
    const task = this.tasks.get(id);
    if (task) task.paused = true;
  }
  /**
   * Resume a task.
   */
  resume(id) {
    const task = this.tasks.get(id);
    if (task) {
      task.paused = false;
      task.lastTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    }
  }
  /**
   * Create an animation group.
   */
  createGroup(id, taskIds) {
    this.groups.set(id, { id, taskIds, paused: false });
  }
  /**
   * Pause all tasks in a group.
   */
  pauseGroup(id) {
    const group = this.groups.get(id);
    if (group) {
      group.paused = true;
      for (const taskId of group.taskIds) this.pause(taskId);
    }
  }
  /**
   * Resume all tasks in a group.
   */
  resumeGroup(id) {
    const group = this.groups.get(id);
    if (group) {
      group.paused = false;
      for (const taskId of group.taskIds) this.resume(taskId);
    }
  }
  /**
   * Get current FPS.
   */
  getFPS() {
    if (this.fpsHistory.length === 0) return 0;
    return this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
  }
  /**
   * Get the number of active tasks.
   */
  get taskCount() {
    return this.tasks.size;
  }
  /**
   * Get the number of frames since start.
   */
  get frameNumber() {
    return this.frameCount;
  }
};
var globalAnimLoop = null;
function getAnimationLoop() {
  if (!globalAnimLoop) globalAnimLoop = new AnimationLoop();
  return globalAnimLoop;
}
function addAnimationTask(callback, priority) {
  return getAnimationLoop().add(callback, priority);
}
function removeAnimationTask(id) {
  getAnimationLoop().remove(id);
}
function tween(options) {
  const easingFn = typeof options.easing === "string" ? easings[options.easing] || easings.linear : options.easing || easings.linear;
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
        if (raw >= 1) {
          reverse = true;
        }
      } else {
        progress = 1 - raw;
        if (raw >= 1) {
          reverse = false;
        }
      }
    } else {
      progress = raw;
    }
    const eased = easingFn(progress);
    options.onUpdate(eased);
    if (raw >= 1 && !options.yoyo && !options.loop) {
      if (options.onComplete) options.onComplete();
      return false;
    }
    if (options.loop && raw >= 1) {
    }
  });
  return {
    id,
    pause: () => {
      paused = true;
      getAnimationLoop().pause(id);
    },
    resume: () => {
      paused = false;
      getAnimationLoop().resume(id);
    },
    cancel: () => {
      getAnimationLoop().remove(id);
    },
    get progress() {
      return progress;
    }
  };
}
function animateProperty(obj, property, from, to, duration, options) {
  return tween({
    duration,
    easing: options == null ? void 0 : options.easing,
    onUpdate: (value) => {
      obj[property] = from + (to - from) * value;
    },
    onComplete: options == null ? void 0 : options.onComplete
  });
}

// packages/runtime/tw/async-components.ts
var AsyncComponentLoader = class {
  constructor(options) {
    __publicField(this, "_timeoutTimer", null);
    __publicField(this, "options");
    __publicField(this, "state");
    __publicField(this, "promise", null);
    __publicField(this, "suspenseBoundary", null);
    this.options = {
      delay: 200,
      timeout: 3e4,
      suspensible: true,
      retries: 3,
      retryDelay: 1e3,
      ...options
    };
    this.state = {
      status: "idle",
      component: null,
      error: null,
      loadingStartedAt: 0,
      attempts: 0
    };
  }
  /**
   * Load the component. Returns a promise that resolves to the component.
   */
  load() {
    if (this.state.status === "loaded" && this.state.component) {
      return Promise.resolve(this.state.component);
    }
    if (this.state.status === "loading" && this.promise) {
      return this.promise;
    }
    this.state.status = "loading";
    this.state.loadingStartedAt = Date.now();
    this.state.attempts++;
    this.promise = this.doLoad();
    if (this.options.timeout && this.options.timeout > 0) {
      this._timeoutTimer = setTimeout(() => {
        if (this.state.status === "loading") {
          this.state.status = "timeout";
          const err = new Error(`Async component timed out after ${this.options.timeout}ms`);
          this.state.error = err;
        }
      }, this.options.timeout);
    }
    return this.promise;
  }
  /**
   * Get current state.
   */
  getState() {
    return { ...this.state };
  }
  /**
   * Reset to idle state.
   */
  reset() {
    this.state = { status: "idle", component: null, error: null, loadingStartedAt: 0, attempts: 0 };
    this.promise = null;
  }
  /**
   * Set the suspense boundary for coordination.
   */
  setSuspenseBoundary(boundary) {
    this.suspenseBoundary = boundary;
  }
  // --- Internal ------------------------------------------------------
  async doLoad() {
    const maxRetries = this.options.retries || 3;
    const retryDelay = this.options.retryDelay || 1e3;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const module = await this.options.loader();
        const component = module.default || module;
        this.state.status = "loaded";
        this.state.component = component;
        this.state.error = null;
        return component;
      } catch (err) {
        if (attempt < maxRetries) {
          if (this.options.onError) {
            const shouldRetry = this.options.onError(err);
            if (shouldRetry === false) {
              this.state.status = "error";
              this.state.error = err;
              throw err;
            }
          }
          await new Promise((resolve) => setTimeout(resolve, retryDelay * (attempt + 1)));
        } else {
          this.state.status = "error";
          this.state.error = err;
          throw err;
        }
      }
    }
    throw new Error("Async component failed to load after retries");
  }
};
var asyncLoaders = /* @__PURE__ */ new Map();
function defineAsyncComponent(options) {
  const loader = new AsyncComponentLoader(options);
  const factory = () => {
    return loader.load();
  };
  const id = `async-${asyncLoaders.size + 1}`;
  asyncLoaders.set(id, loader);
  return factory;
}
function getAsyncLoader(id) {
  return asyncLoaders.get(id);
}
function preloadAsyncComponent(factory) {
  return factory();
}
var SuspenseManager = class {
  constructor() {
    __publicField(this, "boundaries", []);
    __publicField(this, "currentBoundary", null);
  }
  /**
   * Push a new suspense boundary.
   */
  pushBoundary(fallback) {
    const boundary = {
      pending: /* @__PURE__ */ new Set(),
      fallback,
      resolved: false,
      resolve: () => {
      },
      reject: () => {
      }
    };
    const promise = new Promise((resolve, reject) => {
      boundary.resolve = resolve;
      boundary.reject = reject;
    });
    this.boundaries.push(boundary);
    this.currentBoundary = boundary;
    void promise;
    return boundary;
  }
  /**
   * Pop the current suspense boundary.
   */
  popBoundary() {
    const boundary = this.boundaries.pop() || null;
    this.currentBoundary = this.boundaries[this.boundaries.length - 1] || null;
    if (boundary && boundary.pending.size === 0) {
      boundary.resolved = true;
      boundary.resolve();
    }
    return boundary;
  }
  /**
   * Track a promise in the current boundary.
   */
  track(promise) {
    if (!this.currentBoundary) return;
    const boundary = this.currentBoundary;
    boundary.pending.add(promise);
    promise.then(() => {
      boundary.pending.delete(promise);
      if (boundary.pending.size === 0 && !boundary.resolved) {
        boundary.resolved = true;
        boundary.resolve();
      }
    }).catch((err) => {
      boundary.pending.delete(promise);
      if (!boundary.resolved) {
        boundary.resolved = true;
        boundary.reject(err);
      }
    });
  }
  /**
   * Get the current boundary.
   */
  get current() {
    return this.currentBoundary;
  }
  /**
   * Check if the current boundary is resolved.
   */
  get isResolved() {
    return this.currentBoundary ? this.currentBoundary.resolved : true;
  }
};
var globalSuspenseManager = null;
function getSuspenseManager() {
  if (!globalSuspenseManager) globalSuspenseManager = new SuspenseManager();
  return globalSuspenseManager;
}
async function withSuspense(fallback, fn) {
  const manager = getSuspenseManager();
  const boundary = manager.pushBoundary(fallback);
  try {
    manager.track(fn());
    const result = await fn();
    manager.popBoundary();
    return result;
  } catch (e) {
    manager.popBoundary();
    throw e;
  }
}

// packages/runtime/tw/cache-manager.ts
var MemoryCache = class {
  constructor(maxSize = 500) {
    __publicField(this, "cache", /* @__PURE__ */ new Map());
    __publicField(this, "maxSize");
    __publicField(this, "stats", { hits: 0, misses: 0, evictions: 0 });
    this.maxSize = maxSize;
  }
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return void 0;
    }
    if (entry.ttl !== null && Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return void 0;
    }
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.stats.hits++;
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }
  set(key, value, options = {}) {
    var _a;
    while (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
        this.stats.evictions++;
      } else break;
    }
    const entry = {
      value,
      timestamp: Date.now(),
      ttl: (_a = options.ttl) != null ? _a : null,
      tags: options.tags || [],
      accessCount: 0,
      lastAccessed: Date.now(),
      size: this.estimateSize(value)
    };
    this.cache.set(key, entry);
  }
  has(key) {
    return this.cache.has(key);
  }
  delete(key) {
    this.cache.delete(key);
  }
  clear() {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }
  invalidateTag(tag) {
    let count = 0;
    for (const [key, entry] of this.cache) {
      if (entry.tags.includes(tag)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }
  getStats() {
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      hitRate: this.stats.hits + this.stats.misses > 0 ? this.stats.hits / (this.stats.hits + this.stats.misses) : 0,
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        size: entry.size,
        lastAccessed: entry.lastAccessed,
        tags: entry.tags
      }))
    };
  }
  estimateSize(value) {
    try {
      return JSON.stringify(value).length;
    } catch {
      return 0;
    }
  }
};
var PersistentCache = class {
  constructor(layer, prefix = "tw-cache:") {
    __publicField(this, "storage", null);
    __publicField(this, "prefix");
    try {
      this.storage = layer === "session" ? sessionStorage : localStorage;
    } catch {
      this.storage = null;
    }
    this.prefix = prefix;
  }
  get(key) {
    if (!this.storage) return void 0;
    try {
      const raw = this.storage.getItem(this.prefix + key);
      if (!raw) return void 0;
      const entry = JSON.parse(raw);
      if (entry.ttl !== null && Date.now() - entry.timestamp > entry.ttl) {
        this.storage.removeItem(this.prefix + key);
        return void 0;
      }
      return entry.value;
    } catch {
      return void 0;
    }
  }
  set(key, value, options = {}) {
    var _a;
    if (!this.storage) return;
    try {
      const entry = {
        value,
        timestamp: Date.now(),
        ttl: (_a = options.ttl) != null ? _a : null,
        tags: options.tags || [],
        accessCount: 0,
        lastAccessed: Date.now(),
        size: 0
      };
      this.storage.setItem(this.prefix + key, JSON.stringify(entry));
    } catch (e) {
      console.error("[TW Cache] Persistent set error:", e);
    }
  }
  has(key) {
    if (!this.storage) return false;
    return this.storage.getItem(this.prefix + key) !== null;
  }
  delete(key) {
    if (!this.storage) return;
    this.storage.removeItem(this.prefix + key);
  }
  clear() {
    if (!this.storage) return;
    const keys = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key && key.startsWith(this.prefix)) keys.push(key);
    }
    for (const key of keys) this.storage.removeItem(key);
  }
};
var CacheManager = class {
  constructor(maxMemorySize = 500) {
    __publicField(this, "memoryCache");
    __publicField(this, "sessionCache");
    __publicField(this, "persistentCache");
    __publicField(this, "revalidating", /* @__PURE__ */ new Set());
    this.memoryCache = new MemoryCache(maxMemorySize);
    this.sessionCache = new PersistentCache("session");
    this.persistentCache = new PersistentCache("persistent");
  }
  /**
   * Get a value from cache.
   * Checks memory -> session -> persistent.
   */
  get(key) {
    const memValue = this.memoryCache.get(key);
    if (memValue !== void 0) return memValue;
    const sessionValue2 = this.sessionCache.get(key);
    if (sessionValue2 !== void 0) {
      this.memoryCache.set(key, sessionValue2);
      return sessionValue2;
    }
    const persistentValue = this.persistentCache.get(key);
    if (persistentValue !== void 0) {
      this.memoryCache.set(key, persistentValue);
      return persistentValue;
    }
    return void 0;
  }
  /**
   * Set a value in cache.
   */
  set(key, value, options = {}) {
    const layer = options.layer || "all";
    if (layer === "all" || layer === "memory") {
      this.memoryCache.set(key, value, options);
    }
    if (layer === "all" || layer === "session") {
      this.sessionCache.set(key, value, options);
    }
    if (layer === "all" || layer === "persistent") {
      this.persistentCache.set(key, value, options);
    }
  }
  /**
   * Get or compute a value.
   * If the value is not in cache, call the factory function.
   */
  async getOrCompute(key, factory, options = {}) {
    const cached = this.get(key);
    if (cached !== void 0) {
      if (options.staleWhileRevalidate && options.revalidateFn) {
        this.revalidate(key, options.revalidateFn, options);
      }
      return cached;
    }
    const value = await factory();
    this.set(key, value, options);
    return value;
  }
  /**
   * Check if a key exists in cache.
   */
  has(key) {
    return this.memoryCache.has(key) || this.sessionCache.has(key) || this.persistentCache.has(key);
  }
  /**
   * Delete a key from all layers.
   */
  delete(key) {
    this.memoryCache.delete(key);
    this.sessionCache.delete(key);
    this.persistentCache.delete(key);
  }
  /**
   * Invalidate all entries with a specific tag.
   */
  invalidateTag(tag) {
    const count = this.memoryCache.invalidateTag(tag);
    return count;
  }
  /**
   * Clear all caches.
   */
  clear() {
    this.memoryCache.clear();
    this.sessionCache.clear();
    this.persistentCache.clear();
  }
  /**
   * Get cache statistics.
   */
  getStats() {
    return this.memoryCache.getStats();
  }
  /**
   * Preload a value into cache.
   */
  async preload(key, factory, options = {}) {
    if (!this.has(key)) {
      const value = await factory();
      this.set(key, value, options);
    }
  }
  /**
   * Background revalidation.
   */
  async revalidate(key, factory, options) {
    if (this.revalidating.has(key)) return;
    this.revalidating.add(key);
    try {
      const newValue = await factory();
      this.set(key, newValue, options);
    } catch (e) {
      console.error(`[TW Cache] Revalidation error for '${key}':`, e);
    } finally {
      this.revalidating.delete(key);
    }
  }
};
var globalCacheManager = null;
function getCacheManager() {
  if (!globalCacheManager) globalCacheManager = new CacheManager();
  return globalCacheManager;
}
function cacheGet(key) {
  return getCacheManager().get(key);
}
function cacheSet(key, value, options) {
  getCacheManager().set(key, value, options);
}
function cacheHas(key) {
  return getCacheManager().has(key);
}
function cacheDelete(key) {
  getCacheManager().delete(key);
}
function cacheClear() {
  getCacheManager().clear();
}
function cacheStats() {
  return getCacheManager().getStats();
}

// packages/runtime/tw/clipboard-utils.ts
var ClipboardManager = class {
  constructor() {
    __publicField(this, "isSupported", false);
    this.isSupported = typeof navigator !== "undefined" && !!navigator.clipboard;
  }
  /**
   * Copy text to clipboard.
   */
  async copyText(text, options) {
    var _a, _b;
    try {
      if (this.isSupported) {
        await navigator.clipboard.writeText(text);
        (_a = options == null ? void 0 : options.onSuccess) == null ? void 0 : _a.call(options);
        return true;
      }
    } catch (e) {
      console.warn("[TW Clipboard] Clipboard API failed, trying fallback:", e);
    }
    if ((options == null ? void 0 : options.fallback) !== false) {
      return this.fallbackCopy(text, options);
    }
    (_b = options == null ? void 0 : options.onError) == null ? void 0 : _b.call(options, new Error("Clipboard not supported"));
    return false;
  }
  /**
   * Copy HTML to clipboard.
   */
  async copyHTML(html, plainText, options) {
    var _a;
    try {
      if (this.isSupported && typeof ClipboardItem !== "undefined") {
        const clipboardItem = new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plainText || html.replace(/<[^>]*>/g, "")], { type: "text/plain" })
        });
        await navigator.clipboard.write([clipboardItem]);
        (_a = options == null ? void 0 : options.onSuccess) == null ? void 0 : _a.call(options);
        return true;
      }
    } catch (e) {
      console.warn("[TW Clipboard] HTML copy failed, trying text:", e);
    }
    return this.copyText(plainText || html.replace(/<[^>]*>/g, ""), options);
  }
  /**
   * Copy JSON data to clipboard.
   */
  async copyJSON(data, options) {
    const json = JSON.stringify(data, null, 2);
    return this.copyText(json, options);
  }
  /**
   * Copy a table to clipboard as HTML.
   */
  async copyTable(headers, rows, options) {
    let html = "<table><thead><tr>";
    for (const header of headers) {
      html += `<th>${this.escapeHtml(header)}</th>`;
    }
    html += "</tr></thead><tbody>";
    for (const row of rows) {
      html += "<tr>";
      for (const cell of row) {
        html += `<td>${this.escapeHtml(cell)}</td>`;
      }
      html += "</tr>";
    }
    html += "</tbody></table>";
    const plainText = [headers.join("	"), ...rows.map((r) => r.join("	"))].join("\n");
    return this.copyHTML(html, plainText, options);
  }
  /**
   * Copy an image to clipboard.
   */
  async copyImage(blob, options) {
    var _a, _b;
    try {
      if (typeof ClipboardItem !== "undefined") {
        const clipboardItem = new ClipboardItem({ [blob.type]: blob });
        await navigator.clipboard.write([clipboardItem]);
        (_a = options == null ? void 0 : options.onSuccess) == null ? void 0 : _a.call(options);
        return true;
      }
    } catch (e) {
      console.error("[TW Clipboard] Image copy failed:", e);
      (_b = options == null ? void 0 : options.onError) == null ? void 0 : _b.call(options, e);
    }
    return false;
  }
  /**
   * Read text from clipboard.
   */
  async readText() {
    try {
      if (this.isSupported) {
        return await navigator.clipboard.readText();
      }
    } catch (e) {
      console.error("[TW Clipboard] Read failed:", e);
    }
    return "";
  }
  /**
   * Read HTML from clipboard.
   */
  async readHTML() {
    try {
      if (this.isSupported) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          if (item.types.includes("text/html")) {
            const blob = await item.getType("text/html");
            return await blob.text();
          }
        }
      }
    } catch (e) {
      console.error("[TW Clipboard] Read HTML failed:", e);
    }
    return "";
  }
  /**
   * Check if clipboard API is supported.
   */
  get supported() {
    return this.isSupported;
  }
  // --- Internal ------------------------------------------------------
  fallbackCopy(text, options) {
    var _a, _b, _c;
    if (typeof document === "undefined") return false;
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (success) {
        (_a = options == null ? void 0 : options.onSuccess) == null ? void 0 : _a.call(options);
      } else {
        (_b = options == null ? void 0 : options.onError) == null ? void 0 : _b.call(options, new Error("execCommand copy failed"));
      }
      return success;
    } catch (e) {
      (_c = options == null ? void 0 : options.onError) == null ? void 0 : _c.call(options, e);
      return false;
    }
  }
  escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
};
var globalClipboard = null;
function getClipboardManager() {
  if (!globalClipboard) globalClipboard = new ClipboardManager();
  return globalClipboard;
}
async function copyToClipboard(text, options) {
  return getClipboardManager().copyText(text, options);
}
async function copyText(text, options) {
  return getClipboardManager().copyText(text, options);
}
async function copyHTML(html, plainText, options) {
  return getClipboardManager().copyHTML(html, plainText, options);
}
async function copyJSON(data, options) {
  return getClipboardManager().copyJSON(data, options);
}
async function pasteFromClipboard() {
  return getClipboardManager().readText();
}

// packages/runtime/tw/performance/metrics.ts
var LCP_THRESHOLDS = { good: 2500, poor: 4e3 };
var FID_THRESHOLDS = { good: 100, poor: 300 };
var CLS_THRESHOLDS = { good: 0.1, poor: 0.25 };
var INP_THRESHOLDS = { good: 200, poor: 500 };
var TTFB_THRESHOLDS = { good: 800, poor: 1800 };
var FCP_THRESHOLDS = { good: 1800, poor: 3e3 };
function getRating(value, thresholds) {
  if (value <= thresholds.good) return "good";
  if (value <= thresholds.poor) return "needs-improvement";
  return "poor";
}
var clsValue = 0;
var sessionValue = 0;
var sessionEntries = [];
function observeLCP(callback) {
  if (typeof PerformanceObserver === "undefined") return () => {
  };
  const observer = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const lastEntry = entries[entries.length - 1];
    const value = lastEntry.startTime;
    callback({
      name: "LCP",
      value,
      rating: getRating(value, LCP_THRESHOLDS),
      delta: value,
      entries,
      id: "v3-" + Date.now()
    });
  });
  observer.observe({ type: "largest-contentful-paint", buffered: true });
  return () => observer.disconnect();
}
function observeFID(callback) {
  if (typeof PerformanceObserver === "undefined") return () => {
  };
  const observer = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    for (const entry of entries) {
      const value = entry.processingStart - entry.startTime;
      callback({
        name: "FID",
        value,
        rating: getRating(value, FID_THRESHOLDS),
        delta: value,
        entries: [entry],
        id: "v3-" + Date.now()
      });
    }
  });
  observer.observe({ type: "first-input", buffered: true });
  return () => observer.disconnect();
}
function observeCLS(callback) {
  if (typeof PerformanceObserver === "undefined") return () => {
  };
  const observer = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    for (const entry of entries) {
      if (!entry.hadRecentInput) {
        const firstSessionEntry = sessionEntries[0];
        const lastSessionEntry = sessionEntries[sessionEntries.length - 1];
        if (firstSessionEntry && lastSessionEntry && entry.startTime - lastSessionEntry.startTime < 1e3 && entry.startTime - firstSessionEntry.startTime < 5e3) {
          sessionValue += entry.value;
        } else {
          sessionValue = entry.value;
          sessionEntries = [];
        }
        sessionEntries.push(entry);
        clsValue = sessionValue;
        callback({
          name: "CLS",
          value: clsValue * 1e3,
          rating: getRating(clsValue, CLS_THRESHOLDS),
          delta: entry.value * 1e3,
          entries: [entry],
          id: "v3-" + Date.now()
        });
      }
    }
  });
  observer.observe({ type: "layout-shift", buffered: true });
  return () => observer.disconnect();
}
function observeINP(callback) {
  if (typeof PerformanceObserver === "undefined") return () => {
  };
  const observer = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    let maxDuration = 0;
    for (const entry of entries) {
      const duration = entry.duration;
      if (duration > maxDuration) maxDuration = duration;
    }
    callback({
      name: "INP",
      value: maxDuration,
      rating: getRating(maxDuration, INP_THRESHOLDS),
      delta: maxDuration,
      entries,
      id: "v3-" + Date.now()
    });
  });
  observer.observe({ type: "event", buffered: true });
  return () => observer.disconnect();
}
function observeTTFB(callback) {
  if (typeof performance === "undefined") return () => {
  };
  const navEntry = performance.getEntriesByType("navigation")[0];
  if (navEntry) {
    const value = navEntry.responseStart - navEntry.requestStart;
    callback({
      name: "TTFB",
      value,
      rating: getRating(value, TTFB_THRESHOLDS),
      delta: value,
      entries: [navEntry],
      id: "v3-" + Date.now()
    });
  }
  return () => {
  };
}
function observeFCP(callback) {
  if (typeof PerformanceObserver === "undefined") return () => {
  };
  const observer = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    for (const entry of entries) {
      callback({
        name: "FCP",
        value: entry.startTime,
        rating: getRating(entry.startTime, FCP_THRESHOLDS),
        delta: entry.startTime,
        entries: [entry],
        id: "v3-" + Date.now()
      });
    }
  });
  observer.observe({ type: "paint", buffered: true });
  return () => observer.disconnect();
}
function observeAllVitals(callback) {
  const cleanups = [
    observeLCP(callback),
    observeFID(callback),
    observeCLS(callback),
    observeINP(callback),
    observeTTFB(callback),
    observeFCP(callback)
  ];
  return () => cleanups.forEach((cleanup) => cleanup());
}

// packages/runtime/tw/ssr-streaming.ts
var encoder = new TextEncoder();
function toUint8(chunk) {
  return encoder.encode(chunk);
}
function isPromise(value) {
  return typeof value === "object" && value !== null && "then" in value;
}
async function* streamVNode(node) {
  if (node == null || node === false || node === true) return;
  if (typeof node === "string") {
    yield node;
    return;
  }
  if (typeof node === "number") {
    yield String(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      for await (const chunk of streamVNode(child)) yield chunk;
    }
    return;
  }
  const { tag, props, children } = node;
  if (typeof tag === "symbol" || tag === "fragment" || tag === null) {
    for (const child of children) {
      for await (const chunk of streamVNode(child)) yield chunk;
    }
    return;
  }
  if (typeof tag === "function") {
    const factory = tag;
    let rendered = factory(props);
    if (isPromise(rendered)) {
      rendered = await rendered;
    }
    if (rendered == null) return;
    for await (const chunk of streamVNode(rendered)) yield chunk;
    return;
  }
  const tagName = String(tag);
  const attrs = attrsToString(props);
  if (VOID_ELEMENTS.has(tagName)) {
    yield `<${tagName}${attrs} />`;
    return;
  }
  yield `<${tagName}${attrs}>`;
  for (const child of children) {
    for await (const chunk of streamVNode(child)) yield chunk;
  }
  yield `</${tagName}>`;
}
function styleToString(style) {
  if (style == null || style === "") return "";
  if (typeof style === "string") return style;
  if (typeof style === "object" && style !== null && !Array.isArray(style)) {
    let out = "";
    for (const key of Object.keys(style)) {
      const raw = style[key];
      if (raw == null) continue;
      const prop = key.startsWith("--") ? key : key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      out += `${prop}:${raw};`;
    }
    return out;
  }
  return String(style);
}
function attrsToString(props) {
  let out = "";
  for (const key of Object.keys(props)) {
    if (/^(key|ref|children|__html|__ssr)$/.test(key)) continue;
    if (key.startsWith("on") && key.length > 2) continue;
    const value = props[key];
    if (value == null || value === false) continue;
    if (key === "style") {
      const css = styleToString(value);
      if (css) out += ` style="${escapeHtml(css)}"`;
      continue;
    }
    if (key === "className") {
      if (value === true) continue;
      out += ` class="${escapeHtml(value)}"`;
      continue;
    }
    if (key === "htmlFor") {
      out += ` for="${escapeHtml(value)}"`;
      continue;
    }
    if (value === true) {
      out += ` ${key}`;
      continue;
    }
    out += ` ${key}="${escapeHtml(value)}"`;
  }
  return out;
}
function renderToStream(node, options = {}) {
  const chunks = [];
  const generator = streamVNode(node);
  const stream = new ReadableStream({
    async start(controller) {
      var _a, _b, _c, _d;
      try {
        if (options.fullDocument) {
          const head = '<!DOCTYPE html><html lang="' + escapeHtml((_a = options.lang) != null ? _a : "en") + '"><head><meta charset="utf-8" /></head><body>';
          controller.enqueue(toUint8(head));
          chunks.push(head);
          (_b = options.onChunk) == null ? void 0 : _b.call(options, head);
        }
        for await (const chunk of generator) {
          controller.enqueue(toUint8(chunk));
          chunks.push(chunk);
          (_c = options.onChunk) == null ? void 0 : _c.call(options, chunk);
        }
        if (options.fullDocument) {
          const tail = "</body></html>";
          controller.enqueue(toUint8(tail));
          chunks.push(tail);
          (_d = options.onChunk) == null ? void 0 : _d.call(options, tail);
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    }
  });
  const html = (async () => {
    const parts = [];
    const reader = stream.tee()[0].getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(new TextDecoder().decode(value));
      }
    } finally {
      reader.releaseLock();
    }
    return parts.join("");
  })();
  const htmlSafe = html.catch(() => chunks.join(""));
  return { html: htmlSafe, stream };
}
function renderToReadableStream(node, options = {}) {
  const generator = streamVNode(node);
  return new ReadableStream({
    async start(controller) {
      var _a, _b, _c, _d;
      try {
        if (options.fullDocument) {
          const head = '<!DOCTYPE html><html lang="' + escapeHtml((_a = options.lang) != null ? _a : "en") + '"><head><meta charset="utf-8" /></head><body>';
          controller.enqueue(toUint8(head));
          (_b = options.onChunk) == null ? void 0 : _b.call(options, head);
        }
        for await (const chunk of generator) {
          controller.enqueue(toUint8(chunk));
          (_c = options.onChunk) == null ? void 0 : _c.call(options, chunk);
        }
        if (options.fullDocument) {
          const tail = "</body></html>";
          controller.enqueue(toUint8(tail));
          (_d = options.onChunk) == null ? void 0 : _d.call(options, tail);
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
    cancel(reason) {
      void reason;
    }
  });
}
async function renderStreamToString(node, options = {}) {
  const { html } = renderToStream(node, options);
  return html;
}

// packages/runtime/tw/vdom.ts
var _vnodeId = 0;
function nextId() {
  return ++_vnodeId;
}
function createVNode(tag, props, ...rest) {
  let children;
  let key = null;
  if (rest.length === 2 && Array.isArray(rest[0]) && (typeof rest[1] === "string" || typeof rest[1] === "number")) {
    children = rest[0];
    key = rest[1];
  } else {
    children = rest;
  }
  return _createVNodeInternal(tag, props != null ? props : {}, key, null, children);
}
function _createVNodeInternal(tag, props, key, hooks, children) {
  let type;
  let text = "";
  let component = null;
  if (tag === null || tag === void 0) {
    type = "fragment";
  } else if (typeof tag === "function") {
    type = "component";
  } else {
    type = "element";
  }
  if (key === null && props !== null && typeof props === "object" && "key" in props) {
    const propKey = props.key;
    if (propKey !== void 0) {
      key = typeof propKey === "number" || typeof propKey === "string" ? propKey : null;
    }
    const { key: _discardedKey, ...restProps } = props;
    props = restProps;
  }
  if (props !== null && typeof props === "object" && "ref" in props) {
    const { ref: _discardedRef, ...restProps } = props;
    props = restProps;
  }
  const normalizedChildren = normalizeChildren(children);
  const vnode = {
    _id: nextId(),
    type,
    tag,
    key,
    props: props != null ? props : {},
    children: normalizedChildren,
    el: null,
    text,
    component,
    hooks,
    normalized: true
  };
  if (hooks && hooks.created) {
    hooks.created(vnode);
  }
  return vnode;
}
function createTextVNode(text) {
  const vnode = {
    _id: nextId(),
    type: "text",
    tag: null,
    key: null,
    props: {},
    children: [],
    el: null,
    text: String(text),
    component: null,
    hooks: null,
    normalized: true
  };
  return vnode;
}
function createCommentVNode(text = "") {
  const vnode = {
    _id: nextId(),
    type: "comment",
    tag: null,
    key: null,
    props: {},
    children: [],
    el: null,
    text,
    component: null,
    hooks: null,
    normalized: true
  };
  return vnode;
}
function createFragment(children) {
  const vnode = {
    _id: nextId(),
    type: "fragment",
    tag: null,
    key: null,
    props: {},
    children: normalizeChildren(children),
    el: null,
    text: "",
    component: null,
    hooks: null,
    normalized: true
  };
  return vnode;
}
function isVNode(value) {
  return value !== null && typeof value === "object" && typeof value._id === "number" && typeof value.type === "string";
}
function normalizeChild(child) {
  if (child === null || child === void 0 || typeof child === "boolean") {
    return null;
  }
  if (isVNode(child)) {
    return child;
  }
  if (typeof child === "string" || typeof child === "number") {
    return createTextVNode(child);
  }
  return null;
}
function normalizeChildren(children) {
  if (children.length === 0) return [];
  const result = [];
  const stack = [...children].reverse();
  while (stack.length > 0) {
    const child = stack.pop();
    if (child === null || child === void 0 || typeof child === "boolean") {
      continue;
    }
    if (Array.isArray(child)) {
      for (let i = child.length - 1; i >= 0; i--) {
        stack.push(child[i]);
      }
      continue;
    }
    if (isVNode(child)) {
      result.push(child);
      continue;
    }
    if (typeof child === "string" || typeof child === "number") {
      const last = result[result.length - 1];
      if (last && last.type === "text") {
        last.text = String(child);
      } else {
        result.push(createTextVNode(child));
      }
      continue;
    }
  }
  return result;
}
function cloneVNode(vnode, overrideProps, overrideChildren) {
  const props = { ...vnode.props, ...overrideProps != null ? overrideProps : {} };
  const children = overrideChildren !== void 0 ? normalizeChildren(overrideChildren) : vnode.children.map((c) => cloneVNode(c));
  return {
    _id: nextId(),
    type: vnode.type,
    tag: vnode.tag,
    key: vnode.key,
    props,
    children,
    el: null,
    // Cloned nodes are not mounted
    text: vnode.text,
    component: null,
    // Cloned instances are fresh
    hooks: vnode.hooks,
    normalized: true
  };
}
function isSameVNode(n1, n2) {
  return n1.type === n2.type && n1.tag === n2.tag && n1.key === n2.key;
}
function getKey(vnode) {
  return vnode.key;
}
var VNODE_SYMBOL = /* @__PURE__ */ Symbol("vnode");
function markVNode(vnode) {
  Object.defineProperty(vnode, "__v_isVNode", {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false
  });
  return vnode;
}

// packages/runtime/tw/render.ts
var VOID_ELEMENTS = /* @__PURE__ */ new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);
var TEXT_ESCAPE_MAP = {
  "&": "&",
  "<": "<",
  ">": ">"
};
var ATTR_ESCAPE_MAP = {
  "&": "&",
  "<": "<",
  ">": ">",
  '"': '"',
  "'": "&#39;",
  "`": "&#96;"
};
function escapeHtml(value) {
  const str = value == null ? "" : String(value);
  return str.replace(/[&<>"'`]/g, (ch) => {
    var _a;
    return (_a = ATTR_ESCAPE_MAP[ch]) != null ? _a : ch;
  });
}
function escapeText2(value) {
  const str = value == null ? "" : String(value);
  return str.replace(/[&<>]/g, (ch) => {
    var _a;
    return (_a = TEXT_ESCAPE_MAP[ch]) != null ? _a : ch;
  });
}
function isStyleObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function styleToString2(style) {
  if (style == null || style === "") return "";
  if (typeof style === "string") return style;
  if (isStyleObject(style)) {
    let out = "";
    for (const key of Object.keys(style)) {
      const raw = style[key];
      if (raw == null) continue;
      const prop = key.startsWith("--") ? key : key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      const val = typeof raw === "number" && !UNITLESS.has(prop) ? `${raw}px` : String(raw);
      out += `${prop}:${val};`;
    }
    return out;
  }
  return String(style);
}
var UNITLESS = /* @__PURE__ */ new Set([
  "animation-iteration-count",
  "column-count",
  "fill-opacity",
  "flex-grow",
  "flex-shrink",
  "font-weight",
  "line-height",
  "opacity",
  "order",
  "orphans",
  "stroke-opacity",
  "widows",
  "z-index",
  "zoom"
]);
var INTERNAL_PROP_RE = /^(key|ref|children|__html|__ssr)$/;
function isEventHandler(key) {
  return key.startsWith("on") && key.length > 2;
}
function renderAttrs(props) {
  let out = "";
  for (const key of Object.keys(props)) {
    if (INTERNAL_PROP_RE.test(key)) continue;
    const value = props[key];
    if (value == null || value === false) continue;
    if (key === "style") {
      const css = styleToString2(value);
      if (css) out += ` style="${escapeHtml(css)}"`;
      continue;
    }
    if (key === "className") {
      if (value === true) continue;
      out += ` class="${escapeHtml(value)}"`;
      continue;
    }
    if (key === "htmlFor") {
      out += ` for="${escapeHtml(value)}"`;
      continue;
    }
    if (isEventHandler(key)) continue;
    if (value === true) {
      out += ` ${key}`;
      continue;
    }
    out += ` ${key}="${escapeHtml(value)}"`;
  }
  return out;
}
function childrenToArray(children) {
  if (Array.isArray(children)) return children;
  return [children];
}
function vnodeToString(node) {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string") return escapeText2(node);
  if (typeof node === "number") return escapeText2(node);
  if (Array.isArray(node)) {
    let out = "";
    for (const child of node) out += vnodeToString(child);
    return out;
  }
  const { tag, props, children } = node;
  if (typeof tag === "symbol" || tag === "fragment" || tag === null) {
    let out = "";
    for (const child of children) out += vnodeToString(child);
    return out;
  }
  if (typeof tag === "function") {
    let rendered;
    try {
      rendered = tag(props);
    } catch (err) {
      return renderError(err);
    }
    return rendered ? vnodeToString(rendered) : "";
  }
  const tagName = String(tag);
  const attrs = renderAttrs(props);
  const childArr = childrenToArray(children);
  if (VOID_ELEMENTS.has(tagName)) {
    return `<${tagName}${attrs} />`;
  }
  let inner = "";
  for (const child of childArr) inner += vnodeToString(child);
  return `<${tagName}${attrs}>${inner}</${tagName}>`;
}
function renderToString(node, options = {}) {
  var _a;
  const body = vnodeToString(node);
  if (!options.fullDocument) return body;
  const lang = (_a = options.lang) != null ? _a : "en";
  return `<!DOCTYPE html><html lang="${escapeHtml(lang)}"><head><meta charset="utf-8" /></head><body>${body}</body></html>`;
}
function renderError(error, options = {}) {
  const message = error instanceof Error ? error.message : String(error != null ? error : "Unknown error");
  const stack = error instanceof Error && error.stack ? error.stack : "";
  const safeMessage = escapeText2(message);
  const safeStack = escapeText2(stack);
  const html = `<div class="tw-error" data-tw-error><h1>Runtime Error</h1><pre>${safeMessage}</pre>` + (safeStack ? `<pre class="tw-error-stack">${safeStack}</pre>` : "") + `</div>`;
  if (options.container && typeof document !== "undefined") {
    const container = options.container;
    container.textContent = "";
    const wrapper = document.createElement("div");
    wrapper.className = "tw-error";
    wrapper.setAttribute("data-tw-error", "");
    const h1 = document.createElement("h1");
    h1.textContent = "Runtime Error";
    wrapper.appendChild(h1);
    const msgPre = document.createElement("pre");
    msgPre.textContent = message;
    wrapper.appendChild(msgPre);
    if (stack) {
      const stackPre = document.createElement("pre");
      stackPre.className = "tw-error-stack";
      stackPre.textContent = stack;
      wrapper.appendChild(stackPre);
    }
    container.appendChild(wrapper);
  }
  return html;
}
function h(tag, props, ...children) {
  return createVNode(tag, props != null ? props : {}, ...children);
}
function renderToStreamAsync(node) {
  return renderToStream(node);
}

// packages/runtime/tw/component.ts
var TWComponent = class {
  constructor(props) {
    __publicField(this, "props");
    __publicField(this, "state");
    /** Bound during render so hooks (`useStore`, etc.) can locate the instance. */
    __publicField(this, "_internals");
    this.props = props;
    this.state = {};
    this._internals = {
      mounted: false,
      pendingState: null,
      errorBoundary: null
    };
  }
  setState(partial) {
    const update = typeof partial === "function" ? partial(this.state) : partial;
    this.state = { ...this.state, ...update };
  }
  /** SSR: render this component to an HTML string. */
  toHTML() {
    const tree = this.render();
    return Array.isArray(tree) ? tree.map((t2) => vnodeToString(t2)).join("") : vnodeToString(tree);
  }
};
function defineComponent(options) {
  var _a;
  const factory = (props) => {
    class OptionsComponent extends TWComponent {
      constructor(p) {
        super(p);
        if (options.data) {
          this.state = options.data.call(null, p);
        }
        if (options.computed) {
          for (const key of Object.keys(options.computed)) {
            Object.defineProperty(this, key, {
              get: () => options.computed[key].call({ ...this.state, props: this.props }),
              enumerable: true,
              configurable: true
            });
          }
        }
        if (options.methods) {
          for (const key of Object.keys(options.methods)) {
            this[key] = (...args) => options.methods[key].call(this, ...args);
          }
        }
      }
      render() {
        if (options.render) {
          return options.render.call(this);
        }
        if (options.setup) {
          const renderFn = options.setup.call(null, this.props, {
            emit: () => {
            },
            attrs: {},
            slots: {}
          });
          return renderFn();
        }
        return null;
      }
      componentDidMount() {
        if (options.mounted) options.mounted.call(this);
      }
      componentWillUnmount() {
        if (options.beforeUnmount) options.beforeUnmount.call(this);
      }
    }
    const instance = new OptionsComponent(props != null ? props : {});
    const tree = instance.render();
    if (Array.isArray(tree)) {
      return h2("fragment", null, ...tree);
    }
    return tree;
  };
  Object.defineProperty(factory, "name", {
    value: (_a = options.name) != null ? _a : "AnonymousComponent",
    configurable: true
  });
  return factory;
}
var scopeStack = [];
function currentScope() {
  if (scopeStack.length === 0) {
    const root = /* @__PURE__ */ new Map();
    const stack = {
      get: (k) => root.get(k),
      set: (k, v) => {
        root.set(k, v);
      },
      push: () => {
        const child = new Map(root);
        const next = {
          get: (k) => child.get(k),
          set: (k, v) => {
            child.set(k, v);
          },
          push: () => {
            const gc = new Map(child);
            return makeStack(gc);
          },
          pop: () => {
            scopeStack.pop();
          }
        };
        scopeStack.push(next);
        return next;
      },
      pop: () => {
        scopeStack.pop();
      }
    };
    scopeStack.push(stack);
  }
  return scopeStack[scopeStack.length - 1];
}
function makeStack(store) {
  return {
    get: (k) => store.get(k),
    set: (k, v) => {
      store.set(k, v);
    },
    push: () => makeStack(new Map(store)),
    pop: () => {
      scopeStack.pop();
    }
  };
}
function createContext(defaultValue, displayName = "Context") {
  const _key = Symbol(displayName);
  const Provider = (props) => {
    var _a;
    const scope = currentScope().push();
    scope.set(_key, props.value);
    const children = (_a = props.children) != null ? _a : [];
    return h2("fragment", null, ...Array.isArray(children) ? children : [children]);
  };
  const Consumer = (props) => {
    const value = resolveContext(context);
    const render = props.children;
    if (typeof render === "function") {
      return render(value);
    }
    return null;
  };
  const context = {
    displayName,
    _key,
    Provider,
    Consumer,
    defaultValue,
    _resolve: (stack) => {
      const v = stack.get(_key);
      return v === void 0 ? defaultValue : v;
    }
  };
  return context;
}
function resolveContext(ctx) {
  return ctx._resolve(currentScope());
}
function withScope(fn) {
  const scope = currentScope().push();
  try {
    return fn();
  } finally {
    scope.pop();
  }
}
function shallowEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || a === null) return false;
  if (typeof b !== "object" || b === null) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  const aObj = a;
  const bObj = b;
  for (const k of ka) {
    if (!Object.is(aObj[k], bObj[k])) return false;
  }
  return true;
}
function memo(component, compare = shallowEqual) {
  const memoized = ((props) => {
    if (memoized._lastProps !== void 0 && memoized._lastResult !== void 0 && compare(memoized._lastProps, props)) {
      return memoized._lastResult;
    }
    const result = component(props);
    memoized._lastProps = props;
    memoized._lastResult = result;
    return result;
  });
  memoized._wrapped = component;
  memoized._compare = compare;
  return memoized;
}
var ErrorBoundary = class _ErrorBoundary extends TWComponent {
  constructor() {
    super(...arguments);
    __publicField(this, "_error", null);
    __publicField(this, "_componentStack", "");
  }
  render() {
    var _a;
    if (this._error) {
      const fallback = this.props.fallback;
      return fallback(this._error, { componentStack: this._componentStack });
    }
    const children = (_a = this.props.children) != null ? _a : [];
    const arr = Array.isArray(children) ? children : [children];
    const results = [];
    for (const child of arr) {
      try {
        results.push(child);
      } catch (err) {
        this._error = err;
        this._componentStack = `<${_ErrorBoundary.name}>`;
        if (this.props.onError) {
          this.props.onError(err, {
            componentStack: this._componentStack
          });
        }
        const fallback = this.props.fallback;
        return fallback(err, { componentStack: this._componentStack });
      }
    }
    return h2("fragment", null, ...results);
  }
  componentDidCatch(error, info) {
    this._error = error;
    this._componentStack = info.componentStack;
    if (this.props.onError) {
      this.props.onError(error, info);
    }
  }
  reset() {
    this._error = null;
    this._componentStack = "";
  }
};
function isPending(child) {
  return typeof child === "object" && child !== null && "promise" in child && child.promise instanceof Promise;
}
var Suspense = class extends TWComponent {
  constructor() {
    super(...arguments);
    __publicField(this, "_pending", /* @__PURE__ */ new Set());
    __publicField(this, "_resolved", false);
  }
  render() {
    var _a;
    const props = this.props;
    const children = (_a = props.children) != null ? _a : [];
    const arr = Array.isArray(children) ? children : [children];
    for (const child of arr) {
      if (isPending(child)) {
        this._pending.add(child.promise);
        child.promise.finally(() => {
          this._pending.delete(child.promise);
          this._resolved = true;
        });
      }
    }
    if (this._pending.size > 0 && !this._resolved) {
      return props.fallback;
    }
    return h2("fragment", null, ...arr.filter((c) => !isPending(c)));
  }
  /** Returns true while any tracked promise is unresolved. */
  isPending() {
    return this._pending.size > 0;
  }
};
var Fragment = "fragment";
function fragment(...children) {
  return h2("fragment", null, ...children);
}
function forwardRef(render) {
  const factory = (props) => {
    var _a;
    const ref2 = (_a = props.ref) != null ? _a : { current: null };
    return render(props, ref2);
  };
  return factory;
}
function h2(tag, props, ...children) {
  const childArray = children.length === 1 && Array.isArray(children[0]) ? children[0] : children;
  return {
    type: "element",
    tag,
    props: props || {},
    children: childArray
  };
}

// packages/runtime/tw/context.ts
var contextRegistry = /* @__PURE__ */ new Map();
var contextStack = [];
function useContext(context) {
  for (let i = contextStack.length - 1; i >= 0; i--) {
    const layer = contextStack[i];
    if (layer.has(context.key)) {
      const entry = layer.get(context.key);
      return entry.signal();
    }
  }
  if (contextRegistry.has(context.key)) {
    return contextRegistry.get(context.key).signal();
  }
  return context.defaultValue;
}
function useContextSignal(context) {
  const getSignal = () => {
    for (let i = contextStack.length - 1; i >= 0; i--) {
      const layer = contextStack[i];
      if (layer.has(context.key)) {
        return layer.get(context.key).signal;
      }
    }
    if (contextRegistry.has(context.key)) {
      return contextRegistry.get(context.key).signal;
    }
    return signal(context.defaultValue);
  };
  return getSignal();
}
function setContextValue(key, value) {
  if (contextStack.length === 0) {
    contextRegistry.set(key, { value, signal: signal(value) });
  } else {
    contextStack[contextStack.length - 1].set(key, { value, signal: signal(value) });
  }
}
function pushContextScope() {
  const scope = /* @__PURE__ */ new Map();
  contextStack.push(scope);
  return scope;
}
function popContextScope() {
  contextStack.pop();
}
function withContextScope(fn) {
  pushContextScope();
  try {
    return fn();
  } finally {
    popContextScope();
  }
}
function provideContext(context, value) {
  setContextValue(context.key, value);
}
function consumeContext(context) {
  return useContext(context);
}
function mapContext(context, transform) {
  return transform(useContext(context));
}
function validateContext(context, validator) {
  return validator(useContext(context));
}
function clearAllContexts() {
  contextRegistry.clear();
  contextStack.length = 0;
}

// packages/runtime/tw/debug-utils.ts
var LEVEL_PRIORITY = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
  silent: 6
};
var COLORS = {
  trace: "\x1B[90m",
  // gray
  debug: "\x1B[36m",
  // cyan
  info: "\x1B[32m",
  // green
  warn: "\x1B[33m",
  // yellow
  error: "\x1B[31m",
  // red
  fatal: "\x1B[35m",
  // magenta
  silent: ""
};
var RESET = "\x1B[0m";
var Debugger = class {
  constructor(options = {}) {
    __publicField(this, "options");
    __publicField(this, "buffer", []);
    __publicField(this, "measurements", []);
    __publicField(this, "activeMeasurements", /* @__PURE__ */ new Map());
    __publicField(this, "startTime");
    var _a;
    this.options = {
      level: "debug",
      enabled: true,
      colorize: typeof process !== "undefined" ? ((_a = process.env) == null ? void 0 : _a.FORCE_COLOR) !== "0" : true,
      timestamp: true,
      filter: "",
      bufferSize: 1e3,
      ...options
    };
    this.startTime = typeof performance !== "undefined" ? performance.now() : Date.now();
  }
  /**
   * Log at trace level.
   */
  trace(message, ...data) {
    this.log("trace", message, data);
  }
  /**
   * Log at debug level.
   */
  debug(message, ...data) {
    this.log("debug", message, data);
  }
  /**
   * Log at info level.
   */
  info(message, ...data) {
    this.log("info", message, data);
  }
  /**
   * Log at warn level.
   */
  warn(message, ...data) {
    this.log("warn", message, data);
  }
  /**
   * Log at error level.
   */
  error(message, ...data) {
    this.log("error", message, data);
  }
  /**
   * Log at fatal level.
   */
  fatal(message, ...data) {
    this.log("fatal", message, data);
  }
  /**
   * Create a tagged logger.
   */
  tag(tag) {
    return new TaggedLogger(this, tag);
  }
  /**
   * Assert a condition (throw if false).
   */
  assert(condition, message = "Assertion failed") {
    if (!condition) {
      const error = new Error(message);
      this.error(`Assertion failed: ${message}`);
      throw error;
    }
  }
  /**
   * Assert with custom error.
   */
  assertError(condition, error) {
    if (!condition) {
      this.error(`Assertion failed: ${error.message}`);
      throw error;
    }
  }
  /**
   * Start a performance measurement.
   */
  startMeasure(name) {
    this.activeMeasurements.set(name, typeof performance !== "undefined" ? performance.now() : Date.now());
  }
  /**
   * End a performance measurement.
   */
  endMeasure(name, metadata) {
    const startTime = this.activeMeasurements.get(name);
    if (startTime === void 0) {
      this.warn(`No active measurement named '${name}'`);
      return null;
    }
    const endTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    const measurement = {
      name,
      startTime,
      endTime,
      duration: endTime - startTime,
      metadata
    };
    this.measurements.push(measurement);
    this.activeMeasurements.delete(name);
    if (measurement.duration > 16) {
      this.warn(`Slow operation: '${name}' took ${measurement.duration.toFixed(2)}ms`);
    }
    return measurement;
  }
  /**
   * Measure a function execution time.
   */
  measure(name, fn) {
    this.startMeasure(name);
    try {
      const result = fn();
      this.endMeasure(name);
      return result;
    } catch (e) {
      this.endMeasure(name);
      throw e;
    }
  }
  /**
   * Measure an async function execution time.
   */
  async measureAsync(name, fn) {
    this.startMeasure(name);
    try {
      const result = await fn();
      this.endMeasure(name);
      return result;
    } catch (e) {
      this.endMeasure(name);
      throw e;
    }
  }
  /**
   * Get all measurements.
   */
  getMeasurements() {
    return [...this.measurements];
  }
  /**
   * Get measurement by name.
   */
  getMeasurement(name) {
    return this.measurements.find((m) => m.name === name);
  }
  /**
   * Get the slowest measurement.
   */
  getSlowest() {
    if (this.measurements.length === 0) return null;
    return this.measurements.reduce(
      (slowest, current) => current.duration > slowest.duration ? current : slowest
    );
  }
  /**
   * Get all buffered logs.
   */
  getBuffer() {
    return [...this.buffer];
  }
  /**
   * Clear the log buffer.
   */
  clearBuffer() {
    this.buffer = [];
  }
  /**
   * Clear all measurements.
   */
  clearMeasurements() {
    this.measurements = [];
  }
  /**
   * Set the log level.
   */
  setLevel(level) {
    this.options.level = level;
  }
  /**
   * Enable or disable logging.
   */
  setEnabled(enabled) {
    this.options.enabled = enabled;
  }
  /**
   * Set a filter (only log messages matching the filter).
   */
  setFilter(filter) {
    this.options.filter = filter;
  }
  /**
   * Get memory usage (Node.js only).
   */
  getMemoryUsage() {
    if (typeof process !== "undefined" && process.memoryUsage) {
      return process.memoryUsage();
    }
    return null;
  }
  /**
   * Inspect an object (deep print).
   */
  inspect(obj, depth = 3) {
    return this.inspectInternal(obj, depth, 0, /* @__PURE__ */ new WeakSet());
  }
  /**
   * Check if running in development mode.
   */
  get isDev() {
    if (typeof process !== "undefined") {
      return true;
    }
    if (typeof globalThis !== "undefined") {
      const g = globalThis;
      return g.__TW_DEV__ === true || g.__DEV__ === true;
    }
    return false;
  }
  /**
   * Check if running in production.
   */
  get isProd() {
    return !this.isDev;
  }
  // --- Internal ------------------------------------------------------
  log(level, message, data) {
    if (!this.options.enabled) return;
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.options.level]) return;
    if (this.options.filter) {
      const filter = this.options.filter;
      if (typeof filter === "string") {
        if (!message.includes(filter)) return;
      } else if (!filter.test(message)) return;
    }
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const entry = {
      level,
      message,
      data,
      timestamp: Date.now(),
      elapsed: now - this.startTime
    };
    this.buffer.push(entry);
    if (this.buffer.length > this.options.bufferSize) {
      this.buffer.shift();
    }
    this.output(entry);
  }
  output(entry) {
    const parts = [];
    if (this.options.timestamp) {
      const time = new Date(entry.timestamp).toISOString().split("T")[1].replace("Z", "");
      parts.push(`[${time}]`);
    }
    parts.push(`[${entry.level.toUpperCase()}]`);
    parts.push(entry.message);
    const prefix = parts.join(" ");
    if (this.options.colorize) {
      const color = COLORS[entry.level];
      if (entry.data.length > 0) {
        const lvl = entry.level;
        const fn = lvl === "fatal" ? "error" : lvl;
        console[fn](color + prefix + RESET, ...entry.data);
      } else {
        const lvl = entry.level;
        const fn = lvl === "fatal" ? "error" : lvl;
        console[fn](color + prefix + RESET);
      }
    } else {
      if (entry.data.length > 0) {
        const lvl = entry.level;
        const fn = lvl === "fatal" ? "error" : lvl;
        console[fn](prefix, ...entry.data);
      } else {
        const lvl = entry.level;
        const fn = lvl === "fatal" ? "error" : lvl;
        console[fn](prefix);
      }
    }
  }
  inspectInternal(obj, maxDepth, currentDepth, seen) {
    if (obj === null) return "null";
    if (obj === void 0) return "undefined";
    if (typeof obj === "string") return `"${obj}"`;
    if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
    if (typeof obj === "function") return `[Function: ${obj.name || "anonymous"}]`;
    if (typeof obj === "symbol") return obj.toString();
    if (currentDepth >= maxDepth) return "[Object]";
    if (typeof obj === "object") {
      if (seen.has(obj)) return "[Circular]";
      seen.add(obj);
      if (Array.isArray(obj)) {
        const items = obj.slice(0, 20).map((item) => this.inspectInternal(item, maxDepth, currentDepth + 1, seen));
        if (obj.length > 20) items.push(`... ${obj.length - 20} more`);
        return `[${items.join(", ")}]`;
      }
      if (obj instanceof Error) return `[Error: ${obj.message}]`;
      if (obj instanceof Date) return obj.toISOString();
      if (obj instanceof RegExp) return obj.toString();
      if (obj instanceof Map) {
        const entries2 = Array.from(obj.entries()).slice(0, 20).map(
          ([k, v]) => `${this.inspectInternal(k, maxDepth, currentDepth + 1, seen)} => ${this.inspectInternal(v, maxDepth, currentDepth + 1, seen)}`
        );
        return `Map(${entries2.length}) { ${entries2.join(", ")} }`;
      }
      if (obj instanceof Set) {
        const items = Array.from(obj).slice(0, 20).map((item) => this.inspectInternal(item, maxDepth, currentDepth + 1, seen));
        return `Set(${obj.size}) { ${items.join(", ")} }`;
      }
      const entries = Object.entries(obj).slice(0, 20).map(
        ([k, v]) => `${k}: ${this.inspectInternal(v, maxDepth, currentDepth + 1, seen)}`
      );
      const keys = Object.keys(obj);
      if (keys.length > 20) entries.push(`... ${keys.length - 20} more`);
      return `{ ${entries.join(", ")} }`;
    }
    return String(obj);
  }
};
var TaggedLogger = class {
  constructor(parent, tag) {
    __publicField(this, "parent");
    __publicField(this, "tag");
    this.parent = parent;
    this.tag = tag;
  }
  trace(message, ...data) {
    this.parent.trace(`[${this.tag}] ${message}`, ...data);
  }
  debug(message, ...data) {
    this.parent.debug(`[${this.tag}] ${message}`, ...data);
  }
  info(message, ...data) {
    this.parent.info(`[${this.tag}] ${message}`, ...data);
  }
  warn(message, ...data) {
    this.parent.warn(`[${this.tag}] ${message}`, ...data);
  }
  error(message, ...data) {
    this.parent.error(`[${this.tag}] ${message}`, ...data);
  }
  fatal(message, ...data) {
    this.parent.fatal(`[${this.tag}] ${message}`, ...data);
  }
  measure(name, fn) {
    return this.parent.measure(`${this.tag}:${name}`, fn);
  }
  async measureAsync(name, fn) {
    return this.parent.measureAsync(`${this.tag}:${name}`, fn);
  }
  assert(condition, message) {
    this.parent.assert(condition, `[${this.tag}] ${message || "Assertion failed"}`);
  }
};
var globalDebugger = null;
function getDebugger() {
  if (!globalDebugger) globalDebugger = new Debugger();
  return globalDebugger;
}
function debugLog(message, ...data) {
  getDebugger().debug(message, ...data);
}
function infoLog(message, ...data) {
  getDebugger().info(message, ...data);
}
function warnLog(message, ...data) {
  getDebugger().warn(message, ...data);
}
function errorLog(message, ...data) {
  getDebugger().error(message, ...data);
}
function assertCondition(condition, message) {
  getDebugger().assert(condition, message);
}
function measureTime(name, fn) {
  return getDebugger().measure(name, fn);
}
async function measureTimeAsync(name, fn) {
  return getDebugger().measureAsync(name, fn);
}
function isDev() {
  return getDebugger().isDev;
}
function isProd() {
  return getDebugger().isProd;
}
function inspectObject(obj, depth) {
  return getDebugger().inspect(obj, depth);
}

// packages/runtime/tw/devtools.ts
var TWDevTools = class {
  constructor() {
    __publicField(this, "enabled", false);
    __publicField(this, "componentTree", /* @__PURE__ */ new Map());
    __publicField(this, "eventLog", []);
    __publicField(this, "maxEvents", 500);
    __publicField(this, "bridge", null);
  }
  /**
   * Enable devtools.
   */
  enable() {
    this.enabled = true;
    if (typeof globalThis !== "undefined") {
      globalThis.__TW_DEVTOOLS__ = {
        inspect: () => this.getState(),
        getComponents: () => this.getComponents(),
        getEvents: () => this.getEvents(),
        enable: () => this.enable(),
        disable: () => this.disable()
      };
    }
  }
  /**
   * Disable devtools.
   */
  disable() {
    this.enabled = false;
    if (typeof globalThis !== "undefined") {
      delete globalThis.__TW_DEVTOOLS__;
    }
  }
  get isEnabled() {
    return this.enabled;
  }
  /**
   * Register a component in the tree.
   */
  registerComponent(node) {
    if (!this.enabled) return;
    this.componentTree.set(node.id, node);
    this.notifyBridge("component:registered", node);
  }
  /**
   * Update a component.
   */
  updateComponent(id, updates) {
    if (!this.enabled) return;
    const node = this.componentTree.get(id);
    if (node) {
      Object.assign(node, updates);
      node.renderCount++;
      node.lastRenderTime = Date.now();
      this.notifyBridge("component:updated", node);
    }
  }
  /**
   * Unregister a component.
   */
  unregisterComponent(id) {
    if (!this.enabled) return;
    this.componentTree.delete(id);
    this.notifyBridge("component:unregistered", { id });
  }
  /**
   * Log an event.
   */
  logEvent(name, data) {
    if (!this.enabled) return;
    this.eventLog.push({ name, data, timestamp: Date.now() });
    if (this.eventLog.length > this.maxEvents) this.eventLog.shift();
    this.notifyBridge("event", { name, data });
  }
  /**
   * Get the full devtools state.
   */
  getState() {
    return {
      components: this.getComponents(),
      stores: [],
      events: this.getEvents(),
      router: null,
      reactivity: { signalCount: 0, effectCount: 0 },
      memory: { vnodePool: 0, domPool: 0 }
    };
  }
  /**
   * Get all registered components.
   */
  getComponents() {
    return Array.from(this.componentTree.values());
  }
  /**
   * Get component by ID.
   */
  getComponent(id) {
    return this.componentTree.get(id);
  }
  /**
   * Get event log.
   */
  getEvents() {
    return [...this.eventLog];
  }
  /**
   * Set the bridge callback (for devtools extension).
   */
  setBridge(cb) {
    this.bridge = cb;
  }
  /**
   * Clear all data.
   */
  clear() {
    this.componentTree.clear();
    this.eventLog = [];
  }
  notifyBridge(type, data) {
    if (this.bridge) {
      try {
        this.bridge(type, data);
      } catch (e) {
        console.error("[TW DevTools] Bridge error:", e);
      }
    }
  }
};
var globalDevTools = null;
function getDevTools() {
  if (!globalDevTools) globalDevTools = new TWDevTools();
  return globalDevTools;
}
function enableDevTools() {
  getDevTools().enable();
}
function disableDevTools() {
  getDevTools().disable();
}
function isDevToolsEnabled() {
  var _a;
  return (_a = globalDevTools == null ? void 0 : globalDevTools.isEnabled) != null ? _a : false;
}

// packages/runtime/tw/diff.ts
function diffTextNode(oldNode, newText) {
  if (oldNode.text === newText) return null;
  return { kind: "text", text: newText };
}
var HTML_ESCAPE_MAP = {
  "&": "&",
  "<": "<",
  ">": ">",
  '"': '"',
  "'": "&#39;"
};
var HTML_ESCAPE_REGEX = /[&<>"']/g;
function escapeHtml2(str) {
  return str.replace(HTML_ESCAPE_REGEX, (ch) => {
    var _a;
    return (_a = HTML_ESCAPE_MAP[ch]) != null ? _a : ch;
  });
}
var EVENT_HANDLERS_KEY = "__tw_event_handlers__";
function getHandlerMap(el) {
  const stored = el[EVENT_HANDLERS_KEY];
  if (stored) return stored;
  const map = /* @__PURE__ */ new Map();
  el[EVENT_HANDLERS_KEY] = map;
  return map;
}
function isEventKey(key) {
  return key.length > 2 && key[0] === "o" && key[1] === "n" && key[2] === key[2].toUpperCase();
}
function eventNameFromKey(key) {
  return key.slice(2).toLowerCase();
}
function isEventListener(value) {
  return typeof value === "function";
}
function setProp(el, key, value, oldValue) {
  if (isEventKey(key)) {
    const event = eventNameFromKey(key);
    const handlers = getHandlerMap(el);
    const oldHandler = handlers.get(event);
    if (oldHandler) {
      el.removeEventListener(event, oldHandler);
      handlers.delete(event);
    }
    if (isEventListener(value)) {
      el.addEventListener(event, value);
      handlers.set(event, value);
    }
    return;
  }
  if (key === "class" || key === "className") {
    if (value == null || value === false) {
      el.removeAttribute("class");
    } else if (Array.isArray(value)) {
      el.setAttribute("class", value.filter(Boolean).join(" "));
    } else if (typeof value === "object" && value !== null) {
      const classes = [];
      for (const [k, v] of Object.entries(value)) {
        if (v) classes.push(k);
      }
      el.setAttribute("class", classes.join(" "));
    } else {
      el.setAttribute("class", String(value));
    }
    return;
  }
  if (key === "style") {
    if (value == null || value === "") {
      el.removeAttribute("style");
    } else if (typeof value === "string") {
      el.setAttribute("style", value);
    } else if (typeof value === "object" && value !== null) {
      const style = el.style;
      if (typeof oldValue === "object" && oldValue !== null) {
        for (const k of Object.keys(oldValue)) {
          if (!(k in value)) {
            style.removeProperty(k);
          }
        }
      }
      for (const [k, v] of Object.entries(value)) {
        if (v == null || v === false) {
          style.removeProperty(k);
        } else {
          style.setProperty(k, String(v));
        }
      }
    }
    return;
  }
  if (typeof value === "boolean") {
    if (value) {
      el.setAttribute(key, "");
    } else {
      el.removeAttribute(key);
    }
    return;
  }
  if (key === "ref") {
    return;
  }
  if (key === "key") {
    return;
  }
  if (value == null || value === void 0 || value === false) {
    el.removeAttribute(key);
  } else {
    el.setAttribute(key, String(value));
  }
}
function removeProp(el, key, oldValue) {
  if (isEventKey(key)) {
    const event = eventNameFromKey(key);
    const handlers = getHandlerMap(el);
    const oldHandler = handlers.get(event);
    if (oldHandler) {
      el.removeEventListener(event, oldHandler);
      handlers.delete(event);
    }
    return;
  }
  if (key === "class" || key === "className") {
    el.removeAttribute("class");
    return;
  }
  if (key === "style") {
    if (typeof oldValue === "object" && oldValue !== null) {
      const style = el.style;
      for (const k of Object.keys(oldValue)) {
        style.removeProperty(k);
      }
    } else {
      el.removeAttribute("style");
    }
    return;
  }
  if (key === "ref" || key === "key") return;
  el.removeAttribute(key);
}
function diffProps(el, oldProps, newProps) {
  const changes = [];
  const allKeys = /* @__PURE__ */ new Set([...Object.keys(oldProps), ...Object.keys(newProps)]);
  for (const key of allKeys) {
    if (key === "key" || key === "ref") continue;
    const oldValue = oldProps[key];
    const newValue = newProps[key];
    if (oldValue === newValue) continue;
    if (newValue === void 0 || newValue === null) {
      removeProp(el, key, oldValue);
      changes.push({ key, value: void 0, oldValue });
    } else if (oldValue === void 0 || oldValue === null) {
      setProp(el, key, newValue, oldValue);
      changes.push({ key, value: newValue, oldValue: void 0 });
    } else {
      setProp(el, key, newValue, oldValue);
      changes.push({ key, value: newValue, oldValue });
    }
  }
  return changes;
}
function diffChildren(parentEl, oldChildren, newChildren) {
  const patches = [];
  const oldLen = oldChildren.length;
  const newLen = newChildren.length;
  if (oldLen === 0) {
    for (let i = 0; i < newLen; i++) {
      patches.push({ type: "INSERT", newNode: newChildren[i], index: i });
    }
    return patches;
  }
  if (newLen === 0) {
    for (let i = 0; i < oldLen; i++) {
      patches.push({ type: "REMOVE", oldNode: oldChildren[i], newNode: oldChildren[i], index: i });
    }
    return patches;
  }
  const oldKeyMap = /* @__PURE__ */ new Map();
  const oldIndexList = [];
  for (let i = 0; i < oldLen; i++) {
    const oldChild = oldChildren[i];
    const key = getKey(oldChild);
    if (key !== null) {
      oldKeyMap.set(key, { vnode: oldChild, index: i });
    }
    oldIndexList.push(oldChild);
  }
  const visited = /* @__PURE__ */ new Set();
  let positionalCursor = 0;
  for (let i = 0; i < newLen; i++) {
    const newChild = newChildren[i];
    const newKey = getKey(newChild);
    let matched = null;
    let matchedOldIndex = -1;
    if (newKey !== null) {
      const entry = oldKeyMap.get(newKey);
      if (entry && !visited.has(entry.index)) {
        if (isSameVNode(entry.vnode, newChild)) {
          matched = entry.vnode;
          matchedOldIndex = entry.index;
          visited.add(matchedOldIndex);
        }
      }
    }
    if (matched === null) {
      while (positionalCursor < oldLen) {
        const candidate = oldIndexList[positionalCursor];
        if (candidate && !visited.has(positionalCursor) && getKey(candidate) === null) {
          if (isSameVNode(candidate, newChild)) {
            matched = candidate;
            matchedOldIndex = positionalCursor;
            visited.add(matchedOldIndex);
            positionalCursor++;
            break;
          }
        }
        positionalCursor++;
      }
    }
    if (matched !== null) {
      if (matchedOldIndex !== i) {
        patches.push({ type: "MOVE", oldNode: matched, newNode: newChild, index: i });
      } else {
        patches.push({ type: "UPDATE", oldNode: matched, newNode: newChild, index: i });
      }
    } else {
      patches.push({ type: "INSERT", newNode: newChild, index: i });
    }
  }
  for (let i = 0; i < oldLen; i++) {
    if (!visited.has(i)) {
      patches.push({ type: "REMOVE", oldNode: oldChildren[i], newNode: oldChildren[i], index: i });
    }
  }
  return patches;
}
var _detachedDiffEl = null;
function detachedDiffElement() {
  if (_detachedDiffEl === null) _detachedDiffEl = document.createElement("div");
  return _detachedDiffEl;
}
function diffVNode(oldVNode, newVNode) {
  if (oldVNode === null && newVNode === null) {
    return null;
  }
  if (oldVNode !== null && newVNode === null) {
    return {
      type: "REMOVE",
      vnode: oldVNode
    };
  }
  if (oldVNode === null && newVNode !== null) {
    return {
      type: "CREATE",
      vnode: newVNode,
      newNode: newVNode
    };
  }
  const old = oldVNode;
  const next = newVNode;
  if (!isSameVNode(old, next)) {
    return {
      type: "REPLACE",
      vnode: old,
      newNode: next
    };
  }
  if (old.type === "text" || old.type === "comment") {
    if (old.text !== next.text) {
      return {
        type: "TEXT",
        vnode: old,
        newNode: next,
        text: next.text
      };
    }
    return null;
  }
  const target = old.el instanceof Element ? old.el : detachedDiffElement();
  const propChanges = diffProps(target, old.props, next.props);
  if (propChanges.length === 0) {
    return null;
  }
  return {
    type: "PROPS",
    vnode: old,
    newNode: next,
    props: propChanges
  };
}
function diff(oldVNode, newVNode) {
  var _a;
  const patches = [];
  const rootPatch = diffVNode(oldVNode, newVNode);
  if (rootPatch) {
    patches.push(rootPatch);
  }
  if (oldVNode && newVNode) {
    const childPatches = diffChildren(
      oldVNode.el instanceof Element ? oldVNode.el : detachedDiffElement(),
      oldVNode.children,
      newVNode.children
    );
    for (const cp of childPatches) {
      if (cp.type === "REMOVE") {
        patches.push({ type: "REMOVE", vnode: cp.oldNode, index: cp.index });
        continue;
      }
      const childPatch = diffVNode((_a = cp.oldNode) != null ? _a : null, cp.newNode);
      if (childPatch) {
        patches.push(childPatch);
      }
    }
  }
  return patches;
}
function removeAllEventListeners(vnode) {
  if (!vnode.el || vnode.el instanceof Element === false) return;
  const el = vnode.el;
  const handlers = el[EVENT_HANDLERS_KEY];
  if (handlers) {
    const map = handlers;
    for (const [event, handler] of map) {
      el.removeEventListener(event, handler);
    }
    map.clear();
    delete el[EVENT_HANDLERS_KEY];
  }
}

// packages/runtime/tw/diff-optimized.ts
var KEYED_OP_KIND = {
  INSERT: "create",
  REMOVE: "remove",
  MOVE: "move",
  UPDATE: "update"
};
function diffKeyed(oldChildren, newChildren, _options) {
  const oldLen = oldChildren.length;
  const newLen = newChildren.length;
  const ops = [];
  if (oldLen === 0) {
    for (let i = 0; i < newLen; i++) {
      ops.push({ type: "INSERT", kind: KEYED_OP_KIND.INSERT, index: i, newNode: newChildren[i] });
    }
    return ops;
  }
  if (newLen === 0) {
    return [{
      type: "REMOVE",
      kind: KEYED_OP_KIND.REMOVE,
      index: 0,
      newNode: oldChildren[0],
      oldNode: oldChildren[0],
      removedNodes: oldChildren.slice()
    }];
  }
  const oldKeyMap = /* @__PURE__ */ new Map();
  for (let i = 0; i < oldLen; i++) {
    const child = oldChildren[i];
    const key = getKey(child);
    if (key !== null) {
      if (!oldKeyMap.has(key)) {
        oldKeyMap.set(key, { vnode: child, index: i });
      }
    }
  }
  const matchedOldIndices = /* @__PURE__ */ new Set();
  for (let i = 0; i < newLen; i++) {
    const newChild = newChildren[i];
    const newKey = getKey(newChild);
    if (newKey !== null) {
      const entry = oldKeyMap.get(newKey);
      if (entry && !matchedOldIndices.has(entry.index)) {
        if (isSameVNode(entry.vnode, newChild)) {
          matchedOldIndices.add(entry.index);
          if (entry.index !== i) {
            ops.push({
              type: "MOVE",
              kind: KEYED_OP_KIND.MOVE,
              index: i,
              newNode: newChild,
              oldNode: entry.vnode,
              fromIndex: entry.index
            });
          } else {
            ops.push({
              type: "UPDATE",
              kind: KEYED_OP_KIND.UPDATE,
              index: i,
              newNode: newChild,
              oldNode: entry.vnode
            });
          }
          continue;
        }
      }
      ops.push({ type: "INSERT", kind: KEYED_OP_KIND.INSERT, index: i, newNode: newChild });
    } else {
      ops.push({ type: "INSERT", kind: KEYED_OP_KIND.INSERT, index: i, newNode: newChild });
    }
  }
  for (let i = 0; i < oldLen; i++) {
    if (!matchedOldIndices.has(i)) {
      ops.push({ type: "REMOVE", kind: KEYED_OP_KIND.REMOVE, index: i, newNode: oldChildren[i], oldNode: oldChildren[i] });
    }
  }
  return ops;
}
function diffKeyedFull(oldChildren, newChildren) {
  const ops = diffKeyed(oldChildren, newChildren);
  const propPatches = /* @__PURE__ */ new Map();
  for (const op of ops) {
    if ((op.type === "UPDATE" || op.type === "MOVE") && op.oldNode && op.oldNode.el instanceof Element) {
      const changes = diffProps(op.oldNode.el, op.oldNode.props, op.newNode.props);
      if (changes.length > 0) {
        propPatches.set(op.index, changes);
      }
    }
  }
  return { ops, propPatches };
}
function diffUnkeyed(oldChildren, newChildren) {
  const oldLen = oldChildren.length;
  const newLen = newChildren.length;
  const ops = [];
  const max = Math.max(oldLen, newLen);
  for (let i = 0; i < max; i++) {
    const oldChild = oldChildren[i];
    const newChild = newChildren[i];
    if (oldChild && newChild) {
      if (isSameVNode(oldChild, newChild)) {
        ops.push({ type: "UPDATE", index: i, newNode: newChild, oldNode: oldChild });
      } else {
        ops.push({ type: "REMOVE", index: i, newNode: oldChild, oldNode: oldChild });
        ops.push({ type: "INSERT", index: i, newNode: newChild });
      }
    } else if (oldChild && !newChild) {
      ops.push({ type: "REMOVE", index: i, newNode: oldChild, oldNode: oldChild });
    } else if (!oldChild && newChild) {
      ops.push({ type: "INSERT", index: i, newNode: newChild });
    }
  }
  return ops;
}
var DEFAULT_POOL_CONFIG = {
  maxSize: 256,
  resetOnRelease: true
};
var VNodePool = class {
  constructor(config = {}) {
    __publicField(this, "pool", []);
    __publicField(this, "config");
    this.config = { ...DEFAULT_POOL_CONFIG, ...config };
  }
  /**
   * Release a VNode back to the pool for reuse.
   * Recursively releases children too.
   */
  release(vnode) {
    if (this.pool.length >= this.config.maxSize) {
      vnode.el = null;
      vnode.component = null;
      return;
    }
    for (const child of vnode.children) {
      this.release(child);
    }
    if (this.config.resetOnRelease) {
      this.resetVNode(vnode);
    }
    this.pool.push(vnode);
  }
  /**
   * Try to acquire a VNode from the pool, or return null if empty.
   */
  acquire() {
    var _a;
    return (_a = this.pool.pop()) != null ? _a : null;
  }
  /** Reset a VNode to a blank state (keeping the object reference for reuse). */
  resetVNode(vnode) {
    vnode.type = "fragment";
    vnode.tag = null;
    vnode.key = null;
    vnode.props = {};
    vnode.children = [];
    vnode.el = null;
    vnode.text = "";
    vnode.component = null;
    vnode.hooks = null;
    vnode.normalized = false;
  }
  /** Clear the pool entirely. */
  clear() {
    this.pool.length = 0;
  }
  /** Current pool size. */
  get size() {
    return this.pool.length;
  }
  /** Current pool config. */
  get poolConfig() {
    return this.config;
  }
  /** Update pool configuration. */
  configure(config) {
    this.config = { ...this.config, ...config };
    if (this.pool.length > this.config.maxSize) {
      this.pool.length = this.config.maxSize;
    }
  }
};
var globalPool = new VNodePool();
function releaseVNode(vnode) {
  globalPool.release(vnode);
}
function acquireVNode() {
  return globalPool.acquire();
}
function configurePool(config) {
  globalPool.configure(config);
}
function clearPool() {
  globalPool.clear();
}
function poolSize() {
  return globalPool.size;
}
function generateKeyedPatches(oldChildren, newChildren) {
  const { ops } = diffKeyedFull(oldChildren, newChildren);
  const patches = [];
  for (const op of ops) {
    switch (op.type) {
      case "INSERT":
        patches.push({
          type: "INSERT",
          vnode: op.newNode,
          newNode: op.newNode,
          index: op.index
        });
        break;
      case "REMOVE":
        if (op.oldNode) {
          patches.push({
            type: "REMOVE",
            vnode: op.oldNode
          });
        }
        break;
      case "UPDATE":
      case "MOVE":
        if (op.oldNode) {
          patches.push({
            type: "PROPS",
            vnode: op.oldNode,
            newNode: op.newNode
          });
        }
        break;
    }
  }
  return patches;
}

// packages/runtime/tw/diff-engine.ts
var defaultDOMOps = {
  createElement: (tag) => document.createElement(tag),
  createTextNode: (text) => document.createTextNode(text),
  createComment: (text) => document.createComment(text),
  createDocumentFragment: () => document.createDocumentFragment(),
  insertBefore: (parent, child, ref2) => parent.insertBefore(child, ref2),
  removeChild: (parent, child) => parent.removeChild(child),
  appendChild: (parent, child) => parent.appendChild(child),
  setTextContent: (node, text) => {
    node.textContent = text;
  },
  setAttribute: (el, key, value) => {
    el.setAttribute(key, String(value));
  },
  removeAttribute: (el, key) => {
    el.removeAttribute(key);
  },
  addEventListener: (el, event, handler) => {
    el.addEventListener(event, handler);
  },
  removeEventListener: (el, event, handler) => {
    el.removeEventListener(event, handler);
  }
};
var DiffEngine = class {
  constructor(domOps) {
    __publicField(this, "dom");
    __publicField(this, "current", null);
    __publicField(this, "root", null);
    __publicField(this, "componentRegistry", /* @__PURE__ */ new Map());
    this.dom = { ...defaultDOMOps, ...domOps };
  }
  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------
  /**
   * Mount the initial VNode tree onto a container element.
   */
  mount(vnode, container) {
    this.root = container;
    this.current = vnode;
    try {
      const el = this.createDOMNode(vnode);
      if (el) {
        this.dom.appendChild(container, el);
        this.callMountedHook(vnode);
      }
      return { success: true, node: el };
    } catch (err) {
      return {
        success: false,
        node: null,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
  /**
   * Unmount the current tree and clean up.
   */
  unmount() {
    if (!this.current || !this.root) {
      return { success: true, node: null };
    }
    try {
      this.callBeforeUnmountHook(this.current);
      this.removeDOMNode(this.current, this.root);
      this.releaseVNodeTree(this.current);
      this.current = null;
      this.root = null;
      return { success: true, node: null };
    } catch (err) {
      return {
        success: false,
        node: null,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
  /**
   * Diff the current tree against a new VNode and apply patches.
   *
   * @param newVNode The new VNode tree.
   * @returns The result of applying patches.
   */
  diff(newVNode) {
    if (!this.current) {
      if (this.root) {
        return this.mount(newVNode, this.root);
      }
      return { success: false, node: null, error: "No root container" };
    }
    try {
      const patches = this.computePatches(this.current, newVNode);
      const result = this.apply(patches);
      this.current = newVNode;
      return result;
    } catch (err) {
      return {
        success: false,
        node: null,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
  /**
   * Compute the patches between two VNode trees.
   *
   * @param oldVNode The old tree.
   * @param newVNode The new tree.
   * @returns An ordered array of patches.
   */
  computePatches(oldVNode, newVNode) {
    const patches = [];
    this.computePatchesRecursive(oldVNode, newVNode, patches);
    return patches;
  }
  /**
   * Apply a list of patches to the DOM.
   *
   * Handles all PatchTypes: CREATE, REPLACE, PROPS, TEXT, REORDER, REMOVE, INSERT.
   *
   * @param patches The patches to apply.
   * @returns The result of the last patch operation.
   */
  apply(patches) {
    let lastNode = null;
    let success = true;
    let error;
    for (const patch of patches) {
      try {
        const result = this.applyPatch(patch);
        if (result.node) {
          lastNode = result.node;
        }
        if (!result.success) {
          success = false;
          error = result.error;
          break;
        }
      } catch (err) {
        success = false;
        error = err instanceof Error ? err.message : String(err);
        break;
      }
    }
    return { success, node: lastNode, error };
  }
  /**
   * Get the current VNode tree.
   */
  getCurrentVNode() {
    return this.current;
  }
  /**
   * Get the root container element.
   */
  getRoot() {
    return this.root;
  }
  /**
   * Register a component definition.
   */
  registerComponent(def) {
    this.componentRegistry.set(def.name, def);
  }
  /**
   * Look up a registered component by name.
   */
  getComponent(name) {
    return this.componentRegistry.get(name);
  }
  // -------------------------------------------------------------------------
  // Patch computation (recursive)
  // -------------------------------------------------------------------------
  /**
   * Recursively compute patches between old and new VNode trees.
   */
  computePatchesRecursive(oldVNode, newVNode, patches) {
    if (!isSameVNode(oldVNode, newVNode)) {
      patches.push({
        type: "REPLACE",
        vnode: oldVNode,
        newNode: newVNode
      });
      return;
    }
    if (oldVNode.type === "text" || oldVNode.type === "comment") {
      if (oldVNode.text !== newVNode.text) {
        patches.push({
          type: "TEXT",
          vnode: oldVNode,
          newNode: newVNode,
          text: newVNode.text
        });
      }
      return;
    }
    const propChanges = this.diffPropsForVNode(oldVNode, newVNode);
    const childOps = this.diffChildrenForVNode(oldVNode, newVNode);
    if (propChanges.length > 0 || childOps.length > 0) {
      patches.push({
        type: "PROPS",
        vnode: oldVNode,
        newNode: newVNode,
        props: propChanges,
        children: newVNode.children
      });
    }
    const oldChildren = oldVNode.children;
    const newChildren = newVNode.children;
    const oldChildMap = /* @__PURE__ */ new Map();
    for (const child of oldChildren) {
      const key = getKey(child);
      if (key !== null) {
        oldChildMap.set(key, child);
      }
    }
    for (const newChild of newChildren) {
      const key = getKey(newChild);
      if (key !== null) {
        const oldChild = oldChildMap.get(key);
        if (oldChild && isSameVNode(oldChild, newChild)) {
          this.computePatchesRecursive(oldChild, newChild, patches);
        }
      } else {
        const idx = newChildren.indexOf(newChild);
        const oldChild = oldChildren[idx];
        if (oldChild && isSameVNode(oldChild, newChild)) {
          this.computePatchesRecursive(oldChild, newChild, patches);
        }
      }
    }
  }
  /**
   * Diff props between two VNodes, returning prop changes.
   * Uses the diffProps function from diff.ts if the old node has a DOM element.
   */
  diffPropsForVNode(oldVNode, newVNode) {
    if (oldVNode.el && oldVNode.el instanceof Element) {
      return diffProps(oldVNode.el, oldVNode.props, newVNode.props);
    }
    const changes = [];
    const allKeys = /* @__PURE__ */ new Set([
      ...Object.keys(oldVNode.props),
      ...Object.keys(newVNode.props)
    ]);
    for (const key of allKeys) {
      if (key === "key" || key === "ref") continue;
      const oldValue = oldVNode.props[key];
      const newValue = newVNode.props[key];
      if (oldValue !== newValue) {
        changes.push({ key, value: newValue, oldValue });
      }
    }
    return changes;
  }
  /**
   * Diff children between two VNodes using the keyed algorithm.
   */
  diffChildrenForVNode(oldVNode, newVNode) {
    var _a;
    const parentEl = (_a = oldVNode.el) != null ? _a : null;
    if (!parentEl) return [];
    const ops = diffKeyed(oldVNode.children, newVNode.children);
    return ops.map((op) => ({
      type: op.type,
      newNode: op.newNode,
      index: op.index
    }));
  }
  // -------------------------------------------------------------------------
  // Patch application (per PatchType)
  // -------------------------------------------------------------------------
  /**
   * Apply a single patch.
   * Handles all PatchTypes.
   */
  applyPatch(patch) {
    switch (patch.type) {
      case "CREATE":
        return this.applyCreate(patch);
      case "REPLACE":
        return this.applyReplace(patch);
      case "PROPS":
        return this.applyProps(patch);
      case "TEXT":
        return this.applyText(patch);
      case "REORDER":
        return this.applyReorder(patch);
      case "REMOVE":
        return this.applyRemove(patch);
      case "INSERT":
        return this.applyInsert(patch);
      default:
        return {
          success: false,
          node: null,
          error: `Unknown patch type: ${patch.type}`
        };
    }
  }
  /** CREATE -- create a new DOM node and attach it. */
  applyCreate(patch) {
    var _a;
    const vnode = (_a = patch.newNode) != null ? _a : patch.vnode;
    const el = this.createDOMNode(vnode);
    if (el && this.root) {
      this.dom.appendChild(this.root, el);
      this.callMountedHook(vnode);
    }
    vnode.el = el;
    return { success: true, node: el };
  }
  /** REPLACE -- replace an old DOM node with a new one. */
  applyReplace(patch) {
    const oldVNode = patch.vnode;
    const newVNode = patch.newNode;
    if (!oldVNode.el || !oldVNode.el.parentNode) {
      return { success: false, node: null, error: "Cannot replace: old node has no parent" };
    }
    const parent = oldVNode.el.parentNode;
    const newEl = this.createDOMNode(newVNode);
    if (newEl) {
      this.dom.insertBefore(parent, newEl, oldVNode.el);
      this.callBeforeUnmountHook(oldVNode);
      this.dom.removeChild(parent, oldVNode.el);
      this.callMountedHook(newVNode);
    }
    this.callUnmountedHook(oldVNode);
    removeAllEventListeners(oldVNode);
    releaseVNode(oldVNode);
    newVNode.el = newEl;
    return { success: true, node: newEl };
  }
  /** PROPS -- update props and children on an existing DOM node. */
  applyProps(patch) {
    const oldVNode = patch.vnode;
    const newVNode = patch.newNode;
    const el = oldVNode.el;
    if (!el || !(el instanceof Element)) {
      return { success: false, node: null, error: "Cannot apply props: no DOM element" };
    }
    this.callBeforeUpdateHook(oldVNode);
    if (patch.props) {
      for (const change of patch.props) {
        if (change.value === void 0) {
          removeProp(el, change.key, change.oldValue);
        } else {
          setProp(el, change.key, change.value, change.oldValue);
        }
      }
    }
    if (patch.children) {
      this.patchChildren(el, oldVNode.children, newVNode.children);
    }
    oldVNode.props = newVNode.props;
    oldVNode.children = newVNode.children;
    oldVNode.text = newVNode.text;
    this.callUpdatedHook(oldVNode);
    return { success: true, node: el };
  }
  /** TEXT -- update text content of a text/comment node. */
  applyText(patch) {
    var _a;
    const vnode = patch.vnode;
    const newText = (_a = patch.text) != null ? _a : "";
    if (!vnode.el) {
      return { success: false, node: null, error: "Cannot apply text: no DOM element" };
    }
    this.dom.setTextContent(vnode.el, newText);
    vnode.text = newText;
    return { success: true, node: vnode.el };
  }
  /** REORDER -- reorder children of a parent node. */
  applyReorder(patch) {
    var _a;
    const vnode = patch.vnode;
    if (!vnode.el) {
      return { success: false, node: null, error: "Cannot reorder: no parent element" };
    }
    const parentEl = vnode.el;
    const newChildren = (_a = patch.children) != null ? _a : [];
    while (parentEl.firstChild) {
      this.dom.removeChild(parentEl, parentEl.firstChild);
    }
    for (const child of newChildren) {
      const childEl = this.createDOMNode(child);
      if (childEl) {
        this.dom.appendChild(parentEl, childEl);
      }
    }
    vnode.children = newChildren;
    return { success: true, node: parentEl };
  }
  /** REMOVE -- remove a DOM node. */
  applyRemove(patch) {
    const vnode = patch.vnode;
    if (!vnode.el || !vnode.el.parentNode) {
      return { success: true, node: null };
    }
    const parent = vnode.el.parentNode;
    this.callBeforeUnmountHook(vnode);
    this.dom.removeChild(parent, vnode.el);
    this.callUnmountedHook(vnode);
    removeAllEventListeners(vnode);
    releaseVNode(vnode);
    return { success: true, node: null };
  }
  /** INSERT -- insert a new DOM node at a specific position. */
  applyInsert(patch) {
    var _a, _b, _c, _d, _e;
    const vnode = (_a = patch.newNode) != null ? _a : patch.vnode;
    const index = (_b = patch.index) != null ? _b : 0;
    const parentEl = (_d = (_c = patch.vnode.el) == null ? void 0 : _c.parentNode) != null ? _d : this.root;
    if (!parentEl) {
      return { success: false, node: null, error: "No parent for insert" };
    }
    const newEl = this.createDOMNode(vnode);
    if (!newEl) {
      return { success: false, node: null, error: "Failed to create DOM node" };
    }
    const ref2 = (_e = parentEl.childNodes[index]) != null ? _e : null;
    this.dom.insertBefore(parentEl, newEl, ref2);
    this.callMountedHook(vnode);
    vnode.el = newEl;
    return { success: true, node: newEl };
  }
  // -------------------------------------------------------------------------
  // DOM node creation
  // -------------------------------------------------------------------------
  /**
   * Create the real DOM node for a VNode (recursively for children).
   */
  createDOMNode(vnode) {
    switch (vnode.type) {
      case "element": {
        const tag = vnode.tag;
        const el = this.dom.createElement(tag);
        vnode.el = el;
        for (const [key, value] of Object.entries(vnode.props)) {
          if (key !== "key" && key !== "ref") {
            setProp(el, key, value);
          }
        }
        for (const child of vnode.children) {
          const childEl = this.createDOMNode(child);
          if (childEl) {
            this.dom.appendChild(el, childEl);
          }
        }
        return el;
      }
      case "text": {
        const el = this.dom.createTextNode(vnode.text);
        vnode.el = el;
        return el;
      }
      case "comment": {
        const el = this.dom.createComment(vnode.text);
        vnode.el = el;
        return el;
      }
      case "fragment": {
        const el = this.dom.createDocumentFragment();
        vnode.el = el;
        for (const child of vnode.children) {
          const childEl = this.createDOMNode(child);
          if (childEl) {
            this.dom.appendChild(el, childEl);
          }
        }
        return el;
      }
      case "component": {
        const el = this.dom.createComment(`component:${String(vnode.tag)}`);
        vnode.el = el;
        return el;
      }
      default:
        return null;
    }
  }
  /**
   * Remove a DOM node and all its children.
   */
  removeDOMNode(vnode, parent) {
    if (vnode.el) {
      removeAllEventListeners(vnode);
      if (vnode.el.parentNode) {
        this.dom.removeChild(vnode.el.parentNode, vnode.el);
      }
      vnode.el = null;
    }
    for (const child of vnode.children) {
      this.removeDOMNode(child, parent);
    }
  }
  /**
   * Patch children of an element using keyed diff.
   */
  patchChildren(parentEl, oldChildren, newChildren) {
    var _a, _b, _c, _d, _e;
    const ops = diffKeyed(oldChildren, newChildren);
    for (const op of ops) {
      switch (op.type) {
        case "INSERT": {
          const newEl = this.createDOMNode(op.newNode);
          if (newEl) {
            const ref2 = (_a = parentEl.childNodes[op.index]) != null ? _a : null;
            this.dom.insertBefore(parentEl, newEl, ref2);
            this.callMountedHook(op.newNode);
          }
          break;
        }
        case "REMOVE": {
          const toRemove = (_b = op.removedNodes) != null ? _b : op.oldNode ? [op.oldNode] : [];
          for (const node of toRemove) {
            if (node == null ? void 0 : node.el) {
              this.callBeforeUnmountHook(node);
              this.dom.removeChild(parentEl, node.el);
              this.callUnmountedHook(node);
              removeAllEventListeners(node);
              releaseVNode(node);
            }
          }
          break;
        }
        case "MOVE": {
          if ((_c = op.oldNode) == null ? void 0 : _c.el) {
            const ref2 = (_d = parentEl.childNodes[op.index]) != null ? _d : null;
            this.dom.insertBefore(parentEl, op.oldNode.el, ref2);
            op.newNode.el = op.oldNode.el;
          }
          break;
        }
        case "UPDATE": {
          if (((_e = op.oldNode) == null ? void 0 : _e.el) && op.oldNode.el instanceof Element) {
            diffProps(op.oldNode.el, op.oldNode.props, op.newNode.props);
            this.patchChildren(op.oldNode.el, op.oldNode.children, op.newNode.children);
            op.newNode.el = op.oldNode.el;
          }
          break;
        }
      }
    }
  }
  // -------------------------------------------------------------------------
  // Lifecycle hooks
  // -------------------------------------------------------------------------
  callMountedHook(vnode) {
    var _a;
    if ((_a = vnode.hooks) == null ? void 0 : _a.mounted) {
      vnode.hooks.mounted(vnode);
    }
  }
  callBeforeUpdateHook(vnode) {
    var _a;
    if ((_a = vnode.hooks) == null ? void 0 : _a.beforeUpdate) {
      vnode.hooks.beforeUpdate(vnode);
    }
  }
  callUpdatedHook(vnode) {
    var _a;
    if ((_a = vnode.hooks) == null ? void 0 : _a.updated) {
      vnode.hooks.updated(vnode);
    }
  }
  callBeforeUnmountHook(vnode) {
    var _a;
    if ((_a = vnode.hooks) == null ? void 0 : _a.beforeUnmount) {
      vnode.hooks.beforeUnmount(vnode);
    }
  }
  callUnmountedHook(vnode) {
    var _a;
    if ((_a = vnode.hooks) == null ? void 0 : _a.unmounted) {
      vnode.hooks.unmounted(vnode);
    }
  }
  // -------------------------------------------------------------------------
  // Memory management
  // -------------------------------------------------------------------------
  /**
   * Release an entire VNode tree back to the memory pool.
   */
  releaseVNodeTree(vnode) {
    for (const child of vnode.children) {
      this.releaseVNodeTree(child);
    }
    releaseVNode(vnode);
  }
};
function createDiffEngine(domOps) {
  return new DiffEngine(domOps);
}

// packages/runtime/tw/directives.ts
var DirectiveRegistry = class {
  constructor() {
    __publicField(this, "directives", /* @__PURE__ */ new Map());
    __publicField(this, "instances", /* @__PURE__ */ new Map());
  }
  /**
   * Register a directive.
   */
  register(name, directive) {
    const hooks = typeof directive === "function" ? { mounted: directive } : directive;
    this.directives.set(name, hooks);
  }
  /**
   * Unregister a directive.
   */
  unregister(name) {
    this.directives.delete(name);
  }
  /**
   * Check if a directive is registered.
   */
  has(name) {
    return this.directives.has(name);
  }
  /**
   * Get a directive by name.
   */
  get(name) {
    return this.directives.get(name);
  }
  /**
   * Apply a directive to an element.
   */
  apply(name, el, binding, hook) {
    const directive = this.directives.get(name);
    if (!directive) return;
    const fn = directive[hook];
    if (!fn) return;
    try {
      fn(el, binding);
    } catch (e) {
      console.error(`[TW Directive] Error in '${name}.${hook}':`, e);
    }
    if (hook === "mounted") {
      if (!this.instances.has(el)) this.instances.set(el, /* @__PURE__ */ new Map());
      const elInstances = this.instances.get(el);
      elInstances.set(name, { binding, cleanup: [] });
    }
    if (hook === "unmounted") {
      const elInstances = this.instances.get(el);
      if (elInstances) {
        const instance = elInstances.get(name);
        if (instance) {
          for (const cleanup of instance.cleanup) {
            try {
              cleanup();
            } catch (e) {
              console.error("[TW Directive] Cleanup error:", e);
            }
          }
          elInstances.delete(name);
        }
        if (elInstances.size === 0) this.instances.delete(el);
      }
    }
  }
  /**
   * Register a cleanup function for a directive instance.
   */
  registerCleanup(el, name, cleanup) {
    const elInstances = this.instances.get(el);
    if (elInstances) {
      const instance = elInstances.get(name);
      if (instance) instance.cleanup.push(cleanup);
    }
  }
  /**
   * Remove all directives from an element.
   */
  removeAll(el) {
    const elInstances = this.instances.get(el);
    if (elInstances) {
      for (const [name, instance] of elInstances) {
        for (const cleanup of instance.cleanup) {
          try {
            cleanup();
          } catch (e) {
            console.error("[TW Directive] Cleanup error:", e);
          }
        }
        const directive = this.directives.get(name);
        if (directive == null ? void 0 : directive.unmounted) {
          try {
            directive.unmounted(el, instance.binding);
          } catch (e) {
            console.error("[TW Directive] Unmount error:", e);
          }
        }
      }
      this.instances.delete(el);
    }
  }
  /**
   * Get all registered directive names.
   */
  names() {
    return Array.from(this.directives.keys());
  }
};
var globalRegistry = new DirectiveRegistry();
function getDirectiveRegistry() {
  return globalRegistry;
}
function registerDirective(name, directive) {
  globalRegistry.register(name, directive);
}
function unregisterDirective(name) {
  globalRegistry.unregister(name);
}
var focusDirective = {
  mounted: (el) => {
    el.focus();
  }
};
var intersectionDirective = {
  mounted: (el, binding) => {
    const callback = binding.value;
    if (typeof callback !== "function") return;
    const options = {
      rootMargin: binding.modifiers.rootMargin || "0px",
      threshold: binding.modifiers.threshold || 0
    };
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) callback(entry, el);
    }, options);
    observer.observe(el);
    globalRegistry.registerCleanup(el, "tw-intersection", () => observer.disconnect());
  }
};
var clickOutsideDirective = {
  mounted: (el, binding) => {
    const handler = binding.value;
    if (typeof handler !== "function") return;
    const listener = (event) => {
      if (!el.contains(event.target)) {
        handler(event);
      }
    };
    document.addEventListener("click", listener, true);
    globalRegistry.registerCleanup(el, "tw-click-outside", () => {
      document.removeEventListener("click", listener, true);
    });
  }
};
var resizeDirective = {
  mounted: (el, binding) => {
    const handler = binding.value;
    if (typeof handler !== "function") return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) handler(entry, el);
    });
    observer.observe(el);
    globalRegistry.registerCleanup(el, "tw-resize", () => observer.disconnect());
  }
};
var mutationDirective = {
  mounted: (el, binding) => {
    const handler = binding.value;
    if (typeof handler !== "function") return;
    const observer = new MutationObserver((mutations) => {
      handler(mutations, el);
    });
    observer.observe(el, { childList: true, subtree: true, attributes: true, characterData: true });
    globalRegistry.registerCleanup(el, "tw-mutation", () => observer.disconnect());
  }
};
var clipboardDirective = {
  mounted: (el, binding) => {
    const text = binding.value;
    el.style.cursor = "pointer";
    const handler = async () => {
      try {
        await navigator.clipboard.writeText(text);
        el.dispatchEvent(new CustomEvent("tw-copied", { detail: { text } }));
      } catch (e) {
        console.error("[TW Directive] Clipboard error:", e);
      }
    };
    el.addEventListener("click", handler);
    globalRegistry.registerCleanup(el, "tw-clipboard", () => {
      el.removeEventListener("click", handler);
    });
  }
};
var debounceDirective = {
  mounted: (el, binding) => {
    const handler = binding.value;
    const delay = binding.arg ? parseInt(binding.arg, 10) : 300;
    if (typeof handler !== "function") return;
    let timer = null;
    const input = el;
    const listener = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => handler(input.value), delay);
    };
    el.addEventListener("input", listener);
    globalRegistry.registerCleanup(el, "tw-debounce", () => {
      if (timer) clearTimeout(timer);
      el.removeEventListener("input", listener);
    });
  }
};
var longpressDirective = {
  mounted: (el, binding) => {
    const handler = binding.value;
    const duration = binding.arg ? parseInt(binding.arg, 10) : 500;
    if (typeof handler !== "function") return;
    let timer = null;
    const start = () => {
      timer = setTimeout(() => {
        handler();
        timer = null;
      }, duration);
    };
    const cancel2 = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    el.addEventListener("mousedown", start);
    el.addEventListener("touchstart", start);
    el.addEventListener("mouseup", cancel2);
    el.addEventListener("mouseleave", cancel2);
    el.addEventListener("touchend", cancel2);
    globalRegistry.registerCleanup(el, "tw-longpress", () => {
      el.removeEventListener("mousedown", start);
      el.removeEventListener("touchstart", start);
      el.removeEventListener("mouseup", cancel2);
      el.removeEventListener("mouseleave", cancel2);
      el.removeEventListener("touchend", cancel2);
    });
  }
};
var lazyDirective = {
  mounted: (el, binding) => {
    const img = el;
    const src = binding.value;
    if (!src) return;
    img.style.opacity = "0";
    img.style.transition = "opacity 0.3s ease";
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          img.src = src;
          img.onload = () => {
            img.style.opacity = "1";
          };
          observer.disconnect();
        }
      }
    });
    observer.observe(img);
    globalRegistry.registerCleanup(el, "tw-lazy", () => observer.disconnect());
  }
};
function registerBuiltinDirectives() {
  registerDirective("tw-focus", focusDirective);
  registerDirective("tw-intersection", intersectionDirective);
  registerDirective("tw-click-outside", clickOutsideDirective);
  registerDirective("tw-resize", resizeDirective);
  registerDirective("tw-mutation", mutationDirective);
  registerDirective("tw-clipboard", clipboardDirective);
  registerDirective("tw-debounce", debounceDirective);
  registerDirective("tw-longpress", longpressDirective);
  registerDirective("tw-lazy", lazyDirective);
}

// packages/runtime/tw/dom-utils.ts
function addClass(el, ...classes) {
  el.classList.add(...classes);
}
function removeClass(el, ...classes) {
  el.classList.remove(...classes);
}
function toggleClass(el, cls, force) {
  return el.classList.toggle(cls, force);
}
function hasClass(el, cls) {
  return el.classList.contains(cls);
}
function setClasses(el, classes) {
  if (typeof classes === "string") {
    el.className = classes;
  } else if (Array.isArray(classes)) {
    el.className = classes.join(" ");
  } else {
    for (const [cls, active] of Object.entries(classes)) {
      if (active) el.classList.add(cls);
      else el.classList.remove(cls);
    }
  }
}
function setStyle(el, property, value) {
  el.style.setProperty(kebabCase(property), value);
}
function setStyles(el, styles) {
  for (const [prop, value] of Object.entries(styles)) {
    el.style.setProperty(kebabCase(prop), value);
  }
}
function removeStyle(el, property) {
  el.style.removeProperty(kebabCase(property));
}
function getStyle(el, property) {
  return window.getComputedStyle(el).getPropertyValue(kebabCase(property));
}
function styleToString3(styles) {
  return Object.entries(styles).map(([k, v]) => `${kebabCase(k)}: ${v}`).join("; ");
}
function setAttr(el, name, value) {
  if (value === false || value === null || value === void 0) {
    el.removeAttribute(name);
  } else if (value === true) {
    el.setAttribute(name, "");
  } else {
    el.setAttribute(name, String(value));
  }
}
function getAttr(el, name) {
  return el.getAttribute(name);
}
function removeAttr(el, name) {
  el.removeAttribute(name);
}
function hasAttr(el, name) {
  return el.hasAttribute(name);
}
function setAttrs(el, attrs) {
  for (const [name, value] of Object.entries(attrs)) {
    setAttr(el, name, value);
  }
}
function on(el, event, handler, options) {
  el.addEventListener(event, handler, options);
  return () => el.removeEventListener(event, handler, options);
}
function once(el, event, handler) {
  const wrapper = (e) => {
    handler(e);
    el.removeEventListener(event, wrapper);
  };
  el.addEventListener(event, wrapper);
  return () => el.removeEventListener(event, wrapper);
}
function createElement(tag, attrs, children) {
  const el = document.createElement(tag);
  if (attrs) setAttrs(el, attrs);
  if (children) for (const child of children) el.appendChild(child);
  return el;
}
function createText(text) {
  return document.createTextNode(text);
}
function find(parent, selector) {
  return parent.querySelector(selector);
}
function findAll(parent, selector) {
  return Array.from(parent.querySelectorAll(selector));
}
function closest(el, selector) {
  return el.closest(selector);
}
function append(parent, ...children) {
  parent.append(...children);
}
function prepend(parent, ...children) {
  parent.prepend(...children);
}
function insertBefore(parent, newChild, refChild) {
  parent.insertBefore(newChild, refChild);
}
function replaceChild(parent, newChild, oldChild) {
  parent.replaceChild(newChild, oldChild);
}
function remove(el) {
  el.remove();
}
var readQueue = [];
var writeQueue = [];
var isScheduled = false;
function readDOM(fn) {
  readQueue.push(fn);
  scheduleFlush();
}
function writeDOM(fn) {
  writeQueue.push(fn);
  scheduleFlush();
}
function scheduleFlush() {
  if (isScheduled) return;
  isScheduled = true;
  requestAnimationFrame(flushReadWrite);
}
function flushReadWrite() {
  isScheduled = false;
  while (readQueue.length > 0) {
    const fn = readQueue.shift();
    try {
      fn();
    } catch (e) {
      console.error("[TW DOM] Read error:", e);
    }
  }
  while (writeQueue.length > 0) {
    const fn = writeQueue.shift();
    try {
      fn();
    } catch (e) {
      console.error("[TW DOM] Write error:", e);
    }
  }
}
function kebabCase(str) {
  return str.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}
function isElement(obj) {
  return obj instanceof HTMLElement;
}
function isInViewport(el, threshold = 0) {
  const rect = el.getBoundingClientRect();
  const windowHeight = window.innerHeight || document.documentElement.clientHeight;
  const windowWidth = window.innerWidth || document.documentElement.clientWidth;
  return rect.top <= windowHeight - threshold && rect.bottom >= threshold && rect.left <= windowWidth - threshold && rect.right >= threshold;
}
function getOffset(el) {
  const rect = el.getBoundingClientRect();
  return {
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX
  };
}
function scrollTo(el, options) {
  var _a;
  (_a = el.scrollTo) == null ? void 0 : _a.call(el, options);
}
function getScrollParent(el) {
  let parent = el.parentElement;
  while (parent) {
    const style = window.getComputedStyle(parent);
    const overflow = style.overflow + style.overflowY + style.overflowX;
    if (/auto|scroll/.test(overflow)) return parent;
    parent = parent.parentElement;
  }
  return document.documentElement;
}

// packages/runtime/tw/drag-drop.ts
var DraggableManager = class {
  constructor(element, options = {}) {
    __publicField(this, "element");
    __publicField(this, "options");
    __publicField(this, "isDragging", false);
    __publicField(this, "startX", 0);
    __publicField(this, "startY", 0);
    __publicField(this, "currentX", 0);
    __publicField(this, "currentY", 0);
    __publicField(this, "ghost", null);
    __publicField(this, "dropZones", []);
    __publicField(this, "activeDropZone", null);
    __publicField(this, "delayTimer", null);
    __publicField(this, "pointerId", null);
    __publicField(this, "handlePointerDown", (e) => {
      if (this.options.disabled) return;
      if (this.options.handle) {
        const handle = this.element.querySelector(this.options.handle);
        if (handle && !handle.contains(e.target)) return;
      }
      e.preventDefault();
      this.pointerId = e.pointerId;
      this.startX = e.clientX;
      this.startY = e.clientY;
      this.currentX = e.clientX;
      this.currentY = e.clientY;
      if (this.options.delay && this.options.delay > 0) {
        this.delayTimer = setTimeout(() => this.startDrag(e), this.options.delay);
      } else {
        this.startDrag(e);
      }
      document.addEventListener("pointermove", this.handlePointerMove);
      document.addEventListener("pointerup", this.handlePointerUp);
    });
    __publicField(this, "handlePointerMove", (e) => {
      if (!this.isDragging) return;
      e.preventDefault();
      this.currentX = e.clientX;
      this.currentY = e.clientY;
      if (this.ghost) {
        let x = this.currentX;
        let y = this.currentY;
        if (this.options.axis === "x") y = this.startY;
        if (this.options.axis === "y") x = this.startX;
        this.ghost.style.left = `${x}px`;
        this.ghost.style.top = `${y}px`;
      }
      this.activeDropZone = null;
      for (const zone of this.dropZones) {
        const rect = zone.getBoundingClientRect();
        if (this.currentX >= rect.left && this.currentX <= rect.right && this.currentY >= rect.top && this.currentY <= rect.bottom) {
          this.activeDropZone = zone;
          zone.classList.add("tw-drop-active");
        } else {
          zone.classList.remove("tw-drop-active");
        }
      }
      if (this.options.onDragMove) {
        this.options.onDragMove(this.createDragMoveEvent());
      }
    });
    __publicField(this, "handlePointerUp", (e) => {
      if (this.delayTimer) {
        clearTimeout(this.delayTimer);
        this.delayTimer = null;
      }
      document.removeEventListener("pointermove", this.handlePointerMove);
      document.removeEventListener("pointerup", this.handlePointerUp);
      if (!this.isDragging) return;
      this.isDragging = false;
      if (this.ghost) {
        this.ghost.remove();
        this.ghost = null;
      }
      this.element.classList.remove(this.options.dragClass, this.options.chosenClass);
      for (const zone of this.dropZones) {
        zone.classList.remove("tw-drop-active");
      }
      if (this.options.onDragEnd) {
        this.options.onDragEnd(this.createDragEvent());
      }
      if (this.options.onDrop && this.activeDropZone) {
        this.options.onDrop({
          element: this.element,
          dropZone: this.activeDropZone,
          data: null,
          index: -1
        });
      }
      this.activeDropZone = null;
      this.pointerId = null;
    });
    this.element = element;
    this.options = {
      axis: "both",
      ghostClass: "tw-drag-ghost",
      chosenClass: "tw-drag-chosen",
      dragClass: "tw-drag-dragging",
      group: "default",
      sort: true,
      disabled: false,
      delay: 0,
      touchStartThreshold: 5,
      animation: 150,
      ...options
    };
    this.attach();
  }
  /**
   * Register a drop zone.
   */
  addDropZone(zone) {
    this.dropZones.push(zone);
  }
  /**
   * Remove a drop zone.
   */
  removeDropZone(zone) {
    const idx = this.dropZones.indexOf(zone);
    if (idx >= 0) this.dropZones.splice(idx, 1);
  }
  /**
   * Disable dragging.
   */
  disable() {
    this.options.disabled = true;
  }
  /**
   * Enable dragging.
   */
  enable() {
    this.options.disabled = false;
  }
  /**
   * Destroy the draggable.
   */
  destroy() {
    this.detach();
    this.dropZones = [];
  }
  // --- Internal ------------------------------------------------------
  attach() {
    this.element.addEventListener("pointerdown", this.handlePointerDown);
  }
  detach() {
    this.element.removeEventListener("pointerdown", this.handlePointerDown);
    if (typeof document !== "undefined") {
      document.removeEventListener("pointermove", this.handlePointerMove);
      document.removeEventListener("pointerup", this.handlePointerUp);
    }
  }
  startDrag(e) {
    this.isDragging = true;
    this.element.classList.add(this.options.chosenClass);
    this.ghost = this.element.cloneNode(true);
    this.ghost.classList.add(this.options.ghostClass);
    this.ghost.style.position = "fixed";
    this.ghost.style.pointerEvents = "none";
    this.ghost.style.zIndex = "9999";
    this.ghost.style.opacity = "0.8";
    this.ghost.style.left = `${e.clientX}px`;
    this.ghost.style.top = `${e.clientY}px`;
    this.ghost.style.width = `${this.element.offsetWidth}px`;
    document.body.appendChild(this.ghost);
    this.element.classList.add(this.options.dragClass);
    if (this.options.onDragStart) {
      this.options.onDragStart(this.createDragEvent());
    }
  }
  createDragEvent() {
    return {
      element: this.element,
      startX: this.startX,
      startY: this.startY,
      currentX: this.currentX,
      currentY: this.currentY,
      deltaX: this.currentX - this.startX,
      deltaY: this.currentY - this.startY
    };
  }
  createDragMoveEvent() {
    return {
      ...this.createDragEvent(),
      isOverDropZone: this.activeDropZone !== null,
      dropZone: this.activeDropZone
    };
  }
};
var SortableManager = class {
  constructor(container, options = {}) {
    __publicField(this, "container");
    __publicField(this, "items", []);
    __publicField(this, "draggedElement", null);
    __publicField(this, "draggedIndex", -1);
    __publicField(this, "placeholder", null);
    __publicField(this, "options");
    __publicField(this, "handlePointerDown", (e) => {
      if (this.options.disabled) return;
      const target = e.target;
      const item = target.closest("[data-tw-sortable-item]");
      if (!item || !this.container.contains(item)) return;
      this.draggedElement = item;
      this.draggedIndex = this.items.findIndex((i) => i.element === item);
      if (this.draggedIndex < 0) return;
      e.preventDefault();
      this.placeholder = document.createElement("div");
      this.placeholder.className = "tw-sortable-placeholder";
      this.placeholder.style.height = `${item.offsetHeight}px`;
      this.placeholder.style.width = `${item.offsetWidth}px`;
      this.placeholder.style.background = "rgba(0,0,0,0.05)";
      this.placeholder.style.border = "2px dashed #ccc";
      this.placeholder.style.margin = window.getComputedStyle(item).margin;
      item.classList.add("tw-sortable-dragging");
      item.style.opacity = "0.5";
      document.addEventListener("pointermove", this.handlePointerMove);
      document.addEventListener("pointerup", this.handlePointerUp);
    });
    __publicField(this, "handlePointerMove", (e) => {
      if (!this.draggedElement || !this.placeholder) return;
      e.preventDefault();
      const elementsAfter = document.elementsFromPoint(e.clientX, e.clientY);
      const overItem = elementsAfter.find(
        (el) => {
          var _a;
          return ((_a = el.hasAttribute) == null ? void 0 : _a.call(el, "data-tw-sortable-item")) && el !== this.draggedElement && this.container.contains(el);
        }
      );
      if (overItem) {
        const overIndex = this.items.findIndex((i) => i.element === overItem);
        if (overIndex >= 0 && overIndex !== this.draggedIndex) {
          if (overIndex > this.draggedIndex) {
            this.container.insertBefore(this.placeholder, overItem.nextSibling);
          } else {
            this.container.insertBefore(this.placeholder, overItem);
          }
          this.draggedIndex = overIndex;
        }
      }
      if (!this.placeholder.parentElement) {
        this.container.appendChild(this.placeholder);
      }
    });
    __publicField(this, "handlePointerUp", (e) => {
      document.removeEventListener("pointermove", this.handlePointerMove);
      document.removeEventListener("pointerup", this.handlePointerUp);
      if (!this.draggedElement) return;
      if (this.placeholder && this.placeholder.parentElement) {
        this.placeholder.parentElement.insertBefore(this.draggedElement, this.placeholder);
        this.placeholder.remove();
      }
      this.draggedElement.classList.remove("tw-sortable-dragging");
      this.draggedElement.style.opacity = "";
      const newIndex = Array.from(this.container.children).indexOf(this.draggedElement);
      const oldIndex = this.items.findIndex((i) => i.element === this.draggedElement);
      if (newIndex !== oldIndex && newIndex >= 0 && this.options.onSort) {
        this.options.onSort(oldIndex, newIndex);
      }
      this.initItems();
      this.draggedElement = null;
      this.draggedIndex = -1;
      this.placeholder = null;
    });
    this.container = container;
    this.options = { sort: true, animation: 150, ...options };
    this.initItems();
    this.attach();
  }
  /**
   * Refresh items (call when list changes).
   */
  refresh() {
    this.initItems();
  }
  /**
   * Destroy the sortable.
   */
  destroy() {
    this.detach();
    this.items = [];
  }
  // --- Internal ------------------------------------------------------
  initItems() {
    this.items = [];
    const children = Array.from(this.container.children);
    for (let i = 0; i < children.length; i++) {
      this.items.push({
        element: children[i],
        index: i,
        startY: 0,
        height: children[i].offsetHeight
      });
    }
  }
  attach() {
    this.container.addEventListener("pointerdown", this.handlePointerDown);
  }
  detach() {
    this.container.removeEventListener("pointerdown", this.handlePointerDown);
    if (typeof document !== "undefined") {
      document.removeEventListener("pointermove", this.handlePointerMove);
      document.removeEventListener("pointerup", this.handlePointerUp);
    }
  }
};
function makeDraggable(element, options) {
  return new DraggableManager(element, options);
}
function makeSortable(container, options) {
  return new SortableManager(container, options);
}

// packages/runtime/tw/error-recovery.ts
var ErrorRecoveryManager = class {
  constructor() {
    __publicField(this, "instances", /* @__PURE__ */ new Map());
    __publicField(this, "errorLog", []);
    __publicField(this, "maxLogSize", 200);
    __publicField(this, "seenErrors", /* @__PURE__ */ new Set());
  }
  /**
   * Register a component for error recovery.
   */
  register(componentId, options = {}) {
    var _a, _b, _c, _d, _e, _f;
    const instance = {
      error: null,
      attempts: 0,
      isRetrying: false,
      options: {
        maxRetries: (_a = options.maxRetries) != null ? _a : 3,
        retryDelay: (_b = options.retryDelay) != null ? _b : 1e3,
        backoffMultiplier: (_c = options.backoffMultiplier) != null ? _c : 2,
        reportErrors: (_d = options.reportErrors) != null ? _d : false,
        reportUrl: (_e = options.reportUrl) != null ? _e : "",
        onError: options.onError,
        onRetry: options.onRetry,
        onMaxRetriesExceeded: options.onMaxRetriesExceeded,
        fallback: (_f = options.fallback) != null ? _f : null
      },
      lastErrorTime: 0,
      retryTimer: null
    };
    this.instances.set(componentId, instance);
    return {
      retry: async () => this.doRetry(componentId),
      reset: () => {
        instance.error = null;
        instance.attempts = 0;
        instance.isRetrying = false;
        if (instance.retryTimer) {
          clearTimeout(instance.retryTimer);
          instance.retryTimer = null;
        }
      },
      get isRetrying() {
        return instance.isRetrying;
      },
      get attempts() {
        return instance.attempts;
      }
    };
  }
  /**
   * Report an error.
   */
  reportError(componentId, componentName, error) {
    const instance = this.instances.get(componentId);
    if (!instance) return;
    instance.error = error;
    instance.lastErrorTime = Date.now();
    const errorKey = `${componentId}:${error.message}`;
    if (!this.seenErrors.has(errorKey)) {
      this.seenErrors.add(errorKey);
      this.errorLog.push({ componentId, error: error.message, timestamp: Date.now() });
      if (this.errorLog.length > this.maxLogSize) this.errorLog.shift();
    }
    const ctx = {
      componentId,
      componentName,
      attempt: instance.attempts,
      error,
      timestamp: Date.now()
    };
    if (instance.options.onError) {
      try {
        instance.options.onError(error, ctx);
      } catch (e) {
        console.error("[TW ErrorRecovery] onError callback failed:", e);
      }
    }
    if (instance.options.reportErrors && instance.options.reportUrl) {
      this.reportToService(instance.options.reportUrl, error, ctx).catch(() => {
      });
    }
  }
  /**
   * Attempt to retry after an error.
   */
  async doRetry(componentId) {
    const instance = this.instances.get(componentId);
    if (!instance || !instance.error) return false;
    if (instance.attempts >= instance.options.maxRetries) {
      if (instance.options.onMaxRetriesExceeded) {
        instance.options.onMaxRetriesExceeded(instance.error);
      }
      return false;
    }
    instance.attempts++;
    instance.isRetrying = true;
    if (instance.options.onRetry) {
      instance.options.onRetry(instance.attempts);
    }
    const delay = instance.options.retryDelay * Math.pow(instance.options.backoffMultiplier, instance.attempts - 1);
    await new Promise((resolve) => {
      instance.retryTimer = setTimeout(() => {
        instance.retryTimer = null;
        resolve();
      }, delay);
    });
    instance.isRetrying = false;
    instance.error = null;
    return true;
  }
  /**
   * Get error log.
   */
  getErrorLog() {
    return [...this.errorLog];
  }
  /**
   * Clear all errors and cleanup timers.
   */
  clearAll() {
    for (const instance of this.instances.values()) {
      if (instance.retryTimer) {
        clearTimeout(instance.retryTimer);
        instance.retryTimer = null;
      }
    }
    this.instances.clear();
    this.errorLog = [];
    this.seenErrors.clear();
  }
  /**
   * Report error to external service.
   */
  async reportToService(url, error, context) {
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: { message: error.message, stack: error.stack },
          context
        })
      });
    } catch {
    }
  }
};
var globalErrorRecovery = null;
function getErrorRecovery() {
  if (!globalErrorRecovery) globalErrorRecovery = new ErrorRecoveryManager();
  return globalErrorRecovery;
}
function withErrorRecovery(componentId, fn, options) {
  const manager = getErrorRecovery();
  const handle = manager.register(componentId, options);
  return fn().catch(async (error) => {
    manager.reportError(componentId, componentId, error);
    const retried = await handle.retry();
    if (retried) {
      return fn();
    }
    throw error;
  });
}
function createErrorBoundary(fallback, onError) {
  let hasError = false;
  let currentError = null;
  return {
    get hasError() {
      return hasError;
    },
    get error() {
      return currentError;
    },
    get fallback() {
      return fallback;
    },
    reset: () => {
      hasError = false;
      currentError = null;
    },
    catch: (error) => {
      hasError = true;
      currentError = error;
      if (onError) onError(error);
    }
  };
}

// packages/runtime/tw/event-bus.ts
var EventBus = class {
  constructor() {
    __publicField(this, "listeners", /* @__PURE__ */ new Map());
    __publicField(this, "wildcardListeners", []);
    __publicField(this, "history", []);
    __publicField(this, "maxHistory", 100);
    __publicField(this, "isPublishing", false);
  }
  /**
   * Subscribe to an event.
   */
  on(event, handler, options = {}) {
    var _a, _b, _c, _d, _e, _f;
    const listener = {
      handler,
      priority: (_a = options.priority) != null ? _a : 0,
      once: (_b = options.once) != null ? _b : false,
      namespace: (_c = options.namespace) != null ? _c : "default"
    };
    if (event === "*") {
      this.wildcardListeners.push(listener);
      return { unsubscribe: () => this.removeListener(this.wildcardListeners, listener) };
    }
    if (event.includes("*")) {
      const regex = patternToRegex(event);
      const patternListener = {
        handler: ((data, meta) => {
          if (regex.test(meta.name)) {
            handler(data, meta.name);
          }
        }),
        priority: (_d = options.priority) != null ? _d : 0,
        once: (_e = options.once) != null ? _e : false,
        namespace: (_f = options.namespace) != null ? _f : "default"
      };
      this.wildcardListeners.push(patternListener);
      return { unsubscribe: () => this.removeListener(this.wildcardListeners, patternListener) };
    }
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    const list = this.listeners.get(event);
    list.push(listener);
    list.sort((a, b) => b.priority - a.priority);
    return { unsubscribe: () => this.removeListener(list, listener) };
  }
  /**
   * Subscribe to an event pattern (e.g., "user.*" matches "user.created").
   */
  onPattern(pattern, handler, options = {}) {
    const regex = patternToRegex(pattern);
    const wrappedHandler = (data, meta) => {
      if (regex.test(meta.name)) {
        handler(data, meta);
      }
    };
    return this.on("*", wrappedHandler, options);
  }
  /**
   * Subscribe to an event once.
   */
  once(event, handler, options) {
    return this.on(event, handler, { ...options, once: true });
  }
  /**
   * Publish an event.
   */
  async emit(event, data, options = {}) {
    var _a;
    const meta = {
      name: event,
      namespace: (_a = options.namespace) != null ? _a : "default",
      timestamp: Date.now(),
      propagationStopped: false,
      defaultPrevented: false,
      priority: 0
    };
    this.history.push({ name: event, data, timestamp: meta.timestamp });
    if (this.history.length > this.maxHistory) this.history.shift();
    const listeners = [
      ...this.listeners.get(event) || [],
      ...this.wildcardListeners
    ];
    for (const listener of listeners) {
      if (meta.propagationStopped) break;
      if (listener.once) {
        const list = this.listeners.get(event);
        if (list) this.removeListener(list, listener);
        this.removeListener(this.wildcardListeners, listener);
      }
      try {
        await listener.handler(data, meta);
      } catch (e) {
        console.error(`[TW EventBus] Handler error for '${event}':`, e);
      }
    }
  }
  /**
   * Publish an event synchronously (doesn't await async handlers).
   */
  emitSync(event, data, options = {}) {
    var _a;
    const meta = {
      name: event,
      namespace: (_a = options.namespace) != null ? _a : "default",
      timestamp: Date.now(),
      propagationStopped: false,
      defaultPrevented: false,
      priority: 0
    };
    this.history.push({ name: event, data, timestamp: meta.timestamp });
    if (this.history.length > this.maxHistory) this.history.shift();
    const listeners = [
      ...this.listeners.get(event) || [],
      ...this.wildcardListeners
    ];
    const toRemove = [];
    for (const listener of listeners) {
      if (meta.propagationStopped) break;
      try {
        const result = listener.handler(data, meta);
        if (result instanceof Promise) {
          result.catch((e) => console.error(`[TW EventBus] Async handler error for '${event}':`, e));
        }
      } catch (e) {
        console.error(`[TW EventBus] Handler error for '${event}':`, e);
      }
      if (listener.once) toRemove.push(listener);
    }
    for (const listener of toRemove) {
      const list = this.listeners.get(event);
      if (list) this.removeListener(list, listener);
      this.removeListener(this.wildcardListeners, listener);
    }
  }
  /**
   * Remove all listeners for an event.
   */
  off(event) {
    this.listeners.delete(event);
  }
  /**
   * Remove all listeners.
   */
  offAll() {
    this.listeners.clear();
    this.wildcardListeners = [];
  }
  /**
   * Get event history.
   */
  getHistory() {
    return [...this.history];
  }
  /**
   * Get listener count for an event.
   */
  listenerCount(event) {
    var _a;
    return (((_a = this.listeners.get(event)) == null ? void 0 : _a.length) || 0) + this.wildcardListeners.length;
  }
  /**
   * Check if an event has listeners.
   */
  hasListeners(event) {
    return this.listenerCount(event) > 0;
  }
  /**
   * Clear event history.
   */
  clearHistory() {
    this.history = [];
  }
  removeListener(list, listener) {
    const idx = list.indexOf(listener);
    if (idx >= 0) list.splice(idx, 1);
  }
};
function patternToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}
var globalEventBus = null;
function getEventBus() {
  if (!globalEventBus) globalEventBus = new EventBus();
  return globalEventBus;
}
function emit(event, data, options) {
  return getEventBus().emit(event, data, options);
}
function emitSync(event, data, options) {
  getEventBus().emitSync(event, data, options);
}
function off(event) {
  getEventBus().off(event);
}
function offAll() {
  getEventBus().offAll();
}
function createEventBus() {
  return new EventBus();
}

// packages/runtime/tw/event-delegation.ts
var EventDelegator = class {
  constructor(root) {
    __publicField(this, "root");
    __publicField(this, "handlers", /* @__PURE__ */ new Map());
    __publicField(this, "attachedEvents", /* @__PURE__ */ new Set());
    __publicField(this, "globalHandlers", /* @__PURE__ */ new Map());
    this.root = root;
  }
  /**
   * Register a delegated event handler.
   *
   * @param event Event type (e.g., 'click', 'input', 'keydown')
   * @param selector CSS selector to match elements (e.g., '[data-click="inc"]')
   * @param handler Function to call when event fires on matching element
   * @param options Handler options (modifiers, throttle, debounce)
   */
  on(event, selector, handler, options = {}) {
    const entry = {
      selector,
      handler,
      options,
      lastCall: 0,
      debounceTimer: null,
      fired: false
    };
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event).push(entry);
    if (!this.attachedEvents.has(event)) {
      this.attachListener(event);
    }
  }
  /**
   * Register a global event handler (no selector -- fires on all elements).
   */
  onGlobal(event, handler, options = {}) {
    const entry = {
      selector: "*",
      handler,
      options,
      lastCall: 0,
      debounceTimer: null,
      fired: false
    };
    if (!this.globalHandlers.has(event)) {
      this.globalHandlers.set(event, []);
    }
    this.globalHandlers.get(event).push(entry);
    if (!this.attachedEvents.has(event)) {
      this.attachListener(event);
    }
  }
  /**
   * Remove a specific handler.
   */
  off(event, selector, handler) {
    const handlers = this.handlers.get(event);
    if (handlers) {
      const idx = handlers.findIndex((h3) => h3.selector === selector && h3.handler === handler);
      if (idx >= 0) handlers.splice(idx, 1);
      if (handlers.length === 0) {
        this.handlers.delete(event);
        this.detachListener(event);
      }
    }
  }
  /**
   * Remove all handlers for an event type.
   */
  offAll(event) {
    this.handlers.delete(event);
    this.globalHandlers.delete(event);
    this.detachListener(event);
  }
  /**
   * Remove all handlers and detach all listeners.
   */
  destroy() {
    for (const event of this.attachedEvents) {
      this.detachListener(event);
    }
    this.handlers.clear();
    this.globalHandlers.clear();
    this.attachedEvents.clear();
  }
  /**
   * Get statistics about registered handlers.
   */
  getStats() {
    const result = [];
    for (const [event, handlers] of this.handlers) {
      result.push({ events: event, handlers: handlers.length });
    }
    return result;
  }
  // --- Internal ------------------------------------------------------
  attachListener(event) {
    this.attachedEvents.add(event);
    const listener = (e) => this.dispatchEvent(event, e);
    const handlers = this.handlers.get(event) || [];
    const globalHandlers = this.globalHandlers.get(event) || [];
    const allHandlers = [...handlers, ...globalHandlers];
    const anyPassive = allHandlers.some((h3) => h3.options.passive);
    this.root.addEventListener(event, listener, {
      passive: anyPassive,
      capture: false
    });
  }
  detachListener(event) {
    if (!this.attachedEvents.has(event)) return;
    this.attachedEvents.delete(event);
    this.root.removeEventListener(event, (e) => this.dispatchEvent(event, e));
  }
  dispatchEvent(eventType, e) {
    var _a;
    const handlers = this.handlers.get(eventType) || [];
    const globalHandlers = this.globalHandlers.get(eventType) || [];
    let target = e.target;
    const path = [];
    while (target && target !== this.root) {
      path.push(target);
      target = target.parentElement;
    }
    if (target === this.root) path.push(this.root);
    const toRemove = [];
    for (const handler of handlers) {
      if (handler.options.keys && handler.options.keys.length > 0) {
        const ke = e;
        const key = (_a = ke.key) == null ? void 0 : _a.toLowerCase();
        if (!key || !handler.options.keys.includes(key)) continue;
      }
      for (const el of path) {
        if (el.matches && el.matches(handler.selector)) {
          if (handler.options.self && e.target !== el) continue;
          if (handler.options.throttle) {
            const now = Date.now();
            if (now - handler.lastCall < handler.options.throttle) continue;
            handler.lastCall = now;
          }
          if (handler.options.debounce) {
            if (handler.debounceTimer) clearTimeout(handler.debounceTimer);
            handler.debounceTimer = setTimeout(() => {
              this.runHandler(handler, e, el);
            }, handler.options.debounce);
            continue;
          }
          this.runHandler(handler, e, el);
          if (handler.options.once && !handler.fired) {
            handler.fired = true;
            const idx = handlers.indexOf(handler);
            if (idx >= 0) toRemove.push({ handlers, index: idx });
          }
          break;
        }
      }
    }
    for (const handler of globalHandlers) {
      const el = e.target;
      this.runHandler(handler, e, el);
    }
    for (const { handlers: handlers2, index } of toRemove) {
      handlers2.splice(index, 1);
    }
  }
  runHandler(handler, e, el) {
    if (handler.options.stop) e.stopPropagation();
    if (handler.options.prevent && !handler.options.passive) e.preventDefault();
    try {
      handler.handler(e, el);
    } catch (err) {
      console.error("[TW EventDelegator] Handler error:", err);
    }
  }
};
var globalDelegator = null;
function initEventDelegation(root) {
  if (globalDelegator) {
    globalDelegator.destroy();
  }
  globalDelegator = new EventDelegator(root);
  return globalDelegator;
}
function getDelegator() {
  return globalDelegator;
}
function delegate(event, selector, handler, options) {
  if (!globalDelegator) {
    throw new Error("Event delegation not initialized. Call initEventDelegation(root) first.");
  }
  globalDelegator.on(event, selector, handler, options);
}
function delegateGlobal(event, handler, options) {
  if (!globalDelegator) {
    throw new Error("Event delegation not initialized. Call initEventDelegation(root) first.");
  }
  globalDelegator.onGlobal(event, handler, options);
}
function destroyEventDelegation() {
  if (globalDelegator) {
    globalDelegator.destroy();
    globalDelegator = null;
  }
}
function onClick(selector, handler, options) {
  delegate("click", selector, handler, options);
}
function onInput(selector, handler, options) {
  delegate("input", selector, handler, options);
}
function onChange(selector, handler, options) {
  delegate("change", selector, handler, options);
}
function onKeydown(selector, handler, options) {
  delegate("keydown", selector, handler, options);
}
function onSubmit(selector, handler, options) {
  delegate("submit", selector, handler, options);
}
function parseEventModifiers(modifierStr) {
  const parts = modifierStr.split(".");
  const event = parts[0];
  const options = {};
  for (let i = 1; i < parts.length; i++) {
    const mod = parts[i];
    if (mod === "stop") options.stop = true;
    else if (mod === "prevent") options.prevent = true;
    else if (mod === "once") options.once = true;
    else if (mod === "passive") options.passive = true;
    else if (mod === "capture") options.capture = true;
    else if (mod === "self") options.self = true;
    else if (mod.startsWith("throttle:")) {
      options.throttle = parseInt(mod.split(":")[1], 10);
    } else if (mod.startsWith("debounce:")) {
      options.debounce = parseInt(mod.split(":")[1], 10);
    } else if (mod.startsWith("key:")) {
      const key = mod.split(":")[1].toLowerCase();
      options.keys = [...options.keys || [], key];
    } else {
      options.keys = [...options.keys || [], mod.toLowerCase()];
    }
  }
  return { event, options };
}
function buildSelector(event, handlerId) {
  return `[data-${event}="${handlerId}"]`;
}

// packages/runtime/tw/fetch-utils.ts
var HttpClient = class {
  constructor(baseURL = "", defaultOptions = {}) {
    __publicField(this, "baseURL");
    __publicField(this, "defaultOptions");
    __publicField(this, "interceptors", []);
    __publicField(this, "pendingRequests", /* @__PURE__ */ new Map());
    __publicField(this, "defaultHeaders", {});
    this.baseURL = baseURL;
    this.defaultOptions = {
      timeout: 3e4,
      retries: 3,
      retryDelay: 1e3,
      retryOn: [408, 429, 500, 502, 503, 504],
      cache: false,
      cacheTTL: 6e4,
      dedup: true,
      interceptors: true,
      ...defaultOptions
    };
  }
  /**
   * Add an interceptor.
   */
  addInterceptor(interceptor) {
    this.interceptors.push(interceptor);
    return () => {
      const idx = this.interceptors.indexOf(interceptor);
      if (idx >= 0) this.interceptors.splice(idx, 1);
    };
  }
  /**
   * Set default headers.
   */
  setHeader(name, value) {
    this.defaultHeaders[name] = value;
  }
  /**
   * Remove a default header.
   */
  removeHeader(name) {
    delete this.defaultHeaders[name];
  }
  /**
   * Perform a GET request.
   */
  async get(url, options) {
    return this.request(url, { ...options, method: "GET" });
  }
  /**
   * Perform a POST request.
   */
  async post(url, body, options) {
    return this.request(url, {
      ...options,
      method: "POST",
      body: body !== void 0 ? JSON.stringify(body) : void 0,
      headers: { "Content-Type": "application/json", ...options == null ? void 0 : options.headers }
    });
  }
  /**
   * Perform a PUT request.
   */
  async put(url, body, options) {
    return this.request(url, {
      ...options,
      method: "PUT",
      body: body !== void 0 ? JSON.stringify(body) : void 0,
      headers: { "Content-Type": "application/json", ...options == null ? void 0 : options.headers }
    });
  }
  /**
   * Perform a PATCH request.
   */
  async patch(url, body, options) {
    return this.request(url, {
      ...options,
      method: "PATCH",
      body: body !== void 0 ? JSON.stringify(body) : void 0,
      headers: { "Content-Type": "application/json", ...options == null ? void 0 : options.headers }
    });
  }
  /**
   * Perform a DELETE request.
   */
  async delete(url, options) {
    return this.request(url, { ...options, method: "DELETE" });
  }
  /**
   * Main request method.
   */
  async request(url, options = {}) {
    const config = {
      ...this.defaultOptions,
      ...options,
      headers: { ...this.defaultHeaders, ...options.headers }
    };
    const fullURL = this.resolveURL(url, config.baseURL);
    const cacheKey = this.buildCacheKey(fullURL, config);
    if (config.cache) {
      const cached = getCacheManager().get(cacheKey);
      if (cached) {
        return { ...cached, fromCache: true };
      }
    }
    if (config.dedup) {
      const existing = this.pendingRequests.get(cacheKey);
      if (existing) {
        return existing;
      }
    }
    const requestPromise = this.doRequest(fullURL, config, cacheKey, cacheKey);
    if (config.dedup) {
      this.pendingRequests.set(cacheKey, requestPromise);
      requestPromise.finally(() => this.pendingRequests.delete(cacheKey));
    }
    return requestPromise;
  }
  // --- Internal ------------------------------------------------------
  async doRequest(url, config, cacheKey, _dedupKey) {
    let lastError = null;
    const maxRetries = config.retries || 0;
    const retryDelay = config.retryDelay || 1e3;
    const retryOn = config.retryOn || [];
    const startTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    let finalConfig = config;
    if (config.interceptors !== false) {
      for (const interceptor of this.interceptors) {
        if (interceptor.onRequest) {
          try {
            finalConfig = await interceptor.onRequest(finalConfig);
          } catch (e) {
            console.error("[TW HTTP] Request interceptor error:", e);
          }
        }
      }
    }
    const controller = new AbortController();
    const timeoutId = config.timeout ? setTimeout(() => controller.abort(), config.timeout) : null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          ...finalConfig,
          signal: controller.signal
        });
        if (timeoutId) clearTimeout(timeoutId);
        let finalResponse = response;
        if (config.interceptors !== false) {
          for (const interceptor of this.interceptors) {
            if (interceptor.onResponse) {
              try {
                finalResponse = await interceptor.onResponse(finalResponse);
              } catch (e) {
                console.error("[TW HTTP] Response interceptor error:", e);
              }
            }
          }
        }
        if (retryOn.includes(finalResponse.status) && attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, retryDelay * Math.pow(2, attempt)));
          continue;
        }
        let data;
        const contentType = finalResponse.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          data = await finalResponse.json();
        } else if (contentType.includes("text/")) {
          data = await finalResponse.text();
        } else {
          data = await finalResponse.blob();
        }
        const duration = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
        const result = {
          data,
          status: finalResponse.status,
          headers: finalResponse.headers,
          ok: finalResponse.ok,
          url,
          duration,
          fromCache: false
        };
        if (config.cache && finalResponse.ok) {
          getCacheManager().set(cacheKey, result, { ttl: config.cacheTTL });
        }
        return result;
      } catch (e) {
        if (timeoutId) clearTimeout(timeoutId);
        lastError = e;
        if (config.interceptors !== false) {
          for (const interceptor of this.interceptors) {
            if (interceptor.onError) {
              try {
                lastError = await interceptor.onError(lastError);
              } catch (err) {
                console.error("[TW HTTP] Error interceptor failed:", err);
              }
            }
          }
        }
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, retryDelay * Math.pow(2, attempt)));
          continue;
        }
        throw lastError;
      }
    }
    throw lastError || new Error("Request failed");
  }
  resolveURL(url, baseURL) {
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    const base = baseURL || this.baseURL;
    if (!base) return url;
    return base.replace(/\/$/, "") + "/" + url.replace(/^\//, "");
  }
  buildCacheKey(url, config) {
    return `fetch:${config.method || "GET"}:${url}`;
  }
};
var globalHttpClient = null;
function getHttpClient() {
  if (!globalHttpClient) globalHttpClient = new HttpClient();
  return globalHttpClient;
}
function setBaseURL(baseURL) {
  getHttpClient().baseURL = baseURL;
}
async function httpGet(url, options) {
  return getHttpClient().get(url, options);
}
async function httpPost(url, body, options) {
  return getHttpClient().post(url, body, options);
}
async function httpPut(url, body, options) {
  return getHttpClient().put(url, body, options);
}
async function httpDelete(url, options) {
  return getHttpClient().delete(url, options);
}
async function uploadFile(url, file, options = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const startTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    xhr.upload.onprogress = (e) => {
      if (options.onProgress && e.lengthComputable) {
        options.onProgress(e.loaded, e.total);
      }
    };
    xhr.onload = async () => {
      const duration = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
      let data;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = xhr.responseText;
      }
      resolve({
        data,
        status: xhr.status,
        headers: new Headers(),
        ok: xhr.status >= 200 && xhr.status < 300,
        url,
        duration,
        fromCache: false
      });
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.open("POST", url);
    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        xhr.setRequestHeader(key, value);
      }
    }
    xhr.timeout = options.timeout || 3e4;
    xhr.send(file);
  });
}

// packages/runtime/tw/focus-trap.ts
var FocusTrap = class {
  constructor(container, options = {}) {
    __publicField(this, "container");
    __publicField(this, "options");
    __publicField(this, "previouslyFocused", null);
    __publicField(this, "isActive", false);
    __publicField(this, "keydownHandler", null);
    __publicField(this, "clickHandler", null);
    this.container = container;
    this.options = {
      returnFocus: true,
      escapeDeactivates: true,
      clickOutsideDeactivates: false,
      checkVisibility: true,
      ...options
    };
  }
  /**
   * Activate the focus trap.
   */
  activate() {
    if (this.isActive) return;
    this.isActive = true;
    this.previouslyFocused = document.activeElement;
    if (this.options.onActivate) this.options.onActivate();
    const initialFocus = this.resolveFocusTarget(this.options.initialFocus);
    if (initialFocus) {
      initialFocus.focus();
    } else {
      const focusable = this.getFocusableElements();
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        const fallback = this.resolveFocusTarget(this.options.fallbackFocus);
        if (fallback) fallback.focus();
        else this.container.focus();
      }
    }
    this.keydownHandler = this.handleKeyDown.bind(this);
    this.clickHandler = this.handleClick.bind(this);
    document.addEventListener("keydown", this.keydownHandler, true);
    if (this.options.clickOutsideDeactivates) {
      document.addEventListener("click", this.clickHandler, true);
    }
  }
  /**
   * Deactivate the focus trap.
   */
  deactivate() {
    if (!this.isActive) return;
    this.isActive = false;
    if (this.keydownHandler) {
      document.removeEventListener("keydown", this.keydownHandler, true);
      this.keydownHandler = null;
    }
    if (this.clickHandler) {
      document.removeEventListener("click", this.clickHandler, true);
      this.clickHandler = null;
    }
    if (this.options.onDeactivate) this.options.onDeactivate();
    if (this.options.returnFocus && this.previouslyFocused) {
      this.previouslyFocused.focus();
      this.previouslyFocused = null;
    }
  }
  /**
   * Check if the focus trap is active.
   */
  get active() {
    return this.isActive;
  }
  /**
   * Update options.
   */
  update(options) {
    this.options = { ...this.options, ...options };
  }
  // --- Internal ------------------------------------------------------
  handleKeyDown(e) {
    if (!this.isActive) return;
    if (e.key === "Escape" && this.options.escapeDeactivates) {
      e.preventDefault();
      this.deactivate();
      return;
    }
    if (e.key !== "Tab") return;
    const focusable = this.getFocusableElements();
    if (focusable.length === 0) {
      e.preventDefault();
      this.container.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first || !this.container.contains(document.activeElement)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
  handleClick(e) {
    if (!this.isActive || !this.options.clickOutsideDeactivates) return;
    if (!this.container.contains(e.target)) {
      if (this.options.allowOutsideClick === true) return;
      if (typeof this.options.allowOutsideClick === "function") {
        if (this.options.allowOutsideClick(e)) return;
      }
      this.deactivate();
    }
  }
  getFocusableElements() {
    const selector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      '[tabindex]:not([tabindex="-1"])',
      "[contenteditable=true]",
      "audio[controls]",
      "video[controls]",
      "details > summary:first-of-type"
    ].join(", ");
    const elements = Array.from(this.container.querySelectorAll(selector));
    if (this.options.checkVisibility) {
      return elements.filter((el) => this.isVisible(el));
    }
    return elements;
  }
  isVisible(element) {
    if (element.offsetWidth === 0 || element.offsetHeight === 0) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (style.opacity === "0") return false;
    return true;
  }
  resolveFocusTarget(target) {
    if (!target) return null;
    if (typeof target === "string") {
      return this.container.querySelector(target);
    }
    return target;
  }
};
function createFocusTrap(container, options) {
  return new FocusTrap(container, options);
}
var FocusStack = class {
  constructor() {
    __publicField(this, "traps", []);
  }
  push(trap) {
    if (this.traps.length > 0) {
      this.traps[this.traps.length - 1].deactivate();
    }
    this.traps.push(trap);
    trap.activate();
  }
  pop() {
    const trap = this.traps.pop();
    if (trap) {
      trap.deactivate();
      if (this.traps.length > 0) {
        this.traps[this.traps.length - 1].activate();
      }
    }
    return trap;
  }
  get top() {
    return this.traps[this.traps.length - 1];
  }
  get size() {
    return this.traps.length;
  }
  clear() {
    while (this.traps.length > 0) this.pop();
  }
};
var globalFocusStack = null;
function getFocusStack() {
  if (!globalFocusStack) globalFocusStack = new FocusStack();
  return globalFocusStack;
}
function autoFocus(container, selector) {
  const sel = selector || [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
    "[contenteditable=true]"
  ].join(", ");
  const el = container.querySelector(sel);
  if (el) {
    el.focus();
    return true;
  }
  return false;
}

// packages/runtime/tw/form-validation.ts
var validators = {
  required: (message = "This field is required") => (value) => {
    if (value === null || value === void 0 || value === "") return message;
    if (Array.isArray(value) && value.length === 0) return message;
    return true;
  },
  minLength: (min, message) => (value) => {
    const str = String(value != null ? value : "");
    if (str.length < min) return message || `Must be at least ${min} characters`;
    return true;
  },
  maxLength: (max, message) => (value) => {
    const str = String(value != null ? value : "");
    if (str.length > max) return message || `Must be at most ${max} characters`;
    return true;
  },
  // Factory like every other validator (docs/form-validators.md shows
  // `const email = validators.email()`); previously this was a bare
  // ValidatorFn, so `validators.email()(v)` threw.
  email: (message = "Invalid email address") => (value) => {
    const str = String(value != null ? value : "");
    if (!str) return true;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(str) ? true : message;
  },
  url: (message = "Invalid URL") => (value) => {
    const str = String(value != null ? value : "");
    if (!str) return true;
    try {
      new URL(str);
      return true;
    } catch {
      return message;
    }
  },
  pattern: (regex, message = "Invalid format") => (value) => {
    const str = String(value != null ? value : "");
    if (!str) return true;
    return regex.test(str) ? true : message;
  },
  numeric: (message = "Must be a number") => (value) => {
    if (value === null || value === void 0 || value === "") return true;
    return !isNaN(Number(value)) ? true : message;
  },
  integer: (message = "Must be an integer") => (value) => {
    if (value === null || value === void 0 || value === "") return true;
    const num = Number(value);
    return Number.isInteger(num) ? true : message;
  },
  min: (minVal, message) => (value) => {
    if (value === null || value === void 0 || value === "") return true;
    return Number(value) >= minVal ? true : message || `Must be at least ${minVal}`;
  },
  max: (maxVal, message) => (value) => {
    if (value === null || value === void 0 || value === "") return true;
    return Number(value) <= maxVal ? true : message || `Must be at most ${maxVal}`;
  },
  range: (minVal, maxVal, message) => (value) => {
    if (value === null || value === void 0 || value === "") return true;
    const num = Number(value);
    return num >= minVal && num <= maxVal ? true : message || `Must be between ${minVal} and ${maxVal}`;
  },
  phone: (message = "Invalid phone number") => (value) => {
    const str = String(value != null ? value : "").replace(/\D/g, "");
    if (!str) return true;
    return str.length >= 10 ? true : message;
  },
  creditCard: (message = "Invalid credit card number") => (value) => {
    const str = String(value != null ? value : "").replace(/\D/g, "");
    if (!str) return true;
    let sum = 0;
    let isEven = false;
    for (let i = str.length - 1; i >= 0; i--) {
      let digit = parseInt(str[i], 10);
      if (isEven) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      isEven = !isEven;
    }
    return sum % 10 === 0 && str.length >= 13 ? true : message;
  },
  matches: (fieldName, message) => (value, form) => {
    const other = form[fieldName];
    return value === other ? true : message || `Must match ${fieldName}`;
  },
  custom: (fn, message) => (value) => {
    if (value === null || value === void 0 || value === "") return true;
    return fn(value) ? true : message;
  },
  oneOf: (values, message = "Invalid selection") => (value) => {
    if (value === null || value === void 0 || value === "") return true;
    return values.includes(value) ? true : message;
  }
};
var TWForm = class {
  constructor(config) {
    __publicField(this, "fields", /* @__PURE__ */ new Map());
    __publicField(this, "config");
    __publicField(this, "formValues");
    __publicField(this, "submitted", signal(false));
    __publicField(this, "submitCount", signal(0));
    var _a;
    this.config = {
      validateOnChange: true,
      validateOnBlur: true,
      validateOnSubmit: true,
      ...config
    };
    const initialValues = {};
    for (const [name, fieldConfig] of Object.entries(config.fields)) {
      const initialValue = (_a = fieldConfig.initial) != null ? _a : "";
      initialValues[name] = initialValue;
      this.fields.set(name, {
        config: fieldConfig,
        stateSignal: signal({
          value: initialValue,
          error: null,
          touched: false,
          dirty: false,
          validating: false,
          disabled: false
        })
      });
    }
    this.formValues = signal(initialValues);
  }
  /**
   * Get the value of a field.
   */
  getValue(name) {
    return this.formValues.peek()[name];
  }
  /**
   * Set the value of a field.
   */
  setValue(name, value) {
    const current = this.formValues.peek();
    this.formValues.set({ ...current, [name]: value });
    const field = this.fields.get(name);
    if (field) {
      const state = field.stateSignal.peek();
      field.stateSignal.set({ ...state, value, dirty: true });
      if (this.config.validateOnChange) {
        this.validateField(name);
      }
    }
  }
  /**
   * Get field state (reactive).
   */
  getFieldState(name) {
    var _a;
    return (_a = this.fields.get(name)) == null ? void 0 : _a.stateSignal();
  }
  /**
   * Get the entire form state (reactive).
   */
  getFormState() {
    const values = this.formValues();
    const errors = {};
    const touched = {};
    const dirty = {};
    let valid = true;
    let validating = false;
    for (const [name, field] of this.fields) {
      const state = field.stateSignal();
      errors[name] = state.error;
      touched[name] = state.touched;
      dirty[name] = state.dirty;
      if (state.error) valid = false;
      if (state.validating) validating = true;
    }
    return {
      values,
      errors,
      touched,
      dirty,
      valid: valid && !validating,
      validating,
      submitted: this.submitted(),
      submitCount: this.submitCount()
    };
  }
  /**
   * Validate a single field.
   */
  async validateField(name) {
    const field = this.fields.get(name);
    if (!field) return null;
    const value = this.getValue(name);
    const state = field.stateSignal.peek();
    field.stateSignal.set({ ...state, validating: true });
    let error = null;
    if (field.config.validators) {
      for (const validator of field.config.validators) {
        try {
          const result = await validator(value, this.formValues.peek());
          if (typeof result === "string") {
            error = result;
            break;
          }
        } catch (e) {
          error = "Validation error";
          console.error(`[TW Form] Validator error for '${name}':`, e);
        }
      }
    }
    const currentState = field.stateSignal.peek();
    field.stateSignal.set({ ...currentState, error, validating: false });
    return error;
  }
  /**
   * Validate all fields.
   */
  async validateAll() {
    const promises = [];
    for (const name of this.fields.keys()) {
      promises.push(this.validateField(name));
    }
    const results = await Promise.all(promises);
    return results.every((r) => r === null);
  }
  /**
   * Mark a field as touched.
   */
  touch(name) {
    const field = this.fields.get(name);
    if (!field) return;
    const state = field.stateSignal.peek();
    field.stateSignal.set({ ...state, touched: true });
    if (this.config.validateOnBlur) {
      this.validateField(name);
    }
  }
  /**
   * Handle form submission.
   */
  async submit() {
    this.submitted.set(true);
    this.submitCount.set(this.submitCount.peek() + 1);
    if (this.config.validateOnSubmit) {
      const valid = await this.validateAll();
      if (!valid) return null;
    }
    if (this.config.onSubmit) {
      await this.config.onSubmit(this.formValues.peek());
    }
    return this.formValues.peek();
  }
  /**
   * Reset the form to initial values.
   */
  reset() {
    var _a;
    const initialValues = {};
    for (const [name, field] of this.fields) {
      const initialValue = (_a = field.config.initial) != null ? _a : "";
      initialValues[name] = initialValue;
      field.stateSignal.set({
        value: initialValue,
        error: null,
        touched: false,
        dirty: false,
        validating: false,
        disabled: false
      });
    }
    this.formValues.set(initialValues);
    this.submitted.set(false);
  }
  /**
   * Clear all errors.
   */
  clearErrors() {
    for (const [, field] of this.fields) {
      const state = field.stateSignal.peek();
      field.stateSignal.set({ ...state, error: null });
    }
  }
  /**
   * Set field error manually.
   */
  setFieldError(name, error) {
    const field = this.fields.get(name);
    if (!field) return;
    const state = field.stateSignal.peek();
    field.stateSignal.set({ ...state, error });
  }
  /**
   * Enable/disable a field.
   */
  setFieldDisabled(name, disabled) {
    const field = this.fields.get(name);
    if (!field) return;
    const state = field.stateSignal.peek();
    field.stateSignal.set({ ...state, disabled });
  }
  /**
   * Add a field dynamically.
   */
  addField(name, config) {
    var _a;
    this.config.fields[name] = config;
    const initialValue = (_a = config.initial) != null ? _a : "";
    this.fields.set(name, {
      config,
      stateSignal: signal({
        value: initialValue,
        error: null,
        touched: false,
        dirty: false,
        validating: false,
        disabled: false
      })
    });
    const current = this.formValues.peek();
    this.formValues.set({ ...current, [name]: initialValue });
  }
  /**
   * Remove a field.
   */
  removeField(name) {
    this.fields.delete(name);
    delete this.config.fields[name];
    const current = this.formValues.peek();
    const newValues = { ...current };
    delete newValues[name];
    this.formValues.set(newValues);
  }
  /**
   * Get all field names.
   */
  getFieldNames() {
    return Array.from(this.fields.keys());
  }
};
function createForm(config) {
  return new TWForm(config);
}
function createFormFromSchema(schema) {
  return new TWForm({ fields: schema });
}

// packages/runtime/tw/gesture-recognition.ts
var GestureRecognizer = class {
  constructor(element, options = {}) {
    __publicField(this, "element");
    __publicField(this, "options");
    __publicField(this, "handlers", /* @__PURE__ */ new Map());
    __publicField(this, "pointers", /* @__PURE__ */ new Map());
    __publicField(this, "startPoints", /* @__PURE__ */ new Map());
    __publicField(this, "startTime", 0);
    __publicField(this, "lastTapTime", 0);
    __publicField(this, "lastTapPoint", null);
    __publicField(this, "longPressTimer", null);
    __publicField(this, "isLongPress", false);
    __publicField(this, "initialDistance", 0);
    __publicField(this, "initialAngle", 0);
    __publicField(this, "currentScale", 1);
    __publicField(this, "currentRotation", 0);
    __publicField(this, "lastMoveTime", 0);
    __publicField(this, "lastMovePoint", null);
    __publicField(this, "velocity", { x: 0, y: 0 });
    // --- Event Handlers ------------------------------------------------
    __publicField(this, "handlePointerDown", (e) => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.startPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.startTime = Date.now();
      this.isLongPress = false;
      this.lastMovePoint = { x: e.clientX, y: e.clientY };
      this.lastMoveTime = this.startTime;
      this.velocity = { x: 0, y: 0 };
      if (this.pointers.size === 1) {
        this.longPressTimer = setTimeout(() => {
          this.isLongPress = true;
          this.emit("longpress", this.createGestureEvent("longpress", e));
        }, this.options.longPressDelay);
      } else if (this.pointers.size === 2) {
        if (this.longPressTimer) {
          clearTimeout(this.longPressTimer);
          this.longPressTimer = null;
        }
        const points = Array.from(this.pointers.values());
        this.initialDistance = this.distance(points[0], points[1]);
        this.initialAngle = this.angle(points[0], points[1]);
        this.currentScale = 1;
        this.currentRotation = 0;
      }
    });
    __publicField(this, "handlePointerMove", (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      const point = { x: e.clientX, y: e.clientY };
      this.pointers.set(e.pointerId, point);
      if (this.longPressTimer && !this.isLongPress) {
        const startPoint = this.startPoints.get(e.pointerId);
        const moveDistance = this.distance(startPoint, point);
        if (moveDistance > this.options.longPressThreshold) {
          clearTimeout(this.longPressTimer);
          this.longPressTimer = null;
        }
      }
      const now = Date.now();
      const dt = now - this.lastMoveTime;
      if (dt > 0 && this.lastMovePoint) {
        this.velocity = {
          x: (point.x - this.lastMovePoint.x) / dt,
          y: (point.y - this.lastMovePoint.y) / dt
        };
      }
      this.lastMovePoint = point;
      this.lastMoveTime = now;
      if (this.pointers.size === 1 && !this.isLongPress) {
        this.emit("pan", this.createGestureEvent("pan", e));
      } else if (this.pointers.size === 2) {
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
    });
    __publicField(this, "handlePointerUp", (e) => {
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
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
        if (distance > this.options.swipeThreshold) {
          const direction = this.getSwipeDirection(startPoint, endPoint);
          const speed = distance / duration;
          if (speed > this.options.swipeVelocityThreshold || distance > this.options.swipeThreshold * 2) {
            this.emit("swipe", this.createGestureEvent("swipe", e, { direction }));
            this.emit(`swipe${direction}`, this.createGestureEvent(`swipe${direction}`, e));
          }
        }
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
    });
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
      ...options
    };
    this.attach();
  }
  /**
   * Register a handler for a gesture type.
   */
  on(gesture, handler) {
    if (!this.handlers.has(gesture)) this.handlers.set(gesture, /* @__PURE__ */ new Set());
    this.handlers.get(gesture).add(handler);
    return () => {
      var _a;
      (_a = this.handlers.get(gesture)) == null ? void 0 : _a.delete(handler);
    };
  }
  /**
   * Unregister all handlers for a gesture.
   */
  off(gesture) {
    this.handlers.delete(gesture);
  }
  /**
   * Destroy the gesture recognizer.
   */
  destroy() {
    this.detach();
    this.handlers.clear();
  }
  // --- Helpers ------------------------------------------------------
  createGestureEvent(type, e, extra) {
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
      ...extra
    };
  }
  emit(type, event) {
    const handlers = this.handlers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (e) {
          console.error(`[TW Gesture] Handler error for '${type}':`, e);
        }
      }
    }
  }
  distance(a, b) {
    return Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
  }
  angle(a, b) {
    return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  }
  getSwipeDirection(start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      return dx > 0 ? "right" : "left";
    }
    return dy > 0 ? "down" : "up";
  }
  // --- Attach/Detach ------------------------------------------------
  attach() {
    this.element.style.touchAction = "none";
    this.element.addEventListener("pointerdown", this.handlePointerDown);
    this.element.addEventListener("pointermove", this.handlePointerMove);
    this.element.addEventListener("pointerup", this.handlePointerUp);
    this.element.addEventListener("pointercancel", this.handlePointerUp);
  }
  detach() {
    this.element.removeEventListener("pointerdown", this.handlePointerDown);
    this.element.removeEventListener("pointermove", this.handlePointerMove);
    this.element.removeEventListener("pointerup", this.handlePointerUp);
    this.element.removeEventListener("pointercancel", this.handlePointerUp);
  }
};
function createGestureRecognizer(element, options) {
  return new GestureRecognizer(element, options);
}
function onSwipe(element, handler, options) {
  const recognizer = new GestureRecognizer(element, options);
  recognizer.on("swipe", (e) => {
    const direction = e.delta.x > 0 ? "right" : "up";
    handler(Math.abs(e.delta.x) > Math.abs(e.delta.y) ? e.delta.x > 0 ? "right" : "left" : e.delta.y > 0 ? "down" : "up", e);
  });
  return () => recognizer.destroy();
}
function onLongPress(element, handler, options) {
  const recognizer = new GestureRecognizer(element, options);
  recognizer.on("longpress", handler);
  return () => recognizer.destroy();
}
function onDoubleTap(element, handler, options) {
  const recognizer = new GestureRecognizer(element, options);
  recognizer.on("doubletap", handler);
  return () => recognizer.destroy();
}
function onPinch(element, handler, options) {
  const recognizer = new GestureRecognizer(element, options);
  recognizer.on("pinch", handler);
  return () => recognizer.destroy();
}

// packages/runtime/tw/hydration.ts
var DEFAULT_SELECTOR = "[data-tw-hydrate]";
var HYDRATE_ATTR = "data-tw-hydrate";
function findHydrationTargets(root, selector) {
  const list = root.querySelectorAll(selector);
  const seen = /* @__PURE__ */ new Set();
  const ordered = [];
  list.forEach((el) => {
    if (!seen.has(el)) {
      seen.add(el);
      ordered.push(el);
    }
  });
  ordered.sort((a, b) => {
    if (a.contains(b)) return -1;
    if (b.contains(a)) return 1;
    return 0;
  });
  return ordered;
}
function hydrateElement(element, component, props) {
  const vnode = component(props);
  if (vnode == null) return;
  element.setAttribute("data-tw-hydrated", "true");
  if (typeof mountVNode === "function") {
    mountVNode(vnode, element);
  }
}
var mountVNode = null;
function __setMountVNode(fn) {
  mountVNode = fn;
}
function readProps(element) {
  const raw = element.getAttribute("data-tw-props");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
function buildTasks(targets, components, onError) {
  var _a;
  const tasks = [];
  for (const el of targets) {
    const id = (_a = el.getAttribute(HYDRATE_ATTR)) != null ? _a : "";
    const component = components == null ? void 0 : components[id];
    if (!component) {
      onError(
        { element: el, message: `No component registered for id "${id}"`, cause: null, componentId: id },
        el
      );
      continue;
    }
    const props = readProps(el);
    tasks.push({ element: el, component, props });
  }
  return tasks;
}
function executeTask(task, errors, onError) {
  var _a;
  try {
    hydrateElement(task.element, task.component, task.props);
    return true;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    const error = {
      element: task.element,
      message,
      cause,
      componentId: (_a = task.element.getAttribute(HYDRATE_ATTR)) != null ? _a : void 0
    };
    errors.push(error);
    onError == null ? void 0 : onError(error, task.element);
    return false;
  }
}
function hydrate(options = {}) {
  var _a, _b, _c, _d, _e;
  const mode = (_a = options.mode) != null ? _a : "eager";
  const root = (_b = options.root) != null ? _b : typeof document !== "undefined" ? document.body : null;
  if (!root) {
    return {
      total: 0,
      succeeded: 0,
      failed: 0,
      errors: [],
      durationMs: 0
    };
  }
  const selector = (_c = options.selector) != null ? _c : DEFAULT_SELECTOR;
  const components = (_d = options.components) != null ? _d : {};
  const errors = [];
  const targets = findHydrationTargets(root, selector);
  const tasks = buildTasks(targets, components, (err, el) => {
    var _a2;
    errors.push(err);
    (_a2 = options.onError) == null ? void 0 : _a2.call(options, err, el);
  });
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (mode === "eager") {
    let succeeded = 0;
    let failed = 0;
    for (const task of tasks) {
      const ok = executeTask(task, errors, options.onError);
      if (ok) succeeded++;
      else failed++;
    }
    const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - start;
    const stats = {
      total: tasks.length,
      succeeded,
      failed,
      errors,
      durationMs
    };
    (_e = options.onComplete) == null ? void 0 : _e.call(options, stats);
    return stats;
  }
  return hydrateAsync(tasks, mode, errors, options, start);
}
async function hydrateAsync(tasks, mode, errors, options, start) {
  var _a;
  let succeeded = 0;
  let failed = 0;
  for (const task of tasks) {
    await yieldToEventLoop(mode);
    const ok = executeTask(task, errors, options.onError);
    if (ok) succeeded++;
    else failed++;
  }
  const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - start;
  const stats = {
    total: tasks.length,
    succeeded,
    failed,
    errors,
    durationMs
  };
  (_a = options.onComplete) == null ? void 0 : _a.call(options, stats);
  return stats;
}
function yieldToEventLoop(mode) {
  if (mode === "idle" && typeof requestIdleCallback === "function") {
    return new Promise((resolve) => {
      requestIdleCallback(() => resolve(), { timeout: 50 });
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}
async function hydrateElementById(id, component, root = typeof document !== "undefined" ? document.body : null) {
  if (!root) return false;
  const el = root.querySelector(`[${HYDRATE_ATTR}="${id}"]`);
  if (!el) return false;
  const errors = [];
  return executeTask(
    { element: el, component, props: readProps(el) },
    errors
  );
}
function markForHydration(element, componentId, props) {
  element.setAttribute(HYDRATE_ATTR, componentId);
  element.setAttribute("data-tw-props", JSON.stringify(props));
}
function unmarkForHydration(element) {
  element.removeAttribute(HYDRATE_ATTR);
  element.removeAttribute("data-tw-props");
  element.removeAttribute("data-tw-hydrated");
}

// packages/runtime/tw/i18n-runtime.ts
var I18n = class {
  constructor(options = {}) {
    __publicField(this, "locale");
    __publicField(this, "fallbackLocale");
    __publicField(this, "messages", /* @__PURE__ */ new Map());
    __publicField(this, "loadingLocales", /* @__PURE__ */ new Set());
    __publicField(this, "loadedLocales", /* @__PURE__ */ new Set());
    __publicField(this, "lazyLoadFn");
    __publicField(this, "warnOnMissing");
    __publicField(this, "rtlLocales", /* @__PURE__ */ new Set(["ar", "he", "fa", "ur", "yi", "iw", "ps", "sd"]));
    var _a;
    this.locale = signal(options.defaultLocale || "en");
    this.fallbackLocale = options.fallbackLocale || "en";
    this.lazyLoadFn = options.lazyLoad || null;
    this.warnOnMissing = (_a = options.warnOnMissing) != null ? _a : true;
    if (options.messages) {
      for (const [loc, msgs] of Object.entries(options.messages)) {
        this.addMessages(loc, msgs);
        this.loadedLocales.add(loc);
      }
    }
  }
  /**
   * Get current locale (reactive).
   */
  getLocale() {
    return this.locale();
  }
  get localeSignal() {
    return this.locale;
  }
  /**
   * Set locale (loads messages if lazy loading).
   */
  async setLocale(locale) {
    if (this.locale.peek() === locale) return;
    if (this.lazyLoadFn && !this.loadedLocales.has(locale) && !this.loadingLocales.has(locale)) {
      this.loadingLocales.add(locale);
      try {
        const msgs = await this.lazyLoadFn(locale);
        this.addMessages(locale, msgs);
        this.loadedLocales.add(locale);
      } catch (e) {
        console.error(`[TW i18n] Failed to load locale '${locale}':`, e);
      } finally {
        this.loadingLocales.delete(locale);
      }
    }
    this.locale.set(locale);
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
      document.documentElement.dir = this.isRTL(locale) ? "rtl" : "ltr";
    }
  }
  /**
   * Add messages for a locale.
   */
  addMessages(locale, messages) {
    if (!this.messages.has(locale)) this.messages.set(locale, /* @__PURE__ */ new Map());
    const localeMessages = this.messages.get(locale);
    for (const [key, value] of Object.entries(messages)) {
      localeMessages.set(key, value);
    }
  }
  /**
   * Translate a key.
   * Supports interpolation: "Hello {name}" -> "Hello World"
   */
  t(key, params, locale) {
    const loc = locale || this.locale.peek();
    const message = this.getMessage(key, loc);
    if (message === null) {
      if (this.warnOnMissing) {
        console.warn(`[TW i18n] Missing translation for '${key}' in '${loc}'`);
      }
      return key;
    }
    return this.interpolate(message, params, loc);
  }
  /**
   * Translate with pluralization.
   */
  tn(key, count, params, locale) {
    const loc = locale || this.locale.peek();
    const category = this.getPluralCategory(count, loc);
    const pluralKey = `${key}.${category}`;
    let message = this.getMessage(pluralKey, loc);
    if (message === null) message = this.getMessage(key, loc);
    if (message === null) return key;
    return this.interpolate(message, { ...params, count }, loc);
  }
  /**
   * Format a date.
   */
  formatDate(date, options, locale) {
    const loc = locale || this.locale.peek();
    try {
      return new Intl.DateTimeFormat(loc, options).format(date);
    } catch {
      return String(date);
    }
  }
  /**
   * Format a number.
   */
  formatNumber(value, options, locale) {
    const loc = locale || this.locale.peek();
    try {
      return new Intl.NumberFormat(loc, options).format(value);
    } catch {
      return String(value);
    }
  }
  /**
   * Format a currency value.
   */
  formatCurrency(value, currency, locale) {
    return this.formatNumber(value, { style: "currency", currency }, locale);
  }
  /**
   * Format relative time (e.g., "3 days ago").
   */
  formatRelativeTime(value, unit, locale) {
    const loc = locale || this.locale.peek();
    try {
      return new Intl.RelativeTimeFormat(loc, { numeric: "auto" }).format(value, unit);
    } catch {
      return `${value} ${unit}`;
    }
  }
  /**
   * Format a list of items.
   */
  formatList(items, options, locale) {
    const loc = locale || this.locale.peek();
    try {
      return new Intl.ListFormat(loc, options).format(items);
    } catch {
      return items.join(", ");
    }
  }
  /**
   * Check if a locale is RTL.
   */
  isRTL(locale) {
    const loc = locale || this.locale.peek();
    const lang = loc.split("-")[0];
    return this.rtlLocales.has(lang);
  }
  /**
   * Get text direction.
   */
  getTextDirection(locale) {
    return this.isRTL(locale) ? "rtl" : "ltr";
  }
  /**
   * Check if a locale's messages are loaded.
   */
  isLocaleLoaded(locale) {
    return this.loadedLocales.has(locale);
  }
  /**
   * Get all loaded locales.
   */
  getLoadedLocales() {
    return Array.from(this.loadedLocales);
  }
  /**
   * Check if a translation key exists.
   */
  has(key, locale) {
    return this.getMessage(key, locale || this.locale.peek()) !== null;
  }
  // --- Internal ------------------------------------------------------
  getMessage(key, locale) {
    const localeMessages = this.messages.get(locale);
    if (localeMessages && localeMessages.has(key)) return localeMessages.get(key);
    if (locale !== this.fallbackLocale) {
      const fallbackMessages = this.messages.get(this.fallbackLocale);
      if (fallbackMessages && fallbackMessages.has(key)) return fallbackMessages.get(key);
    }
    return null;
  }
  interpolate(message, params, _locale) {
    if (!params) return message;
    return message.replace(/\{(\w+)\}/g, (_match, key) => {
      if (key in params) {
        const value = params[key];
        if (value === null || value === void 0) return "";
        return String(value);
      }
      return `{${key}}`;
    });
  }
  getPluralCategory(count, locale) {
    try {
      const rules = new Intl.PluralRules(locale);
      return rules.select(count);
    } catch {
      if (count === 0) return "zero";
      if (count === 1) return "one";
      return "other";
    }
  }
};
var globalI18n = null;
function initI18n(options) {
  globalI18n = new I18n(options);
  return globalI18n;
}
function getI18n() {
  if (!globalI18n) globalI18n = new I18n();
  return globalI18n;
}
function t(key, params) {
  return getI18n().t(key, params);
}
function tn(key, count, params) {
  return getI18n().tn(key, count, params);
}
function formatDate(date, options) {
  return getI18n().formatDate(date, options);
}
function formatNumber(value, options) {
  return getI18n().formatNumber(value, options);
}
function formatCurrency(value, currency) {
  return getI18n().formatCurrency(value, currency);
}
function formatRelativeTime(value, unit) {
  return getI18n().formatRelativeTime(value, unit);
}
function formatList(items, options) {
  return getI18n().formatList(items, options);
}
function isRTL(locale) {
  return getI18n().isRTL(locale);
}
function getTextDirection(locale) {
  return getI18n().getTextDirection(locale);
}
function setLocale(locale) {
  return getI18n().setLocale(locale);
}
function getLocale() {
  return getI18n().getLocale();
}
function useLocale() {
  return getI18n().localeSignal;
}
function useTranslation(key, params) {
  return computed(() => getI18n().t(key, params));
}

// packages/runtime/tw/id-generator.ts
function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = bytes[6] & 15 | 64;
  bytes[8] = bytes[8] & 63 | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}
var NANO_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-";
var NANO_DEFAULT_SIZE = 21;
function nanoId(size = NANO_DEFAULT_SIZE, alphabet = NANO_ALPHABET) {
  const mask = (2 << Math.log(alphabet.length - 1) / Math.LN2) - 1;
  const step = Math.ceil(mask * size / 32);
  let id = "";
  while (id.length < size) {
    const bytes = new Uint8Array(step);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < step; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    for (let i = 0; i < step && id.length < size; i++) {
      const idx = bytes[i] & mask;
      if (idx < alphabet.length) {
        id += alphabet[idx];
      }
    }
  }
  return id;
}
var ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
var ULID_TIME_LEN = 10;
var ULID_RANDOM_LEN = 16;
function ulid(timestamp = Date.now()) {
  const timeChars = encodeTime(timestamp, ULID_TIME_LEN);
  const randomChars = encodeRandom(ULID_RANDOM_LEN);
  return timeChars + randomChars;
}
function encodeTime(timestamp, length) {
  let str = "";
  let time = timestamp;
  for (let i = length - 1; i >= 0; i--) {
    const mod = time % ULID_ALPHABET.length;
    str = ULID_ALPHABET[mod] + str;
    time = Math.floor(time / ULID_ALPHABET.length);
  }
  return str;
}
function encodeRandom(length) {
  let str = "";
  const bytes = new Uint8Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < length; i++) {
    str += ULID_ALPHABET[bytes[i] % ULID_ALPHABET.length];
  }
  return str;
}
var sequentialCounter = 0;
function sequentialId(prefix = "", separator = "-") {
  sequentialCounter++;
  return prefix ? `${prefix}${separator}${sequentialCounter}` : String(sequentialCounter);
}
function resetSequentialCounter() {
  sequentialCounter = 0;
}
var EPOCH = 16094592e5;
var WORKER_ID_BITS = 10;
var SEQUENCE_BITS = 12;
var MAX_SEQUENCE = (1 << SEQUENCE_BITS) - 1;
var snowflakeWorkerId = 1;
var snowflakeSequence = 0;
var snowflakeLastTimestamp = -1;
function snowflake(workerId = snowflakeWorkerId) {
  let timestamp = Date.now() - EPOCH;
  if (timestamp === snowflakeLastTimestamp) {
    snowflakeSequence = snowflakeSequence + 1 & MAX_SEQUENCE;
    if (snowflakeSequence === 0) {
      while (timestamp <= snowflakeLastTimestamp) {
        timestamp = Date.now() - EPOCH;
      }
    }
  } else {
    snowflakeSequence = 0;
  }
  snowflakeLastTimestamp = timestamp;
  let id = BigInt(timestamp) << BigInt(WORKER_ID_BITS + SEQUENCE_BITS) | BigInt(workerId) << BigInt(SEQUENCE_BITS) | BigInt(snowflakeSequence);
  return id.toString();
}
function setSnowflakeWorkerId(id) {
  if (id < 0 || id >= 1 << WORKER_ID_BITS) {
    throw new Error(`[TW ID] Worker ID must be between 0 and ${(1 << WORKER_ID_BITS) - 1}`);
  }
  snowflakeWorkerId = id;
}
function createIdGenerator(alphabet, defaultSize = 16) {
  return (size = defaultSize) => {
    let id = "";
    const bytes = new Uint8Array(size);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < size; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    for (let i = 0; i < size; i++) {
      id += alphabet[bytes[i] % alphabet.length];
    }
    return id;
  };
}
var HASH_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function encodeHashId(num) {
  if (num === 0) return HASH_ALPHABET[0];
  let str = "";
  let n = Math.abs(num);
  while (n > 0) {
    str = HASH_ALPHABET[n % HASH_ALPHABET.length] + str;
    n = Math.floor(n / HASH_ALPHABET.length);
  }
  return num < 0 ? `-${str}` : str;
}
function decodeHashId(str) {
  let num = 0;
  const negative = str.startsWith("-");
  const positive = negative ? str.substring(1) : str;
  for (let i = 0; i < positive.length; i++) {
    const idx = HASH_ALPHABET.indexOf(positive[i]);
    if (idx < 0) return NaN;
    num = num * HASH_ALPHABET.length + idx;
  }
  return negative ? -num : num;
}
var usedIds = /* @__PURE__ */ new Set();
function uniqueId(generator = uuid) {
  let id;
  let attempts = 0;
  do {
    id = generator();
    attempts++;
    if (attempts > 100) {
      throw new Error("[TW ID] Failed to generate a unique ID after 100 attempts");
    }
  } while (usedIds.has(id));
  usedIds.add(id);
  return id;
}
function registerId(id) {
  usedIds.add(id);
}
function releaseId(id) {
  usedIds.delete(id);
}
function isIdUsed(id) {
  return usedIds.has(id);
}
function clearRegisteredIds() {
  usedIds.clear();
}

// packages/runtime/tw/image-optimizer.ts
var ImageOptimizer = class {
  constructor() {
    __publicField(this, "supportedFormats", /* @__PURE__ */ new Set());
    __publicField(this, "preloadedUrls", /* @__PURE__ */ new Set());
    __publicField(this, "lazyObserver", null);
    __publicField(this, "lazyImages", /* @__PURE__ */ new Map());
    this.detectFormats();
  }
  /**
   * Detect browser-supported image formats.
   */
  detectFormats() {
    if (typeof document === "undefined") return;
    const webpImg = new Image();
    webpImg.onload = () => {
      if (webpImg.width > 0) this.supportedFormats.add("webp");
    };
    webpImg.src = "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";
    const avifImg = new Image();
    avifImg.onload = () => {
      if (avifImg.width > 0) this.supportedFormats.add("avif");
    };
    avifImg.src = "data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUEAAAGcbWV0YQAAAAA=";
  }
  /**
   * Check if a format is supported.
   */
  supportsFormat(format) {
    return this.supportedFormats.has(format);
  }
  /**
   * Process an image for optimized rendering.
   */
  processImage(options) {
    const widths = options.widths || [320, 640, 768, 1024, 1280, 1920];
    const format = options.format || "auto";
    const srcsetParts = [];
    for (const width2 of widths) {
      const url = this.buildUrl(options.src, { width: width2, format: format === "auto" ? void 0 : format, quality: options.quality });
      srcsetParts.push(`${url} ${width2}w`);
    }
    let width = widths[Math.floor(widths.length / 2)] || 640;
    let height;
    if (options.aspectRatio) {
      height = Math.round(width / options.aspectRatio);
    }
    return {
      src: this.buildUrl(options.src, { format: format === "auto" ? void 0 : format, quality: options.quality }),
      srcset: srcsetParts.join(", "),
      sizes: options.sizes || "100vw",
      format: format === "auto" ? "original" : format,
      width,
      height: height || 0,
      placeholder: this.generatePlaceholder(options)
    };
  }
  /**
   * Create an optimized img element.
   */
  createImage(options) {
    const processed = this.processImage(options);
    const img = document.createElement("img");
    img.src = processed.src;
    img.srcset = processed.srcset;
    img.sizes = processed.sizes;
    img.alt = "";
    img.loading = options.lazy !== false ? "lazy" : "eager";
    img.decoding = "async";
    if (processed.width) img.width = processed.width;
    if (processed.height) img.height = processed.height;
    if (options.placeholder === "blur" && processed.placeholder) {
      img.style.background = `url(${processed.placeholder}) center/cover`;
      img.style.filter = "blur(20px)";
    } else if (options.placeholder === "color" && options.placeholderColor) {
      img.style.backgroundColor = options.placeholderColor;
    }
    if (options.fallback) {
      img.onerror = () => {
        img.src = options.fallback;
        img.srcset = "";
      };
    }
    if (options.onError) {
      img.addEventListener("error", () => options.onError(new Error("Image failed to load")));
    }
    if (options.preload) {
      this.preload(processed.src);
    }
    return img;
  }
  /**
   * Preload an image.
   */
  preload(url) {
    if (this.preloadedUrls.has(url)) return;
    this.preloadedUrls.add(url);
    if (typeof document !== "undefined") {
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.href = url;
      document.head.appendChild(link);
    }
  }
  /**
   * Set up lazy loading for all images with data-tw-src attribute.
   */
  setupLazyLoading(root = document.body) {
    if (typeof IntersectionObserver === "undefined") {
      this.loadAllLazyImages(root);
      return;
    }
    this.lazyObserver = new IntersectionObserver((entries) => {
      var _a;
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const img = entry.target;
          this.loadLazyImage(img);
          (_a = this.lazyObserver) == null ? void 0 : _a.unobserve(img);
        }
      }
    }, { rootMargin: "100px" });
    const images = root.querySelectorAll("img[data-tw-src]");
    for (const img of Array.from(images)) {
      this.lazyObserver.observe(img);
    }
  }
  /**
   * Generate a responsive picture element.
   */
  createPictureElement(options) {
    const picture = document.createElement("picture");
    const formats = [];
    if (this.supportedFormats.has("avif")) formats.push("avif");
    if (this.supportedFormats.has("webp")) formats.push("webp");
    for (const format of formats) {
      const source = document.createElement("source");
      source.type = `image/${format}`;
      const srcset = (options.widths || [320, 640, 1024, 1920]).map((w) => `${this.buildUrl(options.src, { width: w, format })} ${w}w`).join(", ");
      source.srcset = srcset;
      source.sizes = options.sizes || "100vw";
      picture.appendChild(source);
    }
    const img = this.createImage(options);
    picture.appendChild(img);
    return picture;
  }
  /**
   * Destroy the optimizer.
   */
  destroy() {
    if (this.lazyObserver) {
      this.lazyObserver.disconnect();
      this.lazyObserver = null;
    }
    this.lazyImages.clear();
    this.preloadedUrls.clear();
  }
  // --- Internal ------------------------------------------------------
  buildUrl(src, params) {
    const url = new URL(src, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    if (params.width) url.searchParams.set("w", String(params.width));
    if (params.format) url.searchParams.set("f", params.format);
    if (params.quality) url.searchParams.set("q", String(params.quality));
    return url.toString();
  }
  generatePlaceholder(options) {
    if (options.placeholder === "blur") {
      return `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect fill="${options.placeholderColor || "#e2e8f0"}" width="10" height="10"/></svg>`)}`;
    }
    return null;
  }
  loadLazyImage(img) {
    const src = img.getAttribute("data-tw-src");
    const srcset = img.getAttribute("data-tw-srcset");
    if (src) img.src = src;
    if (srcset) img.srcset = srcset;
    img.removeAttribute("data-tw-src");
    img.removeAttribute("data-tw-srcset");
  }
  loadAllLazyImages(root) {
    const images = root.querySelectorAll("img[data-tw-src]");
    for (const img of Array.from(images)) {
      this.loadLazyImage(img);
    }
  }
};
var globalImageOptimizer = null;
function getImageOptimizer() {
  if (!globalImageOptimizer) globalImageOptimizer = new ImageOptimizer();
  return globalImageOptimizer;
}
function createOptimizedImage(options) {
  return getImageOptimizer().createImage(options);
}
function createResponsivePicture(options) {
  return getImageOptimizer().createPictureElement(options);
}
function preloadImage(url) {
  getImageOptimizer().preload(url);
}

// packages/runtime/tw/intersection-observer.ts
var VisibilityManager = class {
  constructor() {
    __publicField(this, "observers", /* @__PURE__ */ new Map());
    __publicField(this, "elements", /* @__PURE__ */ new Map());
  }
  /**
   * Observe an element for visibility changes.
   */
  observe(element, options = {}) {
    const key = this.buildKey(options);
    const state = signal({
      isVisible: false,
      hasEntered: false,
      intersectionRatio: 0
    });
    const entry = {
      signal: state,
      onEnter: options.onEnter,
      onLeave: options.onLeave,
      once: options.once || false,
      throttled: (options.throttleMs || 0) > 0,
      lastCall: 0,
      throttleMs: options.throttleMs || 0
    };
    this.elements.set(element, entry);
    let observer = this.observers.get(key);
    if (!observer) {
      observer = this.createObserver(options);
      this.observers.set(key, observer);
    }
    observer.observe(element);
    return state;
  }
  /**
   * Stop observing an element.
   */
  unobserve(element) {
    for (const observer of this.observers.values()) {
      observer.unobserve(element);
    }
    this.elements.delete(element);
  }
  /**
   * Check if an element is currently visible.
   */
  isVisible(element) {
    var _a;
    return ((_a = this.elements.get(element)) == null ? void 0 : _a.signal.peek().isVisible) || false;
  }
  /**
   * Get the reactive visibility state for an element.
   */
  getVisibilitySignal(element) {
    var _a;
    return (_a = this.elements.get(element)) == null ? void 0 : _a.signal;
  }
  /**
   * Destroy all observers.
   */
  destroy() {
    for (const observer of this.observers.values()) {
      observer.disconnect();
    }
    this.observers.clear();
    this.elements.clear();
  }
  // --- Internal ------------------------------------------------------
  createObserver(options) {
    return new IntersectionObserver(
      (entries) => this.handleIntersect(entries),
      {
        root: options.root || null,
        rootMargin: options.rootMargin || "0px",
        threshold: options.threshold || 0
      }
    );
  }
  handleIntersect(entries) {
    for (const entry of entries) {
      const element = entry.target;
      const data = this.elements.get(element);
      if (!data) continue;
      if (data.throttled) {
        const now = Date.now();
        if (now - data.lastCall < data.throttleMs) continue;
        data.lastCall = now;
      }
      const isVisible = entry.isIntersecting;
      const wasVisible = data.signal.peek().isVisible;
      data.signal.set({
        isVisible,
        hasEntered: data.signal.peek().hasEntered || isVisible,
        intersectionRatio: entry.intersectionRatio
      });
      if (isVisible && !wasVisible) {
        if (data.onEnter) data.onEnter();
      } else if (!isVisible && wasVisible) {
        if (data.onLeave) data.onLeave();
      }
      if (isVisible && data.once) {
        this.unobserve(element);
      }
    }
  }
  buildKey(options) {
    return `${options.root ? "el" : "null"}:${options.rootMargin || "0px"}:${JSON.stringify(options.threshold || 0)}`;
  }
};
var globalVisibilityManager = null;
function getVisibilityManager() {
  if (!globalVisibilityManager) globalVisibilityManager = new VisibilityManager();
  return globalVisibilityManager;
}
function observeVisibility(element, options) {
  return getVisibilityManager().observe(element, options);
}
function whenVisible(element, callback, options) {
  const manager = getVisibilityManager();
  const signal2 = manager.observe(element, { ...options, once: true, onEnter: callback });
  return () => manager.unobserve(element);
}
function whenInViewport(element, callback) {
  return whenVisible(element, callback, { threshold: 0.01 });
}
var ScrollDirectionDetector = class {
  constructor() {
    __publicField(this, "lastScrollX", 0);
    __publicField(this, "lastScrollY", 0);
    __publicField(this, "currentDirection", "none");
    __publicField(this, "listeners", /* @__PURE__ */ new Set());
    __publicField(this, "handleScroll", () => {
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;
      const deltaX = scrollX - this.lastScrollX;
      const deltaY = scrollY - this.lastScrollY;
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        this.currentDirection = deltaY > 0 ? "down" : "up";
      } else if (Math.abs(deltaX) > 0) {
        this.currentDirection = deltaX > 0 ? "right" : "left";
      } else {
        this.currentDirection = "none";
      }
      const delta = Math.max(Math.abs(deltaX), Math.abs(deltaY));
      for (const listener of this.listeners) {
        try {
          listener(this.currentDirection, delta);
        } catch (e) {
          console.error("[TW Scroll] Listener error:", e);
        }
      }
      this.lastScrollX = scrollX;
      this.lastScrollY = scrollY;
    });
    if (typeof window !== "undefined") {
      this.lastScrollX = window.scrollX;
      this.lastScrollY = window.scrollY;
      window.addEventListener("scroll", this.handleScroll, { passive: true });
    }
  }
  getDirection() {
    return this.currentDirection;
  }
  onScrollDirection(callback) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }
  destroy() {
    if (typeof window !== "undefined") {
      window.removeEventListener("scroll", this.handleScroll);
    }
    this.listeners.clear();
  }
};
var globalScrollDetector = null;
function getScrollDirectionDetector() {
  if (!globalScrollDetector) globalScrollDetector = new ScrollDirectionDetector();
  return globalScrollDetector;
}
function getScrollDirection() {
  return getScrollDirectionDetector().getDirection();
}

// packages/runtime/tw/keep-alive.ts
var KeepAlive = class {
  constructor(options = {}) {
    __publicField(this, "cache", /* @__PURE__ */ new Map());
    __publicField(this, "options");
    __publicField(this, "hits", 0);
    __publicField(this, "misses", 0);
    __publicField(this, "evictions", 0);
    __publicField(this, "activatedCallbacks", /* @__PURE__ */ new Map());
    __publicField(this, "deactivatedCallbacks", /* @__PURE__ */ new Map());
    this.options = {
      max: 10,
      include: [],
      exclude: [],
      ...options
    };
  }
  /**
   * Get a cached component instance by key.
   */
  get(key) {
    const entry = this.cache.get(key);
    if (entry) {
      entry.lastAccessed = Date.now();
      entry.accessCount++;
      this.hits++;
      this.notifyActivated(key);
    } else {
      this.misses++;
    }
    return entry;
  }
  /**
   * Cache a component instance.
   */
  set(key, name, vnode, dom, props, state) {
    if (!this.shouldCache(name)) return;
    while (this.cache.size >= this.options.max) {
      this.evictLRU();
    }
    const entry = {
      key,
      name,
      vnode,
      dom,
      props,
      state,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 0
    };
    this.cache.set(key, entry);
  }
  /**
   * Check if a component should be cached based on include/exclude.
   */
  shouldCache(name) {
    const { include, exclude } = this.options;
    if (include instanceof RegExp) {
      if (!include.test(name)) return false;
    } else if (Array.isArray(include) && include.length > 0) {
      if (!include.includes(name)) return false;
    }
    if (exclude instanceof RegExp) {
      if (exclude.test(name)) return false;
    } else if (Array.isArray(exclude) && exclude.length > 0) {
      if (exclude.includes(name)) return false;
    }
    return true;
  }
  /**
   * Remove a specific cache entry.
   */
  remove(key) {
    const entry = this.cache.get(key);
    if (entry) {
      this.notifyDeactivated(key);
      this.cache.delete(key);
    }
  }
  /**
   * Clear all cached entries.
   */
  clear() {
    for (const key of this.cache.keys()) {
      this.notifyDeactivated(key);
    }
    this.cache.clear();
  }
  /**
   * Check if a key is cached.
   */
  has(key) {
    return this.cache.has(key);
  }
  /**
   * Get all cache keys.
   */
  keys() {
    return Array.from(this.cache.keys());
  }
  /**
   * Register onActivated callback.
   */
  onActivated(key, callback) {
    if (!this.activatedCallbacks.has(key)) this.activatedCallbacks.set(key, []);
    this.activatedCallbacks.get(key).push(callback);
    return () => {
      const cbs = this.activatedCallbacks.get(key);
      if (cbs) {
        const idx = cbs.indexOf(callback);
        if (idx >= 0) cbs.splice(idx, 1);
      }
    };
  }
  /**
   * Register onDeactivated callback.
   */
  onDeactivated(key, callback) {
    if (!this.deactivatedCallbacks.has(key)) this.deactivatedCallbacks.set(key, []);
    this.deactivatedCallbacks.get(key).push(callback);
    return () => {
      const cbs = this.deactivatedCallbacks.get(key);
      if (cbs) {
        const idx = cbs.indexOf(callback);
        if (idx >= 0) cbs.splice(idx, 1);
      }
    };
  }
  /**
   * Get cache statistics.
   */
  getStats() {
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      entries: Array.from(this.cache.values()).map((e) => ({
        key: e.key,
        name: e.name,
        accessCount: e.accessCount,
        lastAccessed: e.lastAccessed
      }))
    };
  }
  /**
   * Update options.
   */
  updateOptions(options) {
    this.options = { ...this.options, ...options };
    if (options.max && this.cache.size > options.max) {
      while (this.cache.size > options.max) this.evictLRU();
    }
  }
  /**
   * Destroy the KeepAlive cache.
   */
  destroy() {
    this.clear();
    this.activatedCallbacks.clear();
    this.deactivatedCallbacks.clear();
  }
  // --- Internal ------------------------------------------------------
  evictLRU() {
    let oldestKey = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      this.notifyDeactivated(oldestKey);
      this.cache.delete(oldestKey);
      this.evictions++;
    }
  }
  notifyActivated(key) {
    const cbs = this.activatedCallbacks.get(key);
    if (cbs) {
      for (const cb of cbs) {
        try {
          cb();
        } catch (e) {
          console.error("[TW KeepAlive] onActivated error:", e);
        }
      }
    }
  }
  notifyDeactivated(key) {
    const cbs = this.deactivatedCallbacks.get(key);
    if (cbs) {
      for (const cb of cbs) {
        try {
          cb();
        } catch (e) {
          console.error("[TW KeepAlive] onDeactivated error:", e);
        }
      }
    }
  }
};
function createKeepAlive(options) {
  return new KeepAlive(options);
}

// packages/runtime/tw/keyboard-shortcuts.ts
var KeyboardShortcutManager = class {
  constructor() {
    __publicField(this, "shortcuts", /* @__PURE__ */ new Map());
    __publicField(this, "sequences", /* @__PURE__ */ new Map());
    __publicField(this, "sequenceTimers", /* @__PURE__ */ new Map());
    __publicField(this, "currentScope", "global");
    __publicField(this, "paused", false);
    __publicField(this, "enabled", true);
    // --- Internal ------------------------------------------------------
    __publicField(this, "handleKeyDown", (event) => {
      if (!this.enabled || this.paused) return;
      if (this.isInputFocused(event.target) && this.shouldIgnoreInputs(event)) return;
      if (this.checkSequences(event)) return;
      const key = this.eventToKey(event);
      const entries = this.shortcuts.get(key);
      if (!entries) return;
      for (const entry of entries) {
        if (this.matchesModifiers(event, entry.options) && this.matchesScope(entry.options)) {
          if (!entry.options.repeat && event.repeat) continue;
          if (entry.options.preventDefault) event.preventDefault();
          if (entry.options.stopPropagation) event.stopPropagation();
          try {
            entry.handler(event);
          } catch (e) {
            console.error("[TW Keyboard] Shortcut handler error:", e);
          }
          break;
        }
      }
    });
    if (typeof document !== "undefined") {
      document.addEventListener("keydown", this.handleKeyDown);
    }
  }
  /**
   * Register a keyboard shortcut.
   */
  register(keys, handler, options = {}) {
    const id = `shortcut-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const normalizedKeys = this.normalizeKeys(keys);
    if (normalizedKeys.includes(" ")) {
      return this.registerSequence(normalizedKeys, handler, options, id);
    }
    const entry = {
      id,
      keys: normalizedKeys,
      options: {
        preventDefault: true,
        stopPropagation: false,
        repeat: false,
        ignoreInputs: true,
        caseSensitive: false,
        ...options
      },
      handler
    };
    if (!this.shortcuts.has(normalizedKeys)) {
      this.shortcuts.set(normalizedKeys, []);
    }
    this.shortcuts.get(normalizedKeys).push(entry);
    return () => this.unregister(id, normalizedKeys);
  }
  /**
   * Unregister a shortcut.
   */
  unregister(id, keys) {
    if (keys) {
      const entries = this.shortcuts.get(keys);
      if (entries) {
        const idx = entries.findIndex((e) => e.id === id);
        if (idx >= 0) entries.splice(idx, 1);
        if (entries.length === 0) this.shortcuts.delete(keys);
      }
    } else {
      for (const [key, entries] of this.shortcuts) {
        const idx = entries.findIndex((e) => e.id === id);
        if (idx >= 0) {
          entries.splice(idx, 1);
          if (entries.length === 0) this.shortcuts.delete(key);
          break;
        }
      }
    }
  }
  /**
   * Set the current scope.
   */
  setScope(scope) {
    this.currentScope = scope;
  }
  /**
   * Pause all shortcuts.
   */
  pause() {
    this.paused = true;
  }
  /**
   * Resume all shortcuts.
   */
  resume() {
    this.paused = false;
  }
  /**
   * Enable/disable shortcuts.
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }
  /**
   * Generate help text for all registered shortcuts.
   */
  getHelp() {
    const help = [];
    for (const [keys, entries] of this.shortcuts) {
      for (const entry of entries) {
        help.push({
          keys: this.formatKeys(keys, entry.options),
          description: entry.options.description || "",
          scope: entry.options.scope || "global"
        });
      }
    }
    return help;
  }
  /**
   * Destroy the manager.
   */
  destroy() {
    if (typeof document !== "undefined") {
      document.removeEventListener("keydown", this.handleKeyDown);
    }
    this.shortcuts.clear();
    this.sequences.clear();
    for (const timer of this.sequenceTimers.values()) clearTimeout(timer);
    this.sequenceTimers.clear();
  }
  registerSequence(keys, handler, options, id) {
    const sequence = keys.split(" ").map((k) => this.normalizeKeys(k));
    const entry = {
      id,
      keys,
      options: { ...options },
      handler,
      sequence,
      sequenceIndex: 0
    };
    this.sequences.set(id, entry);
    return () => {
      this.sequences.delete(id);
    };
  }
  checkSequences(event) {
    var _a, _b;
    const key = this.eventToKey(event);
    for (const [id, entry] of this.sequences) {
      const expectedKey = (_a = entry.sequence) == null ? void 0 : _a[entry.sequenceIndex || 0];
      if (key === expectedKey) {
        if ((entry.sequenceIndex || 0) === 0 && !this.matchesModifiers(event, entry.options)) continue;
        entry.sequenceIndex = (entry.sequenceIndex || 0) + 1;
        if (entry.sequenceIndex >= (((_b = entry.sequence) == null ? void 0 : _b.length) || 0)) {
          if (entry.options.preventDefault) event.preventDefault();
          try {
            entry.handler(event);
          } catch (e) {
            console.error("[TW Keyboard] Sequence handler error:", e);
          }
          entry.sequenceIndex = 0;
        } else {
          const timer = setTimeout(() => {
            entry.sequenceIndex = 0;
          }, 1e3);
          this.sequenceTimers.set(id, timer);
        }
        return true;
      }
    }
    return false;
  }
  normalizeKeys(keys) {
    return keys.toLowerCase().trim().replace(/ctrl\+/g, "ctrl+").replace(/cmd\+/g, "meta+").replace(/shift\+/g, "shift+").replace(/alt\+/g, "alt+").replace(/option\+/g, "alt+");
  }
  eventToKey(event) {
    const parts = [];
    if (event.ctrlKey) parts.push("ctrl");
    if (event.metaKey) parts.push("meta");
    if (event.shiftKey) parts.push("shift");
    if (event.altKey) parts.push("alt");
    parts.push(event.key.toLowerCase());
    return parts.join("+");
  }
  matchesModifiers(event, options) {
    if (options.ctrlKey !== void 0 && event.ctrlKey !== options.ctrlKey) return false;
    if (options.shiftKey !== void 0 && event.shiftKey !== options.shiftKey) return false;
    if (options.altKey !== void 0 && event.altKey !== options.altKey) return false;
    if (options.metaKey !== void 0 && event.metaKey !== options.metaKey) return false;
    return true;
  }
  matchesScope(options) {
    if (!options.scope) return true;
    return options.scope === this.currentScope;
  }
  shouldIgnoreInputs(event) {
    const entries = this.shortcuts.get(this.eventToKey(event));
    if (!entries) return false;
    return entries.some((e) => e.options.ignoreInputs);
  }
  isInputFocused(target) {
    if (!target || !(target instanceof HTMLElement)) return false;
    const tag = target.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
  }
  formatKeys(keys, options) {
    const parts = [];
    if (options.ctrlKey) parts.push("Ctrl");
    if (options.metaKey) parts.push("Cmd");
    if (options.shiftKey) parts.push("Shift");
    if (options.altKey) parts.push("Alt");
    parts.push(keys.split("+").pop().toUpperCase());
    return parts.join(" + ");
  }
};
var globalKeyboardManager = null;
function getKeyboardManager() {
  if (!globalKeyboardManager) globalKeyboardManager = new KeyboardShortcutManager();
  return globalKeyboardManager;
}
function registerShortcut(keys, handler, options) {
  return getKeyboardManager().register(keys, handler, options);
}
function setShortcutScope(scope) {
  getKeyboardManager().setScope(scope);
}
function getShortcutHelp() {
  return getKeyboardManager().getHelp();
}

// packages/runtime/tw/logger.ts
var LEVELS = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
  silent: 99
};
var Logger = class _Logger {
  constructor(options = {}) {
    __publicField(this, "options");
    __publicField(this, "buffer", []);
    __publicField(this, "startTime");
    __publicField(this, "childLoggers", []);
    this.options = {
      level: "debug",
      tag: "",
      context: {},
      transports: [consoleTransport()],
      colorize: true,
      timestamp: true,
      bufferSize: 500,
      async: false,
      ...options
    };
    this.startTime = Date.now();
  }
  trace(message, context) {
    this.log("trace", message, context);
  }
  debug(message, context) {
    this.log("debug", message, context);
  }
  info(message, context) {
    this.log("info", message, context);
  }
  warn(message, context) {
    this.log("warn", message, context);
  }
  error(message, context) {
    this.log("error", message, context);
  }
  fatal(message, context) {
    this.log("fatal", message, context);
  }
  /**
   * Create a child logger with inherited context.
   */
  child(tag, context) {
    const child = new _Logger({
      ...this.options,
      tag: this.options.tag ? `${this.options.tag}:${tag}` : tag,
      context: { ...this.options.context, ...context }
    });
    this.childLoggers.push(child);
    return child;
  }
  /**
   * Set the log level.
   */
  setLevel(level) {
    this.options.level = level;
  }
  /**
   * Add a transport.
   */
  addTransport(transport) {
    this.options.transports.push(transport);
  }
  /**
   * Add context that will be included in all future logs.
   */
  addContext(key, value) {
    this.options.context[key] = value;
  }
  /**
   * Remove context.
   */
  removeContext(key) {
    delete this.options.context[key];
  }
  /**
   * Get buffered logs.
   */
  getBuffer() {
    return [...this.buffer];
  }
  /**
   * Clear the buffer.
   */
  clearBuffer() {
    this.buffer = [];
  }
  /**
   * Flush buffered logs to transports.
   */
  async flush() {
    const records = [...this.buffer];
    this.buffer = [];
    for (const record of records) {
      await this.sendToTransports(record);
    }
  }
  /**
   * Destroy the logger and all children.
   */
  destroy() {
    for (const child of this.childLoggers) child.destroy();
    this.childLoggers = [];
    this.buffer = [];
  }
  // --- Internal ------------------------------------------------------
  log(level, message, context) {
    if (LEVELS[level] < LEVELS[this.options.level]) return;
    const record = {
      level,
      message,
      context: { ...this.options.context, ...context },
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      elapsed: Date.now() - this.startTime,
      tag: this.options.tag || void 0
    };
    this.buffer.push(record);
    if (this.buffer.length > this.options.bufferSize) this.buffer.shift();
    if (this.options.async) {
      Promise.resolve(this.sendToTransports(record)).catch(
        (e) => console.error("[TW Logger] Transport error:", e)
      );
    } else {
      this.sendToTransports(record);
    }
  }
  async sendToTransports(record) {
    for (const transport of this.options.transports) {
      try {
        await transport(record);
      } catch (e) {
        console.error("[TW Logger] Transport error:", e);
      }
    }
  }
};
function consoleTransport() {
  return (record) => {
    const parts = [];
    if (record.tag) parts.push(`[${record.tag}]`);
    parts.push(record.message);
    const contextStr = Object.keys(record.context).length > 0 ? " " + JSON.stringify(record.context) : "";
    const output = parts.join(" ") + contextStr;
    const consoleFn = record.level === "fatal" || record.level === "error" ? console.error : record.level === "warn" ? console.warn : record.level === "trace" ? console.debug : console.log;
    consoleFn(output);
  };
}
function fileTransport(filename) {
  return (record) => {
    var _a;
    const line = JSON.stringify(record) + "\n";
    if (typeof process !== "undefined" && ((_a = process.versions) == null ? void 0 : _a.node)) {
    }
    console.debug(`[File:${filename}]`, line.trim());
  };
}
function networkTransport(url, batchSize = 10) {
  let batch2 = [];
  let flushTimer = null;
  const flush2 = async () => {
    if (batch2.length === 0) return;
    const records = [...batch2];
    batch2 = [];
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs: records })
      });
    } catch (e) {
      console.error("[TW Logger] Network transport failed:", e);
      batch2.unshift(...records);
    }
  };
  return (record) => {
    batch2.push(record);
    if (batch2.length >= batchSize) {
      flush2();
    } else if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flush2();
      }, 5e3);
    }
  };
}
function jsonTransport() {
  return (record) => {
    console.log(JSON.stringify(record));
  };
}
var globalLogger = null;
function getLogger() {
  if (!globalLogger) globalLogger = new Logger();
  return globalLogger;
}
function setGlobalLogger(logger) {
  globalLogger = logger;
}
function logTrace(message, context) {
  getLogger().trace(message, context);
}
function logDebug(message, context) {
  getLogger().debug(message, context);
}
function logInfo(message, context) {
  getLogger().info(message, context);
}
function logWarn(message, context) {
  getLogger().warn(message, context);
}
function logError(message, context) {
  getLogger().error(message, context);
}
function logFatal(message, context) {
  getLogger().fatal(message, context);
}
function createLogger(options) {
  return new Logger(options);
}

// packages/runtime/tw/media-query.ts
var defaultBreakpoints = {
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536
};
function useMediaQuery(query) {
  const result = signal(false);
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return result;
  }
  const mql = window.matchMedia(query);
  result.set(mql.matches);
  const handler = (e) => {
    result.set(e.matches);
  };
  if (mql.addEventListener) {
    mql.addEventListener("change", handler);
  } else {
    mql.addListener(handler);
  }
  const originalPeek = result.peek.bind(result);
  result.peek = () => {
    const v = originalPeek();
    return v;
  };
  return result;
}
function useBreakpoint(breakpoints = defaultBreakpoints) {
  const signals = [];
  const sorted = Object.entries(breakpoints).sort((a, b) => a[1] - b[1]);
  for (let i = 0; i < sorted.length; i++) {
    const [name, min] = sorted[i];
    const max = i < sorted.length - 1 ? sorted[i + 1][1] - 1 : Infinity;
    const query = max === Infinity ? `(min-width: ${min}px)` : `(min-width: ${min}px) and (max-width: ${max}px)`;
    signals.push({ name, signal: useMediaQuery(query) });
  }
  return computed(() => {
    var _a;
    for (const { name, signal: signal2 } of signals) {
      if (signal2()) return name;
    }
    return ((_a = sorted[0]) == null ? void 0 : _a[0]) || "xs";
  });
}
function usePrefersDark() {
  return useMediaQuery("(prefers-color-scheme: dark)");
}
function usePrefersReducedMotion() {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
function usePrefersColorScheme() {
  const dark = useMediaQuery("(prefers-color-scheme: dark)");
  const light = useMediaQuery("(prefers-color-scheme: light)");
  return computed(() => {
    if (dark()) return "dark";
    if (light()) return "light";
    return "no-preference";
  });
}
function useViewportSize() {
  const result = signal({ width: 0, height: 0 });
  if (typeof window === "undefined") return result;
  const update = () => {
    result.set({
      width: window.innerWidth,
      height: window.innerHeight
    });
  };
  update();
  window.addEventListener("resize", update, { passive: true });
  return result;
}
function useViewportWidth() {
  const size = useViewportSize();
  return computed(() => size().width);
}
function useViewportHeight() {
  const size = useViewportSize();
  return computed(() => size().height);
}
function useOrientation() {
  const portrait = useMediaQuery("(orientation: portrait)");
  return computed(() => portrait() ? "portrait" : "landscape");
}
function useIsTouchDevice() {
  return useMediaQuery("(hover: none) and (pointer: coarse)");
}
function useCanHover() {
  return useMediaQuery("(hover: hover) and (pointer: fine)");
}
function useDevicePixelRatio() {
  const result = signal(1);
  if (typeof window === "undefined") return result;
  const update = () => result.set(window.devicePixelRatio || 1);
  update();
  window.addEventListener("resize", update, { passive: true });
  const mql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  mql.addEventListener("change", update);
  return result;
}
function useDocumentVisible() {
  const result = signal(true);
  if (typeof document === "undefined") return result;
  const update = () => result.set(!document.hidden);
  update();
  document.addEventListener("visibilitychange", update);
  return result;
}
function useIsOnline() {
  const result = signal(true);
  if (typeof navigator === "undefined") return result;
  result.set(navigator.onLine);
  window.addEventListener("online", () => result.set(true));
  window.addEventListener("offline", () => result.set(false));
  return result;
}
function useConnectionType() {
  const result = signal("unknown");
  if (typeof navigator === "undefined" || !("connection" in navigator)) return result;
  const conn = navigator.connection;
  if (conn) {
    const update = () => result.set(conn.effectiveType);
    update();
    conn.addEventListener("change", update);
  }
  return result;
}

// packages/runtime/tw/memory-pool.ts
var ObjectPool = class {
  constructor(factory, reset, maxSize = 1e3) {
    __publicField(this, "pool", []);
    __publicField(this, "factory");
    __publicField(this, "reset");
    __publicField(this, "maxSize");
    __publicField(this, "stats", { allocated: 0, recycled: 0, hits: 0, misses: 0 });
    this.factory = factory;
    this.reset = reset;
    this.maxSize = maxSize;
    for (let i = 0; i < Math.min(50, maxSize); i++) {
      this.pool.push(factory());
    }
  }
  acquire() {
    if (this.pool.length > 0) {
      this.stats.hits++;
      return this.pool.pop();
    }
    this.stats.misses++;
    this.stats.allocated++;
    return this.factory();
  }
  release(obj) {
    if (this.pool.length < this.maxSize) {
      this.reset(obj);
      this.pool.push(obj);
      this.stats.recycled++;
    }
  }
  releaseAll(objects) {
    for (const obj of objects) this.release(obj);
  }
  grow(count) {
    for (let i = 0; i < count; i++) {
      if (this.pool.length < this.maxSize) {
        this.pool.push(this.factory());
      }
    }
  }
  drain() {
    this.pool.length = 0;
  }
  getStats() {
    return {
      ...this.stats,
      poolSize: this.pool.length,
      hitRate: this.stats.hits + this.stats.misses > 0 ? this.stats.hits / (this.stats.hits + this.stats.misses) : 0
    };
  }
};
function createVNode2() {
  return {
    type: "element",
    tag: "",
    props: {},
    children: []
  };
}
function resetVNode(vnode) {
  vnode.type = "element";
  vnode.tag = void 0;
  vnode.props = void 0;
  vnode.children = void 0;
  vnode.text = void 0;
  vnode.key = void 0;
  vnode.el = void 0;
  vnode.component = void 0;
  vnode.componentInstance = void 0;
  vnode.hooks = void 0;
  vnode._dirty = void 0;
  vnode._hoisted = void 0;
}
var vnodePool = new ObjectPool(createVNode2, resetVNode, 5e3);
function releaseVNode2(vnode) {
  if (vnode.children) {
    for (const child of vnode.children) releaseVNode2(child);
  }
  vnodePool.release(vnode);
}
function releaseVNodes(vnodes) {
  for (const vnode of vnodes) releaseVNode2(vnode);
}
var DOMElementPool = class {
  constructor(maxSize = 500) {
    __publicField(this, "pools", /* @__PURE__ */ new Map());
    __publicField(this, "maxSize");
    __publicField(this, "stats", { created: 0, reused: 0, released: 0 });
    this.maxSize = maxSize;
  }
  acquire(tag) {
    const pool = this.pools.get(tag);
    if (pool && pool.length > 0) {
      this.stats.reused++;
      const el = pool.pop();
      el.innerHTML = "";
      el.className = "";
      el.style.cssText = "";
      return el;
    }
    this.stats.created++;
    return document.createElement(tag);
  }
  release(el) {
    const tag = el.tagName.toLowerCase();
    if (!this.pools.has(tag)) this.pools.set(tag, []);
    const pool = this.pools.get(tag);
    if (pool.length < this.maxSize) {
      el.innerHTML = "";
      el.className = "";
      el.style.cssText = "";
      while (el.attributes.length > 0) {
        el.removeAttribute(el.attributes[0].name);
      }
      pool.push(el);
      this.stats.released++;
    }
  }
  releaseAll(elements) {
    for (const el of elements) this.release(el);
  }
  drain() {
    this.pools.clear();
  }
  getStats() {
    return {
      ...this.stats,
      poolSizes: Object.fromEntries(
        Array.from(this.pools.entries()).map(([tag, pool]) => [tag, pool.length])
      )
    };
  }
};
var globalDOMPool = null;
function getDOMPool() {
  if (!globalDOMPool) globalDOMPool = new DOMElementPool();
  return globalDOMPool;
}
function acquireElement(tag) {
  return getDOMPool().acquire(tag);
}
function releaseElement(el) {
  getDOMPool().release(el);
}
var MemoryManager = class {
  constructor() {
    __publicField(this, "vnodePool", vnodePool);
    __publicField(this, "domPool", null);
    __publicField(this, "intervalId", null);
  }
  init() {
    this.domPool = getDOMPool();
  }
  /**
   * Start periodic cleanup (removes excess pooled objects).
   */
  startAutoCleanup(intervalMs = 3e4) {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => {
      this.cleanup();
    }, intervalMs);
  }
  stopAutoCleanup() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
  /**
   * Clean up excess pooled objects.
   */
  cleanup() {
    const vnodeStats = this.vnodePool.getStats();
    if (vnodeStats.poolSize > 500 && vnodeStats.hitRate < 0.3) {
      const toRemove = Math.floor(vnodeStats.poolSize / 2);
      for (let i = 0; i < toRemove; i++) {
        this.vnodePool.acquire();
      }
    }
  }
  /**
   * Full cleanup -- drain all pools.
   */
  destroy() {
    this.stopAutoCleanup();
    this.vnodePool.drain();
    if (this.domPool) this.domPool.drain();
  }
  getStats() {
    return {
      vnode: this.vnodePool.getStats(),
      dom: this.domPool ? this.domPool.getStats() : null
    };
  }
};
var globalMemoryManager = null;
function getMemoryManager() {
  if (!globalMemoryManager) {
    globalMemoryManager = new MemoryManager();
    globalMemoryManager.init();
  }
  return globalMemoryManager;
}
function destroyMemoryManager() {
  if (globalMemoryManager) {
    globalMemoryManager.destroy();
    globalMemoryManager = null;
  }
}

// packages/runtime/tw/modal-dialog.ts
var ModalManager = class {
  constructor() {
    __publicField(this, "modals", /* @__PURE__ */ new Map());
    __publicField(this, "modalStack", []);
    __publicField(this, "scrollLockCount", 0);
    __publicField(this, "idCounter", 0);
  }
  /**
   * Create a modal.
   */
  create(content, options = {}) {
    const id = `modal-${++this.idCounter}`;
    const opts = {
      backdrop: true,
      backdropClose: true,
      escapeClose: true,
      focusTrap: true,
      lockScroll: true,
      animation: "fade",
      onOpen: () => {
      },
      onClose: () => {
      },
      beforeClose: () => true,
      ...options
    };
    const modal = document.createElement("div");
    modal.className = "tw-modal";
    modal.setAttribute("data-modal-id", id);
    modal.style.cssText = "position:fixed;inset:0;z-index:9998;display:none;align-items:center;justify-content:center;";
    let backdrop = null;
    if (opts.backdrop) {
      backdrop = document.createElement("div");
      backdrop.className = "tw-modal-backdrop";
      backdrop.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9997;";
      if (opts.backdropClose) {
        backdrop.addEventListener("click", () => this.close(id));
      }
      modal.appendChild(backdrop);
    }
    const contentWrapper = document.createElement("div");
    contentWrapper.className = "tw-modal-content";
    contentWrapper.style.cssText = "position:relative;z-index:9999;background:#fff;border-radius:8px;padding:24px;max-width:90vw;max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);";
    if (typeof content === "string") {
      if (typeof content === "string") {
        contentWrapper.textContent = content;
      } else {
        contentWrapper.innerHTML = "";
        contentWrapper.appendChild(content);
      }
    } else {
      contentWrapper.appendChild(content);
    }
    modal.appendChild(contentWrapper);
    modal.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && opts.escapeClose) {
        this.close(id);
      }
    });
    document.body.appendChild(modal);
    this.modals.set(id, {
      element: modal,
      backdrop,
      options: opts,
      focusTrap: null,
      isOpen: false
    });
    return id;
  }
  /**
   * Open a modal.
   */
  async open(id) {
    const modal = this.modals.get(id);
    if (!modal || modal.isOpen) return;
    modal.isOpen = true;
    this.modalStack.push(id);
    if (modal.options.lockScroll) this.lockScroll();
    modal.element.style.display = "flex";
    requestAnimationFrame(() => {
      modal.element.style.opacity = "1";
      if (modal.backdrop) {
        modal.backdrop.style.transition = "opacity 0.3s ease";
        modal.backdrop.style.opacity = "1";
      }
      const content = modal.element.querySelector(".tw-modal-content");
      if (content) {
        content.style.transition = "transform 0.3s ease, opacity 0.3s ease";
        content.style.transform = "scale(1)";
        content.style.opacity = "1";
      }
    });
    if (modal.options.focusTrap) {
      const content = modal.element.querySelector(".tw-modal-content");
      if (content) {
        modal.focusTrap = createFocusTrap(content);
        modal.focusTrap.activate();
      }
    }
    if (modal.options.onOpen) modal.options.onOpen();
  }
  /**
   * Close a modal.
   */
  async close(id) {
    const modal = this.modals.get(id);
    if (!modal || !modal.isOpen) return;
    if (modal.options.beforeClose) {
      const shouldClose = await modal.options.beforeClose();
      if (!shouldClose) return;
    }
    modal.isOpen = false;
    if (modal.focusTrap) {
      modal.focusTrap.deactivate();
      modal.focusTrap = null;
    }
    modal.element.style.opacity = "0";
    if (modal.backdrop) modal.backdrop.style.opacity = "0";
    const content = modal.element.querySelector(".tw-modal-content");
    if (content) {
      content.style.transform = "scale(0.95)";
      content.style.opacity = "0";
    }
    setTimeout(() => {
      modal.element.style.display = "none";
      if (modal.options.lockScroll) this.unlockScroll();
      if (modal.options.onClose) modal.options.onClose();
      if (modal.resolve) modal.resolve(false);
    }, 300);
    const idx = this.modalStack.indexOf(id);
    if (idx >= 0) this.modalStack.splice(idx, 1);
  }
  /**
   * Show a confirm dialog (Promise-based).
   */
  confirm(options) {
    return new Promise((resolve) => {
      var _a, _b;
      const { title, message, confirmText = "Confirm", cancelText = "Cancel", variant = "default" } = options;
      const content = document.createElement("div");
      content.innerHTML = `
        ${title ? `<h3 style="margin:0 0 12px;font-size:1.125rem;font-weight:600;">${this.escapeHtml(title)}</h3>` : ""}
        <p style="margin:0 0 20px;color:#475569;font-size:0.875rem;">${this.escapeHtml(message)}</p>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button data-action="cancel" style="padding:8px 16px;border:1px solid #e2e8f0;background:#fff;border-radius:6px;cursor:pointer;font-size:0.875rem;">${this.escapeHtml(cancelText)}</button>
          <button data-action="confirm" style="padding:8px 16px;border:none;background:${variant === "danger" ? "#ef4444" : variant === "success" ? "#22c55e" : "#3b82f6"};color:#fff;border-radius:6px;cursor:pointer;font-size:0.875rem;">${this.escapeHtml(confirmText)}</button>
        </div>
      `;
      const id = this.create(content, {
        backdropClose: false,
        escapeClose: true,
        ...options
      });
      const modal = this.modals.get(id);
      modal.resolve = resolve;
      (_a = content.querySelector('[data-action="cancel"]')) == null ? void 0 : _a.addEventListener("click", () => {
        this.close(id);
        resolve(false);
      });
      (_b = content.querySelector('[data-action="confirm"]')) == null ? void 0 : _b.addEventListener("click", () => {
        this.close(id);
        resolve(true);
      });
      this.open(id);
    });
  }
  /**
   * Show an alert dialog (Promise-based).
   */
  alert(message, title, options) {
    return new Promise((resolve) => {
      var _a;
      const content = document.createElement("div");
      content.innerHTML = `
        ${title ? `<h3 style="margin:0 0 12px;font-size:1.125rem;font-weight:600;">${this.escapeHtml(title)}</h3>` : ""}
        <p style="margin:0 0 20px;color:#475569;font-size:0.875rem;">${this.escapeHtml(message)}</p>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button data-action="ok" style="padding:8px 16px;border:none;background:#3b82f6;color:#fff;border-radius:6px;cursor:pointer;font-size:0.875rem;">OK</button>
        </div>
      `;
      const id = this.create(content, { backdropClose: false, escapeClose: true, ...options });
      (_a = content.querySelector('[data-action="ok"]')) == null ? void 0 : _a.addEventListener("click", () => {
        this.close(id);
        resolve();
      });
      this.open(id);
    });
  }
  /**
   * Close all modals.
   */
  closeAll() {
    for (const id of [...this.modalStack]) {
      this.close(id);
    }
  }
  /**
   * Check if a modal is open.
   */
  isOpen(id) {
    var _a;
    return ((_a = this.modals.get(id)) == null ? void 0 : _a.isOpen) || false;
  }
  /**
   * Get the topmost modal ID.
   */
  getTopModal() {
    return this.modalStack.length > 0 ? this.modalStack[this.modalStack.length - 1] : null;
  }
  /**
   * Destroy a modal.
   */
  destroy(id) {
    const modal = this.modals.get(id);
    if (modal) {
      if (modal.isOpen) this.close(id);
      modal.element.remove();
      this.modals.delete(id);
    }
  }
  // --- Internal ------------------------------------------------------
  lockScroll() {
    this.scrollLockCount++;
    if (this.scrollLockCount === 1) {
      document.body.style.overflow = "hidden";
    }
  }
  unlockScroll() {
    this.scrollLockCount = Math.max(0, this.scrollLockCount - 1);
    if (this.scrollLockCount === 0) {
      document.body.style.overflow = "";
    }
  }
  escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
};
var globalModalManager = null;
function getModalManager() {
  if (!globalModalManager) globalModalManager = new ModalManager();
  return globalModalManager;
}
function showModal(content, options) {
  return getModalManager().create(content, options);
}
function openModal(id) {
  return getModalManager().open(id);
}
function closeModal(id) {
  return getModalManager().close(id);
}
function confirmDialog(options) {
  return getModalManager().confirm(options);
}
function alertDialog(message, title, options) {
  return getModalManager().alert(message, title, options);
}
function closeAllModals() {
  getModalManager().closeAll();
}

// packages/runtime/tw/pagination.ts
var OffsetPagination = class {
  constructor(options) {
    __publicField(this, "currentPage");
    __publicField(this, "pageSize");
    __publicField(this, "totalItems");
    __publicField(this, "siblingCount");
    __publicField(this, "boundaryCount");
    __publicField(this, "pageSizes");
    var _a, _b;
    this.currentPage = signal(options.initialPage || 1);
    this.pageSize = signal(options.initialPageSize || 10);
    this.totalItems = signal(options.totalItems);
    this.siblingCount = (_a = options.siblingCount) != null ? _a : 1;
    this.boundaryCount = (_b = options.boundaryCount) != null ? _b : 1;
    this.pageSizes = options.pageSizes || [10, 20, 50, 100];
  }
  get state() {
    const page = this.currentPage();
    const size = this.pageSize();
    const total = this.totalItems();
    const totalPages = Math.max(1, Math.ceil(total / size));
    return {
      currentPage: Math.min(page, totalPages),
      pageSize: size,
      totalItems: total,
      totalPages,
      startIndex: total === 0 ? 0 : (page - 1) * size + 1,
      endIndex: Math.min(page * size, total),
      hasPrevious: page > 1,
      hasNext: page < totalPages,
      pages: this.computePages(page, totalPages)
    };
  }
  get currentPageSignal() {
    return this.currentPage;
  }
  get pageSizeSignal() {
    return this.pageSize;
  }
  get totalItemsSignal() {
    return this.totalItems;
  }
  setPage(page) {
    const totalPages = Math.max(1, Math.ceil(this.totalItems.peek() / this.pageSize.peek()));
    this.currentPage.set(Math.max(1, Math.min(page, totalPages)));
  }
  nextPage() {
    this.setPage(this.currentPage.peek() + 1);
  }
  previousPage() {
    this.setPage(this.currentPage.peek() - 1);
  }
  firstPage() {
    this.setPage(1);
  }
  lastPage() {
    const totalPages = Math.max(1, Math.ceil(this.totalItems.peek() / this.pageSize.peek()));
    this.setPage(totalPages);
  }
  setPageSize(size) {
    const oldSize = this.pageSize.peek();
    const oldPage = this.currentPage.peek();
    this.pageSize.set(size);
    const newItem = (oldPage - 1) * oldSize;
    const newPage = Math.floor(newItem / size) + 1;
    this.setPage(newPage);
  }
  setTotalItems(total) {
    this.totalItems.set(total);
    const totalPages = Math.max(1, Math.ceil(total / this.pageSize.peek()));
    if (this.currentPage.peek() > totalPages) {
      this.currentPage.set(totalPages);
    }
  }
  getPageRange() {
    const page = this.currentPage.peek();
    const size = this.pageSize.peek();
    return {
      start: (page - 1) * size,
      end: Math.min(page * size, this.totalItems.peek())
    };
  }
  slice(items) {
    const { start, end } = this.getPageRange();
    return items.slice(start, end);
  }
  getPageSizes() {
    return this.pageSizes;
  }
  computePages(currentPage, totalPages) {
    if (totalPages <= 1) return [1];
    const pages = [];
    const sibling = this.siblingCount;
    const boundary = this.boundaryCount;
    for (let i = 1; i <= Math.min(boundary, totalPages); i++) {
      pages.push(i);
    }
    const leftSiblingStart = Math.max(boundary + 1, currentPage - sibling);
    if (leftSiblingStart > boundary + 1) {
      pages.push("...");
    }
    for (let i = Math.max(boundary + 1, leftSiblingStart); i < currentPage; i++) {
      if (!pages.includes(i)) pages.push(i);
    }
    if (!pages.includes(currentPage)) {
      pages.push(currentPage);
    }
    const rightSiblingEnd = Math.min(totalPages - boundary, currentPage + sibling);
    for (let i = currentPage + 1; i <= rightSiblingEnd; i++) {
      if (!pages.includes(i)) pages.push(i);
    }
    if (rightSiblingEnd < totalPages - boundary) {
      pages.push("...");
    }
    for (let i = Math.max(totalPages - boundary + 1, rightSiblingEnd + 1); i <= totalPages; i++) {
      if (!pages.includes(i)) pages.push(i);
    }
    return pages;
  }
};
var CursorPagination = class {
  constructor(fetchFn, pageSize = 20) {
    __publicField(this, "loadedPages", /* @__PURE__ */ new Map());
    __publicField(this, "currentCursor", null);
    __publicField(this, "nextCursor", null);
    __publicField(this, "previousCursor", null);
    __publicField(this, "fetchFn");
    __publicField(this, "pageSize");
    __publicField(this, "allItems", signal([]));
    __publicField(this, "isLoading", signal(false));
    __publicField(this, "_hasMore", signal(true));
    this.fetchFn = fetchFn;
    this.pageSize = pageSize;
  }
  get items() {
    return this.allItems;
  }
  get loading() {
    return this.isLoading;
  }
  get hasMore() {
    return this._hasMore;
  }
  async loadMore() {
    if (this.isLoading.peek() || !this.hasMore.peek()) return;
    this.isLoading.set(true);
    try {
      const result = await this.fetchFn(this.nextCursor, this.pageSize);
      this.allItems.set([...this.allItems.peek(), ...result.items]);
      this.previousCursor = this.currentCursor;
      this.currentCursor = this.nextCursor;
      this.nextCursor = result.nextCursor;
      this.hasMore.set(result.nextCursor !== null);
    } catch (e) {
      console.error("[TW Pagination] Load more failed:", e);
    } finally {
      this.isLoading.set(false);
    }
  }
  async refresh() {
    this.currentCursor = null;
    this.nextCursor = null;
    this.previousCursor = null;
    this.allItems.set([]);
    this.hasMore.set(true);
    await this.loadMore();
  }
  reset() {
    this.loadedPages.clear();
    this.currentCursor = null;
    this.nextCursor = null;
    this.previousCursor = null;
    this.allItems.set([]);
    this.hasMore.set(true);
  }
};
function createPagination(options) {
  return new OffsetPagination(options);
}
function createCursorPagination(fetchFn, pageSize) {
  return new CursorPagination(fetchFn, pageSize);
}

// packages/runtime/tw/plugin-system.ts
var PluginManager = class {
  constructor() {
    __publicField(this, "plugins", /* @__PURE__ */ new Map());
    __publicField(this, "components", /* @__PURE__ */ new Map());
    __publicField(this, "directives", /* @__PURE__ */ new Map());
    __publicField(this, "stores", /* @__PURE__ */ new Map());
    __publicField(this, "guards", []);
    __publicField(this, "providers", /* @__PURE__ */ new Map());
    __publicField(this, "config", {});
    __publicField(this, "app");
  }
  setApp(app) {
    this.app = app;
  }
  setConfig(config) {
    this.config = config;
  }
  /**
   * Install a plugin.
   */
  use(plugin, options = {}) {
    if (this.plugins.has(plugin.name)) {
      console.warn(`[TW Plugins] Plugin '${plugin.name}' is already installed.`);
      return;
    }
    const registration = {
      plugin,
      options,
      installed: false
    };
    this.plugins.set(plugin.name, registration);
    const context = {
      component: (name, component) => {
        this.components.set(name, component);
      },
      directive: (name, directive) => {
        this.directives.set(name, directive);
      },
      store: (name, store) => {
        this.stores.set(name, store);
      },
      guard: (fn) => {
        this.guards.push(fn);
      },
      provide: (key, value) => {
        this.providers.set(key, value);
      },
      config: this.config,
      app: this.app
    };
    try {
      const result = plugin.install(context, options);
      if (result instanceof Promise) {
        result.catch((e) => console.error(`[TW Plugins] Async install error for '${plugin.name}':`, e));
      }
      registration.installed = true;
    } catch (e) {
      console.error(`[TW Plugins] Failed to install '${plugin.name}':`, e);
      this.plugins.delete(plugin.name);
    }
  }
  /**
   * Uninstall a plugin.
   */
  uninstall(name) {
    const registration = this.plugins.get(name);
    if (!registration) return;
    if (registration.plugin.uninstall) {
      try {
        registration.plugin.uninstall();
      } catch (e) {
        console.error(`[TW Plugins] Uninstall error for '${name}':`, e);
      }
    }
    this.plugins.delete(name);
  }
  /**
   * Get a registered component.
   */
  getComponent(name) {
    return this.components.get(name);
  }
  /**
   * Get a registered directive.
   */
  getDirective(name) {
    return this.directives.get(name);
  }
  /**
   * Get a registered store.
   */
  getStore(name) {
    return this.stores.get(name);
  }
  /**
   * Get all guards.
   */
  getGuards() {
    return [...this.guards];
  }
  /**
   * Get a provided value.
   */
  getProvided(key) {
    return this.providers.get(key);
  }
  /**
   * Get all installed plugins.
   */
  getInstalledPlugins() {
    return Array.from(this.plugins.entries()).filter(([, reg]) => reg.installed).map(([name]) => name);
  }
  /**
   * Check if a plugin is installed.
   */
  isInstalled(name) {
    const reg = this.plugins.get(name);
    return reg ? reg.installed : false;
  }
  /**
   * Uninstall all plugins.
   */
  uninstallAll() {
    for (const name of Array.from(this.plugins.keys())) {
      this.uninstall(name);
    }
    this.components.clear();
    this.directives.clear();
    this.stores.clear();
    this.guards = [];
    this.providers.clear();
  }
};
var globalPluginManager = null;
function getPluginManager() {
  if (!globalPluginManager) globalPluginManager = new PluginManager();
  return globalPluginManager;
}
function usePlugin(plugin, options) {
  getPluginManager().use(plugin, options);
}
var devtoolsPlugin = {
  name: "tw-devtools",
  version: "0.0.1",
  install(context) {
    context.config.devtools = true;
  }
};
function createErrorReportingPlugin(reportUrl) {
  return {
    name: "tw-error-reporting",
    version: "0.0.1",
    install(context) {
      context.config.errorReportUrl = reportUrl;
      context.provide("errorReportUrl", reportUrl);
    }
  };
}
function createAnalyticsPlugin(trackFn) {
  return {
    name: "tw-analytics",
    version: "0.0.1",
    install(context) {
      context.provide("track", trackFn);
      context.guard(() => {
        trackFn("page-view", { url: typeof window !== "undefined" ? window.location.pathname : "/" });
        return true;
      });
    }
  };
}

// packages/runtime/tw/portal.ts
var Portal = class {
  constructor(id, options = {}) {
    __publicField(this, "id");
    __publicField(this, "target");
    __publicField(this, "wrapper");
    __publicField(this, "options");
    __publicField(this, "children", []);
    __publicField(this, "isActive", false);
    this.id = id;
    this.options = { append: true, wrapperClass: "tw-portal", ...options };
    if (options.target) {
      this.target = options.target;
    } else if (options.targetSelector) {
      const el = document.querySelector(options.targetSelector);
      this.target = el || document.body;
    } else {
      this.target = document.body;
    }
    this.wrapper = document.createElement("div");
    this.wrapper.setAttribute("data-portal", id);
    if (this.options.wrapperClass) this.wrapper.className = this.options.wrapperClass;
    this.wrapper.style.position = "relative";
    this.wrapper.style.zIndex = "1000";
  }
  render(children) {
    if (this.options.disabled) return;
    this.children = Array.isArray(children) ? children : [children];
    if (!this.isActive) this.mount();
    this.wrapper.innerHTML = "";
    for (const child of this.children) {
      const el = this.createDOMElement(child);
      if (el) this.wrapper.appendChild(el);
    }
  }
  renderHTML(html) {
    if (this.options.disabled) return;
    if (!this.isActive) this.mount();
    this.wrapper.textContent = "";
    const template = document.createElement("template");
    template.innerHTML = html;
    this.wrapper.appendChild(template.content.cloneNode(true));
  }
  mount() {
    if (this.isActive) return;
    if (this.options.append) this.target.appendChild(this.wrapper);
    else {
      this.target.innerHTML = "";
      this.target.appendChild(this.wrapper);
    }
    this.isActive = true;
  }
  unmount() {
    if (!this.isActive) return;
    this.wrapper.remove();
    this.wrapper.innerHTML = "";
    this.isActive = false;
  }
  destroy() {
    this.unmount();
    this.children = [];
  }
  get active() {
    return this.isActive;
  }
  get element() {
    return this.wrapper;
  }
  update(options) {
    const newTarget = options.target || (options.targetSelector ? document.querySelector(options.targetSelector) : null);
    if (newTarget && newTarget !== this.target) {
      if (this.isActive) this.unmount();
      this.target = newTarget;
      if (this.isActive) this.mount();
    }
    this.options = { ...this.options, ...options };
  }
  createDOMElement(vnode) {
    if (!vnode) return null;
    if (vnode.type === "text" && vnode.text !== void 0) return document.createTextNode(vnode.text);
    const el = document.createElement(vnode.tag || "div");
    if (vnode.props) {
      for (const [key, value] of Object.entries(vnode.props)) {
        if (key === "class" || key === "className") el.className = String(value);
        else if (key === "style" && typeof value === "object") {
          const style = value;
          for (const [prop, val] of Object.entries(style)) el.style[prop] = val;
        } else if (key.startsWith("on") && typeof value === "function") {
          el.addEventListener(key.substring(2).toLowerCase(), value);
        } else if (typeof value === "boolean") {
          if (value) el.setAttribute(key, "");
        } else el.setAttribute(key, String(value));
      }
    }
    if (vnode.children) {
      for (const child of vnode.children) {
        const childEl = this.createDOMElement(child);
        if (childEl) el.appendChild(childEl);
      }
    }
    return el;
  }
};
var portalRegistry = /* @__PURE__ */ new Map();
function createPortal(id, options) {
  if (portalRegistry.has(id)) {
    const portal2 = portalRegistry.get(id);
    if (options) portal2.update(options);
    return portal2;
  }
  const portal = new Portal(id, options);
  portalRegistry.set(id, portal);
  return portal;
}
function getPortal(id) {
  return portalRegistry.get(id);
}
function destroyPortal(id) {
  const portal = portalRegistry.get(id);
  if (portal) {
    portal.destroy();
    portalRegistry.delete(id);
  }
}
function destroyAllPortals() {
  for (const portal of portalRegistry.values()) portal.destroy();
  portalRegistry.clear();
}
var teleport = createPortal;
var Teleport = Portal;
function createTeleportNode(target, children) {
  return { type: "element", tag: "teleport", props: { to: target }, children };
}

// packages/runtime/tw/profiler.ts
var Profiler = class {
  constructor() {
    __publicField(this, "enabled", false);
    __publicField(this, "sessions", []);
    __publicField(this, "currentSession", null);
    __publicField(this, "stack", []);
    __publicField(this, "markers", /* @__PURE__ */ new Map());
    __publicField(this, "maxSessions", 50);
    __publicField(this, "slowThreshold", 16);
  }
  // 16ms = 60fps threshold
  /**
   * Start a profiling session.
   */
  startSession(id) {
    if (!this.enabled) return "";
    const sessionId = id || `session-${Date.now()}`;
    this.currentSession = {
      id: sessionId,
      startTime: typeof performance !== "undefined" ? performance.now() : Date.now(),
      endTime: 0,
      entries: [],
      totalDuration: 0,
      componentCount: 0,
      effectCount: 0,
      commitCount: 0
    };
    this.stack = [];
    return sessionId;
  }
  /**
   * End the current profiling session.
   */
  endSession() {
    if (!this.enabled || !this.currentSession) return null;
    this.currentSession.endTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.currentSession.totalDuration = this.currentSession.endTime - this.currentSession.startTime;
    this.sessions.push(this.currentSession);
    if (this.sessions.length > this.maxSessions) this.sessions.shift();
    const session = this.currentSession;
    this.currentSession = null;
    this.stack = [];
    return session;
  }
  /**
   * Start tracking a component render.
   */
  startRender(componentId, componentName) {
    if (!this.enabled || !this.currentSession) return;
    const entry = {
      name: componentName,
      type: "component",
      startTime: typeof performance !== "undefined" ? performance.now() : Date.now(),
      endTime: 0,
      duration: 0,
      componentId,
      depth: this.stack.length,
      children: []
    };
    if (this.stack.length > 0) {
      this.stack[this.stack.length - 1].children.push(entry);
    } else {
      this.currentSession.entries.push(entry);
    }
    this.stack.push(entry);
    this.currentSession.componentCount++;
  }
  /**
   * End tracking a component render.
   */
  endRender() {
    if (!this.enabled || !this.currentSession || this.stack.length === 0) return;
    const entry = this.stack.pop();
    entry.endTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    entry.duration = entry.endTime - entry.startTime;
    if (entry.duration > this.slowThreshold) {
      console.warn(`[TW Profiler] Slow component: '${entry.name}' took ${entry.duration.toFixed(2)}ms`);
    }
  }
  /**
   * Track an effect execution.
   */
  trackEffect(name, fn) {
    if (!this.enabled || !this.currentSession) {
      fn();
      return;
    }
    const start = typeof performance !== "undefined" ? performance.now() : Date.now();
    try {
      fn();
    } finally {
      const end = typeof performance !== "undefined" ? performance.now() : Date.now();
      this.currentSession.effectCount++;
      const duration = end - start;
      if (duration > this.slowThreshold) {
        console.warn(`[TW Profiler] Slow effect: '${name}' took ${duration.toFixed(2)}ms`);
      }
    }
  }
  /**
   * Mark a point in time.
   */
  mark(name) {
    this.markers.set(name, typeof performance !== "undefined" ? performance.now() : Date.now());
  }
  /**
   * Measure between two marks.
   */
  measure(startMark, endMark, name) {
    const start = this.markers.get(startMark);
    const end = this.markers.get(endMark);
    if (start === void 0 || end === void 0) return null;
    const duration = end - start;
    if (name && this.enabled && this.currentSession) {
      this.currentSession.entries.push({
        name: name || `${startMark}->${endMark}`,
        type: "custom",
        startTime: start,
        endTime: end,
        duration,
        depth: 0,
        children: []
      });
    }
    return duration;
  }
  /**
   * Get all sessions.
   */
  getSessions() {
    return [...this.sessions];
  }
  /**
   * Get the last session.
   */
  getLastSession() {
    return this.sessions.length > 0 ? this.sessions[this.sessions.length - 1] : null;
  }
  /**
   * Get profiler statistics.
   */
  getStats() {
    let totalEntries = 0;
    let totalRenderTime = 0;
    let renderCount = 0;
    let slowestComponent = null;
    let slowestTime = 0;
    for (const session of this.sessions) {
      totalEntries += session.entries.length;
      this.collectStats(session.entries, (name, duration) => {
        totalRenderTime += duration;
        renderCount++;
        if (duration > slowestTime) {
          slowestTime = duration;
          slowestComponent = name;
        }
      });
    }
    return {
      sessions: this.sessions.length,
      totalEntries,
      avgRenderTime: renderCount > 0 ? totalRenderTime / renderCount : 0,
      slowestComponent,
      slowestTime
    };
  }
  collectStats(entries, cb) {
    for (const entry of entries) {
      if (entry.type === "component") {
        cb(entry.name, entry.duration);
      }
      if (entry.children.length > 0) {
        this.collectStats(entry.children, cb);
      }
    }
  }
  /**
   * Export session to Chrome DevTools Profiler format.
   */
  exportToDevTools(sessionId) {
    const session = sessionId ? this.sessions.find((s) => s.id === sessionId) : this.sessions[this.sessions.length - 1];
    if (!session) return null;
    const profiles = {};
    const samples = [];
    const timestamps = [];
    const walk = (entry) => {
      profiles[entry.name] = {
        type: entry.type,
        duration: entry.duration,
        startTime: entry.startTime,
        endTime: entry.endTime,
        depth: entry.depth
      };
      samples.push(entry.duration);
      timestamps.push(entry.startTime);
      for (const child of entry.children) walk(child);
    };
    for (const entry of session.entries) walk(entry);
    return {
      profiles,
      samples,
      timestamps,
      startTime: session.startTime,
      endTime: session.endTime,
      totalDuration: session.totalDuration
    };
  }
  /**
   * Enable/disable profiling.
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }
  get isEnabled() {
    return this.enabled;
  }
  /**
   * Set the slow threshold (in ms).
   */
  setSlowThreshold(ms) {
    this.slowThreshold = ms;
  }
  /**
   * Clear all sessions.
   */
  clear() {
    this.sessions = [];
    this.markers.clear();
  }
};
var globalProfiler = null;
function getProfiler() {
  if (!globalProfiler) globalProfiler = new Profiler();
  return globalProfiler;
}
function enableProfiler(enabled = true) {
  getProfiler().setEnabled(enabled);
}
function startProfiling(id) {
  return getProfiler().startSession(id);
}
function endProfiling() {
  return getProfiler().endSession();
}
function getProfilerStats() {
  return getProfiler().getStats();
}

// packages/runtime/tw/provide-inject.ts
var ProviderNode = class _ProviderNode {
  constructor(id, parent = null) {
    __publicField(this, "id");
    __publicField(this, "providers", /* @__PURE__ */ new Map());
    __publicField(this, "parent");
    __publicField(this, "children", /* @__PURE__ */ new Set());
    this.id = id;
    this.parent = parent;
  }
  provide(key, value) {
    this.providers.set(key, {
      value,
      isFactory: false,
      isReactive: false
    });
  }
  provideReactive(key, value) {
    this.providers.set(key, {
      value,
      isFactory: false,
      isReactive: true
    });
  }
  provideFactory(key, factory) {
    this.providers.set(key, {
      value: null,
      isFactory: true,
      factory,
      isReactive: false
    });
  }
  inject(key, defaultValue) {
    const entry = this.findProvider(key);
    if (!entry) return defaultValue;
    if (entry.isFactory && entry.factory) {
      const value = entry.factory();
      entry.value = value;
      entry.isFactory = false;
      return value;
    }
    return entry.value;
  }
  injectReactive(key, defaultValue) {
    const entry = this.findProvider(key);
    if (!entry) {
      return defaultValue !== void 0 ? signal(defaultValue) : void 0;
    }
    return entry.value;
  }
  has(key) {
    return this.findProvider(key) !== null;
  }
  createChild(id) {
    const child = new _ProviderNode(id, this);
    this.children.add(child);
    return child;
  }
  removeChild(child) {
    this.children.delete(child);
  }
  dispose() {
    this.providers.clear();
    if (this.parent) this.parent.removeChild(this);
    for (const child of this.children) child.dispose();
    this.children.clear();
  }
  get providerCount() {
    return this.providers.size;
  }
  get childCount() {
    return this.children.size;
  }
  findProvider(key) {
    if (this.providers.has(key)) return this.providers.get(key);
    if (this.parent) return this.parent.findProvider(key);
    return null;
  }
};
var rootNode = null;
var currentNode = null;
var nodeStack = [];
function initProviderTree() {
  rootNode = new ProviderNode("root");
  currentNode = rootNode;
  return rootNode;
}
function getRootProvider() {
  return rootNode;
}
function getCurrentProvider() {
  return currentNode;
}
function enterScope(componentId) {
  if (!currentNode) initProviderTree();
  const child = currentNode.createChild(componentId);
  nodeStack.push(currentNode);
  currentNode = child;
  return child;
}
function exitScope() {
  if (nodeStack.length > 0) {
    currentNode = nodeStack.pop() || rootNode;
  }
}
function provide(key, value) {
  if (!currentNode) initProviderTree();
  currentNode.provide(key, value);
}
function provideReactive(key, value) {
  if (!currentNode) initProviderTree();
  currentNode.provideReactive(key, value);
}
function provideFactory(key, factory) {
  if (!currentNode) initProviderTree();
  currentNode.provideFactory(key, factory);
}
function inject(key, defaultValue) {
  if (!currentNode) return defaultValue;
  return currentNode.inject(key, defaultValue);
}
function injectReactive(key, defaultValue) {
  if (!currentNode) return defaultValue !== void 0 ? signal(defaultValue) : void 0;
  return currentNode.injectReactive(key, defaultValue);
}
function createInjectionKey(description) {
  return Symbol(description);
}
function disposeProviderTree() {
  if (rootNode) {
    rootNode.dispose();
    rootNode = null;
    currentNode = null;
    nodeStack.length = 0;
  }
}

// packages/runtime/tw/reactivity.ts
var CLIENT_RUNTIME = "tw-vdom-client-v1";
function isReactive(v) {
  return v !== null && typeof v === "object" && v.__isReactive === true;
}
function toBlueprintNode(input) {
  var _a, _b, _c, _d;
  if (typeof input === "string") {
    return {
      tag: "",
      text: input,
      key: "",
      props: {},
      children: [],
      isComponent: false
    };
  }
  const node = input;
  return {
    tag: (_a = node.tag) != null ? _a : "",
    text: (_b = node.text) != null ? _b : "",
    key: node.key != null ? String(node.key) : "",
    props: (_c = node.props) != null ? _c : {},
    children: ((_d = node.children) != null ? _d : []).map(toBlueprintNode),
    isComponent: node.component === true
  };
}
function generateBlueprint(root) {
  const node = toBlueprintNode(root);
  return node;
}
function blueprintToHydrationData(bp, state = {}) {
  return {
    blueprint: bp,
    state
  };
}

// packages/runtime/tw/router.ts
function compilePath(path, caseSensitive = false) {
  const keys = [];
  const normalised = path === "/" ? "/" : path.replace(/\/$/, "");
  const pattern = normalised.replace(/\/$/, "").replace(/\/\*/g, "/(.*)").replace(/:([^/]+)/g, (_m, param) => {
    const [name, mod] = param.split("?");
    const optional = mod === "?";
    keys.push({ name, optional });
    return optional ? `(?:([^/]+))?` : `([^/]+)`;
  });
  const regex = new RegExp(`^${pattern || "/"}$`, caseSensitive ? "" : "i");
  return { record: { path, _keys: keys }, regex, keys };
}
function matchRoute(routes, path) {
  for (const route of routes) {
    const compiled = compilePath(route.path);
    const m = compiled.regex.exec(path);
    if (m) {
      const params = {};
      compiled.keys.forEach((k, i) => {
        const val = m[i + 1];
        if (val !== void 0) params[k.name] = decodeURIComponent(val);
      });
      const matched = [{ ...route, _keys: compiled.keys }];
      const remaining = path.slice(m[0].length);
      if (route.children && remaining) {
        const child = matchRoute(route.children, remaining || "/");
        if (child.matched.length) {
          return { matched: [...matched, ...child.matched], params: { ...params, ...child.params } };
        }
      }
      return { matched, params };
    }
  }
  return { matched: [], params: {} };
}
function parseQuery(search) {
  const query = {};
  const params = new URLSearchParams(search);
  for (const [key, value] of params.entries()) {
    const existing = query[key];
    if (existing === void 0) {
      query[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      query[key] = [existing, value];
    }
  }
  return query;
}
function buildLocation(path, matched, params, search = "", hash = "") {
  const query = parseQuery(search);
  const fullName = matched.length ? matched[matched.length - 1].name : void 0;
  return {
    path,
    query,
    params,
    hash,
    fullPath: path + (search ? `?${search}` : "") + (hash || ""),
    name: fullName,
    matched
  };
}
function createRouter(options) {
  var _a, _b, _c;
  const routes = options.routes;
  const mode = (_a = options.mode) != null ? _a : "history";
  const base = (_b = options.base) != null ? _b : "";
  const guards = [];
  const afterHooks = [];
  const listeners = [];
  const initialPath = (_c = options.initial) != null ? _c : typeof window !== "undefined" ? mode === "hash" ? window.location.hash.slice(1) || "/" : window.location.pathname.slice(base.length) || "/" : "/";
  const initial = resolve(initialPath);
  let current = initial;
  function resolve(path) {
    const [pathPart, searchPart = "", hashPart = ""] = path.split(/(?=[?#])/);
    const cleanPath = pathPart || "/";
    const { matched, params } = matchRoute(routes, cleanPath);
    const search = searchPart.startsWith("?") ? searchPart.slice(1) : "";
    const hash = hashPart.startsWith("#") ? hashPart : "";
    return buildLocation(cleanPath, matched, params, search, hash);
  }
  async function runGuards(to, from) {
    for (const guard of guards) {
      const result = await guard(to, from);
      if (result === false) return false;
      if (typeof result === "string") {
        await push(result);
        return false;
      }
    }
    return true;
  }
  async function push(path) {
    const to = resolve(path);
    const ok = await runGuards(to, current);
    if (!ok) return;
    const from = current;
    current = to;
    if (typeof window !== "undefined" && mode === "history") {
      window.history.pushState({}, "", (base || "") + to.fullPath);
    } else if (typeof window !== "undefined" && mode === "hash") {
      window.location.hash = to.fullPath;
    }
    for (const hook of afterHooks) hook(to, from);
    for (const listener of listeners) listener(to);
  }
  async function replace(path) {
    const to = resolve(path);
    const ok = await runGuards(to, current);
    if (!ok) return;
    const from = current;
    current = to;
    if (typeof window !== "undefined" && mode === "history") {
      window.history.replaceState({}, "", (base || "") + to.fullPath);
    } else if (typeof window !== "undefined" && mode === "hash") {
      window.location.hash = to.fullPath;
    }
    for (const hook of afterHooks) hook(to, from);
    for (const listener of listeners) listener(to);
  }
  function go(delta) {
    if (typeof window !== "undefined") window.history.go(delta);
  }
  function back() {
    go(-1);
  }
  function forward() {
    go(1);
  }
  function beforeEach(guard) {
    guards.push(guard);
    return () => {
      const i = guards.indexOf(guard);
      if (i >= 0) guards.splice(i, 1);
    };
  }
  const beforeResolve = beforeEach;
  function afterEach(hook) {
    afterHooks.push(hook);
    return () => {
      const i = afterHooks.indexOf(hook);
      if (i >= 0) afterHooks.splice(i, 1);
    };
  }
  function subscribe(listener) {
    listeners.push(listener);
    return () => {
      const i = listeners.indexOf(listener);
      if (i >= 0) listeners.splice(i, 1);
    };
  }
  function install(app) {
    var _a2;
    const appObj = app;
    if (appObj.provide) appObj.provide("router", routerInstance);
    if ((_a2 = appObj.config) == null ? void 0 : _a2.globalProperties) {
      appObj.config.globalProperties.$router = routerInstance;
      appObj.config.globalProperties.$route = current;
    }
    if (typeof window !== "undefined") {
      window.addEventListener("popstate", () => {
        const path = mode === "hash" ? window.location.hash.slice(1) || "/" : window.location.pathname.slice(base.length) || "/";
        const next = resolve(path);
        const from = current;
        current = next;
        for (const listener of listeners) listener(next);
        void from;
      });
    }
  }
  const routerInstance = {
    get currentRoute() {
      return current;
    },
    options,
    push,
    replace,
    go,
    back,
    forward,
    beforeResolve,
    beforeEach,
    afterEach,
    resolve,
    subscribe,
    install
  };
  return routerInstance;
}
var activeRouter = null;
function setRouter(router) {
  activeRouter = router;
}
function useRouter() {
  if (activeRouter === null) {
    throw new Error(
      "useRouter() was called but no router is active. Call setRouter(router) or install the router into your app before using useRouter()."
    );
  }
  return activeRouter;
}
function useRoute() {
  return useRouter().currentRoute;
}
function routerLink(props) {
  var _a, _b, _c;
  const router = activeRouter != null ? activeRouter : null;
  const children = (_a = props.children) != null ? _a : [];
  if (!router) {
    const href2 = typeof props.to === "string" ? props.to : props.to.fullPath;
    return h("a", { href: href2 }, ...children);
  }
  const target = typeof props.to === "string" ? router.resolve(props.to) : props.to;
  const href = target.fullPath;
  const isExact = router.currentRoute.path === target.path;
  const isActive = isExact || router.currentRoute.path.startsWith(target.path + "/");
  const onClick2 = (event) => {
    const ev = event;
    if (ev && typeof ev.preventDefault === "function") {
      if (ev.metaKey || ev.ctrlKey || ev.button !== 0) return;
      ev.preventDefault();
      void router.push(href);
    }
  };
  if (props.custom) {
    return h("fragment", null, ...children);
  }
  const className = [
    typeof props.class === "string" ? props.class : "",
    isActive ? (_b = props.activeClass) != null ? _b : "router-link-active" : "",
    isExact ? (_c = props.exactActiveClass) != null ? _c : "router-link-exact-active" : ""
  ].filter(Boolean).join(" ");
  return h("a", { href, class: className, onClick: onClick2 }, ...children);
}
function routerView(props) {
  var _a, _b, _c, _d;
  const router = activeRouter != null ? activeRouter : null;
  if (!router) return null;
  const matched = router.currentRoute.matched;
  if (matched.length === 0) return null;
  const name = (_a = props == null ? void 0 : props.name) != null ? _a : "default";
  const record = [...matched].reverse().find((r) => {
    if (r.components && r.components[name]) return true;
    if (name === "default" && r.component) return true;
    return false;
  });
  if (!record) return null;
  const loader = name === "default" ? (_c = (_b = record.components) == null ? void 0 : _b.default) != null ? _c : record.component : (_d = record.components) == null ? void 0 : _d[name];
  if (!loader) return null;
  const result = loader();
  if (result instanceof Promise) {
    return h("div", { class: "router-view-loading", "data-tw-pending": name });
  }
  const Component = result;
  const routeProps = {
    ...props != null ? props : {},
    route: router.currentRoute
  };
  delete routeProps.name;
  delete routeProps.children;
  return h(Component, routeProps);
}
function navigate(path) {
  return useRouter().push(path);
}
function redirectTo(path) {
  return useRouter().replace(path);
}

// packages/runtime/tw/scheduler.ts
var PRIORITY_RANK = Object.freeze({
  high: 3,
  normal: 2,
  low: 1
});
var lastStats = {
  jobsRun: 0,
  totalJobsRun: 0,
  jobsSkipped: 0,
  timeSpent: 0,
  pending: 0
};
var queues = {
  high: [],
  normal: [],
  low: []
};
var seqCounter = 0;
var flushScheduled = false;
function nextTick(cb) {
  return new Promise((resolve) => {
    queueJob(() => {
      if (cb) {
        try {
          cb();
        } catch (err) {
          reportError(err);
        }
      }
      resolve();
    }, "low");
  });
}
function isScheduled2() {
  return flushScheduled;
}
function peekQueue(priority) {
  const ordered = [];
  if (priority !== void 0) {
    ordered.push(...queues[priority]);
    return ordered;
  }
  ordered.push(...queues.high, ...queues.normal, ...queues.low);
  return ordered;
}
function dedupeInto(bucket, job) {
  if (job.id !== void 0) {
    for (let i = 0; i < bucket.length; i++) {
      if (bucket[i].id === job.id) {
        job.seq = bucket[i].seq;
        bucket[i] = job;
        dedupedSinceFlush++;
        return;
      }
    }
  }
  bucket.push(job);
}
var dedupedSinceFlush = 0;
function queueJob(fn, priority = "normal", id) {
  const job = {
    fn,
    priority,
    seq: seqCounter++,
    id
  };
  switch (priority) {
    case "high":
      dedupeInto(queues.high, job);
      break;
    case "low":
      dedupeInto(queues.low, job);
      break;
    default:
      dedupeInto(queues.normal, job);
      break;
  }
  if (!flushScheduled) {
    scheduleFlush2();
  }
}
function scheduleFlush2() {
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(flush);
}
function jobOrder(a, b) {
  const rankDiff = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
  if (rankDiff !== 0) return rankDiff;
  return a.seq - b.seq;
}
function flush() {
  flushScheduled = false;
  const start = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
  let jobsRun = 0;
  const jobsSkipped = dedupedSinceFlush;
  dedupedSinceFlush = 0;
  let guard = 0;
  while (guard++ < 1e3) {
    const all = [
      ...queues.high,
      ...queues.normal,
      ...queues.low
    ];
    queues.high.length = 0;
    queues.normal.length = 0;
    queues.low.length = 0;
    if (all.length === 0) break;
    all.sort(jobOrder);
    for (let i = 0; i < all.length; i++) {
      const job = all[i];
      try {
        job.fn();
      } catch (err) {
        reportError(err);
      }
      jobsRun++;
    }
  }
  const end = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
  lastStats = {
    jobsRun,
    totalJobsRun: jobsRun,
    jobsSkipped,
    timeSpent: end - start,
    pending: pendingCount()
  };
}
function pendingCount() {
  return queues.high.length + queues.normal.length + queues.low.length;
}
function getStats() {
  return {
    jobsRun: lastStats.jobsRun,
    totalJobsRun: lastStats.jobsRun,
    jobsSkipped: lastStats.jobsSkipped,
    timeSpent: lastStats.timeSpent,
    pending: pendingCount()
  };
}
function resetScheduler() {
  queues.high.length = 0;
  queues.normal.length = 0;
  queues.low.length = 0;
  seqCounter = 0;
  flushScheduled = false;
  lastStats = { jobsRun: 0, totalJobsRun: 0, jobsSkipped: 0, timeSpent: 0, pending: 0 };
}
function reportError(err) {
  const host = globalThis;
  if (typeof host.__twReportError === "function") {
    try {
      host.__twReportError(err);
      return;
    } catch {
    }
  }
  if (typeof console !== "undefined" && typeof console.error === "function") {
    console.error(err);
  }
}
function cancel(id) {
  for (const bucket of [queues.high, queues.normal, queues.low]) {
    const idx = bucket.findIndex((job) => job.id === id);
    if (idx !== -1) {
      bucket.splice(idx, 1);
      return true;
    }
  }
  return false;
}
var autoIdCounter = 0;
function schedule(fn, priority = "normal", id) {
  const jobId = id != null ? id : `__auto_${++autoIdCounter}`;
  queueJob(fn, priority, jobId);
  return jobId;
}
function flushSync() {
  flush();
}

// packages/runtime/tw/service-worker.ts
var ServiceWorkerManager = class {
  constructor(options = {}) {
    __publicField(this, "registration", null);
    __publicField(this, "options");
    __publicField(this, "cacheRules", []);
    __publicField(this, "isRegistered", false);
    /**
     * Unregister the service worker.
     */
    __publicField(this, "listeners", []);
    this.options = {
      swUrl: "/sw.js",
      scope: "/",
      ...options
    };
  }
  /**
   * Register the service worker.
   */
  async register() {
    if (!("serviceWorker" in navigator)) {
      console.warn("[TW SW] Service workers not supported");
      return null;
    }
    try {
      this.registration = await navigator.serviceWorker.register(this.options.swUrl, {
        scope: this.options.scope
      });
      this.isRegistered = true;
      this.setupListeners();
      if (this.options.onSuccess) {
        this.options.onSuccess(this.registration);
      }
      return this.registration;
    } catch (e) {
      if (this.options.onError) {
        this.options.onError(e);
      } else {
        console.error("[TW SW] Registration failed:", e);
      }
      return null;
    }
  }
  async unregister() {
    if (!this.registration) return false;
    const result = await this.registration.unregister();
    this.listeners.forEach(({ target, type, handler }) => target.removeEventListener(type, handler));
    this.listeners = [];
    this.registration = null;
    this.isRegistered = false;
    return result;
  }
  /**
   * Check for updates.
   */
  async update() {
    if (!this.registration) return;
    await this.registration.update();
  }
  /**
   * Skip waiting (activate new SW immediately).
   */
  skipWaiting() {
    var _a;
    if (!((_a = this.registration) == null ? void 0 : _a.waiting)) return;
    this.registration.waiting.postMessage({ type: "SKIP_WAITING" });
  }
  /**
   * Add a cache rule.
   */
  addCacheRule(rule) {
    this.cacheRules.push(rule);
  }
  /**
   * Get cache statistics.
   */
  async getCacheStats() {
    if (!("caches" in window)) {
      return { cacheNames: [], totalEntries: 0, totalSize: 0 };
    }
    const keys = await caches.keys();
    let totalEntries = 0;
    let totalSize = 0;
    for (const name of keys) {
      const cache = await caches.open(name);
      const requests = await cache.keys();
      totalEntries += requests.length;
      totalSize += requests.length * 1e4;
    }
    return {
      cacheNames: keys,
      totalEntries,
      totalSize
    };
  }
  /**
   * Clear a specific cache.
   */
  async clearCache(name) {
    return caches.delete(name);
  }
  /**
   * Clear all caches.
   */
  async clearAllCaches() {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  /**
   * Precache URLs.
   */
  async precache(urls, cacheName = "tw-precache") {
    if (!("caches" in window)) return;
    const cache = await caches.open(cacheName);
    await cache.addAll(urls);
  }
  /**
   * Cache a single URL at runtime.
   */
  async cacheURL(url, cacheName = "tw-runtime") {
    if (!("caches" in window)) return;
    const cache = await caches.open(cacheName);
    const response = await fetch(url);
    cache.put(url, response.clone());
  }
  /**
   * Get the registration status.
   */
  get isReady() {
    return this.isRegistered;
  }
  /**
   * Get the current registration.
   */
  getRegistration() {
    return this.registration;
  }
  // --- Internal ------------------------------------------------------
  setupListeners() {
    if (!this.registration) return;
    this.registration.addEventListener("updatefound", () => {
      if (!this.registration) return;
      const newWorker = this.registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          if (this.options.onUpdateFound) {
            this.options.onUpdateFound(this.registration);
          }
        }
      });
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (this.options.onControllerChange) {
        this.options.onControllerChange();
      }
    });
    window.addEventListener("offline", () => {
      if (this.options.onOffline) this.options.onOffline();
    });
    window.addEventListener("online", () => {
      if (this.options.onOnline) this.options.onOnline();
    });
  }
};
var globalSWManager = null;
function getServiceWorkerManager() {
  if (!globalSWManager) globalSWManager = new ServiceWorkerManager();
  return globalSWManager;
}
async function registerServiceWorker(options) {
  const manager = new ServiceWorkerManager(options);
  return manager.register();
}
async function unregisterServiceWorker() {
  return getServiceWorkerManager().unregister();
}
async function clearServiceWorkerCaches() {
  await getServiceWorkerManager().clearAllCaches();
}
function generateServiceWorkerScript(rules, precacheUrls = []) {
  return `
const PRECACHE = "tw-precache-v1";
const RUNTIME = "tw-runtime-v1";
const PRECACHE_URLS = ${JSON.stringify(precacheUrls)};
const CACHE_RULES = ${JSON.stringify(rules.map((r) => ({ pattern: r.pattern.source, strategy: r.strategy, cacheName: r.cacheName || "tw-runtime-v1" })))};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== PRECACHE && key !== RUNTIME)
          .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  
  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // Find matching cache rule
  const rule = CACHE_RULES.find(r => new RegExp(r.pattern).test(url.pathname));
  if (!rule) return;

  if (rule.strategy === "cache-first") {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(rule.cacheName).then(cache => cache.put(event.request, clone));
        return response;
      }))
    );
  } else if (rule.strategy === "network-first") {
    event.respondWith(
      fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(rule.cacheName).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match(event.request))
    );
  } else if (rule.strategy === "stale-while-revalidate") {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(rule.cacheName).then(cache => cache.put(event.request, clone));
          return response;
        });
        return cached || fetchPromise;
      })
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
`;
}

// packages/runtime/tw/slots.ts
var SlotRegistry = class {
  constructor() {
    __publicField(this, "slots", /* @__PURE__ */ new Map());
    __publicField(this, "currentComponent", "");
  }
  setComponent(componentId) {
    this.currentComponent = componentId;
    if (!this.slots.has(componentId)) this.slots.set(componentId, /* @__PURE__ */ new Map());
  }
  register(name, render, fallback) {
    const componentSlots = this.slots.get(this.currentComponent);
    if (!componentSlots) return;
    componentSlots.set(name, { name, render, fallback });
  }
  registerScoped(name, render, defaultProps) {
    const componentSlots = this.slots.get(this.currentComponent);
    if (!componentSlots) return;
    componentSlots.set(name, { name, render, props: defaultProps });
  }
  renderSlot(name, props) {
    var _a;
    const componentSlots = this.slots.get(this.currentComponent);
    if (!componentSlots) return null;
    const slot = componentSlots.get(name);
    if (!slot) return null;
    try {
      const mergedProps = { ...slot.props, ...props };
      const result = slot.render(mergedProps);
      return result != null ? result : slot.fallback;
    } catch (e) {
      console.error(`[TW Slots] Error rendering slot '${name}':`, e);
      return (_a = slot.fallback) != null ? _a : null;
    }
  }
  hasSlot(name) {
    const componentSlots = this.slots.get(this.currentComponent);
    return componentSlots ? componentSlots.has(name) : false;
  }
  getSlot(name) {
    const componentSlots = this.slots.get(this.currentComponent);
    return componentSlots ? componentSlots.get(name) : void 0;
  }
  getSlotNames() {
    const componentSlots = this.slots.get(this.currentComponent);
    return componentSlots ? Array.from(componentSlots.keys()) : [];
  }
  clearComponent(componentId) {
    this.slots.delete(componentId);
  }
  clearAll() {
    this.slots.clear();
  }
  createContext(componentId) {
    this.setComponent(componentId);
    return {
      slots: this.slots.get(componentId) || /* @__PURE__ */ new Map(),
      hasSlot: (name) => this.hasSlot(name),
      renderSlot: (name, props) => this.renderSlot(name, props),
      getSlotProps: (name) => {
        const slot = this.getSlot(name);
        return (slot == null ? void 0 : slot.props) || {};
      }
    };
  }
};
var globalRegistry2 = new SlotRegistry();
function getSlotRegistry() {
  return globalRegistry2;
}
function useSlots(componentId) {
  return globalRegistry2.createContext(componentId);
}
function defineSlot(name, render, fallback) {
  globalRegistry2.register(name, render, fallback);
}
function defineScopedSlot(name, render, defaultProps) {
  globalRegistry2.registerScoped(name, render, defaultProps);
}
function renderSlot(name, props) {
  return globalRegistry2.renderSlot(name, props);
}
function hasSlot(name) {
  return globalRegistry2.hasSlot(name);
}
function getSlotNames() {
  return globalRegistry2.getSlotNames();
}
function createSlotNode(name = "default", props) {
  return { type: "element", tag: "slot", props: { name, ...props }, children: [] };
}
function createSlotContent(name = "default", content) {
  const children = Array.isArray(content) ? content : [content];
  return { type: "element", tag: "template", props: { slot: name }, children };
}
function resolveSlots(children) {
  var _a;
  const slots = { default: [] };
  for (const child of children) {
    const slotName = ((_a = child.props) == null ? void 0 : _a.slot) || "default";
    if (!slots[slotName]) slots[slotName] = [];
    slots[slotName].push(child);
  }
  return slots;
}
function createFallback(text) {
  return { type: "text", text };
}

// packages/runtime/tw/store.ts
var ReactiveValue = class {
  constructor(initial) {
    __publicField(this, "_value");
    __publicField(this, "_listeners", /* @__PURE__ */ new Set());
    this._value = initial;
  }
  get value() {
    return this._value;
  }
  set(next) {
    if (Object.is(this._value, next)) return;
    this._value = next;
    this._notify();
  }
  update(updater) {
    this.set(updater(this._value));
  }
  subscribe(listener) {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }
  _notify() {
    for (const l of this._listeners) {
      try {
        l();
      } catch {
      }
    }
  }
};
function computed4(deps, fn) {
  const rv = new ReactiveValue(fn());
  for (const dep of deps) {
    dep.subscribe(() => rv.update(fn));
  }
  return rv;
}
var storeRegistry = /* @__PURE__ */ new Map();
function defineStore(idOrDefinition, maybeDefinition) {
  var _a, _b, _c, _d;
  let id;
  let stateFn;
  let getters;
  let actions;
  if (typeof idOrDefinition === "string") {
    id = idOrDefinition;
    stateFn = maybeDefinition == null ? void 0 : maybeDefinition.state;
    getters = (_a = maybeDefinition == null ? void 0 : maybeDefinition.getters) != null ? _a : {};
    actions = (_b = maybeDefinition == null ? void 0 : maybeDefinition.actions) != null ? _b : {};
  } else {
    id = idOrDefinition.id;
    stateFn = idOrDefinition.state;
    getters = (_c = idOrDefinition.getters) != null ? _c : {};
    actions = (_d = idOrDefinition.actions) != null ? _d : {};
  }
  const useStore2 = () => {
    const existing = storeRegistry.get(id);
    if (existing) {
      return existing;
    }
    const initialState = stateFn ? stateFn() : {};
    const reactiveState = {};
    for (const key of Object.keys(initialState)) {
      reactiveState[key] = new ReactiveValue(initialState[key]);
    }
    const getterValues = {};
    const getterDeps = Object.values(reactiveState);
    for (const key of Object.keys(getters)) {
      const getter = getters[key];
      getterValues[key] = computed4(getterDeps, getter);
    }
    const subscribers = /* @__PURE__ */ new Set();
    const actionListeners = /* @__PURE__ */ new Set();
    const eventListeners = /* @__PURE__ */ new Map();
    const ctx = {
      get state() {
        return reactiveState;
      },
      readonly: (rv) => rv.value,
      watch: (rv, cb) => rv.subscribe(() => cb(rv.value)),
      emit: (event, payload) => {
        const set = eventListeners.get(event);
        if (set) for (const cb of set) cb(payload);
      },
      on: (event, cb) => {
        let set = eventListeners.get(event);
        if (!set) {
          set = /* @__PURE__ */ new Set();
          eventListeners.set(event, set);
        }
        set.add(cb);
        return () => set.delete(cb);
      }
    };
    const stateProxy = new Proxy({}, {
      get(_target, prop) {
        var _a2;
        return (_a2 = reactiveState[prop]) == null ? void 0 : _a2.value;
      },
      set(_target, prop, value) {
        if (reactiveState[prop]) {
          reactiveState[prop].set(value);
        } else {
          reactiveState[prop] = new ReactiveValue(value);
        }
        return true;
      }
    });
    const boundActions = {};
    for (const key of Object.keys(actions)) {
      const fn = actions[key];
      boundActions[key] = (...args) => {
        actionListeners.forEach((cb) => cb({ name: key, args }));
        return fn.call(ctx, stateProxy, ...args);
      };
    }
    for (const rv of Object.values(reactiveState)) {
      rv.subscribe(() => {
        subscribers.forEach((l) => l());
      });
    }
    const instance = {
      $id: id,
      $state: initialState,
      $reset: () => {
        var _a2;
        const fresh = stateFn ? stateFn() : {};
        for (const key of Object.keys(fresh)) {
          (_a2 = reactiveState[key]) == null ? void 0 : _a2.set(fresh[key]);
        }
      },
      $subscribe: (listener) => {
        subscribers.add(listener);
        return () => subscribers.delete(listener);
      },
      $onAction: (cb) => {
        actionListeners.add(cb);
        return () => actionListeners.delete(cb);
      }
    };
    for (const key of Object.keys(reactiveState)) {
      Object.defineProperty(instance, key, {
        get: () => reactiveState[key].value,
        set: (v) => reactiveState[key].set(v),
        enumerable: true,
        configurable: true
      });
    }
    for (const key of Object.keys(getterValues)) {
      Object.defineProperty(instance, key, {
        get: () => getterValues[key].value,
        enumerable: true,
        configurable: true
      });
    }
    for (const key of Object.keys(boundActions)) {
      Object.defineProperty(instance, key, {
        value: (...args) => boundActions[key](...args),
        enumerable: true,
        configurable: true,
        writable: true
      });
    }
    storeRegistry.set(id, instance);
    return instance;
  };
  return useStore2;
}
var currentRenderingComponent = null;
function __setRenderingComponent(instance) {
  currentRenderingComponent = instance;
}
function assertInComponent(hookName) {
  if (currentRenderingComponent === null) {
    throw new Error(
      `${hookName}() must be called inside a component render function. It was called outside of any component's render context.`
    );
  }
}
function useStore(useStoreFn) {
  assertInComponent("useStore");
  return useStoreFn();
}
function useStoreAction(useStoreFn, actionName) {
  assertInComponent("useStoreAction");
  const store = useStoreFn();
  const action = store[actionName];
  if (typeof action !== "function") {
    throw new Error(`Action "${String(actionName)}" not found on store.`);
  }
  return action;
}
function createGlobalState(initial) {
  const rv = new ReactiveValue(initial);
  return {
    get: () => rv.value,
    set: (v) => rv.set(v),
    subscribe: (listener) => rv.subscribe(listener)
  };
}

// packages/runtime/tw/theme-manager.ts
var lightTheme = {
  name: "light",
  mode: "light",
  colors: {
    background: "#ffffff",
    foreground: "#0f172a",
    primary: "#3b82f6",
    secondary: "#64748b",
    accent: "#8b5cf6",
    muted: "#f1f5f9",
    success: "#22c55e",
    warning: "#f59e0b",
    error: "#ef4444",
    info: "#0ea5e9",
    surface: "#ffffff",
    surfaceHover: "#f8fafc",
    surfaceActive: "#f1f5f9",
    border: "#e2e8f0",
    textPrimary: "#0f172a",
    textSecondary: "#475569",
    textMuted: "#94a3b8",
    shadow: "rgba(0, 0, 0, 0.1)",
    overlay: "rgba(0, 0, 0, 0.5)"
  },
  radius: "0.5rem",
  spacing: { xs: "0.25rem", sm: "0.5rem", md: "1rem", lg: "1.5rem", xl: "2rem", "2xl": "3rem" },
  fontSize: { xs: "0.75rem", sm: "0.875rem", md: "1rem", lg: "1.125rem", xl: "1.25rem", "2xl": "1.5rem", "3xl": "2rem" },
  fontWeight: { normal: "400", medium: "500", semibold: "600", bold: "700" },
  transition: "color 0.3s ease, background-color 0.3s ease, border-color 0.3s ease"
};
var darkTheme = {
  name: "dark",
  mode: "dark",
  colors: {
    background: "#0f172a",
    foreground: "#f8fafc",
    primary: "#60a5fa",
    secondary: "#94a3b8",
    accent: "#a78bfa",
    muted: "#1e293b",
    success: "#4ade80",
    warning: "#fbbf24",
    error: "#f87171",
    info: "#38bdf8",
    surface: "#1e293b",
    surfaceHover: "#334155",
    surfaceActive: "#475569",
    border: "#334155",
    textPrimary: "#f8fafc",
    textSecondary: "#cbd5e1",
    textMuted: "#64748b",
    shadow: "rgba(0, 0, 0, 0.3)",
    overlay: "rgba(0, 0, 0, 0.7)"
  },
  radius: "0.5rem",
  spacing: lightTheme.spacing,
  fontSize: lightTheme.fontSize,
  fontWeight: lightTheme.fontWeight,
  transition: lightTheme.transition
};
var ThemeManager = class {
  constructor(options = {}) {
    __publicField(this, "mode");
    __publicField(this, "systemPreference");
    __publicField(this, "currentTheme");
    __publicField(this, "options");
    __publicField(this, "customThemes", /* @__PURE__ */ new Map());
    __publicField(this, "root", null);
    this.options = {
      defaultMode: "auto",
      storageKey: "tw-theme",
      enableTransitions: true,
      transitionDuration: 300,
      customThemes: {},
      ...options
    };
    let savedMode = this.options.defaultMode;
    try {
      const saved = localStorage.getItem(this.options.storageKey);
      if (saved && ["light", "dark", "auto"].includes(saved)) savedMode = saved;
    } catch {
    }
    this.mode = signal(savedMode);
    let sysPref = "light";
    try {
      sysPref = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {
    }
    this.systemPreference = signal(sysPref);
    this.currentTheme = computed(() => {
      const m = this.mode();
      const sys = this.systemPreference();
      const effectiveMode = m === "auto" ? sys : m;
      return effectiveMode === "dark" ? darkTheme : lightTheme;
    });
    for (const [name, theme] of Object.entries(this.options.customThemes)) {
      this.customThemes.set(name, theme);
    }
    try {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
        this.systemPreference.set(e.matches ? "dark" : "light");
      });
    } catch {
    }
    effect(() => {
      const theme = this.currentTheme();
      this.applyThemeToDOM(theme);
    });
  }
  /**
   * Get the current theme mode.
   */
  getMode() {
    return this.mode.peek();
  }
  /**
   * Get the current theme mode (reactive).
   */
  get modeSignal() {
    return this.mode;
  }
  /**
   * Get the current theme (reactive).
   */
  get theme() {
    return this.currentTheme;
  }
  /**
   * Set the theme mode.
   */
  setMode(mode) {
    this.mode.set(mode);
    try {
      localStorage.setItem(this.options.storageKey, mode);
    } catch {
    }
  }
  /**
   * Toggle between light and dark.
   */
  toggle() {
    const current = this.mode.peek();
    const effective = current === "auto" ? this.systemPreference.peek() : current;
    this.setMode(effective === "dark" ? "light" : "dark");
  }
  /**
   * Check if dark mode is active.
   */
  isDark() {
    const m = this.mode.peek();
    const effective = m === "auto" ? this.systemPreference.peek() : m;
    return effective === "dark";
  }
  /**
   * Register a custom theme.
   */
  registerCustomTheme(name, theme) {
    this.customThemes.set(name, theme);
  }
  /**
   * Get a custom theme by name.
   */
  getCustomTheme(name) {
    return this.customThemes.get(name);
  }
  /**
   * Apply a custom theme.
   */
  applyCustomTheme(name) {
    const theme = this.customThemes.get(name);
    if (theme) this.applyThemeToDOM(theme);
  }
  /**
   * Apply theme to DOM (CSS variables).
   */
  applyThemeToDOM(theme) {
    if (typeof document === "undefined") return;
    if (!this.root) {
      this.root = document.documentElement;
    }
    if (this.options.enableTransitions) {
      this.root.style.setProperty("transition", theme.transition);
    }
    this.root.setAttribute("data-theme", theme.name);
    for (const [key, value] of Object.entries(theme.colors)) {
      const cssVar = `--tw-${this.kebabCase(key)}`;
      this.root.style.setProperty(cssVar, value);
    }
    this.root.style.setProperty("--tw-radius", theme.radius);
    for (const [key, value] of Object.entries(theme.spacing)) {
      this.root.style.setProperty(`--tw-spacing-${key}`, value);
    }
    for (const [key, value] of Object.entries(theme.fontSize)) {
      this.root.style.setProperty(`--tw-font-size-${key}`, value);
    }
    for (const [key, value] of Object.entries(theme.fontWeight)) {
      this.root.style.setProperty(`--tw-font-weight-${key}`, value);
    }
  }
  /**
   * Generate CSS string for the current theme.
   */
  generateCSS() {
    const theme = this.currentTheme.peek();
    let css = `:root {
`;
    for (const [key, value] of Object.entries(theme.colors)) {
      css += `  --tw-${this.kebabCase(key)}: ${value};
`;
    }
    css += `  --tw-radius: ${theme.radius};
`;
    for (const [key, value] of Object.entries(theme.spacing)) {
      css += `  --tw-spacing-${key}: ${value};
`;
    }
    for (const [key, value] of Object.entries(theme.fontSize)) {
      css += `  --tw-font-size-${key}: ${value};
`;
    }
    css += `}
`;
    return css;
  }
  /**
   * Destroy the theme manager.
   */
  destroy() {
    this.root = null;
  }
  kebabCase(str) {
    return str.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
  }
};
var globalThemeManager = null;
function getThemeManager() {
  if (!globalThemeManager) globalThemeManager = new ThemeManager();
  return globalThemeManager;
}
function initTheme(options) {
  if (globalThemeManager) globalThemeManager.destroy();
  globalThemeManager = new ThemeManager(options);
  return globalThemeManager;
}
function useTheme() {
  return getThemeManager().theme;
}
function useThemeMode() {
  return getThemeManager().modeSignal;
}
function setThemeMode(mode) {
  getThemeManager().setMode(mode);
}
function toggleTheme() {
  getThemeManager().toggle();
}
function isDarkMode() {
  return getThemeManager().isDark();
}

// packages/runtime/tw/toast-notifications.ts
var ToastManager = class {
  constructor() {
    __publicField(this, "clickHandlers", []);
    __publicField(this, "toasts", []);
    __publicField(this, "containers", /* @__PURE__ */ new Map());
    __publicField(this, "maxVisible", 5);
    __publicField(this, "defaultDuration", 4e3);
    __publicField(this, "defaultPosition", "top-right");
    __publicField(this, "idCounter", 0);
    this.createContainers();
  }
  /**
   * Show a toast notification.
   */
  show(options) {
    var _a, _b, _c;
    const id = options.id || `toast-${++this.idCounter}`;
    const entry = {
      id,
      type: options.type || "default",
      title: options.title,
      message: options.message,
      duration: (_a = options.duration) != null ? _a : this.defaultDuration,
      position: options.position || this.defaultPosition,
      dismissible: (_b = options.dismissible) != null ? _b : true,
      showProgress: (_c = options.showProgress) != null ? _c : false,
      action: options.action,
      priority: options.priority || "normal",
      createdAt: Date.now(),
      element: null,
      timer: null,
      onClose: options.onClose,
      onClick: options.onClick
    };
    if (entry.priority === "high") {
      this.toasts.unshift(entry);
    } else {
      this.toasts.push(entry);
    }
    while (this.toasts.length > this.maxVisible) {
      const removed = this.toasts.pop();
      if (removed) this.removeToastElement(removed);
    }
    this.renderToast(entry);
    if (entry.duration > 0) {
      entry.timer = setTimeout(() => this.dismiss(id), entry.duration);
    }
    return id;
  }
  /**
   * Show a success toast.
   */
  success(message, options) {
    return this.show({ ...options, message, type: "success" });
  }
  /**
   * Show an error toast.
   */
  error(message, options) {
    var _a;
    return this.show({ ...options, message, type: "error", duration: (_a = options == null ? void 0 : options.duration) != null ? _a : 6e3 });
  }
  /**
   * Show a warning toast.
   */
  warning(message, options) {
    var _a;
    return this.show({ ...options, message, type: "warning", duration: (_a = options == null ? void 0 : options.duration) != null ? _a : 5e3 });
  }
  /**
   * Show an info toast.
   */
  info(message, options) {
    return this.show({ ...options, message, type: "info" });
  }
  /**
   * Dismiss a toast by ID.
   */
  dismiss(id) {
    const idx = this.toasts.findIndex((t2) => t2.id === id);
    if (idx < 0) return;
    const entry = this.toasts[idx];
    this.toasts.splice(idx, 1);
    if (entry.timer) clearTimeout(entry.timer);
    this.removeToastElement(entry);
    if (entry.onClose) entry.onClose();
  }
  /**
   * Dismiss all toasts.
   */
  destroy() {
    this.clickHandlers.forEach(({ element, handler }) => element.removeEventListener("click", handler));
    this.clickHandlers = [];
    this.dismissAll();
  }
  dismissAll() {
    for (const entry of [...this.toasts]) {
      this.dismiss(entry.id);
    }
  }
  /**
   * Get all active toasts.
   */
  getActive() {
    return [...this.toasts];
  }
  /**
   * Set the maximum number of visible toasts.
   */
  setMaxVisible(max) {
    this.maxVisible = max;
  }
  // --- Internal ------------------------------------------------------
  createContainers() {
    if (typeof document === "undefined") return;
    const positions = [
      "top-left",
      "top-right",
      "top-center",
      "bottom-left",
      "bottom-right",
      "bottom-center"
    ];
    for (const position of positions) {
      const container = document.createElement("div");
      container.className = `tw-toast-container tw-toast-${position}`;
      container.style.cssText = this.getContainerStyle(position);
      document.body.appendChild(container);
      this.containers.set(position, container);
    }
  }
  renderToast(entry) {
    const container = this.containers.get(entry.position);
    if (!container) return;
    const el = document.createElement("div");
    el.className = `tw-toast tw-toast-${entry.type}`;
    el.style.cssText = this.getToastStyle(entry.type);
    el.setAttribute("data-toast-id", entry.id);
    if (entry.title) {
      const titleEl = document.createElement("div");
      titleEl.className = "tw-toast-title";
      titleEl.style.cssText = "font-weight:600;font-size:0.875rem;margin-bottom:4px;";
      titleEl.textContent = entry.title;
      el.appendChild(titleEl);
    }
    const msgEl = document.createElement("div");
    msgEl.className = "tw-toast-message";
    msgEl.style.cssText = "font-size:0.875rem;color:inherit;";
    msgEl.textContent = entry.message;
    el.appendChild(msgEl);
    if (entry.action) {
      const btn = document.createElement("button");
      btn.className = "tw-toast-action";
      btn.style.cssText = "margin-top:8px;padding:4px 12px;border:none;border-radius:4px;cursor:pointer;font-size:0.8125rem;background:rgba(255,255,255,0.2);color:inherit;";
      btn.textContent = entry.action.label;
      btn.onclick = () => {
        entry.action.handler();
        this.dismiss(entry.id);
      };
      el.appendChild(btn);
    }
    if (entry.dismissible) {
      const closeBtn = document.createElement("button");
      closeBtn.className = "tw-toast-close";
      closeBtn.style.cssText = "position:absolute;top:8px;right:8px;background:none;border:none;cursor:pointer;font-size:1.25rem;color:inherit;opacity:0.7;padding:0 4px;";
      closeBtn.textContent = "\xD7";
      closeBtn.onclick = () => this.dismiss(entry.id);
      el.appendChild(closeBtn);
    }
    if (entry.showProgress && entry.duration > 0) {
      const progress = document.createElement("div");
      progress.className = "tw-toast-progress";
      progress.style.cssText = "position:absolute;bottom:0;left:0;height:3px;background:rgba(255,255,255,0.5);transition:width linear;";
      progress.style.transitionDuration = `${entry.duration}ms`;
      el.appendChild(progress);
      requestAnimationFrame(() => {
        progress.style.width = "0%";
      });
    }
    if (entry.onClick) {
      el.style.cursor = "pointer";
      el.addEventListener("click", (e) => {
        if (!e.target.classList.contains("tw-toast-close") && !e.target.classList.contains("tw-toast-action")) {
          entry.onClick();
        }
      });
    }
    el.style.opacity = "0";
    el.style.transform = "translateY(-10px)";
    el.style.transition = "opacity 0.3s ease, transform 0.3s ease";
    container.appendChild(el);
    entry.element = el;
    requestAnimationFrame(() => {
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    });
  }
  removeToastElement(entry) {
    if (!entry.element) return;
    const el = entry.element;
    el.style.opacity = "0";
    el.style.transform = "translateY(-10px)";
    setTimeout(() => {
      el.remove();
    }, 300);
    entry.element = null;
  }
  getContainerStyle(position) {
    const base = "position:fixed;z-index:9999;display:flex;flex-direction:column;gap:8px;padding:1rem;pointer-events:none;max-width:400px;";
    const positions = {
      "top-left": base + "top:0;left:0;",
      "top-right": base + "top:0;right:0;",
      "top-center": base + "top:0;left:50%;transform:translateX(-50%);",
      "bottom-left": base + "bottom:0;left:0;",
      "bottom-right": base + "bottom:0;right:0;",
      "bottom-center": base + "bottom:0;left:50%;transform:translateX(-50%);"
    };
    return positions[position] || positions["top-right"];
  }
  getToastStyle(type) {
    const styles = {
      success: "position:relative;background:#22c55e;color:#fff;padding:12px 16px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);pointer-events:auto;min-width:280px;",
      error: "position:relative;background:#ef4444;color:#fff;padding:12px 16px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);pointer-events:auto;min-width:280px;",
      warning: "position:relative;background:#f59e0b;color:#fff;padding:12px 16px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);pointer-events:auto;min-width:280px;",
      info: "position:relative;background:#0ea5e9;color:#fff;padding:12px 16px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);pointer-events:auto;min-width:280px;",
      default: "position:relative;background:#1e293b;color:#fff;padding:12px 16px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);pointer-events:auto;min-width:280px;"
    };
    return styles[type] || styles.default;
  }
};
var globalToastManager = null;
function getToastManager() {
  if (!globalToastManager) globalToastManager = new ToastManager();
  return globalToastManager;
}
function toast(message, options) {
  return getToastManager().show({ message, ...options });
}
function toastSuccess(message, options) {
  return getToastManager().success(message, options);
}
function toastError(message, options) {
  return getToastManager().error(message, options);
}
function toastWarning(message, options) {
  return getToastManager().warning(message, options);
}
function toastInfo(message, options) {
  return getToastManager().info(message, options);
}
function dismissToast(id) {
  getToastManager().dismiss(id);
}
function dismissAllToasts() {
  getToastManager().dismissAll();
}

// packages/runtime/tw/transitions.ts
var TransitionManager = class {
  constructor(root) {
    __publicField(this, "root");
    __publicField(this, "definitions", /* @__PURE__ */ new Map());
    __publicField(this, "activeTransitions", /* @__PURE__ */ new Map());
    __publicField(this, "flipRecords", /* @__PURE__ */ new Map());
    __publicField(this, "transitionId", 0);
    this.root = root;
  }
  define(name, definition) {
    this.definitions.set(name, definition);
  }
  undefine(name) {
    this.definitions.delete(name);
  }
  has(name) {
    return this.definitions.has(name);
  }
  applyEnter(element, name, appearing = false) {
    const def = this.definitions.get(name);
    if (!def) return Promise.resolve();
    return new Promise((resolve) => {
      if (def.onBeforeEnter) def.onBeforeEnter(element);
      const styles = appearing && !def.appear ? null : def;
      if (!styles) {
        resolve();
        return;
      }
      const state = {
        active: true,
        element,
        name,
        phase: "enter",
        startTime: typeof performance !== "undefined" ? performance.now() : Date.now(),
        finishTime: (typeof performance !== "undefined" ? performance.now() : Date.now()) + (def.duration || 300)
      };
      this.activeTransitions.set(element, state);
      this.applyStyles(element, def.enter);
      void element.offsetHeight;
      this.applyStyles(element, def.enterActive);
      requestAnimationFrame(() => {
        this.applyStyles(element, def.enterTo);
        this.removeStyles(element, def.enter);
        const duration = def.duration || 300;
        const delay = def.delay || 0;
        setTimeout(() => {
          this.removeStyles(element, def.enterActive);
          this.removeStyles(element, def.enterTo);
          if (def.onAfterEnter) def.onAfterEnter(element);
          this.activeTransitions.delete(element);
          resolve();
        }, duration + delay);
      });
      if (def.onEnter) def.onEnter(element, () => {
        this.activeTransitions.delete(element);
        resolve();
      });
    });
  }
  applyLeave(element, name) {
    const def = this.definitions.get(name);
    if (!def) return Promise.resolve();
    return new Promise((resolve) => {
      if (def.onBeforeLeave) def.onBeforeLeave(element);
      const state = {
        active: true,
        element,
        name,
        phase: "leave",
        startTime: typeof performance !== "undefined" ? performance.now() : Date.now(),
        finishTime: (typeof performance !== "undefined" ? performance.now() : Date.now()) + (def.duration || 300)
      };
      this.activeTransitions.set(element, state);
      this.applyStyles(element, def.leaveActive);
      requestAnimationFrame(() => {
        this.applyStyles(element, def.leave);
        this.applyStyles(element, def.leaveTo);
        const duration = def.duration || 300;
        setTimeout(() => {
          this.removeStyles(element, def.leaveActive);
          this.removeStyles(element, def.leave);
          this.removeStyles(element, def.leaveTo);
          if (def.onAfterLeave) def.onAfterLeave(element);
          this.activeTransitions.delete(element);
          resolve();
        }, duration);
      });
      if (def.onLeave) def.onLeave(element, () => {
        this.activeTransitions.delete(element);
        resolve();
      });
    });
  }
  async swap(oldEl, newEl, name, mode = "default") {
    const def = this.definitions.get(name);
    if (!def) {
      oldEl.remove();
      if (oldEl.parentElement) oldEl.parentElement.insertBefore(newEl, oldEl);
      return;
    }
    if (mode === "out-in") {
      await this.applyLeave(oldEl, name);
      oldEl.remove();
      if (oldEl.parentElement) oldEl.parentElement.insertBefore(newEl, oldEl);
      await this.applyEnter(newEl, name);
    } else if (mode === "in-out") {
      if (oldEl.parentElement) oldEl.parentElement.insertBefore(newEl, oldEl);
      await this.applyEnter(newEl, name);
      await this.applyLeave(oldEl, name);
      oldEl.remove();
    } else {
      if (oldEl.parentElement) oldEl.parentElement.insertBefore(newEl, oldEl.nextSibling);
      await Promise.all([this.applyEnter(newEl, name), this.applyLeave(oldEl, name)]);
      oldEl.remove();
    }
  }
  // --- FLIP Animation ------------------------------------------------
  recordFirst(elements, id) {
    const records = [];
    for (const el of elements) {
      records.push({ element: el, firstRect: el.getBoundingClientRect(), firstStyle: window.getComputedStyle(el) });
    }
    this.flipRecords.set(id, records);
  }
  playFlip(id, duration = 300, easing = "cubic-bezier(0.2, 0, 0.2, 1)") {
    const records = this.flipRecords.get(id);
    if (!records) return;
    records.forEach((record) => {
      const { element, firstRect } = record;
      const lastRect = element.getBoundingClientRect();
      const dx = firstRect.left - lastRect.left;
      const dy = firstRect.top - lastRect.top;
      const dw = firstRect.width / lastRect.width;
      const dh = firstRect.height / lastRect.height;
      if (dx === 0 && dy === 0 && dw === 1 && dh === 1) return;
      element.style.transformOrigin = "top left";
      element.style.transform = `translate(${dx}px, ${dy}px) scale(${dw}, ${dh})`;
      element.style.transition = "none";
      requestAnimationFrame(() => {
        element.style.transition = `transform ${duration}ms ${easing}`;
        element.style.transform = "";
      });
      setTimeout(() => {
        element.style.transition = "";
        element.style.transform = "";
        element.style.transformOrigin = "";
      }, duration + 50);
    });
    this.flipRecords.delete(id);
  }
  playFlipStagger(id, staggerDelay = 50, duration = 300) {
    const records = this.flipRecords.get(id);
    if (!records) return;
    records.forEach((record, index) => {
      setTimeout(() => {
        const { element, firstRect } = record;
        const lastRect = element.getBoundingClientRect();
        const dx = firstRect.left - lastRect.left;
        const dy = firstRect.top - lastRect.top;
        if (dx === 0 && dy === 0) return;
        element.style.transition = "none";
        element.style.transform = `translate(${dx}px, ${dy}px)`;
        requestAnimationFrame(() => {
          element.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0, 0.2, 1)`;
          element.style.transform = "";
        });
        setTimeout(() => {
          element.style.transition = "";
          element.style.transform = "";
        }, duration + 50);
      }, index * staggerDelay);
    });
    this.flipRecords.delete(id);
  }
  // --- List Transitions ----------------------------------------------
  async transitionList(container, newEls, oldEls, name, stagger = 0) {
    const promises = [];
    for (let i = 0; i < newEls.length; i++) {
      container.appendChild(newEls[i]);
      if (stagger > 0) await new Promise((r) => setTimeout(r, stagger));
      promises.push(this.applyEnter(newEls[i], name));
    }
    for (let i = 0; i < oldEls.length; i++) {
      if (stagger > 0) await new Promise((r) => setTimeout(r, stagger));
      promises.push(this.applyLeave(oldEls[i], name).then(() => oldEls[i].remove()));
    }
    await Promise.all(promises);
  }
  async transitionRoute(container, newView, name, mode = "out-in") {
    const oldView = container.firstElementChild;
    if (!oldView) {
      container.appendChild(newView);
      await this.applyEnter(newView, name);
      return;
    }
    await this.swap(oldView, newView, name, mode);
  }
  // --- CSS Class-based -----------------------------------------------
  applyClassEnter(element, name) {
    return new Promise((resolve) => {
      element.classList.add(`${name}-enter`);
      void element.offsetHeight;
      element.classList.add(`${name}-enter-active`);
      requestAnimationFrame(() => {
        element.classList.remove(`${name}-enter`);
        element.classList.add(`${name}-enter-to`);
        const onEnd = () => {
          element.classList.remove(`${name}-enter-active`);
          element.classList.remove(`${name}-enter-to`);
          element.removeEventListener("transitionend", onEnd);
          resolve();
        };
        element.addEventListener("transitionend", onEnd, { once: true });
        setTimeout(onEnd, 1e3);
      });
    });
  }
  applyClassLeave(element, name) {
    return new Promise((resolve) => {
      element.classList.add(`${name}-leave`);
      void element.offsetHeight;
      element.classList.add(`${name}-leave-active`);
      requestAnimationFrame(() => {
        element.classList.remove(`${name}-leave`);
        element.classList.add(`${name}-leave-to`);
        const onEnd = () => {
          element.classList.remove(`${name}-leave-active`);
          element.classList.remove(`${name}-leave-to`);
          element.removeEventListener("transitionend", onEnd);
          resolve();
        };
        element.addEventListener("transitionend", onEnd, { once: true });
        setTimeout(onEnd, 1e3);
      });
    });
  }
  isTransitioning(element) {
    return this.activeTransitions.has(element);
  }
  cancel(element) {
    if (this.activeTransitions.has(element)) {
      element.style.transition = "";
      element.style.transform = "";
      this.activeTransitions.delete(element);
    }
  }
  cancelAll() {
    for (const [el] of this.activeTransitions) {
      el.style.transition = "";
      el.style.transform = "";
    }
    this.activeTransitions.clear();
  }
  getActive() {
    return Array.from(this.activeTransitions.values());
  }
  destroy() {
    this.cancelAll();
    this.definitions.clear();
    this.flipRecords.clear();
  }
  // --- Private ------------------------------------------------------
  applyStyles(el, styles) {
    if (!styles) return;
    for (const [key, value] of Object.entries(styles)) el.style.setProperty(this.camelToKebab(key), value);
  }
  removeStyles(el, styles) {
    if (!styles) return;
    for (const key of Object.keys(styles)) el.style.removeProperty(this.camelToKebab(key));
  }
  camelToKebab(str) {
    return str.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
  }
};
function createBuiltinTransitions() {
  return {
    fade: {
      enter: { opacity: "0" },
      enterActive: { transition: "opacity 0.3s ease" },
      enterTo: { opacity: "1" },
      leave: { opacity: "1" },
      leaveActive: { transition: "opacity 0.3s ease" },
      leaveTo: { opacity: "0" },
      appear: true
    },
    "fade-slide": {
      enter: { opacity: "0", transform: "translateY(20px)" },
      enterActive: { transition: "opacity 0.3s ease, transform 0.3s ease" },
      enterTo: { opacity: "1", transform: "translateY(0)" },
      leave: { opacity: "1", transform: "translateY(0)" },
      leaveActive: { transition: "opacity 0.3s ease, transform 0.3s ease" },
      leaveTo: { opacity: "0", transform: "translateY(-20px)" },
      appear: true
    },
    scale: {
      enter: { opacity: "0", transform: "scale(0.9)" },
      enterActive: { transition: "opacity 0.3s ease, transform 0.3s ease" },
      enterTo: { opacity: "1", transform: "scale(1)" },
      leave: { opacity: "1", transform: "scale(1)" },
      leaveActive: { transition: "opacity 0.3s ease, transform 0.3s ease" },
      leaveTo: { opacity: "0", transform: "scale(1.1)" },
      appear: true
    },
    slide: {
      enter: { transform: "translateX(100%)" },
      enterActive: { transition: "transform 0.3s ease" },
      enterTo: { transform: "translateX(0)" },
      leave: { transform: "translateX(0)" },
      leaveActive: { transition: "transform 0.3s ease" },
      leaveTo: { transform: "translateX(-100%)" }
    },
    "slide-left": {
      enter: { transform: "translateX(100%)" },
      enterActive: { transition: "transform 0.3s ease" },
      enterTo: { transform: "translateX(0)" },
      leave: { transform: "translateX(0)" },
      leaveActive: { transition: "transform 0.3s ease" },
      leaveTo: { transform: "translateX(-100%)" }
    },
    "slide-right": {
      enter: { transform: "translateX(-100%)" },
      enterActive: { transition: "transform 0.3s ease" },
      enterTo: { transform: "translateX(0)" },
      leave: { transform: "translateX(0)" },
      leaveActive: { transition: "transform 0.3s ease" },
      leaveTo: { transform: "translateX(100%)" }
    },
    "slide-up": {
      enter: { transform: "translateY(100%)" },
      enterActive: { transition: "transform 0.3s ease" },
      enterTo: { transform: "translateY(0)" },
      leave: { transform: "translateY(0)" },
      leaveActive: { transition: "transform 0.3s ease" },
      leaveTo: { transform: "translateY(-100%)" }
    },
    "slide-down": {
      enter: { transform: "translateY(-100%)" },
      enterActive: { transition: "transform 0.3s ease" },
      enterTo: { transform: "translateY(0)" },
      leave: { transform: "translateY(0)" },
      leaveActive: { transition: "transform 0.3s ease" },
      leaveTo: { transform: "translateY(100%)" }
    },
    zoom: {
      enter: { opacity: "0", transform: "scale(0)" },
      enterActive: { transition: "opacity 0.3s ease, transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)" },
      enterTo: { opacity: "1", transform: "scale(1)" },
      leave: { opacity: "1", transform: "scale(1)" },
      leaveActive: { transition: "opacity 0.3s ease, transform 0.3s ease" },
      leaveTo: { opacity: "0", transform: "scale(0)" },
      appear: true
    },
    collapse: {
      enter: { maxHeight: "0", overflow: "hidden" },
      enterActive: { transition: "max-height 0.3s ease" },
      enterTo: { maxHeight: "1000px" },
      leave: { maxHeight: "1000px", overflow: "hidden" },
      leaveActive: { transition: "max-height 0.3s ease" },
      leaveTo: { maxHeight: "0" }
    },
    bounce: {
      enter: { opacity: "0", transform: "scale(0.3)" },
      enterActive: { animation: "tw-bounce-in 0.6s ease", opacity: "1", transform: "scale(1)" },
      leave: { opacity: "1", transform: "scale(1)" },
      leaveActive: { animation: "tw-bounce-out 0.4s ease", opacity: "0" },
      appear: true
    }
  };
}
function createTransitionManager(root) {
  const manager = new TransitionManager(root);
  for (const [name, def] of Object.entries(createBuiltinTransitions())) manager.define(name, def);
  return manager;
}
var globalTransitionManager = null;
function getTransitionManager() {
  return globalTransitionManager;
}
function initTransitionManager(root) {
  if (globalTransitionManager) globalTransitionManager.destroy();
  globalTransitionManager = createTransitionManager(root);
  return globalTransitionManager;
}

// packages/runtime/tw/virtual-list.ts
var VirtualList = class {
  constructor(container, options) {
    __publicField(this, "container");
    __publicField(this, "options");
    __publicField(this, "contentEl");
    __publicField(this, "items", /* @__PURE__ */ new Map());
    __publicField(this, "recycled", []);
    __publicField(this, "measurements", /* @__PURE__ */ new Map());
    __publicField(this, "totalHeight", 0);
    __publicField(this, "visibleRange", { start: 0, end: 0, offset: 0 });
    __publicField(this, "scrollRAF", null);
    __publicField(this, "resizeObserver", null);
    __publicField(this, "lastScrollTop", 0);
    __publicField(this, "isLoadingMore", false);
    __publicField(this, "poolSize");
    __publicField(this, "handleScroll", () => {
      if (this.scrollRAF !== null) return;
      this.scrollRAF = requestAnimationFrame(() => {
        this.scrollRAF = null;
        this.onScroll();
      });
    });
    this.container = container;
    this.options = { overscan: 5, estimatedItemHeight: 40, gap: 0, smoothScroll: false, poolSize: 50, ...options };
    this.poolSize = this.options.poolSize;
    container.style.overflow = "auto";
    container.style.position = "relative";
    container.style.willChange = "scroll-position";
    this.contentEl = document.createElement("div");
    this.contentEl.style.position = "relative";
    this.contentEl.style.width = "100%";
    container.appendChild(this.contentEl);
    if (options.stickyHeader) {
      options.stickyHeader.style.position = "sticky";
      options.stickyHeader.style.top = "0";
      options.stickyHeader.style.zIndex = "10";
      this.contentEl.appendChild(options.stickyHeader);
    }
    if (options.stickyFooter) {
      options.stickyFooter.style.position = "sticky";
      options.stickyFooter.style.bottom = "0";
      options.stickyFooter.style.zIndex = "10";
      this.contentEl.appendChild(options.stickyFooter);
    }
    if (options.itemHeight && options.itemHeight > 0) {
      this.precalculateFixedHeights();
    }
  }
  render() {
    this.updateTotalHeight();
    this.contentEl.style.height = `${this.totalHeight}px`;
    this.updateVisibleItems();
  }
  scrollToItem(index, align = "start") {
    if (index < 0 || index >= this.options.itemCount) return;
    const m = this.getMeasurement(index);
    let scrollTop;
    switch (align) {
      case "center":
        scrollTop = m.top - this.container.clientHeight / 2 + m.height / 2;
        break;
      case "end":
        scrollTop = m.bottom - this.container.clientHeight;
        break;
      default:
        scrollTop = m.top;
    }
    this.container.scrollTo({ top: Math.max(0, scrollTop), behavior: this.options.smoothScroll ? "smooth" : "auto" });
  }
  scrollToPosition(position) {
    this.container.scrollTo({ top: Math.max(0, position), behavior: this.options.smoothScroll ? "smooth" : "auto" });
  }
  getScrollPosition() {
    return this.container.scrollTop;
  }
  getFirstVisibleIndex() {
    return this.visibleRange.start;
  }
  getLastVisibleIndex() {
    return this.visibleRange.end;
  }
  setItemCount(count) {
    this.options.itemCount = count;
    if (this.options.itemHeight && this.options.itemHeight > 0) this.precalculateFixedHeights();
    this.render();
  }
  setRenderItem(renderFn) {
    this.options.renderItem = renderFn;
    this.render();
  }
  remeasure() {
    this.measurements.clear();
    if (this.options.itemHeight && this.options.itemHeight > 0) this.precalculateFixedHeights();
    this.render();
  }
  attachScrollListener() {
    this.container.addEventListener("scroll", this.handleScroll, { passive: true });
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.render());
      this.resizeObserver.observe(this.container);
    }
  }
  detach() {
    this.container.removeEventListener("scroll", this.handleScroll);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.scrollRAF !== null) {
      cancelAnimationFrame(this.scrollRAF);
      this.scrollRAF = null;
    }
  }
  destroy() {
    this.detach();
    this.items.clear();
    this.recycled = [];
    this.measurements.clear();
    this.contentEl.remove();
  }
  getStats() {
    return {
      totalItems: this.options.itemCount,
      renderedItems: this.items.size,
      recycledItems: this.recycled.length,
      totalHeight: this.totalHeight,
      visibleHeight: this.container.clientHeight,
      scrollPercentage: this.totalHeight > 0 ? this.container.scrollTop / (this.totalHeight - this.container.clientHeight) * 100 : 0
    };
  }
  // --- Internal ------------------------------------------------------
  precalculateFixedHeights() {
    const height = this.options.itemHeight || 40;
    const gap = this.options.gap || 0;
    this.measurements.clear();
    let top = 0;
    for (let i = 0; i < this.options.itemCount; i++) {
      this.measurements.set(i, { height, top, bottom: top + height });
      top += height + gap;
    }
    this.totalHeight = top;
  }
  estimateMeasurement(index) {
    const height = this.options.estimatedItemHeight || 40;
    const gap = this.options.gap || 0;
    let top = index * (height + gap);
    return { height, top, bottom: top + height };
  }
  getMeasurement(index) {
    return this.measurements.get(index) || this.estimateMeasurement(index);
  }
  updateTotalHeight() {
    if (this.options.itemHeight && this.options.itemHeight > 0) {
      const gap = this.options.gap || 0;
      this.totalHeight = this.options.itemCount * (this.options.itemHeight + gap) - gap;
    } else {
      let maxBottom = 0;
      for (const m of this.measurements.values()) {
        if (m.bottom > maxBottom) maxBottom = m.bottom;
      }
      const lastEst = this.estimateMeasurement(this.options.itemCount - 1);
      this.totalHeight = Math.max(maxBottom, lastEst.bottom);
    }
  }
  calculateVisibleRange() {
    const scrollTop = this.container.scrollTop;
    const viewportHeight = this.container.clientHeight;
    const overscan = this.options.overscan || 5;
    const gap = this.options.gap || 0;
    let start, end;
    if (this.options.itemHeight && this.options.itemHeight > 0) {
      const itemPlusGap = this.options.itemHeight + gap;
      start = Math.max(0, Math.floor(scrollTop / itemPlusGap) - overscan);
      end = Math.min(this.options.itemCount, Math.ceil((scrollTop + viewportHeight) / itemPlusGap) + overscan);
    } else {
      start = Math.max(0, this.binarySearchStart(scrollTop) - overscan);
      end = Math.min(this.options.itemCount, this.binarySearchEnd(scrollTop + viewportHeight) + overscan);
    }
    const offset = this.getMeasurement(start).top;
    return { start, end, offset };
  }
  binarySearchStart(scrollTop) {
    let low = 0, high = this.options.itemCount - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const m = this.getMeasurement(mid);
      if (m.bottom < scrollTop) low = mid + 1;
      else if (m.top > scrollTop) high = mid - 1;
      else return mid;
    }
    return Math.max(0, low);
  }
  binarySearchEnd(scrollBottom) {
    let low = 0, high = this.options.itemCount - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const m = this.getMeasurement(mid);
      if (m.bottom < scrollBottom) low = mid + 1;
      else if (m.top > scrollBottom) high = mid - 1;
      else return mid + 1;
    }
    return Math.min(this.options.itemCount, low);
  }
  updateVisibleItems() {
    const range = this.calculateVisibleRange();
    this.visibleRange = range;
    const toRemove = [];
    for (const [index, el] of this.items) {
      if (index < range.start || index >= range.end) {
        toRemove.push(index);
        this.recycleItem(el);
      }
    }
    for (const index of toRemove) this.items.delete(index);
    for (let i = range.start; i < range.end; i++) {
      if (!this.items.has(i)) {
        const el = this.acquireItem();
        const m = this.getMeasurement(i);
        el.style.position = "absolute";
        el.style.top = `${m.top}px`;
        el.style.width = "100%";
        el.style.height = `${m.height}px`;
        try {
          this.options.renderItem(i, el);
        } catch (e) {
          console.error("[TW VirtualList] Render item error:", e);
          el.textContent = `[Error: item ${i}]`;
        }
        this.contentEl.appendChild(el);
        this.items.set(i, el);
        if (!this.options.itemHeight || this.options.itemHeight === 0) {
          const actualHeight = el.offsetHeight;
          if (actualHeight !== m.height) this.updateMeasurement(i, actualHeight);
        }
      }
    }
  }
  updateMeasurement(index, height) {
    const gap = this.options.gap || 0;
    const old = this.measurements.get(index);
    const top = old ? old.top : this.estimateMeasurement(index).top;
    this.measurements.set(index, { height, top, bottom: top + height });
    let currentTop = top + height + gap;
    for (let i = index + 1; i < this.options.itemCount; i++) {
      const m = this.measurements.get(i);
      if (m) {
        if (m.top === currentTop) break;
        m.top = currentTop;
        m.bottom = currentTop + m.height;
        currentTop = m.bottom + gap;
      }
    }
    this.updateTotalHeight();
    this.contentEl.style.height = `${this.totalHeight}px`;
  }
  acquireItem() {
    if (this.recycled.length > 0) {
      const el2 = this.recycled.pop();
      el2.style.display = "";
      el2.innerHTML = "";
      return el2;
    }
    const el = document.createElement("div");
    el.style.boxSizing = "border-box";
    return el;
  }
  recycleItem(el) {
    el.style.display = "none";
    el.innerHTML = "";
    if (this.recycled.length < this.poolSize) this.recycled.push(el);
    else el.remove();
  }
  onScroll() {
    const scrollTop = this.container.scrollTop;
    this.lastScrollTop = scrollTop;
    this.updateVisibleItems();
    if (this.options.infiniteScroll && this.options.onLoadMore) {
      const scrollBottom = scrollTop + this.container.clientHeight;
      const threshold = this.options.infiniteScrollThreshold || 200;
      if (scrollBottom >= this.totalHeight - threshold && !this.isLoadingMore) {
        this.isLoadingMore = true;
        Promise.resolve(this.options.onLoadMore()).then(() => {
          this.isLoadingMore = false;
        }).catch((e) => {
          console.error("[TW VirtualList] Load more error:", e);
          this.isLoadingMore = false;
        });
      }
    }
  }
};
function createVirtualList(container, options) {
  const list = new VirtualList(container, options);
  list.attachScrollListener();
  return list;
}

// packages/runtime/tw/watch-deep.ts
function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => deepEqual(a[k], b[k]));
}
function deepClone(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(deepClone);
  const result = {};
  for (const [k, v] of Object.entries(value)) {
    result[k] = deepClone(v);
  }
  return result;
}
function traverse(value, seen) {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) traverse(item, seen);
  } else {
    for (const v of Object.values(value)) traverse(v, seen);
  }
}
function getSourceValue(source) {
  if (typeof source === "function") return source();
  if (typeof source === "object" && source !== null && "set" in source && "peek" in source) {
    return source();
  }
  return source;
}
function watch2(source, callback, options = {}) {
  const { deep = false, immediate = false, flush: flush2 = "pre", once: once2 = false } = options;
  let oldValue;
  let paused = false;
  let stopped = false;
  let cleanups = [];
  const isMulti = Array.isArray(source);
  const sources = isMulti ? source : [source];
  const runCleanup = () => {
    for (const fn of cleanups) {
      try {
        fn();
      } catch (e) {
        console.error("[TW Watch] Cleanup error:", e);
      }
    }
    cleanups = [];
  };
  const getter = () => {
    if (deep) {
      const values2 = sources.map((s) => {
        const v = getSourceValue(s);
        traverse(v, /* @__PURE__ */ new Set());
        return deepClone(v);
      });
      return isMulti ? values2 : values2[0];
    }
    const values = sources.map((s) => getSourceValue(s));
    return isMulti ? values : values[0];
  };
  const invoke = () => {
    if (paused || stopped) return;
    const newValue = getter();
    if (!deep && oldValue !== void 0 && newValue === oldValue) return;
    if (deep && oldValue !== void 0 && deepEqual(newValue, oldValue)) return;
    runCleanup();
    const onCleanup2 = (fn) => {
      cleanups.push(fn);
    };
    try {
      callback(newValue, oldValue, onCleanup2);
    } catch (e) {
      console.error("[TW Watch] Callback error:", e);
    }
    oldValue = deep ? deepClone(newValue) : newValue;
    if (once2) {
      stop();
    }
  };
  if (deep) {
    oldValue = deepClone(getter());
  } else {
    oldValue = getter();
  }
  if (immediate) {
    invoke();
  }
  const eff = effect(() => {
    getter();
    if (flush2 === "sync") {
      invoke();
    } else {
      schedule(() => {
        if (flush2 === "pre") {
          invoke();
        } else {
          invoke();
        }
      }, "high");
    }
  });
  function stop() {
    if (stopped) return;
    stopped = true;
    runCleanup();
    eff.destroy();
  }
  function pause() {
    paused = true;
  }
  function resume() {
    paused = false;
  }
  return { stop, pause, resume };
}
function watchAll(sources, callback, options) {
  return watch2(sources, (newVal, oldVal) => {
    const newValues = Array.isArray(newVal) ? newVal : [newVal];
    const oldValues = Array.isArray(oldVal) ? oldVal : oldVal !== void 0 ? [oldVal] : newValues.map(() => void 0);
    callback(newValues, oldValues);
  }, options);
}
function watchDeep(source, callback, options) {
  return watch2(source, callback, { ...options, deep: true });
}
function watchOnce(source, callback, options) {
  return watch2(source, callback, { ...options, once: true });
}

// packages/runtime/tw/websocket-manager.ts
var TWWebSocket = class {
  constructor(name, options) {
    __publicField(this, "name");
    __publicField(this, "options");
    __publicField(this, "ws", null);
    __publicField(this, "status");
    __publicField(this, "messageQueue", []);
    __publicField(this, "reconnectAttempts", 0);
    __publicField(this, "reconnectTimer", null);
    __publicField(this, "heartbeatTimer", null);
    __publicField(this, "lastMessageTime", 0);
    __publicField(this, "messageHandlers", /* @__PURE__ */ new Map());
    __publicField(this, "disposed", false);
    // --- Internal ------------------------------------------------------
    __publicField(this, "handleOpen", () => {
      this.status.set("connected");
      this.reconnectAttempts = 0;
      this.options.onOpen();
      if (this.options.heartbeatInterval > 0) {
        this.heartbeatTimer = setInterval(() => {
          this.send("__heartbeat__", this.options.heartbeatMessage);
        }, this.options.heartbeatInterval);
      }
      while (this.messageQueue.length > 0) {
        const msg = this.messageQueue.shift();
        this.send(msg.type, msg.data);
      }
    });
    __publicField(this, "handleClose", (event) => {
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
      this.status.set("disconnected");
      this.options.onClose(event);
      if (this.options.reconnect && !this.disposed) {
        this.scheduleReconnect();
      }
    });
    __publicField(this, "handleError", (event) => {
      this.status.set("error");
      this.options.onError(event);
    });
    __publicField(this, "handleMessage", (event) => {
      try {
        const data = this.options.deserializer(event.data);
        if (data && data.type) {
          const handlers = this.messageHandlers.get(data.type);
          if (handlers) {
            for (const handler of handlers) {
              try {
                handler(data.data);
              } catch (e) {
                console.error(`[TW WebSocket] Handler error for '${data.type}':`, e);
              }
            }
          }
          this.options.onMessage(data);
          const wildcardHandlers = this.messageHandlers.get("*");
          if (wildcardHandlers) {
            for (const handler of wildcardHandlers) {
              try {
                handler(data);
              } catch (e) {
                console.error(`[TW WebSocket] Wildcard handler error:`, e);
              }
            }
          }
        }
      } catch (e) {
        console.error(`[TW WebSocket] Message parse error for '${this.name}':`, e);
      }
    });
    this.name = name;
    this.options = {
      reconnect: true,
      reconnectInterval: 1e3,
      maxReconnectInterval: 3e4,
      backoffMultiplier: 2,
      maxReconnectAttempts: Infinity,
      heartbeatInterval: 3e4,
      heartbeatMessage: { type: "ping" },
      heartbeatTimeout: 1e4,
      queueMessages: true,
      maxQueueSize: 100,
      serializer: JSON.stringify,
      deserializer: JSON.parse,
      rateLimit: 0,
      onOpen: () => {
      },
      onClose: () => {
      },
      onError: () => {
      },
      onMessage: () => {
      },
      ...options
    };
    this.status = signal("disconnected");
  }
  /**
   * Connect to the WebSocket server.
   */
  connect() {
    if (this.disposed) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.status.set(this.reconnectAttempts > 0 ? "reconnecting" : "connecting");
    try {
      this.ws = new WebSocket(this.options.url, this.options.protocols);
      this.ws.onopen = this.handleOpen;
      this.ws.onclose = this.handleClose;
      this.ws.onerror = this.handleError;
      this.ws.onmessage = this.handleMessage;
    } catch (e) {
      console.error(`[TW WebSocket] Connection failed for '${this.name}':`, e);
      this.status.set("error");
      this.scheduleReconnect();
    }
  }
  /**
   * Disconnect from the WebSocket server.
   */
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
    this.status.set("disconnected");
  }
  /**
   * Send a message.
   */
  send(type, data) {
    const message = { type, data, timestamp: Date.now() };
    if (this.options.rateLimit > 0) {
      const now = Date.now();
      if (now - this.lastMessageTime < this.options.rateLimit) return false;
      this.lastMessageTime = now;
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (this.options.queueMessages && this.messageQueue.length < this.options.maxQueueSize) {
        this.messageQueue.push(message);
      }
      return false;
    }
    try {
      this.ws.send(this.options.serializer(message));
      return true;
    } catch (e) {
      console.error(`[TW WebSocket] Send error for '${this.name}':`, e);
      return false;
    }
  }
  /**
   * Subscribe to messages of a specific type.
   */
  on(type, handler) {
    if (!this.messageHandlers.has(type)) this.messageHandlers.set(type, /* @__PURE__ */ new Set());
    this.messageHandlers.get(type).add(handler);
    return () => {
      var _a;
      (_a = this.messageHandlers.get(type)) == null ? void 0 : _a.delete(handler);
    };
  }
  /**
   * Get connection status (reactive).
   */
  get statusSignal() {
    return this.status;
  }
  /**
   * Check if connected.
   */
  get isConnected() {
    return this.status.peek() === "connected";
  }
  /**
   * Get queued message count.
   */
  get queuedCount() {
    return this.messageQueue.length;
  }
  /**
   * Get reconnect attempts.
   */
  get reconnectCount() {
    return this.reconnectAttempts;
  }
  /**
   * Dispose the connection.
   */
  dispose() {
    this.disposed = true;
    this.disconnect();
    this.messageQueue = [];
    this.messageHandlers.clear();
  }
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      console.error(`[TW WebSocket] Max reconnection attempts reached for '${this.name}'`);
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.min(
      this.options.reconnectInterval * Math.pow(this.options.backoffMultiplier, this.reconnectAttempts - 1),
      this.options.maxReconnectInterval
    );
    this.status.set("reconnecting");
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }
};
var connections = /* @__PURE__ */ new Map();
function createConnection(name, options) {
  if (connections.has(name)) {
    const conn2 = connections.get(name);
    if (!conn2.isConnected) conn2.connect();
    return conn2;
  }
  const conn = new TWWebSocket(name, options);
  connections.set(name, conn);
  conn.connect();
  return conn;
}
function getConnection(name) {
  return connections.get(name);
}
function closeConnection(name) {
  const conn = connections.get(name);
  if (conn) {
    conn.dispose();
    connections.delete(name);
  }
}
function closeAllConnections() {
  for (const conn of connections.values()) conn.dispose();
  connections.clear();
}

// packages/runtime/tw/worker-pool.ts
var WorkerPool = class {
  constructor(options = {}) {
    __publicField(this, "workers", []);
    __publicField(this, "availableWorkers", []);
    __publicField(this, "busyWorkers", /* @__PURE__ */ new Map());
    __publicField(this, "queue", []);
    __publicField(this, "options");
    __publicField(this, "taskIdCounter", 0);
    __publicField(this, "roundRobin", 0);
    __publicField(this, "stats", { tasksCompleted: 0, tasksFailed: 0, avgTime: 0, totalTime: 0 });
    this.options = {
      size: navigator.hardwareConcurrency || 4,
      workerScript: "",
      warmup: false,
      maxRetries: 1,
      taskTimeout: 3e4,
      ...options
    };
    this.initWorkers();
  }
  /**
   * Execute a task on a worker.
   */
  execute(data, options = {}) {
    return new Promise((resolve, reject) => {
      const task = {
        id: ++this.taskIdCounter,
        data,
        priority: options.priority || 0,
        transfer: options.transfer,
        resolve,
        reject,
        onProgress: options.onProgress,
        createdAt: Date.now()
      };
      let insertIdx = this.queue.length;
      for (let i = 0; i < this.queue.length; i++) {
        if (this.queue[i].priority < task.priority) {
          insertIdx = i;
          break;
        }
      }
      this.queue.splice(insertIdx, 0, task);
      this.processQueue();
    });
  }
  /**
   * Get pool statistics.
   */
  getStats() {
    return {
      poolSize: this.workers.length,
      available: this.availableWorkers.length,
      busy: this.busyWorkers.size,
      queued: this.queue.length,
      ...this.stats
    };
  }
  /**
   * Terminate all workers.
   */
  terminate() {
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.availableWorkers = [];
    this.busyWorkers.clear();
    this.queue = [];
  }
  /**
   * Resize the pool.
   */
  resize(size) {
    const currentSize = this.workers.length;
    if (size > currentSize) {
      for (let i = currentSize; i < size; i++) {
        const worker = this.createWorker();
        this.workers.push(worker);
        this.availableWorkers.push(worker);
      }
    } else if (size < currentSize) {
      for (let i = size; i < currentSize; i++) {
        const worker = this.workers.pop();
        if (worker) {
          worker.terminate();
          const availIdx = this.availableWorkers.indexOf(worker);
          if (availIdx >= 0) this.availableWorkers.splice(availIdx, 1);
        }
      }
    }
  }
  // --- Internal ------------------------------------------------------
  initWorkers() {
    for (let i = 0; i < this.options.size; i++) {
      const worker = this.createWorker();
      this.workers.push(worker);
      this.availableWorkers.push(worker);
    }
  }
  createWorker() {
    let worker;
    if (this.options.workerFn) {
      worker = this.options.workerFn();
    } else if (this.options.workerScript) {
      const blob = new Blob([this.options.workerScript], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      worker = new Worker(url);
      worker.addEventListener("message", () => URL.revokeObjectURL(url), { once: true });
    } else {
      throw new Error("[TW WorkerPool] No workerScript or workerFn provided");
    }
    return worker;
  }
  processQueue() {
    while (this.queue.length > 0 && this.availableWorkers.length > 0) {
      const task = this.queue.shift();
      const worker = this.availableWorkers.shift();
      this.busyWorkers.set(worker, task);
      const startTime = Date.now();
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          this.handleWorkerError(worker, task, new Error("Task timed out"));
        }
      }, this.options.taskTimeout);
      const messageHandler = (e) => {
        if (e.data.id !== task.id) return;
        if (e.data.type === "progress") {
          if (task.onProgress) task.onProgress(e.data.progress);
          return;
        }
        if (e.data.type === "error") {
          settled = true;
          clearTimeout(timeout);
          this.handleWorkerError(worker, task, new Error(e.data.error));
          worker.removeEventListener("message", messageHandler);
          return;
        }
        if (e.data.type === "result" || e.data.id === task.id) {
          settled = true;
          clearTimeout(timeout);
          const duration = Date.now() - startTime;
          this.stats.tasksCompleted++;
          this.stats.totalTime += duration;
          this.stats.avgTime = this.stats.totalTime / this.stats.tasksCompleted;
          task.resolve(e.data.result || e.data);
          worker.removeEventListener("message", messageHandler);
          this.releaseWorker(worker);
        }
      };
      worker.addEventListener("message", messageHandler);
      worker.addEventListener("error", (e) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          this.handleWorkerError(worker, task, new Error(e.message));
        }
      });
      worker.postMessage({ id: task.id, data: task.data }, task.transfer || []);
    }
  }
  handleWorkerError(worker, task, error) {
    this.stats.tasksFailed++;
    task.reject(error);
    const idx = this.workers.indexOf(worker);
    if (idx >= 0) {
      worker.terminate();
      const newWorker = this.createWorker();
      this.workers[idx] = newWorker;
      this.busyWorkers.delete(worker);
      this.availableWorkers.push(newWorker);
    }
    this.processQueue();
  }
  releaseWorker(worker) {
    this.busyWorkers.delete(worker);
    this.availableWorkers.push(worker);
    this.processQueue();
  }
};
var pools = /* @__PURE__ */ new Map();
function createWorkerPool(name, options) {
  const pool = new WorkerPool(options);
  pools.set(name, pool);
  return pool;
}
function getWorkerPool(name) {
  return pools.get(name);
}
function terminateAllPools() {
  for (const pool of pools.values()) pool.terminate();
  pools.clear();
}
function createInlineWorker(fn) {
  const script = `
    self.onmessage = function(e) {
      const result = (${fn.toString()})(e.data.data);
      if (result instanceof Promise) {
        result
          .then(r => self.postMessage({ id: e.data.id, type: "result", result: r }))
          .catch(err => self.postMessage({ id: e.data.id, type: "error", error: err.message }));
      } else {
        self.postMessage({ id: e.data.id, type: "result", result: result });
      }
    };
  `;
  const blob = new Blob([script], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  return new Worker(url);
}

// packages/runtime/tw/i18n/index.ts
var DEFAULT_OPTIONS = {
  defaultLocale: "en",
  fallbackLocale: "en",
  locales: [],
  lazy: false,
  cache: true,
  warnOnMissing: true,
  interpolation: { prefix: "{", suffix: "}" }
};
var I18nManager = class {
  constructor(options = {}) {
    __publicField(this, "currentLocale");
    __publicField(this, "fallbackLocale");
    __publicField(this, "locales", /* @__PURE__ */ new Map());
    __publicField(this, "messages", /* @__PURE__ */ new Map());
    __publicField(this, "cache", /* @__PURE__ */ new Map());
    __publicField(this, "options");
    __publicField(this, "loadedLocales", /* @__PURE__ */ new Set());
    __publicField(this, "loadHandlers", /* @__PURE__ */ new Map());
    __publicField(this, "changeHandlers", []);
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.currentLocale = this.options.defaultLocale;
    this.fallbackLocale = this.options.fallbackLocale;
    for (const localeConfig of this.options.locales) {
      this.registerLocale(localeConfig);
    }
    if (this.locales.has(this.currentLocale)) {
      this.loadedLocales.add(this.currentLocale);
    }
    if (this.locales.has(this.fallbackLocale)) {
      this.loadedLocales.add(this.fallbackLocale);
    }
  }
  registerLocale(config) {
    this.locales.set(config.code, config);
    this.messages.set(config.code, config.messages);
    this.loadedLocales.add(config.code);
    return this;
  }
  unregisterLocale(code) {
    this.locales.delete(code);
    this.messages.delete(code);
    this.loadedLocales.delete(code);
    this.cache.clear();
    return this;
  }
  setLocale(code) {
    if (this.currentLocale === code) return Promise.resolve();
    if (!this.locales.has(code)) {
      return Promise.reject(new Error(`Locale "${code}" not registered`));
    }
    this.currentLocale = code;
    this.cache.clear();
    if (this.options.lazy && !this.loadedLocales.has(code)) {
      const loader = this.loadHandlers.get(code);
      if (loader) {
        return loader().then((messages) => {
          this.messages.set(code, messages);
          this.loadedLocales.add(code);
          this.notifyChange();
        });
      }
    }
    this.loadedLocales.add(code);
    this.notifyChange();
    return Promise.resolve();
  }
  getLocale() {
    return this.currentLocale;
  }
  getFallbackLocale() {
    return this.fallbackLocale;
  }
  setFallbackLocale(code) {
    this.fallbackLocale = code;
  }
  getRegisteredLocales() {
    return [...this.locales.keys()];
  }
  hasLocale(code) {
    return this.locales.has(code);
  }
  isLocaleLoaded(code) {
    return this.loadedLocales.has(code);
  }
  registerLazyLoader(code, loader) {
    this.loadHandlers.set(code, loader);
  }
  async loadLocale(code) {
    const loader = this.loadHandlers.get(code);
    if (loader && !this.loadedLocales.has(code)) {
      const messages = await loader();
      this.messages.set(code, messages);
      this.loadedLocales.add(code);
    }
  }
  translate(key, params, count) {
    const cacheKey = `${this.currentLocale}:${key}:${JSON.stringify(params != null ? params : {})}:${count != null ? count : ""}`;
    if (this.options.cache && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    let message = this.getMessage(this.currentLocale, key);
    if (message === void 0) {
      message = this.getMessage(this.fallbackLocale, key);
      if (message === void 0) {
        if (this.options.warnOnMissing) {
          console.warn(`Missing translation: ${key} for locale ${this.currentLocale}`);
        }
        return key;
      }
    }
    if (count !== void 0 && typeof message === "string") {
      message = this.applyPluralization(this.currentLocale, message, count);
    }
    if (params) {
      message = this.interpolate(message, params);
    }
    if (this.options.cache) {
      this.cache.set(cacheKey, message);
    }
    return message;
  }
  t(key, params, count) {
    return this.translate(key, params, count);
  }
  getMessage(locale, key) {
    const messages = this.messages.get(locale);
    if (!messages) return void 0;
    const parts = key.split(".");
    let current = messages;
    for (const part of parts) {
      if (typeof current === "string" || current === void 0) return void 0;
      current = current[part];
    }
    return current;
  }
  applyPluralization(locale, message, count) {
    var _a;
    const config = this.locales.get(locale);
    if (!(config == null ? void 0 : config.pluralRule)) return message;
    const pluralIndex = config.pluralRule(count);
    const variants = message.split("|").map((v) => v.trim());
    return (_a = variants[pluralIndex]) != null ? _a : message;
  }
  interpolate(message, params) {
    const { prefix, suffix } = this.options.interpolation;
    let result = message;
    for (const [key, value] of Object.entries(params)) {
      const placeholder = `${prefix}${key}${suffix}`;
      result = result.split(placeholder).join(String(value));
    }
    return result;
  }
  formatNumber(value, options) {
    const config = this.locales.get(this.currentLocale);
    const mergedOptions = { ...config == null ? void 0 : config.numberFormat, ...options };
    return new Intl.NumberFormat(this.currentLocale, mergedOptions).format(value);
  }
  formatCurrency(value, currency, options) {
    var _a;
    const config = this.locales.get(this.currentLocale);
    const cur = (_a = currency != null ? currency : config == null ? void 0 : config.currency) != null ? _a : "USD";
    const mergedOptions = { style: "currency", currency: cur, ...config == null ? void 0 : config.numberFormat, ...options };
    return new Intl.NumberFormat(this.currentLocale, mergedOptions).format(value);
  }
  formatDate(date, options) {
    const config = this.locales.get(this.currentLocale);
    const mergedOptions = { ...config == null ? void 0 : config.dateFormat, ...options };
    const dateObj = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat(this.currentLocale, mergedOptions).format(dateObj);
  }
  formatTime(date, options) {
    const config = this.locales.get(this.currentLocale);
    const mergedOptions = { hour: "2-digit", minute: "2-digit", ...config == null ? void 0 : config.timeFormat, ...options };
    const dateObj = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat(this.currentLocale, mergedOptions).format(dateObj);
  }
  formatDateTime(date, options) {
    const config = this.locales.get(this.currentLocale);
    const mergedOptions = { ...config == null ? void 0 : config.dateFormat, ...config == null ? void 0 : config.timeFormat, ...options };
    const dateObj = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat(this.currentLocale, mergedOptions).format(dateObj);
  }
  formatRelativeTime(date, options) {
    const dateObj = date instanceof Date ? date : new Date(date);
    const diff2 = dateObj.getTime() - Date.now();
    const seconds = Math.round(diff2 / 1e3);
    const minutes = Math.round(seconds / 60);
    const hours = Math.round(minutes / 60);
    const days = Math.round(hours / 24);
    const rtf = new Intl.RelativeTimeFormat(this.currentLocale, options);
    if (Math.abs(seconds) < 60) return rtf.format(seconds, "second");
    if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
    if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
    return rtf.format(days, "day");
  }
  formatList(items, options) {
    return new Intl.ListFormat(this.currentLocale, options).format(items);
  }
  formatPlural(n, options) {
    return new Intl.PluralRules(this.currentLocale, options).select(n);
  }
  getDirection() {
    var _a, _b;
    return (_b = (_a = this.locales.get(this.currentLocale)) == null ? void 0 : _a.direction) != null ? _b : "ltr";
  }
  isRTL() {
    return this.getDirection() === "rtl";
  }
  getCurrency() {
    var _a, _b;
    return (_b = (_a = this.locales.get(this.currentLocale)) == null ? void 0 : _a.currency) != null ? _b : "USD";
  }
  getLocaleName() {
    var _a, _b;
    return (_b = (_a = this.locales.get(this.currentLocale)) == null ? void 0 : _a.name) != null ? _b : this.currentLocale;
  }
  getLocaleConfig(code) {
    return this.locales.get(code != null ? code : this.currentLocale);
  }
  onLocaleChange(handler) {
    this.changeHandlers.push(handler);
    return () => {
      const index = this.changeHandlers.indexOf(handler);
      if (index !== -1) this.changeHandlers.splice(index, 1);
    };
  }
  notifyChange() {
    this.changeHandlers.forEach((handler) => handler(this.currentLocale));
  }
  getMessages(locale) {
    return this.messages.get(locale != null ? locale : this.currentLocale);
  }
  setMessages(locale, messages) {
    this.messages.set(locale, messages);
    this.loadedLocales.add(locale);
    this.cache.clear();
  }
  addMessages(locale, messages) {
    var _a;
    const existing = (_a = this.messages.get(locale)) != null ? _a : {};
    this.messages.set(locale, this.mergeMessages(existing, messages));
    this.cache.clear();
  }
  mergeMessages(base, override) {
    const result = { ...base };
    for (const [key, value] of Object.entries(override)) {
      if (typeof value === "object" && value !== null && typeof result[key] === "object" && result[key] !== null) {
        result[key] = this.mergeMessages(result[key], value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
  hasTranslation(key, locale) {
    return this.getMessage(locale != null ? locale : this.currentLocale, key) !== void 0;
  }
  getMissingTranslations(locale) {
    const currentMessages = this.messages.get(locale);
    const fallbackMessages = this.messages.get(this.fallbackLocale);
    if (!currentMessages || !fallbackMessages) return [];
    const missing = [];
    this.collectMissingKeys(fallbackMessages, currentMessages, "", missing);
    return missing;
  }
  collectMissingKeys(source, target, prefix, missing) {
    var _a;
    for (const [key, value] of Object.entries(source)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "string") {
        if (target[key] === void 0) {
          missing.push(fullKey);
        }
      } else if (typeof value === "object" && value !== null) {
        this.collectMissingKeys(value, (_a = target[key]) != null ? _a : {}, fullKey, missing);
      }
    }
  }
  getTranslationProgress(locale) {
    const fallbackMessages = this.messages.get(this.fallbackLocale);
    const localeMessages = this.messages.get(locale);
    if (!fallbackMessages || !localeMessages) return 0;
    const totalKeys = this.countKeys(fallbackMessages);
    const translatedKeys = this.countKeys(localeMessages);
    return totalKeys > 0 ? translatedKeys / totalKeys * 100 : 0;
  }
  countKeys(messages) {
    let count = 0;
    for (const value of Object.values(messages)) {
      if (typeof value === "string") {
        count++;
      } else if (typeof value === "object" && value !== null) {
        count += this.countKeys(value);
      }
    }
    return count;
  }
  clearCache() {
    this.cache.clear();
  }
  getOptions() {
    return { ...this.options };
  }
  setOptions(options) {
    this.options = { ...this.options, ...options };
  }
  toJSON() {
    return JSON.stringify({
      currentLocale: this.currentLocale,
      fallbackLocale: this.fallbackLocale,
      locales: [...this.locales.keys()],
      loadedLocales: [...this.loadedLocales],
      cacheSize: this.cache.size
    }, null, 2);
  }
};
function createI18n(options) {
  return new I18nManager(options);
}
var ThemeManager2 = class {
  constructor(options = {}) {
    __publicField(this, "currentTheme", "light");
    __publicField(this, "themes", /* @__PURE__ */ new Map());
    __publicField(this, "storageKey", "tw-theme");
    __publicField(this, "useSystemPreference", true);
    __publicField(this, "systemTheme", "light");
    __publicField(this, "mediaQuery", null);
    __publicField(this, "changeHandlers", []);
    var _a, _b, _c, _d;
    this.currentTheme = (_a = options.defaultTheme) != null ? _a : "light";
    this.storageKey = (_b = options.storageKey) != null ? _b : "tw-theme";
    this.useSystemPreference = (_c = options.useSystemPreference) != null ? _c : true;
    for (const theme of (_d = options.themes) != null ? _d : []) {
      this.registerTheme(theme.name, theme.values);
    }
    this.loadSavedTheme();
    if (this.useSystemPreference) {
      this.setupSystemPreference();
    }
  }
  registerTheme(name, values) {
    this.themes.set(name, values);
    return this;
  }
  unregisterTheme(name) {
    this.themes.delete(name);
    return this;
  }
  setTheme(name) {
    if (!this.themes.has(name)) {
      throw new Error(`Theme "${name}" not registered`);
    }
    this.currentTheme = name;
    this.applyTheme(name);
    this.saveTheme(name);
    this.notifyChange(name);
  }
  getTheme() {
    return this.currentTheme;
  }
  getThemes() {
    return [...this.themes.keys()];
  }
  hasTheme(name) {
    return this.themes.has(name);
  }
  getThemeValues(name) {
    return this.themes.get(name);
  }
  toggleTheme() {
    if (this.currentTheme === "light") {
      this.setTheme("dark");
    } else {
      this.setTheme("light");
    }
  }
  toggle() {
    this.toggleTheme();
  }
  isDark() {
    return this.currentTheme === "dark";
  }
  isLight() {
    return this.currentTheme === "light";
  }
  applyTheme(name) {
    const values = this.themes.get(name);
    if (!values) return;
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      for (const [key, value] of Object.entries(values)) {
        root.style.setProperty(key, value);
      }
      root.setAttribute("data-theme", name);
    }
  }
  loadSavedTheme() {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem(this.storageKey);
      if (saved && this.themes.has(saved)) {
        this.currentTheme = saved;
        this.applyTheme(saved);
      }
    }
  }
  saveTheme(name) {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(this.storageKey, name);
    }
  }
  setupSystemPreference() {
    if (typeof window !== "undefined" && window.matchMedia) {
      this.mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      this.systemTheme = this.mediaQuery.matches ? "dark" : "light";
      this.mediaQuery.addEventListener("change", (e) => {
        this.systemTheme = e.matches ? "dark" : "light";
        if (this.useSystemPreference) {
          this.setTheme(this.systemTheme);
        }
      });
    }
  }
  getSystemTheme() {
    return this.systemTheme;
  }
  setUseSystemPreference(use) {
    this.useSystemPreference = use;
    if (use) {
      this.setTheme(this.systemTheme);
    }
  }
  onThemeChange(handler) {
    this.changeHandlers.push(handler);
    return () => {
      const index = this.changeHandlers.indexOf(handler);
      if (index !== -1) this.changeHandlers.splice(index, 1);
    };
  }
  notifyChange(theme) {
    this.changeHandlers.forEach((handler) => handler(theme));
  }
  clearSavedTheme() {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(this.storageKey);
    }
  }
  getStorageKey() {
    return this.storageKey;
  }
  setStorageKey(key) {
    this.storageKey = key;
  }
  getThemeCount() {
    return this.themes.size;
  }
  toJSON() {
    return JSON.stringify({
      currentTheme: this.currentTheme,
      themes: this.getThemes(),
      systemTheme: this.systemTheme,
      useSystemPreference: this.useSystemPreference
    }, null, 2);
  }
};
function createThemeManager(options) {
  return new ThemeManager2(options);
}
var FormValidator = class {
  constructor() {
    __publicField(this, "rules", /* @__PURE__ */ new Map());
    __publicField(this, "messages", /* @__PURE__ */ new Map());
    __publicField(this, "customValidators", /* @__PURE__ */ new Map());
  }
  registerRule(field, rule) {
    if (!this.rules.has(field)) {
      this.rules.set(field, []);
    }
    this.rules.get(field).push(rule);
    return this;
  }
  registerCustomValidator(name, validator) {
    this.customValidators.set(name, validator);
    return this;
  }
  setMessage(key, message) {
    this.messages.set(key, message);
    return this;
  }
  validate(data) {
    const errors = {};
    for (const [field, rules] of this.rules) {
      const value = data[field];
      for (const rule of rules) {
        const error = this.validateRule(field, value, rule, data);
        if (error) {
          if (!errors[field]) errors[field] = [];
          errors[field].push(error);
        }
      }
    }
    return { valid: Object.keys(errors).length === 0, errors };
  }
  validateField(field, value, allData) {
    var _a;
    const rules = (_a = this.rules.get(field)) != null ? _a : [];
    const errors = [];
    for (const rule of rules) {
      const error = this.validateRule(field, value, rule, allData != null ? allData : {});
      if (error) errors.push(error);
    }
    return { valid: errors.length === 0, errors };
  }
  validateRule(field, value, rule, data) {
    switch (rule.type) {
      case "required":
        if (value === void 0 || value === null || value === "" || Array.isArray(value) && value.length === 0) {
          return this.getMessage(field, "required", `${field} is required`);
        }
        break;
      case "minLength":
        if (typeof value === "string" && value.length < rule.params) {
          return this.getMessage(field, "minLength", `${field} must be at least ${rule.params} characters`);
        }
        break;
      case "maxLength":
        if (typeof value === "string" && value.length > rule.params) {
          return this.getMessage(field, "maxLength", `${field} must be at most ${rule.params} characters`);
        }
        break;
      case "min":
        if (typeof value === "number" && value < rule.params) {
          return this.getMessage(field, "min", `${field} must be at least ${rule.params}`);
        }
        break;
      case "max":
        if (typeof value === "number" && value > rule.params) {
          return this.getMessage(field, "max", `${field} must be at most ${rule.params}`);
        }
        break;
      case "email":
        if (typeof value === "string" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          return this.getMessage(field, "email", `${field} must be a valid email`);
        }
        break;
      case "url":
        if (typeof value === "string" && value && !/^https?:\/\/.+/.test(value)) {
          return this.getMessage(field, "url", `${field} must be a valid URL`);
        }
        break;
      case "pattern":
        if (typeof value === "string" && value && !rule.params.test(value)) {
          return this.getMessage(field, "pattern", `${field} format is invalid`);
        }
        break;
      case "number":
        if (value !== void 0 && value !== null && value !== "" && isNaN(Number(value))) {
          return this.getMessage(field, "number", `${field} must be a number`);
        }
        break;
      case "integer":
        if (value !== void 0 && value !== null && value !== "" && !Number.isInteger(Number(value))) {
          return this.getMessage(field, "integer", `${field} must be an integer`);
        }
        break;
      case "boolean":
        if (value !== void 0 && value !== null && typeof value !== "boolean") {
          return this.getMessage(field, "boolean", `${field} must be a boolean`);
        }
        break;
      case "date":
        if (typeof value === "string" && value && isNaN(Date.parse(value))) {
          return this.getMessage(field, "date", `${field} must be a valid date`);
        }
        break;
      case "oneOf":
        if (!Array.isArray(rule.params) || !rule.params.includes(value)) {
          return this.getMessage(field, "oneOf", `${field} must be one of: ${rule.params.join(", ")}`);
        }
        break;
      case "noneOf":
        if (Array.isArray(rule.params) && rule.params.includes(value)) {
          return this.getMessage(field, "noneOf", `${field} must not be one of: ${rule.params.join(", ")}`);
        }
        break;
      case "sameAs":
        if (value !== data[rule.params]) {
          return this.getMessage(field, "sameAs", `${field} must match ${rule.params}`);
        }
        break;
      case "differentFrom":
        if (value === data[rule.params]) {
          return this.getMessage(field, "differentFrom", `${field} must be different from ${rule.params}`);
        }
        break;
      case "custom":
        const validator = this.customValidators.get(rule.params);
        if (validator) {
          const result = validator(value, rule.options);
          if (result !== true) {
            return typeof result === "string" ? result : this.getMessage(field, "custom", `${field} is invalid`);
          }
        }
        break;
    }
    return null;
  }
  getMessage(field, ruleType, defaultMsg) {
    var _a, _b;
    return (_b = (_a = this.messages.get(`${field}.${ruleType}`)) != null ? _a : this.messages.get(ruleType)) != null ? _b : defaultMsg;
  }
  getRules(field) {
    var _a;
    return field ? (_a = this.rules.get(field)) != null ? _a : [] : [...this.rules.values()].flat();
  }
  getRegisteredFields() {
    return [...this.rules.keys()];
  }
  hasRules(field) {
    return this.rules.has(field);
  }
  clearRules(field) {
    if (field) {
      this.rules.delete(field);
    } else {
      this.rules.clear();
    }
  }
  clearMessages() {
    this.messages.clear();
  }
  clearAll() {
    this.rules.clear();
    this.messages.clear();
    this.customValidators.clear();
  }
};
function createFormValidator() {
  return new FormValidator();
}
var DragDropManager = class {
  constructor() {
    __publicField(this, "draggables", /* @__PURE__ */ new Map());
    __publicField(this, "dropZones", /* @__PURE__ */ new Map());
    __publicField(this, "draggedElement", null);
    __publicField(this, "draggedId", null);
    __publicField(this, "draggedData", null);
    __publicField(this, "hoverElement", null);
    __publicField(this, "handlers", /* @__PURE__ */ new Map());
  }
  registerDraggable(id, element, data) {
    this.draggables.set(id, element);
    const dragStartHandler = (e) => {
      var _a;
      this.draggedElement = element;
      this.draggedId = id;
      this.draggedData = data;
      (_a = e.dataTransfer) == null ? void 0 : _a.setData("text/plain", id);
      this.emit("dragstart", id, element, data);
    };
    const dragEndHandler = () => {
      this.draggedElement = null;
      this.draggedId = null;
      this.draggedData = null;
      this.hoverElement = null;
      this.emit("dragend", id, element, data);
    };
    element.draggable = true;
    element.addEventListener("dragstart", dragStartHandler);
    element.addEventListener("dragend", dragEndHandler);
    return () => {
      element.removeEventListener("dragstart", dragStartHandler);
      element.removeEventListener("dragend", dragEndHandler);
      this.draggables.delete(id);
    };
  }
  registerDropZone(id, element) {
    this.dropZones.set(id, element);
    const dragOverHandler = (e) => {
      e.preventDefault();
      this.hoverElement = element;
      this.emit("dragover", id, element, this.draggedId, this.draggedData);
    };
    const dragEnterHandler = (e) => {
      e.preventDefault();
      this.emit("dragenter", id, element, this.draggedId, this.draggedData);
    };
    const dragLeaveHandler = () => {
      this.emit("dragleave", id, element, this.draggedId, this.draggedData);
    };
    const dropHandler = (e) => {
      e.preventDefault();
      this.emit("drop", id, element, this.draggedId, this.draggedData);
      this.hoverElement = null;
    };
    element.addEventListener("dragover", dragOverHandler);
    element.addEventListener("dragenter", dragEnterHandler);
    element.addEventListener("dragleave", dragLeaveHandler);
    element.addEventListener("drop", dropHandler);
    return () => {
      element.removeEventListener("dragover", dragOverHandler);
      element.removeEventListener("dragenter", dragEnterHandler);
      element.removeEventListener("dragleave", dragLeaveHandler);
      element.removeEventListener("drop", dropHandler);
      this.dropZones.delete(id);
    };
  }
  on(event, zoneId, handler) {
    const key = `${event}:${zoneId}`;
    if (!this.handlers.has(key)) {
      this.handlers.set(key, /* @__PURE__ */ new Map());
    }
    if (!this.handlers.get(key).has(zoneId)) {
      this.handlers.get(key).set(zoneId, /* @__PURE__ */ new Set());
    }
    this.handlers.get(key).get(zoneId).add(handler);
    return () => {
      var _a, _b;
      (_b = (_a = this.handlers.get(key)) == null ? void 0 : _a.get(zoneId)) == null ? void 0 : _b.delete(handler);
    };
  }
  emit(event, ...args) {
    for (const [key, zoneMap] of this.handlers) {
      if (key.startsWith(`${event}:`)) {
        for (const handlers of zoneMap.values()) {
          handlers.forEach((handler) => handler(...args));
        }
      }
    }
  }
  getDraggedElement() {
    return this.draggedElement;
  }
  getDraggedId() {
    return this.draggedId;
  }
  getDraggedData() {
    return this.draggedData;
  }
  getHoverElement() {
    return this.hoverElement;
  }
  isDragging() {
    return this.draggedElement !== null;
  }
  getDraggables() {
    return [...this.draggables.keys()];
  }
  getDropZones() {
    return [...this.dropZones.keys()];
  }
  clear() {
    this.draggables.clear();
    this.dropZones.clear();
    this.handlers.clear();
    this.draggedElement = null;
    this.draggedId = null;
    this.draggedData = null;
    this.hoverElement = null;
  }
};
function createDragDropManager() {
  return new DragDropManager();
}
var GestureRecognizer2 = class {
  constructor(element) {
    __publicField(this, "element");
    __publicField(this, "startX", 0);
    __publicField(this, "startY", 0);
    __publicField(this, "currentX", 0);
    __publicField(this, "currentY", 0);
    __publicField(this, "startTime", 0);
    __publicField(this, "isTracking", false);
    __publicField(this, "pointers", /* @__PURE__ */ new Map());
    __publicField(this, "handlers", /* @__PURE__ */ new Map());
    __publicField(this, "onTouchStart", (e) => {
      if (e.touches.length === 1) {
        this.startX = e.touches[0].clientX;
        this.startY = e.touches[0].clientY;
        this.startTime = Date.now();
        this.isTracking = true;
      }
    });
    __publicField(this, "onTouchMove", (e) => {
      if (!this.isTracking || e.touches.length !== 1) return;
      this.currentX = e.touches[0].clientX;
      this.currentY = e.touches[0].clientY;
      const dx = this.currentX - this.startX;
      const dy = this.currentY - this.startY;
      this.emit("pan", { dx, dy, startX: this.startX, startY: this.startY, currentX: this.currentX, currentY: this.currentY });
    });
    __publicField(this, "onTouchEnd", (e) => {
      if (!this.isTracking) return;
      const dx = this.currentX - this.startX;
      const dy = this.currentY - this.startY;
      const duration = Date.now() - this.startTime;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < 10 && duration < 300) {
        this.emit("tap", { x: this.startX, y: this.startY });
      } else if (distance < 10 && duration >= 500) {
        this.emit("longpress", { x: this.startX, y: this.startY, duration });
      } else if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 50) this.emit("swiperight", { dx, dy, distance });
        else if (dx < -50) this.emit("swipeleft", { dx, dy, distance });
      } else {
        if (dy > 50) this.emit("swipedown", { dx, dy, distance });
        else if (dy < -50) this.emit("swipeup", { dx, dy, distance });
      }
      this.isTracking = false;
    });
    __publicField(this, "onPointerDown", (e) => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) {
        this.startX = e.clientX;
        this.startY = e.clientY;
        this.startTime = Date.now();
        this.isTracking = true;
      } else if (this.pointers.size === 2) {
        this.emit("pinchstart", { pointers: [...this.pointers.values()] });
      }
    });
    __publicField(this, "onPointerMove", (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        const points = [...this.pointers.values()];
        const distance = Math.sqrt(
          Math.pow(points[0].x - points[1].x, 2) + Math.pow(points[0].y - points[1].y, 2)
        );
        this.emit("pinch", { distance, pointers: points });
      }
    });
    __publicField(this, "onPointerUp", (e) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) {
        this.emit("pinchend", {});
      }
      if (this.pointers.size === 0) {
        this.isTracking = false;
      }
    });
    this.element = element;
    this.setupListeners();
  }
  setupListeners() {
    this.element.addEventListener("touchstart", this.onTouchStart, { passive: false });
    this.element.addEventListener("touchmove", this.onTouchMove, { passive: false });
    this.element.addEventListener("touchend", this.onTouchEnd);
    this.element.addEventListener("pointerdown", this.onPointerDown);
    this.element.addEventListener("pointermove", this.onPointerMove);
    this.element.addEventListener("pointerup", this.onPointerUp);
  }
  on(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, /* @__PURE__ */ new Set());
    }
    this.handlers.get(event).add(handler);
    return () => {
      var _a;
      (_a = this.handlers.get(event)) == null ? void 0 : _a.delete(handler);
    };
  }
  emit(event, data) {
    var _a;
    (_a = this.handlers.get(event)) == null ? void 0 : _a.forEach((handler) => handler(data));
  }
  destroy() {
    this.element.removeEventListener("touchstart", this.onTouchStart);
    this.element.removeEventListener("touchmove", this.onTouchMove);
    this.element.removeEventListener("touchend", this.onTouchEnd);
    this.element.removeEventListener("pointerdown", this.onPointerDown);
    this.element.removeEventListener("pointermove", this.onPointerMove);
    this.element.removeEventListener("pointerup", this.onPointerUp);
    this.handlers.clear();
    this.pointers.clear();
  }
};

// packages/runtime/tw/index.ts
var VERSION = "0.0.1-hardened19-upgraded";
var VDOM = class {
  constructor() {
    __publicField(this, "root", null);
  }
  mount(el, container) {
    this.root = el;
    return el;
  }
  unmount() {
    this.root = null;
  }
  patch(newVNode) {
    this.root = newVNode;
  }
  toHTML() {
    return "";
  }
};
function createReactive(value) {
  return reactive(value);
}
export {
  CLIENT_RUNTIME,
  DiffEngine,
  DragDropManager,
  ErrorBoundary,
  EventDelegator,
  FocusTrap,
  FormValidator,
  Fragment,
  GestureRecognizer2 as GestureRecognizer,
  I18nManager,
  KeepAlive,
  ObjectPool,
  ReactiveScope,
  ReactiveValue,
  Suspense,
  Teleport,
  ThemeManager2 as ThemeManager,
  TransitionManager,
  VDOM,
  VERSION,
  VNODE_SYMBOL,
  VOID_ELEMENTS,
  VirtualList,
  __setMountVNode,
  __setRenderingComponent,
  acquireElement,
  acquireVNode,
  addAnimationTask,
  addClass,
  alertDialog,
  animateProperty,
  append,
  assertCondition,
  autoFocus,
  batch,
  blueprintToHydrationData,
  buildSelector,
  cacheClear,
  cacheDelete,
  cacheGet,
  cacheHas,
  cacheSet,
  cacheStats,
  cancel,
  clearAllContexts,
  clearPool,
  clearRegisteredIds,
  clearServiceWorkerCaches,
  clickOutsideDirective,
  clipboardDirective,
  cloneVNode,
  closeAllConnections,
  closeAllModals,
  closeConnection,
  closeModal,
  closest,
  computed,
  configurePool,
  confirmDialog,
  consoleTransport,
  consumeContext,
  copyHTML,
  copyJSON,
  copyText,
  copyToClipboard,
  createAnalyticsPlugin,
  createBuiltinTransitions,
  createCommentVNode,
  createConnection,
  createContext,
  createCursorPagination,
  createDiffEngine,
  createDragDropManager,
  createElement,
  createErrorBoundary,
  createErrorReportingPlugin,
  createEventBus,
  createFallback,
  createFocusTrap,
  createForm,
  createFormFromSchema,
  createFormValidator,
  createFragment,
  createGestureRecognizer,
  createGlobalState,
  createI18n,
  createIdGenerator,
  createInjectionKey,
  createInlineWorker,
  createKeepAlive,
  createLogger,
  createOptimizedImage,
  createPagination,
  createPortal,
  createReactive,
  createResponsivePicture,
  createRouter,
  createScope,
  createSlotContent,
  createSlotNode,
  createTeleportNode,
  createText,
  createTextVNode,
  createThemeManager,
  createTransitionManager,
  createVNode,
  createVirtualList,
  createWorkerPool,
  debounceDirective,
  debugLog,
  decodeHashId,
  defaultBreakpoints,
  defineAsyncComponent,
  defineComponent,
  defineScopedSlot,
  defineSlot,
  defineStore,
  delegate,
  delegateGlobal,
  destroyAllPortals,
  destroyEventDelegation,
  destroyMemoryManager,
  destroyPortal,
  devtoolsPlugin,
  diff,
  diffChildren,
  diffKeyed,
  diffKeyedFull,
  diffProps,
  diffTextNode,
  diffUnkeyed,
  diffVNode,
  disableDevTools,
  dismissAllToasts,
  dismissToast,
  disposeProviderTree,
  easings,
  effect,
  emit,
  emitSync,
  enableDevTools,
  enableProfiler,
  encodeHashId,
  endBatch,
  endProfiling,
  enterScope,
  errorLog,
  escapeHtml2 as escapeHtml,
  escapeText2 as escapeText,
  exitScope,
  fileTransport,
  find,
  findAll,
  flush,
  flushSync,
  focusDirective,
  formatCurrency,
  formatDate,
  formatList,
  formatNumber,
  formatRelativeTime,
  forwardRef,
  fragment,
  generateBlueprint,
  generateKeyedPatches,
  generateServiceWorkerScript,
  getAnimationLoop,
  getAsyncLoader,
  getAttr,
  getCacheManager,
  getClipboardManager,
  getConnection,
  getCurrentProvider,
  getDOMPool,
  getDebugger,
  getDelegator,
  getDevTools,
  getDirectiveRegistry,
  getErrorRecovery,
  getEventBus,
  getFocusStack,
  getHttpClient,
  getI18n,
  getImageOptimizer,
  getKey,
  getKeyboardManager,
  getLocale,
  getLogger,
  getMemoryManager,
  getModalManager,
  getOffset,
  getPluginManager,
  getPortal,
  getProfiler,
  getProfilerStats,
  getRootProvider,
  getScrollDirection,
  getScrollDirectionDetector,
  getScrollParent,
  getServiceWorkerManager,
  getShortcutHelp,
  getSlotNames,
  getSlotRegistry,
  getStats,
  getStyle,
  getSubscriberCount,
  getSuspenseManager,
  getTextDirection,
  getThemeManager,
  getToastManager,
  getTransitionManager,
  getVisibilityManager,
  getWorkerPool,
  h,
  hasAttr,
  hasClass,
  hasSlot,
  httpDelete,
  httpGet,
  httpPost,
  httpPut,
  hydrate,
  hydrateElementById,
  infoLog,
  initEventDelegation,
  initI18n,
  initProviderTree,
  initTheme,
  initTransitionManager,
  inject,
  injectReactive,
  insertBefore,
  inspectObject,
  intersectionDirective,
  isComputed,
  isDarkMode,
  isDev,
  isDevToolsEnabled,
  isElement,
  isIdUsed,
  isInViewport,
  isProd,
  isRTL,
  isReactive,
  isSameVNode,
  isScheduled2 as isScheduled,
  isSignal,
  isVNode,
  jsonTransport,
  lazyDirective,
  logDebug,
  logError,
  logFatal,
  logInfo,
  logTrace,
  logWarn,
  longpressDirective,
  makeDraggable,
  makeSortable,
  mapContext,
  markForHydration,
  markVNode,
  measureTime,
  measureTimeAsync,
  memo,
  mutationDirective,
  nanoId,
  navigate,
  networkTransport,
  nextTick,
  normalizeChild,
  normalizeChildren,
  observeAllVitals,
  observeCLS,
  observeFCP,
  observeFID,
  observeINP,
  observeLCP,
  observeTTFB,
  observeVisibility,
  off,
  offAll,
  on,
  onChange,
  onCleanup,
  onClick,
  onDoubleTap,
  onInput,
  onKeydown,
  onLongPress,
  onPinch,
  onSubmit,
  onSwipe,
  once,
  openModal,
  parseEventModifiers,
  pasteFromClipboard,
  peekQueue,
  poolSize,
  popContextScope,
  preloadAsyncComponent,
  preloadImage,
  prepend,
  provide,
  provideContext,
  provideFactory,
  provideReactive,
  pushContextScope,
  queueJob,
  reactive,
  readDOM,
  redirectTo,
  ref,
  registerBuiltinDirectives,
  registerDirective,
  registerId,
  registerServiceWorker,
  registerShortcut,
  releaseElement,
  releaseId,
  releaseVNode,
  releaseVNodes,
  remove,
  removeAllEventListeners,
  removeAnimationTask,
  removeAttr,
  removeClass,
  removeProp,
  removeStyle,
  renderError,
  renderSlot,
  renderStreamToString,
  renderToReadableStream,
  renderToStream,
  renderToStreamAsync,
  renderToString,
  replaceChild,
  resetScheduler,
  resetSequentialCounter,
  resizeDirective,
  resolveContext,
  resolveSlots,
  routerLink,
  routerView,
  schedule,
  scrollTo,
  sequentialId,
  setAttr,
  setAttrs,
  setBaseURL,
  setClasses,
  setContextValue,
  setGlobalLogger,
  setLocale,
  setProp,
  setRouter,
  setShortcutScope,
  setSnowflakeWorkerId,
  setStyle,
  setStyles,
  setThemeMode,
  showModal,
  signal,
  snowflake,
  startBatch,
  startProfiling,
  styleToString3 as styleToString,
  t,
  teleport,
  terminateAllPools,
  tn,
  toRef,
  toRefs,
  toast,
  toastError,
  toastInfo,
  toastSuccess,
  toastWarning,
  toggleClass,
  toggleTheme,
  tween,
  ulid,
  uniqueId,
  unmarkForHydration,
  unregisterDirective,
  unregisterServiceWorker,
  untrack,
  uploadFile,
  useBreakpoint,
  useCanHover,
  useConnectionType,
  useContext,
  useContextSignal,
  useDevicePixelRatio,
  useDocumentVisible,
  useIsOnline,
  useIsTouchDevice,
  useLocale,
  useMediaQuery,
  useOrientation,
  usePlugin,
  usePrefersColorScheme,
  usePrefersDark,
  usePrefersReducedMotion,
  useRoute,
  useRouter,
  useSlots,
  useStore,
  useStoreAction,
  useTheme,
  useThemeMode,
  useTranslation,
  useViewportHeight,
  useViewportSize,
  useViewportWidth,
  uuid,
  validateContext,
  validators,
  vnodePool,
  vnodeToString,
  warnLog,
  watch,
  watchAll,
  watchDeep,
  watchEffect,
  watchOnce,
  whenInViewport,
  whenVisible,
  withContextScope,
  withErrorRecovery,
  withScope,
  withSuspense,
  writeDOM
};
