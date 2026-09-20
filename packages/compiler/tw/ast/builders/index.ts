/**
 * AST Builder -- fluent API for constructing AST nodes programmatically.
 * Useful for code generation, transforms, and testing.
 */

import type {
  ASTNode, Program, ElementNode, ComponentNode, TextNode, IfNode, ForNode,
  WhileNode, SwitchNode, TryNode, ScriptBlock, StyleBlock, TwmBlock,
  CommentNode, FragmentNode, SlotNode, AttributeNode, StyleDecl,
  EventBinding, PropertyBinding, ElementDirective,
  LiteralExpr, IdentifierExpr, BinaryExpr, ConditionalExpr,
  MemberExpr, CallExpr, ArrayExpr, ObjectExpr, ArrowFnExpr,
} from "../nodes";
import {
  createElement, createText, createComponent, createIf, createFor,
  createProgram, createAttribute, createStyleDecl, createEventBinding,
  createPropertyBinding, createScriptBlock, createStyleBlock,
  createFragment, createSlot,
} from "../nodes";

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

export class ASTBuilder {
  program: Program;

  constructor(filePath: string = "<builder>") {
    this.program = createProgram(filePath);
  }

  // --- Program ------------------------------------------------------------------

  getProgram(): Program {
    return this.program;
  }

  build(): Program {
    return this.program;
  }

  // --- Elements --------------------------------------------------------------

  element(tag: string, line: number = 1, col: number = 1): ElementBuilder {
    const el = createElement(tag, line, col);
    return new ElementBuilder(el, this);
  }

  div(): ElementBuilder { return this.element("div"); }
  span(): ElementBuilder { return this.element("span"); }
  p(): ElementBuilder { return this.element("p"); }
  a(href?: string): ElementBuilder {
    const el = this.element("a");
    if (href) el.attr("href", href);
    return el;
  }
  img(src?: string, alt?: string): ElementBuilder {
    const el = this.element("img");
    if (src) el.attr("src", src);
    if (alt) el.attr("alt", alt);
    return el;
  }
  ul(): ElementBuilder { return this.element("ul"); }
  ol(): ElementBuilder { return this.element("ol"); }
  li(): ElementBuilder { return this.element("li"); }
  button(): ElementBuilder { return this.element("button"); }
  input(): ElementBuilder { return this.element("input"); }
  form(): ElementBuilder { return this.element("form"); }
  label(): ElementBuilder { return this.element("label"); }
  section(): ElementBuilder { return this.element("section"); }
  header(): ElementBuilder { return this.element("header"); }
  footer(): ElementBuilder { return this.element("footer"); }
  nav(): ElementBuilder { return this.element("nav"); }
  main(): ElementBuilder { return this.element("main"); }
  article(): ElementBuilder { return this.element("article"); }
  aside(): ElementBuilder { return this.element("aside"); }
  h1(): ElementBuilder { return this.element("h1"); }
  h2(): ElementBuilder { return this.element("h2"); }
  h3(): ElementBuilder { return this.element("h3"); }
  h4(): ElementBuilder { return this.element("h4"); }
  h5(): ElementBuilder { return this.element("h5"); }
  h6(): ElementBuilder { return this.element("h6"); }

  // --- Components ------------------------------------------------------------

  component(name: string, line: number = 1, col: number = 1): ComponentBuilder {
    const comp = createComponent(name, line, col);
    return new ComponentBuilder(comp, this);
  }

  // --- Control Flow -----------------------------------------------------------

  if(condition: string): IfBuilder {
    const node = createIf(condition, 1, 1);
    this.program.body.push(node);
    return new IfBuilder(node, this);
  }

  for(varName: string, iterable: string): ForBuilder {
    const node = createFor(varName, iterable, 1, 1);
    this.program.body.push(node);
    return new ForBuilder(node, this);
  }

  // --- Text -------------------------------------------------------------------

  text(value: string, interpolated: boolean = false): this {
    this.program.body.push(createText(value, 1, 1, interpolated));
    return this;
  }

  // --- Script / Style --------------------------------------------------------

  script(content: string, isModule: boolean = false): this {
    const block = createScriptBlock(content, 1, 1);
    block.isModule = isModule;
    this.program.body.push(block);
    return this;
  }

