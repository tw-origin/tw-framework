/**
 * VDOM code generator -- optimized virtual DOM node creation.
 *
 * Generates JavaScript code that creates VDOM trees at runtime.
 * The generated code is designed to be:
 * - Compact (short property names)
 * - Fast (direct object creation, no virtual method calls)
 * - Hydration-friendly (can be diffed against server-rendered HTML)
 *
 * TW VDOM format (same as Phase 1 runtime, but generated at compile time):
 *   { t: "div", a: { class: "container" }, c: [
 *     { t: "h1", c: [ { t: "#text", v: "Hello" } ] }
 *   ]}
 *
 * Short keys:
 *   t = tag, a = attrs, c = children, v = text value,
 *   k = key (for keyed lists), e = events, b = bindings
 *
 * Why this is faster than React:
 * 1. No Fiber tree -- we use a flat object tree
 * 2. No reconciliation for initial render -- we generate the exact tree
 * 3. Keyed diff is O(n), not O(n?)
 * 4. No synthetic events -- direct addEventListener
 * 5. No refs or context complexity -- straightforward prop passing
 *
 * Generated code example:
 *   // From: <div class="card"><h1>{title}</h1><p>{desc}</p></div>
 *   // To:
 *   h("div", { class: "card" }, [
 *     h("h1", null, [ t(title) ]),
 *     h("p", null, [ t(desc) ])
 *   ])
 *
 * Where h() is the hyperscript helper and t() creates a text node.
 */

import type { Program, ASTNode } from "../ast/nodes";
import type { CodegenContext } from "./types";

// --- VDOM Code Builder -----------------------------------------------

/**
 * Builds JavaScript code that constructs VDOM trees.
 *
 * Uses a string builder pattern -- appends code fragments
 * and joins at the end. This avoids creating intermediate
 * AST objects for the generated code.
 */
export class VDOMCodeBuilder {
  private parts: string[] = [];
  private indent = 0;
  private varCounter = 0;
  private imports = new Set<string>();

  constructor(private ctx?: CodegenContext) {}

  /**
   * Generate VDOM creation code from an AST node.
   * Returns a JS expression string.
   */
  generateFromAST(node: ASTNode): string {
    return this.visitNode(node);
  }

  /**
   * Generate VDOM creation code from a full program.
   * Returns a complete JS module string.
   */
  generateModule(program: Program): string {
    const bodyNodes = program.body.filter(n => n.type !== "HeadDirective");
    const bodyExprs = bodyNodes.map(n => this.visitNode(n));

    // Collect state variables
    const stateVars: string[] = [];
    for (const dir of program.directives) {
      const d = dir  as unknown;
      if ((d as any).type === "StateDirective" && (d as any).declarations) {
        for (const decl of (d as any).declarations) {
          stateVars.push(`  let ${decl.name} = ${decl.value ?? "undefined"};`);
        }
      }
    }

    // Collect component definitions
    const components = this.extractComponents(program);

    // Build module
    const lines: string[] = [];

    // Header
    lines.push("// TW Framework -- Generated VDOM Module");
    lines.push("// This code is auto-generated. Do not edit.");
    lines.push("");

    // Imports
    if (this.imports.size > 0) {
      for (const imp of this.imports) {
        lines.push(imp);
      }
      lines.push("");
    }

    // State
    if (stateVars.length > 0) {
      lines.push("// State");
      lines.push(...stateVars);
      lines.push("");
    }

    // Components
    if (components.length > 0) {
      lines.push("// Components");
      for (const comp of components) {
        lines.push(comp);
        lines.push("");
      }
    }

    // Render function
    lines.push("// Render function -- returns VDOM tree");
    lines.push("export function render() {");
    lines.push("  return [");
    for (const expr of bodyExprs) {
      lines.push(`    ${expr},`);
    }
    lines.push("  ];");
    lines.push("}");

    return lines.join("\n");
  }

  // --- Node Visitors ------------------------------------------------

