/** Scope tracking -- lexical scopes for variables, components, directives. */

import type { ASTNode, Program, ElementNode, ComponentNode } from "../ast/nodes";

export type ScopeKind = "global" | "module" | "component" | "block" | "function";

export interface Scope {
  kind: ScopeKind;
  name: string;
  parent: Scope | null;
  bindings: Map<string, Binding>;
  children: Scope[];
  node: ASTNode | null;
}

export interface Binding {
  name: string;
  kind: "variable" | "component" | "function" | "param" | "import" | "directive" | "slot";
  type: string;
  scope: Scope;
  node: ASTNode | null;
  isExported: boolean;
  isImported: boolean;
  isMutable: boolean;
  initialized: boolean;
}

export function createScope(kind: ScopeKind, name: string, parent: Scope | null = null, node: ASTNode | null = null): Scope {
  return { kind, name, parent, bindings: new Map(), children: [], node };
}

export function createGlobalScope(): Scope {
  return createScope("global", "global");
}

export function addBinding(scope: Scope, binding: Omit<Binding, "scope">): Binding {
  const full: Binding = { ...binding, scope };
  scope.bindings.set(binding.name, full);
  return full;
}

export function lookup(scope: Scope, name: string): Binding | null {
  let cur: Scope | null = scope;
  while (cur) {
    if (cur.bindings.has(name)) return cur.bindings.get(name)!;
    cur = cur.parent;
  }
  return null;
}

export function getAllBindings(scope: Scope): Binding[] {
  const out: Binding[] = [...scope.bindings.values()];
  for (const c of scope.children) out.push(...getAllBindings(c));
  return out;
}

export function buildScopeTree(program: Program): Scope {
  const root = createGlobalScope();

  function visit(node: ASTNode, scope: Scope): void {
    if (!node) return;
    switch (node.type) {
      case "Element": {
        const el = node as ElementNode;
        const s = createScope("block", el.tag, scope, el);
        scope.children.push(s);
        for (const c of el.children) visit(c, s);
        break;
      }
      case "Component": {
        const comp = node as ComponentNode;
        const s = createScope("component", comp.name, scope, comp);
        scope.children.push(s);
        for (const p of comp.props) {
          addBinding(s, {
            name: p.name, kind: "param",
            type: typeof p.value === "string" ? "string" : "any",
            node: comp, isExported: false, isImported: false,
            isMutable: false, initialized: p.value !== undefined,
          });
        }
        for (const c of comp.children) visit(c, s);
        break;
      }
      case "StateDirective": {
        for (const d of (node as any).declarations || []) {
          addBinding(scope, {
            name: d.name, kind: "variable", type: d.dataType || "string",
            node, isExported: false, isImported: false,
            isMutable: !d.isComputed, initialized: d.value !== undefined,
          });
        }
        break;
      }
      case "ImportDirective": {
        const imp = node as any;
        for (const item of imp.items || []) {
          addBinding(scope, {
            name: item, kind: "import", type: "any",
            node: imp, isExported: false, isImported: true,
            isMutable: false, initialized: true,
          });
        }
        if (imp.defaultImport) {
          addBinding(scope, {
            name: imp.defaultImport, kind: "import", type: "any",
            node: imp, isExported: false, isImported: true,
            isMutable: false, initialized: true,
          });
        }
        break;
      }
      case "If": {
        const s = createScope("block", "if", scope, node);
        scope.children.push(s);
        for (const c of (node as any).body || []) visit(c, s);
        for (const c of (node as any).elseBody || []) visit(c, s);
        break;
      }
      case "For": {
        const f = node as any;
        const s = createScope("block", "for", scope, node);
        scope.children.push(s);
        if (f.varName) addBinding(s, {
          name: f.varName, kind: "variable", type: "any",
          node: f, isExported: false, isImported: false,
          isMutable: false, initialized: true,
        });
        if (f.indexName) addBinding(s, {
          name: f.indexName, kind: "variable", type: "number",
          node: f, isExported: false, isImported: false,
          isMutable: false, initialized: true,
        });
        for (const c of f.body || []) visit(c, s);
        break;
      }
      default:
        for (const key of ["body", "children", "elseBody"]) {
          const arr = (node as any)[key];
          if (Array.isArray(arr)) for (const c of arr) if (c?.type) visit(c, scope);
        }
    }
  }

  for (const d of program.directives) visit(d as any, root);
  for (const n of program.body) visit(n, root);
  return root;
}
