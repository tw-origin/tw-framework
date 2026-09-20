/**
 * Number formatting and math utilities.
 * @module shared/utils/number
 */

export function formatNumber(value: number, locale: string = "en-IN", options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatCurrency(value: number, currency: string = "INR", locale: string = "en-IN"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function formatPercent(value: number, locale: string = "en-IN", fractionDigits: number = 1): string {
  return new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(value / 100);
}

export function formatCompact(value: number, locale: string = "en-IN"): string {
  return new Intl.NumberFormat(locale, { notation: "compact", compactDisplay: "short" }).format(value);
}

export function formatScientific(value: number, locale: string = "en-IN"): string {
  return new Intl.NumberFormat(locale, { notation: "scientific" }).format(value);
}

export function formatBytes(bytes: number, decimals: number = 2, binary: boolean = false): string {
  if (bytes === 0) return "0 B";
  const k = binary ? 1024 : 1000;
  const sizes = binary
    ? ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"]
    : ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  let i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + " " + sizes[i];
}

export function parseBytes(str: string): number {
  const match = str.trim().match(/^([\d.]+)\s*(B|KB|MB|GB|TB|PB|EB|ZB|YB|KiB|MiB|GiB|TiB|PiB|EiB|ZiB|YiB)$/i);
  if (!match) return NaN;
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const units: Record<string, number> = {
    B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, PB: 1e15, EB: 1e18, ZB: 1e21, YB: 1e24,
    KIB: 1024, MIB: 1024 ** 2, GIB: 1024 ** 3, TIB: 1024 ** 4, PIB: 1024 ** 5, EIB: 1024 ** 6, ZIB: 1024 ** 7, YIB: 1024 ** 8,
  };
  return value * (units[unit] ?? 1);
}

export function formatIndianNumber(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}

export function formatInternationalNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

export function invLerp(start: number, end: number, value: number): number {
  if (start === end) return 0;
  return (value - start) / (end - start);
}

export function remap(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  return lerp(outMin, outMax, invLerp(inMin, inMax, value));
}

export function roundTo(value: number, decimals: number = 0): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export function floorTo(value: number, decimals: number = 0): number {
  const factor = Math.pow(10, decimals);
  return Math.floor(value * factor) / factor;
}

export function ceilTo(value: number, decimals: number = 0): number {
  const factor = Math.pow(10, decimals);
  return Math.ceil(value * factor) / factor;
}

export function truncateTo(value: number, decimals: number = 0): number {
  const factor = Math.pow(10, decimals);
  return Math.trunc(value * factor) / factor;
}

export function toFixed(value: number, decimals: number = 0): string {
  return value.toFixed(decimals);
}

export function toPrecision(value: number, precision: number): string {
  return value.toPrecision(precision);
}

export function toExponential(value: number, fractionDigits?: number): string {
  return value.toExponential(fractionDigits);
}

export function isInteger(value: number): boolean {
  return Number.isInteger(value);
}

export function isFloat(value: number): boolean {
  return !Number.isInteger(value) && Number.isFinite(value);
}

export function isPositive(value: number): boolean {
  return value > 0;
}

export function isNegative(value: number): boolean {
  return value < 0;
}

export function isZero(value: number, epsilon: number = 0): boolean {
  return Math.abs(value) <= epsilon;
}

export function isEven(value: number): boolean {
  return value % 2 === 0;
}

export function isOdd(value: number): boolean {
  return value % 2 !== 0;
}

export function isPrime(value: number): boolean {
  if (value < 2) return false;
  if (value === 2) return true;
  if (value % 2 === 0) return false;
  for (let i = 3; i * i <= value; i += 2) {
    if (value % i === 0) return false;
  }
  return true;
}

export function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

export function isFinite(value: number): boolean {
  return Number.isFinite(value);
}

export function isInfinite(value: number): boolean {
  return !Number.isFinite(value) && !Number.isNaN(value);
}

export function isNaN(value: number): boolean {
  return Number.isNaN(value);
}

export function nextPowerOfTwo(value: number): number {
  if (value <= 0) return 1;
  return Math.pow(2, Math.ceil(Math.log2(value)));
}

export function previousPowerOfTwo(value: number): number {
  if (value <= 0) return 0;
  return Math.pow(2, Math.floor(Math.log2(value)));
}

export function factorial(n: number): number {
  if (n < 0) return NaN;
  if (n > 170) return Infinity;
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b > 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

export function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return Math.abs(a * b) / gcd(a, b);
}

export function fibonacci(n: number): number {
  if (n < 0) return NaN;
  if (n <= 1) return n;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    [a, b] = [b, a + b];
  }
  return b;
}

export function fibonacciSequence(n: number): number[] {
  const seq: number[] = [];
  for (let i = 0; i < n; i++) {
    seq.push(fibonacci(i));
  }
  return seq;
}

export function primeFactors(n: number): number[] {
  const factors: number[] = [];
  let num = Math.abs(n);
  for (let i = 2; i * i <= num; i++) {
    while (num % i === 0) {
      factors.push(i);
      num = Math.floor(num / i);
    }
  }
  if (num > 1) factors.push(num);
  return factors;
}

export function divisors(n: number): number[] {
  const result: number[] = [];
  const absN = Math.abs(n);
  for (let i = 1; i * i <= absN; i++) {
    if (absN % i === 0) {
      result.push(i);
      if (i !== absN / i) result.push(absN / i);
    }
  }
  return result.sort((a, b) => a - b);
}

export function isPerfectSquare(n: number): boolean {
  if (n < 0) return false;
  const sqrt = Math.sqrt(n);
  return sqrt === Math.floor(sqrt);
}

export function isPerfectCube(n: number): boolean {
  if (n < 0) return false;
  const cbrt = Math.cbrt(n);
  return cbrt === Math.floor(cbrt);
}

export function digitSum(n: number): number {
  let sum = 0;
  let num = Math.abs(Math.floor(n));
  while (num > 0) {
    sum += num % 10;
    num = Math.floor(num / 10);
  }
  return sum;
}

export function digitCount(n: number): number {
  if (n === 0) return 1;
  return Math.floor(Math.log10(Math.abs(n))) + 1;
}

export function reverseDigits(n: number): number {
  const negative = n < 0;
  const reversed = parseInt(Math.abs(n).toString().split("").reverse().join(""));
  return negative ? -reversed : reversed;
}

export function digits(n: number): number[] {
  return Math.abs(Math.floor(n)).toString().split("").map(Number);
}

export function toRoman(n: number): string {
  if (n < 1 || n > 3999) throw new Error("Roman numerals only support 1-3999");
  const values = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const symbols = ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"];
  let result = "";
  let num = n;
  for (let i = 0; i < values.length; i++) {
    while (num >= values[i]) {
      result += symbols[i];
      num -= values[i];
    }
  }
  return result;
}

export function fromRoman(roman: string): number {
  const values: Record<string, number> = { M: 1000, D: 500, C: 100, L: 50, X: 10, V: 5, I: 1 };
  let result = 0;
  for (let i = 0; i < roman.length; i++) {
    const current = values[roman[i]];
    const next = values[roman[i + 1]];
    if (next && current < next) {
      result += next - current;
      i++;
    } else {
      result += current;
    }
  }
  return result;
}

export function toBinary(n: number): string {
  return (n >>> 0).toString(2);
}

export function fromBinary(binary: string): number {
  return parseInt(binary, 2);
}

export function toHex(n: number): string {
  return (n >>> 0).toString(16).toUpperCase();
}

export function fromHex(hex: string): number {
  return parseInt(hex, 16);
}

export function toOctal(n: number): string {
  return (n >>> 0).toString(8);
}

export function fromOctal(octal: string): number {
  return parseInt(octal, 8);
}

export function toBase(n: number, base: number): string {
  return (n >>> 0).toString(base);
}

export function fromBase(str: string, base: number): number {
  return parseInt(str, base);
}

export function percentage(value: number, total: number): number {
  if (total === 0) return 0;
  return (value / total) * 100;
}

export function percentageChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) return newValue > 0 ? 100 : 0;
  return ((newValue - oldValue) / Math.abs(oldValue)) * 100;
}

