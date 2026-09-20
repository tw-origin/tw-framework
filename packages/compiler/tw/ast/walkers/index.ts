/**
 * AST Walkers -- query and extract nodes from AST trees.
 * CSS-selector-like queries, XPath-like queries, and specialized collectors.
 */

import type {
  ASTNode, Program, ElementNode, ComponentNode, TextNode, IfNode, ForNode,
  WhileNode, ScriptBlock, StyleBlock, TwmBlock, CommentNode,
  AttributeNode, StyleDecl, EventBinding, PropertyBinding, ElementDirective,
  DirectiveNode, ImportDirective, StateDirective, StateDeclaration,
  LayoutDirective, RenderDirective, HeadDirective, BodyDirective,
} from "../nodes";
import {
  isElement, isText, isComponent, isIfNode, isForNode, isWhileNode,
  isScriptBlock, isStyleBlock, isTwmBlock, isComment, isFragment,
  isSlot, isDirective, isElementDirective,
} from "../nodes";
import { findNodes, forEachNode } from "../visitors";

// --- Basic Finders -----------------------------------------------------------

/** Wrap a function with error handling, logging to console.error. */
function withErrorHandling<T extends (...args: any[]) => any>(fn: T, name: string): T {
  return ((...args: Parameters<T>) => {
    try {
      return fn(...args);
    } catch (e) {
      console.error(`[TW] ${name} error:`, e);
      throw e instanceof Error ? e : new Error(String(e));
    }
  }) as T;
}

export function findElements(program: Program): ElementNode[] {
  return findNodes<ElementNode>(program, isElement);
}

export function findComponents(program: Program): ComponentNode[] {
  return findNodes<ComponentNode>(program, isComponent);
}

export function findTextNodes(program: Program): TextNode[] {
  return findNodes<TextNode>(program, isText);
}

export function findIfNodes(program: Program): IfNode[] {
  return findNodes<IfNode>(program, isIfNode);
}

export function findForNodes(program: Program): ForNode[] {
  return findNodes<ForNode>(program, isForNode);
}

export function findScriptBlocks(program: Program): ScriptBlock[] {
  return findNodes<ScriptBlock>(program, isScriptBlock);
}

export function findStyleBlocks(program: Program): StyleBlock[] {
  return findNodes<StyleBlock>(program, isStyleBlock);
}

export function findTwmBlocks(program: Program): TwmBlock[] {
  return findNodes<TwmBlock>(program, isTwmBlock);
}

export function findComments(program: Program): CommentNode[] {
  return findNodes<CommentNode>(program, isComment);
}

export function findElementsByTag(program: Program, tag: string): ElementNode[] {
  return findNodes<ElementNode>(program, (n): n is ElementNode =>
    isElement(n) && n.tag.toLowerCase() === tag.toLowerCase()
  );
}

export function findElementsByClass(program: Program, className: string): ElementNode[] {
  return findNodes<ElementNode>(program, (n): n is ElementNode =>
    isElement(n) && n.attrs.some(a => a.name === "class" && typeof a.value === "string" && a.value.split(/\s+/).includes(className))
  );
}

export function findElementById(program: Program, id: string): ElementNode | null {
  const results = findNodes<ElementNode>(program, (n): n is ElementNode =>
    isElement(n) && n.attrs.some(a => a.name === "id" && a.value === id)
  );
  return results[0] ?? null;
}

export function findElementsByAttr(program: Program, attrName: string, attrValue?: string): ElementNode[] {
  return findNodes<ElementNode>(program, (n): n is ElementNode =>
    isElement(n) && n.attrs.some(a => {
      if (a.name !== attrName) return false;
      if (attrValue === undefined) return true;
      return a.value === attrValue;
    })
  );
}

// --- Component Queries --------------------------------------------------------

export function findComponentByName(program: Program, name: string): ComponentNode | null {
  const results = findNodes<ComponentNode>(program, (n): n is ComponentNode =>
    isComponent(n) && n.name === name
  );
  return results[0] ?? null;
}

export function findComponentUsage(program: Program, name: string): ComponentNode[] {
  return findNodes<ComponentNode>(program, (n): n is ComponentNode =>
    isComponent(n) && n.name === name
  );
}

export function getAllComponentNames(program: Program): string[] {
  const names = new Set<string>();
  forEachNode(program, (node) => {
    if (isComponent(node)) {
      names.add(node.name);
    }
  });
  return Array.from(names);
}

