/** AST mapping utilities -- transform nodes in-place. */

import type { ASTNode } from "../../ast/nodes";

function deepClone<T>(obj: T): T {
  if (typeof structuredClone !== "undefined") {
    try { return structuredClone(obj); }
    catch { /* fall through */ }
  }
  try { return JSON.parse(JSON.stringify(obj)); }
  catch { return obj; }
}



export type NodeMapper = (node: ASTNode) => ASTNode | null;

const CHILD_KEYS = ["body", "children", "elseBody", "directives", "props"];

export function mapNodes(node: ASTNode, mapper: NodeMapper): ASTNode | null {
  const mapped = mapper(node);
  if (mapped === null) return null;

  for (const key of CHILD_KEYS) {
    const children = (mapped as any)[key];
    if (!Array.isArray(children)) continue;

    const newChildren: ASTNode[] = [];
    for (const child of children) {
      if (child && typeof child.type === "string") {
        const result = mapNodes(child, mapper);
        if (result !== null) {
          newChildren.push(result);
        }
      } else {
        newChildren.push(child);
      }
    }
    (mapped as any)[key] = newChildren;
  }

  return mapped;
}

export function mapTree(node: ASTNode, mapper: (node: ASTNode) => ASTNode): ASTNode {
  const result = mapper(node);

  for (const key of CHILD_KEYS) {
    const children = (result as any)[key];
    if (!Array.isArray(children)) continue;

    const newChildren: ASTNode[] = [];
    for (const child of children) {
      if (child && typeof child.type === "string") {
        newChildren.push(mapTree(child, mapper));
      } else {
        newChildren.push(child);
      }
    }
    (result as any)[key] = newChildren;
  }

  return result;
}

export function filterNodes(node: ASTNode, predicate: (node: ASTNode) => boolean): ASTNode {
  const result = deepClone(node);

  function filter(current: ASTNode): void {
    for (const key of CHILD_KEYS) {
      const children = (current as any)[key];
      if (!Array.isArray(children)) continue;

      (current as any)[key] = children.filter((child: any) => {
        if (child && typeof child.type === "string") {
          return predicate(child);
        }
        return true;
      });

      for (const child of (current as any)[key]) {
        if (child && typeof child.type === "string") {
          filter(child);
        }
      }
    }
  }

  filter(result);
  return result;
}
