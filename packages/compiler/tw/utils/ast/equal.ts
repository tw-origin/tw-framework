/** AST equality checking utilities. */

import type { ASTNode } from "../../ast/nodes";

export function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object" || a === null || b === null) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!deepEqual(a[key], b[key])) return false;
  }

  return true;
}

export function shallowEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object" || a === null || b === null) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }

  return true;
}

export function nodesEqual(a: ASTNode, b: ASTNode): boolean {
  if (a.type !== b.type) return false;
  return deepEqual(a, b);
}

export function structureEqual(a: ASTNode, b: ASTNode): boolean {
  if (a.type !== b.type) return false;

  const aChildren = getChildren(a);
  const bChildren = getChildren(b);

  if (aChildren.length !== bChildren.length) return false;

  for (let i = 0; i < aChildren.length; i++) {
    if (!structureEqual(aChildren[i], bChildren[i])) return false;
  }

  return true;
}

function getChildren(node: ASTNode): ASTNode[] {
  const result: ASTNode[] = [];
  const childKeys = ["body", "children", "elseBody"];

  for (const key of childKeys) {
    const children = (node as any)[key];
    if (Array.isArray(children)) {
      for (const child of children) {
        if (child && typeof child.type === "string") {
          result.push(child);
        }
      }
    }
  }

  return result;
}
