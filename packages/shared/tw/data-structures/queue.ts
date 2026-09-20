/**
 * Queue (FIFO) implementation with circular buffer.
 * @module shared/data-structures
 */

export class Queue<T> {
  private items: T[] = [];
  private head: number = 0;
  private _maxSize: number;

  constructor(maxSize: number = Infinity) {
    this._maxSize = maxSize;
  }

  enqueue(value: T): this {
    if (this.items.length - this.head >= this._maxSize) {
      throw new Error("Queue overflow");
    }
    this.items.push(value);
    return this;
  }

  dequeue(): T | undefined {
    if (this.head >= this.items.length) return undefined;
    const value = this.items[this.head];
    this.items[this.head] = undefined as unknown as T;
    this.head++;
    if (this.head > 0 && this.head >= this.items.length / 2) {
      this.compact();
    }
    return value;
  }

  front(): T | undefined {
    return this.items[this.head];
  }

  back(): T | undefined {
    return this.items[this.items.length - 1];
  }

  get size(): number {
    return this.items.length - this.head;
  }

  get isEmpty(): boolean {
    return this.head >= this.items.length;
  }

  get isFull(): boolean {
    return this.size >= this._maxSize;
  }

  get maxSize(): number {
    return this._maxSize;
  }

  setMaxSize(size: number): void {
    this._maxSize = size;
    if (this.size > size) {
      const excess = this.size - size;
      this.head += excess;
      this.compact();
    }
  }

  clear(): void {
    this.items = [];
    this.head = 0;
  }

  contains(value: T): boolean {
    for (let i = this.head; i < this.items.length; i++) {
      if (this.items[i] === value) return true;
    }
    return false;
  }

  indexOf(value: T): number {
    for (let i = this.head; i < this.items.length; i++) {
      if (this.items[i] === value) return i - this.head;
    }
    return -1;
  }

  toArray(): T[] {
    return this.items.slice(this.head);
  }

  fromArray(array: T[]): this {
    this.clear();
    for (const item of array) this.enqueue(item);
    return this;
  }

  forEach(callback: (value: T, index: number) => void): void {
    for (let i = this.head; i < this.items.length; i++) {
      callback(this.items[i], i - this.head);
    }
  }

  map<U>(callback: (value: T, index: number) => U): Queue<U> {
    const result = new Queue<U>(this._maxSize);
    this.forEach((value, index) => result.enqueue(callback(value, index)));
    return result;
  }

  filter(predicate: (value: T, index: number) => boolean): Queue<T> {
    const result = new Queue<T>(this._maxSize);
    this.forEach((value, index) => {
      if (predicate(value, index)) result.enqueue(value);
    });
    return result;
  }

  reduce<U>(callback: (acc: U, value: T, index: number) => U, initial: U): U {
    let acc = initial;
    this.forEach((value, index) => {
      acc = callback(acc, value, index);
    });
    return acc;
  }

  clone(): Queue<T> {
    const result = new Queue<T>(this._maxSize);
    result.items = this.toArray();
    result.head = 0;
    return result;
  }

  merge(other: Queue<T>): this {
    other.forEach((value) => this.enqueue(value));
    return this;
  }

  split(n: number): Queue<T> {
    const result = new Queue<T>(this._maxSize);
    for (let i = 0; i < n && !this.isEmpty; i++) {
      result.enqueue(this.dequeue()!);
    }
    return result;
  }

  reverse(): void {
    const items = this.toArray().reverse();
    this.clear();
    for (const item of items) this.enqueue(item);
  }

  sort(compareFn?: (a: T, b: T) => number): void {
    const items = this.toArray();
    items.sort(compareFn);
    this.clear();
    for (const item of items) this.enqueue(item);
  }

  peek(n: number = 0): T | undefined {
    const index = this.head + n;
    if (index >= this.items.length) return undefined;
    return this.items[index];
  }

  drain(): T[] {
    const result: T[] = [];
    while (!this.isEmpty) {
      result.push(this.dequeue()!);
    }
    return result;
  }

  drainTo(predicate: (value: T) => boolean): T[] {
    const result: T[] = [];
    while (!this.isEmpty) {
      const value = this.front()!;
      if (predicate(value)) {
        result.push(this.dequeue()!);
      } else {
        break;
      }
    }
    return result;
  }

  removeIf(predicate: (value: T) => boolean): number {
    const remaining: T[] = [];
    let count = 0;
    while (!this.isEmpty) {
      const value = this.dequeue()!;
      if (predicate(value)) {
        count++;
      } else {
        remaining.push(value);
      }
    }
    for (const item of remaining) this.enqueue(item);
    return count;
  }

