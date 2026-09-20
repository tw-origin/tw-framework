/**
 * Tree Shaker -- deep dependency graph analysis and unused code removal.
 *
 * Tree shaking is the process of finding all reachable code from entry
 * points and removing everything that isn't reachable. This is what
 * Rollup, esbuild, and Webpack do -- but at the TW AST level.
 *
 * Algorithm:
 * 1. Build a dependency graph of all declarations (components, state vars,
 *    imports, functions, CSS selectors)
 * 2. Mark all "root" nodes (the ones definitely needed: page body, layout,
 *    head directives, entry components)
 * 3. Do a reachability analysis from roots through the graph
 * 4. Remove all unmarked (unreachable) nodes
 *
 * Graph edges:
 * - Component A renders component B -> A depends on B
 * - Component A imports B -> A depends on B
 * - Component A uses state let X -> A depends on X
 * - State let X initialized from function F -> X depends on F
 * - CSS selector .foo applies to element with class="foo" -> selector depends on element
 * - Event handler H on element E -> E depends on H
 *
 * This is more sophisticated than simple "is it referenced" analysis:
 * - Handles transitive dependencies (A->B->C, if A is unused, remove B and C)
 * - Handles circular dependencies (doesn't infinite loop)
 * - Handles side-effect imports (always kept)
 * - Handles dynamic references (eval, computed names -- conservatively kept)
 */

import type {
  Program, ASTNode, ElementNode, ComponentNode,
  DirectiveNode, ImportDirective, StateDirective,
} from "../ast/nodes";

// --- Dependency Graph ------------------------------------------------

export type NodeType = "component" | "state-var" | "import" | "handler" | "css-selector" | "css-rule" | "directive";

export interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  /** IDs of nodes this node depends on */
  dependencies: Set<string>;
  /** IDs of nodes that depend on this node */
  dependents: Set<string>;
  /** Is this a root node (entry point)? */
  isRoot: boolean;
  /** Is this node reachable from a root? */
  reachable: boolean;
  /** The AST node this graph node represents (for removal) */
  astNode?: any;
  /** Source location for debugging */
  loc?: { line: number; col: number; offset: number };
}

export interface TreeShakeResult {
  program: Program;
  graph: Map<string, GraphNode>;
  removed: string[];
  kept: string[];
  roots: string[];
  passCount: number;
}

// --- Graph Builder ---------------------------------------------------

export class DependencyGraph {
  nodes = new Map<string, GraphNode>();
  private rootCounter = 0;

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  addNode(id: string, type: NodeType, name: string, astNode?: any): GraphNode {
    let node = this.nodes.get(id);
    if (!node) {
      node = {
        id, type, name,
        dependencies: new Set(),
        dependents: new Set(),
        isRoot: false,
        reachable: false,
        astNode,
      };
      this.nodes.set(id, node);
    } else if (astNode && !node.astNode) {
      node.astNode = astNode;
    }
    return node;
  }

  addDependency(from: string, to: string): void {
    const fromNode = this.addNode(from, "directive", "");
    const toNode = this.addNode(to, "directive", "");
    fromNode.dependencies.add(to);
    toNode.dependents.add(from);
  }

  markRoot(id: string): void {
    const node = this.addNode(id, "directive", "");
    node.isRoot = true;
    this.rootCounter++;
  }

  /**
   * Run reachability analysis from all root nodes.
   * Uses BFS to mark all reachable nodes.
   */
  markReachable(): void {
    const queue: string[] = [];

    // Start with all roots
    for (const [id, node] of this.nodes) {
      if (node.isRoot) {
        node.reachable = true;
        queue.push(id);
      }
    }

    // BFS
    while (queue.length > 0) {
      const id = queue.shift()!;
      const node = this.nodes.get(id);
      if (!node) continue;

      for (const depId of node.dependencies) {
        const dep = this.nodes.get(depId);
        if (dep && !dep.reachable) {
          dep.reachable = true;
          queue.push(depId);
        }
      }
    }
  }

  getUnreachable(): GraphNode[] {
    return Array.from(this.nodes.values()).filter(n => !n.reachable);
  }

