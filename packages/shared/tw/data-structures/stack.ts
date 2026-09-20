/**
 * Stack (LIFO) implementation.
 * @module shared/data-structures
 */

export class Stack<T> {
  private items: T[] = [];
  private _maxSize: number;

  constructor(maxSize: number = Infinity) {
    this._maxSize = maxSize;
  }

  push(value: T): this {
    if (this.items.length >= this._maxSize) {
      throw new Error("Stack overflow");
    }
    this.items.push(value);
    return this;
  }

  pop(): T | undefined {
    return this.items.pop();
  }

  peek(): T | undefined {
    return this.items[this.items.length - 1];
  }

  peekAt(depth: number): T | undefined {
    return this.items[this.items.length - 1 - depth];
  }

  get size(): number {
    return this.items.length;
  }

  get isEmpty(): boolean {
    return this.items.length === 0;
  }

  get isFull(): boolean {
    return this.items.length >= this._maxSize;
  }

  get maxSize(): number {
    return this._maxSize;
  }

  setMaxSize(size: number): void {
    this._maxSize = size;
    if (this.items.length > size) {
      this.items = this.items.slice(0, size);
    }
  }

  clear(): void {
    this.items = [];
  }

  contains(value: T): boolean {
    return this.items.includes(value);
  }

  indexOf(value: T): number {
    return this.items.lastIndexOf(value);
  }

  toArray(): T[] {
    return [...this.items];
  }

  fromArray(array: T[]): this {
    this.clear();
    for (const item of array) this.push(item);
    return this;
  }

  forEach(callback: (value: T, index: number) => void): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      callback(this.items[i], this.items.length - 1 - i);
    }
  }

  map<U>(callback: (value: T, index: number) => U): Stack<U> {
    const result = new Stack<U>(this._maxSize);
    const items = [...this.items].reverse();
    for (let i = 0; i < items.length; i++) {
      result.push(callback(items[i], i));
    }
    return result;
  }

  filter(predicate: (value: T, index: number) => boolean): Stack<T> {
    const result = new Stack<T>(this._maxSize);
    const items = [...this.items].reverse();
    for (let i = 0; i < items.length; i++) {
      if (predicate(items[i], i)) result.push(items[i]);
    }
    return result;
  }

  reduce<U>(callback: (acc: U, value: T, index: number) => U, initial: U): U {
    let acc = initial;
    const items = [...this.items].reverse();
    for (let i = 0; i < items.length; i++) {
      acc = callback(acc, items[i], i);
    }
    return acc;
  }

  clone(): Stack<T> {
    const result = new Stack<T>(this._maxSize);
    result.items = [...this.items];
    return result;
  }

  swap(): void {
    if (this.items.length < 2) return;
    const top = this.items.pop()!;
    const second = this.items.pop()!;
    this.items.push(top);
    this.items.push(second);
  }

  duplicate(): void {
    if (this.items.length === 0) return;
    this.items.push(this.items[this.items.length - 1]);
  }

  rotate(n: number = 1): void {
    if (this.items.length === 0) return;
    n = n % this.items.length;
    for (let i = 0; i < n; i++) {
      const top = this.items.pop()!;
      this.items.unshift(top);
    }
  }

  reverse(): void {
    this.items.reverse();
  }

  sort(compareFn?: (a: T, b: T) => number): void {
    this.items.sort(compareFn);
  }

  merge(other: Stack<T>): this {
    const otherItems = other.toArray();
    for (const item of otherItems) this.push(item);
    return this;
  }

  split(n: number): Stack<T> {
    const result = new Stack<T>(this._maxSize);
    for (let i = 0; i < n && this.items.length > 0; i++) {
      result.push(this.items.pop()!);
    }
    return result;
  }

  [Symbol.iterator](): Iterator<T> {
    let index = this.items.length - 1;
    return {
      next: (): IteratorResult<T> => {
        if (index >= 0) {
          return { done: false, value: this.items[index--] };
        }
        return { done: true, value: undefined as unknown as T };
      },
    };
  }

  toString(): string {
    return `Stack(${this.items.length}): [${this.items.join(", ")}]`;
  }

  toJSON(): T[] {
    return this.toArray();
  }
}

export function createStack<T>(...values: T[]): Stack<T> {
  const stack = new Stack<T>();
  for (const value of values) stack.push(value);
  return stack;
}

export function sortWithStack<T>(stack: Stack<T>, compareFn?: (a: T, b: T) => number): Stack<T> {
  const temp = new Stack<T>();
  while (!stack.isEmpty) {
    const current = stack.pop()!;
    while (!temp.isEmpty && (compareFn ? compareFn(temp.peek()!, current) > 0 : temp.peek()! > current)) {
      stack.push(temp.pop()!);
    }
    temp.push(current);
  }
  while (!temp.isEmpty) stack.push(temp.pop()!);
  return stack;
}
