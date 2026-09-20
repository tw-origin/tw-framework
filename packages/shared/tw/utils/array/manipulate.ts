/**
 * Array manipulation utilities.
 * @module shared/utils/array
 */

export function chunk<T>(array: T[], size: number): T[][] {
  if (size <= 0) return [array];
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export function compact<T>(array: (T | null | undefined | false | 0 | "" | void)[]): T[] {
  return array.filter((item): item is T => Boolean(item));
}

export function difference<T>(a: T[], b: T[]): T[] {
  const setB = new Set(b);
  return a.filter((item) => !setB.has(item));
}

export function differenceBy<T, U>(a: T[], b: T[], iteratee: (item: T) => U): T[] {
  const setB = new Set(b.map(iteratee));
  return a.filter((item) => !setB.has(iteratee(item)));
}

export function differenceWith<T>(a: T[], b: T[], comparator: (a: T, b: T) => boolean): T[] {
  return a.filter((itemA) => !b.some((itemB) => comparator(itemA, itemB)));
}

export function drop<T>(array: T[], n: number = 1): T[] {
  return array.slice(n);
}

export function dropRight<T>(array: T[], n: number = 1): T[] {
  return array.slice(0, Math.max(0, array.length - n));
}

export function dropWhile<T>(array: T[], predicate: (item: T, index: number) => boolean): T[] {
  let i = 0;
  while (i < array.length && predicate(array[i], i)) i++;
  return array.slice(i);
}

export function dropRightWhile<T>(array: T[], predicate: (item: T, index: number) => boolean): T[] {
  let i = array.length;
  while (i > 0 && predicate(array[i - 1], i - 1)) i--;
  return array.slice(0, i);
}

export function fill<T>(array: T[], value: T, start: number = 0, end: number = array.length): T[] {
  const result = [...array];
  for (let i = start; i < end && i < result.length; i++) {
    result[i] = value;
  }
  return result;
}

export function findIndex<T>(array: T[], predicate: (item: T, index: number) => boolean, fromIndex: number = 0): number {
  for (let i = fromIndex; i < array.length; i++) {
    if (predicate(array[i], i)) return i;
  }
  return -1;
}

export function findLastIndex<T>(array: T[], predicate: (item: T, index: number) => boolean, fromIndex: number = array.length - 1): number {
  for (let i = Math.min(fromIndex, array.length - 1); i >= 0; i--) {
    if (predicate(array[i], i)) return i;
  }
  return -1;
}

export function flatten<T>(array: T[][]): T[] {
  return array.flat();
}

export function flattenDeep<T>(array: unknown[]): T[] {
  return array.flat(Infinity) as T[];
}

export function flattenDepth<T>(array: unknown[], depth: number = 1): T[] {
  return array.flat(depth) as T[];
}

export function fromPairs<T>(pairs: Array<[string, T]>): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [key, value] of pairs) {
    result[key] = value;
  }
  return result;
}

export function toPairs<T>(obj: Record<string, T>): Array<[string, T]> {
  return Object.entries(obj);
}

