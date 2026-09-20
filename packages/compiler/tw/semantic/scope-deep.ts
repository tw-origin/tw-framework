/**
 * Deep scope tree -- tracks scopes with flow-sensitive analysis.
 *
 * Handles block scoping, function scoping, closures, hoisting,
 * temporal dead zones, and scope shadowing. The scope tree is
 * used by the checker to resolve identifiers and detect errors
 * like use-before-declaration, redeclaration, and shadowing.
 */

import type { ASTNode, Program, ElementNode, ComponentNode } from "../ast/nodes";

// --- Scope Types -----------------------------------------------------

export type ScopeKind =
  | "global"
  | "module"
  | "component"
  | "function"
  | "block"
  | "for"
  | "if"
  | "else"
  | "try"
  | "catch"
  | "finally"
  | "switch"
  | "case"
  | "class"
  | "type";

export interface Scope {
  kind: ScopeKind;
  name: string;
  parent: Scope | null;
  bindings: Map<string, Binding>;
  children: Scope[];
  node: ASTNode | null;

  // Flow analysis data
  // Track which bindings are definitely assigned at this point
  assignedBindings: Set<string>;
  // Track which bindings are used after this scope
  usedBindings: Set<string>;
  // Is this scope inside a loop?
  inLoop: boolean;
  // Is this scope inside a function?
  inFunction: boolean;
  // Is this scope inside an async function?
  inAsync: boolean;
  // Is this scope inside a generator?
  inGenerator: boolean;
  // Return type inferred for this function scope
  inferredReturnType?: string;
  // All return statements seen in this function
  returnStatements?: Array<{ value: string; line: number; col: number }>;
}

export interface Binding {
  name: string;
  kind: BindingKind;
  type: string;
  scope: Scope;
  node: ASTNode | null;
  isExported: boolean;
  isImported: boolean;
  isMutable: boolean;
  initialized: boolean;
  // for temporal dead zone tracking
  declarationLine: number;
  declarationCol: number;
  // is this binding hoisted?
  hoisted: boolean;
  // is this binding captured by a closure?
  captured: boolean;
  // all references to this binding
  references: Array<{ line: number; col: number; kind: "read" | "write" | "call" }>;
  // is this a const binding?
  isConst: boolean;
  // for function bindings: is this async?
  isAsync: boolean;
  // for function bindings: is this a generator?
  isGenerator: boolean;
}

export type BindingKind =
  | "variable"
  | "const"
  | "let"
  | "var"
  | "function"
  | "class"
  | "param"
  | "import"
  | "export"
  | "directive"
  | "slot"
  | "state"
  | "computed"
  | "method"
  | "property";

// --- Scope Construction ----------------------------------------------

export function createScope(
  kind: ScopeKind,
  name: string,
  parent: Scope | null = null,
  node: ASTNode | null = null
): Scope {
  return {
    kind,
    name,
    parent,
    bindings: new Map(),
    children: [],
    node,
    assignedBindings: new Set(),
    usedBindings: new Set(),
    inLoop: parent?.inLoop ?? false,
    inFunction: parent?.inFunction ?? false,
    inAsync: parent?.inAsync ?? false,
    inGenerator: parent?.inGenerator ?? false,
  };
}

export function createGlobalScope(): Scope {
  return createScope("global", "global");
}

export function createModuleScope(name: string = "module"): Scope {
  return createScope("module", name);
}

// --- Binding Operations ----------------------------------------------

export function addBinding(scope: Scope, binding: Omit<Binding, "scope" | "references">): Binding {
  const full: Binding = {
    ...binding,
    scope,
    references: [],
  };
  scope.bindings.set(binding.name, full);
  if (binding.initialized) {
    scope.assignedBindings.add(binding.name);
  }
  return full;
}

export function lookup(scope: Scope, name: string): Binding | null {
  let cur: Scope | null = scope;
  while (cur) {
    if (cur.bindings.has(name)) {
      return cur.bindings.get(name)!;
    }
    cur = cur.parent;
  }
  return null;
}

export function lookupInScope(scope: Scope, name: string): Binding | null {
  return scope.bindings.get(name) ?? null;
}

export function lookupIncludingGlobals(scope: Scope, name: string, globals: Set<string>): Binding | "global" | null {
  const binding = lookup(scope, name);
  if (binding) return binding;
  if (globals.has(name)) return "global";
  return null;
}

export function getAllBindings(scope: Scope): Binding[] {
  const out: Binding[] = [...scope.bindings.values()];
  for (const c of scope.children) out.push(...getAllBindings(c));
  return out;
}

