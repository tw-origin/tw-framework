/**
 * Doubly linked list implementation.
 * @module shared/data-structures
 */

export class ListNode<T> {
  constructor(
    public value: T,
    public prev: ListNode<T> | null = null,
    public next: ListNode<T> | null = null,
  ) {}
}

export class LinkedList<T> {
  private head: ListNode<T> | null = null;
  private tail: ListNode<T> | null = null;
  private _size: number = 0;

  get size(): number { return this._size; }
  get isEmpty(): boolean { return this._size === 0; }
  get first(): T | undefined { return this.head?.value; }
  get last(): T | undefined { return this.tail?.value; }

  prepend(value: T): this {
    const node = new ListNode(value, null, this.head);
    if (this.head) this.head.prev = node;
    else this.tail = node;
    this.head = node;
    this._size++;
    return this;
  }

  append(value: T): this {
    const node = new ListNode(value, this.tail, null);
    if (this.tail) this.tail.next = node;
    else this.head = node;
    this.tail = node;
    this._size++;
    return this;
  }

  insertAt(index: number, value: T): this {
    if (index <= 0) return this.prepend(value);
    if (index >= this._size) return this.append(value);
    const current = this.getNodeAt(index)!;
    const node = new ListNode(value, current.prev, current);
    if (current.prev) current.prev.next = node;
    current.prev = node;
    this._size++;
    return this;
  }

  removeFirst(): T | undefined {
    if (!this.head) return undefined;
    const value = this.head.value;
    this.head = this.head.next;
    if (this.head) this.head.prev = null;
    else this.tail = null;
    this._size--;
    return value;
  }

  removeLast(): T | undefined {
    if (!this.tail) return undefined;
    const value = this.tail.value;
    this.tail = this.tail.prev;
    if (this.tail) this.tail.next = null;
    else this.head = null;
    this._size--;
    return value;
  }

  removeAt(index: number): T | undefined {
    const node = this.getNodeAt(index);
    if (!node) return undefined;
    if (node.prev) node.prev.next = node.next;
    else this.head = node.next;
    if (node.next) node.next.prev = node.prev;
    else this.tail = node.prev;
    this._size--;
    return node.value;
  }

  remove(value: T): boolean {
    let current = this.head;
    while (current) {
      if (current.value === value) {
        if (current.prev) current.prev.next = current.next;
        else this.head = current.next;
        if (current.next) current.next.prev = current.prev;
        else this.tail = current.prev;
        this._size--;
        return true;
      }
      current = current.next;
    }
    return false;
  }

  removeAll(value: T): number {
    let count = 0;
    while (this.remove(value)) count++;
    return count;
  }

  get(index: number): T | undefined {
    return this.getNodeAt(index)?.value;
  }

  set(index: number, value: T): boolean {
    const node = this.getNodeAt(index);
    if (!node) return false;
    node.value = value;
    return true;
  }

  indexOf(value: T): number {
    let index = 0;
    let current = this.head;
    while (current) {
      if (current.value === value) return index;
      current = current.next;
      index++;
    }
    return -1;
  }

  lastIndexOf(value: T): number {
    let index = this._size - 1;
    let current = this.tail;
    while (current) {
      if (current.value === value) return index;
      current = current.prev;
      index--;
    }
    return -1;
  }

  contains(value: T): boolean {
    return this.indexOf(value) !== -1;
  }

  find(predicate: (value: T, index: number) => boolean): T | undefined {
    let index = 0;
    let current = this.head;
    while (current) {
      if (predicate(current.value, index)) return current.value;
      current = current.next;
      index++;
    }
    return undefined;
  }

  findIndex(predicate: (value: T, index: number) => boolean): number {
    let index = 0;
    let current = this.head;
    while (current) {
      if (predicate(current.value, index)) return index;
      current = current.next;
      index++;
    }
    return -1;
  }

  forEach(callback: (value: T, index: number) => void): void {
    let index = 0;
    let current = this.head;
    while (current) {
      callback(current.value, index);
      current = current.next;
      index++;
    }
  }

  map<U>(callback: (value: T, index: number) => U): LinkedList<U> {
    const result = new LinkedList<U>();
    this.forEach((value, index) => result.append(callback(value, index)));
    return result;
  }

  filter(predicate: (value: T, index: number) => boolean): LinkedList<T> {
    const result = new LinkedList<T>();
    this.forEach((value, index) => {
      if (predicate(value, index)) result.append(value);
    });
    return result;
  }

  reduce<U>(callback: (acc: U, value: T, index: number) => U, initial: U): U {
    let acc = initial;
    let index = 0;
    let current = this.head;
    while (current) {
      acc = callback(acc, current.value, index);
      current = current.next;
      index++;
    }
    return acc;
  }

  some(predicate: (value: T, index: number) => boolean): boolean {
    let index = 0;
    let current = this.head;
    while (current) {
      if (predicate(current.value, index)) return true;
      current = current.next;
      index++;
    }
    return false;
  }

  every(predicate: (value: T, index: number) => boolean): boolean {
    let index = 0;
    let current = this.head;
    while (current) {
      if (!predicate(current.value, index)) return false;
      current = current.next;
      index++;
    }
    return true;
  }

  toArray(): T[] {
    const result: T[] = [];
    this.forEach((value) => result.push(value));
    return result;
  }

  fromArray(array: T[]): this {
    this.clear();
    for (const item of array) this.append(item);
    return this;
  }

  reverse(): this {
    let current = this.head;
    while (current) {
      const temp = current.next;
      current.next = current.prev;
      current.prev = temp;
      current = temp;
    }
    const temp = this.head;
    this.head = this.tail;
    this.tail = temp;
    return this;
  }

  sort(compareFn?: (a: T, b: T) => number): this {
    const array = this.toArray();
    array.sort(compareFn);
    this.fromArray(array);
    return this;
  }

  shuffle(): this {
    const array = this.toArray();
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    this.fromArray(array);
    return this;
  }

  slice(start: number = 0, end: number = this._size): LinkedList<T> {
    const result = new LinkedList<T>();
    let index = 0;
    let current = this.head;
    while (current && index < end) {
      if (index >= start) result.append(current.value);
      current = current.next;
      index++;
    }
    return result;
  }

  concat(other: LinkedList<T>): LinkedList<T> {
    const result = new LinkedList<T>();
    this.forEach((value) => result.append(value));
    other.forEach((value) => result.append(value));
    return result;
  }

  clone(): LinkedList<T> {
    const result = new LinkedList<T>();
    this.forEach((value) => result.append(value));
    return result;
  }

  clear(): void {
    this.head = null;
    this.tail = null;
    this._size = 0;
  }

  private getNodeAt(index: number): ListNode<T> | null {
    if (index < 0 || index >= this._size) return null;
    if (index < this._size / 2) {
      let current = this.head;
      for (let i = 0; i < index; i++) current = current?.next ?? null;
      return current;
    } else {
      let current = this.tail;
      for (let i = this._size - 1; i > index; i--) current = current?.prev ?? null;
      return current;
    }
  }

  [Symbol.iterator](): Iterator<T> {
    let current = this.head;
    return {
      next: (): IteratorResult<T> => {
        if (current) {
          const value = current.value;
          current = current.next;
          return { done: false, value };
        }
        return { done: true, value: undefined as unknown as T };
      },
    };
  }

  toString(): string {
    return this.toArray().toString();
  }

  toJSON(): T[] {
    return this.toArray();
  }
}

export function createLinkedList<T>(...values: T[]): LinkedList<T> {
  const list = new LinkedList<T>();
  for (const value of values) list.append(value);
  return list;
}
