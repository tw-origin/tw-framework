/**
 * Sorting algorithms -- quicksort, mergesort, heapsort, radix sort, etc.
 * @module shared/algorithms
 */

export type CompareFn<T> = (a: T, b: T) => number;

export function defaultCompare<T>(a: T, b: T): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function bubbleSort<T>(arr: T[], compare: CompareFn<T> = defaultCompare): T[] {
  const result = [...arr];
  const n = result.length;
  for (let i = 0; i < n - 1; i++) {
    let swapped = false;
    for (let j = 0; j < n - i - 1; j++) {
      if (compare(result[j], result[j + 1]) > 0) {
        [result[j], result[j + 1]] = [result[j + 1], result[j]];
        swapped = true;
      }
    }
    if (!swapped) break;
  }
  return result;
}

export function selectionSort<T>(arr: T[], compare: CompareFn<T> = defaultCompare): T[] {
  const result = [...arr];
  const n = result.length;
  for (let i = 0; i < n - 1; i++) {
    let minIdx = i;
    for (let j = i + 1; j < n; j++) {
      if (compare(result[j], result[minIdx]) < 0) {
        minIdx = j;
      }
    }
    if (minIdx !== i) {
      [result[i], result[minIdx]] = [result[minIdx], result[i]];
    }
  }
  return result;
}

export function insertionSort<T>(arr: T[], compare: CompareFn<T> = defaultCompare): T[] {
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

export function mergeSort<T>(arr: T[], compare: CompareFn<T> = defaultCompare): T[] {
  if (arr.length <= 1) return [...arr];
  const mid = Math.floor(arr.length / 2);
  let left = mergeSort(arr.slice(0, mid), compare);
  const right = mergeSort(arr.slice(mid), compare);
  return merge(left, right, compare);
}

function merge<T>(left: T[], right: T[], compare: CompareFn<T>): T[] {
  const result: T[] = [];
  let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    if (compare(left[i], right[j]) <= 0) {
      result.push(left[i++]);
    } else {
      result.push(right[j++]);
    }
  }
  while (i < left.length) result.push(left[i++]);
  while (j < right.length) result.push(right[j++]);
  return result;
}

export function quickSort<T>(arr: T[], compare: CompareFn<T> = defaultCompare): T[] {
  if (arr.length <= 1) return [...arr];
  const result = [...arr];
  quickSortHelper(result, 0, result.length - 1, compare);
  return result;
}

function quickSortHelper<T>(arr: T[], low: number, high: number, compare: CompareFn<T>): void {
  if (low < high) {
    const pi = qsortPartition(arr, low, high, compare);
    quickSortHelper(arr, low, pi - 1, compare);
    quickSortHelper(arr, pi + 1, high, compare);
  }
}

