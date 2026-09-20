/**
 * Red-Black tree -- self-balancing BST with color properties
 * @module shared/data-structures
 */

export type Color = "red" | "black";
export class RBTreeNode<T> {
  constructor(
    public value: T,
    public color: Color = "red",
    public left: RBTreeNode<T> | null = null,
    public right: RBTreeNode<T> | null = null,
    public parent: RBTreeNode<T> | null = null,
  ) {}
}
export class RBTree<T> {
  private root: RBTreeNode<T> | null = null;
  private count: number = 0;
  private compare: (a: T, b: T) => number;

  constructor(compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0) { this.compare = compare; }

  insert(value: T): this {
    const node = new RBTreeNode(value);
    this.insertBST(node);
    this.insertFixup(node);
    this.count++;
    return this;
  }
  private insertBST(node: RBTreeNode<T>): void {
    let parent: RBTreeNode<T> | null = null;
    let current = this.root;
    while (current) {
      parent = current;
      if (this.compare(node.value, current.value) < 0) current = current.left;
      else current = current.right;
    }
    node.parent = parent;
    if (!parent) this.root = node;
    else if (this.compare(node.value, parent.value) < 0) parent.left = node;
    else parent.right = node;
  }
  private insertFixup(node: RBTreeNode<T>): void {
    while (node.parent && node.parent.color === "red") {
      const grandparent = node.parent.parent;
      if (!grandparent) break;
      if (node.parent === grandparent.left) {
        const uncle = grandparent.right;
        if (uncle && uncle.color === "red") { node.parent.color = "black"; uncle.color = "black"; grandparent.color = "red"; node = grandparent; }
        else { if (node === node.parent.right) { node = node.parent; this.rotateLeft(node); } node.parent!.color = "black"; grandparent.color = "red"; this.rotateRight(grandparent); }
      } else {
        const uncle = grandparent.left;
        if (uncle && uncle.color === "red") { node.parent.color = "black"; uncle.color = "black"; grandparent.color = "red"; node = grandparent; }
        else { if (node === node.parent.left) { node = node.parent; this.rotateRight(node); } node.parent!.color = "black"; grandparent.color = "red"; this.rotateLeft(grandparent); }
      }
    }
    if (this.root) this.root.color = "black";
  }
  private rotateLeft(node: RBTreeNode<T>): void {
    const right = node.right!;
    node.right = right.left;
    if (right.left) right.left.parent = node;
    right.parent = node.parent;
    if (!node.parent) this.root = right;
    else if (node === node.parent.left) node.parent.left = right;
    else node.parent.right = right;
    right.left = node;
    node.parent = right;
  }
  private rotateRight(node: RBTreeNode<T>): void {
    const left = node.left!;
    node.left = left.right;
    if (left.right) left.right.parent = node;
    left.parent = node.parent;
    if (!node.parent) this.root = left;
    else if (node === node.parent.right) node.parent.right = left;
    else node.parent.left = left;
    left.right = node;
    node.parent = left;
  }
  search(value: T): boolean {
    let current = this.root;
    while (current) {
      const cmp = this.compare(value, current.value);
      if (cmp === 0) return true;
      current = cmp < 0 ? current.left : current.right;
    }
    return false;
  }
  inOrder(): T[] { const result: T[] = []; this.inOrderTraversal(this.root, result); return result; }
  private inOrderTraversal(node: RBTreeNode<T> | null, result: T[]): void { if (!node) return; this.inOrderTraversal(node.left, result); result.push(node.value); this.inOrderTraversal(node.right, result); }
  size(): number { return this.count; }
  isEmpty(): boolean { return this.count === 0; }
  clear(): void { this.root = null; this.count = 0; }
  min(): T | undefined { if (!this.root) return undefined; let current = this.root; while (current.left) current = current.left; return current.value; }
  max(): T | undefined { if (!this.root) return undefined; let current = this.root; while (current.right) current = current.right; return current.value; }
  toJSON(): string { return JSON.stringify({ size: this.count, root: this.root?.value }, null, 2); }
}
export function createRBTree<T>(compare?: (a: T, b: T) => number): RBTree<T> { return new RBTree(compare); }

