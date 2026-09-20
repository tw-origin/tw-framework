/**
 * Binary tree, BST, AVL tree, Red-Black tree implementations.
 * @module shared/data-structures
 */

export class TreeNode<T> {
  constructor(
    public value: T,
    public left: TreeNode<T> | null = null,
    public right: TreeNode<T> | null = null,
    public parent: TreeNode<T> | null = null,
    public height: number = 1,
    public color: "red" | "black" = "red",
  ) {}
}

export class BinarySearchTree<T> {
  protected root: TreeNode<T> | null = null;
  protected _size: number = 0;
  protected compare: (a: T, b: T) => number;

  constructor(compareFn?: (a: T, b: T) => number) {
    this.compare = compareFn ?? ((a, b) => a < b ? -1 : a > b ? 1 : 0);
  }

  get size(): number { return this._size; }
  get isEmpty(): boolean { return this._size === 0; }
  get height(): number { return this.getHeight(this.root); }

  insert(value: T): this {
    this.root = this.insertNode(this.root, value);
    this._size++;
    return this;
  }

  protected insertNode(node: TreeNode<T> | null, value: T): TreeNode<T> {
    if (!node) return new TreeNode(value);
    const cmp = this.compare(value, node.value);
    if (cmp < 0) {
      node.left = this.insertNode(node.left, value);
      node.left.parent = node;
    } else if (cmp > 0) {
      node.right = this.insertNode(node.right, value);
      node.right.parent = node;
    }
    return node;
  }

  remove(value: T): boolean {
    const node = this.findNode(value as any);
    if (!node) return false;
    this.root = this.removeNode(this.root, value as any);
    this._size--;
    return true;
  }

  protected removeNode(node: TreeNode<T> | null, value: T): TreeNode<T> | null {
    if (!node) return null;
    const cmp = this.compare(value, node.value);
    if (cmp < 0) {
      node.left = this.removeNode(node.left, value);
      if (node.left) node.left.parent = node;
    } else if (cmp > 0) {
      node.right = this.removeNode(node.right, value);
      if (node.right) node.right.parent = node;
    } else {
      if (!node.left) return node.right;
      if (!node.right) return node.left;
      const minNode = this.findMinNode(node.right)!;
      node.value = minNode.value;
      node.right = this.removeNode(node.right, minNode.value);
      if (node.right) node.right.parent = node;
    }
    return node;
  }

  contains(value: T): boolean {
    return this.findNode(value as any) !== null;
  }

  find(value: T): T | undefined {
    const node = this.findNode(value as any);
    return node?.value;
  }

  protected findNode(node: TreeNode<T> | null, value?: T): TreeNode<T> | null {
    if (!node) return null;
    if (value === undefined) return null;
    const cmp = this.compare(value, node.value);
    if (cmp === 0) return node;
    return cmp < 0 ? this.findNode(node.left, value) : this.findNode(node.right, value);
  }

  protected findMinNode(node: TreeNode<T> | null = this.root): TreeNode<T> | null {
    if (!node) return null;
    while (node.left) node = node.left;
    return node;
  }

  protected findMaxNode(node: TreeNode<T> | null = this.root): TreeNode<T> | null {
    if (!node) return null;
    while (node.right) node = node.right;
    return node;
  }

  min(): T | undefined {
    return this.findMinNode()?.value;
  }

  max(): T | undefined {
    return this.findMaxNode()?.value;
  }

  inorder(): T[] {
    const result: T[] = [];
    this.inorderTraversal(this.root, result);
    return result;
  }

  protected inorderTraversal(node: TreeNode<T> | null, result: T[]): void {
    if (!node) return;
    this.inorderTraversal(node.left, result);
    result.push(node.value);
    this.inorderTraversal(node.right, result);
  }

  preorder(): T[] {
    const result: T[] = [];
    this.preorderTraversal(this.root, result);
    return result;
  }

  protected preorderTraversal(node: TreeNode<T> | null, result: T[]): void {
    if (!node) return;
    result.push(node.value);
    this.preorderTraversal(node.left, result);
    this.preorderTraversal(node.right, result);
  }

  postorder(): T[] {
    const result: T[] = [];
    this.postorderTraversal(this.root, result);
    return result;
  }