function qsortPartition<T>(arr: T[], low: number, high: number, compare: CompareFn<T>): number {
  const pivot = arr[high];
  let i = low - 1;
  for (let j = low; j < high; j++) {
    if (compare(arr[j], pivot) <= 0) {
      i++;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
  [arr[i + 1], arr[high]] = [arr[high], arr[i + 1]];
  return i + 1;
}

export function heapSort<T>(arr: T[], compare: CompareFn<T> = defaultCompare): T[] {
  const result = [...arr];
  const n = result.length;
  for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
    heapify(result, n, i, compare);
  }
  for (let i = n - 1; i > 0; i--) {
    [result[0], result[i]] = [result[i], result[0]];
    heapify(result, i, 0, compare);
  }
  return result;
}

function heapify<T>(arr: T[], n: number, i: number, compare: CompareFn<T>): void {
  let largest = i;
  const left = 2 * i + 1;
  const right = 2 * i + 2;
  if (left < n && compare(arr[left], arr[largest]) > 0) largest = left;
  if (right < n && compare(arr[right], arr[largest]) > 0) largest = right;
  if (largest !== i) {
    [arr[i], arr[largest]] = [arr[largest], arr[i]];
    heapify(arr, n, largest, compare);
  }
}

export function shellSort<T>(arr: T[], compare: CompareFn<T> = defaultCompare): T[] {
  const result = [...arr];
  const n = result.length;
  for (let gap = Math.floor(n / 2); gap > 0; gap = Math.floor(gap / 2)) {
    for (let i = gap; i < n; i++) {
      const temp = result[i];
      let j = i;
      while (j >= gap && compare(result[j - gap], temp) > 0) {
        result[j] = result[j - gap];
        j -= gap;
      }
      result[j] = temp;
    }
  }
  return result;
}

export function countingSort(arr: number[], maxVal?: number): number[] {
  if (arr.length === 0) return [];
  const max = maxVal ?? Math.max(...arr);
  const count = new Array(max + 1).fill(0);
  const output = new Array(arr.length);
  for (const num of arr) count[num]++;
  for (let i = 1; i <= max; i++) count[i] += count[i - 1];
  for (let i = arr.length - 1; i >= 0; i--) {
    output[count[arr[i]] - 1] = arr[i];
    count[arr[i]]--;
  }
  return output;
}

export function radixSort(arr: number[]): number[] {
  if (arr.length === 0) return [];
  const max = Math.max(...arr.map(Math.abs));
  const maxDigits = Math.floor(Math.log10(max)) + 1;
  let result = [...arr];
  for (let digit = 0; digit < maxDigits; digit++) {
    const buckets: number[][] = Array(10).fill(null).map(() => []);
    for (const num of result) {
      const digitValue = Math.floor(Math.abs(num) / Math.pow(10, digit)) % 10;
      buckets[digitValue].push(num);
    }
    result = buckets.flat();
  }
  const negatives = result.filter(n => n < 0).sort((a, b) => b - a);
  const positives = result.filter(n => n >= 0);
  return [...negatives, ...positives];
}

export function bucketSort(arr: number[], bucketSize: number = 5): number[] {
  if (arr.length === 0) return [];
  const max = Math.max(...arr);
  const min = Math.min(...arr);
  const bucketCount = Math.floor((max - min) / bucketSize) + 1;
  const buckets: number[][] = Array(bucketCount).fill(null).map(() => []);
  for (const num of arr) {
    const bucketIndex = Math.floor((num - min) / bucketSize);
    buckets[bucketIndex].push(num);
  }
  const result: number[] = [];
  for (const bucket of buckets) {
    insertionSort(bucket, (a, b) => a - b);
    result.push(...bucket);
  }
  return result;
}

export function cocktailSort<T>(arr: T[], compare: CompareFn<T> = defaultCompare): T[] {
  const result = [...arr];
  let start = 0;
  let end = result.length - 1;
  let swapped = true;
  while (swapped) {
    swapped = false;
    for (let i = start; i < end; i++) {
      if (compare(result[i], result[i + 1]) > 0) {
        [result[i], result[i + 1]] = [result[i + 1], result[i]];
        swapped = true;
      }
    }
    if (!swapped) break;
    end--;
    swapped = false;
    for (let i = end - 1; i >= start; i--) {
      if (compare(result[i], result[i + 1]) > 0) {
        [result[i], result[i + 1]] = [result[i + 1], result[i]];
        swapped = true;
      }
    }
    start++;
  }
  return result;
}

export function combSort<T>(arr: T[], compare: CompareFn<T> = defaultCompare): T[] {
  const result = [...arr];
  const n = result.length;
  let gap = n;
  const shrink = 1.3;
  let swapped = true;
  while (gap > 1 || swapped) {
    gap = Math.floor(gap / shrink);
    if (gap < 1) gap = 1;
    swapped = false;
    for (let i = 0; i + gap < n; i++) {
      if (compare(result[i], result[i + gap]) > 0) {
        [result[i], result[i + gap]] = [result[i + gap], result[i]];
        swapped = true;
      }
    }
  }
  return result;
}

export function gnomeSort<T>(arr: T[], compare: CompareFn<T> = defaultCompare): T[] {
  const result = [...arr];
  let i = 0;
  while (i < result.length) {
    if (i === 0 || compare(result[i - 1], result[i]) <= 0) {
      i++;
    } else {
      [result[i], result[i - 1]] = [result[i - 1], result[i]];
      i--;
    }
  }
  return result;
}

export function pancakeSort<T>(arr: T[], compare: CompareFn<T> = defaultCompare): T[] {
  const result = [...arr];
  for (let currSize = result.length; currSize > 1; currSize--) {
    let maxIdx = 0;
    for (let i = 1; i < currSize; i++) {
      if (compare(result[i], result[maxIdx]) > 0) maxIdx = i;
    }
    if (maxIdx !== currSize - 1) {
      flip(result, maxIdx);
      flip(result, currSize - 1);
    }
  }
  return result;
}

function flip<T>(arr: T[], n: number): void {
  let start = 0;
  while (start < n) {
    [arr[start], arr[n]] = [arr[n], arr[start]];
    start++;
    n--;
  }
}

export function stoogeSort<T>(arr: T[], compare: CompareFn<T> = defaultCompare): T[] {
  const result = [...arr];
  stoogeSortHelper(result, 0, result.length - 1, compare);
  return result;
}

function stoogeSortHelper<T>(arr: T[], low: number, high: number, compare: CompareFn<T>): void {
  if (low >= high) return;
  if (compare(arr[low], arr[high]) > 0) {
    [arr[low], arr[high]] = [arr[high], arr[low]];
  }
  if (high - low + 1 > 2) {
    const t = Math.floor((high - low + 1) / 3);
    stoogeSortHelper(arr, low, high - t, compare);
    stoogeSortHelper(arr, low + t, high, compare);
    stoogeSortHelper(arr, low, high - t, compare);
  }
}

export function cycleSort<T>(arr: T[], compare: CompareFn<T> = defaultCompare): T[] {
  const result = [...arr];
  const n = result.length;
  for (let cycleStart = 0; cycleStart < n - 1; cycleStart++) {
    let item = result[cycleStart];
    let pos = cycleStart;
    for (let i = cycleStart + 1; i < n; i++) {
      if (compare(result[i], item) < 0) pos++;
    }
    if (pos === cycleStart) continue;
    while (compare(item, result[pos]) === 0) pos++;
    [result[pos], item] = [item, result[pos]];
    while (pos !== cycleStart) {
      pos = cycleStart;
      for (let i = cycleStart + 1; i < n; i++) {
        if (compare(result[i], item) < 0) pos++;
      }
      while (compare(item, result[pos]) === 0) pos++;
      [result[pos], item] = [item, result[pos]];
    }
  }
  return result;
}

export function pigeonholeSort(arr: number[]): number[] {
  if (arr.length === 0) return [];
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const range = max - min + 1;
  const holes: number[][] = Array(range).fill(null).map(() => []);
  for (const num of arr) {
    holes[num - min].push(num);
  }
  return holes.flat();
}

export function timSort<T>(arr: T[], compare: CompareFn<T> = defaultCompare): T[] {
  const RUN = 32;
  const result = [...arr];
  const n = result.length;
  for (let i = 0; i < n; i += RUN) {
    insertionSortRange(result, i, Math.min(i + RUN - 1, n - 1), compare);
  }
  for (let size = RUN; size < n; size *= 2) {
    for (let left = 0; left < n; left += 2 * size) {
      const mid = left + size - 1;
      const right = Math.min(left + 2 * size - 1, n - 1);
      if (mid < right) {
        mergeRange(result, left, mid, right, compare);
      }
    }
  }
  return result;
}

function insertionSortRange<T>(arr: T[], left: number, right: number, compare: CompareFn<T>): void {
  for (let i = left + 1; i <= right; i++) {
    const key = arr[i];
    let j = i - 1;
    while (j >= left && compare(arr[j], key) > 0) {
      arr[j + 1] = arr[j];
      j--;
    }
    arr[j + 1] = key;
  }
}

function mergeRange<T>(arr: T[], left: number, mid: number, right: number, compare: CompareFn<T>): void {
  const leftArr = arr.slice(left, mid + 1);
  const rightArr = arr.slice(mid + 1, right + 1);
  let i = 0, j = 0, k = left;
  while (i < leftArr.length && j < rightArr.length) {
    if (compare(leftArr[i], rightArr[j]) <= 0) {
      arr[k++] = leftArr[i++];
    } else {
      arr[k++] = rightArr[j++];
    }
  }
  while (i < leftArr.length) arr[k++] = leftArr[i++];
  while (j < rightArr.length) arr[k++] = rightArr[j++];
}

export function isSorted<T>(arr: T[], compare: CompareFn<T> = defaultCompare): boolean {
  for (let i = 1; i < arr.length; i++) {
    if (compare(arr[i - 1], arr[i]) > 0) return false;
  }
  return true;
}

export function sort<T>(arr: T[], compare: CompareFn<T> = defaultCompare): T[] {
  return quickSort(arr, compare);
}

export function stableSort<T>(arr: T[], compare: CompareFn<T> = defaultCompare): T[] {
  return mergeSort(arr, compare);
}

export function sortBy<T>(arr: T[], key: (item: T) => number | string): T[] {
  return mergeSort(arr, (a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    return 0;
  });
}

export function sortByMultiple<T>(arr: T[], keys: Array<{ key: (item: T) => number | string; descending?: boolean }>): T[] {
  return mergeSort(arr, (a, b) => {
    for (const { key, descending } of keys) {
      const ka = key(a);
      const kb = key(b);
      if (ka < kb) return descending ? 1 : -1;
      if (ka > kb) return descending ? -1 : 1;
    }
    return 0;
  });
}

export function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

export function uniqueBy<T>(arr: T[], key: (item: T) => unknown): T[] {
  const seen = new Set<unknown>();
  const result: T[] = [];
  for (const item of arr) {
    const k = key(item);
    if (!seen.has(k)) {
      seen.add(k);
      result.push(item);
    }
  }
  return result;
}

export function partition<T>(arr: T[], predicate: (item: T) => boolean): [T[], T[]] {
  const truthy: T[] = [];
  const falsy: T[] = [];
  for (const item of arr) {
    if (predicate(item)) truthy.push(item);
    else falsy.push(item);
  }
  return [truthy, falsy];
}

export function groupBy<T, K extends string>(arr: T[], key: (item: T) => K): Record<K, T[]> {
  const result = {} as Record<K, T[]>;
  for (const item of arr) {
    const k = key(item);
    if (!result[k]) result[k] = [];
    result[k].push(item);
  }
  return result;
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

export function flatten<T>(arr: T[][]): T[] {
  return arr.flat();
}

export function flattenDeep<T>(arr: unknown[]): T[] {
  return arr.reduce<T[]>((acc, val) => {
    if (Array.isArray(val)) {
      return acc.concat(flattenDeep(val));
    }
    return acc.concat(val as T);
  }, []);
}

export function range(start: number, end: number, step: number = 1): number[] {
  const result: number[] = [];
  if (step > 0) {
    for (let i = start; i < end; i += step) result.push(i);
  } else {
    for (let i = start; i > end; i += step) result.push(i);
  }
  return result;
}

export function zip<A, B>(a: A[], b: B[]): Array<[A, B]> {
  const length = Math.min(a.length, b.length);
  const result: Array<[A, B]> = [];
  for (let i = 0; i < length; i++) {
    result.push([a[i], b[i]]);
  }
  return result;
}

export function zipLongest<A, B>(a: A[], b: B[], fillA?: A, fillB?: B): Array<[A | undefined, B | undefined]> {
  const length = Math.max(a.length, b.length);
  const result: Array<[A | undefined, B | undefined]> = [];
  for (let i = 0; i < length; i++) {
    result.push([a[i] ?? fillA, b[i] ?? fillB]);
  }
  return result;
}

export function interleave<A, B>(a: A[], b: B[]): Array<A | B> {
  const result: Array<A | B> = [];
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    if (i < a.length) result.push(a[i]);
    if (i < b.length) result.push(b[i]);
  }
  return result;
}

export function intercalate<T>(separator: T, arrays: T[][]): T[] {
  const result: T[] = [];
  for (let i = 0; i < arrays.length; i++) {
    if (i > 0) result.push(separator);
    result.push(...arrays[i]);
  }
  return result;
}

export function transpose<T>(matrix: T[][]): T[][] {
  if (matrix.length === 0) return [];
  const rows = matrix.length;
  const cols = matrix[0].length;
  const result: T[][] = Array(cols).fill(null).map(() => Array(rows).fill(null));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[j][i] = matrix[i][j];
    }
  }
  return result;
}

