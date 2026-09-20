import type {
  Program,
  ASTNode,
  ElementNode,
  TextNode,
  IfNode,
  ForNode,
  ComponentNode,
  ScriptBlock,
  StyleBlock,
  TwmBlock,
  AttributeNode,
  StyleDecl,
  EventBinding,
  PropertyBinding,
  ElementDirective,
  HeadDirective,
  BodyDirective,
  SectionDirective,
  StateDirective,
  ImportDirective,
  PageDirective,
} from "../ast/nodes";

function deepClone<T>(obj: T): T {
  if (typeof structuredClone !== "undefined") {
    try { return structuredClone(obj); }
    catch { /* fall through */ }
  }
  try { return JSON.parse(JSON.stringify(obj)); }
  catch { return obj; }
}

/**
 * Transform passes -- modify the AST between parse and codegen.
 * Each transform takes an AST and returns a new, modified AST.
 */

// --- Transform: Scoped Styles ---------------------------------------------------

export function transformScopedStyles(program: Program, scopeId: string): Program {
  const result = deepClone(program) as Program;

  function visit(node: any): void {
    if (!node || typeof node !== "object") return;

    if (node.type === "StyleBlock") {
      const scoped = addScopeToSelector(node.content, scopeId);
      node.content = scoped;
    }

    if (node.type === "Element") {
      // Add data attribute for scoping
      if (!node.attrs) node.attrs = [];
      const hasScope = node.attrs.some((a: any) => a.name === "data-tw-scope");
      if (!hasScope) {
        node.attrs.push({
          type: "Attribute",
          name: "data-tw-scope",
          value: scopeId,
          isInterpolated: false,
          line: node.line,
          col: node.col,
        });
      }
    }

    const childKeys = ["body", "children", "elseBody", "directives", "props"];
    for (const key of childKeys) {
      if (Array.isArray(node[key])) {
        for (const child of node[key]) {
          visit(child);
        }
      }
    }
  }

  for (const node of result.body) {
    visit(node);
  }

  return result;
}

