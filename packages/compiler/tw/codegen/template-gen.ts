/**
 * Template literal generator -- generates optimized JS template functions.
 *
 * Converts TW AST nodes into executable JavaScript template functions
 * that produce HTML strings. This is used for:
 * - Static site generation (SSG)
 * - Server-side rendering (SSR) without VDOM
 * - Email templates
 * - Static HTML extraction
 *
 * Generated code uses tagged template literals for performance:
 *
 *   // From: <div class="card"><h1>{title}</h1><p>{desc}</p></div>
 *   // To:
 *   function render(data) {
 *     return `<div class="card"><h1>${data.title}</h1><p>${data.desc}</p></div>`;
 *   }
 *
 * Why template literals over h() calls:
 * - V8 optimizes template literals extremely well (hidden classes)
 * - No function call overhead for each node
 * - No intermediate objects (VNode trees)
 * - String concatenation is faster than object creation
 *
 * For dynamic content (loops, conditionals), we generate .map() and
 * ternary expressions embedded in the template literal:
 *
 *   // From: <ul>{items.map(item => <li>{item.name}</li>)}</ul>
 *   // To:
 *   function render(data) {
 *     return `<ul>${data.items.map(item => `<li>${item.name}</li>`).join('')}</ul>`;
 *   }
 */

import type { Program, ASTNode } from "../ast/nodes";
import type { CodegenContext } from "./types";

// --- Template Builder ------------------------------------------------

export class TemplateBuilder {
  private parts: string[] = [];
  private dataVar: string;
  private indent = 0;
  private helpers = new Set<string>();

  constructor(dataVar = "data", private ctx?: CodegenContext) {
    this.dataVar = dataVar;
  }

  /**
   * Generate a template function from a program.
   * Returns: `function render(data) { return \`...\`; }`
   */
  generate(program: Program): string {
    const bodyNodes = program.body.filter(n => n.type !== "HeadDirective" && n.type !== "StyleBlock");

    // Build template content
    const content = bodyNodes.map(n => this.visitNode(n)).join("");

    // Build the function
    const lines: string[] = [];

    // Helper functions
    if (this.helpers.size > 0) {
      lines.push("// Helpers");
      for (const helper of this.helpers) {
        lines.push(helper);
      }
      lines.push("");
    }

    // Main render function
    lines.push(`function render(${this.dataVar}) {`);
    lines.push(`  return \`${content}\`;`);
    lines.push("}");

    return lines.join("\n");
  }

  /**
   * Generate an arrow function version.
   */
  generateArrow(program: Program): string {
    const bodyNodes = program.body.filter(n => n.type !== "HeadDirective" && n.type !== "StyleBlock");
    const content = bodyNodes.map(n => this.visitNode(n)).join("");

    return `(${this.dataVar}) => \`${content}\`;`;
  }

  /**
   * Generate multiple named template functions.
   */
  generateNamed(program: Program, name: string): string {
    const bodyNodes = program.body.filter(n => n.type !== "HeadDirective" && n.type !== "StyleBlock");
    const content = bodyNodes.map(n => this.visitNode(n)).join("");

    return `const ${name} = (${this.dataVar}) => \`${content}\`;`;
  }

  // --- Node Visitors ------------------------------------------------

  private visitNode(node: ASTNode): string {
    if (!node) return "";

    switch (node.type) {
      case "Element":      return this.visitElement(node  as any);
      case "Text":         return this.visitText(node  as any);
      case "Component":    return this.visitComponent(node  as any);
      case "If":           return this.visitIf(node  as any);
      case "For":          return this.visitFor(node  as any);
      case "While":        return this.visitWhile(node  as any);
      case "Fragment":     return this.visitFragment(node  as any);
      case "Comment":      return this.visitComment(node  as any);
      case "Slot":         return this.visitSlot(node  as any);
      case "ScriptBlock":  return this.visitScript(node  as any);
      case "StyleBlock":   return ""; // Handled separately
      case "Doctype":      return "<!DOCTYPE html>";
      default:             return "";
    }
  }

