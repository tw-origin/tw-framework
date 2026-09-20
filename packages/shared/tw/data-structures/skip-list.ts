/**
 * Skip list -- probabilistic ordered set
 * @module shared/data-structures
 */

export class SkipListNode<K, V = K> {
  constructor(public key: K, public value: V, public forward: SkipListNode<K, V>[] = []) {}
}
export class SkipList<K, V = K> {
  private head: SkipListNode<K, V>;
  private maxLevel: number;
  private level: number = 0;
  private count: number = 0;
  private p: number = 0.5;
  private compare: (a: K, b: K) => number;

  constructor(maxLevel: number = 16, compare: (a: K, b: K) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0) {
    this.maxLevel = maxLevel;
    this.compare = compare;
    this.head = new SkipListNode<K, V>(null as unknown as K, null as unknown as V, new Array(maxLevel).fill(null));
  }
  private randomLevel(): number {
    let level = 0;
    while (Math.random() < this.p && level < this.maxLevel - 1) level++;
    return level;
  }
  insert(key: K, value?: V): this {
    const update: SkipListNode<K, V>[] = new Array(this.maxLevel).fill(this.head);
    let current = this.head;
    for (let i = this.level; i >= 0; i--) {
      while (current.forward[i] && this.compare(current.forward[i].key, key) < 0) current = current.forward[i];
      update[i] = current;
    }
    current = current.forward[0];
    if (current && this.compare(current.key, key) === 0) { current.value = value ?? key as unknown as V; return this; }
    const newLevel = this.randomLevel();
    if (newLevel > this.level) { for (let i = this.level + 1; i <= newLevel; i++) update[i] = this.head; this.level = newLevel; }
    const newNode = new SkipListNode(key, value ?? key as unknown as V, new Array(newLevel + 1).fill(null));
    for (let i = 0; i <= newLevel; i++) { newNode.forward[i] = update[i].forward[i]; update[i].forward[i] = newNode; }
    this.count++;
    return this;
  }
  search(key: K): V | undefined {
    let current = this.head;
    for (let i = this.level; i >= 0; i--) {
      while (current.forward[i] && this.compare(current.forward[i].key, key) < 0) current = current.forward[i];
    }
    current = current.forward[0];
    if (current && this.compare(current.key, key) === 0) return current.value;
    return undefined;
  }
  contains(key: K): boolean { return this.search(key) !== undefined; }
  delete(key: K): boolean {
    const update: SkipListNode<K, V>[] = new Array(this.maxLevel).fill(this.head);
    let current = this.head;
    for (let i = this.level; i >= 0; i--) {
      while (current.forward[i] && this.compare(current.forward[i].key, key) < 0) current = current.forward[i];
      update[i] = current;
    }
    current = current.forward[0];
    if (!current || this.compare(current.key, key) !== 0) return false;
    for (let i = 0; i <= this.level; i++) {
      if (update[i].forward[i] !== current) break;
      update[i].forward[i] = current.forward[i];
    }
    while (this.level > 0 && !this.head.forward[this.level]) this.level--;
    this.count--;
    return true;
  }
  getAllKeys(): K[] { const result: K[] = []; let current = this.head.forward[0]; while (current) { result.push(current.key); current = current.forward[0]; } return result; }
  getAllValues(): V[] { const result: V[] = []; let current = this.head.forward[0]; while (current) { result.push(current.value); current = current.forward[0]; } return result; }
  min(): K | undefined { return this.head.forward[0]?.key; }
  max(): K | undefined { let current = this.head; for (let i = this.level; i >= 0; i--) while (current.forward[i]) current = current.forward[i]; return current === this.head ? undefined : current.key; }
  size(): number { return this.count; }
  isEmpty(): boolean { return this.count === 0; }
  clear(): void { this.head = new SkipListNode<K, V>(null as unknown as K, null as unknown as V, new Array(this.maxLevel).fill(null)); this.level = 0; this.count = 0; }
  getLevel(): number { return this.level; }
  getMaxLevel(): number { return this.maxLevel; }
  toJSON(): string { return JSON.stringify({ size: this.count, level: this.level, maxLevel: this.maxLevel }, null, 2); }
}
export function createSkipList<K, V = K>(maxLevel?: number, compare?: (a: K, b: K) => number): SkipList<K, V> { return new SkipList(maxLevel, compare); }

