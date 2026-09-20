/**
 * AST Visitor pattern -- enter/exit callbacks, skip, replace, async visitors.
 * Supports traversing, modifying, and analyzing AST trees.
 */

import type { ASTNode } from "../nodes";

function deepClone<T>(obj: T): T {
  if (typeof structuredClone !== "undefined") {
    try { return structuredClone(obj); }
    catch { /* fall through */ }
  }
  try { return JSON.parse(JSON.stringify(obj)); }
  catch { return obj; }
}

export type VisitorAction = "continue" | "skip" | "stop" | "replace" | "remove";

export interface VisitorContext {
  parent: ASTNode | null;
  parentKey: string | null;
  parentArray: ASTNode[] | null;
  indexInArray: number;
  depth: number;
  path: string;
}

export interface VisitorResult {
  action: VisitorAction;
  replacement?: ASTNode | ASTNode[] | null;
}

export type SyncVisitor = (node: ASTNode, ctx: VisitorContext) => VisitorResult | void | ASTNode | null | "stop" | "skip" | "remove";
export type AsyncVisitor = (node: ASTNode, ctx: VisitorContext) => Promise<VisitorResult | void | ASTNode | null | "stop" | "skip" | "remove">;

export interface VisitorOptions {
  enter?: SyncVisitor;
  exit?: SyncVisitor;
  skipProperties?: string[];
  maxDepth?: number;
  allowMutations?: boolean;
}

export interface AsyncVisitorOptions {
  enter?: AsyncVisitor;
  exit?: AsyncVisitor;
  skipProperties?: string[];
  maxDepth?: number;
  allowMutations?: boolean;
}

// --- Sync Visitor -------------------------------------------------------------

export function walk(node: ASTNode, options: VisitorOptions): void {
  const skipProperties = new Set(options.skipProperties ?? ["sourceLoc", "leadingComments", "trailingComments", "raw", "source", "comments", "errors", "filePath", "line", "col", "endLine", "endCol", "type"]);
  const maxDepth = options.maxDepth ?? Infinity;

  function visitNode(
    current: ASTNode,
    parent: ASTNode | null,
    parentKey: string | null,
    parentArray: ASTNode[] | null,
    indexInArray: number,
    depth: number,
    path: string,
  ): VisitorAction {
    if (depth > maxDepth) return "continue";

    const ctx: VisitorContext = { parent, parentKey, parentArray, indexInArray, depth, path };

    // Enter
    if (options.enter) {
      const result = options.enter(current, ctx);
      if (result === "stop") return "stop";
      if (result === "skip") return "continue";
      if (result === "remove" || result === null) {
        if (parentArray && indexInArray >= 0) {
          parentArray[indexInArray] = { type: "REMOVED", line: 0, col: 0 } as any;
        }
        return "continue";
      }
      if (result && typeof result === "object" && "action" in (result as any)) {
        const vr = result as VisitorResult;
        if (vr.action === "stop") return "stop";
        if (vr.action === "skip") return "continue";
        if (vr.action === "replace" && vr.replacement) {
          if (parentArray && indexInArray >= 0) {
            if (Array.isArray(vr.replacement)) {
              parentArray.splice(indexInArray, 1, ...(vr.replacement as ASTNode[]));
            } else {
              parentArray[indexInArray] = vr.replacement as ASTNode;
            }
            current = (Array.isArray(vr.replacement) ? vr.replacement[0] : vr.replacement) as ASTNode;
          } else if (parent && parentKey) {
            (parent as any)[parentKey] = vr.replacement;
            current = vr.replacement as ASTNode;
          }
        }
      } else if (result && typeof result === "object" && (result as any).type) {
        // Direct node replacement
        if (parentArray && indexInArray >= 0) {
          parentArray[indexInArray] = result as ASTNode;
        } else if (parent && parentKey) {
          (parent as any)[parentKey] = result;
        }
        current = result as ASTNode;
      }
    }

    // Visit children
    const childKeys = getChildKeys(current);
    for (const key of childKeys) {
      if (skipProperties.has(key)) continue;
      const childVal = (current as any)[key];

      if (Array.isArray(childVal)) {
        for (let i = 0; i < childVal.length; i++) {
          const child = childVal[i];
          if (child && typeof child === "object" && typeof child.type === "string") {
            const action = visitNode(child, current, key, childVal, i, depth + 1, `${path}.${key}[${i}]`);
            if (action === "stop") return "stop";
          }
        }
        // Clean up removed nodes
        if (options.allowMutations) {
          (current as any)[key] = childVal.filter((n: any) => n && n.type !== "REMOVED");
        }
      } else if (childVal && typeof childVal === "object" && typeof childVal.type === "string") {
        const action = visitNode(childVal, current, key, null, -1, depth + 1, `${path}.${key}`);
        if (action === "stop") return "stop";
      }
    }

    // Exit
    if (options.exit) {
      const result = options.exit(current, ctx);
      if (result === "stop") return "stop";
    }

    return "continue";
  }

  visitNode(node, null, null, null, -1, 0, "root");
}