// --- Directive Collectors -------------------------------------------------------

export function collectDirectives(program: Program): DirectiveNode[] {
  return [...program.directives];
}

export function collectByDirectiveType<T extends DirectiveNode>(program: Program, type: string): T[] {
  return program.directives.filter(d => d.type === type) as T[];
}

export function collectImports(program: Program): ImportDirective[] {
  return collectByDirectiveType<ImportDirective>(program, "ImportDirective");
}

export function collectStateDecls(program: Program): StateDeclaration[] {
  const stateDirectives = collectByDirectiveType<StateDirective>(program, "StateDirective");
  const decls: StateDeclaration[] = [];
  for (const dir of stateDirectives) {
    decls.push(...dir.declarations);
  }
  return decls;
}

export function collectStateVars(program: Program): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const decl of collectStateDecls(program)) {
    vars[decl.name] = decl.value;
  }
  return vars;
}

export function collectLayout(program: Program): LayoutDirective | null {
  const layouts = collectByDirectiveType<LayoutDirective>(program, "LayoutDirective");
  return layouts[0] ?? null;
}

export function collectRenderMode(program: Program): RenderDirective | null {
  const renders = collectByDirectiveType<RenderDirective>(program, "RenderDirective");
  return renders[0] ?? null;
}

export function collectHead(program: Program): HeadDirective | null {
  const heads = collectByDirectiveType<HeadDirective>(program, "HeadDirective");
  return heads[0] ?? null;
}

export function collectBody(program: Program): BodyDirective | null {
  const bodies = collectByDirectiveType<BodyDirective>(program, "BodyDirective");
  return bodies[0] ?? null;
}

// --- Feature Detection ---------------------------------------------------------

export function hasInteractiveFeatures(program: Program): boolean {
  let interactive = false;

  forEachNode(program, (node) => {
    if (interactive) return;
    if (isElement(node)) {
      if (node.events.length > 0) interactive = true;
      if (node.bindings.length > 0) interactive = true;
      if (node.directives.some(d => ["if", "for", "show", "text", "html", "model"].includes(d.kind))) {
        interactive = true;
      }
    }
    if (isComponent(node)) {
      interactive = true;
    }
  });

  if (collectStateDecls(program).length > 0) interactive = true;

  return interactive;
}

export function hasState(program: Program): boolean {
  return collectStateDecls(program).length > 0;
}

export function hasScripts(program: Program): boolean {
  return findScriptBlocks(program).length > 0;
}

export function hasStyles(program: Program): boolean {
  return findStyleBlocks(program).length > 0;
}

export function hasForms(program: Program): boolean {
  return findElementsByTag(program, "form").length > 0;
}

export function hasMedia(program: Program): boolean {
  return findElementsByTag(program, "video").length > 0 ||
         findElementsByTag(program, "audio").length > 0 ||
         findElementsByTag(program, "img").length > 0;
}

export function hasSSRFeatures(program: Program): boolean {
  const render = collectRenderMode(program);
  return render?.mode === "server" || render?.mode === "edge";
}

export function hasStreamingFeatures(program: Program): boolean {
  return findNodes(program, (n): n is TwmBlock => isTwmBlock(n) && n.handler === "stream").length > 0;
}

// --- CSS Selector-Like Query --------------------------------------------------

export interface QueryOptions {
  tag?: string;
  id?: string;
  class?: string;
  attr?: { name: string; value?: string };
  hasChildren?: boolean;
  hasText?: string;
  depth?: number;
}

export function query(program: Program, opts: QueryOptions): ElementNode[] {
  return findNodes<ElementNode>(program, (n): n is ElementNode => {
    if (!isElement(n)) return false;

    if (opts.tag && n.tag.toLowerCase() !== opts.tag.toLowerCase()) return false;

    if (opts.id && !n.attrs.some(a => a.name === "id" && a.value === opts.id)) return false;

    if (opts.class && !n.attrs.some(a =>
      a.name === "class" && typeof a.value === "string" && a.value.split(/\s+/).includes(opts.class!)
    )) return false;

    if (opts.attr) {
      const hasAttr = n.attrs.some(a => {
        if (a.name !== opts.attr!.name) return false;
        if (opts.attr!.value === undefined) return true;
        return a.value === opts.attr!.value;
      });
      if (!hasAttr) return false;
    }

    if (opts.hasChildren !== undefined) {
      if (opts.hasChildren && n.children.length === 0) return false;
      if (!opts.hasChildren && n.children.length > 0) return false;
    }

    if (opts.hasText !== undefined) {
      const textContent = extractText(n);
      if (!textContent.includes(opts.hasText)) return false;
    }

    return true;
  });
}

