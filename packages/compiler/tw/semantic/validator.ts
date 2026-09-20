/** Semantic validator -- validates AST for semantic correctness. */

import { Program, ASTNode, ElementNode } from "../ast/nodes";
import { isElement, isComponent } from "../ast/nodes";
import { buildScopeTree, lookup, type Scope } from "./scope";
import { buildSymbolTable } from "./symbol-table";
import { resolveReferences } from "./resolver";

export interface SemanticError {
  message: string;
  line: number;
  col: number;
  code: string;
  severity: "error" | "warning" | "info";
  context?: string;
}

export function validate(program: Program): SemanticError[] {
  const errors: SemanticError[] = [];
  const scope = buildScopeTree(program);
  const symbolTable = buildSymbolTable(scope);
  const resolution = resolveReferences(program);

  // Check unresolved references
  for (const ref of resolution.unresolved) {
    errors.push({
      message: `Undefined variable: ${ref.name}`,
      line: ref.line, col: ref.col,
      code: "TW021", severity: "error",
      context: `Referenced in ${ref.node.type}`,
    });
  }

  // Check unused imports
  for (const sym of symbolTable.getImported()) {
    if (!sym.isUsed) {
      errors.push({
        message: `Unused import: ${sym.name}`,
        line: sym.node?.line ?? 0, col: sym.node?.col ?? 0,
        code: "TW025", severity: "info",
      });
    }
  }

  // Check unused state variables
  for (const sym of symbolTable.getByKind("state" as any)) {
    if (!sym.isUsed) {
      errors.push({
        message: `Unused state variable: ${sym.name}`,
        line: sym.node?.line ?? 0, col: sym.node?.col ?? 0,
        code: "TW026", severity: "info",
      });
    }
  }

  // Check duplicate component definitions
  const componentNames = new Set<string>();
  function walkForComponents(node: ASTNode): void {
    if (isComponent(node)) {
      if (componentNames.has(node.name)) {
        errors.push({
          message: `Duplicate component: ${node.name}`,
          line: node.line, col: node.col,
          code: "TW036", severity: "error",
        });
      }
      componentNames.add(node.name);
    }
    for (const key of ["body", "children", "elseBody"]) {
      const arr = (node as any)[key];
      if (Array.isArray(arr)) for (const c of arr) if (c?.type) walkForComponents(c);
    }
  }
  for (const n of program.body) walkForComponents(n);

  // Check for empty bindings
  function checkBindings(node: ASTNode, s: Scope): void {
    if (!node) return;
    if (isElement(node)) {
      const el = node as ElementNode;
      for (const b of el.bindings) {
        if (!b.expression || b.expression.trim() === "") {
          errors.push({
            message: `Empty binding expression for :${b.property}`,
            line: b.line, col: b.col,
            code: "TW032", severity: "error",
          });
        } else {
          // Check if binding references exist
          const refs = b.expression.match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g);
          if (refs) {
            for (const ref of refs) {
              if (!isLiteral(ref)) {
                const binding = lookup(s, ref);
                if (!binding) {
                  errors.push({
                    message: `Binding references undefined variable: ${ref}`,
                    line: b.line, col: b.col,
                    code: "TW021", severity: "error",
                  });
                }
              }
            }
          }
        }
      }
      for (const c of el.children) checkBindings(c, s);
    }
    for (const key of ["body", "children", "elseBody"]) {
      const arr = (node as any)[key];
      if (Array.isArray(arr)) for (const c of arr) if (c?.type) checkBindings(c, s);
    }
  }
  for (const n of program.body) checkBindings(n, scope);

  return errors;
}

function isLiteral(name: string): boolean {
  return name === "true" || name === "false" || name === "null" ||
    name === "undefined" || name === "NaN" || name === "Infinity" ||
    /^-?\d+(\.\d+)?$/.test(name);
}