  private visitNode(node: ASTNode): string {
    if (!node) return "null";

    switch (node.type) {
      case "Element":      return this.visitElement(node  as any);
      case "Text":         return this.visitText(node  as any);
      case "Component":    return this.visitComponent(node  as any);
      case "If":           return this.visitIf(node  as any);
      case "For":          return this.visitFor(node  as any);
      case "While":        return this.visitWhile(node  as any);
      case "Fragment":     return this.visitFragment(node  as any);
      case "Slot":         return this.visitSlot(node  as any);
      case "Comment":      return this.visitComment(node  as any);
      case "ScriptBlock":  return "null"; // Scripts handled separately
      case "StyleBlock":   return "null"; // Styles handled separately
      case "Doctype":      return "null";
      default:             return "null";
    }
  }

  private visitElement(el: any): string {
    const tag = el.tag;
    const voidTags = ["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"];

    // Build attributes object
    let attrsCode = "null";
    const attrs: string[] = [];

    if (el.attrs && el.attrs.length > 0) {
      for (const attr of el.attrs) {
        if (attr.value === true) {
          attrs.push(`${JSON.stringify(attr.name)}: true`);
        } else if (attr.isInterpolated) {
          // Dynamic attribute -- generate expression
          const expr = this.interpolateToExpr(attr.value);
          attrs.push(`${JSON.stringify(attr.name)}: ${expr}`);
        } else {
          attrs.push(`${JSON.stringify(attr.name)}: ${JSON.stringify(attr.value)}`);
        }
      }
    }

    // Inline styles
    if (el.styles && el.styles.length > 0) {
      const styleParts = el.styles.map((s: any) => `${s.property}:${s.value}${s.important ? "!important" : ""}`);
      attrs.push(`"style": ${JSON.stringify(styleParts.join(";"))}`);
    }

    // Events -- generate as data attributes for hydration
    if (el.events && el.events.length > 0) {
      for (const ev of el.events) {
        attrs.push(`"data-tw-event-${ev.event}": ${JSON.stringify(ev.handler)}`);
      }
      if (this.ctx) { this.ctx.hasInteractivity = true; }
    }

    // Bindings
    if (el.bindings && el.bindings.length > 0) {
      for (const b of el.bindings) {
        attrs.push(`"data-tw-bind-${b.property}": ${JSON.stringify(b.expression)}`);
      }
      if (this.ctx) { this.ctx.hasInteractivity = true; }
    }

    if (attrs.length > 0) {
      attrsCode = `{ ${attrs.join(", ")} }`;
    }

    // Children
    let childrenCode = "[]";
    if (el.children && el.children.length > 0 && !voidTags.includes(tag.toLowerCase())) {
      const childExprs = el.children.map((c: any) => this.visitNode(c)).filter((c: string) => c !== "null");
      if (childExprs.length > 0) {
        childrenCode = `[${childExprs.join(", ")}]`;
      }
    }

    return `h(${JSON.stringify(tag)}, ${attrsCode}, ${childrenCode})`;
  }

  private visitText(node: any): string {
    if (node.isInterpolated) {
      const expr = this.interpolateToExpr(node.value);
      return `t(${expr})`;
    }
    return `t(${JSON.stringify(node.value)})`;
  }

  private visitComponent(comp: any): string {
    // Generate component call
    const propsCode: string[] = [];
    for (const prop of comp.props || []) {
      if (typeof prop.value === "string") {
        if (prop.isInterpolated) {
          propsCode.push(`${JSON.stringify(prop.name)}: ${this.interpolateToExpr(prop.value)}`);
        } else {
          propsCode.push(`${JSON.stringify(prop.name)}: ${JSON.stringify(prop.value)}`);
        }
      }
    }

    const childrenCode = comp.children?.map((c: any) => this.visitNode(c)).filter((c: string) => c !== "null") || [];
    const propsObj = propsCode.length > 0 ? `{ ${propsCode.join(", ")}, children: [${childrenCode.join(", ")}] }` : `{ children: [${childrenCode.join(", ")}] }`;

    return `${comp.name}(${propsObj})`;
  }