  style(content: string, scoped: boolean = false): this {
    const block = createStyleBlock(content, 1, 1);
    block.scoped = scoped;
    this.program.body.push(block);
    return this;
  }

  // --- Fragment ----------------------------------------------------------------

  fragment(): FragmentBuilder {
    const frag = createFragment(1, 1);
    this.program.body.push(frag);
    return new FragmentBuilder(frag, this);
  }

  // --- Slot ---------------------------------------------------------------------

  slot(name: string = "default"): this {
    this.program.body.push(createSlot(name, 1, 1));
    return this;
  }

  // --- Directives --------------------------------------------------------------

  page(key: string, value: any): this {
    this.program.directives.push({
      type: "PageDirective",
      key,
      value,
      line: 1, col: 1,
    } as any);
    return this;
  }

  title(t: string): this {
    return this.page("title", t);
  }

  render(mode: string): this {
    this.program.directives.push({
      type: "RenderDirective",
      mode,
      line: 1, col: 1,
    } as any);
    return this;
  }

  layout(name: string): this {
    this.program.directives.push({
      type: "LayoutDirective",
      name,
      fallback: false,
      line: 1, col: 1,
    } as any);
    return this;
  }

  import(source: string, items: string[]): this {
    this.program.directives.push({
      type: "ImportDirective",
      source,
      items,
      isTypeOnly: false,
      isDynamic: false,
      line: 1, col: 1,
    } as any);
    return this;
  }

  state(declarations: Array<{ name: string; value: string; dataType?: string }>): this {
    this.program.directives.push({
      type: "StateDirective",
      declarations: declarations.map(d => ({
        name: d.name,
        value: d.value,
        dataType: d.dataType ?? "string",
        isComputed: false,
        isReactive: true,
        line: 1, col: 1,
      })),
      scope: "page",
      line: 1, col: 1,
    } as any);
    return this;
  }

  // --- Raw Push --------------------------------------------------------------

  push(node: ASTNode): this {
    this.program.body.push(node);
    return this;
  }

  // --- Validation -------------------------------------------------------------

  validate(): string[] {
    const errors: string[] = [];

    function check(node: ASTNode, path: string): void {
      if (!node.type) {
        errors.push(`${path}: Missing node type`);
        return;
      }
      if (typeof node.line !== "number" || typeof node.col !== "number") {
        errors.push(`${path}: Missing source position`);
      }

      const childKeys = ["body", "children", "elseBody"];
      for (const key of childKeys) {
        const children = (node as any)[key];
        if (Array.isArray(children)) {
          children.forEach((child: ASTNode, i: number) => {
            if (child && typeof child.type === "string") {
              check(child, `${path}.${key}[${i}]`);
            }
          });
        }
      }
    }

    check(this.program, "program");
    return errors;
  }

  isValid(): boolean {
    return this.validate().length === 0;
  }
}

export class ElementBuilder {
  private el: ElementNode;
  private builder: ASTBuilder;

  constructor(el: ElementNode, builder: ASTBuilder) {
    this.el = el;
    this.builder = builder;
  }

  attr(name: string, value: string | boolean = true): this {
    this.el.attrs.push(createAttribute(name, value, this.el.line, this.el.col));
    return this;
  }

  id(value: string): this {
    return this.attr("id", value);
  }

  class(...classes: string[]): this {
    const existing = this.el.attrs.find(a => a.name === "class");
    if (existing && typeof existing.value === "string") {
      existing.value += " " + classes.join(" ");
    } else {
      this.attr("class", classes.join(" "));
    }
    return this;
  }

  style(property: string, value: string): this {
    this.el.styles.push(createStyleDecl(property, value, this.el.line, this.el.col));
    return this;
  }

  on(event: string, handler: string, opts?: Partial<EventBinding>): this {
    const binding = createEventBinding(event, handler, this.el.line, this.el.col);
    if (opts) {
      Object.assign(binding, opts);
    }
    this.el.events.push(binding);
    return this;
  }

  bind(property: string, expression: string, bindingType: "one-way" | "two-way" = "one-way"): this {
    const binding = createPropertyBinding(property, expression, this.el.line, this.el.col);
    binding.bindingType = bindingType;
    this.el.bindings.push(binding);
    return this;
  }