// --- Text Extraction -----------------------------------------------------------

export function extractText(node: ASTNode): string {
  if (isText(node)) return node.value;
  if (isElement(node) || isComponent(node) || isFragment(node)) {
    return node.children.map(extractText).join("");
  }
  if (isIfNode(node)) {
    return node.body.map(extractText).join("") + node.elseBody.map(extractText).join("");
  }
  if (isForNode(node)) {
    return node.body.map(extractText).join("");
  }
  return "";
}

export function extractAllText(program: Program): string {
  return program.body.map(extractText).join("");
}

// --- Dependency Collection -------------------------------------------------------

export function collectDependencies(program: Program): {
  components: string[];
  imports: ImportDirective[];
  styles: StyleBlock[];
  scripts: ScriptBlock[];
} {
  return {
    components: getAllComponentNames(program),
    imports: collectImports(program),
    styles: findStyleBlocks(program),
    scripts: findScriptBlocks(program),
  };
}

// --- Tree Analysis --------------------------------------------------------------

export interface TreeAnalysis {
  totalNodes: number;
  maxDepth: number;
  elementCount: number;
  componentCount: number;
  textNodeCount: number;
  scriptBlockCount: number;
  styleBlockCount: number;
  ifCount: number;
  forCount: number;
  hasInteractivity: boolean;
  hasState: boolean;
  hasScripts: boolean;
  hasStyles: boolean;
  estimatedSize: number;
}

export function analyzeTree(program: Program): TreeAnalysis {
  let totalNodes = 0;
  let maxDepth = 0;

  forEachNode(program, (node, ctx) => {
    totalNodes++;
    maxDepth = Math.max(maxDepth, ctx.depth);
  });

  return {
    totalNodes,
    maxDepth,
    elementCount: findElements(program).length,
    componentCount: findComponents(program).length,
    textNodeCount: findTextNodes(program).length,
    scriptBlockCount: findScriptBlocks(program).length,
    styleBlockCount: findStyleBlocks(program).length,
    ifCount: findIfNodes(program).length,
    forCount: findForNodes(program).length,
    hasInteractivity: hasInteractiveFeatures(program),
    hasState: hasState(program),
    hasScripts: hasScripts(program),
    hasStyles: hasStyles(program),
    estimatedSize: JSON.stringify(program).length,
  };
}

// --- CSS Analysis ---------------------------------------------------------------

export function collectAllStyles(program: Program): StyleDecl[] {
  const styles: StyleDecl[] = [];
  forEachNode(program, (node) => {
    if (isElement(node)) {
      styles.push(...node.styles);
    }
  });
  return styles;
}

export function collectAllEvents(program: Program): EventBinding[] {
  const events: EventBinding[] = [];
  forEachNode(program, (node) => {
    if (isElement(node)) {
      events.push(...node.events);
    }
  });
  return events;
}

export function collectAllBindings(program: Program): PropertyBinding[] {
  const bindings: PropertyBinding[] = [];
  forEachNode(program, (node) => {
    if (isElement(node)) {
      bindings.push(...node.bindings);
    }
  });
  return bindings;
}

export function collectAllDirectives(program: Program): ElementDirective[] {
  const directives: ElementDirective[] = [];
  forEachNode(program, (node) => {
    if (isElement(node)) {
      directives.push(...node.directives);
    }
  });
  return directives;
}

// --- Circular Dependency Detection --------------------------------------------

export function findCircularComponentRefs(
  program: Program,
  componentRegistry: Map<string, Program>,
): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack: string[] = [];

  function check(name: string): void {
    if (stack.includes(name)) {
      const cycleStart = stack.indexOf(name);
      cycles.push([...stack.slice(cycleStart), name]);
      return;
    }
    if (visited.has(name)) return;
    visited.add(name);

    const compProgram = componentRegistry.get(name);
    if (!compProgram) return;

    stack.push(name);
    for (const child of getAllComponentNames(compProgram)) {
      check(child);
    }
    stack.pop();
  }

  for (const name of getAllComponentNames(program)) {
    check(name);
    stack.length = 0;
  }

  return cycles;
}
export { findNodes } from "../visitors";
