/**
 * Trie (prefix tree) implementation.
 * @module shared/data-structures
 */

export class TrieNode {
  children: Map<string, TrieNode> = new Map();
  isEnd: boolean = false;
  value: unknown = null;
  count: number = 0;

  constructor(public char: string = "") {}
}

export class Trie {
  private root: TrieNode;
  private _size: number = 0;

  constructor() {
    this.root = new TrieNode("");
  }

  get size(): number { return this._size; }
  get isEmpty(): boolean { return this._size === 0; }

  insert(word: string, value?: unknown): this {
    let node = this.root;
    for (const char of word) {
      if (!node.children.has(char)) {
        node.children.set(char, new TrieNode(char));
      }
      node = node.children.get(char)!;
      node.count++;
    }
    if (!node.isEnd) this._size++;
    node.isEnd = true;
    if (value !== undefined) node.value = value;
    return this;
  }

  contains(word: string): boolean {
    const node = this.findNode(word);
    return node?.isEnd ?? false;
  }

  find(word: string): unknown {
    return this.findNode(word)?.value;
  }

  remove(word: string): boolean {
    const nodes: TrieNode[] = [this.root];
    let node = this.root;
    for (const char of word) {
      if (!node.children.has(char)) return false;
      node = node.children.get(char)!;
      nodes.push(node);
    }
    if (!node.isEnd) return false;
    node.isEnd = false;
    node.value = null;
    this._size--;
    for (let i = nodes.length - 1; i > 0; i--) {
      const currentNode = nodes[i];
      const parent = nodes[i - 1];
      if (currentNode.children.size === 0 && !currentNode.isEnd) {
        parent.children.delete(currentNode.char);
      }
    }
    return true;
  }

  startsWith(prefix: string): boolean {
    return this.findNode(prefix) !== null;
  }

  autocomplete(prefix: string, maxResults: number = 10): string[] {
    const node = this.findNode(prefix);
    if (!node) return [];
    const results: string[] = [];
    this.collectWords(node, prefix, results, maxResults);
    return results;
  }

  private collectWords(node: TrieNode, prefix: string, results: string[], maxResults: number): void {
    if (results.length >= maxResults) return;
    if (node.isEnd) results.push(prefix);
    for (const [char, child] of node.children) {
      this.collectWords(child, prefix + char, results, maxResults);
      if (results.length >= maxResults) return;
    }
  }

  private findNode(prefix: string): TrieNode | null {
    let node = this.root;
    for (const char of prefix) {
      if (!node.children.has(char)) return null;
      node = node.children.get(char)!;
    }
    return node;
  }

  getAllWords(): string[] {
    const results: string[] = [];
    this.collectWords(this.root, "", results, Infinity);
    return results;
  }

  getWordsWithPrefix(prefix: string): string[] {
    return this.autocomplete(prefix, Infinity);
  }

  getLongestCommonPrefix(): string {
    let node = this.root;
    let prefix = "";
    while (node.children.size === 1 && !node.isEnd) {
      const [char, child] = [...node.children.entries()][0];
      prefix += char;
      node = child;
    }
    return prefix;
  }

  getShortestUniquePrefix(word: string): string {
    let node = this.root;
    let prefix = "";
    for (const char of word) {
      prefix += char;
      if (!node.children.has(char)) return prefix;
      node = node.children.get(char)!;
      if (node.count === 1) return prefix;
    }
    return word;
  }

  countWordsWithPrefix(prefix: string): number {
    const node = this.findNode(prefix);
    return node?.count ?? 0;
  }

  clear(): void {
    this.root = new TrieNode("");
    this._size = 0;
  }

  toArray(): string[] {
    return this.getAllWords();
  }

  fromArray(array: string[]): this {
    this.clear();
    for (const word of array) this.insert(word);
    return this;
  }

  forEach(callback: (word: string, value: unknown) => void): void {
    this.traverse(this.root, "", callback);
  }

  private traverse(node: TrieNode, prefix: string, callback: (word: string, value: unknown) => void): void {
    if (node.isEnd) callback(prefix, node.value);
    for (const [char, child] of node.children) {
      this.traverse(child, prefix + char, callback);
    }
  }

  toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    this.forEach((word, value) => {
      result[word] = value;
    });
    return result;
  }

  toString(): string {
    return `Trie(${this.size}): [${this.getAllWords().join(", ")}]`;
  }
}

export function createTrie(): Trie {
  return new Trie();
}

export function buildTrie(words: string[]): Trie {
  const trie = new Trie();
  for (const word of words) trie.insert(word);
  return trie;
}

export class RadixTree {
  private root: RadixNode;

  constructor() {
    this.root = new RadixNode("");
  }

  insert(word: string, value?: unknown): this {
    this.root.insert(word, value);
    return this;
  }

  contains(word: string): boolean {
    return this.root.find(word) !== null;
  }

  find(word: string): unknown {
    const node = this.root.find(word);
    return node?.value;
  }

  remove(word: string): boolean {
    return this.root.remove(word);
  }

  autocomplete(prefix: string, maxResults: number = 10): string[] {
    const results: string[] = [];
    const node = this.root.find(prefix);
    if (node) {
      node.collect(prefix, results, maxResults);
    }
    return results;
  }
}

class RadixNode {
  children: Map<string, RadixNode> = new Map();
  isEnd: boolean = false;
  value: unknown = null;

  constructor(public prefix: string) {}

  insert(word: string, value?: unknown): void {
    if (word.length === 0) {
      this.isEnd = true;
      if (value !== undefined) this.value = value;
      return;
    }
    for (const [edge, child] of this.children) {
      const common = this.commonPrefix(word, edge);
      if (common.length > 0) {
        if (common === edge) {
          child.insert(word.slice(common.length), value);
          return;
        }
        const newChild = new RadixNode(common);
        newChild.children.set(edge.slice(common.length), child);
        child.prefix = edge.slice(common.length);
        this.children.delete(edge);
        this.children.set(common, newChild);
        if (common === word) {
          newChild.isEnd = true;
          if (value !== undefined) newChild.value = value;
        } else {
          newChild.insert(word.slice(common.length), value);
        }
        return;
      }
    }
    const newChild = new RadixNode(word);
    newChild.isEnd = true;
    if (value !== undefined) newChild.value = value;
    this.children.set(word, newChild);
  }

  find(word: string): RadixNode | null {
    if (word.length === 0) {
      return this.isEnd ? this : null;
    }
    for (const [edge, child] of this.children) {
      if (word.startsWith(edge)) {
        return child.find(word.slice(edge.length));
      }
    }
    return null;
  }

  remove(word: string): boolean {
    if (word.length === 0) {
      if (!this.isEnd) return false;
      this.isEnd = false;
      this.value = null;
      return true;
    }
    for (const [edge, child] of this.children) {
      if (word.startsWith(edge)) {
        const removed = child.remove(word.slice(edge.length));
        if (removed && child.children.size === 0 && !child.isEnd) {
          this.children.delete(edge);
        }
        return removed;
      }
    }
    return false;
  }

  collect(prefix: string, results: string[], maxResults: number): void {
    if (results.length >= maxResults) return;
    if (this.isEnd) results.push(prefix);
    for (const [edge, child] of this.children) {
      child.collect(prefix + edge, results, maxResults);
      if (results.length >= maxResults) return;
    }
  }

  private commonPrefix(a: string, b: string): string {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return a.slice(0, i);
  }
}