  private visitIf(node: any): string {
    const condExpr = this.conditionToExpr(node.condition);
    const bodyExprs = (node.body || []).map((c: any) => this.visitNode(c));
    const elseExprs = (node.elseBody || []).map((c: any) => this.visitNode(c));

    if (elseExprs.length > 0) {
      return `(${condExpr} ? [${bodyExprs.join(", ")}] : [${elseExprs.join(", ")}])`;
    }
    return `(${condExpr} ? [${bodyExprs.join(", ")}] : [])`;
  }

  private visitFor(node: any): string {
    const iterableExpr = this.interpolateToExpr(node.iterable);
    const varName = node.varName;
    const indexName = node.indexName || "_i";
    const bodyExprs = (node.body || []).map((c: any) => this.visitNode(c));

    return `(${iterableExpr} || []).map((${varName}, ${indexName}) => [${bodyExprs.join(", ")}]).flat()`;
  }

  private visitWhile(node: any): string {
    // while loops are rare in templates -- generate as IIFE
    const condExpr = this.conditionToExpr(node.condition);
    const bodyExprs = (node.body || []).map((c: any) => this.visitNode(c));
    return `(() => { const _r = []; let _s = 0; while (${condExpr} && _s < 10000) { _r.push(${bodyExprs.join(", ")}); _s++; } return _r; })()`;
  }

  private visitFragment(node: any): string {
    const childExprs = (node.children || []).map((c: any) => this.visitNode(c)).filter((c: string) => c !== "null");
    return `[${childExprs.join(", ")}]`;
  }

  private visitSlot(node: any): string {
    const fallbackExprs = (node.fallback || []).map((c: any) => this.visitNode(c));
    return `(__slots[${JSON.stringify(node.name)}] || [${fallbackExprs.join(", ")}])`;
  }

  private visitComment(node: any): string {
    return `c(${JSON.stringify(node.value)})`;
  }

  // --- Expression Conversion ----------------------------------------

  /**
   * Convert a TW interpolation string to a JS expression.
   * "{name}" -> "name"
   * "{count + 1}" -> "count + 1"
   * "Hello {name}!" -> "\"Hello \" + name + \"!\""
   */
  private interpolateToExpr(value: string): string {
    if (!value.includes("{")) return JSON.stringify(value);

    // Pure interpolation: "{expr}"
    const pureMatch = value.match(/^\{([^}]+)\}$/);
    if (pureMatch) {
      return pureMatch[1].trim();
    }

    // Mixed: "text {expr} more {expr2}"
    const parts: string[] = [];
    let remaining = value;
    let hasInterpolation = false;

    while (remaining.length > 0) {
      const start = remaining.indexOf("{");
      if (start === -1) {
        parts.push(JSON.stringify(remaining));
        break;
      }
      if (start > 0) {
        parts.push(JSON.stringify(remaining.substring(0, start)));
      }
      const end = remaining.indexOf("}", start);
      if (end === -1) {
        parts.push(JSON.stringify(remaining.substring(start)));
        break;
      }
      const expr = remaining.substring(start + 1, end).trim();
      parts.push(`String(${expr})`);
      hasInterpolation = true;
      remaining = remaining.substring(end + 1);
    }