  private visitElement(el: any): string {
    const tag = el.tag;
    const voidTags = ["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"];

    // Build attributes
    let attrStr = "";
    if (el.attrs && el.attrs.length > 0) {
      const attrParts = el.attrs.map((a: any) => {
        if (a.value === true) return a.name;
        if (a.isInterpolated) {
          return `${a.name}="\${${this.exprToJS(a.value)}}"`;
        }
        return `${a.name}="${a.value}"`;
      });
      attrStr = " " + attrParts.join(" ");
    }

    // Inline styles
    if (el.styles && el.styles.length > 0) {
      const styleStr = el.styles.map((s: any) => `${s.property}:${s.value}${s.important ? "!important" : ""}`).join(";");
      attrStr += ` style="${styleStr}"`;
    }

    // Events
    if (el.events && el.events.length > 0) {
      for (const ev of el.events) {
        attrStr += ` data-tw-event-${ev.event}="${ev.handler}"`;
      }
    }

    // Bindings
    if (el.bindings && el.bindings.length > 0) {
      for (const b of el.bindings) {
        attrStr += ` data-tw-bind-${b.property}="${b.expression}"`;
      }
    }

    if (voidTags.includes(tag.toLowerCase())) {
      return `<${tag}${attrStr}>`;
    }

    // Children
    let childrenStr = "";
    if (el.children) {
      childrenStr = el.children.map((c: any) => this.visitNode(c)).join("");
    }

    return `<${tag}${attrStr}>${childrenStr}</${tag}>`;
  }

  private visitText(node: any): string {
    if (node.isInterpolated) {
      return `\${${this.exprToJS(node.value)}}`;
    }
    return this.escapeTemplateLiteral(node.value);
  }

  private visitComponent(comp: any): string {
    // Components are rendered as function calls
    const propsCode = (comp.props || []).map((p: any) => {
      const val = p.isInterpolated ? this.exprToJS(p.value) : JSON.stringify(p.value);
      return `${p.name}: ${val}`;
    }).join(", ");

    const childrenCode = (comp.children || []).map((c: any) => this.visitNode(c)).join("");

    return `\${${comp.name}({ ${propsCode} })}${childrenCode}`;
  }

  private visitIf(node: any): string {
    const condExpr = this.exprToJS(node.condition);
    const bodyStr = (node.body || []).map((c: any) => this.visitNode(c)).join("");
    const elseStr = (node.elseBody || []).map((c: any) => this.visitNode(c)).join("");

    return `\${${condExpr} ? \`${bodyStr}\` : \`${elseStr}\`}`;
  }

  private visitFor(node: any): string {
    const iterableExpr = this.exprToJS(node.iterable);
    const varName = node.varName;
    const indexName = node.indexName || "_i";
    const bodyStr = (node.body || []).map((c: any) => this.visitNode(c)).join("");

    return `\${(${iterableExpr} || []).map((${varName}, ${indexName}) => \`${bodyStr}\`).join('')}`;
  }

  private visitWhile(node: any): string {
    const condExpr = this.exprToJS(node.condition);
    const bodyStr = (node.body || []).map((c: any) => this.visitNode(c)).join("");

    // While loop as IIFE
    return `\${(() => { let _r = ''; while (${condExpr}) { _r += \`${bodyStr}\`; } return _r; })()}`;
  }

  private visitFragment(node: any): string {
    return (node.children || []).map((c: any) => this.visitNode(c)).join("");
  }

  private visitComment(node: any): string {
    return `<!-- ${node.value} -->`;
  }

  private visitSlot(node: any): string {
    const fallback = (node.fallback || []).map((c: any) => this.visitNode(c)).join("");
    return `\${__slots[${JSON.stringify(node.name)}] || \`${fallback}\`}`;
  }

  private visitScript(node: any): string {
    if (node.src) {
      let attrs = `src="${node.src}"`;
      if (node.isModule) attrs += ' type="module"';
      if (node.isAsync) attrs += " async";
      if (node.isDeferred) attrs += " defer";
      return `<script ${attrs}></script>`;
    }
    return `<script>${node.content}</script>`;
  }

