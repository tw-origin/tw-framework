/**
 * Function hoisting optimization pass -- moves function declarations up.
 * @module compiler/optimizer
 */

import type { ASTNode } from "../ast/nodes";

export interface HoistOptions {
  hoistFunctionDeclarations?: boolean;
  hoistVariableDeclarations?: boolean;
  hoistImports?: boolean;
  preserveOrder?: boolean;
  groupByType?: boolean;
}

const DEFAULT_OPTIONS: Required<HoistOptions> = {
  hoistFunctionDeclarations: true,
  hoistVariableDeclarations: false,
  hoistImports: true,
  preserveOrder: true,
  groupByType: true,
};

export interface HoistResult {
  hoisted: boolean;
  hoistedNodes: ASTNode[];
  remainingNodes: ASTNode[];
  reason: string;
}

export function hoistFunctions(nodes: ASTNode[], options: HoistOptions = {}): HoistResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const hoisted: ASTNode[] = [];
  const remaining: ASTNode[] = [];
  let didHoist = false;
  for (const node of nodes) {
    const nodeType = (node as unknown as { type?: string }).type;
    if (opts.hoistImports && nodeType === "ImportDeclaration") {
      hoisted.push(node);
      didHoist = true;
    } else if (opts.hoistFunctionDeclarations && nodeType === "FunctionDeclaration") {
      hoisted.push(node);
      didHoist = true;
    } else if (opts.hoistVariableDeclarations && nodeType === "VariableDeclaration") {
      hoisted.push(node);
      didHoist = true;
    } else {
      remaining.push(node);
    }
  }
  if (!didHoist) {
    return { hoisted: false, hoistedNodes: [], remainingNodes: nodes, reason: "Nothing to hoist" };
  }
  let result: ASTNode[];
  if (opts.groupByType) {
    const imports = hoisted.filter((n) => (n as unknown as { type?: string }).type === "ImportDeclaration");
    const functions = hoisted.filter((n) => (n as unknown as { type?: string }).type === "FunctionDeclaration");
    const variables = hoisted.filter((n) => (n as unknown as { type?: string }).type === "VariableDeclaration");
    result = [...imports, ...functions, ...variables];
  } else if (opts.preserveOrder) {
    result = [...hoisted];
  } else {
    result = [...hoisted].sort((a, b) => {
      const typeA = (a as unknown as { type?: string }).type ?? "";
      const typeB = (b as unknown as { type?: string }).type ?? "";
      return typeA.localeCompare(typeB);
    });
  }
  return {
    hoisted: true,
    hoistedNodes: result,
    remainingNodes: remaining,
    reason: `Hoisted ${hoisted.length} declarations`,
  };
}

export class FunctionHoister {
  private options: HoistOptions;
  private stats = { totalPasses: 0, totalHoisted: 0, totalRemaining: 0 };

  constructor(options: HoistOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  optimize(nodes: ASTNode[]): ASTNode[] {
    this.stats.totalPasses++;
    const result = hoistFunctions(nodes, this.options);
    if (result.hoisted) {
      this.stats.totalHoisted += result.hoistedNodes.length;
      this.stats.totalRemaining += result.remainingNodes.length;
      return [...result.hoistedNodes, ...result.remainingNodes];
    }
    this.stats.totalRemaining += nodes.length;
    return nodes;
  }

  getStats(): { totalPasses: number; totalHoisted: number; totalRemaining: number; hoistRate: number } {
    return {
      ...this.stats,
      hoistRate: this.stats.totalHoisted + this.stats.totalRemaining > 0
        ? this.stats.totalHoisted / (this.stats.totalHoisted + this.stats.totalRemaining)
        : 0,
    };
  }

  reset(): void {
    this.stats = { totalPasses: 0, totalHoisted: 0, totalRemaining: 0 };
  }

  setOptions(options: Partial<HoistOptions>): void {
    this.options = { ...this.options, ...options };
  }

  getOptions(): HoistOptions {
    return { ...this.options };
  }
}

export function createFunctionHoister(options?: HoistOptions): FunctionHoister {
  return new FunctionHoister(options);
}

export class HoistPass {
  private hoister: FunctionHoister;
  private visitedNodes: number = 0;
  private modifiedNodes: number = 0;

  constructor(options: HoistOptions = {}) {
    this.hoister = new FunctionHoister(options);
  }

  run(ast: ASTNode): ASTNode {
    this.visitedNodes = 0;
    this.modifiedNodes = 0;
    return this.visit(ast);
  }

