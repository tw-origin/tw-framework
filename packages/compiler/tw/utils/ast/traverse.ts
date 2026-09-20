/** AST traversal utilities. */

import type { ASTNode } from "../../ast/nodes";

export type NodeVisitor = (node: ASTNode, parent: ASTNode | null, key: string | null, index: number | null) => void;

const CHILD_KEYS = ["body", "children", "elseBody", "directives", "props", "cases", "declarations", "slots"];

export function traverse(node: ASTNode, visitor: NodeVisitor): void {
  function visit(current: ASTNode, parent: ASTNode | null, key: string | null, index: number | null): void {
    visitor(current, parent, key, index);

    for (const childKey of CHILD_KEYS) {
      const children = (current as any)[childKey];
      if (!Array.isArray(children)) continue;

      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child && typeof child === "object" && typeof child.type === "string") {
          visit(child, current, childKey, i);
        }
      }
    }
  }

  visit(node, null, null, null);
}

export function findFirst(node: ASTNode, predicate: (node: ASTNode) => boolean): ASTNode | null {
  let result: ASTNode | null = null;
  traverse(node, (n) => {
    if (result === null && predicate(n)) {
      result = n;
    }
  });
  return result;
}

export function findAll(node: ASTNode, predicate: (node: ASTNode) => boolean): ASTNode[] {
  const results: ASTNode[] = [];
  traverse(node, (n) => {
    if (predicate(n)) results.push(n);
  });
  return results;
}

export function forEach(node: ASTNode, fn: (node: ASTNode) => void): void {
  traverse(node, (n) => fn(n));
}
