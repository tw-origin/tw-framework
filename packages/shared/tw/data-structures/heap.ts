/**
 * Binary heap, priority queue, min/max heap implementations.
 * @module shared/data-structures
 */

export class BinaryHeap<T> {
  protected items: T[] = [];
  protected compare: (a: T, b: T) => number;

  constructor(compareFn: (a: T, b: T) => number, items?: T[]) {
    this.compare = compareFn;
    if (items) {
      this.items = [...items];
      this.heapify();
    }
  }

  get size(): number { return this.items.length; }
  get isEmpty(): boolean { return this.items.length === 0; }
  get peek(): T | undefined { return this.items[0]; }

  push(value: T): this {
    this.items.push(value);
    this.siftUp(this.items.length - 1);
    return this;
  }

  pop(): T | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  replace(value: T): T | undefined {
    if (this.items.length === 0) {
      this.items.push(value);
      return undefined;
    }
    const top = this.items[0];
    this.items[0] = value;
    this.siftDown(0);
    return top;
  }

  pushPop(value: T): T {
    if (this.items.length === 0 || this.compare(value, this.items[0]) <= 0) {
      return value;
    }
    const top = this.items[0];
    this.items[0] = value;
    this.siftDown(0);
    return top;
  }

  clear(): void {
    this.items = [];
  }

  contains(value: T): boolean {
    return this.items.includes(value);
  }

  indexOf(value: T): number {
    return this.items.indexOf(value);
  }

  remove(value: T): boolean {
    const index = this.items.indexOf(value);
    if (index === -1) return false;
    this.removeAt(index);
    return true;
  }

  removeAt(index: number): T | undefined {
    if (index < 0 || index >= this.items.length) return undefined;
    const removed = this.items[index];
    const last = this.items.pop()!;
    if (index < this.items.length) {
      this.items[index] = last;
      const parentIndex = this.getParentIndex(index);
      if (parentIndex >= 0 && this.compare(this.items[index], this.items[parentIndex]) < 0) {
        this.siftUp(index);
      } else {
        this.siftDown(index);
      }
    }
    return removed;
  }

  update(oldValue: T, newValue: T): boolean {
    const index = this.items.indexOf(oldValue);
    if (index === -1) return false;
    this.items[index] = newValue;
    const parentIndex = this.getParentIndex(index);
    if (parentIndex >= 0 && this.compare(this.items[index], this.items[parentIndex]) < 0) {
      this.siftUp(index);
    } else {
      this.siftDown(index);
    }
    return true;
  }

  heapify(): void {
    for (let i = Math.floor(this.items.length / 2) - 1; i >= 0; i--) {
      this.siftDown(i);
    }
  }

  protected siftUp(index: number): void {
    while (index > 0) {
      const parentIndex = this.getParentIndex(index);
      if (this.compare(this.items[index], this.items[parentIndex]) < 0) {
        this.swap(index, parentIndex);
        index = parentIndex;
      } else {
        break;
      }
    }
  }

  protected siftDown(index: number): void {
    const size = this.items.length;
    while (true) {
      const leftIndex = this.getLeftChildIndex(index);
      const rightIndex = this.getRightChildIndex(index);
      let smallest = index;
      if (leftIndex < size && this.compare(this.items[leftIndex], this.items[smallest]) < 0) {
        smallest = leftIndex;
      }
      if (rightIndex < size && this.compare(this.items[rightIndex], this.items[smallest]) < 0) {
        smallest = rightIndex;
      }
      if (smallest === index) break;
      this.swap(index, smallest);
      index = smallest;
    }
  }

  protected getParentIndex(index: number): number {
    return Math.floor((index - 1) / 2);
  }

  protected getLeftChildIndex(index: number): number {
    return 2 * index + 1;
  }

  protected getRightChildIndex(index: number): number {
    return 2 * index + 2;
  }

  protected swap(i: number, j: number): void {
    [this.items[i], this.items[j]] = [this.items[j], this.items[i]];
  }

