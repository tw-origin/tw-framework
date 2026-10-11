/**
 * Analysis of a raw TypeScript `server { }` body: the `import` statements it
 * contains and the names it declares at its top level.
 *
 * Uses the TypeScript parser (not a regex) so destructuring, renames and
 * defaults resolve correctly, and so names inside nested scopes (function
 * bodies, blocks, arrow bodies) are excluded.
 */

import * as ts from "typescript";
import type { ImportInfo } from "../ast/nodes";

export function analyzeServerBody(body: string): { imports: ImportInfo[]; declaredNames: string[] } {
  const imports: ImportInfo[] = [];
  const declaredNames: string[] = [];
  if (!body.trim()) return { imports, declaredNames };

  const sf = ts.createSourceFile("server.ts", body, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);

  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt)) {
      const spec = stmt.moduleSpecifier;
      imports.push({
        source: stmt.getText(sf),
        specifier: spec && ts.isStringLiteral(spec) ? spec.text : "",
      });
      continue;
    }
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) collectBindingNames(decl.name, declaredNames);
      continue;
    }
    if ((ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) && stmt.name) {
      declaredNames.push(stmt.name.text);
    }
  }

  return { imports, declaredNames };
}

/** Top-level binding names from a declaration name (destructuring, renames, defaults). */
function collectBindingNames(name: ts.BindingName, out: string[]): void {
  if (ts.isIdentifier(name)) { out.push(name.text); return; }
  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const el of name.elements) {
      if (ts.isBindingElement(el)) collectBindingNames(el.name, out);
    }
  }
}
