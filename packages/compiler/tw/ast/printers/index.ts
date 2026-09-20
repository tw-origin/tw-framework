/**
 * AST Printers -- serialize AST to multiple formats:
 * pretty-print, minified, JSON, summary, DOT graph.
 */

import type {
  ASTNode, Program, ElementNode, ComponentNode, TextNode, IfNode,
  ForNode, WhileNode, SwitchNode, TryNode, ScriptBlock, StyleBlock,
  TwmBlock, CommentNode, FragmentNode, SlotNode, DirectiveNode,
  AttributeNode, StyleDecl, EventBinding, PropertyBinding, ElementDirective,
  ExpressionNode,
} from "../nodes";
import {
  isElement, isText, isComponent, isIfNode, isForNode, isWhileNode,
  isScriptBlock, isStyleBlock, isTwmBlock, isComment, isFragment,
  isSlot, isDirective,
} from "../nodes";

function safeJsonParse<T>(json: string, fallback: T): T {
  try { return JSON.parse(json) as T; }
  catch { return fallback; }
}

// --- Pretty Print ------------------------------------------------------------

export function printAST(node: ASTNode, indent: number = 0): string {
  const pad = "  ".repeat(indent);

  if (isElement(node)) {
    let out = `${pad}<${node.tag}`;

    // Attributes
    for (const attr of node.attrs) {
      if (attr.value === true || attr.isBoolean) {
        out += ` ${attr.name}`;
      } else {
        out += ` ${attr.name}="${attr.value}"`;
      }
    }

    // Styles
    if (node.styles.length > 0) {
      const styleStr = node.styles.map(s => `${s.property}: ${s.value}${s.important ? " !" : ""}`).join("; ");
      out += ` style="${styleStr}"`;
    }

    // Events
    for (const event of node.events) {
      out += ` on:${event.event}="${event.handler}"`;
    }

    // Bindings
    for (const binding of node.bindings) {
      out += ` :${binding.property}="${binding.expression}"`;
    }

    // Directives
    for (const dir of node.directives) {
      out += ` @${dir.kind}="${dir.value || dir.condition || dir.varName || ""}"`;
    }

    if (node.children.length === 0) {
      out += " />";
      return out;
    }

    out += ">\n";
    for (const child of node.children) {
      out += printAST(child, indent + 1) + "\n";
    }
    out += `${pad}</${node.tag}>`;
    return out;
  }

  if (isComponent(node)) {
    let out = `${pad}<${node.name}`;
    for (const prop of node.props) {
      out += ` ${prop.name}="${prop.value}"`;
    }
    if (node.children.length === 0) {
      out += " />";
      return out;
    }
    out += ">\n";
    for (const child of node.children) {
      out += printAST(child, indent + 1) + "\n";
    }
    out += `${pad}</${node.name}>`;
    return out;
  }

  if (isText(node)) {
    const preview = node.value.length > 60 ? node.value.slice(0, 57) + "..." : node.value;
    return `${pad}text: "${preview.replace(/\n/g, "\\n")}"`;
  }

  if (isIfNode(node)) {
    let out = `${pad}@if (${node.condition}) {\n`;
    for (const child of node.body) {
      out += printAST(child, indent + 1) + "\n";
    }
    out += `${pad}}`;
    if (node.elseBody.length > 0) {
      out += ` @else {\n`;
      for (const child of node.elseBody) {
        out += printAST(child, indent + 1) + "\n";
      }
      out += `${pad}}`;
    }
    return out;
  }

  if (isForNode(node)) {
    let out = `${pad}@for (${node.varName}${node.indexName ? `, ${node.indexName}` : ""} of ${node.iterable}) {\n`;
    for (const child of node.body) {
      out += printAST(child, indent + 1) + "\n";
    }
    out += `${pad}}`;
    return out;
  }

  if (isScriptBlock(node)) {
    return `${pad}<script${node.isModule ? ' type="module"' : ''}>${node.content.length > 80 ? node.content.slice(0, 77) + "..." : node.content}</script>`;
  }

  if (isStyleBlock(node)) {
    return `${pad}<style${node.scoped ? ' scoped' : ''}>${node.content.length > 80 ? node.content.slice(0, 77) + "..." : node.content}</style>`;
  }

  if (isTwmBlock(node)) {
    return `${pad}{% ${node.handler}(${node.method}) %}`;
  }

  if (isComment(node)) {
    return `${pad}<!-- ${node.value} -->`;
  }

  if (isFragment(node)) {
    let out = `${pad}<>\n`;
    for (const child of node.children) {
      out += printAST(child, indent + 1) + "\n";
    }
    out += `${pad}</>`;
    return out;
  }

  if (isSlot(node)) {
    return `${pad}<slot name="${node.name}" />`;
  }

  if (isDirective(node)) {
    return `${pad}#${node.type}: ${JSON.stringify((node as any).key || (node as any).name || (node as any).source || "")}`;
  }

  return `${pad}[${node.type}]`;
}

// --- JSON Serialization ------------------------------------------------------

export function toJSON(node: ASTNode, pretty: boolean = true): string {
  return JSON.stringify(node, (key, value) => {
    // Skip non-serializable fields
    if (key === "sourceLoc" || key === "leadingComments" || key === "trailingComments") {
      return;
    }
    return value;
  }, pretty ? 2 : 0);
}

export function fromJSON(json: string): ASTNode {
  return safeJsonParse(json, null);
}

