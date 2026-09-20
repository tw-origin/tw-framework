import type { ComponentProp } from "./directives";
/** AST union type, type guards, factory functions. */

import { type BaseNode } from "./base";
import type { AttributeNode } from "./elements";
import type { DirectiveNode } from "./directives";
import type { Program } from "./program";
import type { ElementNode } from "./elements";
import type { IfNode } from "./control";
import type { ForNode } from "./control";
import type { WhileNode } from "./control";
import type { SwitchNode } from "./control";
import type { TryNode } from "./control";
import type { ExpressionNode } from "./expressions";
import type { ElementDirective } from "./elements";
import type { PageDirective } from "./directives";
import type { HeadDirective } from "./directives";
import type { BodyDirective } from "./directives";
import type { LayoutDirective } from "./directives";
import type { StateDirective } from "./directives";
import type { RenderDirective } from "./directives";
import type { ImportDirective } from "./directives";
import type { ExportDirective } from "./directives";
import type { LoadDirective } from "./directives";
import type { StyleDecl } from "./elements";
import type { EventBinding } from "./elements";
import type { PropertyBinding } from "./elements";

export interface TextNode extends BaseNode {
  type: "Text";
  value: string;
  isInterpolated: boolean;
  raw: string;
  expressions?: InterpolationExpr[];
}

export interface InterpolationExpr {
  expression: string;
  start: number;
  end: number;
  filters?: string[];
}



export interface ScriptBlock extends BaseNode {
  type: "ScriptBlock";
  content: string;
  lang: string;
  isModule: boolean;
  isAsync: boolean;
  isDeferred: boolean;
  src?: string;
  integrity?: string;
  crossOrigin?: string;
}

export interface StyleBlock extends BaseNode {
  type: "StyleBlock";
  content: string;
  lang: string;
  scoped: boolean;
  media?: string;
  rules?: CSSRule[];
}

export interface CSSRule {
  selector: string;
  properties: Record<string, string>;
  media?: string;
  pseudo?: string;
  important?: boolean;
}

export interface TwmBlock extends BaseNode {
  type: "TwmBlock";
  handler: string;
  method: string;
  content: string;
  raw: string;
  args?: string[];
}

export interface CommentNode extends BaseNode {
  type: "Comment";
  value: string;
  isConditional: boolean;
}

export interface DoctypeNode extends BaseNode {
  type: "Doctype";
  value: string;
}

export interface FragmentNode extends BaseNode {
  type: "Fragment";
  children: ASTNode[];
}

export interface SlotNode extends BaseNode {
  type: "Slot";
  name: string;
  fallback: ASTNode[];
  props: ComponentProp[];
}



export interface ComponentNode extends BaseNode {
  name?: any;
  isAsync?: any;
  isDynamic?: any;
  emitEvents?: any;
  type: "Component";
  tag: string;
  props: ComponentProp[];
  children: ASTNode[];
  slots: Record<string, ASTNode[]>;
}

export type ASTNode =
  | Program
  | ElementNode
  | ComponentNode
  | TextNode
  | IfNode
  | ForNode
  | WhileNode
  | SwitchNode
  | TryNode
  | ScriptBlock
  | StyleBlock
  | TwmBlock
  | CommentNode
  | DoctypeNode
  | FragmentNode
  | SlotNode
  | DirectiveNode
  | ExpressionNode;



export function isElement(node: ASTNode): node is ElementNode {
  if (!node) return false;
  return node.type === "Element";
}

export function isText(node: ASTNode): node is TextNode {
  if (!node) return false;
  return node.type === "Text";
}

export function isComponent(node: ASTNode): node is ComponentNode {
  if (!node) return false;
  return node.type === "Component";
}

export function isIfNode(node: ASTNode): node is IfNode {
  if (!node) return false;
  return node.type === "If";
}

export function isForNode(node: ASTNode): node is ForNode {
  if (!node) return false;
  return node.type === "For";
}

export function isWhileNode(node: ASTNode): node is WhileNode {
  if (!node) return false;
  return node.type === "While";
}

export function isSwitchNode(node: ASTNode): node is SwitchNode {
  if (!node) return false;
  return node.type === "Switch";
}

export function isTryNode(node: ASTNode): node is TryNode {
  if (!node) return false;
  return node.type === "Try";
}

export function isScriptBlock(node: ASTNode): node is ScriptBlock {
  if (!node) return false;
  return node.type === "ScriptBlock";
}

export function isStyleBlock(node: ASTNode): node is StyleBlock {
  if (!node) return false;
  return node.type === "StyleBlock";
}

export function isTwmBlock(node: ASTNode): node is TwmBlock {
  if (!node) return false;
  return node.type === "TwmBlock";
}

export function isComment(node: ASTNode): node is CommentNode {
  if (!node) return false;
  return node.type === "Comment";
}

export function isFragment(node: ASTNode): node is FragmentNode {
  if (!node) return false;
  return node.type === "Fragment";
}

