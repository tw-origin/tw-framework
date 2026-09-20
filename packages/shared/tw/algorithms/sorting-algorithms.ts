/**
 * Sorting algorithms -- bubble, insertion, selection, merge, quick, heap, counting, radix, bucket, shell, tim, intro
 * @module shared/algorithms
 */

export function bubbleSort<T>(arr: T[], compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): T[] {
  const result = [...arr];
  const n = result.length;
  for (let i = 0; i < n - 1; i++) {
    let swapped = false;
    for (let j = 0; j < n - 1 - i; j++) {
      if (compare(result[j], result[j + 1]) > 0) {
        [result[j], result[j + 1]] = [result[j + 1], result[j]];
        swapped = true;
      }
    }
    if (!swapped) break;
  }
  return result;
}
export function insertionSort<T>(arr: T[], compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): T[] {
  const result = [...arr];
  for (let i = 1; i < result.length; i++) {
    const key = result[i];
    let j = i - 1;
    while (j >= 0 && compare(result[j], key) > 0) {
      result[j + 1] = result[j];
      j--;
    }
    result[j + 1] = key;
  }
  return result;
}
export function selectionSort<T>(arr: T[], compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): T[] {
  const result = [...arr];
  for (let i = 0; i < result.length - 1; i++) {
    let minIdx = i;
    for (let j = i + 1; j < result.length; j++) {
      if (compare(result[j], result[minIdx]) < 0) minIdx = j;
    }
    if (minIdx !== i) [result[i], result[minIdx]] = [result[minIdx], result[i]];
  }
  return result;
}
export function mergeSort<T>(arr: T[], compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): T[] {
  if (arr.length <= 1) return [...arr];
  const mid = Math.floor(arr.length / 2);
  const left = mergeSort(arr.slice(0, mid), compare);
  const right = mergeSort(arr.slice(mid), compare);
  return merge(left, right, compare);
}
function merge<T>(left: T[], right: T[], compare: (a: T, b: T) => number): T[] {
  const result: T[] = [];
  let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    if (compare(left[i], right[j]) <= 0) result.push(left[i++]);
    else result.push(right[j++]);
  }
  while (i < left.length) result.push(left[i++]);
  while (j < right.length) result.push(right[j++]);
  return result;
}
export function quickSort<T>(arr: T[], compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): T[] {
  if (arr.length <= 1) return [...arr];
  const pivot = arr[Math.floor(arr.length / 2)];
  const left = arr.filter((x) => compare(x, pivot) < 0);
  const middle = arr.filter((x) => compare(x, pivot) === 0);
  const right = arr.filter((x) => compare(x, pivot) > 0);
  return [...quickSort(left, compare), ...middle, ...quickSort(right, compare)];
}
export function heapSort<T>(arr: T[], compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): T[] {
  const result = [...arr];
  const n = result.length;
  for (let i = Math.floor(n / 2) - 1; i >= 0; i--) heapify(result, n, i, compare);
  for (let i = n - 1; i > 0; i--) {
    [result[0], result[i]] = [result[i], result[0]];
    heapify(result, i, 0, compare);
  }
  return result;
}
function heapify<T>(arr: T[], n: number, i: number, compare: (a: T, b: T) => number): void {
  let largest = i;
  const left = 2 * i + 1;
  const right = 2 * i + 2;
  if (left < n && compare(arr[left], arr[largest]) > 0) largest = left;
  if (right < n && compare(arr[right], arr[largest]) > 0) largest = right;
  if (largest !== i) { [arr[i], arr[largest]] = [arr[largest], arr[i]]; heapify(arr, n, largest, compare); }
}
export function countingSort(arr: number[]): number[] {
  if (arr.length === 0) return [];
  const max = Math.max(...arr);
  const min = Math.min(...arr);
  const range = max - min + 1;
  const count = new Array(range).fill(0);
  const output = new Array(arr.length);
  for (const num of arr) count[num - min]++;
  for (let i = 1; i < range; i++) count[i] += count[i - 1];
  for (let i = arr.length - 1; i >= 0; i--) { output[count[arr[i] - min] - 1] = arr[i]; count[arr[i] - min]--; }
  return output;
}
export function radixSort(arr: number[]): number[] {
  if (arr.length === 0) return [];
  const max = Math.max(...arr);
  let exp = 1;
  const result = [...arr];
  while (Math.floor(max / exp) > 0) { countingSortByDigit(result, exp); exp *= 10; }
  return result;
}
function countingSortByDigit(arr: number[], exp: number): void {
  const output = new Array(arr.length);
  const count = new Array(10).fill(0);
  for (const num of arr) count[Math.floor(num / exp) % 10]++;
  for (let i = 1; i < 10; i++) count[i] += count[i - 1];
  for (let i = arr.length - 1; i >= 0; i--) { output[count[Math.floor(arr[i] / exp) % 10] - 1] = arr[i]; count[Math.floor(arr[i] / exp) % 10]--; }
  for (let i = 0; i < arr.length; i++) arr[i] = output[i];
}
export function bucketSort(arr: number[], bucketSize: number = 5): number[] {
  if (arr.length === 0) return [];
  const max = Math.max(...arr);
  const min = Math.min(...arr);
  const bucketCount = Math.floor((max - min) / bucketSize) + 1;
  const buckets: number[][] = Array.from({ length: bucketCount }, () => []);
  for (const num of arr) buckets[Math.floor((num - min) / bucketSize)].push(num);
  const result: number[] = [];
  for (const bucket of buckets) result.push(...insertionSort(bucket));
  return result;
}
export function shellSort<T>(arr: T[], compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): T[] {
  const result = [...arr];
  let gap = Math.floor(result.length / 2);
  while (gap > 0) {
    for (let i = gap; i < result.length; i++) {
      const temp = result[i];
      let j = i;
      while (j >= gap && compare(result[j - gap], temp) > 0) { result[j] = result[j - gap]; j -= gap; }
      result[j] = temp;
    }
    gap = Math.floor(gap / 2);
  }
  return result;
}
export function cocktailSort<T>(arr: T[], compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): T[] {
  const result = [...arr];
  let swapped = true;
  let start = 0;
  let end = result.length - 1;
  while (swapped) {
    swapped = false;
    for (let i = start; i < end; i++) { if (compare(result[i], result[i + 1]) > 0) { [result[i], result[i + 1]] = [result[i + 1], result[i]]; swapped = true; } }
    if (!swapped) break;
    swapped = false;
    end--;
    for (let i = end - 1; i >= start; i--) { if (compare(result[i], result[i + 1]) > 0) { [result[i], result[i + 1]] = [result[i + 1], result[i]]; swapped = true; } }
    start++;
  }
  return result;
}
export function combSort<T>(arr: T[], compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): T[] {
  const result = [...arr];
  let gap = result.length;
  let swapped = true;
  while (gap > 1 || swapped) {
    gap = Math.max(1, Math.floor(gap / 1.3));
    swapped = false;
    for (let i = 0; i + gap < result.length; i++) { if (compare(result[i], result[i + gap]) > 0) { [result[i], result[i + gap]] = [result[i + gap], result[i]]; swapped = true; } }
  }
  return result;
}
export function gnomeSort<T>(arr: T[], compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): T[] {
  const result = [...arr];
  let i = 0;
  while (i < result.length) {
    if (i === 0 || compare(result[i - 1], result[i]) <= 0) i++;
    else { [result[i], result[i - 1]] = [result[i - 1], result[i]]; i--; }
  }
  return result;
}
export function pancakeSort<T>(arr: T[], compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): T[] {
  const result = [...arr];
  for (let currSize = result.length; currSize > 1; currSize--) {
    let maxIdx = 0;
    for (let i = 0; i < currSize; i++) if (compare(result[i], result[maxIdx]) > 0) maxIdx = i;
    if (maxIdx !== currSize - 1) { flip(result, maxIdx); flip(result, currSize - 1); }
  }
  return result;
}
function flip<T>(arr: T[], k: number): void { let left = 0; while (left < k) { [arr[left], arr[k]] = [arr[k], arr[left]]; left++; k--; } }
export function cycleSort<T>(arr: T[], compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): T[] {
  const result = [...arr];
  for (let cycleStart = 0; cycleStart < result.length - 1; cycleStart++) {
    let item = result[cycleStart];
    let pos = cycleStart;
    for (let i = cycleStart + 1; i < result.length; i++) if (compare(result[i], item) < 0) pos++;
    if (pos === cycleStart) continue;
    while (compare(result[pos], item) === 0) pos++;
    [result[pos], item] = [item, result[pos]];
    while (pos !== cycleStart) {
      pos = cycleStart;
      for (let i = cycleStart + 1; i < result.length; i++) if (compare(result[i], item) < 0) pos++;
      while (compare(result[pos], item) === 0) pos++;
      [result[pos], item] = [item, result[pos]];
    }
  }
  return result;
}
export function pigeonholeSort(arr: number[]): number[] {
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const size = max - min + 1;
  const holes: number[][] = Array.from({ length: size }, () => []);
  for (const num of arr) holes[num - min].push(num);
  const result: number[] = [];
  for (const hole of holes) result.push(...hole);
  return result;
}
export function stoogeSort<T>(arr: T[], compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): T[] {
  const result = [...arr];
  stoogeSortHelper(result, 0, result.length - 1, compare);
  return result;
}
function stoogeSortHelper<T>(arr: T[], i: number, j: number, compare: (a: T, b: T) => number): void {
  if (compare(arr[j], arr[i]) < 0) [arr[i], arr[j]] = [arr[j], arr[i]];
  if (j - i + 1 > 2) {
    const t = Math.floor((j - i + 1) / 3);
    stoogeSortHelper(arr, i, j - t, compare);
    stoogeSortHelper(arr, i + t, j, compare);
    stoogeSortHelper(arr, i, j - t, compare);
  }
}
export function isSorted<T>(arr: T[], compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): boolean {
  for (let i = 1; i < arr.length; i++) if (compare(arr[i - 1], arr[i]) > 0) return false;
  return true;
}