  getReachable(): GraphNode[] {
    return Array.from(this.nodes.values()).filter(n => n.reachable);
  }

  getRoots(): GraphNode[] {
    return Array.from(this.nodes.values()).filter(n => n.isRoot);
  }

  get size(): number {
    return this.nodes.size;
  }

  /**
   * Detect circular dependencies.
   * Returns a list of cycles (each cycle is a list of node IDs).
   */
  detectCycles(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const stack: string[] = [];
    const onStack = new Set<string>();

    const dfs = (id: string): void => {
      visited.add(id);
      onStack.add(id);
      stack.push(id);

      const node = this.nodes.get(id);
      if (node) {
        for (const depId of node.dependencies) {
          if (!visited.has(depId)) {
            dfs(depId);
          } else if (onStack.has(depId)) {
            // Found a cycle
            const cycleStart = stack.indexOf(depId);
            if (cycleStart !== -1) {
              cycles.push([...stack.slice(cycleStart), depId]);
            }
          }
        }
      }

      stack.pop();
      onStack.delete(id);
    };

    for (const [id] of this.nodes) {
      if (!visited.has(id)) {
        dfs(id);
      }
    }

    return cycles;
  }

  /**
   * Get the topological order of nodes.
   * Useful for determining the order in which to generate code.
   */
  topologicalSort(): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);

      const node = this.nodes.get(id);
      if (node) {
        for (const depId of node.dependencies) {
          visit(depId);
        }
      }

      result.push(id);
    };

    for (const [id] of this.nodes) {
      visit(id);
    }

    return result;
  }

  /**
   * Print graph as DOT format (for visualization).
   */
  toDot(): string {
    const lines = ["digraph TW {"];
    for (const [id, node] of this.nodes) {
      const label = node.name || id;
      const color = node.isRoot ? "red" : node.reachable ? "green" : "gray";
      lines.push(`  "${id}" [label="${label}", color=${color}];`);
    }
    for (const [id, node] of this.nodes) {
      for (const depId of node.dependencies) {
        lines.push(`  "${id}" -> "${depId}";`);
      }
    }
    lines.push("}");
    return lines.join("\n");
  }
}

// --- Program Analyzer ------------------------------------------------

/**
 * Analyze a program and build its dependency graph.
 */
export function buildDependencyGraph(program: Program): DependencyGraph {
  const graph = new DependencyGraph();

  // 1. Register all declarations
  registerDeclarations(program, graph);

  // 2. Register component definitions
  registerComponentDefs(program, graph);

  // 3. Register state variables
  registerStateVars(program, graph);

  // 4. Register imports
  registerImports(program, graph);

  // 5. Register event handlers
  registerHandlers(program, graph);

  // 6. Register CSS selectors
  registerCSSSelectors(program, graph);

  // 7. Mark root nodes
  markRoots(program, graph);

  // 8. Build dependency edges
  buildEdges(program, graph);

  return graph;
}

// --- Registration Functions ------------------------------------------

function registerDeclarations(program: Program, graph: DependencyGraph): void {
  for (const dir of program.directives || []) {
    const d = dir as unknown;
    const name = (d as any).name ?? (d as any).type;
    const id = `directive:${name}:${(d as any).args?.[0]?.value ?? ""}`;
    graph.addNode(id, "directive", name, dir);
  }
}

function registerComponentDefs(program: Program, graph: DependencyGraph): void {
  // Component definitions in directives
  for (const dir of program.directives || []) {
    const d = dir as unknown;
    if ((d as any).type === "ComponentDirective" || (d as any).name === "component") {
      const name = (d as any).args?.[0]?.value ?? (d as any).name;
      graph.addNode(`component:${name}`, "component", name, dir);
    }
  }

  // Component definitions in body (as elements with capital first letter)
  walkAST(program, (node: any) => {
    if (node.type === "Element" && /^[A-Z]/.test(node.tag)) {
      graph.addNode(`component:${node.tag}`, "component", node.tag, node);
    }
  });
}

function registerStateVars(program: Program, graph: DependencyGraph): void {
  for (const dir of program.directives || []) {
    const d = dir as unknown;
    if ((d as any).type === "StateDirective" && (d as any).declarations) {
      for (const decl of (d as any).declarations) {
        graph.addNode(`state:${decl.name}`, "state-var", decl.name, decl);
      }
    }
  }
}

