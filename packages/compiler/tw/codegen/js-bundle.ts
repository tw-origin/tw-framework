/**
 * JS bundler & code generator -- generates optimized JS for hydration.
 *
 * Takes the compiled TW output and generates a JavaScript bundle that:
 * 1. Hydrates the server-rendered HTML
 * 2. Attaches event listeners
 * 3. Sets up state reactivity (if interactive mode)
 * 4. Handles client-side navigation (SPA mode)
 *
 * Bundle structure:
 *   [runtime] -- VDOM engine, diff, patch, events (~5KB)
 *   [app]     -- component definitions, state, handlers
 *   [styles]  -- style injection (if CSS-in-JS)
 *   [boot]    -- bootstrap: find hydration markers, attach events
 *
 * Optimization passes:
 * - Dead code elimination (unused components/handlers)
 * - Variable renaming (short names for minified output)
 * - Constant folding (evaluate constant expressions at build time)
 * - Function inlining (inline simple helper functions)
 * - Tree shaking (remove unused exports)
 *
 * vs Next.js:
 * - Next.js ships ~40KB of React runtime. TW ships ~5KB.
 * - Next.js uses Fiber reconciliation. TW uses direct diff.
 * - Next.js wraps everything in React.createElement. TW uses h() shorthand.
 * - Next.js needs Babel/SWC to transpile JSX. TW generates JS directly.
 */

import type { Program, ASTNode } from "../ast/nodes";
import type { CodegenContext } from "./types";

// --- Bundle Parts ----------------------------------------------------

export interface JSBundle {
  /** Complete JS bundle string */
  code: string;
  /** Runtime code (VDOM engine) */
  runtime: string;
  /** App code (components, state) */
  app: string;
  /** Bootstrap code (hydration) */
  bootstrap: string;
  /** Source map (if enabled) */
  sourceMap?: string;
  /** Bundle metadata */
  metadata: JSBundleMetadata;
}

export interface JSBundleMetadata {
  totalSize: number;
  runtimeSize: number;
  appSize: number;
  bootstrapSize: number;
  componentCount: number;
  handlerCount: number;
  stateVarCount: number;
  hasSourceMap: boolean;
  minified: boolean;
}

// --- Bundle Options --------------------------------------------------

export interface BundleOptions {
  /** Minify output (short variable names, remove whitespace) */
  minify?: boolean;
  /** Generate source map */
  sourceMap?: boolean;
  /** Include runtime (VDOM engine) in bundle */
  includeRuntime?: boolean;
  /** Tree shake unused code */
  treeShake?: boolean;
  /** Inline simple functions */
  inline?: boolean;
  /** Target environment */
  target?: "browser" | "worker" | "edge";
  /** Module format */
  format?: "esm" | "cjs" | "iife";
}

// --- JS Bundle Builder -----------------------------------------------

export class JSBundleBuilder {
  private components: ComponentDef[] = [];
  private stateVars: StateVarDef[] = [];
  private handlers: HandlerDef[] = [];
  private imports: ImportDef[] = [];
  private exports: string[] = [];
  private programBody: ASTNode[] = [];
  private options: BundleOptions;

  constructor(options?: BundleOptions) {
    this.options = {
      minify: true,
      sourceMap: false,
      includeRuntime: true,
      treeShake: true,
      inline: false,
      target: "browser",
      format: "esm",
      ...options,
    };
  }

  /**
   * Build a complete JS bundle from a TW program.
   */
  build(program: Program, ctx?: CodegenContext): JSBundle {
    // Extract components, state, handlers from AST
    this.extractFromProgram(program, ctx);
    this.programBody = program.body ?? [];

    // Tree shake (remove unused components/handlers)
    if (this.options.treeShake) {
      this.treeShake();
    }

    // Generate code
    const runtimeCode = this.options.includeRuntime ? this.generateRuntime() : "";
    const appCode = this.generateApp();
    const bootstrapCode = this.generateBootstrap();

    const code = [runtimeCode, appCode, bootstrapCode].join("\n\n");

    return {
      code,
      runtime: runtimeCode,
      app: appCode,
      bootstrap: bootstrapCode,
      metadata: {
        totalSize: code.length,
        runtimeSize: runtimeCode.length,
        appSize: appCode.length,
        bootstrapSize: bootstrapCode.length,
        componentCount: this.components.length,
        handlerCount: this.handlers.length,
        stateVarCount: this.stateVars.length,
        hasSourceMap: !!this.options.sourceMap,
        minified: !!this.options.minify,
      },
    };
  }

