/** AST metrics utilities -- count nodes, measure depth, compute sizes. */

import type { ASTNode } from "../../ast/nodes";
import { traverse } from "./traverse";

const CHILD_KEYS = ["body", "children", "elseBody", "directives", "props"];

export function countNodes(node: ASTNode, predicate?: (node: ASTNode) => boolean): number {
  let count = 0;
  traverse(node, (n) => {
    if (!predicate || predicate(n)) {
      count++;
    }
  });
  return count;
}

export function countByType(node: ASTNode): Record<string, number> {
  const counts: Record<string, number> = {};
  traverse(node, (n) => {
    counts[n.type] = (counts[n.type] ?? 0) + 1;
  });
  return counts;
}

export function maxDepth(node: ASTNode): number {
  let depth = 0;

  function visit(current: ASTNode, currentDepth: number): void {
    depth = Math.max(depth, currentDepth);

    for (const key of CHILD_KEYS) {
      const children = (current as any)[key];
      if (!Array.isArray(children)) continue;

      for (const child of children) {
        if (child && typeof child.type === "string") {
          visit(child, currentDepth + 1);
        }
      }
    }
  }

  visit(node, 1);
  return depth;
}

export function getDepth(node: ASTNode): number {
  return maxDepth(node);
}

export function estimateSize(node: ASTNode): number {
  return JSON.stringify(node).length;
}

export interface TreeStats {
  totalNodes: number;
  maxDepth: number;
  byType: Record<string, number>;
  estimatedBytes: number;
  elementCount: number;
  textCount: number;
  componentCount: number;
}

export function getStats(node: ASTNode): TreeStats {
  const byType = countByType(node);
  return {
    totalNodes: Object.values(byType).reduce((a, b) => a + b, 0),
    maxDepth: maxDepth(node),
    byType,
    estimatedBytes: estimateSize(node),
    elementCount: byType["Element"] ?? 0,
    textCount: byType["Text"] ?? 0,
    componentCount: byType["Component"] ?? 0,
  };
}