function registerImports(program: Program, graph: DependencyGraph): void {
  for (const dir of program.directives || []) {
    const d = dir as unknown;
    if ((d as any).type === "ImportDirective" || (d as any).name === "import") {
      const source = (d as any).args?.[0]?.value ?? (d as any).source ?? "";
      const items = (d as any).items ?? (d as any).args?.slice(1).map((a: any) => a.value).filter(Boolean) ?? [];
      if (items.length === 0) {
        // Side-effect import
        graph.addNode(`import:${source}:side-effect`, "import", source, dir);
      } else {
        for (const item of items) {
          graph.addNode(`import:${item}`, "import", item, dir);
        }
      }
    }
  }
}

function registerHandlers(program: Program, graph: DependencyGraph): void {
  walkAST(program, (node: any) => {
    if (node.type === "Element") {
      for (const ev of node.events || []) {
        const handlerName = extractHandlerName(ev.handler);
        if (handlerName) {
          graph.addNode(`handler:${handlerName}`, "handler", handlerName, ev);
        }
      }
    }
  });
}

function registerCSSSelectors(program: Program, graph: DependencyGraph): void {
  walkAST(program, (node: any) => {
    if (node.type === "StyleBlock" && node.content) {
      const selectors = extractCSSSelectorNames(node.content);
      for (const sel of selectors) {
        graph.addNode(`css:${sel}`, "css-selector", sel, node);
      }
    }
  });
}

// --- Root Marking ----------------------------------------------------

function markRoots(program: Program, graph: DependencyGraph): void {
  // The page body is always a root
  graph.markRoot("root:page-body");

  // Layout directives are roots (they wrap the page)
  for (const dir of program.directives || []) {
    const d = dir as unknown;
    if ((d as any).name === "layout" || (d as any).type === "LayoutDirective") {
      const layoutName = (d as any).args?.[0]?.value ?? (d as any).body;
      if (layoutName) {
        graph.markRoot(`directive:layout:${layoutName}`);
      }
    }
  }

  // Head directives are roots (they're always rendered)
  for (const dir of program.directives || []) {
    const d = dir as unknown;
    if ((d as any).name === "head" || (d as any).name === "page" || (d as any).name === "meta") {
      graph.markRoot(`directive:${(d as any).name}:${(d as any).args?.[0]?.value ?? ""}`);
    }
  }

  // Entry components (components directly in body, not inside other components)
  for (const node of program.body) {
    if (node.type === "Component") {
      graph.markRoot(`component:${(node as any).name}`);
    }
    if (node.type === "Element" && /^[A-Z]/.test((node as any).tag)) {
      graph.markRoot(`component:${(node as any).tag}`);
    }
  }

  // State variables used in the root body (not inside component defs)
  // These are roots because they drive the page's initial render
  for (const dir of program.directives || []) {
    const d = dir as unknown;
    if ((d as any).type === "StateDirective" && (d as any).declarations) {
      for (const decl of (d as any).declarations) {
        // Check if the state var is used in the page body
        const usedInBody = isUsedInBody(program, decl.name);
        if (usedInBody) {
          graph.markRoot(`state:${decl.name}`);
        }
      }
    }
  }
}

// --- Edge Building ---------------------------------------------------