export function percentageDifference(a: number, b: number): number {
  if (a + b === 0) return 0;
  return (Math.abs(a - b) / ((a + b) / 2)) * 100;
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function mode(values: number[]): number[] {
  const freq = new Map<number, number>();
  let maxFreq = 0;
  for (const v of values) {
    const count = (freq.get(v) ?? 0) + 1;
    freq.set(v, count);
    maxFreq = Math.max(maxFreq, count);
  }
  return [...freq.entries()].filter(([, count]) => count === maxFreq).map(([v]) => v);
}

export function range(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values) - Math.min(...values);
}

export function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

export function product(values: number[]): number {
  return values.reduce((acc, v) => acc * v, 1);
}

export function min(values: number[]): number {
  return Math.min(...values);
}

export function max(values: number[]): number {
  return Math.max(...values);
}

export function variance(values: number[], sample: boolean = false): number {
  if (values.length < 2) return 0;
  const avg = average(values);
  const sqDiffs = values.map((v) => Math.pow(v - avg, 2));
  return sum(sqDiffs) / (sample ? values.length - 1 : values.length);
}

export function standardDeviation(values: number[], sample: boolean = false): number {
  return Math.sqrt(variance(values, sample));
}

export function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

export function percentile(values: number[], p: number): number {
  return quantile(values, p / 100);
}

