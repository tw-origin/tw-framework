/**
 * Slot & Layout parser -- slot resolution, layout chaining, template inheritance.
 *
 * In Next.js:
 *   - Layouts are `layout.tsx` files that wrap child pages
 *   - Slots are `@slot` folders for parallel routes
 *
 * In TW Framework:
 *   - Layouts are declared with `@layout 'name'` directive
 *   - Slots are `<slot name="main" />` elements in layout files
 *   - Layouts can chain (layout -> parent layout -> root layout)
 *   - Slots support fallbacks, conditional rendering, and scoped styles
 *
 * Layout chain resolution:
 *   1. Page declares `@layout 'dashboard'`
 *   2. Dashboard layout declares `@layout 'default'`
 *   3. Default layout is the root (no parent)
 *   4. Render order: root -> dashboard -> page
 *   5. Each layout fills its parent's slots
 *
 * Slot types:
 *   <slot name="main" />           -- required slot (error if not filled)
 *   <slot name="sidebar" default>  -- slot with default content
 *   <slot name="footer" optional /> -- optional slot (no error if empty)
 *   <slot name="header" if="showHeader" /> -- conditional slot
 *   <slot name="content" scoped /> -- scoped styles slot
 */

import type { Program, ElementNode, ASTNode } from "../ast/nodes";

// --- Slot Definition -------------------------------------------------

export interface SlotDef {
  name: string;
  /** Is this slot required? (error if not filled) */
  required: boolean;
  /** Default content if slot is not filled */
  defaultContent?: ASTNode[];
  /** Condition for slot to render */
  condition?: string;
  /** Are styles scoped to this slot? */
  scoped: boolean;
  /** Slot position in the layout file */
  position: { line: number; col: number; offset: number };
}

/**
 * Extract all slot definitions from a layout's AST.
 */
export function extractSlots(layout: Program): SlotDef[] {
  const slots: SlotDef[] = [];

  function walk(nodes: ASTNode[]) {
    for (const node of nodes) {
      if (node.type === "Element" && (node as ElementNode).tag === "slot") {
        const el = node as ElementNode;
        const nameAttr = el.attrs.find((a) => a.name === "name");
        const name = nameAttr?.value ?? "default";

        const required = !el.attrs.some((a) => a.name === "optional");
        const hasDefault = el.attrs.some((a) => a.name === "default");
        const scoped = el.attrs.some((a) => a.name === "scoped");
        const condAttr = el.attrs.find((a) => a.name === "if");
        const condition = condAttr?.value;

        slots.push({
          name: name as string,
          required: required as any,
          defaultContent: hasDefault ? el.children : undefined,
          condition: condition as any,
          scoped,
          position: {
            line: el.loc?.start?.line ?? 0,
            col: el.loc?.start?.col ?? 0,
            offset: el.loc?.start?.offset ?? 0,
          },
        });
      }

      // Recurse into children
      if (node.type === "Element") {
        walk((node as ElementNode).children);
      }
    }
  }

  walk(layout.body);
  return slots;
}

// --- Layout Definition ----------------------------------------------

export interface LayoutDef {
  name: string;
  /** File path of the layout */
  file: string;
  /** Parent layout name (for chaining) */
  parent?: string;
  /** Slots defined in this layout */
  slots: SlotDef[];
  /** The layout's AST */
  ast: Program;
  /** Head content from @head directive */
  head?: ASTNode[];
  /** Middleware declared in layout */
  middleware?: string[];
}

/**
 * Parse a layout file and extract its definition.
 */
