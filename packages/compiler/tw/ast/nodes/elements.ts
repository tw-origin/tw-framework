/** Element, attribute, style, event, binding nodes. */

import { type BaseNode } from "./base";
import type { ASTNode } from "./types";

export interface ElementNode extends BaseNode {
  loc?: any;
  type: "Element";
  tag: string;
  attrs: AttributeNode[];
  styles: StyleDecl[];
  events: EventBinding[];
  bindings: PropertyBinding[];
  directives: ElementDirective[];
  children: ASTNode[];
  selfClosing: boolean;
  voidElement: boolean;
  isScoped: boolean;
  scopeId?: string;
}

export interface AttributeNode extends BaseNode {
  type: "Attribute";
  name: string;
  value: string | boolean;
  isInterpolated: boolean;
  isBoolean: boolean;
  raw?: string;
}

export interface StyleDecl extends BaseNode {
  type: "StyleDecl";
  property: string;
  value: string;
  important: boolean;
  isResponsive: boolean;
  breakpoint?: string;
  isVariable: boolean;
}

export interface EventBinding extends BaseNode {
  type: "EventBinding";
  event: string;
  handler: string;
  args?: string[];
  modifiers: EventModifier[];
  preventDefault: boolean;
  stopPropagation: boolean;
  once: boolean;
  passive: boolean;
  capture: boolean;
  self: boolean;
}

export type EventModifier = "prevent" | "stop" | "once" | "passive" | "capture" | "self" | "exact" | "debounce" | "throttle";

export interface PropertyBinding extends BaseNode {
  expr?: any;
  type: "PropertyBinding";
  property: string;
  expression: string;
  bindingType: "one-way" | "two-way" | "one-time";
  modifier?: "sync" | "model" | "ref";
}

export interface ElementDirective extends BaseNode {
  type: "ElementDirective";
  kind: "if" | "else" | "else-if" | "for" | "show" | "text" | "html" | "model" | "ref" | "bind" | "on" | "slot" | "teleport" | "once";
  value?: string;
  condition?: string;
  varName?: string;
  indexName?: string;
  iterable?: string;
  args?: string;
}

