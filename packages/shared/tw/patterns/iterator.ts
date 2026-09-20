/**
 * Iterator -- sequential access to elements
 * @module shared/patterns
 */

export interface Iterator<T> {
  next(): { value: T | undefined; done: boolean };
  current(): T | undefined;
  reset(): void;
  hasNext(): boolean;
  remove?(): T | undefined;
}

export class ArrayIterator<T> implements Iterator<T> {
  private index: number = 0;
  constructor(private array: T[]) {}
  next(): { value: T | undefined; done: boolean } {
    if (this.index < this.array.length) {
      return { value: this.array[this.index++], done: false };
    }
    return { value: undefined, done: true };
  }
  current(): T | undefined { return this.array[this.index]; }
  reset(): void { this.index = 0; }
  hasNext(): boolean { return this.index < this.array.length; }
  remove(): T | undefined { return this.array.splice(this.index, 1)[0]; }
  toArray(): T[] { return [...this.array]; }
  size(): number { return this.array.length; }
  position(): number { return this.index; }
}

export class FilteredIterator<T> implements Iterator<T> {
  private index: number = 0;
  private filtered: T[];
  constructor(array: T[], private predicate: (item: T) => boolean) {
    this.filtered = array.filter(predicate);
  }
  next(): { value: T | undefined; done: boolean } {
    if (this.index < this.filtered.length) {
      return { value: this.filtered[this.index++], done: false };
    }
    return { value: undefined, done: true };
  }
  current(): T | undefined { return this.filtered[this.index]; }
  reset(): void { this.index = 0; }
  hasNext(): boolean { return this.index < this.filtered.length; }
  size(): number { return this.filtered.length; }
}

export class MappedIterator<T, R> implements Iterator<R> {
  private index: number = 0;
  private mapped: R[];
  constructor(array: T[], private mapper: (item: T) => R) {
    this.mapped = array.map(mapper);
  }
  next(): { value: R | undefined; done: boolean } {
    if (this.index < this.mapped.length) {
      return { value: this.mapped[this.index++], done: false };
    }
    return { value: undefined, done: true };
  }
  current(): R | undefined { return this.mapped[this.index]; }
  reset(): void { this.index = 0; }
  hasNext(): boolean { return this.index < this.mapped.length; }
  size(): number { return this.mapped.length; }
}

export class ChainedIterator<T> implements Iterator<T> {
  private iterators: Iterator<T>[];
  private idx: number = 0;
  constructor(iterators: Iterator<T>[]) {
    this.iterators = iterators;
  }
  next(): { value: T | undefined; done: boolean } {
    while (this.idx < this.iterators.length) {
      const result = this.iterators[this.idx].next();
      if (!result.done) return result;
      this.idx++;
    }
    return { value: undefined, done: true };
  }
  current(): T | undefined { return this.iterators[this.idx]?.current(); }
  reset(): void { this.iterators.forEach((it) => it.reset()); this.idx = 0; }
  hasNext(): boolean { return this.idx < this.iterators.length && this.iterators[this.idx].hasNext(); }
  size(): number { return this.iterators.reduce((sum, it) => sum + ((it as any).size?.() ?? 0), 0); }
}

export class PaginatedIterator<T> implements Iterator<T[]> {
  private page: number = 0;
  constructor(private data: T[], private pageSize: number) {}
  next(): { value: T[] | undefined; done: boolean } {
    const start = this.page * this.pageSize;
    if (start >= this.data.length) return { value: undefined, done: true };
    const end = Math.min(start + this.pageSize, this.data.length);
    const value = this.data.slice(start, end);
    this.page++;
    return { value, done: false };
  }
  current(): T[] | undefined {
    const start = (this.page - 1) * this.pageSize;
    return start >= 0 && start < this.data.length ? this.data.slice(start, Math.min(start + this.pageSize, this.data.length)) : undefined;
  }
  reset(): void { this.page = 0; }
  hasNext(): boolean { return this.page * this.pageSize < this.data.length; }
  size(): number { return Math.ceil(this.data.length / this.pageSize); }
}

export function createArrayIterator<T>(array: T[]): ArrayIterator<T> { return new ArrayIterator(array); }
export function createFilteredIterator<T>(array: T[], predicate: (item: T) => boolean): FilteredIterator<T> { return new FilteredIterator(array, predicate); }
export function createMappedIterator<T, R>(array: T[], mapper: (item: T) => R): MappedIterator<T, R> { return new MappedIterator(array, mapper); }
export function createChainedIterator<T>(iterators: Iterator<T>[]): ChainedIterator<T> { return new ChainedIterator(iterators); }
export function createPaginatedIterator<T>(data: T[], pageSize: number): PaginatedIterator<T> { return new PaginatedIterator(data, pageSize); }