  toArray(): T[] {
    return [...this.items];
  }

  fromArray(array: T[]): this {
    this.items = [...array];
    this.heapify();
    return this;
  }

  clone(): BinaryHeap<T> {
    const result = new BinaryHeap<T>(this.compare);
    result.items = [...this.items];
    return result;
  }

  merge(other: BinaryHeap<T>): this {
    other.items.forEach((item) => this.push(item));
    return this;
  }

  mergeOptimized(other: BinaryHeap<T>): this {
    this.items.push(...other.items);
    this.heapify();
    return this;
  }

  forEach(callback: (value: T, index: number) => void): void {
    this.items.forEach(callback);
  }

  map<U>(callback: (value: T, index: number) => U, compareFn?: (a: U, b: U) => number): BinaryHeap<U> {
    const result = new BinaryHeap<U>(compareFn ?? ((a, b) => a < b ? -1 : a > b ? 1 : 0));
    this.items.forEach((value, index) => result.push(callback(value, index)));
    return result;
  }

  filter(predicate: (value: T, index: number) => boolean): BinaryHeap<T> {
    const result = new BinaryHeap<T>(this.compare);
    this.items.forEach((value, index) => {
      if (predicate(value, index)) result.push(value);
    });
    return result;
  }

  reduce<U>(callback: (acc: U, value: T, index: number) => U, initial: U): U {
    return this.items.reduce(callback, initial);
  }

  sort(): T[] {
    const result: T[] = [];
    const clone = this.clone();
    while (!clone.isEmpty) {
      result.push(clone.pop()!);
    }
    return result;
  }

  drain(): T[] {
    const result: T[] = [];
    while (!this.isEmpty) {
      result.push(this.pop()!);
    }
    return result;
  }

  [Symbol.iterator](): Iterator<T> {
    let index = 0;
    return {
      next: (): IteratorResult<T> => {
        if (index < this.items.length) {
          return { done: false, value: this.items[index++] };
        }
        return { done: true, value: undefined as unknown as T };
      },
    };
  }

  toString(): string {
    return `Heap(${this.size}): [${this.items.join(", ")}]`;
  }

  toJSON(): T[] {
    return this.toArray();
  }
}

export class MinHeap<T> extends BinaryHeap<T> {
  constructor(items?: T[], compareFn?: (a: T, b: T) => number) {
    super(compareFn ?? ((a, b) => a < b ? -1 : a > b ? 1 : 0), items);
  }
}

export class MaxHeap<T> extends BinaryHeap<T> {
  constructor(items?: T[], compareFn?: (a: T, b: T) => number) {
    super(compareFn ?? ((a, b) => a > b ? -1 : a < b ? 1 : 0), items);
  }
}

export function createMinHeap<T>(compareFn?: (a: T, b: T) => number): MinHeap<T> {
  return new MinHeap<T>(undefined, compareFn);
}

export function createMaxHeap<T>(compareFn?: (a: T, b: T) => number): MaxHeap<T> {
  return new MaxHeap<T>(undefined, compareFn);
}

export function heapSort<T>(array: T[], compareFn?: (a: T, b: T) => number): T[] {
  const heap = new BinaryHeap<T>(compareFn ?? ((a, b) => a < b ? -1 : a > b ? 1 : 0), array);
  return heap.sort();
}

export function findKthLargest<T>(array: T[], k: number): T | undefined {
  if (k < 1 || k > array.length) return undefined;
  const heap = new MinHeap<T>();
  for (const value of array) {
    if (heap.size < k) {
      heap.push(value);
    } else if (heap.peek && array[0] < value) {
      heap.replace(value);
    }
  }
  return heap.peek;
}

export function findKthSmallest<T>(array: T[], k: number): T | undefined {
  if (k < 1 || k > array.length) return undefined;
  const heap = new MaxHeap<T>();
  for (const value of array) {
    if (heap.size < k) {
      heap.push(value);
    } else if (heap.peek && heap.peek > value) {
      heap.replace(value);
    }
  }
  return heap.peek;
}