  protected postorderTraversal(node: TreeNode<T> | null, result: T[]): void {
    if (!node) return;
    this.postorderTraversal(node.left, result);
    this.postorderTraversal(node.right, result);
    result.push(node.value);
  }

  levelOrder(): T[] {
    if (!this.root) return [];
    const result: T[] = [];
    const queue: TreeNode<T>[] = [this.root];
    while (queue.length > 0) {
      const node = queue.shift()!;
      result.push(node.value);
      if (node.left) queue.push(node.left);
      if (node.right) queue.push(node.right);
    }
    return result;
  }

  protected getHeight(node: TreeNode<T> | null): number {
    if (!node) return 0;
    return 1 + Math.max(this.getHeight(node.left), this.getHeight(node.right));
  }

  isBalanced(): boolean {
    return this.checkBalanced(this.root) !== -1;
  }

  protected checkBalanced(node: TreeNode<T> | null): number {
    if (!node) return 0;
    const left = this.checkBalanced(node.left);
    if (left === -1) return -1;
    const right = this.checkBalanced(node.right);
    if (right === -1) return -1;
    if (Math.abs(left - right) > 1) return -1;
    return 1 + Math.max(left, right);
  }

  toArray(): T[] {
    return this.inorder();
  }

  fromArray(array: T[]): this {
    this.clear();
    for (const value of array) this.insert(value);
    return this;
  }

  clear(): void {
    this.root = null;
    this._size = 0;
  }

  clone(): BinarySearchTree<T> {
    const result = new BinarySearchTree<T>(this.compare);
    result._size = this._size;
    result.root = this.cloneNode(this.root);
    return result;
  }

  protected cloneNode(node: TreeNode<T> | null): TreeNode<T> | null {
    if (!node) return null;
    const newNode = new TreeNode(node.value);
    newNode.left = this.cloneNode(node.left);
    newNode.right = this.cloneNode(node.right);
    return newNode;
  }

  forEach(callback: (value: T) => void): void {
    this.inorder().forEach(callback);
  }

  map<U>(callback: (value: T) => U): BinarySearchTree<U> {
    const result = new BinarySearchTree<U>();
    this.forEach((value) => result.insert(callback(value)));
    return result;
  }

  filter(predicate: (value: T) => boolean): BinarySearchTree<T> {
    const result = new BinarySearchTree<T>(this.compare);
    this.forEach((value) => {
      if (predicate(value)) result.insert(value);
    });
    return result;
  }

  reduce<U>(callback: (acc: U, value: T) => U, initial: U): U {
    let acc = initial;
    this.forEach((value) => { acc = callback(acc, value); });
    return acc;
  }

  range(min: T, max: T): T[] {
    const result: T[] = [];
    this.rangeSearch(this.root, min, max, result);
    return result;
  }

  protected rangeSearch(node: TreeNode<T> | null, min: T, max: T, result: T[]): void {
    if (!node) return;
    if (this.compare(node.value, min) > 0) {
      this.rangeSearch(node.left, min, max, result);
    }
    if (this.compare(node.value, min) >= 0 && this.compare(node.value, max) <= 0) {
      result.push(node.value);
    }
    if (this.compare(node.value, max) < 0) {
      this.rangeSearch(node.right, min, max, result);
    }
  }

  predecessor(value: T): T | undefined {
    const node = this.findNode(value as any);
    if (!node) return undefined;
    if (node.left) return this.findMaxNode(node.left)?.value;
    let parent = node.parent;
    while (parent && node === parent.left) {
      node.parent = null;
      parent = parent.parent;
    }
    return parent?.value;
  }

  successor(value: T): T | undefined {
    const node = this.findNode(value as any);
    if (!node) return undefined;
    if (node.right) return this.findMinNode(node.right)?.value;
    let parent = node.parent;
    while (parent && node === parent.right) {
      node.parent = null;
      parent = parent.parent;
    }
    return parent?.value;
  }

  rank(value: T): number {
    return this.rankSearch(this.root, value);
  }

  protected rankSearch(node: TreeNode<T> | null, value: T): number {
    if (!node) return 0;
    if (this.compare(value, node.value) <= 0) {
      return this.rankSearch(node.left, value);
    }
    return this.getSize(node.left) + 1 + this.rankSearch(node.right, value);
  }