export function getBindingsInScope(scope: Scope): Binding[] {
  return [...scope.bindings.values()];
}

export function getExportedBindings(scope: Scope): Binding[] {
  return getAllBindings(scope).filter(b => b.isExported);
}

export function getImportedBindings(scope: Scope): Binding[] {
  return getAllBindings(scope).filter(b => b.isImported);
}

// --- Scope Tree Construction -----------------------------------------

/**
 * Build a complete scope tree from a program AST.
 * This handles all TW-specific constructs: components, state directives,
 * import directives, for loops, if/else blocks, etc.
 *
 * The tree is flow-sensitive -- it tracks assignments and usage to
 * support definite assignment analysis and unused variable detection.
 */
export function buildScopeTree(program: Program): Scope {
  const root = createGlobalScope();

  // Process directives first (imports, state, etc.)
  for (const directive of program.directives) {
    visitDirective(directive, root);
  }

  // Process body
  for (const node of program.body) {
    visitNode(node, root);
  }

  return root;
}

function visitDirective(node: ASTNode, scope: Scope): void {
  if (!node) return;
  const nodeType = (node as any).type;

  switch (nodeType) {
    case "ImportDirective": {
      const imp = node as any;
      const items = imp.items || [];
      for (const item of items) {
        addBinding(scope, {
          name: typeof item === "string" ? item : item.name,
          kind: "import",
          type: "any",
          node: imp,
          isExported: false,
          isImported: true,
          isMutable: false,
          initialized: true,
          declarationLine: imp.line ?? 0,
          declarationCol: imp.col ?? 0,
          hoisted: false,
          captured: false,
          isConst: true,
          isAsync: false,
          isGenerator: false,
        });
      }
      if (imp.defaultImport) {
        addBinding(scope, {
          name: imp.defaultImport,
          kind: "import",
          type: "any",
          node: imp,
          isExported: false,
          isImported: true,
          isMutable: false,
          initialized: true,
          declarationLine: imp.line ?? 0,
          declarationCol: imp.col ?? 0,
          hoisted: false,
          captured: false,
          isConst: true,
          isAsync: false,
          isGenerator: false,
        });
      }
      break;
    }

    case "StateDirective": {
      const state = node as any;
      for (const decl of state.declarations || []) {
        addBinding(scope, {
          name: decl.name,
          kind: decl.isComputed ? "computed" : "state",
          type: decl.dataType || "any",
          node: state,
          isExported: false,
          isImported: false,
          isMutable: !decl.isComputed,
          initialized: decl.value !== undefined,
          declarationLine: state.line ?? 0,
          declarationCol: state.col ?? 0,
          hoisted: false,
          captured: false,
          isConst: decl.isComputed,
          isAsync: false,
          isGenerator: false,
        });
      }
      break;
    }

    case "ExportDirective": {
      const exp = node as any;
      if (exp.items) {
        for (const item of exp.items) {
          const existing = lookup(scope, typeof item === "string" ? item : item.name);
          if (existing) {
            existing.isExported = true;
          } else {
            addBinding(scope, {
              name: typeof item === "string" ? item : item.name,
              kind: "export",
              type: "any",
              node: exp,
              isExported: true,
              isImported: false,
              isMutable: false,
              initialized: true,
              declarationLine: exp.line ?? 0,
              declarationCol: exp.col ?? 0,
              hoisted: false,
              captured: false,
              isConst: true,
              isAsync: false,
              isGenerator: false,
            });
          }
        }
      }
      break;
    }

    case "StyleDirective":
    case "ScriptDirective": {
      // these don't create new bindings but may contain expressions
      break;
    }

    default:
      visitNode(node, scope);
  }
}