export function groupBy<T, K extends string>(array: T[], iteratee: (item: T) => K): Record<K, T[]> {
  const result = {} as Record<K, T[]>;
  for (const item of array) {
    const key = iteratee(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}

export function groupByCount<T>(array: T[], count: number): T[][] {
  return chunk(array, count);
}

export function intersection<T>(a: T[], b: T[]): T[] {
  const setB = new Set(b);
  return [...new Set(a)].filter((item) => setB.has(item));
}

export function intersectionBy<T, U>(a: T[], b: T[], iteratee: (item: T) => U): T[] {
  const setB = new Set(b.map(iteratee));
  return [...new Set(a)].filter((item) => setB.has(iteratee(item)));
}

export function intersectionWith<T>(a: T[], b: T[], comparator: (a: T, b: T) => boolean): T[] {
  return a.filter((itemA) => b.some((itemB) => comparator(itemA, itemB)));
}

export function keyBy<T, K extends string>(array: T[], iteratee: (item: T) => K): Record<K, T> {
  const result = {} as Record<K, T>;
  for (const item of array) {
    result[iteratee(item)] = item;
  }
  return result;
}

export function orderBy<T>(array: T[], iteratees: Array<(item: T) => unknown>, orders: Array<"asc" | "desc">): T[] {
  return [...array].sort((a, b) => {
    for (let i = 0; i < iteratees.length; i++) {
      const valA = iteratees[i](a);
      const valB = iteratees[i](b);
      const order = orders[i] ?? "asc";
      if (valA < valB) return order === "asc" ? -1 : 1;
      if (valA > valB) return order === "asc" ? 1 : -1;
    }
    return 0;
  });
}

export function partition<T>(array: T[], predicate: (item: T) => boolean): [T[], T[]] {
  const pass: T[] = [];
  const fail: T[] = [];
  for (const item of array) {
    if (predicate(item)) pass.push(item);
    else fail.push(item);
  }
  return [pass, fail];
}

export function pull<T>(array: T[], ...values: T[]): T[] {
  const set = new Set(values);
  return array.filter((item) => !set.has(item));
}

export function pullAll<T>(array: T[], values: T[]): T[] {
  const set = new Set(values);
  return array.filter((item) => !set.has(item));
}

export function pullAt<T>(array: T[], indexes: number[]): T[] {
  const set = new Set(indexes);
  return array.filter((_, i) => !set.has(i));
}

export function remove<T>(array: T[], predicate: (item: T) => boolean): T[] {
  const removed: T[] = [];
  for (let i = array.length - 1; i >= 0; i--) {
    if (predicate(array[i])) {
      removed.unshift(array[i]);
      array.splice(i, 1);
    }
  }
  return removed;
}

export function reverse<T>(array: T[]): T[] {
  return [...array].reverse();
}

export function slice<T>(array: T[], start: number = 0, end: number = array.length): T[] {
  return array.slice(start, end);
}

export function take<T>(array: T[], n: number = 1): T[] {
  return array.slice(0, n);
}

export function takeRight<T>(array: T[], n: number = 1): T[] {
  return array.slice(Math.max(0, array.length - n));
}

export function takeWhile<T>(array: T[], predicate: (item: T, index: number) => boolean): T[] {
  const result: T[] = [];
  for (let i = 0; i < array.length; i++) {
    if (!predicate(array[i], i)) break;
    result.push(array[i]);
  }
  return result;
}

export function takeRightWhile<T>(array: T[], predicate: (item: T, index: number) => boolean): T[] {
  const result: T[] = [];
  for (let i = array.length - 1; i >= 0; i--) {
    if (!predicate(array[i], i)) break;
    result.unshift(array[i]);
  }
  return result;
}

export function union<T>(...arrays: T[][]): T[] {
  return [...new Set(arrays.flat())];
}

export function unionBy<T, U>(iteratee: (item: T) => U, ...arrays: T[][]): T[] {
  const seen = new Set<U>();
  const result: T[] = [];
  for (const array of arrays) {
    for (const item of array) {
      const key = iteratee(item);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    }
  }
  return result;
}

export function unionWith<T>(comparator: (a: T, b: T) => boolean, ...arrays: T[][]): T[] {
  const result: T[] = [];
  for (const array of arrays) {
    for (const item of array) {
      if (!result.some((existing) => comparator(existing, item))) {
        result.push(item);
      }
    }
  }
  return result;
}

export function uniq<T>(array: T[]): T[] {
  return [...new Set(array)];
}

export function uniqBy<T, U>(array: T[], iteratee: (item: T) => U): T[] {
  const seen = new Set<U>();
  const result: T[] = [];
  for (const item of array) {
    const key = iteratee(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

export function uniqWith<T>(array: T[], comparator: (a: T, b: T) => boolean): T[] {
  const result: T[] = [];
  for (const item of array) {
    if (!result.some((existing) => comparator(existing, item))) {
      result.push(item);
    }
  }
  return result;
}

export function unzip<T>(array: T[][]): T[][] {
  if (array.length === 0) return [];
  const maxLen = Math.max(...array.map((a) => a.length));
  const result: T[][] = [];
  for (let i = 0; i < maxLen; i++) {
    result.push(array.map((a) => a[i]));
  }
  return result;
}

export function without<T>(array: T[], ...values: T[]): T[] {
  const set = new Set(values);
  return array.filter((item) => !set.has(item));
}

export function xor<T>(a: T[], b: T[]): T[] {
  const setA = new Set(a);
  const setB = new Set(b);
  return [
    ...a.filter((item) => !setB.has(item)),
    ...b.filter((item) => !setA.has(item)),
  ];
}

export function xorBy<T, U>(a: T[], b: T[], iteratee: (item: T) => U): T[] {
  const setA = new Set(a.map(iteratee));
  const setB = new Set(b.map(iteratee));
  return [
    ...a.filter((item) => !setB.has(iteratee(item))),
    ...b.filter((item) => !setA.has(iteratee(item))),
  ];
}

export function xorWith<T>(a: T[], b: T[], comparator: (a: T, b: T) => boolean): T[] {
  return [
    ...a.filter((itemA) => !b.some((itemB) => comparator(itemA, itemB))),
    ...b.filter((itemB) => !a.some((itemA) => comparator(itemA, itemB))),
  ];
}

export function zip<A, B>(a: A[], b: B[]): Array<[A, B]> {
  const maxLen = Math.max(a.length, b.length);
  const result: Array<[A, B]> = [];
  for (let i = 0; i < maxLen; i++) {
    result.push([a[i], b[i]]);
  }
  return result;
}

export function zipObject<K extends string, V>(keys: K[], values: V[]): Record<K, V> {
  const result = {} as Record<K, V>;
  for (let i = 0; i < keys.length; i++) {
    result[keys[i]] = values[i];
  }
  return result;
}

export function zipWith<A, B, R>(a: A[], b: B[], iteratee: (a: A, b: B) => R): R[] {
  const maxLen = Math.max(a.length, b.length);
  const result: R[] = [];
  for (let i = 0; i < maxLen; i++) {
    result.push(iteratee(a[i], b[i]));
  }
  return result;
}

export function countBy<T, K extends string>(array: T[], iteratee: (item: T) => K): Record<K, number> {
  const result = {} as Record<K, number>;
  for (const item of array) {
    const key = iteratee(item);
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

export function every<T>(array: T[], predicate: (item: T, index: number) => boolean): boolean {
  return array.every(predicate);
}

export function some<T>(array: T[], predicate: (item: T, index: number) => boolean): boolean {
  return array.some(predicate);
}

export function forEach<T>(array: T[], iteratee: (item: T, index: number) => void): void {
  array.forEach(iteratee);
}

export function forEachRight<T>(array: T[], iteratee: (item: T, index: number) => void): void {
  for (let i = array.length - 1; i >= 0; i--) {
    iteratee(array[i], i);
  }
}

export function includes<T>(array: T[], value: T, fromIndex: number = 0): boolean {
  return array.indexOf(value, fromIndex) !== -1;
}

export function indexOf<T>(array: T[], value: T, fromIndex: number = 0): number {
  return array.indexOf(value, fromIndex);
}

export function lastIndexOf<T>(array: T[], value: T, fromIndex: number = array.length - 1): number {
  return array.lastIndexOf(value, fromIndex);
}

export function find<T>(array: T[], predicate: (item: T, index: number) => boolean): T | undefined {
  return array.find(predicate);
}

export function findLast<T>(array: T[], predicate: (item: T, index: number) => boolean): T | undefined {
  for (let i = array.length - 1; i >= 0; i--) {
    if (predicate(array[i], i)) return array[i];
  }
  return undefined;
}

export function map<T, R>(array: T[], iteratee: (item: T, index: number) => R): R[] {
  return array.map(iteratee);
}

export function flatMap<T, R>(array: T[], iteratee: (item: T, index: number) => R | R[]): R[] {
  return array.flatMap(iteratee);
}

export function filter<T>(array: T[], predicate: (item: T, index: number) => boolean): T[] {
  return array.filter(predicate);
}

export function reject<T>(array: T[], predicate: (item: T, index: number) => boolean): T[] {
  return array.filter((item, index) => !predicate(item, index));
}

export function reduce<T, R>(array: T[], iteratee: (acc: R, item: T, index: number) => R, initialValue: R): R {
  return array.reduce(iteratee, initialValue);
}

export function reduceRight<T, R>(array: T[], iteratee: (acc: R, item: T, index: number) => R, initialValue: R): R {
  return array.reduceRight(iteratee, initialValue);
}

export function size<T>(array: T[] | object | string): number {
  if (typeof array === "string") return array.length;
  if (Array.isArray(array)) return array.length;
  return Object.keys(array as object).length;
}

export function sample<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

export function sampleSize<T>(array: T[], n: number): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, n);
}

export function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function sortBy<T>(array: T[], iteratees: Array<(item: T) => unknown>): T[] {
  return [...array].sort((a, b) => {
    for (const iteratee of iteratees) {
      const valA = iteratee(a);
      const valB = iteratee(b);
      if (valA < valB) return -1;
      if (valA > valB) return 1;
    }
    return 0;
  });
}

export function sortedIndex<T>(array: T[], value: T): number {
  let low = 0;
  let high = array.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (array[mid] < value) low = mid + 1;
    else high = mid;
  }
  return low;
}

export function sortedIndexBy<T, U>(array: T[], value: T, iteratee: (item: T) => U): number {
  const target = iteratee(value);
  let low = 0;
  let high = array.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (iteratee(array[mid]) < target) low = mid + 1;
    else high = mid;
  }
  return low;
}

export function sortedIndexOf<T>(array: T[], value: T): number {
  const idx = sortedIndex(array, value);
  return idx < array.length && array[idx] === value ? idx : -1;
}

export function sortedLastIndex<T>(array: T[], value: T): number {
  let low = 0;
  let high = array.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (value < array[mid]) high = mid;
    else low = mid + 1;
  }
  return low;
}

export function sortedUniq<T>(array: T[]): T[] {
  if (array.length === 0) return [];
  const result: T[] = [array[0]];
  for (let i = 1; i < array.length; i++) {
    if (array[i] !== array[i - 1]) result.push(array[i]);
  }
  return result;
}

export function sortedUniqBy<T, U>(array: T[], iteratee: (item: T) => U): T[] {
  if (array.length === 0) return [];
  const result: T[] = [array[0]];
  let lastKey = iteratee(array[0]);
  for (let i = 1; i < array.length; i++) {
    const key = iteratee(array[i]);
    if (key !== lastKey) {
      result.push(array[i]);
      lastKey = key;
    }
  }
  return result;
}

export function range(start: number, end: number, step: number = 1): number[] {
  if (step === 0) return [];
  const result: number[] = [];
  if (step > 0) {
    for (let i = start; i < end; i += step) result.push(i);
  } else {
    for (let i = start; i > end; i += step) result.push(i);
  }
  return result;
}

export function rangeRight(start: number, end: number, step: number = 1): number[] {
  return range(start, end, step).reverse();
}

export function nth<T>(array: T[], n: number): T | undefined {
  const idx = n < 0 ? array.length + n : n;
  return array[idx];
}

export function head<T>(array: T[]): T | undefined {
  return array[0];
}

export function last<T>(array: T[]): T | undefined {
  return array[array.length - 1];
}

export function initial<T>(array: T[]): T[] {
  return array.slice(0, -1);
}

export function tail<T>(array: T[]): T[] {
  return array.slice(1);
}

export function compactArrays<T>(arrays: T[][]): T[] {
  return arrays.flat().filter(Boolean) as T[];
}

export function flattenDeepArrays<T>(arrays: unknown[]): T[] {
  return arrays.flat(Infinity) as T[];
}

export function binarySearch<T>(array: T[], value: T, comparator: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): number {
  let low = 0;
  let high = array.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const cmp = comparator(array[mid], value);
    if (cmp === 0) return mid;
    if (cmp < 0) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}

export function quickSort<T>(array: T[], comparator: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): T[] {
  if (array.length <= 1) return [...array];
  const pivot = array[Math.floor(array.length / 2)];
  const left = array.filter((item) => comparator(item, pivot) < 0);
  const middle = array.filter((item) => comparator(item, pivot) === 0);
  const right = array.filter((item) => comparator(item, pivot) > 0);
  return [...quickSort(left, comparator), ...middle, ...quickSort(right, comparator)];
}

export function mergeSort<T>(array: T[], comparator: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): T[] {
  if (array.length <= 1) return [...array];
  const mid = Math.floor(array.length / 2);
  const left = mergeSort(array.slice(0, mid), comparator);
  const right = mergeSort(array.slice(mid), comparator);
  const result: T[] = [];
  let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    if (comparator(left[i], right[j]) <= 0) result.push(left[i++]);
    else result.push(right[j++]);
  }
  while (i < left.length) result.push(left[i++]);
  while (j < right.length) result.push(right[j++]);
  return result;
}

export function bubbleSort<T>(array: T[], comparator: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): T[] {
  const result = [...array];
  for (let i = 0; i < result.length - 1; i++) {
    for (let j = 0; j < result.length - 1 - i; j++) {
      if (comparator(result[j], result[j + 1]) > 0) {
        [result[j], result[j + 1]] = [result[j + 1], result[j]];
      }
    }
  }
  return result;
}

export function insertionSort<T>(array: T[], comparator: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): T[] {
  const result = [...array];
  for (let i = 1; i < result.length; i++) {
    const current = result[i];
    let j = i - 1;
    while (j >= 0 && comparator(result[j], current) > 0) {
      result[j + 1] = result[j];
      j--;
    }
    result[j + 1] = current;
  }
  return result;
}

export function selectionSort<T>(array: T[], comparator: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): T[] {
  const result = [...array];
  for (let i = 0; i < result.length - 1; i++) {
    let minIdx = i;
    for (let j = i + 1; j < result.length; j++) {
      if (comparator(result[j], result[minIdx]) < 0) minIdx = j;
    }
    if (minIdx !== i) [result[i], result[minIdx]] = [result[minIdx], result[i]];
  }
  return result;
}

export function heapSort<T>(array: T[], comparator: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): T[] {
  const result = [...array];
  const n = result.length;
  const heapify = (size: number, i: number) => {
    let largest = i;
    const left = 2 * i + 1;
    const right = 2 * i + 2;
    if (left < size && comparator(result[left], result[largest]) > 0) largest = left;
    if (right < size && comparator(result[right], result[largest]) > 0) largest = right;
    if (largest !== i) {
      [result[i], result[largest]] = [result[largest], result[i]];
      heapify(size, largest);
    }
  };
  for (let i = Math.floor(n / 2) - 1; i >= 0; i--) heapify(n, i);
  for (let i = n - 1; i > 0; i--) {
    [result[0], result[i]] = [result[i], result[0]];
    heapify(i, 0);
  }
  return result;
}

export function countingsort(array: number[]): number[] {
  if (array.length === 0) return [];
  const max = Math.max(...array);
  const min = Math.min(...array);
  const range = max - min + 1;
  const count = new Array(range).fill(0);
  const output: number[] = new Array(array.length);
  for (const num of array) count[num - min]++;
  for (let i = 1; i < range; i++) count[i] += count[i - 1];
  for (let i = array.length - 1; i >= 0; i--) {
    output[count[array[i] - min] - 1] = array[i];
    count[array[i] - min]--;
  }
  return output;
}

export function radixSort(array: number[]): number[] {
  if (array.length === 0) return [];
  const max = Math.max(...array.map(Math.abs));
  const digits = Math.floor(Math.log10(max)) + 1 || 1;
  let result = [...array];
  for (let d = 0; d < digits; d++) {
    const buckets: number[][] = Array.from({ length: 19 }, () => []);
    const divisor = Math.pow(10, d);
    for (const num of result) {
      const digit = Math.floor(Math.abs(num) / divisor) % 10;
      const bucketIdx = num < 0 ? 9 - digit : 9 + digit;
      buckets[bucketIdx].push(num);
    }
    result = buckets.flat();
  }
  return result;
}

export function bucketSort(array: number[], bucketSize: number = 5): number[] {
  if (array.length === 0) return [];
  const max = Math.max(...array);
  const min = Math.min(...array);
  const bucketCount = Math.floor((max - min) / bucketSize) + 1;
  const buckets: number[][] = Array.from({ length: bucketCount }, () => []);
  for (const num of array) {
    const idx = Math.floor((num - min) / bucketSize);
    buckets[idx].push(num);
  }
  return buckets.map((bucket) => bucket.sort((a, b) => a - b)).flat();
}

export function shellSort<T>(array: T[], comparator: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): T[] {
  const result = [...array];
  let gap = Math.floor(result.length / 2);
  while (gap > 0) {
    for (let i = gap; i < result.length; i++) {
      const temp = result[i];
      let j = i;
      while (j >= gap && comparator(result[j - gap], temp) > 0) {
        result[j] = result[j - gap];
        j -= gap;
      }
      result[j] = temp;
    }
    gap = Math.floor(gap / 2);
  }
  return result;
}

export function timSort<T>(array: T[], comparator: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): T[] {
  return mergeSort(array, comparator);
}

export function rotate<T>(array: T[], n: number): T[] {
  const len = array.length;
  if (len === 0) return [];
  const shift = ((n % len) + len) % len;
  return [...array.slice(shift), ...array.slice(0, shift)];
}

export function rotateLeft<T>(array: T[], n: number): T[] {
  return rotate(array, n);
}

export function rotateRight<T>(array: T[], n: number): T[] {
  return rotate(array, -n);
}

export function swap<T>(array: T[], i: number, j: number): T[] {
  const result = [...array];
  if (i >= 0 && i < result.length && j >= 0 && j < result.length) {
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function move<T>(array: T[], from: number, to: number): T[] {
  const result = [...array];
  if (from < 0 || from >= result.length || to < 0 || to >= result.length) return result;
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}

export function insertAt<T>(array: T[], index: number, item: T): T[] {
  const result = [...array];
  result.splice(index, 0, item);
  return result;
}

export function removeAt<T>(array: T[], index: number): T[] {
  const result = [...array];
  result.splice(index, 1);
  return result;
}

export function replaceAt<T>(array: T[], index: number, item: T): T[] {
  const result = [...array];
  if (index >= 0 && index < result.length) result[index] = item;
  return result;
}

export function toggle<T>(array: T[], item: T): T[] {
  const idx = array.indexOf(item);
  if (idx === -1) return [...array, item];
  return array.filter((_, i) => i !== idx);
}

export function toggleAll<T>(array: T[], items: T[]): T[] {
  let result = [...array];
  for (const item of items) {
    result = toggle(result, item);
  }
  return result;
}

export function unique<T>(array: T[]): T[] {
  return [...new Set(array)];
}

export function uniqueBy<T, U>(array: T[], iteratee: (item: T) => U): T[] {
  const seen = new Set<U>();
  const result: T[] = [];
  for (const item of array) {
    const key = iteratee(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

export function deduplicate<T>(array: T[]): T[] {
  return unique(array);
}

export function isUnique<T>(array: T[]): boolean {
  return array.length === new Set(array).size;
}

export function hasDuplicates<T>(array: T[]): boolean {
  return !isUnique(array);
}

export function firstDuplicate<T>(array: T[]): T | undefined {
  const seen = new Set<T>();
  for (const item of array) {
    if (seen.has(item)) return item;
    seen.add(item);
  }
  return undefined;
}

export function allDuplicates<T>(array: T[]): T[] {
  const seen = new Map<T, number>();
  for (const item of array) {
    seen.set(item, (seen.get(item) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, count]) => count > 1).map(([item]) => item);
}

export function countOccurrences<T>(array: T[]): Map<T, number> {
  const counts = new Map<T, number>();
  for (const item of array) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return counts;
}

export function frequency<T>(array: T[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of array) {
    const key = String(item);
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

export function mostFrequent<T>(array: T[]): T | undefined {
  const counts = countOccurrences(array);
  let maxCount = 0;
  let result: T | undefined;
  for (const [item, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      result = item;
    }
  }
  return result;
}

export function leastFrequent<T>(array: T[]): T | undefined {
  const counts = countOccurrences(array);
  let minCount = Infinity;
  let result: T | undefined;
  for (const [item, count] of counts) {
    if (count < minCount) {
      minCount = count;
      result = item;
    }
  }
  return result;
}

export function cartesian<T>(...arrays: T[][]): T[][] {
  if (arrays.length === 0) return [[]];
  const [first, ...rest] = arrays;
  const restCartesian = cartesian(...rest);
  return first.flatMap((item) => restCartesian.map((rest) => [item, ...rest]));
}

export function permutations<T>(array: T[]): T[][] {
  if (array.length <= 1) return [array];
  const result: T[][] = [];
  for (let i = 0; i < array.length; i++) {
    const rest = [...array.slice(0, i), ...array.slice(i + 1)];
    for (const perm of permutations(rest)) {
      result.push([array[i], ...perm]);
    }
  }
  return result;
}

export function combinations<T>(array: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k > array.length) return [];
  const [first, ...rest] = array;
  const withFirst = combinations(rest, k - 1).map((c) => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

export function powerSet<T>(array: T[]): T[][] {
  const result: T[][] = [[]];
  for (const item of array) {
    const newSubsets = result.map((subset) => [...subset, item]);
    result.push(...newSubsets);
  }
  return result;
}

export function partitionBy<T, K extends string>(array: T[], iteratee: (item: T) => K): Record<K, T[]> {
  const result = {} as Record<K, T[]>;
  for (const item of array) {
    const key = iteratee(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}

export function window<T>(array: T[], size: number, step: number = 1): T[][] {
  const result: T[][] = [];
  for (let i = 0; i + size <= array.length; i += step) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

export function sliding<T>(array: T[], size: number): T[][] {
  return window(array, size, 1);
}

export function overlapping<T>(array: T[], size: number): T[][] {
  return window(array, size, 1);
}

export function nonOverlapping<T>(array: T[], size: number): T[][] {
  return window(array, size, size);
}

export function interleave<T>(...arrays: T[][]): T[] {
  const maxLen = Math.max(...arrays.map((a) => a.length));
  const result: T[] = [];
  for (let i = 0; i < maxLen; i++) {
    for (const array of arrays) {
      if (i < array.length) result.push(array[i]);
    }
  }
  return result;
}

export function interpose<T>(array: T[], separator: T): T[] {
  const result: T[] = [];
  for (let i = 0; i < array.length; i++) {
    result.push(array[i]);
    if (i < array.length - 1) result.push(separator);
  }
  return result;
}

export function flattenTree<T>(root: T, getChildren: (node: T) => T[]): T[] {
  const result: T[] = [];
  const stack: T[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    result.push(node);
    const children = getChildren(node);
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push(children[i]);
    }
  }
  return result;
}

export function flattenTreeBFS<T>(root: T, getChildren: (node: T) => T[]): T[] {
  const result: T[] = [root];
  const queue: T[] = [root];
  while (queue.length > 0) {
    const node = queue.shift()!;
    const children = getChildren(node);
    result.push(...children);
    queue.push(...children);
  }
  return result;
}

export function treeMap<T, R>(root: T, getChildren: (node: T) => T[], transform: (node: T) => R): R {
  const transformNode = (node: T): R => {
    return transform(node);
  };
  return transformNode(root);
}

export function treeForEach<T>(root: T, getChildren: (node: T) => T[], callback: (node: T, depth: number) => void): void {
  const walk = (node: T, depth: number) => {
    callback(node, depth);
    for (const child of getChildren(node)) {
      walk(child, depth + 1);
    }
  };
  walk(root, 0);
}

export function treeFind<T>(root: T, getChildren: (node: T) => T[], predicate: (node: T) => boolean): T | undefined {
  if (predicate(root)) return root;
  for (const child of getChildren(root)) {
    const found = treeFind(child, getChildren, predicate);
    if (found) return found;
  }
  return undefined;
}

export function treeFilter<T>(root: T, getChildren: (node: T) => T[], predicate: (node: T) => boolean): T[] {
  const result: T[] = [];
  if (predicate(root)) result.push(root);
  for (const child of getChildren(root)) {
    result.push(...treeFilter(child, getChildren, predicate));
  }
  return result;
}

export function treeDepth<T>(root: T, getChildren: (node: T) => T[]): number {
  const children = getChildren(root);
  if (children.length === 0) return 0;
  return 1 + Math.max(...children.map((c) => treeDepth(c, getChildren)));
}

export function treeSize<T>(root: T, getChildren: (node: T) => T[]): number {
  return 1 + getChildren(root).reduce((sum, child) => sum + treeSize(child, getChildren), 0);
}

export function treePath<T>(root: T, getChildren: (node: T) => T[], predicate: (node: T) => boolean): T[] | undefined {
  if (predicate(root)) return [root];
  for (const child of getChildren(root)) {
    const path = treePath(child, getChildren, predicate);
    if (path) return [root, ...path];
  }
  return undefined;
}