  protected getSize(node: TreeNode<T> | null): number {
    if (!node) return 0;
    return 1 + this.getSize(node.left) + this.getSize(node.right);
  }

  kthSmallest(k: number): T | undefined {
    if (k < 1 || k > this._size) return undefined;
    let count = 0;
    return this.kthSmallestSearch(this.root, k, count)?.value;
  }

  protected kthSmallestSearch(node: TreeNode<T> | null, k: number, count: number): TreeNode<T> | null {
    if (!node) return null;
    const left = this.kthSmallestSearch(node.left, k, count);
    if (left) return left;
    count++;
    if (count === k) return node;
    return this.kthSmallestSearch(node.right, k, count);
  }

  kthLargest(k: number): T | undefined {
    if (k < 1 || k > this._size) return undefined;
    return this.kthSmallest(this._size - k + 1);
  }

  ceil(value: T): T | undefined {
    let result: T | undefined;
    let node = this.root;
    while (node) {
      if (this.compare(node.value, value) === 0) return node.value;
      if (this.compare(node.value, value) > 0) {
        result = node.value;
        node = node.left;
      } else {
        node = node.right;
      }
    }
    return result;
  }

  floor(value: T): T | undefined {
    let result: T | undefined;
    let node = this.root;
    while (node) {
      if (this.compare(node.value, value) === 0) return node.value;
      if (this.compare(node.value, value) < 0) {
        result = node.value;
        node = node.right;
      } else {
        node = node.left;
      }
    }
    return result;
  }

  lowerBound(value: T): T | undefined {
    return this.ceil(value);
  }

  upperBound(value: T): T | undefined {
    let result: T | undefined;
    let node = this.root;
    while (node) {
      if (this.compare(node.value, value) > 0) {
        result = node.value;
        node = node.left;
      } else {
        node = node.right;
      }
    }
    return result;
  }

  [Symbol.iterator](): Iterator<T> {
    const items = this.inorder();
    let index = 0;
    return {
      next: (): IteratorResult<T> => {
        if (index < items.length) {
          return { done: false, value: items[index++] };
        }
        return { done: true, value: undefined as unknown as T };
      },
    };
  }

  toString(): string {
    return `BST(${this.size}): [${this.inorder().join(", ")}]`;
  }

  toJSON(): T[] {
    return this.toArray();
  }
}

export class AVLTree<T> extends BinarySearchTree<T> {
  protected insertNode(node: TreeNode<T> | null, value: T): TreeNode<T> {
    if (!node) return new TreeNode(value);
    const cmp = this.compare(value, node.value);
    if (cmp < 0) {
      node.left = this.insertNode(node.left, value);
      node.left.parent = node;
    } else if (cmp > 0) {
      node.right = this.insertNode(node.right, value);
      node.right.parent = node;
    } else {
      return node;
    }
    node.height = 1 + Math.max(this.getNodeHeight(node.left), this.getNodeHeight(node.right));
    const balance = this.getBalance(node);
    if (balance > 1 && this.compare(value, node.left!.value) < 0) {
      return this.rotateRight(node);
    }
    if (balance < -1 && this.compare(value, node.right!.value) > 0) {
      return this.rotateLeft(node);
    }
    if (balance > 1 && this.compare(value, node.left!.value) > 0) {
      node.left = this.rotateLeft(node.left!);
      return this.rotateRight(node);
    }
    if (balance < -1 && this.compare(value, node.right!.value) < 0) {
      node.right = this.rotateRight(node.right!);
      return this.rotateLeft(node);
    }
    return node;
  }

