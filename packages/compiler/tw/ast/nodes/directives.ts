/** Directive nodes - Page, Head, Body, Layout, State, Render, etc. */

import { type BaseNode } from "./base";
import type { ASTNode } from "./types";
import type { ScriptBlock } from "./types";
import type { AttributeNode } from "./elements";

export type DirectiveNode =
  | PageDirective
  | HeadDirective
  | BodyDirective
  | SectionDirective
  | LayoutDirective
  | LoadDirective
  | StateDirective
  | RenderDirective
  | RevalidateDirective
  | RedirectDirective
  | RewriteDirective
  | ImportDirective
  | ExportDirective
  | DefineDirective
  | ConfigDirective
  | MiddlewareDirective
  | MetaDirective
  | ServerBlock;

export interface PageDirective extends BaseNode {
  type: "PageDirective";
  key: string;
  value: string | number | boolean | null;
  options?: Record<string, any>;
}

export interface HeadDirective extends BaseNode {
  type: "HeadDirective";
  body: ASTNode[];
  title?: string;
  meta?: MetaTag[];
  links?: LinkTag[];
  scripts?: ScriptBlock[];
}

export interface MetaTag {
  name: string;
  content: string;
  charset?: string;
  httpEquiv?: string;
}

export interface LinkTag {
  rel: string;
  href: string;
  type?: string;
  as?: string;
  crossOrigin?: string;
  media?: string;
  sizes?: string;
  integrity?: string;
}

export interface BodyDirective extends BaseNode {
  type: "BodyDirective";
  body: ASTNode[];
  attrs: AttributeNode[];
  classes: string[];
}

export interface SectionDirective extends BaseNode {
  type: "SectionDirective";
  name: string;
  body: ASTNode[];
  isDefault: boolean;
}

export interface ComponentProp {
  type?: string;
  isInterpolated?: any;
  isExpression?: any;
  name: string;
  value?: unknown;
  line?: number;
  col?: number;
}

export interface LayoutDirective extends BaseNode {
  type: "LayoutDirective";
  name: string;
  props?: ComponentProp[];
  fallback: boolean;
}

export interface LoadDirective extends BaseNode {
  type: "LoadDirective";
  source: string;
  as: string;
  isAsync: boolean;
  isLazy: boolean;
  isTypeOnly: boolean;
}

export interface StateDirective extends BaseNode {
  type: "StateDirective";
  declarations: StateDeclaration[];
  scope: "global" | "page" | "component";
}

export interface StateDeclaration {
  name: string;
  value: string;
  dataType: string;
  /** Signal declaration kind: public/private/serverOnly/derived (undefined = plain state var) */
  signalKind?: "public" | "private" | "serverOnly" | "client" | "derived";
  isComputed: boolean;
  isReactive: boolean;
  watcher?: string;
  line: number;
  col: number;
}

export interface RenderDirective extends BaseNode {
  type: "RenderDirective";
  mode: string;
  options?: Record<string, any>;
  key?: string;
}

export interface RevalidateDirective extends BaseNode {
  type: "RevalidateDirective";
  seconds?: number;
  tag?: string;
  path?: string;
  strategy: string;
}

export interface RedirectDirective extends BaseNode {
  type: "RedirectDirective";
  from: string;
  to: string;
  status: number;
  permanent: boolean;
}

export interface RewriteDirective extends BaseNode {
  type: "RewriteDirective";
  from: string;
  to: string;
  has?: { type: string; key: string; value?: string }[];
}

export interface ImportDirective extends BaseNode {
  type: "ImportDirective";
  source: string;
  items: string[];
  defaultImport?: string;
  namespaceImport?: string;
  isTypeOnly: boolean;
  isDynamic: boolean;
}

export interface ExportDirective extends BaseNode {
  type: "ExportDirective";
  items: string[];
  defaultExport?: string;
  isTypeOnly: boolean;
}

export interface DefineDirective extends BaseNode {
  type: "DefineDirective";
  name: string;
  value: string;
  dataType?: string;
}

export interface ConfigDirective extends BaseNode {
  type: "ConfigDirective";
  key: string;
  value: any;
  scope: string;
}

export interface MiddlewareDirective extends BaseNode {
  type: "MiddlewareDirective";
  path: string;
  matcher?: string;
  priority: number;
}

export interface MetaDirective extends BaseNode {
  type: "MetaDirective";
  key: string;
  value: string;
  property?: string;
}

/** An `import ... from "..."` statement found inside a `server { }` block. */
export interface ImportInfo {
  /** The statement verbatim, as authored. */
  source: string;
  /** The module specifier (the string after `from`). */
  specifier: string;
}

/**
 * A top-level `server { }` block (`server:defer { }` sets `deferred`).
 * The body is raw TypeScript; parsing it into an executable module is a
 * later phase. Imports are hoisted later, so they never enter
 * `declaredNames`.
 */
export interface ServerBlock extends BaseNode {
  type: "ServerBlock";
  /** `server:defer { }` -> true. */
  deferred: boolean;
  /** Raw TypeScript body, exactly as authored between the braces. */
  source: string;
  /** `import ... from "..."` statements found inside the block. */
  imports: ImportInfo[];
  /** Top-level names the block declares (imports and nested scopes excluded). */
  declaredNames: string[];
  /** Char offset of the `server` keyword (for stripping the region). */
  startOffset: number;
  /** Char offset just past the closing `}`. */
  endOffset: number;
}

