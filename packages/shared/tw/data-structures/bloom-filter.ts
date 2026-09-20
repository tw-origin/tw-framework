/**
 * Bloom filter -- probabilistic membership test
 * @module shared/data-structures
 */

export class BloomFilter {
  private bitArray: Uint8Array;
  private size: number;
  private hashCount: number;
  private count: number = 0;
  private hashFunctions: Array<(value: string) => number>;

  constructor(size: number = 1000, hashCount: number = 7) {
    this.size = size;
    this.hashCount = hashCount;
    this.bitArray = new Uint8Array(size);
    this.hashFunctions = this.createHashFunctions(hashCount);
  }

  private createHashFunctions(count: number): Array<(value: string) => number> {
    const functions: Array<(value: string) => number> = [];
    for (let i = 0; i < count; i++) {
      const seed = i + 1;
      functions.push((value: string) => {
        let hash = seed;
        for (let j = 0; j < value.length; j++) {
          hash = ((hash << 5) - hash) + value.charCodeAt(j);
          hash = hash & hash;
        }
        return Math.abs(hash) % this.size;
      });
    }
    return functions;
  }

  add(value: string): this {
    for (const hashFn of this.hashFunctions) {
      this.bitArray[hashFn(value)] = 1;
    }
    this.count++;
    return this;
  }

  mightContain(value: string): boolean {
    for (const hashFn of this.hashFunctions) {
      if (this.bitArray[hashFn(value)] === 0) return false;
    }
    return true;
  }

  addAll(values: string[]): this {
    for (const value of values) this.add(value);
    return this;
  }

  containsAll(values: string[]): boolean[] {
    return values.map((v) => this.mightContain(v));
  }

  clear(): this { this.bitArray.fill(0); this.count = 0; return this; }

  getSize(): number { return this.size; }
  getHashCount(): number { return this.hashCount; }
  getCount(): number { return this.count; }
  getBitCount(): number { let count = 0; for (const bit of this.bitArray) if (bit) count++; return count; }
  getLoadFactor(): number { return this.getBitCount() / this.size; }
  getFalsePositiveRate(): number {
    const m = this.size;
    const k = this.hashCount;
    const n = this.count;
    return Math.pow(1 - Math.pow(1 - 1 / m, k * n), k);
  }
  isFull(): boolean { return this.getLoadFactor() > 0.5; }
  isEmpty(): boolean { return this.count === 0; }
  toJSON(): string { return JSON.stringify({ size: this.size, hashCount: this.hashCount, count: this.count, loadFactor: this.getLoadFactor(), falsePositiveRate: this.getFalsePositiveRate() }, null, 2); }
}
export function createBloomFilter(size?: number, hashCount?: number): BloomFilter { return new BloomFilter(size, hashCount); }

