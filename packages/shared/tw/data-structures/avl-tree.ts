/**
 * AVL tree -- self-balancing binary search tree
 * @module shared/data-structures
 */

export class AVLTreeNode<T> {
  constructor(
    public value: T,
    public left: AVLTreeNode<T> | null = null,
    public right: AVLTreeNode<T> | null = null,
    public height: number = 1,
  ) {}
}
export class AVLTree<T> {
  private root: AVLTreeNode<T> | null = null;
  private count: number = 0;
  private compare: (a: T, b: T) => number;

  constructor(compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0) { this.compare = compare; }

  insert(value: T): this { this.root = this.insertNode(this.root, value); this.count++; return this; }
  private insertNode(node: AVLTreeNode<T> | null, value: T): AVLTreeNode<T> {
    if (!node) return new AVLTreeNode(value);
    const cmp = this.compare(value, node.value);
    if (cmp < 0) node.left = this.insertNode(node.left, value);
    else if (cmp > 0) node.right = this.insertNode(node.right, value);
    else return node;
    node.height = 1 + Math.max(this.getHeight(node.left), this.getHeight(node.right));
    const balance = this.getBalance(node);
    if (balance > 1 && this.compare(value, node.left!.value) < 0) return this.rotateRight(node);
    if (balance < -1 && this.compare(value, node.right!.value) > 0) return this.rotateLeft(node);
    if (balance > 1 && this.compare(value, node.left!.value) > 0) { node.left = this.rotateLeft(node.left!); return this.rotateRight(node); }
    if (balance < -1 && this.compare(value, node.right!.value) < 0) { node.right = this.rotateRight(node.right!); return this.rotateLeft(node); }
    return node;
  }
  private getHeight(node: AVLTreeNode<T> | null): number { return node ? node.height : 0; }
  private getBalance(node: AVLTreeNode<T> | null): number { return node ? this.getHeight(node.left) - this.getHeight(node.right) : 0; }
  private rotateRight(y: AVLTreeNode<T>): AVLTreeNode<T> {
    const x = y.left!;
    const T2 = x.right;
    x.right = y;
    y.left = T2;
    y.height = 1 + Math.max(this.getHeight(y.left), this.getHeight(y.right));
    x.height = 1 + Math.max(this.getHeight(x.left), this.getHeight(x.right));
    return x;
  }
  private rotateLeft(x: AVLTreeNode<T>): AVLTreeNode<T> {
    const y = x.right!;
    const T2 = y.left;
    y.left = x;
    x.right = T2;
    x.height = 1 + Math.max(this.getHeight(x.left), this.getHeight(x.right));
    y.height = 1 + Math.max(this.getHeight(y.left), this.getHeight(y.right));
    return y;
  }
  search(value: T): boolean { return this.searchNode(this.root, value); }
  private searchNode(node: AVLTreeNode<T> | null, value: T): boolean {
    if (!node) return false;
    const cmp = this.compare(value, node.value);
    if (cmp === 0) return true;
    return cmp < 0 ? this.searchNode(node.left, value) : this.searchNode(node.right, value);
  }
  inOrder(): T[] { const result: T[] = []; this.inOrderTraversal(this.root, result); return result; }
  private inOrderTraversal(node: AVLTreeNode<T> | null, result: T[]): void { if (!node) return; this.inOrderTraversal(node.left, result); result.push(node.value); this.inOrderTraversal(node.right, result); }
  preOrder(): T[] { const result: T[] = []; this.preOrderTraversal(this.root, result); return result; }
  private preOrderTraversal(node: AVLTreeNode<T> | null, result: T[]): void { if (!node) return; result.push(node.value); this.preOrderTraversal(node.left, result); this.preOrderTraversal(node.right, result); }
  postOrder(): T[] { const result: T[] = []; this.postOrderTraversal(this.root, result); return result; }
  private postOrderTraversal(node: AVLTreeNode<T> | null, result: T[]): void { if (!node) return; this.postOrderTraversal(node.left, result); this.postOrderTraversal(node.right, result); result.push(node.value); }
  levelOrder(): T[] { if (!this.root) return []; const result: T[] = []; const queue: AVLTreeNode<T>[] = [this.root]; while (queue.length > 0) { const node = queue.shift()!; result.push(node.value); if (node.left) queue.push(node.left); if (node.right) queue.push(node.right); } return result; }
  min(): T | undefined { if (!this.root) return undefined; let current = this.root; while (current.left) current = current.left; return current.value; }
  max(): T | undefined { if (!this.root) return undefined; let current = this.root; while (current.right) current = current.right; return current.value; }
  size(): number { return this.count; }
  isEmpty(): boolean { return this.count === 0; }
  clear(): void { this.root = null; this.count = 0; }
  getHeight2(): number { return this.getHeight(this.root); }
  isBalanced(): boolean { return this.isBalancedNode(this.root); }
  private isBalancedNode(node: AVLTreeNode<T> | null): boolean { if (!node) return true; const balance = this.getBalance(node); return Math.abs(balance) <= 1 && this.isBalancedNode(node.left) && this.isBalancedNode(node.right); }
  toJSON(): string { return JSON.stringify({ size: this.count, height: this.getHeight2(), balanced: this.isBalanced() }, null, 2); }
}
export function createAVLTree<T>(compare?: (a: T, b: T) => number): AVLTree<T> { return new AVLTree(compare); }