  // --- Expression Conversion ----------------------------------------

  /**
   * Convert TW interpolation to JS expression inside template literal.
   * "{name}" -> "data.name"
   * "{count + 1}" -> "data.count + 1"
   * "Hello {name}!" -> "`Hello ${data.name}!`" -- but we're already in a
   * template literal, so: "Hello ${data.name}!"
   */
  private exprToJS(value: string): string {
    if (!value.includes("{")) return JSON.stringify(value);

    // Pure interpolation: {expr}
    const pureMatch = value.match(/^\{([^}]+)\}$/);
    if (pureMatch) {
      const expr = pureMatch[1].trim();
      return this.resolveExpr(expr);
    }

    // Mixed: "text {expr} more {expr2}"
    const parts: string[] = [];
    let remaining = value;

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
      parts.push(`String(${this.resolveExpr(expr)})`);
      remaining = remaining.substring(end + 1);
    }

    return parts.join(" + ");
  }

  /**
   * Resolve a variable reference to the data object.
   * "name" -> "data.name"
   * "user.name" -> "data.user.name"
   * "count + 1" -> "data.count + 1"
   * "items.map(i => i.name)" -> "data.items.map(i => i.name)"
   */
  private resolveExpr(expr: string): string {
    const trimmed = expr.trim();

    // Replace bare identifiers with data.xxx
    // But keep function calls and operators intact
    return trimmed.replace(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g, (match, name) => {
      // Don't replace JS keywords and builtins
      const reserved = new Set([
        "true", "false", "null", "undefined", "NaN", "Infinity",
        "if", "else", "for", "while", "return", "function",
        "var", "let", "const", "typeof", "instanceof", "in",
        "new", "delete", "void", "this", "arguments",
        "Math", "JSON", "Object", "Array", "String", "Number",
        "Boolean", "Date", "RegExp", "Error", "Promise",
        "console", "window", "document", "globalThis",
        "i", "j", "k", "index", "item", "key", "value",
        "map", "filter", "reduce", "forEach", "find", "some", "every",
        "join", "split", "push", "pop", "shift", "unshift",
        "slice", "splice", "concat", "reverse", "sort",
        "length", "prototype", "constructor",
        "parseInt", "parseFloat", "isNaN", "isFinite",
      ]);

      if (reserved.has(name)) return match;
      return `${this.dataVar}.${name}`;
    });
  }

  /**
   * Escape special characters in template literals.
   */
  private escapeTemplateLiteral(str: string): string {
    return str
      .replace(/\\/g, "\\\\")
      .replace(/`/g, "\\`")
      .replace(/\$\{/g, "\\${");
  }
}

// --- Static HTML Generator --------------------------------------------

/**
 * Generate static HTML from AST (for SSG).
 * This produces a plain HTML string with no JS -- for fully static pages.
 */
export function generateStaticHTML(program: Program, ctx?: CodegenContext): string {
  const builder = new TemplateBuilder("data", ctx);
  const templateFn = builder.generate(program);

  // In real usage, this function would be evaluated
  // For now, return the template function source
  return templateFn;
}

/**
 * Generate a template function string.
 */
export function generateTemplateFunction(program: Program, dataVar = "data", ctx?: CodegenContext): string {
  const builder = new TemplateBuilder(dataVar, ctx);
  return builder.generate(program);
}

/**
 * Generate an arrow function template.
 */
export function generateArrowTemplate(program: Program, dataVar = "data", ctx?: CodegenContext): string {
  const builder = new TemplateBuilder(dataVar, ctx);
  return builder.generateArrow(program);
}

/**
 * Generate multiple named templates (for partials).
 */
export function generatePartials(partials: Array<{ name: string; program: Program }>, ctx?: CodegenContext): string {
  const lines: string[] = ["// TW Template Partials", ""];

  for (const partial of partials) {
    const builder = new TemplateBuilder("data", ctx);
    lines.push(builder.generateNamed(partial.program, partial.name));
    lines.push("");
  }

  return lines.join("\n");
}