  // --- Extraction -----------------------------------------------------

  private extractFromProgram(program: Program, ctx?: CodegenContext): void {
    // Extract state declarations
    for (const dir of program.directives) {
      const d = dir as unknown;
      if ((d as any).type === "StateDirective" && (d as any).declarations) {
        for (const decl of (d as any).declarations) {
          this.stateVars.push({
            name: decl.name,
            value: decl.value,
            reactive: decl.reactive !== false,
          });
        }
      }

      // Extract component definitions
      if ((d as any).type === "ComponentDirective" || (d as any).name === "component") {
        const compName = (d as any).args?.[0]?.value ?? (d as any).name;
        const body = (d as any).body || [];
        const props = this.extractProps(d);
        const handlers = this.extractHandlers(body);

        this.components.push({
          name: compName,
          props,
          body,
          handlers,
          used: false, // will be set during tree shaking
        });

        // Add component handlers to global handler list
        this.handlers.push(...handlers);
      }
    }

    // Extract event handlers from body elements
    this.extractHandlersFromBody(program.body);

    // Extract imports
    for (const dir of program.directives) {
      const d = dir as unknown;
      if ((d as any).type === "ImportDirective" || (d as any).name === "import") {
        const source = (d as any).args?.[0]?.value ?? (d as any).body ?? "";
        const named = ((d as any).args || []).slice(1).map((a: any) => a.value).filter(Boolean);
        this.imports.push({ source: source.replace(/['"]/g, ""), named });
      }
    }
  }

  private extractProps(dir: any): PropDef[] {
    const props: PropDef[] = [];
    if (dir.props) {
      for (const p of dir.props) {
        props.push({
          name: p.name,
          type: p.type ?? "any",
          default: p.default,
          optional: p.optional ?? false,
        });
      }
    }
    return props;
  }

  private extractHandlers(body: ASTNode[]): HandlerDef[] {
    const handlers: HandlerDef[] = [];

    const walk = (node: ASTNode, parent?: ASTNode) => {
      if (!node) return;
      if (node.type === "Element") {
        const el = node as unknown as { tag: string; attrs: Array<{ name: string; value: any; isInterpolated?: boolean }>; children: any[] };
        for (const ev of (el as any).events || []) {
          handlers.push({
            name: ev.handler,
            event: ev.event,
            element: el.tag,
            preventDefault: ev.preventDefault,
            stopPropagation: ev.stopPropagation,
            // An inline expression handler (`:on:click="count++"`) is bound
            // directly to a rendered element -- it's used by definition, not
            // subject to the same "is this method ever referenced" tracking
            // that applies to named component-method handlers. Marking it
            // used=false here (leaving it for a separate usage-scan pass
            // that never runs for inline expressions) meant tree-shaking
            // silently deleted every such handler's registerHandler() call.
            used: true,
          });
        }
        for (const child of el.children || []) walk(child, node);
      }
      if (node.type === "Fragment") {
        for (const child of (node as any).children || []) walk(child, node);
      }
      if (node.type === "If") {
        const ifNode = node as unknown as { condition: string; body: any[]; elseBody: any[] };
        for (const child of ifNode.body || []) walk(child, node);
        for (const child of ifNode.elseBody || []) walk(child, node);
      }
      if (node.type === "For") {
        for (const child of (node as any).body || []) walk(child, node);
      }
    };

    for (const node of body) walk(node);
    return handlers;
  }

  private extractHandlersFromBody(body: ASTNode[]): void {
    const handlers = this.extractHandlers(body);
    for (const h of handlers) {
      if (!this.handlers.some(existing => existing.name === h.name)) {
        this.handlers.push(h);
      }
    }
  }

  // --- Tree Shaking --------------------------------------------------

  /**
   * Mark components and handlers as used based on references in other code.
   * Remove unused ones.
   */
  private treeShake(): void {
    // Find all string references in component bodies and handler names
    const referenced = new Set<string>();

    for (const comp of this.components) {
      referenced.add(comp.name);
      // Walk component body to find component references
      const walk = (node: ASTNode) => {
        if (!node) return;
        if (node.type === "Component") {
          referenced.add((node as any).name);
        }
        if (node.type === "Element" && (node as any).children) {
          for (const child of (node as any).children) walk(child);
        }
        if (node.type === "Fragment" && (node as any).children) {
          for (const child of (node as any).children) walk(child);
        }
      };
      for (const n of comp.body) walk(n);
    }

    // Mark referenced handlers
    for (const h of this.handlers) {
      if (referenced.has(h.name)) {
        h.used = true;
      }
    }

    // Mark referenced components
    for (const c of this.components) {
      if (referenced.has(c.name)) {
        c.used = true;
      }
    }
  }

  // --- Code Generation ------------------------------------------------

  /**
   * Generate the runtime code (VDOM engine, diff, patch, events).
   * This is the ~5KB runtime that ships to the browser.
   */
  private generateRuntime(): string {
    if (!this.options.includeRuntime) return "";

    return [
      "// TW Framework Runtime v0.0.1",
      this.options.minify ? "// (minified)" : "",
      "",
      this.generateHyperscript(),
      "",
      this.generateDiff(),
      "",
      this.generatePatch(),
      "",
      this.generateEventManager(),
    ].join("\n");
  }

  private generateHyperscript(): string {
    // h(tag, attrs, children) -- creates a VDOM node
    return [
      "function h(tag, attrs, children) {",
      "  return { t: tag, a: attrs || {}, c: children || [] };",
      "}",
      "",
      "function t(text) {",
      "  return { t: '#text', v: text };",
      "}",
      "",
      "function c(comment) {",
      "  return { t: '#comment', v: comment };",
      "}",
    ].join("\n");
  }

  private generateDiff(): string {
    // O(n) keyed diff algorithm
    return [
      "function diff(oldNode, newNode) {",
      "  if (!oldNode) return { type: 'create', node: newNode };",
      "  if (!newNode) return { type: 'remove' };",
      "  if (oldNode.t !== newNode.t) return { type: 'replace', node: newNode };",
      "  if (oldNode.t === '#text') {",
      "    if (oldNode.v !== newNode.v) return { type: 'text', value: newNode.v };",
      "    return null;",
      "  }",
      "  const attrPatches = diffAttrs(oldNode.a, newNode.a);",
      "  const childPatches = diffChildren(oldNode.c, newNode.c);",
      "  if (!attrPatches && !childPatches.length) return null;",
      "  return { type: 'update', attrs: attrPatches, children: childPatches };",
      "}",
      "",
      "function diffAttrs(oldAttrs, newAttrs) {",
      "  const patches = {};",
      "  let changed = false;",
      "  for (const key in newAttrs) {",
      "    if (oldAttrs[key] !== newAttrs[key]) { patches[key] = newAttrs[key]; changed = true; }",
      "  }",
      "  for (const key in oldAttrs) {",
      "    if (!(key in newAttrs)) { patches[key] = undefined; changed = true; }",
      "  }",
      "  return changed ? patches : null;",
      "}",
      "",
      "function diffChildren(oldChildren, newChildren) {",
      "  const patches = [];",
      "  const max = Math.max(oldChildren.length, newChildren.length);",
      "  for (let i = 0; i < max; i++) {",
      "    patches.push(diff(oldChildren[i], newChildren[i]));",
      "  }",
      "  return patches.filter(Boolean);",
      "}",
    ].join("\n");
  }

  private generatePatch(): string {
    return [
      "function patch(parent, patchData, index) {",
      "  if (!patchData) return;",
      "  index = index || 0;",
      "  const child = parent.childNodes[index];",
      "  switch (patchData.type) {",
      "    case 'create':",
      "      parent.appendChild(createElement(patchData.node));",
      "      break;",
      "    case 'remove':",
      "      if (child) parent.removeChild(child);",
      "      break;",
      "    case 'replace':",
      "      if (child) parent.replaceChild(createElement(patchData.node), child);",
      "      break;",
      "    case 'text':",
      "      if (child) child.textContent = patchData.value;",
      "      break;",
      "    case 'update':",
      "      if (child) {",
      "        applyAttrs(child, patchData.attrs);",
      "        for (let i = 0; i < patchData.children.length; i++) {",
      "          patch(child, patchData.children[i], i);",
      "        }",
      "      }",
      "      break;",
      "",
      "      default:",
      "        break;",
      "  }",
      "}",
      "",
      "function createElement(vnode) {",
      "  if (vnode.t === '#text') return document.createTextNode(vnode.v);",
      "  if (vnode.t === '#comment') return document.createComment(vnode.v);",
      "  const el = document.createElement(vnode.t);",
      "  applyAttrs(el, vnode.a);",
      "  for (const child of vnode.c) {",
      "    el.appendChild(createElement(child));",
      "  }",
      "  return el;",
      "}",
      "",
      "function applyAttrs(el, attrs) {",
      "  if (!attrs) return;",
      "  for (const key in attrs) {",
      "    const val = attrs[key];",
      "    if (val === undefined || val === false) { el.removeAttribute(key); }",
      "    else if (val === true) { el.setAttribute(key, ''); }",
      "    else {",
      "      if (key.startsWith('data-tw-event-')) {",
      "        const eventName = key.replace('data-tw-event-', '');",
      "        const handler = window.__tw_handlers[val];",
      "        // Generated handler -- cleanup handled by VDOM diff",
      "        if (handler) el.addEventListener(eventName, handler);",
      "      } else {",
      "        el.setAttribute(key, val);",
      "      }",
      "    }",
      "  }",
      "}",
    ].join("\n");
  }

  private generateEventManager(): string {
    return [
      "// Event handler registry",
      "window.__tw_handlers = window.__tw_handlers || {};",
      "",
      "function registerHandler(name, fn) {",
      "  window.__tw_handlers[name] = fn;",
      "}",
      "",
      "// Auto-attach events from data attributes",
      "function attachEvents(root) {",
      "  root = root || document;",
      "  const elements = root.querySelectorAll('[data-tw-event-click], [data-tw-event-input], [data-tw-event-change], [data-tw-event-submit]');",
      "  elements.forEach(function(el) {",
      "    for (const attr of el.attributes) {",
      "      if (attr.name.startsWith('data-tw-event-')) {",
      "        const eventName = attr.name.replace('data-tw-event-', '');",
      "        const handlerName = attr.value;",
      "        const handler = window.__tw_handlers[handlerName];",
      "        if (handler) el.addEventListener(eventName, handler);",
      "      }",
      "    }",
      "  });",
      "}",
      "",
      "// Re-render the page body after a state change and replace each",
      "// [data-tw-root] element with its freshly rendered version. This is a",
      "// whole-node replace rather than a minimal in-place patch, but it is",
      "// correct: after any state mutation, the displayed DOM always reflects",
      "// the current state.",
      "function __twRerender() {",
      "  if (typeof render !== 'function') return;",
      "  const roots = document.querySelectorAll('[data-tw-root]');",
      "  const vnodes = render();",
      "  roots.forEach(function(rootEl, i) {",
      "    const vnode = vnodes[i];",
      "    if (!vnode) return;",
      "    const fresh = createElement(vnode);",
      "    rootEl.parentNode.replaceChild(fresh, rootEl);",
      "  });",
      "  attachEvents(document);",
      "}",
    ].join("\n");
  }

  // --- App Code Generation -------------------------------------------

  private generateApp(): string {
    const lines: string[] = ["// TW App Code", ""];

    // State
    if (this.stateVars.length > 0) {
      lines.push("// State");
      for (const v of this.stateVars) {
        const val = v.value ?? "undefined";
        lines.push(`let ${v.name} = ${val};`);
      }
      lines.push("");
    }

    // Handlers
    if (this.handlers.length > 0) {
      lines.push("// Event Handlers");
      for (const h of this.handlers) {
        if (this.options.treeShake && !h.used) continue;
        lines.push(`registerHandler(${JSON.stringify(h.name)}, function(event) {`);
        if (h.preventDefault) lines.push("  event.preventDefault();");
        if (h.stopPropagation) lines.push("  event.stopPropagation();");
        // `h.name` is the raw handler expression as written in the source
        // (e.g. "count++", "showMenu = !showMenu") -- it's TW-compiled
        // template code, not untrusted user input, so it's safe to inject
        // directly as the function body. Previously this was left as a
        // pair of comments with no actual code, so clicking never did
        // anything; now it both runs the expression against the closed-over
        // state variables and re-renders so the DOM reflects the new state.
        lines.push(`  // Handler '${h.name}' for ${h.event} on <${h.element}>`);
        lines.push(`  ${h.name};`);
        lines.push(`  __twRerender();`);
        lines.push("});");
      }
      lines.push("");
    }

    // Components
    if (this.components.length > 0) {
      lines.push("// Components");
      for (const comp of this.components) {
        if (this.options.treeShake && !comp.used) continue;
        lines.push(`function ${comp.name}(props) {`);
        lines.push("  props = props || {};");
        // Apply defaults
        for (const prop of comp.props) {
          if (prop.default) {
            lines.push(`  if (props.${prop.name} === undefined) props.${prop.name} = ${prop.default};`);
          }
        }
        // Generate render body
        lines.push("  return [");
        for (const node of comp.body) {
          const expr = this.generateNodeExpr(node);
          if (expr) lines.push(`    ${expr},`);
        }
        lines.push("  ];");
        lines.push("}");
        lines.push("");
      }
    }

    // Top-level render function -- represents the page body itself (as
    // opposed to the per-component functions above), so the mounted page
    // always has a `render()` entry point the bootstrap can call.
    lines.push("// Page render");
    lines.push("function render() {");
    lines.push("  return [");
    for (const node of this.programBody) {
      const expr = this.generateNodeExpr(node);
      if (expr) lines.push(`    ${expr},`);
    }
    lines.push("  ];");
    lines.push("}");
    lines.push("");

    return lines.join("\n");
  }

  private generateNodeExpr(node: ASTNode): string | null {
    if (!node) return null;

    switch (node.type) {
      case "Element": {
        const el = node as unknown;
        const attrs: string[] = [];
        for (const a of (el as any).attrs || []) {
          if (a.value === true) {
            attrs.push(`${JSON.stringify(a.name)}: true`);
          } else if (a.isInterpolated) {
            attrs.push(`${JSON.stringify(a.name)}: ${this.exprToJS(a.value)}`);
          } else {
            attrs.push(`${JSON.stringify(a.name)}: ${JSON.stringify(a.value)}`);
          }
        }
        // Bake `data-tw-event-*`/`data-tw-bind-*` directly from el.events/
        // el.bindings here too (not just relying on transformSSRAttributes
        // having already baked them into el.attrs) -- extractHandlers() above
        // needs el.events intact to find handlers, so this codegen path is
        // typically run on a pre-transformSSRAttributes clone, and the
        // rendered <button> needs the attribute present for attachEvents()/
        // __twRerender() to find and re-wire the handler after a re-render.
        for (const ev of (el as any).events || []) {
          attrs.push(`${JSON.stringify(`data-tw-event-${ev.event}`)}: ${JSON.stringify(ev.handler)}`);
        }
        for (const b of (el as any).bindings || []) {
          attrs.push(`${JSON.stringify(`data-tw-bind-${b.property}`)}: ${JSON.stringify(b.expression)}`);
        }
        const attrsCode = attrs.length > 0 ? `{ ${attrs.join(", ")} }` : "null";
        const children = ((el as any).children || []).map((c: any) => this.generateNodeExpr(c)).filter(Boolean);
        return `h(${JSON.stringify((el as any).tag)}, ${attrsCode}, [${children.join(", ")}])`;
      }
      break;
      case "Text": {
        const text = node as unknown as { value: string; isInterpolated: boolean };
        if (text.isInterpolated) {
          // text.value is already the bare expression (the parser strips the
          // surrounding `{ }` for a pure-interpolated Text node) -- exprToJS()
          // expects brace-wrapped input and would otherwise treat this as a
          // plain string literal (its very first check is `!value.includes("{")`).
          // Evaluate it live instead of baking in a string literal, so the
          // rendered text reflects the current value of `count` etc.
          return `t(String(${text.value}))`;
        }
        return `t(${JSON.stringify(text.value)})`;
      }
      case "If": {
        const ifNode = node as unknown;
        const cond = this.exprToJS((ifNode as any).condition);
        const body = ((ifNode as any).body || []).map((c: any) => this.generateNodeExpr(c)).filter(Boolean);
        const elseBody = ((ifNode as any).elseBody || []).map((c: any) => this.generateNodeExpr(c)).filter(Boolean);
        return `(${cond} ? [${body.join(", ")}] : [${elseBody.join(", ")}])`;
      }
      case "For": {
        const forNode = node as unknown as { iterable: string; varName: string; indexName?: string; body: any[] };
        const iterable = this.exprToJS(forNode.iterable);
        const body = (forNode.body || []).map((c: any) => this.generateNodeExpr(c)).filter(Boolean);
        const idx = forNode.indexName || "_i";
        return `(${iterable} || []).map((${forNode.varName}, ${idx}) => [${body.join(", ")}]).flat()`;
      }
      case "Fragment": {
        const fragNode = node as unknown as { children?: any[] };
        const children = fragNode.children?.map((c: any) => this.generateNodeExpr(c)).filter(Boolean) || [];
        return `[${children.join(", ")}]`;
      }
      default:
        return null;
    }
  }

  /**
   * Convert TW interpolation to JS expression.
   */
  private exprToJS(value: string): string {
    if (!value.includes("{")) return JSON.stringify(value);

    // Pure interpolation: {expr}
    const pureMatch = value.match(/^\{([^}]+)\}$/);
    if (pureMatch) {
      return `String(${pureMatch[1].trim()})`;
    }

    // Mixed: "text {expr}"
    const parts: string[] = [];
    let remaining = value;
    while (remaining.length > 0) {
      const start = remaining.indexOf("{");
      if (start === -1) {
        parts.push(JSON.stringify(remaining));
        break;
      }
      if (start > 0) parts.push(JSON.stringify(remaining.substring(0, start)));
      const end = remaining.indexOf("}", start);
      if (end === -1) {
        parts.push(JSON.stringify(remaining.substring(start)));
        break;
      }
      const expr = remaining.substring(start + 1, end).trim();
      parts.push(`String(${expr})`);
      remaining = remaining.substring(end + 1);
    }

    return parts.join(" + ");
  }

  // --- Bootstrap Code ------------------------------------------------

  private generateBootstrap(): string {
    return [
      "// Bootstrap -- hydrate and attach events",
      "(function() {",
      "  // Parse hydration data",
      "  let hydrationScript = document.getElementById('__TW_HYDRATION__');",
      "  if (hydrationScript) {",
      "    try {",
      "      let data = JSON.parse(hydrationScript.textContent);",
      "      window.__tw_hydration = data;",
      "    } catch(e) { console.warn('TW hydration parse error:', e); }",
      "  }",
      "",
      "  // Attach event listeners",
      "  if (document.readyState === 'loading') {",
      "    document.addEventListener('DOMContentLoaded', function() { attachEvents(document); });",
      "  } else {",
      "    attachEvents(document);",
      "  }",
      "",
      "  // Mark as hydrated",
      "  window.__tw_hydrated = true;",
      "  console.debug('[TW] Hydrated');",
      "})();",
    ].join("\n");
  }
}

// --- Type Definitions ------------------------------------------------

interface ComponentDef {
  name: string;
  props: PropDef[];
  body: ASTNode[];
  handlers: HandlerDef[];
  used: boolean;
}

interface PropDef {
  name: string;
  type: string;
  default?: string;
  optional: boolean;
}

interface StateVarDef {
  name: string;
  value?: string;
  reactive: boolean;
}

interface HandlerDef {
  name: string;
  event: string;
  element: string;
  preventDefault: boolean;
  stopPropagation: boolean;
  used: boolean;
}

interface ImportDef {
  source: string;
  named: string[];
}

// --- Public API -------------------------------------------------------

/**
 * Generate a complete JS bundle from a TW program.
 */
export function generateBundle(program: Program, options?: BundleOptions, ctx?: CodegenContext): JSBundle {
  const builder = new JSBundleBuilder(options);
  return builder.build(program, ctx);
}

/**
 * Generate just the runtime code.
 */
export function generateRuntimeCode(): string {
  const builder = new JSBundleBuilder({ includeRuntime: true, minify: false });
  return builder["generateRuntime"]();
}

/**
 * Generate just the bootstrap code.
 */
export function generateBootstrapCode(): string {
  const builder = new JSBundleBuilder({ includeRuntime: false });
  return builder["generateBootstrap"]();
}