// --- Async Visitor ------------------------------------------------------------

export async function walkAsync(node: ASTNode, options: AsyncVisitorOptions): Promise<void> {
  const skipProperties = new Set(options.skipProperties ?? ["sourceLoc", "leadingComments", "trailingComments", "raw", "source", "comments", "errors", "filePath", "line", "col", "endLine", "endCol", "type"]);
  const maxDepth = options.maxDepth ?? Infinity;

  async function visitNode(
    current: ASTNode,
    parent: ASTNode | null,
    parentKey: string | null,
    parentArray: ASTNode[] | null,
    indexInArray: number,
    depth: number,
    path: string,
  ): Promise<VisitorAction> {
    if (depth > maxDepth) return "continue";

    const ctx: VisitorContext = { parent, parentKey, parentArray, indexInArray, depth, path };

    if (options.enter) {
      const result = await options.enter(current, ctx);
      if (result === "stop") return "stop";
      if (result === "skip") return "continue";
      if (result && typeof result === "object" && "action" in (result as any)) {
        const vr = result as VisitorResult;
        if (vr.action === "stop") return "stop";
        if (vr.action === "skip") return "continue";
      }
    }

    const childKeys = getChildKeys(current);
    for (const key of childKeys) {
      if (skipProperties.has(key)) continue;
      const childVal = (current as any)[key];

      if (Array.isArray(childVal)) {
        for (let i = 0; i < childVal.length; i++) {
          const child = childVal[i];
          if (child && typeof child === "object" && typeof child.type === "string") {
            const action = await visitNode(child, current, key, childVal, i, depth + 1, `${path}.${key}[${i}]`);
            if (action === "stop") return "stop";
          }
        }
      } else if (childVal && typeof childVal === "object" && typeof childVal.type === "string") {
        const action = await visitNode(childVal, current, key, null, -1, depth + 1, `${path}.${key}`);
        if (action === "stop") return "stop";
      }
    }

    if (options.exit) {
      const result = await options.exit(current, ctx);
      if (result === "stop") return "stop";
    }

    return "continue";
  }

  await visitNode(node, null, null, null, -1, 0, "root");
}

// --- Traversal Helpers ---------------------------------------------------------

function getChildKeys(node: ASTNode): string[] {
  const keys: string[] = [];
  const obj = node as any;

  for (const key of Object.keys(obj)) {
    if (key === "type" || key === "line" || key === "col" || key === "endLine" || key === "endCol" ||
        key === "sourceLoc" || key === "leadingComments" || key === "trailingComments" ||
        key === "raw" || key === "source" || key === "comments" || key === "errors" ||
        key === "filePath") {
      continue;
    }

    const val = obj[key];
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object" && val[0]?.type) {
      keys.push(key);
    } else if (val && typeof val === "object" && typeof val.type === "string") {
      keys.push(key);
    }
  }

  return keys;
}

// --- Node Visitor Class -------------------------------------------------------

export class NodeVisitor {
  private visitors: Map<string, { enter?: SyncVisitor; exit?: SyncVisitor }> = new Map();
  private defaultEnter?: SyncVisitor;
  private defaultExit?: SyncVisitor;

  on(nodeType: string, enter?: SyncVisitor, exit?: SyncVisitor): this {
    this.visitors.set(nodeType, { enter, exit });
    return this;
  }

  default(enter?: SyncVisitor, exit?: SyncVisitor): this {
    this.defaultEnter = enter;
    this.defaultExit = exit;
    return this;
  }

