/**
 * Easing functions for smooth animations.
 * @module runtime/animation
 */

export type EasingFunction = (t: number) => number;

export const linear: EasingFunction = (t: number) => t;

export const easeInQuad: EasingFunction = (t: number) => t * t;
export const easeOutQuad: EasingFunction = (t: number) => t * (2 - t);
export const easeInOutQuad: EasingFunction = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

export const easeInCubic: EasingFunction = (t: number) => t * t * t;
export const easeOutCubic: EasingFunction = (t: number) => (--t) * t * t + 1;
export const easeInOutCubic: EasingFunction = (t: number) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;

export const easeInQuart: EasingFunction = (t: number) => t * t * t * t;
export const easeOutQuart: EasingFunction = (t: number) => 1 - (--t) * t * t * t;
export const easeInOutQuart: EasingFunction = (t: number) => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t;

export const easeInQuint: EasingFunction = (t: number) => t * t * t * t * t;
export const easeOutQuint: EasingFunction = (t: number) => 1 + (--t) * t * t * t * t;
export const easeInOutQuint: EasingFunction = (t: number) => t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * (--t) * t * t * t * t;

export const easeInSine: EasingFunction = (t: number) => 1 - Math.cos((t * Math.PI) / 2);
export const easeOutSine: EasingFunction = (t: number) => Math.sin((t * Math.PI) / 2);
export const easeInOutSine: EasingFunction = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

export const easeInExpo: EasingFunction = (t: number) => t === 0 ? 0 : Math.pow(2, 10 * t - 10);
export const easeOutExpo: EasingFunction = (t: number) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
export const easeInOutExpo: EasingFunction = (t: number) => {
  if (t === 0) return 0;
  if (t === 1) return 1;
  return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
};

export const easeInCirc: EasingFunction = (t: number) => 1 - Math.sqrt(1 - t * t);
export const easeOutCirc: EasingFunction = (t: number) => Math.sqrt(1 - (--t) * t);
export const easeInOutCirc: EasingFunction = (t: number) => t < 0.5 ? (1 - Math.sqrt(1 - 4 * t * t)) / 2 : (Math.sqrt(1 - (-2 * t + 2) * (-2 * t + 2)) + 1) / 2;

export const easeInBack: EasingFunction = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return c3 * t * t * t - c1 * t * t;
};
export const easeOutBack: EasingFunction = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeInOutBack: EasingFunction = (t: number) => {
  const c1 = 1.70158;
  const c2 = c1 * 1.525;
  return t < 0.5
    ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
    : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
};

export const easeInElastic: EasingFunction = (t: number) => {
  if (t === 0) return 0;
  if (t === 1) return 1;
  const c4 = (2 * Math.PI) / 3;
  return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
};
export const easeOutElastic: EasingFunction = (t: number) => {
  if (t === 0) return 0;
  if (t === 1) return 1;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};
export const easeInOutElastic: EasingFunction = (t: number) => {
  if (t === 0) return 0;
  if (t === 1) return 1;
  const c5 = (2 * Math.PI) / 4.5;
  return t < 0.5
    ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
    : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
};

export const easeOutBounce: EasingFunction = (t: number) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};
export const easeInBounce: EasingFunction = (t: number) => 1 - easeOutBounce(1 - t);
export const easeInOutBounce: EasingFunction = (t: number) => t < 0.5 ? (1 - easeOutBounce(1 - 2 * t)) / 2 : (1 + easeOutBounce(2 * t - 1)) / 2;

export const easings = {
  linear,
  easeInQuad, easeOutQuad, easeInOutQuad,
  easeInCubic, easeOutCubic, easeInOutCubic,
  easeInQuart, easeOutQuart, easeInOutQuart,
  easeInQuint, easeOutQuint, easeInOutQuint,
  easeInSine, easeOutSine, easeInOutSine,
  easeInExpo, easeOutExpo, easeInOutExpo,
  easeInCirc, easeOutCirc, easeInOutCirc,
  easeInBack, easeOutBack, easeInOutBack,
  easeInElastic, easeOutElastic, easeInOutElastic,
  easeInBounce, easeOutBounce, easeInOutBounce,
};

export function getEasing(name: string): EasingFunction {
  return (easings as Record<string, EasingFunction>)[name] ?? linear;
}