export function rotate<T>(arr: T[], positions: number): T[] {
  const n = arr.length;
  if (n === 0) return [];
  const k = ((positions % n) + n) % n;
  return [...arr.slice(k), ...arr.slice(0, k)];
}

export function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function sample<T>(arr: T[], count: number = 1): T[] {
  return shuffle(arr).slice(0, count);
}

export function sampleOne<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

export function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = quickSort(arr, (a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, n) => sum + n, 0) / arr.length;
}

export function mode(arr: number[]): number[] {
  const counts = new Map<number, number>();
  for (const num of arr) {
    counts.set(num, (counts.get(num) ?? 0) + 1);
  }
  const maxCount = Math.max(...counts.values());
  return [...counts.entries()].filter(([, count]) => count === maxCount).map(([num]) => num);
}

export function variance(arr: number[]): number {
  if (arr.length === 0) return 0;
  const avg = mean(arr);
  return arr.reduce((sum, n) => sum + Math.pow(n - avg, 2), 0) / arr.length;
}

export function standardDeviation(arr: number[]): number {
  return Math.sqrt(variance(arr));
}

export function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = quickSort(arr, (a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export function quartiles(arr: number[]): { q1: number; q2: number; q3: number } {
  return {
    q1: percentile(arr, 25),
    q2: percentile(arr, 50),
    q3: percentile(arr, 75),
  };
}

export function iqr(arr: number[]): number {
  const { q1, q3 } = quartiles(arr);
  return q3 - q1;
}

export function outliers(arr: number[]): number[] {
  const { q1, q3 } = quartiles(arr);
  const iqrValue = q3 - q1;
  const lowerBound = q1 - 1.5 * iqrValue;
  const upperBound = q3 + 1.5 * iqrValue;
  return arr.filter((n) => n < lowerBound || n > upperBound);
}

export function min(arr: number[]): number {
  return Math.min(...arr);
}

export function max(arr: number[]): number {
  return Math.max(...arr);
}

export function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

export function product(arr: number[]): number {
  return arr.reduce((a, b) => a * b, 1);
}

export function count<T>(arr: T[], predicate: (item: T) => boolean): number {
  return arr.filter(predicate).length;
}

export function countBy<T, K extends string>(arr: T[], key: (item: T) => K): Record<K, number> {
  const result = {} as Record<K, number>;
  for (const item of arr) {
    const k = key(item);
    result[k] = (result[k] ?? 0) + 1;
  }
  return result;
}

export function indexBy<T, K extends string>(arr: T[], key: (item: T) => K): Record<K, T> {
  const result = {} as Record<K, T>;
  for (const item of arr) {
    result[key(item)] = item;
  }
  return result;
}

export function difference<T>(arr1: T[], arr2: T[]): T[] {
  const set2 = new Set(arr2);
  return arr1.filter((item) => !set2.has(item));
}

export function intersection<T>(arr1: T[], arr2: T[]): T[] {
  const set2 = new Set(arr2);
  return arr1.filter((item) => set2.has(item));
}

export function union<T>(arr1: T[], arr2: T[]): T[] {
  return [...new Set([...arr1, ...arr2])];
}

export function symmetricDifference<T>(arr1: T[], arr2: T[]): T[] {
  const set1 = new Set(arr1);
  const set2 = new Set(arr2);
  return [...arr1.filter((item) => !set2.has(item)), ...arr2.filter((item) => !set1.has(item))];
}

export function isSubset<T>(arr1: T[], arr2: T[]): boolean {
  const set2 = new Set(arr2);
  return arr1.every((item) => set2.has(item));
}

export function isSuperset<T>(arr1: T[], arr2: T[]): boolean {
  return isSubset(arr2, arr1);
}

export function isDisjoint<T>(arr1: T[], arr2: T[]): boolean {
  const set2 = new Set(arr2);
  return arr1.every((item) => !set2.has(item));
}

export function cartesianProduct<A, B>(arr1: A[], arr2: B[]): Array<[A, B]> {
  const result: Array<[A, B]> = [];
  for (const a of arr1) {
    for (const b of arr2) {
      result.push([a, b]);
    }
  }
  return result;
}

export function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const perm of permutations(rest)) {
      result.push([arr[i], ...perm]);
    }
  }
  return result;
}