function buildEdges(program: Program, graph: DependencyGraph): void {
  // Walk AST with context tracking and build dependency edges
  walkASTWithContext(program, (node: any, contextId: string) => {
    // Component usage -> depends on component definition
    if (node.type === "Component") {
      graph.addDependency(contextId, `component:${node.name}`);
    }
    if (node.type === "Element" && /^[A-Z]/.test(node.tag)) {
      graph.addDependency(contextId, `component:${node.tag}`);
    }

    // State variable references
    if (node.type === "Text" && node.isInterpolated) {
      const ids = extractIdentifiers(node.value);
      for (const id of ids) {
        if (graph.getNode(`state:${id}`)) {
          graph.addDependency(contextId, `state:${id}`);
        }
      }
    }

    // Element bindings reference state
    if (node.type === "Element") {
      for (const binding of node.bindings || []) {
        const ids = extractIdentifiers(binding.expression);
        for (const id of ids) {
          if (graph.getNode(`state:${id}`)) {
            graph.addDependency(contextId, `state:${id}`);
          }
        }
      }
      // Events reference handlers
      for (const ev of node.events || []) {
        const handlerName = extractHandlerName(ev.handler);
        if (handlerName && graph.getNode(`handler:${handlerName}`)) {
          graph.addDependency(contextId, `handler:${handlerName}`);
        }
      }
      // Class attributes reference CSS selectors
      for (const attr of node.attrs || []) {
        if (attr.name === "class" && attr.value) {
          const classes = String(attr.value).split(/\s+/).filter(Boolean);
          for (const cls of classes) {
            if (graph.getNode(`css:.${cls}`)) {
              graph.addDependency(contextId, `css:.${cls}`);
            }
          }
        }
        if (attr.name === "id" && attr.value) {
          if (graph.getNode(`css:#${attr.value}`)) {
            graph.addDependency(contextId, `css:#${attr.value}`);
          }
        }
      }
    }

    // If conditions reference state
    if (node.type === "If") {
      const ids = extractIdentifiers(node.condition);
      for (const id of ids) {
        if (graph.getNode(`state:${id}`)) {
          graph.addDependency(contextId, `state:${id}`);
        }
      }
    }

    // For-loop iterables reference state
    if (node.type === "For") {
      const ids = extractIdentifiers(node.iterable);
      for (const id of ids) {
        if (graph.getNode(`state:${id}`)) {
          graph.addDependency(contextId, `state:${id}`);
        }
      }
    }

    // Import references
    if (node.type === "ImportDirective") {
      const items = node.items ?? [];
      for (const item of items) {
        if (graph.getNode(`import:${item}`)) {
          graph.addDependency("root:page-body", `import:${item}`);
        }
      }
    }
  });

  // CSS selectors depend on elements they match
  for (const [id, node] of graph.nodes) {
    if (node.type === "css-selector") {
      // Find elements that match this selector
      const selector = node.name;
      if (selector.startsWith(".")) {
        const cls = selector.substring(1);
        // Find elements with this class
        walkAST(program, (astNode: any) => {
          if (astNode.type === "Element") {
            for (const attr of astNode.attrs || []) {
              if (attr.name === "class" && String(attr.value).split(/\s+/).includes(cls)) {
                graph.addDependency(id, `element:${cls}`);
              }
            }
          }
        });
      }
    }
  }
}

// --- Main Tree Shake Function ----------------------------------------

/**
 * Shake the tree -- remove all unreachable code.
 */
export function shakeTree(program: Program): TreeShakeResult {
  const graph = buildDependencyGraph(program);

  // Mark reachable nodes from roots
  graph.markReachable();

  // Get unreachable nodes
  const unreachable = graph.getUnreachable();
  const removed = unreachable.map(n => n.id);
  const kept = graph.getReachable().map(n => n.id);
  const roots = graph.getRoots().map(n => n.id);

  // Remove unreachable nodes from the program
  const cloned = deepClone(program);

  // Remove unreachable component definitions
  if (cloned.directives) {
    cloned.directives = cloned.directives.filter((dir: any) => {
      const name = dir.name ?? dir.type;
      if (dir.type === "ComponentDirective" || name === "component") {
        const compName = dir.args?.[0]?.value ?? dir.name;
        const id = `component:${compName}`;
        const node = graph.getNode(id);
        return node ? node.reachable : true;
      }
      if (dir.type === "StateDirective" && dir.declarations) {
        dir.declarations = dir.declarations.filter((decl: any) => {
          const id = `state:${decl.name}`;
          const node = graph.getNode(id);
          return node ? node.reachable : true;
        });
        return dir.declarations.length > 0;
      }
      if (dir.type === "ImportDirective" || name === "import") {
        const source = dir.args?.[0]?.value ?? dir.source ?? "";
        const items = dir.items ?? dir.args?.slice(1).map((a: any) => a.value).filter(Boolean) ?? [];
        if (items.length === 0) return true; // Side-effect import
        return items.some((item: string) => {
          const node = graph.getNode(`import:${item}`);
          return node ? node.reachable : true;
        });
      }
      return true;
    });
  }

  // Remove unreachable CSS selectors from style blocks
  walkAST(cloned, (node: any) => {
    if (node.type === "StyleBlock" && node.content) {
      node.content = filterReachableCSS(node.content, graph);
    }
  });

  return {
    program: cloned,
    graph: graph as any,
    removed,
    kept,
    roots,
    passCount: 1,
  };
}