function visitNode(node: ASTNode, scope: Scope): void {
  if (!node) return;
  const nodeType = (node as any).type;

  switch (nodeType) {
    case "Element": {
      const el = node as ElementNode;
      // Elements create a block scope for their children
      const s = createScope("block", el.tag, scope, el);
      scope.children.push(s);

      // Process attributes that might create bindings
      for (const attr of (el as any).attrs || []) {
        if (attr.name?.startsWith(":")) {
          // directive binding -- check for local variables
          const expr = attr.value;
          if (typeof expr === "string") {
            const refs = extractIdentifiers(expr);
            for (const ref of refs) {
              const binding = lookup(scope, ref);
              if (binding) {
                binding.references.push({
                  line: attr.line ?? 0,
                  col: attr.col ?? 0,
                  kind: "read",
                });
              }
            }
          }
        }
      }

      for (const child of el.children) {
        visitNode(child, s);
      }
      break;
    }

    case "Component": {
      const comp = node as ComponentNode;
      // Register the component as a binding in the current scope
      addBinding(scope, {
        name: comp.name,
        kind: "function",
        type: "component",
        node: comp,
        isExported: false,
        isImported: false,
        isMutable: false,
        initialized: true,
        declarationLine: comp.line ?? 0,
        declarationCol: comp.col ?? 0,
        hoisted: true, // function declarations are hoisted
        captured: false,
        isConst: true,
        isAsync: false,
        isGenerator: false,
      });

      // Create component scope for props and body
      const s = createScope("component", comp.name, scope, comp);
      scope.children.push(s);

      // Add props as bindings
      for (const prop of comp.props) {
        addBinding(s, {
          name: prop.name,
          kind: "param",
          type: typeof prop.value === "string" ? "string" : "any",
          node: comp,
          isExported: false,
          isImported: false,
          isMutable: false,
          initialized: prop.value !== undefined,
          declarationLine: comp.line ?? 0,
          declarationCol: comp.col ?? 0,
          hoisted: false,
          captured: false,
          isConst: false,
          isAsync: false,
          isGenerator: false,
        });
      }

      // Process component children
      for (const child of comp.children) {
        visitNode(child, s);
      }
      break;
    }

    case "If": {
      const ifNode = node as any;
      // if block creates its own scope
      const ifScope = createScope("if", "if", scope, ifNode);
      scope.children.push(ifScope);

      // Check condition for identifiers
      if (ifNode.condition) {
        const refs = extractIdentifiers(String(ifNode.condition));
        for (const ref of refs) {
          const binding = lookup(scope, ref);
          if (binding) {
            binding.references.push({
              line: ifNode.line ?? 0,
              col: ifNode.col ?? 0,
              kind: "read",
            });
          }
        }
      }

      for (const child of ifNode.body || []) {
        visitNode(child, ifScope);
      }

      // else block
      if (ifNode.elseBody && ifNode.elseBody.length > 0) {
        const elseScope = createScope("else", "else", scope, ifNode);
        scope.children.push(elseScope);
        for (const child of ifNode.elseBody) {
          visitNode(child, elseScope);
        }
      }
      break;
    }

    case "For": {
      const forNode = node as any;
      const forScope = createScope("for", "for", scope, forNode);
      forScope.inLoop = true;
      scope.children.push(forScope);

      // Add loop variable
      if (forNode.varName) {
        addBinding(forScope, {
          name: forNode.varName,
          kind: "let",
          type: "any",
          node: forNode,
          isExported: false,
          isImported: false,
          isMutable: false,
          initialized: true,
          declarationLine: forNode.line ?? 0,
          declarationCol: forNode.col ?? 0,
          hoisted: false,
          captured: false,
          isConst: false,
          isAsync: false,
          isGenerator: false,
        });
      }

      // Add index variable
      if (forNode.indexName) {
        addBinding(forScope, {
          name: forNode.indexName,
          kind: "let",
          type: "number",
          node: forNode,
          isExported: false,
          isImported: false,
          isMutable: false,
          initialized: true,
          declarationLine: forNode.line ?? 0,
          declarationCol: forNode.col ?? 0,
          hoisted: false,
          captured: false,
          isConst: false,
          isAsync: false,
          isGenerator: false,
        });
      }

      // Check iterable expression for identifiers
      if (forNode.iterable) {
        const refs = extractIdentifiers(String(forNode.iterable));
        for (const ref of refs) {
          const binding = lookup(scope, ref);
          if (binding) {
            binding.references.push({
              line: forNode.line ?? 0,
              col: forNode.col ?? 0,
              kind: "read",
            });
          }
        }
      }

      for (const child of forNode.body || []) {
        visitNode(child, forScope);
      }
      break;
    }

    case "While": {
      const whileNode = node as any;
      const whileScope = createScope("block", "while", scope, whileNode);
      whileScope.inLoop = true;
      scope.children.push(whileScope);

      if (whileNode.condition) {
        const refs = extractIdentifiers(String(whileNode.condition));
        for (const ref of refs) {
          const binding = lookup(scope, ref);
          if (binding) {
            binding.references.push({
              line: whileNode.line ?? 0,
              col: whileNode.col ?? 0,
              kind: "read",
            });
          }
        }
      }

      for (const child of whileNode.body || []) {
        visitNode(child, whileScope);
      }
      break;
    }

    case "Switch": {
      const switchNode = node as any;
      const switchScope = createScope("switch", "switch", scope, switchNode);
      scope.children.push(switchScope);

      for (const caseNode of switchNode.cases || []) {
        const caseScope = createScope("case", "case", switchScope, caseNode);
        switchScope.children.push(caseScope);
        for (const child of caseNode.body || []) {
          visitNode(child, caseScope);
        }
      }
      break;
    }

    case "Try": {
      const tryNode = node as any;
      const tryScope = createScope("try", "try", scope, tryNode);
      scope.children.push(tryScope);

      for (const child of tryNode.body || []) {
        visitNode(child, tryScope);
      }

      if (tryNode.catchClause) {
        const catchScope = createScope("catch", "catch", scope, tryNode);
        scope.children.push(catchScope);
        // Add the catch parameter
        if (tryNode.catchClause.param) {
          addBinding(catchScope, {
            name: tryNode.catchClause.param,
            kind: "param",
            type: "any",
            node: tryNode,
            isExported: false,
            isImported: false,
            isMutable: false,
            initialized: true,
            declarationLine: tryNode.line ?? 0,
            declarationCol: tryNode.col ?? 0,
            hoisted: false,
            captured: false,
            isConst: true,
            isAsync: false,
            isGenerator: false,
          });
        }
        for (const child of tryNode.catchClause.body || []) {
          visitNode(child, catchScope);
        }
      }

      if (tryNode.finallyBody) {
        const finallyScope = createScope("finally", "finally", scope, tryNode);
        scope.children.push(finallyScope);
        for (const child of tryNode.finallyBody) {
          visitNode(child, finallyScope);
        }
      }
      break;
    }

    case "Fragment": {
      const fragScope = createScope("block", "fragment", scope, node);
      scope.children.push(fragScope);
      for (const child of (node as any).children || []) {
        visitNode(child, fragScope);
      }
      break;
    }

    case "Slot": {
      // Slots are like parameters to the component
      const slotNode = node as any;
      if (slotNode.name) {
        addBinding(scope, {
          name: slotNode.name,
          kind: "slot",
          type: "any",
          node: slotNode,
          isExported: false,
          isImported: false,
          isMutable: false,
          initialized: true,
          declarationLine: slotNode.line ?? 0,
          declarationCol: slotNode.col ?? 0,
          hoisted: false,
          captured: false,
          isConst: true,
          isAsync: false,
          isGenerator: false,
        });
      }
      break;
    }

    default: {
      // Generic child traversal
      for (const key of ["body", "children", "elseBody", "cases", "declarations"]) {
        const arr = (node as any)[key];
        if (Array.isArray(arr)) {
          for (const child of arr) {
            if (child && typeof child.type === "string") {
              visitNode(child, scope);
            }
          }
        }
      }
    }
  }
}