  private visit(node: ASTNode): ASTNode {
    if (!node || typeof node !== "object") return node;
    this.visitedNodes++;
    const nodeType = (node as unknown as { type?: string }).type;
    if (nodeType === "Program" || nodeType === "BlockStatement") {
      const body = (node as unknown as { body?: ASTNode[] }).body;
      if (Array.isArray(body)) {
        const optimized = this.hoister.optimize(body);
        if (optimized !== body) {
          this.modifiedNodes++;
          (node as unknown as { body: ASTNode[] }).body = optimized;
        }
      }
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

  getStats(): { visitedNodes: number; modifiedNodes: number; modificationRate: number; hoistStats: ReturnType<FunctionHoister["getStats"]> } {
    return {
      visitedNodes: this.visitedNodes,
      modifiedNodes: this.modifiedNodes,
      modificationRate: this.visitedNodes > 0 ? this.modifiedNodes / this.visitedNodes : 0,
      hoistStats: this.hoister.getStats(),
    };
  }
}

export function createHoistPass(options?: HoistOptions): HoistPass {
  return new HoistPass(options);
}

export function shouldHoist(node: ASTNode, options: HoistOptions = {}): boolean {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const nodeType = (node as unknown as { type?: string }).type;
  if (opts.hoistFunctionDeclarations && nodeType === "FunctionDeclaration") return true;
  if (opts.hoistVariableDeclarations && nodeType === "VariableDeclaration") return true;
  if (opts.hoistImports && nodeType === "ImportDeclaration") return true;
  return false;
}

export function countHoistable(nodes: ASTNode[], options: HoistOptions = {}): number {
  return nodes.filter((node) => shouldHoist(node, options)).length;
}

export function getHoistableNodes(nodes: ASTNode[], options: HoistOptions = {}): ASTNode[] {
  return nodes.filter((node) => shouldHoist(node, options));
}

export function getNonHoistableNodes(nodes: ASTNode[], options: HoistOptions = {}): ASTNode[] {
  return nodes.filter((node) => !shouldHoist(node, options));
}

export function separateByType(nodes: ASTNode[]): { imports: ASTNode[]; functions: ASTNode[]; variables: ASTNode[]; others: ASTNode[] } {
  const imports: ASTNode[] = [];
  const functions: ASTNode[] = [];
  const variables: ASTNode[] = [];
  const others: ASTNode[] = [];
  for (const node of nodes) {
    const nodeType = (node as unknown as { type?: string }).type;
    if (nodeType === "ImportDeclaration") imports.push(node);
    else if (nodeType === "FunctionDeclaration") functions.push(node);
    else if (nodeType === "VariableDeclaration") variables.push(node);
    else others.push(node);
  }
  return { imports, functions, variables, others };
}

export function mergeHoisted(imports: ASTNode[], functions: ASTNode[], variables: ASTNode[], others: ASTNode[]): ASTNode[] {
  return [...imports, ...functions, ...variables, ...others];
}

export function hoistAndMerge(nodes: ASTNode[], options: HoistOptions = {}): ASTNode[] {
  const { imports, functions, variables, others } = separateByType(nodes);
  return mergeHoisted(imports, functions, variables, others);
}

export function isHoistable(node: ASTNode, options: HoistOptions = {}): boolean {
  return shouldHoist(node, options);
}

export function isFunctionDeclaration(node: ASTNode): boolean {
  return (node as unknown as { type?: string }).type === "FunctionDeclaration";
}

export function isVariableDeclaration(node: ASTNode): boolean {
  return (node as unknown as { type?: string }).type === "VariableDeclaration";
}

export function isImportDeclaration(node: ASTNode): boolean {
  return (node as unknown as { type?: string }).type === "ImportDeclaration";
}

export function isExportDeclaration(node: ASTNode): boolean {
  const nodeType = (node as unknown as { type?: string }).type;
  return nodeType === "ExportNamedDeclaration" || nodeType === "ExportDefaultDeclaration" || nodeType === "ExportAllDeclaration";
}

export function getHoistPriority(node: ASTNode): number {
  const nodeType = (node as unknown as { type?: string }).type;
  switch (nodeType) {
    case "ImportDeclaration": return 0;
    case "FunctionDeclaration": return 1;
    case "VariableDeclaration": return 2;
    case "ExportNamedDeclaration": return 3;
    case "ExportDefaultDeclaration": return 4;
    case "ExportAllDeclaration": return 5;
    default: return 99;
  }
}

export function sortByHoistPriority(nodes: ASTNode[]): ASTNode[] {
  return [...nodes].sort((a, b) => getHoistPriority(a) - getHoistPriority(b));
}

export function countByType(nodes: ASTNode[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const node of nodes) {
    const nodeType = (node as unknown as { type?: string }).type ?? "Unknown";
    counts[nodeType] = (counts[nodeType] ?? 0) + 1;
  }
  return counts;
}

export function getHoistStats(nodes: ASTNode[], options: HoistOptions = {}): {
  total: number;
  hoistable: number;
  nonHoistable: number;
  byType: Record<string, number>;
  hoistRate: number;
} {
  const hoistable = countHoistable(nodes, options);
  return {
    total: nodes.length,
    hoistable,
    nonHoistable: nodes.length - hoistable,
    byType: countByType(nodes),
    hoistRate: nodes.length > 0 ? hoistable / nodes.length : 0,
  };
}