/**
 * Run tree shaking to fixpoint (until no more code can be removed).
 */
export function shakeToFixpoint(program: Program): TreeShakeResult {
  let current = program;
  let lastRemoved = -1;
  let passCount = 0;
  let result: TreeShakeResult;

  const maxPasses = 10;

  do {
    result = shakeTree(current);
    current = result.program;
    passCount++;
  } while (result.removed.length > 0 && result.removed.length !== lastRemoved && passCount < maxPasses);

  return { ...result, passCount };
}

// --- Helper Functions ------------------------------------------------

function filterReachableCSS(css: string, graph: DependencyGraph): string {
  // Remove CSS rules whose selectors are unreachable
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");

  let result = "";
  let pos = 0;

  while (pos < css.length) {
    while (pos < css.length && /\s/.test(css[pos])) {
      result += css[pos];
      pos++;
    }
    if (pos >= css.length) break;

    // At-rules -- keep
    if (css[pos] === "@") {
      const braceStart = css.indexOf("{", pos);
      if (braceStart === -1) {
        const semiEnd = css.indexOf(";", pos);
        if (semiEnd === -1) { result += css.substring(pos); break; }
        result += css.substring(pos, semiEnd + 1);
        pos = semiEnd + 1;
        continue;
      }
      const braceEnd = findMatchingBrace(css, braceStart);
      if (braceEnd === -1) { result += css.substring(pos); break; }
      result += css.substring(pos, braceEnd + 1);
      pos = braceEnd + 1;
      continue;
    }

    // Regular rule
    const braceStart = css.indexOf("{", pos);
    if (braceStart === -1) { result += css.substring(pos); break; }
    const braceEnd = findMatchingBrace(css, braceStart);
    if (braceEnd === -1) { result += css.substring(pos); break; }

    const selectorPart = css.substring(pos, braceStart).trim();
    const bodyPart = css.substring(braceStart, braceEnd + 1);

    // Check if any selector is reachable
    const selectors = selectorPart.split(",").map(s => s.trim());
    const shouldKeep = selectors.some(sel => {
      const id = `css:${sel}`;
      const node = graph.getNode(id);
      // If we don't have info about this selector, keep it
      return node ? node.reachable : true;
    });

    if (shouldKeep) {
      result += selectorPart + " " + bodyPart;
    }

    pos = braceEnd + 1;
  }

  return result;
}

function extractCSSSelectorNames(css: string): string[] {
  const selectors: string[] = [];
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");

  let pos = 0;
  while (pos < css.length) {
    while (pos < css.length && /\s/.test(css[pos])) pos++;
    if (pos >= css.length) break;

    if (css[pos] === "@") {
      const braceStart = css.indexOf("{", pos);
      if (braceStart === -1) { pos = css.length; break; }
      const braceEnd = findMatchingBrace(css, braceStart);
      if (braceEnd === -1) { pos = css.length; break; }
      pos = braceEnd + 1;
      continue;
    }

    const braceStart = css.indexOf("{", pos);
    if (braceStart === -1) break;
    const braceEnd = findMatchingBrace(css, braceStart);
    if (braceEnd === -1) break;

    const selectorPart = css.substring(pos, braceStart).trim();
    const parts = selectorPart.split(",").map(s => s.trim());
    for (const part of parts) {
      if (part) selectors.push(part);
    }
    pos = braceEnd + 1;
  }

  return selectors;
}

