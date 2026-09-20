/**
 * Disjoint set / Union-Find -- manages disjoint sets
 * @module shared/data-structures
 */

export class DisjointSet<T = number> {
  private parent: Map<T, T> = new Map();
  private rank: Map<T, number> = new Map();
  private size: Map<T, number> = new Map();
  private count: number = 0;

  makeSet(item: T): this {
    if (!this.parent.has(item)) {
      this.parent.set(item, item);
      this.rank.set(item, 0);
      this.size.set(item, 1);
      this.count++;
    }
    return this;
  }

  makeSets(items: T[]): this {
    for (const item of items) this.makeSet(item);
    return this;
  }

  find(item: T): T | undefined {
    if (!this.parent.has(item)) return undefined;
    if (this.parent.get(item) !== item) {
      this.parent.set(item, this.find(this.parent.get(item)!)!);
    }
    return this.parent.get(item);
  }

  union(a: T, b: T): boolean {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (!rootA || !rootB || rootA === rootB) return false;
    const rankA = this.rank.get(rootA) ?? 0;
    const rankB = this.rank.get(rootB) ?? 0;
    if (rankA < rankB) {
      this.parent.set(rootA, rootB);
      this.size.set(rootB, (this.size.get(rootB) ?? 0) + (this.size.get(rootA) ?? 0));
    } else if (rankA > rankB) {
      this.parent.set(rootB, rootA);
      this.size.set(rootA, (this.size.get(rootA) ?? 0) + (this.size.get(rootB) ?? 0));
    } else {
      this.parent.set(rootB, rootA);
      this.rank.set(rootA, rankA + 1);
      this.size.set(rootA, (this.size.get(rootA) ?? 0) + (this.size.get(rootB) ?? 0));
    }
    this.count--;
    return true;
  }

  connected(a: T, b: T): boolean {
    const rootA = this.find(a);
    const rootB = this.find(b);
    return rootA !== undefined && rootA === rootB;
  }

  getSetSize(item: T): number {
    const root = this.find(item);
    return root ? (this.size.get(root) ?? 0) : 0;
  }

  getSetCount(): number { return this.count; }
  getTotalElements(): number { return this.parent.size; }
  getSets(): Map<T, T[]> {
    const sets = new Map<T, T[]>();
    for (const item of this.parent.keys()) {
      const root = this.find(item)!;
      if (!sets.has(root)) sets.set(root, []);
      sets.get(root)!.push(item);
    }
    return sets;
  }
  has(item: T): boolean { return this.parent.has(item); }
  clear(): void { this.parent.clear(); this.rank.clear(); this.size.clear(); this.count = 0; }
  toJSON(): string { return JSON.stringify({ sets: this.count, elements: this.parent.size }, null, 2); }
}
export function createDisjointSet<T = number>(): DisjointSet<T> { return new DisjointSet(); }