// --- Summary ----------------------------------------------------------------

export function summary(program: Program): string {
  const lines: string[] = [];
  lines.push(`=== TW AST Summary ===`);
  lines.push(`File: ${program.filePath ?? "<anonymous>"}`);
  lines.push(`Body nodes: ${program.body.length}`);
  lines.push(`Directives: ${program.directives.length}`);

  // Count node types
  const counts: Record<string, number> = {};
  function count(node: ASTNode): void {
    counts[node.type] = (counts[node.type] || 0) + 1;
    const childKeys = ["body", "children", "elseBody", "directives", "props"];
    for (const key of childKeys) {
      const children = (node as any)[key];
      if (Array.isArray(children)) {
        for (const child of children) {
          if (child && typeof child.type === "string") count(child);
        }
      }
    }
  }
  for (const node of program.body) count(node);

  lines.push(`\nNode type counts:`);
  for (const [type, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${type}: ${count}`);
  }

  // Directives
  if (program.directives.length > 0) {
    lines.push(`\nDirectives:`);
    for (const dir of program.directives) {
      lines.push(`  ${dir.type}: ${(dir as any).key || (dir as any).name || (dir as any).source || ""}`);
    }
  }

  return lines.join("\n");
}

// --- Minified Print ----------------------------------------------------------

export function printMinified(node: ASTNode): string {
  if (isElement(node)) {
    let out = `<${node.tag}`;
    for (const attr of node.attrs) {
      if (attr.value === true) out += ` ${attr.name}`;
      else out += ` ${attr.name}="${attr.value}"`;
    }
    if (node.children.length === 0) return out + "/>";
    out += ">";
    for (const child of node.children) {
      out += printMinified(child);
    }
    return out + `</${node.tag}>`;
  }

  if (isText(node)) return node.value;

  if (isComponent(node)) {
    let out = `<${node.name}`;
    for (const prop of node.props) {
      out += ` ${prop.name}="${prop.value}"`;
    }
    if (node.children.length === 0) return out + "/>";
    out += ">";
    for (const child of node.children) {
      out += printMinified(child);
    }
    return out + `</${node.name}>`;
  }

  if (isIfNode(node)) {
    let out = "";
    for (const child of node.body) out += printMinified(child);
    for (const child of node.elseBody) out += printMinified(child);
    return out;
  }

  if (isForNode(node)) {
    let out = "";
    for (const child of node.body) out += printMinified(child);
    return out;
  }

  return "";
}

// --- DOT Graph Export --------------------------------------------------------

export function toDot(program: Program): string {
  const lines: string[] = ["digraph TW {", "  node [shape=box, fontname=monospace];", "  rankdir=TB;"];
  let id = 0;
  const nodeIds = new Map<ASTNode, string>();

  function getId(node: ASTNode): string {
    if (!nodeIds.has(node)) {
      const newId = `n${id++}`;
      nodeIds.set(node, newId);
    }
    return nodeIds.get(node)!;
  }

  function getLabel(node: ASTNode): string {
    if (isElement(node)) return `${node.tag}\\nattrs: ${node.attrs.length}`;
    if (isComponent(node)) return `${node.name}\\n(comp)`;
    if (isText(node)) return `"${node.value.slice(0, 20).replace(/\n/g, "\\\\n")}"`;
    if (isIfNode(node)) return `if: ${node.condition.slice(0, 20)}`;
    if (isForNode(node)) return `for: ${node.varName} in ${node.iterable.slice(0, 20)}`;
    if (isScriptBlock(node)) return "script";
    if (isStyleBlock(node)) return "style";
    return node.type;
  }

  function visit(node: ASTNode): void {
    const nodeId = getId(node);
    const label = getLabel(node);
    lines.push(`  ${nodeId} [label="${label}"];`);

    const childKeys = ["body", "children", "elseBody"];
    for (const key of childKeys) {
      const children = (node as any)[key];
      if (Array.isArray(children)) {
        for (const child of children) {
          if (child && typeof child.type === "string") {
            const childId = getId(child);
            lines.push(`  ${nodeId} -> ${childId};`);
            visit(child);
          }
        }
      }
    }
  }

  for (const node of program.body) visit(node);
  lines.push("}");
  return lines.join("\n");
}

// --- Tree Dump (for debugging) -------------------------------------------------

export function dumpTree(node: ASTNode, indent: number = 0): string {
  const pad = "| ".repeat(indent);
  const lines: string[] = [];

  let line = `${pad}?- ${node.type}`;

  if (isElement(node)) {
    line += ` <${node.tag}> attrs=[${node.attrs.map(a => a.name).join(",")}]`;
  } else if (isComponent(node)) {
    line += ` <${node.name}> props=[${node.props.map(p => p.name).join(",")}]`;
  } else if (isText(node)) {
    line += ` "${node.value.slice(0, 40).replace(/\n/g, "\\n")}"`;
  } else if (isIfNode(node)) {
    line += ` (${node.condition})`;
  } else if (isForNode(node)) {
    line += ` (${node.varName} in ${node.iterable})`;
  }

  lines.push(line);

  const childKeys = ["body", "children", "elseBody", "directives", "props"];
  for (const key of childKeys) {
    const children = (node as any)[key];
    if (Array.isArray(children)) {
      for (const child of children) {
        if (child && typeof child.type === "string") {
          lines.push(dumpTree(child, indent + 1));
        }
      }
    }
  }

  return lines.join("\n");
}