  compact(): void {
    if (this.head === 0) return;
    this.items = this.items.slice(this.head);
    this.head = 0;
  }

  [Symbol.iterator](): Iterator<T> {
    let index = this.head;
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
    return `Queue(${this.size}): [${this.toArray().join(", ")}]`;
  }

  toJSON(): T[] {
    return this.toArray();
  }
}

export function createQueue<T>(...values: T[]): Queue<T> {
  const queue = new Queue<T>();
  for (const value of values) queue.enqueue(value);
  return queue;
}

export class PriorityQueue<T> {
  private items: Array<{ value: T; priority: number }> = [];

  enqueue(value: T, priority: number = 0): this {
    this.items.push({ value, priority });
    this.items.sort((a, b) => b.priority - a.priority);
    return this;
  }

  dequeue(): T | undefined {
    return this.items.shift()?.value;
  }

  front(): T | undefined {
    return this.items[0]?.value;
  }

  back(): T | undefined {
    return this.items[this.items.length - 1]?.value;
  }

  get size(): number {
    return this.items.length;
  }

  get isEmpty(): boolean {
    return this.items.length === 0;
  }

  clear(): void {
    this.items = [];
  }

  contains(value: T): boolean {
    return this.items.some((item) => item.value === value);
  }

  getPriority(value: T): number | undefined {
    return this.items.find((item) => item.value === value)?.priority;
  }

  setPriority(value: T, priority: number): boolean {
    const item = this.items.find((item) => item.value === value);
    if (item) {
      item.priority = priority;
      this.items.sort((a, b) => b.priority - a.priority);
      return true;
    }
    return false;
  }

  remove(value: T): boolean {
    const index = this.items.findIndex((item) => item.value === value);
    if (index !== -1) {
      this.items.splice(index, 1);
      return true;
    }
    return false;
  }

  toArray(): T[] {
    return this.items.map((item) => item.value);
  }

  toArrayWithPriority(): Array<{ value: T; priority: number }> {
    return [...this.items];
  }

  fromArray(array: Array<{ value: T; priority: number }>): this {
    this.clear();
    this.items = [...array];
    this.items.sort((a, b) => b.priority - a.priority);
    return this;
  }

  clone(): PriorityQueue<T> {
    const result = new PriorityQueue<T>();
    result.items = [...this.items];
    return result;
  }

  merge(other: PriorityQueue<T>): this {
    other.items.forEach((item) => this.enqueue(item.value, item.priority));
    return this;
  }

  [Symbol.iterator](): Iterator<T> {
    let index = 0;
    return {
      next: (): IteratorResult<T> => {
        if (index < this.items.length) {
          return { done: false, value: this.items[index++].value };
        }
        return { done: true, value: undefined as unknown as T };
      },
    };
  }

  toString(): string {
    return `PriorityQueue(${this.size})`;
  }

  toJSON(): Array<{ value: T; priority: number }> {
    return this.toArrayWithPriority();
  }
}

export function createPriorityQueue<T>(): PriorityQueue<T> {
  return new PriorityQueue<T>();
}

export class Deque<T> {
  private items: T[] = [];

  pushFront(value: T): this {
    this.items.unshift(value);
    return this;
  }

  pushBack(value: T): this {
    this.items.push(value);
    return this;
  }

  popFront(): T | undefined {
    return this.items.shift();
  }

  popBack(): T | undefined {
    return this.items.pop();
  }

  front(): T | undefined {
    return this.items[0];
  }

  back(): T | undefined {
    return this.items[this.items.length - 1];
  }

  get size(): number {
    return this.items.length;
  }

  get isEmpty(): boolean {
    return this.items.length === 0;
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
    if (index !== -1) {
      this.items.splice(index, 1);
      return true;
    }
    return false;
  }

  removeAll(value: T): number {
    let count = 0;
    while (this.remove(value)) count++;
    return count;
  }

  get(index: number): T | undefined {
    return this.items[index];
  }

  set(index: number, value: T): boolean {
    if (index < 0 || index >= this.items.length) return false;
    this.items[index] = value;
    return true;
  }

  insert(index: number, value: T): this {
    if (index <= 0) return this.pushFront(value);
    if (index >= this.items.length) return this.pushBack(value);
    this.items.splice(index, 0, value);
    return this;
  }

  removeAt(index: number): T | undefined {
    if (index < 0 || index >= this.items.length) return undefined;
    return this.items.splice(index, 1)[0];
  }

  toArray(): T[] {
    return [...this.items];
  }