export function quartiles(values: number[]): { q1: number; q2: number; q3: number } {
  return {
    q1: quantile(values, 0.25),
    q2: quantile(values, 0.5),
    q3: quantile(values, 0.75),
  };
}

export function interquartileRange(values: number[]): number {
  const { q1, q3 } = quartiles(values);
  return q3 - q1;
}

export function outliers(values: number[]): number[] {
  const { q1, q3 } = quartiles(values);
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;
  return values.filter((v) => v < lower || v > upper);
}

export function covariance(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length < 2) return 0;
  const avgA = average(a);
  const avgB = average(b);
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - avgA) * (b[i] - avgB);
  }
  return sum / (a.length - 1);
}

export function correlation(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length < 2) return 0;
  const cov = covariance(a, b);
  const stdA = standardDeviation(a, true);
  const stdB = standardDeviation(b, true);
  if (stdA === 0 || stdB === 0) return 0;
  return cov / (stdA * stdB);
}

export function movingAverage(values: number[], window: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    result.push(average(slice));
  }
  return result;
}

export function exponentialSmoothing(values: number[], alpha: number = 0.3): number[] {
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(alpha * values[i] + (1 - alpha) * result[i - 1]);
  }
  return result;
}

export function linearRegression(x: number[], y: number[]): { slope: number; intercept: number; r2: number } {
  const n = x.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 };
  const avgX = average(x);
  const avgY = average(y);
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (x[i] - avgX) * (y[i] - avgY);
    denominator += Math.pow(x[i] - avgX, 2);
  }
  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = avgY - slope * avgX;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = slope * x[i] + intercept;
    ssRes += Math.pow(y[i] - predicted, 2);
    ssTot += Math.pow(y[i] - avgY, 2);
  }
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  return { slope, intercept, r2 };
}

export function degToRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export function radToDeg(radians: number): number {
  return radians * (180 / Math.PI);
}

export function normalizeAngle(angle: number, max: number = 360): number {
  return ((angle % max) + max) % max;
}

export function angleBetween(x1: number, y1: number, x2: number, y2: number): number {
  return Math.atan2(y2 - y1, x2 - x1);
}

export function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

export function manhattanDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x2 - x1) + Math.abs(y2 - y1);
}

export function chebyshevDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
}

export function lerpAngle(start: number, end: number, t: number): number {
  const diff = normalizeAngle(end - start, 360);
  if (diff > 180) return normalizeAngle(start + (diff - 360) * t, 360);
  return normalizeAngle(start + diff * t, 360);
}

export function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  return remap(value, inMin, inMax, outMin, outMax);
}

export function constrain(value: number, min: number, max: number): number {
  return clamp(value, min, max);
}

export function wrapAround(value: number, min: number, max: number): number {
  const range = max - min;
  if (range === 0) return min;
  return min + ((value - min) % range + range) % range;
}

export function pingPong(value: number, min: number, max: number): number {
  const range = max - min;
  if (range === 0) return min;
  const normalized = ((value - min) % (range * 2) + range * 2) % (range * 2);
  return min + (normalized < range ? normalized : range * 2 - normalized);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp(invLerp(edge0, edge1, x), 0, 1);
  return t * t * (3 - 2 * t);
}