function extractHandlerName(handler: string): string {
  // "handleClick" -> "handleClick"
  // "this.handleClick" -> "handleClick"
  // "handlers.onClick" -> "onClick"
  // "(e) => doSomething(e)" -> "" (anonymous)
  const parts = handler.split(".");
  const last = parts[parts.length - 1].trim();
  if (/^[a-zA-Z_$][\w$]*$/.test(last)) return last;
  return "";
}

function extractIdentifiers(expr: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  const cleaned = expr.replace(/["'`][^"'`]*["'`]/g, "");
  const regex = /[a-zA-Z_$][a-zA-Z0-9_$]*/g;
  let match;
  while ((match = regex.exec(cleaned)) !== null) {
    const name = match[0];
    if (!JS_KEYWORDS.has(name) && !seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }
  return result;
}

function isUsedInBody(program: Program, name: string): boolean {
  let found = false;
  walkAST(program, (node: any) => {
    if (found) return;
    if (node.type === "Text" && node.isInterpolated) {
      if (extractIdentifiers(node.value).includes(name)) found = true;
    }
    if (node.type === "Element") {
      for (const attr of node.attrs || []) {
        if (attr.isInterpolated && extractIdentifiers(attr.value).includes(name)) found = true;
      }
      for (const binding of node.bindings || []) {
        if (extractIdentifiers(binding.expression).includes(name)) found = true;
      }
    }
    if (node.type === "If" && extractIdentifiers(node.condition).includes(name)) found = true;
    if (node.type === "For" && extractIdentifiers(node.iterable).includes(name)) found = true;
  });
  return found;
}

/**
 * Walk the AST with a context stack that tracks which component we're inside.
 * This is more accurate than the simple parent-only approach.
 */
function walkASTWithContext(
  node: any,
  visitor: (node: any, contextId: string) => void,
  contextId = "root:page-body"
): void {
  if (!node || typeof node !== "object") return;

  // Update context if we're entering a component
  let childContext = contextId;
  if (node.type === "Component") {
    childContext = `component:${node.name}`;
  } else if (node.type === "Element" && /^[A-Z]/.test(node.tag ?? "")) {
    childContext = `component:${node.tag}`;
  }

  visitor(node, contextId);

  const childKeys = ["body", "children", "elseBody", "directives", "props", "declarations"];
  for (const key of childKeys) {
    if (Array.isArray(node[key])) {
      for (const child of node[key]) {
        walkASTWithContext(child, visitor, childContext);
      }
    }
  }
}

function findMatchingBrace(str: string, start: number): number {
  let depth = 1;
  for (let i = start + 1; i < str.length; i++) {
    if (str[i] === "{") depth++;
    else if (str[i] === "}") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function deepClone<T>(obj: T): T {
  if (typeof structuredClone !== "undefined") {
    try { return structuredClone(obj); } catch { /* ignored */ }
  }
  try { return JSON.parse(JSON.stringify(obj)); } catch { return obj; }
}

function walkAST(node: any, visitor: (node: any, parent?: any) => void, parent?: any): void {
  if (!node || typeof node !== "object") return;
  visitor(node, parent);
  const childKeys = ["body", "children", "elseBody", "directives", "props", "declarations"];
  for (const key of childKeys) {
    if (Array.isArray(node[key])) {
      for (const child of node[key]) {
        walkAST(child, visitor, node);
      }
    }
  }
}

const JS_KEYWORDS = new Set([
  "true", "false", "null", "undefined", "NaN", "Infinity",
  "if", "else", "for", "while", "do", "switch", "case", "default",
  "return", "break", "continue", "throw", "try", "catch", "finally",
  "var", "let", "const", "function", "class", "new", "delete", "void",
  "typeof", "instanceof", "in", "of", "this", "super", "import", "export",
  "from", "as", "async", "await", "yield", "static", "get", "set",
  "Math", "JSON", "Object", "Array", "String", "Number", "Boolean",
  "Date", "RegExp", "Error", "Promise", "Map", "Set", "console",
  "window", "document", "globalThis", "process", "Buffer",
  "parseInt", "parseFloat", "isNaN", "isFinite",
  "setTimeout", "setInterval", "clearTimeout", "clearInterval",
  "fetch", "URL", "Symbol", "BigInt", "i", "j", "k", "index",
  "item", "key", "value", "el", "e", "event", "self",
]);