export function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  if (arr.length === k) return [arr];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map((c) => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

export function powerSet<T>(arr: T[]): T[][] {
  const result: T[][] = [[]];
  for (const item of arr) {
    const newSets = result.map((set) => [...set, item]);
    result.push(...newSets);
  }
  return result;
}

export function sliding<T>(arr: T[], size: number, step: number = 1): T[][] {
  const result: T[][] = [];
  for (let i = 0; i <= arr.length - size; i += step) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

export function window<T>(arr: T[], size: number): T[][] {
  return sliding(arr, size, 1);
}

export function pairwise<T>(arr: T[]): Array<[T, T]> {
  return sliding(arr, 2, 1) as Array<[T, T]>;
}

export function compact<T>(arr: (T | null | undefined | false | 0 | "")[]): T[] {
  return arr.filter((item) => Boolean(item)) as T[];
}

export function first<T>(arr: T[]): T | undefined {
  return arr[0];
}

export function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}

export function nth<T>(arr: T[], n: number): T | undefined {
  if (n < 0) return arr[arr.length + n];
  return arr[n];
}

export function take<T>(arr: T[], n: number): T[] {
  return arr.slice(0, n);
}

export function takeRight<T>(arr: T[], n: number): T[] {
  return arr.slice(arr.length - n);
}

export function takeWhile<T>(arr: T[], predicate: (item: T) => boolean): T[] {
  const result: T[] = [];
  for (const item of arr) {
    if (predicate(item)) result.push(item);
    else break;
  }
  return result;
}

export function takeRightWhile<T>(arr: T[], predicate: (item: T) => boolean): T[] {
  const result: T[] = [];
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) result.unshift(arr[i]);
    else break;
  }
  return result;
}

export function drop<T>(arr: T[], n: number): T[] {
  return arr.slice(n);
}

export function dropRight<T>(arr: T[], n: number): T[] {
  return arr.slice(0, arr.length - n);
}

export function dropWhile<T>(arr: T[], predicate: (item: T) => boolean): T[] {
  let i = 0;
  while (i < arr.length && predicate(arr[i])) i++;
  return arr.slice(i);
}

export function dropRightWhile<T>(arr: T[], predicate: (item: T) => boolean): T[] {
  let i = arr.length - 1;
  while (i >= 0 && predicate(arr[i])) i--;
  return arr.slice(0, i + 1);
}

export function without<T>(arr: T[], ...values: T[]): T[] {
  const set = new Set(values);
  return arr.filter((item) => !set.has(item));
}

export function pull<T>(arr: T[], ...values: T[]): T[] {
  const set = new Set(values);
  return arr.filter((item) => !set.has(item));
}

export function pullAll<T>(arr: T[], values: T[]): T[] {
  const set = new Set(values);
  return arr.filter((item) => !set.has(item));
}

export function pullAt<T>(arr: T[], indexes: number[]): T[] {
  const result: T[] = [];
  const sorted = [...indexes].sort((a, b) => b - a);
  for (const index of sorted) {
    if (index >= 0 && index < arr.length) {
      result.unshift(arr[index]);
    }
  }
  return result;
}