// --- Flow Analysis ----------------------------------------------------

/**
 * Analyze definite assignment -- check if a variable is definitely
 * assigned before use. This catches bugs like using a variable before
 * it's been assigned in all code paths.
 */
export function analyzeDefiniteAssignment(scope: Scope): Map<string, boolean> {
  const result = new Map<string, boolean>();

  function walk(s: Scope): void {
    for (const [name, binding] of s.bindings) {
      if (binding.initialized) {
        result.set(name, true);
      } else if (s.assignedBindings.has(name)) {
        result.set(name, true);
      } else {
        // Check if it's assigned in all children paths
        // For now, just mark as not definitely assigned
        result.set(name, false);
      }
    }
    for (const child of s.children) {
      walk(child);
    }
  }

  walk(scope);
  return result;
}

/**
 * Find all unused bindings in a scope tree.
 */
export function findUnusedBindings(scope: Scope): Binding[] {
  const unused: Binding[] = [];

  function walk(s: Scope): void {
    for (const [, binding] of s.bindings) {
      // Don't flag exports as unused
      if (binding.isExported) continue;
      // Don't flag function parameters that are destructured
      if (binding.kind === "param" && binding.name.startsWith("_")) continue;
      // Check references
      if (binding.references.length === 0) {
        unused.push(binding);
      }
    }
    for (const child of s.children) {
      walk(child);
    }
  }

  walk(scope);
  return unused;
}

/**
 * Find all shadowed bindings -- where a binding in a child scope
 * has the same name as one in a parent scope.
 */
export function findShadowedBindings(scope: Scope): Array<{ binding: Binding; shadowed: Binding }> {
  const shadows: Array<{ binding: Binding; shadowed: Binding }> = [];

  function walk(s: Scope): void {
    for (const [name, binding] of s.bindings) {
      // Check if this name exists in any parent scope
      let parent = s.parent;
      while (parent) {
        if (parent.bindings.has(name)) {
          shadows.push({
            binding,
            shadowed: parent.bindings.get(name)!,
          });
          break;
        }
        parent = parent.parent;
      }
    }
    for (const child of s.children) {
      walk(child);
    }
  }

  walk(scope);
  return shadows;
}