  directive(kind: ElementDirective["kind"], value?: string): this {
    this.el.directives.push({
      type: "ElementDirective",
      kind,
      value,
      line: this.el.line, col: this.el.col,
    });
    return this;
  }

  child(node: ASTNode): this {
    this.el.children.push(node);
    return this;
  }

  text(value: string, interpolated: boolean = false): this {
    this.el.children.push(createText(value, this.el.line, this.el.col, interpolated));
    return this;
  }

  children(...nodes: ASTNode[]): this {
    this.el.children.push(...nodes);
    return this;
  }

  selfClosing(): this {
    this.el.selfClosing = true;
    return this;
  }

  scoped(scopeId?: string): this {
    this.el.isScoped = true;
    this.el.scopeId = scopeId;
    return this;
  }

  get(): ElementNode {
    return this.el;
  }

  end(): ASTBuilder {
    this.builder.program.body.push(this.el);
    return this.builder;
  }
}

export class ComponentBuilder {
  private comp: ComponentNode;
  private builder: ASTBuilder;

  constructor(comp: ComponentNode, builder: ASTBuilder) {
    this.comp = comp;
    this.builder = builder;
  }

  prop(name: string, value: any, interpolated: boolean = false): this {
    this.comp.props.push({
      type: "ComponentProp",
      name,
      value,
      isInterpolated: interpolated,
      isExpression: interpolated,
      line: this.comp.line, col: this.comp.col,
    });
    return this;
  }

  child(node: ASTNode): this {
    this.comp.children.push(node);
    return this;
  }

  text(value: string, interpolated: boolean = false): this {
    this.comp.children.push(createText(value, this.comp.line, this.comp.col, interpolated));
    return this;
  }

  slot(name: string, nodes: ASTNode[]): this {
    this.comp.slots[name] = nodes;
    return this;
  }

  async(): this {
    this.comp.isAsync = true;
    return this;
  }

  get(): ComponentNode {
    return this.comp;
  }

  end(): ASTBuilder {
    this.builder.program.body.push(this.comp);
    return this.builder;
  }
}

export class IfBuilder {
  private node: IfNode;
  private builder: ASTBuilder;

  constructor(node: IfNode, builder: ASTBuilder) {
    this.node = node;
    this.builder = builder;
  }

  then(...nodes: ASTNode[]): this {
    this.node.body.push(...nodes);
    return this;
  }

  text(value: string): this {
    this.node.body.push(createText(value, 1, 1));
    return this;
  }

  else(...nodes: ASTNode[]): this {
    this.node.elseBody.push(...nodes);
    return this;
  }

  elseIf(condition: string): this {
    this.node.elseIfs.push({
      type: "ElseIf",
      condition,
      body: [],
      line: 1, col: 1,
    });
    return this;
  }

  get(): IfNode {
    return this.node;
  }
}

export class ForBuilder {
  private node: ForNode;
  private builder: ASTBuilder;

  constructor(node: ForNode, builder: ASTBuilder) {
    this.node = node;
    this.builder = builder;
  }

  body(...nodes: ASTNode[]): this {
    this.node.body.push(...nodes);
    return this;
  }

  text(value: string): this {
    this.node.body.push(createText(value, 1, 1));
    return this;
  }

  key(expr: string): this {
    this.node.keyExpression = expr;
    return this;
  }

  index(name: string): this {
    this.node.indexName = name;
    return this;
  }

  get(): ForNode {
    return this.node;
  }
}

export class FragmentBuilder {
  private frag: FragmentNode;
  private builder: ASTBuilder;

  constructor(frag: FragmentNode, builder: ASTBuilder) {
    this.frag = frag;
    this.builder = builder;
  }

  child(node: ASTNode): this {
    this.frag.children.push(node);
    return this;
  }

  text(value: string): this {
    this.frag.children.push(createText(value, 1, 1));
    return this;
  }

  children(...nodes: ASTNode[]): this {
    this.frag.children.push(...nodes);
    return this;
  }

  get(): FragmentNode {
    return this.frag;
  }
}

// --- Convenience Functions ------------------------------------------------------

export function builder(filePath?: string): ASTBuilder {
  return new ASTBuilder(filePath);
}

export function mergeElements(...elements: ElementNode[]): FragmentNode {
  return {
    type: "Fragment",
    children: elements,
    line: 1, col: 1,
  };
}