export function remove<T>(arr: T[], predicate: (item: T) => boolean): T[] {
  const result: T[] = [];
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) {
      result.unshift(arr.splice(i, 1)[0]);
    }
  }
  return result;
}

export function findIndex<T>(arr: T[], predicate: (item: T, index: number) => boolean): number {
  for (let i = 0; i < arr.length; i++) {
    if (predicate(arr[i], i)) return i;
  }
  return -1;
}

export function findLastIndex<T>(arr: T[], predicate: (item: T, index: number) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i], i)) return i;
  }
  return -1;
}

export function findFirst<T>(arr: T[], predicate: (item: T, index: number) => boolean): T | undefined {
  for (let i = 0; i < arr.length; i++) {
    if (predicate(arr[i], i)) return arr[i];
  }
  return undefined;
}

export function findLast<T>(arr: T[], predicate: (item: T, index: number) => boolean): T | undefined {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i], i)) return arr[i];
  }
  return undefined;
}

export function binarySearch<T>(arr: T[], value: T, compare: CompareFn<T> = defaultCompare): number {
  let low = 0;
  let high = arr.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const cmp = compare(arr[mid], value);
    if (cmp === 0) return mid;
    if (cmp < 0) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}

export function lowerBound<T>(arr: T[], value: T, compare: CompareFn<T> = defaultCompare): number {
  let low = 0;
  let high = arr.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (compare(arr[mid], value) < 0) low = mid + 1;
    else high = mid;
  }
  return low;
}

export function upperBound<T>(arr: T[], value: T, compare: CompareFn<T> = defaultCompare): number {
  let low = 0;
  let high = arr.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (compare(arr[mid], value) <= 0) low = mid + 1;
    else high = mid;
  }
  return low;
}

export function binaryInsert<T>(arr: T[], value: T, compare: CompareFn<T> = defaultCompare): number {
  const index = lowerBound(arr, value, compare);
  arr.splice(index, 0, value);
  return index;
}

export function binaryRemove<T>(arr: T[], value: T, compare: CompareFn<T> = defaultCompare): boolean {
  const index = binarySearch(arr, value, compare);
  if (index !== -1) {
    arr.splice(index, 1);
    return true;
  }
  return false;
}

export function countOccurrences<T>(arr: T[], value: T): number {
  return arr.filter((item) => item === value).length;
}

export function countOccurrencesBy<T>(arr: T[], key: (item: T) => unknown): Map<unknown, number> {
  const result = new Map<unknown, number>();
  for (const item of arr) {
    const k = key(item);
    result.set(k, (result.get(k) ?? 0) + 1);
  }
  return result;
}

export function frequencyMap<T>(arr: T[]): Map<T, number> {
  return countOccurrencesBy(arr, (item) => item) as Map<T, number>;
}

export function mostFrequent<T>(arr: T[]): T | undefined {
  const freq = frequencyMap(arr);
  let maxCount = 0;
  let mostFreq: T | undefined;
  for (const [item, count] of freq) {
    if (count > maxCount) {
      maxCount = count;
      mostFreq = item;
    }
  }
  return mostFreq;
}

export function leastFrequent<T>(arr: T[]): T | undefined {
  const freq = frequencyMap(arr);
  let minCount = Infinity;
  let leastFreq: T | undefined;
  for (const [item, count] of freq) {
    if (count < minCount) {
      minCount = count;
      leastFreq = item;
    }
  }
  return leastFreq;
}

export function reverse<T>(arr: T[]): T[] {
  return [...arr].reverse();
}

export function reverseInPlace<T>(arr: T[]): T[] {
  return arr.reverse();
}

export function rotateLeft<T>(arr: T[], positions: number): T[] {
  return rotate(arr, positions);
}

export function rotateRight<T>(arr: T[], positions: number): T[] {
  return rotate(arr, -positions);
}