  visit(root: ASTNode): void {
    const self = this;

    walk(root, {
      enter(node, ctx) {
        const visitor = self.visitors.get(node.type);
        if (visitor?.enter) {
          return visitor.enter(node, ctx);
        }
        if (self.defaultEnter) {
          return self.defaultEnter(node, ctx);
        }
      },
      exit(node, ctx) {
        const visitor = self.visitors.get(node.type);
        if (visitor?.exit) {
          return visitor.exit(node, ctx);
        }
        if (self.defaultExit) {
          return self.defaultExit(node, ctx);
        }
      },
    });
  }

  async visitAsync(root: ASTNode): Promise<void> {
    const self = this;

    await walkAsync(root, {
      async enter(node, ctx) {
        const visitor = self.visitors.get(node.type);
        if (visitor?.enter) {
          return await visitor.enter(node, ctx);
        }
        if (self.defaultEnter) {
          return await self.defaultEnter(node, ctx);
        }
      },
      async exit(node, ctx) {
        const visitor = self.visitors.get(node.type);
        if (visitor?.exit) {
          return await visitor.exit(node, ctx);
        }
        if (self.defaultExit) {
          return await self.defaultExit(node, ctx);
        }
      },
    });
  }
}

// --- Transform Visitor ---------------------------------------------------------

export class TransformVisitor {
  private transforms: Array<(node: ASTNode, ctx: VisitorContext) => ASTNode | null> = [];

  add(fn: (node: ASTNode, ctx: VisitorContext) => ASTNode | null): this {
    this.transforms.push(fn);
    return this;
  }

  transform(root: ASTNode): ASTNode {
    const self = this;
    const result = deepClone(root);

    walk(result, {
      enter(node, ctx) {
        let current = node;
        for (const transform of self.transforms) {
          const transformed = transform(current, ctx);
          if (transformed === null) return "remove";
          if (transformed) current = transformed;
        }
        if (current !== node) {
          // Replace
          if (ctx.parentArray && ctx.indexInArray >= 0) {
            ctx.parentArray[ctx.indexInArray] = current;
          } else if (ctx.parent && ctx.parentKey) {
            (ctx.parent as any)[ctx.parentKey] = current;
          }
        }
      },
    });

    return result;
  }
}

// --- Specific Visitors ---------------------------------------------------------

export function forEachNode(root: ASTNode, callback: (node: ASTNode, ctx: VisitorContext) => void): void {
  walk(root, {
    enter(node, ctx) {
      callback(node, ctx);
    },
  });
}

export function findNode<T extends ASTNode>(root: ASTNode, predicate: (node: ASTNode) => node is T): T | null {
  let found: T | null = null;
  walk(root, {
    enter(node) {
      if (predicate(node)) {
        found = node as T;
        return "stop";
      }
    },
  });
  return found;
}

export function findNodes<T extends ASTNode>(root: ASTNode, predicate: (node: ASTNode) => node is T): T[] {
  const results: T[] = [];
  walk(root, {
    enter(node) {
      if (predicate(node)) {
        results.push(node as T);
      }
    },
  });
  return results;
}

export function someNode(root: ASTNode, predicate: (node: ASTNode) => boolean): boolean {
  let found = false;
  walk(root, {
    enter(node) {
      if (predicate(node)) {
        found = true;
        return "stop";
      }
    },
  });
  return found;
}

export function everyNode(root: ASTNode, predicate: (node: ASTNode) => boolean): boolean {
  let all = true;
  walk(root, {
    enter(node) {
      if (!predicate(node)) {
        all = false;
        return "stop";
      }
    },
  });
  return all;
}

export function countNodes(root: ASTNode, predicate?: (node: ASTNode) => boolean): number {
  let count = 0;
  walk(root, {
    enter(node) {
      if (!predicate || predicate(node)) {
        count++;
      }
    },
  });
  return count;
}

export function getDepth(node: ASTNode): number {
  let maxDepth = 0;
  walk(node, {
    enter(_, ctx) {
      maxDepth = Math.max(maxDepth, ctx.depth);
    },
  });
  return maxDepth;
}

export function getPath(root: ASTNode, target: ASTNode): string | null {
  let targetPath: string | null = null;
  walk(root, {
    enter(node, ctx) {
      if (node === target) {
        targetPath = ctx.path;
        return "stop";
      }
    },
  });
  return targetPath;
}