export function registerEasing(name: string, fn: EasingFunction): void {
  (easings as Record<string, EasingFunction>)[name] = fn;
}

export function createSteps(steps: number, position: "start" | "end" = "end"): EasingFunction {
  return (t: number) => {
    const step = 1 / steps;
    const rounded = position === "end" ? Math.floor(t / step) : Math.ceil(t / step);
    return Math.min(1, rounded * step);
  };
}

export function createBezier(x1: number, y1: number, x2: number, y2: number): EasingFunction {
  return (t: number) => {
    let x = t;
    for (let i = 0; i < 8; i++) {
      const current = 3 * (1 - x) * (1 - x) * x * x1 + 3 * (1 - x) * x * x * x2 + x * x * x;
      const derivative = 3 * (1 - x) * (1 - x) * x1 + 6 * (1 - x) * x * (x2 - x1) + 3 * x * x * (1 - x2);
      if (Math.abs(current - t) < 0.001) break;
      x -= (current - t) / derivative;
    }
    return 3 * (1 - x) * (1 - x) * x * y1 + 3 * (1 - x) * x * x * y2 + x * x * x;
  };
}

export function createSpring(stiffness: number = 100, damping: number = 10, mass: number = 1): EasingFunction {
  return (t: number) => {
    const omega = Math.sqrt(stiffness / mass);
    const zeta = damping / (2 * Math.sqrt(stiffness * mass));
    if (zeta < 1) {
      const wd = omega * Math.sqrt(1 - zeta * zeta);
      return 1 - Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + (zeta * omega / wd) * Math.sin(wd * t));
    } else {
      return 1 - (1 + omega * t) * Math.exp(-omega * t);
    }
  };
}

export function createSequence(...easings: Array<{ easing: EasingFunction; duration: number }>): EasingFunction {
  const totalDuration = easings.reduce((sum, e) => sum + e.duration, 0);
  return (t: number) => {
    let current = t * totalDuration;
    for (const { easing, duration } of easings) {
      if (current <= duration) {
        return easing(current / duration);
      }
      current -= duration;
    }
    return 1;
  };
}

export function createReverse(easing: EasingFunction): EasingFunction {
  return (t: number) => easing(1 - t);
}

export function createMirror(easing: EasingFunction): EasingFunction {
  return (t: number) => t < 0.5 ? easing(2 * t) : easing(2 * (1 - t));
}

export function createRepeat(easing: EasingFunction, count: number): EasingFunction {
  return (t: number) => easing((t * count) % 1);
}

export function createPingPong(easing: EasingFunction, count: number): EasingFunction {
  return (t: number) => {
    const cycle = (t * count) % 1;
    return cycle < 0.5 ? easing(cycle * 2) : easing(1 - (cycle - 0.5) * 2);
  };
}

export function blend(easingA: EasingFunction, easingB: EasingFunction, blend: number = 0.5): EasingFunction {
  return (t: number) => easingA(t) * (1 - blend) + easingB(t) * blend;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function smootheststep(t: number): number {
  return t * t * t * t * (t * (t * (t * -20 + 70) - 84) + 35);
}

export function approach(current: number, target: number, delta: number): number {
  if (current < target) return Math.min(current + delta, target);
  if (current > target) return Math.max(current - delta, target);
  return target;
}

export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  const diff = ((target - current + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return current + diff * (1 - Math.exp(-lambda * dt));
}

export function interpolate(type: "number" | "color" | "array", a: unknown, b: unknown, t: number, easing?: EasingFunction): unknown {
  const eased = easing ? easing(t) : t;
  switch (type) {
    case "number":
      return lerp(a as number, b as number, eased);
    case "color": {
      const parseHex = (hex: string): [number, number, number] => {
        const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
        return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
      };
      const [ar, ag, ab] = parseHex(a as string);
      const [br, bg, bb] = parseHex(b as string);
      const r = Math.round(lerp(ar, br, eased));
      const g = Math.round(lerp(ag, bg, eased));
      const b2 = Math.round(lerp(ab, bb, eased));
      return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b2.toString(16).padStart(2, "0")}`;
    }
    case "array":
      return (a as number[]).map((v, i) => lerp(v, (b as number[])[i], eased));
    default:
      return a;
  }
}