export function smootherstep(edge0: number, edge1: number, x: number): number {
  const t = clamp(invLerp(edge0, edge1, x), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function approach(current: number, target: number, delta: number): number {
  if (current < target) return Math.min(current + delta, target);
  if (current > target) return Math.max(current - delta, target);
  return target;
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export function randomGaussian(mean: number = 0, stdDev: number = 1): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return z * stdDev + mean;
}

export function randomChoice<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

export function shuffle<T>(array: T[]): T[] {
  let result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function sample<T>(array: T[], count: number): T[] {
  return shuffle(array).slice(0, count);
}

export function weightedRandom<T>(items: T[], weights: number[]): T {
  const totalWeight = sum(weights);
  let random = Math.random() * totalWeight;
  for (let i = 0; i < items.length; i++) {
    random -= weights[i];
    if (random <= 0) return items[i];
  }
  return items[items.length - 1];
}

export function formatFileSize(bytes: number): string {
  return formatBytes(bytes);
}

export function formatDuration(ms: number): string {
  if (ms < 0) return "-" + formatDuration(-ms);
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h ${m % 60}m`;
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function formatFrequency(hz: number): string {
  if (hz < 1000) return `${hz.toFixed(2)} Hz`;
  if (hz < 1000000) return `${(hz / 1000).toFixed(2)} kHz`;
  if (hz < 1000000000) return `${(hz / 1000000).toFixed(2)} MHz`;
  return `${(hz / 1000000000).toFixed(2)} GHz`;
}

export function formatBitrate(bps: number): string {
  if (bps < 1000) return `${bps} bps`;
  if (bps < 1000000) return `${(bps / 1000).toFixed(2)} Kbps`;
  if (bps < 1000000000) return `${(bps / 1000000).toFixed(2)} Mbps`;
  return `${(bps / 1000000000).toFixed(2)} Gbps`;
}

export function formatVoltage(volts: number): string {
  if (Math.abs(volts) < 1) return `${(volts * 1000).toFixed(2)} mV`;
  if (Math.abs(volts) < 1000) return `${volts.toFixed(2)} V`;
  return `${(volts / 1000).toFixed(2)} kV`;
}

export function formatCurrent(amps: number): string {
  if (Math.abs(amps) < 0.001) return `${(amps * 1000000).toFixed(2)} uA`;
  if (Math.abs(amps) < 1) return `${(amps * 1000).toFixed(2)} mA`;
  return `${amps.toFixed(2)} A`;
}

export function formatResistance(ohms: number): string {
  if (Math.abs(ohms) < 1000) return `${ohms.toFixed(2)} ohm`;
  if (Math.abs(ohms) < 1000000) return `${(ohms / 1000).toFixed(2)} kohm`;
  return `${(ohms / 1000000).toFixed(2)} Mohm`;
}

export function formatCapacitance(farads: number): string {
  if (Math.abs(farads) < 1e-9) return `${(farads * 1e12).toFixed(2)} pF`;
  if (Math.abs(farads) < 1e-6) return `${(farads * 1e9).toFixed(2)} nF`;
  if (Math.abs(farads) < 1e-3) return `${(farads * 1e6).toFixed(2)} uF`;
  if (Math.abs(farads) < 1) return `${(farads * 1000).toFixed(2)} mF`;
  return `${farads.toFixed(2)} F`;
}

export function formatWatts(watts: number): string {
  if (Math.abs(watts) < 0.001) return `${(watts * 1000000).toFixed(2)} uW`;
  if (Math.abs(watts) < 1) return `${(watts * 1000).toFixed(2)} mW`;
  if (Math.abs(watts) < 1000) return `${watts.toFixed(2)} W`;
  return `${(watts / 1000).toFixed(2)} kW`;
}

export function formatTemperature(kelvin: number, unit: "K" | "C" | "F" = "C"): string {
  switch (unit) {
    case "K": return `${kelvin.toFixed(2)} K`;
    case "C": return `${(kelvin - 273.15).toFixed(2)} C`;
    case "F": return `${((kelvin - 273.15) * 9 / 5 + 32).toFixed(2)} F`;
  }
}

export function kelvinToCelsius(k: number): number {
  return k - 273.15;
}

export function celsiusToKelvin(c: number): number {
  return c + 273.15;
}

export function kelvinToFahrenheit(k: number): number {
  return (k - 273.15) * 9 / 5 + 32;
}

export function fahrenheitToKelvin(f: number): number {
  return (f - 32) * 5 / 9 + 273.15;
}

export function celsiusToFahrenheit(c: number): number {
  return c * 9 / 5 + 32;
}

export function fahrenheitToCelsius(f: number): number {
  return (f - 32) * 5 / 9;
}