    return parts.join(" + ");
  }

  /**
   * Convert a condition string to a JS expression.
   * "count > 0" -> "count > 0"
   * "{isLoggedIn}" -> "isLoggedIn"
   */
  private conditionToExpr(condition: string): string {
    return this.interpolateToExpr(condition);
  }

  // --- Component Extraction -----------------------------------------

  private extractComponents(program: Program): string[] {
    const components: string[] = [];

    for (const dir of program.directives) {
      const d = dir  as unknown;
      if ((d as any).type === "ComponentDirective" || (d as any).name === "component") {
        const name = (d as any).name === "component" ? (d as any).args?.[0]?.value : (d as any).name;
        const body = (d as any).body || [];
        const bodyExprs = body.map((n: any) => this.visitNode(n));

        components.push(
          `function ${name}(props) {\n` +
          `  return [${bodyExprs.join(", ")}];\n` +
          `}`
        );
      }
    }

    return components;
  }

  // --- Static VDOM Generation ----------------------------------------

  /**
   * Generate a static VDOM JSON object (for SSR).
   * This is NOT code -- it's the actual VDOM tree serialized.
   */
  generateStatic(program: Program): string {
    const bodyNodes = program.body.filter(n => n.type !== "HeadDirective");
    const vnodes = bodyNodes.map(n => this.toStaticVNode(n)).filter(Boolean);
    return JSON.stringify(vnodes);
  }

  private toStaticVNode(node: ASTNode): any {
    if (!node) return null;

    switch (node.type) {
      case "Element": {
        const el = node  as unknown;
        const attrs: Record<string, unknown> = {};
        for (const a of (el as any).attrs || []) {
          attrs[a.name] = a.isInterpolated
            ? interpolate(a.value, this.ctx?.stateVars ?? {})
            : a.value;
        }
        if ((el as any).styles?.length > 0) {
          attrs.style = (el as any).styles.map((s: any) => `${s.property}:${s.value}`).join(";");
        }
        return {
          t: (el as any).tag,
          a: attrs,
          c: ((el as any).children || []).map((c: any) => this.toStaticVNode(c)).filter(Boolean),
        };
      }
      case "Text":
        return {
          t: "#text",
          v: (node  as any).isInterpolated
            ? interpolate((node  as any).value, this.ctx?.stateVars ?? {})
            : (node  as any).value,
        };
      case "If": {
        const ifNode = node  as unknown;
        const condVal = interpolate((ifNode as any).condition, this.ctx?.stateVars ?? {});
        const isTrue = isTruthy(condVal);
        const body = isTrue ? (ifNode as any).body : ((ifNode as any).elseBody || []);
        return body.map((c: any) => this.toStaticVNode(c)).filter(Boolean);
      }
      case "For": {
        const forNode = node  as unknown;
        const items = parseIterable((forNode as any).iterable, this.ctx?.stateVars ?? {});
        const result: any[] = [];
        for (let i = 0; i < items.length; i++) {
          // Save current state vars so we can restore after each iteration
          const ctxVars = this.ctx?.stateVars;
          const savedVars = ctxVars ? { ...ctxVars } : {};
          if (ctxVars) {
            ctxVars[(forNode as any).varName] = String(items[i]);
            if ((forNode as any).indexName) ctxVars[(forNode as any).indexName] = String(i);
          }
          for (const child of (forNode as any).body || []) {
            const vn = this.toStaticVNode(child);
            if (vn) result.push(vn);
          }
          // Restore state vars
          if (this.ctx?.stateVars) {
            this.ctx.stateVars = savedVars;
          }
        }
        return result;
      }
      case "Fragment":
        return (node  as any).children?.map((c: any) => this.toStaticVNode(c)).filter(Boolean) || [];
      default:
        return null;
    }
  }
}

// --- Public API ------------------------------------------------------

/**
 * Generate optimized VDOM creation code from AST.
 */
export function generateVDOMCode(program: Program, ctx?: CodegenContext): string {
  const builder = new VDOMCodeBuilder(ctx);
  return builder.generateModule(program);
}

/**
 * Generate static VDOM JSON (for SSR).
 */
export function generateStaticVDOM(program: Program, ctx?: CodegenContext): string {
  const builder = new VDOMCodeBuilder(ctx);
  return builder.generateStatic(program);
}

/**
 * Generate a single VDOM expression from a node.
 */
export function generateNodeVDOM(node: ASTNode, ctx?: CodegenContext): string {
  const builder = new VDOMCodeBuilder(ctx);
  return builder.generateFromAST(node);
}

// --- Helpers --------------------------------------------------------

function interpolate(expr: string, vars: Record<string, string>): string {
  return expr.replace(/\{([^}]+)\}/g, (_, name) => {
    const key = name.trim();
    return vars[key] ?? "";
  });
}

function isTruthy(val: string): boolean {
  if (!val) return false;
  const lower = val.toLowerCase().trim();
  return lower !== "false" && lower !== "0" && lower !== "" && lower !== "null" && lower !== "undefined";
}

function parseIterable(expr: string, vars: Record<string, string>): any[] {
  try {
    const parsed = JSON.parse(expr);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* ignored */ }
  if (vars[expr]) {
    try {
      const parsed = JSON.parse(vars[expr]);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* ignored */ }
  }
  return [];
}