export function swap<T>(arr: T[], i: number, j: number): void {
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

export function swapElements<T>(arr: T[], i: number, j: number): T[] {
  const result = [...arr];
  [result[i], result[j]] = [result[j], result[i]];
  return result;
}

export function move<T>(arr: T[], from: number, to: number): T[] {
  const result = [...arr];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}

export function fill<T>(arr: T[], value: T, start: number = 0, end: number = arr.length): T[] {
  const result = [...arr];
  for (let i = start; i < end && i < result.length; i++) {
    result[i] = value;
  }
  return result;
}

export function fillRange<T>(arr: T[], value: T, start: number = 0, end: number = arr.length): T[] {
  return fill(arr, value, start, end);
}

export function fillAll<T>(arr: T[], value: T): T[] {
  return arr.map(() => value);
}

export function fillFn<T>(arr: T[], fn: (index: number) => T): T[] {
  return arr.map((_, index) => fn(index));
}

export function fillRangeFn<T>(arr: T[], fn: (index: number) => T, start: number = 0, end: number = arr.length): T[] {
  const result = [...arr];
  for (let i = start; i < end && i < result.length; i++) {
    result[i] = fn(i);
  }
  return result;
}

export function copy<T>(arr: T[]): T[] {
  return [...arr];
}

export function copyWithin<T>(arr: T[], target: number, start: number = 0, end: number = arr.length): T[] {
  const result = [...arr];
  const copy = result.slice(start, end);
  for (let i = 0; i < copy.length && target + i < result.length; i++) {
    result[target + i] = copy[i];
  }
  return result;
}

export function concat<T>(...arrays: T[][]): T[] {
  return arrays.flat();
}

export function concatAll<T>(arr: T[][]): T[] {
  return arr.flat();
}

export function concatMap<T, U>(arr: T[], fn: (item: T, index: number) => U[]): U[] {
  return arr.flatMap(fn);
}

export function flattenDepth<T>(arr: unknown[], depth: number = 1): unknown[] {
  if (depth <= 0) return arr;
  return arr.reduce<unknown[]>((acc, val) => {
    if (Array.isArray(val)) {
      return acc.concat(flattenDepth(val, depth - 1));
    }
    return acc.concat(val);
  }, []);
}

export function deepFlatten<T>(arr: unknown[]): T[] {
  return flattenDepth(arr, Infinity) as T[];
}

export function unzip<A, B>(pairs: Array<[A, B]>): [A[], B[]] {
  const a: A[] = [];
  const b: B[] = [];
  for (const [x, y] of pairs) {
    a.push(x);
    b.push(y);
  }
  return [a, b];
}

export function unzip3<A, B, C>(triples: Array<[A, B, C]>): [A[], B[], C[]] {
  const a: A[] = [];
  const b: B[] = [];
  const c: C[] = [];
  for (const [x, y, z] of triples) {
    a.push(x);
    b.push(y);
    c.push(z);
  }
  return [a, b, c];
}

export function group<T>(arr: T[], n: number): T[][] {
  return chunk(arr, n);
}

export function batch<T>(arr: T[], size: number): T[][] {
  return chunk(arr, size);
}

export function paginate<T>(arr: T[], page: number, pageSize: number): { items: T[]; total: number; pages: number; currentPage: number } {
  let total = arr.length;
  const pages = Math.ceil(total / pageSize);
  const currentPage = Math.max(1, Math.min(page, pages));
  const start = (currentPage - 1) * pageSize;
  const items = arr.slice(start, start + pageSize);
  return { items, total, pages, currentPage };
}

export function sortByKey<T>(arr: T[], key: keyof T): T[] {
  return sortBy(arr, (item) => item[key] as unknown as number | string);
}

export function sortByKeyDesc<T>(arr: T[], key: keyof T): T[] {
  return sortBy(arr, (item) => item[key] as unknown as number | string).reverse();
}

export function groupSort<T>(arr: T[], groupKey: (item: T) => string, sortKey: (item: T) => number | string): Record<string, T[]> {
  const grouped = groupBy(arr, groupKey);
  for (const key in grouped) {
    grouped[key] = sortBy(grouped[key], sortKey);
  }
  return grouped;
}

export function aggregate<T, R>(arr: T[], key: (item: T) => string, aggregator: (items: T[]) => R): Record<string, R> {
  const grouped = groupBy(arr, key);
  const result: Record<string, R> = {};
  for (const [k, items] of Object.entries(grouped)) {
    result[k] = aggregator(items);
  }
  return result;
}

export function pivot<T>(arr: T[], rowKey: (item: T) => string, colKey: (item: T) => string, value: (item: T) => number): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  for (const item of arr) {
    const row = rowKey(item);
    const col = colKey(item);
    if (!result[row]) result[row] = {};
    result[row][col] = (result[row][col] ?? 0) + value(item);
  }
  return result;
}

export function unpivot(data: Record<string, Record<string, number>>): Array<{ row: string; col: string; value: number }> {
  const result: Array<{ row: string; col: string; value: number }> = [];
  for (const [row, cols] of Object.entries(data)) {
    for (const [col, value] of Object.entries(cols)) {
      result.push({ row, col, value });
    }
  }
  return result;
}

export function crossJoin<A, B>(a: A[], b: B[]): Array<{ a: A; b: B }> {
  return cartesianProduct(a, b).map(([a, b]) => ({ a, b }));
}

export function innerJoin<A, B>(a: A[], b: B[], condition: (a: A, b: B) => boolean): Array<{ a: A; b: B }> {
  const result: Array<{ a: A; b: B }> = [];
  for (const itemA of a) {
    for (const itemB of b) {
      if (condition(itemA, itemB)) {
        result.push({ a: itemA, b: itemB });
      }
    }
  }
  return result;
}

export function leftJoin<A, B>(a: A[], b: B[], condition: (a: A, b: B) => boolean): Array<{ a: A; b: B | null }> {
  const result: Array<{ a: A; b: B | null }> = [];
  for (const itemA of a) {
    let matched = false;
    for (const itemB of b) {
      if (condition(itemA, itemB)) {
        result.push({ a: itemA, b: itemB });
        matched = true;
      }
    }
    if (!matched) {
      result.push({ a: itemA, b: null });
    }
  }
  return result;
}

export function rightJoin<A, B>(a: A[], b: B[], condition: (a: A, b: B) => boolean): Array<{ a: A | null; b: B }> {
  const result: Array<{ a: A | null; b: B }> = [];
  for (const itemB of b) {
    let matched = false;
    for (const itemA of a) {
      if (condition(itemA, itemB)) {
        result.push({ a: itemA, b: itemB });
        matched = true;
      }
    }
    if (!matched) {
      result.push({ a: null, b: itemB });
    }
  }
  return result;
}

export function fullJoin<A, B>(a: A[], b: B[], condition: (a: A, b: B) => boolean): Array<{ a: A | null; b: B | null }> {
  const result: Array<{ a: A | null; b: B | null }> = [];
  const matchedB = new Set<number>();
  for (const itemA of a) {
    let matched = false;
    for (let i = 0; i < b.length; i++) {
      if (condition(itemA, b[i])) {
        result.push({ a: itemA, b: b[i] });
        matched = true;
        matchedB.add(i);
      }
    }
    if (!matched) {
      result.push({ a: itemA, b: null });
    }
  }
  for (let i = 0; i < b.length; i++) {
    if (!matchedB.has(i)) {
      result.push({ a: null, b: b[i] });
    }
  }
  return result;
}

export function semiJoin<A, B>(a: A[], b: B[], condition: (a: A, b: B) => boolean): A[] {
  return a.filter((itemA) => b.some((itemB) => condition(itemA, itemB)));
}

export function antiJoin<A, B>(a: A[], b: B[], condition: (a: A, b: B) => boolean): A[] {
  return a.filter((itemA) => !b.some((itemB) => condition(itemA, itemB)));
}

export function distinct<T>(arr: T[]): T[] {
  return unique(arr);
}

export function distinctBy<T>(arr: T[], key: (item: T) => unknown): T[] {
  return uniqueBy(arr, key);
}