export function parseLayout(name: string, file: string, ast: Program): LayoutDef {
  // Extract parent layout from @layout directive
  let parent: string | undefined;
  for (const dir of ast.directives) {
    if ((dir as any).kind === "layout" || (dir as any).name === "layout") {
      if ((dir as any).args.length > 0) {
        parent = (dir as any).args[0].value.replace(/['"]/g, "");
      } else if ((dir as any).body) {
        parent = (dir as any).body.trim().replace(/['"]/g, "");
      }
    }
  }

  const slots = extractSlots(ast);

  // Extract @head content
  let head: ASTNode[] | undefined;
  for (const dir of ast.directives) {
    if ((dir as any).name === "head" && (dir as any).body) {
      // head body would be parsed as HTML
      head = [];
    }
  }

  // Extract @middleware
  let middleware: string[] | undefined;
  for (const dir of ast.directives) {
    if ((dir as any).name === "middleware" && (dir as any).body) {
      try {
        middleware = JSON.parse((dir as any).body);
      } catch {
        middleware = (dir as any).body.split(",").map((s) => s.trim().replace(/['"]/g, ""));
      }
    }
  }

  return { name, file, parent, slots, ast, head, middleware };
}

// --- Layout Chain Resolution -----------------------------------------

export interface LayoutChain {
  /** Ordered from root to page */
  layouts: LayoutDef[];
  /** All slots across all layouts */
  allSlots: Map<string, SlotDef>;
}

/**
 * Resolve the full layout chain for a page.
 *
 * Given a page that declares `@layout 'dashboard'`,
 * and dashboard declares `@layout 'default'`,
 * the chain is: [default, dashboard].
 *
 * The root layout is first (wraps everything),
 * the page is last (innermost).
 */
export function resolveLayoutChain(
  pageLayoutName: string | undefined,
  layoutRegistry: Map<string, LayoutDef>
): LayoutChain {
  const chain: LayoutDef[] = [];
  const allSlots = new Map<string, SlotDef>();
  const visited = new Set<string>(); // prevent cycles

  // Start from page's layout and walk up to root
  let currentName = pageLayoutName;

  while (currentName && !visited.has(currentName)) {
    visited.add(currentName);
    const layout = layoutRegistry.get(currentName);
    if (!layout) break;

    // Add slots to the map (child layout slots override parent)
    for (const slot of layout.slots) {
      allSlots.set(slot.name, slot);
    }

    chain.unshift(layout); // root first
    currentName = layout.parent;
  }

  return { layouts: chain, allSlots };
}

// --- Slot Filling ----------------------------------------------------

export interface SlotContent {
  name: string;
  content: ASTNode[];
  /** Source: which component filled this slot */
  source: string;
}

/**
 * Fill layout slots with page content.
 *
 * Page content is mapped to slots by name:
 *   <template #main>...</template>  -> fills slot "main"
 *   <template #sidebar>...</template>  -> fills slot "sidebar"
 *   Remaining content (not in a template) -> fills "default" slot
 */
export function fillSlots(
  layout: LayoutDef,
  pageContent: ASTNode[]
): { filled: Map<string, SlotContent>; unfilled: string[] } {
  const filled = new Map<string, SlotContent>();
  const unfilled: string[] = [];

  // Extract named templates from page content
  const namedContent = new Map<string, ASTNode[]>();
  const defaultContent: ASTNode[] = [];

  for (const node of pageContent) {
    if (node.type === "Element" && (node as ElementNode).tag === "template") {
      const el = node as ElementNode;
      const slotAttr = el.attrs.find((a) => a.name === "#" || a.name === "slot");
      if (slotAttr) {
        const slotName = (slotAttr.value ?? "default") as string;
        namedContent.set(slotName, el.children);
      } else {
        defaultContent.push(...el.children);
      }
    } else {
      defaultContent.push(node);
    }
  }

  // Fill slots
  for (const slot of layout.slots) {
    const content = namedContent.get(slot.name);
    if (content) {
      filled.set(slot.name, { name: slot.name, content, source: "page" });
    } else if (slot.name === "default" || slot.name === "children") {
      filled.set(slot.name, { name: slot.name, content: defaultContent, source: "page" });
    } else if (slot.defaultContent) {
      filled.set(slot.name, { name: slot.name, content: slot.defaultContent, source: "layout-default" });
    } else if (slot.required) {
      unfilled.push(slot.name);
    }
  }

  return { filled, unfilled };
}

/**
 * Render a layout with filled slots to an HTML string.
 */
export function renderLayoutWithSlots(
  layoutAst: Program,
  filled: Map<string, SlotContent>
): string {
  let html = "";

  function renderNode(node: ASTNode): string {
    if (node.type === "Element" && (node as ElementNode).tag === "slot") {
      const el = node as ElementNode;
      const nameAttr = el.attrs.find((a) => a.name === "name");
      const slotName = (nameAttr?.value ?? "default") as string;
      const content = filled.get(slotName);
      if (content) {
        return content.content.map(renderNode).join("");
      }
      // Default content
      return el.children.map(renderNode).join("");
    }

    if (node.type === "Element") {
      const el = node as ElementNode;
      let attrs = el.attrs.map((a) => `${a.name}="${a.value ?? ""}"`).join(" ");
      if (attrs) attrs = " " + attrs;

      if (el.selfClosing) {
        return `<${el.tag}${attrs} />`;
      }

      const children = el.children.map(renderNode).join("");
      return `<${el.tag}${attrs}>${children}</${el.tag}>`;
    }

    if (node.type === "Text") {
      return (node as any).value ?? "";
    }

    return "";
  }

  for (const node of layoutAst.body) {
    html += renderNode(node);
  }

  return html;
}

// --- Layout Registry --------------------------------------------------

export class LayoutRegistry {
  private layouts = new Map<string, LayoutDef>();

  register(name: string, layout: LayoutDef): void {
    this.layouts.set(name, layout);
  }

  get(name: string): LayoutDef | undefined {
    return this.layouts.get(name);
  }

  has(name: string): boolean {
    return this.layouts.has(name);
  }

  /**
   * Auto-discover layouts in a directory.
   * Layout files are named: layout.tw or [name].layout.tw
   */
  discover(dir: string): string[] {
    // In real implementation, would scan the filesystem.
    // Returns names of discovered layouts.
    return Array.from(this.layouts.keys());
  }

  clear(): void {
    this.layouts.clear();
  }
}