  fromArray(array: T[]): this {
    this.items = [...array];
    return this;
  }

  forEach(callback: (value: T, index: number) => void): void {
    this.items.forEach(callback);
  }

  map<U>(callback: (value: T, index: number) => U): Deque<U> {
    const result = new Deque<U>();
    this.items.forEach((value, index) => result.pushBack(callback(value, index)));
    return result;
  }

  filter(predicate: (value: T, index: number) => boolean): Deque<T> {
    const result = new Deque<T>();
    this.items.forEach((value, index) => {
      if (predicate(value, index)) result.pushBack(value);
    });
    return result;
  }

  reduce<U>(callback: (acc: U, value: T, index: number) => U, initial: U): U {
    return this.items.reduce(callback, initial);
  }

  clone(): Deque<T> {
    const result = new Deque<T>();
    result.items = [...this.items];
    return result;
  }

  reverse(): void {
    this.items.reverse();
  }

  rotate(n: number): void {
    if (this.items.length === 0) return;
    n = n % this.items.length;
    if (n > 0) {
      const part = this.items.splice(this.items.length - n);
      this.items.unshift(...part);
    } else if (n < 0) {
      const part = this.items.splice(0, -n);
      this.items.push(...part);
    }
  }

  sort(compareFn?: (a: T, b: T) => number): void {
    this.items.sort(compareFn);
  }

  slice(start: number, end: number): Deque<T> {
    const result = new Deque<T>();
    result.items = this.items.slice(start, end);
    return result;
  }

  concat(other: Deque<T>): Deque<T> {
    const result = new Deque<T>();
    result.items = [...this.items, ...other.items];
    return result;
  }

  merge(other: Deque<T>): this {
    other.forEach((value) => this.pushBack(value));
    return this;
  }

  split(n: number): Deque<T> {
    const result = new Deque<T>();
    for (let i = 0; i < n && this.items.length > 0; i++) {
      result.pushBack(this.popFront()!);
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
    return `Deque(${this.size}): [${this.items.join(", ")}]`;
  }

  toJSON(): T[] {
    return this.toArray();
  }
}

export function createDeque<T>(...values: T[]): Deque<T> {
  const deque = new Deque<T>();
  for (const value of values) deque.pushBack(value);
  return deque;
}

export class CircularQueue<T> {
  private items: (T | undefined)[];
  private front: number = 0;
  private rear: number = 0;
  private _size: number = 0;
  private _capacity: number;

  constructor(capacity: number = 100) {
    this._capacity = capacity;
    this.items = new Array(capacity).fill(undefined);
  }

  enqueue(value: T): this {
    if (this._size >= this._capacity) {
      throw new Error("Circular queue overflow");
    }
    this.items[this.rear] = value;
    this.rear = (this.rear + 1) % this._capacity;
    this._size++;
    return this;
  }

  dequeue(): T | undefined {
    if (this._size === 0) return undefined;
    const value = this.items[this.front];
    this.items[this.front] = undefined;
    this.front = (this.front + 1) % this._capacity;
    this._size--;
    return value;
  }

  front_value(): T | undefined {
    return this.items[this.front];
  }

  rear_value(): T | undefined {
    return this.items[(this.rear - 1 + this._capacity) % this._capacity];
  }

  get size(): number {
    return this._size;
  }

  get capacity(): number {
    return this._capacity;
  }

  get isEmpty(): boolean {
    return this._size === 0;
  }

  get isFull(): boolean {
    return this._size >= this._capacity;
  }

  clear(): void {
    this.items.fill(undefined);
    this.front = 0;
    this.rear = 0;
    this._size = 0;
  }

  contains(value: T): boolean {
    for (let i = 0; i < this._size; i++) {
      const index = (this.front + i) % this._capacity;
      if (this.items[index] === value) return true;
    }
    return false;
  }

  toArray(): T[] {
    const result: T[] = [];
    for (let i = 0; i < this._size; i++) {
      const index = (this.front + i) % this._capacity;
      result.push(this.items[index]!);
    }
    return result;
  }

  [Symbol.iterator](): Iterator<T> {
    let index = 0;
    return {
      next: (): IteratorResult<T> => {
        if (index < this._size) {
          const arrayIndex = (this.front + index) % this._capacity;
          index++;
          return { done: false, value: this.items[arrayIndex]! };
        }
        return { done: true, value: undefined as unknown as T };
      },
    };
  }

  toString(): string {
    return `CircularQueue(${this.size}/${this.capacity})`;
  }
}

export function createCircularQueue<T>(capacity: number = 100): CircularQueue<T> {
  return new CircularQueue<T>(capacity);
}
