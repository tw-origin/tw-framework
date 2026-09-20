/**
 * B-Tree -- balanced tree for disk-based storage
 * @module shared/data-structures
 */

export class BTreeNode<K, V = K> {
  constructor(
    public keys: K[] = [],
    public values: V[] = [],
    public children: BTreeNode<K, V>[] = [],
    public isLeaf: boolean = true,
  ) {}
}
export class BTree<K, V = K> {
  private root: BTreeNode<K, V>;
  private t: number;
  private count: number = 0;
  private compare: (a: K, b: K) => number;

  constructor(order: number = 3, compare: (a: K, b: K) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0) {
    this.t = Math.max(2, Math.floor(order / 2));
    this.compare = compare;
    this.root = new BTreeNode<K, V>();
  }

  insert(key: K, value?: V): this {
    const root = this.root;
    if (root.keys.length === 2 * this.t - 1) {
      const newRoot = new BTreeNode<K, V>([], [], [root], false);
      this.splitChild(newRoot, 0);
      this.root = newRoot;
      this.insertNonFull(newRoot, key, value ?? key as unknown as V);
    } else {
      this.insertNonFull(root, key, value ?? key as unknown as V);
    }
    this.count++;
    return this;
  }
  private insertNonFull(node: BTreeNode<K, V>, key: K, value: V): void {
    let i = node.keys.length - 1;
    if (node.isLeaf) {
      while (i >= 0 && this.compare(key, node.keys[i]) < 0) i--;
      i++;
      node.keys.splice(i, 0, key);
      node.values.splice(i, 0, value);
    } else {
      while (i >= 0 && this.compare(key, node.keys[i]) < 0) i--;
      i++;
      if (node.children[i].keys.length === 2 * this.t - 1) {
        this.splitChild(node, i);
        if (this.compare(key, node.keys[i]) > 0) i++;
      }
      this.insertNonFull(node.children[i], key, value);
    }
  }
  private splitChild(parent: BTreeNode<K, V>, index: number): void {
    const child = parent.children[index];
    const newNode = new BTreeNode<K, V>();
    const midKey = child.keys[this.t - 1];
    const midValue = child.values[this.t - 1];
    newNode.keys = child.keys.slice(this.t);
    newNode.values = child.values.slice(this.t);
    newNode.isLeaf = child.isLeaf;
    if (!child.isLeaf) newNode.children = child.children.slice(this.t);
    child.keys = child.keys.slice(0, this.t - 1);
    child.values = child.values.slice(0, this.t - 1);
    if (!child.isLeaf) child.children = child.children.slice(0, this.t);
    parent.keys.splice(index, 0, midKey);
    parent.values.splice(index, 0, midValue);
    parent.children.splice(index + 1, 0, newNode);
    parent.isLeaf = false;
  }
  search(key: K): V | undefined { return this.searchNode(this.root, key); }
  private searchNode(node: BTreeNode<K, V>, key: K): V | undefined {
    let i = 0;
    while (i < node.keys.length && this.compare(key, node.keys[i]) > 0) i++;
    if (i < node.keys.length && this.compare(key, node.keys[i]) === 0) return node.values[i];
    if (node.isLeaf) return undefined;
    return this.searchNode(node.children[i], key);
  }
  contains(key: K): boolean { return this.search(key) !== undefined; }
  getAllKeys(): K[] { const result: K[] = []; this.collectKeys(this.root, result); return result; }
  private collectKeys(node: BTreeNode<K, V>, result: K[]): void { for (let i = 0; i < node.keys.length; i++) { if (!node.isLeaf) this.collectKeys(node.children[i], result); result.push(node.keys[i]); } if (!node.isLeaf) this.collectKeys(node.children[node.keys.length], result); }
  getAllValues(): V[] { const result: V[] = []; this.collectValues(this.root, result); return result; }
  private collectValues(node: BTreeNode<K, V>, result: V[]): void { for (let i = 0; i < node.values.length; i++) { if (!node.isLeaf) this.collectValues(node.children[i], result); result.push(node.values[i]); } if (!node.isLeaf) this.collectValues(node.children[node.values.length], result); }
  size(): number { return this.count; }
  isEmpty(): boolean { return this.count === 0; }
  clear(): void { this.root = new BTreeNode<K, V>(); this.count = 0; }
  getOrder(): number { return 2 * this.t; }
  getHeight(): number { let h = 0; let node = this.root; while (!node.isLeaf) { node = node.children[0]; h++; } return h; }
  toJSON(): string { return JSON.stringify({ size: this.count, order: this.getOrder(), height: this.getHeight() }, null, 2); }
}
export function createBTree<K, V = K>(order?: number, compare?: (a: K, b: K) => number): BTree<K, V> { return new BTree(order, compare); }