  protected removeNode(node: TreeNode<T> | null, value: T): TreeNode<T> | null {
    if (!node) return null;
    const cmp = this.compare(value, node.value);
    if (cmp < 0) {
      node.left = this.removeNode(node.left, value);
    } else if (cmp > 0) {
      node.right = this.removeNode(node.right, value);
    } else {
      if (!node.left || !node.right) {
        node = node.left ?? node.right;
      } else {
        const minNode = this.findMinNode(node.right)!;
        node.value = minNode.value;
        node.right = this.removeNode(node.right, minNode.value);
      }
    }
    if (!node) return null;
    node.height = 1 + Math.max(this.getNodeHeight(node.left), this.getNodeHeight(node.right));
    const balance = this.getBalance(node);
    if (balance > 1 && this.getBalance(node.left) >= 0) {
      return this.rotateRight(node);
    }
    if (balance > 1 && this.getBalance(node.left) < 0) {
      node.left = this.rotateLeft(node.left!);
      return this.rotateRight(node);
    }
    if (balance < -1 && this.getBalance(node.right) <= 0) {
      return this.rotateLeft(node);
    }
    if (balance < -1 && this.getBalance(node.right) > 0) {
      node.right = this.rotateRight(node.right!);
      return this.rotateLeft(node);
    }
    return node;
  }

  protected getNodeHeight(node: TreeNode<T> | null): number {
    return node ? node.height : 0;
  }

  protected getBalance(node: TreeNode<T> | null): number {
    return node ? this.getNodeHeight(node.left) - this.getNodeHeight(node.right) : 0;
  }

  protected rotateRight(y: TreeNode<T>): TreeNode<T> {
    const x = y.left!;
    const T2 = x.right;
    x.right = y;
    y.left = T2;
    y.height = 1 + Math.max(this.getNodeHeight(y.left), this.getNodeHeight(y.right));
    x.height = 1 + Math.max(this.getNodeHeight(x.left), this.getNodeHeight(x.right));
    return x;
  }

  protected rotateLeft(x: TreeNode<T>): TreeNode<T> {
    const y = x.right!;
    const T2 = y.left;
    y.left = x;
    x.right = T2;
    x.height = 1 + Math.max(this.getNodeHeight(x.left), this.getNodeHeight(x.right));
    y.height = 1 + Math.max(this.getNodeHeight(y.left), this.getNodeHeight(y.right));
    return y;
  }

  isBalanced(): boolean {
    return true;
  }
}

export class RedBlackTree<T> extends BinarySearchTree<T> {
  protected insertNode(node: TreeNode<T> | null, value: T): TreeNode<T> {
    if (!node) return new TreeNode(value, null, null, null, 1, "red");
    const cmp = this.compare(value, node.value);
    if (cmp < 0) {
      node.left = this.insertNode(node.left, value);
      node.left.parent = node;
    } else if (cmp > 0) {
      node.right = this.insertNode(node.right, value);
      node.right.parent = node;
    }
    this.fixInsert(node);
    return node;
  }

  protected fixInsert(node: TreeNode<T>): void {
    while (node.parent && node.parent.color === "red") {
      const grandparent = node.parent.parent;
      if (!grandparent) break;
      if (node.parent === grandparent.left) {
        const uncle = grandparent.right;
        if (uncle && uncle.color === "red") {
          node.parent.color = "black";
          uncle.color = "black";
          grandparent.color = "red";
          node = grandparent;
        } else {
          if (node === node.parent.right) {
            node = node.parent;
            this.rotateLeftNode(node);
          }
          node.parent!.color = "black";
          grandparent.color = "red";
          this.rotateRightNode(grandparent);
        }
      } else {
        const uncle = grandparent.left;
        if (uncle && uncle.color === "red") {
          node.parent!.color = "black";
          uncle.color = "black";
          grandparent.color = "red";
          node = grandparent;
        } else {
          if (node === node.parent!.left) {
            node = node.parent!;
            this.rotateRightNode(node);
          }
          node.parent!.color = "black";
          grandparent.color = "red";
          this.rotateLeftNode(grandparent);
        }
      }
    }
    if (this.root) this.root.color = "black";
  }

  protected rotateLeftNode(node: TreeNode<T>): void {
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

  protected rotateRightNode(node: TreeNode<T>): void {
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
}

export function createBST<T>(compareFn?: (a: T, b: T) => number): BinarySearchTree<T> {
  return new BinarySearchTree<T>(compareFn);
}

export function createAVLTree<T>(compareFn?: (a: T, b: T) => number): AVLTree<T> {
  return new AVLTree<T>(compareFn);
}

export function createRedBlackTree<T>(compareFn?: (a: T, b: T) => number): RedBlackTree<T> {
  return new RedBlackTree<T>(compareFn);
}