export function distinctUntilChanged<T>(arr: T[], compare?: (a: T, b: T) => boolean): T[] {
  if (arr.length === 0) return [];
  const result: T[] = [arr[0]];
  for (let i = 1; i < arr.length; i++) {
    const prev = result[result.length - 1];
    if (compare ? !compare(prev, arr[i]) : prev !== arr[i]) {
      result.push(arr[i]);
    }
  }
  return result;
}

export function runningTotal(arr: number[]): number[] {
  const result: number[] = [];
  let total = 0;
  for (const num of arr) {
    total += num;
    result.push(total);
  }
  return result;
}

export function runningAverage(arr: number[]): number[] {
  const result: number[] = [];
  let total = 0;
  for (let i = 0; i < arr.length; i++) {
    total += arr[i];
    result.push(total / (i + 1));
  }
  return result;
}

export function runningMax(arr: number[]): number[] {
  const result: number[] = [];
  let max = -Infinity;
  for (const num of arr) {
    max = Math.max(max, num);
    result.push(max);
  }
  return result;
}

export function runningMin(arr: number[]): number[] {
  const result: number[] = [];
  let min = Infinity;
  for (const num of arr) {
    min = Math.min(min, num);
    result.push(min);
  }
  return result;
}

export function runningProduct(arr: number[]): number[] {
  const result: number[] = [];
  let product = 1;
  for (const num of arr) {
    product *= num;
    result.push(product);
  }
  return result;
}

export function diff(arr: number[]): number[] {
  const result: number[] = [];
  for (let i = 1; i < arr.length; i++) {
    result.push(arr[i] - arr[i - 1]);
  }
  return result;
}

export function percentChange(arr: number[]): number[] {
  const result: number[] = [];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i - 1] === 0) {
      result.push(0);
    } else {
      result.push(((arr[i] - arr[i - 1]) / arr[i - 1]) * 100);
    }
  }
  return result;
}

export function movingAverage(arr: number[], window: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = arr.slice(start, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return result;
}

export function exponentialMovingAverage(arr: number[], alpha: number = 0.3): number[] {
  const result: number[] = [];
  let ema = arr[0] ?? 0;
  for (const num of arr) {
    ema = alpha * num + (1 - alpha) * ema;
    result.push(ema);
  }
  return result;
}

export function weightedAverage(arr: number[], weights: number[]): number {
  if (arr.length === 0 || arr.length !== weights.length) return 0;
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight === 0) return 0;
  return arr.reduce((sum, val, i) => sum + val * weights[i], 0) / totalWeight;
}

export function geometricMean(arr: number[]): number {
  if (arr.length === 0) return 0;
  const product = arr.reduce((a, b) => a * b, 1);
  return Math.pow(product, 1 / arr.length);
}

export function harmonicMean(arr: number[]): number {
  if (arr.length === 0) return 0;
  if (arr.some((n) => n === 0)) return 0;
  return arr.length / arr.reduce((sum, n) => sum + 1 / n, 0);
}

export function rootMeanSquare(arr: number[]): number {
  if (arr.length === 0) return 0;
  return Math.sqrt(arr.reduce((sum, n) => sum + n * n, 0) / arr.length);
}

export function covariance(arr1: number[], arr2: number[]): number {
  if (arr1.length !== arr2.length || arr1.length === 0) return 0;
  const mean1 = mean(arr1);
  const mean2 = mean(arr2);
  let sum = 0;
  for (let i = 0; i < arr1.length; i++) {
    sum += (arr1[i] - mean1) * (arr2[i] - mean2);
  }
  return sum / arr1.length;
}

export function correlation(arr1: number[], arr2: number[]): number {
  const cov = covariance(arr1, arr2);
  const std1 = standardDeviation(arr1);
  const std2 = standardDeviation(arr2);
  if (std1 === 0 || std2 === 0) return 0;
  return cov / (std1 * std2);
}

export function rank(arr: number[]): number[] {
  const sorted = [...arr].sort((a, b) => a - b);
  return arr.map((value) => sorted.indexOf(value) + 1);
}

export function rankBy<T>(arr: T[], key: (item: T) => number): number[] {
  const values = arr.map(key);
  return rank(values);
}

export function normalize(arr: number[]): number[] {
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const range = max - min;
  if (range === 0) return arr.map(() => 0);
  return arr.map((n) => (n - min) / range);
}

export function standardize(arr: number[]): number[] {
  const avg = mean(arr);
  const std = standardDeviation(arr);
  if (std === 0) return arr.map(() => 0);
  return arr.map((n) => (n - avg) / std);
}

export function minMaxScale(arr: number[], newMin: number = 0, newMax: number = 1): number[] {
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const range = max - min;
  if (range === 0) return arr.map(() => newMin);
  return arr.map((n) => ((n - min) / range) * (newMax - newMin) + newMin);
}

