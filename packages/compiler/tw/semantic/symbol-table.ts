/** Symbol table -- tracks all declared symbols and references. */

import type { ASTNode } from "../ast/nodes";
import type { Scope } from "./scope";
import { getAllBindings } from "./scope";

export type SymbolKind = "variable" | "component" | "function" | "directive" | "import" | "param" | "slot" | "state";

export interface SymbolEntry {
  name: string;
  kind: SymbolKind;
  type: string;
  scope: Scope;
  node: ASTNode | null;
  references: Reference[];
  isExported: boolean;
  isImported: boolean;
  isUsed: boolean;
}

export interface Reference {
  node: ASTNode;
  scope: Scope;
  kind: "read" | "write" | "call";
  line: number;
  col: number;
}

export class SymbolTable {
  private symbols = new Map<string, SymbolEntry>();
  private allRefs: Reference[] = [];

  constructor(private rootScope: Scope) {}

  declare(name: string, kind: SymbolKind, type: string, node: ASTNode | null, scope: Scope, isExported = false, isImported = false): SymbolEntry {
    const ex = this.symbols.get(name);
    if (ex) return ex;
    const sym: SymbolEntry = { name, kind, type, scope, node, references: [], isExported, isImported, isUsed: false };
    this.symbols.set(name, sym);
    return sym;
  }

  lookup(name: string): SymbolEntry | null {
    return this.symbols.get(name) ?? null;
  }

  addReference(name: string, ref: Reference): void {
    const sym = this.symbols.get(name);
    if (sym) {
      sym.references.push(ref);
      sym.isUsed = true;
      this.allRefs.push(ref);
    }
  }

  getAll(): SymbolEntry[] { return [...this.symbols.values()]; }
  getUnused(): SymbolEntry[] { return this.getAll().filter(s => !s.isUsed); }
  getExported(): SymbolEntry[] { return this.getAll().filter(s => s.isExported); }
  getImported(): SymbolEntry[] { return this.getAll().filter(s => s.isImported); }
  getByKind(kind: SymbolKind): SymbolEntry[] { return this.getAll().filter(s => s.kind === kind); }
  size(): number { return this.symbols.size; }
  has(name: string): boolean { return this.symbols.has(name); }

  toJSON(): any {
    return {
      symbols: this.getAll().map(s => ({
        name: s.name, kind: s.kind, type: s.type,
        isUsed: s.isUsed, isExported: s.isExported, refs: s.references.length,
      })),
      totalRefs: this.allRefs.length,
    };
  }
}

export function buildSymbolTable(scope: Scope): SymbolTable {
  const table = new SymbolTable(scope);
  for (const b of getAllBindings(scope)) {
    table.declare(b.name, b.kind as SymbolKind, b.type, b.node, b.scope, b.isExported, b.isImported);
  }
  return table;
}
