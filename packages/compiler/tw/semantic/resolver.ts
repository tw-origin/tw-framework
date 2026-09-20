/** Reference resolver -- resolves identifiers to their declarations. */

import { ASTNode, Program, ElementNode } from "../ast/nodes";
import { isText, isElement } from "../ast/nodes";
import { buildScopeTree, lookup, type Scope } from "./scope";
import { buildSymbolTable, type SymbolTable, type Reference } from "./symbol-table";

export interface ResolvedReference {
  name: string;
  resolved: boolean;
  bindingKind: string | null;
  type: string;
  node: ASTNode;
  line: number;
  col: number;
}

export interface ResolutionResult {
  resolved: ResolvedReference[];
  unresolved: ResolvedReference[];
  scope: Scope;
  symbolTable: SymbolTable;
}

export function resolveReferences(program: Program): ResolutionResult {
  const scope = buildScopeTree(program);
  const symbolTable = buildSymbolTable(scope);
  const resolved: ResolvedReference[] = [];
  const unresolved: ResolvedReference[] = [];

  function visit(node: ASTNode, currentScope: Scope): void {
    if (!node) return;

    if (isText(node) && node.isInterpolated) {
      const refs = extractIdentifiers(node.value);
      for (const name of refs) {
        const binding = lookup(currentScope, name);
        if (binding) {
          symbolTable.addReference(name, {
            node, scope: currentScope, kind: "read",
            line: node.line, col: node.col,
          });
          resolved.push({
            name, resolved: true, bindingKind: binding.kind,
            type: binding.type, node, line: node.line, col: node.col,
          });
        } else if (!isLiteral(name)) {
          unresolved.push({
            name, resolved: false, bindingKind: null,
            type: "any", node, line: node.line, col: node.col,
          });
        }
      }
    }

    if (isElement(node)) {
      const el = node as ElementNode;
      for (const attr of el.attrs) {
        if (attr.isInterpolated && typeof attr.value === "string") {
          const refs = extractIdentifiers(attr.value);
          for (const name of refs) {
            const binding = lookup(currentScope, name);
            if (binding) {
              symbolTable.addReference(name, {
                node: el, scope: currentScope, kind: "read",
                line: attr.line, col: attr.col,
              });
              resolved.push({
                name, resolved: true, bindingKind: binding.kind,
                type: binding.type, node: el, line: attr.line, col: attr.col,
              });
            } else if (!isLiteral(name)) {
              unresolved.push({
                name, resolved: false, bindingKind: null,
                type: "any", node: el, line: attr.line, col: attr.col,
              });
            }
          }
        }
      }

      for (const binding of el.bindings) {
        const refs = extractIdentifiers(binding.expression);
        for (const name of refs) {
          const b = lookup(currentScope, name);
          if (b) {
            symbolTable.addReference(name, {
              node: el, scope: currentScope, kind: "read",
              line: binding.line, col: binding.col,
            });
          } else if (!isLiteral(name)) {
            unresolved.push({
              name, resolved: false, bindingKind: null,
              type: "any", node: el, line: binding.line, col: binding.col,
            });
          }
        }
      }

      for (const child of el.children) {
        visit(child, currentScope);
      }
    }

    const childKeys = ["body", "children", "elseBody"];
    for (const key of childKeys) {
      const arr = (node as any)[key];
      if (Array.isArray(arr)) {
        for (const child of arr) {
          if (child && typeof child.type === "string") visit(child, currentScope);
        }
      }
    }
  }

  for (const node of program.body) visit(node, scope);

  return { resolved, unresolved, scope, symbolTable };
}

function extractIdentifiers(expr: string): string[] {
  const ids = new Set<string>();
  let i = 0;
  while (i < expr.length) {
    if (/[a-zA-Z_$]/.test(expr[i])) {
      let id = "";
      while (i < expr.length && /[a-zA-Z0-9_$]/.test(expr[i])) {
        id += expr[i];
        i++;
      }
      if (!isLiteral(id)) ids.add(id);
    } else {
      i++;
    }
  }
  return [...ids];
}

function isLiteral(name: string): boolean {
  return name === "true" || name === "false" || name === "null" ||
    name === "undefined" || name === "NaN" || name === "Infinity" ||
    /^-?\d+(\.\d+)?$/.test(name);
}