export function clip(arr: number[], min: number, max: number): number[] {
  return arr.map((n) => Math.max(min, Math.min(max, n)));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function sigmoid(arr: number[]): number[] {
  return arr.map((n) => 1 / (1 + Math.exp(-n)));
}

export function relu(arr: number[]): number[] {
  return arr.map((n) => Math.max(0, n));
}

export function leakyRelu(arr: number[], alpha: number = 0.01): number[] {
  return arr.map((n) => n > 0 ? n : alpha * n);
}

export function tanh(arr: number[]): number[] {
  return arr.map((n) => Math.tanh(n));
}

export function softmax(arr: number[]): number[] {
  const max = Math.max(...arr);
  const exps = arr.map((n) => Math.exp(n - max));
  let sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

export function logSumExp(arr: number[]): number {
  const max = Math.max(...arr);
  const sum = arr.reduce((acc, n) => acc + Math.exp(n - max), 0);
  return max + Math.log(sum);
}

export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error("Arrays must have same length");
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

export function crossProduct(a: number[], b: number[]): number[] {
  if (a.length !== 3 || b.length !== 3) throw new Error("Cross product requires 3D vectors");
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function vectorAdd(a: number[], b: number[]): number[] {
  return a.map((val, i) => val + b[i]);
}

export function vectorSubtract(a: number[], b: number[]): number[] {
  return a.map((val, i) => val - b[i]);
}

export function vectorScale(a: number[], scalar: number): number[] {
  return a.map((val) => val * scalar);
}

export function vectorMagnitude(a: number[]): number {
  return Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
}

export function vectorNormalize(a: number[]): number[] {
  const mag = vectorMagnitude(a);
  if (mag === 0) return a.map(() => 0);
  return a.map((val) => val / mag);
}

export function vectorDistance(a: number[], b: number[]): number {
  return vectorMagnitude(vectorSubtract(a, b));
}

export function vectorAngle(a: number[], b: number[]): number {
  const dot = dotProduct(a, b);
  const magA = vectorMagnitude(a);
  const magB = vectorMagnitude(b);
  if (magA === 0 || magB === 0) return 0;
  return Math.acos(dot / (magA * magB));
}

export function vectorLerp(a: number[], b: number[], t: number): number[] {
  return a.map((val, i) => val + (b[i] - val) * t);
}

export function matrixMultiply(a: number[][], b: number[][]): number[][] {
  const rowsA = a.length;
  const colsA = a[0].length;
  const colsB = b[0].length;
  const result: number[][] = Array(rowsA).fill(null).map(() => Array(colsB).fill(0));
  for (let i = 0; i < rowsA; i++) {
    for (let j = 0; j < colsB; j++) {
      for (let k = 0; k < colsA; k++) {
        result[i][j] += a[i][k] * b[k][j];
      }
    }
  }
  return result;
}

export function matrixTranspose(matrix: number[][]): number[][] {
  return transpose(matrix);
}

export function matrixIdentity(n: number): number[][] {
  const result: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
  for (let i = 0; i < n; i++) result[i][i] = 1;
  return result;
}

export function matrixAdd(a: number[][], b: number[][]): number[][] {
  return a.map((row, i) => row.map((val, j) => val + b[i][j]));
}

export function matrixSubtract(a: number[][], b: number[][]): number[][] {
  return a.map((row, i) => row.map((val, j) => val - b[i][j]));
}

export function matrixScale(a: number[][], scalar: number): number[][] {
  return a.map((row) => row.map((val) => val * scalar));
}

export function matrixDeterminant(matrix: number[][]): number {
  const n = matrix.length;
  if (n === 1) return matrix[0][0];
  if (n === 2) return matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0];
  let det = 0;
  for (let j = 0; j < n; j++) {
    const minor = matrix.slice(1).map((row) => row.filter((_, col) => col !== j));
    det += (j % 2 === 0 ? 1 : -1) * matrix[0][j] * matrixDeterminant(minor);
  }
  return det;
}

export function matrixInverse(matrix: number[][]): number[][] | null {
  const n = matrix.length;
  let det = matrixDeterminant(matrix);
  if (det === 0) return null;
  const result: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const minor = matrix.filter((_, row) => row !== i).map((row) => row.filter((_, col) => col !== j));
      result[j][i] = ((i + j) % 2 === 0 ? 1 : -1) * matrixDeterminant(minor) / det;
    }
  }
  return result;
}

export function matrixTrace(matrix: number[][]): number {
  return matrix.reduce((sum, row, i) => sum + row[i], 0);
}

export function matrixRank(matrix: number[][]): number {
  const m = matrix.map((row) => [...row]);
  const rows = m.length;
  const cols = m[0].length;
  let rank = 0;
  for (let col = 0; col < cols && rank < rows; col++) {
    let pivot = -1;
    for (let row = rank; row < rows; row++) {
      if (Math.abs(m[row][col]) > 1e-10) {
        pivot = row;
        break;
      }
    }
    if (pivot === -1) continue;
    [m[rank], m[pivot]] = [m[pivot], m[rank]];
    const pivotVal = m[rank][col];
    for (let row = rank + 1; row < rows; row++) {
      const factor = m[row][col] / pivotVal;
      for (let c = col; c < cols; c++) {
        m[row][c] -= factor * m[rank][c];
      }
    }
    rank++;
  }
  return rank;
}

export function convolution(signal: number[], kernel: number[]): number[] {
  const result: number[] = [];
  const kernelSize = kernel.length;
  const halfKernel = Math.floor(kernelSize / 2);
  for (let i = 0; i < signal.length; i++) {
    let sum = 0;
    for (let j = 0; j < kernelSize; j++) {
      const signalIndex = i + j - halfKernel;
      if (signalIndex >= 0 && signalIndex < signal.length) {
        sum += signal[signalIndex] * kernel[j];
      }
    }
    result.push(sum);
  }
  return result;
}

export function gaussianKernel(size: number, sigma: number = 1): number[] {
  const result: number[] = [];
  const half = Math.floor(size / 2);
  let sum = 0;
  for (let i = -half; i <= half; i++) {
    const value = Math.exp(-(i * i) / (2 * sigma * sigma));
    result.push(value);
    sum += value;
  }
  return result.map((v) => v / sum);
}

export function laplacianKernel(): number[] {
  return [0, 1, 0, 1, -4, 1, 0, 1, 0];
}

export function sobelXKernel(): number[] {
  return [-1, 0, 1, -2, 0, 2, -1, 0, 1];
}

export function sobelYKernel(): number[] {
  return [-1, -2, -1, 0, 0, 0, 1, 2, 1];
}

export function prewittXKernel(): number[] {
  return [-1, 0, 1, -1, 0, 1, -1, 0, 1];
}

export function prewittYKernel(): number[] {
  return [-1, -1, -1, 0, 0, 0, 1, 1, 1];
}

export function boxKernel(size: number): number[] {
  return new Array(size).fill(1 / size);
}

export function sharpenKernel(): number[] {
  return [0, -1, 0, -1, 5, -1, 0, -1, 0];
}

export function embossKernel(): number[] {
  return [-2, -1, 0, -1, 1, 1, 0, 1, 2];
}

export function edgeDetectKernel(): number[] {
  return [-1, -1, -1, -1, 8, -1, -1, -1, -1];
}