function addScopeToSelector(css: string, scopeId: string): string {
  return css.replace(/([.#]?[\w-]+)\s*\{/g, `$1[data-tw-scope="${scopeId}"] {`);
}

// --- Transform: SSR Attribute Extraction ----------------------------------------

export function transformSSRAttributes(program: Program): Program {
  const result = deepClone(program) as Program;

  function visit(node: any): void {
    if (!node || typeof node !== "object") return;

    if (node.type === "Element") {
      // Convert event bindings to data- attributes for SSR
      for (const event of node.events || []) {
        if (event.preventDefault) {
          node.attrs.push({
            type: "Attribute",
            name: `data-tw-event-${event.event}-prevent`,
            value: "true",
            isInterpolated: false,
            line: event.line,
            col: event.col,
          });
        }
        if (event.stopPropagation) {
          node.attrs.push({
            type: "Attribute",
            name: `data-tw-event-${event.event}-stop`,
            value: "true",
            isInterpolated: false,
            line: event.line,
            col: event.col,
          });
        }
        node.attrs.push({
          type: "Attribute",
          name: `data-tw-event-${event.event}`,
          value: event.handler,
          isInterpolated: false,
          line: event.line,
          col: event.col,
        });
      }

      // Convert bindings to data- attributes
      for (const binding of node.bindings || []) {
        if (binding.property === "value") {
          node.attrs.push({
            type: "Attribute",
            name: "data-tw-model",
            value: binding.expression,
            isInterpolated: false,
            line: binding.line,
            col: binding.col,
          });
        }
        node.attrs.push({
          type: "Attribute",
          name: `data-tw-bind-${binding.property}`,
          value: binding.expression,
          isInterpolated: true,
          line: binding.line,
          col: binding.col,
        });
      }

      // Convert directives to data- attributes
      for (const dir of node.directives || []) {
        const attrName = `data-tw-${dir.kind}`;
        node.attrs.push({
          type: "Attribute",
          name: attrName,
          value: dir.value || dir.condition || "",
          isInterpolated: true,
          line: dir.line,
          col: dir.col,
        });
      }

      // Clear the original events/bindings arrays now that they've been
      // baked into `attrs` above -- otherwise html.ts's codegen (which reads
      // `events`/`bindings` independently, not `attrs`) renders the same
      // data-tw-event-*/data-tw-bind-* attribute a second time.
      node.events = [];
      node.bindings = [];
    }

    const childKeys = ["body", "children", "elseBody"];
    for (const key of childKeys) {
      if (Array.isArray(node[key])) {
        for (const child of node[key]) {
          visit(child);
        }
      }
    }
  }

  for (const node of result.body) {
    visit(node);
  }

  return result;
}

// --- Transform: Component Inlining -----------------------------------------------

export function transformInlineComponents(program: Program, componentRegistry: Map<string, Program>): Program {
  const result = deepClone(program) as Program;

  function visit(node: any): any {
    if (!node || typeof node !== "object") return node;

    if (node.type === "Component" && componentRegistry.has(node.name)) {
      const compAST = componentRegistry.get(node.name)!;
      const compBody = deepClone(compAST.body);

      // Map props to state vars
      const propVars: Record<string, string> = {};
      for (const prop of node.props || []) {
        if (typeof prop.value === "string") {
          propVars[prop.name] = prop.value;
        }
      }

      // Inline component body
      const inlined = compBody.map((child: any) => {
        const cloned = deepClone(child);
        substituteProps(cloned, propVars);
        return cloned;
      });

      // If component has children, find slot and replace
      if (node.children && node.children.length > 0) {
        for (const child of inlined) {
          replaceSlots(child, node.children);
        }
      }

      return inlined;
    }

    // Recurse
    const childKeys = ["body", "children", "elseBody"];
    for (const key of childKeys) {
      if (Array.isArray(node[key])) {
        const newChildren: any[] = [];
        for (const child of node[key]) {
          const result = visit(child);
          if (Array.isArray(result)) {
            newChildren.push(...result);
          } else if (result) {
            newChildren.push(result);
          }
        }
        node[key] = newChildren;
      }
    }

    return node;
  }

  result.body = result.body.map(visit).flat().filter(Boolean) as ASTNode[];
  return result;
}

function substituteProps(node: any, propVars: Record<string, string>): void {
  if (!node || typeof node !== "object") return;

  if (node.type === "Text" && node.isInterpolated) {
    for (const [key, val] of Object.entries(propVars)) {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      node.value = node.value.replace(new RegExp(`\\{${escapedKey}\\}`, "g"), val);
    }
  }

  if (node.type === "Attribute" && typeof node.value === "string") {
    for (const [key, val] of Object.entries(propVars)) {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      node.value = node.value.replace(new RegExp(`\\{${escapedKey}\\}`, "g"), val);
    }
  }

  const childKeys = ["body", "children", "elseBody", "attrs", "props", "styles"];
  for (const key of childKeys) {
    if (Array.isArray(node[key])) {
      for (const child of node[key]) {
        substituteProps(child, propVars);
      }
    }
  }
}

function replaceSlots(node: any, slotChildren: ASTNode[]): void {
  if (!node || typeof node !== "object") return;

  if (node.type === "Element" && node.tag === "slot") {
    node.type = "Fragment";
    node.children = deepClone(slotChildren);
    return;
  }

  const childKeys = ["body", "children", "elseBody"];
  for (const key of childKeys) {
    if (Array.isArray(node[key])) {
      for (const child of node[key]) {
        replaceSlots(child, slotChildren);
      }
    }
  }
}

// --- Transform: VDOM Detection & Marking ----------------------------------------

export function transformMarkVDOM(program: Program): { program: Program; needsVdom: boolean } {
  const result = deepClone(program) as Program;
  let needsVdom = false;

  function visit(node: any): void {
    if (!node || typeof node !== "object") return;

    if (node.type === "StateDirective" && node.declarations?.length > 0) {
      needsVdom = true;
    }

    if (node.type === "Element") {
      if ((node.events && node.events.length > 0) ||
          (node.bindings && node.bindings.length > 0) ||
          (node.directives && node.directives.some((d: any) => ["if", "for", "show", "text"].includes(d.kind)))) {
        needsVdom = true;
      }
    }

    const childKeys = ["body", "children", "elseBody", "directives", "props"];
    for (const key of childKeys) {
      if (Array.isArray(node[key])) {
        for (const child of node[key]) {
          visit(child);
        }
      }
    }
  }

  for (const node of result.body) {
    visit(node);
  }

  // If VDOM is needed, add the root marker
  if (needsVdom) {
    // Mark the first element as VDOM root
    for (const node of result.body) {
      if ((node as any).type === "Element") {
        (node as any).attrs = (node as any).attrs || [];
        (node as any).attrs.push({
          type: "Attribute",
          name: "data-tw-root",
          value: "true",
          isInterpolated: false,
          line: (node as any).line,
          col: (node as any).col,
        });
        break;
      }
    }
  }

  return { program: result, needsVdom };
}

// --- Transform: Responsive Style Extraction -------------------------------------

export function transformResponsiveStyles(program: Program): { program: Program; responsiveCSS: string } {
  const result = deepClone(program) as Program;
  const mediaQueries: string[] = [];

  function visit(node: any): void {
    if (!node || typeof node !== "object") return;

    if (node.type === "Element" && node.styles) {
      const remaining: StyleDecl[] = [];
      for (const style of node.styles) {
        if (style.isResponsive && style.breakpoint) {
          // Extract to media query
          const selector = `[data-tw-scope] ${node.tag}`;
          mediaQueries.push(`@media (${style.breakpoint}) { ${selector} { ${style.property}: ${style.value}; } }`);
        } else {
          remaining.push(style);
        }
      }
      node.styles = remaining;
    }

    const childKeys = ["body", "children", "elseBody"];
    for (const key of childKeys) {
      if (Array.isArray(node[key])) {
        for (const child of node[key]) {
          visit(child);
        }
      }
    }
  }

  for (const node of result.body) {
    visit(node);
  }

  return { program: result, responsiveCSS: mediaQueries.join("\n") };
}

// --- Transform: Import Resolution ------------------------------------------------

export function transformResolveImports(program: Program): { program: Program; imports: ImportDirective[] } {
  const result = deepClone(program) as Program;
  const imports: ImportDirective[] = [];

  for (const dir of result.directives) {
    if (dir.type === "ImportDirective") {
      imports.push(dir as ImportDirective);
    }
  }

  // Also check body for imports
  result.body = result.body.filter((node: any) => {
    if ((node as any).type === "ImportDirective") {
      imports.push(node);
      return false;
    }
    return true;
  });

  return { program: result, imports };
}

// --- Transform: Directive Hoisting -----------------------------------------------

export function transformHoistDirectives(program: Program): Program {
  const result = deepClone(program) as Program;
  const hoisted: any[] = [];

  result.body = result.body.filter((node: any) => {
    if (node.type === "StateDirective" ||
        (node as any).type === "ImportDirective" ||
        (node as any).type === "LoadDirective" ||
        (node as any).type === "RenderDirective" ||
        (node as any).type === "RevalidateDirective" ||
        node.type === "RedirectDirective" ||
        node.type === "RewriteDirective" ||
        node.type === "LayoutDirective") {
      hoisted.push(node);
      return false;
    }
    return true;
  });

  // Move them to directives
  for (const node of hoisted) {
    result.directives.push(node);
  }

  return result;
}

// --- Transform: Slot Resolution --------------------------------------------------

export function transformResolveSlots(program: Program, slotContent: Map<string, ASTNode[]>): Program {
  const result = deepClone(program) as Program;

  function visit(node: any): void {
    if (!node || typeof node !== "object") return;

    if (node.type === "Element" && node.tag === "slot") {
      const slotName = node.attrs?.find((a: any) => a.name === "name")?.value || "default";
      const content = slotContent.get(slotName as string) || slotContent.get("default");
      if (content) {
        node.type = "Fragment";
        node.children = deepClone(content);
      }
    }

    const childKeys = ["body", "children", "elseBody"];
    for (const key of childKeys) {
      if (Array.isArray(node[key])) {
        for (const child of node[key]) {
          visit(child);
        }
      }
    }
  }

  for (const node of result.body) {
    visit(node);
  }

  return result;
}

// --- Transform: Layout Composition -----------------------------------------------

export function transformApplyLayout(program: Program, layoutAST: Program | null): Program {
  if (!layoutAST) return program;

  const result = deepClone(layoutAST) as Program;

  // Find the slot in the layout
  function findAndReplaceSlot(node: any): boolean {
    if (!node || typeof node !== "object") return false;

    if (node.type === "Element" && node.tag === "slot") {
      node.type = "Fragment";
      node.children = deepClone(program.body);
      return true;
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        if (findAndReplaceSlot(child)) return true;
      }
    }

    if (Array.isArray(node.body)) {
      for (const child of node.body) {
        if (findAndReplaceSlot(child)) return true;
      }
    }

    return false;
  }

  for (const node of result.body) {
    if (findAndReplaceSlot(node)) break;
  }

  // Merge directives
  result.directives = [...layoutAST.directives, ...program.directives];

  return result;
}