export function isSlot(node: ASTNode): node is SlotNode {
  if (!node) return false;
  return node.type === "Slot";
}

export function isDirective(node: ASTNode): node is DirectiveNode {
  return node.type.endsWith("Directive");
}

export function isElementDirective(node: ASTNode): boolean {
  return (node as any).type === "ElementDirective";
}

export function isExpression(node: ASTNode): node is ExpressionNode {
  const exprTypes = ["Literal", "Identifier", "BinaryExpr", "UnaryExpr", "LogicalExpr",
    "ConditionalExpr", "MemberExpr", "CallExpr", "AssignmentExpr", "ArrayExpr",
    "ObjectExpr", "ArrowFn", "TemplateExpr", "Spread", "Await", "Yield", "NewExpr",
    "SequenceExpr"];
  return exprTypes.includes(node.type);
}

export function isPageDirective(node: ASTNode): node is PageDirective {
  return node.type === "PageDirective";
}

export function isHeadDirective(node: ASTNode): node is HeadDirective {
  return node.type === "HeadDirective";
}

export function isBodyDirective(node: ASTNode): node is BodyDirective {
  return node.type === "BodyDirective";
}

export function isLayoutDirective(node: ASTNode): node is LayoutDirective {
  return node.type === "LayoutDirective";
}

export function isStateDirective(node: ASTNode): node is StateDirective {
  return node.type === "StateDirective";
}

export function isRenderDirective(node: ASTNode): node is RenderDirective {
  return node.type === "RenderDirective";
}

export function isImportDirective(node: ASTNode): node is ImportDirective {
  return node.type === "ImportDirective";
}

export function isExportDirective(node: ASTNode): node is ExportDirective {
  return node.type === "ExportDirective";
}

export function isLoadDirective(node: ASTNode): node is LoadDirective {
  return node.type === "LoadDirective";
}



export function createElement(tag: string, line: number, col: number): ElementNode {
  return {
    type: "Element",
    tag,
    attrs: [],
    styles: [],
    events: [],
    bindings: [],
    directives: [],
    children: [],
    selfClosing: false,
    voidElement: false,
    isScoped: false,
    line,
    col,
  };
}

export function createText(value: string, line: number, col: number, isInterpolated: boolean = false): TextNode {
  return {
    type: "Text",
    value,
    isInterpolated,
    raw: value,
    line,
    col,
  };
}

export function createComponent(name: string, line: number, col: number): ComponentNode {
  return {
    type: "Component",
    name,
    tag: name,
    props: [],
    slots: {},
    children: [],
    isAsync: false,
    isDynamic: false,
    emitEvents: [],
    line,
    col,
  };
}

export function createIf(condition: string, line: number, col: number): IfNode {
  return {
    type: "If",
    condition,
    body: [],
    elseBody: [],
    elseIfs: [],
    isConstant: false,
    line,
    col,
  };
}

export function createFor(varName: string, iterable: string, line: number, col: number): ForNode {
  return {
    type: "For",
    varName,
    iterable,
    body: [],
    line,
    col,
  };
}

export function createProgram(filePath: string): Program {
  return {
    type: "Program",
    body: [],
    directives: [],
    filePath,
    line: 1,
    col: 1,
  };
}

export function createAttribute(name: string, value: string | boolean, line: number, col: number, isInterpolated: boolean = false): AttributeNode {
  return {
    type: "Attribute",
    name,
    value,
    isInterpolated,
    isBoolean: typeof value === "boolean",
    line,
    col,
  };
}

export function createStyleDecl(property: string, value: string, line: number, col: number): StyleDecl {
  return {
    type: "StyleDecl",
    property,
    value,
    important: false,
    isResponsive: false,
    isVariable: property.startsWith("--"),
    line,
    col,
  };
}

export function createEventBinding(event: string, handler: string, line: number, col: number): EventBinding {
  return {
    type: "EventBinding",
    event,
    handler,
    modifiers: [],
    preventDefault: false,
    stopPropagation: false,
    once: false,
    passive: false,
    capture: false,
    self: false,
    line,
    col,
  };
}

export function createPropertyBinding(property: string, expression: string, line: number, col: number): PropertyBinding {
  return {
    type: "PropertyBinding",
    property,
    expression,
    bindingType: "one-way",
    line,
    col,
  };
}

export function createScriptBlock(content: string, line: number, col: number): ScriptBlock {
  return {
    type: "ScriptBlock",
    content,
    lang: "javascript",
    isModule: false,
    isAsync: false,
    isDeferred: false,
    line,
    col,
  };
}

export function createStyleBlock(content: string, line: number, col: number): StyleBlock {
  return {
    type: "StyleBlock",
    content,
    lang: "css",
    scoped: false,
    line,
    col,
  };
}

export function createFragment(line: number, col: number): FragmentNode {
  return {
    type: "Fragment",
    children: [],
    line,
    col,
  };
}

export function createSlot(name: string, line: number, col: number): SlotNode {
  return {
    type: "Slot",
    name,
    fallback: [],
    props: [],
    line,
    col,
  };
}