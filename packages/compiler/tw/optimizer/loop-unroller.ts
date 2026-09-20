/**
 * Loop unrolling optimization pass -- unrolls for/while loops for performance.
 * @module compiler/optimizer
 */

import type { ASTNode } from "../ast/nodes";

export interface UnrollOptions {
  maxUnrollCount?: number;
  minIterations?: number;
  maxIterations?: number;
  allowPartial?: boolean;
  allowNested?: boolean;
}

const DEFAULT_OPTIONS: Required<UnrollOptions> = {
  maxUnrollCount: 32,
  minIterations: 2,
  maxIterations: 100,
  allowPartial: true,
  allowNested: false,
};

export interface UnrollResult {
  unrolled: boolean;
  originalNode: ASTNode;
  unrolledNodes: ASTNode[];
  iterationsUnrolled: number;
  reason: string;
}

export function canUnroll(node: ASTNode, options: UnrollOptions = {}): { canUnroll: boolean; iterations: number; reason: string } {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  if ((node as any).type !== "ForStatement" && (node as any).type !== "WhileStatement") {
    return { canUnroll: false, iterations: 0, reason: "Not a loop statement" };
  }
  if ((node as any).type === "ForStatement") {
    const forNode = node as unknown as {
      init?: { type: string; declarations?: Array<{ init?: { value?: number } }> };
      test?: { type: string; left?: { value?: number }; right?: { value?: number }; operator?: string };
      update?: { type: string; operator?: string; argument?: { value?: number } };
      body?: ASTNode;
    };
    if (!forNode.test) return { canUnroll: false, iterations: 0, reason: "No test condition" };
    if (forNode.test.type !== "BinaryExpression") return { canUnroll: false, iterations: 0, reason: "Complex test condition" };
    const left = forNode.test.left?.value;
    const right = forNode.test.right?.value;
    const operator = forNode.test.operator;
    if (left === undefined || right === undefined) return { canUnroll: false, iterations: 0, reason: "Non-constant bounds" };
    let iterations = 0;
    switch (operator) {
      case "<": iterations = right - left; break;
      case "<=": iterations = right - left + 1; break;
      case ">": iterations = left - right; break;
      case ">=": iterations = left - right + 1; break;
      default: return { canUnroll: false, iterations: 0, reason: "Unsupported operator" };
    }
    if (iterations < opts.minIterations) return { canUnroll: false, iterations: 0, reason: "Too few iterations" };
    if (iterations > opts.maxIterations) return { canUnroll: false, iterations: 0, reason: "Too many iterations" };
    if (iterations > opts.maxUnrollCount && !opts.allowPartial) return { canUnroll: false, iterations: 0, reason: "Exceeds max unroll count" };
    return { canUnroll: true, iterations: Math.min(iterations, opts.maxUnrollCount), reason: "OK" };
  }
  return { canUnroll: false, iterations: 0, reason: "While loops not supported" };
}

export function unrollLoop(node: ASTNode, options: UnrollOptions = {}): UnrollResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const unrollCheck = canUnroll(node, opts);
  const { iterations, reason } = unrollCheck;
  if (!unrollCheck.canUnroll) {
    return { unrolled: false, originalNode: node, unrolledNodes: [node], iterationsUnrolled: 0, reason };
  }
  const unrolledNodes: ASTNode[] = [];
  const body = (node as unknown as { body?: ASTNode }).body;
  if (!body) {
    return { unrolled: false, originalNode: node, unrolledNodes: [node], iterationsUnrolled: 0, reason: "No body" };
  }
  for (let i = 0; i < iterations; i++) {
    unrolledNodes.push(cloneNode(body));
  }
  return {
    unrolled: true,
    originalNode: node,
    unrolledNodes,
    iterationsUnrolled: iterations,
    reason: `Unrolled ${iterations} iterations`,
  };
}

