/**
 * Search algorithms -- linear, binary, jump, interpolation, exponential, fibonacci, ternary
 * @module shared/algorithms
 */

export function linearSearch<T>(arr: T[], target: T): number {
  for (let i = 0; i < arr.length; i++) if (arr[i] === target) return i;
  return -1;
}
export function binarySearch<T>(arr: T[], target: T, compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): number {
  let left = 0, right = arr.length - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const cmp = compare(arr[mid], target);
    if (cmp === 0) return mid;
    if (cmp < 0) left = mid + 1; else right = mid - 1;
  }
  return -1;
}
export function jumpSearch<T>(arr: T[], target: T, compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): number {
  const n = arr.length;
  let step = Math.floor(Math.sqrt(n));
  let prev = 0;
  while (compare(arr[Math.min(step, n) - 1], target) < 0) { prev = step; step += Math.floor(Math.sqrt(n)); if (prev >= n) return -1; }
  while (compare(arr[prev], target) < 0) { prev++; if (prev === Math.min(step, n)) return -1; }
  if (compare(arr[prev], target) === 0) return prev;
  return -1;
}
export function interpolationSearch(arr: number[], target: number): number {
  let low = 0, high = arr.length - 1;
  while (low <= high && target >= arr[low] && target <= arr[high]) {
    if (low === high) { if (arr[low] === target) return low; return -1; }
    const pos = low + Math.floor(((high - low) / (arr[high] - arr[low])) * (target - arr[low]));
    if (arr[pos] === target) return pos;
    if (arr[pos] < target) low = pos + 1; else high = pos - 1;
  }
  return -1;
}
export function exponentialSearch<T>(arr: T[], target: T, compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): number {
  if (arr.length === 0) return -1;
    if (compare(arr[0], target) === 0) return 0;
  let i = 1;
  while (i < arr.length && compare(arr[i], target) <= 0) i *= 2;
  return binarySearch(arr.slice(Math.floor(i / 2), Math.min(i, arr.length)), target, compare) >= 0 ? Math.floor(i / 2) + binarySearch(arr.slice(Math.floor(i / 2), Math.min(i, arr.length)), target, compare) : -1;
}
export function fibonacciSearch<T>(arr: T[], target: T, compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): number {
  const n = arr.length;
  let fibM2 = 0, fibM1 = 1, fibM = fibM2 + fibM1;
  while (fibM < n) { fibM2 = fibM1; fibM1 = fibM; fibM = fibM2 + fibM1; }
  let offset = -1;
  while (fibM > 1) {
    const i = Math.min(offset + fibM2, n - 1);
    if (compare(arr[i], target) < 0) { fibM = fibM1; fibM1 = fibM2; fibM2 = fibM - fibM1; offset = i; }
    else if (compare(arr[i], target) > 0) { fibM = fibM2; fibM1 -= fibM2; fibM2 = fibM - fibM1; }
    else return i;
  }
  if (fibM1 === 1 && offset < n - 1 && compare(arr[offset + 1], target) === 0) return offset + 1;
  return -1;
}
export function ternarySearch<T>(arr: T[], target: T, compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): number {
  let left = 0, right = arr.length - 1;
  while (left <= right) {
    const mid1 = left + Math.floor((right - left) / 3);
    const mid2 = right - Math.floor((right - left) / 3);
    if (compare(arr[mid1], target) === 0) return mid1;
    if (compare(arr[mid2], target) === 0) return mid2;
    if (compare(arr[mid1], target) < 0) left = mid1 + 1; else if (compare(arr[mid2], target) > 0) right = mid2 - 1; else { left = mid1 + 1; right = mid2 - 1; }
  }
  return -1;
}
export function findFirst<T>(arr: T[], target: T, compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): number {
  let left = 0, right = arr.length - 1, result = -1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const cmp = compare(arr[mid], target);
    if (cmp === 0) { result = mid; right = mid - 1; } else if (cmp < 0) left = mid + 1; else right = mid - 1;
  }
  return result;
}
export function findLast<T>(arr: T[], target: T, compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): number {
  let left = 0, right = arr.length - 1, result = -1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const cmp = compare(arr[mid], target);
    if (cmp === 0) { result = mid; left = mid + 1; } else if (cmp < 0) left = mid + 1; else right = mid - 1;
  }
  return result;
}
export function countOccurrences<T>(arr: T[], target: T, compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): number {
  const first = findFirst(arr, target, compare);
  if (first === -1) return 0;
  const last = findLast(arr, target, compare);
  return last - first + 1;
}
export function findClosest<T>(arr: T[], target: T, compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): number {
  if (arr.length === 0) return -1;
  let left = 0, right = arr.length - 1;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (compare(arr[mid], target) < 0) left = mid + 1; else right = mid;
  }
  if (left > 0 && Math.abs(compare(arr[left - 1], target)) < Math.abs(compare(arr[left], target))) return left - 1;
  return left;
}