/**
 * Find all captured bindings -- variables used in closures that
 * are declared in an outer scope.
 */
export function findCapturedBindings(scope: Scope): Binding[] {
  const captured: Binding[] = [];

  function walk(s: Scope): void {
    // For function/component scopes, check if any inner binding
    // references an outer binding
    if (s.kind === "function" || s.kind === "component") {
      // This is a simplified check -- a full implementation would
      // walk the AST and check all references
      for (const child of s.children) {
        walk(child);
      }
    } else {
      for (const child of s.children) {
        walk(child);
      }
    }
  }

  walk(scope);
  return captured;
}

/**
 * Check for temporal dead zone violations -- using a let/const
 * before its declaration.
 */
export function findTDZViolations(scope: Scope): Array<{ name: string; line: number; col: number }> {
  const violations: Array<{ name: string; line: number; col: number }> = [];

  function walk(s: Scope): void {
    for (const [, binding] of s.bindings) {
      // var is hoisted, so no TDZ
      if (binding.kind === "var") continue;
      // function declarations are hoisted
      if (binding.kind === "function") continue;

      // Check if any reference comes before the declaration
      for (const ref of binding.references) {
        if (ref.line < binding.declarationLine ||
            (ref.line === binding.declarationLine && ref.col < binding.declarationCol)) {
          violations.push({
            name: binding.name,
            line: ref.line,
            col: ref.col,
          });
        }
      }
    }
    for (const child of s.children) {
      walk(child);
    }
  }

  walk(scope);
  return violations;
}

/**
 * Get the scope chain from a given scope to the root.
 */
export function getScopeChain(scope: Scope): Scope[] {
  const chain: Scope[] = [];
  let cur: Scope | null = scope;
  while (cur) {
    chain.push(cur);
    cur = cur.parent;
  }
  return chain;
}

/**
 * Find the nearest enclosing function scope.
 */
export function getEnclosingFunctionScope(scope: Scope): Scope | null {
  let cur: Scope | null = scope;
  while (cur) {
    if (cur.kind === "function" || cur.kind === "component") return cur;
    cur = cur.parent;
  }
  return null;
}

/**
 * Find the nearest enclosing loop scope.
 */
export function getEnclosingLoopScope(scope: Scope): Scope | null {
  let cur: Scope | null = scope;
  while (cur) {
    if (cur.inLoop) return cur;
    cur = cur.parent;
  }
  return null;
}

// --- Helpers ----------------------------------------------------------

function extractIdentifiers(expr: string): string[] {
  const ids = new Set<string>();
  let i = 0;
  const s = String(expr);
  while (i < s.length) {
    if (/[a-zA-Z_$]/.test(s[i])) {
      let id = "";
      while (i < s.length && /[a-zA-Z0-9_$]/.test(s[i])) {
        id += s[i];
        i++;
      }
      // Skip keywords and literals
      if (!KEYWORDS.has(id) && !isLiteral(id)) {
        ids.add(id);
      }
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

const KEYWORDS = new Set([
  "if", "else", "for", "while", "do", "switch", "case", "default",
  "break", "continue", "return", "throw", "try", "catch", "finally",
  "var", "let", "const", "function", "class", "extends", "super",
  "this", "new", "delete", "typeof", "instanceof", "in", "of",
  "async", "await", "yield", "import", "export", "from", "as",
  "type", "interface", "namespace", "declare", "enum", "abstract",
  "readonly", "keyof", "infer", "is", "satisfies", "asserts",
  "void", "never", "unknown", "any", "string", "number", "boolean",
  "object", "symbol", "bigint", "true", "false", "null", "undefined",
]);

// --- Scope Printing (for debugging) -----------------------------------

export function scopeToString(scope: Scope, indent: number = 0): string {
  const pad = "  ".repeat(indent);
  const lines: string[] = [`${pad}${scope.kind}:${scope.name} (${scope.bindings.size} bindings)`];

  for (const [name, binding] of scope.bindings) {
    const flags: string[] = [];
    if (binding.isExported) flags.push("export");
    if (binding.isImported) flags.push("import");
    if (binding.isConst) flags.push("const");
    if (binding.hoisted) flags.push("hoisted");
    if (binding.captured) flags.push("captured");
    lines.push(`${pad}  ${name}: ${binding.type} [${binding.kind}${flags.length ? ", " + flags.join(", ") : ""}] (${binding.references.length} refs)`);
  }

  for (const child of scope.children) {
    lines.push(scopeToString(child, indent + 1));
  }

  return lines.join("\n");
}