function cloneNode(node: ASTNode): ASTNode {
  if (node === null || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(cloneNode) as unknown as ASTNode;
  const clone: Record<string, unknown> = {};
  for (const key of Object.keys(node)) {
    const value = (node as unknown as Record<string, unknown>)[key];
    clone[key] = typeof value === "object" && value !== null ? cloneNode(value as ASTNode) : value;
  }
  return clone as unknown as ASTNode;
}

export class LoopUnroller {
  private options: UnrollOptions;
  private stats = { totalLoops: 0, unrolledLoops: 0, totalIterations: 0, skippedLoops: 0 };

  constructor(options: UnrollOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  optimize(node: ASTNode): ASTNode {
    this.stats.totalLoops++;
    const result = unrollLoop(node, this.options);
    if (result.unrolled) {
      this.stats.unrolledLoops++;
      this.stats.totalIterations += result.iterationsUnrolled;
      return {
        type: "BlockStatement",
        body: result.unrolledNodes,
      } as unknown as ASTNode;
    }
    this.stats.skippedLoops++;
    return node;
  }

  optimizeAll(nodes: ASTNode[]): ASTNode[] {
    return nodes.map((node) => this.optimize(node));
  }

  getStats(): { totalLoops: number; unrolledLoops: number; totalIterations: number; skippedLoops: number; unrollRate: number } {
    return {
      ...this.stats,
      unrollRate: this.stats.totalLoops > 0 ? this.stats.unrolledLoops / this.stats.totalLoops : 0,
    };
  }

  reset(): void {
    this.stats = { totalLoops: 0, unrolledLoops: 0, totalIterations: 0, skippedLoops: 0 };
  }

  setOptions(options: Partial<UnrollOptions>): void {
    this.options = { ...this.options, ...options };
  }

  getOptions(): UnrollOptions {
    return { ...this.options };
  }
}

export function createLoopUnroller(options?: UnrollOptions): LoopUnroller {
  return new LoopUnroller(options);
}

export function shouldUnroll(node: ASTNode, options: UnrollOptions = {}): boolean {
  return canUnroll(node, options).canUnroll;
}

export function estimateUnrollBenefit(node: ASTNode, options: UnrollOptions = {}): { benefit: number; cost: number; netBenefit: number } {
  const unrollCheck = canUnroll(node, options);
  const { iterations } = unrollCheck;
  if (!unrollCheck.canUnroll) return { benefit: 0, cost: 0, netBenefit: 0 };
  const bodySize = estimateNodeSize((node as unknown as { body?: ASTNode }).body);
  const benefit = iterations * 0.1;
  const cost = iterations * bodySize * 0.01;
  return { benefit, cost, netBenefit: benefit - cost };
}

function estimateNodeSize(node: ASTNode | undefined): number {
  if (!node) return 0;
  if (typeof node !== "object") return 1;
  if (Array.isArray(node)) return node.reduce((sum, n) => sum + estimateNodeSize(n), 0);
  let size = 1;
  for (const key of Object.keys(node)) {
    const value = (node as unknown as Record<string, unknown>)[key];
    if (typeof value === "object" && value !== null) {
      size += estimateNodeSize(value as ASTNode);
    }
  }
  return size;
}

export function unrollFactor(node: ASTNode, options: UnrollOptions = {}): number {
  const unrollCheck = canUnroll(node, options);
  const { iterations } = unrollCheck;
  if (!unrollCheck.canUnroll) return 1;
  return Math.min(iterations, options.maxUnrollCount ?? 32);
}

export function isFullyUnrolled(node: ASTNode, options: UnrollOptions = {}): boolean {
  const unrollCheck = canUnroll(node, options);
  const { iterations } = unrollCheck;
  if (!unrollCheck.canUnroll) return false;
  return iterations <= (options.maxUnrollCount ?? 32);
}

export function isPartiallyUnrolled(node: ASTNode, options: UnrollOptions = {}): boolean {
  const unrollCheck = canUnroll(node, options);
  const { iterations } = unrollCheck;
  if (!unrollCheck.canUnroll) return false;
  return iterations > (options.maxUnrollCount ?? 32) && (options.allowPartial ?? true);
}

export function unrollWithRemainder(node: ASTNode, factor: number, options: UnrollOptions = {}): { unrolled: ASTNode[]; remainder: ASTNode | null } {
  const unrollCheck = canUnroll(node, options);
  const { iterations } = unrollCheck;
  if (!unrollCheck.canUnroll) return { unrolled: [node], remainder: null };
  const fullIterations = Math.floor(iterations / factor);
  const remainderIterations = iterations % factor;
  const unrolled: ASTNode[] = [];
  const body = (node as unknown as { body?: ASTNode }).body;
  for (let i = 0; i < fullIterations * factor; i++) {
    unrolled.push(cloneNode(body!));
  }
  let remainder: ASTNode | null = null;
  if (remainderIterations > 0) {
    remainder = {
      type: "ForStatement",
      init: { type: "Literal", value: fullIterations * factor },
      test: { type: "BinaryExpression", operator: "<", left: { type: "Identifier", name: "i" }, right: { type: "Literal", value: iterations } },
      update: { type: "UpdateExpression", operator: "++", argument: { type: "Identifier", name: "i" } },
      body,
    } as unknown as ASTNode;
  }
  return { unrolled, remainder };
}

export class UnrollPass {
  private unroller: LoopUnroller;
  private visitedNodes: number = 0;
  private modifiedNodes: number = 0;

  constructor(options: UnrollOptions = {}) {
    this.unroller = new LoopUnroller(options);
  }

  run(ast: ASTNode): ASTNode {
    this.visitedNodes = 0;
    this.modifiedNodes = 0;
    return this.visit(ast);
  }

  private visit(node: ASTNode): ASTNode {
    if (!node || typeof node !== "object") return node;
    this.visitedNodes++;
    if ((node as any).type === "ForStatement" || (node as any).type === "WhileStatement") {
      const optimized = this.unroller.optimize(node);
      if (optimized !== node) {
        this.modifiedNodes++;
      }
      return optimized;
    }
    for (const key of Object.keys(node)) {
      const value = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        (node as unknown as Record<string, unknown>)[key] = value.map((item) => this.visit(item as ASTNode));
      } else if (typeof value === "object" && value !== null) {
        (node as unknown as Record<string, unknown>)[key] = this.visit(value as ASTNode);
      }
    }
    return node;
  }

  getStats(): { visitedNodes: number; modifiedNodes: number; modificationRate: number; unrollStats: ReturnType<LoopUnroller["getStats"]> } {
    return {
      visitedNodes: this.visitedNodes,
      modifiedNodes: this.modifiedNodes,
      modificationRate: this.visitedNodes > 0 ? this.modifiedNodes / this.visitedNodes : 0,
      unrollStats: this.unroller.getStats(),
    };
  }
}

export function createUnrollPass(options?: UnrollOptions): UnrollPass {
  return new UnrollPass(options);
}
