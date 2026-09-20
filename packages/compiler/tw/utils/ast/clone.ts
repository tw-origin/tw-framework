/** AST cloning utilities. */

import type { ASTNode } from "../../ast/nodes";

export function deepClone<T>(obj: T): T {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(obj);
    } catch {
      // Fall through to JSON clone
    }
  }
  try { return JSON.parse(JSON.stringify(obj)); } catch { return obj; }
}

export function shallowClone<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return [...obj] as unknown as T;
  }
  if (obj && typeof obj === "object") {
    return { ...obj };
  }
  return obj;
}

export function cloneNode<T extends ASTNode>(node: T): T {
  return deepClone(node);
}

export function cloneWithOverrides<T extends ASTNode>(node: T, overrides: Partial<T>): T {
  const cloned = deepClone(node);
  return Object.assign(cloned, overrides);
}
